import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  TYPE_SPECIMEN_LIMITS,
  TYPE_SPECIMEN_PRESETS,
  applyTypeStudioAction,
  createTypeStudioSession,
  recommendTypeDirections,
  searchTypeLibrary,
  validateTypeLibraryDocument,
} from "../dist/index.js";

const document = JSON.parse(await readFile(new URL("../data/type-library/font-library.lock.json", import.meta.url), "utf8"));
const answers = {
  artifactType: "filmTvProject",
  existingFontConstraint: "none",
  authoringTool: "figmaAdobe",
  handoffPaths: ["pdf"],
  viewingContexts: ["laptop"],
  density: "moderate",
  contentNeeds: ["wordsImages"],
  writingSystems: ["latin"],
  character: "expressive",
};
const signature = (recommendation) => recommendation.directions.map((direction) => [
  direction.lane,
  direction.roles.display.id,
  direction.roles.body.id,
  direction.roles.utility.id,
]);

test("exact type library is large, attributed and honestly scoped", () => {
  assert.equal(validateTypeLibraryDocument(document), document);
  assert.equal(document.fonts.length, 64);
  assert.equal(document.shelves.length, 8);
  assert.equal(document.fonts.flatMap((font) => font.files).length, 248);
  assert.ok(document.fonts.every((font) => font.previewStatus === "exact_self_hosted"));
  assert.ok(document.fonts.every((font) => font.deckStatus === "requires_application_validation"));
  assert.ok(document.fonts.every((font) => font.designer && font.license.spdx === "OFL-1.1"));
});

test("recommendation returns five genuinely distinct editorial lanes with real files", () => {
  const result = recommendTypeDirections(document, { answers, seed: 0 });
  assert.equal(result.outcome, "directions");
  assert.equal(result.eligibleFontCount, 64);
  assert.deepEqual(result.directions.map((direction) => direction.lane), ["reliable", "characterful", "editorial", "wildcard", "oneFamily"]);
  assert.equal(new Set(signature(result).map((item) => item.slice(1).join("/"))).size, 5);
  for (const direction of result.directions) {
    assert.equal(direction.exactPreview, true);
    assert.match(direction.name, new RegExp(direction.roles.display.family.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.ok(Object.values(direction.roles).every((font) => font.files.length > 0));
    assert.equal(direction.deckStatus, "requires_application_validation");
  }
});

test("the same brief and seed are deterministic; shuffle changes the edit", () => {
  const first = recommendTypeDirections(document, { answers, seed: 3 });
  const same = recommendTypeDirections(document, { answers, seed: 3 });
  const shuffled = recommendTypeDirections(document, { answers, seed: 4 });
  assert.deepEqual(first, same);
  assert.notDeepEqual(signature(first), signature(shuffled));
  assert.equal(shuffled.directions.length, 5);
});

test("role locks survive shuffle and reject impossible assignments", () => {
  let session = createTypeStudioSession(document, answers, 0);
  const display = session.recommendation.directions[0].roles.display;
  session = applyTypeStudioAction(session, { type: "toggleLock", role: "display", fontId: display.id }, document);
  session = applyTypeStudioAction(session, { type: "shuffle" }, document);
  assert.ok(session.recommendation.directions.length > 0);
  assert.ok(session.recommendation.directions.every((direction) => direction.roles.display.id === display.id));
  const displayOnly = document.fonts.find((font) => font.roles.includes("display") && !font.roles.includes("body"));
  assert.throws(() => applyTypeStudioAction(session, { type: "toggleLock", role: "body", fontId: displayOnly.id }, document), /cannot be locked/);
});

test("stars, removal and undo/redo form one reversible studio history", () => {
  const initial = createTypeStudioSession(document, answers, 9);
  const fontId = initial.recommendation.directions[0].roles.display.id;
  const starred = applyTypeStudioAction(initial, { type: "toggleStarFont", fontId }, document);
  assert.deepEqual(starred.current.starredFontIds, [fontId]);
  const removed = applyTypeStudioAction(starred, { type: "excludeFont", fontId }, document);
  assert.ok(removed.current.excludedFontIds.includes(fontId));
  assert.ok(removed.recommendation.directions.every((direction) => !Object.values(direction.roles).some((font) => font.id === fontId)));
  const undone = applyTypeStudioAction(removed, { type: "undo" }, document);
  assert.deepEqual(undone.current, starred.current);
  const redone = applyTypeStudioAction(undone, { type: "redo" }, document);
  assert.deepEqual(redone.current, removed.current);
});

test("search exposes the library as useful shelves, not an anonymous dropdown", () => {
  assert.deepEqual(searchTypeLibrary(document, { query: "Bricolage" }).map((font) => font.family), ["Bricolage Grotesque"]);
  assert.ok(searchTypeLibrary(document, { shelfId: "expressive-serif", role: "display" }).length >= 8);
  assert.ok(searchTypeLibrary(document, { role: "body" }).every((font) => font.roles.includes("body")));
  assert.ok(searchTypeLibrary(document, { tone: "cinematic" }).some((font) => font.family === "Fraunces"));
});

test("unsupported scripts and unaudited mandatory fonts stop instead of substituting", () => {
  const script = recommendTypeDirections(document, { answers: { ...answers, writingSystems: ["devanagari"] } });
  assert.equal(script.outcome, "unsupported");
  assert.equal(script.directions.length, 0);
  const mandatory = recommendTypeDirections(document, {
    answers: { ...answers, existingFontConstraint: "mandatory", mandatoryFontName: "Somebody's Mystery Font" },
  });
  assert.equal(mandatory.outcome, "boundary");
  assert.match(mandatory.headline, /Brand rule first/);
});

test("known mandatory family is obeyed and never approximated", () => {
  const result = recommendTypeDirections(document, {
    answers: { ...answers, existingFontConstraint: "mandatory", mandatoryFontName: "Inter" },
  });
  assert.equal(result.outcome, "directions");
  assert.ok(result.directions.every((direction) => direction.roles.display.family === "Inter" && direction.roles.body.family === "Inter"));
});

test("studio rejects forged IDs and keeps history bounded", () => {
  const initial = createTypeStudioSession(document, answers, 0);
  assert.throws(() => applyTypeStudioAction(initial, { type: "toggleStarFont", fontId: "ghost-font" }, document), /Unknown type-library font/);
  assert.throws(() => applyTypeStudioAction(initial, { type: "selectDirection", directionId: "ghost-direction" }, document), /Unknown direction/);
  let session = initial;
  for (let index = 0; index < 55; index += 1) session = applyTypeStudioAction(session, { type: "shuffle" }, document);
  assert.equal(session.past.length, 50);
});

test("specimen copy has explicit limits and human presets", () => {
  assert.equal(TYPE_SPECIMEN_LIMITS.headline.max, 72);
  assert.equal(TYPE_SPECIMEN_LIMITS.paragraph.max, 320);
  assert.equal(TYPE_SPECIMEN_PRESETS.length, 4);
  assert.ok(TYPE_SPECIMEN_PRESETS.every((preset) => preset.headline.length <= TYPE_SPECIMEN_LIMITS.headline.max));
  assert.match(TYPE_SPECIMEN_PRESETS.map((preset) => preset.paragraph).join(" "), /Nothing dressed as strategy/);
});
