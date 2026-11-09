/* 自動產生：python tools/gen_prx_units_data.py（來源 tools/prx_units.json）。不要手改。 */
(function (r) { r.ERG_UNITS_DATA = {
 "version": 1,
 "note": "提案室每週送審的單一來源（資料）。proposal_units.js 與 tools/prx_units.py 讀這個檔；改這裡就好，不要在程式裡另寫一份。學生看得到的字不得出現：分數、成績、AI 助教、模型。",
 "switchEveryDays": 7,
 "dueAfterSwitchDays": 6,
 "plausibleFromMs": 1767196800000,
 "classOrder": [
  "二甲",
  "二乙",
  "二丙"
 ],
 "classes": {
  "default": {
   "label": "二丙／二乙",
   "w10SwitchAt": "2026-11-09T20:00:00+08:00"
  },
  "二甲": {
   "label": "二甲",
   "w10SwitchAt": "2026-11-11T20:00:00+08:00"
  }
 },
 "hosts": {
  "fig": [
   "figma.com"
  ],
  "ais": [
   "aistudio.google.com"
  ]
 },
 "figma": {
  "templateNames": [
   "mcp-test01"
  ],
  "copyWords": [
   "copy",
   "untitled"
  ]
 },
 "markers": {
  "claude1": "[Claude✓]",
  "claude2": "[Claude✓2]",
  "png2": "[PNG✓2]",
  "incognito": "[無痕✓]",
  "trialOpen": "[試用"
 },
 "minSegChars": 4,
 "minRows": 3,
 "alignGate": [
  "f2",
  "a3"
 ],
 "lights": [
  {
   "k": "min",
   "name": "最低要求"
  },
  {
   "k": "claude",
   "name": "Claude 整合"
  },
  {
   "k": "trial",
   "name": "試用與改版"
  }
 ],
 "iterMin": {
  "f1": [
   0,
   0,
   0
  ],
  "a1": [
   0,
   0,
   0
  ],
  "f2": [
   0,
   0,
   0
  ],
  "a2": [
   0,
   0,
   0
  ],
  "f3": [
   1,
   1,
   2
  ],
  "a3": [
   0,
   2,
   3
  ]
 },
 "units": [
  {
   "id": "f1",
   "n": 1,
   "week": "W10",
   "name": "Figma 1/3",
   "title": "開始用 Figma",
   "modes": false,
   "lights": [
    "min"
   ],
   "deliver": [
    "一條 Figma 連結（確認別人打得開）",
    "檔名已經改成你自己的，不是樣板的名字",
    "把「D 長者與家人版」改的三個地方，用 ①②③ 寫在「改了什麼」，每一處至少 4 個字"
   ],
   "schedule": {
    "default": {
     "switchAt": "2026-11-09T20:00:00+08:00",
     "dueAt": "2026-11-15T20:00:00+08:00",
     "resultAt": "2026-11-16T20:00:00+08:00",
     "flipDue": "2026-11-24"
    },
    "二甲": {
     "switchAt": "2026-11-11T20:00:00+08:00",
     "dueAt": "2026-11-17T20:00:00+08:00",
     "resultAt": "2026-11-18T20:00:00+08:00",
     "flipDue": "2026-11-26"
    }
   }
  },
  {
   "id": "a1",
   "n": 2,
   "week": "W11",
   "name": "AI Studio 1/3",
   "title": "把畫面還原成網頁",
   "modes": false,
   "lights": [
    "min"
   ],
   "deliver": [
    "一條 AI Studio 作品連結（確認別人打得開）",
    "Figma 連結也留著",
    "預覽截圖也一起交到 flipclass"
   ],
   "schedule": {
    "default": {
     "switchAt": "2026-11-16T20:00:00+08:00",
     "dueAt": "2026-11-22T20:00:00+08:00",
     "resultAt": "2026-11-23T20:00:00+08:00",
     "flipDue": "2026-12-01"
    },
    "二甲": {
     "switchAt": "2026-11-18T20:00:00+08:00",
     "dueAt": "2026-11-24T20:00:00+08:00",
     "resultAt": "2026-11-25T20:00:00+08:00",
     "flipDue": "2026-12-03"
    }
   }
  },
  {
   "id": "f2",
   "n": 3,
   "week": "W12",
   "name": "Figma 2/3",
   "title": "畫自己的一頁",
   "modes": true,
   "lights": [
    "min",
    "claude"
   ],
   "deliver": [
    "一條 Figma 連結",
    "對準表至少 3 列，每一列都選到訪談或線索當依據",
    "在「改了什麼」寫這一頁的一句話、危險訊息、主按鈕放在哪",
    "做過一次 Claude 整合（截圖放在 flipclass 交）"
   ],
   "schedule": {
    "default": {
     "switchAt": "2026-11-23T20:00:00+08:00",
     "dueAt": "2026-11-29T20:00:00+08:00",
     "resultAt": "2026-11-30T20:00:00+08:00",
     "flipDue": "2026-12-08"
    },
    "二甲": {
     "switchAt": "2026-11-25T20:00:00+08:00",
     "dueAt": "2026-12-01T20:00:00+08:00",
     "resultAt": "2026-12-02T20:00:00+08:00",
     "flipDue": "2026-12-10"
    }
   }
  },
  {
   "id": "a2",
   "n": 4,
   "week": "W13",
   "name": "AI Studio 2/3",
   "title": "加一個互動",
   "modes": true,
   "lights": [
    "min",
    "claude"
   ],
   "deliver": [
    "一條 AI Studio 作品連結",
    "在「改了什麼」寫你加的互動，例如「點〔X〕出現〔Y〕」",
    "做過兩次 Claude 整合（兩張截圖放在 flipclass 交）"
   ],
   "schedule": {
    "default": {
     "switchAt": "2026-11-30T20:00:00+08:00",
     "dueAt": "2026-12-06T20:00:00+08:00",
     "resultAt": "2026-12-07T20:00:00+08:00",
     "flipDue": "2026-12-15"
    },
    "二甲": {
     "switchAt": "2026-12-02T20:00:00+08:00",
     "dueAt": "2026-12-08T20:00:00+08:00",
     "resultAt": "2026-12-09T20:00:00+08:00",
     "flipDue": "2026-12-17"
    }
   }
  },
  {
   "id": "f3",
   "n": 5,
   "week": "W14",
   "name": "Figma 3/3",
   "title": "試用並改一版",
   "modes": true,
   "lights": [
    "min",
    "claude",
    "trial"
   ],
   "deliver": [
    "一條 Figma 連結",
    "試用紀錄：幾秒、點幾下、停在哪一句",
    "依試用紀錄改一版並存成版本（新手 1 版、中級 1 版、專家 2 版）",
    "改前、改後兩張 PNG（放在 flipclass 交）",
    "做過一次 Claude 整合"
   ],
   "schedule": {
    "default": {
     "switchAt": "2026-12-07T20:00:00+08:00",
     "dueAt": "2026-12-13T20:00:00+08:00",
     "resultAt": "2026-12-14T20:00:00+08:00",
     "flipDue": "2026-12-22"
    },
    "二甲": {
     "switchAt": "2026-12-09T20:00:00+08:00",
     "dueAt": "2026-12-15T20:00:00+08:00",
     "resultAt": "2026-12-16T20:00:00+08:00",
     "flipDue": "2026-12-24"
    }
   }
  },
  {
   "id": "a3",
   "n": 6,
   "week": "W15",
   "name": "AI Studio 3/3",
   "title": "試用、改版、提交",
   "modes": true,
   "lights": [
    "min",
    "claude",
    "trial"
   ],
   "deliver": [
    "Figma 與 AI Studio 兩條連結都在",
    "對準表完整",
    "版本：新手不用、中級至少 2 版、專家至少 3 版",
    "做過一次 Claude 整合",
    "提案室匯出的 PDF 交到 flipclass"
   ],
   "schedule": {
    "default": {
     "switchAt": "2026-12-14T20:00:00+08:00",
     "dueAt": "2026-12-20T20:00:00+08:00",
     "resultAt": "2026-12-21T20:00:00+08:00"
    },
    "二甲": {
     "switchAt": "2026-12-16T20:00:00+08:00",
     "dueAt": "2026-12-22T20:00:00+08:00",
     "resultAt": "2026-12-23T20:00:00+08:00"
    }
   }
  }
 ],
 "unitChecks": {
  "f1": {
   "min": [
    "linkFig",
    "figRename",
    "chgThree",
    "shareView"
   ]
  },
  "a1": {
   "min": [
    "linkAis",
    "linkFigKeep",
    "shareView"
   ]
  },
  "f2": {
   "min": [
    "linkFig",
    "alignRows",
    "alignFull",
    "chgPage"
   ],
   "claude": [
    "claude1"
   ]
  },
  "a2": {
   "min": [
    "linkAis",
    "chgInteract"
   ],
   "claude": [
    "claude2"
   ]
  },
  "f3": {
   "min": [
    "linkFig"
   ],
   "claude": [
    "claude1"
   ],
   "trial": [
    "trialRecord",
    "versions",
    "pngTwo"
   ]
  },
  "a3": {
   "min": [
    "linkFig",
    "linkAis",
    "alignRows",
    "alignFull"
   ],
   "claude": [
    "claude1"
   ],
   "trial": [
    "versions",
    "heurTen"
   ]
  }
 },
 "gates": {
  "linkFig": true,
  "linkAis": true,
  "figRename": false,
  "chgThree": true,
  "shareView": false,
  "linkFigKeep": false,
  "alignRows": true,
  "alignFull": false,
  "chgPage": false,
  "chgInteract": true,
  "claude1": true,
  "claude2": true,
  "trialRecord": true,
  "versions": true,
  "pngTwo": false,
  "heurTen": false
 },
 "msgs": {
  "link-fig-none": "還沒貼 Figma 連結。",
  "link-fig-bad": "Figma 連結要用 https 開頭，而且是 figma.com 的網址。",
  "link-ais-none": "還沒貼 AI Studio 作品連結。",
  "link-ais-bad": "AI Studio 連結要用 https 開頭，而且是 aistudio.google.com 的網址。",
  "fig-keep": "把 Figma 連結也留著。",
  "fig-rename-template": "Figma 檔名看起來還是樣板的名字，請改成你自己的檔名。",
  "fig-rename-unknown": "從網址看不出檔名，請確認你已經把檔名改掉。",
  "chg-three-none": "「改了什麼」要用 ①②③ 寫出三個地方，每一處至少 4 個字。",
  "chg-three-part": "「改了什麼」目前只寫出 {n} 處，需要 ①②③ 三處，每一處至少 4 個字。",
  "chg-three-same": "「改了什麼」的 ①②③ 有幾處寫得一模一樣，請分別寫出三個不同的地方。",
  "share-view": "還沒按「我用無痕視窗打開過了」，請用沒登入的視窗打開自己的連結確認。",
  "rows-few": "對準表至少要 3 列，目前只有 {n} 列寫了設計決定。",
  "rows-ev": "對準表有 {n} 列還沒選到訪談或線索當依據。",
  "align-full": "對準表還有地方沒補齊：{m}",
  "chg-page-short": "在「改了什麼」寫一下這一頁的一句話、危險訊息、主按鈕放在哪。",
  "chg-interact-short": "在「改了什麼」寫出你加的互動，例如「點〔X〕出現〔Y〕」。",
  "claude-none": "還沒標記做過 Claude 整合。",
  "claude-two": "這一份要做兩次 Claude 整合，目前只標記了一次。",
  "trial-none": "還沒有試用紀錄，要寫幾秒、點幾下、停在哪一句。",
  "trial-part": "試用紀錄還缺：{m}。",
  "ver-few": "這個模式要存到至少 {need} 版，目前 {have} 版：每改一次就按「存成第 N 版」。",
  "ver-chg-empty": "第 {n} 版還沒寫「這一版改了什麼」。",
  "ver-chg-same": "第 {n} 版寫的和第 {p} 版一模一樣，請寫出這一版真正改的地方。",
  "png-two": "還沒標記匯出了改前、改後兩張 PNG。",
  "heur-ten": "專家模式的十項自評還沒勾完（目前 {n} 項）。"
 }
}; })(typeof self !== 'undefined' ? self : this);
