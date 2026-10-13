/* 手機版的房間：一次一間房（單房俯視圖），左右滑或點「附近的房間」換房，不用 Excalidraw。
   側邊面板（線索、訪談、筆記卡、結論、討論、檢核點）與電腦版共用 panels.js。介面 API 與 room.js 的 ERG_ROOM 相同。 */
(function () {
  'use strict';
  var APP = window.ERG_APP, DB = APP.DB, $ = APP.$, esc = APP.esc;
  var CORE = window.ERG_CORE, L = window.ERG_LOGIC, LAYOUT = window.ERG_LAYOUT, MM = window.ERG_MINIMAP, RV = window.ERG_ROOMVIEW, CH = window.ERG_CHARS;
  var AV = window.ERG_AVATAR, CLK = window.ERG_CLOCK, COMIC = window.ERG_COMIC, AMB = window.ERG_AMBIENCE, BGM=window.ERG_BGM, DEPTH=window.ERG_DEPTH;

  var S = window.ERG_ROOM = { cur: null }, cur = null;
  function roomName(id) { var r = LAYOUT.room(id); return r ? r.name : id; }
  function toTop() { try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { window.scrollTo(0, 0); } }
  function toast(msg, onTap) {
    /* 10-13：提示訊息原本寫在場景下面的事件字幕那一格，但那一格每秒會被事件字幕更新蓋掉，而且整頁能捲之後可能根本不在畫面上。
       改成固定在畫面下方的浮動框，4 秒後消失。 */
    var f = $('toastFloat'); if (!f) { f = document.createElement('div'); f.id = 'toastFloat'; f.setAttribute('role', 'status'); document.body.appendChild(f); }
    /* onTap：這一句可以點（例如「別處發生事件，點這裡過去看」）。可以點的多留 2 秒。 */
    f.textContent = msg; f.style.display = 'block'; f.style.pointerEvents = onTap ? 'auto' : 'none'; f.style.cursor = onTap ? 'pointer' : '';
    f.onclick = onTap ? function () { f.style.display = 'none'; onTap(); } : null;
    clearTimeout(toast._f); toast._f = setTimeout(function () { f.style.display = 'none'; f.onclick = null; }, onTap ? 6000 : 4000);
  }
  S.toast = toast;

  S.enter = function (code) {
    var sid = APP.me.sid, j = DB.joinRoom(code, sid), room = DB.getRoom(code);
    var shift = room.shift === 'night' ? 'night' : 'day', world = window.ERG_WORLD.makeWorld({ caseId: room.case || 'sms', seed: room.code, dow: room.dow, shift: shift }), player = CORE.getPlayer(room, sid);
    if (!player) { player = CORE.blankPlayer(APP.me.profile, 'entrance'); player.visit = String(room.host) !== String(sid); CORE.savePlayer(DB, code, sid, player); }
    cur = S.cur = { code: code, room: room, role: j.role, world: world, player: player, clock: CLK.create({ speed: player.speed || APP.me.profile.speed || '標準', worldSec: player.worldSec || 0, shift: shift }),
      tab: 'clue', selClue: null, selNpc: null, lastSave: 0, seenEv: {}, tickT: 0, tokens: {}, soundOn: APP.me.profile.sound !== false, musicOn:APP.me.profile.music===true,amb: null,bgm:null,walk:null, mobile: true };
    APP.show('game');
    $('roomLabel').textContent = world.day.short + '・' + (shift === 'night' ? '夜班' : '日班') + '・' + world.meta.short;
    cur.singleRoom = true;   /* 手機一次只看一間房；事件演出用這個旗標決定鏡頭不離開玩家所在的房間 */
    buildTabs(); if(window.ERG_ROTATION_UI)window.ERG_ROTATION_UI.bind(S); buildDots(); updateSpeedBtn();bindMusic();
    if (window.ERG_PANELS) window.ERG_PANELS.renderAll();
    cur.timer = setInterval(frame, 250); cur.slow = setInterval(slowTick, 1500);
    DB.appendEvent(code, { kind: 'join', env: sid, device: 'mobile' });
    player.visited=player.visited||[player.loc||'entrance'];player.roomsSeen=player.roomsSeen||{};(player.visited||[]).forEach(function(id){player.roomsSeen[id]=true;});   /* roomsSeen：去過的每一間（visited 只留最近 8 間，給捷徑用） */
    setLoc(player.loc || 'entrance', true); updateSoundBtn();
  };
  S.leave = function (silent) {
    if (!cur) return; persist(true); clearInterval(cur.timer); clearInterval(cur.slow);
    if (cur.amb) { try { cur.amb.stop(); } catch (e) {} }
    if (cur.bgm) { try { cur.bgm.stop(); } catch (e) {} }
    $('roomSvg').innerHTML = ''; $('overlay').innerHTML = ''; cur = S.cur = null; if (!silent) APP.enterLobby();
  };
  $('leaveBtn').onclick = function () { S.leave(false); };
  function persist(force) {
    if (!cur || window.ERG_KICKED) return; var now = Date.now(), gap = APP.online ? 60000 : 4000; if (!force && now - cur.lastSave < gap) return; cur.lastSave = now;   /* 10-13：定時的只寫時鐘小欄位、60 秒一次（說明見 room.js） */
    var p = cur.player; p.worldSec = cur.clock.worldSec; p.speed = cur.clock.speed === '自訂' ? '標準' : cur.clock.speed;
    if (!force && APP.online && DB.patchPlayerFields) { try { if (DB.patchPlayerFields(cur.code, APP.me.sid, { worldSec: p.worldSec, speed: p.speed })) return; } catch (e) { return; } }
    CORE.savePlayer(DB, cur.code, APP.me.sid, p);
  }
  S.persist = persist;

  function buildTabs() {
    var tabs = [['clue', '線索'], ['intv', '訪談'], ['cards', '筆記'], ['events', '事件簿'], ['concl', '結論'], ['disc', '討論'], ['cp', '檢核'], ['ach', '成就']];
    $('tabs').innerHTML = tabs.map(function (t) { return '<button data-t="' + t[0] + '" class="' + (t[0] === cur.tab ? 'on' : '') + '">' + t[1] + '</button>'; }).join('');
    Array.prototype.forEach.call($('tabs').children, function (b) { b.onclick = function () { S.switchTab(b.dataset.t); }; });
  }
  S.switchTab = function (t) {
    if (!cur) return; cur.tab = t;
    Array.prototype.forEach.call($('tabs').children, function (b) { b.classList.toggle('on', b.dataset.t === t); });
    ['clue', 'intv', 'cards', 'events', 'concl', 'disc', 'cp', 'ach'].forEach(function (n) { $('p-' + n).classList.toggle('on', n === t); });
    if (window.ERG_PANELS) window.ERG_PANELS.render(t);
    /* 10-13 整頁捲動：分頁列不在畫面上半部時（在第一屏底部，或已經捲過頭），把它捲到最上面，底下整個畫面就是面板。
       在上半部就不動，免得畫面亂跳。捲過頭的情況直接跳（新面板要從頭看），其餘用滑的。 */
    var an = $('tabsAnchor');
    if (an && an.getBoundingClientRect) {
      var top = an.getBoundingClientRect().top, y = top + (window.pageYOffset || document.documentElement.scrollTop || 0);
      if (top < -1 || top > (window.innerHeight || 0) * 0.5) { try { window.scrollTo({ top: y, behavior: top < 0 ? 'auto' : 'smooth' }); } catch (e) { window.scrollTo(0, y); } }
    }
  };
  function buildDots() { $('ckDots').innerHTML = '<i></i><i></i><i></i><i></i><i></i><i></i>'; var cb = $('ckBtn'); if (cb) cb.onclick = function () { S.switchTab('cp'); }; }
  S.refreshDots = function () {
    var e = APP.evaluate(); if (!e) return; cur.ev = e;
    Array.prototype.forEach.call($('ckDots').children, function (d, i) { d.classList.toggle('lit', !!e.ev.list[i] && e.ev.list[i].ok); });
    var cl = $('ckLabel'); if (cl) cl.textContent = '檢核 ' + e.ev.lit + '/6';
    var prev = cur.litPrev === undefined ? e.ev.lit : cur.litPrev;
    if (e.ev.lit > prev) { var un = AV.newlyUnlocked(prev, e.ev.lit); toast('檢核點 ' + e.ev.lit + ' / 6' + (un.length ? '　解鎖外觀：' + un.map(function (u) { return u.label; }).join('、') : '')); }
    cur.litPrev = e.ev.lit;
    if (window.ERG_PANELS && cur.tab === 'cp') window.ERG_PANELS.render('cp');
  };
  APP.data.listeners.push(function (topic) {
    if (!cur) return;
    if (topic === 'scene:' + cur.code && window.ERG_PANELS) window.ERG_PANELS.onSceneChanged();
    if (topic === 'room:' + cur.code) { cur.room = DB.getRoom(cur.code); var p = CORE.getPlayer(cur.room, APP.me.sid); if (p) cur.player.confirms = p.confirms || cur.player.confirms; S.refreshDots(); if (window.ERG_PANELS) window.ERG_PANELS.onRoomChanged(); }
  });

  /* 速度：一顆鈕輪流切 慢→標準→快→暫停 */
  var SPEEDS = ['慢', '標準', '快', '暫停'];
  function speedKey() { return cur.clock.paused ? '暫停' : cur.clock.speed; }
  function updateSpeedBtn() { var k = speedKey(); $('speedBtn').textContent = (k === '暫停' ? '⏸ 時間 ' : '⏱ 時間 ') + k; }
  $('speedBtn').onclick = function () {
    var i = (SPEEDS.indexOf(speedKey()) + 1) % SPEEDS.length, k = SPEEDS[i];
    if (k === '暫停') cur.clock = CLK.setPaused(cur.clock, true); else { cur.clock = CLK.setPaused(CLK.setSpeed(cur.clock, k), false); APP.me.profile.speed = k; CORE.saveProfile(APP.storage, APP.me.sid, APP.me.profile); }
    updateSpeedBtn(); persist(true);
    toast(k === '暫停' ? '急診室的時間暫停了。再點一下「時間」會繼續（慢）。' : '急診室的時間速度：' + k + '。再點一下換成「' + SPEEDS[(i + 1) % SPEEDS.length] + '」。');
  };

  /* 卡片：沒有 Excalidraw，存在 room.mcards，電腦版也看得到 */
  S.allEls = function () { return DB.getScene(cur.code); };
  S.markerEls = function () { return DB.getScene(cur.code).concat(CORE.mcardEls(DB.getRoom(cur.code))); };
  S.addElements = function (skeleton) {
    var m = skeleton[0].customData.marker, room = DB.getRoom(cur.code), list = (room.mcards || []).concat([Object.assign({}, m, { text: (skeleton[0].label && skeleton[0].label.text) || m.text })]);
    DB.patchRoom(cur.code, { mcards: list });
  };
  S.focusRect = function () {}; S.focusAll = function () {}; S.fit = function () {}; S.minimap = function () {};

  /* ───── 位置 ───── */
  function nearby(id) {
    var r = LAYOUT.room(id), out = [], seen = {}; seen[id] = true;
    LAYOUT.neighbors(id).forEach(function (n) {
      var q = LAYOUT.room(n.to); if (!q) return;
      if (q.type === 'hall' || q.type === 'outside') LAYOUT.neighbors(n.to).forEach(function (m) { var w = LAYOUT.room(m.to); if (w && w.type === 'room' && !seen[w.id]) { seen[w.id] = true; out.push(w); } });
      else if (q.type === 'room' && !seen[q.id]) { seen[q.id] = true; out.push(q); }
    });
    out.sort(function (a, b) { return a.y - b.y || a.x - b.x; });
    return out;
  }
  function spotIn(roomId) {
    var st = LAYOUT.STATIONS.filter(function (s) { return s.room === roomId; }), rm = LAYOUT.room(roomId);
    /* 10-12：跟電腦版一樣，挑離線索牌與駐點最遠的固定位置，不要踩在警衛與牌子上 */
    var avoid = st.map(function (q) { return LAYOUT.abs(roomId, q.rx, q.ry); });
    if (cur && cur.world) cur.world.clues.forEach(function (c) { if (c.pin.room === roomId) { var q = LAYOUT.abs(roomId, c.pin.rx, c.pin.ry); avoid.push({ x: q.x + 38, y: q.y + 17 }); } });
    (LAYOUT.FURNITURE || []).forEach(function (f) { if (f.room === roomId) avoid.push({ x: rm.x + f.rx + (f.w || 30) / 2, y: rm.y + f.ry + (f.h || 20) / 2 + 20 }); });
    if (!avoid.length) return { x: rm.x + rm.w / 2, y: rm.y + rm.h * 0.7 };
    /* 10-13：只看「離得遠」不夠，身體還是常壓在牌子上。把自己的身體連同頭上的「你」標籤當成一塊（寬 60、高 98，腳底在站的位置），
       碰到線索牌（84×42）或告示、白板、螢幕、燈箱就大扣分；候選點 9×5，順序固定，所以同一間房每次站同一處。 */
    var blocks = [];
    if (cur && cur.world) cur.world.clues.forEach(function (c) { if (c.pin.room === roomId) { var q = LAYOUT.abs(roomId, c.pin.rx, c.pin.ry); blocks.push({ x: q.x - 6, y: q.y - 6, w: 88, h: 46 }); } });
    (LAYOUT.FURNITURE || []).forEach(function (f) { if (f.room === roomId && /^(sign|board|screen|lightbox)$/.test(f.type || '')) blocks.push({ x: rm.x + f.rx - 2, y: rm.y + f.ry - 2, w: (f.w || 30) + 4, h: (f.h || 20) + 4 }); });
    function hits(x, y) { var n = 0, bx = x - 30, by = y - 98; blocks.forEach(function (b) { if (bx < b.x + b.w && bx + 60 > b.x && by < b.y + b.h && by + 98 > b.y) n += 1; }); return n; }
    var best = null;
    [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8, 0.12, 0.88].forEach(function (fx) { [0.72, 0.62, 0.82, 0.52, 0.9].forEach(function (fy) {
      var x = rm.x + rm.w * fx, y = rm.y + rm.h * fy, d = Infinity;
      avoid.forEach(function (q) { d = Math.min(d, Math.hypot((q.x - x) / 1.4, q.y - y)); });
      d -= 1000 * hits(x, y);
      if (!best || d > best.d + 1) best = { x: x, y: y, d: d };
    }); });
    return { x: best.x, y: best.y };
  }
  function setLoc(roomId, silent) {
    if (!cur) return; var rm = LAYOUT.room(roomId); if (!rm) return;
    cur.player.loc = roomId; cur.watchRoom=roomId; cur.me = spotIn(roomId); cur.sceneKey = ''; cur._locT = Date.now(); hidePop();
    $('locLabel').textContent = (MM.ROOM_ICON[roomId] || '') + ' ' + rm.name;
    $('caption').textContent = cur.world.captionFor(roomId) || rm.name;
    if (!silent) DB.appendEvent(cur.code, { kind: 'move', env: APP.me.sid, to: roomId });
    var visited=cur.player.visited||[];cur.player.visited=[roomId].concat(visited.filter(function(x){return x!==roomId;})).slice(0,8);(cur.player.roomsSeen=cur.player.roomsSeen||{})[roomId]=true;
    renderScene(); renderNav(); soundForRoom(roomId); persist(true);
    if (window.ERG_PANELS) window.ERG_PANELS.onMove();
  }
  function nearestNode(p,room){var ids=Object.keys(cur.world.graph.nodes),best=null,bd=Infinity;ids.forEach(function(id){var n=cur.world.graph.nodes[id];if(room&&n.room!==room)return;var d=Math.hypot(n.x-p.x,n.y-p.y);if(d<bd){bd=d;best=id;}});return best;}
  function goRemote(id){cur.walk=null;setLoc(id);toTop&&toTop();toast(id==='home'?'搭公車到了病患的家。這裡有他手機收到的簡訊，家人也在。':'隔天，到了回診門診。');}   /* 10-13：這兩間不在地圖上，原本沒有入口 */
  function startTravel(id){var rm=LAYOUT.room(id);if(rm&&rm.type==='remote'&&(id==='home'||id==='clinic')){goRemote(id);return true;}if(!rm||rm.type!=='room')return false;var a=(cur.player.loc==='home'||cur.player.loc==='clinic')?spotIn('street'):cur.me,b=spotIn(id),from=nearestNode(a),to=nearestNode(b,id)||nearestNode(b),route=from&&to?window.ERG_NPC.shortestPath(cur.world.graph,from,to):null;if(!route){toast('找不到可走的路線，請從附近房間前往。');return false;}var pts=[{x:a.x,y:a.y}];route.ids.forEach(function(nid){var n=cur.world.graph.nodes[nid];if(Math.hypot(n.x-pts[pts.length-1].x,n.y-pts[pts.length-1].y)>1)pts.push({x:n.x,y:n.y});});if(Math.hypot(b.x-pts[pts.length-1].x,b.y-pts[pts.length-1].y)>1)pts.push(b);cur.walk={points:pts,index:1,target:id};$('locLabel').textContent='前往：'+rm.name;return true;}
  function advanceWalk(dt){if(!cur.walk||cur.clock.paused)return;var w=cur.walk,remain=70*cur.world.data.SIM.SECONDS_PER_SIM_MIN/cur.clock.secPerMin*dt;while(remain>0&&w.index<w.points.length){var a=cur.me,b=w.points[w.index],d=Math.hypot(b.x-a.x,b.y-a.y);if(d<=remain){cur.me={x:b.x,y:b.y};remain-=d;w.index++;}else{cur.me={x:a.x+(b.x-a.x)*remain/d,y:a.y+(b.y-a.y)*remain/d};remain=0;}}var rm=LAYOUT.roomAt(cur.me.x,cur.me.y);if(rm&&rm!==cur.player.loc){cur.player.loc=rm;cur.watchRoom=rm;renderScene();renderNav();soundForRoom(rm);if(window.ERG_PANELS)window.ERG_PANELS.onMove();}if(w.index>=w.points.length){var dest=w.target;cur.walk=null;setLoc(dest,true);DB.appendEvent(cur.code,{kind:'move',env:APP.me.sid,to:dest});persist(true);}}
  S.travel = startTravel;
  S.teleport=function(id){cur.walk=null;setLoc(id);}; S.setWatchRoom=function(id){if(!LAYOUT.room(id)||LAYOUT.room(id).type!=='room')return;cur.watchRoom=id;var scene=document.getElementById('sceneBox');if(scene){scene.style.transition='opacity .18s';scene.style.opacity='.55';setTimeout(function(){scene.style.opacity='1';},30);}renderScene();renderTokens();};
  function renderNav() {
    var list = nearby(cur.player.loc);
    $('nav').innerHTML = '<button class="ghost" id="mapBtn">🗺️ 全部</button><b>附近：</b>' + list.map(function (r) { return '<button class="ghost chip" data-go="' + esc(r.id) + '">' + (MM.ROOM_ICON[r.id] || '') + ' ' + esc(r.name) + '</button>'; }).join('')+'<b>院外：</b><button class="ghost chip" data-go="home">🚌 病患的家</button><button class="ghost chip" data-go="clinic">🏥 回診門診</button><b>去過：</b>'+(cur.player.visited||[]).map(function(id){var r=LAYOUT.room(id);return r?'<button class="ghost chip" data-visit="'+esc(id)+'">'+esc(r.name)+'</button>':'';}).join('');
    Array.prototype.forEach.call($('nav').querySelectorAll('[data-go],[data-visit]'), function (b) { b.onclick = function () { startTravel(b.dataset.go||b.dataset.visit); }; });
    $('mapBtn').onclick = openMap;
  }
  function openMap() {
    var t = cur.clock.worldSec, dots = [{ x: cur.me.x, y: cur.me.y, kind: 'me' }];
    cur.world.at(t).forEach(function (it) { if (it.pos.x !== undefined) dots.push({ x: it.pos.x, y: it.pos.y, kind: it.ent.kind === 'bot' ? 'bot' : 'npc' }); });
    S.openModal('<div class="row"><b style="flex:1">全部房間（點一間走過去；打勾的是去過的）</b><button class="ghost" id="mapClose">關閉</button></div><div class="row" style="margin-top:6px;gap:6px"><b>院外：</b><button class="ghost" data-remote="home">🚌 病患的家</button><button class="ghost" data-remote="clinic">🏥 回診門診</button></div><div style="margin-top:8px">' + MM.svg(LAYOUT, { compact:true,fontScale:1.3,onlyMap:true,width:420, showFurniture: false, you: cur.player.loc, dots: dots, clickable: true, visited: Object.keys(cur.player.roomsSeen || {}) }) + '</div>');
    $('mapClose').onclick = S.closeModal;
    Array.prototype.forEach.call($('modalBox').querySelectorAll('[data-remote]'), function (b) { b.onclick = function () { S.closeModal(); startTravel(b.dataset.remote); }; });
    Array.prototype.forEach.call($('modalBox').querySelectorAll('[data-room]'), function (g) { g.onclick = function () { var id = g.getAttribute('data-room'), r = LAYOUT.room(id); if (r && r.type === 'room') { S.closeModal(); startTravel(id); } }; });
  }

  /* 左右滑換房 */
  (function () {
    var x0 = null, y0 = 0;
    $('stage').addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
    $('stage').addEventListener('touchend', function (e) {
      if (x0 === null || !cur) return; var dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0; x0 = null;
      /* 10-13：整頁可以上下捲之後，從舞台往上滑、手指偏一點就會被當成換房 ⇒ 只認橫向為主的滑動（橫向至少 60，而且是直向的兩倍以上） */
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 2) return;
      var list = nearby(cur.player.loc); if (!list.length) return;
      var all = [LAYOUT.room(cur.player.loc)].concat(list).sort(function (a, b) { return a.y - b.y || a.x - b.x; }), i = all.map(function (r) { return r.id; }).indexOf(cur.player.loc);
      var j = dx < 0 ? Math.min(all.length - 1, i + 1) : Math.max(0, i - 1); if (j !== i) startTravel(all[j].id);
    }, { passive: true });
  })();

  /* ───── 音 ───── */
  function soundForRoom(id) { musicForRoom(id); if (!AMB || !cur.soundOn) return; try { if (!cur.amb) cur.amb = AMB.createPlayer(window.AudioContext || window.webkitAudioContext, { volume: 0.5, seed: 11 }); cur.amb.setEnabled(true); cur.amb.enter(id); } catch (e) {} }
  function musicForRoom(id){if(!BGM||!cur.musicOn)return;try{if(!cur.bgm)cur.bgm=BGM.createPlayer(window.AudioContext||window.webkitAudioContext,{volume:.05,seed:42});cur.bgm.setEnabled(true);cur.bgm.enter(id);}catch(e){}}
  function bindMusic(){var b=$('musicBtn');if(!b)return;function update(){b.textContent=cur.musicOn?'🎵':'🎵̸';b.title=cur.musicOn?'音樂：開':'音樂：關';}b.onclick=function(){cur.musicOn=!cur.musicOn;APP.me.profile.music=cur.musicOn;CORE.saveProfile(APP.storage,APP.me.sid,APP.me.profile);if(cur.bgm)cur.bgm.setEnabled(cur.musicOn);else if(cur.musicOn)musicForRoom(cur.player.loc);update();};update();}
  function updateSoundBtn() { $('soundBtn').textContent = cur.soundOn ? '🔊' : '🔇'; }
  $('soundBtn').onclick = function () { if (!cur) return; cur.soundOn = !cur.soundOn; APP.me.profile.sound = cur.soundOn; CORE.saveProfile(APP.storage, APP.me.sid, APP.me.profile); if (!cur.soundOn && cur.amb) cur.amb.setEnabled(false); else soundForRoom(cur.player.loc); updateSoundBtn(); };

  /* ───── 時鐘與畫面 ───── */
  function clockActive() { return !document.hidden && cur.tab !== 'concl' && cur.tab !== 'disc' && cur.tab !== 'cp' && !(cur.tab === 'intv' && cur.intvHold); }   /* 10-13：正在訪談時時間先暫停 */
  function frame() {
    if (!cur) return; var now = Date.now(), dt = cur.tickT ? (now - cur.tickT) / 1000 : 0; cur.tickT = now;
    if (clockActive()) cur.clock = CLK.tick(cur.clock, Math.min(dt, 1));
    advanceWalk(Math.min(dt,1));
    $('clock').textContent = CLK.format(cur.clock); (function(){var D=window.ERG_DAYLIGHT,c=$('clock'),el=$('dayIcon');if(!D||!D.icon||!c)return;if(!el){el=document.createElement('span');el.id='dayIcon';el.style.cssText='font-size:18px;line-height:1';c.parentNode.insertBefore(el,c);}var ic=D.icon(S.simMin());if(el.textContent!==ic){el.textContent=ic;el.setAttribute('aria-label',ic==='🌙'?'現在是晚上':'現在是白天');el.title=ic==='🌙'?'現在是晚上':'現在是白天';}})(); persist(false); renderTokens(); eventWatch(); if (window.ERG_EVENT_UI) window.ERG_EVENT_UI.tick(cur,S); if(window.ERG_ROTATION_UI)window.ERG_ROTATION_UI.tick(S);
    if (CLK.isDayOver(cur.clock) && !cur.dayOverShown) { cur.dayOverShown = true; toast('本班急診時段結束（07:00）。去寫結論吧。'); }
  }
  function slowTick() { if (!cur) return; refreshTicker(); S.refreshDots(); }
  S.simMin = function () { return CLK.simMin(cur.clock); };
  S.simTime = function () { return CLK.format(cur.clock); };
  S.entityHere = function () {
    var out = [], simMin = S.simMin();
    cur.world.at(cur.clock.worldSec).forEach(function (it) { if (it.pos.room !== cur.player.loc || it.ent.kind === 'bot') return; out.push({ ent: it.ent, pos: it.pos, av: cur.world.availability(it.ent, it.pos, simMin) }); });
    return out;
  };

  /* 單房俯視圖＋疊層 */
  function layoutWithClues() { return Object.assign({}, LAYOUT, { PINS: cur.world.clues.map(function (c) { return { clue: c.id, room: c.pin.room, rx: c.pin.rx, ry: c.pin.ry }; }) }); }
  /* 一間房要顯示哪些家具名稱：同名只留最下面那個；預設放在家具下方，會壓到線索牌或超出房間就改放上方。回傳 [{text,x,y}]（房間內相對座標，x 是中心） */
  function furnLabelsFor(roomId) {
    var rm = LAYOUT.room(roomId); if (!rm) return [];
    /* 10-13 A3：與桌面共用 labels.js。名稱大小用 CSS px 換成世界單位：場景框寬 ÷ (房間寬＋16)＝每世界單位幾 px */
    var sw = ($('roomSvg') && $('roomSvg').clientWidth) || ($('sceneBox') && $('sceneBox').clientWidth) || 340, z = Math.max(0.3, sw / (rm.w + 16));
    var pins = cur.world.clues.filter(function (c) { return c.pin.room === roomId; }).map(function (c) { return { rx: c.pin.rx, ry: c.pin.ry }; });
    var res = window.ERG_LABELS.place({ w: rm.w, h: rm.h }, (LAYOUT.FURNITURE || []).filter(function (f) { return f.room === roomId && f.label; }), pins, (LAYOUT.STATIONS || []).filter(function (s) { return s.room === roomId; }), { sizeOf: function (t) { return { w: (t.length * 11 + 10) / z, h: 16 / z }; } });
    return res.filter(function (r) { return !r.miss; }).map(function (r) { return { text: r.text, x: r.x + r.w / 2, y: r.y, alt: r.y }; });
  }
  function renderScene() {
    var v = RV.view(layoutWithClues(), cur.watchRoom || cur.player.loc); cur.rv = v; $('roomSvg').innerHTML = v.svg;
    cur.rect = LAYOUT.room(cur.watchRoom || cur.player.loc);
    /* 家具名稱另外疊一層在人物之上（SVG 裡那份用 CSS 藏起來），人站過去也看得到字；要在 cur.rect 設好之後才算得出位置 */
    (function () { var lay = $('fLabels'); if (!lay) { lay = document.createElement('div'); lay.id = 'fLabels'; $('sceneBox').appendChild(lay); }
      lay.innerHTML = furnLabelsFor(cur.watchRoom || cur.player.loc).map(function (o) { return '<div class="fLabel" data-alt="' + pct(o.alt, 'y') + '" style="left:' + pct(o.x, 'x') + ';top:' + pct(o.y, 'y') + '">' + esc(o.text) + '</div>'; }).join(''); })();
    $('pins').innerHTML = v.pins.map(function (p) { var c = cur.world.clues.filter(function (x) { return x.id === p.clue; })[0]; return '<button class="pin" data-clue="' + esc(p.clue) + '" style="left:' + pct(p.x, 'x') + ';top:' + pct(p.y, 'y') + '">🔎 線索 ' + esc(p.clue) + '</button>'; }).join('');
    (function () { var pins = Array.prototype.map.call($('pins').querySelectorAll('[data-clue]'), function (b) { return b.getBoundingClientRect(); });
      Array.prototype.forEach.call(document.querySelectorAll('#fLabels .fLabel'), function (l) {
        function hit() { var r = l.getBoundingClientRect(); return pins.some(function (p) { return r.left < p.right && r.right > p.left && r.top < p.bottom && r.bottom > p.top; }); }
        if (!hit()) return; var old = l.style.top; l.style.top = l.dataset.alt; if (hit()) { l.style.top = old; l.style.display = 'none'; }
      }); })();   /* 家具名稱不要壓在線索牌上：量實際位置，壓到就換邊，再壓到就不顯示 */
    Array.prototype.forEach.call($('pins').querySelectorAll('[data-clue]'), function (b) { b.onclick = function () { if(LAYOUT.room(cur.player.loc).type==='hall'||LAYOUT.room(cur.player.loc).type==='outside'){toast('走道上不能讀線索，請先進入一間房。');return;}cur.selClue = b.dataset.clue; S.switchTab('clue'); if (cur.role === 'member') DB.appendEvent(cur.code, { kind: 'clue-open', env: APP.me.sid, clue: b.dataset.clue }); }; });
    Array.prototype.forEach.call(Object.keys(cur.tokens), function (k) { cur.tokens[k].remove(); }); cur.tokens = {};
  }
  function pct(v, axis) { var r = cur.rect; return axis === 'x' ? ((v + 8) / (r.w + 16) * 100) + '%' : ((v + 8) / (r.h + 16) * 100) + '%'; }

  /* ───── 點擊互動（手機）：點人、點家具都彈一張小卡；動作都在卡上 ───── */
  function hidePop() { var p = $('popCard'); if (p) p.remove(); }
  S.hidePop = hidePop;
  function showPop(rx, ry, html) {   /* rx, ry：房間內相對座標 */
    hidePop(); var p = document.createElement('div'); p.id = 'popCard'; p.className = 'popCard'; p.innerHTML = html + '<button class="popClose" aria-label="關閉">×</button>';
    p.style.left = pct(rx, 'x'); p.style.top = pct(ry, 'y'); ($('sceneBox') || $('overlay')).appendChild(p);   /* 10-13：線索牌的層級拉到人物上面之後，小卡要再往上一層 */
    p.querySelector('.popClose').onclick = hidePop; p.onclick = function (e) { e.stopPropagation(); };
    /* 10-13：點在房間邊緣的人，小卡會被場景框切掉一半（測試員：入口大廳點老陳，名字少一個字）→ 量完夾回框內；上緣放不下就改放到點的下方 */
    (function () { var host = $('sceneBox') || $('overlay'), hb = host.getBoundingClientRect(), r = p.getBoundingClientRect();
      if (r.top < hb.top + 2) { p.style.transform = 'translate(-50%,10px)'; r = p.getBoundingClientRect(); }
      var dx = 0; if (r.left < hb.left + 4) dx = hb.left + 4 - r.left; else if (r.right > hb.right - 4) dx = hb.right - 4 - r.right;
      if (dx) p.style.marginLeft = Math.round(dx) + 'px'; })();
    return p;
  }
  /* 點到人物時：同一個點底下疊了好幾個人，就優先選「可以訪談的真人物」，其次才是模擬同學（模擬同學常站在警衛或護理師身上，會把點擊攔走，變成點不到要訪談的人）。 */
  function pickTokenAt(e, id) {
    try {
      var ent0 = cur.world.entityById(id); if (!e || !ent0 || ent0.kind !== 'bot' || !document.elementsFromPoint) return id;
      var stack = document.elementsFromPoint(e.clientX, e.clientY), better = null;
      stack.forEach(function (n) { var t = n.closest ? n.closest('.tok') : null; if (!t || better || !t._eid || t._eid === id) return; var en = cur.world.entityById(t._eid); if (en && en.kind !== 'bot') better = t._eid; });
      return better || id;
    } catch (x) { return id; }
  }
  function onNpcClick(id) {
    var it0 = null; cur.world.at(cur.clock.worldSec).forEach(function (it) { if (it.ent.id === id) it0 = it; }); if (!it0) return;
    var ent = it0.ent, pos = it0.pos, av = cur.world.availability(ent, pos, S.simMin()), loc = LAYOUT.room(cur.player.loc), onHall = loc && (loc.type === 'hall' || loc.type === 'outside'), here = pos.room === cur.player.loc;
    var m = cur.world.mutterFor(ent, pos, cur.clock.worldSec), lv = { free: '可以聊', short: '只能簡短聊（' + (av.reason || '正在忙') + '）', blocked: '現在不方便（' + (av.reason || '正在忙') + '）' }[av.level] || '';
    var html = '<b>' + esc(ent.name) + '</b> <span class="muted">' + esc((ent.persona && ent.persona.title) || '') + '</span><div class="popLine">正在：' + esc(pos.act || '待著') + (av.fatigue && av.fatigue.level >= 2 ? '　看起來很累' : '') + '</div>' + (m ? '<div class="popLine muted">「' + esc(m.text) + '」</div>' : '') +
      '<div class="popLine">' + (here ? esc(lv) : '在' + esc(roomName(pos.room)) + '，要走過去才問得到') + '</div><div class="row popBtns">' + (here && !onHall && av.level !== 'blocked' ? '<button data-act="intv">訪談</button>' : '') + (!here ? '<button data-act="go">走過去</button>' : '') + '<button class="ghost" data-act="note">記便利貼</button></div>';
    var r = cur.rect, p = showPop(pos.x - r.x, pos.y - r.y - 30, html);
    Array.prototype.forEach.call(p.querySelectorAll('[data-act]'), function (b) { b.onclick = function () { var a = b.dataset.act; hidePop(); if (a === 'intv') { if (onHall) { toast('走道上不能訪談，請先進入一間房。'); return; } cur.selNpc = id; S.switchTab('intv'); } else if (a === 'go') startTravel(pos.room); else if (a === 'note' && window.ERG_PANELS) window.ERG_PANELS.addOpenCard('便利貼', '觀察：' + ent.name + ' 正在' + (pos.act || '待著') + '（' + S.simTime() + '，' + roomName(pos.room) + '）'); }; });
  }
  function furnitureState(f) {
    if (f.room === 'nurse' && f.type === 'board') return '白板上寫著：3 床待評估、家屬已到';
    if (f.room === 'triage' && f.type === 'screen') return '叫號螢幕顯示 A018';
    if (f.room === 'waiting' && f.type === 'seats') { var n = cur.world.at(cur.clock.worldSec).filter(function (it) { return it.pos.room === 'waiting' && /候診|等/.test(it.pos.act || ''); }).length; return '現在有 ' + n + ' 人在等'; }
    return ({ desk: '櫃台上的動線與文件，看誰在排隊、排多久', counter: '櫃台：注意排隊方向與告示', bed: '病床：看誰在旁邊、有沒有人解釋', screen: '螢幕：上面顯示什麼、看得懂嗎', board: '白板：寫了什麼、給誰看', device: '設備：誰在操作、要等多久', sign: '告示：字夠大嗎、位置對嗎', lightbox: '燈箱／指標：從門口看得到嗎', phone: '電話：誰在用、講什麼', scanner: '掃描儀：流程卡在哪', rack: '架子：放了什麼單張', sofa: '沙發：誰坐在這裡等', stall: '隔間：隱私夠嗎', chair: '椅子：誰坐、有沒有人站著', glass: '玻璃窗：隔著窗溝通順不順', door: '門：誰進出、有沒有人卡住' })[f.type] || '可以觀察的物件';
  }
  function onFurnitureClick(f) {
    if ((cur.watchRoom || cur.player.loc) !== cur.player.loc) { toast('這是別間房的物件，先走過去再看。'); return; }
    var html = '<b>' + MM.furnitureIcon(f) + ' ' + esc(f.label || f.type) + '</b><div class="popLine">' + esc(furnitureState(f)) + '</div><div class="row popBtns"><button data-act="card">記一張勘查卡</button><button class="ghost" data-act="note">記便利貼</button></div>';
    var p = showPop(f.rx + (f.w || 30) / 2, f.ry, html);
    Array.prototype.forEach.call(p.querySelectorAll('[data-act]'), function (b) { b.onclick = function () { var a = b.dataset.act; hidePop(); if (a === 'card' && window.ERG_PANELS) { window.ERG_PANELS.prefill = { type: '勘查卡', text: (f.label || f.type) + '：' }; S.switchTab('cards'); } else if (a === 'note' && window.ERG_PANELS) window.ERG_PANELS.addOpenCard('便利貼', '看到：' + (f.label || f.type) + '，' + furnitureState(f) + '（' + S.simTime() + '，' + roomName(cur.player.loc) + '）'); }; });
  }
  $('roomSvg').addEventListener('click', function (e) {
    var t = e.target; if (!t || !t.getAttribute) return; var fi = t.getAttribute('data-f');
    if (fi === null) { hidePop(); return; }
    var f = (cur.rv && cur.rv.furniture || [])[Number(fi)]; if (f) onFurnitureClick(f);
  });
  var svgCache = {};
  function svgFor(look, key, mood) { var k = key + '|' + mood + JSON.stringify(look); if (!svgCache[k]) svgCache[k] = CH.character(look, { seed: CH.hash(key) % 97, mood: mood, size: 1 }); return svgCache[k]; }
  function renderTokens() {
    if (!cur || !cur.rect) return;
    var t = cur.clock.worldSec, simMin = S.simMin(), ov = $('overlay'), seen = {}, r = cur.rect, stageW = $('stage').clientWidth || 360, size = Math.max(44, Math.min(70, stageW / (r.w + 16) * 62));
    drawEnvironment(simMin);
    cur.world.at(t).filter(function(it){return it.pos.room===(cur.watchRoom||cur.player.loc)&&it.ent.kind!=='bot';}).map(function(it){return {ent:it.ent,pos:it.pos,av:cur.world.availability(it.ent,it.pos,simMin)};}).forEach(function (h) {
      var ent = h.ent, pos = h.pos, id = ent.id; seen[id] = true;
      var el = cur.tokens[id]; if (!el) { el = cur.tokens[id] = document.createElement('div'); el.className = 'tok'; ov.appendChild(el); el._eid = id; el.onclick = function (e) { e.stopPropagation(); onNpcClick(pickTokenAt(e, id)); }; }
      var fatigue = h.av.fatigue || { level:0 }, mood = fatigue.level >= 2 ? 'sleepy' : (h.av.level === 'blocked' ? 'busy' : 'idle'), sig = mood + size + id;
      if (el._sig !== sig) { el._sig = sig; el.innerHTML = '<div class="bubWrap"></div>' + svgFor(ent.look, ent.id, mood) + '<span class="nm"></span>'; el.querySelector('svg').style.height = size + 'px'; el.querySelector('svg').style.width = 'auto'; }
      el._tx = pos.x; el._ty = pos.y; el._room=pos.room; el.style.zIndex = String(DEPTH?DEPTH.z(pos.y):Math.round(pos.y));
      el.className = 'tok ' + (pos.state === 'move' ? 'walk' : 'idle');
      var sp = window.ERG_FATIGUE ? window.ERG_FATIGUE.animSpeed(fatigue.level) : 1; el.style.setProperty('--walk-duration', (0.5 / sp) + 's'); el.style.setProperty('--idle-duration', (2.4 / sp) + 's');
      var focused=cur.selNpc===id||el.matches(':hover')||ent.kind==='patient',nm = el.querySelector('.nm');   /* 10-13：病患的名牌一直顯示 */
       nm.textContent = ent.name; nm.className = 'nm ' + h.av.level;nm.style.display=focused?'inline-block':'none';
      var m = cur.world.mutterFor(ent, pos, t), bw = el.querySelector('.bubWrap'); bw.innerHTML = (pos.act&&focused?'<div class="act">'+esc(pos.act)+'</div>':'')+(m&&focused ? '<div class="bub ' + (m.kind === 'shout' ? 'shout' : (m.kind === 'thought' ? 'thought' : '')) + '">' + esc(m.text) + '</div>' : '');
    });
    Object.keys(cur.tokens).forEach(function (id) { if (!seen[id] && id !== 'me') { cur.tokens[id].remove(); delete cur.tokens[id]; } });
    var items = [], bounds = {}; LAYOUT.ROOMS.forEach(function (rr) { bounds[rr.id] = rr; });
    var me = cur.tokens.me; if (!me) { me = cur.tokens.me = document.createElement('div'); me.className = 'tok me idle'; ov.appendChild(me); }
    var look = AV.toCharLook(APP.me.profile.avatar.look), msig = JSON.stringify(look) + size;
    if (me._sig !== msig) { me._sig = msig; me.innerHTML = svgFor(look, 'me:' + APP.me.sid, 'idle'); me.querySelector('svg').style.height = size + 'px'; me.querySelector('svg').style.width = 'auto'; }
    var ids = Object.keys(cur.tokens); ids.forEach(function (id) { var el = cur.tokens[id]; var wx = id === 'me' ? cur.me.x : el._tx, wy = id === 'me' ? cur.me.y : el._ty; if (wx !== undefined) if(id==='me'&&(cur.watchRoom||cur.player.loc)!==cur.player.loc)return; items.push({ id: id, x: wx, y: wy, room: id==='me'?cur.player.loc:el._room, fixed: id === 'me' }); });
    /* 障礙物：線索牌（兩排兩欄，整塊牌子都要露出來）與告示類家具（上面有字），人物會被推到旁邊 */
    cur.world.clues.forEach(function (c) { var q = LAYOUT.abs(c.pin.room, c.pin.rx, c.pin.ry); [[20, 34], [56, 34], [20, 84], [56, 84]].forEach(function (o, k) { items.push({ id: 'pin:' + c.id + ':' + k, x: q.x + o[0], y: q.y + o[1], room: c.pin.room, fixed: true }); }); });
    (LAYOUT.FURNITURE || []).forEach(function (f, k) { if (f.type !== 'sign' && f.type !== 'board' && f.type !== 'screen' && f.type !== 'lightbox') return; var rm0 = LAYOUT.room(f.room); if (!rm0) return; items.push({ id: 'sign:' + k, x: rm0.x + f.rx + (f.w || 30) / 2, y: rm0.y + f.ry + (f.h || 20) + 40, room: f.room, fixed: true }); });
    var out = window.ERG_SPREAD.spread(items, { iter: 8, rx: 60, ry: 30, bounds: bounds });
    ids.forEach(function (id) { var el = cur.tokens[id], o = out[id]; if (!o) return; el.style.left = pct(o.x - r.x, 'x'); el.style.top = pct(o.y - r.y, 'y'); });
    me._room=cur.player.loc;me.style.display=(cur.watchRoom||cur.player.loc)===cur.player.loc?'':'none';me.style.zIndex = String(DEPTH?DEPTH.z(cur.me.y):Math.round(cur.me.y));
    var tag=cur.youTag;if(!tag){tag=cur.youTag=document.createElement('div');tag.className='youTagLayer';tag.textContent='你';$('overlay').appendChild(tag);}tag.style.display=(cur.watchRoom||cur.player.loc)===cur.player.loc?'':'none';tag.style.left=pct(cur.me.x-r.x,'x');tag.style.top='calc('+pct(cur.me.y-r.y,'y')+' - '+(size+12)+'px)';tag.style.zIndex='2147483647';tag.style.opacity=(cur.walk||Date.now()-(cur._locT||0)<6000)?'1':'0';   /* 「你」標籤進房 6 秒後淡出，腳下紅圈還在 */
    var scale=$('roomSvg').getBoundingClientRect().width/(r.w+16);ids.forEach(function(id){var el=cur.tokens[id],rr=LAYOUT.room(el._room);if(!DEPTH||!rr)return;var ww=el.offsetWidth,hh=el.offsetHeight,x=id==='me'?cur.me.x:el._tx,y=id==='me'?cur.me.y:el._ty,cuts=DEPTH.cutouts(LAYOUT.FURNITURE,rr,{x:x,y:y,w:ww/scale,h:hh/scale}),rects=(cuts||[]).map(function(q){return{x:(q.x-x+ww/(2*scale))*scale,y:(q.y-y+hh*.92/scale)*scale,w:q.w*scale,h:q.h*scale};});el.style.clipPath=DEPTH.clipPath(rects,{w:ww,h:hh});});
    /* 10-13：泡泡與活動標籤畫在人物上方，人在房間最上緣時被場景框切掉一半 → 改畫到人物下方 */
    (function () { var sb = $('sceneBox').getBoundingClientRect(); ids.forEach(function (id) { var el = cur.tokens[id]; if (!el || id === 'me') return; el.classList.remove('bubDown'); var b = el.querySelector('.bub'), a = el.querySelector('.act'); if (!b && !a) return; var top = Math.min(b ? b.getBoundingClientRect().top : 1e9, a ? a.getBoundingClientRect().top : 1e9); if (top < sb.top + 2) el.classList.add('bubDown'); }); })();
  }

  function drawEnvironment(simMin) {
    var layer = $('environment'); if (!layer) return;
    var D = window.ERG_DAYLIGHT, info = D.light(simMin), profile = cur.world.data.ARRIVAL_PROFILE, ix = Math.min(11, Math.max(0, Math.floor((simMin-cur.world.data.SIM.START)/60))), rate = D.trafficRate(simMin, { arrivalRate: profile[ix] || 1, weekend: cur.world.day.weekend });
    var cars = D.cars(simMin-12, simMin+30, { seed:cur.code, arrivalRate:rate }); if(!cars.length)cars=[{id:'fallback-a',t:simMin-2,kind:'car',dir:1},{id:'fallback-b',t:simMin+2,kind:'scooter',dir:-1}];
    var html = '';   /* 10-13 楊老師：室內不分日夜、完全不加色調（原本晚上蓋一層深藍灰）；日夜改用時間旁邊的太陽／月亮 */
    /* 10-12 楊老師：車流動畫拿掉，改用一顆不會動的人潮燈號 */
    if (cur.world.sim.activeEvents(simMin).some(function(e){return e.spawn&&e.spawn.mode==='ambulance';})) html += '<i class="ambulanceCar">🚑<b></b></i>';
    cur.busy = { light: D.busyLight(rate), phase: info.phase }; layer.innerHTML=html;
  }

  /* ───── 事件 ───── */
  function refreshTicker() {
    if (!cur) return; var min = S.simMin(), tk = cur.world.sim.ticker(min, 1), t = $('ticker');
    /* 10-13：卡片優先顯示「正在發生」的最新一件；事件不在我這間房時，卡片可以點，點了直接到那間房去看 */
    var act = cur.world.sim.activeEvents(min).slice().sort(function (a, b) { return (b.start || 0) - (a.start || 0); })[0];
    var item = act ? { time: cur.world.sim.formatSim(act.start), title: act.title, text: act.text } : tk[0];
    if (!item) { t.style.display = 'none'; t.onclick = null; t.classList.remove('go'); return; }
    var rooms = act ? (act.rooms || []).filter(function (r) { var x = LAYOUT.room(r); return x && x.type === 'room'; }) : [];
    var go = rooms.length && rooms.indexOf(cur.player.loc) < 0 ? rooms[0] : null;
    t.style.display = 'block'; t.textContent = item.time + '　' + item.title + '：' + item.text + (go ? '　▶ 點這裡直接過去看（' + roomName(go) + '）' : (act ? '　（正在發生）' : ''));
    t.classList.toggle('go', !!go); if (go) t.setAttribute('role', 'button'); else t.removeAttribute('role');
    t.onclick = go ? function () { hidePop(); S.teleport(go); toTop(); toast('到了' + roomName(go) + '。'); refreshTicker(); } : null;
  }
  function eventWatch() {
    var act = cur.world.sim.activeEvents(S.simMin()), sfx = $('sfx'), guides=window.ERG_EVENT_GUIDE.build(),inRoom=((LAYOUT.room(cur.player.loc)||{}).type==='room'),here=act.filter(function(e){return (e.rooms||[]).indexOf(cur.player.loc)>=0&&(inRoom||!(e.rooms||[]).some(function(r){var x=LAYOUT.room(r);return x&&x.type==='room';}));}),far=act.filter(function(e){var g=guides.filter(function(x){return x.id===e.id;})[0];return (e.rooms||[]).indexOf(cur.player.loc)<0&&g&&g.importance===3;});
    /* 10-13：原本「重要事件＋去過它的房間」就算在場，結果人在洗手間也顯示「這間房現在：救護車到院」。手機一次只看一間房：在場才演，別處的只提示一句。 */
    var people=cur.world.at(cur.clock.worldSec).filter(function(it){return it.pos.room===cur.player.loc;}),acts=people.map(function(it){return it.ent.name+'：'+(it.pos.act||'正在忙');}).slice(0,2),clues=cur.world.clues.filter(function(c){return c.pin.room===cur.player.loc;}).length,waiters=people.filter(function(it){return it.ent.kind==='patient'&&/候診|等結果|等候/.test(it.pos.act||'');}),waitMax=0;
    waiters.forEach(function(it){(it.ent.timeline.segments||[]).forEach(function(s){if(s.kind==='idle'&&s.act===it.pos.act&&cur.clock.worldSec>=it.ent.timeline.appearAt+s.t0&&cur.clock.worldSec<=it.ent.timeline.appearAt+s.t1)waitMax=Math.max(waitMax,(cur.clock.worldSec-it.ent.timeline.appearAt-s.t0)/cur.world.data.SIM.SECONDS_PER_SIM_MIN);});});
    var tired=people.filter(function(it){var a=cur.world.availability(it.ent,it.pos,S.simMin());return a.fatigue&&a.fatigue.level>=2;})[0];
    var nowTxt='這間房現在：'+(here.length?here[0].title+'。':'')+(acts.join('；')||'暫時安靜，看看家具與線索。')+' 等候 '+waiters.length+' 人，約 '+Math.floor(waitMax)+' 分；線索 '+clues+' 張。'+(tired?' '+tired.ent.name+'看起來很累。':'')+(far.length?'　📣 別處：'+far[0].title+'（在'+(far[0].rooms||[]).filter(function(r){var x=LAYOUT.room(r);return x&&x.type==='room';}).map(roomName).join('、')+'）':'');
    cur.farTold = cur.farTold || {};
    var fresh = far.filter(function (e) { return !(cur.farTold[e.id] || cur.seenEv[e.id] || (cur.player.seenEv || {})[e.id]); });
    if (fresh.length) {
      fresh.forEach(function (e) { cur.farTold[e.id] = true; });
      var goRooms = (fresh[0].rooms || []).filter(function (r) { var x = LAYOUT.room(r); return x && x.type === 'room'; }), goTo = goRooms[0];
      toast('📣 別處發生事件：' + fresh.map(function (e) { return e.title; }).join('、') + (goTo ? '（在' + roomName(goTo) + '）。點這裡直接過去看。' : '。'),
        goTo ? function () { hidePop(); S.teleport(goTo); toTop(); } : null);
    }
    var bz=cur.busy;$('roomNow').innerHTML=(bz?'<i class="lamp" style="background:'+bz.light.color+'"></i>'+esc(bz.light.text+'・'+bz.phase)+'　':'')+esc(nowTxt);
    if (here.length) {   /* 10-13：事件字幕只顯示 5 秒，不一直蓋住房間（真機截圖：半個房間被「呼——（忙翻）」擋住） */
      var sid = String(here[0].id || here[0].title || '') + '@' + cur.player.loc;
      if (cur._sfxId !== sid) { cur._sfxId = sid; cur._sfxUntil = Date.now() + 5000; }
      if (Date.now() < cur._sfxUntil) { sfx.style.display = 'block'; sfx.textContent = COMIC.sfxFor(here[0]); } else sfx.style.display = 'none';
    } else { sfx.style.display = 'none'; cur._sfxId = ''; }
    here.forEach(function (e) { if (!cur.seenEv[e.id] && !(cur.player.seenEv || {})[e.id]) { cur.seenEv[e.id] = true; var o = {}; o[e.id] = true; cur.player.seenEv = Object.assign({}, cur.player.seenEv, o); window.ERG_EVENT_UI.startLive(cur,e,cur.player.loc);
      /* 10-13：整頁捲到面板區時，演出在畫面上方看不到 ⇒ 提示一句，點了捲回上面 */
      if ($('stage').getBoundingClientRect().bottom < 60) toast('📣 這間房正在發生：' + e.title + '。點這裡回到上面看現場。', toTop); } });
  }
  function showStrip(ev) {
    var third = ev.incident ? '警衛老陳趕到，兩個人一起被請出大門。' : (ev.text || '');
    S.openModal('<h2 style="margin-top:0">' + esc(ev.title) + '</h2><div class="strip"><div class="panel"><span class="cap">' + esc(roomName(cur.player.loc) + '　' + S.simTime()) + '</span><div style="font-size:20px;font-weight:900;margin-top:8px">' + esc(ev.title) + '</div></div><div class="panel"><div class="big">' + esc(COMIC.sfxFor(ev)) + '</div></div><div class="panel"><span class="cap">' + esc(third) + '</span></div></div>' +
      '<p class="muted" style="margin:10px 0 6px">三選一（模擬時間照走）：</p><div class="row"><button id="evWatch">看熱鬧（拿「目擊」便利貼）</button><button id="evCase" class="ghost">繼續查案</button></div>');
    $('evWatch').onclick = function () { if (window.ERG_PANELS) window.ERG_PANELS.addOpenCard('便利貼', '目擊：' + ev.title + '（' + S.simTime() + '，' + roomName(cur.player.loc) + '）'); toast('已記下一張「目擊」便利貼。'); S.closeModal(); };
    $('evCase').onclick = S.closeModal;
  }
  S.openModal = function (html) { $('modalBox').innerHTML = html; $('modal').classList.add('on'); };
  S.closeModal = function () { $('modal').classList.remove('on'); };
  $('modal').addEventListener('click', function (e) { if (e.target === $('modal')) S.closeModal(); });
})();
