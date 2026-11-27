// Headless DOM contract test for actual app event handlers; not a visual/browser test.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const E = require('./engine.js');
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
    getBoundingClientRect() { return { left: 100, top: 280, bottom: 320, width: 50, height: 40 }; }
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
  const sandbox = { document: doc, innerWidth: 800, innerHeight: 600, Date: FakeDate, console, localStorage: { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v) }, setInterval: fn => intervals.push(fn), addEventListener() {} };
  sandbox.window = sandbox; const context = vm.createContext(sandbox);
  for (const file of ['content.js', 'engine.js', 'app.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), context, { filename: file });
  return { doc, storage, context, state: () => JSON.parse(storage.get('pochta-workshops-v26')), advance(ms) { now += ms; intervals.forEach(fn => fn()); } };
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
  const broken = new Map([['pochta-workshops-v26', '{broken json']]); const recovered = session(broken); assert.match(recovered.doc.getElementById('tip').textContent, /Хранилище/); assert.equal(recovered.state().version,E.VERSION);
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
  const upgraded = session(storage); assert.equal(upgraded.state().version,E.VERSION); assert(upgraded.state().extra.some(L => L.id === old.letters[0].id));
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
  assert.equal(s.state().version,E.VERSION); // Current save schema.
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
    g.state.mail.push({ id: g.state.nextMailId++, order, shift: 0, attempt: 1, outcome: 'success', claimed: true, bonusEnergy: 0, rewardThanks: 1, dueAt: 1000000 });
  }
  g.state.thanks = 400;
  assert(E.validate(g.state));
  const load = () => session(new Map([['pochta-workshops-v26', JSON.stringify(g.state)]]));
  const clearOne = () => {
    const cell = g.state.board.findIndex((x, i) => x?.snow && E.accessible(g.state, i));
    assert(cell >= 0); assert(g.act({ type: 'melt', cell }).ok); if (g.state.board[cell]?.find) assert(g.act({ type: 'pickup', cell }).ok); return cell;
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
      if (chain === 'sew') {
        const sewing = get('catalog').querySelectorAll('.catalog-workshop')[1];
        assert.equal(sewing.querySelectorAll('.catalog-part').filter(row => row.querySelector('img')).length, 3);
        assert.equal(sewing.querySelectorAll('.catalog-gift').filter(row => row.querySelector('img')).length, 8);
        const click = cell => get('board').events.click[0]({ target: get('board').children[E.at(cell)] });
        click('D4'); click('D3');
        const gift = get('board').children[E.at('D3')].querySelector('img'); assert.match(gift.src, /sewing\/sprites\/gift-1.webp$/);
        assert.equal(switched.state().board[E.at('D3')].gift.chain, 'sew');
      }
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
  const s = session(new Map([['pochta-workshops-v26', JSON.stringify(g.state)]])), $ = id => s.doc.getElementById(id);
  for (const [cell, file, cost] of [['B4','loose',1],['D6','packed',2],['D9','ice',5]]) {
    const el = $('board').children[E.at(cell)]; assert.match(el.querySelector('img').src, new RegExp(file+'\\.webp$')); assert.equal(el.querySelector('.level').textContent, cost+'♡');
  }
  assert.equal($('snow-legend').children.length, 3);
  const select = cell => $('board').events.click[0]({target:$('board').children[E.at(cell)]});
  select('D9'); assert($('melt').disabled); assert(!$('board').querySelector('.field-find'));
  select('B4'); assert(!$('melt').disabled); $('melt').click();
  const index = E.at('B4');
  assert.equal(s.state().thanks, 0);
  assert.equal(s.state().cleared.length, 1);
  assert.deepEqual(s.state().board[index], { find: true });
  assert.match($('board').children[index].querySelector('img').src, /finds\/sew-base\.webp$/);
  assert($('board').children[index].querySelector('.clear-effect'));
  assert.equal($('goal-progress').textContent, '0 / 4');
  const reload = session(s.storage), board = reload.doc.getElementById('board');
  assert.match(board.children[index].querySelector('img').src, /finds\/sew-base\.webp$/);
  board.events.click[0]({ target: board.children[index] });
  assert.equal(reload.state().board[index], null);
  assert.equal(reload.doc.getElementById('goal-progress').textContent, '1 / 4');
  const undo = reload.doc.getElementById('undo');
  undo.click(); assert.deepEqual(reload.state().board[index], { find: true });
  assert.equal(reload.state().thanks, 0);
});

