/** Palette correction without the cockpit. Safe, visible adjustments lead;
 * individual roles, contrast proof and resets stay one disclosure deeper. */

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";

import { copy, type PaletteRoleId, type PaletteSystem } from "@core/index.js";

import { selectDirection, selectWorkingPalette, useStudio } from "../app/store";
import { SlidePreview, slidePaletteFromSystem } from "../components/SlidePreview";
import { roleLabels } from "../wiring/catalog";
import { previewCopyFor, ROLE_ORDER } from "../wiring/engines";
import { selectedTypeDirection, stacksForDirection, stacksForRecommendation } from "../wiring/typeLibrary";

/** FLIP keeps reordered role chips spatially connected. */
const useFlip = (dependency: unknown) => {
  const containerRef = useRef<HTMLUListElement>(null);
  const previous = useRef<Map<string, DOMRect>>(new Map());

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const items = [...container.querySelectorAll<HTMLElement>("[data-flip-id]")];
    const nextRects = new Map<string, DOMRect>();
    for (const item of items) {
      const id = item.dataset.flipId;
      if (id) nextRects.set(id, item.getBoundingClientRect());
    }
    if (!reduced) {
      for (const item of items) {
        const id = item.dataset.flipId;
        if (!id) continue;
        const before = previous.current.get(id);
        const after = nextRects.get(id);
        if (!before || !after) continue;
        const dx = before.left - after.left;
        const dy = before.top - after.top;
        if (dx === 0 && dy === 0) continue;
        item.animate(
          [{ transform: `translate(${dx}px, ${dy}px)`, opacity: 0.85 }, { transform: "translate(0, 0)", opacity: 1 }],
          { duration: 240, easing: "cubic-bezier(0.23, 1, 0.32, 1)" },
        );
      }
    }
    previous.current = nextRects;
  }, [dependency]);

  return containerRef;
};

