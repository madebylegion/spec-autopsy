// Thin DOM code. All text goes through textContent, never innerHTML.
import type { Finding, Report } from "../report/types.js";
import { bodyMap, mapLegend, phoneMap } from "./body-map.js";
import {
  applyFilters,
  buildMarkers,
  cardText,
  detailFor,
  findingKeys,
  pathParts,
  sortFindings,
  typeCounts,
} from "./view-model.js";
import type { Detail, Filters, PageState } from "./view-model.js";

export interface RenderOptions {
  /** Lines of an error banner shown above the current report, or null. */
  banner: string[] | null;
  onFile: (file: File) => void;
  filters: Filters;
  /** Key of the open detail panel, or null. */
  selectedKey: string | null;
  onFilters: (filters: Filters) => void;
  onSelect: (key: string) => void;
  onClose: () => void;
}

/** Whether the phone "Body map" <details> is open; kept here so a re-render does not close it. */
let phoneMapOpen = false;

/** A check mark in text (U+2713, a text symbol and not an emoji) shows that a toggle is on. */
const CHECK = "\u2713";

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
  // The native input is hidden visually but stays focusable inside its label.
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

/**
 * A path that breaks only after a "/". The last part and the `:line` suffix
 * are kept together so the line number never wraps alone.
 */
function pathNode(file: string, line: number): HTMLElement {
  const path = el("span", "path");
  const parts = pathParts(file);
  const last = parts.pop();
  for (const part of parts) {
    path.append(el("span", "path-seg", part), document.createElement("wbr"));
  }
  const tail = el("span", "path-tail");
  if (last !== undefined) tail.append(el("span", "path-seg", last));
  tail.append(el("span", "path-line", `:${line}`));
  path.append(tail);
  return path;
}

function metaRow(label: string, value: Node | string): HTMLElement {
  const row = el("div", "meta-row");
  const term = el("dt", "meta-label", label);
  const description = el("dd", "meta-value");
  description.append(value);
  row.append(term, description);
  return row;
}

function toeTag(finding: Finding, key: string, selected: boolean, onSelect: (key: string) => void): HTMLElement {
  const text = cardText(finding);
  const item = el("li", "tag-item");
  const card = el("article", `tag tag--${finding.type}${selected ? " tag--selected" : ""}`);
  const top = el("div", "tag-top");
  top.append(el("span", "tag-hole"), el("span", "tag-id", text.id), el("span", "tag-type", tagLabel(finding.type)));
  const title = el("p", "tag-title", text.clamped);
  const open = el("button", "link-button", "Open details");
  open.type = "button";
  open.setAttribute("aria-label", `Open details for ${text.id}`);
  open.dataset["focusId"] = `card:${key}`;
  open.addEventListener("click", () => onSelect(key));
  const meta = el("dl", "tag-meta");
  meta.append(
    metaRow("Location", pathNode(finding.file, finding.line)),
    metaRow("Confidence", text.confidence),
    metaRow("Cause of death", text.cause),
  );
  card.append(top, title, open, meta);
  item.append(card);
  return item;
}

function toggle(
  label: string,
  pressed: boolean,
  id: string,
  kind: string,
  onClick: () => void,
): HTMLElement {
  const button = el("button", `toggle toggle--${kind}`);
  button.type = "button";
  button.setAttribute("aria-pressed", String(pressed));
  button.dataset["focusId"] = id;
  // The mark is a second cue for "on"; the state itself is read from aria-pressed.
  const mark = el("span", "toggle-mark", pressed ? CHECK : "");
  mark.setAttribute("aria-hidden", "true");
  button.append(mark, el("span", "toggle-label", label));
  button.addEventListener("click", onClick);
  return button;
}

function filterBar(report: Report, options: RenderOptions): HTMLElement {
  const counts = typeCounts(report.findings);
  const f = options.filters;
  const bar = el("div", "filters");
  bar.setAttribute("role", "group");
  bar.setAttribute("aria-label", "Filters");
  bar.append(
    toggle(`Ghosts ${counts.ghost}`, f.ghost, "filter:ghost", "ghost", () =>
      options.onFilters({ ...f, ghost: !f.ghost }),
    ),
    toggle(`Zombies ${counts.zombie}`, f.zombie, "filter:zombie", "zombie", () =>
      options.onFilters({ ...f, zombie: !f.zombie }),
    ),
    toggle(`Unproven ${counts.unproven}`, f.unproven, "filter:unproven", "unproven", () =>
      options.onFilters({ ...f, unproven: !f.unproven }),
    ),
    toggle("Low confidence", f.lowOnly, "filter:low", "low", () =>
      options.onFilters({ ...f, lowOnly: !f.lowOnly }),
    ),
  );
  return bar;
}

