/* 學生的角色（avatar）：進場時先選一個，再簡單調整造型。造型只是外觀，不影響檢核點。
   只用 chars.js 已有的部件；不給學生職業道具（護士帽、警衛帽、聽診鏡、領帶…），免得被當成 NPC。
   完成檢核點會解鎖一些外觀（純裝飾）。純函式。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ERG_AVATAR = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var OPT = {
    head:  ['egg', 'pear', 'square'],
    body:  ['normal', 'slim', 'round', 'broad', 'short', 'pear', 'tall'],
    hair:  ['bald', 'tuft', 'curl', 'cap'],
    eyes:  ['dots', 'droopy', 'spiral'],
    mouth: ['flat', 'frown', 'open', 'teeth'],
    prop:  ['', 'phone', 'clipboard', 'mask', 'bandage', 'balloon'],
    skin:  ['#f9dcc4', '#f1d6b8', '#e8c7a1', '#d9b38c', '#c08e63', '#8d5a3b'],
    outfit: ['#a5d8ff', '#ffd43b', '#ff8787', '#b2f2bb', '#d0bfff', '#ffa94d', '#99e9f2', '#868e96'],
    capColor: ['#ffffff', '#ff6b4a', '#339af0', '#ffd43b']
  };
  var LABEL = { head: '臉型', body: '身形', hair: '頭髮', eyes: '眼睛', mouth: '嘴巴', prop: '手邊的東西', skin: '膚色', outfit: '衣服顏色', capColor: '帽子顏色' };
  var NAME = { normal: '標準', slim: '瘦長', round: '圓滾滾', broad: '寬肩', short: '矮胖', tall: '高挑', egg: '蛋', pear: '梨', square: '方', bald: '光頭', tuft: '三根毛', curl: '捲', cap: '帽子',
    dots: '小點', droopy: '垂眼', spiral: '蚊香', flat: '一字', frown: '倒彎', open: '張嘴', teeth: '露牙', '': '空手',
    phone: '手機', clipboard: '板夾', mask: '口罩', bandage: '貼布', balloon: '氣球' };

  /* 起始角色：每位都有一點無奈的個性 */
  var PRESETS = [
    { id: 'dazed',    name: '發呆派', look: { head: 'egg', body: 'normal',    hair: 'tuft',  eyes: 'dots',   mouth: 'flat',  prop: 'phone',     skin: '#f1d6b8', outfit: '#a5d8ff', capColor: '#ffffff' } },
    { id: 'sleepy',   name: '想睡派', look: { head: 'pear', body: 'round',   hair: 'bald',  eyes: 'droopy', mouth: 'flat',  prop: '',          skin: '#e8c7a1', outfit: '#d0bfff', capColor: '#ffffff' } },
    { id: 'worried',  name: '擔心派', look: { head: 'square', body: 'slim', hair: 'curl',  eyes: 'droopy', mouth: 'frown', prop: 'clipboard', skin: '#f9dcc4', outfit: '#ffd43b', capColor: '#ffffff' } },
    { id: 'chatty',   name: '話多派', look: { head: 'egg', body: 'broad',    hair: 'curl',  eyes: 'dots',   mouth: 'open',  prop: 'phone',     skin: '#d9b38c', outfit: '#ff8787', capColor: '#ffffff' } },
    { id: 'dizzy',    name: '暈頭派', look: { head: 'pear', body: 'short',   hair: 'tuft',  eyes: 'spiral', mouth: 'open',  prop: '',          skin: '#f1d6b8', outfit: '#b2f2bb', capColor: '#ffffff' } },
    { id: 'grin',     name: '硬笑派', look: { head: 'square', body: 'pear', hair: 'bald',  eyes: 'dots',   mouth: 'flat',  prop: 'mask',      skin: '#c08e63', outfit: '#ffa94d', capColor: '#ffffff' } },
    { id: 'cool',     name: '裝酷派', look: { head: 'egg', body: 'tall',    hair: 'tuft',  eyes: 'droopy', mouth: 'flat',  prop: 'phone',     skin: '#8d5a3b', outfit: '#868e96', capColor: '#ffffff' } },
    { id: 'tired',    name: '累癱派', look: { head: 'pear', body: 'round',   hair: 'curl',  eyes: 'spiral', mouth: 'frown', prop: '',          skin: '#e8c7a1', outfit: '#ffa94d', capColor: '#ffffff' } }
  ];

  /* 解鎖：點亮的檢核點數量達到門檻，就多出一些選項（只影響外觀） */
  var UNLOCKS = [
    { need: 2, part: 'prop', value: 'bandage', label: '貼布' },
    { need: 3, part: 'prop', value: 'balloon', label: '氣球' },
    { need: 3, part: 'hair', value: 'cap', label: '帽子' },
    { need: 4, part: 'outfit', value: '#99e9f2', label: '冰藍衣服' },
    { need: 5, part: 'capColor', value: '#ffd43b', label: '金色帽子' },
    { need: 6, part: 'mouth', value: 'teeth', label: '露牙' }
  ];

  function unlockedSet(lit) {
    var locked = {};
    UNLOCKS.forEach(function (u) { if (lit < u.need) locked[u.part + '|' + u.value] = u; });
    return locked;
  }

  /* 各部件目前可選的值（lit＝已點亮的檢核點數） */
  function options(part, lit) {
    var locked = unlockedSet(lit || 0);
    return OPT[part].map(function (v) {
      var u = locked[part + '|' + v];
      return { value: v, name: NAME[v] || v, locked: !!u, unlockAt: u ? u.need : 0 };
    });
  }

  function hashStr(s) { var h = 5381, i; s = String(s); for (i = 0; i < s.length; i += 1) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h; }

  /* 沒選過的學生：依學號固定挑一個起始角色，每次進來都一樣 */
  function defaultFor(studentId) {
    var p = PRESETS[hashStr(studentId) % PRESETS.length];
    return { preset: p.id, look: JSON.parse(JSON.stringify(p.look)) };
  }

  function preset(id) { return PRESETS.filter(function (p) { return p.id === id; })[0] || null; }

  /* 把輸入整理成合法的造型：未知的值退回起始值，不丟錯 */
  function normalize(look, fallback) {
    var base = (fallback && fallback.look) || PRESETS[0].look, out = {};
    Object.keys(OPT).forEach(function (k) {
      var v = look && look[k];
      out[k] = OPT[k].indexOf(v) >= 0 ? v : base[k];
    });
    return out;
  }

  /* 檢查造型是否合法、有沒有用到還沒解鎖的選項 */
  function validate(look, lit) {
    var errors = [], locked = unlockedSet(lit || 0);
    Object.keys(OPT).forEach(function (k) {
      if (!look || OPT[k].indexOf(look[k]) < 0) errors.push({ part: k, msg: LABEL[k] + '的值無效' });
      else if (locked[k + '|' + look[k]]) errors.push({ part: k, msg: LABEL[k] + '「' + (NAME[look[k]] || look[k]) + '」要點亮 ' + locked[k + '|' + look[k]].need + ' 個檢核點才能用' });
    });
    return { ok: errors.length === 0, errors: errors };
  }

  /* 改一個部件，回傳新造型；不合法就丟錯（由介面擋掉） */
  function set(look, part, value, lit) {
    if (!OPT[part]) throw new Error('沒有這個部件：' + part);
    var next = JSON.parse(JSON.stringify(look)); next[part] = value;
    var v = validate(next, lit);
    if (!v.ok) throw new Error(v.errors.map(function (e) { return e.msg; }).join('；'));
    return next;
  }

  /* 隨機換一套（只用已解鎖的選項），seed 相同結果相同 */
  function randomize(seed, lit) {
    var h = hashStr(seed), look = {};
    Object.keys(OPT).forEach(function (k, i) {
      var ok = options(k, lit).filter(function (o) { return !o.locked; });
      look[k] = ok[(h >>> (i * 3)) % ok.length ].value;
      h = (h * 1103515245 + 12345) >>> 0;
    });
    return look;
  }

  /* 取出 chars.js 要用的 look；mood 預設待機 */
  function toCharLook(look) { var l = normalize(look); if (l.prop === '') delete l.prop; return l; }

  /* 這次點亮檢核點後，新解鎖了什麼 */
  function newlyUnlocked(litBefore, litAfter) {
    return UNLOCKS.filter(function (u) { return litBefore < u.need && litAfter >= u.need; });
  }

  return { OPT: OPT, LABEL: LABEL, NAME: NAME, PRESETS: PRESETS, UNLOCKS: UNLOCKS, options: options, defaultFor: defaultFor, preset: preset,
    normalize: normalize, validate: validate, set: set, randomize: randomize, toCharLook: toCharLook, newlyUnlocked: newlyUnlocked };
});
