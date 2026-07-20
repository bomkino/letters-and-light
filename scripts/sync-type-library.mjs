import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const curationPath = join(root, "data/type-library/curation.v1.json");
const lockPath = join(root, "data/type-library/font-library.lock.json");
const publicRoot = join(root, "public/fonts/type-library");
const cssPath = join(publicRoot, "type-library.css");
const creditsPath = join(publicRoot, "FONT-CREDITS.md");
const googleRaw = "https://raw.githubusercontent.com/google/fonts/main/ofl";
const cssEndpoint = "https://fonts.googleapis.com/css2";
const browserAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const wantedSubsets = new Set(["latin", "latin-ext"]);

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const fetchBytes = async (url, headers = {}) => {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return Buffer.from(await response.arrayBuffer());
};
const fetchText = async (url, headers = {}) => (await fetchBytes(url, headers)).toString("utf8");
const strings = (text, key) => [...text.matchAll(new RegExp(`${key}:\\s*"([^"]*)"`, "g"))].map((match) => match[1]);
const firstString = (text, key) => strings(text, key)[0] ?? null;
const blocks = (text, name) => [...text.matchAll(new RegExp(`${name}\\s*\\{([\\s\\S]*?)\\n\\}`, "g"))].map((match) => match[1]);
const cssValue = (body, property) => body.match(new RegExp(`${property}:\\s*([^;]+);`))?.[1]?.trim() ?? null;
const cssUrls = (css) => {
  const records = [];
  const pattern = /\/\*\s*([^*]+?)\s*\*\/\s*@font-face\s*\{([\s\S]*?)\}/g;
  for (const match of css.matchAll(pattern)) {
    const body = match[2] ?? "";
    const url = body.match(/src:\s*url\(([^)]+)\)/)?.[1] ?? null;
    if (!url) continue;
    records.push({
      subset: (match[1] ?? "unknown").trim(),
      style: cssValue(body, "font-style") ?? "normal",
      weight: cssValue(body, "font-weight") ?? "400",
      stretch: cssValue(body, "font-stretch"),
      unicodeRange: cssValue(body, "unicode-range"),
      url,
    });
  }
  return records;
};
const safeFilePart = (value) => value.replace(/[^a-zA-Z0-9.-]+/g, "-").replace(/^-|-$/g, "");
const nearestWeights = (weights) => {
  const unique = [...new Set(weights)].sort((a, b) => a - b);
  if (unique.length <= 2) return unique;
  const nearest = (target) => unique.reduce((best, value) => Math.abs(value - target) < Math.abs(best - target) ? value : best, unique[0]);
  return [...new Set([nearest(400), nearest(700)])].sort((a, b) => a - b);
};

const parseMetadata = (text) => {
  const fontBlocks = blocks(text, "fonts");
  const axes = blocks(text, "axes").map((body) => ({
    tag: firstString(body, "tag") ?? "",
    min: Number(body.match(/min_value:\s*([-0-9.]+)/)?.[1] ?? 0),
    max: Number(body.match(/max_value:\s*([-0-9.]+)/)?.[1] ?? 0),
  })).filter((axis) => axis.tag);
  const fonts = fontBlocks.map((body) => ({
    style: firstString(body, "style") ?? "normal",
    weight: Number(body.match(/weight:\s*(\d+)/)?.[1] ?? 400),
    filename: firstString(body, "filename"),
    version: firstString(body, "full_name"),
    copyright: firstString(body, "copyright"),
  }));
  return {
    family: firstString(text, "name"),
    designer: firstString(text, "designer") ?? "Unknown",
    license: firstString(text, "license"),
    category: firstString(text, "category") ?? "UNKNOWN",
    dateAdded: firstString(text, "date_added"),
    subsets: strings(text, "subsets"),
    axes,
    fonts,
    upstreamRepository: firstString(text, "repository_url"),
    upstreamCommit: firstString(text, "commit"),
  };
};

