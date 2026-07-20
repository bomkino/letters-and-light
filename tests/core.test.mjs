import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  adaptLegacyTypeData,
  buildColourSystems,
  buildDirectionCard,
  contrastRatio,
  createProjectFile,
  estimateCopyPressure,
  exportCssCustomProperties,
  exportDesignTokens,
  exportPlainTextStyleSheet,
  hexToRgb,
  parseProjectFile,
  rgbToHex,
  rgbToOklab,
  oklabToRgb,
  runTypeEngine,
  serializeProjectFile,
  splitSharedBrief,
  pendingQuestionIds,
} from "../dist/index.js";

const projectRoot = new URL("../", import.meta.url);
const readJson = async (path) => JSON.parse(await readFile(new URL(path, projectRoot), "utf8"));

const buildPixelSource = () => {
  const width = 12;
  const height = 12;
  const rgba = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const colour = x < 7 ? [228, 220, 205] : y < 7 ? [44, 52, 69] : x > 9 && y > 9 ? [211, 50, 137] : [111, 137, 159];
      rgba.push(...colour, 255);
    }
  }
  return {
    width,
    height,
    rgba,
    workingPixelHash: "a".repeat(64),
    protectedHexes: ["#D33289"],
  };
};

const typeAnswers = {
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

const loadCandidateCatalog = async () =>
  adaptLegacyTypeData(
    await readJson("data/legacy/type-set/data/candidate-systems.json"),
    await readJson("data/legacy/type-set/data/candidate-fonts.json"),
  );

const productionCatalog = {
  version: "test-only-1",
  fonts: {
    fixtureSans: {
      id: "fixtureSans",
      family: "Fixture Sans",
      licenceVerified: true,
      productionFilesSelected: true,
      inspectedFileId: "fixture-sans-hash",
      binaryCoverageNotHumanVerified: ["latin"],
      defaultNumerals: "tabular",
    },
    fixtureDisplay: {
      id: "fixtureDisplay",
      family: "Fixture Display",
      licenceVerified: true,
      productionFilesSelected: true,
      inspectedFileId: "fixture-display-hash",
      binaryCoverageNotHumanVerified: ["latin"],
      defaultNumerals: "proportional",
    },
  },
  systems: [
    {
      id: "fixture-quiet",
      name: "Fixture Quiet",
      status: "verified",
      collectionOrder: 1,
      roles: { display: { fontId: "fixtureSans" }, body: { fontId: "fixtureSans" }, utility: { fontId: "fixtureSans" } },
      character: "quiet",
      candidateStrengths: ["singleFamily", "bodyEndurance", "tabularNumerals"],
      candidateArtifacts: ["startupInvestor", "filmTvProject"],
      oneThingNotToDo: "Do not mistake a fixture for a real font recommendation.",
      requiredValidation: [],
      evidenceIds: ["TEST-EVIDENCE-QUIET"],
      supportedWritingSystems: ["latin"],
      supportedApplications: ["figmaAdobe", "powerPoint"],
      supportedHandoffPaths: ["pdf", "editableSource"],
      supportedViewingContexts: ["laptop", "largeRoom"],
      exactTokens: { body: { size: 24 } },
      fallbackStack: ["Arial", "sans-serif"],
    },
    {
      id: "fixture-expressive",
      name: "Fixture Expressive",
      status: "limited",
      collectionOrder: 2,
      roles: { display: { fontId: "fixtureDisplay" }, body: { fontId: "fixtureSans" }, utility: { fontId: "fixtureSans" } },
      character: "expressive",
      candidateStrengths: ["distinctDisplayVoice", "bodyEndurance", "tabularNumerals"],
      candidateArtifacts: ["filmTvProject"],
      oneThingNotToDo: "Keep display out of tables.",
      requiredValidation: [],
      evidenceIds: ["TEST-EVIDENCE-EXPRESSIVE"],
      supportedWritingSystems: ["latin"],
      supportedApplications: ["figmaAdobe"],
      supportedHandoffPaths: ["pdf"],
      supportedViewingContexts: ["laptop"],
      exactTokens: { body: { size: 24 } },
      fallbackStack: ["Arial", "sans-serif"],
    },
  ],
};

test("OKLab round-trip remains within one RGB channel", () => {
  const original = { r: 211, g: 50, b: 137 };
  const result = oklabToRgb(rgbToOklab(original));
  assert.ok(Math.abs(result.r - original.r) <= 1);
  assert.ok(Math.abs(result.g - original.g) <= 1);
  assert.ok(Math.abs(result.b - original.b) <= 1);
  assert.equal(rgbToHex(hexToRgb("#d33289")), "#D33289");
});

test("contrast calculation uses exact sRGB pairs", () => {
  assert.equal(contrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }), 21);
});

