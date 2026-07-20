import type {
  ColourAnswers,
  ColourRecommendation,
  Oklab,
  PaletteMode,
  PaletteRoleId,
  PaletteRoles,
  PaletteStrategy,
  PaletteSystem,
  PixelSource,
  Rgb,
  RoleToken,
  SourceCluster,
  Warning,
} from "../domain.js";
import {
  adjustOklch,
  compositeOver,
  contrastRatio,
  deltaEOK,
  hexToRgb,
  mixOklab,
  oklabToRgb,
  rgbToHex,
  rgbToOklab,
  rgbToOklch,
} from "./colour-space.js";

export const COLOUR_ENGINE_VERSION = "letters-light-colour/0.2.0";
const MAX_SAMPLES = 65_536;
const MAX_WORKING_PIXELS = 40_000_000;
const SEED_COUNT = 12;
const LLOYD_ITERATIONS = 6;
const MERGE_DISTANCE = 0.025;

type Point = { rgb: Rgb; lab: Oklab };
type WorkingCluster = {
  id: string;
  rgb: Rgb;
  lab: Oklab;
  count: number;
  population: number;
  protected: boolean;
};

type NormalizedColourAnswers = Required<Pick<ColourAnswers, "delivery" | "contentLoad" | "sourceRelationship" | "baseMode" | "dataNeed">> &
  Pick<ColourAnswers, "dataCount" | "divergingMidpoint">;

const DEFAULT_ANSWERS: NormalizedColourAnswers = {
  delivery: "unknown",
  contentLoad: "unknown",
  sourceRelationship: "unknown",
  baseMode: "decide",
  dataNeed: "unknown",
};

const ANSWER_OPTIONS = {
  delivery: new Set(["live_room", "screen_share", "sent_pdf", "phone", "print", "mixed", "unknown"]),
  contentLoad: new Set(["spare", "balanced", "dense", "custom", "unknown"]),
  sourceRelationship: new Set(["reference_is_identity", "protect_one", "starting_point", "surprise_me_carefully", "unknown"]),
  baseMode: new Set(["light", "dark", "both", "decide"]),
  dataNeed: new Set(["none", "categorical", "sequential", "diverging", "unknown"]),
} as const;

const ROLE_USES: Record<PaletteRoleId, string[]> = {
  background: ["Main slide field", "Full-page background"],
  surface: ["Panels", "Text blocks", "Secondary sections"],
  text: ["Body copy", "Ordinary headings"],
  muted_text: ["Captions", "Notes", "Sources"],
  accent_primary: ["Emphasis", "Key numbers", "Small interruptions"],
  accent_secondary: ["A second data series", "Rare secondary emphasis"],
  on_accent: ["Text placed inside the primary accent"],
  line_or_rule: ["Rules", "Dividers", "Chart scaffolding"],
};

const ROLE_REASONS: Record<PaletteRoleId, string> = {
  background: "Carries the largest field without asking every slide to perform.",
  surface: "Separates working areas while staying related to the main field.",
  text: "Chosen for the exact background pair, not because dark or light feels safe in general.",
  muted_text: "Steps back from body text while remaining testable against its field.",
  accent_primary: "Keeps one source colour available for interruption, emphasis, and small moments of nerve.",
  accent_secondary: "Adds one related peer when a second job genuinely exists.",
  on_accent: "Chosen for direct contrast against the primary accent.",
  line_or_rule: "Makes structure visible without competing with words.",
};

const assertPixelSource = (source: PixelSource): void => {
  if (!Number.isInteger(source.width) || !Number.isInteger(source.height) || source.width <= 0 || source.height <= 0) {
    throw new Error("Pixel source needs positive integer width and height.");
  }
  if (source.rgba.length !== source.width * source.height * 4) {
    throw new Error("RGBA length does not match width × height × 4.");
  }
  if (!Number.isSafeInteger(source.width * source.height) || source.width * source.height > MAX_WORKING_PIXELS) {
    throw new Error(`Working pixel source exceeds ${MAX_WORKING_PIXELS.toLocaleString("en-US")} pixels.`);
  }
  if (!/^[0-9a-f]{64}$/.test(source.workingPixelHash)) {
    throw new Error("workingPixelHash must be a lowercase SHA-256 string.");
  }
  const byteArray = source.rgba instanceof Uint8Array || source.rgba instanceof Uint8ClampedArray;
  if (!byteArray) {
    for (let index = 0; index < source.rgba.length; index += 1) {
      const value = source.rgba[index];
      if (!Number.isInteger(value) || (value ?? -1) < 0 || (value ?? 256) > 255) {
        throw new Error(`RGBA value at index ${index} is not an 8-bit integer.`);
      }
    }
  }
  if (source.alphaGround) {
    for (const [channel, value] of Object.entries(source.alphaGround)) {
      if (!Number.isInteger(value) || value < 0 || value > 255) throw new Error(`alphaGround.${channel} must be an 8-bit integer.`);
    }
  }
  if (source.crop) {
    const { x, y, width, height } = source.crop;
    if (![x, y, width, height].every(Number.isFinite) || x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 1 || y + height > 1) {
      throw new Error("crop must be a normalized rectangle contained inside 0–1 bounds.");
    }
  }
  if ((source.protectedHexes?.length ?? 0) > 20) throw new Error("At most 20 protected colours may be supplied.");
  for (const hex of source.protectedHexes ?? []) {
    if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error(`Invalid protected RGB hex: ${hex}`);
  }
};

