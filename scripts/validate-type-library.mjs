import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const fontRoot = join(root, "public/fonts/type-library");
const failures = [];
const checks = [];
const pass = (message) => checks.push(message);
const fail = (message) => failures.push(message);
const assert = (condition, message) => (condition ? pass(message) : fail(message));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));

const curationPath = "data/type-library/curation.v1.json";
const lockPath = "data/type-library/font-library.lock.json";
const curationBytes = await readFile(join(root, curationPath));
const curation = JSON.parse(curationBytes);
const lock = await readJson(lockPath);

assert(lock.schemaVersion === "1.0.0", "Type-library lock schema is supported.");
assert(lock.version === curation.version, "Curation and locked library versions agree.");
assert(lock.curationSha256 === sha256(curationBytes), "Curation hash matches the generated lock.");
assert(lock.provider?.runtimeRequests === 0, "Font provider makes zero runtime requests.");
assert(lock.policy?.remoteRuntimeFontsForbidden === true, "Remote runtime fonts are forbidden by policy.");
assert(lock.policy?.exactFilesRequiredForPreview === true, "Exact files are mandatory for every preview.");
assert(lock.policy?.recommendationDoesNotClaimDeckApplicationValidation === true, "Browser proof remains distinct from deck-app validation.");
assert(lock.policy?.allowedLicenses?.length === 1 && lock.policy.allowedLicenses[0] === "OFL-1.1", "Initial production-preview library is OFL-1.1 only.");

assert(curation.shelves.length === 8 && lock.shelves.length === 8, "Eight editorial shelves are present.");
const curatedFamilies = curation.shelves.flatMap((shelf) => shelf.families);
assert(curatedFamilies.length === 64 && lock.fonts.length === 64, "Sixty-four curated families are locked.");
assert(new Set(lock.fonts.map((font) => font.id)).size === lock.fonts.length, "Font IDs are unique.");
assert(new Set(lock.fonts.map((font) => font.family.toLowerCase())).size === lock.fonts.length, "Font family names are unique.");
assert(new Set(lock.shelves.map((shelf) => shelf.id)).size === lock.shelves.length, "Shelf IDs are unique.");

const shelfIds = new Set(lock.shelves.map((shelf) => shelf.id));
const files = lock.fonts.flatMap((font) => font.files.map((file) => ({ font, file })));
assert(files.length >= 128, `At least two exact font resources per family are locked (${files.length} found).`);
assert(new Set(files.map(({ file }) => file.publicUrl)).size === files.length, "Every exact resource has one public URL.");
assert(lock.fonts.every((font) => shelfIds.has(font.shelfId)), "Every family belongs to a known editorial shelf.");
assert(lock.fonts.every((font) => font.previewStatus === "exact_self_hosted" && font.files.length > 0), "Every family has exact self-hosted preview files.");
assert(lock.fonts.every((font) => font.deckStatus === "requires_application_validation"), "No browser preview is laundered into deck-app proof.");
assert(lock.fonts.every((font) => font.license?.spdx === "OFL-1.1"), "Every family carries an OFL-1.1 licence record.");

for (const font of lock.fonts) {
  try {
    const licenceBytes = await readFile(join(root, font.license.localFile));
    assert(sha256(licenceBytes) === font.license.sha256, `${font.family}: licence hash matches.`);
    assert(licenceBytes.toString("utf8").includes("SIL OPEN FONT LICENSE Version 1.1"), `${font.family}: local licence is readable OFL-1.1 text.`);
  } catch (error) {
    fail(`${font.family}: licence missing or unreadable — ${error.message}`);
  }
  for (const file of font.files) {
    try {
      const absolute = join(root, file.file);
      const bytes = await readFile(absolute);
      assert(bytes.byteLength === file.bytes, `${font.family}: ${file.file} byte count matches.`);
      assert(sha256(bytes) === file.sha256, `${font.family}: ${file.file} hash matches.`);
      const publicPath = file.file.replace(/^public\//, "");
      assert(file.publicUrl === `/${publicPath}`, `${font.family}: ${file.file} uses the canonical root-local URL.`);
      assert(!/^https?:/i.test(file.publicUrl), `${font.family}: ${file.file} has no remote runtime URL.`);
    } catch (error) {
      fail(`${font.family}: ${file.file} missing or unreadable — ${error.message}`);
    }
  }
}

const css = await readFile(join(fontRoot, "type-library.css"), "utf8");
assert(!/url\(["']?https?:/i.test(css), "Generated font CSS contains no remote URL.");
assert((css.match(/@font-face\s*\{/g) ?? []).length === files.length, "Generated CSS declares every locked resource exactly once.");
assert(files.every(({ file }) => css.includes(`url("./${file.file.replace(/^public\/fonts\/type-library\//, "")}")`)), "Generated CSS maps every locked resource to a local file.");

const credits = await readFile(join(fontRoot, "FONT-CREDITS.md"), "utf8");
assert(lock.fonts.every((font) => credits.includes(`| ${font.family} |`) && credits.includes(font.designer)), "Visible credits name every family and designer.");

const fontBytes = files.reduce((sum, { file }) => sum + file.bytes, 0);
const directoryExists = await stat(fontRoot).then((item) => item.isDirectory()).catch(() => false);
assert(directoryExists, "Self-hosted type-library directory exists.");
assert(fontBytes <= 16 * 1024 * 1024, `Exact preview pack stays below 16 MiB (${(fontBytes / 1024 / 1024).toFixed(2)} MiB).`);

if (failures.length > 0) {
  console.error(`Type-library validation failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Type-library validation passed: ${checks.length} checks; ${lock.fonts.length} families; ${files.length} exact WOFF2 resources; ${(fontBytes / 1024 / 1024).toFixed(2)} MiB; zero runtime requests.`);