test("colour engine returns three deterministic, inspectable systems", () => {
  const source = buildPixelSource();
  const answers = { delivery: "phone", contentLoad: "dense", sourceRelationship: "protect_one", baseMode: "light", dataNeed: "categorical" };
  const first = buildColourSystems(source, answers);
  const second = buildColourSystems(source, answers);
  assert.deepEqual(first, second);
  assert.equal(first.systems.length, 3);
  assert.equal(first.companionSystems.length, 0);
  assert.equal(first.recommendation.recommendedStrategy, "higher_contrast");
  assert.equal(first.systems.filter((system) => system.recommended).length, 1);
  for (const system of first.systems) {
    assert.ok(system.roles.text.contrastAgainst.background >= 4.5);
    assert.match(system.roles.background.hex, /^#[0-9A-F]{6}$/);
    const population = system.sourceMap.reduce((sum, cluster) => sum + cluster.population, 0);
    assert.ok(Math.abs(population - 1) < 0.0001);
    assert.ok(system.sourceMap.some((cluster) => cluster.protected));
  }
});

test("both/decide modes return three separately built companion systems", () => {
  const both = buildColourSystems(buildPixelSource(), { baseMode: "both" });
  assert.equal(both.systems.length, 3);
  assert.equal(both.companionSystems.length, 3);
  assert.notEqual(both.systems[0].mode, both.companionSystems[0].mode);
  assert.notDeepEqual(both.systems[0].roles.background.rgb, both.companionSystems[0].roles.background.rgb);
  assert.ok(both.companionSystems.every((system) => system.recommended === false));

  const decided = buildColourSystems(buildPixelSource(), { baseMode: "decide" });
  assert.equal(decided.companionSystems.length, 3);
});

test("protected source colour owns a role instead of becoming decorative paperwork", () => {
  const result = buildColourSystems({ ...buildPixelSource(), protectedHexes: ["#6F899F"] }, { sourceRelationship: "protect_one", baseMode: "light" });
  assert.equal(result.systems[0].roles.accent_primary.provenance.sourceHex, "#6F899F");
  const protectedCluster = result.systems[0].sourceMap.find((cluster) => cluster.protected);
  assert.ok(protectedCluster?.usedByRoles.includes("accent_primary"));
});

test("colour input rejects malformed bytes, crop, protected colour, and answer IDs", () => {
  const source = buildPixelSource();
  const badBytes = [...source.rgba];
  badBytes[0] = 999;
  assert.throws(() => buildColourSystems({ ...source, rgba: badBytes }), /8-bit integer/);
  assert.throws(() => buildColourSystems({ ...source, crop: { x: 0.8, y: 0, width: 0.4, height: 1 } }), /normalized rectangle/);
  assert.throws(() => buildColourSystems({ ...source, protectedHexes: ["pinkish"] }), /Invalid protected/);
  assert.throws(() => buildColourSystems(source, { delivery: "telepathy" }), /Unknown colour answer/);
});

test("custom copy and data requests expose proof debt instead of claiming best fit", () => {
  const custom = buildColourSystems(buildPixelSource(), { contentLoad: "custom", baseMode: "light" });
  assert.equal(custom.recommendation.status, "sensible_first_pass");
  assert.ok(custom.recommendation.uncertainty.some((item) => item.inputId === "contentLoad"));

  const diverging = buildColourSystems(buildPixelSource(), { dataNeed: "diverging", dataCount: 7, divergingMidpoint: "break-even", baseMode: "light" });
  assert.equal(diverging.recommendation.nextAction.id, "resolve_warning");
  assert.ok(diverging.systems[0].warnings.some((warning) => warning.code === "DIVERGING_SCALE_NOT_BUILT" && warning.severity === "blocking"));
});

test("invalid pixel contracts stop before analysis", () => {
  assert.throws(
    () => buildColourSystems({ width: 2, height: 2, rgba: [0, 0, 0, 255], workingPixelHash: "a".repeat(64) }),
    /RGBA length/,
  );
});

test("legacy type data stays candidate-only and production cannot launder it", async () => {
  const catalog = await loadCandidateCatalog();
  const production = runTypeEngine(typeAnswers, catalog, "production");
  assert.equal(production.outcome, "unsupported");
  assert.equal(production.recommendations.length, 0);
  assert.ok(production.exclusions.every((item) => item.atGate === "G0"));
});

test("candidate demonstration exercises gates with permanent truth labels", async () => {
  const catalog = await loadCandidateCatalog();
  const result = runTypeEngine(typeAnswers, catalog, "candidate_demo");
  assert.equal(result.outcome, "recommendation");
  assert.equal(result.dataStatus, "candidate_only");
  assert.ok(result.recommendations.length >= 1 && result.recommendations.length <= 3);
  assert.ok(result.recommendations.every((item) => item.status === "candidate"));
  assert.match(result.blockers.join(" "), /Candidate demonstration/);
  assert.ok(Object.values(result.trace).every((trace) => trace[0]?.reasonCode === "candidateDemonstration"));
});

test("candidate mode never revives rejected or stale systems", () => {
  const rejectedCatalog = {
    ...productionCatalog,
    systems: [
      { ...productionCatalog.systems[0], id: "dead-system", name: "Dead System", status: "rejected" },
      productionCatalog.systems[1],
    ],
  };
  const result = runTypeEngine(typeAnswers, rejectedCatalog, "candidate_demo");
  assert.ok(result.exclusions.some((item) => item.systemId === "dead-system" && item.atGate === "G0"));
  assert.ok(result.recommendations.every((item) => item.systemId !== "dead-system"));
});

test("empty type catalog is unsupported, never public-ready", () => {
  const result = runTypeEngine(typeAnswers, { version: "empty", fonts: {}, systems: [] }, "production");
  assert.equal(result.outcome, "unsupported");
  assert.equal(result.dataStatus, "mixed");
});

test("unsupported non-Latin route stops candidate systems honestly", async () => {
  const catalog = await loadCandidateCatalog();
  const result = runTypeEngine({ ...typeAnswers, writingSystems: ["devanagari"] }, catalog, "candidate_demo");
  assert.equal(result.outcome, "unsupported");
  assert.ok(result.exclusions.some((item) => item.atGate === "G2"));
});

test("unknown mandatory font returns audit boundary", async () => {
  const catalog = await loadCandidateCatalog();
  const result = runTypeEngine(
    { ...typeAnswers, existingFontConstraint: "mandatory", mandatoryFontName: "A Font Nobody Audited" },
    catalog,
    "candidate_demo",
  );
  assert.equal(result.outcome, "boundary");
  assert.match(result.headline, /Brand rule first/);
});

test("verified test fixtures exercise production gates and count-aware roles", () => {
  const result = runTypeEngine(typeAnswers, productionCatalog, "production");
  assert.equal(result.outcome, "recommendation");
  assert.equal(result.dataStatus, "public_ready");
  assert.equal(result.recommendations.length, 2);
  assert.equal(result.recommendations[0].answerRole, "ourPick");
  assert.ok(result.recommendations.every((item) => ["verified", "limited"].includes(item.status)));
});

test("harmony composes outputs without mutating either engine", () => {
  const type = runTypeEngine(typeAnswers, productionCatalog, "production");
  const colour = buildColourSystems(buildPixelSource(), {
    delivery: "screen_share",
    contentLoad: "spare",
    sourceRelationship: "reference_is_identity",
    baseMode: "light",
    dataNeed: "none",
  });
  const before = JSON.stringify({ type, colour });
  const direction = buildDirectionCard({
    projectId: "project-test-01",
    name: "A stubborn little film",
    type,
    typeCatalog: productionCatalog,
    colour,
    previewCopy: { deckTitle: "What remains after the party leaves" },
  });
  assert.equal(JSON.stringify({ type, colour }), before);
  assert.equal(direction.selected.typeSystemId, type.recommendations[0].systemId);
  assert.equal(direction.selected.paletteSystemId, colour.recommendation.recommendedSystemId);
  assert.match(direction.relationship.principle, /separate jurisdiction/);
  assert.ok(direction.relationship.rulesFired.length > 0);
});

test("harmony carries companion-mode and blocking colour truth into the shared direction", () => {
  const type = runTypeEngine(typeAnswers, productionCatalog, "production");
  const colour = buildColourSystems(buildPixelSource(), { baseMode: "decide", dataNeed: "sequential", dataCount: 5 });
  const direction = buildDirectionCard({ projectId: "project-data-truth", type, typeCatalog: productionCatalog, colour });
  assert.ok(direction.relationship.rulesFired.includes("H22_COLOUR_USE_BLOCKED"));
  assert.ok(direction.relationship.rulesFired.includes("H23_COMPANION_MODE_READY"));
  assert.match(direction.relationship.warnings.join(" "), /separately generated scale/);
});

test("copy pressure labels structural estimate, never layout fit", () => {
  const result = estimateCopyPressure({ body: "word ".repeat(140) });
  assert.equal(result.structuralSignal, "dense");
  assert.equal(result.truthLabel, "structural_estimate_not_layout_measurement");
  assert.match(result.note, /Browser geometry/);
});

test("shared brief asks once and feeds both engines without inventing data semantics", () => {
  const brief = {
    route: "whole",
    artifactType: "filmTvProject",
    existingFontConstraint: "none",
    authoringTool: "figmaAdobe",
    handoffPaths: ["pdf"],
    viewingContexts: ["laptop"],
    density: "moderate",
    contentNeeds: ["chartsNumbers"],
    writingSystems: ["latin"],
    character: "present",
    sourceRelationship: "starting_point",
    baseMode: "light",
  };
  const split = splitSharedBrief(brief);
  assert.equal(split.type.density, "moderate");
  assert.equal(split.colour.contentLoad, "balanced");
  assert.equal(split.colour.delivery, "screen_share");
  assert.equal(split.colour.dataNeed, "unknown");
  assert.deepEqual(pendingQuestionIds(brief), ["dataNeed"]);
});

test("collection opens without an interrogation and colour quick path stays quick", () => {
  assert.deepEqual(pendingQuestionIds({ route: "collection" }), []);
  assert.equal(splitSharedBrief({ route: "collection" }).type, null);
  assert.deepEqual(pendingQuestionIds({ route: "colour", colourPath: "quick" }), []);
  const guided = pendingQuestionIds({ route: "colour", colourPath: "guided", dataNeed: "diverging" });
  assert.ok(guided.includes("viewingContexts"));
  assert.ok(guided.includes("dataCount"));
  assert.ok(guided.includes("divergingMidpoint"));
});

test("project round-trip excludes pixels and original filename", () => {
  const type = runTypeEngine(typeAnswers, productionCatalog, "production");
  const colourAnswers = { delivery: "screen_share", contentLoad: "balanced", baseMode: "light" };
  const colour = buildColourSystems(buildPixelSource(), colourAnswers);
  const direction = buildDirectionCard({ projectId: "project-test-02", type, typeCatalog: productionCatalog, colour });
  const project = createProjectFile({
    direction,
    typeAnswers,
    colourAnswers,
    createdAt: "2026-07-19T12:00:00.000Z",
    source: { sourceFileHash: "b".repeat(64), workingPixelHash: "a".repeat(64), width: 12, height: 12 },
  });
  const json = serializeProjectFile(project);
  assert.doesNotMatch(json, /"(?:imageBytes|originalFilename|rgba)"\s*:/);
  assert.deepEqual(parseProjectFile(json), project);
});

test("hostile project keys are rejected", () => {
  const hostile = '{"schemaVersion":"1.0.0","projectId":"x","__proto__":{},"privacy":{"containsImagePixels":false,"containsOriginalFilename":false,"localOnly":true},"source":{}}';
  assert.throws(() => parseProjectFile(hostile), /forbidden key/);
});

test("project import rejects private payloads, unknown roots, and mismatched direction", () => {
  const type = runTypeEngine(typeAnswers, productionCatalog, "production");
  const colourAnswers = { baseMode: "light" };
  const colour = buildColourSystems(buildPixelSource(), colourAnswers);
  const direction = buildDirectionCard({ projectId: "project-safe", type, typeCatalog: productionCatalog, colour });
  const project = createProjectFile({ direction, typeAnswers, colourAnswers, createdAt: "2026-07-19T12:00:00.000Z" });

  const privatePayload = structuredClone(project);
  privatePayload.direction.previewCopy.dataUrl = "data:image/png;base64,not-allowed";
  assert.throws(() => parseProjectFile(JSON.stringify(privatePayload)), /private payload key/);

  const extraRoot = { ...project, surpriseServerField: true };
  assert.throws(() => parseProjectFile(JSON.stringify(extraRoot)), /unknown key/);

  const mismatch = structuredClone(project);
  mismatch.direction.projectId = "another-project";
  assert.throws(() => parseProjectFile(JSON.stringify(mismatch)), /another projectId/);
});

test("exports carry both systems, caveats, and no remote resources", () => {
  const type = runTypeEngine(typeAnswers, productionCatalog, "production");
  const colour = buildColourSystems(buildPixelSource(), { baseMode: "light" });
  const direction = buildDirectionCard({ projectId: "project-test-03", name: "Proof", type, typeCatalog: productionCatalog, colour });
  const css = exportCssCustomProperties(direction);
  const text = exportPlainTextStyleSheet(direction);
  const json = exportDesignTokens(direction);
  assert.match(css, /--ll-font-display/);
  assert.match(css, /--ll-colour-background/);
  assert.doesNotMatch(css, /https?:\/\//);
  assert.match(text, /RELATIONSHIP/);
  assert.equal(JSON.parse(json).projectId, "project-test-03");
});

test("CSS export neutralizes comment text and rejects forged manifest keys", () => {
  const type = runTypeEngine(typeAnswers, productionCatalog, "production");
  const colour = buildColourSystems(buildPixelSource(), { baseMode: "light" });
  const direction = buildDirectionCard({ projectId: "project-css", name: "Proof */ body { display:none } /*", type, typeCatalog: productionCatalog, colour });
  const css = exportCssCustomProperties(direction);
  assert.doesNotMatch(css, /Proof \*\/ body/);

  const forged = structuredClone(direction);
  forged.type.recommendations[0].roles.display.fontId = 'fixture"; background: url(https://bad.example)';
  assert.throws(() => exportCssCustomProperties(forged), /Unsafe font manifest key/);
});

test("CSS export accepts user-adjusted lowercase hex and normalizes it", () => {
  const type = runTypeEngine(typeAnswers, productionCatalog, "production");
  const colour = buildColourSystems(buildPixelSource(), { baseMode: "light" });
  const direction = buildDirectionCard({ projectId: "project-css-case", name: "Proof", type, typeCatalog: productionCatalog, colour });
  const adjusted = structuredClone(direction);
  const selected = adjusted.colour.systems.find((system) => system.id === adjusted.selected.paletteSystemId);
  const [firstRole] = Object.keys(selected.roles);
  selected.roles[firstRole].hex = "#f9f8f6";
  const css = exportCssCustomProperties(adjusted);
  assert.match(css, /#F9F8F6/);
  assert.doesNotMatch(css, /#f9f8f6/);
});
