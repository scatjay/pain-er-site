/* 平面小地圖：每個房間有大 emoji、名稱、家具小圖示、門與走道方向；可疊上人點與事件標記。
   純函式，回傳 SVG 字串（內嵌在網頁時 emoji 用系統彩色字型）。所有文字一律逸出。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ERG_MINIMAP = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var ROOM_ICON = {
    consultA: '🩺', consultB: '🩺', bays: '🛏️', ct: '🩻', corridor: '↔️', waiting: '🪑', nurse: '💉', resus: '🚑', staff: '☕', hall2: '↔️', hall3: '↔️',
    entrance: '🚪', triage: '📋', discharge: '🧾', restroom: '🚻', admin: '🏢', ped: '🧸', obs: '💧', pharmacy: '💊', family: '👨‍👩‍👧', lobby: '🎫',
    service: 'ℹ️', street: '🚕', ambulance: '🚑', notebook: '📓', home: '🏠', clinic: '🏥'
  };
  var TYPE_ICON = { desk: '🗄️', sign: '🪧', chair: '♿', door: '🚪', counter: '🗃️', device: '🔧', screen: '📺', seats: '🪑', board: '📌', bed: '🛏️',
    sofa: '🛋️', scanner: '🩻', glass: '🪟', rack: '📚', stall: '🚽', phone: '📱', lightbox: '💡' };
  var LABEL_ICON = { '血壓計': '🩸', '警民連線鈴': '🚨', '飲水機': '🚰', '電腦': '💻', '咖啡機': '☕', '輪椅': '♿', '公車站牌': '🚌', '計程車招呼站': '🚕',
    '叫號螢幕': '🔢', '電視': '📺', '領藥叫號': '🔢', '病人動態看板': '📊', '簡訊說明海報': '💬', '藥袋說明': '💊', '請尊重醫護': '🙏',
    '看診／探病 分流': '↔️', '自動門': '🚪', '白板': '🗒️', '探視規定': '📜', '探病登記': '📝', '衛教單架': '📄', '導覽地圖架': '🗺️', '診察桌': '🩺',
    '警衛櫃台': '🛡️', '檢傷櫃台': '📋', '護理站': '💉', '領藥窗口': '💊', '服務台': 'ℹ️', '病患的手機': '📱', '片燈箱（斷層片）': '🩻', '斷層掃描儀': '🩻',
    '急救床': '🚑', '主任辦公桌': '🏢', '資訊桌': '💻' };
  var DOT = { me: ['#ff6b4a', '我'], player: ['#339af0', '同'], bot: ['#adb5bd', '模'], npc: ['#ffd43b', ''], event: ['#fa5252', '!'] };

  function esc(s) { return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(v) { return isFinite(v) ? Math.round(v * 10) / 10 : 0; }

  function furnitureIcon(f) { return LABEL_ICON[f.label] || TYPE_ICON[f.type] || '▪️'; }

  /* opts.visited:[房間id]＝去過的房間，左上角畫一個綠底白勾（10-13）。
     opts：{ width, highlight:房間id, you:房間id, eventRooms:[id], dots:[{x,y,kind,label}], showFurniture, showPins, pins:[clueId], clickable }
     dots 的 x,y 是全圖座標（與 layout 的房間座標同一個系統） */
  var SHORT = { consultA: '診察一', consultB: '診察二', ct: '斷層', staff: '休息室', admin: '行政', ped: '兒科', service: '服務台', lobby: '掛號批價', discharge: '離院批價',
    pharmacy: '領藥', family: '家屬區', waiting: '候診區', triage: '檢傷', entrance: '入口', nurse: '護理站', resus: '急救', bays: '治療區', obs: '觀察室',
    restroom: '廁所', corridor: '主要走道', hall2: '中央走道', hall3: '前廳走道', ambulance: '救護車道', street: '街道', notebook: '筆記本', home: '病患的家', clinic: '回診門診' };

  function svg(layout, opts) {
    opts = opts || {};
    var F = opts.fontScale || 1, compact = !!opts.compact;
    var rooms = layout.ROOMS.filter(function (r) { return !(opts.onlyMap && r.type === 'remote'); }).map(function (r) { return r.id === 'notebook' ? Object.assign({}, r, { h: Math.min(r.h, 240) }) : r; }), x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    rooms.forEach(function (r) { x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h); });
    var pad = 30, W = x1 - x0 + pad * 2, H = y1 - y0 + pad * 2, byId = {};
    rooms.forEach(function (r) { byId[r.id] = r; });
    var width = opts.width || 900, height = Math.round(width * H / W);
    var out = [];
    out.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + num(x0 - pad) + ' ' + num(y0 - pad) + ' ' + num(W) + ' ' + num(H) + '" width="' + width + '" height="' + height + '" role="img" aria-label="急診室平面小地圖" font-family="\'Noto Sans TC\',\'Microsoft JhengHei\',sans-serif">');
    out.push('<rect x="' + num(x0 - pad) + '" y="' + num(y0 - pad) + '" width="' + num(W) + '" height="' + num(H) + '" fill="#fffdf5"/>');
    var event = {}; (opts.eventRooms || []).forEach(function (id) { event[id] = true; });
    var seen = {}; (opts.visited || []).forEach(function (id) { seen[id] = true; });
    rooms.forEach(function (r) {
      var isHall = r.type === 'hall' || r.type === 'outside';
      var hl = opts.highlight === r.id || opts.you === r.id;
      out.push('<g data-room="' + esc(r.id) + '"' + (opts.clickable ? ' style="cursor:pointer"' : '') + '>');
      out.push('<rect x="' + r.x + '" y="' + r.y + '" width="' + r.w + '" height="' + r.h + '" rx="10" fill="' + esc(r.color || '#eee') + '" stroke="' + (event[r.id] ? '#fa5252' : (hl ? '#ff6b4a' : '#1e1e1e')) + '" stroke-width="' + (event[r.id] || hl ? 9 : 4) + '"' + (r.type === 'remote' ? ' stroke-dasharray="14 8"' : '') + '/>');
      var icon = ROOM_ICON[r.id] || '❔';
      /* 10-18 美術（KB #11）：房間上緣一條區域色（同一區同一色，顏色之外還有圖示與房名） */
      if (r.accent && !isHall) out.push('<rect data-zone="' + esc(r.zone || '') + '" x="' + (r.x + 8) + '" y="' + (r.y + 5) + '" width="' + (r.w - 16) + '" height="' + (compact ? 18 : 9) + '" rx="4" fill="' + esc(r.accent) + '" stroke="#1e1e1e" stroke-width="2"/>');
      if (isHall) {
        var hs = Math.min(compact ? 30 : 18 * F, r.h * .6);
        out.push('<text x="' + (r.x + 24) + '" y="' + num(r.y + r.h / 2 + hs * .35) + '" font-size="' + hs + '" opacity=".7">' + icon + '</text>');
        out.push('<text x="' + (r.x + r.w / 2) + '" y="' + num(r.y + r.h / 2 + hs * .4) + '" font-size="' + num(Math.min(compact ? 34 : 20 * F, r.h * .66)) + '" font-weight="800" text-anchor="middle" fill="#3b4a52" letter-spacing="2">' + esc(compact ? (SHORT[r.id] || r.name) : r.name) + '</text>');
        out.push('<text x="' + (r.x + r.w - 24) + '" y="' + num(r.y + r.h / 2 + hs * .35) + '" font-size="' + hs + '" opacity=".7" text-anchor="end">' + icon + '</text>');
      } else {
        if (compact) {
          /* 小地圖：大圖示＋短名稱，遠看也認得 */
          var isz = Math.min(r.w * .4, r.h * .46, 92), sh = SHORT[r.id] || r.name;
          out.push('<text x="' + (r.x + r.w / 2) + '" y="' + num(r.y + r.h * .48) + '" font-size="' + num(isz) + '" text-anchor="middle">' + icon + '</text>');
          out.push('<text x="' + (r.x + r.w / 2) + '" y="' + num(r.y + r.h * .84) + '" font-size="' + Math.min(58, (r.w - 10) / Math.max(2, sh.length)) + '" font-weight="900" text-anchor="middle" fill="#1e1e1e" stroke="#fff" stroke-width="9" paint-order="stroke">' + esc(sh) + '</text>');
        } else {
          /* 標題列：小圖示＋名稱靠左上，不佔房間中央，家具與人點才看得清楚 */
          var fs = (r.w < 260 ? 19 : 22) * F, nm = (fs * r.name.length > r.w - 60) ? (SHORT[r.id] || r.name) : r.name, tw = Math.min(r.w - 54, fs * Math.max(2, nm.length) + 10);
          out.push('<rect x="' + (r.x + 8) + '" y="' + (r.y + 8) + '" width="' + num(tw + 34 * F) + '" height="' + num(fs + 14) + '" rx="8" fill="#fff" opacity=".86" stroke="#1e1e1e" stroke-width="2"/>');
          out.push('<text x="' + (r.x + 14) + '" y="' + num(r.y + 8 + fs + 3) + '" font-size="' + num(fs - 2) + '">' + icon + '</text>');
          out.push('<text x="' + num(r.x + 14 + fs + 6) + '" y="' + num(r.y + 8 + fs + 3) + '" font-size="' + num(fs) + '" font-weight="900" fill="#1e1e1e">' + esc(nm) + '</text>');
        }
      }
      if (seen[r.id] && !isHall) {
        var vr = compact ? 30 : 15 * F, vx = compact ? r.x + vr + 12 : r.x + r.w - vr - 10, vy = compact ? r.y + vr + 12 : r.y + r.h - vr - 10;
        out.push('<g data-visited="' + esc(r.id) + '"><title>去過了</title><circle cx="' + num(vx) + '" cy="' + num(vy) + '" r="' + num(vr) + '" fill="#2f9e44" stroke="#1e1e1e" stroke-width="' + num(vr * .15) + '"/>' +
          '<path d="M' + num(vx - vr * .48) + ' ' + num(vy + vr * .04) + ' l' + num(vr * .32) + ' ' + num(vr * .36) + ' l' + num(vr * .62) + ' ' + num(-vr * .72) + '" fill="none" stroke="#fff" stroke-width="' + num(vr * .26) + '" stroke-linecap="round" stroke-linejoin="round"/></g>');
      }
      out.push('</g>');
    });
    if (opts.showFurniture !== false && !compact) {
      (layout.FURNITURE || []).forEach(function (f) {
        var r = byId[f.room]; if (!r) return;
        var cx = r.x + f.rx + (f.w || 0) / 2, cy = r.y + f.ry + (f.h || 0) / 2;
        out.push('<text x="' + num(cx) + '" y="' + num(cy + 5) + '" font-size="' + num(15 * F) + '" text-anchor="middle" opacity=".78">' + furnitureIcon(f) + '</text>');
      });
    }
    /* 門：房間邊緣的小門牌 */
    rooms.forEach(function (r) {
      (r.doors || []).forEach(function (d) {
        var cx = d.side === 'W' ? r.x : d.side === 'E' ? r.x + r.w : r.x + r.w * d.at;
        var cy = d.side === 'N' ? r.y : d.side === 'S' ? r.y + r.h : r.y + r.h * d.at;
        out.push('<rect x="' + num(cx - (d.side === 'N' || d.side === 'S' ? d.w / 2 : 5)) + '" y="' + num(cy - (d.side === 'W' || d.side === 'E' ? d.w / 2 : 5)) + '" width="' + (d.side === 'N' || d.side === 'S' ? d.w : 10) + '" height="' + (d.side === 'W' || d.side === 'E' ? d.w : 10) + '" fill="#fff" stroke="' + (r.accent || '#d9480f') + '" stroke-width="3"/>');
      });
    });
    if (opts.showPins) {
      var want = opts.pins ? opts.pins.reduce(function (m, id) { m[id] = true; return m; }, {}) : null;
      (layout.PINS || []).forEach(function (p) {
        if (want && !want[p.clue]) return;
        var r = byId[p.room]; if (!r) return;
        out.push('<circle cx="' + (r.x + p.rx) + '" cy="' + (r.y + p.ry) + '" r="' + num(9 * F) + '" fill="#ffd43b" stroke="#1e1e1e" stroke-width="2"/><text x="' + (r.x + p.rx) + '" y="' + num(r.y + p.ry + 4.5 * F) + '" font-size="' + num(12 * F) + '" font-weight="900" text-anchor="middle" fill="#1e1e1e">?</text>');
      });
    }
    (opts.eventRooms || []).forEach(function (id) {
      var r = byId[id]; if (!r) return;
      out.push('<text x="' + (r.x + r.w - 26) + '" y="' + (r.y + 36) + '" font-size="' + (compact ? 44 : 26 * F) + '" text-anchor="end">⚠️</text>');
    });
    /* 玩家自己：脈動的圈＋圖釘＋「你在這裡」標示，最後畫、壓在其他點上面 */
    var meDot = null;
    (opts.dots || []).forEach(function (d) { if (d.kind === 'me') meDot = d; });
    out.push('<style>@keyframes ermm{0%{r:16;opacity:.9}100%{r:44;opacity:0}}.ermm-pulse{animation:ermm 1.8s ease-out infinite}@media (prefers-reduced-motion:reduce){.ermm-pulse{animation:none;opacity:.5}}</style>');
    (opts.dots || []).forEach(function (d) {
      if (d.kind === 'me') return;
      var s = DOT[d.kind] || DOT.npc;
      if (d.color) s = [d.color, d.glyph == null ? s[1] : d.glyph];   /* 10-15：後台活躍人數地圖用顏色與數字表示訪談技能等級；d.ring＝最近 5 分鐘有訪談的外圈 */
      out.push('<g><circle cx="' + num(d.x) + '" cy="' + num(d.y) + '" r="' + num((d.kind === 'me' ? 13 : 9) * (compact ? 1.7 : F)) + '" fill="' + s[0] + '" stroke="' + (d.ring ? '#e8590c' : '#1e1e1e') + '" stroke-width="' + (d.ring ? 6 : (d.kind === 'bot' ? 2 : 3)) + '"' + (d.kind === 'bot' ? ' stroke-dasharray="4 3"' : '') + '/>' +
        (s[1] ? '<text x="' + num(d.x) + '" y="' + num(d.y + 5) + '" font-size="' + num((d.kind === 'me' ? 12 : 9) * (compact ? 1.7 : F)) + '" font-weight="900" text-anchor="middle" fill="#1e1e1e">' + s[1] + '</text>' : '') +
        (d.label ? '<text x="' + num(d.x + 16) + '" y="' + num(d.y - 10) + '" font-size="' + num(15 * (compact ? 1.6 : F)) + '" font-weight="700" fill="#1e1e1e" stroke="#fff" stroke-width="3" paint-order="stroke">' + esc(d.label) + '</text>' : '') + '</g>');
    });
    if (meDot) {
      var mx = num(meDot.x), my = num(meDot.y), lab = esc(meDot.label || '你在這裡'), fs2 = 28 * (compact ? 2.1 : F), k = fs2 / 28, bw = fs2 * (meDot.label ? Math.max(2, meDot.label.length) : 5) + 56 * k;
      /* 10-13：標示牌原本一律畫在圓點上方，人在房間上緣時會蓋住左上角的房名 → 圓點離房間上緣太近就改畫在下方 */
      var flip = false;
      if (!compact) rooms.forEach(function (r) { if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h && my - 98 * k < r.y + 8 * F + 30 * F + 14) flip = true; });
      var s = flip ? -1 : 1;   /* s=-1：整個標示牌對圓點上下翻轉 */
      out.push('<g data-me="1"' + (flip ? ' data-flip="1"' : '') + '><circle class="ermm-pulse" cx="' + mx + '" cy="' + my + '" r="' + num(22 * k) + '" fill="none" stroke="#ff6b4a" stroke-width="' + num(6 * k) + '"/>' +
        '<circle cx="' + mx + '" cy="' + my + '" r="' + num(15 * k) + '" fill="#ff6b4a" stroke="#1e1e1e" stroke-width="' + num(4 * k) + '"/>' +
        '<rect x="' + num(mx - bw / 2) + '" y="' + num(flip ? my + 52 * k : my - 98 * k) + '" width="' + num(bw) + '" height="' + num(46 * k) + '" rx="' + num(23 * k) + '" fill="#ff6b4a" stroke="#1e1e1e" stroke-width="' + num(4 * k) + '"/>' +
        '<path d="M' + num(mx - 12 * k) + ' ' + num(my - s * 54 * k) + ' L' + mx + ' ' + num(my - s * 24 * k) + ' L' + num(mx + 12 * k) + ' ' + num(my - s * 54 * k) + ' Z" fill="#ff6b4a" stroke="#1e1e1e" stroke-width="' + num(4 * k) + '" stroke-linejoin="round"/>' +
        '<rect x="' + num(mx - 11 * k) + '" y="' + num(flip ? my + 50 * k : my - 56 * k) + '" width="' + num(22 * k) + '" height="' + num(6 * k) + '" fill="#ff6b4a"/>' +
        '<text x="' + mx + '" y="' + num(flip ? my + 84 * k : my - 66 * k) + '" font-size="' + num(fs2) + '" font-weight="900" text-anchor="middle" fill="#fff" stroke="#1e1e1e" stroke-width="' + num(1.2 * k) + '">📍 ' + lab + '</text></g>');
    }
    out.push('</svg>');
    return out.join('');
  }

  return { SHORT: SHORT, svg: svg, ROOM_ICON: ROOM_ICON, LABEL_ICON: LABEL_ICON, TYPE_ICON: TYPE_ICON, furnitureIcon: furnitureIcon, esc: esc };
});
