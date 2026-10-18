(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ERG_FLOORPLAN = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var INK = '#1e1e1e';
  var OMIT_FRONT = { scanner:true, phone:true, seats:true, chair:true, glass:true, door:true };
  var COLORS = {
    desk:'#ffe8cc', counter:'#ffe8cc', bed:'#d0ebff', seats:'#b2f2bb',
    screen:'#495057', board:'#ffffff', device:'#ced4da', sofa:'#eebefa',
    stall:'#e9ecef', rack:'#fff3bf', sign:'#ffec99', lightbox:'#fff9db',
    chair:'#fcc2d7', door:'#e8590c', glass:'#a5d8ff'
  };

  function cloneData(data) {
    var out = {};
    Object.keys(data || {}).forEach(function (key) { out[key] = data[key]; });
    out.base = true;
    return out;
  }
  function common(id, customData) {
    return { id:id, locked:true, customData:cloneData(customData) };
  }
  function rect(id, x, y, width, height, fill, stroke, strokeWidth, roughness, customData, extra) {
    var el = common(id, customData);
    el.type = 'rectangle'; el.x = x; el.y = y; el.width = width; el.height = height;
    el.backgroundColor = fill; el.fillStyle = 'solid'; el.strokeColor = stroke;
    el.strokeWidth = strokeWidth; el.roughness = roughness;
    if (extra) Object.keys(extra).forEach(function (key) { el[key] = extra[key]; });
    return el;
  }
  function ellipse(id, x, y, width, height, fill, stroke, strokeWidth, roughness, customData, extra) {
    var el = rect(id, x, y, width, height, fill, stroke, strokeWidth, roughness, customData, extra);
    el.type = 'ellipse';
    return el;
  }
  function line(id, x1, y1, x2, y2, stroke, strokeWidth, roughness, customData, extra) {
    var el = common(id, customData);
    el.type = 'line'; el.x = x1; el.y = y1; el.width = x2 - x1; el.height = y2 - y1;
    el.points = [[0, 0], [x2 - x1, y2 - y1]];
    el.strokeColor = stroke; el.strokeWidth = strokeWidth; el.roughness = roughness;
    el.backgroundColor = 'transparent';
    if (extra) Object.keys(extra).forEach(function (key) { el[key] = extra[key]; });
    return el;
  }
  function text(id, value, x, y, size, customData, extra) {
    var el = common(id, customData);
    el.type = 'text'; el.text = value; el.x = x; el.y = y;
    el.width = String(value).length * size; el.height = size * 1.25;
    el.fontSize = size; el.fontFamily = 1; el.strokeColor = INK;
    el.backgroundColor = 'transparent'; el.roughness = 0;
    if (extra) Object.keys(extra).forEach(function (key) { el[key] = extra[key]; });
    return el;
  }
  function inRoom(room, x, y, w, h) {
    return x >= room.x - 1e-8 && y >= room.y - 1e-8 &&
      x + w <= room.x + room.w + 1e-8 && y + h <= room.y + room.h + 1e-8;
  }
  function assertInside(room, x, y, w, h, what) {
    if (!inRoom(room, x, y, w, h)) throw new Error(what + ' 超出房間 ' + room.id);
  }
  function shade(hex) {
    var match = /^#([0-9a-f]{6})$/i.exec(hex);
    if (!match) return hex;
    var n = parseInt(match[1], 16);
    function channel(shift) {
      var value = Math.floor(((n >> shift) & 255) * 0.8).toString(16);
      return value.length < 2 ? '0' + value : value;
    }
    return '#' + channel(16) + channel(8) + channel(0);
  }
  function roomWalls(room, out) {
    var sides = ['N', 'S', 'W', 'E'];
    sides.forEach(function (side) {
      var horizontal = side === 'N' || side === 'S';
      var fixed = side === 'N' ? room.y : side === 'S' ? room.y + room.h : side === 'W' ? room.x : room.x + room.w;
      var start = horizontal ? room.x : room.y;
      var end = start + (horizontal ? room.w : room.h);
      var doors = (room.doors || []).filter(function (d) { return d.side === side; }).map(function (d) {
        var center = horizontal ? room.x + room.w * d.at : room.y + room.h * d.at;
        var width = Math.max(0, Math.min(d.w, end - start));
        var a = Math.max(start, Math.min(end - width, center - width / 2));
        return { a:a, b:a + width };
      }).sort(function (a, b) { return a.a - b.a; });
      var cursor = start, segment = 0;
      function wall(a, b) {
        if (b <= a) return;
        var x1 = horizontal ? a : fixed, y1 = horizontal ? fixed : a;
        var x2 = horizontal ? b : fixed, y2 = horizontal ? fixed : b;
        out.push(line('wall-' + room.id + '-' + side + '-' + segment++, x1, y1, x2, y2,
          INK, 5, 2, { room:room.id, wall:true }));
      }
      doors.forEach(function (d, i) {
        wall(cursor, d.a);
        var ca = horizontal ? d.a : fixed, cb = horizontal ? d.b : fixed;
        var ya = horizontal ? fixed : d.a, yb = horizontal ? fixed : d.b;
        out.push(ellipse('post-' + room.id + '-' + side + '-' + i + '-a', ca - 5, ya - 5, 10, 10,
          '#e8590c', INK, 1, 2, { room:room.id, doorPost:true }));
        out.push(ellipse('post-' + room.id + '-' + side + '-' + i + '-b', cb - 5, yb - 5, 10, 10,
          '#e8590c', INK, 1, 2, { room:room.id, doorPost:true }));
        cursor = Math.max(cursor, d.b);
      });
      wall(cursor, end);
    });
  }

  function buildFloorplanSkeleton(layout, clues) {
    if (!layout || !Array.isArray(layout.ROOMS) || !Array.isArray(layout.FURNITURE) || !Array.isArray(layout.PINS))
      throw new Error('layout 缺少必要資料');
    clues = clues || [];
    var rooms = layout.ROOMS, byRoom = {}, out = [];
    rooms.forEach(function (r) { byRoom[r.id] = r; });
    var clueIds = {};
    clues.forEach(function (c) {
      if (!c || c.id == null) throw new Error('clue 必須有 id');
      if (clueIds[c.id]) throw new Error('clues id 重複：' + c.id);
      clueIds[c.id] = true;
    });
    var pinIds = {};
    layout.PINS.forEach(function (pin) { pinIds[pin.clue] = true; });
    Object.keys(clueIds).forEach(function (id) { if (!pinIds[id]) throw new Error('clue 沒有對應 PIN：' + id); });
    Object.keys(pinIds).forEach(function (id) { if (!clueIds[id]) throw new Error('PIN 不在 clues：' + id); });

    // Floor polygons are emitted first, in the layout's stable room order.
    rooms.forEach(function (r) {
      out.push(rect('floor-' + r.id, r.x, r.y, r.w, r.h, r.color, 'transparent', 0, 0,
        { room:r.id }, { strokeWidth:0 }));
    });
    /* 10-18 美化：地板磁磚線、牆邊踢腳板（只是畫面，不影響任何邏輯；id 不含家具／線索的標記） */
    rooms.forEach(function (r) {
      if (r.type !== 'room' && r.type !== 'remote') return;
      if (r.type === 'room') {
        var step = 60, tint = '#adb5bd', c = 0;
        for (var tx = r.x + step; tx < r.x + r.w - 1; tx += step) { c += 1; out.push(line('tile-' + r.id + '-v' + c, tx, r.y + 14, tx, r.y + r.h, tint, 1, 0, { deco:true }, { opacity:30 })); }
        c = 0;
        for (var ty = r.y + 14 + step; ty < r.y + r.h - 1; ty += step) { c += 1; out.push(line('tile-' + r.id + '-h' + c, r.x, ty, r.x + r.w, ty, tint, 1, 0, { deco:true }, { opacity:30 })); }
        out.push(rect('skirt-' + r.id, r.x, r.y, r.w, 14, shade(shade(r.color)), 'transparent', 0, 0, { deco:true }));
        out.push(line('skirt-line-' + r.id, r.x, r.y + 14, r.x + r.w, r.y + 14, '#868e96', 2, 0, { deco:true }, { opacity:60 }));
      }
    });
    /* 10-18 美化：每間房放一盆植物、一個牆上時鐘、一塊地墊（只放在空位；位置固定，不用亂數） */
    (function () {
      var occ = {};
      function box(roomId, x, y, w, h) { (occ[roomId] = occ[roomId] || []).push({ x:x, y:y, w:w, h:h }); }
      layout.FURNITURE.forEach(function (f) { var q = layout.abs(f.room, f.rx, f.ry); box(f.room, q.x - 4, q.y - 6, f.w + 12, f.h + 30); });
      layout.PINS.forEach(function (pin) { var rm = byRoom[pin.room], q = layout.abs(pin.room, pin.rx, pin.ry); if (!rm) return; var px = Math.max(rm.x, Math.min(rm.x + rm.w - 76, q.x)), py = Math.max(rm.y + 5, Math.min(rm.y + rm.h - 34, q.y)); box(pin.room, px - 8, py - 12, 92, 52); });
      rooms.forEach(function (r) { if (r.type === 'room') { box(r.id, r.x, r.y, r.name.length * 24 + 24, 40); box(r.id, r.x + r.w - 54, r.y, 54, 54); } });
      function free(r, x, y, w, h) {
        if (x < r.x + 28 || y < r.y + 30 || x + w > r.x + r.w - 28 || y + h > r.y + r.h - 28) return false;
        return !(occ[r.id] || []).some(function (b) { return x < b.x + b.w && x + w > b.x && y < b.y + b.h && y + h > b.y; });
      }
      function grid(r, w, h, key) { var c = []; for (var gx = r.x + 28; gx + w <= r.x + r.w - 28; gx += 12) for (var gy = r.y + 30; gy + h <= r.y + r.h - 28; gy += 12) c.push([gx, gy]); return c.sort(function (a, b) { return key(a) - key(b); }); }
      function find(r, w, h, cands) { for (var i = 0; i < cands.length; i++) { if (free(r, cands[i][0], cands[i][1], w, h)) return cands[i]; } return null; }
      rooms.forEach(function (r) {
        if (r.type !== 'room') return;
        var cx = { deco:true };
        /* 地墊：找一塊 110×60 的空地（由中央往外排幾個候選位置） */
        var rugAt = find(r, 110, 60, grid(r, 110, 60, function (a) { return Math.abs(a[0] + 55 - (r.x + r.w / 2)) + Math.abs(a[1] + 30 - (r.y + r.h * .55)); }));
        if (rugAt) { out.push(rect('rug-' + r.id, rugAt[0], rugAt[1], 110, 60, '#ffc9c9', INK, 1, 1, cx, { opacity:55, roundness:{ type:3 } })); out.push(rect('rug-in-' + r.id, rugAt[0] + 8, rugAt[1] + 8, 94, 44, 'transparent', '#e03131', 1, 0, cx, { opacity:55, strokeStyle:'dashed', roundness:{ type:3 } })); box(r.id, rugAt[0], rugAt[1], 110, 60); }
        /* 盆栽：優先放右下、左下的角落 */
        var plantAt = find(r, 30, 44, grid(r, 30, 44, function (a) { var dx = Math.min(a[0] - r.x, r.x + r.w - a[0] - 30), dy = Math.min(a[1] - r.y, r.y + r.h - a[1] - 44); return dx + dy; }));
        if (plantAt) { var px = plantAt[0], py = plantAt[1];
          out.push(ellipse('plant-leaf1-' + r.id, px + 1, py, 14, 24, '#69db7c', INK, 1.5, 1, cx));
          out.push(ellipse('plant-leaf2-' + r.id, px + 14, py + 4, 14, 22, '#40c057', INK, 1.5, 1, cx));
          out.push(rect('plant-pot-' + r.id, px + 5, py + 26, 20, 16, '#e8590c', INK, 1.5, 1, cx)); box(r.id, px - 6, py - 6, 42, 56); }
        /* 牆上時鐘：掛在踢腳板上緣，靠右、避開步驟圓章與線索牌 */
        var clk = find({ id:r.id, x:r.x - 28, y:r.y - 30, w:r.w + 56, h:r.h + 56 }, 22, 22, [[r.x + r.w * .62, r.y + 18], [r.x + r.w * .5, r.y + 18], [r.x + r.w * .74, r.y + 18]]);
        if (clk) { var qx = clk[0], qy = clk[1];
          out.push(ellipse('clock-' + r.id, qx, qy, 22, 22, '#ffffff', INK, 2, 1, cx));
          out.push(line('clock-h-' + r.id, qx + 11, qy + 11, qx + 11, qy + 5, INK, 1.5, 0, cx));
          out.push(line('clock-m-' + r.id, qx + 11, qy + 11, qx + 16, qy + 13, INK, 1.5, 0, cx)); }
      });
    })();
    rooms.forEach(function (r) { if (r.type === 'room') roomWalls(r, out); });

    layout.FURNITURE.forEach(function (f, n) {
      var room = byRoom[f.room], color = COLORS[f.type], p;
      if (!room) throw new Error('第 ' + (n + 1) + ' 件家具所屬房間不存在：' + f.room);
      var known = !!color || f.type === 'scanner' || f.type === 'phone';
      if (!known) throw new Error('第 ' + (n + 1) + ' 件家具類型未知：' + f.type);
      p = layout.abs(f.room, f.rx, f.ry);
      var x = p.x, y = p.y, w = f.w, h = f.h, custom = { room:f.room, furniture:true, furnitureIndex:n };
      var bodyBottom = y + h;
      assertInside(room, x, y, w + 6, h + 6, '第 ' + (n + 1) + ' 件家具陰影');
      out.push(rect('fshadow-' + n, x + 6, y + 6, w, h, '#868e9644', 'transparent', 0, 0, custom));

      if (f.type === 'seats') {
        var count = Math.max(1, Math.floor(w / 40)), seatW = 36, gap = (w - count * seatW) / (count + 1);
        for (var si = 0; si < count; si++) {
          var sx = x + gap * (si + 1) + seatW * si;
          assertInside(room, sx, y, seatW, h, '第 ' + (n + 1) + ' 件家具本體');
          out.push(rect('furn-' + n + (count > 1 ? '-' + si : ''), sx, y, seatW, h, color, INK, 3, 2, custom));
        }
      } else if (f.type === 'scanner') {
        out.push(ellipse('furn-' + n, x, y, w, h, '#dee2e6', INK, 3, 2, custom));
        out.push(ellipse('furn-' + n + '-inner', x + w * .2, y + h * .2, w * .6, h * .6, '#495057', INK, 3, 2, custom));
      } else if (f.type === 'phone') {
        out.push(rect('furn-' + n, x, y, w, h, '#212529', INK, 3, 2, custom, { roundness:{ type:3 } }));
        var smsH = h * .15, smsGap = (h - smsH * 3) / 4;
        for (var mi = 0; mi < 3; mi++) out.push(rect('furn-' + n + '-sms-' + mi,
          x + w * .1, y + smsGap * (mi + 1) + smsH * mi, w * .8, smsH, '#ffffff', 'transparent', 0, 0, custom));
      } else if (f.type === 'chair') {
        out.push(ellipse('furn-' + n, x, y, w, h, color, INK, 3, 2, custom));
      } else {
        out.push(rect('furn-' + n, x, y, w, h, color, INK, 3, 2, custom,
          f.type === 'glass' ? { opacity:50 } : null));
        if (f.type === 'bed') out.push(ellipse('furn-' + n + '-pillow', x + 4, y + 4, h * .7, h * .25,
          '#ffffff', INK, 1, 2, custom));
      }
      if (!OMIT_FRONT[f.type]) {
        var frontH = Math.min(10, h * .25);
        out.push(rect('ffront-' + n, x, bodyBottom - frontH, w, frontH, shade(color), 'transparent', 0, 0, custom));
      }
      /* 10-18 美化：家具上的小細節（顯示器、鍵盤、枕頭被子、椅背、X 光片…）；位置都在家具範圍內 */
      (function () {
        var d = function (suffix) { return 'fdeco-' + n + '-' + suffix; };
        if (w < 30 || h < 14) return;
        if (f.type === 'desk') {
          var mw = Math.min(30, w * .3), mh = Math.min(18, h * .45);
          out.push(rect(d('mon'), x + w * .1, y + 4, mw, mh, '#495057', INK, 2, 1, custom));
          out.push(rect(d('scr'), x + w * .1 + 3, y + 7, mw - 6, mh - 6, '#a5d8ff', 'transparent', 0, 0, custom));
          out.push(rect(d('kb'), x + w * .1, y + 6 + mh, mw, 4, '#ced4da', INK, 1, 0, custom));
          out.push(rect(d('paper'), x + w * .62, y + 5, 16, 11, '#ffffff', INK, 1, 1, custom));
        } else if (f.type === 'counter') {
          out.push(ellipse(d('bell'), x + w * .5 - 6, y + 4, 12, 9, '#ffd43b', INK, 2, 1, custom));
          out.push(rect(d('tray'), x + w * .15, y + 5, 22, 8, '#ffffff', INK, 1, 1, custom));
        } else if (f.type === 'bed') {
          out.push(rect(d('blanket'), x + w * .34, y + 3, w * .64 - 3, h - 11, '#74c0fc', INK, 1.5, 1, custom, { opacity:80 }));
          out.push(line(d('fold'), x + w * .34, y + h * .35, x + w * .98 - 3, y + h * .35, INK, 1, 1, custom));
        } else if (f.type === 'seats') {
          var cnt = Math.max(1, Math.floor(w / 40)), sW = 36, gp = (w - cnt * sW) / (cnt + 1);
          for (var bi = 0; bi < cnt; bi++) {
            var bx = x + gp * (bi + 1) + sW * bi;
            if (y - 5 >= room.y) out.push(rect(d('back-' + bi), bx + 3, y - 5, sW - 6, 6, shade(shade(color)), INK, 2, 1, custom));
          }
        } else if (f.type === 'sofa') {
          out.push(line(d('cu1'), x + w / 3, y + 4, x + w / 3, y + h - 12, INK, 1.5, 1, custom));
          out.push(line(d('cu2'), x + 2 * w / 3, y + 4, x + 2 * w / 3, y + h - 12, INK, 1.5, 1, custom));
        } else if (f.type === 'lightbox') {
          out.push(rect(d('film'), x + 6, y + 6, w - 12, h - 12, '#f1f3f5', INK, 1, 0, custom));
          out.push(line(d('spine'), x + w / 2, y + 9, x + w / 2, y + h - 9, '#868e96', 2, 1, custom));
          for (var ri = 0; ri < 3; ri++) out.push(ellipse(d('rib-' + ri), x + w / 2 - 30, y + 12 + ri * 16, 60, 12, 'transparent', '#868e96', 1.5, 1, custom));
        } else if (f.type === 'rack') {
          out.push(line(d('sh1'), x + 3, y + h * .38, x + w - 3, y + h * .38, INK, 2, 1, custom));
          out.push(line(d('sh2'), x + 3, y + h * .7, x + w - 3, y + h * .7, INK, 2, 1, custom));
          out.push(rect(d('b1'), x + 6, y + 6, 10, h * .3, '#fa5252', INK, 1, 1, custom));
          out.push(rect(d('b2'), x + w - 18, y + 6, 10, h * .3, '#4dabf7', INK, 1, 1, custom));
        } else if (f.type === 'screen') {
          var wy = y + h * .5;
          out.push(line(d('w1'), x + 6, wy, x + w * .3, wy - h * .22, '#69db7c', 2, 0, custom));
          out.push(line(d('w2'), x + w * .3, wy - h * .22, x + w * .5, wy + h * .2, '#69db7c', 2, 0, custom));
          out.push(line(d('w3'), x + w * .5, wy + h * .2, x + w * .75, wy - h * .18, '#69db7c', 2, 0, custom));
        } else if (f.type === 'board') {
          out.push(line(d('t1'), x + 8, y + h * .3, x + w - 14, y + h * .3, '#adb5bd', 2, 0, custom));
          out.push(line(d('t2'), x + 8, y + h * .5, x + w - 26, y + h * .5, '#adb5bd', 2, 0, custom));
          out.push(ellipse(d('mag'), x + w - 12, y + 4, 7, 7, '#fa5252', INK, 1, 0, custom));
        } else if (f.type === 'device') {
          out.push(ellipse(d('l1'), x + 5, y + 4, 6, 6, '#fa5252', INK, 1, 0, custom));
          out.push(ellipse(d('l2'), x + 15, y + 4, 6, 6, '#51cf66', INK, 1, 0, custom));
        } else if (f.type === 'stall') {
          out.push(ellipse(d('knob'), x + w - 12, y + h * .5, 6, 6, '#ffd43b', INK, 1, 0, custom));
        }
      })();
      if (f.curtain) {
        assertInside(room, x, y - 12, w, 0, '第 ' + (n + 1) + ' 件家具簾子');
        out.push(line('curtain-' + n, x, y - 12, x + w, y - 12, INK, 2, 2, custom, { strokeStyle:'dashed' }));
      }
      if (typeof f.label === 'string' && f.label.length) {
        var labelW = f.label.length * 14, labelH = 17.5, lx = x + (w - labelW) / 2, ly = bodyBottom + 4;
        // Keep the label below the object where possible; compact labels move above when a fixture touches the room edge.
        if (ly + labelH > room.y + room.h) ly = y - labelH - 4;
        lx = Math.max(room.x, Math.min(room.x + room.w - labelW, lx));
        assertInside(room, lx, ly, labelW, labelH, '第 ' + (n + 1) + ' 件家具標籤');
        out.push(text('flabel-' + n, f.label, lx, ly, 14, custom));
      }
    });

    var steps = rooms.filter(function (r) { return r.step != null; }).slice().sort(function (a, b) { return a.step - b.step; });
    for (var ri = 0; ri + 1 < steps.length; ri++) {
      var a = steps[ri], b = steps[ri + 1], ax = a.x + a.w / 2, ay = a.y + a.h / 2;
      var bx = b.x + b.w / 2, by = b.y + b.h / 2;
      out.push(line('route-' + a.step + '-' + b.step, ax, ay, bx, by, '#0b7a75', 4, 2,
        { route:true }, { strokeStyle:'dashed', endArrowhead:'arrow' }));
      out[out.length - 1].points = [[0, 0], [bx - ax, by - ay]];
      out[out.length - 1].type = 'arrow';
    }

    var pinBoxes = [];
    layout.PINS.forEach(function (pin) {
      var room = byRoom[pin.room];
      if (!room) throw new Error('PIN 所屬房間不存在：' + pin.room);
      var p = layout.abs(pin.room, pin.rx, pin.ry), w = 76, h = 34;
      // Some supplied pins sit too close to a room edge for their 76×34 card and nail.
      var x = Math.max(room.x, Math.min(room.x + room.w - w, p.x));
      var y = Math.max(room.y + 5, Math.min(room.y + room.h - h, p.y));
      assertInside(room, x, y, w, h, 'PIN ' + pin.clue);
      for (var pi = 0; pi < pinBoxes.length; pi++) {
        var q = pinBoxes[pi];
        if (x < q.x + q.w && x + w > q.x && y < q.y + q.h && y + h > q.y)
          throw new Error('PIN 重疊：' + q.id + ' / ' + pin.clue);
      }
      pinBoxes.push({ id:pin.clue, x:x, y:y, w:w, h:h });
      out.push(rect('pin-' + pin.clue, x, y, w, h, '#ffd43b', INK, 3, 2,
        { clueId:pin.clue, pin:true, room:pin.room }, { roundness:{ type:3 }, label:{ text:'線索 ' + pin.clue, fontSize:13 } }));   /* 10-12：牌面寫「線索 C-04」，只寫編號看不懂 */
      out.push(ellipse('pinhead-' + pin.clue, x + w / 2 - 5, y - 5, 10, 10, '#fa5252', INK, 1, 2,
        { clueId:pin.clue, room:pin.room, pinHead:true }));
    });

    rooms.forEach(function (r) {
      if (r.type === 'room' || r.type === 'remote') {
        out.push(text('rtitle-' + r.id, r.name, r.x + 10, r.y + 8, 22, { room:r.id, title:true }));
        if (r.step != null) out.push(ellipse('step-' + r.step, r.x + r.w - 44, r.y + 10, 34, 34,
          '#0b7a75', INK, 2, 2, { room:r.id, step:r.step },
          { label:{ text:String(r.step), fontSize:20, strokeColor:'#ffffff' } }));
      } else if (r.type === 'hall' || r.type === 'outside') {
        var titleW = r.name.length * 18;
        out.push(text('rtitle-' + r.id, r.name, r.x + (r.w - titleW) / 2, r.y + 6, 18,
          { room:r.id, title:true }));
      }
    });
    var ids = {};
    out.forEach(function (el) {
      if (ids[el.id]) throw new Error('元素 id 重複：' + el.id);
      ids[el.id] = true;
    });
    return out;
  }

  return { buildFloorplanSkeleton:buildFloorplanSkeleton };
});
