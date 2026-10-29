/* 10-28 楊老師：急診室裡加「有開啟閱讀當週教材」的成就。
   做法：大廳放「本週教材」連結（依自己的班級開 flipclass 上的教材頁），從這裡點開就記一筆在這台裝置，成就「📖 翻開本週教材」讀這筆記錄。
   誠實的限制：只能記「從遊戲裡打開過」，看不到有沒有真的讀；也看不到學生自己從 flipclass 點開的次數。成就拿到後會存進成績，換裝置也保留。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ERG_MATS = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var BASE = 'https://flipclass.stust.edu.tw/media/doc/';
  var TITLES = { w6: ['W6-1 說明短片', 'W6-2 人物介紹', 'W6-3 怎麼追問'], w7: ['W7-1 第二輪怎麼開始', 'W7-2 訪談檢討總覽', 'W7-3 檢討① 你們做對的事', 'W7-4 檢討② 先說你是誰、想問什麼', 'W7-5 檢討③ 多問「你怎麼做」', 'W7-6 檢討④ 先找問題，不急著給答案'], w8: ['W8-1 從訪談到故事板', 'W8-2 故事板常見的坑', 'W8-3 什麼是人物誌', 'W8-4 28 位人物的個性、破冰與追問'] };
  var DOCS = { w6: { '二甲': [404598, 404599, 404600], '二乙': [404589, 404590, 404591], '二丙': [404580, 404581, 404582] }, w7: { '二甲': [404601, 404602, 404603, 404604, 404605, 404606], '二乙': [404592, 404593, 404594, 404595, 404596, 404597], '二丙': [404583, 404584, 404585, 404586, 404587, 404588] }, w8: { '二甲': [405583, 405584, 405585, 405598], '二乙': [405580, 405581, 405582, 405597], '二丙': [405577, 405578, 405579, 405596] } };
  function key(sid) { return 'erg_mats_' + String(sid || '').toLowerCase(); }
  function load(storage, sid) { try { var v = JSON.parse(storage.getItem(key(sid)) || '{}'); return v && typeof v === 'object' ? v : {}; } catch (e) { return {}; } }
  /* 回傳 [{id, title, url}]；不認得的班級回傳空陣列（測試帳號不顯示） */
  function links(week, cls) {
    var ids = (DOCS[week] || {})[String(cls || '').replace(/^.*(二[甲乙丙]).*$/, '$1')] || [], t = TITLES[week] || [];
    return ids.map(function (id, i) { return { id: id, title: t[i] || ('教材 ' + (i + 1)), url: BASE + id }; });
  }
  function record(storage, sid, week, docId, now) {
    var v = load(storage, sid); v[week] = v[week] || {}; v[week][docId] = v[week][docId] || now || Date.now();
    try { storage.setItem(key(sid), JSON.stringify(v)); } catch (e) {}
    return v;
  }
  /* 有哪幾週打開過至少一份：['w8'] */
  function weeksOpened(storage, sid) { var v = load(storage, sid); return Object.keys(v).filter(function (w) { return v[w] && Object.keys(v[w]).length > 0; }); }
  function openedIds(storage, sid, week) { var v = load(storage, sid); return Object.keys(v[week] || {}).map(Number); }
  return { BASE: BASE, TITLES: TITLES, DOCS: DOCS, links: links, record: record, weeksOpened: weeksOpened, openedIds: openedIds, load: load };
});
