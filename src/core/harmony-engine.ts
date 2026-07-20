import type { DirectionCard, PaletteSystem, PreviewCopy, TypeRecommendation } from "../domain.js";
import type { TypeCatalog } from "./type-engine.js";

type ColourOutput = DirectionCard["colour"];

export const HARMONY_ENGINE_VERSION = "letters-light-harmony/0.2.0";

const selectedPalette = (colour: ColourOutput): PaletteSystem | null => {
  if (!colour) return null;
  return colour.systems.find((system) => system.id === colour.recommendation.recommendedSystemId) ?? null;
};

export const buildDirectionCard = (input: {
  projectId: string;
  name?: string;
  type: TypeRecommendation;
  typeCatalog: TypeCatalog;
  colour: ColourOutput;
  previewCopy?: PreviewCopy;
}): DirectionCard => {
  if (!input.projectId.trim()) throw new Error("Direction card needs a projectId.");
  const selectedType = input.type.recommendations[0] ?? null;
  const selectedTypeRecord = selectedType ? input.typeCatalog.systems.find((system) => system.id === selectedType.systemId) ?? null : null;
  const palette = selectedPalette(input.colour);
  const rulesFired: string[] = [];
  const guidance: string[] = [];
  const warnings: string[] = [];

  if (!selectedType) {
    rulesFired.push("H00_TYPE_BOUNDARY");
    warnings.push("Typography route has no surviving system. Keep colour work, but do not call this a complete direction yet.");
  }
  if (!palette) {
    rulesFired.push("H01_COLOUR_MISSING");
    warnings.push("No source image has been processed. Typography may continue alone; complete direction waits for colour.");
  }

  if (selectedTypeRecord && palette) {
    if (selectedTypeRecord.character === "expressive" && palette.character.chroma === "vivid" && palette.strategy === "faithful") {
      rulesFired.push("H10_TWO_LEADS_COMPETE");
      guidance.push("Both voices want the first word. Keep expressive display type, but compare the quieter palette—or keep faithful colour and compare a calmer type system.");
      warnings.push("Expressive type plus vivid faithful colour may flatten hierarchy by making every moment feel like the moment.");
    } else if (selectedTypeRecord.character === "quiet" && palette.strategy === "quieter") {
      rulesFired.push("H11_TOO_POLITE");
      guidance.push("Structure is calm. Let one source accent keep its nerve so the deck does not become beige competence.");
    } else {
      rulesFired.push("H12_DISTINCT_JOBS");
      guidance.push("Type carries voice and reading rhythm. Colour carries field, temperature, and interruption. Keep those jobs distinct in templates.");
    }

    if (palette.strategy === "higher_contrast") {
      rulesFired.push("H20_HOSTILE_VIEWING");
      guidance.push("Treat contrast as infrastructure. Character can live in titles and source accents; body pairs stay exact and boring enough to work.");
    }
    if (selectedTypeRecord.candidateStrengths.includes("tabularNumerals") && palette.roles.accent_secondary) {
      rulesFired.push("H21_DATA_PAIR");
      guidance.push("Numerals and colour series have separate checks. Use tabular figures for alignment; use shape, labels, and order so colour never carries data alone.");
    }

    const blockingColourWarnings = palette.warnings.filter((warning) => warning.severity === "blocking");
    if (blockingColourWarnings.length > 0) {
      rulesFired.push("H22_COLOUR_USE_BLOCKED");
      warnings.push(...blockingColourWarnings.map((warning) => warning.message));
    }
    if ((input.colour?.companionSystems?.length ?? 0) > 0) {
      rulesFired.push("H23_COMPANION_MODE_READY");
      guidance.push("A separately constructed opposite-mode companion is available. Compare it as its own system; never invert the primary and hope.");
    }
  }

  if (input.type.mode === "candidate_demo") {
    rulesFired.push("H90_CANDIDATE_TRUTH");
    warnings.push("Type direction remains a candidate demonstration. Keep this warning visible; production must stop until exact systems earn evidence.");
  }

  const typeName = selectedType?.name ?? "Type unresolved";
  const paletteName = palette?.name ?? "light unresolved";
  const headline = selectedType && palette
    ? `${typeName} speaks. ${paletteName} holds the light.`
    : selectedType
      ? `${typeName} has a voice. Light still needs a source.`
      : palette
        ? `${paletteName} is ready. Voice still needs proof.`
        : "Nothing forced. Build from the first honest constraint.";

  return {
    schemaVersion: "1.0.0",
    projectId: input.projectId,
    name: input.name?.trim() || "Untitled direction",
    type: input.type,
    colour: input.colour,
    selected: {
      typeSystemId: selectedType?.systemId ?? null,
      paletteSystemId: palette?.id ?? null,
    },
    relationship: {
      headline,
      principle: "Type and colour keep separate jurisdiction. This layer composes them; it never changes eligibility, colour values, provenance, or evidence status.",
      rulesFired,
      guidance,
      warnings,
    },
    previewCopy: input.previewCopy ?? {},
    truth: {
      typeStatus: input.type.outcome !== "recommendation" ? "unavailable" : input.type.mode === "candidate_demo" ? "candidate_demo" : "verified_scope",
      colourStatus: palette ? "engine_output" : "unavailable",
      claims: [
        "Colour output is deterministic from normalized pixels, declared answers, and engine version.",
        "Typography output follows ordered gates and exposes removals, caveats, and evidence state.",
        "Harmony guidance is editorial composition advice, not a compatibility score.",
      ],
      limits: [
        "A direction card cannot prove story quality, persuasion, cultural meaning, print fidelity, or universal accessibility.",
        "Real layout fit requires exact fonts, browser measurement, named breakpoints, and human review.",
      ],
    },
  };
};
