import { useEffect, useRef, useState } from "react";

import { useAnnounce } from "../app/announcer";
import { useRouter } from "../app/router";
import { selectDirection, selectQueue, useStudio, type StudioState } from "../app/store";
import { questionQueue } from "../wiring/questions";
import { CorrectionBench } from "./CorrectionBench";
import { DirectionCardView } from "./DirectionCard";
import { ExportWrap } from "./ExportWrap";
import { JourneyChoice } from "./JourneyChoice";
import { PreviewLab } from "./PreviewLab";
import { Processing } from "./Processing";
import { QuestionFlow, type BriefPageProgress } from "./QuestionFlow";
import { SourceTable } from "./SourceTable";
import { WordsStep } from "./WordsStep";

const journeyProgress = (state: StudioState, briefPage: BriefPageProgress | null): { route: string; current: number; total: number; label: string } => {
  const resultStep = state.step === "direction" || state.step === "lab" || state.step === "bench" || state.step === "export";
  if (state.entry === "type") {
    const pages = state.brief.typePath === "deep" ? 4 : 2;
    const total = pages + 3;
    if (resultStep) return { route: "Type Studio", current: total, total, label: "Your direction" };
    if (state.step === "path") return { route: "Type Studio", current: 1, total, label: "Choose your depth" };
    if (state.step === "words") return { route: "Type Studio", current: total - 1, total, label: "Your slide" };
    if (state.step === "processing") return { route: "Type Studio", current: total - 1, total, label: "Making your direction" };
    return { route: "Type Studio", current: (briefPage?.page ?? 0) + 2, total, label: briefPage?.title ?? "Your deck" };
  }
  if (state.entry === "colour") {
    const guided = state.brief.colourPath === "guided" || state.colourPath === "guided";
    const total = guided ? 5 : 2;
    if (resultStep) return { route: "Color Studio", current: total, total, label: "Your palette" };
    if (state.step === "brief") return { route: "Color Studio", current: (briefPage?.page ?? 0) + 2, total, label: briefPage?.title ?? "Fit to the deck" };
    if (state.step === "processing") return { route: "Color Studio", current: total - 1, total, label: "Making your palette" };
    return { route: "Color Studio", current: 1, total, label: "Choose an image" };
  }
  const pages = state.brief.typePath === "deep" ? 6 : 2;
  const total = pages + 4;
  if (resultStep) return { route: "Full Look", current: total, total, label: "Your full look" };
  if (state.step === "path") return { route: "Full Look", current: 1, total, label: "Choose your depth" };
  if (state.step === "source") return { route: "Full Look", current: 2, total, label: "Choose an image" };
  if (state.step === "words") return { route: "Full Look", current: total - 1, total, label: "Your slide" };
  if (state.step === "processing") return { route: "Full Look", current: total - 1, total, label: "Making your full look" };
  return { route: "Full Look", current: (briefPage?.page ?? 0) + 3, total, label: briefPage?.title ?? "About the deck" };
};

