/* 痛點急診室：外殼（登入、選角色、大廳）。房間裡的遊戲在 room.js。
   資料層是本機（localStorage＋分頁間廣播），跨電腦同步與校信箱／Gmail 綁定要等新的獨立 Firebase 專案。 */
(function () {
  'use strict';
  /* 10-13：任何一支程式檔沒載到（網路不穩時會發生），整頁會壞掉而且沒有任何訊息。先檢查，缺了就請使用者重新整理。 */
  (function () {
    var need = ['ERG_CORE', 'ERG_AVATAR', 'ERG_CHARS', 'ERG_CHECKPOINTS', 'ERG_LOGIC', 'ERG_CASES', 'ERG_LAYOUT', 'ERG_PERSONAS', 'ERG_DATA'], miss = need.filter(function (k) { return !window[k]; });
    if (!miss.length) return;
    var d = document.createElement('div'); d.id = 'loadFail'; d.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:#fff;color:var(--ink-fixed);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:24px;text-align:center;font-size:var(--fs-4)';
    d.innerHTML = '<b>頁面沒有載入完整</b><div>可能是網路不穩。請按下面的按鈕重新整理。</div>'; var b = document.createElement('button'); b.textContent = '重新整理'; b.onclick = function () { location.reload(); }; d.appendChild(b);
    (document.body || document.documentElement).appendChild(d); if (window.console) console.error('缺少程式檔：' + miss.join(', '));
    throw new Error('頁面沒有載入完整：' + miss.join(', '));
  })();
  var CORE = window.ERG_CORE, AV = window.ERG_AVATAR, CH = window.ERG_CHARS, CP = window.ERG_CHECKPOINTS, L = window.ERG_LOGIC;
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  /* 這個單元（衛教簡訊微專題）三個班、三週共用同一個場次，進度才能跨天接著做。
     10-13 以前是「每天一個場次」：隔天大廳就看不到前一天的房間、檢核點歸零。下一個單元要重新開始時改這個值（資料庫規則只允許 ER-八位數字）。
     老師後台 teacher.html 與 tools/er_ops.py 也用同一個值，要一起改。 */
  var UNIT_SESS = 'ER-20261013';
  function sess() {
    /* 測試用（只在本機伺服器有效）：?tsess=NAME ⇒ 場次 ER-TEST-NAME。測試開的房間、聊天、名單都不會出現在當天上課的場次裡。 */
    var ts = (location.search.match(/[?&]tsess=([A-Za-z0-9]{1,12})/) || [])[1];
    if (ts && /^(127\.0\.0\.1|localhost)$/.test(location.hostname)) return 'ER-TEST-' + ts;
    return UNIT_SESS;
  }

  var data = CORE.makeData(window), DB = data.DB, ONLINE = false;
  /* 線上模式：有 Firebase 設定、SDK 載入成功、網址沒有 ?local=1 ⇒ 資料層換成 remote_db（同介面）。否則維持本機。 */
  (function () {
    try {
      if (/[?&]local=1/.test(location.search) || !window.ERG_FB || !window.firebase || !window.ERG_REMOTE) return;
      if (!firebase.apps || !firebase.apps.length) firebase.initializeApp(window.ERG_FB);
      var fdb = firebase.database(), root = fdb.ref('er/' + sess());
      DB = window.ERG_REMOTE.makeRemoteDb({ root: root, sess: sess(), deferred: true, notify: data.fire, log: function (m) { if (/🔴/.test(m)) console.error('[remote_db]', m); else console.warn('[remote_db]', m); }, me: function () { var A = window.ERG_APP; return A && A.me ? A.me.sid : null; } });   /* deferred：登入後才掛監聽（規則要 auth） */
      data.DB = DB; ONLINE = true;
      /* 省連線：分頁被收到背景超過 60 秒就斷線，回到前景再連（免費方案同時連線上限 100；手機切去別的 App 也算背景） */
      var offT = null;
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) { offT = setTimeout(function () { try { fdb.goOffline(); } catch (e) {} }, 60000); }
        else { clearTimeout(offT); if (!window.ERG_KICKED) { try { fdb.goOnline(); } catch (e) {} } }
      });
      /* 連線狀態：給介面用（訪談面板看 daemon 心跳也靠它） */
      fdb.ref('.info/connected').on('value', function (s) { window.ERG_ONLINE_STATE = !!s.val(); data.fire('online'); });
      /* 代理程式節點很小：心跳、模型、liveNow（上課時段或老師手動開放才 true）。沒有 liveNow 欄位（舊版代理程式）視為開放 */
      /* 10-19：只聽四個很小的欄位（心跳、liveNow、上限原因與一句話），不再聽整個 er/_daemon；guard 其他欄位（花費、觸發次數…）只給老師後台，免得每 15 秒推給每位學生 */
      var dm = { liveNow: undefined, reason: '', msg: '' }, dmGot = {};
      function pushDaemon() { window.ERG_DAEMON_HB = Number(dm.heartbeat || 0); window.ERG_LIVE_OPEN = dm.liveNow === undefined ? true : !!dm.liveNow; window.ERG_LIVE_GUARD = (dm.reason === 'day_cap' || dm.reason === 'week_cap') ? { reason: dm.reason, msg: String(dm.msg || '') } : null; data.fire('daemon'); }
      [['heartbeat', 'er/_daemon/heartbeat'], ['liveNow', 'er/_daemon/liveNow'], ['reason', 'er/_daemon/guard/reason'], ['msg', 'er/_daemon/guard/msg']].forEach(function (kv) {
        fdb.ref(kv[1]).on('value', function (s) { var v = s.val(); dm[kv[0]] = (v === null && kv[0] === 'liveNow') ? undefined : v; dmGot[kv[0]] = 1; if (dmGot.heartbeat && dmGot.liveNow) pushDaemon(); /* 心跳與 liveNow 都到了才通知，避免先閃一下「連不上」 */ });
      });
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
      var full = null; try { full = DB.getRoom(r.code); } catch (e) {}
      if (!full || !full.members || !full.members[APP.me.sid]) return;      /* 別人的房間不必讀畫布（也就不會去訂閱它） */
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
    claimDevice(sid, function () { if (!prof.chosen) openAvatar(true); else enterLobby(); });
  }

  /* ───── 同一個帳號一次只能在一個地方使用（楊老師 10-12 裁示）─────
     er/{場次}/active/{學號} = { dev, ua, t }。dev 是這個分頁的代號（存在 sessionStorage，重新整理不變）。
     進來時如果別的 dev 還在，就問要不要改用這裡；改用之後，另一邊的監聽會看到 dev 換人，自己停下來（斷線、不再存檔）。
     斷線時由伺服器把節點拿掉（onDisconnect），所以節點還在＝另一邊真的還連著。 */
  var DEV = (function () { var d = null; try { d = sessionStorage.getItem('erg_dev'); if (!d) { d = Math.random().toString(36).slice(2, 10); sessionStorage.setItem('erg_dev', d); } } catch (e) {} return d || Math.random().toString(36).slice(2, 10); })();
  var activeRef = null, KICKED = false;
  function sysOverlay(html) {
    var o = $('sysOverlay');
    if (!o) { o = document.createElement('div'); o.id = 'sysOverlay'; o.style.cssText = 'position:fixed;inset:0;z-index:2147483600;background:rgba(16,25,31,.78);display:flex;align-items:center;justify-content:center;padding:16px'; document.body.appendChild(o); }
    o.innerHTML = '<div class="card" style="max-width:440px;width:100%;margin:0">' + html + '</div>'; o.style.display = 'flex'; return o;
  }
  function hideOverlay() { var o = $('sysOverlay'); if (o) o.style.display = 'none'; }
  /* 10-13 楊老師：「我的帳號讓我可以多個地方登入」（上課時投影、手機、另一台電腦同時開）。
     只認登入的 Google 信箱，不認學號——學生把學號打成 TEACHER 也沒用。這些帳號不登記 active：不會把別台踢掉，也不會被踢。
     代價：兩台同時在同一間房操作時，後存的會蓋掉先存的（位置、筆記）。 */
  var MULTI_LOGIN = ['scatjay@gmail.com'];
  function multiLoginOk() { try { var u = firebase.auth().currentUser; return !!(u && u.email && MULTI_LOGIN.indexOf(String(u.email).toLowerCase()) >= 0); } catch (e) { return false; } }
  function claimDevice(sid, proceed) {
    if (!ONLINE || multiLoginOk()) { proceed(); return; }
    var fdb = firebase.database(); activeRef = fdb.ref('er/' + APP.SESS + '/active/' + sid);
    function mine() { return { dev: DEV, ua: isMobile ? 'mobile' : 'desktop', t: firebase.database.ServerValue.TIMESTAMP }; }
    function take() {
      hideOverlay();
      activeRef.onDisconnect().remove(); activeRef.set(mine());
      activeRef.on('value', function (s) {
        var v = s.val(); if (KICKED) return;
        if (v && v.dev && v.dev !== DEV) { kicked(); return; }
        if (!v && window.ERG_ONLINE_STATE !== false) { activeRef.onDisconnect().remove(); activeRef.set(mine()); }   /* 斷線重連後節點被伺服器拿掉了：重新登記 */
      });
      proceed();
    }
    activeRef.once('value').then(function (s) {
      var v = s.val();
      if (v && v.dev && v.dev !== DEV) {
        sysOverlay('<b style="font-size:var(--fs-4)">這個帳號已經在另一個地方開著</b><p style="margin:8px 0">另一邊是' + (v.ua === 'mobile' ? '手機' : '電腦') + '。同一個帳號一次只能在一個地方使用。</p>' +
          '<div class="row"><button id="devTake">改用這裡</button><button class="ghost" id="devCancel">取消</button></div><p class="muted" style="font-size:var(--fs-1);margin:8px 0 0">按「改用這裡」之後，另一邊會停下來，並顯示「已在別的地方登入」。進度存在雲端，不會不見。</p>');
        $('devTake').onclick = take; $('devCancel').onclick = function () { hideOverlay(); if ($('logoutBtn')) $('logoutBtn').click(); };
      } else take();
    }, function () { take(); });
  }
  function kicked() {
    KICKED = true; window.ERG_KICKED = true;
    var fdb = firebase.database(), off = function () { try { fdb.goOffline(); } catch (e) {} };
    /* 先取消「斷線時刪除」再斷線：那個節點現在是另一邊的，不能被這一邊斷線時順手刪掉 */
    try { activeRef.off(); activeRef.onDisconnect().cancel(off); } catch (e) { off(); }
    setTimeout(off, 1500);
    sysOverlay('<b style="font-size:var(--fs-4)">這個帳號剛剛在另一個地方登入了</b><p style="margin:8px 0">同一個帳號一次只能在一個地方使用，所以這裡已經停止，不會再存檔。你的進度在雲端，另一邊接著做就可以。</p><div class="row"><button id="devBack">改回這裡使用</button></div>');
    $('devBack').onclick = function () { location.reload(); };
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
      (c === 'auth/popup-blocked' || c === 'auth/popup-closed-by-user' || c === 'auth/cancelled-popup-request') ? (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ? '登入視窗被擋或被關掉了。請再按一次「用 Google 登入」，等視窗跳出來選帳號。' : '登入視窗被擋或被關掉了，再按一次會改用整頁跳轉登入。') :
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
    var PHONE = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    var popupHelp = '瀏覽器擋住了 Google 的登入視窗。請再按一次「用 Google 登入」。還是沒有跳出來：iPhone 到「設定 → Safari」把「阻擋彈出式視窗」關掉再回來按，或改用 Chrome 開這個網址。';
    if (INAPP) authMsg(inappMsg);
    $('googleBtn').onclick = function () {
      if (INAPP) { authMsg(inappMsg); return; }
      authMsg('登入中…（會跳出 Google 的視窗）');
      /* 10-13 上課中 iPhone 實際發生：第二次按登入會改走整頁跳轉，iPhone 跳到 Google 的錯誤頁「Unable to process request due to missing initial state」就卡住。
         手機一律不走整頁跳轉（本站跨網域，跳轉在手機上本來就不會成功）；視窗被擋就說明怎麼打開，讓他再按一次。電腦才保留跳轉當備援。 */
      if (triedPopup && !PHONE) { goRedirect(); return; }
      triedPopup = true;
      AUTH.signInWithPopup(provider()).catch(function (e) { var c = (e && e.code) || ''; if (c === 'auth/popup-blocked' || c === 'auth/operation-not-supported-in-this-environment') { if (PHONE) authMsg(popupHelp); else goRedirect(); } else explainAuth(e); });
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
          var idxRef = firebase.database().ref('er/sidIndex/' + f.sid);
          $('loginBtn').disabled = true;
          idxRef.once('value').then(function (ix) {
            var o = ix.val();
            if (o && o.uid && o.uid !== user.uid) {      /* 這個學號已經綁在別的 Google 帳號上：多半是打錯學號，或是之前用另一個帳號登入過 */
              var em = String(o.email || ''), at = em.indexOf('@'), masked = at > 2 ? em.slice(0, 2) + '***' + em.slice(at) : '另一個帳號';
              $('loginErr').textContent = '學號 ' + f.sid + ' 已經綁在 ' + masked + '。請確認學號有沒有打錯；如果那是你之前用過的帳號，請登出後改用它登入，或請老師解除綁定。';
              $('loginBtn').disabled = false; return null;
            }
            return firebase.database().ref('er/users/' + user.uid).set(rec2).then(function () {
              idxRef.set({ uid: user.uid, email: email, name: f.name, t: rec2.t });
              $('loginBtn').disabled = false; finishLogin(f.sid, f.cls, email, f.name, user.uid);
            });
          }).catch(function (e) { $('loginBtn').disabled = false; $('loginErr').textContent = '綁定失敗：' + e.message; });
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
  APP.progress = function () { var pr = (APP.me && APP.me.profile && APP.me.profile.progress) || {}; return { lit: APP.lit || 0, badges: pr.badges || 0, ask: pr.ask || 1, ctx: pr.ctx || 1 }; };
  function openAvatar(first) {
    avFirst = !!first; var ev = evaluateAll(); APP.lit = ev ? ev.ev.lit : 0;
    avDraft = CORE.clone(APP.me.profile.avatar); show('avatar'); renderAvatar();
  }
  function renderAvatar() {
    var look = avDraft.look, lit = APP.progress ? APP.progress() : APP.lit, litN = AV.prog(lit).lit;
    window.ERG_AVATAR_DRAFT = avDraft; setTimeout(function () { if (window.ERG_AVATAR3D) window.ERG_AVATAR3D.render(avDraft); }, 0);   /* 3D 視圖（?view=3d）的角色預覽用；沒載入 view3d.js 時沒有作用 */
    $('avPreview').innerHTML = charSvg(look, 7) + '<div style="font-weight:900;margin-top:4px">' + esc(APP.me.sid) + '</div>';
    $('avGrid').innerHTML = AV.PRESETS.map(function (p, i) {
      return '<button class="avCard' + (avDraft.preset === p.id ? ' on' : '') + '" data-preset="' + p.id + '">' + charSvg(p.look, i + 1) + '<div style="font-size:var(--fs-1);font-weight:900">' + esc(p.name) + '</div></button>';
    }).join('');
    Array.prototype.forEach.call($('avGrid').querySelectorAll('[data-preset]'), function (b) {
      b.onclick = function () { var p = AV.preset(b.getAttribute('data-preset')); avDraft = { preset: p.id, look: CORE.clone(p.look) }; renderAvatar(); };
    });
    var html = '';
    ['head', 'body', 'hair', 'eyes', 'mouth', 'prop', 'pattern', 'cheek'].forEach(function (part) {
      html += '<div><div style="font-size:var(--fs-2);font-weight:900">' + AV.LABEL[part] + '</div><div class="partRow">' +
        AV.options(part, lit).map(function (o) {
          return '<button class="opt pill' + (look[part] === o.value ? ' on' : '') + (o.locked ? ' lock' : '') + '" data-part="' + part + '" data-val="' + esc(o.value) + '"' + (o.locked ? ' disabled title="' + esc(o.hint) + '"' : '') + '>' + esc(o.name) + (o.locked ? ' 🔒' : '') + '</button>';
        }).join('') + '</div></div>';
    });
    [['skin', '膚色'], ['outfit', '衣服顏色']].concat(look.hair === 'cap' || look.hair === 'beanie' ? [['capColor', '帽子顏色']] : []).concat(['bun', 'pony', 'long', 'spiky'].indexOf(look.hair) >= 0 ? [['hairColor', '髮色']] : []).forEach(function (pc) {
      html += '<div><div style="font-size:var(--fs-2);font-weight:900">' + pc[1] + '</div><div class="partRow">' + AV.options(pc[0], lit).map(function (o) {
        return '<button class="sw' + (look[pc[0]] === o.value ? ' on' : '') + '" style="background:' + o.value + (o.locked ? ';opacity:.35' : '') + '" data-part="' + pc[0] + '" data-val="' + esc(o.value) + '"' + (o.locked ? ' disabled' : '') + ' aria-label="' + pc[1] + ' ' + o.value + '"></button>';
      }).join('') + '</div></div>';
    });
    $('avParts').innerHTML = html;
    Array.prototype.forEach.call($('avParts').querySelectorAll('[data-part]'), function (b) {
      b.onclick = function () { try { avDraft.look = AV.set(avDraft.look, b.getAttribute('data-part'), b.getAttribute('data-val'), lit); avDraft.preset = ''; $('avErr').textContent = ''; renderAvatar(); } catch (e) { $('avErr').textContent = e.message; } };
    });
    var P = AV.prog(lit), left = AV.UNLOCKS.filter(function (u) { return !AV.met(u, P); }), next = left[0];
    $('avUnlockInfo').textContent = '已點亮 ' + P.lit + ' 個檢核點、拿到 ' + P.badges + ' 個成就、探問 Lv.' + P.ask + '、情境感知 Lv.' + P.ctx + (left.length ? '；還有 ' + left.length + ' 個外觀沒解鎖，例如「' + next.label + '」（' + AV.hint(next).replace('才能用', '解鎖') + '）' : '；外觀全部解鎖');
  }
  $('avRandom').onclick = function () { avDraft = { preset: '', look: AV.randomize(String(Date.now()), APP.progress ? APP.progress() : APP.lit) }; renderAvatar(); };
  $('avDone').onclick = function () {
    var v = AV.validate(avDraft.look, APP.progress ? APP.progress() : APP.lit); if (!v.ok) { $('avErr').textContent = v.errors[0].msg; return; }
    APP.me.profile.avatar = avDraft; APP.me.profile.chosen = true; CORE.saveProfile(APP.storage, APP.me.sid, APP.me.profile); enterLobby();
  };
  $('avatarBtn').onclick = function () { openAvatar(false); };

  /* ───── 大廳 ───── */
  function enterLobby() {
    if (window.ERG_ROOM && window.ERG_ROOM.leave) window.ERG_ROOM.leave(true);
    show('lobby'); $('whoami').textContent = (APP.me.name ? APP.me.name + '・' : '') + APP.me.sid + '　' + APP.me.cls; $('sessLabel').textContent = APP.SESS;
    if (!$('dowSel').children.length) { var td = window.ERG_CALENDAR.fromDate(new Date()); $('dowSel').innerHTML = window.ERG_CALENDAR.NAMES.map(function (n, i) { return '<option value="' + i + '"' + (i === td ? ' selected' : '') + '>' + n + (i >= 5 ? '（週末休息）' : '') + '</option>'; }).join(''); }
    if (!$('caseSel').children.length) $('caseSel').innerHTML = CASELIST.map(function (c, i) { return '<option value="' + esc(c.meta.id) + '" title="' + esc(c.meta.name) + '">' + (i + 1) + '. ' + esc(c.meta.short) + '</option>'; }).join('');   /* 10-12：選單用「編號. 短名」，長名稱在手機會被切掉 */
    /* 10-16：案例共 N 種，每次進大廳隨機先選一種（避免大家都只進第一種），旁邊寫明共幾種、可以自己換 */
    (function () { var sel = $('caseSel'), n = CASELIST.length; if (!sel || !n) return; sel.selectedIndex = Math.floor(Math.random() * n);
      var h = $('caseHint'); if (!h) { h = document.createElement('div'); h.id = 'caseHint'; h.className = 'muted'; h.style.cssText = 'font-size:var(--fs-2);margin:2px 0 4px'; sel.parentNode.parentNode.insertBefore(h, sel.parentNode.nextSibling); }
      h.textContent = '案例共 ' + n + ' 種（每次進來先隨機選一種，可以自己換），每一種的人物、線索和結論都不一樣。'; })();
    renderLobby();
  }
  /* ───── 第 2 週（2/3）：檢核點＋給你的指引＋回應指引（10-19 楊老師；檢核規則在 week2.js） ─────
     指引：er/{場次}/guide/{學號}（tools/er_guide_publish.py 發布，不含姓名）；回應：er/{場次}/guideResp/{學號} = { a, b, c, t }。
     兩個都只在進大廳時各讀一次（不訂閱），送出時寫一次。 */
  var GUIDE = { loaded: false, busy: false, g: null, r: null, h: null, sid: '' };
  function loadGuide() {
    var sid = APP.me.sid; if (!sid || !ONLINE || GUIDE.busy || (GUIDE.loaded && GUIDE.sid === sid)) return;
    GUIDE.busy = true; var fdb = firebase.database(), base = 'er/' + APP.SESS + '/';
    Promise.all([fdb.ref(base + 'guide/' + sid).once('value'), fdb.ref(base + 'guideResp/' + sid).once('value'), fdb.ref(base + 'guideHist/' + sid).once('value').catch(function () { return { val: function () { return null; } }; })]).then(function (v) {
      GUIDE.g = v[0].val(); GUIDE.r = v[1].val(); GUIDE.h = v[2].val(); GUIDE.sid = sid;
      /* 老師帳號沒有自己的指引：讀一份去識別的示範（guide/_demo），上課可以直接展示學生看到的樣子 */
      if (!GUIDE.g && multiLoginOk()) return fdb.ref(base + 'guide/_demo').once('value').then(function (d) { GUIDE.g = d.val(); if (GUIDE.g) GUIDE.g.demo = true; GUIDE.loaded = true; GUIDE.busy = false; if ($('lobby').classList.contains('on')) renderLobby(); });
      GUIDE.loaded = true; GUIDE.busy = false;
      if ($('lobby').classList.contains('on')) renderLobby();
    }, function () { GUIDE.busy = false; GUIDE.loaded = true; GUIDE.sid = sid; });
  }
  function week2Ctx() {
    var sid = String(APP.me.sid), pf = (APP.me.profile && APP.me.profile.progress) || {}, sc = window.ERG_MY_SCORE || {}, seen = {};
    DB.listRooms(APP.SESS).forEach(function (r) { var x = DB.getRoom(r.code) || {}; if (x.members && x.members[sid]) seen[x.case || 'sms'] = 1; });
    /* 10-20：本機存的進度（profile.progress）只在這台裝置的房間裡更新，換裝置或離開房間後會落後；已發布的成績（score）跨裝置。兩邊取大的（二丙 0179 成就總數增加但追加成就 0/3） */
    var mx = function (a, b) { return Math.max(Number(a) || 0, Number(b) || 0); };
    var g = GUIDE.g || {}, cur = { ask: mx(mx(pf.ask, sc.skAsk), 1), ctx: mx(mx(pf.ctx, sc.skCtx), 1), badges: window.ERG_WEEK2.badgeCount(mx(mx(pf.badges, (sc.badgeIds || []).length), sc.badges), sc.badgeIds) };
    var hasG = !!(g.items && g.items.length);
    return { sk: { ask: cur.ask, ctx: cur.ctx }, badges: cur.badges, cases: Object.keys(seen).length, base: g.base || (APP.me.profile && APP.me.profile.w2base) || cur, resp: GUIDE.r || {}, hasGuide: hasG, guide: g,
      guideSeen: hasG && GUIDE.loaded };   /* 指引已經顯示在大廳＝讀過，「下一步」不再永遠卡在「去讀指引」，改指向個人檢核點最前面沒做完的一件（10-20 檢討） */
  }
  function guideHtml() {
    var g = GUIDE.g;
    if (!ONLINE) return '';
    if (!GUIDE.loaded) return '<div class="muted" style="font-size:var(--fs-2)">正在讀取給你的指引…</div>';
    if (!g || !g.items || !g.items.length) return '<div class="muted" style="font-size:var(--fs-2)">目前沒有給你的個別指引。照上面四項做，「回應指引」那一格寫你這週做了哪些改善就可以。</div>';
    return '<details id="guideBox" open><summary style="cursor:pointer;font-weight:900">📩 給你的指引（' + (g.demo ? '老師帳號看到的是一位同學的去識別範例' : '依你 10/19 的進度寫的') + '，共 ' + g.items.length + ' 件）</summary>' +
      '<ol style="margin:6px 0 0;padding-left:20px;font-size:var(--fs-2);line-height:1.55">' + g.items.map(function (i) {
        return '<li style="margin:6px 0"><b>' + esc(i.title) + '</b><div>怎麼做：' + esc(i.how) + '</div>' +
          (i.qs && i.qs.length ? '<div>可以這樣問：' + i.qs.map(function (q) { return esc(q); }).join('　') + '</div>' : '') +
          '<div><b>怎麼算完成：</b>' + esc(i.criteria) + '</div><div class="muted">什麼時候做：' + esc(i.when) + (i.where ? '｜在哪裡看進度：' + esc(i.where) : '') + '</div>' +
          (i.small ? '<div class="muted">卡住時先做這一小步：' + esc(i.small) + '</div>' : '') + '</li>';
      }).join('') + '</ol>' + ivHtml(g.iv) + '</details>';
  }
  /* 上週訪談的回饋（tools/er_interview_review.py --publish 寫入 guide/{學號}/iv；楊老師確認後才發布） */
  function ivHtml(iv) {
    if (!iv || !iv.good) return '';
    return '<div id="ivBox" style="margin:8px 0 0;padding:8px 12px;border:var(--bw-s) solid var(--ink);border-radius:var(--r-m);font-size:var(--fs-2);line-height:1.6"><b>🗣️ 你上週的訪談</b>' +
      '<div>👍 ' + esc(iv.good) + '</div><div>🔧 ' + esc(iv.fix) + '</div><div>💬 下次可以這樣問：' + esc(iv.eg) + '</div></div>';
  }
  function week2Html() {
    var c = week2Ctx(), ev = window.ERG_WEEK2.evaluate(c), r = c.resp || {}, MIN = window.ERG_WEEK2.RESP_MIN;
    var ta = function (k, label, ph) { return '<label style="display:block;margin:6px 0 2px;font-size:var(--fs-2)"><b>' + label + '</b></label><textarea id="gr_' + k + '" rows="2" maxlength="400" placeholder="' + esc(ph) + '" style="width:100%;box-sizing:border-box">' + esc(GUIDE.draft && GUIDE.draft[k] !== undefined ? GUIDE.draft[k] : (r[k] || '')) + '</textarea>'; };
    return '<div id="week2Box"><div class="row"><b style="flex:1;font-size:var(--fs-4)">痛點急診室 2/3（W7）這週要做的事　' + ev.lit + ' / ' + ev.total + (ev.passed ? '　<span class="tag ok">全部完成</span>' : '') + '</b></div>' +
      '<div class="muted" style="font-size:var(--fs-2);margin:2px 0 6px">這週繼續升級技能、追加成就，<b>最重要的是照「給你的指引」去做，並寫下你做了什麼</b>。10/20 到 W8 結束全天都可以訪談。1/3（W6）還沒完成的，下面可以繼續做。</div>' +
      (ev.next ? '<div id="w2Next" style="margin:6px 0;padding:6px 10px;border:var(--bw) solid var(--ink);border-radius:var(--r-m);background:var(--yellow);color:var(--ink-fixed);font-size:var(--fs-3)"><b>這週下一步</b>　' + esc(ev.next.text) + '</div>' : '') +
      window.ERG_CHECKPOINTS.listHtml(ev, { compact: true }) +
      '<div style="margin-top:8px">' + guideHtml() + '</div>' +
      (ONLINE ? '<div id="guideResp" style="margin-top:8px"><b>✍️ 回應指引</b>　<span class="muted" style="font-size:var(--fs-1)">每格 ' + MIN + ' 字以上，簡單具體就好；W7 作業貼同樣的內容並附截圖</span>' +
        ta('a', '1. 指引建議我做哪幾件？', '寫件名就好，例如：問出 8 題不一樣的問題、把探問升到 Lv.2') +
        ta('b', '2. 我做了什麼、結果如何？', '每件一句，要具體，例如：追問了 5 次「那時候你怎麼做」，探問升到 Lv.2') +
        ta('c', '3. 還沒做到的、卡在哪、下一步？', '例如：還沒問到病人本人，因為找不到他在哪；下次先去候診區') +
        '<div class="row" style="margin-top:6px"><button id="grSend"' + (sentToday(r) ? ' disabled' : '') + '>' + (sentToday(r) ? '今天已送出' : (r.t ? '再次送審' : '送出審核')) + '</button><span id="grMsg" class="muted" style="font-size:var(--fs-2)">' + (sentToday(r) ? '一天只能送出一次審核，明天可以改好再送。' : '一天只能送出一次審核（每晚審一次），三格都寫好再送。') + '</span></div>' + reviewHtml(r) + '</div>' : '') +
      '</div>';
  }
  /* 10-19 楊老師：送出後顯示「審核中」，一天只能送一次（每天晚上用 Claude 批次審一次，tools/er_guide_review.py 寫回 guideResp/{學號}/rev） */
  function dayKey(t) { var d = new Date(t); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function sentToday(r) { return !!(r && r.t && dayKey(r.t) === dayKey(Date.now())); }
  function reviewHtml(r) {
    if (!r || !r.t) return '';
    var rev = r.rev, when = new Date(r.t).toLocaleString('zh-TW', { hour12: false });
    if (!rev || Number(rev.at || 0) < Number(r.t)) return '<div id="grReview" style="margin-top:6px;padding:6px 10px;border:var(--bw-s) solid var(--ink);border-radius:var(--r-m);font-size:var(--fs-2)">🕓 <b>審核中</b>　' + esc(when) + ' 送出。每天晚上審一次，明天進大廳會看到結果。</div>';
    return '<div id="grReview" style="margin-top:6px;padding:6px 10px;border:var(--bw) solid ' + (rev.ok ? 'var(--ok)' : 'var(--bad)') + ';border-radius:var(--r-m);font-size:var(--fs-2)">' + (rev.ok ? '✅ <b>通過</b>' : '↩️ <b>需要補強</b>') + '　' + esc(rev.fb || '') + (rev.ok ? '' : '<div class="muted">照上面的建議改好，明天可以再送一次。</div>') + '</div>' + histHtml();
  }
  /* 10-23 楊老師：審核結果要能在自己的頁面備查。每次審核（含重新送出的舊紀錄）都留在 guideHist/{學號}/{送出時間}，只讀、不訂閱。 */
  function histHtml() {
    var h = GUIDE.h; if (!h || typeof h !== 'object') return '';
    var ks = Object.keys(h).sort(function (a, b) { return Number(b) - Number(a); }); if (!ks.length) return '';
    var rows = ks.map(function (k) {
      var x = h[k] || {}, e = x.eff || {}, when = new Date(Number(x.t || k)).toLocaleString('zh-TW', { hour12: false });
      return '<div style="padding:6px 0;border-top:1px solid var(--line,#ccc)"><b>' + (x.ok ? '✅ 通過' : '↩️ 需要補強') + '</b>　' + esc(when) + ' 送出' + (e.total ? '　<span class="muted">指引 ' + esc(e.total) + ' 項：完成 ' + esc(e.done) + '、有進步 ' + esc(e.moved) + '</span>' : '') +
        '<div style="margin-top:2px">' + esc(x.fb || '') + '</div>' +
        '<details style="margin-top:2px"><summary class="muted">我當時寫的</summary><div class="muted" style="white-space:pre-wrap">1. ' + esc(x.a || '') + '\n2. ' + esc(x.b || '') + '\n3. ' + esc(x.c || '') + '</div></details></div>';
    }).join('');
    return '<details id="grHist" style="margin-top:8px;font-size:var(--fs-2)"><summary><b>📒 我的審核紀錄</b>（' + ks.length + ' 次，也會寄到學校信箱）</summary>' + rows + '</details>';
  }
  /* 房間裡的「檢核」分頁也顯示第 2 週（不含指引全文與回應表單：那兩個在大廳） */
  APP.week2Summary = function () {
    if (!window.ERG_WEEK2) return ''; loadGuide(); var ev = window.ERG_WEEK2.evaluate(week2Ctx());
    return '<div id="cpWeek2" class="card" style="margin:0 0 10px;padding:8px 12px"><div class="row"><b style="flex:1">痛點急診室 2/3（W7）這週要做的事　' + ev.lit + ' / ' + ev.total + '</b>' + (ev.passed ? '<span class="tag ok">全部完成</span>' : '') + '</div>' +
      (ev.next ? '<div style="margin:4px 0;font-size:var(--fs-2)"><b>這週下一步</b>　' + esc(ev.next.text) + '</div>' : '') + window.ERG_CHECKPOINTS.listHtml(ev, { compact: true }) +
      '<div class="muted" style="font-size:var(--fs-1)">「給你的指引」和「回應指引」在大廳（按「回大廳」）。</div></div>';
  };
  function bindWeek2() {
    var b = $('grSend'); if (!b) return;
    b.onclick = function () {
      var v = { a: $('gr_a').value.trim(), b: $('gr_b').value.trim(), c: $('gr_c').value.trim() }, MIN = window.ERG_WEEK2.RESP_MIN, short = [];
      ['a', 'b', 'c'].forEach(function (k, i) { if (v[k].replace(/\s/g, '').length < MIN) short.push('第 ' + (i + 1) + ' 格'); });
      if (short.length) { $('grMsg').textContent = short.join('、') + '還不到 ' + MIN + ' 字，再寫具體一點'; return; }
      if (sentToday(GUIDE.r)) { $('grMsg').textContent = '今天已經送過了，明天可以再送。'; return; }
      b.disabled = true; $('grMsg').textContent = '送出中…';
      v.t = firebase.database.ServerValue.TIMESTAMP; if (GUIDE.r && GUIDE.r.passed) v.passed = GUIDE.r.passed;   /* 通過過一次就保留（再送審不會讓打勾消失） */
      firebase.database().ref('er/' + APP.SESS + '/guideResp/' + APP.me.sid).set(v).then(function () {
        GUIDE.r = { a: v.a, b: v.b, c: v.c, t: Date.now(), passed: (GUIDE.r || {}).passed || null }; GUIDE.draft = null; renderLobby(); var m = $('grMsg'); if (m) m.textContent = '已送出，進入審核。一天只能送一次，明天可以再改。';
      }, function (err) { b.disabled = false; $('grMsg').textContent = '沒有送出（' + ((err && err.code) || '連線問題') + '），請再按一次'; });
    };
  }
  function renderLobby() {
    loadGuide();
    if ($('gr_a')) GUIDE.draft = { a: $('gr_a').value, b: $('gr_b').value, c: $('gr_c').value };   /* 還沒送出的字留著 */
    var e = evaluateAll(), box = $('progressBox');
    if (e) {
      var first = e.ev.list.filter(function (x) { return !x.ok; })[0];
      var w1 = '<details id="w1Wrap"><summary style="cursor:pointer"><b>痛點急診室 1/3（W6）的檢核點　' + e.ev.lit + ' / ' + e.ev.total + '</b>' + (e.ev.passed ? '　<span class="tag ok">全部完成</span>' : '　<span class="muted" style="font-size:var(--fs-2)">還沒完成的可以繼續做' + (e.ev.next ? '｜下一步：' + esc(e.ev.next.text) : '') + '（點開看全部）</span>') + '</summary>' +
        '<div class="dots" style="margin:6px 0">' + e.ev.list.map(function (x) { return '<i class="' + (x.ok ? 'lit' : '') + '" title="' + esc(x.label) + '" style="width:20px;height:20px"></i>'; }).join('') + '</div>' +
        (e.ev.next ? '<div id="lobbyNext" style="margin:6px 0;padding:6px 10px;border:var(--bw) solid var(--ink);border-radius:var(--r-m);background:var(--yellow);color:var(--ink-fixed);font-size:var(--fs-3)"><b>下一步</b>　' + esc(e.ev.next.text) + '</div>' : '') +
        '<details id="lobbyCk"' + (window.innerWidth >= 900 && !e.ev.passed ? ' open' : '') + '><summary style="cursor:pointer;font-size:var(--fs-2)" class="muted">六個檢核點要做什麼（完成 ✔、還沒 ✘）</summary>' + window.ERG_CHECKPOINTS.listHtml(e.ev, { compact: true }) + '</details></details>';
      var ae = document.activeElement; if (ae && /^gr_[abc]$/.test(ae.id || '')) { /* 正在寫回應：不重畫，免得字被洗掉、游標跳走 */ }
      else box.innerHTML = (window.ERG_WEEK2 ? week2Html() : '') + '<div style="margin-top:10px;padding-top:8px;border-top:var(--bw-s) dashed var(--ink)">' + w1 + '</div>';
      bindWeek2();
    }
    /* 三個班共用一個場次，房間會有一兩百間：我的房間全列；別人的房間先列「房主在線」「同班」「比較新」的，最多 20 間，其餘請同學給代碼。 */
    var rooms = DB.listRooms(APP.SESS), tb = $('roomRows'); tb.innerHTML = '';
    if (window.ERG_SOCIAL && window.ERG_SOCIAL.refreshOnce) window.ERG_SOCIAL.refreshOnce();   /* 10-19：社群面板收合時不聽全班名單，進大廳讀一次（60 秒內不重讀） */
    var on = (window.ERG_SOCIAL && window.ERG_SOCIAL.online && window.ERG_SOCIAL.online()) || {}, nowT = Date.now(), CAP = 20;
    var rows = rooms.map(function (r) { var full = DB.getRoom(r.code); var p = on[r.host]; return { r: r, full: full, mine: !!(full.members && full.members[APP.me.sid]), online: !!(p && nowT - Number(p.t || 0) < ((window.ERG_PRES && window.ERG_PRES.ONLINE_MS) || 300000)), same: !!(full.cls && full.cls === APP.me.cls) }; });
    var mineRows = rows.filter(function (x) { return x.mine; }), others = rows.filter(function (x) { return !x.mine; });
    others.sort(function (a, b) { return (b.online - a.online) || (b.same - a.same) || (Number(b.full.createdAt || 0) - Number(a.full.createdAt || 0)); });
    mineRows.concat(others.slice(0, CAP)).forEach(function (x) {
      var r = x.r, full = x.full, mine = x.mine;
      var tr = document.createElement('tr');
      tr.innerHTML = '<td><b>' + esc(r.code) + '</b>' + (mine ? ' <span class="tag">我在裡面</span>' : (x.online ? ' <span class="tag ok">在線</span>' : '')) + '</td><td>' + esc(caseMeta(full.case || 'sms').short || caseMeta(full.case || 'sms').name) + '・' + (full.shift === 'night' ? '夜班' : '日班') + '</td><td>' + esc(full.hostName || r.host) + (full.cls ? ' <span class="muted" style="font-size:var(--fs-1)">' + esc(full.cls) + '</span>' : '') + '</td><td title="這間房到現在一共有幾位進來過（滿 4 位之後新來的只能旁觀）">' + r.count + ' 人' + (r.count >= 4 ? '（滿）' : '') + '</td><td></td>';
      var b = document.createElement('button'); b.className = 'ghost'; b.textContent = mine ? '回去' : (r.count >= 4 ? '旁觀' : '加入');
      b.onclick = function () { joinCode(r.code); }; tr.lastChild.appendChild(b); tb.appendChild(tr);
    });
    var more = $('roomsMore'); if (!more) { more = document.createElement('div'); more.id = 'roomsMore'; more.className = 'muted'; more.style.cssText = 'font-size:var(--fs-2);margin-top:6px'; var nr = $('noRooms'); nr.parentNode.insertBefore(more, nr.nextSibling); }
    more.textContent = others.length > CAP ? ('另外還有 ' + (others.length - CAP) + ' 間沒有列出來。要進同學的房間，請他把四個字的房間代碼給你，在上面的「加入」輸入。') : '';
    $('noRooms').style.display = tb.children.length ? 'none' : 'block';
    try { renderStoryboardEntry(); } catch (x) { console.error('故事板入口', x); }
  }

  /* 第 8 週：大廳兩個入口（進急診室／UX 故事板）＋我進過的房間。資料都來自我自己的房間（已經在監聽的），不另外讀資料庫 */
  var sbBound = false, sbTouched = false;
  function renderStoryboardEntry() {
    var SB = window.ERG_STORYBOARD, RL = window.ERG_REPORT_LEVEL, PER = window.ERG_PERSONAS; if (!SB || !RL || !APP.me.sid) return;
    var card = $('sbCard');
    if (!card) { card = document.createElement('div'); card.id = 'sbCard'; card.className = 'card'; var anchorCard = $('createBtn').closest('.card'); anchorCard.parentNode.insertBefore(card, anchorCard.nextSibling); }
    SB.injectCss(document);
    var sid = String(APP.me.sid), pr = (APP.me.profile && APP.me.profile.progress) || {}, mobile = /Mobi|Android|iPhone/i.test(navigator.userAgent) || location.pathname.indexOf('m.html') >= 0;
    var mine = [];
    DB.listRooms(APP.SESS).forEach(function (r) {
      var full = DB.getRoom(r.code); if (!full || !full.members || !full.members[sid]) return;
      var pl = CORE.getPlayer(full, sid) || { interviews: [], conclusions: [] }, mk = [];
      try { mk = L.listMarkers((DB.getScene && DB.getScene(r.code) || []).concat(CORE.mcardEls(full))).filter(function (m) { return String(m.author) === sid; }); } catch (x) {}
      mine.push({ code: r.code, caseId: full.case || 'sms', interviews: pl.interviews, conclusions: pl.conclusions, markers: mk, mainPersona: caseMeta(full.case || 'sms').mainPersona });
    });
    var skill = { ask: pr.ask || 1, ctx: pr.ctx || 1 }, caseNames = {};
    CASELIST.forEach(function (c) { caseNames[c.meta.id] = c.meta.short || c.meta.name; });
    function personaNames(c) { var o = {}; (PER.PERSONAS || []).forEach(function (p) { o[p.id] = p.name; }); (c.personas || []).forEach(function (p) { o[p.id] = p.name; }); return o; }
    var sel = ($('caseSel') && $('caseSel').value) || 'sms'; if (!sbTouched && mine.length) sel = mine[mine.length - 1].caseId;   /* 還沒動過案例選單：先看我最近進的那個案例 */
    var cobj = CASELIST.filter(function (c) { return c.meta.id === sel; })[0] || CASELIST[0];
    var keyIds = SB.keyIds(sel, cobj.meta, cobj.personas || []), recs = [];
    mine.filter(function (x) { return x.caseId === sel; }).forEach(function (x) { recs = recs.concat(x.interviews || []); });
    var e1 = SB.interviewedSummary(recs, keyIds, personaNames(cobj)); e1.caseName = cobj.meta.short || cobj.meta.name;
    var rows = SB.roomRows(mine, skill, caseNames);
    card.innerHTML = '<div class="row"><b style="flex:1">第 8 週　UX 故事板</b></div>' + SB.lobbyHtml({ mobile: mobile, entry1: e1, rooms: rows });
    var b1 = $('sbEnter1'); if (b1) b1.onclick = function () { var t = $('createBtn'); t.scrollIntoView({ block: 'center' }); t.focus(); };
    var b2 = $('sbEnter2'); if (b2) b2.onclick = function () {
      var best = rows.slice().sort(function (a, b) { return b.cards - a.cards; })[0], def = best && best.cards ? best.caseId : sel, ctx = { cases: {} };
      CASELIST.forEach(function (c) { var nm = personaNames(c); ctx.cases[c.meta.id] = { mainName: nm[c.meta.mainPersona] || '主角', goal: c.meta.goal, focus: c.meta.focus, caseName: c.meta.name }; });
      window.ERG_ROOM.openModal('<div id="sbHost"></div>'); $('modalBox').style.maxWidth = '1000px';
      SB.mountGuide($('sbHost'), { caseId: def, ctx: ctx, onClose: function () { window.ERG_ROOM.closeModal(); $('modalBox').style.maxWidth = ''; } });
    };
    Array.prototype.forEach.call(card.querySelectorAll('[data-export]'), function (b) {
      b.onclick = function () { b.disabled = true; var old = b.textContent; b.textContent = '整理中…'; window.ERG_PANELS.exportFromLobby(b.getAttribute('data-export'), function () { b.disabled = false; b.textContent = old; }); };
    });
    if (!sbBound && $('caseSel')) { sbBound = true; $('caseSel').addEventListener('change', function () { sbTouched = true; try { renderStoryboardEntry(); } catch (x) {} }); }
  }
  $('createBtn').onclick = function () {
    var r = DB.createRoom(APP.SESS, APP.me.sid); DB.patchRoom(r.code, { case: $('caseSel').value, dow: Number($('dowSel').value), shift: $('shiftSel').value || 'day', cls: APP.me.cls || '', hostName: APP.me.name || APP.me.sid }); openRoom(r.code);
  };
  $('joinBtn').onclick = function () { joinCode($('codeInput').value.trim().toUpperCase()); };
  function joinCode(code) { try { $('lobbyErr').textContent = ''; openRoom(code); } catch (e) { $('lobbyErr').textContent = e.message; } }
  /* 線上模式：別人的房間平常只有索引，要先把整間房載進來才能進去（不然會用空白紀錄蓋掉原本的進度） */
  var openT = null;
  function openRoom(code) {
    if (ONLINE && DB.watchRoom) {
      if (!code || !DB.hasRoom(code)) throw new Error(DB.ready() ? '找不到這個房間代碼' : '資料還在載入，請再試一次');
      DB.watchRoom(code);
      if (!DB.roomReady(code) || (DB.sceneReady && !DB.sceneReady(code))) {
        var tries = 0; clearInterval(openT); $('lobbyErr').textContent = '正在載入房間…';
        openT = setInterval(function () {
          tries += 1;
          if (DB.roomReady(code) && (!DB.sceneReady || DB.sceneReady(code))) { clearInterval(openT); $('lobbyErr').textContent = ''; window.ERG_ROOM.enter(code); }
          else if (tries > 50) { clearInterval(openT); $('lobbyErr').textContent = '房間載入太久，請再按一次。'; }
        }, 200);
        return;
      }
    }
    window.ERG_ROOM.enter(code);
  }
  data.listeners.push(function (topic) { if (topic === 'lobby' && $('lobby').classList.contains('on')) renderLobby(); });
  /* 存檔被資料庫拒絕時要讓人看得到（以前只印在主控台，沒有人知道）。30 秒內只提醒一次。 */
  var dbErrT = 0;
  data.listeners.push(function (topic) {
    if (topic !== 'dberror' || Date.now() - dbErrT < 30000) return; dbErrT = Date.now();
    var msg = '⚠ 剛才那一步沒有存到雲端。請按「回報」告訴老師你剛剛在做什麼。';
    if (window.ERG_ROOM && window.ERG_ROOM.cur && window.ERG_ROOM.toast) window.ERG_ROOM.toast(msg); else if ($('lobbyErr')) $('lobbyErr').textContent = msg;
  });

  /* 成就：①頁面可見且在房間裡，每分鐘 playMin +1；②把自己的指標摘要寫到 er/{sess}/score/{sid}（小節點，全班可讀、排行用）。
     10-19 降流量：變動判斷不含 playMin（累計滿 5 分鐘或離開頁面才補寫，見 achievements.js scoreDecide）；
     整份 score 節點只在「成就」分頁開著時才訂閱（平時只讀自己那一筆一次，用來避免把之前拿到的成就蓋掉）。 */
  var lastScore = null, myScoreAsked = false;
  function ensureMyScore() {
    if (myScoreAsked || !ONLINE || !window.firebase || !APP.me.sid) return;
    myScoreAsked = true;
    window.firebase.database().ref('er/' + APP.SESS + '/score/' + APP.me.sid).once('value', function (snap) { window.ERG_MY_SCORE = snap.val() || {}; window.ERG_SCORES_READY = true; }, function () { myScoreAsked = false; });
  }
  function publishScore(force) {
    var R = window.ERG_ROOM, c = R && R.cur, A = window.ERG_ACH, P = window.ERG_PANELS;
    if (!ONLINE || !window.firebase || !c || !A || !APP.me.sid) return;
    ensureMyScore(); scoreWatch.tick();
    if (!window.ERG_SCORES_READY) return;   /* 10-15：還沒讀到自己之前發布的成就就先不寫，不然會把別間房拿到的蓋成較少 */
    var s = A.summary(c.player, P && P.achCtx ? P.achCtx() : {}); s.name = APP.me.name || APP.me.sid; s.cls = APP.me.cls || ''; s.t = Date.now();
    var d = A.scoreDecide(lastScore, s, force === true);
    if (!d.write) return; lastScore = { sig: d.sig, playMin: Number(s.playMin) || 0 };
    try { window.firebase.database().ref('er/' + APP.SESS + '/score/' + APP.me.sid).set(s); } catch (e) { if (window.console) console.warn('score 寫入失敗', e); }
  }
  window.ERG_PUBLISH_SCORE = publishScore;
  setInterval(function () {
    var R = window.ERG_ROOM, c = R && R.cur; if (!c || document.hidden) return;
    c.player.playMin = (Number(c.player.playMin) || 0) + 1; if (R.persist) R.persist(true); publishScore();
  }, 60000);
  document.addEventListener('visibilitychange', function () { if (document.hidden) publishScore(true); });   /* 離開頁面時把累計分鐘補寫一次 */
  var scoreWatch = {
    inner: null,
    ensure: function () {
      if (!this.inner) this.inner = window.ERG_ACH.makeScoreWatch({
        getTab: function () { var R = window.ERG_ROOM; return R && R.cur ? R.cur.tab : ''; },
        subscribe: function () {
          var ref = window.firebase.database().ref('er/' + APP.SESS + '/score');
          var cb = ref.on('value', function (snap) { window.ERG_SCORES = snap.val() || {}; var R = window.ERG_ROOM; if (R && R.cur && R.cur.tab === 'ach' && window.ERG_PANELS) window.ERG_PANELS.renderAch(); });
          return function () { ref.off('value', cb); };
        }
      });
      return this.inner.ensure();
    },
    tick: function () { return this.inner ? this.inner.tick() : false; }
  };
  function ensureScoreWatch() { if (!ONLINE || !window.firebase || !APP.me.sid || !window.ERG_ACH) return; ensureMyScore(); scoreWatch.ensure(); }
  window.ERG_ENSURE_SCORE_WATCH = ensureScoreWatch;

  window.__ERG_DEBUG = { APP: APP, DB: DB };
})();
