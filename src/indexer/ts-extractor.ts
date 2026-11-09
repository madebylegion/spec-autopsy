import type { Node, Tree } from "web-tree-sitter";
import type { Symbol as CodeSymbol, SymbolKind } from "./types.js";

interface RawSymbol {
  symbol: CodeSymbol;
  /** Name of the owning class for methods, undefined for top-level symbols. */
  owner?: string;
}

const FUNCTION_VALUE_TYPES: ReadonlySet<string> = new Set([
  "arrow_function",
  "function_expression",
  "function",
  "generator_function",
]);

const FUNCTION_DECLARATION_TYPES: ReadonlySet<string> = new Set([
  "function_declaration",
  "generator_function_declaration",
  "function_expression",
  "function",
  "generator_function",
]);

const CLASS_TYPES: ReadonlySet<string> = new Set([
  "class_declaration",
  "abstract_class_declaration",
  "class",
]);

const SIMPLE_KINDS: Readonly<Record<string, SymbolKind>> = {
  interface_declaration: "interface",
  type_alias_declaration: "type",
  enum_declaration: "enum",
};

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

function handleDeclaration(
  node: Node,
  range: Node,
  exported: boolean,
  file: string,
  out: RawSymbol[],
): void {
  const type = node.type;

  if (FUNCTION_DECLARATION_TYPES.has(type)) {
    const name = node.childForFieldName("name");
    if (name !== null) {
      out.push({ symbol: make(name.text, "function", exported, range, file) });
    }
    return;
  }

  if (CLASS_TYPES.has(type)) {
    const name = node.childForFieldName("name");
    if (name === null) return;
    out.push({ symbol: make(name.text, "class", exported, range, file) });
    const body = node.childForFieldName("body");
    if (body === null) return;
    for (const member of body.namedChildren) {
      if (member === null) continue;
      if (member.type !== "method_definition") continue;
      const methodName = member.childForFieldName("name");
      if (methodName === null) continue;
      out.push({
        symbol: make(`${name.text}.${methodName.text}`, "method", exported, member, file),
        owner: name.text,
      });
    }
    return;
  }

  const simple = SIMPLE_KINDS[type];
  if (simple !== undefined) {
    const name = node.childForFieldName("name");
    if (name !== null) {
      out.push({ symbol: make(name.text, simple, exported, range, file) });
    }
    return;
  }

  if (type === "lexical_declaration") {
    const first = node.child(0);
    if (first === null || first.type !== "const") return;
    for (const declarator of node.namedChildren) {
      if (declarator === null) continue;
      if (declarator.type !== "variable_declarator") continue;
      const name = declarator.childForFieldName("name");
      if (name === null || name.type !== "identifier") continue;
      const value = declarator.childForFieldName("value");
      const kind: SymbolKind =
        value !== null && FUNCTION_VALUE_TYPES.has(value.type) ? "function" : "const";
      out.push({ symbol: make(name.text, kind, exported, range, file) });
    }
  }
}

function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Extracts top-level symbols (and class methods) from a TypeScript, TSX or
 * JavaScript syntax tree. Unrecognised nodes are skipped.
 */
export function extractTs(tree: Tree, file: string): CodeSymbol[] {
  const raw: RawSymbol[] = [];
  const exportedNames = new Set<string>();

  for (const node of tree.rootNode.namedChildren) {
    if (node === null) continue;
    if (node.type !== "export_statement") {
      handleDeclaration(node, node, false, file, raw);
      continue;
    }

    const declaration = node.childForFieldName("declaration");
    if (declaration !== null) {
      handleDeclaration(declaration, node, true, file, raw);
      continue;
    }

    const value = node.childForFieldName("value");
    if (value !== null) {
      if (value.type === "identifier") {
        exportedNames.add(value.text);
      } else {
        handleDeclaration(value, node, true, file, raw);
      }
      continue;
    }

    // Export list or re-export: `export { a, b as c }`, `export { a } from "x"`,
    // `export * from "x"`. Only local names matter; no symbols are invented.
    for (const child of node.namedChildren) {
      if (child === null) continue;
      if (child.type !== "export_clause") continue;
      for (const specifier of child.namedChildren) {
        if (specifier === null) continue;
        if (specifier.type !== "export_specifier") continue;
        const local = specifier.childForFieldName("name");
        if (local !== null) exportedNames.add(local.text);
      }
    }
  }

  const symbols: CodeSymbol[] = raw.map(({ symbol, owner }) => {
    const top = owner === undefined ? symbol.name : owner;
    return exportedNames.has(top) && !symbol.exported
      ? { ...symbol, exported: true }
      : symbol;
  });

  return symbols
    .map((symbol, index) => ({ symbol, index }))
    .sort(
      (a, b) =>
        a.symbol.startLine - b.symbol.startLine ||
        compareCodeUnits(a.symbol.name, b.symbol.name) ||
        a.index - b.index,
    )
    .map((entry) => entry.symbol);
}
