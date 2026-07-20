/** Exact-font browser studio.
 *
 * The lock document is the authority: every face rendered here has a local,
 * hashed WOFF2 and OFL record. The adapter below exists only because the
 * relationship/export layer still consumes the stable DirectionCard contract.
 * It never upgrades browser proof into PowerPoint/Keynote/Slides proof. */

import {
  applyTypeStudioAction,
  createTypeStudioSession,
  splitSharedBrief,
  validateTypeLibraryDocument,
  type SharedBrief,
  type TypeAnswerRole,
  type TypeCatalog,
  type TypeDirection,
  type TypeLibraryDocument,
  type TypeLibraryFont,
  type TypeLibraryRole,
  type TypeRecommendation,
  type TypeRecommendationItem,
  type TypeStudioAction,
  type TypeStudioSession,
} from "@core/index.js";

import lockDocument from "@data/type-library/font-library.lock.json";

export const typeLibrary = validateTypeLibraryDocument(lockDocument as unknown as TypeLibraryDocument);

const roleForLane: Record<TypeDirection["lane"], TypeAnswerRole> = {
  reliable: "ourPick",
  characterful: "moreCharacter",
  editorial: "alternative",
  wildcard: "alternative",
  oneFamily: "quieter",
};

export const createExactTypeStudio = (brief: SharedBrief, seed = 0): TypeStudioSession | null => {
  const { type } = splitSharedBrief(brief);
  return type ? createTypeStudioSession(typeLibrary, type, seed) : null;
};

export const applyExactTypeAction = (session: TypeStudioSession, action: TypeStudioAction): TypeStudioSession =>
  applyTypeStudioAction(session, action, typeLibrary);

export const selectedTypeDirection = (session: TypeStudioSession | null): TypeDirection | null => {
  if (!session) return null;
  return session.recommendation.directions.find((direction) => direction.id === session.current.selectedDirectionId)
    ?? session.recommendation.directions[0]
    ?? null;
};

export const familyStack = (font: TypeLibraryFont | null | undefined, fallback: "serif" | "sans-serif" | "monospace" = "sans-serif") =>
  font ? `"${font.family.replaceAll('"', '\\"')}", ${fallback}` : fallback;

/** Resolve a saved recommendation back to the sealed local library. Project
 * files store stable font IDs, not font bytes or an ephemeral studio history;
 * this keeps a reopened exact direction visually exact without pretending its
 * old shuffle/undo state was preserved. */
export const exactFontById = (fontId: string): TypeLibraryFont | null =>
  typeLibrary.fonts.find((font) => font.id === fontId) ?? null;

export const exactFontsForRecommendation = (item: TypeRecommendationItem | null) => item ? ({
  display: exactFontById(item.roles.display.fontId),
  body: exactFontById(item.roles.body.fontId),
  utility: exactFontById(item.roles.utility.fontId),
}) : ({ display: null, body: null, utility: null });

export const stacksForRecommendation = (item: TypeRecommendationItem | null) => {
  const fonts = exactFontsForRecommendation(item);
  return {
    display: familyStack(fonts.display, fonts.display?.category === "SERIF" ? "serif" : "sans-serif"),
    body: familyStack(fonts.body, fonts.body?.category === "SERIF" ? "serif" : "sans-serif"),
    utility: familyStack(fonts.utility, fonts.utility?.class.includes("mono") ? "monospace" : "sans-serif"),
  };
};

export const stacksForDirection = (direction: TypeDirection | null) => ({
  display: familyStack(direction?.roles.display, direction?.roles.display.category === "SERIF" ? "serif" : "sans-serif"),
  body: familyStack(direction?.roles.body, direction?.roles.body.category === "SERIF" ? "serif" : "sans-serif"),
  utility: familyStack(direction?.roles.utility, direction?.roles.utility.class.includes("mono") ? "monospace" : "sans-serif"),
});

