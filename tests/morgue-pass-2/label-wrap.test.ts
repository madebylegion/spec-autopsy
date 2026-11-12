import { readFileSync } from "node:fs";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { idBreakParts, symbolBreakParts } from "../../src/ui/id-breaks.js";

const css = readFileSync(new URL("../../src/ui/style.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

function ruleBlocks(): { selectors: string[]; body: string }[] {
  const out: { selectors: string[]; body: string }[] = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    out.push({ selectors: (m[1] ?? "").split(",").map((s) => s.trim()), body: m[2] ?? "" });
  }
  return out;
}

const CHIP_SELECTORS = [".chip", ".chip-label", ".chip-count", ".chip-mark"];
const TAG_SELECTORS = [".tag-id", ".tag-type", ".meta-label", ".marker-label", ".phone-marker-label"];

function bodiesFor(selector: string): string[] {
  return ruleBlocks()
    .filter((r) => r.selectors.includes(selector))
    .map((r) => r.body);
}

describe("label wrapping rules (style.css)", () => {
  it("keeps overflow-wrap: anywhere on body", () => {
    expect(bodiesFor("body").join(";")).toMatch(/overflow-wrap\s*:\s*anywhere/);
  });

  it("opts the chip selectors out, with hyphens: manual", () => {
    for (const selector of CHIP_SELECTORS) {
      const text = bodiesFor(selector).join(";");
      expect(text, selector).toMatch(/overflow-wrap\s*:\s*normal/);
      expect(text, selector).toMatch(/word-break\s*:\s*normal/);
      expect(text, selector).toMatch(/hyphens\s*:\s*manual/);
    }
  });

  it("opts the tag text selectors out", () => {
    for (const selector of TAG_SELECTORS) {
      const text = bodiesFor(selector).join(";");
      expect(text, selector).toMatch(/overflow-wrap\s*:\s*normal/);
      expect(text, selector).toMatch(/word-break\s*:\s*normal/);
    }
  });

  it("opt-out rules exist for exactly these selectors", () => {
    const optOut = new Set<string>();
    for (const r of ruleBlocks()) {
      if (/overflow-wrap\s*:\s*normal/.test(r.body) && /word-break\s*:\s*normal/.test(r.body)) {
        for (const s of r.selectors) optOut.add(s);
      }
    }
    for (const s of [...CHIP_SELECTORS, ...TAG_SELECTORS]) expect(optOut.has(s), s).toBe(true);
    // Only the selectors above and the existing path rule opt out.
    expect([...optOut].filter((s) => ![...CHIP_SELECTORS, ...TAG_SELECTORS, ".path"].includes(s))).toEqual([]);
  });

  it("never lets those selectors break anywhere in a word", () => {
    for (const selector of [...CHIP_SELECTORS, ...TAG_SELECTORS]) {
      for (const body of bodiesFor(selector)) {
        expect(body, selector).not.toMatch(/overflow-wrap\s*:\s*anywhere/);
        expect(body, selector).not.toMatch(/break-all/);
        expect(body, selector).not.toMatch(/break-word/);
      }
    }
  });

  it("sizes .tag-id with clamp()", () => {
    expect(bodiesFor(".tag-id").join(";")).toMatch(/font-size\s*:\s*clamp\(/);
  });

  it("lets .marker-label wrap and never clips it", () => {
    const text = bodiesFor(".marker-label").join(";");
    expect(text).not.toMatch(/white-space\s*:\s*nowrap/);
    expect(text).not.toMatch(/overflow\s*:\s*hidden/);
    expect(text).toMatch(/white-space\s*:\s*normal/);
    expect(text).toMatch(/overflow\s*:\s*visible/);
  });
});

describe("idBreakParts", () => {
  const join = (id: string): string => idBreakParts(id).join("");

  it("breaks after / and - only", () => {
    expect(idBreakParts("mcp-report-server/R4.2")).toEqual(["mcp-", "report-", "server/", "R4.2"]);
  });

  it("never breaks a bare identifier", () => {
    expect(idBreakParts("SummaryRequirement")).toEqual(["SummaryRequirement"]);
  });

  it("gives no parts for an empty string", () => {
    expect(idBreakParts("")).toEqual([]);
    expect(join("")).toBe("");
  });

  it("keeps the text for any string", () => {
    fc.assert(
      fc.property(fc.string(), (id) => {
        expect(join(id)).toBe(id);
      }),
    );
  });

  it("splits only after / or -", () => {
    fc.assert(
      fc.property(fc.string(), (id) => {
        const parts = idBreakParts(id);
        parts.slice(0, -1).forEach((part) => expect(/[/-]$/.test(part)).toBe(true));
        for (const part of parts) {
          expect(part.length).toBeGreaterThan(0);
          // No / or - inside a part except at its end.
          expect(/[/-]/.test(part.slice(0, -1))).toBe(false);
        }
      }),
    );
  });
});

describe("symbolBreakParts", () => {
  it("breaks camelCase between a lower-case and an upper-case letter", () => {
    expect(symbolBreakParts("SummaryRequirement")).toEqual(["Summary", "Requirement"]);
    expect(symbolBreakParts("idBreakParts")).toEqual(["id", "Break", "Parts"]);
  });

  it("breaks after _", () => {
    expect(symbolBreakParts("export_queue_csv")).toEqual(["export_", "queue_", "csv"]);
  });

  it("breaks after . and #", () => {
    expect(symbolBreakParts("src/a.ts#fooBar")).toEqual(["src/a.", "ts#", "foo", "Bar"]);
  });

  it("keeps an acronym run together before a capitalised word", () => {
    expect(symbolBreakParts("HTTPServer")).toEqual(["HTTP", "Server"]);
    expect(symbolBreakParts("HTTP")).toEqual(["HTTP"]);
  });

  it("does not break a name without a break point", () => {
    expect(symbolBreakParts("formatisbnvalue")).toEqual(["formatisbnvalue"]);
  });

  it("gives no parts for an empty string", () => {
    expect(symbolBreakParts("")).toEqual([]);
  });

  it("joins back to the input for any string", () => {
    fc.assert(
      fc.property(fc.string(), (name) => {
        const parts = symbolBreakParts(name);
        expect(parts.join("")).toBe(name);
        for (const part of parts) expect(part.length).toBeGreaterThan(0);
      }),
    );
  });

  it("joins back to the input for identifier-like strings", () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[A-Za-z0-9_.#/-]{0,40}$/), (name) => {
        expect(symbolBreakParts(name).join("")).toBe(name);
      }),
    );
  });
});
