import type { Node } from "web-tree-sitter";

/** Node types that carry an identifier name a body can use. */
const NAME_TYPES: ReadonlySet<string> = new Set([
  "identifier",
  "type_identifier",
  "shorthand_property_identifier",
]);

/** Node types whose `name` field is a definition name, not a use. */
const DEFINITION_TYPES: ReadonlySet<string> = new Set([
  "function_declaration",
  "generator_function_declaration",
  "function_expression",
  "function",
  "generator_function",
  "class_declaration",
  "abstract_class_declaration",
  "class",
  "interface_declaration",
  "type_alias_declaration",
  "enum_declaration",
  "function_definition",
  "class_definition",
]);

const FUNCTION_VALUE_TYPES: ReadonlySet<string> = new Set([
  "arrow_function",
  "function_expression",
  "function",
  "generator_function",
]);

export interface NameOptions {
  /** A node whose whole subtree is left out (the root itself is never tested). */
  skipSubtree?: (node: Node) => boolean;
  /** Identifier texts that are never recorded. */
  skipNames?: ReadonlySet<string>;
}

/**
 * Distinct identifier names inside `root`, in order of first occurrence.
 * Definition names are left out: the name of a function, class, interface,
 * type or enum, a `const` bound to a function, the declared name of the
 * root statement itself (`const NAME = ...` or `NAME = ...`).
 * Iterative, so a deep tree cannot overflow the stack.
 */
export function collectNames(root: Node, options: NameOptions = {}): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const skipIds = new Set<number>();
  const stack: Node[] = [root];

  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined) break;
    if (node.id !== root.id && options.skipSubtree !== undefined && options.skipSubtree(node)) {
      continue;
    }

    const type = node.type;
    if (DEFINITION_TYPES.has(type)) {
      const name = node.childForFieldName("name");
      if (name !== null) skipIds.add(name.id);
    } else if (type === "variable_declarator") {
      const name = node.childForFieldName("name");
      const value = node.childForFieldName("value");
      if (name !== null) {
        const parent = node.parent;
        const own =
          parent !== null &&
          (parent.id === root.id || (parent.parent !== null && parent.parent.id === root.id));
        if (own || (value !== null && FUNCTION_VALUE_TYPES.has(value.type))) {
          skipIds.add(name.id);
        }
      }
    } else if (type === "assignment") {
      const parent = node.parent;
      if (parent !== null && parent.id === root.id) {
        const left = node.childForFieldName("left");
        if (left !== null) skipIds.add(left.id);
      }
    }

    if (NAME_TYPES.has(type) && !skipIds.has(node.id)) {
      const text = node.text;
      if (!seen.has(text) && !(options.skipNames?.has(text) ?? false)) {
        seen.add(text);
        out.push(text);
      }
    }

    const children = node.children;
    for (let i = children.length - 1; i >= 0; i--) {
      const child = children[i];
      if (child !== undefined && child !== null) stack.push(child);
    }
  }
  return out;
}
