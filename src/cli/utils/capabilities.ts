/**
 * Capability detection for external CLI tools
 *
 * Detects availability of OpenCode, Codex CLI, and other external tools
 * to enable dynamic agent routing based on installed capabilities.
 */

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { getCredential } from '../../shared/auth/store';
import { loadConfig } from '../../shared/config/loader';

/**
 * Capability flags for external tools
 */
export interface Capabilities {
	/** OpenCode CLI is installed and available */
	opencode: boolean;
	/** MCP agents are available (MCP server running) */
	mcp: boolean;
	/** OAuth providers configured */
	openaiAuth: boolean;
	minimaxAuth: boolean;
	/** API key providers configured */
	deepseek: boolean;
	zhipu: boolean;
	zai: boolean;
	minimax: boolean;
	'minimax-cn': boolean;
	kimi: boolean;
	aliyun: boolean;
	ollama: boolean;
}

let cachedCapabilities: Capabilities | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 30_000; // 30 second cache

/**
 * Check if a CLI command exists in PATH
 */
function commandExists(command: string): boolean {
	try {
		const checkCmd = process.platform === 'win32' ? 'where' : 'which';
		execSync(`${checkCmd} ${command}`, { stdio: 'pipe' });
		return true;
	} catch {
		return false;
	}
}

/**
 * Detect all capabilities
 * Results are cached for 30 seconds to avoid repeated checks
 */
export function detectCapabilities(): Capabilities {
	const now = Date.now();
	if (cachedCapabilities && now - cachedAt < CACHE_TTL_MS) {
		return cachedCapabilities;
	}

	const config = loadConfig();

	// Check external CLI tools
	const opencode = commandExists('opencode');

	// Check OAuth providers
	const openaiAuth = !!getCredential('openai');
	const minimaxAuth = !!getCredential('minimax');

	// Check API key providers (check env vars)
	const deepseek = !!process.env.DEEPSEEK_API_KEY;
	const zhipu = !!process.env.ZHIPU_API_KEY;
	const zhipuGlobal = !!process.env.ZAI_API_KEY;
	const minimax = !!process.env.MINIMAX_API_KEY;
	const minimaxCn = !!process.env.MINIMAX_CN_API_KEY;
	const kimi = !!process.env.KIMI_API_KEY;
	const aliyun = !!process.env.ALIYUN_API_KEY;

	// Ollama: configured if OLLAMA_API_KEY is set OR Ollama is running locally (no key needed)
	const ollama =
		!!process.env.OLLAMA_API_KEY ||
		!!process.env.OLLAMA_HOST ||
		!!process.env.OLLAMA_API_BASE;

	// MCP is available if any API provider is configured
	const mcp =
		deepseek ||
		zhipu ||
		zhipuGlobal ||
		minimax ||
		minimaxCn ||
		kimi ||
		aliyun ||
		openaiAuth ||
		ollama;

	cachedCapabilities = {
		opencode,
		mcp,
		openaiAuth,
		minimaxAuth,
		deepseek,
		zhipu,
		zai: zhipuGlobal,
		minimax,
		'minimax-cn': minimaxCn,
		kimi,
		aliyun,
		ollama,
	};

	cachedAt = now;
	return cachedCapabilities;
}

/**
 * Clear capability cache (useful after auth changes)
 */
export function clearCapabilityCache(): void {
	cachedCapabilities = null;
	cachedAt = 0;
}

/**
 * Get human-readable capability summary
 */
export function getCapabilitySummary(): string {
	const caps = detectCapabilities();

	const lines: string[] = [];
	lines.push('CLI Agents:');
	lines.push(`  OpenCode: ${caps.opencode ? '✓' : '✗'}`);
	lines.push('');
	lines.push('Infrastructure:');
	lines.push(`  MCP Server: ${caps.mcp ? '✓' : '✗'}`);
	lines.push('');
	lines.push('Providers:');
	lines.push(`  DeepSeek: ${caps.deepseek ? '✓' : '✗'}`);
	lines.push(`  ZhiPu: ${caps.zhipu ? '✓' : '✗'}`);
	lines.push(`  Z.AI: ${caps.zai ? '✓' : '✗'}`);
	lines.push(`  MiniMax: ${caps.minimax ? '✓' : '✗'}`);
	lines.push(`  MiniMax CN: ${caps['minimax-cn'] ? '✓' : '✗'}`);
	lines.push(`  Kimi: ${caps.kimi ? '✓' : '✗'}`);
	lines.push(`  Aliyun: ${caps.aliyun ? '✓' : '✗'}`);
	lines.push(`  Ollama: ${caps.ollama ? '✓' : '✗'}`);
	lines.push('');
	lines.push('OAuth:');
	lines.push(`  OpenAI: ${caps.openaiAuth ? '✓' : '✗'}`);
	lines.push(
		`  MiniMax OAuth (quota display only): ${caps.minimaxAuth ? '✓' : '✗'}`,
	);

	return lines.join('\n');
}

/**
 * Check if specific capability is available
 */
export function hasCapability(capability: keyof Capabilities): boolean {
	return detectCapabilities()[capability];
}

/**
 * Get available external CLI tools
 */
export function getAvailableCliTools(): string[] {
	const caps = detectCapabilities();
	const tools: string[] = [];
	if (caps.opencode) tools.push('opencode');
	return tools;
}
