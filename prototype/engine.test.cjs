const { test } = require('node:test');
const assert = require('node:assert/strict');
const E = require('./engine.js');
const copy = x => JSON.parse(JSON.stringify(x));
function fixture(roll = .5) { let now = 1000000; const g = new E.Game(undefined, () => now, () => roll); return { g, advance(ms) { now += ms; g.regen(); } }; }
function act(f, a) { const r = f.g.act(a); assert(r.ok, JSON.stringify(a) + ': ' + r.text); assert(E.validate(f.g.state), 'Valid save after ' + a.type); return r; }
function obtain(f, chain, level, reserved = new Set()) {
  const b = f.g.state.board;
  const existing = b.findIndex((p, i) => E.isItem(p) && p.chain === chain && p.level === level && !reserved.has(i));
  if (existing >= 0) return existing;
  if (level === 1) { if (!f.g.state.energy) f.advance(E.REGEN_MS / f.g.state.speed); return act(f, { type: 'spawn', from: b.findIndex(x => x?.gen === chain) }).pop; }
  const a = obtain(f, chain, level - 1, reserved), c = obtain(f, chain, level - 1, new Set([...reserved, a]));
  act(f, { type: 'drop', from: a, to: c, force: true }); return c;
}
function pack(f, L) {
  if (L.choice && !L.chosen) act(f, { type: 'chooseGift', orderId: L.id, level: L.want[0].level });
  for (let n = 0; n < L.want.length; n++) if (!L.packed[n]) {
    const reserved = new Set(); for (const p of E.recipe(L.want[n])) reserved.add(obtain(f, p.chain, p.level, reserved));
    act(f, { type: 'craft', orderId: L.id, giftIndex: n });
  }
}
function fulfill(f, L = f.g.state.letters.find(L => L.difficulty === 'easy'), claim = true) {
  pack(f, L); act(f, { type: 'send', orderId: L.id }); const m = f.g.state.mail.at(-1);
  if (claim) { f.advance(E.MAIL_MS / f.g.state.speed); act(f, { type: 'claim', mailId: m.id }); }
  return m;
}
function earn(f, amount) {
  let guard = 0;
  while (f.g.state.thanks < amount) {
    assert(++guard < 100);
    const L = [...E.visibleLetters(f.g.state), ...f.g.state.extra].reduce((best, x) => {
      const cost = order => order.want.reduce((sum, g) => sum + E.recipe(g).reduce((n, p) => n + 2 ** (p.level - 1), 0), 0);
      return cost(x) < cost(best) ? x : best;
    }); fulfill(f, L);
  }
}
function pathTo(g, target) {
  const d = Array(63).fill(Infinity), prev = Array(63).fill(-1), used = new Set();
  g.state.board.forEach((x, i) => { if (i >= 7 && (x === null || E.isItem(x))) d[i] = 0; });
  for (let step = 0; step < 56; step++) {
    let u = -1;
    for (let i = 7; i < 63; i++) if (!used.has(i) && (u === -1 || d[i] < d[u])) u = i;
    if (u < 0 || !Number.isFinite(d[u])) break;
    used.add(u); if (u === target) break;
    for (const v of E.neighbors(u)) {
      const w = g.state.board[v]?.snow ? E.SNOW[g.state.board[v].snow].cost : 0;
      if (d[u] + w < d[v]) { d[v] = d[u] + w; prev[v] = u; }
    }
  }
  const path = []; let p = target;
  while (p >= 0 && g.state.board[p]?.snow) { path.unshift(p); p = prev[p]; }
  assert(p >= 7); return path;
}
function clearTo(f, cell) {
  for (const p of pathTo(f.g, cell)) { earn(f, E.SNOW[f.g.state.board[p].snow].cost); act(f, { type: 'melt', cell: p }); if (f.g.state.board[p]?.find) act(f, { type: 'pickup', cell: p }); }
}
function finish(f) { for (const p of E.parts(f.g.state)) if (!p.found) clearTo(f, p.cell); act(f, { type: 'build' }); }

