import type { DirectionCard, PaletteRoleId, RoleToken } from "../domain.js";

const cssName = (value: string): string => value.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
const cssComment = (value: string): string => value.replace(/\*\//g, "* /").replace(/[\r\n\u2028\u2029]+/g, " ").trim();
const cssFontKey = (value: string): string => {
  if (!/^[a-z0-9_-]{1,120}$/i.test(value)) throw new Error(`Unsafe font manifest key in CSS export: ${value}`);
  return JSON.stringify(value);
};
const cssColour = (value: string): string => {
  if (!/^#[0-9A-F]{6}$/i.test(value)) throw new Error(`Unsafe colour token in CSS export: ${value}`);
  return value.toUpperCase();
};

const selectedPalette = (direction: DirectionCard) =>
  direction.colour?.systems.find((system) => system.id === direction.selected.paletteSystemId) ?? null;

export const exportCssCustomProperties = (direction: DirectionCard): string => {
  const palette = selectedPalette(direction);
  const type = direction.type.recommendations.find((item) => item.systemId === direction.selected.typeSystemId) ?? null;
  const lines = [
    `/* Letters & Light — ${cssComment(direction.name)}`,
    `   Type status: ${direction.truth.typeStatus}`,
    `   Colour status: ${direction.truth.colourStatus}`,
    "   Font IDs are manifest keys, not permission to fetch remote fonts. */",
    ":root {",
  ];
  if (type) {
    lines.push(`  --ll-font-display: ${cssFontKey(type.roles.display.fontId)};`);
    lines.push(`  --ll-font-body: ${cssFontKey(type.roles.body.fontId)};`);
    lines.push(`  --ll-font-utility: ${cssFontKey(type.roles.utility.fontId)};`);
  }
  if (palette) {
    for (const [role, token] of Object.entries(palette.roles) as Array<[PaletteRoleId, RoleToken]>) {
      lines.push(`  --ll-colour-${cssName(role)}: ${cssColour(token.hex)};`);
    }
  }
  lines.push("}", "");
  return lines.join("\n");
};

export const exportPlainTextStyleSheet = (direction: DirectionCard): string => {
  const palette = selectedPalette(direction);
  const type = direction.type.recommendations.find((item) => item.systemId === direction.selected.typeSystemId) ?? null;
  const lines = [
    `LETTERS & LIGHT — ${direction.name}`,
    direction.relationship.headline,
    "",
    "TYPE",
    type ? `${type.name} (${type.answerRole}; ${type.status})` : "No surviving type system",
  ];
  if (type) {
    lines.push(`Display: ${type.roles.display.fontId}`);
    lines.push(`Body: ${type.roles.body.fontId}`);
    lines.push(`Utility: ${type.roles.utility.fontId}`);
    lines.push(`Do not: ${type.oneThingNotToDo}`);
  }
  lines.push("", "COLOUR", palette ? `${palette.name} (${palette.strategy}; ${palette.mode})` : "No colour source processed");
  if (palette) {
    for (const token of Object.values(palette.roles)) lines.push(`${token.role}: ${token.hex} — ${token.reason}`);
  }
  lines.push("", "RELATIONSHIP", ...direction.relationship.guidance.map((line) => `- ${line}`));
  if (direction.relationship.warnings.length > 0) lines.push("", "WARNINGS", ...direction.relationship.warnings.map((line) => `- ${line}`));
  lines.push("", "TRUTH", ...direction.truth.claims.map((line) => `- ${line}`), ...direction.truth.limits.map((line) => `- Limit: ${line}`), "");
  return lines.join("\n");
};

export const exportDesignTokens = (direction: DirectionCard): string => {
  const palette = selectedPalette(direction);
  const type = direction.type.recommendations.find((item) => item.systemId === direction.selected.typeSystemId) ?? null;
  const payload = {
    schemaVersion: "1.0.0",
    product: "Letters & Light",
    projectId: direction.projectId,
    name: direction.name,
    truth: direction.truth,
    typography: type
      ? {
          systemId: type.systemId,
          systemName: type.name,
          status: type.status,
          roles: type.roles,
          caveats: type.caveats,
        }
      : null,
    colour: palette
      ? {
          systemId: palette.id,
          systemName: palette.name,
          strategy: palette.strategy,
          mode: palette.mode,
          roles: Object.fromEntries(
            Object.entries(palette.roles).map(([id, token]) => [id, { hex: token.hex, rgb: token.rgb, oklch: token.oklch, provenance: token.provenance }]),
          ),
        }
      : null,
    relationship: direction.relationship,
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
};
