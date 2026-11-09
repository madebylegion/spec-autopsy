import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const CHECKED_TASK_LINE = /^- \[x\] (\d+)\.\s+\S/;

/**
 * Read the checked (`[x]`) tasks of every `.kiro/specs/<spec>/tasks.md` under
 * `root` as keys `<spec>#<N>`. Unchecked (`[ ]`) and in-progress (`[-]`) tasks
 * are not listed. Never throws; any file problem contributes nothing.
 */
export async function readCheckedTasks(root: string): Promise<Set<string>> {
  const checked = new Set<string>();
  try {
    const specsPath = join(root, ".kiro", "specs");
    let names: string[];
    try {
      names = await readdir(specsPath);
    } catch {
      return checked;
    }
    for (const name of names) {
      let text: string;
      try {
        text = await readFile(join(specsPath, name, "tasks.md"), "utf8");
      } catch {
        continue;
      }
      for (const line of text.split(/\r?\n/)) {
        const m = CHECKED_TASK_LINE.exec(line);
        if (m === null) continue;
        const number = Number(m[1]);
        if (Number.isSafeInteger(number)) checked.add(`${name}#${number}`);
      }
    }
  } catch {
    return checked;
  }
  return checked;
}
