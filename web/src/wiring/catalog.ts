/** Data loading: legacy JSON imported once, adapted through core contracts.
 *  The frontend never duplicates engine data; it imports the exact files the
 *  engines were tested against. */

import { adaptLegacyTypeData, type TypeCatalog } from "@core/index.js";

import candidateSystems from "@data/legacy/type-set/data/candidate-systems.json";
import candidateFonts from "@data/legacy/type-set/data/candidate-fonts.json";
import questionBank from "@data/legacy/type-set/data/question-bank.json";
import fontStories from "@data/legacy/type-set/data/font-stories.json";
import collectionSpecimens from "@data/legacy/type-set/data/collection-specimens.json";
import artifactProfiles from "@data/legacy/type-set/data/artifact-profiles.json";
import colourRules from "@data/legacy/color-please/recommendation-rules.v1.json";
import previewTemplates from "@data/legacy/color-please/preview-templates.v1.json";

import type {
  ArtifactProfile,
  CollectionSpecimen,
  ColourCoreQuestion,
  ExportContentProfile,
  FontStory,
  PreviewFieldSpec,
  PreviewTemplate,
  QuestionOption,
  SamplePack,
  TypeQuestion,
} from "./types";

export const typeCatalog: TypeCatalog = adaptLegacyTypeData(
  candidateSystems as unknown as Parameters<typeof adaptLegacyTypeData>[0],
  candidateFonts as unknown as Parameters<typeof adaptLegacyTypeData>[1],
);

export type FontSource = {
  id: string;
  family: string;
  designer: string;
  sourceRepository: string;
  googleFontsDirectory: string;
  licence: { spdx: string; verified: boolean };
  sourceAudit: { productionFilesSelected: boolean; note: string };
};

export const fontSources = (candidateFonts as unknown as { fonts: FontSource[] }).fonts;
export const fontSourceFor = (fontId: string): FontSource | null => fontSources.find((font) => font.id === fontId) ?? null;
export const fontSourcesForSystem = (systemId: string): FontSource[] => {
  const system = systemById(systemId);
  if (!system) return [];
  return [...new Set(Object.values(system.roles).map((role) => role.fontId))]
    .map(fontSourceFor)
    .filter((font): font is FontSource => font !== null);
};

export const typeQuestions = (questionBank as { questions: TypeQuestion[] }).questions;

export const stories = (fontStories as unknown as { stories: FontStory[] }).stories;

export const specimens = (collectionSpecimens as unknown as { specimens: CollectionSpecimen[] }).specimens;

export const profiles = (artifactProfiles as unknown as { profiles: ArtifactProfile[] }).profiles;

const colourRulesDoc = colourRules as unknown as {
  quickPath: { actionLabel: string; resultStatus: string; allowWithoutAnsweredQuestions: boolean; discloseEveryDefault: boolean };
  coreQuestions: ColourCoreQuestion[];
};

export const colourQuickPath = colourRulesDoc.quickPath;
export const colourCoreQuestions = colourRulesDoc.coreQuestions;

const templatesDoc = previewTemplates as unknown as {
  interfaceRoleLabels: Record<string, { label: string; explanation: string }>;
  fields: Record<string, PreviewFieldSpec>;
  fitStatuses: Array<{ id: string; meaning: string }>;
  templates: PreviewTemplate[];
  samplePacks: SamplePack[];
  exportContentProfiles: Record<string, ExportContentProfile>;
};

export const roleLabels = templatesDoc.interfaceRoleLabels;
export const previewFieldSpecs = templatesDoc.fields;
export const fitStatusMeanings = templatesDoc.fitStatuses;
export const previewTemplateList = templatesDoc.templates;
export const samplePacks = templatesDoc.samplePacks;
export const exportContentProfiles = templatesDoc.exportContentProfiles;

export const systemById = (id: string) => typeCatalog.systems.find((system) => system.id === id) ?? null;

export const storyForFont = (fontId: string): FontStory | null => stories.find((story) => story.fontId === fontId) ?? null;

export const storiesForSystem = (systemId: string): FontStory[] => {
  const system = systemById(systemId);
  if (!system) return [];
  const fontIds = [...new Set(Object.values(system.roles).map((role) => role.fontId))];
  return fontIds.map((fontId) => storyForFont(fontId)).filter((story): story is FontStory => story !== null);
};

export const specimenForSystem = (systemId: string): CollectionSpecimen | null =>
  specimens.find((specimen) => specimen.systemId === systemId) ?? null;

export const profileFor = (artifactType: string | undefined): ArtifactProfile | null =>
  profiles.find((profile) => profile.id === artifactType) ?? null;

export const questionOptions = (questionId: string): QuestionOption[] =>
  typeQuestions.find((question) => question.id === questionId)?.options ?? [];

export const colourQuestion = (id: ColourCoreQuestion["id"]): ColourCoreQuestion | null =>
  colourCoreQuestions.find((question) => question.id === id) ?? null;
