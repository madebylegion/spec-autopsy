import type { Node, Tree } from "web-tree-sitter";
import type { Symbol as CodeSymbol, SymbolKind } from "./types.js";

/** 1-based inclusive line range of a node. */
function lineRange(node: Node): { startLine: number; endLine: number } {
  const startLine = node.startPosition.row + 1;
  let endLine = node.endPosition.row + 1;
  // A node ending at column 0 does not really cover that last line.
  if (node.endPosition.column === 0 && endLine > startLine) {
    endLine -= 1;
  }
  return { startLine, endLine };
}

function make(
  name: string,
  kind: SymbolKind,
  exported: boolean,
  range: Node,
  file: string,
): CodeSymbol {
  const { startLine, endLine } = lineRange(range);
  return { name, kind, exported, startLine, endLine, file };
}

/**
 * Value of a plain string literal node, or undefined when the node is not a
 * plain literal (f-string, concatenation, bytes, anything else).
 */
function plainStringValue(node: Node): string | undefined {
  if (node.type !== "string") return undefined;
  for (const child of node.namedChildren) {
    if (child !== null && child.type === "interpolation") return undefined;
  }
  const match = /^([a-zA-Z]*)("""|'''|"|')([\s\S]*)\2$/.exec(node.text);
  if (match === null) return undefined;
  const prefix = (match[1] ?? "").toLowerCase();
  if (prefix.includes("f") || prefix.includes("b")) return undefined;
  return match[3] ?? "";
}

/** Names listed in a list of plain strings, or undefined if the node is not one. */
function stringListValues(node: Node): string[] | undefined {
  if (node.type !== "list") return undefined;
  const names: string[] = [];
  for (const element of node.namedChildren) {
    if (element === null) continue;
    if (element.type === "comment") continue;
    const value = plainStringValue(element);
    if (value === undefined) return undefined;
    names.push(value);
  }
  return names;
}

/**
 * Reads a top-level `__all__ = [...]` assignment. Returns the listed names,
 * or undefined when `__all__` is absent or not a list of string literals.
 */
function readDunderAll(root: Node): ReadonlySet<string> | undefined {
  let result: ReadonlySet<string> | undefined;
  for (const node of root.namedChildren) {
    if (node === null || node.type !== "expression_statement") continue;
    const assignment = node.namedChild(0);
    if (assignment === null || assignment.type !== "assignment") continue;
    const left = assignment.childForFieldName("left");
    if (left === null || left.type !== "identifier" || left.text !== "__all__") continue;
    const right = assignment.childForFieldName("right");
    const names = right === null ? undefined : stringListValues(right);
    result = names === undefined ? undefined : new Set(names);
  }
  return result;
}

function isDunder(name: string): boolean {
  return name.length > 4 && name.startsWith("__") && name.endsWith("__");
}

function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Extracts top-level functions, classes, class methods and module-level
 * constants from a Python syntax tree. Unrecognised nodes are skipped.
 */
export function extractPy(tree: Tree, file: string): CodeSymbol[] {
  const root = tree.rootNode;
  const allNames = readDunderAll(root);
  const out: CodeSymbol[] = [];

  const topLevelExported = (name: string): boolean => {
    if (name.startsWith("_")) return false;
    return allNames === undefined ? true : allNames.has(name);
  };

  for (const node of root.namedChildren) {
    if (node === null) continue;

    if (node.type === "expression_statement") {
      // Module-level constant: `NAME = value` or `NAME: type = value`.
      // For a chain `A = B = 1` the outer left side is `A`, so only `A` counts.
      const assignment = node.namedChild(0);
      if (assignment === null || assignment.type !== "assignment") continue;
      const left = assignment.childForFieldName("left");
      const right = assignment.childForFieldName("right");
      if (left === null || right === null || left.type !== "identifier") continue;
      if (isDunder(left.text)) continue;
      out.push(make(left.text, "const", topLevelExported(left.text), node, file));
      continue;
    }

    let definition: Node = node;
    if (node.type === "decorated_definition") {
      const inner = node.childForFieldName("definition");
      if (inner === null) continue;
      definition = inner;
    }

    if (definition.type === "function_definition") {
      const name = definition.childForFieldName("name");
      if (name === null) continue;
      out.push(make(name.text, "function", topLevelExported(name.text), node, file));
      continue;
    }

    if (definition.type !== "class_definition") continue;
    const className = definition.childForFieldName("name");
    if (className === null) continue;
    const classExported = topLevelExported(className.text);
    out.push(make(className.text, "class", classExported, node, file));

    const body = definition.childForFieldName("body");
    if (body === null) continue;
    for (const member of body.namedChildren) {
      if (member === null) continue;
      let method: Node = member;
      if (member.type === "decorated_definition") {
        const inner = member.childForFieldName("definition");
        if (inner === null) continue;
        method = inner;
      }
      if (method.type !== "function_definition") continue;
      const methodName = method.childForFieldName("name");
      if (methodName === null) continue;
      const exported =
        isDunder(methodName.text) || !methodName.text.startsWith("_")
          ? classExported
          : false;
      out.push(
        make(`${className.text}.${methodName.text}`, "method", exported, member, file),
      );
    }
  }

  return out
    .map((symbol, index) => ({ symbol, index }))
    .sort(
      (a, b) =>
        a.symbol.startLine - b.symbol.startLine ||
        compareCodeUnits(a.symbol.name, b.symbol.name) ||
        a.index - b.index,
    )
    .map((entry) => entry.symbol);
}
