/* 3D 視圖原型（全部 19 間可進入的房間＋造型畫面的 3D 預覽；房間一次只載入目前檢視的那間，切走就卸載）。家具對照表在 assets3d/furniture3d_map.json。只有網址帶 ?view=3d 才由 index.html 的載入器載入
   （three.js 由 import map 指向 CDN）。
   只讀世界資料（ERG_LAYOUT、cur.world.at、cur.me、cur.player.loc）；決策邏輯用 view_core.js（ERG_VIEW_CORE）；
   點人物＝ERG_ROOM.onNpcClick（現有彈窗），點地板／家具／線索牌＝ERG_ROOM.boardPointer（現有 onBoardPointer，線索牌走原本的開線索流程）。
   不改世界、座標、計分。不在這兩間房（或在全地圖模式）時整個隱藏，畫面回到 2D。
   網址參數：&stats=1 顯示 fps／繪製次數；&q=high|mid|low 手動指定畫質。 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const SC = 0.02;                  /* 世界座標 1 單位 → 3D 0.02 */
const CHAR_H = 1.05;              /* 人物身高（3D 單位） */
const ASSET = 'assets3d/';
const CHARS = ['character-female-a', 'character-female-b', 'character-male-a', 'character-male-b'];   /* 場景裡一般人物用這四個（開場就載） */
const CHARS12 = ['character-female-a', 'character-female-b', 'character-female-c', 'character-female-d', 'character-female-e', 'character-female-f',
  'character-male-a', 'character-male-b', 'character-male-c', 'character-male-d', 'character-male-e', 'character-male-f'];   /* 造型畫面可挑的 12 個（只在打開造型畫面時才載其餘八個） */
const P = new URLSearchParams(location.search);
const LS = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
const VC = window.ERG_VIEW_CORE, LAYOUT = window.ERG_LAYOUT;

/* ───── 3D 狀態與對外介面（回報、提示、退回 2D 都看這裡）：fallback＝目前為什麼退回 2D（'' 表示沒退回）；errors/errCount＝載入後 three／素材相關的 console.error ───── */
const V3S = { active: false, quality: '', fallback: '', errors: [], errCount: 0, pending: '', off: false };   /* off＝學生按了「回 2D」（預覽入口的開關）：不算退回，fallback 仍是空字串 */
try { const PV = window.ERG_PREVIEW3D; if (PV && PV.state && PV.state().mode === '2d') V3S.off = true; } catch (e) { /* 入口沒載入就照舊 */ }
window.ERG_V3D = { loaded: true, active: () => V3S.active, quality: () => V3S.quality, errCount: () => V3S.errCount, errors: () => V3S.errors.slice(), fallback: () => V3S.fallback, enabled: () => !V3S.off, setEnabled: on => { V3S.off = !on; return !V3S.off; } };
function notice(msg) {                    /* 頁內提示一行（不用 alert／confirm／prompt）；優先用遊戲自己的 toast，沒有就自己放一個 */
  try {
    const R2 = window.ERG_ROOM; if (R2 && R2.toast) { R2.toast(msg); return; }
    let t = document.getElementById('v3dNotice'); if (!t) { t = document.createElement('div'); t.id = 'v3dNotice'; t.setAttribute('role', 'status'); t.style.cssText = 'position:fixed;left:50%;top:16px;transform:translateX(-50%);z-index:2147483200;max-width:86%;background:#ffd43b;color:#222;border:2px solid #222;border-radius:8px;padding:6px 14px;font-size:14px;font-weight:700;pointer-events:none'; document.body.appendChild(t); }
    t.textContent = msg; t.style.display = 'block'; clearTimeout(notice._t); notice._t = setTimeout(() => { t.style.display = 'none'; }, 5000);
  } catch (e) { /* 提示失敗不能影響遊戲 */ }
}
function noticeWhenGame(msg) {            /* 還沒進遊戲（登入畫面）就先記著，進遊戲後再提示一次 */
  const g = document.getElementById('game'); if (g && g.classList.contains('on')) { notice(msg); return; }
  V3S.pending = msg; if (noticeWhenGame._i) return;
  noticeWhenGame._i = setInterval(() => { const g2 = document.getElementById('game'); if (g2 && g2.classList.contains('on')) { clearInterval(noticeWhenGame._i); noticeWhenGame._i = 0; if (V3S.pending) { notice(V3S.pending); V3S.pending = ''; } } }, 1000);
}

/* 各房 3D 設定（boot 時由 furniture3d_map.json 與 layout.js 的門推出）：相鄰地板（世界座標矩形）、坐著的站位名稱 */
const ROOMDEF = {};
const R = { id: null };           /* 目前顯示的房間（切換時整包換掉） */
const rooms3 = {};
const toX = wx => (wx - R.CX) * SC, toZ = wy => (wy - R.CY) * SC;
const toWX = x => x / SC + R.CX, toWY = z => z / SC + R.CY;

/* ───── 共用 uniform：滾木、邊緣光 ───── */
const U = { curve: { value: 0 }, focus: { value: 14 }, rim: { value: 0.22 } };
const CURVE_ON = 0.016;           /* 距離焦點超出 d 時，往下壓 curve×d²（view space） */

/* ───── 畫質 ───── */
let manual = false, quality = 'high';
(function initQuality() {
  const q = P.get('q') || LS.get('erg3d:q');
  if (q === 'high' || q === 'mid' || q === 'low') { quality = q; manual = true; if (P.get('q')) LS.set('erg3d:q', q); }
})();
let curveOn = LS.get('erg3d:curve') !== '0';

let renderer;
try { renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }); }
catch (e) {                              /* H1：這台電腦建不出 WebGL（無獨立顯卡又關了軟體繪圖、被政策封鎖等）→ 不白屏，2D 照常，給一行提示 */
  V3S.fallback = 'no-webgl'; window.__v3dError = 'no-webgl: ' + String(e && e.message || e);
  noticeWhenGame('這台電腦不支援 3D 畫面，已使用 2D 畫面（內容一樣，可以繼續玩）。');
  throw new Error('3D 不可用（WebGL 建立失敗），已用 2D：' + String(e && e.message || e));
}
const loseExt = (() => { try { return renderer.getContext().getExtension('WEBGL_lose_context'); } catch (e) { return null; } })();   /* 測試鉤子用：要在掉 context 之前先存住，掉了之後 getExtension 會回 null */
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;     /* 保色盤顏色；補丁材質（toon）的 fragment 仍含 tonemapping_fragment／colorspace_fragment，rim 加在它們之後 */
const labelRenderer = new CSS2DRenderer();
const scene = new THREE.Scene(); scene.background = new THREE.Color('#efe2ea');
const camera = new THREE.PerspectiveCamera(26, 1.6, 0.5, 80);

const allMats = new Set();
let BM = null, BTX = null;          /* 建房期間：這間房建的所有材質、貼圖（卸載時一併釋放，不管有沒有掛到網格上） */
function track(m) { allMats.add(m); if (BM) BM.push(m); return m; }

/* ───── 動森風材質：toon 色階（暗部偏暖粉紫）＋ rim ＋ 滾木 ───── */
const ramp = (() => {
  const c = [[150, 122, 172], [188, 160, 194], [226, 202, 214], [250, 236, 232], [255, 250, 242]];
  const d = new Uint8Array(c.length * 4); c.forEach((v, i) => { d[i * 4] = v[0]; d[i * 4 + 1] = v[1]; d[i * 4 + 2] = v[2]; d[i * 4 + 3] = 255; });
  const t = new THREE.DataTexture(d, c.length, 1, THREE.RGBAFormat); t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true; return t;
})();
/* wuv（可省略）：顏色貼圖改用世界座標（公尺）當 uv，每公尺 texel 密度固定、長短牆不拉伸；uv1（光照貼圖）不受影響。
   取世界座標在滾木彎曲之前（transformed 還沒下壓），貼圖才不會在下壓處流動。period＝貼圖一個週期代表幾公尺；
   mode 'floor'＝(x,z)；'wall'＝依法線挑面：頂面(x,z)、朝 x 的面(z,y)、朝 z 的面(x,y)。 */
function patch(mat, withRim, wuv) {
  mat.onBeforeCompile = sh => {
    if (wuv) {
      const pr = wuv.period.toFixed(4), pv = (wuv.periodV || wuv.period).toFixed(4);
      sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
        { vec3 wp0 = (modelMatrix * vec4(transformed, 1.0)).xyz;
          ${wuv.mode === 'floor' ? 'vec2 wuv = wp0.xz;' : `vec3 wn0 = abs(normalize(mat3(modelMatrix) * objectNormal));
          vec2 wuv = wn0.y > 0.5 ? wp0.xz : (wn0.x > wn0.z ? vec2(wp0.z, wp0.y) : vec2(wp0.x, wp0.y));`}
          #ifdef USE_MAP
          vMapUv = (mapTransform * vec3(wuv.x / ${pr}, wuv.y / ${pv}, 1.0)).xy;
          #endif
        }`);
    }
    sh.uniforms.uCurve = U.curve; sh.uniforms.uFocus = U.focus; sh.uniforms.uRim = U.rim;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uCurve;\nuniform float uFocus;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n{ float dd = max(0.0, -mvPosition.z - uFocus); mvPosition.y -= uCurve * dd * dd; gl_Position = projectionMatrix * mvPosition; }');
    if (withRim) {
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uRim;')
        .replace('#include <dithering_fragment>', `
          { float rimK = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 3.0);
            gl_FragColor.rgb += uRim * rimK * vec3(1.0, 0.82, 0.92); }
          #include <dithering_fragment>`);
    }
  };
  mat.customProgramCacheKey = () => 'erg3d-v2-' + (withRim ? 'rim' : 'plain') + (wuv ? '-w' + wuv.mode + wuv.period + (wuv.periodV || '') : '');
  return mat;
}
function toon(color, map, opts, wuv) {
  const m = new THREE.MeshToonMaterial({ color: color === undefined ? 0xffffff : color, map: map || null, gradientMap: ramp, ...(opts || {}) });
  return track(patch(m, true, wuv));
}
function toonFrom(orig) { return toon(orig.color ? orig.color.getHex() : 0xffffff, orig.map); }

/* ───── 載入器 ───── */
const loader = new GLTFLoader();
const loading = {};
const load = f => (loading[f] = loading[f] || new Promise((ok, no) => loader.load(ASSET + f + '.glb', ok, undefined, no)));
const models = {};
async function loadChar(name) { if (!models[name]) { models[name] = await load(name); if (!baseImg) baseImg = findImg(models[name]); } return models[name]; }
let baseImg = null;
function findImg(gl) { let img = null; gl.scene.traverse(o => { if (o.isMesh && !img && o.material.map) img = o.material.map.image; }); return img; }

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.userData.own = true; if (BTX) BTX.push(t);
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
const textTex = (txt, bg, fg, size) => canvasTex(512, 160, (g, w, h) => { g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = fg; g.font = '900 ' + Math.min(size || 64, Math.floor(480 / Math.max(1, String(txt).length))) + 'px "Microsoft JhengHei",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, w / 2, h / 2 + 4); });

/* ───── 場景：地板、牆、家具（每間房一個 Group，切換時只顯示目前那間） ───── */
let G = null, BK = null;          /* 建構中的 Group、要烘進光照貼圖的靜態網格（順序固定，烘焙與執行時一致） */
function bk(mesh, isBox) {          /* 登記成「要烘」的網格；方塊的六個面改成各占圖集一格，免得六面共用同一塊貼圖 */
  if (isBox) { const uv = mesh.geometry.getAttribute('uv'), m = 0.03; for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k, cx = f % 3, cy = (f / 3) | 0; uv.setXY(i, (cx + m + uv.getX(i) * (1 - 2 * m)) / 3, (cy + m + uv.getY(i) * (1 - 2 * m)) / 2); } uv.needsUpdate = true; }
  BK.push(mesh); return mesh;
}
const pickPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function box(w, h, d, x, y, z, mat, shadow) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); if (shadow !== false) { m.castShadow = true; m.receiveShadow = true; } G.add(m); return m; }
const deco = (m, need) => { m.userData.dq = need; return m; };   /* 裝飾件標記：need＝最低畫質等級（2＝只有高、1＝中以上） */
function floorRect(wx0, wy0, wx1, wy1, mat) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry((wx1 - wx0) * SC, (wy1 - wy0) * SC), mat);
  m.rotation.x = -Math.PI / 2; m.position.set(toX((wx0 + wx1) / 2), 0, toZ((wy0 + wy1) / 2)); m.receiveShadow = true; G.add(m); return m;
}
function fitUniform(src, k, yRaise, tint) {   /* 等比例縮放、貼地、置中（長椅、椅子、電視、盆栽這類不該被拉伸的東西） */
  const o = SkeletonUtils.clone(src), g = new THREE.Group(); g.add(o); g.scale.setScalar(k);
  const b = new THREE.Box3().setFromObject(g); g.position.set(-(b.min.x + b.max.x) / 2, -b.min.y + (yRaise || 0), -(b.min.z + b.max.z) / 2);
  const w = new THREE.Group(); w.add(g);
  w.traverse(m => { if (m.isMesh) { m.geometry.userData.shared = true; m.material = tint !== undefined ? toon(tint) : Array.isArray(m.material) ? m.material.map(toonFrom) : toonFrom(m.material); m.castShadow = true; m.receiveShadow = true; } });   /* tint：整件改單色（長椅、椅子本來就是單色木頭材質） */
  return w;
}
function fitFlat(src, fw, fd) {   /* 地毯：只拉平面 */
  const o = SkeletonUtils.clone(src), g = new THREE.Group(); g.add(o);
  const b = new THREE.Box3().setFromObject(g), s = b.getSize(new THREE.Vector3()); g.scale.set(fw / s.x, 1, fd / s.z); b.setFromObject(g);
  g.position.set(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
  const w = new THREE.Group(); w.add(g);
  w.traverse(m => { if (m.isMesh) { m.geometry.userData.shared = true; m.material = toonFrom(m.material); m.receiveShadow = true; } }); return w;
}
function placeAt(obj, wx, wy, y, rotY) { obj.position.set(toX(wx), y || 0, toZ(wy)); if (rotY) obj.rotation.y = rotY; G.add(obj); return obj; }

/* 貼圖密度：地板一張 0.9 m（2×2 格）；牆一張 1 m 寬、2 m 高（1 m×2 m 的圖，世界座標 uv，長牆短牆每公尺 texel 數相同） */
const FLOOR_M = 0.9, WALL_M = 1.0;
/* 美術（er-art-director 10-19）：牆色依區域分開，學生不看字也知道換了一區（候診＝粉紅，入口與櫃台＝奶油橘）；
   坐、用的家具（長椅、椅子、櫃台前板）一律冷色，與暖色地板、棕色人物拉開明度與色相（動森：柔和飽和、前景與背景分得開） */
const COOL = 0x8fc9d8, COOL_DEEP = 0x6fb2c4, COUNTER_TOP = 0xfff3dc;
let floorImg = null;               /* 地板貼圖（ComfyUI 生成、PIL 補縫＋色盤對齊後的 256 px 小圖）；載入完才換上，載入前用程式畫的方格當後備 */
function useFloorTex(mat, tint) {
  const apply = t => { mat.map = t; mat.color.setHex(tint); mat.needsUpdate = true; };
  if (!floorImg) { floorImg = new THREE.TextureLoader().loadAsync(ASSET + 'er_textures/floor_checker_256.png').then(t => { t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; t.userData.fromFile = true; return t; }).catch(() => null); }
  floorImg.then(t => { if (t) apply(t); });
}
function wallTex() {   /* 牆紙：下半護牆板（較深一階）＋壓條＋上半淡點紋；全是接近白的灰階，顏色由材質 color 乘上去 */
  return canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    const mm = y => h - y / 2.0 * h;                        /* 世界高度 y（公尺）→ 畫布 y（uv 的 v 往上，canvas 往下；flipY 預設 true） */
    g.fillStyle = '#f2e4ea'; g.fillRect(0, mm(0.85), w, h - mm(0.85));
    g.fillStyle = '#ffffff'; g.fillRect(0, mm(0.92), w, mm(0.85) - mm(0.92));
    g.fillStyle = '#e6d0d9'; g.fillRect(0, mm(0.85) - 1, w, 2);
    g.fillStyle = '#f7ecf0'; for (let i = 0; i < 4; i++) for (let j = 0; j < 7; j++) { g.beginPath(); g.arc(16 + i * 32 + (j % 2) * 16, mm(1.1) - j * 12 - 6, 2.4, 0, 7); g.fill(); }
    g.fillStyle = '#ead8df'; for (let k = 0; k < 4; k++) g.fillRect(k * 32 + 15, mm(0.85) + 6, 2, h - mm(0.85) - 6);   /* 護牆板直縫 */
  }, [1, 1]);
}