test('Three sets of eight parts and gifts, exact advanced recipes, four required parts under snow', () => {
  assert.deepEqual(E.RECIPES[6], [7, 5, 1]); assert.deepEqual(E.RECIPES[7], [8, 6, 1, 2, 3]);
  assert.equal(E.RECIPES[7].reduce((n, p) => n + 2 ** (p - 1), 0), 167);
  Object.values(E.CHAINS).forEach(c => { assert.equal(c.names.length, 8); assert.equal(c.gifts.length, 8); });
  for (let s = 0; s < 3; s++) {
    const required = Object.entries(E.CACHES[s]).filter(([, x]) => x.required);
    assert.equal(required.length, 4); assert.equal(required.at(-1)[0], 'D9'); assert.equal(E.makeBoard(s)[E.at('D9')].snow, 3);
    assert(E.makeBoard(s).filter(x => x?.snow).length > 31);
    assert(Object.values(E.CACHES[s]).every(x => !E.isItem(x)));
  }
});
test('Exact recipes consume components, gifts live outside the board, and level 8 needs all five parts', () => {
  const f = fixture(), s = f.g.state, L = s.letters[0];
  assert(E.canCraft(s, L.id, 0)); const before = s.board.filter(E.isItem).length, energy = s.energy;
  act(f, { type: 'craft', orderId: L.id, giftIndex: 0 }); assert.equal(s.energy, energy); assert.equal(s.board.filter(E.isItem).length, before - 2); assert(L.packed[0]);
  assert(!f.g.act({ type: 'craft', orderId: L.id, giftIndex: 0 }).ok);
  assert(f.g.undo().ok); assert.equal(f.g.state.board.filter(E.isItem).length, before);
  const g = fixture(); const order = g.g.state.letters[0]; order.storyId = null; order.want = [{ chain: 'tech', level: 8 }]; order.packed = [false];
  g.g.state.compactStart = false;
  g.g.state.board = E.makeBoard(0).map(x => E.isItem(x) ? null : x);
  [8, 6, 1, 2].forEach((level, n) => { g.g.state.board[7 + n] = E.item('tech', level); });
  assert(!E.canCraft(g.g.state, order.id, 0)); g.g.state.board[11] = E.item('tech', 3); assert(E.canCraft(g.g.state, order.id, 0));
  act(g, { type: 'craft', orderId: order.id, giftIndex: 0 });
});
test('Success gives no immediate heart; delayed answer can be claimed exactly once, including after reload', () => {
  const f = fixture(); const m = fulfill(f, undefined, false); assert.equal(f.g.state.thanks, 0); assert.equal(m.outcome, 'success');
  assert(!f.g.act({ type: 'claim', mailId: m.id }).ok);
  const stored = copy(f.g.state); const reload = new E.Game(stored, f.g.now, () => .99); assert.equal(reload.state.mail[0].outcome, 'success');
  f.advance(E.MAIL_MS - 1); assert(!f.g.act({ type: 'claim', mailId: m.id }).ok); f.advance(1);
  act(f, { type: 'claim', mailId: m.id }); assert.equal(f.g.state.thanks, 1);
  assert(!f.g.act({ type: 'claim', mailId: m.id }).ok); assert.equal(f.g.state.thanks, 1);
  assert(f.g.undo().ok); assert.equal(f.g.state.thanks, 0); act(f, { type: 'claim', mailId: m.id }); assert.equal(f.g.state.thanks, 1);
});
test('First-send categorical probability is 70/20/10; boundaries and persisted outcomes are stable', () => {
  const counts = { success: 0, lost: 0, damaged: 0 };
  for (let i = 0; i < 100; i++) { const f = fixture((i + .5) / 100); const L = f.g.state.letters[0]; pack(f, L); act(f, { type: 'send', orderId: L.id }); counts[f.g.state.mail[0].outcome]++; }
  assert.deepEqual(counts, { success: 70, lost: 20, damaged: 10 });
  for (const [r, expected] of [[.7, 'lost'], [.9, 'damaged']]) { const f = fixture(r); assert.equal(fulfill(f, undefined, false).outcome, expected); }
  const f = fixture(.8); const m = fulfill(f, undefined, false); const saved = copy(f.g.state);
  const reload = new E.Game(saved, f.g.now, () => .01); assert.equal(reload.state.mail[0].outcome, 'lost'); assert.equal(m.outcome, 'lost');
});
test('Lost package becomes one real repeat order; retry always succeeds; damage has no heart', () => {
  const f = fixture(.8); const lost = fulfill(f); assert.equal(f.g.state.thanks, 0); assert.equal(f.g.state.extra.length, 1);
  const retry = f.g.state.extra[0]; assert.equal(retry.id, lost.order.id); assert(retry.retry); assert(retry.packed.every(x => !x));
  const success = fulfill(f, retry); assert.equal(success.attempt, 2); assert.equal(success.outcome, 'success'); assert.equal(f.g.state.thanks, 1); assert.equal(f.g.state.extra.length, 0);
  assert(!f.g.act({ type: 'claim', mailId: lost.id }).ok);
  const damaged = fixture(.95); fulfill(damaged); assert.equal(damaged.g.state.thanks, 0); assert.equal(damaged.g.state.extra.length, 0);
});
test('Adjacent clearance, no diagonal shortcuts, no merge melting and no empty-space energy waste', () => {
  const f = fixture(); earn(f, 5);
  const balance = f.g.state.thanks; assert(!f.g.act({ type: 'melt', cell: E.at('D9') }).ok); assert.equal(f.g.state.thanks, balance);
  assert(!E.accessible(f.g.state, E.at('B5'))); assert(E.accessible(f.g.state, E.at('B4')));
  const snow = copy(f.g.state.board[E.at('D5')]);
  const a = obtain(f, 'tech', 1), b = obtain(f, 'tech', 1, new Set([a]));
  if (b !== E.at('D4')) act(f, { type: 'drop', from: b, to: E.at('D4') });
  act(f, { type: 'drop', from: a, to: E.at('D4'), force: true }); assert.deepEqual(f.g.state.board[E.at('D5')], snow);
  act(f, { type: 'melt', cell: E.at('B4') }); assert(E.accessible(f.g.state, E.at('B5'))); assert.equal(f.g.state.thanks, balance - 1);
});
test('All three workshop goals are reachable by real gameplay; four parts then explicit build; carry mail and packed gifts', () => {
  const f = fixture();
  for (let shift = 0; shift < 3; shift++) {
    assert(!f.g.act({ type: 'build' }).ok); assert(!f.g.act({ type: 'next' }).ok);
    finish(f); assert(E.complete(f.g.state)); assert(f.g.state.built.includes(shift));
    const saved = copy(f.g.state), reload = new E.Game(saved, f.g.now); assert.deepEqual(reload.state, saved);
    if (shift < 2) {
      const L = f.g.state.letters.find(L => L.difficulty === 'easy'); pack(f, L);
      const letters = copy(f.g.state.letters), energy = f.g.state.energy, thanks = f.g.state.thanks;
      act(f, { type: 'next' }); assert.deepEqual(f.g.state.letters, letters); assert.equal(f.g.state.energy, energy); assert.equal(f.g.state.thanks, thanks); assert.equal(f.g.history.length, 0);
      assert.deepEqual(f.g.state.board, E.makeBoard(shift + 1));
    }
  }
  assert.equal(E.rates(f.g.state).damaged, .05); assert.equal(E.rates(f.g.state).lost, .2);
  const count = f.g.state.mail.length; fulfill(f); assert.equal(f.g.state.mail.length, count + 1);
});
test('Finds include conserved energy, scissors, decorations, story postcards and side letters', () => {
  const f = fixture(); clearTo(f, E.at('A4'));
  let bag = f.g.state.bag.find(t => t.kind === 'energy'); assert(bag);
  const old = bag.amount, room = E.MAX_ENERGY - f.g.state.energy;
  if (room) { act(f, { type: 'energy', toolId: bag.id }); const remaining = f.g.state.bag.find(t => t.id === bag.id)?.amount || 0; assert.equal(remaining, old - Math.min(old, room)); }
  clearTo(f, E.at('C5')); const scissors = f.g.state.bag.find(t => t.kind === 'scissors'); assert(scissors);
  const target = obtain(f, 'tech', 3); const material = () => f.g.state.board.filter(E.isItem).reduce((n, p) => n + 2 ** (p.level - 1), 0);
  const before = material(); act(f, { type: 'split', toolId: scissors.id, cell: target }); assert.equal(material(), before);
  assert(!f.g.act({ type: 'split', toolId: scissors.id, cell: target }).ok);
  clearTo(f, E.at('A5')); assert.equal(f.g.state.decor.length, 1);
  clearTo(f, E.at('A6')); assert(f.g.state.extra.some(L => L.side));
  clearTo(f, E.at('B7')); assert(f.g.state.postcards.some(x => x.name === 'Открытка снеговика'));
});
test('Protective tag consumes once, guarantees first send and cannot be used on a guaranteed retry', () => {
  const f = fixture(); clearTo(f, E.at('F7')); const L = f.g.state.letters[0], before = f.g.state.bag.filter(x => x.kind === 'tag').length;
  act(f, { type: 'protect', orderId: L.id }); assert.equal(f.g.state.bag.filter(x => x.kind === 'tag').length, before - 1);
  assert(!f.g.act({ type: 'protect', orderId: L.id }).ok); f.g.random = () => .99;
  assert.equal(fulfill(f, L).outcome, 'success');
});
test('Generator upgrades are per chain; 80% level 1 and 20% boosted levels, no energy cost on full board', () => {
  const f = fixture();
  for (const [giftLevel, partLevel] of [[5, 2], [6, 3], [7, 4], [8, 5]]) {
    f.g.state.unlocked.tech = giftLevel;
    f.g.random = () => .1; const a = act(f, { type: 'spawn', from: E.at('D1') }); assert.equal(f.g.state.board[a.pop].level, partLevel); act(f, { type: 'return', from: a.pop });
    f.g.random = () => .5; const b = act(f, { type: 'spawn', from: E.at('D1') }); assert.equal(f.g.state.board[b.pop].level, 1); act(f, { type: 'return', from: b.pop });
    assert.equal(f.g.state.unlocked.sew, 1);
  }
  while (f.g.state.board.includes(null)) { if (!f.g.state.energy) f.advance(E.REGEN_MS); act(f, { type: 'spawn', from: E.at('D1') }); }
  const e = f.g.state.energy; assert(!f.g.act({ type: 'spawn', from: E.at('D1') }).ok); assert.equal(f.g.state.energy, e);
});
test('Offline energy, mail timing and speed switch preserve remaining fractional time', () => {
  const f = fixture(); const m = fulfill(f, undefined, false);
  act(f, { type: 'spawn', from: E.at('D1') }); f.advance(10000); act(f, { type: 'speed' });
  assert.equal(f.g.state.speed, 10); assert.equal(m.dueAt - f.g.now(), 1000);
  f.advance(999); assert(!f.g.act({ type: 'claim', mailId: m.id }).ok); f.advance(1); act(f, { type: 'claim', mailId: m.id });
  const saved = copy(f.g.state); f.advance(100000); const reloaded = new E.Game(saved, f.g.now); assert.equal(reloaded.state.energy, 40);
});
test('Bad saves and old versions are rejected; duplicate claimed rewards or duplicate clear records do not validate', () => {
  const f = fixture(); assert(E.validate(f.g.state));
  for (const value of [null, {}, { ...copy(f.g.state), version: 7 }, { ...copy(f.g.state), thanks: 1 }, { ...copy(f.g.state), energy: 41 }, { ...copy(f.g.state), bag: [null] }]) assert(!E.validate(value));
  fulfill(f); const saved = copy(f.g.state); saved.mail.push(copy(saved.mail[0])); assert(!E.validate(saved));
  clearTo(f, E.at('B4')); const bad = copy(f.g.state); bad.cleared.push(copy(bad.cleared[0])); assert(!E.validate(bad));
});

