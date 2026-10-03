/**
 * Note 討伐掛け合いの品質ルール（プロンプト共通）と軽い後処理。
 * 依頼: 意味不明たとえ／ルーナ口調／要点の掘り下げ／読者利点。
 */

export type DebateSpeaker = "sol" | "luna";

/** RPGたとえは必ずニュース意味とセット。単独の世界観フレーズは禁止／括弧の味付けのみ。 */
export const NOTE_DEBATE_METAPHOR_RULE = `## RPG変換ルール（味付け・翻訳必須）
経済・政治の硬い用語はゲームのギミックで楽しく言い換えてよい。ただし過激なたとえだけで終わらせない。
例（「たとえ → つまりニュースでは」のセット）※ブリーフィングにその話題があるときだけ使う:
- サプライチェーン寸断 → 補給線が塞がれる → つまり物流や部品の流れが滞る話
- インフレ長期化 → 宿代やポーション代が上がる呪い → つまり物価がじわじわ上がり続ける話
- 追加関税 → 通行税の壁 → つまり輸入コストや価格への圧が強まる話
- 金利・為替 → 魔力ゲージ／防衛結界 → つまりお金の借りやすさや通貨の揺らぎの話
- ポートフォリオ・資産 → サイフ／ギルド金庫 → つまり家計や投資の持ち分の話

**必須**: たとえを出す一文には、同じ文または直後の文で「つまり〜」「ニュースでは〜」と現実の意味を書く。
**禁止**: 「補給線の新たな流れを見極めると現場の動きが変わる予感。」のように、ゲーム語だけで締めてニュースの意味が消える文。
やむを得ず世界観だけの余韻を置くなら、全文を全角括弧で囲む（例: （補給線の霧が薄れた気がする、くらいの余韻。））。括弧の外に意味不明なたとえを置かない。
専門用語を使う場合は「（ゲーム言い換え）」を直後に付けてよい。
**禁止**: ブリーフィングに無い関税・通商・古いAI話題を、たとえが思い浮かぶからといって持ち出すこと。`;

/** 「要点は〜」と言ったら掘る。読者が得する視点を必ず1つ。 */
export const NOTE_DEBATE_STRUCTURE_RULE = `## 議論の骨格（全ターン・最重要）
1. **要点コミット**: 「要点は◯◯」「芯は◯◯」「大事なのは◯◯」と宣言したら、同じ発言内でその◯◯について
   - なぜそれが要点か（仕組み・誰の利害）
   - 具体的に何が起きうるか
   を**最低2文**で掘る。要点だけ投げて次の話題へ行かない。
2. **読者利点（必須1つ）**: 読んだ人が「読んでよかった」と思える実用を1つ入れる。例:
   - 明日どの指標／発表／価格を見ればよいか
   - 家計・仕事・投資のどこに効きうるか（煽らず短く）
   - 誤解しやすい点の訂正
   説教や精神論だけで終わらない。
3. **前半と後半の接続**: 前の発言が挙げた論点（例: 米国製プラットフォーム／規制／金利）を受けたら、その論点の考察を必ず入れる。無視して別話題へ飛ばない。`;

export const NOTE_DEBATE_FRESHNESS_RULE = `## 鮮度・事実ルール（最優先）
- 討伐対象ブロックに書かれた見出し・要点・報道日だけが「今日のニュース」。それ以外の一般知識で話を作らない。
- 「関税が燻っている」「AI規制が続いている」など半年前から続く背景だけでボスを語らない。今日の具体的な新事実に触れる。
- 数字・固有名詞・政策名はブリーフィングか直前の相手の発言に無いなら捏造しない。`;

export const NOTE_DEBATE_LUNA_SPEECH_RULE = `## ルーナの話し方（女の子・賢者・厳守）
- 一人称は「わたし」（たまに「あたし」可）。「俺」「僕」禁止
- 語尾はやわらかく知的に（ね／わ／よ／の／かしら／ですわ／と思うの、等）
- **絶対禁止**: 自己紹介や言い切りでの「ルーナだ。」「〜だぞ。」「〜だろう。」（男の子／硬すぎる断定口調）
- 言い切りは「ルーナよ。」「わたしよ。」「〜ね。」「〜わ。」「〜と思うの。」を使う
- 読者やソルを見下さない。冷たく煽らない`;

export const NOTE_DEBATE_SOL_CLUMSY_RULE = `## ソルのおっちょこちょい（中身のあるドジだけ）
- 許可: 具体的な早とちり・言い過ぎを1回し、すぐ自分で直す／ルーナに直される
- **禁止**: ニュースと無関係なメタ発言だけ（例:「おっちょこちょいの私がひとつだけ言い忘れないよう、注意するね。」）
- ドジはニュース理解を助ける演出。中身のない愛嬌トークで字数を稼がない`;

const RPG_SOLO_MARKERS =
  /補給線|魔力ゲージ|ポーション|通行税|宿代|サイフ|ギルド金庫|防衛結界|召喚獣|蒼竜|不死鳥/;

/** 意味ブリッジが無いゲーム語だけの文を全角括弧で包む */
export function wrapHollowRpgAsides(text: string): string {
  const parts = text.split(/(?<=[。！？\n])/);
  return parts
    .map((part) => {
      const trimmed = part.trim();
      if (!trimmed) return part;
      if (!RPG_SOLO_MARKERS.test(trimmed)) return part;
      if (
        /つまり|ニュースでは|現実では|報道|要するに|家計|投資|価格|規制|企業|読者/.test(
          trimmed,
        )
      ) {
        return part;
      }
      if (/^[（(]/.test(trimmed)) return part;
      const leadingWs = part.match(/^\s*/)?.[0] ?? "";
      const trailingWs = part.match(/\s*$/)?.[0] ?? "";
      const core = trimmed.replace(/^[（(]+|[）)]+$/g, "");
      return `${leadingWs}（${core}）${trailingWs}`;
    })
    .join("");
}

/** 中身のない「おっちょこちょいメタ」文を落とす */
export function stripHollowClumsyMeta(text: string): string {
  return text
    .split(/(?<=[。！？\n])/)
    .filter((part) => {
      const t = part.trim();
      if (!t) return true;
      const isMeta =
        /おっちょこちょいの私|ドジな私|抜けてる私|言い忘れないよう/.test(t) &&
        !/訂正|言い間違|間違えた|つまり|ニュース|見出し|数字/.test(t);
      return !isMeta;
    })
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** ルーナの硬い／男性的な言い切りをやわらかくする */
export function softenLunaSpeech(text: string): string {
  let out = text;
  out = out.replace(/ルーナだ([。！!]|$)/g, (_m, end: string) =>
    end ? `ルーナよ${end}` : "ルーナよ。",
  );
  out = out.replace(/わたしだ([。！!])/g, "わたしよ$1");
  out = out.replace(/あたしだ([。！!])/g, "あたしよ$1");
  out = out.replace(/だぞ([。！!])/g, "よ$1");
  out = out.replace(/だろう([。！!])/g, "でしょう$1");
  return out;
}

export function polishSystemDebateText(
  role: DebateSpeaker,
  text: string,
): string {
  let out = text.trim();
  if (!out) return out;
  out = stripHollowClumsyMeta(out);
  out = wrapHollowRpgAsides(out);
  if (role === "luna") {
    out = softenLunaSpeech(out);
  }
  return out.replace(/\n{3,}/g, "\n\n").trim();
}
