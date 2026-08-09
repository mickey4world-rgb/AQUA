export type CouncilDepth = "compact" | "standard";

export const COUNCIL_DEPTH_CONFIG = {
  compact: {
    label: "簡潔（節約）",
    debaterIds: ["logic", "skeptic"] as const,
    includeRebuttal: false,
    // GPT-5 系は思考トークンを食うため、表示文字数より余裕を持たせる
    debaterMaxTokens: 900,
    judgeMaxTokens: 1200,
    debaterLengthHint: "80〜120文字。箇条書きは最大2点",
    judgeLengthHint: "150〜250文字。結論を先に",
    judgeInputMaxChars: 140,
    topicMaxLength: 600,
    apiCalls: 3,
  },
  standard: {
    label: "標準（詳細）",
    debaterIds: ["logic", "creative", "skeptic"] as const,
    includeRebuttal: true,
    debaterMaxTokens: 1400,
    judgeMaxTokens: 1800,
    debaterLengthHint: "200〜320文字",
    judgeLengthHint: "280〜450文字。箇条書き可",
    judgeInputMaxChars: 320,
    topicMaxLength: 1000,
    apiCalls: 7,
  },
} as const;

export function councilDepthConfig(depth: CouncilDepth) {
  return COUNCIL_DEPTH_CONFIG[depth];
}
