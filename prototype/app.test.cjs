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
    if (id) { el.id = id[1]; doc.byId[el.id] = el; } if (cls) el.className = cls[1];
    el.hidden = /\bhidden\b/.test(m[3]); el.open = /\bopen\b/.test(m[3]); el.disabled = /\bdisabled\b/.test(m[3]);
    stack.at(-1).append(el); if (!['meta', 'link', 'img', 'br', 'hr', 'input'].includes(tag)) stack.push(el);
    if (tag === 'body') doc.body = el;
  }
  doc.activeElement = doc.body;
  const FakeDate = class extends Date { static now() { return now; } };
  const sandbox = { document: doc, Date: FakeDate, console, localStorage: { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v) }, setInterval: fn => intervals.push(fn), addEventListener() {} };
  sandbox.window = sandbox; const context = vm.createContext(sandbox);
  for (const file of ['content.js', 'engine.js', 'app.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), context, { filename: file });
  return { doc, storage, context, state: () => JSON.parse(storage.get('pochta-workshops-v9')), advance(ms) { now += ms; intervals.forEach(fn => fn()); } };
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
  const broken = new Map([['pochta-workshops-v9', '{broken json']]); const recovered = session(broken); assert.match(recovered.doc.getElementById('tip').textContent, /Хранилище/); assert.equal(recovered.state().version, 9);
});

test('Board gestures assemble a gift and change the letter action to Send without opening recipe', () => {
  const s = session(), $ = id => s.doc.getElementById(id);
  const clickCell = i => $('board').events.click[0]({ target: $('board').children[i] });
  clickCell(23); // C4: component level 2.
  clickCell(16); // C3: component level 1 => first gift.
  assert.equal(s.state().board[16].gift.level, 1);
  const send = $('letters').children[0].querySelector('button'); assert.equal(send.textContent, 'Отправить');
  assert.equal($('recipe-dialog').open, false); send.click(); assert.equal(s.state().board[16], null); assert.equal(s.state().mail.length, 1);
});
test('An existing v8 save migrates automatically and stays untouched', () => {
  const first = session(), old = first.state(); old.version = 8; delete old.giftStore;
  const serialized = JSON.stringify(old), storage = new Map([['pochta-workshops-v8', serialized]]);
  const upgraded = session(storage); assert.equal(upgraded.state().version, 9); assert.equal(upgraded.state().letters[0].id, old.letters[0].id);
  assert.equal(storage.get('pochta-workshops-v8'), serialized); assert.match(upgraded.doc.getElementById('tip').textContent, /перенесён/);
});
