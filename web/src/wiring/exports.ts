/** Export builders. Core owns text/CSS/JSON tokens; the frontend adds the
 *  usage guide, labelled PNG specimen, sources/evidence manifest, and project
 *  file. Every format discloses exactly what it contains. */

import {
  createProjectFile,
  exportCssCustomProperties,
  exportDesignTokens,
  exportPlainTextStyleSheet,
  serializeProjectFile,
  type ColourAnswers,
  type DirectionCard,
  type EntryRoute,
  type LettersLightProjectFile,
  type TypeAnswers,
} from "@core/index.js";

import candidateFonts from "@data/legacy/type-set/data/candidate-fonts.json";

import { roleLabels, stories } from "./catalog";
import { typeLibrary } from "./typeLibrary";

export const buildCoreExports = (direction: DirectionCard) => ({
  plainText: exportPlainTextStyleSheet(direction),
  css: exportCssCustomProperties(direction),
  tokens: exportDesignTokens(direction),
});

/** Primary take-away for a person making a deck. Unlike the technical core
 * export, this knows which sovereign route they chose and never calls a
 * Color-only or Type-only result incomplete for omitting the other tool. */
const publicSpelling = (value: string): string => value
  .replace(/\bColour\b/g, "Color")
  .replace(/\bcolour\b/g, "color")
  .replace(
    "One or more roles were corrected by you on the bench; engine originals remain intact below.",
    "Your adjustments are included here. The starting palette was not overwritten.",
  );

export const exportDisplayName = (direction: DirectionCard, route: EntryRoute): string => {
  if (direction.name.trim() && direction.name !== "Untitled direction") return direction.name;
  const palette = direction.colour?.systems.find((system) => system.id === direction.selected.paletteSystemId) ?? null;
  const type = direction.type.recommendations.find((item) => item.systemId === direction.selected.typeSystemId) ?? null;
  if (route === "colour") return palette?.name ?? "Color direction";
  if (route === "type") return type?.name ?? "Type direction";
  if (type && palette) return `${type.name} + ${palette.name}`;
  return type?.name ?? palette?.name ?? "Letters & Light direction";
};

export const buildReadableSettings = (direction: DirectionCard, route: EntryRoute): string => {
  const palette = direction.colour?.systems.find((system) => system.id === direction.selected.paletteSystemId) ?? null;
  const type = direction.type.recommendations.find((item) => item.systemId === direction.selected.typeSystemId) ?? null;
  const lines: string[] = [`LETTERS & LIGHT — ${exportDisplayName(direction, route)}`, ""];

  if (route !== "colour") {
    lines.push("TYPE DIRECTION");
    if (type) {
      lines.push(type.name, type.reason);
      for (const [role, label] of [["display", "Headlines"], ["body", "Body copy"], ["utility", "Labels and data"]] as const) {
        const fontId = type.roles[role].fontId;
        const record = fontRecordFor(fontId);
        lines.push(`${label}: ${record?.family ?? fontId}`);
      }
      lines.push(`Do not: ${type.oneThingNotToDo}`);
      const sourceIds = [...new Set(Object.values(type.roles).map((role) => role.fontId))];
      lines.push("", "OFFICIAL FONT SOURCES");
      for (const fontId of sourceIds) {
        const record = fontRecordFor(fontId);
        lines.push(`- ${record?.family ?? fontId}: ${record?.sourceRepository ?? "Source not recorded"}`);
      }
    } else {
      lines.push("No honest type recommendation yet.");
      for (const action of direction.type.nextActions) lines.push(`- ${action}`);
    }
    lines.push("");
  }

  if (route !== "type") {
    lines.push("COLOR DIRECTION");
    if (palette) {
      lines.push(`${palette.name} — ${palette.strategy.replace(/_/g, " ")}; ${palette.mode} slides`, "");
      for (const token of Object.values(palette.roles)) {
        lines.push(`${roleLabels[token.role]?.label ?? token.role}: ${token.hex} — ${publicSpelling(token.reason)}`);
      }
      if (palette.rationale.length > 0) lines.push("", "WHY THIS PALETTE", ...palette.rationale.map((line) => `- ${publicSpelling(line)}`));
    } else {
      lines.push("No image has been processed yet.");
    }
    lines.push("");
  }

  if (route === "whole") {
    lines.push("HOW TYPE AND COLOR SHARE THE WORK");
    if (direction.relationship.guidance.length > 0) lines.push(...direction.relationship.guidance.map((line) => `- ${publicSpelling(line)}`));
    else lines.push("- Type carries voice and reading rhythm. Color carries field, temperature and interruption.");
    if (direction.relationship.warnings.length > 0) lines.push("", "KEEP IN MIND", ...direction.relationship.warnings.map((line) => `- ${publicSpelling(line)}`));
    lines.push("");
  } else if (route === "type" && type) {
    lines.push("KEEP IN MIND", "- Font files are not included. Use the official sources above and test the exact files in the application that will build the deck.", "");
  } else if (route === "colour" && palette) {
    const cautions = [...palette.warnings.map((warning) => warning.message), ...(direction.colour?.recommendation.weaknesses ?? []).filter((item) => item.severity !== "note").map((item) => item.summary)];
    if (cautions.length > 0) lines.push("KEEP IN MIND", ...[...new Set(cautions)].map((line) => `- ${publicSpelling(line)}`), "");
  }

  lines.push(
    "ABOUT THIS FILE",
    route === "colour"
      ? "This is a complete Color direction. Typography was not part of this route, so this file makes no typography claim."
      : route === "type"
        ? "This is a complete Type direction. Color was not part of this route, so this file makes no palette claim."
        : "This is the combined Type and Color direction.",
    route === "colour"
      ? "The settings were made locally in your browser. Recheck contrast with real content and the screens or projectors that matter before final handoff."
      : route === "type"
        ? "The settings were made locally in your browser. Test the exact font files with real content before final handoff."
        : "The settings were made locally in your browser. Recheck contrast, exact font files and real content before final handoff.",
    "",
  );
  return lines.join("\n");
};