test('All 24 gift recipes assemble on the board, same parts still merge, gifts do not merge', () => {
  for (const chain of Object.keys(E.CHAINS)) for (let level = 1; level <= 8; level++) {
    const recipe = E.recipe({ chain, level });
    let cell = recipe[0];
    for (const part of recipe.slice(1)) { cell = E.combine(cell, part); assert(cell); }
    assert(E.isGift(cell)); assert.equal(cell.gift.chain, chain); assert.equal(cell.gift.level, level);
    assert.equal(E.combine(cell, cell), null);
  }
  assert.equal(E.combine(E.item('tech', 2), E.item('tech', 2)), null);
  const f = fixture(); act(f, { type: 'drop', from: E.at('C3'), to: E.at('D3'), force: true }); assert.equal(f.g.state.board[E.at('D3')].level, 2);
});
test('Board-crafted gifts send once, accept duplicate quantities, and undo restores the gift', () => {
  const f = fixture(), L = f.g.state.letters[0];
  act(f, { type: 'drop', from: E.at('C4'), to: E.at('C3') }); assert(E.isGift(f.g.state.board[E.at('C3')])); assert(E.canSend(f.g.state, L.id));
  act(f, { type: 'send', orderId: L.id }); assert.equal(f.g.state.board[E.at('C3')], null);
  assert(f.g.undo().ok); assert(E.isGift(f.g.state.board[E.at('C3')])); assert.equal(f.g.state.mail.length, 0);
  const restored = E.findOrder(f.g.state, L.id); restored.storyId = null; restored.want.push(copy(restored.want[0])); restored.packed.push(false);
  assert(!E.canSend(f.g.state, restored.id));
  const a = obtain(f, 'tech', 2), b = obtain(f, 'tech', 1, new Set([a])); act(f, { type: 'drop', from: a, to: b }); assert(E.canSend(f.g.state, restored.id));
  act(f, { type: 'send', orderId: restored.id }); assert.equal(f.g.state.board.filter(E.isGift).length, 0);
});
test('Long assembly survives reload and returns all components; no space means no loss', () => {
  const f = fixture(); const s = f.g.state;
  s.compactStart = false; s.board = E.makeBoard(0).map(x => E.isItem(x) ? null : x);
  s.board[7] = E.item('tech', 7); s.board[8] = E.item('tech', 5); s.board[9] = E.item('tech', 1);
  act(f, { type: 'drop', from: 7, to: 8 }); assert(E.isAssembly(s.board[8])); assert.equal(s.board[8].assembly.parts.length, 2);
  const reload = new E.Game(copy(s), f.g.now); assert(E.isAssembly(reload.state.board[8]));
  act(f, { type: 'disassemble', cell: 8 }); assert.equal(s.board.filter(E.isItem).reduce((n, p) => n + 2 ** (p.level - 1), 0), 81);
  const high = s.board.findIndex(x => E.isItem(x) && x.level === 7), middle = s.board.findIndex(x => E.isItem(x) && x.level === 5);
  act(f, { type: 'drop', from: high, to: middle }); const low = s.board.findIndex(x => E.isItem(x) && x.level === 1);
  act(f, { type: 'drop', from: low, to: middle }); assert.equal(s.board[middle].gift.level, 7);
  assert(f.g.undo().ok); assert(E.isAssembly(f.g.state.board[middle]));
  f.g.state.board.forEach((x, i) => { if (x === null) f.g.state.board[i] = E.item('tech', 1); });
  const before = copy(f.g.state); assert(!f.g.act({ type: 'disassemble', cell: middle }).ok); assert.deepEqual(f.g.state, before);
});
test('Finished gifts carry to next workshop in storage and count toward sending', () => {
  const f = fixture(); finish(f);
  const gift = E.combine(E.item('tech', 2), E.item('tech', 1)), free = f.g.state.board.indexOf(null); f.g.state.board[free] = gift;
  const original = f.g.state.letters.find(L => L.difficulty === 'easy'); original.storyId = null; original.want = [E.item('tech', 1)]; original.packed = [false];
  act(f, { type: 'next' }); assert.equal(f.g.state.giftStore.length, 1); assert(E.canSend(f.g.state, original.id));
  act(f, { type: 'send', orderId: original.id }); assert.equal(f.g.state.giftStore.length, 0);
});

