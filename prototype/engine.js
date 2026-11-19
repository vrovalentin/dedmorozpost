/* Rules shared by the offline prototype and Node tests. */
(function (root) {
  'use strict';
  const C = typeof module !== 'undefined' && module.exports ? require('./content.js') : root.PostContent;
  const { CHAINS, RECIPES, SNOW, SHIFTS, CACHES, at, coord, makeBoard, item } = C;
  const VERSION = 9, MAX_ENERGY = 20, REGEN_MS = 30000, MAIL_MS = 20000;
  const clone = x => JSON.parse(JSON.stringify(x));
  const key = x => x.chain + ':' + x.level;
  const isItem = x => !!x && Object.hasOwn(CHAINS, x.chain) && Number.isInteger(x.level) && x.level >= 1 && x.level <= 8;
  const label = x => CHAINS[x.chain].names[x.level - 1];
  const giftName = x => CHAINS[x.chain].gifts[x.level - 1];
  const isGift = x => !!x && Object.keys(x).length === 1 && isItem(x.gift) && Object.keys(x.gift).length === 2;
  function fitsRecipe(levels, level) {
    const remaining = [...RECIPES[level - 1]];
    for (const n of levels) { const i = remaining.indexOf(n); if (i < 0) return false; remaining.splice(i, 1); }
    return true;
  }
  function isAssembly(x) {
    const a = x?.assembly;
    return !!a && Object.keys(x).length === 1 && isItem(a) && Object.keys(a).length === 3 && Array.isArray(a.parts) && a.parts.length >= 2 && a.parts.length < RECIPES[a.level - 1].length && a.parts.every(n => Number.isInteger(n) && n >= 1 && n <= 8) && fitsRecipe(a.parts, a.level);
  }
  const isMovable = x => isItem(x) || isGift(x) || isAssembly(x);
  const cellName = x => isGift(x) ? giftName(x.gift) : isAssembly(x) ? 'Сборка: ' + giftName(x.assembly) : isItem(x) ? label(x) : '';
  function combine(a, b) {
    const read = x => isItem(x) ? { chain: x.chain, parts: [x.level], target: null } : isAssembly(x) ? { chain: x.assembly.chain, parts: x.assembly.parts, target: x.assembly.level } : null;
    const x = read(a), y = read(b);
    if (!x || !y || x.chain !== y.chain || (x.target && y.target && x.target !== y.target)) return null;
    // Identical ordinary parts always merge; crafting never intercepts that gesture.
    if (isItem(a) && isItem(b) && a.level === b.level) return null;
    const levels = [...x.parts, ...y.parts].sort((m, n) => n - m);
    let target = x.target || y.target;
    if (target && !fitsRecipe(levels, target)) return null;
    if (!target) {
      const exact = RECIPES.findIndex(r => r.length === levels.length && fitsRecipe(levels, RECIPES.indexOf(r) + 1));
      if (exact >= 0) target = exact + 1;
      else {
        // Start a long recipe with its highest ingredient, avoiding ambiguous small combinations.
        const possible = RECIPES.findIndex((r, i) => r.length > levels.length && levels.includes(Math.max(...r)) && fitsRecipe(levels, i + 1));
        if (possible < 0) return null;
        target = possible + 1;
      }
    }
    return levels.length === RECIPES[target - 1].length ? { gift: item(x.chain, target) } : { assembly: { chain: x.chain, level: target, parts: levels } };
  }
  const cacheAt = (shift, i) => CACHES[shift][coord(i)];
  const isCleared = (s, shift, cell) => s.cleared.some(x => x.shift === shift && x.cell === cell);
  const parts = s => Object.entries(CACHES[s.shift]).filter(([, c]) => c.required).map(([p, c]) => ({ ...c, cell: at(p), found: isCleared(s, s.shift, at(p)) }));
  const complete = s => parts(s).every(x => x.found);
  const orderList = s => [...s.letters, ...s.extra];
  const findOrder = (s, id) => orderList(s).find(L => L.id === id);
  function neighbors(i) {
    const c = i % 7, r = Math.floor(i / 7), out = [];
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (c + dc >= 0 && c + dc < 7 && r + dr >= 1 && r + dr < 9) out.push((r + dr) * 7 + c + dc);
    return out;
  }
  const accessible = (s, i) => !!s.board[i]?.snow && neighbors(i).some(n => s.board[n] === null || isMovable(s.board[n]));
  function count(s) { const n = {}; s.board.forEach(x => { if (isItem(x)) n[key(x)] = (n[key(x)] || 0) + 1; }); return n; }
  const recipe = gift => RECIPES[gift.level - 1].map(l => item(gift.chain, l));
  function canCraft(s, orderId, index) {
    const L = findOrder(s, orderId); if (!L || !L.want[index] || L.packed[index]) return false;
    const have = count(s), need = {};
    recipe(L.want[index]).forEach(x => { need[key(x)] = (need[key(x)] || 0) + 1; });
    return Object.entries(need).every(([k, n]) => (have[k] || 0) >= n);
  }
  function countGifts(s) {
    const result = {};
    [...s.board.filter(isGift).map(x => x.gift), ...s.giftStore].forEach(g => { result[key(g)] = (result[key(g)] || 0) + 1; });
    return result;
  }
  function canSend(s, id) {
    const L = findOrder(s, id); if (!L) return false;
    const available = countGifts(s);
    return L.want.every((g, i) => {
      if (L.packed[i]) return true;
      if (!available[key(g)]) return false;
      available[key(g)]--; return true;
    });
  }
  function rates(s) { return { lost: .2, damaged: s.built.includes(2) ? .05 : .1 }; }
  function newLetter(s, side = false) {
    const chains = Object.values(SHIFTS[s.shift].generators);
    const sequence = s.issued++;
    // Introduce the newly available workshop first, then alternate all available ones.
    const chain = chains[(sequence + chains.length - 1) % chains.length];
    const issued = s.chainIssued[chain]++;
    const rank = Math.min(8, 2 + Math.floor(issued / 6));
    const level = issued === 0 ? 1 : issued % 3 === 1 ? rank : Math.max(1, rank - 1);
    s.unlocked[chain] = Math.max(s.unlocked[chain], level);
    const names = ['Миша', 'Аня', 'Тимофей', 'Вера', 'Соня', 'Лёва', 'Маша', 'Егор', 'Лиза', 'Тимур'];
    const who = names[(s.nextId - 1) % names.length], want = [item(chain, level)];
    if (sequence > 5 && sequence % 7 === 0 && chains.length > 1) want.push(item(chains[0], 1));
    const story = ['Очень жду подарок. Уже придумал, как буду с ним играть!', 'Можно подарок для наших домашних приключений?', 'Обещаю прислать тебе рисунок. Спасибо, что читаешь моё письмо!'][sequence % 3];
    return { id: s.nextId++, who, text: side ? 'Моё письмо, кажется, потерялось в сугробе. Как здорово, что вы его нашли!' : story, want, packed: want.map(() => false), protected: false, retry: false, side };
  }
  function fresh(now = Date.now()) {
    const s = { version: VERSION, shift: 0, board: makeBoard(0), giftStore: [], letters: [], extra: [], mail: [], cleared: [], bag: [], decor: [], postcards: [], built: [], thanks: 0,
      energy: MAX_ENERGY, energyAt: now, speed: 1, issued: 0, nextId: 1, nextMailId: 1, nextToolId: 1, moves: 0,
      unlocked: { tech: 1, sew: 1, art: 1 }, chainIssued: { tech: 0, sew: 0, art: 0 }, rng: ((Math.floor(Math.random() * 0xffffffff) ^ now) >>> 0) || 1 };
    for (let i = 0; i < 3; i++) s.letters.push(newLetter(s));
    return s;
  }
  function validate(s) {
    try {
      if (!s || s.version !== VERSION || !Number.isInteger(s.shift) || !SHIFTS[s.shift]) return false;
      for (const k of ['energy', 'thanks', 'issued', 'nextId', 'nextMailId', 'nextToolId', 'moves', 'rng']) if (!Number.isInteger(s[k]) || s[k] < 0) return false;
      if (!s.nextId || !s.nextMailId || !s.nextToolId || !s.rng || s.rng > 0xffffffff || s.energy > MAX_ENERGY || ![1, 10].includes(s.speed) || !Number.isFinite(s.energyAt) || s.energyAt < 0) return false;
      for (const k of ['board', 'giftStore', 'letters', 'extra', 'mail', 'cleared', 'bag', 'decor', 'postcards', 'built']) if (!Array.isArray(s[k])) return false;
      if (s.board.length !== 63 || s.letters.length !== 3) return false;
      const allowed = Object.values(SHIFTS[s.shift].generators);
      if (!s.giftStore.every(g => isItem(g) && Object.keys(g).length === 2 && allowed.includes(g.chain))) return false;
      for (const c of Object.keys(CHAINS)) if (!Number.isInteger(s.unlocked?.[c]) || s.unlocked[c] < 1 || s.unlocked[c] > 8 || !Number.isInteger(s.chainIssued?.[c]) || s.chainIssued[c] < 0) return false;
      const validOrder = L => L && Number.isInteger(L.id) && L.id > 0 && L.id < s.nextId && typeof L.who === 'string' && typeof L.text === 'string' && Array.isArray(L.want) && L.want.length > 0 && L.want.length <= 2 && L.want.every(g => isItem(g) && allowed.includes(g.chain)) && Array.isArray(L.packed) && L.packed.length === L.want.length && L.packed.every(x => typeof x === 'boolean') && typeof L.protected === 'boolean' && typeof L.retry === 'boolean';
      if (!orderList(s).every(validOrder) || new Set(orderList(s).map(L => L.id)).size !== orderList(s).length) return false;
      const ids = new Set();
      for (const m of s.mail) {
        if (!m || !Number.isInteger(m.id) || m.id <= 0 || m.id >= s.nextMailId || ids.has(m.id) || !validOrder(m.order) || !Number.isInteger(m.shift) || m.shift < 0 || m.shift > s.shift || ![1, 2].includes(m.attempt) || !['success', 'lost', 'damaged'].includes(m.outcome) || typeof m.claimed !== 'boolean' || !Number.isFinite(m.dueAt) || m.dueAt < 0) return false;
        if (m.attempt === 2 && (m.outcome !== 'success' || !s.mail.some(p => p.order.id === m.order.id && p.attempt === 1 && p.outcome === 'lost' && p.claimed))) return false;
        if (s.mail.some(p => p !== m && p.order.id === m.order.id && p.attempt === m.attempt)) return false;
        ids.add(m.id);
      }
      let spent = 0; const clearedIds = new Set();
      for (const c of s.cleared) {
        if (!c || !Number.isInteger(c.shift) || c.shift < 0 || c.shift > s.shift || !Number.isInteger(c.cell) || c.cell < 7 || c.cell >= 63 || clearedIds.has(c.shift + ':' + c.cell)) return false;
        const x = makeBoard(c.shift)[c.cell]; if (!x?.snow) return false;
        clearedIds.add(c.shift + ':' + c.cell); spent += SNOW[x.snow].cost;
      }
      const successes = s.mail.filter(m => m.claimed && m.outcome === 'success');
      if (new Set(successes.map(m => m.order.id)).size !== successes.length || s.thanks !== successes.length - spent) return false;
      const initial = makeBoard(s.shift);
      for (let i = 0; i < 63; i++) {
        const x = s.board[i];
        if (i < 7 || (initial[i]?.snow && !isCleared(s, s.shift, i))) { if (JSON.stringify(x) !== JSON.stringify(initial[i])) return false; }
        else if (x !== null && !((isItem(x) && Object.keys(x).length === 2 && allowed.includes(x.chain)) || (isGift(x) && allowed.includes(x.gift.chain)) || (isAssembly(x) && allowed.includes(x.assembly.chain)))) return false;
      }
      // Every cleared tile must have been reachable at the time it was opened.
      for (let shift = 0; shift <= s.shift; shift++) {
        const temp = { board: makeBoard(shift) };
        for (const c of s.cleared.filter(x => x.shift === shift)) { if (!accessible(temp, c.cell)) return false; temp.board[c.cell] = null; }
      }
      if (new Set(s.built).size !== s.built.length || !s.built.every(n => Number.isInteger(n) && n >= 0 && n <= s.shift)) return false;
      for (const n of s.built) if (!Object.keys(CACHES[n]).filter(p => CACHES[n][p].required).every(p => isCleared(s, n, at(p)))) return false;
      for (let n = 0; n < s.shift; n++) if (!s.built.includes(n)) return false;
      const toolIds = new Set();
      for (const t of s.bag) {
        if (!t || !Number.isInteger(t.id) || t.id < 1 || t.id >= s.nextToolId || toolIds.has(t.id) || !['energy', 'scissors', 'tag'].includes(t.kind) || typeof t.name !== 'string') return false;
        if (t.kind === 'energy' && (!Number.isInteger(t.amount) || t.amount < 1 || t.amount > 20)) return false;
        toolIds.add(t.id);
      }
      if (!s.decor.every(x => x && typeof x.name === 'string' && typeof x.icon === 'string') || !s.postcards.every(x => x && typeof x.name === 'string' && typeof x.text === 'string')) return false;
      return true;
    } catch (_) { return false; }
  }
  function migrate(saved) {
    if (saved?.version === 8) {
      const candidate = { ...clone(saved), version: VERSION, giftStore: [] };
      return validate(candidate) ? candidate : null;
    }
    return validate(saved) ? saved : null;
  }
  class Game {
    constructor(saved, now = () => Date.now(), random = null) { this.now = now; this.random = random; const restored = migrate(saved); this.state = restored ? clone(restored) : fresh(now()); this.history = []; this.regen(); }
    roll() {
      if (this.random) return this.random();
      let x = this.state.rng; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; this.state.rng = x >>> 0;
      return this.state.rng / 0x100000000;
    }
    regen() {
      const s = this.state, now = this.now(), interval = REGEN_MS / s.speed;
      if (s.energy === MAX_ENERGY || s.energyAt > now) { s.energyAt = now; return; }
      const add = Math.floor((now - s.energyAt) / interval);
      if (add > 0) { s.energy = Math.min(MAX_ENERGY, s.energy + add); s.energyAt = s.energy === MAX_ENERGY ? now : s.energyAt + add * interval; }
    }
    energySeconds() { return this.state.energy === MAX_ENERGY ? 0 : Math.max(1, Math.ceil((REGEN_MS / this.state.speed - (this.now() - this.state.energyAt)) / 1000)); }
    remember() { this.history.push(clone(this.state)); if (this.history.length > 40) this.history.shift(); }
    undo() {
      if (!this.history.length) return { ok: false, text: 'Пока нечего отменять.' };
      this.state = this.history.pop(); this.regen(); return { ok: true, text: 'Действие отменено.' };
    }
    act(a) {
      this.regen(); const s = this.state, b = s.board;
      const fail = text => ({ ok: false, text });
      const ok = (text, pop) => ({ ok: true, text, pop });
      if (a.type === 'speed') {
        const speed = s.speed === 1 ? 10 : 1, ratio = s.speed / speed, now = this.now();
        s.energyAt = now - (now - s.energyAt) * ratio;
        s.mail.filter(m => !m.claimed && m.dueAt > now).forEach(m => { m.dueAt = now + (m.dueAt - now) * ratio; });
        s.speed = speed; this.history = [];
        return ok(speed === 10 ? 'Быстрый тест: энергия и доставка идут в 10 раз быстрее, цены и вероятности прежние.' : 'Обычный темп: снежинка за 30 секунд, ответ за 20 секунд.');
      }
      if (a.type === 'build') {
        if (!complete(s) || s.built.includes(s.shift)) return fail('Сначала найдём четыре части.');
        this.remember(); s.built.push(s.shift); s.moves++;
        return ok(s.shift === 2 ? 'Упаковочная станция работает! Повреждения теперь 5% вместо 10%. Потери пока 20%.' : 'Мастерская собрана! Можно переходить к новому производству.');
      }
      if (a.type === 'next') {
        if (!s.built.includes(s.shift) || s.shift === 2) return fail('Сначала собери мастерскую из найденных частей.');
        s.giftStore.push(...b.filter(isGift).map(x => clone(x.gift)));
        s.shift++; s.board = makeBoard(s.shift); s.issued = 0; this.history = [];
        return ok('Новый стол готов. Готовые подарки с поля перенесены в запас; письма, посылки и находки сохранены.');
      }
      if (a.type === 'spawn') {
        const chain = b[a.from]?.gen; if (!chain) return fail('Нажми на генератор в верхнем ряду.');
        if (!s.energy) return fail('Снежинки закончились. +1 через ' + this.energySeconds() + ' с. Можно открыть найденный мешочек или включить быстрый тест.');
        let target = -1, distance = Infinity;
        for (let i = 7; i < 63; i++) if (b[i] === null) { const d = Math.abs(i % 7 - a.from % 7) + Math.abs(Math.floor(i / 7) - Math.floor(a.from / 7)); if (d < distance) { distance = d; target = i; } }
        if (target < 0) return fail('Нет места. Собери подарок, слей запчасти, верни лишнее или расчисти соседний снег.');
        this.remember(); const bonus = s.unlocked[chain] >= 5 ? s.unlocked[chain] - 3 : 1;
        const level = bonus > 1 && this.roll() < .2 ? bonus : 1;
        if (s.energy === MAX_ENERGY) s.energyAt = this.now(); s.energy--; b[target] = item(chain, level); s.moves++;
        return ok(label(b[target]) + ' · уровень ' + level + '. −1 ❄', target);
      }
      if (a.type === 'return') {
        if (isAssembly(b[a.from])) return this.act({ type: 'disassemble', cell: a.from });
        const x = b[a.from]; if (!isItem(x)) return fail('Вернуть можно только запчасть.');
        this.remember(); b[a.from] = null; s.moves++; return ok('Освободили клетку. Снежинки за запчасть не возвращаются.');
      }
      if (a.type === 'craft') {
        const L = findOrder(s, a.orderId); if (!L || !canCraft(s, L.id, a.giftIndex)) return fail('Нужен полный комплект запчастей точных уровней.');
        this.remember();
        for (const part of recipe(L.want[a.giftIndex])) b[b.findIndex(x => isItem(x) && key(x) === key(part))] = null;
        L.packed[a.giftIndex] = true; s.moves++;
        return ok(giftName(L.want[a.giftIndex]) + ' собран и лежит на упаковочной полке письма.');
      }
      if (a.type === 'disassemble') {
        const x = b[a.cell]; if (!isAssembly(x)) return fail('Разобрать можно незавершённую сборку.');
        const empty = b.flatMap((p, i) => p === null ? [i] : []);
        if (empty.length < x.assembly.parts.length - 1) return fail('Для возврата всех деталей нужно ещё ' + (x.assembly.parts.length - 1) + ' свободных клеток. Сборка не потеряна.');
        this.remember();
        const slots = [a.cell, ...empty]; x.assembly.parts.forEach((level, i) => { b[slots[i]] = item(x.assembly.chain, level); }); s.moves++;
        return ok('Сборка разобрана, все детали возвращены на поле.', a.cell);
      }
      if (a.type === 'protect') {
        const L = findOrder(s, a.orderId), index = s.bag.findIndex(t => t.kind === 'tag');
        if (!L || L.retry || L.protected || index < 0) return fail('Нужна найденная бирка для первой отправки. Повторная и так доходит гарантированно.');
        this.remember(); s.bag.splice(index, 1); L.protected = true; return ok('Бирка прикреплена: эта посылка точно дойдёт целой.');
      }
      if (a.type === 'send') {
        const L = findOrder(s, a.orderId); if (!L || !canSend(s, L.id)) return fail('Сначала собери все подарки письма.');
        this.remember();
        L.want.forEach((g, i) => {
          if (L.packed[i]) return;
          const cell = b.findIndex(x => isGift(x) && key(x.gift) === key(g));
          if (cell >= 0) b[cell] = null;
          else s.giftStore.splice(s.giftStore.findIndex(x => key(x) === key(g)), 1);
          L.packed[i] = true;
        });
        const chance = rates(s), roll = L.retry || L.protected ? 0 : this.roll();
        const success = Math.round((1 - chance.lost - chance.damaged) * 100) / 100;
        const outcome = roll < success ? 'success' : roll < success + chance.lost ? 'lost' : 'damaged';
        s.mail.push({ id: s.nextMailId++, order: clone(L), attempt: L.retry ? 2 : 1, outcome, dueAt: this.now() + MAIL_MS / s.speed, claimed: false, shift: s.shift });
        const normal = s.letters.findIndex(x => x.id === L.id);
        if (normal >= 0) s.letters[normal] = newLetter(s); else s.extra.splice(s.extra.findIndex(x => x.id === L.id), 1);
        s.moves++;
        return ok('Посылка для ' + L.who + ' в пути. Сердечко придёт только с успешным ответом.');
      }
      if (a.type === 'claim') {
        const m = s.mail.find(m => m.id === a.mailId);
        if (!m || m.claimed || m.dueAt > this.now()) return fail('Ответ пока не пришёл или уже открыт.');
        this.remember(); m.claimed = true;
        if (m.outcome === 'success') { s.thanks++; return ok('Ответ: «Спасибо за подарок!» +1 ♡.'); }
        if (m.outcome === 'damaged') return ok('Подарок повредился в дороге. За эту посылку нет сердечка. Новые письма продолжают приходить.');
        const retry = clone(m.order); retry.retry = true; retry.protected = false; retry.packed = retry.want.map(() => false);
        s.extra.push(retry);
        return ok('Посылка потерялась. Повторный заказ добавлен под письмами; он гарантированно дойдёт.');
      }
      if (a.type === 'melt') {
        const x = b[a.cell]; if (!x?.snow) return fail('Здесь нет снега.');
        if (!accessible(s, a.cell)) return fail('Сначала расчисти соседнюю клетку. Добираемся от открытого стола по четырём сторонам.');
        const cost = SNOW[x.snow].cost; if (s.thanks < cost) return fail('Нужно ' + cost + ' ♡. Отправляй подарки и открывай успешные ответные письма.');
        this.remember(); s.thanks -= cost; b[a.cell] = null; s.cleared.push({ shift: s.shift, cell: a.cell }); s.moves++;
        const loot = cacheAt(s.shift, a.cell);
        if (!loot) return ok('Убрали снег. Стало больше места для работы.', a.cell);
        if (['energy', 'scissors', 'tag'].includes(loot.kind)) s.bag.push({ id: s.nextToolId++, ...clone(loot) });
        if (loot.kind === 'decor') s.decor.push({ ...clone(loot), source: s.shift + ':' + a.cell });
        if (loot.kind === 'postcard') {
          s.postcards.push({ ...clone(loot), source: s.shift + ':' + a.cell });
          if (loot.amount) s.bag.push({ id: s.nextToolId++, kind: 'energy', name: 'Снежинки из открытки', amount: loot.amount });
        }
        if (loot.kind === 'letter') s.extra.push(newLetter(s, true));
        return ok('Под снегом: ' + loot.name + (loot.kind === 'part' ? '! Часть заняла место в проекте мастерской.' : '! Находка сохранена.'), a.cell);
      }
      if (a.type === 'energy') {
        const i = s.bag.findIndex(x => x.id === a.toolId && x.kind === 'energy');
        if (i < 0 || s.energy === MAX_ENERGY) return fail('Запас уже полон. Мешочек можно оставить на потом.');
        this.remember(); const gain = Math.min(MAX_ENERGY - s.energy, s.bag[i].amount); s.energy += gain; s.bag[i].amount -= gain;
        if (!s.bag[i].amount) s.bag.splice(i, 1); if (s.energy === MAX_ENERGY) s.energyAt = this.now();
        return ok('Добавили ' + gain + ' ❄. Остаток мешочка не пропадает.');
      }
      if (a.type === 'split') {
        const i = s.bag.findIndex(x => x.id === a.toolId && x.kind === 'scissors'), x = b[a.cell], empty = b.indexOf(null);
        if (i < 0 || !isItem(x) || x.level === 1) return fail('Выбери запчасть уровня 2 или выше и найденные ножницы.');
        if (empty < 0) return fail('Для двух половинок нужна ещё одна свободная клетка. Ножницы не потрачены.');
        this.remember(); b[a.cell] = item(x.chain, x.level - 1); b[empty] = item(x.chain, x.level - 1); s.bag.splice(i, 1); s.moves++;
        return ok('Разделили запчасть на две предыдущего уровня.', a.cell);
      }
      if (a.type !== 'drop') return fail('Неизвестное действие.');
      const { from, to } = a; if (![from, to].every(i => Number.isInteger(i) && i >= 0 && i < 63) || from === to) return fail('Выбери другую клетку.');
      const x = b[from], y = b[to]; if (!isMovable(x)) return fail('Передвигать можно запчасти, сборки и подарки.');
      if (y?.gen) {
        if (isGift(x)) return fail('Готовый подарок нельзя выбросить в генератор. Его можно отправить по письму.');
        const chain = isItem(x) ? x.chain : x.assembly.chain;
        return y.gen === chain ? this.act({ type: 'return', from }) : fail('У этой детали другой генератор.');
      }
      if (y?.snow || y?.blocked) return fail('Сначала расчисти снег за спасибо.');
      if (isItem(x) && isItem(y) && key(x) === key(y)) {
        if (x.level === 8) return fail('Это максимальный уровень запчасти. Её используют в рецепте.');
        const need = orderList(s).flatMap(L => L.want.flatMap((g, n) => L.packed[n] ? [] : recipe(g))).filter(p => key(p) === key(x)).length;
        if (!a.force && need && count(s)[key(x)] - 2 < need) return { ok: false, warning: true, text: label(x) + ' нужен в рецепте. Всё равно слить?' };
        this.remember(); b[from] = null; b[to] = item(x.chain, x.level + 1); s.moves++;
        return ok(label(b[to]) + ' · уровень ' + b[to].level, to);
      }
      const crafted = combine(x, y);
      if (crafted) {
        this.remember(); b[from] = null; b[to] = crafted; s.moves++;
        return ok(isGift(crafted) ? giftName(crafted.gift) + ' готов на поле! В подходящем письме появилась кнопка «Отправить».' : 'Начали сборку: ' + giftName(crafted.assembly) + '. Добавь уровни ' + RECIPES[crafted.assembly.level - 1].filter(n => !crafted.assembly.parts.includes(n)).join(', ') + '.', to);
      }
      this.remember(); b[from] = y; b[to] = x; s.moves++;
      return ok(y ? 'Поменяли запчасти местами.' : 'Переместили запчасть.', to);
    }
  }
  const api = { ...C, VERSION, MAX_ENERGY, REGEN_MS, MAIL_MS, Game, fresh, validate, migrate, isItem, isGift, isAssembly, isMovable, cellName, combine, countGifts, label, giftName, key, recipe, count, canCraft, canSend, findOrder, orderList, neighbors, accessible, parts, complete, cacheAt, isCleared, rates };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PostGame = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
