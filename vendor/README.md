# 自己託管的外部函式庫

10-17：原本從 unpkg.com 載入，改成放在網站裡，unpkg 連不上或很慢時遊戲照樣開得起來。版本不動：

- React 18.2.0、ReactDOM 18.2.0（`umd/*.production.min.js`）
- Excalidraw 0.17.6（`dist/excalidraw.production.min.js` 與 `dist/excalidraw-assets/`，字型與語言檔）

來源是 npm 上同版本的套件（`npm pack react@18.2.0 react-dom@18.2.0 @excalidraw/excalidraw@0.17.6`），檔案沒有改過。授權檔一併附上。
