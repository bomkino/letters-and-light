/** Open a saved project: hostile-import-safe parse (core), honest summary,
 *  source relink by fingerprint. Exact match restores; mismatch keeps answers
 *  and asks to rebuild colour — old edits are never silently applied. */

import { useRef, useState } from "react";

import {
  copy,
  parseProjectFile,
  type EntryRoute,
  type LettersLightProjectFile,
  type SharedBrief,
} from "@core/index.js";

import { useAnnounce } from "../app/announcer";
import { useRouter } from "../app/router";
import { useStudio } from "../app/store";
import { decodeImageFile, normalizeWorkingPixels, releaseSource, type DecodedSource } from "../image/decode";
import { isUnrunType, typeColourRunFromOutput, unrunTypeRecommendation } from "../wiring/engines";
import { REMEMBERED_PROJECT_KEY } from "../wiring/exports";

const UNRUN_TYPE_HEADLINE = unrunTypeRecommendation().headline;

type PagePhase =
  | { kind: "idle" }
  | { kind: "error"; message: string }
  | { kind: "ready"; project: LettersLightProjectFile }
  | { kind: "mismatch"; project: LettersLightProjectFile; decoded: DecodedSource };

const routeFor = (project: LettersLightProjectFile): EntryRoute => {
  const hasType = !isUnrunType(project.direction.type) && project.direction.type.recommendations.length > 0;
  const hasColour = project.direction.colour !== null;
  if (hasType && hasColour) return "whole";
  if (hasType) return "type";
  return "colour";
};

const briefFromProject = (project: LettersLightProjectFile, route: EntryRoute): SharedBrief => {
  const type = project.direction.type;
  const hasType = !isUnrunType(type) && route !== "colour";
  const colour = project.answers.colour;
  return {
    route,
    ...(hasType
      ? {
          artifactType: project.answers.type.artifactType,
          ...(project.answers.type.otherDecision ? { otherDecision: project.answers.type.otherDecision } : {}),
          existingFontConstraint: project.answers.type.existingFontConstraint,
          ...(project.answers.type.mandatoryFontName ? { mandatoryFontName: project.answers.type.mandatoryFontName } : {}),
          authoringTool: project.answers.type.authoringTool,
          handoffPaths: [...project.answers.type.handoffPaths],
          viewingContexts: [...project.answers.type.viewingContexts],
          density: project.answers.type.density,
          contentNeeds: [...project.answers.type.contentNeeds],
          writingSystems: [...project.answers.type.writingSystems],
          character: project.answers.type.character,
        }
      : {}),
    sourceRelationship: colour.sourceRelationship,
    baseMode: colour.baseMode,
    dataNeed: colour.dataNeed,
    ...(colour.dataCount !== undefined ? { dataCount: colour.dataCount } : {}),
    ...(colour.divergingMidpoint ? { divergingMidpoint: colour.divergingMidpoint } : {}),
    // Delivery was derived from viewing context at run time; restoring the
    // lossless value keeps the reopened run identical to the saved one.
    colourDeliveryOverride: colour.delivery,
    previewCopy: project.direction.previewCopy,
  };
};

