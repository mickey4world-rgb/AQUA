/**
 * One-shot: extract curated Azure icons from Microsoft V19 pack → PNG + TS.
 * Run from frontend/: node scripts/build-azure-icons.mjs
 */
import fs from "fs";
import path from "path";
import sharp from "sharp";

const root = path.resolve(
  ".tmp-azure-icons/Azure_Public_Service_Icons/Icons",
);

function find(fileName) {
  const hits = [];
  function walk(d) {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (ent.name === fileName) hits.push(p);
    }
  }
  walk(root);
  return hits[0];
}

const map = {
  "app-service": "10035-icon-service-App-Services.svg",
  "function-apps": "10029-icon-service-Function-Apps.svg",
  "static-web-apps": "01007-icon-service-Static-Apps.svg",
  "api-management": "10042-icon-service-API-Management-Services.svg",
  "front-door": "10073-icon-service-Front-Door-and-CDN-Profiles.svg",
  "app-gateway": "10076-icon-service-Application-Gateways.svg",
  "load-balancer": "10062-icon-service-Load-Balancers.svg",
  "cosmos-db": "10121-icon-service-Azure-Cosmos-DB.svg",
  "sql-database": "10130-icon-service-SQL-Database.svg",
  postgres: "10131-icon-service-Azure-Database-PostgreSQL-Server.svg",
  storage: "10086-icon-service-Storage-Accounts.svg",
  "key-vault": "10245-icon-service-Key-Vaults.svg",
  "entra-id": "10225-icon-service-Enterprise-Applications.svg",
  users: "10230-icon-service-Users.svg",
  openai: "03438-icon-service-Azure-OpenAI.svg",
  "cognitive-services": "10162-icon-service-Cognitive-Services.svg",
  "ai-studio": "03513-icon-service-AI-Studio.svg",
  aks: "10023-icon-service-Kubernetes-Services.svg",
  "container-apps": "02989-icon-service-Container-Apps-Environments.svg",
  "container-instances": "10104-icon-service-Container-Instances.svg",
  "container-registry": "10105-icon-service-Container-Registries.svg",
  vm: "10021-icon-service-Virtual-Machine.svg",
  vnet: "10061-icon-service-Virtual-Networks.svg",
  firewall: "10084-icon-service-Firewalls.svg",
  monitor: "00001-icon-service-Monitor.svg",
  "app-insights": "00012-icon-service-Application-Insights.svg",
  "log-analytics": "00009-icon-service-Log-Analytics-Workspaces.svg",
  "event-hubs": "00039-icon-service-Event-Hubs.svg",
  "service-bus": "10836-icon-service-Azure-Service-Bus.svg",
  "logic-apps": "02631-icon-service-Logic-Apps.svg",
  "data-factory": "10126-icon-service-Data-Factories.svg",
  redis: "10137-icon-service-Cache-Redis.svg",
  search: "10044-icon-service-Cognitive-Search.svg",
  cdn: "00056-icon-service-CDN-Profiles.svg",
  "resource-group": "10007-icon-service-Resource-Groups.svg",
  subscription: "10002-icon-service-Subscriptions.svg",
};

const outDir = path.resolve("public/docs/azure-icons");
fs.mkdirSync(outDir, { recursive: true });

const data = {};
for (const [id, fileName] of Object.entries(map)) {
  const src = find(fileName);
  if (!src) {
    console.error("MISSING", id, fileName);
    continue;
  }
  const png = await sharp(src, { density: 300 })
    .resize(128, 128, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  fs.writeFileSync(path.join(outDir, `${id}.png`), png);
  data[id] = png.toString("base64");
  console.log("ok", id, png.length);
}

fs.writeFileSync(
  path.join(outDir, "NOTICE.txt"),
  [
    "Azure product icons © Microsoft.",
    "Used under Azure Architecture Icons terms:",
    "https://learn.microsoft.com/azure/architecture/icons/",
    "Source pack: Azure_Public_Service_Icons_V19 (arch-center.azureedge.net).",
    "",
  ].join("\n"),
);

let ts =
  "/** Auto-generated from Microsoft Azure Architecture Icons V19. Do not edit by hand. */\n";
ts += "/** Terms: https://learn.microsoft.com/azure/architecture/icons/ */\n";
ts += "export const DOCS_AZURE_ICON_PNG: Record<string, string> = {\n";
for (const [k, v] of Object.entries(data)) {
  ts += `  ${JSON.stringify(k)}: ${JSON.stringify(v)},\n`;
}
ts += "};\n";
fs.writeFileSync(path.resolve("lib/server/docs-azure-icons-data.ts"), ts);
console.log("done services=", Object.keys(data).length);
