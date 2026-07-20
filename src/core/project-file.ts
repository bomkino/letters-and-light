import type { ColourAnswers, DirectionCard, TypeAnswers } from "../domain.js";
import { COLOUR_ENGINE_VERSION } from "./colour-engine.js";
import { HARMONY_ENGINE_VERSION } from "./harmony-engine.js";
import { TYPE_ENGINE_VERSION } from "./type-engine.js";

export type LettersLightProjectFile = {
  schemaVersion: "1.0.0";
  engineVersions: { type: string; colour: string; harmony: string };
  projectId: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  source: {
    sourceFileHash: string | null;
    workingPixelHash: string | null;
    width: number | null;
    height: number | null;
    relinkRequired: boolean;
  };
  answers: { type: TypeAnswers; colour: ColourAnswers };
  direction: DirectionCard;
  privacy: {
    containsImagePixels: false;
    containsOriginalFilename: false;
    containsPreviewCopy: boolean;
    localOnly: true;
  };
};

const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const PRIVATE_PAYLOAD_KEYS = new Set(["originalFilename", "imageBytes", "imagePixels", "rgba", "dataUrl", "objectUrl"]);
const TOP_LEVEL_KEYS = new Set(["schemaVersion", "engineVersions", "projectId", "revision", "createdAt", "updatedAt", "source", "answers", "direction", "privacy"]);

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const assertAllowedKeys = (record: Record<string, unknown>, allowed: ReadonlySet<string>, label: string): void => {
  const extra = Object.keys(record).find((key) => !allowed.has(key));
  if (extra) throw new Error(`${label} contains unknown key: ${extra}`);
};
function assertDateTime(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.trim() === "" || Number.isNaN(Date.parse(value))) throw new Error(`${label} must be an ISO date-time string.`);
}
function assertHash(value: unknown, label: string): asserts value is string | null {
  if (value !== null && (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value))) throw new Error(`${label} must be null or lowercase SHA-256.`);
}

const inspectTree = (value: unknown, depth = 0): void => {
  if (depth > 24) throw new Error("Project file exceeds maximum nesting depth.");
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    if (value.length > 100_000) throw new Error("Project file contains an oversized array.");
    value.forEach((item) => inspectTree(item, depth + 1));
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_KEYS.has(key)) throw new Error(`Project file contains forbidden key: ${key}`);
    if (PRIVATE_PAYLOAD_KEYS.has(key)) throw new Error(`Project file contains forbidden private payload key: ${key}`);
    inspectTree(child, depth + 1);
  }
};

const hasPreviewCopy = (direction: DirectionCard): boolean =>
  Object.values(direction.previewCopy).some((value) => typeof value === "string" && value.trim().length > 0);

export const createProjectFile = (input: {
  direction: DirectionCard;
  typeAnswers: TypeAnswers;
  colourAnswers: ColourAnswers;
  createdAt: string;
  updatedAt?: string;
  revision?: number;
  source?: {
    sourceFileHash?: string | null;
    workingPixelHash?: string | null;
    width?: number | null;
    height?: number | null;
  };
}): LettersLightProjectFile => {
  const sourceFileHash = input.source?.sourceFileHash ?? null;
  const workingPixelHash = input.source?.workingPixelHash ?? null;
  for (const [name, value] of Object.entries({ sourceFileHash, workingPixelHash })) {
    if (value !== null && !/^[0-9a-f]{64}$/.test(value)) throw new Error(`${name} must be null or lowercase SHA-256.`);
  }
  if (!input.direction.projectId.trim() || input.direction.projectId.length > 120) throw new Error("projectId must contain 1–120 characters.");
  if (!Number.isInteger(input.revision ?? 1) || (input.revision ?? 1) < 1) throw new Error("revision must be a positive integer.");
  assertDateTime(input.createdAt, "createdAt");
  assertDateTime(input.updatedAt ?? input.createdAt, "updatedAt");
  const width = input.source?.width ?? null;
  const height = input.source?.height ?? null;
  if ((width === null) !== (height === null)) throw new Error("Source width and height must both be present or both be null.");
  if (width !== null && (!Number.isInteger(width) || width < 1)) throw new Error("Source width must be a positive integer.");
  if (height !== null && (!Number.isInteger(height) || height < 1)) throw new Error("Source height must be a positive integer.");
  if (workingPixelHash !== null && width === null) throw new Error("Working pixel hash requires source dimensions.");
  const project: LettersLightProjectFile = {
    schemaVersion: "1.0.0",
    engineVersions: {
      type: TYPE_ENGINE_VERSION,
      colour: COLOUR_ENGINE_VERSION,
      harmony: HARMONY_ENGINE_VERSION,
    },
    projectId: input.direction.projectId,
    revision: input.revision ?? 1,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt ?? input.createdAt,
    source: {
      sourceFileHash,
      workingPixelHash,
      width,
      height,
      relinkRequired: workingPixelHash !== null,
    },
    answers: { type: input.typeAnswers, colour: input.colourAnswers },
    direction: input.direction,
    privacy: {
      containsImagePixels: false,
      containsOriginalFilename: false,
      containsPreviewCopy: hasPreviewCopy(input.direction),
      localOnly: true,
    },
  };
  inspectTree(project);
  return project;
};

