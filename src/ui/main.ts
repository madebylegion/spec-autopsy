import "./style.css";
import { validateReport } from "../report/validate-report.js";
import { attachLinks } from "./link-map.js";
import { renderPage } from "./render.js";
import { stateFromLoad } from "./view-model.js";
import type { Filters, LoadResult, PageState } from "./view-model.js";

const root = document.getElementById("app");
if (root === null) throw new Error("Missing #app element");
const app: HTMLElement = root;

let current: PageState = { kind: "loading" };
let banner: string[] | null = null;
let filters: Filters = { ghost: true, zombie: true, unproven: true, lowOnly: false };
let selectedKey: string | null = null;
/** The focus id of the control that opened the panel, so Close can return there. */
let openerId: string | null = null;

/** Hover, focus and "Show on map" links between a map marker and its toe tag. */
const links = attachLinks(app, () =>
  current.kind === "ready" || current.kind === "empty" ? current.report : null,
);

function focusId(): string | null {
  const active = document.activeElement;
  return active instanceof HTMLElement ? (active.dataset["focusId"] ?? null) : null;
}

function focusById(id: string): boolean {
  for (const node of Array.from(app.querySelectorAll<HTMLElement>("[data-focus-id]"))) {
    if (node.dataset["focusId"] === id) {
      node.focus({ preventScroll: true });
      return true;
    }
  }
  return false;
}

function show(): void {
  renderPage(app, current, {
    banner,
    onFile: (file) => void openFile(file),
    filters,
    selectedKey,
    onFilters: (next) => {
      const id = focusId();
      filters = next;
      show();
      if (id !== null) focusById(id);
    },
    onSelect: (key) => {
      openerId = focusId();
      selectedKey = key;
      show();
      // A marker with a tag hands the focus to the tag afterwards (link-map.ts);
      // a marker without a tag keeps the focus on the detail panel.
      focusById("detail");
      const panel = app.querySelector<HTMLElement>(".detail");
      if (panel !== null) panel.scrollIntoView({ block: "nearest" });
    },
    onClose: close,
  });
  links.apply();
}

function close(): void {
  if (selectedKey === null) return;
  selectedKey = null;
  show();
  if (openerId !== null) focusById(openerId);
  openerId = null;
}

function validatedFrom(text: string): LoadResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // A dev server may answer a missing file with the HTML page.
    return text.trimStart().startsWith("<") ? { status: "missing" } : { status: "json-error" };
  }
  return { status: "validated", result: validateReport(parsed) };
}

async function loadInitial(): Promise<void> {
  let result: LoadResult;
  try {
    const response = await fetch("./report.json");
    result = response.ok ? validatedFrom(await response.text()) : { status: "missing" };
  } catch {
    result = { status: "missing" };
  }
  current = stateFromLoad(result);
  banner = null;
  selectedKey = null;
  links.clear();
  show();
}

async function openFile(file: File): Promise<void> {
  let result: LoadResult;
  try {
    result = validatedFrom(await file.text());
  } catch {
    result = { status: "json-error" };
  }
  const next = stateFromLoad(result);
  const hasReport = current.kind === "ready" || current.kind === "empty";
  if (next.kind === "error" && hasReport) {
    // A bad file leaves the current report in place.
    banner = [next.title, ...next.lines];
  } else {
    current = next;
    banner = null;
    selectedKey = null;
    openerId = null;
    links.clear();
  }
  show();
}

document.addEventListener("dragover", (event) => {
  event.preventDefault();
});
document.addEventListener("drop", (event) => {
  event.preventDefault();
  const file = event.dataTransfer?.files[0];
  if (file !== undefined) void openFile(file);
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  // Escape clears the map and tag link and the status line, and still closes the detail panel.
  links.clear();
  if (selectedKey !== null) {
    event.preventDefault();
    close();
  }
});

show();
void loadInitial();
