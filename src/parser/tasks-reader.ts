import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { TaskEntry, TaskRequirementRef } from "./types.js";

const TASK_LINE = /^- \[[ x-]\] (\d+)\.\s+(\S.*)$/;
const REQUIREMENTS_LINE = /^\s*(?:[-*]\s+)?_Requirements:\s*(.*?)\s*_\s*$/;
const BARE_ID = /^\d+\.\d+$/;

export interface TasksOptions {
  specName: string;
  file: string;
}

/**
 * Read the tasks of one tasks.md text. A task runs from its task line up to
 * the next non-blank line that starts in the first column. Never throws.
 */
export function parseTasksText(text: string, options: TasksOptions): TaskEntry[] {
  const entries: TaskEntry[] = [];
  try {
    const lines = String(text).split(/\r?\n/);
    let current: TaskEntry | null = null;
    let seen = new Set<string>();

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i] ?? "";
      const lineNo = i + 1;

      const task = TASK_LINE.exec(raw);
      if (task !== null) {
        const number = Number(task[1]);
        const title = (task[2] ?? "").trim();
        if (Number.isSafeInteger(number) && title !== "") {
          current = {
            spec: options.specName,
            number,
            title,
            file: options.file,
            line: lineNo,
            requirements: [],
          };
          seen = new Set<string>();
          entries.push(current);
          continue;
        }
      }

      if (raw.trim() !== "" && !/^\s/.test(raw)) {
        current = null; // first-column non-blank line ends the task
        continue;
      }
      if (current === null) continue;

      const req = REQUIREMENTS_LINE.exec(raw);
      if (req === null) continue;
      const tokens = (req[1] ?? "").split(/[,\s]+/).filter((t) => t !== "");
      for (const token of tokens) {
        const id = BARE_ID.test(token) ? `${options.specName}/R${token}` : token;
        if (seen.has(id)) continue;
        seen.add(id);
        const ref: TaskRequirementRef = { id, line: lineNo };
        current.requirements.push(ref);
      }
    }
  } catch {
    return [];
  }
  return entries;
}

function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Read every `.kiro/specs/<spec>/tasks.md` under `root`, by spec name in
 * code-unit order. Never throws; unreadable files and a missing specs folder
 * give no tasks.
 */
export async function parseTasksProject(root: string): Promise<TaskEntry[]> {
  const entries: TaskEntry[] = [];
  try {
    const specsPath = join(root, ".kiro", "specs");
    let names: string[];
    try {
      names = await readdir(specsPath);
    } catch {
      return [];
    }
    names.sort(compareCodeUnits);
    for (const specName of names) {
      let text: string;
      try {
        text = await readFile(join(specsPath, specName, "tasks.md"), "utf8");
      } catch {
        continue;
      }
      const file = `.kiro/specs/${specName}/tasks.md`;
      entries.push(...parseTasksText(text, { specName, file }));
    }
  } catch {
    return entries;
  }
  return entries;
}