export function ProjectOpenPage() {
  const { dispatch } = useStudio();
  const { navigate } = useRouter();
  const announce = useAnnounce();
  const fileRef = useRef<HTMLInputElement>(null);
  const relinkRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<PagePhase>({ kind: "idle" });
  const [remembered, setRemembered] = useState<string | null>(() => {
    try {
      return window.localStorage.getItem(REMEMBERED_PROJECT_KEY);
    } catch {
      return null;
    }
  });

  const restore = (project: LettersLightProjectFile, keepColour: boolean) => {
    const route = routeFor(project);
    const typeResult = isUnrunType(project.direction.type) ? null : project.direction.type;
    const colourRun = keepColour && project.direction.colour
      ? typeColourRunFromOutput({ ...project.direction.colour, companionSystems: project.direction.colour.companionSystems ?? [] })
      : null;
    dispatch({
      type: "projectLoaded",
      brief: briefFromProject(project, keepColour ? route : typeResult ? "type" : "colour"),
      typeResult,
      colourRun,
      selectedTypeId: project.direction.selected.typeSystemId,
      selectedPaletteId: keepColour ? project.direction.selected.paletteSystemId : null,
      projectId: project.projectId,
      projectName: project.direction.name,
      entry: keepColour ? route : typeResult ? "type" : "colour",
    });
    announce(`${project.direction.name}. Your direction is back; nothing left this browser.`);
    navigate("/studio");
  };

  const openText = (text: string) => {
    try {
      const project = parseProjectFile(text);
      setPhase({ kind: "ready", project });
    } catch (error) {
      setPhase({ kind: "error", message: error instanceof Error ? error.message : "That file would not parse." });
    }
  };

  const onProjectFile = async (file: File | undefined) => {
    if (!file) return;
    openText(await file.text());
  };

  const onRelinkFile = async (file: File | undefined, project: LettersLightProjectFile) => {
    if (!file) return;
    let decoded: DecodedSource | null = null;
    try {
      decoded = await decodeImageFile(file);
      if (decoded.sourceFileHash === project.source.sourceFileHash) {
        releaseSource(decoded);
        announce(copy.project.exactMatch);
        restore(project, true);
      } else {
        setPhase({ kind: "mismatch", project, decoded });
      }
    } catch (error) {
      releaseSource(decoded);
      setPhase({ kind: "error", message: error instanceof Error ? error.message : "That image would not open." });
    }
  };

  const rebuildWithNewImage = (project: LettersLightProjectFile, decoded: DecodedSource) => {
    // Keep answers and the direction minus colour; load the new image so the
    // source table can rebuild the light. Saved edits are not applied.
    const working = normalizeWorkingPixels(decoded.bitmap);
    dispatch({
      type: "sourceLoaded",
      source: {
        sourceFileHash: decoded.sourceFileHash,
        format: decoded.format,
        width: decoded.width,
        height: decoded.height,
        workingWidth: working.width,
        workingHeight: working.height,
        rgba: working.rgba,
        hasAlpha: working.hasAlpha,
        alphaGround: null,
        crop: { x: 0, y: 0, width: working.width, height: working.height },
        protectedHexes: [],
      },
    });
    releaseSource(decoded);
    restore(project, false);
  };

  const forgetRemembered = () => {
    try {
      window.localStorage.removeItem(REMEMBERED_PROJECT_KEY);
    } catch {
      /* clearing must never fail loudly */
    }
    setRemembered(null);
    announce(copy.project.clear);
  };

  const ready = phase.kind === "ready" ? phase.project : null;
  const mismatch = phase.kind === "mismatch" ? phase : null;

  return (
    <section className="open-shell">
      <header className="page-head">
        <p className="eyebrow">{copy.brand.byline}</p>
        <h1 className="display-lg">{copy.project.reopen}</h1>
        <p className="page-lede">{copy.export.projectDisclosure}</p>
      </header>

      <div className="card" style={{ marginTop: "1.6rem" }}>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="visually-hidden"
          aria-label="Choose a Letters and Light project file"
          onChange={(event) => {
            void onProjectFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        <p style={{ display: "flex", gap: "0.7rem", flexWrap: "wrap" }}>
          <button type="button" className="btn btn--primary" onClick={() => fileRef.current?.click()}>
            {copy.project.reopen}
          </button>
          {remembered ? (
            <>
              <button type="button" className="btn" onClick={() => openText(remembered)}>
                Open the project remembered on this device
              </button>
              <button type="button" className="btn btn--ghost" onClick={forgetRemembered}>
                {copy.project.clear}
              </button>
            </>
          ) : null}
        </p>
        {phase.kind === "error" ? (
          <p role="alert" style={{ color: "var(--caution)", marginTop: "0.9rem" }}>
            This file was refused: {phase.message}
          </p>
        ) : null}
      </div>

      {ready ? (
        <div className="card" style={{ marginTop: "1.2rem" }}>
          <h2 style={{ fontSize: "1.2rem" }}>{ready.direction.name}</h2>
          <p style={{ color: "var(--graphite)", marginTop: "0.35rem" }}>
            Saved {new Date(ready.updatedAt).toLocaleString()} · revision {ready.revision} · engines type {ready.engineVersions.type},
            color {ready.engineVersions.colour}
          </p>
          <p style={{ marginTop: "0.6rem" }}>{ready.direction.relationship.headline}</p>
          {ready.source.relinkRequired ? (
            <div style={{ marginTop: "1rem" }}>
              <p>{copy.project.relink}</p>
              <input
                ref={relinkRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="visually-hidden"
                aria-label="Relink the source image"
                onChange={(event) => {
                  void onRelinkFile(event.target.files?.[0], ready);
                  event.target.value = "";
                }}
              />
              <p style={{ marginTop: "0.7rem", display: "flex", gap: "0.7rem", flexWrap: "wrap" }}>
                <button type="button" className="btn btn--primary" onClick={() => relinkRef.current?.click()}>
                  {copy.project.relink}
                </button>
                <button type="button" className="btn btn--ghost" onClick={() => restore(ready, false)}>
                  Continue without the image — keep type, drop saved color
                </button>
              </p>
            </div>
          ) : (
            <p style={{ marginTop: "1rem" }}>
              <button type="button" className="btn btn--primary" onClick={() => restore(ready, true)}>
                Open this direction
              </button>
            </p>
          )}
        </div>
      ) : null}

      {mismatch ? (
        <div className="card" role="alert" style={{ marginTop: "1.2rem" }}>
          <h2 style={{ fontSize: "1.2rem" }}>{copy.project.mismatch}</h2>
          <p style={{ marginTop: "1rem", display: "flex", gap: "0.7rem", flexWrap: "wrap" }}>
            <button type="button" className="btn btn--primary" onClick={() => rebuildWithNewImage(mismatch.project, mismatch.decoded)}>
              {copy.project.mismatchAction}
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                releaseSource(mismatch.decoded);
                setPhase({ kind: "ready", project: mismatch.project });
              }}
            >
              Go back
            </button>
          </p>
        </div>
      ) : null}
    </section>
  );
}
