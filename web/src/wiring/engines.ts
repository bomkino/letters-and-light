/** The only engine seam the UI uses. Exact browser files are production UI
 * evidence; deck-application validation remains a separate, visible gate. */

import {
  buildColourSystems,
  buildDirectionCard,
  contrastRatio,
  copy,
  rgbToOklch,
  splitSharedBrief,
  type ColourAnswers,
  type ColourRecommendation,
  type DirectionCard,
  type PaletteRoleId,
  type PaletteRoles,
  type PaletteSystem,
  type PixelSource,
  type PreviewCopy,
  type RoleToken,
  type SharedBrief,
  type TypeCatalog,
  type TypeRecommendation,
  type Warning,
} from "@core/index.js";

import { profiles, samplePacks, typeCatalog } from "./catalog";
import { createExactTypeStudio, legacyTypeForSession } from "./typeLibrary";

/** Exact self-hosted browser recommendation. This is not a claim that a font
 * is installed or stable inside PowerPoint, Keynote, Slides, or another app. */
export const TYPE_MODE = "production" as const;

export type ColourRun = {
  systems: PaletteSystem[];
  companionSystems: PaletteSystem[];
  recommendation: ReturnType<typeof buildColourSystems>["recommendation"];
};

export const runType = (brief: SharedBrief): TypeRecommendation | null => {
  const session = createExactTypeStudio(brief);
  return session ? legacyTypeForSession(session) : null;
};

export const runColour = (source: PixelSource, brief: SharedBrief): ColourRun => {
  const { colour } = splitSharedBrief(brief);
  return buildColourSystems(source, colour);
};

export const colourAnswersFor = (brief: SharedBrief): ColourAnswers => splitSharedBrief(brief).colour;

export const typeAnswersFor = (brief: SharedBrief) => splitSharedBrief(brief).type;

/** Analysis output → the immutable engine run the store holds. */
export const typeColourRunFromOutput = (output: {
  systems: PaletteSystem[];
  companionSystems: PaletteSystem[];
  recommendation: ColourRecommendation;
}): ColourRun => ({
  systems: output.systems,
  companionSystems: output.companionSystems,
  recommendation: output.recommendation,
});

/** Sample copy: user's own words when supplied, otherwise an invented,
 *  labelled fixture pack chosen by artifact — never client copy, never lorem. */
export const previewCopyFor = (brief: SharedBrief): { copy: PreviewCopy; fixture: string | null } => {
  const own = brief.previewCopy ?? {};
  const hasOwn = Object.values(own).some((value) => typeof value === "string" && value.trim().length > 0);
  if (hasOwn) return { copy: own, fixture: null };
  const packIdByArtifact: Record<string, string> = {
    filmTvProject: "film",
    directorTreatment: "film",
    advertisingTreatment: "film",
    startupInvestor: "venture",
    agencyPitch: "project",
    companyCredentials: "project",
    salesPartnership: "venture",
    other: "plain",
  };
  const packId = packIdByArtifact[brief.artifactType ?? "other"] ?? "plain";
  const pack = samplePacks.find((item) => item.id === packId) ?? samplePacks.find((item) => item.id === "plain");
  const fields = pack?.fields ?? {};
  return {
    copy: {
      deckTitle: fields.headline,
      subtitle: fields.subheadline,
      slideTitle: fields.headline,
      body: fields.body,
      quote: fields.quote,
      attribution: fields.caption,
      metric: fields.dataValue,
      metricLabel: fields.dataLabel,
    },
    fixture: pack ? `${pack.name} — invented fixture copy` : null,
  };
};

