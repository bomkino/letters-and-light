/** A short, stable brief. Questions are grouped into human-sized pages so
 * answering one cannot make the next one jump or disappear. */

import { useEffect, useMemo, useRef, useState } from "react";

import type { SharedBrief } from "@core/index.js";

import { useAnnounce } from "../app/announcer";
import { useStudio } from "../app/store";
import { answerBrief, briefValue, studioQuestion, type StudioQuestion } from "../wiring/questions";
import { typeLibrary } from "../wiring/typeLibrary";

type Group = { title: string; note: string; ids: string[] };

const TYPE_GROUPS: Group[] = [
  { title: "Your deck", note: "What are we helping you make?", ids: ["artifactType", "existingFontConstraint", "mandatoryFontName"] },
  { title: "The room", note: "Where it will be built, shown and handed over.", ids: ["authoringTool", "handoffPaths", "viewingContexts"] },
  { title: "The load", note: "How much the type needs to carry without losing its nerve.", ids: ["density", "contentNeeds", "writingSystems"] },
  { title: "The voice", note: "One last choice: how should the deck feel?", ids: ["character"] },
];

const TYPE_QUICK_GROUPS: Group[] = [
  { title: "What are we making?", note: "The job and any brand rule. That is enough to stop us recommending nonsense.", ids: ["artifactType", "existingFontConstraint", "mandatoryFontName"] },
  { title: "How should it speak?", note: "Choose the reading pressure and the amount of personality the deck can carry.", ids: ["density", "character"] },
];

const COLOR_GROUPS: Group[] = [
  { title: "Where it lives", note: "The same color behaves differently on a projector and a phone.", ids: ["viewingContexts", "density"] },
  { title: "The relationship", note: "Tell us how closely the palette should stay to the image.", ids: ["sourceRelationship", "baseMode"] },
  { title: "Charts, if any", note: "Only answer what your deck actually needs.", ids: ["dataNeed", "dataCount", "divergingMidpoint"] },
];

const questionIsActive = (question: StudioQuestion, brief: SharedBrief) => {
  if (question.id === "mandatoryFontName") return brief.existingFontConstraint === "mandatory";
  if (question.id === "dataCount") return ["categorical", "sequential", "diverging"].includes(brief.dataNeed ?? "");
  if (question.id === "divergingMidpoint") return brief.dataNeed === "diverging";
  return true;
};

const valid = (question: StudioQuestion, value: unknown) => {
  if (question.kind === "multi") return Array.isArray(value) && value.length > 0;
  if (question.kind === "number") return typeof value === "number" && Number.isInteger(value) && value >= (question.min ?? 2) && value <= (question.max ?? 12);
  return typeof value === "string" && value.trim().length > 0;
};

