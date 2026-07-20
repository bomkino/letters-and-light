/** Store law: corrections are explicit ops over immutable engine output,
 *  locks survive re-runs, undo/redo is exact, and colour-only routes still
 *  compose an honest direction. */

import { describe, expect, it } from "vitest";

import type { PixelSource, SharedBrief } from "@core/index.js";

import {
  getInitialStateForTests,
  reduceForTests,
  selectDirection,
  selectWorkingPalette,
  type StudioState,
} from "../src/app/store";
import { runColour, runType } from "../src/wiring/engines";
import { createExactTypeStudio, selectedTypeDirection } from "../src/wiring/typeLibrary";

const reducer = reduceForTests;
const initialState = getInitialStateForTests;

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

const typeBrief: SharedBrief = {
  route: "whole",
  artifactType: "startupInvestor",
  existingFontConstraint: "none",
  authoringTool: "googleSlides",
  handoffPaths: ["editableFile"],
  viewingContexts: ["laptop", "phone"],
  density: "moderate",
  contentNeeds: ["wordsImages", "numbers"],
  writingSystems: ["latin"],
  character: "quiet",
  baseMode: "decide",
  sourceRelationship: "starting_point",
  dataNeed: "none",
};

const withColour = (state: StudioState): StudioState =>
  reducer(state, { type: "colourReady", run: runColour(syntheticSource(), typeBrief) });

const withType = (state: StudioState): StudioState =>
  reducer(state, { type: "typeReady", result: runType(typeBrief)! });

describe("human defaults", () => {
  it("starts the type route ready for English and other Latin-script decks", () => {
    const state = reducer(initialState(), { type: "enter", entry: "type" });
    expect(state.brief.writingSystems).toEqual(["latin"]);
    expect(state.step).toBe("path");
  });
});

describe("exact Type studio reducer", () => {
  it("keeps locks and stars through shuffle, with exact undo and redo", () => {
    const session = createExactTypeStudio({ ...typeBrief, route: "type", typePath: "deep" });
    expect(session).not.toBeNull();
    let state = reducer(reducer(initialState(), { type: "enter", entry: "type" }), { type: "typeStudioReady", session: session! });
    const first = selectedTypeDirection(state.typeStudio)!;
    const displayId = first.roles.display.id;

    state = reducer(state, { type: "typeStudioAction", action: { type: "toggleLock", role: "display", fontId: displayId } });
    state = reducer(state, { type: "typeStudioAction", action: { type: "toggleStarFont", fontId: displayId } });
    const beforeShuffle = state.typeStudio!.current;
    state = reducer(state, { type: "typeStudioAction", action: { type: "shuffle" } });

    expect(state.typeStudio!.current.seed).toBe(beforeShuffle.seed + 1);
    expect(state.typeStudio!.current.locked.display).toBe(displayId);
    expect(state.typeStudio!.current.starredFontIds).toContain(displayId);
    expect(state.selectedTypeId).toBe(state.typeStudio!.current.selectedDirectionId);

    state = reducer(state, { type: "typeStudioAction", action: { type: "undo" } });
    expect(state.typeStudio!.current).toEqual(beforeShuffle);
    state = reducer(state, { type: "typeStudioAction", action: { type: "redo" } });
    expect(state.typeStudio!.current.seed).toBe(beforeShuffle.seed + 1);
  });
});

