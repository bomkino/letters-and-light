import type { TypeAnswers } from "../domain.js";

export const TYPE_LIBRARY_ENGINE_VERSION = "letters-light-type-library/1.0.0";

export type TypeLibraryRole = "display" | "body" | "utility";
export type TypeLibraryLane = "reliable" | "characterful" | "editorial" | "wildcard" | "oneFamily";
export type TypeLibraryCharacter = "quiet" | "present" | "expressive";

export type TypeLibraryFile = {
  file: string;
  publicUrl: string;
  sourceUrl: string;
  sha256: string;
  bytes: number;
  style: string;
  weight: string;
  stretch: string | null;
  subset: string;
  unicodeRange: string | null;
};

export type TypeLibraryFont = {
  id: string;
  family: string;
  slug: string;
  shelfId: string;
  class: string;
  character: TypeLibraryCharacter;
  roles: TypeLibraryRole[];
  density: TypeAnswers["density"][];
  tones: string[];
  artifacts: string[];
  lanes: Array<TypeLibraryLane | "utility">;
  oneThingNotToDo: string;
  designer: string;
  category: string;
  dateAdded: string | null;
  subsets: string[];
  axes: Array<{ tag: string; min: number; max: number }>;
  hasItalic: boolean;
  weights: number[];
  license: { spdx: string; sourceUrl: string; localFile: string; sha256: string };
  source: {
    provider: string;
    metadataUrl: string;
    cssRequestUrl: string;
    upstreamRepository: string | null;
    upstreamCommit: string | null;
    providerCommit: string;
  };
  previewStatus: "exact_self_hosted";
  deckStatus: "requires_application_validation" | "limited" | "verified";
  files: TypeLibraryFile[];
};

export type TypeLibraryShelf = {
  id: string;
  label: string;
  description: string;
  class: string;
  character: TypeLibraryCharacter;
  roles: TypeLibraryRole[];
  density: TypeAnswers["density"][];
  tones: string[];
  artifacts: string[];
  lanes: Array<TypeLibraryLane | "utility">;
  oneThingNotToDo: string;
};

export type TypeLibraryDocument = {
  schemaVersion: "1.0.0";
  version: string;
  generatedOn: string;
  curationSha256: string;
  provider: { name: string; repository: string; commit: string; runtimeRequests: number };
  policy: {
    exactFilesRequiredForPreview: boolean;
    allowedLicenses: string[];
    remoteRuntimeFontsForbidden: boolean;
    recommendationDoesNotClaimDeckApplicationValidation: boolean;
  };
  shelves: TypeLibraryShelf[];
  fonts: TypeLibraryFont[];
};

export type TypeLibraryRequest = {
  answers: TypeAnswers;
  seed: number;
  locked: Record<TypeLibraryRole, string | null>;
  starredFontIds: string[];
  excludedFontIds: string[];
};

export type TypeDirection = {
  id: string;
  lane: TypeLibraryLane;
  laneLabel: string;
  name: string;
  roles: Record<TypeLibraryRole, TypeLibraryFont>;
  why: string[];
  cautions: string[];
  exactPreview: true;
  deckStatus: "requires_application_validation" | "limited" | "verified";
};

export type TypeLibraryRecommendation = {
  schemaVersion: "1.0.0";
  engineVersion: string;
  outcome: "directions" | "boundary" | "unsupported";
  headline: string;
  eligibleFontCount: number;
  directions: TypeDirection[];
  exclusions: Array<{ fontId: string; reason: string }>;
  truth: string[];
};

export type TypeStudioSnapshot = {
  seed: number;
  locked: Record<TypeLibraryRole, string | null>;
  starredFontIds: string[];
  excludedFontIds: string[];
  selectedDirectionId: string | null;
};

export type TypeStudioSession = {
  schemaVersion: "1.0.0";
  answers: TypeAnswers;
  current: TypeStudioSnapshot;
  past: TypeStudioSnapshot[];
  future: TypeStudioSnapshot[];
  recommendation: TypeLibraryRecommendation;
};

export type TypeStudioAction =
  | { type: "shuffle" }
  | { type: "toggleLock"; role: TypeLibraryRole; fontId: string | null }
  | { type: "toggleStarFont"; fontId: string }
  | { type: "excludeFont"; fontId: string }
  | { type: "restoreFont"; fontId: string }
  | { type: "selectDirection"; directionId: string }
  | { type: "undo" }
  | { type: "redo" };

