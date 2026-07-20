/** Studio store: one reducer, immutable engine outputs, explicit corrections.
 *  Back/revise loses nothing. Nothing user-authored enters the URL. Optional
 *  local persistence happens only after explicit consent. */

import { createContext, useContext, useMemo, useReducer, type ReactNode } from "react";

import type {
  ColourRecommendation,
  DirectionCard,
  EntryRoute,
  PaletteRoleId,
  PaletteSystem,
  PreviewCopy,
  Rgb,
  SharedBrief,
  TypeStudioAction as ExactTypeStudioAction,
  TypeStudioSession,
  TypeRecommendation,
} from "@core/index.js";
import { pendingQuestionIds } from "@core/index.js";

import type { AnalysisOutput, ColourRun } from "./storeTypes";
import { composeDirection, nudgeRole, replaceRole, swapRoles, typeColourRunFromOutput, unrunTypeRecommendation } from "../wiring/engines";
import { questionQueue } from "../wiring/questions";
import { applyExactTypeAction, legacyTypeForSession, typeCatalogForSession } from "../wiring/typeLibrary";

export type StudioStep = "path" | "source" | "brief" | "words" | "processing" | "direction" | "lab" | "bench" | "export";

export type SourceSession = {
  sourceFileHash: string;
  format: string;
  width: number;
  height: number;
  workingWidth: number;
  workingHeight: number;
  /** Normalized RGBA8 working pixels, memory-only. Never persisted. */
  rgba: ArrayBuffer;
  hasAlpha: boolean;
  alphaGround: Rgb | null;
  crop: { x: number; y: number; width: number; height: number };
  protectedHexes: string[];
  analysis: AnalysisOutput | null;
  status: "ready" | "analyzing" | "analyzed" | "error";
  error: string | null;
};

export type CorrectionOp =
  | { kind: "swap"; a: PaletteRoleId; b: PaletteRoleId }
  | { kind: "replace"; role: PaletteRoleId; hex: string }
  | { kind: "nudge"; role: PaletteRoleId; nudge: "lighten" | "darken" | "moreColour" | "lessColour" | "vary" }
  | { kind: "lock"; role: PaletteRoleId }
  | { kind: "unlock"; role: PaletteRoleId };

export type CorrectionState = {
  baseSystemId: string;
  ops: CorrectionOp[];
  future: CorrectionOp[];
  locked: PaletteRoleId[];
  variationIndex: number;
};

export type StudioState = {
  entry: EntryRoute | null;
  colourPath: "quick" | "guided" | null;
  step: StudioStep;
  brief: SharedBrief;
  rememberedCollectionId: string | null;
  source: SourceSession | null;
  typeStudio: TypeStudioSession | null;
  typeResult: TypeRecommendation | null;
  colourRun: ColourRun | null;
  selectedTypeId: string | null;
  selectedPaletteId: string | null;
  starredPaletteIds: string[];
  paletteSeed: number;
  correction: CorrectionState | null;
  projectId: string;
  projectName: string;
  consentRemember: boolean;
};

