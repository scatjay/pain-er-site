/* 提案室「共同提案牆」的純邏輯：不碰 DOM、不碰 Firebase、不碰 Excalidraw，Node 可測。
   一面牆最多 4 位同學（跟急診室房間一樣），其他人可以旁觀；牆上有五種卡：便利貼、證據卡、決定卡、原型卡、意見卡。
   同學的意見卡只能貼在「別人的卡」上；作者按「採納」，意見就變成下一版「這一版改了什麼」的一行字。
   新手模式只看不貼（介面維持簡潔），中級與專家可以貼卡、留意見。
   學生看得到的字全部用學生的說法；醫院一律叫「呼呼醫院」。
   資料節點：prw/{場次}/{牆代碼}/{meta|cards}；meta＝{host, case, at, n（成員人數）, members, req（加入申請）}。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ERG_WALL = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MAX_MEMBERS = 4;
  var TYPES = {
    note: { k: 'note', label: '便利貼', color: '#ffd43b', max: 120, tab: '' },
    evid: { k: 'evid', label: '證據卡', color: '#a5d8ff', max: 200, tab: 'evid' },
    dec:  { k: 'dec',  label: '決定卡', color: '#ffe066', max: 160, tab: 'dec', edge: '#b8860b' },
    proto:{ k: 'proto',label: '原型卡', color: '#b2f2bb', max: 120, tab: 'proto' },
    opn:  { k: 'opn',  label: '意見卡', color: '#ffc9c9', max: 160, tab: 'opn' }
  };
  var TABS = ['evid', 'dec', 'proto', 'opn'];
  var COLX = { evid: 40, dec: 340, proto: 660, note: 980 };   /* 四欄：證據｜決定｜原型｜便利貼（便利貼自己一欄，最右邊、最顯眼） */

  function str(v, n) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n || 200); }
  function isHttps(u) { return /^https:\/\/[^\s]+$/.test(String(u || '')); }
  /* meta.n＝成員人數（規則引擎沒有 numChildren，成員上限靠這個計數器；見 docs/PROPOSAL_WALL_RULES_DRAFT.md）。
     empty＋join(牆主) 與 newWallMeta 得到同一個形狀：{host, case, at, n:1, members:{牆主:{name, at}}}；meta.req＝同學按了「申請加入」留下的申請（牆主按一次同意才變成員） */
  function empty(host, caseId, now) { return { meta: { host: String(host), case: caseId || 'sms', at: now || 0, n: 0, members: {} }, cards: {} }; }
  function newWallMeta(host, name, caseId, now) { host = String(host); var m = {}; m[host] = { name: str(name, 16) || host, at: now || 0 }; return { host: host, 'case': caseId || 'sms', at: now || 0, n: 1, members: m }; }
  var CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   /* 去掉容易看錯的 I、O、0、1 */
  function genCode(rnd, len) { rnd = rnd || Math.random; len = len || 5; var s = ''; for (var i = 0; i < len; i++) s += CODE_CHARS.charAt(Math.floor(rnd() * CODE_CHARS.length)); return s; }
  /* 牆代碼：轉大寫、只留英數與 _-，長度 2–24（和規則一致）；不合格回空字串 */
  function normCode(v) { var c = String(v == null ? '' : v).toUpperCase().replace(/[^A-Z0-9_-]/g, ''); return /^[A-Z0-9_-]{2,24}$/.test(c) ? c : ''; }
  function members(w) { return Object.keys((w && w.meta && w.meta.members) || {}); }
  function isMember(w, sid) { return !!(w && w.meta && w.meta.members && w.meta.members[String(sid)]); }
  /* 新手只看；中級與專家可以貼 */
  function canEdit(lv) { return Number(lv) === 2 || Number(lv) === 3; }

  function memberCount(w) { return Math.max(members(w).length, Number(w && w.meta && w.meta.n) || 0); }
  function join(w, sid, name, now) {
    sid = String(sid);
    if (!w || !w.meta) return { ok: false, reason: 'nowall' };
    if (isMember(w, sid)) return { ok: true, already: true };
    if (memberCount(w) >= MAX_MEMBERS) return { ok: false, reason: 'full', spectate: true };
    w.meta.members = w.meta.members || {};
    w.meta.members[sid] = { name: str(name, 16) || sid, at: now || 0 };
    w.meta.n = members(w).length;
    if (w.meta.req) delete w.meta.req[sid];
    return { ok: true };
  }
  /* 牆主加一位成員要送出的「多路徑更新」（相對於 meta）：n 加 1＋新成員＋（有申請就順手清掉）。不修改 w；加不了回 null */
  function addMemberUpdate(w, sid, name, now) {
    sid = String(sid);
    if (!w || !w.meta || isMember(w, sid) || memberCount(w) >= MAX_MEMBERS) return null;
    var u = { n: memberCount(w) + 1 }; u['members/' + sid] = { name: str(name, 16) || sid, at: now || 0 };
    if (w.meta.req && w.meta.req[sid]) u['req/' + sid] = null;
    return u;
  }
  /* 同學想加入：寫 meta/req/{學號}。滿了就是旁觀者（只看） */
  function requestJoin(w, sid, name, now) {
    sid = String(sid);
    if (!w || !w.meta) return { ok: false, reason: 'nowall' };
    if (isMember(w, sid)) return { ok: false, reason: 'member' };
    if (memberCount(w) >= MAX_MEMBERS) return { ok: false, reason: 'full', spectate: true };
    return { ok: true, path: 'req/' + sid, value: { name: str(name, 16) || sid, at: now || 0 } };
  }
  function requests(w) {
    var r = (w && w.meta && w.meta.req) || {};
    return Object.keys(r).filter(function (k) { return !isMember(w, k) && r[k]; }).map(function (k) { return { sid: k, name: str(r[k].name, 16) || k, at: Number(r[k].at) || 0 }; }).sort(function (a, b) { return a.at - b.at; });
  }
  /* 這個人在這面牆的身分：host 牆主｜member 成員｜pending 已申請、等牆主同意｜spectator 旁觀（滿了或還沒申請） */
  function roleOf(w, sid) {
    sid = String(sid);
    if (!w || !w.meta) return 'none';
    if (String(w.meta.host) === sid && isMember(w, sid)) return 'host';
    if (isMember(w, sid)) return 'member';
    if (w.meta.req && w.meta.req[sid]) return 'pending';
    return 'spectator';
  }
  function nameOf(w, sid) { var m = w && w.meta && w.meta.members && w.meta.members[String(sid)]; return (m && m.name) || String(sid); }

  /* 新卡自動擺位：證據、決定、原型、便利貼各一欄往下排；意見卡貼在目標卡旁 */
  function autoPos(w, type, target) {
    var cards = (w && w.cards) || {}, ids = Object.keys(cards);
    if (type === 'opn' && target && cards[target]) {
      var n = ids.filter(function (i) { return cards[i].t === 'opn' && cards[i].target === target; }).length;
      return { x: Number(cards[target].x || 0) + 24 + n * 18, y: Number(cards[target].y || 0) + 150 + n * 18 };
    }
    var k = ids.filter(function (i) { return cards[i].t === type; }).length;
    return { x: COLX[type] || 340, y: 70 + k * (type === 'note' ? 160 : 190) };
  }

  function newId(w, now) {
    var i = Object.keys((w && w.cards) || {}).length + 1, id;
    do { id = 'c' + (Number(now || 0) % 100000000).toString(36) + i; i++; } while (w && w.cards && w.cards[id]);
    return id;
  }

  /* 新增一張卡。f：{text, ref(證據來源), url(原型連結), v(原型版本), target(意見針對的卡 id)} */
  function addCard(w, sid, type, f, lv, now) {
    sid = String(sid); f = f || {};
    var T = TYPES[type];
    if (!T) return { ok: false, reason: 'type' };
    if (!canEdit(lv)) return { ok: false, reason: 'readonly' };
    if (!isMember(w, sid)) return { ok: false, reason: 'notmember' };
    var text = str(f.text, T.max);
    if (!text && type !== 'proto') return { ok: false, reason: 'empty' };
    var c = { t: type, by: sid, text: text, at: now || 0 };
    if (type === 'evid') { c.ref = str(f.ref, 40); if (!c.ref) return { ok: false, reason: 'noref' }; }
    if (type === 'proto') {
      if (!isHttps(f.url)) return { ok: false, reason: 'url' };
      c.url = String(f.url).slice(0, 300); c.v = /^v[1-6]$/.test(f.v || '') ? f.v : 'v1';
    }
    if (type === 'opn') {
      var tg = w.cards && w.cards[f.target];
      if (!tg) return { ok: false, reason: 'notarget' };
      if (tg.t === 'opn') return { ok: false, reason: 'opntarget' };
      if (String(tg.by) === sid) return { ok: false, reason: 'self' };
      c.target = f.target;
    }
    var p = autoPos(w, type, c.target); c.x = p.x; c.y = p.y;
    var id = newId(w, now); w.cards = w.cards || {}; w.cards[id] = c;
    return { ok: true, id: id, card: c };
  }

  /* 作者採納一則意見，掛到他的下一版。回傳要寫進「這一版改了什麼」的一行字 */
  function adopt(w, sid, opnId, nextV, now) {
    sid = String(sid);
    var o = w && w.cards && w.cards[opnId];
    if (!o || o.t !== 'opn') return { ok: false, reason: 'noopn' };
    var tg = w.cards[o.target];
    if (!tg) return { ok: false, reason: 'notarget' };
    if (String(tg.by) !== sid) return { ok: false, reason: 'notowner' };
    if (o.adopt) return { ok: false, reason: 'already' };
    o.adopt = { v: /^v[1-6]$/.test(nextV || '') ? nextV : 'v2', at: now || 0 };
    return { ok: true, v: o.adopt.v, line: '採納 ' + nameOf(w, o.by) + ' 的意見：' + str(o.text, 40) };
  }

  /* 某位作者、某個版本要寫進改動說明的所有採納行 */
  function adoptedLines(w, sid, v) {
    var cards = (w && w.cards) || {}, out = [];
    Object.keys(cards).forEach(function (i) {
      var o = cards[i];
      if (o.t === 'opn' && o.adopt && o.adopt.v === v && cards[o.target] && String(cards[o.target].by) === String(sid)) out.push('採納 ' + nameOf(w, o.by) + ' 的意見：' + str(o.text, 40));
    });
    return out;
  }

  function stats(w) {
    var cards = (w && w.cards) || {}, s = { evid: 0, dec: 0, proto: 0, note: 0, opn: 0, adopted: 0, voices: 0 }, who = {}, host = w && w.meta && String(w.meta.host);
    Object.keys(cards).forEach(function (i) {
      var c = cards[i]; if (s[c.t] != null) s[c.t]++;
      if (c.t === 'opn') { if (c.adopt) s.adopted++; if (String(c.by) !== host) who[c.by] = 1; }
    });
    s.voices = Object.keys(who).length;
    return s;
  }

  /* 提案牆成就（條件成立才回 true；只新增不撤銷，寫入由畫面端負責） */
  function ach(w, sid) {
    sid = String(sid);
    var cards = (w && w.cards) || {}, r = { w10_wall_voice: false, w10_wall_adopt: false, w10_wall_crowd: false };
    Object.keys(cards).forEach(function (i) {
      var o = cards[i];
      if (o.t !== 'opn' || !o.adopt) return;
      if (String(o.by) === sid) r.w10_wall_voice = true;
      var tg = cards[o.target]; if (tg && String(tg.by) === sid) r.w10_wall_adopt = true;
    });
    if (w && w.meta && String(w.meta.host) === sid && stats(w).voices >= 3) r.w10_wall_crowd = true;
    return r;
  }

  /* 手機的卡片清單：一個分頁一種卡，新的在上面；意見分頁每則帶「針對哪張卡」與可否採納 */
  function mobileList(w, tab, sid) {
    var cards = (w && w.cards) || {}, rows = [];
    Object.keys(cards).forEach(function (i) {
      var c = cards[i], inTab = tab === 'evid' ? c.t === 'evid' : tab === 'dec' ? (c.t === 'dec' || c.t === 'note') : tab === 'proto' ? c.t === 'proto' : c.t === 'opn';
      if (!inTab) return;
      var tg = c.target ? cards[c.target] : null;
      rows.push({ id: i, t: c.t, label: TYPES[c.t].label, text: c.text, url: c.url || '', v: c.v || '', by: nameOf(w, c.by), mine: String(c.by) === String(sid), at: c.at || 0,
        about: tg ? (TYPES[tg.t].label + (tg.v ? ' ' + tg.v : '')) : '', adopted: c.adopt ? c.adopt.v : '', canAdopt: !!(tg && c.t === 'opn' && !c.adopt && String(tg.by) === String(sid)) });
    });
    rows.sort(function (a, b) { return b.at - a.at; });
    return rows;
  }

  /* 送審時帶的摘要：有幾張牆上的卡、幾則意見、採納幾則（審核端只看數字與採納行，不看全部內容） */
  function summary(w, sid, v) {
    var s = stats(w);
    return { cards: s.evid + s.dec + s.proto + s.note, opinions: s.opn, adopted: s.adopted, voices: s.voices, lines: adoptedLines(w, sid, v) };
  }

  return { MAX_MEMBERS: MAX_MEMBERS, TYPES: TYPES, TABS: TABS, empty: empty, newWallMeta: newWallMeta, genCode: genCode, normCode: normCode, memberCount: memberCount, addMemberUpdate: addMemberUpdate, requestJoin: requestJoin, requests: requests, roleOf: roleOf, members: members, isMember: isMember, canEdit: canEdit, join: join, nameOf: nameOf, autoPos: autoPos, addCard: addCard, adopt: adopt, adoptedLines: adoptedLines, stats: stats, ach: ach, mobileList: mobileList, summary: summary, isHttps: isHttps };
});
