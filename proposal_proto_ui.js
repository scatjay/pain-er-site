/* 提案室「原型工作台」畫面：掛在 #secProto，讀提案室的狀態（window.ERG_PX_S）與 proposal_proto.js 的純邏輯。
   三種模式沿用 ui_level 的設定（本機 localStorage）：新手＝一次一步、指令可改（改過標「已自行修改」，可還原）；中級＝四步同頁、指令可改；專家＝全部展開。
   手機（寬度 ≤ 860）：單欄、按鈕 ≥ 48px、字級 ≥ 16px；手機上只做「複製指令」與「貼回連結」，實際改設計在各工具裡。 */
(function () {
  'use strict';
  var P = window.ERG_PROTO, U = window.ERG_UILV, $ = function (id) { return document.getElementById(id); };
  if (!P) return;
  var UI = window.ERG_PROTO_UI = {};
  var LINKS = { free: 'https://claude.ai/new', dsg: 'https://claude.ai/artifacts', fig: 'https://www.figma.com/files', ais: 'https://aistudio.google.com/' };
  var T = { ach: {}, achWatch: '', step: 0, tool: 'dsg', cards: [], rowNs: null, text: null, dirty: false, proto: P.emptyProto(), watching: '', lv: 0, part: 1, partInit: false, start: '', panel: null };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function S() { return window.ERG_PX_S || null; }
  function lvNow() {
    var s = S(); var sid = s && s.sid; var l = U && sid ? U.readLocal(window.localStorage, sid) : null;
    return P.level(l ? l.lv : 3);
  }
  function toolsFor(lv) { return P.TOOLS.filter(function (t) { return lv !== 1 || t.k === 'dsg' || t.k === 'ais'; }); }
  function cardList(lv) { return P.cardsFor(T.tool, lv); }   /* 起點卡每種模式只看自己那一張 */
  function ensureCards(v) {
    var ok = T.cards.filter(function (id) { var c = P.cardById(id); return c && c.t === T.tool; });
    if (!ok.length) { var gl = P.listFor(T.part, v.lv).filter(function (c) { return c.t === T.tool; }); ok = [gl.length ? gl[0].id : P.defaultCard(T.tool)].filter(Boolean); }
    T.cards = ok.slice(0, v.pickCards);
  }
  /* 帶進指令的「設計決定卡」：預設前三張有內容的；學生可以自己換（最多 3 張） */
  function decided() { var s = S(); return (s && s.doc && s.doc.rows || []).filter(function (r) { return r.decide; }); }
  function rowNs() {
    var d = decided().map(function (r) { return r.n; });
    var pick = (T.rowNs || []).filter(function (n) { return d.indexOf(n) >= 0; });
    return pick.length ? pick.slice(0, 3) : d.slice(0, 3);
  }
  function evCards(v) {
    var s = S(), rows = decided(), on = rowNs();
    if (!rows.length) return '<div class="pt-note">你還沒在對準表寫設計決定。先到上面② 寫一兩個，這裡就會變成可以選的卡片。</div>';
    return '<div class="pt-h2">你的設計決定卡（挑最多 3 張帶進指令）</div><div class="pt-cards">' + rows.map(function (r) {
      var chips = (r.ev || []).slice(0, 3).map(function (id) { var e = s.evMap[id]; return '<span class="pt-chip">' + esc(e ? e.label : '依據') + '</span>'; }).join('');
      var isOn = on.indexOf(r.n) >= 0;
      return '<label class="pt-card' + (isOn ? ' on' : '') + '"><input type="checkbox" data-pt="row" data-n="' + r.n + '"' + (isOn ? ' checked' : '') + '><span><b>' + esc(r.decide) + '</b><small>' + (chips || '還沒對準依據') + '</small></span></label>';
    }).join('') + '</div>';
  }
  function genText() {
    var s = S(); var pk = s.doc && s.doc.dir && s.doc.dir.pick, dn = ''; if (pk && pk !== 'mine' && window.ERG_PX) dn = (window.ERG_PX.DIRS.filter(function (x) { return x.k === pk; })[0] || {}).name || '';
    var d = P.buildPrompt(s.doc, s.evMap, { tool: T.tool, cardIds: T.cards, dirName: dn, rowNs: rowNs() });
    return d;
  }

  function watch() {
    var s = S(); if (!s || !s.store || !s.sid || !s.store.watchProto) return;
    var key = s.sid + ':' + s.caseId; if (T.watching === key) return; T.watching = key;
    s.store.watchProto(s.sid, function (p) { T.proto = p; if (!isEditing()) UI.render(); });
    if (s.store.watchAch) s.store.watchAch(s.sid, function (a) { T.ach = a; if (!isEditing()) UI.render(); });
  }
  function isEditing() { var a = document.activeElement; return !!(a && /^(TEXTAREA|INPUT)$/.test(a.tagName) && $('secProto') && $('secProto').contains(a)); }
  function save(msg) {
    var s = S(); if (!s || !s.store.saveProto) return Promise.resolve();
    T.proto.lv = lvNow();
    return s.store.saveProto(s.sid, T.proto, lvNow()).then(function (o) { return award().then(function () { return o; }); }).then(function () { toastMsg(msg || '已記下這一版'); }, function (e) { toastMsg('存不進去：' + (e && e.message)); });
  }
  /* 成就：第一版／迭代（中級 2 版、專家 3 版）。規則會再檢查一次條件，這裡只是在條件成立時去記 */
  function award() {
    var s = S(), n = P.verKeys(T.proto).length, lv = lvNow(), tasks = [];
    if (!s || !s.store.setAch) return Promise.resolve();
    if (n >= 1) tasks.push(s.store.setAch(s.sid, 'first'));
    if (lv >= 2 && n >= P.iterReq(lv)) tasks.push(s.store.setAch(s.sid, 'iter'));
    return Promise.all(tasks).then(function (r) { if (r.some(Boolean)) toastMsg('🏅 得到新的成就'); });
  }
  function achBar(lv) {
    var a = T.ach || {}, n = P.verKeys(T.proto).length, need = P.iterReq(lv);
    var items = [['🧪', '第一版原型', !!a.first], ['🔁', '改了再改（' + (need || '中級 2 版／專家 3 版') + (need ? ' 版' : '') + '）', !!a.iter], ['🎯', '原型過審', !!a.passed]];
    return '<div class="pt-ach">' + items.map(function (x) { return '<span class="pt-chip' + (x[2] ? ' got' : '') + '">' + x[0] + ' ' + esc(x[1]) + (x[2] ? ' ✓' : '') + '</span>'; }).join('') + '</div>';
  }
  /* 前面還沒做完的步驟：提示但不擋，學生想先動手做原型可以直接做 */
  function preBox() {
    var s = S(); if (!s) return '';
    var list = P.prereq(s.st || {}, { evidence: (s.evidence || []).length, cells: (s.cells || []).length });
    if (!list.length) return '';
    var href = function (go) { var a = go === 'game' ? $('reviseLink') : go === 'story' ? $('sbLink') : null; return a && a.getAttribute('href') ? a.getAttribute('href') : (go === 'dir' ? '#secDir' : go === 'rows' ? '#secRows' : '#'); };
    return '<div class="pt-pre" role="note"><b>想先動手可以直接做。</b> 前面這些還沒完成，做完之後指令會更貼你問到的內容：<ul>' + list.map(function (q) { return '<li>' + esc(q.text) + '　<a href="' + esc(href(q.go)) + '">' + (q.go === 'game' ? '回急診室' : q.go === 'story' ? '去排故事板' : '帶我去') + '</a></li>'; }).join('') + '</ul></div>';
  }
  function toastMsg(m) { var t = $('toast'); if (!t) return; t.textContent = m; t.className = 'on'; clearTimeout(toastMsg.t); toastMsg.t = setTimeout(function () { t.className = ''; }, 3000); }

  function partKey() { return (P.PARTS[T.part - 1] || P.PARTS[0]).k; }
  function partModes() { return !!(P.PARTS[T.part - 1] || P.PARTS[0]).modes; }
  /* ———— 步驟助教（figai_coach.js＋figai_coach_ui.js；沒載入就整塊不出現）———— */
  function coachHtml(lv) {
    var FG = window.FigAIUI; if (!FG || !window.FigCoach) return '';
    var sid = (S() && S().sid) || '';
    if (!T.partInit && sid) { T.partInit = true; try { var sp = FG.savedPart(window.localStorage, sid); var hit = P.PARTS.filter(function (x) { return x.k === sp; })[0]; var cls = ''; try { cls = window.sessionStorage.getItem('erg2_cls') || ''; } catch (e2) {} var wk = P.weekPart(Date.now(), cls); T.part = Math.max(T.part, wk, hit ? hit.n : 1); } catch (e) {} }   /* 預設＝本週那一份（依今天日期＋班級）；上次做到更後面的就留在那裡，已交過的可以往後切 */
    var first = !T.panel; T.panel = FG.ensure(T.panel, lv, partKey());
    if (first && sid) { try { FG.loadCounts(window.localStorage, sid, T.panel); FG.restore(T.panel, window.localStorage, sid, Date.now()); } catch (e) {} }   /* 離開再回來：從上次做到的那一步接手（只讀本機紀錄） */
    return '<div id="figaiBox">' + FG.render(T.panel) + '</div>';
  }
  function coachSave() { var FG = window.FigAIUI, s = S(); if (FG && T.panel && s && s.sid) { try { FG.saveCounts(window.localStorage, s.sid, T.panel); FG.savePos(window.localStorage, s.sid, T.panel, Date.now()); } catch (e) {} } }

  /* ———— 畫面 ———— */
  function modeBar(lv) {
    return '<div class="pt-mode" role="group" aria-label="模式">' + [1, 2, 3].map(function (k) { return '<button class="pt-m' + (lv === k ? ' on' : '') + '" data-pt="mode" data-v="' + k + '">' + esc(P.view(k).name) + '</button>'; }).join('') + '</div>';
  }
  function stepPick(v) {
    var FG = window.FigAIUI;
    var h = '<div class="pt-h">' + esc(P.stepName(0)) + '</div>';
    h += FG ? FG.partBar(P, T.part) : '';
    if (partKey() === 'f2' && FG) h += FG.startBlock(P, v.lv, T.start);
    h += evCards(v);
    var list = P.listFor(T.part, v.lv).filter(function (c) { return v.lv !== 1 || c.t === 'dsg' || c.t === 'ais'; });   /* 新手只用 Claude Design 與 AI Studio */
    if (!list.length) return h + '<div class="pt-note">這一份沒有指引卡。做完上一份，到下面「③ 把結果貼回來」貼作品連結、寫這一版改了什麼，再做自己檢查；試用紀錄和交件連結也在那裡。</div>' +
      '<div class="pt-bar"><button class="pt-big" data-pt="goback">去貼回結果</button></div>';
    h += '<div class="pt-h2">這次用哪張指引卡</div><div class="pt-cards">' + list.map(function (c) {
      var on = T.cards.indexOf(c.id) >= 0, tn = (P.TOOLS.filter(function (t) { return t.k === c.t; })[0] || {}).name || '';
      return '<label class="pt-card' + (on ? ' on' : '') + '"><input type="' + (v.pickCards === 1 ? 'radio' : 'checkbox') + '" name="ptc" data-pt="card" data-id="' + c.id + '"' + (on ? ' checked' : '') + '><span><b>' + esc(c.title) + '</b><small>貼到：' + esc(tn) + '　做完的樣子：' + esc(c.done) + '</small></span></label>';
    }).join('') + '</div>';
    if (v.pickCards > 1) h += '<div class="pt-note">最多挑 ' + v.pickCards + ' 張（要貼到同一個工具），一次一個改變最好。</div>';
    return h;
  }
  function stepCopy(v) {
    var g = genText(), text = T.text != null ? T.text : g.text;
    var tool = P.TOOLS.filter(function (t) { return t.k === T.tool; })[0];
    return '<div class="pt-h">' + esc(P.stepName(1)) + '</div><div class="pt-note">到「' + esc(tool.where) + '」，把下面這段貼進去。' + (T.tool === 'ais' ? '（第一次要附上畫面截圖）' : '') + '</div>' +
      (T.text != null && T.text !== g.text ? '<div class="pt-note"><span class="pt-chip got">已自行修改</span> 這段不是助教原本產生的，按「還原」可以回到原本那段。</div>' : '') + '<textarea id="ptText" data-pt="text" rows="9" aria-label="給 ' + esc(tool.name) + ' 的指令">' + esc(text) + '</textarea>' +
      '<div class="pt-bar"><button class="pt-big" data-pt="copy">📋 複製指令</button><a class="pt-big pt-a" href="' + esc(LINKS[T.tool]) + '" target="_blank" rel="noopener">開 ' + esc(tool.name) + '</a>' + (T.text != null && T.text !== g.text ? '<button class="pt-big g" data-pt="reset">還原</button>' : '') + '</div>';
  }
  function stepBack(v) {
    var p = T.proto, lk = p.links[T.tool] || { url: '', note: '' };
    var tool = P.TOOLS.filter(function (t) { return t.k === T.tool; })[0];
    return '<div class="pt-h">' + esc(P.stepName(2)) + '</div>' +
      '<label>' + esc(tool.name) + ' 的作品連結（https 開頭，要開分享）<input id="ptUrl" data-pt="url" inputmode="url" value="' + esc(lk.url) + '" placeholder="https://…"></label>' +
      '<label>一句備註（選填，≤' + P.LIMITS.note + ' 字）<input data-pt="note" maxlength="' + P.LIMITS.note + '" value="' + esc(lk.note) + '"></label>' +
      '<label>這一版改了什麼、回應了哪一條訪談或線索（≤' + P.LIMITS.chg + ' 字）<textarea data-pt="chg" rows="3" maxlength="' + P.LIMITS.chg + '" placeholder="例如：把回診日期放到最上面，因為家屬說找不到">' + esc(p.chg) + '</textarea></label>' +
      '<div class="pt-note">截圖請貼進你的 Figma，排在原版旁邊。</div>' + verBlock(v);
  }
  function verBlock(v) {
    var need = P.iterReq(v.lv), ks = P.verKeys(T.proto);
    if (!need) return '';
    var list = ks.map(function (k) { var x = T.proto.vers[k]; return '<div class="hrow"><b>第 ' + k.slice(1) + ' 版</b>　' + esc(String(x.chg).slice(0, 60)) + '</div>'; }).join('');
    return '<div class="pt-vers"><div class="pt-h2">改過的版本（' + v.name + '要存到至少 ' + need + ' 版，現在 ' + ks.length + ' 版）</div>' + (list || '<div class="pt-note">還沒有。把上面這一版的連結和「改了什麼」填好，按下面的鈕存成第 1 版；之後每改一次，換掉連結、重寫「改了什麼」，再存成下一版。</div>') +
      '<div class="pt-bar"><button class="pt-big" data-pt="freeze">📌 存成第 ' + (ks.length + 1) + ' 版</button></div></div>';
  }
  function stepCheck(v) {
    var p = T.proto, h = '<div class="pt-h">' + esc(P.stepName(3)) + '</div>' + P.CHK.map(function (c) { return '<label class="ck pt-ck"><input type="checkbox" data-pt="chk" data-k="' + c.k + '"' + (p.chk[c.k] ? ' checked' : '') + '> ' + esc(c.q) + '</label>'; }).join('');
    if (v.heur) {
      var picked = p.heur ? p.heur.split(',') : [];
      h += '<div class="pt-note">再挑 ' + (v.heur >= 10 ? '至少一項到多項' : v.heur + ' 項') + '看看這一版有沒有顧到：</div><div class="pt-heur">' + P.HEUR.map(function (x) { return '<button class="pt-h1' + (picked.indexOf(x.k) >= 0 ? ' on' : '') + '" data-pt="heur" data-k="' + x.k + '">' + esc(x.k + ' ' + x.n) + '</button>'; }).join('') + '</div>';
    }
    var miss = P.missing(p, v.lv);
    h += '<div class="pt-miss ' + (miss.length ? 'bad' : 'ok') + '">' + (miss.length ? '還差：' + miss.map(esc).join('；') : '✓ 這一版的紀錄完整了。到上面「為什麼選它」補一句，再送審。') + '</div>';
    h += achBar(v.lv) + '<div class="pt-bar"><button class="pt-big" data-pt="save">💾 記下目前這一版</button></div>';
    return h;
  }
  /* 送審時帶上原型紀錄（沒有任何連結與版本就不帶，避免送出空殼） */
  UI.snap = function () {
    var p = P.normProto(T.proto); if (!P.verKeys(p).length && !Object.keys(p.links).length && !p.chg) return null;
    return P.protoForWrite(p, Date.now(), lvNow());
  };
  UI.iterGap = function () {
    var lv = lvNow(), need = P.iterReq(lv), have = P.verKeys(T.proto).length;
    return need && have < need ? ('還不能送審：' + P.view(lv).name + '模式要先在「③ 做原型」存到至少 ' + need + ' 版（現在 ' + have + ' 版）。') : '';
  };
  UI.render = function () {
    var el = $('secProto'), s = S(); if (!el || !s || !s.loaded) return;
    watch();
    if (isEditing()) return;
    var lv = lvNow(), v = P.view(lv); if (T.lv !== lv) { T.lv = lv; T.step = 0; T.text = null; }
    if (v.lv === 1 && T.tool !== 'dsg' && T.tool !== 'ais') T.tool = 'dsg';
    ensureCards(v);
    var head = '<h2>③ 做成能測的原型</h2><div class="muted">用你前面對準的訪談與線索，產生指令，貼到 Claude／Figma／Google AI Studio 做出來，再把結果貼回這裡檢查。全部用練習資料。' +
      ' <a href="https://claude.ai/code/artifact/a21e7a8b-aefe-4383-a745-0f764a91a1f5#' + partKey() + '" target="_blank" rel="noopener">學習單有完整流程</a>　<a href="https://scatjay.github.io/wenhua-designjam-site/hh_open.html" target="_blank" rel="noopener">開了樣板檔案先回報</a></div>' + (partModes() ? modeBar(lv) : '<div class="pt-note">這一份全班同一套，不分新手、中級、專家；從下一個有模式的那一份才會選。</div>') + preBox();
    var body;
    if (v.oneStep) {
      var steps = [stepPick, stepCopy, stepBack, stepCheck];
      body = '<div class="pt-prog">第 ' + (T.step + 1) + ' 步／共 4 步</div>' + steps[T.step](v) +
        '<div class="pt-bar pt-nav">' + (T.step > 0 ? '<button class="pt-big g" data-pt="prev">← 上一步</button>' : '') + (T.step < 3 ? '<button class="pt-big" data-pt="next">下一步 →</button>' : '') + '</div>';
    } else {
      body = [stepPick, stepCopy, stepBack, stepCheck].map(function (f) { return '<div class="pt-blk">' + f(v) + '</div>'; }).join('');
    }
    el.innerHTML = head + body + coachHtml(lv);
    applyFocus(lv);
  };

  /* ———— 新手：整頁一次只看一步（簡潔）。中級、專家維持全部展開 ———— */
  var FOCUS = [['secDir', '選方向', 'dir'], ['secRows', '對準表', 'rows'], ['secProto', '做原型', 'proto'], ['secReal', '現實題', 'real'], ['secExport', '送審', 'export']];
  function firstUndone() {
    var s = S(), st = s.st || {}, n = P.verKeys(T.proto).length;
    if (!st.dirOk) return 0; if ((st.rowsFilled || 0) < 3) return 1; if (!n) return 2; if ((st.realDone || 0) < 3) return 3; return 4;
  }
  function applyFocus(lv) {
    var bar = $('lvBar');
    if (!bar) { var top = $('top'); if (!top) return; bar = document.createElement('div'); bar.id = 'lvBar'; top.appendChild(bar); }
    bar.hidden = !partModes();   /* 兩個 1/3 全班同一套，不選模式；2/3、3/3 才出現（母線 11-09 決定） */
    bar.innerHTML = '<span class="pt-lbl">模式</span>' + modeBar(lv);
    document.body.classList.toggle('lv1', lv === 1); document.body.classList.toggle('lv2', lv === 2); document.body.classList.toggle('lv3', lv === 3);
    var nav = $('lvNav'), main = $('main'); if (!main) return;
    if (!nav) { nav = document.createElement('div'); nav.id = 'lvNav'; main.parentNode.insertBefore(nav, main.nextSibling); }
    if (lv !== 1) { FOCUS.forEach(function (f) { var e = $(f[0]); if (e) e.hidden = false; }); nav.innerHTML = ''; nav.hidden = true; return; }
    if (T.nf == null) T.nf = firstUndone();
    FOCUS.forEach(function (f, i) { var e = $(f[0]); if (e) e.hidden = (i !== T.nf); });
    nav.hidden = false;
    nav.innerHTML = '<div class="pt-prog">第 ' + (T.nf + 1) + ' 步／共 ' + FOCUS.length + ' 步：' + esc(FOCUS[T.nf][1]) + '　<small>（做完這一步再按下一步，不用一次看全部）</small></div>' +
      '<div class="pt-bar">' + (T.nf > 0 ? '<button class="pt-big g" data-pt="fprev">← 上一步</button>' : '') + (T.nf < FOCUS.length - 1 ? '<button class="pt-big" data-pt="fnext">下一步 →</button>' : '') + '<button class="pt-big g" data-pt="fall">看全部</button></div>';
  }

  /* ———— 事件 ———— */
  function cur() { var s = S(); return s ? s.store : null; }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('#secProto [data-pt],#lvBar [data-pt],#lvNav [data-pt]'); if (!b || b.tagName === 'INPUT' || b.tagName === 'TEXTAREA') return;
    var a = b.dataset.pt, s = S(); if (!s) return;
    if (a === 'fprev' || a === 'fnext') { T.nf = Math.max(0, Math.min(FOCUS.length - 1, (T.nf == null ? 0 : T.nf) + (a === 'fnext' ? 1 : -1))); UI.render(); window.scrollTo(0, 0); return; }
    if (a === 'fall') { U && s.sid && U.writeLocal(window.localStorage, s.sid, 2, Date.now()); T.lv = 0; T.nf = null; UI.render(); return; }
    if (a === 'mode') { var sid = s.sid; if (U && sid) U.writeLocal(window.localStorage, sid, Number(b.dataset.v), Date.now()); T.lv = 0; T.nf = null; UI.render(); }
    else if (a === 'part') { T.part = Math.max(1, Math.min(P.PARTS.length, Number(b.dataset.n) || 1)); var gl = P.listFor(T.part, lvNow()); T.cards = gl.length ? [gl[0].id] : []; if (gl.length) T.tool = gl[0].t; T.text = null; UI.render(); coachSave(); }
    else if (a === 'start') { T.start = b.dataset.k; if (T.start === 'gen') { T.tool = 'dsg'; T.cards = [P.view(lvNow()).startCard]; T.text = null; } UI.render(); }
    else if (a === 'goback') { T.step = 2; UI.render(); }
    else if (a === 'tool') { T.tool = b.dataset.k; T.cards = []; T.text = null; UI.render(); }
    else if (a === 'next') { T.step = Math.min(3, T.step + 1); UI.render(); window.scrollTo && $('secProto').scrollIntoView({ block: 'start' }); }
    else if (a === 'prev') { T.step = Math.max(0, T.step - 1); UI.render(); }
    else if (a === 'copy') {
      var t = $('ptText') ? $('ptText').value : genText().text;
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(function () { toastMsg('已複製，到工具裡貼上'); }, function () { $('ptText').select(); toastMsg('請手動複製選取的文字'); });
      else { $('ptText').select(); toastMsg('請手動複製選取的文字'); }
    }
    else if (a === 'reset') { T.text = null; UI.render(); }
    else if (a === 'heur') {
      var k = b.dataset.k, list = T.proto.heur ? T.proto.heur.split(',').filter(Boolean) : [], i = list.indexOf(k);
      if (i >= 0) list.splice(i, 1); else list.push(k); T.proto.heur = list.join(','); UI.render(); save('已記下');
    }
    else if (a === 'save') {
      T.proto.cards = T.cards.join(','); T.proto.at = Date.now();
      if (lvNow() === 1 && !P.verKeys(T.proto).length) { var f1 = P.freeze(T.proto, T.proto.at); if (f1.ok) T.proto.vers = f1.proto.vers; }   /* 新手不用迭代，但第一版要有，才能拿「第一版原型」 */
      save(); UI.render();
    }
    else if (a === 'freeze') {
      T.proto.cards = T.cards.join(',');
      var f = P.freeze(T.proto, Date.now()); if (!f.ok) { toastMsg(f.reason); return; }
      T.proto = f.proto; T.text = null; save('已存成第 ' + f.n + ' 版'); UI.render();
    }
  });
  document.addEventListener('change', function (e) {
    var el = e.target; if (!el.closest || !el.closest('#secProto') || !el.dataset.pt) return;
    var a = el.dataset.pt, p = T.proto;
    if (a === 'card') {
      var v = P.view(lvNow()), id = el.dataset.id, i = T.cards.indexOf(id);
      var cd = P.cardById(id); if (cd && cd.t !== T.tool) { T.tool = cd.t; T.cards = []; }
      if (v.pickCards === 1) T.cards = [id]; else if (el.checked) { if (T.cards.length < v.pickCards) T.cards.push(id); } else if (i >= 0) T.cards.splice(i, 1);
      T.text = null; UI.render();
    }
    else if (a === 'row') {
      var n = Number(el.dataset.n), cur2 = rowNs().slice(), j = cur2.indexOf(n);
      if (el.checked) { if (cur2.length < 3) cur2.push(n); } else if (j >= 0) cur2.splice(j, 1);
      T.rowNs = cur2; T.text = null; UI.render();
    }
    else if (a === 'chk') { p.chk[el.dataset.k] = el.checked; save('已記下'); UI.render(); }
    else if (a === 'url' || a === 'note') {
      var lk = p.links[T.tool] || (p.links[T.tool] = { url: '', note: '', at: 0 }); lk[a] = el.value.trim(); lk.at = Date.now();
      if (a === 'url' && lk.url && !P.isHttps(lk.url)) toastMsg('連結要 https 開頭，而且不能有空白');
    }
    else if (a === 'chg') { p.chg = el.value; }
  });
  document.addEventListener('input', function (e) {
    var el = e.target; if (!el || !el.dataset || !el.closest || !el.closest('#secProto')) return; var a = el.dataset.pt, p = T.proto;
    if (a === 'text') T.text = el.value;
    else if (a === 'url' || a === 'note') { var lk = p.links[T.tool] || (p.links[T.tool] = { url: '', note: '', at: 0 }); lk[a] = el.value.trim(); lk.at = Date.now(); }
    else if (a === 'chg') p.chg = el.value;
  });
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('#figaiBox [data-fg]'); if (!b || !window.FigAIUI || !T.panel) return;
    var d = { a: b.dataset.fg, n: b.dataset.n, k: b.dataset.k }, r = window.FigAIUI.act(T.panel, d, Date.now());
    if (d.a === 'copy') { var txt = (T.panel.S.f[d.k] || ''); if (r && r.ok && navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(function () { toastMsg('已複製，到工具裡貼上'); }, function () { toastMsg('請手動複製欄位裡的文字'); }); else toastMsg(r && r.ok ? '請手動複製欄位裡的文字' : '先確認這段指令才能複製'); return; }
    coachSave(); UI.render();
  });
  document.addEventListener('input', function (e) { var el = e.target; if (el && el.dataset && el.dataset.ff && window.FigAIUI && T.panel && el.closest('#figaiBox') && el.type !== 'checkbox' && el.tagName !== 'SELECT') window.FigAIUI.setField(T.panel, el.dataset.ff, el.value, Date.now()); });
  document.addEventListener('change', function (e) {
    var el = e.target; if (!el || !el.dataset || !el.dataset.ff || !window.FigAIUI || !T.panel || !el.closest('#figaiBox')) return;
    window.FigAIUI.setField(T.panel, el.dataset.ff, el.type === 'checkbox' ? el.checked : el.value, Date.now()); coachSave(); UI.render();
  });
  window.addEventListener('pagehide', function () { coachSave(); });
  /* 停留過久：每 30 秒看一次，沒動作超過 N 分鐘就主動冒圖；學生正在打字（焦點在欄位）時不打斷 */
  setInterval(function () { var FG = window.FigAIUI; if (FG && T.panel && !isEditing() && FG.tick(T.panel, Date.now())) { coachSave(); UI.render(); } }, 30000);
})();
