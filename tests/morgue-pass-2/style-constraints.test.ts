import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Style constraints of morgue-pass-2 (R10.2, R10.4, R10.5, R11.4).
// Reads src/ui files as text. No DOM.

const uiDir = new URL("../../src/ui/", import.meta.url);
const css = readFileSync(new URL("style.css", uiDir), "utf8");
const html = readFileSync(new URL("index.html", uiDir), "utf8");
const viewModel = readFileSync(new URL("view-model.ts", uiDir), "utf8");

function stripBlockComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Strips block and line comments from TypeScript source (a `//` after a colon is kept, so URLs survive). */
function stripCodeComments(text: string): string {
  return stripBlockComments(text).replace(/(^|[^:\\])\/\/.*$/gm, "$1");
}

const code = stripBlockComments(css);

// ---------------------------------------------------------------------------
// R10.2 helpers (copied from style-rules.test.ts)
// ---------------------------------------------------------------------------

const rootMatch = /:root\s*\{([^}]*)\}/.exec(code);
const rootBlock = rootMatch?.[1] ?? "";

function token(name: string): string {
  const match = new RegExp(`--${name}\\s*:\\s*([^;]+);`).exec(rootBlock);
  if (match === null || match[1] === undefined) throw new Error(`token --${name} is missing`);
  return match[1].trim();
}