test('Finished gifts return the exact recipe for every rank; packing and storage can be dismantled too', () => {
  for (let level = 1; level <= 8; level++) {
    const f = fixture(), s = f.g.state;
    s.compactStart = false; s.board = E.makeBoard(0).map(x => E.isItem(x) ? null : x);
    s.board[7] = { gift: E.item('tech', level) };
    act(f, { type: 'return', from: 7 });
    assert.deepEqual(s.board.filter(E.isItem).map(x => x.level).sort(), [...E.RECIPES[level - 1]].sort());
    assert(f.g.undo().ok); assert.equal(f.g.state.board[7].gift.level, level);
  }
  const f = fixture(), L = f.g.state.letters[0]; pack(f, L);
  act(f, { type: 'disassemble', orderId: L.id, giftIndex: 0 }); assert.equal(L.packed[0], false); assert(E.canCraft(f.g.state, L.id, 0));
  f.g.state.giftStore.push(E.item('tech', 2)); act(f, { type: 'disassemble', storeIndex: 0 }); assert.equal(f.g.state.giftStore.length, 0);
  f.g.state.board[7] = { gift: E.item('tech', 8) };
  f.g.state.board.forEach((x,i) => { if (x === null) f.g.state.board[i] = E.item('tech', 1); });
  const before = copy(f.g.state); assert(!f.g.act({ type: 'disassemble', cell: 7 }).ok); assert.deepEqual(f.g.state, before);
});

