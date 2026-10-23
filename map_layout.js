/* 教師後台活躍人數地圖：學生圓點規則排列（純函式，node 與瀏覽器共用）
   每間房依可用寬度算欄數，格狀排列；排序＝技能等級高到低、同級依編號。
   放不下就顯示前 N 個，最後一格改成「+M」。圓點區在房名標籤下方，不蓋房名。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ERG_MAPLAYOUT = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var DEF = { dotD: 24, pitch: 30, rowCap: 40, rowBare: 26, margin: 4, nameMax: 40, capFont: 11 };

  function sortStudents(list) {
    return list.slice().sort(function (a, b) {
      return (b.lv - a.lv) || (Number(a.sid) - Number(b.sid)) || (String(a.sid) < String(b.sid) ? -1 : String(a.sid) > String(b.sid) ? 1 : 0);
    });
  }

  /* 房間的圓點可用區域（單位＝layout 單位）：{x,y,w,h}；z＝名稱標籤佔掉的上緣 */
  function areaOf(r, o, shortOf) {
    var hall = r.type === 'hall' || r.type === 'outside', name = shortOf ? shortOf(r) : r.name, len = Math.max(2, String(name).length);
    if (!hall) {
      var nfs = Math.min(o.nameMax, (r.w - 10) / len), top = 42 + nfs + 8, m = o.margin / o.s;
      return { x: r.x + m * 2, y: r.y + top, w: r.w - m * 4, h: r.h - top - m * 2 };
    }
    var m2 = 2 / o.s, fs = Math.min(34, r.h * .66), hs = Math.min(30, r.h * .6);
    if (r.h > r.w) { var t = r.h / 2 + hs + 10; return { x: r.x + m2 * 2, y: r.y + t, w: r.w - m2 * 4, h: r.h - t - m2 * 2 }; }
    var half = (fs + 2) * len / 2 + 14, x0 = r.x + r.w / 2 + half + 12, x1 = r.x + r.w - 24 - hs - 12;
    return { x: x0, y: r.y + m2, w: Math.max(0, x1 - x0), h: r.h - m2 * 2 };
  }

  function layoutRoom(r, list, o, shortOf) {
    var A = areaOf(r, o, shortOf), s = o.s, cell = o.pitch / s, d = o.dotD / s;
    var cols = Math.max(0, Math.floor(A.w / cell));
    var capRow = o.rowCap / s, bareRow = o.rowBare / s, withCap = A.h >= capRow, rowH = withCap ? capRow : bareRow;
    var rows = cols ? Math.max(0, Math.floor(A.h / rowH)) : 0, cap = cols * rows, n = list.length;
    var res = { id: r.id, total: n, cap: cap, cols: cols, rows: rows, withCap: withCap, area: A, shown: [], more: 0, chip: null };
    if (!n || !cap) { res.more = n; return res; }
    var showN = n > cap ? Math.max(0, cap - 1) : n, used = n > cap ? cap : n;
    var usedCols = Math.min(cols, used), x0 = A.x + (A.w - usedCols * cell) / 2;
    function pos(i) { var c = i % cols, rw = Math.floor(i / cols); return { cx: x0 + c * cell + cell / 2, cy: A.y + rw * rowH + (d / 2) }; }
    var sorted = sortStudents(list);
    for (var i = 0; i < showN; i++) { var p = pos(i), st = sorted[i]; res.shown.push({ sid: st.sid, lv: st.lv, label: st.label, ring: !!st.ring, cx: p.cx, cy: p.cy, r: d / 2 }); }
    if (n > cap) { res.more = n - showN; var pc = pos(showN); res.chip = { cx: pc.cx, cy: pc.cy, r: d / 2, label: '+' + res.more }; }
    return res;
  }

  /* layout＝window.ERG_LAYOUT；students＝[{sid,room,lv,label,ring}]；opts.width＝地圖畫面寬 px */
  function compute(layout, students, opts) {
    var o = Object.assign({}, DEF, opts || {});
    var rooms = layout.ROOMS.filter(function (r) { return r.type !== 'remote'; }), x0 = 1e9, x1 = -1e9;
    rooms.forEach(function (r) { x0 = Math.min(x0, r.x); x1 = Math.max(x1, r.x + r.w); });
    o.s = (o.width || 1240) / (x1 - x0 + 60);
    var by = {}; students.forEach(function (st) { (by[st.room] || (by[st.room] = [])).push(st); });
    var out = { scale: o.s, opts: o, rooms: {} };
    rooms.forEach(function (r) { out.rooms[r.id] = layoutRoom(r, by[r.id] || [], o, o.shortOf); });
    return out;
  }
  /* 等級外觀（o.skin）：2 級＝銀色細外圈；3 級＝金色外圈＋右上角小星。外圈半徑 r+2.3px 以內，不超過格距一半，相鄰圓點不互疊 */
  function skinMark(it, u, k) {
    if (it.lv === 2) return '<circle data-skin="2" cx="' + k(it.cx) + '" cy="' + k(it.cy) + '" r="' + k(it.r + u(2.3)) + '" fill="none" stroke="#7f929d" stroke-width="' + u(1.4) + '"/>';
    if (it.lv !== 3) return '';
    var sx = it.cx + it.r * .8, sy = it.cy - it.r * .8, R = u(5.2), q = u(2.2), p = [];
    for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, d = i % 2 ? q : R; p.push(k(sx + d * Math.cos(a)) + ',' + k(sy + d * Math.sin(a))); }
    return '<circle data-skin="3" cx="' + k(it.cx) + '" cy="' + k(it.cy) + '" r="' + k(it.r + u(2.3)) + '" fill="none" stroke="#c98f0a" stroke-width="' + u(1.8) + '"/>' +
      '<polygon data-skin="3" points="' + p.join(' ') + '" fill="#f5c542" stroke="#8a5a00" stroke-width="' + u(.9) + '" stroke-linejoin="round"/>';
  }

  /* 疊在地圖 SVG 上的圓點圖層（字串）；o：{colors:{1,2,3}, openId, esc, skin}。大小一律以畫面 px 設計，再除以 scale 換回 layout 單位 */
  function overlay(layout, lay, o) {
    var sc = lay.scale, E = o.esc || String, u = function (px) { return Math.round(px / sc * 10) / 10; }, k = function (v) { return Math.round(v * 10) / 10; };
    var ov = '<g id="liveDots" font-family="\'Noto Sans TC\',\'Microsoft JhengHei\',sans-serif">';
    layout.ROOMS.forEach(function (rm) {
      var res = lay.rooms[rm.id]; if (!res || !res.total) return;
      var open = o.openId === rm.id;
      ov += '<g data-livedots="' + E(rm.id) + '" data-n="' + res.total + '" style="cursor:pointer"><title>' + E(rm.name + '：' + res.total + ' 人，點一下展開名單') + '</title>' +
        '<rect x="' + rm.x + '" y="' + rm.y + '" width="' + rm.w + '" height="' + rm.h + '" rx="10" fill="' + (open ? '#fff3bf' : '#fff') + '" fill-opacity="' + (open ? .35 : 0) + '" stroke="' + (open ? '#e8590c' : 'none') + '" stroke-width="' + u(3) + '"/>';
      res.shown.forEach(function (it) {
        if (o.skin) ov += skinMark(it, u, k);
        ov += '<circle data-sid="' + E(it.sid) + '" cx="' + k(it.cx) + '" cy="' + k(it.cy) + '" r="' + k(it.r) + '" fill="' + o.colors[it.lv] + '" stroke="' + (it.ring ? '#e8590c' : '#1e1e1e') + '" stroke-width="' + u(it.ring ? 3 : 1.5) + '"/>' +
          '<text x="' + k(it.cx) + '" y="' + k(it.cy + u(4.5)) + '" font-size="' + u(13) + '" font-weight="900" text-anchor="middle" fill="#1e1e1e">' + it.lv + '</text>' +
          (res.withCap ? '<text data-cap="1" x="' + k(it.cx) + '" y="' + k(it.cy + it.r + u(12)) + '" font-size="' + u(11.5) + '" font-weight="700" text-anchor="middle" fill="#1e1e1e">' + E(it.label) + '</text>' : '');
      });
      if (res.chip) ov += '<circle data-chip="1" cx="' + k(res.chip.cx) + '" cy="' + k(res.chip.cy) + '" r="' + k(res.chip.r) + '" fill="#212529" stroke="#1e1e1e" stroke-width="' + u(1.5) + '"/><text x="' + k(res.chip.cx) + '" y="' + k(res.chip.cy + u(4)) + '" font-size="' + u(res.more > 99 ? 10 : 11) + '" font-weight="900" text-anchor="middle" fill="#fff">' + E(res.chip.label) + '</text>';
      ov += '</g>';
    });
    return ov + '</g>';
  }
  return { overlay: overlay, compute: compute, layoutRoom: layoutRoom, areaOf: areaOf, sortStudents: sortStudents, DEF: DEF };
});
