# DRAGON-BALL
ドラゴンボールのカードダス関連資料・ファミコン／スーパーファミコンソフトの収集記録、購入履歴、相場、商品情報、出典を管理するリポジトリ。

このリポジトリには、収集対象を一覧・詳細表示する静的ウェブサイト **DRAGON BALL COLLECTION** が含まれています。サーバーやデータベースは不要で、GitHub Pages でそのまま公開できます。

> 本サイトは個人の収集記録であり、権利者・公式とは関係のない非公式サイトです。公式ロゴ・キャラクター画像は使用していません。

## フォルダ構成

```
DRAGON-BALL/
├── CLAUDE.md             Claude Code 向けの作業メモ（作業ルール・手順）
├── index.html            トップページ（概要・カテゴリー別一覧）
├── item.html             商品詳細ページ（item.html?id=FC-001 の形式で表示）
├── listings.html         出品中の一覧（ヤフオク・ブックオフ。毎朝更新。docs/listings.md）
├── dashboard.html        アクセス解析のダッシュボード（パスワード付き。docs/analytics.md）
├── data/
│   ├── items.json        商品データの原本（ここだけを編集する）
│   └── translations/en.json 英語表示用の対応表（日本語の文 → 英訳。docs/i18n.md）
├── assets/
│   ├── css/style.css     デザイン
│   ├── js/common.js      共通処理（データ読み込み・表示の部品）
│   ├── js/index.js       トップページの表示処理
│   ├── js/item.js        詳細ページの表示処理
│   ├── js/analytics.js   アクセスの記録
│   ├── js/i18n.js        日本語／英語の切り替え
│   ├── js/dashboard.js   ダッシュボードの表示処理
│   └── images/items/     商品画像（管理IDごとのフォルダ。例：FC-001/front.jpg）
├── docs/
│   ├── data-spec.md      データ項目の仕様（どの項目に何を書くか）
│   ├── operation.md      運用ルール（更新手順・調査方針・相場/画像のルール）
│   ├── research-log.md   調査履歴（いつ何を調べたか）
│   ├── analytics.md      アクセス解析の仕組み・記録する内容
│   ├── i18n.md           日本語／英語の切り替えの仕組み
│   └── handoff.md        引き継ぎメモ（現在の状況・連絡待ち・次の目標）
├── supabase/migrations/  アクセス解析のデータベース（Supabase）の設定の記録
├── .github/workflows/
│   └── market.yml        中古相場の自動取得（毎朝6時ごろ）
└── tools/
    ├── validate.mjs      データのチェックスクリプト
    ├── market/collect.mjs 中古相場の自動取得プログラム
    └── market/listings.mjs 出品中の一覧の自動取得プログラム
```

**ポイント：商品情報は `data/items.json` の1ファイルにまとめています。** 画面（HTML）は表示だけを担当し、データを変えれば画面も自動で変わります。購入記録・相場情報・画像の場所も、すべて商品ごとに `items.json` の中に記録します。

## 技術構成

- HTML / CSS / JavaScript のみ（フレームワーク・ビルド作業なし）
- 収集対象が十数点〜数十点程度の一覧・詳細表示なら、React などを入れなくても十分に実現でき、ファイルを直接編集するだけで管理できるため、シンプルな構成を採用しています。
- 将来、検索・絞り込み・相場グラフなどを追加する場合も、この構成のまま JavaScript を追加して対応できます。

## ローカルでの確認方法

ブラウザの安全上の制限により、`index.html` をダブルクリックで開くと商品データ（JSON）を読み込めません。簡易サーバーを起動して確認します。

1. ターミナル（Mac は「ターミナル」、Windows は「PowerShell」）でこのフォルダに移動します。
   ```bash
   cd DRAGON-BALL
   ```
2. 次のどちらかで簡易サーバーを起動します（Python か Node.js のどちらかが入っていればOK）。
   ```bash
   python3 -m http.server 8000
   # または
   npx serve -l 8000
   ```
   ※ Windows で `python3` が見つからない場合は `python -m http.server 8000` を試してください。
3. ブラウザで <http://localhost:8000/> を開きます。
4. 終了するときはターミナルで `Ctrl + C` を押します。

## データの更新方法

1. `data/items.json` をテキストエディタ（VS Code など）で編集します。項目の意味は [docs/data-spec.md](docs/data-spec.md) を参照してください。
2. チェックスクリプトで書き間違いがないか確認します（Node.js が必要）。
   ```bash
   node tools/validate.mjs
   ```
   `✓ データに問題はありません` と出ればOKです。
3. ローカルで表示を確認し、コミット・プッシュします。

詳しい手順やルールは [docs/operation.md](docs/operation.md) にまとめています。

### よくある更新の例

- **所持状況を登録する：** 該当商品の `"ownership": { "status": "unconfirmed", ... }` を `"owned"`（所持）または `"not_owned"`（未所持）に変え、`checkedAt` に確認日（例 `"2026-10-05"`）を入れる。
- **写真を追加する：** 画像を `assets/images/items/FC-001/front.jpg` のように管理IDのフォルダに置き、`"images": [ { "path": "assets/images/items/FC-001/front.jpg", "caption": "箱の表" } ]` と書く。ファイル名のルールは `assets/images/items/README.md` を参照。
- **購入記録・相場を追加する：** `purchases` / `marketPrices` に1件ずつ追加する（書き方は data-spec.md）。

## GitHub Pages での公開方法

ページ内のリンクや読み込みはすべて相対パス（`data/items.json` など）なので、`https://28yu.github.io/DRAGON-BALL/` のようなサブフォルダ形式のURLでもそのまま動作します。

公開する場合の手順（リポジトリの所有者が GitHub 上で操作します）：

1. 作業ブランチの変更を `main` ブランチに取り込む（プルリクエストをマージ）。
2. GitHub のリポジトリページで **Settings → Pages** を開く。
3. **Build and deployment** の **Source** を「Deploy from a branch」にし、Branch を `main`、フォルダを `/ (root)` にして **Save**。
4. 数分後、同じ画面に公開URLが表示されます。

注意：
- GitHub Pages で公開したページは、**誰でも閲覧できる状態**になります（無料プランではリポジトリを公開設定にする必要があります）。購入価格など、公開したくない情報を書く前に検討してください。
- APIキーやパスワードなどの秘密情報はこのリポジトリに書かないでください。