function channel(value: number): number {
  const s = value / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (m === null || m[1] === undefined) throw new Error(`not a 6-digit hex colour: ${hex}`);
  const n = parseInt(m[1], 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const TOKENS = [
  "slab",
  "slab-raised",
  "slab-line",
  "bone",
  "bone-dim",
  "ghost-ink",
  "zombie-ink",
  "unproven-ink",
  "focus-ring",
  "tag-ink",
  "font-body",
  "font-display",
  "tap",
  "swing",
];

/** [foreground token, background token, minimum ratio]: the existing pairs. */
const PAIRS: readonly (readonly [string, string, number])[] = [
  ["bone", "slab", 4.5],
  ["bone", "slab-raised", 4.5],
  ["bone-dim", "slab", 4.5],
  ["bone-dim", "slab-raised", 4.5],
  ["ghost-ink", "slab", 4.5],
  ["ghost-ink", "slab-raised", 4.5],
  ["zombie-ink", "slab", 4.5],
  ["zombie-ink", "slab-raised", 4.5],
  ["unproven-ink", "slab", 4.5],
  ["unproven-ink", "slab-raised", 4.5],
  ["tag-ink", "tag-paper", 4.5],
  ["tag-ink", "ghost-ink", 4.5],
  ["tag-ink", "zombie-ink", 4.5],
  ["tag-ink", "unproven-ink", 4.5],
  ["tag-ink", "bone", 4.5],
  ["tag-ink", "bone-dim", 4.5],
  ["slab-line", "slab", 3],
  ["slab-line", "slab-raised", 3],
  ["focus-ring", "slab", 3],
  ["focus-ring", "slab-raised", 3],
  ["tag-ink", "tag-paper", 3],
  ["tag-paper-edge", "tag-paper", 3],
];

// ---------------------------------------------------------------------------
// R10.4 helpers
// ---------------------------------------------------------------------------

const FONT_FILE = /\.(woff2?|ttf|otf|eot)(?![\w])/i;

/** Violations of "no new font, no remote request" in a stylesheet and an HTML page. */
function fontViolations(cssText: string, htmlText: string): string[] {
  const out: string[] = [];
  const stripped = stripBlockComments(cssText);
  if (/@font-face/i.test(stripped)) out.push("@font-face");
  for (const m of stripped.matchAll(/url\(\s*([^)]*)\)/gi)) {
    const target = (m[1] ?? "").trim().replace(/^["']|["']$/g, "");
    if (/^(https?:)?\/\//i.test(target)) out.push(`remote css url(${target})`);
    if (FONT_FILE.test(target)) out.push(`font file url(${target})`);
  }
  if (/https?:\/\//i.test(htmlText)) out.push("remote url in html");
  return out;
}

function listFiles(dir: URL): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) out.push(...listFiles(new URL(`${entry.name}/`, dir)));
    else out.push(entry.name);
  }
  return out;
}

// ---------------------------------------------------------------------------
// R10.5 helpers
// ---------------------------------------------------------------------------

/** Violations of the forbidden-constructs list in a stylesheet. */
function cssViolations(cssText: string): string[] {
  const out: string[] = [];
  const stripped = stripBlockComments(cssText);
  if (/gradient\s*\(/i.test(stripped)) out.push("gradient(");
  if (/transition\s*:\s*all\b/i.test(stripped) || /transition-property\s*:\s*all\b/i.test(stripped)) {
    out.push("transition: all");
  }
  if (/outline\s*:\s*(none|0)\s*(;|}|!|$)/i.test(stripped)) {
    const replacement = /:focus-visible[^{}]*\{[^{}]*outline\s*:\s*[^;}]*\bsolid\b/i.test(stripped);
    if (!replacement) out.push("outline removed without a :focus-visible solid outline");
  }
  if (/\p{Extended_Pictographic}/u.test(cssText)) out.push("emoji");
  if (/url\(\s*["']?(https?:)?\/\//i.test(stripped)) out.push("remote url(");
  return out;
}

// ---------------------------------------------------------------------------
// R11.4 helpers
// ---------------------------------------------------------------------------

/** Violations of "the view model is pure" in TypeScript source. */
function purityViolations(source: string): string[] {
  const text = stripCodeComments(source);
  const out: string[] = [];
  if (/(?:\bfrom|\bimport|\brequire\s*\()\s*["']node:/.test(text)) out.push("node: import");
  for (const name of ["document", "window", "localStorage", "HTMLElement", "fetch"]) {
    if (new RegExp(`(?<![\\w$.])${name}(?![\\w$])`).test(text)) out.push(`reference to ${name}`);
  }
  return out;
}

/** Violations of "the view model does not depend on the DOM layer". */
function layerViolations(source: string): string[] {
  const text = stripCodeComments(source);
  const out: string[] = [];
  for (const file of ["render", "main"]) {
    const re = new RegExp(`(?:\\bfrom|\\bimport|\\brequire\\s*\\()\\s*["']\\./${file}(?:\\.js|\\.ts)?["']`);
    if (re.test(text)) out.push(`import from ./${file}.js`);
  }
  return out;
}

describe("morgue-pass-2 style constraints", () => {
  // morgue-pass-2/R10.2
  it("The existing tokens SHALL keep their values and their measured ratios", () => {
    expect(rootMatch).not.toBeNull();
    for (const name of TOKENS) {
      expect(rootBlock, `--${name}`).toMatch(new RegExp(`--${name}\\s*:`));
    }
    for (const [fg, bg, min] of PAIRS) {
      const ratio = contrast(token(fg), token(bg));
      expect(ratio, `--${fg} on --${bg}`).toBeGreaterThanOrEqual(min);
    }
    expect(token("tap")).toBe("44px");
    expect(token("swing")).toBe("200ms");
  });

  // morgue-pass-2/R10.4
  it("The page SHALL use no new font: no @font-face, no font file in src/ui/public/, no remote request", () => {
    expect(fontViolations(css, html)).toEqual([]);
    const files = listFiles(uiDir);
    expect(files.length).toBeGreaterThan(0);
    expect(files.filter((f) => FONT_FILE.test(f))).toEqual([]);
    expect(listFiles(new URL("public/", uiDir)).filter((f) => FONT_FILE.test(f))).toEqual([]);
  });

  // morgue-pass-2/R10.4
  it("no new font: the checker reports @font-face, a font file and a remote request in a bad string", () => {
    expect(fontViolations("@font-face{}", "")).toContain("@font-face");
    expect(fontViolations("a { src: url(x.woff2) }", "")).toHaveLength(1);
    expect(fontViolations("a { src: url(https://x.test/a.css) }", "")).toHaveLength(1);
    expect(fontViolations("", '<link href="https://fonts.example/css">')).toContain("remote url in html");
    expect(fontViolations("a { color: red }", "<p>hi</p>")).toEqual([]);
  });

  // morgue-pass-2/R10.5
  it("The page SHALL NOT use gradient(, transition: all, outline: none without a replacement, an emoji or a remote url(", () => {
    expect(cssViolations(css)).toEqual([]);
  });

  // morgue-pass-2/R10.5
  it("no gradient, transition: all, bare outline: none, emoji or remote url(: the checker reports each in a bad string", () => {
    expect(cssViolations("a { background: linear-gradient(red, blue) }")).toContain("gradient(");
    expect(cssViolations("a { transition: all 200ms }")).toContain("transition: all");
    expect(cssViolations("a { transition-property: all }")).toContain("transition: all");
    expect(cssViolations("a:focus { outline: none }")).toHaveLength(1);
    expect(cssViolations("a { outline: 0 }")).toHaveLength(1);
    expect(cssViolations("a::before { content: '\u{1F47B}' }")).toContain("emoji");
    expect(cssViolations("a { background: url(https://x.test/a.png) }")).toContain("remote url(");
    expect(cssViolations(":focus-visible { outline: 3px solid red } a { outline: none }")).toEqual([]);
  });

  // morgue-pass-2/R11.4
  it("The view model SHALL stay pure (no DOM, no node: import)", () => {
    expect(purityViolations(viewModel)).toEqual([]);
  });

  // morgue-pass-2/R11.4
  it("The view model SHALL stay pure: no import from ./render.js or ./main.js (the DOM layer)", () => {
    expect(layerViolations(viewModel)).toEqual([]);
  });

  // morgue-pass-2/R11.4
  it("the view model stays pure: the checker reports a node: import, a DOM reference and a DOM-layer import in a bad string", () => {
    expect(purityViolations("import fs from 'node:fs'")).toContain("node: import");
    expect(purityViolations('import { x } from "node:path";')).toContain("node: import");
    expect(purityViolations("const a = document.body")).toContain("reference to document");
    expect(purityViolations("const a = window.name")).toContain("reference to window");
    expect(purityViolations("localStorage.getItem('a')")).toContain("reference to localStorage");
    expect(purityViolations("let e: HTMLElement")).toContain("reference to HTMLElement");
    expect(purityViolations("await fetch('/a')")).toContain("reference to fetch");
    expect(purityViolations("// document window\nconst a = 1; /* node:fs fetch */")).toEqual([]);
    expect(layerViolations("import { draw } from './render.js'")).toEqual(["import from ./render.js"]);
    expect(layerViolations('import "./main.js";')).toEqual(["import from ./main.js"]);
    expect(layerViolations("import type { A } from './types.js'")).toEqual([]);
  });
});
