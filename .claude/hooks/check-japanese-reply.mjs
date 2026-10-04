// 返答が日本語で書かれているかを確認する Stop フック（Node.js 版。Windows・Mac・クラウドで共通に動く）。
//
// オーナーへの返答（最後のユーザー発言以降に Claude が書いた文章）を集め、
// コード・URL・ファイル名などを除いたうえで日本語の文字の割合を調べる。
// 英語が大半を占める場合は返答を差し止め、日本語で書き直すよう指示する。
import { readFileSync } from "node:fs";

const MIN_LATIN = 40; // 英字がこれ未満の短い返答は判定しない
const MIN_JA_RATIO = 0.35; // 日本語の文字の割合がこれ未満なら英語の返答とみなす

const JA_RE = /[぀-ヿ㐀-鿿ｦ-ﾟ]/g;
const LATIN_RE = /[A-Za-z]/g;

// ツール結果ではない、オーナー本人の発言かどうか
function isRealUserMessage(entry) {
  if (entry.type !== "user") return false;
  const content = entry.message?.content;
  if (typeof content === "string") return true;
  if (Array.isArray(content)) return content.some((c) => c && c.type === "text");
  return false;
}

function collectReplyText(transcriptPath) {
  const entries = [];
  for (const line of readFileSync(transcriptPath, "utf-8").split("\n")) {
    try {
      entries.push(JSON.parse(line));
    } catch {
      // 壊れた行・空行は飛ばす
    }
  }
  const texts = [];
  for (const entry of entries.reverse()) {
    if (isRealUserMessage(entry)) break;
    if (entry.type !== "assistant") continue;
    const content = entry.message?.content;
    for (const c of Array.isArray(content) ? content : []) {
      if (c && c.type === "text") texts.push(c.text || "");
    }
  }
  return texts.reverse().join("\n");
}

function stripNonProse(text) {
  return text
    .replace(/```[\s\S]*?```/g, " ") // コードブロック
    .replace(/`[^`]*`/g, " ") // インラインコード
    .replace(/https?:\/\/\S+/g, " ") // URL
    .replace(/[\p{L}\p{N}_./-]+\.(?:html|json|md|js|css|jpg|png|webp|py|mjs)\b/gu, " "); // ファイル名
}

function main() {
  let data;
  try {
    data = JSON.parse(readFileSync(0, "utf-8"));
  } catch {
    return;
  }
  if (data.stop_hook_active) return; // 書き直し後の再チェックでは止めない（無限ループ防止）
  if (!data.transcript_path) return;
  let prose;
  try {
    prose = stripNonProse(collectReplyText(data.transcript_path));
  } catch {
    return;
  }
  const ja = (prose.match(JA_RE) || []).length;
  const latin = (prose.match(LATIN_RE) || []).length;
  if (latin < MIN_LATIN) return;
  if (ja / (ja + latin) < MIN_JA_RATIO) {
    console.log(JSON.stringify({
      decision: "block",
      reason:
        "返答が英語で書かれています。オーナーは日本語での返答を求めています（CLAUDE.md の言語のルール）。" +
        "直前の返答の内容を、すべて日本語で書き直してオーナーに送ってください。",
    }));
  }
}

main();