test('Reply snowflake is persisted at send, delivered once, conserved at cap, and uses a 20 percent boundary', () => {
  for (const [roll, bonus] of [[.199999, 1], [.2, 0], [.5, 0]]) {
    const f = fixture(roll), L = f.g.state.letters[0]; pack(f, L);
    act(f, { type: 'send', orderId: L.id }); const m = f.g.state.mail.at(-1); assert.equal(m.bonusEnergy, bonus);
    assert.equal(new E.Game(copy(f.g.state), f.g.now).state.mail.at(-1).bonusEnergy, bonus);
    f.advance(E.MAIL_MS); f.g.state.energy = E.MAX_ENERGY;
    act(f, { type: 'claim', mailId: m.id }); assert.equal(f.g.state.energy, 40);
    assert.equal(f.g.state.bag.filter(t => t.name === 'Снежинка из письма').length, bonus);
    assert(!f.g.act({ type: 'claim', mailId: m.id }).ok);
  }
  const f = fixture(.1); const m = fulfill(f, undefined, false); f.advance(E.MAIL_MS); act(f, { type: 'spawn', from: E.at('D1') }); const before = f.g.state.energy;
  act(f, { type: 'claim', mailId: m.id }); assert.equal(f.g.state.energy, before + 1);
});

test('v9 progress migrates with the increased energy allowance only once and old replies get no rerolled reward', () => {
  const f = fixture(); fulfill(f); const old = copy(f.g.state); old.version = 9; old.energy = 5; old.mail.forEach(m => delete m.bonusEnergy);
  const migrated = E.migrate(old); assert.equal(migrated.energy, 25); assert.equal(migrated.mail[0].bonusEnergy, 0);
  assert.deepEqual(E.migrate(migrated), migrated); assert.equal(old.energy, 5);
  assert.equal(E.migrate({version:9}), null);
});

test('Existing v10 save gains ten energy once and keeps pending reply bonuses intact', () => {
  const f = fixture(.1); fulfill(f, undefined, false);
  const old = copy(f.g.state); old.version = 10; old.energy = 7;
  const converted = E.migrate(old); assert.equal(converted.energy, 17); assert.equal(converted.mail[0].bonusEnergy, 1);
  assert.deepEqual(E.migrate(converted), converted); assert.equal(old.energy, 7);
});

test('Reward per gift rank is paid only by a successful reply and summed for two gifts', () => {
  for (let level=1; level<=8; level++) {
    const f=fixture(), L=f.g.state.letters[0], expected=Math.max(1,level-4);
    L.storyId = null; L.want =[E.item('tech',level)]; L.packed=[false]; f.g.state.giftStore=[E.item('tech',level)];
    act(f,{type:'send',orderId:L.id}); const m=f.g.state.mail.at(-1);
    assert.equal(m.rewardThanks,expected); assert.equal(f.g.state.thanks,0);
    const reload=new E.Game(copy(f.g.state),f.g.now); assert.equal(reload.state.mail.at(-1).rewardThanks,expected);
    f.advance(E.MAIL_MS); act(f,{type:'claim',mailId:m.id}); assert.equal(f.g.state.thanks,expected);
    assert(!f.g.act({type:'claim',mailId:m.id}).ok);
  }
  const f=fixture(), L=f.g.state.letters[0]; L.storyId = null; L.want =[E.item('tech',6),E.item('tech',8)]; L.packed=[false,false]; f.g.state.giftStore=copy(L.want);
  act(f,{type:'send',orderId:L.id}); const m=f.g.state.mail.at(-1); f.advance(E.MAIL_MS); act(f,{type:'claim',mailId:m.id}); assert.equal(f.g.state.thanks,6);
});

test('A lost high-level gift pays its full reward once after retry; damage still pays nothing', () => {
  const f=fixture(.8), L=f.g.state.letters[0]; L.storyId = null; L.want =[E.item('tech',8)]; L.packed=[false]; f.g.state.giftStore=copy(L.want);
  act(f,{type:'send',orderId:L.id}); const lost=f.g.state.mail.at(-1); f.advance(E.MAIL_MS); act(f,{type:'claim',mailId:lost.id}); assert.equal(f.g.state.thanks,0);
  const retry=f.g.state.extra[0]; f.g.state.giftStore=copy(retry.want); act(f,{type:'send',orderId:retry.id}); const success=f.g.state.mail.at(-1); f.advance(E.MAIL_MS); act(f,{type:'claim',mailId:success.id}); assert.equal(f.g.state.thanks,4);
  const d=fixture(.95), order=d.g.state.letters[0]; order.storyId = null; order.want =[E.item('tech',8)]; order.packed=[false]; d.g.state.giftStore=copy(order.want); act(d,{type:'send',orderId:order.id}); d.advance(E.MAIL_MS); act(d,{type:'claim',mailId:d.g.state.mail.at(-1).id}); assert.equal(d.g.state.thanks,0);
});

test('Late requests still include simple gifts and permanently upgraded generators stay upgraded', () => {
  const f=fixture();
  for(let n=0;n<80;n++) { const L=f.g.state.letters[n % 3]; L.packed=L.want.map(()=>true); act(f,{type:'send',orderId:L.id}); assert.deepEqual(f.g.state.letters.map(L=>L.difficulty).sort(), ['easy','hard','medium']); assert(f.g.state.letters.find(L=>L.difficulty==='easy').want[0].level<=2); }
  assert.equal(f.g.state.letters.find(L=>L.difficulty==='hard').want[0].level,8); assert.equal(f.g.state.unlocked.tech,8);
});

test('Migrating v12 keeps already earned rewards and upgrades pending answers without extra energy', () => {
  const f=fixture(), L=f.g.state.letters[0]; L.storyId = null; L.want =[E.item('tech',8)]; L.packed=[true]; act(f,{type:'send',orderId:L.id});
  const pending=copy(f.g.state); pending.version=12; pending.mail.forEach(m=>delete m.rewardThanks);
  const upgraded=E.migrate(pending); assert.equal(upgraded.energy,pending.energy); assert.equal(upgraded.mail[0].rewardThanks,4); assert.equal(upgraded.thanks,0); assert(E.validate(upgraded));
  const claimed=copy(pending); claimed.mail[0].claimed=true; claimed.thanks=1;
  const migrated=E.migrate(claimed); assert.equal(migrated.mail[0].rewardThanks,1); assert.equal(migrated.thanks,1); assert.deepEqual(E.migrate(migrated),migrated);
  const broken=copy(pending); delete broken.mail[0].order; assert.equal(E.migrate(broken),null);
});

