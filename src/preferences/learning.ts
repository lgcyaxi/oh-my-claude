/**
 * Auto-Learning Pattern Detection
 *
 * Scans conversation history to detect user preferences that should
 * be stored as explicit preference rules. Detects:
 *   - Explicit statements ("I prefer X", "Always do Y", "Never do Z")
 *   - Correction patterns ("Actually...", "No, I meant...")
 *   - Repeated requests/corrections on the same topic
 *
 * IMPORTANT: This module only SUGGESTS preferences — it never creates
 * them automatically. It does not store conversation history or send
 * data to external services.
 */

import type { PreferenceTrigger } from "./types";
import { PreferenceStore } from "./store";
import { extractKeywords } from "./injection";

/**
 * A single message in the conversation to analyze.
 * Only user messages are meaningful for preference detection.
 */
export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * A detected preference pattern from conversation analysis.
 */
export interface DetectedPattern {
  /** What type of pattern was detected */
  type: "explicit" | "correction" | "repetition";
  /** The raw text that triggered the detection */
  sourceText: string;
  /** Extracted topic/subject of the preference */
  topic: string;
  /** Extracted preference value (what the user wants) */
  preferredValue: string;
  /** Confidence score 0-1 */
  confidence: number;
  /** Index of the message in the conversation */
  messageIndex: number;
}

/**
 * Full analysis result from scanning a conversation.
 */
export interface ConversationAnalysis {
  /** All detected patterns */
  patterns: DetectedPattern[];
  /** Grouped corrections by topic */
  correctionsByTopic: Map<string, DetectedPattern[]>;
  /** Repeated topics with occurrence count */
  repeatedTopics: Map<string, number>;
  /** Total messages analyzed */
  messagesAnalyzed: number;
}

/**
 * A suggestion for a preference to create based on analysis.
 */
export interface PreferenceSuggestion {
  /** Suggested preference title */
  title: string;
  /** Suggested preference content/rule */
  content: string;
  /** Confidence score 0-1 */
  confidence: number;
  /** Human-readable reason for the suggestion */
  reason: string;
  /** Suggested tags for categorization */
  suggestedTags: string[];
  /** Suggested trigger configuration */
  suggestedTriggers: PreferenceTrigger;
}

/**
 * Regex patterns for detecting explicit preference statements.
 * Each pattern captures the preference subject and/or value.
 */
