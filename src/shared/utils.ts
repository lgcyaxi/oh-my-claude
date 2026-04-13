/**
 * Shared utility functions used across the codebase.
 */

/**
 * Safely extract an error message from an unknown thrown value.
 */
export function toErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
