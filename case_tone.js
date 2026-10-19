/* 案例色調表（10-19 楊老師：「六類的房間，應該進去之後，要有很明顯的 tone 調的區隔」）
   資料驅動：一張表 TABLE，依房間的 case 欄位套用；桌機 index.html 與手機 m.html 共用，由 room.js／m.js 在進房時呼叫 apply()。
   套用四處：①#game[data-case] 設 CSS 變數 ②舞台底色（框外）③房間畫面上一層乘色（multiply，墊在人物與線索牌之下，文字不受影響）
   ④頂列下緣色條 ⑤舞台角落的案例標籤（字母＋案例簡稱＋代表色圓點；字母讓色盲也分得出）。
   原則：Itten 色相對比＋明度相近（六個乘色明度落在 0.67–0.81 之間（test_case_tone.js 把關），沒有哪一案例暗到壓住文字）；色相彼此至少相隔 35 度。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ERG_CASE_TONE = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  /* id → { letter 案例字母（同 meta.prefix）, name 標籤上的簡稱, ct 代表色（色條、圓點、框）, wash 乘色（蓋在房間畫面上）, label 色名 } */
  var TABLE = {
    sms:   { letter: 'C', name: '離院衛教簡訊', ct: '#3d6fe0', wash: '#cfdcff', label: '靛藍' },
    wait:  { letter: 'W', name: '候診與叫號',   ct: '#f08300', wash: '#ffd9a6', label: '橘' },
    way:   { letter: 'N', name: '尋路與標示',   ct: '#6aa81a', wash: '#dcf0ac', label: '黃綠' },
    forms: { letter: 'F', name: '表單與同意書', ct: '#8250e0', wash: '#e2d5fb', label: '紫' },
    pay:   { letter: 'P', name: '繳費與藥袋',   ct: '#e0457b', wash: '#fbc8dc', label: '玫紅' },
    peds:  { letter: 'K', name: '兒科家長衛教', ct: '#14a08c', wash: '#b8ece1', label: '青綠' }
  };
  var ORDER = ['sms', 'wait', 'way', 'forms', 'pay', 'peds'];
  var INK = '#1e1e1e';


  /* 色彩數學（測試與量對比用） */
  function rgb(h) { h = h.replace('#', ''); return [0, 2, 4].map(function (i) { return parseInt(h.substr(i, 2), 16); }); }
  function lin(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function lum(h) { var a = rgb(h); return 0.2126 * lin(a[0]) + 0.7152 * lin(a[1]) + 0.0722 * lin(a[2]); }
  function contrast(a, b) { var x = lum(a), y = lum(b), hi = Math.max(x, y), lo = Math.min(x, y); return (hi + 0.05) / (lo + 0.05); }
  function hue(h) { var a = rgb(h).map(function (v) { return v / 255; }), mx = Math.max.apply(0, a), mn = Math.min.apply(0, a), d = mx - mn, r = a[0], g = a[1], b = a[2], H;
    if (!d) return 0; if (mx === r) H = ((g - b) / d) % 6; else if (mx === g) H = (b - r) / d + 2; else H = (r - g) / d + 4; H *= 60; return H < 0 ? H + 360 : H; }
  /* multiply 乘色後，白底變成 wash、其他顏色逐通道相乘 */
  function multiply(base, wash) { var a = rgb(base), b = rgb(wash); return '#' + a.map(function (v, i) { var x = Math.round(v * b[i] / 255); return (x < 16 ? '0' : '') + x.toString(16); }).join(''); }

  /* 圓點上的字母顏色：白或墨黑，取對代表色對比較高者 */
  ORDER.forEach(function (k) { TABLE[k].on = contrast('#ffffff', TABLE[k].ct) >= contrast(INK, TABLE[k].ct) ? '#ffffff' : INK; });
  function get(id) { return TABLE[id] || TABLE.sms; }

  var CSS = '' +
    '#game[data-case]{--ct-ink:' + INK + '}' +
    '#game[data-case] #topbar{border-bottom:6px solid var(--ct)}' +
    '#game[data-case] #stage{--bg:color-mix(in srgb,var(--ct) 26%,#fff)}' +
    '#caseTone{position:absolute;inset:0;z-index:3;pointer-events:none;mix-blend-mode:multiply;background:var(--ct-wash)}' +
    '#caseBadge{position:absolute;z-index:9;display:inline-flex;align-items:center;gap:5px;max-width:60%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none;' +
      'background:var(--ct-wash);color:var(--ct-ink);border:2px solid var(--ct-ink);border-radius:999px;padding:0 9px 0 3px;font:900 12px/18px "Noto Sans TC","PingFang TC","Microsoft JhengHei",system-ui,sans-serif;box-shadow:2px 2px 0 var(--ct-ink)}' +
    '#caseBadge i{flex:none;display:inline-block;width:16px;height:16px;line-height:16px;border-radius:50%;background:var(--ct);color:var(--ct-on);font-style:normal;font-size:11px;text-align:center}' +
    '#stage>#caseBadge{left:22px;top:34px}' +
    '#sceneBox>#caseBadge{right:2px;top:2px;max-width:72%}' +
    '@media (prefers-color-scheme:dark){#game[data-case] #stage{--bg:color-mix(in srgb,var(--ct) 30%,#10191f)}#caseTone{mix-blend-mode:normal;background:var(--ct);opacity:.2}}';

  function apply(doc, caseId) {
    doc = doc || document;
    var T = get(caseId), game = doc.getElementById('game'); if (!game) return null;
    var id = TABLE[caseId] ? caseId : 'sms';
    if (!doc.getElementById('caseToneCss')) { var st = doc.createElement('style'); st.id = 'caseToneCss'; st.textContent = CSS; doc.head.appendChild(st); }
    game.setAttribute('data-case', id);
    game.style.setProperty('--ct', T.ct); game.style.setProperty('--ct-on', T.on); game.style.setProperty('--ct-wash', T.wash);
    var host = doc.getElementById('sceneBox') || doc.getElementById('stage'); if (!host) return T;
    var ov = doc.getElementById('overlay'), tone = doc.getElementById('caseTone'), badge = doc.getElementById('caseBadge');
    if (tone && tone.parentNode !== host) { tone.remove(); tone = null; }
    if (badge && badge.parentNode !== host) { badge.remove(); badge = null; }
    if (!tone) { tone = doc.createElement('div'); tone.id = 'caseTone'; tone.setAttribute('aria-hidden', 'true'); host.insertBefore(tone, ov && ov.parentNode === host ? ov : host.firstChild); }
    if (!badge) { badge = doc.createElement('div'); badge.id = 'caseBadge'; badge.setAttribute('role', 'note'); host.appendChild(badge); }
    badge.innerHTML = '<i aria-hidden="true">' + T.letter + '</i>' + T.name; badge.title = '案例' + T.letter + '：' + T.name + '（代表色：' + T.label + '）';
    return T;
  }

  return { TABLE: TABLE, ORDER: ORDER, INK: INK, get: get, apply: apply, contrast: contrast, lum: lum, hue: hue, multiply: multiply };
});
