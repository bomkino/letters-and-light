/** Human labels for machine keys from the legacy type data. Raw keys stay in
 *  the DOM (title/data-key) and in the evidence drawer for traceability —
 *  but body copy never renders camelCase. */

const humanize = (key: string): string =>
  key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();

const TRAIT_LABELS: Record<string, string> = {
  singleFamily: "One family does the whole job",
  bodyEndurance: "Built for long reading",
  tabularNumerals: "Numerals that align in tables",
  trueItalics: "True italics, not slanted romans",
  widthRange: "A real width range, tight to roomy",
  broadWeightRange: "A broad, usable weight range",
  distinctDisplayVoice: "A display voice you can recognize",
  distinctLetterforms: "Letterforms built to resist confusion",
  opticalSizeRange: "Optical sizes, small text to huge titles",
  proseRhythm: "An even, unhurried prose rhythm",
  quietBody: "Body text that stays out of the way",
  quietUtility: "Quiet, dependable small print",
  roleContrast: "Display and body clearly distinct",
  screenReadingBrief: "Drawn for reading on screens",
  softnessAxis: "A softness dial for display warmth",
  superfamilyRelationship: "Sans and serif that genuinely belong together",
  utilityClarity: "Labels and captions stay crisp",
};

const VALIDATION_LABELS: Record<string, string> = {
  applicationNaming: "Exact application and file naming",
  axisPresetSelection: "Named axis presets, not slider tourism",
  canonicalFileSelection: "Canonical file versions chosen and hashed",
  denseProseSpecimen: "A dense-prose specimen that holds up",
  displayOnlyDiscipline: "Proof it stays a display face",
  humanReview: "Review by working designers",
  languageCorpus: "A real-language corpus, reviewed",
  lowVisionUserReview: "Compensated low-vision user review",
  opticalSizeAcrossApps: "Optical sizes verified across applications",
  pairingDistinctness: "Pairing distinctness proof",
  phoneSpecimen: "A phone-context specimen",
  platformMatrix: "The application and handoff matrix",
  twelveSlideRig: "The twelve-slide rig",
  widthAxisAcrossApps: "Width axis verified across applications",
};

export const traitLabel = (key: string): string => TRAIT_LABELS[key] ?? humanize(key);

export const validationLabel = (key: string): string => VALIDATION_LABELS[key] ?? humanize(key);
