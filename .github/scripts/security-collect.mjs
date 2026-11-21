// セキュリティ日次診断の材料を集めて stdout に JSON で出す（依存パッケージなし）。
// 取れなかった情報源は collections に ok:false で残し、「問題なし」に見せない。
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const checkedAt = () => new Date().toISOString();

const repo = process.env.GITHUB_REPOSITORY;
const ghToken = process.env.GITHUB_TOKEN;
const alertsToken = process.env.SECURITY_ALERTS_TOKEN || "";
const runUrl = process.env.GITHUB_SERVER_URL && process.env.GITHUB_RUN_ID
  ? `${process.env.GITHUB_SERVER_URL}/${repo}/actions/runs/${process.env.GITHUB_RUN_ID}`
  : null;
const AUDIT_DIRS = ["frontend", "gemini-proxy", "tools/kabu-bridge", "tools"];

const findings = [];
const collections = [];

async function gh(path, token) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

function ghsaFromUrl(url) {
  const m = /(GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4})/i.exec(url ?? "");
  return m ? m[1].toUpperCase() : null;
}

function collectNpmAudit() {
  let total = 0;
  const errors = [];
  for (const dir of AUDIT_DIRS) {
    if (!existsSync(join(dir, "package-lock.json"))) continue;
    let stdout = "";
    try {
      // 本番に載る依存だけを見る。開発ツール（eslint 等）の DoS 系は公開サイトから突けず、毎日「要確認」に張り付くと警告が無視される
      stdout = execFileSync("npm", ["audit", "--json", "--package-lock-only", "--omit=dev"], {
        cwd: dir,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        maxBuffer: 32 * 1024 * 1024,
      });
    } catch (error) {
      // 脆弱性があると exit 1 だが stdout に JSON は出る
      stdout = error.stdout ?? "";
    }
    let report;
    try {
      report = JSON.parse(stdout);
    } catch {
      errors.push(`${dir}: JSON を取得できず`);
      continue;
    }
    if (report.error) {
      errors.push(`${dir}: ${report.error.summary ?? "npm audit エラー"}`);
      continue;
    }
    for (const [name, vuln] of Object.entries(report.vulnerabilities ?? {})) {
      for (const via of vuln.via ?? []) {
        if (typeof via !== "object" || !via) continue;
        const id = ghsaFromUrl(via.url) ?? `npm-${via.source ?? name}`;
        findings.push({
          source: "npm-audit",
          id,
          title: via.title ?? `${name} の脆弱性`,
          severity: via.severity ?? vuln.severity ?? "unknown",
          packageName: via.name ?? name,
          manifest: `${dir}/package-lock.json`,
          fixAvailable: vuln.fixAvailable === false ? false : Boolean(vuln.fixAvailable),
          firstSeenAt: null,
          url: via.url ?? null,
        });
        total += 1;
      }
    }
  }
  collections.push({
    source: "npm-audit",
    ok: errors.length === 0,
    count: total,
    error: errors.length ? errors.join(" / ") : null,
    checkedAt: checkedAt(),
  });
}

/**
 * Dependabot 未接続時の代替: 開発依存も含めた npm audit。
 * 警戒レベルは上げない（開発ツールの DoS は公開サイトから突けない）が、件数と確認時刻は残す。
 */
function auditIncludingDev() {
  const ids = [];
  const errors = [];
  for (const dir of AUDIT_DIRS) {
    if (!existsSync(join(dir, "package-lock.json"))) continue;
    let stdout = "";
    try {
      stdout = execFileSync("npm", ["audit", "--json", "--package-lock-only"], {
        cwd: dir,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        maxBuffer: 32 * 1024 * 1024,
      });
    } catch (error) {
      stdout = error.stdout ?? "";
    }
    try {
      const report = JSON.parse(stdout);
      for (const [name, vuln] of Object.entries(report.vulnerabilities ?? {})) {
        for (const via of vuln.via ?? []) {
          if (typeof via !== "object" || !via) continue;
          ids.push(`${via.name ?? name}:${ghsaFromUrl(via.url) ?? via.source ?? "?"}`);
        }
      }
    } catch {
      errors.push(`${dir}: JSON を取得できず`);
    }
  }
  const unique = [...new Set(ids)];
  return {
    label: "npm audit（開発依存を含む全依存）",
    ok: errors.length === 0 && unique.length === 0,
    count: unique.length,
    checkedAt: checkedAt(),
    detail:
      errors.length > 0
        ? errors.join(" / ")
        : unique.length === 0
          ? "全依存で既知の脆弱性なし"
          : `該当 ${unique.length} 件（Dependabot の自動修正 PR で解消予定）: ${unique.slice(0, 5).join(", ")}`,
  };
}