export const composeDirection = (input: {
  projectId: string;
  name?: string;
  type: TypeRecommendation;
  colour: ColourRun | null;
  previewCopy?: PreviewCopy;
  selectedTypeSystemId?: string | null;
  workingPalette?: PaletteSystem | null;
  typeCatalogOverride?: TypeCatalog;
}): DirectionCard => {
  let colour: DirectionCard["colour"] = input.colour;
  if (colour && input.workingPalette) {
    colour = {
      ...colour,
      systems: [...colour.systems.filter((system) => system.id !== input.workingPalette?.id), input.workingPalette],
      recommendation: { ...colour.recommendation, recommendedSystemId: input.workingPalette.id },
    };
  }
  let type = input.type;
  if (input.selectedTypeSystemId && type.recommendations.some((item) => item.systemId === input.selectedTypeSystemId)) {
    const ordered = [
      ...type.recommendations.filter((item) => item.systemId === input.selectedTypeSystemId),
      ...type.recommendations.filter((item) => item.systemId !== input.selectedTypeSystemId),
    ];
    type = { ...type, recommendations: ordered };
  }
  return buildDirectionCard({
    projectId: input.projectId,
    ...(input.name !== undefined ? { name: input.name } : {}),
    type,
    typeCatalog: input.typeCatalogOverride ?? typeCatalog,
    colour,
    ...(input.previewCopy !== undefined ? { previewCopy: input.previewCopy } : {}),
  });
};

/* ---- Working-palette corrections ----------------------------------------
 * Human correction wins (constitution 16). The engine output stays immutable;
 * edits live as explicit operations whose provenance says who did what. */

export const ROLE_ORDER: PaletteRoleId[] = [
  "background",
  "surface",
  "text",
  "muted_text",
  "accent_primary",
  "accent_secondary",
  "on_accent",
  "line_or_rule",
];

const hexToRgbLocal = (hex: string) => ({
  r: parseInt(hex.slice(1, 3), 16),
  g: parseInt(hex.slice(3, 5), 16),
  b: parseInt(hex.slice(5, 7), 16),
});

const rgbToHexLocal = (rgb: { r: number; g: number; b: number }) =>
  `#${[rgb.r, rgb.g, rgb.b].map((channel) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, "0")).join("")}`.toUpperCase();

/** Recompute pair contrast + the two standing pair warnings after any user
 *  edit. This recomputes inspection only — engine values are never rewritten. */
export const reinspectRoles = (roles: PaletteRoles): PaletteRoles => {
  const entries = Object.entries(roles) as Array<[PaletteRoleId, RoleToken]>;
  const rebuilt = entries.map(([id, token]) => {
    const against: Record<string, number> = {};
    for (const [otherId, other] of entries) {
      if (otherId === id) continue;
      against[otherId] = Number(contrastRatio(token.rgb, other.rgb).toFixed(2));
    }
    const warnings: Warning[] = token.warnings.filter(
      (warning) => warning.code !== "TEXT_BACKGROUND_BELOW_4_5" && warning.code !== "MUTED_TEXT_NEEDS_CARE",
    );
    if (id === "text" && (against.background ?? 1) < 4.5) {
      warnings.push({ code: "TEXT_BACKGROUND_BELOW_4_5", severity: "blocking", message: "Body text/background pair is below 4.5:1." });
    }
    if (id === "muted_text" && (against.background ?? 1) < 3) {
      warnings.push({
        code: "MUTED_TEXT_NEEDS_CARE",
        severity: "caution",
        message: "Secondary text is weak against the main background; keep it large or revise.",
      });
    }
    return [id, { ...token, contrastAgainst: against, warnings }] as const;
  });
  return Object.fromEntries(rebuilt) as PaletteRoles;
};

const userAdjusted = (token: RoleToken, note: string): RoleToken => ({
  ...token,
  provenance: {
    ...token.provenance,
    kind: token.provenance.kind === "user_supplied" ? "user_supplied" : "adjusted",
    adjustments: [...token.provenance.adjustments, note],
  },
});

export const swapRoles = (roles: PaletteRoles, a: PaletteRoleId, b: PaletteRoleId): PaletteRoles => {
  const tokenA = roles[a];
  const tokenB = roles[b];
  if (!tokenA || !tokenB) return roles;
  const next = {
    ...roles,
    [a]: userAdjusted({ ...tokenB, id: `role-${a}`, role: a, reason: tokenA.reason, suggestedUses: tokenA.suggestedUses }, `You swapped it with ${b}.`),
    [b]: userAdjusted({ ...tokenA, id: `role-${b}`, role: b, reason: tokenB.reason, suggestedUses: tokenB.suggestedUses }, `You swapped it with ${a}.`),
  } as PaletteRoles;
  return reinspectRoles(next);
};

