import { execSync } from "node:child_process";
import { readFileSync, readdirSync, mkdtempSync, copyFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir, homedir } from "node:os";
import { pbkdf2Sync, createDecipheriv } from "node:crypto";
import Database from "better-sqlite3";

// ── Types ──────────────────────────────────────────────────────────────────

export interface SlackWorkspaceCredentials {
  teamId: string;
  teamName: string;
  userId: string;
  token: string; // xoxc-...
}

export interface DesktopCredentials {
  workspaces: SlackWorkspaceCredentials[];
  cookie: string; // decrypted d cookie
  error?: string;
}

// ── Constants ──────────────────────────────────────────────────────────────

const SLACK_BASE = join(
  homedir(),
  "Library",
  "Application Support",
  "Slack"
);

const LEVELDB_DIR = join(SLACK_BASE, "Local Storage", "leveldb");
const COOKIES_DB = join(SLACK_BASE, "Cookies");

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

// ── Cache ──────────────────────────────────────────────────────────────────

let cachedCredentials: DesktopCredentials | null = null;
let cachedAt = 0;

// ── LevelDB Token Extraction ───────────────────────────────────────────────

/**
 * Copies LevelDB files to a temp dir and scans for xoxc- tokens and nearby
 * team metadata. LevelDB binary framing corrupts the JSON, so we use pattern
 * matching on the surrounding bytes rather than JSON parsing.
 */
function extractTokensFromLevelDB(): SlackWorkspaceCredentials[] {
  const tmp = mkdtempSync(join(tmpdir(), "slack-ldb-"));
  const workspaces: SlackWorkspaceCredentials[] = [];

  try {
    const files = readdirSync(LEVELDB_DIR).filter(
      (f) => f.endsWith(".ldb") || f.endsWith(".log")
    );

    for (const file of files) {
      copyFileSync(join(LEVELDB_DIR, file), join(tmp, file));
    }

    for (const file of files) {
      const buf = readFileSync(join(tmp, file));
      const content = buf.toString("utf-8");

      // Scan for xoxc- tokens and extract team info from surrounding bytes
      const tokenMatches = [...content.matchAll(/xoxc-[0-9A-Za-z-]+/g)];
      for (const tokenMatch of tokenMatches) {
        const token = tokenMatch[0];
        if (workspaces.some((w) => w.token === token)) continue;

        const idx = tokenMatch.index ?? 0;
        const nearby = content.substring(
          Math.max(0, idx - 500),
          Math.min(content.length, idx + 500)
        );

        // Extract user_id (reliable — appears as "user_id":"U...")
        const userMatch = nearby.match(/"user_id"\s*:\s*"(U[A-Z0-9]+)"/);
        const userId = userMatch?.[1] ?? "unknown";

        // Extract team name (appears as "name":"..." near the token)
        const nameMatch = nearby.match(/"name"\s*:\s*"([^"]+)"/);
        const teamName = nameMatch?.[1] ?? "unknown";

        // Extract team ID: appears as the key in {"teams":{"T...
        // Match T-prefixed IDs, but exclude ones that are substrings of user IDs
        const tIdCandidates = [...new Set(nearby.match(/T[A-Z0-9]{6,}/g) || [])];
        const teamId = tIdCandidates.find(
          (t) => !userId.includes(t)
        ) ?? tIdCandidates[0];

        if (teamId) {
          workspaces.push({ teamId, teamName, userId, token });
        }
      }
    }
  } finally {
    // Clean up temp files
    try {
      for (const f of readdirSync(tmp)) unlinkSync(join(tmp, f));
      unlinkSync(tmp);
    } catch {
      // best effort cleanup
    }
  }

  // Dedupe by teamId, preferring the longest token (most likely current)
  const byTeam = new Map<string, SlackWorkspaceCredentials>();
  for (const ws of workspaces) {
    const existing = byTeam.get(ws.teamId);
    if (!existing || ws.token.length > existing.token.length) {
      byTeam.set(ws.teamId, ws);
    }
  }

  return Array.from(byTeam.values());
}