/** 追跡中ファイルから代表的な秘密情報の形を探す（中身はログにも API にも出さない） */
const SECRET_PATTERNS = [
  { name: "AWS アクセスキー", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "GitHub トークン", re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { name: "Google API キー", re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: "Azure ストレージキー", re: /AccountKey=[A-Za-z0-9+/]{40,}={0,2}/ },
  { name: "秘密鍵", re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: "Slack トークン", re: /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/ },
];

function scanTrackedSecrets() {
  let files = [];
  try {
    files = execFileSync("git", ["ls-files"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
      .split("\n")
      .filter(Boolean)
      .filter((f) => !/\.(png|jpe?g|gif|webp|ico|pdf|woff2?|ttf|zip|gz|glb|bin|wasm|mp4|mp3)$/i.test(f))
      .filter((f) => !f.endsWith("package-lock.json"));
  } catch {
    return {
      label: "追跡ファイルの秘密情報パターン走査",
      ok: false,
      count: 0,
      checkedAt: checkedAt(),
      detail: "git ls-files に失敗",
    };
  }
  const hits = [];
  for (const file of files) {
    let text = "";
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    if (text.length > 2_000_000) continue;
    for (const p of SECRET_PATTERNS) {
      if (p.re.test(text)) hits.push(`${p.name}@${file}`);
    }
  }
  return {
    label: `追跡ファイル ${files.length} 件の秘密情報パターン走査＋GitHub プッシュ保護`,
    ok: hits.length === 0,
    count: hits.length,
    checkedAt: checkedAt(),
    detail:
      hits.length === 0
        ? "秘密情報の形をしたものは見つかりません"
        : `疑いあり ${hits.length} 件: ${hits.slice(0, 5).join(", ")}`,
  };
}

async function collectCodeScanning() {
  const { status, body } = await gh(`/repos/${repo}/code-scanning/alerts?state=open&per_page=100`, ghToken);
  if (status !== 200 || !Array.isArray(body)) {
    collections.push({
      source: "code-scanning",
      ok: false,
      count: 0,
      error: `HTTP ${status}${body?.message ? `: ${body.message}` : ""}`.slice(0, 200),
      checkedAt: checkedAt(),
    });
    return;
  }
  for (const alert of body) {
    findings.push({
      source: "code-scanning",
      id: `codeql-${alert.number}`,
      title: alert.rule?.description ?? alert.rule?.id ?? "コード解析の指摘",
      severity: alert.rule?.security_severity_level ?? alert.rule?.severity ?? "unknown",
      packageName: alert.most_recent_instance?.location?.path ?? null,
      manifest: null,
      fixAvailable: null,
      firstSeenAt: alert.created_at ?? null,
      url: alert.html_url ?? null,
    });
  }
  collections.push({ source: "code-scanning", ok: true, count: body.length, checkedAt: checkedAt() });
}

async function collectDependabot() {
  if (!alertsToken) {
    collections.push({
      source: "dependabot",
      ok: false,
      optional: true,
      count: 0,
      error: "未接続（SECURITY_ALERTS_TOKEN 未設定）",
      checkedAt: checkedAt(),
      alternative: auditIncludingDev(),
    });
    return;
  }
  const { status, body } = await gh(`/repos/${repo}/dependabot/alerts?state=open&per_page=100`, alertsToken);
  if (status !== 200 || !Array.isArray(body)) {
    collections.push({
      source: "dependabot",
      ok: false,
      count: 0,
      error: `HTTP ${status}${body?.message ? `: ${body.message}` : ""}`.slice(0, 200),
      checkedAt: checkedAt(),
      alternative: auditIncludingDev(),
    });
    return;
  }
  for (const alert of body) {
    findings.push({
      source: "dependabot",
      id: alert.security_advisory?.ghsa_id ?? `dependabot-${alert.number}`,
      title: alert.security_advisory?.summary ?? "依存パッケージの脆弱性",
      severity: alert.security_advisory?.severity ?? "unknown",
      packageName: alert.dependency?.package?.name ?? null,
      manifest: alert.dependency?.manifest_path ?? null,
      fixAvailable: alert.security_vulnerability?.first_patched_version ? true : false,
      firstSeenAt: alert.created_at ?? null,
      url: alert.html_url ?? null,
    });
  }
  collections.push({ source: "dependabot", ok: true, count: body.length, checkedAt: checkedAt() });
}

async function collectSecretScanning() {
  if (!alertsToken) {
    collections.push({
      source: "secret-scanning",
      ok: false,
      optional: true,
      count: 0,
      error: "未接続（SECURITY_ALERTS_TOKEN 未設定）",
      checkedAt: checkedAt(),
      alternative: scanTrackedSecrets(),
    });
    return;
  }
  const { status, body } = await gh(`/repos/${repo}/secret-scanning/alerts?state=open&per_page=100`, alertsToken);
  if (status !== 200 || !Array.isArray(body)) {
    collections.push({
      source: "secret-scanning",
      ok: false,
      count: 0,
      error: `HTTP ${status}${body?.message ? `: ${body.message}` : ""}`.slice(0, 200),
      checkedAt: checkedAt(),
      alternative: scanTrackedSecrets(),
    });
    return;
  }
  for (const alert of body) {
    findings.push({
      source: "secret-scanning",
      id: `secret-${alert.number}`,
      title: alert.secret_type_display_name ?? alert.secret_type ?? "秘密情報",
      severity: "critical",
      packageName: null,
      manifest: null,
      fixAvailable: true,
      firstSeenAt: alert.created_at ?? null,
      url: alert.html_url ?? null,
    });
  }
  collections.push({ source: "secret-scanning", ok: true, count: body.length, checkedAt: checkedAt() });
}

function prLabelNames(pr) {
  return Array.isArray(pr.labels) ? pr.labels.map((l) => l.name) : [];
}

function isAutoSecurityPr(pr) {
  const labels = prLabelNames(pr);
  if (pr.user?.login === "dependabot[bot]") return true;
  if (labels.includes("platform-versions")) return true;
  if (labels.includes("security") && labels.includes("dependencies")) return true;
  return false;
}

function autoPatchKind(pr) {
  const labels = prLabelNames(pr);
  if (labels.includes("platform-versions")) return "platform";
  return "dependency";
}

async function collectOpenSecurityPrs() {
  const { status, body } = await gh(`/repos/${repo}/pulls?state=open&per_page=100`, ghToken);
  if (status !== 200 || !Array.isArray(body)) return [];
  return body
    .filter(isAutoSecurityPr)
    .map((pr) => ({
      number: pr.number,
      title: pr.title,
      url: pr.html_url,
      createdAt: pr.created_at,
      kind: autoPatchKind(pr),
    }));
}

/** 直近14日にマージされた自動パッチ（Dependabot / ホスト揃え） */
async function collectAppliedAutoPatches() {
  const sinceMs = Date.now() - 14 * 24 * 3_600_000;
  const { status, body } = await gh(
    `/repos/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=100`,
    ghToken,
  );
  if (status !== 200 || !Array.isArray(body)) return [];
  return body
    .filter((pr) => {
      if (!pr.merged_at) return false;
      if (Date.parse(pr.merged_at) < sinceMs) return false;
      return isAutoSecurityPr(pr);
    })
    .map((pr) => ({
      number: pr.number,
      title: pr.title,
      url: pr.html_url,
      mergedAt: pr.merged_at,
      kind: autoPatchKind(pr),
    }))
    .slice(0, 40);
}

/** SWA が許す Node 上限とリポジトリ内ピンのズレ（ソース依存以外のホスト制約） */
function collectPlatformRuntime() {
  let report;
  try {
    const stdout = execFileSync(
      "npx",
      ["--yes", "tsx", "frontend/scripts/platform-version-align.ts"],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        maxBuffer: 4 * 1024 * 1024,
      },
    );
    report = JSON.parse(stdout);
  } catch (error) {
    const stdout = error.stdout ?? "";
    try {
      report = JSON.parse(stdout);
    } catch {
      collections.push({
        source: "platform-runtime",
        ok: false,
        count: 0,
        error: "ホスト版の判定に失敗",
        checkedAt: checkedAt(),
      });
      return;
    }
  }
  const behind = Array.isArray(report?.behind) ? report.behind : [];
  const ahead = Array.isArray(report?.ahead) ? report.ahead : [];
  const misaligned = [...behind, ...ahead];
  const target = report?.targetMajor;
  if (report?.ok === false || target == null) {
    collections.push({
      source: "platform-runtime",
      ok: false,
      count: 0,
      error: report?.parseError ?? "SWA 上限を取得できず",
      checkedAt: checkedAt(),
    });
    return;
  }
  for (const pin of misaligned) {
    findings.push({
      source: "platform-runtime",
      id: `node-${pin.path}-${pin.major ?? "unknown"}`,
      title:
        pin.major != null && pin.major > target
          ? `Node ${pin.major} が SWA 上限 ${target} を超えています（${pin.path}）`
          : `Node を ${target} に揃えられます（いま ${pin.major} / ${pin.path}）`,
      severity: pin.major != null && pin.major > target ? "medium" : "low",
      packageName: "node",
      manifest: pin.path,
      fixAvailable: true,
      firstSeenAt: null,
      url: report.docsUrl ?? null,
    });
  }
  collections.push({
    source: "platform-runtime",
    ok: misaligned.length === 0,
    count: misaligned.length,
    error:
      misaligned.length === 0
        ? null
        : `SWA 上限 Node ${target} に対し未揃え ${misaligned.length} 箇所（自動揃え workflow あり）`,
    checkedAt: checkedAt(),
  });
}

// ---- 世界の重要セキュリティ問題（毎日取得） ----
const KEV_URL = "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json";
const KEV_DAYS = 30;
const GHSA_DAYS = 14;
const NODE_SECURITY_DAYS = 60;

function lockfilePackages() {
  const names = new Map();
  for (const dir of AUDIT_DIRS) {
    const lock = join(dir, "package-lock.json");
    if (!existsSync(lock)) continue;
    try {
      const json = JSON.parse(readFileSync(lock, "utf8"));
      for (const [key, meta] of Object.entries(json.packages ?? {})) {
        const idx = key.lastIndexOf("node_modules/");
        if (idx < 0) continue;
        const name = key.slice(idx + "node_modules/".length);
        if (!names.has(name)) names.set(name, meta?.version ?? null);
      }
    } catch {
      // 壊れたロックは npm audit 側の失敗として出る
    }
  }
  return names;
}

function nodeMajorFromConfig() {
  try {
    const cfg = JSON.parse(readFileSync("frontend/staticwebapp.config.json", "utf8"));
    const m = /node:(\d+)/.exec(cfg?.platform?.apiRuntime ?? "");
    if (m) return Number(m[1]);
  } catch {
    // 既定値へ
  }
  return 22;
}

async function fetchJson(url, headers = {}) {
  const res = await fetch(url, {
    headers: { "User-Agent": "aqua-security-daily", ...headers },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function collectWorldFeed() {
  const fetchedAt = checkedAt();
  const sources = [];
  const items = [];
  const pkgs = lockfilePackages();
  const nodeMajor = nodeMajorFromConfig();

  try {
    const kev = await fetchJson(KEV_URL);
    const since = Date.now() - KEV_DAYS * 864e5;
    const recent = (kev.vulnerabilities ?? [])
      .filter((v) => Date.parse(v.dateAdded) >= since)
      .sort((a, b) => String(b.dateAdded).localeCompare(String(a.dateAdded)));
    for (const v of recent) {
      const product = String(v.product ?? "");
      const lockName = product.toLowerCase().replace(/\s+/g, "-");
      items.push({
        origin: "cisa-kev",
        id: v.cveID,
        title: v.vulnerabilityName ?? `${v.vendorProject} ${product}`,
        vendor: v.vendorProject ?? null,
        product,
        publishedAt: v.dateAdded,
        severity: "critical",
        summary: String(v.shortDescription ?? "").slice(0, 300),
        ransomware: v.knownRansomwareCampaignUse === "Known",
        packageName: pkgs.has(lockName) ? lockName : null,
        installedVersion: pkgs.get(lockName) ?? null,
        url: `https://nvd.nist.gov/vuln/detail/${v.cveID}`,
      });
    }
    sources.push({ source: "cisa-kev", ok: true, count: recent.length, checkedAt: checkedAt(), catalogVersion: kev.catalogVersion ?? null });
  } catch (error) {
    sources.push({ source: "cisa-kev", ok: false, count: 0, checkedAt: checkedAt(), error: String(error.message).slice(0, 120) });
  }

  try {
    const releases = await fetchJson("https://nodejs.org/dist/index.json");
    const since = Date.now() - NODE_SECURITY_DAYS * 864e5;
    const security = releases.filter((r) => r.security && Date.parse(r.date) >= since);
    const byMajor = new Map();
    for (const r of security) {
      const major = Number(String(r.version).replace(/^v/, "").split(".")[0]);
      if (!byMajor.has(major)) byMajor.set(major, r);
    }
    for (const [major, r] of byMajor) {
      items.push({
        origin: "nodejs",
        id: `nodejs-${r.version}`,
        title: `Node.js ${r.version} セキュリティ更新`,
        vendor: "Node.js",
        product: `Node.js ${major}`,
        nodeMajor: major,
        publishedAt: r.date,
        severity: "high",
        summary: `Node.js ${major} 系のセキュリティ修正版 ${r.version}`,
        packageName: null,
        installedVersion: null,
        url: "https://nodejs.org/en/blog/vulnerability",
      });
    }
    sources.push({ source: "nodejs", ok: true, count: byMajor.size, checkedAt: checkedAt() });
  } catch (error) {
    sources.push({ source: "nodejs", ok: false, count: 0, checkedAt: checkedAt(), error: String(error.message).slice(0, 120) });
  }

  try {
    const sinceDate = new Date(Date.now() - GHSA_DAYS * 864e5).toISOString().slice(0, 10);
    let scanned = 0;
    for (const severity of ["critical", "high"]) {
      const list = await fetchJson(
        `https://api.github.com/advisories?ecosystem=npm&severity=${severity}&published=>=${sinceDate}&per_page=100`,
        {
          Accept: "application/vnd.github+json",
          ...(ghToken ? { Authorization: `Bearer ${ghToken}` } : {}),
        },
      );
      for (const a of Array.isArray(list) ? list : []) {
        scanned += 1;
        const names = (a.vulnerabilities ?? []).map((v) => v.package?.name).filter(Boolean);
        const hit = names.find((n) => pkgs.has(n));
        if (!hit) continue;
        items.push({
          origin: "ghsa-npm",
          id: a.ghsa_id,
          title: a.summary ?? `${hit} の脆弱性`,
          vendor: "npm",
          product: hit,
          publishedAt: String(a.published_at ?? "").slice(0, 10),
          severity,
          summary: String(a.summary ?? "").slice(0, 300),
          packageName: hit,
          installedVersion: pkgs.get(hit) ?? null,
          url: a.html_url ?? `https://github.com/advisories/${a.ghsa_id}`,
        });
      }
    }
    sources.push({ source: "ghsa-npm", ok: true, count: scanned, checkedAt: checkedAt() });
  } catch (error) {
    sources.push({ source: "ghsa-npm", ok: false, count: 0, checkedAt: checkedAt(), error: String(error.message).slice(0, 120) });
  }

  return { fetchedAt, nodeMajor, sources, items: items.slice(0, 120) };
}

collectNpmAudit();
await collectCodeScanning();
await collectDependabot();
await collectSecretScanning();
collectPlatformRuntime();
const worldFeed = await collectWorldFeed();
const openSecurityPrs = await collectOpenSecurityPrs();
const appliedAutoPatches = await collectAppliedAutoPatches();

process.stdout.write(
  JSON.stringify({ findings, collections, openSecurityPrs, appliedAutoPatches, worldFeed, runUrl }),
);