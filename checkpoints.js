/* 六個檢核點：完成即通過，沒有等第。純函式，輸入學生狀態，輸出每個檢核點是否亮燈。
   state：
   { student:{ id, cls }, case:{ directions:[...] },
     markers:[{ id, type, author, round, refs? }],                 // 學生自己做的標記（含勘查卡、問號、矛盾、想法…）
     interviews:[ checklist 記錄 ],
     conclusions:[{ text, refs:[標記編號], tradeoff, direction }],
     sessions:[{ code, role:'own'|'visit', finished:boolean, others:[學號...] }],   // others＝同房間其他真人學號
     discussion:{ room, partners:[{ id, confirmed:boolean }], checks:{ read,diff,complement,outcome } },
     submitted:{ scene:boolean, text:boolean, links:boolean } } */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./checklist.js'));
  } else root.ERG_CHECKPOINTS = factory(root.ERG_CHECKLIST);
})(typeof self !== 'undefined' ? self : this, function (CHECKLIST) {
  'use strict';

  var RULES = {
    surveyTypes: ['勘查卡', '問號', '重要'], surveyMin: 3,
    interviewMin: 2,
    reasoningTypes: ['矛盾', '想法'],
    sessionsMin: 2,
    discussionChecks: ['read', 'diff', 'complement', 'outcome']
  };

  function count(list, pred) { var n = 0; list.forEach(function (x) { if (pred(x)) n += 1; }); return n; }
  function mine(list, id) { return list.filter(function (x) { return String(x.author) === String(id); }); }

  function cpSurvey(s) {
    var n = count(mine(s.markers || [], s.student.id), function (m) { return RULES.surveyTypes.indexOf(m.type) >= 0; });
    return { ok: n >= RULES.surveyMin, detail: n + ' / ' + RULES.surveyMin + ' 張' };
  }
  function cpInterview(s) {
    var done = CHECKLIST.completedPersonas(s.interviews || [], s.student.id);
    return { ok: done.length >= RULES.interviewMin, detail: done.length + ' / ' + RULES.interviewMin + ' 位' };
  }
  function cpReasoning(s) {
    var ms = mine(s.markers || [], s.student.id).filter(function (m) { return RULES.reasoningTypes.indexOf(m.type) >= 0; });
    var withRef = ms.filter(function (m) { return Array.isArray(m.refs) ? m.refs.length > 0 : true; });
    return { ok: withRef.length >= 1, detail: withRef.length + ' / 1 張（矛盾或想法，需有根據）' };
  }
  function cpConclusion(s) {
    var ids = (s.markers || []).map(function (m) { return m.id; }).concat((s.interviews || []).map(function (r) { return r.id; }));
    var list = s.conclusions || [], errs = [];
    var dirs = (s.case && s.case.directions) || [];
    if (list.length < 1) errs.push('至少一條結論');
    list.forEach(function (c, i) {
      if (!c || !String(c.text || '').trim()) errs.push('第' + (i + 1) + '條沒有內容');
      if (!Array.isArray(c.refs) || !c.refs.length) errs.push('第' + (i + 1) + '條沒有根據編號');
      else c.refs.forEach(function (r) { if (ids.indexOf(r) < 0) errs.push('第' + (i + 1) + '條的 ' + r + ' 找不到'); });
      if (!String(c.tradeoff || '').trim()) errs.push('第' + (i + 1) + '條沒寫取捨');
      if (dirs.length && dirs.indexOf(c.direction) < 0 && c.direction !== '其他') errs.push('第' + (i + 1) + '條方向無效');
    });
    return { ok: errs.length === 0, detail: errs.length ? errs.join('；') : list.length + ' 條結論都有根據', errors: errs };
  }
  function cpSessions(s) {
    var ss = s.sessions || [];
    var own = ss.filter(function (x) { return x.role === 'own' && x.finished; });
    var visits = ss.filter(function (x) { return x.role === 'visit' && x.finished && (x.others || []).length >= 1; });
    var d = s.discussion || {}, ch = d.checks || {};
    var partners = (d.partners || []).filter(function (p) { return p.confirmed && String(p.id) !== String(s.student.id); });
    var allChecked = RULES.discussionChecks.every(function (k) { return !!ch[k]; });
    var visitRoomOk = visits.some(function (v) { return v.code === d.room; });
    var ok = own.length >= 1 && visits.length >= 1 && visitRoomOk && partners.length >= 1 && allChecked;
    var parts = [];
    parts.push('自己的一場：' + (own.length >= 1 ? '✔' : '未完成'));
    parts.push('進別人進過的房：' + (visits.length >= 1 ? '✔' : '未完成'));
    parts.push('討論勾選：' + (allChecked ? '✔' : '未勾完'));
    parts.push('真人確認：' + (partners.length >= 1 ? partners.length + ' 位' : '尚無'));
    return { ok: ok, detail: parts.join('、') };
  }
  function cpSubmit(s) {
    var sub = s.submitted || {};
    return { ok: !!(sub.scene && sub.text && sub.links), detail: ['場景檔', '結論文字', '對話連結'].map(function (n, i) { return n + (sub[['scene', 'text', 'links'][i]] ? '✔' : '＿'); }).join(' ') };
  }

  var DEFS = [
    { id: 1, label: '勘查', fn: cpSurvey },
    { id: 2, label: '訪談', fn: cpInterview },
    { id: 3, label: '矛盾或假設', fn: cpReasoning },
    { id: 4, label: '我的結論', fn: cpConclusion },
    { id: 5, label: '場次與討論檢核', fn: cpSessions },
    { id: 6, label: '提交', fn: cpSubmit }
  ];

  function evaluate(state) {
    var list = DEFS.map(function (d) { var r = d.fn(state); return { id: d.id, label: d.label, ok: r.ok, detail: r.detail }; });
    return { list: list, lit: count(list, function (x) { return x.ok; }), total: list.length, passed: list.every(function (x) { return x.ok; }) };
  }

  /* 提交按鈕的門檻：前五點都亮才能提交（第六點就是提交本身） */
  function canSubmit(state) {
    var r = evaluate(state);
    var blockers = r.list.filter(function (x) { return x.id <= 5 && !x.ok; });
    return { ok: blockers.length === 0, blockers: blockers };
  }

  /* 驗證碼：由學號、通過時間與後台才有的鹽算出。鹽放在後台，前端產出的碼只作標示，後台以鹽重算比對。 */
  function verifyCode(studentId, passedAtISO, salt) {
    var str = String(studentId) + '|' + String(passedAtISO) + '|' + String(salt);
    var h = 5381, i;
    for (i = 0; i < str.length; i += 1) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
    var h2 = 52711;
    for (i = str.length - 1; i >= 0; i -= 1) h2 = ((h2 << 5) + h2 + str.charCodeAt(i)) >>> 0;
    return (h.toString(36) + h2.toString(36)).toUpperCase().slice(0, 8);
  }

  return { RULES: RULES, DEFS: DEFS, evaluate: evaluate, canSubmit: canSubmit, verifyCode: verifyCode };
});
