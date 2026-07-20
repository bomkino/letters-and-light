import { useMemo, useState } from "react";

import { searchTypeLibrary } from "@core/index.js";

import { useRouter } from "../app/router";
import { useStudio } from "../app/store";
import { typeLibrary } from "../wiring/typeLibrary";

export function CollectionPage() {
  const { dispatch } = useStudio();
  const { navigate } = useRouter();
  const [query, setQuery] = useState("");
  const [shelfId, setShelfId] = useState<string>("all");
  const fonts = useMemo(() => searchTypeLibrary(typeLibrary, { query, ...(shelfId === "all" ? {} : { shelfId }) }), [query, shelfId]);
  const startWith = (id: string) => {
    dispatch({ type: "enter", entry: "type", rememberedCollectionId: id });
    navigate("/studio");
  };

  return (
    <section className="collection-shell exact-library">
      <header className="page-head exact-library__head">
        <p className="eyebrow">The exact font shelf · 64 families</p>
        <h1 className="display-lg">Go looking. Every letterform is telling the truth.</h1>
        <p className="page-lede">A deliberately varied, self-hosted OFL library—not eight generic pairings wearing a trench coat. Search by family, maker, mood, or shelf. Start with one if it catches your eye.</p>
        <p className="truth-note">Exact in this browser. Deck applications still get their own install, editable-handoff, and export checks.</p>
      </header>

      <div className="library-controls">
        <label className="library-search"><span>Search the shelf</span><input className="text-input" type="search" value={query} placeholder="Try editorial, warm, mono, Fraunces…" onChange={(event) => setQuery(event.target.value)} /></label>
        <div className="shelf-tabs" role="tablist" aria-label="Font shelves">
          <button type="button" role="tab" aria-selected={shelfId === "all"} onClick={() => setShelfId("all")}>All 64</button>
          {typeLibrary.shelves.map((shelf) => <button type="button" role="tab" key={shelf.id} aria-selected={shelfId === shelf.id} onClick={() => setShelfId(shelf.id)}>{shelf.label}</button>)}
        </div>
      </div>

      <p className="library-count" aria-live="polite">{fonts.length} {fonts.length === 1 ? "family" : "families"} on the table.</p>

      <div className="exact-font-grid">
        {fonts.map((font, index) => (
          <article className="exact-font-card" key={font.id} style={{ fontFamily: `"${font.family}", sans-serif` }}>
            <span className="exact-font-card__number">{String(index + 1).padStart(2, "0")}</span>
            <p className="exact-font-card__sample">Aa<br /><i>Rr</i></p>
            <h2>{font.family}</h2>
            <p className="exact-font-card__voice">{font.tones.slice(0, 3).join(" · ")}</p>
            <p className="exact-font-card__maker">Drawn by {font.designer}</p>
            <div className="exact-font-card__actions">
              <button type="button" className="btn btn--primary" onClick={() => startWith(font.id)}>Build around this</button>
              <a href={font.source.upstreamRepository ?? font.source.metadataUrl} target="_blank" rel="noreferrer">Source ↗</a>
            </div>
          </article>
        ))}
      </div>
      {fonts.length === 0 ? <div className="library-empty"><strong>Nothing by that name.</strong><p>Try a mood, a maker, or a less heroic spelling.</p></div> : null}
    </section>
  );
}

