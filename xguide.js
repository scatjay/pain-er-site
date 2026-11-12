/* 專家版指引（11-12 原型）：讓「使用者專家」（例如修過課、用過遊戲的同學）直接改訪談助教的句子，並說明為什麼。
   只管資料與畫面，不連網、不碰 Firebase：存取交給呼叫端傳進來的 store（老師後台用 xg/entries，離線時用 localStorage）。

   資料形狀（xg/entries/{pushId}）：
     { target:'B.yn.1'（要改哪一條，路徑從規則檔 IC_RULES 來）, orig:'原文', mine:'專家的版本', why:'為什麼', who:'署名（自填，可空）', t:毫秒, st:'new'|'ok'|'hold' }
   st 由楊老師在後台標：ok＝採用（applyOverrides 才會套用）、hold＝暫緩。學生端第一版不讀這份資料（還沒接）。

   匯出（Node：require；瀏覽器：window.ERG_XG）
     targets(rules)               → [{ id, group, label, orig }]  可以改的句子清單
     makeEntry(input, rules, now) → { ok:true, entry } | { ok:false, err }  驗證：長度、佔位符、禁用字
     applyOverrides(rules, list)  → 複製一份規則，套上 st==='ok' 的專家版本（原規則不動）
     mount(el, opts)              → 畫面（opts: { rules, store:{list(),add(e),mark(id,st)}, canMark, who }）
     getPath／esc／placeholders */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ERG_XG = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var MAX_MINE = 300, MAX_WHY = 200, MAX_WHO = 12;
  var MOMENT = { A: '開口前', B: '問完一題', C: '卡住沒追問', D: '只問是非題', E: '整理訪談卡', F: '檢核點卡關' };
  var VAR = { yn: '是非題', lead: '引導式問句', cold: '這位人物不吃的問法', dup: '重複的問題', tmpl: '照念檢核表', emo: '對方有情緒', emoEff: '接住情緒之後', greet: '只有寒暄', praise: '肯定', open: '開場', generic: '通用版', bridge: '上次問過', stuck: '連續沒追問', idle: '回完很久沒動', leave: '換人前' };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function getPath(o, path) { var cur = o, ks = String(path).split('.'); for (var i = 0; i < ks.length; i++) { if (cur == null || typeof cur !== 'object') return undefined; cur = cur[ks[i]]; } return cur; }
  function placeholders(s) { var m = String(s || '').match(/\{[a-zA-Z]+\}/g) || []; return m.filter(function (x, i) { return m.indexOf(x) === i; }); }

  /* 可以改的句子：moments 底下除了第 2、3 級以外的字串、chip 的字串（ynAny 是程式用的正則，不開放）、人物的建議句 */
  function targets(rules) {
    var out = [], R = rules || {};
    function walk(node, path, ctx) {
      if (typeof node === 'string') { out.push({ id: path.join('.'), group: ctx.group, label: ctx.label.concat([]).join('・'), orig: node }); return; }
      if (!node || typeof node !== 'object') return;
      Object.keys(node).forEach(function (k) {
        if (/^[23]$/.test(k) && ctx.skipHigh) return;   /* 第 2、3 級是學生按「給我例子」才看到的，第一版先只開放第 1 級 */
        var lab = ctx.label.concat([VAR[k] || (/^\d$/.test(k) ? '第' + k + '級' : k)]);
        walk(node[k], path.concat([k]), { group: ctx.group, label: lab, skipHigh: ctx.skipHigh });
      });
    }
    Object.keys(R.moments || {}).forEach(function (m) { walk(R.moments[m], ['moments', m], { group: MOMENT[m] || m, label: [MOMENT[m] || m], skipHigh: true }); });
    Object.keys(R.chip || {}).forEach(function (k) {
      if (k === 'ynAny' || k === 'wh' || typeof R.chip[k] !== 'string') return;
      out.push({ id: 'chip.' + k, group: '每問一題後的小提示', label: '小提示・' + ({ prefix: '開頭字', footer: '結尾說明' }[k] || ({ dup: '重複', tmpl: '照念', lead: '引導', yn: '是非題', echo: '撿詞', long: '太長', ev: '具體經驗', why: '問原因', open: '開放式' }[k] || k)), orig: R.chip[k] });
    });
    /* 「怎麼問」閱讀頁與練習的字（規則檔 how 區塊）：只開放字串欄位，練習的提示與提醒也可以改 */
    var H = R.how || {}, HL = { title: '標題', intro: '開場說明', longTitle: '「太長」標題', longRule: '「太長」說明', contrastTitle: '三種問法標題', contrastTopic: '三種問法的情境', styleTitle: '不同對象標題', styleNote: '不同對象說明', practiceTitle: '練習標題', practiceIntro: '練習說明', practiceDone: '練習完成的話' };
    Object.keys(HL).forEach(function (k) { if (typeof H[k] === 'string') out.push({ id: 'how.' + k, group: '怎麼問閱讀頁與練習', label: HL[k], orig: H[k] }); });
    (H.principles || []).forEach(function (p, i) { [['title', '原則名'], ['rule', '說明'], ['bad', '不好的問法'], ['good', '好的問法'], ['why', '為什麼']].forEach(function (f) { if (p[f[0]]) out.push({ id: 'how.principles.' + i + '.' + f[0], group: '怎麼問閱讀頁與練習', label: '原則 ' + (i + 1) + '・' + f[1], orig: p[f[0]] }); }); });
    (H.contrast || []).forEach(function (c, i) { [['say', '這樣問'], ['feel', '對方的感受']].forEach(function (f) { if (c[f[0]]) out.push({ id: 'how.contrast.' + i + '.' + f[0], group: '怎麼問閱讀頁與練習', label: '三種問法 ' + (i + 1) + '・' + f[1], orig: c[f[0]] }); }); });
    (H.styleRows || []).forEach(function (r, i) { if (r.feel) out.push({ id: 'how.styleRows.' + i + '.feel', group: '怎麼問閱讀頁與練習', label: (r.who || '對象 ' + (i + 1)) + '・聽感', orig: r.feel }); });
    (H.practiceSteps || []).forEach(function (r, i) { [['ask', '這一步要做什麼'], ['tip', '提示'], ['reply', '小人物的回答'], ['fail', '沒過時的提醒']].forEach(function (f) { if (r[f[0]]) out.push({ id: 'how.practiceSteps.' + i + '.' + f[0], group: '怎麼問閱讀頁與練習', label: '練習第 ' + (i + 1) + ' 步・' + f[1], orig: r[f[0]] }); }); });
    Object.keys(R.personas || {}).forEach(function (pid) {
      var p = R.personas[pid] || {};
      ['skill', 'line'].forEach(function (f) { if (typeof p[f] === 'string' && p[f]) out.push({ id: 'personas.' + pid + '.' + f, group: '人物的建議', label: (p.name || pid) + '・' + (f === 'skill' ? '怎麼問他' : '他的特點'), orig: p[f] }); });
    });
    return out;
  }

  function forbiddenRe(R) { var w = (R && R.forbidden) || []; return w.length ? new RegExp(w.map(function (x) { return String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|')) : null; }

  function makeEntry(input, rules, now) {
    input = input || {};
    var T = targets(rules), tg = null, i;
    for (i = 0; i < T.length; i++) if (T[i].id === input.target) { tg = T[i]; break; }
    if (!tg) return { ok: false, err: '請先選要改哪一條。' };
    var mine = String(input.mine || '').trim(), why = String(input.why || '').trim(), who = String(input.who || '').trim().slice(0, MAX_WHO);
    if (!mine) return { ok: false, err: '「你的版本」還空著。' };
    if (mine === tg.orig) return { ok: false, err: '你的版本和原文一樣。' };
    if (mine.length > MAX_MINE) return { ok: false, err: '你的版本太長（最多 ' + MAX_MINE + ' 字，現在 ' + mine.length + ' 字）。' };
    if (!why) return { ok: false, err: '請寫一句為什麼這樣改（一句就好）。' };
    if (why.length > MAX_WHY) return { ok: false, err: '「為什麼」太長（最多 ' + MAX_WHY + ' 字）。' };
    var okP = placeholders(tg.orig), badP = placeholders(mine).filter(function (x) { return okP.indexOf(x) < 0; });
    if (badP.length) return { ok: false, err: '你的版本有程式不認得的 ' + badP.join(' ') + '。可以用的只有原文裡有的：' + (okP.join(' ') || '（原文沒有可代換的位置）') + '。' };
    if (/\[\[|\]\]/.test(mine) && !/\[\[/.test(tg.orig)) return { ok: false, err: '請不要用 [[ ]]，那是程式用的記號。' };
    var f = forbiddenRe(rules), hit = f && mine.match(f);
    if (hit) return { ok: false, err: '「' + hit[0] + '」是助教不用的字（學生看不懂或太像老師用語），換個說法。' };
    return { ok: true, entry: { target: tg.id, orig: tg.orig, mine: mine, why: why, who: who, t: Number(now) || Date.now(), st: 'new' } };
  }

  function applyOverrides(rules, list) {
    var R = JSON.parse(JSON.stringify(rules)), T = {};
    targets(rules).forEach(function (t) { T[t.id] = t; });
    (list || []).forEach(function (e) {
      if (!e || e.st !== 'ok' || !T[e.target]) return;
      var chk = makeEntry({ target: e.target, mine: e.mine, why: e.why || '採用' }, rules, 0); if (!chk.ok) return;   /* 套用前再驗一次，壞資料不進規則 */
      var ks = e.target.split('.'), cur = R;
      for (var i = 0; i < ks.length - 1; i++) cur = cur[ks[i]];
      cur[ks[ks.length - 1]] = chk.entry.mine;
    });
    delete R._c;
    return R;
  }

  /* ───── 畫面（老師後台的「專家指引」分頁；手機 390 寬可用；不用 alert／confirm／prompt）───── */
  function mount(el, opts) {
    if (!el || typeof document === 'undefined') return;
    opts = opts || {};
    var T = targets(opts.rules), store = opts.store, st = { rows: [], msg: '', err: false, sel: '' };
    function groups() { var g = {}, o = []; T.forEach(function (t) { if (!g[t.group]) { g[t.group] = []; o.push(t.group); } g[t.group].push(t); }); return o.map(function (k) { return { name: k, items: g[k] }; }); }
    function byId(id) { for (var i = 0; i < T.length; i++) if (T[i].id === id) return T[i]; return null; }
    function draw() {
      var cur = byId(st.sel), who = '';
      try { who = (el.querySelector('#xgWho') || {}).value || opts.who || ''; } catch (e) {}
      el.innerHTML =
        '<div class="muted" style="font-size:.9em;margin-bottom:6px">專家一次改一句：選要改哪一條 → 看原文 → 寫你的版本和一句為什麼。送出後先放著，楊老師看過標「採用」才會真的換。</div>' +
        '<label style="display:block;font-weight:700;margin:6px 0 2px" for="xgSel">① 要改哪一條</label>' +
        '<select id="xgSel" style="width:100%;font-size:16px;min-height:44px"><option value="">（請選）</option>' + groups().map(function (g) {
          return '<optgroup label="' + esc(g.name) + '">' + g.items.map(function (t) { return '<option value="' + esc(t.id) + '"' + (t.id === st.sel ? ' selected' : '') + '>' + esc(t.label) + '</option>'; }).join('') + '</optgroup>'; }).join('') + '</select>' +
        '<div style="font-weight:700;margin:8px 0 2px">② 現在的原文</div>' +
        '<div id="xgOrig" class="card" style="margin:0;padding:8px;background:var(--soft-y,#fff8db);min-height:2.5em">' + (cur ? esc(cur.orig) : '<span class="muted">先選上面那一條</span>') + '</div>' +
        (cur && placeholders(cur.orig).length ? '<div class="muted" style="font-size:.85em">原文裡的 ' + esc(placeholders(cur.orig).join(' ')) + ' 會被換成人物名字、例句等，改的時候請保留。</div>' : '') +
        '<label style="display:block;font-weight:700;margin:8px 0 2px" for="xgMine">③ 你的版本</label>' +
        '<textarea id="xgMine" rows="3" maxlength="' + MAX_MINE + '" style="width:100%;font-size:16px" placeholder="照你會想看到的樣子寫"></textarea>' +
        '<label style="display:block;font-weight:700;margin:8px 0 2px" for="xgWhy">④ 為什麼（一句就好）</label>' +
        '<textarea id="xgWhy" rows="2" maxlength="' + MAX_WHY + '" style="width:100%;font-size:16px" placeholder="例如：用的時候我看不懂「撿詞」是什麼意思"></textarea>' +
        '<label style="display:block;font-weight:700;margin:8px 0 2px" for="xgWho">署名（可不填）</label>' +
        '<input id="xgWho" maxlength="' + MAX_WHO + '" value="' + esc(who) + '" style="width:100%;font-size:16px;min-height:44px">' +
        '<div class="row" style="margin-top:10px;gap:8px;align-items:center"><button type="button" id="xgGo" style="min-height:44px;min-width:96px">送出</button><span id="xgMsg" role="status" style="font-size:.95em;' + (st.err ? 'color:#b00020' : 'color:#1b6e3c') + '">' + esc(st.msg) + '</span></div>' +
        '<h3 style="margin:16px 0 6px">已送出的（' + st.rows.length + '）</h3><div id="xgList">' + (st.rows.length ? st.rows.map(rowHtml).join('') : '<div class="muted">還沒有。</div>') + '</div>';
      var sel = el.querySelector('#xgSel'); sel.onchange = function () { var keepM = el.querySelector('#xgMine').value, keepW = el.querySelector('#xgWhy').value; st.sel = sel.value; st.msg = ''; draw(); el.querySelector('#xgMine').value = keepM; el.querySelector('#xgWhy').value = keepW; };
      el.querySelector('#xgGo').onclick = submit;
      Array.prototype.forEach.call(el.querySelectorAll('[data-xgmark]'), function (b) { b.onclick = function () { mark(b.getAttribute('data-id'), b.getAttribute('data-xgmark')); }; });
    }
    function rowHtml(r) {
      var tag = { new: '等楊老師看', ok: '已採用', hold: '暫緩' }[r.st] || r.st, t = byId(r.target);
      return '<div class="card" style="margin:6px 0;padding:8px"><div class="muted" style="font-size:.85em">' + esc(t ? t.label : r.target) + '・' + esc(tag) + (r.who ? '・' + esc(r.who) : '') + '</div>' +
        '<div style="font-size:.9em;margin-top:4px"><span class="muted">原文：</span>' + esc(r.orig) + '</div><div style="margin-top:2px"><b>改成：</b>' + esc(r.mine) + '</div><div style="font-size:.9em;margin-top:2px"><span class="muted">為什麼：</span>' + esc(r.why) + '</div>' +
        (opts.canMark ? '<div class="row" style="gap:6px;margin-top:6px"><button type="button" class="ghost" data-xgmark="ok" data-id="' + esc(r.id) + '" style="min-height:44px">採用</button><button type="button" class="ghost" data-xgmark="hold" data-id="' + esc(r.id) + '" style="min-height:44px">暫緩</button></div>' : '') + '</div>';
    }
    function load() { store.list().then(function (rows) { st.rows = (rows || []).slice().sort(function (a, b) { return Number(b.t) - Number(a.t); }); draw(); }, function () { st.msg = '讀不到已送出的清單。'; st.err = true; draw(); }); }
    function submit() {
      var r = makeEntry({ target: st.sel, mine: el.querySelector('#xgMine').value, why: el.querySelector('#xgWhy').value, who: el.querySelector('#xgWho').value }, opts.rules, Date.now());
      if (!r.ok) { st.msg = r.err; st.err = true; var m = el.querySelector('#xgMsg'); m.textContent = r.err; m.style.color = '#b00020'; return; }
      var b = el.querySelector('#xgGo'); b.disabled = true;
      store.add(r.entry).then(function () { st.msg = '送出了，謝謝。'; st.err = false; st.sel = ''; load(); }, function (e) { b.disabled = false; st.msg = '沒送出去：' + ((e && e.message) || '連線問題') + '（你打的字還在）'; st.err = true; el.querySelector('#xgMsg').textContent = st.msg; el.querySelector('#xgMsg').style.color = '#b00020'; });
    }
    function mark(id, v) { if (!store.mark) return; store.mark(id, v).then(load, function () { st.msg = '標記沒成功。'; st.err = true; draw(); }); }
    draw(); load();
  }

  return { targets: targets, makeEntry: makeEntry, applyOverrides: applyOverrides, mount: mount, getPath: getPath, esc: esc, placeholders: placeholders, MAX_MINE: MAX_MINE, MAX_WHY: MAX_WHY };
});
