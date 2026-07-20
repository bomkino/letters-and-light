import type { EntryRoute, TypePath } from "@core/index.js";

type JourneyChoiceProps = {
  entry: Exclude<EntryRoute, "colour" | "collection">;
  onChoose: (path: TypePath) => void;
  onBack: () => void;
};

export const JourneyChoice = ({ entry, onChoose, onBack }: JourneyChoiceProps) => {
  const whole = entry === "whole";
  return (
    <section className="journey-choice" aria-labelledby="journey-choice-title">
      <header className="journey-choice__head">
        <p className="eyebrow">Choose your depth</p>
        <h2 className="step-title" id="journey-choice-title">A useful answer—or the full nosy little investigation.</h2>
        <p className="step-intro">You decide how much of your life this deserves. Both routes use the real font library. The longer one asks only for facts that can change the answer.</p>
      </header>

      <div className="journey-choice__grid">
        <button type="button" className="journey-ticket journey-ticket--quick" onClick={() => onChoose("quick")}>
          <span className="journey-ticket__number">01</span>
          <span className="journey-ticket__time">About 90 seconds</span>
          <strong>Give me the useful answer</strong>
          <span>What you’re making, any brand rule, how dense it is, and how much character it can carry.</span>
          <small>{whole ? "One image. Two short question pages. A complete first direction." : "Two short question pages. Five real-font directions."}</small>
          <i aria-hidden="true">Take the short ride →</i>
        </button>

        <button type="button" className="journey-ticket journey-ticket--deep" onClick={() => onChoose("deep")}>
          <span className="journey-ticket__number">02</span>
          <span className="journey-ticket__time">About 4 minutes</span>
          <strong>Take me through it properly</strong>
          <span>Add the room, authoring tool, handoff, content pressure, language, and {whole ? "a guided relationship to the image" : "where the deck must survive"}.</span>
          <small>You get sharper recommendations, visible caveats, and fewer “it depends”s skulking around later.</small>
          <i aria-hidden="true">Take the long ride →</i>
        </button>
      </div>

      <p className="journey-consent">No account. No upload. No surprise questionnaire breeding in the dark.</p>
      <button type="button" className="text-link journey-choice__back" onClick={onBack}>← Back home</button>
    </section>
  );
};

