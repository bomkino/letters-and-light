/** Measured fit for the Preview Lab.
 *
 *  Character counts advise; rendered bounds decide. A hidden DOM rig renders
 *  each template at fixed geometry with the real (approximating) font stacks,
 *  then reads back occupied height per text zone. Nothing is truncated and
 *  nothing auto-shrinks: overflow stays visible and gets named. */

import { previewFieldSpecs } from "../wiring/catalog";
import type { PreviewTemplate } from "../wiring/types";

export type FitStatus = "comfortable" | "tight" | "does_not_fit" | "unknown";

export type FieldFit = {
  field: string;
  status: FitStatus;
  /** Rendered height ÷ zone height, when layout exists. */
  occupancy: number | null;
  advisory: string | null;
};

export type TemplateFit = {
  templateId: string;
  status: FitStatus;
  fields: FieldFit[];
};

export type RigStacks = { display: string; body: string; utility: string };

export const RIG_WIDTH = 960;
export const RIG_HEIGHT = 540;

type Zone = { width: number; height: number; size: number; lineHeight: number; role: keyof RigStacks };

/** Fixed geometry per template — identical across every comparison. */
const ZONES: Record<PreviewTemplate["id"], Record<string, Zone>> = {
  cover: {
    kicker: { width: 700, height: 40, size: 17, lineHeight: 1.3, role: "utility" },
    headline: { width: 740, height: 210, size: 56, lineHeight: 1.05, role: "display" },
    subheadline: { width: 640, height: 130, size: 24, lineHeight: 1.35, role: "body" },
    caption: { width: 400, height: 34, size: 15, lineHeight: 1.3, role: "utility" },
  },
  title_body: {
    kicker: { width: 700, height: 36, size: 16, lineHeight: 1.3, role: "utility" },
    headline: { width: 760, height: 130, size: 38, lineHeight: 1.1, role: "display" },
    body: { width: 700, height: 300, size: 20, lineHeight: 1.5, role: "body" },
    caption: { width: 420, height: 34, size: 15, lineHeight: 1.3, role: "utility" },
  },
  quote: {
    kicker: { width: 700, height: 36, size: 16, lineHeight: 1.3, role: "utility" },
    quote: { width: 760, height: 330, size: 40, lineHeight: 1.22, role: "display" },
    caption: { width: 420, height: 40, size: 16, lineHeight: 1.3, role: "utility" },
  },
  image_text: {
    kicker: { width: 380, height: 36, size: 15, lineHeight: 1.3, role: "utility" },
    headline: { width: 400, height: 170, size: 34, lineHeight: 1.1, role: "display" },
    body: { width: 400, height: 250, size: 18, lineHeight: 1.5, role: "body" },
    caption: { width: 380, height: 34, size: 14, lineHeight: 1.3, role: "utility" },
  },
  evidence_data: {
    headline: { width: 720, height: 110, size: 32, lineHeight: 1.1, role: "display" },
    dataLabel: { width: 300, height: 30, size: 15, lineHeight: 1.3, role: "utility" },
    dataValue: { width: 480, height: 130, size: 92, lineHeight: 1, role: "display" },
    body: { width: 660, height: 160, size: 18, lineHeight: 1.5, role: "body" },
    caption: { width: 420, height: 34, size: 14, lineHeight: 1.3, role: "utility" },
  },
};

const TIGHT_OCCUPANCY = 0.86;

/** Pure fit decision — rendered bounds decide, counts only advise. */
export const decideFit = (renderedHeight: number, zoneHeight: number, characters: number, field: string): FieldFit => {
  const spec = previewFieldSpecs[field];
  let advisory: string | null = null;
  if (spec && characters > spec.hardCharacters) {
    advisory = `${characters} characters is past the ${spec.hardCharacters}-character hard guidance for this field.`;
  } else if (spec && characters > spec.softCharacters) {
    advisory = `${characters} characters is past the ${spec.softCharacters}-character comfort guidance.`;
  }
  if (renderedHeight > zoneHeight) {
    return { field, status: "does_not_fit", occupancy: Number((renderedHeight / zoneHeight).toFixed(3)), advisory };
  }
  if (renderedHeight / zoneHeight > TIGHT_OCCUPANCY) {
    return { field, status: "tight", occupancy: Number((renderedHeight / zoneHeight).toFixed(3)), advisory };
  }
  return { field, status: "comfortable", occupancy: Number((renderedHeight / zoneHeight).toFixed(3)), advisory };
};

const worst = (statuses: FitStatus[]): FitStatus => {
  if (statuses.includes("does_not_fit")) return "does_not_fit";
  if (statuses.includes("tight")) return "tight";
  if (statuses.every((status) => status === "unknown")) return "unknown";
  return "comfortable";
};

export type RigMeasurer = (copy: Record<string, string>, template: PreviewTemplate, stacks: RigStacks) => TemplateFit;

/** DOM measurement. Where layout is unavailable (tests, SSR), every field
 *  honestly reports unknown rather than pretending a measurement happened. */
export const domRigMeasurer: RigMeasurer = (copy, template, stacks) => {
  if (typeof document === "undefined") {
    return { templateId: template.id, status: "unknown", fields: [] };
  }
  const zones = ZONES[template.id];
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = `position:fixed;left:-20000px;top:0;width:${RIG_WIDTH}px;height:${RIG_HEIGHT}px;visibility:hidden;pointer-events:none;`;
  document.body.appendChild(host);
  const fields: FieldFit[] = [];
  try {
    for (const [field, zone] of Object.entries(zones)) {
      const text = (copy[field] ?? "").trim();
      if (!text) continue;
      const block = document.createElement("div");
      block.style.cssText = `width:${zone.width}px;font-family:${stacks[zone.role]};font-size:${zone.size}px;line-height:${zone.lineHeight};overflow-wrap:break-word;white-space:pre-wrap;`;
      block.textContent = text;
      host.appendChild(block);
      const renderedHeight = block.getBoundingClientRect().height;
      host.removeChild(block);
      if (renderedHeight <= 0) {
        fields.push({ field, status: "unknown", occupancy: null, advisory: null });
        continue;
      }
      fields.push(decideFit(renderedHeight, zone.height, text.length, field));
    }
  } finally {
    host.remove();
  }
  return { templateId: template.id, status: worst(fields.map((field) => field.status)), fields };
};

export const fitLabel = (status: FitStatus): string =>
  status === "comfortable"
    ? "Comfortable"
    : status === "tight"
      ? "Tight"
      : status === "does_not_fit"
        ? "Does not fit"
        : "Unmeasured here";
