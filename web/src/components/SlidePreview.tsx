import type { CSSProperties } from "react";

import type { PaletteSystem } from "@core/index.js";

export type SlidePalette = {
  background: string;
  surface: string;
  text: string;
  muted: string;
  accent: string;
  accentSecondary?: string;
  onAccent?: string;
};

export const DEFAULT_SLIDE_PALETTE: SlidePalette = {
  background: "#f4f0e7",
  surface: "#e7e1d5",
  text: "#19191d",
  muted: "#65636a",
  accent: "#e74791",
  accentSecondary: "#3154dc",
  onAccent: "#fffaf3",
};

export const slidePaletteFromSystem = (palette: PaletteSystem | null): SlidePalette => palette ? {
  background: palette.roles.background?.hex ?? DEFAULT_SLIDE_PALETTE.background,
  surface: palette.roles.surface?.hex ?? DEFAULT_SLIDE_PALETTE.surface,
  text: palette.roles.text?.hex ?? DEFAULT_SLIDE_PALETTE.text,
  muted: palette.roles.muted_text?.hex ?? DEFAULT_SLIDE_PALETTE.muted,
  accent: palette.roles.accent_primary?.hex ?? DEFAULT_SLIDE_PALETTE.accent,
  accentSecondary: palette.roles.accent_secondary?.hex,
  onAccent: palette.roles.on_accent?.hex,
} : DEFAULT_SLIDE_PALETTE;

export type SlideVariant = "statement" | "titleBody" | "quote" | "imageText" | "metric";
export type SlideFontStacks = { display: string; body: string; utility: string };

export const SlidePreview = ({
  title,
  body,
  kicker = "THE DECK",
  quote,
  attribution,
  metric,
  metricLabel,
  palette = DEFAULT_SLIDE_PALETTE,
  variant = "statement",
  imageUrl,
  fonts,
  label = "16:9 slide preview",
  className = "",
}: {
  title: string;
  body?: string;
  kicker?: string;
  quote?: string;
  attribution?: string;
  metric?: string;
  metricLabel?: string;
  palette?: SlidePalette;
  variant?: SlideVariant;
  imageUrl?: string;
  fonts?: SlideFontStacks;
  label?: string;
  className?: string;
}) => {
  const titleSize = title.length > 56 ? "long" : title.length > 34 ? "medium" : "short";
  const style = {
    "--slide-bg": palette.background,
    "--slide-surface": palette.surface,
    "--slide-ink": palette.text,
    "--slide-muted": palette.muted,
    "--slide-accent": palette.accent,
    "--slide-accent-2": palette.accentSecondary ?? palette.accent,
    "--slide-on-accent": palette.onAccent ?? palette.background,
    "--slide-font-display": fonts?.display ?? "var(--serif)",
    "--slide-font-body": fonts?.body ?? "var(--sans)",
    "--slide-font-utility": fonts?.utility ?? "var(--mono)",
  } as CSSProperties;

  return (
    <figure className={`slide-preview ${className}`.trim()} aria-label={label}>
      <div className="slide-canvas" data-variant={variant} data-title-size={titleSize} style={style}>
        <span className="slide-kicker">{kicker}</span>

        {variant === "statement" ? (
          <>
            <h3 className="slide-title">{title}</h3>
            {body ? <p className="slide-body">{body}</p> : null}
            <span className="slide-thread" aria-hidden="true" />
            <span className="slide-page">01</span>
          </>
        ) : null}

        {variant === "titleBody" ? (
          <>
            <h3 className="slide-title">{title}</h3>
            <div className="slide-copy-panel">
              <span className="slide-panel-mark" aria-hidden="true" />
              <p className="slide-body">{body || "One clear argument, supported by the detail the room actually needs."}</p>
            </div>
            <span className="slide-page">02</span>
          </>
        ) : null}

        {variant === "quote" ? (
          <>
            <blockquote className="slide-quote">“{quote || title}”</blockquote>
            <p className="slide-attribution">{attribution || "Source or attribution"}</p>
            <span className="slide-thread" aria-hidden="true" />
            <span className="slide-page">03</span>
          </>
        ) : null}

        {variant === "imageText" ? (
          <div className="slide-split">
            <div
              className="slide-image"
              style={imageUrl ? { backgroundImage: `url(${JSON.stringify(imageUrl)})` } : undefined}
              aria-hidden="true"
            />
            <div className="slide-split-copy">
              <h3 className="slide-title">{title}</h3>
              <p className="slide-body">{body || "The image sets the atmosphere. The words still make the point."}</p>
            </div>
            <span className="slide-page">04</span>
          </div>
        ) : null}

        {variant === "metric" ? (
          <>
            <h3 className="slide-title slide-title--small">{title}</h3>
            <div className="slide-metric-row">
              <strong className="slide-metric">{metric || "48%"}</strong>
              <span className="slide-metric-label">{metricLabel || "less time to first contribution"}</span>
            </div>
            {body ? <p className="slide-footnote">{body}</p> : null}
            <span className="slide-page">05</span>
          </>
        ) : null}
      </div>
      <figcaption>{label}</figcaption>
    </figure>
  );
};
