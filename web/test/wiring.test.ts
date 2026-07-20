/** Engine wiring truth: the exact local library is law, the queue respects
 *  the chosen journey, boundary states are honest, and companions are built. */

import { describe, expect, it } from "vitest";

import type { PixelSource, SharedBrief } from "@core/index.js";

import { runColour, runType, TYPE_MODE, unrunTypeRecommendation } from "../src/wiring/engines";
import { questionQueue } from "../src/wiring/questions";
import { exactFontsForRecommendation, stacksForRecommendation, typeLibrary } from "../src/wiring/typeLibrary";

const syntheticSource = (): PixelSource => {
  // 24×24, four distinct colour blocks so clustering has real work to do.
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

const fullTypeBrief = (overrides: Partial<SharedBrief> = {}): SharedBrief => ({
  route: "type",
  artifactType: "filmTvProject",
  existingFontConstraint: "none",
  authoringTool: "figmaAdobe",
  handoffPaths: ["pdf"],
  viewingContexts: ["laptop"],
  density: "moderate",
  contentNeeds: ["wordsImages"],
  writingSystems: ["latin"],
  character: "present",
  ...overrides,
});

describe("type engine wiring", () => {
  it("runs against the sealed exact-font library", () => {
    const result = runType(fullTypeBrief());
    expect(result).not.toBeNull();
    expect(result!.mode).toBe("production");
    expect(TYPE_MODE).toBe("production");
    expect(result!.dataStatus).toBe("public_ready");
    expect(result!.recommendations).toHaveLength(5);
    const exactFontIds = new Set(typeLibrary.fonts.map((font) => font.id));
    for (const item of result!.recommendations) {
      expect(item.status).toBe("limited");
      for (const role of Object.values(item.roles)) expect(exactFontIds.has(role.fontId)).toBe(true);
    }
  });

  it("re-resolves a saved recommendation to the same exact local faces", () => {
    const item = runType(fullTypeBrief())!.recommendations[0]!;
    const fonts = exactFontsForRecommendation(item);
    const stacks = stacksForRecommendation(item);
    expect(fonts.display?.id).toBe(item.roles.display.fontId);
    expect(fonts.body?.id).toBe(item.roles.body.fontId);
    expect(fonts.utility?.id).toBe(item.roles.utility.fontId);
    expect(stacks.display).toContain(fonts.display!.family);
    expect(stacks.body).toContain(fonts.body!.family);
    expect(stacks.utility).toContain(fonts.utility!.family);
  });

  it("mandatory-but-unknown font is a boundary, not a guess", () => {
    const result = runType(fullTypeBrief({ existingFontConstraint: "mandatory", mandatoryFontName: "A Font We Never Heard Of" }));
    expect(result!.outcome).toBe("boundary");
    expect(result!.recommendations.length).toBe(0);
    expect(result!.nextActions.length).toBeGreaterThan(0);
  });

  it("unearned writing systems stop at the exact-library boundary", () => {
    const result = runType(fullTypeBrief({ writingSystems: ["latin", "devanagari", "arabic", "cjk"] }));
    expect(result!.outcome).toBe("unsupported");
    expect(result!.recommendations.length).toBe(0);
    expect(result!.exclusions.some((exclusion) => exclusion.atGate === "library")).toBe(true);
    expect(result!.blockers.length).toBeGreaterThan(0);
  });

  it("the unrun-type record is honest and never impersonates an engine output", () => {
    const unrun = unrunTypeRecommendation();
    expect(unrun.mode).toBe("production");
    expect(unrun.outcome).toBe("unsupported");
    expect(unrun.recommendations).toEqual([]);
    expect(unrun.headline).toContain("not part of this route");
  });
});

describe("question queue", () => {
  it("never asks the same fact twice on the whole route", () => {
    const queue = questionQueue({ route: "whole" });
    const ids = queue.map((question) => question.id);
    expect(new Set(ids).size).toBe(ids.length);
    // viewingContexts feeds both engines; it appears exactly once.
    expect(ids.filter((id) => id === "viewingContexts").length).toBeLessThanOrEqual(1);
  });

  it("quick colour path needs no interrogation", () => {
    const queue = questionQueue({ route: "colour", colourPath: "quick" });
    expect(queue.length).toBe(0);
  });

  it("the short Type ride stays short; the long ride earns its extra questions", () => {
    const quick = questionQueue({ route: "type", typePath: "quick", writingSystems: ["latin"] }).map((question) => question.id);
    const deep = questionQueue({ route: "type", typePath: "deep", writingSystems: ["latin"] }).map((question) => question.id);
    expect(quick).toEqual(["artifactType", "existingFontConstraint", "density", "character"]);
    expect(deep).toContain("authoringTool");
    expect(deep).toContain("handoffPaths");
    expect(deep).toContain("viewingContexts");
    expect(deep).toContain("contentNeeds");
    expect(deep.length).toBeGreaterThan(quick.length);
  });

  it("answered questions leave the queue", () => {
    const before = questionQueue({ route: "type" }).map((question) => question.id);
    const after = questionQueue(fullTypeBrief()).map((question) => question.id);
    expect(before.length).toBeGreaterThan(0);
    expect(after.length).toBe(0);
  });
});

describe("colour engine wiring", () => {
  it("builds light and dark companions as separate checked systems, never inversions", () => {
    const run = runColour(syntheticSource(), { route: "colour", colourPath: "guided", baseMode: "both" });
    expect(run.systems.length).toBeGreaterThan(0);
    expect(run.companionSystems.length).toBeGreaterThan(0);
    const primary = run.systems.find((system) => system.id === run.recommendation.recommendedSystemId)!;
    const companion = run.companionSystems.find((system) => system.mode !== primary.mode);
    expect(companion).toBeDefined();
    // An inversion would reuse the same role hexes flipped; a built companion
    // carries its own determinism record and its own role values.
    expect(companion!.determinism.engineVersion).toBe(primary.determinism.engineVersion);
    expect(companion!.roles.text.hex).not.toBe(primary.roles.text.hex);
    expect(companion!.roles.background.hex).not.toBe(primary.roles.background.hex);
  });

  it("is deterministic: same pixels, same answers, same output", () => {
    const brief: SharedBrief = { route: "colour", colourPath: "quick" };
    const first = runColour(syntheticSource(), brief);
    const second = runColour(syntheticSource(), brief);
    expect(first.recommendation.recommendedSystemId).toBe(second.recommendation.recommendedSystemId);
    expect(first.systems.map((system) => system.roles.background.hex)).toEqual(second.systems.map((system) => system.roles.background.hex));
  });
});
