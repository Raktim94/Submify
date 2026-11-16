#!/usr/bin/env node
// Submify MCP (stdio).
//
// With SUBMIFY_API_KEY set (a master API key, smk_...), this process is a
// thin stdio <-> HTTP bridge to the instance's built-in remote MCP endpoint
// (/api/v1/mcp), so the tool list always matches the server version.
// Without it, it falls back to the legacy email/password mode.
const apiKey = process.env.SUBMIFY_API_KEY?.trim() ?? "";
if (apiKey) {
  const { runBridge } = await import("./bridge.js");
  await runBridge(process.env.SUBMIFY_URL ?? "http://localhost:2512", apiKey);
} else {
  await import("./password-mode.js");
}