const normalizeAnswers = (supplied: ColourAnswers): NormalizedColourAnswers => {
  for (const key of Object.keys(ANSWER_OPTIONS) as Array<keyof typeof ANSWER_OPTIONS>) {
    const value = supplied[key];
    if (value !== undefined && !ANSWER_OPTIONS[key].has(value as never)) throw new Error(`Unknown colour answer ${key}: ${String(value)}`);
  }
  if (supplied.dataCount !== undefined && (!Number.isInteger(supplied.dataCount) || supplied.dataCount < 2 || supplied.dataCount > 12)) {
    throw new Error("dataCount must be an integer from 2 to 12.");
  }
  if (supplied.divergingMidpoint !== undefined && (typeof supplied.divergingMidpoint !== "string" || supplied.divergingMidpoint.trim().length === 0)) {
    throw new Error("divergingMidpoint must be a non-empty string when supplied.");
  }
  return {
    ...DEFAULT_ANSWERS,
    ...supplied,
    ...(supplied.divergingMidpoint === undefined ? {} : { divergingMidpoint: supplied.divergingMidpoint.trim() }),
  };
};

const samplePixels = (source: PixelSource): Point[] => {
  const target = Math.min(MAX_SAMPLES, source.width * source.height);
  const aspect = source.width / source.height;
  const columns = Math.max(1, Math.min(source.width, Math.ceil(Math.sqrt(target * aspect))));
  const rows = Math.max(1, Math.min(source.height, Math.ceil(target / columns)));
  const alphaGround = source.alphaGround ?? { r: 255, g: 255, b: 255 };
  const points: Point[] = [];

  for (let row = 0; row < rows && points.length < target; row += 1) {
    const y = Math.min(source.height - 1, Math.floor(((row + 0.5) * source.height) / rows));
    for (let column = 0; column < columns && points.length < target; column += 1) {
      const x = Math.min(source.width - 1, Math.floor(((column + 0.5) * source.width) / columns));
      const index = (y * source.width + x) * 4;
      const raw = {
        r: source.rgba[index] ?? 0,
        g: source.rgba[index + 1] ?? 0,
        b: source.rgba[index + 2] ?? 0,
      };
      const rgb = compositeOver(raw, source.rgba[index + 3] ?? 255, alphaGround);
      points.push({ rgb, lab: rgbToOklab(rgb) });
    }
  }
  return points;
};

const averageLab = (points: readonly Point[]): Oklab => {
  const total = points.reduce(
    (sum, point) => ({ l: sum.l + point.lab.l, a: sum.a + point.lab.a, b: sum.b + point.lab.b }),
    { l: 0, a: 0, b: 0 },
  );
  return { l: total.l / points.length, a: total.a / points.length, b: total.b / points.length };
};

const initialCentroids = (points: readonly Point[], count: number): Oklab[] => {
  const mean = averageLab(points);
  const first = points.reduce((best, point) =>
    deltaEOK(point.lab, mean) < deltaEOK(best.lab, mean) ? point : best,
  );
  const centroids = [first.lab];

  while (centroids.length < count) {
    let candidate: Point | null = null;
    let farthest = -1;
    for (const point of points) {
      const distance = Math.min(...centroids.map((centroid) => deltaEOK(point.lab, centroid)));
      if (distance > farthest + Number.EPSILON) {
        farthest = distance;
        candidate = point;
      }
    }
    if (candidate === null || farthest < 1e-9) break;
    centroids.push(candidate.lab);
  }
  return centroids;
};

