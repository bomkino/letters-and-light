/** Question model. `pendingQuestionIds` from core flow owns what still needs
 *  asking (shared facts are asked once); this module only gives each pending id
 *  an honest editorial surface from copy.ts + legacy option labels. */

import { copy, pendingQuestionIds, type SharedBrief } from "@core/index.js";

import { colourQuestion, questionOptions } from "./catalog";
import type { QuestionOption } from "./types";

export type StudioQuestionKind = "single" | "multi" | "text" | "number";

export type StudioQuestion = {
  id: string;
  kind: StudioQuestionKind;
  title: string;
  note: string;
  options: QuestionOption[];
  /** Shared questions feed both engines; the interface says so plainly. */
  sharedWith: "type" | "colour" | "both";
  min?: number;
  max?: number;
};

const t = copy.questions;

const OPTION_LABELS: Record<string, Record<string, string>> = {
  writingSystems: {
    latin: "English, Spanish, French, and other Latin-script languages",
    greek: "Greek",
    cyrillic: "Russian, Ukrainian, and other Cyrillic languages",
    devanagari: "Hindi and other Devanagari languages",
    arabic: "Arabic",
    hebrew: "Hebrew",
    thai: "Thai",
    cjk: "Chinese, Japanese, or Korean",
    other: "Another language or writing system",
  },
  sourceRelationship: {
    reference_is_identity: "Stay close—this image is the world",
    protect_one: "Keep one important color sacred",
    starting_point: "Borrow the mood; let the colors move",
    surprise_me_carefully: "Surprise me, but make it make sense",
    unknown: "Use your best judgment",
  },
  baseMode: {
    light: "Mostly light slides",
    dark: "Mostly dark slides",
    both: "Give me light and dark versions",
    decide: "Let the image decide",
  },
};

const friendlyOptions = (id: string, options: QuestionOption[]): QuestionOption[] =>
  options.map((option) => ({ ...option, label: OPTION_LABELS[id]?.[option.id] ?? option.label }));

const DESCRIPTORS: Record<string, Omit<StudioQuestion, "options">> = {
  artifactType: { id: "artifactType", kind: "single", title: t.artifact.title, note: t.artifact.note, sharedWith: "type" },
  existingFontConstraint: {
    id: "existingFontConstraint",
    kind: "single",
    title: t.mandatoryFont.title,
    note: t.mandatoryFont.note,
    sharedWith: "type",
  },
  mandatoryFontName: {
    id: "mandatoryFontName",
    kind: "text",
    title: "What is the exact family name?",
    note: "A name is not an editable file, a license, a fallback, or an application test — but it is where an honest audit starts.",
    sharedWith: "type",
  },
  authoringTool: { id: "authoringTool", kind: "single", title: "Where will you build it?", note: t.toolAndHandoff.note, sharedWith: "type" },
  handoffPaths: { id: "handoffPaths", kind: "multi", title: "How must it leave your hands?", note: t.toolAndHandoff.note, sharedWith: "type" },
  viewingContexts: {
    id: "viewingContexts",
    kind: "multi",
    title: t.viewing.title,
    note: t.viewing.note,
    sharedWith: "both",
  },
  density: {
    id: "density",
    kind: "single",
    title: t.pressure.title,
    note: t.pressure.note,
    sharedWith: "both",
  },
  contentNeeds: { id: "contentNeeds", kind: "multi", title: t.content.title, note: t.content.note, sharedWith: "type" },
  writingSystems: { id: "writingSystems", kind: "multi", title: t.writingSystems.title, note: t.writingSystems.note, sharedWith: "type" },
  character: { id: "character", kind: "single", title: t.character.title, note: t.character.note, sharedWith: "type" },
  sourceRelationship: {
    id: "sourceRelationship",
    kind: "single",
    title: t.sourceRelationship.title,
    note: t.sourceRelationship.note,
    sharedWith: "colour",
  },
  baseMode: { id: "baseMode", kind: "single", title: t.baseMode.title, note: t.baseMode.note, sharedWith: "colour" },
  dataNeed: {
    id: "dataNeed",
    kind: "single",
    title: "Will color need to carry charts or comparisons?",
    note: "If a chart compares things, we will reserve colors that stay distinct. Complex data may still need its own chart palette.",
    sharedWith: "colour",
  },
  dataCount: {
    id: "dataCount",
    kind: "number",
    title: "How many series or steps?",
    note: "A count between 2 and 12 keeps the warning specific instead of vague.",
    sharedWith: "colour",
    min: 2,
    max: 12,
  },
  divergingMidpoint: {
    id: "divergingMidpoint",
    kind: "text",
    title: "What is the meaningful midpoint?",
    note: "Zero, parity, target, break-even — name the value the two arms diverge from.",
    sharedWith: "colour",
  },
};

