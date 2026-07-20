/** Export law: project files round-trip through the hostile-import-safe
 *  parser, and every export carries exactly what the direction decided. */

import { describe, expect, it } from "vitest";

import { parseProjectFile, type PixelSource, type SharedBrief } from "@core/index.js";

import { composeDirection, runColour, runType, unrunTypeRecommendation } from "../src/wiring/engines";
import { buildCoreExports, buildEvidenceManifest, buildProjectFile, buildReadableSettings, serializeProject } from "../src/wiring/exports";

const syntheticSource = (): PixelSource => {
  const width = 24;
  const height = 24;
  const rgba = new Uint8ClampedArray(width * height * 4);
  const blocks = [
    [188, 78, 62],
    [43, 74, 216],
    [214, 61, 132],
    [247, 245, 239],
  ];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const block = blocks[(y % 2) * 2 + (x % 2)] ?? blocks[0]!;
      const index = (y * width + x) * 4;
      rgba[index] = block[0]!;
      rgba[index + 1] = block[1]!;
      rgba[index + 2] = block[2]!;
      rgba[index + 3] = 255;
    }
  }
  return { width, height, rgba, workingPixelHash: "d".repeat(64) };
};

const brief: SharedBrief = {
  route: "whole",
  artifactType: "agencyPitch",
  existingFontConstraint: "none",
  authoringTool: "powerpoint",
  handoffPaths: ["pdf", "editableFile"],
  viewingContexts: ["largeRoom"],
  density: "dense",
  contentNeeds: ["wordsImages", "numbers", "tables"],
  writingSystems: ["latin"],
  character: "quiet",
  baseMode: "light",
  sourceRelationship: "protect_one",
  dataNeed: "categorical",
  dataCount: 4,
};

const makeDirection = () => {
  const type = runType(brief)!;
  const colour = runColour(syntheticSource(), brief);
  return composeDirection({
    projectId: "ll-test-project",
    name: "Export law test",
    type,
    colour,
    previewCopy: { deckTitle: "A deck about export law" },
  });
};

describe("project file", () => {
  it("round-trips through serialize → parse without loss", () => {
    const direction = makeDirection();
    const project = buildProjectFile({
      direction,
      typeAnswers: {
        artifactType: "agencyPitch",
        existingFontConstraint: "none",
        authoringTool: "powerpoint",
        handoffPaths: ["pdf", "editableFile"],
        viewingContexts: ["largeRoom"],
        density: "dense",
        contentNeeds: ["wordsImages", "numbers", "tables"],
        writingSystems: ["latin"],
        character: "quiet",
      },
      colourAnswers: { delivery: "live_room", contentLoad: "dense", sourceRelationship: "protect_one", baseMode: "light", dataNeed: "categorical", dataCount: 4 },
      sourceFileHash: "a".repeat(64),
      workingPixelHash: "d".repeat(64),
      width: 1024,
      height: 768,
    });
    const parsed = parseProjectFile(serializeProject(project));
    expect(parsed.projectId).toBe("ll-test-project");
    expect(parsed.direction.name).toBe("Export law test");
    expect(parsed.source.relinkRequired).toBe(true);
    expect(parsed.privacy.containsImagePixels).toBe(false);
    expect(parsed.privacy.containsOriginalFilename).toBe(false);
    expect(parsed.privacy.containsPreviewCopy).toBe(true);
  });

  it("refuses hostile payloads: private pixel keys and prototype tricks", () => {
    const direction = makeDirection();
    const project = buildProjectFile({
      direction,
      typeAnswers: {
        artifactType: "other",
        existingFontConstraint: "unknown",
        authoringTool: "unknown",
        handoffPaths: ["pdf"],
        viewingContexts: ["mixedUnknown"],
        density: "varied",
        contentNeeds: ["wordsImages"],
        writingSystems: ["latin"],
        character: "unknown",
      },
      colourAnswers: {},
      sourceFileHash: null,
      workingPixelHash: null,
      width: null,
      height: null,
    });
    const json = serializeProject(project);
    expect(() => parseProjectFile(json.replace('"privacy"', '"rgba": "AAAA", "privacy"'))).toThrow(/private payload/);
    expect(() => parseProjectFile(json.replace('"schemaVersion": "1.0.0"', '"schemaVersion": "9.9.9"'))).toThrow(/schemaVersion/);
    expect(() => parseProjectFile(json.replace('"source": {', '"source": { "__proto__": {},'))).toThrow(/forbidden key/);
    expect(() => parseProjectFile("{ not json")).toThrow();
  });
});

describe("export contents", () => {
  it("CSS, text, and tokens carry the direction's actual decisions", () => {
    const direction = makeDirection();
    const exports = buildCoreExports(direction);
    const palette = direction.colour!.systems.find((system) => system.id === direction.selected.paletteSystemId)!;
    const type = direction.type.recommendations.find((item) => item.systemId === direction.selected.typeSystemId)!;

    expect(exports.css).toContain(palette.roles.background.hex);
    expect(exports.css).toContain(palette.roles.text.hex);
    expect(exports.plainText).toContain(type.name);
    expect(exports.plainText).toContain(palette.roles.accent_primary.hex);
    const tokens = JSON.parse(exports.tokens) as unknown;
    expect(JSON.stringify(tokens)).toContain(palette.roles.background.hex);
  });

  it("evidence manifest names licences, sources, and the working-pixel hash", () => {
    const direction = makeDirection();
    const manifest = buildEvidenceManifest(direction, "2026-02-09T00:00:00.000Z");
    expect(manifest).toContain("license");
    expect(manifest).toContain(direction.colour!.systems[0]!.determinism.workingPixelHash);
    expect(manifest).toContain("OFL-1.1");
    expect(manifest).toContain("exact browser records");
  });

  it("treats Type-only and Color-only take-aways as complete sovereign directions", () => {
    const colourBrief: SharedBrief = { ...brief, route: "colour", colourPath: "quick" };
    const colourDirection = composeDirection({
      projectId: "ll-colour-only",
      name: "Color-only law",
      type: unrunTypeRecommendation(),
      colour: runColour(syntheticSource(), colourBrief),
    });
    const colourText = buildReadableSettings(colourDirection, "colour");
    expect(colourText).toContain("COLOR DIRECTION");
    expect(colourText).toContain("complete Color direction");
    expect(colourText).not.toMatch(/No surviving type|Voice still needs proof|candidate demonstration/i);
    expect(colourText).not.toMatch(/\bcolour\b/i);
    expect(colourText).not.toContain("exact font files");

    const typeDirection = composeDirection({
      projectId: "ll-type-only",
      name: "Type-only law",
      type: runType({ ...brief, route: "type" })!,
      colour: null,
    });
    const typeText = buildReadableSettings(typeDirection, "type");
    expect(typeText).toContain("TYPE DIRECTION");
    expect(typeText).toContain("complete Type direction");
    expect(typeText).not.toMatch(/No colour source|Light still needs a source/i);
  });
});
