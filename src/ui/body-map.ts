// Thin DOM code. The silhouette is SVG; every marker is a real HTML button over it.
import type { Report } from "../report/types.js";
import { MAP_HEIGHT, MAP_WIDTH, REGION_BOXES, markerVisible, regionForSpec } from "./view-model.js";
import type { Filters, MapMarker, MapRegion } from "./view-model.js";

const SVG_NS = "http://www.w3.org/2000/svg";

export interface BodyMapOptions {
  markers: MapMarker[];
  filters: Filters;
  selectedKey: string | null;
  onSelect: (key: string) => void;
}

export interface PhoneMapOptions extends BodyMapOptions {
  report: Report;
  /** Whether the <details> is open; the caller keeps it across re-renders. */
  open: boolean;
  onToggle: (open: boolean) => void;
}

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string>,
  className?: string,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  if (className !== undefined) node.setAttribute("class", className);
  return node;
}

interface Part {
  region: MapRegion;
  tag: "ellipse" | "rect";
  attrs: Record<string, string>;
}

const STRIP = REGION_BOXES["extra-limb"];

/** The body parts, front view, in drawing units. The extra limb strip comes last. */
const PARTS: readonly Part[] = [
  { region: "head", tag: "ellipse", attrs: { cx: "150", cy: "60", rx: "50", ry: "46" } },
  { region: "chest", tag: "rect", attrs: { x: "92", y: "108", width: "116", height: "122", rx: "10" } },
  { region: "abdomen", tag: "rect", attrs: { x: "96", y: "230", width: "108", height: "108", rx: "10" } },
  { region: "left-arm", tag: "rect", attrs: { x: "30", y: "118", width: "64", height: "240", rx: "12" } },
  { region: "right-arm", tag: "rect", attrs: { x: "206", y: "118", width: "64", height: "240", rx: "12" } },
  { region: "left-leg", tag: "rect", attrs: { x: "98", y: "340", width: "52", height: "260", rx: "12" } },
  { region: "right-leg", tag: "rect", attrs: { x: "150", y: "340", width: "52", height: "260", rx: "12" } },
  {
    region: "extra-limb",
    tag: "rect",
    attrs: {
      x: String(STRIP.x - 6),
      y: String(STRIP.y - 10),
      width: String(STRIP.w + 12),
      height: String(STRIP.h + 20),
      rx: "6",
    },
  },
];

/** The full silhouette on its slab. The slab frame is drawn inside the viewBox so it is never cut. */
function silhouette(): SVGSVGElement {
  const drawing = svg("svg", {
    viewBox: `0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`,
    preserveAspectRatio: "xMidYMid meet",
    "aria-hidden": "true",
    focusable: "false",
  });
  drawing.append(
    svg(
      "rect",
      { x: "2", y: "2", width: String(MAP_WIDTH - 4), height: String(MAP_HEIGHT - 4), rx: "8" },
      "map-slab",
    ),
  );
  for (const part of PARTS) {
    drawing.append(svg(part.tag, part.attrs, part.region === "extra-limb" ? "map-strip" : "map-body"));
  }
  return drawing;
}

/** A small silhouette with one region highlighted. The strip is drawn only when it is the region. */
function regionIcon(region: MapRegion): SVGSVGElement {
  const icon = svg(
    "svg",
    {
      viewBox: `0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`,
      preserveAspectRatio: "xMidYMid meet",
      "aria-hidden": "true",
      focusable: "false",
    },
    "icon",
  );
  for (const part of PARTS) {
    if (part.region === "extra-limb" && region !== "extra-limb") continue;
    icon.append(svg(part.tag, part.attrs, part.region === region ? "icon-part icon-part--on" : "icon-part"));
  }
  return icon;
}

function markerButton(marker: MapMarker, options: BodyMapOptions): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `marker marker--${marker.status}`;
  if (marker.key === options.selectedKey) {
    button.classList.add("marker--selected");
    button.setAttribute("aria-current", "true");
  }
  button.setAttribute("aria-label", marker.name);
  button.dataset["focusId"] = `marker:${marker.key}`;
  button.style.left = `${(marker.x / MAP_WIDTH) * 100}%`;
  button.style.top = `${(marker.y / MAP_HEIGHT) * 100}%`;
  button.style.setProperty("--dot-units", String(Math.max(4, Math.min(marker.cell * 0.6, 20))));
  const dot = document.createElement("span");
  dot.className = "marker-dot";
  button.append(dot);
  button.addEventListener("click", () => options.onSelect(marker.key));
  return button;
}

/** The silhouette with its markers. Markers hidden by a filter are left out; the others keep their place. */
export function bodyMap(options: BodyMapOptions): HTMLElement {
  const figure = document.createElement("figure");
  figure.className = "map-figure";
  const wrap = document.createElement("div");
  wrap.className = "map";
  wrap.append(silhouette());
  for (const marker of options.markers) {
    if (markerVisible(marker, options.filters)) wrap.append(markerButton(marker, options));
  }
  figure.append(wrap);
  return figure;
}

