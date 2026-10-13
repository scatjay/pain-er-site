/* 家具名稱放置：候選位置 → 硬障礙 → 成本最低 → 放不下就隱藏（miss），不強制重疊。
   10-13 昨晚的版面研究（docs/漫畫版面優化_研究筆記.md A3）；桌面（room.js）與手機（m.js）共用同一份，座標＝房間內相對的世界座標。
   純函式，沒有任何 DOM。 */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.ERG_LABELS = factory(); })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var PEN = { 'in': 0, in2: 0.3, in3: 0.6, below: 1, right: 2, left: 3, above: 5 };
  function ov(a, b) { return Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0; }
  function inf(r, m) { return { x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m }; }
  /* room:{w,h}；furniture:[{type,label,rx,ry,w,h}]（只放這間房的）；pins:[{rx,ry}]；stations:[{rx,ry}]（腳底座標）
     opts:{ segments(f)->[{x,w}]（沒給就整塊）, sizeOf(text)->{w,h}（世界座標，呼叫端依縮放換算）, pinW:84, pinH:42, bodyW:52, bodyH:70 }
     回傳 [{text,k,x,y,w,h,cost}]（x、y 是左上角）或 {text,miss:true}（放不下，不畫） */
  function place(room, furniture, pins, stations, opts) {
    opts = opts || {};
    var segs = opts.segments || function (f) { return [{ x: 0, w: f.w }]; }, sizeOf = opts.sizeOf, pw = opts.pinW || 84, ph = opts.pinH || 42, bw = opts.bodyW || 52, bh = opts.bodyH || 70;
    var hard = [];
    pins.forEach(function (c) { hard.push(inf({ x: c.rx - 4, y: c.ry - 4, w: pw, h: ph }, 2)); });
    stations.forEach(function (s) { hard.push(inf({ x: s.rx - bw / 2, y: s.ry - bh, w: bw, h: bh }, 2)); });
    var groups = {}, names = [];
    furniture.forEach(function (f) { if (!f.label) return; if (!groups[f.label]) { groups[f.label] = []; names.push(f.label); } groups[f.label].push(f); });
    function cands(f, s) {
      var cx = f.rx + f.w / 2, out = [];
      if (f.type !== 'door' && f.w >= s.w + 6 && f.h >= s.h + 6) segs(f).forEach(function (g) {
        if (g.w < s.w + 6) return;
        [['in', f.ry + f.h - s.h - 3], ['in2', f.ry + (f.h - s.h) / 2], ['in3', f.ry + 3]].forEach(function (v) { out.push({ k: v[0], x: f.rx + g.x + g.w / 2 - s.w / 2, y: v[1], w: s.w, h: s.h }); });
      });
      out.push({ k: 'below', x: cx - s.w / 2, y: f.ry + f.h + 3, w: s.w, h: s.h });
      out.push({ k: 'right', x: f.rx + f.w + 3, y: f.ry + (f.h - s.h) / 2, w: s.w, h: s.h });
      out.push({ k: 'left', x: f.rx - s.w - 3, y: f.ry + (f.h - s.h) / 2, w: s.w, h: s.h });
      out.push({ k: 'above', x: cx - s.w / 2, y: f.ry - s.h - 3, w: s.w, h: s.h });
      return out;
    }
    function feasible(c, placed) {
      return c.x >= 2 && c.y >= 2 && c.x + c.w <= room.w - 2 && c.y + c.h <= room.h - 2 &&
        !hard.some(function (h) { return ov(c, h); }) && !placed.some(function (p) { return ov(c, inf(p, 3)); });
    }
    function best(name, placed) {
      var b = null;
      groups[name].forEach(function (f) { cands(f, sizeOf(name)).forEach(function (c) { if (!feasible(c, placed)) return; var cost = PEN[c.k] * 40; if (!b || cost < b.cost) b = { text: name, k: c.k, x: c.x, y: c.y, w: c.w, h: c.h, cost: cost }; }); });
      return b;
    }
    var order = names.map(function (n) { var cnt = 0; groups[n].forEach(function (f) { cands(f, sizeOf(n)).forEach(function (c) { if (feasible(c, [])) cnt++; }); }); return { n: n, cnt: cnt }; })
      .sort(function (a, b) { return a.cnt - b.cnt; }).map(function (o) { return o.n; });   /* 可行位置最少的先放（判斷，不是論文結論） */
    var res = [];
    order.forEach(function (n) { var b = best(n, res.filter(function (r) { return !r.miss; })); res.push(b || { text: n, miss: true }); });
    return res;
  }
  /* 長櫃台（counter，w>=200）缺口 40；警衛櫃台（desk，100<=w<=120，入口）缺口 30（A6 用，這裡先不啟用） */
  return { place: place, PEN: PEN };
});