const clusterPoints = (points: readonly Point[]): WorkingCluster[] => {
  let centroids = initialCentroids(points, Math.min(SEED_COUNT, points.length));
  let assignments = new Array<number>(points.length).fill(0);

  for (let iteration = 0; iteration < LLOYD_ITERATIONS; iteration += 1) {
    assignments = points.map((point) => {
      let chosen = 0;
      let chosenDistance = Number.POSITIVE_INFINITY;
      centroids.forEach((centroid, index) => {
        const distance = deltaEOK(point.lab, centroid);
        if (distance < chosenDistance - Number.EPSILON) {
          chosenDistance = distance;
          chosen = index;
        }
      });
      return chosen;
    });

    centroids = centroids.map((centroid, index) => {
      let count = 0;
      const sum = { l: 0, a: 0, b: 0 };
      assignments.forEach((assignment, pointIndex) => {
        if (assignment !== index) return;
        const point = points[pointIndex];
        if (!point) return;
        count += 1;
        sum.l += point.lab.l;
        sum.a += point.lab.a;
        sum.b += point.lab.b;
      });
      return count === 0 ? centroid : { l: sum.l / count, a: sum.a / count, b: sum.b / count };
    });
  }

  const raw = centroids
    .map((lab, index) => {
      const count = assignments.filter((assignment) => assignment === index).length;
      return { id: "", rgb: oklabToRgb(lab), lab, count, population: count / points.length, protected: false };
    })
    .filter((cluster) => cluster.count > 0)
    .sort((left, right) => right.count - left.count || rgbToHex(left.rgb).localeCompare(rgbToHex(right.rgb)));

  const merged: WorkingCluster[] = [];
  for (const cluster of raw) {
    const existing = merged.find((item) => deltaEOK(item.lab, cluster.lab) < MERGE_DISTANCE);
    if (!existing) {
      merged.push({ ...cluster });
      continue;
    }
    const nextCount = existing.count + cluster.count;
    existing.lab = {
      l: (existing.lab.l * existing.count + cluster.lab.l * cluster.count) / nextCount,
      a: (existing.lab.a * existing.count + cluster.lab.a * cluster.count) / nextCount,
      b: (existing.lab.b * existing.count + cluster.lab.b * cluster.count) / nextCount,
    };
    existing.rgb = oklabToRgb(existing.lab);
    existing.count = nextCount;
    existing.population = nextCount / points.length;
  }

  return merged
    .sort((left, right) => right.count - left.count || rgbToHex(left.rgb).localeCompare(rgbToHex(right.rgb)))
    .map((cluster, index) => ({ ...cluster, id: `cluster-${String(index + 1).padStart(2, "0")}` }));
};

