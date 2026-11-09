import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Reads src/ui/style.css as text. No DOM.
const css = readFileSync(new URL("../../src/ui/style.css", import.meta.url), "utf8");

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "");
}

const code = stripComments(css);

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
  const r = channel((n >> 16) & 255);
  const g = channel((n >> 8) & 255);
  const b = channel(n & 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
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

/** [foreground token, background token, minimum ratio]: 4.5 for text, 3 for edges and large marks. */
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

describe("style.css rules", () => {
  it("starts with the token block", () => {
    expect(rootMatch).not.toBeNull();
    expect(code.trim().startsWith(":root")).toBe(true);
    for (const name of TOKENS) {
      expect(rootBlock, `--${name}`).toMatch(new RegExp(`--${name}\\s*:`));
    }
  });

  it("sets the tap size to 44px and the swing to 200ms", () => {
    expect(token("tap")).toBe("44px");
    expect(token("swing")).toBe("200ms");
  });

  it("uses colour literals only inside the token block", () => {
    const below = code.replace(/:root\s*\{[^}]*\}/, "");
    expect(below).not.toMatch(/(?<![\w-])#[0-9a-fA-F]{3,8}\b/);
    expect(below).not.toMatch(/\b(rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch)\s*\(/i);
  });

  it("does not use transition: all", () => {
    expect(code).not.toMatch(/transition\s*:\s*all\b/);
    expect(code).not.toMatch(/transition-property\s*:\s*all\b/);
  });

  it("has a :focus-visible rule and no outline: none without one", () => {
    expect(code).toMatch(/:focus-visible\s*\{[^}]*outline\s*:\s*[^;]*\bsolid\b/);
    if (/outline\s*:\s*(none|0)\b/.test(code)) {
      expect(code).toContain(":focus-visible");
    }
  });

  it("has a prefers-reduced-motion block that removes animation and transition", () => {
    expect(code).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[^@]*animation\s*:\s*none/);
    expect(code).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[^@]*transition\s*:\s*none/);
  });

  it("swings a tag with transform only", () => {
    const blocks = [...code.matchAll(/@keyframes\s+[\w-]+\s*\{((?:[^{}]*\{[^{}]*\})*)\s*\}/g)];
    expect(blocks.length).toBeGreaterThan(0);
    for (const block of blocks) {
      const names = [...(block[1] ?? "").matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]);
      expect(names.length).toBeGreaterThan(0);
      for (const name of names) expect(["transform", "transform-origin"]).toContain(name);
    }
  });

  it("has no import, remote url, web font, gradient, text shadow or emoji", () => {
    expect(code).not.toMatch(/@import/);
    expect(code).not.toMatch(/url\(\s*["']?(https?:)?\/\//i);
    expect(code).not.toMatch(/@font-face/);
    expect(code).not.toMatch(/gradient\s*\(/i);
    expect(code).not.toMatch(/text-shadow/);
    expect(css).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it("has a condensed display stack for numbers and tags", () => {
    expect(token("font-display")).toMatch(/Narrow|Condensed/);
  });

  it("meets the contrast ratios of the token pairs", () => {
    for (const [fg, bg, min] of PAIRS) {
      const ratio = contrast(token(fg), token(bg));
      expect(ratio, `--${fg} on --${bg}`).toBeGreaterThanOrEqual(min);
    }
  });

  it("contrast function is right on known values", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrast("#777777", "#ffffff")).toBeGreaterThan(4.4);
    expect(contrast("#777777", "#ffffff")).toBeLessThan(4.6);
  });
});
