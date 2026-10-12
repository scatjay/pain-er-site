/* 案例登錄表：案例一（離院衛教簡訊）由既有資料組成，其餘案例來自 case_*.js。
   Node 端用 require 載入存在的 case 檔；瀏覽器端讀全域 ERG_CASE_<ID>（各檔由 index.html 載入）。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ERG_CASES = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  var IS_NODE = typeof module === 'object' && module.exports;
  var OTHER = [['wait', 'WAIT'], ['way', 'WAY'], ['forms', 'FORMS'], ['pay', 'PAY'], ['peds', 'PEDS']];

  function loadOthers() {
    var out = [];
    OTHER.forEach(function (o) {
      var c = null;
      try { c = IS_NODE ? require('./case_' + o[0] + '.js') : (typeof self !== 'undefined' ? self['ERG_CASE_' + o[1]] : null); } catch (e) { c = null; }
      if (c) out.push(c);
    });
    return out;
  }

  /* 案例一：由既有的 content.js、layout.js、personas.js、er_data.js 組成 */
  function smsCase(ERG, LAYOUT, PER, DATA) {
    var pins = {}; LAYOUT.PINS.forEach(function (p) { pins[p.clue] = p; });
    return {
      meta: { id: 'sms', prefix: 'C', name: '失蹤的簡訊', short: '離院衛教簡訊',
        brief: '呼呼醫院急診會在病患離院後寄出三則衛教簡訊，但病患常常沒看、看不懂，或根本沒收到。院方想知道：簡訊到底哪裡出了問題？你要在急診室裡勘查線索、訪談病患與工作人員，找出簡訊從寄出到被看懂之間斷在哪裡，並提出再設計的方向。',
        goal: ['病患離開急診之後，衛教資訊是怎麼（沒）傳到他手上的？', '誰需要知道什麼？誰最看不懂、最容易漏掉？', '三種再設計方向各自適合誰、要放棄什麼？'],
        focus: ['辨識優於回想', '符合真實世界的用語', '彈性與效率'],
        directions: ['簡訊改呈現', 'LINE官方帳號', '醫院App'],
        mainPersona: 'patient', roomsFocus: ['entrance', 'waiting', 'consultA', 'nurse', 'discharge', 'home', 'admin'] },
      clues: ERG.CLUES.map(function (c) { return { id: c.id, title: c.title, body: c.body, material: c.material, role: c.role, pin: { room: pins[c.id].room, rx: pins[c.id].rx, ry: pins[c.id].ry } }; }),
      personas: [], mutters: {}, schedules: {}, named: [], events: [], layersOverride: {}, captions: {}
    };
  }

  function build(ERG, LAYOUT, PER, DATA) {
    var list = [smsCase(ERG, LAYOUT, PER, DATA)].concat(loadOthers());
    var map = {}; list.forEach(function (c) { map[c.meta.id] = c; });
    return { list: list, get: function (id) { return map[id] || list[0]; } };
  }

  return { build: build };
});