const EXPLICIT_PATTERNS: Array<{
  regex: RegExp;
  confidence: number;
  extractTopic: (match: RegExpMatchArray) => string;
  extractValue: (match: RegExpMatchArray) => string;
}> = [
  {
    // "I prefer X over Y" or "I prefer X"
    regex: /\bi prefer\s+(.+?)(?:\s+over\s+(.+?))?(?:\.|$)/i,
    confidence: 0.85,
    extractTopic: (m) => normalizeTopicText(m[2] ? `${m[1] ?? ""} vs ${m[2]}` : (m[1] ?? "")),
    extractValue: (m) => (m[1] ?? "").trim(),
  },
  {
    // "Always do X" / "Always use X"
    regex: /\balways\s+((?:do|use|include|add|keep|make|write|run|set)\s+.+?)(?:\.|,|$)/i,
    confidence: 0.9,
    extractTopic: (m) => normalizeTopicText(m[1] ?? ""),
    extractValue: (m) => `Always ${(m[1] ?? "").trim()}`,
  },
  {
    // "Never do X" / "Never use X"
    regex: /\bnever\s+((?:do|use|include|add|keep|make|write|run|set)\s+.+?)(?:\.|,|$)/i,
    confidence: 0.9,
    extractTopic: (m) => normalizeTopicText(m[1] ?? ""),
    extractValue: (m) => `Never ${(m[1] ?? "").trim()}`,
  },
  {
    // "From now on, do X"
    regex: /\bfrom now on,?\s+(.+?)(?:\.|$)/i,
    confidence: 0.9,
    extractTopic: (m) => normalizeTopicText(m[1] ?? ""),
    extractValue: (m) => (m[1] ?? "").trim(),
  },
  {
    // "Actually, I like X better"
    regex: /\bactually,?\s+i (?:like|prefer|want)\s+(.+?)(?:\s+better)?(?:\.|$)/i,
    confidence: 0.8,
    extractTopic: (m) => normalizeTopicText(m[1] ?? ""),
    extractValue: (m) => (m[1] ?? "").trim(),
  },
  {
    // "Don't do X" / "Do not do X"
    regex: /\b(?:don't|do not)\s+((?:use|include|add|keep|make|write|run|set)\s+.+?)(?:\.|,|$)/i,
    confidence: 0.8,
    extractTopic: (m) => normalizeTopicText(m[1] ?? ""),
    extractValue: (m) => `Never ${(m[1] ?? "").trim()}`,
  },
  {
    // "Make sure to X" / "Make sure you X"
    regex: /\bmake sure\s+(?:to|you)\s+(.+?)(?:\.|$)/i,
    confidence: 0.7,
    extractTopic: (m) => normalizeTopicText(m[1] ?? ""),
    extractValue: (m) => `Always ${(m[1] ?? "").trim()}`,
  },
  {
    // "Remember to X"
    regex: /\bremember(?:,?\s+to)?\s+(.+?)(?:\.|$)/i,
    confidence: 0.75,
    extractTopic: (m) => normalizeTopicText(m[1] ?? ""),
    extractValue: (m) => (m[1] ?? "").trim(),
  },
];

/**
 * Regex patterns for detecting corrections.
 * These indicate the user is correcting a previous behavior.
 */
const CORRECTION_PATTERNS: Array<{
  regex: RegExp;
  confidence: number;
  extractTopic: (match: RegExpMatchArray) => string;
  extractValue: (match: RegExpMatchArray) => string;
}> = [
  {
    // "No, I meant X"
    regex: /\bno,?\s+i meant\s+(.+?)(?:\.|$)/i,
    confidence: 0.7,
    extractTopic: (m) => normalizeTopicText(m[1] ?? ""),
    extractValue: (m) => (m[1] ?? "").trim(),
  },
  {
    // "Not quite — use X instead"
    regex: /\bnot quite[\s—–-]+(?:use|try|do)\s+(.+?)(?:\s+instead)?(?:\.|$)/i,
    confidence: 0.65,
    extractTopic: (m) => normalizeTopicText(m[1] ?? ""),
    extractValue: (m) => (m[1] ?? "").trim(),
  },
  {
    // "X is wrong, use Y" / "X is incorrect, use Y"
    regex: /\b(.+?)\s+is\s+(?:wrong|incorrect|bad),?\s+(?:use|try|do)\s+(.+?)(?:\.|$)/i,
    confidence: 0.7,
    extractTopic: (m) => normalizeTopicText(`${m[1] ?? ""} → ${m[2] ?? ""}`),
    extractValue: (m) => `Use ${(m[2] ?? "").trim()} instead of ${(m[1] ?? "").trim()}`,
  },
  {
    // "Actually, ..." (generic correction)
    regex: /\bactually,?\s+(.+?)(?:\.|$)/i,
    confidence: 0.5,
    extractTopic: (m) => normalizeTopicText(m[1] ?? ""),
    extractValue: (m) => (m[1] ?? "").trim(),
  },
  {
    // "No, without X" / "No, no X"
    regex: /\bno,?\s+(?:without|no)\s+(.+?)(?:\.|$)/i,
    confidence: 0.65,
    extractTopic: (m) => normalizeTopicText(m[1] ?? ""),
    extractValue: (m) => `Without ${(m[1] ?? "").trim()}`,
  },
  {
    // "Instead, do X" / "Instead use X"
    regex: /\binstead,?\s+(?:use|do|try)?\s*(.+?)(?:\.|$)/i,
    confidence: 0.6,
    extractTopic: (m) => normalizeTopicText(m[1] ?? ""),
    extractValue: (m) => (m[1] ?? "").trim(),
  },
];

/**
 * Analyze a conversation for preference patterns.
 *
 * Scans all user messages for explicit preferences, corrections,
 * and repeated patterns. Returns a comprehensive analysis result.
 *
 * @param messages - Array of conversation messages (user + assistant)
 * @returns ConversationAnalysis with all detected patterns
 */
export function analyzeConversation(messages: ConversationMessage[]): ConversationAnalysis {
  const patterns: DetectedPattern[] = [];
  const correctionsByTopic = new Map<string, DetectedPattern[]>();
  const topicMentions = new Map<string, number>();
  let messagesAnalyzed = 0;

  const userMessages = messages
    .map((m, i) => ({ ...m, originalIndex: i }))
    .filter((m) => m.role === "user");

  messagesAnalyzed = userMessages.length;

  for (const msg of userMessages) {
    const explicitPatterns = detectExplicitStatements(msg.content, msg.originalIndex);
    patterns.push(...explicitPatterns);

    const corrections = detectCorrectionPatterns(msg.content, msg.originalIndex);
    patterns.push(...corrections);

    const keywords = extractKeywords(msg.content);
    for (const kw of keywords) {
      topicMentions.set(kw, (topicMentions.get(kw) ?? 0) + 1);
    }
  }

  for (const pattern of patterns.filter((p) => p.type === "correction")) {
    const topicKey = pattern.topic.toLowerCase();
    const existing = correctionsByTopic.get(topicKey) ?? [];
    existing.push(pattern);
    correctionsByTopic.set(topicKey, existing);
  }

  const repetitionPatterns = detectRepeatedPatterns(messages);
  patterns.push(...repetitionPatterns);

  const repeatedTopics = new Map<string, number>();
  for (const [topic, count] of topicMentions) {
    if (count >= 3) {
      repeatedTopics.set(topic, count);
    }
  }

  return {
    patterns,
    correctionsByTopic,
    repeatedTopics,
    messagesAnalyzed,
  };
}

/**
 * Detect correction patterns in conversation messages.
 *
 * Looks for "actually...", "no, I meant...", "X is wrong...", etc.
 * Also detects when the same correction is made multiple times
 * (indicating a persistent preference).
 *
 * @param messages - Array of conversation messages
 * @returns Array of correction DetectedPattern entries
 */
export function detectCorrections(messages: ConversationMessage[]): DetectedPattern[] {
  const corrections: DetectedPattern[] = [];

  const userMessages = messages
    .map((m, i) => ({ ...m, originalIndex: i }))
    .filter((m) => m.role === "user");

  for (const msg of userMessages) {
    const patterns = detectCorrectionPatterns(msg.content, msg.originalIndex);
    corrections.push(...patterns);
  }

  const topicGroups = new Map<string, DetectedPattern[]>();
  for (const c of corrections) {
    const key = c.topic.toLowerCase();
    const group = topicGroups.get(key) ?? [];
    group.push(c);
    topicGroups.set(key, group);
  }

  for (const [, group] of topicGroups) {
    if (group.length >= 2) {
      const boost = Math.min(0.15 * (group.length - 1), 0.3);
      for (const p of group) {
        p.confidence = Math.min(p.confidence + boost, 1.0);
      }
    }
  }

  return corrections;
}

/**
 * Detect repeated patterns in conversation messages.
 *
 * Finds keywords/topics that appear in 3+ different user messages,
 * indicating a persistent concern or preference the user keeps
 * mentioning.
 *
 * @param messages - Array of conversation messages
 * @returns Array of repetition DetectedPattern entries
 */
export function detectRepeatedPatterns(messages: ConversationMessage[]): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];

  const keywordOccurrences = new Map<string, { count: number; messageIndices: number[]; texts: string[] }>();

  const userMessages = messages
    .map((m, i) => ({ ...m, originalIndex: i }))
    .filter((m) => m.role === "user");

  for (const msg of userMessages) {
    const keywords = extractKeywords(msg.content);
    const seen = new Set<string>();

    for (const kw of keywords) {
      if (seen.has(kw)) continue;
      seen.add(kw);

      const existing = keywordOccurrences.get(kw) ?? { count: 0, messageIndices: [], texts: [] };
      existing.count++;
      existing.messageIndices.push(msg.originalIndex);
      existing.texts.push(msg.content);
      keywordOccurrences.set(kw, existing);
    }
  }

  for (const [keyword, data] of keywordOccurrences) {
    if (data.count < 3) continue;

    // confidence: 3→0.45, 4→0.55, 5+→0.65+
    const confidence = Math.min(0.35 + data.count * 0.1, 0.85);
    const lastIndex = data.messageIndices[data.messageIndices.length - 1] ?? 0;

    patterns.push({
      type: "repetition",
      sourceText: data.texts[data.texts.length - 1] ?? "",
      topic: keyword,
      preferredValue: `Recurring mention: "${keyword}" (${data.count} times)`,
      confidence,
      messageIndex: lastIndex,
    });
  }

  return patterns;
}

