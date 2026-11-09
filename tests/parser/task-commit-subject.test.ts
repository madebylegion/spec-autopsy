import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { matchTaskCommitSubject } from "../../src/parser/index.js";

describe("matchTaskCommitSubject", () => {
  it("reads the form with a spec", () => {
    expect(matchTaskCommitSubject("kiro: stock task 1 Record adjustments")).toEqual({
      spec: "stock",
      number: 1,
      title: "Record adjustments",
    });
  });

  it("reads a kebab-case spec", () => {
    expect(matchTaskCommitSubject("kiro: task-commit-link task 12 Do it")).toEqual({
      spec: "task-commit-link",
      number: 12,
      title: "Do it",
    });
  });

  it("reads the form without a spec", () => {
    expect(matchTaskCommitSubject("kiro: task 3 Do the thing")).toEqual({
      spec: null,
      number: 3,
      title: "Do the thing",
    });
  });

  it("matches kiro: and Task ignoring case", () => {
    expect(matchTaskCommitSubject("KIRO: stock TASK 2 Title")).toEqual({
      spec: "stock",
      number: 2,
      title: "Title",
    });
    expect(matchTaskCommitSubject("Kiro: Task 4 Title")).toEqual({
      spec: null,
      number: 4,
      title: "Title",
    });
  });

  it("rejects an uppercase spec", () => {
    expect(matchTaskCommitSubject("kiro: Stock task 1 Title")).toBeNull();
  });

  it("rejects a spec-creation commit", () => {
    expect(matchTaskCommitSubject("kiro: spec linker (requirements, design, tasks)")).toBeNull();
  });

  it("rejects a subject without a number", () => {
    expect(matchTaskCommitSubject("kiro: stock task Title")).toBeNull();
  });

  it("rejects a non-integer number", () => {
    expect(matchTaskCommitSubject("kiro: stock task 3.5 Title")).toBeNull();
    expect(matchTaskCommitSubject("kiro: stock task -1 Title")).toBeNull();
    expect(matchTaskCommitSubject("kiro: stock task x Title")).toBeNull();
  });

  it("rejects an empty title", () => {
    expect(matchTaskCommitSubject("kiro: stock task 3")).toBeNull();
    expect(matchTaskCommitSubject("kiro: stock task 3   ")).toBeNull();
    expect(matchTaskCommitSubject("kiro: task 3 ")).toBeNull();
  });

  it("rejects a subject without the prefix", () => {
    expect(matchTaskCommitSubject("stock task 1 Title")).toBeNull();
    expect(matchTaskCommitSubject("chore: task 1 Title")).toBeNull();
    expect(matchTaskCommitSubject("")).toBeNull();
  });

  it("trims the title", () => {
    expect(matchTaskCommitSubject("kiro: stock task 1    Padded title   ")).toEqual({
      spec: "stock",
      number: 1,
      title: "Padded title",
    });
  });
});

const specArb = fc
  .array(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789".split("")), {
    minLength: 1,
    maxLength: 6,
  })
  .map((chars) => chars.join(""));

const specNameArb = fc
  .array(specArb, { minLength: 1, maxLength: 3 })
  .map((parts) => parts.join("-"));

const titleArb = fc
  .array(fc.constantFrom(..."abcXYZ019 -_.,()".split("")), { minLength: 1, maxLength: 30 })
  .map((chars) => chars.join(""))
  .filter((s) => s.trim() !== "");

describe("matchTaskCommitSubject properties", () => {
  it("accepts both forms with the same spec, number and title", () => {
    fc.assert(
      fc.property(specNameArb, fc.nat(100000), titleArb, (spec, n, title) => {
        expect(matchTaskCommitSubject(`kiro: ${spec} task ${n} ${title}`)).toEqual({
          spec,
          number: n,
          title: title.trim(),
        });
        expect(matchTaskCommitSubject(`kiro: task ${n} ${title}`)).toEqual({
          spec: null,
          number: n,
          title: title.trim(),
        });
      }),
    );
  });

  it("rejects strings that do not start with kiro:", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        fc.pre(!s.toLowerCase().startsWith("kiro:"));
        expect(matchTaskCommitSubject(s)).toBeNull();
      }),
    );
  });

  it("never throws", () => {
    fc.assert(
      fc.property(fc.fullUnicodeString(), (s) => {
        matchTaskCommitSubject(s);
        matchTaskCommitSubject(`kiro: ${s}`);
        matchTaskCommitSubject(`kiro: task 1 ${s}`);
      }),
    );
  });
});
