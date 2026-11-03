/* 共同提案牆的資料存取：只依賴 Firebase ref 的 child／set／update／remove／on／off／once，
   所以 Node 測試、?local=1（localStorage）與正式 Firebase 都用同一份程式（root 換掉而已）。
   root＝頂層 prw/{場次}。只寫新節點 prw/…，不碰 er／sbx／prx（採納行寫進提案室走 proposal_store 既有的 saveProto，不在這裡）。
   寫入形狀和規則草案（docs/PROPOSAL_WALL_RULES_DRAFT.md）一致：
     建牆＝meta 一次整包寫（成員只有牆主、n=1）；加成員＝meta 多路徑更新 {n, members/學號, req/學號:null}（只有牆主）；
     加卡＝cards/{id} 整張寫一次；移動＝cards/{id} 只更新 x、y；採納＝cards/{id}/adopt 只新增一次。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./proposal_wall.js'));
  else root.ERG_WALL_STORE = factory(root.ERG_WALL);
})(typeof self !== 'undefined' ? self : this, function (W) {
  'use strict';
  function val(snap) { return (snap && typeof snap.val === 'function') ? snap.val() : snap; }
  function clean(v) { return v === undefined ? null : JSON.parse(JSON.stringify(v)); }   /* Firebase 不收 undefined */

  /* ———— 本機樹：整棵存在 localStorage 一個鍵裡；每次動作都重新讀，所以同一個瀏覽器裡的多個分頁看得到彼此，
     測試也可以把另一個瀏覽器環境的樹貼進來再呼叫 sync() ———— */
  function localTree(storage, key) {
    var listeners = [];
    function load() { try { return JSON.parse(storage.getItem(key)) || {}; } catch (e) { return {}; } }
    function prune(o) { if (!o || typeof o !== 'object') return; Object.keys(o).forEach(function (k) { prune(o[k]); if (o[k] && typeof o[k] === 'object' && !Object.keys(o[k]).length) delete o[k]; }); }
    function save(t) { prune(t); try { storage.setItem(key, JSON.stringify(t)); } catch (e) {} }
    function parts(p) { return p.split('/').filter(Boolean); }
    function get(path) { var cur = load(); parts(path).forEach(function (k) { cur = (cur && typeof cur === 'object') ? cur[k] : undefined; }); return cur === undefined ? null : cur; }
    function noUndef(v, where) { if (v === undefined) throw new Error('value argument contains undefined in ' + where); if (v && typeof v === 'object') Object.keys(v).forEach(function (k) { noUndef(v[k], where + '.' + k); }); }
    function setIn(t, path, value) {
      var ps = parts(path), cur = t, i;
      for (i = 0; i < ps.length - 1; i++) { if (!cur[ps[i]] || typeof cur[ps[i]] !== 'object') cur[ps[i]] = {}; cur = cur[ps[i]]; }
      if (value === null || value === undefined) delete cur[ps[ps.length - 1]]; else cur[ps[ps.length - 1]] = JSON.parse(JSON.stringify(value));
    }
    function fire() {
      listeners.slice().forEach(function (l) { var v = get(l.path), j = JSON.stringify(v); if (j !== l.last) { l.last = j; l.cb({ val: function () { return v === null ? null : JSON.parse(j); } }); } });
    }
    function ref(path) {
      return {
        key: parts(path).pop(),
        child: function (p) { return ref(path.replace(/\/$/, '') + '/' + p); },
        set: function (v) { noUndef(v, path); var t = load(); setIn(t, path, v); save(t); fire(); return Promise.resolve(); },
        update: function (obj) { noUndef(obj, path); var t = load(); Object.keys(obj).forEach(function (k) { setIn(t, path + '/' + k, obj[k]); }); save(t); fire(); return Promise.resolve(); },
        remove: function () { var t = load(); setIn(t, path, null); save(t); fire(); return Promise.resolve(); },
        on: function (ev, cb) { var v = get(path), l = { path: path, cb: cb, last: JSON.stringify(v) }; listeners.push(l); cb({ val: function () { return v === null ? null : JSON.parse(l.last); } }); return cb; },
        off: function (ev, cb) { listeners = listeners.filter(function (l) { return !(l.path === path && (!cb || l.cb === cb)); }); },
        once: function () { var v = get(path); return Promise.resolve({ val: function () { return v; } }); }
      };
    }
    return { ref: ref, sync: fire, raw: load, key: key };
  }

  function normWall(v) {
    if (!v || !v.meta) return null;
    var m = v.meta, meta = { host: String(m.host || ''), 'case': m['case'] || 'sms', at: Number(m.at) || 0, n: Number(m.n) || 0, members: {}, req: {} };
    Object.keys(m.members || {}).forEach(function (k) { var x = m.members[k] || {}; meta.members[k] = { name: String(x.name || k), at: Number(x.at) || 0 }; });
    Object.keys(m.req || {}).forEach(function (k) { var x = m.req[k] || {}; meta.req[k] = { name: String(x.name || k), at: Number(x.at) || 0 }; });
    var cards = {};
    Object.keys(v.cards || {}).forEach(function (id) { var c = v.cards[id]; if (c && c.t && c.by != null) cards[id] = c; });
    return { meta: meta, cards: cards };
  }

  function makeStore(opts) {
    opts = opts || {}; var root = opts.root; if (!root) throw new Error('需要 root ref');
    var now = typeof opts.now === 'function' ? opts.now : function () { return Date.now(); };
    var log = typeof opts.log === 'function' ? opts.log : function () {};
    var subs = [];
    function wref(code) { return root.child(code); }
    function on(ref, cb) { var h = ref.on('value', function (s) { cb(val(s)); }, function (e) { log('監聽被拒：' + (e && e.message)); }); subs.push([ref, h]); return function () { try { ref.off('value', h); } catch (e) {} }; }
    function fail(e) { return { ok: false, reason: 'denied', message: e && e.message ? String(e.message) : '' }; }
    return {
      watchWall: function (code, cb) { return on(wref(code), function (v) { cb(normWall(v)); }); },
      /* 建牆：已經有人用這個代碼就回 exists（呼叫端換一個代碼再試） */
      createWall: function (code, sid, name, caseId) {
        return Promise.resolve(wref(code).child('meta').once('value')).then(function (s) {
          if (val(s)) return { ok: false, reason: 'exists' };
          return Promise.resolve(wref(code).child('meta').set(clean(W.newWallMeta(sid, name, caseId, now())))).then(function () { return { ok: true }; }, fail);
        }, fail);
      },
      requestJoin: function (code, w, sid, name) {
        var r = W.requestJoin(w, sid, name, now()); if (!r.ok) return Promise.resolve(r);
        return Promise.resolve(wref(code).child('meta/' + r.path).set(clean(r.value))).then(function () { return { ok: true }; }, fail);
      },
      /* 牆主同意（或直接輸入學號加入）：一次多路徑更新 */
      addMember: function (code, w, sid, name) {
        var u = W.addMemberUpdate(w, sid, name, now()); if (!u) return Promise.resolve({ ok: false, reason: W.memberCount(w) >= W.MAX_MEMBERS ? 'full' : 'already' });
        return Promise.resolve(wref(code).child('meta').update(clean(u))).then(function () { return { ok: true }; }, fail);
      },
      declineRequest: function (code, sid) { return Promise.resolve(wref(code).child('meta/req/' + sid).remove()).then(function () { return { ok: true }; }, fail); },
      putCard: function (code, id, card) { return Promise.resolve(wref(code).child('cards/' + id).set(clean(card))).then(function () { return { ok: true }; }, fail); },
      moveCard: function (code, id, x, y) { return Promise.resolve(wref(code).child('cards/' + id).update({ x: Math.round(x), y: Math.round(y) })).then(function () { return { ok: true }; }, fail); },
      deleteCard: function (code, id) { return Promise.resolve(wref(code).child('cards/' + id).remove()).then(function () { return { ok: true }; }, fail); },
      putAdopt: function (code, id, adopt) { return Promise.resolve(wref(code).child('cards/' + id + '/adopt').set(clean(adopt))).then(function () { return { ok: true }; }, fail); },
      stop: function () { subs.forEach(function (p) { try { p[0].off('value', p[1]); } catch (e) {} }); subs = []; }
    };
  }
  return { makeStore: makeStore, localTree: localTree, normWall: normWall };
});
