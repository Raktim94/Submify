/**
 * Copy-paste prompt for AI assistants implementing the Nodedr submit API proxy pattern.
 * Also surfaced in README, /docs, and /projects.
 */
export const NODEDR_CONTACT_PROXY_REUSE_PROMPT = `Prompt you can reuse in chat
Copy and adjust the bracketed parts:

In this repo's Next.js App Router site at [path/to/site-folder], implement contact form submission using the Nodedr submit API proxy pattern (same as SeattleDrainCleaningCo), not FormSubmit in the browser.
Requirements:
1. Add \`src/app/api/submit/route.ts\` that accepts POST JSON, validates with a shared Zod schema (honeypot field e.g. gotcha must be empty), builds the upstream JSON payload, and POSTs to \`https://api.nodedr.com/api/submit\` with \`Content-Type: application/json\`, header \`x-api-key\` set from server env (\`NODEDR_SUBMIT_PUBLIC_KEY\` or \`NODEDR_PUBLIC_KEY\`, value must be \`pk_...\`). If \`NODEDR_SUBMIT_SECRET_KEY\` (\`sk_...\`) is set, add \`x-signature\`: hex HMAC-SHA256 of the exact UTF-8 body string you send upstream.
2. Add \`src/lib/nodedrSubmitEnv.ts\` (or equivalent) that reads those env vars at runtime (no \`NEXT_PUBLIC_\` for secrets).
3. Add \`src/lib/contactSubmitSchema.ts\` shared between client and route; export the inferred type.
4. Wire the contact form(s) to \`fetch("/api/submit", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ ...fields, gotcha }) })\`, show inline success/error, never expose keys to the client.
5. Ensure CSP \`connect-src\` allows \`'self'\` for this fetch if the project uses CSP.
6. Document env vars in \`.env.example\` (public key name only as a placeholder; never commit real \`sk_\`).
Follow \`f:/code/.cursor/rules/15-formsubmit-and-contact-forms.mdc\` (Nodedr submit API section) and match file layout/naming to SeattleDrainCleaningCo unless this site's structure differs—then adapt minimally.
That gives a future session enough context to recreate the pattern without re-explaining it.`;
