/// <reference lib="webworker" />
/** Cancellable colour-analysis worker. Heavy pixel work leaves the main
 *  thread; job ids let the client reject stale replies; nothing persists. */

import { analyzePixels } from "./analyze";
import type { AnalysisInput, AnalysisOutput, AnalysisStage } from "./messages";

type RunMessage = { jobId: string; type: "run"; input: AnalysisInput };

const ctx = self as unknown as {
  onmessage: ((event: MessageEvent<RunMessage>) => void) | null;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
};

ctx.onmessage = async (event) => {
  const { jobId, type, input } = event.data;
  if (type !== "run") return;
  try {
    const output = await analyzePixels(input, (stage: AnalysisStage) => {
      ctx.postMessage({ jobId, type: "stage", stage });
    });
    ctx.postMessage({ jobId, type: "result", output } satisfies { jobId: string; type: string; output: AnalysisOutput });
  } catch (error) {
    ctx.postMessage({ jobId, type: "error", message: error instanceof Error ? error.message : "Analysis failed." });
  }
};
