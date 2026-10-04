# 引き継ぎメモ（作業状況のまとめ）

セッション（Claude Code との会話）を切り替えるときに、ここまでの状況を引き継ぐためのメモ。
新しいセッションでは、まず CLAUDE.md とこのファイルを読む。最終更新：2026-10-04（デザイン刷新）。

## 1. サイトの現状

- 公開URL：https://28yu.github.io/DRAGON-BALL/（GitHub Pages、`main` ブランチのルート）
- リポジトリ：28yu/DRAGON-BALL（公開）。メールアドレス流出対策のため、履歴をきれいにした新リポジトリに移行済み。旧リポジトリは DRAGON-BALL-old（非公開）で、触らない。
- トップページのタイトル下の説明文（サブタイトル）は、オーナーの指示で削除済み（2026-10-03）。
- 商品詳細ページの構成：画像ギャラリー、基本情報、所持状況・商品の状態、購入記録、中古相場（手入力の調査記録）、相場の推移（自動取得）。

## 2. 収集対象（17点）の状況

| 管理ID | 商品 | 所持状況 | 画像 | 購入記録 |
|---|---|---|---|---|
| BOOK-001 | パーフェクトファイル PART1 | 所持 | 本人の写真1枚 | 2026-09-22 まんだらけ（オンライン）16,500円。帯・カード・ポスター付きの完品 |
| BOOK-002 | パーフェクトファイル PART2 | 未所持 | 参考画像 | なし |
| BOOK-003 | カードダス奥義大全書 | 所持（**未着**） | 参考画像 | 2026-10-03 駿河屋（Amazon出品）5,624円。届く前だがオーナー指示で「所持」 |
| FC-001 | 神龍の謎 | 所持 | 本人の写真15枚 | 2026-09-23 メルカリ 6,000円 |
| FC-002〜005 | 大魔王復活／悟空伝／強襲!サイヤ人／激神フリーザ!! | 未所持 | 参考画像 | なし |
| FC-006 | ZIII 烈戦人造人間 | 所持 | 本人の写真11枚 | 2026-09-16 メルカリ 2,980円 |
| FC-007 | Z外伝 サイヤ人絶滅計画 | 所持 | 参考画像（差し替え待ち） | 2026-10-03 まんだらけ中野店 6,600円（税込）。箱・説明書あり。写真は未撮影 |
| SFC-001〜007 | スーパーファミコン7作品 | 未所持（2026-10-04 オーナー申告） | 参考画像（2026-10-04 登録。SFC-006 は2枚） | なし |

## 3. オーナーからの連絡待ち

- **BOOK-003**：届いたら、状態・ポスター（「ウルトラZパワーポスター」）の有無・写真。写真が来たら参考画像を差し替える。
- **FC-007**：写真（未撮影）。写真が来たら参考画像を差し替え、状態を登録する。
- **BOOK-001**：送料（今は未確認）。
- 型番・正式表記・発売時価格（税込/税抜）の現物確認。

## 4. 相場の自動取得

- `.github/workflows/market.yml` が毎朝6:17（日本時間）に `tools/market/collect.mjs` を実行し、`data/market-history.json` を github-actions[bot] が `main` に直接記録する。
  - そのため、作業前・送信前に必ず `git pull --no-rebase origin main` で取り込む。
- `tools/market/**` か workflow ファイルを変えて `main` に送ると、その場で1回実行される。
- 手動での再実行（Run workflow）は、GitHub MCP からは権限エラー（403）でできない。
  - すぐ動かしたいときは、取得プログラムの意味のある修正を `main` に送るか、オーナーに Actions 画面の「Run workflow」を押してもらう。
  - 空のコミットで動かすのは禁止。
- 実行状況は `curl https://api.github.com/repos/28yu/DRAGON-BALL/actions/runs` で確認できる（公開リポジトリなので認証不要）。
- 取得元ごとの状況（2026-10-03 時点）：

| 取得元 | 状況 |
|---|---|
| ヤフオク（落札済み） | 動作中。ページ内の `__NEXT_DATA__` から読む |
| ブックオフ（出品中） | 動作中。`productItem__price` 欄から読む |
| 楽天市場（出品中） | 動作中（2026-10-03 から）。詳しくは下記 |
| 駿河屋 | robots.txt を確認できないため取得しない |
| メルカリ | 対象外（非公開の仕組みを回避しないと取得できないため） |

