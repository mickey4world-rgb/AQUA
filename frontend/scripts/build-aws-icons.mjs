/**
 * One-shot: extract curated AWS icons → PNG + TS.
 * Run from frontend/: node scripts/build-aws-icons.mjs
 */
import fs from "fs";
import path from "path";
import sharp from "sharp";

const root = path.resolve(
  ".tmp-aws-icons/Architecture-Service-Icons_07312026",
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
  lambda: "Arch_AWS-Lambda_64.svg",
  "api-gateway": "Arch_Amazon-API-Gateway_64.svg",
  cloudfront: "Arch_Amazon-CloudFront_64.svg",
  alb: "Arch_Elastic-Load-Balancing_64.svg",
  ec2: "Arch_Amazon-EC2_64.svg",
  "ecs-fargate": "Arch_AWS-Fargate_64.svg",
  ecs: "Arch_Amazon-Elastic-Container-Service_64.svg",
  eks: "Arch_Amazon-Elastic-Kubernetes-Service_64.svg",
  s3: "Arch_Amazon-Simple-Storage-Service_64.svg",
  rds: "Arch_Amazon-RDS_64.svg",
  dynamodb: "Arch_Amazon-DynamoDB_64.svg",
  aurora: "Arch_Amazon-Aurora_64.svg",
  elasticache: "Arch_Amazon-ElastiCache_64.svg",
  cognito: "Arch_Amazon-Cognito_64.svg",
  "secrets-manager": "Arch_AWS-Secrets-Manager_64.svg",
  kms: "Arch_AWS-Key-Management-Service_64.svg",
  bedrock: "Arch_Amazon-Bedrock_64.svg",
  opensearch: "Arch_Amazon-OpenSearch-Service_64.svg",
  sqs: "Arch_Amazon-Simple-Queue-Service_64.svg",
  sns: "Arch_Amazon-Simple-Notification-Service_64.svg",
  eventbridge: "Arch_Amazon-EventBridge_64.svg",
  "step-functions": "Arch_AWS-Step-Functions_64.svg",
  cloudwatch: "Arch_Amazon-CloudWatch_64.svg",
  waf: "Arch_AWS-WAF_64.svg",
  route53: "Arch_Amazon-Route-53_64.svg",
  vpc: "Arch_Amazon-Virtual-Private-Cloud_64.svg",
  ecr: "Arch_Amazon-Elastic-Container-Registry_64.svg",
  amplify: "Arch_AWS-Amplify_64.svg",
  "elastic-beanstalk": "Arch_AWS-Elastic-Beanstalk_64.svg",
  users: "Arch_AWS-Identity-and-Access-Management_64.svg",
};

const outDir = path.resolve("public/docs/aws-icons");
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
    "AWS Architecture Icons © Amazon Web Services.",
    "Used under AWS Architecture Icons terms:",
    "https://aws.amazon.com/architecture/icons/",
    "Source pack: Icon-package_07312026 (d1.awsstatic.com).",
    "",
  ].join("\n"),
);

let ts =
  "/** Auto-generated from AWS Architecture Icons (2026-07-31 pack). Do not edit by hand. */\n";
ts += "/** Terms: https://aws.amazon.com/architecture/icons/ */\n";
ts += "export const DOCS_AWS_ICON_PNG: Record<string, string> = {\n";
for (const [k, v] of Object.entries(data)) {
  ts += `  ${JSON.stringify(k)}: ${JSON.stringify(v)},\n`;
}
ts += "};\n";
fs.writeFileSync(path.resolve("lib/server/docs-aws-icons-data.ts"), ts);
console.log("done services=", Object.keys(data).length);
