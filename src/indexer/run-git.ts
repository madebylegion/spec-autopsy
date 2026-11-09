import { execFile } from "node:child_process";

const MAX_BUFFER = 64 * 1024 * 1024;

/** Runs git without a shell; resolves to stdout, or undefined on any failure. */
export function runGit(root: string, args: string[]): Promise<string | undefined> {
  return new Promise((resolve) => {
    try {
      execFile(
        "git",
        args,
        { cwd: root, maxBuffer: MAX_BUFFER, encoding: "utf8", windowsHide: true },
        (error, stdout) => {
          resolve(error ? undefined : stdout);
        },
      );
    } catch {
      resolve(undefined);
    }
  });
}
