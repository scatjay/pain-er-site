/* 平面小地圖：每個房間有大 emoji、名稱、家具小圖示、門與走道方向；可疊上人點與事件標記。
   純函式，回傳 SVG 字串（內嵌在網頁時 emoji 用系統彩色字型）。所有文字一律逸出。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ERG_MINIMAP = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var ROOM_ICON = {
    consultA: '🩺', consultB: '🩺', bays: '🛏️', ct: '🔬', corridor: '↔️', waiting: '🪑', nurse: '💉', resus: '🚑', staff: '☕', hall2: '↔️', hall3: '↔️',
    entrance: '🚪', triage: '📋', discharge: '🧾', restroom: '🚻', admin: '🏢', ped: '🧸', obs: '💧', pharmacy: '💊', family: '👨‍👩‍👧', lobby: '🎫',
    service: 'ℹ️', street: '🚕', ambulance: '🚑', notebook: '📓', home: '🏠', clinic: '🏥'
  };
  var TYPE_ICON = { desk: '🗄️', sign: '📢', chair: '♿', door: '🚪', counter: '🗃️', device: '🔧', screen: '📺', seats: '🪑', board: '📌', bed: '🛏️',
    sofa: '🛋️', scanner: '🔬', glass: '🖼️', rack: '📚', stall: '🚽', phone: '📱', lightbox: '💡' };
  var LABEL_ICON = { '血壓計': '🩸', '警民連線鈴': '🚨', '飲水機': '🚰', '電腦': '💻', '咖啡機': '☕', '輪椅': '♿', '公車站牌': '🚌', '計程車招呼站': '🚕',
    '叫號螢幕': '🔢', '電視': '📺', '領藥叫號': '🔢', '病人動態看板': '📊', '簡訊說明海報': '💬', '藥袋說明': '💊', '請尊重醫護': '🙏',
    '看診／探病 分流': '↔️', '自動門': '🚪', '白板': '🗒️', '探視規定': '📜', '探病登記': '📝', '衛教單架': '📄', '導覽地圖架': '🗺️', '診察桌': '🩺',
    '警衛櫃台': '🛡️', '檢傷櫃台': '📋', '護理站': '💉', '領藥窗口': '💊', '服務台': 'ℹ️', '病患的手機': '📱', '片燈箱（斷層片）': '💡', '斷層掃描儀': '🔬',
    '急救床': '🚑', '主任辦公桌': '🏢', '資訊桌': '💻' };
  var DOT = { me: ['#ff6b4a', '我'], player: ['#339af0', '同'], bot: ['#adb5bd', '模'], npc: ['#ffd43b', ''], event: ['#fa5252', '!'] };

  function esc(s) { return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(v) { return isFinite(v) ? Math.round(v * 10) / 10 : 0; }

  function furnitureIcon(f) { return LABEL_ICON[f.label] || TYPE_ICON[f.type] || '▪️'; }

  /* 10-18 圖示（FLAT S1）：「易缺字」的 emoji（Emoji 12 以後的 🩺🪑🩸、ZWJ 合成的 👨‍👩‍👧、要靠變體選擇符才有彩色的 🛏️🛋️🛡️⚠️、♿）換成 Lucide 線條圖示（icons.js）。
     表只列有對應圖示的；沒載入 icons.js（例如 node 測試）或沒有對應就退回原 emoji 文字，所以資料表（ROOM_ICON 等）仍是 emoji，文字處照舊可用。 */
  var ICON_OF = { '🩺': 'stethoscope', '🪑': 'armchair', '🛋️': 'armchair', '🩸': 'droplet', '👨‍👩‍👧': 'users', '🛏️': 'bed-double', '🛡️': 'shield-check', '♿': 'accessibility', '⚠️': 'triangle-alert' };
  function icons() { var g = typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : null); return (g && g.ERG_ICONS) || null; }
  /* HTML 裡用：回傳 inline SVG 或原 emoji */
  function iconHtml(emoji) { var I = icons(), n = ICON_OF[emoji]; return (I && n && I[n]) || emoji; }
  /* SVG 裡用：取代 <text>。x、base＝原本 text 的 x 與基線，size＝原 font-size，anchor＝text-anchor（'' 為靠左） */
  function glyph(emoji, x, base, size, anchor, extra) {
    var I = icons(), n = ICON_OF[emoji];
    if (I && n && I[n]) {
      var left = anchor === 'middle' ? x - size / 2 : (anchor === 'end' ? x - size : x), top = base - size * .84;
      return I[n].replace('<svg class="ic" ', '<svg class="ermm-ic" data-icon="' + n + '"' + (extra || '') + ' x="' + num(left) + '" y="' + num(top) + '" width="' + num(size) + '" height="' + num(size) + '" style="color:#1e1e1e" ');
    }
    return '<text x="' + num(x) + '" y="' + num(base) + '" font-size="' + num(size) + '"' + (anchor ? ' text-anchor="' + anchor + '"' : '') + (extra || '') + '>' + emoji + '</text>';
  }

  /* opts.visited:[房間id]＝去過的房間，左上角畫一個綠底白勾（10-13）。
     opts：{ width, highlight:房間id, you:房間id, eventRooms:[id], dots:[{x,y,kind,label}], showFurniture, showPins, pins:[clueId], clickable }
     dots 的 x,y 是全圖座標（與 layout 的房間座標同一個系統） */
  var SHORT = { consultA: '診察一', consultB: '診察二', ct: '斷層', staff: '休息室', admin: '行政', ped: '兒科', service: '服務台', lobby: '掛號批價', discharge: '離院批價',
    pharmacy: '領藥', family: '家屬區', waiting: '候診區', triage: '檢傷', entrance: '入口', nurse: '護理站', resus: '急救', bays: '治療區', obs: '觀察室',
    restroom: '廁所', corridor: '主要走道', hall2: '中央走道', hall3: '前廳走道', ambulance: '救護車道', street: '街道', notebook: '筆記本', home: '病患的家', clinic: '回診門診' };


  /* 10-18 D2：線索徽章（房間右下角）。沒去過＝黃底「?」；去過＝黃底「剩 N 條」（地圖小時只放數字）；清完＝淡綠底「✔」。
     info＝{ total, left, seen }；形狀是圓角方塊，與「去過」的綠色圓形勾分得開。 */
  /* dot＝「你在這裡」的圓點 {x,y,k}（k＝縮放）。10-18：圓點與外圈蓋到預設位置（右下角）時，徽章往上或往左挪到不被蓋的地方 */
  function dotHitsBox(dot, b) { var rad = 23 * dot.k + 6, cx = Math.max(b.x, Math.min(dot.x, b.x + b.w)), cy = Math.max(b.y, Math.min(dot.y, b.y + b.h)); return Math.hypot(dot.x - cx, dot.y - cy) < rad; }
  function clueBadgeBox(r, info, compact, F, withText, dot) {
    var seen = info.seen, h = compact ? 56 : 30 * F, fs = compact ? 40 : 18 * F, left = info.left, done = seen && left <= 0;
    function make(label) { var w = label.length > 2 ? fs * (label.length * .62 + .9) : h; return { label: label, w: w, h: h, fs: fs, done: done, x: r.x + r.w - 8 - w, y: r.y + r.h - 8 - h }; }
    var full = !seen ? '?' : (done ? '✔' : (withText ? '剩 ' + left + ' 條' : String(left))), short = !seen ? '?' : (done ? '✔' : String(left)), box = make(full);
    if (dot && dotHitsBox(dot, box)) {
      /* 依序試：原標籤往上／往左挪，再換成只有數字的短標籤往上／往左挪；第一個不被圓點蓋到、又留在房間內的就用 */
      var top = r.y + (compact ? 60 : 30 * F), left0 = r.x + (compact ? 70 : 8), found = null;
      [full, short].forEach(function (lb) { if (found) return; var base = make(lb);
        for (var i = 0; i <= 3 && !found; i++) for (var j = 0; j <= 4 && !found; j++) {
          var c = { label: base.label, w: base.w, h: base.h, fs: fs, done: done, x: base.x - j * base.w * .5, y: base.y - i * (h + 6) * .6 };
          if (c.y >= top && c.x >= left0 && !dotHitsBox(dot, c)) { c.moved = true; found = c; } } });
      if (found) box = found;
    }
    return box;
  }
  function clueBadge(r, info, compact, F, withText, dot) {
    var bx = clueBadgeBox(r, info, compact, F, withText, dot), seen = info.seen, left = info.left, done = bx.done, label = bx.label, w = bx.w, h = bx.h, fs = bx.fs, x = bx.x, y = bx.y;
    var fill = !seen ? '#fff8c5' : (done ? '#b2f2bb' : '#ffd43b'), edge = done ? '#1b5e2c' : '#a85600', dash = !seen ? ' stroke-dasharray="' + num(h * .22) + ' ' + num(h * .14) + '"' : '';   /* S3 狀態色塊：沒去過＝淡黃虛線、還剩＝黃、都記了＝綠；與圖例、去過徽章同一組色 */
    return '<g data-clue-badge="' + esc(r.id) + '" data-state="' + (!seen ? 'unseen' : (done ? 'done' : 'left')) + '"><title>' + esc(!seen ? '還沒去過：這裡有線索' : (done ? '這間的線索都記下了' : '還剩 ' + left + ' 條線索沒記')) + '</title>' +
      '<rect x="' + num(x) + '" y="' + num(y) + '" width="' + num(w) + '" height="' + num(h) + '" rx="' + num(h * .3) + '" fill="' + fill + '" stroke="' + edge + '" stroke-width="' + num(compact ? 4 : 2) + '"' + dash + '/>' +
      '<text x="' + num(x + w / 2) + '" y="' + num(y + h / 2 + fs * .36) + '" font-size="' + num(fs) + '" font-weight="900" text-anchor="middle" fill="#1e1e1e">' + esc(label) + '</text></g>';
  }
  /* 每間房的線索狀態。clues：[{id,pin:{room}}]；markers：listMarkers 的結果（勘查卡有 clueId）；me：自己的代號（只算自己記的）。
     回傳 { 房間id: { total, left, seen } }；「剩」＝這間房的線索裡，自己還沒記成勘查卡的。 */
  function clueStatus(clues, markers, roomsSeen, me) {
    var done = {}; (markers || []).forEach(function (m) { if (m && m.clueId && (me === undefined || m.author === undefined || String(m.author) === String(me))) done[m.clueId] = true; });
    var out = {};
    (clues || []).forEach(function (c) {
      var id = c.pin && c.pin.room; if (!id) return;
      var o = out[id] || (out[id] = { total: 0, left: 0, seen: !!(roomsSeen && roomsSeen[id]) });
      o.total += 1; if (!done[c.id]) o.left += 1;
    });
    return out;
  }
  /* 10-18 圖例：一行，放大視窗與手機「全部」用（小地圖空間不夠不放） */
  function legendHtml(collapsed) {
    var chip = function (bg, fg, t, edge) { return '<b style="display:inline-block;min-width:1.4em;text-align:center;background:' + bg + ';color:' + fg + ';border:2px solid ' + (edge || '#1e1e1e') + ';border-radius:6px;padding:0 4px;margin-right:2px">' + t + '</b>'; };
    return '<details class="ermm-legend" ' + (collapsed ? '' : 'open ') + 'style="font-size:13px;line-height:1.9;margin-top:6px"><summary data-legend-toggle="1" style="cursor:pointer;font-weight:900;min-height:32px;display:flex;align-items:center">圖例（記號是什麼意思）' + (collapsed ? '・放大時可拖曳' : '') + '</summary>📍 你在這裡　' + chip('#b2f2bb', '#1e1e1e', '✓', '#1b5e2c') + '去過　' + chip('#fff', '#1e1e1e', iconHtml('⚠️')) + '事件　' + chip('#e9ecef', '#1e1e1e', '3', '#495057') + '人數　' + chip('#a5d8ff', '#1e1e1e', '3', '#1864ab') + '有同學　' + chip('#fff8c5', '#1e1e1e', '?', '#a85600') + '沒去過、有線索　' + chip('#ffd43b', '#1e1e1e', '剩 N 條', '#a85600') + '線索還沒記　' + chip('#b2f2bb', '#1e1e1e', '✔', '#1b5e2c') + '線索都記了</details>';
  }
  /* 三處地圖（桌面小地圖、桌面放大、手機全部）共用：把遊戲狀態變成 svg() 的 opts，呼叫端只補 width／fontScale。
     src：{ loc, me:{x,y}, roomsSeen, npcDots:[{x,y,kind}], players:[{x,y,label}], activeEventRooms:[id], clues, walkTarget } */
  function optsFrom(src) {
    src = src || {};
    var dots = (src.npcDots || []).map(function (d) { return { x: d.x, y: d.y, kind: d.kind === 'bot' ? 'bot' : 'npc' }; });
    (src.players || []).forEach(function (p) { dots.push({ x: p.x, y: p.y, kind: 'player', label: p.label }); });
    if (src.me) dots.push({ x: src.me.x, y: src.me.y, kind: 'me' });
    return { compact: true, onlyMap: true, showFurniture: false, showPins: false, clickable: true, peopleBadges: true, you: src.loc, dots: dots, eventRooms: src.activeEventRooms || [],
      visited: Object.keys(src.roomsSeen || {}), clues: src.clues || null, walkTarget: src.walkTarget || null };
  }

  function svg(layout, opts) {
    opts = opts || {};
    var F = opts.fontScale || 1, compact = !!opts.compact;
    var dotE = null; (opts.dots || []).forEach(function (d) { if (d.kind === 'me' && !(opts.you && layout.room(opts.you) && layout.room(opts.you).type === 'remote')) dotE = { x: Number(d.x), y: Number(d.y), k: (28 * (compact ? 1.8 : F)) / 28 }; });   /* 圓點位置先算好，徽章與標示牌都要避開 */
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
      /* 10-18 UI 方案 6：走道／街道點了沒反應，就不要假裝可點（pointer-events:none、不是手型）；真的可點的房間加 class，由內嵌樣式做 hover／按下回饋 */
      var clk = !!opts.clickable && r.type === 'room';
      out.push('<g data-room="' + esc(r.id) + '"' + (clk ? ' class="ermm-click" style="cursor:pointer"' : (opts.clickable ? ' style="pointer-events:none"' : '')) + '>');
      out.push('<rect x="' + r.x + '" y="' + r.y + '" width="' + r.w + '" height="' + r.h + '" rx="10" fill="' + esc(r.color || '#eee') + '" stroke="' + (event[r.id] ? '#fa5252' : (opts.walkTarget === r.id ? '#1c7ed6' : (hl ? '#ff6b4a' : '#1e1e1e'))) + '" stroke-width="' + (event[r.id] || hl || opts.walkTarget === r.id ? 9 : 4) + '"' + (r.type === 'remote' || opts.walkTarget === r.id ? ' stroke-dasharray="' + (opts.walkTarget === r.id ? '26 12' : '14 8') + '"' : '') + '/>');
      var icon = ROOM_ICON[r.id] || '❔';
      /* 10-18 美術（KB #11）：房間上緣一條區域色（同一區同一色，顏色之外還有圖示與房名） */
      if (r.accent && !isHall) out.push('<rect data-zone="' + esc(r.zone || '') + '" x="' + (r.x + 8) + '" y="' + (r.y + 5) + '" width="' + (r.w - 16) + '" height="' + (compact ? 30 : 9) + '" rx="6" fill="' + esc(r.accent) + '" stroke="#1e1e1e" stroke-width="2"/>');
      if (isHall) {
        var hs = Math.min(compact ? 30 : 18 * F, r.h * .6);
        out.push(glyph(icon, r.x + 24, r.y + r.h / 2 + hs * .35, hs, '', ' opacity=".7"'));
        out.push('<text x="' + (r.x + r.w / 2) + '" y="' + num(r.y + r.h / 2 + hs * .4) + '" font-size="' + num(Math.min(compact ? 34 : 20 * F, r.h * .66)) + '" font-weight="800" text-anchor="middle" fill="#3b4a52" letter-spacing="2">' + esc(compact ? (SHORT[r.id] || r.name) : r.name) + '</text>');
        out.push(glyph(icon, r.x + r.w - 24, r.y + r.h / 2 + hs * .35, hs, 'end', ' opacity=".7"'));
      } else {
        if (compact) {
          /* 小地圖：大圖示＋短名稱，遠看也認得 */
          /* 10-18 UI 方案 5：房名固定在房間上緣（區域色條下），圖示在中偏下，下緣兩個角留給「去過」與「線索」徽章，「你在這裡」牌就不會蓋住房名 */
          var isz = Math.min(r.w * .38, r.h * .34, 76), sh = SHORT[r.id] || r.name, nfs = Math.min(opts.nameMax || 58, (r.w - 10) / Math.max(2, sh.length));
          if (!opts.hideRoomIcon) out.push(glyph(icon, r.x + r.w / 2, r.y + r.h * .62 + isz * .35, isz, 'middle'));
          out.push('<text data-name="1" x="' + (r.x + r.w / 2) + '" y="' + num(r.y + 42 + nfs * .82) + '" font-size="' + num(nfs) + '" font-weight="900" text-anchor="middle" fill="#1e1e1e" stroke="#fff" stroke-width="9" paint-order="stroke">' + esc(sh) + '</text>');
        } else {
          /* 標題列：小圖示＋名稱靠左上，不佔房間中央，家具與人點才看得清楚 */
          var fs = (r.w < 260 ? 19 : 22) * F, nm = (fs * r.name.length > r.w - 60) ? (SHORT[r.id] || r.name) : r.name, tw = Math.min(r.w - 54, fs * Math.max(2, nm.length) + 10);
          out.push('<rect x="' + (r.x + 8) + '" y="' + (r.y + 8) + '" width="' + num(tw + 34 * F) + '" height="' + num(fs + 14) + '" rx="8" fill="#fff" opacity=".86" stroke="#1e1e1e" stroke-width="2"/>');
          out.push(glyph(icon, r.x + 14, r.y + 8 + fs + 3, fs - 2, ''));
          out.push('<text x="' + num(r.x + 14 + fs + 6) + '" y="' + num(r.y + 8 + fs + 3) + '" font-size="' + num(fs) + '" font-weight="900" fill="#1e1e1e">' + esc(nm) + '</text>');
        }
      }
      if (seen[r.id] && !isHall) {
        var vr = compact ? 28 : 15 * F, vx = compact ? r.x + vr + 8 : r.x + r.w - vr - 10, vy = compact ? r.y + r.h - vr - 8 : r.y + r.h - vr - 10;
        out.push('<g data-visited="' + esc(r.id) + '"><title>去過了</title><circle cx="' + num(vx) + '" cy="' + num(vy) + '" r="' + num(vr) + '" fill="#b2f2bb" stroke="#1b5e2c" stroke-width="' + num(vr * .15) + '"/>' +
          '<path d="M' + num(vx - vr * .48) + ' ' + num(vy + vr * .04) + ' l' + num(vr * .32) + ' ' + num(vr * .36) + ' l' + num(vr * .62) + ' ' + num(-vr * .72) + '" fill="none" stroke="#1b5e2c" stroke-width="' + num(vr * .26) + '" stroke-linecap="round" stroke-linejoin="round"/></g>');
      }
      var ci = opts.clues && opts.clues[r.id];
      if (ci && ci.total > 0 && !isHall) out.push(clueBadge(r, ci, compact, F, !!opts.clueText, dotE));
      out.push('</g>');
    });
    if (opts.showFurniture !== false && !compact) {
      (layout.FURNITURE || []).forEach(function (f) {
        var r = byId[f.room]; if (!r) return;
        var cx = r.x + f.rx + (f.w || 0) / 2, cy = r.y + f.ry + (f.h || 0) / 2;
        out.push(glyph(furnitureIcon(f), cx, cy + 5, 15 * F, 'middle', ' opacity=".78"'));
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
      /* S3 狀態色塊：事件＝淡紅底＋紅描邊（與房間的紅外框同一組色），圖示照舊 */
      var ex = compact ? r.x + r.w - 10 : r.x + r.w - 26, eb = compact ? r.y + r.h * .56 + 16 : r.y + 36, es = compact ? 56 : 26 * F, ep = es * .1;
      out.push('<rect x="' + num(ex - es - ep) + '" y="' + num(eb - es * .84 - ep) + '" width="' + num(es + ep * 2) + '" height="' + num(es + ep * 2) + '" rx="' + num(es * .25) + '" fill="#ffe3e3" stroke="#c92a2a" stroke-width="' + (compact ? 4 : 2) + '"/>');
      out.push(compact ? glyph('⚠️', ex, eb, es, 'end', ' data-event="1"') : glyph('⚠️', ex, eb, es, 'end'));
    });
    /* 玩家自己：脈動的圈＋圖釘＋「你在這裡」標示，最後畫、壓在其他點上面 */
    var meDot = null;
    (opts.dots || []).forEach(function (d) { if (d.kind === 'me') meDot = d; });
    out.push('<style>@keyframes ermm{0%{r:16;opacity:.9}100%{r:44;opacity:0}}.ermm-pulse{animation:ermm 1.8s ease-out infinite}@media (prefers-reduced-motion:reduce){.ermm-pulse{animation:none;opacity:.5}}' +
      'g.ermm-click:hover>rect:first-of-type{stroke:#1c7ed6;stroke-width:10}g.ermm-click:active>rect:first-of-type{stroke:#1864ab;stroke-width:14;fill-opacity:.8}</style>');
    /* 10-18 UI 方案 4：compact 地圖不畫 5px 小人點（互疊、壓房名），改在每間房左側放「人數」圓徽章；灰＝工作人員與病患，藍＝這間有同學。 */
    if (opts.peopleBadges) {
      var cnt = {};
      (opts.dots || []).forEach(function (d) {
        if (d.kind === 'me') return;
        var hit = null; rooms.forEach(function (r) { if (d.x >= r.x && d.x <= r.x + r.w && d.y >= r.y && d.y <= r.y + r.h && (!hit || (hit.type === 'hall' || hit.type === 'outside'))) hit = r; });
        if (!hit) return; var c = cnt[hit.id] || (cnt[hit.id] = { n: 0, mates: 0 }); c.n += 1; if (d.kind === 'player') c.mates += 1;
      });
      rooms.forEach(function (r) {
        var c = cnt[r.id]; if (!c) return; var hall = r.type === 'hall' || r.type === 'outside', rr = hall ? Math.min(24, r.h * .36) : 24, cx = hall ? r.x + 120 : r.x + 8 + rr, cy = hall ? r.y + r.h / 2 : r.y + r.h * .6;
        out.push('<g data-people="' + esc(r.id) + '" data-n="' + c.n + '"><title>' + esc('這間有 ' + c.n + ' 人' + (c.mates ? '（含 ' + c.mates + ' 位同學）' : '')) + '</title><circle cx="' + num(cx) + '" cy="' + num(cy) + '" r="' + num(rr) + '" fill="' + (c.mates ? '#a5d8ff' : '#e9ecef') + '" stroke="' + (c.mates ? '#1864ab' : '#495057') + '" stroke-width="4"/>' +
          '<text x="' + num(cx) + '" y="' + num(cy + rr * .38) + '" font-size="' + num(rr * 1.15) + '" font-weight="900" text-anchor="middle" fill="#1e1e1e">' + c.n + '</text></g>');
      });
    }
    (opts.dots || []).forEach(function (d) {
      if (d.kind === 'me') return;
      if (opts.peopleBadges) return;
      var s = DOT[d.kind] || DOT.npc;
      if (d.color) s = [d.color, d.glyph == null ? s[1] : d.glyph];   /* 10-15：後台活躍人數地圖用顏色與數字表示訪談技能等級；d.ring＝最近 5 分鐘有訪談的外圈 */
      out.push('<g><circle cx="' + num(d.x) + '" cy="' + num(d.y) + '" r="' + num((d.kind === 'me' ? 13 : 9) * (compact ? 1.7 : F)) + '" fill="' + s[0] + '" stroke="' + (d.ring ? '#e8590c' : '#1e1e1e') + '" stroke-width="' + (d.ring ? 6 : (d.kind === 'bot' ? 2 : 3)) + '"' + (d.kind === 'bot' ? ' stroke-dasharray="4 3"' : '') + '/>' +
        (s[1] ? '<text x="' + num(d.x) + '" y="' + num(d.y + 5) + '" font-size="' + num((d.kind === 'me' ? 12 : 9) * (compact ? 1.7 : F)) + '" font-weight="900" text-anchor="middle" fill="#1e1e1e">' + s[1] + '</text>' : '') +
        (d.label ? '<text x="' + num(d.x + 16) + '" y="' + num(d.y - 10) + '" font-size="' + num(15 * (compact ? 1.6 : F)) + '" font-weight="700" fill="#1e1e1e" stroke="#fff" stroke-width="3" paint-order="stroke">' + esc(d.label) + '</text>' : '') + '</g>');
    });
    /* 10-18 UI 方案 5：人在院外（病患的家、回診門診）時，點不在地圖上，改在地圖下緣放一條「你在院外：○○」 */
    var youOutside = !!(opts.you && !byId[opts.you] && layout.room && layout.room(opts.you));
    if (youOutside) {
      var yo = layout.room(opts.you), ys = compact ? 46 : 22 * F, yw = ys * (yo.name.length + 7) + 40;
      out.push('<g data-outside="1"><rect x="' + num(x0 + (x1 - x0) / 2 - yw / 2) + '" y="' + num(y1 - ys * 1.9) + '" width="' + num(yw) + '" height="' + num(ys * 1.6) + '" rx="' + num(ys * .8) + '" fill="#ff6b4a" stroke="#1e1e1e" stroke-width="5"/>' +
        '<text x="' + num(x0 + (x1 - x0) / 2) + '" y="' + num(y1 - ys * .85) + '" font-size="' + num(ys) + '" font-weight="900" text-anchor="middle" fill="#fff" stroke="#1e1e1e" stroke-width="1.5">📍 你在院外：' + esc(yo.name) + '</text></g>');
      meDot = null;
    }
    if (meDot) {
      var mx = num(meDot.x), my = num(meDot.y), lab = esc(meDot.label || '你在這裡'), fs2 = 28 * (compact ? 1.8 : F), k = fs2 / 28, bw = fs2 * (meDot.label ? Math.max(2, meDot.label.length) : 5) + 56 * k;
      /* 10-13：標示牌原本一律畫在圓點上方，人在房間上緣時會蓋住左上角的房名 → 圓點離房間上緣太近就改畫在下方 */
      var flip = false, shift = 0;
      if (!compact) rooms.forEach(function (r) { if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h && my - 98 * k < r.y + 8 * F + 30 * F + 14) flip = true; });
      /* 10-18：非 compact（手機「全部」、電腦全地圖）也要避開「剩 N 條」線索徽章：上方的牌若蓋到徽章、下方不會，就翻到下方 */
      if (!compact && !flip) {
        var fbl = mx - bw / 2, fbr = fbl + bw, hitBadge = function (bt2) { var hit = false; rooms.forEach(function (r) {
          var hall = r.type === 'hall' || r.type === 'outside', ci3 = opts.clues && opts.clues[r.id]; if (hall || !ci3 || !(ci3.total > 0)) return;
          var cb = clueBadgeBox(r, ci3, false, F, !!opts.clueText, dotE), ox = Math.min(fbr, cb.x + cb.w) - Math.max(fbl, cb.x), oy = Math.min(bt2 + 46 * k, cb.y + cb.h) - Math.max(bt2, cb.y); if (ox > 0 && oy > 0) hit = true; }); return hit; };
        if (hitBadge(my - 98 * k) && !hitBadge(my + 52 * k)) flip = true;
      }
      else {
        /* compact：在「上方／下方 × 左右偏移」六種位置裡挑不蓋到任何房名、也不超出地圖的那一個 */
        var nameBoxes = [];
        rooms.forEach(function (r) {
          var hall = r.type === 'hall' || r.type === 'outside', sh2 = SHORT[r.id] || r.name, nf = hall ? Math.min(34, r.h * .66) : Math.min(58, (r.w - 10) / Math.max(2, sh2.length)), tw2 = nf * sh2.length;
          nameBoxes.push(hall ? { l: r.x + r.w / 2 - tw2 / 2, r: r.x + r.w / 2 + tw2 / 2, t: r.y + r.h / 2 - nf / 2, b: r.y + r.h / 2 + nf / 2 } : { l: r.x + r.w / 2 - tw2 / 2, r: r.x + r.w / 2 + tw2 / 2, t: r.y + 34, b: r.y + 52 + nf });
          if (hall) return;
          if (seen[r.id]) nameBoxes.push({ l: r.x + 8, r: r.x + 64, t: r.y + r.h - 64, b: r.y + r.h - 8 });   /* 去過勾 */
          var ci2 = opts.clues && opts.clues[r.id];
          if (ci2 && ci2.total > 0) { var cbx = clueBadgeBox(r, ci2, true, F, !!opts.clueText, dotE); nameBoxes.push({ l: cbx.x, r: cbx.x + cbx.w, t: cbx.y, b: cbx.y + cbx.h }); }
          if (typeof cnt !== 'undefined' && cnt && cnt[r.id]) nameBoxes.push({ l: r.x + 8, r: r.x + 56, t: r.y + r.h * .6 - 24, b: r.y + r.h * .6 + 24 });   /* 人數徽章 */
          if (event[r.id]) nameBoxes.push({ l: r.x + r.w - 60, r: r.x + r.w - 10, t: r.y + r.h * .6 - 30, b: r.y + r.h * .6 + 20 });   /* ⚠ */
        });
        var vL = x0 - pad + 6, vR = x0 - pad + W - 6, vT = y0 - pad + 4, vB = y0 - pad + H - 4, best = null;
        [false, true].forEach(function (fl) { [0, -.3, .3, -.6, .6].forEach(function (f) {
          var sx = f * bw, bl = mx - bw / 2 + sx, br = bl + bw, bt = fl ? my + 52 * k : my - 98 * k, bb = bt + 46 * k, sc = Math.abs(f) * 40;
          if (bl < vL) { sx += vL - bl; bl = vL; br = bl + bw; } if (br > vR) { sx -= br - vR; br = vR; bl = br - bw; }
          if (bt < vT || bb > vB) sc += 1e7;
          nameBoxes.forEach(function (nb) { var ox = Math.min(br, nb.r) - Math.max(bl, nb.l), oy = Math.min(bb, nb.b) - Math.max(bt, nb.t); if (ox > 0 && oy > 0) sc += ox * oy; });
          if (!best || sc < best.sc - 1) best = { sc: sc, flip: fl, shift: sx };
        }); });
        flip = best.flip; shift = best.shift;
      }
      var s = flip ? -1 : 1, ax = Math.max(mx - bw / 2 + shift + 22 * k, Math.min(mx + bw / 2 + shift - 22 * k, mx));   /* s=-1：整個標示牌對圓點上下翻轉；ax＝箭頭根部（標示牌偏移後仍連著圓點） */
      out.push('<g data-me="1"' + (flip ? ' data-flip="1"' : '') + '><circle class="ermm-pulse" cx="' + mx + '" cy="' + my + '" r="' + num(22 * k) + '" fill="none" stroke="#ff6b4a" stroke-width="' + num(6 * k) + '"/>' +
        '<circle cx="' + mx + '" cy="' + my + '" r="' + num(23 * k) + '" fill="none" stroke="#fff" stroke-width="' + num(7 * k) + '"/>' +
        '<circle cx="' + mx + '" cy="' + my + '" r="' + num(18 * k) + '" fill="#ff6b4a" stroke="#1e1e1e" stroke-width="' + num(5 * k) + '"/>' +
        '<rect x="' + num(mx - bw / 2 + shift) + '" y="' + num(flip ? my + 52 * k : my - 98 * k) + '" width="' + num(bw) + '" height="' + num(46 * k) + '" rx="' + num(23 * k) + '" fill="#ff6b4a" stroke="#1e1e1e" stroke-width="' + num(4 * k) + '"/>' +
        '<path d="M' + num(ax - 12 * k) + ' ' + num(my - s * 54 * k) + ' L' + mx + ' ' + num(my - s * 24 * k) + ' L' + num(ax + 12 * k) + ' ' + num(my - s * 54 * k) + ' Z" fill="#ff6b4a" stroke="#1e1e1e" stroke-width="' + num(4 * k) + '" stroke-linejoin="round"/>' +
        '<rect x="' + num(ax - 11 * k) + '" y="' + num(flip ? my + 50 * k : my - 56 * k) + '" width="' + num(22 * k) + '" height="' + num(6 * k) + '" fill="#ff6b4a"/>' +
        '<text x="' + num(mx + shift) + '" y="' + num(flip ? my + 84 * k : my - 66 * k) + '" font-size="' + num(fs2) + '" font-weight="900" text-anchor="middle" fill="#1e1e1e">📍 ' + lab + '</text></g>');
    }
    out.push('</svg>');
    return out.join('');
  }

  return { SHORT: SHORT, svg: svg, optsFrom: optsFrom, clueStatus: clueStatus, legendHtml: legendHtml, ROOM_ICON: ROOM_ICON, LABEL_ICON: LABEL_ICON, TYPE_ICON: TYPE_ICON, furnitureIcon: furnitureIcon, iconHtml: iconHtml, ICON_OF: ICON_OF, esc: esc };
});
