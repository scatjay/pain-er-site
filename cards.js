/* 卡片：學生的調查員速記。分兩種：
   結構化卡（訪談卡、勘查卡）：欄位都設計好，學生只要填，結論引用時一眼看得出出處。
   開放卡（便利貼、問號、重要、想法、矛盾、留言）：自由寫，可以留在目前所在的房間，也可以放進筆記本。
   純函式。卡片的編號（例如 #12-03）由 logic.js 的 nextMarkerId 產生。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ERG_CARDS = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  var TRUST = ['1 只是聽說', '2 有點根據', '3 有證據對得上'];

  var TYPES = {
    '訪談卡': { group: 'structured', color: '#a5d8ff', hint: '訪談完一位關係人就填一張，記下原話。',
      fields: [
        { k: 'who',   label: '訪談對象',       req: true,  ph: '例如：小雅（離院護理師）' },
        { k: 'where', label: '地點與時間',     req: false, ph: '例如：離院櫃台，11:20' },
        { k: 'ask',   label: '我問了什麼',     req: true,  ph: '你實際問的那句話' },
        { k: 'said',  label: '對方怎麼說（原話）', req: true, ph: '盡量照原話寫，不要改寫成自己的話' },
        { k: 'read',  label: '我的判讀',       req: true,  ph: '你認為這代表什麼？' },
        { k: 'trust', label: '可信度',         req: true,  type: 'select', options: TRUST },
        { k: 'next',  label: '下一步要問',     req: false, ph: '還想問誰、問什麼' } ] },
    '勘查卡': { group: 'structured', color: '#ffd8a8', hint: '看完一個線索就填一張。',
      fields: [
        { k: 'clue', label: '線索編號',       req: true,  ph: '例如：C-07' },
        { k: 'saw',  label: '我看到',         req: true,  ph: '一句話：你在現場看到的事實' },
        { k: 'read', label: '我的判讀',       req: false, ph: '（可不填）這代表什麼？' },
        { k: 'link', label: '可能和誰有關',   req: false, ph: '想去問誰來確認' } ] },
    '便利貼': { group: 'open', color: '#fff3bf', hint: '想到什麼就寫。', fields: [ { k: 'text', label: '內容', req: true, ph: '自由書寫' } ] },
    '問號':   { group: 'open', color: '#ffec99', hint: '還不知道、要去問的事。', fields: [ { k: 'text', label: '我想知道', req: true, ph: '要問誰、問什麼' } ] },
    '重要':   { group: 'open', color: '#ffc9c9', hint: '你覺得關鍵的發現。', fields: [ { k: 'text', label: '關鍵發現', req: true, ph: '為什麼重要？' } ] },
    '想法':   { group: 'open', color: '#b2f2bb', hint: '假設、方向、點子。', fields: [ { k: 'text', label: '我的想法', req: true, ph: '寫明根據哪幾張卡（填卡片編號）' } ] },
    '矛盾':   { group: 'open', color: '#d0bfff', hint: '兩個說法對不起來。', fields: [ { k: 'text', label: '哪兩邊對不起來', req: true, ph: '寫出兩邊的卡片編號與各自的說法' } ] },
    '留言':   { group: 'open', color: '#99e9f2', hint: '留給組員或之後來的人的話，會留在你目前所在的房間。', fields: [ { k: 'text', label: '留言', req: true, ph: '例如：這個房間的告示我覺得有問題' } ] }
  };

  var NAMES = Object.keys(TYPES);

  function validateCard(type, fields) {
    var t = TYPES[type], errors = [];
    if (!t) return { ok: false, errors: [{ field: 'type', msg: '沒有這種卡片：' + type }] };
    t.fields.forEach(function (fd) {
      var v = fields && fields[fd.k] !== undefined && fields[fd.k] !== null ? String(fields[fd.k]).trim() : '';
      if (fd.req && !v) errors.push({ field: fd.k, msg: '請填「' + fd.label + '」' });
      if (fd.type === 'select' && v && fd.options.indexOf(v) < 0) errors.push({ field: fd.k, msg: '「' + fd.label + '」要從選項中選' });
    });
    return { ok: errors.length === 0, errors: errors };
  }

  /* 卡片上顯示的文字（標題列＋各欄位） */
  function cardText(type, fields, id) {
    var t = TYPES[type], lines = ['【' + type + '】' + id];
    if (t.group === 'open') { lines.push(String(fields.text || '').trim()); return lines.join('\n'); }
    t.fields.forEach(function (fd) {
      var v = fields[fd.k] !== undefined && fields[fd.k] !== null ? String(fields[fd.k]).trim() : '';
      if (v) lines.push(fd.label + '：' + v);
    });
    return lines.join('\n');
  }

  /* 估算卡片高度：每行以 14px 字、卡片寬估算折行 */
  function estimateHeight(text, width) {
    var perLine = Math.max(8, Math.floor((width - 24) / 14)), n = 0;
    text.split('\n').forEach(function (ln) { n += Math.max(1, Math.ceil(ln.length / perLine)); });
    return Math.max(110, n * 20 + 26);
  }

  /* ctx：{ id, author, round, loc, clueId, persona, x, y, where:'room'|'notebook' }。回傳 convertToExcalidrawElements 用的骨架。 */
  function buildCard(type, fields, ctx) {
    var v = validateCard(type, fields);
    if (!v.ok) throw new Error(v.errors.map(function (e) { return e.msg; }).join('；'));
    var t = TYPES[type], text = cardText(type, fields, ctx.id), w = t.group === 'structured' ? 300 : 230, h = estimateHeight(text, w);
    return { width: w, height: h, text: text, skeleton: [ {
      type: 'rectangle', x: ctx.x, y: ctx.y, width: w, height: h,
      backgroundColor: t.color, strokeColor: '#1e1e1e', strokeWidth: 3, roughness: 2, fillStyle: 'solid', roundness: { type: 3 },
      label: { text: text, fontSize: 14 },
      customData: { marker: { id: ctx.id, type: type, author: String(ctx.author), round: ctx.round, loc: ctx.loc || '', where: ctx.where || 'notebook',
        clueId: ctx.clueId || '', persona: ctx.persona || '', text: text, fields: fields } } } ] };
  }

  return { TYPES: TYPES, NAMES: NAMES, TRUST: TRUST, validateCard: validateCard, cardText: cardText, estimateHeight: estimateHeight, buildCard: buildCard };
});