/** Canonical asking order. Filtering by `pendingQuestionIds` keeps the
 *  shared-facts-once contract without the UI re-deriving flow logic. */
const ORDER = [
  "artifactType",
  "existingFontConstraint",
  "mandatoryFontName",
  "authoringTool",
  "handoffPaths",
  "viewingContexts",
  "density",
  "contentNeeds",
  "writingSystems",
  "character",
  "sourceRelationship",
  "baseMode",
  "dataNeed",
  "dataCount",
  "divergingMidpoint",
];

const colourOptions = (id: string): QuestionOption[] => {
  const question = colourQuestion(id as never);
  if (!question) return [];
  return question.options.map((optionId) => ({ id: optionId, label: question.labels[optionId] ?? optionId }));
};

export const studioQuestion = (id: string): StudioQuestion | null => {
  const descriptor = DESCRIPTORS[id];
  if (!descriptor) return null;
  const options =
    descriptor.sharedWith === "colour" || id === "dataNeed" || id === "baseMode" || id === "sourceRelationship"
      ? colourOptions(id)
      : questionOptions(id);
  return { ...descriptor, options: friendlyOptions(id, options) };
};

export const questionQueue = (brief: SharedBrief): StudioQuestion[] => {
  const pending = new Set(pendingQuestionIds(brief));
  return ORDER.filter((id) => pending.has(id))
    .map((id) => studioQuestion(id))
    .filter((question): question is StudioQuestion => question !== null);
};

/** Apply an answer to the shared brief immutably. */
export const answerBrief = (brief: SharedBrief, id: string, value: unknown): SharedBrief => {
  switch (id) {
    case "artifactType":
      return { ...brief, artifactType: value as string, ...(value === "other" ? {} : { otherDecision: undefined }) };
    case "otherDecision":
      return { ...brief, otherDecision: value as string };
    case "existingFontConstraint":
      return {
        ...brief,
        existingFontConstraint: value as SharedBrief["existingFontConstraint"],
        ...(value === "mandatory" ? {} : { mandatoryFontName: undefined }),
      };
    case "mandatoryFontName":
      return { ...brief, mandatoryFontName: value as string };
    case "authoringTool":
      return { ...brief, authoringTool: value as string };
    case "handoffPaths":
      return { ...brief, handoffPaths: value as string[] };
    case "viewingContexts":
      return { ...brief, viewingContexts: value as string[] };
    case "density":
      return { ...brief, density: value as SharedBrief["density"] };
    case "contentNeeds":
      return { ...brief, contentNeeds: value as string[] };
    case "writingSystems":
      return { ...brief, writingSystems: value as string[] };
    case "character":
      return { ...brief, character: value as SharedBrief["character"] };
    case "sourceRelationship":
      return { ...brief, sourceRelationship: value as SharedBrief["sourceRelationship"] };
    case "baseMode":
      return { ...brief, baseMode: value as SharedBrief["baseMode"] };
    case "dataNeed":
      return {
        ...brief,
        dataNeed: value as SharedBrief["dataNeed"],
        ...(value === "categorical" || value === "sequential" || value === "diverging" ? {} : { dataCount: undefined, divergingMidpoint: undefined }),
        ...(value === "diverging" ? {} : { divergingMidpoint: undefined }),
      };
    case "dataCount":
      return { ...brief, dataCount: value as number };
    case "divergingMidpoint":
      return { ...brief, divergingMidpoint: value as string };
    default:
      return brief;
  }
};

/** Current answer value for a question, for back/revise without loss. */
export const briefValue = (brief: SharedBrief, id: string): unknown => {
  const record = brief as unknown as Record<string, unknown>;
  return record[id];
};