const LEGEND: readonly { status: "ghost" | "unproven" | "proven" | "zombie"; text: string }[] = [
  { status: "ghost", text: "Ghost: in the spec, never built" },
  { status: "unproven", text: "Unproven: built, no test checks it" },
  { status: "proven", text: "Proven: built and tested" },
  { status: "zombie", text: "Zombie: no spec asked for it (extra limb)" },
];

/** Four rows: the drawn marker and a one-line meaning. */
export function mapLegend(): HTMLElement {
  const box = document.createElement("section");
  box.className = "legend";
  box.setAttribute("aria-label", "Marker legend");
  const title = document.createElement("h3");
  title.className = "legend-title";
  title.textContent = "Markers";
  const list = document.createElement("ul");
  list.className = "legend-list";
  for (const row of LEGEND) {
    const item = document.createElement("li");
    item.className = "legend-row";
    const swatch = document.createElement("span");
    swatch.className = `swatch swatch--${row.status}`;
    swatch.setAttribute("aria-hidden", "true");
    const text = document.createElement("span");
    text.className = "legend-text";
    text.textContent = row.text;
    item.append(swatch, text);
    list.append(item);
  }
  box.append(title, list);
  return box;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function shortId(id: string): string {
  const cut = id.lastIndexOf("/");
  return cut === -1 ? id : id.slice(cut + 1);
}

/** A tap-sized marker: the whole 44 px button is the hit area, the dot is the drawn marker. */
function phoneMarker(marker: MapMarker, options: BodyMapOptions): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `phone-marker marker--${marker.status}`;
  if (marker.key === options.selectedKey) {
    button.classList.add("marker--selected");
    button.setAttribute("aria-current", "true");
  }
  button.setAttribute("aria-label", marker.name);
  button.dataset["focusId"] = `pmarker:${marker.key}`;
  const dot = document.createElement("span");
  dot.className = "marker-dot";
  button.append(dot);
  if (marker.region !== "extra-limb") {
    const label = document.createElement("span");
    label.className = "phone-marker-label";
    label.textContent = shortId(marker.id);
    button.append(label);
  }
  button.addEventListener("click", () => options.onSelect(marker.key));
  return button;
}

function specBlock(
  name: string,
  region: MapRegion,
  markers: MapMarker[],
  options: BodyMapOptions,
  heading: string,
): HTMLElement {
  const block = document.createElement("section");
  block.className = "spec-block";
  const title = document.createElement("h3");
  title.className = "spec-name";
  title.textContent = heading;
  const count = document.createElement("p");
  count.className = "spec-count";
  count.textContent = name;
  const grid = document.createElement("div");
  grid.className = "marker-grid";
  for (const marker of markers) grid.append(phoneMarker(marker, options));
  block.append(regionIcon(region), title, count, grid);
  return block;
}

/**
 * The phone version of the body map: a closed <details>, each spec as a stacked
 * block with a small silhouette, its name and a grid of 44 px marker buttons.
 */
export function phoneMap(options: PhoneMapOptions): HTMLElement {
  const details = document.createElement("details");
  details.className = "map-phone";
  details.open = options.open;
  details.addEventListener("toggle", () => options.onToggle(details.open));

  const requirements = options.report.specs.reduce((sum, spec) => sum + spec.requirements.length, 0);
  const summary = document.createElement("summary");
  summary.className = "map-phone-summary";
  const summaryTitle = document.createElement("span");
  summaryTitle.className = "map-phone-title";
  summaryTitle.textContent = "Body map";
  const summaryCount = document.createElement("span");
  summaryCount.className = "map-phone-count";
  summaryCount.textContent = `${plural(requirements, "requirement")} in ${plural(options.report.specs.length, "spec")}`;
  summary.append(summaryTitle, document.createTextNode(" "), summaryCount);
  details.append(summary, mapLegend());

  const byKey = new Map<string, MapMarker>();
  for (const marker of options.markers) byKey.set(marker.key, marker);

  options.report.specs.forEach((spec, index) => {
    const region = regionForSpec(index);
    const markers: MapMarker[] = [];
    for (const req of spec.requirements) {
      const marker = byKey.get(req.id);
      if (marker !== undefined && markerVisible(marker, options.filters)) markers.push(marker);
    }
    details.append(
      specBlock(
        `${plural(spec.requirements.length, "requirement")}, ${region.replace("-", " ")}`,
        region,
        markers,
        options,
        spec.name,
      ),
    );
  });

  const zombies = options.markers.filter((m) => m.region === "extra-limb");
  if (zombies.length > 0) {
    const shown = zombies.filter((m) => markerVisible(m, options.filters));
    details.append(specBlock(plural(zombies.length, "zombie"), "extra-limb", shown, options, "Extra limb"));
  }
  if (options.report.specs.length === 0 && zombies.length === 0) {
    const none = document.createElement("p");
    none.className = "detail-none";
    none.textContent = "Nothing to map.";
    details.append(none);
  }
  return details;
}
