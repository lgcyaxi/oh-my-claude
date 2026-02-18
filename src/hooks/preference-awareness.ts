#!/usr/bin/env node
/**
 * Preference Awareness Hook (UserPromptSubmit)
 *
 * Usage in settings.json:
 * {
 *   "hooks": {
 *     "UserPromptSubmit": [{
 *       "matcher": "",
 *       "hooks": [{
 *         "type": "command",
 *         "command": "node ~/.claude/oh-my-claude/hooks/preference-awareness.js"
 *       }]
 *     }]
 *   }
 * }
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  buildPreferenceContext,
  injectPreferences,
  formatPreferenceInjection,
} from "../preferences/injection";

interface UserPromptSubmitInput {
  prompt: string;
  session_id?: string;
  cwd?: string;
}

interface HookResponse {
  decision: "approve" | "block";
  reason?: string;
  suppressOutput?: boolean;
  hookSpecificOutput?: {
    hookEventName: "UserPromptSubmit";
    additionalContext?: string;
  };
}

const CACHE_TTL_MS = 8_000;
const MAX_MATCHES = 5;
const CACHE_PATH = join(tmpdir(), "omc-pref-awareness-cache.json");

interface CacheEntry {
  ts: number;
  hash: string;
  result: string;
}

function quickHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return hash.toString(36);
}

function getCached(promptHash: string): string | null {
  try {
    if (!existsSync(CACHE_PATH)) return null;
    const raw = readFileSync(CACHE_PATH, "utf-8");
    const cache: CacheEntry = JSON.parse(raw);
    if (cache.hash === promptHash && Date.now() - cache.ts < CACHE_TTL_MS) {
      return cache.result;
    }
  } catch { /* cache miss */ }
  return null;
}

function setCache(promptHash: string, result: string): void {
  try {
    const entry: CacheEntry = { ts: Date.now(), hash: promptHash, result };
    writeFileSync(CACHE_PATH, JSON.stringify(entry), "utf-8");
  } catch { /* best-effort */ }
}

function approve(): string {
  return JSON.stringify({ decision: "approve" });
}

function approveWithContext(context: string): string {
  const response: HookResponse = {
    decision: "approve",
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: context,
    },
  };
  return JSON.stringify(response);
}

async function main() {
  let inputData = "";
  try {
    inputData = readFileSync(0, "utf-8");
  } catch {
    console.log(approve());
    return;
  }

  if (!inputData.trim()) {
    console.log(approve());
    return;
  }

  let input: UserPromptSubmitInput;
  try {
    input = JSON.parse(inputData);
  } catch {
    console.log(approve());
    return;
  }

  const prompt = input.prompt ?? "";

  if (prompt.length < 3) {
    console.log(approve());
    return;
  }

  const hash = quickHash(prompt);
  const cached = getCached(hash);
  if (cached !== null) {
    console.log(cached === "" ? approve() : approveWithContext(cached));
    return;
  }

  try {
    const context = buildPreferenceContext(prompt);
    const matches = injectPreferences(context, input.cwd);
    const topMatches = matches.slice(0, MAX_MATCHES);

    if (topMatches.length === 0) {
      setCache(hash, "");
      console.log(approve());
      return;
    }

    const formatted = formatPreferenceInjection(topMatches);

    if (!formatted) {
      setCache(hash, "");
      console.log(approve());
      return;
    }

    setCache(hash, formatted);
    console.log(approveWithContext(formatted));
  } catch {
    console.log(approve());
  }
}

main().catch(() => {
  console.log(JSON.stringify({ decision: "approve" }));
});
