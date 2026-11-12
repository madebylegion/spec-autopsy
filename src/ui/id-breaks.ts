// DOM-free helpers: where a label may break.

/**
 * Splits an id into pieces, each ending with "/" or "-" (the last piece may end with anything).
 * Joining the pieces gives the id back; a <wbr> goes between consecutive pieces.
 * A break is allowed after each "/" and each "-".
 */
export function idBreakParts(id: string): string[] {
  const parts: string[] = [];
  let start = 0;
  for (let i = 0; i < id.length; i++) {
    const c = id[i];
    if (c === "/" || c === "-") {
      parts.push(id.slice(start, i + 1));
      start = i + 1;
    }
  }
  if (start < id.length) parts.push(id.slice(start));
  return parts;
}

const isLower = (c: string | undefined): boolean => c !== undefined && c >= "a" && c <= "z";
const isUpper = (c: string | undefined): boolean => c !== undefined && c >= "A" && c <= "Z";

/**
 * Splits a symbol name where a human would break it: after "_", "." and "#", between a lower-case
 * and an upper-case letter (camelCase), and before the last capital of an acronym run that is
 * followed by a lower-case letter ("HTTPServer" gives "HTTP", "Server"; "HTTP" is never split).
 * Joining the pieces gives the name back; a <wbr> goes between consecutive pieces.
 */
export function symbolBreakParts(name: string): string[] {
  const parts: string[] = [];
  let start = 0;
  for (let i = 1; i < name.length; i++) {
    const prev = name[i - 1];
    const cur = name[i];
    const afterSeparator = prev === "_" || prev === "." || prev === "#";
    const camel = isLower(prev) && isUpper(cur);
    const acronymEnd = isUpper(prev) && isUpper(cur) && isLower(name[i + 1]);
    if (afterSeparator || camel || acronymEnd) {
      parts.push(name.slice(start, i));
      start = i;
    }
  }
  if (start < name.length) parts.push(name.slice(start));
  return parts;
}