function mixHex(hex, to, k) { const a = new THREE.Color(hex), b = new THREE.Color(to); return '#' + a.lerp(b, k).getHexString(); }
function fitFoot(src, fw, fd, o) {   /* 依「占地長寬」拉伸（床、桌、沙發、書架這類本來就該對齊家具格子的東西）；高度取兩邊比例的幾何平均、再受 maxH 限制 */
  o = o || {}; const inner = SkeletonUtils.clone(src), rot = new THREE.Group(); rot.add(inner); rot.rotation.y = o.rotY || 0;
  const b = new THREE.Box3().setFromObject(rot), sz = b.getSize(new THREE.Vector3());
  const sx = fw / Math.max(sz.x, 1e-3), sz2 = fd / Math.max(sz.z, 1e-3); let sy = o.flat ? 1 : Math.sqrt(sx * sz2); if (o.maxH) sy = Math.min(sy, o.maxH / Math.max(sz.y, 1e-3));
  const s = new THREE.Group(); s.add(rot); s.scale.set(sx, sy, sz2); s.position.set(-(b.min.x + b.max.x) / 2 * sx, -b.min.y * sy + (o.yRaise || 0), -(b.min.z + b.max.z) / 2 * sz2);
  const w = new THREE.Group(); w.add(s);
  w.traverse(m => { if (m.isMesh) { m.geometry.userData.shared = true; m.material = o.tint ? toon(new THREE.Color(o.tint).getHex()) : Array.isArray(m.material) ? m.material.map(toonFrom) : toonFrom(m.material); m.castShadow = !o.flat; m.receiveShadow = true; } });
  return w;
}
let FM = null;                       /* furniture3d_map.json */
const SOLID_RE = /^(counter|device|seats|chair|desk|bed|sofa|scanner|rack|stall|glass)$/;
const isSolid = f => SOLID_RE.test(f.type) || (f.type === 'screen' && !/叫號/.test(f.label || ''));
function specFor(f) {                 /* 家具 type → 建法；label 覆寫 */
  let sp = Object.assign({}, FM.types[f.type] || { builder: 'device_box', color: '#dfe9f2', h: 0.5, stand_in: true, gap: '未知類型 ' + f.type });
  (FM.labels || []).forEach(l => { if (l.type === f.type && new RegExp(l.match).test(f.label || '')) { const base = Object.assign({}, FM.types[f.type] || {}); delete base.stand_in; delete base.gap; delete base.color; delete base.h; sp = Object.assign(base, l); } });
  return sp;
}