export type TypeLibrarySearch = {
  query?: string;
  shelfId?: string;
  role?: TypeLibraryRole;
  character?: TypeLibraryCharacter;
  class?: string;
  tone?: string;
};

const laneLabels: Record<TypeLibraryLane, string> = {
  reliable: "Reliable without becoming invisible",
  characterful: "Character with reading discipline",
  editorial: "Editorial, not nostalgic",
  wildcard: "The useful wildcard",
  oneFamily: "One family, properly used",
};

const characterRank: Record<TypeLibraryCharacter, number> = { quiet: 0, present: 1, expressive: 2 };
const unique = <T>(items: readonly T[]): T[] => [...new Set(items)];
const stableHash = (value: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};
const compareTuple = (left: readonly number[], right: readonly number[]): number => {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (right[index] ?? 0) - (left[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
};

export const validateTypeLibraryDocument = (document: TypeLibraryDocument): TypeLibraryDocument => {
  if (document.schemaVersion !== "1.0.0") throw new Error("Unsupported type-library schema.");
  if (document.provider.runtimeRequests !== 0 || !document.policy.remoteRuntimeFontsForbidden) throw new Error("Type library must remain runtime-local.");
  if (document.fonts.length < 40) throw new Error("Type library is too small to claim meaningful choice.");
  if (new Set(document.fonts.map((font) => font.id)).size !== document.fonts.length) throw new Error("Duplicate type-library font IDs.");
  if (new Set(document.fonts.map((font) => font.family.toLocaleLowerCase())).size !== document.fonts.length) throw new Error("Duplicate type-library family names.");
  const shelfIds = new Set(document.shelves.map((shelf) => shelf.id));
  for (const font of document.fonts) {
    if (!shelfIds.has(font.shelfId)) throw new Error(`${font.id}: unknown shelf ${font.shelfId}.`);
    if (font.previewStatus !== "exact_self_hosted" || font.files.length === 0) throw new Error(`${font.id}: exact preview files are required.`);
    if (!document.policy.allowedLicenses.includes(font.license.spdx)) throw new Error(`${font.id}: licence ${font.license.spdx} is outside policy.`);
    if (!font.files.every((file) => /^[a-f0-9]{64}$/.test(file.sha256) && file.bytes > 0)) throw new Error(`${font.id}: invalid file lock.`);
  }
  return document;
};

const normalizeRequest = (request: Partial<TypeLibraryRequest> & Pick<TypeLibraryRequest, "answers">): TypeLibraryRequest => ({
  answers: request.answers,
  seed: Number.isSafeInteger(request.seed) && (request.seed ?? 0) >= 0 ? request.seed ?? 0 : 0,
  locked: {
    display: request.locked?.display ?? null,
    body: request.locked?.body ?? null,
    utility: request.locked?.utility ?? null,
  },
  starredFontIds: unique(request.starredFontIds ?? []),
  excludedFontIds: unique(request.excludedFontIds ?? []),
});

const eligibleFonts = (document: TypeLibraryDocument, request: TypeLibraryRequest) => {
  const exclusions: TypeLibraryRecommendation["exclusions"] = [];
  const requestedScripts = unique(request.answers.writingSystems);
  const fonts = document.fonts.filter((font) => {
    if (request.excludedFontIds.includes(font.id)) {
      exclusions.push({ fontId: font.id, reason: "Removed from this workspace by the user." });
      return false;
    }
    if (font.previewStatus !== "exact_self_hosted" || font.files.length === 0) {
      exclusions.push({ fontId: font.id, reason: "No exact self-hosted preview file." });
      return false;
    }
    if (requestedScripts.some((script) => script !== "latin")) {
      exclusions.push({ fontId: font.id, reason: "Current exact preview pack is Latin and Latin Extended only." });
      return false;
    }
    return true;
  });
  return { fonts, exclusions };
};

const laneClassFit = (font: TypeLibraryFont, lane: TypeLibraryLane, role: TypeLibraryRole): number => {
  if (role === "body") return ["sans", "serif", "sturdy-serif"].includes(font.class) ? 3 : font.roles.includes("body") ? 1 : 0;
  if (lane === "reliable") return ["sans", "sturdy-serif"].includes(font.class) ? 3 : 1;
  if (lane === "editorial") return ["serif", "display-serif", "sturdy-serif"].includes(font.class) ? 3 : 1;
  if (lane === "characterful") return ["display-serif", "condensed-sans", "sans"].includes(font.class) ? 3 : 1;
  if (lane === "wildcard") return ["display-serif", "condensed-sans"].includes(font.class) || font.shelfId === "geometric-voices" ? 3 : 1;
  return font.roles.includes("body") && font.roles.includes("display") ? 3 : 0;
};

const ranked = (
  fonts: readonly TypeLibraryFont[],
  request: TypeLibraryRequest,
  lane: TypeLibraryLane,
  role: TypeLibraryRole,
): TypeLibraryFont[] => {
  const locked = request.locked[role];
  const targetCharacter = request.answers.character === "unknown" ? (lane === "reliable" ? "quiet" : lane === "wildcard" ? "expressive" : "present") : request.answers.character;
  return fonts.filter((font) => font.roles.includes(role) && (!locked || font.id === locked)).sort((left, right) => {
    const tuple = (font: TypeLibraryFont): number[] => [
      locked && font.id === locked ? 1 : 0,
      font.lanes.includes(lane) ? 1 : 0,
      font.artifacts.includes(request.answers.artifactType) ? 1 : 0,
      laneClassFit(font, lane, role),
      font.density.includes(request.answers.density) ? 1 : 0,
      request.starredFontIds.includes(font.id) ? 1 : 0,
      3 - Math.abs(characterRank[font.character] - characterRank[targetCharacter]),
      stableHash(`${request.seed}:${lane}:${role}:${font.id}`) % 100000,
    ];
    return compareTuple(tuple(left), tuple(right)) || left.family.localeCompare(right.family);
  });
};

const needsDataUtility = (answers: TypeAnswers) => answers.contentNeeds.some((need) => ["chartsNumbers", "tablesFinance", "technicalNotation"].includes(need));
const familyRef = (font: TypeLibraryFont) => font.family;
const deckStatus = (fonts: readonly TypeLibraryFont[]): TypeDirection["deckStatus"] => {
  if (fonts.every((font) => font.deckStatus === "verified")) return "verified";
  if (fonts.every((font) => font.deckStatus === "verified" || font.deckStatus === "limited")) return "limited";
  return "requires_application_validation";
};

const pickDirection = (
  lane: TypeLibraryLane,
  fonts: readonly TypeLibraryFont[],
  request: TypeLibraryRequest,
  used: Set<string>,
): TypeDirection | null => {
  const displays = ranked(fonts, request, lane, "display");
  const bodies = ranked(fonts, request, lane, "body");
  const utilities = ranked(fonts, request, lane, "utility");
  for (const display of displays) {
    const bodyChoices = lane === "oneFamily" ? bodies.filter((font) => font.id === display.id) : bodies.filter((font) => font.id !== display.id);
    for (const body of bodyChoices) {
      const utility = needsDataUtility(request.answers)
        ? utilities.find((font) => font.shelfId === "data-utility") ?? utilities[0] ?? body
        : body.roles.includes("utility") ? body : utilities[0] ?? body;
      const signature = `${display.id}/${body.id}/${utility.id}`;
      if (used.has(signature)) continue;
      used.add(signature);
      const exact = unique([display, body, utility]);
      const why = [
        `${display.family} gives titles the ${display.tones.slice(0, 2).join(" and ")} voice this lane needs.`,
        display.id === body.id
          ? `${body.family} changes role by weight, size and spacing; one family keeps handoff simpler.`
          : `${body.family} carries the reading work without impersonating ${display.family}.`,
        utility.id === body.id
          ? `${body.family} also handles labels and numbers, keeping the system coherent.`
          : `${utility.family} takes labels and data so neither headline nor body face has to fake technical authority.`,
        `All ${exact.length} exact preview file${exact.length === 1 ? " is" : "s are"} self-hosted and credited.`,
      ];
      return {
        id: `${lane}-${stableHash(signature).toString(36)}`,
        lane,
        laneLabel: laneLabels[lane],
        name: display.id === body.id ? `${display.family}, one family` : `${display.family} with ${body.family}`,
        roles: { display, body, utility },
        why,
        cautions: unique([display.oneThingNotToDo, body.oneThingNotToDo]),
        exactPreview: true,
        deckStatus: deckStatus(exact),
      };
    }
  }
  return null;
};

export const recommendTypeDirections = (
  documentInput: TypeLibraryDocument,
  requestInput: Partial<TypeLibraryRequest> & Pick<TypeLibraryRequest, "answers">,
): TypeLibraryRecommendation => {
  const document = validateTypeLibraryDocument(documentInput);
  const request = normalizeRequest(requestInput);
  if (request.answers.existingFontConstraint === "mandatory") {
    const target = request.answers.mandatoryFontName?.trim().toLocaleLowerCase() ?? "";
    const match = document.fonts.find((font) => font.family.toLocaleLowerCase() === target || font.id.toLocaleLowerCase() === target);
    if (!match) {
      return {
        schemaVersion: "1.0.0",
        engineVersion: TYPE_LIBRARY_ENGINE_VERSION,
        outcome: "boundary",
        headline: "Brand rule first. This exact family is not in the playable library yet.",
        eligibleFontCount: 0,
        directions: [],
        exclusions: [],
        truth: ["A mandatory family outranks editorial taste.", "Acquire and audit exact files before generating a substitute recommendation."],
      };
    }
    for (const role of ["display", "body"] as const) if (!request.locked[role]) request.locked[role] = match.id;
  }
  const { fonts, exclusions } = eligibleFonts(document, request);
  if (fonts.length === 0) {
    return {
      schemaVersion: "1.0.0",
      engineVersion: TYPE_LIBRARY_ENGINE_VERSION,
      outcome: "unsupported",
      headline: "No exact-preview family survives these constraints yet.",
      eligibleFontCount: 0,
      directions: [],
      exclusions,
      truth: ["The current pack supports Latin and Latin Extended.", "A glyph in a binary is not fluent-human language validation."],
    };
  }
  const used = new Set<string>();
  const lanes: TypeLibraryLane[] = ["reliable", "characterful", "editorial", "wildcard", "oneFamily"];
  const directions = lanes.map((lane) => pickDirection(lane, fonts, request, used)).filter((item): item is TypeDirection => item !== null);
  return {
    schemaVersion: "1.0.0",
    engineVersion: TYPE_LIBRARY_ENGINE_VERSION,
    outcome: directions.length ? "directions" : "unsupported",
    headline: directions.length
      ? `${directions.length} genuinely different directions. Every letterform shown will be the real font.`
      : "No complete pairing survived without bluffing.",
    eligibleFontCount: fonts.length,
    directions,
    exclusions,
    truth: [
      "Exact self-hosted files prove browser letterforms, not PowerPoint, Keynote or Google Slides behaviour.",
      "Shuffle changes editorial order only. Licence and technical gates never move.",
      "Visible credits name the people who drew the type.",
    ],
  };
};

export const searchTypeLibrary = (documentInput: TypeLibraryDocument, search: TypeLibrarySearch = {}): TypeLibraryFont[] => {
  const document = validateTypeLibraryDocument(documentInput);
  const query = search.query?.trim().toLocaleLowerCase() ?? "";
  return document.fonts.filter((font) => {
    if (search.shelfId && font.shelfId !== search.shelfId) return false;
    if (search.role && !font.roles.includes(search.role)) return false;
    if (search.character && font.character !== search.character) return false;
    if (search.class && font.class !== search.class) return false;
    if (search.tone && !font.tones.includes(search.tone)) return false;
    if (!query) return true;
    return [font.family, font.designer, font.class, font.shelfId, ...font.tones].some((value) => value.toLocaleLowerCase().includes(query));
  }).sort((left, right) => left.family.localeCompare(right.family));
};

const requestFromSession = (session: TypeStudioSession): TypeLibraryRequest => ({
  answers: session.answers,
  seed: session.current.seed,
  locked: { ...session.current.locked },
  starredFontIds: [...session.current.starredFontIds],
  excludedFontIds: [...session.current.excludedFontIds],
});
const snapshot = (value: TypeStudioSnapshot): TypeStudioSnapshot => ({
  seed: value.seed,
  locked: { ...value.locked },
  starredFontIds: [...value.starredFontIds],
  excludedFontIds: [...value.excludedFontIds],
  selectedDirectionId: value.selectedDirectionId,
});

export const createTypeStudioSession = (
  document: TypeLibraryDocument,
  answers: TypeAnswers,
  seed = 0,
): TypeStudioSession => {
  const current: TypeStudioSnapshot = {
    seed: Number.isSafeInteger(seed) && seed >= 0 ? seed : 0,
    locked: { display: null, body: null, utility: null },
    starredFontIds: [],
    excludedFontIds: [],
    selectedDirectionId: null,
  };
  const recommendation = recommendTypeDirections(document, { answers, ...current });
  current.selectedDirectionId = recommendation.directions[0]?.id ?? null;
  return { schemaVersion: "1.0.0", answers, current, past: [], future: [], recommendation };
};

export const applyTypeStudioAction = (
  session: TypeStudioSession,
  action: TypeStudioAction,
  document: TypeLibraryDocument,
): TypeStudioSession => {
  validateTypeLibraryDocument(document);
  if (action.type === "undo") {
    const previous = session.past.at(-1);
    if (!previous) return session;
    const next = snapshot(previous);
    const provisional = { ...session, current: next, past: session.past.slice(0, -1), future: [snapshot(session.current), ...session.future] };
    const recommendation = recommendTypeDirections(document, requestFromSession(provisional));
    return { ...provisional, recommendation };
  }
  if (action.type === "redo") {
    const [future, ...rest] = session.future;
    if (!future) return session;
    const next = snapshot(future);
    const provisional = { ...session, current: next, past: [...session.past, snapshot(session.current)], future: rest };
    const recommendation = recommendTypeDirections(document, requestFromSession(provisional));
    return { ...provisional, recommendation };
  }
  const current = snapshot(session.current);
  if (action.type === "shuffle") current.seed += 1;
  if (action.type === "toggleLock") {
    if (action.fontId) {
      const font = document.fonts.find((candidate) => candidate.id === action.fontId);
      if (!font) throw new Error(`Unknown type-library font: ${action.fontId}.`);
      if (!font.roles.includes(action.role)) throw new Error(`${font.family} cannot be locked to the ${action.role} role.`);
      current.excludedFontIds = current.excludedFontIds.filter((id) => id !== action.fontId);
    }
    current.locked[action.role] = current.locked[action.role] === action.fontId ? null : action.fontId;
  }
  if (action.type === "toggleStarFont") {
    if (!document.fonts.some((font) => font.id === action.fontId)) throw new Error(`Unknown type-library font: ${action.fontId}.`);
    current.starredFontIds = current.starredFontIds.includes(action.fontId)
      ? current.starredFontIds.filter((id) => id !== action.fontId)
      : [...current.starredFontIds, action.fontId];
  }
  if (action.type === "excludeFont") {
    if (!document.fonts.some((font) => font.id === action.fontId)) throw new Error(`Unknown type-library font: ${action.fontId}.`);
    current.excludedFontIds = unique([...current.excludedFontIds, action.fontId]);
    for (const role of ["display", "body", "utility"] as const) if (current.locked[role] === action.fontId) current.locked[role] = null;
  }
  if (action.type === "restoreFont") {
    if (!document.fonts.some((font) => font.id === action.fontId)) throw new Error(`Unknown type-library font: ${action.fontId}.`);
    current.excludedFontIds = current.excludedFontIds.filter((id) => id !== action.fontId);
  }
  if (action.type === "selectDirection") {
    if (!session.recommendation.directions.some((direction) => direction.id === action.directionId)) {
      throw new Error(`Unknown direction in this studio state: ${action.directionId}.`);
    }
    current.selectedDirectionId = action.directionId;
  }
  const provisional: TypeStudioSession = {
    ...session,
    current,
    past: [...session.past, snapshot(session.current)].slice(-50),
    future: [],
  };
  const recommendation = recommendTypeDirections(document, requestFromSession(provisional));
  if (!recommendation.directions.some((direction) => direction.id === current.selectedDirectionId)) {
    current.selectedDirectionId = recommendation.directions[0]?.id ?? null;
  }
  return { ...provisional, current, recommendation };
};

export const TYPE_SPECIMEN_LIMITS = {
  headline: { min: 1, max: 72 },
  paragraph: { min: 1, max: 320 },
  quote: { min: 1, max: 180 },
  metric: { min: 1, max: 16 },
  label: { min: 1, max: 48 },
} as const;

export const TYPE_SPECIMEN_PRESETS = [
  { id: "decision", label: "Decision", headline: "Make the next decision easier.", paragraph: "Put the recommendation where the room can see it. Keep the evidence close enough to trust." },
  { id: "treatment", label: "Treatment", headline: "The light changes before the room does.", paragraph: "A film begins as atmosphere, rhythm and one stubborn image worth following." },
  { id: "numbers", label: "Numbers", headline: "Fewer slides. More signal.", paragraph: "37.5% less copy across the working deck · Q3 2026" },
  { id: "plainspoken", label: "Plainspoken", headline: "Here is the thing.", paragraph: "One thought per slide. Enough proof to believe it. Nothing dressed as strategy because it arrived in a rectangle." },
] as const;
