/* 提案室的畫面與啟動（瀏覽器端）。純邏輯在 proposal_core.js、資料存取在 proposal_store.js、助手在 proposal_coach.js。
   網址：proposal.html[?local=1&sid=學號（只有本機模式）]
   只讀急診室既有節點（er/{場次}/rooms、scenes、sbx/{場次}/sb 的本人故事板），只寫新節點 prx/{場次}/…。
   案例：提案按案例分開存、證據與故事板格只取同案例的房間。網址 ?case=sms（預設）；bike、trash 只預留代碼與資料結構，還沒上線，畫面一律當 sms。
   不用 alert／confirm／prompt：提示一律是頁內 toast，確認一律是兩段式按鈕。 */
(function () {
  'use strict';
  var WK = window.ERG_WEEKLY, UN = window.ERG_UNITS;   /* 每週送審（proposal_weekly.js、proposal_units.js）；沒載入就退回舊的送審畫面 */
  try { if (WK) WK.ensureStyle(document); } catch (e) { /* 樣式注入失敗不影響功能 */ }
  var PX = window.ERG_PX, SB = window.ERG_SB, ST = window.ERG_SB_STORE, XS = window.ERG_PX_STORE, PXC = window.ERG_PX_COACH, CT = window.ERG_CASE_TONE;
  var $ = function (id) { return document.getElementById(id); };
  var esc = SB.esc, clip = SB.clip, tr = PX.tr;
  var Q = new URLSearchParams(location.search);
  var LOCAL = Q.get('local') === '1' || !window.firebase || !window.ERG_FB || !window.ERG_REMOTE;
  var UNIT_SESS = 'ER-20261013';
  function sess() { var ts = (location.search.match(/[?&]tsess=([A-Za-z0-9]{1,12})/) || [])[1]; return (ts && /^(127\.0\.0\.1|localhost)$/.test(location.hostname)) ? 'ER-TEST-' + ts : UNIT_SESS; }
  var NOW = function () { return Date.now(); };
  var CASE = PX.caseForPage(Q.get('case'), LOCAL || /^ER-TEST/.test(sess()));   /* 這一頁正在寫的提案屬於哪個案例；一般只開已上線的，測試模式（?local=1 或本機 tsess 測試場次）可開還沒上線的案例走一遍 */
  var CARDS_MODE = CASE !== PX.DEFAULT_CASE;   /* 非 sms 案例：證據是學生自己填的訪談卡，沒有急診室房間與故事板 */
  var MOBILE_UA = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  var ASK_ORDER = ['patient', 'family', 'triage_nurse', 'nurse', 'clerk', 'doctor', 'volunteer', 'superintendent'];

  var S = { caseId: CASE, sid: '', sess: '', DB: null, store: null, sbStore: null, doc: PX.emptyDoc(), rooms: [], evidence: [], evMap: {}, cells: [], cellMap: {}, boardW: {}, boards: {}, cards: [], cardDraft: null, names: {}, st: null,
    cfg: SB.config(null), coachUsed: 0, subs: [], revs: [], dirHist: [], started: false, timers: {}, armed: {}, pendingRender: false, loaded: false, opened: false };

  window.ERG_PX_S = S;
  function toast(msg, ms) { var t = $('toast'); t.textContent = msg; t.className = 'on'; clearTimeout(toast.t); toast.t = setTimeout(function () { t.className = ''; }, ms || 3500); }
  function twoStep(btn, label, run, armText) {
    if (S.armed[label]) { clearTimeout(S.armed[label]); delete S.armed[label]; run(); return; }
    var old = btn.textContent; btn.textContent = armText || '再按一次確認'; btn.classList.add('armed');
    S.armed[label] = setTimeout(function () { delete S.armed[label]; btn.textContent = old; btn.classList.remove('armed'); }, 6000);
  }
  function gameHref(code) { return (MOBILE_UA ? 'm.html' : 'index.html') + (code ? '#room=' + code : ''); }
  /* 換案例（11-14 楊老師「做好就可以開」：五案對學生開放，從這裡切換；每個案例的提案分開存） */
  function mountCasePicker() {
    if ($('caseSel')) return;
    var testMode = LOCAL || /^ER-TEST/.test(sess());
    var list = PX.CASES.filter(function (c) { return c.live || testMode; }); if (list.length < 2) return;
    var h1 = document.querySelector('#top .line h1'); if (!h1) return;
    var sel = document.createElement('select'); sel.id = 'caseSel'; sel.setAttribute('aria-label', '換案例');
    sel.style.cssText = 'margin-left:8px;font-size:13px;border:2px solid var(--ink);border-radius:8px;padding:2px 6px;background:var(--panel);color:var(--ink)';
    list.forEach(function (c) { var o = document.createElement('option'); o.value = c.k; o.textContent = c.title; if (c.k === CASE) o.selected = true; sel.appendChild(o); });
    sel.onchange = function () { var q = new URLSearchParams(location.search); q.set('case', sel.value); logEvent('dir', 'case:' + sel.value); location.search = q.toString(); };
    h1.parentNode.insertBefore(sel, h1.nextSibling);
  }
  function logEvent(k, d) { if (S.store && S.sid) S.store.logEvent(S.sid, k, d); }

  /* ———— 啟動 ———— */
  function boot() {
    if (S.started) return; S.started = true;
    var color = (CT && CT.get('sms') || {}).ct || '#3d6fe0'; document.documentElement.style.setProperty('--ct', color);
    if (LOCAL) {
      var sid = (Q.get('sid') || '').trim(); try { if (sid) localStorage.setItem('erg:pxsid', sid); else sid = localStorage.getItem('erg:pxsid') || ''; } catch (e) {}
      S.sess = 'LOCAL'; S.DB = window.ERG_DB.makeLocalDb({ storage: window.localStorage, notify: function () { onData(); }, now: NOW, rnd: Math.random });
      S.sbStore = ST.makeStore({ root: ST.localRoot(window.localStorage, 'LOCAL'), now: NOW });
      S.store = XS.makeStore({ root: ST.localRoot(window.localStorage, 'LOCALPRX'), caseId: CASE, now: NOW });
      $('modeTag').textContent = '本機測試模式'; afterSid(sid);
      window.addEventListener('storage', function () { if (S.sid) onData(); });
      return;
    }
    S.sess = sess();
    if (!firebase.apps.length) firebase.initializeApp(window.ERG_FB);
    var fdb = firebase.database();
    S.DB = window.ERG_REMOTE.makeRemoteDb({ root: fdb.ref('er/' + S.sess), sess: S.sess, deferred: true, notify: function () { onData(); }, log: function (m) { if (/🔴/.test(m)) console.error('[remote_db]', m); }, me: function () { return S.sid || null; } });
    S.sbStore = ST.makeStore({ root: fdb.ref('sbx/' + S.sess), opsRoot: fdb.ref(), now: NOW, log: function (m) { console.warn('[sb]', m); } });
    S.store = XS.makeStore({ root: fdb.ref('prx/' + S.sess), caseId: CASE, now: NOW, log: function (m) { console.warn('[prx]', m); } });
    firebase.auth().onAuthStateChanged(function (user) {
      if (!user) { showGate('請先從急診室登入，再回來開提案室。'); return; }
      fdb.ref('er/users/' + user.uid).once('value', function (s) { var rec = s.val(); if (rec && rec.sid) afterSid(String(rec.sid)); else showGate('這個帳號還沒綁定學號，請先到急診室完成登入。'); });
    });
  }
  function showGate(msg) {
    $('app').hidden = true; $('gate').hidden = false;
    $('gate').innerHTML = '<div class="card"><h1>還不能開提案室</h1><p>' + esc(msg) + '</p><p><a class="btn" id="gateLobby" href="' + esc(gameHref()) + '">🏠 回急診室</a></p></div>';
  }
  function afterSid(sid) {
    if (!sid) { showGate('請先從急診室登入，再回來開提案室。'); return; }
    S.sid = sid; try { S.DB.attach && S.DB.attach(); } catch (e) {}
    $('gate').hidden = true; $('app').hidden = false;
    $('sidLine').textContent = '學號 ' + sid; bindStatic();
    mountCasePicker();
    if (CARDS_MODE) {
      var mt = document.querySelector('#top .line .muted'); if (mt) mt.textContent = PX.caseTitle(CASE) + '・提案室'; if ($('sbLink')) $('sbLink').hidden = true; if ($('reviseLink')) $('reviseLink').hidden = true;
      var rm = document.querySelector('#secRows > .muted'); if (rm) rm.textContent = '每一列要回答：我決定什麼、依據是我哪一張訪談卡、對應哪位人物、跟哪個畫面有關、誰可能不同意、我取捨了什麼。依據找不到的列會標「指不回訪談」，到上面「我的訪談卡」再記一張就好。';
      S.store.watchCards(sid, function (c) { S.cards = c; rebuild(); renderCards(); });
    }
    S.store.watchDoc(sid, function (d) {
      if (S.loaded && sig(d) === sig(S.doc)) return;
      S.doc = d; var first = !S.loaded; S.loaded = true; if (first && !S.opened) { S.opened = true; logEvent('open', MOBILE_UA ? 'm' : 'pc'); }
      if (document.activeElement && /^(TEXTAREA|INPUT)$/.test(document.activeElement.tagName) && $('main').contains(document.activeElement)) { S.pendingRender = true; refreshLive(); return; }
      renderAll();
    });
    S.store.watchDirHist(sid, function (h) { S.dirHist = h; renderDir(); });
    S.store.watchSubs(sid, function (l) { S.subs = l; renderExport(); refreshLive(); });
    S.store.watchRev(sid, function (l) { S.revs = l; renderExport(); refreshLive(); });
    S.sbStore.watchConfig(function (c) { S.cfg = c; if (PXC.render) PXC.render(); });
    S.store.watchCoachUsed(sid, function (n) { S.coachUsed = n; if (PXC.render) PXC.render(); });
    PXC.mount({ S: S, store: S.store, sbStore: S.sbStore, local: LOCAL, toast: toast, getDoc: function () { return S.doc; }, evidence: function () { return S.evidence; },
      roomCodes: function () { return S.rooms.map(function (r) { return r.code; }); }, logEvent: logEvent, applyFill: applyFill });
    onData();
  }

  /* ———— 讀本人的紀錄（只讀） ———— */
  function pnameMap() {
    var o = {}; S.rooms.forEach(function (rm) { rm.interviews.forEach(function (r) { var id = r.personaId; if (!id || o[id]) return; try { var P = window.ERG_PERSONAS; var p = P && P.byId && P.byId(id); if (p && p.name) o[id] = p.name; } catch (e) {} }); });
    return o;
  }
  function onData() {
    if (!S.sid) return; var rooms = [], list = [];
    try { list = S.DB.listRooms(S.sess); } catch (e) { list = []; }
    list.forEach(function (r) {
      var room = null; try { room = S.DB.getRoom(r.code); } catch (e) { return; }
      if (!room || room._stub || !room.members || !room.members[S.sid]) return;
      if ((String(room.case || '') || PX.DEFAULT_CASE) !== CASE) return;   /* 別的案例的房間：證據、故事板格都不算這份提案的 */
      var scene = []; try { scene = S.DB.getScene ? S.DB.getScene(r.code) : []; } catch (e) {}
      rooms.push(PX.roomInput(room, scene, S.sid));
      if (!S.boardW[r.code]) { S.boardW[r.code] = 1; S.sbStore.watchBoard(r.code, 'u_' + S.sid, function (b) { S.boards[r.code] = b.cells; rebuild(); }); }
    });
    S.rooms = rooms; rebuild();
  }
  var rebuildT = null;
  function rebuild() {
    clearTimeout(rebuildT); rebuildT = setTimeout(function () {
      S.names = pnameMap(); S.evidence = CARDS_MODE ? PX.cardEvidence(S.cards, CASE) : PX.buildEvidence(S.rooms, { names: S.names }); S.evMap = PX.evMap(S.evidence);
      S.cells = CARDS_MODE ? PX.cardCells(S.cards, CASE) : PX.buildCells(S.rooms.map(function (r) { return { code: r.code, cells: S.boards[r.code] || [] }; }).filter(function (b) { return b.cells.length; }));
      S.cellMap = {}; S.cells.forEach(function (c) { S.cellMap[c.id] = c; });
      if (S.loaded) { if (document.activeElement && /^(TEXTAREA|INPUT)$/.test(document.activeElement.tagName) && $('main').contains(document.activeElement)) { S.pendingRender = true; refreshLive(); } else renderAll(); }
    }, 30);
  }
  function sig(d) { var o = JSON.parse(JSON.stringify(d)); delete o.updatedAt; if (o.dir) delete o.dir.at; (o.rows || []).forEach(function (r) { delete r.t; }); return JSON.stringify(o); }
  function compute() { S.st = PX.status(S.doc, S.evidence, S.cells, CASE); return S.st; }
  function todayKey() { return PX.dayKey(NOW()); }
  function submittedToday() { var k = todayKey(); return S.subs.some(function (x) { return x.day === k; }); }
  function lastRev() { return S.revs.length ? S.revs[S.revs.length - 1] : null; }

  /* ———— 儲存（輸入時延遲存、離開欄位立刻存） ———— */
  function later(key, fn, ms) { clearTimeout(S.timers[key]); S.timers[key] = setTimeout(function () { delete S.timers[key]; fn(); }, ms == null ? 900 : ms); }
  S.flushers = {};
  function saveSoon(key, fn) { S.flushers[key] = function () { delete S.flushers[key]; fn(); }; later(key, function () { var f = S.flushers[key]; if (f) f(); }); }
  function flushKey(key) { if (S.timers[key]) { clearTimeout(S.timers[key]); delete S.timers[key]; } var f = S.flushers[key]; if (f) f(); }
  function saved() { $('saved').textContent = '已自動儲存 ' + new Date().toTimeString().slice(0, 5); }
  function failSave(e) { toast('存不進去：' + (e && e.message)); }
  function saveRow(n) { var r = PX.rowByN(S.doc, n); if (!r) return Promise.resolve(); return S.store.saveRow(S.sid, r).then(saved, failSave); }
  function saveDir(why) {
    var d = S.doc.dir; return S.store.saveDir(S.sid, d).then(function (rec) { saved(); return S.store.pushDirHist(S.sid, rec); }, failSave).then(function () { logEvent('dir', d.pick + (why ? ':' + why : '')); });
  }

  /* ———— 畫面 ———— */
  function renderAll() { S.pendingRender = false; if (!S.sid || !S.loaded) return; compute(); renderTop(); renderCards(); renderDir(); renderRows(); renderReal(); renderExport(); if (window.ERG_PROTO_UI) { try { window.ERG_PROTO_UI.render(); } catch (e) { console.warn('[proto]', e); } } }
  function progressChips(st) {
    function chip(ok, t) { return '<span class="pchip ' + (ok ? 'ok' : 'bad') + '">' + (ok ? '✓ ' : '✗ ') + esc(t) + '</span>'; }
    return chip(st.dirOk, '方向') + chip(st.rowsDone >= PX.LIMITS.minRows, '對準表 ' + st.rowsDone + '／' + PX.LIMITS.minRows) + chip(st.gaps.length === 0 && st.rowsFilled > 0, st.gaps.length ? '指不回訪談 ' + st.gaps.length + ' 列' : '都有依據') + chip(st.realDone === 3, '現實題 ' + st.realDone + '／3');
  }
  function renderTop() {
    var st = S.st || compute(), ns = PX.nextStep(S.doc, S.evidence, S.cells, st, { lastRev: lastRev(), submittedToday: submittedToday(), caseId: CASE }), act = '';
    /* 每週送審（11-09 20:48 改節奏）：W10–W14 各份只交 flipclass，頂列「下一步」只講這一份交到 flipclass、最後版本到 W15 再來送審；只有最後版本（AI Studio 3/3）才講送審。
       最後版本沿用原本的下一步（要整套對準表）。 */
    try {
      var wv = weeklyView();
      if (wv && !wv.isFinal) {
        ns = wv.gate.ok ? { text: '「' + wv.unit.name + '」要交的東西都齊了。這一份交到 flipclass 就好；最後版本在 W15 再來送審。', go: 'export' }
          : { text: '「' + wv.unit.name + '」還差一步：' + wv.gate.why + '（這一份交到 flipclass 就好；最後版本在 W15 再來送審。）', go: 'proto' };
      }
    } catch (e) {}
    if (ns.go === 'game') act = '<a class="btn mini" href="' + esc(gameHref(latestRoom())) + '">🩺 回急診室</a>';
    else if (ns.go === 'row' && ns.row) act = '<button class="mini" data-goto="row-' + ns.row + '">帶我去第 ' + ns.row + ' 列</button>';
    else if (ns.go) act = '<button class="mini" data-goto="' + ns.go + '">帶我去</button>';
    $('nextLine').innerHTML = '<span class="nl">下一步</span> ' + esc(ns.text) + ' ' + act;
    $('progress').innerHTML = progressChips(st);
    var sb = latestBoardRoom(); $('sbLink').href = sb ? 'storyboard.html?room=' + sb + '&board=me' : 'storyboard.html'; $('reviseLink').href = gameHref(latestRoom());
    $('lobbyLink').href = gameHref();
    if ($('wallLink')) $('wallLink').href = 'wall.html?case=' + CASE + (LOCAL ? '&local=1&sid=' + encodeURIComponent(S.sid) : '');
  }
  function latestRoom() { var withIv = S.rooms.filter(function (r) { return r.interviews.length; }); return (withIv[withIv.length - 1] || S.rooms[S.rooms.length - 1] || {}).code || ''; }
  function latestBoardRoom() { var c = Object.keys(S.boards).filter(function (k) { return (S.boards[k] || []).length; }); return c.length ? c[c.length - 1] : latestRoom(); }
  function refreshLive() { if (!S.sid || !S.loaded) return; compute(); renderTop(); S.doc.rows.forEach(function (r) { var el = document.querySelector('.rstat[data-n="' + r.n + '"]'); if (el) el.innerHTML = rowStat(r); }); var ex = $('exProblems'); if (ex) ex.innerHTML = problemList(); later('wkr', refreshWeekly, 350); }

  /* 1 方向 */
  function renderDir() {
    if (!S.loaded || !$('secDir')) return; var d = S.doc.dir, h = S.dirHist || [];
    var focus = document.activeElement && document.activeElement.closest && document.activeElement.closest('#secDir') ? document.activeElement : null; if (focus && /^(TEXTAREA|INPUT)$/.test(focus.tagName)) return;
    $('secDir').innerHTML = '<h2>① ' + (CARDS_MODE ? '我的方向' : '我選的方向') + '</h2><div class="muted">' + (CARDS_MODE ? '用一句話寫出你這一份想改什麼、改給誰，再寫一句為什麼；之後想法變了可以改，改的歷程會留著。' : '三個方向都可以，沒有唯一解。要看經費，也要看你對關係人的判斷。也可以修改其中一個，或提出你自己的方向（選「我自己的方向」再寫一句話）。選好再寫一句為什麼；之後想法變了可以改，改的歷程會留著。') + '</div>' +
      (CARDS_MODE ? '' : '<div class="dirs">' + PX.dirsFor(CASE).map(function (x) { return '<button class="dirbtn' + (d.pick === x.k ? ' on' : '') + '" data-act="pickdir" data-k="' + x.k + '"><b>' + esc(x.name) + '</b><span>' + esc(x.desc) + '</span></button>'; }).join('') + '</div>') +
      (d.pick === 'mine' || CARDS_MODE ? '<label>' + (CARDS_MODE ? '我的方向是什麼（一句話，≤' : '我的方向是什麼（一句話，可以是修改上面三個，也可以是你自己想的，≤') + PX.LIMITS.mine + ' 字）<input id="dirMine" data-sec="dir" data-f="mine" maxlength="' + PX.LIMITS.mine + '" value="' + esc(d.mine) + '"></label>' : '') +
      '<label>為什麼選它（≤' + PX.LIMITS.why + ' 字）<textarea id="dirWhy" data-sec="dir" data-f="why" maxlength="' + PX.LIMITS.why + '" placeholder="例如：我訪談的家屬都說連結點不開，所以…">' + esc(d.why) + '</textarea></label>' +
      '<div class="cnt" id="dirCnt">' + Array.from(d.why).length + '／' + PX.LIMITS.why + '</div>' +
      '<div class="bar"><button class="mini" data-coach="hint" data-target="dir">🤖 提示</button><button class="mini" data-coach="check" data-target="dir">🤖 檢查</button><button class="mini" data-coach="pattern" data-target="dir">🤖 句型</button></div>' +
      (h.length > 1 ? '<details class="hist"><summary>方向改過 ' + (h.length - 1) + ' 次（歷程）</summary>' + h.slice(-5).reverse().map(function (x) {
        var nm = (PX.dirsFor(CASE).filter(function (y) { return y.k === x.pick; })[0] || {}).name || x.pick; return '<div class="hrow">' + esc(new Date(x.at).toLocaleString('zh-TW', { hour12: false })) + '　<b>' + esc(x.pick === 'mine' ? '我自己的方向：' + (x.mine || '') : nm) + '</b>　' + esc(clip(x.why, 40)) + '</div>'; }).join('') + '</details>' : '');
  }

  /* 2 對準表 */
  function evChip(id) {
    var e = S.evMap[id];
    if (!e) return '<span class="chip lost" data-id="' + esc(id) + '">⚠ 找不到這則依據 <button class="x" data-act="rmev" data-id="' + esc(id) + '" aria-label="移除">✕</button></span>';
    var cn = (CT && CT.get(e.caseId)) || {}; var pre = cn.letter ? '<i class="cl" style="background:' + cn.ct + ';color:' + (cn.on || '#fff') + '">' + esc(cn.letter) + '</i>' : '';
    return '<div class="evc"><span class="chip"><span class="ct">' + pre + '<b>' + esc(e.label) + '</b>：' + esc(clip(e.text, PX.LIMITS.textShow)) + '</span><button class="x" data-act="rmev" data-id="' + esc(id) + '" aria-label="移除這則依據">✕</button></span><div class="src">出處：' + esc(e.src) + '</div></div>';
  }
  function evOptions(r) {
    var chosen = {}; r.ev.forEach(function (x) { chosen[x] = 1; });
    var groups = CARDS_MODE ? [['ec', '我的訪談卡']] : [['iv', '訪談卡'], ['mk', '線索與我記的卡片'], ['cc', '我的結論']], html = '<option value="">＋ 選一則依據…</option>';
    groups.forEach(function (g) {
      var items = S.evidence.filter(function (e) { return e.kind === g[0] && !chosen[e.id]; }); if (!items.length) return;
      html += '<optgroup label="' + esc(g[1]) + '">' + items.map(function (e) { return '<option value="' + esc(e.id) + '">' + esc(e.kind === 'ec' ? '「' + e.who + '」' + clip(e.text, 36) : (e.who ? e.who + '・' : '') + e.label + '：' + clip(e.text, 30) + '（' + e.room + '）') + '</option>'; }).join('') + '</optgroup>';
    });
    return html;
  }
  function askTarget(r) {   /* 回去問：問誰、回哪一間房 */
    var asked = {}; S.evidence.forEach(function (e) { if (e.kind === 'iv' && e.pid) asked[e.pid] = e.room; });
    var pid = r.persona.pid, room = '', who = '';
    if (pid && asked[pid]) { room = asked[pid]; who = PX.pname(pid, S.names); }
    else { var next = ASK_ORDER.filter(function (p) { return !asked[p]; })[0]; who = next ? PX.pname(next, S.names) + '（你還沒問過）' : (pid ? PX.pname(pid, S.names) : '一位關係人'); }
    if (!room) { var c = r.cell && S.cellMap[r.cell]; room = c ? c.room : latestRoom(); }
    return { room: room, who: who };
  }
  function rowStat(r) {
    var st = S.st; if (!st) return ''; var miss = PX.rowMissing(r, st.evSet, st.cellSet), blank = PX.rowBlank(r), html = '';
    if (blank) return '<span class="pchip bad">空白列：先寫「我決定什麼」</span>';
    if (!miss.length) html = '<span class="pchip ok">✓ 這一列齊了</span>';
    else html = '<span class="pchip bad">還缺：' + miss.filter(function (c, i, a) { return !(c === 'row-ev-lost' && a.indexOf('row-ev') >= 0); }).map(function (c) { return esc(PX.ROW_FIELD_NAME[c === 'row-ev-lost' ? 'row-ev' : c]); }).filter(function (x, i, a) { return a.indexOf(x) === i; }).join('、') + '</span>';
    if (miss.indexOf('row-ev') >= 0 || miss.indexOf('row-ev-lost') >= 0) {
      if (CARDS_MODE) return html + '<div class="gap"><b>指不回訪談</b>：這個決定在你的訪談卡裡找不到依據。從上面「選一則依據」挑一張真的相關的，或到「我的訪談卡」再記一張。<button class="mini" data-goto="cards">＋ 去記一張</button></div>';
      var at = askTarget(r);
      html += '<div class="gap"><b>指不回訪談</b>：這個決定在你的訪談、線索、結論裡找不到依據。' + (miss.indexOf('row-ev-lost') >= 0 ? '（你之前選的依據已經不在紀錄裡了。）' : '') + '要嘛從上面「選一則依據」挑一則真的相關的，要嘛回去問：<a class="btn mini" data-act="askback" data-n="' + r.n + '" href="' + esc(gameHref(at.room)) + '">🩺 回去問 ' + esc(at.who) + '</a></div>';
    }
    return html;
  }
  function rowHtml(r) {
    var pers = PX.personaOptions(S.evidence, { names: S.names });
    var persOpts = '<option value="">（沒選）</option>' + pers.map(function (p) { return '<option value="' + esc(p.pid) + '"' + (r.persona.pid === p.pid ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('');
    var cellOpts = S.cells.length ? '<option value="">（沒選）</option>' + S.cells.map(function (c) { return '<option value="' + esc(c.id) + '"' + (r.cell === c.id ? ' selected' : '') + '>' + esc(c.label) + '</option>'; }).join('') : (CARDS_MODE ? '<option value="">（訪談卡還沒有寫畫面）</option>' : '<option value="">（你還沒有故事板內容）</option>');
    function ai(k) { return r.ai && r.ai[k] ? ' <span class="ai-badge">🤖 助手示範</span>' : ''; }
    var L = PX.LIMITS;
    return '<section class="rowc" id="row-' + r.n + '" data-n="' + r.n + '"><header><span class="rno">' + r.n + '</span><b>第 ' + r.n + ' 列：一個設計決定</b><span style="flex:1"></span><button class="mini" data-act="delrow" data-n="' + r.n + '">刪掉這列</button></header>' +
      '<label>我決定什麼（≤' + L.decide + ' 字）' + ai('decide') + '<textarea data-sec="row" data-n="' + r.n + '" data-f="decide" maxlength="' + L.decide + '" placeholder="例如：簡訊只放一個短連結，內容放在手機網頁上">' + esc(r.decide) + '</textarea></label>' +
      '<div class="lbl">依據哪些證據（從你自己的紀錄點選，會顯示出處）</div><div class="evs">' + (r.ev.length ? r.ev.map(evChip).join('') : '<span class="muted">還沒選依據</span>') + '</div>' +
      (r.ev.length < L.maxEv ? '<select data-act="addev" data-n="' + r.n + '" aria-label="選一則依據">' + evOptions(r) + '</select>' : '<div class="muted">最多 ' + L.maxEv + ' 則</div>') +
      '<div class="row2"><label>對應哪位人物<select data-act="persona" data-n="' + r.n + '">' + persOpts + '</select></label>' +
      '<label>' + (CARDS_MODE ? '這位人物是誰、有什麼特質（一句話，例如：常漏看數字的新手）' : '這位人物的關鍵特質（你還原人物誌時寫的一句話）') + '<input data-sec="row" data-n="' + r.n + '" data-f="personaOwn" maxlength="' + L.personaOwn + '" value="' + esc(r.persona.own) + '" placeholder="系統沒有存你的人物誌，這裡自己填一句"></label></div>' +
      '<label>' + (CARDS_MODE ? '跟哪個畫面有關' : '解決故事板哪一格') + '<select data-act="cell" data-n="' + r.n + '"' + (S.cells.length ? '' : ' disabled') + '>' + cellOpts + '</select></label>' +
      (S.cells.length ? '' : CARDS_MODE ? '<div class="muted">到上面「我的訪談卡」，在「跟哪個畫面有關」寫一個畫面名稱，這裡才選得到。</div>' : '<div class="muted">先去 <a href="storyboard.html' + (latestBoardRoom() ? '?room=' + latestBoardRoom() + '&board=me' : '') + '">排你的故事板</a>，這裡才選得到格子。</div>') +
      '<label>誰可能不同意（≤' + L.dissent + ' 字）' + ai('dissent') + '<input data-sec="row" data-n="' + r.n + '" data-f="dissent" maxlength="' + L.dissent + '" value="' + esc(r.dissent) + '" placeholder="例如：櫃台人員，因為每張單要多一個步驟"></label>' +
      '<label>我的取捨（≤' + L.tradeoff + ' 字）' + ai('tradeoff') + '<textarea data-sec="row" data-n="' + r.n + '" data-f="tradeoff" maxlength="' + L.tradeoff + '" placeholder="我選了…，放掉了…，因為…">' + esc(r.tradeoff) + '</textarea></label>' +
      '<div class="rstat" data-n="' + r.n + '">' + rowStat(r) + '</div>' +
      '<div class="bar"><button class="mini" data-coach="hint" data-target="row" data-n="' + r.n + '">🤖 提示</button><button class="mini" data-coach="check" data-target="row" data-n="' + r.n + '">🤖 檢查</button><button class="mini" data-coach="pattern" data-target="row" data-n="' + r.n + '">🤖 句型</button><button class="mini" data-coach="fill" data-target="row" data-n="' + r.n + '">🤖 代填（示範）</button></div></section>';
  }
  function renderRows() {
    if (!$('rows')) return; compute();
    var keepScroll = window.scrollY;
    $('rows').innerHTML = S.doc.rows.length ? S.doc.rows.map(rowHtml).join('') : '<p class="muted">還沒有任何一列。按下面「＋ 新增一列」，一列寫一個你決定的設計。</p>';
    $('addRow').disabled = PX.nextRowN(S.doc) === 0;
    $('rowsInfo').textContent = '至少 ' + PX.LIMITS.minRows + ' 列才算完成（目前 ' + S.st.rowsDone + ' 列齊了、' + S.st.rowsFilled + ' 列有寫決定）。最多 ' + PX.LIMITS.maxRows + ' 列。';
    window.scrollTo(0, keepScroll);
  }

  /* 3 現實題 */
  function renderReal() {
    if (!$('secReal')) return;
    var focus = document.activeElement && document.activeElement.closest && document.activeElement.closest('#secReal'); if (focus && /^(TEXTAREA|INPUT)$/.test(document.activeElement.tagName)) return;
    $('secReal').innerHTML = '<h2>③ 三個現實題</h2><div class="muted">好想法要撐得過現實。不知道也可以誠實寫「我不知道，但會去問誰」，這比亂猜好。</div>' +
      PX.REAL_KEYS.map(function (k) {
        var x = S.doc.real[k], q = PX.REAL_Q[k], ok = PX.realAnswered(x);
        return '<div class="realc"><b>' + esc(q.title) + '</b> <span class="pchip ' + (ok ? 'ok' : 'bad') + '">' + (ok ? '✓' : '還沒答') + '</span><div class="muted">' + esc(q.ask) + '</div>' +
          '<textarea data-sec="real" data-k="' + k + '" data-f="text" maxlength="' + PX.LIMITS.real + '" placeholder="你的想法（≤' + PX.LIMITS.real + ' 字）">' + esc(x.text) + '</textarea>' +
          '<label class="ck"><input type="checkbox" data-act="unknown" data-k="' + k + '"' + (x.unknown ? ' checked' : '') + '> 我不知道</label>' +
          (x.unknown ? '<label>但我會去問誰<input data-sec="real" data-k="' + k + '" data-f="askWho" maxlength="' + PX.LIMITS.askWho + '" value="' + esc(x.askWho) + '" placeholder="例如：資訊室的人、護理長"></label>' : '') +
          '<div class="bar"><button class="mini" data-coach="hint" data-target="real" data-key="' + k + '">🤖 提示</button><button class="mini" data-coach="check" data-target="real" data-key="' + k + '">🤖 檢查</button></div></div>';
      }).join('');
  }

  /* 4 交出去 */
  function problemList() {
    var al = (S.st || compute()).alignment; if (al.ok) return '<div class="ok">✓ 對準檢查全過：每一列都有依據、人物、故事板格、誰不同意和取捨，方向與現實題也都有了。</div>';
    return '<div class="muted">送審或交出去之前，還有這些地方（只列前 8 項）：</div><ul>' + al.problems.slice(0, 8).map(function (p) { return '<li>' + esc(p.msg) + '</li>'; }).join('') + '</ul>' + (al.problems.length > 8 ? '<div class="muted">…還有 ' + (al.problems.length - 8) + ' 項</div>' : '');
  }
  function revHtml(r) {
    if (!r) return '<div class="muted">還沒有審核建議。送審之後，結果會出現在這裡（不是馬上出來）。</div>';
    var al = PX.arr(r.align);
    return '<div class="revc"><b>' + esc(r.day || '') + ' 的審核建議</b> <span class="pchip ' + (r.ok ? 'ok' : 'bad') + '">' + (r.ok ? '對得起來' : '還有地方要補') + '</span>' +
      (al.length ? '<ul>' + al.map(function (p) { return '<li>' + esc(p.msg) + '</li>'; }).join('') + '</ul>' : '') + (r.fb ? '<p>' + esc(r.fb) + '</p>' : '') +
      (PX.arr(r.rows).length ? '<ul>' + PX.arr(r.rows).map(function (x) { return '<li>第 ' + esc(x.n) + ' 列：' + esc(x.note) + '</li>'; }).join('') + '</ul>' : '') +
      '<div class="muted">這是給你的建議，不是繳交；正式繳交要到 flipclass。最後怎麼改，由你決定。</div></div>';
  }
  /* ———— 每週送審：依份的自查燈、自述按鈕、閘門、審核結果 ———— */
  function PU() { return window.ERG_PROTO_UI || null; }
  function setOf(map) { var o = {}; Object.keys(map || {}).forEach(function (k) { o[k] = true; }); return o; }
  function weeklyView() {
    var pu = PU(); if (!WK || !UN || !pu || !pu.unitCtx) return null;
    var u = WK.unitNow(pu.unitCtx()), l = pu.lv(), st = S.st || compute();
    var snap = { doc: { dir: S.doc.dir, rows: S.doc.rows, real: S.doc.real, proto: pu.snap() || {} } }, sets = { evSet: setOf(S.evMap), cellSet: setOf(S.cellMap) };
    var v = WK.selfView(snap, u.id, { lv: l.lv, lvChosen: l.chosen, canSubmitOld: st.canSubmit, sets: sets });
    v.priors = UN.priorUnits(snap, u.id, l.chosen ? l.lv : 0, sets);
    v.chosen = l.chosen; return v;
  }
  function markersHtml(v) {
    var pu = PU(), h = '';
    if (v.buttons.length) {
      h += '<div class="wk-h2"><b>我做過的事（按一下就會記下來）</b></div><div class="muted">' + esc(WK.TXT.selfOnly) + '</div><div class="wk-mk">' + v.buttons.map(function (b) {
        var ok = pu.linkOk(b.kind), on = ok && WK.markState(pu.linkNote(b.kind), b);
        return '<button type="button" class="wkmk' + (on ? ' on' : '') + '" data-act="wkmark" data-k="' + b.kind + '" data-fam="' + b.fam + '" data-tok="' + esc(b.tok) + '" aria-pressed="' + (on ? 'true' : 'false') + '"' + (ok ? '' : ' disabled') + '>' + (on ? '✓ ' : '') + esc(b.label) + (on ? '（再按一次取消）' : '') + '</button>';
      }).join('') + '</div>';
    }
    if (v.trial) {
      var tk = WK.markFam(pu.linkNote(v.kind), 'trial'), tp = WK.trialParts(tk) || { sec: '', taps: '', stop: '' }, ok2 = pu.linkOk(v.kind);
      h += '<div class="wk-h2"><b>試用紀錄</b></div><div class="muted">找一個沒看過的人試用你的畫面，記下他花了幾秒、點了幾下、停在哪一句。</div>' +
        '<div class="wk-trial"><label>幾秒<input id="wkTrialSec" type="number" inputmode="numeric" min="1" max="9999" value="' + esc(tp.sec) + '"></label><label>點幾下<input id="wkTrialTaps" type="number" inputmode="numeric" min="1" max="9999" value="' + esc(tp.taps) + '"></label>' +
        '<label>停在哪一句<input id="wkTrialStop" maxlength="40" value="' + esc(tp.stop) + '" placeholder="例如：回診前一天要帶什麼"></label></div>' +
        '<div class="wk-mk"><button type="button" data-act="wktrial"' + (ok2 ? '' : ' disabled') + '>記下試用紀錄</button>' + (tk ? '<button type="button" class="ghost" data-act="wkclear">清掉試用紀錄</button>' : '') + '</div>' + (tk ? '<div class="ok">✓ 已記下：' + esc(tk) + '</div>' : '');
    }
    if ((v.buttons.length || v.trial) && !pu.linkOk(v.kind)) h += '<div class="muted">' + esc(WK.TXT.needLink) + '</div>';
    return h;
  }
  function weeklyHtml(v) {
    var u = v.unit, noLinks = v.priors.filter(function (p) { return !p.sent; });
    var h = '<div class="wk wk-box" id="wkBox"><div class="wk-h">這一週要交：' + esc(u.name) + '（' + esc(u.week) + '）' + esc(u.title) + '</div>' +
      '<div class="muted">' + esc(v.isFinal ? WK.TXT.notSubmit : WK.TXT.flipLine) + '</div><ul>' + v.deliver.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>';
    if (u.modes && !v.chosen) h += '<div class="wk-box wk-warn" id="wkModeAsk2"><b>' + esc(WK.TXT.needMode) + '</b><div class="wk-mode">' + [1, 2, 3].map(function (k) { return '<button type="button" data-pt="mode" data-v="' + k + '">' + ['新手', '中級', '專家'][k - 1] + '</button>'; }).join('') + '</div></div>';
    h += '<div class="wk-h2"><b>自己先看一眼</b>　<span class="muted">（隨時更新）</span></div>' + (v.isFinal ? '' : '<div class="muted" id="wkSelfNote">' + esc(WK.TXT.selfNote) + '</div>') + WK.lightsHtml(v.lights);
    var miss = v.missing.slice(0, 6);
    if (miss.length) h += '<div class="muted">還缺：</div><ul id="wkMissing">' + miss.map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('') + '</ul>' + (v.missing.length > 6 ? '<div class="muted">…還有 ' + (v.missing.length - 6) + ' 項</div>' : '');
    else h += '<div class="ok">✓ 這一份該有的都有了。</div>';
    h += markersHtml(v);
    if (v.isFinal && noLinks.length) h += '<div class="muted" id="wkPrior">前面的份還沒貼連結：' + noLinks.map(function (p) { return esc(WK.unitName(p.unit)); }).join('、') + '。現在送審會以本週這一份的標準來看；前面的份可以之後補。</div>';
    return h + '</div>';
  }
  function curUnitRev(v) {   /* 這一份最新的審核建議；以及這一份有沒有送審了還在等 */
    var u = v.unit, cls = PU().unitCtx().cls, mine = S.revs.filter(function (r) { return r.unit === u.id; }), rev = mine.length ? mine[mine.length - 1] : null, pend = null;
    S.subs.forEach(function (x) { if (UN.unitForSub(x.day, x.t, cls).unit.id === u.id && (!rev || Number(rev.at || 0) < x.t)) pend = x; });
    return { rev: rev, pend: pend };
  }
  function revSectionHtml(v) {
    var r = curUnitRev(v);
    return '<h3>審核建議</h3><div id="revBox">' + (r.pend ? '<div class="wk-wait" id="wkWait">' + esc(WK.TXT.waitNote) + '</div>' : '') + WK.revCardHtml(r.rev, v.unit.id) + WK.histHtml(S.revs) + '</div>';
  }
  function renderExport() {
    if (!$('secExport')) return; var st = S.st || compute(), done = submittedToday(), v = null;
    try { v = weeklyView(); } catch (e) { console.warn('[weekly]', e); }
    if (!v) {   /* 沒載入每週送審的檔案：舊畫面 */
      $('secExport').innerHTML = '<h2>④ 交出去</h2><div id="exProblems">' + problemList() + '</div>' +
        '<div class="bar"><button id="pdfBtn" data-act="pdf">另存 PDF 交 flipclass</button> <button id="dlBtn" data-act="dl">下載可列印頁（手機用）</button> <span class="muted">PDF 沒完成也能存，頁首會寫還缺什麼。</span></div>' +
        '<div class="bar"><button id="submitBtn" data-act="submit"' + (st.canSubmit && !done ? '' : ' disabled') + '>' + (done ? '今天已送審' : '送審看建議') + '</button> <span class="muted" id="submitNote">' +
        (done ? esc(PX.submitNote(S.subs, NOW()).text) : st.canSubmit ? '一天可以送一次（明天 00:00 可再送）。' : '先選方向、並寫完至少 ' + PX.LIMITS.minRows + ' 列的「我決定什麼」才能送審。') + '</span></div>' +
        '<h3>審核建議</h3><div id="revBox">' + revHtml(lastRev()) + '</div>';
      return;
    }
    var gate = v.gate, alignUnit = UN.DATA.alignGate.indexOf(v.unit.id) >= 0, fin = v.isFinal, canSend = fin && gate.ok && !done;
    var note = !fin ? WK.TXT.flipOnly : done ? PX.submitNote(S.subs, NOW()).text : gate.ok ? WK.TXT.finalSend + '一天可以送一次（明天 00:00 可再送）。' : gate.why + (gate.reasons.length > 1 ? '（還有 ' + (gate.reasons.length - 1) + ' 項）' : '');
    $('secExport').innerHTML = '<h2>④ 交出去</h2>' + weeklyHtml(v) + (alignUnit && fin ? '<div id="exProblems">' + problemList() + '</div>' : '') +
      '<div class="bar"><button id="pdfBtn" data-act="pdf">另存 PDF 交 flipclass</button> <button id="dlBtn" data-act="dl">下載可列印頁（手機用）</button> <span class="muted">PDF 沒完成也能存，頁首會寫還缺什麼。</span></div>' +
      '<div class="bar"><button id="submitBtn" data-act="submit"' + (canSend ? '' : ' disabled') + '>' + (!fin ? '這一份不用送審' : done ? '今天已送審' : '送審最後版本') + '</button> <span class="muted" id="submitNote">' + esc(note) + '</span></div>' +
      (fin ? revSectionHtml(v) : '<div id="revBox">' + WK.histHtml(S.revs) + '</div>');
  }
  /* 畫面上輸入框裡有人在打字時不重畫「④ 交出去」（試用紀錄的三個格子），免得字被洗掉 */
  function refreshWeekly() {
    if (!S.sid || !S.loaded || !$('secExport')) return;
    var a = document.activeElement; if (a && /^(TEXTAREA|INPUT)$/.test(a.tagName) && $('secExport').contains(a)) return;
    compute(); renderExport(); try { renderTop(); } catch (e) {}   /* 頂列「下一步」跟著這一份的狀態走 */
  }
  function markClick(b) {
    var pu = PU(), kind = b.dataset.k, fam = b.dataset.fam, tok = b.dataset.tok, M = WK.DATA.markers, cur = WK.markFam(pu.linkNote(kind), fam), next;
    if (fam === 'claude') next = tok === M.claude2 ? (cur === M.claude2 ? M.claude1 : M.claude2) : (cur ? '' : M.claude1);   /* 第 2 次再按一次，退回第 1 次；第 1 次再按一次，全部取消 */
    else next = cur === tok ? '' : tok;
    if (!pu.setMarker(kind, fam, next)) toast(WK.TXT.needLink); else logEvent('mark', fam + (next ? '' : '-off'));
  }
  function trialClick(clear) {
    var pu = PU(), kind = WK.kindOf(WK.unitNow(pu.unitCtx()).id);
    if (clear) { pu.setMarker(kind, 'trial', ''); return; }
    var tok = WK.trialToken($('wkTrialSec').value, $('wkTrialTaps').value, $('wkTrialStop').value);
    if (!tok) { toast('三格都要填：幾秒、點幾下、停在哪一句。'); return; }
    if (!pu.setMarker(kind, 'trial', tok)) toast(WK.TXT.needLink); else logEvent('mark', 'trial');
  }

  /* ———— 輸出 ———— */
  function printCtx() {
    var cm = {}; S.cells.forEach(function (c) { cm[c.id] = c; });
    return { sid: S.sid, caseId: CASE, date: new Date().toLocaleDateString('zh-TW'), evMap: S.evMap, cellMap: cm, personaNames: S.names, status: compute() };
  }
  function printPdf() {
    var html = PX.printHtml(S.doc, printCtx()), f = document.createElement('iframe'); f.setAttribute('aria-hidden', 'true'); f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    f.onload = function () { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { toast('這個瀏覽器不能直接列印，請改用「下載可列印頁」。'); } setTimeout(function () { if (f.parentNode) f.parentNode.removeChild(f); }, 4000); };
    document.body.appendChild(f); f.srcdoc = html; logEvent('export', 'pdf');
  }
  function download() {
    var html = PX.printHtml(S.doc, printCtx()), b = new Blob([html], { type: 'text/html;charset=utf-8' }), a = document.createElement('a'), d = new Date();
    a.href = URL.createObjectURL(b); a.download = '提案_' + S.sid + '_' + d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2) + '.html';
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500); logEvent('export', 'html');
  }
  function submit() {
    var st = compute(), wv = null; try { wv = weeklyView(); } catch (e) {}
    if (wv && !wv.isFinal) { toast(WK.TXT.flipOnly, 6000); return; }   /* 11-09 20:48：只有最後版本送審 */
    if (wv) { if (!wv.gate.ok) { toast('還不能送審：' + wv.gate.why, 6000); return; } }   /* 每週送審：依份的閘門（1/3 不要求對準表；2/3、3/3 要先選模式；3/3 看版本數） */
    else {
      if (!st.canSubmit) { toast('還不能送審：先選方向、寫完至少 ' + PX.LIMITS.minRows + ' 列的決定。'); return; }
      try { var gap = window.ERG_PROTO_UI && window.ERG_PROTO_UI.iterGap(); if (gap) { toast(gap, 6000); return; } } catch (e) {}   /* 中級、專家要先有迭代的版本 */
    }
    flushAll();
    var snap = PX.snapshotForSubmit(S.doc, S.evidence, S.cells, NOW());
    try { var pr = window.ERG_PROTO_UI && window.ERG_PROTO_UI.snap(); if (pr) snap.doc.proto = pr; } catch (e) {}   /* 11-03：原型各版本一起送審 */
    if (!snap.doc.dir || !snap.doc.dir.pick) delete snap.doc.dir;   /* 還沒選方向（Figma 1/3、AI Studio 1/3 不要求）：不帶 dir。線上規則要求 dir.pick 是 web／line／app／mine，空字串整筆會被拒 */
    attachWall(snap).then(function () { return S.store.submit(S.sid, snap); }).then(function (r) {
      if (!r.ok) { toast('今天已經送審過了（一天只能一次），明天 00:00 之後可以再送。', 5000); return; }
      logEvent('submit', r.day); toast('已送審。' + (WK ? '每晚 23:30 審一批，審好後到「④ 交出去」或回大廳就看得到。' : '審核建議出來之後會出現在「④ 交出去」。'), 6000);
      if (LOCAL) { S.subs = S.subs.concat([{ day: r.day, t: snap.t }]); renderExport(); }
    }, failSave);
  }
  /* 11-04：已加入共同提案牆的人，送審快照附牆摘要（只有數字與版本標記，沒有姓名與內文）。
     讀牆最多等 2 秒；沒代碼、讀不到、被規則拒絕、任何例外都吞掉，送審照常進行（永遠 resolve） */
  function attachWall(snap) {
    return new Promise(function (resolve) {
      var done = false, tm = null;
      function fin() { if (done) return; done = true; if (tm) clearTimeout(tm); resolve(); }
      try {
        var code = '', WS = window.ERG_WALL_STORE, W = window.ERG_WALL;
        try { code = window.localStorage.getItem('erg:wallcode:' + S.sess + ':' + S.sid) || ''; } catch (e) {}
        if (!code || !WS || !W) { fin(); return; }
        tm = setTimeout(fin, 2000);
        var root = LOCAL ? WS.localTree(window.localStorage, 'erg:walltree:LOCAL').ref('prw/LOCAL') : window.firebase.database().ref('prw/' + S.sess);
        var ws = WS.makeStore({ root: root, now: NOW });
        ws.readWall(code).then(function (w) {
          if (done) return;
          try {
            if (w) {
              var n = 1, vs = (snap.doc && snap.doc.proto && snap.doc.proto.vers) || {};
              Object.keys(vs).forEach(function (k) { var m = /^v([1-6])$/.exec(k); if (m && Number(m[1]) > n) n = Number(m[1]); });
              snap.doc.wall = W.summary(w, S.sid, 'v' + n);
            }
          } catch (e) {}
          fin();
        }, fin);
      } catch (e) { fin(); }
    });
  }
  function flushAll() { Object.keys(S.flushers).forEach(function (k) { flushKey(k); }); }

  /* ———— 改資料 ———— */
  function updateRow(n, fn, key) { var r = PX.rowByN(S.doc, n); if (!r) return null; var nr = fn(PX.copy(r)); S.doc.rows = S.doc.rows.map(function (x) { return x.n === n ? nr : x; }); if (key !== false) saveSoon('row' + n, function () { saveRow(n); }); return nr; }
  function applyFill(n, fill) {
    var r = PX.rowByN(S.doc, n); if (!r) return false;
    var nr = PX.applyFill(r, fill); PX.arr(fill && fill.refs).forEach(function (id) { if (S.evMap[id] && nr.ev.indexOf(id) < 0 && nr.ev.length < PX.LIMITS.maxEv) nr.ev.push(id); });
    S.doc.rows = S.doc.rows.map(function (x) { return x.n === n ? nr : x; }); saveRow(n); renderAll(); return true;
  }
  function bindStatic() {
    if (bindStatic.done) return; bindStatic.done = true;
    $('addRow').addEventListener('click', function () {
      var n = PX.nextRowN(S.doc); if (!n) { toast('最多 ' + PX.LIMITS.maxRows + ' 列。'); return; }
      var r = PX.emptyRow(n); S.doc.rows.push(r); S.doc.rows.sort(function (a, b) { return a.n - b.n; }); saveRow(n); logEvent('row_add', 'r' + n); renderAll();
      setTimeout(function () { var t = document.querySelector('#row-' + n + ' textarea[data-f=decide]'); if (t) { t.scrollIntoView({ block: 'center' }); t.focus(); } }, 50);
    });
    $('sbLink').addEventListener('click', function () { flushAll(); });
    bindCards();
    var main = $('main');
    main.addEventListener('input', function (e) {
      var t = e.target, sec = t.dataset && t.dataset.sec; if (!sec) return;
      if (sec === 'dir') {
        S.doc.dir[t.dataset.f] = clip(t.value, t.dataset.f === 'mine' ? PX.LIMITS.mine : PX.LIMITS.why); if (CARDS_MODE && !S.doc.dir.pick) S.doc.dir.pick = 'mine'; if ($('dirCnt') && t.dataset.f === 'why') $('dirCnt').textContent = Array.from(S.doc.dir.why).length + '／' + PX.LIMITS.why;
        saveSoon('dir', function () { saveDir('text'); });
      } else if (sec === 'row') {
        var n = Number(t.dataset.n), f = t.dataset.f;
        updateRow(n, function (r) { if (f === 'personaOwn') { r.persona.own = clip(t.value, PX.LIMITS.personaOwn); return r; } return PX.applyEdit(r, f, t.value, S.cfg.rewriteThreshold); });
      } else if (sec === 'real') {
        var k = t.dataset.k; S.doc.real[k][t.dataset.f] = clip(t.value, t.dataset.f === 'askWho' ? PX.LIMITS.askWho : PX.LIMITS.real); saveSoon('real' + k, function () { S.store.saveReal(S.sid, k, S.doc.real[k]).then(saved, failSave); });
      }
      refreshLive();
    });
    main.addEventListener('focusout', function (e) {
      var t = e.target, sec = t.dataset && t.dataset.sec; if (!sec) return;
      flushKey(sec === 'dir' ? 'dir' : sec === 'row' ? 'row' + t.dataset.n : 'real' + t.dataset.k);
      setTimeout(function () { if (S.pendingRender && !(document.activeElement && /^(TEXTAREA|INPUT)$/.test(document.activeElement.tagName))) renderAll(); }, 120);
    });
    main.addEventListener('change', function (e) {
      var t = e.target, act = t.dataset && t.dataset.act; if (!act) return; var n = Number(t.dataset.n);
      if (act === 'addev' && t.value) { var id = t.value; updateRow(n, function (r) { if (r.ev.indexOf(id) < 0 && r.ev.length < PX.LIMITS.maxEv) r.ev.push(id); return r; }, false); saveRow(n); logEvent('ev_pick', 'r' + n + ':' + id.slice(0, 2)); renderAll(); }
      else if (act === 'persona') { updateRow(n, function (r) { r.persona.pid = t.value; return r; }, false); saveRow(n); renderAll(); }
      else if (act === 'cell') { updateRow(n, function (r) { r.cell = t.value; return r; }, false); saveRow(n); renderAll(); }
      else if (act === 'unknown') { var k = t.dataset.k; S.doc.real[k].unknown = t.checked; S.store.saveReal(S.sid, k, S.doc.real[k]).then(saved, failSave); renderAll(); }
    });
    main.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-act],[data-goto]'); if (!b) return; var act = b.dataset.act, n = Number(b.dataset.n);
      if (b.dataset.goto) { goTo(b.dataset.goto); return; }
      if (act === 'pickdir') {
        var k = b.dataset.k; if (S.doc.dir.pick !== k) { S.doc.dir.pick = k; saveDir('pick'); renderAll(); }
      } else if (act === 'rmev') { var id = b.dataset.id; var row = b.closest('.rowc'); var rn = Number(row.dataset.n); updateRow(rn, function (r) { r.ev = r.ev.filter(function (x) { return x !== id; }); return r; }, false); saveRow(rn); renderAll(); }
      else if (act === 'delrow') twoStep(b, 'del' + n, function () { S.doc.rows = S.doc.rows.filter(function (r) { return r.n !== n; }); S.store.removeRow(S.sid, n).then(saved, failSave); logEvent('row_del', 'r' + n); renderAll(); }, '再按一次刪掉');
      else if (act === 'askback') { e.preventDefault(); flushAll(); logEvent('ask_back', 'r' + n); var href = b.getAttribute('href'); setTimeout(function () { location.href = href; }, 400); }
      else if (act === 'pdf') printPdf();
      else if (act === 'dl') download();
      else if (act === 'submit') twoStep(b, 'submit', submit, '再按一次送審');
      else if (act === 'wkmark') markClick(b);
      else if (act === 'wktrial') trialClick(false);
      else if (act === 'wkclear') trialClick(true);
    });
    document.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('#nextLine [data-goto]'); if (b) goTo(b.dataset.goto); });
    document.addEventListener('click', function (e) { var f = e.target.closest && e.target.closest('#coachFab'); if (f) document.body.classList.add('coach-open'); var c = e.target.closest && e.target.closest('#cClose'); if (c) document.body.classList.remove('coach-open'); });
    window.addEventListener('pagehide', flushAll);
  }

  /* 0 我的訪談卡（非 sms 案例：自己找人聊，一張卡記一句話；只有本人與老師帳號看得到） */
  function cardHtml(c) {
    var L = PX.LIMITS;
    return '<div class="ecard" data-ec-id="' + esc(c.id) + '"><label>誰（代號）<input data-ec="who" maxlength="' + L.cardWho + '" value="' + esc(c.who) + '"></label>' +
      '<label>他說了什麼<textarea data-ec="said" maxlength="' + L.cardSaid + '">' + esc(c.said) + '</textarea></label>' +
      '<label>跟哪個畫面有關（可以空著）<input data-ec="screen" maxlength="' + L.cardScreen + '" value="' + esc(c.screen) + '"></label>' +
      '<div class="bar"><button class="mini" data-ec-act="del" data-ec-id="' + esc(c.id) + '">刪掉這張</button></div></div>';
  }
  function renderCards() {
    var el = $('secCards'); if (!el) return; if (!CARDS_MODE) { el.hidden = true; return; } el.hidden = false;
    var foc = document.activeElement; if (foc && el.contains(foc) && /^(TEXTAREA|INPUT)$/.test(foc.tagName)) return;
    var L = PX.LIMITS, left = L.maxCards - S.cards.length, keep = S.cardDraft || { who: '', said: '', screen: '' };
    el.innerHTML = '<h2>⓪ 我的訪談卡</h2><div class="muted">找一個人聊聊你想改的這個東西，回來記一句他說的話。每張卡大約 1 分鐘，這一堂記 1～3 張就夠。只有你自己和老師看得到。</div>' +
      (S.cards.length ? S.cards.map(cardHtml).join('') : '<p class="muted">先去找一個人聊聊，回來記一句他說的話。</p>') +
      (left > 0 ? '<div class="ecard new"><b>新增一張</b>' +
        '<label>誰（代號就好，例如「室友 A」「常玩這類遊戲的學長」；不要寫真名、不要留聯絡方式，≤' + L.cardWho + ' 字）<input id="ecWho" maxlength="' + L.cardWho + '" value="' + esc(keep.who) + '"></label>' +
        '<label>他說了什麼（一句原話，或你聽完記下的重點，越接近他當時的說法越好，≤' + L.cardSaid + ' 字）<textarea id="ecSaid" maxlength="' + L.cardSaid + '">' + esc(keep.said) + '</textarea></label>' +
        '<label>跟哪個畫面有關（他講的事發生在哪個畫面？寫一個畫面名稱就好，可以先空著，≤' + L.cardScreen + ' 字）<input id="ecScreen" maxlength="' + L.cardScreen + '" value="' + esc(keep.screen) + '"></label>' +
        '<div class="bar"><button id="ecAdd" data-ec-act="add">＋ 記下這張</button><span class="muted">還能記 ' + left + ' 張</span></div></div>' : '<div class="muted">這個主題最多 ' + L.maxCards + ' 張卡，想再記先刪掉一張。</div>');
  }
  function saveCardNow(id) {
    var c = S.cards.filter(function (x) { return x.id === id; })[0]; if (!c) return;
    if (!tr(c.who) || !tr(c.said)) { toast('這張卡要有「誰」和「他說了什麼」才存得進去。'); return; }
    if (PX.cardHasContact(c)) { toast('卡片裡有像信箱、手機或學號的字，請拿掉再存（用代號就好）。'); return; }
    S.store.saveCard(S.sid, c).then(saved, failSave);
  }
  function bindCards() {
    var el = $('secCards'); if (!el || !CARDS_MODE) return;
    el.addEventListener('input', function (e) {
      var t = e.target, f = t.dataset && t.dataset.ec, box = t.closest && t.closest('[data-ec-id]'); if (!f || !box) return;
      var id = box.dataset.ecId, c = S.cards.filter(function (x) { return x.id === id; })[0]; if (!c) return;
      c[f] = clip(t.value, f === 'who' ? PX.LIMITS.cardWho : f === 'said' ? PX.LIMITS.cardSaid : PX.LIMITS.cardScreen);
      if (tr(c.who) && tr(c.said)) saveSoon('card' + id, function () { saveCardNow(id); });
    });
    el.addEventListener('focusout', function (e) {
      var box = e.target.closest && e.target.closest('[data-ec-id]');
      if (box && box.dataset.ecId && S.flushers['card' + box.dataset.ecId]) flushKey('card' + box.dataset.ecId);
      else if (box && e.target.dataset && e.target.dataset.ec) { var c = S.cards.filter(function (x) { return x.id === box.dataset.ecId; })[0]; if (c && (!tr(c.who) || !tr(c.said))) toast('這張卡要有「誰」和「他說了什麼」才存得進去。'); }
      var n = e.target.closest && e.target.closest('.ecard.new'); if (n) S.cardDraft = { who: ($('ecWho') || {}).value || '', said: ($('ecSaid') || {}).value || '', screen: ($('ecScreen') || {}).value || '' };
    });
    el.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-ec-act]'); if (!b) return; var act = b.dataset.ecAct;
      if (act === 'add') {
        var c = { who: tr($('ecWho').value), said: tr($('ecSaid').value), screen: tr($('ecScreen').value), t: NOW() };
        if (!c.who || !c.said) { toast('「誰」和「他說了什麼」都要寫。'); return; }
        if (PX.cardHasContact(c)) { toast('卡片裡有像信箱、手機或學號的字，請拿掉再存（用代號就好）。'); return; }
        if (S.cards.length >= PX.LIMITS.maxCards) { toast('這個主題最多 ' + PX.LIMITS.maxCards + ' 張卡。'); return; }
        b.disabled = true;
        S.store.saveCard(S.sid, c).then(function (rec) { S.cardDraft = null; saved(); toast('已記下這張訪談卡。'); }, function (er) { failSave(er); }).then(function () { b.disabled = false; });
      } else if (act === 'del') {
        var id = b.dataset.ecId; twoStep(b, 'ecdel' + id, function () { S.cards = S.cards.filter(function (x) { return x.id !== id; }); S.store.removeCard(S.sid, id).then(saved, failSave); rebuild(); renderCards(); }, '再按一次刪掉');
      }
    });
  }
  function goTo(where) {
    var id = where === 'cards' ? 'secCards' : where === 'dir' ? 'secDir' : where === 'real' ? 'secReal' : where === 'proto' ? 'secProto' : (where === 'export' || where === 'rev') ? 'secExport' : /^row-\d+$/.test(where) ? where : 'secRows';
    var el = $(id) || $('secRows'); if (el) { el.scrollIntoView({ block: 'start', behavior: 'smooth' }); var f = el.querySelector('textarea,input,select'); if (f && where !== 'export' && where !== 'rev') setTimeout(function () { f.focus({ preventScroll: true }); }, 350); }
  }

  window.ERG_PX_APP = { S: S, renderAll: renderAll, renderExport: renderExport, refreshWeekly: refreshWeekly, weeklyView: weeklyView, compute: compute, applyFill: applyFill, printCtx: printCtx, flushAll: flushAll };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
