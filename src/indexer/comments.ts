import type { Node, Tree } from "web-tree-sitter";
import { collectNames } from "./names.js";
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

interface FoundTest extends Positioned {
  title: string;
  node: Node;
}

function tsTestCase(node: Node): FoundTest | undefined {
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
  return { title, line: node.startPosition.row + 1, index: node.startIndex, node };
}

function pyTestCase(node: Node): FoundTest | undefined {
  if (node.type !== "function_definition") return undefined;
  const name = node.childForFieldName("name");
  if (name === null || !name.text.startsWith("test_")) return undefined;
  return { title: name.text, line: node.startPosition.row + 1, index: node.startIndex, node };
}

/** Last line of a node; a node ending at column 0 does not cover that line. */
function lastLine(node: Node): number {
  const start = node.startPosition.row + 1;
  let end = node.endPosition.row + 1;
  if (node.endPosition.column === 0 && end > start) end -= 1;
  return end;
}

/**
 * Test cases of a test file: `it(`, `test(`, `describe(` calls with a plain
 * string first argument (TS/JS) or `def test_*` functions (Python). Files that
 * are not test files always give an empty list. Sorted by line.
 * With `withDetails`, every test case also carries `endLine` and `calls`: the
 * identifier names its body uses, without the callees `it`, `test` and
 * `describe`, its own function name and anything inside a nested test case.
 */
export function extractTestCases(
  tree: Tree,
  language: Language,
  isTest: boolean,
  withDetails = false,
): TestCase[] {
  if (!isTest) return [];
  const pick = language === "python" ? pyTestCase : tsTestCase;
  const found: FoundTest[] = [];
  for (const node of walk(tree.rootNode)) {
    const testCase = pick(node);
    if (testCase !== undefined) found.push(testCase);
  }
  found.sort(byPosition);
  return found.map((t): TestCase => {
    if (!withDetails) return { title: t.title, line: t.line };
    const calls = collectNames(t.node, {
      skipSubtree: (node) => pick(node) !== undefined,
      skipNames: TEST_CALLEES,
    });
    return { title: t.title, line: t.line, endLine: lastLine(t.node), calls };
  });
}
