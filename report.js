/* 訪談報告：由學生自己的紀錄自動排版成 A4 直式 HTML（列印另存 PDF）。純函式，輸出 HTML 字串。
   所有使用者文字一律逸出，避免把標記裡的內容當成網頁。
   第 8 週加：報告等級、訪談覆蓋表、人物誌素材卡（可複製 Persona 框架）、故事片段清單。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./checklist.js'), require('./report_level.js'));
  else root.ERG_REPORT = factory(root.ERG_CHECKLIST, root.ERG_REPORT_LEVEL);
})(typeof self !== 'undefined' ? self : this, function (CL, RL) {
  'use strict';

  function esc(s) { return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function trustLabel(k) { var t = CL.TRUST.filter(function (x) { return x.k === k; })[0]; return t ? t.label : ''; }
  function nz(s) { return String(s === undefined || s === null ? '' : s).trim(); }
  function timeKey(t) { var m = /(\d{1,2}):(\d{2})/.exec(String(t || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : 99999; }

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

  /* 每位有紀錄的受訪者合成一份素材：三格內容、可信度、出處；同一位有多張紀錄時，後面有填的蓋掉前面的 */
  function personaMaterial(interviews, names, quotes, clues, markers, roomNames) {
    var order = [], by = {};
    (interviews || []).forEach(function (r) {
      if (!r || !r.personaId || !r.items) return;
      var any = CL.ITEMS.some(function (d) { var it = r.items[d.k]; return it && (it.done || nz(it.note)); });
      if (!any) return;
      var g = by[r.personaId];
      if (!g) { g = by[r.personaId] = { pid: r.personaId, name: names[r.personaId] || r.personaId, recIds: [], locs: [], times: [], items: {} }; order.push(r.personaId); }
      g.recIds.push(r.id); if (r.loc && g.locs.indexOf(r.loc) < 0) g.locs.push(r.loc); if (r.simTime) g.times.push(r.simTime);
      CL.ITEMS.forEach(function (d) {
        var it = r.items[d.k]; if (!it || !(it.done || nz(it.note))) return;
        g.items[d.k] = { note: nz(it.note), trust: trustLabel(it.trust), guess: it.trust === 'guess', tags: it.tags || [], ref: r.id + '·' + d.k, label: d.label };
      });
    });
    var read = {}; (markers || []).forEach(function (m) { if (m.clueId) read[m.clueId] = 1; });
    return order.map(function (pid) {
      var g = by[pid];
      g.quotes = (quotes && quotes[pid]) || [];
      g.clues = (clues || []).filter(function (c) { return c && c.pin && g.locs.indexOf(c.pin.room) >= 0; }).map(function (c) { return { id: c.id, title: c.title, mine: !!read[c.id] }; });
      g.locNames = g.locs.map(function (l) { return (roomNames && roomNames[l]) || l; });
      return g;
    });
  }
  function bullet(it) { return '- ' + (it.note || '（只點亮、沒寫字）') + (it.trust ? '（可信度：' + it.trust + '）' : '') + '〔出處 ' + it.ref + '〕'; }
  var TODO = '（請推測並標明）';
  /* 「複製 Persona 框架」的文字：每欄先放該生自己的素材與出處，空的寫請推測；最後一段是不准改動的規則 */
  function personaPrompt(g) {
    var I = g.items, tags = [], tagRef = [];
    CL.ITEMS.forEach(function (d) { var it = I[d.k]; if (it && it.tags.length) { it.tags.forEach(function (t) { if (tags.indexOf(t) < 0) tags.push(t); }); tagRef.push(it.ref); } });
    var base = g.name + '，在「' + (g.locNames.join('、') || '現場') + '」訪談' + (g.times.length ? '（模擬時間 ' + g.times[0] + '）' : '') + '〔出處 ' + g.recIds.join('、') + '〕';
    var guesses = CL.ITEMS.filter(function (d) { return I[d.k] && I[d.k].guess; }).map(function (d) { return '- 我當時就標了「我猜的」：' + (I[d.k].note || '') + '〔出處 ' + I[d.k].ref + '〕'; });
    var act = [];
    if (I.surface) act.push(bullet(I.surface));
    g.quotes.forEach(function (q) { act.push('- 他說過：「' + q + '」〔出處 ' + g.recIds[0] + '·對話〕'); });
    var L = ['請根據下面「我自己訪談得到的素材」，幫我整理成一份 Persona（人物誌）。', '', '人物：' + g.name, '',
      '基本描述：' + base, '特質：' + TODO, '動機：' + TODO,
      '行為：' + (act.length ? '\n' + act.join('\n') : TODO),
      '需求：' + (I.need ? '\n' + bullet(I.need) : TODO),
      '困擾：' + (tags.length ? '\n- 我貼的標籤：' + tags.join('、') + '〔出處 ' + tagRef.join('、') + '〕' : TODO),
      '面臨情境：' + (I.events ? '\n' + bullet(I.events) : TODO),
      '他沒說出口但我推論的需求：' + (guesses.length ? '\n' + guesses.join('\n') : TODO), '',
      '請注意：不可刪掉出處、不可新增訪談沒出現的事實；推測的內容請標「推測」。'];
    return L.join('\n');
  }

  /* 故事片段：痛點、矛盾、想法、線索、對方說的話放在一起，依時間排（用訪談當下的模擬時間；沒有時間的標記排在後面），編號 S01、S02… */
  function storyPieces(input, names, pains) {
    var segs = [], seq = 0;
    function add(kind, text, ref, time) { segs.push({ kind: kind, text: text, ref: ref, t: timeKey(time), seq: seq++ }); }
    var timeOf = {}; (input.interviews || []).forEach(function (r) { if (r && r.id) timeOf[r.id] = r.simTime; });
    pains.forEach(function (p) { add('痛點', p.who + '：' + (p.note || p.item) + (p.tags.length ? '（' + p.tags.join('、') + '）' : ''), p.ref, timeOf[p.ref.split('·')[0]]); });
    (input.markers || []).forEach(function (m) {
      if (m.type === '矛盾' || m.type === '想法') add(m.type, nz(m.text) || '（沒有文字）', m.id, '');
      else if (m.clueId) { var c = ((input.clues || []).filter(function (x) { return x.id === m.clueId; })[0]) || {}; add('線索', (c.title || m.clueId) + (nz(m.text) ? '：' + nz(m.text) : ''), m.clueId, ''); }
    });
    var q = (input.chat && input.chat.quotes) || {};
    Object.keys(q).forEach(function (pid) {
      var rec = (input.interviews || []).filter(function (r) { return r && r.personaId === pid; })[0];
      q[pid].forEach(function (x) { add('原話', (names[pid] || pid) + '：「' + x + '」', (rec ? rec.id : pid) + '·對話', rec ? rec.simTime : ''); });
    });
    segs.sort(function (a, b) { return (a.t - b.t) || (a.seq - b.seq); });
    segs.forEach(function (s, i) { s.no = 'S' + (i < 9 ? '0' : '') + (i + 1); });
    return segs;
  }

  /* input：{ student:{id,cls,name}, caseName, date, passed, interviews, personaNames:{pid:name}, markers, conclusions, discussion:{partnersText, diff, complement, outcome},
     以下第 8 週新增、都可以不給：skill:{ask,ctx}（探問、情境感知等級）、mainPersona、keyPersonaIds、chat:{counts,quotes}、clues、roomNames:{房間id:名稱} } */
  function model(input) {
    var names = input.personaNames || {};
    return {
      cover: { caseName: input.caseName, cls: input.student.cls, id: input.student.id, name: input.student.name || '', date: input.date, passed: !!input.passed },
      conclusions: input.conclusions || [],
      interviews: (input.interviews || []).map(function (r) { return { text: CL.summary(r, names[r.personaId]), id: r.id }; }),
      pains: painPoints(input.interviews || [], names),
      open: (input.markers || []).filter(function (m) { return m.type === '矛盾' || m.type === '想法'; }),
      discussion: input.discussion || {},
      direction: ((input.conclusions || [])[0] || {}).direction || '',
      level: RL ? RL.evaluate({ interviews: input.interviews, askLv: (input.skill || {}).ask, ctxLv: (input.skill || {}).ctx, conclusions: input.conclusions, markers: input.markers, mainPersona: input.mainPersona }) : null,
      coverage: RL ? RL.coverage(input.interviews, input.keyPersonaIds || [], names, (input.chat || {}).counts, input.mainPersona) : [],
      cards: personaMaterial(input.interviews, names, (input.chat || {}).quotes, input.clues, input.markers, input.roomNames),
      story: storyPieces(input, names, painPoints(input.interviews || [], names))
    };
  }

  var CSS = '@page{size:A4;margin:16mm}body{font:12px/1.6 "Noto Sans TC","Microsoft JhengHei",sans-serif;color:#17262f;margin:0}' +
    'h1{font-size:20px;margin:0 0 4px}h2{font-size:14px;margin:16px 0 6px;border-bottom:2px solid #0b7a75;padding-bottom:2px}' +
    'table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccd5da;padding:4px 6px;text-align:left;vertical-align:top}' +
    'pre{white-space:pre-wrap;font:inherit;margin:4px 0;padding:6px;background:#f1f5f7}.pass{color:#1d6b3a;font-weight:700}.note{color:#5a6b76;font-size:11px}' +
    '.lv{border:2px solid #0b7a75;border-radius:8px;padding:6px 10px;margin:8px 0;background:#eef8f7}.lv b{font-size:15px}' +
    '.ok{color:#1d6b3a;font-weight:700}.no{color:#a33}.card{border:1px solid #ccd5da;border-radius:8px;padding:8px 10px;margin:8px 0}.card h3{font-size:13px;margin:0 0 4px}' +
    '.card textarea{display:none;width:100%;height:150px;font:11px/1.5 sans-serif;box-sizing:border-box;margin-top:6px}button{font:inherit;padding:3px 10px;cursor:pointer}' +
    '@media print{h2{break-after:avoid}tr,pre,.card{break-inside:avoid}.noprint,.card textarea{display:none!important}}';

  /* 在報告（iframe）裡面按「複製」：先試瀏覽器剪貼簿；不行就把文字框打開並選起來，請學生自己按 Ctrl+C */
  var COPY_JS = 'function cpP(i){var ta=document.getElementById("pt"+i),m=document.getElementById("pm"+i);' +
    'function fb(){ta.style.display="block";ta.focus();ta.select();m.textContent="沒有自動複製成功，文字已經選起來了，請按 Ctrl+C。";}' +
    'try{navigator.clipboard.writeText(ta.value).then(function(){m.textContent="已複製，貼到 Gemini 就可以。";},fb);}catch(e){fb();}}';

  function html(input) {
    var m = model(input), c = m.cover;
    var parts = [];
    parts.push('<h1>' + esc(c.caseName) + '　訪談報告</h1>');
    parts.push('<div class="note">' + esc(c.cls) + '　學號 ' + esc(c.id) + (c.name ? '　' + esc(c.name) : '') + '　' + esc(c.date) +
      (c.passed ? '　<span class="pass">檢核點全部完成</span>' : '　尚有檢核點未完成') + '</div>');
    parts.push('<div class="note">模擬訪談，人物與情境皆為虛構。</div>');
    if (m.level) parts.push('<div class="lv"><b>報告等級　' + esc(RL.label(m.level)) + '</b><div>' + esc(RL.nextLine(m.level)) + '</div></div>');
    parts.push('<h2>我的結論</h2>');
    parts.push(m.conclusions.length ? '<table><tr><th>結論</th><th>根據</th><th>取捨</th><th>方向</th></tr>' + m.conclusions.map(function (x) {
      return '<tr><td>' + esc(x.text) + '</td><td>' + esc((x.refs || []).join('、')) + '</td><td>' + esc(x.tradeoff) + '</td><td>' + esc(x.direction) + '</td></tr>';
    }).join('') + '</table>' : '<div class="note">（尚無結論）</div>');
    if (m.coverage.length) {
      parts.push('<h2>訪談覆蓋表</h2><div class="note">這個案例的重要人物，你問過誰、問了幾題、三個檢核項各填了沒（✔ 有、— 還沒）。</div><table><tr><th>人物</th><th>問了幾題</th><th>他一開始怎麼說</th><th>那天發生了什麼事</th><th>他真正需要什麼</th></tr>' + m.coverage.map(function (r) {
        function mark(v) { return v ? '<span class="ok">✔</span>' : '<span class="no">—</span>'; }
        return '<tr><td>' + esc(r.name) + (r.main ? '　<span class="note">（主角）</span>' : '') + (r.interviewed ? '' : '　<span class="no">還沒問過</span>') + '</td><td>' + (r.asked === null ? '—' : esc(r.asked)) + '</td><td>' + mark(r.cells.surface) + '</td><td>' + mark(r.cells.events) + '</td><td>' + mark(r.cells.need) + '</td></tr>';
      }).join('') + '</table>');
    }
    parts.push('<h2>訪談摘要</h2>' + (m.interviews.length ? m.interviews.map(function (x) { return '<pre>' + esc(x.text) + '</pre>'; }).join('') : '<div class="note">（尚無訪談）</div>'));
    parts.push('<h2>人物誌素材卡</h2><div class="note">每位你訪談過的人一張。按「複製 Persona 框架」，貼到 Gemini，請它依你的素材整理人物誌；每欄後面的〔出處〕要留著。</div>');
    parts.push(m.cards.length ? m.cards.map(function (g, i) {
      function line(k) {
        var it = g.items[k], d = CL.ITEMS.filter(function (x) { return x.k === k; })[0];
        return it ? '<div>' + esc(it.label) + '：' + esc(it.note || '（只點亮）') + (it.trust ? ' <span class="note">（' + esc(it.trust) + '）</span>' : '') + (it.tags.length ? ' <span class="note">#' + esc(it.tags.join(' #')) + '</span>' : '') + ' <span class="note">出處 ' + esc(it.ref) + '</span></div>' : '<div class="note">' + esc(d.label) + '：還沒填</div>';
      }
      return '<div class="card"><h3>' + esc(g.name) + '　<span class="note">訪談編號 ' + esc(g.recIds.join('、')) + (g.locNames.length ? '・' + esc(g.locNames.join('、')) : '') + '</span></h3>' + line('surface') + line('events') + line('need') +
        (g.quotes.length ? '<div>他說過的話：' + g.quotes.map(function (q) { return '「' + esc(q) + '」'; }).join('　') + '</div>' : '<div class="note">他說過的話：沒有讀到對話紀錄（只有線上版會存）</div>') +
        '<div class="note">相關線索：' + (g.clues.length ? g.clues.map(function (cl) { return esc(cl.id) + (cl.mine ? '（我記過）' : ''); }).join('、') + '（訪談那間房裡的線索）' : '沒有') + '</div>' +
        '<div class="noprint"><button type="button" onclick="cpP(' + i + ')">複製 Persona 框架</button> <span id="pm' + i + '" class="note"></span></div>' +
        '<textarea id="pt' + i + '" readonly>' + esc(personaPrompt(g)) + '</textarea></div>';
    }).join('') : '<div class="note">（還沒有訪談紀錄）</div>');
    parts.push('<h2>痛點清單</h2>');
    parts.push(m.pains.length ? '<table><tr><th>出處</th><th>誰</th><th>哪一項</th><th>一句話與標籤</th><th>可信度</th></tr>' + m.pains.map(function (p) {
      return '<tr><td>' + esc(p.ref) + '</td><td>' + esc(p.who) + '</td><td>' + esc(p.item) + '</td><td>' + esc(p.note) + (p.tags.length ? ' <span class="note">#' + esc(p.tags.join(' #')) + '</span>' : '') + '</td><td>' + esc(p.trust) + '</td></tr>';
    }).join('') + '</table>' : '<div class="note">（尚無）</div>');
    parts.push('<h2>故事片段清單</h2><div class="note">把痛點、矛盾、想法、線索、對方說的話放在一起，照時間排好，編號 S01、S02…。排故事板時直接從這裡挑。</div>');
    parts.push(m.story.length ? '<table><tr><th>編號</th><th>種類</th><th>內容</th><th>出處</th></tr>' + m.story.map(function (x) { return '<tr><td>' + esc(x.no) + '</td><td>' + esc(x.kind) + '</td><td>' + esc(x.text) + '</td><td>' + esc(x.ref) + '</td></tr>'; }).join('') + '</table>' : '<div class="note">（尚無）</div>');
    parts.push('<h2>矛盾與假設</h2>' + (m.open.length ? '<ul>' + m.open.map(function (x) { return '<li>' + esc(x.id) + '　' + esc(x.text || '') + '</li>'; }).join('') + '</ul>' : '<div class="note">（尚無）</div>'));
    var d = m.discussion;
    parts.push('<h2>討論檢核紀錄</h2><table><tr><th>討論對象</th><td>' + esc(d.partnersText || '') + '</td></tr><tr><th>看法不同的地方</th><td>' + esc(d.diff || '') +
      '</td></tr><tr><th>互相補到的地方</th><td>' + esc(d.complement || '') + '</td></tr><tr><th>我的結論</th><td>' + esc(d.outcome || '') + '</td></tr></table>');
    return '<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>' + esc(c.caseName) + ' 訪談報告</title><style>' + CSS + '</style></head><body>' + parts.join('') + '<script>' + COPY_JS + '</script></body></html>';
  }

  return { esc: esc, model: model, painPoints: painPoints, personaMaterial: personaMaterial, personaPrompt: personaPrompt, storyPieces: storyPieces, html: html, COPY_JS: COPY_JS };
});
