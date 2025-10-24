export * from "./helpers.ts";
export * from "./tokens.ts";
export {
  tokenizeLine,
  handleDoubleSpace,
  collectArgumentTexts,
  tokenText,
} from "./tokenLine.ts";
export type {
  InputToken,
  TokenLine,
  TokenMultiLine,
  CompletionTokenKind,
  CompletionTokenMetadata,
  FolderCompletionMetadata,
  BuiltinCompletionMetadata,
  CommandCompletionMetadata,
  SnippetTriggerCompletionMetadata,
  TypeScriptSymbolCompletionMetadata,
} from "./tokenLine.ts";
export {
  collectFirstTokenCandidates,
  resetCompletionCaches,
} from "./completionProvider.ts";
export type {
  CompletionCandidate,
  CompletionQuery,
  CompletionStageProgress,
  CompletionCollectionOptions,
} from "./completionProvider.ts";
export * from "./completionNavigation.ts";
export * from "./tokenType.ts";
export * from "./tokenEdit.ts";
export * from "./jobControl.ts";
export * from "./terminalControl.ts";
export * from "./prompt.ts";
export * from "./yaml-serialize.ts";
export * from "./history.ts";
export * from "./unparse.ts";
export * from "./secureHash.ts";
export * from "./augmentedAcorn.ts";
export * from "./multilineEnter.ts";
export * from "./editor.ts";
export * from "./commandSummary.ts";

export * from "./builtins/directoryStack.ts";
export * from "./builtins/helpFlags.ts";
export * from "./builtins/pathHelpers.ts";
export { escapeHtml, chalkHtml } from "./builtins/html.ts";

import {
  registerBuiltin,
  listBuiltins,
  registerBuiltinHelp,
  listBuiltinHelpEntries,
  getBuiltin,
  getBuiltinHelp,
} from "./builtins/registry.ts";
import type {
  BuiltinContext,
  BuiltinHandler,
  HistoryEntry,
} from "./builtins/registry.ts";

export {
  registerBuiltin,
  listBuiltins,
  registerBuiltinHelp,
  listBuiltinHelpEntries,
  getBuiltin,
  getBuiltinHelp,
};
export type { BuiltinContext, BuiltinHandler, HistoryEntry };

import "./builtins.ts";