/** The filters sit directly above the toe tags. */
function tagList(report: Report, options: RenderOptions): HTMLElement {
  const section = el("section", "tags-section");
  section.append(el("h2", "section-title", "Toe tags"), filterBar(report, options));
  const shown = sortFindings(applyFilters(report.findings, options.filters));
  if (shown.length === 0) {
    section.append(el("p", "status status--empty", "No findings match the filters."));
    return section;
  }
  const keys = findingKeys(report);
  const list = el("ul", "tags");
  for (const finding of shown) {
    const key = keys.get(finding) ?? finding.requirementId ?? finding.title;
    list.append(toeTag(finding, key, key === options.selectedKey, options.onSelect));
  }
  section.append(list);
  return section;
}

function list(items: string[], none: string): HTMLElement {
  if (items.length === 0) return el("p", "detail-none", none);
  const ul = el("ul", "detail-list");
  for (const item of items) ul.append(el("li", "detail-item", item));
  return ul;
}

function detailSection(title: string, body: HTMLElement): HTMLElement {
  const section = el("section", "detail-block");
  section.append(el("h3", "detail-subtitle", title), body);
  return section;
}

function detailPanel(detail: Detail, onClose: () => void): HTMLElement {
  const panel = el("section", "detail");
  panel.tabIndex = -1;
  panel.dataset["focusId"] = "detail";
  panel.setAttribute("aria-labelledby", "detail-heading");
  const top = el("div", "detail-top");
  const heading = el("h2", "detail-heading", detail.heading);
  heading.id = "detail-heading";
  const close = el("button", "link-button detail-close", "Close");
  close.type = "button";
  close.setAttribute("aria-label", `Close details for ${detail.heading}`);
  close.dataset["focusId"] = "close";
  close.addEventListener("click", onClose);
  top.append(heading, el("span", `tag-type tag-type--${detail.status}`, detail.status), close);
  panel.append(top, el("p", "detail-text", detail.text));

  const meta = el("dl", "tag-meta");
  meta.append(metaRow("Location", pathNode(detail.file, detail.line)));
  if (detail.confidence !== null) meta.append(metaRow("Confidence", detail.confidence));
  if (detail.spec !== null) meta.append(metaRow("Spec", detail.spec));
  if (detail.lastCommit !== null) meta.append(metaRow("Last commit", detail.lastCommit));
  panel.append(meta);

  if (detail.evidence.length > 0) panel.append(detailSection("Evidence", list(detail.evidence, "")));
  if (detail.kind === "requirement") {
    panel.append(
      detailSection("Code links", list(detail.codeLinks, "No code linked.")),
      detailSection("Test links", list(detail.testLinks, "No test linked.")),
    );
  }
  return panel;
}

/**
 * Wide screens: the map column (sticky) on the left, filters and tags on the right.
 * Phones: the tags first and the map as a closed <details> at the end. Both map
 * versions are in the DOM; CSS shows one of them, so each has its own focus ids.
 */
function reportView(report: Report, options: RenderOptions, withTags: boolean): HTMLElement {
  const view = el("div", "report");
  const markers = buildMarkers(report);
  const mapInputs = {
    markers,
    filters: options.filters,
    selectedKey: options.selectedKey,
    onSelect: options.onSelect,
  };

  const mapCol = el("section", "map-col");
  mapCol.append(el("h2", "section-title", "Body map"), bodyMap(mapInputs), mapLegend());

  const side = el("div", "tags-col");
  if (options.selectedKey !== null) {
    const detail = detailFor(report, options.selectedKey);
    if (detail !== null) side.append(detailPanel(detail, options.onClose));
  }
  if (withTags) side.append(tagList(report, options));

  view.append(
    mapCol,
    side,
    phoneMap({
      ...mapInputs,
      report,
      open: phoneMapOpen,
      onToggle: (open) => {
        phoneMapOpen = open;
      },
    }),
  );
  return view;
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
    main.append(reportView(state.report, options, false));
  } else {
    main.append(reportView(state.report, options, true));
  }
  root.append(main);
}
