/* 故事板的資料存取：只依賴 Firebase ref 的 child／set／update／remove／on／once／transaction，
   所以 Node 測試與 ?local=1 都用同一份程式，只是 root 換成 treeRoot（記憶體樹，可選擇存進 localStorage）。
   路徑（root＝頂層 sbx/{sess}，整個故事板不放進 er/ 底下，不影響 er/$sess 的規則）：
     sb/{房號}/{板}/cells/s{n}      格子文字與中繼資料（很小，老師列表也讀這個）
     sbth/{房號}/{板}/s{n}          縮圖（約 15 KB）
     sbimg/{房號}/{板}/s{n}         原圖（約 120 KB，只在點開時才讀）
     sbq/{YYYYMMDD}/total、u/{學號}  每日上傳計數（台灣時間）
     sbm/{房號}/{學號}               第一次開故事板當下的訪談快照（回頭再問成就用）
   板：wall（這間房的共編牆）或 u_{學號}（個人故事板）。
   用量摘要在頂層 sbops/usage，由 tools/fb_usage_publish.py 每小時寫入（服務帳號，學生端只讀）。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./sb_core.js'));
  else root.ERG_SB_STORE = factory(root.ERG_SB);
})(typeof self !== 'undefined' ? self : this, function (SB) {
  'use strict';

  function copy(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
  function val(snap) { return (snap && typeof snap.val === 'function') ? snap.val() : snap; }
  function boardKey(sid) { return sid ? 'u_' + sid : 'wall'; }

  /* ———— 記憶體樹 ref（測試用；persist 給 localStorage 用） ———— */
  function treeRoot(opts) {
    opts = opts || {}; var tree = opts.load ? (opts.load() || {}) : {}, listeners = [];
    function parts(p) { return p.split('/').filter(Boolean); }
    function get(path) { var cur = tree; parts(path).forEach(function (k) { cur = (cur && typeof cur === 'object') ? cur[k] : undefined; }); return cur === undefined ? null : cur; }
    function noUndef(v, where) { if (v === undefined) throw new Error('set failed: value argument contains undefined in ' + where); if (v && typeof v === 'object') Object.keys(v).forEach(function (k) { noUndef(v[k], where + '.' + k); }); }
    function setAt(path, value) {
      var ps = parts(path), cur = tree, i;
      for (i = 0; i < ps.length - 1; i += 1) { if (!cur[ps[i]] || typeof cur[ps[i]] !== 'object') cur[ps[i]] = {}; cur = cur[ps[i]]; }
      if (value === null || value === undefined) delete cur[ps[ps.length - 1]]; else cur[ps[ps.length - 1]] = copy(value);
    }
    function prune(o) {   /* Firebase 不存空物件與空陣列 */
      if (!o || typeof o !== 'object') return;
      Object.keys(o).forEach(function (k) { prune(o[k]); if (o[k] && typeof o[k] === 'object' && !Object.keys(o[k]).length) delete o[k]; });
    }
    function fire() {
      prune(tree); if (opts.save) opts.save(tree);
      listeners.slice().forEach(function (l) { var v = get(l.path), j = JSON.stringify(v); if (j !== l.last) { l.last = j; l.cb({ val: function () { return v === null ? null : copy(v); } }); } });
    }
    function ref(path) {
      return {
        key: parts(path).pop(),
        orderByKey: function () { return this; }, limitToLast: function () { return this; },
        child: function (p) { return ref(path.replace(/\/$/, '') + '/' + p); },
        set: function (v) { noUndef(v, path); setAt(path, v); fire(); return Promise.resolve(); },
        update: function (obj) { noUndef(obj, path); Object.keys(obj).forEach(function (k) { setAt(path + '/' + k, obj[k]); }); fire(); return Promise.resolve(); },
        remove: function () { setAt(path, null); fire(); return Promise.resolve(); },
        on: function (ev, cb) { var v = get(path), l = { path: path, cb: cb, last: JSON.stringify(v) }; listeners.push(l); cb({ val: function () { return v === null ? null : copy(v); } }); return cb; },
        off: function (ev, cb) { listeners = listeners.filter(function (l) { return !(l.path === path && (!cb || l.cb === cb)); }); },
        once: function () { var v = get(path); return Promise.resolve({ val: function () { return v === null ? null : copy(v); } }); },
        transaction: function (fn) {
          var cur = get(path), nv = fn(cur === null ? null : copy(cur));
          if (nv === undefined) return Promise.resolve({ committed: false, snapshot: { val: function () { return cur; } } });
          noUndef(nv, path); setAt(path, nv); fire();
          return Promise.resolve({ committed: true, snapshot: { val: function () { return nv; } } });
        }
      };
    }
    return { ref: ref('sbx/TEST'), raw: function () { return tree; }, get: function (p) { return get('sbx/TEST/' + p); } };
  }
  /* ?local=1：整棵樹存在 localStorage 的一個鍵裡 */
  function localRoot(storage, sess) {
    var K = 'erg:sbtree:' + sess;
    var t = treeRoot({ load: function () { try { return JSON.parse(storage.getItem(K)); } catch (e) { return null; } }, save: function (tree) { try { storage.setItem(K, JSON.stringify(tree)); } catch (e) {} } });
    return t.ref;
  }

  function makeStore(opts) {
    opts = opts || {}; var root = opts.root; if (!root) throw new Error('需要 root ref');
    var now = typeof opts.now === 'function' ? opts.now : function () { return Date.now(); };
    var log = typeof opts.log === 'function' ? opts.log : function () {};
    var subs = [];
    function on(ref, cb) { var h = ref.on('value', function (s) { cb(val(s)); }, function (e) { log('監聽被拒：' + (e && e.message)); }); subs.push([ref, h]); return function () { try { ref.off('value', h); } catch (e) {} }; }
    function cellRef(code, board, n) { return root.child('sb/' + code + '/' + board + '/cells/' + SB.slotKey(n)); }

    return {
      boardKey: boardKey,
      watchBoard: function (code, board, cb) { return on(root.child('sb/' + code + '/' + board), function (v) { cb(SB.normBoard(v)); }); },
      watchThumbs: function (code, board, cb) { return on(root.child('sbth/' + code + '/' + board), function (v) { var o = {}; Object.keys(v || {}).forEach(function (k) { o[k] = v[k] && v[k].d; }); cb(o); }); },
      /* 寫一格：只寫有變的欄位（diffPaths）。prev＝畫面上目前這格 */
      saveCell: function (code, board, prev, next) {
        var d = SB.diffPaths(prev, next); if (!Object.keys(d).length) return Promise.resolve(false);
        var upd = {}; Object.keys(d).forEach(function (k) { upd[k] = d[k]; });
        return Promise.resolve(cellRef(code, board, next.n).update(upd)).then(function () { return true; });
      },
      removeCell: function (code, board, n) {
        var s = SB.slotKey(n);
        return Promise.all([root.child('sb/' + code + '/' + board + '/cells/' + s).remove(), root.child('sbth/' + code + '/' + board + '/' + s).remove(), root.child('sbimg/' + code + '/' + board + '/' + s).remove()]);
      },
      putImage: function (code, board, n, img) {   /* img：{ full, thumb, w, h } 皆為 dataURL／數字 */
        var s = SB.slotKey(n), ts = now();
        return Promise.all([root.child('sbimg/' + code + '/' + board + '/' + s).set({ d: img.full }), root.child('sbth/' + code + '/' + board + '/' + s).set({ d: img.thumb }),
          cellRef(code, board, n).update({ img: { ar: Math.round(img.w / img.h * 1000) / 1000, w: img.w, h: img.h, ts: ts }, updatedAt: ts })]);
      },
      removeImage: function (code, board, n) {
        var s = SB.slotKey(n);
        return Promise.all([root.child('sbimg/' + code + '/' + board + '/' + s).remove(), root.child('sbth/' + code + '/' + board + '/' + s).remove(), cellRef(code, board, n).update({ img: null })]);
      },
      getFull: function (code, board, n) { return root.child('sbimg/' + code + '/' + board + '/' + SB.slotKey(n)).once('value').then(function (s) { var v = val(s); return v && v.d || null; }); },
      getThumbsOnce: function (code, board) { return root.child('sbth/' + code + '/' + board).once('value').then(function (s) { var v = val(s) || {}, o = {}; Object.keys(v).forEach(function (k) { o[k] = v[k] && v[k].d; }); return o; }); },

      /* 額度：先扣個人再扣全站；全站扣失敗要把個人退回 */
      reserve: function (sid, cfg) {
        cfg = cfg || SB.CONFIG_DEFAULTS;
        var day = SB.dayKey(now()), u = root.child('sbq/' + day + '/u/' + sid), t = root.child('sbq/' + day + '/total');
        return u.transaction(SB.bumpFn(cfg.uploadPerUserDay)).then(function (ur) {
          if (!ur.committed) return { ok: false, reason: 'user-limit' };
          return t.transaction(SB.bumpFn(cfg.uploadSiteDay)).then(function (tr) {
            if (!tr.committed) return u.transaction(SB.dropFn()).then(function () { return { ok: false, reason: 'site-limit' }; });
            return { ok: true, day: day, userUsed: val(ur.snapshot), siteUsed: val(tr.snapshot) };
          });
        });
      },
      refund: function (sid) {
        var day = SB.dayKey(now());
        return Promise.all([root.child('sbq/' + day + '/u/' + sid).transaction(SB.dropFn()), root.child('sbq/' + day + '/total').transaction(SB.dropFn())]);
      },
      watchQuota: function (sid, cb) {   /* 午夜換日：呼叫端定時重掛 */
        var day = SB.dayKey(now()), st = { userUsed: 0, siteUsed: 0, day: day }, offs = [];
        offs.push(on(root.child('sbq/' + day + '/u/' + sid), function (v) { st.userUsed = Number(v) || 0; cb(copy(st)); }));
        offs.push(on(root.child('sbq/' + day + '/total'), function (v) { st.siteUsed = Number(v) || 0; cb(copy(st)); }));
        return function () { offs.forEach(function (f) { f(); }); };
      },
      getQuotaOnce: function (day) { return root.child('sbq/' + day).once('value').then(function (s) { return val(s) || {}; }); },
      /* 用量摘要在頂層 sbops/usage；opts.opsRoot 給資料庫最上層的 ref，沒給就用場次底下的 sbops/usage（測試與本機模式） */
      watchOps: function (cb) { return on((opts.opsRoot || root).child('sbops/usage'), cb); },
      /* 第一次開故事板：記下當下的訪談快照（只寫一次） */
      ensureBaseline: function (code, sid, recIds, personas) {
        var r = root.child('sbm/' + code + '/' + sid);
        return r.once('value').then(function (s) {
          var v = val(s); if (v && v.firstOpenAt) return { firstOpenAt: v.firstOpenAt, recIds: SB.arr(v.recIds), personas: SB.arr(v.personas) };
          var o = { firstOpenAt: now(), recIds: recIds, personas: personas };
          return Promise.resolve(r.set(o)).then(function () { return o; });
        });
      },
      /* ———— 助教 ———— */
      watchConfig: function (cb) { return on((opts.opsRoot || root).child('sbops/config'), function (v) { cb(SB.config(v)); }); },
      /* 每人每日助教次數（搶名額；上限來自 sbops/config） */
      reserveCoach: function (sid, cfg) {
        cfg = cfg || SB.CONFIG_DEFAULTS; var day = SB.dayKey(now());
        return root.child('coachq/' + day + '/' + sid).transaction(SB.bumpFn(cfg.coachPerDay)).then(function (r) { return r.committed ? { ok: true, used: val(r.snapshot) } : { ok: false, reason: 'coach-limit' }; });
      },
      watchCoachUsed: function (sid, cb) { return on(root.child('coachq/' + SB.dayKey(now()) + '/' + sid), function (v) { cb(Number(v) || 0); }); },
      putCoachQ: function (sid, key, q) { return Promise.resolve(root.child('coach/' + sid + '/q/' + key).set(q)); },
      watchCoachAnswers: function (sid, cb) { var r = root.child('coach/' + sid + '/a'); if (r.orderByKey) r = r.orderByKey().limitToLast(20); return on(r, function (v) { cb(v || {}); }); },
      watchMeta: function (code, sid, cb) { return on(root.child('sbm/' + code + '/' + sid), function (v) { cb(v || {}); }); },
      /* 我拿到的 W8 成就（遊戲的成就面板讀這個節點顯示「W8 故事板」那一組） */
      putAch: function (sid, ids) { return Promise.resolve(root.child('sbach/' + sid).set({ ids: ids.join(','), n: ids.length, t: now() })); },
      setPersonas: function (code, sid, n) { return Promise.resolve(root.child('sbm/' + code + '/' + sid + '/personaCount').set(Math.max(0, Math.min(2, Number(n) || 0)))); },
      stop: function () { subs.forEach(function (p) { try { p[0].off('value', p[1]); } catch (e) {} }); subs = []; }
    };
  }

  return { makeStore: makeStore, treeRoot: treeRoot, localRoot: localRoot, boardKey: boardKey };
});
