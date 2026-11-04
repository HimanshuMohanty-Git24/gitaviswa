const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function hostnameOf(hostHeader: string | null): string | null {
  if (!hostHeader) return null;
  try {
    return new URL(`http://${hostHeader}`).hostname;
  } catch {
    return null;
  }
}

/**
 * True only for requests made to and from this machine: loopback Host, a same-origin Origin header (CSRF guard)
 * and no non-loopback proxy hop. Used to gate writes to .env.local, custom LLM base URLs and Neo4j credentials.
 */
export function isLocalRequest(req: Request): boolean {
  const host = hostnameOf(req.headers.get("host"));
  if (!host || !LOOPBACK.has(host)) return false;
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      if (!LOOPBACK.has(new URL(origin).hostname)) return false;
    } catch {
      return false;
    }
  }
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd && !fwd.split(",").every((ip) => ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(ip.trim()))) return false;
  return true;
}

/**
 * Keys in the server's environment (.env.local, .env, the host's settings) serve only requests from this machine,
 * so a public deployment never spends its owner's key on visitors. GITAVISWA_SHARE_SERVER_KEYS=true opts in.
 */
export function serverKeysAllowed(req: Request): boolean {
  return process.env.GITAVISWA_SHARE_SERVER_KEYS === "true" || isLocalRequest(req);
}

export function envWriteAllowed(): { allowed: boolean; reason?: string } {
  if (process.env.NODE_ENV !== "production") return { allowed: true };
  if (process.env.GITAVISWA_ALLOW_ENV_WRITE === "true") return { allowed: true };
  return { allowed: false, reason: "Production build: set GITAVISWA_ALLOW_ENV_WRITE=true to let the app update .env.local." };
}
