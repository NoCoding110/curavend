/**
 * SSRF guard for outbound calls to tenant/user-configured URLs.
 *
 * Integrations (Epic FHIR, vendor stock feeds, PO transmission, webhooks) let a
 * tenant admin store an arbitrary URL that the Worker then fetch()es. Without a
 * guard, an attacker could point those at internal addresses — cloud metadata
 * (169.254.169.254), localhost, or RFC-1918 ranges — to pivot into the
 * infrastructure. assertPublicHttpUrl() rejects anything that isn't a public
 * https?:// host; safeFetch() wraps fetch() with that check.
 *
 * Note: Cloudflare Workers fetch() cannot reach the host loopback/LAN of the
 * edge node, but it CAN reach internal services exposed publicly-by-DNS and is
 * the right place to enforce scheme + literal-IP hygiene regardless.
 */

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
]);

/** IPv4 literal → true if it falls in a private / loopback / link-local / reserved range. */
function isPrivateIpv4(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const o = m.slice(1).map((n) => parseInt(n, 10));
  if (o.some((n) => n > 255)) return true; // malformed → reject
  const [a, b] = o;
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 169 && b === 254) return true; // link-local incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  if (a >= 224) return true; // multicast / reserved
  return false;
}

/** Crude IPv6 private/loopback/link-local/ULA/metadata check on a bracket-stripped host. */
function isPrivateIpv6(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (!h.includes(':')) return false;
  if (h === '::1' || h === '::') return true; // loopback / unspecified
  if (h.startsWith('fe80')) return true; // link-local
  if (h.startsWith('fc') || h.startsWith('fd')) return true; // unique-local
  if (h.startsWith('::ffff:')) return isPrivateIpv4(h.slice(7)); // IPv4-mapped
  return false;
}

/**
 * Validate that `rawUrl` is a public http(s) URL safe to fetch. Throws on:
 * non-http(s) schemes, credentials in the URL, or private/loopback/link-local
 * literal IP hosts and known-internal hostnames. Returns the parsed URL.
 */
export function assertPublicHttpUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Blocked URL scheme: ${url.protocol}`);
  }
  if (url.username || url.password) {
    throw new Error('Credentials in URL are not allowed');
  }
  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host) || host.endsWith('.localhost')) {
    throw new Error('Blocked internal hostname');
  }
  if (isPrivateIpv4(host) || isPrivateIpv6(host)) {
    throw new Error('Blocked private/reserved IP address');
  }
  return url;
}

/** fetch() wrapper that SSRF-validates the URL first. */
export async function safeFetch(
  rawUrl: string,
  init?: RequestInit,
): Promise<Response> {
  assertPublicHttpUrl(rawUrl);
  return fetch(rawUrl, init);
}
