/* 步驟助教核心（F⑩）：Figma→AI Studio 單元的規則式助教，純函式，不呼叫模型、不連網、不寫資料庫。
   與 _figma_mcp/助教原型_1108/index.html 裡 id="coach-core" 的那段內容逐字相同（test_figai_coach.js 會比對，改了要兩邊一起改）。
   瀏覽器：全域 FigCoach；Node：require('./figai_coach.js')。畫面層見 figai_coach_ui.js。 */
/* 助教核心（純函式，Node 與瀏覽器共用）。規則式，不呼叫模型。
   依 F⑧ 三模式教材與助教介入點：新手 9 步全程帶領（等級 1 方向／2 例子／3 示範／4 代填）、
   中級被動（卡住或停太久才出現，只到等級 2）、專家只在交出後給評語（不改寫、不給做法），主動求助最多等級 1。
   自動出現的第 1 級不扣名額；「我卡住了」、再多一點（等級請求）、代填各扣 1 次名額（每天 30）。 */
var FigCoach = (function () {
  'use strict';
  var COACH_PER_DAY = 30, FILL_CAP = { novice: 4, mid: 0, expert: 0 };
  var MODES = { novice: { name: '新手' }, mid: { name: '中級' }, expert: { name: '專家' } };
  var CAPS = { 1: 70, 2: 110, 3: 130, 4: 90, review: 70, fillBody: 260 };   /* 助教文字字數上限（算字元）；fillBody＝代填進欄位的指令本文 */
  var LEVEL_NAME = { 1: '方向', 2: '例子', 3: '示範', 4: '代填' };
  var FORBIDDEN = ['分數', '評分', '給你幾分', '我幫你設計', '你的設計不好', '應該用藍色'];
  var PRIVACY = /\d{7,}|\b4[a-z0-9]{2}[a-z]\d{4}\b|[A-Z][12]\d{8}|病歷號|身分證|姓名[：:]|\d{2,4}年\d{1,2}月\d{1,2}日/i;

  var STEPS = {
    novice: [[1, '挑樣板玩一遍', ['n1a', 'n1b']], [2, '複製到自己的草稿', ['copied']], [3, '只改三個地方', ['chg1', 'chg2', 'chg3', 'ans1', 'ans2', 'ans3']],
             [4, '匯出成圖片', ['exported']], [5, '第一段「還原」', ['prompt1', 'confirmed1', 'sent1']], [6, '第二段「互動」', ['opt', 'prompt2', 'confirmed2']],
             [7, '四項檢查', ['c1', 'c2', 'c3', 'c4', 'missing', 'fixPrompt']], [8, '找一位同學試用', ['secs', 'taps', 'stopAt']], [9, '交件', ['share1', 'share2', 'summary']]],
    mid: [[1, '先拆開畫面', ['blocks', 'inter', 'states']], [2, '在 Figma 準備畫面', ['screens']], [3, '匯出並做第一段「還原」', ['promptA']], [4, '校正', ['calib']],
          [5, '一次加一個互動', ['promptB', 'featN', 'saved', 'mapping']], [6, '對照與改版', ['versions', 'changelog']], [7, '四項檢查', ['c1', 'c2', 'c3', 'c4']],
          [8, '找人試用再改一輪', ['secs', 'taps', 'stopAt']], [9, '交件', ['share1', 'share2']]],
    expert: [[1, '設計規則檔', ['rules']], [2, '依規則畫多個畫面', ['screensX']], [3, '交給 AI Studio', ['promptX']], [4, '選用：驗證一致性', ['cmp']],
             [5, '啟發式自評', ['heur']], [6, '至少三個版本', ['verX']], [7, '試用與回應', ['trialX']], [8, '交件', ['share1', 'share2']]]
  };
  STEPS = (function (o) { var r = {}; Object.keys(o).forEach(function (m) { r[m] = o[m].map(function (s) { return { n: s[0], title: s[1], fields: s[2] }; }); }); return r; })(STEPS);

  /* F⑧ 總覽的五關：1 準備畫面、2 匯出並交給 AI Studio、3 加上互動、4 檢查與修正、5 試用與交件；每一步屬於哪一關（專家第 3 步橫跨 2、3） */
  var GATE_NAME = { 1: '準備畫面', 2: '匯出並交給 AI Studio', 3: '加上互動', 4: '檢查與修正', 5: '試用與交件' };
  var GATES = { novice: { 1: [1], 2: [1], 3: [1], 4: [2], 5: [2], 6: [3], 7: [4], 8: [5], 9: [5] },
                mid: { 1: [1], 2: [1], 3: [2], 4: [2], 5: [3], 6: [4], 7: [4], 8: [5], 9: [5] },
                expert: { 1: [1], 2: [1], 3: [2, 3], 4: [2], 5: [4], 6: [4], 7: [5], 8: [5] } };
  var P1 = '請照著這張手機畫面做一個網頁，寬度 390。每一句文字都要照圖上的原文，不要改寫、不要增加內容。顏色和排版盡量和圖一樣。不要接任何外部服務。';
  var OPTS = { 1: ['整行的選項', '不同的說明'], 2: ['回診提醒開關', '打開或關閉的狀態'], 3: ['展開', '更多說明，再點一次收起來'] };
  function p2(o) { return '在目前的畫面上只加一個互動：點「' + OPTS[o][0] + '」會出現「' + OPTS[o][1] + '」。點整個區塊都能觸發，不只是文字。其他地方都不要動。不要真的傳送任何資料。'; }
  var FIX = {
    1: function (S) { return '有字不見了。請補回缺少的字，其他都不要動。缺少的字是：' + (tr(S.f.missing) || '＿＿'); },
    2: function () { return '版面跑掉了。請只調整間距和字級，讓它和我給的圖一樣；文字、顏色、功能都不要動。'; },
    3: function (S) { return '按鈕點了沒反應。請只修「' + (OPTS[S.f.opt] ? OPTS[S.f.opt][0] : '＿＿') + '」這個互動，其他功能都不要動。'; }
  };

  /* 新手：進入該步驟時自動出現（第 5 步是代填，第 6 步等學生選了互動才代填） */
  var N_ENTER = {
    1: '流程有幾步、哪一句話在告訴你下一步？先寫下數字。',
    2: '把樣板複製成你自己的草稿，只改你自己的那份，不要改樣板原本的。',
    3: '只改三處：標題、一句引導的話、危險訊息挪到最上面。先選哪一處？',
    4: '先在左側 Layers（圖層）點整個畫面，再按右側最下面 Export（匯出）旁的 ＋，選 PNG、1x。',
    6: '想加哪一個互動？選一個，我幫你填指令。',
    7: '四項檢查逐項勾，沒過的我再給你一句救火指令。',
    8: '你不能講話，只記三件事：幾秒、點幾下、停在哪一句話。',
    9: '交出匯出的 PNG 和 AI Studio 連結（連結要開分享），再寫這一版做了什麼。'
  };
  var N_LEVEL2 = {
    3: '改完問自己：這句話有告訴人現在該做什麼？看到的人知道做完會怎樣？危險訊息一眼看得到嗎？',
    4: '找不到 Export（匯出）：先點整個畫面，不要點裡面的小方塊，右側面板最下面就是 Export（匯出）。',
    5: '送出後一直轉圈：等 5 分鐘；真的沒動靜才重送一次，而且只重送一次。',
    6: '點整個區塊都要有反應，不只是文字；沒反應就把「點哪個」寫得更明確。'
  };
  var N_SENT = '等 2 到 5 分鐘，不要重送。等的時候先看第 7 步的檢查表。';
  var N_FIX3 = {
    1: '字掉了：貼這句指令，把缺的字補上。「有字不見了。請補回缺少的字，其他都不要動。缺少的字是：＿＿」',
    2: '版面跑掉：貼這句。「版面跑掉了。請只調整間距和字級，讓它和我給的圖一樣；文字、顏色、功能都不要動。」',
    3: '按鈕沒反應：貼這句。「按鈕點了沒反應。請只修「＿＿」這個互動，其他功能都不要動。」',
    4: '畫面上有真人資料：換成練習資料，重新匯出再上傳，不要送出含真人資料的圖。'
  };
  var N_NEXT = {
    1: function (S) { return (isBlank(S.f.n1a) || isBlank(S.f.n1b)) ? '還沒寫下流程幾步、引導的句子幾句。' : ''; },
    2: function (S) { return !S.f.copied ? '你的草稿檔名旁邊有你的名字嗎？確認不是改到樣板原本的。' : ''; },
    3: function (S) { var n = ['chg1', 'chg2', 'chg3'].filter(function (k) { return S.f[k]; }).length, a = ['ans1', 'ans2', 'ans3'].filter(function (k) { return S.f[k]; }).length; return (n < 3 || a < 3) ? '三處要都改了，三個問題也要答「有」（目前改了 ' + n + ' 處、答 ' + a + ' 題）。' : ''; },
    5: function (S) { return !S.f.confirmed1 ? '指令要先確認內容才能複製。' : (!S.f.sent1 ? '圖附上、送出了嗎？' : ''); },
    6: function (S) { return isBlank(S.f.opt) ? '先選一個互動。' : (!S.f.confirmed2 ? '指令要先確認內容才能複製。' : ''); },
    7: function (S) { var k = [1, 2, 3, 4].filter(function (i) { return !S.f['c' + i]; }).length; return k ? '還有 ' + k + ' 項檢查沒過。' : ''; },
    9: function (S) { return (!S.f.share1 || !S.f.share2 || isBlank(S.f.summary)) ? '要附匯出的 PNG，AI Studio 連結也要開分享，還要寫這一版做了什麼。' : ''; }
  };
  /* 卡住時（先問卡在哪，再給下一步提示）：每條 [選項文字, 等級1, 等級2] */
  /* 卡住選項「Claude 說用量快滿」：先停手、等重設、去做不耗額度的事 */
  var LIMIT_OPT = ['Claude 說用量快滿', '先停手，不要再生成新畫面，看提示裡寫的重設時間。', '等重設的時候，在 Figma 手動調整畫面，再按右側最下面 Export（匯出）旁的 ＋ 輸出 PNG。'];
  var STUCK = {
    novice: { 1: { limit: LIMIT_OPT }, 2: { limit: LIMIT_OPT }, 3: { limit: LIMIT_OPT }, 4: { export: ['找不到 Export（匯出）', '先在左側 Layers（圖層）點整個畫面，不要點裡面的小方塊。', '右側面板最下面 Export（匯出）旁的 ＋ 按下去，格式選 PNG、1x。'] },
              5: { spin: ['一直轉圈', '先等 5 分鐘，不要重送。', '真的沒動靜才重送一次，而且只重送一次。'] },
              6: { noreact: ['按鈕點了沒反應', '重看你選的互動，點哪個、出現什麼。', '把「點哪個」寫得更明確再重送一次第 6 步。'] },
              7: { missing: ['預覽少了字', '先用第 7 步的救火指令。', '指令後面再加一句「缺少的字是：＿＿」。'] } },
    mid: { 1: { limit: LIMIT_OPT }, 2: { limit: LIMIT_OPT }, 3: { rewrite: ['說明的字被改寫', '把每一句原文貼進指令。', '加一句「逐字照用，不要改寫」。'] },
           4: { limit: LIMIT_OPT, claude: ['Claude 讀不到畫面', '確認你貼的是自己 Figma 檔案裡畫面的連結。', '貼的要是畫面的連結，不是整個檔案的連結；不行就手抄字級與間距。'] },
           5: { oldbroke: ['加了新互動，舊的壞掉', '按那次回覆下方的 Restore（還原），退回上一版。', '重新加，指令開頭寫「只修改下面說明的部分，其他完全不要動」。'] } }
  };
  var M_DIR = {
    1: '先寫出：有幾個區塊、點了會怎樣、有哪幾個狀態。', 2: '每個狀態畫成一個畫面，名稱寫清楚。', 3: '三件事：逐字照原文、寬度 390、不接外部服務。',
    4: '兩種做法：用 Claude 取尺寸表，或自己在 Figma 抄字級與間距。', 5: '一次只加一個功能，加完先自己點一遍。', 6: '每改一版，截圖貼回 Figma，寫改了什麼、為什麼。',
    7: '四項檢查逐項看，有沒過的先想原因。', 8: '你不能講話，只記幾秒、點幾下、停在哪一句。', 9: '附匯出的 PNG 和 AI Studio 連結（要開分享），寫每一版改了什麼。'
  };
  var M_LEVEL2 = { 3: '說明的字被改寫：把每一句原文貼進指令，要求逐字照用。', 5: '舊的壞掉，就按那次回覆下方的 Restore（還原）回到上一版，再加新的，並寫「其他功能都不要動」。' };
  var M_CAUSE = { 1: '常見原因：指令沒要求逐字照原文。', 2: '字體不同會差一點，差在 2 px 以內就不用調。', 3: '常見原因：指令沒寫清楚點哪個、出現什麼。', 4: '先把真人資料換成練習資料，再重新上傳。' };
  var M_NEXT5 = { multi: '一次只加一個功能，這一段先留一個。', save: '成功的這一段指令存起來，壞了才退得回去。', map: '這個按鈕對應你訪談到的哪一句話？' };
  var AVAIL = { novice: { 1: [1], 2: [1], 3: [1, 2], 4: [1, 2], 5: [1, 2, 4], 6: [1, 2, 4], 7: [1, 3, 4], 8: [1], 9: [1] },
                mid: { 1: [1], 2: [1], 3: [1, 2], 4: [1], 5: [1, 2], 6: [1], 7: [2], 8: [1], 9: [1] } };

  /* ———— 英文介面字樣表：Figma 與 AI Studio 都沒有中文介面，學生會怕英文，所以助教每次提到按鈕都寫「英文（中文意思）」並說位置。
     字樣與中文意思照 _figma_mcp/英文按鈕中文對照_1108.md（只收 11-08 實測看到的字）；測試會檢查每則提示的寫法。 */
  var UI_TERMS = { 'Export': '匯出', 'Layers': '圖層', 'Preview': '預覽', 'Restore': '還原', 'Upload Files': '上傳檔案', 'Acknowledge': '我知道了', 'Drafts': '草稿', 'Design': '設計' };
  var POS_WORDS = /左側|右側|左下|右下|右上|左上|最下面|最上面|輸入框|下方|上方|旁|視窗|回覆|面板|灰字/;
  /* Claude 免費帳號有 5 小時用量上限：先想好再送，不要一直重試（原文提示例：您的 5 小時限制已使用超過 90% · 將於 上午1:00 重設） */
  var CLAUDE_LIMIT = {
    short: '5 小時內約 4～5 次生成、3～4 次小修改，先想好再送',
    tips: [
      '免費帳號每 5 小時有用量上限，大約夠做 4～5 次生成＋3～4 次小修改（請 Claude 讀 Figma 約 2 次）。這是估計，因人、因時段而不同。',
      '一次把指令寫完整：畫板數量、寬度、每個畫板的名稱、主色、文字都寫在同一則，不要分很多則補。',
      '要改就在同一個對話追加：「只修改『3 回診提醒』畫板，把按鈕改成橘色，其他不要動」，不要開新對話重新生成。',
      '看到輸入框上方出現「您的 5 小時限制已使用超過 90% · 將於 上午1:00 重設」，就先停手，去做不耗額度的事：在 Figma 手動調整，再按右側最下面 Export（匯出）旁的 ＋ 輸出 PNG。'
    ]
  };

  /* ———— 步驟素材表：每一步掛 Figma／AI Studio／Claude 免費版的實測截圖與一句指示（圖是檔案，放 demo_data/figai_img/，不塞進 js） ————
     只收 Claude 免費版、官方 Figma 連接器、Figma 免費、AI Studio 免費層實測過的做法；交件用匯出，不寫分享 Design。 */
  var IMG_DIR = 'demo_data/figai_img/';
  var MEDIA = {
    figma_start: 'Figma 裡的樣板畫面，左邊是圖層、右邊是屬性欄', figma_select: 'Figma：左側圖層點選整個畫面，畫面出現藍框', figma_export: 'Figma 右邊屬性欄最下面的 Export 區，選 PNG、1x',
    figma_exported: '匯出後得到的 PNG 圖片', figma_screen: '你在 Figma 畫好的手機畫面（寬 390）',
    ais_home: 'Google AI Studio 首頁的輸入框', ais_upload: 'AI Studio 上傳圖片後，圖片出現在輸入框上方', ais_prompt: 'AI Studio 貼好指令、附好圖，準備送出',
    ais_done: 'AI Studio 生成完成', ais_preview: 'AI Studio 右邊的預覽，應該和 Figma 畫面一樣', ais_second: 'AI Studio 第二段互動做完',
    ais_try1: '試用前：畫面上的選項還沒勾', ais_try3: '勾了三項之後的畫面', ais_try4: '按下按鈕後跳出的視窗', ais_try5: '按下「知道了」後視窗關閉',
    free_read: 'Claude 免費版貼上 Figma 畫面連結，讀出每個元件的尺寸（只能讀）', free_connector: 'Claude 設定的連接器頁，Figma 打勾就是接好了',
    claude_limit: 'Claude 輸入框上方的提示條：您的 5 小時限制已使用超過 90%，將於 上午1:00 重設', dsg_gen: 'Claude 免費版用一句話生成設計畫板', dsg_edit: '再用一句話修改畫板：只改「回診當天」的卡片，其他部分不要動', dsg_d1: '新手題生出來的兩個畫板'
  };
  var STEP_MEDIA = {
    novice: { 1: [['ais_try1', 'ais_try3'], '打開樣板，每個按鈕都點一次，數一數流程有幾步。'], 2: [['figma_start'], '把樣板複製成自己的草稿，看檔名下方的灰字，Drafts（草稿）代表放在你自己的草稿夾。'], 3: [['figma_screen'], '只改標題、一句引導的話，並把危險訊息挪到最上面。'],
      4: [['figma_select', 'figma_export'], '先在左側 Layers（圖層）點整個畫面，看到藍框，再按右側最下面 Export（匯出）旁的 ＋，選 PNG、1x。'], 5: [['ais_home', 'ais_upload', 'ais_prompt', 'ais_done'], '按輸入框左下角的 ＋，選 Upload Files（上傳檔案）附上 PNG，貼上指令，再按右下角的 ↑（送出）；等 2 到 5 分鐘。'],
      6: [['ais_second', 'ais_try4'], '一次只加一個互動，加完自己點一遍。'], 7: [['ais_preview', 'figma_screen'], '把右側 Preview（預覽）和 Figma 的畫面並排看，四項逐項打勾。'],
      8: [['ais_try4', 'ais_try5'], '請同學照任務點一遍，你只記秒數、點幾下、停在哪一句。'], 9: [['figma_exported', 'ais_preview'], '交出匯出的 PNG 和 AI Studio 連結（連結要開分享）。'] },
    mid: { 1: [['figma_start'], '先在紙上寫出區塊、互動、狀態，再動手。'], 2: [['figma_select'], '每個狀態畫成一個畫面，名稱寫清楚，寬 390。'], 3: [['figma_export', 'ais_prompt'], '右側最下面 Export（匯出）旁的 ＋ 輸出 PNG、1x；到 AI Studio 按輸入框左下 ＋ 選 Upload Files（上傳檔案）附上。'],
      4: [['free_connector', 'free_read'], '校正：用 Claude 免費版讀 Figma 尺寸（只能讀），或自己手抄。'], 5: [['ais_second'], '一次只加一個功能，成功的那一段指令存起來。'],
      6: [['ais_preview', 'figma_screen'], '右側 Preview（預覽）截圖貼回 Figma，排在原版旁邊，寫改了什麼。'], 7: [['ais_preview'], '四項檢查逐項看，沒過的先想原因。'],
      8: [['ais_try4'], '照任務請人試用，你不能講話，只記秒數、點擊和停住的地方。'], 9: [['figma_exported', 'ais_preview'], '交出匯出的 PNG 和 AI Studio 連結（連結要開分享）。'] },
    expert: { 1: [['figma_select'], '規則裡的色碼、字級、間距，在 Figma 右側面板的 Design（設計）分頁都量得到。'], 2: [['figma_start'], '依規則畫多個畫面，全部用同一組樣式。'], 3: [['ais_prompt', 'ais_second'], '把 DESIGN.md 貼進指令，互動一次只加一個功能。'],
      4: [['free_read', 'free_connector'], '選用：Claude 免費版接 Figma 只能讀；連不上就手動比對。'], 5: [['ais_preview'], '自評十項，每項寫符合、不符合或不適用，並加嚴重程度。'],
      6: [['ais_preview', 'figma_screen'], '每一版寫改了什麼、依據、結果；截圖貼回 Figma 對照。'], 7: [['ais_try4'], '找至少兩位試用者，沒解決的問題也要寫。'],
      8: [['figma_exported', 'ais_preview'], '交出匯出的 PNG、AI Studio 連結（要開分享）、DESIGN.md 和三版對照。'] }
  };
  /* 第 1 關「用 Claude 生一張初稿」的示範：一句話生成、再一句話修改（Claude 免費版，只在對話裡生成與修改，不會改你的 Figma） */
  var START_MEDIA = { gen: [['dsg_gen', 'dsg_d1', 'dsg_edit', 'claude_limit'], '用一句話生成草稿畫板，再用一句話修改；一次只改一處。'] };
  /* 卡住時選了某個原因：附對應的圖與一句指示 */
  var LIMIT_MEDIA = [['claude_limit'], '看到「已使用超過 90%」先停手；去做 Figma 手動調整與匯出，等重設時間再繼續。'];
  var STUCK_MEDIA = {
    novice: { 1: { limit: LIMIT_MEDIA }, 2: { limit: LIMIT_MEDIA }, 3: { limit: LIMIT_MEDIA }, 4: { export: [['figma_select', 'figma_export'], '先在左側 Layers（圖層）點整個畫面，再看右側最下面的 Export（匯出）。'] }, 5: { spin: [['ais_prompt'], '送出後一直轉圈：先等 5 分鐘，不要重送。'] },
      6: { noreact: [['ais_try4'], '按鈕沒反應：把「點哪個、出現什麼」寫得更明確再送一次。'] }, 7: { missing: [['ais_preview', 'figma_screen'], '把右側 Preview（預覽）和 Figma 的畫面並排對，找出哪一句不見了，再補指令。'] } },
    mid: { 1: { limit: LIMIT_MEDIA }, 2: { limit: LIMIT_MEDIA }, 3: { rewrite: [['ais_prompt'], '把每一句原文貼進指令，加一句「逐字照用」。'] }, 4: { limit: LIMIT_MEDIA, claude: [['free_connector', 'free_read'], '設定的連接器頁看到 Figma 打勾；貼的是畫面連結，不是整個檔案的連結。'] },
      5: { oldbroke: [['ais_second'], '按那次回覆下方的 Restore（還原）回到上一版，再加新的，並寫「其他功能都不要動」。'] } }
  };
  /* 什麼時候主動冒出圖：新手＝進入步驟、停留過久、卡住選項、「下一步」沒過、再多一點；中級＝只有停留過久、卡住選項、「下一步」沒過、再多一點，加第 4 步預告；專家＝只有主動按「方向」。
     另外「接手」（離開再回來）與「看這一步的示範圖」按鈕三種模式都有。 */
  var MEDIA_ON = { novice: { enter: 1, idle: 1, stuck: 1, next: 1, level: 1 }, mid: { enter: 1, idle: 1, stuck: 1, next: 1, level: 1 }, expert: { level: 1 } };
  function mediaList(ids) { return ids.map(function (id) { return { id: id, src: IMG_DIR + id + '.webp', alt: MEDIA[id] || id }; }); }
  function stepMedia(mode, step) { var m = (STEP_MEDIA[mode] || {})[step]; return m ? { media: mediaList(m[0]), mediaLine: m[1] } : null; }
  function attach(r, S, step, trigger, key) {
    if (!r || !r.ok || !(MEDIA_ON[S.mode] || {})[trigger]) return r;
    if (trigger === 'enter' && S.mode === 'mid' && step !== 4) return r;   /* 中級被動：只有第 4 步預告 */
    var m = key && ((STUCK_MEDIA[S.mode] || {})[step] || {})[key];
    var x = m ? { media: mediaList(m[0]), mediaLine: m[1] } : stepMedia(S.mode, step);
    if (x) { r.media = x.media; r.mediaLine = x.mediaLine; r.mediaWhy = trigger; }
    return r;
  }
  function showMedia(S, step) {   /* 「看這一步的示範圖」：不扣名額 */
    var x = stepMedia(S.mode, step); if (!x) return no('bad.input', '', 'step');
    var r = out('G.media', 1, x.mediaLine); r.media = x.media; r.mediaLine = x.mediaLine; r.mediaWhy = 'button'; return r;
  }
  /* 接手：學生離開再回來。pos＝本機紀錄 { lv, step, t }（只記做到哪一步，不記內容） */
  function resume(S, pos, now) {
    var st = STEPS[S.mode] && pos && STEPS[S.mode][Number(pos.step) - 1];
    if (!st || (pos.lv && pos.lv !== ({ novice: 1, mid: 2, expert: 3 })[S.mode])) return no('resume.none', '', 'none');
    var g = GATES[S.mode][st.n], mins = Math.max(0, Math.round(((now || Date.now()) - Number(pos.t || 0)) / 60000));
    var ago = !pos.t ? '' : (mins < 1 ? '剛剛' : mins < 60 ? '約 ' + mins + ' 分鐘前' : mins < 1440 ? '約 ' + Math.round(mins / 60) + ' 小時前' : '約 ' + Math.round(mins / 1440) + ' 天前');
    var r = out('R.resume', 1, '你上次做到第 ' + g.join('、') + ' 關・步驟 ' + st.n + '：' + st.title + (ago ? '（' + ago + '）' : '') + '，從這裡繼續。');
    var x = stepMedia(S.mode, st.n); if (x) { r.media = x.media; r.mediaLine = x.mediaLine; r.mediaWhy = 'resume'; } r.step = st.n; return r;
  }

  var E_LEVEL1 = '先自己對照交件檢核：哪一項你最沒把握？';

  function len(s) { return Array.from(String(s || '')).length; }
  function tr(v) { return String(v == null ? '' : v).trim(); }
  function isBlank(v) { return v === undefined || v === null || v === false || tr(v) === ''; }
  function lines(v) { return tr(v).split(/\n+/).map(tr).filter(Boolean); }
  function privacyHit(S) { return Object.keys(S.f).some(function (k) { return typeof S.f[k] === 'string' && PRIVACY.test(S.f[k]); }); }
  function newState(mode) { return { mode: mode || 'novice', f: {}, ai: {}, used: { stuck: 0, level: 0, fill: 0, review: 0, auto: 0 }, fillsDone: 0, stuckN: {} }; }
  function quotaUsed(S) { return S.used.stuck + S.used.level + S.used.fill; }
  function out(id, level, text, extra) { var r = { ok: true, id: id, level: level, text: text }; if (extra) Object.keys(extra).forEach(function (k) { r[k] = extra[k]; }); return r; }
  function no(id, text, reason) { return { ok: false, id: id, level: 0, text: text, reason: reason }; }
  function charge(S, r, kind) { if (r.ok) S.used[kind] += 1; return r; }

  function guard(S, step, charged) {
    if (!STEPS[S.mode] || !STEPS[S.mode][step - 1]) return no('bad.input', '步驟不對。', 'step');
    if (charged && quotaUsed(S) >= COACH_PER_DAY) return no('quota', '今天助教的次數用完了，明天再問。', 'quota');
    return null;
  }
  function privacyMsg() { return '先看一下：你寫的字裡有像號碼、姓名或日期的內容，換成練習資料再繼續。'; }
  function doFill(S, field, text) {
    if (privacyHit(S)) return no('privacy', privacyMsg(), 'privacy');
    if (S.fillsDone >= FILL_CAP[S.mode]) return no('fill.cap', '代填最多 ' + FILL_CAP[S.mode] + ' 次，其他自己寫寫看。', 'cap');
    S.fillsDone += 1; S.used.fill += 1; S.f[field] = text; S.ai[field] = true; delete S.f['confirmed' + (field === 'prompt1' ? 1 : 2)];
    return null;
  }

  /* 進入步驟（新手自動出現；中級只有第 4 步會預告兩種做法） */
  function enter(S, step) {
    var g = guard(S, step, false); if (g) return g;
    if (S.mode === 'novice') {
      if (step === 5) {
        if (!isBlank(S.f.prompt1)) { S.used.auto += 1; return out('N5.back', 1, '第一段指令已經填好了，確認後再複製；想重填請按「代填」。'); }   /* 再回到這一步不重填、不多扣代填次數 */
        if (quotaUsed(S) >= COACH_PER_DAY) return no('quota', '今天助教的次數用完了，明天再問。', 'quota');
        var e = doFill(S, 'prompt1', P1); if (e) return e;
        return attach(out('N5.fill', 4, '指令幫你填好了，確認內容再複製。第一次上傳跳出同意視窗，按裡面的 Acknowledge（我知道了）。', { fill: { prompt1: P1 } }), S, 5, 'enter');
      }
      S.used.auto += 1; return attach(out('N' + step + '.enter', 1, N_ENTER[step]), S, step, 'enter');
    }
    if (S.mode === 'mid' && step === 4) { S.used.auto += 1; return attach(out('M4.enter', 1, M_DIR[4]), S, 4, 'enter'); }
    return no('enter.none', '', 'none');
  }
  function sent(S) { if (S.mode !== 'novice') return no('enter.none', '', 'none'); S.used.auto += 1; return out('N5.sent', 1, N_SENT); }

  /* 停留過久：新手第 4 步 3 分鐘，其他 5 分鐘 */
  function idle(S, step, min) {
    var g = guard(S, step, false); if (g) return g;
    if (S.mode === 'expert') return no('enter.none', '', 'none');
    if (S.mode === 'novice' && step === 4 && min >= 3) { S.used.auto += 1; return attach(out('N4.idle', 2, N_LEVEL2[4]), S, 4, 'idle'); }
    if (min >= 5) { S.used.auto += 1; return attach(out(S.mode === 'novice' ? 'N.idle' : 'M.idle', 1, '卡住了嗎？按「我卡住了」，告訴我卡在哪。'), S, step, 'idle'); }
    return no('idle.none', '', 'none');
  }

  /* 我卡住了：不帶 choice 先問卡在哪；帶 choice 才給提示（第一次等級 1、再按等級 2），扣名額 */
  function stuck(S, step, choice) {
    var g = guard(S, step, true); if (g) return g;
    if (S.mode === 'expert') return no('mode.denied', '專家模式助教只在你交出後給評語。', 'denied');
    var tab = (STUCK[S.mode] || {})[step];
    if (!choice) {
      if (!tab) return charge(S, out('stuck.generic', 1, '卡在哪一步的哪個地方？寫一句，我再給你下一步的提示。'), 'stuck');
      return charge(S, out('stuck.ask', 1, '卡在哪？' + Object.keys(tab).map(function (k) { return tab[k][0]; }).join('、') + '。'), 'stuck');
    }
    if (!tab || !tab[choice]) return no('bad.input', '', 'choice');
    var key = S.mode + step + choice, n = S.stuckN[key] = (S.stuckN[key] || 0) + 1, lv = n >= 2 ? 2 : 1;
    return attach(charge(S, out('stuck.' + S.mode + '.' + step + '.' + choice + '.L' + lv, lv, tab[choice][lv]), 'stuck'), S, step, 'stuck', choice);
  }

  /* 再多一點（等級請求）：新手 1–4、中級 1–2、專家只到 1 */
  function level(S, step, lv, o) { return attach(levelCore(S, step, lv, o), S, step, 'level'); }
  function levelCore(S, step, lv, o) {
    o = o || {}; var g = guard(S, step, true); if (g) return g;
    if ([1, 2, 3, 4].indexOf(lv) < 0) return no('bad.input', '', 'level');
    if (S.mode === 'expert') return lv === 1 ? charge(S, out('E.level1', 1, E_LEVEL1), 'level') : no('mode.denied', '專家模式只有方向，沒有例子、示範和代填。', 'denied');
    if (AVAIL[S.mode][step].indexOf(lv) < 0) return no('level.max', '這一步沒有更深的提示了。', 'max');
    if (S.mode === 'mid') {
      if (lv === 1) return charge(S, out('M' + step + '.level1', 1, M_DIR[step]), 'level');
      if (step === 7) { var it = o.item; if (!(it >= 1 && it <= 4)) return no('bad.input', '', 'item'); return charge(S, out('M7.cause.' + it, 2, M_CAUSE[it]), 'level'); }
      return charge(S, out('M' + step + '.level2', 2, M_LEVEL2[step]), 'level');
    }
    if (lv === 1) return charge(S, out('N' + step + '.enter', 1, step === 5 ? '指令範本是固定的：照圖還原、不改寫、不接外部服務。' : N_ENTER[step]), 'level');
    if (lv === 2) return charge(S, out('N' + step + '.level2', 2, N_LEVEL2[step]), 'level');
    if (step === 7) {
      var i = o.item; if (!(i >= 1 && i <= 4)) return no('bad.input', '', 'item');
      if (lv === 3) return charge(S, out('N7.fix3.' + i, 3, N_FIX3[i]), 'level');
      if (i === 4) return no('N7.fill.denied', '有真人資料的畫面助教不代填，請你自己換成練習資料。', 'denied');
      if (i === 1 && isBlank(S.f.missing)) return no('fill.needinfo', '先在「缺少的字」填上缺的字，我才能幫你填。', 'needinfo');
      var e7 = fixFill(S, FIX[i](S)); if (e7) return e7;
      return out('N7.fill.' + i, 4, '救火指令幫你填好了，確認後再複製。', { fill: { fixPrompt: S.f.fixPrompt } });
    }
    /* lv 4：第 5 步重填、第 6 步依選擇代填 */
    if (step === 5) { var e5 = doFill(S, 'prompt1', P1); if (e5) return e5; return out('N5.fill', 4, '指令幫你填好了，確認內容再複製。', { fill: { prompt1: P1 } }); }
    if (!OPTS[S.f.opt]) return no('fill.needinfo', '先選一個互動，我才能幫你填。', 'needinfo');
    var e6 = doFill(S, 'prompt2', p2(S.f.opt)); if (e6) return e6;
    return out('N6.fill', 4, '互動指令幫你填好了，確認內容再複製。', { fill: { prompt2: S.f.prompt2 } });
  }
  function fixFill(S, text) {
    if (privacyHit(S)) return no('privacy', privacyMsg(), 'privacy');
    if (S.fillsDone >= FILL_CAP[S.mode]) return no('fill.cap', '代填最多 ' + FILL_CAP[S.mode] + ' 次，其他自己寫寫看。', 'cap');
    S.fillsDone += 1; S.used.fill += 1; S.f.fixPrompt = text; S.ai.fixPrompt = true; delete S.f.confirmedFix; return null;
  }
  function acceptFill(S, field) { if (S.ai[field]) { S.f['confirmed' + (field === 'prompt1' ? 1 : field === 'prompt2' ? 2 : 'Fix')] = true; return true; } return false; }
  function copy(S, field) {   /* 助教填的指令，學生確認前不能複製 */
    if (!S.ai[field]) return { ok: !isBlank(S.f[field]), reason: isBlank(S.f[field]) ? 'empty' : '' };
    var c = S.f['confirmed' + (field === 'prompt1' ? 1 : field === 'prompt2' ? 2 : 'Fix')];
    return { ok: !!c, reason: c ? '' : 'unconfirmed' };
  }

  /* 按「下一步」：把「做完的樣子」對一次（只指出，不幫改） */
  function next(S, step) { var r = nextCore(S, step); return r && r.ok && !/\.next\.ok$/.test(r.id) ? attach(r, S, step, 'next') : r; }
  function nextCore(S, step) {
    var g = guard(S, step, false); if (g) return g;
    if (S.mode === 'novice') {
      var f = N_NEXT[step]; if (!f) return no('next.none', '', 'none');
      var t = f(S); S.used.auto += 1;
      return t ? out('N' + step + '.next.issue', 1, t) : out('N' + step + '.next.ok', 1, '這一步可以了。');
    }
    if (S.mode === 'mid') {
      if (step === 5) {
        var id = Number(S.f.featN) > 1 ? 'multi' : (!S.f.saved ? 'save' : (isBlank(S.f.mapping) ? 'map' : ''));
        S.used.auto += 1; return id ? out('M5.next.' + id, 1, M_NEXT5[id]) : out('M5.next.ok', 1, '這一步可以了。');
      }
      if (step === 6) { S.used.auto += 1; return Number(S.f.versions) < 2 || isBlank(S.f.versions) ? out('M6.next.issue', 1, '至少要兩個版本，才看得出改了什麼。') : out('M6.next.ok', 1, '這一步可以了。'); }
      if (step === 9) { S.used.auto += 1; return (!S.f.share1 || !S.f.share2) ? out('M9.next.issue', 1, '要附匯出的 PNG 和 AI Studio 連結，連結沒開分享視同未繳交。') : out('M9.next.ok', 1, '這一步可以了。'); }
    }
    return no('next.none', '', 'none');
  }

  /* 專家：交出後給評語。最多 2 條（規則檔／畫面／自評／版本），不改寫、不給做法，不扣名額 */
  function hexes(s) { return (String(s).match(/#[0-9a-fA-F]{6}\b/g) || []).map(function (x) { return x.toLowerCase(); }); }
  function pxs(s) { return (String(s).match(/\d+(?=\s*px)/gi) || []).map(Number); }
  function review(S, type) {
    if (S.mode !== 'expert') return no('review.notexpert', '交出後的評語只在專家模式。', 'notexpert');
    var c = [], ids = [], f = S.f;
    function add(id, t) { ids.push(id); c.push(t); }
    if (type === 'rules') {
      var r = tr(f.rules), hx = hexes(r), px = pxs(r), ls = lines(r);
      if (hx.length < 3 || px.length < 3) add('E.rules.nonumber', '規則裡的數字不夠（色碼 ' + hx.length + ' 個、px ' + px.length + ' 個），看的人還是得猜。');
      if (!/不可以|不能|必須/.test(r)) add('E.rules.nomust', '規則裡沒有「必須」或「不可以」，別人怎麼知道哪裡不能破？');
      var main = ls.filter(function (x) { return /主色/.test(x); }).map(hexes).filter(function (a) { return a.length; });
      if (main.length >= 2 && main[0][0] !== main[1][0]) add('E.rules.conflict', '主色寫了兩個不同的色碼（' + main[0][0] + '、' + main[1][0] + '），哪一個算數？');
      if (!c.length) add('E.rules.ok', '規則具體、沒有互相矛盾，你自己覺得哪一條最難守？');
    } else if (type === 'screens') {
      var R = tr(f.rules), okc = hexes(R), oks = pxs(R), rows = lines(f.screensX), bad = [];
      if (!okc.length || !oks.length) add('E.screens.norules', '規則檔裡還沒有色碼和 px，我沒辦法對照你的畫面。');
      else {
        rows.forEach(function (row) { var p = row.split('|').map(tr); if (p.length < 4) return;
          if (okc.indexOf(p[1].toLowerCase()) < 0) bad.push('「' + p[0] + '」的色碼 ' + p[1] + ' 不在規則檔裡');
          if (oks.indexOf(Number(p[2])) < 0) bad.push('「' + p[0] + '」的字級 ' + p[2] + ' 不在規則檔裡');
          if (oks.indexOf(Number(p[3])) < 0) bad.push('「' + p[0] + '」的間距 ' + p[3] + ' 不在規則檔裡'); });
        if (bad.length) add('E.screens.drift', '偏離規則檔：' + bad.slice(0, 2).join('；') + '。'); else add('E.screens.ok', '三個畫面都落在規則檔的數字裡，這些規則有沒有擋不住的地方？');
      }
    } else if (type === 'heur') {
      var hs = lines(f.heur).map(function (x) { return x.split('|').map(tr); });
      if (hs.length !== 10) add('E.heur.count', '啟發式要十項，目前 ' + hs.length + ' 項。');
      else if (hs.some(function (p) { return p[1] === '不符合' && (isBlank(p[2]) || isBlank(p[3])); })) add('E.heur.noreason', '有「不符合」的項目沒寫嚴重程度或理由。');
      else if (hs.filter(function (p) { return p[1] === '符合'; }).length >= 9) add('E.heur.allok', '十項幾乎都符合，最嚴重的問題在哪？');
      else add('E.heur.ok', '嚴重程度各有理由，最嚴重的兩處你打算先處理哪一處？');
    } else if (type === 'ver') {
      var vs = lines(f.verX).map(function (x) { return x.split('|').map(tr); });
      if (vs.length < 3) add('E.ver.count', '至少三個版本，目前 ' + vs.length + ' 個。');
      else if (vs.some(function (p) { return isBlank(p[1]); })) add('E.ver.nobasis', '有一版沒寫依據（哪一項準則或哪位試用者的紀錄）。');
      else add('E.ver.ok', '每一版都有依據，有沒有哪一版其實變差了？');
    } else return no('bad.input', '', 'type');
    S.used.review += 1;
    return { ok: true, id: ids[0], ids: ids, level: 0, text: c.slice(0, 2).join('\n'), comments: c.slice(0, 2) };
  }

  /* 所有可能出現的分支 id（測試用來算覆蓋率） */
  var IDS = ['privacy', 'quota', 'level.max', 'bad.input', 'mode.denied', 'fill.cap', 'fill.needinfo', 'stuck.ask', 'stuck.generic', 'N5.sent', 'N5.fill', 'N5.back', 'R.resume', 'G.media', 'resume.none', 'N6.fill', 'N7.fill.denied', 'N4.idle', 'N.idle', 'M.idle', 'M4.enter', 'E.level1', 'review.notexpert'];
  [1, 2, 3, 4, 6, 7, 8, 9].forEach(function (n) { IDS.push('N' + n + '.enter'); });
  [3, 4, 5, 6].forEach(function (n) { IDS.push('N' + n + '.level2'); });
  [1, 2, 3, 5, 6, 7, 9].forEach(function (n) { IDS.push('N' + n + '.next.issue', 'N' + n + '.next.ok'); });
  [1, 2, 3, 4].forEach(function (i) { IDS.push('N7.fix3.' + i); IDS.push('M7.cause.' + i); }); [1, 2, 3].forEach(function (i) { IDS.push('N7.fill.' + i); });
  Object.keys(STUCK).forEach(function (m) { Object.keys(STUCK[m]).forEach(function (st) { Object.keys(STUCK[m][st]).forEach(function (k) { IDS.push('stuck.' + m + '.' + st + '.' + k + '.L1', 'stuck.' + m + '.' + st + '.' + k + '.L2'); }); }); });
  for (var mi = 1; mi <= 9; mi++) if (mi !== 7) IDS.push('M' + mi + '.level1');   /* 中級第 7 步只有等級 2（原因說明） */
  IDS.push('M3.level2', 'M5.level2', 'M5.next.multi', 'M5.next.save', 'M5.next.map', 'M5.next.ok', 'M6.next.issue', 'M6.next.ok', 'M9.next.issue', 'M9.next.ok');
  IDS.push('E.rules.nonumber', 'E.rules.nomust', 'E.rules.conflict', 'E.rules.ok', 'E.screens.norules', 'E.screens.drift', 'E.screens.ok', 'E.heur.count', 'E.heur.noreason', 'E.heur.allok', 'E.heur.ok', 'E.ver.count', 'E.ver.nobasis', 'E.ver.ok');

  return { MODES: MODES, STEPS: STEPS, CAPS: CAPS, LEVEL_NAME: LEVEL_NAME, FORBIDDEN: FORBIDDEN, COACH_PER_DAY: COACH_PER_DAY, FILL_CAP: FILL_CAP, IDS: IDS, AVAIL: AVAIL,
           GATES: GATES, GATE_NAME: GATE_NAME, OPTS: OPTS, P1: P1, IMG_DIR: IMG_DIR, UI_TERMS: UI_TERMS, POS_WORDS: POS_WORDS, CLAUDE_LIMIT: CLAUDE_LIMIT, MEDIA: MEDIA, STEP_MEDIA: STEP_MEDIA, STUCK_MEDIA: STUCK_MEDIA, START_MEDIA: START_MEDIA, mediaList: mediaList, MEDIA_ON: MEDIA_ON, stepMedia: stepMedia, showMedia: showMedia, resume: resume, p2: p2, STUCK: STUCK, newState: newState, enter: enter, sent: sent, idle: idle, stuck: stuck, level: level, next: next, review: review,
           confirm: acceptFill, copy: copy, edit: function (S, k, v) { S.f[k] = v; delete S.ai[k]; return S; }, len: len, quotaUsed: quotaUsed };
})();
if (typeof module !== 'undefined') module.exports = FigCoach;
