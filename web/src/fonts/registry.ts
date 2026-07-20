/** Legacy candidate registry + honest approximation stacks.
 *
 * Production Type bypasses this module and resolves the sealed self-hosted
 * library in `wiring/typeLibrary.ts`. This registry exists only for historical
 * project records whose old candidate IDs have no exact locked file. Their
 * target family names are never painted onto substitute outlines. */

import candidateFonts from "@data/legacy/type-set/data/candidate-fonts.json";

export type FaceStatus = "approximation" | "loading" | "ready" | "failed";

export type ApproxFace = {
  fontId: string;
  family: string;
  designer: string;
  status: FaceStatus;
  /** The system stack actually rendered. */
  stack: string;
  /** One honest line about what the approximation can and cannot show. */
  approximationNote: string;
};

type ManifestFont = { id: string; family: string; designer: string };

const manifest = (candidateFonts as unknown as { fonts: ManifestFont[] }).fonts;

const APPROXIMATIONS: Record<string, { stack: string; approximationNote: string }> = {
  sourceSans3: {
    stack: 'ui-sans-serif, system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    approximationNote: "A neutral humanist sans suggested by your system UI font — rhythm and color only, not Source Sans 3's outlines.",
  },
  sourceSerif4: {
    stack: 'ui-serif, "New York", "Iowan Old Style", Georgia, "Times New Roman", serif',
    approximationNote: "A transitional serif suggested by your system serif — proportion and weight only, not Source Serif 4's outlines.",
  },
  ibmPlexSans: {
    stack: 'ui-sans-serif, "Helvetica Neue", Arial, system-ui, sans-serif',
    approximationNote: "A grotesque-leaning system sans — stance only, not IBM Plex Sans's outlines.",
  },
  ibmPlexSerif: {
    stack: 'ui-serif, "New York", Georgia, "Times New Roman", serif',
    approximationNote: "A sturdy system serif — editorial temperature only, not IBM Plex Serif's outlines.",
  },
  bricolageGrotesque: {
    stack: 'ui-rounded, "Avenir Next", "Trebuchet MS", Verdana, sans-serif',
    approximationNote: "A rounder, heavier-leaning system sans for display energy only — nothing like Bricolage Grotesque's actual drawing.",
  },
  atkinsonHyperlegibleNext: {
    stack: 'ui-sans-serif, Verdana, Tahoma, "Segoe UI", sans-serif',
    approximationNote: "A wide, open system sans suggesting distinct letterforms — not Atkinson Hyperlegible Next's outlines.",
  },
  newsreader: {
    stack: 'ui-serif, "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif',
    approximationNote: "A bookish system serif for reading rhythm only — not Newsreader's outlines.",
  },
  fraunces: {
    stack: 'ui-serif, "Didot", "Bodoni MT", "Playfair Display", Georgia, serif',
    approximationNote: "A higher-contrast system serif for display softness only — not Fraunces' outlines or axes.",
  },
};

export const resolveFace = (fontId: string): ApproxFace => {
  const record = manifest.find((font) => font.id === fontId);
  const approximation = APPROXIMATIONS[fontId] ?? {
    stack: "ui-sans-serif, system-ui, sans-serif",
    approximationNote: "A plain system fallback — the candidate face is not in this build.",
  };
  return {
    fontId,
    family: record?.family ?? fontId,
    designer: record?.designer ?? "unknown",
    // This legacy manifest has no exact files. Production exact records never
    // reach this resolver, so the truthful legacy status stays approximation.
    status: "approximation",
    stack: approximation.stack,
    approximationNote: approximation.approximationNote,
  };
};

/** Kept for historical adapters that may receive an explicitly supplied file. */
export const loadExactFace = async (family: string, sourceUrl: string): Promise<FaceStatus> => {
  if (typeof FontFace === "undefined" || !("fonts" in document)) return "failed";
  try {
    const face = new FontFace(family, `url(${JSON.stringify(sourceUrl)})`);
    await face.load();
    document.fonts.add(face);
    return "ready";
  } catch {
    return "failed";
  }
};

export const roleStackFor = (fontId: string): string => resolveFace(fontId).stack;
