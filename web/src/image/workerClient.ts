/** Colour-job client. Worker-backed in the browser with job ids, hard cancel
 *  (terminate + respawn), and stale-reply rejection; synchronous fallback for
 *  tests and Worker-less environments. The store talks only to ColourRunner. */

import { analyzePixels } from "./analyze";
import { AnalysisCancelled, type AnalysisInput, AnalysisOutput, AnalysisProgress, AnalysisStage } from "./messages";

export type ColourRunner = {
  run(input: AnalysisInput, progress?: AnalysisProgress): Promise<AnalysisOutput>;
  cancel(): void;
};

let nextJobId = 1;

class WorkerRunner implements ColourRunner {
  private worker: Worker | null = null;
  private currentJobId: string | null = null;
  private rejectCurrent: ((error: Error) => void) | null = null;

  private ensureWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL("./colourWorker.ts", import.meta.url), { type: "module" });
    }
    return this.worker;
  }

  run(input: AnalysisInput, progress?: AnalysisProgress): Promise<AnalysisOutput> {
    this.cancel();
    const worker = this.ensureWorker();
    const jobId = `job-${nextJobId++}`;
    this.currentJobId = jobId;
    return new Promise<AnalysisOutput>((resolve, reject) => {
      this.rejectCurrent = reject;
      const onMessage = (event: MessageEvent) => {
        const data = event.data as { jobId: string; type: string; stage?: AnalysisStage; output?: AnalysisOutput; message?: string };
        // Stale-reply rejection: anything not from the live job is ignored.
        if (data.jobId !== jobId || this.currentJobId !== jobId) return;
        if (data.type === "stage" && data.stage) {
          progress?.(data.stage);
          return;
        }
        cleanup();
        if (data.type === "result" && data.output) {
          this.clearCurrent(jobId);
          resolve(data.output);
        } else {
          this.clearCurrent(jobId);
          reject(new Error(data.message ?? "Analysis failed."));
        }
      };
      const onError = () => {
        cleanup();
        this.clearCurrent(jobId);
        reject(new Error("Analysis worker errored."));
      };
      const cleanup = () => {
        worker.removeEventListener("message", onMessage);
        worker.removeEventListener("error", onError);
      };
      worker.addEventListener("message", onMessage);
      worker.addEventListener("error", onError);
      worker.postMessage({ jobId, type: "run", input }, [input.rgba]);
    });
  }

  private clearCurrent(jobId: string) {
    if (this.currentJobId === jobId) {
      this.currentJobId = null;
      this.rejectCurrent = null;
    }
  }

  cancel(): void {
    if (this.currentJobId === null) return;
    this.currentJobId = null;
    const reject = this.rejectCurrent;
    this.rejectCurrent = null;
    // Hard cancel: the engine run is synchronous CPU inside the worker, so the
    // only honest cancellation is terminating it. Next run respawns lazily.
    this.worker?.terminate();
    this.worker = null;
    reject?.(new AnalysisCancelled());
  }
}

class SyncRunner implements ColourRunner {
  private cancelled = false;

  async run(input: AnalysisInput, progress?: AnalysisProgress): Promise<AnalysisOutput> {
    this.cancelled = false;
    const stage = async (stageName: AnalysisStage) => {
      if (this.cancelled) throw new AnalysisCancelled();
      progress?.(stageName);
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (this.cancelled) throw new AnalysisCancelled();
    };
    await stage("normalizing");
    await stage("hashing");
    await stage("clustering");
    const output = await analyzePixels(input);
    await stage("building");
    return output;
  }

  cancel(): void {
    this.cancelled = true;
  }
}

export const createColourRunner = (): ColourRunner => {
  if (typeof Worker !== "undefined") return new WorkerRunner();
  return new SyncRunner();
};

/** Explicit synchronous runner for tests and non-Worker contexts. */
export const createSyncRunner = (): ColourRunner => new SyncRunner();
