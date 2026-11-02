/* 模式（新手／專家）：純函式與設定存取。畫面在 ui_level_ui.js。
   學生看到的名稱只有「模式：新手／專家」（內部編號 1＝新手、3＝專家；2＝中級還沒做，目前一律當專家）。
   預設是專家：沒選過的人畫面完全不變。
   設定：er/{場次}/profiles/{學號}/uiLevel、uiLevelAt（既有節點新增兩個欄位）＋本機 localStorage 快取；
   切換與詢問紀錄：er/{場次}/uilv/{學號}/{push} = { from, to, why, t, cls, dev, cards, days }。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ERG_UILV = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var NAMES = { 1: '新手', 3: '專家' };
  var WHY = ['self', 'ask-shown', 'ask-accept', 'ask-decline', 'up-shown', 'up-accept', 'up-decline'];

  /* 新手模式的人物卡白名單（每案例 ≤4 位）：role＝卡片上寫的身分，kin＝病人或家屬。
     挑選原則：主角（病人）、一位家屬或第二位當事人、兩位現場工作人員；全部是 core:true 的人物。 */
  var WHITELIST = {
    sms:   [['patient', '病人', true], ['family', '家屬', true], ['nurse', '離院護理師', false], ['er_doctor', '急診醫師', false]],
    wait:  [['zhe_patient', '病人', true], ['mei_family', '家屬', true], ['triage_nurse', '檢傷護理師', false], ['service_ling', '服務台志工', false]],
    way:   [['auntie_lin', '病人', true], ['wheel_ming', '輪椅使用者', false], ['vol_route', '入口志工', false], ['nurse_map', '新進護理師', false]],
    forms: [['tremor_ming', '病人', true], ['daughter_yu', '家屬', true], ['reg_chen', '掛號人員', false], ['nurse_forms', '檢傷護理師', false]],
    pay:   [['qing_patient', '病人', true], ['gong_kiosk', '繳費機前的長者', false], ['lin_pharmacist', '藥局藥師', false], ['mei_counter', '批價櫃台人員', false]],
    peds:  [['parent_kui', '病童的媽媽', true], ['grandma_hui', '家屬（阿嬤）', true], ['nurse_yu', '兒科護理師', false], ['doctor_lin', '兒科醫師', false]]
  };
  var CASE_IDS = Object.keys(WHITELIST);

  /* 專家模式＝現在的畫面；除了 1 以外一律當專家（含沒有值、中級 2、亂填） */
  function normalize(v) { return Number(v) === 1 ? 1 : 3; }
  function nameOf(lv) { return NAMES[normalize(lv)]; }
  function isNovice(lv) { return normalize(lv) === 1; }

  /* 白名單：回傳 [{pid, role, kin}]；沒有登記的案例回傳空陣列（呼叫端要退回專家） */
  function whitelist(caseId) {
    return (WHITELIST[caseId] || []).map(function (x) { return { pid: x[0], role: x[1], kin: !!x[2] }; });
  }
  /* 專家模式不過濾：原樣回傳；新手模式只留白名單內的人（依白名單順序），並補上卡片用的名字 */
  function personasFor(level, caseId, all) {
    if (!isNovice(level)) return all;
    var byId = {}; (all || []).forEach(function (p) { if (p && p.id) byId[p.id] = p; });
    return whitelist(caseId).filter(function (w) { return byId[w.pid]; }).map(function (w) { var p = byId[w.pid]; return { pid: w.pid, name: p.name, role: w.role, kin: w.kin, title: p.title }; });
  }

  /* 「去問誰、問什麼」的第一句建議：依身分給，不寫死在案例裡 */
  var HINT = { 病人: '那天你做了什麼、遇到什麼困難？', 家屬: '那天回家後發生了什麼事？' };
  function askHint(role, kin) { return HINT[role] || (kin ? '那天發生了什麼事？' : '你看到病人遇到什麼困難？'); }

  /* 下一步：沿用既有判斷。
     還沒問到任何一位病人或家屬 ⇒ 先去問（storyboard_guide 的 nocard 那一群同樣的說法）；
     問到了 ⇒ 交給 storyboard_guide.nextAction（開故事板、排草稿、繼續寫…）；它回 null ＝ 都做完。
     m：{ wl:[{pid,name,role,kin}], cards:{pid:張數}, action:SB.nextAction() 的結果或 null }
     回傳 { kind:'ask'|'story'|'pc'|'export'|'done', text, label, pid, href, code } */
  function nextStep(m) {
    m = m || {}; var wl = m.wl || [], cards = m.cards || {};
    var kinDone = wl.some(function (w) { return w.kin && (cards[w.pid] || 0) >= 1; });
    if (!kinDone) {
      /* here：{pid: 現在找得到人嗎}（房間裡才有；沒給＝都當找得到）。病人還沒到院時，先問找得到的家屬；一個都找不到才退而求其次 */
      var here = m.here || null, ok = function (w) { return !here || here[w.pid] !== false; };
      var kins = wl.filter(function (w) { return w.kin && !(cards[w.pid] > 0); }), t = kins.filter(ok)[0];
      if (t) return { kind: 'ask', pid: t.pid, label: '開始問', text: '去問' + t.name + '：' + askHint(t.role, t.kin) };
      var other = wl.filter(function (w) { return !w.kin && ok(w); })[0];
      if (other && kins[0]) return { kind: 'ask', pid: other.pid, label: '開始問', text: '先去問' + other.name + '（' + other.role + '）；' + kins[0].name + '還沒到，等一下再問他' };
      t = kins[0] || wl[0];
      if (t) return { kind: 'ask', pid: t.pid, label: '開始問', text: '去問' + t.name + '：' + askHint(t.role, t.kin) };
    }
    var a = m.action;
    if (a) {
      if (a.kind === 'link') return { kind: 'story', label: a.label, href: a.href, text: a.label === '開故事板' ? '開故事板，把訪談寫成六格' : (a.label === '幫我排草稿' ? '開故事板，按「幫我排草稿」' : a.label) };
      if (a.kind === 'export') return { kind: 'export', label: a.label, code: a.code, text: '人物誌：' + a.label };
      return { kind: 'pc', label: a.label, text: a.label };
    }
    return { kind: 'done', label: '', text: '這週要做的都完成了。想再問其他人？切到專家模式。' };
  }

  /* ───── 進大廳的詢問／升級提醒 ───── */
  /* s：{ level, days（玩過幾天）, cards（全部房間訪談卡合計）, cells（故事板已寫格數）, entered（進過任何房間）, today:'YYYY-MM-DD',
          lastAskDay, declines:{ask,up}, inRoom }
     判準（楊老師 11/2）：專家且 玩過 ≥2 天、訪談卡合計 ≤2 ⇒ 建議新手（從沒進過房間者語氣不同）；
     新手且 訪談卡 ≥6、故事板 ≥3 格 ⇒ 建議專家。一天最多一次、同一類拒絕兩次不再問、房間內不問。 */
  var ASK_MAX_DECLINE = 2;
  function nudgeFor(s) {
    s = s || {}; if (s.inRoom) return null;
    if (s.lastAskDay && s.lastAskDay === s.today) return null;
    var d = s.declines || {};
    if (!isNovice(s.level)) {
      if ((d.ask || 0) >= ASK_MAX_DECLINE) return null;
      if ((s.days || 0) >= 2 && (s.cards || 0) <= 2) return { kind: 'ask', to: 1, first: !s.entered };
      return null;
    }
    if ((d.up || 0) >= ASK_MAX_DECLINE) return null;
    if ((s.cards || 0) >= 6 && (s.cells || 0) >= 3) return { kind: 'up', to: 3 };
    return null;
  }
  var NUDGE_TEXT = {
    ask: { title: '要先用新手模式嗎？', body: '人比較少、選項也少，先問到一位病人或家屬。之後隨時可以切回來。' },
    first: { title: '要不要先從新手模式開始？', body: '只有幾位重要的人、選項也少，先問到一位病人或家屬就好。之後隨時可以切回來。' },
    up: { title: '想再多看一點嗎？', body: '你已經問了不少人、也開始寫故事板。專家模式有全部的房間、人物和事件，可以問更多人。進度不會不見，隨時可以切回來。' }
  };
  function nudgeText(n) { return n ? (n.kind === 'ask' && n.first ? NUDGE_TEXT.first : NUDGE_TEXT[n.kind]) : null; }
  var NUDGE_BTN = { yes: { ask: '好，切過去', up: '好，切過去' }, no: '不用，謝謝' };

  /* 從紀錄還原：最後一次詢問是哪一天、各類拒絕幾次（紀錄存在 uilv/{學號}，每筆 { from,to,why,t }） */
  function dayKey(t) { var d = new Date(Number(t)); function p(n) { return (n < 10 ? '0' : '') + n; } return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
  function stateFromLog(log) {
    var arr = []; if (log && typeof log === 'object') Object.keys(log).forEach(function (k) { if (log[k] && typeof log[k] === 'object') arr.push(log[k]); });
    arr.sort(function (a, b) { return Number(a.t) - Number(b.t); });
    var seen = {}; arr = arr.filter(function (e) { var k = String(e.why) + '|' + Number(e.t); if (seen[k]) return false; seen[k] = 1; return true; });   /* 本機備份與雲端各有一份同一筆時只算一次 */
    var out = { lastAskDay: '', declines: { ask: 0, up: 0 }, lastWhy: '', lastSwitch: null, switches: 0, asked: 0 };
    arr.forEach(function (e) {
      var w = String(e.why || '');
      if (/-shown$/.test(w)) { out.lastAskDay = dayKey(e.t); out.asked += 1; }
      if (w === 'ask-decline') out.declines.ask += 1; if (w === 'up-decline') out.declines.up += 1;
      if (/^(self|ask-accept|up-accept)$/.test(w)) { out.switches += 1; out.lastSwitch = { from: e.from, to: e.to, t: Number(e.t) || 0, why: w }; }
      if (/^(ask|up)-/.test(w)) out.lastWhy = w;
    });
    return out;
  }
  /* 後台「提醒狀態」一格的字 */
  function remindText(st) {
    if (!st || !st.lastWhy) return '未提醒';
    var w = st.lastWhy, kind = /^ask/.test(w) ? '建議新手' : '建議專家';
    return kind + '：' + (/accept$/.test(w) ? '接受' : (/decline$/.test(w) ? '拒絕' : '已提醒，沒回應'));
  }

  /* 切換／詢問紀錄一筆的內容（寫到 uilv/{學號}/{push}）：沒有的欄位不寫（Firebase 不收 undefined） */
  function logEntry(from, to, why, ctx) {
    ctx = ctx || {}; var e = { from: normalize(from), to: normalize(to), why: WHY.indexOf(why) >= 0 ? why : 'self', t: Number(ctx.t) || 0 };
    if (ctx.cls) e.cls = String(ctx.cls); if (ctx.dev) e.dev = String(ctx.dev);
    if (isFinite(ctx.cards)) e.cards = Number(ctx.cards); if (isFinite(ctx.days)) e.days = Number(ctx.days);
    return e;
  }

  /* ───── 本機設定 ───── */
  function key(sid) { return 'erg_uilv_' + sid; }
  function readLocal(storage, sid) { try { var o = JSON.parse(storage.getItem(key(sid)) || 'null'); if (o && typeof o === 'object') return { lv: normalize(o.lv), at: Number(o.at) || 0 }; } catch (e) {} return null; }
  function writeLocal(storage, sid, lv, at) { try { storage.setItem(key(sid), JSON.stringify({ lv: normalize(lv), at: Number(at) || 0 })); } catch (e) {} }
  /* 本機與雲端兩份取比較新的；都沒有 ＝ 專家 */
  function pick(local, remote) {
    var l = local && local.at ? local : null, r = remote && remote.at ? { lv: normalize(remote.lv), at: Number(remote.at) } : null;
    if (l && r) return l.at >= r.at ? l : r; return l || r || { lv: 3, at: 0 };
  }

  return { NAMES: NAMES, WHY: WHY, WHITELIST: WHITELIST, CASE_IDS: CASE_IDS, normalize: normalize, nameOf: nameOf, isNovice: isNovice, whitelist: whitelist, personasFor: personasFor,
    askHint: askHint, nextStep: nextStep, nudgeFor: nudgeFor, nudgeText: nudgeText, NUDGE_BTN: NUDGE_BTN, stateFromLog: stateFromLog, remindText: remindText, dayKey: dayKey,
    logEntry: logEntry, readLocal: readLocal, writeLocal: writeLocal, pick: pick, key: key, ASK_MAX_DECLINE: ASK_MAX_DECLINE,
    CONSEQUENCE_TEXT: '都算線索，但這份作業挑一個深入就好，其他可以記下來當背景。' };
});