// ── Cookie Decryption ──────────────────────────────────────────────────────

/**
 * Copies the Slack Cookies SQLite DB, extracts the encrypted `d` cookie for
 * .slack.com, and decrypts it using the Keychain password.
 *
 * Chromium encryption on macOS:
 *   - Password from Keychain ("Slack Safe Storage" / "Slack Key")
 *   - PBKDF2(password, "saltysalt", 1003, 16, SHA-1) → AES key
 *   - AES-128-CBC, IV = 16 space chars (0x20), ciphertext prefixed with "v10"
 */
function decryptDCookie(): string {
  // Copy Cookies DB to temp to avoid SQLite locking issues
  const tmp = join(tmpdir(), `slack-cookies-${Date.now()}.db`);
  try {
    copyFileSync(COOKIES_DB, tmp);

    const cookiesDb = new Database(tmp, { readonly: true });
    try {
      const row = cookiesDb
        .prepare(
          `SELECT encrypted_value FROM cookies
           WHERE host_key = '.slack.com' AND name = 'd'
           ORDER BY last_access_utc DESC LIMIT 1`
        )
        .get() as { encrypted_value: Buffer } | undefined;

      if (!row?.encrypted_value) {
        throw new Error("d cookie not found in Slack Cookies DB");
      }

      const encrypted = row.encrypted_value;

      // Get Keychain password
      const password = execSync(
        'security find-generic-password -s "Slack Safe Storage" -a "Slack Key" -w',
        { encoding: "utf-8" }
      ).trim();

      // Derive key with PBKDF2
      const key = pbkdf2Sync(password, "saltysalt", 1003, 16, "sha1");

      // Strip "v10" prefix (3 bytes) from ciphertext
      const ciphertext = encrypted.subarray(3);

      // Decrypt AES-128-CBC with IV of 16 space chars
      const iv = Buffer.alloc(16, 0x20);
      const decipher = createDecipheriv("aes-128-cbc", key, iv);
      const decrypted = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]);

      // The first CBC block decrypts to garbage; the real cookie value
      // starts at "xoxd-". Extract from that point and strip any stray bytes.
      const raw = decrypted.toString("utf-8");
      const xoxdIdx = raw.indexOf("xoxd-");
      if (xoxdIdx === -1) {
        throw new Error("Decrypted cookie does not contain xoxd- prefix");
      }
      return raw.substring(xoxdIdx).replace(/[^\x20-\x7E]/g, "");
    } finally {
      cookiesDb.close();
    }
  } finally {
    try {
      unlinkSync(tmp);
    } catch {
      // best effort
    }
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Returns desktop credentials (workspaces + cookie). Cached for 30 minutes.
 * Never throws — returns an error string on failure.
 */
export function getDesktopCredentials(
  forceRefresh = false
): DesktopCredentials {
  if (
    !forceRefresh &&
    cachedCredentials &&
    Date.now() - cachedAt < CACHE_TTL_MS
  ) {
    return cachedCredentials;
  }

  try {
    const workspaces = extractTokensFromLevelDB();
    if (workspaces.length === 0) {
      return { workspaces: [], cookie: "", error: "No xoxc tokens found in Slack desktop storage" };
    }

    const cookie = decryptDCookie();

    cachedCredentials = { workspaces, cookie };
    cachedAt = Date.now();
    return cachedCredentials;
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Unknown error reading Slack desktop credentials";
    // Redact cookie values from error messages
    const safeMsg = msg.replace(/xoxd-[A-Za-z0-9%/+=]+/g, "xoxd-[REDACTED]");
    return { workspaces: [], cookie: "", error: safeMsg };
  }
}

/**
 * Clears the credential cache. Called on auth failure for retry.
 */
export function clearDesktopCredentials(): void {
  cachedCredentials = null;
  cachedAt = 0;
}
