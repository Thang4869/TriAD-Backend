import { isIP } from "node:net";

/**
 * Interpret TRUST_PROXY without accepting trust-all or ambiguous IPv6 CIDRs.
 *
 * Until proxy-addr is upgraded to >=2.0.8, IPv6 CIDR values are rejected:
 * a short IPv4-mapped IPv6 prefix can cause proxy-addr to trust every client
 * (GHSA-jqcg-44mw-7w3h). Prefer explicit IPv4 CIDRs / exact proxy addresses.
 */
export function parseTrustProxy(raw: string): number | string[] {
  const value = raw.trim();

  if (/^(0|[1-9]\d*)$/.test(value)) {
    const hops = Number(value);
    if (Number.isSafeInteger(hops) && hops <= 16) {
      return hops;
    }
    throw new Error("Invalid TRUST_PROXY: hop count must be between 0 and 16");
  }

  if (!value) {
    throw new Error("Invalid TRUST_PROXY: empty value");
  }

  const trusted = value.split(",").map((entry) => entry.trim());

  for (const entry of trusted) {
    if (entry === "loopback" || entry === "linklocal") {
      continue;
    }

    if (isIP(entry) !== 0) {
      continue;
    }

    const parts = entry.split("/");
    if (parts.length === 2) {
      const [ip, prefixText] = parts;
      if (
        isIP(ip) === 4 &&
        /^(0|[1-9]\d*)$/.test(prefixText) &&
        Number(prefixText) >= 1 &&
        Number(prefixText) <= 32
      ) {
        continue;
      }
    }

    throw new Error(
      "Invalid TRUST_PROXY: use a hop count, explicit proxy IPs, or IPv4 CIDRs; IPv6 CIDRs and trust-all proxies are not permitted",
    );
  }

  return trusted;
}
