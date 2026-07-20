/** Legacy data shapes consumed by the frontend. Engines stay the authority;
 *  these types describe data files the UI reads for labels, stories, specimens. */

export type QuestionOption = { id: string; label: string };

export type TypeQuestion = {
  id: string;
  prompt: string;
  selection: "single" | "multi" | "text" | "structuredText";
  required: boolean;
  options?: QuestionOption[];
  fields?: string[];
  showWhen?: Record<string, string[]>;
};

export type FontStory = {
  id: string;
  fontId: string;
  creditLine: string;
  people: Array<{ name: string; role: string }>;
  origin: string;
  pitchDogView: string;
  whyHere: string;
  limits: string;
  primarySources: Array<{ label: string; url: string }>;
  supportUrl: string;
  reviewedOn: string;
};

export type CollectionSpecimen = {
  id: string;
  systemId: string;
  title: string;
  body: string;
  difficultLine: string;
  metric: string;
  metricLabel: string;
};

export type ArtifactProfile = {
  id: string;
  label: string;
  defaultCharacter: string;
  commonViewingContexts: string[];
  commonHandoffPaths: string[];
  preferredCharacteristics: string[];
  hazards: string[];
  specimenPack: string;
};

export type ColourCoreQuestion = {
  id: "delivery" | "contentLoad" | "sourceRelationship" | "baseMode" | "dataNeed";
  prompt: string;
  default: string;
  options: string[];
  labels: Record<string, string>;
};

export type PreviewFieldSpec = { softCharacters: number; hardCharacters: number; multiline: boolean };

export type PreviewTemplate = {
  id: "cover" | "title_body" | "quote" | "image_text" | "evidence_data";
  name: string;
  job: string;
  layout: string;
  requiredFields: string[];
  optionalFields: string[];
  imageSlots: number;
  rolesUsed: string[];
  checks: string[];
};

export type SamplePack = {
  id: string;
  name: string;
  fields: Record<string, string>;
};

export type ExportContentProfile = {
  imagePixels: string;
  userCopy: string;
  sourceFingerprints: boolean;
  originalFilename: boolean;
};
