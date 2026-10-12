/* 單一房間的俯視圖（手機版用）：地板、牆、門、家具（色塊＋小圖示＋名稱）。回傳 SVG 字串與線索牌位置。純函式。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./minimap.js'));
  else root.ERG_ROOMVIEW = factory(root.ERG_MINIMAP);
})(typeof self !== 'undefined' ? self : this, function (MM) {
  'use strict';
  var COLORS = { desk: '#ffe8cc', counter: '#ffe8cc', bed: '#d0ebff', seats: '#b2f2bb', screen: '#868e96', board: '#ffffff', device: '#ced4da', sofa: '#eebefa',
    stall: '#e9ecef', rack: '#fff3bf', sign: '#ffec99', lightbox: '#fff9db', chair: '#fcc2d7', door: '#e8590c', glass: '#a5d8ff', scanner: '#ced4da', phone: '#ced4da' };
  function esc(s) { return MM.esc(s); }
  function num(v) { return Math.round(v * 10) / 10; }

  /* 回傳 { svg, w, h, pins:[{clue,x,y}], furniture:[...] }；座標都是房間內的相對座標 */
  function view(layout, roomId, opts) {
    opts = opts || {};
    var r = layout.room(roomId); if (!r) throw new Error('沒有這個房間：' + roomId);
    var out = [], w = r.w, h = r.h;
    out.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="-8 -8 ' + (w + 16) + ' ' + (h + 16) + '" width="100%" role="img" aria-label="' + esc(r.name) + '平面圖" font-family="\'Noto Sans TC\',sans-serif">');
    out.push('<rect x="0" y="0" width="' + w + '" height="' + h + '" rx="12" fill="' + esc(r.color || '#eee') + '" stroke="#1e1e1e" stroke-width="6"' + (r.type === 'outside' || r.type === 'hall' ? ' stroke-dasharray="14 8"' : '') + '/>');
    var furn = (layout.FURNITURE || []).filter(function (f) { return f.room === roomId; });
    furn.forEach(function (f, fi) {
      var col = COLORS[f.type] || '#e9ecef', fw = f.w || 30, fh = f.h || 20;
      /* data-f：家具在這間房的序號，手機版用來接點擊 */
      out.push('<rect data-f="' + fi + '" x="' + f.rx + '" y="' + f.ry + '" width="' + fw + '" height="' + fh + '" rx="6" fill="' + col + '" stroke="#1e1e1e" stroke-width="3" style="cursor:pointer"/>');
      if (fw >= 26 && fh >= 22) out.push('<text x="' + num(f.rx + fw / 2) + '" y="' + num(f.ry + fh / 2 + 7) + '" font-size="' + Math.min(22, fh * .6) + '" text-anchor="middle" opacity=".85">' + MM.furnitureIcon(f) + '</text>');
      if (f.label) out.push('<text x="' + num(f.rx + fw / 2) + '" y="' + num(f.ry + fh + 13) + '" font-size="12" font-weight="700" text-anchor="middle" fill="#1e1e1e" stroke="#fff" stroke-width="3" paint-order="stroke">' + esc(f.label) + '</text>');
    });
    /* 三個可見的使用中道具狀態：白板更新、候診有人、叫號螢幕有號碼。 */
    if(roomId==='nurse') out.push('<text x="105" y="39" font-size="13" font-weight="900" text-anchor="middle" fill="#1864ab">3床待評估</text><text x="105" y="51" font-size="10" text-anchor="middle" fill="#495057">家屬已到</text>');
    if(roomId==='waiting') out.push('<circle cx="76" cy="127" r="9" fill="#ff922b" stroke="#1e1e1e" stroke-width="2"/><circle cx="120" cy="127" r="9" fill="#74c0fc" stroke="#1e1e1e" stroke-width="2"/><rect x="342" y="25" width="86" height="24" fill="#343a40" opacity=".9"/><text x="385" y="42" font-size="15" font-weight="900" text-anchor="middle" fill="#fff">A017</text>');
    if(roomId==='triage') out.push('<text x="230" y="30" font-size="13" font-weight="900" text-anchor="middle" fill="#fff">A018</text>');
    (r.doors || []).forEach(function (d) {
      var cx = d.side === 'W' ? 0 : d.side === 'E' ? w : w * d.at, cy = d.side === 'N' ? 0 : d.side === 'S' ? h : h * d.at, horiz = d.side === 'N' || d.side === 'S';
      out.push('<rect x="' + num(cx - (horiz ? d.w / 2 : 7)) + '" y="' + num(cy - (horiz ? 7 : d.w / 2)) + '" width="' + (horiz ? d.w : 14) + '" height="' + (horiz ? 14 : d.w) + '" rx="3" fill="#fff" stroke="#e8590c" stroke-width="3"/>');
      out.push('<text x="' + num(cx) + '" y="' + num(cy + (d.side === 'N' ? 28 : d.side === 'S' ? -14 : 5)) + '" font-size="14" text-anchor="middle">🚪</text>');
    });
    out.push('</svg>');
    var pins = (layout.PINS || []).filter(function (p) { return p.room === roomId; }).map(function (p) { return { clue: p.clue, x: p.rx, y: p.ry }; });
    return { svg: out.join(''), w: w, h: h, pins: pins, furniture: furn };
  }
  return { view: view };
});
