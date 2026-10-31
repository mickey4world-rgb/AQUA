/**
 * 送信元 IP の解決。Cloudflare をフロントに置くと x-azure-clientip が
 * Cloudflare エッジの IP になるため、その場合だけ cf-connecting-ip を信用する。
 * Cloudflare 以外から来た cf-connecting-ip は偽装できるので無視する。
 */

const CLOUDFLARE_IPV4_CIDRS = [
  "173.245.48.0/20",
  "103.21.244.0/22",
  "103.22.200.0/22",
  "103.31.4.0/22",
  "141.101.64.0/18",
  "108.162.192.0/18",
  "190.93.240.0/20",
  "188.114.96.0/20",
  "197.234.240.0/22",
  "198.41.128.0/17",
  "162.158.0.0/15",
  "104.16.0.0/13",
  "104.24.0.0/14",
  "172.64.0.0/13",
  "131.0.72.0/22",
] as const;

const CLOUDFLARE_IPV6_PREFIXES = [
  "2400:cb00:",
  "2606:4700:",
  "2803:f800:",
  "2405:b500:",
  "2405:8100:",
  "2a06:98c0:",
  "2a06:98c1:",
  "2a06:98c2:",
  "2a06:98c3:",
  "2a06:98c4:",
  "2a06:98c5:",
  "2a06:98c6:",
  "2a06:98c7:",
  "2c0f:f248:",
] as const;

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    value = value * 256 + n;
  }
  return value;
}

function inIpv4Cidr(ip: number, cidr: string): boolean {
  const [base, bitsText] = cidr.split("/");
  const baseInt = ipv4ToInt(base);
  const bits = Number(bitsText);
  if (baseInt == null) return false;
  const size = 2 ** (32 - bits);
  return ip >= baseInt && ip < baseInt + size;
}

/** "1.2.3.4:5678" / "[2001:db8::1]:443" / "a, b" を素の IP にする */
export function normalizeIp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let value = raw.split(",")[0]?.trim() ?? "";
  if (!value) return null;
  if (value.startsWith("[")) {
    const end = value.indexOf("]");
    value = end > 0 ? value.slice(1, end) : value.slice(1);
  } else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(value)) {
    value = value.slice(0, value.lastIndexOf(":"));
  }
  value = value.toLowerCase().slice(0, 64);
  return value || null;
}

export function isCloudflareIp(ip: string | null | undefined): boolean {
  const normalized = normalizeIp(ip);
  if (!normalized) return false;
  if (normalized.includes(":")) {
    return CLOUDFLARE_IPV6_PREFIXES.some((prefix) => normalized.startsWith(prefix));
  }
  const asInt = ipv4ToInt(normalized);
  if (asInt == null) return false;
  return CLOUDFLARE_IPV4_CIDRS.some((cidr) => inIpv4Cidr(asInt, cidr));
}

/** 共有されうるアドレス（不明・社内・ループバック）は個人識別に使わない */
export function isIndividualPublicIp(ip: string): boolean {
  if (!ip || ip === "unknown") return false;
  if (ip.includes(":")) {
    return !(ip === "::1" || ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80"));
  }
  const asInt = ipv4ToInt(ip);
  if (asInt == null) return false;
  return ![
    "10.0.0.0/8",
    "172.16.0.0/12",
    "192.168.0.0/16",
    "127.0.0.0/8",
    "169.254.0.0/16",
    "100.64.0.0/10",
  ].some((cidr) => inIpv4Cidr(asInt, cidr));
}

export function resolveClientIp(headers: Headers): string {
  const azure = normalizeIp(headers.get("x-azure-clientip"));
  const forwarded = normalizeIp(headers.get("x-forwarded-for"));
  const edge = azure ?? forwarded;
  const cloudflareClient = normalizeIp(headers.get("cf-connecting-ip"));
  if (edge && cloudflareClient && isCloudflareIp(edge)) {
    return cloudflareClient;
  }
  return edge ?? "unknown";
}
