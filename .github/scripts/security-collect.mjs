// セキュリティ日次診断の材料を集めて stdout に JSON で出す（依存パッケージなし）。
// 取れなかった情報源は collections に ok:false で残し、「問題なし」に見せない。
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

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
      stdout = execFileSync("npm", ["audit", "--json", "--package-lock-only"], {
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
  });
}

async function collectCodeScanning() {
  const { status, body } = await gh(`/repos/${repo}/code-scanning/alerts?state=open&per_page=100`, ghToken);
  if (status !== 200 || !Array.isArray(body)) {
    collections.push({
      source: "code-scanning",
      ok: false,
      count: 0,
      error: `HTTP ${status}${body?.message ? `: ${body.message}` : ""}`.slice(0, 200),
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
  collections.push({ source: "code-scanning", ok: true, count: body.length });
}

async function collectDependabot() {
  if (!alertsToken) {
    collections.push({ source: "dependabot", ok: false, count: 0, error: "SECURITY_ALERTS_TOKEN 未設定" });
    return;
  }
  const { status, body } = await gh(`/repos/${repo}/dependabot/alerts?state=open&per_page=100`, alertsToken);
  if (status !== 200 || !Array.isArray(body)) {
    collections.push({ source: "dependabot", ok: false, count: 0, error: `HTTP ${status}${body?.message ? `: ${body.message}` : ""}`.slice(0, 200) });
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
  collections.push({ source: "dependabot", ok: true, count: body.length });
}

async function collectSecretScanning() {
  if (!alertsToken) {
    collections.push({ source: "secret-scanning", ok: false, count: 0, error: "SECURITY_ALERTS_TOKEN 未設定" });
    return;
  }
  const { status, body } = await gh(`/repos/${repo}/secret-scanning/alerts?state=open&per_page=100`, alertsToken);
  if (status !== 200 || !Array.isArray(body)) {
    collections.push({ source: "secret-scanning", ok: false, count: 0, error: `HTTP ${status}${body?.message ? `: ${body.message}` : ""}`.slice(0, 200) });
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
  collections.push({ source: "secret-scanning", ok: true, count: body.length });
}

async function collectOpenSecurityPrs() {
  const { status, body } = await gh(`/repos/${repo}/pulls?state=open&per_page=100`, ghToken);
  if (status !== 200 || !Array.isArray(body)) return [];
  return body
    .filter((pr) => pr.user?.login === "dependabot[bot]")
    .map((pr) => ({ number: pr.number, title: pr.title, url: pr.html_url, createdAt: pr.created_at }));
}

collectNpmAudit();
await collectCodeScanning();
await collectDependabot();
await collectSecretScanning();
const openSecurityPrs = await collectOpenSecurityPrs();

process.stdout.write(JSON.stringify({ findings, collections, openSecurityPrs, runUrl }));
