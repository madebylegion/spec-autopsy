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
const TOOLS = ["dirname", "cut", "timeout"];
const FAKE_HOME = "/nonexistent-launch-home";
const MISE_NODE = ".local/share/mise/installs/node/9.9.9/bin";
const temps: string[] = [];

afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

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

function setup(): { project: string; home: string; bin: string; root: string } {
  const root = mkdtempSync(join(tmpdir(), "mcp-launch-"));
  temps.push(root);
  const project = join(root, "project");
  const home = join(root, "home");
  const bin = join(root, "bin");
  mkdirSync(join(project, "src", "mcp"), { recursive: true });
  mkdirSync(join(project, "node_modules", ".bin"), { recursive: true });
  mkdirSync(home);
  mkdirSync(bin);
  copyFileSync(join(REPO, "src/mcp/launch.sh"), join(project, "src/mcp/launch.sh"));
  writeFileSync(join(project, "node_modules/.bin/tsx"), "");
  for (const tool of TOOLS) {
    const real = findTool(tool);
    if (real !== undefined) symlinkSync(real, join(bin, tool));
  }
  script(join(bin, "id"), 'if [ "$1" = "-un" ]; then echo launchprobe; else echo 4242; fi');
  script(join(bin, "getent"), `echo "launchprobe:x:4242:4242::${FAKE_HOME}:/bin/sh"`);
  return { project, home, bin, root };
}

function run(
  project: string,
  env: Record<string, string>,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((done, fail) => {
    const child = execFile(
      "/bin/sh",
      ["src/mcp/launch.sh"],
      { cwd: project, env },
      (error, stdout, stderr) => {
        const code = error === null ? 0 : typeof error.code === "number" ? error.code : -1;
        done({ code, stdout, stderr });
      },
    );
    child.on("error", fail);
    child.stdin?.end();
  });
}

const systemNode = ["/usr/bin/node", "/bin/node", "/usr/local/bin/node", "/opt/homebrew/bin/node"].some(
  (p) => existsSync(p),
);

describe("src/mcp/launch.sh", () => {
  it.skipIf(systemNode)("finds node under HOME and runs tsx on the server with nothing on stdout", async () => {
    const { project, home, bin, root } = setup();
    const record = join(root, "argv.txt");
    const nodeDir = join(home, MISE_NODE);
    mkdirSync(nodeDir, { recursive: true });
    script(join(nodeDir, "node"), `echo "$@" >> "${record}"\nexit 0`);
    const shell = join(root, "fake-shell");
    script(shell, "exit 1");

    const { code, stdout } = await run(project, {
      PATH: `${bin}:/usr/bin:/bin`,
      HOME: home,
      SHELL: shell,
    });

    expect(code).toBe(0);
    expect(stdout).toBe("");
    const argv = readFileSync(record, "utf8");
    expect(argv).toContain("node_modules/.bin/tsx");
    expect(argv).toContain("src/mcp/server.ts");
  });

  it.skipIf(systemNode)("exits 127 with one stderr line and empty stdout when node is nowhere", async () => {
    const { project, home, bin, root } = setup();
    const shell = join(root, "fake-shell");
    script(shell, "exit 0");

    const { code, stdout, stderr } = await run(project, {
      PATH: `${bin}:/usr/bin:/bin`,
      HOME: home,
      SHELL: shell,
    });

    expect(code).toBe(127);
    expect(stdout).toBe("");
    expect(stderr.trim().split("\n")).toHaveLength(1);
    expect(stderr).toContain("node not found");
  });
});
