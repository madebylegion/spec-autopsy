# Requirements Document

## Introduction

The indexer is the second organ of SpecAutopsy. Given a repository root it builds a code index: the source files, their symbols, comments, test case titles and git history. The later linker organ joins this index to the requirements from the EARS parser and to the tests. The indexer is deterministic: no LLM, no network, no randomness. The same repository state always gives the same index.

Requirement IDs follow the convention of the EARS parser: `indexer/R<N>.<M>`, for example `indexer/R3.2`, where M is the number written on the criterion line.

## Glossary

- **Index**: the `CodeIndex` object returned by `indexRepo`.
- **Project-relative path**: a path relative to the repository root, using `/` as separator.
- **Test file**: a file with `isTest` true, as defined in Requirement 1.
- **Symbol**: a named code element with a kind, an export flag and a 1-based inclusive line range.
- **Diagnostic**: a structured record of a problem, with a code, a message and a file.
- **Grammar**: a tree-sitter language definition loaded from a prebuilt WASM file of the `tree-sitter-wasms` package.

## Requirements

### Requirement 1: Discover source files

**User Story:** As a SpecAutopsy user, I want every source file in my repository found automatically, so that no code escapes the autopsy.

#### Acceptance Criteria

1. WHEN a repository root is given, THEN the indexer SHALL walk the root recursively and include every file whose extension is one of `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs` or `.py`.
2. WHEN the walk meets a directory named `node_modules`, `.git`, `dist`, `build`, `coverage`, `__pycache__`, `.venv` or `.kiro`, THEN the indexer SHALL skip that directory and everything below it.
3. The indexer SHALL visit directory entries in ascending code-unit order of their names, so that discovery order does not depend on the file system.
4. The indexer SHALL report every file path as project-relative with `/` separators.
5. WHEN a file path has a segment named `tests`, `test` or `__tests__`, THEN the indexer SHALL mark the file `isTest` true.
6. WHEN a file name matches `*.test.*`, `*.spec.*`, `test_*.py` or `*_test.py`, THEN the indexer SHALL mark the file `isTest` true.
7. The indexer SHALL mark every other file `isTest` false.
8. IF a directory cannot be read, THEN the indexer SHALL emit a diagnostic with code unreadable-directory and the directory path, and continue with the remaining entries.

### Requirement 2: Parse with web-tree-sitter

**User Story:** As a developer of later organs, I want one reliable parsing layer, so that every extractor sees the same syntax trees.

#### Acceptance Criteria

1. The indexer SHALL parse source with `web-tree-sitter` 0.25.10 and load grammars from the prebuilt WASM files of the `tree-sitter-wasms` package.
2. The indexer SHALL map `.ts` to the typescript grammar, `.tsx` to tsx, `.js`, `.jsx`, `.mjs` and `.cjs` to javascript, and `.py` to python.
3. WHEN a grammar is first needed, THEN the indexer SHALL load it once and create one shared Parser for that language, and reuse them for every later file.
4. The indexer SHALL resolve each grammar file path through the installed `tree-sitter-wasms` package, not through a path relative to the working directory.
5. IF a file cannot be read, THEN the indexer SHALL emit a diagnostic with code unreadable-file and the file path, and continue with the remaining files.
6. IF a file cannot be parsed or its extraction fails, THEN the indexer SHALL emit a diagnostic with code parse-failed and the file path, and continue with the remaining files.
7. IF a grammar cannot be loaded, THEN the indexer SHALL emit a diagnostic with code grammar-unavailable for each affected file and continue.
8. The indexer SHALL NOT throw on any file content, including empty files, binary data and syntactically invalid source.
9. Every diagnostic SHALL carry a code, a message and a file.

### Requirement 3: Extract TypeScript and JavaScript symbols

**User Story:** As a SpecAutopsy user, I want the functions, classes and types of my code listed, so that zombies (code no spec asked for) can be found.

#### Acceptance Criteria

1. WHEN a TypeScript or JavaScript file is indexed, THEN the indexer SHALL emit one symbol for each top-level function, class, interface, type alias, enum and const declaration, exported or not.
2. WHEN a top-level const is initialised with an arrow function or a function expression, THEN the indexer SHALL give the symbol kind function, otherwise kind const.
3. WHEN a class declares methods, THEN the indexer SHALL emit one symbol of kind method for each, named `Class.method`.
4. The indexer SHALL give every symbol the fields name, kind, exported, startLine, endLine and file, where kind is one of function, class, method, interface, type, enum or const.
5. WHEN a declaration is preceded by `export`, including `export default`, THEN the indexer SHALL set exported true.
6. WHEN a file contains an export list such as `export { a, b }`, THEN the indexer SHALL set exported true on the top-level symbols named in the list, using the local name.
7. WHEN a file contains a re-export such as `export { a } from "./x"` or `export * from "./x"`, THEN the indexer SHALL NOT invent symbols for it, and SHALL set exported true on a local symbol of the same name if one exists.
8. WHEN a class is exported, THEN the indexer SHALL set exported true on the class symbol and on its methods.
9. The indexer SHALL record startLine and endLine as 1-based and inclusive, covering the whole declaration including its `export` keyword.

