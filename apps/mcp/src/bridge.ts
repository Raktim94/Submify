import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

export async function runBridge(baseUrl: string, apiKey: string): Promise<void> {
  if (!apiKey.startsWith("smk_")) {
    console.error("submify-mcp: SUBMIFY_API_KEY must be a master API key (starts with smk_)");
    process.exit(1);
  }
  const endpoint = new URL("/api/v1/mcp", baseUrl.replace(/\/+$/, "") + "/");
  const remote = new Client({ name: "submify-mcp-bridge", version: "0.2.0" });
  try {
    await remote.connect(
      new StreamableHTTPClientTransport(endpoint, {
        requestInit: { headers: { Authorization: `Bearer ${apiKey}` } },
      }),
    );
  } catch (e) {
    console.error(`submify-mcp: could not reach ${endpoint.href} (${e instanceof Error ? e.message : String(e)}). Check SUBMIFY_URL and the API key; instances older than 0.5.0 need SUBMIFY_EMAIL/SUBMIFY_PASSWORD instead.`);
    process.exit(1);
  }

  const info = remote.getServerVersion();
  const local = new Server(
    { name: "submify", version: info?.version ?? "unknown" },
    { capabilities: { tools: {} }, instructions: remote.getInstructions() },
  );
  local.setRequestHandler(ListToolsRequestSchema, async (req) => remote.listTools(req.params));
  local.setRequestHandler(CallToolRequestSchema, async (req) => remote.callTool(req.params));
  await local.connect(new StdioServerTransport());
}
