import type {
  TypeAnswerRole,
  TypeAnswers,
  TypeEngineMode,
  TypeGateResult,
  TypeRecommendation,
  TypeRecommendationItem,
  TypeSystemRecord,
} from "../domain.js";

export const TYPE_ENGINE_VERSION = "letters-light-type/0.2.0";

export type FontEvidenceSummary = {
  id: string;
  family: string;
  licenceVerified: boolean;
  productionFilesSelected: boolean;
  inspectedFileId: string | null;
  binaryCoverageNotHumanVerified: string[];
  defaultNumerals: string | null;
};

export type TypeCatalog = {
  version: string;
  systems: TypeSystemRecord[];
  fonts: Record<string, FontEvidenceSummary>;
};

type LegacyCandidateSystem = Omit<TypeSystemRecord, "status"> & { status: string };
type LegacyCandidateFont = {
  id: string;
  family: string;
  licence?: { verified?: boolean };
  sourceAudit?: { productionFilesSelected?: boolean };
  inspectedFile?: { fileId?: string };
  binaryCoverageNotHumanVerified?: string[];
  numerals?: { default?: string };
};

const VALID_STATUSES = new Set(["candidate", "testing", "verified", "limited", "rejected", "stale"]);

export const adaptLegacyTypeData = (
  systemsDocument: { version?: string; systems?: LegacyCandidateSystem[] },
  fontsDocument: { fonts?: LegacyCandidateFont[] },
): TypeCatalog => {
  const systems = (systemsDocument.systems ?? []).map((system) => {
    if (!VALID_STATUSES.has(system.status)) throw new Error(`Unknown type-system status: ${system.status}`);
    return { ...system, status: system.status as TypeSystemRecord["status"] };
  });
  if (new Set(systems.map((system) => system.id)).size !== systems.length) throw new Error("Duplicate type-system IDs are not allowed.");
  const legacyFonts = fontsDocument.fonts ?? [];
  if (new Set(legacyFonts.map((font) => font.id)).size !== legacyFonts.length) throw new Error("Duplicate font IDs are not allowed.");
  const fonts = Object.fromEntries(
    legacyFonts.map((font) => [
      font.id,
      {
        id: font.id,
        family: font.family,
        licenceVerified: font.licence?.verified === true,
        productionFilesSelected: font.sourceAudit?.productionFilesSelected === true,
        inspectedFileId: font.inspectedFile?.fileId ?? null,
        binaryCoverageNotHumanVerified: [...(font.binaryCoverageNotHumanVerified ?? [])],
        defaultNumerals: font.numerals?.default ?? null,
      },
    ]),
  );
  return { version: systemsDocument.version ?? "unknown", systems, fonts };
};

const unique = (items: readonly string[]): string[] => [...new Set(items)];

const validateAnswers = (answers: TypeAnswers): void => {
  const requiredStrings: Array<keyof TypeAnswers> = ["artifactType", "existingFontConstraint", "authoringTool", "density", "character"];
  for (const key of requiredStrings) {
    if (typeof answers[key] !== "string" || String(answers[key]).trim() === "") {
      throw new Error(`Type answer ${key} is required.`);
    }
  }
  if (answers.handoffPaths.length === 0) throw new Error("At least one handoff path is required.");
  if (answers.viewingContexts.length === 0) throw new Error("At least one viewing context is required.");
  if (answers.contentNeeds.length === 0) throw new Error("At least one content need is required.");
  if (answers.writingSystems.length === 0) throw new Error("At least one writing system is required.");
  for (const [label, values] of Object.entries({ handoffPaths: answers.handoffPaths, viewingContexts: answers.viewingContexts, contentNeeds: answers.contentNeeds, writingSystems: answers.writingSystems })) {
    if (values.length > 50 || values.some((value) => typeof value !== "string" || value.trim() === "")) throw new Error(`${label} must contain 1–50 non-empty string IDs.`);
  }
  if (!["none", "flexible", "mandatory", "unknown"].includes(answers.existingFontConstraint)) throw new Error("Unknown existingFontConstraint.");
  if (!["sparse", "moderate", "dense", "varied"].includes(answers.density)) throw new Error("Unknown density.");
  if (!["quiet", "present", "expressive", "unknown"].includes(answers.character)) throw new Error("Unknown character answer.");
  if (answers.existingFontConstraint === "mandatory" && !answers.mandatoryFontName?.trim()) {
    throw new Error("Mandatory font name is required when existingFontConstraint is mandatory.");
  }
};

