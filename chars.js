/* 「醜萌」角色繪圖：用程式畫出粗糙、歪斜、表情無奈的簡筆人物（SVG 字串）。
   風格借用的是近年流行的粗線條、無奈表情、大頭小身的醜萌風，不使用任何迷因內容。
   look：{ skin, outfit, head:'egg'|'pear'|'square', hair:'bald'|'tuft'|'curl'|'cap', eyes:'dots'|'droopy'|'spiral',
          mouth:'flat'|'frown'|'open'|'teeth', prop:'bandage'|'phone'|'mask'|'bottle'|'crutch'|'clipboard'|'nursecap'|'guardhat'|'headmirror'|'tie'|'balloon' }
   opts：{ seed, mood:'idle'|'busy'|'angry'|'sleepy'|'waiting', label, labelColor, size }
   純函式：相同輸入相同輸出（用 seed 決定歪斜程度）。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ERG_CHARS = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  var INK = '#1e1e1e';

  function rng(seed) {
    var s = (seed >>> 0) || 1;
    return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return (s % 100000) / 100000; };
  }
  function hash(str) { var h = 7; for (var i = 0; i < String(str).length; i++) h = (h * 31 + String(str).charCodeAt(i)) >>> 0; return h; }
  function f(n) { return Math.round(n * 10) / 10; }

  /* 歪斜的橢圓路徑：取 12 個點加雜訊，做成封閉曲線 */
  function wobblyEllipse(cx, cy, rx, ry, r, amt) {
    var pts = [], n = 12, i, a;
    for (i = 0; i < n; i++) {
      a = (i / n) * Math.PI * 2;
      pts.push([cx + Math.cos(a) * rx + (r() - 0.5) * amt, cy + Math.sin(a) * ry + (r() - 0.5) * amt]);
    }
    return closedSmooth(pts);
  }
  function closedSmooth(pts) {
    var n = pts.length, d = 'M' + f((pts[0][0] + pts[n - 1][0]) / 2) + ' ' + f((pts[0][1] + pts[n - 1][1]) / 2), i, p, q;
    for (i = 0; i < n; i++) {
      p = pts[i]; q = pts[(i + 1) % n];
      d += ' Q' + f(p[0]) + ' ' + f(p[1]) + ' ' + f((p[0] + q[0]) / 2) + ' ' + f((p[1] + q[1]) / 2);
    }
    return d + 'Z';
  }
  function wobblyRect(x, y, w, h, r, amt) {
    var j = function () { return (r() - 0.5) * amt; };
    return closedSmooth([[x + j(), y + j()], [x + w / 2 + j(), y + j() - 1], [x + w + j(), y + j()], [x + w + j() + 1, y + h / 2 + j()],
                         [x + w + j(), y + h + j()], [x + w / 2 + j(), y + h + j() + 1], [x + j(), y + h + j()], [x + j() - 1, y + h / 2 + j()]]);
  }
  function shape(d, fill, sw) { return '<path d="' + d + '" fill="' + fill + '" stroke="' + INK + '" stroke-width="' + (sw || 3) + '" stroke-linejoin="round" stroke-linecap="round"/>'; }
  function line(x1, y1, x2, y2, sw) { return '<path d="M' + f(x1) + ' ' + f(y1) + ' L' + f(x2) + ' ' + f(y2) + '" stroke="' + INK + '" stroke-width="' + (sw || 3) + '" stroke-linecap="round" fill="none"/>'; }
  function circ(cx, cy, rr, fill, sw) { return '<circle cx="' + f(cx) + '" cy="' + f(cy) + '" r="' + f(rr) + '" fill="' + fill + '" stroke="' + INK + '" stroke-width="' + (sw === undefined ? 2 : sw) + '"/>'; }

  /* 身形：w、h 是身體的寬高（底部固定在 94）；normal 與舊版完全相同 */
  var BODIES = { normal: { w: 30, h: 34 }, slim: { w: 22, h: 38 }, round: { w: 42, h: 34, shape: 'ellipse' }, broad: { w: 44, h: 30 },
    short: { w: 34, h: 26 }, pear: { w: 36, h: 34, shape: 'pear' }, tall: { w: 26, h: 40, headDy: -3 } };

  function character(look, opts) {
    opts = opts || {};
    var seed = opts.seed !== undefined ? opts.seed : hash(JSON.stringify(look)), r = rng(seed), out = [];
    var skin = look.skin || '#f1d6b8', outfit = look.outfit || '#a5d8ff';
    var W = 80, H = 104, cx = 40;
    /* 地面陰影 */
    out.push('<ellipse cx="40" cy="98" rx="22" ry="5" fill="rgba(0,0,0,0.18)"/>');
    /* 身體：小小一坨，歪的 */
    var lean = (r() - 0.5) * 6;
    var B = BODIES[look.body] || BODIES.normal, bw = B.w, bh = B.h, top = 94 - bh, k = bw / 30;
    if (B.shape === 'ellipse') out.push(shape(wobblyEllipse(cx + lean, top + bh / 2, bw / 2, bh / 2 + 1, r, 4), outfit));
    else if (B.shape === 'pear') out.push(shape(closedSmooth([[cx + lean - 10, top], [cx + lean + 10, top], [cx + lean + bw / 2, top + bh * .55], [cx + lean + bw / 2 + 1, top + bh], [cx + lean - bw / 2 - 1, top + bh], [cx + lean - bw / 2, top + bh * .55]]), outfit));
    else out.push(shape(wobblyRect(cx - bw / 2 + lean, top, bw, bh, r, 4), outfit));
    /* 手腳：粗短的線 */
    out.push(line(cx - (bw / 2 - 1) + lean, top + 8, cx - 24 * k, top + 22 + (r() - 0.5) * 4, 4));
    out.push(line(cx + (bw / 2 - 1) + lean, top + 8, cx + 25 * k, top + 20 + (r() - 0.5) * 4, 4));
    out.push(line(cx - 7 * k + lean, 94, cx - 9 * k, 100, 4));
    out.push(line(cx + 7 * k + lean, 94, cx + 10 * k, 100, 4));
    /* 頭：大 */
    var hx = cx + lean * 0.6, hy = 36 + (B.headDy || 0);
    if (look.head === 'square') out.push(shape(wobblyRect(hx - 25, hy - 24, 50, 46, r, 5), skin));
    else if (look.head === 'pear') out.push(shape(wobblyEllipse(hx, hy + 2, 23, 27, r, 5), skin));
    else out.push(shape(wobblyEllipse(hx, hy, 26, 28, r, 4), skin));
    /* 頭髮／帽子 */
    var hair = look.hair || 'bald';
    if (hair === 'tuft') { out.push(line(hx - 3, hy - 28, hx - 6, hy - 38, 3)); out.push(line(hx + 1, hy - 28, hx + 2, hy - 40, 3)); out.push(line(hx + 5, hy - 27, hx + 10, hy - 36, 3)); }
    else if (hair === 'curl') { for (var c = 0; c < 5; c++) out.push(circ(hx - 20 + c * 10, hy - 24 + (c % 2) * 3, 7, '#868e96', 2.5)); }
    else if (hair === 'cap') out.push(shape(closedSmooth([[hx - 27, hy - 14], [hx - 16, hy - 32], [hx + 16, hy - 32], [hx + 27, hy - 14], [hx, hy - 20]]), look.capColor || '#ffffff'));
    /* 眼睛：小、不對稱 */
    var ey = hy - 4, eyes = look.eyes || 'dots';
    var lx = hx - 10, rx2 = hx + 10 + (r() - 0.5) * 2;
    if (eyes === 'spiral') {
      out.push(circ(lx, ey, 6, '#ffffff', 2)); out.push('<path d="M' + f(lx) + ' ' + f(ey) + ' q3 -1 3 2 q-1 3 -4 2 q-3 -2 -1 -5" stroke="' + INK + '" stroke-width="1.8" fill="none"/>');
      out.push(circ(rx2, ey, 6, '#ffffff', 2)); out.push('<path d="M' + f(rx2) + ' ' + f(ey) + ' q-3 -1 -3 2 q1 3 4 2 q3 -2 1 -5" stroke="' + INK + '" stroke-width="1.8" fill="none"/>');
    } else if (eyes === 'droopy') {
      out.push(circ(lx, ey, 3, INK, 0)); out.push(circ(rx2, ey, 3.4, INK, 0));
      out.push(line(lx - 7, ey - 2, lx + 6, ey - 6, 3)); out.push(line(rx2 - 6, ey - 6, rx2 + 7, ey - 2, 3));   /* 八字眉：內側高、外側低，看起來無奈 */
    } else { out.push(circ(lx, ey, 3.2, INK, 0)); out.push(circ(rx2, ey + 1, 2.6, INK, 0)); }
    /* 嘴 */
    var my = hy + 14, mouth = look.mouth || 'flat';
    if (mouth === 'frown') out.push('<path d="M' + f(hx - 8) + ' ' + f(my + 3) + ' Q' + f(hx) + ' ' + f(my - 4) + ' ' + f(hx + 8) + ' ' + f(my + 3) + '" stroke="' + INK + '" stroke-width="3" fill="none" stroke-linecap="round"/>');
    else if (mouth === 'open') out.push('<ellipse cx="' + f(hx) + '" cy="' + f(my) + '" rx="7" ry="6" fill="#5c2b2b" stroke="' + INK + '" stroke-width="2.5"/>');
    else if (mouth === 'teeth') out.push('<path d="M' + f(hx - 9) + ' ' + f(my - 2) + ' L' + f(hx - 5) + ' ' + f(my + 3) + ' L' + f(hx - 1) + ' ' + f(my - 2) + ' L' + f(hx + 3) + ' ' + f(my + 3) + ' L' + f(hx + 7) + ' ' + f(my - 2) + ' L' + f(hx + 10) + ' ' + f(my + 2) + '" stroke="' + INK + '" stroke-width="2.5" fill="#fff" stroke-linejoin="round"/>');
    else out.push(line(hx - 7, my, hx + 7, my + (r() - 0.5) * 3, 3));
    /* 道具 */
    var prop = look.prop;
    if (prop === 'nursecap') { out.push(shape(closedSmooth([[hx - 14, hy - 26], [hx, hy - 38], [hx + 14, hy - 26], [hx, hy - 22]]), '#ffffff')); out.push(line(hx, hy - 34, hx, hy - 27, 3)); out.push(line(hx - 3, hy - 30, hx + 3, hy - 30, 3)); }
    else if (prop === 'guardhat') out.push(shape(closedSmooth([[hx - 24, hy - 20], [hx - 18, hy - 36], [hx + 18, hy - 36], [hx + 24, hy - 20], [hx + 30, hy - 20], [hx + 24, hy - 15], [hx - 24, hy - 15]]), '#495057'));
    else if (prop === 'headmirror') out.push(circ(hx - 12, hy - 20, 7, '#e9ecef', 2.5));
    else if (prop === 'bandage') { out.push('<rect x="' + f(hx + 4) + '" y="' + f(hy - 24) + '" width="18" height="9" rx="3" fill="#ffd8a8" stroke="' + INK + '" stroke-width="2" transform="rotate(25 ' + f(hx + 13) + ' ' + f(hy - 19) + ')"/>'); }
    else if (prop === 'mask') out.push('<rect x="' + f(hx - 12) + '" y="' + f(my - 6) + '" width="24" height="14" rx="4" fill="#f1f3f5" stroke="' + INK + '" stroke-width="2"/>');
    else if (prop === 'tie') out.push(shape(closedSmooth([[cx - 3, 62], [cx + 3, 62], [cx + 5, 80], [cx, 86], [cx - 5, 80]]), '#c92a2a', 2));
    else if (prop === 'phone') out.push('<rect x="' + f(cx + 22) + '" y="70" width="10" height="17" rx="2" fill="#343a40" stroke="' + INK + '" stroke-width="2"/>');
    else if (prop === 'clipboard') out.push('<rect x="' + f(cx - 38) + '" y="72" width="16" height="20" rx="2" fill="#f8f9fa" stroke="' + INK + '" stroke-width="2"/>');
    else if (prop === 'bottle') out.push('<rect x="' + f(cx + 22) + '" y="68" width="8" height="20" rx="3" fill="#a5601f" stroke="' + INK + '" stroke-width="2"/>');
    else if (prop === 'crutch') out.push(line(cx + 26, 70, cx + 30, 100, 4));
    else if (prop === 'balloon') { out.push(line(cx + 24, 78, cx + 30, 30, 2)); out.push(circ(cx + 30, 24, 9, '#ff8787', 2.5)); }
    /* 情緒記號 */
    var mood = opts.mood || 'idle';
    if (mood === 'busy') { out.push('<path d="M' + f(hx + 26) + ' ' + f(hy - 18) + ' q-3 6 0 8 q3 -2 0 -8z" fill="#74c0fc" stroke="' + INK + '" stroke-width="1.5"/>'); out.push('<path d="M' + f(hx + 31) + ' ' + f(hy - 8) + ' q-3 6 0 8 q3 -2 0 -8z" fill="#74c0fc" stroke="' + INK + '" stroke-width="1.5"/>'); }
    if (mood === 'angry') { out.push(line(hx + 14, hy - 26, hx + 22, hy - 22, 3)); out.push(line(hx + 14, hy - 22, hx + 22, hy - 26, 3)); }
    if (mood === 'sleepy') out.push('<text x="' + f(hx + 20) + '" y="' + f(hy - 24) + '" font-size="14" font-weight="bold" fill="#495057">z</text><text x="' + f(hx + 28) + '" y="' + f(hy - 32) + '" font-size="10" font-weight="bold" fill="#495057">z</text>');
    if (mood === 'waiting') out.push('<text x="' + f(hx + 18) + '" y="' + f(hy - 26) + '" font-size="16" fill="#495057">…</text>');

    var size = opts.size || 1;
    var label = opts.label ? '<text x="40" y="' + (H + 12) + '" text-anchor="middle" font-size="13" font-weight="bold" fill="' + (opts.labelColor || '#1e1e1e') + '" stroke="#ffffff" stroke-width="3" paint-order="stroke">' + String(opts.label).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }) + '</text>' : '';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + (H + (opts.label ? 20 : 0)) + '" width="' + f(W * size) + '" height="' + f((H + (opts.label ? 20 : 0)) * size) + '">' + out.join('') + label + '</svg>';
  }

  return { character: character, hash: hash };
});
