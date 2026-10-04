# 商品データ仕様（data/items.json）

商品情報の**原本は `data/items.json` の1ファイルだけ**です。サイトの画面（`index.html` / `item.html`）はこのファイルを読み込んで表示します。同じ情報を別のファイルに書き写さないでください。

## ファイル全体の構成

```jsonc
{
  "meta": { "title": "...", "schemaVersion": 1, "updatedAt": "2026-10-02" },
  "categories": [ { "id": "book", "idPrefix": "BOOK", "label": "カードダス関連資料", "description": "..." } ],
  "items": [ { /* 商品1件分 */ } ]
}
```

- `meta.updatedAt` … データを更新したらこの日付も更新します（フッターに表示）。
- `categories` … カテゴリーを増やすときはここに1行追加します。
  - `"inSummary": false` を付けたカテゴリーは「情報のみ掲載（収集予定）」として扱い、トップのコレクション概要（所持率・点数）の集計に含めません。一覧では所持状況の代わりに「情報のみ」と表示します。現在は `capsule`（ドラゴンボールカプセル）が該当。

## 商品1件の項目

| 項目 | 意味 | 例・ルール |
|---|---|---|
| `id` | 管理ID（一意） | `BOOK-001`、`FC-007`、`SFC-001`。カテゴリーの `idPrefix` + 3桁の連番。一度付けたIDは変更・再利用しない（※2026-10-03 の初期整理時のみ、発売順に振り直した） |
| `category` | カテゴリー | `book`（カードダス関連資料）/ `famicom`（ファミコン）/ `sfc`（スーパーファミコン）/ `capsule`（ドラゴンボールカプセル、管理ID `DBC-`） |
| `title` | 正式名称 | 画面にそのまま表示 |
| `release` | 発売日・発売年 | 下記「情報項目」形式。値は `1996-02-01` / `1991-04` / `1991` |
| `publisher` | 出版社・メーカー | 情報項目形式 |
| `isbn` | ISBN（書籍） | 情報項目形式 |
| `modelNumber` | 型番（ゲーム等） | 情報項目形式 |
| `platform` | 対応機種（ゲーム） | 情報項目形式 |
| `genre` | ジャンル（ゲーム） | 情報項目形式。表記は `RPG` / `対戦格闘` / `アクション` などにそろえる |
| `listPrice` | 発売時の価格 | 情報項目形式。値は円の整数（例 `5830`）。税込・税抜の別は `note` に書く。中古相場とは別物 |
| `contents` | 商品内容（フィギュア等） | 情報項目形式。`capsule` で使用（全何種・ボーナスパーツ等）。詳細画面では価格を「メーカー希望小売価格」として表示 |
| `market` | 相場の自動取得の検索条件 | `{ "query": "検索語", "mustInclude": ["必ず含む語（正規表現）"], "exclude": ["除外する語"] }`。詳しくは下の「相場の自動取得」 |
| `ownership` | 所持状況 | `{ "status": "unconfirmed", "checkedAt": null, "note": "" }` |
| `condition` | 商品の状態 | `box`（箱）/ `manual`（説明書）/ `obi`（帯）/ `extras`（付属品・付属カード）/ `overall`（全体）/ `note`。未確認は `null` |
| `purchases` | 購入記録（複数可） | 下記参照 |
| `marketPrices` | 中古相場の調査記録（複数可） | 下記参照 |
| `references` | 項目に紐づかない参考URL | `[{ "title": "...", "url": "..." }]` |
| `images` | 画像 | `[{ "path": "assets/images/items/FC-001/front.jpg", "caption": "箱の表" }]`。管理IDのフォルダに置く。先頭の1枚が一覧のサムネイルになる。未所持品の参考画像には `"kind": "reference"` を付ける（画面に「参考画像」と表示） |
| `alerts` | 要確認事項 | 文字列の配列。一覧と詳細に「要確認」として表示 |
| `notes` | メモ | 自由記述 |
| `history` | 変更履歴 | `[{ "date": "2026-10-02", "change": "収集対象として登録" }]` |

### 情報項目（release / publisher / isbn / modelNumber / platform / genre / listPrice）

推測で埋めず、情報の確かさを `status` で区別します。

```json
{
  "value": "1996-02-01",
  "status": "reference",
  "sources": [ { "title": "紀伊國屋書店 商品ページ", "url": "https://..." } ],
  "note": "現物の奥付とは未照合"
}
```

| status | 画面表示 | 使う場面 |
|---|---|---|
| `unconfirmed` | 未確認 | まだ調べていない／確認できない（`value` は `null`） |
| `reference` | 参考情報・要確認 | 書店・データベース・ファンサイトなど二次資料の情報 |
| `confirmed` | 確認済み | 現物（奥付・箱）や公式情報で確認できた |

### 所持状況（ownership.status）

| 値 | 画面表示 |
|---|---|
| `unconfirmed` | 未確認（初期値） |
| `not_owned` | 未所持 |
| `ordered` | 購入手続き中 |
| `owned` | 所持 |

**オーナー本人が確認するまで `unconfirmed` のままにします。** 変更したら `checkedAt` に確認日を入れます。

### 購入記録（purchases の1件）

```json
{ "date": "2026-10-10", "price": 3500, "shipping": 520, "shop": "〇〇（ネットオークション）", "note": "箱・説明書付き" }
```

金額は円の数値（カンマなし）。分からない項目は `null`。

### 相場情報（marketPrices の1件）

```json
{
  "surveyedAt": "2026-10-02",
  "priceMin": 2000,
  "priceMax": 4000,
  "condition": "箱・説明書付き",
  "basis": "過去30日の落札価格5件",
  "source": { "title": "調査したページ名", "url": "https://..." },
  "note": ""
}
```

- `surveyedAt`（調査日）と、`source` か `basis`（根拠）は**必須**です（チェックスクリプトで検査）。
- 古い記録は消さずに追加していきます。画面では調査日の新しい順に並び、最新以外は「過去の記録」と表示されます。

## 相場の自動取得（data/market-history.json）

`tools/market/collect.mjs` が GitHub Actions（`.github/workflows/market.yml`）で **1日1回（朝6時ごろ）** 実行され、`data/market-history.json` に追記する。**このファイルは手で編集しない。**

- 対象：`items.json` で `market` を設定した商品。
- 取得元：ヤフオク（落札済み）・駿河屋（出品中）・ブックオフ（出品中）は公開ページ、楽天市場（出品中）は公式API。メルカリは対象外。
- 1件の記録：`{ "date", "id", "source", "kind": "sold"|"listing", "count", "min", "median", "max", "searchUrl", "samples" }`。
- 検索結果のうち `mustInclude` をすべて含み、`exclude` とまとめ売り等を含まない出品だけを集計する。
- `meta.lastRun` に最後の実行結果（サイトごとの成功・取得しない理由・失敗）を残す。

手で調べた相場は、これまでどおり `items.json` の `marketPrices` に記録する（自動取得とは別管理）。
