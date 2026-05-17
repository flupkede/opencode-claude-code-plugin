/**
 * Simple in-memory store for per-session compression summaries.
 * Keyed by sessionKey (same format as session-manager:
 *   cwd::modelId::scope::affinity)
 *
 * When DCP injects `compress` instructions and Claude CLI calls the proxy
 * `compress` tool, the handler stores the summary here. On the next CLI
 * spawn, `buildAppendedSystemPrompt` prepends the stored summary so the
 * compressed context carries forward.
 */

const compressionSummaries = new Map<string, string>()

export function storeCompressionSummary(sessionKey: string, summary: string): void {
  compressionSummaries.set(sessionKey, summary)
}

export function getCompressionSummary(sessionKey: string): string | undefined {
  return compressionSummaries.get(sessionKey)
}

export function clearCompressionSummary(sessionKey: string): void {
  compressionSummaries.delete(sessionKey)
}
