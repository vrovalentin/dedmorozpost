// Headless DOM contract test for actual app event handlers; not a visual/browser test.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function session(storage = new Map()) {
  let now = 1000000; const intervals = [];
  class Element {
    constructor(tag, doc) { this.tagName = tag.toLowerCase(); this.doc = doc; this.children = []; this.parentElement = null; this.className = ''; this.dataset = {}; this.attrs = {}; this.events = {}; this.disabled = false; this.hidden = false; this.open = false; this._text = ''; this.style = { setProperty() {} };
      this.classList = { add: (...c) => { this.className = [...new Set([...this.className.split(' ').filter(Boolean), ...c])].join(' '); }, remove: c => { this.className = this.className.split(' ').filter(x => x !== c).join(' '); }, toggle: (c, force) => { const enable = force === undefined ? !this.className.split(' ').includes(c) : force; if (enable) this.classList.add(c); else this.classList.remove(c); } };
    }
    set textContent(v) { this._text = String(v); this.children = []; }
    get textContent() { return this._text + this.children.map(x => x.textContent).join(''); }
    append(...nodes) { for (const x of nodes) { if (x.tagName === '#fragment') this.append(...x.children); else { this.children.push(x); x.parentElement = this; } } }
    prepend(...nodes) { for (const x of nodes.reverse()) { this.children.unshift(x); x.parentElement = this; } }
    replaceChildren(...nodes) { this.children = []; this._text = ''; this.append(...nodes); }
    remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(x => x !== this); }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    addEventListener(type, fn) { (this.events[type] ||= []).push(fn); }
    click() { if (this.disabled) return; for (const fn of this.events.click || []) fn({ target: this }); }
    focus() { this.doc.activeElement = this; }
    showModal() { this.open = true; }
    close() { this.open = false; }
    scrollIntoView() {}
    hasPointerCapture() { return false; }
    setPointerCapture() {}
    releasePointerCapture() {}
    matches(selector) {
      return selector.split(',').some(raw => { const s = raw.trim();
        if (s.startsWith('#')) return this.id === s.slice(1);
        if (s.startsWith('.')) return this.className.split(' ').includes(s.slice(1));
        if (s === 'dialog[open]') return this.tagName === 'dialog' && this.open;
        const d = s.match(/^\[data-([a-z]+)(?:="([^"]*)")?\]$/); if (d) return d[2] === undefined ? this.dataset[d[1]] !== undefined : String(this.dataset[d[1]]) === d[2];
        return this.tagName === s;
      });
    }
    closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector); }
    querySelectorAll(selector) { return this.children.flatMap(x => [...(x.matches(selector) ? [x] : []), ...x.querySelectorAll(selector)]); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  }
  const doc = { hidden: false, byId: {}, events: {}, createElement(t) { return new Element(t, this); }, createDocumentFragment() { return new Element('#fragment', this); }, getElementById(id) { return this.byId[id]; }, addEventListener(t, fn) { (this.events[t] ||= []).push(fn); }, querySelector(s) { return this.root.querySelector(s); }, querySelectorAll(s) { return this.root.querySelectorAll(s); } };
  doc.root = new Element('#document', doc);
  const stack = [doc.root], html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  for (const m of html.matchAll(/<(\/?)([a-z][\w-]*)([^>]*)>/gi)) {
    const tag = m[2].toLowerCase();
    if (m[1]) { while (stack.length > 1 && stack.at(-1).tagName !== tag) stack.pop(); if (stack.length > 1) stack.pop(); continue; }
    const el = doc.createElement(tag), id = m[3].match(/\bid="([^"]+)"/), cls = m[3].match(/\bclass="([^"]+)"/);
    if (id) { el.id = id[1]; assert(!doc.byId[el.id], 'Duplicate HTML id: ' + el.id); doc.byId[el.id] = el; } if (cls) el.className = cls[1];
    el.hidden = /\bhidden\b/.test(m[3]); el.open = /\bopen\b/.test(m[3]); el.disabled = /\bdisabled\b/.test(m[3]);
    stack.at(-1).append(el); if (!['meta', 'link', 'img', 'br', 'hr', 'input'].includes(tag)) stack.push(el);
    if (tag === 'body') doc.body = el;
  }
  doc.activeElement = doc.body;
  const FakeDate = class extends Date { static now() { return now; } };
  const sandbox = { document: doc, Date: FakeDate, console, localStorage: { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v) }, setInterval: fn => intervals.push(fn), addEventListener() {} };
  sandbox.window = sandbox; const context = vm.createContext(sandbox);
  for (const file of ['content.js', 'engine.js', 'app.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), context, { filename: file });
  return { doc, storage, context, state: () => JSON.parse(storage.get('pochta-workshops-v12')), advance(ms) { now += ms; intervals.forEach(fn => fn()); } };
}
test('Actual UI handlers: initial render → recipe → craft → send → delayed answer → heart → snow', () => {
  const s = session(), $ = id => s.doc.getElementById(id);
  assert.equal($('board').children.length, 63); assert.equal($('letters').children.length, 3); assert.equal($('thanks').textContent, '0');
  const first = $('letters').children[0].querySelector('button'); first.click(); assert($('recipe-dialog').open);
  const craft = $('recipe-items').querySelector('button'); assert(!craft.disabled); craft.click(); assert(s.state().letters[0].packed[0]);
  assert(!$('recipe-send').disabled); $('recipe-send').click(); assert(!$('recipe-dialog').open); assert.equal(s.state().mail.length, 1); assert.equal(s.state().thanks, 0);
  // Outcome is persisted by send; either success or a clear failure response must work.
  const outcome = s.state().mail[0].outcome;
  s.advance(20000); const open = $('mail-list').querySelector('button'); assert(open); open.click(); assert($('reply-dialog').open); $('reply-claim').click();
  assert(s.state().mail[0].claimed); assert.equal(s.state().thanks, outcome === 'success' ? 1 : 0);
  assert.equal($('reply-dialog').open, false);
  // A board click selects a snow tile and displays cost/access, without charging on selection.
  const snow = $('board').children[22]; // B4 is adjacent to the open table.
  $('board').events.click[0]({ target: snow }); assert(!$('snow-panel').hidden); assert.match($('melt').textContent, /1/);
  if (outcome === 'success') { $('melt').click(); assert.equal(s.state().thanks, 0); assert.equal(s.state().cleared.length, 1); }
  $('speed').click(); assert.equal(s.state().speed, 10); assert.match($('speed').textContent, /включён/);
});
test('UI reload reads its own save, catalog has eight tiers, and errors in storage are visible', () => {
  const first = session(); const state = first.state();
  const second = session(first.storage); assert.deepEqual(second.state(), state);
  const catalog = second.doc.getElementById('catalog'); assert.equal(catalog.querySelectorAll('.catalog-part').length, 8); assert.equal(catalog.querySelectorAll('.catalog-gift').length, 8);
  const broken = new Map([['pochta-workshops-v12', '{broken json']]); const recovered = session(broken); assert.match(recovered.doc.getElementById('tip').textContent, /Хранилище/); assert.equal(recovered.state().version, 12);
});

test('Board crafting marks the envelope ready; opening the full letter sends the gift once', () => {
  const s = session(), $ = id => s.doc.getElementById(id);
  const clickCell = i => $('board').events.click[0]({ target: $('board').children[i] });
  clickCell(23); // C4: component level 2.
  clickCell(16); // C3: component level 1 => first gift.
  assert.equal(s.state().board[16].gift.level, 1);
  const open = $('letters').children[0].querySelector('button'); assert.match(open.textContent, /Отправить/);
  assert.match(open.attrs['aria-label'], /Подарки готовы/);
  assert.equal($('recipe-dialog').open, false); open.click();
  assert($('recipe-dialog').open); assert(s.state().board[16]?.gift); assert.equal(s.state().mail.length, 0);
  assert.match($('recipe-story').textContent, /«.+»/); assert(!$('recipe-send').disabled);
  $('recipe-send').click(); assert.equal(s.state().board[16], null); assert.equal(s.state().mail.length, 1);
});
test('An existing v8 save migrates automatically and stays untouched', () => {
  const first = session(), old = first.state(); old.version = 8; delete old.giftStore;
  const serialized = JSON.stringify(old), storage = new Map([['pochta-workshops-v8', serialized]]);
  const upgraded = session(storage); assert.equal(upgraded.state().version, 12); assert.equal(upgraded.state().letters[0].id, old.letters[0].id);
  assert.equal(storage.get('pochta-workshops-v8'), serialized); assert.match(upgraded.doc.getElementById('tip').textContent, /перенесён/);
});

test('UI offers dismantling for both a field gift and a packed gift', () => {
  const s = session(), $ = id => s.doc.getElementById(id);
  const clickCell = i => $('board').events.click[0]({ target: $('board').children[i] });
  clickCell(23); clickCell(16); clickCell(16);
  assert.equal($('return').textContent, '↩ Разобрать'); assert(!$('return').disabled); $('return').click();
  assert(!s.state().board.some(x => x?.gift));
  $('letters').children[0].querySelector('button').click(); $('recipe-items').querySelector('button').click();
  const dismantle = $('recipe-items').querySelector('button'); assert.equal(dismantle.textContent, 'Разобрать на детали'); dismantle.click();
  assert.equal(s.state().letters[0].packed[0], false); assert.equal($('energy').textContent, '40 / 40');
});

test('Blue sprites stay consistent across board, letter and recipe, with a readable fallback', () => {
  const s = session(), $ = id => s.doc.getElementById(id);
  const generator = $('board').children[3].querySelector('img'); assert.match(generator.src, /generator.webp$/);
  assert.match($('board').children[16].querySelector('img').src, /part-1.webp$/);
  const letter = $('letters').children[0]; const giftImage = letter.querySelector('img'); assert.match(giftImage.src, /gift-1.webp$/);
  letter.querySelector('button').click();
  assert.equal($('recipe-items').querySelector('img').src, giftImage.src);
  assert.equal($('recipe-items').querySelectorAll('.part-chip').length, 2);
  generator.events.error[0](); assert.equal($('board').children[3].querySelector('img'), null); assert.match($('board').children[3].textContent, /🧰/);
  assert.equal(s.state().version, 12); // Current save schema.
});

test('Single toolbox creates a part with a single click without losing usable board space', () => {
  const s = session(), $ = id => s.doc.getElementById(id);
  assert.equal($('generators').children.length, 1); assert($('production-choice').hidden); const station = $('generators').children[0]; assert.match(station.attrs['aria-label'], /Ящик/);
  const before = s.state(), empty = before.board.filter(x => x === null).length;
  station.focus(); station.click(); const after = s.state(); assert.equal(after.energy, before.energy - 1);
  assert.equal(s.doc.activeElement, $('generators').children[0]);
  assert.equal(after.board.filter(x => x === null).length, empty - 1);
  assert.equal(after.board.filter(x => x?.gen).length, 1);
});

test('Illustrated scene keeps live controls accessible and opens a full letter without spending resources', () => {
  const s = session(), $ = id => s.doc.getElementById(id);
  const scene = $('room-scene');
  assert.equal($('board').parentElement, scene); assert.equal($('letters').parentElement, scene);
  assert.equal($('generators').closest('#room-scene'), scene);
  assert.notEqual(scene.attrs['aria-hidden'], 'true');
  assert(scene.querySelector('.scene-background'));
  assert.equal($('letters').querySelectorAll('button').length, 3);
  const before = s.state(); $('letters').children[1].querySelector('button').click();
  assert($('recipe-dialog').open); assert.match($('recipe-story').textContent, /«.+»/);
  assert.equal(s.state().energy, before.energy); assert.equal(s.state().mail.length, before.mail.length);
  $('recipe-close').click(); assert(!$('recipe-dialog').open);
});

test('Room restoration survives reload and workshop transitions, and undo removes a new improvement', () => {
  const E = require('./engine.js'), g = new E.Game(undefined, () => 1000000, () => .5);
  // Valid history of successful deliveries funds clearance; production is covered by engine tests.
  for (let n = 0; n < 400; n++) {
    const order = JSON.parse(JSON.stringify(g.state.letters[0])); order.id = g.state.nextId++;
    g.state.mail.push({ id: g.state.nextMailId++, order, shift: 0, attempt: 1, outcome: 'success', claimed: true, bonusEnergy: 0, dueAt: 1000000 });
  }
  g.state.thanks = 400;
  assert(E.validate(g.state));
  const load = () => session(new Map([['pochta-workshops-v12', JSON.stringify(g.state)]]));
  const clearOne = () => {
    const cell = g.state.board.findIndex((x, i) => x?.snow && E.accessible(g.state, i));
    assert(cell >= 0); assert(g.act({ type: 'melt', cell }).ok); return cell;
  };
  assert.match(load().doc.getElementById('room-state').textContent, /Холодное окно/);
  for (let n = 0; n < 5; n++) clearOne();
  const s = load(), $ = id => s.doc.getElementById(id);
  assert(!$('room-scene').className.includes('window-fixed'));
  const sixth = g.state.board.findIndex((x, i) => x?.snow && E.accessible(g.state, i));
  $('board').events.click[0]({ target: $('board').children[sixth] }); $('melt').click();
  assert($('room-scene').className.includes('window-fixed'));
  assert(session(s.storage).doc.getElementById('room-scene').className.includes('window-fixed'));
  $('undo').click(); assert(!$('room-scene').className.includes('window-fixed'));
  assert.equal(s.state().cleared.length, 5);
  while (g.state.cleared.length < 12) clearOne();
  const warm = load(); assert(warm.doc.getElementById('room-scene').className.includes('stove-warm'));
  assert.match(warm.doc.getElementById('room-progress').textContent, /2 \/ 5/);
  for (let shift = 0; shift < 3; shift++) {
    while (g.state.board.some(x => x?.snow)) clearOne();
    assert(g.act({ type: 'build' }).ok); assert(E.validate(g.state));
    const restored = load();
    assert(restored.doc.getElementById('room-shelf-items').querySelector('img'));
    assert.equal(restored.doc.getElementById('room-placed-decor').children.length, 4);
    assert.match(restored.doc.getElementById('room-progress').textContent, new RegExp((shift + 3) + ' / 5'));
    if (shift < 2) {
      assert(g.act({ type: 'next' }).ok); assert(E.validate(g.state));
      const switched = load(), get = id => switched.doc.getElementById(id);
      assert.equal(get('generators').children.length, 1); assert(!get('production-choice').hidden);
      const chain = Object.values(E.SHIFTS[g.state.shift].generators).at(-1), before = switched.state();
      get('production-select').value = chain; get('production-select').events.change[0]();
      assert.equal(get('generators').children.length, 1); get('generators').children[0].click();
      assert.equal(switched.state().energy, before.energy - 1);
      assert.equal(switched.state().board.filter(x => x?.chain === chain).length, before.board.filter(x => x?.chain === chain).length + 1);
    }
  }
  assert(load().doc.getElementById('room-scene').className.includes('post-restored'));
});

test('Snow artwork distinguishes all three costs and clearance reveals one find without changing rewards', () => {
  const E = require('./engine.js'), g = new E.Game(undefined, () => 1000000, () => .5);
  const order = g.state.letters[0];
  assert(g.act({ type: 'craft', orderId: order.id, giftIndex: 0 }).ok);
  assert(g.act({ type: 'send', orderId: order.id }).ok);
  g.state.mail[0].dueAt = 1000000;
  assert(g.act({ type: 'claim', mailId: g.state.mail[0].id }).ok);
  const s = session(new Map([['pochta-workshops-v12', JSON.stringify(g.state)]])), $ = id => s.doc.getElementById(id);
  for (const [cell, file, cost] of [['B4','loose',1],['D6','packed',2],['D9','ice',5]]) {
    const el = $('board').children[E.at(cell)]; assert.match(el.querySelector('img').src, new RegExp(file+'\\.webp$')); assert.equal(el.querySelector('.level').textContent, cost+'♡');
  }
  assert.equal($('snow-legend').children.length, 3);
  const select = cell => $('board').events.click[0]({target:$('board').children[E.at(cell)]});
  select('D9'); assert($('melt').disabled); assert($('find-feedback').hidden);
  select('B4'); assert(!$('melt').disabled); $('melt').click();
  assert.equal(s.state().thanks, 0); assert.equal(s.state().cleared.length, 1); assert.equal(s.state().board[E.at('B4')], null);
  assert(!$('find-feedback').hidden); assert.match($('find-title').textContent, /Станина/); assert($('board').children[E.at('B4')].querySelector('.clear-effect'));
  $('undo').click(); assert.equal(s.state().thanks, 1); assert.equal(s.state().cleared.length, 0); assert($('find-feedback').hidden);
});
