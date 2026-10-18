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
    hair:  ['bald', 'tuft', 'curl', 'cap', 'bun', 'pony', 'long', 'spiky', 'beanie'],
    eyes:  ['dots', 'droopy', 'spiral', 'sparkle', 'tired', 'happy'],
    mouth: ['flat', 'frown', 'open', 'teeth', 'smile', 'o', 'tongue'],
    prop:  ['', 'phone', 'clipboard', 'mask', 'bandage', 'balloon', 'glasses', 'headphones', 'coffee', 'umbrella'],
    skin:  ['#f9dcc4', '#f1d6b8', '#e8c7a1', '#d9b38c', '#c08e63', '#8d5a3b'],
    outfit: ['#a5d8ff', '#ffd43b', '#ff8787', '#b2f2bb', '#d0bfff', '#ffa94d', '#99e9f2', '#868e96'],
    capColor: ['#ffffff', '#ff6b4a', '#339af0', '#ffd43b'],
    hairColor: ['#4a3b32', '#2b2b2b', '#a5601f', '#e8b04a', '#868e96', '#c2255c', '#1c7ed6'],
    pattern: ['none', 'stripes', 'pocket', 'dots'],
    cheek: ['none', 'blush']
  };
  var LABEL = { head: '臉型', body: '身形', hair: '頭髮', eyes: '眼睛', mouth: '嘴巴', prop: '手邊的東西', skin: '膚色', outfit: '衣服顏色', capColor: '帽子顏色', hairColor: '髮色', pattern: '衣服花紋', cheek: '臉頰' };
  var NAME = { normal: '標準', slim: '瘦長', round: '圓滾滾', broad: '寬肩', short: '矮胖', tall: '高挑', egg: '蛋', pear: '梨', square: '方', bald: '光頭', tuft: '三根毛', curl: '捲', cap: '帽子',
    dots: '小點', droopy: '垂眼', spiral: '蚊香', flat: '一字', frown: '倒彎', open: '張嘴', teeth: '露牙', '': '空手',
    phone: '手機', clipboard: '板夾', mask: '口罩', bandage: '貼布', balloon: '氣球',
    bun: '包子頭', pony: '馬尾', long: '長髮', spiky: '刺蝟頭', beanie: '毛帽', sparkle: '閃亮', tired: '黑眼圈', happy: '彎彎笑', smile: '微笑', o: '小圓', tongue: '吐舌',
    glasses: '眼鏡', headphones: '耳機', coffee: '咖啡', umbrella: '雨傘', none: '無', stripes: '條紋', pocket: '口袋', dots: '圓點', blush: '腮紅' };

  /* 起始角色：每位都有一點無奈的個性 */
  var PRESETS = [
    { id: 'dazed',    name: '發呆派', look: { head: 'egg', body: 'normal',    hair: 'tuft',  eyes: 'dots',   mouth: 'flat',  prop: 'phone',     skin: '#f1d6b8', outfit: '#a5d8ff', capColor: '#ffffff', hairColor: '#4a3b32', pattern: 'none', cheek: 'none' } },
    { id: 'sleepy',   name: '想睡派', look: { head: 'pear', body: 'round',   hair: 'bald',  eyes: 'droopy', mouth: 'flat',  prop: '',          skin: '#e8c7a1', outfit: '#d0bfff', capColor: '#ffffff', hairColor: '#4a3b32', pattern: 'none', cheek: 'none' } },
    { id: 'worried',  name: '擔心派', look: { head: 'square', body: 'slim', hair: 'curl',  eyes: 'droopy', mouth: 'frown', prop: 'clipboard', skin: '#f9dcc4', outfit: '#ffd43b', capColor: '#ffffff', hairColor: '#4a3b32', pattern: 'none', cheek: 'none' } },
    { id: 'chatty',   name: '話多派', look: { head: 'egg', body: 'broad',    hair: 'curl',  eyes: 'dots',   mouth: 'open',  prop: 'phone',     skin: '#d9b38c', outfit: '#ff8787', capColor: '#ffffff', hairColor: '#4a3b32', pattern: 'none', cheek: 'none' } },
    { id: 'dizzy',    name: '暈頭派', look: { head: 'pear', body: 'short',   hair: 'tuft',  eyes: 'spiral', mouth: 'open',  prop: '',          skin: '#f1d6b8', outfit: '#b2f2bb', capColor: '#ffffff', hairColor: '#4a3b32', pattern: 'none', cheek: 'none' } },
    { id: 'grin',     name: '硬笑派', look: { head: 'square', body: 'pear', hair: 'bald',  eyes: 'dots',   mouth: 'flat',  prop: 'mask',      skin: '#c08e63', outfit: '#ffa94d', capColor: '#ffffff', hairColor: '#4a3b32', pattern: 'none', cheek: 'none' } },
    { id: 'cool',     name: '裝酷派', look: { head: 'egg', body: 'tall',    hair: 'tuft',  eyes: 'droopy', mouth: 'flat',  prop: 'phone',     skin: '#8d5a3b', outfit: '#868e96', capColor: '#ffffff', hairColor: '#4a3b32', pattern: 'none', cheek: 'none' } },
    { id: 'tired',    name: '累癱派', look: { head: 'pear', body: 'round',   hair: 'curl',  eyes: 'spiral', mouth: 'frown', prop: '',          skin: '#e8c7a1', outfit: '#ffa94d', capColor: '#ffffff', hairColor: '#4a3b32', pattern: 'none', cheek: 'none' } }
  ];

  /* 解鎖：三種條件（只影響外觀）。by 不寫＝點亮的檢核點數；'badges'＝拿到的成就數；'ask'／'ctx'＝探問／情境感知的等級；'lv3'＝任一項技能到 Lv.3。
     progress 可以是數字（只有檢核點，舊呼叫方式）或 { lit, badges, ask, ctx }。 */
  var UNLOCKS = [
    { need: 2, part: 'prop', value: 'bandage', label: '貼布' },
    { need: 3, part: 'prop', value: 'balloon', label: '氣球' },
    { need: 3, part: 'hair', value: 'cap', label: '帽子' },
    { need: 4, part: 'outfit', value: '#99e9f2', label: '冰藍衣服' },
    { need: 5, part: 'capColor', value: '#ffd43b', label: '金色帽子' },
    { need: 6, part: 'mouth', value: 'teeth', label: '露牙' },
    { by: 'badges', need: 3, part: 'eyes', value: 'sparkle', label: '閃亮眼睛' },
    { by: 'badges', need: 3, part: 'prop', value: 'coffee', label: '咖啡' },
    { by: 'badges', need: 6, part: 'hair', value: 'spiky', label: '刺蝟頭' },
    { by: 'badges', need: 6, part: 'prop', value: 'headphones', label: '耳機' },
    { by: 'badges', need: 10, part: 'hair', value: 'beanie', label: '毛帽' },
    { by: 'badges', need: 10, part: 'pattern', value: 'stripes', label: '條紋衣服' },
    { by: 'badges', need: 14, part: 'mouth', value: 'tongue', label: '吐舌' },
    { by: 'badges', need: 14, part: 'prop', value: 'umbrella', label: '雨傘' },
    { by: 'badges', need: 18, part: 'hairColor', value: '#c2255c', label: '莓紅髮色' },
    { by: 'badges', need: 18, part: 'hairColor', value: '#1c7ed6', label: '寶藍髮色' },
    { by: 'ask', need: 2, part: 'prop', value: 'glasses', label: '眼鏡' },
    { by: 'ask', need: 2, part: 'pattern', value: 'pocket', label: '口袋衣服' },
    { by: 'ctx', need: 2, part: 'hair', value: 'long', label: '長髮' },
    { by: 'ctx', need: 2, part: 'pattern', value: 'dots', label: '圓點衣服' },
    { by: 'lv3', need: 3, part: 'hairColor', value: '#e8b04a', label: '金色髮色' }
  ];
  function prog(p) {
    if (p && typeof p === 'object') return { lit: Number(p.lit) || 0, badges: Number(p.badges) || 0, ask: Number(p.ask) || 1, ctx: Number(p.ctx) || 1 };
    return { lit: Number(p) || 0, badges: 0, ask: 1, ctx: 1 };
  }
  function met(u, p) {
    if (!u.by) return p.lit >= u.need;
    if (u.by === 'badges') return p.badges >= u.need;
    if (u.by === 'ask') return p.ask >= u.need;
    if (u.by === 'ctx') return p.ctx >= u.need;
    if (u.by === 'lv3') return Math.max(p.ask, p.ctx) >= u.need;
    return true;
  }
  function hint(u) {
    if (!u.by) return '點亮 ' + u.need + ' 個檢核點才能用';
    if (u.by === 'badges') return '拿到 ' + u.need + ' 個成就才能用';
    if (u.by === 'ask') return '探問升到 Lv.' + u.need + ' 才能用';
    if (u.by === 'ctx') return '情境感知升到 Lv.' + u.need + ' 才能用';
    return '任一項技能升到 Lv.' + u.need + ' 才能用';
  }

  function unlockedSet(progress) {
    var p = prog(progress), locked = {};
    UNLOCKS.forEach(function (u) { if (!met(u, p)) locked[u.part + '|' + u.value] = u; });
    return locked;
  }

  /* 各部件目前可選的值（progress＝檢核點數，或 { lit, badges, ask, ctx }） */
  function options(part, progress) {
    var locked = unlockedSet(progress);
    return OPT[part].map(function (v) {
      var u = locked[part + '|' + v];
      return { value: v, name: NAME[v] || v, locked: !!u, unlockAt: u ? u.need : 0, hint: u ? hint(u) : '' };
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
      else if (locked[k + '|' + look[k]]) errors.push({ part: k, msg: LABEL[k] + '「' + (NAME[look[k]] || look[k]) + '」' + hint(locked[k + '|' + look[k]]) });
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
  function newlyUnlocked(before, after) {
    var b = prog(before), c = prog(after);
    return UNLOCKS.filter(function (u) { return !met(u, b) && met(u, c); });
  }

  return { OPT: OPT, LABEL: LABEL, NAME: NAME, PRESETS: PRESETS, UNLOCKS: UNLOCKS, options: options, defaultFor: defaultFor, preset: preset,
    prog: prog, met: met, hint: hint, normalize: normalize, validate: validate, set: set, randomize: randomize, toCharLook: toCharLook, newlyUnlocked: newlyUnlocked };
});
