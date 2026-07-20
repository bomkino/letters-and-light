/** Shared image-analysis contract between main thread, worker, and tests. */

import type { ColourAnswers, PaletteSystem, Rgb } from "@core/index.js";

export type AnalysisStage = "normalizing" | "hashing" | "clustering" | "building";

export type SpatialCluster = {
  clusterId: string;
  hex: string;
  /** Normalized centroid in the working image, computed in this browser. */
  centroid: { x: number; y: number };
  /** Normalized bounding box of sampled members. */
  bounds: { x: number; y: number; width: number; height: number };
  population: number;
  protected: boolean;
  usedByRoles: string[];
};

export type AnalysisInput = {
  width: number;
  height: number;
  rgba: ArrayBuffer;
  answers: ColourAnswers;
  crop?: { x: number; y: number; width: number; height: number };
  alphaGround?: Rgb;
  protectedHexes?: readonly string[];
};

export type AnalysisOutput = {
  workingPixelHash: string;
  systems: PaletteSystem[];
  companionSystems: PaletteSystem[];
  recommendation: import("@core/index.js").ColourRecommendation;
  spatial: SpatialCluster[];
  engineVersion: string;
};

export type AnalysisProgress = (stage: AnalysisStage) => void;

export class AnalysisCancelled extends Error {
  constructor() {
    super("Analysis cancelled.");
    this.name = "AnalysisCancelled";
  }
}
