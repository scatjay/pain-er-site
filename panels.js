/* 側邊面板：線索、訪談（檢核式）、筆記卡、結論、討論、檢核點與報告。 */
(function () {
  'use strict';
  var APP = window.ERG_APP, DB = APP.DB, $ = APP.$, esc = APP.esc, RM = window.ERG_ROOM;
  var CORE = window.ERG_CORE, L = window.ERG_LOGIC, CL = window.ERG_CHECKLIST, CP = window.ERG_CHECKPOINTS, CARDS = window.ERG_CARDS, PER = window.ERG_PERSONAS, RP = window.ERG_REPORT, ERG = window.ERG;
  var P = window.ERG_PANELS = {};
  function cur() { return RM.cur; }
  function me() { return APP.me.sid; }
  function player() { return cur().player; }
  function save() { RM.persist(true); RM.refreshDots(); }
  function typing() { var a = document.activeElement; return !!(a && $('side').contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)); }
  function roomNameOf(id) { var r = window.ERG_LAYOUT.room(id); return r ? r.name : id; }
  function isHost() { return String(cur().room.host) === String(me()); }

  P.renderAll = function () { ['clue', 'intv', 'cards', 'concl', 'disc', 'cp', 'events'].forEach(P.render); };
  P.render = function (t) { ({ clue: renderClue, intv: renderIntv, cards: renderCards, concl: renderConcl, disc: renderDisc, cp: renderCp, events: renderEvents, ach: renderAch })[t](); };
  /* 成就分頁：自己的指標與徽章＋班級「誰最多」（線上模式讀 er/{sess}/score；本機版只有自己） */
  function achCtx() { var c = cur(); var cp = (window.ERG_CORE && window.ERG_CP && c) ? (function () { try { var st = window.ERG_CORE.checkpointState(c, me()); return window.ERG_CP.evaluate(st).every(function (x) { return x.ok; }); } catch (e) { return false; } })() : false; return { cpAllOk: cp, shift: c && c.world && c.world.shift }; }
  P.achCtx = achCtx;
  function renderAch() {
    var p = $('p-ach'), A = window.ERG_ACH; if (!p || !A || !cur()) return;
    var m = A.metrics(player(), achCtx());
    var board = window.ERG_SCORES ? A.leaderboard(window.ERG_SCORES, 3) : null;
    var bh = board ? '<h2>班上誰最多</h2><div class="board">' + board.map(function (b) { return '<div class="b"><b>' + esc(b.label) + '</b>' + (b.rows.length ? '<ol style="margin:4px 0 0 18px;padding:0;font-size:13px">' + b.rows.map(function (r) { return '<li>' + esc(r.name) + '　' + r.v + ' ' + esc(b.unit) + '</li>'; }).join('') + '</ol>' : '<div class="muted" style="font-size:12px">還沒有人</div>') + '</div>'; }).join('') + '</div>' : '<p class="muted" style="font-size:12px">本機版沒有班級排行；線上版會列出班上誰最多。</p>';
    p.innerHTML = '<h2>我的成就</h2>' + A.html(m, esc) + bh;
    if (window.ERG_PUBLISH_SCORE) window.ERG_PUBLISH_SCORE();
  }
  P.renderAch = renderAch;
  P.onRoomChanged = function () { if (!typing()) P.render(cur().tab); };
  P.onSceneChanged = function () { if (!typing()) { if (cur().tab === 'cards') renderCards(); if (cur().tab === 'concl') renderConcl(); } };
  P.onMove = function () { renderClue(); renderIntv(); };
  function renderEvents() { var p = $('p-events'); if (window.ERG_EVENT_UI && p) window.ERG_EVENT_UI.renderBook(cur(), p); }

  /* ───── 線索 ───── */
  function clueById(id) { var cs = cur().world.clues; for (var i = 0; i < cs.length; i++) if (cs[i].id === id) return cs[i]; return null; }
  function renderClue() {
    var c = cur().selClue ? clueById(cur().selClue) : null, p = $('p-clue'), loc = player().loc;
    var here = cur().world.clues.filter(function (x) { return x.pin.room === loc; }).length;
    var head = '<div class="card" style="margin-top:0"><b>' + esc(cur().world.meta.name) + '</b><div class="muted" style="font-size:13px">' + esc(cur().world.meta.brief) + '</div></div>';
    if (!c) { p.innerHTML = head + '<p>你在「' + esc(roomNameOf(loc)) + '」，這間房有 <b>' + here + '</b> 個線索（黃色小牌）。點牌子就能讀。</p><p class="muted">要換房間：點地圖上的房間，或點右下角小地圖。</p>'; return; }
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
      topic: w.meta.short, attitudeLabel: w.meta.id === 'sms' ? '對這套簡訊的態度' : '對這套做法的態度' });
  }
  function renderIntv() {
    var p = $('p-intv'), here = RM.entityHere();
    if (cur().role !== 'member') { p.innerHTML = '<p class="muted">旁觀者不能訪談。</p>'; return; }
    var selId = cur().selNpc, sel = null;
    here.forEach(function (h) { if (h.ent.id === selId) sel = h; });
    var html = '<div class="muted" style="font-size:13px">這間房裡的人（只有在同一房間才問得到）：</div><div class="row" style="margin:6px 0">' +
      (here.length ? here.map(function (h) { return '<button class="pill ' + (sel && sel.ent.id === h.ent.id ? 'on' : '') + '" data-npc="' + esc(h.ent.id) + '">' + esc(h.ent.name) + '・' + ({ free: '可聊', short: '簡短', blocked: '正忙' })[h.av.level] + '</button>'; }).join('') : '<span class="muted">現在這間房沒有人。</span>') + '</div>';
    /* 所有可訪談的人（整間急診室），依房間分組；點不在同房的人會直接走過去，到了自動選取 */
    html += '<details' + (here.length ? '' : ' open') + ' style="margin:6px 0"><summary class="muted" style="cursor:pointer;font-size:13px">所有可訪談的人（點了就走過去）</summary><div id="allNpc" style="font-size:13px">' + allNpcHtml() + '</div></details>';
    if (!sel) { p.innerHTML = html + '<p class="muted">點上面的人，或直接點畫面上的角色。</p>'; bindNpc(p); bindAllNpc(p); return; }
    var ent = sel.ent, persona = ent.persona, ix = recFor(ent.pid), rec = ix >= 0 ? player().interviews[ix] : null;
    html += '<div class="card" style="margin-top:6px"><b>' + esc(ent.name) + '</b>　<span class="tag ' + (persona.material === '模擬' ? 'warn' : '') + '">素材：' + esc(persona.material || '模擬') + '</span><div class="muted" style="font-size:12px">' + esc(persona.title || '') + '</div>' +
      '<div style="font-size:13px">' + ({ free: '現在可以好好聊。', short: '正在忙，只能簡短回答（' + esc(sel.av.reason) + '）。', blocked: '現在不方便（' + esc(sel.av.reason) + '），晚一點再來。' })[sel.av.level] + '</div></div>';
    var live = liveReady();
    if (sel.av.level !== 'blocked' && APP.online) html += '<div class="card" id="chatBox" style="margin-top:6px"><div class="row"><b style="flex:1">💬 即時訪談</b><span id="chatStat" class="muted" style="font-size:12px">' + (live ? '連線中' : '目前離線') + '</span></div>' +
      '<div id="chatLog" style="max-height:260px;overflow:auto;font-size:14px;margin:6px 0;padding:4px 0;border-top:2px dashed var(--line)"></div>' +
      '<div class="row"><input id="chatIn" maxlength="300" placeholder="' + (live ? '問 ' + esc(ent.name) + ' 一個問題（Enter 送出）' : '即時訪談離線：老師的電腦沒開，請用下面的指令貼到 Gemini') + '"' + (live ? '' : ' disabled') + '><button id="chatSend"' + (live ? '' : ' disabled') + '>送出</button></div></div>';
    if (sel.av.level !== 'blocked') html += '<details' + (APP.online && live ? '' : ' open') + ' style="margin-top:6px"><summary class="muted" style="cursor:pointer;font-size:13px">' + (APP.online ? '備援：' : '') + '產生訪談指令，貼到 Gemini 訪談</summary><button id="genP" style="margin-top:6px">產生訪談指令</button><div id="pOut"></div></details>';
    if (rec) {
      var pr = CL.progress(rec);
      html += '<div class="row" style="margin-top:10px"><b style="flex:1">訪談檢核 ' + esc(rec.id) + '</b><span>' + pr.done + ' / ' + pr.total + '</span></div><div class="bar"><i style="width:' + Math.round(pr.ratio * 100) + '%"></i></div>';
      CL.ITEMS.forEach(function (it) {
        var v = rec.items[it.k], done = v.done;
        html += '<div class="ck ' + (done ? 'done' : '') + '"><button class="box" data-tick="' + it.k + '" aria-pressed="' + done + '">' + (done ? '✔' : '') + '</button><div style="flex:1;min-width:0"><div style="font-weight:900">' + it.label + '</div>';
        if (done) {
          html += '<div>' + CL.TRUST.map(function (t) { return '<button class="pill ' + (v.trust === t.k ? 'on' : '') + '" data-trust="' + it.k + '|' + t.k + '">' + t.label + '</button>'; }).join('') + '</div>' +
            '<input data-note="' + it.k + '" maxlength="' + CL.NOTE_MAX + '" placeholder="一句話（最多 ' + CL.NOTE_MAX + ' 字，可不填）" value="' + esc(v.note) + '" style="margin:4px 0">' +
            '<div>' + CL.TAGS.map(function (t) { return '<button class="pill ' + (v.tags.indexOf(t) >= 0 ? 'on' : '') + '" data-tag="' + it.k + '|' + esc(t) + '">' + esc(t) + '</button>'; }).join('') + '</div>';
        }
        html += '</div></div>';
      });
      html += '<label>這段 Gemini 對話的分享連結（https）<input id="lnk" placeholder="https://g.co/gemini/share/…" value="' + esc(player().links[rec.id] || '') + '"></label><div class="row" style="margin-top:6px"><button class="ghost" id="lnkSave">儲存連結</button><button id="toConcl" class="ghost">加進我的結論</button><span id="lnkMsg" class="muted"></span></div>';
    } else if (sel.av.level !== 'blocked') html += '<p class="muted" style="margin-top:10px">開始訪談後，就會出現檢核表。</p>';
    p.innerHTML = html; bindNpc(p); bindAllNpc(p);
    if ($('chatBox')) bindChat(sel, ent);
    var g = $('genP'); if (g) g.onclick = function () {
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
      $('lnkSave').onclick = function () { var v = $('lnk').value.trim(); if (v && !/^https:\/\//.test(v)) { $('lnkMsg').textContent = '連結要以 https:// 開頭'; return; } player().links[rec.id] = v; save(); $('lnkMsg').textContent = '已儲存'; };
      $('toConcl').onclick = function () { addConclusionRef(rec.id); RM.switchTab('concl'); };
    }
  }
  function bindNpc(p) { Array.prototype.forEach.call(p.querySelectorAll('[data-npc]'), function (b) { b.onclick = function () { cur().selNpc = b.dataset.npc; renderIntv(); }; }); }
  function allNpcHtml() {
    var c = cur(), simMin = RM.simMin(), byRoom = {}, LAY = window.ERG_LAYOUT, mine = player().loc;
    c.world.at(c.clock.worldSec).forEach(function (it) {
      if (it.ent.kind === 'bot' || !it.pos.room) return; var r = LAY.room(it.pos.room); if (!r || r.type !== 'room') return;
      var av = c.world.availability(it.ent, it.pos, simMin); (byRoom[it.pos.room] = byRoom[it.pos.room] || []).push({ ent: it.ent, av: av });
    });
    var rooms = Object.keys(byRoom).sort(function (a, b) { return (b === mine) - (a === mine) || LAY.room(a).name.localeCompare(LAY.room(b).name); });
    if (!rooms.length) return '<span class="muted">現在沒有人在房間裡。</span>';
    return rooms.map(function (rid) { return '<div style="margin:3px 0"><b>' + esc(roomNameOf(rid)) + (rid === mine ? '（你在這）' : '') + '</b>：' + byRoom[rid].map(function (h) { return '<button class="pill' + (c.selNpc === h.ent.id ? ' on' : '') + '" data-goto="' + esc(h.ent.id) + '" data-room="' + esc(rid) + '" style="font-size:12px;padding:1px 7px">' + esc(h.ent.name) + '・' + ({ free: '可聊', short: '簡短', blocked: '正忙' })[h.av.level] + '</button>'; }).join(' ') + '</div>'; }).join('');
  }
  function bindAllNpc(p) {
    Array.prototype.forEach.call(p.querySelectorAll('[data-goto]'), function (b) { b.onclick = function () {
      var id = b.dataset.goto, rid = b.dataset.room, c = cur();
      if (rid === player().loc) { c.selNpc = id; renderIntv(); return; }
      c.pendingNpc = id; RM.toast('走去' + roomNameOf(rid) + '找 ' + (b.textContent.split('・')[0]) + '…'); RM.travel(rid);
    }; });
  }
  /* 走到目的房間後，自動選取剛才點的人 */
  P.onMove = (function (orig) { return function () { var c = cur(); if (c && c.pendingNpc) { var id = c.pendingNpc, here = RM.entityHere().some(function (h) { return h.ent.id === id; }); if (here) { c.pendingNpc = null; c.selNpc = id; RM.switchTab('intv'); } } orig(); }; })(P.onMove);

  /* ───── 即時訪談（Firebase 佇列 → 老師電腦上的代理程式 → Vertex → 寫回）───── */
  function daemonUp() { return !!(APP.online && window.ERG_DAEMON_HB && Date.now() - window.ERG_DAEMON_HB < 60000); }
  function liveReady() { return daemonUp() && window.ERG_LIVE_OPEN !== false; }
  /* 狀態字：連線中／非上課時間暫停／目前離線 */
  function liveLabel() { return liveReady() ? '連線中' : (daemonUp() ? '非上課時間，即時訪談暫停（可以逛、可以跟同學聊）' : '目前離線'); }
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
    function draw(v) {
      var logEl = $('chatLog'); if (!logEl) return;
      var turns = v && v.turns ? Object.keys(v.turns).map(function (k) { return v.turns[k]; }).sort(function (a, b) { return Number(a.t) - Number(b.t); }) : [];
      logEl.innerHTML = turns.length ? turns.map(function (t) {
        var mine = t.role === 'u';
        return '<div style="margin:4px 0;display:flex;' + (mine ? 'justify-content:flex-end' : '') + '"><div style="max-width:88%;padding:6px 10px;border:2px solid var(--ink);border-radius:12px;background:' + (mine ? 'var(--yellow)' : 'var(--panel)') + ';' + (t.status && t.status !== 'ok' ? 'opacity:.75;font-style:italic' : '') + '">' + (mine ? '' : '<b style="font-size:12px">' + esc(ent.name) + '</b><br>') + esc(t.text) + '</div></div>';
      }).join('') + (turns[turns.length - 1].role === 'u' ? '<div class="muted" style="font-size:12px">' + esc(ent.name) + ' 正在想……</div>' : '') : '<div class="muted" style="font-size:13px">還沒開始。先打招呼，或問一個開放式的問題。</div>';
      logEl.scrollTop = logEl.scrollHeight;
      if (recId && turns.some(function (t) { return t.role === 'a' && t.status === 'ok'; })) { var ix2 = recFor(ent.pid); if (ix2 >= 0 && !player().links[player().interviews[ix2].id]) { player().links[player().interviews[ix2].id] = liveLink(player().interviews[ix2].id); save(); var lk = $('lnk'); if (lk) lk.value = player().links[player().interviews[ix2].id]; } }
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
      player().chatTurns = (Number(player().chatTurns) || 0) + 1; save();   /* 成就用：即時訪談送出幾題 */
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
    var mine = L.listMarkers(RM.markerEls());
    var html = '<div class="card" style="margin-top:0"><b>記一筆</b><div class="row" style="margin-top:6px">' + CARD_TYPES.map(function (t) { return '<button class="pill ' + ((pre.type || '便利貼') === t ? 'on' : '') + '" data-ct="' + t + '">' + t + '</button>'; }).join('') + '</div>' +
      '<div id="cardForm" style="margin-top:6px"></div></div>' +
      '<div class="row"><button class="ghost" id="seeNb">看筆記本</button><button class="ghost" id="seeAll">回到全景</button></div><h2>筆記本裡的卡（' + mine.length + '）</h2>';
    mine.forEach(function (m) { html += '<div class="card" style="padding:6px 10px;margin:6px 0;box-shadow:3px 3px 0 var(--ink)"><b>' + esc(m.id) + '</b> <span class="tag">' + esc(m.type) + '</span> <span class="muted" style="font-size:12px">' + (m.author === me() ? '我' : esc(m.author)) + '</span><div style="font-size:13px">' + esc(String(m.text || '').split('\n').slice(1).join(' ')) + '</div></div>'; });
    p.innerHTML = html;
    var type = pre.type || '便利貼';
    function form() {
      var f = $('cardForm'), t = CARDS.TYPES[type], h = '';
      if (type === '勘查卡') h = '<label>線索<select id="cf-clue">' + cur().world.clues.map(function (c) { return '<option value="' + esc(c.id) + '"' + (pre.clue === c.id || cur().selClue === c.id ? ' selected' : '') + '>' + esc(c.id) + ' ' + esc(c.title) + '</option>'; }).join('') + '</select></label><label>我看到（一句話）<input id="cf-saw" maxlength="60"></label>';
      else h = '<label>' + esc(t.fields[0].label) + '<input id="cf-text" maxlength="80" placeholder="' + esc(t.fields[0].ph) + '"></label>';
      if (type === '想法' || type === '矛盾') h += '<label>根據的編號（逗號分隔，可不填）<input id="cf-refs" placeholder="#' + esc(me()) + '-01"></label>';
      f.innerHTML = h + '<div class="row" style="margin-top:6px"><button id="cf-add">加到筆記本</button><span id="cf-err" class="err"></span></div>';
      $('cf-add').onclick = function () {
        var fields = type === '勘查卡' ? { clue: $('cf-clue').value, saw: $('cf-saw').value.trim() } : { text: $('cf-text').value.trim() };
        if ($('cf-refs')) fields.refs = $('cf-refs').value.split(/[,，\s]+/).filter(Boolean);
        try { makeCard(type, fields); renderCards(); } catch (e) { $('cf-err').textContent = e.message; }
      };
    }
    form();
    Array.prototype.forEach.call(p.querySelectorAll('[data-ct]'), function (b) { b.onclick = function () { P.prefill = { type: b.dataset.ct }; renderCards(); }; });
    $('seeNb').onclick = function () { RM.focusRect(window.ERG_LAYOUT.room('notebook')); };
    $('seeAll').onclick = function () { RM.focusAll(); };
  }

  /* ───── 結論 ───── */
  function myIds() { return L.listMarkers(RM.markerEls()).filter(function (m) { return m.author === me(); }).map(function (m) { return m.id; }).concat(player().interviews.map(function (r) { return r.id; })); }
  function addConclusionRef(id) {
    var cs = player().conclusions; if (!cs.length || cs[cs.length - 1].text) cs.push({ text: '', refs: [], tradeoff: '', direction: '' });
    var c = cs[cs.length - 1]; if (c.refs.indexOf(id) < 0) c.refs.push(id); save();
  }
  function renderConcl() {
    var p = $('p-concl'), dirs = (cur().world.meta.directions || []).concat(['其他']), ids = myIds(), cs = player().conclusions;
    var html = '<div class="muted" style="font-size:13px">每一條結論都要有根據的編號與取捨，不寫「最佳方案」，要寫在什麼前提下選哪個、放棄什麼。</div>';
    cs.forEach(function (c, i) {
      html += '<div class="card" style="box-shadow:3px 3px 0 var(--ink)"><b>結論 ' + (i + 1) + '</b> <button class="ghost" data-del="' + i + '" style="float:right;padding:0 8px">刪除</button>' +
        '<label>發現<textarea data-ci="' + i + '" data-f="text">' + esc(c.text) + '</textarea></label>' +
        '<div style="margin-top:4px">根據：' + (c.refs.map(function (r) { return '<span class="ref ' + (ids.indexOf(r) >= 0 ? '' : 'bad') + '">' + esc(r) + '</span>'; }).join('') || '<span class="muted">（點下面的編號加入）</span>') + '</div>' +
        '<div>' + ids.map(function (id) { return '<button class="pill ' + (c.refs.indexOf(id) >= 0 ? 'on' : '') + '" data-ref="' + i + '|' + esc(id) + '">' + esc(id) + '</button>'; }).join('') + '</div>' +
        '<label>取捨<input data-ci="' + i + '" data-f="tradeoff" value="' + esc(c.tradeoff) + '" placeholder="在什麼前提下這樣選、放棄了什麼"></label>' +
        '<label>再設計方向<select data-ci="' + i + '" data-f="direction"><option value="">（請選）</option>' + dirs.map(function (d) { return '<option' + (c.direction === d ? ' selected' : '') + '>' + esc(d) + '</option>'; }).join('') + '</select></label></div>';
    });
    html += '<div class="row"><button class="ghost" id="cAdd">新增一條結論</button></div>';
    var e = cur().ev, c4 = e && e.ev.list[3];
    html += '<div class="muted" style="margin-top:8px;font-size:13px">' + (c4 ? (c4.ok ? '✔ 結論都有根據與取捨' : '還缺：' + esc(c4.detail)) : '') + '</div>';
    html += '<hr><button id="finishBtn" ' + (player().finished ? 'disabled' : '') + '>' + (player().finished ? '這一場已結束' : '結束這一場') + '</button> <span class="muted" style="font-size:12px">' + (isHost() ? '這是你自己的房間，結束後才算第 1 場完成。' : '這是你去討論的房間，討論完在「討論」分頁按完成。') + '</span><div id="cErr" class="err"></div>';
    p.innerHTML = html;
    $('cAdd').onclick = function () { cs.push({ text: '', refs: [], tradeoff: '', direction: '' }); save(); renderConcl(); };
    Array.prototype.forEach.call(p.querySelectorAll('[data-ci]'), function (el) { el.onchange = function () { cs[+el.dataset.ci][el.dataset.f] = el.value; save(); renderConcl(); }; });
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
    var html = '<div class="card" style="margin-top:0"><b>個人作業，但提交前要和另一位同學討論一次</b><div class="muted" style="font-size:13px">單人也可以玩；你要去一間「別人進去過的房間」，在裡面和房裡的同學討論各自的結論。即時或留言都可以，對方上線按「確認」才算完成。</div></div>';
    if (isHost()) {
      html += '<p>這是你自己的房間。' + (others.length ? '現在房裡還有：' + others.map(esc).join('、') + '。' : '還沒有別人進來。') + ' 你的討論要到別人的房間做（大廳找一間有人的房間加入）。</p>';
    } else {
      html += '<p>你在 <b>' + esc(room.host) + '</b> 的房間，這是你的「討論場次」。</p><div><b>1. 和誰討論</b></div><div>' + (others.length ? others.map(function (o) { return '<button class="pill ' + (d.partners.indexOf(o) >= 0 ? 'on' : '') + '" data-pt="' + esc(o) + '">' + esc(o) + '</button>'; }).join('') : '<span class="muted">房裡只有你，等同學進來或留言給房主。</span>') + '</div>' +
        '<div style="margin-top:8px"><b>2. 討論檢核</b></div>' + [['read', '我讀過對方的結論'], ['diff', '我們有一處看法不同'], ['complement', '我們有一處互相補到對方'], ['outcome', '我因此改了或確認了我的結論']].map(function (x) {
          return '<div class="ck ' + (d.checks[x[0]] ? 'done' : '') + '"><button class="box" data-ck="' + x[0] + '">' + (d.checks[x[0]] ? '✔' : '') + '</button><div style="flex:1;min-width:0"><div style="font-weight:900">' + x[1] + '</div>' + (x[0] !== 'read' && d.checks[x[0]] ? '<input data-dn="' + x[0] + '" maxlength="40" value="' + esc(d.notes[x[0]] || '') + '" placeholder="一句話（最多 40 字）">' : '') + '</div></div>'; }).join('') +
        '<button id="discDone" ' + (pl.finished ? 'disabled' : '') + '>' + (pl.finished ? '討論已完成' : '完成這次討論') + '</button> <span id="discErr" class="err"></span>';
    }
    var asks = Object.keys(room.players || {}).filter(function (sid) { var o = room.players[sid]; return sid !== me() && o.discussion && (o.discussion.partners || []).indexOf(me()) >= 0; });
    html += '<h2>要我確認的討論</h2>' + (asks.length ? asks.map(function (sid) { var o = room.players[sid]; var done = !!pl.confirms[sid]; return '<div class="card" style="box-shadow:3px 3px 0 var(--ink);padding:8px 12px"><b>' + esc(sid) + '</b> 說和你討論過<div class="muted" style="font-size:13px">不同：' + esc(o.discussion.notes.diff || '（未寫）') + '<br>互補：' + esc(o.discussion.notes.complement || '（未寫）') + '<br>他的結論：' + esc(o.discussion.notes.outcome || '（未寫）') + '</div><button data-cf="' + esc(sid) + '" ' + (done ? 'disabled' : '') + '>' + (done ? '已確認' : '確認我們討論過') + '</button></div>'; }).join('') : '<p class="muted">目前沒有人找你確認。</p>');
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
    var html = '<div class="row"><b style="flex:1">檢核點　' + e.ev.lit + ' / ' + e.ev.total + '</b>' + (e.ev.passed ? '<span class="tag ok">全部完成</span>' : '') + '</div>' +
      e.ev.list.map(function (x) { return '<div class="ck ' + (x.ok ? 'done' : '') + '"><div class="box" style="display:flex;align-items:center;justify-content:center">' + (x.ok ? '✔' : x.id) + '</div><div style="flex:1;min-width:0"><div style="font-weight:900">' + x.id + ' ' + esc(x.label) + '</div><div class="muted" style="font-size:12px">' + esc(x.detail) + '</div></div></div>'; }).join('');
    var gate = CORE.submitGate(e.state), sub = !!(player().submitted);
    if (!sub) html += '<button id="submitBtn" ' + (gate.ok && isHost() ? '' : 'disabled') + '>提交</button> <span class="muted" style="font-size:12px">' + (isHost() ? (gate.ok ? '前五個檢核點都亮了，可以提交。' : '還缺：' + esc(gate.blockers.join('；'))) : '提交要在自己的房間做。') + '</span>';
    else html += passedBlock(e);
    p.innerHTML = html;
    var sb = $('submitBtn'); if (sb) sb.onclick = doSubmit;
    var rb = $('reportBtn'); if (rb) rb.onclick = function () { showReport(e); };
  }
  function doSubmit() {
    var e = APP.evaluate(), gate = CORE.submitGate(e.state);
    if (!gate.ok) { renderCp(); return; }
    DB.saveSnapshot(cur().code, 5, RM.allEls().filter(function (x) { return !(x.customData && x.customData.base); }));
    player().submitted = true; player().submittedAt = Date.now(); save(); DB.appendEvent(cur().code, { kind: 'submit', env: me() });
    renderCp();
  }
  function passedBlock(e) {
    var code = CP.verifyCode(me(), new Date(player().submittedAt || Date.now()).toISOString().slice(0, 16), 'local');
    return '<div class="card" style="background:#b2f2bb;color:#1e1e1e"><div style="font-size:40px;font-weight:900;line-height:1.1">已通過</div><div style="font-size:13px">' + esc(cur().world.meta.name) + '　六個檢核點全部完成。截這一頁連同 PDF 報告交到 flipclass。</div>' +
      '<div style="font-size:13px;margin-top:6px">' + esc(APP.me.cls) + '　學號 ' + esc(me()) + '</div><div style="font-size:12px">驗證碼（本機版）：<b>' + code + '</b></div></div><button id="reportBtn">匯出訪談報告（PDF）</button>';
  }
  function showReport(e) {
    var w = cur().world, names = {}; Object.keys(w.personas).forEach(function (k) { names[k] = w.personas[k].name; });
    var d = player().discussion, room = DB.getRoom(cur().code), vr = e.state.discussion.room;
    var html = RP.html({ student: { id: me(), cls: APP.me.cls, name: '' }, caseName: w.meta.name, date: new Date().toISOString().slice(0, 10), passed: e.ev.passed, interviews: player().interviews,
      personaNames: names, markers: L.listMarkers(RM.markerEls()).filter(function (m) { return m.author === me(); }), conclusions: player().conclusions,
      discussion: { partnersText: (e.state.discussion.partners || []).map(function (x) { return x.id; }).join('、') + (vr ? '（房間 ' + vr + '）' : ''), diff: d.notes.diff, complement: d.notes.complement, outcome: d.notes.outcome } });
    RM.openModal('<div class="row"><b style="flex:1">訪談報告</b><button id="rpPrint">列印／另存 PDF</button><button class="ghost" id="rpClose">關閉</button></div><iframe id="rpFrame" style="width:100%;height:70vh;border:3px solid var(--ink);background:#fff;margin-top:8px"></iframe>');
    $('rpFrame').srcdoc = html;
    $('rpPrint').onclick = function () { try { $('rpFrame').contentWindow.focus(); $('rpFrame').contentWindow.print(); } catch (x) {} };
    $('rpClose').onclick = RM.closeModal;
  }
})();