- 楽天市場の詳細：
  - 窓口は新API `https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701`（formatVersion=2）。
  - アプリIDとアクセスキーは GitHub Secrets（`RAKUTEN_APP_ID` / `RAKUTEN_ACCESS_KEY`）に登録済み。値はチャットにもリポジトリにも書かない。
  - Referer に `https://28yu.github.io/DRAGON-BALL/` を付けて送る。そのため、送信には fetch ではなく node:https を使っている。
  - 楽天側のアプリ設定は、タイプ「Webアプリケーション」、許可サイト `28yu.github.io`、スコープ「楽天市場API」のみ。
  - 旧版の 20220601 は「API Configuration not found」で使えない。
- 攻略本などが混ざらないよう、`items.json` の各商品の `market.exclude` で除外語を管理している。

## 5. 作業環境での注意（Claude Code 向け）

- 返答はすべて日本語。Stop フック（`.claude/hooks/check-japanese-reply.py`）が英語の返答を差し止める。
- 画像は Pillow で長辺1200px程度に縮小し、`assets/images/items/<管理ID>/front.jpg` などに置く。`.gitkeep` は画像を置いたら消す。
- ネットの画像を自分から探して保存しない。参考画像はオーナーが提供したものだけ、未所持品に `"kind": "reference"` で置く。
  - 例外：BOOK-003・FC-007 は「所持」だが、写真が届くまで参考画像のまま。
- 表示確認の手順：
  1. `python3 -m http.server 8765` をバックグラウンドで起動する。
  2. Playwright（`/opt/node22/lib/node_modules/playwright`）で PC 幅（1280px）とスマホ幅（390px）を確認する。
  3. サーバーの停止（`pkill -f "http.serve[r] 8765"`）は最後に単独で実行する。他のコマンドと一緒に実行すると、後続のコマンドも止まってしまう。
- `main` への送信手順：
  1. 作業ブランチでコミットする。
  2. `git pull --no-rebase origin main` で最新を取り込む。
  3. `node tools/validate.mjs` を実行する。
  4. 作業ブランチを送信する。
  5. `git branch -f main HEAD` のあと、`git push origin main` を実行する（オーナー承認済み）。
  - force push・履歴の書き換え（amend / rebase）はしない。

## 6. デザインの刷新（2026-10-04）

- Claude Design（claude.ai の Design キャンバス）で3案を作成し、オーナーが **案C「マンガ誌面」** を選んだ。
  - キャンバス（非公開）：https://claude.ai/artifact/E7EL5zKcjmidR5BbKrU1Jh（案A カプセル・ラボ／案B 8ビット冒険の書／案C マンガ誌面。各スマホ幅のトップ・詳細）
- 反映内容（作業ブランチ `claude/relaxed-dirac-cr1hoc`）：
  - `assets/css/style.css` を全面書き換え。クリーム色の紙・太い黒枠・ずらし影・オレンジの網点ヘッダー・斜めの黒帯見出し。色は今まで通り `:root` の変数で管理し、ダークモードも用意。
  - フォントは Google Fonts の Dela Gothic One（見出し）と Zen Kaku Gothic New（本文）。`index.html` / `item.html` で読み込む。
  - トップ：カテゴリーメニュー（`#cat-nav`、各カテゴリーへのリンク）、所持率の丸い表示、カテゴリー別の所持数カード（`assets/js/index.js`）。
  - 詳細：写真の角に所持状況のハンコ風表示（`ownershipStamp`、`assets/js/item.js`）。
  - データ・表示する情報（所持状況、確認状況のタグ、参考画像ラベル、相場表など）は変更なし。
- 2026-10-04 オーナーの OK を得て `main` に反映済み（[28yu/DRAGON-BALL#1](https://github.com/28yu/DRAGON-BALL/pull/1) の内容）。
- 表示確認の注意：確認用ブラウザ（Playwright）は外部サイトに直接つながらないため、Google Fonts は `page.route` で curl 経由の取得に差し替えて確認した。

## 7. 今後の候補

- 検索・絞り込み、相場推移グラフ、画像ギャラリーの改善
- 調査履歴（`docs/research-log.md`）の古い記述のうち、管理ID振り直し前のもの（例：「FC-006 超サイヤ伝説」）は当時の記録として残している。
