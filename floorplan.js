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
        { clueId:pin.clue, pin:true, room:pin.room }, { roundness:{ type:3 }, label:{ text:pin.clue, fontSize:16 } }));
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
