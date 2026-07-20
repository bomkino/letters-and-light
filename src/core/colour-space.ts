import type { Oklab, Oklch, Rgb } from "../domain.js";

const clamp = (value: number, min = 0, max = 1): number => Math.min(max, Math.max(min, value));

const srgbToLinear = (channel: number): number => {
  const value = clamp(channel / 255);
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};

const linearToSrgb = (channel: number): number => {
  const value = channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055;
  return Math.round(clamp(value) * 255);
};

export const rgbToOklab = (rgb: Rgb): Oklab => {
  const r = srgbToLinear(rgb.r);
  const g = srgbToLinear(rgb.g);
  const b = srgbToLinear(rgb.b);

  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

  const lRoot = Math.cbrt(l);
  const mRoot = Math.cbrt(m);
  const sRoot = Math.cbrt(s);

  return {
    l: 0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot,
    a: 1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot,
    b: 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot,
  };
};

export const oklabToRgb = (lab: Oklab): Rgb => {
  const lRoot = lab.l + 0.3963377774 * lab.a + 0.2158037573 * lab.b;
  const mRoot = lab.l - 0.1055613458 * lab.a - 0.0638541728 * lab.b;
  const sRoot = lab.l - 0.0894841775 * lab.a - 1.291485548 * lab.b;

  const l = lRoot ** 3;
  const m = mRoot ** 3;
  const s = sRoot ** 3;

  return {
    r: linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  };
};

export const oklabToOklch = (lab: Oklab): Oklch => {
  const c = Math.hypot(lab.a, lab.b);
  if (c < 1e-7) return { l: clamp(lab.l), c: 0, h: null };
  const rawHue = (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
  return { l: clamp(lab.l), c, h: (rawHue + 360) % 360 };
};

export const oklchToOklab = (lch: Oklch): Oklab => {
  const hue = lch.h === null ? 0 : (lch.h * Math.PI) / 180;
  return { l: clamp(lch.l), a: lch.c * Math.cos(hue), b: lch.c * Math.sin(hue) };
};

export const rgbToOklch = (rgb: Rgb): Oklch => oklabToOklch(rgbToOklab(rgb));
export const oklchToRgb = (lch: Oklch): Rgb => oklabToRgb(oklchToOklab(lch));

export const deltaEOK = (left: Oklab, right: Oklab): number =>
  Math.hypot(left.l - right.l, left.a - right.a, left.b - right.b);

export const rgbToHex = (rgb: Rgb): string =>
  `#${[rgb.r, rgb.g, rgb.b]
    .map((channel) => Math.round(clamp(channel, 0, 255)).toString(16).padStart(2, "0"))
    .join("")}`.toUpperCase();

export const hexToRgb = (hex: string): Rgb => {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error(`Invalid RGB hex: ${hex}`);
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  };
};

export const relativeLuminance = (rgb: Rgb): number =>
  0.2126 * srgbToLinear(rgb.r) + 0.7152 * srgbToLinear(rgb.g) + 0.0722 * srgbToLinear(rgb.b);

export const contrastRatio = (left: Rgb, right: Rgb): number => {
  const a = relativeLuminance(left);
  const b = relativeLuminance(right);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

export const mixOklab = (left: Rgb, right: Rgb, rightAmount: number): Rgb => {
  const amount = clamp(rightAmount);
  const a = rgbToOklab(left);
  const b = rgbToOklab(right);
  return oklabToRgb({
    l: a.l * (1 - amount) + b.l * amount,
    a: a.a * (1 - amount) + b.a * amount,
    b: a.b * (1 - amount) + b.b * amount,
  });
};

export const adjustOklch = (rgb: Rgb, changes: { l?: number; cScale?: number }): Rgb => {
  const lch = rgbToOklch(rgb);
  return oklchToRgb({
    l: changes.l === undefined ? lch.l : clamp(changes.l),
    c: Math.max(0, lch.c * (changes.cScale ?? 1)),
    h: lch.h,
  });
};

export const compositeOver = (foreground: Rgb, alphaByte: number, background: Rgb): Rgb => {
  const alpha = clamp(alphaByte / 255);
  return {
    r: Math.round(foreground.r * alpha + background.r * (1 - alpha)),
    g: Math.round(foreground.g * alpha + background.g * (1 - alpha)),
    b: Math.round(foreground.b * alpha + background.b * (1 - alpha)),
  };
};
