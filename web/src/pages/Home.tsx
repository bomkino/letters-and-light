import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { copy, type EntryRoute, type PreviewCopy } from "@core/index.js";

import { useAnnounce } from "../app/announcer";
import { useRouter } from "../app/router";
import { useStudio } from "../app/store";
import { SlidePreview, type SlidePalette } from "../components/SlidePreview";

const TITLE_LIMIT = 72;
const TEASER_FONTS = { display: '"Fraunces", serif', body: '"DM Sans", sans-serif', utility: '"IBM Plex Mono", monospace' };
const TEASER_PALETTES: Array<{ name: string; palette: SlidePalette }> = [
  { name: "Paper & signal", palette: { background: "#f4efe5", surface: "#e5ddd0", text: "#18171b", muted: "#655f64", accent: "#e13e86", accentSecondary: "#284bd7", onAccent: "#fffaf3" } },
  { name: "Night screening", palette: { background: "#151419", surface: "#292630", text: "#f2ecdf", muted: "#aaa2aa", accent: "#f05aa3", accentSecondary: "#718cff", onAccent: "#151419" } },
  { name: "Warm interruption", palette: { background: "#f2dfc9", surface: "#ddc2ad", text: "#24191b", muted: "#70565a", accent: "#c42d67", accentSecondary: "#264fc3", onAccent: "#fff7eb" } },
];
const DEMO_BODY = "One clear argument, enough evidence to trust it, and no slide pretending to be a storage unit.";