test('Purple is the default; choosing green survives reload without touching game progress; all tech ranks have art', () => {
  const s = session(), $ = id => s.doc.getElementById(id);
  assert.equal(s.doc.body.attrs['data-theme'], 'purple');
  const before = s.state(); $('theme-green').click();
  assert.equal(s.doc.body.attrs['data-theme'], 'green'); assert.deepEqual(s.state(), before);
  const reload = session(s.storage); assert.equal(reload.doc.body.attrs['data-theme'], 'green'); assert.deepEqual(reload.state(), before);
  const catalog = $('catalog');
  assert.equal(catalog.querySelectorAll('.catalog-part').filter(row=>row.querySelector('img')).length, 8);
  assert.equal(catalog.querySelectorAll('.catalog-gift').filter(row=>row.querySelector('img')).length, 8);
});

test('High-level reward is visible in the letter and reply and can be claimed once', () => {
  const E=require('./engine.js'), g=new E.Game(undefined,()=>1000000,()=>.5), L=g.state.letters[0];
  L.storyId = null; L.want =[E.item('tech',8)]; L.packed=[false]; L.protected=true; g.state.giftStore=JSON.parse(JSON.stringify(L.want));
  const s=session(new Map([['pochta-workshops-v26',JSON.stringify(g.state)]])), $=id=>s.doc.getElementById(id);
  $('letters').children[0].querySelector('button').click(); assert.match($('recipe-story').textContent,/4 ♡/);
  $('recipe-send').click(); assert.equal(s.state().thanks,0); s.advance(20000); $('mail-list').querySelector('button').click(); assert.match($('reply-claim').textContent,/4 ♡/);
  $('reply-claim').click(); assert.equal(s.state().thanks,4); assert.equal(session(s.storage).state().thanks,4);
});

test('The app imports v12 pending rewards and leaves its original save untouched', () => {
  const E=require('./engine.js'), g=new E.Game(undefined,()=>1000000,()=>.5), L=g.state.letters[0];
  L.storyId = null; L.want =[E.item('tech',8)]; L.packed=[true]; assert(g.act({type:'send',orderId:L.id}).ok);
  const old=JSON.parse(JSON.stringify(g.state)); old.version=12; old.mail.forEach(m=>delete m.rewardThanks);
  const serialized=JSON.stringify(old), storage=new Map([['pochta-workshops-v12',serialized]]), upgraded=session(storage);
  assert.equal(upgraded.state().version,E.VERSION); assert.equal(upgraded.state().mail[0].rewardThanks,4); assert.equal(upgraded.state().energy,old.energy);
  assert.equal(storage.get('pochta-workshops-v12'),serialized);
});

test('Personal reply and one-time energy gift are visible, saved and do not overwrite the game', () => {
  const E=require('./engine.js');let now=1000000;const g=new E.Game(undefined,()=>now,()=>.5);
  for(let i=0;i<5;i++){const L=g.state.letters[0];L.packed=[true];assert(g.act({type:'send',orderId:L.id}).ok);now+=E.MAIL_MS;assert(g.act({type:'claim',mailId:g.state.mail.at(-1).id}).ok);}
  g.state.energy=39;g.state.energyAt=1000000;
  const s=session(new Map([['pochta-workshops-v26',JSON.stringify(g.state)]])), $=id=>s.doc.getElementById(id);
  const button=$('energy-gifts').children[0].querySelector('button');assert(!button.disabled);assert.match(button.textContent,/5 ❄/);button.click();
  assert.equal(s.state().energy,40);assert.deepEqual(s.state().energyGiftClaims,[5]);assert.equal(s.state().bag.find(t=>t.name==='Подарок снеговика').amount,4);
  assert($('energy-gifts').children[0].querySelector('button').disabled);assert.deepEqual(session(s.storage).state().energyGiftClaims,[5]);
  const personalSeed=new E.Game(undefined,()=>1000000,()=>.5); personalSeed.state.letters[0].protected=true;
  const first=session(new Map([['pochta-workshops-v26',JSON.stringify(personalSeed.state)]])), get=id=>first.doc.getElementById(id);get('letters').children[0].querySelector('button').click();assert.match(get('recipe-story').textContent,/тоннель/);
  get('recipe-items').querySelector('button').click();get('recipe-send').click();
  first.advance(20000);get('mail-list').querySelector('button').click();
  assert.equal(first.state().mail[0].outcome,'success');assert(get('reply-text').textContent.includes(E.PERSONAL_LETTERS[0].reply));
});

