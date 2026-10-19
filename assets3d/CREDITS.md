# assets3d 素材來源與授權

全部是 CC0 1.0（公眾領域貢獻），署名非必要，仍依禮貌標註。授權原文讀自各包內的 License.txt；
下載紀錄見 `E:/Downloads/_er3d_assets/ASSET_LICENSES.md`。檔案原樣複製，沒有修改。

| 檔案 | 來源 | 授權 |
|---|---|---|
| character-female-a～f.glb、character-male-a～f.glb（共 12 個）、Textures/colormap.png | Kenney「Mini Characters 1.0」（2024-07-17）https://kenney.nl/assets/mini-characters | CC0 1.0 |
| bench.glb、chair.glb、televisionModern.glb、pottedPlant.glb、rugRectangle.glb、computerScreen.glb | Kenney「Furniture Kit 2.0」（2018-10-20）https://kenney.nl/assets/furniture-kit | CC0 1.0 |

人物的衣服與膚色在執行時用貼圖色塊重新上色（view3d.js），不改原檔。
| desk.glb、chairDesk.glb、bedSingle.glb、loungeSofa.glb、cardboardBoxOpen.glb、bathroomSink.glb、toiletSquare.glb、bookcaseOpenLow.glb、kitchenCoffeeMachine.glb、rugDoormat.glb、trashcan.glb、laptop.glb（2026-10-19 全房間補入，從本機 E:/Downloads/_er3d_assets/kenney_furniture-kit 複製，非新下載） | Kenney「Furniture Kit 2.0」 | CC0 1.0 |

家具對照表（type／label → 模型或簡單幾何）在 furniture3d_map.json；缺口見 docs/3D_FURNITURE_GAPS.md。

## 本專案自製（隨網站上線）
| 檔案 | 說明 | 授權 |
|---|---|---|
| er_textures/floor_checker_256.png（來源與參數見 er_textures/manifest.json、palette.json） | 本機 ComfyUI 生成後以 PIL 補縫、對齊上面素材的色盤；地板貼圖 | 生成模型 FLUX.1-dev，輸出授權原文待主線確認（manifest 已註記）；公開教學用風險中低 |
| lightmaps/*.png、lightmaps/*.json、lighting.json | 本專案用 three.js ProgressiveLightMap 離線烘焙的光照貼圖與情緒光表 | 自製（程式產出，無第三方素材） |
| furniture3d_map.json | 家具對照表 | 自製 |
