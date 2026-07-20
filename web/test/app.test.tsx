/** App-level law: the home is plain-language, nothing ever leaves the browser,
 * persistence is consent-gated, and overflow truth remains visible. */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { copy, parseProjectFile, type PixelSource, type SharedBrief } from "@core/index.js";

import { AnnouncerProvider } from "../src/app/announcer";
import { RouterProvider } from "../src/app/router";
import { selectDirection, StudioProvider, useStudio, type StudioAction } from "../src/app/store";
import { App } from "../src/app/App";
import { DirectionCardView } from "../src/pages/DirectionCard";
import { CorrectionBench } from "../src/pages/CorrectionBench";
import { ExportWrap } from "../src/pages/ExportWrap";
import { PreviewLab } from "../src/pages/PreviewLab";
import { WordsStep } from "../src/pages/WordsStep";
import { runColour, runType } from "../src/wiring/engines";
import { REMEMBERED_PROJECT_KEY } from "../src/wiring/exports";
import type { RigMeasurer } from "../src/measure/fit";
import { useEffect, useRef, type Dispatch, type ReactNode } from "react";

const syntheticSource = (): PixelSource => {
  const width = 24;
  const height = 24;
  const rgba = new Uint8ClampedArray(width * height * 4);
  const blocks = [
    [188, 78, 62],
    [43, 74, 216],
    [214, 61, 132],
    [247, 245, 239],
  ];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const block = blocks[(y % 2) * 2 + (x % 2)] ?? blocks[0]!;
      const index = (y * width + x) * 4;
      rgba[index] = block[0]!;
      rgba[index + 1] = block[1]!;
      rgba[index + 2] = block[2]!;
      rgba[index + 3] = 255;
    }
  }
  return { width, height, rgba, workingPixelHash: "d".repeat(64) };
};

const typeBrief: SharedBrief = {
  route: "whole",
  artifactType: "startupInvestor",
  existingFontConstraint: "none",
  authoringTool: "googleSlides",
  handoffPaths: ["editableFile"],
  viewingContexts: ["laptop"],
  density: "moderate",
  contentNeeds: ["wordsImages"],
  writingSystems: ["latin"],
  character: "quiet",
  baseMode: "decide",
  sourceRelationship: "starting_point",
  dataNeed: "none",
};

/** Runs a dispatch script once on mount, then renders children. */
const Seed = ({ script, children }: { script: (dispatch: Dispatch<StudioAction>) => void; children: ReactNode }) => {
  const { dispatch } = useStudio();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    script(dispatch);
  }, [dispatch, script]);
  return <>{children}</>;
};

const renderSeeded = (ui: ReactNode, script: (dispatch: Dispatch<StudioAction>) => void) =>
  render(
    <AnnouncerProvider>
      <StudioProvider>
        <Seed script={script}>{ui}</Seed>
      </StudioProvider>
    </AnnouncerProvider>,
  );

const seedWholeDirection = (dispatch: Dispatch<StudioAction>) => {
  dispatch({ type: "enter", entry: "whole" });
  dispatch({ type: "setBrief", brief: typeBrief });
  dispatch({ type: "typeReady", result: runType(typeBrief)! });
  dispatch({ type: "colourReady", run: runColour(syntheticSource(), typeBrief) });
};