test('Desktop panels share a stable sidebar beside the workshop instead of individual grid rows', () => {
  const s=session(), $=id=>s.doc.getElementById(id), sidebar=s.doc.querySelector('.sidebar'), left=s.doc.querySelector('.workshop-column');
  assert(sidebar);assert(left);assert.equal(sidebar.parentElement,left.parentElement);assert(sidebar.parentElement.className.includes('game-layout'));
  for(const id of ['energy-gifts','extra-panel','bag-panel','completion','speed'])assert.equal($(id).closest('.sidebar'),sidebar);
  assert.equal($('goal-title').closest('.sidebar'),sidebar);assert.equal($('mail-list').closest('.sidebar'),sidebar);
  assert.equal($('board').closest('.workshop-column'),left);assert.equal($('shift-title').closest('.workshop-column'),left);
  assert(!$('recipe-dialog').closest('.sidebar'));
});

test('Marked letters expose gift choice and optional village packing in the actual UI', () => {
  let now = 1000000;
  const g = new E.Game(undefined, () => now, () => .5);
  const deliver = L => {
    L.packed = L.want.map(() => true);
    assert(g.act({ type: 'send', orderId: L.id }).ok);
    now += E.MAIL_MS;
    assert(g.act({ type: 'claim', mailId: g.state.mail.at(-1).id }).ok);
  };
  const easy = () => g.state.letters.find(L => L.difficulty === 'easy');
  for (let i = 0; i < 2; i++) deliver(easy());
  deliver(g.state.letters.find(L => L.difficulty === 'medium'));
  for (let i = 0; i < 6; i++) deliver(easy());
  deliver(g.state.letters.find(L => L.special === 'twins'));
  for (let i = 0; i < 8; i++) deliver(easy());
  const s = session(new Map([['pochta-workshops-v26', JSON.stringify(g.state)]]));
  const $ = id => s.doc.getElementById(id);
  const medium = $('letters').children.find(card => card.querySelector('.choice-mark'));
  assert.equal(medium.querySelector('.choice-mark').textContent, 'Подбери подарок');
  medium.querySelector('button').click();
  assert($('recipe-send').disabled);
  const options = $('recipe-items').querySelector('.choice-options');
  options.children[1].querySelector('button').click();
  assert.equal(s.state().letters.find(L => L.choice).want[0].level, 2);
  $('recipe-close').click();
  const special = $('letters').children.find(card => card.querySelector('.special-mark'));
  assert.equal(special.querySelector('.special-mark').textContent, 'Особая посылка');
  special.querySelector('button').click();
  assert.match($('recipe-title').textContent, /далёкую деревню/);
  $('recipe-items').querySelector('button').click();
  assert.equal(s.state().letters.find(L => L.special === 'village').want.length, 3);
});

test('Start over asks for confirmation and saves a fresh compact workshop', () => {
  const s = session(), $ = id => s.doc.getElementById(id);
  $('theme-green').click();
  $('generators').querySelector('button').click();
  const played = s.state();
  assert.equal(played.energy, 39);
  $('restart').click();
  assert($('restart-dialog').open);
  assert.deepEqual(s.state(), played);
  $('restart-cancel').click();
  assert(!$('restart-dialog').open);
  assert.deepEqual(s.state(), played);
  $('restart').click();
  $('restart-confirm').click();
  assert(!$('restart-dialog').open);
  const fresh = s.state();
  assert.equal(fresh.energy, 40);
  assert.deepEqual(fresh.board, E.makeBoard(0, true));
  assert.equal(fresh.moves, 0);
  const reopened = session(s.storage);
  assert.deepEqual(reopened.state(), fresh);
  assert.equal(reopened.doc.body.attrs['data-theme'], 'green');
});

