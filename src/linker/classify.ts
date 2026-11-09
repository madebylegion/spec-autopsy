import type { CodeIndex, Symbol as CodeSymbol, SymbolKind } from "../indexer/index.js";
import type { CodeLink, RequirementStatus, TestLink, Zombie, ZombieKind } from "./types.js";

const ZOMBIE_KINDS: ReadonlySet<SymbolKind> = new Set<SymbolKind>([
  "function",
  "class",
  "const",
  "enum",
  "interface",
  "type",
]);

function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Identity of a symbol: file, start line and name (names can repeat). */
export function symbolKey(file: string, startLine: number, name: string): string {
  return `${file}\u0000${startLine}\u0000${name}`;
}

/** ghost: no code links; unproven: code but no test; proven: code and test. */
export function classifyRequirement(
  codeLinks: readonly CodeLink[],
  testLinks: readonly TestLink[],
): RequirementStatus {
  if (codeLinks.length === 0) return "ghost";
  if (testLinks.length === 0) return "unproven";
  return "proven";
}

function zombieKind(kind: SymbolKind): ZombieKind | undefined {
  return ZOMBIE_KINDS.has(kind) ? (kind as ZombieKind) : undefined;
}

/**
 * An exported symbol of kind function, class, const, enum, interface or type
 * in a non-test file. Methods, non-exported symbols and test files never are.
 */
export function isZombieCandidate(symbol: CodeSymbol, file: { isTest: boolean }): boolean {
  if (file.isTest) return false;
  if (!symbol.exported) return false;
  return zombieKind(symbol.kind) !== undefined;
}

/** Zombie candidates that no requirement links to, sorted by file, line, symbol. */
export function findZombies(index: CodeIndex, linkedSymbolKeys: ReadonlySet<string>): Zombie[] {
  const zombies: Zombie[] = [];
  for (const file of index.files) {
    for (const symbol of file.symbols) {
      if (!isZombieCandidate(symbol, file)) continue;
      if (linkedSymbolKeys.has(symbolKey(file.path, symbol.startLine, symbol.name))) continue;
      const kind = zombieKind(symbol.kind);
      if (kind === undefined) continue;
      zombies.push({ symbol: symbol.name, kind, file: file.path, line: symbol.startLine });
    }
  }
  zombies.sort(
    (a, b) =>
      compareCodeUnits(a.file, b.file) || a.line - b.line || compareCodeUnits(a.symbol, b.symbol),
  );
  return zombies;
}
