#!/usr/bin/env python3
"""返答が日本語で書かれているかを確認する Stop フック。

オーナーへの返答（最後のユーザー発言以降に Claude が書いた文章）を集め、
コード・URL・ファイル名などを除いたうえで日本語の文字の割合を調べる。
英語が大半を占める場合は返答を差し止め、日本語で書き直すよう指示する。
"""
import json
import re
import sys

MIN_LATIN = 40      # 英字がこれ未満の短い返答は判定しない
MIN_JA_RATIO = 0.35  # 日本語の文字の割合がこれ未満なら英語の返答とみなす

JA_RE = re.compile(r"[぀-ヿ㐀-鿿ｦ-ﾟ]")
LATIN_RE = re.compile(r"[A-Za-z]")


def is_real_user_message(entry):
    """ツール結果ではない、オーナー本人の発言かどうか。"""
    if entry.get("type") != "user":
        return False
    content = (entry.get("message") or {}).get("content")
    if isinstance(content, str):
        return True
    if isinstance(content, list):
        return any(isinstance(c, dict) and c.get("type") == "text" for c in content)
    return False


def collect_reply_text(transcript_path):
    entries = []
    with open(transcript_path, encoding="utf-8") as f:
        for line in f:
            try:
                entries.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    texts = []
    for entry in reversed(entries):
        if is_real_user_message(entry):
            break
        if entry.get("type") != "assistant":
            continue
        content = (entry.get("message") or {}).get("content") or []
        for c in content if isinstance(content, list) else []:
            if isinstance(c, dict) and c.get("type") == "text":
                texts.append(c.get("text", ""))
    return "\n".join(reversed(texts))


def strip_non_prose(text):
    text = re.sub(r"```.*?```", " ", text, flags=re.S)   # コードブロック
    text = re.sub(r"`[^`]*`", " ", text)                  # インラインコード
    text = re.sub(r"https?://\S+", " ", text)             # URL
    text = re.sub(r"\b[\w./-]+\.(?:html|json|md|js|css|jpg|png|webp|py|mjs)\b", " ", text)  # ファイル名
    return text


def main():
    try:
        data = json.load(sys.stdin)
    except json.JSONDecodeError:
        return 0
    if data.get("stop_hook_active"):
        return 0  # 書き直し後の再チェックでは止めない（無限ループ防止）
    path = data.get("transcript_path")
    if not path:
        return 0
    try:
        prose = strip_non_prose(collect_reply_text(path))
    except OSError:
        return 0
    ja = len(JA_RE.findall(prose))
    latin = len(LATIN_RE.findall(prose))
    if latin < MIN_LATIN:
        return 0
    if ja / (ja + latin) < MIN_JA_RATIO:
        print(json.dumps({
            "decision": "block",
            "reason": (
                "返答が英語で書かれています。オーナーは日本語での返答を求めています（CLAUDE.md の言語のルール）。"
                "直前の返答の内容を、すべて日本語で書き直してオーナーに送ってください。"
            ),
        }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