export const replaceRole = (roles: PaletteRoles, role: PaletteRoleId, hex: string, note: string): PaletteRoles => {
  const token = roles[role];
  if (!token || !/^#[0-9a-f]{6}$/i.test(hex)) return roles;
  const rgb = hexToRgbLocal(hex);
  const next = {
    ...roles,
    [role]: {
      ...token,
      hex: rgbToHexLocal(rgb),
      rgb,
      oklch: rgbToOklch(rgb),
      provenance: { kind: "user_supplied" as const, clusterId: null, sourceHex: null, adjustments: [...token.provenance.adjustments, note] },
    },
  } as PaletteRoles;
  return reinspectRoles(next);
};

const oklchFrom = (token: RoleToken) => ({ l: token.oklch.l, c: token.oklch.c, h: token.oklch.h ?? 0 });

const oklchToRgb = (oklch: { l: number; c: number; h: number }) => {
  // OKLCH → OKLab → linear sRGB → sRGB, kept local so user nudges stay exact math, not vibes.
  const { l, c, h } = oklch;
  const hr = (h * Math.PI) / 180;
  const a = Math.cos(hr) * c;
  const b = Math.sin(hr) * c;
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;
  const l3 = l_ ** 3;
  const m3 = m_ ** 3;
  const s3 = s_ ** 3;
  const linear = {
    r: +4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
    g: -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
    b: -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3,
  };
  const toSrgb = (value: number) => {
    const clamped = Math.max(0, Math.min(1, value));
    return Math.round((clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055) * 255);
  };
  return { r: toSrgb(linear.r), g: toSrgb(linear.g), b: toSrgb(linear.b) };
};

export const nudgeRole = (
  roles: PaletteRoles,
  role: PaletteRoleId,
  kind: "lighten" | "darken" | "moreColour" | "lessColour" | "vary",
  variationIndex = 0,
): PaletteRoles => {
  const token = roles[role];
  if (!token) return roles;
  const oklch = oklchFrom(token);
  const next =
    kind === "lighten"
      ? { ...oklch, l: Math.min(0.99, oklch.l + 0.06) }
      : kind === "darken"
        ? { ...oklch, l: Math.max(0.05, oklch.l - 0.06) }
        : kind === "moreColour"
          ? { ...oklch, c: Math.min(0.32, oklch.c * 1.25 + 0.01) }
          : kind === "lessColour"
            ? { ...oklch, c: Math.max(0, oklch.c * 0.75) }
            : { ...oklch, h: (oklch.h + 18 + variationIndex * 7) % 360, c: Math.min(0.32, oklch.c * 1.05) };
  const rgb = oklchToRgb(next);
  const label =
    kind === "lighten"
      ? "You lightened it one deliberate step."
      : kind === "darken"
        ? "You darkened it one deliberate step."
        : kind === "moreColour"
          ? "You asked for more color."
          : kind === "lessColour"
            ? "You asked for less color."
            : `Deterministic nearby variation ${variationIndex + 1}, derived from the same role.`;
  return reinspectRoles({ ...roles, [role]: userAdjusted({ ...token, hex: rgbToHexLocal(rgb), rgb, oklch: rgbToOklch(rgb) }, label) } as PaletteRoles);
};

export const contrastPair = (a: string, b: string): number => contrastRatio(hexToRgbLocal(a), hexToRgbLocal(b));

export const candidateBannerText = copy.result.candidateBanner;

/** Colour-only route: the type engine was never asked, and the card must say
 *  so. This is not an engine output — it is the honest "not run" record the
 *  composer turns into the H00 boundary warning. Never used to fake advice. */
export const unrunTypeRecommendation = (): TypeRecommendation => ({
  schemaVersion: "1.0.0",
  mode: TYPE_MODE,
  dataStatus: "candidate_only",
  outcome: "unsupported",
  headline: "Type was not part of this route.",
  recommendations: [],
  trace: {},
  exclusions: [],
  blockers: [],
  nextActions: ["Add the type route when the deck needs a voice, not only a light."],
});

/** True when a saved/composed direction carries the "type never ran" record
 *  rather than a real engine output. Used on project reopen. */
export const isUnrunType = (type: TypeRecommendation): boolean =>
  type.recommendations.length === 0 && type.headline === "Type was not part of this route.";

export const artifactLabel = (artifactType: string | undefined): string =>
  profiles.find((profile) => profile.id === artifactType)?.label ?? "a presentation";