export const serializeProjectFile = (project: LettersLightProjectFile): string => {
  inspectTree(project);
  return `${JSON.stringify(project, null, 2)}\n`;
};

export const parseProjectFile = (json: string): LettersLightProjectFile => {
  if (new TextEncoder().encode(json).byteLength > 2_000_000) throw new Error("Project file exceeds 2 MB import limit.");
  const parsed: unknown = JSON.parse(json);
  inspectTree(parsed);
  if (!isRecord(parsed)) throw new Error("Project file root must be an object.");
  const record = parsed;
  assertAllowedKeys(record, TOP_LEVEL_KEYS, "Project file root");
  if (record.schemaVersion !== "1.0.0") throw new Error("Unsupported project schemaVersion.");
  if (typeof record.projectId !== "string" || record.projectId.trim() === "" || record.projectId.length > 120) throw new Error("Project file needs a 1–120 character projectId.");
  if (!Number.isInteger(record.revision) || (record.revision as number) < 1) throw new Error("Project revision must be a positive integer.");
  assertDateTime(record.createdAt, "createdAt");
  assertDateTime(record.updatedAt, "updatedAt");
  if (!isRecord(record.engineVersions)) throw new Error("Project engineVersions must be an object.");
  assertAllowedKeys(record.engineVersions, new Set(["type", "colour", "harmony"]), "engineVersions");
  for (const key of ["type", "colour", "harmony"]) {
    const value = record.engineVersions[key];
    if (typeof value !== "string" || value.trim() === "") throw new Error(`engineVersions.${key} is required.`);
  }
  const privacy = isRecord(record.privacy) ? record.privacy : undefined;
  if (!privacy || privacy.containsImagePixels !== false || privacy.containsOriginalFilename !== false || privacy.localOnly !== true) {
    throw new Error("Project privacy contract is missing or unsafe.");
  }
  assertAllowedKeys(privacy, new Set(["containsImagePixels", "containsOriginalFilename", "containsPreviewCopy", "localOnly"]), "privacy");
  if (typeof privacy.containsPreviewCopy !== "boolean") throw new Error("privacy.containsPreviewCopy must be boolean.");
  const source = isRecord(record.source) ? record.source : undefined;
  if (!source) throw new Error("Project source must be an object.");
  assertAllowedKeys(source, new Set(["sourceFileHash", "workingPixelHash", "width", "height", "relinkRequired"]), "source");
  assertHash(source.sourceFileHash, "source.sourceFileHash");
  assertHash(source.workingPixelHash, "source.workingPixelHash");
  const width = source.width;
  const height = source.height;
  if ((width === null) !== (height === null)) throw new Error("Source width and height must both be present or both be null.");
  if (width !== null && (!Number.isInteger(width) || (width as number) < 1)) throw new Error("Source width must be a positive integer or null.");
  if (height !== null && (!Number.isInteger(height) || (height as number) < 1)) throw new Error("Source height must be a positive integer or null.");
  if (source.workingPixelHash !== null && width === null) throw new Error("Working pixel hash requires source dimensions.");
  if (source.relinkRequired !== (source.workingPixelHash !== null)) throw new Error("source.relinkRequired does not match working pixel state.");
  if (!isRecord(record.answers) || !isRecord(record.answers.type) || !isRecord(record.answers.colour)) throw new Error("Project answers need type and colour objects.");
  assertAllowedKeys(record.answers, new Set(["type", "colour"]), "answers");
  if (!isRecord(record.direction) || record.direction.schemaVersion !== "1.0.0" || record.direction.projectId !== record.projectId) {
    throw new Error("Project direction is missing, unsupported, or belongs to another projectId.");
  }
  if (!isRecord(record.direction.previewCopy)) throw new Error("Project direction needs previewCopy object.");
  if (privacy.containsPreviewCopy !== hasPreviewCopy(record.direction as unknown as DirectionCard)) {
    throw new Error("privacy.containsPreviewCopy does not match direction preview copy.");
  }
  return parsed as LettersLightProjectFile;
};
