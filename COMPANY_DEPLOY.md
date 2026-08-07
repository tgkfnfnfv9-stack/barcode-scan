# 会社サイトへの最小配置

このスキャナーで会社APIのログインセッションを使うため、GitHub Pagesを中継せず、`index.html` と同じ内容を会社ドメインから配信します。

## 配置先

- 公開URL: `https://www.kkmt.co.jp/staff/barcode-scan.html`
- 配置するファイル: このリポジトリの `index.html` 1ファイルだけ

ZXing JavaScript / WASM は `index.html` 内に埋め込み済みなので、追加のJavaScriptやWASMファイルは不要です。

## 必要条件

1. `https://www.kkmt.co.jp/staff/barcode-scan.html` が、このリポジトリの `index.html` をそのまま返す。
2. 社員が同じSafariで `www.kkmt.co.jp` にログインしている。
3. ページから同一オリジンの `GET /staff/api/stocks/{CODE}` を呼べる。
4. CSPを設定している場合は、このHTML内の既存inline script、blob module、WASM実行を現在のスキャナーと同様に許可する。

CORS設定、プロキシ、ブックマーク、`javascript:`、`staff-loader.js` は不要です。

## 受け入れ確認

ログイン済みiPhone Safariで上記URLを普通に開き、`P009000` を登録またはスキャンします。

最初の表示:
- バーコード: P009000
- 型番: α-T14iBL
- 金額: APIの `price`
- 「詳細を見る」

詳細:
- 機械名: ドリリングセンター
- メーカー: ファナック
- 型番: α-T14iBL
- 年式: 2001
- 仕様
- 入札会名
- 入札会価格
- 種別

`price` / `event_price` はログイン権限で返る値を表示します。
