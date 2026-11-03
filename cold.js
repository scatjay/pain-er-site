/* 冷門房間與冷門人物（11-03 楊老師：「比較少人去的房間、比較少去訪談的人，給予新的成就，並隨機推薦給還沒完成的學生，更新在大廳」）。
   純函式，沒有 DOM、沒有網路。三件事：
   ① compute(input)：從所有房間的玩家紀錄數「每個房間被幾位學生去過、每位人物被幾位學生聊過」，取最少的各 3 個＝冷門清單。
      由 tools/er_cold_publish.py（每天一次）經 tools/cold_calc.js 呼叫，結果寫到 er/{場次}/cold（約 0.6 KB）；老師後台沒有已發布清單時也用它現算。
   ② hits(list, players)：學生自己的紀錄（所有房間的玩家物件）對清單，去過幾個冷門房間、哪幾位冷門人物問夠了。成就判定用它（achievements.js）。
   ③ recommend(list, sid, now, hit, have)：大廳「今日推薦」卡。學號＋日期做確定性偽隨機，同一天同一個人看到的永遠同一張；
      該種類的成就拿到了就換下一種，兩種都拿到就回 done。
   學生端只讀 cold 這一個小節點，不讀別人的房間或逐字稿。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ERG_COLD = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  /* 可列入冷門的房間：真正能走進去停留的房間。入口（人人都經過）、走道、街道、救護車道、筆記本不列。 */
  var ROOM_POOL = ['consultA', 'consultB', 'bays', 'ct', 'waiting', 'nurse', 'resus', 'staff', 'triage', 'discharge', 'restroom', 'admin', 'ped', 'obs', 'pharmacy', 'family', 'lobby', 'service', 'home', 'clinic'];
  /* 與 minimap.js 的 SHORT 同名（test_cold.js 會對照，改了其中一邊測試會叫） */
  var ROOM_NAME = { consultA: '診察一', consultB: '診察二', ct: '斷層', staff: '休息室', admin: '行政', ped: '兒科', service: '服務台', lobby: '掛號批價', discharge: '離院批價',
    pharmacy: '領藥', family: '家屬區', waiting: '候診區', triage: '檢傷', nurse: '護理站', resus: '急救', bays: '治療區', obs: '觀察室', restroom: '廁所', home: '病患的家', clinic: '回診門診' };
  var TOP = 3;          /* 冷門清單各取幾個 */
  var NEED = 3;         /* 冷門人物成就：要問夠幾題有效提問 */
  var CLASSES = ['二甲', '二乙', '二丙'];

  function arr(a) { return Array.isArray(a) ? a : (a && typeof a === 'object' ? Object.keys(a).map(function (k) { return a[k]; }) : []); }
  function keys(o) { return o && typeof o === 'object' ? Object.keys(o) : []; }
  function low(s) { return String(s == null ? '' : s).toLowerCase(); }
  function num(v) { v = Number(v); return isFinite(v) ? v : 0; }
  /* 台灣日期 YYYYMMDD（UTC+8，不看裝置時區） */
  function dayKey(now) { var d = new Date(num(now) + 8 * 3600000); return String(d.getUTCFullYear()) + ('0' + (d.getUTCMonth() + 1)).slice(-2) + ('0' + d.getUTCDate()).slice(-2); }
  function fnv(s) { var h = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b) >>> 0; h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0; h ^= h >>> 16;   /* 結尾再攪一次：學號只差最後幾碼時，FNV 的低位元分布很差（實測 300 人只分到 5 個選項裡的 3 個） */
    return h >>> 0; }

  /* 訪談紀錄有沒有填內容（同 achievements.js 的 filledItems） */
  function recFilled(r) { var it = (r && r.items) || {}; return keys(it).some(function (k) { var x = it[k]; return x && ((x.text && String(x.text).trim()) || (x.note && String(x.note).trim()) || (x.tags && x.tags.length)); }); }
  /* 這位玩家去過的房間（roomsSeen 全部；visited 只留最近 8 間，一起算以防舊資料） */
  function playerRooms(p) { var o = {}; keys(p && p.roomsSeen).forEach(function (k) { o[k] = 1; }); arr(p && p.visited).forEach(function (k) { if (k) o[k] = 1; }); return o; }
  /* 這位玩家和每位人物的互動：touched＝有聊過（問過非寒暄的題、或有填內容的訪談紀錄）；eff＝有效提問題數。
     有效提問 qv（achievements.js 的 noteValidQuestion：去重、太快太短不算、寒暄不算、至少 4 個字且不是同一個字連打）。
     qv 上線之前的舊資料沒有 qv：該人物要有填過的訪談紀錄，才拿 q.who（未去重的提問數）當替代，只靠狂按送出灌的 q.who 不算。 */
  function playerAsk(p) {
    var rec = {}, who = (p && p.q && p.q.who) || {}, qv = (p && p.qv) || {}, touched = {}, eff = {};
    arr(p && p.interviews).forEach(function (r) { if (r && r.personaId && recFilled(r)) rec[r.personaId] = 1; });
    var ids = {}; keys(rec).concat(keys(who), keys(qv)).forEach(function (k) { ids[k] = 1; });
    keys(ids).forEach(function (pid) {
      var n = qv[pid] != null ? num(qv[pid]) : (rec[pid] ? num(who[pid]) : 0);
      eff[pid] = n; if (n > 0 || rec[pid] || num(who[pid]) > 0) touched[pid] = 1;
    });
    return { touched: touched, eff: eff };
  }

  /* 數人數、取最冷的 3 個。
     input：{ rooms: { 房間代碼: { players: { 學號: 玩家 } } }（或陣列）, profiles: { 學號: { cls } }（給了就只算三個班的學生）,
              people: [{ id, name }]（候選人物）, roomPool: [id]（預設 ROOM_POOL）, classes, now, top }
     同一位學生（學號大小寫不同算同一人）在多間房的紀錄合併；每位學生每個房間／人物只算一次。
     平手時依 id 字母排序（同一份資料永遠得到同一份清單）。 */
  function compute(input) {
    input = input || {}; var now = num(input.now) || Date.now(), top = input.top || TOP, cls = input.classes || CLASSES;
    var prof = {}; keys(input.profiles).forEach(function (s) { prof[low(s)] = input.profiles[s] || {}; });
    var useProf = keys(prof).length > 0;
    var seenRoom = {}, seenPer = {};   /* 學號(小寫) → { id: 1 } */
    arr(input.rooms).forEach(function (rm) {
      var pls = (rm && rm.players) || {};
      keys(pls).forEach(function (sid) {
        var k = low(sid); if (useProf && !(prof[k] && cls.indexOf(prof[k].cls) >= 0)) return;
        var p = pls[sid] || {};
        var a = seenRoom[k] || (seenRoom[k] = {}); keys(playerRooms(p)).forEach(function (r) { a[r] = 1; });
        var b = seenPer[k] || (seenPer[k] = {}); keys(playerAsk(p).touched).forEach(function (r) { b[r] = 1; });
      });
    });
    var students = {}; keys(seenRoom).concat(keys(seenPer)).forEach(function (k) { students[k] = 1; });
    var roomRows = (input.roomPool || ROOM_POOL).map(function (id) { return { id: id, name: ROOM_NAME[id] || id, n: 0 }; });
    var perRows = arr(input.people).filter(function (x) { return x && x.id; }).map(function (x) { return { id: String(x.id), name: String(x.name || x.id), n: 0 }; });
    keys(seenRoom).forEach(function (k) { roomRows.forEach(function (r) { if (seenRoom[k][r.id]) r.n++; }); });
    keys(seenPer).forEach(function (k) { perRows.forEach(function (r) { if (seenPer[k][r.id]) r.n++; }); });
    function coldest(rows) { return rows.slice().sort(function (a, b) { return a.n - b.n || (a.id < b.id ? -1 : 1); }).slice(0, top); }
    return { t: now, day: dayKey(now), n: keys(students).length, rooms: coldest(roomRows), people: coldest(perRows), allRooms: roomRows, allPeople: perRows };
  }
  /* 要寫進資料庫的樣子：只留清單，不含全部排名（Firebase 不存空陣列，所以清單空的時候整欄不寫） */
  function publishable(res) {
    var o = { t: res.t, day: res.day, n: res.n };
    if (res.rooms && res.rooms.length) o.rooms = res.rooms.map(function (r) { return { id: r.id, name: r.name, n: r.n }; });
    if (res.people && res.people.length) o.people = res.people.map(function (r) { return { id: r.id, name: r.name, n: r.n }; });
    return o;
  }

  /* 學生自己的紀錄對清單。players＝這位學生在所有房間的玩家物件。
     回傳：{ rooms: 去過幾個冷門房間, people: 問夠的冷門人物數, roomIds, personIds, prog: [{ id, name, v, need }]（每位冷門人物的有效提問進度）} */
  function hits(list, players) {
    list = list || {}; var seen = {}, eff = {};
    arr(players).forEach(function (p) {
      keys(playerRooms(p)).forEach(function (r) { seen[r] = 1; });
      var a = playerAsk(p).eff; keys(a).forEach(function (pid) { eff[pid] = (eff[pid] || 0) + a[pid]; });
    });
    var rIds = arr(list.rooms).filter(function (r) { return r && seen[r.id]; }).map(function (r) { return r.id; });
    var prog = arr(list.people).filter(function (x) { return x && x.id; }).map(function (x) { return { id: x.id, name: x.name || x.id, v: Math.min(num(eff[x.id]), NEED), need: NEED }; });
    var pIds = prog.filter(function (x) { return x.v >= NEED; }).map(function (x) { return x.id; });
    return { rooms: rIds.length, people: pIds.length, roomIds: rIds, personIds: pIds, prog: prog };
  }

  /* 大廳「今日推薦」。hit＝hits() 的結果；have＝{ cold_room, cold_person }（成就已經拿到，含之前拿過保留的）。
     種類沒拿到才推薦；挑法：清單（房間在前、人物在後）依 學號＋日期 的雜湊挑起點，往後找第一個還沒完成的。
     回傳 { done:true } 或 { kind:'room'|'person', id, name, text, v?, need? }。學生看得到的字：不放統計、不放老師用語，醫院叫呼呼醫院。 */
  function recommend(list, sid, now, hit, have) {
    list = list || {}; hit = hit || { rooms: 0, people: 0, prog: [] }; have = have || {};
    var roomDone = !!have.cold_room || hit.rooms >= 1, perDone = !!have.cold_person || hit.people >= 1;
    var items = [];
    if (!roomDone) arr(list.rooms).forEach(function (r) { if (r && r.id) items.push({ kind: 'room', id: r.id, name: r.name || ROOM_NAME[r.id] || r.id }); });
    if (!perDone) arr(list.people).forEach(function (x) { if (x && x.id) items.push({ kind: 'person', id: x.id, name: x.name || x.id }); });
    if (!items.length) return { done: true, roomDone: roomDone, perDone: perDone };
    var it = items[fnv(low(sid) + '|' + dayKey(now)) % items.length];
    if (it.kind === 'room') { it.text = '呼呼醫院的「' + it.name + '」這陣子很少人走進去。今天去繞一圈，看看有什麼別人沒注意到的東西。'; return it; }
    var pr = (hit.prog || []).filter(function (x) { return x.id === it.id; })[0], v = pr ? pr.v : 0;
    it.v = v; it.need = NEED;
    it.text = '很少有人去找「' + it.name + '」聊聊。今天試著問 ' + NEED + ' 個問題（打招呼不算），聽聽別人沒聽過的說法。';
    return it;
  }

  return { ROOM_POOL: ROOM_POOL, ROOM_NAME: ROOM_NAME, TOP: TOP, NEED: NEED, CLASSES: CLASSES, dayKey: dayKey, playerRooms: playerRooms, playerAsk: playerAsk, compute: compute, publishable: publishable, hits: hits, recommend: recommend };
});
