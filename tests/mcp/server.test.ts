import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildReport } from "../../src/report/index.js";
import type { Report } from "../../src/report/index.js";
import { sampleMap, sampleTexts } from "../helpers/report-sample.js";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const TIMEOUT = 30_000;

interface Reply {
  text: string;
  isError: boolean;
}

async function connect(reportPath: string): Promise<Client> {
  const transport = new StdioClientTransport({
    command: join(ROOT, "node_modules", ".bin", "tsx"),
    args: [join(ROOT, "src", "mcp", "server.ts"), reportPath],
    cwd: ROOT,
  });
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await client.connect(transport);
  return client;
}

async function call(client: Client, name: string, args: Record<string, unknown> = {}): Promise<Reply> {
  const result = (await client.callTool({ name, arguments: args })) as {
    content: { type: string; text: string }[];
    isError?: boolean;
  };
  return { text: result.content[0]?.text ?? "", isError: result.isError === true };
}

/** The JSON part of a listing reply (line 2 onward). */
function rows(reply: Reply): { id: string | null; type: string; confidence: string }[] {
  return JSON.parse(reply.text.split("\n").slice(1).join("\n")) as {
    id: string | null;
    type: string;
    confidence: string;
  }[];
}

let dir: string;
let report: Report;
let good: Client;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "autopsy-mcp-"));
  report = buildReport(sampleMap(), sampleTexts(), { version: "1.0.0" });
  await writeFile(join(dir, "report.json"), JSON.stringify(report), "utf8");
  good = await connect(join(dir, "report.json"));
}, TIMEOUT);

afterAll(async () => {
  await good.close();
  await rm(dir, { recursive: true, force: true });
});

describe("mcp report server", () => {
  it("lists the three tools", async () => {
    const { tools } = await good.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["explain", "list_findings", "list_ghosts"]);
  });

  it("list_ghosts returns exactly the ghosts", async () => {
    const reply = await call(good, "list_ghosts");
    expect(reply.isError).toBe(false);
    const expected = report.findings.filter((f) => f.type === "ghost").map((f) => f.requirementId);
    expect(expected.length).toBeGreaterThan(0);
    expect(rows(reply).map((r) => r.id)).toEqual(expected);
    expect(rows(reply).every((r) => r.type === "ghost")).toBe(true);
    expect(reply.text.split("\n")[0]).toContain(String(expected.length));
  });

  it("list_findings filters by type and returns all without a type", async () => {
    const zombies = rows(await call(good, "list_findings", { type: "zombie" }));
    expect(zombies.length).toBe(report.findings.filter((f) => f.type === "zombie").length);
    expect(zombies.every((r) => r.type === "zombie" && r.id === null)).toBe(true);
    const unproven = rows(await call(good, "list_findings", { type: "unproven" }));
    expect(unproven.length).toBe(report.findings.filter((f) => f.type === "unproven").length);
    const all = rows(await call(good, "list_findings"));
    expect(all.length).toBe(report.findings.length);
  });

  it("explain returns evidence for a ghost", async () => {
    const reply = await call(good, "explain", { id: "alpha/R1.1" });
    expect(reply.isError).toBe(false);
    const [item] = JSON.parse(reply.text) as {
      evidence: string[];
      confidence: { score: number; level: string };
      file: string;
      line: number;
    }[];
    const finding = report.findings.find((f) => f.requirementId === "alpha/R1.1");
    expect(item?.evidence).toEqual(finding?.evidence);
    expect(item?.confidence).toEqual(finding?.confidence);
    expect(item?.file).toBe(finding?.file);
    expect(item?.line).toBe(finding?.line);
  });

  it("explain finds a zombie by symbol name", async () => {
    const reply = await call(good, "explain", { id: "helper" });
    expect(reply.isError).toBe(false);
    expect((JSON.parse(reply.text) as { type: string }[])[0]?.type).toBe("zombie");
  });

  it("explain returns the status of a proven requirement", async () => {
    const reply = await call(good, "explain", { id: "beta/R1.4" });
    expect(reply.isError).toBe(false);
    const item = JSON.parse(reply.text) as { status: string; testLinks: unknown[]; codeLinks: unknown[] };
    expect(item.status).toBe("proven");
    expect(item.testLinks.length).toBe(1);
    expect(item.codeLinks.length).toBe(1);
  });

  it("explain gives a tool error for an unknown id", async () => {
    const reply = await call(good, "explain", { id: "nope/R9.9" });
    expect(reply.isError).toBe(true);
    expect(reply.text).toContain("not found");
    expect(reply.text).toContain("nope/R9.9");
    expect((await call(good, "list_ghosts")).isError).toBe(false);
  });

  const bad: [string, string | null][] = [
    ["missing", null],
    ["broken JSON", "{not json"],
    ["invalid", JSON.stringify({ schemaVersion: 1 })],
  ];
  for (const [label, content] of bad) {
    it(`gives a tool error for a ${label} report and keeps running`, async () => {
      const path = join(dir, `${label.replace(/\s/g, "-")}.json`);
      if (content !== null) await writeFile(path, content, "utf8");
      const client = await connect(path);
      try {
        const reply = await call(client, "list_ghosts");
        expect(reply.isError).toBe(true);
        expect(reply.text).toContain(path);
        expect(reply.text).toContain("npm run autopsy");
        expect((await call(client, "explain", { id: "x" })).isError).toBe(true);
      } finally {
        await client.close();
      }
    }, TIMEOUT);
  }
});
