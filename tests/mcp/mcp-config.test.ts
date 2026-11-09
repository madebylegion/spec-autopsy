import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

interface ServerEntry {
  command?: unknown;
  args?: unknown;
  env?: Record<string, unknown>;
  autoApprove?: unknown;
}

function loadServer(): ServerEntry {
  const raw = readFileSync(join(root, ".kiro", "settings", "mcp.json"), "utf8");
  const parsed = JSON.parse(raw) as { mcpServers?: Record<string, ServerEntry> };
  const server = parsed.mcpServers?.["spec-autopsy"];
  if (server === undefined) throw new Error("spec-autopsy server missing");
  return server;
}

describe(".kiro/settings/mcp.json", () => {
  it("registers the spec-autopsy server through the launch script", () => {
    const server = loadServer();
    expect(server.command).toBe("sh");
    expect(server.args).toEqual(["src/mcp/launch.sh"]);
  });

  it("auto-approves exactly the three read-only tools", () => {
    expect(loadServer().autoApprove).toEqual(["list_ghosts", "list_findings", "explain"]);
  });

  it("holds no value in any env key", () => {
    const env = loadServer().env;
    if (env === undefined) return;
    for (const value of Object.values(env)) {
      expect(value === "" || value === null || value === undefined).toBe(true);
    }
  });
});
