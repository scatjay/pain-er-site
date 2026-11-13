/* 提案室 AI 助手「單元預設問題」題庫（楊老師 2026-11-14 06:44：學生切到對應單元時跳出預設問題讓他選，
   因為他們不見得知道要問什麼；範例看多了就會自己問）。
   units：每一份（tools/prx_units.json 的 f1／a1／f2／a2／f3／a3）各一組，由淺到深。
   byCase：某個案例要換成自己的題目時，寫 byCase[案例代碼][單元代碼]（例如 active、trash、ftl、itb、sts，由各案子線填）；沒寫就用 units。
   每題：q＝按鈕上與送給助手的問題（學生視角、≤60 字）；kind＝用哪一級助手（hint 提示／check 檢查／pattern 句型），預設 hint。
   Node 可測（test_proposal_prompts.js）。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ERG_PX_PROMPTS = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var units = {
    f1: [
      { q: '我這一頁最想讓人一眼看到什麼？' },
      { q: '我的訪談裡，誰會第一個卡在這一頁？' },
      { q: '這個畫面跟原本的差在哪？我講得出一個理由嗎？', kind: 'check' },
      { q: 'Figma 裡要先做哪一個畫面最划算？' }
    ],
    a1: [
      { q: '我要怎麼跟 AI Studio 說，它才會照我 Figma 的版面做？', kind: 'pattern' },
      { q: '做出來的跟我的設計不一樣，我該先改哪裡？' },
      { q: '這個原型哪一個按鈕一定要能按？' },
      { q: '我要怎麼請訪談過的人試用一次？' }
    ],
    f2: [
      { q: '上次試用的人卡在哪裡？我這次改了什麼？' },
      { q: '我這次的改動，對得回哪一句訪談？', kind: 'check' },
      { q: '有沒有一個畫面或步驟可以拿掉？' },
      { q: '哪個字或圖示可能有人看不懂？' }
    ],
    a2: [
      { q: '第二版原型要測什麼問題？' },
      { q: '我怎麼知道改了之後比較好用？' },
      { q: 'AI 改壞的地方，我要怎麼說清楚請它修？', kind: 'pattern' },
      { q: '誰可能不同意我的做法？為什麼？' }
    ],
    f3: [
      { q: '最後版本最想讓人看到哪三個改變？' },
      { q: '每一個改變的依據是誰說的？', kind: 'check' },
      { q: '還有哪一個問題沒解決，要怎麼誠實寫出來？' },
      { q: '我的設計對誰比較不友善？' }
    ],
    a3: [
      { q: '作品展示要怎麼排：問題、訪談、改了什麼、結果？', kind: 'pattern' },
      { q: '試用前後，我有什麼證據可以放進展示？' },
      { q: '這個原型離真的能用還差什麼？' },
      { q: '如果再給我一週，我會改哪裡？' }
    ]
  };
  var byCase = {};
  var KINDS = ['hint', 'check', 'pattern'];

  function norm(list) {
    return (Array.isArray(list) ? list : []).filter(function (x) { return x && typeof x.q === 'string' && x.q.trim(); })
      .map(function (x) { return { q: x.q.trim(), kind: KINDS.indexOf(x.kind) >= 0 ? x.kind : 'hint' }; });
  }
  /* 這個案例、這一份要顯示的題目；案例沒寫就用通用的；都沒有回空陣列 */
  function pick(caseId, unitId) {
    var c = byCase[caseId] && byCase[caseId][unitId];
    var l = norm(c);
    return l.length ? l : norm(units[unitId]);
  }
  /* 各案子線用這個註冊自己的題目（覆蓋同一份） */
  function register(caseId, map) {
    if (!caseId || !map || typeof map !== 'object') return;
    byCase[caseId] = byCase[caseId] || {};
    Object.keys(map).forEach(function (u) { byCase[caseId][u] = map[u]; });
  }
  return { units: units, byCase: byCase, pick: pick, register: register, KINDS: KINDS };
});
