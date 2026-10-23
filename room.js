/* 房間裡的遊戲：整間急診室一次看完（不用捲動）、NPC 與玩家疊層、個人時鐘、小地圖、事件分鏡、環境音。
   側邊面板（線索、訪談、筆記卡、結論、討論、檢核點）在 panels.js。 */
(function () {
  'use strict';
  var APP = window.ERG_APP, DB = APP.DB, $ = APP.$, esc = APP.esc;
  var CORE = window.ERG_CORE, L = window.ERG_LOGIC, XL = window.ExcalidrawLib, R = window.React, RD = window.ReactDOM;
  var LAYOUT = window.ERG_LAYOUT, FP = window.ERG_FLOORPLAN, MM = window.ERG_MINIMAP, CH = window.ERG_CHARS, AV = window.ERG_AVATAR, CLK = window.ERG_CLOCK;
  var COMIC = window.ERG_COMIC, AMB = window.ERG_AMBIENCE, BGM = window.ERG_BGM, DEPTH = window.ERG_DEPTH, CP = window.ERG_CHECKPOINTS, CL = window.ERG_CHECKLIST;
  var VC = window.ERG_VIEW_CORE;   /* 決策邏輯（站位、路線、點人物／家具）在 view_core.js；這裡只管畫面與狀態 */

  /* 地圖的可視範圍：整間急診室（不含地圖外的家、回診、筆記本）；一次看完，不捲動 */
  var MAP = { x: 0, y: 0, w: 1700, h: 1150 };
  var REMOTE = { home: true, clinic: true, notebook: true };

  var S = window.ERG_ROOM = { cur: null };
  var cur = null;           /* 目前房間的執行狀態 */

  function simText(c) { return CLK.format(c); }
  function roomName(id) { var r = LAYOUT.room(id); return r ? r.name : id; }
  /* 10-13：提示訊息原本寫在左下角的事件字幕那一格，而那一格被底部「去過的房間」那條蓋住，等於沒顯示。改成浮在那條上方、置中的黃底框，4 秒後消失。 */
  function toast(msg) {
    var t = $('toastBox'), st = $('stage'), tb = $('travelBar');
    if (!t) { t = document.createElement('div'); t.id = 'toastBox'; t.setAttribute('role', 'status'); t.style.cssText = 'position:absolute;left:50%;transform:translateX(-50%);z-index:2147483200;max-width:min(560px,86%);background:var(--yellow);color:var(--ink-fixed);border:var(--bw) solid var(--ink-fixed);border-radius:var(--r-m);padding:6px 14px;font-size:var(--fs-3);font-weight:700;line-height:1.45;box-shadow:var(--sh) var(--sh) 0 var(--ink-fixed);pointer-events:none;text-align:center'; (st || document.body).appendChild(t); }
    t.style.bottom = ((tb ? tb.offsetHeight : 40) + 22) + 'px'; t.textContent = msg; t.style.display = 'block';
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.style.display = 'none'; }, 4000);
  }
  S.toast = toast;

  /* ───── 進入／離開 ───── */
  S.enter = function (code) {
    var sid = APP.me.sid, j = DB.joinRoom(code, sid);
    var room = DB.getRoom(code), shift = room.shift === 'night' ? 'night' : 'day', world = window.ERG_WORLD.makeWorld({ caseId: room.case || 'sms', seed: room.code, dow: room.dow, shift: shift });
    var player = CORE.getPlayer(room, sid);
    if (!player) {
      player = CORE.blankPlayer(APP.me.profile, 'entrance');
      player.visit = String(room.host) !== String(sid);
      player.clock = CLK.create({ speed: APP.me.profile.speed });
      player.worldSec = 0;
      CORE.savePlayer(DB, code, sid, player);
    }
    cur = S.cur = { code: code, room: room, role: j.role, world: world, player: player, api: null, root: null, canon: [], applying: false, lastHash: '',
      clock: CLK.create({ speed: player.speed || APP.me.profile.speed || '標準', worldSec: player.worldSec || 0, shift: shift }), tab: 'clue', selClue: null, selNpc: null,
      lastSave: 0, seenEv: {}, tickT: 0, tokens: {}, view: null, lastRoomForSound: null, amb: null, bgm: null, soundOn: APP.me.profile.sound !== false,
      musicOn: APP.me.profile.music === true,   /* 10-12 楊老師：背景音樂有點干擾 ⇒ 預設關，想聽的人自己按 🎵 開 */
      stageMode: 'room' };
    APP.show('game');
    $('roomLabel').textContent = '房間 ' + code + '・' + world.day.short + '・' + (shift === 'night' ? '夜班' : '日班') + '・' + world.meta.name;
    if (window.ERG_CASE_TONE) window.ERG_CASE_TONE.apply(document, world.meta.id);   /* 10-19 案例色調：進房間依案例套色票（case_tone.js，桌機與手機共用） */
    buildTabs(); if(window.ERG_ROTATION_UI)window.ERG_ROTATION_UI.bind(S); buildSpeed(); buildDots();
    mountBoard();
    buildTravelControls(); refreshStageMode(); bindMusic();
    if (window.ERG_PANELS) window.ERG_PANELS.renderAll();
    cur.timer = setInterval(frame, 250);
    cur.wstep = setInterval(function () { if (cur) renderOverlay(); }, 100);
    (function raf() { if (!cur) return; placeTokens(); cur.raf = requestAnimationFrame(raf); })();
    cur.slow = setInterval(slowTick, 1500);
    DB.appendEvent(code, { kind: 'join', env: sid });
    setLoc(player.loc || 'entrance', true);
    player.visited = player.visited || [player.loc || 'entrance'];player.roomsSeen=player.roomsSeen||{};(player.visited||[]).forEach(function(id){player.roomsSeen[id]=true;});   /* roomsSeen：去過的每一間（visited 只留最近 8 間） */
    buildTravelControls();
    updateSoundBtn();
  };
  S.leave = function (silent) {
    if (!cur) return;
    persist(true);
    clearInterval(cur.timer); clearInterval(cur.slow); clearInterval(cur.wstep); if (cur.raf) cancelAnimationFrame(cur.raf);
    if (cur.resizeObserver) cur.resizeObserver.disconnect(); window.removeEventListener('resize', onResize);
    if (cur.amb) { try { cur.amb.stop(); } catch (e) {} }
    if (cur.bgm) { try { cur.bgm.stop(); } catch (e) {} }
    if (cur.root) { try { cur.root.unmount(); } catch (e) {} }
    $('board').innerHTML = ''; $('overlay').innerHTML = '';
    cur = S.cur = null;
    if (!silent) APP.enterLobby();
  };
  $('leaveBtn').onclick = function () { S.leave(false); };

  function persist(force) {
    if (!cur) return;
    if (window.ERG_KICKED) return;      /* 這個帳號已在別處登入：這裡不再存檔 */
    /* 10-13：時鐘每走一格就會叫到這裡。線上模式原本每 4 秒把整份玩家紀錄寫回去；現在定時的只寫時鐘兩個小欄位、60 秒一次。有動作（force）才寫整份。 */
    var now = Date.now(), gap = APP.online ? 60000 : 4000; if (!force && now - cur.lastSave < gap) return; cur.lastSave = now;
    var p = cur.player; p.worldSec = cur.clock.worldSec; p.speed = cur.clock.speed === '自訂' ? '標準' : cur.clock.speed;
    if (!force && APP.online && DB.patchPlayerFields) { try { if (DB.patchPlayerFields(cur.code, APP.me.sid, { worldSec: p.worldSec, speed: p.speed })) return; } catch (e) { return; } }
    CORE.savePlayer(DB, cur.code, APP.me.sid, p);
  }
  S.persist = persist;

  /* ───── 頂端列 ───── */
  function buildTabs() {
    var tabs = [['clue', '線索'], ['intv', '訪談'], ['cards', '筆記卡'], ['events', '事件簿'], ['concl', '結論'], ['disc', '討論'], ['cp', '檢核點'], ['ach', '成就']];
    $('tabs').innerHTML = tabs.map(function (t) { return '<button data-t="' + t[0] + '" class="' + (t[0] === cur.tab ? 'on' : '') + '">' + t[1] + '</button>'; }).join('');
    Array.prototype.forEach.call($('tabs').children, function (b) { b.onclick = function () { S.switchTab(b.dataset.t); }; });
  }
  S.switchTab = function (t) {
    if (!cur) return; cur.tab = t; if (S.openSide) S.openSide();
    Array.prototype.forEach.call($('tabs').children, function (b) { b.classList.toggle('on', b.dataset.t === t); });
    ['clue', 'intv', 'cards', 'events', 'concl', 'disc', 'cp', 'ach'].forEach(function (n) { $('p-' + n).classList.toggle('on', n === t); });
    if (window.ERG_PANELS) window.ERG_PANELS.render(t);
  };
  function buildSpeed() {
    var keys = ['慢', '標準', '快', '暫停'];
    $('speedSeg').innerHTML = keys.map(function (k) { return '<button data-s="' + k + '">' + k + '</button>'; }).join('');
    Array.prototype.forEach.call($('speedSeg').children, function (b) {
      b.onclick = function () {
        var k = b.dataset.s;
        if (k === '暫停') cur.clock = CLK.setPaused(cur.clock, !cur.clock.paused);
        else { cur.clock = CLK.setPaused(CLK.setSpeed(cur.clock, k), false); APP.me.profile.speed = k; CORE.saveProfile(APP.storage, APP.me.sid, APP.me.profile); }
        updateSpeedUi(); persist(true);
      };
    });
    updateSpeedUi();
  }
  function updateSpeedUi() {
    Array.prototype.forEach.call($('speedSeg').children, function (b) {
      var k = b.dataset.s; b.classList.toggle('on', k === '暫停' ? !!cur.clock.paused : (!cur.clock.paused && cur.clock.speed === k));
    });
  }
  function buildDots() { $('ckDots').innerHTML = '<i></i><i></i><i></i><i></i><i></i><i></i>'; }
  S.refreshDots = function () {
    var e = APP.evaluate(); if (!e) return; cur.ev = e;
    Array.prototype.forEach.call($('ckDots').children, function (d, i) { d.classList.toggle('lit', !!e.ev.list[i] && e.ev.list[i].ok); d.title = e.ev.list[i] ? e.ev.list[i].label + '：' + e.ev.list[i].detail : ''; });
    var prev = cur.litPrev === undefined ? e.ev.lit : cur.litPrev;
    if (e.ev.lit > prev) {
      var un = AV.newlyUnlocked(prev, e.ev.lit);
      toast('檢核點 ' + e.ev.lit + ' / 6' + (un.length ? '　解鎖外觀：' + un.map(function (u) { return u.label; }).join('、') : ''));
      var a = $('ckDots'); a.animate && a.animate([{ transform: 'scale(1.5)' }, { transform: 'scale(1)' }], { duration: 400 });
    }
    cur.litPrev = e.ev.lit;
    if (window.ERG_PANELS && cur.tab === 'cp') window.ERG_PANELS.render('cp');
  };
  data_listen();
  function data_listen() {
    APP.data.listeners.push(function (topic) {
      if (!cur) return;
      if (topic === 'scene:' + cur.code) pullRemoteScene();
      if (topic === 'room:' + cur.code) { cur.room = DB.getRoom(cur.code); var p = CORE.getPlayer(cur.room, APP.me.sid); if (p) { cur.player.confirms = p.confirms || cur.player.confirms; } S.refreshDots(); if (window.ERG_PANELS) window.ERG_PANELS.onRoomChanged(); }
    });
  }

  /* ───── 看板（Excalidraw）───── */
  function layoutWithClues() {
    var clues = cur.world.clues;
    return Object.assign({}, LAYOUT, { PINS: clues.map(function (c) { return { clue: c.id, room: c.pin.room, rx: c.pin.rx, ry: c.pin.ry }; }) });
  }
  function buildCanon() {
    var sk = FP.buildFloorplanSkeleton(layoutWithClues(), cur.world.clues);
    sk = sk.filter(function (e) { return !(e.customData && e.customData.route); });   /* 路線虛線在新的平面圖上會橫跨房間，不畫 */
    var els = XL.convertToExcalidrawElements(sk);
    return els.map(function (e) { var c = Object.assign({}, e); c.locked = true; c.customData = Object.assign({}, e.customData, { base: true }); return c; });
  }
  function mountBoard() {
    cur.canon = buildCanon();
    var cards = DB.getScene(cur.code) || [];
    var elements = cur.canon.concat(cards);
    cur.lastHash = L.hashElements(elements);
    var host = document.createElement('div'); host.style.cssText = 'position:absolute;inset:0'; $('board').innerHTML = ''; $('board').appendChild(host);
    var props = {
      excalidrawAPI: function (api) { cur.api = api; setTimeout(function () { fitView(true); }, 200); },
      initialData: { elements: elements, appState: { viewBackgroundColor: '#fffdf5', currentItemFontFamily: 2, zenModeEnabled: false, gridSize: null }, scrollToContent: false },
      onChange: onBoardChange, viewModeEnabled: true, langCode: 'zh-TW',
      onPointerDown: function (tool, st) { onBoardPointer(st); },
      UIOptions: { canvasActions: { loadScene: false, saveToActiveFile: false, export: false, saveAsImage: false, toggleTheme: false, clearCanvas: false, changeViewBackgroundColor: false } }
    };
    cur.root = RD.createRoot(host); cur.root.render(R.createElement(XL.Excalidraw, props));
    /* Excalidraw 在檢視模式下不一定會回呼 onPointerDown，所以自己聽畫布的點擊：按下與放開距離小於 6px 才算「點」（拖曳是平移） */
    host.addEventListener('pointerdown', function (e) { host._pd = { x: e.clientX, y: e.clientY, t: Date.now() }; }, true);
    host.addEventListener('pointerup', function (e) {
      var d = host._pd; host._pd = null; if (!d || !cur || !cur.api || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6 || Date.now() - d.t > 600) return;
      var st = cur.api.getAppState(), z = st.zoom.value, rect = host.getBoundingClientRect();
      onBoardPointer({ origin: { x: (e.clientX - rect.left) / z - st.scrollX, y: (e.clientY - rect.top) / z - st.scrollY }, _own: true });
    }, true);
    window.addEventListener('resize', onResize);
    if (window.ResizeObserver) { cur.resizeObserver = new ResizeObserver(function(){ if(cur){fitView(true);cur._placeKey='';placeTokens();} }); cur.resizeObserver.observe($('board')); }
  }
  function onResize() { if (cur && cur.api) { fitView(true); cur._placeKey=''; placeTokens(); } }
  /* 把整間急診室（或指定區域）塞進看板，不留捲動 */
  function viewFor(rect) {
    /* 上方有房間現況條（約 34px）、下方有移動列（約 52px）蓋在畫布上：鏡頭只用中間那一段來置中與縮放，房間才不會被蓋住（10-12） */
    var W = $('board').clientWidth || 900, H = $('board').clientHeight || 600, pad = 16, top = 41, bot = ($('travelBar') ? $('travelBar').offsetHeight + 21 : 61);   /* 對齊 #stageFrame（上 38、下 移動列+18，各加框線 3） */
    if (H - top - bot < 160) { top = 0; bot = 0; }
    var z = Math.min((W - pad * 2) / rect.w, (H - top - bot - pad * 2) / rect.h);
    return { zoom: z, scrollX: (W / 2) / z - (rect.x + rect.w / 2), scrollY: (top + (H - top - bot) / 2) / z - (rect.y + rect.h / 2), W: W, H: H };
  }
  function fitView(force) {
    if (!cur || !cur.api) return;
    var rect = cur.focus || (cur.stageMode === 'map' ? MAP : stageRect()), v = viewFor(rect); cur.view = v;
    cur.api.updateScene({ appState: { scrollX: v.scrollX, scrollY: v.scrollY, zoom: { value: v.zoom } } });
  }
  S.fit = fitView;
  S.focusRect = function (rect) { cur.focus = rect; fitView(true); };
  S.focusAll = function () { cur.focus = null; fitView(true); }; S.setWatchRoom=function(id){if(!LAYOUT.room(id)||LAYOUT.room(id).type!=='room')return;cur.watchRoom=id;if(window.ERG_PANELS&&window.ERG_PANELS.onWatch)window.ERG_PANELS.onWatch(id);var scene=document.getElementById(cur.mobile?'sceneBox':'stage');if(scene){scene.style.transition='opacity .18s';scene.style.opacity='.55';setTimeout(function(){scene.style.opacity='1';},30);}if(cur.mobile){renderScene();renderTokens();}else{S.focusRect(LAYOUT.room(id));renderOverlay();}};
  function stageRect() {
    var r = LAYOUT.room(cur.watchRoom || cur.player.loc);
    if (!r || r.type === 'hall' || r.type === 'outside') { var p = cur.me || { x: 850, y: 500 }; return { x: p.x - 280, y: p.y - 190, w: 560, h: 380 }; }
    var pad = 8; return { x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 };   /* 10-12：32→12，貼著外牆裁，不露出隔壁房間的碎片（楊老師：邊緣很突兀） */
  }
  /* 畫布上的房間大標題（rtitle-*）：全地圖才顯示。restoreBase 只比對位置、大小、文字與鎖定，改透明度不會被還原；底圖元素也不存進資料庫。 */
  function syncRoomTitles() {
    if (!cur || !cur.api) return;
    var want = 0, changed = false, found = 0;   /* 10-18 UI 方案 7：房名改用 DOM 標籤（固定字級，syncMapLabels），畫布上的標題一律不顯示 */
    var out = allEls().map(function (e) {
      var cd = e.customData || {}; if (!(cd.title || (e.type === 'text' && cd.furniture))) return e;   /* 房間大標題＋家具名稱（id 會被 Excalidraw 重新產生，要用 customData 認） */
      found += 1; if (e.opacity === want) return e;
      changed = true; return Object.assign({}, e, { opacity: want, version: (e.version || 1) + 1, versionNonce: Math.floor(Math.random() * 2147483647) });
    });
    if (!changed) return found > 0;   /* 畫布元素還沒載入時回 false，下一輪再試 */
    cur.applying = true; cur.lastHash = L.hashElements(out); cur.api.updateScene({ elements: out });
    setTimeout(function () { if (cur) cur.applying = false; }, 0);
    return true;
  }
  function refreshStageMode() {
    var btn = $('stageModeBtn'); if (btn) { btn.textContent = cur.stageMode === 'map' ? '房間' : '全地圖'; btn.classList.toggle('on', cur.stageMode === 'map'); }
    fitView(true); syncRoomTitles(); cur._titleMode = cur.stageMode; renderOverlay();
  }

  function allEls() { return cur.api ? cur.api.getSceneElementsIncludingDeleted() : []; }
  function nonBase(els) { return els.filter(function (e) { return !(e.customData && e.customData.base); }); }
  function onBoardChange(elements, appState) {
    if (!cur || !cur.api) return;
    cur.appState = appState;
    selectionWatch(elements, appState);
    if (cur.role !== 'member' || cur.applying) return;
    var els = allEls(), h = L.hashElements(els);
    if (h === cur.lastHash) return;
    var res = L.restoreBase(els, cur.canon, Math.random);
    if (res.changed) {
      cur.applying = true; cur.lastHash = L.hashElements(res.elements); cur.api.updateScene({ elements: res.elements });
      setTimeout(function () { cur.applying = false; }, 0);
      DB.putScene(cur.code, L.mergeElements(nonBase(res.elements), DB.getScene(cur.code)));
      return;
    }
    cur.lastHash = h;
    DB.putScene(cur.code, L.mergeElements(nonBase(els), DB.getScene(cur.code)));
    S.refreshDots();
  }
  function pullRemoteScene() {
    if (!cur || !cur.api) return;
    var merged = L.mergeElements(allEls(), DB.getScene(cur.code)), h = L.hashElements(merged);
    if (h === L.hashElements(allEls())) return;
    cur.applying = true; cur.lastHash = h; cur.api.updateScene({ elements: merged });
    setTimeout(function () { cur.applying = false; if (window.ERG_PANELS) window.ERG_PANELS.onSceneChanged(); S.refreshDots(); }, 0);
  }
  S.api = function () { return cur && cur.api; };
  S.addElements = function (skeleton) {
    var els = XL.convertToExcalidrawElements(skeleton);
    cur.api.updateScene({ elements: allEls().concat(els) });
  };
  S.allEls = allEls;
  S.markerEls = function () { return allEls().concat(CORE.mcardEls(DB.getRoom(cur.code))); };

  /* 點到線索牌：只有在同一個房間才讀得到 */
  function selectionWatch(elements, appState) {
    var ids = Object.keys(appState.selectedElementIds || {}).filter(function (k) { return appState.selectedElementIds[k]; });
    var byId = {}; elements.forEach(function (e) { byId[e.id] = e; });
    var found = null;
    ids.forEach(function (id) { var e = byId[id]; if (!e) return; if (e.containerId && byId[e.containerId]) e = byId[e.containerId]; if (e.customData && e.customData.clueId) found = e.customData.clueId; });
    if (found && found !== cur.selClue) { cur.selClue = found; S.switchTab('clue'); if (cur.role === 'member') DB.appendEvent(cur.code, { kind: 'clue-open', env: APP.me.sid, clue: found }); }
  }
  /* 點房間（地板）就走過去 */
  function onBoardPointer(st) {
    if (!cur || !st || !st.origin) return;
    if (!st._own) { if (cur._ownPtrT && Date.now() - cur._ownPtrT < 400) return; } else cur._ownPtrT = Date.now();   /* 自己聽的與 Excalidraw 回呼的只處理一次 */
    var ox = st.origin.x, oy = st.origin.y; S._lastPointer = { x: ox, y: oy };   /* 測試用 */
    var hit = VC.clueAt(cur.world, LAYOUT, ox, oy);
    if (hit) { hidePop(); cur.selClue = hit.id; S.switchTab('clue'); if (cur.role === 'member') DB.appendEvent(cur.code, { kind: 'clue-open', env: APP.me.sid, clue: hit.id }); return; }
    /* 點到自己這間房的家具／物件：彈小卡；點別間房：全地圖模式＝直接到，房間模式＝走過去（判斷在 VC.boardClick） */
    var act = VC.boardClick(LAYOUT, cur.player.loc, cur.stageMode, ox, oy);
    if (act.kind === 'furniture') { setTimeout(function () { onFurnitureClick(act.furniture, act.x, act.y); }, 0); return; }
    hidePop();
    if (act.kind === 'jump' || act.kind === 'travel') { setTimeout(function () { if (cur.stageMode === 'map') jumpTo(act.room); else startTravel(act.room); }, 0); }
  }

  /* ───── 位置與移動 ───── */
  function spotIn(roomId) { return VC.spotIn(LAYOUT, cur && cur.world, roomId); }   /* 選站位的邏輯在 view_core.js */
  function setLoc(roomId, silent) {
    if (!cur) return;
    var rm = LAYOUT.room(roomId); if (!rm) return;
    cur.player.loc = roomId; cur.watchRoom=roomId; cur.me = spotIn(roomId); cur.meMoving = 8; hidePop();
    rememberRoom(roomId); renderTravelChips();
    $('locLabel').textContent = '你在：' + rm.name;
    $('mmHere').textContent = rm.name;
    var cap = cur.world.captionFor(roomId); $('caption').textContent = cap || rm.name;
    cur._capText = cap || ''; cur._capUntil = Date.now() + 8000; cur._locT = Date.now();   /* 旁白頭 8 秒顯示在頂端那一條；「你」標籤 6 秒後淡出 */
    if (!silent) DB.appendEvent(cur.code, { kind: 'move', env: APP.me.sid, to: roomId });
    soundForRoom(roomId);
    persist(true);
    renderMinimap();
    if (window.ERG_PANELS) window.ERG_PANELS.onMove();
  }
  function startTravel(roomId) {
    if (!cur) return false;
    var target = LAYOUT.room(roomId); if (!target) return false;
    if (target.type === 'remote') { if (roomId === 'home' || roomId === 'clinic') { goRemote(roomId); return true; } return false; }
    if (cur.walk) cur.walk = null; clearTimeout(cur._jumpT);   /* 走路與傳送互斥：按了走路就取消還沒執行的傳送 */
    var plan = VC.planTravel(cur.world, LAYOUT, { shortestPath: window.ERG_NPC.shortestPath }, { loc: cur.player.loc, me: cur.me }, roomId, VC.walkSpeed(cur.world, cur.clock));
    if (!plan.ok) { toast('找不到可走的路線，請從附近房間前往。'); return false; }
    cur.walk = plan.walk;
    $('locLabel').textContent = '前往：' + target.name + '（約 ' + plan.seconds + ' 秒）';
    return true;
  }
  function advanceWalk(realDt) {
    if (!cur.walk || cur.clock.paused || !realDt) return;
    var w=cur.walk, step=VC.stepWalk(LAYOUT, cur.me, w.points, w.index, VC.walkSpeed(cur.world, cur.clock)*realDt);
    cur.me=step.me; w.index=step.index;
    var roomId=step.roomId;
    if(roomId && roomId!==cur.player.loc){cur.player.loc=roomId;cur.watchRoom=roomId; $('locLabel').textContent='你在：'+roomName(roomId); $('mmHere').textContent=roomName(roomId); soundForRoom(roomId); if(cur.stageMode==='room') fitView(true); if(window.ERG_PANELS)window.ERG_PANELS.onMove();}
    cur._dirty=true;
    if(cur.walk && cur.stageMode==='room'){cur.focus={x:cur.me.x-280,y:cur.me.y-190,w:560,h:380};fitView(true);}
    if(step.done){var target=w.target;cur.walk=null;cur.stageMode='room';cur.focus=null;setLoc(target,true);refreshStageMode();DB.appendEvent(cur.code,{kind:'move',env:APP.me.sid,to:target});persist(true);}
  }
  function rememberRoom(id){var v=cur.player.visited||[];cur.player.visited=[id].concat(v.filter(function(x){return x!==id;})).slice(0,8);(cur.player.roomsSeen=cur.player.roomsSeen||{})[id]=true;}
  function buildTravelControls(){
    var stage=$('stage'), bar=document.getElementById('travelBar');
    if(!bar){bar=document.createElement('div');bar.id='travelBar';stage.appendChild(bar);}
    if(!document.getElementById('boardMask')){var mask=document.createElement('div');mask.id='boardMask';stage.appendChild(mask);}
    if(!document.getElementById('stageFrame')){var fr=document.createElement('div');fr.id='stageFrame';stage.appendChild(fr);}   /* 10-12：固定外框，每間房看起來都在同一個大小的框裡 */
    bar.innerHTML='<button class="ghost" id="stageModeBtn">全地圖</button><span id="visitedChips"></span>';
    $('stageModeBtn').onclick=function(){cur.stageMode=cur.stageMode==='map'?'room':'map';refreshStageMode();};
    renderTravelChips();
  }
  /* 10-13：病患的家、回診門診不在急診室地圖上，原本沒有任何入口（學生回報「回診跟病患家過不去」）。這兩間用按鈕直接過去。 */
  function goRemote(id){if(!cur)return;var rm=LAYOUT.room(id);if(!rm)return;cur.walk=null;clearTimeout(cur._jumpT);cur.stageMode='room';cur.focus=null;setLoc(id,true);refreshStageMode();DB.appendEvent(cur.code,{kind:'move',env:APP.me.sid,to:id});persist(true);toast(id==='home'?'搭公車到了病患的家。這裡有他手機收到的簡訊，家人也在。':'隔天，到了回診門診。');}
  function renderTravelChips(){var host=$('visitedChips');if(!host||!cur)return;host.innerHTML='<b>院外：</b><button class="ghost" data-remote="home">🚌 病患的家</button><button class="ghost" data-remote="clinic">🏥 回診門診</button>'+' <b>去過的房間：</b>'+((cur.player.visited||[]).map(function(id){var r=LAYOUT.room(id);return r?'<button class="ghost" data-visit="'+esc(id)+'">'+esc(r.name)+'</button>':'';}).join('')||'尚無');Array.prototype.forEach.call(host.querySelectorAll('[data-visit]'),function(b){b.onclick=function(){startTravel(b.dataset.visit);};});Array.prototype.forEach.call(host.querySelectorAll('[data-remote]'),function(b){b.onclick=function(){goRemote(b.dataset.remote);};});}
  S.travel = startTravel;
  /* 10-18 D3：點地圖上的房間＝直接傳送（快速旅行）。短暫淡出淡入＋「到了○○」；底部移動列與推薦鈕仍是走路（startTravel）。
     人在院外（病患的家、回診門診）時，點院內房間一樣直接到。 */
  function jumpTo(roomId) {
    if (!cur) return false;
    var jp = VC.planJump(LAYOUT, cur.player.loc, !!cur.walk, roomId), rm = LAYOUT.room(roomId);
    if (jp.kind === 'remote') { goRemote(roomId); return true; }
    if (jp.kind === 'same') { toast('你已經在' + rm.name + '了'); return true; }
    if (jp.kind !== 'go') return false;
    cur.walk = null; cur.stageMode = 'room'; cur.focus = null;
    var st = $('stage'), v = $('teleVeil'); if (!v && st) { v = document.createElement('div'); v.id = 'teleVeil'; st.appendChild(v); }
    var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion:reduce)').matches);
    function go() { if (!cur) return; cur.walk = null; setLoc(roomId); refreshStageMode(); toast('到了' + rm.name); }
    if (v && !reduce) { v.classList.remove('go'); void v.offsetWidth; v.classList.add('go'); cur._jumpT = setTimeout(go, 140); } else go();
    return true;
  }
  S.jump = jumpTo;
  S.teleport = function(id){if(!cur)return;cur.walk=null;clearTimeout(cur._jumpT);setLoc(id);rememberRoom(id);renderTravelChips();refreshStageMode();};   /* 測試用；跟真的走到一樣要重新對準鏡頭 */

  /* ───── 環境音 ───── */
  function soundForRoom(roomId) {
    musicForRoom(roomId);
    if (!AMB || !cur.soundOn) return;
    try {
      if (!cur.amb) cur.amb = AMB.createPlayer(window.AudioContext || window.webkitAudioContext, { volume: 0.5, seed: 11 });
      cur.amb.setEnabled(true); cur.amb.enter(roomId);
    } catch (e) {}
  }
  function updateSoundBtn() { $('soundBtn').textContent = cur.soundOn ? '🔊' : '🔇'; $('soundBtn').title = cur.soundOn ? '環境音：開' : '環境音：關'; }
  $('soundBtn').onclick = function () {
    if (!cur) return; cur.soundOn = !cur.soundOn; APP.me.profile.sound = cur.soundOn; CORE.saveProfile(APP.storage, APP.me.sid, APP.me.profile);
    if (!cur.soundOn && cur.amb) cur.amb.setEnabled(false); else soundForRoom(cur.player.loc);
    updateSoundBtn();
  };
  function musicForRoom(roomId){if(!BGM||!cur.musicOn)return;try{if(!cur.bgm)cur.bgm=BGM.createPlayer(window.AudioContext||window.webkitAudioContext,{volume:.05,seed:42});cur.bgm.setEnabled(true);cur.bgm.enter(roomId);}catch(e){}}
  function updateMusicBtn(){var b=$('musicBtn');if(b){b.textContent=cur.musicOn?'🎵':'🎵̸';b.title=cur.musicOn?'音樂：開':'音樂：關';}}
  function bindMusic(){var b=$('musicBtn');if(!b)return;b.onclick=function(){if(!cur)return;cur.musicOn=!cur.musicOn;APP.me.profile.music=cur.musicOn;CORE.saveProfile(APP.storage,APP.me.sid,APP.me.profile);if(cur.bgm)cur.bgm.setEnabled(cur.musicOn);else if(cur.musicOn)musicForRoom(cur.player.loc);updateMusicBtn();};updateMusicBtn();}

  /* ───── 時鐘與畫面更新 ───── */
  function clockActive() { return !document.hidden && cur.tab !== 'concl' && cur.tab !== 'disc' && cur.tab !== 'cp' && !cur.modalOpen && !(cur.tab === 'intv' && cur.intvHold); }   /* 10-13：在訪談分頁選了現場的人＝正在訪談，時間先暫停 */
  /* 10-20：結論、討論、檢核分頁（和暫停鍵）會讓急診室時間停住，但畫面上看不出來，學生以為壞了（二乙回報「時間不會動，要找的人不會出現」）。
     時鐘旁邊顯示 ⏸ 和原因，第一次停住時再提示一次。 */
  function pauseReason() {
    if (!cur || document.hidden) return '';
    if (cur.clock.paused) return '時間已暫停（你按了「暫停」）。按上方的速度鈕就會繼續。';
    if (cur.tab === 'concl' || cur.tab === 'disc' || cur.tab === 'cp') return '你在「' + ({ concl: '結論', disc: '討論', cp: '檢核' })[cur.tab] + '」分頁，急診室的時間先暫停。切到線索、訪談或筆記就會繼續。';
    if (cur.modalOpen) return '開著視窗的時候，急診室的時間先暫停；關掉視窗就會繼續。';
    return '';
  }
  function pauseMark() {
    var c = $('clock'); if (!c) return; var el = $('clockPause'), why = pauseReason();
    if (!el) { el = document.createElement('span'); el.id = 'clockPause'; el.style.cssText = 'font-size:var(--fs-3);margin-left:4px;cursor:help'; el.textContent = '⏸'; c.parentNode.insertBefore(el, c.nextSibling); }
    el.style.display = why ? '' : 'none'; el.title = why;
    if (why && !cur.pauseTold) { cur.pauseTold = true; if (!cur.modalOpen) toast(why); } if (!why) cur.pauseTold = false;
  }
  function frame() {
    if (!cur) return;
    var now = Date.now(), dt = cur.tickT ? (now - cur.tickT) / 1000 : 0; cur.tickT = now;
    if (clockActive()) cur.clock = CLK.tick(cur.clock, Math.min(dt, 1));
    advanceWalk(Math.min(dt,1));
    pauseMark(); $('clock').textContent = simText(cur.clock); (function(){var D=window.ERG_DAYLIGHT,c=$('clock'),el=$('dayIcon');if(!D||!D.icon||!c)return;if(!el){el=document.createElement('span');el.id='dayIcon';el.style.cssText='font-size:var(--fs-4);line-height:1';c.parentNode.insertBefore(el,c);}var ic=D.icon(S.simMin());if(el.textContent!==ic){el.textContent=ic;el.setAttribute('aria-label',ic==='🌙'?'現在是晚上':'現在是白天');el.title=ic==='🌙'?'現在是晚上':'現在是白天';}})();
    if (CLK.isDayOver(cur.clock) && !cur.dayOverShown) { cur.dayOverShown = true; toast('本班急診時段結束（07:00）。去寫結論吧。'); }
    persist(false);
    eventWatch(); if (window.ERG_EVENT_UI) window.ERG_EVENT_UI.tick(cur,S); if(window.ERG_ROTATION_UI)window.ERG_ROTATION_UI.tick(S);
  }
  function slowTick() { if (!cur) return; renderMinimap(); refreshTicker(); S.refreshDots(); }

  function screenPos(x, y) {
    if (S.screenOverride) { var ov3 = S.screenOverride(x, y); if (ov3) return ov3; }   /* 3D 視圖（view3d.js，?view=3d）接管時，彈窗位置改用 3D 投影；平常是 undefined，行為不變 */
    var st = (cur.api && cur.api.getAppState && cur.api.getAppState()) || cur.appState, z = st ? st.zoom.value : (cur.view ? cur.view.zoom : 1), sx = st ? st.scrollX : 0, sy = st ? st.scrollY : 0;
    return { x: (x + sx) * z, y: (y + sy) * z, z: z };
  }
  var svgCache = {};
  function svgFor(look, key, mood) {
    var k = key + '|' + mood; if (svgCache[k]) return svgCache[k];
    svgCache[k] = CH.character(look, { seed: CH.hash ? CH.hash(key) % 97 : 3, mood: mood, size: 1 }); return svgCache[k];
  }
  function lookKey(look) { return JSON.stringify(look); }
  function renderOverlay() {
    if (!cur.api) return;
    var t = cur.clock.worldSec, simMin = S.simMin(), list = cur.world.at(t), ov = $('overlay'), seen = {};
    drawEnvironment(simMin);
    var z = liveZoom(), size = Math.max(40, Math.min(100, 112 * z));
    var inRoom = cur.watchRoom || cur.player.loc;
    var vis = window.ERG_DENSITY.pick(list.filter(function (q) { return q.pos.x !== undefined; }).map(function (q) { return { id: q.ent.id, kind: q.ent.kind, room: q.pos.room, main: !!(q.ent.patient && q.ent.patient.main) }; }), { myRoom: inRoom, t: t, budget: 8, inRoomMax: 8 });
    cur.vis = vis;
    list.forEach(function (it) {
      var ent = it.ent, pos = it.pos; if (pos.x === undefined) return;
      if ((!vis[ent.id] && !cur.tokens[ent.id]) || (cur.stageMode !== 'map' && pos.room !== inRoom)) return;
      var id = ent.id, here = pos.room === inRoom;
      var el = cur.tokens[id];
      if (!el) { el = cur.tokens[id] = document.createElement('div'); el.className = 'tok'; ov.appendChild(el); el._eid = id; el.onclick = function (e) { onNpcClick(cyclePick(e, pickTokenAt(e, id))); }; }
      seen[id] = true;
      var av = cur.world.availability(ent, pos, simMin), moving = pos.state === 'move';
      var fatigue = av.fatigue || { level: 0 }, mood = fatigue.level >= 2 ? 'sleepy' : (av.level === 'blocked' ? 'busy' : (moving ? 'idle' : (ent.kind === 'incident' ? 'angry' : 'idle')));
      var speed = window.ERG_FATIGUE ? window.ERG_FATIGUE.animSpeed(fatigue.level) : 1;
      var sig = lookKey(ent.look) + mood + size;
      if (el._sig !== sig) { el._sig = sig; el.innerHTML = '<div class="bodyClip">' + svgFor(ent.look, ent.id, mood) + '</div><div class="bubWrap"></div><span class="nm"></span>';   /* 10-18：遮擋只套在 .bodyClip（身體），名牌與泡泡不被切、畫在身體之上 */ el.querySelector('svg').style.height = size + 'px'; el.querySelector('svg').style.width = 'auto'; }
      el._tx = pos.x; el._ty = pos.y; el._room = pos.room;
      el.className = 'tok ' + (moving ? 'walk' : 'idle'); el.style.setProperty('--anim-speed', speed + 's'); el.style.zIndex = String(DEPTH ? DEPTH.z(el._wy !== undefined ? el._wy : pos.y, DEPTH.tie(id)) : Math.round(pos.y));   /* 先用模擬位置；placeTokens 每幀會改成畫面上實際位置（推開、平滑之後）的層級 */
      el.style.setProperty('--walk-duration', (0.5 / speed) + 's'); el.style.setProperty('--idle-duration', (2.4 / speed) + 's');
      el.classList.toggle('off', !vis[ent.id]); el.style.opacity = !vis[ent.id] ? '0' : (here || inRoom === null ? '1' : '.7'); el.style.pointerEvents = vis[ent.id] ? 'auto' : 'none';
      var focused=cur.selNpc===id||el.matches(':hover')||ent.kind==='patient';var nm = el.querySelector('.nm');   /* 10-13 楊老師：病患都加註名字 ⇒ 病患的名牌一直顯示，其他人照舊（選到或滑鼠移上去才有） */
       nm.textContent = here ? ent.name : ''; nm.style.display = here&&focused ? 'inline-block' : 'none'; nm.className = 'nm ' + (ent.kind === 'bot' ? '' : av.level);
      var bw = el.querySelector('.bubWrap'), m = here ? cur.world.mutterFor(ent, pos, t) : null;
      bw.innerHTML = (pos.act && focused ? '<div class="act">' + esc(pos.act) + '</div>' : '') + (m&&focused ?   /* 10-12：「正在做什麼」只在滑到或選到這個人時顯示，平常不壓在物件上；現況條有同樣的資訊 */
         '<div class="bub ' + (m.kind === 'shout' ? 'shout' : (m.kind === 'thought' ? 'thought' : '')) + '">' + esc(m.text) + '</div>' : '');
    });
    Object.keys(cur.tokens).forEach(function (id) { if (!seen[id] && id !== 'me') { cur.tokens[id].remove(); delete cur.tokens[id]; } });
    cur._dirty = true;
    /* 玩家自己 */
    if (!cur.me) cur.me = spotIn(cur.player.loc || 'entrance') || { x: 850, y: 500 };   /* 10-23：重新整理後位置還沒還原就先畫（10-22 回報「人物消失、畫面全白」的 reading 'x'） */
    var me = cur.tokens.me;
    if (!me) { me = cur.tokens.me = document.createElement('div'); me.className = 'tok me'; ov.appendChild(me); }
    var look = AV.toCharLook(APP.me.profile.avatar.look), msig = lookKey(look) + size;
    if (me._sig !== msig) { me._sig = msig; me.innerHTML = '<div class="bodyClip">' + svgFor(look, 'me:' + APP.me.sid, 'idle') + '</div>'; me.querySelector('svg').style.height = size + 'px'; me.querySelector('svg').style.width = 'auto'; }
    var tag=cur.youTag;if(!tag){tag=cur.youTag=document.createElement('div');tag.className='youTagLayer';tag.textContent='你';ov.appendChild(tag);}tag.style.left=((cur.me.x+(cur.api.getAppState().scrollX))*liveZoom())+'px';tag.style.top=((cur.me.y+cur.api.getAppState().scrollY)*liveZoom()-size-30)+'px';tag.style.zIndex='2147483647';tag.style.opacity=(cur.walk||Date.now()-(cur._locT||0)<6000)?'1':'0';
    me._tx = cur.me.x; me._ty = cur.me.y; me._room = cur.player.loc; me._fixed = true; me.style.zIndex = String(DEPTH ? DEPTH.z(cur.me.y, DEPTH.tie('me')) : Math.round(cur.me.y));
    syncRoomTitles();   /* 每次重繪都檢查：底圖被還原或場景重新載入後，畫布上的名稱會回來，只藏一次不夠（入口大廳出現重複的字就是這樣） */
    syncRoomProps();
    syncPinHits();
    syncFurnLabels(); syncMapLabels();
    spreadTokens();
    me.className = 'tok me idle';
  }
  function drawEnvironment(simMin) {
    var layer = $('environment'); if (!layer) return;
    var D = window.ERG_DAYLIGHT, info = D.light(simMin), rate = D.trafficRate(simMin, { arrivalRate: cur.world.data.ARRIVAL_PROFILE[Math.min(11, Math.floor((simMin-cur.world.data.SIM.START)/60))] || 1, weekend: cur.world.day.weekend });
    var cars = D.cars(simMin - 12, simMin + 30, { seed: cur.code, arrivalRate: rate }); if (!cars.length) cars = [{id:'fallback-a',t:simMin-2,kind:'car',dir:1},{id:'fallback-b',t:simMin+2,kind:'scooter',dir:-1}];
    var html = '';   /* 10-13 楊老師：室內不分日夜、完全不加色調（原本晚上蓋一層深藍灰）；日夜改用時間旁邊的太陽／月亮 */
    /* 10-12：斜射光束與燈暈拿掉（畫面上不要有干擾的東西），只留日夜色調 */
    /* 10-12 楊老師：畫面下方一直有車子跑很怪 ⇒ 車流動畫拿掉，忙碌程度改用右上角一顆不會動的燈號（D.busyLight） */
    var emergency = cur.world.sim.activeEvents(simMin).some(function(e){return e.spawn&&e.spawn.mode==='ambulance';});
    if (emergency) html += '<i class="ambulanceCar">🚑<b></b></i>';
    cur.busy = { light: D.busyLight(rate), phase: info.phase };   /* 人潮燈號：顯示在「房間現況」那一條的開頭（renderRoomNow） */
    layer.innerHTML = html;
  }
  /* 一間房要顯示哪些家具名稱：同名只留最下面那個；預設放在家具下方，會壓到線索牌或超出房間就改放上方。回傳 [{text,x,y}]（房間內相對座標，x 是中心） */
  function furnLabelsFor(roomId) {
    var rm = LAYOUT.room(roomId); if (!rm) return [];
    /* 10-13 A3：候選位置（家具內／下／右／左／上）→ 排除壓線索牌、站位人物、其他名稱、出界 → 成本最低；放不下就不畫（點家具仍看得到名稱）。labels.js 與手機共用。 */
    var z = Math.max(0.3, liveZoom() || 1);
    var pins = cur.world.clues.filter(function (c) { return c.pin.room === roomId; }).map(function (c) { return { rx: c.pin.rx, ry: c.pin.ry }; });
    var res = window.ERG_LABELS.place({ w: rm.w, h: rm.h }, (LAYOUT.FURNITURE || []).filter(function (f) { return f.room === roomId && f.label; }), pins, (LAYOUT.STATIONS || []).filter(function (s) { return s.room === roomId; }), { sizeOf: function (t) { return { w: (t.length * 12 + 12) / z, h: 18 / z }; } });
    return res.filter(function (r) { return !r.miss; }).map(function (r) { return { text: r.text, x: r.x + r.w / 2, y: r.y }; });
  }
  /* 家具名稱（單房模式）：疊在人物之上的 DOM 標籤，位置由 placeTokens 每幀跟著鏡頭（_wx/_wy）。全地圖模式不畫，改用畫布上的文字。 */
  function syncFurnLabels() {
    var host = $('overlay'), room = cur.stageMode === 'map' ? null : (cur.watchRoom || cur.player.loc), key = String(room) + '|' + (Math.round((liveZoom() || 1) * 10) / 10);   /* 鏡頭縮放變了名稱大小（世界單位）就跟著變，要重算 */
    if (cur._flKey === key) return; cur._flKey = key;
    Array.prototype.forEach.call(host.querySelectorAll('.fLabel'), function (e) { e.remove(); });
    var rm = room && LAYOUT.room(room); if (!rm || rm.type !== 'room') return;
    furnLabelsFor(room).forEach(function (o) {
      var e = document.createElement('div'); e.className = 'fLabel'; e.textContent = o.text; e._wx = rm.x + o.x; e._wy = rm.y + o.y; host.appendChild(e);
    });
    cur._dirty = true;
  }
  /* 10-18 UI 方案 7：全地圖模式的房名。畫布文字會隨縮放變小（1366×800 時 9.4px、矮視窗 5.1px），改用 DOM 標籤：固定 13px、房間左上、
     現在所在的房間橘底加 📍、去過的加 ✓；房間太窄放不下全名時改用短名。位置每幀由 placeTokens 跟著鏡頭（_wx／_wy）。 */
  function syncMapLabels() {
    var host = $('overlay'), map = cur.stageMode === 'map', z = liveZoom() || 1, seen = cur.player.roomsSeen || {};
    var hint = $('mapHint'); if (!hint && $('stage')) { hint = document.createElement('div'); hint.id = 'mapHint'; hint.textContent = '點房間可直接過去'; $('stage').appendChild(hint); }
    if (hint) hint.style.display = map ? 'block' : 'none';
    var key = (map ? 'map' : 'off') + '|' + Math.round(z * 100) + '|' + cur.player.loc + '|' + Object.keys(seen).sort().join(',');
    if (cur._mlKey === key) return; cur._mlKey = key;
    Array.prototype.forEach.call(host.querySelectorAll('.mLabel'), function (e) { e.remove(); });
    if (!map) { cur._dirty = true; return; }
    LAYOUT.ROOMS.forEach(function (r) {
      if (r.type === 'remote') return;
      var name = r.name, w13 = function (t) { return t.length * 13 + 16; };
      if (w13(name) > r.w * z - 6) name = (MM.SHORT && MM.SHORT[r.id]) || name;
      var e = document.createElement('div'); e.className = 'mLabel' + (r.id === cur.player.loc ? ' here' : (seen[r.id] && r.type === 'room' ? ' seen' : '')); e.setAttribute('data-room-label', r.id); e.textContent = name;
      e._wx = r.x + 6 / z; e._wy = r.y + ((r.type === 'room') ? 12 : 4) / z; host.appendChild(e);
    });
    cur._dirty = true;
  }
  /* 線索牌的點擊區：牌子畫在畫布上，人物（DOM）站在上面時會攔走點擊 ⇒ 另外疊一層透明的點擊區在人物之上。位置每幀由 placeTokens 跟著鏡頭更新。 */
  function openClue(id) { hidePop(); cur.selClue = id; S.switchTab('clue'); if (cur.role === 'member') DB.appendEvent(cur.code, { kind: 'clue-open', env: APP.me.sid, clue: id }); }
  function syncPinHits() {
    var host = $('overlay'), room = cur.stageMode === 'map' ? null : (cur.watchRoom || cur.player.loc), want = {};
    cur.pinHits = cur.pinHits || {};
    cur.world.clues.forEach(function (c) { if (room && c.pin.room === room && room === cur.player.loc) want[c.id] = c; });
    Object.keys(cur.pinHits).forEach(function (id) { if (!want[id]) { cur.pinHits[id].remove(); delete cur.pinHits[id]; } });
    Object.keys(want).forEach(function (id) {
      var el = cur.pinHits[id];
      if (!el) { el = cur.pinHits[id] = document.createElement('div'); el.className = 'pinHit'; el.dataset.clue = id; el.title = '線索 ' + id + '（點了就讀）'; el.textContent = '線索 ' + id; el.onclick = function (e) { e.stopPropagation(); openClue(id); }; host.appendChild(el); }
      var c = want[id], p = LAYOUT.abs(c.pin.room, c.pin.rx, c.pin.ry), a = screenPos(p.x - 4, p.y - 4), z = a.z;
      el._pwx = p.x - 4; el._pwy = p.y - 4;
      el.style.left = a.x + 'px'; el.style.top = a.y + 'px'; el.style.width = (84 * z) + 'px'; el.style.height = (42 * z) + 'px'; el.style.fontSize = Math.max(11, 12.5 * z) + 'px';
    });
  }
  function syncRoomProps(){var host=$('overlay'),r=LAYOUT.room(cur.player.loc),old=host.querySelectorAll('.roomProp');Array.prototype.forEach.call(old,function(e){e.remove();});if(!r||r.type!=='room'||cur.stageMode==='map')return;var items=[];if(r.id==='nurse')items.push({x:r.x+105,y:r.y+35,text:'3床待評估\n家屬已到',cls:'board'});if(r.id==='triage')items.push({x:r.x+230,y:r.y+24,text:'A018',cls:'screen'});if(r.id==='waiting'){items.push({x:r.x+76,y:r.y+127,text:'●',cls:'seat'});items.push({x:r.x+120,y:r.y+127,text:'●',cls:'seat'});}items.forEach(function(p){var e=document.createElement('div'),s=screenPos(p.x,p.y);e.className='roomProp '+p.cls;e.textContent=p.text;e.style.left=s.x+'px';e.style.top=s.y+'px';e.style.zIndex='4';host.appendChild(e);});}
  /* 站在「站在某件家具後面」的站點（layout.js STATIONS 的 behind）上的人，推開時視為推不動：不然線索牌的障礙點會把站崗的人推到家具前面，遮擋就沒了 */
  var BEHIND_PTS = null;
  function atBehindStation(el) {
    if (!BEHIND_PTS) BEHIND_PTS = (LAYOUT.STATIONS || []).filter(function (s) { return s.behind; }).map(function (s) { var p = LAYOUT.abs(s.room, s.rx, s.ry); return { x: p.x, y: p.y, room: s.room }; });
    return BEHIND_PTS.some(function (p) { return p.room === el._room && Math.abs(p.x - el._tx) < 1.5 && Math.abs(p.y - el._ty) < 1.5; });
  }
  /* 同房間的人互相推開，不要全部疊在一起；位置慢慢滑過去，不跳 */
  function spreadTokens() {
    var items = [], ids = Object.keys(cur.tokens), bounds = {};
    LAYOUT.ROOMS.forEach(function (r) { bounds[r.id] = r; });
    ids.forEach(function (id) { var el = cur.tokens[id]; if (el._tx === undefined || el.classList.contains('off')) return; items.push({ id: id, x: el._tx, y: el._ty, room: el._room, fixed: !!el._fixed || atBehindStation(el) }); });
    /* 10-12：線索牌當成推不動的障礙物（牌子下方兩個點），人物會被推到旁邊，不再蓋住牌子（警衛原本整個站在 C-01 上） */
    /* 障礙物：線索牌（兩排兩欄，整塊牌子都要露出來）與告示類家具（上面有字），人物會被推到旁邊 */
    cur.world.clues.forEach(function (c) { var q = LAYOUT.abs(c.pin.room, c.pin.rx, c.pin.ry); [[20, 34], [56, 34], [20, 84], [56, 84]].forEach(function (o, k) { items.push({ id: 'pin:' + c.id + ':' + k, x: q.x + o[0], y: q.y + o[1], room: c.pin.room, fixed: true }); }); });
    (LAYOUT.FURNITURE || []).forEach(function (f, k) { if (f.type !== 'sign' && f.type !== 'board' && f.type !== 'screen' && f.type !== 'lightbox') return; var rm0 = LAYOUT.room(f.room); if (!rm0) return; items.push({ id: 'sign:' + k, x: rm0.x + f.rx + (f.w || 30) / 2, y: rm0.y + f.ry + (f.h || 20) + 40, room: f.room, fixed: true }); });
    var out = window.ERG_SPREAD.spread(items, { iter: 8, bounds: bounds });
    ids.forEach(function (id) {
      var el = cur.tokens[id], o = out[id]; if (!o) return;
      if (el._fixed || (id==='me' && cur.walk)) { el._wx = id==='me'?cur.me.x:o.x; el._wy = id==='me'?cur.me.y:o.y; }
      else if (el._wx === undefined) { el._wx = o.x; el._wy = o.y; }
      else { el._wx += (o.x - el._wx) * 0.45; el._wy += (o.y - el._wy) * 0.45; }
    });
  }
  function liveZoom() { var st = cur.api && cur.api.getAppState && cur.api.getAppState(); return st ? st.zoom.value : (cur.view ? cur.view.zoom : 1); }
  /* 10-18 z-order：① 層級用「畫面上實際位置」（_wy＝推開、平滑之後）＋決勝鍵（我最上層）；② 遮擋只套在身體（.bodyClip），不套整個 .tok，
     名牌與泡泡因此不被切；③ 幾何一律從畫面量到的像素換算，公式在 depth.js（桌面與手機共用）。 */
  /* 身體 svg 的像素寬（svg 沒有 offsetWidth）：用高度與 viewBox 比例算，不受走路／呼吸動畫的旋轉影響 */
  function bodyW(sv, bc) { var vb = sv.viewBox && sv.viewBox.baseVal, h = bc.offsetHeight; return vb && vb.height ? h * vb.width / vb.height : sv.getBoundingClientRect().width; }
  function applyDepth(nodes, n, z) {
    var i, el, geo = [];
    for (i = 0; i < n; i++) {
      el = nodes[i]; if (el._wx === undefined || !el.classList.contains('tok')) continue;
      var bc = el.querySelector('.bodyClip'), sv = bc && bc.firstElementChild; if (!sv) continue;
      var ft = .92 * el.offsetHeight - bc.offsetTop;   /* 腳底離容器上緣的像素；人物「身高」＝頭頂到腳底＝ft（svg 底下還有約 8% 空白不算） */
      geo.push({ el: el, bc: bc, bw: bodyW(sv, bc), bh: ft, boxW: bc.offsetWidth, boxH: bc.offsetHeight, footTop: ft });
    }
    geo.forEach(function (g) {
      var e = g.el, rr = LAYOUT.room(e._room);
      e.style.zIndex = String(DEPTH.z(e._wy, DEPTH.tie(e._eid || 'me')));
      g.bc.style.clipPath = DEPTH.clipFor(LAYOUT.FURNITURE, rr, { x: e._wx, y: e._wy, scale: z, bw: g.bw, bh: g.bh, boxW: g.boxW, boxH: g.boxH, footTop: g.footTop }).css;
    });
  }
  /* 每個畫面幀：依即時的捲動與縮放放置角色（平移、縮放時角色跟著走） */
  function placeTokens() {
    if (!cur || !cur.api) return;
    var st = cur.api.getAppState(), z = st.zoom.value, sx = st.scrollX, sy = st.scrollY, key = z + '|' + sx + '|' + sy + '|' + (cur._tn || 0);
    var ov = $('overlay'), nodes = ov.children, n = nodes.length, i, el;
    var frame=$('stageFrame'); if(frame){frame.style.display=cur.stageMode==='map'?'none':'block';frame.style.bottom=(($('travelBar')?$('travelBar').offsetHeight:40)+18)+'px';}
    var mask=$('boardMask'); if(mask){if(cur.stageMode==='map'){mask.style.display='none';}else{var mr=(cur.walk&&cur.focus)?cur.focus:stageRect(),a=screenPos(mr.x,mr.y),b=screenPos(mr.x+mr.w,mr.y+mr.h);mask.style.borderRadius='var(--r-m)';mask.style.display='block';mask.style.position='absolute';mask.style.left=a.x+'px';mask.style.top=a.y+'px';mask.style.width=Math.max(0,b.x-a.x)+'px';mask.style.height=Math.max(0,b.y-a.y)+'px';mask.style.zIndex='5';mask.style.pointerEvents='none';mask.style.boxShadow='0 0 0 3000px var(--panel)';   /* 10-12：原本是近黑色，楊老師說像黑邊；改成頁面底色 */}}
    key += '|' + $('board').clientWidth + '|' + $('board').clientHeight;
    if (key === cur._placeKey && n === cur._placeN && !cur._dirty) return; cur._placeKey = key; cur._placeN = n; cur._dirty = false;
    for (i = 0; i < n; i++) { el = nodes[i]; if (el._wx === undefined) continue; el.style.left = ((el._wx + sx) * z) + 'px'; el.style.top = ((el._wy + sy) * z) + 'px'; }
    if (DEPTH) applyDepth(nodes, n, z);
    if (cur.pinHits) Object.keys(cur.pinHits).forEach(function (id) { var e = cur.pinHits[id]; e.style.left = ((e._pwx + sx) * z) + 'px'; e.style.top = ((e._pwy + sy) * z) + 'px'; e.style.width = (84 * z) + 'px'; e.style.height = (42 * z) + 'px'; e.style.fontSize = Math.max(11, 12.5 * z) + 'px'; });
    var sz = Math.max(40, Math.min(100, 112 * z));
    if (cur._sz !== sz) { cur._sz = sz; Array.prototype.forEach.call(ov.querySelectorAll('svg'), function (v) { v.style.height = sz + 'px'; v.style.width = 'auto'; }); }
  }
  /* ───── 點擊互動：點人、點物件都彈一張小卡，動作都在卡上（單擊，不用長按）───── */
  function hidePop() { var p = $('popCard'); if (p) p.remove(); }
  S.hidePop = hidePop;
  function showPop(wx, wy, html) {
    hidePop(); var ov = $('overlay'), p = document.createElement('div'); p.id = 'popCard'; p.className = 'popCard'; p.innerHTML = html + '<button class="popClose" aria-label="關閉">×</button>';
    var s = screenPos(wx, wy); p.style.left = s.x + 'px'; p.style.top = s.y + 'px'; p.style.zIndex = '2147483000'; ov.appendChild(p);
    p.querySelector('.popClose').onclick = hidePop; p.onclick = function (e) { e.stopPropagation(); };
    return p;
  }
  /* 點到人物時：同一個點底下疊了好幾個人，就優先選「可以訪談的真人物」，其次才是模擬同學（模擬同學常站在警衛或護理師身上，會把點擊攔走，變成點不到要訪談的人）。 */
  /* 10-20：兩個人疊得很近、下面那位幾乎被蓋住時點不到（二乙回報「人物重疊沒辦法點」）。同一個點連按，就輪流選這個點底下的每一位。 */
  function cyclePick(e, base) {
    try {
      if (!e || !document.elementsFromPoint) return base;
      var ids = []; document.elementsFromPoint(e.clientX, e.clientY).forEach(function (n) { var t = n.closest ? n.closest('.tok') : null; if (t && t._eid && ids.indexOf(t._eid) < 0) ids.push(t._eid); });
      var lp = cur._lastPick, now = Date.now(), pick = base;
      if (ids.length > 1 && lp && lp.base === base && now - lp.t < 8000 && Math.abs(e.clientX - lp.x) < 14 && Math.abs(e.clientY - lp.y) < 14 && ids.indexOf(lp.id) >= 0) pick = ids[(ids.indexOf(lp.id) + 1) % ids.length];
      cur._lastPick = { base: base, id: pick, t: now, x: e.clientX, y: e.clientY };
      return pick;
    } catch (x) { return base; }
  }
  function pickTokenAt(e, id) {
    try {
      var ent0 = cur.world.entityById(id); if (!e || !ent0 || ent0.kind !== 'bot' || !document.elementsFromPoint) return id;
      var ids = [];
      document.elementsFromPoint(e.clientX, e.clientY).forEach(function (n) { var t = n.closest ? n.closest('.tok') : null; if (t && t._eid) ids.push(t._eid); });
      return VC.pickPreferred(cur.world, id, ids);   /* 選哪個的規則在 view_core */
    } catch (x) { return id; }
  }
  function popState() { return { loc: cur.player.loc, worldSec: cur.clock.worldSec }; }
  function onNpcClick(id) {
    var d = VC.npcPopup(cur.world, LAYOUT, popState(), id, S.simMin()); if (!d) return;
    var ent = d.ent, pos = d.pos, m = d.mutter, av = d.av, here = d.here, onHall = d.onHall;
    var html = '<b>' + esc(ent.name) + '</b> <span class="muted">' + esc((ent.persona && ent.persona.title) || ent.kind || '') + '</span>' +
      '<div class="popLine">正在：' + esc(pos.act || '待著') + (av.fatigue && av.fatigue.level >= 2 ? '　看起來很累' : '') + '</div>' +
      (m ? '<div class="popLine muted">「' + esc(m.text) + '」</div>' : '') +
      '<div class="popLine">' + (here ? esc(d.levelText) : '在' + esc(d.roomName) + '，要走過去才問得到') + '</div><div class="row popBtns">' +
      (d.actions.indexOf('intv') >= 0 ? '<button data-act="intv">訪談</button>' : '') +
      (d.actions.indexOf('go') >= 0 ? '<button data-act="go">走過去</button>' : '') +
      '<button class="ghost" data-act="note">記便利貼</button></div>';
    var p = showPop(pos.x, pos.y - 20, html);
    Array.prototype.forEach.call(p.querySelectorAll('[data-act]'), function (b) {
      b.onclick = function () {
        var a = b.dataset.act; hidePop();
        if (a === 'intv') { if (onHall) { toast('走道上不能訪談，請先走進一間房。'); return; } cur.selNpc = id; S.switchTab('intv'); }
        else if (a === 'go') startTravel(d.goRoom);
        else if (a === 'note' && window.ERG_PANELS) window.ERG_PANELS.addOpenCard('便利貼', VC.npcNote(LAYOUT, ent, pos, S.simTime()));
      };
    });
  }
  function onFurnitureClick(f, wx, wy) {
    var d = VC.furniturePopup(cur.world, LAYOUT, popState(), f);
    var html = '<b>' + MM.iconHtml(MM.furnitureIcon(f)) + ' ' + esc(d.label) + '</b><div class="popLine">' + esc(d.state) + '</div><div class="row popBtns"><button data-act="card">記一張勘查卡</button><button class="ghost" data-act="note">記便利貼</button></div>';
    var p = showPop(wx, wy, html);
    Array.prototype.forEach.call(p.querySelectorAll('[data-act]'), function (b) {
      b.onclick = function () {
        var a = b.dataset.act; hidePop();
        if (a === 'card' && window.ERG_PANELS) { window.ERG_PANELS.prefill = d.cardPrefill; S.switchTab('cards'); }
        else if (a === 'note' && window.ERG_PANELS) window.ERG_PANELS.addOpenCard('便利貼', VC.furnitureNote(cur.world, LAYOUT, popState(), f, S.simTime()));
      };
    });
  }
  /* 給 3D 視圖（view3d.js）呼叫：同一套彈窗與點地板的判斷 */
  S.onNpcClick = function (id) { if (cur) onNpcClick(id); };
  S.boardPointer = function (x, y) { onBoardPointer({ origin: { x: x, y: y }, _own: true }); };
  S.hidePop = function () { hidePop(); };
  S.entityHere = function () {
    var out = [], simMin = CLK.simMin(cur.clock);
    cur.world.at(cur.clock.worldSec).forEach(function (it) {
      if (it.pos.room !== cur.player.loc || it.ent.kind === 'bot') return;
      out.push({ ent: it.ent, pos: it.pos, av: cur.world.availability(it.ent, it.pos, simMin) });
    });
    return out;
  };
  S.simMin = function () { return CLK.simMin(cur.clock); };
  S.simTime = function () { return simText(cur.clock); };

  /* ───── 小地圖 ───── */
  /* 10-18 UI 方案 3：桌面小地圖、放大視窗共用同一份資料（與手機版同用 MM.optsFrom），圖層一致 */
  function mapSrc() {
    var t = cur.clock.worldSec, npc = [], players = [], simMin = S.simMin();
    cur.world.at(t).forEach(function (it) {
      if (it.pos.x === undefined || (cur.vis && !cur.vis[it.ent.id])) return;
      npc.push({ x: it.pos.x, y: it.pos.y, kind: it.ent.kind === 'bot' ? 'bot' : 'npc' });
    });
    var room = DB.getRoom(cur.code);   /* 同房間的其他真人 */
    Object.keys(room.players || {}).forEach(function (sid) {
      if (sid === APP.me.sid) return;
      var p = room.players[sid], sp = spotIn(p.loc || 'entrance');
      players.push({ x: sp.x, y: sp.y, label: sid.slice(-4) });
    });
    var active = cur.world.sim.activeEvents(simMin).reduce(function (a, e) { return a.concat(e.rooms || []); }, []), seen = cur.player.roomsSeen || {};
    return { loc: cur.player.loc, me: cur.me, roomsSeen: seen, npcDots: npc, players: players, activeEventRooms: active, walkTarget: cur.walk && cur.walk.target,
      clues: MM.clueStatus(cur.world.clues, L.listMarkers(S.markerEls()), seen, APP.me.sid) };
  }
  function bindMapClicks(root, afterClick) {
    Array.prototype.forEach.call(root.querySelectorAll('g.ermm-click'), function (g) { g.onclick = function () { var id = g.getAttribute('data-room'); if (afterClick) afterClick(); jumpTo(id); }; });
  }
  function renderMinimap() {
    if (!cur || !$('minimapBox').classList.contains('open')) return;
    $('mm').innerHTML = MM.svg(LAYOUT, Object.assign(MM.optsFrom(mapSrc()), { width: 420 }));
    bindMapClicks($('mm'));
  }
  S.minimap = renderMinimap;
  $('fitBtn').onclick = function () { if (cur) { cur.stageMode='map';cur.focus = null;refreshStageMode(); } };
  function afterLayout() { setTimeout(function () { if (cur && cur.api) { fitView(true); cur._placeKey=''; placeTokens(); } }, 60); }
  $('sideBtn').onclick = function () { $('game').classList.toggle('sideOff'); afterLayout(); };
  $('fsBtn').onclick = function () {
    try { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); } catch (e) { toast('這個瀏覽器不能全螢幕'); }
  };
  document.addEventListener('fullscreenchange', afterLayout);
  S.openSide = function () { if ($('game').classList.contains('sideOff')) { $('game').classList.remove('sideOff'); afterLayout(); } };
  $('mmBtn').onclick = function () { $('minimapBox').classList.toggle('open'); renderMinimap(); };
  $('mapExpand').onclick = function () {
    S.openModal('<div class="row"><b class="grow">急診室全地圖（點房間直接到）</b><button class="ghost" id="mapClose">關閉</button></div>' + MM.svg(LAYOUT, Object.assign(MM.optsFrom(mapSrc()), { fontScale: 1.3, width: 900, clueText: true })) + MM.legendHtml());
    $('modalBox').style.maxWidth = '96vw'; $('mapClose').onclick = function () { S.closeModal(); $('modalBox').style.maxWidth = ''; };
    bindMapClicks($('modalBox'), function () { S.closeModal(); $('modalBox').style.maxWidth = ''; });
  };

  /* ───── 事件（漫畫分鏡）、跑馬燈 ───── */
  function refreshTicker() {
    if (!cur) return;
    var simMin = S.simMin(), tk = cur.world.sim.ticker(simMin, 1);
    var t = $('ticker'); if (!t) return;
    if (!tk.length) { t.style.display = 'none'; return; }
    t.style.display = 'block'; t.textContent = tk[0].time + '　' + tk[0].title + '：' + tk[0].text;
  }
  function eventWatch() {
    var simMin = S.simMin(), act = cur.world.sim.activeEvents(simMin), sfx = $('sfx');
    /* 10-18 事件演出 P1（決定 2）：只有「事件就在我這間房」才自動演；別間房的重要事件不再切鏡頭，改由事件條通知「○○發生了事件［去看］」 */
    var known=window.ERG_EVENT_GUIDE.build(); var here = act.filter(function(e){return (e.rooms||[]).indexOf(cur.player.loc)>=0;});
    var far = act.filter(function(e){var g=known.filter(function(x){return x.id===e.id;})[0];return (e.rooms||[]).indexOf(cur.player.loc)<0&&g&&g.importance===3;});
    window.ERG_EVENT_UI.notice(cur, act, far);
    var present=cur.world.at(cur.clock.worldSec).filter(function(it){return it.pos.room===cur.player.loc;}), actions=present.map(function(it){return it.ent.name+'：'+(it.pos.act||'忙著手邊工作');}).slice(0,2),waiters=present.filter(function(it){return it.ent.kind==='patient'&&/候診|等結果|等候/.test(it.pos.act||'');}),waitMax=0;
    waiters.forEach(function(it){(it.ent.timeline.segments||[]).forEach(function(s){if(s.kind==='idle'&&s.act===it.pos.act&&cur.clock.worldSec>=it.ent.timeline.appearAt+s.t0&&cur.clock.worldSec<=it.ent.timeline.appearAt+s.t1)waitMax=Math.max(waitMax,(cur.clock.worldSec-it.ent.timeline.appearAt-s.t0)/cur.world.data.SIM.SECONDS_PER_SIM_MIN);});});
    var clueCount=cur.world.clues.filter(function(c){return c.pin.room===cur.player.loc;}).length;
    var tired = present.filter(function(it){var a=cur.world.availability(it.ent,it.pos,simMin);return a.fatigue&&a.fatigue.level>=2;})[0];
    var nowTxt=(here.length?'這間房現在：'+here[0].title+'。':'這間房現在：')+(actions.join('；')||'暫時安靜，留意桌面與等候區。')+' 等候 '+waiters.length+' 人，約 '+Math.floor(waitMax)+' 分；線索 '+clueCount+' 張。'+(tired?' '+tired.ent.name+'看起來很累。':'');
    var rn=$('roomNow'),barOn=!!window.ERG_EVENT_UI.busy(cur),fresh=here.some(function(e){return !cur.seenEv[e.id]&&!(cur.player.seenEv||{})[e.id];}),showCap=!barOn&&!fresh&&!!(cur._capText&&Date.now()<(cur._capUntil||0));rn.classList.toggle('cap',showCap);
    if(showCap){rn.textContent=cur._capText;return;}
    var bz=cur.busy;if(!barOn)rn.innerHTML=(bz?'<i class="lamp" style="background:'+bz.light.color+'"></i>'+esc(bz.light.text+'・'+bz.phase)+'　':'')+esc(nowTxt);   /* 事件條在用 #roomNow 時不去改寫它 */
    if (here.length) {   /* 擬聲字只在事件開始的 1.5 秒出現（原本整段事件都掛著） */
      var sid = String(here[0].id || here[0].title || '') + '@' + cur.player.loc;
      if (cur._sfxId !== sid) { cur._sfxId = sid; cur._sfxUntil = Date.now() + 1500; }
      if (Date.now() < cur._sfxUntil) { sfx.style.display = 'block'; sfx.textContent = COMIC.sfxFor(here[0]); } else sfx.style.display = 'none';
    } else { sfx.style.display = 'none'; cur._sfxId = ''; }
    here.forEach(function (e) { if (!cur.seenEv[e.id] && !(cur.player.seenEv || {})[e.id]) { cur.seenEv[e.id] = true; cur.player.seenEv = Object.assign({}, cur.player.seenEv, (function () { var o = {}; o[e.id] = true; return o; })()); window.ERG_EVENT_UI.startLive(cur,e,cur.player.loc); } });
  }
  function stripPanels(ev) {
    var loc = roomName(cur.player.loc), inc = ev.incident;
    var third = inc ? '警衛老陳趕到，兩個人一起被請出大門。' : (ev.text || '');
    return [{ cap: loc + '　' + S.simTime(), body: ev.title }, { big: COMIC.sfxFor(ev) }, { cap: third }];
  }
  function showStrip(ev) {
    var panels = stripPanels(ev);
    var html = '<h2 style="margin-top:0">' + esc(ev.title) + '</h2><div class="strip">' +
      panels.map(function (p, i) { return '<div class="panel">' + (p.cap ? '<span class="cap">' + esc(p.cap) + '</span>' : '') + (p.body ? '<div style="font-size:22px;font-weight:900;margin-top:10px">' + esc(p.body) + '</div>' : '') + (p.big ? '<div class="big">' + esc(p.big) + '</div>' : '') + '</div>'; }).join('') + '</div>' +
      '<p class="muted" style="margin:10px 0 6px">看完分鏡，三選一（您的模擬時間照走）：</p><div class="row">' +
      '<button id="evWatch">看熱鬧（拿一張「目擊」便利貼）</button><button id="evCase" class="ghost">繼續查案</button><button id="evGame" class="ghost">玩 5 秒點泡泡</button></div><div id="evGameBox"></div>';
    openModal(html);
    $('evWatch').onclick = function () { addWitnessCard(ev); closeModal(); };
    $('evCase').onclick = closeModal;
    $('evGame').onclick = function () { popGame(); };
  }
  function addWitnessCard(ev) {
    if (window.ERG_PANELS) window.ERG_PANELS.addOpenCard('便利貼', '目擊：' + ev.title + '（' + S.simTime() + '，' + roomName(cur.player.loc) + '）');
    toast('已記下一張「目擊」便利貼。');
  }
  function popGame() {
    var box = $('evGameBox'), n = 0, left = 5;
    box.innerHTML = '<div style="position:relative;height:200px;border:var(--bw) solid var(--ink);border-radius:var(--r-m);margin-top:8px;overflow:hidden" id="pg"></div><div id="pgInfo" class="muted">點掉泡泡！剩 5 秒</div>';
    var pg = $('pg');
    function spawn() { var b = document.createElement('button'); b.className = 'pop'; b.style.left = Math.random() * (pg.clientWidth - 50) + 'px'; b.style.top = Math.random() * 150 + 'px'; b.setAttribute('aria-label', '泡泡'); b.onclick = function () { n += 1; b.remove(); }; pg.appendChild(b); }
    spawn(); var sp = setInterval(spawn, 450);
    var tm = setInterval(function () { left -= 1; $('pgInfo').textContent = left > 0 ? '點掉泡泡！剩 ' + left + ' 秒（已點 ' + n + '）' : '時間到！點掉了 ' + n + ' 個，神清氣爽。'; if (left <= 0) { clearInterval(sp); clearInterval(tm); } }, 1000);
  }
  function openModal(html) { $('modalBox').innerHTML = html; $('modal').classList.add('on'); if (cur) cur.modalOpen = false; }
  function closeModal() { $('modal').classList.remove('on'); }
  S.openModal = openModal; S.closeModal = closeModal;
  $('modal').addEventListener('click', function (e) { if (e.target === $('modal')) closeModal(); });
})();