type FontRecord = { id: string; family: string; designer?: string; licence?: { spdx?: string }; sourceRepository?: string };

const fontRecords = (candidateFonts as unknown as { fonts: FontRecord[] }).fonts;
const fontRecordFor = (fontId: string): FontRecord | undefined => {
  const exact = typeLibrary.fonts.find((font) => font.id === fontId);
  if (exact) return {
    id: exact.id,
    family: exact.family,
    designer: exact.designer,
    licence: { spdx: exact.license.spdx },
    sourceRepository: exact.source.upstreamRepository ?? exact.source.metadataUrl,
  };
  return fontRecords.find((font) => font.id === fontId);
};

export const buildEvidenceManifest = (direction: DirectionCard, exportedAt: string): string => {
  const lines: string[] = [
    "# Letters & Light — sources and evidence manifest",
    "",
    `Project: ${direction.name} (${direction.projectId})`,
    `Exported: ${exportedAt}`,
    `Type truth: ${direction.truth.typeStatus}`,
    `Color truth: ${direction.truth.colourStatus}`,
    "",
    "## Type — exact browser records",
  ];
  for (const item of direction.type.recommendations) {
    lines.push(`- ${item.name} (${item.systemId}) — status: ${item.status}; role: ${item.answerRole}`);
    for (const fontId of [...new Set(Object.values(item.roles).map((role) => role.fontId))]) {
      const record = fontRecordFor(fontId);
      const story = stories.find((entry) => entry.fontId === fontId);
      lines.push(
        `  - ${record?.family ?? fontId}: designer ${record?.designer ?? "not recorded"}; license ${record?.licence?.spdx ?? "unknown"}; source ${record?.sourceRepository ?? "unknown"}${story ? `; story reviewed ${story.reviewedOn}` : ""}`,
      );
    }
  }
  lines.push("", "## Color — determinism");
  const palette = direction.colour?.systems.find((system) => system.id === direction.selected.paletteSystemId);
  if (palette) {
    lines.push(`- System: ${palette.name} (${palette.strategy}, ${palette.mode})`);
    lines.push(`- Engine: ${palette.determinism.engineVersion}`);
    lines.push(`- Working-pixel SHA-256: ${palette.determinism.workingPixelHash}`);
    lines.push(
      `- Crop: x ${palette.determinism.crop.x}, y ${palette.determinism.crop.y}, w ${palette.determinism.crop.width}, h ${palette.determinism.crop.height}`,
    );
  } else {
    lines.push("- No color source was processed.");
  }
  lines.push("", "## Claims and limits");
  for (const claim of direction.truth.claims) lines.push(`- ${claim}`);
  for (const limit of direction.truth.limits) lines.push(`- Limit: ${limit}`);
  lines.push(
    "",
    "## Art and copy",
    "- Interface art: Letters & Light v2 production family (pitch.dog internal allow-list).",
    "- Copy surface: src/content/copy.ts and the exact Type studio interface.",
    "- No font binaries are included in any export. Font IDs are manifest keys, not files.",
    "",
  );
  return lines.join("\n");
};

export const buildProjectFile = (input: {
  direction: DirectionCard;
  typeAnswers: TypeAnswers;
  colourAnswers: ColourAnswers;
  sourceFileHash: string | null;
  workingPixelHash: string | null;
  width: number | null;
  height: number | null;
  revision?: number;
}): LettersLightProjectFile =>
  createProjectFile({
    direction: input.direction,
    typeAnswers: input.typeAnswers,
    colourAnswers: input.colourAnswers,
    createdAt: new Date().toISOString(),
    ...(input.revision !== undefined ? { revision: input.revision } : {}),
    source: {
      sourceFileHash: input.sourceFileHash,
      workingPixelHash: input.workingPixelHash,
      width: input.width,
      height: input.height,
    },
  });

export const serializeProject = serializeProjectFile;

/** The only localStorage key this app may ever write — and only after the
 *  user explicitly asks us to remember the project on this device. */
export const REMEMBERED_PROJECT_KEY = "letters-light.remembered-project";

/** Labelled PNG specimen: palette strip + the same exact browser font stacks
 * used by the live preview. Application install/export remains a separate gate. */
