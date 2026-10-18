/* 場景深度（z-order）：誰擋住誰。純函式，桌面（room.js）與手機（m.js）共用，Node 可直接測。
   10-18 重做（docs/ZORDER_RESEARCH.md 建議方案 1–3）：
   ① 腳印與正面外觀分開：家具矩形（rx, ry, w, h）是腳印，決定「站不站得進去、排序在哪」；
      「站在後面時被擋住身體的多少」改用 occ（占人物高度的比例，依家具類型有預設值，單件可覆寫）。
   ② 切掉的高度＝ occ × 人物高度（比例，不是世界座標的絕對值），所以桌面縮放 1、2.13 與手機結果一致；
      但只切在家具矩形裡面（矩形是唯一畫著家具的地方，切出去會露出空地板），所以淺的家具會被矩形深度限制。
      不再有「被切超過 70% 就整個不切」——人在家具範圍內，永遠被擋一截，不會浮在桌面上。
   ③ 排序以「畫面上實際位置」為準，加決勝鍵：同一個 y，「我」永遠在最上層，其他人用 id 雜湊（穩定、不隨重繪翻轉）。
   家具欄位（layout.js FURNITURE，全部可省略）：
     occ          0~1，站在後面時擋住人物下半身的比例；省略＝依 type 的預設值（PROFILE）；0＝不擋
     sortY        排序基準線（房間內相對 y）；省略＝家具下緣 ry+h（前緣）。腳底 ≥ sortY 算站在前面
     behindDepth  從 sortY 往後算多遠以內算「站在後面」；省略＝家具高度 h
   站點欄位（layout.js STATIONS）：behind＝站在哪件家具（label）後面；座標必須落在該家具前緣內側 2 單位（見 test_depth.js）。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ERG_DEPTH = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  /* 依類型的預設擋人比例。sit／lie 是給「坐、躺」姿勢用的記號（這一輪還沒畫姿勢，只留資料）。 */
  var PROFILE = {
    desk: { occ: .45 }, counter: { occ: .45 }, device: { occ: .50 },
    bed: { occ: .35, lie: true }, sofa: { occ: .40, sit: true }, scanner: { occ: .60 },
    rack: { occ: .75 }, stall: { occ: .85 }, screen: { occ: .30 }, glass: { occ: .40 },
    seats: { occ: 0, sit: true }, chair: { occ: 0, sit: true }
  };
  var OCCLUDE = {}; Object.keys(PROFILE).forEach(function (k) { if (PROFILE[k].occ > 0) OCCLUDE[k] = 1; });
  var MIN_H = 18;            /* 太薄的不擋（避免地墊、扁的裝置） */
  var MIN_CUT = .25;         /* 切出來的橫條薄於這個世界單位就不切（避免 1 像素的碎邊） */
  var TIE_ME = 15, TIE_N = 15;

  function occOf(f) {
    if (!f || (f.h || 0) < MIN_H) return 0;
    if (typeof f.occ === 'number') return Math.max(0, Math.min(1, f.occ));
    var p = PROFILE[f.type]; return p ? p.occ : 0;
  }
  function sortYOf(f) { return typeof f.sortY === 'number' ? f.sortY : f.ry + (f.h || 0); }          /* 房間內相對 y */
  function depthOf(f) { return typeof f.behindDepth === 'number' ? f.behindDepth : (f.h || 0); }

  /* 層級：腳底 y（畫面上實際顯示的位置）決定先後；y 以 0.25 單位為格（每格留 20 個層級），格內用 tie 決勝。tie：0–14 是 NPC（id 雜湊），15 是「我」。 */
  function z(footY, tie) { return Math.round(footY * 4) * 20 + 2 + (tie | 0); }
  function tie(id) {
    if (id === 'me') return TIE_ME;
    var h = 5381, s = String(id); for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return h % TIE_N;
  }
  /* 家具前緣線（疊層）的層級：同一格內排在所有人物之下，所以腳底在前緣之前（較小的 y）的人被它蓋住，在前緣之後的人蓋住它 */
  function frontZ(sortY) { return Math.round(sortY * 4) * 20 + 1; }

  /* furniture：[{ room, type, rx, ry, w, h, occ?, sortY?, behindDepth? }]；room：{ id, x, y }；
     tok：{ x（腳底中心）, y（腳底）, w, h（人物身體在世界座標的寬高）}。回傳要切掉的矩形（世界座標）。 */
  function cutouts(furniture, room, tok) {
    var out = [];
    if (D.disabled) return out;
    var bx0 = tok.x - tok.w / 2, bx1 = tok.x + tok.w / 2;
    (furniture || []).forEach(function (f) {
      if (f.room !== room.id) return;
      var occ = occOf(f); if (!(occ > 0)) return;
      var fx0 = room.x + f.rx, fy0 = room.y + f.ry, fx1 = fx0 + (f.w || 0), fy1 = fy0 + (f.h || 0), sy = room.y + sortYOf(f);
      if (!(tok.y < sy && tok.y > sy - depthOf(f))) return;          /* 站在前面（≥ 排序線）或離得遠：不擋 */
      var top = Math.max(fy0, tok.y - occ * tok.h), bot = Math.min(tok.y, fy1);
      var x0 = Math.max(bx0, fx0), x1 = Math.min(bx1, fx1);
      if (x1 - x0 < 2 || bot - top < MIN_CUT) return;
      out.push({ x: x0, y: top, w: x1 - x0, h: bot - top });
    });
    return out;
  }

  /* 被遮住的面積比例（人物方塊 w×h 內；重疊的切塊只算一次）。測試與量測用。 */
  function hiddenRatio(furniture, room, tok) {
    var rs = cutouts(furniture, room, tok); if (!rs.length) return 0;
    var xs = [], a = 0; rs.forEach(function (r) { xs.push(r.x, r.x + r.w); }); xs.sort(function (p, q) { return p - q; });
    for (var i = 0; i + 1 < xs.length; i++) {
      var x0 = xs[i], x1 = xs[i + 1]; if (x1 - x0 <= 0) continue;
      var ys = rs.filter(function (r) { return r.x <= x0 && r.x + r.w >= x1; }).map(function (r) { return [r.y, r.y + r.h]; }).sort(function (p, q) { return p[0] - q[0]; }), end = -1e18;
      ys.forEach(function (v) { if (v[1] > end) { a += (x1 - x0) * (v[1] - Math.max(v[0], end)); end = v[1]; } });
    }
    return a / (tok.w * tok.h);
  }

  /* 轉成 CSS clip-path（evenodd）：rects 是螢幕座標（相對於被切元素左上角），box 是元素尺寸。沒有要切的回傳 'none'。 */
  function clipPath(rects, box) {
    if (!rects.length) return 'none';
    var d = 'M0 0H' + box.w + 'V' + box.h + 'H0Z';
    rects.forEach(function (r) { d += 'M' + r.x + ' ' + r.y + 'h' + r.w + 'v' + r.h + 'h' + (-r.w) + 'Z'; });
    return 'path(evenodd,"' + d + '")';
  }

  /* 一個人物該套的 clip-path：畫面層只要量好像素尺寸交進來，桌面與手機共用同一條公式。
     g：{ x, y（腳底，世界座標）, scale（螢幕像素 ÷ 世界單位）, bw, bh（身體 svg 的像素寬高）, boxW, boxH（被切元素的像素寬高）, footTop（腳底在被切元素內離上緣幾像素）}
     回傳 { css, rects（世界座標）}。 */
  function clipFor(furniture, room, g) {
    var rects = room ? cutouts(furniture, room, { x: g.x, y: g.y, w: g.bw / g.scale, h: g.bh / g.scale }) : [];
    var pix = rects.map(function (q) { return { x: (q.x - g.x) * g.scale + g.boxW / 2, y: (q.y - g.y) * g.scale + g.footTop, w: q.w * g.scale, h: q.h * g.scale }; });
    return { css: clipPath(pix, { w: g.boxW, h: g.boxH }), rects: rects };
  }

  var D = { PROFILE: PROFILE, OCCLUDE: OCCLUDE, MIN_H: MIN_H, occOf: occOf, sortYOf: sortYOf, depthOf: depthOf, z: z, tie: tie, frontZ: frontZ,
            cutouts: cutouts, hiddenRatio: hiddenRatio, clipPath: clipPath, clipFor: clipFor, disabled: false };
  return D;
});
