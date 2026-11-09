import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { linkProject } from "../linker/index.js";
import type { BodyMap, BodyMapCounts, RequirementStatus } from "../linker/index.js";
import { parseProject, printRequirement } from "../parser/index.js";
import { buildReport } from "../report/index.js";

const SUMMARY_DIR = ".autopsy";
const SUMMARY_FILE = "last.json";
const REPORT_FILE = "report.json";

export interface SummaryRequirement {
  id: string;
  status: RequirementStatus;
  file: string;
  line: number;
  text: string;
}

export interface SummaryZombie {
  symbol: string;
  kind: string;
  file: string;
  line: number;
}

/** What is written to `.autopsy/last.json`. No timestamps: same input, same bytes. */
export interface AutopsySummary {
  counts: BodyMapCounts;
  requirements: SummaryRequirement[];
  zombies: SummaryZombie[];
}

function buildSummary(map: BodyMap, texts: Map<string, string>): AutopsySummary {
  return {
    counts: map.counts,
    requirements: map.requirements.map((r) => ({
      id: r.id,
      status: r.status,
      file: r.file,
      line: r.line,
      text: texts.get(r.id) ?? "",
    })),
    zombies: map.zombies.map((z) => ({
      symbol: z.symbol,
      kind: z.kind,
      file: z.file,
      line: z.line,
    })),
  };
}

function isSummary(value: unknown): value is AutopsySummary {
  if (typeof value !== "object" || value === null) return false;
  const requirements = (value as { requirements?: unknown }).requirements;
  return Array.isArray(requirements);
}

/** Reads the previous summary; a missing or unreadable file means "no previous run". */
async function readPrevious(path: string): Promise<AutopsySummary | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    return isSummary(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Requirements that have `status` now and did not have it in the previous run. */
function newWithStatus(
  current: AutopsySummary,
  previous: AutopsySummary | null,
  status: RequirementStatus,
): SummaryRequirement[] {
  const before = new Set<string>();
  if (previous !== null) {
    for (const r of previous.requirements) {
      if (r.status === status) before.add(r.id);
    }
  }
  return current.requirements.filter((r) => r.status === status && !before.has(r.id));
}

function describe(r: SummaryRequirement): string {
  return `  ${r.id}  ${r.file}:${r.line}  ${r.text}`;
}

function section(label: string, none: string, items: SummaryRequirement[]): string[] {
  if (items.length === 0) return [none];
  return [`New ${label} (${items.length}):`, ...items.map(describe)];
}

export interface AutopsyOptions {
  /** Where to write the report; default `<root>/.autopsy/report.json`. A relative path uses the current directory. */
  jsonPath?: string;
  /** Tool version for the report; default is the `version` in this package's package.json. */
  version?: string;
}

/** Reads `version` from the package.json two levels above `src/cli`. */
async function readToolVersion(): Promise<string> {
  const path = fileURLToPath(new URL("../../package.json", import.meta.url));
  const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
  const version = (parsed as { version?: unknown }).version;
  return typeof version === "string" ? version : "0.0.0";
}

/**
 * Runs the autopsy on `root`, writes `.autopsy/last.json` and the report
 * (`.autopsy/report.json`, or `options.jsonPath`), and returns the
 * plain-text report. Deterministic; no network.
 */
export async function runAutopsy(root: string, options: AutopsyOptions = {}): Promise<string> {
  const absRoot = resolve(root);
  const map = await linkProject(absRoot);
  const parsed = await parseProject(absRoot);
  const texts = new Map(parsed.requirements.map((r) => [r.id, printRequirement(r)]));
  const current = buildSummary(map, texts);

  const summaryPath = join(absRoot, SUMMARY_DIR, SUMMARY_FILE);
  const previous = await readPrevious(summaryPath);

  await mkdir(join(absRoot, SUMMARY_DIR), { recursive: true });
  await writeFile(summaryPath, `${JSON.stringify(current, null, 2)}\n`, "utf8");

  const version = options.version ?? (await readToolVersion());
  const report = buildReport(map, texts, { version });
  const reportPath =
    options.jsonPath !== undefined
      ? resolve(options.jsonPath)
      : join(absRoot, SUMMARY_DIR, REPORT_FILE);
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  const c = current.counts;
  const lines: string[] = [
    `Requirements: ${c.requirements}`,
    `ghost: ${c.ghost}`,
    `unproven: ${c.unproven}`,
    `proven: ${c.proven}`,
    `zombies: ${c.zombies}`,
    ...section("ghosts", "No new ghosts.", newWithStatus(current, previous, "ghost")),
    ...section("unproven", "No new unproven.", newWithStatus(current, previous, "unproven")),
  ];
  return `${lines.join("\n")}\n`;
}

/** The first non-flag argument is the root; `--json <path>` sets the report path. */
export function parseArgs(args: readonly string[]): { root: string; jsonPath?: string } {
  let root: string | undefined;
  let jsonPath: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as string;
    if (arg === "--json") {
      const next = args[i + 1];
      if (next === undefined) throw new Error("--json needs a path");
      jsonPath = next;
      i++;
    } else if (!arg.startsWith("--") && root === undefined) {
      root = arg;
    }
  }
  return jsonPath === undefined ? { root: root ?? "." } : { root: root ?? ".", jsonPath };
}

async function main(): Promise<void> {
  const { root, jsonPath } = parseArgs(process.argv.slice(2));
  process.stdout.write(await runAutopsy(root, jsonPath === undefined ? {} : { jsonPath }));
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(resolve(entry)).href) {
  main().catch((error: unknown) => {
    process.stderr.write(`autopsy failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
