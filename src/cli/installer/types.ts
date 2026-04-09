/**
 * Shared types for the installer modules
 */

export interface InstallResult {
	success: boolean;
	agents: { generated: string[]; skipped: string[] };
	commands: { installed: string[]; skipped: string[]; removed: string[] };
	hooks: { installed: string[]; updated: string[]; skipped: string[] };
	mcp: { installed: boolean; updated: boolean };
	statusLine: {
		installed: boolean;
		wrapperCreated: boolean;
		updated: boolean;
		configCreated: boolean;
		validation?: {
			valid: boolean;
			errors: string[];
			warnings: string[];
		};
	};
	styles: { deployed: string[]; skipped: string[] };
	config: { created: boolean };
	errors: string[];
	warnings: string[];
}

export interface UninstallResult {
	success: boolean;
	agents: string[];
	commands: string[];
	hooks: string[];
	mcp: boolean;
	statusLine: boolean;
	errors: string[];
}

export type InstallContext = {
	installDir: string;
	sourceDir: string;
	debug: boolean;
	force: boolean;
	result: InstallResult;
};