function buildRoom(id) {
  const room = LAYOUT.room(id), def = ROOMDEF[id], rc = FM.rooms[id] || {};
  const r = { id, room, def, W3: room.w * SC, D3: room.h * SC, CX: room.x + room.w / 2, CY: room.y + room.h / 2, group: new THREE.Group(), seats: [], clues: [], cluesFor: null, clueGroup: new THREE.Group(), furn: [], bake: [], lm: null, standIn: [], wallItems: [], mc: {} };
  Object.assign(R, r); G = r.group; BK = r.bake; r.mats = BM = []; r.texs = BTX = [];
  const { W3, D3 } = r;
  const tc = (hex, map, opts) => { const k = hex + (map ? 'm' : '') + (opts ? JSON.stringify(opts) : ''); return r.mc[k] || (r.mc[k] = toon(new THREE.Color(hex).getHex(), map, opts)); };   /* 房內同色共用材質 */
  /* 地板／牆的顏色貼圖一律世界座標 uv（公尺）：貼圖週期 FLOOR_M 公尺、不靠 mesh 自己的 0–1，也不用 texture.repeat。 */
  const check = (a, b) => canvasTex(128, 128, (g, w, h) => { g.fillStyle = a; g.fillRect(0, 0, w, h); g.fillStyle = b; g.fillRect(0, 0, w / 2, h / 2); g.fillRect(w / 2, h / 2, w / 2, h / 2); }, [1, 1]);
  const FW = { mode: 'floor', period: FLOOR_M };
  const floorTint = new THREE.Color(rc.floor || '#fff0e2').getHex();
  const fa = id === 'waiting' ? '#fbeedd' : id === 'triage' ? '#fdf2cf' : mixHex(rc.floor || '#fff0e2', '#ffffff', 0.35), fb = id === 'waiting' ? '#f3dfc9' : id === 'triage' ? '#f3e3b5' : mixHex(rc.floor || '#fff0e2', '#000000', 0.06);
  const mainFloor = floorRect(room.x, room.y, room.x + room.w, room.y + room.h, toon(0xffffff, check(fa, fb), null, FW));
  bk(mainFloor); useFloorTex(mainFloor.material, floorTint);
  def.floors.forEach(f => floorRect(f[0], f[1], f[2], f[3], toon(0xffffff, check(f[4] === 'street' ? '#dcd6dc' : '#efe7f1', f[4] === 'street' ? '#d0c9d1' : '#e5dcea'), null, FW)));
  const wallMat = toon(new THREE.Color(rc.wall || '#f4d6df').getHex(), wallTex(), null, { mode: 'wall', period: WALL_M, periodV: 2 * WALL_M }), capMat = tc('#fff3f6'), trimMat = tc('#c99aa8');
  const T = 0.16, doors = room.doors || [];
  function wall(side, h) {
    const horiz = side === 'N' || side === 'S', len = horiz ? W3 : D3;
    const gaps = doors.filter(d => d.side === side).map(d => [d.at * len - d.w * SC / 2, d.at * len + d.w * SC / 2]).sort((a, b) => a[0] - b[0]);
    const segs = []; let p = 0; gaps.forEach(g => { if (g[0] > p) segs.push([p, g[0]]); p = g[1]; }); if (p < len) segs.push([p, len]);
    const pos = c => [horiz ? c : (side === 'W' ? -W3 / 2 - T / 2 : W3 / 2 + T / 2), horiz ? (side === 'N' ? -D3 / 2 - T / 2 : D3 / 2 + T / 2) : c];
    segs.forEach(s => {
      const l = s[1] - s[0], [x, z] = pos(s[0] + l / 2 - len / 2);
      bk(box(horiz ? l : T, h, horiz ? T : l, x, h / 2, z, wallMat), true);
      deco(box(horiz ? l : T + 0.02, 0.05, horiz ? T + 0.02 : l, x, h + 0.025, z, capMat, false), 2);
    });
    gaps.forEach(g => { const [x, z] = pos((g[0] + g[1]) / 2 - len / 2); deco(box(horiz ? g[1] - g[0] : T + 0.02, 0.03, horiz ? T + 0.02 : g[1] - g[0], x, 0.015, z, trimMat, false), 2); });
  }
  wall('N', 2.0); wall('W', 2.0); wall('E', 2.0);
  wall('S', 0.32);                  /* 靠鏡頭那側的牆降低，看得到房內 */
  deco(box(W3 + 0.4, 0.02, 0.5, 0, 0.01, -D3 / 2 + 0.05, trimMat, false), 2);

  const coolCounter = tc('#6fb2c4'), counterTop = tc('#fff3dc');
  const wood = tc('#d7a77a'), frame = tc('#9a6b4a'), metal = tc('#dfe9f2'), water = tc('#8ecbff', null, { transparent: true, opacity: 0.85 });
  const wallFace = (txt, bg, fg, wx, wy, w, h, y, size) => {   /* 貼牆的牌子 */
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), track(patch(new THREE.MeshBasicMaterial({ map: textTex(txt, bg, fg, size) }), false)));
    face.position.set(toX(wx), y, -D3 / 2 + 0.06); G.add(face); deco(box(w + 0.1, h + 0.1, 0.04, toX(wx), y, -D3 / 2 + 0.02, frame), 2);
    r.wallItems.push({ x0: toX(wx) - w / 2, x1: toX(wx) + w / 2, top: y + h / 2 });
  };
  const easel = (txt, bg, fg, wx, wy, w, h) => {   /* 離牆的牌子：兩根立柱撐一塊板，面向鏡頭（南） */
    const x = toX(wx), z = toZ(wy), y = 0.95;
    [-1, 1].forEach(s => box(0.06, y + h / 2, 0.06, x + s * (w / 2 - 0.05), (y + h / 2) / 2, z, frame));
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), track(patch(new THREE.MeshBasicMaterial({ map: textTex(txt, bg, fg, 64) }), false))); face.position.set(x, y, z + 0.05); G.add(face);
    deco(box(w + 0.1, h + 0.1, 0.04, x, y, z, frame), 2);
  };
  const onTopY = (px, py) => { const q = (LAYOUT.FURNITURE || []).filter(g => g.room === id && /^(desk|counter)$/.test(g.type) && px >= room.x + g.rx && px <= room.x + g.rx + g.w && py >= room.y + g.ry && py <= room.y + g.ry + g.h)[0]; return q ? (q.type === 'counter' ? 0.95 : 0.8) : 0; };
  const BUILD = {
    bench(f, sp, c) {
      const k = 1.6, unit = 0.4 * k, n = Math.max(1, Math.round(c.fw / unit));   /* 長椅模型本身只有 0.4 寬：等比例放大後沿長度一張張排；高度壓低，免得擋住後排的人 */
      for (let i = 0; i < n; i++) placeAt(fitUniform(models.bench.scene, k, 0, COOL), c.wx - c.fw / SC / 2 + (i + 0.5) * (c.fw / n) / SC, c.wy);
      r.seats.push({ x0: room.x + f.rx, x1: room.x + f.rx + f.w, cy: c.wy, yaw: 0 });   /* 長椅椅背在北側，坐的人面向南（鏡頭） */
    },
    chair(f, sp, c) {
      placeAt(fitUniform(models[sp.model].scene, sp.k, 0, new THREE.Color(sp.tint).getHex()), c.wx, c.wy, 0, sp.rotY || 0);
      r.seats.push({ x0: c.wx - 30, x1: c.wx + 30, cy: c.wy, yaw: sp.rotY || 0 });   /* 檢傷的椅子面向櫃台（北） */
    },
    sofa(f, sp, c) {
      placeAt(fitFoot(models[sp.model].scene, c.fw, c.fd, { tint: sp.tint, maxH: sp.maxH }), c.wx, c.wy);
      r.seats.push({ x0: room.x + f.rx, x1: room.x + f.rx + f.w, cy: c.wy, yaw: 0 });
    },
    screen(f, sp, c) {
      if (/叫號/.test(f.label || '')) wallFace('A018', '#1d2230', '#7CFFB2', c.wx, c.wy, Math.min(c.fw, 2.0), 0.55, 1.5, 80);
      else { bk(box(c.fw, 0.6, c.fd + 0.15, toX(c.wx), 0.3, toZ(c.wy), wood), true); placeAt(fitUniform(models.televisionModern.scene, 2.0, 0.6), c.wx, c.wy); }
    },
    counter(f, sp, c) {
      bk(box(c.fw, 0.86, c.fd, toX(c.wx), 0.43, toZ(c.wy), coolCounter), true); bk(box(c.fw + 0.1, 0.07, c.fd + 0.12, toX(c.wx), 0.9, toZ(c.wy), counterTop), true);
      placeAt(fitUniform(models.computerScreen.scene, 1.4, 0.93), room.x + f.rx + f.w * 0.3, c.wy);
    },
    wallsign(f, sp, c) {
      const wallish = f.ry + f.h / 2 < 60, y = f.type === 'sign' && id === 'waiting' ? 1.12 : sp.y;   /* 候診區的小告示牌往下讓一格，上面留給房名牌 */
      if (wallish) wallFace(f.label || '', sp.bg, sp.fg, c.wx, c.wy, c.fw, sp.h, y, 64); else easel(f.label || '', sp.bg, sp.fg, c.wx, c.wy, Math.max(c.fw, 0.9), Math.max(sp.h, 0.5));
    },
    model(f, sp, c) {
      const yr = sp.onDesk ? onTopY(c.wx, c.wy) : (sp.yRaise || 0);
      if (sp.fit === 'uniform') placeAt(fitUniform(models[sp.model].scene, sp.k, yr), c.wx, c.wy);
      else placeAt(fitFoot(models[sp.model].scene, c.fw, c.fd, { rotY: sp.rotY, maxH: sp.maxH, flat: sp.flat, yRaise: yr }), c.wx, c.wy);
    },
    bed(f, sp, c) {
      placeAt(fitFoot(models[sp.model].scene, c.fw, c.fd, { rotY: sp.rotY, maxH: sp.maxH }), c.wx, c.wy);
      if (f.curtain) {   /* 床簾：三面淡色半透明板（北、西、東），南側開著方便看；不烘、不擋點選 */
        const cm = tc('#bfe3d6', null, { transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }), x = toX(c.wx), z = toZ(c.wy);
        deco(box(c.fw + 0.1, 1.6, 0.03, x, 0.8, z - c.fd / 2 - 0.05, cm, false), 2); deco(box(0.03, 1.6, c.fd + 0.1, x - c.fw / 2 - 0.05, 0.8, z, cm, false), 2); deco(box(0.03, 1.6, c.fd + 0.1, x + c.fw / 2 + 0.05, 0.8, z, cm, false), 2);
      }
    },
    device_box(f, sp, c) { bk(box(c.fw, sp.h || 0.5, c.fd, toX(c.wx), (sp.h || 0.5) / 2, toZ(c.wy), tc(sp.color || '#dfe9f2')), true); deco(box(c.fw * 0.5, 0.05, c.fd * 0.5, toX(c.wx), (sp.h || 0.5) + 0.03, toZ(c.wy), tc('#7fd1ae'), false), 2); },
    water(f, sp, c) {
      bk(box(0.5, 1.0, 0.45, toX(c.wx), 0.5, toZ(c.wy), metal), true); const jug = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.5, 20), water); jug.position.set(toX(c.wx), 1.25, toZ(c.wy)); jug.castShadow = true; G.add(jug);
    },
    bell(f, sp, c) {
      bk(box(c.fw, 0.42, c.fd, toX(c.wx), 0.21, toZ(c.wy), metal), true); const bt = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.12, 20), tc('#ff5a4d')); bt.position.set(toX(c.wx), 0.48, toZ(c.wy)); bt.castShadow = true; G.add(bt);
    },
    coffee(f, sp, c) { bk(box(c.fw, 0.8, c.fd, toX(c.wx), 0.4, toZ(c.wy), wood), true); placeAt(fitUniform(models.kitchenCoffeeMachine.scene, 2.2, 0.8), c.wx, c.wy); },
    sinks(f, sp, c) {
      bk(box(c.fw, 0.7, c.fd, toX(c.wx), 0.35, toZ(c.wy), metal), true);
      [0.27, 0.73].forEach(t => placeAt(fitUniform(models.bathroomSink.scene, 2.4, 0.7), c.wx - c.fw / SC / 2 + t * c.fw / SC, c.wy));
    },
    drip(f, sp, c) {
      const x = toX(c.wx), z = toZ(c.wy), pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.7, 8), metal); pole.position.set(x, 0.85, z); pole.castShadow = true; G.add(pole);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.28, 0.05, 14), metal); base.position.set(x, 0.03, z); G.add(base); box(0.2, 0.3, 0.07, x + 0.1, 1.55, z, tc('#cfeaff', null, { transparent: true, opacity: 0.8 }), false);
    },
    kiosk(f, sp, c) {
      const x = toX(c.wx), z = toZ(c.wy), bd = c.fd * 0.5, bw = c.fw * 0.8;
      bk(box(bw, 1.45, bd, x, 0.725, z, tc('#c9d6e3')), true); const sc = box(bw * 0.7, 0.5, 0.05, x, 1.2, z + bd / 2 + 0.03, tc('#7fd1ae'), false); sc.rotation.x = -0.45;
    },
    equipment(f, sp, c) {
      const x = toX(c.wx), z = toZ(c.wy); bk(box(c.fw, 0.9, c.fd, x, 0.45, z, tc('#cfd8e0')), true);
      [0.2, 0.5, 0.8].forEach(t => placeAt(fitUniform(models.computerScreen.scene, 1.6, 0.9), c.wx - c.fw / SC / 2 + t * c.fw / SC, c.wy));
    },
    scanner(f, sp, c) {
      const x = toX(c.wx), z = toZ(c.wy); bk(box(c.fw * 0.9, 1.9, 0.9, x, 0.95, z - c.fd * 0.18, tc('#eef2f6')), true);
      const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.95, 24), tc('#3a4352')); hole.rotation.x = Math.PI / 2; hole.position.set(x, 1.0, z - c.fd * 0.18); G.add(hole);
      bk(box(0.55, 0.12, c.fd * 0.95, x, 0.8, z + c.fd * 0.05, tc('#9fb7c9')), true); bk(box(0.4, 0.8, 0.5, x, 0.4, z + c.fd * 0.3, tc('#cfd8e0')), true);
    },
    glass(f, sp, c) { box(c.fw, 1.3, c.fd, toX(c.wx), 0.65, toZ(c.wy), tc('#cfe8ff', null, { transparent: true, opacity: 0.35, depthWrite: false }), false); },
    stall(f, sp, c) {
      const x = toX(c.wx), z = toZ(c.wy), pm = tc('#f3e6ec'); placeAt(fitUniform(models.toiletSquare.scene, 1.8), c.wx, c.wy - f.h / 2 + 22);
      box(c.fw, 1.6, 0.05, x, 0.8, z - c.fd / 2, pm, false); box(0.05, 1.6, c.fd, x - c.fw / 2, 0.8, z, pm, false); box(0.05, 1.6, c.fd, x + c.fw / 2, 0.8, z, pm, false);
    },
    box(f, sp, c) { bk(box(c.fw, sp.h || 0.5, c.fd, toX(c.wx), (sp.h || 0.5) / 2, toZ(c.wy), tc(sp.color || '#dfe9f2')), true); }
  };
  (LAYOUT.FURNITURE || []).filter(f => f.room === id).forEach(f => {
    const c = { wx: room.x + f.rx + f.w / 2, wy: room.y + f.ry + f.h / 2, fw: f.w * SC, fd: f.h * SC }, sp = specFor(f);
    r.furn.push({ type: f.type, label: f.label || '', x0: toX(room.x + f.rx), x1: toX(room.x + f.rx + f.w), z0: toZ(room.y + f.ry), z1: toZ(room.y + f.ry + f.h), standIn: !!sp.stand_in });
    if (sp.stand_in) r.standIn.push({ type: f.type, label: f.label || '', gap: sp.gap || '' });
    (BUILD[sp.builder] || BUILD.device_box)(f, sp, c);
  });
  /* 房名牌：區域色框＋奶油底＋深色字，掛在後牆（不烘光照貼圖、不擋點選）。候診／檢傷維持原位；其他房挑一段不與牆上其他牌子重疊的位置 */
  (function nameplate() {
    const acc = new THREE.Color(room.accent || '#E69F00'), deep = acc.clone().multiplyScalar(0.42), css = c => '#' + c.getHexString();
    let bw = 1.3, y = 1.8, xw;
    if (id === 'waiting') { bw = 1.4; y = 1.73; xw = toX(room.x + 250); } else if (id === 'triage') { bw = 1.3; y = 1.5; xw = toX(room.x + 52); }
    else {
      bw = Math.min(1.9, Math.max(1.3, room.name.length * 0.2)); const bh0 = bw / 3.2, cands = [0, -0.25, 0.25, -0.38, 0.38].map(k => k * W3).filter(x => Math.abs(x) + bw / 2 < W3 / 2 - 0.1);
      const clash = x => r.wallItems.filter(w => w.top > y - bh0 / 2 - 0.05 && x + bw / 2 > w.x0 - 0.05 && x - bw / 2 < w.x1 + 0.05).length;
      xw = cands.slice().sort((a, b) => clash(a) - clash(b))[0] || 0;
    }
    const bh = bw / 3.2;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), track(patch(new THREE.MeshBasicMaterial({ map: textTex(room.name, '#fff8ec', css(deep), 96) }), false)));
    face.position.set(xw, y, -D3 / 2 + 0.065); G.add(face);
    const pf = box(bw + 0.14, bh + 0.14, 0.04, xw, y, -D3 / 2 + 0.03, toon(acc.getHex()), false);
    r.plate = { face, frame: pf, x: xw, y, z: -D3 / 2 + 0.065, w: bw + 0.14, h: bh + 0.14, hiddenByEvent: false };   /* 事件演出條蓋到時暫時收起來（plateGuard） */
  })();
  /* 盆栽：優先右上角（原位），被家具占住就換角落，四個角都被占就不放 */
  (function plant() {
    const cands = id === 'triage' || id === 'waiting' ? [[room.w - 30, 36]] : [[room.w - 30, 36], [30, 36], [room.w - 30, room.h - 30], [30, room.h - 30]];
    const free = c => !(LAYOUT.FURNITURE || []).some(g => g.room === id && c[0] > g.rx - 24 && c[0] < g.rx + g.w + 24 && c[1] > g.ry - 24 && c[1] < g.ry + g.h + 24);
    const c = cands.filter(free)[0]; if (c || id === 'triage' || id === 'waiting') deco(placeAt(fitUniform(models.pottedPlant.scene, 1.8), room.x + (c || cands[0])[0], room.y + (c || cands[0])[1]), 2);
  })();
  if (id === 'waiting') deco(placeAt(fitFlat(models.rugRectangle.scene, 7.2, 0.9), r.CX - 10, room.y + 82), 1);
  if (id === 'triage') deco(placeAt(fitFlat(models.rugRectangle.scene, 4.6, 1.5), r.CX, room.y + 160), 1);
  r.group.add(r.clueGroup); r.group.visible = false; scene.add(r.group); BM = BTX = null;
  rooms3[id] = r; return r;
}

/* 卸載一間房：只釋放這間房自己建的幾何、材質、貼圖（模型檔的幾何與貼圖是共用的，不能釋放） */
function disposeRoom(r) {
  let geos = 0, mats = 0, texs = 0; const seenT = new Set(), seenM = new Set();
  const dm = m => { if (seenM.has(m)) return; seenM.add(m); if (m.map && m.map.userData.own && !seenT.has(m.map)) { seenT.add(m.map); m.map.dispose(); texs++; } m.dispose(); allMats.delete(m); mats++; };
  r.group.traverse(o => {
    if (o.geometry && !o.geometry.userData.shared) { o.geometry.dispose(); geos++; }
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(dm);
  });
  (r.mats || []).forEach(dm); (r.texs || []).forEach(t => { if (!seenT.has(t)) { seenT.add(t); t.dispose(); texs++; } });
  scene.remove(r.group); if (r.lm && r.lm.tex) { r.lm.tex.dispose(); texs++; } r.lm = null;
  return { geos, mats, texs };
}

/* 線索牌：小立牌，點擊走 2D 原本的開線索流程（ERG_ROOM.boardPointer 對到線索牌範圍） */
function ensureClues() {
  if (!cur || !cur.world || R.cluesFor === cur.world) return;
  const cg = R.clueGroup; while (cg.children.length) cg.remove(cg.children[0]); R.clues.length = 0; R.cluesFor = cur.world;
  const post = toon(0xb08968), cardMat = id => track(patch(new THREE.MeshBasicMaterial({ map: textTex(id, '#ffd43b', '#3a2a00', 96) }), false));
  cur.world.clues.filter(c => c.pin.room === R.id).forEach(c => {
    const p = LAYOUT.abs(c.pin.room, c.pin.rx, c.pin.ry), wx = p.x + 42, wy = p.y + 21;
    const g = new THREE.Group(); g.position.set(toX(wx), 0, toZ(wy));
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 6), post); stick.position.y = 0.35; stick.castShadow = true; g.add(stick);
    const card = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.5, 0.04), [post, post, post, post, cardMat(c.id), post]); card.position.y = 0.95; card.rotation.x = -0.3; card.castShadow = true; g.add(card);
    const pick = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 0.5), new THREE.MeshBasicMaterial({ visible: false })); pick.position.y = 0.8; pick.userData.clue = { id: c.id, wx: p.x + 20, wy: p.y + 10 }; g.add(pick);
    g.userData.card = card; cg.add(g); R.clues.push({ id: c.id, group: g, pick });
  });
}

