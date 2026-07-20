export type Rgb = { r: number; g: number; b: number };
export type Oklab = { l: number; a: number; b: number };
export type Oklch = { l: number; c: number; h: number | null };

export type PaletteStrategy = "faithful" | "quieter" | "higher_contrast";
export type PaletteMode = "light" | "dark";
export type PaletteRoleId =
  | "background"
  | "surface"
  | "text"
  | "muted_text"
  | "accent_primary"
  | "accent_secondary"
  | "on_accent"
  | "line_or_rule";

export type Warning = {
  code: string;
  severity: "note" | "caution" | "blocking";
  message: string;
};

export type SourceCluster = {
  id: string;
  hex: string;
  population: number;
  protected: boolean;
  usedByRoles: string[];
};

export type RoleToken = {
  id: string;
  role: PaletteRoleId;
  hex: string;
  rgb: Rgb;
  oklch: Oklch;
  provenance: {
    kind: "sampled" | "adjusted" | "derived" | "user_supplied";
    clusterId: string | null;
    sourceHex: string | null;
    adjustments: string[];
  };
  reason: string;
  suggestedUses: string[];
  contrastAgainst: Record<string, number>;
  warnings: Warning[];
};

export type PaletteRoles = {
  background: RoleToken;
  surface: RoleToken;
  text: RoleToken;
  muted_text: RoleToken;
  accent_primary: RoleToken;
  accent_secondary?: RoleToken;
  on_accent: RoleToken;
  line_or_rule?: RoleToken;
};

export type PaletteSystem = {
  schemaVersion: "1.0.0";
  id: string;
  name: string;
  strategy: PaletteStrategy;
  mode: PaletteMode;
  recommended: boolean;
  rationale: string[];
  character: {
    chroma: "restrained" | "moderate" | "vivid";
    contrast: "soft" | "clear" | "sharp";
    lightness: "shadow-led" | "balanced" | "light-led";
    temperature: "cool" | "balanced" | "warm" | "mixed";
    variety: "tight" | "related" | "varied";
    sourceDistance: "close" | "edited" | "constructed";
  };
  roles: PaletteRoles;
  sourceMap: SourceCluster[];
  warnings: Warning[];
  determinism: {
    workingPixelHash: string;
    crop: { x: number; y: number; width: number; height: number };
    engineVersion: string;
    variationIndex: number;
    capabilities: string[];
  };
};

export type ColourAnswers = {
  delivery?: "live_room" | "screen_share" | "sent_pdf" | "phone" | "print" | "mixed" | "unknown";
  contentLoad?: "spare" | "balanced" | "dense" | "custom" | "unknown";
  sourceRelationship?: "reference_is_identity" | "protect_one" | "starting_point" | "surprise_me_carefully" | "unknown";
  baseMode?: "light" | "dark" | "both" | "decide";
  dataNeed?: "none" | "categorical" | "sequential" | "diverging" | "unknown";
  dataCount?: number;
  divergingMidpoint?: string;
};

export type PixelSource = {
  width: number;
  height: number;
  rgba: ArrayLike<number>;
  workingPixelHash: string;
  crop?: { x: number; y: number; width: number; height: number };
  alphaGround?: Rgb;
  protectedHexes?: readonly string[];
};

export type ColourRecommendation = {
  schemaVersion: "1.0.0";
  status: "sensible_first_pass" | "best_fit_for_answers";
  recommendedSystemId: string;
  recommendedStrategy: PaletteStrategy;
  recommendedMode: PaletteMode;
  headline: string;
  because: Array<{
    kind: "user_answer" | "measured_fact" | "declared_default";
    label: string;
    value: string;
    ruleId: string | null;
  }>;
  preserved: Array<{ roleId: string | null; summary: string; provenanceKind: RoleToken["provenance"]["kind"] | "not_applicable" }>;
  changed: Array<{ roleId: string | null; summary: string; provenanceKind: RoleToken["provenance"]["kind"] | "not_applicable" }>;
  weaknesses: Array<{ code: string; summary: string; affectedUse: string; severity: "note" | "use_with_care" | "fix_before_use" }>;
  uncertainty: Array<{ inputId: string; assumption: string; howToResolve: string }>;
  alternatives: Array<{
    systemId: string;
    strategy: PaletteStrategy;
    label: "worth_comparing" | "useful_under_different_pressure";
    whenUseful: string;
    tradeOff: string;
  }>;
  nextAction: {
    id: "inspect_specimens" | "answer_context" | "test_own_copy" | "resolve_warning" | "choose_system" | "export";
    label: string;
    reason: string;
  };
};

