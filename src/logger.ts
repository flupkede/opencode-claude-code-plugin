import { appendFileSync, mkdirSync, renameSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"

const DEBUG = process.env.DEBUG?.includes("opencode-claude-code") ?? false

const LOG_DIR =
  process.env.OPENCODE_CLAUDE_CODE_LOG_DIR ??
  join(homedir(), ".local", "share", "opencode-claude-code")
const LOG_FILE = join(LOG_DIR, "plugin.log")
const MAX_LOG_BYTES = 5 * 1024 * 1024 // 5 MB

// v0.4.14: File logging is opt-in via OPENCODE_CLAUDE_CODE_LOG_FILE.
// Before this, every user of the plugin had ~/.local/share/opencode-claude-
// code/plugin.log silently accreting on their disk with full message
// contents — a privacy and disk-hygiene mistake. Default is now NO file
// logging. Developers opt in with any truthy value; UI behavior is
// unaffected (controlled by DEBUG=opencode-claude-code separately).
function isTruthyEnv(v: string | undefined): boolean {
  if (v == null) return false
  const s = v.toLowerCase().trim()
  if (s === "") return false
  return s !== "0" && s !== "false" && s !== "no" && s !== "off"
}

const LOG_FILE_ENABLED = isTruthyEnv(process.env.OPENCODE_CLAUDE_CODE_LOG_FILE)

let fileLoggingDisabled = false

function rotateIfNeeded(): void {
  try {
    const stat = statSync(LOG_FILE)
    if (stat.size > MAX_LOG_BYTES) {
      renameSync(LOG_FILE, `${LOG_FILE}.1`)
    }
  } catch {
    // file does not exist yet — nothing to rotate
  }
}

function writeToFile(line: string): void {
  if (!LOG_FILE_ENABLED) return
  if (fileLoggingDisabled) return
  try {
    mkdirSync(dirname(LOG_FILE), { recursive: true })
    rotateIfNeeded()
    appendFileSync(LOG_FILE, line + "\n", "utf8")
  } catch {
    // Disable file logging on first failure to avoid spamming errors when
    // the FS is read-only (sandbox) or the path is otherwise unwritable.
    fileLoggingDisabled = true
  }
}

function fmt(level: string, msg: string, data?: Record<string, unknown>): string {
  const ts = new Date().toISOString()
  const base = `[${ts}] [opencode-claude-code] ${level}: ${msg}`
  if (data && Object.keys(data).length > 0) {
    return `${base} ${JSON.stringify(data)}`
  }
  return base
}

function emit(level: string, msg: string, data?: Record<string, unknown>, alwaysStderr = false): void {
  const line = fmt(level, msg, data)
  if (alwaysStderr || DEBUG) {
    console.error(line)
  }
  writeToFile(line)
}

export const log = {
  info(msg: string, data?: Record<string, unknown>) {
    if (DEBUG) emit("INFO", msg, data)
    else writeToFile(fmt("INFO", msg, data))
  },
  notice(msg: string, data?: Record<string, unknown>) {
    // NOTICE = always-on file log but never console. opencode's TUI surfaces
    // plugin stderr as a UI warning, so anything we send to console.error
    // becomes a yellow warning bubble. Reserve that for warn/error.
    emit("NOTICE", msg, data, false)
  },
  warn(msg: string, data?: Record<string, unknown>) {
    emit("WARN", msg, data, true)
  },
  error(msg: string, data?: Record<string, unknown>) {
    emit("ERROR", msg, data, true)
  },
  debug(msg: string, data?: Record<string, unknown>) {
    if (DEBUG) emit("DEBUG", msg, data)
    else writeToFile(fmt("DEBUG", msg, data))
  },
}
