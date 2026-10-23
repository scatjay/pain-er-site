/* 後台技能等級徽章（純函式，node 與瀏覽器共用）：Lv.1 圓環（樸素）→ Lv.2 銀盾＋一顆星 → Lv.3 金冠＋三顆星。
   形狀、星數與亮度都不同（色盲也分得出）；樣式在 teacher.html 的 .skb／.skbar／.skdot。
   未知等級（空值、0、4、非整數）一律輸出 sk-lv0（虛線圓＋「—」），不假裝成 Lv.1。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ERG_SKB = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  function lvClass(lv) { var n = Number(lv); return (lv !== null && lv !== '' && n === Math.floor(n) && n >= 1 && n <= 3) ? 'sk-lv' + n : 'sk-lv0'; }
  function r1(v) { return Math.round(v * 100) / 100; }
  function star(cx, cy, R, r) {
    var p = []; for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r : R; p.push(r1(cx + rad * Math.cos(a)) + ',' + r1(cy + rad * Math.sin(a))); }
    return '<polygon points="' + p.join(' ') + '" fill="currentColor"/>';
  }
  /* 放在 body 開頭一次（漸層定義）；不能 display:none，否則部分瀏覽器漸層失效 */
  function defs() {
    return '<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>' +
      '<linearGradient id="skgSilver" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4f7f9"/><stop offset=".5" stop-color="#b5c3cc"/><stop offset="1" stop-color="#dfe7ec"/></linearGradient>' +
      '<linearGradient id="skgGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff0a8"/><stop offset=".5" stop-color="#f3c13c"/><stop offset="1" stop-color="#e0a21a"/></linearGradient></defs></svg>';
  }
  function svg(lv) {
    var c = lvClass(lv), head = '<svg class="skg ' + c + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">';
    if (c === 'sk-lv1') return head + '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="2.3" fill="currentColor"/></svg>';
    if (c === 'sk-lv2') return head + '<path d="M12 2.5L20 5.5V12C20 16.5 16.5 20 12 21.8C7.5 20 4 16.5 4 12V5.5Z" fill="url(#skgSilver)" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>' + star(12, 11.8, 4.6, 1.9) + '</svg>';
    if (c === 'sk-lv3') return head + '<path d="M3.2 19.5L2.4 7.2L8 11.6L12 3.8L16 11.6L21.6 7.2L20.8 19.5Z" fill="url(#skgGold)" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>' + star(7.4, 15.4, 2.3, 1) + star(12, 15.4, 2.6, 1.1) + star(16.6, 15.4, 2.3, 1) + '</svg>';
    return head + '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="3 2.4"/></svg>';
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  /* text 省略時：已知等級顯示「Lv.N」，未知顯示「—」；title 給滑過時的完整說明 */
  function badge(lv, text, title) {
    var c = lvClass(lv), t = text == null ? (c === 'sk-lv0' ? '—' : 'Lv.' + Number(lv)) : text;
    return '<span class="skb ' + c + '"' + (title ? ' title="' + esc(title) + '"' : '') + '>' + svg(lv) + '<span class="skt">' + esc(t) + '</span></span>';
  }
  return { lvClass: lvClass, svg: svg, badge: badge, defs: defs, esc: esc };
});
