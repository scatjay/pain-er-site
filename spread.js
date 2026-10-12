/* 讓同一個房間裡的人不要疊在一起：對每個人做幾輪「互相推開」，並限制在房間範圍內。純函式。
   items：[{ id, x, y, room, fixed? }]（fixed 的不會被推動，例如玩家自己）；
   opts：{ rx, ry（橢圓距離，預設 64×34）, iter, bounds:{roomId:{x,y,w,h}}, pad } → { id: {x,y} } */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ERG_SPREAD = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  function spread(items, opts) {
    opts = opts || {};
    var rx = opts.rx || 64, ry = opts.ry || 34, iter = opts.iter || 8, pad = opts.pad === undefined ? 24 : opts.pad, bounds = opts.bounds || {};
    var pts = items.map(function (it, i) { return { id: it.id, x: it.x, y: it.y, ox: it.x, oy: it.y, room: it.room, fixed: !!it.fixed, i: i }; });
    var byRoom = {};
    pts.forEach(function (p) { (byRoom[p.room || ''] = byRoom[p.room || ''] || []).push(p); });
    Object.keys(byRoom).forEach(function (rid) {
      var g = byRoom[rid], b = bounds[rid];
      for (var k = 0; k < iter; k++) {
        for (var a = 0; a < g.length; a++) for (var c = a + 1; c < g.length; c++) {
          var p = g[a], q = g[c], dx = q.x - p.x, dy = q.y - p.y, d = Math.sqrt((dx / rx) * (dx / rx) + (dy / ry) * (dy / ry));
          if (d >= 1) continue;
          if (d < 1e-6) { dx = ((p.i + q.i) % 2 ? 1 : -1) * 0.5; dy = 0.2; d = Math.sqrt((dx / rx) * (dx / rx) + (dy / ry) * (dy / ry)); }
          var push = (1 - d) * 0.5, ux = dx / (d * rx * rx) * 0.0 + dx / d / rx, uy = dy / d / ry;   /* 單位方向（橢圓座標） */
          var mx = ux * rx * push, my = uy * ry * push;
          if (p.fixed && q.fixed) continue;
          if (p.fixed) { q.x += mx * 2; q.y += my * 2; }
          else if (q.fixed) { p.x -= mx * 2; p.y -= my * 2; }
          else { p.x -= mx; p.y -= my; q.x += mx; q.y += my; }
        }
        if (b) g.forEach(function (p) { if (p.fixed) return; p.x = Math.max(b.x + pad, Math.min(b.x + b.w - pad, p.x)); p.y = Math.max(b.y + 40, Math.min(b.y + b.h - 6, p.y)); });
      }
    });
    var out = {}; pts.forEach(function (p) { out[p.id] = { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 }; });
    return out;
  }
  return { spread: spread };
});
