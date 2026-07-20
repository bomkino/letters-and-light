import type { ColourAnswers, PreviewCopy, TypeAnswers } from "../domain.js";

export type EntryRoute = "whole" | "type" | "colour" | "collection";
export type ColourPath = "quick" | "guided";
export type TypePath = "quick" | "deep";

export type SharedBrief = {
  route: EntryRoute;
  colourPath?: ColourPath;
  typePath?: TypePath;
  artifactType?: string;
  otherDecision?: string;
  existingFontConstraint?: TypeAnswers["existingFontConstraint"];
  mandatoryFontName?: string;
  authoringTool?: string;
  handoffPaths?: string[];
  viewingContexts?: string[];
  density?: TypeAnswers["density"];
  contentNeeds?: string[];
  writingSystems?: string[];
  character?: TypeAnswers["character"];
  sourceRelationship?: ColourAnswers["sourceRelationship"];
  baseMode?: ColourAnswers["baseMode"];
  dataNeed?: ColourAnswers["dataNeed"];
  dataCount?: number;
  divergingMidpoint?: string;
  colourDeliveryOverride?: ColourAnswers["delivery"];
  previewCopy?: PreviewCopy;
};

const mapViewingToDelivery = (brief: SharedBrief): NonNullable<ColourAnswers["delivery"]> => {
  if (brief.colourDeliveryOverride) return brief.colourDeliveryOverride;
  const contexts = brief.viewingContexts ?? [];
  if (contexts.includes("mixedUnknown") || contexts.length > 1) return "mixed";
  if (contexts.includes("phone")) return "phone";
  if (contexts.includes("largeRoom")) return "live_room";
  if (contexts.includes("laptop")) return "screen_share";
  if (brief.handoffPaths?.length === 1 && brief.handoffPaths[0] === "pdf") return "sent_pdf";
  return "unknown";
};

const mapDensityToLoad = (density: TypeAnswers["density"] | undefined): NonNullable<ColourAnswers["contentLoad"]> => {
  if (density === "sparse") return "spare";
  if (density === "moderate") return "balanced";
  if (density === "dense") return "dense";
  return "unknown";
};

export const splitSharedBrief = (brief: SharedBrief): { type: TypeAnswers | null; colour: ColourAnswers } => {
  const typeNeeded = brief.route === "whole" || brief.route === "type";
  const type = typeNeeded
    ? {
        artifactType: brief.artifactType ?? "other",
        ...(brief.otherDecision ? { otherDecision: brief.otherDecision } : {}),
        existingFontConstraint: brief.existingFontConstraint ?? "unknown",
        ...(brief.mandatoryFontName ? { mandatoryFontName: brief.mandatoryFontName } : {}),
        authoringTool: brief.authoringTool ?? "unknown",
        handoffPaths: [...(brief.handoffPaths ?? ["pdf"])],
        viewingContexts: [...(brief.viewingContexts ?? ["mixedUnknown"])],
        density: brief.density ?? "varied",
        contentNeeds: [...(brief.contentNeeds ?? ["wordsImages"])],
        writingSystems: [...(brief.writingSystems ?? ["latin"])],
        character: brief.character ?? "unknown",
      }
    : null;

  const colour: ColourAnswers = {
    delivery: mapViewingToDelivery(brief),
    contentLoad: mapDensityToLoad(brief.density),
    sourceRelationship: brief.sourceRelationship ?? "unknown",
    baseMode: brief.baseMode ?? "decide",
    dataNeed: brief.dataNeed ?? "unknown",
    ...(brief.dataCount === undefined ? {} : { dataCount: brief.dataCount }),
    ...(brief.divergingMidpoint?.trim() ? { divergingMidpoint: brief.divergingMidpoint.trim() } : {}),
  };
  return { type, colour };
};

export const pendingQuestionIds = (brief: SharedBrief): string[] => {
  const pending: string[] = [];
  const typeNeeded = brief.route === "whole" || brief.route === "type";
  const colourNeeded = brief.route === "whole" || brief.route === "colour";
  const guidedColour = brief.colourPath === "guided" || (brief.route === "whole" && !brief.colourPath && !brief.typePath);
  const deepType = brief.typePath === "deep";

  if (typeNeeded && !brief.artifactType) pending.push("artifactType");
  if (typeNeeded && !brief.existingFontConstraint) pending.push("existingFontConstraint");
  if (typeNeeded && brief.existingFontConstraint === "mandatory" && !brief.mandatoryFontName?.trim()) pending.push("mandatoryFontName");
  if (typeNeeded && deepType && !brief.authoringTool) pending.push("authoringTool");
  if (typeNeeded && deepType && (!brief.handoffPaths || brief.handoffPaths.length === 0)) pending.push("handoffPaths");
  if (((typeNeeded && deepType) || (colourNeeded && guidedColour)) && (!brief.viewingContexts || brief.viewingContexts.length === 0)) pending.push("viewingContexts");
  if ((typeNeeded || (colourNeeded && guidedColour)) && !brief.density) pending.push("density");
  if (typeNeeded && deepType && (!brief.contentNeeds || brief.contentNeeds.length === 0)) pending.push("contentNeeds");
  if (typeNeeded && deepType && (!brief.writingSystems || brief.writingSystems.length === 0)) pending.push("writingSystems");
  if (typeNeeded && !brief.character) pending.push("character");
  if (colourNeeded && guidedColour && !brief.sourceRelationship) pending.push("sourceRelationship");
  if (colourNeeded && guidedColour && !brief.baseMode) pending.push("baseMode");
  if (colourNeeded && guidedColour && !brief.dataNeed) pending.push("dataNeed");
  if (colourNeeded && guidedColour && ["categorical", "sequential", "diverging"].includes(brief.dataNeed ?? "") && brief.dataCount === undefined) pending.push("dataCount");
  if (colourNeeded && guidedColour && brief.dataNeed === "diverging" && !brief.divergingMidpoint?.trim()) pending.push("divergingMidpoint");
  return pending;
};
