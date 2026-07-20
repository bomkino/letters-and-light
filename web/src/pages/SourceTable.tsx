/** Local image intake. The whole image is the default; crop, transparency,
 * protected colors and file evidence remain available under one disclosure. */

import { useCallback, useEffect, useRef, useState } from "react";

import { copy, type Rgb } from "@core/index.js";

import { useAnnounce } from "../app/announcer";
import { useStudio } from "../app/store";
import { decodeImageFile, ImageIntakeError, normalizeWorkingPixels, releaseSource } from "../image/decode";

const hexFromRgb = (rgb: Rgb) => `#${[rgb.r, rgb.g, rgb.b].map((channel) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, "0")).join("")}`;
const rgbFromHex = (hex: string): Rgb => ({ r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) });
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export const SourceTable = ({ onContinue, onChooseColourPath, onBack }: { onContinue: () => void; onChooseColourPath: (path: "quick" | "guided") => void; onBack: () => void }) => {
  const { state, dispatch } = useStudio();
  const announce = useAnnounce();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragState = useRef<{ mode: "new" | "move" | "resize"; startX: number; startY: number; orig: { x: number; y: number; width: number; height: number } } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [protectArmed, setProtectArmed] = useState(false);
  const [exactHex, setExactHex] = useState("");
  const [intakeError, setIntakeError] = useState<string | null>(null);
  const source = state.source;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !source) return;
    canvas.width = source.workingWidth;
    canvas.height = source.workingHeight;
    canvas.getContext("2d")?.putImageData(new ImageData(new Uint8ClampedArray(source.rgba), source.workingWidth, source.workingHeight), 0, 0);
  }, [source]);

  const intake = useCallback(async (file: Blob) => {
    setIntakeError(null);
    let decoded = null;
    try {
      decoded = await decodeImageFile(file);
      const working = normalizeWorkingPixels(decoded.bitmap);
      dispatch({ type: "sourceLoaded", source: {
        sourceFileHash: decoded.sourceFileHash, format: decoded.format, width: decoded.width, height: decoded.height,
        workingWidth: working.width, workingHeight: working.height, rgba: working.rgba, hasAlpha: working.hasAlpha,
        alphaGround: null, crop: { x: 0, y: 0, width: 1, height: 1 }, protectedHexes: [],
      } });
      announce("Image ready. We will use the whole thing unless you choose otherwise.");
    } catch (error) {
      releaseSource(decoded);
      const message = error instanceof ImageIntakeError ? error.message : "This image did not open cleanly. Try a JPEG, PNG or WebP.";
      setIntakeError(message);
      announce(`The image did not open. ${message}`);
    }
  }, [announce, dispatch]);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const file = [...(event.clipboardData?.items ?? [])].find((item) => item.type.startsWith("image/"))?.getAsFile();
      if (file) { event.preventDefault(); void intake(file); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [intake]);

  const canvasPoint = (event: React.PointerEvent) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    return rect ? { x: clamp01((event.clientX - rect.left) / rect.width), y: clamp01((event.clientY - rect.top) / rect.height) } : { x: 0, y: 0 };
  };
  const pickColor = (point: { x: number; y: number }) => {
    if (!source) return;
    const pixels = new Uint8ClampedArray(source.rgba);
    const x = Math.min(source.workingWidth - 1, Math.floor(point.x * source.workingWidth));
    const y = Math.min(source.workingHeight - 1, Math.floor(point.y * source.workingHeight));
    const i = (y * source.workingWidth + x) * 4;
    const hex = hexFromRgb({ r: pixels[i] ?? 0, g: pixels[i + 1] ?? 0, b: pixels[i + 2] ?? 0 });
    dispatch({ type: "toggleProtected", hex });
    announce(`Protected ${hex}.`);
  };
  const onPointerDown = (event: React.PointerEvent) => {
    if (!source) return;
    const point = canvasPoint(event);
    if (protectArmed) { pickColor(point); return; }
    const crop = source.crop;
    const inside = point.x >= crop.x && point.x <= crop.x + crop.width && point.y >= crop.y && point.y <= crop.y + crop.height;
    const nearCorner = Math.abs(point.x - crop.x - crop.width) < 0.04 && Math.abs(point.y - crop.y - crop.height) < 0.04;
    dragState.current = { mode: nearCorner ? "resize" : inside ? "move" : "new", startX: point.x, startY: point.y, orig: { ...crop } };
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: React.PointerEvent) => {
    const drag = dragState.current;
    if (!drag || !source) return;
    const point = canvasPoint(event);
    const dx = point.x - drag.startX;
    const dy = point.y - drag.startY;
    let next = { ...drag.orig };
    if (drag.mode === "new") next = { x: Math.min(drag.startX, point.x), y: Math.min(drag.startY, point.y), width: Math.abs(dx), height: Math.abs(dy) };
    else if (drag.mode === "move") next = { ...next, x: Math.min(1 - next.width, Math.max(0, drag.orig.x + dx)), y: Math.min(1 - next.height, Math.max(0, drag.orig.y + dy)) };
    else next = { ...next, width: Math.min(1 - next.x, Math.max(0.02, drag.orig.width + dx)), height: Math.min(1 - next.y, Math.max(0.02, drag.orig.height + dy)) };
    dispatch({ type: "setCrop", crop: next });
  };
  const setCropField = (field: "x" | "y" | "width" | "height", pixels: number) => {
    if (!source) return;
    const next = { ...source.crop };
    const size = field === "x" || field === "width" ? source.workingWidth : source.workingHeight;
    next[field] = clamp01(pixels / size);
    next.width = Math.min(next.width, 1 - next.x);
    next.height = Math.min(next.height, 1 - next.y);
    if (next.width >= 0.02 && next.height >= 0.02) dispatch({ type: "setCrop", crop: next });
  };
  const addExactHex = () => {
    const hex = exactHex.trim().toLowerCase();
    if (!/^#[0-9a-f]{6}$/.test(hex)) return;
    dispatch({ type: "toggleProtected", hex });
    setExactHex("");
  };

  return (
    <div>
      <button type="button" className="text-link source-back" onClick={onBack}>← Back</button>
      <p className="eyebrow">Your image</p>
      <h2 className="step-title">{copy.source.headline}</h2>
      <p className="step-intro">{copy.source.body}</p>

      {!source ? (
        <>
          <div className="drop-zone" data-over={dragOver} onDragOver={(event) => { event.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={(event) => { event.preventDefault(); setDragOver(false); const file = event.dataTransfer.files?.[0]; if (file) void intake(file); }}>
            <strong>Drop an image here</strong>
            <span>or paste one from your clipboard</span>
            <button type="button" className="btn btn--primary" onClick={() => fileInputRef.current?.click()}>Choose an image</button>
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="visually-hidden" aria-label="Choose a local image file" onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) void intake(file); event.currentTarget.value = ""; }} />
          </div>
          <p className="source-reassurance">JPEG, PNG or WebP. The file stays on your device.</p>
          {intakeError ? <div className="notice notice--error" role="alert"><strong>That one did not open.</strong><p>{intakeError}</p></div> : null}
          {state.entry !== "colour" ? <div className="flow-actions"><button type="button" className="btn" onClick={onContinue}>Continue without an image</button></div> : null}
        </>
      ) : (
        <div className="source-ready">
          <div ref={wrapRef} className="source-canvas-wrap" onPointerDown={advancedOpen ? onPointerDown : undefined} onPointerMove={advancedOpen ? onPointerMove : undefined} onPointerUp={advancedOpen ? () => { dragState.current = null; } : undefined} role={advancedOpen ? "application" : "img"} aria-label={advancedOpen ? "Image crop and color protection area" : "Your full uploaded image"}>
            <canvas ref={canvasRef} />
            {advancedOpen ? <div className="crop-frame" aria-hidden="true" style={{ left: `${source.crop.x * 100}%`, top: `${source.crop.y * 100}%`, width: `${source.crop.width * 100}%`, height: `${source.crop.height * 100}%` }} /> : null}
          </div>
          <p className="source-reassurance">We use the whole image by default. Nothing uploads; the image stays in this tab.</p>
          {state.entry === "colour" ? (
            <div className="source-paths" aria-label="Choose how to make the palette">
              <button type="button" className="source-path source-path--primary" onClick={() => onChooseColourPath("quick")}>
                <strong>{copy.route.colour.quick}</strong>
                <span>Fastest. Trust the image and see the result.</span>
              </button>
              <button type="button" className="source-path" onClick={() => onChooseColourPath("guided")}>
                <strong>{copy.route.colour.guided}</strong>
                <span>Three quick choices about the room, mood and charts.</span>
              </button>
            </div>
          ) : (
            <div className="flow-actions source-primary-actions"><button type="button" className="btn btn--primary" onClick={onContinue}>Use this image</button></div>
          )}

          <details className="disclosure source-advanced" onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}>
            <summary>Crop, protect a color, or inspect the file</summary>
            <div className="disclosure-body source-grid">
              <div>
                <p className="source-metadata">{source.format.toUpperCase()} · {source.width} × {source.height} px · working copy {source.workingWidth} × {source.workingHeight} px · <code>{source.sourceFileHash.slice(0, 12)}…</code></p>
                <fieldset className="field crop-fields">
                  <legend>Crop by numbers</legend>
                  <div>{([ ["x", "Left", source.workingWidth], ["y", "Top", source.workingHeight], ["width", "Width", source.workingWidth], ["height", "Height", source.workingHeight] ] as const).map(([field, label, max]) => (
                    <label key={field}><span>{label}</span><input className="text-input" type="number" min={0} max={max} value={Math.round(source.crop[field] * (field === "x" || field === "width" ? source.workingWidth : source.workingHeight))} onChange={(event) => setCropField(field, Number(event.target.value))} /></label>
                  ))}</div>
                  <p className="hint">Or drag on the image above while this section is open.</p>
                </fieldset>
              </div>
              <div>
                {source.hasAlpha ? <fieldset className="field"><legend>Background for transparency</legend><div className="answer-grid">{([ ["#ffffff", "White"], ["#f7f5ef", "Paper"], ["#18181a", "Ink"] ] as const).map(([hex, label]) => <label className="answer-card" key={hex}><input type="radio" name="alpha-ground" checked={(source.alphaGround ? hexFromRgb(source.alphaGround) : "#ffffff") === hex} onChange={() => dispatch({ type: "setAlphaGround", alphaGround: hex === "#ffffff" ? null : rgbFromHex(hex) })} /><span>{label}</span></label>)}</div></fieldset> : null}
                <fieldset className="field protect-field"><legend>Colors that must survive</legend><p className="hint">Protect a logo color, skin tone, or exact brand value.</p><div className="protect-actions"><button type="button" className="btn" aria-pressed={protectArmed} onClick={() => setProtectArmed((value) => !value)}>{protectArmed ? "Tap the image now" : "Pick from image"}</button><input className="text-input" placeholder="#rrggbb" aria-label="Protect an exact color" value={exactHex} onChange={(event) => setExactHex(event.target.value)} /><button type="button" className="btn" disabled={!/^#[0-9a-fA-F]{6}$/.test(exactHex.trim())} onClick={addExactHex}>Add</button></div>
                  {source.protectedHexes.length ? <ul className="protected-list">{source.protectedHexes.map((hex) => <li key={hex}><span style={{ background: hex }} /><code>{hex}</code><button type="button" className="text-link" onClick={() => dispatch({ type: "toggleProtected", hex })}>Remove</button></li>)}</ul> : null}
                </fieldset>
                <button type="button" className="text-link source-remove" onClick={() => { dispatch({ type: "sourceCleared" }); announce("Image removed. Nothing was stored."); }}>Remove image</button>
              </div>
            </div>
          </details>
        </div>
      )}
    </div>
  );
};