export const Home = () => {
  const { dispatch } = useStudio();
  const { navigate } = useRouter();
  const announce = useAnnounce();
  const [mode, setMode] = useState<"type" | "colour">("type");
  const [title, setTitle] = useState("Put the answer on the slide.");
  const [paletteIndex, setPaletteIndex] = useState(0);
  const artRef = useRef<HTMLDivElement>(null);
  const frame = useRef<number | null>(null);
  const activePalette = TEASER_PALETTES[paletteIndex] ?? TEASER_PALETTES[0]!;

  useEffect(() => () => { if (frame.current !== null) cancelAnimationFrame(frame.current); }, []);

  const moveLight = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const element = artRef.current;
    if (!element) return;
    const bounds = element.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width));
    const y = Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height));
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      element.style.setProperty("--light-x", `${(x * 100).toFixed(1)}%`);
      element.style.setProperty("--light-y", `${(y * 100).toFixed(1)}%`);
      element.style.setProperty("--art-rx", `${((.5 - y) * 2.6).toFixed(2)}deg`);
      element.style.setProperty("--art-ry", `${((x - .5) * 3.2).toFixed(2)}deg`);
    });
  };

  const start = (entry: EntryRoute, previewCopy?: PreviewCopy) => {
    dispatch({ type: "enter", entry });
    if (previewCopy) dispatch({ type: "setPreviewCopy", previewCopy });
    announce(entry === "type" ? "Opening the Type studio." : entry === "colour" ? "Opening the Color studio." : "Opening the Full Look studio.");
    navigate("/studio");
  };

  return (
    <div className="home-shell home-v2">
      <section className="hero-v2" aria-labelledby="home-title">
        <div className="hero-v2__copy">
          <p className="eyebrow">{copy.home.eyebrow}</p>
          <h1 id="home-title">Make it clear.<br /><i>Then make it felt.</i></h1>
          <p className="home-standfirst">Find a real typographic voice, build a useful color world from one image, or do both. See the answer on actual 16:9 slides before you take it away.</p>

          <div className="teaser-v2">
            <div className="teaser-tabs" role="tablist" aria-label="Try the tool before choosing a route">
              <button type="button" role="tab" aria-selected={mode === "type"} onClick={() => setMode("type")}>Play with the words</button>
              <button type="button" role="tab" aria-selected={mode === "colour"} onClick={() => setMode("colour")}>Change the light</button>
            </div>
            {mode === "type" ? (
              <div className="teaser-control" role="tabpanel">
                <label className="field teaser-v2__field"><span>Try one slide title</span><input className="text-input text-input--large" type="text" maxLength={TITLE_LIMIT} value={title} onChange={(event) => setTitle(event.target.value)} /><span className="field-count">{title.length}/{TITLE_LIMIT}</span></label>
                <button type="button" className="btn btn--primary btn--large" onClick={() => start("type", { slideTitle: title || "Put the answer on the slide.", body: DEMO_BODY })}>Find my type direction <span aria-hidden="true">→</span></button>
              </div>
            ) : (
              <div className="teaser-control" role="tabpanel">
                <div className="palette-teaser-options" aria-label="Three sample color worlds">
                  {TEASER_PALETTES.map((item, index) => <button key={item.name} type="button" className="palette-teaser-option" aria-label={`Preview ${item.name}`} aria-pressed={paletteIndex === index} onClick={() => setPaletteIndex(index)}>{[item.palette.background, item.palette.text, item.palette.accent, item.palette.accentSecondary].map((hex) => <span key={hex} style={{ background: hex }} />)}</button>)}
                </div>
                <button type="button" className="btn btn--primary btn--large" onClick={() => start("colour")}>Build from my image <span aria-hidden="true">→</span></button>
              </div>
            )}
            <p className="time-note">No account. No upload. No design-degree entrance exam.</p>
          </div>
        </div>

        <div ref={artRef} className="hero-v2__art" onPointerMove={moveLight} onPointerLeave={() => { artRef.current?.style.setProperty("--light-x", "62%"); artRef.current?.style.setProperty("--light-y", "42%"); }}>
          <picture className="optical-master" aria-hidden="true">
            <source srcSet="./assets/letters-light-optical-still-v1-960w.webp 960w, ./assets/letters-light-optical-still-v1-1600w.webp 1600w" type="image/webp" />
            <img src="./assets/letters-light-optical-still-v1.png" alt="" />
          </picture>
          <span className="hero-v2__light" aria-hidden="true" />
          <div className="hero-v2__slide">
            <SlidePreview kicker="A CLEARER DECK" title={title || "Put the answer on the slide."} body={DEMO_BODY} palette={activePalette.palette} fonts={TEASER_FONTS} label={`${activePalette.name} · live 16:9 preview`} />
          </div>
          <p className="hero-v2__note"><span>MOVE THE LIGHT</span><small>The flourish is doing the product’s job. Revolutionary, apparently.</small></p>
        </div>
      </section>

      <section className="route-theatre" aria-labelledby="choose-start">
        <header className="route-theatre__head">
          <p className="eyebrow">CHOOSE THE PROBLEM, NOT THE PACKAGE</p>
          <h2 id="choose-start">Start where the deck hurts.</h2>
          <p>Typography and color belong to the same family. They do not need to arrive holding hands.</p>
        </header>

        <div className="route-scenes">
          <button type="button" className="route-scene route-scene--letters" onClick={() => start("type")}>
            <span className="route-scene__index">01 / LETTERS</span>
            <strong>Find the voice.</strong>
            <span>64 exact open-source families. Five genuinely different directions. Real letterforms, not understudies.</span>
            <i aria-hidden="true">Aa</i>
            <b>Begin with type →</b>
          </button>
          <button type="button" className="route-scene route-scene--light" onClick={() => start("colour")}>
            <span className="route-scene__index">02 / LIGHT</span>
            <strong>Build the world.</strong>
            <span>One image becomes four essential colors first. The full working system waits until you ask.</span>
            <i aria-hidden="true"><span /><span /><span /></i>
            <b>Begin with color →</b>
          </button>
        </div>

        <button type="button" className="full-look-v2" onClick={() => start("whole")}>
          <span><small>THE USEFUL KIND OF CHEMISTRY</small><strong>Build the full look.</strong><em>Choose a 90-second answer or consent to the four-minute ride.</em></span><b aria-hidden="true">→</b>
        </button>
      </section>

      <section className="library-invite">
        <p className="eyebrow">FOR THE TYPE-CURIOUS</p>
        <h2>Go rummage through the font shelf.</h2>
        <p>Sixty-four families, rendered in themselves, with the people and licenses attached. Fall for one. We will still make it survive the deck.</p>
        <button type="button" className="btn" onClick={() => navigate("/collection")}>Browse all 64 exact families</button>
      </section>

      <section className="manifesto-strip" aria-label="Letters and Light in one sentence">
        <p><span>Letters give the thought a voice.</span><span>Light decides how the room feels.</span></p>
        <small>Good decks need both. Not necessarily at the same time. We are not monsters.</small>
      </section>

      <section className="how-section" aria-labelledby="how-title">
        <div><p className="eyebrow">WHAT HAPPENS</p><h2 id="how-title">An answer. Then the machinery—only if you want it.</h2></div>
        <ol>
          <li><span>01</span><strong>Choose the sore spot.</strong><p>Words, image, or the full look.</p></li>
          <li><span>02</span><strong>Choose your depth.</strong><p>Ninety seconds or the properly nosy route.</p></li>
          <li><span>03</span><strong>See it doing the work.</strong><p>Real fonts. Real slides. Useful limits.</p></li>
        </ol>
      </section>
    </div>
  );
};

