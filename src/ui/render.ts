// Thin DOM code. All text goes through textContent, never innerHTML.
import type { Finding, Report } from "../report/types.js";
import { bodyMap, mapLegend, phoneMap } from "./body-map.js";
import { idBreakParts } from "./id-breaks.js";
import {
  applyFilters,
  buildMarkers,
  cardText,
  chipStates,
  detailFor,
  effectiveFilters,
  findingKeys,
  pathParts,
  sortFindings,
  typeCounts,
} from "./view-model.js";
import type { ChipCounts, ChipState, Detail, Filters, PageState } from "./view-model.js";

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

/** A check mark in text (U+2713, a text symbol and not an emoji) shows that a chip is on. */
const CHECK = "\u2713";

const SVG_NS = "http://www.w3.org/2000/svg";

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

/**
 * The tag id with a <wbr> after each "/" and each "-", so it breaks only there.
 * A <wbr> has no text, so textContent is the id exactly.
 */
function idNode(id: string): HTMLElement {
  const node = el("span", "tag-id");
  idBreakParts(id).forEach((part, index) => {
    if (index > 0) node.append(document.createElement("wbr"));
    node.append(part);
  });
  return node;
}

function metaRow(label: string, value: Node | string): HTMLElement {
  const row = el("div", "meta-row");
  const term = el("dt", "meta-label", label);
  const description = el("dd", "meta-value");
  description.append(value);
  row.append(term, description);
  return row;
}

/**
 * The string loop: a tall closed loop (24 x 56 units) whose lower end sits at the
 * centre of the hole. It hangs above the tag and passes through the eyelet; no text is there.
 */
function stringLoop(): SVGSVGElement {
  const drawing = document.createElementNS(SVG_NS, "svg");
  drawing.setAttribute("class", "tag-string");
  drawing.setAttribute("viewBox", "0 0 24 56");
  drawing.setAttribute("aria-hidden", "true");
  drawing.setAttribute("focusable", "false");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("class", "tag-string-line");
  path.setAttribute("d", "M12 2 C 3 2 3 56 12 56 C 21 56 21 2 12 2 Z");
  drawing.append(path);
  return drawing;
}

/**
 * li > article.tag (outline target, not clipped) > .tag-shape (paper edge, cut corner)
 * > .tag-sheet (paper) > .tag-head (eyelet, id, stamp), title, buttons, meta.
 */
function toeTag(finding: Finding, key: string, selected: boolean, onSelect: (key: string) => void): HTMLElement {
  const text = cardText(finding);
  const item = el("li", "tag-item");
  const card = el("article", `tag tag--${finding.type}${selected ? " tag--selected" : ""}`);
  card.tabIndex = -1;
  card.dataset["tagKey"] = key;
  const shape = el("div", "tag-shape");
  const sheet = el("div", "tag-sheet");
  const head = el("div", "tag-head");
  const eyelet = el("div", "tag-eyelet");
  eyelet.append(el("span", "tag-hole"), stringLoop());
  head.append(eyelet, idNode(text.id), el("span", "tag-type", tagLabel(finding.type)));
  const title = el("p", "tag-title", text.clamped);
  const open = el("button", "link-button", "Open details");
  open.type = "button";
  open.setAttribute("aria-label", `Open details for ${text.id}`);
  open.dataset["focusId"] = `card:${key}`;
  open.addEventListener("click", () => onSelect(key));
  // The click is handled by link-map.ts (event delegation on data-show-on-map).
  const show = el("button", "link-button", "Show on map");
  show.type = "button";
  show.setAttribute("aria-label", `Show ${text.id} on the map`);
  show.dataset["focusId"] = `show:${key}`;
  show.dataset["showOnMap"] = key;
  const actions = el("div", "tag-actions");
  actions.append(open, show);
  const meta = el("dl", "tag-meta");
  meta.append(
    metaRow("Location", pathNode(finding.file, finding.line)),
    metaRow("Confidence", text.confidence),
    metaRow("Cause of death", text.cause),
  );
  sheet.append(head, title, actions, meta);
  shape.append(sheet);
  card.append(shape);
  item.append(card);
  return item;
}

function chip(state: ChipState, onClick: () => void): HTMLElement {
  const button = el("button", `chip chip--${state.key}`);
  button.type = "button";
  button.setAttribute("aria-pressed", String(state.pressed));
  button.dataset["filter"] = state.key;
  button.dataset["focusId"] = `filter:${state.key}`;
  button.disabled = state.disabled;
  // The mark is a second cue for "on"; the state itself is read from aria-pressed.
  const mark = el("span", "chip-mark", state.pressed ? CHECK : "");
  mark.setAttribute("aria-hidden", "true");
  button.append(mark, el("span", "chip-label", state.label), el("span", "chip-count", String(state.count)));
  button.addEventListener("click", onClick);
  return button;
}

function chipCounts(report: Report): ChipCounts {
  const counts = typeCounts(report.findings);
  const low = report.findings.filter((finding) => finding.confidence.level === "low").length;
  return { ghost: counts.ghost, zombie: counts.zombie, unproven: counts.unproven, low };
}

function filterBar(report: Report, options: RenderOptions): HTMLElement {
  const f = options.filters;
  const bar = el("div", "filters");
  bar.setAttribute("role", "group");
  bar.setAttribute("aria-label", "Filters");
  for (const state of chipStates(f, chipCounts(report))) {
    bar.append(
      chip(state, () => {
        if (state.key === "low") options.onFilters({ ...f, lowOnly: !f.lowOnly });
        else options.onFilters({ ...f, [state.key]: !f[state.key] });
      }),
    );
  }
  return bar;
}

/** The filters sit directly above the toe tags. */
function tagList(report: Report, options: RenderOptions): HTMLElement {
  const section = el("section", "tags-section");
  section.append(el("h2", "section-title", "Toe tags"), filterBar(report, options));
  const applied = effectiveFilters(options.filters, chipCounts(report));
  const shown = sortFindings(applyFilters(report.findings, applied));
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
    report,
    markers,
    filters: effectiveFilters(options.filters, chipCounts(report)),
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
