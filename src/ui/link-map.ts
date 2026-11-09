// Thin DOM code. Links a toe tag and its map marker without a re-render, so the focus is never lost.
// It imports only view-model.ts; the pure rules (which key, which message) live there.
import type { Report } from "../report/types.js";
import { buildMarkers, linkMessage, linkedKey, markerKeyForTag, scrollBehavior, tagKeyForMarker } from "./view-model.js";

export interface LinkControl {
  /** Sets `data-linked` on the current pair; call it after each render. */
  apply: () => void;
  /** Clears hover, focus and pinned links and the status line (Escape). */
  clear: () => void;
}

const LINKABLE = "[data-marker-key], [data-tag-key]";

export function attachLinks(app: HTMLElement, getReport: () => Report | null): LinkControl {
  let hover: string | null = null;
  let focus: string | null = null;
  let pinned: string | null = null;

  function say(kind: "map" | "tag" | "no-tag", key: string): void {
    const node = document.querySelector<HTMLElement>("[data-link-status]");
    const report = getReport();
    if (node === null || report === null) return;
    node.textContent = linkMessage(kind, key, report);
  }

  function keyOf(target: EventTarget | null): string | null {
    if (!(target instanceof Element)) return null;
    const node = target.closest<HTMLElement>(LINKABLE);
    if (node === null) return null;
    return node.dataset["markerKey"] ?? node.dataset["tagKey"] ?? null;
  }

  function apply(): void {
    const key = linkedKey({ hover, focus, pinned });
    for (const node of Array.from(app.querySelectorAll<HTMLElement>(LINKABLE))) {
      const own = node.dataset["markerKey"] ?? node.dataset["tagKey"];
      if (key !== null && own === key) node.dataset["linked"] = "true";
      else delete node.dataset["linked"];
    }
  }

  function clear(): void {
    hover = null;
    focus = null;
    pinned = null;
    apply();
    const node = document.querySelector<HTMLElement>("[data-link-status]");
    if (node !== null) node.textContent = "";
  }

  function behavior(): "auto" | "smooth" {
    return scrollBehavior(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  function tagElement(key: string): HTMLElement | null {
    for (const node of Array.from(app.querySelectorAll<HTMLElement>("[data-tag-key]"))) {
      if (node.dataset["tagKey"] === key) return node;
    }
    return null;
  }

  /** A marker with a layout box: the wide map or the open phone map, whichever is shown. */
  function visibleMarker(key: string): HTMLElement | null {
    for (const node of Array.from(app.querySelectorAll<HTMLElement>("[data-marker-key]"))) {
      if (node.dataset["markerKey"] === key && node.getClientRects().length > 0) return node;
    }
    return null;
  }

  function onMarkerActivated(key: string): void {
    const tagKeys = new Set<string>();
    for (const node of Array.from(app.querySelectorAll<HTMLElement>("[data-tag-key]"))) {
      const own = node.dataset["tagKey"];
      if (own !== undefined) tagKeys.add(own);
    }
    pinned = key;
    const tagKey = tagKeyForMarker(key, tagKeys);
    const tag = tagKey === null ? null : tagElement(tagKey);
    if (tag === null) {
      apply();
      say("no-tag", key);
      return;
    }
    tag.scrollIntoView({ block: "center", behavior: behavior() });
    tag.focus({ preventScroll: true });
    apply();
    say("tag", key);
  }

  function onShowOnMap(key: string): void {
    pinned = key;
    const report = getReport();
    let marker = visibleMarker(key);
    if (marker === null) {
      const phone = app.querySelector<HTMLDetailsElement>("details.map-phone");
      if (phone !== null && !phone.open) {
        phone.open = true;
        marker = visibleMarker(key);
      }
    }
    apply();
    if (marker === null) {
      // A tag without a marker is not expected; say so in the status line only when a marker exists elsewhere.
      if (report !== null && markerKeyForTag(key, buildMarkers(report)) !== null) say("map", key);
      return;
    }
    marker.scrollIntoView({ block: "center", behavior: behavior() });
    marker.focus({ preventScroll: true });
    apply();
    say("map", key);
  }

  app.addEventListener("pointerover", (event) => {
    hover = keyOf(event.target);
    apply();
  });
  app.addEventListener("pointerout", () => {
    hover = null;
    apply();
  });
  app.addEventListener("focusin", (event) => {
    focus = keyOf(event.target);
    apply();
    if (focus === null || !(event.target instanceof Element)) return;
    const node = event.target.closest<HTMLElement>(LINKABLE);
    if (node === null) return;
    if (node.dataset["markerKey"] !== undefined) {
      const hasTag = tagElement(focus) !== null;
      say(hasTag ? "tag" : "no-tag", focus);
    } else {
      say("map", focus);
    }
  });
  app.addEventListener("focusout", () => {
    focus = null;
    apply();
  });
  app.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const show = event.target.closest<HTMLElement>("[data-show-on-map]");
    if (show !== null) {
      const key = show.dataset["showOnMap"];
      if (key !== undefined) onShowOnMap(key);
      return;
    }
    const marker = event.target.closest<HTMLElement>("[data-marker-key]");
    const key = marker?.dataset["markerKey"];
    if (key !== undefined) onMarkerActivated(key);
  });

  return { apply, clear };
}
