import { execFile } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const REPO = resolve(import.meta.dirname, "../..");
const TOOLS = ["mkdir", "date", "head", "tr"];
const temps: string[] = [];

afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function temp(): string {
  const dir = mkdtempSync(join(tmpdir(), "hook-npm-"));
  temps.push(dir);
  return dir;
}

function findTool(name: string): string {
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    const candidate = join(dir, name);
    if (dir !== "" && existsSync(candidate)) return candidate;
  }
  throw new Error(`tool not found: ${name}`);
}

/** A temp project with the script, a bin dir with only the basic tools, and an empty HOME. */
function setup(): { project: string; home: string; bin: string } {
  const root = temp();
  const project = join(root, "project");
  const home = join(root, "home");
  const bin = join(root, "bin");
  mkdirSync(join(project, ".kiro", "hooks"), { recursive: true });
  mkdirSync(home);
  mkdirSync(bin);
  writeFileSync(join(project, "package.json"), '{"name":"fixture","private":true}\n');
  copyFileSync(
    join(REPO, ".kiro/hooks/run-autopsy.sh"),
    join(project, ".kiro/hooks/run-autopsy.sh"),
  );
  for (const tool of TOOLS) symlinkSync(findTool(tool), join(bin, tool));
  return { project, home, bin };
}

function runScript(
  project: string,
  env: Record<string, string>,
): Promise<{ code: number; log: string }> {
  return new Promise((done, fail) => {
    const child = execFile(
      "/bin/sh",
      [".kiro/hooks/run-autopsy.sh"],
      { cwd: project, env },
      (error) => {
        const code = error === null ? 0 : typeof error.code === "number" ? error.code : -1;
        const logPath = join(project, ".autopsy", "hook.log");
        done({ code, log: existsSync(logPath) ? readFileSync(logPath, "utf8") : "" });
      },
    );
    child.on("error", fail);
    child.stdin?.end('{"hook":"test"}\nline2');
  });
}

const systemNode = ["/usr/local/bin/node", "/opt/homebrew/bin/node"].some((p) => existsSync(p));

describe("run-autopsy.sh", () => {
  it("finds node under the mise directory of HOME and calls it", async () => {
    const { project, home, bin } = setup();
    const nodeDir = join(home, ".local/share/mise/installs/node/9.9.9/bin");
    mkdirSync(nodeDir, { recursive: true });
    const record = join(home, "node-argv.txt");
    const stub = join(nodeDir, "node");
    writeFileSync(stub, `#!/bin/sh\necho "$@" >> "${record}"\nexit 0\n`);
    chmodSync(stub, 0o755);

    const { code, log } = await runScript(project, { PATH: bin, HOME: home });

    expect(existsSync(record)).toBe(true);
    expect(code).toBe(0);
    expect(log).toContain("fired");
    expect(log).toContain("exit=0");
  });

  it.skipIf(systemNode)("exits 127 and logs `node not found` when node exists nowhere", async () => {
    const { project, home, bin } = setup();

    const { code, log } = await runScript(project, { PATH: bin, HOME: home });

    expect(code).toBe(127);
    expect(log).toContain("node not found");
    expect(log).toContain("exit=127");
  });

  it("keeps the hook JSON trigger, matcher and command", () => {
    const hook = JSON.parse(
      readFileSync(join(REPO, ".kiro/hooks/autopsy-on-spec-save.json"), "utf8"),
    ) as {
      hooks: { trigger: string; matcher: string; action: { command: string } }[];
    };
    const entry = hook.hooks[0];
    expect(entry?.trigger).toBe("PostFileSave");
    expect(entry?.matcher).toBe("\\.kiro/specs/[^/]+/requirements\\.md$");
    expect(entry?.action.command).toBe("sh .kiro/hooks/run-autopsy.sh");
  });
});
