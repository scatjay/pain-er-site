/* 故事板編輯器的畫面與啟動（瀏覽器端）。純邏輯在 sb_core.js、資料存取在 sb_store.js。
   網址：storyboard.html?room=房號[&board=me][&local=1&sid=學號（只有本機模式）]
   不用 alert／confirm／prompt：提示一律是頁內 toast，確認一律是兩段式按鈕。 */
(function () {
  'use strict';
  var SB = window.ERG_SB, ST = window.ERG_SB_STORE, CO = window.ERG_SB_COACH;
  var $ = function (id) { return document.getElementById(id); };
  var esc = SB.esc;
  var Q = new URLSearchParams(location.search);
  var LOCAL = Q.get('local') === '1' || !window.firebase || !window.ERG_FB || !window.ERG_REMOTE;
  var CODE = (Q.get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  var UNIT_SESS = 'ER-20261013';
  function sess() { var ts = (location.search.match(/[?&]tsess=([A-Za-z0-9]{1,12})/) || [])[1]; return (ts && /^(127\.0\.0\.1|localhost)$/.test(location.hostname)) ? 'ER-TEST-' + ts : UNIT_SESS; }
  var PNAMES = { patient: '病人', family: '家屬', triage_nurse: '分流護理師', nurse: '護理師', doctor: '醫師', clerk: '櫃台人員', volunteer: '志工', superintendent: '院長' };
  function pname(id) { try { var P = window.ERG_PERSONAS; if (P && P.byId) { var p = P.byId(id); if (p && p.name) return p.name; } } catch (e) {} return PNAMES[id] || id || '?'; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function hhmm(ts) { var d = new Date(ts); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }

  var S = { sid: '', code: CODE, caseId: 'sms', room: null, player: null, gate: null, boardName: Q.get('board') === 'me' ? 'me' : 'wall',
    cells: { wall: [], me: [] }, thumbs: { wall: {}, me: {} }, full: {}, quota: { userUsed: 0, siteUsed: 0, day: '' }, ops: null, mode: 'normal', baseline: null,
    added: 0, sel: 1, cfg: SB.config(null), coachUsed: 0, personas: 0, lastField: null, saved: 0, dirty: false, timers: {}, pending: {}, armed: {}, offs: [], DB: null, store: null, started: false };
  var NOW = function () { return Date.now(); };
  function bkey(name) { return name === 'me' ? ST.boardKey(S.sid) : 'wall'; }
  function cur() { return S.cells[S.boardName]; }
  function tone() { return SB.caseInfo(S.caseId); }

  function toast(msg, ms) { var t = $('toast'); t.textContent = msg; t.className = 'on'; clearTimeout(toast.t); toast.t = setTimeout(function () { t.className = ''; }, ms || 3500); }
  function twoStep(btn, label, run, armText) {   /* 兩段式確認：第一次按變「再按一次確認」，6 秒自動復原 */
    if (S.armed[label]) { clearTimeout(S.armed[label]); delete S.armed[label]; run(); return; }
    var old = btn.textContent; btn.textContent = armText || '再按一次確認'; btn.classList.add('armed');
    S.armed[label] = setTimeout(function () { delete S.armed[label]; btn.textContent = old; btn.classList.remove('armed'); }, 6000);
  }

  /* ———— 啟動 ———— */
  function boot() {
    if (S.started) return; S.started = true;
    if (LOCAL) {
      var sid = (Q.get('sid') || '').trim(); try { if (sid) localStorage.setItem('erg:sbsid', sid); else sid = localStorage.getItem('erg:sbsid') || ''; } catch (e) {}
      var db = window.ERG_DB.makeLocalDb({ storage: window.localStorage, notify: function () { loadRoom(); }, now: NOW, rnd: Math.random });
      S.DB = db; S.sess = 'LOCAL'; S.store = ST.makeStore({ root: ST.localRoot(window.localStorage, 'LOCAL'), now: NOW });
      $('modeTag').textContent = '本機測試模式'; afterSid(sid);
      window.addEventListener('storage', function () { S.store && loadRoom(); });
      return;
    }
    S.sess = sess();
    if (!firebase.apps.length) firebase.initializeApp(window.ERG_FB);
    var root = firebase.database().ref('er/' + S.sess), sroot = firebase.database().ref('sbx/' + S.sess);
    S.DB = window.ERG_REMOTE.makeRemoteDb({ root: root, sess: S.sess, deferred: true, notify: function () { loadRoom(); }, log: function (m) { if (/🔴/.test(m)) console.error('[remote_db]', m); }, me: function () { return S.sid || null; } });
    S.store = ST.makeStore({ root: sroot, opsRoot: firebase.database().ref(), now: NOW, log: function (m) { console.warn('[sb]', m); } });
    firebase.auth().onAuthStateChanged(function (user) {
      if (!user) { showGate({ ok: false, reason: 'no-sid', msg: '請先從急診室登入，再回來開故事板。' }); return; }
      firebase.database().ref('er/users/' + user.uid).once('value', function (s) { var rec = s.val(); if (rec && rec.sid) afterSid(String(rec.sid)); else showGate({ ok: false, reason: 'no-sid', msg: '這個帳號還沒綁定學號，請先到急診室完成登入。' }); });
    });
  }
  function afterSid(sid) {
    S.sid = sid; if (!sid) { showGate({ ok: false, reason: 'no-sid', msg: '請先從急診室登入，再回來開故事板。' }); return; }
    try { S.DB.attach && S.DB.attach(); } catch (e) {}
    loadRoom();
  }
  var MOBILE_UA = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  function gameHref() { return MOBILE_UA ? 'm.html' : 'index.html'; }   /* 手機的遊戲在 m.html */
  function backHref() { return gameHref() + (CODE ? '#room=' + CODE : ''); }   /* 🩺 回去訪談：回到同一間房（遊戲進大廳後讀 #room= 自動進房） */
  function lobbyHref() { return gameHref(); }   /* 🏠 回大廳 */
  function loadRoom() {
    if (!S.sid) return;
    var room = null; try { room = CODE ? S.DB.getRoom(CODE) : null; } catch (e) { room = null; }
    var player = room && room.players ? room.players[S.sid] : null;
    if (room && !S.room) { try { S.DB.watchRoom && S.DB.watchRoom(CODE); } catch (e) {} }
    var gate = SB.canEnter({ sid: S.sid, code: CODE, room: room, player: player });
    /* 線上模式房間資料要等載入：loading 不顯示成錯誤 */
    if (gate.reason === 'no-room' && CODE && !LOCAL && !(S.DB.ready && S.DB.ready())) gate = { ok: false, reason: 'loading', msg: '房間資料還在載入…', count: 0 };
    S.gate = gate;
    if (!gate.ok) { if (!S.active) showGate(gate); return; }
    S.room = room; S.player = player; S.caseId = room.case || 'sms';
    if (!S.active) enter();
    else { refreshAside(); renderAll(true); }
  }
  function showGate(g) {
    $('app').hidden = true; $('gate').hidden = false;
    var title = g.reason === 'loading' ? '載入中…' : (g.reason === 'no-interview' ? '這間還沒有訪談' : '還不能開故事板');
    $('gate').innerHTML = '<div class="card"><h1>' + esc(title) + '</h1><p>' + esc(g.msg) + '</p>' +
      (g.reason === 'loading' ? '' : '<p style="display:flex;gap:10px;flex-wrap:wrap">' + (CODE && g.reason === 'no-interview' ? '<a class="btn" id="gateRevise" href="' + esc(backHref()) + '">🩺 回去訪談（房間 ' + esc(CODE) + '）</a>' : '') + '<a class="btn" id="gateLobby" href="' + esc(lobbyHref()) + '">🏠 回大廳</a></p>') + '</div>';
  }

  function enter() {
    S.active = true; $('gate').hidden = true; $('app').hidden = false;
    var t = tone(); document.documentElement.style.setProperty('--ct', t.color);
    document.title = '故事板・' + t.name;
    $('caseBadge').innerHTML = '<span class="cl" style="background:' + t.color + '">' + esc(t.letter) + '</span>' + esc(t.icon) + ' ' + esc(t.name);
    $('roomLine').textContent = '房間 ' + CODE + '　學號 ' + S.sid;
    $('reviseLink').href = backHref(); $('lobbyLink').href = lobbyHref();
    var ids = (SB.arr(S.player.interviews).filter(SB.filled)).map(function (r) { return r.id; });
    var pers = {}; SB.arr(S.player.interviews).filter(SB.filled).forEach(function (r) { pers[r.personaId] = 1; });
    if (S.store.getAch) S.store.getAch(S.sid).then(function (ids0) { S.keepAch = ids0 || []; S.achLoaded = 1; renderSide2(); }, function () { S.keepAch = []; S.achLoaded = 1; });
    S.store.ensureBaseline(CODE, S.sid, ids, Object.keys(pers)).then(function (b) { S.baseline = b; S.baseDone = 1; renderSide(); renderAll(); }, function (e) { S.baseDone = 1; console.warn('[sb] 第一次開板的訪談快照寫不進去：', e && e.message); renderAll(); });
    var offs = S.offs;
    offs.push(S.store.watchBoard(CODE, 'wall', function (b) { S.cells.wall = b.cells; renderAll(); }));
    offs.push(S.store.watchBoard(CODE, ST.boardKey(S.sid), function (b) { S.cells.me = b.cells; renderAll(); }));
    offs.push(S.store.watchThumbs(CODE, 'wall', function (t) { S.thumbs.wall = t; renderAll(); }));
    offs.push(S.store.watchThumbs(CODE, ST.boardKey(S.sid), function (t) { S.thumbs.me = t; renderAll(); }));
    offs.push(S.store.watchOps(function (v) { var o = SB.opsState(v, NOW()); S.ops = o; S.mode = o.mode; renderTop(); renderAll(); }));
    offs.push(S.store.watchConfig(function (c) { S.cfg = c; renderTop(); renderAll(); if (CO) CO.render(); }));
    offs.push(S.store.watchCoachUsed(S.sid, function (n) { S.coachUsed = n; if (CO) CO.render(); }));
    offs.push(S.store.watchMeta(CODE, S.sid, function (m) { S.personas = Number(m.personaCount) || 0; if (CO) CO.render(); }));
    watchQuota(); setInterval(function () { if (S.quota.day && S.quota.day !== SB.dayKey(NOW())) watchQuota(); }, 30000);
    refreshAside(); bindStatic(); renderAll(true);
    if (CO) CO.mount({ S: S, SB: SB, store: S.store, local: LOCAL, code: CODE, cur: cur, cellFor: cellFor, toast: toast, twoStep: twoStep, pnames: pnames,
      commitFill: function (n, fill) { return commit(n, { aiFill: fill }).then(function () { renderAll(true); }); },
      commitCl: function (n, lv) { return commit(n, { cl: lv }).then(function () { renderAll(true); }); },
      setPersonas: function (n) { return S.store.setPersonas(CODE, S.sid, n); } });
  }
  function watchQuota() { if (S.offQ) S.offQ(); S.offQ = S.store.watchQuota(S.sid, function (q) { S.quota = q; renderTop(); renderAll(); }); }

  /* ———— 側欄：我的訪談素材、三則指令 ———— */
  function refreshAside() { renderSide(); }
  function renderSide() {
    if (!S.player) return;
    var fr = SB.fragments(SB.arr(S.player.interviews), pnames());
    var html = '<h2>素材（我的訪談）</h2>';
    if (!fr.length) html += '<p class="muted">還沒有可用的訪談內容。</p>';
    html += fr.map(function (f, i) {
      return '<div class="frag" draggable="true" data-fi="' + i + '"><span class="who">' + esc(f.name) + '</span> ' + esc(f.text) +
        (f.tags.length ? ' <span class="tg">' + esc(f.tags.join('、')) + '</span>' : '') + '<div class="src">出處 ' + esc(f.recId) + ' <button class="mini" data-fi="' + i + '" data-use="1">放進第 ' + S.sel + ' 格</button></div></div>';
    }).join('');
    $('side1').innerHTML = html; S.frags = fr;
    $('prompts').innerHTML = '<h2>三個 AI 圖片生成指令（複製後，把【　】換成自己的內容）</h2>' + SB.PROMPTS.map(function (p, i) {
      return '<div class="pr"><b>' + esc(p.name) + '</b><div class="pt">' + esc(p.text) + '</div><button class="mini" data-copy="' + i + '">複製</button></div>';
    }).join('');
  }
  function pnames() { var o = {}; SB.arr(S.player && S.player.interviews).forEach(function (r) { if (r && r.personaId) o[r.personaId] = pname(r.personaId); }); return o; }
  function copyText(t, done) {
    function fb() { var ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); var ok = false; try { ok = document.execCommand('copy'); } catch (e) {} document.body.removeChild(ta); done(ok); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(function () { done(true); }, fb); else fb();
  }

  /* ———— 頂列：額度、模式、儲存狀態 ———— */
  function qv() { return SB.quotaView({ userUsed: S.quota.userUsed, siteUsed: S.quota.siteUsed, mode: S.mode, cfg: S.cfg }); }
  /* 用起點：跟「分鏡草稿」同一套算法——把起點原文記成這格的 draft，沒改寫就算「照抄」，改寫超過兩成才算改寫（後台的自己寫比例與學生自己看到的都用這個） */
  function useStart(n, st) {
    var o = cellFor(n), what = st.scene.slice(0, SB.LIMITS.field.what);
    var next = SB.applyEdit(o.c, { what: what }, S.sid, NOW(), S.cfg);
    next.draft = { who: '', where: '', what: what, think: '' }; next.er = SB.erFor(next, S.cfg);
    var list = cur(), idx = -1; list.forEach(function (c, i) { if (c.n === next.n) idx = i; }); if (idx >= 0) list[idx] = next; else { list.push(next); list.sort(function (a, b) { return a.n - b.n; }); }
    return S.store.saveCell(CODE, bkey(S.boardName), o.virtual ? null : o.c, next).then(function () { S.saved = NOW(); renderTop(); renderAll(true); }, function (e) { toast('存不進去：' + (e && e.message)); });
  }
  /* 一開始可以用助教與起點快速建立認知；最終挑戰是「從空白開始」，六個主題各做一次 */
  function soloLine() {
    var done = (S.keepAch || []).filter(function (x) { return /^so_/.test(x); }).map(function (x) { return x.slice(3); }), order = SB.CASE_ORDER || [];
    var names = order.map(function (k) { var i = SB.caseInfo(k); return (done.indexOf(k) >= 0 ? '✓' : '·') + (i && i.name ? i.name : k); }).join('　');
    return '<div class="muted">最終挑戰「從空白開始」：' + done.length + '／' + order.length + ' 個主題完成。（' + esc(names) + '）一開始可以放心用起點和助教建立感覺，之後再試一次完全不靠它們。</div>';
  }
  /* 我的 AI 參與度（自己看）：自己寫／改寫／照抄／助教代填，各占幾成 */
  function renderMeter() {
    var el = $('aiMeter'); if (!el) return;
    var cnt = { own: 0, rewrite: 0, copy: 0, ai: 0 }, tot = 0;
    cur().forEach(function (c) { if (c.by === S.sid && c.er && SB.hasContent(c)) { cnt[c.er.band] = (cnt[c.er.band] || 0) + 1; tot += 1; } });
    if (!tot) { el.innerHTML = '<b>我的 AI 參與度</b>　<span class="muted">你寫了第一格，這裡就會顯示：自己寫、改寫、照抄、助教代填各占幾成。</span>'; return; }
    function pct(k) { return Math.round(cnt[k] * 100 / tot); }
    var seg = [['own', '自己寫', '#69db7c'], ['rewrite', '改寫', '#ffd43b'], ['copy', '照抄', '#ff922b'], ['ai', '助教代填', '#a5d8ff']];
    el.innerHTML = '<b>我的 AI 參與度</b>　' + seg.map(function (x) { return '<span class="ml"><i style="background:' + x[2] + '"></i>' + x[1] + ' ' + cnt[x[0]] + ' 格（' + pct(x[0]) + '%）</span>'; }).join('') +
      '<div class="mbar" aria-hidden="true">' + seg.map(function (x) { return cnt[x[0]] ? '<span style="width:' + (cnt[x[0]] * 100 / tot) + '%;background:' + x[2] + '"></span>' : ''; }).join('') + '</div>' +
      '<div class="muted">助教或起點幫忙不是不好，但這些格子要改成你自己的話，才算你的。這個比例只有你和老師看得到。</div>' + soloLine();
  }
  function renderTop() {
    if (!S.active) return; var q = qv();
    $('quota').innerHTML = '<b>' + esc(SB.banner(q.left)) + '</b>' + (q.why !== 'ok' ? '<div class="why">' + esc(SB.WHY_TEXT[q.why]) + '</div>' : '');
    $('quota').className = q.canUpload ? 'quota' : 'quota off';
    $('modeNote').textContent = S.mode === 'normal' ? '' : '系統狀態：' + SB.MODE_TEXT[S.mode]; $('modeNote').hidden = S.mode === 'normal';
    $('saved').textContent = S.saved ? '已自動儲存 ' + hhmm(S.saved) : '';
    var mine = S.boardName === 'me'; $('tabWall').className = mine ? '' : 'on'; $('tabMe').className = mine ? 'on' : '';
    renderMeter();
  }

  /* ———— 格子 ———— */
  function slotCount() { var mx = 0; cur().forEach(function (c) { if (c.n > mx) mx = c.n; }); return Math.min(SB.LIMITS.maxCells, Math.max(SB.LIMITS.defaultCells, mx, S.added)); }
  function cellFor(n) {
    var found = null; cur().forEach(function (c) { if (c.n === n) found = c; });
    if (found) return { c: found, virtual: false };
    var t = SB.template(S.caseId)[n - 1], c = SB.emptyCell(n); if (t) { c.title = t.title; c.where = t.where; c.moment = !!t.moment; }
    return { c: c, virtual: true, ask: t && t.ask };
  }
  function thumbOf(n) { return (S.thumbs[S.boardName] || {})[SB.slotKey(n)] || ''; }
  function renderAll(force) {
    if (!S.active) return;
    var ae = document.activeElement;
    if (!force && ae && /^(TEXTAREA|INPUT|SELECT)$/.test(ae.tagName) && $('cells').contains(ae)) { S.dirty = true; renderTop(); return; }   /* 打字中不重畫，離開欄位再補 */
    S.dirty = false; renderTop();
    var n = slotCount(), html = '', ro = !SB.canWrite(S.mode), q = qv(), t = tone(), tpl = SB.template(S.caseId);
    for (var i = 1; i <= n; i += 1) {
      var o = cellFor(i), c = o.c, st = SB.cellStatus(c), th = thumbOf(i), chk = SB.cellChecks(c), mineCell = c.by === S.sid;
      var ask = (tpl[i - 1] && tpl[i - 1].ask) || '這一格要回答：誰、在哪、發生什麼、他怎麼想。';
      var refsHtml = c.refs.map(function (r) { return '<span class="chip">' + esc(r) + (ro ? '' : ' <button class="x" data-n="' + i + '" data-rm="' + esc(r) + '" title="拿掉">×</button>') + '</span>'; }).join('');
      var opts = '<option value="">＋ 加入出處…</option>' + SB.arr(S.player.interviews).filter(SB.filled).map(function (r) { return '<option value="' + esc(r.id) + '">' + esc(r.id + '　' + pname(r.personaId)) + '</option>'; }).join('') + mateRefs().map(function (id) { return '<option value="' + esc(id) + '">' + esc(id + '　（隊友的訪談卡）') + '</option>'; }).join('');
      html += '<article class="cell' + (c.moment ? ' moment' : '') + ' s-' + st + (S.sel === i ? ' sel' : '') + '" data-n="' + i + '" style="--ct:' + t.color + '">' +
        '<header><span class="no">' + i + '</span><input class="f title" data-n="' + i + '" data-k="title" maxlength="24" value="' + esc(c.title) + '" placeholder="這一格叫什麼" ' + (ro ? 'disabled' : '') + '>' +
        (c.moment ? '<span class="mom">★ 關鍵時刻</span>' : '') + '</header>' +
        '<div class="img ' + (c.fit === 'cover' ? 'cover' : 'contain') + '" data-n="' + i + '" tabindex="0">' + (th ? '<img alt="第 ' + i + ' 格的圖" src="' + esc(th) + '">' : (MOBILE_UA ? '<div class="ph">按下面「選圖」，從相簿挑一張或直接拍照<br><span class="muted">用 Gemini 做的圖：在 Gemini 長按圖片 → 儲存到相簿，再回來按「選圖」</span></div>' : '<div class="ph">拖一張圖進來，或按下面「選圖」<br><span class="muted">橫幅、方形、直式都可以，會照原比例放</span></div>')) + '</div>' +
        '<div class="imgbar"><label class="btn mini ' + (q.canUpload && !ro ? '' : 'dis') + '">選圖<input type="file" accept="image/*" data-n="' + i + '" ' + (q.canUpload && !ro ? '' : 'disabled') + ' class="fileinp"></label>' +
        (th ? ' <button class="mini" data-n="' + i + '" data-act="full" ' + (SB.loadFull(S.mode) ? '' : 'disabled title="系統現在只提供縮圖"') + '>看原圖</button> <button class="mini" data-n="' + i + '" data-act="fit">' + (c.fit === 'cover' ? '完整顯示' : '填滿裁切') + '</button> <button class="mini" data-n="' + i + '" data-act="rmimg" ' + (ro ? 'disabled' : '') + '>拿掉圖</button>' : '') +
        (c.img ? ' <span class="muted">' + c.img.w + '×' + c.img.h + '</span>' : '') + '</div>' +
        '<div class="ask">' + esc(ask) + '</div>' + startBlock(i, c, ro) +
        '<div class="row2"><label>誰<input class="f" data-n="' + i + '" data-k="who" maxlength="24" value="' + esc(c.who) + '" ' + (ro ? 'disabled' : '') + '></label>' +
        '<label>在哪<input class="f" data-n="' + i + '" data-k="where" maxlength="40" value="' + esc(c.where) + '" ' + (ro ? 'disabled' : '') + '></label></div>' +
        '<label>發生什麼<textarea class="f" data-n="' + i + '" data-k="what" maxlength="140" ' + (ro ? 'disabled' : '') + '>' + esc(c.what) + '</textarea></label>' + fragPick(i, 'what', ro) +
        '<label>他怎麼想<textarea class="f" data-n="' + i + '" data-k="think" maxlength="140" ' + (ro ? 'disabled' : '') + '>' + esc(c.think) + '</textarea></label>' + fragPick(i, 'think', ro) +
        (c.aiText ? '<div><span class="ai-badge">' + (c.er && c.er.band === 'ai' ? '🤖 助教示範（這格幾乎不計分，改成你自己的話）' : '♻️ 助教示範，已改成自己的') + '</span></div>' : '') +
        (c.pain ? '<div class="painline">痛點句：<mark class="pain">' + esc(c.pain) + '</mark></div>' : '') +
        '<div class="bar"><button class="mini" data-n="' + i + '" data-act="pain" ' + (ro ? 'disabled' : '') + '>把選到的字標成痛點句（紅）</button> ' +
        '<label class="ck"><input type="checkbox" data-n="' + i + '" data-act="moment" ' + (c.moment ? 'checked' : '') + ' ' + (ro ? 'disabled' : '') + '> 這格是關鍵時刻</label></div>' +
        '<div class="refs">出處：' + (refsHtml || '<span class="muted">（還沒有）</span>') + ' <select data-n="' + i + '" data-act="addref" ' + (ro ? 'disabled' : '') + '>' + opts + '</select></div>' +
        (st !== 'ok' ? '<div class="gap">' + esc(SB.gapMessage(c)) + ' <a href="' + esc(backHref()) + '">🩺 回去訪談</a></div>' : '') +
        (CO ? '<div class="bar"><button class="mini cbtn" data-coach="' + i + '" ' + (ro || c.aiText ? 'disabled' : '') + '>' + esc(CO.cellBtnLabel(c)) + '</button></div>' : '') +
        (S.boardName === 'wall' ? '<div class="bar">' + (c.needHelp ? '<span class="need">🙋 ' + esc(c.helpAsk) + ' 請隊友補這格</span> ' : '') + (c.helped ? '<span class="ok">🩹 ' + esc(c.helped) + ' 補上了</span> ' : '') +
          '<button class="mini" data-n="' + i + '" data-act="help" ' + (ro ? 'disabled' : '') + '>' + (c.needHelp ? '不用補了' : '這格寫不出來，請隊友補') + '</button></div>' : '') +
        '<footer><span class="chk">' + chk.map(function (k) { return '<i class="' + (k.ok ? 'y' : 'n') + '">' + (k.ok ? '✓' : '·') + k.name + '</i>'; }).join('') + '</span>' +
        '<span class="by">' + (c.by ? '作者 ' + esc(c.by) + (c.er ? '・' + esc(SB.bandText(c.er.band)) + ' ' + Math.round(c.er.r * 100) + '%' : '') : '') + (mineCell ? '' : '') + '</span>' +
        (!o.virtual && !ro && (st === 'empty' || mineCell) ? '<button class="mini del" data-n="' + i + '" data-act="del">刪除這格</button>' : '') + '</footer></article>';
    }
    $('cells').innerHTML = html; decorateCounters();
    $('addCell').disabled = ro || n >= SB.LIMITS.maxCells; $('addCell').textContent = '＋ 新增一格（' + n + '／' + SB.LIMITS.maxCells + '）';
    $('draftBtn').disabled = ro;
    renderSide2();
  }
  /* 10-27 楊老師：每格先給「備選起點」（案例本來就有的線索）＋對應的啟發式評估準則提示。
     只帶「發生了什麼」；「他怎麼想」與痛點句一定由學生自己寫。起點是哪一個、用哪條準則，只記在這台裝置（不改資料庫欄位）。 */
  function stKey(n) { return 'erg_sbst_' + S.sid + '_' + CODE + '_' + n; }
  function stGet(n) { try { return JSON.parse(localStorage.getItem(stKey(n)) || 'null'); } catch (e) { return null; } }
  function stSet(n, v) { try { if (v) localStorage.setItem(stKey(n), JSON.stringify(v)); else localStorage.removeItem(stKey(n)); } catch (e) {} }
  function stFind(id) { var L = (window.ERG_SB_STARTS && window.ERG_SB_STARTS.cases[S.caseId]) || []; for (var i = 0; i < L.length; i += 1) if (L[i].id === id) return L[i]; return null; }
  function squash(x) { return String(x || '').replace(/\s+/g, ''); }
  function startBlock(n, c, ro) {
    var ST = window.ERG_SB_STARTS; if (!ST || ro) return '';
    var L = ST.cases[S.caseId] || [], P = ST.principles, ch = stGet(n), st = ch && stFind(ch.id), html = '';
    if (st && squash(c.what)) {
      var same = squash(c.what) === squash(st.scene), pid = ch.p || st.p, p = P[pid];
      html += '<div class="stbadge' + (same ? ' todo' : ' own') + '"><b>' + (same ? '起點・待補強' : '已改寫成自己的') + '</b> 來自線索 ' + esc(st.id) + '「' + esc(st.title) + '」' + (same ? '。請改成你自己訪談到的樣子，並寫「他怎麼想」。' : '。') + ' <button class="mini" data-n="' + n + '" data-act="stclear">拿掉起點</button></div>';
      if (p) html += '<div class="prin"><div class="ph"><b>對照準則：' + esc(p.name) + '</b> <span class="en">' + esc(p.en) + '</span></div><div>白話：' + esc(p.plain) + '</div><div class="pq"><b>問問自己：</b>' + esc(p.ask) + '</div>' +
        '<div class="pb"><select data-n="' + n + '" data-act="setprin" aria-label="換一條準則"><option value="">不太像，換一條看看…</option>' + Object.keys(P).map(function (k) { return '<option value="' + k + '"' + (k === pid ? ' disabled' : '') + '>' + esc(k.replace('H', '') + '　' + P[k].name) + '</option>'; }).join('') + '</select></div>' +
        '<div class="pb">' + (CO ? '<button class="mini" data-n="' + n + '" data-act="stask" data-kind="prin">問助教：這條準則是什麼意思？我這格像不像？</button>' : '') + '</div>' +
        '<div class="pn">建議只是幫你想，不是答案。你可以選別條準則，也可以認為這格其實沒有違反任何一條。' + (CO ? '助教會用一次今天的名額。' : '') + '</div></div>';
      return html;
    }
    if (squash(c.what) || !L.length) return '';
    var used = {}; for (var k = 1; k <= slotCount(); k += 1) { var o = stGet(k); if (o && o.id) used[o.id] = 1; }
    var free = L.filter(function (x) { return !used[x.id]; }), pick = []; for (var j = 0; j < free.length && pick.length < 3; j += 1) { var cand = free[(j + n - 1) % free.length]; if (pick.indexOf(cand) < 0) pick.push(cand); }
    html += '<details class="stbox" open><summary>A　先選一個起點（也可以略過，自己寫）</summary>' + pick.map(function (x) {
      var p = P[x.p]; return '<div class="stcard"><b>' + esc(x.title) + '</b> <span class="tg">線索 ' + esc(x.id) + '</span><div>' + esc(x.scene) + '</div><div class="stbar"><span class="tg prn">可能涉及：' + esc(p ? p.name : '') + '</span><button class="mini" data-n="' + n + '" data-act="stuse" data-sid="' + esc(x.id) + '">用這個起點</button></div></div>';
    }).join('') + '<div class="muted">起點只幫你想「發生了什麼」；「他怎麼想」和痛點句要你自己寫。沒有適合的就直接填下面。</div>' + (CO ? '<div class="stbar"><button class="mini" data-n="' + n + '" data-act="stask" data-kind="start">問助教：我該挑哪一個起點？</button><span class="muted">會用一次今天的名額</span></div>' : '') + '</details>';
    return html;
  }
  /* 「問助教」：沿用既有助教的「課程問答」（只依課程脈絡卡直接回答，不改資料庫欄位）。問題用程式組好，≤300 字。 */
  function stAsk(n, kind) {
    if (!CO || !CO._ask) { toast('助教現在不能用'); return; }
    var ST = window.ERG_SB_STARTS, P = ST && ST.principles, c = cellFor(n).c, ch = stGet(n), st = ch && stFind(ch.id), q = '', label = '';
    if (kind === 'prin' && st && P) {
      var p = P[ch.p || st.p]; label = '問助教：' + p.name;
      q = '啟發式評估的「' + p.name + '」是什麼意思？我故事板第 ' + n + ' 格寫的是「' + String(c.what || '').slice(0, 70) + '」，要怎麼判斷這一格有沒有違反這條？請給我判斷的線索，不要替我寫。';
    } else if (kind === 'start' && ST) {
      var L = (ST.cases[S.caseId] || []).slice(0, 3), names = Object.keys(pnames()).map(function (k) { return pnames()[k]; }).slice(0, 4).join('、');
      label = '問助教：挑哪個起點';
      q = '我故事板第 ' + n + ' 格要選起點。我訪談過' + (names ? '：' + names : '的人還不多') + '。可選的有：' + L.map(function (x) { return x.title; }).join('、') + '。怎麼挑比較合適？請說判斷的方法就好。';
    } else { toast('先選好起點再問'); return; }
    CO._ask({ kind: 'course', level: 1, slot: 0, ask: q.slice(0, 280), label: label });
  }
  /* 欄位字數計數：只顯示上限（沒有下限）；到 85% 轉橘色，不用紅色也不打叉 */
  function cntText(el) { var mx = Number(el.getAttribute('maxlength')) || 0, len = (el.value || '').length; return mx ? len + '／' + mx : ''; }
  function cntClass(el) { return 'cnt' + ((el.value || '').length >= (Number(el.getAttribute('maxlength')) || 1) * 0.85 ? ' near' : ''); }
  function decorateCounters() {
    Array.prototype.forEach.call(document.querySelectorAll('#cells .f[maxlength]'), function (el) {
      if (el.dataset.k === 'title') return;
      var nx = el.nextElementSibling; if (!nx || !nx.classList || !nx.classList.contains('cnt')) { nx = document.createElement('span'); el.parentNode.insertBefore(nx, el.nextSibling); }
      nx.textContent = cntText(el); nx.className = cntClass(el);
    });
  }
  /* 10-27 楊老師：訪談碎片讓學生用「選」的。每一格的「發生什麼／他怎麼想」下面各有一個下拉，列出我自己訪談卡裡寫過的句子（人物＋前 24 字），選了就接在欄位後面、並自動加進這格的出處。
     發生什麼 ← 事件、表面說法；他怎麼想 ← 真正需要。選項依「人物」分組，這樣學生不用先想要翻哪張卡。 */
  function fragPick(n, k, ro) {
    var fr = SB.fragments(SB.arr(S.player && S.player.interviews), pnames()), want = k === 'think' ? ['need'] : ['events', 'surface'], byP = {}, order = [];
    fr.forEach(function (f, i) { if (want.indexOf(f.kind) < 0) return; var key = f.name || f.pid || '人物'; if (!byP[key]) { byP[key] = []; order.push(key); } byP[key].push('<option value="' + i + '">' + esc((f.text.length > 24 ? f.text.slice(0, 24) + '…' : f.text)) + '</option>'); });
    var label = k === 'think' ? '＋ 從我的訪談挑「他可能怎麼想」…' : '＋ 從我的訪談挑「發生了什麼」…';
    if (!order.length) return '<div class="fragpick muted">' + (k === 'think' ? '訪談卡裡還沒有寫「真正需要」，先回去訪談補一句，這裡就會出現可以挑的句子。' : '訪談卡裡還沒有寫「事件」或「表面說法」，先回去訪談補一句。') + '</div>';
    return '<div class="fragpick"><select data-n="' + n + '" data-act="pickfrag" data-k="' + k + '" ' + (ro ? 'disabled' : '') + ' aria-label="' + esc(label) + '"><option value="">' + esc(label) + '</option>' +
      order.map(function (key) { return '<optgroup label="' + esc(key) + '">' + byP[key].join('') + '</optgroup>'; }).join('') + '</select></div>';
  }
  /* 隊友（別人當作者的格子）用過、而且不是我的訪談卡的編號：可以拿來當出處（接力一格成就） */
  function mateRefs() {
    var mine = {}, out = []; SB.arr(S.player && S.player.interviews).forEach(function (r) { if (r && r.id) mine[r.id] = 1; });
    S.cells.wall.forEach(function (c) { if (c.by && c.by !== S.sid) c.refs.forEach(function (id) { if (!mine[id] && SB.refAuthor(id) !== S.sid && out.indexOf(id) < 0) out.push(id); }); });
    return out;
  }
  function renderSide2() {
    var list = cur(), sum = SB.authorSummary(list), me = null; sum.forEach(function (a) { if (a.sid === S.sid) me = a; });
    var cnt = { ai: 0, copy: 0, rewrite: 0, own: 0 }; list.forEach(function (c) { if (c.by === S.sid && c.er) cnt[c.er.band] = (cnt[c.er.band] || 0) + 1; });
    var stt = SB.boardStats({ cells: list }), mom = stt.moments;
    var keep = S.keepAch || [], soloCases = keep.filter(function (x) { return /^so_/.test(x); }).map(function (x) { return x.slice(3); });
    var ach = SB.achievements({ sid: S.sid, wall: S.cells.wall, mine: S.cells.me, interviews: SB.arr(S.player && S.player.interviews), baseline: S.baseline, cfg: S.cfg, caseId: S.caseId, soloCases: soloCases });
    var gotIds = ach.filter(function (a) { return a.got; }).map(function (a) { return a.id; });
    if (gotIds.indexOf('solo') >= 0) gotIds.push('so_' + S.caseId);
    var allIds = keep.concat(gotIds).filter(function (v, i, a) { return v && a.indexOf(v) === i; }), sig = allIds.join(',');
    if (S.achLoaded && S.achSig !== sig && S.baseDone) { S.achSig = sig; S.keepAch = allIds; S.store.putAch(S.sid, allIds).catch(function () {}); }
    ach.forEach(function (a) { if (!a.got && keep.indexOf(a.id) >= 0 && a.group !== 'solo') a.got = true; });
    $('stats').innerHTML = '<h2>' + (S.boardName === 'wall' ? '這面牆' : '我的故事板') + '</h2>' +
      '<div>' + stt.filled + ' 格有內容・' + stt.withImg + ' 格有圖・' + stt.withRefs + ' 格有出處</div>' +
      '<div class="' + (mom ? 'ok' : 'warn') + '">' + (mom ? '已標出 ' + mom + ' 個關鍵時刻' : '還沒標出關鍵時刻（用一句話寫他在哪一刻最卡）') + '</div>' +
      '<h3>自己寫的程度（我當作者的格子）</h3><div id="ratio">自己寫 ' + cnt.own + ' 格・改寫 ' + cnt.rewrite + ' 格・照抄草稿 ' + cnt.copy + ' 格・助教代填 ' + cnt.ai + ' 格</div><div class="muted">草稿只是起點，改成你自己的話才算你的。</div>' +
      ['coop', 'coach', 'solo'].map(function (g) { return '<h3>' + (g === 'coop' ? '合作成就' : g === 'coach' ? '助教成就' : '自己來（最終挑戰）') + '</h3>' + ach.filter(function (a) { return a.group === g; }).map(function (a) { return '<div class="ach ' + (a.got ? 'got' : '') + '" title="' + esc(a.desc) + '"><span>' + a.icon + '</span> <b>' + esc(a.name) + '</b> ' + (a.got ? '已拿到' : '<span class="muted">' + esc(a.desc) + '</span>') + '</div>'; }).join(''); }).join('');
  }

  /* ———— 儲存 ———— */
  function canWrite() { if (!SB.canWrite(S.mode)) { toast(SB.WHY_TEXT.readonly); return false; } return true; }
  function baseCell(n) { var o = cellFor(n); return o; }
  function commit(n, patch) {
    if (!canWrite()) return Promise.resolve();
    var o = cellFor(n), prev = o.virtual ? null : o.c, start = o.c;
    var next = SB.applyEdit(start, patch, S.sid, NOW(), S.cfg);
    var list = cur(), idx = -1; list.forEach(function (c, i) { if (c.n === n) idx = i; }); if (idx >= 0) list[idx] = next; else { list.push(next); list.sort(function (a, b) { return a.n - b.n; }); }
    return S.store.saveCell(CODE, bkey(S.boardName), prev, next).then(function () { S.saved = NOW(); renderTop(); }, function (e) { toast('存不進去：' + (e && e.message)); });
  }
  function queueEdit(n, k, v) {
    var key = n + ':' + k; S.pending[key] = [n, k, v]; clearTimeout(S.timers[key]);
    S.timers[key] = setTimeout(function () { flush(key); }, 500);
  }
  function flush(key) { var p = S.pending[key]; if (!p) return; delete S.pending[key]; var patch = {}; patch[p[1]] = p[2]; commit(p[0], patch); }
  function flushAll() { Object.keys(S.pending).forEach(flush); }

  /* ———— 圖片 ———— */
  function loadImg(file) {
    return new Promise(function (res, rej) {
      var u = URL.createObjectURL(file), im = new Image();
      im.onload = function () { URL.revokeObjectURL(u); res(im); }; im.onerror = function () { URL.revokeObjectURL(u); rej(new Error('這個檔案打不開，請換一張圖（jpg、png、webp、gif 都可以；截圖也可以）')); }; im.src = u;
    });
  }
  function encodeTo(im, maxLong, maxBytes) {
    var cv = document.createElement('canvas'), ctx = cv.getContext('2d'), type = 'image/webp', last = null;
    var w0 = im.naturalWidth || im.width, h0 = im.naturalHeight || im.height;
    var probe = document.createElement('canvas'); probe.width = 2; probe.height = 2; if (probe.toDataURL('image/webp').indexOf('data:image/webp') !== 0) type = 'image/jpeg';   /* Safari 舊版不能輸出 webp */
    function enc(w, h, q) { cv.width = w; cv.height = h; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(im, 0, 0, w, h); last = { url: cv.toDataURL(type, q), w: w, h: h, q: q }; return SB.dataUrlBytes(last.url); }
    var fit = SB.fitToBudget(enc, w0, h0, { maxLong: maxLong, maxBytes: maxBytes });
    if (!last || last.w !== fit.w || last.h !== fit.h || last.q !== fit.q) enc(fit.w, fit.h, fit.q);
    return { url: last.url, w: last.w, h: last.h, bytes: fit.bytes, ok: fit.ok, type: type };
  }
  function uploadFile(n, file) {
    var q = qv(); if (!canWrite()) return;
    if (!q.canUpload) { toast(SB.WHY_TEXT[q.why] || '現在不能上傳'); return; }
    if (file && (/\.(heic|heif)$/i.test(file.name || '') || /heic|heif/i.test(file.type || ''))) { toast('這是 iPhone 的 HEIC 照片，這裡打不開。請先把照片截圖，再選那張截圖；或在 iPhone「設定 → 相機 → 格式」改成「最相容」。', 8000); return; }
    if (!file || !/^image\//.test(file.type)) { toast('這不是圖片檔，請選一張圖（jpg、png、webp、gif 都可以）', 5000); return; }
    if (file.size > 25 * 1024 * 1024) { toast('這張圖太大了（超過 25 MB），請先縮小再選'); return; }
    toast('處理圖片中…', 8000);
    loadImg(file).then(function (im) {
      var full = encodeTo(im, SB.LIMITS.fullLong, SB.LIMITS.fullBytes), th = encodeTo(im, SB.LIMITS.thumbLong, SB.LIMITS.thumbBytes);
      if (!full.ok || !th.ok) throw new Error('這張圖壓不到可以存的大小，請換一張簡單一點的圖');
      var hadImg = !!cellFor(n).c.img;
      return S.store.reserve(S.sid, S.cfg).then(function (r) {
        if (!r.ok) { toast(SB.WHY_TEXT[r.reason]); return; }
        /* 格子還不存在（只是樣板）就先建起來，再放圖 */
        var o = cellFor(n), pre = o.virtual ? commit(n, { title: o.c.title }) : Promise.resolve();
        return pre.then(function () { return S.store.putImage(CODE, bkey(S.boardName), n, { full: full.url, thumb: th.url, w: full.w, h: full.h }); }).then(function () {
          S.full[bkey(S.boardName) + n] = full.url; S.saved = NOW(); toast('圖片放好了（' + Math.round(full.bytes / 1024) + ' KB）'); renderTop();
          /* 10-27：選完檔案後焦點還停在檔案欄位上，renderAll 會因為「打字中不重畫」而略過，要等焦點離開圖才出現，學生以為上傳失敗 */
          try { var ae0 = document.activeElement; if (ae0 && ae0.blur) ae0.blur(); } catch (x) {} renderAll(true);
        }, function (e) { S.store.refund(S.sid); throw e; });
      });
    }).catch(function (e) { toast(e && e.message || '圖片上傳失敗', 6000); });
  }
  function showFull(n) {
    if (!SB.loadFull(S.mode)) { toast('系統現在只提供縮圖'); return; }
    var key = bkey(S.boardName) + n, show = function (u) { if (!u) { toast('找不到原圖'); return; } $('lb').innerHTML = '<img alt="原圖" src="' + esc(u) + '"><button id="lbx" class="btn">關閉</button>'; $('lb').hidden = false; $('lbx').onclick = function () { $('lb').hidden = true; }; };
    if (S.full[key]) show(S.full[key]); else S.store.getFull(CODE, bkey(S.boardName), n).then(function (u) { if (u) S.full[key] = u; show(u); });
  }

  /* ———— 草稿 ———— */
  function makeDraftNow() {
    if (!canWrite()) return;
    var d = SB.makeDraft(S.caseId, SB.arr(S.player.interviews), { names: pnames(), heroId: ((window.ERG_APP && window.ERG_APP.caseMeta) ? window.ERG_APP.caseMeta(S.caseId).mainPersona : 'patient') });
    var chain = Promise.resolve(), made = 0;
    d.cells.forEach(function (dc) {
      var o = cellFor(dc.n); if (SB.hasContent(o.c)) return;
      if (!SB.hasContent(dc)) return; made += 1;
      chain = chain.then(function () {
        var base = o.c; var next = SB.applyEdit(base, { title: dc.title, who: dc.who, where: dc.where, what: dc.what, think: dc.think, refs: dc.refs, moment: dc.moment }, S.sid, NOW(), S.cfg);
        next.draft = dc.draft; next.er = SB.erFor(next, S.cfg);
        var list = cur(), idx = -1; list.forEach(function (c, i) { if (c.n === next.n) idx = i; }); if (idx >= 0) list[idx] = next; else list.push(next);
        return S.store.saveCell(CODE, bkey(S.boardName), o.virtual ? null : o.c, next);
      });
    });
    chain.then(function () { S.saved = NOW(); toast(made ? '排好 ' + made + ' 格草稿；沒素材的格子留空，回去再問一個人。' : '沒有空格可以排草稿（或你的訪談內容還不夠）', 5000); renderAll(true); });
  }

  /* ———— 事件 ———— */
  function bindStatic() {
    $('tabWall').onclick = function () { S.boardName = 'wall'; renderAll(true); };
    $('tabMe').onclick = function () { S.boardName = 'me'; renderAll(true); };
    $('draftBtn').onclick = makeDraftNow;
    $('addCell').onclick = function () { var n = slotCount(); if (n < SB.LIMITS.maxCells) { S.added = n + 1; S.sel = S.added; renderAll(true); } };
    $('printBtn').onclick = doPrint; $('pngBtn').onclick = exportPng;
    document.addEventListener('focusout', function () { flushAll(); setTimeout(function () { if (S.dirty && !(document.activeElement && $('cells').contains(document.activeElement))) renderAll(true); }, 50); });
    window.addEventListener('beforeunload', flushAll);
    var cells = $('cells');
    cells.addEventListener('input', function (e) { var t = e.target; if (t.classList.contains('f')) { queueEdit(Number(t.dataset.n), t.dataset.k, t.value); var nx = t.nextElementSibling; if (nx && nx.classList.contains('cnt')) { nx.textContent = cntText(t); nx.className = cntClass(t); } } });
    cells.addEventListener('focusin', function (e) { var t = e.target, n = Number(t.dataset.n || (t.closest('.cell') && t.closest('.cell').dataset.n)); if (n) { S.sel = n; S.lastField = t.dataset.k ? { n: n, el: t } : S.lastField; } });
    cells.addEventListener('change', function (e) {
      var t = e.target, n = Number(t.dataset.n);
      if (t.type === 'file') { if (t.files && t.files[0]) uploadFile(n, t.files[0]); t.value = ''; return; }
      if (t.dataset.act === 'moment') commit(n, { moment: t.checked }).then(function () { renderAll(true); });
      else if (t.dataset.act === 'setprin' && t.value) { var cs = stGet(n); if (cs) { cs.p = t.value; stSet(n, cs); renderAll(true); } }
      else if (t.dataset.act === 'pickfrag' && t.value !== '') { var fr0 = SB.fragments(SB.arr(S.player && S.player.interviews), pnames()), f0 = fr0[Number(t.value)], kk = t.dataset.k; if (f0 && canWrite()) { var o0 = cellFor(n).c, pa = {}; pa[kk] = ((o0[kk] ? o0[kk] + '；' : '') + f0.text).slice(0, 140); pa.refs = o0.refs.concat([f0.recId]).filter(function (v, i, a) { return a.indexOf(v) === i; }); var full0 = (o0[kk] ? o0[kk] + '；' : '') + f0.text; if (full0.length > 140) toast('這句放進去會超過 140 字，已放到上限；沒放進來的是：「' + full0.slice(140, 170) + (full0.length > 170 ? '…' : '') + '」，可以拆到下一格。', 6500); commit(n, pa).then(function () { renderAll(true); }); } t.value = ''; }
      else if (t.dataset.act === 'addref' && t.value) { var o = cellFor(n); commit(n, { refs: o.c.refs.concat([t.value]).filter(function (v, i, a) { return a.indexOf(v) === i; }) }).then(function () { renderAll(true); }); }
    });
    cells.addEventListener('click', function (e) {
      var b = e.target.closest('button'); var card = e.target.closest('.cell'); if (card) S.sel = Number(card.dataset.n);
      if (e.target.closest('.img') && !b) { var im = e.target.closest('.img'); if (im.querySelector('img')) showFull(Number(im.dataset.n)); return; }
      if (!b) return; var n = Number(b.dataset.n), act = b.dataset.act;
      if (b.dataset.act === 'stuse') { var stx = stFind(b.dataset.sid); if (stx && canWrite()) { stSet(n, { id: stx.id, p: stx.p }); useStart(n, stx); } return; }
      if (b.dataset.act === 'stask') { stAsk(n, b.dataset.kind); return; }
      if (b.dataset.act === 'stclear') { stSet(n, null); renderAll(true); return; }
      if (b.dataset.rm) { var o = cellFor(n); commit(n, { refs: o.c.refs.filter(function (r) { return r !== b.dataset.rm; }) }).then(function () { renderAll(true); }); return; }
      if (act === 'full') showFull(n);
      else if (act === 'fit') { var c2 = cellFor(n).c; commit(n, { fit: c2.fit === 'cover' ? 'contain' : 'cover' }).then(function () { renderAll(true); }); }
      else if (act === 'rmimg') twoStep(b, 'img' + n, function () { S.store.removeImage(CODE, bkey(S.boardName), n).then(function () { delete S.full[bkey(S.boardName) + n]; toast('圖拿掉了（今天的張數不會退回）'); }); });
      else if (act === 'del') twoStep(b, 'del' + n, function () { S.store.removeCell(CODE, bkey(S.boardName), n).then(function () { renderAll(true); }); });
      else if (act === 'help') { var c3 = cellFor(n).c; commit(n, { needHelp: !c3.needHelp }).then(function () { renderAll(true); }); }
      else if (act === 'pain') {
        var card2 = b.closest('.cell'), picked = '';
        ['what', 'think'].forEach(function (k) { var ta = card2.querySelector('textarea[data-k="' + k + '"]'); if (ta && ta.selectionEnd > ta.selectionStart && !picked) picked = ta.value.slice(ta.selectionStart, ta.selectionEnd); });
        if (!picked) { toast('先在「發生什麼」或「他怎麼想」裡選一段字，再按這個鈕'); return; }
        flushAll(); commit(n, { pain: picked.trim() }).then(function () { renderAll(true); });
      }
    });
    /* 拖放：圖片檔進格子；素材片段進格子 */
    cells.addEventListener('dragover', function (e) { if (e.target.closest('.cell')) { e.preventDefault(); } });
    cells.addEventListener('drop', function (e) {
      var card = e.target.closest('.cell'); if (!card) return; e.preventDefault();
      var n = Number(card.dataset.n), f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) { uploadFile(n, f); return; }
      var fi = e.dataTransfer && e.dataTransfer.getData('text/x-frag'); if (fi !== '' && fi != null && S.frags[Number(fi)]) insertFrag(n, S.frags[Number(fi)]);
    });
    document.addEventListener('dragstart', function (e) { var f = e.target.closest && e.target.closest('.frag'); if (f && e.dataTransfer) { e.dataTransfer.setData('text/x-frag', f.dataset.fi); e.dataTransfer.effectAllowed = 'copy'; } });
    document.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.dataset.use) { insertFrag(S.sel, S.frags[Number(b.dataset.fi)]); }
      if (b.dataset.copy !== undefined) copyText(SB.PROMPTS[Number(b.dataset.copy)].text, function (ok) { toast(ok ? '已複製，貼到 Gemini 後把【　】填成自己的內容' : '複製失敗，請手動選取文字'); });
    });
  }
  function insertFrag(n, f) {
    if (!f || !canWrite()) return; var o = cellFor(n).c, k = f.kind === 'need' ? 'think' : 'what', patch = {};
    patch[k] = (o[k] ? o[k] + '；' : '') + f.text; patch.refs = o.refs.concat([f.recId]).filter(function (v, i, a) { return a.indexOf(v) === i; });
    commit(n, patch).then(function () { renderAll(true); });
  }

  /* ———— 列印（另存 PDF） ———— */
  function doPrint() {
    flushAll(); var list = cur().filter(function (c) { return SB.hasContent(c) || c.img; }), imgs = {}, jobs = [];
    var key = bkey(S.boardName);
    list.forEach(function (c) {
      var sk = SB.slotKey(c.n), th = (S.thumbs[S.boardName] || {})[sk]; if (th) imgs[sk] = th;
      if (c.img && SB.loadFull(S.mode)) jobs.push(S.store.getFull(CODE, key, c.n).then(function (u) { if (u) imgs[sk] = u; }));
    });
    toast('準備列印頁…', 6000);
    Promise.all(jobs).then(function () {
      var d = new Date(NOW());
      $('printSheet').innerHTML = SB.printHtml({ cells: list }, { caseId: S.caseId, code: CODE, sid: S.sid, boardName: S.boardName === 'wall' ? '房間故事板牆' : '我的故事板', date: d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) }, imgs);
      document.body.classList.add('printing');
      if (!Q.get('noprint')) { try { window.print(); } catch (e) {} }
      if (!Q.get('keepprint')) setTimeout(function () { document.body.classList.remove('printing'); }, 500);
      toast('在列印視窗選「另存為 PDF」，再把檔案交到 flipclass', 6000);
    });
  }

  /* ———— 匯出成圖片（手機沒有好用的列印）：用 canvas 把這面故事板畫成一張 PNG，可下載、可分享、可長按存相簿 ———— */
  function loadImage(u) { return new Promise(function (res) { if (!u) { res(null); return; } var im = new Image(); im.onload = function () { res(im); }; im.onerror = function () { res(null); }; im.src = u; }); }
  function exportPng() {
    flushAll(); var list = cur().filter(function (c) { return SB.hasContent(c) || c.img; });
    if (!list.length) { toast('這面故事板還沒有內容可以存'); return; }
    toast('產生圖片中…', 10000);
    var key = bkey(S.boardName), imgs = {}, jobs = [];
    list.forEach(function (c) { var sk = SB.slotKey(c.n), th = (S.thumbs[S.boardName] || {})[sk]; if (th) imgs[sk] = th; if (c.img && SB.loadFull(S.mode)) jobs.push(S.store.getFull(CODE, key, c.n).then(function (u) { if (u) imgs[sk] = u; })); });
    Promise.all(jobs).then(function () { return Promise.all(list.map(function (c) { return loadImage(imgs[SB.slotKey(c.n)]); })); }).then(function (ims) {
      var W = 1080, P = 36, IW = W - 2 * P, FS = 26, LH = 38, FONT = '"Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif', t = tone();
      var m = document.createElement('canvas').getContext('2d'); m.font = FS + 'px ' + FONT; var meas = function (x) { return m.measureText(x).width; };
      function fieldLines(label, text, pain) {   /* 每個字帶一個「是不是痛點」旗標；換行後逐行對回去 */
        var full = label + (text || ''), off = label.length, out = [], lines = SB.wrapText(meas, full, IW - 24), pos = 0, pi = pain && text ? text.indexOf(pain) : -1;
        lines.forEach(function (ln) { var chs = Array.from(ln); out.push(chs.map(function (ch, k) { var idx = pos + k - off; return { ch: ch, red: pi >= 0 && idx >= pi && idx < pi + Array.from(pain).length }; })); pos += chs.length; if (pos < full.length && full.charAt(pos) === '\n') pos += 1; });
        return out;
      }
      var blocks = list.map(function (c, i) {
        var im = ims[i], ih = 0; if (im) { var ar = im.naturalWidth / im.naturalHeight; ih = Math.min(560, Math.round(IW / ar)); }
        var f = [['誰：' , c.who + (c.where ? '　在哪：' + c.where : '')], ['發生什麼：', c.what], ['他怎麼想：', c.think]].map(function (a) { return fieldLines(a[0], a[1], a[0] === '發生什麼：' || a[0] === '他怎麼想：' ? c.pain : ''); });
        var src = SB.wrapText(meas, '出處：' + (c.refs.length ? c.refs.join('、') : '（還沒有）') + (c.by ? '　作者 ' + c.by : ''), IW - 24);
        var nl = f.reduce(function (n, x) { return n + x.length; }, 0) + src.length;
        return { c: c, im: im, ih: ih, f: f, src: src, h: 64 + (ih ? ih + 16 : 0) + nl * LH + 28 };
      });
      var H = 150 + blocks.reduce(function (n, b) { return n + b.h + 20; }, 0) + 30;
      var cv = document.createElement('canvas'); cv.width = W; cv.height = H; var x = cv.getContext('2d'); x.textBaseline = 'top';
      x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H); x.fillStyle = t.color; x.fillRect(0, 0, W, 14);
      x.fillStyle = '#1e1e1e'; x.font = '900 40px ' + FONT; x.fillText(t.icon + ' ' + t.name + '　UX 故事板', P, 34);
      x.font = '24px ' + FONT; x.fillStyle = '#59656d'; var d = new Date(NOW()); x.fillText('房間 ' + CODE + '　' + (S.boardName === 'wall' ? '房間故事板牆' : '我的故事板') + '　學號 ' + S.sid + '　' + d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()), P, 92);
      var y = 150;
      blocks.forEach(function (b) {
        var c = b.c; x.fillStyle = c.moment ? '#ffeceb' : '#f4f9fd'; x.fillRect(P - 12, y, IW + 24, b.h); x.strokeStyle = '#1e1e1e'; x.lineWidth = 3; x.strokeRect(P - 12, y, IW + 24, b.h);
        x.fillStyle = t.color; x.fillRect(P - 12, y, IW + 24, 8);
        x.fillStyle = '#1e1e1e'; x.font = '900 32px ' + FONT; x.fillText(c.n + '　' + (c.title || '') + (c.moment ? '　★關鍵時刻' : ''), P, y + 20); var yy = y + 64;
        if (b.im) { var s = Math.min(IW / b.im.naturalWidth, b.ih / b.im.naturalHeight), w = b.im.naturalWidth * s, h = b.im.naturalHeight * s; x.fillStyle = '#eef'; x.fillRect(P, yy, IW, b.ih); x.drawImage(b.im, P + (IW - w) / 2, yy + (b.ih - h) / 2, w, h); yy += b.ih + 16; }
        x.font = FS + 'px ' + FONT;
        b.f.forEach(function (lines) { lines.forEach(function (chs) { var cx = P; chs.forEach(function (o) { x.fillStyle = o.red ? '#c92a2a' : '#1e1e1e'; x.fillText(o.ch, cx, yy); cx += x.measureText(o.ch).width; }); yy += LH; }); });
        x.fillStyle = '#59656d'; x.font = '22px ' + FONT; b.src.forEach(function (ln) { x.fillText(ln, P, yy + 4); yy += LH; });
        y += b.h + 20;
      });
      return new Promise(function (res, rej) { cv.toBlob(function (bl) { bl ? res({ blob: bl, w: W, h: H }) : rej(new Error('這台手機畫不出這麼大的圖')); }, 'image/png'); });
    }).then(function (r) {
      var url = URL.createObjectURL(r.blob), name = '故事板_' + CODE + '_' + (S.boardName === 'wall' ? '牆' : S.sid) + '.png', file = null;
      try { file = new File([r.blob], name, { type: 'image/png' }); } catch (e) {}
      var canShare = !!(file && navigator.canShare && navigator.canShare({ files: [file] }));
      $('lb').innerHTML = '<div style="color:#fff;text-align:center;padding:0 12px">長按圖片可以存到相簿，或按下面的按鈕</div><img id="pngImg" alt="故事板圖片" src="' + url + '"><div class="row" style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center"><a id="pngDl" class="btn" href="' + url + '" download="' + esc(name) + '">下載圖片</a>' + (canShare ? '<button id="pngShare">分享</button>' : '') + '<button id="lbx">關閉</button></div>';
      $('lb').hidden = false; $('lbx').onclick = function () { $('lb').hidden = true; }; if (canShare) $('pngShare').onclick = function () { navigator.share({ files: [file], title: name }).catch(function () {}); };
      window.ERG_SB_LAST_PNG = { w: r.w, h: r.h, bytes: r.blob.size, name: name }; toast('圖片做好了（' + Math.round(r.blob.size / 1024) + ' KB）');
    }).catch(function (e) { toast('做不出圖片：' + (e && e.message)); });
  }

  window.ERG_SB_UI = { state: S, boot: boot, renderAll: renderAll };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
