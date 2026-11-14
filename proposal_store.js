/* 提案室的資料存取：只依賴 Firebase ref 的 child／set／remove／on／off／once，
   所以 Node 測試與 ?local=1 都用同一份程式（root 換成 sb_store.js 的記憶體樹 treeRoot／localRoot）。
   root＝頂層 prx/{場次}。只寫新節點，不碰 er/{場次}（遊戲）與 sbx/{場次}（故事板）。
   提案按案例分開存（11-01）：opts.caseId（sms／bike／trash，預設 sms）決定 doc／dirh／sub／rev 的路徑多一層 {案例}：doc/{學號}/{案例}…；
   一個 store 只服務一個案例，同一位學生換案例＝另外建一個 store，兩份提案互不覆蓋。ev／coach／coachq 仍以學號為鍵（事件與題目帶案例欄位，名額每人每天合計）。
   助手的每日名額自己算（11-01 楊老師裁示：不再和故事板助教共用）：prx/{場次}/coachq/{日}/{學號}，上限 PX.COACH_PER_DAY；後端用量記在 prx/{場次}/usage/{日}。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./proposal_core.js'));
  else root.ERG_PX_STORE = factory(root.ERG_PX);
})(typeof self !== 'undefined' ? self : this, function (PX) {
  'use strict';
  function val(snap) { return (snap && typeof snap.val === 'function') ? snap.val() : snap; }
  function clean(v) { return v === undefined ? null : JSON.parse(JSON.stringify(v)); }   /* Firebase 不收 undefined */

  function makeStore(opts) {
    opts = opts || {}; var root = opts.root; if (!root) throw new Error('需要 root ref');
    var now = typeof opts.now === 'function' ? opts.now : function () { return Date.now(); };
    var rnd = typeof opts.rnd === 'function' ? opts.rnd : Math.random;
    var log = typeof opts.log === 'function' ? opts.log : function () {};
    var subs = [], CASE = PX.caseOf(opts.caseId), PXP = opts.proto || (typeof window !== 'undefined' ? window.ERG_PROTO : null) || (typeof require === 'function' ? (function () { try { return require('./proposal_proto.js'); } catch (e) { return null; } })() : null);
    function on(ref, cb) { var h = ref.on('value', function (s) { cb(val(s)); }, function (e) { log('監聽被拒：' + (e && e.message)); }); subs.push([ref, h]); return function () { try { ref.off('value', h); } catch (e) {} }; }
    function docRef(sid) { return root.child('doc/' + sid + '/' + CASE); }

    return {
      caseId: CASE,
      watchDoc: function (sid, cb) { return on(docRef(sid), function (v) { cb(PX.normDoc(v, CASE)); }); },
      /* 外部訪談證據卡（非 sms 案例）：evi/{學號}/{案例}/{卡id}，只有本人與老師帳號讀得到；欄位長度規則與 PX.LIMITS.card* 同值 */
      watchCards: function (sid, cb) { return on(root.child('evi/' + sid + '/' + CASE), function (v) { cb(PX.normCards(v)); }); },
      saveCard: function (sid, card) {
        if (!PX.tr(card.who) || !PX.tr(card.said)) return Promise.reject(new Error('卡片要寫「誰」和「他說了什麼」'));
        var id = card.id && /^[a-z0-9]{4,12}$/.test(card.id) ? card.id : PX.newCardId(now(), rnd()), o = PX.cardForWrite(Object.assign({}, card, { t: card.t || now() }));
        return Promise.resolve(root.child('evi/' + sid + '/' + CASE + '/' + id).set(clean(o))).then(function () { return Object.assign({ id: id }, o); });
      },
      removeCard: function (sid, id) { return Promise.resolve(root.child('evi/' + sid + '/' + CASE + '/' + id).remove()); },
      saveDir: function (sid, dir) {
        var t = now(), d = { pick: dir.pick, mine: dir.mine || '', why: dir.why || '', at: t };
        return Promise.all([docRef(sid).child('dir').set(clean(d)), docRef(sid).child('updatedAt').set(t)]).then(function () { return d; });
      },
      pushDirHist: function (sid, d) { return Promise.resolve(root.child('dirh/' + sid + '/' + CASE + '/' + (d.at || now())).set(clean({ pick: d.pick, mine: d.mine || '', why: d.why || '', at: d.at || now() }))); },
      watchDirHist: function (sid, cb) { return on(root.child('dirh/' + sid + '/' + CASE), function (v) { var o = v || {}; cb(Object.keys(o).sort().map(function (k) { return o[k]; })); }); },
      saveRow: function (sid, row) {
        var r = PX.rowForWrite(row); r.t = now();
        return Promise.all([docRef(sid).child('rows/' + PX.rowKey(row.n)).set(clean(r)), docRef(sid).child('updatedAt').set(r.t)]).then(function () { return r; });
      },
      removeRow: function (sid, n) { return Promise.all([docRef(sid).child('rows/' + PX.rowKey(n)).remove(), docRef(sid).child('updatedAt').set(now())]); },
      /* 原型工作台：doc/{學號}/{案例}/proto（連結、改了什麼、自檢；規則見 docs/PROPOSAL_ROOM_RULES_DRAFT.md） */
      watchProto: function (sid, cb) { return on(docRef(sid).child('proto'), function (v) { cb(PXP ? PXP.normProto(v) : (v || {})); }); },
      saveProto: function (sid, p, lv) {
        var o = PXP ? PXP.protoForWrite(p, now(), lv) : p;
        return Promise.all([docRef(sid).child('proto').set(clean(o)), docRef(sid).child('updatedAt').set(now())]).then(function () { return o; });
      },
      /* 原型成就：prx/{場次}/ach/{學號}/{first|iter}＝時間戳，只新增不改（規則另外檢查條件）；passed 只有審核端寫 */
      setAch: function (sid, k) {
        var ref = root.child('ach/' + sid + '/' + k);
        return Promise.resolve(ref.once('value')).then(function (s) { if (val(s)) return false; return Promise.resolve(ref.set(now())).then(function () { return true; }, function () { return false; }); });
      },
      watchAch: function (sid, cb) { return on(root.child('ach/' + sid), function (v) { cb(v || {}); }); },
      saveReal: function (sid, key, v) {
        var o = { text: String(v.text || '').slice(0, PX.LIMITS.real), unknown: !!v.unknown, askWho: String(v.askWho || '').slice(0, PX.LIMITS.askWho) };
        return Promise.all([docRef(sid).child('real/' + key).set(clean(o)), docRef(sid).child('updatedAt').set(now())]);
      },
      /* 事件紀錄：只存種類與很短的標記；寫不進去不影響使用 */
      logEvent: function (sid, k, d) {
        var ev = PX.makeEvent(k, d, now(), CASE); if (!ev) return Promise.resolve(false);
        return Promise.resolve(root.child('ev/' + sid + '/' + PX.eventKey(ev, rnd())).set(clean(ev))).then(function () { return true; }, function () { return false; });
      },
      /* 一個案例一天只能送一次：sub/{學號}/{案例}/{YYYYMMDD} 只能新增不能改 */
      getSubOnce: function (sid, day) { return Promise.resolve(root.child('sub/' + sid + '/' + CASE + '/' + day).once('value')).then(function (s) { return val(s); }); },
      submit: function (sid, snap) {
        var day = PX.dayKey(snap.t), ref = root.child('sub/' + sid + '/' + CASE + '/' + day);
        return Promise.resolve(ref.once('value')).then(function (s) {
          if (val(s)) return { ok: false, reason: 'already' };
          return Promise.resolve(ref.set(clean(snap))).then(function () { return { ok: true, day: day }; });
        });
      },
      watchSubs: function (sid, cb) { return on(root.child('sub/' + sid + '/' + CASE), function (v) { var o = v || {}; cb(Object.keys(o).sort().map(function (k) { return { day: k, t: Number(o[k] && o[k].t) || 0 }; })); }); },
      watchRev: function (sid, cb) { return on(root.child('rev/' + sid + '/' + CASE), function (v) { var o = v || {}; cb(Object.keys(o).sort().map(function (k) { return Object.assign({ day: k }, o[k]); })); }); },
      /* 搶助手名額：交易式 +1，到上限就拒絕（只動 prx 自己的計數，不碰 sbx/coachq） */
      reserveCoach: function (sid) {
        var day = PX.dayKey(now());
        return Promise.resolve(root.child('coachq/' + day + '/' + sid).transaction(function (cur) { cur = Number(cur) || 0; return cur >= PX.COACH_PER_DAY ? undefined : cur + 1; }))
          .then(function (r) { return r.committed ? { ok: true, used: val(r.snapshot) } : { ok: false, reason: 'coach-limit' }; });
      },
      watchCoachUsed: function (sid, cb) { return on(root.child('coachq/' + PX.dayKey(now()) + '/' + sid), function (v) { cb(Number(v) || 0); }); },
      /* 助手問答（答案由 tools/prx_coach.py 用服務帳號寫回） */
      putCoachQ: function (sid, key, q) { return Promise.resolve(root.child('coach/' + sid + '/q/' + key).set(clean(Object.assign({}, q, { 'case': CASE })))); },
      watchCoachAnswers: function (sid, cb) { var r = root.child('coach/' + sid + '/a'); if (r.orderByKey) r = r.orderByKey().limitToLast(20); return on(r, function (v) { cb(v || {}); }); },
      stop: function () { subs.forEach(function (p) { try { p[0].off('value', p[1]); } catch (e) {} }); subs = []; }
    };
  }
  return { makeStore: makeStore };
});
