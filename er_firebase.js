/* 痛點急診室的 Firebase 設定（公開的網頁用設定，不是機密；安全靠資料庫規則）。
   專案 gen-lang-client-0556836042：2026-10-12 把 Firebase 加到這個原本只有 AI Studio 金鑰的專案上，
   與文化遊戲松的 gen-lang-client-0929530380 完全分開，規則檔互不影響。方案 Spark（沒有綁帳單，不會產生費用）。
   網址帶 ?local=1 會改用本機資料層（測試用）。 */
window.ERG_FB = {
  apiKey: "AIzaSyDD0t3h27gEkfNhdbiTqu4cqn2YAU3LaLg",
  authDomain: "gen-lang-client-0556836042.firebaseapp.com",
  databaseURL: "https://gen-lang-client-0556836042-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "gen-lang-client-0556836042",
  appId: "1:911490667259:web:32ee1c648fa14dc390565e"
};
