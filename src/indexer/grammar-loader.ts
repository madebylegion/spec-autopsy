import { createRequire } from "node:module";
import { Parser, Language } from "web-tree-sitter";
import type { FileIndex } from "./types.js";

export type LanguageName = FileIndex["language"];

const EXTENSION_MAP: Readonly<Record<string, LanguageName>> = {
  ".ts": "typescript",
  ".tsx": "tsx",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
};

/** Maps a file extension (with the leading dot, e.g. ".ts") to a grammar name. */
export function languageForExtension(ext: string): LanguageName | undefined {
  return Object.prototype.hasOwnProperty.call(EXTENSION_MAP, ext)
    ? EXTENSION_MAP[ext]
    : undefined;
}

const require = createRequire(import.meta.url);

let initPromise: Promise<void> | undefined;
const parsers = new Map<LanguageName, Promise<Parser>>();

function ensureInit(): Promise<void> {
  if (initPromise === undefined) {
    initPromise = Parser.init();
  }
  return initPromise;
}

async function createParser(language: LanguageName): Promise<Parser> {
  await ensureInit();
  const wasmPath = require.resolve(`tree-sitter-wasms/out/tree-sitter-${language}.wasm`);
  const lang = await Language.load(wasmPath);
  const parser = new Parser();
  parser.setLanguage(lang);
  return parser;
}

/**
 * Returns the shared Parser for a language. Loaded lazily once; later calls
 * (including failures) reuse the cached result.
 */
export function getParser(language: LanguageName): Promise<Parser> {
  let cached = parsers.get(language);
  if (cached === undefined) {
    cached = createParser(language);
    parsers.set(language, cached);
  }
  return cached;
}
