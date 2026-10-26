/* 由 tools/gen_persona_types.py 從 docs/persona_types_28.json 產生，請勿手改。
   象限四格＝MG D 座標圖：橫軸 話少 I ↔ 話多 E，縱軸 先在意感受 F ↔ 道理 T。 */
window.ERG_TYPE_QUADS = {
 "IF": {
  "key": "lt",
  "title": "話少、先在意感受",
  "short": "話少・先在意感受",
  "color": "#3d6fe0",
  "bg": "#e6edfb",
  "line": "要先承接處境，才會開口"
 },
 "IT": {
  "key": "lb",
  "title": "話少、先在意道理",
  "short": "話少・先在意道理",
  "color": "#14a08c",
  "bg": "#def4f0",
  "line": "一句話說清來意，問他做過的一步"
 },
 "EF": {
  "key": "rt",
  "title": "話多、先在意感受",
  "short": "話多・先在意感受",
  "color": "#f08300",
  "bg": "#fff1dc",
  "line": "話多又容易離題，先接住再拉回"
 },
 "ET": {
  "key": "rb",
  "title": "話多、先在意道理",
  "short": "話多・先在意道理",
  "color": "#6aa81a",
  "bg": "#eef6dc",
  "line": "要結論和指標，先講來意和時間"
 }
};
window.ERG_TYPES = {
 "patient": {
  "name": "阿凱",
  "type": "ISFP",
  "label": "探險家",
  "quad": "IF",
  "open": "「頭還暈嗎？離開醫院後，你第一個點開的是什麼？」"
 },
 "family": {
  "name": "王媽媽",
  "type": "ESFJ",
  "label": "執政官",
  "quad": "EF",
  "open": "「辛苦了，他現在還好嗎？那天半夜你看到什麼、做了什麼？」"
 },
 "triage_nurse": {
  "name": "小芳",
  "type": "ESTJ",
  "label": "總經理",
  "quad": "ET",
  "open": "「我只佔你一分鐘：螢幕當機那天，你一個人回答幾次？」"
 },
 "nurse": {
  "name": "小雅",
  "type": "ISFJ",
  "label": "守護者",
  "quad": "IF",
  "open": "「離院說明從頭到尾是怎麼走的？第一步是什麼？」"
 },
 "er_doctor": {
  "name": "林醫師",
  "type": "ENTJ",
  "label": "指揮官",
  "quad": "ET",
  "open": "「我要確認警訊那句有沒有被看到，怎樣算病人真的看到了？」"
 },
 "clinic_doctor": {
  "name": "周醫師",
  "type": "INFJ",
  "label": "提倡者",
  "quad": "IF",
  "open": "（慢下來、一次一題）「病人坐在你對面說不出來時，你怎麼問？」"
 },
 "volunteer": {
  "name": "張阿姨",
  "type": "ESFP",
  "label": "表演者",
  "quad": "EF",
  "open": "先聽她講一小段孫子，再問「那位阿公找簡訊那次，你當時做了什麼？」"
 },
 "radiology": {
  "name": "小宇",
  "type": "INTP",
  "label": "邏輯學家",
  "quad": "IT",
  "open": "「我是研究員，想了解照完到看片之間的流程。那一步為什麼這樣排？」"
 },
 "guard": {
  "name": "老陳",
  "type": "ISTJ",
  "label": "物流師",
  "quad": "IT",
  "open": "先報身分與來意、表示尊重，再問「你站這裡，看到有人自己拿著單子離開嗎？」"
 },
 "admin": {
  "name": "黃主任",
  "type": "INTJ",
  "label": "建築師",
  "quad": "IT",
  "open": "「用最少的錢改善最多人：你決策的判準是什麼？上次 LINE 案子為何沒下文？」"
 },
 "er_director": {
  "name": "陳主任",
  "type": "ESTJ",
  "label": "總經理",
  "quad": "ET",
  "open": "「簡訊改版預期能降低再返診率，你看這個指標可以嗎？」"
 },
 "superintendent": {
  "name": "院長",
  "type": "ENFJ",
  "label": "主人公",
  "quad": "EF",
  "open": "「有位病人收到三則簡訊，卻不知道哪一句是警訊。」"
 },
 "kid": {
  "name": "小米",
  "type": "ENFP",
  "label": "競選者",
  "quad": "EF",
  "open": "「你剛剛按阿公的手機，按了哪一個？」（蹲下來問）"
 },
 "kid_dad": {
  "name": "阿宏",
  "type": "INFP",
  "label": "調停者",
  "quad": "IF",
  "open": "「小米現在還痛嗎？那時候你最擔心什麼？」"
 },
 "rowdy_family": {
  "name": "阿霸",
  "type": "ESTP",
  "label": "企業家",
  "quad": "ET",
  "open": "「我現在去櫃台幫你問，大約十分鐘後回來告訴你。」"
 },
 "rowdy_drunk": {
  "name": "阿酒",
  "type": "ENTP",
  "label": "辯論家",
  "quad": "ET",
  "open": "「你說的這個，是誰跟你說的？」（笑著問、不糾正）"
 },
 "elder": {
  "name": "李阿公",
  "type": "ISFJ",
  "label": "守護者",
  "quad": "IF",
  "open": "（大聲慢慢）「阿公，太太好嗎？上次那張單子你放哪裡？」"
 },
 "teen": {
  "name": "阿哲",
  "type": "ISTP",
  "label": "鑑賞家",
  "quad": "IT",
  "open": "「上次那則簡訊，你是怎麼處理的？」"
 },
 "toddler_mom": {
  "name": "小安的媽媽",
  "type": "ESFJ",
  "label": "執政官",
  "quad": "EF",
  "open": "「小安還好嗎？你在別家醫院收到的通知長怎樣？」"
 },
 "worker": {
  "name": "小楊",
  "type": "ESTJ",
  "label": "總經理",
  "quad": "ET",
  "open": "「只佔你一分鐘：陌生號碼的簡訊，你都怎麼處理？」"
 },
 "drunk": {
  "name": "老周",
  "type": "ESFP",
  "label": "表演者",
  "quad": "EF",
  "open": "（笑著）「真的喔？然後呢？」"
 },
 "street_man": {
  "name": "山哥",
  "type": "INFJ",
  "label": "提倡者",
  "quad": "IF",
  "open": "「腳還痛嗎？離開的時候，他們怎麼說要聯絡你？」"
 },
 "trans_woman": {
  "name": "小薇",
  "type": "INFP",
  "label": "調停者",
  "quad": "IF",
  "open": "「叫號的時候，你當時怎麼做的？」（用中性稱呼）"
 },
 "gay_partner": {
  "name": "恩哥",
  "type": "ENFJ",
  "label": "主人公",
  "quad": "EF",
  "open": "「簽同意書那時候，流程是怎麼走的？」"
 },
 "new_resident": {
  "name": "阿蘭",
  "type": "ISFJ",
  "label": "守護者",
  "quad": "IF",
  "open": "「簡訊裡哪個字你要拍照問先生？」（慢慢說）"
 },
 "lonely_elder": {
  "name": "賴阿嬤",
  "type": "ISFP",
  "label": "探險家",
  "quad": "IF",
  "open": "「阿嬤，呷飽未？那天你回家怎麼辦？」"
 },
 "migrant_caregiver": {
  "name": "Siti（西蒂）",
  "type": "ISTJ",
  "label": "物流師",
  "quad": "IT",
  "open": "「阿公幾點量體溫？吃什麼藥？」（短句）"
 },
 "pep_patient": {
  "name": "阿澤",
  "type": "INTP",
  "label": "邏輯學家",
  "quad": "IT",
  "open": "「我不記名、只問流程：回診分批領藥的時間表是怎麼排的？」"
 }
};
(function () {
  var Q = window.ERG_TYPE_QUADS, T = window.ERG_TYPES;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  function info(pid) { var t = T[pid]; if (!t) return null; var q = Q[t.quad]; return { t: t, q: q }; }
  /* 徽章：色塊＋「ISFP 探險家」＋「話少・先在意感受」；compact＝只留色塊與四碼（人物清單的小按鈕用）。色塊旁一定有字，不靠顏色分辨。 */
  function badge(pid, compact) {
    var i = info(pid); if (!i) return '';
    var st = '--q:' + i.q.color + ';--qb:' + i.q.bg;
    var tip = i.t.type + ' ' + i.t.label + '：' + i.q.title + '（' + i.q.line + '）';
    if (compact) return '<span class="mbti mbtiC" style="' + st + '" title="' + esc(tip) + '"><i class="mbtiSw" aria-hidden="true"></i>' + esc(i.t.type) + '</span>';
    return '<div class="mbtiRow"><span class="mbti" style="' + st + '" title="' + esc(tip) + '"><i class="mbtiSw" aria-hidden="true"></i><b>' + esc(i.t.type + ' ' + i.t.label) + '</b></span><span class="mbtiQ">' + esc(i.q.short) + '</span></div>';
  }
  /* 可收合的破冰提示（預設收起） */
  function ice(pid) {
    var i = info(pid); if (!i) return '';
    return '<details class="mbtiIce"><summary>破冰提示</summary><div>' + esc(i.t.open) + '<div class="mbtiLine">' + esc(i.q.title + '：' + i.q.line) + '</div></div></details>';
  }
  window.ERG_TYPE_UI = { info: info, badge: badge, ice: ice };
  if (typeof document !== 'undefined' && !document.getElementById('mbtiCss')) {
    var s = document.createElement('style'); s.id = 'mbtiCss';
    s.textContent = '.mbtiRow{display:flex;align-items:center;gap:6px;flex-wrap:nowrap;min-width:0;margin:2px 0;font-size:var(--fs-1);line-height:1.5}' +
      '.mbti{display:inline-flex;align-items:center;gap:4px;flex:0 0 auto;max-width:100%;padding:0 6px 0 4px;border:1px solid var(--q);border-radius:99px;background:var(--qb);color:#1e1e1e;font-size:var(--fs-1);font-weight:700;white-space:nowrap}' +
      '.mbti b{font-weight:700;overflow:hidden;text-overflow:ellipsis}' +
      '.mbtiSw{display:inline-block;width:10px;height:10px;border-radius:3px;background:var(--q);flex:0 0 10px}' +
      '.mbtiQ{color:var(--muted);font-size:var(--fs-1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}' +
      '.mbtiC{margin-left:4px;font-weight:400}' +
      '.mbtiIce{margin-top:4px;font-size:var(--fs-2)}.mbtiIce summary{cursor:pointer;color:var(--muted);font-size:var(--fs-2)}.mbtiIce>div{padding:4px 0 0}' +
      '.mbtiLine{margin-top:2px;color:var(--muted);font-size:var(--fs-1)}';
    (document.head || document.documentElement).appendChild(s);
  }
})();
