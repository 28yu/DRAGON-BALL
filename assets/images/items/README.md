# 商品画像の置き場所

商品ごとに、管理IDと同じ名前のフォルダに画像を入れます。

```
assets/images/items/
├── BOOK-001/
│   ├── front.jpg
│   └── back.jpg
├── FC-001/
│   ├── front.jpg
│   ├── back.jpg
│   └── cartridge.jpg
└── …
```

## ファイル名のルール

| ファイル名 | 内容 |
|---|---|
| `front.jpg` | 表（本の表紙・箱の表）。**一覧ページのサムネイルに使う** |
| `back.jpg` | 裏（裏表紙・箱の裏） |
| `set.jpg` | セット一式（箱・本体・付属品を並べたもの） |
| `spine-1.jpg`, `spine-2.jpg` … | 背表紙・箱の側面 |
| `flap-1.jpg` … | 箱のフタ |
| `cartridge.jpg` / `cartridge-back.jpg` | カセット本体の表 / 裏（ゲームのみ） |
| `cartridge-top-1.jpg` … | カセットの上部ラベル |
| `cartridge-tray.jpg` | 内トレイに入れた状態 |
| `terminal-1.jpg` … | カセットの端子部分 |
| `manual.jpg` / `manual-back.jpg` | 説明書の表紙 / 裏表紙 |
| `inserts.jpg` / `inserts-back.jpg` | 付属品（チラシ・ハガキなど）の表 / 裏 |
| `obi.jpg` | 帯（本のみ） |
| `extra-1.jpg`, `extra-2.jpg` … | その他（傷のアップなど） |

- 半角の英小文字・数字・ハイフン（`-`）だけを使う（日本語やスペースは使わない）。
- 形式は `.jpg`（写真）を基本とし、`.png` / `.webp` も可。
- 同じ商品を複数持っている場合は `front-2.jpg` のように番号を付ける。

## 参考画像（未所持の商品のみ）

まだ持っていない商品は、オーナーが用意した参考画像（ネット上の画像など）を `front.jpg` として置いてよい。
`data/items.json` には `"kind": "reference"` を付けて登録する（画面の「参考画像」表示は 2026-10-05 オーナー指示で非表示）。購入して自分で撮影したら差し替える。

## 画像の大きさ

- 長い辺が **1200px 程度** になるよう縮小してから保存する（スマートフォンの写真そのままだと重くなるため）。
- 1枚あたり **500KB 程度まで** が目安。

## 画像を追加したあと

画像を置いただけではサイトに表示されません。`data/items.json` の該当商品の `images` に登録が必要です。

```json
"images": [
  { "path": "assets/images/items/FC-001/front.jpg", "caption": "箱の表" },
  { "path": "assets/images/items/FC-001/back.jpg", "caption": "箱の裏" }
]
```

登録は Claude に「FC-001 の画像を追加したので登録して」と頼めば対応します。

## オーナーのPCから写真を登録する（_inbox フォルダ）

オーナーのPC（`C:\GitHub\DRAGON-BALL`）で Claude を動かしているときは、次の流れで登録する。

1. オーナーが、リポジトリ直下の `_inbox/` フォルダに写真を入れる（フォルダが無ければ作る）。
   - 商品ごとにサブフォルダを作ると分かりやすい（例：`_inbox/FC-007/`）。
2. オーナーが Claude に「_inbox の写真を FC-007 に登録して」のように頼む。
3. Claude は写真を確認し、長辺1200px程度・500KB程度に縮小し、撮影位置などの情報（Exif）を取り除いてから、`assets/images/items/管理ID/` に命名ルールどおりの名前で保存する。
4. `data/items.json` の `images` に登録し、`history` に記録、チェック・表示確認をしてから公開する。
5. 登録が済んだ写真は、オーナーに確認のうえ `_inbox/` から消してよい。

- `_inbox/` は `.gitignore` で GitHub に送らない設定にしている（元の写真は大きく、撮影情報も含むため）。
- 縮小には Python の Pillow を使う（無ければ `pip install pillow`）。

## 新しい収集対象が増えたとき

管理IDと同じ名前のフォルダを追加する（例：`SFC-008/`）。
