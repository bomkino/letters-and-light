import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const failures = [];
const checks = [];
const pass = (message) => checks.push(message);
const fail = (message) => failures.push(message);
const assert = (condition, message) => (condition ? pass(message) : fail(message));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const ignoredDirectories = new Set([".git", ".next", ".wrangler", "dist", "node_modules"]);
const walk = async (directory) => {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignoredDirectories.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else files.push(path);
  }
  return files;
};

const files = await walk(root);
const relativeFiles = files.map((path) => relative(root, path));
assert(!relativeFiles.some((path) => path.split("/").some((part) => part === ".DS_Store" || part.startsWith("Icon"))), "Drive metadata impostors are absent.");

const forbiddenRoots = ["MEGA-MEGA-HANDOVER", "REBUILD-HANDOVER", "Verification", "References", ".playwright-cli", "Kimi K3 - Website"];
for (const name of forbiddenRoots) {
  const present = await stat(join(root, name)).then(() => true).catch(() => false);
  assert(!present, `Private or historical working material is absent: ${name}.`);
}

const jsonFiles = relativeFiles.filter(
  (path) => (path.startsWith("data/") || path.startsWith("src/contracts/")) && extname(path) === ".json",
);
for (const path of jsonFiles) {
  try {
    JSON.parse(await readFile(join(root, path), "utf8"));
  } catch (error) {
    fail(`Invalid JSON: ${path} — ${error.message}`);
  }
}
assert(jsonFiles.length === 32, `Public contracts and data parse (${jsonFiles.length} JSON files found).`);

const manifest = JSON.parse(await readFile(join(root, "data/asset-manifest.json"), "utf8"));
assert(manifest.assets.length === 8, "The public asset allow-list contains exactly eight intentional assets.");
for (const asset of manifest.assets) {
  try {
    assert(asset.path.startsWith("public/"), `Public asset stays inside public/: ${asset.path}.`);
    const bytes = await readFile(join(root, asset.path));
    assert(sha256(bytes) === asset.sha256, `Public asset hash matches: ${asset.path}.`);
  } catch (error) {
    fail(`Public asset missing or unreadable: ${asset.path} — ${error.message}`);
  }
}

const runtimeFiles = relativeFiles.filter((path) => /^(src|web\/src)\/.+\.(ts|tsx)$/.test(path));
const runtimeText = (await Promise.all(runtimeFiles.map((path) => readFile(join(root, path), "utf8")))).join("\n");
const networkPrimitives = [/\bfetch\s*\(/, /XMLHttpRequest/, /sendBeacon/, /new\s+WebSocket\s*\(/, /new\s+EventSource\s*\(/];
assert(networkPrimitives.every((pattern) => !pattern.test(runtimeText)), "Runtime source contains no outbound network primitive.");

const textExtensions = new Set([".cjs", ".css", ".html", ".js", ".json", ".md", ".mjs", ".ts", ".tsx", ".yml", ".yaml"]);
const scannable = relativeFiles.filter((path) => textExtensions.has(extname(path)) && !path.startsWith("public/fonts/"));
const privatePatterns = [
  { pattern: /\/Volumes\//, label: "absolute /Volumes path" },
  { pattern: /\/Users\//, label: "absolute /Users path" },
  { pattern: /-----BEGIN (?:RSA |OPENSSH )?PRIVATE KEY-----/, label: "private key" },
  { pattern: /\bgh[opsu]_[A-Za-z0-9]{20,}\b/, label: "GitHub credential" },
  { pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/, label: "API credential" },
];
for (const path of scannable) {
  const text = await readFile(join(root, path), "utf8");
  for (const candidate of privatePatterns) {
    if (candidate.pattern.test(text)) fail(`${path} contains a ${candidate.label}.`);
  }
}
assert(!failures.some((item) => item.includes("absolute /") || item.includes("credential") || item.includes("private key")), "No private path or obvious credential enters the public tree.");

for (const required of ["README.md", "LICENSE", "LICENSES.md", "TRADEMARKS.md", "CONTRIBUTING.md", "CODE_OF_CONDUCT.md", "SECURITY.md", "GOVERNANCE.md"]) {
  assert(relativeFiles.includes(required), `Public release includes ${required}.`);
}

if (failures.length > 0) {
  console.error(`Public-release validation failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Public-release validation passed: ${checks.length} checks; ${jsonFiles.length} JSON surfaces; ${manifest.assets.length} intentional assets; no private working material, private paths, credentials, or runtime network primitives.`);
