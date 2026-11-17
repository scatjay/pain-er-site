/* 學習單單元的建議提問與即時提醒（H3）：純規則、不呼叫模型、不連網、不寫資料庫，點建議提問不算每日額度。
   資料＝tutor_units.json（↳F㊱）轉成 tutor_units_data.js 的全域 TUTOR_UNITS_DATA（tools/gen_unit_data.py 產生）。
   瀏覽器：全域 UnitCoach；Node：require('./unit_coach.js')。
   單元代號＝學習單檢視代號。⚠ w12＝學習單的 W1（hash #w12），不是第 12 週；第 12 週的 Figma 是 f2。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.UnitCoach = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var CODES = ['w12', 'w2', 'w3', 'w5', 'w8', 'f1', 'f2', 'f3', 'a1', 'a2', 'a3', 'ref', 'aref', 'a4', 'w16'];
  var MAX_SUGGEST = 4, COACH_PER_DAY = 30;   /* COACH_PER_DAY：學生自己打字的提問每人每天上限，與 proposal_core.js、tools/prx_common.py、figai_coach.js 同值（test 對帳） */
  var DATA = null;
  function init(d) { DATA = d && d.units ? d : null; return !!DATA; }
  function tr(x) { return String(x == null ? '' : x).trim(); }
  function unit(code) {
    if (!DATA || CODES.indexOf(code) < 0) return null;
    for (var i = 0; i < DATA.units.length; i += 1) if (DATA.units[i].unit === code) return DATA.units[i];
    return null;
  }
  /* 步驟名稱比對：取「：」前面的主標題、去空白；括號的（一）（二）留著，兩次 Claude 整合才分得開。與 tools/prx_common.py 的 norm_step 同規則 */
  function normStep(x) { return tr(x).split(/[：:]/)[0].replace(/\s+/g, ''); }
  /* 步驟參照可以是 id（v2：s1、s2… 對應學習單步驟卡順序；t1、t2… 是參考題與卡關題）或步驟名稱；id 優先。
     回傳全部對到的項目（v2 起單元內 id 與名稱都不重複，舊資料同名時仍相容）；名稱完全相同就算對到，一方是另一方開頭要兩邊都 ≥ 4 字 */
  function isId(x) { return /^[st]\d{1,2}$/.test(tr(x)); }
  function stepsOf(code, ref) {
    var u = unit(code), out = [];
    if (!u) return out;
    if (isId(ref)) { (u.byStep || []).forEach(function (x) { if (x.id === tr(ref)) out.push(x); }); return out; }
    var n = normStep(ref); if (n.length < 2) return out;
    (u.byStep || []).forEach(function (x) {
      var m = normStep(x.step);
      if (m && (m === n || (m.length >= 4 && n.length >= 4 && (m.indexOf(n) === 0 || n.indexOf(m) === 0)))) out.push(x);
    });
    return out;
  }
  function stepOf(code, ref) { var a = stepsOf(code, ref); return a.length ? a[0] : null; }
  function facts(code) { var u = unit(code); return u && Array.isArray(u.facts) ? u.facts.map(tr).filter(Boolean) : []; }
  /* 建議提問：目前這一步的題目（有的話）→ 固定兩題 → 結尾題；最多 4 題，不重複 */
  function suggest(code, stepTitle) {
    var u = unit(code); if (!u) return [];
    var out = [], sts = stepsOf(code, stepTitle);
    function add(q) { q = tr(q); if (q && out.indexOf(q) < 0 && out.length < MAX_SUGGEST) out.push(q); }
    sts.forEach(function (x) { add(x.q); });   /* 這一步的題目（同名步驟可能有好幾題；最多佔 4 題裡的 3 題，固定題與結尾題至少留一題） */
    out = out.slice(0, MAX_SUGGEST - 1);
    (u.fixed || []).forEach(add); add(u.closing);
    return out;
  }
  /* 即時提醒的條件：資料裡寫的是一句白話（停在「X」超過 N 分鐘／進入「X」…），這裡轉成 { step, min }（min＝0 表示進到那一步就出現）；轉不了回 null */
  function parseWhen(w) {
    var m = tr(w).match(/[「『](.+?)[」』]/); if (!m) return null;
    var t = tr(w).match(/超過\s*(\d+)\s*分鐘/);
    return { step: m[1], min: t ? Number(t[1]) : 0 };
  }
  /* 這一步停了幾分鐘，有沒有要跳出來的提醒（每一則在同一次進入只出一次，由畫面端記）。
     v2 的 nudges 有結構化欄位：stepId（或 step 名稱）、min（沒寫＝進入該步就出）、cond（附加條件的白話說明，例如「便條還沒有內容」，由畫面端判斷，這裡原樣帶回）；
     沒有這些欄位的舊資料退回用 when 的白話句解析 */
  function nudges(code, stepRef, dwellMin) {
    var u = unit(code), out = [], ref = tr(stepRef);
    if (!u) return out;
    (u.nudges || []).forEach(function (x, i) {
      var id = tr(x.stepId), nm = tr(x.step), min = x.min != null ? Number(x.min) || 0 : null;
      if (!id && !nm) { var p = parseWhen(x.when); if (!p) return; nm = p.step; if (min == null) min = p.min; }
      var hit = isId(ref) ? (id && id === ref) : (nm && normStep(ref).length >= 2 && (normStep(nm) === normStep(ref) || (normStep(nm).length >= 4 && normStep(ref).length >= 4 && (normStep(nm).indexOf(normStep(ref)) === 0 || normStep(ref).indexOf(normStep(nm)) === 0))));
      if (!hit && isId(ref) && !id) hit = false;
      if (hit && (Number(dwellMin) || 0) >= (min || 0)) out.push({ id: code + '.n' + i, text: tr(x.text), cond: tr(x.cond) });
    });
    return out;
  }
  /* 學生自己打字的提問：每人每天 COACH_PER_DAY 次、所有單元合計（前端先擋；後端 tools/prx_coach.py 用同一份用量再擋一次） */
  function typedLeft(used) { return Math.max(0, COACH_PER_DAY - (Number(used) || 0)); }
  function typedPayload(code, stepTitle, ask) {   /* 寫進 prx/{場次}/coach/{學號}/q/{時間} 的內容；kind 固定 hint */
    return { kind: 'hint', level: 1, target: 'dir', n: 0, key: '', unit: code, step: tr(stepTitle).slice(0, 40), ask: tr(ask).slice(0, 300), t: Date.now() };
  }
  return { CODES: CODES, COACH_PER_DAY: COACH_PER_DAY, init: init, unit: unit, normStep: normStep, stepOf: stepOf, stepsOf: stepsOf, facts: facts, isId: isId, suggest: suggest, parseWhen: parseWhen, nudges: nudges, typedLeft: typedLeft, typedPayload: typedPayload };
});