test('Energy gifts unlock at five and ten successful stories, claim once and preserve overflow', () => {
  const f=fixture(); assert(!f.g.act({type:'energyGift',threshold:5}).ok);
  for(let i=0;i<5;i++)fulfill(f);
  assert.equal(E.completedLetters(f.g.state),5); f.g.state.energy=39;
  act(f,{type:'energyGift',threshold:5}); assert.equal(f.g.state.energy,40);
  assert.equal(f.g.state.bag.find(t=>t.name==='Подарок снеговика').amount,4);
  assert(!f.g.act({type:'energyGift',threshold:5}).ok); assert(!f.g.act({type:'energyGift',threshold:10}).ok);
  const reload=new E.Game(copy(f.g.state),f.g.now); assert.deepEqual(reload.state.energyGiftClaims,[5]);
  for(let i=0;i<5;i++)fulfill(f);
  f.g.state.energy=0; f.g.state.energyAt=f.g.now(); act(f,{type:'energyGift',threshold:10}); assert.equal(f.g.state.energy,10);
  assert.deepEqual(f.g.state.energyGiftClaims,[5,10]); assert(!f.g.act({type:'energyGift',threshold:10}).ok);
  assert(f.g.undo().ok); assert.equal(f.g.state.energy,0); assert.deepEqual(f.g.state.energyGiftClaims,[5]);
});

test('Lost and damaged packages do not advance successful-letter gifts; retry counts one', () => {
  const f=fixture(.8);fulfill(f);assert.equal(E.completedLetters(f.g.state),0);
  const retry=f.g.state.extra[0];fulfill(f,retry);assert.equal(E.completedLetters(f.g.state),1);
  f.g.random=()=>.95;fulfill(f);assert.equal(E.completedLetters(f.g.state),1);
  f.g.random=()=>.5;for(let i=0;i<4;i++)fulfill(f);
  assert.equal(E.completedLetters(f.g.state),5);act(f,{type:'energyGift',threshold:5});
});

test('All thirty personal letters match their gift and keep the same story through a lost delivery', () => {
  assert.equal(E.PERSONAL_LETTERS.length,30);assert.equal(new Set(E.PERSONAL_LETTERS.map(p=>p.id)).size,30);
  for(const p of E.PERSONAL_LETTERS){assert(E.isItem(p));assert(p.request.length>40);assert(p.reply.length>40);}
  const f=fixture(.8), L=copy(f.g.state.letters[0]); assert.equal(L.storyId,'young-01');
  fulfill(f); const retry=f.g.state.extra[0]; assert.equal(retry.storyId,L.storyId);assert.equal(retry.replyText,L.replyText);assert.equal(retry.text,L.text);
  const success=fulfill(f,retry);assert.equal(success.order.replyText,L.replyText);assert.equal(E.completedLetters(f.g.state),1);
});

test('v20 requests and their packed gifts survive as additional letters beside three new roles', () => {
  const f=fixture();pack(f,f.g.state.letters[0]);const old=copy(f.g.state);old.version=20;delete old.energyGiftClaims;
  for(const L of [...old.letters,...old.extra]){delete L.difficulty;delete L.storyId;delete L.replyText;}
  const before=copy(old), upgraded=E.migrate(old);assert(upgraded);assert.deepEqual(old,before);
  assert.deepEqual(upgraded.letters.map(L=>L.difficulty),['easy','medium','hard']);assert.equal(upgraded.energy,old.energy);assert.deepEqual(upgraded.board,old.board);
  for(const L of old.letters){const kept=E.findOrder(upgraded,L.id);assert(kept);assert.deepEqual(kept.want,L.want);assert.deepEqual(kept.packed,L.packed);assert.equal(kept.text,L.text);}
  assert(E.canSend(upgraded,old.letters[0].id));assert.deepEqual(upgraded.energyGiftClaims,[]);assert.deepEqual(E.migrate(upgraded),upgraded);
});

test('Approved age library covers every gift and keeps ten pairs in each age group', () => {
  const draft=require('../docs/content/personal-letters-by-age.json');assert.equal(draft.status,'approved-active');assert.deepEqual(E.PERSONAL_LETTERS,draft.letters);
  assert.equal(new Set(E.PERSONAL_LETTERS.map(p=>p.chain+':'+p.level)).size,24);
  for(const group of ['5–6','7–9','10–12']){
    const rows=E.PERSONAL_LETTERS.filter(p=>p.ageGroup===group);assert.equal(rows.length,10);
    const [ageMin,ageMax]=group.split('–').map(Number), [levelMin,levelMax]=draft.rules[group];
    for(const p of rows){assert(p.age>=ageMin&&p.age<=ageMax);assert(p.level>=levelMin&&p.level<=levelMax);assert(p.who.includes(String(p.age)));}
  }
});

test('Original ten stories still load and keep their old text after the age-library update', () => {
  const f=fixture(), L=f.g.state.letters[0], old=E.LEGACY_PERSONAL_LETTERS[0];
  Object.assign(L,{who:old.who,text:old.request,replyText:old.reply,storyId:old.id});delete L.age;delete L.ageGroup;
  const saved=copy(f.g.state), reload=new E.Game(saved,f.g.now);assert.deepEqual(reload.state,saved);
  const m=fulfill(f,L);assert.equal(m.order.replyText,old.reply);assert.equal(m.order.storyId,old.id);
});

