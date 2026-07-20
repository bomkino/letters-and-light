import { readFile } from "node:fs/promises";

import { adaptLegacyTypeData, buildColourSystems, buildDirectionCard, runTypeEngine } from "../dist/index.js";

const readJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const systems = await readJson("../data/legacy/type-set/data/candidate-systems.json");
const fonts = await readJson("../data/legacy/type-set/data/candidate-fonts.json");
const catalog = adaptLegacyTypeData(systems, fonts);

const type = runTypeEngine(
  {
    artifactType: "filmTvProject",
    existingFontConstraint: "none",
    authoringTool: "figmaAdobe",
    handoffPaths: ["pdf"],
    viewingContexts: ["laptop"],
    density: "moderate",
    contentNeeds: ["wordsImages"],
    writingSystems: ["latin"],
    character: "expressive"
  },
  catalog,
  "candidate_demo"
);

const width = 8;
const height = 8;
const rgba = [];
for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    rgba.push(...(x < 5 ? [231, 224, 211] : y < 5 ? [45, 56, 74] : [211, 50, 137]), 255);
  }
}

const colour = buildColourSystems(
  { width, height, rgba, workingPixelHash: "d".repeat(64) },
  { delivery: "screen_share", contentLoad: "balanced", sourceRelationship: "reference_is_identity", baseMode: "light", dataNeed: "none" }
);

const direction = buildDirectionCard({
  projectId: "candidate-demo",
  name: "A stubborn little film",
  type,
  typeCatalog: catalog,
  colour,
  previewCopy: { deckTitle: "What remains after the party leaves" }
});

process.stdout.write(`${JSON.stringify(direction, null, 2)}\n`);
