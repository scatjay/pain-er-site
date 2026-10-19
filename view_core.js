/* 視圖核心（Phase 0）：與 DOM 無關的「決策邏輯」——選站位、規劃路線、走路步進、點人物／家具要出現什麼、點地板要做什麼。
   純函式，輸入一律是 (world, layout, 狀態值, id)，輸出是資料；桌面 room.js 呼叫，Node 可直接測（test_view_core.js）。
   之後的 3D 視圖（view3d.js）會呼叫同一批函式，所以這裡不碰 document／window／cur，也不改傳進來的物件。
   畫面（彈窗 HTML、token div、toast、DB 事件）留在各視圖。
   手機 m.js 刻意不接（楊老師 10-19 12:48：3D 只做桌機，手機永遠 2D）。
   world：world.js 的世界（clues、graph、entityById、at、availability、mutterFor、data.SIM）。layout：layout.js。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ERG_VIEW_CORE = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var NOT_WALKABLE = /^hall|corridor|ambulance|street/;   /* 走道、救護車、街道：不能當目的地，也不能在那裡訪談 */

  /* ───── 位置 ───── */
  /* 在房裡挑一個離線索牌、駐點、家具最遠的站位（候選點固定，同一間房每次站同一處）。world 可為 null（沒線索時）。 */
  function spotIn(layout, world, roomId) {
    var st = layout.STATIONS.filter(function (s) { return s.room === roomId; });
    var rm = layout.room(roomId);
    var avoid = st.map(function (q) { return layout.abs(roomId, q.rx, q.ry); });
    if (world) world.clues.forEach(function (c) { if (c.pin.room === roomId) { var q = layout.abs(roomId, c.pin.rx, c.pin.ry); avoid.push({ x: q.x + 38, y: q.y + 17 }); } });
    (layout.FURNITURE || []).forEach(function (f) { if (f.room === roomId) avoid.push({ x: rm.x + f.rx + (f.w || 30) / 2, y: rm.y + f.ry + (f.h || 20) / 2 + 20 }); });
    if (!avoid.length) return { x: rm.x + rm.w / 2, y: rm.y + rm.h * 0.7 };
    var blocks = [];
    if (world) world.clues.forEach(function (c) { if (c.pin.room === roomId) { var q = layout.abs(roomId, c.pin.rx, c.pin.ry); blocks.push({ x: q.x - 6, y: q.y - 6, w: 88, h: 46 }); } });
    (layout.FURNITURE || []).forEach(function (f) { if (f.room === roomId && /^(sign|board|screen|lightbox)$/.test(f.type || '')) blocks.push({ x: rm.x + f.rx - 2, y: rm.y + f.ry - 2, w: (f.w || 30) + 4, h: (f.h || 20) + 4 }); });
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

  /* 導航圖上離某點最近的節點 id（roomId 有給就只看那間房的節點） */
  function nearestNode(graph, point, roomId) {
    var best = null, bd = Infinity;
    Object.keys(graph.nodes).forEach(function (id) { var n = graph.nodes[id]; if (roomId && n.room !== roomId) return; var d = Math.hypot(n.x - point.x, n.y - point.y); if (d < bd) { bd = d; best = id; } });
    return best;
  }

  /* ───── 走路 ───── */
  /* 走路速度（世界 px／真實秒）。clock.secPerMin＝一個模擬分鐘等於幾真實秒。 */
  function walkSpeed(world, clock) { return 70 * world.data.SIM.SECONDS_PER_SIM_MIN / clock.secPerMin; }

  /* 規劃路線。deps.shortestPath＝ERG_NPC.shortestPath。
     st：{ loc, me }（目前所在房間、目前座標或 null）。
     回傳 { ok:true, walk:{points,index,target,lastRoom}, seconds, target } 或 { ok:false, kind:'missing'|'remote-bad'|'remote'|'noroute' }；
     kind:'remote'＝目的地是院外的家／回診門診，呼叫端自己處理（goRemote）。 */
  function planTravel(world, layout, deps, st, roomId, speed) {
    var target = layout.room(roomId); if (!target) return { ok: false, kind: 'missing' };
    if (target.type === 'remote') return (roomId === 'home' || roomId === 'clinic') ? { ok: false, kind: 'remote', room: roomId } : { ok: false, kind: 'remote-bad' };
    var start = (st.loc === 'home' || st.loc === 'clinic') ? spotIn(layout, world, 'street') : (st.me || spotIn(layout, world, st.loc));
    var dest = spotIn(layout, world, roomId), from = nearestNode(world.graph, start), to = nearestNode(world.graph, dest, roomId) || nearestNode(world.graph, dest);
    if (!from || !to) return { ok: false, kind: 'noroute' };
    var nodes = world.graph.nodes;
    var route = nodes[from].x === nodes[to].x && nodes[from].y === nodes[to].y ? { ids: [from] } : deps.shortestPath(world.graph, from, to);
    if (!route) return { ok: false, kind: 'noroute' };
    var pts = [{ x: start.x, y: start.y }];
    route.ids.forEach(function (id) { var n = nodes[id]; if (Math.hypot(n.x - pts[pts.length - 1].x, n.y - pts[pts.length - 1].y) > 1) pts.push({ x: n.x, y: n.y }); });
    if (Math.hypot(dest.x - pts[pts.length - 1].x, dest.y - pts[pts.length - 1].y) > 1) pts.push(dest);
    var wl = 0; for (var i = 1; i < pts.length; i++) wl += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    return { ok: true, target: roomId, targetName: target.name, walk: { points: pts, index: 1, target: roomId, lastRoom: st.loc }, seconds: Math.max(1, Math.round(wl / speed)) };
  }

  /* 走一步：從 me 沿 points 從 index 起走 budget 的距離。不改傳入物件。
     回傳 { me, index, done, roomId }；roomId＝新位置所在的房間（可能為 null／走道）。 */
  function stepWalk(layout, me, points, index, budget) {
    var cur = { x: me.x, y: me.y };
    while (budget > 0 && index < points.length) {
      var a = cur, b = points[index], d = Math.hypot(b.x - a.x, b.y - a.y);
      if (d <= budget) { cur = { x: b.x, y: b.y }; budget -= d; index++; }
      else { cur = { x: a.x + (b.x - a.x) * budget / d, y: a.y + (b.y - a.y) * budget / d }; budget = 0; }
    }
    return { me: cur, index: index, done: index >= points.length, roomId: layout.roomAt(cur.x, cur.y) };
  }

  /* 傳送（快速旅行）的判斷：kind＝'missing'|'remote'|'remote-bad'|'not-room'|'same'|'go' */
  function planJump(layout, curLoc, walking, roomId) {
    var rm = layout.room(roomId); if (!rm) return { kind: 'missing' };
    if (rm.type === 'remote') return (roomId === 'home' || roomId === 'clinic') ? { kind: 'remote', room: roomId, name: rm.name } : { kind: 'remote-bad' };
    if (rm.type !== 'room') return { kind: 'not-room' };
    if (roomId === curLoc && !walking) return { kind: 'same', room: roomId, name: rm.name };
    return { kind: 'go', room: roomId, name: rm.name };
  }

  /* ───── 點擊 ───── */
  /* 該房間裡，座標 (ox, oy) 落在哪件家具上（後面的優先，與原本 forEach 覆蓋的行為一致） */
  function furnitureAt(layout, roomId, ox, oy) {
    var rm = layout.room(roomId), hit = null;
    (layout.FURNITURE || []).forEach(function (f) { if (f.room !== roomId) return; var fx = rm.x + f.rx, fy = rm.y + f.ry; if (ox >= fx && ox <= fx + (f.w || 30) && oy >= fy && oy <= fy + (f.h || 20)) hit = f; });
    return hit;
  }
  /* 點線索牌 */
  function clueAt(world, layout, ox, oy) {
    var hit = null;
    world.clues.forEach(function (c) { var p = layout.abs(c.pin.room, c.pin.rx, c.pin.ry); if (ox >= p.x - 4 && ox <= p.x + 80 && oy >= p.y - 4 && oy <= p.y + 38) hit = c; });
    return hit;
  }
  /* 點地板（不是線索牌）該做什麼：{kind:'furniture', furniture, x, y}｜{kind:'none'}｜{kind:'travel', room}｜{kind:'jump', room}
     stageMode＝'map' 是看著全地圖點房間＝直接到；'room' 維持走過去。 */
  function boardClick(layout, curLoc, stageMode, ox, oy) {
    var r = layout.roomAt(ox, oy);
    if (r && r === curLoc) {
      var f = furnitureAt(layout, r, ox, oy);
      return f ? { kind: 'furniture', furniture: f, x: ox, y: oy } : { kind: 'none' };
    }
    if (r && r !== curLoc && !NOT_WALKABLE.test(r)) return { kind: stageMode === 'map' ? 'jump' : 'travel', room: r };
    return { kind: 'none' };
  }

  /* 同一點疊了好幾個 token 時，優先選「可以訪談的真人物」（kind 不是 bot），其次才是模擬同學。
     candidates＝由上而下的 token id 清單（DOM 由 view 取）。回傳要點的 id。 */
  function pickPreferred(world, id, candidates) {
    var ent0 = world.entityById(id); if (!ent0 || ent0.kind !== 'bot') return id;
    var better = null;
    (candidates || []).forEach(function (cid) { if (better || !cid || cid === id) return; var en = world.entityById(cid); if (en && en.kind !== 'bot') better = cid; });
    return better || id;
  }

  /* 點人物的彈窗資料。st：{ loc, worldSec }；simMin 由呼叫端給（時鐘在 view）。
     回傳 null（找不到人）或 { ent, pos, av, here, onHall, mutter, levelText, actions:['intv','go','note'], goRoom, roomName }。 */
  function npcPopup(world, layout, st, id, simMin) {
    var ent = world.entityById(id); if (!ent) return null;
    var pos = null; world.at(st.worldSec).forEach(function (it) { if (it.ent.id === id) pos = it.pos; });
    if (!pos) return null;
    var av = world.availability(ent, pos, simMin), here = pos.room === st.loc, loc = layout.room(st.loc), onHall = !!(loc && (loc.type === 'hall' || loc.type === 'outside'));
    var m = world.mutterFor(ent, pos, st.worldSec);
    var levelText = { free: '可以聊', short: '只能簡短聊（' + (av.reason || '正在忙') + '）', blocked: '現在不方便（' + (av.reason || '正在忙') + '）' }[av.level] || '';
    var rmName = function (rid) { var r = layout.room(rid); return r ? r.name : rid; };
    var actions = [];
    if (here && !onHall && av.level !== 'blocked' && ent.kind !== 'bot') actions.push('intv');
    if (!here && !NOT_WALKABLE.test(pos.room)) actions.push('go');
    actions.push('note');
    return { ent: ent, pos: pos, av: av, here: here, onHall: onHall, mutter: m, levelText: levelText, actions: actions,
      roomName: rmName(pos.room), goRoom: pos.room };
  }
  /* 便利貼文字：按下「記便利貼」那一刻才組（時間要用當下的，不是彈窗開啟時的） */
  function npcNote(layout, ent, pos, simTimeText) {
    var r = layout.room(pos.room);
    return '觀察：' + ent.name + ' 正在' + (pos.act || '待著') + '（' + simTimeText + '，' + (r ? r.name : pos.room) + '）';
  }

  /* 物件的「使用中狀態」文字 */
  var FURNITURE_HINT = { desk: '櫃台上的動線與文件，看誰在排隊、排多久', counter: '櫃台：注意排隊方向與告示', bed: '病床：看誰在旁邊、有沒有人解釋', screen: '螢幕：上面顯示什麼、看得懂嗎', board: '白板：寫了什麼、給誰看', device: '設備：誰在操作、要等多久', sign: '告示：字夠大嗎、位置對嗎', lightbox: '燈箱／指標：從門口看得到嗎', phone: '電話：誰在用、講什麼', scanner: '掃描儀：流程卡在哪', rack: '架子：放了什麼單張', sofa: '沙發：誰坐在這裡等', stall: '隔間：隱私夠嗎', chair: '椅子：誰坐、有沒有人站著', glass: '玻璃窗：隔著窗溝通順不順', door: '門：誰進出、有沒有人卡住' };
  function furnitureState(world, f, worldSec) {
    if (f.room === 'nurse' && f.type === 'board') return '白板上寫著：3 床待評估、家屬已到';
    if (f.room === 'triage' && f.type === 'screen') return '叫號螢幕顯示 A018';
    if (f.room === 'waiting' && f.type === 'seats') { var n = world.at(worldSec).filter(function (it) { return it.pos.room === 'waiting' && /候診|等/.test(it.pos.act || ''); }).length; return '現在有 ' + n + ' 人在等'; }
    return FURNITURE_HINT[f.type] || '可以觀察的物件';
  }
  /* 點家具的彈窗資料 */
  function furniturePopup(world, layout, st, f) {
    var label = f.label || f.type, state = furnitureState(world, f, st.worldSec);
    return { furniture: f, label: label, state: state, actions: ['card', 'note'], cardPrefill: { type: '勘查卡', text: label + '：' } };
  }
  /* 家具便利貼：按下當下才組（狀態與時間都取當下） */
  function furnitureNote(world, layout, st, f, simTimeText) {
    var r = layout.room(st.loc);
    return '看到：' + (f.label || f.type) + '，' + furnitureState(world, f, st.worldSec) + '（' + simTimeText + '，' + (r ? r.name : st.loc) + '）';
  }

  return { NOT_WALKABLE: NOT_WALKABLE, spotIn: spotIn, nearestNode: nearestNode, walkSpeed: walkSpeed, planTravel: planTravel, stepWalk: stepWalk, planJump: planJump,
           furnitureAt: furnitureAt, clueAt: clueAt, boardClick: boardClick, pickPreferred: pickPreferred, npcPopup: npcPopup, npcNote: npcNote, furnitureNote: furnitureNote, furnitureState: furnitureState, furniturePopup: furniturePopup };
});
