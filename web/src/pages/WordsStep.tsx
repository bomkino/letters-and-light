/** Real copy, with limits that protect the slide instead of blaming the user
 * after it breaks. */

import { type PreviewCopy } from "@core/index.js";

import { useStudio } from "../app/store";
import { SlidePreview } from "../components/SlidePreview";

type Field = { id: keyof PreviewCopy; label: string; max: number; multiline?: boolean; placeholder?: string };

const PRIMARY: Field[] = [
  { id: "slideTitle", label: "A slide headline", max: 72, placeholder: "Put the answer on the slide." },
  { id: "body", label: "The supporting thought", max: 280, multiline: true, placeholder: "What does the room need to understand next? Two or three sentences is plenty." },
];

const OPTIONAL: Field[] = [
  { id: "deckTitle", label: "Deck title", max: 64 },
  { id: "subtitle", label: "Subtitle", max: 120 },
  { id: "quote", label: "Quote", max: 180, multiline: true },
  { id: "attribution", label: "Attribution", max: 80 },
  { id: "metric", label: "Key number", max: 12, placeholder: "$2.4M" },
  { id: "metricLabel", label: "What the number means", max: 64 },
  { id: "tableSample", label: "Example table row", max: 96 },
];

const CopyField = ({ field, value, onChange }: { field: Field; value: string; onChange: (value: string) => void }) => (
  <label className="copy-field">
    <span>{field.label}</span>
    {field.multiline ? (
      <textarea className="text-input" rows={4} maxLength={field.max} placeholder={field.placeholder} value={value} onChange={(event) => onChange(event.target.value)} />
    ) : (
      <input className="text-input" type="text" maxLength={field.max} placeholder={field.placeholder} value={value} onChange={(event) => onChange(event.target.value)} />
    )}
    <span className="field-count">{value.length}/{field.max}</span>
  </label>
);

export const WordsStep = ({ onDone, onBack }: { onDone: () => void; onBack?: () => void }) => {
  const { state, dispatch } = useStudio();
  const current = state.brief.previewCopy ?? {};
  const title = current.slideTitle || "Put the answer on the slide.";
  const body = current.body || "A strong deck does not make people hunt for the point. It gives the thought a shape, then gets out of the way.";

  const setField = (id: keyof PreviewCopy, value: string) => {
    const next = { ...current, [id]: value };
    for (const key of Object.keys(next) as Array<keyof PreviewCopy>) if (!next[key]?.trim()) delete next[key];
    dispatch({ type: "setPreviewCopy", previewCopy: next });
  };

  const useSample = () => dispatch({
    type: "setPreviewCopy",
    previewCopy: {
      deckTitle: "The Case for Fewer Meetings",
      slideTitle: "The work starts before the call.",
      body: "Send the decision, the evidence and the open question in advance. Use the room to disagree well—not to read aloud together.",
      quote: "Clarity is a form of respect.",
      attribution: "Project principle",
      metric: "48%",
      metricLabel: "less time to first contribution",
    },
  });

  return (
    <div className="words-step">
      <p className="eyebrow">Optional · make it yours</p>
      <h2 className="step-title">Try it with words from your deck.</h2>
      <p className="step-intro">The limits are deliberate. They keep the preview looking like a slide—not a document wearing a blazer.</p>

      <div className="words-layout">
        <div className="copy-form">
          {PRIMARY.map((field) => <CopyField key={field.id} field={field} value={current[field.id] ?? ""} onChange={(value) => setField(field.id, value)} />)}
          <details className="disclosure">
            <summary>More slide ingredients</summary>
            <div className="disclosure-body copy-form">
              {OPTIONAL.map((field) => <CopyField key={field.id} field={field} value={current[field.id] ?? ""} onChange={(value) => setField(field.id, value)} />)}
            </div>
          </details>
        </div>
        <div className="words-preview">
          <SlidePreview title={title} body={body} variant="titleBody" label="Your copy on a real 16:9 slide" />
          <button type="button" className="text-link" onClick={useSample}>{Object.keys(current).length ? "Replace my words with the sample" : "Borrow this sample"}</button>
        </div>
      </div>

      <div className="flow-actions">
        {onBack ? <button type="button" className="btn" onClick={onBack}>Back</button> : null}
        <button type="button" className="btn btn--primary" onClick={onDone}>See my direction</button>
        {Object.keys(current).length ? <button type="button" className="btn" onClick={() => dispatch({ type: "setPreviewCopy", previewCopy: {} })}>Clear my copy</button> : null}
        <span className="hint">{Object.keys(current).length ? "Using your words." : "Using the sample shown. You can change it later."}</span>
      </div>
    </div>
  );
};