const ContrastMatrix = ({ palette }: { palette: PaletteSystem }) => {
  const ids = ROLE_ORDER.filter((id) => palette.roles[id]);
  return (
    <div className="contrast-scroll">
      <table className="trace-table" aria-label="Pair contrast matrix in ratios to one">
        <thead><tr><th scope="col">Pair</th>{ids.map((id) => <th key={id} scope="col">{roleLabels[id]?.label ?? id}</th>)}</tr></thead>
        <tbody>
          {ids.map((rowId) => {
            const row = palette.roles[rowId];
            if (!row) return null;
            return (
              <tr key={rowId}>
                <th scope="row">{roleLabels[rowId]?.label ?? rowId}</th>
                {ids.map((columnId) => {
                  if (columnId === rowId) return <td key={columnId} aria-label="same role">—</td>;
                  const value = row.contrastAgainst[columnId];
                  const weak = rowId === "text" && columnId === "background" && (value ?? 0) < 4.5;
                  return <td key={columnId} className={weak ? "contrast-weak" : undefined}>{value ?? "?"}</td>;
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

const PaletteWorld = ({ palette }: { palette: PaletteSystem }) => {
  const style = {
    "--world-bg": palette.roles.background.hex,
    "--world-surface": palette.roles.surface.hex,
    "--world-ink": palette.roles.text.hex,
    "--world-a": palette.roles.accent_primary.hex,
    "--world-b": palette.roles.accent_secondary?.hex ?? palette.roles.accent_primary.hex,
    "--world-rule": palette.roles.line_or_rule?.hex ?? palette.roles.muted_text.hex,
  } as CSSProperties;
  return (
    <div className="palette-world" style={style} aria-label={`${palette.name} color world`}>
      <div className="palette-world__field" aria-hidden="true">
        <span className="palette-world__sun" />
        <span className="palette-world__ribbon" />
        <span className="palette-world__paper palette-world__paper--one" />
        <span className="palette-world__paper palette-world__paper--two" />
        <span className="palette-world__rule" />
      </div>
      <div className="palette-world__caption"><span>COLOR IN THE ROOM</span><strong>{palette.name}</strong><small>Move through the worlds. Keep what stays with you.</small></div>
    </div>
  );
};

export const CorrectionBench = () => {
  const { state, dispatch } = useStudio();
  const [hexDrafts, setHexDrafts] = useState<Record<string, string>>({});
  const working = selectWorkingPalette(state);
  const direction = selectDirection(state);
  const correction = state.correction;
  const allPalettes = state.colourRun ? [...state.colourRun.systems, ...state.colourRun.companionSystems] : [];
  const base = allPalettes.find((system) => system.id === state.selectedPaletteId) ?? null;
  const clusters = base?.sourceMap ?? [];
  const flipRef = useFlip(correction?.ops.length ?? 0);
  const type = state.typeResult;
  const exactDirection = selectedTypeDirection(state.typeStudio);
  const savedType = type?.recommendations.find((item) => item.systemId === state.selectedTypeId) ?? type?.recommendations[0] ?? null;
  const fontStacks = exactDirection ? stacksForDirection(exactDirection) : stacksForRecommendation(savedType);

  if (!working || !correction) {
    return (
      <div>
        <h2 className="step-title">{copy.correction.headline}</h2>
        <p className="step-intro">A palette needs an image before it can be adjusted.</p>
        {type ? <div className="flow-actions"><button type="button" className="btn btn--primary" onClick={() => dispatch({ type: "setStep", step: "brief" })}>{copy.result.revise}</button></div> : null}
      </div>
    );
  }

  const applyHex = (role: PaletteRoleId) => {
    const draft = (hexDrafts[role] ?? "").trim().toLowerCase();
    if (!/^#[0-9a-f]{6}$/.test(draft)) return;
    dispatch({ type: "applyOp", op: { kind: "replace", role, hex: draft } });
    setHexDrafts((drafts) => ({ ...drafts, [role]: "" }));
  };

  const locked = correction.locked;
  const words = previewCopyFor(state.brief).copy;
  const textContrast = working.roles.text?.contrastAgainst.background ?? null;
  const weakText = textContrast !== null && textContrast < 4.5;
  const editCount = correction.ops.filter((op) => op.kind !== "lock" && op.kind !== "unlock").length;

  return (
    <div className="correction-bench">
      <p className="eyebrow">{copy.correction.eyebrow}</p>
      <h2 className="step-title">Make it feel more like yours.</h2>
      <p className="step-intro">Change the feeling while the slide stays in view. Nothing here touches the original palette; undo is always one click away.</p>

      <div className="palette-playbar">
        <button type="button" className="btn btn--primary" onClick={() => dispatch({ type: "shufflePalettes" })}>Shuffle the color worlds</button>
        <button type="button" className="btn" aria-pressed={Boolean(state.selectedPaletteId && state.starredPaletteIds.includes(state.selectedPaletteId))} onClick={() => state.selectedPaletteId && dispatch({ type: "togglePaletteStar", systemId: state.selectedPaletteId })}>{state.selectedPaletteId && state.starredPaletteIds.includes(state.selectedPaletteId) ? "★ Saved" : "☆ Save this one"}</button>
        <span>{state.starredPaletteIds.length ? `${state.starredPaletteIds.length} saved` : "Nothing saved yet"}</span>
      </div>
      <div className="palette-world-rail" role="list" aria-label="Available color directions">
        {allPalettes.map((palette) => (
          <button type="button" role="listitem" key={palette.id} aria-pressed={palette.id === state.selectedPaletteId} onClick={() => dispatch({ type: "selectPalette", systemId: palette.id })}>
            <span>{[palette.roles.background.hex, palette.roles.text.hex, palette.roles.accent_primary.hex, palette.roles.accent_secondary?.hex].filter(Boolean).map((hex) => <i key={hex} style={{ background: hex }} />)}</span>
            <strong>{palette.name}</strong>
            {state.starredPaletteIds.includes(palette.id) ? <b aria-label="Saved">★</b> : null}
          </button>
        ))}
      </div>

      <PaletteWorld palette={working} />

      <div className="correction-workspace">
        <div className="correction-preview">
          <SlidePreview
            title={words.slideTitle ?? words.deckTitle ?? "Make the next decision easier."}
            body={words.body ?? "Put the recommendation where the room can see it. Keep the evidence close enough to trust."}
            kicker={words.deckTitle && words.deckTitle !== words.slideTitle ? words.deckTitle : "YOUR DECK"}
            palette={slidePaletteFromSystem(working)}
            fonts={fontStacks}
            variant="titleBody"
            label="Live 16:9 palette preview"
          />
          <p className={`correction-status ${weakText ? "correction-status--warning" : ""}`} role="status">
            {weakText ? "Body text has become too faint against the background. Undo, or fine-tune the text below." : "Text remains readable against the background."}
          </p>
        </div>

        <aside className="correction-quick" aria-labelledby="quick-adjustments-title">
          <p className="eyebrow">QUICK ADJUSTMENTS</p>
          <h3 id="quick-adjustments-title">Push. Look. Keep—or undo.</h3>
          <p>Small moves first. The exact controls are still here when you need them.</p>
          <div className="correction-quick-actions">
            <button type="button" className="btn" disabled={locked.includes("background")} onClick={() => dispatch({ type: "applyOp", op: { kind: "nudge", role: "background", nudge: "lighten" } })}>Lighten the background</button>
            <button type="button" className="btn" disabled={locked.includes("background")} onClick={() => dispatch({ type: "applyOp", op: { kind: "nudge", role: "background", nudge: "darken" } })}>Darken the background</button>
            <button type="button" className="btn btn--thread" disabled={locked.includes("accent_primary")} onClick={() => dispatch({ type: "applyOp", op: { kind: "nudge", role: "accent_primary", nudge: "vary" } })}>{copy.correction.vary}</button>
            <button type="button" className="btn" disabled={locked.includes("background") || locked.includes("surface")} onClick={() => dispatch({ type: "applyOp", op: { kind: "swap", a: "background", b: "surface" } })}>Swap background and panel</button>
          </div>
          <div className="correction-history">
            <button type="button" className="text-link" disabled={correction.ops.length === 0} onClick={() => dispatch({ type: "undo" })}>Undo</button>
            <button type="button" className="text-link" disabled={correction.future.length === 0} onClick={() => dispatch({ type: "redo" })}>Redo</button>
            <span>{editCount === 0 ? "Original palette" : `${editCount} ${editCount === 1 ? "change" : "changes"}`}</span>
          </div>
        </aside>
      </div>

      {clusters.length > 0 ? (
        <fieldset className="accent-picker">
          <legend>Choose an accent from your image</legend>
          <p>Every swatch below came from the source. Pick one and watch the slide change.</p>
          <div className="accent-picker-grid">
            {clusters.map((cluster) => (
              <button key={cluster.id} type="button" disabled={locked.includes("accent_primary")} aria-label={`Use ${cluster.hex} as the accent${cluster.protected ? ", protected color" : ""}`} onClick={() => dispatch({ type: "applyOp", op: { kind: "replace", role: "accent_primary", hex: cluster.hex } })}>
                <span style={{ background: cluster.hex }} aria-hidden="true" />
                <code>{cluster.hex}</code>
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}

      <details className="disclosure correction-disclosure">
        <summary>Fine-tune individual colors</summary>
        <div className="disclosure-body">
          <p className="disclosure-intro">Lock anything you love. Nudge one role at a time, or enter an exact hex value.</p>
          <ul className="role-list" ref={flipRef}>
            {ROLE_ORDER.map((roleId) => {
              const token = working.roles[roleId];
              if (!token) return null;
              const isLocked = locked.includes(roleId);
              return (
                <li key={roleId} className="role-chip flip-item role-editor" data-flip-id={roleId} data-locked={isLocked}>
                  <span className="role-swatch" style={{ background: token.hex }} aria-hidden="true" />
                  <span className="role-editor-name"><span className="role-name">{roleLabels[roleId]?.label ?? roleId}</span><code className="role-meta">{token.hex}</code></span>
                  <span className="role-actions">
                    <button type="button" className="mini-action" aria-pressed={isLocked} onClick={() => dispatch({ type: "applyOp", op: { kind: isLocked ? "unlock" : "lock", role: roleId } })}>{isLocked ? "Unlock" : "Lock"}</button>
                    <button type="button" className="mini-action" disabled={isLocked} onClick={() => dispatch({ type: "applyOp", op: { kind: "nudge", role: roleId, nudge: "lighten" } })}>Lighter</button>
                    <button type="button" className="mini-action" disabled={isLocked} onClick={() => dispatch({ type: "applyOp", op: { kind: "nudge", role: roleId, nudge: "darken" } })}>Darker</button>
                    <button type="button" className="mini-action" disabled={isLocked} onClick={() => dispatch({ type: "applyOp", op: { kind: "nudge", role: roleId, nudge: "moreColour" } })}>More color</button>
                    <button type="button" className="mini-action" disabled={isLocked} onClick={() => dispatch({ type: "applyOp", op: { kind: "nudge", role: roleId, nudge: "lessColour" } })}>Less color</button>
                    <span className="exact-color">
                      <input className="text-input" placeholder="#rrggbb" aria-label={`Replace ${roleLabels[roleId]?.label ?? roleId} with an exact hex color`} value={hexDrafts[roleId] ?? ""} onChange={(event) => setHexDrafts((drafts) => ({ ...drafts, [roleId]: event.target.value }))} />
                      <button type="button" className="mini-action" disabled={isLocked || !/^#[0-9a-fA-F]{6}$/.test((hexDrafts[roleId] ?? "").trim())} onClick={() => applyHex(roleId)}>Use</button>
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </details>

      <details className="disclosure correction-disclosure">
        <summary>Contrast and technical checks</summary>
        <div className="disclosure-body technical-stack">
          <section><h3>Contrast, pair by pair</h3><p>The useful headline is simple: body text should remain readable against its background. The complete ratios are here for inspection.</p><ContrastMatrix palette={working} /></section>
          <section aria-live="polite"><h3>How the relationship changed</h3><p>{direction?.relationship.headline}</p><ul>{direction?.relationship.guidance.map((line) => <li key={line}>{line}</li>)}</ul><p className="technical-footnote">Rules fired: {direction?.relationship.rulesFired.join(" · ") || "none"}. Recomputed from your changes; the original engine result remains untouched.</p></section>
        </div>
      </details>

      <details className="disclosure correction-disclosure">
        <summary>Change the brief or start again</summary>
        <div className="disclosure-body reset-panel">
          <div><h3>Change the input</h3><div className="reset-actions"><button type="button" className="btn" onClick={() => dispatch({ type: "setStep", step: "brief" })}>{copy.result.revise}</button>{type ? <button type="button" className="btn" onClick={() => dispatch({ type: "setStep", step: "words" })}>Change my slide words</button> : null}</div></div>
          <div><h3>Reset carefully</h3><p>{copy.correction.resetWarning}</p><div className="reset-actions"><button type="button" className="btn" onClick={() => dispatch({ type: "resetColour" })}>{copy.correction.resetColour}</button>{type ? <button type="button" className="btn" onClick={() => dispatch({ type: "resetType" })}>{copy.correction.resetType}</button> : null}<button type="button" className="btn" onClick={() => dispatch({ type: "resetAll" })}>{copy.correction.resetAll}</button></div></div>
        </div>
      </details>
    </div>
  );
};