const ChoiceField = ({ question, value, onChange }: { question: StudioQuestion; value: unknown; onChange: (value: unknown) => void }) => {
  if (question.kind === "single") {
    return (
      <div className="answer-grid" role="radiogroup" aria-label={question.title}>
        {question.options.map((option) => (
          <label className="answer-card" key={option.id} data-selected={value === option.id}>
            <input type="radio" name={question.id} checked={value === option.id} onChange={() => onChange(option.id)} />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    );
  }
  if (question.kind === "multi") {
    const selected = Array.isArray(value) ? (value as string[]) : [];
    const card = (option: StudioQuestion["options"][number]) => {
      const checked = selected.includes(option.id);
      return (
        <label className="answer-card" key={option.id} data-selected={checked}>
          <input type="checkbox" name={question.id} checked={checked} onChange={() => onChange(checked ? selected.filter((id) => id !== option.id) : [...selected, option.id])} />
          <span>{option.label}</span>
        </label>
      );
    };

    if (question.id === "writingSystems") {
      const common = question.options.filter((option) => option.id === "latin");
      const additional = question.options.filter((option) => option.id !== "latin");
      return (
        <div className="language-choices" aria-label={question.title}>
          <div className="answer-grid answer-grid--single">{common.map(card)}</div>
          <details className="disclosure language-disclosure" open={additional.some((option) => selected.includes(option.id)) || undefined}>
            <summary>Add another language or writing system</summary>
            <div className="disclosure-body answer-grid">{additional.map(card)}</div>
          </details>
        </div>
      );
    }

    return (
      <div className="answer-grid" aria-label={question.title}>
        {question.options.map(card)}
      </div>
    );
  }
  if (question.kind === "number") {
    const numeric = typeof value === "number" && Number.isFinite(value) ? value : question.min ?? 2;
    const setNumeric = (next: number) => onChange(Math.max(question.min ?? 2, Math.min(question.max ?? 12, next)));
    return (
      <div className="number-choice">
        <div className="number-stepper">
          <button type="button" aria-label="One fewer" onClick={() => setNumeric(numeric - 1)} disabled={numeric <= (question.min ?? 2)}>−</button>
          <output aria-live="polite">{numeric}</output>
          <button type="button" aria-label="One more" onClick={() => setNumeric(numeric + 1)} disabled={numeric >= (question.max ?? 12)}>+</button>
        </div>
        <div className="number-presets" aria-label="Common counts">
          {[2, 3, 4, 5, 6, 8, 10, 12].map((count) => (
            <button type="button" key={count} aria-pressed={numeric === count} onClick={() => setNumeric(count)}>{count}</button>
          ))}
        </div>
      </div>
    );
  }
  const text = typeof value === "string" ? value : "";
  if (question.id === "divergingMidpoint") {
    return (
      <div className="text-with-presets">
        <div className="text-presets" aria-label="Common midpoint answers">
          {["Zero", "Target", "Break-even", "Parity"].map((preset) => (
            <button type="button" key={preset} aria-pressed={text === preset} onClick={() => onChange(preset)}>{preset}</button>
          ))}
        </div>
        <label className="counted-field">
          <span className="sr-only">Or type another meaningful midpoint</span>
          <input className="text-input" type="text" placeholder="Or type another midpoint" maxLength={80} value={text} onChange={(event) => onChange(event.target.value)} />
          <span>{text.length}/80</span>
        </label>
      </div>
    );
  }
  const exactFont = question.id === "mandatoryFontName"
    ? typeLibrary.fonts.find((font) => font.family.toLocaleLowerCase() === text.trim().toLocaleLowerCase())
    : null;
  return (
    <div>
      <label className="counted-field">
        <input className="text-input" type="text" list={question.id === "mandatoryFontName" ? "exact-font-families" : undefined} maxLength={80} value={text} onChange={(event) => onChange(event.target.value)} />
        <span>{text.length}/80</span>
      </label>
      {question.id === "mandatoryFontName" ? (
        <>
          <datalist id="exact-font-families">{typeLibrary.fonts.map((font) => <option key={font.id} value={font.family} />)}</datalist>
          {text.trim() ? <p className={`field-verdict ${exactFont ? "field-verdict--good" : ""}`}>{exactFont ? `${exactFont.family} is in the exact preview library.` : "Not in the exact preview library yet. We will stop rather than disguise a substitute."}</p> : null}
        </>
      ) : null}
    </div>
  );
};

export type BriefPageProgress = { page: number; total: number; title: string };

export const QuestionFlow = ({ onDone, onProgress, onBack }: { onDone: () => void; onProgress?: (progress: BriefPageProgress) => void; onBack: () => void }) => {
  const { state, dispatch } = useStudio();
  const announce = useAnnounce();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const groups = useMemo(() => {
    if (state.entry === "colour") return COLOR_GROUPS;
    const typeGroups = state.brief.typePath === "deep" ? TYPE_GROUPS : TYPE_QUICK_GROUPS;
    return state.entry === "whole" && state.brief.colourPath === "guided" ? [...typeGroups, ...COLOR_GROUPS.slice(1)] : typeGroups;
  }, [state.brief.colourPath, state.brief.typePath, state.entry]);
  const [page, setPage] = useState(0);
  const group = groups[Math.min(page, groups.length - 1)] ?? groups[0];

  useEffect(() => {
    if (!group) return;
    onProgress?.({ page, total: groups.length, title: group.title });
    headingRef.current?.focus({ preventScroll: true });
  }, [group, groups.length, onProgress, page]);

  if (!group) return null;
  const questions = group.ids.map(studioQuestion).filter((item): item is StudioQuestion => item !== null).filter((item) => questionIsActive(item, state.brief));
  const setBrief = (brief: SharedBrief) => dispatch({ type: "setBrief", brief });
  const otherOkay = !(group.ids.includes("artifactType") && state.brief.artifactType === "other") || Boolean(state.brief.otherDecision?.trim());
  const pageOkay = otherOkay && questions.every((question) => valid(question, briefValue(state.brief, question.id)));
  const last = page === groups.length - 1;

  const next = () => {
    if (!pageOkay) return;
    if (last) {
      announce(state.entry === "colour" ? "Brief complete. Making your palette now." : "Brief complete. Next: your slide.");
      onDone();
      return;
    }
    setPage((current) => current + 1);
    window.scrollTo({ top: 0, behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };

  const previous = () => {
    if (page === 0) {
      onBack();
      return;
    }
    setPage((current) => current - 1);
    window.scrollTo({ top: 0, behavior: "auto" });
  };

  const finalAction = state.entry === "colour" ? "Make my palette" : "Continue to my slide";

  return (
    <div className="brief-flow" aria-labelledby="brief-group-title">
      <h2 ref={headingRef} tabIndex={-1} className="step-title" id="brief-group-title">{group.title}</h2>
      <p className="step-intro">{group.note}</p>

      <div className="question-stack">
        {questions.map((question) => {
          const value = briefValue(state.brief, question.id);
          return (
            <fieldset className="question-block" key={question.id}>
              <legend>{question.title}</legend>
              <p>{question.note}</p>
              <ChoiceField question={question} value={value} onChange={(answer) => setBrief(answerBrief(state.brief, question.id, answer))} />
              {question.id === "artifactType" && state.brief.artifactType === "other" ? (
                <label className="counted-field question-followup">
                  <span>What decision should this deck help someone make?</span>
                  <input className="text-input" type="text" maxLength={80} value={state.brief.otherDecision ?? ""} onChange={(event) => setBrief(answerBrief(state.brief, "otherDecision", event.target.value))} />
                  <span>{(state.brief.otherDecision ?? "").length}/80</span>
                </label>
              ) : null}
            </fieldset>
          );
        })}
      </div>

      <div className="flow-actions">
        <button type="button" className="btn" onClick={previous}>Back</button>
        <button type="button" className="btn btn--primary" disabled={!pageOkay} onClick={next}>{last ? finalAction : "Next"}</button>
        {!pageOkay ? <span className="hint">Answer this page to continue.</span> : null}
      </div>
    </div>
  );
};