test('New orders follow gift ages and never duplicate an active personal story', () => {
  const f=fixture(), seen=[];
  for(let n=0;n<90;n++){
    const L=f.g.state.letters.filter(L=>!L.special)[n%3];
    const level=Math.max(...L.want.map(g=>g.level));assert(level<=2?L.age>=5&&L.age<=6:level<=5?L.age>=7&&L.age<=9:L.age>=10&&L.age<=12);
    if(L.storyId)seen.push(L.storyId);
    if (L.choice && !L.chosen) act(f,{type:'chooseGift',orderId:L.id,level:L.want[0].level});
    L.packed=L.want.map(()=>true);act(f,{type:'send',orderId:L.id});
    const active=[...E.orderList(f.g.state),...f.g.state.mail.filter(m=>!m.claimed).map(m=>m.order)].map(L=>L.storyId).filter(Boolean);
    assert.equal(new Set(active).size,active.length);
    f.advance(E.MAIL_MS);act(f,{type:'claim',mailId:f.g.state.mail.at(-1).id});
  }
  assert(new Set(seen).size<seen.length,'Stories can be reused after an interval');
});

test('Compact workshop keeps a playable first turn and old saves keep their open cells', () => {
  const f = fixture(), s = f.g.state;
  assert.equal(E.makeBoard(0).filter(x => x === null).length - s.board.filter(x => x === null).length, 3);
  fulfill(f);
  assert.equal(s.thanks, 1);
  act(f, { type: 'melt', cell: E.at('A2') });
  const old = E.fresh(1000000);
  old.version = 21;
  delete old.compactStart;
  old.board = E.makeBoard(0);
  const updated = E.migrate(old);
  assert.equal(updated.version, E.VERSION);
  assert.deepEqual(updated.board, old.board);
  assert.deepEqual(updated.letters, old.letters);
});

test('The rare plate is found once and survives dismantling both kinds of crafting', () => {
  const f = fixture(), s = f.g.state;
  const cell = E.at('C6');
  clearTo(f, cell);
  assert.deepEqual(s.board[cell], E.RARE_PART);
  assert(!f.g.act({ type: 'return', from: cell }).ok);
  assert(!f.g.act({ type: 'melt', cell }).ok);
  const order = s.letters[2];
  order.storyId = null;
  order.want = [E.item('tech', 6)];
  const spare = s.board.indexOf(null);
  s.board[spare] = E.item('tech', 6);
  assert(!E.canCraft(s, order.id, 0));
  assert(E.canCraft(s, order.id, 0, true));
  act(f, { type: 'craft', orderId: order.id, giftIndex: 0, useRare: true });
  assert(s.board.every(x => !E.isRarePart(x)));
  const reload = new E.Game(copy(s), f.g.now);
  assert.deepEqual(reload.state.letters[2].rarePacked, [0]);
  act(f, { type: 'disassemble', orderId: order.id, giftIndex: 0 });
  const part = s.board.findIndex(E.isRarePart);
  const other = s.board.findIndex(x => E.isItem(x) && x.level === 6);
  act(f, { type: 'drop', from: part, to: other });
  assert(s.board[other].gift.rare);
  act(f, { type: 'disassemble', cell: other });
  assert.equal(s.board.filter(E.isRarePart).length, 1);
});

test('Choice letters use approved age bands, appear once, and keep the selected gift on retry', () => {
  const f = fixture(), s = f.g.state;
  fulfill(f); fulfill(f);
  const medium = () => s.letters.find(L => L.difficulty === 'medium');
  fulfill(f, medium());
  const first = medium();
  assert.equal(first.choice, 'garage');
  assert(!E.canSend(s, first.id));
  assert(!f.g.act({ type: 'chooseGift', orderId: first.id, level: 3 }).ok);
  act(f, { type: 'chooseGift', orderId: first.id, level: 2 });
  f.g.random = () => .8;
  fulfill(f, first);
  assert.equal(s.extra.at(-1).want[0].level, 2);
  assert(!f.g.act({ type: 'chooseGift', orderId: first.id, level: 1 }).ok);
  f.g.random = () => .5;
  fulfill(f, s.extra.at(-1));
  for (let n = 0; n < 3; n++) fulfill(f, s.letters.find(L => L.difficulty === 'hard'));
  assert(s.unlocked.tech >= 4);
  fulfill(f, medium());
  const second = medium();
  assert.equal(second.choice, 'mission');
  act(f, { type: 'chooseGift', orderId: second.id, level: 4 });
  fulfill(f, second);
  assert(!medium().choice);
});

test('Special deliveries are one-offs, count twin gifts separately and reward the optional third gift', () => {
  const f = fixture(), s = f.g.state;
  for (let n = 0; n < 8; n++) fulfill(f);
  const twins = s.letters.find(L => L.special === 'twins');
  assert(!E.visibleLetters(s).includes(twins));
  const old = copy(s);
  old.version = 23;
  const oldTwins = old.letters.pop();
  oldTwins.packed[0] = true;
  old.extra.push(oldTwins);
  const restored = E.migrate(old);
  assert.deepEqual(restored.letters.at(-1), oldTwins);
  assert(!restored.extra.some(L => L.special));
  fulfill(f);
  assert.equal(E.visibleLetters(s).at(-1), twins);
  const firstCell = s.board.indexOf(null);
  s.board[firstCell] = { gift: E.item('tech', 1) };
  assert(!E.canSend(s, twins.id));
  act(f, { type: 'packGift', orderId: twins.id, giftIndex: 0 });
  assert.equal(s.board[firstCell], null);
  assert(!E.canSend(s, twins.id));
  fulfill(f, twins);
  for (let n = 0; n < 8; n++) fulfill(f);
  const village = s.letters.find(L => L.special === 'village');
  assert(E.visibleLetters(s).includes(village));
  pack(f, village);
  assert(E.canSend(s, village.id));
  assert.equal(E.orderThanks(village), 2);
  act(f, { type: 'villageExtra', orderId: village.id });
  assert(!E.canSend(s, village.id));
  assert.equal(E.orderThanks(village), 4);
  const mailed = fulfill(f, village);
  assert.equal(mailed.rewardThanks, 4);
  for (let n = 0; n < 8; n++) fulfill(f);
  assert(!s.letters.some(L => L.special));
});

