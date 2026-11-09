import "./style.css";
import { validateReport } from "../report/validate-report.js";
import { renderPage } from "./render.js";
import { stateFromLoad } from "./view-model.js";
import type { LoadResult, PageState } from "./view-model.js";

const root = document.getElementById("app");
if (root === null) throw new Error("Missing #app element");
const app: HTMLElement = root;

let current: PageState = { kind: "loading" };
let banner: string[] | null = null;

function show(): void {
  renderPage(app, current, { banner, onFile: (file) => void openFile(file) });
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

show();
void loadInitial();
