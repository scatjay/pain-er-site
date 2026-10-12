/* Firebase 版資料層：介面與 local_db.js 的 makeLocalDb 相同（createRoom、joinRoom、getRoom、listRooms、patchRoom、
   appendEvent、setPhase、putScene、getScene、saveSnapshot、getSnapshot、snapshotPhases、submitRoom、getSubmission、listSubmitted、getStats、saveStats）。
   讀取都是同步的：從記憶體鏡像讀；鏡像由 Firebase 的 value 監聽餵資料。寫入只動被改到的子路徑，所以多個人同時改同一間房不會互相蓋掉。
   路徑：er/{sess}/rooms/{code}、er/{sess}/scenes/{code}、er/{sess}/snaps/{code}/{phase}、er/{sess}/subs/{code}、er/{sess}/stats/{env}。
   room.events 在資料庫裡是 push 鍵的物件，讀出來時照時間排成陣列。
   只依賴 ref 的 child / set / update / push / on，所以 Node 測試可以用假的 ref。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ERG_REMOTE = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
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

  /* opts：{ root: firebase ref（已指到 er/{sess}）, sess, now, rnd, notify, log } */
  function makeRemoteDb(opts) {
    opts = opts || {};
    var root = opts.root; if (!root) throw new Error('需要 root ref');
    var sess = String(opts.sess || '');
    var notify = typeof opts.notify === 'function' ? opts.notify : function () {};
    var now = typeof opts.now === 'function' ? opts.now : function () { return Date.now(); };
    var rnd = typeof opts.rnd === 'function' ? opts.rnd : Math.random;
    var log = typeof opts.log === 'function' ? opts.log : function () {};
    var M = { rooms: {}, scenes: {}, snaps: {}, subs: {}, stats: {}, ready: false }, sceneSubs = {}, snapSubs = {}, subSubs = {}, statSubs = {};

    /* 規則要求登入後才能讀 ⇒ 監聽可以延後到登入完成再掛（opts.deferred，之後呼叫 attach()） */
    var attached = false;
    function attach() {
      if (attached) return; attached = true;
      root.child('rooms').on('value', function (snap) {
        var v = (snap && typeof snap.val === 'function') ? snap.val() : snap, next = v || {}, changed = [];
        Object.keys(next).forEach(function (c) { if (JSON.stringify(next[c]) !== JSON.stringify(M.rooms[c])) changed.push(c); });
        Object.keys(M.rooms).forEach(function (c) { if (!next[c]) changed.push(c); });
        M.rooms = next; M.ready = true;
        changed.forEach(function (c) { notify('room:' + c); });
        if (changed.length || !M.readyOnce) { M.readyOnce = true; notify('lobby'); }
      }, function (err) { log('rooms 監聽被拒：' + (err && err.message)); });
    }
    if (!opts.deferred) attach();
    function val(snap) { return (snap && typeof snap.val === 'function') ? snap.val() : snap; }
    function watchScene(code) {
      if (sceneSubs[code]) return; sceneSubs[code] = true;
      root.child('scenes/' + code).on('value', function (snap) { var v = val(snap); M.scenes[code] = Array.isArray(v) ? v : (v ? Object.keys(v).map(function (k) { return v[k]; }) : []); notify('scene:' + code); });
    }
    function watchSnaps(code) { if (snapSubs[code]) return; snapSubs[code] = true; root.child('snaps/' + code).on('value', function (snap) { M.snaps[code] = val(snap) || {}; notify('room:' + code); }); }
    function watchSub(code) { if (subSubs[code]) return; subSubs[code] = true; root.child('subs/' + code).on('value', function (snap) { M.subs[code] = val(snap); }); }
    function watchStats(env) { if (statSubs[env]) return; statSubs[env] = true; root.child('stats/' + env).on('value', function (snap) { M.stats[env] = val(snap); notify('stats:' + env); }); }

    function requireRoom(code) { var r = M.rooms[String(code)]; if (!r) throw new Error(M.ready ? '找不到房間' : '資料還在載入，請再試一次'); return r; }
    function newCode() {
      for (var attempt = 0; attempt < 10000; attempt += 1) {
        var code = ''; for (var j = 0; j < 4; j += 1) { var n = Math.floor(Number(rnd()) * alphabet.length); n = Math.max(0, Math.min(alphabet.length - 1, n)); code += alphabet.charAt(n); }
        if (!M.rooms[code]) return code;
      }
      throw new Error('無法產生不重複的房間代碼');
    }
    function summary(r) { return { code: r.code, host: r.host, count: Object.keys(r.members || {}).length, phase: r.phase, submitted: !!r.submitted }; }
    function sorted(list) { list.sort(function (a, b) { return Number(M.rooms[b.code].createdAt) - Number(M.rooms[a.code].createdAt); }); return list; }
    function write(path, value) { try { root.child(path).set(value); } catch (e) { log('set 失敗 ' + path + '：' + e.message); } }
    function update(path, obj) { try { root.child(path).update(obj); } catch (e) { log('update 失敗 ' + path + '：' + e.message); } }

    return {
      attach: attach,
      ready: function () { return M.ready; },
      createRoom: function (s, env) {
        var code = newCode(), stamp = now();
        var room = { code: code, sess: s, host: String(env), createdAt: stamp, phase: 0, phaseStartedAt: stamp, members: {}, links: {}, draws: {}, events: {}, conclusions: [], submitted: false };
        room.members[String(env)] = { joinedAt: stamp };
        M.rooms[code] = copy(room); write('rooms/' + code, room); notify('lobby');
        return viewRoom(room);
      },
      joinRoom: function (code, env) {
        var room = requireRoom(code), id = String(env), members = room.members || {}, isMember = Object.prototype.hasOwnProperty.call(members, id);
        if (room.submitted || (!isMember && Number(room.phase) > 0) || (!isMember && Object.keys(members).length >= 4)) return { role: 'spectator', room: viewRoom(room) };
        if (!isMember) { room.members = members; members[id] = { joinedAt: now() }; write('rooms/' + code + '/members/' + id, members[id]); notify('room:' + code); notify('lobby'); }
        return { role: 'member', room: viewRoom(room) };
      },
      getRoom: function (code) { return viewRoom(requireRoom(code)); },
      listRooms: function (s) { return sorted(Object.keys(M.rooms).filter(function (c) { return M.rooms[c].sess === s; }).map(function (c) { return summary(M.rooms[c]); })); },
      patchRoom: function (code, patch) {
        var room = requireRoom(code), upd = {}; patch = patch || {};
        Object.keys(patch).forEach(function (p) {
          if (p === 'members' || p === 'links' || p === 'draws' || p === 'players') {
            room[p] = room[p] || {};
            Object.keys(patch[p] || {}).forEach(function (k) { room[p][k] = copy(patch[p][k]); upd[p + '/' + k] = copy(patch[p][k]); });
          } else { room[p] = copy(patch[p]); upd[p] = copy(patch[p]); }
        });
        if (Object.keys(upd).length) update('rooms/' + code, upd);
        notify('room:' + code);
        return viewRoom(room);
      },
      appendEvent: function (code, ev) {
        var room = requireRoom(code), event = { t: now() }; ev = ev || {};
        Object.keys(ev).forEach(function (p) { event[p] = copy(ev[p]); });
        var ref = root.child('rooms/' + code + '/events').push(), key = ref.key || ('k' + event.t + Math.floor(rnd() * 1e6));
        if (!room.events || Array.isArray(room.events)) room.events = {};
        room.events[key] = copy(event); try { ref.set(event); } catch (e) { log('push 失敗：' + e.message); }
        notify('room:' + code);
        return copy(event);
      },
      setPhase: function (code, phase) { var room = requireRoom(code); room.phase = phase; room.phaseStartedAt = now(); update('rooms/' + code, { phase: phase, phaseStartedAt: room.phaseStartedAt }); notify('room:' + code); notify('lobby'); return viewRoom(room); },
      putScene: function (code, elements) { requireRoom(code); watchScene(code); M.scenes[code] = copy(elements); write('scenes/' + code, elements); notify('scene:' + code); return copy(elements); },
      getScene: function (code) { watchScene(code); var v = M.scenes[String(code)]; return v ? copy(v) : []; },
      saveSnapshot: function (code, phase, elements) { requireRoom(code); watchSnaps(code); M.snaps[code] = M.snaps[code] || {}; M.snaps[code][String(phase)] = copy(elements); write('snaps/' + code + '/' + phase, elements); notify('room:' + code); return copy(elements); },
      getSnapshot: function (code, phase) { watchSnaps(code); var s = M.snaps[String(code)]; return s && s[String(phase)] ? copy(s[String(phase)]) : null; },
      snapshotPhases: function (code) { watchSnaps(code); var s = M.snaps[String(code)] || {}; return Object.keys(s).map(Number).filter(isFinite).sort(function (a, b) { return a - b; }); },
      submitRoom: function (code, pkg) {
        var room = requireRoom(code); if (room.submitted) throw new Error('已提交');
        watchSub(code); M.subs[code] = copy(pkg); write('subs/' + code, pkg);
        room.submitted = true; room.phase = 6; room.phaseStartedAt = now(); update('rooms/' + code, { submitted: true, phase: 6, phaseStartedAt: room.phaseStartedAt });
        notify('room:' + code); notify('lobby'); return copy(pkg);
      },
      getSubmission: function (code) { var room = requireRoom(code); if (!room.submitted) throw new Error('尚未提交'); watchSub(code); return copy(M.subs[String(code)] || null); },
      listSubmitted: function (s) {
        var self = this;
        return sorted(Object.keys(M.rooms).filter(function (c) { return M.rooms[c].sess === s && M.rooms[c].submitted; }).map(function (c) { var o = summary(M.rooms[c]); o.snapshotPhases = self.snapshotPhases(c); o.members = copy(M.rooms[c].members || {}); return o; }));
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
    function fire() { Object.keys(listeners).forEach(function (p) { var v = get(p); listeners[p].forEach(function (cb) { cb({ val: function () { return v === null ? null : JSON.parse(JSON.stringify(v)); } }); }); }); }
    function ref(path) {
      return {
        key: path.split('/').pop(),
        child: function (p) { return ref(path.replace(/\/$/, '') + '/' + p); },
        set: function (v) { setAt(path, v); },
        update: function (obj) { Object.keys(obj).forEach(function (k) { setAt(path + '/' + k, obj[k]); }); },
        push: function () { pushN += 1; return ref(path + '/p' + String(100000 + pushN)); },
        on: function (ev, cb) { listeners[path] = listeners[path] || []; listeners[path].push(cb); var v = get(path); cb({ val: function () { return v === null ? null : JSON.parse(JSON.stringify(v)); } }); },
        off: function () { delete listeners[path]; }
      };
    }
    return { ref: ref, tree: tree, get: get };
  }

  return { makeRemoteDb: makeRemoteDb, fakeRoot: fakeRoot, eventsArray: eventsArray };
});
