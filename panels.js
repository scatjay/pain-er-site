/* 側邊面板：線索、訪談（檢核式）、筆記卡、結論、討論、檢核點與報告。 */
(function () {
  'use strict';
  var APP = window.ERG_APP, DB = APP.DB, $ = APP.$, esc = APP.esc, RM = window.ERG_ROOM;
  var CORE = window.ERG_CORE, L = window.ERG_LOGIC, CL = window.ERG_CHECKLIST, CP = window.ERG_CHECKPOINTS, CARDS = window.ERG_CARDS, PER = window.ERG_PERSONAS, RP = window.ERG_REPORT, ERG = window.ERG;
  var P = window.ERG_PANELS = {};
  function cur() { return RM.cur; }
  function ic(n, fb) { var I = window.ERG_ICONS; return (I && I[n]) || fb; }   /* 10-18 圖示：沒載入 icons.js 就退回 emoji */
  function me() { return APP.me.sid; }
  function player() { return cur().player; }
  function save() { RM.persist(true); RM.refreshDots(); }
  function typing() { var a = document.activeElement; return !!(a && $('side').contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)); }
  function roomNameOf(id) { var r = window.ERG_LAYOUT.room(id); return r ? r.name : id; }
  function isHost() { return String(cur().room.host) === String(me()); }

  P.renderAll = function () { ['clue', 'intv', 'cards', 'concl', 'disc', 'cp', 'events'].forEach(P.render); };
  P.render = function (t) { ({ clue: renderClue, intv: renderIntv, cards: renderCards, concl: renderConcl, disc: renderDisc, cp: renderCp, events: renderEvents, ach: renderAch })[t](); };
  /* 成就分頁：自己的指標與徽章＋班級「誰最多」（線上模式讀 er/{sess}/score；本機版只有自己） */
  function achCtx() { var c = cur(); var cp = (window.ERG_CORE && window.ERG_CP && c) ? (function () { try { var st = window.ERG_CORE.checkpointState(c, me()); return window.ERG_CP.evaluate(st).every(function (x) { return x.ok; }); } catch (e) { return false; } })() : false; return { cpAllOk: cp, shift: c && c.world && c.world.shift, cases: casesTried(), reports: reportsMade(), fb: fbMine(), keep: keptBadges(), sb: window.ERG_MY_SBD || null, prevSk: prevW8Sk() }; }
  /* 10-27 W8 技能：上次已發布的等級（等級不倒退） */
  function prevW8Sk() { try { var s = window.ERG_MY_SCORE || {}; return { story: s.skStory, source: s.skSource }; } catch (e) { return {}; } }
  /* 10-15：成就是照『現在這間房』的紀錄算的，換案例開新房間會歸零；把之前已發布的成就帶回來，已拿到的不收回 */
  function keptBadges() { try { var s = (window.ERG_SCORES || {})[String(me())] || window.ERG_MY_SCORE; return (s && s.badgeIds) ? s.badgeIds.slice() : []; } catch (e) { return []; } }
  /* 10-15：自己進過幾種不同案例的房間（從大廳索引算：成員有我的房間，不同的 case 數） */
  function fbMine() { try { return window.ERG_ACH.fbStats(window.ERG_FEEDBACK.mine(APP.storage, me())); } catch (e) { return null; } }   /* 10-27 回報技能 */
  function reportsMade() { try { return window.ERG_FEEDBACK.mine(APP.storage, me()).filter(function (e) { return e.kind === 'bug'; }).length; } catch (e) { return 0; } }
  function casesTried() { try { var sid = String(me()), seen = {}; DB.listRooms(APP.SESS).forEach(function (r) { var x = (r && r.members !== undefined) ? r : (DB.getRoom(r.code) || {}); if (x.members && x.members[sid]) seen[x.case || 'sms'] = 1; }); return Object.keys(seen).length; } catch (e) { return 0; } }
  P.achCtx = achCtx;
  /* 10-13 技能等級：從自己這個房間的訪談逐字稿算（一次讀自己的一個節點，90 秒內不重讀；送出提問後立刻作廢） */
  var skCache = { t: 0, st: null, busy: false, code: '' };
  P.skInvalidate = function () { skCache.t = 0; };
  function skillStats() {
    var c = cur(), A = window.ERG_ACH; if (!c || !A) return A ? A.chatStats({}) : null;
    var fresh = skCache.st && skCache.code === c.code && Date.now() - skCache.t < 90000;
    if (!fresh && !skCache.busy && window.firebase && c.code && me()) {
      skCache.busy = true;
      var code = c.code;
      try {
        window.firebase.database().ref('er/' + APP.SESS + '/chat/' + code + '/' + me()).once('value', function (s) {
          skCache.busy = false; skCache.t = Date.now(); skCache.code = code; skCache.st = A.chatStats(s.val() || {});
          if (cur() && cur().tab === 'ach') renderAch();
        }, function () { skCache.busy = false; });
      } catch (e) { skCache.busy = false; }
    }
    return skCache.st || A.chatStats({});
  }
  function computeSk(A, pl) {
    var roomsSeen = Object.keys(pl.roomsSeen || {}).length || (pl.visited || []).length;
    var iv = (pl.interviews || []).filter(function (r) { return r && r.items && Object.keys(r.items).some(function (k) { var x = r.items[k]; return x && ((x.note && String(x.note).trim()) || x.done); }); }).length;
    var concl = (pl.conclusions || []).filter(function (x) { return x && String(x.text || '').trim(); }).length;
    return A.skills(skillStats(), { rooms: roomsSeen, interviews: iv, conclusions: concl, remote: !!((pl.roomsSeen || {}).home || (pl.roomsSeen || {}).clinic) });
  }
  function skillBlock(A, pl) {
    var sk = computeSk(A, pl);
    var prev = pl.skillLv || {}, up = {};
    if (prev.ask && sk.ask.lv > prev.ask) up['探問'] = true;
    if (prev.ctx && sk.ctx.lv > prev.ctx) up['情境感知'] = true;
    if (!prev.ask || !prev.ctx || sk.ask.lv !== prev.ask || sk.ctx.lv !== prev.ctx) { pl.skillLv = { ask: sk.ask.lv, ctx: sk.ctx.lv }; save(); }
    if (up['探問'] || up['情境感知']) P._lvUp = Object.assign(P._lvUp || {}, up);
    return sk;
  }
  function renderAch() {
    var p = $('p-ach'), A = window.ERG_ACH; if (!p || !A || !cur()) return;
    P.setAchDot(false); if (window.ERG_ENSURE_SCORE_WATCH) window.ERG_ENSURE_SCORE_WATCH();   /* 10-19：進成就分頁才訂閱班級排行 */
    var m = A.metrics(player(), achCtx());
    var board = window.ERG_SCORES ? A.leaderboard(window.ERG_SCORES, 3) : null;
    var bh = board ? '<h2>班上誰最多</h2><div class="board">' + board.map(function (b) { return '<div class="b"><b>' + esc(b.label) + '</b>' + (b.rows.length ? '<ol style="margin:4px 0 0 18px;padding:0;font-size:var(--fs-2)">' + b.rows.map(function (r) { return '<li>' + esc(r.name) + '　' + r.v + ' ' + esc(b.unit) + '</li>'; }).join('') + '</ol>' : '<div class="muted" style="font-size:var(--fs-1)">還沒有人</div>') + '</div>'; }).join('') + '</div>' : (APP.online ? '<p class="muted" style="font-size:var(--fs-1)">正在讀取班級排行…</p>' : '<p class="muted" style="font-size:var(--fs-1)">本機版沒有班級排行；線上版會列出班上誰最多。</p>');
    var open = {}; Array.prototype.forEach.call(p.querySelectorAll('details.unitGrp'), function (d) { open[d.getAttribute('data-unit')] = d.open; });   /* 重畫前記住哪幾組是展開的 */
    var sk = skillBlock(A, player()), cu = (window.ERG_W8_ON && window.ERG_W8_ON()) ? 'W8' : 'W7';
    p.innerHTML = '<h2>我的技能與成就</h2>' + A.html(m, esc, { current: cu, sk: sk, fresh: P._lvUp, open: open }) + bh;
    if (window.ERG_PUBLISH_SCORE) window.ERG_PUBLISH_SCORE();
  }
  /* 10-18：成就／升級通知、「成就」分頁紅點、頂列固定顯示技能等級（訪談技能三級不用打開成就分頁也看得到） */
  P.setAchDot = function (on) { var b = document.querySelector('#tabs [data-t="ach"]'); if (b) b.classList.toggle('dot', !!on); };
  P.notifyProgress = function () {
    var c = cur(), A = window.ERG_ACH; if (!c || !c.player || !A || !me()) return;
    var pl = player(), m, all; try { m = A.metrics(pl, achCtx()); all = A.badges(m); } catch (e) { return; }
    var okIds = all.filter(function (b) { return b.ok; }).map(function (b) { return b.id; });
    var msgs = [], changed = false;
    if (!pl.seenBadges) { pl.seenBadges = okIds; changed = true; }
    else {
      var news = all.filter(function (b) { return b.ok && pl.seenBadges.indexOf(b.id) < 0; });
      if (news.length) { pl.seenBadges = pl.seenBadges.concat(news.map(function (b) { return b.id; })); changed = true; msgs.push('🏅 新成就：' + news.slice(0, 2).map(function (b) { return b.icon + b.name; }).join('、') + (news.length > 2 ? '…等 ' + news.length + ' 個' : '')); }
    }
    var fresh = skCache.st && skCache.code === c.code;
    if (fresh) {
      var sk = computeSk(A, pl), seen = pl.lvSeen;
      if (!seen) { pl.lvSeen = { ask: sk.ask.lv, ctx: sk.ctx.lv }; changed = true; }
      else {
        if (sk.ask.lv > seen.ask) msgs.push('⬆️ 探問升到 Lv.' + sk.ask.lv);
        if (sk.ctx.lv > seen.ctx) msgs.push('⬆️ 情境感知升到 Lv.' + sk.ctx.lv);
        if (sk.ask.lv !== seen.ask || sk.ctx.lv !== seen.ctx) { pl.lvSeen = { ask: sk.ask.lv, ctx: sk.ctx.lv }; changed = true; }
      }
      var sb = $('skBtn'); if (sb) { sb.innerHTML = '<span class="sk-full">技能 探問' + sk.ask.lv + '・情境' + sk.ctx.lv + '</span><span class="sk-cmp">探' + sk.ask.lv + '・境' + sk.ctx.lv + '</span>'; sb.title = '訪談技能等級：探問 Lv.' + sk.ask.lv + '、情境感知 Lv.' + sk.ctx.lv + '（點一下看成就與技能）'; }
    }
    try { var pf = APP.me.profile, sk2 = fresh ? computeSk(A, pl) : null, np = { badges: okIds.length, ask: sk2 ? sk2.ask.lv : ((pf.progress || {}).ask || 1), ctx: sk2 ? sk2.ctx.lv : ((pf.progress || {}).ctx || 1) }, op = pf.progress || {};
      if (op.badges !== np.badges || op.ask !== np.ask || op.ctx !== np.ctx) { pf.progress = np; if (window.ERG_CORE && window.ERG_CORE.saveProfile) window.ERG_CORE.saveProfile(APP.storage, APP.me.sid, pf); } } catch (e) {}
    if (changed) save();
    if (msgs.length) { RM.toast(msgs.join('　')); if (cur().tab !== 'ach') P.setAchDot(true); else if (window.ERG_PANELS) renderAch(); }
  };
  setInterval(function () { try { if (cur()) { if (!skCache.st || skCache.code !== cur().code) skillStats(); P.notifyProgress(); } } catch (e) {} }, 12000);
  var skClick = function () { if (RM.switchTab) RM.switchTab('ach'); };
  document.addEventListener('click', function (e) { var t = e.target; if (t && t.closest && t.closest('#skBtn')) skClick(); });   /* 10-19：按到按鈕裡的文字（span）時 e.target 是 span，原本只認 id 會沒反應 */
  P.renderAch = renderAch;
  /* 10-20：手指／滑鼠按著的時候不重畫面板。學生在欄位打完字直接按按鈕，mousedown 先讓欄位失焦、存檔通知又重畫面板，
     按鈕被換掉，click 就消失（二乙回報「結論都寫了卻沒辦法結束」）。按著時先記下，放開後等 click 跑完再補畫。 */
  var ptrDown = false, ptrPending = false;
  document.addEventListener('pointerdown', function () { ptrDown = true; }, true);
  ['pointerup', 'pointercancel'].forEach(function (n) { document.addEventListener(n, function () {
    ptrDown = false; if (ptrPending) { ptrPending = false; setTimeout(function () { try { if (cur() && !typing()) P.render(cur().tab); } catch (e) {} }, 60); }
  }, true); });
  P.onRoomChanged = function () { if (ptrDown) { ptrPending = true; return; } if (!typing()) P.render(cur().tab); };
  P.onSceneChanged = function () { if (ptrDown) { ptrPending = true; return; } if (!typing()) { if (cur().tab === 'cards') renderCards(); if (cur().tab === 'concl') renderConcl(); } };
  P.onMove = function () { renderClue(); renderIntv(); };
  P.onWatch = function () { try { if (cur() && cur().tab === 'clue') renderClue(); if (cur() && cur().tab === 'intv' && !typing() && !cur().selNpc) renderIntv(); } catch (e) {} };   /* 輪播換看的房間時，右側線索跟著更新（10-15） */
  /* 每秒看一次：正在看的人物如果離開這間房，訪談分頁改成顯示他的紀錄（檢核表還在） */
  setInterval(function () {
    /* 10-20：沒選人時，名單（現場的人、輪播正在看的房間）跟著時間變，變了就重畫；以前只有玩家移動才重畫，名單會停在舊的 */
    var cc = cur(); if (cc && cc.tab === 'intv' && !cc.selNpc && !typing()) { var sig = RM.entityHere().map(function (h) { return h.ent.id + h.av.level; }).join(',') + '|' + (cc.rotation && cc.rotation.on ? cc.watchRoom : '') + '|' + watchNote() + '|' + goNote(); if (sig !== cc._intvSig) { cc._intvSig = sig; renderIntv(); } }
    var c = cur(); if (!c || c.tab !== 'intv' || !c.selNpc || typing()) return;
    var still = false, pid = null; RM.entityHere().forEach(function (h) { if (h.ent.id === c.selNpc) still = true; });
    if (still) return;
    c.world.at(c.clock.worldSec).forEach(function (it) { if (it.ent.id === c.selNpc) pid = it.ent.pid; });
    if (pid && recFor(pid) >= 0) c.selRecPid = pid; c.selNpc = null; renderIntv();
  }, 1000);
  function renderEvents() { var p = $('p-events'); if (window.ERG_EVENT_UI && p) window.ERG_EVENT_UI.renderBook(cur(), p); }

  /* ───── 線索 ───── */
  function clueById(id) { var cs = cur().world.clues; for (var i = 0; i < cs.length; i++) if (cs[i].id === id) return cs[i]; return null; }
  function renderClue() {
    var c = cur().selClue ? clueById(cur().selClue) : null, p = $('p-clue'), loc = player().loc;
    var here = cur().world.clues.filter(function (x) { return x.pin.room === loc; }).length;
    var head = '<div class="card" style="margin-top:0"><b>' + esc(cur().world.meta.name) + '</b><div class="muted" style="font-size:var(--fs-2)">' + esc(cur().world.meta.brief) + '</div></div>';
    /* 10-15 楊老師：輪播（自動換看別間房）時，右側的線索要跟著更新成『正在看的那間房』的線索 */
    var cc = cur(), watch = cc.watchRoom, rotOn = !!(cc.rotation && cc.rotation.on);
    if (!c && rotOn && watch && watch !== loc && window.ERG_LAYOUT && window.ERG_LAYOUT.room(watch) && window.ERG_LAYOUT.room(watch).type === 'room') {
      var wcl = cc.world.clues.filter(function (x) { return x.pin.room === watch; }), wcap = ''; try { wcap = cc.world.captionFor(watch) || ''; } catch (e) {}
      p.innerHTML = head + '<p>👀 輪播正在看「<b>' + esc(roomNameOf(watch)) + '</b>」，這間房有 <b>' + wcl.length + '</b> 個線索：</p>' + (wcl.length ? '<ul style="margin:4px 0 8px 18px;padding:0">' + wcl.map(function (x) { return '<li><b>' + esc(x.id) + '</b>　' + esc(x.title) + '</li>'; }).join('') + '</ul>' : '') + (wcap ? '<p class="muted" style="border-left:var(--bw) solid var(--yellow);padding-left:8px">' + esc(wcap) + '</p>' : '') + '<p class="muted">你自己還在「' + esc(roomNameOf(loc)) + '」；要讀線索得走到那間房，一操作輪播就會暫停。</p>'; return;
    }
    if (!c) { p.innerHTML = head + '<p>你在「' + esc(roomNameOf(loc)) + '」，這間房有 <b>' + here + '</b> 個線索（黃色小牌）。點牌子就能讀。</p>' + (function () { var cp = ''; try { cp = cur().world.captionFor(loc) || ''; } catch (e) {} return cp ? '<p class="muted" style="border-left:var(--bw) solid var(--yellow);padding-left:8px">' + esc(cp) + '</p>' : ''; })() + '<p class="muted">' + (document.getElementById('nav') ? '要換房間：點下面「附近」的房間（走過去），或按「🗺️ 全部」看整張地圖，點房間直接到。' : '要換房間：點上方「🗺️ 地圖」打開小地圖，點房間直接到；也可以按「全地圖」看整張。') + '</p>'; return; }
    if (c.pin.room !== loc) { p.innerHTML = head + '<p>線索 <b>' + esc(c.id) + '</b> 在「' + esc(roomNameOf(c.pin.room)) + '」，你現在在「' + esc(roomNameOf(loc)) + '」，要走過去才讀得到。</p><button id="goClue">走到「' + esc(roomNameOf(c.pin.room)) + '」</button>'; $('goClue').onclick = function () { RM.travel(c.pin.room); }; return; }
    p.innerHTML = head + '<h2 style="margin-top:0">' + esc(c.id) + '　' + esc(c.title) + '</h2><span class="tag ' + (c.material === '模擬' ? 'warn' : '') + '">素材：' + esc(c.material || '模擬') + '</span><p>' + esc(c.body) + '</p><button id="mkClue">記一張勘查卡</button>';
    $('mkClue').onclick = function () { P.prefill = { type: '勘查卡', clue: c.id }; RM.switchTab('cards'); };
  }

  /* ───── 訪談（檢核式）───── */
  function recFor(pid) { var l = player().interviews; for (var i = 0; i < l.length; i++) if (l[i].personaId === pid) return i; return -1; }
  function drawState(persona) {
    var d = DB.getRoom(cur().code).draws || {}, key = persona.id + ':' + me();
    if (d[key]) return d[key];
    var pool = ERG.STATE_POOLS, st = {};
    Object.keys(pool).forEach(function (k) { st[k] = pool[k][Math.floor(Math.random() * pool[k].length)]; });
    var ev = (persona.layers && persona.layers.events) || ['最近很忙。']; st['近事'] = ev[Math.floor(Math.random() * ev.length)];
    var patch = {}; patch[key] = st; DB.patchRoom(cur().code, { draws: patch }); return st;
  }
  function promptFor(h) {
    var persona = h.ent.persona, st = drawState(persona), w = cur().world;
    var fatigueLevel = h.av.fatigue ? h.av.fatigue.level : 0, promptLine = window.ERG_FATIGUE ? window.ERG_FATIGUE.promptLine(fatigueLevel, RM.simMin()) : '';
    return PER.buildPrompt(persona, { timeText: RM.simTime(), roomName: roomNameOf(player().loc), act: h.pos.act || '待著', state: st, level: h.av.level, promptLine: promptLine,
      topic: w.meta.short, referrals: w.meta.referrals, attitudeLabel: w.meta.id === 'sms' ? '對這套簡訊的態度' : '對這套做法的態度' });
  }
  /* 10-20 楊老師：輪播只換『觀看』的房間、不移動玩家，訪談只問得到玩家所在房的人。輪播正在看別間房時，面板上方講清楚，並列出那間房現在的人 */
  function watchNote() {
    var c = cur(), loc = player().loc, w = c && c.watchRoom;
    if (!c || !c.rotation || !c.rotation.on || !w || w === loc) return '';
    var names = [];
    c.world.at(c.clock.worldSec).forEach(function (it) { if (it.pos.room === w && it.ent.kind !== 'bot') names.push(it.ent.name); });
    return '<p style="margin:0 0 6px">👀 輪播正在看「<b>' + esc(roomNameOf(w)) + '</b>」：' + (names.length ? esc(names.join('、')) : '現在沒有人') + '。你自己還在「' + esc(roomNameOf(loc)) + '」，要訪談那裡的人得走過去（下方「其他房間的人」點一下就過去）。</p>';
  }
  /* 10-27 楊老師：重要關係人的按鈕直接用象限顏色（對應 MBTI）。顏色旁一定有四碼文字，不靠顏色分辨 */
  function mbtiCss(pid) { try { var i = window.ERG_TYPE_UI && window.ERG_TYPE_UI.info(pid); return i ? 'background:' + i.q.bg + ';border-color:' + i.q.color + ';color:#1b1b1b;' : ''; } catch (e) { return ''; } }
  function renderIntv() {
    var p = $('p-intv'), here = RM.entityHere();
    if (cur().role !== 'member') { p.innerHTML = '<p class="muted">旁觀者不能訪談。</p>'; return; }
    var selId = cur().selNpc, sel = null, recs = player().interviews, c0 = cur();
    here.forEach(function (h) { if (h.ent.id === selId) sel = h; });
    /* 10-13：人物會照班表走到別間房。原本人一走，訪談的檢核表就跟著不見、不能打勾。
       現在列出「我問過的人」：人不在這間房也能回來把問到的事打勾（要繼續問才需要走過去）。 */
    function nameOf(pid) { var w = c0.world.personas && c0.world.personas[pid]; return w ? w.name : pid; }
    function whereIs(pid) { var out = null; c0.world.at(c0.clock.worldSec).forEach(function (it) { if (it.ent.pid === pid && it.pos.room) out = it.pos.room; }); return out; }
    var recPid = sel ? sel.ent.pid : (c0.selRecPid || null);
    if (!sel && recPid && recFor(recPid) < 0) recPid = null;
    /* 選了現場的人在訪談時，急診室的時間先暫停（不然問到一半他就照班表走掉了） */
    c0.intvHold = !!sel;
    var html = goNote() + watchNote() + '<div class="muted" style="font-size:var(--fs-2)">這間房裡的人（只有在同一房間才問得到）：</div><div class="row" style="margin:6px 0">' +
      (here.length ? here.map(function (h) { return '<button class="pill ' + (sel && sel.ent.id === h.ent.id ? 'on' : '') + '" data-npc="' + esc(h.ent.id) + '" style="' + mbtiCss(h.ent.pid) + (sel && sel.ent.id === h.ent.id ? 'box-shadow:0 0 0 3px var(--ink);font-weight:900;' : '') + '">' + esc(h.ent.name) + '・' + ({ free: '可聊', short: '簡短', blocked: '正忙' })[h.av.level] + (window.ERG_TYPE_UI ? window.ERG_TYPE_UI.badge(h.ent.pid, true) : '') + '</button>'; }).join('') : '<span class="muted">現在這間房沒有人。</span>') + '</div>';
    /* 其他房間的人：灰色、不能選，後面標在哪間房（10-12 楊老師）。要訪談就先走過去——用地圖或下方的房間按鈕。 */
    html += '<div class="muted" style="font-size:var(--fs-2);margin-top:8px">其他房間的人（點一下，直接過去找他）：</div><div id="allNpc" style="font-size:var(--fs-2);margin:4px 0 6px">' + allNpcHtml() + '</div>';
    if (recs.length) html += '<div class="muted" style="font-size:var(--fs-2);margin-top:8px">我問過的人（人不在也可以回來打勾）：</div><div class="row" id="myRecs" style="margin:4px 0 6px">' + recs.map(function (r) { var pr = CL.progress(r); return '<button class="pill ' + (recPid === r.personaId ? 'on' : '') + '" data-rec="' + esc(r.personaId) + '">' + esc(nameOf(r.personaId)) + '　' + pr.done + '/' + pr.total + (pr.complete ? ' ✔' : '') + '</button>'; }).join('') + '</div>';
    if (!sel && !recPid) { p.innerHTML = html + '<p class="muted">點上面的人，或直接點畫面上的角色。</p>'; bindNpc(p); bindAllNpc(p); return; }
    var ent = sel ? sel.ent : null, pid = recPid, ix = recFor(pid), rec = ix >= 0 ? recs[ix] : null;
    if (sel) {
      var persona = ent.persona;
      html += '<div class="card" style="margin-top:6px"><b>' + esc(ent.name) + '</b>　<span class="tag ' + (persona.material === '模擬' ? 'warn' : '') + '">素材：' + esc(persona.material || '模擬') + '</span><div class="muted" style="font-size:var(--fs-1)">' + esc(persona.title || '') + '</div>' + (window.ERG_TYPE_UI ? window.ERG_TYPE_UI.badge(ent.pid) : '') + (window.ERG_TYPE_UI ? window.ERG_TYPE_UI.ice(ent.pid) : '') +
        '<div style="font-size:var(--fs-2)">' + ({ free: '現在可以好好聊。', short: '正在忙，只能簡短回答（' + esc(sel.av.reason) + '）。', blocked: '現在不方便（' + esc(sel.av.reason) + '），晚一點再來。' })[sel.av.level] + '</div>' +
        '<div class="muted" id="holdNote" style="font-size:var(--fs-1)">⏸ 你在訪談，急診室的時間先暫停；切到別的分頁或走開就會繼續。</div></div>';
      var live = liveReady();
      if (sel.av.level !== 'blocked' && APP.online) html += '<div class="card" id="chatBox" style="margin-top:6px"><div class="row"><b style="flex:1">💬 即時訪談</b><span id="chatStat" class="muted" style="font-size:var(--fs-1)">' + (live ? '連線中' : '目前離線') + '</span></div>' +
        '<div id="icBox"></div><div class="row" style="margin:2px 0"><button type="button" class="ghost" id="icAsk" style="font-size:var(--fs-1)">🧭 助教</button></div><div id="chatLog" style="max-height:260px;overflow:auto;font-size:var(--fs-3);margin:6px 0;padding:4px 0;border-top:var(--bw-s) dashed var(--line)"></div>' +
        '<div class="row"><input id="chatIn" maxlength="300" placeholder="' + (live ? '問 ' + esc(ent.name) + ' 一個問題（Enter 送出）' : '即時訪談離線：老師的電腦沒開，請用下面的指令貼到 Gemini') + '"' + (live ? '' : ' disabled') + '><button id="chatSend"' + (live ? '' : ' disabled') + '>送出</button></div></div>';
      if (sel.av.level !== 'blocked') html += '<details' + (APP.online && live ? '' : ' open') + ' style="margin-top:6px"><summary class="muted" style="cursor:pointer;font-size:var(--fs-2)">' + (APP.online ? '備援：' : '') + '產生訪談指令，貼到 Gemini 訪談</summary><button id="genP" style="margin-top:6px">產生訪談指令</button><div id="pOut"></div></details>';
    } else {
      var wr = whereIs(pid);
      html += '<div class="card" id="awayCard" style="margin-top:6px"><b>' + esc(nameOf(pid)) + '</b><div style="font-size:var(--fs-2)">' + (wr ? '他現在在「' + esc(roomNameOf(wr)) + '」，不在這間房。' : '他現在不在急診室裡。') + '要繼續問得走過去；已經問到的事，可以先在下面打勾。</div>' + (wr && wr !== player().loc ? '<button class="ghost" id="goNpc" style="margin-top:6px">走到「' + esc(roomNameOf(wr)) + '」</button>' : '') + '</div>';
    }
    if (rec) {
      var pr = CL.progress(rec);
      html += '<div class="row" style="margin-top:10px"><b style="flex:1">訪談檢核 ' + esc(rec.id) + '</b><span>' + pr.done + ' / ' + pr.total + '</span></div><div class="bar"><i style="width:' + Math.round(pr.ratio * 100) + '%"></i></div>' +
        '<div class="muted" style="font-size:var(--fs-1)">問到了就打勾，三項都勾才算問完這一位。每個勾要選這是你親眼見到的、對方說的，還是你猜的。</div>';
      CL.ITEMS.forEach(function (it) {
        var v = rec.items[it.k], done = v.done;
        html += '<div class="ck ' + (done ? 'done' : '') + '"><button class="box" data-tick="' + it.k + '" aria-pressed="' + done + '">' + (done ? ic('check', '✔') : '') + '</button><div style="flex:1;min-width:0"><div style="font-weight:900">' + it.label + '</div>';
        if (done) {
          html += '<div>' + CL.TRUST.map(function (t) { return '<button class="pill ' + (v.trust === t.k ? 'on' : '') + '" data-trust="' + it.k + '|' + t.k + '">' + t.label + '</button>'; }).join('') + '</div>' +
            '<input data-note="' + it.k + '" maxlength="' + CL.NOTE_MAX + '" placeholder="一句話（最多 ' + CL.NOTE_MAX + ' 字，可不填）" value="' + esc(v.note) + '" style="margin:4px 0">' +
            '<div>' + CL.TAGS.map(function (t) { return '<button class="pill ' + (v.tags.indexOf(t) >= 0 ? 'on' : '') + '" data-tag="' + it.k + '|' + esc(t) + '">' + esc(t) + '</button>'; }).join('') + '</div>';
        }
        html += '</div></div>';
      });
      html += '<label>這段對話的連結（即時訪談會自動帶入；貼到 Gemini 訪談的請貼分享連結）<input id="lnk" placeholder="https://g.co/gemini/share/…" value="' + esc(CORE.getLink(player().links, rec.id)) + '"></label><div class="row" style="margin-top:6px"><button class="ghost" id="lnkSave">儲存連結</button><button id="toConcl" class="ghost">加進我的結論</button><span id="lnkMsg" class="muted"></span></div>';
    } else if (sel && sel.av.level !== 'blocked') html += '<p class="muted" style="margin-top:10px">開始訪談後，就會出現檢核表。</p>';
    p.innerHTML = html; bindNpc(p); bindAllNpc(p);
    if ($('goNpc')) $('goNpc').onclick = function () { var wr2 = whereIs(pid); if (wr2) RM.travel(wr2); };
    if (sel && $('chatBox')) bindChat(sel, ent);
    var g = $('genP'); if (g && sel) g.onclick = function () {
      if (recFor(ent.pid) < 0) { var r = CL.newRecord({ id: CORE.nextId(player(), me()), author: me(), round: 1, loc: player().loc, simTime: RM.simTime(), personaId: ent.pid, link: '' }); player().interviews.push(r); save(); }
      var text = promptFor(sel); renderIntv();
      var o = $('pOut'); o.innerHTML = '<pre class="prompt" id="pTxt"></pre><div class="row"><button id="pCopy">複製指令</button><span id="pCopied" class="muted"></span></div>'; $('pTxt').textContent = text;
      $('pCopy').onclick = function () { var done = function () { $('pCopied').textContent = '已複製'; }; if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { selectText($('pTxt')); $('pCopied').textContent = '請手動複製（已選取）'; }); else { selectText($('pTxt')); $('pCopied').textContent = '請手動複製（已選取）'; } };
    };
    if (rec) {
      Array.prototype.forEach.call(p.querySelectorAll('[data-tick]'), function (b) { b.onclick = function () { var k = b.dataset.tick, v = rec.items[k]; setRec(ix, k, { done: !v.done, trust: v.done ? '' : (v.trust || 'said') }); }; });
      Array.prototype.forEach.call(p.querySelectorAll('[data-trust]'), function (b) { b.onclick = function () { var a = b.dataset.trust.split('|'); setRec(ix, a[0], { trust: a[1] }); }; });
      Array.prototype.forEach.call(p.querySelectorAll('[data-note]'), function (el) { el.onchange = function () { setRec(ix, el.dataset.note, { note: el.value }); }; });
      Array.prototype.forEach.call(p.querySelectorAll('[data-tag]'), function (b) { b.onclick = function () { var a = b.dataset.tag.split('|'), cur0 = rec.items[a[0]].tags.slice(), i = cur0.indexOf(a[1]); if (i >= 0) cur0.splice(i, 1); else cur0.push(a[1]); setRec(ix, a[0], { tags: cur0 }); }; });
      $('lnkSave').onclick = function () { var v = $('lnk').value.trim(); if (v && !/^https:\/\//.test(v)) { $('lnkMsg').textContent = '連結要以 https:// 開頭'; return; } player().links[CORE.linkKey(rec.id)] = v; save(); $('lnkMsg').textContent = '已儲存'; };
      $('toConcl').onclick = function () { addConclusionRef(rec.id); RM.switchTab('concl'); };
    }
  }
  function bindNpc(p) {
    Array.prototype.forEach.call(p.querySelectorAll('[data-npc]'), function (b) { b.onclick = function () { cur().selNpc = b.dataset.npc; cur().selRecPid = null; renderIntv(); }; });
    /* 「我問過的人」：人在現場就直接選他；不在就只開他的檢核表 */
    Array.prototype.forEach.call(p.querySelectorAll('[data-rec]'), function (b) { b.onclick = function () {
      var pid = b.dataset.rec, hit = null; RM.entityHere().forEach(function (h) { if (h.ent.pid === pid) hit = h; });
      cur().selRecPid = pid; cur().selNpc = hit ? hit.ent.id : null; renderIntv();
    }; });
  }
  function allNpcHtml() {
    var c = cur(), simMin = RM.simMin(), byRoom = {}, LAY = window.ERG_LAYOUT, mine = player().loc;
    c.world.at(c.clock.worldSec).forEach(function (it) {
      if (it.ent.kind === 'bot' || !it.pos.room) return; var r = LAY.room(it.pos.room); if (!r || r.type !== 'room') return;
      var av = c.world.availability(it.ent, it.pos, simMin); (byRoom[it.pos.room] = byRoom[it.pos.room] || []).push({ ent: it.ent, av: av });
    });
    var rooms = Object.keys(byRoom).filter(function (rid) { return rid !== mine; }).sort(function (a, b) { return LAY.room(a).name.localeCompare(LAY.room(b).name); });
    if (!rooms.length) return '<span class="muted">現在其他房間沒有可以訪談的人。</span>';
    return rooms.map(function (rid) { return byRoom[rid].map(function (h) { var gb = c._goBusy, mineBusy = !!(gb && gb.id === h.ent.id); return '<button type="button" class="pill' + (mineBusy ? ' going' : '') + '" data-goto="' + esc(h.ent.id) + '" data-room="' + esc(rid) + '" data-name="' + esc(h.ent.name) + '"' + (gb ? ' disabled aria-disabled="true"' : '') + (mineBusy ? ' aria-busy="true"' : '') + ' title="點一下，直接過去' + esc(roomNameOf(rid)) + '找他" style="font-size:var(--fs-1);min-height:32px;padding:2px 9px;margin:2px;border-style:dashed;cursor:pointer;' + mbtiCss(h.ent.pid) + '">' + (mineBusy ? '<span class="goSpin" aria-hidden="true"></span><span class="goHour" aria-hidden="true">⏳</span> 前往中…' : esc(h.ent.name) + '　<span style="font-weight:400">在' + esc(roomNameOf(rid)) + '</span>') + '</button>'; }).join(''); }).join('');   /* 10-15 楊老師：不在這間房的人，點一下就直接傳送過去（不用走路），到了自動選他 */
  }
  /* 10-20 楊老師：點「其他房間的人」後新房間要載入一陣子，這段時間畫面不能沒反應。
     點下去先立刻畫出『前往中…』（轉圈圈＋面板上方一行字、名單全部暫時不能點，避免連點），下一個畫面畫完才真的傳送；
     到了就清掉；8 秒還沒到或傳送出錯，改成可重試的說明並解除禁用。完全不新增資料庫讀寫。 */
  (function () { if (document.getElementById('goStyle')) return; var st = document.createElement('style'); st.id = 'goStyle';
    st.textContent = '.goSpin{display:inline-block;width:.9em;height:.9em;border:2px solid var(--ink,#222);border-top-color:transparent;border-radius:50%;vertical-align:-.12em;animation:goSpin .8s linear infinite}.goHour{display:none}@keyframes goSpin{to{transform:rotate(360deg)}}#allNpc button.going{opacity:1}#allNpc button[disabled]:not(.going){opacity:.5;cursor:not-allowed}@media (prefers-reduced-motion:reduce){.goSpin{display:none;animation:none}.goHour{display:inline}}';
    document.head.appendChild(st); })();
  P.goTimeoutMs = 8000;
  function goNote() {
    var c = cur(); if (!c) return '';
    var b = c._goBusy, m = c._goMsg;
    if (b) return '<p id="goNote" role="status" aria-live="polite" style="margin:0 0 6px;font-weight:700"><span class="goSpin" aria-hidden="true"></span><span class="goHour" aria-hidden="true">⏳</span> 正在前往「' + esc(roomNameOf(b.room)) + '」找 ' + esc(b.name || '他') + '…</p>';
    if (m && Date.now() < m.until) return '<p id="goNote" role="status" aria-live="polite" style="margin:0 0 6px;font-weight:700;color:var(--red,#b00020)">' + esc(m.text) + '</p>';
    return '';
  }
  function goFinish(c, msg) {
    var b = c._goBusy; if (!b) return; clearTimeout(b.timer); c._goBusy = null;
    c._goMsg = msg ? { text: msg, until: Date.now() + 12000 } : null;
  }
  function goRerender() { try { if (cur() && cur().tab === 'intv' && !typing()) renderIntv(); } catch (e) {} }
  function bindAllNpc(p) {
    Array.prototype.forEach.call(p.querySelectorAll('[data-goto]'), function (b) { b.onclick = function () {
      var id = b.dataset.goto, rid = b.dataset.room, c = cur(), nm = b.dataset.name || '他';
      if (c._goBusy) return;   /* 正在前往：連點只算一次 */
      if (rid === player().loc) { c.selNpc = id; renderIntv(); return; }
      c._goMsg = null; var busy = c._goBusy = { id: id, room: rid, name: nm, t0: Date.now(), done: false };
      busy.timer = setTimeout(function () {   /* 超時：解除禁用，讓學生可以再點一次 */
        if (c._goBusy !== busy) return; c.pendingNpc = null; goFinish(c, '還在載入，請再等一下，或重新點一次「' + nm + '」。'); goRerender();
      }, P.goTimeoutMs);
      renderIntv();   /* 立刻畫出『前往中…』（此時還沒開始傳送） */
      var run = function () {
        if (busy.done || c._goBusy !== busy) return; busy.done = true;
        try {
          c.pendingNpc = id; RM.toast('到了' + roomNameOf(rid) + '，找 ' + nm + '…'); if (RM.teleport) RM.teleport(rid); else RM.travel(rid);
          if (c._goBusy === busy && player().loc === rid) { var here = RM.entityHere().some(function (h) { return h.ent.id === id; }); if (!here) { c.pendingNpc = null; goFinish(c, '到了「' + roomNameOf(rid) + '」，但 ' + nm + ' 剛好走開了，請看名單再點一次。'); } else goFinish(c); goRerender(); }
        } catch (e) {
          c.pendingNpc = null; goFinish(c, '前往「' + roomNameOf(rid) + '」沒有成功，請再點一次「' + nm + '」。'); goRerender();
          if (window.console && console.error) console.error('goto failed', e);
        }
      };
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(function () { setTimeout(run, 0); });
      setTimeout(run, 150);   /* 分頁在背景時畫面不會更新，不能因此卡住：150 ms 後無論如何都執行 */
    }; });
  }
  /* 走到目的房間後，自動選取剛才點的人 */
  P.onMove = (function (orig) { return function () { var c = cur(); if (c && c.pendingNpc) { var id = c.pendingNpc, here = RM.entityHere().some(function (h) { return h.ent.id === id; }); if (here) { c.pendingNpc = null; c.selNpc = id; goFinish(c); RM.switchTab('intv'); } else if (c._goBusy && player().loc === c._goBusy.room) { c.pendingNpc = null; goFinish(c, '到了「' + roomNameOf(player().loc) + '」，但 ' + (c._goBusy ? c._goBusy.name : '他') + ' 剛好走開了，請看名單再點一次。'); } } orig(); }; })(P.onMove);

  /* ───── 即時訪談（Firebase 佇列 → 老師電腦上的代理程式 → Vertex → 寫回）───── */
  function daemonUp() { return !!(APP.online && window.ERG_DAEMON_HB && Date.now() - window.ERG_DAEMON_HB < 60000); }
  function liveReady() { return daemonUp() && window.ERG_LIVE_OPEN !== false; }
  /* 10-13：不是即時訪談的開放時間時，在頂列下面清楚寫出來（原本只有訪談分頁裡的小字，學生不進訪談分頁就不知道）。
     只在線上模式、已經收到代理程式狀態之後才顯示；開放時整條收起來。 */
  function liveBar() {
    var tb = $('topbar'), b = $('liveBar'); if (!tb) return;
    var show = !!(APP.online && cur() && window.ERG_DAEMON_HB !== undefined && !liveReady());
    if (!show) { if (b) b.style.display = 'none'; return; }
    if (!b) { b = document.createElement('div'); b.id = 'liveBar'; b.setAttribute('role', 'status'); b.style.cssText = 'flex:none;background:#fff3bf;color:var(--ink-fixed);border-bottom:var(--bw) solid var(--ink-fixed);padding:4px 10px;font-size:var(--fs-2);font-weight:700;line-height:1.45;text-align:center'; tb.parentNode.insertBefore(b, tb.nextSibling); }
    var gd = window.ERG_LIVE_GUARD; /* 頂到額度上限：學生要看到明確原因與恢復時間，不是「不是開放時間」 */
    b.textContent = daemonUp() ? (gd && gd.msg ? '⏸ ' + gd.msg : '⏸ 現在不是即時訪談的開放時間（上課時間才開），人物不會直接回話。逛現場、讀線索、記筆記、寫結論都可以做。') : '⏸ 即時訪談目前連不上，人物不會直接回話。逛現場、讀線索、記筆記、寫結論都可以做。';
    b.style.display = 'block';
  }
  if (APP.data && APP.data.listeners) APP.data.listeners.push(function (topic) { if (topic === 'daemon') liveBar(); });
  setInterval(liveBar, 5000);
  /* 狀態字：連線中／非上課時間暫停／目前離線 */
  function liveLabel() { var gd = window.ERG_LIVE_GUARD; return liveReady() ? '連線中' : (daemonUp() ? (gd ? (gd.reason === 'week_cap' ? '本週即時訪談額度已用完（可以逛、可以到公開討論區聊）' : '今天的即時訪談額度已用完，明天 00:00 恢復（可以逛、可以到公開討論區聊）') : '非上課時間，即時訪談暫停（可以逛、可以到公開討論區聊）') : '目前離線'); }
  P.liveLabel = liveLabel;
  function safeKey(id) { return String(id).replace(/[.#$\[\]\/]/g, '_'); }
  function chatRef(recId) { return window.firebase.database().ref('er/' + APP.SESS + '/chat/' + cur().code + '/' + me() + '/' + safeKey(recId)); }
  /* 即時訪談的逐字稿網址（老師頁面可看），有回答後自動填進訪談紀錄的連結欄，滿足「每個訪談都有連結」的檢核 */
  function liveLink(recId) { return (window.ERG_SITE_BASE || (location.origin + location.pathname.replace(/[^\/]*$/, ''))) + 'teacher.html#chat/' + encodeURIComponent(APP.SESS) + '/' + cur().code + '/' + me() + '/' + safeKey(recId); }
  function ensureRec(ent) {
    var ix = recFor(ent.pid);
    if (ix < 0) { var r = CL.newRecord({ id: CORE.nextId(player(), me()), author: me(), round: 1, loc: player().loc, simTime: RM.simTime(), personaId: ent.pid, link: '' }); player().interviews.push(r); save(); ix = recFor(ent.pid); }
    return player().interviews[ix];
  }
  function bindChat(sel, ent) {
    var c = cur(), existing = recFor(ent.pid) >= 0 ? player().interviews[recFor(ent.pid)] : null, recId = existing ? existing.id : null;
    if (c.chatOff) { try { c.chatOff(); } catch (e) {} c.chatOff = null; }
    var lastTurns = [];   /* 成就用：這段對話目前的內容（送出下一題時拿對方上一句來比） */

    /* 10-27 訪談 AI 助教（第 1 階段：只用規則，在瀏覽器裡跑，不呼叫模型、不新增資料庫寫入）。規則與句庫在 interview_coach.js／interview_coach_rules.js。
       自動出手只給第 1 級；學生按「給我例子」「示範一下」才給第 2、3 級。已出過的提示記在這台瀏覽器（localStorage），換人或換房不重複。 */
    var icKey = 'erg_ic1_' + me(), icLastKey = '';
    function icLoad() { try { var o = JSON.parse(localStorage.getItem(icKey) || '{}'); return { shown: Array.isArray(o.shown) ? o.shown : [], off: !!o.off }; } catch (e) { return { shown: [], off: false }; } }
    function icSave(o) { try { localStorage.setItem(icKey, JSON.stringify({ shown: o.shown.slice(-120), off: !!o.off })); } catch (e) {} }
    function icBoxEl() { return $('icBox'); }
    function icRun(req) {
      try {
        var IC = window.ERG_IC; if (!IC || !window.ERG_IC_RULES || !icBoxEl()) return;
        var st = icLoad(), now = Date.now(), pl = player(), q = pl.q || {};
        var turns = lastTurns.map(function (t) { return { role: t.role, text: t.text, t: Number(t.t) || 0 }; });
        var lastA = 0; turns.forEach(function (t) { if (t.role === 'a' && t.t > lastA) lastA = t.t; });
        var lastU = 0; turns.forEach(function (t) { if (t.role === 'u' && t.t > lastU) lastU = t.t; });
        var ctx = { pid: ent.pid, turns: turns, convKey: (recId || ('new-' + ent.pid)), asked: Number((q.who || {})[ent.pid]) || 0, qLast: q.last, idleSec: (lastA && lastA > lastU) ? Math.round((now - lastA) / 1000) : 0, now: now, shown: st.shown, autoOff: st.off };
        if (req) { ctx.requested = true; ctx.level = req; }
        var r = IC.evaluate(ctx, window.ERG_IC_RULES); if (!r || !r.fire || !r.text) return;
        if (!req) { if (r.key && r.key === icLastKey) return; icLastKey = r.key || ''; }
        st.shown.push({ moment: r.moment, variant: r.variant, pid: r.pid || ent.pid, conv: r.conv || ctx.convKey, qn: r.qn, key: r.key, t: now, level: r.level }); icSave(st);
        icBoxEl().innerHTML = '<div class="card" style="margin:6px 0;border-style:dashed"><div style="font-size:var(--fs-1)" class="muted">🧭 助教提醒（自己決定要不要用，不影響任何分數）</div><div style="font-size:var(--fs-2);margin:4px 0">' + esc(r.text) + '</div><div class="row" style="gap:6px;flex-wrap:wrap"><button type="button" class="ghost" id="icEx" style="font-size:var(--fs-1)">給我例子</button><button type="button" class="ghost" id="icDemo" style="font-size:var(--fs-1)">示範一下</button><button type="button" class="ghost" id="icClose" style="font-size:var(--fs-1)">收起來</button><button type="button" class="ghost" id="icOff" style="font-size:var(--fs-1)">先不要自動提醒</button></div></div>';
        var b1 = $('icEx'), b2 = $('icDemo'), b3 = $('icClose'), b4 = $('icOff');
        if (b1) b1.onclick = function () { icRun(2); }; if (b2) b2.onclick = function () { icRun(3); };
        if (b3) b3.onclick = function () { icBoxEl().innerHTML = ''; };
        if (b4) b4.onclick = function () { var s2 = icLoad(); s2.off = true; icSave(s2); icBoxEl().innerHTML = '<div class="muted" style="font-size:var(--fs-1);margin:4px 0">好，不再自動提醒。想看時隨時按「🧭 助教」。</div>'; };
      } catch (e) { /* 助教出錯不能影響訪談 */ }
    }
    var tIc = $('icAsk'); if (tIc) tIc.onclick = function () { var s3 = icLoad(); s3.off = false; icSave(s3); icRun(1); };
    if (c._icT) { clearInterval(c._icT); c._icT = null; }
    c._icT = setInterval(function () { if (!$('icBox')) { clearInterval(c._icT); c._icT = null; return; } icRun(); }, 30000);
    function draw(v) {
      try { lastTurns = Object.keys((v && v.turns) || {}).map(function (k) { return v.turns[k]; }).sort(function (a, b) { return a.t - b.t; }); } catch (e) { lastTurns = []; }
      var logEl = $('chatLog'); if (!logEl) return;
      var turns = v && v.turns ? Object.keys(v.turns).map(function (k) { return v.turns[k]; }).sort(function (a, b) { return Number(a.t) - Number(b.t); }) : [];
      logEl.innerHTML = turns.length ? turns.map(function (t) {
        var mine = t.role === 'u';
        return '<div style="margin:4px 0;display:flex;' + (mine ? 'justify-content:flex-end' : '') + '"><div style="max-width:88%;padding:6px 10px;border:var(--bw-s) solid var(--ink);border-radius:var(--r-m);background:' + (mine ? 'var(--yellow)' : 'var(--panel)') + ';' + (t.status && t.status !== 'ok' ? 'opacity:.75;font-style:italic' : '') + '">' + (mine ? '' : '<b style="font-size:var(--fs-1)">' + esc(ent.name) + '</b><br>') + esc(t.text) + '</div></div>';
      }).join('') + (turns[turns.length - 1].role === 'u' ? '<div class="muted" style="font-size:var(--fs-1)">' + esc(ent.name) + ' 正在想……</div>' : '') : '<div class="muted" style="font-size:var(--fs-2)">還沒開始。先打招呼，或問一個開放式的問題。</div>';
      logEl.scrollTop = logEl.scrollHeight;
      if (recId && turns.some(function (t) { return t.role === 'a' && t.status === 'ok'; })) { var ix2 = recFor(ent.pid); if (ix2 >= 0 && !CORE.getLink(player().links, player().interviews[ix2].id)) { player().links[CORE.linkKey(player().interviews[ix2].id)] = liveLink(player().interviews[ix2].id); save(); var lk = $('lnk'); if (lk) lk.value = CORE.getLink(player().links, player().interviews[ix2].id); } }
      icRun();
      var st = $('chatStat'); if (st) st.textContent = liveReady() ? ('連線中・' + turns.filter(function (t) { return t.role === 'u'; }).length + ' 題') : liveLabel();
    }
    if (recId) { var ref = chatRef(recId), cb = function (s) { draw(s.val()); }; ref.on('value', cb); c.chatOff = function () { ref.off('value', cb); }; } else draw(null);
    function send() {
      var inp = $('chatIn'), text = (inp.value || '').trim(); if (!text || !liveReady()) return;
      var rec = ensureRec(ent); if (!recId) { recId = rec.id; renderIntv(); }
      var ref = chatRef(rec.id), now = Date.now();
      ref.child('prompt').once('value', function (s) {
        if (!s.val()) ref.update({ personaId: ent.pid, personaName: ent.name, prompt: promptFor(sel), createdAt: now });
        var key = ref.child('turns').push({ role: 'u', text: text, t: now }).key;
        window.firebase.database().ref('er/_queue').push({ sess: APP.SESS, code: c.code, sid: me(), rec: safeKey(rec.id), turn: key, t: now });
      });
      player().chatTurns = (Number(player().chatTurns) || 0) + 1;   /* 成就用：即時訪談送出幾題 */
      P.skInvalidate();
      try { if (window.ERG_ACH && window.ERG_ACH.noteOffHours) window.ERG_ACH.noteOffHours(player(), now); } catch (e) {}   /* 10-23 課外時間成就 */
      try { if (window.ERG_ACH && window.ERG_ACH.noteQuestion) { var us = lastTurns.filter(function (t) { return t.role === 'u'; }), as = lastTurns.filter(function (t) { return t.role !== 'u'; }); window.ERG_ACH.noteQuestion(player(), { text: text, pid: ent.pid, prev: as.length ? as[as.length - 1].text : '', first: us.length === 0, n: us.length + 1 }); } } catch (e) {}
      save();
      if ($('chatIn')) { $('chatIn').value = ''; $('chatIn').focus(); }
      if (c.role === 'member') DB.appendEvent(c.code, { kind: 'chat', env: me(), rec: rec.id });
    }
    var sendBtn = $('chatSend'), inp = $('chatIn');
    if (sendBtn) sendBtn.onclick = send;
    if (inp) inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); send(); } });
  }
  APP.data.listeners.push(function (topic) { if (topic === 'daemon' && cur() && cur().tab === 'intv' && !typing() && $('chatStat')) { var st = $('chatStat'); st.textContent = liveLabel(); var inp = $('chatIn'), b = $('chatSend'); if (inp) { inp.disabled = !liveReady(); } if (b) b.disabled = !liveReady(); } });
  function setRec(ix, key, patch) { player().interviews[ix] = CL.setItem(player().interviews[ix], key, patch); save(); renderIntv(); }
  function selectText(el) { var rg = document.createRange(); rg.selectNodeContents(el); var s = window.getSelection(); s.removeAllRanges(); s.addRange(rg); }

  /* ───── 筆記卡 ───── */
  var CARD_TYPES = ['便利貼', '問號', '重要', '想法', '矛盾', '勘查卡', '留言'];
  function nextSlot() {
    var occ = RM.allEls().filter(function (e) { return !e.isDeleted && e.customData && e.customData.marker; }).length;
    var nb = window.ERG_LAYOUT.room('notebook'); return { x: nb.x + 24 + (occ % 6) * 270, y: nb.y + 56 + Math.floor(occ / 6) * 170 };
  }
  function makeCard(type, fields) {
    var id = CORE.nextId(player(), me()), pos = nextSlot();
    var c = CARDS.buildCard(type, fields, { id: id, author: me(), round: 1, loc: player().loc, clueId: fields.clue || '', x: pos.x, y: pos.y, where: 'notebook' });
    var m = c.skeleton[0].customData.marker; if (fields.refs) m.refs = fields.refs;
    RM.addElements(c.skeleton); save(); return id;
  }
  P.addOpenCard = function (type, text) { try { makeCard(type, { text: text }); } catch (e) { RM.toast(e.message); } };
  function renderCards() {
    var p = $('p-cards'), pre = P.prefill || {}; P.prefill = null;
    /* 10-20：房間資料一更新（別人加入、存檔通知）面板會整個重畫，打到一半的字與點好的根據編號被清空。重畫前先記下，重畫後放回去。 */
    var keep = null;
    if (!pre.type && $('cardForm')) { var kv = function (id) { var x = $(id); return x ? x.value : ''; }; keep = { type: P.cardType, text: kv('cf-text'), saw: kv('cf-saw'), refs: kv('cf-refs'), clue: kv('cf-clue') }; }
    var mine = L.listMarkers(RM.markerEls());
    var html = '<div class="card" style="margin-top:0"><b>記一筆</b><div class="row" style="margin-top:6px">' + CARD_TYPES.map(function (t) { return '<button class="pill ' + ((pre.type || P.cardType || '便利貼') === t ? 'on' : '') + '" data-ct="' + t + '">' + t + '</button>'; }).join('') + '</div>' +
      '<div id="cardForm" style="margin-top:6px"></div></div>' +
      (cur().mobile ? '' : '<div class="row"><button class="ghost" id="seeNb">看筆記本</button><button class="ghost" id="seeAll">回到全景</button></div>') + '<h2>筆記本裡的卡（' + mine.length + '）</h2>';
    mine.forEach(function (m) { html += '<div class="card" data-cid="' + esc(m.id) + '" style="padding:6px 10px;margin:6px 0;box-shadow:var(--sh) var(--sh) 0 var(--ink)"><b>' + esc(m.id) + '</b> <span class="tag">' + esc(m.type) + '</span> <span class="muted" style="font-size:var(--fs-1)">' + (m.author === me() ? '我' : esc(m.author)) + '</span><div style="font-size:var(--fs-2)">' + esc(String(m.text || '').split('\n').slice(1).join(' ')) + '</div></div>'; });
    p.innerHTML = html;
    /* 10-18：場景一變（事件裡人物移動）onSceneChanged 就重畫這一頁；原本選的卡片種類只放在一次性的 prefill，
       重畫後一律回到「便利貼」⇒ 學生按了「勘查卡」表單會自己跳掉。改成記住目前選的種類。 */
    var type = pre.type || P.cardType || '便利貼'; P.cardType = type;
    function form() {
      var f = $('cardForm'), t = CARDS.TYPES[type], h = '';
      if (type === '勘查卡') h = '<label>線索<select id="cf-clue">' + cur().world.clues.map(function (c) { return '<option value="' + esc(c.id) + '"' + (pre.clue === c.id || cur().selClue === c.id ? ' selected' : '') + '>' + esc(c.id) + ' ' + esc(c.title) + '</option>'; }).join('') + '</select></label><label>我看到（一句話）<input id="cf-saw" maxlength="60"></label>';
      else h = '<label>' + esc(t.fields[0].label) + '<input id="cf-text" maxlength="80" placeholder="' + esc(t.fields[0].ph) + '"></label>';
      if (type === '想法' || type === '矛盾') {
        var mineIds = myIds();
        h += '<div class="muted" style="font-size:var(--fs-1);margin-top:4px">' + (type === '矛盾' ? '例：護理師說「現在都傳簡訊，很方便」，線索卻寫「三則全部看完要點 21 步」。' : '例：我猜病人不是不想看，是點到一半就放棄了。') + '</div>' +
          '<label>根據哪一張卡或哪一段訪談（要填，檢核點 3 才會亮）<input id="cf-refs" placeholder="點下面的編號，或自己打 #' + esc(me()) + '-01"></label>' +
          '<div id="cf-refPick">' + (mineIds.length ? mineIds.map(function (id) { return '<button type="button" class="pill" data-rp="' + esc(id) + '">' + esc(id) + '</button>'; }).join('') : '<span class="muted" style="font-size:var(--fs-1)">你還沒有卡片或訪談可以當根據，先去記一張勘查卡。</span>') + '</div>';
      }
      f.innerHTML = h + '<div class="row" style="margin-top:6px"><button id="cf-add">加到筆記本</button><span id="cf-err" class="err"></span></div>';
      Array.prototype.forEach.call(f.querySelectorAll('[data-rp]'), function (b) { b.onclick = function () {
        var inp = $('cf-refs'), list = inp.value.split(/[,，\s]+/).filter(Boolean), i = list.indexOf(b.dataset.rp);
        if (i >= 0) list.splice(i, 1); else list.push(b.dataset.rp);
        inp.value = list.join(', '); b.classList.toggle('on', i < 0);
      }; });
      $('cf-add').onclick = function () {
        var fields = type === '勘查卡' ? { clue: $('cf-clue').value, saw: $('cf-saw').value.trim() } : { text: $('cf-text').value.trim() };
        if ($('cf-refs')) { fields.refs = $('cf-refs').value.split(/[,，\s]+/).filter(Boolean); if (!fields.refs.length) { $('cf-err').textContent = '請填它根據哪一張卡（點上面的編號）'; return; } }
        try { var nid = makeCard(type, fields); ['cf-text', 'cf-saw', 'cf-refs'].forEach(function (k) { if ($(k)) $(k).value = ''; }); renderCards();
          /* 10-26：加完表單清空、新卡在下面清單裡，矮視窗要往下捲才看得到，同學以為卡片不見了（二丙 0216 回報）⇒ 出現提示（不自動捲動，才不會把表單捲走、連續記好幾張時要再捲回來） */
          try { var nel = $('p-cards').querySelector('[data-cid="' + nid + '"]'); if (nel) { nel.style.outline = '3px solid var(--yellow, #f5c518)'; setTimeout(function () { nel.style.outline = ''; }, 2500); } RM.toast('已加到筆記本：' + nid + (nel ? '（往下捲，在「筆記本裡的卡」清單最後一張）' : '')); } catch (e2) {} } catch (e) { $('cf-err').textContent = e.message; }
      };
    }
    form();
    if (keep && keep.type === type) {
      var put = function (id, v) { var x = $(id); if (x && v) x.value = v; };
      put('cf-text', keep.text); put('cf-saw', keep.saw); put('cf-refs', keep.refs); put('cf-clue', keep.clue);
      var rl = keep.refs ? keep.refs.split(/[,，\s]+/).filter(Boolean) : [];
      Array.prototype.forEach.call(p.querySelectorAll('[data-rp]'), function (b) { b.classList.toggle('on', rl.indexOf(b.dataset.rp) >= 0); });
    }
    Array.prototype.forEach.call(p.querySelectorAll('[data-ct]'), function (b) { b.onclick = function () { P.prefill = { type: b.dataset.ct }; renderCards(); }; });
    /* 10-13 楊老師：「按下回到全景沒有反應」。手機沒有畫布，這兩顆本來就是空的 ⇒ 手機不放；
       電腦原本只有先按過「看筆記本」才看得出變化 ⇒ 改成跟頂列「⟲ 全景」同一件事（整張地圖）。 */
    if ($('seeNb')) $('seeNb').onclick = function () { var b = $('fitBtn'); if (b) b.click(); RM.focusRect(window.ERG_LAYOUT.room('notebook')); };   /* 10-13：在房間畫面直接聚焦會一片空白（學生回報「筆記本內容無法查閱」），先切到全景 */
    if ($('seeAll')) $('seeAll').onclick = function () { var b = $('fitBtn'); if (b) b.click(); else RM.focusAll(); };
  }

  /* ───── 結論 ───── */
  function myIds() { return L.listMarkers(RM.markerEls()).filter(function (m) { return m.author === me(); }).map(function (m) { return m.id; }).concat(player().interviews.map(function (r) { return r.id; })); }
  function addConclusionRef(id) {
    var cs = player().conclusions; if (!cs.length || cs[cs.length - 1].text) cs.push({ text: '', refs: [], tradeoff: '', direction: '' });
    var c = cs[cs.length - 1]; if (c.refs.indexOf(id) < 0) c.refs.push(id); save();
  }
  function renderConcl() {
    var p = $('p-concl'), dirs = (cur().world.meta.directions || []).concat(['其他']), ids = myIds(), cs = player().conclusions;
    var html = '<div class="muted" style="font-size:var(--fs-2)">每一條結論都要有根據的編號與取捨，不寫「最佳方案」，要寫在什麼前提下選哪個、放棄什麼。</div>';
    /* 10-20：結論、卡片、訪談都跟著「房間」走。學生換了一間房（或另開新房）就看到一片空白，以為結論不見了（10-15、10-13 兩次回報）。
       這間房還沒寫東西、但自己在別間房寫過，就明講在哪一間。 */
    if (!cs.some(function (c) { return c && (String(c.text || '').trim() || String(c.tradeoff || '').trim() || (c.refs && c.refs.length)); })) {
      var els = [];
      try { DB.listRooms(APP.SESS).forEach(function (r) { if (r.code === cur().code) return; var full = DB.getRoom(r.code); if (!full || !full.members || !full.members[me()]) return; var op = CORE.getPlayer(full, me()); if (!op) return; var n = op.conclusions.filter(function (c) { return c && (String(c.text || '').trim() || String(c.tradeoff || '').trim()); }).length; if (n) els.push({ code: r.code, n: n }); }); } catch (e) {}
      if (els.length) html += '<div id="conclElsewhere" class="card" style="margin:6px 0;background:var(--yellow);color:var(--ink-fixed)"><b>你的結論沒有不見</b>：結論跟著房間走，這間房還沒寫。你在 ' + els.map(function (x) { return '房間 <b>' + esc(x.code) + '</b>（' + x.n + ' 條）'; }).join('、') + ' 寫過。回大廳進那間房就看得到；也可以在這間房重寫。</div>';
    }
    cs.forEach(function (c, i) {
      html += '<div class="card" style="box-shadow:var(--sh) var(--sh) 0 var(--ink)"><b>結論 ' + (i + 1) + '</b> <button class="ghost" data-del="' + i + '" style="float:right;padding:0 8px">刪除</button>' +
        '<label>發現<textarea data-ci="' + i + '" data-f="text">' + esc(c.text) + '</textarea></label>' +
        '<div style="margin-top:4px">根據：' + ((c.refs || []).map(function (r) { return '<span class="ref ' + (ids.indexOf(r) >= 0 ? '' : 'bad') + '">' + esc(r) + '</span>'; }).join('') || '<span class="muted">（點下面的編號加入）</span>') + '</div>' +
        '<div>' + ids.map(function (id) { return '<button class="pill ' + (c.refs.indexOf(id) >= 0 ? 'on' : '') + '" data-ref="' + i + '|' + esc(id) + '">' + esc(id) + '</button>'; }).join('') + '</div>' +
        '<label>取捨<input data-ci="' + i + '" data-f="tradeoff" value="' + esc(c.tradeoff) + '" placeholder="在什麼前提下這樣選、放棄了什麼"></label>' +
        '<label>再設計方向<select data-ci="' + i + '" data-f="direction"><option value="">（請選）</option>' + dirs.map(function (d) { return '<option' + (c.direction === d ? ' selected' : '') + '>' + esc(d) + '</option>'; }).join('') + '</select></label></div>';
    });
    html += '<div class="row"><button class="ghost" id="cAdd">新增一條結論</button></div>';
    var e = cur().ev, c4 = e && e.ev.list[3];
    html += '<div id="cStat" class="muted" style="margin-top:8px;font-size:var(--fs-2)">' + (c4 ? (c4.ok ? '✔ 結論都有根據與取捨' : '還缺：' + esc(c4.detail)) : '') + '</div>';
    html += '<hr><button id="finishBtn" ' + (player().finished ? 'disabled' : '') + '>' + (player().finished ? '這一場已結束' : '結束這一場') + '</button> <span class="muted" style="font-size:var(--fs-1)">' + (isHost() ? '這是你自己的房間，結束後才算第 1 場完成。' : '這是你去討論的房間，討論完在「討論」分頁按完成。') + '</span><div id="cErr" class="err"></div>';
    p.innerHTML = html;
    $('cAdd').onclick = function () { cs.push({ text: '', refs: [], tradeoff: '', direction: '' }); save(); renderConcl(); };
    Array.prototype.forEach.call(p.querySelectorAll('[data-ci]'), function (el) { el.onchange = function () {
      cs[+el.dataset.ci][el.dataset.f] = el.value; save();
      /* 10-20：不能在這裡整頁重畫。change 在「失焦」時才觸發，學生打完字直接去點根據編號或「結束這一場」，
         那一下 mousedown 先讓欄位失焦、重畫把按鈕換掉，click 就消失了（二乙同學回報「都寫了卻沒辦法結束」）。只更新下方的提示文字。 */
      var ee = cur().ev, cc = ee && ee.ev.list[3], st = $('cStat');
      if (st && cc) st.textContent = cc.ok ? '✔ 結論都有根據與取捨' : '還缺：' + cc.detail;
    }; });
    Array.prototype.forEach.call(p.querySelectorAll('[data-ref]'), function (b) { b.onclick = function () { var a = b.dataset.ref.split('|'), c = cs[+a[0]], k = c.refs.indexOf(a[1]); if (k >= 0) c.refs.splice(k, 1); else c.refs.push(a[1]); save(); renderConcl(); }; });
    Array.prototype.forEach.call(p.querySelectorAll('[data-del]'), function (b) { b.onclick = function () { cs.splice(+b.dataset.del, 1); save(); renderConcl(); }; });
    $('finishBtn').onclick = function () {
      var ev = APP.evaluate(); var c = ev.ev.list[3];
      if (isHost() && !c.ok) { $('cErr').textContent = '還不能結束：' + c.detail; return; }
      player().finished = true; save(); renderConcl();
    };
  }

  /* ───── 討論 ───── */
  function renderDisc() {
    var p = $('p-disc'), room = DB.getRoom(cur().code), pl = player(), d = pl.discussion, others = Object.keys(room.members || {}).filter(function (k) { return k !== me(); });
    var html = '<div class="card" style="margin-top:0"><b>個人作業，但提交前要和另一位同學討論一次</b><div class="muted" style="font-size:var(--fs-2)">單人也可以玩；你要去一間「別人進去過的房間」，在裡面和房裡的同學討論各自的結論。即時或留言都可以，對方上線按「確認」才算完成。</div></div>';
    if (isHost()) {
      html += '<p>這是你自己的房間。' + (others.length ? '現在房裡還有：' + others.map(esc).join('、') + '。' : '還沒有別人進來。') + ' 你的討論要到別人的房間做（大廳找一間有人的房間加入）。</p>';
    } else {
      html += '<p>你在 <b>' + esc(room.host) + '</b> 的房間，這是你的「討論場次」。</p><div><b>1. 和誰討論</b></div><div>' + (others.length ? others.map(function (o) { return '<button class="pill ' + (d.partners.indexOf(o) >= 0 ? 'on' : '') + '" data-pt="' + esc(o) + '">' + esc(o) + '</button>'; }).join('') : '<span class="muted">房裡只有你，等同學進來或留言給房主。</span>') + '</div>' +
        /* 10-20：對方按了確認，這邊原本只在「檢核」分頁才看得到（二乙回報「同學已經按確認但我這裡沒有顯示」）。討論分頁也列出來。 */
        (d.partners.length ? '<div id="discConf" style="margin-top:6px;font-size:var(--fs-2)">' + d.partners.map(function (o) { var op = (room.players || {})[o], yes = !!(op && op.confirms && op.confirms[me()]); return '<div data-conf="' + esc(o) + '" data-ok="' + (yes ? '1' : '0') + '"><b>' + esc(o) + '</b>：' + (yes ? '<b style="color:var(--ok)">已按確認 ✔</b>' : '還沒按「確認我們討論過」（請他到這間房的「討論」分頁按）') + '</div>'; }).join('') + '</div>' : '') +
        '<div style="margin-top:8px"><b>2. 討論檢核</b></div>' + [['read', '我讀過對方的結論'], ['diff', '我們有一處看法不同'], ['complement', '我們有一處互相補到對方'], ['outcome', '我因此改了或確認了我的結論']].map(function (x) {
          return '<div class="ck ' + (d.checks[x[0]] ? 'done' : '') + '"><button class="box" data-ck="' + x[0] + '">' + (d.checks[x[0]] ? ic('check', '✔') : '') + '</button><div style="flex:1;min-width:0"><div style="font-weight:900">' + x[1] + '</div>' + (x[0] !== 'read' && d.checks[x[0]] ? '<input data-dn="' + x[0] + '" maxlength="40" value="' + esc(d.notes[x[0]] || '') + '" placeholder="一句話（最多 40 字）">' : '') + '</div></div>'; }).join('') +
        '<button id="discDone" ' + (pl.finished ? 'disabled' : '') + '>' + (pl.finished ? '討論已完成' : '完成這次討論') + '</button> <span id="discErr" class="err"></span>';
    }
    var asks = Object.keys(room.players || {}).filter(function (sid) { var o = room.players[sid]; return sid !== me() && o.discussion && (o.discussion.partners || []).indexOf(me()) >= 0; });
    html += '<h2>要我確認的討論</h2>' + (asks.length ? asks.map(function (sid) { var o = room.players[sid]; var done = !!pl.confirms[sid]; return '<div class="card" style="box-shadow:var(--sh) var(--sh) 0 var(--ink);padding:8px 12px"><b>' + esc(sid) + '</b> 說和你討論過<div class="muted" style="font-size:var(--fs-2)">不同：' + esc(o.discussion.notes.diff || '（未寫）') + '<br>互補：' + esc(o.discussion.notes.complement || '（未寫）') + '<br>他的結論：' + esc(o.discussion.notes.outcome || '（未寫）') + '</div><button data-cf="' + esc(sid) + '" ' + (done ? 'disabled' : '') + '>' + (done ? '已確認' : '確認我們討論過') + '</button></div>'; }).join('') : '<p class="muted">目前沒有人找你確認。</p>');
    p.innerHTML = html;
    Array.prototype.forEach.call(p.querySelectorAll('[data-pt]'), function (b) { b.onclick = function () { var i = d.partners.indexOf(b.dataset.pt); if (i >= 0) d.partners.splice(i, 1); else d.partners.push(b.dataset.pt); save(); renderDisc(); }; });
    Array.prototype.forEach.call(p.querySelectorAll('[data-ck]'), function (b) { b.onclick = function () { d.checks[b.dataset.ck] = !d.checks[b.dataset.ck]; save(); renderDisc(); }; });
    Array.prototype.forEach.call(p.querySelectorAll('[data-dn]'), function (el) { el.onchange = function () { d.notes[el.dataset.dn] = el.value; save(); }; });
    Array.prototype.forEach.call(p.querySelectorAll('[data-cf]'), function (b) { b.onclick = function () { pl.confirms[b.dataset.cf] = true; save(); renderDisc(); }; });
    var dd = $('discDone'); if (dd) dd.onclick = function () {
      var ok = d.partners.length >= 1 && ['read', 'diff', 'complement', 'outcome'].every(function (k) { return d.checks[k]; });
      if (!ok) { $('discErr').textContent = '要選至少一位對象，並把四項都勾完。'; return; }
      pl.finished = true; pl.visit = true; save(); renderDisc();
    };
  }

  /* ───── 檢核點與報告 ───── */
  function renderCp() {
    var p = $('p-cp'), e = APP.evaluate(); if (!e) return; cur().ev = e;
    var html = (APP.week2Summary ? APP.week2Summary() : '') + '<details id="cpW1"' + (cur().cpW1Open ? ' open' : '') + '><summary style="cursor:pointer"><b>痛點急診室 1/3（W6）檢核點　' + e.ev.lit + ' / ' + e.ev.total + '</b> ' + (e.ev.passed ? '<span class="tag ok">全部完成</span>' : '<span class="muted" style="font-size:var(--fs-2)">還沒完成的可以繼續做（點開看全部、在這裡提交）</span>') + '</summary>' +
      (e.ev.next ? '<div id="cpNext" class="card" style="margin:6px 0;padding:8px 12px;box-shadow:var(--sh) var(--sh) 0 var(--ink);background:var(--yellow);color:var(--ink-fixed)"><b>下一步</b>　' + esc(e.ev.next.text) + '</div>' : '') +
      CP.listHtml(e.ev);
    var gate = CORE.submitGate(e.state), sub = !!(player().submitted);
    /* 10-13：提交要在「檢核點算的那一間房」按（紀錄最完整的那間）。二乙有同學在 8 間空房按了提交，真正做完的房間卻沒提交，檢核點 6 永遠不亮。 */
    var wr = e.state._workRoom, inWork = !wr || wr === cur().code, canSub = gate.ok && inWork && (isHost() || !!wr);
    var subMsg = !inWork ? '你的紀錄（卡片、訪談、結論）在房間 ' + esc(wr) + '，提交要回到那間房按。' : (isHost() || wr ? (gate.ok ? '前面都完成了，可以提交。' : '還不能提交，先把上面打叉的補完。') : '提交要回到自己開的房間做。');
    /* 10-20 二乙 0914：前五點都亮、卻在別間房（例如做討論的同學房間）看到灰掉的提交鈕，一行小字沒人看到。改成醒目的說明，並列出缺的項目 */
    var why = !inWork ? '你的紀錄（卡片、訪談、結論）在房間 <b>' + esc(wr) + '</b>，提交鈕要回到那間房才按得下去（現在這間是 ' + esc(cur().code) + '）。回大廳，在「我在裡面」的清單按「回去」進房間 ' + esc(wr) + '。' : (!gate.ok ? '還不能提交：' + gate.blockers.map(esc).join('；') : '');
    if (!sub || !inWork) html += '<button id="submitBtn" ' + (canSub ? '' : 'disabled') + '>提交</button> <span class="muted" style="font-size:var(--fs-1)">' + subMsg + '</span>' + (why && !canSub ? '<div id="submitWhy" class="card" style="margin-top:6px;border-color:var(--bad);font-size:var(--fs-2)">' + why + '</div>' : '');
    else if (e.ev.passed) html += passedBlock(e);
    else html += '<div class="card" style="border-color:var(--bad)"><b>已經按過提交，但還有打叉的項目</b><div class="muted" style="font-size:var(--fs-2)">把上面打叉的補完，這裡就會變成綠色的「已通過」。</div></div>';
    p.innerHTML = html + '</details>';
    var w1d = $('cpW1'); if (w1d) w1d.addEventListener('toggle', function () { var cc = cur(); if (cc) cc.cpW1Open = w1d.open; });   /* 記住這間房開過，重畫時不會又收起來 */
    var sb = $('submitBtn'); if (sb) sb.onclick = doSubmit;
    var rb = $('reportBtn'); if (rb) rb.onclick = function () { showReport(e); };
  }
  function doSubmit() {
    var e = APP.evaluate(), gate = CORE.submitGate(e.state);
    if (!gate.ok || (e.state._workRoom && e.state._workRoom !== cur().code)) { renderCp(); return; }
    DB.saveSnapshot(cur().code, 5, RM.allEls().filter(function (x) { return !(x.customData && x.customData.base); }));
    player().submitted = true; player().submittedAt = Date.now(); save(); DB.appendEvent(cur().code, { kind: 'submit', env: me() });
    renderCp();
  }
  function passedBlock(e) {
    var code = CP.verifyCode(me(), new Date(player().submittedAt || Date.now()).toISOString().slice(0, 16), 'local');
    return '<div class="card" style="background:#b2f2bb;color:var(--ink-fixed)"><div style="font-size:40px;font-weight:900;line-height:1.1">已通過</div><div style="font-size:var(--fs-2)">' + esc(cur().world.meta.name) + '　六個檢核點全部完成。把這個綠色畫面截圖，上傳到 flipclass 的作業就完成了。</div>' +
      '<div style="font-size:var(--fs-2);margin-top:6px">' + esc(APP.me.cls) + '　學號 ' + esc(me()) + '</div><div style="font-size:var(--fs-1)">驗證碼：<b>' + code + '</b></div></div><button id="reportBtn" class="ghost">想留一份紀錄：匯出訪談報告</button>';
  }
  /* 第 8 週：報告要的對話逐字稿（我問了幾題、對方說過什麼）。只有線上版有；讀不到就當沒有，4 秒內不回來也不等 */
  function fetchChat(code, cb) {
    var done = false; function fin(v) { if (!done) { done = true; cb(v); } }
    try { if (!window.firebase || !code || !me()) return fin(null); setTimeout(function () { fin(null); }, 4000);
      window.firebase.database().ref('er/' + APP.SESS + '/chat/' + code + '/' + me()).once('value', function (s) { fin(s.val() || {}); }, function () { fin(null); });
    } catch (x) { fin(null); }
  }
  function roomNameMap() { var o = {}; try { (window.ERG_LAYOUT.ROOMS || []).forEach(function (r) { o[r.id] = r.name; }); } catch (x) {} return o; }
  /* 這個案例的重要人物（大廳與報告共用） */
  function caseKeyIds(world) { var pl = Object.keys(world.personas).filter(function (k) { return (world.personas[k].cases || []).indexOf(world.meta.id) >= 0; }).map(function (id) { return { id: id }; }); return window.ERG_STORYBOARD.keyIds(world.meta.id, world.meta, pl); }
  /* 組報告並開在視窗裡（iframe）。ctx：{ world, room, pl, markers, skill:{ask,ctx}, passed, partners, chat } */
  function openReportModal(c) {
    var w = c.world, names = {}; Object.keys(w.personas).forEach(function (k) { names[k] = w.personas[k].name; });
    var d = c.pl.discussion, dg = window.ERG_REPORT_LEVEL ? window.ERG_REPORT_LEVEL.chatDigest(c.chat) : { counts: {}, quotes: {} };
    var html = RP.html({ student: { id: me(), cls: APP.me.cls, name: '' }, caseName: w.meta.name, date: new Date().toISOString().slice(0, 10), passed: c.passed, interviews: c.pl.interviews,
      personaNames: names, markers: c.markers, conclusions: c.pl.conclusions, skill: c.skill, mainPersona: w.meta.mainPersona, keyPersonaIds: caseKeyIds(w), chat: dg, clues: w.clues, roomNames: roomNameMap(),
      discussion: { partnersText: c.partners, diff: d.notes.diff, complement: d.notes.complement, outcome: d.notes.outcome } });
    RM.openModal('<div class="row"><b style="flex:1">訪談報告</b><button id="rpPrint">列印／另存 PDF</button><button class="ghost" id="rpClose">關閉</button></div><iframe id="rpFrame" allow="clipboard-write" style="width:100%;height:70vh;border:var(--bw) solid var(--ink);background:#fff;margin-top:8px"></iframe>');
    $('rpFrame').srcdoc = html;
    $('rpPrint').onclick = function () { try { $('rpFrame').contentWindow.focus(); $('rpFrame').contentWindow.print(); } catch (x) {} };
    $('rpClose').onclick = RM.closeModal;
  }
  function showReport(e) {
    var w = cur().world, code = cur().code, room = DB.getRoom(code), vr = e.state.discussion.room, sk = { ask: 1, ctx: 1 };
    try { var s2 = computeSk(window.ERG_ACH, player()); sk = { ask: s2.ask.lv, ctx: s2.ctx.lv }; } catch (x) {}
    var mk = L.listMarkers(RM.markerEls()).filter(function (m) { return m.author === me(); });
    fetchChat(code, function (chat) {
      openReportModal({ world: w, pl: player(), markers: mk, skill: sk, passed: e.ev.passed, chat: chat,
        partners: (e.state.discussion.partners || []).map(function (x) { return x.id; }).join('、') + (vr ? '（房間 ' + vr + '）' : '') });
    });
  }
  /* 從大廳匯出：不用進房間。世界用跟進房一樣的參數重建（約 0.3 秒）；技能等級用個人檔案裡記的最近一次 */
  P.exportFromLobby = function (code, done) {
    var room = DB.getRoom(code), world = window.ERG_WORLD.makeWorld({ caseId: room.case || 'sms', seed: room.code, dow: room.dow, shift: room.shift === 'night' ? 'night' : 'day' }), pl = CORE.getPlayer(room, me());
    if (!pl) { if (done) done(false); return; }
    var pr = (APP.me.profile && APP.me.profile.progress) || {}, mk = [];
    try { mk = L.listMarkers((DB.getScene(code) || []).concat(CORE.mcardEls(room))).filter(function (m) { return m.author === me(); }); } catch (x) {}
    var dm = pl.discussion || {};
    fetchChat(code, function (chat) {
      openReportModal({ world: world, pl: pl, markers: mk, skill: { ask: pr.ask || 1, ctx: pr.ctx || 1 }, passed: !!pl.submitted, chat: chat, partners: (dm.partners || []).map(function (x) { return x.id; }).join('、') });
      if (done) done(true);
    });
  };
  P.caseKeyIds = caseKeyIds;

})();
