// Thin DOM code. All text goes through textContent, never innerHTML.
import type { Finding } from "../report/types.js";
import { cardText, sortFindings, typeCounts } from "./view-model.js";
import type { PageState } from "./view-model.js";

export interface RenderOptions {
  /** Lines of an error banner shown above the current report, or null. */
  banner: string[] | null;
  onFile: (file: File) => void;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function bigNumber(count: number, label: string, kind: string): HTMLElement {
  const box = el("div", `big big--${kind}`);
  box.append(el("span", "big-count", String(count)), el("span", "big-label", label));
  return box;
}

function openInput(onFile: (file: File) => void): HTMLElement {
  const label = el("label", "open-report");
  label.append(el("span", "open-report-text", "Open another report"));
  const input = el("input", "open-report-input");
  input.type = "file";
  input.accept = ".json,application/json";
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (file !== undefined) onFile(file);
    input.value = "";
  });
  label.append(input);
  return label;
}

function header(state: PageState, onFile: (file: File) => void): HTMLElement {
  const head = el("header", "top");
  const title = el("div", "top-title");
  if (state.kind === "ready" || state.kind === "empty") {
    const report = state.report;
    title.append(
      el("h1", "project", report.project.name),
      el("span", "version", `SpecAutopsy v${report.tool.version}`),
    );
    head.append(title);
    const counts = typeCounts(report.findings);
    const numbers = el("div", "bigs");
    numbers.append(
      bigNumber(counts.ghost, "Ghosts", "ghost"),
      bigNumber(counts.zombie, "Zombies", "zombie"),
      bigNumber(counts.unproven, "Unproven", "unproven"),
    );
    head.append(numbers);
  } else {
    title.append(el("h1", "project", "SpecAutopsy Morgue"));
    head.append(title);
  }
  if (state.kind !== "loading") head.append(openInput(onFile));
  return head;
}

function banner(lines: string[]): HTMLElement {
  const box = el("section", "banner");
  box.setAttribute("role", "alert");
  box.append(el("h2", "banner-title", "That file was not opened"));
  for (const line of lines) box.append(el("p", "banner-line", line));
  return box;
}

function tagLabel(type: Finding["type"]): string {
  return type === "ghost" ? "Ghost" : type === "zombie" ? "Zombie" : "Unproven";
}

function toeTag(finding: Finding): HTMLElement {
  const text = cardText(finding);
  const item = el("li", "tag-item");
  const card = el("article", `tag tag--${finding.type}`);
  const top = el("div", "tag-top");
  top.append(el("span", "tag-hole"), el("span", "tag-id", text.id), el("span", "tag-type", tagLabel(finding.type)));
  const title = el("p", "tag-title", text.clamped);
  title.title = text.title;
  const where = el("p", "tag-where", text.where);
  const confidence = el("p", "tag-confidence", `Confidence ${text.confidence}`);
  const cause = el("p", "tag-cause");
  cause.append(el("span", "tag-cause-label", "Cause of death"), document.createTextNode(` ${text.cause}`));
  card.append(top, title, where, confidence, cause);
  item.append(card);
  return item;
}

function tagList(findings: Finding[]): HTMLElement {
  const section = el("section", "tags-section");
  section.append(el("h2", "section-title", "Toe tags"));
  const list = el("ul", "tags");
  for (const finding of sortFindings(findings)) list.append(toeTag(finding));
  section.append(list);
  return section;
}

export function renderPage(root: HTMLElement, state: PageState, options: RenderOptions): void {
  root.replaceChildren();
  root.append(header(state, options.onFile));
  const main = el("main", "page");
  if (options.banner !== null) main.append(banner(options.banner));
  if (state.kind === "loading") {
    const line = el("p", "status", "Opening the morgue...");
    line.setAttribute("role", "status");
    main.append(line);
  } else if (state.kind === "error") {
    const box = el("section", "error-state");
    box.setAttribute("role", "alert");
    box.append(el("h2", "error-title", state.title));
    for (const line of state.lines) box.append(el("p", "error-line", line));
    main.append(box);
  } else if (state.kind === "empty") {
    main.append(el("p", "status status--empty", "No bodies. Every requirement is built and proven."));
  } else {
    main.append(tagList(state.report.findings));
  }
  root.append(main);
}
