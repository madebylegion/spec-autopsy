import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Text checks on the sources of the Morgue UI. No DOM: the bounding box checks are in the manual checklist.
const read = (name: string): string => readFileSync(new URL(`../../src/ui/${name}`, import.meta.url), "utf8");

const render = read("render.ts");
const bodyMap = read("body-map.ts");
const html = read("index.html");
const css = read("style.css").replace(/\/\*[\s\S]*?\*\//g, "");

/** The declaration blocks of every rule whose selector list contains `selector` exactly. */
function blocksFor(selector: string): string[] {
  const out: string[] = [];
  for (const m of css.matchAll(/([^{}@][^{}]*)\{([^{}]*)\}/g)) {
    const selectors = (m[1] ?? "").split(",").map((s) => s.trim());
    if (selectors.includes(selector)) out.push(m[2] ?? "");
  }
  return out;
}

describe("toe tag structure (render.ts)", () => {
  it("builds the shape, sheet, head, eyelet and string", () => {
    for (const name of ["tag-shape", "tag-sheet", "tag-head", "tag-eyelet", "tag-hole", "tag-id", "tag-type"]) {
      expect(render, name).toContain(`"${name}"`);
    }
    expect(render).toContain("tag-string");
    expect(render).toContain("tag-string-line");
  });

  it("puts the key attributes on the article", () => {
    expect(render).toContain('card.dataset["tagKey"] = key');
    expect(render).toContain("card.tabIndex = -1");
  });

  it("keeps the Open details button and its focus id", () => {
    expect(render).toContain('"Open details"');
    expect(render).toContain("`card:${key}`");
  });

  it("keeps the selected state on the article", () => {
    expect(render).toMatch(/tag--selected/);
  });
});

describe("toe tag styles (style.css)", () => {
  it("no longer has the paperclip rule", () => {
    expect(css).not.toMatch(/\.tag::before/);
    expect(css).not.toMatch(/\.tag-top\b/);
  });

  it("cuts the corner with clip-path: polygon on the shape and the sheet", () => {
    for (const selector of [".tag-shape", ".tag-sheet"]) {
      const joined = blocksFor(selector).join(" ");
      expect(joined, selector).toMatch(/clip-path\s*:\s*polygon\(/);
    }
  });

  it("reserves a column for the eyelet", () => {
    expect(blocksFor(".tag-head").join(" ")).toMatch(/grid-template-columns\s*:\s*56px\b/);
  });

  it("draws the string with a token stroke", () => {
    expect(blocksFor(".tag-string-line").join(" ")).toMatch(/stroke\s*:\s*var\(--bone-dim\)/);
  });

  it("puts the focus outline on the tag article, not on a clipped box", () => {
    expect(blocksFor(".tag:focus-visible").join(" ")).toMatch(/outline\s*:/);
    expect(blocksFor(".tag--selected").join(" ")).toMatch(/outline\s*:/);
    for (const selector of [".tag-shape", ".tag-sheet"]) {
      expect(blocksFor(selector).join(" "), selector).not.toMatch(/outline/);
    }
  });

  it("styles the stamp with token colours only", () => {
    const stampBlocks = [
      ...blocksFor(".tag .tag-type"),
      ...blocksFor(".tag .tag-type::before"),
      ...blocksFor(".tag--ghost .tag-type"),
      ...blocksFor(".tag--zombie .tag-type"),
      ...blocksFor(".tag--unproven .tag-type"),
    ];
    expect(stampBlocks.length).toBeGreaterThanOrEqual(5);
    const joined = stampBlocks.join("\n");
    expect(joined).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(joined).not.toMatch(/\b(rgb|rgba|hsl|hsla)\s*\(/i);
    expect(joined).toMatch(/--stamp\s*:\s*var\(--ghost-stamp\)/);
    expect(joined).toMatch(/--stamp\s*:\s*var\(--zombie-stamp\)/);
    expect(joined).toMatch(/--stamp\s*:\s*var\(--unproven-stamp\)/);
    expect(joined).toMatch(/color\s*:\s*var\(--stamp\)/);
    expect(joined).toMatch(/border\s*:\s*3px double var\(--stamp\)/);
    expect(joined).toMatch(/filter\s*:\s*url\(#stamp-rough\)/);
    expect(joined).toMatch(/rotate\(-2\.5deg\)/);
    expect(joined).not.toMatch(/blur\(|text-shadow/);
  });

  it("leaves the detail panel stamp filled with the accent", () => {
    expect(blocksFor(".tag-type").join(" ")).toMatch(/background\s*:\s*var\(--accent\)/);
  });

  it("defines the steel and stamp tokens", () => {
    const root = /:root\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    for (const name of [
      "steel",
      "steel-line",
      "steel-light",
      "steel-shadow",
      "ghost-stamp",
      "zombie-stamp",
      "unproven-stamp",
    ]) {
      expect(root, name).toMatch(new RegExp(`--${name}\\s*:\\s*#[0-9a-fA-F]{6};`));
    }
  });

  it("paints the map with steel tokens, hairlines and no gradient", () => {
    expect(blocksFor(".map-slab").join(" ")).toMatch(/fill\s*:\s*var\(--steel\)/);
    expect(blocksFor(".map-brush").join(" ")).toMatch(/fill\s*:\s*url\(#brush\)/);
    expect(blocksFor(".map-brush-line").join(" ")).toMatch(/stroke\s*:\s*var\(--steel-line\)/);
    const mapBlock = blocksFor(".map").join(" ");
    expect(mapBlock).toMatch(/box-shadow\s*:[^;]*var\(--steel-light\)[^;]*var\(--steel-shadow\)/);
    expect(css).not.toMatch(/gradient\s*\(/);
  });
});

describe("markup for the stamp and the steel", () => {
  it("has the rough stamp filter with a fixed seed in index.html", () => {
    expect(html).toContain('<filter id="stamp-rough"');
    expect(html).toContain("<feTurbulence");
    expect(html).toMatch(/seed="\d+"/);
    expect(html).toContain("<feDisplacementMap");
  });

  it("draws the brush pattern and the two slab rectangles in body-map.ts", () => {
    expect(bodyMap).toContain('id: "brush"');
    expect(bodyMap).toContain('"map-brush-line"');
    expect(bodyMap).toContain('"map-slab"');
    expect(bodyMap).toContain('"map-brush"');
  });
});