const cssQueryCandidates = (metadata) => {
  const standardAxes = metadata.axes.filter((axis) => ["opsz", "wdth", "wght"].includes(axis.tag)).sort((a, b) => a.tag.localeCompare(b.tag));
  const hasItalic = metadata.fonts.some((font) => font.style === "italic");
  const candidates = [];
  if (standardAxes.length) {
    const names = [...(hasItalic ? ["ital"] : []), ...standardAxes.map((axis) => axis.tag)];
    const values = standardAxes.map((axis) => `${axis.min}..${axis.max}`);
    const tuples = hasItalic ? [`0,${values.join(",")}`, `1,${values.join(",")}`] : [values.join(",")];
    candidates.push(`:${names.join(",")}@${tuples.join(";")}`);
  }
  const weights = nearestWeights(metadata.fonts.map((font) => font.weight));
  if (weights.length) {
    if (hasItalic) candidates.push(`:ital,wght@${weights.flatMap((weight) => [`0,${weight}`, `1,${weight}`]).join(";")}`);
    candidates.push(`:wght@${weights.join(";")}`);
  }
  candidates.push("");
  return [...new Set(candidates)];
};

const fetchCss = async (family, metadata) => {
  const errors = [];
  for (const suffix of cssQueryCandidates(metadata)) {
    const url = new URL(cssEndpoint);
    url.searchParams.set("family", `${family}${suffix}`);
    url.searchParams.set("display", "swap");
    try {
      const css = await fetchText(url, { "User-Agent": browserAgent });
      const records = cssUrls(css).filter((record) => wantedSubsets.has(record.subset));
      if (records.length) return { requestUrl: url.toString(), records };
      errors.push(`${url}: no Latin records`);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  throw new Error(`${family}: CSS acquisition failed. ${errors.join(" | ")}`);
};

const mapLimit = async (items, limit, worker) => {
  const output = new Array(items.length);
  let cursor = 0;
  const run = async () => {
    while (cursor < items.length) {
      const index = cursor++;
      output[index] = await worker(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return output;
};

const curationBytes = await readFile(curationPath);
const curation = JSON.parse(curationBytes.toString("utf8"));
const families = curation.shelves.flatMap((shelf) => shelf.families.map((font) => ({ shelf, font })));
if (families.length !== 64) throw new Error(`Curation must contain 64 families; found ${families.length}.`);
if (new Set(families.map(({ font }) => font.id)).size !== families.length) throw new Error("Curation contains duplicate font IDs.");

await rm(publicRoot, { recursive: true, force: true });
await mkdir(publicRoot, { recursive: true });

const providerCommit = await fetch("https://api.github.com/repos/google/fonts/commits/main", { headers: { "User-Agent": "pitch.dog Letters & Light font provenance" } })
  .then((response) => response.ok ? response.json() : null)
  .then((payload) => payload?.sha ?? "unresolved");

const acquired = await mapLimit(families, 6, async ({ shelf, font }, index) => {
  const metadataUrl = `${googleRaw}/${font.slug}/METADATA.pb`;
  const licenseUrl = `${googleRaw}/${font.slug}/OFL.txt`;
  const [metadataText, licenseText] = await Promise.all([fetchText(metadataUrl), fetchText(licenseUrl)]);
  const metadata = parseMetadata(metadataText);
  if (metadata.family !== font.family) throw new Error(`${font.id}: expected ${font.family}; provider says ${metadata.family}.`);
  if (metadata.license !== "OFL") throw new Error(`${font.id}: ${metadata.license ?? "unknown"} is outside the OFL-only policy.`);
  const css = await fetchCss(font.family, metadata);
  const directory = join(publicRoot, font.id);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "OFL.txt"), licenseText);
  const files = [];
  for (const [fileIndex, record] of css.records.entries()) {
    const name = `${safeFilePart(record.style)}-${safeFilePart(record.weight)}-${safeFilePart(record.stretch ?? "normal")}-${safeFilePart(record.subset)}-${fileIndex + 1}.woff2`;
    const bytes = await fetchBytes(record.url);
    await writeFile(join(directory, name), bytes);
    files.push({
      file: `public/fonts/type-library/${font.id}/${name}`,
      publicUrl: `/fonts/type-library/${font.id}/${name}`,
      sourceUrl: record.url,
      sha256: sha256(bytes),
      bytes: bytes.length,
      style: record.style,
      weight: record.weight,
      stretch: record.stretch,
      subset: record.subset,
      unicodeRange: record.unicodeRange,
    });
  }
  process.stdout.write(`\r${String(index + 1).padStart(2, " ")}/${families.length} ${font.family.padEnd(30, " ")}`);
  return {
    id: font.id,
    family: font.family,
    slug: font.slug,
    shelfId: shelf.id,
    class: shelf.class,
    character: shelf.character,
    roles: font.roles ?? shelf.roles,
    density: font.density ?? shelf.density,
    tones: font.tones ?? shelf.tones,
    artifacts: font.artifacts ?? shelf.artifacts,
    lanes: font.lanes ?? shelf.lanes,
    oneThingNotToDo: font.oneThingNotToDo ?? shelf.oneThingNotToDo,
    designer: metadata.designer,
    category: metadata.category,
    dateAdded: metadata.dateAdded,
    subsets: metadata.subsets,
    axes: metadata.axes,
    hasItalic: metadata.fonts.some((item) => item.style === "italic"),
    weights: [...new Set(metadata.fonts.map((item) => item.weight))].sort((a, b) => a - b),
    license: {
      spdx: "OFL-1.1",
      sourceUrl: licenseUrl,
      localFile: `public/fonts/type-library/${font.id}/OFL.txt`,
      sha256: sha256(Buffer.from(licenseText)),
    },
    source: {
      provider: "Google Fonts",
      metadataUrl,
      cssRequestUrl: css.requestUrl,
      upstreamRepository: metadata.upstreamRepository,
      upstreamCommit: metadata.upstreamCommit,
      providerCommit,
    },
    previewStatus: "exact_self_hosted",
    deckStatus: "requires_application_validation",
    files,
  };
});
process.stdout.write("\n");

const sorted = [...acquired].sort((a, b) => a.id.localeCompare(b.id));
const cssLines = [
  "/* Generated by scripts/sync-type-library.mjs. Exact self-hosted files; do not hand-edit. */",
  "",
];
for (const font of sorted) {
  for (const file of font.files) {
    cssLines.push("@font-face {");
    cssLines.push(`  font-family: ${JSON.stringify(font.family)};`);
    cssLines.push(`  font-style: ${file.style};`);
    cssLines.push(`  font-weight: ${file.weight};`);
    if (file.stretch) cssLines.push(`  font-stretch: ${file.stretch};`);
    cssLines.push("  font-display: swap;");
    cssLines.push(`  src: url(${JSON.stringify(`./${font.id}/${file.file.split("/").at(-1)}`)}) format("woff2");`);
    if (file.unicodeRange) cssLines.push(`  unicode-range: ${file.unicodeRange};`);
    cssLines.push("}", "");
  }
}
await writeFile(cssPath, `${cssLines.join("\n")}\n`);

const credits = [
  "# Letters & Light type-library credits",
  "",
  "Exact files acquired from Google Fonts for local preview. Every family remains under SIL Open Font License 1.1. See the adjacent family directory for its full licence and copyright notice.",
  "",
  `Provider repository commit: \`${providerCommit}\``,
  "",
  "| Family | Designer | Upstream | Local files |",
  "|---|---|---|---:|",
  ...sorted.map((font) => `| ${font.family} | ${font.designer} | [source](${font.source.upstreamRepository ?? font.source.metadataUrl}) | ${font.files.length} |`),
  "",
];
await writeFile(creditsPath, credits.join("\n"));

const lock = {
  schemaVersion: "1.0.0",
  version: curation.version,
  generatedOn: new Date().toISOString(),
  curationSha256: sha256(curationBytes),
  provider: {
    name: "Google Fonts",
    repository: curation.providerRepository,
    commit: providerCommit,
    runtimeRequests: 0,
  },
  policy: {
    exactFilesRequiredForPreview: true,
    allowedLicenses: curation.licensePolicy,
    remoteRuntimeFontsForbidden: true,
    recommendationDoesNotClaimDeckApplicationValidation: true,
  },
  shelves: curation.shelves.map(({ families: _families, ...shelf }) => shelf),
  fonts: sorted,
};
await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`);

const totalBytes = sorted.flatMap((font) => font.files).reduce((sum, file) => sum + file.bytes, 0);
console.log(`Type library synced: ${sorted.length} families; ${sorted.flatMap((font) => font.files).length} WOFF2 files; ${(totalBytes / 1024 / 1024).toFixed(2)} MiB; zero runtime requests.`);
