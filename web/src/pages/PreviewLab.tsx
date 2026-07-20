/** Five actual 16:9 slide situations. Candidate fonts are named and linked,
 * never impersonated with an unrelated system face. */

import { useMemo, useState } from "react";

import { copy, TYPE_SPECIMEN_LIMITS, TYPE_SPECIMEN_PRESETS, type PaletteSystem, type PreviewCopy } from "@core/index.js";

import { useStudio, selectWorkingPalette } from "../app/store";
import { SlidePreview, DEFAULT_SLIDE_PALETTE, type SlidePalette, type SlideVariant } from "../components/SlidePreview";
import { previewTemplateList } from "../wiring/catalog";
import { previewCopyFor } from "../wiring/engines";
import { selectedTypeDirection, stacksForDirection, stacksForRecommendation } from "../wiring/typeLibrary";
import { domRigMeasurer, fitLabel, type RigMeasurer, type RigStacks } from "../measure/fit";
import type { PreviewTemplate } from "../wiring/types";

const TABS: Record<PreviewTemplate["id"], { label: string; variant: SlideVariant }> = {
  cover: { label: "Opening", variant: "statement" },
  title_body: { label: "Argument", variant: "titleBody" },
  quote: { label: "Quote", variant: "quote" },
  image_text: { label: "Image + words", variant: "imageText" },
  evidence_data: { label: "Number", variant: "metric" },
};

const slidePalette = (palette: PaletteSystem | null): SlidePalette => palette ? {
  background: palette.roles.background?.hex ?? DEFAULT_SLIDE_PALETTE.background,
  surface: palette.roles.surface?.hex ?? DEFAULT_SLIDE_PALETTE.surface,
  text: palette.roles.text?.hex ?? DEFAULT_SLIDE_PALETTE.text,
  muted: palette.roles.muted_text?.hex ?? DEFAULT_SLIDE_PALETTE.muted,
  accent: palette.roles.accent_primary?.hex ?? DEFAULT_SLIDE_PALETTE.accent,
  accentSecondary: palette.roles.accent_secondary?.hex,
  onAccent: palette.roles.on_accent?.hex,
} : DEFAULT_SLIDE_PALETTE;

