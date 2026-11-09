import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Read every `.kiro/specs/<spec>/design.md` under `root` into a map from spec
 * folder name to text (in code-unit order of name). A spec without a readable
 * design.md is left out. Never throws; a missing specs folder gives an empty map.
 */
export async function readDesignTexts(root: string): Promise<Map<string, string>> {
  const texts = new Map<string, string>();
  try {
    const specsPath = join(root, ".kiro", "specs");
    let names: string[];
    try {
      names = await readdir(specsPath);
    } catch {
      return texts;
    }
    names.sort(compareCodeUnits);
    for (const name of names) {
      try {
        texts.set(name, await readFile(join(specsPath, name, "design.md"), "utf8"));
      } catch {
        continue;
      }
    }
  } catch {
    return texts;
  }
  return texts;
}
