import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const dist = join(root, "dist");
const failures = [];
const checks = [];
const assert = (condition, message) => (condition ? checks.push(message) : failures.push(message));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const walk = async (directory) => {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else files.push(path);
  }
  return files;
};

assert(await stat(join(dist, "server/index.js")).then((item) => item.isFile()).catch(() => false), "Sites server entry exists.");
const sourceHosting = JSON.parse(await readFile(join(root, ".openai/hosting.json"), "utf8"));
const builtHosting = JSON.parse(await readFile(join(dist, ".openai/hosting.json"), "utf8"));
assert(typeof sourceHosting.project_id === "string" && sourceHosting.project_id.length > 0, "Sites project ID is persisted.");
assert(builtHosting.project_id === sourceHosting.project_id, "Built Sites metadata matches source metadata.");

const lock = JSON.parse(await readFile(join(root, "data/type-library/font-library.lock.json"), "utf8"));
const expected = lock.fonts.flatMap((font) => font.files);
const builtFiles = await walk(dist);
const builtFonts = builtFiles.filter((path) => path.endsWith(".woff2"));
assert(builtFonts.length === expected.length, `Production build carries all ${expected.length} exact font resources (${builtFonts.length} found).`);
for (const font of expected) {
  const suffix = font.publicUrl.replace(/^\//, "");
  const match = builtFonts.find((path) => relative(dist, path).endsWith(suffix));
  if (!match) failures.push(`Built font missing: ${font.publicUrl}.`);
  else assert(sha256(await readFile(match)) === font.sha256, `Built font hash matches: ${font.publicUrl}.`);
}

if (failures.length > 0) {
  console.error(`Site-build validation failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Site-build validation passed: ${checks.length} checks; deployable server entry; ${expected.length}/${expected.length} exact fonts; Sites metadata sealed.`);