export type TypeEngineMode = "production" | "candidate_demo";
export type TypeSystemStatus = "candidate" | "testing" | "verified" | "limited" | "rejected" | "stale";
export type TypeAnswerRole = "ourPick" | "quieter" | "moreCharacter" | "alternative";

export type TypeAnswers = {
  artifactType: string;
  otherDecision?: string;
  existingFontConstraint: "none" | "flexible" | "mandatory" | "unknown";
  mandatoryFontName?: string;
  authoringTool: string;
  handoffPaths: string[];
  viewingContexts: string[];
  density: "sparse" | "moderate" | "dense" | "varied";
  contentNeeds: string[];
  writingSystems: string[];
  character: "quiet" | "present" | "expressive" | "unknown";
};

export type TypeSystemRecord = {
  id: string;
  name: string;
  status: TypeSystemStatus;
  collectionOrder: number;
  roles: Record<"display" | "body" | "utility", { fontId: string }>;
  character: "quiet" | "present" | "expressive";
  candidateStrengths: string[];
  candidateArtifacts: string[];
  oneThingNotToDo: string;
  requiredValidation: string[];
  evidenceIds?: string[];
  supportedWritingSystems?: string[];
  supportedApplications?: string[];
  supportedHandoffPaths?: string[];
  supportedViewingContexts?: string[];
  exactTokens?: Record<string, unknown>;
  fallbackStack?: string[];
};

export type TypeGateResult = {
  gate: "G0" | "G1" | "G2" | "G3" | "G4" | "G5" | "G6" | "G7" | "G8";
  result: "pass" | "caveat" | "remove" | "boundary";
  reasonCode: string;
  reason: string;
  evidenceIds: string[];
};

export type TypeRecommendationItem = {
  systemId: string;
  name: string;
  answerRole: TypeAnswerRole;
  status: TypeSystemStatus;
  reason: string;
  caveats: string[];
  roles: TypeSystemRecord["roles"];
  oneThingNotToDo: string;
};

export type TypeRecommendation = {
  schemaVersion: "1.0.0";
  mode: TypeEngineMode;
  dataStatus: "public_ready" | "candidate_only" | "mixed";
  outcome: "recommendation" | "boundary" | "unsupported";
  headline: string;
  recommendations: TypeRecommendationItem[];
  trace: Record<string, TypeGateResult[]>;
  exclusions: Array<{ systemId: string; atGate: string; reason: string }>;
  blockers: string[];
  nextActions: string[];
};

export type PreviewCopy = {
  deckTitle?: string;
  subtitle?: string;
  slideTitle?: string;
  body?: string;
  quote?: string;
  attribution?: string;
  metric?: string;
  metricLabel?: string;
  tableSample?: string;
};

export type DirectionCard = {
  schemaVersion: "1.0.0";
  projectId: string;
  name: string;
  type: TypeRecommendation;
  colour: {
    systems: PaletteSystem[];
    companionSystems?: PaletteSystem[];
    recommendation: ColourRecommendation;
  } | null;
  selected: { typeSystemId: string | null; paletteSystemId: string | null };
  relationship: {
    headline: string;
    principle: string;
    rulesFired: string[];
    guidance: string[];
    warnings: string[];
  };
  previewCopy: PreviewCopy;
  truth: {
    typeStatus: "candidate_demo" | "verified_scope" | "unavailable";
    colourStatus: "engine_output" | "unavailable";
    claims: string[];
    limits: string[];
  };
};
