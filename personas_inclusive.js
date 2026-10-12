/* 包容性角色：街友、跨性別、同志伴侶、新住民、獨居低收入長輩。
   寫法原則：他們是有尊嚴、有自己判斷的人，不是受害者道具，也不是笑點；使用性問題從他們真實會遇到的處境自然長出來
   （沒有手機與地址、叫號喊本名、家屬定義不清、文件寫得像公文、沒人幫忙看手機）。人物與細節全是虛構模擬。
   🔴 台南街友服務的實際地點與時間，遊戲裡不給確切答案（沒有可靠依據）：山哥只會說「站那邊在整修，我們被請來請去」。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ERG_PERSONAS_INCL = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  var PERSONAS = [
    { id:'street_man', name:'山哥', title:'其他病患（街友，腳受傷）', core:false, tangent:'有', material:'模擬', decision:false,
      bio:'52 歲，在台南車站一帶生活。車站周邊在整修，常被請到別處。手機壞了沒換，證件放在朋友那裡，沒有固定地址。',
      look:{ skin:'#d9b38c', outfit:'#868e96', head:'square', hair:'tuft', eyes:'droopy', mouth:'flat', prop:'crutch' },
      speech:'慢、客氣、很怕麻煩別人，常說「歹勢」，不太看人的眼睛。',
      knows:['護理師問手機號碼，他說沒有；問聯絡地址，他說「火車站那邊」','簡訊與表單都找不到他','他知道哪裡有人可以幫忙洗澡換藥，但不確定現在還在不在'],
      unknown:['簡訊怎麼收','醫院的流程細節'],
      layers:{
        surface:'我沒什麼事啦，一下就好，歹勢。',
        events:['護理師問他手機號碼，他說沒有；問聯絡地址，他說「火車站那邊」，表格上不知道要填什麼，最後空白。','離院時有人說「會寄簡訊給你」，他沒有手機，點頭說好，因為不想讓人為難。'],
        need:'他沒有手機也沒有地址，簡訊和表單都找不到他。他需要的是紙本、大字、一次一件事的單子，寫著「腳如果更腫要去哪裡」「哪裡可以換藥、洗澡」，最好有人能面對面說一次。他最怕的是被當成麻煩。' },
      reactions:{ leading:'你說「是不是很難受」他會說「還好」，不想麻煩人；要問「那天你怎麼辦」他才會說實話。', jargon:'聽不懂就說「歹勢，我不太懂」。', repeat:'同一件事問第二次他會先道歉再重講。',
        sensitive:'被問為什麼沒有住處，他會停很久，轉頭看別處。', rapport:'你先問「腳還痛嗎」，或遞一杯水，他會慢慢放下防備。' },
      avail:{ moving:'free', acts:{ '候診':'free', '看診':'blocked', '領衛教與結帳':'short' }, eventBlocks:false },
      idle:['（把袋子抱在胸前）','（低頭看著腳）','（小聲說歹勢）'] },

    { id:'trans_woman', name:'小薇', title:'其他病患（跨性別女性，喉嚨痛）', core:false, tangent:'有', material:'模擬', decision:false,
      bio:'29 歲，台南的研究生，兼職做平面設計。她的健保卡上是舊名字。喉嚨痛發燒，來急診。',
      look:{ skin:'#f3c9a5', outfit:'#f783ac', head:'egg', hair:'curl', eyes:'dots', mouth:'flat', prop:'mask' },
      speech:'自然、有禮、講話有條理，偶爾自嘲一下。',
      knows:['叫號用健保卡上的名字','掛號表單性別欄只有兩個選項','她比較在意被叫名字那一刻，而不是等多久'],
      unknown:['醫院有沒有別的叫法'],
      layers:{
        surface:'沒事，就是個小感冒，等一下就好。',
        events:['候診時，櫃台用健保卡上的名字大聲叫她，候診區的人都抬起頭來看。','掛號表單的性別欄只有兩個選項，她停了很久，最後勾了離卡片上最近的那個。'],
        need:'她要的不是特別待遇，而是系統不要在大庭廣眾下喊出她不想被喊的名字——叫號用號碼或自己選的暱稱；表單的稱謂與性別欄位要有彈性，讓她自己決定怎麼被稱呼。這樣她才敢說出真正的症狀。' },
      reactions:{ leading:'你說「是不是被叫到名字很尷尬」，她會輕輕帶過；要問「那時你怎麼做」她才會講。', jargon:'聽得懂，也會回你同樣的語言。', repeat:'同樣的問題她會禮貌地說「剛剛講過了喔」。',
        sensitive:'被問私人的身體或過去，她會用一句話擋回去，直接說「那跟今天無關」。', rapport:'你先用中性的稱呼、不假設她的稱謂，她會比較放鬆。' },
      avail:{ moving:'short', acts:{ '候診':'free', '看診':'blocked', '填表':'short' }, eventBlocks:false },
      idle:['（戴上口罩）','（看手機上的訊息）','（小聲咳嗽）'] },

    { id:'gay_partner', name:'恩哥', title:'陪伴侶來的家屬（未登記的同志伴侶）', core:false, tangent:'有', material:'模擬', decision:false,
      bio:'34 歲，在科學園區上班。陪在一起九年的伴侶小傑來急診，小傑在觀察室打點滴。他們沒有登記。',
      look:{ skin:'#e8c7a1', outfit:'#4dabf7', head:'pear', hair:'bald', eyes:'dots', mouth:'frown', prop:'phone' },
      speech:'穩、說話有分寸，在人多的地方會把聲音壓低。',
      knows:['被問「你是病人的什麼人」時他停了一下','要簽同意書時他不確定自己能不能簽','護理師也不確定，要去問'],
      unknown:['醫院對「家屬」的明確定義'],
      layers:{
        surface:'我陪他來的，麻煩你們了。',
        events:['醫護問「你是病人的什麼人」，他停了一下，才回答「家屬」，對方請他出示證明，他一時拿不出來。','要簽同意書時，他不確定自己能不能簽，護理師也不確定，只好打電話問。'],
        need:'他們在一起九年，但沒有登記。醫院對「家屬」與「可簽署者」的規定沒有寫清楚，現場全靠護理師自己判斷。他要的是明確寫在表單上的「可簽署者」說明，以及不必在大廳裡解釋兩個人的關係。' },
      reactions:{ leading:'你說「是不是被刁難」他會說「也沒有，大家都很客氣」，但語氣有保留。', jargon:'聽得懂，法規的字眼他會再確認一次。', repeat:'會耐心再講一次，但越講越短。',
        sensitive:'被問為什麼沒登記，他會說「這是我們兩個人的事」。', rapport:'你不假設他們的關係，只問「你和他是怎麼認識醫院這裡的流程的」，他會放鬆。' },
      avail:{ moving:'short', acts:{ '登記成為家屬／探病':'short', '在家屬區等候':'free', '進去看伴侶':'blocked' }, eventBlocks:false },
      idle:['（看手機等消息）','（站起來又坐下）','（深呼吸）'] },

    { id:'new_resident', name:'阿蘭', title:'其他病患（新住民，肚子痛）', core:false, tangent:'有', material:'模擬', decision:false,
      bio:'33 歲，嫁來台南七年，在市場幫忙，先生在工廠上班。肚子痛來急診，自己一個人。',
      look:{ skin:'#f1d6b8', outfit:'#69db7c', head:'pear', hair:'curl', eyes:'dots', mouth:'flat', prop:'clipboard' },
      speech:'慢而認真，遇到不確定的字會停下來問，不會假裝懂。',
      knows:['日常的中文她沒問題','公文式的「宜」「勿」「務必」她不確定','文件字太小她都用手機拍照放大'],
      unknown:['醫療專有名詞'],
      layers:{
        surface:'看得懂啦，我慢慢看。',
        events:['簡訊她看得懂大概，但「宜」「勿」「務必」這種字她不確定，只好拍照傳給在工廠的先生問。','衛教單的字很小，她都用手機拍照再放大。'],
        need:'她不是看不懂，是文件寫得太像公文。她需要簡單的字、多一點圖示，還有能用手機放大或翻譯的版本，並且一次只講一件事。' },
      reactions:{ leading:'你說「是不是很難懂」她會說「有一點」，然後認真地想例子。', jargon:'會直接說「這個字什麼意思」。', repeat:'同一個問題她會換個方式想，答得更仔細。',
        sensitive:'被問到先生，她會簡短回答。', rapport:'你放慢語速、用簡單的字，她會很願意講。' },
      avail:{ moving:'short', acts:{ '候診':'free', '看診':'blocked' }, eventBlocks:false },
      idle:['（拿手機拍單子）','（對著手機小聲念）','（看著叫號螢幕）'] },

    { id:'lonely_elder', name:'賴阿嬤', title:'其他病患（獨居長輩）', core:false, tangent:'有', material:'模擬', decision:false,
      bio:'81 歲，獨居在中西區的老厝，兒子在外地工作。領有低收入補助，鄰居阿花常幫她看手機。今天是阿花載她來的，現在去停車了。',
      look:{ skin:'#e8c7a1', outfit:'#da77f2', head:'pear', hair:'curl', eyes:'droopy', mouth:'open', prop:'crutch' },
      speech:'台灣華語夾台語詞，慢慢講，愛說「免啦免啦」，講到一半會想起別的事。',
      knows:['所有單子她都收在餅乾盒裡','手機響了她只知道是鈴聲','鄰居阿花會幫她看'],
      unknown:['簡訊是什麼','哪張單子是哪一張'],
      layers:{
        surface:'免啦免啦，我自己會處理。',
        events:['醫護請她回家照著簡訊的說明做，她說家裡沒有人幫她看手機。','她把所有單子都收在餅乾盒裡，哪張是哪張自己也分不清。'],
        need:'她需要有人（社工、里長、鄰居）接得上，單子要簡單、一次一件事，最好有人打電話確認她回家後有沒有事。簡訊對她來說只是一個會響的聲音。' },
      reactions:{ leading:'你問什麼她都說「好啦好啦」，要問「那天你回家怎麼辦」她才會講實話。', jargon:'完全聽不懂，會說「你講慢一點」。', repeat:'會重複講同一個故事。',
        sensitive:'被問到兒子，她會說「他很忙啦」，轉話題。', rapport:'你用台語詞打招呼，問「呷飽未」，她就會講很多。' },
      avail:{ moving:'short', acts:{ '候診':'free', '看診':'blocked' }, eventBlocks:false },
      idle:['（把餅乾盒抱在腿上）','（東張西望找阿花）','（拍拍膝蓋）'] }
  ];

  return { PERSONAS: PERSONAS };
});
