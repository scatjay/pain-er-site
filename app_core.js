/* 遊戲的資料核心：資料層（本機儲存＋分頁間廣播）、學生資料、玩家紀錄、檢核點狀態組裝。
   不碰 DOM 與 Excalidraw，所以可以在 Node 用假的儲存測試。
   資料層目前只在同一台電腦的瀏覽器內有效；跨裝置同步要等新的獨立 Firebase 專案。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./local_db.js'), require('./checkpoints.js'), require('./checklist.js'), require('./avatar.js'));
  else root.ERG_CORE = factory({ makeLocalDb: root.ERG_DB.makeLocalDb }, root.ERG_CHECKPOINTS, root.ERG_CHECKLIST, root.ERG_AVATAR);
})(typeof self !== 'undefined' ? self : this, function (DBM, CP, CL, AV) {
  'use strict';

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* —— 資料層 —— win 可以是 window，也可以是測試用的假物件 { localStorage, BroadcastChannel } */
  function makeData(win) {
    var listeners = [], cache = {}, bc = null;
    try { if (win.BroadcastChannel) bc = new win.BroadcastChannel('erg-v2'); } catch (e) { bc = null; }
    var ls = win.localStorage;
    function fire(topic) { listeners.forEach(function (f) { try { f(topic); } catch (e) { if (win.console) win.console.error(e); } }); }
    function notify(topic) { if (bc) bc.postMessage({ topic: topic }); fire(topic); }
    function allKeys() {
      var ks = {}, i, k;
      try { for (i = 0; i < ls.length; i += 1) { k = ls.key(i); ks[k] = true; } } catch (e) {}
      Object.keys(cache).forEach(function (k) { if (cache[k] === null) delete ks[k]; else ks[k] = true; });
      return Object.keys(ks);
    }
    /* BroadcastChannel 的通知會比 localStorage 的寫入更早抵達別的分頁，所以把 (鍵, 值) 一起廣播並放進記憶體快取 */
    var storage = {
      getItem: function (k) { if (Object.prototype.hasOwnProperty.call(cache, k)) return cache[k]; try { return ls.getItem(k); } catch (e) { return null; } },
      setItem: function (k, v) { cache[k] = v; try { ls.setItem(k, v); } catch (e) {} if (bc) bc.postMessage({ kv: [k, v] }); },
      removeItem: function (k) { cache[k] = null; try { ls.removeItem(k); } catch (e) {} if (bc) bc.postMessage({ kv: [k, null] }); },
      key: function (i) { return allKeys()[i]; },
      get length() { return allKeys().length; }
    };
    if (bc) bc.onmessage = function (e) { var d = e.data; if (d.kv) cache[d.kv[0]] = d.kv[1]; else fire(d.topic); };
    var DB = DBM.makeLocalDb({ storage: storage, notify: notify, now: win.Date ? win.Date.now.bind(win.Date) : Date.now, rnd: Math.random });
    return { DB: DB, storage: storage, listeners: listeners, fire: fire };
  }

  /* —— 學生資料（跨房間）—— */
  function profileKey(sid) { return 'erg2:profile:' + sid; }
  function getProfile(storage, sid) {
    try { var raw = storage.getItem(profileKey(sid)); if (raw) return JSON.parse(raw); } catch (e) {}
    return null;
  }
  function saveProfile(storage, sid, prof) { storage.setItem(profileKey(sid), JSON.stringify(prof)); }
  function validSid(s) { return /^[A-Za-z0-9_-]{3,16}$/.test(String(s || '').trim()); }

  /* —— 玩家紀錄（存在房間裡的 players[sid]）—— */
  function blankPlayer(profile, startLoc) {
    return { avatar: profile.avatar, loc: startLoc || 'entrance', worldSec: 0, speed: profile.speed || '標準', seq: 0, interviews: [], cards: [],
      conclusions: [], links: {}, finished: false, submitted: false, visit: false,
      discussion: { partners: [], checks: { read: false, diff: false, complement: false, outcome: false }, notes: { diff: '', complement: '', outcome: '' } }, confirms: {} };
  }
  /* Firebase 不存空陣列與空物件，讀回來會少欄位；這裡補回預設，讓本機版與線上版的紀錄長得一樣 */
  function normPlayer(p) {
    if (!p) return null;
    ['interviews', 'cards', 'conclusions', 'visited', 'replays'].forEach(function (k) { if (!Array.isArray(p[k])) p[k] = p[k] ? Object.keys(p[k]).map(function (i) { return p[k][i]; }) : []; });
    ['links', 'confirms', 'seenEv'].forEach(function (k) { if (!p[k] || typeof p[k] !== 'object') p[k] = {}; });
    var d = p.discussion || {}; p.discussion = { partners: Array.isArray(d.partners) ? d.partners : [], checks: d.checks || { read: false, diff: false, complement: false, outcome: false }, notes: d.notes || { diff: '', complement: '', outcome: '' } };
    p.interviews.forEach(function (r) { if (r && r.items) Object.keys(r.items).forEach(function (k) { if (r.items[k] && !Array.isArray(r.items[k].tags)) r.items[k].tags = []; if (r.items[k] && r.items[k].note === undefined) r.items[k].note = ''; }); });
    return p;
  }
  function getPlayer(room, sid) { return normPlayer((room.players && room.players[sid]) || null); }
  function savePlayer(DB, code, sid, player) { var patch = {}; patch[sid] = player; DB.patchRoom(code, { players: patch }); }
  function nextId(player, sid) { player.seq = (player.seq || 0) + 1; return '#' + sid + '-' + (player.seq < 10 ? '0' : '') + player.seq; }

  /* 手機版建立的卡片存在 room.mcards（沒有 Excalidraw），轉成跟畫布元素同形的物件，讓 listMarkers 一起讀 */
  function mcardEls(room) {
    return ((room && room.mcards) || []).map(function (m) { return { id: 'mc:' + m.id, isDeleted: false, label: { text: m.text || '' }, customData: { marker: m } }; });
  }

  /* —— 檢核點狀態 ——
     sid 參與的房間：自己開的房間＝own；別人開、且房間裡還有其他真人＝visit。
     markersByRoom：{ code: [{id,type,author,refs?}] }（從各房間的 Excalidraw 畫布取出） */
  function checkpointState(DB, sess, sid, profile, markersByRoom, caseInfo) {
    var rooms = DB.listRooms(sess).map(function (r) { return DB.getRoom(r.code); });
    var mine = rooms.filter(function (r) { return r.members && r.members[sid]; });
    var own = mine.filter(function (r) { return String(r.host) === String(sid); });
    var ownRoom = own.length ? own[own.length - 1] : null;
    var ownPlayer = ownRoom ? getPlayer(ownRoom, sid) : null;
    var sessions = [];
    mine.forEach(function (r) {
      var p = getPlayer(r, sid); if (!p) return;
      var others = Object.keys(r.members || {}).filter(function (k) { return k !== String(sid); });
      if (String(r.host) === String(sid)) sessions.push({ code: r.code, role: 'own', finished: !!p.finished, others: others });
      else sessions.push({ code: r.code, role: 'visit', finished: !!(p.visit && p.finished), others: others });
    });
    var visitRoom = mine.filter(function (r) { var p = getPlayer(r, sid); return String(r.host) !== String(sid) && p && p.visit; });
    var vr = visitRoom.length ? visitRoom[visitRoom.length - 1] : null, vp = vr ? getPlayer(vr, sid) : null;
    var disc = vp ? vp.discussion : { partners: [], checks: {} };
    var partners = (disc.partners || []).map(function (id) {
      var other = vr ? getPlayer(vr, id) : null;
      return { id: id, confirmed: !!(other && other.confirms && other.confirms[sid]) };
    });
    var interviews = ownPlayer ? ownPlayer.interviews : [];
    var links = ownPlayer ? ownPlayer.links || {} : {};
    var doneIv = interviews.filter(function (r) { return CL.progress(r).complete; });
    var haveLinks = doneIv.length > 0 && doneIv.every(function (r) { return /^https:\/\//.test(links[r.id] || ''); });
    return {
      student: { id: sid, cls: profile.cls }, case: { directions: (caseInfo && caseInfo.directions) || [] },
      markers: ownRoom ? (markersByRoom[ownRoom.code] || []) : [], interviews: interviews,
      conclusions: ownPlayer ? ownPlayer.conclusions : [],
      sessions: sessions, discussion: { room: vr ? vr.code : '', partners: partners, checks: disc.checks || {} },
      submitted: { scene: !!(ownPlayer && ownPlayer.submitted), text: !!(ownPlayer && ownPlayer.submitted), links: !!(ownPlayer && ownPlayer.submitted && haveLinks) },
      _ownRoom: ownRoom ? ownRoom.code : null
    };
  }

  /* 提交資格：第 1–5 點亮，且每個完整訪談都存了 https 連結 */
  function submitGate(state) {
    var c = CP.canSubmit(state), blockers = c.blockers.map(function (b) { return b.label + '：' + b.detail; });
    var done = state.interviews.filter(function (r) { return CL.progress(r).complete; });
    return { ok: c.ok, blockers: blockers };
  }

  return { makeData: makeData, getProfile: getProfile, saveProfile: saveProfile, validSid: validSid, blankPlayer: blankPlayer, getPlayer: getPlayer,
    savePlayer: savePlayer, nextId: nextId, mcardEls: mcardEls, checkpointState: checkpointState, submitGate: submitGate, clone: clone };
});