beforeEach(() => {
  window.localStorage.clear();
  window.location.hash = "/";
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("chrome law", () => {
  it("leads with the useful jobs and keeps technical candidate language out of the chrome", () => {
    render(<App />);
    expect(screen.queryByText(copy.result.candidateBanner)).toBeNull();
    expect(screen.getByRole("heading", { name: /Make it clear.*Then make it felt/i })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Build the full look/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Find my type direction/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Build the world/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Theme follows your device/i })).toBeTruthy();
  });

  it("never touches the network and never writes storage without consent", async () => {
    const fetchSpy = vi.spyOn(window, "fetch");
    const beaconSpy = vi.spyOn(navigator, "sendBeacon");
    const xhrSpy = vi.spyOn(XMLHttpRequest.prototype, "open");
    const socketSpy = vi.spyOn(window, "WebSocket");
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");

    render(
      <AnnouncerProvider>
        <StudioProvider>
          <RouterProvider>
            <App />
          </RouterProvider>
        </StudioProvider>
      </AnnouncerProvider>,
    );

    fireEvent.click(screen.getAllByRole("button", { name: /Find my type direction/i })[0]!);
    await waitFor(() => expect(window.location.hash).toBe("#/studio"));

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(beaconSpy).not.toHaveBeenCalled();
    expect(xhrSpy).not.toHaveBeenCalled();
    expect(socketSpy).not.toHaveBeenCalled();
    expect(setItemSpy).not.toHaveBeenCalled();
    expect(window.localStorage.length).toBe(0);
  });

  it("shows truthful end-to-end progress instead of a decorative percentage", async () => {
    render(<App />);
    fireEvent.click(screen.getAllByRole("button", { name: /Find my type direction/i })[0]!);

    expect(await screen.findByText("Step 1 of 5")).toBeTruthy();
    expect(screen.getByText("4 steps left")).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: "Step 1 of 5" })).toHaveAttribute("aria-valuenow", "1");
    fireEvent.click(screen.getByRole("button", { name: /Give me the useful answer/i }));
    expect(await screen.findByText("Step 2 of 5")).toBeTruthy();
    expect(screen.getByText("3 steps left")).toBeTruthy();
    expect(document.body.textContent).not.toContain("33%");
  });
});

describe("consent-gated persistence", () => {
  it("remembers only on explicit consent and forgets on demand", async () => {
    renderSeeded(<ExportWrap />, (dispatch) => {
      seedWholeDirection(dispatch);
      dispatch({ type: "setStep", step: "export" });
    });

    const remember = await screen.findByRole("button", { name: "Remember on this device" });
    fireEvent.click(remember);
    await waitFor(() => expect(window.localStorage.getItem(REMEMBERED_PROJECT_KEY)).not.toBeNull());
    const saved = window.localStorage.getItem(REMEMBERED_PROJECT_KEY)!;
    // The privacy law is structural, not textual: the saved file must pass
    // the same hostile-import parser, with the privacy contract intact and
    // no pixel/filename payload keys anywhere in the tree.
    const parsed = parseProjectFile(saved);
    expect(parsed.privacy.containsImagePixels).toBe(false);
    expect(parsed.privacy.containsOriginalFilename).toBe(false);
    expect(parsed.privacy.localOnly).toBe(true);
    const forbidden = new Set(["rgba", "imageBytes", "imagePixels", "originalFilename", "dataUrl", "objectUrl", "__proto__"]);
    const walk = (value: unknown): void => {
      if (value === null || typeof value !== "object") return;
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        expect(forbidden.has(key)).toBe(false);
        walk(child);
      }
    };
    walk(parsed);

    fireEvent.click(screen.getByRole("button", { name: copy.project.clear }));
    await waitFor(() => expect(window.localStorage.getItem(REMEMBERED_PROJECT_KEY)).toBeNull());
  });
});

describe("boundary states", () => {
  it("mandatory-but-unknown font shows the audit boundary, not a fake answer", async () => {
    const boundaryBrief: SharedBrief = {
      ...typeBrief,
      existingFontConstraint: "mandatory",
      mandatoryFontName: "Definitely Not A Real Family",
    };
    renderSeeded(
      <DirectionCardHarness />,
      (dispatch) => {
        dispatch({ type: "enter", entry: "type" });
        dispatch({ type: "setBrief", brief: boundaryBrief });
        dispatch({ type: "typeReady", result: runType(boundaryBrief)! });
      },
    );
    expect(await screen.findByRole("heading", { name: "A real constraint beat a prettier lie." })).toBeTruthy();
    expect(screen.getByText("The useful next move")).toBeTruthy();
  });
});