/**
 * Generate preference suggestions from conversation analysis.
 *
 * Converts detected patterns into actionable PreferenceSuggestion
 * entries. Deduplicates, merges related patterns, and filters
 * by confidence threshold.
 *
 * @param analysis - ConversationAnalysis from analyzeConversation()
 * @returns Array of PreferenceSuggestion sorted by confidence
 */
export function suggestPreferences(analysis: ConversationAnalysis): PreferenceSuggestion[] {
  const suggestions: PreferenceSuggestion[] = [];
  const seenTopics = new Set<string>();

  const actionablePatterns = analysis.patterns
    .filter((p) => p.type === "explicit" || p.type === "correction")
    .sort((a, b) => b.confidence - a.confidence);

  for (const pattern of actionablePatterns) {
    const topicKey = pattern.topic.toLowerCase();
    if (seenTopics.has(topicKey)) continue;
    seenTopics.add(topicKey);

    const correctionGroup = analysis.correctionsByTopic.get(topicKey);
    let confidence = pattern.confidence;
    let reason: string;

    if (correctionGroup && correctionGroup.length >= 2) {
      confidence = Math.min(confidence + 0.15, 1.0);
      reason = `Detected ${correctionGroup.length} explicit corrections about "${pattern.topic}"`;
    } else if (pattern.type === "explicit") {
      reason = `Explicit preference statement detected`;
    } else {
      reason = `Correction pattern detected: "${pattern.sourceText.slice(0, 80)}"`;
    }

    const keywords = extractKeywords(pattern.preferredValue);
    const topicKeywords = extractKeywords(pattern.topic);
    const allKeywords = [...new Set([...keywords, ...topicKeywords])];

    suggestions.push({
      title: generateTitle(pattern),
      content: pattern.preferredValue,
      confidence,
      reason,
      suggestedTags: allKeywords.slice(0, 5),
      suggestedTriggers: {
        keywords: allKeywords.slice(0, 8),
      },
    });
  }

  for (const pattern of analysis.patterns.filter((p) => p.type === "repetition")) {
    const topicKey = pattern.topic.toLowerCase();
    if (seenTopics.has(topicKey)) continue;
    seenTopics.add(topicKey);

    if (pattern.confidence < 0.5) continue;

    const repeatCount = analysis.repeatedTopics.get(topicKey) ?? 3;

    suggestions.push({
      title: `Recurring: "${pattern.topic}"`,
      content: `The topic "${pattern.topic}" comes up frequently. Consider creating a preference rule.`,
      confidence: pattern.confidence,
      reason: `"${pattern.topic}" mentioned in ${repeatCount} different messages`,
      suggestedTags: [pattern.topic],
      suggestedTriggers: {
        keywords: [pattern.topic],
      },
    });
  }

  suggestions.sort((a, b) => b.confidence - a.confidence);

  return suggestions;
}