/* ───── 光照貼圖：離線烘焙（?view=3d&bake=<房間>，用 tools/bake_lightmap_3d.py 跑）、學生端只載貼圖 ───── */
let LM_EXPOSURE = 1.8;                 /* 光照貼圖的曝光倍率（目測校準：1.0 偏暗灰、1.8 與即時光版亮度相當） */
let LM_LJ;                             /* assets3d/lighting.json（情緒光表）：live＝有光照貼圖時未烘物件（床、人物、Kenney 家具）的即時光強度；undefined＝還沒讀、null＝沒有檔 */
const LM_LIVE_DEF = { sun: 0.5, hemi: 0.5 };
let LM_IDX;                            /* assets3d/lightmaps/index.json：哪些房間有烘好的貼圖（沒有就不去要，免得 404）；undefined＝還沒讀、null＝沒有索引檔（退回逐房試） */
async function applyLightmap(r) {
  try {
    if (LM_IDX === undefined) LM_IDX = await fetch(ASSET + 'lightmaps/index.json').then(x => x.ok ? x.json() : null).catch(() => null);
    if (LM_IDX && (LM_IDX.rooms || []).indexOf(r.id) < 0) return;
    if (LM_LJ === undefined) { LM_LJ = await fetch(ASSET + 'lighting.json').then(x => x.ok ? x.json() : null).catch(() => null); if (LM_LJ && LM_LJ.exposure > 0) LM_EXPOSURE = LM_LJ.exposure; }
    const [meta, tex] = await Promise.all([fetch(ASSET + 'lightmaps/' + r.id + '.json').then(x => { if (!x.ok) throw new Error('no lightmap'); return x.json(); }),
      new Promise((ok, no) => new THREE.TextureLoader().load(ASSET + 'lightmaps/' + r.id + '.png', ok, undefined, no))]);
    if (rooms3[r.id] !== r) { tex.dispose(); return; }                           /* 載入期間這間房已被卸載 */
    if (meta.count !== r.bake.length) { console.warn('lightmap 與場景物件數不符，略過', r.id, meta.count, r.bake.length); tex.dispose(); return; }
    tex.colorSpace = THREE.SRGBColorSpace; tex.channel = 1;                      /* ProgressiveLightMap 用 uv1；貼圖存 sRGB、載入後是線性 */
    r.bake.forEach((m, i) => { const uv = m.geometry.getAttribute('uv'), b = meta.boxes[i], uv1 = uv.clone();
      for (let k = 0; k < uv1.count; k++) uv1.setXY(k, (uv.getX(k) + b.x + meta.pad) / meta.w, (uv.getY(k) + b.y + meta.pad) / meta.h);
      m.geometry.setAttribute('uv1', uv1); });
    r.lm = { tex, meta, on: false }; setLightmap(r, true);
  } catch (e) { r.lm = null; }
}
function setLightmap(r, on) {
  if (!r || !r.lm) return; r.lm.on = on;
  r.bake.forEach(m => { const mats = Array.isArray(m.material) ? m.material : [m.material]; mats.forEach(mt => { mt.lightMap = on ? r.lm.tex : null; mt.lightMapIntensity = Math.PI * r.lm.meta.gain * LM_EXPOSURE; mt.needsUpdate = true; }); m.castShadow = !on; });   /* 靜態物的影子已烘進貼圖，不再即時投影；人物仍即時投影 */
  if (R.id === r.id) applyLightMode();
}
function applyLightMode() { const cr = rooms3[R.id], on = !!(cr && cr.lm && cr.lm.on), lv = Object.assign({}, LM_LIVE_DEF, (LM_LJ && LM_LJ.live) || {}, (LM_LJ && LM_LJ.rooms && LM_LJ.rooms[R.id] && LM_LJ.rooms[R.id].live) || {}); light.intensity = on ? lv.sun : 1.55; hemi.intensity = on ? lv.hemi : 1.05; }
async function bakeRoom(id, opt) {
  opt = opt || {}; const t0 = performance.now();
  const { ProgressiveLightMap } = await import('three/addons/misc/ProgressiveLightMap.js'), { potpack } = await import('three/addons/libs/potpack.module.js');
  const r = rooms3[id]; Object.assign(R, r); Object.keys(rooms3).forEach(k => { rooms3[k].group.visible = k === id; }); scene.updateMatrixWorld(true);
  const res = opt.res || (id === 'waiting' ? 1024 : 512), iters = opt.iters || 400, LC = 8, curve0 = U.curve.value; U.curve.value = 0;   /* 在未彎曲的空間烘 */
  renderer.shadowMap.enabled = true;
  const plm = new ProgressiveLightMap(renderer, res), lights = [];
  for (let i = 0; i < LC; i++) { const l = new THREE.DirectionalLight(0xffffff, 1); l.castShadow = true; l.shadow.mapSize.set(1024, 1024); const c = l.shadow.camera; c.left = -9; c.right = 9; c.top = 8; c.bottom = -8; c.near = 0.5; c.far = 70; l.shadow.bias = -0.0008; l.shadow.normalBias = 0.02; lights.push(l); }
  const objs = r.bake.slice(); plm.addObjectsToLightMap(objs.concat(lights));
  /* 自己重排 uv1：每塊四周留約 5 texel（ProgressiveLightMap 內建的邊距只有不到 1 texel），烘完再填縫 */
  const pad = 0.03, boxes = objs.map((o, i) => ({ w: 1 + 2 * pad, h: 1 + 2 * pad, index: i })), dims = potpack(boxes);
  boxes.forEach(b => { const g = objs[b.index].geometry, uv = g.getAttribute('uv'), uv1 = uv.clone(); for (let k = 0; k < uv1.count; k++) uv1.setXY(k, (uv.getX(k) + b.x + pad) / dims.w, (uv.getY(k) + b.y + pad) / dims.h); g.setAttribute('uv1', uv1); });
  const layout = { res, w: dims.w, h: dims.h, pad, count: objs.length, boxes: boxes.slice().sort((p, q) => p.index - q.index).map(b => ({ x: +b.x.toFixed(5), y: +b.y.toFixed(5) })) };
  /* 情緒光（assets3d/lighting.json，沒有就用預設）：sun／hemi 強度比、受光色 tint、暗部色 shade、一房一個光池 pool（fx,fz＝房內比例位置，h 高度，e 強度，c 顏色） */
  const LJ = await fetch(ASSET + 'lighting.json').then(x => x.ok ? x.json() : null).catch(() => null), MD = Object.assign({}, (LJ && LJ.default) || {}, (LJ && LJ.rooms && LJ.rooms[id]) || {});
  const SUN = new THREE.Vector3(-5, 9, 6), sunE = (MD.sun || 1.6) / (LC * 0.5), hemiE = (MD.hemi || 1.4) / (LC * 0.5);
  if (MD.pool) { const pl = MD.pool, pt = new THREE.PointLight(new THREE.Color(pl.c || '#fff2cc'), pl.e || 1.5, 0, 2); pt.position.set(((pl.fx == null ? 0.5 : pl.fx) - 0.5) * r.W3, pl.h || 2.1, ((pl.fz == null ? 0.5 : pl.fz) - 0.5) * r.D3); plm.addObjectsToLightMap([pt]); lights.push(pt); pt.userData.pool = true; }
  for (let i = 0; i < iters; i++) {
    lights.forEach(l => {
      if (l.userData.pool) return;
      if (Math.random() < 0.5) { l.position.set((SUN.x + (Math.random() - 0.5) * 5) * 2.5, (SUN.y + (Math.random() - 0.5) * 3) * 2.5, (SUN.z + (Math.random() - 0.5) * 5) * 2.5); l.intensity = sunE; }
      else { const ct = Math.sqrt(Math.random()), st = Math.sqrt(1 - ct * ct), ph = Math.random() * Math.PI * 2; l.position.set(st * Math.cos(ph) * 28, ct * 28 + 1, st * Math.sin(ph) * 28); l.intensity = hemiE; }   /* 餘弦加權半球取樣：AO 感 */
    });
    plm.update(camera, Math.min(i + 1, 400), true);
    if (i % 25 === 0) await new Promise(ok => setTimeout(ok, 0));
  }
  const target = plm.buffer1Active ? plm.progressiveLightMap2 : plm.progressiveLightMap1, buf = new Float32Array(res * res * 4);
  renderer.readRenderTargetPixels(target, 0, 0, res, res, buf); U.curve.value = curve0;
  /* 後處理：填縫（只填「沒被寫到」的空 texel）、整房一個暖粉紫彈色、正規化 */
  const N = res * res, val = new Float32Array(N * 3), has = new Uint8Array(N); const lum = [];
  for (let i = 0; i < N; i++) { const r0 = buf[i * 4], g0 = buf[i * 4 + 1], b0 = buf[i * 4 + 2]; val[i * 3] = r0; val[i * 3 + 1] = g0; val[i * 3 + 2] = b0; if (r0 + g0 + b0 > 1e-6) { has[i] = 1; lum.push(0.299 * r0 + 0.587 * g0 + 0.114 * b0); } }
  lum.sort((a, b) => a - b); const gain = Math.max(1e-3, lum[Math.floor(lum.length * 0.995)] || 1);
  for (let pass = 0; pass < 8; pass++) { const add = []; for (let y = 0; y < res; y++) for (let x = 0; x < res; x++) { const i = y * res + x; if (has[i]) continue; let n = 0, sr = 0, sg = 0, sb = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= res || yy >= res) continue; const j = yy * res + xx; if (has[j]) { n++; sr += val[j * 3]; sg += val[j * 3 + 1]; sb += val[j * 3 + 2]; } }
    if (n) add.push([i, sr / n, sg / n, sb / n]); } add.forEach(a => { val[a[0] * 3] = a[1]; val[a[0] * 3 + 1] = a[2]; val[a[0] * 3 + 2] = a[3]; has[a[0]] = 1; }); }
  const enc = c => { c = Math.min(1, Math.max(0, c)); return (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055) * 255; };
  const cv = document.createElement('canvas'); cv.width = cv.height = res; const g2 = cv.getContext('2d'), im = g2.createImageData(res, res), W2 = MD.tint || [1.0, 0.975, 0.95], BO = MD.shade || [0.07, 0.045, 0.08];
  for (let y = 0; y < res; y++) for (let x = 0; x < res; x++) { const i = (res - 1 - y) * res + x, o = (y * res + x) * 4;   /* 讀回的第 0 列是 v=0（底），PNG 第 0 列要是 v=1（頂） */
    for (let c = 0; c < 3; c++) { const t = Math.min(1, val[i * 3 + c] / gain); im.data[o + c] = enc(t * W2[c] + BO[c] * (1 - t)); } im.data[o + 3] = 255; }
  g2.putImageData(im, 0, 0);
  const png = cv.toDataURL('image/png'); layout.gain = +gain.toFixed(5);
  lights.forEach(l => l.dispose && l.dispose()); plm.progressiveLightMap1.dispose(); plm.progressiveLightMap2.dispose();
  return { png, json: layout, ms: Math.round(performance.now() - t0), samples: iters * LC, iters, res, pngBytes: Math.round((png.length - 22) * 3 / 4), objects: objs.length };
}

/* ───── 人物 ───── */
const blobTex = canvasTex(64, 64, (g, w, h) => { const r = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2); r.addColorStop(0, 'rgba(70,40,80,.55)'); r.addColorStop(1, 'rgba(70,40,80,0)'); g.fillStyle = r; g.fillRect(0, 0, w, h); });
const blobGeo = new THREE.PlaneGeometry(0.95, 0.95).rotateX(-Math.PI / 2);
const blobMat = track(patch(new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }), false));
const hex2rgb = h => { h = String(h || '#cccccc').replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const texCache = {};
function recolored(skin, outfit) {
  const key = skin + '|' + outfit; if (texCache[key]) return texCache[key];
  const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(baseImg, 0, 0, 512, 512);
  const im = g.getImageData(0, 0, 512, 512), d = im.data, sk = hex2rgb(skin), of = hex2rgb(outfit);
  const lum = (r, gg, b) => 0.299 * r + 0.587 * gg + 0.114 * b;
  const base = {}; const cell = (xc, yc) => { const k = xc + ',' + yc; if (!base[k]) { const i = ((yc * 128 + 4) * 512 + xc * 64 + 4) * 4; base[k] = Math.max(20, lum(d[i], d[i + 1], d[i + 2])); } return base[k]; };
  for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
    const xc = x >> 6, yc = y >> 7; let t = null;
    if (yc === 2) t = xc === 0 ? sk : (xc >= 1 ? of : null); else if (yc === 3 && (xc === 5 || xc === 6 || xc === 7)) t = sk;
    if (!t) continue;
    const i = (y * 512 + x) * 4, k = Math.min(1.35, Math.max(0.35, lum(d[i], d[i + 1], d[i + 2]) / cell(xc, yc)));
    d[i] = Math.min(255, t[0] * k); d[i + 1] = Math.min(255, t[1] * k); d[i + 2] = Math.min(255, t[2] * k);
  }
  g.putImageData(im, 0, 0);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = false; tex.anisotropy = 4;
  return (texCache[key] = tex);
}
const hashStr = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const actors = {}; let charScale = 1;
function meLook() { try { return window.ERG_APP.me.profile.avatar.look || {}; } catch (e) { return {}; } }
function meSid() { try { return String(window.ERG_APP.me.sid); } catch (e) { return 'me'; } }
function meBase() { const l = meLook(); return CHARS12.indexOf(l.base3d) >= 0 ? l.base3d : CHARS[hashStr(meSid()) % CHARS.length]; }
const meSig = () => { const l = meLook(); return meBase() + '|' + l.skin + '|' + l.outfit; };
function makeActor(id, look, isMe) {
  let key = isMe ? meBase() : CHARS[hashStr(String(id)) % CHARS.length];
  if (!models[key]) { loadChar(key).then(() => { if (actors.me && isMe) { removeActor(actors.me); } }); key = CHARS[0]; }
  const gl = models[key], base = gl.scene;
  const root = SkeletonUtils.clone(base); root.scale.setScalar(charScale);
  const tex = recolored((look && look.skin) || '#f1d6b8', (look && look.outfit) || '#a5d8ff');
  const mat = toon(0xffffff, tex);
  root.traverse(o => { if (o.isMesh) { o.material = mat; o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false; } });
  const group = new THREE.Group(); group.add(root);
  const blob = new THREE.Mesh(blobGeo, blobMat); blob.position.y = 0.012; blob.renderOrder = 1; group.add(blob);
  const el = document.createElement('div'); el.className = 'tok v3dTag'; el.style.pointerEvents = 'none'; el.innerHTML = '<div class="bubWrap"></div><span class="nm"></span>';
  const label = new CSS2DObject(el); label.position.set(0, CHAR_H + 0.12, 0); group.add(label);
  const mixer = new THREE.AnimationMixer(root), acts = {};
  ['idle', 'walk', 'sit'].forEach(n => { const clip = gl.animations.find(c => c.name === n); if (clip) acts[n] = mixer.clipAction(clip); });
  const a = { id, isMe, group, root, mixer, acts, anims: gl.animations, extra: {}, oneShot: null, speech: null, talkUntil: 0, talkIdx: 0, faceTo: null, el, label, state: '', yaw: 0, p: null, sig: '', sit: false, key, meSig: isMe ? meSig() : '', name: '' };
  scene.add(group); actors[id] = a; setState(a, 'idle'); return a;
}
function setState(a, st) {
  if (a.state === st) return; const n = a.acts[st], o = a.acts[a.state];
  if (n) { n.reset().fadeIn(0.2).play(); n.timeScale = st === 'walk' ? 1.1 : 1; } if (o) o.fadeOut(0.2); a.state = st;
}
function removeActor(a) { scene.remove(a.group); a.el.remove(); a.mixer.stopAllAction(); delete actors[a.id]; a.root.traverse(o => { if (o.isSkinnedMesh && o.skeleton) o.skeleton.dispose(); if (o.isMesh && o.material && !o.material.userData.disposed) { o.material.userData.disposed = true; o.material.dispose(); allMats.delete(o.material); } }); }   /* 材質與骨架貼圖（每個複製出來的骨架都有一張）釋放；顏色貼圖（recolored 快取）共用，不釋放 */
/* 一次性動畫（emote-yes／emote-no／interact-*／pick-up）：播完自動回到原本的 idle／walk／sit */
function playOne(a, name) {
  const clip = a.anims.find(c => c.name === name); if (!clip) return false;
  let act = a.extra[name]; if (!act) { act = a.extra[name] = a.mixer.clipAction(clip); act.setLoop(THREE.LoopOnce, 1); act.clampWhenFinished = true; }
  if (a.oneShot) a.oneShot.act.fadeOut(0.15);
  const base = a.acts[a.state]; if (base) base.fadeOut(0.15);
  act.reset().fadeIn(0.15).play(); a.oneShot = { act, end: T + clip.duration * 1000 - 100, name }; return true;
}
function say(a, text, ms, kind) { a.speech = { text, until: T + ms, kind: kind || 'speech' }; a.sig = ''; }