### Requirement 4: Extract Python symbols

**User Story:** As a SpecAutopsy user, I want Python code indexed the same way, so that mixed repositories are covered.

#### Acceptance Criteria

1. WHEN a Python file is indexed, THEN the indexer SHALL emit one symbol for each top-level function (including async functions) with kind function, and for each top-level class with kind class.
2. WHEN a class defines methods, THEN the indexer SHALL emit one symbol of kind method for each, named `Class.method`.
3. WHEN a function or class has decorators, THEN the indexer SHALL include the decorator lines in its line range.
4. WHEN a top-level name does not start with an underscore, THEN the indexer SHALL set exported true, unless the module defines `__all__` as a list of string literals and the name is not in it.
5. WHEN a top-level name starts with an underscore, THEN the indexer SHALL set exported false.
6. WHEN a method belongs to a class, THEN the indexer SHALL set the method's exported flag equal to the exported flag of its class and false if the method name starts with a single underscore, except that dunder names such as `__init__` follow the class.
7. IF `__all__` is not a list of string literals, THEN the indexer SHALL ignore it and apply the underscore rule alone.
8. The indexer SHALL record startLine and endLine as 1-based and inclusive.

### Requirement 5: Extract comments and test cases

**User Story:** As a developer of the linker, I want comments and test titles with line numbers, so that requirement IDs mentioned there can be used as evidence.

#### Acceptance Criteria

1. WHEN a TypeScript or JavaScript file is indexed, THEN the indexer SHALL record every `//` comment and every block comment with its 1-based start line and its text.
2. WHEN a Python file is indexed, THEN the indexer SHALL record every `#` comment with its 1-based line and its text.
3. The indexer SHALL NOT record text inside string literals as a comment.
4. WHEN a TypeScript or JavaScript file is a test file, THEN the indexer SHALL record a test case for each call to `it(`, `test(` or `describe(` whose first argument is a plain string or template literal without substitutions, with that string as title and the 1-based line of the call.
5. The indexer SHALL NOT record calls such as `it.each(...)`, `test.skip(...)` or calls with a non-string first argument as test cases.
6. WHEN a Python file is a test file, THEN the indexer SHALL record a test case for each function whose name starts with `test_`, including methods, with the function name as title and the 1-based line of its `def`.
7. WHEN a file is not a test file, THEN the indexer SHALL record an empty list of test cases for it.
8. The indexer SHALL list comments and test cases in ascending line order.

### Requirement 6: Read git history

**User Story:** As a SpecAutopsy user, I want to see who last touched each file and when, so that a ghost or zombie has a history to inspect.

#### Acceptance Criteria

1. WHEN a file is indexed, THEN the indexer SHALL read its history with `git log -n 5 --format=<format> -- <file>`, run through `child_process.execFile` with the repository root as working directory and no shell.
2. The indexer SHALL record for each history entry the sha, the author name, the author date in ISO 8601 form and the subject, newest first.
3. WHEN a file is indexed, THEN the indexer SHALL record its total commit count and the sorted list of distinct author names across all its commits.
4. IF the root is not a git repository, or git is not installed, THEN the indexer SHALL give every file an empty history, a commit count of 0 and no authors, and emit no diagnostic.
5. IF a file has no commits, THEN the indexer SHALL give it an empty history, a commit count of 0 and no authors, and emit no diagnostic.
6. IF a git call fails for any other reason, THEN the indexer SHALL treat it as an empty history and continue without throwing.
7. The indexer SHALL pass the file path as a separate `execFile` argument after `--`, never inside a shell string.

### Requirement 7: Deterministic output

**User Story:** As a SpecAutopsy user, I want the same report every time, so that I can trust and diff results.

#### Acceptance Criteria

1. The indexer SHALL export `indexRepo(root): Promise<CodeIndex>` from `src/indexer/index.ts`, where `CodeIndex` has the fields root, files and diagnostics.
2. The indexer SHALL list files in ascending code-unit order of their project-relative path.
3. The indexer SHALL list the symbols of each file in ascending order of startLine, then name.
4. The indexer SHALL list diagnostics in ascending order of file, then code, then message.
5. WHEN the same repository state is indexed twice, THEN the indexer SHALL return deeply equal output whose JSON serialisation is identical, with a fixed key order.
6. The indexer SHALL NOT include timestamps of the run, absolute paths of the machine or random values in the index, except the `root` value as given by the caller.
7. For every symbol, the indexer SHALL guarantee 1 <= startLine <= endLine <= the number of lines of its file.
