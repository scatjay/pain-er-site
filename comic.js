/* 漫畫元素：旁白框、擬聲字、自言自語、泡泡類型。純資料與純函式。
   自言自語（mutters）是角色的內心碎念，2–26 字；一律是虛構角色的口吻。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ERG_COMIC = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  var CAPTIONS = {
    entrance:  '入口大廳。自動門一開，冷氣和消毒水味一起撲上來。警衛老陳的視線像掃描器。',
    triage:    '檢傷櫃台。每個人都想插隊，但每個人都說自己「真的很痛」。',
    waiting:   '候診區。電視在播沒人看的新聞，叫號螢幕是全場最受矚目的明星。',
    consultA:  '診察室一。醫師的鍵盤聲，比任何安慰都快。',
    consultB:  '診察室二。這裡看輕症，牆上的月曆還停在上個月。',
    bays:      '治療區。簾子拉起來，每一格都是一個小宇宙。',
    ct:        '檢查室。巨大的甜甜圈機器，會轉、會嗶、會讓人緊張。',
    corridor:  '主要走道。推床、輪椅和趕路的人，全都在這裡塞車。',
    hall2:     '中央走道。誰都經過，誰都不停留。',
    hall3:     '前廳走道。入口、批價、領藥的人都在這裡擦肩而過。',
    nurse:     '護理站。白板上的字比病歷還亂，但每個人都看得懂。',
    resus:     '急救室。平常很安靜，這正是它最可怕的地方。',
    staff:     '醫護休息室。咖啡機是這層樓的心臟。',
    discharge: '離院說明與批價。這是病人最後的關卡，也是最後一次可以被好好說明的機會。',
    restroom:  '洗手間。標示在門後面，你得先走進去才知道是不是這間。',
    admin:     '院方行政辦公室。桌上的待辦，比病人還多。',
    ambulance: '救護車道。警笛一響，全院的腳步聲都變快了。',
    street:    '院外。計程車、公車站牌，和一些沒人收的傳單。',
    ped:       '兒科診察室。玩具箱是全院最忙的設備。',
    obs:       '觀察室。點滴一滴一滴，時間也是。',
    pharmacy:  '藥局。窗口很小，要說的話很多。',
    family:    '家屬等候區。每個人都在看手機，每個人都在等一個消息。',
    lobby:     '掛號批價大廳。機器很多，會用的人很少。',
    service:   '服務台。大家都來問「某某在哪裡」，而它也常說「我幫你查」。',
    home:      '病患的家。手機亮了，嗡嗡嗡。',
    clinic:    '回診門診。燈箱上掛著片子，醫師看了三秒就說沒事。',
    notebook:  '調查筆記本。你寫下的每一句話，之後都要為它負責。'
  };

  var SFX = { E01: '嘰嘰喳喳…', E02: '嗚——嗚——！', E03: 'ＥＲＲ！ＥＲＲ！', E04: '咦？洗手間？', E05: '隆隆隆…', E06: '嗡！嗡！嗡！',
              E07: '咕嚕咕嚕～', E08: '呼——（忙翻）', E09: '吵！吵！吵！', E10: '嗶嗶嗶嗶！', E11: '嘰嘰喳喳…', E12: '碰！碰！碰！', E13: '砰！砰！！', E14: '哐啷——！' };
  var SFX_DEFAULT = ['！？', '碰！', '嗚哇——', '咦？'];

  var MUTTERS = {
    patient:       ['頭好暈…', '這簡訊誰寄的？', '還要等多久啊', '手機只剩 12%', '嗯…不要吐…', '為什麼是鳳梨酥？'],
    family:        ['他到底有沒有事', '看不懂啦', '要不要再送去', '又在滑手機', '我該陪他去的', '煩死了'],
    triage_nurse:  ['下一位！', '螢幕又壞了嗎', '血壓怎麼這麼高', '我也想坐下', '他在插隊嗎', '水…沒時間喝'],
    nurse:         ['同一句話第五遍', '說明單去哪了', '幾床要巡', '他有聽懂嗎', '腳好痠', '還有三位要說明'],
    er_doctor:     ['下一位。', '影像呢', '結果怎麼還沒出來', '他有沒有昏睡', '病歷…', '我需要咖啡'],
    clinic_doctor: ['片子沒問題', '頭痛多久了？', '他們都說不出來', '要不要發張紙', '嗯嗯嗯', '喝口茶'],
    volunteer:     ['阿公這邊坐', '我孫子昨天…', '簡訊在哪裡啊', '輪椅在哪呀', '大家都好辛苦', '今天要多站一會'],
    radiology:     ['別動別動', '輻射不用怕', '今天第幾位了', '咖啡好冷', '嗶——', '又在排隊'],
    guard:         ['請問找誰？', '又是一個人走', '這門怎麼又卡', '別在這邊停車', '好冷', '盯盯盯'],
    admin:         ['要評估', '這個要排預算', '又要開會', '資訊室明年才有空', 'LINE 帳號呢？', '簡報再改一版'],
    elder:         ['啊？', '單子貼冰箱', '手機不要', '他們說什麼', '我的藥呢', '肚子餓了'],
    teen:          ['腳好痛', '訊息好多', '媽怎麼還不來', '簡訊是什麼', 'LINE LINE LINE', '好無聊'],
    toddler_mom:   ['小安乖', '還要多久', '燒退了嗎', '要不要再量', '為什麼不叫號', '拜託快一點'],
    worker:        ['下午還要開會', '手好痛', '客戶在催', '又是廣告簡訊', '能不能快點', '毛巾濕了'],
    drunk:         ['我沒醉啦', '再來一杯', '那邊有 LINE', '嘿嘿嘿', '天花板在轉', '警衛好兇'],
    rowdy_family:  ['到底還要等多久', '叫號有在動嗎', '我媽在痛！', '你們有沒有在做事', '沒人理我', '為什麼他先進去'],
    rowdy_drunk:   ['我要找人', '這裡好亮', '嘿嘿', '呃…', '誰在叫我', '天旋地轉'],
    street_man:    ['歹勢歹勢', '腳有點痛', '不要麻煩人', '站那邊在整修', '袋子要抱好', '有水可以喝嗎'],
    trans_woman:   ['等一下別叫名字', '喉嚨好痛', '回去還要交稿', '口罩戴好', '應該不會叫到我吧', '深呼吸'],
    gay_partner:   ['他還好嗎', '我可以進去嗎', '要簽什麼', '怎麼跟他們說', '手機快沒電', '再等一下'],
    new_resident:  ['這個字什麼意思', '拍起來問先生', '肚子好痛', '字好小', '慢慢看慢慢看', '還要多久'],
    lonely_elder:  ['免啦免啦', '阿花去哪了', '單子在餅乾盒', '鈴聲又響了', '呷飽未', '我自己會處理'],
    migrant_caregiver: ['OK OK 我知道', '這個字…翻譯', '小姐沒有回 LINE', '阿公，醒醒', '不好意思再一次', 'ya ya'],
    er_director:   ['這個很重要', '你去找護理長', '五分鐘後有會', '指標呢？', '我請同仁處理', '（講電話）'],
    superintendent:['很好很好', '你哪個單位的？', '這個要寫進院訊', '智慧醫院', '主任比我清楚', '（握手）'],
    kid:           ['痛痛', '我要玩手機', '蛤？', '還要多久', '你是醫生嗎', '阿公的手機我會按'],
    kid_dad:       ['小米不要抓', '（回 LINE）', '不要碰水…還有呢', '要麻醉嗎', '阿公看不懂簡訊', '等一下就好']
  };

  var SHOCK = ['！！', '嚇死人', '快叫保全', '別過去', '好大聲', '怎麼了怎麼了', '又來了…'];
  var BOT_MUTTERS = ['這告示在寫什麼…', '嗯嗯我先記下來', '這個要問誰？', '好像有點怪', '先拍起來', '等一下再回來', '他剛剛是不是說了什麼'];
  var BOT_NAMES = ['小禾', '阿睿', '圓圓', '大森', '小綠', '阿翔'];

  /* 一般病患的碎念：依主訴與心情組出 */
  function genericMutters(pt) {
    var c = (pt && pt.complaint) || '不舒服';
    var base = ['還要等多久…', '好不舒服', '叫號怎麼還沒到', '我只是來看個' + c.slice(0, 4)];
    var byMood = { '很有耐心': ['慢慢來吧', '大家都很忙'], '有點焦躁': ['怎麼還不叫我', '早知道不來了'], '想快點回家': ['我還要上班', '快點快點'],
                   '擔心自己的狀況': ['不會有事吧', '要不要再問一次'], '覺得被忽略': ['沒人理我', '剛剛是不是跳過我'], '話很多': ['你聽我說喔', '我跟你講'] };
    return base.concat(byMood[pt && pt.mood] || ['嗯…']);
  }

  function hash(str) { var h = 7; for (var i = 0; i < String(str).length; i++) h = (h * 31 + String(str).charCodeAt(i)) >>> 0; return h; }

  /* 泡泡種類：驚嘆號→喊叫（鋸齒）、省略或問號→思考（雲朵）、其餘依雜湊在說話與碎念間挑 */
  function bubbleKind(text, key) {
    if (/[！!]/.test(text)) return 'shout';
    if (/[…？?]/.test(text)) return 'thought';
    return hash(key + text) % 3 === 0 ? 'speech' : 'mutter';
  }

  /* 在 7 秒的窗口內挑一句碎念；約三分之一的窗口安靜。回傳 { text, kind, window } 或 null。 */
  function mutterAt(lines, key, tSec) {
    if (!lines || !lines.length) return null;
    var w = Math.floor(tSec / 7), h = hash(key + ':' + w);
    if (h % 3 === 0) return null;
    var text = lines[h % lines.length];
    return { text: text, kind: bubbleKind(text, key), window: w };
  }

  function sfxFor(ev) {
    if (!ev) return null;
    if (SFX[ev.id]) return SFX[ev.id];
    return SFX_DEFAULT[hash(ev.id) % SFX_DEFAULT.length];
  }

  return { CAPTIONS: CAPTIONS, SFX: SFX, MUTTERS: MUTTERS, BOT_MUTTERS: BOT_MUTTERS, SHOCK: SHOCK, BOT_NAMES: BOT_NAMES,
           genericMutters: genericMutters, bubbleKind: bubbleKind, mutterAt: mutterAt, sfxFor: sfxFor, hash: hash };
});
