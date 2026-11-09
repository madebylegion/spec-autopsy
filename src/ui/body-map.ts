// Thin DOM code. The silhouette is SVG; every marker is a real HTML button over it.
import { MAP_HEIGHT, MAP_WIDTH, REGION_BOXES, markerVisible } from "./view-model.js";
import type { Filters, MapMarker } from "./view-model.js";

const SVG_NS = "http://www.w3.org/2000/svg";

export interface BodyMapOptions {
  markers: MapMarker[];
  filters: Filters;
  selectedKey: string | null;
  onSelect: (key: string) => void;
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

function silhouette(): SVGSVGElement {
  const drawing = svg("svg", {
    viewBox: `0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`,
    preserveAspectRatio: "xMidYMid meet",
    "aria-hidden": "true",
    focusable: "false",
  });
  const strip = REGION_BOXES["extra-limb"];
  drawing.append(
    svg("rect", { x: "0", y: "0", width: String(MAP_WIDTH), height: String(MAP_HEIGHT) }, "map-slab"),
    svg("ellipse", { cx: "150", cy: "60", rx: "50", ry: "46" }, "map-body"),
    svg("rect", { x: "92", y: "108", width: "116", height: "122", rx: "10" }, "map-body"),
    svg("rect", { x: "96", y: "230", width: "108", height: "108", rx: "10" }, "map-body"),
    svg("rect", { x: "30", y: "118", width: "64", height: "240", rx: "12" }, "map-body"),
    svg("rect", { x: "206", y: "118", width: "64", height: "240", rx: "12" }, "map-body"),
    svg("rect", { x: "98", y: "340", width: "52", height: "260", rx: "12" }, "map-body"),
    svg("rect", { x: "150", y: "340", width: "52", height: "260", rx: "12" }, "map-body"),
    svg(
      "rect",
      {
        x: String(strip.x - 6),
        y: String(strip.y - 10),
        width: String(strip.w + 12),
        height: String(strip.h + 20),
        rx: "6",
      },
      "map-strip",
    ),
  );
  return drawing;
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

/**
 * The silhouette with its markers, then a caption. Markers hidden by a filter
 * are left out; the others keep their place.
 */
export function bodyMap(options: BodyMapOptions): HTMLElement {
  const figure = document.createElement("figure");
  figure.className = "map-figure";
  const wrap = document.createElement("div");
  wrap.className = "map";
  wrap.append(silhouette());
  for (const marker of options.markers) {
    if (markerVisible(marker, options.filters)) wrap.append(markerButton(marker, options));
  }
  const caption = document.createElement("figcaption");
  caption.className = "map-caption";
  caption.textContent =
    "Each marker is a requirement: open ring ghost, dashed ring unproven, filled dot proven. The strip at the bottom is the extra limb: code no spec asked for.";
  figure.append(wrap, caption);
  return figure;
}
