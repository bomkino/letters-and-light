/** The answer before the evidence. Real fonts, real 16:9 slides, and controls
 * that let the user keep, reject, or reshuffle the recommendation without
 * losing the engine trace underneath. */

import type { CSSProperties } from "react";

import type { DirectionCard, PaletteRoleId, PaletteSystem, TypeRecommendationItem, TypeStudioSession } from "@core/index.js";

import { selectWorkingPalette, useStudio } from "../app/store";
import { SlidePreview, slidePaletteFromSystem } from "../components/SlidePreview";
import { fontSourcesForSystem, roleLabels } from "../wiring/catalog";
import { previewCopyFor, ROLE_ORDER } from "../wiring/engines";
import { exactFontsForRecommendation, roleLabel, selectedTypeDirection, stacksForDirection, stacksForRecommendation } from "../wiring/typeLibrary";
import { EvidenceDrawer } from "./EvidenceDrawer";
import { SourceMap } from "./SourceMap";

const essentialRoles: PaletteRoleId[] = ["background", "text", "accent_primary", "on_accent"];

const SavedTypeResult = ({ item }: { item: TypeRecommendationItem }) => {
  const sources = fontSourcesForSystem(item.systemId);
  const exactFonts = exactFontsForRecommendation(item);
  const exactSaved = Object.values(exactFonts).every(Boolean);
  const exactStacks = stacksForRecommendation(item);
  return (
    <section className="result-panel result-panel--type" aria-labelledby="type-result-title">
      <p className="eyebrow">Saved type direction</p>
      <h3 id="type-result-title" style={exactSaved ? { fontFamily: exactStacks.display } : undefined}>{item.name}</h3>
      <p className="result-reason">{exactSaved
        ? "The exact local faces are back. Your chosen direction survives; shuffle history, stars and locks were never hidden inside the project file."
        : "This older project keeps its original recommendation. Start a new Type run to use the exact 64-family studio."}</p>
      <dl className="type-roles">
        {(["display", "body", "utility"] as const).map((role) => {
          const exact = exactFonts[role];
          const source = sources.find((font) => font.id === item.roles[role].fontId);
          return <div key={role}><dt>{roleLabel(role)}</dt><dd style={exact ? { fontFamily: exactStacks[role] } : undefined}>{exact?.family ?? source?.family ?? item.roles[role].fontId}</dd></div>;
        })}
      </dl>
      {exactSaved ? <p className="truth-note">Exact in this browser again. Re-run Type only when you want a new set of five—not because reopening broke the letterforms.</p> : null}
    </section>
  );
};

const ExactTypeResult = ({ session }: { session: TypeStudioSession }) => {
  const { dispatch } = useStudio();
  const direction = selectedTypeDirection(session);
  if (!direction) return null;

  return (
    <section className="exact-type-studio" aria-labelledby="type-result-title">
      <header className="exact-type-studio__head">
        <div>
          <p className="eyebrow">Your type direction · exact in this browser</p>
          <h3 id="type-result-title" style={{ fontFamily: stacksForDirection(direction).display }}>{direction.name}</h3>
          <p>{session.recommendation.headline}</p>
        </div>
        <div className="type-studio-actions" aria-label="Type direction history">
          <button type="button" className="btn btn--primary" onClick={() => dispatch({ type: "typeStudioAction", action: { type: "shuffle" } })}>Shuffle five directions</button>
          <button type="button" className="btn" disabled={session.past.length === 0} onClick={() => dispatch({ type: "typeStudioAction", action: { type: "undo" } })}>Undo</button>
          <button type="button" className="btn" disabled={session.future.length === 0} onClick={() => dispatch({ type: "typeStudioAction", action: { type: "redo" } })}>Redo</button>
        </div>
      </header>

      <div className="type-direction-rail" role="list" aria-label="Five type directions">
        {session.recommendation.directions.map((candidate, index) => {
          const active = candidate.id === direction.id;
          return (
            <button
              type="button"
              role="listitem"
              key={candidate.id}
              className="type-direction-ticket"
              data-active={active}
              aria-pressed={active}
              onClick={() => dispatch({ type: "typeStudioAction", action: { type: "selectDirection", directionId: candidate.id } })}
              style={{ "--ticket-font": stacksForDirection(candidate).display } as CSSProperties}
            >
              <span>{String(index + 1).padStart(2, "0")} · {candidate.laneLabel}</span>
              <strong>Aa</strong>
              <i>{candidate.name}</i>
            </button>
          );
        })}
      </div>

      <div className="type-role-workbench">
        {(["display", "body", "utility"] as const).map((role) => {
          const font = direction.roles[role];
          const locked = session.current.locked[role] === font.id;
          const starred = session.current.starredFontIds.includes(font.id);
          return (
            <article className="type-role-card" key={role} style={{ fontFamily: stacksForDirection(direction)[role] }}>
              <span className="type-role-card__label">{roleLabel(role)}</span>
              <strong>{role === "display" ? "Make the point." : role === "body" ? "The reading work stays calm enough to trust." : "Q3 · 48% · 07"}</strong>
              <div className="type-role-card__meta">
                <span><b>{font.family}</b> · {font.designer}</span>
                <span>{font.license.spdx} · self-hosted</span>
              </div>
              <div className="type-role-card__actions">
                <button type="button" aria-pressed={locked} onClick={() => dispatch({ type: "typeStudioAction", action: { type: "toggleLock", role, fontId: font.id } })}>{locked ? "Locked" : "Lock"}</button>
                <button type="button" aria-pressed={starred} onClick={() => dispatch({ type: "typeStudioAction", action: { type: "toggleStarFont", fontId: font.id } })}>{starred ? "★ Saved" : "☆ Save"}</button>
                <button type="button" onClick={() => dispatch({ type: "typeStudioAction", action: { type: "excludeFont", fontId: font.id } })}>Not this one</button>
              </div>
            </article>
          );
        })}
      </div>

      <div className="type-direction-why">
        <div><p className="eyebrow">Why this survives</p><ul>{direction.why.slice(0, 3).map((line) => <li key={line}>{line}</li>)}</ul></div>
        <div><p className="eyebrow">Do not do this</p><ul>{direction.cautions.map((line) => <li key={line}>{line}</li>)}</ul></div>
      </div>

      <p className="truth-note">The letterforms above are exact local font files. That proves this browser preview—not installation, editable handoff, or export behaviour in your deck application.</p>
    </section>
  );
};

