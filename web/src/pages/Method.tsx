import { copy } from "@core/index.js";

export function MethodPage() {
  return (
    <section className="method-shell">
      <header className="page-head">
        <p className="eyebrow">How it works</p>
        <h1 className="display-lg">A useful answer. Then the receipts.</h1>
        <p className="page-lede">Letters & Light helps you choose a type direction, build a palette from an image, or do both. You never need to understand the machinery to use the result.</p>
      </header>

      <div className="method-steps">
        <article><span>01</span><h2>Bring the problem.</h2><p>Answer a few questions about the deck, or add an image. We ask only what changes the result.</p></article>
        <article><span>02</span><h2>See it on slides.</h2><p>Not a moodboard. Not a weird text box. Five practical 16:9 situations with limits that protect the layout.</p></article>
        <article><span>03</span><h2>Take the direction with you.</h2><p>Download the palette, font sources, cautions and evidence. Keep the judgment; lose the mystery.</p></article>
      </div>

      <details className="disclosure method-detail" id="privacy">
        <summary>Privacy and local processing</summary>
        <div className="disclosure-body"><p>Your image and words are processed in this browser. Images are held in memory, never placed in saved project files, and disappear when the tab closes. A project is stored on this device only when you explicitly choose “Remember on this device.”</p></div>
      </details>
      <details className="disclosure method-detail" id="accessibility">
        <summary>Accessibility and fit checks</summary>
        <div className="disclosure-body"><p>Every shipped text/background pair is contrast-checked. The interface supports keyboards, visible focus, reduced motion and text verdicts wherever color carries meaning. Copy overflow is shown as a problem to solve—never clipped into silence.</p></div>
      </details>
      <details className="disclosure method-detail" id="technical-method">
        <summary>The technical method</summary>
        <div className="disclosure-body"><p>The type system begins with exact local font files and keeps browser preview separate from PowerPoint, Keynote and Google Slides proof. The color engine samples the image, builds roles in perceptual color space and checks light and dark systems separately. Corrections are replayable operations with undo, redo and reset.</p><p>A preview may use a font’s name only when its exact self-hosted file is active. Every direction keeps its maker, license and official source attached.</p></div>
      </details>

      <p className="method-pitchdog">{copy.promotion.body}</p>
    </section>
  );
}
