/**
 * AWS 構成図用アイコンレジストリ。
 * PNG は AWS Architecture Icons 公式パックから抽出（NOTICE 参照）。
 */

import { DOCS_AWS_ICON_PNG } from "@/lib/server/docs-aws-icons-data";

export const DOCS_AWS_SERVICE_IDS = [
  "lambda",
  "api-gateway",
  "cloudfront",
  "alb",
  "ec2",
  "ecs-fargate",
  "ecs",
  "eks",
  "s3",
  "rds",
  "dynamodb",
  "aurora",
  "elasticache",
  "cognito",
  "secrets-manager",
  "kms",
  "bedrock",
  "opensearch",
  "sqs",
  "sns",
  "eventbridge",
  "step-functions",
  "cloudwatch",
  "waf",
  "route53",
  "vpc",
  "ecr",
  "amplify",
  "elastic-beanstalk",
  "users",
] as const;

export type DocsAwsServiceId = (typeof DOCS_AWS_SERVICE_IDS)[number];

const ALIASES: Record<string, DocsAwsServiceId> = {
  "aws-lambda": "lambda",
  apigateway: "api-gateway",
  "api-gw": "api-gateway",
  cf: "cloudfront",
  "elbv2": "alb",
  "elastic-load-balancing": "alb",
  "application-load-balancer": "alb",
  "fargate": "ecs-fargate",
  "ecs-fargate-service": "ecs-fargate",
  "amazon-ecs": "ecs",
  "amazon-eks": "eks",
  "amazon-s3": "s3",
  "amazon-rds": "rds",
  "amazon-dynamodb": "dynamodb",
  ddb: "dynamodb",
  "amazon-aurora": "aurora",
  redis: "elasticache",
  "amazon-cognito": "cognito",
  secretsmanager: "secrets-manager",
  "amazon-bedrock": "bedrock",
  "amazon-opensearch": "opensearch",
  "amazon-sqs": "sqs",
  "amazon-sns": "sns",
  "amazon-eventbridge": "eventbridge",
  sfn: "step-functions",
  "amazon-cloudwatch": "cloudwatch",
  "aws-waf": "waf",
  "route-53": "route53",
  "amazon-vpc": "vpc",
  "amazon-ecr": "ecr",
  "aws-amplify": "amplify",
  beanstalk: "elastic-beanstalk",
  iam: "users",
};

export const DOCS_AWS_SERVICE_LABELS: Record<DocsAwsServiceId, string> = {
  lambda: "Lambda",
  "api-gateway": "API Gateway",
  cloudfront: "CloudFront",
  alb: "ALB",
  ec2: "EC2",
  "ecs-fargate": "Fargate",
  ecs: "ECS",
  eks: "EKS",
  s3: "S3",
  rds: "RDS",
  dynamodb: "DynamoDB",
  aurora: "Aurora",
  elasticache: "ElastiCache",
  cognito: "Cognito",
  "secrets-manager": "Secrets Manager",
  kms: "KMS",
  bedrock: "Bedrock",
  opensearch: "OpenSearch",
  sqs: "SQS",
  sns: "SNS",
  eventbridge: "EventBridge",
  "step-functions": "Step Functions",
  cloudwatch: "CloudWatch",
  waf: "WAF",
  route53: "Route 53",
  vpc: "VPC",
  ecr: "ECR",
  amplify: "Amplify",
  "elastic-beanstalk": "Elastic Beanstalk",
  users: "IAM",
};

export function isDocsAwsServiceId(value: string): value is DocsAwsServiceId {
  return (DOCS_AWS_SERVICE_IDS as readonly string[]).includes(value);
}

export function normalizeAwsServiceId(raw: string): DocsAwsServiceId | null {
  const key = raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/_/g, "-");
  if (isDocsAwsServiceId(key)) return key;
  const alias = ALIASES[key.replace(/^aws-/, "").replace(/^amazon-/, "")];
  if (alias) return alias;
  const compact = key.replace(/-/g, "");
  for (const [a, id] of Object.entries(ALIASES)) {
    if (a.replace(/-/g, "") === compact) return id;
  }
  return null;
}

export function getAwsIconPngBase64(service: string): string | null {
  const id = normalizeAwsServiceId(service);
  if (!id) return null;
  return DOCS_AWS_ICON_PNG[id] ?? null;
}

export function listAwsServicesForPrompt(): string {
  return DOCS_AWS_SERVICE_IDS.map(
    (id) => `${id}（${DOCS_AWS_SERVICE_LABELS[id]}）`,
  ).join(", ");
}