const ColorResult = ({ palette }: { palette: PaletteSystem }) => {
  const completeRoles = ROLE_ORDER.filter((id) => !essentialRoles.includes(id));
  const renderRole = (id: PaletteRoleId) => {
    const role = palette.roles[id];
    if (!role) return null;
    return <li key={id}><span style={{ background: role.hex }} aria-hidden="true" /><strong>{roleLabels[id]?.label ?? id}</strong><code>{role.hex}</code></li>;
  };
  return (
    <section className="result-panel result-panel--color" aria-labelledby="color-result-title">
      <p className="eyebrow">Your essential colors</p>
      <h3 id="color-result-title">{palette.name}</h3>
      <p className="result-reason">Four colors you can use immediately. The complete working system waits underneath when you need it.</p>
      <ul className="palette-strip palette-strip--essential" aria-label="Essential palette roles">{essentialRoles.map(renderRole)}</ul>
      <details className="disclosure palette-complete">
        <summary>Open the complete palette</summary>
        <div className="disclosure-body"><ul className="palette-strip" aria-label="Supporting palette roles">{completeRoles.map(renderRole)}</ul></div>
      </details>
    </section>
  );
};

export const DirectionCardView = ({ direction, onOpenLab, onOpenBench, onOpenExport, onAddColour, onAddType }: {
  direction: DirectionCard;
  onOpenLab: () => void;
  onOpenBench: () => void;
  onOpenExport: () => void;
  onAddColour: () => void;
  onAddType: () => void;
}) => {
  const { state, dispatch } = useStudio();
  const type = direction.type;
  const exactDirection = selectedTypeDirection(state.typeStudio);
  const selectedType = type.recommendations.find((item) => item.systemId === direction.selected.typeSystemId) ?? type.recommendations[0] ?? null;
  const working = selectWorkingPalette(state);
  const palette = working ?? direction.colour?.systems.find((system) => system.id === direction.selected.paletteSystemId) ?? null;
  const allPalettes = state.colourRun ? [...state.colourRun.systems, ...state.colourRun.companionSystems] : [];
  const { copy: words } = previewCopyFor(state.brief);

  if (type.outcome === "boundary" || (type.outcome === "unsupported" && state.typeResult)) {
    return (
      <div className="result-boundary">
        <p className="eyebrow">We stopped for a reason</p>
        <h2 className="step-title">A real constraint beat a prettier lie.</h2>
        <p className="step-intro">{type.headline}</p>
        <div className="notice"><strong>The useful next move</strong><ul>{type.nextActions.map((action) => <li key={action}>{action}</li>)}</ul></div>
        <details className="disclosure"><summary>See what blocked the recommendation</summary><div className="disclosure-body"><ul>{type.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul></div></details>
        <div className="flow-actions"><button type="button" className="btn btn--primary" onClick={() => dispatch({ type: "setStep", step: "brief" })}>Change my answers</button>{state.colourRun ? <button type="button" className="btn" onClick={onOpenExport}>Keep my color work</button> : null}</div>
      </div>
    );
  }

  const legacySources = !exactDirection && selectedType ? fontSourcesForSystem(selectedType.systemId) : [];
  const savedExactFonts = exactFontsForRecommendation(selectedType);
  const displayFamily = exactDirection?.roles.display.family ?? savedExactFonts.display?.family ?? (selectedType ? legacySources.find((font) => font.id === selectedType.roles.display.fontId)?.family ?? selectedType.roles.display.fontId : null);
  const bodyFamily = exactDirection?.roles.body.family ?? savedExactFonts.body?.family ?? (selectedType ? legacySources.find((font) => font.id === selectedType.roles.body.fontId)?.family ?? selectedType.roles.body.fontId : null);
  const previewFonts = exactDirection ? stacksForDirection(exactDirection) : stacksForRecommendation(selectedType);
  const typePair = displayFamily && bodyFamily ? (displayFamily === bodyFamily ? displayFamily : `${displayFamily} + ${bodyFamily}`) : null;
  const headline = selectedType && palette
    ? "The words found a voice. The room found its light."
    : selectedType ? `${typePair ?? selectedType.name}.` : palette ? `${palette.name}.` : "Your direction is ready.";
  const introduction = selectedType && palette
    ? `${displayFamily} carries the thought. ${palette.name} sets the temperature. They belong together; neither is allowed to eat the other.`
    : selectedType
      ? `${displayFamily} leads. ${bodyFamily} does the reading work. Every letterform below is the actual font.`
      : palette ? "A working color world drawn from your image, with every color given one clear job." : "A useful starting point you can inspect, change and take with you.";
  const slideTruthLabel = exactDirection
    ? "A real 16:9 slide · exact browser fonts"
    : selectedType
      ? "A real 16:9 slide · saved type direction"
      : "A real 16:9 slide · your color direction";

  return (
    <div className="direction-result">
      <header className="result-head">
        <p className="eyebrow">Made for this deck</p>
        <h2 className="step-title">{headline}</h2>
        <p className="step-intro">{introduction}</p>
      </header>

      <div className={`result-grid ${selectedType && palette ? "result-grid--pair" : ""}`}>
        {state.typeStudio ? <ExactTypeResult session={state.typeStudio} /> : selectedType ? <SavedTypeResult item={selectedType} /> : null}
        {palette ? <ColorResult palette={palette} /> : null}
      </div>

      <div className="result-slide-stage">
        <div className="result-slide-aura" aria-hidden="true"><span /><span /><span /></div>
        <SlidePreview
          title={words.slideTitle ?? words.deckTitle ?? "Make the point visible."}
          body={words.body ?? "The slide carries one thought. The detail earns its place by helping that thought land."}
          kicker={words.deckTitle && words.deckTitle !== words.slideTitle ? words.deckTitle : "YOUR DECK"}
          palette={slidePaletteFromSystem(palette)}
          fonts={previewFonts}
          variant="titleBody"
          label={slideTruthLabel}
        />
      </div>

      {allPalettes.length > 1 ? (
        <details className="disclosure alternatives">
          <summary>Compare other color directions</summary>
          <div className="disclosure-body alternatives-grid"><section><h3>Color</h3>{allPalettes.map((item) => <button type="button" className="alternative-row" key={item.id} aria-pressed={item.id === state.selectedPaletteId} onClick={() => dispatch({ type: "selectPalette", systemId: item.id })}><strong>{item.name}</strong><span>{item.strategy} · {item.mode}</span></button>)}</section></div>
        </details>
      ) : null}

      <div className="result-actions">
        <button type="button" className="btn btn--primary" onClick={onOpenLab}>Try five real slides</button>
        {palette ? <button type="button" className="btn" onClick={onOpenBench}>Play with the colors</button> : null}
        <button type="button" className="btn" onClick={onOpenExport}>Take the direction away</button>
        {!palette ? <button type="button" className="text-link" onClick={onAddColour}>Add color</button> : null}
        {!selectedType ? <button type="button" className="text-link" onClick={onAddType}>Add typography</button> : null}
      </div>

      <details className="disclosure technical-details">
        <summary>Why this answer—and what could break it</summary>
        <div className="disclosure-body technical-stack">
          <section><h3>The relationship</h3><p>{direction.relationship.principle}</p><ul>{direction.relationship.guidance.map((line) => <li key={line}>{line}</li>)}</ul></section>
          {exactDirection ? <section><h3>Type caution</h3><ul>{exactDirection.cautions.map((line) => <li key={line}>{line}</li>)}</ul></section> : selectedType ? <section><h3>Type caution</h3><p>{selectedType.oneThingNotToDo}</p></section> : null}
          {direction.colour ? <section><h3>Color weaknesses</h3><ul>{direction.colour.recommendation.weaknesses.map((item) => <li key={item.code}>{item.summary}</li>)}</ul></section> : null}
          {state.source?.analysis ? <SourceMap source={state.source} /> : null}
          <EvidenceDrawer direction={direction} />
        </div>
      </details>
    </div>
  );
};
