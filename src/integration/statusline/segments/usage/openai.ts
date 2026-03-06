/*
 * @Author       : Lihao leolihao@arizona.edu
 * @Date         : 2026-03-05 15:54:07
 * @FilePath     : /oh-my-claude/src/integration/statusline/segments/usage/openai.ts
 * @Description  : 
 * Copyright (c) 2026 by Lihao (leolihao@arizona.edu), All Rights Reserved.
 */
/**
 * OpenAI / Codex auth status for the statusline usage segment.
 *
 * Shows a simple login indicator: "ok" (green) when any auth is detected,
 * hidden (null) when not configured.
 *
 * Auth sources (checked in order):
 * 1. OPENAI_API_KEY environment variable
 * 2. oh-my-claude shared credential store (oauth-openai)
 * 3. ~/.codex/auth.json (Codex app-server auth)
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { ProviderCacheEntry } from './types';
import { hasCredential } from '../../../../shared/auth/store';

interface CodexAuthFile {
	authMethod?: 'chatgpt' | 'api_key' | string | null;
	authToken?: string | null;
}

function hasSharedOpenAICredential(): boolean {
	try {
		return hasCredential('openai');
	} catch {
		return false;
	}
}

function readCodexAuth(): CodexAuthFile | null {
	try {
		const path = join(homedir(), '.codex', 'auth.json');
		const raw = readFileSync(path, 'utf-8');
		return JSON.parse(raw) as CodexAuthFile;
	} catch {
		return null;
	}
}

/**
 * Check Codex auth status. Returns "ok" (green) if any auth is present.
 */
export async function fetchOpenAIUsage(): Promise<ProviderCacheEntry | null> {
	try {
		if (process.env.OPENAI_API_KEY) {
			return { timestamp: Date.now(), display: '', color: 'good' };
		}

		if (hasSharedOpenAICredential()) {
			return { timestamp: Date.now(), display: '', color: 'good' };
		}

		const auth = readCodexAuth();
		if (auth?.authMethod || auth?.authToken) {
			return { timestamp: Date.now(), display: '', color: 'good' };
		}

		return null;
	} catch {
		return null;
	}
}

/**
 * Check if OpenAI/Codex is configured in this environment.
 */
export function isOpenAIConfigured(): boolean {
	try {
		if (process.env.OPENAI_API_KEY) return true;
		if (hasSharedOpenAICredential()) return true;
		const auth = readCodexAuth();
		return !!auth?.authMethod || !!auth?.authToken;
	} catch {
		return false;
	}
}
