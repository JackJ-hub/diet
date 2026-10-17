(function () {
  'use strict';

  /* ================= 存储 ================= */
  const KEY = 'diet.v1';
  const DEF_GOALS = { kcal: 2000, protein: 120, fiber: 30 };
  const $app = document.getElementById('app');

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const r2 = n => Math.round((+n || 0) * 100) / 100;

  function normalize(d) {
    d = d && typeof d === 'object' ? d : {};
    const goals = Object.assign({}, DEF_GOALS, d.goals || {});
    const days = {};
    for (const [k, v] of Object.entries(d.days || {})) {
      if (!validKey(k) || !v || typeof v !== 'object') continue;
      days[k] = {
        goals: Object.assign({}, goals, v.goals || {}),
        items: (Array.isArray(v.items) ? v.items : []).filter(Boolean).map(it => {
          const o = { id: String(it.id || uid()), text: String(it.text || ''), kcal: +it.kcal || 0, protein: +it.protein || 0, fiber: +it.fiber || 0 };
          if (it.manual) o.manual = true;
          return o;
        })
      };
    }
    const custom = d.custom && typeof d.custom === 'object' && !Array.isArray(d.custom) ? d.custom : {};
    return { goals, days, custom };
  }
  function load() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(KEY)); } catch (e) { /* ignore */ }
    return normalize(d);
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ }
  }
  /* ================= 工具 ================= */
  const pad = n => String(n).padStart(2, '0');
  const keyOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => keyOf(new Date());
  const dateOf = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  function validKey(k) { return /^\d{4}-\d{2}-\d{2}$/.test(k) && keyOf(dateOf(k)) === k; }
  const WD = '日一二三四五六';
  function dateLabel(k) {
    const d = dateOf(k);
    return (d.getFullYear() !== new Date().getFullYear() ? d.getFullYear() + '年' : '') + (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }
  const wdLabel = k => '周' + WD[dateOf(k).getDay()] + (k === today() ? ' · 今天' : '');

  const fmtK = n => (Math.round(n) || 0).toLocaleString('en-US');
  const fmt1 = n => String(Math.round(n * 10) / 10 || 0);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MINUS = '−';
  const signed = (n, f) => (n < 0 ? MINUS : n > 0 ? '+' : '') + f(Math.abs(n));

  function sum(day) {
    const t = { kcal: 0, protein: 0, fiber: 0 };
    for (const it of day.items) { t.kcal += +it.kcal || 0; t.protein += +it.protein || 0; t.fiber += +it.fiber || 0; }
    return t;
  }
  const newDay = () => ({ goals: Object.assign({}, S.goals), items: [] });

  let S = load(); // 需在 keyOf/validKey 等常量初始化之后

  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 1800);
  }

  const SVG = (inner, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"${extra}>${inner}</svg>`;
  const ICON = {
    more: SVG('<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>', ' stroke-width="2.5"'),
    plus: SVG('<path d="M12 5v14M5 12h14"/>', ' stroke-width="2.5"'),
    back: SVG('<path d="M15 5l-7 7 7 7"/>', ' stroke-width="2.5"'),
    trash: SVG('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>')
  };

  const METRICS = [
    { k: 'kcal', c: 'var(--kcal)', lbl: '卡路里', unit: 'kcal' },
    { k: 'protein', c: 'var(--pro)', lbl: '蛋白质', unit: 'g' },
    { k: 'fiber', c: 'var(--fib)', lbl: '纤维', unit: 'g' }
  ];

  /* ================= 解析 ================= */
  const WEIGHT = { g: 1, 克: 1, kg: 1000, 公斤: 1000, 千克: 1000, 斤: 500, 两: 50, ml: 1, 毫升: 1, l: 1000, 升: 1000 };
  const COUNT = '个 只 颗 粒 碗 杯 片 根 勺 份 盒 瓶 包 块 条 袋 罐 听 串 张 把 盘 朵 段 节 瓣'.split(' ');
  const UNITS = Object.keys(WEIGHT).concat(COUNT).sort((a, b) => b.length - a.length).join('|');
  const CN = { 半: 0.5, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
  const NUM = '(\\d+(?:\\.\\d+)?)';
  const RE_KCAL = new RegExp(NUM + '\\s*(?:kcal|千卡|大卡|卡路里|cal|卡(?![布夫拉]))', 'i');
  const RE_PRO = [new RegExp(NUM + '\\s*(?:g|克)?\\s*(?:蛋白质|蛋白(?![粉棒液饮])|p(?![a-z]))', 'i'), new RegExp('蛋白质\\s*[:：]?\\s*' + NUM)];
  const RE_FIB = [new RegExp(NUM + '\\s*(?:g|克)?\\s*(?:膳食纤维|纤维|f(?![a-z]))', 'i'), new RegExp('(?:膳食纤维|纤维)\\s*[:：]?\\s*' + NUM)];
  const RE_QTY = new RegExp(NUM + '(?![\\d.])\\s*((?:' + UNITS + ')(?![a-z]))?', 'i');
  const RE_CNQ = new RegExp('([半一二两三四五六七八九十])\\s*(' + UNITS + ')(?![a-z])', 'i');
  const RE_PUNCT = /[\s,，。.、;；:：!！?？~～\-—_+＋*×()（）\[\]【】"“”'‘’/]/g;

  function customFoods() {
    return Object.entries(S.custom).map(([name, c]) => ({
      name, aliases: [name], kcal: +c.kcal || 0, protein: +c.protein || 0, fiber: +c.fiber || 0,
      units: c.units && Object.keys(c.units).length ? c.units : { 份: 100 }, unit: c.unit || Object.keys(c.units || { 份: 1 })[0] || '份', custom: true
    }));
  }
  const allFoods = () => customFoods().concat(typeof FOODS !== 'undefined' ? FOODS : []);

  function findFood(name) {
    if (!name) return null;
    const list = allFoods();
    let best = null, bl = 0;
    for (const f of list) for (const a of f.aliases) {
      if (a === name) return f;
      if (a.length > bl && name.includes(a)) { best = f; bl = a.length; }
    }
    if (best) return best;
    if (name.length >= 2) for (const f of list) for (const a of f.aliases) if (a.startsWith(name)) return f;
    return null;
  }

  function take(s, res) {
    for (const re of [].concat(res)) {
      const m = s.match(re);
      if (m) return { s: s.replace(m[0], ' '), v: parseFloat(m[1]) };
    }
    return { s, v: null };
  }

  function parse(text) {
    let s = String(text || '');
    let r = take(s, RE_KCAL); s = r.s; const ek = r.v;
    r = take(s, RE_PRO); s = r.s; const ep = r.v;
    r = take(s, RE_FIB); s = r.s; const ef = r.v;

    let qty = null, u = null, m = s.match(RE_QTY);
    if (m) { qty = parseFloat(m[1]); u = m[2] ? m[2].toLowerCase() : null; s = s.replace(m[0], ' '); }
    else if ((m = s.match(RE_CNQ))) { qty = CN[m[1]]; u = m[2].toLowerCase(); s = s.replace(m[0], ' '); }

    const name = s.replace(RE_PUNCT, '').replace(/^(吃了|喝了)/, '');
    const food = findFood(name);
    // 只写了较大的数字没写单位，按克处理（如 "米饭 200"）
    if (food && qty != null && !u && qty >= 50 && !food.custom) u = 'g';
    const weight = !!(u && WEIGHT[u]);

    let grams = null, desc = '', unit = u;
    if (weight) {
      grams = qty * WEIGHT[u];
      const gu = /ml|毫升|^l$|升/.test(u) ? 'ml' : 'g';
      desc = (u === 'g' || u === 'ml') ? fmt1(qty) + u : `${fmt1(qty)}${u} ≈ ${fmt1(grams)}${gu}`;
    }

    let kcal = 0, protein = 0, fiber = 0, src = 'none';
    if (food) {
      src = food.custom ? 'custom' : 'db';
      if (!weight) {
        unit = u && food.units[u] ? u : food.unit;
        const q = qty == null ? 1 : qty;
        grams = q * food.units[unit];
        qty = q;
        desc = food.custom ? `${fmt1(q)}${unit}` : `${fmt1(q)}${unit} ≈ ${fmt1(grams)}g`;
      }
      kcal = food.kcal * grams / 100;
      protein = food.protein * grams / 100;
      fiber = food.fiber * grams / 100;
      if (ek != null) {
        const ratio = kcal > 0 ? ek / kcal : 0;
        protein *= ratio; fiber *= ratio; kcal = ek;
      }
    } else if (ek != null) {
      src = 'kcal'; kcal = ek;
    }
    if (ep != null) protein = ep;
    if (ef != null) fiber = ef;
    return { name, food, kcal: r2(kcal), protein: r2(protein), fiber: r2(fiber), src, desc, qty, unit, grams, weight };
  }
  window.__parse = parse;

  function saveCustom(item) {
    const p = parse(item.text);
    if (!p.name) return null;
    let factor, u;
    if (p.weight) { factor = p.grams > 0 ? 100 / p.grams : 1; u = '份'; }
    else { u = p.unit || '份'; factor = 1 / (p.qty || 1); }
    S.custom[p.name] = { kcal: r2(item.kcal * factor), protein: r2(item.protein * factor), fiber: r2(item.fiber * factor), units: { [u]: 100 }, unit: u };
    save();
    return p.name;
  }

  function matchText(p, manual) {
    const parts = [];
    if (p.food && p.food.name !== p.name) parts.push('≈ ' + p.food.name);
    if (p.desc && (p.food || p.src === 'kcal')) parts.push(p.desc);
    if (manual) parts.push('手填');
    return parts.join(' · ');
  }
  const numsText = o => `<b>${fmtK(o.kcal)}</b> kcal · 蛋白 ${fmt1(o.protein)} · 纤维 ${fmt1(o.fiber)}`;
  const googleUrl = t => 'https://www.google.com/search?q=' + encodeURIComponent(t + ' 热量 蛋白质 膳食纤维');

  /* ================= 路由 ================= */
  let cur = null;        // 当前查看的日期
  let editingId = null;  // 正在编辑的条目

  function leaveDay(k) {
    const d = S.days[k];
    if (d) {
      d.items = d.items.filter(it => it.text.trim());
      if (!d.items.length) delete S.days[k];
      save();
    }
    editingId = null;
  }

  function route() {
    const m = location.hash.match(/^#\/d\/(\d{4}-\d{2}-\d{2})$/);
    const k = m && S.days[m[1]] ? m[1] : null;
    if (cur && cur !== k) leaveDay(cur);
    if (location.hash && location.hash !== '#/' && !k) history.replaceState(null, '', '#/');
    const changed = cur !== k;
    cur = k;
    if (k) renderDay(); else renderHome();
    if (changed) window.scrollTo(0, 0);
  }

  /* ================= 主页 ================= */
  function renderHome() {
    const t = today();
    const past = Object.keys(S.days).filter(k => k < t);
    let bk = 0, bp = 0;
    for (const k of past) { const d = S.days[k], s = sum(d); bk += s.kcal - d.goals.kcal; bp += s.protein - d.goals.protein; }
    const cls = n => (n < 0 ? 'neg' : 'pos');

    $app.innerHTML = `
      <header class="top"><h1>饮食</h1><button class="icon-btn" id="menu" aria-label="更多">${ICON.more}</button></header>
      <section class="summary">
        <p class="sec-lbl">每日目标</p>
        <div class="goals">${METRICS.map(x => `
          <div class="goal" style="--c:${x.c}">
            <label for="g-${x.k}">${x.lbl}</label>
            <input id="g-${x.k}" data-k="${x.k}" inputmode="numeric" value="${esc(S.goals[x.k])}">
            <span class="unit">${x.unit}</span>
          </div>`).join('')}
        </div>
        <div class="balance">
          <div class="bal"><span>累计卡路里</span><b class="${cls(bk)}">${signed(bk, fmtK)}<small>≈ ${signed(bk / 7700, n => n.toFixed(2))} kg</small></b></div>
          <div class="bal p"><span>累计蛋白质</span><b class="${cls(bp)}">${signed(bp, fmt1)}<small>g</small></b></div>
        </div>
        <p class="hint">${past.length ? `截至昨天 · 共 ${past.length} 天` : '还没有往日记录'}</p>
      </section>
      <div class="grid" id="grid"></div>
      <button class="fab" id="fab" aria-label="记录今天">${ICON.plus}</button>`;

    renderGrid();
    document.getElementById('menu').onclick = openMenu;
    document.getElementById('fab').onclick = () => {
      const k = today();
      if (!S.days[k]) { S.days[k] = newDay(); save(); }
      location.hash = '#/d/' + k;
    };
    $app.querySelectorAll('.goal input').forEach(inp => {
      inp.addEventListener('input', () => {
        const v = parseInt(inp.value.replace(/[^\d]/g, ''), 10);
        if (!(v > 0)) return;
        S.goals[inp.dataset.k] = v;
        const td = S.days[today()];
        if (td) td.goals[inp.dataset.k] = v;
        save();
        renderGrid();
      });
      inp.addEventListener('blur', () => { inp.value = S.goals[inp.dataset.k]; });
    });
  }

  function renderGrid() {
    const g = document.getElementById('grid');
    if (!g) return;
    const t = today();
    const keys = Object.keys(S.days).sort().reverse();
    if (!keys.length) { g.innerHTML = '<div class="empty">还没有记录<br>点右下角 ＋ 开始记录今天</div>'; return; }
    g.innerHTML = keys.map(k => {
      const d = S.days[k], s = sum(d);
      const bar = x => `<i style="--p:${Math.min(100, d.goals[x.k] > 0 ? Math.round(s[x.k] / d.goals[x.k] * 100) : 0)}%;--c:${x.c}"></i>`;
      return `<a class="card${k === t ? ' today' : ''}" href="#/d/${k}">
        <div class="c-date">${dateLabel(k)}</div>
        <div class="c-wd">${wdLabel(k)}</div>
        <div class="c-kcal">${fmtK(s.kcal)}<small>kcal</small></div>
        <div class="bars">${METRICS.map(bar).join('')}</div>
        <div class="c-foods">${d.items.map(it => esc(it.text)).join('、')}</div>
      </a>`;
    }).join('');
  }

  /* ================= 记录单 ================= */
  const day = () => S.days[cur];
  const findItem = id => day() && day().items.find(it => it.id === id);

  function renderDay() {
    const k = cur;
    $app.innerHTML = `
      <header class="top">
        <a class="back" href="#/">${ICON.back}全部</a>
        <div class="day-title">${dateLabel(k)}<small>${wdLabel(k)}</small><input type="date" id="date" value="${k}" aria-label="更改日期"></div>
        <div class="right"><button class="icon-btn" id="del-day" aria-label="删除这一天">${ICON.trash}</button></div>
      </header>
      <div class="day">
        <section class="items">
          <ul id="list"></ul>
          <div class="adder">
            <form id="add-form" autocomplete="off">
              <input id="add" enterkeyhint="enter" placeholder="米饭 1碗、鸡蛋 2个" autocomplete="off">
              <button type="submit" aria-label="添加">${ICON.plus}</button>
            </form>
            <div class="preview" id="preview"></div>
            <div class="sugg" id="sugg"></div>
          </div>
          <div class="tip">支持写法：米饭 1碗、鸡胸肉 150g、半碗粥、两个鸡蛋、拿铁 180卡、蛋白棒 1根 200卡 20蛋白 5纤维。识别不到的点 Google 查询后手填，会自动记住。</div>
        </section>
        <aside class="totals" id="totals">${METRICS.map(x => `
          <div class="m" data-k="${x.k}" style="--c:${x.c}">
            <div class="m-ring"><svg viewBox="0 0 84 84"><circle class="track" cx="42" cy="42" r="36"/><circle class="prog" cx="42" cy="42" r="36" stroke-dasharray="${RING_C}" stroke-dashoffset="${RING_C}" transform="rotate(-90 42 42)"/></svg>
              <div class="m-in"><b></b><span></span></div></div>
            <div class="m-lbl">${x.lbl}${x.unit === 'g' ? ' g' : ''}</div>
            <div class="m-left"></div>
          </div>`).join('')}
        </aside>
      </div>`;

    renderList();
    updateTotals();
    bindDay();
  }

  const RING_C = +(2 * Math.PI * 36).toFixed(2);

  function updateTotals() {
    const d = day();
    if (!d) return;
    const s = sum(d);
    document.querySelectorAll('#totals .m').forEach(el => {
      const k = el.dataset.k, tot = s[k], goal = d.goals[k] || 0;
      const p = goal > 0 ? Math.min(1, tot / goal) : 0;
      const f = k === 'kcal' ? fmtK : fmt1;
      const prog = el.querySelector('.prog');
      prog.setAttribute('stroke-dashoffset', (RING_C * (1 - p)).toFixed(2));
      prog.style.opacity = p > 0 ? 1 : 0;
      el.querySelector('.m-in b').textContent = f(tot);
      el.querySelector('.m-in span').textContent = '/' + f(goal);
      const left = goal - tot;
      let txt, over = false, done = false;
      if (k === 'kcal') { over = left < 0; txt = over ? '超出 ' + fmtK(-left) : '还可 ' + fmtK(left); }
      else { done = tot >= goal; txt = done ? '已达标 ✓' : '还差 ' + fmt1(left); }
      el.classList.toggle('over', over);
      el.classList.toggle('done', done);
      el.querySelector('.m-left').textContent = txt;
    });
  }

  function itemHtml(it) {
    const p = parse(it.text);
    if (it.id === editingId) {
      return `<li class="item editing" data-id="${esc(it.id)}">
        <input class="e-text" value="${esc(it.text)}" enterkeyhint="done" autocomplete="off">
        <div class="e-match">${esc(editMatch(p, it))}</div>
        <div class="e-nums">
          <label>kcal<input inputmode="decimal" data-k="kcal" value="${fmtK(it.kcal).replace(/,/g, '')}"></label>
          <label>蛋白 g<input inputmode="decimal" data-k="protein" value="${fmt1(it.protein)}"></label>
          <label>纤维 g<input inputmode="decimal" data-k="fiber" value="${fmt1(it.fiber)}"></label>
        </div>
        <div class="e-actions">
          <a class="g" target="_blank" rel="noopener" href="${esc(googleUrl(it.text))}">Google 查询</a>
          <button class="del" type="button">删除</button>
          <button class="ok" type="button">完成</button>
        </div>
      </li>`;
    }
    const unknown = !(+it.kcal) && !it.manual && p.src === 'none';
    const mt = matchText(p, it.manual);
    return `<li class="item" data-id="${esc(it.id)}">
      <div class="t">${esc(it.text)}</div>
      <div class="meta">${unknown ? '<span class="warn">未识别 · 点此填写</span>' : numsText(it)}</div>
      ${mt ? `<div class="match">${esc(mt)}</div>` : ''}
    </li>`;
  }
  function editMatch(p, it) {
    if (!it.text.trim()) return '输入食物和份量';
    if (p.src === 'none' && !it.manual) return '未识别，可 Google 查询后手填，完成后会记住';
    return matchText(p, it.manual) || (p.src === 'kcal' ? '按填写的热量' : '');
  }

  function renderList() {
    const ul = document.getElementById('list');
    if (ul && day()) ul.innerHTML = day().items.map(itemHtml).join('');
  }

  function finishEdit() {
    if (!editingId) return;
    const it = findItem(editingId);
    editingId = null;
    if (it) {
      if (!it.text.trim()) day().items = day().items.filter(x => x !== it);
      else if (it.manual && parse(it.text).src !== 'db') {
        const n = saveCustom(it);
        if (n) toast(`已记住「${n}」，下次自动识别`);
      }
    }
    save();
    renderList();
    updateTotals();
  }

  function bindDay() {
    const ul = document.getElementById('list');
    const form = document.getElementById('add-form');
    const input = document.getElementById('add');
    const preview = document.getElementById('preview');
    const sugg = document.getElementById('sugg');

    // —— 条目点击 / 编辑 ——
    ul.addEventListener('click', e => {
      const li = e.target.closest('li.item');
      if (!li) return;
      const id = li.dataset.id;
      if (li.classList.contains('editing')) {
        if (e.target.closest('.del')) {
          editingId = null;
          day().items = day().items.filter(it => it.id !== id);
          save(); renderList(); updateTotals();
        } else if (e.target.closest('.ok')) finishEdit();
        return;
      }
      finishEdit();
      editingId = id;
      renderList();
    });

    ul.addEventListener('input', e => {
      const li = e.target.closest('li.item.editing');
      const it = li && findItem(li.dataset.id);
      if (!it) return;
      if (e.target.classList.contains('e-text')) {
        it.text = e.target.value;
        const p = parse(it.text);
        it.kcal = p.kcal; it.protein = p.protein; it.fiber = p.fiber;
        delete it.manual;
        li.querySelector('.e-match').textContent = editMatch(p, it);
        li.querySelector('[data-k=kcal]').value = String(Math.round(it.kcal));
        li.querySelector('[data-k=protein]').value = fmt1(it.protein);
        li.querySelector('[data-k=fiber]').value = fmt1(it.fiber);
        li.querySelector('.g').href = googleUrl(it.text);
      } else if (e.target.dataset.k) {
        it[e.target.dataset.k] = parseFloat(e.target.value.replace(/,/g, '.')) || 0;
        it.manual = true;
        li.querySelector('.e-match').textContent = editMatch(parse(it.text), it);
      }
      save();
      updateTotals();
    });

    ul.addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target.closest('li.item.editing input')) { e.preventDefault(); e.target.blur(); }
    });

    // —— 添加 ——
    function updatePreview() {
      const v = input.value;
      if (!v.trim()) { preview.innerHTML = ''; sugg.innerHTML = ''; return; }
      const p = parse(v);
      if (p.src === 'none' && !p.kcal) preview.innerHTML = '<span class="warn">未识别，添加后可 Google 查询或手填</span>';
      else preview.innerHTML = '→ ' + numsText(p).replace(/<\/?b>/g, '') + (p.food ? ` (${esc(p.food.name)} ${esc(p.desc)})` : '');
      sugg.innerHTML = suggestions(p).map(f => {
        const g = f.units[f.unit] || 100;
        return `<button type="button" data-fill="${esc(f.name + ' 1' + f.unit)}">${esc(f.name)}<small>1${esc(f.unit)} ${fmtK(f.kcal * g / 100)}kcal</small></button>`;
      }).join('');
    }

    input.addEventListener('input', updatePreview);

    sugg.addEventListener('mousedown', e => e.preventDefault()); // 不让输入框失焦
    sugg.addEventListener('click', e => {
      const b = e.target.closest('button[data-fill]');
      if (!b) return;
      input.value = b.dataset.fill;
      input.focus();
      try { input.setSelectionRange(input.value.length, input.value.length); } catch (err) { /* ignore */ }
      updatePreview();
    });

    form.querySelector('button').addEventListener('mousedown', e => e.preventDefault());
    form.addEventListener('submit', e => {
      e.preventDefault();
      const v = input.value.trim();
      input.focus();
      if (!v) return;
      finishEdit();
      const p = parse(v);
      const it = { id: uid(), text: v, kcal: p.kcal, protein: p.protein, fiber: p.fiber };
      day().items.push(it);
      if (p.src === 'none') editingId = it.id;
      save();
      input.value = '';
      updatePreview();
      renderList();
      updateTotals();
      input.focus();
    });

    // —— 改日期 / 删除 ——
    const dateInp = document.getElementById('date');
    dateInp.addEventListener('change', () => {
      const nk = dateInp.value;
      if (!nk || nk === cur || !validKey(nk)) { dateInp.value = cur; return; }
      if (S.days[nk]) { alert('该日期已有记录'); dateInp.value = cur; return; }
      S.days[nk] = S.days[cur];
      delete S.days[cur];
      save();
      cur = nk;
      location.hash = '#/d/' + nk;
    });

    document.getElementById('del-day').onclick = () => {
      if (!confirm('删除这一天的记录？')) return;
      delete S.days[cur];
      cur = null;
      editingId = null;
      save();
      location.hash = '#/';
    };
  }

  function suggestions(p) {
    const name = p.name;
    if (!name || p.qty != null) return [];
    const out = [];
    for (const f of allFoods()) {
      let score = 9;
      for (const a of f.aliases) {
        const s = a === name ? 0 : a.startsWith(name) ? 1 : a.includes(name) ? 2 : 9;
        if (s < score) score = s;
      }
      if (score < 9) out.push({ f, score: (f.custom ? 0 : 10) + score, i: out.length });
    }
    return out.sort((a, b) => a.score - b.score || a.i - b.i).slice(0, 6).map(x => x.f);
  }

  /* ================= 菜单 ================= */
  function sheet(html, onClick) {
    const bg = document.createElement('div');
    bg.className = 'sheet-bg';
    bg.innerHTML = `<div class="sheet">${html}</div>`;
    bg.addEventListener('click', e => {
      if (e.target === bg) return bg.remove();
      const b = e.target.closest('[data-a]');
      if (b) onClick(b.dataset.a, b, bg);
    });
    document.body.appendChild(bg);
    return bg;
  }

  function openMenu() {
    const n = Object.keys(S.custom).length;
    sheet(`<h3>更多</h3>
      <div class="group">
        <button class="row" data-a="copy">复制备份到剪贴板</button>
        <button class="row" data-a="restore">从备份恢复</button>
      </div>
      <div class="group"><button class="row" data-a="foods">我的食物（${n}）</button></div>
      <div class="group"><button class="row c" data-a="x">取消</button></div>`, (a, b, bg) => {
      if (a === 'x') bg.remove();
      else if (a === 'copy') {
        bg.remove();
        const json = JSON.stringify(S);
        const fallback = () => prompt('复制下面的备份内容：', json);
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(json).then(() => toast('备份已复制到剪贴板'), fallback);
        } else fallback();
      } else if (a === 'restore') {
        bg.remove();
        const txt = prompt('粘贴备份内容：');
        if (!txt) return;
        let obj;
        try { obj = JSON.parse(txt); } catch (e) { alert('备份内容无法识别'); return; }
        if (!obj || typeof obj.days !== 'object' || Array.isArray(obj.days)) { alert('备份内容无法识别'); return; }
        if (!confirm(`将用备份（${Object.keys(obj.days).length} 天）覆盖当前所有记录，确定？`)) return;
        S = normalize(obj);
        save();
        route();
        toast('已恢复');
      } else if (a === 'foods') {
        bg.remove();
        openFoods();
      }
    });
  }

  function openFoods() {
    const names = Object.keys(S.custom).sort((a, b) => a.localeCompare(b, 'zh'));
    const rows = names.map(name => {
      const c = S.custom[name], u = c.unit || '份', g = (c.units && c.units[u]) || 100;
      const per = x => (+c[x] || 0) * g / 100;
      return `<div class="row"><span class="grow">${esc(name)}<br><small>1${esc(u)} · ${fmtK(per('kcal'))} kcal · 蛋白 ${fmt1(per('protein'))} · 纤维 ${fmt1(per('fiber'))}</small></span>
        <button class="danger" style="color:var(--warn)" data-a="del" data-name="${esc(name)}">删除</button></div>`;
    }).join('');
    sheet(`<h3>我的食物</h3>
      <div class="group">${rows || '<div class="row"><small>还没有记住的食物。识别不到的食物手填后会自动记住。</small></div>'}</div>
      <div class="group"><button class="row c" data-a="x">完成</button></div>`, (a, b, bg) => {
      if (a === 'x') return bg.remove();
      if (a === 'del') {
        delete S.custom[b.dataset.name];
        save();
        bg.remove();
        openFoods();
      }
    });
  }

  /* ================= 启动 ================= */
  (function init() {
    const m = location.hash.match(/^#\/d\/(\d{4}-\d{2}-\d{2})$/);
    let dirty = false;
    for (const [k, d] of Object.entries(S.days)) {
      if (!d.items.length && !(m && m[1] === k)) { delete S.days[k]; dirty = true; }
    }
    if (dirty) save();
    window.addEventListener('hashchange', route);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && !cur) renderHome();
    });
    route();
  })();
})();
