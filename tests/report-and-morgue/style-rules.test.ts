import { readFileSync, readdirSync } from "node:fs";
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

// ---------------------------------------------------------------------------
// morgue-pass-2, task 4: rules for the tag layout, stamp, steel panel and links.
// ---------------------------------------------------------------------------

const NEW_TOKENS = [
  "steel",
  "steel-line",
  "steel-light",
  "steel-shadow",
  "ghost-stamp",
  "zombie-stamp",
  "unproven-stamp",
];

/** Every `selectors { body }` block of the stylesheet (no nested braces), selector list split on commas. */
function ruleBlocks(): { selectors: string[]; body: string }[] {
  const out: { selectors: string[]; body: string }[] = [];
  for (const m of code.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = (m[1] ?? "").split(",").map((s) => s.trim());
    out.push({ selectors, body: m[2] ?? "" });
  }
  return out;
}

function bodiesFor(selector: string): string[] {
  return ruleBlocks()
    .filter((r) => r.selectors.includes(selector))
    .map((r) => r.body);
}

function declarations(name: string): string[] {
  return [...code.matchAll(new RegExp(`(?<![\\w-])${name}\\s*:\\s*([^;}]+)`, "g"))].map((m) => (m[1] ?? "").trim());
}

const STAMP_PAIRS: readonly (readonly [string, string, number])[] = [
  ["ghost-stamp", "tag-paper", 4.5],
  ["zombie-stamp", "tag-paper", 4.5],
  ["unproven-stamp", "tag-paper", 4.5],
  ["bone", "steel", 4.5],
  ["bone-dim", "steel", 4.5],
  ["ghost-ink", "steel", 4.5],
  ["zombie-ink", "steel", 4.5],
  ["unproven-ink", "steel", 4.5],
  ["slab-line", "steel", 3],
];

const PINNED = {
  dependencies: {
    "@modelcontextprotocol/sdk": "1.20.0",
    "tree-sitter-wasms": "0.1.13",
    "web-tree-sitter": "0.25.10",
    zod: "3.25.76",
  },
  devDependencies: {
    "@types/node": "22.10.2",
    "fast-check": "3.23.2",
    tsx: "4.20.6",
    typescript: "5.7.2",
    vite: "5.4.21",
    vitest: "2.1.8",
  },
};

describe("style.css rules, morgue pass 2", () => {
  it("defines the seven new tokens", () => {
    for (const name of NEW_TOKENS) {
      expect(rootBlock, `--${name}`).toMatch(new RegExp(`--${name}\\s*:`));
    }
  });

  it("meets the contrast ratios of the stamp and steel pairs", () => {
    for (const [fg, bg, min] of STAMP_PAIRS) {
      const ratio = contrast(token(fg), token(bg));
      expect(ratio, `--${fg} on --${bg}`).toBeGreaterThanOrEqual(min);
    }
  });

  it("still forbids gradient functions", () => {
    expect(code).not.toMatch(/gradient\s*\(/i);
  });

  it("styles the tag stamp as a tilted 14px+ double frame without blur or text shadow", () => {
    const main = bodiesFor(".tag .tag-type");
    const frame = bodiesFor(".tag .tag-type::before");
    expect(main.length).toBeGreaterThan(0);
    expect(frame.length).toBeGreaterThan(0);
    const mainText = main.join(";");
    const frameText = frame.join(";");

    const size = /font-size\s*:\s*([\d.]+)(rem|px)/.exec(mainText);
    expect(size).not.toBeNull();
    const px = Number(size?.[1]) * (size?.[2] === "rem" ? 16 : 1);
    expect(px).toBeGreaterThanOrEqual(14);

    expect(frameText).toMatch(/border\s*:\s*3px\s+double\b/);

    const rot = /rotate\(\s*(-?[\d.]+)deg\s*\)/.exec(mainText);
    expect(rot).not.toBeNull();
    const deg = Number(rot?.[1]);
    expect(deg).toBeGreaterThanOrEqual(-3);
    expect(deg).toBeLessThanOrEqual(-2);

    expect(mainText + frameText).not.toMatch(/blur\(/);
    expect(mainText + frameText).not.toMatch(/text-shadow/);
  });

  it("uses filter only as url(#fragment) and every url() is a fragment", () => {
    const filters = declarations("filter");
    expect(filters.length).toBeGreaterThan(0);
    for (const value of filters) expect(value).toMatch(/^url\(#[\w-]+\)$/);
    const urls = [...code.matchAll(/url\(([^)]*)\)/g)].map((m) => (m[1] ?? "").trim());
    expect(urls.length).toBeGreaterThan(0);
    for (const u of urls) expect(u).toMatch(/^["']?#[\w-]+["']?$/);
  });

  it("uses only var(--swing) or 200ms as an animation or transition duration", () => {
    const values = [...declarations("animation"), ...declarations("transition")];
    expect(values.length).toBeGreaterThan(0);
    for (const value of values) {
      const clean = value.replace(/\s*!important\s*$/, "");
      if (clean === "none") continue;
      expect(clean, value).toMatch(/var\(--swing\)|(?<![\d.])200ms/);
      const times = [...clean.matchAll(/(?<![\w-])(\d*\.?\d+)(ms|s)\b/g)];
      for (const t of times) expect(t[0]).toBe("200ms");
    }
  });

  it("has no scroll-behavior: smooth", () => {
    expect(code).not.toMatch(/scroll-behavior\s*:\s*smooth/);
  });

  it("has rules for disabled chips, linked elements and the cut corner", () => {
    expect(bodiesFor(".chip:disabled").length).toBeGreaterThan(0);
    expect(code).toMatch(/\[data-linked="true"\]/);
    expect(code).toMatch(/clip-path\s*:\s*polygon\(/);
  });

  it("keeps the marker label at 0.75rem or more", () => {
    const text = bodiesFor(".marker-label").join(";");
    const size = /font-size\s*:\s*([\d.]+)rem/.exec(text);
    expect(size).not.toBeNull();
    expect(Number(size?.[1])).toBeGreaterThanOrEqual(0.75);
  });

  it("gives the link controls a 44px target", () => {
    for (const selector of [".chip", ".link-button", ".phone-marker", ".marker"]) {
      const bodies = bodiesFor(selector);
      expect(bodies.length, selector).toBeGreaterThan(0);
      expect(
        bodies.some((b) => /(?<![\w-])(min-height|height)\s*:\s*var\(--tap\)/.test(b)),
        selector,
      ).toBe(true);
    }
  });

  it("keeps src/ui/public/ down to report.json", () => {
    const dir = new URL("../../src/ui/public/", import.meta.url);
    expect(readdirSync(dir)).toEqual(["report.json"]);
  });

  it("keeps the pinned dependency lists of package.json", () => {
    const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(pkg.dependencies).toEqual(PINNED.dependencies);
    expect(pkg.devDependencies).toEqual(PINNED.devDependencies);
  });
});
