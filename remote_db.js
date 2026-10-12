/* Firebase 版資料層：介面與 local_db.js 的 makeLocalDb 相同（createRoom、joinRoom、getRoom、listRooms、patchRoom、
   appendEvent、setPhase、putScene、getScene、saveSnapshot、getSnapshot、snapshotPhases、submitRoom、getSubmission、listSubmitted、getStats、saveStats）。
   讀取都是同步的：從記憶體鏡像讀；鏡像由 Firebase 的 value 監聽餵資料。寫入只動被改到的子路徑，所以多個人同時改同一間房不會互相蓋掉。
   路徑：er/{sess}/lobby/{code}（大廳索引，很小）、er/{sess}/rooms/{code}（整間房）、er/{sess}/scenes/{code}、er/{sess}/snaps/{code}/{phase}、er/{sess}/subs/{code}、er/{sess}/stats/{env}。
   room.events 在資料庫裡是 push 鍵的物件，讀出來時照時間排成陣列。
   只依賴 ref 的 child / set / update / push / on，所以 Node 測試可以用假的 ref。

   10-13 流量改版（免費方案每月只有 10 GB 下載）：
   原本每個分頁都監聽整個場次的 rooms，任何人存一次進度，全場次每個人都會收到一份（N 個人就是 N×N）。
   現在大廳只監聽 lobby 索引（每間房約 200 位元組：代碼、房主、案例、成員名單）；整間房的資料只有「我是成員」或「我正要進去」的房間才監聽。
   別人的房間在還沒進去之前，getRoom 回傳由索引組出來的精簡版（有 members、case、shift，沒有 players 與 events，_stub: true）。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ERG_REMOTE = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  var LOBBY_FIELDS = ['code', 'sess', 'host', 'createdAt', 'case', 'dow', 'shift', 'phase', 'submitted', 'cls', 'hostName'];
  function copy(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
  function eventsArray(ev) {
    if (!ev) return [];
    if (Array.isArray(ev)) return copy(ev);
    var out = Object.keys(ev).map(function (k) { return ev[k]; });
    out.sort(function (a, b) { return Number(a.t) - Number(b.t); });
    return copy(out);
  }
  /* Firebase 不存空陣列與空物件：讀出來補回預設欄位 */
  function viewRoom(r) {
    if (!r) return null; var o = copy(r); o.events = eventsArray(r.events);
    ['members', 'links', 'draws', 'players'].forEach(function (k) { if (!o[k] || typeof o[k] !== 'object') o[k] = {}; });
    ['conclusions', 'mcards'].forEach(function (k) { if (!Array.isArray(o[k])) o[k] = o[k] ? Object.keys(o[k]).map(function (i) { return o[k][i]; }) : []; });
    return o;
  }
  function lobbyOf(room) {
    var o = {}; LOBBY_FIELDS.forEach(function (k) { if (room[k] !== undefined) o[k] = copy(room[k]); });
    o.members = {}; Object.keys(room.members || {}).forEach(function (id) { o.members[id] = 1; });
    return o;
  }
  function stubOf(l) {
    var o = copy(l); o.members = {}; Object.keys(l.members || {}).forEach(function (id) { o.members[id] = { joinedAt: 0 }; });
    o._stub = true; return o;
  }

  /* opts：{ root: firebase ref（已指到 er/{sess}）, sess, now, rnd, notify, log, me: 回傳目前學號的函式（登入後才有） } */
  function makeRemoteDb(opts) {
    opts = opts || {};
    var root = opts.root; if (!root) throw new Error('需要 root ref');
    var sess = String(opts.sess || '');
    var notify = typeof opts.notify === 'function' ? opts.notify : function () {};
    var now = typeof opts.now === 'function' ? opts.now : function () { return Date.now(); };
    var rnd = typeof opts.rnd === 'function' ? opts.rnd : Math.random;
    var log = typeof opts.log === 'function' ? opts.log : function () {};
    var me = typeof opts.me === 'function' ? opts.me : function () { return null; };
    var watchAll = !!opts.watchAll;      /* 老師後台：一個人看全部房間，照舊監聽整個 rooms（學生端不要開） */
    var M = { rooms: {}, lobby: {}, scenes: {}, snaps: {}, subs: {}, stats: {}, ready: false }, roomSubs = {}, roomOk = {}, sceneOk = {}, sceneSubs = {}, snapSubs = {}, subSubs = {}, statSubs = {};

    function val(snap) { return (snap && typeof snap.val === 'function') ? snap.val() : snap; }
    function isMember(l, id) { return !!(id !== null && id !== undefined && l && l.members && Object.prototype.hasOwnProperty.call(l.members, String(id))); }
    /* 整間房：只在需要的時候才監聽 */
    function watchRoom(code) {
      code = String(code); if (roomSubs[code]) return; roomSubs[code] = true;
      root.child('rooms/' + code).on('value', function (snap) {
        var v = val(snap);
        if (v) M.rooms[code] = v; else delete M.rooms[code];
        roomOk[code] = true;
        notify('room:' + code); notify('lobby');
      }, function (err) { roomSubs[code] = false; log('room ' + code + ' 監聽被拒：' + (err && err.message)); });
    }
    function watchMine() { var id = me(); if (id === null || id === undefined) return; Object.keys(M.lobby).forEach(function (c) { if (isMember(M.lobby[c], id)) watchRoom(c); }); }

    /* 規則要求登入後才能讀 ⇒ 監聽可以延後到登入完成再掛（opts.deferred，之後呼叫 attach()） */
    var attached = false;
    function attach() {
      if (attached) { watchMine(); return; } attached = true;
      if (watchAll) {
        root.child('rooms').on('value', function (snap) {
          var next = val(snap) || {}, changed = [];
          Object.keys(next).forEach(function (c) { if (JSON.stringify(next[c]) !== JSON.stringify(M.rooms[c])) changed.push(c); });
          Object.keys(M.rooms).forEach(function (c) { if (!next[c]) changed.push(c); });
          M.rooms = next; M.lobby = {}; Object.keys(next).forEach(function (c) { if (next[c] && typeof next[c] === 'object') M.lobby[c] = lobbyOf(next[c]); }); M.ready = true;
          changed.forEach(function (c) { notify('room:' + c); });
          if (changed.length || !M.readyOnce) { M.readyOnce = true; notify('lobby'); }
        }, function (err) { log('rooms 監聽被拒：' + (err && err.message)); });
        return;
      }
      root.child('lobby').on('value', function (snap) {
        var next = val(snap) || {}, changed = [];
        Object.keys(next).forEach(function (c) { if (JSON.stringify(next[c]) !== JSON.stringify(M.lobby[c])) changed.push(c); });
        Object.keys(M.lobby).forEach(function (c) { if (!next[c]) changed.push(c); });
        M.lobby = next; M.ready = true;
        watchMine();
        changed.forEach(function (c) { if (!M.rooms[c]) notify('room:' + c); });
        if (changed.length || !M.readyOnce) { M.readyOnce = true; notify('lobby'); }
      }, function (err) { log('lobby 監聽被拒：' + (err && err.message)); });
    }
    if (!opts.deferred) attach();
    function watchScene(code) {
      if (sceneSubs[code]) return; sceneSubs[code] = true;
      root.child('scenes/' + code).on('value', function (snap) { var v = val(snap); M.scenes[code] = Array.isArray(v) ? v : (v ? Object.keys(v).map(function (k) { return v[k]; }) : []); sceneOk[code] = true; notify('scene:' + code); });
    }
    function watchSnaps(code) { if (snapSubs[code]) return; snapSubs[code] = true; root.child('snaps/' + code).on('value', function (snap) { M.snaps[code] = val(snap) || {}; notify('room:' + code); }); }
    function watchSub(code) { if (subSubs[code]) return; subSubs[code] = true; root.child('subs/' + code).on('value', function (snap) { M.subs[code] = val(snap); }); }
    function watchStats(env) { if (statSubs[env]) return; statSubs[env] = true; root.child('stats/' + env).on('value', function (snap) { M.stats[env] = val(snap); notify('stats:' + env); }); }

    function known(code) { return !!(M.rooms[String(code)] || M.lobby[String(code)]); }
    /* 要改資料的操作需要整間房都載入了 */
    function requireRoom(code) {
      code = String(code); var r = M.rooms[code]; if (r) return r;
      if (M.lobby[code]) { watchRoom(code); throw new Error('房間資料還在載入，請再試一次'); }
      throw new Error(M.ready ? '找不到房間' : '資料還在載入，請再試一次');
    }
    /* 只要知道有這間房就可以的操作（場景、快照、讀取） */
    function anyRoom(code) {
      code = String(code); var r = M.rooms[code]; if (r) return r;
      if (M.lobby[code]) return stubOf(M.lobby[code]);
      throw new Error(M.ready ? '找不到房間' : '資料還在載入，請再試一次');
    }
    function newCode() {
      for (var attempt = 0; attempt < 10000; attempt += 1) {
        var code = ''; for (var j = 0; j < 4; j += 1) { var n = Math.floor(Number(rnd()) * alphabet.length); n = Math.max(0, Math.min(alphabet.length - 1, n)); code += alphabet.charAt(n); }
        if (!known(code)) return code;
      }
      throw new Error('無法產生不重複的房間代碼');
    }
    function summary(l) { return { code: l.code, host: l.host, count: Object.keys(l.members || {}).length, phase: l.phase, submitted: !!l.submitted, cls: l.cls || '', hostName: l.hostName || '', createdAt: l.createdAt }; }
    function sorted(list) { list.sort(function (a, b) { return Number((M.lobby[b.code] || {}).createdAt) - Number((M.lobby[a.code] || {}).createdAt); }); return list; }
    /* 寫入前一律過一次 JSON：Firebase 遇到 undefined 欄位會整筆拒絕並丟錯（Excalidraw 的元素常帶 customData: undefined）。
       10-13 以前這個錯只印成警告，結果線上模式的卡片從來沒存進資料庫，重新整理就全部不見。失敗一律記成錯誤。 */
    function clean(v) { var c = copy(v); return c === undefined ? null : c; }
    function failed(msg) { log('🔴 ' + msg); try { notify('dberror'); } catch (e) {} }
    function guard(p, what) { if (p && typeof p.catch === 'function') p.catch(function (e) { failed(what + ' 被拒：' + (e && e.message)); }); }
    function write(path, value) { try { guard(root.child(path).set(clean(value)), 'set ' + path); } catch (e) { failed('set 失敗 ' + path + '：' + e.message); } }
    function update(path, obj) { try { guard(root.child(path).update(clean(obj)), 'update ' + path); } catch (e) { failed('update 失敗 ' + path + '：' + e.message); } }
    function lobbyPatch(code, obj) { var l = M.lobby[code] = M.lobby[code] || { code: code }; Object.keys(obj).forEach(function (k) { l[k] = copy(obj[k]); }); update('lobby/' + code, obj); }

    return {
      attach: attach,
      ready: function () { return M.ready; },
      hasRoom: function (code) { return known(code); },
      watchRoom: function (code) { if (known(code)) watchRoom(code); },
      roomReady: function (code) { return !!M.rooms[String(code)]; },
      /* 畫布（卡片）是否已經從雲端載入：還沒載入就記卡片，會用不完整的畫布蓋掉雲端原本的 */
      sceneReady: function (code) { watchScene(String(code)); return !!sceneOk[String(code)]; },
      createRoom: function (s, env) {
        var code = newCode(), stamp = now();
        var room = { code: code, sess: s, host: String(env), createdAt: stamp, phase: 0, phaseStartedAt: stamp, members: {}, links: {}, draws: {}, events: {}, conclusions: [], submitted: false };
        room.members[String(env)] = { joinedAt: stamp };
        M.rooms[code] = copy(room); M.lobby[code] = lobbyOf(room); sceneOk[code] = true; M.scenes[code] = [];
        write('rooms/' + code, room); write('lobby/' + code, lobbyOf(room));
        watchRoom(code); notify('lobby');
        return viewRoom(room);
      },
      joinRoom: function (code, env) {
        code = String(code); var room = anyRoom(code), id = String(env), members = room.members || {}, mine = Object.prototype.hasOwnProperty.call(members, id);
        watchRoom(code);
        if (room.submitted || (!mine && Number(room.phase) > 0) || (!mine && Object.keys(members).length >= 4)) return { role: 'spectator', room: viewRoom(anyRoom(code)) };
        if (!mine) {
          var m = { joinedAt: now() };
          if (M.rooms[code]) { M.rooms[code].members = M.rooms[code].members || {}; M.rooms[code].members[id] = m; }
          write('rooms/' + code + '/members/' + id, m);
          var lm = {}; lm['members/' + id] = 1; if (M.lobby[code]) { M.lobby[code].members = M.lobby[code].members || {}; M.lobby[code].members[id] = 1; }
          update('lobby/' + code, lm);
          notify('room:' + code); notify('lobby');
        }
        return { role: 'member', room: viewRoom(anyRoom(code)) };
      },
      getRoom: function (code) { return viewRoom(anyRoom(code)); },
      listRooms: function (s) { return sorted(Object.keys(M.lobby).filter(function (c) { return M.lobby[c] && M.lobby[c].sess === s; }).map(function (c) { return summary(M.lobby[c]); })); },
      patchRoom: function (code, patch) {
        code = String(code); var room = requireRoom(code), upd = {}, lob = {}; patch = patch || {};
        Object.keys(patch).forEach(function (p) {
          if (p === 'members' || p === 'links' || p === 'draws' || p === 'players') {
            room[p] = room[p] || {};
            Object.keys(patch[p] || {}).forEach(function (k) { room[p][k] = copy(patch[p][k]); upd[p + '/' + k] = copy(patch[p][k]); if (p === 'members') lob['members/' + k] = 1; });
          } else { room[p] = copy(patch[p]); upd[p] = copy(patch[p]); if (LOBBY_FIELDS.indexOf(p) >= 0) lob[p] = copy(patch[p]); }
        });
        if (Object.keys(upd).length) update('rooms/' + code, upd);
        if (Object.keys(lob).length) { var l = M.lobby[code] = M.lobby[code] || lobbyOf(room); Object.keys(lob).forEach(function (k) { if (k.indexOf('members/') === 0) { l.members = l.members || {}; l.members[k.slice(8)] = 1; } else l[k] = copy(lob[k]); }); update('lobby/' + code, lob); notify('lobby'); }
        notify('room:' + code);
        return viewRoom(room);
      },
      /* 只改自己玩家紀錄裡的幾個小欄位（例如時鐘秒數），不重寫整份紀錄 */
      patchPlayerFields: function (code, sid, fields) {
        code = String(code); var room = requireRoom(code); room.players = room.players || {}; var p = room.players[sid]; if (!p) return false;
        Object.keys(fields || {}).forEach(function (k) { p[k] = copy(fields[k]); });
        update('rooms/' + code + '/players/' + sid, copy(fields)); return true;
      },
      appendEvent: function (code, ev) {
        code = String(code); var room = requireRoom(code), event = { t: now() }; ev = ev || {};
        Object.keys(ev).forEach(function (p) { event[p] = copy(ev[p]); });
        var ref = root.child('rooms/' + code + '/events').push(), key = ref.key || ('k' + event.t + Math.floor(rnd() * 1e6));
        if (!room.events || Array.isArray(room.events)) room.events = {};
        room.events[key] = copy(event); try { guard(ref.set(clean(event)), 'push'); } catch (e) { failed('push 失敗：' + e.message); }
        notify('room:' + code);
        return copy(event);
      },
      setPhase: function (code, phase) { code = String(code); var room = requireRoom(code); room.phase = phase; room.phaseStartedAt = now(); update('rooms/' + code, { phase: phase, phaseStartedAt: room.phaseStartedAt }); lobbyPatch(code, { phase: phase }); notify('room:' + code); notify('lobby'); return viewRoom(room); },
      putScene: function (code, elements) { anyRoom(code); watchScene(code); M.scenes[code] = copy(elements); write('scenes/' + code, elements); notify('scene:' + code); return copy(elements); },
      getScene: function (code) { watchScene(code); var v = M.scenes[String(code)]; return v ? copy(v) : []; },
      saveSnapshot: function (code, phase, elements) { anyRoom(code); watchSnaps(code); M.snaps[code] = M.snaps[code] || {}; M.snaps[code][String(phase)] = copy(elements); write('snaps/' + code + '/' + phase, elements); notify('room:' + code); return copy(elements); },
      getSnapshot: function (code, phase) { watchSnaps(code); var s = M.snaps[String(code)]; return s && s[String(phase)] ? copy(s[String(phase)]) : null; },
      snapshotPhases: function (code) { watchSnaps(code); var s = M.snaps[String(code)] || {}; return Object.keys(s).map(Number).filter(isFinite).sort(function (a, b) { return a - b; }); },
      submitRoom: function (code, pkg) {
        code = String(code); var room = requireRoom(code); if (room.submitted) throw new Error('已提交');
        watchSub(code); M.subs[code] = copy(pkg); write('subs/' + code, pkg);
        room.submitted = true; room.phase = 6; room.phaseStartedAt = now(); update('rooms/' + code, { submitted: true, phase: 6, phaseStartedAt: room.phaseStartedAt });
        lobbyPatch(code, { submitted: true, phase: 6 });
        notify('room:' + code); notify('lobby'); return copy(pkg);
      },
      getSubmission: function (code) { var room = anyRoom(code); if (!room.submitted) throw new Error('尚未提交'); watchSub(code); return copy(M.subs[String(code)] || null); },
      listSubmitted: function (s) {
        var self = this;
        return sorted(Object.keys(M.lobby).filter(function (c) { return M.lobby[c].sess === s && M.lobby[c].submitted; }).map(function (c) { var o = summary(M.lobby[c]); o.snapshotPhases = self.snapshotPhases(c); o.members = copy(stubOf(M.lobby[c]).members); return o; }));
      },
      getStats: function (env) { watchStats(env); var s = M.stats[String(env)]; return s ? copy(s) : { rooms: [], replays: [] }; },
      saveStats: function (env, stats) { watchStats(env); M.stats[String(env)] = copy(stats); write('stats/' + env, stats); notify('stats:' + String(env)); return copy(stats); },
      _mirror: M
    };
  }

  /* 測試用的假 ref：記憶體樹＋同步 value 監聽。介面只包含 remote_db 用到的部分。 */
  function fakeRoot() {
    var tree = {}, listeners = {}, pushN = 0;
    function get(path) { var cur = tree; path.split('/').filter(Boolean).forEach(function (k) { cur = (cur && typeof cur === 'object') ? cur[k] : undefined; }); return cur === undefined ? null : cur; }
    function setAt(path, value) {
      var parts = path.split('/').filter(Boolean), cur = tree;
      for (var i = 0; i < parts.length - 1; i += 1) { if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {}; cur = cur[parts[i]]; }
      if (value === null || value === undefined) delete cur[parts[parts.length - 1]]; else cur[parts[parts.length - 1]] = JSON.parse(JSON.stringify(value));
      fire();
    }
    function noUndef(v, where) { if (v === undefined) throw new Error('set failed: value argument contains undefined in ' + where); if (v && typeof v === 'object') Object.keys(v).forEach(function (k) { noUndef(v[k], where + '.' + k); }); }
    function fire() { Object.keys(listeners).forEach(function (p) { var v = get(p); listeners[p].forEach(function (cb) { cb({ val: function () { return v === null ? null : JSON.parse(JSON.stringify(v)); } }); }); }); }
    function ref(path) {
      return {
        key: path.split('/').pop(),
        child: function (p) { return ref(path.replace(/\/$/, '') + '/' + p); },
        set: function (v) { noUndef(v, path); setAt(path, v); },
        update: function (obj) { noUndef(obj, path); Object.keys(obj).forEach(function (k) { setAt(path + '/' + k, obj[k]); }); },
        push: function () { pushN += 1; return ref(path + '/p' + String(100000 + pushN)); },
        on: function (ev, cb) { listeners[path] = listeners[path] || []; listeners[path].push(cb); var v = get(path); cb({ val: function () { return v === null ? null : JSON.parse(JSON.stringify(v)); } }); },
        off: function () { delete listeners[path]; }
      };
    }
    return { ref: ref, tree: tree, get: get, listeners: listeners };
  }

  return { makeRemoteDb: makeRemoteDb, fakeRoot: fakeRoot, eventsArray: eventsArray, LOBBY_FIELDS: LOBBY_FIELDS };
});
