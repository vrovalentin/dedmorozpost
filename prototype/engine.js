/* Rules shared by the offline prototype and Node tests. */
(function (root) {
  'use strict';
  const C = typeof module !== 'undefined' && module.exports ? require('./content.js') : root.PostContent;
  const { CHAINS, RECIPES, SNOW, SHIFTS, CACHES, at, coord, makeBoard, item } = C;
  const VERSION = 22, MAX_ENERGY = 40, REGEN_MS = 30000, MAIL_MS = 20000;
  const clone = x => JSON.parse(JSON.stringify(x));
  const key = x => x.chain + ':' + x.level;
  const isItem = x => !!x && Object.hasOwn(CHAINS, x.chain) && Number.isInteger(x.level) && x.level >= 1 && x.level <= 8;
  const isRarePart = x => x?.rare === true && x.chain === C.RARE_PART.chain && x.level === C.RARE_PART.level;
  const label = x => isRarePart(x) ? C.RARE_NAME : CHAINS[x.chain].names[x.level - 1];
  const giftName = x => CHAINS[x.chain].gifts[x.level - 1];
  const validGift = g => isItem(g) && (Object.keys(g).length === 2 || (Object.keys(g).length === 3 && g.rare === true && g.chain === 'tech' && g.level === C.RARE_TARGET));
  const isGift = x => !!x && Object.keys(x).length === 1 && validGift(x.gift);
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
    if (isRarePart(a) || isRarePart(b)) {
      const other = isRarePart(a) ? b : a;
      return isItem(other) && other.chain === 'tech' && other.level === 6 ? { gift: { ...item('tech', C.RARE_TARGET), rare: true } } : null;
    }
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
  function count(s) { const n = {}; s.board.forEach(x => { if (isItem(x) && !isRarePart(x)) n[key(x)] = (n[key(x)] || 0) + 1; }); return n; }
  const recipe = gift => RECIPES[gift.level - 1].map(l => item(gift.chain, l));
  function craftSlots(s, gift, useRare = false) {
    const slots = [];
    for (const part of recipe(gift)) {
      const needsRare = useRare && part.level === C.RARE_PART.level;
      const index = s.board.findIndex((x, i) => isItem(x) && key(x) === key(part) && !slots.includes(i) && isRarePart(x) === needsRare);
      if (index < 0) return null;
      slots.push(index);
    }
    return slots;
  }
  const rareFits = gift => gift.chain === 'tech' && gift.level === C.RARE_TARGET;
  function canCraft(s, orderId, index, useRare = false) {
    const L = findOrder(s, orderId);
    if (!L || (L.choice && !L.chosen) || !L.want[index] || L.packed[index]) return false;
    const gift = L.want[index];
    return (!useRare || rareFits(gift)) && !!craftSlots(s, gift, useRare);
  }
  function countGifts(s) {
    const result = {};
    [...s.board.filter(isGift).map(x => x.gift), ...s.giftStore].forEach(g => { result[key(g)] = (result[key(g)] || 0) + 1; });
    return result;
  }
  function canSend(s, id) {
    const L = findOrder(s, id); if (!L || (L.choice && !L.chosen)) return false;
    const available = countGifts(s);
    return L.want.every((g, i) => {
      if (L.packed[i]) return true;
      if (!available[key(g)]) return false;
      available[key(g)]--; return true;
    });
  }
  function rates(s) { return { lost: .2, damaged: s.built.includes(2) ? .05 : .1 }; }
  const giftThanks = gift => Math.max(1, gift.level - 4);
  const orderThanks = order => order.want.reduce((sum, gift) => sum + giftThanks(gift), 0) + (order.special === 'village' && order.want.length === 3 ? 1 : 0);
  const ORDER_TIERS = ['easy', 'medium', 'hard'];
  const ENERGY_GIFTS = [
    { threshold: 5, amount: 5, name: 'Подарок снеговика' },
    { threshold: 10, amount: 10, name: 'Термос Снегурочки' }
  ];
  const completedLetters = s => new Set(s.mail.filter(m => m.claimed && m.outcome === 'success').map(m => m.order.id)).size;
  const letterHistory = s => [...orderList(s), ...s.mail.map(m => m.order)];
  const ordinarySuccesses = s => s.mail.filter(m => m.claimed && m.outcome === 'success' && ORDER_TIERS.includes(m.order.difficulty) && !m.order.choice).length;
  function eventLetter(s, data, difficulty, levels) {
    return { id: s.nextId++, who: data.who, text: data.text, replyText: data.replyText, difficulty,
      want: levels.map(level => item('tech', level)), packed: levels.map(() => false), protected: false, retry: false, side: false };
  }
  function offerSpecial(s) {
    if (s.extra.some(L => L.special) || s.mail.some(m => m.order.special && !m.claimed)) return;
    const history = letterHistory(s), delivered = ordinarySuccesses(s);
    const data = C.SPECIAL_LETTERS.find(L => delivered >= L.threshold && !history.some(p => p.special === L.id));
    if (data) s.extra.push({ ...eventLetter(s, data, 'special', data.levels), special: data.id });
  }
  const BOY_NAMES = ['Миша', 'Ваня', 'Тимофей', 'Егор', 'Гриша', 'Лёва', 'Коля', 'Марк', 'Петя', 'Тимур'];
  const GIRL_NAMES = ['Мила', 'Аня', 'Вера', 'Соня', 'Лиза', 'Маша', 'Катя', 'Ника', 'Вика', 'Оля'];
  const MIXED_NAMES = BOY_NAMES.flatMap((name, i) => [name, GIRL_NAMES[i]]);
  function newLetter(s, side = false, difficulty = 'easy') {
    if (!side && difficulty === 'medium' && s.shift !== 1) {
      const history = letterHistory(s), delivered = ordinarySuccesses(s);
      const data = C.CHOICE_LETTERS.find(L => delivered >= L.threshold && s.unlocked.tech >= Math.max(...L.options) && !history.some(p => p.choice === L.id));
      if (data) return { ...eventLetter(s, data, difficulty, [data.options[0]]), choice: data.id, chosen: false, age: data.age, ageGroup: data.ageGroup };
    }
    const chains = s.shift === 1 ? ['sew'] : Object.values(SHIFTS[s.shift].generators), sequence = s.issued++;
    const chain = chains[(sequence + chains.length - 1) % chains.length], issued = s.chainIssued[chain]++;
    const hardSent = s.mail.filter(m => m.attempt === 1 && m.order.difficulty === 'hard' && m.order.want[0].chain === chain).length;
    const cap = Math.min(8, Math.max(3, s.unlocked[chain], 3 + Math.floor(hardSent / 2)));
    const level = side || difficulty === 'easy' ? 1 + issued % 2 : difficulty === 'medium' ? Math.min(5, Math.max(2, cap - 1)) : cap;
    s.unlocked[chain] = Math.max(s.unlocked[chain], level);
    const names = [BOY_NAMES, GIRL_NAMES, MIXED_NAMES][s.shift];
    const history = [...orderList(s), ...s.mail.map(m => m.order)];
    const used = new Set(history.map(L => L.storyId).filter(Boolean));
    const activeStories = new Set([...orderList(s), ...s.mail.filter(m => !m.claimed).map(m => m.order)].map(L => L.storyId).filter(Boolean));
    const lastSeen = id => Math.max(0, ...history.filter(L => L.storyId === id).map(L => L.id));
    const want = [item(chain, level)];
    if (!side && difficulty === 'hard' && chains.length > 1 && sequence % 7 === 0) want.push(item(chains.find(c => c !== chain), 1));
    const candidates = want.length === 1 ? C.PERSONAL_LETTERS.filter(x => x.chain === chain && x.level === level) : [];
    const story = candidates.find(x => !used.has(x.id)) || candidates.filter(x => !activeStories.has(x.id) && lastSeen(x.id) <= s.nextId - 6).sort((a,b) => lastSeen(a.id) - lastSeen(b.id))[0];
    const age = story?.age || level + 4;
    const ageGroup = level <= 2 ? '5–6' : level <= 5 ? '7–9' : '10–12';
    const author = s.shift < 2 && story ? { ...story, ...C.WORKSHOP_AUTHORS[story.id] } : story;
    return { id: s.nextId++, who: author?.who || names[(s.nextId - 2) % names.length] + ', ' + age + ' лет', age, ageGroup,
      text: author?.request || (side ? 'Моё письмо потерялось в сугробе. Как здорово, что вы его нашли!' : 'Дедушка Мороз, подари, пожалуйста, этот подарок. У меня уже есть идеи для игр с ним. Спасибо, что прочитал моё письмо!'),
      replyText: author?.reply || 'Подарок приехал! Спасибо, Дедушка! Мы уже придумали, как будем с ним играть.', storyId: story?.id || null,
      difficulty: side ? 'found' : difficulty, want, packed: [false], protected: false, retry: false, side };
  }
  function fresh(now = Date.now()) {
    const s = { version: VERSION, energyGiftClaims: [], shift: 0, compactStart: true, board: makeBoard(0, true), giftStore: [], letters: [], extra: [], mail: [], cleared: [], bag: [], decor: [], postcards: [], built: [], thanks: 0,
      energy: MAX_ENERGY, energyAt: now, speed: 1, issued: 0, nextId: 1, nextMailId: 1, nextToolId: 1, moves: 0,
      unlocked: { tech: 1, sew: 1, art: 1 }, chainIssued: { tech: 0, sew: 0, art: 0 }, rng: ((Math.floor(Math.random() * 0xffffffff) ^ now) >>> 0) || 1 };
    for (const tier of ORDER_TIERS) s.letters.push(newLetter(s, false, tier));
    return s;
  }
  function validate(s) {
    try {
      if (s?.compactStart !== undefined && typeof s.compactStart !== 'boolean') return false;
      if (!s || s.version !== VERSION || !Number.isInteger(s.shift) || !SHIFTS[s.shift]) return false;
      for (const k of ['energy', 'thanks', 'issued', 'nextId', 'nextMailId', 'nextToolId', 'moves', 'rng']) if (!Number.isInteger(s[k]) || s[k] < 0) return false;
      if (!s.nextId || !s.nextMailId || !s.nextToolId || !s.rng || s.rng > 0xffffffff || s.energy > MAX_ENERGY || ![1, 10].includes(s.speed) || !Number.isFinite(s.energyAt) || s.energyAt < 0) return false;
      for (const k of ['energyGiftClaims', 'board', 'giftStore', 'letters', 'extra', 'mail', 'cleared', 'bag', 'decor', 'postcards', 'built']) if (!Array.isArray(s[k])) return false;
      if (s.board.length !== 63 || s.letters.length !== 3 || ORDER_TIERS.some(tier => s.letters.filter(L => L?.difficulty === tier).length !== 1)) return false;
      if (new Set(s.energyGiftClaims).size !== s.energyGiftClaims.length || !s.energyGiftClaims.every(n => ENERGY_GIFTS.some(g => g.threshold === n) && completedLetters(s) >= n)) return false;
      const allowed = Object.values(SHIFTS[s.shift].generators);
      if (!s.giftStore.every(g => validGift(g) && allowed.includes(g.chain))) return false;
      for (const c of Object.keys(CHAINS)) if (!Number.isInteger(s.unlocked?.[c]) || s.unlocked[c] < 1 || s.unlocked[c] > 8 || !Number.isInteger(s.chainIssued?.[c]) || s.chainIssued[c] < 0) return false;
      const validEvent = L => {
        if (L.rarePacked !== undefined && (!Array.isArray(L.rarePacked) || !L.rarePacked.every((i, n, a) => Number.isInteger(i) && a.indexOf(i) === n && L.packed[i] && L.want[i] && rareFits(L.want[i])))) return false;
        if (L.choice) {
          const data = C.CHOICE_LETTERS.find(p => p.id === L.choice);
          return !!data && !L.special && L.difficulty === 'medium' && L.want.length === 1 && L.want[0].chain === 'tech' && data.options.includes(L.want[0].level) && typeof L.chosen === 'boolean' && (L.chosen || !L.packed[0]);
        }
        if (L.difficulty !== 'special') return !L.special;
        const data = C.SPECIAL_LETTERS.find(p => p.id === L.special);
        if (!data) return false;
        const levels = L.want.length === 3 ? [...data.levels, data.optional] : data.levels;
        return L.want.length === levels.length && L.want.every((g, i) => g.chain === 'tech' && g.level === levels[i]);
      };
      const validOrder = L => L && Number.isInteger(L.id) && L.id > 0 && L.id < s.nextId && typeof L.who === 'string' && typeof L.text === 'string' && Array.isArray(L.want) && L.want.length > 0 && L.want.length <= (L.special === 'village' ? 3 : 2) && L.want.every(g => isItem(g) && allowed.includes(g.chain)) && Array.isArray(L.packed) && L.packed.length === L.want.length && L.packed.every(x => typeof x === 'boolean') && typeof L.protected === 'boolean' && typeof L.retry === 'boolean' && [...ORDER_TIERS, 'legacy', 'found', 'special'].includes(L.difficulty) && validEvent(L) && (L.replyText === undefined || typeof L.replyText === 'string') && (L.storyId == null || [...C.PERSONAL_LETTERS, ...C.LEGACY_PERSONAL_LETTERS].some(p => p.id === L.storyId && L.want.length === 1 && p.chain === L.want[0].chain && p.level === L.want[0].level));
      if (!orderList(s).every(validOrder) || new Set(orderList(s).map(L => L.id)).size !== orderList(s).length) return false;
      const ids = new Set();
      for (const m of s.mail) {
        if (!m || !Number.isInteger(m.id) || m.id <= 0 || m.id >= s.nextMailId || ids.has(m.id) || !validOrder(m.order) || !Number.isInteger(m.shift) || m.shift < 0 || m.shift > s.shift || ![1, 2].includes(m.attempt) || !['success', 'lost', 'damaged'].includes(m.outcome) || typeof m.claimed !== 'boolean' || !Number.isFinite(m.dueAt) || m.dueAt < 0) return false;
        if (!Number.isInteger(m.rewardThanks) || m.rewardThanks < 1 || m.rewardThanks > 8 || (m.rewardThanks !== orderThanks(m.order) && !(m.claimed && m.rewardThanks === 1))) return false;
        if (![0, 1].includes(m.bonusEnergy) || (m.outcome !== 'success' && m.bonusEnergy !== 0)) return false;
        if (m.attempt === 2 && (m.outcome !== 'success' || !s.mail.some(p => p.order.id === m.order.id && p.attempt === 1 && p.outcome === 'lost' && p.claimed))) return false;
        if (s.mail.some(p => p !== m && p.order.id === m.order.id && p.attempt === m.attempt)) return false;
        ids.add(m.id);
      }
      let spent = 0; const clearedIds = new Set();
      for (const c of s.cleared) {
        if (!c || !Number.isInteger(c.shift) || c.shift < 0 || c.shift > s.shift || !Number.isInteger(c.cell) || c.cell < 7 || c.cell >= 63 || clearedIds.has(c.shift + ':' + c.cell)) return false;
        const x = makeBoard(c.shift, s.compactStart)[c.cell]; if (!x?.snow) return false;
        clearedIds.add(c.shift + ':' + c.cell); spent += SNOW[x.snow].cost;
      }
      const successes = s.mail.filter(m => m.claimed && m.outcome === 'success');
      if (new Set(successes.map(m => m.order.id)).size !== successes.length || s.thanks !== successes.reduce((sum, m) => sum + m.rewardThanks, 0) - spent) return false;
      const initial = makeBoard(s.shift, s.compactStart);
      for (let i = 0; i < 63; i++) {
        const x = s.board[i];
        if (i < 7 || (initial[i]?.snow && !isCleared(s, s.shift, i))) { if (JSON.stringify(x) !== JSON.stringify(initial[i])) return false; }
        else if (x !== null && !((isItem(x) && (Object.keys(x).length === 2 || (Object.keys(x).length === 3 && isRarePart(x))) && allowed.includes(x.chain)) || (isGift(x) && allowed.includes(x.gift.chain)) || (isAssembly(x) && allowed.includes(x.assembly.chain)))) return false;
      }
      // Every cleared tile must have been reachable at the time it was opened.
      for (let shift = 0; shift <= s.shift; shift++) {
        const temp = { board: makeBoard(shift, s.compactStart) };
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
    try {
      if (saved?.version === 21) {
        const candidate = { ...clone(saved), version: VERSION };
        return validate(candidate) ? candidate : null;
      }
      if ([8, 9, 10, 12, 20].includes(saved?.version)) {
        if (!Array.isArray(saved.mail) || !Array.isArray(saved.letters) || saved.letters.length !== 3 || !Array.isArray(saved.extra) || !Number.isInteger(saved.energy)) return null;
        const candidate = { ...clone(saved), version: VERSION, energyGiftClaims: [], giftStore: saved.giftStore || [], energy: Math.min(MAX_ENERGY, saved.energy + (saved.version >= 12 ? 0 : saved.version === 10 ? 10 : 20)) };
        if (candidate.mail.some(m => !m || !Array.isArray(m.order?.want) || !m.order.want.every(isItem))) return null;
        if (saved.version < 20) candidate.mail.forEach(m => { m.rewardThanks = m.claimed ? 1 : orderThanks(m.order); });
        if (saved.version < 10) candidate.mail.forEach(m => { m.bonusEnergy = 0; });
        [...orderList(candidate), ...candidate.mail.map(m => m.order)].forEach(L => { L.difficulty = L.difficulty || 'legacy'; });
        // Keep every old request (including packed gifts) in additional mail.
        candidate.extra.push(...candidate.letters); candidate.letters = [];
        for (const tier of ORDER_TIERS) candidate.letters.push(newLetter(candidate, false, tier));
        return validate(candidate) ? candidate : null;
      }
      return validate(saved) ? saved : null;
    } catch (_) { return null; }
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
        const rare = b.find(isRarePart);
        s.shift++; s.board = makeBoard(s.shift);
        if (rare) s.board[s.board.indexOf(null)] = rare; s.issued = 0; this.history = [];
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
        if (isAssembly(b[a.from]) || isGift(b[a.from])) return this.act({ type: 'disassemble', cell: a.from });
        const x = b[a.from]; if (!isItem(x)) return fail('Вернуть можно только запчасть.');
        if (isRarePart(x)) return fail('Редкая плата хранится на столе. Она заменяет деталь уровня 4 в рецепте вездехода.');
        this.remember(); b[a.from] = null; s.moves++; return ok('Освободили клетку. Снежинки за запчасть не возвращаются.');
      }
      if (a.type === 'chooseGift') {
        const L = findOrder(s, a.orderId), data = C.CHOICE_LETTERS.find(p => p.id === L?.choice);
        if (!data?.options.includes(a.level) || L.retry || L.packed[0]) return fail('Сначала освободи место в посылке, чтобы изменить выбор.');
        this.remember(); L.want[0] = item('tech', a.level); L.chosen = true;
        return ok('Выбран подарок: ' + giftName(L.want[0]) + '.');
      }
      if (a.type === 'villageExtra') {
        const L = findOrder(s, a.orderId);
        if (L?.special !== 'village' || L.retry || L.packed[2]) return fail('Сначала разбери упакованный третий подарок.');
        this.remember();
        if (L.want.length === 3) { L.want.pop(); L.packed.pop(); }
        else { L.want.push(item('tech', C.SPECIAL_LETTERS.find(p => p.id === 'village').optional)); L.packed.push(false); }
        return ok(L.want.length === 3 ? 'Добавили место для третьего подарка и бонуса +1 ♡.' : 'Подготовим два подарка для деревни.');
      }
      if (a.type === 'packGift') {
        const L = findOrder(s, a.orderId), i = a.giftIndex, g = L?.want[i];
        if (!L?.special || !g || L.packed[i]) return fail('В этой посылке нет свободного места для такого подарка.');
        const cell = b.findIndex(x => isGift(x) && key(x.gift) === key(g));
        const store = s.giftStore.findIndex(x => key(x) === key(g));
        if (cell < 0 && store < 0) return fail('Сначала собери подарок.');
        this.remember();
        const gift = cell >= 0 ? b[cell].gift : s.giftStore[store];
        if (cell >= 0) b[cell] = null; else s.giftStore.splice(store, 1);
        if (gift.rare) (L.rarePacked ||= []).push(i);
        L.packed[i] = true; s.moves++;
        return ok(giftName(g) + ' упакован. Место на столе свободно.');
      }
      if (a.type === 'craft') {
        const L = findOrder(s, a.orderId), useRare = a.useRare === true;
        if (!L || !canCraft(s, L.id, a.giftIndex, useRare)) return fail('Нужен полный комплект запчастей точных уровней.');
        this.remember();
        for (const i of craftSlots(s, L.want[a.giftIndex], useRare)) b[i] = null;
        if (useRare) (L.rarePacked ||= []).push(a.giftIndex);
        L.packed[a.giftIndex] = true; s.moves++;
        return ok(giftName(L.want[a.giftIndex]) + ' собран и лежит на упаковочной полке письма.');
      }
      if (a.type === 'disassemble') {
        const L = findOrder(s, a.orderId);
        const packed = L && L.packed[a.giftIndex], stored = Number.isInteger(a.storeIndex) ? s.giftStore[a.storeIndex] : null;
        const x = b[a.cell], gift = packed ? L.want[a.giftIndex] : stored || (isGift(x) ? x.gift : null);
        if (!gift && !isAssembly(x)) return fail('Выбери подарок или незавершённую сборку.');
        const chain = gift ? gift.chain : x.assembly.chain;
        const levels = gift ? RECIPES[gift.level - 1] : x.assembly.parts;
        const empty = b.flatMap((p, i) => p === null ? [i] : []);
        const slots = packed || stored ? empty : [a.cell, ...empty];
        if (slots.length < levels.length) return fail('Для всех деталей нужно ' + levels.length + ' клеток. Освободи ещё ' + (levels.length - slots.length) + '. Подарок сохранён.');
        this.remember();
        const rareUsed = gift?.rare || (packed && L.rarePacked?.includes(a.giftIndex));
        if (packed) {
          L.packed[a.giftIndex] = false;
          if (rareUsed) L.rarePacked = L.rarePacked.filter(i => i !== a.giftIndex);
        }
        if (stored) s.giftStore.splice(a.storeIndex, 1);
        levels.forEach((level, i) => { b[slots[i]] = rareUsed && level === C.RARE_PART.level ? clone(C.RARE_PART) : item(chain, level); }); s.moves++;
        return ok('Все детали возвращены на поле по рецепту.', packed || stored ? slots[0] : a.cell);
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
          const gift = cell >= 0 ? b[cell].gift : s.giftStore.splice(s.giftStore.findIndex(x => key(x) === key(g)), 1)[0];
          if (cell >= 0) b[cell] = null;
          if (gift.rare) (L.rarePacked ||= []).push(i);
          L.packed[i] = true;
        });
        const chance = rates(s), roll = L.retry || L.protected ? 0 : this.roll();
        const success = Math.round((1 - chance.lost - chance.damaged) * 100) / 100;
        const outcome = roll < success ? 'success' : roll < success + chance.lost ? 'lost' : 'damaged';
        s.mail.push({ id: s.nextMailId++, order: clone(L), attempt: L.retry ? 2 : 1, rewardThanks: orderThanks(L), outcome, bonusEnergy: outcome === 'success' && this.roll() < .2 ? 1 : 0, dueAt: this.now() + MAIL_MS / s.speed, claimed: false, shift: s.shift });
        const normal = s.letters.findIndex(x => x.id === L.id);
        if (normal >= 0) s.letters[normal] = newLetter(s, false, L.difficulty); else s.extra.splice(s.extra.findIndex(x => x.id === L.id), 1);
        offerSpecial(s);
        s.moves++;
        return ok('Посылка для ' + L.who + ' в пути. Сердечко придёт только с успешным ответом.');
      }
      if (a.type === 'claim') {
        const m = s.mail.find(m => m.id === a.mailId);
        if (!m || m.claimed || m.dueAt > this.now()) return fail('Ответ пока не пришёл или уже открыт.');
        this.remember(); m.claimed = true;
        if (m.outcome === 'success') {
          offerSpecial(s);
          s.thanks += m.rewardThanks; const overflow = m.bonusEnergy && s.energy === MAX_ENERGY;
          if (m.bonusEnergy) {
            if (s.energy < MAX_ENERGY) { s.energy++; if (s.energy === MAX_ENERGY) s.energyAt = this.now(); }
            else s.bag.push({ id: s.nextToolId++, kind: 'energy', name: 'Снежинка из письма', amount: 1 });
          }
          return ok('Ответ: «Спасибо за подарок!» +' + m.rewardThanks + ' ♡.' + (m.bonusEnergy ? ' +1 ❄' + (overflow ? ' · сохранена в находках.' : '') : ''));
        }
        if (m.outcome === 'damaged') { offerSpecial(s); return ok('Подарок повредился в дороге. За эту посылку нет сердечка. Новые письма продолжают приходить.'); }
        const retry = clone(m.order); retry.retry = true; retry.protected = false; retry.packed = retry.want.map(() => false); delete retry.rarePacked;
        s.extra.push(retry);
        return ok('Посылка потерялась. Повторный заказ добавлен под письмами; он гарантированно дойдёт.');
      }
      if (a.type === 'melt') {
        const x = b[a.cell]; if (!x?.snow) return fail('Здесь нет снега.');
        if (!accessible(s, a.cell)) return fail('Сначала расчисти соседнюю клетку. Добираемся от открытого стола по четырём сторонам.');
        const cost = SNOW[x.snow].cost; if (s.thanks < cost) return fail('Нужно ' + cost + ' ♡. Отправляй подарки и открывай успешные ответные письма.');
        this.remember(); s.thanks -= cost; b[a.cell] = null; s.cleared.push({ shift: s.shift, cell: a.cell }); s.moves++;
        const loot = cacheAt(s.shift, a.cell);
        if (loot?.kind === 'rare') {
          b[a.cell] = clone(C.RARE_PART);
          return ok('Нашли морозостойкую плату! Она заменяет деталь уровня 4 в рецепте вездехода.', a.cell);
        }
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
      if (a.type === 'energyGift') {
        const gift = ENERGY_GIFTS.find(g => g.threshold === a.threshold);
        if (!gift || completedLetters(s) < gift.threshold || s.energyGiftClaims.includes(gift.threshold)) return fail('Подарок пока не готов или уже получен.');
        this.remember(); s.energyGiftClaims.push(gift.threshold);
        const gain = Math.min(MAX_ENERGY - s.energy, gift.amount), remaining = gift.amount - gain;
        s.energy += gain; if (s.energy === MAX_ENERGY) s.energyAt = this.now();
        if (remaining) s.bag.push({ id: s.nextToolId++, kind: 'energy', name: gift.name, amount: remaining });
        return ok(gift.name + ': ' + gift.amount + ' снежинок.' + (remaining ? ' Остаток сохранён в находках.' : ''));
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
        if (i < 0 || !isItem(x) || isRarePart(x) || x.level === 1) return fail('Выбери запчасть уровня 2 или выше и найденные ножницы.');
        if (empty < 0) return fail('Для двух половинок нужна ещё одна свободная клетка. Ножницы не потрачены.');
        this.remember(); b[a.cell] = item(x.chain, x.level - 1); b[empty] = item(x.chain, x.level - 1); s.bag.splice(i, 1); s.moves++;
        return ok('Разделили запчасть на две предыдущего уровня.', a.cell);
      }
      if (a.type !== 'drop') return fail('Неизвестное действие.');
      const { from, to } = a; if (![from, to].every(i => Number.isInteger(i) && i >= 0 && i < 63) || from === to) return fail('Выбери другую клетку.');
      const x = b[from], y = b[to]; if (!isMovable(x)) return fail('Передвигать можно запчасти, сборки и подарки.');
      if (y?.gen) {
        if (isGift(x)) return fail('Выбери подарок и нажми «Разобрать» под столом.');
        const chain = isItem(x) ? x.chain : x.assembly.chain;
        return y.gen === chain ? this.act({ type: 'return', from }) : fail('У этой детали другой генератор.');
      }
      if (y?.snow || y?.blocked) return fail('Сначала расчисти снег за спасибо.');
      if (isItem(x) && isItem(y) && !isRarePart(x) && !isRarePart(y) && key(x) === key(y)) {
        if (x.level === 8) return fail('Это максимальный уровень запчасти. Её используют в рецепте.');
        const need = orderList(s).filter(L => !L.choice || L.chosen).flatMap(L => L.want.flatMap((g, n) => L.packed[n] ? [] : recipe(g))).filter(p => key(p) === key(x)).length;
        if (!a.force && need && count(s)[key(x)] - 2 < need) return { ok: false, warning: true, text: label(x) + ' нужен в рецепте.' };
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
  const api = { ...C, VERSION, MAX_ENERGY, REGEN_MS, MAIL_MS, Game, fresh, validate, migrate, isItem, isRarePart, rareFits, isGift, isAssembly, isMovable, cellName, combine, countGifts, ORDER_TIERS, ENERGY_GIFTS, completedLetters, giftThanks, orderThanks, label, giftName, key, recipe, count, canCraft, canSend, findOrder, orderList, neighbors, accessible, parts, complete, cacheAt, isCleared, rates };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PostGame = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
