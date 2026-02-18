export type {
  PreferenceScope,
  PreferenceTrigger,
  Preference,
  PreferenceMatch,
  PreferenceContext,
  CreatePreferenceInput,
  PreferenceListOptions,
  PreferenceStats,
  PreferenceResult,
  PreferenceStorage,
  PreferenceJsonStore,
} from "./types";

export {
  PreferenceStore,
  getGlobalPreferencesDir,
  getGlobalPreferencesPath,
  getProjectPreferencesDir,
  getProjectPreferencesPath,
  generatePreferenceId,
  nowISO,
} from "./store";

export type { TaskCategory, CategoryAnalysis } from "./injection";

export {
  analyzeTaskCategory,
  extractKeywords,
  buildPreferenceContext,
  injectPreferences,
  formatPreferenceInjection,
} from "./injection";

export {
  CLAUDE_MD_MARKERS,
  formatPreferencesForClaudeMd,
  readClaudeMdSection,
  updateClaudeMdSection,
} from "./claude-md";

export type {
  ConversationMessage,
  DetectedPattern,
  ConversationAnalysis,
  PreferenceSuggestion,
} from "./learning";

export {
  analyzeConversation,
  detectCorrections,
  detectRepeatedPatterns,
  suggestPreferences,
  shouldSuggestPreference,
} from "./learning";
