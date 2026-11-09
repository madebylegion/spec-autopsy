import type { Node, Tree } from "web-tree-sitter";
import type { CommentEntry, FileIndex, TestCase } from "./types.js";

type Language = FileIndex["language"];

/** Depth-first walk without recursion, so deep trees cannot overflow the stack. */
function* walk(root: Node): Generator<Node> {
  const stack: Node[] = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined) break;
    yield node;
    const children = node.children;
    for (let i = children.length - 1; i >= 0; i--) {
      const child = children[i];
      if (child !== undefined && child !== null) stack.push(child);
    }
  }
}

interface Positioned {
  line: number;
  index: number;
}

function byPosition(a: Positioned, b: Positioned): number {
  return a.line !== b.line ? a.line - b.line : a.index - b.index;
}

/**
 * Every comment of a file with its 1-based start line and raw text
 * (`//`, block and `#` comments). Text inside string literals is never a
 * comment node, so it is not recorded. Sorted by line.
 */
export function extractComments(tree: Tree, _language: Language): CommentEntry[] {
  const found: Array<Positioned & { text: string }> = [];
  for (const node of walk(tree.rootNode)) {
    if (node.type === "comment") {
      found.push({
        line: node.startPosition.row + 1,
        index: node.startIndex,
        text: node.text,
      });
    }
  }
  found.sort(byPosition);
  return found.map((c) => ({ line: c.line, text: c.text }));
}

const TEST_CALLEES: ReadonlySet<string> = new Set(["it", "test", "describe"]);

/** Title of a plain string or substitution-free template literal, else undefined. */
function plainTitle(node: Node): string | undefined {
  if (node.type === "string") {
    return node.text.slice(1, -1);
  }
  if (node.type === "template_string") {
    for (const child of node.namedChildren) {
      if (child !== null && child.type === "template_substitution") return undefined;
    }
    return node.text.slice(1, -1);
  }
  return undefined;
}

function tsTestCase(node: Node): (Positioned & { title: string }) | undefined {
  if (node.type !== "call_expression") return undefined;
  const callee = node.childForFieldName("function");
  if (callee === null || callee.type !== "identifier" || !TEST_CALLEES.has(callee.text)) {
    return undefined;
  }
  const args = node.childForFieldName("arguments");
  if (args === null || args.type !== "arguments") return undefined;
  let first: Node | undefined;
  for (const child of args.namedChildren) {
    if (child !== null && child.type !== "comment") {
      first = child;
      break;
    }
  }
  if (first === undefined) return undefined;
  const title = plainTitle(first);
  if (title === undefined) return undefined;
  return { title, line: node.startPosition.row + 1, index: node.startIndex };
}

function pyTestCase(node: Node): (Positioned & { title: string }) | undefined {
  if (node.type !== "function_definition") return undefined;
  const name = node.childForFieldName("name");
  if (name === null || !name.text.startsWith("test_")) return undefined;
  return { title: name.text, line: node.startPosition.row + 1, index: node.startIndex };
}

/**
 * Test cases of a test file: `it(`, `test(`, `describe(` calls with a plain
 * string first argument (TS/JS) or `def test_*` functions (Python). Files that
 * are not test files always give an empty list. Sorted by line.
 */
export function extractTestCases(
  tree: Tree,
  language: Language,
  isTest: boolean,
): TestCase[] {
  if (!isTest) return [];
  const pick = language === "python" ? pyTestCase : tsTestCase;
  const found: Array<Positioned & { title: string }> = [];
  for (const node of walk(tree.rootNode)) {
    const testCase = pick(node);
    if (testCase !== undefined) found.push(testCase);
  }
  found.sort(byPosition);
  return found.map((t) => ({ title: t.title, line: t.line }));
}