/* ───── 與 2D 世界同步 ───── */
let cur = null, items = [], itemsAt = -1, T = 0, frozen = false, forceRoom = null;
function inRoom(x, y) { const rm = R.room; return x >= rm.x - 40 && x <= rm.x + rm.w + 40 && y >= rm.y - 40 && y <= rm.y + rm.h + 40; }
let hoverId = null;
let SIT_Y = 0.2, SIT_Z = -0.1; const MIN_SEP = 36;          /* 坐姿微調（椅面上、略往椅背）；人與人最小距離（世界單位） */
function syncActors(dt) {
  if (!frozen && T - itemsAt > 66) { items = cur.world.at(cur.clock.worldSec); itemsAt = T; }
  const want = {};
  items.forEach(it => { const p = it.pos; if (p.x === undefined || !inRoom(p.x, p.y)) return; want[it.ent.id] = it; });
  Object.keys(actors).forEach(id => { if (id !== 'me' && !want[id]) removeActor(actors[id]); });
  Object.keys(want).forEach(id => { if (!actors[id]) { const a = makeActor(id, want[id].ent.look, false); a.name = want[id].ent.name; } });
  if (actors.me && actors.me.meSig !== meSig()) removeActor(actors.me);      /* 造型畫面換了角色／顏色 */
  if (!actors.me) { const l = meLook(); makeActor('me', l, true); }
  /* 目標位置：坐著的人吸附到長椅／椅子上；其他人互相保持最小距離（只動 3D 呈現，不改 world 資料） */
  if (!cur.me) return;   /* 10-23：位置還沒還原就先畫（重新整理後人物消失的 reading 'x'） */
  const sitters = {}, list = [];
  Object.keys(want).concat(['me']).forEach(id => {
    const a = actors[id], pos = id === 'me' ? { x: cur.me.x, y: cur.me.y, state: cur.walk ? 'move' : 'idle', wp: '' } : want[id].pos;
    a.pos = pos; a.moving = pos.state === 'move' || !!(id === 'me' && cur.walk);
    a.sit = !a.moving && R.def.sitWp.test(pos.wp || '') && id !== 'me'; a.seat = null;
    a.wx = pos.x; a.wy = pos.y;
    if (a.sit) { let best = null, bd = 1e9; R.seats.forEach(s => { const d = Math.abs(pos.y - s.cy) + (pos.x < s.x0 || pos.x > s.x1 ? 200 : 0); if (d < bd) { bd = d; best = s; } }); if (best && bd < 120) { a.seat = best; (sitters[best.cy + '|' + best.x0] = sitters[best.cy + '|' + best.x0] || []).push(a); } else a.sit = false; }
    list.push(a);
  });
  list.forEach(a => {                                                       /* 站位標了「behind」的人（櫃台後面）真的站到櫃台北側 */
    if (a.sit || a.id === 'me') return; const stn = a.pos && LAYOUT.STATIONS.filter(q => q.id === a.pos.wp)[0], bf = stn && stn.behind && R.furn.filter(f => f.label === stn.behind)[0];
    if (bf) a.wy = toWY(bf.z0 - 0.36 - 0.05);
  });
  Object.keys(sitters).forEach(k => { const g = sitters[k].sort((p, q) => (p.id < q.id ? -1 : 1)), s = g[0].seat, n = g.length, span = Math.min(s.x1 - s.x0, n * 56); g.forEach((a, i) => { a.wx = (s.x0 + s.x1) / 2 - span / 2 + (i + 0.5) * span / n; a.wy = s.cy; }); });
  for (let it = 0; it < 4; it++) list.forEach(a => {
    if (a.sit || a.id === 'me') return;                                   /* 坐著的人和玩家不動，其他人讓開 */
    list.forEach(b => {
      if (b === a) return; let dx = a.wx - b.wx, dy = a.wy - b.wy, d = Math.hypot(dx, dy);
      if (d >= MIN_SEP) return; if (d < 0.5) { const t = (hashStr(a.id) % 628) / 100; dx = Math.cos(t); dy = Math.sin(t); d = 1; }
      const fixed = b.sit || b.id === 'me', push = (MIN_SEP - d) * (fixed ? 1 : 0.5); a.wx += dx / d * push; a.wy += dy / d * push;
    });
  });
  const lerpK = 1 - Math.exp(-dt * 9), half = 0.34 * 0.8 + 0.04;
  Object.keys(actors).forEach(id => {
    const a = actors[id]; if (a.wx === undefined) return; let tx = toX(a.wx), tz = toZ(a.wy);
    if (!a.sit) {                                                                /* 沒坐著的人（含玩家、走動中的）不踩進家具（只動 3D 呈現）：櫃台後面的站位站到櫃台北側，其他推到最近的空位 */
      const hit = (x, z) => R.furn.filter(f => isSolid(f) && x + half > f.x0 && x - half < f.x1 && z + half > f.z0 && z - half < f.z1);
      let h = hit(tx, tz);
      if (h.length) { const cand = []; h.forEach(f => { cand.push([f.x0 - half, tz], [f.x1 + half, tz], [tx, f.z0 - half], [tx, f.z1 + half]); });
        cand.sort((p, q) => Math.hypot(p[0] - tx, p[1] - tz) - Math.hypot(q[0] - tx, q[1] - tz)); const ok = cand.filter(c => !hit(c[0], c[1]).length)[0]; if (ok) { tx = ok[0]; tz = ok[1]; } }
    }
    const faceYaw = a.sit && a.seat ? a.seat.yaw : 0;
    if (!a.p) { a.p = new THREE.Vector3(tx, 0, tz); } else {
      const dx = tx - a.p.x, dz = tz - a.p.z, dist = Math.hypot(dx, dz);
      if (dist > 4) { a.p.set(tx, 0, tz); } else { a.p.x += dx * lerpK; a.p.z += dz * lerpK; }
      let tgt = faceYaw, k = 5; if (dist > 0.02 && !a.sit) { tgt = Math.atan2(dx, dz); k = 10; }
      else if (a.faceTo) { tgt = Math.atan2(a.faceTo.x - a.p.x, a.faceTo.z - a.p.z); k = 6; }   /* 訪談：面對面 */
      let dy = tgt - a.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); a.yaw += dy * Math.min(1, dt * k);
    }
    const moving = a.moving || Math.hypot(tx - a.p.x, tz - a.p.z) > 0.08;
    if (a.oneShot) { if (T > a.oneShot.end) { a.oneShot.act.fadeOut(0.2); a.oneShot = null; const st = a.state; a.state = ''; setState(a, st); } }
    else if (T < a.talkUntil) { playOne(a, ['interact-right', 'emote-yes', 'interact-left', 'emote-yes'][a.talkIdx++ % 4]); }
    if (!a.oneShot) setState(a, a.sit && !moving ? 'sit' : (moving ? 'walk' : 'idle'));
    const sitNow = a.state === 'sit' || (a.oneShot && a.sit);
    a.group.position.set(a.p.x, sitNow ? SIT_Y : 0, a.p.z + (sitNow ? SIT_Z * Math.cos(faceYaw) : 0)); a.root.rotation.y = a.yaw;
    a.mixer.update(dt);
    /* 滾木：CSS2D 名牌的位置也跟著下壓，才會黏在彎曲後的頭上 */
    const lp = new THREE.Vector3(a.group.position.x, CHAR_H + 0.12, a.group.position.z).applyMatrix4(camera.matrixWorldInverse), dd = Math.max(0, -lp.z - U.focus.value), drop = U.curve.value * dd * dd;
    a.label.position.set(0, CHAR_H + 0.12, 0).addScaledVector(camUp, -drop);
  });
}
const camUp = new THREE.Vector3(0, 1, 0);
function syncLabels() {
  const evMode = !!(cur && cur.eventPlayback);
  const simMin = window.ERG_ROOM.simMin(), esc = window.ERG_APP.esc;
  Object.keys(actors).forEach(id => {
    const a = actors[id]; let html = '', nmCls = 'nm', nmTxt = '', nmShow = 'none';
    let sp = a.speech && T < a.speech.until ? a.speech : null;
    if (sp && evMode && sp.beat && sp.beat !== lastBeat) sp = null;     /* 事件演出：只留這一拍的說話氣泡，上一拍的收掉，免得在頭上疊成一堆 */
    if (id === 'me') { nmTxt = '你'; nmShow = 'inline-block'; } else {
      const it = items.find(q => q.ent.id === id); if (!it) return; const ent = it.ent, pos = it.pos;
      const av = cur.world.availability(ent, pos, simMin), focused = cur.selNpc === id || hoverId === id || (ent.kind === 'patient' && !evMode) || (evMode && !!sp);   /* 事件演出：只有說話的人（和被點到／滑過的人）顯示名牌，其他人不顯示（學 2D：只在聚焦時顯示） */
      const m = cur.world.mutterFor(ent, pos, cur.clock.worldSec);
      nmTxt = ent.name; nmCls = 'nm ' + (ent.kind === 'bot' ? '' : av.level); nmShow = focused ? 'inline-block' : 'none';
      html = (pos.act && focused && !sp ? '<div class="act">' + esc(pos.act) + '</div>' : '') + (m && focused && !sp ? '<div class="bub ' + (m.kind === 'shout' ? 'shout' : (m.kind === 'thought' ? 'thought' : '')) + '">' + esc(m.text) + '</div>' : '');
    }
    if (sp) html += '<div class="bub ' + (sp.kind === 'shout' ? 'shout' : (sp.kind === 'thought' || sp.kind === 'mutter' ? 'thought' : '')) + '">' + esc(sp.text) + '</div>';   /* 事件台詞、訪談回答：同樣的 CSS2D 泡泡，跟著頭上走 */
    const sig = nmTxt + nmCls + nmShow + html; if (sig === a.sig) return; a.sig = sig;
    const nm = a.el.querySelector('.nm'); nm.textContent = nmTxt; nm.className = nmCls; nm.style.display = nmShow; a.el.querySelector('.bubWrap').innerHTML = html;
  });
}

/* ───── 介面：容器、畫質、滾木、統計 ───── */
const wrap = document.createElement('div'); wrap.id = 'v3dWrap';
const css = document.createElement('style');
css.textContent = `#v3dWrap{position:absolute;inset:0;z-index:5;display:none;overflow:hidden}
body.v3d-on #v3dWrap{display:block}
body.v3d-on #board,body.v3d-on #boardMask{visibility:hidden}
body.v3d-on #overlay>*:not(.popCard){visibility:hidden}
#v3dWrap canvas{display:block;position:absolute;inset:0;width:100%;height:100%}
#v3dUi{position:absolute;bottom:64px;right:16px;z-index:30;display:grid;grid-template-columns:auto auto;gap:4px 10px;align-items:center;background:var(--panel,#fff);color:var(--fg,#222);border:var(--bw-s,2px) solid var(--ink,#222);border-radius:var(--r-m,8px);padding:4px 10px;font-size:var(--fs-1,12px);font-weight:700;white-space:nowrap}
#v3dUi *{box-sizing:border-box}
#v3dUi select{font:inherit;width:64px;flex:none}
#v3dUi input[type=checkbox]{width:16px;height:16px;flex:none;margin:0 4px 0 0;padding:0}
#v3dUi label{display:flex;align-items:center;white-space:nowrap;margin:0}
#v3dStats{position:absolute;left:8px;bottom:8px;z-index:3;font:12px/1.4 monospace;background:rgba(0,0,0,.6);color:#9f9;padding:3px 7px;border-radius:5px;white-space:pre}
.v3dTag{position:absolute;pointer-events:none!important}
#av3dBox{margin-top:6px;border:var(--bw,3px) solid var(--ink,#222);border-radius:var(--r-m,8px);background:linear-gradient(#f6e6ee,#eadbe9);padding:4px;text-align:center}
#av3dBox canvas{display:block;width:100%;height:210px;touch-action:none;cursor:grab}
#av3dBox .pickRow{display:grid;grid-template-columns:repeat(6,1fr);gap:3px;margin-top:4px}
#av3dBox .pickRow button{padding:2px 0;font-size:12px;min-width:0}
#av3dBox .pickRow button.on{background:var(--yellow,#ffd43b);color:#222}
#av3dBox .hint{font-size:11px;color:#6a5a6a;margin-top:2px}`;
document.head.appendChild(css);
const ui = document.createElement('div'); ui.id = 'v3dUi';
ui.innerHTML = '<span>3D 原型</span><label>畫質 <select id="v3dQ"><option value="high">高</option><option value="mid">中</option><option value="low">低</option></select></label><span id="v3dRoomName"></span><label><input type="checkbox" id="v3dCurve">滾木</label>';
wrap.appendChild(ui);
let statsEl = null; if (P.get('stats') === '1') { statsEl = document.createElement('div'); statsEl.id = 'v3dStats'; wrap.appendChild(statsEl); }

/* H2：執行中掉 WebGL context（顯示卡驅動重置、記憶體壓力）→ 立刻退回 2D 並提示；還原後自動回到 3D。不白屏、不留一張空畫面。 */
renderer.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); V3S.fallback = 'context-lost'; noticeWhenGame('3D 畫面中斷了，已先改用 2D 畫面繼續（內容一樣）。如果 3D 恢復，會自動切回。'); }, false);
renderer.domElement.addEventListener('webglcontextrestored', () => { if (V3S.fallback === 'context-lost') { V3S.fallback = ''; allMats.forEach(m => { m.needsUpdate = true; }); itemsAt = -1; noticeWhenGame('3D 畫面恢復了。'); } }, false);

