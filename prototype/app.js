(function () {
  'use strict';
  const E = window.PostGame, $ = id => document.getElementById(id), KEY = 'pochta-workshops-v24';
  let saved, loadMessage = '', storageFailed = false;
  try {
    const raw = localStorage.getItem(KEY), old = raw ? null : localStorage.getItem('pochta-workshops-v23') || localStorage.getItem('pochta-workshops-v22') || localStorage.getItem('pochta-workshops-v21') || localStorage.getItem('pochta-workshops-v20') || localStorage.getItem('pochta-workshops-v12') || localStorage.getItem('pochta-workshops-v10') || localStorage.getItem('pochta-workshops-v9') || localStorage.getItem('pochta-workshops-v8');
    if (raw || old) {
      const parsed = JSON.parse(raw || old); saved = E.migrate(parsed);
      if (!saved) { saved = undefined; loadMessage = 'Сохранение не удалось прочитать. Начинаем заново.'; }
      else if (old && [21, 22, 23].includes(parsed.version)) loadMessage = 'Прогресс перенесён. Новые письма теперь приезжают справа.';
      else if (old) loadMessage = 'Прогресс перенесён. Теперь на верёвке три вида просьб. Прежние письма и упакованные подарки сохранены в дополнительных.';
    }
  }
  catch (_) { loadMessage = 'Хранилище недоступно: прогресс может не сохраниться.'; }
  let game = new E.Game(saved), selected = null, snowSelection = null, pending = null, currentOrder = null, currentMail = null;
  let drag = null, ghost = null, lastPointerClick = 0, mailFingerprint = '', activeProduction = null;
  const node = (tag, cls, text) => { const x = document.createElement(tag); if (cls) x.className = cls; if (text !== undefined) x.textContent = text; return x; };
  const ART = {
    generator: '../art/tech/sprites/generator.webp',
    'part-4': '../art/tech/sprites/part-4.webp',
    'part-5': '../art/tech/sprites/part-5.webp',
    'part-6': '../art/tech/sprites/part-6.webp',
    'part-7': '../art/tech/sprites/part-7.webp',
    'part-8': '../art/tech/sprites/part-8.webp',
    'gift-4': '../art/tech/sprites/gift-4.webp',
    'gift-5': '../art/tech/sprites/gift-5.webp',
    'gift-6': '../art/tech/sprites/gift-6.webp',
    'gift-7': '../art/tech/sprites/gift-7.webp',
    'gift-8': '../art/tech/sprites/gift-8.webp',
    'part-1': '../art/tech/sprites/part-1.webp',
    'part-2': '../art/tech/sprites/part-2.webp',
    'part-3': '../art/tech/sprites/part-3.webp',
    'gift-1': '../art/tech/sprites/gift-1.webp',
    'gift-2': '../art/tech/sprites/gift-2.webp',
    'gift-3': '../art/tech/sprites/gift-3.webp'
  };
  const SEW_ART = {
    'generator': '../art/sewing/sprites/generator.webp',
    'part-1': '../art/sewing/sprites/part-1.webp',
    'part-2': '../art/sewing/sprites/part-2.webp',
    'part-3': '../art/sewing/sprites/part-3.webp',
    'gift-1': '../art/sewing/sprites/gift-1.webp',
    'gift-2': '../art/sewing/sprites/gift-2.webp',
    'gift-3': '../art/sewing/sprites/gift-3.webp',
    'gift-4': '../art/sewing/sprites/gift-4.webp'
  };
  const SNOW_ART = {
    1: '../art/snow/loose.webp',
    2: '../art/snow/packed.webp',
    3: '../art/snow/ice.webp'
  };
  const FIND_ART = {
    "Мешочек снежинок": "../art/finds/snowbag.webp",
    "Термос Снегурочки": "../art/finds/thermos.webp",
    "Волшебные ножницы": "../art/finds/scissors.webp",
    "Бирка надёжной доставки": "../art/finds/tag.webp",
    "Открытка снеговика": "../art/finds/postcard.webp",
    "Старая открытка почты": "../art/finds/postcard.webp",
    "Письмо из сугроба": "../art/finds/letter.webp",
    "Морозостойкая плата": "../art/finds/rare.webp",
    "Фонарик": "../art/finds/lantern.webp",
    "Ёлочка в горшке": "../art/finds/fir.webp",
    "Уютный коврик": "../art/finds/rug.webp",
    "Гирлянда": "../art/finds/garland.webp",
    "Станина": "../art/finds/sew-base.webp",
    "Маховик": "../art/finds/sew-wheel.webp",
    "Привод": "../art/finds/sew-drive.webp",
    "Игольный механизм": "../art/finds/sew-needle.webp",
    "Основание стола": "../art/finds/art-base.webp",
    "Держатель бумаги": "../art/finds/art-paper.webp",
    "Карусель красок": "../art/finds/art-paints.webp",
    "Волшебный упаковщик": "../art/finds/art-wrapper.webp",
    "Рабочая рама": "../art/finds/pack-frame.webp",
    "Рулонный механизм": "../art/finds/pack-rollers.webp",
    "Мягкая подкладка": "../art/finds/pack-mat.webp",
    "Волшебный запечатыватель": "../art/finds/pack-sealer.webp"
  };
  function findIcon(name) {
    const src = FIND_ART[name];
    if (!src) return node('span', 'find-art', '✦');
    const img = node('img', 'find-art');
    img.src = src;
    img.alt = '';
    img.width = img.height = 128;
    img.setAttribute('aria-hidden', 'true');
    img.setAttribute('draggable', 'false');
    return img;
  }
  function snowIcon(type) {
    const wrap = node('span', 'snow-art');
    const img = node('img', 'item-art'); img.src = SNOW_ART[type]; img.alt = ''; img.width = 128; img.height = 128;
    img.setAttribute('aria-hidden', 'true'); img.setAttribute('draggable', 'false');
    img.addEventListener('error', () => { wrap.textContent = type === 3 ? '🧊' : '☁'; });
    wrap.append(img); return wrap;
  }
  function showClearEffect(cell, type) {
    const target = $('board').querySelector('[data-cell="' + cell + '"]');
    if (!target) return;
    const effect = node('span', 'clear-effect'); effect.setAttribute('aria-hidden', 'true');
    effect.append(snowIcon(type), node('span', 'clear-sparkles', '✦ · ✧'));
    effect.addEventListener('animationend', e => { if (e.target === effect) effect.remove(); });
    target.append(effect);
  }
  function spriteIcon(kind, chain, level, fallback) {
    const wrap = node('span', 'game-icon');
    const assets = chain === 'tech' ? ART : chain === 'sew' ? SEW_ART : {};
    const src = assets[kind === 'generator' ? kind : kind + '-' + level];
    if (!src) { wrap.textContent = fallback; return wrap; }
    wrap.classList.add('has-art');
    const img = node('img', 'item-art'); img.src = src; img.alt = ''; img.width = 128; img.height = 128;
    img.setAttribute('aria-hidden', 'true'); img.setAttribute('draggable', 'false');
    img.addEventListener('error', () => { wrap.classList.remove('has-art'); wrap.textContent = fallback; });
    wrap.append(img); return wrap;
  }
  function giftLabel(tag, cls, g, text) {
    const row = node(tag, cls, text);
    row.prepend(spriteIcon('gift', g.chain, g.level, E.CHAINS[g.chain].icons[g.level - 1]));
    return row;
  }
  function button(text, fn, cls = '') { const b = node('button', cls, text); b.addEventListener('click', fn); return b; }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(game.state)); storageFailed = false; } catch (_) { storageFailed = true; }
    $('save-status').textContent = storageFailed ? 'Не удалось сохранить. Не закрывай страницу, если хочешь продолжить.' : 'Прогресс автоматически сохраняется в этом браузере';
  }
  function tip(text, warn = false) { $('tip').textContent = text; $('tip').parentElement.classList.toggle('warning', warn); }
  function intro() {
    return game.state.mail.length ? 'Собирай подарки, жди ответов и расчищай путь за сердечки. Последняя часть мастерской — под дальним льдом.' : 'Открой рецепт письма. Одинаковые детали сливаются в старшую; разные детали по рецепту превращаются в подарок прямо на поле. Сборка в окне рецепта тоже работает.';
  }
  const boardCell = index => $('board').querySelector('[data-cell="' + index + '"]');
  function clearPending(restoreFocus = false) {
    if (!pending) return;
    const target = boardCell(pending.to);
    for (const index of [pending.from, pending.to]) boardCell(index)?.classList.remove('merge-pending');
    pending = null;
    $('merge-confirmation').hidden = true;
    if (restoreFocus) target?.focus({ preventScroll: true });
  }
  function positionMergeConfirmation() {
    if (!pending) return;
    const cell = boardCell(pending.to);
    if (!cell) { clearPending(); return; }
    const anchor = cell.getBoundingClientRect(), panel = $('merge-confirmation');
    if (anchor.bottom < 0 || anchor.top > window.innerHeight) { clearPending(); return; }
    const box = panel.getBoundingClientRect(), gap = 8;
    const left = Math.max(gap, Math.min(anchor.left + (anchor.width - box.width) / 2, window.innerWidth - box.width - gap));
    const preferredTop = anchor.top >= box.height + gap * 2 ? anchor.top - box.height - gap : anchor.bottom + gap;
    const top = Math.max(gap, Math.min(preferredTop, window.innerHeight - box.height - gap));
    panel.style.left = left + 'px';
    panel.style.top = top + 'px';
  }
  function snapshotEnvelopes() {
    return new Map(Array.from($('letters').children, card => [card.dataset.envelope, {
      card, rect: card.getBoundingClientRect()
    }]));
  }
  function animateEnvelopes(before, sentId) {
    const sent = before.get(String(sentId));
    if (!sent || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || !sent.card.animate) return;
    const flying = sent.card.cloneNode(true);
    flying.classList.add('envelope-flight');
    flying.setAttribute('aria-hidden', 'true');
    flying.inert = true;
    Object.assign(flying.style, {
      left: sent.rect.left + 'px', top: sent.rect.top + 'px',
      width: sent.rect.width + 'px', height: sent.rect.height + 'px'
    });
    document.body.append(flying);
    const flight = flying.animate([
      { translate: '0 0', opacity: 1 },
      { translate: '-90px -105px', rotate: '-14deg', scale: .75, opacity: 0 }
    ], { duration: 420, easing: 'ease-in' });
    flight.onfinish = flight.oncancel = () => flying.remove();

    for (const card of $('letters').children) {
      const old = before.get(card.dataset.envelope);
      const rect = card.getBoundingClientRect();
      const offset = old ? old.rect.left - rect.left : rect.width * .85;
      if (old && Math.abs(offset) < 1) continue;
      card.animate([
        { translate: offset + 'px 0', opacity: old ? 1 : 0 },
        { translate: '0 0', opacity: 1 }
      ], { duration: 370, delay: old ? 85 : 135, easing: 'ease-out', fill: 'backwards' });
    }
  }
  function execute(a) {
    const oldEnvelopes = a.type === 'send' ? snapshotEnvelopes() : null;
    const clearedType = a.type === 'melt' ? game.state.board[a.cell]?.snow : null;
    clearPending(); const r = a.type === 'undo' ? game.undo() : game.act(a);
    if (r.warning) {
      pending = a;
      selected = null;
      $('merge-message').textContent = r.text;
      $('merge-confirmation').hidden = false;
      render();
      $('cancel-merge').focus({ preventScroll: true });
      return false;
    }
    if (!r.ok) { tip(r.text, true); return false; }
    selected = null; snowSelection = null; save(); render(r.pop); tip(r.text);
    if (oldEnvelopes) animateEnvelopes(oldEnvelopes, a.orderId);
    if (clearedType) {
      showClearEffect(a.cell, clearedType);
      if (game.state.board[a.cell]?.find) {
        const found = boardCell(a.cell);
        found?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        found?.focus({ preventScroll: true });
      }
    }
    return true;
  }
  function partChip(p, available = false) {
    const x = node('span', 'part-chip' + (available ? ' available' : ''), String(p.level));
    x.prepend(spriteIcon('part', p.chain, p.level, E.CHAINS[p.chain].icon));
    x.style.setProperty('--part-color', E.CHAINS[p.chain].color); x.title = E.label(p); x.setAttribute('aria-label', E.label(p) + ', уровень ' + p.level + (available ? ': готово' : '')); return x;
  }
  const tierLabel = L => ({easy:'Простая', medium:'Средняя', hard:'Сложная', legacy:'Прежняя', found:'Найденная'}[L.difficulty] || 'Просьба');
  const orderMark = L => L.choice ? 'Подбери подарок' : L.special ? 'Особая посылка' : '';
  const specialTitle = L => L.special === 'twins' ? 'Подарки близнецам' : 'Посылка в далёкую деревню';
  function renderLetter(L, pinned = false) {
    if (pinned) {
      const ready = E.canSend(game.state, L.id);
      const card = node('article', 'pinned-letter' + (ready ? ' gift-ready' : '') + (L.special ? ' pinned-special' : ''));
      card.dataset.envelope = String(L.id);
      const open = button('', () => showRecipe(L.id), 'envelope-open'); open.dataset.order = L.id;
      open.setAttribute('aria-label', 'Письмо: ' + L.who + '. ' + (orderMark(L) || L.want.map(E.giftName).join(', ')) + (ready ? '. Подарки готовы к отправке.' : '. Открыть просьбу и рецепт.'));
      open.append(node('small', 'envelope-tier ' + (L.choice ? 'choice-mark' : L.special ? 'special-mark' : L.difficulty), orderMark(L) || tierLabel(L)), node('span', 'envelope-sender', L.who.split(',')[0]));
      const gifts = node('span', 'envelope-gifts');
      if (L.choice && !L.chosen) gifts.append(node('span', 'choice-symbol', '?'));
      else L.want.forEach(g => gifts.append(spriteIcon('gift', g.chain, g.level, E.CHAINS[g.chain].icons[g.level - 1])));
      open.append(gifts, node('span', 'envelope-status', (ready ? '✓ Отправить' : 'Прочитать') + (L.choice && !L.chosen ? '' : ' · ' + E.orderThanks(L) + ' ♡')));
      card.append(open); return card;
    }
    const card = node('article', 'letter' + (L.retry ? ' retry' : ''));
    if (orderMark(L)) card.append(node('strong', 'order-mark', orderMark(L)));
    card.append(node('h3', '', L.who), node('small', 'letter-kind', L.retry ? 'Повторная · точно дойдёт' : L.side ? 'Письмо из сугроба' : tierLabel(L) + ' просьба'));
    const wants = node('div', 'gift-list');
    const availableGifts = E.countGifts(game.state);
    L.want.forEach((g, n) => {
      const onTable = !L.packed[n] && (availableGifts[E.key(g)] || 0) > 0;
      if (onTable) availableGifts[E.key(g)]--;
      const text = giftLabel('p', L.packed[n] || onTable ? 'packed-label' : '', g, (L.packed[n] || onTable ? '✓ ' : '') + E.giftName(g)); wants.append(text);
    });
    card.append(wants, node('small', 'letter-reward', E.orderThanks(L) + ' ♡ с успешным ответом'));
    const ready = E.canSend(game.state, L.id), craftable = L.want.some((_, n) => E.canCraft(game.state, L.id, n));
    const b = button(ready ? 'Отправить' : craftable ? 'Собрать подарок' : 'Рецепт', () => ready ? execute({ type: 'send', orderId: L.id }) : showRecipe(L.id), ready || craftable ? 'ready' : '');
    b.dataset.order = L.id; card.append(b);
    if (ready) card.append(button('Рецепт и упаковка', () => showRecipe(L.id), 'packing-link'));
    return card;
  }
  function renderEnergyGifts() {
    const s = game.state, done = E.completedLetters(s), fragment = document.createDocumentFragment();
    E.ENERGY_GIFTS.forEach(g => {
      const claimed = s.energyGiftClaims.includes(g.threshold), ready = done >= g.threshold && !claimed;
      const box = node('div', 'energy-gift' + (ready ? ' ready' : ''));
      box.append(node('strong', '', (g.threshold === 5 ? '☃ ' : '🫖 ') + g.name), node('small', '', Math.min(done, g.threshold) + ' / ' + g.threshold + ' успешных писем'));
      const b = button(claimed ? '✓ Получен' : ready ? 'Забрать ' + g.amount + ' ❄' : '+' + g.amount + ' ❄', () => execute({type:'energyGift', threshold:g.threshold}));
      b.disabled = !ready; box.append(b); fragment.append(box);
    });
    $('energy-gifts').replaceChildren(fragment);
  }
  function updateEnergy() {
    const s = game.state;
    $('energy').textContent = s.energy + ' / ' + E.MAX_ENERGY;
    $('energy-timer').textContent = s.energy < E.MAX_ENERGY ? '+1 через ' + game.energySeconds() + ' с' : 'полный запас';
    $('thanks').textContent = s.thanks;
    $('speed').textContent = 'Быстрый тест ×10: ' + (s.speed === 10 ? 'включён · ожидание ускорено' : 'выключен');
  }
  function updateMailbox(force = false) {
    const s = game.state, now = Date.now(), unclaimed = s.mail.filter(m => !m.claimed);
    const ready = unclaimed.filter(m => m.dueAt <= now), pendingMail = unclaimed.filter(m => m.dueAt > now);
    $('mail-summary').textContent = !s.mail.length ? 'Отправь первую посылку. Ответ придёт через ' + (E.MAIL_MS / s.speed / 1000) + ' с.' : 'В пути: ' + pendingMail.length + ' · ответов ждут открытия: ' + ready.length;
    const chance = E.rates(s);
    $('delivery-rates').textContent = 'Потеря ' + Math.round(chance.lost * 100) + '% · повреждение ' + Math.round(chance.damaged * 100) + '%';
    const fingerprint = JSON.stringify(unclaimed.map(m => [m.id, m.dueAt <= now ? 'ready' : Math.ceil((m.dueAt - now) / 1000)]));
    if (!force && fingerprint === mailFingerprint) return;
    mailFingerprint = fingerprint;
    const focusMail = document.activeElement?.dataset?.mail, list = document.createDocumentFragment();
    for (const m of [...ready.slice(0, 4), ...pendingMail.slice(0, 2)]) {
      const row = node('div', 'mail-row');
      row.append(node('span', '', '✉ ' + m.order.who + (m.attempt === 2 ? ' · повторная' : '')));
      if (m.dueAt <= now) { const b = button('Открыть ответ', () => showReply(m.id), 'primary'); b.dataset.mail = m.id; row.append(b); }
      else row.append(node('small', '', 'Ответ через ' + Math.max(1, Math.ceil((m.dueAt - now) / 1000)) + ' с'));
      list.append(row);
    }
    if (ready.length > 4 || pendingMail.length > 2) list.append(button('Все посылки и ответы →', showAlbum));
    $('mail-list').replaceChildren(list);
    if (focusMail) $('mail-list').querySelector('[data-mail="' + focusMail + '"]')?.focus({ preventScroll: true });
  }
  function renderRoom(s) {
    // Derive appearance from existing progress: reload and undo need no new save fields.
    const cleared = s.cleared.length, built = s.built.length;
    const fixed = cleared >= 6 || built >= 1, warm = cleared >= 12 || built >= 1;
    const milestones = [
      [fixed, 'Окно починено', 'Починить окно: расчистить ещё ' + Math.max(0, 6 - cleared) + ' клеток.'],
      [warm, 'Печь затоплена', 'Затопить печь: расчистить ещё ' + Math.max(0, 12 - cleared) + ' клеток или собрать швейную мастерскую.'],
      [built >= 1, 'Полки обжиты', 'Заполнить полки: собрать швейную мастерскую.'],
      [built >= 2, 'Посылки наготове', 'Обустроить уголок посылок: собрать студию творчества.'],
      [built >= 3, 'Почта восстановлена', 'Украсить вывеску: собрать упаковочную станцию.']
    ];
    const scene = $('room-scene');
    scene.classList.toggle('window-fixed', fixed); scene.classList.toggle('stove-warm', warm);
    scene.classList.toggle('shelves-filled', built >= 1); scene.classList.toggle('parcels-ready', built >= 2);
    scene.classList.toggle('post-restored', built >= 3);
    const completed = milestones.filter(([done]) => done).length;
    $('room-state').textContent = completed ? milestones.filter(([done]) => done).map(([, title]) => title).join(' · ') : 'Холодное окно, пустые полки. Пока греет только лампа.';
    $('room-progress').textContent = 'Уют мастерской · ' + completed + ' / 5';
    $('room-next').textContent = milestones.find(([done]) => !done)?.[2] || 'На почте тепло и всё готово к новым письмам.';
    const shelf = document.createDocumentFragment();
    if (built >= 1) {
      shelf.append(spriteIcon('gift', 'tech', 1, '🚗'), spriteIcon('generator', 'sew', 1, '🧵'), node('span', 'shelf-basket', '🧺'));
    }
    $('room-shelf-items').replaceChildren(shelf);
    const decorations = document.createDocumentFragment();
    // One visible decoration per kind; finds across shifts remain listed in the bag/album.
    const placed = new Set();
    const positions = { 'Фонарик': 'scene-lantern', 'Ёлочка в горшке': 'scene-plant', 'Уютный коврик': 'scene-rug', 'Гирлянда': 'scene-garland' };
    s.decor.forEach(d => {
      if (placed.has(d.name)) return;
      placed.add(d.name);
      const x = node('span', positions[d.name] || 'scene-trinket', d.icon); x.title = d.name;
      decorations.append(x);
    });
    $('room-placed-decor').replaceChildren(decorations);
    const decor = document.createDocumentFragment();
    s.decor.forEach(d => { const x = node('span', '', d.icon); x.title = d.name; x.setAttribute('aria-label', d.name); decor.append(x); });
    $('room-decor').replaceChildren(decor); $('room-decor').hidden = !s.decor.length;
  }
  function render(popAt) {
    const s = game.state, def = E.SHIFTS[s.shift], oldFocus = document.activeElement;
    const focusCell = oldFocus?.dataset?.cell, focusOrder = oldFocus?.dataset?.order;
    $('shift-number').textContent = 'МАСТЕРСКАЯ ' + (s.shift + 1) + ' ИЗ 3'; $('shift-title').textContent = def.title;
    $('progress').textContent = 'Отправлено: ' + s.mail.filter(m => m.shift === s.shift).length;
    $('album-count').textContent = s.mail.filter(m => m.claimed).length;
    updateEnergy(); updateMailbox(true); renderEnergyGifts();
    const parts = E.parts(s), project = document.createDocumentFragment();
    $('goal-title').textContent = def.goal;
    parts.forEach(p => { const chip = node('span', 'project-part' + (p.found ? ' found' : ''), (p.found ? '✓ ' : '○ ') + p.name); chip.title = p.found ? 'Найдено' : 'Под снегом ' + E.coord(p.cell) + ' · ' + E.SNOW[p.snow].cost + ' ♡'; project.append(chip); });
    $('goal-parts').replaceChildren(project); $('goal-progress').textContent = parts.filter(p => p.found).length + ' / 4';
    $('letters').replaceChildren(...E.visibleLetters(s).map(L => renderLetter(L, true)));
    $('extra-panel').hidden = !s.extra.length;
    $('extra-summary').textContent = 'Дополнительные и повторные письма · ' + s.extra.length;
    $('extra-letters').replaceChildren(...s.extra.map(L => renderLetter(L)));
    renderRoom(s);
    const wanted = {};
    [...E.visibleLetters(s), ...s.extra].forEach(L => L.want.forEach((g, n) => { if (!L.packed[n] && (!L.choice || L.chosen)) E.recipe(g).forEach(p => { wanted[E.key(p)] = true; }); }));
    const stations = document.createDocumentFragment();
    const sources = Object.entries(def.generators);
    if (!sources.some(([, chain]) => chain === activeProduction)) activeProduction = sources[0][1];
    const choices = document.createDocumentFragment();
    sources.forEach(([, chain]) => { const option = node('option', '', E.CHAINS[chain].name); option.value = chain; choices.append(option); });
    $('production-select').replaceChildren(choices); $('production-select').value = activeProduction;
    $('production-choice').hidden = sources.length === 1;
    sources.filter(([, chain]) => chain === activeProduction).forEach(([position, chain]) => {
      const from = E.at(position), data = E.CHAINS[chain];
      const station = button('', () => activate(from), 'generator-station');
      station.dataset.cell = from;
      station.setAttribute('aria-label', 'Ящик: ' + data.name + '. Создать запчасть за одну снежинку.');
      station.title = data.name + ' · создать деталь за 1 ❄';
      station.append(spriteIcon('generator', 'tech', 1, '🧰')); stations.append(station);
    });
    $('generators').replaceChildren(stations);
    const cells = document.createDocumentFragment();
    s.board.forEach((x, i) => {
      const el = node('button', 'cell'); el.dataset.cell = i;
      if (i >= 7) {
        const row = Math.floor(i / 7) - 1;
        el.style.setProperty('--table-row', row); el.style.setProperty('--table-column', i % 7);
        el.style.setProperty('--row-width', (85 + row * 15 / 7) + '%');
      }
      let title = E.coord(i) + ': пустая клетка', icon = '';
      if (x?.blocked) { el.classList.add('blocked'); el.disabled = true; title = E.coord(i) + ': недоступно'; }
      else if (x?.gen) {
        el.classList.add('gen'); icon = E.CHAINS[x.gen].generator;
        const bonus = s.unlocked[x.gen] >= 5 ? s.unlocked[x.gen] - 3 : 1;
        title = E.coord(i) + ': ' + E.CHAINS[x.gen].name + '. −1 снежинка. ' + (bonus > 1 ? '80% уровня 1, 20% уровня ' + bonus : 'Запчасть уровня 1');
        el.append(node('small', 'level', bonus > 1 ? '1 / ' + bonus : '−1❄'));
      } else if (x?.snow) {
        const loot = E.cacheAt(s.shift, i), reachable = E.accessible(s, i);
        el.classList.add('snow'); if (x.snow === 2) el.classList.add('double'); if (x.snow === 3) el.classList.add('ice'); if (!reachable) el.classList.add('distant'); else el.classList.add('snow-reachable');
        if (loot?.required) el.classList.add('part-cache');
        icon = loot?.required ? '⚙' : loot ? '🎁' : x.snow === 3 ? '🧊' : '☁';
        title = E.coord(i) + ': ' + E.SNOW[x.snow].name + ', ' + E.SNOW[x.snow].cost + ' ♡.' + (reachable ? ' Можно расчистить.' : ' Сначала доберись по соседним клеткам.') + (loot?.required ? ' Часть мастерской.' : '');
        if (loot) el.append(node('small', 'snow-marker', loot.required ? '⚙' : '✦'));
        el.append(node('small', 'level', E.SNOW[x.snow].cost + '♡'));
      } else if (x?.find) {
        const loot = E.cacheAt(s.shift, i);
        el.classList.add('field-find');
        title = E.coord(i) + ': ' + loot.name + '. Нажми, чтобы забрать.';
        el.append(node('small', 'find-pickup', 'Взять'));
      } else if (E.isGift(x)) {
        el.classList.add('finished-gift'); icon = E.CHAINS[x.gift.chain].icons[x.gift.level - 1];
        title = E.coord(i) + ': готовый подарок — ' + E.giftName(x.gift) + '. Можно отправить по письму.';
        el.append(node('small', 'level', '🎁 ' + x.gift.level));
      } else if (E.isAssembly(x)) {
        el.classList.add('assembly-cell'); icon = '🛠';
        title = E.coord(i) + ': ' + E.cellName(x) + ', детали: ' + x.assembly.parts.join(', ') + '. Добавь оставшиеся детали.';
        el.append(node('small', 'assembly-count', x.assembly.parts.length + '/' + E.RECIPES[x.assembly.level - 1].length));
      } else if (E.isItem(x)) {
        el.classList.add('component'); el.style.setProperty('--part-color', E.CHAINS[x.chain].color);
        if (E.isRarePart(x)) el.classList.add('rare-part');
        icon = E.CHAINS[x.chain].icon; title = E.coord(i) + ': ' + E.label(x) + ', уровень ' + x.level;
        el.append(node('small', 'rank', x.level), node('small', 'part-letter', E.isRarePart(x) ? '✦' : { tech: 'Т', sew: 'Ш', art: 'Х' }[x.chain]));
        if (E.isRarePart(x)) title += ' · заменяет деталь уровня 4 в рецепте вездехода';
        if (wanted[E.key(x)] && !E.isRarePart(x)) el.classList.add('needed');
      }
      const display = x?.find ? findIcon(E.cacheAt(s.shift, i).name) : E.isRarePart(x) ? findIcon(E.RARE_NAME) : x?.snow ? snowIcon(x.snow) : x?.gen ? spriteIcon('generator', x.gen, 1, icon) : E.isGift(x) ? spriteIcon('gift', x.gift.chain, x.gift.level, icon) : E.isItem(x) ? spriteIcon('part', x.chain, x.level, icon) : node('span', '', icon);
      display.classList.add('icon'); el.prepend(display); el.title = title; el.setAttribute('aria-label', title); el.setAttribute('aria-pressed', String(selected === i || snowSelection === i));
      if (pending && (pending.from === i || pending.to === i)) el.classList.add('merge-pending');
      if (selected === i || snowSelection === i) el.classList.add('selected'); if (i === popAt) el.classList.add('pop'); cells.append(el);
    });
    $('board').replaceChildren(cells);
    positionMergeConfirmation();
    const legend = document.createDocumentFragment();
    Object.entries(E.SNOW).forEach(([type, data]) => {
      const entry = node('span', 'snow-key'); entry.append(snowIcon(Number(type)), node('span', '', data.name + ' · ' + data.cost + ' ♡')); legend.append(entry);
    });
    $('snow-legend').replaceChildren(legend);
    $('selection').textContent = selected !== null && E.isMovable(s.board[selected]) ? E.cellName(s.board[selected]) : 'Одинаковые детали → старшая · разные по рецепту → подарок';
    $('return').disabled = selected === null || E.isRarePart(s.board[selected]) || (!E.isItem(s.board[selected]) && !E.isAssembly(s.board[selected]) && !E.isGift(s.board[selected]));
    $('return').textContent = selected !== null && (E.isAssembly(s.board[selected]) || E.isGift(s.board[selected])) ? '↩ Разобрать' : '↩ Вернуть'; $('undo').disabled = !game.history.length;
    const snow = snowSelection === null ? null : s.board[snowSelection]; $('snow-panel').hidden = !snow?.snow;
    if (snow?.snow) {
      const loot = E.cacheAt(s.shift, snowSelection), type = E.SNOW[snow.snow], access = E.accessible(s, snowSelection);
      $('snow-preview').replaceChildren(snowIcon(snow.snow));
      $('snow-title').textContent = E.coord(snowSelection) + ' · ' + type.name;
      $('snow-description').textContent = loot?.required ? 'Под снегом ' + loot.name + '. Эта часть нужна для цели.' : loot ? 'Здесь спрятана полезная находка. Узнаем, что это, когда расчистим снег.' : 'Освободим клетку для запчастей.';
      $('melt').textContent = 'Расчистить · ' + type.cost + ' ♡'; $('melt').disabled = !access || s.thanks < type.cost;
      $('snow-balance').textContent = !access ? 'Сначала расчисти соседнюю клетку с открытой стороны.' : s.thanks < type.cost ? 'Не хватает ' + (type.cost - s.thanks) + ' ♡. Они приходят с успешными ответами.' : 'Останется ' + (s.thanks - type.cost) + ' ♡.';
    }
    renderBag(); renderCatalog();
    $('completion').hidden = !E.complete(s);
    const built = s.built.includes(s.shift);
    $('completion-title').textContent = built ? 'Мастерская работает!' : 'Можно собирать!';
    $('completion-text').textContent = !built ? 'Четыре части на месте. Соберём их — и откроем новое производство.' : s.shift < 2 ? 'Запчасти и незаконченные сборки уберём со стола. Готовые подарки с поля перенесём в запас; письма, посылки и ресурсы останутся.' : 'Упаковка надёжнее: повреждения 5%, потери 20%. Можно продолжить письма и исследовать оставшийся снег.';
    $('build').hidden = built; $('next').hidden = !built || s.shift === 2; $('next').textContent = 'Убрать стол · открыть ' + (s.shift === 0 ? 'швейную' : 'студию творчества');
    if ($('recipe-dialog').open) renderRecipe();
    if (focusCell !== undefined) ($('generators').querySelector('[data-cell="' + focusCell + '"]') || $('board').querySelector('[data-cell="' + focusCell + '"]'))?.focus({ preventScroll: true });
    if (focusOrder !== undefined) document.querySelector('[data-order="' + focusOrder + '"]')?.focus({ preventScroll: true });
  }
  function renderBag() {
    const s = game.state, items = document.createDocumentFragment(); $('bag-count').textContent = s.bag.length + s.giftStore.length;
    if (!s.bag.length && !s.giftStore.length) items.append(node('p', 'empty-note', 'Здесь будут мешочки снежинок, ножницы и защитные бирки из-под снега.'));
    s.giftStore.forEach((g, storeIndex) => {
      const row = node('div', 'bag-row'); row.append(giftLabel('span', 'packed-label', g, E.giftName(g)), button('Разобрать', () => execute({ type: 'disassemble', storeIndex }))); items.append(row);
    });
    const tagCount = s.bag.filter(t => t.kind === 'tag').length;
    if (tagCount) { const tags = node('p', 'find-label', 'Бирки: ' + tagCount + '. Прикрепляются к письму в окне рецепта.'); tags.prepend(findIcon('Бирка надёжной доставки')); items.append(tags); }
    s.bag.filter(t => t.kind !== 'tag').forEach(t => {
      const row = node('div', 'bag-row'); const label = node('span', 'find-label', t.name + (t.amount ? ' · ' + t.amount + ' ❄' : '')); if (FIND_ART[t.name]) label.prepend(findIcon(t.name)); row.append(label);
      const b = button(t.kind === 'energy' ? 'Взять' : 'Разделить выбранную', () => execute(t.kind === 'energy' ? { type: 'energy', toolId: t.id } : { type: 'split', toolId: t.id, cell: selected }));
      b.disabled = t.kind === 'energy' ? s.energy === E.MAX_ENERGY : selected === null || !E.isItem(s.board[selected]) || E.isRarePart(s.board[selected]) || s.board[selected].level < 2;
      row.append(b); items.append(row);
    });
    $('bag-items').replaceChildren(items);
  }
  function renderCatalog() {
    const s = game.state, catalog = document.createDocumentFragment();
    Object.values(E.SHIFTS[s.shift].generators).forEach(c => {
      const section = node('details', 'catalog-workshop');
      const title = node('summary', '', E.CHAINS[c].name + ' · заказы до ур. ' + s.unlocked[c]); title.prepend(spriteIcon('generator', c, 1, E.CHAINS[c].generator)); section.append(title);
      const p = node('p', '', s.unlocked[c] >= 5 ? 'Выдача: 80% уровня 1, 20% уровня ' + (s.unlocked[c] - 3) + '.' : 'Выдача: уровень 1. С заказами уровня 5 появится улучшенная выдача.'); section.append(p);
      E.CHAINS[c].names.forEach((name, i) => { const row = node('div', 'catalog-part'); row.append(partChip({ chain: c, level: i + 1 }), node('span', '', name)); section.append(row); });
      section.append(node('h3', '', 'Подарки и рецепты'));
      E.CHAINS[c].gifts.forEach((name, i) => { const row = node('div', 'catalog-gift'); row.append(giftLabel('b', '', {chain:c, level:i+1}, 'Ур. ' + (i + 1) + ' · ' + name), node('p', '', E.giftThanks({ level: i + 1 }) + ' ♡ за доставку · ' + E.RECIPES[i].map(l => ({ tech: 'Т', sew: 'Ш', art: 'Х' }[c]) + l).join(' + '))); section.append(row); });
      catalog.append(section);
    }); $('catalog').replaceChildren(catalog);
  }
  function showRecipe(id) { currentOrder = id; renderRecipe(); if (E.findOrder(game.state, id) && !$('recipe-dialog').open) $('recipe-dialog').showModal(); }
  function renderRecipe() {
    const s = game.state, L = E.findOrder(s, currentOrder);
    if (!L) { if ($('recipe-dialog').open) $('recipe-dialog').close(); return; }
    $('recipe-title').textContent = L.special ? specialTitle(L) + ' · ' + orderMark(L) : L.who + ' · ' + (orderMark(L) || (L.retry ? 'повторная посылка' : tierLabel(L).toLowerCase() + ' просьба'));
    $('recipe-story').textContent = '«' + L.text + '»' + (L.choice && !L.chosen ? '' : ' · За успешный ответ: ' + E.orderThanks(L) + ' ♡.');
    const items = document.createDocumentFragment();
    if (L.choice) {
      const data = E.CHOICE_LETTERS.find(x => x.id === L.choice);
      const options = node('div', 'choice-options');
      data.options.forEach((level, i) => {
        const selectedOption = L.chosen && L.want[0].level === level;
        const pick = button((selectedOption ? '✓ ' : '') + E.giftName(E.item('tech', level)), () => execute({ type: 'chooseGift', orderId: L.id, level }), selectedOption ? 'primary' : '');
        pick.disabled = L.retry || L.packed[0] || selectedOption;
        pick.setAttribute('aria-pressed', String(selectedOption));
        const option = node('div', 'choice-option');
        option.append(pick, node('p', '', data.reasons[i])); options.append(option);
      });
      items.append(options);
    }
    if (L.special === 'village' && !L.retry) {
      const toggle = button(L.want.length === 3 ? 'Оставить два подарка' : 'Добавить третий подарок · бонус +1 ♡', () => execute({ type: 'villageExtra', orderId: L.id }));
      toggle.disabled = !!L.packed[2];
      items.append(toggle);
    }
    const availableGifts = E.countGifts(s);
    (L.choice && !L.chosen ? [] : L.want).forEach((g, i) => {
      const box = node('section', 'gift-recipe'); box.append(giftLabel('h3', '', g, E.giftName(g) + ' · ур. ' + g.level + ' · ' + E.giftThanks(g) + ' ♡'));
      const readyGift = !L.packed[i] && (availableGifts[E.key(g)] || 0) > 0;
      if (readyGift) availableGifts[E.key(g)]--;
      if (L.packed[i] || readyGift) {
        box.append(node('p', 'packed-label', L.packed[i] ? '✓ Собран на полке письма. Можно отправлять.' : '✓ Готов на поле или в запасе. Можно отправлять.'));
        const cell = s.board.findIndex(x => E.isGift(x) && E.key(x.gift) === E.key(g));
        const storeIndex = s.giftStore.findIndex(x => E.key(x) === E.key(g));
        if (L.special && readyGift) box.append(button('Упаковать', () => execute({ type: 'packGift', orderId: L.id, giftIndex: i }), 'primary'));
        box.append(button('Разобрать на детали', () => execute(L.packed[i] ? { type: 'disassemble', orderId: L.id, giftIndex: i } : cell >= 0 ? { type: 'disassemble', cell } : { type: 'disassemble', storeIndex })));
      }
      else {
        const have = E.count(s), components = node('div', 'recipe-components');
        E.recipe(g).forEach(p => { const ready = (have[E.key(p)] || 0) > 0; if (ready) have[E.key(p)]--; const row = node('div', 'recipe-component'); row.append(partChip(p, ready), node('span', '', E.label(p)), node('b', '', ready ? '✓' : '○')); components.append(row); });
        box.append(components); box.append(node('p', 'field-craft-hint', g.level >= 7 ? 'На поле: начни со старшей детали, добавь остальные уровни в сборку. Можно также собрать кнопкой ниже.' : 'На поле: перетащи одну нужную деталь на другую — получится подарок. Можно также собрать кнопкой ниже.')); const b = button('Собрать подарок', () => execute({ type: 'craft', orderId: L.id, giftIndex: i }), 'primary'); b.disabled = !E.canCraft(s, L.id, i); box.append(b);
        if (E.rareFits(g) && s.board.some(E.isRarePart)) {
          box.append(node('p', 'field-craft-hint', 'Морозостойкая плата может заменить деталь уровня 4.'));
          const rare = button('Собрать с редкой платой', () => execute({ type: 'craft', orderId: L.id, giftIndex: i, useRare: true }), 'primary');
          rare.disabled = !E.canCraft(s, L.id, i, true);
          box.append(rare);
        }
      }
      items.append(box);
    }); $('recipe-items').replaceChildren(items);
    const protect = document.createDocumentFragment();
    if (L.retry || L.protected) protect.append(node('p', 'packed-label', '🏷 ' + (L.retry ? 'Повторная доставка гарантирована.' : 'Защищено биркой: точно дойдёт целым.')));
    else if (s.bag.some(t => t.kind === 'tag')) protect.append(button('Прикрепить найденную бирку', () => execute({ type: 'protect', orderId: L.id })));
    $('recipe-protection').replaceChildren(protect); $('recipe-send').disabled = !E.canSend(s, L.id);
  }
  function showReply(id) {
    const m = game.state.mail.find(m => m.id === id); if (!m || m.claimed || m.dueAt > Date.now()) return;
    currentMail = id;
    $('reply-title').textContent = m.outcome === 'success' ? 'Ответ от ' + m.order.who : 'Извещение о посылке · ' + m.order.who;
    $('reply-text').textContent = m.outcome === 'success' ? '«' + (m.order.replyText || 'Подарок приехал! Спасибо, Дедушка! Мы уже придумали, как будем с ним играть.') + '» ' + (m.attempt === 2 ? 'Повторная посылка дошла.' : '') : m.outcome === 'lost' ? 'Снеговик: «Посылка затерялась в дороге. Мне очень жаль. Давай соберём её ещё раз — повторную точно доставим». Сердечко придёт после повторной доставки.' : 'Снеговик: «Подарок повредился по дороге. За эту доставку нет сердечка. Надёжная упаковка поможет избежать такого в будущем». Письмо закроется, можно продолжать новые заказы.';
    $('reply-drawing').hidden = m.outcome !== 'success' || !!m.order.storyId; $('reply-claim').textContent = m.outcome === 'success' ? 'Забрать спасибо · +' + m.rewardThanks + ' ♡' + (m.bonusEnergy ? ' и 1 ❄' : '') : m.outcome === 'lost' ? 'Получить повторный заказ' : 'Прочитано · без сердечка';
    if (!$('reply-dialog').open) $('reply-dialog').showModal();
  }
  function showAlbum() {
    const s = game.state, body = document.createDocumentFragment();
    body.append(node('h3', '', 'Находки и комната'), node('p', '', 'Частей найдено: ' + s.cleared.filter(c => E.cacheAt(c.shift, c.cell)?.required).length + '. Украшения: ' + (s.decor.map(d => d.name).join(', ') || 'пока нет') + '.'));
    if (s.postcards.length) body.append(node('h3', '', 'Открытки из старой почты'));
    s.postcards.forEach(c => { const row = node('article', 'album-entry'); row.append(node('b', '', c.name), node('p', '', c.text)); body.append(row); });
    body.append(node('h3', '', 'Посылки и ответы'));
    if (!s.mail.length) body.append(node('p', '', 'Первой посылке ещё предстоит отправиться в путь.'));
    [...s.mail].reverse().forEach(m => {
      const row = node('article', 'album-entry'); row.append(node('b', '', m.order.who + (m.attempt === 2 ? ' · повторная' : '')), node('p', '', m.order.want.map(E.giftName).join(' + ')));
      if (m.claimed && m.outcome === 'success' && m.order.replyText) row.append(node('p', 'personal-reply', '«' + m.order.replyText + '»'));
      if (m.claimed) row.append(node('p', '', m.outcome === 'success' ? '✓ Ответ получен · +' + m.rewardThanks + ' ♡' : m.outcome === 'lost' ? 'Посылка потерялась · добавлен повторный заказ' : 'Повреждено · без сердечка'));
      else if (m.dueAt <= Date.now()) row.append(button('Открыть ответ', () => showReply(m.id), 'primary'));
      else row.append(node('p', '', 'Посылка в пути'));
      body.append(row);
    }); $('album-body').replaceChildren(body); if (!$('album-dialog').open) $('album-dialog').showModal();
  }
  function activate(i) {
    clearPending(); const x = game.state.board[i];
    if (x?.find) { execute({ type: 'pickup', cell: i }); return; }
    if (x?.snow) { selected = null; snowSelection = i; render(); tip(E.accessible(game.state, i) ? 'Выбери расчистку ниже. Сердечки приходят с ответами детей.' : 'Сюда пока не добраться: открой соседнюю клетку со стороны стола.'); $('snow-panel').scrollIntoView({ block: 'nearest' }); return; }
    snowSelection = null;
    if (selected !== null && selected !== i) { execute({ type: 'drop', from: selected, to: i }); return; }
    if (x?.gen) execute({ type: 'spawn', from: i });
    else if (E.isMovable(x)) { selected = selected === i ? null : i; render(); tip(selected === null ? intro() : E.isGift(x) ? E.giftName(x.gift) + ' готов. Можно отправить по письму или разобрать кнопкой под столом.' : E.isAssembly(x) ? E.cellName(x) + '. Уже добавлены уровни ' + x.assembly.parts.join(', ') + '. Добавь недостающие или нажми «Разобрать».' : E.label(x) + ' · ур. ' + x.level + '. Другая такая же → старшая; разные по рецепту → подарок.'); }
    else { selected = null; render(); tip(intro()); }
  }
  $('board').addEventListener('click', e => { if (Date.now() - lastPointerClick < 350) return; const cell = e.target.closest('[data-cell]'); if (cell) activate(Number(cell.dataset.cell)); });
  $('board').addEventListener('pointerdown', e => {
    if (e.button !== 0 || drag) return; const cell = e.target.closest('[data-cell]'); if (!cell || cell.disabled) return;
    const i = Number(cell.dataset.cell); drag = { i, pointer: e.pointerId, x: e.clientX, y: e.clientY, moved: false, draggable: E.isMovable(game.state.board[i]) };
    cell.focus({ preventScroll: true }); e.preventDefault(); $('board').setPointerCapture(e.pointerId);
  });
  const under = e => document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-cell], #return');
  function clearHover() { document.querySelectorAll('.over').forEach(x => x.classList.remove('over')); }
  function finishDrag() {
    const d = drag; drag = null; if (d && $('board').hasPointerCapture(d.pointer)) $('board').releasePointerCapture(d.pointer);
    if (ghost) ghost.remove(); ghost = null; clearHover(); $('return').disabled = selected === null || E.isRarePart(game.state.board[selected]) || (!E.isItem(game.state.board[selected]) && !E.isAssembly(game.state.board[selected]) && !E.isGift(game.state.board[selected]));
  }
  window.addEventListener('pointermove', e => {
    if (!drag || drag.pointer !== e.pointerId || !drag.draggable) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 8) { drag.moved = true; clearPending(); const x = game.state.board[drag.i]; ghost = node('div', 'ghost', E.isGift(x) ? E.CHAINS[x.gift.chain].icons[x.gift.level - 1] : E.isAssembly(x) ? '🛠' : E.CHAINS[x.chain].icon + x.level); ghost.textContent = ''; ghost.append(E.isGift(x) ? spriteIcon('gift', x.gift.chain, x.gift.level, E.CHAINS[x.gift.chain].icons[x.gift.level - 1]) : E.isAssembly(x) ? node('span', '', '🛠') : spriteIcon('part', x.chain, x.level, E.CHAINS[x.chain].icon + x.level)); document.body.append(ghost); $('return').disabled = false; }
    if (ghost) { ghost.style.left = e.clientX + 'px'; ghost.style.top = e.clientY + 'px'; clearHover(); under(e)?.classList.add('over'); }
  });
  window.addEventListener('pointerup', e => {
    if (!drag || drag.pointer !== e.pointerId) return; const d = drag, target = under(e); finishDrag(); lastPointerClick = Date.now();
    if (!d.moved) { if (target?.dataset.cell !== undefined && Number(target.dataset.cell) === d.i) activate(d.i); return; }
    if (target?.id === 'return') execute({ type: 'return', from: d.i }); else if (target?.dataset.cell !== undefined) execute({ type: 'drop', from: d.i, to: Number(target.dataset.cell) });
  });
  window.addEventListener('pointercancel', finishDrag); window.addEventListener('blur', finishDrag);
  $('board').addEventListener('lostpointercapture', () => { if (drag) finishDrag(); });
  window.addEventListener('scroll', positionMergeConfirmation, { passive: true });
  window.addEventListener('resize', positionMergeConfirmation);
  document.addEventListener('pointerdown', e => {
    if (pending && !e.target.closest('#merge-confirmation')) clearPending();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (pending) { clearPending(true); return; } selected = null; snowSelection = null; clearPending(); finishDrag(); render(); tip(intro()); } });
  $('return').addEventListener('click', () => { if (selected !== null) execute({ type: 'return', from: selected }); });
  $('production-select').addEventListener('change', () => {
    const chain = $('production-select').value;
    if (!Object.values(E.SHIFTS[game.state.shift].generators).includes(chain)) return;
    activeProduction = chain; selected = null; snowSelection = null; clearPending(); render();
  });
  $('undo').addEventListener('click', () => execute({ type: 'undo' }));
  $('cancel-merge').addEventListener('click', () => clearPending(true));
  $('confirm-merge').addEventListener('click', () => {
    if (!pending) return;
    const target = pending.to;
    if (execute({ ...pending, force: true })) boardCell(target)?.focus({ preventScroll: true });
  });
  $('melt').addEventListener('click', () => { if (snowSelection !== null) execute({ type: 'melt', cell: snowSelection }); });
  $('build').addEventListener('click', () => execute({ type: 'build' }));
  $('next').addEventListener('click', () => { if (execute({ type: 'next' })) { tip(intro()); $('shift-title').scrollIntoView({ block: 'start' }); } });
  $('speed').addEventListener('click', () => execute({ type: 'speed' }));
  $('recipe-send').addEventListener('click', () => { if (currentOrder !== null) execute({ type: 'send', orderId: currentOrder }); });
  $('recipe-close').addEventListener('click', () => $('recipe-dialog').close());
  $('album-open').addEventListener('click', showAlbum); $('album-close').addEventListener('click', () => $('album-dialog').close());
  $('reply-close').addEventListener('click', () => $('reply-dialog').close());
  $('reply-claim').addEventListener('click', () => { if (currentMail !== null && execute({ type: 'claim', mailId: currentMail })) { $('reply-dialog').close(); if ($('album-dialog').open) showAlbum(); } });
  $('help').addEventListener('click', () => $('help-dialog').showModal()); $('help-close').addEventListener('click', () => $('help-dialog').close());
  $('restart').addEventListener('click', () => $('restart-dialog').showModal());
  $('restart-cancel').addEventListener('click', () => $('restart-dialog').close());
  $('restart-confirm').addEventListener('click', () => {
    finishDrag();
    game = new E.Game();
    selected = null;
    snowSelection = null;
    currentOrder = null;
    currentMail = null;
    clearPending();
    $('restart-dialog').close();
    save();
    render();
    tip(intro());
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { finishDrag(); save(); } });
  setInterval(() => { const energy = game.state.energy; game.regen(); if (energy !== game.state.energy) { save(); if (!drag && !document.querySelector('dialog[open]')) render(); } updateEnergy(); updateMailbox(); }, 1000);
  const THEME_KEY = 'pochta-background-theme';
  function applyTheme(theme, persist = true) {
    if (!['blue', 'purple', 'green'].includes(theme)) theme = 'purple';
    document.body.setAttribute('data-theme', theme);
    for (const name of ['blue', 'purple', 'green']) $('theme-' + name).setAttribute('aria-pressed', String(name === theme));
    if (persist) { try { localStorage.setItem(THEME_KEY, theme); } catch (_) { /* Theme remains usable without storage. */ } }
  }
  for (const theme of ['blue', 'purple', 'green']) $('theme-' + theme).addEventListener('click', () => applyTheme(theme));
  let initialTheme = 'purple'; try { initialTheme = localStorage.getItem(THEME_KEY) || 'purple'; } catch (_) { /* Default background. */ }
  applyTheme(initialTheme, false);
  save(); render(); tip(loadMessage || intro());
})();
