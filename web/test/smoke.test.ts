import { describe, expect, it } from "vitest";
import { adaptLegacyTypeData, runTypeEngine, copy, splitSharedBrief } from "@core/index.js";
import systems from "@data/legacy/type-set/data/candidate-systems.json";
import fonts from "@data/legacy/type-set/data/candidate-fonts.json";

describe("core wiring smoke", () => {
  it("imports core TS with .js specifiers and legacy JSON", () => {
    const catalog = adaptLegacyTypeData(
      systems as unknown as Parameters<typeof adaptLegacyTypeData>[0],
      fonts as unknown as Parameters<typeof adaptLegacyTypeData>[1],
    );
    const rec = runTypeEngine(
      {
        artifactType: "filmTvProject",
        existingFontConstraint: "none",
        authoringTool: "figmaAdobe",
        handoffPaths: ["pdf"],
        viewingContexts: ["laptop"],
        density: "moderate",
        contentNeeds: ["wordsImages"],
        writingSystems: ["latin"],
        character: "expressive",
      },
      catalog,
      "candidate_demo",
    );
    expect(rec.recommendations.length).toBeGreaterThan(0);
    expect(copy.brand.product).toBe("Letters & Light");
    expect(typeof splitSharedBrief).toBe("function");
  });
});
