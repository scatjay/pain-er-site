/* 故事板編輯器的畫面與啟動（瀏覽器端）。純邏輯在 sb_core.js、資料存取在 sb_store.js。
   網址：storyboard.html?room=房號[&board=me][&local=1&sid=學號（只有本機模式）]
   不用 alert／confirm／prompt：提示一律是頁內 toast，確認一律是兩段式按鈕。 */
(function () {
  'use strict';
  var SB = window.ERG_SB, ST = window.ERG_SB_STORE;
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
    added: 0, sel: 1, lastField: null, saved: 0, dirty: false, timers: {}, pending: {}, armed: {}, offs: [], DB: null, store: null, started: false };
  var NOW = function () { return Date.now(); };
  function bkey(name) { return name === 'me' ? ST.boardKey(S.sid) : 'wall'; }
  function cur() { return S.cells[S.boardName]; }
  function tone() { return SB.caseInfo(S.caseId); }

  function toast(msg, ms) { var t = $('toast'); t.textContent = msg; t.className = 'on'; clearTimeout(toast.t); toast.t = setTimeout(function () { t.className = ''; }, ms || 3500); }
  function twoStep(btn, label, run) {   /* 兩段式確認：第一次按變「再按一次確認」，6 秒自動復原 */
    if (S.armed[label]) { clearTimeout(S.armed[label]); delete S.armed[label]; run(); return; }
    var old = btn.textContent; btn.textContent = '再按一次確認'; btn.classList.add('armed');
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
  function backHref() { return 'index.html' + (CODE ? '#room=' + CODE : ''); }
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
    var title = g.reason === 'loading' ? '載入中…' : (g.reason === 'no-interview' ? '先去這間房訪談' : '還不能開故事板');
    $('gate').innerHTML = '<div class="card"><h1>' + esc(title) + '</h1><p>' + esc(g.msg) + '</p>' +
      (g.reason === 'loading' ? '' : '<p><a class="btn" href="' + esc(backHref()) + '">' + (CODE && g.reason === 'no-interview' ? '回到這間房（' + esc(CODE) + '）' : '回到急診室') + '</a></p>') + '</div>';
  }

  function enter() {
    S.active = true; $('gate').hidden = true; $('app').hidden = false;
    var t = tone(); document.documentElement.style.setProperty('--ct', t.color);
    document.title = '故事板・' + t.name;
    $('caseBadge').innerHTML = '<span class="cl" style="background:' + t.color + '">' + esc(t.letter) + '</span>' + esc(t.icon) + ' ' + esc(t.name);
    $('roomLine').textContent = '房間 ' + CODE + '　學號 ' + S.sid;
    $('backLink').href = backHref();
    var ids = (SB.arr(S.player.interviews).filter(SB.filled)).map(function (r) { return r.id; });
    var pers = {}; SB.arr(S.player.interviews).filter(SB.filled).forEach(function (r) { pers[r.personaId] = 1; });
    S.store.ensureBaseline(CODE, S.sid, ids, Object.keys(pers)).then(function (b) { S.baseline = b; renderSide(); });
    var offs = S.offs;
    offs.push(S.store.watchBoard(CODE, 'wall', function (b) { S.cells.wall = b.cells; renderAll(); }));
    offs.push(S.store.watchBoard(CODE, ST.boardKey(S.sid), function (b) { S.cells.me = b.cells; renderAll(); }));
    offs.push(S.store.watchThumbs(CODE, 'wall', function (t) { S.thumbs.wall = t; renderAll(); }));
    offs.push(S.store.watchThumbs(CODE, ST.boardKey(S.sid), function (t) { S.thumbs.me = t; renderAll(); }));
    offs.push(S.store.watchOps(function (v) { var o = SB.opsState(v, NOW()); S.ops = o; S.mode = o.mode; renderTop(); renderAll(); }));
    watchQuota(); setInterval(function () { if (S.quota.day && S.quota.day !== SB.dayKey(NOW())) watchQuota(); }, 30000);
    refreshAside(); bindStatic(); renderAll(true);
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
    $('prompts').innerHTML = '<h2>三則指令（複製後，把【　】填成自己的內容）</h2>' + SB.PROMPTS.map(function (p, i) {
      return '<div class="pr"><b>' + esc(p.name) + '</b><div class="pt">' + esc(p.text) + '</div><button class="mini" data-copy="' + i + '">複製</button></div>';
    }).join('');
  }
  function pnames() { var o = {}; SB.arr(S.player && S.player.interviews).forEach(function (r) { if (r && r.personaId) o[r.personaId] = pname(r.personaId); }); return o; }
  function copyText(t, done) {
    function fb() { var ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); var ok = false; try { ok = document.execCommand('copy'); } catch (e) {} document.body.removeChild(ta); done(ok); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(function () { done(true); }, fb); else fb();
  }

  /* ———— 頂列：額度、模式、儲存狀態 ———— */
  function qv() { return SB.quotaView({ userUsed: S.quota.userUsed, siteUsed: S.quota.siteUsed, mode: S.mode }); }
  function renderTop() {
    if (!S.active) return; var q = qv();
    $('quota').innerHTML = '<b>' + esc(SB.banner(q.left)) + '</b>' + (q.why !== 'ok' ? '<div class="why">' + esc(SB.WHY_TEXT[q.why]) + '</div>' : '');
    $('quota').className = q.canUpload ? 'quota' : 'quota off';
    $('modeNote').textContent = S.mode === 'normal' ? '' : '系統狀態：' + SB.MODE_TEXT[S.mode]; $('modeNote').hidden = S.mode === 'normal';
    $('saved').textContent = S.saved ? '已自動儲存 ' + hhmm(S.saved) : '';
    var mine = S.boardName === 'me'; $('tabWall').className = mine ? '' : 'on'; $('tabMe').className = mine ? 'on' : '';
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
      var opts = '<option value="">＋ 加入出處…</option>' + SB.arr(S.player.interviews).filter(SB.filled).map(function (r) { return '<option value="' + esc(r.id) + '">' + esc(r.id + '　' + pname(r.personaId)) + '</option>'; }).join('');
      html += '<article class="cell' + (c.moment ? ' moment' : '') + ' s-' + st + (S.sel === i ? ' sel' : '') + '" data-n="' + i + '" style="--ct:' + t.color + '">' +
        '<header><span class="no">' + i + '</span><input class="f title" data-n="' + i + '" data-k="title" maxlength="24" value="' + esc(c.title) + '" placeholder="這一格叫什麼" ' + (ro ? 'disabled' : '') + '>' +
        (c.moment ? '<span class="mom">★ 關鍵時刻</span>' : '') + '</header>' +
        '<div class="img ' + (c.fit === 'cover' ? 'cover' : 'contain') + '" data-n="' + i + '" tabindex="0">' + (th ? '<img alt="第 ' + i + ' 格的圖" src="' + esc(th) + '">' : '<div class="ph">拖一張圖進來，或按下面「選圖」<br><span class="muted">橫幅、方形、直式都可以，會照原比例放</span></div>') + '</div>' +
        '<div class="imgbar"><label class="btn mini ' + (q.canUpload && !ro ? '' : 'dis') + '">選圖<input type="file" accept="image/*" data-n="' + i + '" ' + (q.canUpload && !ro ? '' : 'disabled') + ' hidden></label>' +
        (th ? ' <button class="mini" data-n="' + i + '" data-act="full" ' + (SB.loadFull(S.mode) ? '' : 'disabled title="系統現在只提供縮圖"') + '>看原圖</button> <button class="mini" data-n="' + i + '" data-act="fit">' + (c.fit === 'cover' ? '完整顯示' : '填滿裁切') + '</button> <button class="mini" data-n="' + i + '" data-act="rmimg" ' + (ro ? 'disabled' : '') + '>拿掉圖</button>' : '') +
        (c.img ? ' <span class="muted">' + c.img.w + '×' + c.img.h + '</span>' : '') + '</div>' +
        '<div class="ask">' + esc(ask) + '</div>' +
        '<div class="row2"><label>誰<input class="f" data-n="' + i + '" data-k="who" maxlength="24" value="' + esc(c.who) + '" ' + (ro ? 'disabled' : '') + '></label>' +
        '<label>在哪<input class="f" data-n="' + i + '" data-k="where" maxlength="40" value="' + esc(c.where) + '" ' + (ro ? 'disabled' : '') + '></label></div>' +
        '<label>發生什麼<textarea class="f" data-n="' + i + '" data-k="what" maxlength="140" ' + (ro ? 'disabled' : '') + '>' + esc(c.what) + '</textarea></label>' +
        '<label>他怎麼想<textarea class="f" data-n="' + i + '" data-k="think" maxlength="140" ' + (ro ? 'disabled' : '') + '>' + esc(c.think) + '</textarea></label>' +
        (c.pain ? '<div class="painline">痛點句：<mark class="pain">' + esc(c.pain) + '</mark></div>' : '') +
        '<div class="bar"><button class="mini" data-n="' + i + '" data-act="pain" ' + (ro ? 'disabled' : '') + '>把選到的字標成痛點句（紅）</button> ' +
        '<label class="ck"><input type="checkbox" data-n="' + i + '" data-act="moment" ' + (c.moment ? 'checked' : '') + ' ' + (ro ? 'disabled' : '') + '> 這格是關鍵時刻</label></div>' +
        '<div class="refs">出處：' + (refsHtml || '<span class="muted">（還沒有）</span>') + ' <select data-n="' + i + '" data-act="addref" ' + (ro ? 'disabled' : '') + '>' + opts + '</select></div>' +
        (st !== 'ok' ? '<div class="gap">' + esc(SB.gapMessage(c)) + ' <a href="' + esc(backHref()) + '">回去再問一個人</a></div>' : '') +
        (S.boardName === 'wall' ? '<div class="bar">' + (c.needHelp ? '<span class="need">🙋 ' + esc(c.helpAsk) + ' 請隊友補這格</span> ' : '') + (c.helped ? '<span class="ok">🩹 ' + esc(c.helped) + ' 補上了</span> ' : '') +
          '<button class="mini" data-n="' + i + '" data-act="help" ' + (ro ? 'disabled' : '') + '>' + (c.needHelp ? '不用補了' : '這格寫不出來，請隊友補') + '</button></div>' : '') +
        '<footer><span class="chk">' + chk.map(function (k) { return '<i class="' + (k.ok ? 'y' : 'n') + '">' + (k.ok ? '✓' : '·') + k.name + '</i>'; }).join('') + '</span>' +
        '<span class="by">' + (c.by ? '作者 ' + esc(c.by) + (c.er ? '・' + esc(SB.bandText(c.er.band)) + ' ' + Math.round(c.er.r * 100) + '%' : '') : '') + (mineCell ? '' : '') + '</span>' +
        (!o.virtual && !ro && (st === 'empty' || mineCell) ? '<button class="mini del" data-n="' + i + '" data-act="del">刪除這格</button>' : '') + '</footer></article>';
    }
    $('cells').innerHTML = html;
    $('addCell').disabled = ro || n >= SB.LIMITS.maxCells; $('addCell').textContent = '＋ 新增一格（' + n + '／' + SB.LIMITS.maxCells + '）';
    $('draftBtn').disabled = ro;
    renderSide2();
  }
  function renderSide2() {
    var list = cur(), sum = SB.authorSummary(list), me = null; sum.forEach(function (a) { if (a.sid === S.sid) me = a; });
    var cnt = { copy: 0, rewrite: 0, own: 0 }; list.forEach(function (c) { if (c.by === S.sid && c.er) cnt[c.er.band] = (cnt[c.er.band] || 0) + 1; });
    var stt = SB.boardStats({ cells: list }), mom = stt.moments;
    var ach = SB.achievements({ sid: S.sid, wall: S.cells.wall, mine: S.cells.me, interviews: SB.arr(S.player && S.player.interviews), baseline: S.baseline });
    $('stats').innerHTML = '<h2>' + (S.boardName === 'wall' ? '這面牆' : '我的故事板') + '</h2>' +
      '<div>' + stt.filled + ' 格有內容・' + stt.withImg + ' 格有圖・' + stt.withRefs + ' 格有出處</div>' +
      '<div class="' + (mom ? 'ok' : 'warn') + '">' + (mom ? '已標出 ' + mom + ' 個關鍵時刻' : '還沒標出關鍵時刻（用一句話寫他在哪一刻最卡）') + '</div>' +
      '<h3>自己寫的程度（我當作者的格子）</h3><div id="ratio">自己寫 ' + cnt.own + ' 格・改寫 ' + cnt.rewrite + ' 格・照抄草稿 ' + cnt.copy + ' 格</div><div class="muted">草稿只是起點，改成你自己的話才算你的。</div>' +
      '<h3>合作成就</h3>' + ach.map(function (a) { return '<div class="ach ' + (a.got ? 'got' : '') + '" title="' + esc(a.desc) + '"><span>' + a.icon + '</span> <b>' + esc(a.name) + '</b> ' + (a.got ? '已拿到' : '<span class="muted">' + esc(a.desc) + '</span>') + '</div>'; }).join('');
  }

  /* ———— 儲存 ———— */
  function canWrite() { if (!SB.canWrite(S.mode)) { toast(SB.WHY_TEXT.readonly); return false; } return true; }
  function baseCell(n) { var o = cellFor(n); return o; }
  function commit(n, patch) {
    if (!canWrite()) return Promise.resolve();
    var o = cellFor(n), prev = o.virtual ? null : o.c, start = o.c;
    var next = SB.applyEdit(start, patch, S.sid, NOW());
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
      im.onload = function () { URL.revokeObjectURL(u); res(im); }; im.onerror = function () { URL.revokeObjectURL(u); rej(new Error('這個檔案打不開，請換一張圖（jpg、png、webp）')); }; im.src = u;
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
    if (!file || !/^image\//.test(file.type)) { toast('請選一張圖片檔'); return; }
    if (file.size > 25 * 1024 * 1024) { toast('這張圖太大了（超過 25 MB），請先縮小再選'); return; }
    toast('處理圖片中…', 8000);
    loadImg(file).then(function (im) {
      var full = encodeTo(im, SB.LIMITS.fullLong, SB.LIMITS.fullBytes), th = encodeTo(im, SB.LIMITS.thumbLong, SB.LIMITS.thumbBytes);
      if (!full.ok || !th.ok) throw new Error('這張圖壓不到可以存的大小，請換一張簡單一點的圖');
      var hadImg = !!cellFor(n).c.img;
      return S.store.reserve(S.sid).then(function (r) {
        if (!r.ok) { toast(SB.WHY_TEXT[r.reason]); return; }
        /* 格子還不存在（只是樣板）就先建起來，再放圖 */
        var o = cellFor(n), pre = o.virtual ? commit(n, { title: o.c.title }) : Promise.resolve();
        return pre.then(function () { return S.store.putImage(CODE, bkey(S.boardName), n, { full: full.url, thumb: th.url, w: full.w, h: full.h }); }).then(function () {
          S.full[bkey(S.boardName) + n] = full.url; S.saved = NOW(); toast('圖片放好了（' + Math.round(full.bytes / 1024) + ' KB）'); renderTop();
        }, function (e) { S.store.refund(S.sid); throw e; });
      });
    }).catch(function (e) { toast(e && e.message || '圖片上傳失敗'); });
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
        var base = o.c; var next = SB.applyEdit(base, { title: dc.title, who: dc.who, where: dc.where, what: dc.what, think: dc.think, refs: dc.refs, moment: dc.moment }, S.sid, NOW());
        next.draft = dc.draft; var r = SB.editRatio(next.draft, next); next.er = r === null ? null : { r: Math.round(r * 1000) / 1000, band: SB.band(r) };
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
    $('printBtn').onclick = doPrint;
    document.addEventListener('focusout', function () { flushAll(); setTimeout(function () { if (S.dirty && !(document.activeElement && $('cells').contains(document.activeElement))) renderAll(true); }, 50); });
    window.addEventListener('beforeunload', flushAll);
    var cells = $('cells');
    cells.addEventListener('input', function (e) { var t = e.target; if (t.classList.contains('f')) queueEdit(Number(t.dataset.n), t.dataset.k, t.value); });
    cells.addEventListener('focusin', function (e) { var t = e.target, n = Number(t.dataset.n || (t.closest('.cell') && t.closest('.cell').dataset.n)); if (n) { S.sel = n; S.lastField = t.dataset.k ? { n: n, el: t } : S.lastField; } });
    cells.addEventListener('change', function (e) {
      var t = e.target, n = Number(t.dataset.n);
      if (t.type === 'file') { if (t.files && t.files[0]) uploadFile(n, t.files[0]); t.value = ''; return; }
      if (t.dataset.act === 'moment') commit(n, { moment: t.checked }).then(function () { renderAll(true); });
      else if (t.dataset.act === 'addref' && t.value) { var o = cellFor(n); commit(n, { refs: o.c.refs.concat([t.value]).filter(function (v, i, a) { return a.indexOf(v) === i; }) }).then(function () { renderAll(true); }); }
    });
    cells.addEventListener('click', function (e) {
      var b = e.target.closest('button'); var card = e.target.closest('.cell'); if (card) S.sel = Number(card.dataset.n);
      if (e.target.closest('.img') && !b) { var im = e.target.closest('.img'); if (im.querySelector('img')) showFull(Number(im.dataset.n)); return; }
      if (!b) return; var n = Number(b.dataset.n), act = b.dataset.act;
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

  window.ERG_SB_UI = { state: S, boot: boot, renderAll: renderAll };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
