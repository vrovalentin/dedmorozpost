(function (root) {
  'use strict';
  const CHAINS = {
    tech: { name: 'Техника', generator: '🧰', color: '#477dd1', icon: '⚙',
      names: ['Крепёж и проводки', 'Механическая сборка', 'Электромеханическая сборка', 'Электронная сборка', 'Радиомодуль', 'Блок управления', 'Умный модуль', 'Волшебное техническое ядро'],
      gifts: ['Инерционная машинка', 'Машинка с подсветкой', 'Маленький шагающий робот', 'Пара детских раций', 'Машинка на управлении', 'Радиоуправляемый вездеход', 'Программируемый робот', 'Робот-собака'],
      icons: ['🚗', '🚕', '🤖', '📻', '🏎', '🚙', '🤖', '🐕'] },
    sew: { name: 'Швейная', generator: '🧵', color: '#b2738d', icon: '🧵',
      names: ['Лоскут ткани', 'Отрез ткани', 'Набор выкроек', 'Сшитая оболочка', 'Комплект с наполнителем', 'Большая мягкая основа', 'Детали большой игрушки', 'Волшебная мягкая основа'],
      gifts: ['Плюшевый брелок', 'Маленький плюшевый котик', 'Плюшевый зайка', 'Капибара', 'Капибара в худи', 'Игрушка-обнимашка', 'Большой плюшевый дракон', 'Огромная капибара-подушка'],
      icons: ['🧸', '🐱', '🐰', '🧸', '🧸', '🧸', '🐲', '🛏'] },
    art: { name: 'Творчество', generator: '🎨', color: '#759c65', icon: '🎨',
      names: ['Цветной лист', 'Пачка бумаги', 'Комплект основ для рисования', 'Комплект инструментов', 'Комплект художественных материалов', 'Большой художественный комплект', 'Студийный комплект', 'Волшебный творческий комплект'],
      gifts: ['Блокнот с наклейками', 'Набор раскрасок', 'Скетчбук с маркерами', 'Набор для рисования комиксов', 'Набор для скетчинга', 'Чемодан юного художника', 'Мольберт с красками', 'Большая домашняя арт-студия'],
      icons: ['📒', '📖', '📓', '🖍', '🖌', '🧳', '🖼', '🎨'] }
  };
  const RECIPES = [[2, 1], [3, 1], [3, 2], [4, 3], [5, 3], [6, 4], [7, 5, 1], [8, 6, 1, 2, 3]];
  const SNOW = { 1: { name: 'Рыхлый снег', cost: 1 }, 2: { name: 'Слежавшийся снег', cost: 2 }, 3: { name: 'Лёд', cost: 5 } };
  const at = p => (Number(p.slice(1)) - 1) * 7 + p.charCodeAt(0) - 65;
  const coord = i => String.fromCharCode(65 + i % 7) + (Math.floor(i / 7) + 1);
  const SHIFTS = [
    { title: 'Первые посылки', goal: 'Собрать швейную машинку', generators: { D1: 'tech' },
      parts: ['Станина', 'Маховик', 'Привод', 'Игольный механизм'], partSnow: [1, 1, 2, 3],
      start: { C3: ['tech', 1], D3: ['tech', 1], C4: ['tech', 2], D4: ['tech', 3] } },
    { title: 'Мягкие подарки', goal: 'Собрать студию творчества', generators: { B1: 'tech', F1: 'sew' },
      parts: ['Основание стола', 'Держатель бумаги', 'Карусель красок', 'Волшебный упаковщик'], partSnow: [1, 2, 2, 3],
      start: { C3: ['tech', 2], D3: ['sew', 1], E3: ['sew', 1], D4: ['sew', 2] } },
    { title: 'Почта становится надёжнее', goal: 'Собрать упаковочную станцию', generators: { B1: 'tech', D1: 'sew', F1: 'art' },
      parts: ['Рабочая рама', 'Рулонный механизм', 'Мягкая подкладка', 'Волшебный запечатыватель'], partSnow: [1, 2, 2, 3],
      start: { C3: ['art', 1], D3: ['art', 1], E3: ['sew', 2], D4: ['tech', 2] } }
  ];
  const CACHES = SHIFTS.map((shift, s) => {
    const result = {};
    ['B4', 'F4', 'D6', 'D9'].forEach((p, n) => { result[p] = { kind: 'part', name: shift.parts[n], snow: shift.partSnow[n], required: true }; });
    const add = (places, value) => places.forEach(p => { result[p] = { ...value }; });
    add(['A4', 'G4', 'B5', 'F5', 'B6', 'F6'], { kind: 'energy', name: 'Мешочек снежинок', amount: 8 });
    add(['C7', 'E7'], { kind: 'energy', name: 'Термос Снегурочки', amount: 16 });
    add(['C5', 'E6', 'B8'], { kind: 'scissors', name: 'Волшебные ножницы' });
    add(['F7', 'C8'], { kind: 'tag', name: 'Бирка надёжной доставки' });
    const decorations = [['A5', '🏮', 'Фонарик'], ['G5', '🪴', 'Ёлочка в горшке'], ['A7', '🧶', 'Уютный коврик'], ['G8', '🎀', 'Гирлянда']];
    decorations.forEach(([p, icon, name]) => { result[p] = { kind: 'decor', name, icon }; });
    result.B7 = { kind: 'postcard', name: 'Открытка снеговика', text: ['«В первую зиму я боялся заходить на почту: вдруг растаю? Дедушка выделил мне прохладное местечко у двери».', '«Снегурочка связала мне варежки. Руки у меня из веточек, но с варежками всё равно уютнее».', '«Однажды мы отправили посылку самим себе. Очень хотелось тоже получить письмо!»'][s] };
    result.F8 = { kind: 'postcard', name: 'Старая открытка почты', text: '«Первую вывеску мы рисовали вместе. Буквы вышли кривые, зато дети сразу нашли дорогу».', amount: 4 };
    result.A6 = { kind: 'letter', name: 'Письмо из сугроба' };
    return result;
  });
  const item = (chain, level) => ({ chain, level });
  function makeBoard(shift) {
    const b = Array.from({ length: 63 }, (_, i) => {
      const r = Math.floor(i / 7), c = i % 7;
      if (!r) return { blocked: true };
      if (r <= 2 || (r === 3 && c >= 2 && c <= 4)) return null;
      return { snow: r >= 7 ? 3 : r >= 5 ? 2 : 1 };
    });
    for (const [p, chain] of Object.entries(SHIFTS[shift].generators)) b[at(p)] = { gen: chain };
    for (const [p, [c, l]] of Object.entries(SHIFTS[shift].start)) b[at(p)] = item(c, l);
    for (const [p, cache] of Object.entries(CACHES[shift])) if (cache.snow) b[at(p)] = { snow: cache.snow };
    return b;
  }
  const api = { CHAINS, RECIPES, SNOW, SHIFTS, CACHES, at, coord, makeBoard, item };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PostContent = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
