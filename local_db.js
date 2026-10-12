(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ERG_DB = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

  function copy(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  function makeLocalDb(opts) {
    opts = opts || {};
    var storage = opts.storage;
    if (!storage) throw new Error('需要 storage');
    var notify = typeof opts.notify === 'function' ? opts.notify : function () {};
    var now = typeof opts.now === 'function' ? opts.now : function () { return 0; };
    var rnd = typeof opts.rnd === 'function' ? opts.rnd : function () { return 0; };
    var prefix = opts.prefix === undefined ? 'erg:' : String(opts.prefix);

    function key(kind, suffix) { return prefix + kind + (suffix === undefined ? '' : ':' + suffix); }
    function read(k) {
      var value = storage.getItem(k);
      if (value === null || value === undefined) return null;
      try { return JSON.parse(value); } catch (e) { return null; }
    }
    function write(k, value) { storage.setItem(k, JSON.stringify(value)); }
    function roomKey(code) { return key('room', String(code)); }
    function requireRoom(code) {
      var room = read(roomKey(code));
      if (!room) throw new Error('找不到房間');
      return room;
    }
    function roomCodes() {
      var result = [];
      var i;
      for (i = 0; i < storage.length; i += 1) {
        var k = storage.key(i);
        var start = prefix + 'room:';
        if (typeof k === 'string' && k.indexOf(start) === 0) result.push(k.substring(start.length));
      }
      return result;
    }
    function allRooms() {
      var result = [];
      var codes = roomCodes();
      var i;
      for (i = 0; i < codes.length; i += 1) {
        var room = read(roomKey(codes[i]));
        if (room) result.push(room);
      }
      return result;
    }
    function newCode() {
      var occupied = {};
      var codes = roomCodes();
      var i;
      for (i = 0; i < codes.length; i += 1) occupied[codes[i]] = true;
      var attempt;
      for (attempt = 0; attempt < 10000; attempt += 1) {
        var code = '';
        var j;
        for (j = 0; j < 4; j += 1) {
          var n = Math.floor(Number(rnd()) * alphabet.length);
          if (n < 0) n = 0;
          if (n >= alphabet.length) n = alphabet.length - 1;
          code += alphabet.charAt(n);
        }
        if (!occupied[code]) return code;
      }
      throw new Error('無法產生不重複的房間代碼');
    }
    function mergeOneLevel(oldValue, newValue) {
      var out = {};
      var p;
      if (oldValue && typeof oldValue === 'object' && !Array.isArray(oldValue)) {
        for (p in oldValue) if (Object.prototype.hasOwnProperty.call(oldValue, p)) out[p] = copy(oldValue[p]);
      }
      if (newValue && typeof newValue === 'object' && !Array.isArray(newValue)) {
        for (p in newValue) if (Object.prototype.hasOwnProperty.call(newValue, p)) out[p] = copy(newValue[p]);
      }
      return out;
    }

    return {
      createRoom: function (sess, env) {
        var code = newCode();
        var stamp = now();
        var room = {
          code: code,
          sess: copy(sess),
          host: String(env),
          createdAt: stamp,
          phase: 0,
          phaseStartedAt: stamp,
          members: {},
          links: {},
          draws: {},
          events: [],
          conclusions: [],
          submitted: false
        };
        room.members[String(env)] = { joinedAt: stamp };
        write(roomKey(code), room);
        notify('lobby');
        return copy(room);
      },

      joinRoom: function (code, env) {
        var room = requireRoom(code);
        var id = String(env);
        var members = room.members || {};
        var isMember = Object.prototype.hasOwnProperty.call(members, id);
        if (room.submitted || (!isMember && Number(room.phase) > 0) || (!isMember && Object.keys(members).length >= 4)) {
          return { role: 'spectator', room: copy(room) };
        }
        if (!isMember) {
          room.members = mergeOneLevel(members, {});
          room.members[id] = { joinedAt: now() };
          write(roomKey(code), room);
          notify('room:' + code);
          notify('lobby');
        }
        return { role: 'member', room: copy(room) };
      },

      getRoom: function (code) { return copy(requireRoom(code)); },

      listRooms: function (sess) {
        var rooms = allRooms();
        var out = [];
        var i;
        for (i = 0; i < rooms.length; i += 1) {
          if (rooms[i].sess === sess) out.push({
            code: rooms[i].code,
            host: rooms[i].host,
            count: Object.keys(rooms[i].members || {}).length,
            phase: rooms[i].phase,
            submitted: rooms[i].submitted
          });
        }
        out.sort(function (a, b) {
          var ra = read(roomKey(a.code));
          var rb = read(roomKey(b.code));
          return Number(rb.createdAt) - Number(ra.createdAt);
        });
        return out;
      },

      patchRoom: function (code, patch) {
        var room = requireRoom(code);
        patch = patch || {};
        var p;
        for (p in patch) {
          if (!Object.prototype.hasOwnProperty.call(patch, p)) continue;
          if (p === 'members' || p === 'links' || p === 'draws' || p === 'players') room[p] = mergeOneLevel(room[p], patch[p]);
          else room[p] = copy(patch[p]);
        }
        write(roomKey(code), room);
        notify('room:' + code);
        return copy(room);
      },

      appendEvent: function (code, ev) {
        var room = requireRoom(code);
        var event = { t: now() };
        var p;
        ev = ev || {};
        for (p in ev) if (Object.prototype.hasOwnProperty.call(ev, p)) event[p] = copy(ev[p]);
        room.events = (room.events || []).concat([event]);
        write(roomKey(code), room);
        notify('room:' + code);
        return copy(event);
      },

      setPhase: function (code, phase) {
        var room = requireRoom(code);
        room.phase = phase;
        room.phaseStartedAt = now();
        write(roomKey(code), room);
        notify('room:' + code);
        notify('lobby');
        return copy(room);
      },

      putScene: function (code, elements) {
        requireRoom(code);
        write(key('scene', String(code)), elements);
        notify('scene:' + code);
        return copy(elements);
      },

      getScene: function (code) {
        var value = read(key('scene', String(code)));
        return value === null ? [] : copy(value);
      },

      saveSnapshot: function (code, phase, elements) {
        requireRoom(code);
        write(key('snap', String(code) + ':' + String(phase)), elements);
        notify('room:' + code);
        return copy(elements);
      },

      getSnapshot: function (code, phase) {
        var value = read(key('snap', String(code) + ':' + String(phase)));
        return value === null ? null : copy(value);
      },

      snapshotPhases: function (code) {
        var start = key('snap', String(code) + ':');
        var phases = [];
        var i;
        for (i = 0; i < storage.length; i += 1) {
          var k = storage.key(i);
          if (typeof k === 'string' && k.indexOf(start) === 0) {
            var n = Number(k.substring(start.length));
            if (isFinite(n) && phases.indexOf(n) < 0) phases.push(n);
          }
        }
        phases.sort(function (a, b) { return a - b; });
        return phases;
      },

      submitRoom: function (code, pkg) {
        var room = requireRoom(code);
        if (room.submitted) throw new Error('已提交');
        write(key('sub', String(code)), pkg);
        room.submitted = true;
        room.phase = 6;
        room.phaseStartedAt = now();
        write(roomKey(code), room);
        notify('room:' + code);
        notify('lobby');
        return copy(pkg);
      },

      getSubmission: function (code) {
        var room = requireRoom(code);
        if (!room.submitted) throw new Error('尚未提交');
        return copy(read(key('sub', String(code))));
      },

      listSubmitted: function (sess) {
        var rooms = allRooms();
        var out = [];
        var i;
        for (i = 0; i < rooms.length; i += 1) {
          if (rooms[i].sess === sess && rooms[i].submitted) out.push({
            code: rooms[i].code,
            host: rooms[i].host,
            count: Object.keys(rooms[i].members || {}).length,
            phase: rooms[i].phase,
            submitted: rooms[i].submitted,
            snapshotPhases: this.snapshotPhases(rooms[i].code),
            members: copy(rooms[i].members || {})
          });
        }
        out.sort(function (a, b) {
          var ra = read(roomKey(a.code));
          var rb = read(roomKey(b.code));
          return Number(rb.createdAt) - Number(ra.createdAt);
        });
        return out;
      },

      getStats: function (env) {
        var stats = read(key('stats', String(env)));
        return stats === null ? { rooms: [], replays: [] } : copy(stats);
      },

      saveStats: function (env, stats) {
        write(key('stats', String(env)), stats);
        notify('stats:' + String(env));
        return copy(stats);
      }
    };
  }

  return { makeLocalDb: makeLocalDb };
});