export const legacyTypeForSession = (session: TypeStudioSession): TypeRecommendation => {
  const recommendation = session.recommendation;
  const outcome = recommendation.outcome === "directions" ? "recommendation" : recommendation.outcome;
  return {
    schemaVersion: "1.0.0",
    mode: "production",
    dataStatus: "public_ready",
    outcome,
    headline: recommendation.headline,
    recommendations: recommendation.directions.map((direction) => ({
      systemId: direction.id,
      name: direction.name,
      answerRole: roleForLane[direction.lane],
      status: direction.deckStatus === "verified" ? "verified" : "limited",
      reason: direction.why.join(" "),
      caveats: [
        ...direction.cautions,
        ...(direction.deckStatus === "requires_application_validation"
          ? ["The browser preview is exact. Your deck application still needs a one-slide install and export check."]
          : []),
      ],
      roles: {
        display: { fontId: direction.roles.display.id },
        body: { fontId: direction.roles.body.id },
        utility: { fontId: direction.roles.utility.id },
      },
      oneThingNotToDo: direction.cautions[0] ?? direction.roles.display.oneThingNotToDo,
    })),
    trace: Object.fromEntries(
      recommendation.directions.map((direction) => [direction.id, [{
        gate: "G3" as const,
        result: direction.deckStatus === "verified" ? "pass" as const : "caveat" as const,
        reasonCode: "exactBrowserFilesLocked",
        reason: "Exact self-hosted browser files and OFL records are locked; deck-application behaviour remains separately scoped.",
        evidenceIds: [...new Set(Object.values(direction.roles).flatMap((font) => font.files.map((file) => file.sha256)))],
      }]]),
    ),
    exclusions: recommendation.exclusions.map((item) => ({ systemId: item.fontId, atGate: "library", reason: item.reason })),
    blockers: outcome === "recommendation" ? [] : recommendation.truth,
    nextActions: outcome === "recommendation"
      ? ["Compare the five directions in their real fonts.", "Lock anything worth keeping, then shuffle.", "Test the chosen family in the deck application before final handoff."]
      : ["Keep the real constraint.", "Add an audited exact family instead of inventing a substitute."],
  };
};

export const typeCatalogForSession = (session: TypeStudioSession | null): TypeCatalog => {
  if (!session) return { version: typeLibrary.version, systems: [], fonts: {} };
  const systems = session.recommendation.directions.map((direction, index) => ({
    id: direction.id,
    name: direction.name,
    status: direction.deckStatus === "verified" ? "verified" as const : "limited" as const,
    collectionOrder: index + 1,
    roles: {
      display: { fontId: direction.roles.display.id },
      body: { fontId: direction.roles.body.id },
      utility: { fontId: direction.roles.utility.id },
    },
    character: direction.roles.display.character,
    candidateStrengths: [
      ...(direction.roles.utility.class.includes("mono") ? ["tabularNumerals"] : []),
      ...(direction.roles.body.roles.includes("body") ? ["bodyEndurance"] : []),
      ...(direction.roles.display.id === direction.roles.body.id ? ["singleFamily"] : []),
    ],
    candidateArtifacts: direction.roles.display.artifacts,
    oneThingNotToDo: direction.cautions[0] ?? direction.roles.display.oneThingNotToDo,
    requiredValidation: ["application_install", "editable_handoff", "export_roundtrip"],
    supportedWritingSystems: ["latin"],
  }));
  const usedFonts = new Map<string, TypeLibraryFont>();
  for (const direction of session.recommendation.directions) {
    for (const font of Object.values(direction.roles)) usedFonts.set(font.id, font);
  }
  return {
    version: typeLibrary.version,
    systems,
    fonts: Object.fromEntries([...usedFonts.values()].map((font) => [font.id, {
      id: font.id,
      family: font.family,
      licenceVerified: font.license.spdx === "OFL-1.1",
      productionFilesSelected: true,
      inspectedFileId: font.files[0]?.sha256 ?? null,
      binaryCoverageNotHumanVerified: [],
      defaultNumerals: font.class.includes("mono") ? "tabular" : null,
    }])),
  };
};

export const roleLabel = (role: TypeLibraryRole) => role === "display" ? "Headlines" : role === "body" ? "Reading" : "Labels & data";
