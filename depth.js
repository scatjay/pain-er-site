/* 場景深度（z-order）：誰擋住誰。
   規則一：人與人之間，腳底 y 大的在前面（z = 腳底 y）。
   規則二：人與家具之間，腳底落在家具「腳印範圍」（家具矩形）裡，表示站在它後面，被家具擋住的部分要切掉；
           腳底在家具前緣之外（y 比家具下緣大）表示站在前面，不擋；腳底在家具上緣之外（y 比家具上緣小）表示離得夠遠，身體不會碰到家具。
   只有「有高度」的家具會擋人（桌、櫃台、設備、床、沙發、掃描儀、架子、隔間）；椅子、告示、門、地墊不擋。
   純函式：回傳要切掉的矩形（世界座標），由畫面層用 clip-path 切掉角色被擋住的那一塊，被切掉的地方會露出底下 Excalidraw 畫的家具。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ERG_DEPTH = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var OCCLUDE = { desk: 1, counter: 1, device: 1, bed: 1, sofa: 1, scanner: 1, rack: 1, stall: 1, screen: 1, glass: 1 };
  var MIN_H = 18;           /* 太薄的不擋（避免地墊、扁的裝置） */
  var MAX_CUT = 0.7;        /* 被切掉超過這個比例就不切，避免角色整個消失 */

  function z(footY) { return Math.round(footY * 10); }

  /* furniture：[{ room, type, rx, ry, w, h }]；room：{ id, x, y }；tok：{ x（腳底中心）, y（腳底）, w, h（角色在世界座標的寬高）} */
  function cutouts(furniture, room, tok) {
    var out = [], bx0 = tok.x - tok.w / 2, bx1 = tok.x + tok.w / 2, by0 = tok.y - tok.h, by1 = tok.y, area = tok.w * tok.h, cut = 0;
    (furniture || []).forEach(function (f) {
      if (f.room !== room.id || !OCCLUDE[f.type] || (f.h || 0) < MIN_H) return;
      var fx0 = room.x + f.rx, fy0 = room.y + f.ry, fx1 = fx0 + (f.w || 0), fy1 = fy0 + (f.h || 0);
      if (!(tok.y > fy0 && tok.y < fy1)) return;                 /* 腳底不在家具範圍內：不是「站在後面」 */
      var x0 = Math.max(bx0, fx0), x1 = Math.min(bx1, fx1), y0 = Math.max(by0, fy0), y1 = Math.min(by1, fy1);
      if (x1 - x0 < 2 || y1 - y0 < 2) return;
      out.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }); cut += (x1 - x0) * (y1 - y0);
    });
    return cut / area > MAX_CUT ? [] : out;
  }

  /* 轉成 CSS clip-path（evenodd）：rects 是螢幕座標（相對於元素左上角），box 是元素尺寸。沒有要切的回傳 'none'。 */
  function clipPath(rects, box) {
    if (!rects.length) return 'none';
    var d = 'M0 0H' + box.w + 'V' + box.h + 'H0Z';
    rects.forEach(function (r) { d += 'M' + r.x + ' ' + r.y + 'h' + r.w + 'v' + r.h + 'h' + (-r.w) + 'Z'; });
    return 'path(evenodd,"' + d + '")';
  }

  return { OCCLUDE: OCCLUDE, z: z, cutouts: cutouts, clipPath: clipPath };
});