const systemFontIds = (system: TypeSystemRecord): string[] => unique(Object.values(system.roles).map((role) => role.fontId));

const familyMatches = (system: TypeSystemRecord, catalog: TypeCatalog, requestedName: string): boolean => {
  const target = requestedName.trim().toLocaleLowerCase();
  return systemFontIds(system).some((fontId) => {
    const font = catalog.fonts[fontId];
    return font?.family.toLocaleLowerCase() === target || fontId.toLocaleLowerCase() === target;
  });
};

const gate = (
  id: TypeGateResult["gate"],
  result: TypeGateResult["result"],
  reasonCode: string,
  reason: string,
  evidenceIds: string[] = [],
): TypeGateResult => ({ gate: id, result, reasonCode, reason, evidenceIds });

const evaluateSystem = (
  system: TypeSystemRecord,
  answers: TypeAnswers,
  mode: TypeEngineMode,
  catalog: TypeCatalog,
): TypeGateResult[] => {
  const trace: TypeGateResult[] = [];
  const fontIds = systemFontIds(system);
  const fonts = fontIds.map((id) => catalog.fonts[id]).filter((font): font is FontEvidenceSummary => font !== undefined);
  const productionEligible = system.status === "verified" || system.status === "limited";

  if (mode === "production" && !productionEligible) {
    trace.push(gate("G0", "remove", "statusNotPublicEligible", `${system.name} is ${system.status}; production accepts only verified or scoped-limited systems.`));
    return trace;
  }
  if (mode === "candidate_demo" && (system.status === "rejected" || system.status === "stale")) {
    trace.push(gate("G0", "remove", "statusNotDemoEligible", `${system.name} is ${system.status}; even a demonstration may not revive it.`));
    return trace;
  }
  if (mode === "candidate_demo" && !productionEligible) {
    trace.push(gate("G0", "caveat", "candidateDemonstration", `${system.name} remains a ${system.status} direction. It may demonstrate logic, never a public recommendation.`));
  } else {
    trace.push(gate("G0", "pass", "publicEligibleStatus", `${system.name} has a context-eligible public status.`, system.evidenceIds ?? []));
  }

  if (answers.existingFontConstraint === "mandatory") {
    if (!familyMatches(system, catalog, answers.mandatoryFontName ?? "")) {
      trace.push(gate("G1", "remove", "mandatoryFontMismatch", "A mandatory family outranks pitch.dog's taste; this system does not use it."));
      return trace;
    }
    trace.push(gate("G1", "pass", "mandatoryFontMatched", "System uses the declared mandatory family."));
  } else {
    trace.push(gate("G1", "pass", "noMandatoryFont", "No mandatory family blocks this route."));
  }

  const requestedScripts = unique(answers.writingSystems);
  const supportedScripts = system.supportedWritingSystems ?? [];
  if (mode === "production") {
    const missing = requestedScripts.filter((script) => !supportedScripts.includes(script));
    if (missing.length > 0) {
      trace.push(gate("G2", "remove", "writingSystemUnverified", `Missing fluent-human and exact-file support for: ${missing.join(", ")}.`));
      return trace;
    }
    trace.push(gate("G2", "pass", "writingSystemsVerified", "Every requested writing system is verified for this exact system.", system.evidenceIds ?? []));
  } else if (requestedScripts.some((script) => script !== "latin")) {
    trace.push(gate("G2", "remove", "candidateNonLatinUnsupported", "Binary glyph presence is not language support. Candidate data has no fluent-human non-Latin approval."));
    return trace;
  } else {
    trace.push(gate("G2", "caveat", "candidateLatinUnverified", "Latin glyphs were observed in inspected files; language and application review remains unearned."));
  }

  if (fonts.length !== fontIds.length || fonts.some((font) => !font.licenceVerified)) {
    trace.push(gate("G3", "remove", "fontLicenceUnknown", "At least one exact family record lacks a verified licence audit."));
    return trace;
  }
  if (mode === "production" && fonts.some((font) => !font.productionFilesSelected)) {
    trace.push(gate("G3", "remove", "productionFileNotSelected", "Exact production preview and desktop files have not been selected."));
    return trace;
  }
  trace.push(
    gate(
      "G3",
      mode === "candidate_demo" && fonts.some((font) => !font.productionFilesSelected) ? "caveat" : "pass",
      mode === "candidate_demo" && fonts.some((font) => !font.productionFilesSelected) ? "candidateFileOnly" : "licenceAndFilesResolved",
      mode === "candidate_demo" && fonts.some((font) => !font.productionFilesSelected)
        ? "Inspected mirror files have licence records, but production web/desktop files remain unresolved."
        : "Exact files and licence scope are recorded.",
      fonts.flatMap((font) => (font.inspectedFileId ? [font.inspectedFileId] : [])),
    ),
  );

  if (mode === "production") {
    if (!(system.supportedApplications ?? []).includes(answers.authoringTool)) {
      trace.push(gate("G4", "remove", "applicationUnverified", `${answers.authoringTool} is not verified for this exact system.`));
      return trace;
    }
    trace.push(gate("G4", "pass", "applicationVerified", `${answers.authoringTool} path is supported within recorded scope.`, system.evidenceIds ?? []));
  } else {
    trace.push(gate("G4", "caveat", "applicationEvidenceMissing", `${answers.authoringTool} behaviour remains a named test, not a claim.`));
  }

  const riskyHandoff = answers.handoffPaths.some((path) => path === "editableSource" || path === "crossApplication" || path === "otherPresenter");
  if (mode === "production") {
    const missing = answers.handoffPaths.filter((path) => !(system.supportedHandoffPaths ?? []).includes(path));
    if (missing.length > 0) {
      trace.push(gate("G5", "remove", "handoffUnverified", `Unverified handoff path: ${missing.join(", ")}.`));
      return trace;
    }
    trace.push(gate("G5", "pass", "handoffVerified", "Requested handoff paths are supported.", system.evidenceIds ?? []));
  } else {
    trace.push(
      gate(
        "G5",
        riskyHandoff ? "caveat" : "pass",
        riskyHandoff ? "candidateHandoffRisk" : "fixedOutputCandidatePath",
        riskyHandoff
          ? `${fontIds.length} family${fontIds.length === 1 ? "" : "ies"}; editable or cross-application handoff remains untested.`
          : "A fixed-output candidate path lowers handoff pressure but still needs exact application proof.",
      ),
    );
  }

  const densityStrength = system.candidateStrengths.some((strength) =>
    ["bodyEndurance", "proseRhythm", "screenReadingBrief", "pasteInResilience", "singleFamily"].includes(strength),
  );
  if (answers.density === "dense" && !densityStrength) {
    trace.push(gate("G6", "remove", "denseBodyUnproven", "Dense pages need a body role with a credible endurance hypothesis; display character cannot rescue it."));
    return trace;
  }
  trace.push(
    gate(
      "G6",
      mode === "candidate_demo" && answers.density !== "sparse" ? "caveat" : "pass",
      answers.density === "dense" ? "denseCandidateStrength" : "densityCompatible",
      answers.density === "dense"
        ? "Candidate traits suggest a credible dense-copy route; shared specimens still decide."
        : "No current density fact removes this system.",
    ),
  );

  const needsData = answers.contentNeeds.some((need) => ["chartsNumbers", "tablesFinance", "technicalNotation"].includes(need));
  const hasTabular = system.candidateStrengths.includes("tabularNumerals") || fonts.some((font) => font.defaultNumerals === "tabular");
  if (needsData && !hasTabular) {
    trace.push(gate("G7", "remove", "dataNumeralsUnproven", "Charts, tables, or financial detail need a tested numeral strategy; none is recorded here."));
    return trace;
  }
  trace.push(
    gate(
      "G7",
      needsData && mode === "candidate_demo" ? "caveat" : "pass",
      needsData ? "dataCandidateStrength" : "noHeavyDataRequirement",
      needsData ? "Tabular numeral behaviour is a candidate strength, pending exact application proof." : "No heavy data requirement removes this system.",
    ),
  );

  if (mode === "production") {
    const missing = answers.viewingContexts.filter((context) => !(system.supportedViewingContexts ?? []).includes(context));
    if (missing.length > 0) {
      trace.push(gate("G8", "remove", "viewingContextUnverified", `Unverified viewing context: ${missing.join(", ")}.`));
      return trace;
    }
    trace.push(gate("G8", "pass", "viewingContextsVerified", "Requested viewing contexts are supported.", system.evidenceIds ?? []));
  } else {
    trace.push(gate("G8", "caveat", "viewingEvidenceMissing", "Room, laptop, PDF, and phone behaviour must be earned through shared specimens and human review."));
  }
  return trace;
};

