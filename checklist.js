/* 檢核式訪談紀錄：每位關係人三個檢核項（對應三層回答），可信度三選一，文字最多一行。
   記錄的誰、第幾輪、房間、時間由系統帶入。純函式。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ERG_CHECKLIST = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var ITEMS = [
    { k: 'surface', label: '他一開始怎麼說' },
    { k: 'events',  label: '那天發生了什麼事' },
    { k: 'need',    label: '他真正需要什麼' }
  ];
  var TRUST = [
    { k: 'saw',   label: '親眼見' },
    { k: 'said',  label: '對方說的' },
    { k: 'guess', label: '我猜的' }
  ];
  var TAGS = ['看不懂', '找不到', '等太久', '沒收到', '要人幫忙', '太麻煩', '不知道下一步', '被叫錯名字'];
  var NOTE_MAX = 30;

  function keys(list) { return list.map(function (x) { return x.k; }); }

  /* ctx：{ id, author, round, loc, simTime, personaId, link } */
  function newRecord(ctx) {
    var items = {};
    ITEMS.forEach(function (it) { items[it.k] = { done: false, trust: '', note: '', tags: [] }; });
    return { id: ctx.id, type: '訪談檢核', author: String(ctx.author), round: ctx.round, loc: ctx.loc || '', simTime: ctx.simTime || '',
      personaId: ctx.personaId, link: ctx.link || '', items: items };
  }

  /* 點亮或取消一個檢核項。patch：{ done, trust, note, tags }。回傳新記錄，不改原物件。 */
  function setItem(rec, itemKey, patch) {
    if (keys(ITEMS).indexOf(itemKey) < 0) throw new Error('沒有這個檢核項：' + itemKey);
    var out = JSON.parse(JSON.stringify(rec));
    var it = out.items[itemKey];
    Object.keys(patch || {}).forEach(function (k) { if (k in it) it[k] = patch[k]; });
    if (typeof it.note === 'string') it.note = it.note.trim().slice(0, NOTE_MAX);
    if (!it.done) { it.trust = ''; }
    return out;
  }

  function validate(rec) {
    var errors = [];
    ITEMS.forEach(function (d) {
      var it = rec.items && rec.items[d.k];
      if (!it) { errors.push({ item: d.k, msg: '缺少檢核項' }); return; }
      if (it.done && keys(TRUST).indexOf(it.trust) < 0) errors.push({ item: d.k, msg: '「' + d.label + '」要選可信度' });
      if (String(it.note || '').length > NOTE_MAX) errors.push({ item: d.k, msg: '文字最多 ' + NOTE_MAX + ' 字' });
      (it.tags || []).forEach(function (t) { if (TAGS.indexOf(t) < 0) errors.push({ item: d.k, msg: '沒有這個標籤：' + t }); });
    });
    return { ok: errors.length === 0, errors: errors };
  }

  function progress(rec) {
    var n = ITEMS.filter(function (d) { return rec.items[d.k] && rec.items[d.k].done; }).length;
    return { done: n, total: ITEMS.length, complete: n === ITEMS.length, ratio: n / ITEMS.length };
  }

  /* 一組訪談紀錄（可含多位成員）疊在一起看缺口：回傳每位關係人還缺哪些檢核項 */
  function gaps(records, personaIds) {
    var out = {};
    personaIds.forEach(function (pid) {
      var got = {};
      records.filter(function (r) { return r.personaId === pid; }).forEach(function (r) {
        ITEMS.forEach(function (d) { if (r.items[d.k] && r.items[d.k].done) got[d.k] = true; });
      });
      out[pid] = ITEMS.filter(function (d) { return !got[d.k]; }).map(function (d) { return d.k; });
    });
    return out;
  }

  /* 已完整訪談（三項皆點亮）的關係人數；同一位關係人多張紀錄只算一次 */
  function completedPersonas(records, author) {
    var seen = {};
    records.forEach(function (r) {
      if (author !== undefined && String(r.author) !== String(author)) return;
      if (progress(r).complete) seen[r.personaId] = true;
    });
    return Object.keys(seen);
  }

  /* 一行摘要，給 Excalidraw 卡片文字與 PDF 報告共用 */
  function summary(rec, personaName) {
    var lines = ['【訪談】' + rec.id + '　' + (personaName || rec.personaId) + '　第' + rec.round + '輪'];
    ITEMS.forEach(function (d) {
      var it = rec.items[d.k];
      var mark = it.done ? '✔' : '＿';
      var t = it.done ? (TRUST.filter(function (x) { return x.k === it.trust; })[0] || { label: '' }).label : '';
      lines.push(mark + ' ' + d.label + (t ? '（' + t + '）' : '') + (it.note ? '：' + it.note : '') + (it.tags && it.tags.length ? ' #' + it.tags.join(' #') : ''));
    });
    return lines.join('\n');
  }

  return { ITEMS: ITEMS, TRUST: TRUST, TAGS: TAGS, NOTE_MAX: NOTE_MAX, newRecord: newRecord, setItem: setItem, validate: validate,
    progress: progress, gaps: gaps, completedPersonas: completedPersonas, summary: summary };
});