test('The board prompts to confirm a reserved merge without sending the player below the table', () => {
  const s = session(), $ = id => s.doc.getElementById(id), board = $('board');
  const from = E.at('C3'), to = E.at('D3');
  const panel = $('merge-confirmation'), cell = i => board.querySelector('[data-cell="' + i + '"]');
  const select = i => board.events.click[0]({ target: cell(i) });
  const before = s.state().board;
  const prompt = () => { select(from); select(to); };
  prompt();
  assert(!panel.hidden);
  assert(cell(from).className.includes('merge-pending'));
  assert(cell(to).className.includes('merge-pending'));
  assert.deepEqual(s.state().board, before);
  assert.equal(s.doc.activeElement, $('cancel-merge'));
  $('cancel-merge').click();
  assert(panel.hidden);
  assert.deepEqual(s.state().board, before);
  prompt();
  $('confirm-merge').click();
  assert(panel.hidden);
  assert.equal(s.state().board[from], null);
  assert.deepEqual(s.state().board[to], E.item('tech', 2));
  $('confirm-merge').click();
  assert.deepEqual(s.state().board[to], E.item('tech', 2));
});

test('Sending the middle envelope moves the right one left and opens a new slot on the right', () => {
  const g = new E.Game(undefined, () => 1000000, () => .5);
  const before = E.visibleLetters(g.state).map(L => L.id);
  const middle = g.state.letters[1];
  middle.packed[0] = true;
  const s = session(new Map([['pochta-workshops-v26', JSON.stringify(g.state)]]));
  const $ = id => s.doc.getElementById(id);
  const envelopes = () => $('letters').children.map(card => Number(card.dataset.envelope));
  assert.deepEqual(envelopes(), before);
  $('letters').children[1].querySelector('button').click();
  $('recipe-send').click();
  const after = envelopes();
  assert.deepEqual(after.slice(0, 2), [before[0], before[2]]);
  assert(!before.includes(after[2]));
  assert.equal(s.state().mail.at(-1).order.id, middle.id);
  assert.deepEqual(E.visibleLetters(session(s.storage).state()).map(L => L.id), after);
});

test('An order can upgrade a stored toy and dismantle it back into the original inputs', () => {
  const g = new E.Game(undefined, () => 1000000, () => .5);
  const order = g.state.letters.find(L => L.difficulty === 'medium');
  order.storyId = null;
  order.want = [E.item('tech', 5)];
  g.state.giftStore.push(E.item('tech', 2));
  const module = g.state.board.indexOf(null);
  g.state.board[module] = E.item('tech', 5);
  const s = session(new Map([['pochta-workshops-v26', JSON.stringify(g.state)]]));
  const $ = id => s.doc.getElementById(id);
  $('letters').querySelector('[data-order="' + order.id + '"]').click();
  const upgrade = $('recipe-items').querySelector('.upgrade-action');
  assert(upgrade && !upgrade.disabled);
  upgrade.click();
  assert.equal(s.state().giftStore.length, 0);
  assert.equal(s.state().board[module], null);
  assert.equal(E.findOrder(s.state(), order.id).upgradePacked[0], 'remote-control');
  assert(!$('recipe-send').disabled);
  const restored = session(s.storage), doc = restored.doc;
  doc.getElementById('letters').querySelector('[data-order="' + order.id + '"]').click();
  doc.getElementById('recipe-items').querySelector('button').click();
  const unpacked = restored.state();
  assert(!E.findOrder(unpacked, order.id).packed[0]);
  assert(unpacked.board.some(x => E.isGift(x) && x.gift.level === 2));
  assert(unpacked.board.some(x => E.isItem(x) && x.chain === 'tech' && x.level === 5));
  assert(E.validate(unpacked));
});