const characterRank = (character: TypeSystemRecord["character"]): number => ({ quiet: 0, present: 1, expressive: 2 })[character];

const compareSystems = (left: TypeSystemRecord, right: TypeSystemRecord, answers: TypeAnswers): number => {
  const comparisons = [
    Number(right.candidateArtifacts.includes(answers.artifactType)) - Number(left.candidateArtifacts.includes(answers.artifactType)),
    (right.evidenceIds?.length ?? 0) - (left.evidenceIds?.length ?? 0),
    systemFontIds(left).length - systemFontIds(right).length,
    Number(right.candidateStrengths.includes("bodyEndurance")) - Number(left.candidateStrengths.includes("bodyEndurance")),
    answers.character === "unknown"
      ? characterRank(left.character) - characterRank(right.character)
      : Math.abs(characterRank(left.character) - characterRank(answers.character as TypeSystemRecord["character"])) -
        Math.abs(characterRank(right.character) - characterRank(answers.character as TypeSystemRecord["character"])),
    left.collectionOrder - right.collectionOrder,
    left.id.localeCompare(right.id),
  ];
  return comparisons.find((comparison) => comparison !== 0) ?? 0;
};

const roleSelections = (ordered: readonly TypeSystemRecord[]): Array<{ system: TypeSystemRecord; role: TypeAnswerRole }> => {
  const first = ordered[0];
  if (!first) return [];
  const selected: Array<{ system: TypeSystemRecord; role: TypeAnswerRole }> = [{ system: first, role: "ourPick" }];
  const remaining = ordered.slice(1);
  const quieter = remaining.find((system) => characterRank(system.character) < characterRank(first.character));
  if (quieter) selected.push({ system: quieter, role: "quieter" });
  const expressive = remaining.find(
    (system) => system.id !== quieter?.id && characterRank(system.character) > characterRank(first.character),
  );
  if (expressive && selected.length < 3) selected.push({ system: expressive, role: "moreCharacter" });
  for (const system of remaining) {
    if (selected.length >= 3) break;
    if (!selected.some((item) => item.system.id === system.id)) selected.push({ system, role: "alternative" });
  }
  return selected;
};

