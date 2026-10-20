/* 老師後台「主題摘要」的渲染：把模型輸出的 Markdown 子集轉成「一段一張卡」的 HTML。
   安全：先遮罩（去識別化）、再整段轉義，之後只由本檔自己插入固定標籤；模型輸出的任何 < > " ' & 一律變成純文字。
   只改排版，不改語意；認不得的格式退回「整段純文字」。純函式，Node 與瀏覽器共用（test_summary_render.js）。 */
(function (root) {
  'use strict';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  /* 行內：輸入是「已轉義」的文字。**粗體**、「引用」、“引用” */
  function inline(h) {
    return h.replace(/\*\*([^*]+?)\*\*/g, '<b>$1</b>')
      .replace(/(「[^「」]{2,}」|“[^“”]{2,}”)/g, '<q class="sq">$1</q>');
  }
  function plainBullet(t) { return t.replace(/\*\*/g, ''); }

  /* 解析成 [{title, items:[{lvl, text}], paras:[...]}] */
  function parse(text) {
    var secs = [], cur = null, lines = String(text == null ? '' : text).replace(/\r/g, '').split('\n');
    function start(title) { cur = { title: title, items: [] }; secs.push(cur); }
    lines.forEach(function (ln) {
      var m, raw = ln;
      if (!ln.trim()) return;
      if ((m = /^\s*#{1,4}\s+(.+?)\s*#*\s*$/.exec(ln))) { start(m[1]); return; }
      if ((m = /^\s*\*\*([^*]+?)\*\*\s*[:：]?\s*$/.exec(ln))) { start(m[1]); return; }
      if ((m = /^\s*([一二三四五六七八九十]+、.*)$/.exec(ln))) { start(m[1].replace(/\*\*/g, '').replace(/[:：]\s*$/, '')); return; }
      if ((m = /^(\s*)(?:[*\-•]|\d+[.)])\s+(.*)$/.exec(ln))) {
        if (!cur) start('');
        cur.items.push({ lvl: m[1].length >= 2 ? 1 : 0, text: m[2] }); return;
      }
      if (!cur) start('');
      var last = cur.items[cur.items.length - 1];
      if (last && /^\s+/.test(raw)) last.text += ' ' + ln.trim(); else cur.items.push({ lvl: -1, text: ln.trim() });
    });
    return secs;
  }

  function itemHtml(it, mask) {
    var t = mask(it.text), tag = '', m = /^\*\*([^*]{1,16}?)[:：]?\*\*\s*[:：]?\s*(.*)$/.exec(t);
    if (m) { tag = '<span class="stag">' + esc(m[1].replace(/[:：]\s*$/, '')) + '</span>'; t = m[2]; }
    return tag + inline(esc(t));
  }

  /* opts.mask(str)→str：去識別化遮罩（預設不動）。回傳 HTML 字串。 */
  function render(text, opts) {
    var mask = (opts && opts.mask) || function (s) { return s; };
    var raw = String(text == null ? '' : text);
    if (!raw.trim()) return '';
    var secs = parse(raw).filter(function (s) { return s.items.length || s.title; });
    var nItems = secs.reduce(function (a, s) { return a + s.items.filter(function (i) { return i.lvl >= 0; }).length; }, 0);
    /* 認不得結構（沒有任何段落標題也沒有條列）→ 退回純文字，只轉義 */
    if (!secs.some(function (s) { return s.title; }) && !nItems) return '<div class="sum"><p class="sump">' + inline(esc(mask(raw))).replace(/\n/g, '<br>') + '</p></div>';

    var keyIdx = -1;
    secs.forEach(function (s, i) { if (keyIdx < 0 && /設計|考量|啟示|結論|建議/.test(s.title) && s.items.length) keyIdx = i; });
    function body(s) {
      var out = '', open = false;
      s.items.forEach(function (it) {
        if (it.lvl < 0) { if (open) { out += '</ul>'; open = false; } out += '<p class="sump">' + inline(esc(mask(it.text))) + '</p>'; return; }
        if (!open) { out += '<ul class="sumul">'; open = true; }
        out += '<li' + (it.lvl ? ' class="sub"' : '') + '>' + itemHtml(it, mask) + '</li>';
      });
      return out + (open ? '</ul>' : '');
    }
    var html = '<div class="sum"><div class="summeta">共 ' + secs.length + ' 段、' + nItems + ' 條</div>';
    if (keyIdx >= 0) {
      var k = secs[keyIdx];
      html += '<div class="sumkey"><div class="sumkh">重點：' + esc(mask(k.title).replace(/^[一二三四五六七八九十]+、/, '')) + '</div>' + body(k) + '</div>';
    }
    secs.forEach(function (s, i) {
      if (i === keyIdx) return;
      var title = mask(s.title).replace(/^[一二三四五六七八九十]+、/, '');
      html += '<details class="sumc" open><summary><span class="sumn">' + (i + 1) + '</span>' + esc(title || '摘要') + '<span class="sumcount">' + s.items.filter(function (x) { return x.lvl >= 0; }).length + ' 條</span></summary>' + body(s) + '</details>';
    });
    return html + '</div>';
  }

  var api = { render: render, parse: parse, esc: esc, plainBullet: plainBullet };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ERG_SUMMARY = api;
})(typeof window !== 'undefined' ? window : this);