/**
 * Check whether a suggestion should be presented to the user.
 *
 * Applies confidence threshold and duplicate detection against
 * existing preferences. Returns false if:
 *   - Confidence is below 0.6
 *   - A similar preference already exists (fuzzy title/content match)
 *
 * @param suggestion - PreferenceSuggestion to evaluate
 * @param store - Optional PreferenceStore for duplicate checking
 * @returns true if the suggestion should be shown to the user
 */
export function shouldSuggestPreference(
  suggestion: PreferenceSuggestion,
  store?: PreferenceStore,
): boolean {
  if (suggestion.confidence < 0.6) return false;

  if (store) {
    const existing = store.list();
    for (const pref of existing) {
      if (isSimilar(suggestion.title, pref.title)) return false;
      if (isSimilar(suggestion.content, pref.content)) return false;
    }
  }

  return true;
}

function detectExplicitStatements(content: string, messageIndex: number): DetectedPattern[] {
  const results: DetectedPattern[] = [];

  for (const pattern of EXPLICIT_PATTERNS) {
    const match = content.match(pattern.regex);
    if (!match) continue;

    results.push({
      type: "explicit",
      sourceText: content,
      topic: pattern.extractTopic(match),
      preferredValue: pattern.extractValue(match),
      confidence: pattern.confidence,
      messageIndex,
    });
  }

  return results;
}

function detectCorrectionPatterns(content: string, messageIndex: number): DetectedPattern[] {
  const results: DetectedPattern[] = [];

  for (const pattern of CORRECTION_PATTERNS) {
    const match = content.match(pattern.regex);
    if (!match) continue;

    results.push({
      type: "correction",
      sourceText: content,
      topic: pattern.extractTopic(match),
      preferredValue: pattern.extractValue(match),
      confidence: pattern.confidence,
      messageIndex,
    });
  }

  return results;
}

function normalizeTopicText(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 100);
}

function generateTitle(pattern: DetectedPattern): string {
  const value = pattern.preferredValue.trim();

  if (/^(?:always|never)\s+/i.test(value)) return capitalize(value.slice(0, 60));
  if (/^use\s+/i.test(value)) return capitalize(value.slice(0, 60));
  if (/^without\s+/i.test(value)) return `Never include ${value.slice(8).trim()}`.slice(0, 60);

  return `Prefer: ${value}`.slice(0, 60);
}

function capitalize(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Fuzzy similarity check between two strings.
 *
 * Uses normalized token overlap (Jaccard-like). Returns true if
 * the overlap ratio exceeds the similarity threshold.
 *
 * @param a - First string
 * @param b - Second string
 * @param threshold - Similarity threshold (default: 0.6)
 * @returns true if strings are considered similar
 */
function isSimilar(a: string, b: string, threshold = 0.6): boolean {
  const tokensA = new Set(
    a
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .split(/\s+/)
      .filter((t) => t.length > 2),
  );
  const tokensB = new Set(
    b
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .split(/\s+/)
      .filter((t) => t.length > 2),
  );

  if (tokensA.size === 0 || tokensB.size === 0) return false;

  let intersection = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) intersection++;
  }

  const union = new Set([...tokensA, ...tokensB]).size;
  return union > 0 ? intersection / union >= threshold : false;
}
