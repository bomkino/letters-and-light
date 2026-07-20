/** Destination wrap: exports led by where the work goes next, each format
 *  carrying its exact content disclosure. Project persistence is opt-in
 *  consent, revocable with one click. Promotion only after full value. */

import { useMemo, useState } from "react";

import { copy } from "@core/index.js";

import { useAnnounce } from "../app/announcer";
import { selectDirection, useStudio } from "../app/store";
import { colourAnswersFor, typeAnswersFor } from "../wiring/engines";
import {
  buildCoreExports,
  buildEvidenceManifest,
  buildProjectFile,
  buildReadableSettings,
  copyToClipboard,
  downloadBlob,
  downloadText,
  exportDisplayName,
  REMEMBERED_PROJECT_KEY,
  renderSpecimenPng,
  serializeProject,
} from "../wiring/exports";
import { resolveFace } from "../fonts/registry";
import { exactFontsForRecommendation, selectedTypeDirection, stacksForDirection, stacksForRecommendation } from "../wiring/typeLibrary";

const STORAGE_KEY = REMEMBERED_PROJECT_KEY;

export const ExportWrap = () => {
  const { state, dispatch } = useStudio();
  const announce = useAnnounce();
  const [busy, setBusy] = useState<string | null>(null);
  const direction = selectDirection(state);
  const remembered = useMemo(() => {
    try {
      return window.localStorage.getItem(STORAGE_KEY) !== null;
    } catch {
      return false;
    }
  }, [state.consentRemember]);

  if (!direction) {
    return (
      <div>
        <h2 className="step-title">{copy.export.title}</h2>
        <p className="step-intro">There is no direction to take away yet. Run the engines first.</p>
      </div>
    );
  }

  const slug = exportDisplayName(direction, state.entry ?? "whole").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "letters-and-light";
  const exports = buildCoreExports(direction);
  const readableSettings = buildReadableSettings(direction, state.entry ?? "whole");

  const projectJson = (): string => {
    const typeAnswers = typeAnswersFor(state.brief);
    const project = buildProjectFile({
      direction,
      typeAnswers: typeAnswers ?? {
        artifactType: "other",
        existingFontConstraint: "unknown",
        authoringTool: "unknown",
        handoffPaths: ["pdf"],
        viewingContexts: ["mixedUnknown"],
        density: "varied",
        contentNeeds: ["wordsImages"],
        writingSystems: ["latin"],
        character: "unknown",
      },
      colourAnswers: colourAnswersFor(state.brief),
      sourceFileHash: state.source?.sourceFileHash ?? null,
      workingPixelHash: state.source?.analysis?.workingPixelHash ?? null,
      width: state.source ? state.source.width : null,
      height: state.source ? state.source.height : null,
    });
    return serializeProject(project);
  };

  const doExport = async (kind: string) => {
    setBusy(kind);
    try {
      if (kind === "text") {
        downloadText(readableSettings, `${slug}-settings.txt`);
        announce("Plain settings downloaded.");
      } else if (kind === "css") {
        const ok = await copyToClipboard(exports.css);
        announce(ok ? "CSS variables copied to the clipboard." : "Clipboard refused; downloading instead.");
        if (!ok) downloadText(exports.css, `${slug}.css`, "text/css");
      } else if (kind === "json") {
        downloadText(exports.tokens, `${slug}-tokens.json`, "application/json");
        announce("Design tokens downloaded.");
      } else if (kind === "manifest") {
        downloadText(buildEvidenceManifest(direction, new Date().toISOString()), `${slug}-sources-evidence.md`, "text/markdown");
        announce("Sources and evidence manifest downloaded.");
      } else if (kind === "project") {
        downloadText(projectJson(), `${slug}.letterslight.json`, "application/json");
        announce("Project file downloaded. It contains no image pixels and no original filename.");
      } else if (kind === "png") {
        const typeItem = direction.type.recommendations.find((item) => item.systemId === direction.selected.typeSystemId) ?? null;
        const exactDirection = selectedTypeDirection(state.typeStudio);
        const exactStacks = exactDirection ? stacksForDirection(exactDirection) : stacksForRecommendation(typeItem);
        const savedFonts = exactFontsForRecommendation(typeItem);
        const savedExact = Boolean(savedFonts.display && savedFonts.body);
        const displayStack = exactDirection || savedExact ? exactStacks.display : resolveFace(typeItem?.roles.display.fontId ?? "").stack;
        const bodyStack = exactDirection || savedExact ? exactStacks.body : resolveFace(typeItem?.roles.body.fontId ?? "").stack;
        if (document.fonts) {
          await Promise.all([document.fonts.load(`600 64px ${displayStack}`), document.fonts.load(`400 24px ${bodyStack}`)]);
        }
        const blob = await renderSpecimenPng({
          direction,
          route: state.entry ?? "whole",
          displayStack,
          bodyStack,
        });
        downloadBlob(blob, `${slug}-specimen.png`);
        announce("Labelled PNG specimen downloaded.");
      } else if (kind === "print") {
        window.print();
      }
    } finally {
      setBusy(null);
    }
  };

  const toggleRemember = (consent: boolean) => {
    dispatch({ type: "setConsent", consent });
    if (consent) {
      try {
        window.localStorage.setItem(STORAGE_KEY, projectJson());
        announce(copy.project.saved);
      } catch {
        announce("This browser refused local storage; nothing was saved.");
      }
    } else {
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* clearing must never fail loudly */
      }
      announce("Forgotten on this device.");
    }
  };

  return (
    <div className="export-wrap">
      <p className="eyebrow">Take it with you</p>
      <h2 className="step-title">Your direction is ready to leave the browser.</h2>
      <p className="step-intro">Start with the readable settings. The technical formats are there when someone actually needs them.</p>

      <div className="export-primary">
        <button type="button" className="btn btn--primary btn--large" disabled={busy !== null} onClick={() => void doExport("text")}>Download my direction</button>
        <p>{state.entry === "colour" ? "Palette roles, practical uses and cautions—in plain language." : state.entry === "type" ? "Font names, official sources and the one thing not to do." : "Font sources, palette roles, cautions and how the two share the work."}</p>
      </div>

      <section className="save-project">
        <div><h3>Save the work</h3><p>Download a project file to reopen later. It contains no image pixels or original filename.</p></div>
        <div className="save-actions">
          <button type="button" className="btn" disabled={busy !== null} onClick={() => void doExport("project")}>Download project file</button>
          <button type="button" className="btn" aria-pressed={state.consentRemember} onClick={() => toggleRemember(!state.consentRemember)}>{state.consentRemember ? copy.project.clear : "Remember on this device"}</button>
        </div>
        <p className="truth-note">{state.consentRemember ? "Saved on this device because you asked. Forgetting removes it." : remembered ? "A remembered project already exists on this device." : "Off by default. Nothing is stored unless you say yes."}</p>
      </section>

      <details className="disclosure export-more">
        <summary>More ways to export</summary>
        <div className="disclosure-body export-options">
          <button type="button" className="btn" disabled={busy !== null} onClick={() => void doExport("css")}>{copy.export.actions.css}</button>
          <button type="button" className="btn" disabled={busy !== null} onClick={() => void doExport("json")}>{copy.export.actions.json}</button>
          <button type="button" className="btn" disabled={busy !== null} onClick={() => void doExport("png")}>Download labeled layout PNG</button>
          <button type="button" className="btn" disabled={busy !== null} onClick={() => void doExport("print")}>{copy.export.actions.print}</button>
          <button type="button" className="btn" disabled={busy !== null} onClick={() => void doExport("manifest")}>{copy.export.actions.manifest}</button>
          <p className="truth-note">CSS and JSON are for design tools or developers. The evidence file carries sources, licenses, hashes and limits. {state.entry === "colour" ? "The PNG shows your colors on a real 16:9 layout; it makes no type recommendation." : "The PNG uses the exact browser fonts."} No generated PowerPoint file: we will not make a compatibility promise the tool has not earned.</p>
        </div>
      </details>

      <section className="export-promo" aria-labelledby="promo-h">
        <p className="eyebrow">{copy.promotion.eyebrow}</p>
        <h2 id="promo-h">{copy.promotion.headline}</h2>
        <p>{copy.promotion.body}</p>
        <a className="btn" href="https://pitch.dog" target="_blank" rel="noreferrer">{copy.promotion.action}</a>
      </section>
    </div>
  );
};