const light = new THREE.DirectionalLight(0xfff0dc, 1.55); light.position.set(-5, 9, 6); light.target.position.set(0, 0, 0);
light.shadow.camera.left = -8; light.shadow.camera.right = 8; light.shadow.camera.top = 6; light.shadow.camera.bottom = -6; light.shadow.camera.near = 1; light.shadow.camera.far = 30;
light.shadow.bias = -0.0006; light.shadow.normalBias = 0.03; light.shadow.radius = 3;
const hemi = new THREE.HemisphereLight(0xfff2e6, 0xd8b3d4, 1.05); scene.add(light, light.target, hemi);

/* 畫質表（資料）：rank＝裝飾件可見門檻（物件 userData.dq ≤ rank 才顯示：dq=2 只有高畫質、dq=1 中高畫質）；dprMax＝像素密度上限；
   labelEvery＝名牌／氣泡每幾幀重畫一次（低畫質減少 DOM 重排）。高畫質維持原本外觀。 */
const QUALITY = {
  high: { rank: 2, dprMax: 1.5, shadow: true, shadowSize: 2048, labelEvery: 1 },
  mid: { rank: 1, dprMax: 1.25, shadow: true, shadowSize: 1024, labelEvery: 1 },
  low: { rank: 0, dprMax: 1, shadow: false, shadowSize: 1024, labelEvery: 2 }
};
let decoInfo = { room: null, total: 0, hidden: 0 };
function applyDeco(r) {                 /* 裝飾件（牆帽、踢腳條、畫框、床簾、盆栽、地毯…）依畫質顯示／隱藏：每個少一次繪製 */
  if (!r) return; const rk = QUALITY[quality].rank; let tot = 0, hid = 0;
  r.group.traverse(o => { const n = o.userData && o.userData.dq; if (n === undefined) return; tot++; const vis = rk >= n; o.visible = vis; if (!vis) hid++; });
  decoInfo = { room: r.id, total: tot, hidden: hid };
}
function applyQuality(q) {
  const Q = QUALITY[q] || QUALITY.high; quality = QUALITY[q] ? q : 'high'; V3S.quality = quality; const dpr = window.devicePixelRatio || 1;
  renderer.setPixelRatio(Math.min(dpr, Q.dprMax));
  const sh = Q.shadow;
  if (renderer.shadowMap.enabled !== sh) { renderer.shadowMap.enabled = sh; allMats.forEach(m => { m.needsUpdate = true; }); }
  light.castShadow = sh;
  const size = Q.shadowSize; if (light.shadow.mapSize.x !== size) { light.shadow.mapSize.set(size, size); if (light.shadow.map) { light.shadow.map.dispose(); light.shadow.map = null; } }
  applyDeco(rooms3[R.id]);
  document.getElementById('v3dQ').value = quality; resize();
}
function applyCurve() { U.curve.value = curveOn ? CURVE_ON : 0; document.getElementById('v3dCurve').checked = curveOn; }
/* ───── 鏡頭：固定斜上方；事件演出與訪談時平滑推近，結束回原視角 ───── */
const camNow = { tgt: new THREE.Vector3(0, 0.3, 0.25), dist: 0, el: 57, az: 0 };
const camBase = { tgt: new THREE.Vector3(0, 0.3, 0.25), dist: 14, el: 57, az: 0 };
function resize() {
  const w = wrap.clientWidth || 800, h = wrap.clientHeight || 500; if (!w || !h || !R.W3) return;
  renderer.setSize(w, h, false); labelRenderer.setSize(w, h); camera.aspect = w / h;
  const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), needH = 8.0, needW = R.W3 + 1.8;
  camBase.dist = Math.max(needH / (2 * tanH), needW / (2 * tanH * camera.aspect));   /* 仰角 57°：前排長椅不擋後排的人 */
  if (!camNow.dist) camNow.dist = camBase.dist; applyCam();
}
function applyCam() {
  const el = THREE.MathUtils.degToRad(camNow.el), d = camNow.dist;
  camera.position.set(Math.sin(camNow.az) * Math.cos(el) * d, Math.sin(el) * d, Math.cos(camNow.az) * Math.cos(el) * d).add(camNow.tgt);
  camera.lookAt(camNow.tgt); camera.updateProjectionMatrix(); camera.updateMatrixWorld(); camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
  camUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
  U.focus.value = d;            /* 焦點距離之內不下壓 */
}
/* 導演：事件演出（cur.eventPlayback）＞ 訪談（訪談分頁選了人）；玩家在 3D 畫面上操作（按下、滾輪）就放棄這一段演出 */
let cancelKey = '', dirKey = '', lastBeat = '', chatNpc = '', chatAns = -1, chatAt = 0;
const guideCache = {};
function evGuide(id) { if (!guideCache[id]) { try { guideCache[id] = window.ERG_EVENT_GUIDE.build().filter(g => g.id === id)[0] || null; } catch (e) { guideCache[id] = null; } } return guideCache[id]; }
function actorOfPid(pid) { const it = items.find(q => q.ent.pid === pid); return it && actors[it.ent.id] || null; }
function eventDirective() {
  const p = cur.eventPlayback; if (!p) return null; const g = evGuide(p.id); if (!g) return null;
  let bi = 0; g.beats.forEach((b, i) => { if ((p.t || 0) >= b.at) bi = i; }); const beat = g.beats[bi];
  const key = 'ev:' + p.id, beatKey = key + ':' + bi;
  const who = []; beat.lines.forEach(l => who.push(l.who)); beat.emote.forEach(e => { if (who.indexOf(e.who) < 0) who.push(e.who); });
  const as = who.map(actorOfPid).filter(a => a && a.p); if (!as.length) return null;
  if (beatKey !== lastBeat) {                                               /* 每一拍開始：說話者出泡泡＋動畫，其他有表情符號的人也動一下 */
    lastBeat = beatKey;
    beat.lines.forEach(l => { const a = actorOfPid(l.who); if (!a) return; say(a, l.text, 5200, l.kind); a.speech.beat = beatKey;
      const txt = l.text || '', nm = l.kind === 'shout' ? 'emote-no' : /拿|取|遞|交|領|按|量/.test(txt) ? 'pick-up' : /好|是|對|謝|了解|收到/.test(txt) ? 'emote-yes' : /不|沒|別|為什麼|怎麼/.test(txt) ? 'emote-no' : 'interact-right'; playOne(a, nm); });
    beat.emote.forEach(e => { const a = actorOfPid(e.who); if (a && !a.oneShot) playOne(a, e.icon === '💢' ? 'emote-no' : e.icon === '!' ? 'interact-right' : 'emote-yes'); });
  }
  const speaker = (beat.lines[0] && actorOfPid(beat.lines[0].who)) || as[0], cx = as.reduce((s, a) => s + a.p.x, 0) / as.length, cz = as.reduce((s, a) => s + a.p.z, 0) / as.length;
  const k = beat.camera === 'push' ? 0.5 : beat.camera === 'pan' ? 0.66 : 0.85, tgt = beat.camera === 'push' ? new THREE.Vector3(speaker.p.x, 0.55, speaker.p.z) : new THREE.Vector3(cx, 0.45, cz);
  return { key, tgt, distK: k, el: beat.camera === 'push' ? 40 : 52, az: beat.camera === 'pan' ? 0.22 : 0 };
}
function interviewDirective() {
  if (cur.tab !== 'intv' || !cur.selNpc) { chatNpc = ''; return null; }
  const a = actors[cur.selNpc], me = actors.me; if (!a || !me || !a.p || !me.p) return null;
  const dx = a.p.x - me.p.x, dz = a.p.z - me.p.z, sep = Math.hypot(dx, dz) || 1;
  a.faceTo = { x: me.p.x, z: me.p.z }; me.faceTo = { x: a.p.x, z: a.p.z };       /* 面對面 */
  let nx = -dz / sep, nz = dx / sep; if (nz < 0) { nx = -nx; nz = -nz; }          /* 從兩人連線的側面（偏鏡頭那一側）看 */
  const tgt = new THREE.Vector3((a.p.x + me.p.x) / 2, 0.55, (a.p.z + me.p.z) / 2);
  return { key: 'iv:' + cur.selNpc, tgt, distK: Math.min(0.8, Math.max(0.5, 0.34 + sep * 0.05)), el: 36, az: Math.atan2(nx, nz) };
}
function pollChat() {                                                    /* 訪談面板的回答出現＝受訪者說話（輪播點頭／互動動畫、頭上泡泡） */
  if (cur.tab !== 'intv' || !cur.selNpc || T - chatAt < 200) return; chatAt = T;
  const log = document.getElementById('chatLog'), a = actors[cur.selNpc]; if (!log || !a) return;
  const ans = Array.prototype.filter.call(log.children, k => k.style && k.style.justifyContent !== 'flex-end' && k.querySelector && k.querySelector('b') && !/正在想|還沒開始/.test(k.textContent));
  if (chatNpc !== cur.selNpc) { chatNpc = cur.selNpc; chatAns = ans.length; return; }
  if (ans.length > chatAns) {
    chatAns = ans.length; let txt = (ans[ans.length - 1].textContent || '').trim(); if (a.name && txt.indexOf(a.name) === 0) txt = txt.slice(a.name.length).replace(/^[:：\s]+/, '');
    const shown = txt.length > 70 ? txt.slice(0, 68) + '…' : txt; say(a, shown, Math.min(9000, 2800 + txt.length * 110)); a.talkUntil = T + Math.min(8000, 1800 + txt.length * 90);
  } else chatAns = ans.length;
}
function director(dt) {
  if (!actors.me || !actors.me.p) return;
  Object.keys(actors).forEach(id => { if (!(cur.tab === 'intv' && (id === 'me' || id === cur.selNpc))) actors[id].faceTo = null; });
  pollChat();
  const d = eventDirective() || interviewDirective(); const key = d ? d.key : '';
  if (key !== dirKey) { dirKey = key; if (key !== cancelKey) cancelKey = ''; }
  const use = d && d.key !== cancelKey, want = use ? { tgt: d.tgt, dist: camBase.dist * d.distK, el: d.el, az: d.az } : camBase;
  const k = 1 - Math.exp(-dt * 3.2);
  camNow.tgt.lerp(want.tgt, k); camNow.dist += (want.dist - camNow.dist) * k; camNow.el += (want.el - camNow.el) * k; camNow.az += (want.az - camNow.az) * k;
  applyCam();
}

/* ───── 輸入：點擊用「畫面座標＋滾木」判斷（滾木在頂點著色器做，射線打不到彎曲後的位置） ───── */
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), v3 = new THREE.Vector3();
function bendProject(x, y, z) {                                          /* 世界(3D) → wrap 內的 CSS px，含滾木下壓 */
  const m = v3.set(x, y, z).applyMatrix4(camera.matrixWorldInverse), dd = Math.max(0, -m.z - U.focus.value); m.y -= U.curve.value * dd * dd; const depth = -m.z;
  m.applyMatrix4(camera.projectionMatrix); return { x: (m.x + 1) / 2 * wrap.clientWidth, y: (1 - m.y) / 2 * wrap.clientHeight, depth };
}
function groundAt(px, py) {                                              /* 畫面座標 → 地面（3D x,z），反推滾木 */
  const W = wrap.clientWidth, H = wrap.clientHeight, g = (sx, sy) => { ndc.set(sx / W * 2 - 1, -(sy / H) * 2 + 1); ray.setFromCamera(ndc, camera); const pt = new THREE.Vector3(); return ray.ray.intersectPlane(pickPlane, pt) ? pt : null; };
  let p = g(px, py); if (!p) return null;
  for (let i = 0; i < 4; i++) { const b = bendProject(p.x, 0, p.z), pl = p.clone().project(camera), plx = (pl.x + 1) / 2 * W, ply = (1 - pl.y) / 2 * H, q = g(px + (plx - b.x), py + (ply - b.y)); if (!q) break; p = q; }
  return p;
}
function segDist(px, py, ax, ay, bx, by) { const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)); return Math.hypot(px - (ax + t * dx), py - (ay + t * dy)); }
function pickAt(e) {                                                     /* 回傳依距離排序的命中：[{kind:'npc'|'clue', id, depth}] */
  const r = wrap.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top, out = [];
  Object.keys(actors).forEach(id => { const a = actors[id]; if (id === 'me' || !a.p) return;
    const f = bendProject(a.p.x, 0, a.p.z), h = bendProject(a.p.x, CHAR_H, a.p.z), unit = Math.hypot(h.x - f.x, h.y - f.y) / CHAR_H;
    if (segDist(px, py, f.x, f.y, h.x, h.y) <= 0.36 * unit) out.push({ kind: 'npc', id, depth: f.depth }); });
  R.clues.forEach(c => { const f = bendProject(c.group.position.x, 0, c.group.position.z), h = bendProject(c.group.position.x, 1.0, c.group.position.z), unit = Math.hypot(h.x - f.x, h.y - f.y);
    if (segDist(px, py, f.x, f.y, h.x, h.y) <= 0.5 * unit) out.push({ kind: 'clue', id: c.id, depth: f.depth, pick: c.pick }); });
  return out.sort((p, q) => p.depth - q.depth);
}
wrap.addEventListener('pointermove', e => { if (!active) return; const h = pickAt(e), n = h.filter(x => x.kind === 'npc'); hoverId = n.length ? n[0].id : null; wrap.style.cursor = h.length ? 'pointer' : 'default'; });
let pd = null;
wrap.addEventListener('pointerdown', e => { pd = { x: e.clientX, y: e.clientY, t: Date.now() }; if (dirKey && !(e.target.closest && e.target.closest('#v3dUi'))) cancelKey = dirKey; });
wrap.addEventListener('wheel', () => { if (dirKey) cancelKey = dirKey; }, { passive: true });
wrap.addEventListener('pointerup', e => {
  const d = pd; pd = null; if (!d || !active || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) return;
  if (e.target.closest && e.target.closest('#v3dUi')) return;
  const hs = pickAt(e), S = window.ERG_ROOM;
  if (hs.length) {
    const npcHits = hs.filter(x => x.kind === 'npc'), first = npcHits.length ? npcHits[0] : hs[0];   /* 人物優先於線索牌：2D 的人物 token 也蓋在線索上面；漂浮的線索牌在畫面上蓋到人物（例如診察室床邊 bot:2 與 C-08）時，點下去要開人物彈窗，不能被線索牌吃掉 */
    if (first.kind === 'npc') { S.onNpcClick(VC.pickPreferred(cur.world, first.id, hs.filter(x => x.kind === 'npc').map(x => x.id))); return; }
    if (first.kind === 'clue') { S.boardPointer(first.pick.userData.clue.wx, first.pick.userData.clue.wy); return; }
  }
  const r = wrap.getBoundingClientRect(), pt = groundAt(e.clientX - r.left, e.clientY - r.top); if (pt) S.boardPointer(toWX(pt.x), toWY(pt.z)); else S.hidePop();
});
document.addEventListener('change', e => {
  if (e.target.id === 'v3dQ') { manual = true; LS.set('erg3d:q', e.target.value); applyQuality(e.target.value); }
  if (e.target.id === 'v3dCurve') { curveOn = e.target.checked; LS.set('erg3d:curve', curveOn ? '1' : '0'); applyCurve(); }
});