const reasonFor = (system: TypeSystemRecord, answers: TypeAnswers): string => {
  const parts: string[] = [];
  if (system.candidateArtifacts.includes(answers.artifactType)) parts.push("Built around this kind of deck");
  if (systemFontIds(system).length === 1) parts.push("one family lowers handoff complexity");
  if (answers.density === "dense" && system.candidateStrengths.some((item) => ["bodyEndurance", "proseRhythm", "screenReadingBrief"].includes(item))) {
    parts.push("body role has a credible dense-copy hypothesis");
  }
  if (answers.contentNeeds.some((need) => ["chartsNumbers", "tablesFinance", "technicalNotation"].includes(need))) {
    parts.push("numeral strategy survives this candidate gate");
  }
  if (parts.length === 0) parts.push("survived every gate available in current data");
  return `${parts.join("; ")}.`;
};

export const runTypeEngine = (
  answers: TypeAnswers,
  catalog: TypeCatalog,
  mode: TypeEngineMode = "production",
): TypeRecommendation => {
  validateAnswers(answers);

  if (answers.existingFontConstraint === "mandatory") {
    const anyMatch = catalog.systems.some((system) => familyMatches(system, catalog, answers.mandatoryFontName ?? ""));
    if (!anyMatch) {
      return {
        schemaVersion: "1.0.0",
        mode,
        dataStatus: catalog.systems.every((system) => system.status === "candidate") ? "candidate_only" : "mixed",
        outcome: "boundary",
        headline: "Brand rule first. We need the exact family before we pretend to recommend around it.",
        recommendations: [],
        trace: {},
        exclusions: [],
        blockers: ["Mandatory family is absent from validated system records.", "Exact files, styles, rights, and application behaviour remain unknown."],
        nextActions: ["Collect exact family/style names and font files.", "Confirm usage and redistribution rights.", "Run the application and handoff audit."],
      };
    }
  }

  const traces: Record<string, TypeGateResult[]> = {};
  const survivors: TypeSystemRecord[] = [];
  const exclusions: TypeRecommendation["exclusions"] = [];
  for (const system of catalog.systems) {
    const trace = evaluateSystem(system, answers, mode, catalog);
    traces[system.id] = trace;
    const blocking = trace.find((item) => item.result === "remove" || item.result === "boundary");
    if (blocking) exclusions.push({ systemId: system.id, atGate: blocking.gate, reason: blocking.reason });
    else survivors.push(system);
  }

  const ordered = survivors.sort((left, right) => compareSystems(left, right, answers));
  const recommendations: TypeRecommendationItem[] = roleSelections(ordered).map(({ system, role }) => ({
    systemId: system.id,
    name: system.name,
    answerRole: role,
    status: system.status,
    reason: reasonFor(system, answers),
    caveats: (traces[system.id] ?? []).filter((item) => item.result === "caveat").map((item) => item.reason),
    roles: system.roles,
    oneThingNotToDo: system.oneThingNotToDo,
  }));

  const statuses = new Set(catalog.systems.map((system) => system.status));
  const dataStatus = statuses.size === 1 && statuses.has("candidate")
    ? "candidate_only"
    : statuses.size > 0 && [...statuses].every((status) => status === "verified" || status === "limited")
      ? "public_ready"
      : "mixed";
  if (recommendations.length === 0) {
    return {
      schemaVersion: "1.0.0",
      mode,
      dataStatus,
      outcome: "unsupported",
      headline: mode === "production"
        ? "No public system has earned this path yet. That is a useful stop, not an empty answer."
        : "Nothing survived these constraints without bluffing.",
      recommendations: [],
      trace: traces,
      exclusions,
      blockers: unique(exclusions.map((item) => item.reason)).slice(0, 8),
      nextActions: ["Inspect the first material blocker.", "Change a real constraint only if the deck can change.", "Add evidence before adding another font."],
    };
  }

  return {
    schemaVersion: "1.0.0",
    mode,
    dataStatus,
    outcome: "recommendation",
    headline: mode === "candidate_demo"
      ? `${recommendations.length} candidate direction${recommendations.length === 1 ? "" : "s"} survived. Useful for building; not yet public advice.`
      : `${recommendations.length} system${recommendations.length === 1 ? "" : "s"} survived. Start with the first; keep the others honest.`,
    recommendations,
    trace: traces,
    exclusions,
    blockers: mode === "candidate_demo"
      ? ["Candidate demonstration only.", "Production font files, application evidence, shared specimens, and human review remain release gates."]
      : [],
    nextActions: ["Compare identical copy and geometry.", "Read the visible failure case.", "Inspect evidence before downloading settings."],
  };
};
