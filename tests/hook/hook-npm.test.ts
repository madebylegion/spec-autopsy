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
const TOOLS = ["mkdir", "date", "head", "tr", "cut", "timeout"];
const FAKE_HOME = "/nonexistent-hook-home";
const temps: string[] = [];

afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function temp(): string {
  const dir = mkdtempSync(join(tmpdir(), "hook-npm-"));
  temps.push(dir);
  return dir;
}

function findTool(name: string): string | undefined {
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    const candidate = join(dir, name);
    if (dir !== "" && existsSync(candidate)) return candidate;
  }
  return undefined;
}

function script(path: string, body: string): void {
  writeFileSync(path, `#!/bin/sh\n${body}\n`);
  chmodSync(path, 0o755);
}

/**
 * A temp project with the script and a stub dir (the whole PATH of the child).
 * The stub dir holds the basic tools plus stub `id` and `getent`, so the
 * script's passwd-home and /home/<user> candidates point at nothing real.
 */
function setup(passwdHome = FAKE_HOME): { project: string; home: string; bin: string; root: string } {
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
  for (const tool of TOOLS) {
    const real = findTool(tool);
    if (real !== undefined) symlinkSync(real, join(bin, tool));
  }
  script(join(bin, "id"), 'if [ "$1" = "-un" ]; then echo hookprobe; else echo 4242; fi');
  script(join(bin, "getent"), `echo "hookprobe:x:4242:4242::${passwdHome}:/bin/sh"`);
  return { project, home, bin, root };
}

function stubNode(dir: string, record: string): void {
  mkdirSync(dir, { recursive: true });
  script(join(dir, "node"), `echo "$@" >> "${record}"\nexit 0`);
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
const MISE_NODE = ".local/share/mise/installs/node/9.9.9/bin";

describe("run-autopsy.sh", () => {
  it("finds node under the mise directory of HOME and calls it", async () => {
    const { project, home, bin, root } = setup();
    const record = join(home, "node-argv.txt");
    stubNode(join(home, MISE_NODE), record);
    const shell = join(root, "fake-shell");
    script(shell, "exit 1");

    const { code, log } = await runScript(project, { PATH: bin, HOME: home, SHELL: shell });

    expect(existsSync(record)).toBe(true);
    expect(code).toBe(0);
    expect(log).toContain("fired");
    expect(log).toContain("exit=0");
  });

  it("prefers the node under HOME over one under another home candidate", async () => {
    const other = temp();
    const { project, home, bin, root } = setup(other);
    const homeRecord = join(root, "home-called.txt");
    const otherRecord = join(root, "other-called.txt");
    stubNode(join(home, MISE_NODE), homeRecord);
    stubNode(join(other, MISE_NODE), otherRecord);
    const shell = join(root, "fake-shell");
    script(shell, "exit 1");

    const { code } = await runScript(project, { PATH: bin, HOME: home, SHELL: shell });

    expect(code).toBe(0);
    expect(existsSync(homeRecord)).toBe(true);
    expect(existsSync(otherRecord)).toBe(false);
  });

  it("finds node through the login shell when HOME has none", async () => {
    const { project, home, bin, root } = setup();
    const record = join(root, "login-called.txt");
    const nodeDir = join(root, "elsewhere");
    stubNode(nodeDir, record);
    const shell = join(root, "fake-shell");
    script(shell, `echo "${join(nodeDir, "node")}"`);

    const { code, log } = await runScript(project, { PATH: bin, HOME: home, SHELL: shell });

    expect(code).toBe(0);
    expect(log).toContain("exit=0");
    expect(existsSync(record)).toBe(true);
  });

  it.skipIf(systemNode)("exits 127 and logs `node not found` when node exists nowhere", async () => {
    const { project, home, bin, root } = setup();
    const shell = join(root, "fake-shell");
    script(shell, "exit 0");

    const { code, log } = await runScript(project, { PATH: bin, HOME: home, SHELL: shell });

    expect(code).toBe(127);
    expect(log).toContain("node not found");
    expect(log).toContain("exit=127");
    expect(log).toContain(`HOME=${home}`);
    expect(log).toContain("id=hookprobe");
    expect(log).toContain(`SHELL=${shell}`);
    expect(log).toContain(`${home}=no`);
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
