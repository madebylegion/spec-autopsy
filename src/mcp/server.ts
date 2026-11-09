import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import type { Finding, FindingType, Report } from "../report/types.js";
import { validateReport } from "../report/validate-report.js";

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

const reportPath = resolve(process.argv[2] ?? process.env["AUTOPSY_REPORT"] ?? ".autopsy/report.json");

function text(value: string): ToolResult {
  return { content: [{ type: "text", text: value }] };
}

function fail(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

/** Reads and validates the report at call time; the error text says what to do. */
async function load(): Promise<{ report: Report } | { error: ToolResult }> {
  const hint = "Create it with `npm run autopsy`.";
  let raw: string;
  try {
    raw = await readFile(reportPath, "utf8");
  } catch {
    return { error: fail(`Cannot read the report at ${reportPath}. ${hint}`) };
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { error: fail(`The report at ${reportPath} is not valid JSON. ${hint}`) };
  }
  const result = validateReport(data);
  if (!result.ok) {
    const errors = result.errors.slice(0, 3).join("; ");
    return { error: fail(`The report at ${reportPath} is invalid: ${errors}. ${hint}`) };
  }
  return { report: result.report };
}

function row(f: Finding) {
  return {
    type: f.type,
    id: f.requirementId,
    title: f.title,
    file: f.file,
    line: f.line,
    confidence: f.confidence.level,
  };
}

function listing(report: Report, type: FindingType | undefined): ToolResult {
  const rows = report.findings.filter((f) => type === undefined || f.type === type).map(row);
  return text(`${rows.length} ${type ?? "total"} finding(s)\n${JSON.stringify(rows)}`);
}

function explain(report: Report, id: string): ToolResult {
  const found = report.findings.filter(
    (f) => f.requirementId === id || (f.type === "zombie" && f.title === id),
  );
  if (found.length > 0) {
    const out = found.map((f) => ({
      id,
      type: f.type,
      file: f.file,
      line: f.line,
      confidence: f.confidence,
      evidence: f.evidence,
    }));
    return text(JSON.stringify(out));
  }
  for (const spec of report.specs) {
    const req = spec.requirements.find((r) => r.id === id);
    if (req === undefined) continue;
    const { status, file, line, codeLinks, testLinks } = req;
    return text(JSON.stringify({ id, status, file, line, codeLinks, testLinks }));
  }
  return fail(`Requirement or symbol not found: ${id}`);
}

async function withReport(run: (report: Report) => ToolResult): Promise<ToolResult> {
  const loaded = await load();
  return "error" in loaded ? loaded.error : run(loaded.report);
}

const server = new McpServer({ name: "spec-autopsy", version: "0.1.0" });

server.registerTool(
  "list_ghosts",
  { description: "List the ghosts: requirements that were never built." },
  () => withReport((report) => listing(report, "ghost")),
);

server.registerTool(
  "list_findings",
  {
    description: "List findings, optionally of one type: ghost, zombie or unproven.",
    inputSchema: { type: z.enum(["ghost", "zombie", "unproven"]).optional() },
  },
  ({ type }) => withReport((report) => listing(report, type)),
);

server.registerTool(
  "explain",
  {
    description: "Explain a finding or a requirement by requirement id or zombie symbol name.",
    inputSchema: { id: z.string() },
  },
  ({ id }) => withReport((report) => explain(report, id)),
);

await server.connect(new StdioServerTransport());
console.error(`spec-autopsy MCP server ready, report: ${reportPath}`);
