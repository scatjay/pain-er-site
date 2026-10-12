/* 訪談報告：由學生自己的紀錄自動排版成 A4 直式 HTML（列印另存 PDF）。純函式，輸出 HTML 字串。
   所有使用者文字一律逸出，避免把標記裡的內容當成網頁。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./checklist.js'));
  else root.ERG_REPORT = factory(root.ERG_CHECKLIST);
})(typeof self !== 'undefined' ? self : this, function (CL) {
  'use strict';

  function esc(s) { return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function trustLabel(k) { var t = CL.TRUST.filter(function (x) { return x.k === k; })[0]; return t ? t.label : ''; }

  /* 痛點清單：每筆已點亮的檢核項（有字或有標籤的）算一條痛點，帶出處編號 */
  function painPoints(interviews, names) {
    var out = [];
    interviews.forEach(function (r) {
      CL.ITEMS.forEach(function (d) {
        var it = r.items[d.k];
        if (!it || !it.done) return;
        if (!it.note && !(it.tags && it.tags.length)) return;
        out.push({ ref: r.id + '·' + d.k, who: names[r.personaId] || r.personaId, item: d.label, note: it.note, tags: it.tags || [], trust: trustLabel(it.trust) });
      });
    });
    return out;
  }

  /* input：{ student:{id,cls,name}, caseName, date, passed, interviews, personaNames:{pid:name}, markers, conclusions, discussion:{partnersText, diff, complement, outcome} } */
  function model(input) {
    var names = input.personaNames || {};
    return {
      cover: { caseName: input.caseName, cls: input.student.cls, id: input.student.id, name: input.student.name || '', date: input.date, passed: !!input.passed },
      conclusions: input.conclusions || [],
      interviews: (input.interviews || []).map(function (r) { return { text: CL.summary(r, names[r.personaId]), id: r.id }; }),
      pains: painPoints(input.interviews || [], names),
      open: (input.markers || []).filter(function (m) { return m.type === '矛盾' || m.type === '想法'; }),
      discussion: input.discussion || {},
      direction: ((input.conclusions || [])[0] || {}).direction || ''
    };
  }

  var CSS = '@page{size:A4;margin:16mm}body{font:12px/1.6 "Noto Sans TC","Microsoft JhengHei",sans-serif;color:#17262f;margin:0}' +
    'h1{font-size:20px;margin:0 0 4px}h2{font-size:14px;margin:16px 0 6px;border-bottom:2px solid #0b7a75;padding-bottom:2px}' +
    'table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccd5da;padding:4px 6px;text-align:left;vertical-align:top}' +
    'pre{white-space:pre-wrap;font:inherit;margin:4px 0;padding:6px;background:#f1f5f7}.pass{color:#1d6b3a;font-weight:700}.note{color:#5a6b76;font-size:11px}' +
    '@media print{h2{break-after:avoid}tr,pre{break-inside:avoid}}';

  function html(input) {
    var m = model(input), c = m.cover;
    var parts = [];
    parts.push('<h1>' + esc(c.caseName) + '　訪談報告</h1>');
    parts.push('<div class="note">' + esc(c.cls) + '　學號 ' + esc(c.id) + (c.name ? '　' + esc(c.name) : '') + '　' + esc(c.date) +
      (c.passed ? '　<span class="pass">檢核點全部完成</span>' : '　尚有檢核點未完成') + '</div>');
    parts.push('<div class="note">模擬訪談，人物與情境皆為虛構。</div>');
    parts.push('<h2>我的結論</h2>');
    parts.push(m.conclusions.length ? '<table><tr><th>結論</th><th>根據</th><th>取捨</th><th>方向</th></tr>' + m.conclusions.map(function (x) {
      return '<tr><td>' + esc(x.text) + '</td><td>' + esc((x.refs || []).join('、')) + '</td><td>' + esc(x.tradeoff) + '</td><td>' + esc(x.direction) + '</td></tr>';
    }).join('') + '</table>' : '<div class="note">（尚無結論）</div>');
    parts.push('<h2>訪談摘要</h2>' + (m.interviews.length ? m.interviews.map(function (x) { return '<pre>' + esc(x.text) + '</pre>'; }).join('') : '<div class="note">（尚無訪談）</div>'));
    parts.push('<h2>痛點清單</h2>');
    parts.push(m.pains.length ? '<table><tr><th>出處</th><th>誰</th><th>哪一項</th><th>一句話與標籤</th><th>可信度</th></tr>' + m.pains.map(function (p) {
      return '<tr><td>' + esc(p.ref) + '</td><td>' + esc(p.who) + '</td><td>' + esc(p.item) + '</td><td>' + esc(p.note) + (p.tags.length ? ' <span class="note">#' + esc(p.tags.join(' #')) + '</span>' : '') + '</td><td>' + esc(p.trust) + '</td></tr>';
    }).join('') + '</table>' : '<div class="note">（尚無）</div>');
    parts.push('<h2>矛盾與假設</h2>' + (m.open.length ? '<ul>' + m.open.map(function (x) { return '<li>' + esc(x.id) + '　' + esc(x.text || '') + '</li>'; }).join('') + '</ul>' : '<div class="note">（尚無）</div>'));
    var d = m.discussion;
    parts.push('<h2>討論檢核紀錄</h2><table><tr><th>討論對象</th><td>' + esc(d.partnersText || '') + '</td></tr><tr><th>看法不同的地方</th><td>' + esc(d.diff || '') +
      '</td></tr><tr><th>互相補到的地方</th><td>' + esc(d.complement || '') + '</td></tr><tr><th>我的結論</th><td>' + esc(d.outcome || '') + '</td></tr></table>');
    return '<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>' + esc(c.caseName) + ' 訪談報告</title><style>' + CSS + '</style></head><body>' + parts.join('') + '</body></html>';
  }

  return { esc: esc, model: model, painPoints: painPoints, html: html };
});
