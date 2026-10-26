/* 案例檔驗證器：每個 case_*.js 都必須通過。檢查結構、欄位、站位與房間是否存在、釘子是否放得下、人物是否完整。
   用法：node validate_case.js case_wait.js   （或由 test_cases.js 對所有 case_*.js 執行） */
var L = require('./layout.js');
var PER = require('./personas.js');

var ENUM = {
  head: ['egg', 'pear', 'square'], hair: ['bald', 'tuft', 'curl', 'cap'], eyes: ['dots', 'droopy', 'spiral'], mouth: ['flat', 'frown', 'open', 'teeth'],
  prop: ['bandage', 'phone', 'mask', 'bottle', 'crutch', 'clipboard', 'nursecap', 'guardhat', 'headmirror', 'tie', 'balloon'],
  material: ['真實', '部分真實', '模擬'], level: ['free', 'short', 'blocked'], role: ['key', 'noise']
};
var REACT = ['leading', 'jargon', 'repeat', 'sensitive', 'rapport'];
var PIN_W = 76, PIN_H = 34;

function rect(x, y, w, h) { return { x: x, y: y, w: w, h: h }; }
function overlap(a, b) { return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; }
function len(s) { return String(s || '').length; }

function validate(c, fileTag) {
  var errs = [];
  function e(msg) { errs.push((fileTag ? fileTag + '：' : '') + msg); }
  var nav = L.nav(), stationIds = {};
  L.STATIONS.forEach(function (s) { stationIds[s.id] = true; });
  var existing = {}, existingNames = {};
  PER.PERSONAS.forEach(function (p) { existing[p.id] = true; existingNames[p.name] = p.id; });

  /* meta */
  var m = c.meta || {};
  ['id', 'name', 'short', 'brief', 'mainPersona', 'prefix'].forEach(function (k) { if (!m[k]) e('meta.' + k + ' 缺少'); });
  if (len(m.brief) < 80 || len(m.brief) > 420) e('meta.brief 長度要 80–420 字，目前 ' + len(m.brief));
  if (!Array.isArray(m.goal) || m.goal.length !== 3) e('meta.goal 要有 3 個問題');
  if (!Array.isArray(m.directions) || m.directions.length !== 3) e('meta.directions 要有 3 個再設計方向');
  else m.directions.forEach(function (d) { if (len(d) < 3 || len(d) > 18) e('再設計方向「' + d + '」長度要 3–18 字'); });
  if (!Array.isArray(m.focus) || m.focus.length < 2) e('meta.focus 至少 2 個使用性概念');
  if (!Array.isArray(m.roomsFocus) || !m.roomsFocus.length) e('meta.roomsFocus 缺少');
  else m.roomsFocus.forEach(function (r) { if (!L.room(r)) e('roomsFocus 房間不存在：' + r); });

  /* 線索 */
  var clues = c.clues || [], clueIds = {}, pins = [];
  if (clues.length < 12) e('線索至少 12 條，目前 ' + clues.length);
  var keyN = 0, noiseN = 0;
  clues.forEach(function (q, i) {
    var tag = '線索[' + i + ']' + (q && q.id ? q.id : '');
    if (!q || !q.id) { e(tag + ' 缺 id'); return; }
    if (m.prefix && q.id.indexOf(m.prefix + '-') !== 0) e(tag + ' id 要以 ' + m.prefix + '- 開頭');
    if (!/^[A-Z]-\d\d$/.test(q.id)) e(tag + ' id 格式要像 W-01');
    if (clueIds[q.id]) e(tag + ' id 重複'); clueIds[q.id] = true;
    if (ENUM.material.indexOf(q.material) < 0) e(tag + ' material 無效');
    if (ENUM.role.indexOf(q.role) < 0) e(tag + ' role 無效'); else if (q.role === 'key') keyN++; else noiseN++;
    if (len(q.title) < 3 || len(q.title) > 22) e(tag + ' title 長度要 3–22 字');
    if (len(q.body) < 30 || len(q.body) > 150) e(tag + ' body 長度要 30–150 字，目前 ' + len(q.body));
    var pin = q.pin, r = pin && L.room(pin.room);
    if (!pin || !r) { e(tag + ' pin.room 不存在'); return; }
    if (r.type === 'remote') { /* 允許 */ }
    if (pin.rx < 6 || pin.ry < 6 || pin.rx + PIN_W > r.w - 6 || pin.ry + PIN_H > r.h - 6) e(tag + ' 釘子超出房間 ' + pin.room + '（rx ' + pin.rx + ', ry ' + pin.ry + '，房間 ' + r.w + '×' + r.h + '）');
    pins.push({ id: q.id, room: pin.room, box: rect(r.x + pin.rx, r.y + pin.ry, PIN_W, PIN_H) });
  });
  if (keyN < 8) e('關鍵線索（role:key）至少 8 條，目前 ' + keyN);
  if (noiseN < 3) e('干擾線索（role:noise）至少 3 條，目前 ' + noiseN);
  for (var a = 0; a < pins.length; a++) for (var b = a + 1; b < pins.length; b++) {
    if (pins[a].room === pins[b].room && overlap(pins[a].box, pins[b].box)) e('釘子重疊：' + pins[a].id + ' 與 ' + pins[b].id);
  }
  pins.forEach(function (p) {
    L.FURNITURE.forEach(function (f) {
      if (f.room !== p.room) return;
      var r = L.room(f.room);
      if (overlap(p.box, rect(r.x + f.rx, r.y + f.ry, f.w, f.h))) e('釘子 ' + p.id + ' 壓到家具「' + f.label + '」，請換位置');
    });
  });

  /* 人物 */
  var personas = c.personas || [], pid = {}, nameSeen = {};
  if (personas.length < 7) e('新角色至少 7 位，目前 ' + personas.length);
  personas.forEach(function (p, i) {
    var tag = '角色[' + i + ']' + (p && p.id ? p.id : '');
    if (!p || !p.id) { e(tag + ' 缺 id'); return; }
    if (!/^[a-z][a-z0-9_]+$/.test(p.id)) e(tag + ' id 要是小寫英文底線');
    if (existing[p.id]) e(tag + ' id 與既有角色重複'); if (pid[p.id]) e(tag + ' id 重複'); pid[p.id] = true;
    if (existingNames[p.name]) e(tag + ' 名稱「' + p.name + '」與既有角色 ' + existingNames[p.name] + ' 重名，同一個房間會出現兩個同名的人，請改名');
    if (nameSeen[p.name]) e(tag + ' 名稱「' + p.name + '」與同案例另一位角色重名'); nameSeen[p.name] = true;
    ['name', 'title', 'bio', 'speech'].forEach(function (k) { if (!p[k]) e(tag + ' 缺 ' + k); });
    if (len(p.bio) < 30 || len(p.bio) > 160) e(tag + ' bio 長度要 30–160 字');
    if (typeof p.core !== 'boolean') e(tag + ' core 要是 true/false');
    if (ENUM.material.indexOf(p.material) < 0) e(tag + ' material 無效');
    var lk = p.look || {};
    if (ENUM.head.indexOf(lk.head) < 0) e(tag + ' look.head 無效'); if (ENUM.hair.indexOf(lk.hair) < 0) e(tag + ' look.hair 無效');
    if (ENUM.eyes.indexOf(lk.eyes) < 0) e(tag + ' look.eyes 無效'); if (ENUM.mouth.indexOf(lk.mouth) < 0) e(tag + ' look.mouth 無效');
    if (ENUM.prop.indexOf(lk.prop) < 0) e(tag + ' look.prop 無效'); if (!/^#[0-9a-fA-F]{6}$/.test(lk.skin || '')) e(tag + ' look.skin 要是 #rrggbb'); if (!/^#[0-9a-fA-F]{6}$/.test(lk.outfit || '')) e(tag + ' look.outfit 要是 #rrggbb');
    if (!Array.isArray(p.knows) || p.knows.length < 2) e(tag + ' knows 至少 2 項');
    if (!Array.isArray(p.unknown) || p.unknown.length < 1) e(tag + ' unknown 至少 1 項');
    var ly = p.layers || {};
    if (len(ly.surface) < 4) e(tag + ' layers.surface 太短');
    if (!Array.isArray(ly.events) || ly.events.length < 2) e(tag + ' layers.events 至少 2 則');
    if (len(ly.need) < 40) e(tag + ' layers.need 至少 40 字（要點出與本案例有關的使用性問題）');
    REACT.forEach(function (k) { if (len((p.reactions || {})[k]) < 6) e(tag + ' reactions.' + k + ' 缺少或太短'); });
    var av = p.avail || {};
    if (ENUM.level.indexOf(av.moving) < 0) e(tag + ' avail.moving 無效'); if (typeof av.eventBlocks !== 'boolean') e(tag + ' avail.eventBlocks 要是 true/false');
    Object.keys(av.acts || {}).forEach(function (k) { if (ENUM.level.indexOf(av.acts[k]) < 0) e(tag + ' avail.acts[' + k + '] 無效'); });
    if (!Array.isArray(p.idle) || p.idle.length < 3) e(tag + ' idle 至少 3 句');
    if (p.core === false && ['有', '無', '誤導'].indexOf(p.tangent) < 0) e(tag + ' 非核心角色要有 tangent（有/無/誤導）');
    if (!Array.isArray(p.cases) || p.cases.indexOf(m.id) < 0) e(tag + ' cases 要包含 ' + m.id);
  });

  var allPid = {}; Object.keys(existing).forEach(function (k) { allPid[k] = true; }); Object.keys(pid).forEach(function (k) { allPid[k] = true; });
  if (m.mainPersona && !allPid[m.mainPersona]) e('meta.mainPersona 不存在：' + m.mainPersona);

  /* 自言自語 */
  var mut = c.mutters || {};
  personas.forEach(function (p) {
    var arr = mut[p.id];
    if (!Array.isArray(arr) || arr.length < 6) e('mutters[' + p.id + '] 至少 6 句'); else arr.forEach(function (t) { if (len(t) < 2 || len(t) > 26) e('mutters[' + p.id + ']「' + t + '」長度要 2–26 字'); });
  });

  /* 行程（常駐人物）與具名病患 */
  var sched = c.schedules || {}, named = c.named || [], namedIds = {}, mains = 0;
  named.forEach(function (n, i) {
    var tag = 'named[' + i + ']' + (n && n.persona);
    if (!allPid[n.persona]) e(tag + ' persona 不存在');
    namedIds[n.persona] = true;
    if (!(n.appear >= 420 && n.appear <= 1100)) e(tag + ' appear 要在 420–1100 模擬分鐘');
    if (!(n.esi >= 1 && n.esi <= 5)) e(tag + ' esi 要 1–5'); if (!n.complaint) e(tag + ' 缺 complaint');
    if (n.main) mains++;
    if (n.route) n.route.forEach(function (st, j) {
      if (!Array.isArray(st) || st.length < 3) { e(tag + ' route[' + j + '] 格式錯'); return; }
      var wp = st[0]; if (['WAIT', 'BAY', 'CONSULT', 'AWAY', 'HOME'].indexOf(wp) < 0 && !stationIds[wp]) e(tag + ' route 站位不存在：' + wp);
    });
  });
  if (mains !== 1) e('named 中要剛好 1 位 main:true，目前 ' + mains);
  if (c.meta && c.meta.mainPersona) { var mp = named.filter(function (n) { return n.main; })[0]; if (mp && mp.persona !== c.meta.mainPersona) e('main 病患要等於 meta.mainPersona'); }
  personas.forEach(function (p) {
    var isNamed = namedIds[p.id], s = sched[p.id];
    if (!isNamed && !s) e('角色 ' + p.id + ' 既不是 named 病患也沒有 schedules 行程');
    if (s) {
      var tot = 0;
      s.forEach(function (st, j) {
        if (!Array.isArray(st) || st.length < 3) { e('schedules[' + p.id + '][' + j + '] 格式錯'); return; }
        if (st[0] !== 'AWAY' && !stationIds[st[0]]) e('schedules[' + p.id + '] 站位不存在：' + st[0]);
        if (!(st[1] >= 1)) e('schedules[' + p.id + '][' + j + '] 分鐘要 ≥1'); tot += st[1]; if (!st[2]) e('schedules[' + p.id + '][' + j + '] 缺活動描述');
      });
      if (tot < 40 || tot > 160) e('schedules[' + p.id + '] 一圈總分鐘要 40–160，目前 ' + tot);
    }
  });

  /* 事件 */
  var evs = c.events || [], evId = {};
  if (evs.length < 2) e('事件至少 2 個');
  evs.forEach(function (v, i) {
    var tag = 'events[' + i + ']' + (v && v.id);
    if (!v.id || (m.prefix && v.id.indexOf(m.prefix + '-E') !== 0)) e(tag + ' id 要以 ' + m.prefix + '-E 開頭'); if (evId[v.id]) e(tag + ' id 重複'); evId[v.id] = true;
    if (!Array.isArray(v.at) || v.at[0] < 420 || v.at[1] > 1140 || v.at[0] > v.at[1]) e(tag + ' at 要在 420–1140 且 [最早,最晚]');
    if (!(v.dur >= 5 && v.dur <= 90)) e(tag + ' dur 要 5–90'); if (len(v.title) < 3) e(tag + ' title 太短'); if (len(v.text) < 20) e(tag + ' text 至少 20 字');
    (v.rooms || []).forEach(function (r) { if (!L.room(r)) e(tag + ' 房間不存在：' + r); }); if (!(v.rooms || []).length) e(tag + ' rooms 缺少');
    (v.busy || []).forEach(function (b) { if (!allPid[b]) e(tag + ' busy 角色不存在：' + b); });
  });

  /* 既有角色的案例專用說法 */
  Object.keys(c.layersOverride || {}).forEach(function (k) {
    if (!existing[k]) e('layersOverride 角色不存在：' + k);
    var ly = c.layersOverride[k]; if (len(ly.surface) < 4 || !Array.isArray(ly.events) || ly.events.length < 2 || len(ly.need) < 40) e('layersOverride[' + k + '] 欄位不完整（surface、events≥2、need≥40 字）');
    /* 10-26：選填 knows／unknown／rules（取代該角色在這個案例裡的同名欄位；不填就沿用簡訊案的）。給了就要是非空字串陣列 */
    ['knows', 'unknown', 'rules'].forEach(function (f) { if (ly[f] !== undefined && (!Array.isArray(ly[f]) || !ly[f].length || ly[f].some(function (x) { return len(x) < 4; }))) e('layersOverride[' + k + '].' + f + ' 要是非空的字串陣列（每句至少 4 字）'); });
  });
  if (Object.keys(c.layersOverride || {}).length < 4) e('layersOverride 至少給 4 位既有角色（讓他們在這個案例裡有不同的說法）');

  /* 旁白 */
  Object.keys(c.captions || {}).forEach(function (k) { if (!L.room(k)) e('captions 房間不存在：' + k); else if (len(c.captions[k]) > 90) e('captions[' + k + '] 不要超過 90 字'); });
  return errs;
}

module.exports = { validate: validate };

if (require.main === module) {
  var f = process.argv[2];
  if (!f) { console.log('用法：node validate_case.js case_xxx.js'); process.exit(2); }
  var c = require('./' + f.replace(/^\.\//, ''));
  var errs = validate(c, f);
  if (errs.length) { console.log(errs.join('\n')); console.log('\n共 ' + errs.length + ' 項問題'); process.exit(1); }
  console.log('OK ' + f + '：線索 ' + c.clues.length + '、新角色 ' + c.personas.length + '、事件 ' + c.events.length);
}