/* ───── 彈窗位置：2D 彈窗在 3D 時改用投影 ───── */
let active = false;
function project(wx, wy, h) { const b = bendProject(toX(wx), h, toZ(wy)); return { x: b.x, y: b.y }; }
function screenOverride(wx, wy) {
  if (!active) return null; let near = null, bd = 30;
  Object.keys(actors).forEach(id => { const a = actors[id]; if (id === 'me' || !a.p) return; const d = Math.hypot(toWX(a.p.x) - wx, toWY(a.p.z) - (wy + 20)); if (d < bd) { bd = d; near = a; } });
  const p = near ? project(toWX(near.p.x), toWY(near.p.z), CHAR_H + 0.1) : project(wx, wy, 0.7); return { x: p.x, y: p.y, z: 1 };
}
let switchInfo = { room: null, buildMs: 0, disposeMs: 0, firstRenderMs: 0, disposed: null, count: 0 }, swFirst = false;
function switchRoom(id) {
  const t0 = performance.now(); Object.keys(actors).forEach(k => removeActor(actors[k]));
  let dsp = null; Object.keys(rooms3).forEach(k => { if (k !== id) { const d = disposeRoom(rooms3[k]); delete rooms3[k]; dsp = dsp ? { geos: dsp.geos + d.geos, mats: dsp.mats + d.mats, texs: dsp.texs + d.texs } : d; } });
  const t1 = performance.now(), r = rooms3[id] || buildRoom(id); r.group.visible = true; Object.assign(R, r);
  if (P.get('lm') !== '0') applyLightmap(r);                                  /* 有烘好的貼圖就用；沒有就維持即時光 */
  applyDeco(r); applyLightMode(); itemsAt = -1; hoverId = null; cancelKey = ''; dirKey = ''; lastBeat = '';
  camNow.tgt.copy(camBase.tgt); camNow.dist = 0; camNow.el = camBase.el; camNow.az = 0;
  document.getElementById('v3dRoomName').textContent = R.room.name; resize();
  switchInfo = { room: id, buildMs: +(performance.now() - t1).toFixed(1), disposeMs: +(t1 - t0).toFixed(1), firstRenderMs: 0, disposed: dsp, count: switchInfo.count + 1 }; swFirst = true;
}

/* ───── 主迴圈 ───── */
let frames = 0, lastT = 0, ema = 60, lowMs = 0, startMs = 0, calls = 0, tris = 0, statT = 0, renderedMs = 0, ready = false;
const frameLog = [];
function render(raw) {
  const r0 = performance.now(); renderer.info.reset(); renderer.render(scene, camera); if (frames % QUALITY[quality].labelEvery === 0) labelRenderer.render(scene, camera); const r1 = performance.now();
  calls = renderer.info.render.calls; tris = renderer.info.render.triangles; frames++; renderedMs += raw;
  frameLog.push({ ms: +(r1 - r0).toFixed(3), dt: +raw.toFixed(2) }); if (frameLog.length > 1500) frameLog.shift();
}
function tick(dt) {                                                      /* 一格世界更新（正式迴圈與測試的 step 共用） */
  ensureClues(); syncActors(dt); director(dt);
  R.clues.forEach(c => { c.group.userData.card.position.y = 0.95 + Math.sin(T / 500 + c.group.position.x) * 0.02; });
  if ((frames & 7) === 0) syncLabels();
  if ((frames & 3) === 0) plateGuard();
}
/* D2：事件演出條蓋到房名牌（遮擋超過兩成）就把名牌暫時收起來，演出結束再放回；平時不動 */
function plateRect() {
  const pl = R.plate; if (!pl) return null;
  const xs = [], ys = [];
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(c => { const b = bendProject(pl.x + c[0] * pl.w / 2, pl.y + c[1] * pl.h / 2, pl.z); xs.push(b.x); ys.push(b.y); });
  const x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
  return { x: +x0.toFixed(1), y: +y0.toFixed(1), w: +(x1 - x0).toFixed(1), h: +(y1 - y0).toFixed(1) };
}
function barRect() {                       /* 事件演出條（.evBar）在 wrap 座標的外框；沒有就 null。實際在 #roomNow.evOn 底下（event_ui.js 把條放進去），#eventPlay 底下的也一併算 */
  const bars = document.querySelectorAll('#roomNow .evBar, #eventPlay .evBar'); if (!bars.length) return null;
  const w = wrap.getBoundingClientRect(); let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  bars.forEach(b => { const r = b.getBoundingClientRect(); if (!r.width || !r.height) return; x0 = Math.min(x0, r.left - w.left); y0 = Math.min(y0, r.top - w.top); x1 = Math.max(x1, r.right - w.left); y1 = Math.max(y1, r.bottom - w.top); });
  return x1 > x0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}
function overlapRatio(a, b) { if (!a || !b) return 0; const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y); return w > 0 && h > 0 && a.w * a.h > 0 ? (w * h) / (a.w * a.h) : 0; }
function plateGuard() {
  const pl = R.plate; if (!pl || !active) return; const playing = !!(cur && cur.eventPlayback);
  let hide = false;
  if (playing) { if (pl.hiddenByEvent) hide = true; else hide = overlapRatio(plateRect(), barRect()) > 0.2; }   /* 已收起就維持到演出結束（收起後量不到遮擋，不能反覆開關） */
  if (hide !== pl.hiddenByEvent) { pl.hiddenByEvent = hide; pl.face.visible = !hide; pl.frame.visible = !hide; }
}
/* 自動降級（只降不升＝不會振盪；手動選過畫質就不再自動改）：ema 連續約 3 秒 < 45 fps 才降一級。
   probeFn（setFpsProbe／forceSlow）可注入假的每幀毫秒數，simulateFrames 直接餵合成幀，方便測試；degrades 記錄每次降級（時間、前後檔），degradedAt＝最近一次的時間戳。 */
let probeFn = null, synT = 0, lastGovT = 0; const degrades = [];
function govern(t, raw) {
  lastGovT = t;
  if (raw < 250) ema += (1000 / raw - ema) * 0.08;
  if (!startMs) startMs = t;
  if (!manual && quality !== 'low' && t - startMs > 2500) {
    if (ema < 45) { lowMs += raw; if (lowMs >= 3000) { lowMs = 0; const from = quality, to = quality === 'high' ? 'mid' : 'low'; applyQuality(to); degrades.push({ at: Math.round(t), from, to, ema: +ema.toFixed(1) }); notice('畫面有點卡，已自動降低 3D 畫質（可用右下角「畫質」選單調整）。'); } } else lowMs = 0;
  }
}
function frame(t) {
  requestAnimationFrame(frame);
  const S = window.ERG_ROOM; cur = S && S.cur;
  const loc = forceRoom || (cur && cur.watchRoom && ROOMDEF[cur.watchRoom] ? cur.watchRoom : null) || (cur && cur.player && cur.player.loc);   /* 跟 2D 的檢視切換一樣：看哪一間（watchRoom）就顯示哪一間，沒有就是玩家所在的房間 */
  const want = !V3S.off && !V3S.fallback && !!(cur && cur.world && ROOMDEF[loc] && (forceRoom || cur.stageMode === 'room') && document.getElementById('game') && document.getElementById('game').classList.contains('on'));
  if (want && R.id !== loc) { switchRoom(loc); }
  if (want !== active) { active = want; V3S.active = active; document.body.classList.toggle('v3d-on', active); if (active) { resize(); itemsAt = -1; } }
  if (!active) { lastT = 0; return; }
  const raw = lastT ? t - lastT : 16; lastT = t; const dt = frozen ? 0 : Math.min(raw / 1000, 0.1); if (!frozen) T = t;
  tick(dt); render(raw); if (swFirst) { swFirst = false; switchInfo.firstRenderMs = +frameLog[frameLog.length - 1].ms.toFixed(1); }
  /* fps 與自動降級：連續約 3 秒 < 45 fps 才降一級；手動選過就不自動改 */
  govern(t, probeFn ? probeFn(raw) : raw);
  if (statsEl && t - statT > 400) { statT = t; statsEl.textContent = 'fps ' + ema.toFixed(0) + '  calls ' + calls + '  tris ' + tris + '\n畫質 ' + quality + (manual ? '（手動）' : '（自動）') + '  滾木 ' + (curveOn ? '開' : '關') + '  房 ' + R.id; }
}

/* ───── 造型畫面的 3D 預覽（只在打開造型畫面時才建、才載其餘角色） ───── */
let pv = null, pickedBase = null;
function toonPlain(map) { return new THREE.MeshToonMaterial({ map, gradientMap: ramp }); }
async function pvSetModel() {
  if (!pv) return; const draft = window.ERG_AVATAR_DRAFT; if (!draft) return;
  const look = draft.look || {}, name = CHARS12.indexOf(look.base3d) >= 0 ? look.base3d : CHARS[hashStr(meSid()) % CHARS.length];
  const ticket = ++pv.ticket; const gl = await loadChar(name); if (ticket !== pv.ticket) return;
  if (pv.name !== name) {
    if (pv.model) { pv.holder.remove(pv.model); pv.mixer.stopAllAction(); }
    const root = SkeletonUtils.clone(gl.scene), bb = new THREE.Box3().setFromObject(gl.scene); root.scale.setScalar(1.25 / (bb.max.y - bb.min.y));
    pv.holder.add(root); pv.model = root; pv.name = name; pv.mixer = new THREE.AnimationMixer(root);
    const clip = gl.animations.find(c => c.name === 'idle'); if (clip) pv.mixer.clipAction(clip).play();
    pv.matKey = '';
  }
  const key = (look.skin || '') + '|' + (look.outfit || '');
  if (pv.matKey !== key) { const m = toonPlain(recolored(look.skin || '#f1d6b8', look.outfit || '#a5d8ff')); pv.model.traverse(o => { if (o.isMesh) { o.material = m; o.frustumCulled = false; } }); pv.matKey = key; }
  pv.box.querySelectorAll('.pickRow button').forEach(b => b.classList.toggle('on', b.dataset.base === name));
}
function mountPreview() {
  if (pv) return pv; const col = document.getElementById('avPreviewCol'); if (!col) return null;
  const box = document.createElement('div'); box.id = 'av3dBox';
  box.innerHTML = '<canvas width="400" height="420"></canvas><div class="pickRow">' + CHARS12.map((n, i) => '<button class="ghost" data-base="' + n + '" title="' + n.replace('character-', '') + '">' + (i + 1) + '</button>').join('') + '</div><div class="hint">3D 角色：挑一個、拖曳可旋轉；膚色和衣服顏色用下面的選項</div>';
  const first = col.children[0]; first.after(box);
  const canvas = box.querySelector('canvas'), r2 = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); r2.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5)); r2.outputColorSpace = THREE.SRGBColorSpace;
  const sc2 = new THREE.Scene(), cam2 = new THREE.PerspectiveCamera(28, 200 / 210, 0.1, 30); cam2.position.set(0, 1.0, 4.4); cam2.lookAt(0, 0.62, 0);
  sc2.add(new THREE.HemisphereLight(0xfff2e6, 0xd8b3d4, 1.4)); const dl = new THREE.DirectionalLight(0xfff0dc, 1.4); dl.position.set(-2, 4, 4); sc2.add(dl);
  const holder = new THREE.Group(); sc2.add(holder);
  const blob2 = new THREE.Mesh(blobGeo, new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false })); blob2.scale.setScalar(1.6); blob2.position.y = 0.005; sc2.add(blob2);
  pv = { box, r2, sc2, cam2, holder, mixer: null, model: null, name: '', matKey: '', ticket: 0, yaw: 0.2, drag: null, clock: new THREE.Clock() };
  canvas.addEventListener('pointerdown', e => { pv.drag = { x: e.clientX, yaw: pv.yaw }; canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing'; });
  canvas.addEventListener('pointermove', e => { if (pv.drag) pv.yaw = pv.drag.yaw + (e.clientX - pv.drag.x) * 0.012; });
  canvas.addEventListener('pointerup', () => { pv.drag = null; canvas.style.cursor = 'grab'; });
  box.querySelector('.pickRow').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; const d = window.ERG_AVATAR_DRAFT; if (!d) return; pickedBase = b.dataset.base; d.look.base3d = pickedBase; pvSetModel(); });
  (function loop() { requestAnimationFrame(loop); const av = document.getElementById('avatar'); if (!av || !av.classList.contains('on')) return; const dt = Math.min(pv.clock.getDelta(), 0.1);
    if (pv.mixer) pv.mixer.update(dt); if (!pv.drag) pv.yaw += dt * 0.35; holder.rotation.y = pv.yaw;
    const w = canvas.clientWidth, h = canvas.clientHeight; if (w && (canvas.width !== Math.round(w * r2.getPixelRatio()))) { r2.setSize(w, h, false); cam2.aspect = w / h; cam2.updateProjectionMatrix(); }
    r2.render(sc2, cam2); })();
  return pv;
}
function avatarRender(draft) {
  const av = document.getElementById('avatar'); if (!av || !av.classList.contains('on') || !draft) return;
  if (pickedBase && draft.look && CHARS12.indexOf(draft.look.base3d) < 0) draft.look.base3d = pickedBase;   /* 換預設角色時保留已挑的 3D 角色 */
  mountPreview(); pvSetModel();
}
window.ERG_AVATAR3D = { render: avatarRender };
new MutationObserver(() => avatarRender(window.ERG_AVATAR_DRAFT)).observe(document.getElementById('avatar') || document.body, { attributes: true, attributeFilter: ['class'] });

