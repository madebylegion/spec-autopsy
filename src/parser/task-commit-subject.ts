import type { TaskCommitSubject } from "./types.js";

// `kiro:` and `task` match ignoring case; the spec name is lowercase kebab-case only.
const SUBJECT_PATTERN =
  /^[Kk][Ii][Rr][Oo]:\s+(?:([a-z0-9]+(?:-[a-z0-9]+)*)\s+)?[Tt][Aa][Ss][Kk]\s+(\d+)\s+(\S.*)$/;

/**
 * Match a task commit subject: `kiro: <spec> task <N> <title>` or
 * `kiro: task <N> <title>`. Returns null for any other string. Never throws.
 */
export function matchTaskCommitSubject(subject: string): TaskCommitSubject | null {
  if (typeof subject !== "string") return null;
  const m = SUBJECT_PATTERN.exec(subject);
  if (m === null) return null;
  const number = Number(m[2]);
  if (!Number.isSafeInteger(number)) return null;
  const title = (m[3] ?? "").trim();
  if (title === "") return null;
  return { spec: m[1] ?? null, number, title };
}