export const Studio = () => {
  const { state, dispatch } = useStudio();
  const { navigate } = useRouter();
  const announce = useAnnounce();
  const mainRef = useRef<HTMLDivElement>(null);
  const [briefPage, setBriefPage] = useState<BriefPageProgress | null>(null);
  const direction = selectDirection(state);
  const queue = selectQueue(state);

  useEffect(() => {
    if (!state.entry) navigate("/");
  }, [state.entry, navigate]);

  useEffect(() => {
    const heading = mainRef.current?.querySelector<HTMLElement>("h2");
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: false });
    }
  }, [state.step]);

  useEffect(() => {
    if (state.step !== "brief") setBriefPage(null);
  }, [state.entry, state.step]);

  if (!state.entry) return null;

  const progress = journeyProgress(state, briefPage);
  const remaining = progress.total - progress.current;
  const remainingLabel = remaining === 0 ? "Done" : remaining === 1 ? "One step left" : `${remaining} steps left`;

  const afterSource = () => {
    if (queue.length > 0) {
      dispatch({ type: "setStep", step: "brief" });
      announce("Next: a few questions about the deck.");
    } else {
      dispatch({ type: "setStep", step: "processing" });
      announce("Preparing your result.");
    }
  };

  const chooseColourPath = (path: "quick" | "guided") => {
    const brief = { ...state.brief, colourPath: path };
    dispatch({ type: "setBrief", brief });
    if (path === "guided" && questionQueue(brief).length > 0) {
      dispatch({ type: "setStep", step: "brief" });
      announce("A few useful questions, then your palette.");
    } else {
      dispatch({ type: "setStep", step: "processing" });
      announce("Preparing your palette.");
    }
  };

  const chooseTypePath = (path: "quick" | "deep") => {
    const brief = {
      ...state.brief,
      typePath: path,
      ...(state.entry === "whole" ? { colourPath: path === "deep" ? "guided" as const : "quick" as const } : {}),
    };
    dispatch({ type: "setBrief", brief });
    dispatch({ type: "setStep", step: state.entry === "whole" ? "source" : "brief" });
    announce(path === "deep" ? "Long ride chosen. We will show every remaining step." : "Short ride chosen. Two useful question pages.");
  };

  const afterBrief = () => {
    if (state.entry === "colour") {
      dispatch({ type: "setStep", step: "processing" });
      announce("Preparing your palette.");
      return;
    }
    dispatch({ type: "setStep", step: "words" });
    announce("Next: try the direction with one real slide.");
  };

  return (
    <div ref={mainRef} className="studio-shell">
      <header className="journey-header">
        <div className="journey-meta">
          <span className="journey-route">{progress.route}</span>
          <span className="journey-count">Step {progress.current} of {progress.total}</span>
        </div>
        <div className="journey-label-row">
          <strong>{progress.label}</strong>
          <span>{remainingLabel}</span>
        </div>
        <div className="journey-track" aria-label={`Step ${progress.current} of ${progress.total}`} role="progressbar" aria-valuemin={1} aria-valuemax={progress.total} aria-valuenow={progress.current}>
          {Array.from({ length: progress.total }, (_, index) => (
            <span key={index} data-state={index + 1 < progress.current ? "done" : index + 1 === progress.current ? "current" : "upcoming"} />
          ))}
        </div>
      </header>

      <div className="studio-page">
        {state.step === "path" && (state.entry === "type" || state.entry === "whole") ? (
          <JourneyChoice entry={state.entry} onChoose={chooseTypePath} onBack={() => navigate("/")} />
        ) : null}
        {state.step === "source" && state.entry !== "type" ? <SourceTable onContinue={afterSource} onChooseColourPath={chooseColourPath} onBack={() => state.entry === "whole" ? dispatch({ type: "setStep", step: "path" }) : navigate("/")} /> : null}
        {state.step === "brief" ? (
          <QuestionFlow
            onDone={afterBrief}
            onProgress={setBriefPage}
            onBack={() => dispatch({ type: "setStep", step: state.entry === "type" ? "path" : "source" })}
          />
        ) : null}
        {state.step === "words" ? <WordsStep onDone={() => dispatch({ type: "setStep", step: "processing" })} onBack={() => dispatch({ type: "setStep", step: "brief" })} /> : null}
        {state.step === "processing" ? <Processing onCancelled={() => dispatch({ type: "setStep", step: state.entry === "type" ? "brief" : "source" })} /> : null}
        {state.step === "direction" && direction ? (
          <DirectionCardView
            direction={direction}
            onOpenLab={() => dispatch({ type: "setStep", step: "lab" })}
            onOpenBench={() => dispatch({ type: "setStep", step: "bench" })}
            onOpenExport={() => dispatch({ type: "setStep", step: "export" })}
            onAddColour={() => dispatch({ type: "extendRoute", colourPath: "quick" })}
            onAddType={() => dispatch({ type: "extendRoute" })}
          />
        ) : null}
        {state.step === "lab" ? (
          <>
            <button type="button" className="back-to-result" onClick={() => dispatch({ type: "setStep", step: "direction" })}>← Back to my result</button>
            <PreviewLab />
          </>
        ) : null}
        {state.step === "bench" ? (
          <>
            <button type="button" className="back-to-result" onClick={() => dispatch({ type: "setStep", step: "direction" })}>← Back to my result</button>
            <CorrectionBench />
          </>
        ) : null}
        {state.step === "export" ? (
          <>
            <button type="button" className="back-to-result" onClick={() => dispatch({ type: "setStep", step: "direction" })}>← Back to my result</button>
            <ExportWrap />
          </>
        ) : null}
      </div>
    </div>
  );
};