const initialState = (): StudioState => ({
  entry: null,
  colourPath: null,
  step: "source",
  brief: { route: "whole" },
  rememberedCollectionId: null,
  source: null,
  typeStudio: null,
  typeResult: null,
  colourRun: null,
  selectedTypeId: null,
  selectedPaletteId: null,
  starredPaletteIds: [],
  paletteSeed: 0,
  correction: null,
  projectId: `ll-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  projectName: "",
  consentRemember: false,
});

const startingBrief = (entry: EntryRoute, colourPath?: "quick" | "guided" | null): SharedBrief => ({
  route: entry,
  ...(entry === "colour" ? {} : { writingSystems: ["latin"] }),
  ...(colourPath ? { colourPath } : {}),
});

export type StudioAction =
  | { type: "enter"; entry: EntryRoute; colourPath?: "quick" | "guided"; rememberedCollectionId?: string | null }
  | { type: "setStep"; step: StudioStep }
  | { type: "setBrief"; brief: SharedBrief }
  | { type: "setPreviewCopy"; previewCopy: PreviewCopy }
  | { type: "setProjectName"; name: string }
  | { type: "sourceLoaded"; source: Omit<SourceSession, "analysis" | "status" | "error"> }
  | { type: "sourceStatus"; status: SourceSession["status"]; error?: string | null }
  | { type: "sourceCleared" }
  | { type: "setCrop"; crop: SourceSession["crop"] }
  | { type: "setAlphaGround"; alphaGround: Rgb | null }
  | { type: "toggleProtected"; hex: string }
  | { type: "analysisReady"; analysis: AnalysisOutput }
  | { type: "typeStudioReady"; session: TypeStudioSession }
  | { type: "typeStudioAction"; action: ExactTypeStudioAction }
  | { type: "typeReady"; result: TypeRecommendation }
  | { type: "colourReady"; run: ColourRun }
  | { type: "selectType"; systemId: string }
  | { type: "selectPalette"; systemId: string }
  | { type: "shufflePalettes" }
  | { type: "togglePaletteStar"; systemId: string }
  | { type: "applyOp"; op: CorrectionOp }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "resetColour" }
  | { type: "resetType" }
  | { type: "resetAll" }
  | { type: "setConsent"; consent: boolean }
  | { type: "extendRoute"; colourPath?: "quick" | "guided" }
  | { type: "projectLoaded"; brief: SharedBrief; typeResult: TypeRecommendation | null; colourRun: ColourRun | null; selectedTypeId: string | null; selectedPaletteId: string | null; projectId: string; projectName: string; entry: EntryRoute };

const applyOps = (base: PaletteSystem, ops: CorrectionOp[], variationStart: number): { roles: PaletteSystem["roles"]; variationIndex: number } => {
  let roles = base.roles;
  let variationIndex = variationStart;
  for (const op of ops) {
    if (op.kind === "swap") roles = swapRoles(roles, op.a, op.b);
    else if (op.kind === "replace") roles = replaceRole(roles, op.role, op.hex, "You replaced this role by hand.");
    else if (op.kind === "nudge") {
      if (op.nudge === "vary") variationIndex += 1;
      roles = nudgeRole(roles, op.role, op.nudge, variationIndex);
    }
  }
  return { roles, variationIndex };
};

const reducer = (state: StudioState, action: StudioAction): StudioState => {
  switch (action.type) {
    case "enter": {
      const fresh = initialState();
      return {
        ...fresh,
        entry: action.entry,
        colourPath: action.colourPath ?? null,
        rememberedCollectionId: action.rememberedCollectionId ?? null,
        projectId: state.projectId === fresh.projectId ? fresh.projectId : state.projectId,
        brief: startingBrief(action.entry, action.colourPath),
        step: action.entry === "type" || action.entry === "whole" ? "path" : "source",
      };
    }
    case "setStep":
      return { ...state, step: action.step };
    case "setBrief":
      return { ...state, brief: action.brief };
    case "setPreviewCopy":
      return { ...state, brief: { ...state.brief, previewCopy: action.previewCopy } };
    case "setProjectName":
      return { ...state, projectName: action.name };
    case "sourceLoaded":
      return { ...state, source: { ...action.source, analysis: null, status: "ready", error: null } };
    case "sourceStatus":
      return state.source ? { ...state, source: { ...state.source, status: action.status, error: action.error ?? null } } : state;
    case "sourceCleared":
      return { ...state, source: null, colourRun: null, correction: null, selectedPaletteId: null, starredPaletteIds: [], paletteSeed: 0 };
    case "setCrop":
      return state.source ? { ...state, source: { ...state.source, crop: action.crop } } : state;
    case "setAlphaGround":
      return state.source ? { ...state, source: { ...state.source, alphaGround: action.alphaGround } } : state;
    case "toggleProtected": {
      if (!state.source) return state;
      const has = state.source.protectedHexes.includes(action.hex);
      const next = has
        ? state.source.protectedHexes.filter((hex) => hex !== action.hex)
        : [...state.source.protectedHexes, action.hex].slice(0, 20);
      return { ...state, source: { ...state.source, protectedHexes: next } };
    }
    case "analysisReady": {
      if (!state.source) return state;
      return { ...state, source: { ...state.source, analysis: action.analysis, status: "analyzed", error: null } };
    }
    case "typeStudioReady": {
      const typeResult = legacyTypeForSession(action.session);
      return {
        ...state,
        typeStudio: action.session,
        typeResult,
        selectedTypeId: action.session.current.selectedDirectionId,
      };
    }
    case "typeStudioAction": {
      if (!state.typeStudio) return state;
      const typeStudio = applyExactTypeAction(state.typeStudio, action.action);
      return {
        ...state,
        typeStudio,
        typeResult: legacyTypeForSession(typeStudio),
        selectedTypeId: typeStudio.current.selectedDirectionId,
      };
    }
    case "typeReady": {
      const first = action.result.recommendations[0]?.systemId ?? null;
      return { ...state, typeResult: action.result, selectedTypeId: first };
    }
    case "colourReady": {
      const recommended = action.run.recommendation.recommendedSystemId;
      return {
        ...state,
        colourRun: action.run,
        selectedPaletteId: recommended,
        starredPaletteIds: state.starredPaletteIds.filter((id) => [...action.run.systems, ...action.run.companionSystems].some((system) => system.id === id)),
        paletteSeed: 0,
        correction: { baseSystemId: recommended, ops: [], future: [], locked: state.correction?.locked ?? [], variationIndex: 0 },
      };
    }
    case "selectType": {
      if (state.typeStudio) {
        const typeStudio = applyExactTypeAction(state.typeStudio, { type: "selectDirection", directionId: action.systemId });
        return { ...state, typeStudio, typeResult: legacyTypeForSession(typeStudio), selectedTypeId: typeStudio.current.selectedDirectionId };
      }
      return { ...state, selectedTypeId: action.systemId };
    }
    case "selectPalette": {
      // Choosing a different engine system restarts corrections from that
      // system's own roles. Locks survive; applied edits belong to the old base.
      return {
        ...state,
        selectedPaletteId: action.systemId,
        correction: { baseSystemId: action.systemId, ops: [], future: [], locked: state.correction?.locked ?? [], variationIndex: 0 },
      };
    }
    case "shufflePalettes": {
      if (!state.colourRun) return state;
      const all = [...state.colourRun.systems, ...state.colourRun.companionSystems];
      if (all.length < 2) return state;
      const current = Math.max(0, all.findIndex((system) => system.id === state.selectedPaletteId));
      const nextSeed = state.paletteSeed + 1;
      const next = all[(current + 1 + (nextSeed % Math.max(1, all.length - 1))) % all.length] ?? all[0];
      if (!next) return state;
      return {
        ...state,
        paletteSeed: nextSeed,
        selectedPaletteId: next.id,
        correction: { baseSystemId: next.id, ops: [], future: [], locked: state.correction?.locked ?? [], variationIndex: 0 },
      };
    }
    case "togglePaletteStar":
      return {
        ...state,
        starredPaletteIds: state.starredPaletteIds.includes(action.systemId)
          ? state.starredPaletteIds.filter((id) => id !== action.systemId)
          : [...state.starredPaletteIds, action.systemId],
      };
    case "applyOp": {
      if (!state.correction) return state;
      const op = action.op;
      const locked = state.correction.locked;
      if (opLocksTarget(locked, op)) return state;
      return {
        ...state,
        correction: {
          ...state.correction,
          ops: [...state.correction.ops, op],
          future: [],
          locked:
            op.kind === "lock"
              ? [...new Set([...locked, op.role])]
              : op.kind === "unlock"
                ? locked.filter((role) => role !== op.role)
                : locked,
        },
      };
    }
    case "undo": {
      if (!state.correction || state.correction.ops.length === 0) return state;
      const ops = [...state.correction.ops];
      const undone = ops.pop();
      if (!undone) return state;
      let locked = state.correction.locked;
      if (undone.kind === "lock") locked = locked.filter((role) => role !== undone.role);
      if (undone.kind === "unlock" && !locked.includes(undone.role)) locked = [...locked, undone.role];
      return { ...state, correction: { ...state.correction, ops, future: [undone, ...state.correction.future], locked } };
    }
    case "redo": {
      if (!state.correction || state.correction.future.length === 0) return state;
      const [next, ...future] = state.correction.future;
      if (!next) return state;
      let locked = state.correction.locked;
      if (next.kind === "lock") locked = [...new Set([...locked, next.role])];
      if (next.kind === "unlock") locked = locked.filter((role) => role !== next.role);
      return { ...state, correction: { ...state.correction, ops: [...state.correction.ops, next], future, locked } };
    }
    case "resetColour":
      return state.selectedPaletteId
        ? { ...state, correction: { baseSystemId: state.selectedPaletteId, ops: [], future: [], locked: [], variationIndex: 0 } }
        : state;
    case "resetType":
      return {
        ...state,
        typeStudio: null,
        typeResult: null,
        selectedTypeId: null,
        brief: {
          ...state.brief,
          artifactType: undefined,
          existingFontConstraint: undefined,
          mandatoryFontName: undefined,
          authoringTool: undefined,
          handoffPaths: undefined,
          viewingContexts: undefined,
          density: undefined,
          contentNeeds: undefined,
          writingSystems: ["latin"],
          character: undefined,
        },
        step: "path",
      };
    case "resetAll":
      return state.entry
        ? { ...initialState(), entry: state.entry, colourPath: state.colourPath, brief: startingBrief(state.entry, state.brief.colourPath), step: state.entry === "type" || state.entry === "whole" ? "path" : "source" }
        : initialState();
    case "setConsent":
      return { ...state, consentRemember: action.consent };
    case "extendRoute": {
      // Continue into the missing half without invalidating completed work:
      // answers, results, and corrections all survive the route change.
      const entry: EntryRoute = "whole";
      return {
        ...state,
        entry,
        brief: {
          ...state.brief,
          route: "whole",
          writingSystems: state.brief.writingSystems?.length ? state.brief.writingSystems : ["latin"],
          colourPath: action.colourPath ?? state.brief.colourPath ?? "guided",
        },
        colourPath: action.colourPath ?? state.colourPath ?? "guided",
        step: state.colourRun && !state.typeStudio ? "path" : "source",
      };
    }
    case "projectLoaded":
      return {
        ...state,
        entry: action.entry,
        brief: action.brief,
        typeStudio: null,
        typeResult: action.typeResult,
        colourRun: action.colourRun,
        selectedTypeId: action.selectedTypeId,
        selectedPaletteId: action.selectedPaletteId,
        starredPaletteIds: [],
        paletteSeed: 0,
        correction: action.selectedPaletteId
          ? { baseSystemId: action.selectedPaletteId, ops: [], future: [], locked: [], variationIndex: 0 }
          : null,
        projectId: action.projectId,
        projectName: action.projectName,
        step: "direction",
      };
    default:
      return state;
  }
};

const opLocksTarget = (locked: PaletteRoleId[], op: CorrectionOp): boolean => {
  if (op.kind === "lock" || op.kind === "unlock") return false;
  if (op.kind === "swap") return locked.includes(op.a) || locked.includes(op.b);
  return locked.includes(op.role);
};

type StudioContextValue = {
  state: StudioState;
  dispatch: React.Dispatch<StudioAction>;
};

const StudioContext = createContext<StudioContextValue | null>(null);

export const StudioProvider = ({ children }: { children: ReactNode }) => {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
};

export const useStudio = (): StudioContextValue => {
  const context = useContext(StudioContext);
  if (!context) throw new Error("useStudio must be used inside StudioProvider");
  return context;
};

/* ---- Selectors ----------------------------------------------------------- */

export const selectWorkingPalette = (state: StudioState): PaletteSystem | null => {
  if (!state.colourRun || !state.selectedPaletteId) return null;
  const all = [...state.colourRun.systems, ...state.colourRun.companionSystems];
  const base = all.find((system) => system.id === state.selectedPaletteId) ?? null;
  if (!base) return null;
  if (!state.correction || state.correction.ops.length === 0) return base;
  const { roles } = applyOps(base, state.correction.ops, state.correction.variationIndex);
  return {
    ...base,
    id: `${base.id}--corrected`,
    name: `${base.name} — corrected by you`,
    recommended: true,
    roles,
    rationale: [...base.rationale, "One or more roles were corrected by you on the bench; engine originals remain intact below."],
  };
};

export const selectDirection = (state: StudioState): DirectionCard | null => {
  // A direction needs at least one half. Colour-only routes compose with the
  // honest "type never ran" record so the card, lab, bench, and export all
  // keep working without fabricating type advice.
  if (!state.typeResult && !state.colourRun) return null;
  const type = state.typeResult ?? unrunTypeRecommendation();
  const working = selectWorkingPalette(state);
  const isCorrected = working !== null && state.correction !== null && state.correction.ops.length > 0;
  return composeDirection({
    projectId: state.projectId,
    ...(state.projectName ? { name: state.projectName } : {}),
    type,
    colour: state.colourRun,
    ...(state.brief.previewCopy ? { previewCopy: state.brief.previewCopy } : {}),
    selectedTypeSystemId: state.selectedTypeId,
    ...(state.typeStudio ? { typeCatalogOverride: typeCatalogForSession(state.typeStudio) } : {}),
    ...(isCorrected && working ? { workingPalette: working } : {}),
  });
};

export const selectQueue = (state: StudioState) => questionQueue(state.brief);

export const selectPendingCount = (state: StudioState) => pendingQuestionIds(state.brief).length;

export const colourRecommendation = (run: ColourRun | null): ColourRecommendation | null => run?.recommendation ?? null;

export { typeColourRunFromOutput as colourRunFromAnalysis };

/** Test seams: functions stay Fast Refresh-compatible during frontend work. */
export const reduceForTests = reducer;
export const getInitialStateForTests = (): StudioState => initialState();
