/* 痛點急診室：外殼（登入、選角色、大廳）。房間裡的遊戲在 room.js。
   資料層是本機（localStorage＋分頁間廣播），跨電腦同步與校信箱／Gmail 綁定要等新的獨立 Firebase 專案。 */
(function () {
  'use strict';
  var CORE = window.ERG_CORE, AV = window.ERG_AVATAR, CH = window.ERG_CHARS, CP = window.ERG_CHECKPOINTS, L = window.ERG_LOGIC;
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function sess() { var d = new Date(); function p(n) { return (n < 10 ? '0' : '') + n; } return 'ER-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()); }

  var data = CORE.makeData(window), DB = data.DB, ONLINE = false;
  /* 線上模式：有 Firebase 設定、SDK 載入成功、網址沒有 ?local=1 ⇒ 資料層換成 remote_db（同介面）。否則維持本機。 */
  (function () {
    try {
      if (/[?&]local=1/.test(location.search) || !window.ERG_FB || !window.firebase || !window.ERG_REMOTE) return;
      if (!firebase.apps || !firebase.apps.length) firebase.initializeApp(window.ERG_FB);
      var fdb = firebase.database(), root = fdb.ref('er/' + sess());
      DB = window.ERG_REMOTE.makeRemoteDb({ root: root, sess: sess(), deferred: true, notify: data.fire, log: function (m) { console.warn('[remote_db]', m); } });   /* deferred：登入後才掛監聽（規則要 auth） */
      data.DB = DB; ONLINE = true;
      /* 省流量：分頁被收到背景超過 3 分鐘就斷線，回到前景再連（免費方案同時連線上限 100） */
      var offT = null;
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) { offT = setTimeout(function () { try { fdb.goOffline(); } catch (e) {} }, 180000); }
        else { clearTimeout(offT); try { fdb.goOnline(); } catch (e) {} }
      });
      /* 連線狀態：給介面用（訪談面板看 daemon 心跳也靠它） */
      fdb.ref('.info/connected').on('value', function (s) { window.ERG_ONLINE_STATE = !!s.val(); data.fire('online'); });
      /* 代理程式節點很小：心跳、模型、liveNow（上課時段或老師手動開放才 true）。沒有 liveNow 欄位（舊版代理程式）視為開放 */
      fdb.ref('er/_daemon').on('value', function (s) { var d = s.val() || {}; window.ERG_DAEMON_HB = Number(d.heartbeat || 0); window.ERG_LIVE_OPEN = d.liveNow === undefined ? true : !!d.liveNow; data.fire('daemon'); });
    } catch (e) { console.error('Firebase 啟動失敗，改用本機資料層', e); DB = data.DB; ONLINE = false; }
  })();
  var CASELIST = window.ERG_CASES.build(window.ERG, window.ERG_LAYOUT, window.ERG_PERSONAS, window.ERG_DATA).list;
  function caseMeta(id) { for (var i = 0; i < CASELIST.length; i++) if (CASELIST[i].meta.id === id) return CASELIST[i].meta; return CASELIST[0].meta; }

  var APP = window.ERG_APP = { DB: DB, data: data, storage: data.storage, online: ONLINE, me: { sid: null, cls: null, profile: null }, SESS: sess(), $: $, esc: esc,
    CASELIST: CASELIST, caseMeta: caseMeta, enterLobby: enterLobby, show: show, lit: 0, evaluate: evaluateAll };

  function show(id) {
    ['login', 'avatar', 'lobby'].forEach(function (s) { $(s).classList.toggle('on', s === id); });
    $('game').classList.toggle('on', id === 'game');
  }

  /* ───── 檢核點（跨房間）───── */
  function markersByRoom() {
    var out = {};
    DB.listRooms(APP.SESS).forEach(function (r) {
      try { out[r.code] = L.listMarkers(DB.getScene(r.code).concat(CORE.mcardEls(DB.getRoom(r.code)))).map(function (m) { return { id: m.id, type: m.type, author: m.author, refs: m.refs }; }); } catch (e) { out[r.code] = []; }
    });
    return out;
  }
  function evaluateAll() {
    var sid = APP.me.sid; if (!sid) return null;
    var rooms = DB.listRooms(APP.SESS).map(function (r) { return DB.getRoom(r.code); });
    var mine = rooms.filter(function (r) { return String(r.host) === String(sid) && r.members && r.members[sid]; });
    var meta = mine.length ? caseMeta(mine[mine.length - 1].case || 'sms') : caseMeta('sms');
    var st = CORE.checkpointState(DB, APP.SESS, sid, APP.me.profile, markersByRoom(), meta);
    var ev = CP.evaluate(st);
    APP.lit = ev.lit;
    return { state: st, ev: ev, meta: meta };
  }

  /* ───── 登入 ─────
     線上模式：Google 登入（校信箱或 Gmail）→ 第一次要綁定姓名＋學號＋班級（存 er/users/{uid}）→ 之後只要登入。
     本機模式（?local=1，測試用）：直接填學號進入，沒有 Google。 */
  var AUTH = null, isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  function finishLogin(sid, cls, email, name, uid) {
    APP.me.sid = sid; APP.me.cls = cls; APP.me.email = email; APP.me.name = name || ''; APP.me.uid = uid || null;
    var prof = CORE.getProfile(APP.storage, sid);
    if (!prof) { var d = AV.defaultFor(sid); prof = { sid: sid, cls: cls, avatar: d, speed: '標準', chosen: false, sound: true }; }
    prof.cls = cls; prof.email = email; prof.name = name || prof.name || ''; APP.me.profile = prof; CORE.saveProfile(APP.storage, sid, prof);
    /* 線上模式：把學號、班級、信箱登記到 er/{sess}/profiles，老師頁面與審查寄信用 */
    if (ONLINE) { try { firebase.database().ref('er/' + APP.SESS + '/profiles/' + sid).update({ cls: cls, email: email, name: name || '', uid: uid || '', t: Date.now(), ua: isMobile ? 'mobile' : 'desktop' }); } catch (e) { console.warn(e); } }
    if (ONLINE && DB.attach) DB.attach();
    try { sessionStorage.setItem('erg2_sid', sid); sessionStorage.setItem('erg2_cls', cls); } catch (e) {}
    $('loginErr').textContent = '';
    if (!prof.chosen) openAvatar(true); else enterLobby();
  }
  function readBindForm() {
    var sid = $('sidInput').value.trim(), cls = $('clsInput').value, name = ($('nameInput') ? $('nameInput').value.trim() : '');
    if (!CORE.validSid(sid)) { $('loginErr').textContent = '學號要 3 到 16 個英文字母或數字'; return null; }
    if (ONLINE && !name) { $('loginErr').textContent = '請填姓名'; return null; }
    return { sid: sid, cls: cls, name: name };
  }
  function doLogin() {   /* 本機模式 */
    var f = readBindForm(); if (!f) return;
    var email = ($('emailInput') ? $('emailInput').value.trim() : '') || (f.sid.toLowerCase() + '@office.stust.edu.tw');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { $('loginErr').textContent = '信箱格式不對'; return; }
    finishLogin(f.sid, f.cls, email, f.name, null);
  }
  function setAuthUi(step) {   /* 'google' | 'bind' | 'local' */
    $('authStep').style.display = step === 'google' ? '' : 'none';
    $('bindForm').style.display = step === 'google' ? 'none' : '';
    $('emailLabel').style.display = step === 'local' ? '' : 'none';
    $('bindIntro').style.display = step === 'bind' ? '' : 'none';
    $('bindEmail').style.display = step === 'bind' ? '' : 'none';
    $('loginBtn').textContent = step === 'bind' ? '綁定並進入' : '進入';
    if ($('bindLogout')) $('bindLogout').style.display = step === 'bind' ? '' : 'none';   /* 登入錯帳號時可以直接換 */
  }
  function authMsg(t) { $('authMsg').textContent = t; }
  document.addEventListener('click', function (e) { var b = e.target && e.target.closest ? e.target.closest('[data-logout]') : null; if (b && $('logoutBtn')) $('logoutBtn').click(); });
  function explainAuth(e) {
    var c = (e && e.code) || '';
    authMsg(c === 'auth/operation-not-allowed' ? 'Google 登入還沒開通，請告訴老師。' :
      (c === 'auth/popup-blocked' || c === 'auth/popup-closed-by-user' || c === 'auth/cancelled-popup-request') ? '登入視窗被擋或被關掉了，再按一次會改用整頁跳轉登入。' :
      c === 'auth/unauthorized-domain' ? '這個網址還沒加進授權網域，請告訴老師。' :
      c === 'auth/network-request-failed' ? '網路連不上，請檢查連線後再試。' : ('登入失敗：' + (e && e.message ? e.message : e)));
    console.warn('auth', e);
  }
  if (ONLINE) {
    AUTH = firebase.auth(); setAuthUi('google');
    var provider = function () { var p = new firebase.auth.GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account' }); return p; };
    /* 登入方式（10-12 改）：手機也先用彈出視窗。整頁跳轉（redirect）在本站行不通——登入網域是 firebaseapp.com、網站在 github.io，
       手機 Chrome 與 Safari 會擋跨網域的登入資料，跳回來等於沒登入而且不報錯。跳轉只留作彈出視窗被擋時的備援，並記旗標以便回來後說明。 */
    var redirFail = false;
    var triedPopup = false, INAPP = /Line\/|FBAN|FBAV|FB_IAB|Instagram|MicroMessenger|; wv\)/i.test(navigator.userAgent);
    var inappMsg = '這是 App 內建的瀏覽器（例如 LINE、FB），Google 不允許在這裡登入。請點右上角選單「用預設瀏覽器開啟」，或把網址貼到 Chrome／Safari。';
    function goRedirect() { try { sessionStorage.setItem('erg_redir', '1'); } catch (e) {} AUTH.signInWithRedirect(provider()).catch(explainAuth); }
    if (INAPP) authMsg(inappMsg);
    $('googleBtn').onclick = function () {
      if (INAPP) { authMsg(inappMsg); return; }
      authMsg('登入中…（會跳出 Google 的視窗）');
      if (triedPopup) { goRedirect(); return; }
      triedPopup = true;
      AUTH.signInWithPopup(provider()).catch(function (e) { var c = (e && e.code) || ''; if (c === 'auth/popup-blocked' || c === 'auth/operation-not-supported-in-this-environment') goRedirect(); else explainAuth(e); });
    };
    var redirBack = false; try { redirBack = sessionStorage.getItem('erg_redir') === '1'; sessionStorage.removeItem('erg_redir'); } catch (e) {}
    AUTH.getRedirectResult().then(function (r) { if (redirBack && !(r && r.user) && !AUTH.currentUser) { redirFail = true; authMsg('跳轉登入在這個瀏覽器沒有成功（瀏覽器擋了跨網站的登入資料）。請再按一次登入並允許彈出視窗；還是不行就改用 Chrome 或 Safari 開這個網址。'); } }).catch(explainAuth);
    if (/[?&]anon=1/.test(location.search)) AUTH.signInAnonymously().catch(explainAuth);   /* 測試用：匿名帳號走綁定流程 */
    /* 測試用（只在本機伺服器有效）：?devsid=XXX 直接以該學號進入線上模式，不經 Google */
    var devsid = (location.search.match(/[?&]devsid=([A-Za-z0-9_-]{3,16})/) || [])[1];
    if (devsid && /^(127\.0\.0\.1|localhost)$/.test(location.hostname)) { var go = function () { finishLogin(devsid, '其他', devsid.toLowerCase() + '@test.local', '測試' + devsid, (AUTH.currentUser || {}).uid || null); }; AUTH.signInAnonymously().then(go, function () { go(); }); }
    AUTH.onAuthStateChanged(function (user) {
      if (!user) { setAuthUi('google'); if (!INAPP && !redirFail && !redirBack) authMsg(''); show('login'); return; }
      var email = user.email || ('anon-' + user.uid.slice(0, 6) + '@test.local');
      firebase.database().ref('er/users/' + user.uid).once('value', function (s) {
        var rec = s.val();
        if (rec && rec.sid) { finishLogin(rec.sid, rec.cls || '其他', email, rec.name, user.uid); return; }
        setAuthUi('bind'); $('bindEmail').textContent = '登入帳號：' + email;
        if ($('nameInput') && !$('nameInput').value) $('nameInput').value = user.displayName || '';
        if (!$('sidInput').value && /^[a-z0-9]+@office\.stust\.edu\.tw$/i.test(email)) $('sidInput').value = email.split('@')[0];
        /* 老師自己用前台：自動帶老師的綁定值（也可以改） */
        if (email === 'scatjay@gmail.com') { if (!$('sidInput').value) $('sidInput').value = 'TEACHER'; if (!$('nameInput').value) $('nameInput').value = '楊老師'; $('clsInput').value = '其他'; }
        $('loginBtn').onclick = function () {
          var f = readBindForm(); if (!f) return;
          var rec2 = { sid: f.sid, name: f.name, cls: f.cls, email: email, t: Date.now() };
          firebase.database().ref('er/users/' + user.uid).set(rec2).then(function () {
            firebase.database().ref('er/sidIndex/' + f.sid).set({ uid: user.uid, email: email, name: f.name, t: rec2.t });
            finishLogin(f.sid, f.cls, email, f.name, user.uid);
          }).catch(function (e) { $('loginErr').textContent = '綁定失敗：' + e.message; });
        };
      }, function (e) { $('loginErr').textContent = '讀取綁定資料失敗：' + e.message; setAuthUi('bind'); });
    });
    $('logoutBtn').onclick = function () { try { sessionStorage.removeItem('erg2_sid'); } catch (e) {} APP.me = { sid: null, cls: null, profile: null }; AUTH.signOut().then(function () { show('login'); }); };
  } else {
    setAuthUi('local');
    $('loginBtn').onclick = doLogin;
    $('sidInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); });
    $('logoutBtn').onclick = function () { try { sessionStorage.removeItem('erg2_sid'); } catch (e) {} APP.me = { sid: null, cls: null, profile: null }; show('login'); };
    try { var s0 = sessionStorage.getItem('erg2_sid'); if (s0) { $('sidInput').value = s0; $('clsInput').value = sessionStorage.getItem('erg2_cls') || '二甲'; var p0 = CORE.getProfile(APP.storage, s0); if (p0 && p0.email && $('emailInput')) $('emailInput').value = p0.email; setTimeout(doLogin, 0); } } catch (e) {}
    /* 打學號時自動帶出校信箱；學生要改 Gmail 再自己改 */
    if ($('emailInput')) $('sidInput').addEventListener('input', function () { var e = $('emailInput'); if (!e.dataset.touched) e.value = $('sidInput').value.trim().toLowerCase() + '@office.stust.edu.tw'; });
    if ($('emailInput')) $('emailInput').addEventListener('input', function () { $('emailInput').dataset.touched = '1'; });
  }

  /* ───── 選角色 ───── */
  var avDraft = null, avFirst = false;
  function charSvg(look, i, mood) { return CH.character(AV.toCharLook(look), { seed: i || 3, mood: mood || 'idle', size: 1.25 }); }
  function openAvatar(first) {
    avFirst = !!first; var ev = evaluateAll(); APP.lit = ev ? ev.ev.lit : 0;
    avDraft = CORE.clone(APP.me.profile.avatar); show('avatar'); renderAvatar();
  }
  function renderAvatar() {
    var look = avDraft.look, lit = APP.lit;
    $('avPreview').innerHTML = charSvg(look, 7) + '<div style="font-weight:900;margin-top:4px">' + esc(APP.me.sid) + '</div>';
    $('avGrid').innerHTML = AV.PRESETS.map(function (p, i) {
      return '<button class="avCard' + (avDraft.preset === p.id ? ' on' : '') + '" data-preset="' + p.id + '">' + charSvg(p.look, i + 1) + '<div style="font-size:12px;font-weight:900">' + esc(p.name) + '</div></button>';
    }).join('');
    Array.prototype.forEach.call($('avGrid').querySelectorAll('[data-preset]'), function (b) {
      b.onclick = function () { var p = AV.preset(b.getAttribute('data-preset')); avDraft = { preset: p.id, look: CORE.clone(p.look) }; renderAvatar(); };
    });
    var html = '';
    ['head', 'body', 'hair', 'eyes', 'mouth', 'prop'].forEach(function (part) {
      html += '<div><div style="font-size:13px;font-weight:900">' + AV.LABEL[part] + '</div><div class="partRow">' +
        AV.options(part, lit).map(function (o) {
          return '<button class="opt pill' + (look[part] === o.value ? ' on' : '') + (o.locked ? ' lock' : '') + '" data-part="' + part + '" data-val="' + esc(o.value) + '"' + (o.locked ? ' disabled title="點亮 ' + o.unlockAt + ' 個檢核點解鎖"' : '') + '>' + esc(o.name) + (o.locked ? ' 🔒' : '') + '</button>';
        }).join('') + '</div></div>';
    });
    [['skin', '膚色'], ['outfit', '衣服顏色']].concat(look.hair === 'cap' ? [['capColor', '帽子顏色']] : []).forEach(function (pc) {
      html += '<div><div style="font-size:13px;font-weight:900">' + pc[1] + '</div><div class="partRow">' + AV.options(pc[0], lit).map(function (o) {
        return '<button class="sw' + (look[pc[0]] === o.value ? ' on' : '') + '" style="background:' + o.value + (o.locked ? ';opacity:.35' : '') + '" data-part="' + pc[0] + '" data-val="' + esc(o.value) + '"' + (o.locked ? ' disabled' : '') + ' aria-label="' + pc[1] + ' ' + o.value + '"></button>';
      }).join('') + '</div></div>';
    });
    $('avParts').innerHTML = html;
    Array.prototype.forEach.call($('avParts').querySelectorAll('[data-part]'), function (b) {
      b.onclick = function () { try { avDraft.look = AV.set(avDraft.look, b.getAttribute('data-part'), b.getAttribute('data-val'), lit); avDraft.preset = ''; $('avErr').textContent = ''; renderAvatar(); } catch (e) { $('avErr').textContent = e.message; } };
    });
    var next = AV.UNLOCKS.filter(function (u) { return lit < u.need; })[0];
    $('avUnlockInfo').textContent = '已點亮 ' + lit + ' 個檢核點' + (next ? '；再點亮到 ' + next.need + ' 個會解鎖「' + next.label + '」' : '；外觀全部解鎖');
  }
  $('avRandom').onclick = function () { avDraft = { preset: '', look: AV.randomize(String(Date.now()), APP.lit) }; renderAvatar(); };
  $('avDone').onclick = function () {
    var v = AV.validate(avDraft.look, APP.lit); if (!v.ok) { $('avErr').textContent = v.errors[0].msg; return; }
    APP.me.profile.avatar = avDraft; APP.me.profile.chosen = true; CORE.saveProfile(APP.storage, APP.me.sid, APP.me.profile); enterLobby();
  };
  $('avatarBtn').onclick = function () { openAvatar(false); };

  /* ───── 大廳 ───── */
  function enterLobby() {
    if (window.ERG_ROOM && window.ERG_ROOM.leave) window.ERG_ROOM.leave(true);
    show('lobby'); $('whoami').textContent = (APP.me.name ? APP.me.name + '・' : '') + APP.me.sid + '　' + APP.me.cls; $('sessLabel').textContent = APP.SESS;
    if (!$('dowSel').children.length) { var td = window.ERG_CALENDAR.fromDate(new Date()); $('dowSel').innerHTML = window.ERG_CALENDAR.NAMES.map(function (n, i) { return '<option value="' + i + '"' + (i === td ? ' selected' : '') + '>' + n + (i >= 5 ? '（週末休息）' : '') + '</option>'; }).join(''); }
    if (!$('caseSel').children.length) $('caseSel').innerHTML = CASELIST.map(function (c) { return '<option value="' + esc(c.meta.id) + '">' + esc(c.meta.name) + '（' + esc(c.meta.short) + '）</option>'; }).join('');
    renderLobby();
  }
  function renderLobby() {
    var e = evaluateAll(), box = $('progressBox');
    if (e) {
      var first = e.ev.list.filter(function (x) { return !x.ok; })[0];
      box.innerHTML = '<div class="row"><b style="flex:1">我的檢核點　' + e.ev.lit + ' / ' + e.ev.total + (e.ev.passed ? '　<span class="tag ok">全部完成</span>' : '') + '</b></div>' +
        '<div class="dots" style="margin:6px 0">' + e.ev.list.map(function (x) { return '<i class="' + (x.ok ? 'lit' : '') + '" title="' + esc(x.label) + '" style="width:20px;height:20px"></i>'; }).join('') + '</div>' +
        e.ev.list.map(function (x) { return '<div style="font-size:13px">' + (x.ok ? '✔' : '＿') + ' <b>' + x.id + ' ' + esc(x.label) + '</b>　<span class="muted">' + esc(x.detail) + '</span></div>'; }).join('') +
        (first ? '<div class="muted" style="margin-top:6px;font-size:13px">下一步：' + esc(first.label) + '</div>' : '');
    }
    var rooms = DB.listRooms(APP.SESS), tb = $('roomRows'); tb.innerHTML = '';
    rooms.forEach(function (r) {
      var full = DB.getRoom(r.code), mine = full.members && full.members[APP.me.sid];
      var tr = document.createElement('tr');
      tr.innerHTML = '<td><b>' + esc(r.code) + '</b>' + (mine ? ' <span class="tag">我在裡面</span>' : '') + '</td><td>' + esc(caseMeta(full.case || 'sms').name) + '・' + (full.shift === 'night' ? '夜班' : '日班') + '</td><td>' + esc(r.host) + '</td><td>' + r.count + '/4</td><td></td>';
      var b = document.createElement('button'); b.className = 'ghost'; b.textContent = mine ? '回去' : (r.count >= 4 ? '旁觀' : '加入');
      b.onclick = function () { joinCode(r.code); }; tr.lastChild.appendChild(b); tb.appendChild(tr);
    });
    $('noRooms').style.display = tb.children.length ? 'none' : 'block';
  }
  $('createBtn').onclick = function () {
    var r = DB.createRoom(APP.SESS, APP.me.sid); DB.patchRoom(r.code, { case: $('caseSel').value, dow: Number($('dowSel').value), shift: $('shiftSel').value || 'day' }); openRoom(r.code);
  };
  $('joinBtn').onclick = function () { joinCode($('codeInput').value.trim().toUpperCase()); };
  function joinCode(code) { try { $('lobbyErr').textContent = ''; openRoom(code); } catch (e) { $('lobbyErr').textContent = e.message; } }
  function openRoom(code) { window.ERG_ROOM.enter(code); }
  data.listeners.push(function (topic) { if (topic === 'lobby' && $('lobby').classList.contains('on')) renderLobby(); });

  /* 成就：①頁面可見且在房間裡，每分鐘 playMin +1；②把自己的指標摘要寫到 er/{sess}/score/{sid}（小節點，全班可讀、排行用），內容沒變就不寫 */
  var lastScoreJson = '';
  function publishScore() {
    var R = window.ERG_ROOM, c = R && R.cur, A = window.ERG_ACH, P = window.ERG_PANELS;
    if (!ONLINE || !window.firebase || !c || !A || !APP.me.sid) return;
    ensureScoreWatch();
    var s = A.summary(c.player, P && P.achCtx ? P.achCtx() : {}); s.name = APP.me.name || APP.me.sid; s.cls = APP.me.cls || ''; s.t = Date.now();
    var j = JSON.stringify([s.interviewees, s.rooms, s.cards, s.events, s.chatTurns, s.playMin, s.partners, s.conclusions, s.badges]);
    if (j === lastScoreJson) return; lastScoreJson = j;
    try { window.firebase.database().ref('er/' + APP.SESS + '/score/' + APP.me.sid).set(s); } catch (e) { if (window.console) console.warn('score 寫入失敗', e); }
  }
  window.ERG_PUBLISH_SCORE = publishScore;
  setInterval(function () {
    var R = window.ERG_ROOM, c = R && R.cur; if (!c || document.hidden) return;
    c.player.playMin = (Number(c.player.playMin) || 0) + 1; if (R.persist) R.persist(true); publishScore();
  }, 60000);
  var scoreRef = null;
  function ensureScoreWatch() {
    if (scoreRef || !ONLINE || !window.firebase || !APP.me.sid) return;
    scoreRef = window.firebase.database().ref('er/' + APP.SESS + '/score');
    scoreRef.on('value', function (snap) { window.ERG_SCORES = snap.val() || {}; var R = window.ERG_ROOM; if (R && R.cur && R.cur.tab === 'ach' && window.ERG_PANELS) window.ERG_PANELS.renderAch(); });
  }
  window.ERG_ENSURE_SCORE_WATCH = ensureScoreWatch;

  window.__ERG_DEBUG = { APP: APP, DB: DB };
})();
