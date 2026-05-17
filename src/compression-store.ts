/**
 * Simple in-memory store for per-session compression summaries.
 * Keyed by sessionKey (same format as session-manager:
 *   cwd::modelId::scope::affinity)
 *
 * When DCP injects `compress` instructions and Claude CLI calls the proxy
 * `compress` tool, the handler stores the summary here and marks the session
 * for restart. On the next `doStream` call the active process is evicted and
 * the session id is cleared so a fresh Claude CLI spawn happens. The new spawn
 * reads the stored summary via `buildAppendedSystemPrompt` and prepends it to
 * the system prompt — giving Claude a clean context window with only the
 * summary as prior context.
 */

const compressionSummaries = new Map<string, string>()
const restartPending = new Set<string>()

export function storeCompressionSummary(sessionKey: string, summary: string): void {
  compressionSummaries.set(sessionKey, summary)
}

export function getCompressionSummary(sessionKey: string): string | undefined {
  return compressionSummaries.get(sessionKey)
}

export function clearCompressionSummary(sessionKey: string): void {
  compressionSummaries.delete(sessionKey)
  restartPending.delete(sessionKey)
}

export function markRestartPending(sessionKey: string): void {
  restartPending.add(sessionKey)
}

export function isRestartPending(sessionKey: string): boolean {
  return restartPending.has(sessionKey)
}

export function clearRestartPending(sessionKey: string): void {
  restartPending.delete(sessionKey)
}