describe("correction bench reducer", () => {
  it("stars a color world and shuffles to another without losing the star", () => {
    let state = withColour(reducer(initialState(), { type: "enter", entry: "colour", colourPath: "quick" }));
    const firstId = state.selectedPaletteId!;
    state = reducer(state, { type: "togglePaletteStar", systemId: firstId });
    state = reducer(state, { type: "shufflePalettes" });
    expect(state.starredPaletteIds).toContain(firstId);
    expect(state.selectedPaletteId).not.toBe(firstId);
    expect(state.paletteSeed).toBe(1);
  });

  it("applies, undoes, and redoes ops exactly", () => {
    let state = withColour(reducer(initialState(), { type: "enter", entry: "whole" }));
    const base = selectWorkingPalette(state)!;
    state = reducer(state, { type: "applyOp", op: { kind: "nudge", role: "accent_primary", nudge: "lighten" } });
    const nudged = selectWorkingPalette(state)!;
    expect(nudged.id).toContain("--corrected");
    expect(nudged.roles.accent_primary.hex).not.toBe(base.roles.accent_primary.hex);
    expect(nudged.roles.accent_primary.provenance.adjustments.join(" ")).toContain("lightened");

    state = reducer(state, { type: "undo" });
    expect(selectWorkingPalette(state)!.roles.accent_primary.hex).toBe(base.roles.accent_primary.hex);
    state = reducer(state, { type: "redo" });
    expect(selectWorkingPalette(state)!.roles.accent_primary.hex).toBe(nudged.roles.accent_primary.hex);
  });

  it("locked roles refuse edits and locks survive a palette re-run", () => {
    let state = withColour(reducer(initialState(), { type: "enter", entry: "whole" }));
    state = reducer(state, { type: "applyOp", op: { kind: "lock", role: "background" } });
    const before = selectWorkingPalette(state)!;
    state = reducer(state, { type: "applyOp", op: { kind: "replace", role: "background", hex: "#102030" } });
    expect(selectWorkingPalette(state)!.roles.background.hex).toBe(before.roles.background.hex);

    // Switching base restarts ops but keeps the lock list.
    const otherId = state.colourRun!.systems.find((system) => system.id !== state.selectedPaletteId)!.id;
    state = reducer(state, { type: "selectPalette", systemId: otherId });
    expect(state.correction!.ops.length).toBe(0);
    expect(state.correction!.locked).toContain("background");
    state = reducer(state, { type: "applyOp", op: { kind: "replace", role: "background", hex: "#102030" } });
    expect(selectWorkingPalette(state)!.roles.background.hex).not.toBe("#102030");
  });

  it("swaps background and panel as one explicit op with provenance", () => {
    let state = withColour(reducer(initialState(), { type: "enter", entry: "whole" }));
    const base = selectWorkingPalette(state)!;
    state = reducer(state, { type: "applyOp", op: { kind: "swap", a: "background", b: "surface" } });
    const swapped = selectWorkingPalette(state)!;
    expect(swapped.roles.background.hex).toBe(base.roles.surface.hex);
    expect(swapped.roles.surface.hex).toBe(base.roles.background.hex);
    expect(swapped.roles.background.provenance.adjustments.join(" ")).toContain("swapped");
  });
});

describe("engine-output immutability", () => {
  it("corrections never mutate the engine run; originals stay intact", () => {
    let state = withType(withColour(reducer(initialState(), { type: "enter", entry: "whole" })));
    const originalHexes = state.colourRun!.systems.map((system) => [system.id, system.roles.background.hex] as const);
    state = reducer(state, { type: "applyOp", op: { kind: "replace", role: "background", hex: "#123456" } });
    const direction = selectDirection(state);
    expect(direction).not.toBeNull();
    // Engine systems untouched.
    expect(state.colourRun!.systems.map((system) => [system.id, system.roles.background.hex] as const)).toEqual(originalHexes);
    // The direction composes the working palette separately and says so.
    const working = selectWorkingPalette(state)!;
    expect(working.roles.background.hex).toBe("#123456");
    expect(working.rationale.join(" ")).toContain("corrected by you");
  });
});

describe("colour-only route", () => {
  it("composes an honest direction with the unrun-type record — no fabricated type advice", () => {
    let state = reducer(initialState(), { type: "enter", entry: "colour", colourPath: "quick" });
    state = reducer(state, { type: "colourReady", run: runColour(syntheticSource(), { route: "colour", colourPath: "quick" }) });
    expect(state.typeResult).toBeNull();
    const direction = selectDirection(state);
    expect(direction).not.toBeNull();
    expect(direction!.type.recommendations).toEqual([]);
    expect(direction!.type.headline).toContain("not part of this route");
    expect(direction!.relationship.rulesFired).toContain("H00_TYPE_BOUNDARY");
    expect(direction!.selected.paletteSystemId).not.toBeNull();
    expect(direction!.colour).not.toBeNull();
  });
});

describe("route extension", () => {
  it("adding colour to a finished type run keeps every answer and result", () => {
    let state = withType(reducer(initialState(), { type: "enter", entry: "type" }));
    state = reducer(state, { type: "setBrief", brief: typeBrief });
    const before = state.typeResult;
    state = reducer(state, { type: "extendRoute", colourPath: "guided" });
    expect(state.typeResult).toBe(before);
    expect(state.brief.route).toBe("whole");
    expect(state.step).toBe("source");
  });
});
