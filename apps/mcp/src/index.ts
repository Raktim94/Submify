#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import { SubmifyClient } from "./client.js";

const base = process.env.SUBMIFY_URL ?? "http://localhost:2512";
const email = process.env.SUBMIFY_EMAIL ?? "";
const password = process.env.SUBMIFY_PASSWORD ?? "";
if (!email || !password) {
  console.error("submify-mcp: set SUBMIFY_EMAIL and SUBMIFY_PASSWORD (and SUBMIFY_URL if not http://localhost:2512)");
  process.exit(1);
}

const api = new SubmifyClient(base, email, password);
const server = new McpServer({ name: "submify", version: "0.1.0" });

const ok = (data: unknown) => ({ content: [{ type: "text" as const, text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }] });
const fail = (e: unknown) => ({ isError: true, content: [{ type: "text" as const, text: e instanceof Error ? e.message : String(e) }] });
const run = (fn: () => Promise<unknown>) => async () => {
  try {
    return ok(await fn());
  } catch (e) {
    return fail(e);
  }
};

// Secrets never go back to the model unless explicitly asked for.
const SECRET_FIELDS = ["api_secret", "smtp_password", "telegram_bot_token", "s3_secret_key", "s3_access_key", "zulivio_api_key", "portal_password"];
function redact<T>(v: T, keep: string[] = []): T {
  if (Array.isArray(v)) return v.map((x) => redact(x, keep)) as T;
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>).map(([k, val]) => [
        k,
        SECRET_FIELDS.includes(k) && !keep.includes(k) && val ? "[redacted]" : redact(val, keep),
      ]),
    ) as T;
  }
  return v;
}

const projectId = z.string().uuid().describe("Project UUID (from submify_list_projects)");
const ro = { readOnlyHint: true, openWorldHint: false };

server.registerTool(
  "submify_health",
  { description: "Check that the Submify instance is reachable and its database is up.", annotations: ro },
  run(() => api.publicJson("/system/health")),
);

server.registerTool(
  "submify_list_projects",
  {
    description: "List all projects in the organization, with their public API keys (pk_live_...), allowed origins and integration status. Secret keys and credentials are redacted.",
    annotations: ro,
  },
  run(async () => redact(await api.json("/projects"))),
);

server.registerTool(
  "submify_create_project",
  {
    description: "Create a new project (a separate form inbox with its own public key and calendar).",
    inputSchema: { name: z.string().min(1) },
  },
  async ({ name }) => {
    try {
      // portal_password is shown exactly once, on creation, so it is the one secret we pass through.
      return ok(redact(await api.json("/projects", { method: "POST", body: JSON.stringify({ name }) }), ["portal_password"]));
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "submify_update_project",
  {
    description:
      "Rename a project and/or change which browser origins may post to it. Only provided fields change. allowed_origins replaces the whole list (empty array = no restriction).",
    inputSchema: {
      project_id: projectId,
      name: z.string().min(1).optional(),
      allowed_origins: z.array(z.string()).optional(),
      email_notifications_enabled: z.boolean().optional(),
      notification_recipients: z.array(z.string().email()).optional(),
    },
  },
  async ({ project_id, ...patch }) => {
    try {
      return ok(redact(await api.json(`/projects/${project_id}`, { method: "PATCH", body: JSON.stringify(patch) })));
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "submify_regenerate_project_keys",
  {
    description: "Issue a new public/secret key pair for a project. The old keys stop working IMMEDIATELY, breaking any site still using them. Returns the new public key.",
    inputSchema: { project_id: projectId },
    annotations: { destructiveHint: true },
  },
  async ({ project_id }) => {
    try {
      const r = (await api.json(`/projects/${project_id}`, { method: "PATCH", body: JSON.stringify({ regenerate_key: true }) })) as { project?: { api_key?: string } };
      return ok({ status: "rotated", public_key: r.project?.api_key });
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "submify_delete_project",
  {
    description: "Permanently delete a project and ALL its submissions. Irreversible. The default project cannot be deleted.",
    inputSchema: { project_id: projectId },
    annotations: { destructiveHint: true },
  },
  async ({ project_id }) => {
    try {
      return ok(await api.json(`/projects/${project_id}`, { method: "DELETE" }));
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "submify_list_submissions",
  {
    description: "List form submissions for a project, newest first.",
    inputSchema: {
      project_id: projectId,
      limit: z.number().int().min(1).max(500).default(50),
      offset: z.number().int().min(0).default(0),
    },
    annotations: ro,
  },
  async ({ project_id, limit, offset }) => {
    try {
      return ok(await api.json(`/projects/${project_id}/submissions?limit=${limit}&offset=${offset}`));
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "submify_delete_submissions",
  {
    description: "Permanently delete specific submissions from a project by id.",
    inputSchema: { project_id: projectId, submission_ids: z.array(z.string().uuid()).min(1) },
    annotations: { destructiveHint: true },
  },
  async ({ project_id, submission_ids }) => {
    try {
      return ok(await api.json(`/projects/${project_id}/submissions/bulk`, { method: "DELETE", body: JSON.stringify({ submission_ids }) }));
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "submify_export_submissions",
  {
    description: "Export a project's submissions (first 5,000) to an XLSX or PDF file on the local disk and return the path.",
    inputSchema: {
      project_id: projectId,
      format: z.enum(["xlsx", "pdf"]).default("xlsx"),
      output_path: z.string().optional().describe("Where to save; defaults to ./submify-<project>.<format>"),
    },
    annotations: { openWorldHint: false },
  },
  async ({ project_id, format, output_path }) => {
    try {
      const res = await api.authed(`/projects/${project_id}/export?format=${format}`);
      if (!res.ok) return fail(`Submify API ${res.status}: ${await res.text()}`);
      const path = resolve(output_path ?? `submify-${project_id}.${format}`);
      await mkdir(dirname(path), { recursive: true });
      const buf = Buffer.from(await res.arrayBuffer());
      await writeFile(path, buf);
      return ok({ saved_to: path, bytes: buf.length });
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "submify_submit_form",
  {
    description: "Post a test submission to a project through the public /api/submit endpoint (as a website form would). Creates a real submission.",
    inputSchema: {
      public_key: z.string().describe("Project public key (pk_live_...) or the account's primary api_key"),
      data: z.record(z.unknown()).describe("Form fields as a JSON object"),
    },
  },
  async ({ public_key, data }) => {
    try {
      return ok(await api.submit(public_key, { data, files: [] }));
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "submify_list_event_types",
  { description: "List a project's bookable event types (calendar services).", inputSchema: { project_id: projectId }, annotations: ro },
  async ({ project_id }) => {
    try {
      return ok(await api.json(`/event-types?project_id=${project_id}`));
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "submify_list_bookings",
  {
    description: "List a project's calendar bookings in a date range (RFC3339; default now to +30 days).",
    inputSchema: { project_id: projectId, from: z.string().optional(), to: z.string().optional() },
    annotations: ro,
  },
  async ({ project_id, from, to }) => {
    try {
      const q = new URLSearchParams({ project_id });
      if (from) q.set("from", from);
      if (to) q.set("to", to);
      return ok(await api.json(`/bookings?${q}`));
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "submify_cancel_booking",
  {
    description: "Cancel a booking on behalf of the organization.",
    inputSchema: { booking_id: z.string().uuid() },
    annotations: { destructiveHint: true },
  },
  async ({ booking_id }) => {
    try {
      return ok(await api.json(`/bookings/${booking_id}/cancel`, { method: "POST" }));
    } catch (e) {
      return fail(e);
    }
  },
);

await server.connect(new StdioServerTransport());
