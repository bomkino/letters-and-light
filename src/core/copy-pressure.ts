import type { PreviewCopy } from "../domain.js";

export type CopyPressure = {
  characters: number;
  words: number;
  populatedFields: number;
  longestFieldCharacters: number;
  structuralSignal: "spare" | "balanced" | "dense";
  truthLabel: "structural_estimate_not_layout_measurement";
  note: string;
};

export const estimateCopyPressure = (copy: PreviewCopy): CopyPressure => {
  const values = Object.values(copy).filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  const characters = values.reduce((sum, value) => sum + value.trim().length, 0);
  const words = values.reduce((sum, value) => sum + (value.trim().match(/\S+/g)?.length ?? 0), 0);
  const longestFieldCharacters = values.reduce((longest, value) => Math.max(longest, value.trim().length), 0);
  const structuralSignal = characters > 700 || words > 115 || longestFieldCharacters > 380
    ? "dense"
    : characters > 260 || words > 45 || longestFieldCharacters > 150
      ? "balanced"
      : "spare";

  return {
    characters,
    words,
    populatedFields: values.length,
    longestFieldCharacters,
    structuralSignal,
    truthLabel: "structural_estimate_not_layout_measurement",
    note: "This notices copy pressure. Browser geometry, exact font assets, breakpoint, line count, and overflow decide real fit.",
  };
};