export const PreviewLab = ({ measurer = domRigMeasurer }: { measurer?: RigMeasurer }) => {
  const { state, dispatch } = useStudio();
  const [templateId, setTemplateId] = useState<PreviewTemplate["id"]>("cover");
  const exactDirection = selectedTypeDirection(state.typeStudio);
  const savedType = state.typeResult?.recommendations.find((item) => item.systemId === state.selectedTypeId) ?? state.typeResult?.recommendations[0] ?? null;
  const stacks: RigStacks = exactDirection ? stacksForDirection(exactDirection) : stacksForRecommendation(savedType);
  const palettes = state.colourRun ? [...state.colourRun.systems, ...state.colourRun.companionSystems] : [];
  const palette = selectWorkingPalette(state) ?? palettes.find((item) => item.id === state.selectedPaletteId) ?? null;
  const { copy: words, fixture } = previewCopyFor(state.brief);
  const template = previewTemplateList.find((item) => item.id === templateId) ?? previewTemplateList[0];
  if (!template) return null;

  const fit = useMemo(() => measurer({
    kicker: "YOUR DECK",
    headline: words.slideTitle ?? words.deckTitle ?? "Make the point visible.",
    subheadline: words.subtitle ?? "",
    body: words.body ?? "The argument gets a shape. The evidence gets room. The audience gets the point.",
    quote: words.quote ?? "Clarity is a form of respect.",
    caption: words.attribution ?? "Project principle",
    dataLabel: words.metricLabel ?? "LESS TIME TO FIRST CONTRIBUTION",
    dataValue: words.metric ?? "48%",
  }, template, stacks), [measurer, stacks, template, words]);
  const tab = TABS[template.id];

  return (
    <div className="preview-lab">
      <p className="eyebrow">Slide check</p>
      <h2 className="step-title">Does the direction survive a real deck?</h2>
      <p className="step-intro">Five common slide jobs. Same words, same palette, honest 16:9 every time.</p>

      <div className="specimen-presets" aria-label="Sample copy presets">
        <span>Try the words:</span>
        {TYPE_SPECIMEN_PRESETS.map((preset) => (
          <button
            type="button"
            key={preset.id}
            onClick={() => dispatch({ type: "setPreviewCopy", previewCopy: { ...state.brief.previewCopy, slideTitle: preset.headline, body: preset.paragraph } })}
          >{preset.label}</button>
        ))}
      </div>

      <div className="slide-tabs" role="tablist" aria-label="Slide types">
        {previewTemplateList.map((item) => <button key={item.id} type="button" role="tab" aria-selected={item.id === template.id} onClick={() => setTemplateId(item.id)}>{TABS[item.id].label}</button>)}
      </div>

      <div className="lab-layout">
        <div>
          <SlidePreview
            title={words.slideTitle ?? words.deckTitle ?? "Make the point visible."}
            body={words.body ?? "The argument gets a shape. The evidence gets room. The audience gets the point."}
            kicker={words.deckTitle && words.deckTitle !== words.slideTitle ? words.deckTitle : "YOUR DECK"}
            quote={words.quote}
            attribution={words.attribution}
            metric={words.metric}
            metricLabel={words.metricLabel}
            palette={slidePalette(palette)}
            fonts={stacks}
            variant={tab.variant}
            label={`${tab.label} slide · exact 16:9`}
          />
          <div className={`fit-verdict fit-verdict--${fit.status}`}><strong>{fitLabel(fit.status)}</strong><span>{fit.status === "does_not_fit" ? "The copy needs an edit before this slide is safe." : "The copy fits this layout at the current limits."}</span></div>
          {fit.status === "does_not_fit" ? <div className="notice notice--error" role="alert"><strong>{copy.specimens.overflow}</strong><ul>{copy.specimens.overflowActions.map((action) => <li key={action}>{action}</li>)}</ul></div> : null}
        </div>

        <aside className="lab-notes">
          <section className="specimen-editor"><h3>Use your own words</h3><p>Short limits protect the slide. Your copy stays in this tab.</p>
            <label><span>Headline</span><textarea maxLength={TYPE_SPECIMEN_LIMITS.headline.max} value={words.slideTitle ?? ""} onChange={(event) => dispatch({ type: "setPreviewCopy", previewCopy: { ...state.brief.previewCopy, slideTitle: event.target.value } as PreviewCopy })} /><small>{(words.slideTitle ?? "").length}/{TYPE_SPECIMEN_LIMITS.headline.max}</small></label>
            <label><span>Supporting copy</span><textarea maxLength={TYPE_SPECIMEN_LIMITS.paragraph.max} value={words.body ?? ""} onChange={(event) => dispatch({ type: "setPreviewCopy", previewCopy: { ...state.brief.previewCopy, body: event.target.value } as PreviewCopy })} /><small>{(words.body ?? "").length}/{TYPE_SPECIMEN_LIMITS.paragraph.max}</small></label>
          </section>
          {fixture ? <p className="truth-note">Sample copy is filling the other fields. Replace whatever matters; nothing leaves this browser.</p> : null}
          {exactDirection ? <section><h3>{exactDirection.name}</h3><p>These are the real files currently painting the slide.</p>{[...new Map(Object.values(exactDirection.roles).map((font) => [font.id, font])).values()].map((font) => <a key={font.id} href={font.source.upstreamRepository ?? font.source.metadataUrl} target="_blank" rel="noreferrer"><strong style={{ fontFamily: `"${font.family}", sans-serif` }}>{font.family}</strong><span>{font.designer} · {font.license.spdx} ↗</span></a>)}</section> : null}
          {palettes.length > 1 ? <details className="disclosure"><summary>Try another palette</summary><div className="disclosure-body palette-options">{palettes.map((item) => <button key={item.id} type="button" aria-pressed={item.id === state.selectedPaletteId} onClick={() => dispatch({ type: "selectPalette", systemId: item.id })}><span style={{ background: item.roles.accent_primary.hex }} /><strong>{item.name}</strong></button>)}</div></details> : null}
        </aside>
      </div>
    </div>
  );
};
