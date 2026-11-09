import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseRequirementsText } from "./requirement-parser.js";
import type { Diagnostic, ParseResult } from "./types.js";

const SPECS_DIR = ".kiro/specs";

function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function errorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}

function errorReason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Read every `.kiro/specs/<name>/requirements.md` under `projectRoot` and
 * parse it. Specs are processed in code-unit order of folder name. Never
 * throws: file system problems become `unreadable-file` diagnostics, and a
 * missing `.kiro/specs` folder gives an empty result.
 */
export async function parseProject(projectRoot: string): Promise<ParseResult> {
  const requirements: ParseResult["requirements"] = [];
  const diagnostics: Diagnostic[] = [];

  try {
    const specsPath = join(projectRoot, ".kiro", "specs");
    let names: string[];
    try {
      names = await readdir(specsPath);
    } catch (error) {
      const code = errorCode(error);
      if (code !== "ENOENT" && code !== "ENOTDIR") {
        diagnostics.push({
          code: "unreadable-file",
          message: `Cannot read ${SPECS_DIR}: ${errorReason(error)}`,
          file: SPECS_DIR,
          line: 1,
        });
      }
      return { requirements, diagnostics };
    }

    names.sort(compareCodeUnits);

    for (const specName of names) {
      const file = `${SPECS_DIR}/${specName}/requirements.md`;
      let text: string;
      try {
        text = await readFile(join(specsPath, specName, "requirements.md"), "utf8");
      } catch (error) {
        const code = errorCode(error);
        // No requirements.md in this folder (or the entry is not a folder): not a spec.
        if (code === "ENOENT" || code === "ENOTDIR") continue;
        diagnostics.push({
          code: "unreadable-file",
          message: `Cannot read ${file}: ${errorReason(error)}`,
          file,
          line: 1,
        });
        continue;
      }
      const result = parseRequirementsText(text, { specName, file });
      requirements.push(...result.requirements);
      diagnostics.push(...result.diagnostics);
    }
  } catch (error) {
    diagnostics.push({
      code: "unreadable-file",
      message: `Unexpected error while reading project: ${errorReason(error)}`,
      file: SPECS_DIR,
      line: 1,
    });
  }

  return { requirements, diagnostics };
}
