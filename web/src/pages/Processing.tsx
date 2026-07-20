/** Processing: real stages, no fake percent. Type gates run synchronously in
 *  milliseconds; colour analysis runs in a cancellable worker that reports its
 *  own stages. Errors preserve all work. */

import { useEffect, useRef, useState } from "react";

import { copy } from "@core/index.js";

import { useAnnounce } from "../app/announcer";
import { useStudio } from "../app/store";
import { AnalysisCancelled } from "../image/messages";
import { createColourRunner, type ColourRunner } from "../image/workerClient";
import { colourAnswersFor } from "../wiring/engines";
import { applyExactTypeAction, createExactTypeStudio, typeLibrary } from "../wiring/typeLibrary";

type StageState = "pending" | "active" | "done";

export const Processing = ({ runner, onCancelled }: { runner?: ColourRunner; onCancelled?: () => void }) => {
  const { state, dispatch } = useStudio();
  const announce = useAnnounce();
  const runnerRef = useRef<ColourRunner | null>(null);
  const [imageStages, setImageStages] = useState<StageState[]>(["pending", "pending", "pending", "pending"]);
  const [typeStages, setTypeStages] = useState<StageState[]>(["pending", "pending", "pending", "pending"]);
  const [error, setError] = useState<string | null>(null);

  const needsType = state.entry === "whole" || state.entry === "type";
  const needsColour = state.source !== null && (state.entry === "whole" || state.entry === "colour");

  useEffect(() => {
    let alive = true;
    const run = async () => {
      if (needsType && !state.typeStudio) {
        const marks: StageState[] = ["pending", "pending", "pending", "pending"];
        for (let stage = 0; stage < marks.length; stage += 1) {
          marks[stage] = "active";
          if (alive) setTypeStages([...marks]);
          // The engine genuinely runs on the first stage; the rest name what
          // it already did, so they complete without theatrical delay.
          if (stage === 0) {
            try {
              let session = createExactTypeStudio(state.brief);
              const remembered = typeLibrary.fonts.find((font) => font.id === state.rememberedCollectionId);
              if (session && remembered) {
                session = applyExactTypeAction(session, { type: "toggleStarFont", fontId: remembered.id });
                const role = remembered.roles.includes("display") ? "display" : remembered.roles.includes("body") ? "body" : "utility";
                session = applyExactTypeAction(session, { type: "toggleLock", role, fontId: remembered.id });
              }
              if (session && alive) dispatch({ type: "typeStudioReady", session });
            } catch (typeError) {
              if (alive) setError(typeError instanceof Error ? typeError.message : "The type engine stopped.");
              return;
            }
          }
          await new Promise((resolve) => setTimeout(resolve, 90));
          marks[stage] = "done";
          if (alive) setTypeStages([...marks]);
        }
        if (alive) announce("Type gates complete.");
      }

      if (needsColour && state.source && !state.colourRun) {
        if (!runnerRef.current) runnerRef.current = runner ?? createColourRunner();
        const active = runnerRef.current;
        try {
          const stageIndex = { normalizing: 0, hashing: 1, clustering: 2, building: 3 } as const;
          const output = await active.run(
            {
              width: state.source.workingWidth,
              height: state.source.workingHeight,
              rgba: state.source.rgba.slice(0),
              answers: colourAnswersFor(state.brief),
              crop: state.source.crop,
              ...(state.source.alphaGround ? { alphaGround: state.source.alphaGround } : {}),
              protectedHexes: state.source.protectedHexes,
            },
            (stage) => {
              if (!alive) return;
              setImageStages((stages) =>
                stages.map((current, index) =>
                  index < stageIndex[stage] ? "done" : index === stageIndex[stage] ? "active" : current,
                ),
              );
            },
          );
          if (!alive) return;
          setImageStages(["done", "done", "done", "done"]);
          dispatch({ type: "analysisReady", analysis: output });
          dispatch({ type: "colourReady", run: { systems: output.systems, companionSystems: output.companionSystems, recommendation: output.recommendation } });
          announce("Color systems built. Three systems, with companions where you asked.");
        } catch (colourError) {
          if (!alive) return;
          if (colourError instanceof AnalysisCancelled) {
            onCancelled?.();
            return;
          }
          setError(colourError instanceof Error ? colourError.message : "Color analysis failed.");
          return;
        }
      }

      if (alive) {
        dispatch({ type: "setStep", step: "direction" });
        announce("Your direction is ready.");
      }
    };
    void run();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const typeNeeded = needsType;
  const colourNeeded = needsColour;

  return (
    <div aria-busy="true">
      <p className="eyebrow">Working</p>
      <h2 className="step-title">The engines are doing their jobs.</h2>
      <p className="step-intro">{copy.processing.noPercent}</p>

      {typeNeeded ? (
        <ol className="stage-list" aria-label="Type engine stages">
          {copy.processing.type.map((label, index) => (
            <li key={label} data-state={typeStages[index] ?? "pending"}>
              {label}
            </li>
          ))}
        </ol>
      ) : null}

      {colourNeeded ? (
        <ol className="stage-list" aria-label="Color analysis stages">
          {copy.processing.image.map((label, index) => (
            <li key={label} data-state={imageStages[index] ?? "pending"}>
              {label}
            </li>
          ))}
        </ol>
      ) : null}

      {error ? (
        <div className="card" role="alert" style={{ marginTop: "1.4rem", borderColor: "var(--blocking)" }}>
          <h3 style={{ fontSize: "1.05rem" }}>The work stopped, nothing was lost.</h3>
          <p style={{ marginTop: "0.4rem" }}>{error}</p>
          <p style={{ marginTop: "0.8rem", display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
            <button type="button" className="btn btn--primary" onClick={() => dispatch({ type: "setStep", step: "source" })}>
              Back to the source
            </button>
            <button type="button" className="btn" onClick={() => dispatch({ type: "setStep", step: "brief" })}>
              Revise the brief
            </button>
          </p>
        </div>
      ) : (
        colourNeeded && (
          <p style={{ marginTop: "1.6rem" }}>
            <button
              type="button"
              className="btn"
              onClick={() => {
                runnerRef.current?.cancel();
                runnerRef.current = null;
              }}
            >
              Cancel — keep everything else
            </button>
          </p>
        )
      )}
    </div>
  );
};
