/* 三班輪播展示模式（老師專用，網址 index.html?demo=rotate，手機版 m.html?demo=rotate 也可）。
   把去識別化快照（demo_data/demo_students.json，只有計數與狀態）轉成「某一班一位學生」的大廳資料，
   餵給現有大廳程式（game.js 的 renderLobby／renderStoryboardEntry 原樣算畫面）。不連 Firebase 資料庫、不寫任何東西。
   純函式（輪替、挑學生、轉資料、快照白名單）可在 Node 測試；瀏覽器端（橫幅、老師登入檢查、擋寫入）在最後。
   這個頁面只給老師用，學生平常看不到，裡面的字不是學生導向文案。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ERG_DEMO = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var CLASSES = ['二丙', '二乙', '二甲'];      /* 輪替順序 */
  var KEY = 'erg_demo_rot';                    /* 只存一個整數（輪到第幾次），不是學生資料 */
  var CASES = ['sms', 'wait', 'way', 'forms', 'pay', 'peds'];

  /* ───── 輪替：用 localStorage 計數，連續重整三班輪流；計數壞掉（不是非負整數、讀寫丟例外）就退回隨機 ───── */
  function nextClassIndex(storage, rnd) {
    rnd = rnd || Math.random;
    var idx;
    try {
      var v = storage.getItem(KEY), n = v === null || v === undefined ? 0 : (/^\d{1,9}$/.test(String(v)) ? Number(v) : -1);
      if (n < 0) throw new Error('bad counter');
      idx = n % CLASSES.length; storage.setItem(KEY, String(n + 1));
    } catch (e) {
      idx = Math.floor(rnd() * CLASSES.length) % CLASSES.length;
      try { storage.setItem(KEY, String(idx + 1)); } catch (x) {}   /* 順便把計數修好，從隨機到的那班接著輪 */
    }
    return idx;
  }

  /* ───── 進度分數：只用來排「中段」，不顯示給任何人 ───── */
  function progressScore(s) {
    var cards = 0; (s.rooms || []).forEach(function (r) { cards += Number(r.cards) || 0; });
    var sb = s.sb || {};
    return cards + (Number(sb.filled) || 0) + (sb.moment ? 1 : 0) + (sb.img ? 1 : 0) + Math.min(Number(sb.personas) || 0, 2) + (sb.opened ? 1 : 0);
  }
  /* 該班「有進度」（分數>0）的學生，由低到高排；去掉最高與最低的，取 25%–75% 的中段隨機一位。
     不足 3 位有進度的就用全部有進度的；一位都沒有就在該班隨便挑。回傳 { stu, band:{n, lo, hi}, score } */
  function pickStudent(list, cls, rnd) {
    rnd = rnd || Math.random;
    var pool = (list || []).filter(function (s) { return s.cls === cls; });
    if (!pool.length) return null;
    var sc = pool.map(function (s) { return { s: s, p: progressScore(s) }; }).filter(function (x) { return x.p > 0; }).sort(function (a, b) { return a.p - b.p || a.s.n - b.s.n; });
    var mid = sc;
    if (sc.length >= 3) { var lo = Math.max(1, Math.floor(sc.length * 0.25)), hi = Math.min(sc.length - 1, Math.ceil(sc.length * 0.75)); mid = sc.slice(lo, hi); if (!mid.length) mid = [sc[Math.floor(sc.length / 2)]]; }
    if (!mid.length) { var f = pool[Math.floor(rnd() * pool.length) % pool.length]; return { stu: f, band: { n: 0 }, score: 0 }; }
    var pick = mid[Math.floor(rnd() * mid.length) % mid.length];
    return { stu: pick.s, band: { n: sc.length, lo: sc[0].p, hi: sc[sc.length - 1].p }, score: pick.p };
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function sidOf(n) { return 'demo' + pad(n); }
  function nameOf(n) { return '示範學生 ' + n; }

  /* ───── 快照 → 大廳讀的資料形狀 ─────
     deps：{ CL: ERG_CHECKLIST, CORE: ERG_CORE, AV: ERG_AVATAR, ids(caseId) → 人物 id 陣列 }
     回傳 { me, profile, rooms:[{ host, hostName, case, cls, player|null, mine, main }], w8p } */
  var ITEM_KEYS = ['surface', 'events', 'need'];
  function buildPack(stu, all, deps) {
    var sid = sidOf(stu.n), CL = deps.CL, CORE = deps.CORE, AV = deps.AV;
    var profile = { sid: sid, cls: stu.cls, avatar: AV.defaultFor(sid), speed: '標準', chosen: true, sound: true, name: nameOf(stu.n), progress: { badges: Number(stu.badges) || 0, ask: 1, ctx: 1 } };
    var rooms = [], bestCards = -1, bestIdx = -1;
    (stu.rooms || []).forEach(function (r) {
      var cs = CASES.indexOf(r.case) >= 0 ? r.case : 'sms', ids = (deps.ids(cs) || ['patient']).slice();
      var started = Math.max(Number(r.started) || 0, Number(r.cards) || 0), cards = Math.min(Number(r.cards) || 0, started, ids.length);
      var p = CORE.blankPlayer(profile), ck = r.ck || [false, false, false];
      for (var i = 0; i < started; i++) {
        var rec = CL.newRecord({ id: '#' + sid + '-' + pad(i + 1), author: sid, round: 1, personaId: ids[i % ids.length] });
        if (i < cards) {
          var any = false;
          ITEM_KEYS.forEach(function (k, ki) { if (i === 0 && ck[ki]) { rec = CL.setItem(rec, k, { done: true, trust: 'said' }); any = true; } });
          if (!any) rec = CL.setItem(rec, 'surface', { done: true, trust: 'said' });
        }
        p.interviews.push(rec);
      }
      p.seq = started;
      rooms.push({ host: sid, hostName: nameOf(stu.n), case: cs, cls: stu.cls, player: p, mine: true, main: false });
      if (cards > bestCards) { bestCards = cards; bestIdx = rooms.length - 1; }
    });
    if (bestIdx >= 0) rooms[bestIdx].main = true;
    /* 同班別人的房間幾間，讓「目前的房間」看起來有人（只有房號、案例、房主代號，沒有內容） */
    var others = (all || []).filter(function (s) { return s.cls === stu.cls && s.n !== stu.n && (s.rooms || []).length; }).slice(0, 5);
    others.forEach(function (o) { rooms.push({ host: sidOf(o.n), hostName: nameOf(o.n), case: CASES.indexOf(o.rooms[0].case) >= 0 ? o.rooms[0].case : 'sms', cls: o.cls, player: null, mine: false, main: false }); });
    var sb = stu.sb || {};
    return { me: { sid: sid, cls: stu.cls, name: nameOf(stu.n) }, profile: profile, rooms: rooms,
      w8p: { personas: Number(sb.personas) || 0, filled: Number(sb.filled) || 0, moment: !!sb.moment, img: !!sb.img, opened: !!sb.opened, code: '' } };
  }

  /* ───── 快照白名單（與 tools/er_demo_snapshot.py 的 validate 同一組規則；Node 測試與頁面載入都用） ───── */
  var CJK = /[㐀-鿿豈-﫿]/;
  function validateSnapshot(d) {
    var err = [], isInt = function (x, lo, hi) { return typeof x === 'number' && x % 1 === 0 && x >= lo && x <= hi; };
    var same = function (o, keys) { var k = Object.keys(o || {}).sort().join(','); return k === keys.slice().sort().join(','); };
    if (!d || !same(d, ['v', 'day', 'students'])) return ['頂層欄位不符'];
    if (d.v !== 1) err.push('v');
    var seen = {};
    (d.students || []).forEach(function (s) {
      if (!same(s, ['n', 'cls', 'device', 'days', 'badges', 'rooms', 'sb'])) { err.push('學生欄位不符'); return; }
      if (!isInt(s.n, 1, 9999) || seen[s.n]) err.push('n'); seen[s.n] = 1;
      if (CLASSES.indexOf(s.cls) < 0) err.push('cls');
      if (s.device !== 'mobile' && s.device !== 'desktop') err.push('device');
      if (!isInt(s.days, 0, 60) || !isInt(s.badges, 0, 99)) err.push('days/badges');
      if (!Array.isArray(s.rooms) || s.rooms.length > 12) { err.push('rooms'); return; }
      s.rooms.forEach(function (r) {
        if (!same(r, ['case', 'cards', 'started', 'ck'])) { err.push('房欄位不符'); return; }
        if (CASES.indexOf(r.case) < 0) err.push('case');
        if (!isInt(r.cards, 0, 20) || !isInt(r.started, 0, 20) || r.cards > r.started) err.push('cards/started');
        if (!Array.isArray(r.ck) || r.ck.length !== 3 || r.ck.some(function (x) { return typeof x !== 'boolean'; })) err.push('ck');
      });
      var sb = s.sb;
      if (!same(sb, ['opened', 'filled', 'moment', 'img', 'personas'])) { err.push('sb 欄位不符'); return; }
      if (typeof sb.opened !== 'boolean' || typeof sb.moment !== 'boolean' || typeof sb.img !== 'boolean' || !isInt(sb.filled, 0, 6) || !isInt(sb.personas, 0, 3)) err.push('sb 值');
    });
    var raw = JSON.stringify(d);
    if (raw.indexOf('@') >= 0) err.push('出現 @');
    if (/4[bB]\d[kK]\d/.test(raw)) err.push('出現學號樣式');
    if (CJK.test(raw.replace(/二丙|二乙|二甲/g, ''))) err.push('出現班級以外的中文字');
    return err;
  }

  var api = { CLASSES: CLASSES, KEY: KEY, nextClassIndex: nextClassIndex, progressScore: progressScore, pickStudent: pickStudent, buildPack: buildPack, validateSnapshot: validateSnapshot, sidOf: sidOf, nameOf: nameOf };
  if (typeof document === 'undefined' || !document.getElementById) return api;

  /* ═════ 瀏覽器端 ═════ */
  var APP = null, ALL = null, msgT = null;
  var $ = function (id) { return document.getElementById(id); };
  var BANNER_CSS = '#demoBanner{position:fixed;top:0;left:0;right:0;z-index:2147483000;display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;padding:6px 12px;background:#e8590c;color:#fff;font-weight:900;font-size:var(--fs-2,14px);line-height:1.4;box-shadow:0 2px 0 rgba(0,0,0,.25)}' +
    '#demoBanner .dtxt{flex:1 1 260px;min-width:0}#demoBanner button,#demoBanner a.dbtn{min-height:44px;min-width:44px;padding:6px 12px;box-sizing:border-box;border:2px solid #fff;border-radius:8px;background:rgba(0,0,0,.18);color:#fff;font:inherit;font-size:var(--fs-2,14px);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;text-decoration:none;box-shadow:none}' +
    '#demoBanner #demoMsg{flex:1 1 100%;font-weight:700}#demoBanner #demoMsg:empty{display:none}' +
    'body.demo #lobby{padding-top:var(--demoH,96px)}body.demo [data-fb],body.demo #avatarBtn,body.demo #logoutBtn{display:none!important}' +
    'body.demo #sbCard>details>summary,body.demo #progressBox .wkBox>details>summary{min-height:44px;box-sizing:border-box;padding:10px 8px}' +
    'body.demo #sbCard>details.demoFold>summary{font-size:var(--fs-3);font-weight:900;border:var(--bw-s,2px) solid var(--ink,#222);border-radius:var(--r-m,8px);background:var(--panel,#fff)}' +
    '#demoGate{position:fixed;inset:0;z-index:2147483100;background:var(--bg,#fff);color:var(--fg,#222);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:24px;text-align:center;font-size:var(--fs-4,18px)}';

  function note(text) {
    var m = $('demoMsg'); if (!m) return; m.textContent = text; clearTimeout(msgT);
    msgT = setTimeout(function () { m.textContent = ''; fit(); }, 3500); fit();
  }
  function fit() { var b = $('demoBanner'); if (b) document.documentElement.style.setProperty('--demoH', (b.offsetHeight + 8) + 'px'); }
  function foldAll(open) {
    var tops = ['demoSbFold', 'week2Box', 'w1Wrap'];
    if (open) tops.forEach(function (id) { var d = $(id); if (d && d.tagName === 'DETAILS') d.open = true; });
    else Array.prototype.forEach.call(document.querySelectorAll('#sbCard details, #progressBox details'), function (d) { d.open = false; });
  }
  function banner() {
    if ($('demoBanner')) return;
    var st = document.createElement('style'); st.id = 'demoCss'; st.textContent = BANNER_CSS; document.head.appendChild(st);
    var b = document.createElement('div'); b.id = 'demoBanner'; b.setAttribute('role', 'status');
    b.innerHTML = '<span class="dtxt" id="demoTxt"></span><button type="button" id="demoNext">換下一班</button><button type="button" id="demoOpenAll">全部展開</button><button type="button" id="demoCloseAll">全部收合</button><a class="dbtn" href="teacher.html">結束展示</a><span id="demoMsg" aria-live="polite"></span>';
    document.body.insertBefore(b, document.body.firstChild); document.body.classList.add('demo');
    $('demoNext').onclick = function () { apply(nextClassIndex(localStorage, Math.random)); };
    $('demoOpenAll').onclick = function () { foldAll(true); };
    $('demoCloseAll').onclick = function () { foldAll(false); };
    window.addEventListener('resize', fit);
  }
  function setBanner(cls) { $('demoTxt').textContent = '展示模式｜' + cls + '（去識別化學生）｜不是真實登入，不會寫入任何資料'; fit(); }

  /* 寫入類動作一律攔下並說一句「展示模式不會儲存」。capture 階段比元素自己的 onclick 早，用 stopImmediatePropagation 擋掉 */
  function guardWrites() {
    var BLOCK = '#createBtn,#joinBtn,#avatarBtn,#logoutBtn,[data-revisit],[data-export],[data-fb],#grSend,#sbMain0,a[href^="storyboard.html"]';
    document.addEventListener('click', function (e) {
      var t = e.target && e.target.closest ? e.target.closest(BLOCK) : null; if (!t) return;
      e.preventDefault(); e.stopImmediatePropagation(); note('展示模式不會儲存，也不會進房間或開故事板。');
    }, true);
  }

  function apply(idx) {
    var cls = CLASSES[idx], pk = pickStudent(ALL.students, cls, Math.random);
    if (!pk) { note('快照裡沒有 ' + cls + ' 的資料'); return; }
    APP.demoOpen.sb = false; APP.demoOpen.w2 = false;     /* 展開狀態不記憶：換班、重整都回到收合 */
    setBanner(cls);
    APP.demoApply(buildPack(pk.stu, ALL.students, { CL: window.ERG_CHECKLIST, CORE: window.ERG_CORE, AV: window.ERG_AVATAR, ids: function (cid) { return APP.demoPersonaIds(cid); } }));
    window.__ERG_DEMO_CUR = { cls: cls, n: pk.stu.n, score: pk.score };
  }
  function gate(msg, withBtn) {
    var g = $('demoGate'); if (!g) { g = document.createElement('div'); g.id = 'demoGate'; document.body.appendChild(g); }
    var st = $('demoCss'); if (!st) { st = document.createElement('style'); st.id = 'demoCss'; st.textContent = BANNER_CSS; document.head.appendChild(st); }
    g.innerHTML = '<b>' + msg + '</b>'; g.style.display = 'flex';
    if (withBtn) { var b = document.createElement('button'); b.textContent = '用 Google 登入'; b.style.minHeight = '44px'; b.onclick = function () { try { var p = new firebase.auth.GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account' }); firebase.auth().signInWithPopup(p).catch(function (er) { gate('登入沒有成功：' + (er && er.code || ''), true); }); } catch (x) {} }; g.appendChild(b); }
  }
  function start() {
    fetch('demo_data/demo_students.json?t=' + Date.now()).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (d) {
      var bad = validateSnapshot(d); if (bad.length) throw new Error('快照白名單檢查沒過：' + bad[0]);
      ALL = d; if ($('demoGate')) $('demoGate').style.display = 'none'; banner(); guardWrites(); apply(nextClassIndex(localStorage, Math.random));
    }).catch(function (e) { gate('找不到可用的展示資料（' + e.message + '）。請先執行 tools/er_demo_snapshot.py。'); });
  }
  function boot() {
    APP = window.ERG_APP; if (!APP || !APP.demo) return;
    /* 老師身分：本機測試（127.0.0.1 或 localhost 並帶 demotest=1）直接放行；其他一律要老師的 Google 帳號（白名單同 game.js 的 MULTI_LOGIN）。
       這裡只用 Firebase Auth 確認身分，不連資料庫。 */
    if (/^(127\.0\.0\.1|localhost)$/.test(location.hostname) && /[?&]demotest=1/.test(location.search)) { start(); return; }
    if (!window.firebase || !window.ERG_FB) { gate('這個網址需要老師帳號登入。'); return; }
    gate('正在確認老師帳號…');
    try { if (!firebase.apps || !firebase.apps.length) firebase.initializeApp(window.ERG_FB);
      firebase.auth().onAuthStateChanged(function (u) { if (u && APP.isTeacherEmail(u.email)) start(); else gate('這個網址需要老師帳號登入。', true); });
    } catch (e) { gate('這個網址需要老師帳號登入。'); }
  }
  api.note = function () { note('展示模式不會儲存，也不會進房間或開故事板。'); };
  setTimeout(boot, 0);
  return api;
});