export const renderSpecimenPng = async (input: {
  direction: DirectionCard;
  route: EntryRoute;
  displayStack: string;
  bodyStack: string;
}): Promise<Blob> => {
  const { direction } = input;
  const palette = direction.colour?.systems.find((system) => system.id === direction.selected.paletteSystemId) ?? null;
  const type = direction.type.recommendations.find((item) => item.systemId === direction.selected.typeSystemId) ?? null;
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 675;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas unavailable for the specimen export.");

  const background = palette?.roles.background?.hex ?? "#f7f5ef";
  const ink = palette?.roles.text?.hex ?? "#232327";
  const muted = palette?.roles.muted_text?.hex ?? "#55555c";
  const accent = palette?.roles.accent_primary?.hex ?? "#2b4ad8";

  context.fillStyle = background;
  context.fillRect(0, 0, 1200, 675);

  context.fillStyle = muted;
  context.font = "600 20px ui-monospace, Menlo, monospace";
  const specimenLabel = input.route === "colour" ? "LETTERS & LIGHT — COLOR DIRECTION" : input.route === "type" ? "LETTERS & LIGHT — EXACT BROWSER TYPE PREVIEW" : "LETTERS & LIGHT — FULL LOOK PREVIEW";
  context.fillText(specimenLabel, 64, 74);

  context.fillStyle = ink;
  const title = input.route === "colour" ? exportDisplayName(direction, input.route) : direction.previewCopy.deckTitle ?? exportDisplayName(direction, input.route);
  const titleSize = title.length > 56 ? 42 : title.length > 34 ? 48 : 60;
  context.font = `560 ${titleSize}px ${input.displayStack}`;
  const words = title.trim().split(/\s+/);
  const titleLines: string[] = [];
  let line = "";
  for (const word of words) {
    if (context.measureText(word).width > 1000) {
      if (line) {
        titleLines.push(line);
        line = "";
      }
      let chunk = "";
      for (const character of word) {
        if (chunk && context.measureText(`${chunk}${character}`).width > 1000) {
          titleLines.push(chunk);
          chunk = character;
        } else {
          chunk += character;
        }
      }
      line = chunk;
      continue;
    }
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width <= 1000 || !line) {
      line = candidate;
    } else {
      titleLines.push(line);
      line = word;
    }
  }
  if (line) titleLines.push(line);
  const lineHeight = Math.round(titleSize * 1.08);
  titleLines.forEach((titleLine, index) => context.fillText(titleLine, 64, 150 + index * lineHeight));

  context.fillStyle = accent;
  const accentY = 160 + titleLines.length * lineHeight;
  context.fillRect(64, accentY, 180, 5);

  context.fillStyle = ink;
  context.font = `400 24px ${input.bodyStack}`;
  const subtitle = input.route === "colour"
    ? "A working palette from your image, with one clear job for every color."
    : input.route === "type"
      ? "A type direction in the exact browser font files. Test the deck application separately."
      : direction.previewCopy.subtitle ?? direction.relationship.headline;
  context.fillText(subtitle, 64, accentY + 55, 1000);

  if (palette) {
    const entries = Object.entries(palette.roles);
    const swatchWidth = Math.floor((1200 - 128) / Math.max(entries.length, 1));
    const pngRoleLabels: Record<string, string> = {
      background: "Background",
      surface: "Panel",
      text: "Body text",
      muted_text: "Secondary",
      accent_primary: "Accent",
      accent_secondary: "2nd accent",
      on_accent: "On accent",
      line_or_rule: "Rules",
    };
    entries.forEach(([role, token], index) => {
      const x = 64 + index * swatchWidth;
      context.fillStyle = token.hex;
      context.fillRect(x, 380, swatchWidth - 12, 120);
      context.fillStyle = ink;
      context.font = "600 15px ui-sans-serif, system-ui, sans-serif";
      context.fillText(pngRoleLabels[role] ?? roleLabels[role]?.label ?? role.replace(/_/g, " "), x, 530, swatchWidth - 12);
      context.fillStyle = muted;
      context.font = "15px ui-monospace, Menlo, monospace";
      context.fillText(token.hex, x, 555, swatchWidth - 12);
    });
  }

  context.fillStyle = muted;
  context.font = "400 16px ui-sans-serif, system-ui, sans-serif";
  const typeLine = input.route === "colour"
    ? "Color-only direction; no typography claim is made."
    : type
      ? `Type: ${type.name} — rendered with the exact browser files; deck application proof is not included.`
      : "Type needs more information before an honest direction is possible.";
  context.fillText(typeLine, 64, 620);

  // Repaint the small title last so a long display line can never obscure it.
  context.fillStyle = muted;
  context.font = "600 20px ui-monospace, Menlo, monospace";
  context.fillText(specimenLabel, 64, 74);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("PNG encoding failed."))), "image/png");
  });
};

/** Download helper: object URL created and revoked around a single click. */
export const downloadBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const downloadText = (text: string, filename: string, mime = "text/plain"): void => {
  downloadBlob(new Blob([text], { type: `${mime};charset=utf-8` }), filename);
};

export const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};