/* ───── 啟動 ───── */
const TEST = P.get('test') === '1';
const errLog = [];
{                                                                        /* 所有模式：把 three／素材相關的 console.error 記下來，學生回報會帶（J）；three 的 shader 編譯錯誤也是 console.error */
  const ce = console.error, RE3 = /THREE|WebGL|GLSL|shader|view3d|assets3d|\.glb|lightmap/i;
  console.error = function () {
    const msg = Array.prototype.map.call(arguments, x => String(x && x.message || x).slice(0, 300)).join(' ');
    if (RE3.test(msg)) { V3S.errCount++; V3S.errors.push(msg.slice(0, 200)); if (V3S.errors.length > 20) V3S.errors.shift(); }
    if (TEST) errLog.push('console.error: ' + msg);
    return ce.apply(console, arguments);
  };
}
if (TEST) {                                                              /* 測試用：收 JS 例外、未處理的 Promise */
  window.addEventListener('error', e => errLog.push('error: ' + e.message + ' @' + (e.filename || '').split('/').pop() + ':' + e.lineno + (e.error && e.error.stack ? ' | ' + String(e.error.stack).split('\n').slice(1, 3).join(' ') : ''))); window.addEventListener('unhandledrejection', e => errLog.push('rejection: ' + (e.reason && e.reason.message || e.reason)));
}
function backend() { try { const gl = renderer.getContext(), e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'unknown'; } catch (e) { return 'error'; } }
function rectOf(el) { const r = el.getBoundingClientRect(), w = wrap.getBoundingClientRect(); return { x: +(r.left - w.left).toFixed(1), y: +(r.top - w.top).toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; }
function labelList() {
  const W = wrap.clientWidth, H = wrap.clientHeight, out = [];
  Object.keys(actors).forEach(id => { const a = actors[id], nm = a.el.querySelector('.nm'), bw = a.el.querySelector('.bubWrap');
    const showNm = nm && nm.style.display !== 'none' && nm.textContent, showBub = bw && bw.children.length;
    if (!showNm && !showBub) return; const r = rectOf(a.el);
    out.push({ id, text: (nm ? nm.textContent : '') + (showBub ? ' | ' + bw.textContent : ''), ...r, inView: r.x >= -1 && r.y >= -1 && r.x + r.w <= W + 1 && r.y + r.h <= H + 1 }); });
  return out;
}
const solid = isSolid;
function hooks() {
  const gl0 = () => renderer.getContext();
  return {
    version: 'er3d-phase0-r6', ready: () => ready, whenReady: () => new Promise(ok => { const t = setInterval(() => { if (ready) { clearInterval(t); ok(true); } }, 50); }),
    backend, setSeed: n => { window.__v3dSeed = n; },
    setQuality: (q, o) => { applyQuality(q); if (o && o.lock) manual = true; },
    freeze: on => { frozen = !!on; },
    step: (dt, n) => { frozen = true; for (let i = 0; i < (n || 1); i++) { T += dt * 1000; tick(dt); } render(dt * 1000); },
    setAnimTime: t => { Object.keys(actors).forEach(id => actors[id].mixer.setTime(t)); render(16); },
    setLightmap: on => { const r = rooms3[R.id]; if (!r || !r.lm) return false; setLightmap(r, !!on); return true; }, setExposure: v => { LM_EXPOSURE = v; const r = rooms3[R.id]; if (r && r.lm) setLightmap(r, r.lm.on); },
    setBend: v => { U.curve.value = v; curveOn = v > 0; const c = document.getElementById('v3dCurve'); if (c) c.checked = curveOn; },
    stats: () => ({ fps: +ema.toFixed(1), calls, tris, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, programs: (renderer.info.programs || []).length, quality, manual, curve: curveOn, degradedAt: degrades.length ? degrades[degrades.length - 1].at : null, degrades: degrades.slice(), deco: Object.assign({}, decoInfo), fallback: V3S.fallback, frames, renderedMs: Math.round(renderedMs), active, room: R.id, roomsLoaded: Object.keys(rooms3), lm: !!(rooms3[R.id] && rooms3[R.id].lm), switch: switchInfo, actors: Object.keys(actors).length, camera: { dist: +camNow.dist.toFixed(2), el: +camNow.el.toFixed(1), az: +camNow.az.toFixed(2), directing: dirKey && dirKey !== cancelKey ? dirKey : '' } }),
    list: kind => {
      if (kind === 'actors') return Object.keys(actors).map(i => { const q = actors[i]; return { id: i, state: q.state, sit: q.sit, wx: Math.round(q.wx), wy: Math.round(q.wy), wp: q.pos && q.pos.wp, x: q.p && +q.p.x.toFixed(3), z: q.p && +q.p.z.toFixed(3), yaw: +q.yaw.toFixed(3), model: q.key }; });
      if (kind === 'furniture') return R.furn.map(f => ({ type: f.type, label: f.label, standIn: f.standIn, solid: solid(f), x0: +f.x0.toFixed(3), x1: +f.x1.toFixed(3), z0: +f.z0.toFixed(3), z1: +f.z1.toFixed(3) }));
      if (kind === 'clues') return R.clues.map(c => ({ id: c.id, x: +c.group.position.x.toFixed(3), z: +c.group.position.z.toFixed(3) }));
      if (kind === 'world') { const o = []; items.forEach(it => { if (it.pos.x !== undefined && inRoom(it.pos.x, it.pos.y)) o.push({ id: it.ent.id, room: it.pos.room }); }); return o; }
      if (kind === 'gaps') return (rooms3[R.id] ? rooms3[R.id].standIn : []);
      if (kind === 'rooms') return Object.keys(ROOMDEF);
      return [];
    },
    texReport: () => { const S = new Set(), add = t => { if (t && t.isTexture) S.add(t); }; scene.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { add(m.map); add(m.lightMap); add(m.gradientMap); }); });
      const sceneN = S.size; Object.keys(texCache).forEach(k => add(texCache[k])); add(blobTex); add(ramp); allMats.forEach(m => { add(m.map); });
      return { info: renderer.info.memory.textures, reachable: S.size, scene: sceneN, texCache: Object.keys(texCache).length, allMats: allMats.size }; },
    roomInfo: () => { const r = rooms3[R.id]; return r ? { id: r.id, furn: r.furn.length, standIn: r.standIn.length, bake: r.bake.length, seats: r.seats.length, clues: r.clues.length } : null; },
    project: id => { let x, z, h = CHAR_H * 0.55; const a = actors[id], c = R.clues.find(q => q.id === id);
      if (a && a.p) { x = a.p.x; z = a.p.z; } else if (c) { x = c.group.position.x; z = c.group.position.z; h = 0.95; } else return null;
      const b = bendProject(x, h, z), W = wrap.clientWidth, H = wrap.clientHeight; return { x: +b.x.toFixed(1), y: +b.y.toFixed(1), inView: b.x >= 0 && b.y >= 0 && b.x <= W && b.y <= H }; },
    labels: labelList,
    checkOverlaps: () => {
      const out = { actorFurniture: [], actorActor: [], labelOverlap: [], facing: [], minGapWorld: 1e9 }, ids = Object.keys(actors).filter(i => actors[i].p), half = 0.34 * 0.8;
      ids.forEach(i => { const a = actors[i];
        R.furn.filter(solid).forEach(f => { if (a.sit && (f.type === 'seats' || f.type === 'chair' || f.type === 'sofa')) return; if (a.p.x + half > f.x0 && a.p.x - half < f.x1 && a.p.z + half > f.z0 && a.p.z - half < f.z1) out.actorFurniture.push({ actor: i, furniture: f.label || f.type }); });
        if (a.sit && a.state === 'sit') { const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw), cx = camera.position.x - a.p.x, cz = camera.position.z - a.p.z, l = Math.hypot(cx, cz) || 1, dot = (fx * cx + fz * cz) / l; if (a.seat && Math.abs(Math.cos(a.seat.yaw) - 1) < 0.01 && dot <= 0) out.facing.push({ id: i, dot: +dot.toFixed(2) }); } });
      ids.forEach((i, k) => ids.slice(k + 1).forEach(j => { const g = Math.hypot(actors[i].p.x - actors[j].p.x, actors[i].p.z - actors[j].p.z) / SC; out.minGapWorld = Math.min(out.minGapWorld, g); if (g < MIN_SEP * 0.8) out.actorActor.push({ a: i, b: j, gap: +g.toFixed(1) }); }));
      const L = labelList(); L.forEach((p, k) => L.slice(k + 1).forEach(q => { const w = Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x), h = Math.min(p.y + p.h, q.y + q.h) - Math.max(p.y, q.y); if (w > 0 && h > 0) out.labelOverlap.push({ a: p.id, b: q.id, area: Math.round(w * h) }); }));
      out.minGapWorld = ids.length > 1 ? +out.minGapWorld.toFixed(1) : null; return out;
    },
    checkNaN: () => { const bad = []; const ok = n => Number.isFinite(n);
      scene.traverse(o => { if (!ok(o.position.x + o.position.y + o.position.z) || !ok(o.quaternion.x + o.quaternion.y + o.quaternion.z + o.quaternion.w) || !ok(o.scale.x + o.scale.y + o.scale.z) || o.matrixWorld.elements.some(v => !ok(v))) bad.push(o.name || o.type); });
      Object.keys(actors).forEach(i => { const p = actors[i].p; if (p && !ok(p.x + p.z)) bad.push('actor:' + i); }); return { count: bad.length, bad: bad.slice(0, 20) }; },
    loadRoom: id => { if (id === null || id === undefined) { forceRoom = null; return true; } if (!ROOMDEF[id]) return false; forceRoom = id; return true; },
    loseContext: () => { if (loseExt) { loseExt.loseContext(); return true; } return false; },
    restoreContext: () => { if (loseExt) { loseExt.restoreContext(); return true; } return false; },      /* 擴充物件在啟動時就存住，掉了之後也能還原 */
    fallback: () => V3S.fallback,
    nameplateRect: () => { const pl = R.plate; if (!pl) return null; const rc = plateRect(); return Object.assign({ room: R.id, hidden: pl.hiddenByEvent }, rc); },
    barRect,
    pickAt: (cx, cy) => pickAt({ clientX: cx, clientY: cy }).map(h => ({ kind: h.kind, id: h.id, depth: +h.depth.toFixed(2) })),
    setFpsProbe: fn => { probeFn = typeof fn === 'function' ? fn : null; return !!probeFn; },
    forceSlow: ms => { probeFn = ms > 0 ? (() => ms) : null; return !!probeFn; },                          /* 讓自動降級以為每幀要 ms 毫秒（0／空＝取消） */
    simulateFrames: (ms, n) => { for (let i = 0; i < (n || 1); i++) { synT = Math.max(synT, lastGovT) + ms; govern(synT, ms); } return { quality, manual, ema: +ema.toFixed(1), degrades: degrades.slice() }; },
    qualityTable: () => JSON.parse(JSON.stringify(QUALITY)),
    errors: () => errLog.slice(), frameLog: n => frameLog.slice(-(n || 600)),
    projectWorld: (wx, wy, h) => project(wx, wy, h || 0),
    camera: () => ({ pos: camera.position.toArray(), tgt: camNow.tgt.toArray() })
  };
}
(async function boot() {
  const stage = document.getElementById('stage') || document.body; stage.appendChild(wrap);
  renderer.domElement.style.cssText = ''; wrap.insertBefore(renderer.domElement, ui);
  labelRenderer.domElement.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden'; wrap.insertBefore(labelRenderer.domElement, ui);
  FM = await fetch(ASSET + 'furniture3d_map.json').then(x => x.json());
  const names = CHARS.concat(['bench', 'chair', 'televisionModern', 'pottedPlant', 'rugRectangle', 'computerScreen']).concat((FM.models || []).filter(n => ['bench', 'chair', 'televisionModern', 'pottedPlant', 'rugRectangle', 'computerScreen'].indexOf(n) < 0));
  const res = await Promise.all(names.map(load)); names.forEach((n, i) => { models[n] = res[i]; });
  baseImg = findImg(models[CHARS[0]]);
  const bb = new THREE.Box3().setFromObject(models[CHARS[0]].scene); charScale = CHAR_H / (bb.max.y - bb.min.y);
  LAYOUT.ROOMS.filter(rm => rm.type === 'room').forEach(rm => {           /* 每間可進入的房間：地板（含門外相鄰的走道／街道）與坐著的站位 */
    const ov = FM.floorsOverride && FM.floorsOverride[rm.id], rc = FM.rooms[rm.id] || {}, fl = [], seen = {};
    if (ov) ov.forEach(f => fl.push(f)); else (rm.doors || []).forEach(d => { const hid = LAYOUT.hallFor(rm, d), H = hid && LAYOUT.room(hid); if (!H || seen[hid]) return; seen[hid] = 1;
      fl.push([Math.max(H.x, rm.x - 110), H.y, Math.min(H.x + H.w, rm.x + rm.w + 110), H.y + H.h, hid === 'street' ? 'street' : 'hall']); });
    ROOMDEF[rm.id] = { floors: fl, sitWp: rc.sitWp ? new RegExp(rc.sitWp) : /(?!)/ };
  });
  if (P.get('bake')) buildRoom(P.get('bake'));
  applyCurve(); applyQuality(quality);
  new ResizeObserver(resize).observe(wrap);
  const t0 = performance.now();
  if (P.get('bake')) { window.__bake = { done: false }; try { window.__bake = Object.assign(await bakeRoom(P.get('bake'), { res: +P.get('res') || 0, iters: +P.get('iters') || 0 }), { done: true }); } catch (e) { window.__bake = { done: true, error: String(e && e.stack || e) }; } return; }
  window.ERG_ROOM.screenOverride = screenOverride;
  ready = true;
  if (TEST) { window.__v3d = hooks(); window.__v3d.compileMs = Math.round(performance.now() - t0); }   /* 只有 ?view=3d&test=1 才掛測試鉤子，正式模式不暴露 */
  requestAnimationFrame(frame);
  avatarRender(window.ERG_AVATAR_DRAFT);
})().catch(e => { console.error('view3d 啟動失敗', e); window.__v3dError = String(e && e.stack || e); });
