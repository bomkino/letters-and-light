/** Pure analysis body shared by the cancellable worker and the synchronous
 *  test/fallback runner. Normalized RGBA8 in, engine truth out. No network,
 *  no persistence, no image bytes leaving the machine. */

import {
  buildColourSystems,
  COLOUR_ENGINE_VERSION,
  deltaEOK,
  rgbToOklab,
  type PixelSource,
} from "@core/index.js";

import type { AnalysisInput, AnalysisOutput, AnalysisProgress, SpatialCluster } from "./messages";

const sha256Hex = async (buffer: ArrayBuffer): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

/** Real spatial provenance: assign a strided pixel sample to its nearest
 *  engine cluster in OKLab and record where those pixels actually live.
 *  Computed here from the working pixels; never faked by the engine. */
const computeSpatial = (
  width: number,
  height: number,
  rgba: Uint8ClampedArray,
  systems: AnalysisOutput["systems"],
): SpatialCluster[] => {
  const first = systems[0];
  if (!first) return [];
  const clusters = first.sourceMap.map((cluster) => ({
    ...cluster,
    lab: rgbToOklab({
      r: parseInt(cluster.hex.slice(1, 3), 16),
      g: parseInt(cluster.hex.slice(3, 5), 16),
      b: parseInt(cluster.hex.slice(5, 7), 16),
    }),
  }));
  const stats = clusters.map(() => ({ count: 0, sumX: 0, sumY: 0, minX: 1, minY: 1, maxX: 0, maxY: 0 }));
  const stride = Math.max(1, Math.floor(Math.sqrt((width * height) / 20_000)));
  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const index = (y * width + x) * 4;
      if ((rgba[index + 3] ?? 255) < 16) continue;
      const lab = rgbToOklab({ r: rgba[index] ?? 0, g: rgba[index + 1] ?? 0, b: rgba[index + 2] ?? 0 });
      let best = 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      clusters.forEach((cluster, clusterIndex) => {
        const distance = deltaEOK(lab, cluster.lab);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = clusterIndex;
        }
      });
      const stat = stats[best];
      if (!stat) continue;
      const nx = (x + 0.5) / width;
      const ny = (y + 0.5) / height;
      stat.count += 1;
      stat.sumX += nx;
      stat.sumY += ny;
      stat.minX = Math.min(stat.minX, nx);
      stat.minY = Math.min(stat.minY, ny);
      stat.maxX = Math.max(stat.maxX, nx);
      stat.maxY = Math.max(stat.maxY, ny);
    }
  }
  return clusters.map((cluster, index) => {
    const stat = stats[index] ?? { count: 0, sumX: 0.5, sumY: 0.5, minX: 0, minY: 0, maxX: 1, maxY: 1 };
    return {
      clusterId: cluster.id,
      hex: cluster.hex,
      centroid: stat.count > 0 ? { x: stat.sumX / stat.count, y: stat.sumY / stat.count } : { x: 0.5, y: 0.5 },
      bounds:
        stat.count > 0
          ? { x: stat.minX, y: stat.minY, width: Math.max(0.005, stat.maxX - stat.minX), height: Math.max(0.005, stat.maxY - stat.minY) }
          : { x: 0, y: 0, width: 1, height: 1 },
      population: cluster.population,
      protected: cluster.protected,
      usedByRoles: cluster.usedByRoles,
    };
  });
};

export const analyzePixels = async (input: AnalysisInput, progress?: AnalysisProgress): Promise<AnalysisOutput> => {
  progress?.("normalizing");
  const rgba = new Uint8ClampedArray(input.rgba);
  if (rgba.length !== input.width * input.height * 4) throw new Error("Working pixels do not match declared dimensions.");

  progress?.("hashing");
  const workingPixelHash = await sha256Hex(rgba.buffer.slice(0) as ArrayBuffer);

  progress?.("clustering");
  const source: PixelSource = {
    width: input.width,
    height: input.height,
    rgba,
    workingPixelHash,
    ...(input.crop ? { crop: input.crop } : {}),
    ...(input.alphaGround ? { alphaGround: input.alphaGround } : {}),
    ...(input.protectedHexes ? { protectedHexes: input.protectedHexes } : {}),
  };

  // Yield so the "clustering" stage is genuinely announced before the
  // synchronous engine work begins (real stages, no fake percent).
  await new Promise((resolve) => setTimeout(resolve, 0));
  const result = buildColourSystems(source, input.answers);

  progress?.("building");
  await new Promise((resolve) => setTimeout(resolve, 0));
  return {
    workingPixelHash,
    systems: result.systems,
    companionSystems: result.companionSystems,
    recommendation: result.recommendation,
    spatial: computeSpatial(input.width, input.height, rgba, result.systems),
    engineVersion: COLOUR_ENGINE_VERSION,
  };
};
