/* 第 2 週（W7，痛點急診室 2/3）的檢核點。10-19 楊老師：
   「上週的檢核點更新成第一週的檢核點；這週設計新的檢核點，入口要做說明；這週是繼續升級技能、追加成就，
    最重要的是根據引導的信去做明確的回應。」「信要在這個入口看到給自己的指引。」「第一週還沒完成的，也可以繼續做。」
   純函式，跟 checkpoints.js 同樣回傳 { list:[{id,label,plain,how,ok,detail,items}], lit, total, next }，
   畫面可以直接用 ERG_CHECKPOINTS.listHtml 畫。
   ctx：{ guide:{ items, st }（個人指引與逐項狀態）, sk:{ask,ctx}, badges, cases, base:{ask,ctx,badges}（第 1 週結束時的值，來自 10-19 的基準快照；沒有就用當下值）,
          resp:{ a,b,c, t（送出時間）}, hasGuide（有沒有個別指引） } */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ERG_WEEK2 = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var START = '2026-10-20T07:10:00+08:00', BADGE_PLUS = 3, RESP_MIN = 15, SK_NAMES = { ask: ['開口問', '會追問', '追到底'], ctx: ['到處看', '找對人', '對得起來'] };
  function num(v, d) { v = Number(v); return isFinite(v) ? v : d; }
  function len(s) { return String(s || '').replace(/\s/g, '').length; }
  function target(base) { return Math.min(3, Math.max(2, base + 1)); }
  function allOk(items) { return items.every(function (i) { return i.ok; }); }

  function evaluate(c) {
    c = c || {}; var sk = c.sk || {}, b = c.base || {}, r = c.resp || {};
    var ask = num(sk.ask, 1), ctx = num(sk.ctx, 1), bAsk = num(b.ask, ask), bCtx = num(b.ctx, ctx);
    var badges = num(c.badges, 0), bBadges = num(b.badges, badges), tAsk = target(bAsk), tCtx = target(bCtx);
    var skItems = [
      { text: bAsk >= 3 ? '「探問」已經是最高級 Lv.3（保持就好）' : '「探問」升到 Lv.' + tAsk + '「' + SK_NAMES.ask[tAsk - 1] + '」（現在 Lv.' + ask + '）', ok: ask >= tAsk, todo: '打開「成就」分頁，看「探問」技能卡寫的「升到下一級還差」，照著去問' },
      { text: bCtx >= 3 ? '「情境感知」已經是最高級 Lv.3（保持就好）' : '「情境感知」升到 Lv.' + tCtx + '「' + SK_NAMES.ctx[tCtx - 1] + '」（現在 Lv.' + ctx + '）', ok: ctx >= tCtx, todo: '打開「成就」分頁，看「情境感知」技能卡寫的「升到下一級還差」：多走幾間房、找不同的人問' }
    ];
    var need = bBadges + BADGE_PLUS;
    var bdItems = [{ text: '比 1/3（W6）結束時多拿 ' + BADGE_PLUS + ' 枚成就（' + Math.max(0, badges - bBadges) + ' / ' + BADGE_PLUS + '，現在共 ' + badges + ' 枚）', ok: badges >= need, todo: '打開「成就」分頁，挑還沒亮的成就去做（例如換一種案例、問到病人本人、追問「後來呢」）' }];
    var csItems = [{ text: '玩過 2 種以上的案例（現在 ' + num(c.cases, 0) + ' 種）', ok: num(c.cases, 0) >= 2, todo: '回大廳，「案例」選一個你還沒玩過的，按「開一間」' }];
    var rpItems = [
      { text: '讀完上面「給你的指引」', ok: !c.hasGuide || !!c.guideSeen || len(r.a) + len(r.b) + len(r.c) > 0, todo: '在大廳打開「給你的指引」，讀一下這週建議你做的事' },
      { text: '寫「指引建議我做什麼」（' + RESP_MIN + ' 字以上）', ok: len(r.a) >= RESP_MIN, todo: '在大廳「回應指引」的第 1 格，寫指引建議你做哪幾件事' },
      { text: '寫「我做了什麼、結果如何」（每件一句，要具體）', ok: len(r.b) >= RESP_MIN, todo: '在第 2 格寫你做了什麼，例如「追問了 5 次『那時候你怎麼做』，探問升到 Lv.2」' },
      { text: '寫「還沒做到的、卡在哪、下一步」', ok: len(r.c) >= RESP_MIN, todo: '在第 3 格誠實寫還沒做到的那一件、卡在哪裡、打算怎麼補' },
      { text: '按「送出審核」', ok: !!r.t, todo: '三格都寫好後，按「送出審核」（一天只能送一次）' },
      { text: '通過審核（每天晚上審一次）', ok: !!(r.passed || (r.rev && r.rev.ok)), todo: r.t ? '等今晚審核；沒通過就照建議改好，隔天再送' : '先寫好三格並送出審核' }
    ];
    /* 個人化檢核點：每位學生自己的指引逐項（狀態由 tools/er_guide_sync.py 每小時算好寫回 guide/{學號}/st；任何時間都能完成，不限上課） */
    var g = c.guide || {}, gst = (g.st && g.st.items) || [];
    var myItems = (g.items || []).map(function (it, k) {
      var x = gst[k] || {}, part = x.s === 'part', prog = (x.p || []).map(function (q) { return q[1] > 0 && q[1] < 1 ? '目前 ' + Math.round(q[0] * 100) + '%，要在 ' + Math.round(q[1] * 100) + '% 以下' : Math.min(q[0], q[1]) + '/' + q[1]; }).join('、');
      /* 10-20：同步狀態最多落後 2 小時；技能等級在畫面上是即時算的。技能類的項目用即時等級再判一次，免得同一頁一處 ✗ 一處 ✓（二乙 0192） */
      var okNow = x.s === 'ok', mm = /(探問|情境感知)[」』]?\s*升到\s*Lv\.?\s*(\d)/.exec(String(it.title || ''));
      if (mm && num(mm[2], 9) <= (mm[1] === '探問' ? ask : ctx)) okNow = true;
      var step = it.small || it.how;
      if (/勘查/.test(it.title || '')) step = '問完一位之後，走進房間找黃色「線索」牌，點開讀，再按「記一張勘查卡」，記滿三張就過';
      return { text: it.title + (okNow ? '' : part ? '（做了一部分' + (prog ? '：' + prog : '') + '）' : (prog ? '（' + prog + '）' : '')), ok: okNow, todo: '「' + it.title + '」先做這一小步：' + step };
    });
    var list = [];
    if (myItems.length) list.push({ id: 0, label: '我的個人檢核點', plain: '照「給你的指引」逐件完成', how: '下面「給你的指引」每一件都寫了怎麼做、怎麼算完成。任何時間都可以做（10/20 到 W8 結束全天開放訪談）；打勾狀態白天每兩小時更新一次（07:15 到 23:15）' + (g.st && g.st.at ? '（上次更新 ' + new Date(g.st.at).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false }) + '）' : '') + '。', items: myItems });
    list = list.concat([
      { id: 1, label: '技能再升一級', plain: '探問、情境感知各升一級', how: '從 1/3（W6）結束時的等級，各再升一級（至少到 Lv.2）。升級條件寫在「成就」分頁的技能卡上。', items: skItems },
      { id: 2, label: '追加成就', plain: '比 1/3（W6）多 ' + BADGE_PLUS + ' 枚', how: '「成就」分頁裡還沒亮的格子就是可以做的事。', items: bdItems },
      { id: 3, label: '換一種案例', plain: '玩過 2 種以上', how: '案例共 6 種，每一種的人物、線索和結論都不一樣。在新的案例也去訪談、寫結論。', items: csItems },
      { id: 4, label: '回應指引（最重要）', plain: '照指引做，並寫下你做了什麼', how: '大廳的「給你的指引」是依你自己的進度寫的。照著做，再在「回應指引」三格裡簡單、具體地寫下來；W7 作業也要交同樣的內容。', items: rpItems }
    ]);
    list.forEach(function (x, k) { x.id = k + 1; });
    list.forEach(function (x) { x.ok = allOk(x.items); x.detail = x.items.filter(function (i) { return i.ok; }).length + ' / ' + x.items.length; x.eg = ''; });
    var next = null;
    /* 「回應指引」最重要，但要先有做了才有得寫：順序照技能 → 成就 → 案例 → 回應；第 4 項的「讀指引」最先提醒 */
    var rp = list[list.length - 1];
    if (!rpItems[0].ok) next = { id: rp.id, label: rp.label, text: rpItems[0].todo };
    else list.some(function (x) { if (x.ok) return false; var it = x.items.filter(function (i) { return !i.ok; })[0]; next = { id: x.id, label: x.label, text: it.todo }; return true; });
    return { list: list, lit: list.filter(function (x) { return x.ok; }).length, total: list.length, passed: list.every(function (x) { return x.ok; }), next: next };
  }
  function started(now) { return (now || Date.now()) >= Date.parse(START); }
  /* 10-20 起新增的徽章不算進「比 1/3（W6）多 3 枚」：W6 結束的基準快照（10-19）不含它，已有人先拿到會等於少做一枚。
     總數 total 減去「已拿到的、不在基準裡的新徽章」；ids 是玩家已拿到的徽章 id 清單。 */
  var NEW_SINCE_BASE = ['pry_open', 'w8_together', 'w8_relay', 'w8_fill', 'w8_revisit', 'w8_premiere', 'w8_askthenwrite', 'w8_allsourced', 'w8_nofill', 'w8_reclaim', 'w8_solo', 'w8_soloall', 'w8_mat'];   /* 10-26：W8 故事板成就也不算進 W7 的比較 */
  function badgeCount(total, ids) {
    var n = Number(total) || 0, got = ids || [];
    NEW_SINCE_BASE.forEach(function (id) { if (got.indexOf(id) >= 0) n -= 1; });
    return Math.max(0, n);
  }
  return { START: START, BADGE_PLUS: BADGE_PLUS, RESP_MIN: RESP_MIN, evaluate: evaluate, started: started, badgeCount: badgeCount, NEW_SINCE_BASE: NEW_SINCE_BASE };
});
