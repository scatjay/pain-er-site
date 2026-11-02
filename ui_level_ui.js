/* 模式（新手／中級／專家）的畫面：切換器、新手房間（純卡片）、專心對談、新手大廳、進大廳詢問、故事板新手；中級＝有場景但房間與人物少一些、故事板簡化版。
   純函式與設定在 ui_level.js。桌機 index.html、手機 m.html、故事板 storyboard.html 共用這一支。
   原則：專家＝現在的畫面，一個字都不改；新手只是「另一層顯示」，資料（房間、訪談卡、故事板格子）完全沿用，所以切換不重載、不丟進度。
   不新增呼叫模型的路徑：助教的固定問題在瀏覽器裡回答；打字問助教走原本的訪談助教（ERG_ICHAT）和故事板助教（ERG_SB_COACH），名額共用。 */
(function () {
  'use strict';
  var U = window.ERG_UILV; if (!U) return;
  var UI = window.ERG_UILV_UI = {};
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var MOB = /(^|\/)m\.html$/.test(location.pathname), IS_SB = /storyboard\.html$/.test(location.pathname);
  var LOCALHOST = /^(127\.0\.0\.1|localhost)$/.test(location.hostname);
  /* 人物大頭照：art/portraits_1102/<人物id>.png（finalize.py 產生，192px）。部署要明確帶這些圖 */
  var PORTRAIT_DIR = 'art/portraits_1102/', PORTRAIT_ON = true;
  var AV_COLORS = ['#ffc9c9', '#b2f2bb', '#a5d8ff', '#ffec99'];

  var ENV = { sid: '', sess: '', online: false, demo: false, cls: '' };
  var ST = { lv: 3, at: 0, log: {}, logState: U.stateFromLog(null), roomOn: false, pane: '', nudge: null, chat: null, patched: false, booted: false, askLog: [], scope: null, scopeWorld: null };
  function app() { return window.ERG_APP; }
  function RM() { return window.ERG_ROOM; }
  function curRoom() { var r = RM(); return r && r.cur; }
  function fb() { try { return window.firebase && window.firebase.database ? window.firebase.database() : null; } catch (e) { return null; } }
  function fref(path) { var d = fb(); return d ? d.ref('er/' + ENV.sess + '/' + path) : null; }

  /* ───── 讀寫設定 ───── */
  UI.level = function () { return ST.lv; };
  UI.isNovice = function () { return !ENV.demo && U.isNovice(ST.lv); };
  UI.isMid = function () { return !ENV.demo && U.isMid(ST.lv); };
  UI.scope = function () { return ST.scope || null; };
  UI.talkOn = function () { return document.body.classList.contains('nvTalk'); };
  function logKey() { return 'erg_uilvlog_' + ENV.sid; }
  function readLog() { var o = {}; try { o = JSON.parse(localStorage.getItem(logKey()) || '{}') || {}; } catch (e) {} return o; }
  function stats() {
    var a = app(), rooms = a ? mineRooms() : [], cards = rooms.reduce(function (s, r) { return s + r.cards; }, 0), P = a && a.w8Data ? a.w8Data() : null;
    var pg = null; try { pg = a && a.progress ? a.progress() : null; } catch (e) {}
    return { rooms: rooms, cards: cards, entered: rooms.length > 0, days: playDays(rooms), cells: P ? (Number(P.filled) || 0) : 0, badges: pg ? (Number(pg.badges) || 0) : 0 };
  }
  function playDays(rooms) {
    var set = {}, sid = ENV.sid;
    try { (JSON.parse(localStorage.getItem('erg_days_' + sid) || '[]') || []).forEach(function (d) { set[d] = 1; }); } catch (e) {}
    (rooms || []).forEach(function (r) { if (r.joined) set[U.dayKey(r.joined)] = 1; });
    try { var sm = JSON.parse(localStorage.getItem('erg_room_seen_' + sid) || '{}') || {}; Object.keys(sm).forEach(function (k) { if (sm[k]) set[U.dayKey(sm[k])] = 1; }); } catch (e) {}
    return Object.keys(set).length;
  }
  function markToday() {
    try { var k = 'erg_days_' + ENV.sid, a = JSON.parse(localStorage.getItem(k) || '[]') || [], d = U.dayKey(Date.now()); if (a.indexOf(d) < 0) { a.push(d); localStorage.setItem(k, JSON.stringify(a.slice(-60))); } } catch (e) {}
  }
  function mineRooms() {
    var a = app(), sid = String(ENV.sid), out = []; if (!a || !a.DB) return out;
    var CORE = window.ERG_CORE, RL = window.ERG_REPORT_LEVEL;
    try {
      a.DB.listRooms(a.SESS).forEach(function (r) {
        var full = a.DB.getRoom(r.code); if (!full || !full.members || !full.members[sid]) return;
        var pl = (CORE && CORE.getPlayer(full, sid)) || { interviews: [] };
        out.push({ code: r.code, caseId: full.case || 'sms', cards: RL ? RL.interviewed(pl.interviews).length : 0, interviews: pl.interviews || [], joined: Number((full.members[sid] || {}).joinedAt) || 0, count: r.count });
      });
    } catch (e) {}
    return out;
  }
  function writeLog(from, to, why, tgt) {
    var st = stats(), e = U.logEntry(from, to, why, { t: Date.now(), cls: ENV.cls, dev: MOB ? 'mobile' : 'desktop', cards: st.cards, days: st.days, tgt: tgt });
    var o = readLog(); o['l' + e.t + Math.floor(Math.random() * 1000)] = e; try { localStorage.setItem(logKey(), JSON.stringify(o)); } catch (x) {}
    ST.log = o; ST.logState = U.stateFromLog(o);
    if (ENV.online && !ENV.demo) { var r = fref('uilv/' + ENV.sid); if (r) { try { r.push(e); } catch (x) { if (window.console) console.warn('uilv 寫入失敗', x); } } }
  }
  UI.setLevel = function (lv, why) {
    if (ENV.demo || !ENV.sid) return; lv = U.normalize(lv); var from = ST.lv;
    if (lv !== from) {
      ST.lv = lv; ST.at = Date.now(); U.writeLocal(localStorage, ENV.sid, lv, ST.at);
      if (ENV.online) { var r = fref('profiles/' + ENV.sid); if (r) { try { r.update({ uiLevel: lv, uiLevelAt: ST.at }); } catch (x) { if (window.console) console.warn('uiLevel 寫入失敗', x); } } }
    }
    writeLog(from, lv, why || 'self', /^(ask|up)-/.test(why || '') ? lv : 0); applyLevel();
  };
  UI.logOnly = function (why, tgt) { if (ENV.demo || !ENV.sid) return; writeLog(ST.lv, ST.lv, why, tgt); };

  UI.boot = function (opts) {
    opts = opts || {}; ENV.sid = String(opts.sid || ''); ENV.sess = opts.sess || ''; ENV.online = !!opts.online; ENV.demo = !!opts.demo; ENV.cls = opts.cls || '';
    ST.nudge = null; ST.nudgeAt = 0; ST.roomOn = false; if (ENV.demo || !ENV.sid) return;   /* 換人登入：不沿用上一位的 30 秒節流 */
    var loc = U.readLocal(localStorage, ENV.sid); ST.lv = loc ? loc.lv : 3; ST.at = loc ? loc.at : 0;
    var q = LOCALHOST && /[?&]level=(1|2|3)/.exec(location.search); if (q) { ST.lv = Number(q[1]); }   /* 測試用：只在本機伺服器有效，不寫進設定 */
    ST.log = readLog(); ST.logState = U.stateFromLog(ST.log); markToday();
    ST.booted = true; injectCss(); mountAllSwitchers(); applyLevel();
    if (ENV.online && fb()) {
      Promise.all([fref('profiles/' + ENV.sid).once('value'), fref('uilv/' + ENV.sid).once('value')]).then(function (v) {
        var p = v[0].val() || {}, lg = v[1].val() || {};
        var merged = Object.assign({}, ST.log, lg); ST.log = merged; ST.logState = U.stateFromLog(merged);
        if (!q) { var pk = U.pick(U.readLocal(localStorage, ENV.sid), p.uiLevelAt ? { lv: p.uiLevel, at: p.uiLevelAt } : null); if (pk.lv !== ST.lv || pk.at !== ST.at) { ST.lv = pk.lv; ST.at = pk.at; U.writeLocal(localStorage, ENV.sid, pk.lv, pk.at); } }
        applyLevel(); var a = app(); if (a && a.renderLobby && $('lobby') && $('lobby').classList.contains('on')) a.renderLobby();
      }, function () { /* 讀不到就用本機的 */ });
    }
  };
  function applyLevel() {
    var nov = UI.isNovice(); document.body.classList.toggle('lv1', nov); document.body.classList.toggle('lv2', UI.isMid()); document.body.classList.toggle('lv2M', UI.isMid() && MOB);
    mountAllSwitchers();
    Array.prototype.forEach.call(document.querySelectorAll('.uilvSw'), paintSwitcher);
    var a = app();
    if (a && a.renderLobby && $('lobby') && $('lobby').classList.contains('on')) { try { a.renderLobby(); } catch (e) {} }
    sync(); if (IS_SB && UI._sbApi) UI.sbRender(UI._sbApi);
    try { window.dispatchEvent(new CustomEvent('erg-uilevel', { detail: { level: ST.lv } })); } catch (e) {}
    if (!nov) setTimeout(function () { try { window.dispatchEvent(new Event('resize')); } catch (e) {} }, 60);   /* 回專家：舞台要重新對準 */
  }

  /* ───── 切換器 ───── */
  function swHtml(sheet) {
    return sheet ? '<button type="button" class="ghost uilvOpen" aria-haspopup="dialog">模式：' + U.nameOf(ST.lv) + '</button>'
      : '<span class="lbl">模式</span><button type="button" data-lv="1">新手</button><button type="button" data-lv="2">中級</button><button type="button" data-lv="3">專家</button>';
  }
  function paintSwitcher(el) {
    var sheet = el.getAttribute('data-sheet') === '1';
    if (sheet) { var b = el.querySelector('.uilvOpen'); if (b) b.textContent = '模式：' + U.nameOf(ST.lv); return; }
    Array.prototype.forEach.call(el.querySelectorAll('button[data-lv]'), function (b) { var on = Number(b.getAttribute('data-lv')) === U.normalize(ST.lv); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
  }
  function ensureSwitcher(host, before, sheet, id) {
    if (!host || host.querySelector(':scope > .uilvSw')) return;
    var el = document.createElement('span'); el.className = 'uilvSw nvKeep'; el.setAttribute('role', 'group'); el.setAttribute('aria-label', '模式'); el.setAttribute('data-sheet', sheet ? '1' : '0'); if (id) el.id = id;
    el.innerHTML = swHtml(sheet); host.insertBefore(el, before || null); paintSwitcher(el);
    el.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.classList.contains('uilvOpen')) { openSheet(); return; }
      var lv = Number(b.getAttribute('data-lv')); if (lv) UI.setLevel(lv, 'self');
    });
  }
  function mountAllSwitchers() {
    if (ENV.demo || !ENV.sid) return;
    var side = $('side'); if (side && !MOB) ensureSwitcher(side, side.firstChild, false, 'uilvSwSide');   /* 電腦版專家的頂列已經滿了（再塞一個會把「回大廳」擠出畫面），專家模式的切換器放右側面板最上面；新手畫面的頂列才放 */
    var tb = $('topbar'); if (tb) { var fbtn = tb.querySelector('[data-fb]'); ensureSwitcher(tb, fbtn, MOB, 'uilvSwRoom'); Array.prototype.forEach.call(tb.querySelectorAll('[data-fb],#leaveBtn'), function (b) { b.classList.add('nvKeep'); }); }
    var lr = document.querySelector('#lobby .row'); if (lr) { lr.classList.add('nvKeep'); var f2 = lr.querySelector('[data-fb]'); ensureSwitcher(lr, f2, false, 'uilvSwLobby'); }
    if (IS_SB) { var line = document.querySelector('#top .line'); if (line) { var rl = $('reviseLink'); ensureSwitcher(line, rl, false, 'uilvSwSb'); } }
  }
  function openSheet() {
    var s = $('uilvSheet'); if (s) s.remove();
    s = document.createElement('div'); s.id = 'uilvSheet'; s.setAttribute('role', 'dialog'); s.setAttribute('aria-label', '選擇模式');
    s.innerHTML = '<div class="uilvBack"></div><div class="uilvBox"><b style="font-size:18px">選擇模式</b>' +
      '<button type="button" data-lv="1" class="' + (U.normalize(ST.lv) === 1 ? 'on' : '') + '"><b>新手</b><br>卡片，只問人，有問題問助教</button>' +
      '<button type="button" data-lv="2" class="' + (U.normalize(ST.lv) === 2 ? 'on' : '') + '"><b>中級</b><br>有場景，房間和人物少一些</button>' +
      '<button type="button" data-lv="3" class="' + (U.normalize(ST.lv) === 3 ? 'on' : '') + '"><b>專家</b><br>全部房間、人物與事件</button>' +
      '<span class="muted">隨時可以切換，進度不會不見。</span><button type="button" class="ghost" data-close="1">關閉</button></div>';
    document.body.appendChild(s);
    s.addEventListener('click', function (e) { var b = e.target.closest('button'); var back = e.target.classList.contains('uilvBack'); if (back || (b && b.dataset.close)) { s.remove(); return; } if (b && b.dataset.lv) { s.remove(); UI.setLevel(Number(b.dataset.lv), 'self'); } });
  }

  /* ───── 房間：新手（純卡片） ───── */
  function roomActive() { return !!(curRoom() && $('game') && $('game').classList.contains('on')); }
  function caseIdOf(c) { return (c.world && c.world.meta && c.world.meta.id) || (c.room && c.room.case) || 'sms'; }
  function supported(c) { return U.whitelist(caseIdOf(c)).length >= 2; }
  function wlFor(c) { var pers = (c.world && c.world.personas) || {}; return U.whitelist(caseIdOf(c)).map(function (x) { return { pid: x.pid, role: x.role, kin: x.kin, name: (pers[x.pid] || {}).name || x.pid }; }); }
  function whereNow(c, pid) {
    var found = null, LAY = window.ERG_LAYOUT;
    c.world.at(c.clock.worldSec).forEach(function (it) {
      if (found || it.ent.pid !== pid || it.ent.kind === 'bot' || it.ent.kind === 'incident' || !it.pos || !it.pos.room) return;
      var r = LAY && LAY.room(it.pos.room); if (r && (r.type === 'room' || r.type === 'remote')) found = it;   /* 走道上不能訪談 */
    });
    return found;
  }
  function roomNm(id) { var r = window.ERG_LAYOUT && window.ERG_LAYOUT.room(id); return r ? r.name : id; }
  function recOf(c, pid) { var l = c.player.interviews || []; for (var i = 0; i < l.length; i++) if (l[i] && l[i].personaId === pid) return l[i]; return null; }
  function cardsByPid(c) { var o = {}, RL = window.ERG_REPORT_LEVEL; (RL ? RL.interviewed(c.player.interviews) : []).forEach(function (p) { o[p] = 1; }); return o; }
  function stepFor(c) {
    var SBG = window.ERG_STORYBOARD, a = app(), cards = cardsByPid(c), n = Object.keys(cards).length, P = a && a.w8Data ? a.w8Data() : null, act = null;
    if (SBG && n >= 1) act = SBG.nextAction({ main: { code: c.code }, P: P, mobile: MOB });
    var wl = wlFor(c), here = {}; wl.forEach(function (w) { here[w.pid] = !!whereNow(c, w.pid); });
    return U.nextStep({ wl: wl, cards: cards, here: here, action: act });
  }
  function personStatus(c, w) {
    var rec = recOf(c, w.pid), RL = window.ERG_REPORT_LEVEL, CL = window.ERG_CHECKLIST, done = RL && RL.interviewed(c.player.interviews).indexOf(w.pid) >= 0;
    if (!rec) return { text: '還沒問', btn: '去問' };
    var pr = CL ? CL.progress(rec) : { done: 0, total: 3 };
    return { text: done ? '訪談卡已記 ' + pr.done + '/' + pr.total + ' 項' : '聊過了，還沒記訪談卡', btn: '繼續問' };
  }
  function avHtml(w, i) {
    var ch = esc(String(w.name).charAt(0)), inner = PORTRAIT_ON ? '<img alt="" src="' + PORTRAIT_DIR + esc(w.pid) + '.png" onerror="this.nextSibling.removeAttribute(&quot;style&quot;);this.parentNode.removeChild(this)"><span style="display:none">' + ch + '</span>' : ch;   /* 沒有圖的人物退回姓氏圓卡 */
    return '<span class="nvAv" data-pid="' + esc(w.pid) + '" style="background:' + AV_COLORS[i % AV_COLORS.length] + '" aria-hidden="true">' + inner + '</span>';
  }
  function peopleHtml(c) {
    var simMin = RM().simMin(), LV = { free: '可以聊', short: '簡短回答', blocked: '正忙' };
    return wlFor(c).map(function (w, i) {
      var it = whereNow(c, w.pid), where = '不在急診室裡', lv = '', st = personStatus(c, w);
      if (it) { where = '在' + roomNm(it.pos.room); try { lv = LV[c.world.availability(it.ent, it.pos, simMin).level] || ''; } catch (e) {} }
      return '<div class="nvPerson" data-pid="' + esc(w.pid) + '">' + avHtml(w, i) + '<div class="nvPN"><b>' + esc(w.name) + '</b>　' + esc(w.role) + '<div class="muted">' + esc(where) + (lv ? '・' + esc(lv) : '') + '</div></div>' +
        '<span class="nvPS">' + esc(st.text) + '</span><button type="button" class="nvBtn nvAsk" data-ask="' + esc(w.pid) + '"' + (it ? '' : ' disabled') + '>' + esc(it ? st.btn : '現在不在') + '</button></div>';
    }).join('');
  }
  function counts(c) {
    var L = window.ERG_LOGIC, RMv = RM(), m = []; try { m = L.listMarkers(RMv.markerEls()).filter(function (x) { return String(x.author) === String(ENV.sid); }); } catch (e) {}
    var clues = m.filter(function (x) { return x.type === '勘查卡'; }).length;
    return { clues: clues, notes: m.length - clues };
  }
  function sbBtnHtml(c) {
    var SBG = window.ERG_STORYBOARD, RL = window.ERG_REPORT_LEVEL; if (!SBG || !RL) return '';
    var iv = c.player.interviews || [], nd = SBG.need({ cards: RL.interviewed(iv).length, started: iv.filter(function (x) { return x && x.personaId; }).length });
    return nd.ok ? '<a class="nvBtn nvLink" href="storyboard.html?room=' + encodeURIComponent(c.code) + '">開故事板</a>' : '<button type="button" class="nvBtn" disabled title="' + esc(nd.text) + '">開故事板（' + esc(nd.short) + '）</button>';
  }
  function ensureRoomDom() {
    if ($('nvRoom')) return $('nvRoom');
    var g = $('game'), tb = $('topbar'); if (!g || !tb) return null;
    var d = document.createElement('div'); d.id = 'nvRoom'; d.setAttribute('role', 'main');
    d.innerHTML = '<div class="nvTitle"><b id="nvCase"></b></div><div id="nvNext" aria-live="polite"></div><div id="nvPeople" class="nvGrid"></div><div id="nvAi" class="nvBox"></div><div id="nvBar" class="nvBar"></div>';
    tb.parentNode.insertBefore(d, tb.nextSibling);
    d.addEventListener('click', onRoomClick);
    return d;
  }
  function onRoomClick(e) {
    var b = e.target.closest && e.target.closest('button,a'); if (!b) return;
    if (b.dataset.ask) { nvAsk(b.dataset.ask); return; }
    if (b.id === 'nvNextBtn') { var c = curRoom(), s = c && stepFor(c); if (!s) return; if (s.kind === 'ask') nvAsk(s.pid); else if (s.kind === 'export') { var P = window.ERG_PANELS; if (P && P.exportFromLobby) { b.disabled = true; P.exportFromLobby(s.code, function () { b.disabled = false; }); } } return; }
    if (b.dataset.pane) { openPane(b.dataset.pane); return; }
    if (b.dataset.toExpert) { UI.setLevel(3, 'self'); return; }
  }
  var lastSig = {};
  function put(id, html) { if (lastSig[id] === html) return; lastSig[id] = html; var el = $(id); if (el) el.innerHTML = html; }
  function renderRoom() {
    var c = curRoom(); if (!c || !ensureRoomDom()) return;
    put('nvCase', esc(c.world.meta.short || c.world.meta.name));
    var s = stepFor(c);
    var btn = s.kind === 'story' ? '<a class="nvBtn big" href="' + esc(s.href) + '">' + esc(s.label) + '</a>' : (s.kind === 'ask' || s.kind === 'export' ? '<button type="button" class="nvBtn big" id="nvNextBtn">' + esc(s.label) + '</button>' : (s.kind === 'pc' ? '<span class="muted">' + esc(s.label) + '</span>' : ''));
    put('nvNext', '<div class="nvNextBox"><div style="flex:1"><div class="nvK">下一步</div><div class="nvT">' + esc(s.text) + '</div></div>' + btn + '</div>');
    put('nvPeople', peopleHtml(c));
    var k = counts(c);
    put('nvBar', '<button type="button" class="nvBtn" data-pane="clue">線索 ' + k.clues + ' 張</button><button type="button" class="nvBtn" data-pane="cards">筆記卡 ' + k.notes + ' 張</button>' + sbBtnHtml(c) + '<span style="flex:1"></span><button type="button" class="nvLinkBtn" data-to-expert="1">想再問其他人？切到專家模式</button>');
    mountAi(c, s);
  }

  /* ───── 助教區（卡片畫面）：固定問題在這裡回答；打字問才走原本的訪談助教（名額共用） ───── */
  var FAQ = [
    { q: '我可以怎麼問？', a: '試著問具體的一次經驗，例如「那天你在哪裡、旁邊有誰？」問法要用你自己的話。' },
    { q: '他說的其他困擾算數嗎？', a: U.CONSEQUENCE_TEXT },
    { q: '「出處」是什麼意思？', a: '出處是這句話從哪裡來：是哪一位、第幾次訪談說的。故事板每一格都要附出處，別人才知道不是你編的。' },
    { q: '接下來要做什麼？', a: null }
  ];
  function mountAi(c, step) { var host = $('nvAi'); if (host) buildAi(host, 'nvAi'); }
  /* 助教區的 DOM：p＝id 前綴（新手房間 'nvAi'、中級房間 'lv2Ai'），元素 id＝p+'Ans'／p+'In'／p+'Go' */
  function buildAi(host, p) {
    if (!host || host.firstChild) return;
    host.innerHTML = '<div class="nvRow"><b>問 AI 助教</b>' + FAQ.map(function (f, i) { return '<button type="button" class="nvChip" data-faq="' + i + '">' + esc(f.q) + '</button>'; }).join('') + '</div>' +
      '<div id="' + p + 'Ans" class="nvAns" aria-live="polite">看不懂哪裡，點上面的問題，或直接打字問。</div>' +
      '<div class="nvRow"><label style="flex:1;display:flex"><span class="nvSr">輸入問題</span><input id="' + p + 'In" maxlength="200" placeholder="看不懂哪裡，直接問助教" style="flex:1"></label><button type="button" class="nvBtn" id="' + p + 'Go">送出</button></div>' +
      '<div class="muted nvSmall">點上面的固定問題不會用掉名額；打字送出會用掉今天的助教名額。</div>';
    host.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.dataset.faq !== undefined) { var f = FAQ[Number(b.dataset.faq)], cc = curRoom(), a = f.a; if (a === null && cc) a = stepFor(cc).text; $(p + 'Ans').textContent = a || ''; return; }
      if (b.id === p + 'Go') aiSend(p);
    });
    $(p + 'In').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); aiSend(p); } });
  }
  function aiSend(p) {
    p = p || 'nvAi';
    var inp = $(p + 'In'), ans = $(p + 'Ans'), v = (inp.value || '').trim(), c = curRoom(), a = app(); if (!v) { ans.textContent = '先寫下你想問的事。'; return; }
    if (!a || !a.online || !fb() || !window.ERG_ICHAT || !c) { ans.textContent = '助教現在連不上（離線或測試模式沒有助教）。可以先點上面的固定問題。'; return; }
    if (!c._nvChat) c._nvChat = window.ERG_ICHAT.create({ db: fb(), sess: a.SESS, sid: ENV.sid, cls: ENV.cls, name: (a.me && a.me.name) || '', room: c.code, getPersona: function () { return {}; } });
    $(p + 'Go').disabled = true; ans.textContent = '助教在想…';
    c._nvChat.send(v).then(function (r) { ans.textContent = (r && r.text) || '（沒有回答）'; inp.value = ''; $(p + 'Go').disabled = false; }, function () { ans.textContent = '助教現在連不上，稍後再試。'; $(p + 'Go').disabled = false; });
  }

  /* ───── 點人物 → 專心對談；線索、筆記卡 → 沿用原本的分頁，全螢幕顯示 ───── */
  function goToPerson(pid, msg) {
    var c = curRoom(), R = RM(); if (!c || !R) return false;
    var it = whereNow(c, pid); if (!it) { if (R.toast) R.toast(msg); return false; }
    var ent = it.ent, room = it.pos.room;
    if (c.player.loc !== room) { c.pendingNpc = ent.id; if (R.teleport) R.teleport(room); }
    c.pendingNpc = null; c.selNpc = ent.id; c.selRecPid = null;
    return true;
  }
  function nvAsk(pid) { if (goToPerson(pid, '他現在不在急診室裡，過一會兒再來。')) openPane('intv'); }
  function openPane(kind) {
    var c = curRoom(), R = RM(); if (!c || !R) return;
    ST.pane = kind; UI._inPane = true;
    document.body.classList.add('nvPane'); document.body.classList.toggle('nvTalk', kind === 'intv');
    try { R.switchTab(kind); } catch (e) {}
    UI._inPane = false; renderPaneHead();
    try { window.scrollTo(0, 0); } catch (e) {}
  }
  function closePane() {
    var c = curRoom(), R = RM();
    document.body.classList.remove('nvPane', 'nvTalk'); ST.pane = '';
    if (c) { c.selNpc = null; c.selRecPid = null; c.intvHold = false; c.tab = 'clue'; if (c._nvPaneOff) c._nvPaneOff = false; }
    if (R && R.switchTabQuiet) R.switchTabQuiet('clue');
    var h = $('nvPaneHead'); if (h) h.innerHTML = '';
    lastSig = {}; renderRoom();
  }
  function paneHost() { return $('side'); }
  function renderPaneHead() {
    var side = paneHost(); if (!side) return; var h = $('nvPaneHead');
    if (!h) { h = document.createElement('div'); h.id = 'nvPaneHead'; side.insertBefore(h, side.firstChild); h.addEventListener('click', onHeadClick); }
    var c = curRoom(), kind = ST.pane, html = '<button type="button" class="nvBtn" data-back="1">回到卡片</button>';
    if (kind === 'intv' && c) {
      var w = wlFor(c).filter(function (x) { return c.world.entityById && true; }), ent = null;
      var cand = wlFor(c).filter(function (x) { var it = whereNow(c, x.pid); return it && it.ent.id === c.selNpc; })[0];
      html += '<b class="nvTalkT">和 ' + esc(cand ? cand.name + '（' + cand.role + '）' : '他') + ' 對談</b><span style="flex:1"></span>' +
        '<button type="button" class="nvChip" data-ic="1">助教：我可以怎麼追問？</button><button type="button" class="nvChip" data-ic="2">助教：給我例子</button>';
    } else html += '<b class="nvTalkT">' + (kind === 'clue' ? '線索' : '筆記卡') + '</b>';
    h.innerHTML = html;
    var cl = $('nvClueList'); if (cl) cl.remove();
    if (kind === 'clue' && c) {
      var box = document.createElement('div'); box.id = 'nvClueList';
      box.innerHTML = '<div class="muted">點一條，會帶你到那間房讀它：</div>' + (c.world.clues || []).map(function (x) { return '<button type="button" class="nvChip" data-clue="' + esc(x.id) + '" data-room="' + esc(x.pin.room) + '">' + esc(x.id) + '　' + esc(x.title) + '</button>'; }).join('');
      h.parentNode.insertBefore(box, h.nextSibling);
      box.addEventListener('click', function (e) { var b = e.target.closest('button[data-clue]'); if (!b) return; var cc = curRoom(), R = RM(); if (!cc) return; if (cc.player.loc !== b.dataset.room && R.teleport) R.teleport(b.dataset.room); cc.selClue = b.dataset.clue; UI._inPane = true; try { R.switchTab('clue'); } catch (x) {} UI._inPane = false; });
    }
  }
  function onHeadClick(e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b.dataset.back) { closePane(); return; }
    if (b.dataset.ic) {
      var a1 = $('icAsk'); if (!a1) { if (RM().toast) RM().toast('現在連不上助教，先自己問問看。'); return; }
      a1.click(); if (b.dataset.ic === '2') setTimeout(function () { var ex = $('icEx'); if (ex) ex.click(); }, 80);
    }
  }

  /* 每 0.6 秒：進出房間、切換模式、背景事件把分頁切走時，讓畫面跟上 */
  function patchRoom() {
    var R = RM(); if (!R || ST.patched || !R.switchTab) return; ST.patched = true;
    var orig = R.switchTab; R.switchTabQuiet = function (t) { UI._inPane = true; try { orig(t); } finally { UI._inPane = false; } };
    R.switchTab = function (t) {
      var args = Array.prototype.slice.call(arguments);
      if (ST.scope && U.MID_HIDDEN_TABS.indexOf(t) >= 0) { args[0] = t = 'intv'; }   /* 中級沒有「事件簿」「討論」：例如事件提示按「去事件簿」，改開訪談 */
      var r = orig.apply(this, args);
      if (ST.roomOn && !UI._inPane && (t === 'intv' || t === 'clue' || t === 'cards')) openPane(t);   /* 例如「事件」提示按去訪談：新手畫面也要開得起來 */
      return r;
    };
    R.blocked = function (id) {   /* 灰色房間不能進（room.js／m.js 的 startTravel、jumpTo、goRemote 會先問這裡） */
      var sc = ST.scope; if (!sc || sc.rooms.indexOf(id) >= 0) return false;
      var t = roomTypeOf(id); if (t !== 'room' && t !== 'remote') return false;
      if (R.toast) R.toast(U.GREY_TEXT + '想去的話，切到專家模式。'); return true;
    };
    R.decorateChips = decorateChips;
    var en = R.enter; if (en) R.enter = function () { var r = en.apply(this, arguments); try { sync(); } catch (e) {} return r; };
  }
  function sync() {
    if (ENV.demo) return;
    patchRoom(); try { syncMid(); } catch (e) { if (window.console) console.error('中級模式', e); }
    var c = curRoom(), want = !!(UI.isNovice() && roomActive() && supported(c));
    if (want !== ST.roomOn) {
      ST.roomOn = want; document.body.classList.toggle('nvRoom', want); document.body.classList.toggle('nvM', want && MOB);
      if (want) { lastSig = {}; ensureRoomDom(); }
      else { document.body.classList.remove('nvPane', 'nvTalk'); ST.pane = ''; var h = $('nvPaneHead'); if (h) h.innerHTML = ''; if (c) { c.intvHold = false; } if (c && roomActive()) { try { RM().switchTabQuiet && RM().switchTabQuiet('clue'); } catch (e) {} if (MOB) { try { window.scrollTo(0, 0); } catch (e) {} } }   /* 手機：離開新手時分頁切換會把頁面捲到分頁列，回到最上面才看得到場景 */ try { window.dispatchEvent(new Event('resize')); } catch (e) {} }
    }
    if (want) {
      if (ST.pane !== 'intv' || !document.body.classList.contains('nvPane')) renderRoom();
      if (window.__ergTalk && c && c.world) { var pid = window.__ergTalk; window.__ergTalk = null; setTimeout(function () { nvAsk(pid); }, 150); }   /* 故事板「回去問人」帶來的 */
    }
  }
  UI.sync = sync; UI._reset = function () { ST.nudgeAt = 0; }; setInterval(sync, 600);

  /* ───── 中級：場景留著，房間與人物少一些 ───── */
  function roomTypeOf(id) { var r = window.ERG_LAYOUT && window.ERG_LAYOUT.room(id); return r ? r.type : ''; }
  function travelIds() { var L = window.ERG_LAYOUT; return L && L.ROOMS ? L.ROOMS.filter(function (r) { return r.type === 'room' || r.id === 'home' || r.id === 'clinic'; }).map(function (r) { return r.id; }) : []; }
  function scopeOf(c) {
    var LAY = window.ERG_LAYOUT, pers = (c.world && c.world.personas) || {};
    return U.scopeFor(2, caseIdOf(c), { rooms: function (r) { return !!(LAY && LAY.room(r)); }, pids: function (p) { return !!pers[p]; } });
  }
  function doStep(s, b) {
    var R = RM(); if (!s) return;
    if (s.kind === 'ask') { if (goToPerson(s.pid, '他現在不在開放的房間裡，過一會兒再來。') && R) R.switchTab('intv'); }
    else if (s.kind === 'export') { var P = window.ERG_PANELS; if (P && P.exportFromLobby) { b.disabled = true; P.exportFromLobby(s.code, function () { b.disabled = false; }); } }
  }
  function onStripClick(e) {
    var b = e.target.closest && e.target.closest('button,a'); if (!b) return;
    if (b.id === 'lv2NextBtn') { var c = curRoom(); if (c) doStep(stepFor(c), b); }
  }
  function mountStrip(c) {
    var tabs = $('tabs'); if (!tabs || !tabs.parentNode) return;
    var st = $('lv2Strip');
    if (!st) {
      st = document.createElement('div'); st.id = 'lv2Strip'; st.className = 'nvKeep';
      st.innerHTML = '<div id="lv2Next" aria-live="polite"></div><details id="lv2AiBox"><summary>問 AI 助教</summary><div id="lv2Ai"></div></details><div class="muted nvSmall" id="lv2Note"></div>';
      tabs.parentNode.insertBefore(st, MOB ? ($('tabsAnchor') || tabs) : tabs); st.addEventListener('click', onStripClick);
      buildAi($('lv2Ai'), 'lv2Ai'); $('lv2Note').textContent = U.SCOPE_NOTE; delete lastSig.lv2Next;
    }
    var s = stepFor(c);
    var btn = s.kind === 'story' ? '<a class="nvBtn big" href="' + esc(s.href) + '">' + esc(s.label) + '</a>' : (s.kind === 'ask' || s.kind === 'export' ? '<button type="button" class="nvBtn big" id="lv2NextBtn">' + esc(s.label) + '</button>' : '');
    put('lv2Next', '<div class="nvNextBox"><div style="flex:1;min-width:120px"><div class="nvK">下一步</div><div class="nvT">' + esc(s.text) + '</div></div>' + btn + '</div>');
  }
  function chipsHtml(sc, here) {
    var L = window.ERG_LAYOUT, sp = U.roomSplit(sc, travelIds()), nm = function (id) { return id === 'home' ? '🚌 病患的家' : ((L && L.room(id) || {}).name || id); };
    var open = sp.open.filter(function (id) { return id !== here; }).map(function (id) { return '<button type="button" class="ghost chip" data-lv2go="' + esc(id) + '">' + esc(nm(id)) + '</button>'; }).join('');
    var show = sp.grey.slice(0, 3), more = sp.grey.length - show.length;
    var grey = show.map(function (id) { return '<button type="button" class="ghost chip nvGreyRoom" aria-disabled="true" data-lv2grey="' + esc(id) + '" title="' + esc(U.GREY_TEXT) + '">' + esc(nm(id).replace(/（.*$/, '')) + '</button>'; }).join('') +
      (more > 0 ? '<button type="button" class="ghost chip nvGreyRoom" aria-disabled="true" data-lv2grey="*" title="' + esc(U.GREY_TEXT) + '">其他 ' + more + ' 間</button>' : '');
    return '<b>去別的房間：</b>' + (open || '<span class="muted">（這裡就是全部）</span>') + (grey ? ' <b class="muted">專家才開：</b>' + grey : '');
  }
  function bindChips(host) {
    if (host._lv2b) return; host._lv2b = true;
    host.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('button'); if (!b) return; var R = RM();
      if (b.dataset.lv2go && R) { R.travel(b.dataset.lv2go); return; }
      if (b.dataset.lv2grey && R && R.toast) R.toast(U.GREY_TEXT + '想去的話，切到專家模式。');
    });
  }
  function decorateChips() {
    var sc = ST.scope, c = curRoom(); if (!sc || !c) return;
    var host = $('visitedChips'), nav = $('nav'), here = c.player && c.player.loc, html = chipsHtml(sc, here);
    if (host) { host.innerHTML = html; host.setAttribute('data-lv2', '1'); bindChips(host); return; }
    if (nav && MOB) {
      var mb = nav.querySelector('#mapBtn'), more = nav.querySelector('#navMore'); nav.innerHTML = ''; if (mb) nav.appendChild(mb);
      nav.insertAdjacentHTML('beforeend', html); if (more) nav.appendChild(more); nav.setAttribute('data-lv2', '1'); bindChips(nav);
    }
  }
  function greyMap(sc) {
    var rs = {}; if (sc) sc.rooms.forEach(function (r) { rs[r] = 1; });
    function paint(el, id) { var t = roomTypeOf(id), grey = !!sc && (t === 'room' || t === 'remote') && !rs[id]; if (el.classList.contains('nvGreyRm') !== grey) el.classList.toggle('nvGreyRm', grey); }
    Array.prototype.forEach.call(document.querySelectorAll('g.ermm-click[data-room]'), function (g) { paint(g, g.getAttribute('data-room')); });
    Array.prototype.forEach.call(document.querySelectorAll('.mLabel[data-room-label]'), function (g) { paint(g, g.getAttribute('data-room-label')); });
  }
  function syncMid() {
    var c = curRoom(), w = c && c.world, R = RM(), sc = (UI.isMid() && roomActive() && w) ? scopeOf(c) : null;
    if (ST.scopeWorld && ST.scopeWorld !== w) { U.removeScope(ST.scopeWorld); ST.scopeWorld = null; }
    var was = !!ST.scope;
    if (sc) {
      var sig = sc.rooms.join(',') + '|' + sc.pids.join(',');
      if (w.__lvScope && w.__lvScope.sig !== sig) U.removeScope(w);
      if (!w.__lvScope) U.applyScope(w, sc, roomTypeOf);
      ST.scopeWorld = w; ST.scope = sc; document.body.classList.add('lv2Room');
      if (!was && c.player && sc.rooms.indexOf(c.player.loc) < 0 && R && R.teleport) { R.teleport('entrance'); if (R.toast) R.toast('剛才那間房在專家模式才開，先帶你回入口大廳。'); }
      if (c.selNpc && !(w.at(c.clock.worldSec).some(function (it) { return it.ent.id === c.selNpc; }))) { /* 選到的人不在開放房間裡了：保留選取，由訪談面板自己處理「走開了」 */ }
      mountStrip(c);
      var h = $('visitedChips') || (MOB ? $('nav') : null);
      if (R && R.renderChips && (!was || (h && h.getAttribute('data-lv2') !== '1'))) { try { R.renderChips(); } catch (e) {} }
      greyMap(sc);
      if (U.MID_HIDDEN_TABS.indexOf(c.tab) >= 0 && R) R.switchTab('intv');
    } else if (was || document.body.classList.contains('lv2Room')) {
      if (ST.scopeWorld) U.removeScope(ST.scopeWorld);
      ST.scopeWorld = null; ST.scope = null; document.body.classList.remove('lv2Room');
      var st = $('lv2Strip'); if (st) st.remove(); delete lastSig.lv2Next;
      var h2 = $('visitedChips') || $('nav'); if (h2) h2.removeAttribute('data-lv2');
      if (c && R && R.renderChips) { try { R.renderChips(); } catch (e) {} }
      greyMap(null);
    }
  }

  /* ───── 大廳：新手版面＋進大廳詢問 ───── */
  function nameMapFor(caseId) {
    UI._nm = UI._nm || {}; if (UI._nm[caseId]) return UI._nm[caseId];
    var m = {}; try { var w = window.ERG_WORLD.makeWorld({ caseId: caseId, seed: 'NM' }); Object.keys(w.personas).forEach(function (k) { m[k] = w.personas[k].name; }); } catch (e) {}
    return (UI._nm[caseId] = m);
  }
  UI.lobby = function () {
    if (ENV.demo || !ENV.sid || !$('lobby')) return;
    var a = app(); markToday();
    var wrap = document.querySelector('#lobby .wrap'); if (!wrap) return;
    var nov = UI.isNovice();
    renderNudge(wrap);
    var nl = $('nvLobby');
    if (!nov) { if (nl) nl.remove(); Array.prototype.forEach.call(wrap.querySelectorAll('.nvShow'), function (x) { x.classList.remove('nvShow'); }); return; }
    if (!nl) { nl = document.createElement('div'); nl.id = 'nvLobby'; nl.className = 'nvKeep'; var anchor = $('nvNudge') || wrap.querySelector('.row'); anchor.parentNode.insertBefore(nl, anchor.nextSibling); nl.addEventListener('click', onLobbyClick); }
    var rooms = stats().rooms, last = ''; try { last = localStorage.getItem('erg_last_room_' + ENV.sid) || ''; } catch (e) {}
    rooms.sort(function (x, y) { return (y.cards - x.cards) || ((y.code === last) - (x.code === last)) || (y.joined - x.joined); });
    var main = rooms[0] || null, others = rooms.slice(1), SBG = window.ERG_STORYBOARD, CASELIST = a.CASELIST || [];
    var cmeta = function (id) { var c = CASELIST.filter(function (x) { return x.meta.id === id; })[0]; return c ? c.meta : { short: id, name: id }; };
    var step, due = SBG ? SBG.dueText(ENV.cls, Date.now()) : '';
    due = (due.replace(/^你這班的作業期限：/, '').split('、').filter(function (x) { return /^W8~9/.test(x); })[0] || '').replace(/^W8~9\s*/, '');
    if (!main) step = { kind: 'make', text: '先開一間房，再去問一位病人或家屬', label: '開第一間房' };
    else {
      var nm = nameMapFor(main.caseId), wl = U.whitelist(main.caseId).map(function (x) { return { pid: x.pid, role: x.role, kin: x.kin, name: nm[x.pid] || x.pid }; }), cards = {}, RL = window.ERG_REPORT_LEVEL;
      (RL ? RL.interviewed(main.interviews) : []).forEach(function (p) { cards[p] = 1; });
      var P = a.w8Data ? a.w8Data() : null, act = (SBG && Object.keys(cards).length) ? SBG.nextAction({ main: { code: main.code }, P: P, mobile: MOB }) : null;
      step = U.nextStep({ wl: wl, cards: cards, action: act }); step.main = main.code;
    }
    var left = a.pastLeft ? a.pastLeft() : null, P2 = a.w8Data ? a.w8Data() : null;
    var btn = step.kind === 'story' ? '<a class="nvBtn big" href="' + esc(step.href) + '">' + esc(step.label) + '</a>'
      : (step.kind === 'ask' ? '<button type="button" class="nvBtn big" data-go-room="' + esc(main.code) + '" data-go-pid="' + esc(step.pid) + '">' + esc(step.label) + '</button>'
      : (step.kind === 'make' ? '<button type="button" class="nvBtn big" data-make="1">' + esc(step.label) + '</button>' : (step.kind === 'export' ? '<button type="button" class="nvBtn big" data-go-room="' + esc(main.code) + '">回房間做人物誌</button>' : '')));
    var again = step.kind === 'story' && main ? '<button type="button" class="nvBtn" data-go-room="' + esc(main.code) + '">再去問人</button>' : '';
    var html = '<div class="nvBox nvTask"><div class="nvK">本週任務｜W8~9' + (due ? '　期限 ' + esc(due) : '') + '</div><div class="nvT">下一步：' + esc(step.text.replace(/^下一步：/, '')) + '</div><div class="nvRow">' + btn + again + '<span style="flex:1"></span>' +
      '<button type="button" class="nvBtn" data-toggle="sbCard">看全部</button></div></div>';
    html += '<div class="nvBox"><div class="nvRow"><div style="flex:1"><b>我的房間</b><div>' + (main ? esc(cmeta(main.caseId).short || cmeta(main.caseId).name) + '・訪談卡 ' + main.cards + ' 張' : '還沒有房間') + '</div></div>' +
      (main ? '<button type="button" class="nvBtn" data-go-room="' + esc(main.code) + '">回去</button>' : '') + (others.length || !main ? '<button type="button" class="nvBtn" data-toggle="rooms">' + (others.length ? '其他 ' + others.length + ' 間房' : '開新房間／加入') + '</button>' : '<button type="button" class="nvBtn" data-toggle="rooms">開新房間／加入</button>') + '</div></div>';
    html += '<div class="nvRow"><span id="nvMatHost" style="flex:1 1 100%"></span>' + (left != null ? '<button type="button" class="nvBtn" data-toggle="past">前幾週還差 ' + left + ' 項</button>' : '<button type="button" class="nvBtn" data-toggle="past">前幾週的事</button>') + '</div>';
    if (nl.getAttribute('data-sig') !== html) { nl.innerHTML = html; nl.setAttribute('data-sig', html); }
    var mc = $('matCard'), host = $('nvMatHost');
    if (mc && host && !host.contains(mc)) { var det = document.createElement('details'); det.className = 'nvMat'; det.innerHTML = '<summary>本週教材（W8~9）</summary>'; det.appendChild(mc); host.innerHTML = ''; host.appendChild(det); }
    else if (!mc && host && !host.firstChild) host.style.display = 'none';
  };
  function onLobbyClick(e) {
    var b = e.target.closest('button'); if (!b) return; var a = app(), wrap = document.querySelector('#lobby .wrap');
    if (b.dataset.goRoom) { if (b.dataset.goPid) window.__ergTalk = b.dataset.goPid; if (a.joinCode) a.joinCode(b.dataset.goRoom); return; }
    if (b.dataset.make) { toggleShow(wrap, 'rooms', true); var cb = $('createBtn'); if (cb) { cb.scrollIntoView({ block: 'center' }); cb.focus(); } return; }
    if (b.dataset.toggle) toggleShow(wrap, b.dataset.toggle);
  }
  function toggleShow(wrap, what, force) {
    var els = what === 'sbCard' ? [$('sbCard')] : (what === 'past' ? [$('progressBox') && $('progressBox').closest('.card')] : [$('createBtn') && $('createBtn').closest('.card'), wrap.querySelector('h2'), $('roomRows') && $('roomRows').closest('.card')]);
    els = els.filter(Boolean); var on = force === undefined ? !els[0].classList.contains('nvShow') : force;
    els.forEach(function (x) { x.classList.toggle('nvShow', on); });
  }
  function renderNudge(wrap) {
    var old = $('nvNudge'), a = app();
    if (!ST.nudge) {
      if (Date.now() - (ST.nudgeAt || 0) < 30000) { if (old) old.remove(); return; }   /* 大廳每幾秒重畫一次，判準要掃全部房間；進大廳時算一次，30 秒內不重算 */
      ST.nudgeAt = Date.now();
      var st = stats(), n = U.nudgeFor({ level: ST.lv, days: st.days, cards: st.cards, cells: st.cells, badges: st.badges, entered: st.entered, today: U.dayKey(Date.now()), lastAskDay: ST.logState.lastAskDay, declines: ST.logState.declines, inRoom: roomActive() });
      if (!n) { if (old) old.remove(); return; }
      ST.nudge = n; UI.logOnly(n.kind + '-shown', n.to);
    }
    var n2 = ST.nudge, tx = U.nudgeText(n2);
    if (!old) { old = document.createElement('div'); old.id = 'nvNudge'; old.className = 'nvKeep nvBox nvDash'; var row = wrap.querySelector('.row'); row.parentNode.insertBefore(old, row.nextSibling);
      old.addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; var nn = ST.nudge; if (!nn) return; ST.nudge = null;
        if (b.dataset.yes) UI.setLevel(nn.to, nn.kind + '-accept'); else { UI.logOnly(nn.kind + '-decline', nn.to); old.remove(); } }); }
    var html = '<b style="font-size:18px">' + esc(tx.title) + '</b><div>' + esc(tx.body) + '</div><div class="nvRow"><button type="button" class="nvBtn big" data-yes="1">' + esc(U.NUDGE_BTN.yes[n2.kind]) + '</button><button type="button" class="nvBtn" data-no="1">' + esc(U.NUDGE_BTN.no) + '</button></div>';
    if (old.getAttribute('data-sig') !== html) { old.innerHTML = html; old.setAttribute('data-sig', html); }
  }

  /* ───── 故事板：新手（一次一格） ───── */
  var SB_FAQ = [
    { q: '這一格要寫什麼？', a: function (api) { var t = api.SB.template(api.S.caseId)[(api.S.sel || 1) - 1]; return ((t && t.ask) || '誰、在哪、發生什麼、他怎麼想。') + ' 想想他當下在做什麼、看到什麼。訪談沒問到的，可以回去再問，或寫「推測」。'; } },
    { q: '怎麼知道他怎麼想？', a: function () { return '看他在訪談裡怎麼說，特別是「真正需要」那一欄和他的原話。沒問到的就寫「推測」，不要替他編。'; } },
    { q: '「出處」是什麼意思？', a: function () { return '出處是這句話從哪裡來：是哪一位、第幾次訪談說的。每一格都要附出處，別人才知道不是你編的。'; } }
  ];
  UI.sbBoot = function (api) { UI._sbApi = api; };
  UI.sbRender = function (api) {
    UI._sbApi = api; var nov = UI.isNovice() && IS_SB && !ENV.demo, mid = UI.isMid() && IS_SB;
    document.body.classList.toggle('nvSb', nov); document.body.classList.toggle('lv2Sb', mid);
    if (mid) { try { sbMid(api); } catch (e) { if (window.console) console.error('故事板中級', e); } } else sbMidOff();
    var bar = $('nvSbBar'); if (!nov) { if (bar) bar.remove(); Array.prototype.forEach.call(document.querySelectorAll('#cells .nvCur,#cells .nvQuote'), function (x) { x.classList.remove('nvCur'); if (x.classList.contains('nvQuote')) x.remove(); }); return; }
    var S = api.S, n = Math.max(1, Math.min(S.sel || 1, 6)); if (S.sel !== n) S.sel = n;
    var cellsEl = $('cells'); if (!cellsEl) return;
    var main = document.querySelector('main'); if (!bar) { bar = document.createElement('div'); bar.id = 'nvSbBar'; main.insertBefore(bar, main.firstChild); bar.addEventListener('click', function (e) { onSbClick(e, UI._sbApi); }); }
    var total = 6, filled = 0, dots = '';
    for (var i = 1; i <= total; i++) { var o = api.cellFor(i).c, has = api.SB.hasContent(o); if (has) filled++; dots += '<button type="button" class="nvDot' + (has ? ' got' : '') + (i === n ? ' cur' : '') + '" data-goto="' + i + '" aria-label="第 ' + i + ' 格' + (has ? '，已寫' : '，還沒寫') + '"></button>'; }
    var c = api.cellFor(n).c, tpl = api.SB.template(S.caseId)[n - 1];
    var html = '<div class="nvRow"><b style="font-size:22px">第 ' + n + ' 格，共 ' + total + ' 格' + (tpl && tpl.title ? '｜' + esc(tpl.title) : '') + '</b><span class="nvDots">' + dots + '</span></div>' +
      '<div class="nvRow"><button type="button" class="nvBtn" data-step="-1"' + (n <= 1 ? ' disabled' : '') + '>上一格</button><button type="button" class="nvBtn big" data-step="1"' + (n >= total ? ' disabled' : '') + '>下一格</button>' +
      '<button type="button" class="nvBtn" data-sbguide="1">引導我：這格怎麼寫</button><button type="button" class="nvBtn" data-sbfill="1"' + (c.aiText ? ' disabled' : '') + '>幫我寫一個示範（代填）</button></div>' +
      '<div class="muted nvSmall">代填的格子要改成自己的話才算你的（改寫超過六成就變回自己的）。引導不扣分；代填的格子幾乎不計分。</div>' +
      '<div class="nvRow"><b>問 AI 助教</b>' + SB_FAQ.map(function (f, i) { return '<button type="button" class="nvChip" data-sbfaq="' + i + '">' + esc(f.q) + '</button>'; }).join('') + '</div><div id="nvSbAns" class="nvAns" aria-live="polite"></div>' +
      (filled >= total ? '<div class="nvBox nvDone"><b>六格都寫好了。</b>這份作業還要放圖：切到專家模式補圖。<button type="button" class="nvBtn big" data-toexpert="1">切到專家模式</button></div>' : '');
    if (bar.getAttribute('data-sig') !== html) { var ans = $('nvSbAns') ? $('nvSbAns').textContent : ''; bar.innerHTML = html; bar.setAttribute('data-sig', html); if ($('nvSbAns') && ans) $('nvSbAns').textContent = ans; }
    Array.prototype.forEach.call(cellsEl.querySelectorAll('.cell'), function (el) { el.classList.toggle('nvCur', Number(el.dataset.n) === n); });
    var cur = cellsEl.querySelector('.cell.nvCur'); if (cur && !cur.querySelector('.nvQuote')) {
      var fr = api.S.frags || [], used = (c.refs || []), pick = fr.filter(function (f) { return used.indexOf(f.recId) >= 0; })[0], idx = -1;
      if (!pick && fr.length) { idx = (n - 1 + (S.nvFragShift || 0)) % fr.length; pick = fr[idx]; } else if (pick) idx = fr.indexOf(pick);
      var q = document.createElement('div'); q.className = 'nvQuote';
      var pid = pick ? pick.pid : '';
      q.innerHTML = pick ? '<b>你訪談時他說的話：</b>「' + esc(pick.text) + '」<span class="muted">　' + esc(pick.name) + '，出處 ' + esc(pick.recId) + '</span><div class="nvRow"><button type="button" class="nvBtn" data-fragput="' + idx + '">放進這格</button><button type="button" class="nvBtn" data-fragnext="1">換一句</button><a class="nvBtn nvLink" href="' + esc(api.gameHref + (api.code ? '#room=' + api.code + (pid ? '&talk=' + encodeURIComponent(pid) : '') : '')) + '">回去問' + esc(pick.name) + '</a></div>'
        : '<b>還沒有訪談原話可以放。</b>先回去問一個人，再來寫這一格。<div class="nvRow"><a class="nvBtn nvLink" href="' + esc(api.gameHref + (api.code ? '#room=' + api.code : '')) + '">回去問人</a></div>';
      var ask = cur.querySelector('.ask'); (ask || cur.querySelector('header')).insertAdjacentElement('afterend', q);
    }
  };
  /* ───── 故事板：中級（六格一覽、點開一格寫；有場景圖、助教引導與代填；比專家少痛點標記、起點卡、請隊友補） ───── */
  function sbMidOff() {
    var bar = $('l2SbBar'); if (bar) bar.remove();
    Array.prototype.forEach.call(document.querySelectorAll('#cells .l2Cur,#cells .l2Sum'), function (x) { if (x.classList.contains('l2Sum')) x.remove(); else x.classList.remove('l2Cur'); });
  }
  function sbMid(api) {
    var S = api.S, cellsEl = $('cells'); if (!cellsEl) return;
    var els = Array.prototype.slice.call(cellsEl.querySelectorAll('.cell')), total = els.length; if (!total) return;
    var filled = 0, firstEmpty = 0, noImg = [], i;
    for (i = 1; i <= total; i++) { var o = api.cellFor(i).c, has = api.SB.hasContent(o); if (has) filled++; else if (!firstEmpty) firstEmpty = i; if (!o.img) noImg.push(i); }
    if (!S.l2Init) { S.l2Init = true; S.sel = firstEmpty || 1; }
    var n = Math.max(1, Math.min(S.sel || 1, total)); S.sel = n;
    var c = api.cellFor(n).c, next;
    if (filled < total) next = { text: '第 ' + firstEmpty + ' 格還沒寫，點開來補上（已完成 ' + filled + '／' + total + '）', go: firstEmpty, label: '去第 ' + firstEmpty + ' 格' };
    else if (noImg.length) next = { text: '格子都寫好了。第 ' + noImg[0] + ' 格還沒放圖，點開來放上（已放圖 ' + (total - noImg.length) + '／' + total + '）', go: noImg[0], label: '去第 ' + noImg[0] + ' 格' };
    else next = { text: '格子和圖都完成了。可以下載成圖片或另存 PDF 交作業。', go: 0 };
    var empty = $('sbEmpty') && !$('sbEmpty').hidden;
    var html = '<div class="nvNextBox"><div style="flex:1;min-width:160px"><div class="nvK">下一步</div><div class="nvT">' + esc(next.text) + '</div></div>' + (next.go && next.go !== n ? '<button type="button" class="nvBtn big" data-goto="' + next.go + '">' + esc(next.label) + '</button>' : '') + '</div>' +
      '<div class="nvRow">' + (empty ? '' : '<button type="button" class="nvBtn" data-draft="1">幫我排草稿</button>') + '<button type="button" class="nvBtn" data-sbguide="1">引導我：第 ' + n + ' 格怎麼寫</button><button type="button" class="nvBtn" data-sbfill="1"' + (c.aiText ? ' disabled' : '') + '>幫我寫一個示範（代填）</button></div>' +
      '<div class="nvRow"><b>問 AI 助教</b>' + SB_FAQ.map(function (f, k) { return '<button type="button" class="nvChip" data-sbfaq="' + k + '">' + esc(f.q) + '</button>'; }).join('') + '</div><div id="nvSbAns" class="nvAns" aria-live="polite"></div>' +
      '<div class="muted nvSmall">代填的格子要改成自己的話才算你的；引導不扣分。</div>';
    var bar = $('l2SbBar'), main = document.querySelector('main');
    if (!bar) { bar = document.createElement('div'); bar.id = 'l2SbBar'; (main || cellsEl.parentNode).insertBefore(bar, (main || cellsEl.parentNode).firstChild); bar.addEventListener('click', function (e) { onSbClick(e, UI._sbApi); }); }
    if (bar.getAttribute('data-sig') !== html) { var ans = $('nvSbAns') ? $('nvSbAns').textContent : ''; bar.innerHTML = html; bar.setAttribute('data-sig', html); if ($('nvSbAns') && ans) $('nvSbAns').textContent = ans; }
    els.forEach(function (el) {
      var k = Number(el.dataset.n), cur = k === n; el.classList.toggle('l2Cur', cur);
      var sum = el.querySelector('.l2Sum');
      if (cur) { if (sum) sum.remove(); el.removeAttribute('role'); el.removeAttribute('tabindex'); return; }
      var o2 = api.cellFor(k).c, has = api.SB.hasContent(o2), refs = (o2.refs || []).length;
      var h = '<b>' + esc(o2.title || '（還沒取名）') + '</b><div>' + esc(has ? String(o2.what || o2.who || '').slice(0, 44) : '還沒寫') + '</div><div class="muted nvSmall">' + (has ? (refs ? '有出處' : '還沒附出處') : '點開來寫') + (o2.img ? '・有圖' : '') + '</div>';
      if (!sum) { sum = document.createElement('div'); sum.className = 'l2Sum'; el.appendChild(sum); }
      if (sum.getAttribute('data-sig') !== h) { sum.innerHTML = h; sum.setAttribute('data-sig', h); }
      el.setAttribute('role', 'button'); el.setAttribute('tabindex', '0'); el.setAttribute('aria-label', '打開第 ' + k + ' 格');
    });
  }
  function sbMidOpen(e) {
    if (!IS_SB || !document.body.classList.contains('lv2Sb') || !UI._sbApi) return;
    if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
    var cell = e.target.closest && e.target.closest('#cells .cell'); if (!cell || cell.classList.contains('l2Cur')) return;
    e.preventDefault(); e.stopPropagation(); UI._sbApi.S.sel = Number(cell.dataset.n); UI._sbApi.renderAll(true);
    var cur = document.querySelector('#cells .l2Cur'); if (cur && cur.scrollIntoView) { try { cur.scrollIntoView({ block: 'nearest' }); } catch (x) {} }
  }
  document.addEventListener('click', sbMidOpen, true); document.addEventListener('keydown', sbMidOpen, true);
  function onSbClick(e, api) {
    var b = e.target.closest('button'); var S = api.S;
    if (!b && e.target.closest('a')) return; if (!b) return;
    if (b.dataset.goto) { S.sel = Number(b.dataset.goto); api.renderAll(true); return; }
    if (b.dataset.step) { S.sel = Math.max(1, Math.min(6, (S.sel || 1) + Number(b.dataset.step))); api.renderAll(true); try { window.scrollTo(0, 0); } catch (x) {} return; }
    if (b.dataset.toexpert) { UI.setLevel(3, 'self'); return; }
    if (b.dataset.draft) { var dr = $('draftBtn'); if (dr && !dr.disabled) dr.click(); return; }
    if (b.dataset.sbfaq !== undefined) { var f = SB_FAQ[Number(b.dataset.sbfaq)]; $('nvSbAns').textContent = f.a(api); return; }
    var CO = window.ERG_SB_COACH, n = S.sel || 1, c = api.cellFor(n).c;
    if (b.dataset.sbguide && CO) {   /* 引導：沿用助教的提示階梯（提示→檢查→示範句型），只到第 3 階；答案回來由助教自己記階 */
      var lv = Math.min(3, CO.nextLevel(c.cl)); CO._ask({ kind: CO.kindOfLevel(lv), level: lv, slot: n, ask: '', cur: { who: c.who, where: c.where, what: c.what, think: c.think }, label: '引導' }); return;
    }
    if (b.dataset.sbfill && CO) {   /* 代填：跟「卡住了」鈕的第 4 階同一套檢查與兩段式確認，答案照樣記 aiText */
      if (c.aiText) { api.toast('這格已經是助教示範了，改寫超過六成就變回自己的。'); return; }
      if (api.SB.hasContent(c)) { api.toast('這格已經有你寫的內容，代填只用在空格（不會蓋掉你寫的）。要代填請先把這格清空，或換一個空格。'); return; }
      if (!CO.fillAllowed(api.cur(), S.cfg)) { api.toast('這張故事板最多代填 ' + S.cfg.fillPerBoard + ' 格，其他格自己寫寫看。'); return; }
      api.twoStep(b, 'nvfill' + n, function () { CO._ask({ kind: 'fill', level: 4, slot: n, ask: '', cur: { who: c.who, where: c.where, what: c.what, think: c.think }, label: '代填（示範）' }); }, '代填的格子要改成自己的話才算你的，再按一次確定'); return;
    }
    if (b.dataset.fragnext !== undefined) { S.nvFragShift = (S.nvFragShift || 0) + 1; var q = document.querySelector('#cells .nvQuote'); if (q) q.remove(); api.renderAll(true); return; }
    if (b.dataset.fragput !== undefined) { var f2 = (S.frags || [])[Number(b.dataset.fragput)]; if (f2) api.insertFrag(n, f2); }
  }
  document.addEventListener('click', function (e) {   /* 「放進這格」「換一句」在格子裡，不在 #nvSbBar */
    if (!IS_SB || !document.body.classList.contains('nvSb')) return;
    var b = e.target.closest && e.target.closest('#cells .nvQuote button'); if (b && UI._sbApi) onSbClick({ target: b }, UI._sbApi);
  });

  /* ───── 樣式（只在新手模式才生效；專家什麼都不變） ───── */
  function injectCss() {
    if ($('uilvCss')) return; var st = document.createElement('style'); st.id = 'uilvCss';
    st.textContent = [
      '.uilvSw{display:inline-flex;align-items:stretch;border:var(--bw-s,2px) solid var(--ink);border-radius:var(--r-m,8px);overflow:hidden;background:var(--panel)}',
      '.uilvSw .lbl{align-self:center;padding:0 8px;font-size:var(--fs-2,13px);color:var(--muted)}',
      '.uilvSw button{min-height:44px;padding:0 14px;border:0;border-left:var(--bw-s,2px) solid var(--ink);border-radius:0;box-shadow:none;background:var(--panel);color:var(--fg);font-weight:400}',
      '.uilvSw button.on{background:var(--yellow);color:var(--ink-fixed,#1e1e1e);font-weight:900}',
      'body:not(.nvRoom) #topbar #uilvSwRoom[data-sheet="0"],body.nvRoom #side #uilvSwSide{display:none}#side>.uilvSw{margin:6px 8px 4px;align-self:flex-start;flex:none}',
      '#topbar .uilvSw[data-sheet="1"]{border:0;background:none;overflow:visible}#topbar .uilvSw[data-sheet="1"] button{border:var(--bw-t,1px) solid var(--ink);border-radius:var(--r-m,8px);min-height:32px;padding:0 10px;font-size:var(--fs-2,13px)}body.nvRoom #topbar .uilvSw[data-sheet="1"] button{min-height:44px}',
      '#uilvSheet{position:fixed;inset:0;z-index:2147483000}#uilvSheet .uilvBack{position:absolute;inset:0;background:rgba(0,0,0,.55)}',
      '#uilvSheet .uilvBox{position:absolute;left:0;right:0;bottom:0;background:var(--panel);color:var(--fg);border-top:var(--bw,3px) solid var(--ink);border-radius:16px 16px 0 0;padding:20px 16px calc(16px + env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:10px}',
      '#uilvSheet .uilvBox button{min-height:68px;text-align:left;padding:8px 14px;border:var(--bw-s,2px) solid var(--ink);border-radius:var(--r-m,10px);background:var(--panel);color:var(--fg);box-shadow:none;font-weight:400}#uilvSheet .uilvBox button.on{background:var(--yellow);color:var(--ink-fixed,#1e1e1e);border-width:var(--bw,3px)}#uilvSheet .uilvBox button.ghost{min-height:44px;text-align:center}',
      /* 新手共用元件 */
      '.nvBox{background:var(--panel);color:var(--fg);border:var(--bw,3px) solid var(--ink);border-radius:var(--r-m,10px);padding:14px 18px;margin:12px 0;display:flex;flex-direction:column;gap:10px}.nvBox.nvDash{border-style:dashed}',
      '.nvRow{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.nvSmall{font-size:var(--fs-2,13px)}.nvK{font-size:var(--fs-2,13px);font-weight:700}.nvT{font-size:22px;font-weight:900;line-height:1.35}',
      '.nvBtn,a.nvBtn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 16px;border:var(--bw-s,2px) solid var(--ink);border-radius:var(--r-m,8px);background:var(--panel);color:var(--fg);font-weight:700;font-size:var(--fs-3,15px);box-shadow:none;text-decoration:none;cursor:pointer}',
      '.nvBtn.big{min-height:52px;padding:0 24px;font-size:var(--fs-4,18px);font-weight:900;border-width:var(--bw,3px);background:var(--yellow);color:var(--ink-fixed,#1e1e1e)}.nvBtn:disabled{opacity:.45;cursor:not-allowed}',
      '.nvChip{min-height:44px;padding:0 12px;border:var(--bw-s,2px) solid var(--ink);border-radius:99px;background:var(--soft-b,#a5d8ff);color:var(--fg);font-size:var(--fs-2,14px);box-shadow:none;font-weight:400;cursor:pointer}',
      '.nvLinkBtn{min-height:44px;background:none;border:0;box-shadow:none;color:var(--fg);text-decoration:underline;font-weight:400;cursor:pointer}',
      '.nvAns{background:var(--code,#f1f5f7);border:var(--bw-s,2px) solid var(--line,#cfd8de);border-radius:var(--r-m,8px);padding:10px 12px;font-size:var(--fs-3,15px);min-height:44px}',
      '.nvAns:empty{display:none}.nvSr{position:absolute;left:-9999px}.nvBox input{min-height:44px}',
      /* 新手房間 */
      'body.nvRoom #topbar .nvKeep,body.nvRoom #topbar a.nvKeep{min-height:44px}body.lv1 #lobby .row>button,body.lv1 #lobby .row>.uilvSw button{min-height:44px}',
      'body.nvRoom #topbar>*:not(.nvKeep){display:none!important}body.nvRoom #liveBar~#nvRoom{margin-top:0}',
      '#nvRoom{display:none;flex:1;min-height:0;overflow:auto;padding:16px 40px 24px;gap:0}body.nvRoom:not(.nvPane) #nvRoom{display:block}body.nvPane #nvRoom{display:none!important}',
      '#nvRoom .nvTitle{font-size:26px;margin:0 0 4px}.nvNextBox{background:var(--yellow);color:var(--ink-fixed,#1e1e1e);border:var(--bw,3px) solid var(--ink);border-radius:var(--r-m,10px);padding:16px 20px;display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin:8px 0}',
      '.nvGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:16px;margin:12px 0}.nvPerson{background:var(--panel);color:var(--fg);border:var(--bw,3px) solid var(--ink);border-radius:var(--r-m,10px);padding:12px 16px;display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px}',
      '.nvAv{width:52px;height:52px;border:var(--bw,3px) solid var(--ink);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:var(--fs-4,18px);font-weight:900;color:var(--ink-fixed,#1e1e1e);overflow:hidden;flex:none}.nvAv img{width:100%;height:100%;object-fit:cover}',
      '.nvPN{flex:1;min-width:120px}.nvPS{width:100%;font-weight:700;font-size:var(--fs-2,14px)}.nvPerson .nvBtn{width:100%;background:var(--sky);color:var(--ink-fixed,#1e1e1e);font-weight:900}',
      '.nvBar{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:8px 0}',
      /* 全螢幕分頁（專心對談、線索、筆記卡）：桌機 */
      'body.nvRoom:not(.nvPane) #main{position:absolute;left:-12000px;top:0;width:1200px;height:700px;visibility:hidden;pointer-events:none}',
      'body.nvRoom.nvPane #stage{position:absolute;left:-12000px;top:0;width:1100px;height:640px;flex:none;visibility:hidden;pointer-events:none}body.nvRoom.nvPane #side{width:100%;max-width:none;flex:1;border:0}',
      'body.nvPane #tabs,body.nvPane #socialBox{display:none}',
      '#nvPaneHead{display:none;gap:10px;align-items:center;flex-wrap:wrap;padding:10px 16px;border-bottom:var(--bw-s,2px) solid var(--ink);background:var(--panel)}body.nvPane #nvPaneHead{display:flex}.nvTalkT{font-size:var(--fs-4,18px)}#nvClueList{padding:8px 16px;display:flex;gap:8px;flex-wrap:wrap;align-items:center}',
      /* 專心對談 */
      'body.nvTalk #p-intv{display:grid;grid-template-columns:minmax(0,1fr) minmax(260px,320px);gap:16px;align-items:start;align-content:start;padding:16px}body.nvTalk #p-intv>*{min-width:0}',
      'body.nvTalk .ivHide,body.nvTalk #toConcl,body.nvTalk label:has(#lnk),body.nvTalk .row:has(#lnkSave),body.nvTalk #holdNote,body.nvTalk #ckWhy{display:none!important}',
      'body.nvTalk #p-intv>*{grid-column:1}body.nvTalk #p-intv>.ivCk{grid-column:2;grid-row:1 / span 8}body.nvTalk #chatLog{max-height:48vh;min-height:30vh}body.nvTalk #chatIn{min-height:48px}body.nvTalk #chatSend{min-height:48px;background:var(--yellow);color:var(--ink-fixed,#1e1e1e)}',
      'body.nvTalk #p-intv button,body.nvTalk #p-intv summary,body.nvTalk #p-intv input,body.nvTalk #p-intv select{min-height:44px}body.nvTalk #p-intv summary{display:flex;align-items:center}body.nvTalk .ck .box{width:44px;height:44px}body.nvTalk .ivCk summary{min-height:44px;display:flex;align-items:center;cursor:pointer;font-weight:900;font-size:var(--fs-4,18px)}body.nvTalk .pill{min-height:44px;display:inline-flex;align-items:center}body.nvTalk .ivCk input{min-height:44px}',
      '@media (max-width:860px){#nvRoom{padding:12px}.nvPerson{padding:10px 12px;gap:4px 10px}.nvAv{width:44px;height:44px}.nvPS{width:auto;flex:1}.nvPerson .nvBtn{width:auto;min-width:104px}#nvRoom .nvTitle{font-size:20px;margin:0}.nvNextBox{padding:12px 14px;gap:10px}.nvGrid{gap:10px;margin:8px 0}body.nvTalk #p-intv{grid-template-columns:minmax(0,1fr)}body.nvTalk #p-intv>.ivCk{grid-column:1;grid-row:auto}.nvT{font-size:18px}.nvGrid{grid-template-columns:minmax(0,1fr)}}',
      /* 手機版 m.html：房間畫面用頁面捲動，不是 flex */
      'body.nvM.nvRoom #stage,body.nvM.nvRoom #nav,body.nvM.nvRoom #side,body.nvM.nvRoom #speedSheet{position:absolute;left:-12000px;top:0;width:100vw;max-height:60vh;overflow:hidden;visibility:hidden;pointer-events:none}',
      'body.nvM.nvRoom.nvPane #side{position:static;left:auto;width:auto;max-height:none;overflow:visible;visibility:visible;pointer-events:auto}body.nvM.nvRoom #nvRoom{overflow:visible}',
      /* 新手大廳 */
      'body.lv1 #lobby .wrap>*:not(.nvKeep):not(.nvShow){display:none!important}.nvMat{background:var(--panel);border:var(--bw-s,2px) solid var(--ink);border-radius:var(--r-m,10px);padding:4px 12px}.nvMat summary{min-height:44px;display:flex;align-items:center;cursor:pointer;font-weight:700}#nvLobby{display:block}',
      /* 故事板 */
      'body.nvSb button,body.nvSb .btn,body.nvSb select,body.nvSb input:not([type=checkbox]),body.nvSb textarea,body.nvSb summary{min-height:44px}body.nvSb button.mini,body.nvSb .btn.mini{padding:8px 12px;margin:2px 0}body.nvSb .ck{min-height:44px;display:inline-flex;align-items:center;gap:8px}body.nvSb .ck input{width:24px;height:24px;min-height:24px}body.nvSb .chip .x{min-width:44px;min-height:44px}',
      'body.nvSb aside .card:not(#coachBox),body.nvSb #aiMeter,body.nvSb #draftBtn,body.nvSb #draftBtn+.muted,body.nvSb #addCell,body.nvSb #addCell+.muted,body.nvSb #sbEmpty,body.nvSb .tabs{display:none!important}',
      'body.nvSb #cells{display:block}body.nvSb #cells .cell:not(.nvCur){display:none}body.nvSb .cell .img,body.nvSb .cell .imgbar,body.nvSb .cell .stbox,body.nvSb .cell .stbadge,body.nvSb .cell .prin,body.nvSb .cell .fragpick,body.nvSb .cell .bar:has([data-act=help]),body.nvSb .cell button[data-act=pain]{display:none!important}',
      'body.nvSb .cell textarea{min-height:96px}body.nvSb .cell input,body.nvSb .cell textarea,body.nvSb .cell select{min-height:44px}body.nvSb .cell button.mini{min-height:44px}',
      '#nvSbBar{display:flex;flex-direction:column;gap:10px;margin-bottom:12px}.nvDots{display:inline-flex;gap:6px}.nvDot{position:relative;width:44px;height:44px;min-height:44px;border:0;padding:0;background:none;box-shadow:none}.nvDot::before{content:\"\";position:absolute;left:50%;top:50%;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;border:var(--bw-s,2px) solid var(--ink);background:var(--panel)}.nvDot.got::before{background:var(--mint)}.nvDot.cur::before{background:var(--yellow);outline:var(--bw-s,2px) solid var(--ink)}',
      '.nvQuote{background:var(--code,#f1f5f7);color:var(--fg);border:var(--bw-s,2px) solid var(--line,#cfd8de);border-radius:var(--r-m,8px);padding:12px;margin:8px 0;font-size:15px}.nvDone{background:var(--soft-g,#e6fcf0);color:#1e1e1e}',
      /* 中級：房間（有場景）＋故事板 */
      'body.lv2Room #skBtn,body.lv2Room #v3dBtn,body.lv2Room #fitBtn,body.lv2Room #sideBtn{display:none!important}',
      'body.lv2Room #tabs button[data-t=\"events\"],body.lv2Room #tabs button[data-t=\"disc\"]{display:none!important}',
      '#lv2Strip{display:none}body.lv2Room #lv2Strip{display:block;padding:8px 10px;border-bottom:var(--bw-s,2px) solid var(--ink);background:var(--panel);color:var(--fg)}',
      '#lv2Strip .nvNextBox{padding:8px 12px;margin:0 0 6px;gap:10px}#lv2Strip .nvT{font-size:17px}#lv2Strip .nvBtn.big{min-height:44px;padding:0 14px;font-size:var(--fs-3,15px)}',
      '#lv2Strip details>summary{min-height:44px;display:flex;align-items:center;gap:6px;cursor:pointer;font-weight:700}#lv2Strip details>summary::after{content:\"▾\"}#lv2Strip details[open]>summary::after{content:\"▴\"}#lv2Strip .nvAns{margin:6px 0}',
      '.nvGreyRoom{border:var(--bw-s,2px) dashed var(--muted,#8b969d)!important;background:var(--code,#edf1f3)!important;color:var(--muted,#59656d)!important;font-weight:400!important;box-shadow:none!important;cursor:not-allowed}',
      'g.nvGreyRm{opacity:.28}.mLabel.nvGreyRm{opacity:.45;filter:grayscale(1)}',
      'body.lv2M #nav .chip,body.lv2M #tabs button,body.lv2M #topbar button,body.lv2M #topbar a,body.lv2M .pin{min-height:44px}body.lv2M #topbar .uilvSw[data-sheet=\"1\"] button{min-height:44px}',
      'body.lv2Sb #prompts,body.lv2Sb #stats,body.lv2Sb #aiMeter{display:none!important}#l2SbBar #nvSbAns:empty{display:none}',
      'body.lv2Sb .cell .stbox,body.lv2Sb .cell .stbadge,body.lv2Sb .cell .prin,body.lv2Sb .cell .bar:has([data-act=help]),body.lv2Sb .cell button[data-act=pain]{display:none!important}',
      'body.lv2Sb #draftBtn,body.lv2Sb #draftBtn+.muted{display:none!important}',
      'body.lv2Sb button,body.lv2Sb .btn,body.lv2Sb select,body.lv2Sb input:not([type=checkbox]),body.lv2Sb textarea,body.lv2Sb summary{min-height:44px}body.lv2Sb button.mini,body.lv2Sb .btn.mini{padding:8px 12px;margin:2px 0}body.lv2Sb .ck{min-height:44px;display:inline-flex;align-items:center;gap:8px}body.lv2Sb .ck input{width:24px;height:24px;min-height:24px}body.lv2Sb .chip .x{min-width:44px;min-height:44px}',
      'body.lv2Sb #cells{grid-template-columns:repeat(3,minmax(0,1fr))}body.lv2Sb .cell.l2Cur{grid-column:1/-1}',
      'body.lv2Sb .cell:not(.l2Cur){cursor:pointer;min-height:44px}body.lv2Sb .cell:not(.l2Cur)>*:not(header):not(.l2Sum){display:none!important}body.lv2Sb .cell:not(.l2Cur) header input,body.lv2Sb .cell:not(.l2Cur) .mom{display:none}.l2Sum{margin-top:6px}',
      '#l2SbBar{display:flex;flex-direction:column;gap:10px;margin-bottom:12px}',
      '@media (max-width:860px){body.lv2Sb #cells{grid-template-columns:minmax(0,1fr)}}',
      '@media (prefers-reduced-motion:reduce){.nvBtn,.nvChip{transition:none}}'
    ].join('\n');
    document.head.appendChild(st);
  }
  document.addEventListener('DOMContentLoaded', injectCss);
  if (document.readyState !== 'loading') injectCss();
})();
