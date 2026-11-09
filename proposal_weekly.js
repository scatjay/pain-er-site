/* 提案室「每週送審」第二階段：學生看得到的那一層的純邏輯與字串（不碰 Firebase、不連網；DOM 只有 ensureStyle 一個函式碰 document）。
   三個地方共用：提案室「④ 交出去」（proposal_ui.js）、原型工作台的連結備註（proposal_proto_ui.js）、大廳的「這週要做」卡（game.js，index.html／m.html）。
   份、燈號、檢查都來自 proposal_units.js（資料只有一份：tools/prx_units.json）。這裡只做：
   ① 系統標記（[無痕✓]、[Claude✓]、[Claude✓2]、[PNG✓2]、[試用 …]）的讀、寫、拆開——由畫面按鈕寫進 links.<k>.note 的前綴，學生不手打；
   ② 即時自查的畫面資料與「可不可以送審」的閘門（依份）；
   ③ 審核結果（rev 節點）與歷史的畫面字串；
   ④ 大廳卡的資料整理（本週那一份、上週的審核、還沒送審的份）。
   沒有分數、沒有數字總分，燈號只有 ✓ 做到／△ 做了一部分／○ 還沒。
   學生看得到的字全部用學生的說法：不出現「分數、成績、AI 助教、模型」，醫院一律叫「呼呼醫院」，送審只是給建議、不是繳交（正式繳交在 flipclass）。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./proposal_units.js'));
  else root.ERG_WEEKLY = factory(root.ERG_UNITS);
})(typeof self !== 'undefined' ? self : this, function (U) {
  'use strict';
  var D = U.DATA, M = D.markers;
  var GLYPH = { ok: '✓', part: '△', no: '○' }, WORD = { ok: '做到', part: '做了一部分', no: '還沒' };
  var NOTE_MAX = 200;   /* 連結備註上限（與 proposal_proto.js 的 LIMITS.note 一致，測試比對） */
  var REVIEW_AT = '每晚 23:30';
  var TXT = {
    notSubmit: '送審是請系統看一看、給你建議，不是繳交；正式繳交要到 flipclass。',
    stateNone: '還沒送', stateWait: '審核中', stateDone: '已有建議',
    waitNote: '審核中：' + REVIEW_AT + ' 審一批，審好後回到大廳或提案室就會看到。',
    noRevYet: '還沒有審核建議。送審之後，結果會在審完一批之後出現（不是馬上出來）。',
    needMode: '這一份要先選一個模式（新手、中級、專家），選好才能送審。',
    needLink: '先在「③ 把結果貼回來」貼上這一份的連結，再按這裡。',
    selfOnly: '這幾顆是你自己說的，系統沒有替你確認。'
  };

  function s(x) { return x == null ? '' : String(x); }
  function esc(x) { return s(x).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function len(x) { return Array.from(s(x)).length; }
  function clip(x, n) { return Array.from(s(x)).slice(0, n).join(''); }
  function isObj(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }
  function reEsc(x) { return s(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  /* ———— 系統標記 ————
     家族：incognito／claude／png／trial。note 的格式是「標記 標記 …　自己寫的備註」，標記一律在最前面。 */
  var FAMS = ['incognito', 'claude', 'png', 'trial'];
  var LEAD = new RegExp('^\\s*(' + [reEsc(M.claude2), reEsc(M.claude1), reEsc(M.png2), reEsc(M.incognito), reEsc(M.trialOpen) + '[^\\]]*\\]'].join('|') + ')');
  function famOf(tok) {
    if (tok === M.incognito) return 'incognito';
    if (tok === M.claude1 || tok === M.claude2) return 'claude';
    if (tok === M.png2) return 'png';
    return tok.indexOf(M.trialOpen) === 0 ? 'trial' : '';
  }
  /* 把 note 拆成 { marks:[標記…], text:自己寫的備註 }。標記只認最前面連續的那一段（中間夾的不算，和審核端「含有」的判法不衝突） */
  function splitNote(note) {
    var rest = s(note), marks = [], m;
    while ((m = LEAD.exec(rest))) { marks.push(m[1]); rest = rest.slice(m[0].length); }
    return { marks: marks, text: rest.trim() };
  }
  function orderMarks(marks) {
    var by = {}; marks.forEach(function (t) { by[famOf(t)] = t; });
    return FAMS.filter(function (f) { return by[f]; }).map(function (f) { return by[f]; });
  }
  function joinNote(marks, text, max) {
    max = max || NOTE_MAX;
    var head = orderMarks(marks).join(' '), t = s(text).trim();
    if (!head) return clip(t, max);
    if (!t) return clip(head, max);
    var room = max - len(head) - 1;
    return room > 0 ? head + ' ' + clip(t, room) : clip(head, max);
  }
  function markFam(note, fam) { return splitNote(note).marks.filter(function (t) { return famOf(t) === fam; })[0] || ''; }
  /* tok 為空字串＝取消這個家族的標記；回傳新的 note */
  function setMarker(note, fam, tok, max) {
    var sp = splitNote(note), keep = sp.marks.filter(function (t) { return famOf(t) !== fam; });
    if (tok) keep.push(tok);
    return joinNote(keep, sp.text, max);
  }
  /* 試用紀錄：[試用 38秒/5下/停在某一句]；秒數、點幾下要是正整數，停在哪一句不能空，不能含 [ ] 與換行 */
  function trialToken(sec, taps, stop) {
    var a = Math.floor(Number(sec)), b = Math.floor(Number(taps)), w = clip(s(stop).replace(/[\[\]\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim(), 40);
    if (!(a >= 1 && a <= 9999) || !(b >= 1 && b <= 9999) || !w) return '';
    return M.trialOpen + ' ' + a + '秒/' + b + '下/停在' + w + ']';
  }
  function trialParts(tok) {
    var m = /^\[試用 ([0-9]+)秒\/([0-9]+)下\/停在(.*)\]$/.exec(s(tok));
    return m ? { sec: Number(m[1]), taps: Number(m[2]), stop: m[3] } : null;
  }

  /* ———— 這一份用到哪條連結、有哪些系統標記按鈕 ———— */
  function kindOf(unitId) { return s(unitId).charAt(0) === 'f' ? 'fig' : 'ais'; }
  function checkIds(unitId) { var uc = D.unitChecks[unitId] || {}, out = []; Object.keys(uc).forEach(function (k) { (uc[k] || []).forEach(function (id) { out.push(id); }); }); return out; }
  /* 這一份有哪些「由畫面按鈕寫入」的自述；每項 { fam, tok, label, kind, step }。a2 的 Claude 整合要兩次（✓、✓2） */
  function markerButtons(unitId) {
    var ids = checkIds(unitId), kind = kindOf(unitId), out = [];
    if (ids.indexOf('shareView') >= 0) out.push({ fam: 'incognito', tok: M.incognito, label: '我用無痕視窗打開過了', kind: kind, step: 1 });
    if (ids.indexOf('claude2') >= 0) {
      out.push({ fam: 'claude', tok: M.claude1, label: '我做了第 1 次 Claude 整合', kind: kind, step: 1 });
      out.push({ fam: 'claude', tok: M.claude2, label: '我做了第 2 次 Claude 整合', kind: kind, step: 2 });
    } else if (ids.indexOf('claude1') >= 0) out.push({ fam: 'claude', tok: M.claude1, label: '我做了 Claude 整合', kind: kind, step: 1 });
    if (ids.indexOf('pngTwo') >= 0) out.push({ fam: 'png', tok: M.png2, label: '我匯出了改前、改後兩張 PNG', kind: kind, step: 1 });
    return out;
  }
  /* 這一份要貼哪幾條連結（主要的在前）：看這一份的檢查有沒有用到 Figma／AI Studio 連結 */
  function linkKinds(unitId) {
    var ids = checkIds(unitId), out = [], main = kindOf(unitId);
    var has = { fig: ids.indexOf('linkFig') >= 0 || ids.indexOf('linkFigKeep') >= 0, ais: ids.indexOf('linkAis') >= 0 };
    if (has[main]) out.push(main);
    ['fig', 'ais'].forEach(function (k) { if (has[k] && out.indexOf(k) < 0) out.push(k); });
    return out.length ? out : [main];
  }
  /* 這週是哪一份：網址 ?unit=f2 這類覆寫只在本機（127.0.0.1／localhost）才認，給測試用；學生在正式站改網址不會影響畫面 */
  function unitNow(o) {
    o = o || {}; var q = /[?&]unit=(f1|a1|f2|a2|f3|a3)(?![0-9A-Za-z])/.exec(s(o.search));
    if (q && /^(127\.0\.0\.1|localhost)$/.test(s(o.host))) return U.unitById(q[1]);
    return U.currentUnit(o.cls, o.now);
  }
  function hasTrial(unitId) { return checkIds(unitId).indexOf('trialRecord') >= 0; }
  function markState(note, b) {   /* 這顆按鈕現在是不是已經按下：Claude 的 ✓2 也算 ✓ 已按 */
    var t = markFam(note, b.fam);
    if (!t) return false;
    if (b.fam === 'claude' && b.tok === M.claude1) return true;
    return t === b.tok;
  }

  /* ———— 即時自查與閘門 ———— */
  function lightRows(res) {   /* unitChecklist 的結果 → 畫面用（沒有不適用的燈） */
    return res.lights.filter(function (l) { return l.state !== 'na'; }).map(function (l) { return { k: l.k, name: l.name, state: l.state, glyph: GLYPH[l.state], word: WORD[l.state], why: l.why }; });
  }
  /* 可不可以送審（依份）：
     ・模式要先選（只有 2/3、3/3）　・這一份擋關的項目都過（unitChecklist.blocking）　・要求整套對準表的兩份（D.alignGate）沿用第一階段的老閘門：先選方向、對準表至少 3 列
     回傳 { ok, why, reasons:[…學生看得到的字] }；第一個原因當 why */
  function sendGate(res, ctx) {
    ctx = ctx || {}; var u = U.unitById(res.unit), reasons = [];
    if (u.modes && !ctx.lvChosen) reasons.push(TXT.needMode);
    if (D.alignGate.indexOf(res.unit) >= 0 && ctx.canSubmitOld === false) reasons.push('先選好方向，並把對準表寫完至少 ' + D.minRows + ' 列的「我決定什麼」。');
    res.lights.forEach(function (l) { l.items.forEach(function (it) { if (it.gate && it.state !== 'ok' && it.msg && reasons.indexOf(it.msg) < 0) reasons.push(it.msg); }); });
    return { ok: reasons.length === 0, why: reasons[0] || '', reasons: reasons };
  }
  /* 組出一份即時自查：snap＝{doc:{dir,rows,real,proto}, …}；回傳 { unit, lv, lights, missing, gate, deliver, kind, buttons } */
  function selfView(snap, unitId, ctx) {
    ctx = ctx || {}; var u = U.unitById(unitId);
    var res = U.unitChecklist(snap, unitId, ctx.lvChosen ? ctx.lv : 0, ctx.sets);
    var g = sendGate(res, ctx);
    return { unit: u, res: res, lights: lightRows(res), missing: res.missing, gate: g, deliver: u.deliver.slice(), kind: kindOf(unitId), buttons: markerButtons(unitId), trial: hasTrial(unitId) };
  }

  /* ———— 日期字串（不用 Date，免得時區算錯） ———— */
  function md(iso) { var m = /-(\d\d)-(\d\d)T(\d\d):/.exec(s(iso)); return m ? { m: Number(m[1]), d: Number(m[2]), h: Number(m[3]) } : null; }
  function dueText(unitId, cls) {
    var sc = U.schedule(unitId, cls), x = sc && md(sc.dueAt); if (!x) return '';
    return x.m + '/' + x.d + ' 晚上 ' + (x.h > 12 ? x.h - 12 : x.h) + ' 點前';
  }
  function resultText(unitId, cls) { var sc = U.schedule(unitId, cls), x = sc && md(sc.resultAt); return x ? x.m + '/' + x.d : ''; }

  /* ———— 審核結果（rev 節點） ———— */
  function lightsHtml(checks) {
    var arr = Array.isArray(checks) ? checks : [];
    if (!arr.length) return '';
    return '<ul class="wk-lights">' + arr.map(function (c) {
      var st = RANKS[c.state] ? c.state : 'no';
      return '<li class="wk-l wk-' + st + '"><span class="wk-g" aria-hidden="true">' + GLYPH[st] + '</span><b>' + esc(c.name) + '</b>　' + WORD[st] + (c.why && st !== 'ok' ? '<div class="wk-why">' + esc(c.why) + '</div>' : '') + '</li>';
    }).join('') + '</ul>';
  }
  var RANKS = { ok: 1, part: 1, no: 1 };
  function unitName(id) { var u = U.unitById(id); return u ? u.name : ''; }
  function toArr(x) { return Array.isArray(x) ? x : (isObj(x) ? Object.keys(x).sort().map(function (k) { return x[k]; }) : []); }
  /* 一筆審核建議的完整內容（燈號、一句話建議、逐列提醒、對準表還缺的地方）。fbOnly＝只給建議那一句 */
  function revBody(r) {
    if (!r) return '';
    var al = toArr(r.align), rows = toArr(r.rows);
    return lightsHtml(r.checks) +
      (r.fb ? '<p class="wk-fb">' + esc(r.fb) + '</p>' : '') +
      (al.length ? '<ul class="wk-al">' + al.map(function (p) { return '<li>' + esc(p && p.msg) + '</li>'; }).join('') + '</ul>' : '') +
      (rows.length ? '<ul class="wk-rows">' + rows.map(function (x) { return x && x.note ? '<li>第 ' + esc(x.n) + ' 列：' + esc(x.note) + '</li>' : ''; }).join('') + '</ul>' : '');
  }
  function dayText(day) { var m = /^(\d{4})(\d{2})(\d{2})$/.exec(s(day)); return m ? Number(m[2]) + '/' + Number(m[3]) : s(day); }
  /* 「④ 交出去」：目前這一份的最新一筆（沒有就說還沒有），旁邊附歷史 */
  function revCardHtml(rev, unitId) {
    if (!rev) return '<div class="wk-rev"><b>' + esc(unitName(unitId)) + ' 的審核建議</b><div class="muted">' + esc(TXT.noRevYet) + '</div></div>';
    return '<div class="wk-rev"><b>' + esc(unitName(rev.unit || unitId)) + ' 的審核建議</b>　<span class="muted">' + esc(dayText(rev.day)) + ' 送審</span>' + revBody(rev) + '<div class="muted">' + esc(TXT.notSubmit) + '</div></div>';
  }
  /* 一份一列、最新在上的歷史（只讀）：revs＝[{day, unit, ok, fb, checks, …}]（依日期排序，舊→新） */
  function histRows(revs) {
    var seen = {}, out = [];
    revs.slice().sort(function (a, b) { return s(b.day) < s(a.day) ? -1 : 1; }).forEach(function (r) {
      var u = s(r.unit || '?'); if (seen[u]) return; seen[u] = 1; out.push(r);   /* 一份只留最新一筆，已經是新→舊 */
    });
    return out;
  }
  function histHtml(revs) {
    var list = histRows(toArr(revs)); if (!list.length) return '';
    return '<details class="wk-hist" id="wkHist"><summary><b>📒 我的審核紀錄</b>（' + list.length + ' 份）</summary>' + list.map(function (r) {
      var cs = Array.isArray(r.checks) ? r.checks : [], bad = cs.filter(function (c) { return c.state !== 'ok'; }).length;
      return '<details class="wk-hrow"><summary>' + esc(r.unit ? unitName(r.unit) : '（舊版提案）') + '　<span class="muted">' + esc(dayText(r.day)) + ' 送審' + (cs.length ? '，' + (bad ? bad + ' 顆還沒全亮' : '燈都亮了') : '') + '</span></summary>' + revBody(r) + '</details>';
    }).join('') + '</details>';
  }

  /* ———— 大廳卡 ———— */
  /* o：{ cls, now, unit（網址覆寫，可空）, subs:{YYYYMMDD:{t}}, revs:{YYYYMMDD:{…rev}}, loaded }
     狀態：還沒送（沒有這一份的送審）｜審核中（有送審、但審核比送審舊或還沒有）｜已有建議。
     「這一份有沒有送過」看三個來源：審核建議自己寫的 unit、沒審核的送審用日期＋班級推出來的份、最新一筆審核裡的 prior（累積式：前面哪幾份有連結）。 */
  function lobbyModel(o) {
    o = o || {}; var cls = o.cls, now = o.now, subs = isObj(o.subs) ? o.subs : {}, revs = isObj(o.revs) ? o.revs : {};
    var cur = (o.unit && U.unitById(o.unit)) || U.currentUnit(cls, now), next = D.units[cur.n] || null, prev = cur.n > 1 ? D.units[cur.n - 2] : null;
    var days = {}; Object.keys(subs).forEach(function (d) { days[d] = 1; }); Object.keys(revs).forEach(function (d) { days[d] = 1; });
    var by = {}, newestRev = null;
    Object.keys(days).sort().forEach(function (d) {
      var sub = isObj(subs[d]) ? subs[d] : null, rev = isObj(revs[d]) ? revs[d] : null;
      var unit = rev && rev.unit ? rev.unit : U.unitForSub(d, sub && sub.t, cls).unit.id;
      var state = (sub && (!rev || Number(rev.at || 0) < Number(sub.t || 0))) ? 'wait' : (rev ? 'done' : 'none');
      by[unit] = { day: d, unit: unit, state: state, rev: rev ? Object.assign({ day: d }, rev) : null };   /* 日期由舊到新，後面的蓋掉前面的＝一份留最新一筆 */
      if (rev) newestRev = Object.assign({ day: d }, rev);
    });
    var sent = {}; Object.keys(by).forEach(function (u) { sent[u] = 1; });
    toArr(newestRev && newestRev.prior).forEach(function (p) { if (p && p.sent && p.unit) sent[p.unit] = 1; });
    var notSent = D.units.slice(0, cur.n).filter(function (u) { return !sent[u.id]; });
    var curRec = by[cur.id] || null, prevRec = prev ? (by[prev.id] || null) : null;
    return {
      loaded: !!o.loaded, failed: !!o.failed, cls: cls, cur: cur, next: next, prev: prev, due: dueText(cur.id, cls), result: resultText(cur.id, cls),
      curState: curRec ? curRec.state : 'none', prevRec: prevRec, prevState: prevRec ? prevRec.state : 'none',
      notSent: notSent, all: by, revList: Object.keys(by).map(function (u) { return by[u].rev; }).filter(Boolean)
    };
  }
  var STATE_TXT = { none: TXT.stateNone, wait: TXT.stateWait, done: TXT.stateDone };
  function lobbyHtml(m, opts) {
    opts = opts || {}; var cur = m.cur, href = 'proposal.html' + (opts.unitParam ? '?unit=' + encodeURIComponent(cur.id) : '');
    var h = '<div class="wk-top"><b>📝 這週要做：' + esc(cur.name) + '（' + esc(cur.week) + '）' + esc(cur.title) + '</b>' + (m.failed ? '' : ' <span class="wk-chip wk-s-' + m.curState + '">' + esc(STATE_TXT[m.curState]) + '</span>') + '</div>';
    h += '<div class="muted">' + (m.next ? '做完接 ' + esc(m.next.name) + '（' + esc(m.next.week) + '）。' : '這是最後一份，之後繼續改到學期結束。') +
      (m.due ? '想在 ' + esc(m.result) + ' 看到建議，請在 ' + esc(m.due) + '送審。' : '') + '</div>';
    h += '<div class="wk-deliver"><b>要交什麼</b><ul>' + cur.deliver.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>';
    h += '<div class="muted">' + esc(TXT.notSubmit) + '</div>';
    if (m.curState === 'wait' && !m.failed) h += '<div class="wk-wait">' + esc(TXT.waitNote) + '</div>';
    h += '<div class="wk-bar"><a class="wk-btn" id="wkGo" href="' + esc(href) + '">進提案室做這一份</a></div>';
    /* 上週那一份的審核建議 */
    h += '<div class="wk-prev" id="wkPrev">';
    if (m.failed) h += '<b>🗒 上週的審核建議</b><div class="muted">暫時讀不到你的審核紀錄，稍後重新整理大廳再看。</div>';
    else if (!m.prev) h += '<b>🗒 上週的審核建議</b><div class="muted">這是第一份，還沒有上週的建議。</div>';
    else if (!m.loaded) h += '<b>🗒 上週 ' + esc(m.prev.name) + ' 的審核建議</b><div class="muted">正在讀取…</div>';
    else if (m.prevState === 'done') {
      var r = m.prevRec.rev;
      h += '<b>🗒 上週 ' + esc(m.prev.name) + ' 的審核建議</b> <span class="wk-chip wk-s-done">' + esc(STATE_TXT.done) + '</span><span class="muted">　' + esc(dayText(r.day)) + ' 送審</span>' + lightsHtml(r.checks) +
        (r.fb ? '<p class="wk-fb">' + esc(clip(r.fb, 90) + (len(r.fb) > 90 ? '…' : '')) + '</p>' : '') +
        '<details class="wk-more" id="wkMore"><summary class="wk-btn ghost">看完整建議</summary>' + revBody(Object.assign({}, r, { checks: null, fb: len(r.fb) > 90 ? r.fb : '' }))   /* 上面已經是完整的一句時，展開的地方不再重複 */ + '<div class="muted">' + esc(TXT.notSubmit) + '</div></details>';
    } else if (m.prevState === 'wait') h += '<b>🗒 上週 ' + esc(m.prev.name) + ' 的審核建議</b> <span class="wk-chip wk-s-wait">' + esc(STATE_TXT.wait) + '</span><div class="muted">' + esc(TXT.waitNote) + '</div>';
    else h += '<b>🗒 上週 ' + esc(m.prev.name) + ' 的審核建議</b> <span class="wk-chip wk-s-none">' + esc(STATE_TXT.none) + '</span><div class="muted">這一份還沒送審，所以沒有建議；現在送審，會以本週這一份（' + esc(cur.name) + '）的標準來看。</div>';
    h += '</div>';
    if (m.loaded && !m.failed) {
      var list = m.notSent.filter(function (u) { return u.id !== cur.id; });
      h += '<div class="wk-todo" id="wkTodo"><b>還沒送審的份：</b>' + (list.length ? list.map(function (u) { return esc(u.name); }).join('、') + '（做好連結後，隨時可以一起送審）' : (m.notSent.length ? '前面的份都送過了。' : '都送過了。')) + '</div>';
    }
    return h;
  }

  /* ———— 樣式（三個頁面共用，只注入一次；顏色用頁面既有的變數，亮暗兩套都跟著走） ———— */
  var CSS = '.wk{margin:10px 0}.wk .wk-h{font-weight:900}.wk ul{margin:4px 0;padding-left:20px}' +
    '.wk-lights{list-style:none;padding:0!important;margin:6px 0!important}.wk-l{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px;margin:4px 0;padding:6px 10px;border:2px solid var(--ink);border-radius:10px;background:var(--panel);color:var(--fg)}' +
    '.wk-g{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border:2px solid var(--ink);border-radius:50%;font-weight:900;flex:none}' +
    '.wk-ok .wk-g{background:var(--mint);color:#1e1e1e}.wk-part .wk-g{background:var(--yellow);color:#1e1e1e}.wk-no .wk-g{background:var(--panel);color:var(--fg)}' +
    '.wk-why{flex:1 1 100%;font-size:13px;color:var(--muted);padding-left:34px}.wk-fb{margin:6px 0}' +
    '.wk-chip{display:inline-block;border:2px solid var(--ink);border-radius:99px;padding:0 10px;font-size:12px;font-weight:700;background:var(--panel);color:var(--fg)}' +
    '.wk-s-wait{background:var(--yellow);color:#1e1e1e}.wk-s-done{background:var(--mint);color:#1e1e1e}' +
    '.wk-btn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:6px 16px;border:3px solid var(--ink);border-radius:10px;background:var(--yellow);color:#1e1e1e;font-weight:700;font-size:16px;text-decoration:none;cursor:pointer;box-shadow:3px 3px 0 var(--ink)}' +
    '.wk-btn.ghost{background:var(--panel);color:var(--fg);box-shadow:none}.wk-bar{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0}' +
    '.wk-mk{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0}.wk-mk button{min-height:48px;font-size:16px;padding:6px 14px}.wk-mk button.on{background:var(--mint);color:#1e1e1e}' +
    '.wk-trial{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin:6px 0}.wk-trial input{min-height:48px;font-size:16px}' +
    '.wk-prev,.wk-todo,.wk-wait{margin-top:10px;padding-top:8px;border-top:2px dashed var(--line)}.wk-more summary{list-style:none;margin-top:6px}.wk-more summary::-webkit-details-marker{display:none}' +
    '.wk-hist summary,.wk-hrow summary{cursor:pointer;min-height:48px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}.wk-hrow{border-top:1px solid var(--line);padding:2px 0}' +
    '.wk-mode{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0}.wk-mode button{min-height:48px;font-size:16px;padding:6px 16px}' +
    '#secExport button,#wkModeAsk button{min-height:48px;font-size:16px}#secExport .bar{gap:8px}' +
    '.wk-box{border:3px solid var(--ink);border-radius:10px;padding:10px 12px;background:var(--panel);margin:8px 0}.wk-warn{background:var(--yellow);color:#1e1e1e}';
  function ensureStyle(doc) {
    doc = doc || (typeof document !== 'undefined' ? document : null);
    if (!doc || !doc.head || doc.getElementById('wkStyle')) return false;
    var st = doc.createElement('style'); st.id = 'wkStyle'; st.textContent = CSS; doc.head.appendChild(st); return true;
  }

  return { DATA: D, GLYPH: GLYPH, WORD: WORD, TXT: TXT, NOTE_MAX: NOTE_MAX, FAMS: FAMS, CSS: CSS, esc: esc,
    splitNote: splitNote, joinNote: joinNote, setMarker: setMarker, markFam: markFam, famOf: famOf, trialToken: trialToken, trialParts: trialParts,
    kindOf: kindOf, linkKinds: linkKinds, unitNow: unitNow, markerButtons: markerButtons, hasTrial: hasTrial, markState: markState, checkIds: checkIds,
    lightRows: lightRows, sendGate: sendGate, selfView: selfView, dueText: dueText, resultText: resultText,
    lightsHtml: lightsHtml, revBody: revBody, revCardHtml: revCardHtml, histRows: histRows, histHtml: histHtml, unitName: unitName,
    lobbyModel: lobbyModel, lobbyHtml: lobbyHtml, ensureStyle: ensureStyle };
});
