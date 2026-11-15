# Side Runner MVP

横スクロールの簡単なアクションゲームのMVPです。

## 3ファイル構成
- `index.html` ... 画面のレイアウト
- `style.css` ... 見た目とUI
- `script.js` ... ゲームロジック

## 起動方法
ブラウザで開いて動かせます。ローカル開発なら以下を実行します。

```bash
cd /workspaces/my-first-app
python3 -m http.server 8000
```

その後、ブラウザで `http://localhost:8000` を開いてください。

## 操作
- 左右移動: `A` / `D` または `←` / `→`
- ジャンプ: `W` / `↑` / `Space`
- 攻撃: `J` / `K`
- リスタート: `Enter`
