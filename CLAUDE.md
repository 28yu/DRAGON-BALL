# CLAUDE.md — 作業メモ（Claude Code 向け）

このリポジトリで作業するときに最初に読むファイル。**続けて `docs/handoff.md`（引き継ぎメモ：現在の状況・連絡待ち・次の目標）を読む。** 詳しい内容は README.md と docs/ を参照。

## 言語のルール（最優先）

- **オーナーへの返答・説明・報告は、必ずすべて日本語で書く。英語で書かない。**
- 作業の途中経過の一言（「次に〇〇を確認します」など）も日本語で書く。
- エラー内容や英語の画面表示を伝えるときも、日本語で意味を説明する（英語は「」で引用するだけにする）。
- 英語の通知（作業終了時の自動チェックなど）や英語の資料を読んだ直後も、返答は必ず日本語で書く。
- `.claude/settings.json` の `"language": "japanese"` でも返答言語を日本語に固定している。
- さらに、返答を終えるたびに `.claude/hooks/check-japanese-reply.py`（自動チェック）が動き、英語の返答は差し止められる。差し止められたら、同じ内容を日本語で書き直して送る。

## プロジェクト概要

- ドラゴンボール関連の個人コレクション管理サイト「DRAGON BALL COLLECTION」。
- HTML / CSS / JavaScript のみの静的サイト。GitHub Pages（`main` ブランチ / ルート）で公開。
- 公開URL: https://28yu.github.io/DRAGON-BALL/
- 収集対象：カードダス関連資料（BOOK-）、ファミコンソフト（FC-）、スーパーファミコンソフト（SFC-）。

## オーナーについて

- 開発初心者。説明は日本語で、専門用語には短い説明を添える。
- 自分で操作が必要な手順は、どの画面のどこを押すかまで具体的に書く。

## 守ること（重要）

- **商品データの原本は `data/items.json` だけ。** 同じ情報を他のファイルに書き写さない。
- **所持状況（`ownership.status`）はオーナーの確認なしに変更しない。** 初期値は `unconfirmed`。
- 推測で値を埋めない。分からない項目は `value: null` / `status: "unconfirmed"`。
- 調べた情報には出典URLを付ける。二次資料は `reference`、現物・公式で確認できたものだけ `confirmed`。
- 相場情報は必ず調査日と出典（または根拠）をセットで記録し、古い記録は消さない。
- 管理IDは一度付けたら変更・再利用しない。
- 画像は原則オーナーが撮影・作成したもののみ。例外として、未所持の商品に限りオーナーが提供した参考画像を置いてよい（`"kind": "reference"` を付け、画面に「参考画像」と表示。購入後に差し替える）。自分からネットの画像を探して保存しない。
- メールアドレスなどの個人情報・秘密情報をリポジトリに含めない。コミットの作成者メールは GitHub の noreply アドレスを使う。
- リポジトリの公開設定や GitHub Pages の設定は勝手に変更しない。

## 権限の設定（.claude/settings.json）

- オーナーの承認（2026-10-03）により、`main` への送信（`git push origin main`）とプルリクエストの取り込みを許可している。
- 過去の記録の書き換え・強制上書き（force push）は許可していない。必要な場合はオーナーに相談する。
- `main` に送る前に、必ずデータチェックと表示確認を行う。

## 作業の流れ

1. `data/items.json` などを編集する（項目の仕様は `docs/data-spec.md`）。
2. 変更した商品の `history` に1行追加し、`meta.updatedAt` を更新する。
3. `node tools/validate.mjs` でデータをチェックする（エラー0件を確認）。
4. `python3 -m http.server 8000` で表示を確認する（必要に応じて Playwright で PC 幅・スマホ幅の表示を確認）。
5. 調査をした場合は `docs/research-log.md` に経緯を追記する。
6. 作業ブランチにコミット・プッシュし、プルリクエストを作る。`main` への取り込みはオーナーの承認を得てから。

## ファイル構成

- `index.html` / `item.html`：トップページ / 商品詳細（`item.html?id=FC-001`）
- `assets/js/common.js`：データ読み込みと表示の共通処理
- `assets/js/index.js` / `assets/js/item.js`：各ページの表示処理
- `assets/css/style.css`：デザイン（色は `:root` の変数で管理）
- `assets/images/items/管理ID/`：オーナーが撮影・作成した画像（`front.jpg` など。命名ルールは同フォルダの README.md）
- `data/market-history.json`：相場の自動取得の記録（手で編集しない）
- `tools/market/collect.mjs` / `.github/workflows/market.yml`：相場の自動取得（1日1回、robots.txt を確認、メルカリは対象外）
- `docs/data-spec.md`：データ項目の仕様
- `docs/operation.md`：運用ルール
- `docs/research-log.md`：調査履歴
- `docs/handoff.md`：引き継ぎメモ（セッションを切り替えるときに更新する）
- `tools/validate.mjs`：データ整合性チェック

## 未対応・今後の候補

- 型番・正式表記・発売時価格の税込/税抜の確認（現物で確認予定）
- 検索・絞り込み、相場推移グラフ、画像ギャラリー