describe("saved Type fidelity", () => {
  it("reopens an exact direction in its real local fonts without inventing studio history", async () => {
    const brief: SharedBrief = { ...typeBrief, route: "type" };
    const result = runType(brief)!;
    const selected = result.recommendations[0]!;
    renderSeeded(<DirectionCardHarness />, (dispatch) => {
      dispatch({
        type: "projectLoaded",
        brief,
        typeResult: result,
        colourRun: null,
        selectedTypeId: selected.systemId,
        selectedPaletteId: null,
        projectId: "saved-exact-type",
        projectName: "Saved exact type",
        entry: "type",
      });
    });

    expect(await screen.findByText("The exact local faces are back. Your chosen direction survives; shuffle history, stars and locks were never hidden inside the project file.")).toBeTruthy();
    expect(screen.getByText("Exact in this browser again. Re-run Type only when you want a new set of five—not because reopening broke the letterforms.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Shuffle five directions" })).toBeNull();
  });
});

describe("copy safety", () => {
  it("puts hard limits on the slide fields before the layout can break", async () => {
    renderSeeded(<WordsStep onDone={() => undefined} />, (dispatch) => dispatch({ type: "enter", entry: "type" }));
    const headline = await screen.findByRole("textbox", { name: /A slide headline/ });
    const body = screen.getByRole("textbox", { name: /The supporting thought/ });
    expect(headline.getAttribute("maxlength")).toBe("72");
    expect(body.getAttribute("maxlength")).toBe("280");
    expect(screen.getByText("Your copy on a real 16:9 slide")).toBeTruthy();

    const longestAllowedHeadline = "A".repeat(72);
    fireEvent.change(headline, { target: { value: longestAllowedHeadline } });
    const preview = screen.getByLabelText("Your copy on a real 16:9 slide");
    expect(preview).toHaveTextContent(longestAllowedHeadline);
    expect(preview.querySelector(".slide-canvas")).toHaveAttribute("data-title-size", "long");
  });
});

describe("progressive disclosure", () => {
  it("leads palette correction with a live slide and safe moves, keeping exact controls one level deeper", async () => {
    renderSeeded(<CorrectionBench />, seedWholeDirection);

    expect(await screen.findByText("Push. Look. Keep—or undo.")).toBeTruthy();
    expect(screen.getByLabelText("Live 16:9 palette preview")).toBeTruthy();
    const exactControl = screen.getAllByRole("textbox", { name: /exact hex color/i, hidden: true })[0]!;
    const disclosure = exactControl.closest("details")!;
    expect(disclosure.open).toBe(false);

    fireEvent.click(screen.getByText("Fine-tune individual colors"));
    expect(disclosure.open).toBe(true);
    expect(screen.getAllByRole("textbox", { name: /exact hex color/i }).length).toBeGreaterThan(0);
  });
});

const DirectionCardHarness = () => {
  const { state, dispatch } = useStudio();
  const direction = selectDirection(state);
  if (!direction) return null;
  return (
    <DirectionCardView
      direction={direction}
      onOpenLab={() => dispatch({ type: "setStep", step: "lab" })}
      onOpenBench={() => dispatch({ type: "setStep", step: "bench" })}
      onOpenExport={() => dispatch({ type: "setStep", step: "export" })}
      onAddColour={() => dispatch({ type: "extendRoute", colourPath: "guided" })}
      onAddType={() => dispatch({ type: "extendRoute" })}
    />
  );
};

describe("preview lab truth", () => {
  it("overflow shows the honest verdict and actions, never a quiet ellipsis", async () => {
    const overflowMeasurer: RigMeasurer = (_words, template) => ({
      templateId: template.id,
      status: "does_not_fit",
      fields: [
        {
          field: "body",
          status: "does_not_fit",
          occupancy: 1.42,
          advisory: "320 characters is past the 220-character hard guidance for this field.",
        },
      ],
    });
    renderSeeded(<PreviewLab measurer={overflowMeasurer} />, seedWholeDirection);

    expect(await screen.findAllByText(copy.specimens.overflow)).not.toHaveLength(0);
    for (const action of copy.specimens.overflowActions) {
      expect(screen.getAllByText(action).length).toBeGreaterThan(0);
    }
    expect(screen.getAllByText(/Does not fit/i).length).toBeGreaterThan(0);
    expect(document.body.innerHTML).not.toContain("text-overflow");
  });
});
