// DOM-free helper: where an id may break. A break is allowed after each "/" and each "-".

/**
 * Splits an id into pieces, each ending with "/" or "-" (the last piece may end with anything).
 * Joining the pieces gives the id back; a <wbr> goes between consecutive pieces.
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