const markProtected = (clusters: WorkingCluster[], protectedHexes: readonly string[]): WorkingCluster[] => {
  const protectedLabs = protectedHexes.filter((hex) => /^#[0-9a-f]{6}$/i.test(hex)).map((hex) => rgbToOklab(hexToRgb(hex)));
  return clusters.map((cluster) => ({
    ...cluster,
    protected: protectedLabs.some((lab) => deltaEOK(lab, cluster.lab) < 0.04),
  }));
};

const chooseMode = (answers: NormalizedColourAnswers, clusters: readonly WorkingCluster[]): PaletteMode => {
  if (answers.baseMode === "light" || answers.baseMode === "dark") return answers.baseMode;
  if (answers.delivery === "print") return "light";
  const weightedLightness = clusters.reduce((sum, cluster) => sum + cluster.lab.l * cluster.population, 0);
  return weightedLightness >= 0.56 ? "light" : "dark";
};

const findCluster = (clusters: readonly WorkingCluster[], predicate: (cluster: WorkingCluster) => boolean): WorkingCluster => {
  const found = clusters.find(predicate) ?? clusters[0];
  if (!found) throw new Error("Colour extraction produced no clusters.");
  return found;
};

const tokenFromColour = (
  role: PaletteRoleId,
  rgb: Rgb,
  source: WorkingCluster | null,
  provenanceKind: RoleToken["provenance"]["kind"],
  adjustments: string[],
): RoleToken => ({
  id: `role-${role}`,
  role,
  hex: rgbToHex(rgb),
  rgb,
  oklch: rgbToOklch(rgb),
  provenance: {
    kind: provenanceKind,
    clusterId: source?.id ?? null,
    sourceHex: source ? rgbToHex(source.rgb) : null,
    adjustments,
  },
  reason: ROLE_REASONS[role],
  suggestedUses: ROLE_USES[role],
  contrastAgainst: {},
  warnings: [],
});

const accessibleForeground = (background: Rgb, preferred: WorkingCluster): { rgb: Rgb; kind: RoleToken["provenance"]["kind"]; adjustments: string[] } => {
  if (contrastRatio(background, preferred.rgb) >= 4.5) return { rgb: preferred.rgb, kind: "sampled", adjustments: [] };
  const black = { r: 16, g: 16, b: 16 };
  const white = { r: 250, g: 250, b: 248 };
  const rgb = contrastRatio(background, black) >= contrastRatio(background, white) ? black : white;
  return { rgb, kind: "derived", adjustments: ["Lightness moved to establish a viable body-text pair."] };
};

const buildFaithfulRoles = (clusters: readonly WorkingCluster[], mode: PaletteMode): PaletteRoles => {
  const dominant = clusters.slice(0, Math.min(4, clusters.length));
  const backgroundCluster = [...dominant].sort((left, right) =>
    mode === "light" ? right.lab.l - left.lab.l : left.lab.l - right.lab.l,
  )[0] ?? findCluster(clusters, () => true);

  const textCluster = [...clusters].sort(
    (left, right) => contrastRatio(backgroundCluster.rgb, right.rgb) - contrastRatio(backgroundCluster.rgb, left.rgb),
  )[0] ?? backgroundCluster;
  const textChoice = accessibleForeground(backgroundCluster.rgb, textCluster);

  const remaining = clusters.filter((cluster) => cluster.id !== backgroundCluster.id && cluster.id !== textCluster.id);
  const surfaceCluster = [...remaining].sort(
    (left, right) => Math.abs(left.lab.l - backgroundCluster.lab.l) - Math.abs(right.lab.l - backgroundCluster.lab.l),
  )[0] ?? null;
  const surfaceRgb = surfaceCluster?.rgb ?? mixOklab(backgroundCluster.rgb, textChoice.rgb, 0.08);

  const chromatic = [...clusters].sort((left, right) => rgbToOklch(right.rgb).c - rgbToOklch(left.rgb).c || right.population - left.population);
  const accentCluster = chromatic.find((cluster) => cluster.protected && cluster.id !== backgroundCluster.id && cluster.id !== textCluster.id)
    ?? chromatic.find((cluster) => cluster.id !== backgroundCluster.id && cluster.id !== textCluster.id)
    ?? backgroundCluster;
  const secondaryCluster = chromatic.find(
    (cluster) => cluster.id !== accentCluster.id && cluster.id !== backgroundCluster.id && cluster.id !== textCluster.id,
  );
  const onAccentPreferred = contrastRatio(accentCluster.rgb, { r: 16, g: 16, b: 16 }) >= contrastRatio(accentCluster.rgb, { r: 250, g: 250, b: 248 })
    ? { r: 16, g: 16, b: 16 }
    : { r: 250, g: 250, b: 248 };

  const mutedRgb = mixOklab(backgroundCluster.rgb, textChoice.rgb, mode === "light" ? 0.68 : 0.74);
  const lineRgb = mixOklab(backgroundCluster.rgb, textChoice.rgb, 0.25);

  const roles: PaletteRoles = {
    background: tokenFromColour("background", backgroundCluster.rgb, backgroundCluster, "sampled", []),
    surface: tokenFromColour(
      "surface",
      surfaceRgb,
      surfaceCluster,
      surfaceCluster ? "sampled" : "derived",
      surfaceCluster ? [] : ["Made from the background/text relationship because no separate source field survived."],
    ),
    text: tokenFromColour("text", textChoice.rgb, textChoice.kind === "sampled" ? textCluster : null, textChoice.kind, textChoice.adjustments),
    muted_text: tokenFromColour("muted_text", mutedRgb, textCluster, "adjusted", ["Mixed toward the background for quieter hierarchy."]),
    accent_primary: tokenFromColour("accent_primary", accentCluster.rgb, accentCluster, "sampled", []),
    on_accent: tokenFromColour("on_accent", onAccentPreferred, null, "derived", ["Chosen from near-black or near-white for the exact accent pair."]),
    line_or_rule: tokenFromColour("line_or_rule", lineRgb, textCluster, "adjusted", ["Mixed toward the background so structure stays subordinate."]),
  };
  if (secondaryCluster) {
    roles.accent_secondary = tokenFromColour("accent_secondary", secondaryCluster.rgb, secondaryCluster, "sampled", []);
  }
  return roles;
};

const transformedToken = (token: RoleToken, rgb: Rgb, adjustment: string): RoleToken => ({
  ...token,
  rgb,
  hex: rgbToHex(rgb),
  oklch: rgbToOklch(rgb),
  provenance: {
    ...token.provenance,
    kind: token.provenance.kind === "user_supplied" ? "user_supplied" : "adjusted",
    adjustments: [...token.provenance.adjustments, adjustment],
  },
  contrastAgainst: {},
  warnings: [],
});

const quieterRoles = (faithful: PaletteRoles, mode: PaletteMode): PaletteRoles => {
  const background = transformedToken(
    faithful.background,
    adjustOklch(faithful.background.rgb, { l: mode === "light" ? 0.94 : 0.16, cScale: 0.28 }),
    "Chroma reduced and lightness steadied for repeated pages.",
  );
  const surface = transformedToken(
    faithful.surface,
    adjustOklch(faithful.surface.rgb, { l: mode === "light" ? 0.88 : 0.23, cScale: 0.34 }),
    "Pulled closer to the background so panels do not become decoration.",
  );
  const textPreferred = contrastRatio(background.rgb, faithful.text.rgb) >= 4.5
    ? faithful.text.rgb
    : contrastRatio(background.rgb, { r: 16, g: 16, b: 16 }) >= contrastRatio(background.rgb, { r: 250, g: 250, b: 248 })
      ? { r: 16, g: 16, b: 16 }
      : { r: 250, g: 250, b: 248 };
  const text = transformedToken(faithful.text, textPreferred, "Rechecked against the quieter background.");
  const muted = transformedToken(faithful.muted_text, mixOklab(background.rgb, text.rgb, 0.68), "Rebuilt from the quieter text/background pair.");
  const accent = transformedToken(faithful.accent_primary, adjustOklch(faithful.accent_primary.rgb, { cScale: 0.72 }), "Chroma reduced without abandoning the source hue.");
  const onAccentRgb = contrastRatio(accent.rgb, { r: 16, g: 16, b: 16 }) >= contrastRatio(accent.rgb, { r: 250, g: 250, b: 248 })
    ? { r: 16, g: 16, b: 16 }
    : { r: 250, g: 250, b: 248 };
  const roles: PaletteRoles = {
    background,
    surface,
    text,
    muted_text: muted,
    accent_primary: accent,
    on_accent: transformedToken(faithful.on_accent, onAccentRgb, "Rechecked against the adjusted accent."),
    line_or_rule: transformedToken(faithful.line_or_rule ?? faithful.muted_text, mixOklab(background.rgb, text.rgb, 0.23), "Rebuilt for the quieter field."),
  };
  if (faithful.accent_secondary) {
    roles.accent_secondary = transformedToken(faithful.accent_secondary, adjustOklch(faithful.accent_secondary.rgb, { cScale: 0.64 }), "Reduced to remain a secondary voice.");
  }
  return roles;
};

const higherContrastRoles = (faithful: PaletteRoles, mode: PaletteMode): PaletteRoles => {
  const backgroundRgb = mode === "light" ? { r: 250, g: 249, b: 246 } : { r: 18, g: 18, b: 19 };
  const textRgb = mode === "light" ? { r: 20, g: 20, b: 22 } : { r: 250, g: 249, b: 246 };
  const surfaceRgb = mode === "light" ? mixOklab(backgroundRgb, textRgb, 0.08) : mixOklab(backgroundRgb, textRgb, 0.13);
  const accent = faithful.accent_primary;
  const onAccentRgb = contrastRatio(accent.rgb, { r: 16, g: 16, b: 16 }) >= contrastRatio(accent.rgb, { r: 250, g: 250, b: 248 })
    ? { r: 16, g: 16, b: 16 }
    : { r: 250, g: 250, b: 248 };
  const roles: PaletteRoles = {
    background: transformedToken(faithful.background, backgroundRgb, "A constructed field creates dependable room for body text."),
    surface: transformedToken(faithful.surface, surfaceRgb, "Separated clearly from the main field for rough viewing conditions."),
    text: transformedToken(faithful.text, textRgb, "Moved to a strong exact pair for projection and small screens."),
    muted_text: transformedToken(faithful.muted_text, mixOklab(backgroundRgb, textRgb, 0.72), "Kept subordinate without becoming decorative fog."),
    accent_primary: accent,
    on_accent: transformedToken(faithful.on_accent, onAccentRgb, "Rechecked against the source-derived accent."),
    line_or_rule: transformedToken(faithful.line_or_rule ?? faithful.muted_text, mixOklab(backgroundRgb, textRgb, 0.3), "Raised enough to survive weaker screens."),
  };
  if (faithful.accent_secondary) roles.accent_secondary = faithful.accent_secondary;
  return roles;
};

const fillContrast = (roles: PaletteRoles): PaletteRoles => {
  const entries = Object.entries(roles) as Array<[PaletteRoleId, RoleToken]>;
  const filled = Object.fromEntries(
    entries.map(([id, token]) => {
      const against: Record<string, number> = {};
      for (const [otherId, other] of entries) {
        if (otherId === id) continue;
        against[otherId] = Number(contrastRatio(token.rgb, other.rgb).toFixed(2));
      }
      const warnings: Warning[] = [...token.warnings];
      if (id === "text" && (against.background ?? 1) < 4.5) {
        warnings.push({ code: "TEXT_BACKGROUND_BELOW_4_5", severity: "blocking", message: "Body text/background pair is below 4.5:1." });
      }
      if (id === "muted_text" && (against.background ?? 1) < 3) {
        warnings.push({ code: "MUTED_TEXT_NEEDS_CARE", severity: "caution", message: "Secondary text is weak against the main background; keep it large or revise." });
      }
      return [id, { ...token, contrastAgainst: against, warnings }];
    }),
  );
  return filled as PaletteRoles;
};

const roleClusterMap = (roles: PaletteRoles): Map<string, string[]> => {
  const map = new Map<string, string[]>();
  for (const [roleId, token] of Object.entries(roles) as Array<[PaletteRoleId, RoleToken]>) {
    if (!token.provenance.clusterId) continue;
    map.set(token.provenance.clusterId, [...(map.get(token.provenance.clusterId) ?? []), roleId]);
  }
  return map;
};

const sourceMapFor = (clusters: readonly WorkingCluster[], roles: PaletteRoles): SourceCluster[] => {
  const used = roleClusterMap(roles);
  return clusters.map((cluster) => ({
    id: cluster.id,
    hex: rgbToHex(cluster.rgb),
    population: Number(cluster.population.toFixed(6)),
    protected: cluster.protected,
    usedByRoles: used.get(cluster.id) ?? [],
  }));
};

const characterize = (roles: PaletteRoles, clusters: readonly WorkingCluster[], strategy: PaletteStrategy, mode: PaletteMode): PaletteSystem["character"] => {
  const roleTokens = Object.values(roles);
  const averageChroma = roleTokens.reduce((sum, token) => sum + token.oklch.c, 0) / roleTokens.length;
  const bodyContrast = contrastRatio(roles.text.rgb, roles.background.rgb);
  const hues = clusters.map((cluster) => rgbToOklch(cluster.rgb).h).filter((hue): hue is number => hue !== null);
  const warm = hues.filter((hue) => hue < 110 || hue >= 330).length;
  const cool = hues.filter((hue) => hue >= 160 && hue < 310).length;
  const temperature = warm > cool * 1.5 ? "warm" : cool > warm * 1.5 ? "cool" : warm > 0 && cool > 0 ? "mixed" : "balanced";
  return {
    chroma: averageChroma < 0.035 ? "restrained" : averageChroma < 0.095 ? "moderate" : "vivid",
    contrast: bodyContrast >= 10 ? "sharp" : bodyContrast >= 4.5 ? "clear" : "soft",
    lightness: mode === "light" ? "light-led" : "shadow-led",
    temperature,
    variety: clusters.length <= 3 ? "tight" : clusters.length <= 7 ? "related" : "varied",
    sourceDistance: strategy === "faithful" ? "close" : strategy === "quieter" ? "edited" : "constructed",
  };
};

const chooseStrategy = (answers: NormalizedColourAnswers): { strategy: PaletteStrategy; ruleId: string; reason: string } => {
  if (answers.delivery === "live_room" || answers.delivery === "phone") {
    return { strategy: "higher_contrast", ruleId: "R02_HOSTILE_VIEWING", reason: "Projection and small screens punish subtle contrast first." };
  }
  if (answers.delivery === "mixed") {
    return { strategy: "quieter", ruleId: "R03_MIXED_DELIVERY", reason: "Mixed delivery benefits from a controlled primary system and a contrast-first companion." };
  }
  if (answers.delivery === "print") {
    return { strategy: "quieter", ruleId: "R04_PRINT_CAUTION", reason: "A restrained light system is usually steadier in ordinary office printing; this is not a print proof." };
  }
  if (answers.contentLoad === "dense") {
    return { strategy: "quieter", ruleId: "R05_DENSE_INFORMATION", reason: "Dense pages need hierarchy and repeatability more than maximum palette drama." };
  }
  if (answers.contentLoad === "custom") {
    return { strategy: "quieter", ruleId: "R05A_CUSTOM_COPY", reason: "Custom copy makes quieter fields the provisional start; measured layout still decides." };
  }
  if (answers.contentLoad === "spare" && answers.sourceRelationship === "reference_is_identity") {
    return { strategy: "faithful", ruleId: "R06_SPARSE_IDENTITY", reason: "Sparse pages can carry a closer relationship to the source." };
  }
  if (answers.sourceRelationship === "reference_is_identity" || answers.sourceRelationship === "protect_one") {
    return { strategy: "faithful", ruleId: "R07_PROTECT_SOURCE", reason: "Declared source fidelity outranks an aesthetic guess." };
  }
  return { strategy: "quieter", ruleId: "TIE_BREAK", reason: "When context is unresolved, safer repetition wins the first pass." };
};

const dataWarningsFor = (answers: NormalizedColourAnswers): Warning[] => {
  if (answers.dataNeed === "none" || answers.dataNeed === "unknown") return [];
  if (answers.dataNeed === "categorical") {
    return [{
      code: "CATEGORICAL_DATA_REQUIRES_SEPARATE_PROOF",
      severity: "caution",
      message: `${answers.dataCount ?? "The requested number of"} categories need pairwise distinction, labels, and shape/order checks. Deck accents alone are not a data system.`,
    }];
  }
  if (answers.dataNeed === "sequential") {
    return [{
      code: "SEQUENTIAL_SCALE_NOT_BUILT",
      severity: "blocking",
      message: `${answers.dataCount ?? "The requested number of"} steps need a separately generated scale with monotonic lightness. Do not stretch the deck accents into one.`,
    }];
  }
  return [{
    code: "DIVERGING_SCALE_NOT_BUILT",
    severity: "blocking",
    message: `A diverging scale needs a meaningful midpoint${answers.divergingMidpoint ? ` (${answers.divergingMidpoint})` : ""}, balanced arms, labels, and separate testing. The deck palette is not that scale.`,
  }];
};

const buildSystem = (
  strategy: PaletteStrategy,
  mode: PaletteMode,
  faithful: PaletteRoles,
  clusters: readonly WorkingCluster[],
  source: PixelSource,
  recommended: boolean,
  rationale: string[],
  answers: NormalizedColourAnswers,
  companion = false,
): PaletteSystem => {
  const roles = fillContrast(
    strategy === "faithful" ? faithful : strategy === "quieter" ? quieterRoles(faithful, mode) : higherContrastRoles(faithful, mode),
  );
  const names: Record<PaletteStrategy, string> = {
    faithful: "Kept close",
    quieter: "Room to breathe",
    higher_contrast: "Lights on",
  };
  const warnings = [...Object.values(roles).flatMap((role) => role.warnings), ...dataWarningsFor(answers)];
  if (strategy === "higher_contrast") {
    warnings.push({ code: "CONSTRUCTED_FIELDS", severity: "note", message: "Large fields were constructed for stronger contrast; source colour stays most visible in accents." });
  }
  return {
    schemaVersion: "1.0.0",
    id: `${strategy}-${mode}-${source.workingPixelHash.slice(0, 12)}`,
    name: companion ? `${names[strategy]} — ${mode === "light" ? "light" : "dark"} companion` : names[strategy],
    strategy,
    mode,
    recommended,
    rationale,
    character: characterize(roles, clusters, strategy, mode),
    roles,
    sourceMap: sourceMapFor(clusters, roles),
    warnings,
    determinism: {
      workingPixelHash: source.workingPixelHash,
      crop: source.crop ?? { x: 0, y: 0, width: 1, height: 1 },
      engineVersion: COLOUR_ENGINE_VERSION,
      variationIndex: 0,
      capabilities: ["rgba8_input", "stratified_sample", "oklab_kmeans", "ordered_recommendation", "pair_specific_contrast", "companion_mode_output", "data_need_truth_boundary"],
    },
  };
};

const recommendationFor = (
  systems: readonly PaletteSystem[],
  answers: NormalizedColourAnswers,
  supplied: ColourAnswers,
  choice: ReturnType<typeof chooseStrategy>,
): ColourRecommendation => {
  const recommended = systems.find((system) => system.recommended);
  if (!recommended) throw new Error("Recommended palette system missing.");
  const unknowns = (Object.keys(DEFAULT_ANSWERS) as Array<keyof typeof DEFAULT_ANSWERS>).filter((key) => {
    const value = answers[key];
    return value === "unknown" || value === "decide" || supplied[key] === undefined;
  });
  if (answers.contentLoad === "custom") unknowns.push("contentLoad");
  if (["categorical", "sequential", "diverging"].includes(answers.dataNeed) && answers.dataCount === undefined) unknowns.push("dataCount");
  if (answers.dataNeed === "diverging" && !answers.divergingMidpoint) unknowns.push("divergingMidpoint");
  const unresolved = [...new Set(unknowns)];
  const dataRuleId = answers.dataNeed === "categorical"
    ? "R13_CATEGORICAL_DATA"
    : answers.dataNeed === "sequential"
      ? "R14_SEQUENTIAL_DATA"
      : answers.dataNeed === "diverging"
        ? "R15_DIVERGING_DATA"
        : null;
  const because: ColourRecommendation["because"] = [
    {
      kind: supplied.delivery === undefined ? "declared_default" : "user_answer",
      label: "Viewing",
      value: answers.delivery,
      ruleId: choice.ruleId,
    },
    {
      kind: supplied.contentLoad === undefined ? "declared_default" : "user_answer",
      label: "Page pressure",
      value: answers.contentLoad,
      ruleId: choice.ruleId,
    },
    {
      kind: supplied.baseMode === undefined ? "declared_default" : "user_answer",
      label: "Working field",
      value: answers.baseMode,
      ruleId: answers.baseMode === "both" ? "R11_BOTH_MODES" : answers.baseMode === "decide" ? "R12_DECIDE_MODE" : "R10_EXPLICIT_MODE",
    },
    {
      kind: supplied.dataNeed === undefined ? "declared_default" : "user_answer",
      label: "Data colour",
      value: answers.dataNeed,
      ruleId: dataRuleId,
    },
    { kind: "measured_fact", label: "Body pair", value: `${recommended.roles.text.contrastAgainst.background ?? 1}:1`, ruleId: "R01_BLOCK_UNREADABLE_CORE_PAIR" },
  ];
  const alternatives = systems
    .filter((system) => !system.recommended)
    .slice(0, 2)
    .map((system) => ({
      systemId: system.id,
      strategy: system.strategy,
      label: "worth_comparing" as const,
      whenUseful: system.rationale[0] ?? "Compare it under the same words and geometry.",
      tradeOff:
        system.strategy === "faithful"
          ? "Closer source fidelity leaves less room for dense copy."
          : system.strategy === "quieter"
            ? "More restraint means less literal source drama."
            : "Stronger legibility requires constructed large fields.",
    }));

  return {
    schemaVersion: "1.0.0",
    status: unresolved.length === 0 ? "best_fit_for_answers" : "sensible_first_pass",
    recommendedSystemId: recommended.id,
    recommendedStrategy: recommended.strategy,
    recommendedMode: recommended.mode,
    headline: recommended.strategy === "faithful" ? "Keep the world. Give the words somewhere to stand." : recommended.strategy === "quieter" ? "Same light. More room for the deck to speak." : "When the room fights back, keep the meaning visible.",
    because,
    preserved: [
      { roleId: "accent_primary", summary: "A distinctive source colour remains the primary accent.", provenanceKind: recommended.roles.accent_primary.provenance.kind },
    ],
    changed: Object.values(recommended.roles)
      .filter((role) => role.provenance.kind === "adjusted" || role.provenance.kind === "derived")
      .slice(0, 12)
      .map((role) => ({ roleId: role.role, summary: role.provenance.adjustments.join(" ") || "Adjusted for this system.", provenanceKind: role.provenance.kind })),
    weaknesses: recommended.warnings.slice(0, 12).map((warning) => ({
      code: warning.code,
      summary: warning.message,
      affectedUse: warning.code.includes("TEXT") ? "reading" : "system",
      severity: warning.severity === "blocking" ? "fix_before_use" : warning.severity === "caution" ? "use_with_care" : "note",
    })),
    uncertainty: unresolved.slice(0, 5).map((inputId) => ({
      inputId,
      assumption: inputId === "contentLoad"
        ? "Custom copy has not been measured in the real specimen geometry yet."
        : inputId === "dataCount"
          ? "Series count is still unknown."
          : inputId === "divergingMidpoint"
            ? "No meaningful midpoint has been named."
            : `Used visible default: ${String(answers[inputId as keyof NormalizedColourAnswers])}.`,
      howToResolve: inputId === "contentLoad"
        ? "Render the supplied copy with exact fonts and geometry, then feed the observed fit state back into the decision."
        : "Answer this context question, then rerun the same deterministic engine.",
    })),
    alternatives,
    nextAction: recommended.warnings.some((warning) => warning.severity === "blocking")
      ? { id: "resolve_warning", label: "Resolve the honest blocker", reason: "One requested use needs a separate system or proof before export." }
      : unresolved.length > 0
      ? { id: "answer_context", label: "Fit this to my deck", reason: "One or more visible defaults still shape this first pass." }
      : { id: "inspect_specimens", label: "See it doing the work", reason: "Identical specimens expose where this system holds and where it complains." },
  };
};

export const buildColourSystems = (
  source: PixelSource,
  suppliedAnswers: ColourAnswers = {},
): { systems: PaletteSystem[]; companionSystems: PaletteSystem[]; recommendation: ColourRecommendation } => {
  assertPixelSource(source);
  const points = samplePixels(source);
  if (points.length === 0) throw new Error("Pixel source produced no analysis samples.");
  const clusters = markProtected(clusterPoints(points), source.protectedHexes ?? []);
  const answers = normalizeAnswers(suppliedAnswers);
  const mode = chooseMode(answers, clusters);
  const faithful = buildFaithfulRoles(clusters, mode);
  const choice = chooseStrategy(answers);
  const strategies: PaletteStrategy[] = ["faithful", "quieter", "higher_contrast"];
  const systems = strategies.map((strategy) =>
    buildSystem(
      strategy,
      mode,
      faithful,
      clusters,
      source,
      strategy === choice.strategy,
      [
        strategy === "faithful"
          ? "Keeps the closest viable relationship to dominant and distinctive source colours."
          : strategy === "quieter"
            ? "Restrains large fields so words, repetition, and denser information have room."
            : "Uses stronger exact pairs for projection, small screens, and uncertain viewing.",
        strategy === choice.strategy ? choice.reason : "Held beside the recommendation as a truthful alternative.",
      ],
      answers,
    ),
  );
  const needsCompanion = answers.baseMode === "both" || answers.baseMode === "decide";
  const companionMode: PaletteMode = mode === "light" ? "dark" : "light";
  const companionFaithful = needsCompanion ? buildFaithfulRoles(clusters, companionMode) : null;
  const companionSystems = companionFaithful
    ? strategies.map((strategy) =>
        buildSystem(
          strategy,
          companionMode,
          companionFaithful,
          clusters,
          source,
          false,
          [
            answers.baseMode === "both"
              ? "You asked for both working fields. This is the separately built companion, not an inversion."
              : "The undecided route keeps a separately built companion available for inspection.",
            "Companion roles keep their own exact contrast pairs and provenance.",
          ],
          answers,
          true,
        ),
      )
    : [];
  return { systems, companionSystems, recommendation: recommendationFor(systems, answers, suppliedAnswers, choice) };
};