test('Revealed tools reserve the cell until picked up and cannot be collected twice', () => {
  const f = fixture(), s = f.g.state, cell = E.at('G4');
  earn(f, 1);
  act(f, { type: 'melt', cell });
  assert.deepEqual(s.board[cell], { find: true });
  assert.equal(s.bag.length, 0);
  const from = s.board.findIndex(E.isItem);
  assert(!f.g.act({ type: 'drop', from, to: cell }).ok);
  assert.deepEqual(new E.Game(copy(s), f.g.now).state.board[cell], { find: true });
  act(f, { type: 'pickup', cell });
  assert.equal(s.board[cell], null);
  assert.equal(s.bag.filter(x => x.kind === 'energy' && x.amount === 8).length, 1);
  assert(!f.g.act({ type: 'pickup', cell }).ok);
});

test('A toy upgrade uses its declared donor and module and returns both after reload', () => {
  const f = fixture(), s = f.g.state;
  const [donor, module] = s.board.flatMap((x, i) => x === null ? [i] : []);
  s.board[donor] = { gift: E.item('tech', 2) };
  s.board[module] = E.item('tech', 5);
  const before = copy(s.board);
  const warning = f.g.act({ type: 'drop', from: donor, to: module });
  assert(warning.warning);
  assert.match(warning.confirmText, /улучшить/);
  assert.deepEqual(s.board, before);
  assert.equal(E.combine(s.board[donor], E.item('sew', 5)), null);
  assert.equal(E.combine(s.board[donor], E.item('tech', 4)), null);
  act(f, { type: 'drop', from: donor, to: module, force: true });
  assert.equal(s.board[donor], null);
  assert.deepEqual(s.board[module], { gift: { ...E.item('tech', 5), upgrade: 'remote-control' } });
  const g = new E.Game(copy(s), f.g.now);
  assert.deepEqual(g.state.board[module], s.board[module]);
  assert(g.act({ type: 'disassemble', cell: module }).ok);
  assert(E.validate(g.state));
  assert.deepEqual(g.state.board[module], { gift: E.item('tech', 2) });
  assert(g.state.board.some(x => E.isItem(x) && x.chain === 'tech' && x.level === 5));
  assert(!g.state.board.some(x => E.isItem(x) && x.chain === 'tech' && x.level === 5 && x.upgrade));
});

test('A multi-part upgrade confirms its exact inputs and preserves the previous build when dismantled', () => {
  const f = fixture(), s = f.g.state;
  const [source, radio, drive] = s.board.flatMap((x, i) => x === null ? [i] : []);
  const remote = E.combine({ gift: E.item('tech', 2) }, E.item('tech', 5));
  s.board[source] = copy(remote);
  s.board[radio] = E.item('tech', 5);
  const incomplete = copy(s.board);
  assert(!f.g.act({ type: 'drop', from: source, to: radio }).ok);
  assert.deepEqual(s.board, incomplete);
  s.board[drive] = E.item('tech', 3);
  const warning = f.g.act({ type: 'drop', from: source, to: radio });
  assert(warning.warning);
  act(f, { type: 'drop', from: source, to: radio, force: true });
  assert.equal(s.board[drive], null);
  assert.equal(s.board[radio].gift.level, 6);
  const restored = new E.Game(copy(s), f.g.now);
  assert.deepEqual(restored.state.board[radio].gift.donorBuilt, remote.gift);
  assert(restored.act({ type: 'disassemble', cell: radio }).ok);
  assert(E.validate(restored.state));
  assert.deepEqual(restored.state.board[radio], remote);
});

test('A feature request accepts only its variant, while ordinary requests prefer the plain toy', () => {
  const f = fixture(), s = f.g.state;
  finish(f);
  act(f, { type: 'next' });
  const [source, module] = s.board.flatMap((x, i) => x === null ? [i] : []);
  const rule = E.GIFT_UPGRADES.find(x => x.id === 'moving-ears');
  const order = s.letters.find(L => L.difficulty === 'hard');
  order.storyId = null;
  order.want = [copy(rule.result)];
  s.giftStore.push(E.item('sew', 3));
  assert(!E.canSend(s, order.id));
  assert(!E.canCraft(s, order.id, 0));
  s.board[source] = { gift: E.item('sew', 3) };
  s.board[module] = E.item('tech', 3);
  act(f, { type: 'drop', from: module, to: source });
  const variant = s.board[source].gift;
  assert.equal(variant.variant, 'moving-ears');
  assert.equal(E.locateGifts(s, [E.item('sew', 3)])[0].stock, 0);
  assert(E.canSend(s, order.id));
  act(f, { type: 'send', orderId: order.id });
  assert.equal(s.board[source], null);
  assert.equal(s.giftStore.length, 1);
});
