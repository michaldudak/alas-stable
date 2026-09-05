export const styleOptions = {
  maneStyle: [['short', 'Krótka'], ['long', 'Długa'], ['braided', 'Zapleciona']],
  tailStyle: [['short', 'Krótki'], ['long', 'Długi'], ['braided', 'Zapleciony']],
  ornament: [['none', 'Bez ozdoby'], ['flower', 'Kwiaty'], ['bow', 'Kokarda'], ['ribbons', 'Wstążki']],
  pattern: [['plain', 'Gładki'], ['dots', 'Kropki'], ['stripes', 'Paski'], ['stars', 'Gwiazdki']],
};
export const colorOptions = [
  ['coat', 'Maść', ['#aa6941', '#e1c39a', '#665046', '#e6e0d2', '#343330'], ['Kasztanowa', 'Jasna', 'Gniada', 'Siwa', 'Kara']],
  ['hair', 'Grzywa i ogon', ['#47332d', '#d7b879', '#e9e3d1', '#8d5236'], ['Ciemna', 'Złota', 'Biała', 'Ruda']],
  ['cloth', 'Czaprak', ['#437f79', '#b75f59', '#b3a45a', '#7275a3', '#d5ba94'], ['Morski', 'Czerwony', 'Oliwkowy', 'Fioletowy', 'Kremowy']],
  ['leather', 'Siodło', ['#60432c', '#343330', '#a17448'], ['Brązowe', 'Czarne', 'Jasne']],
  ['ornamentColor', 'Kolor ozdób', ['#e9be5f', '#c55e6e', '#7296bb', '#9982b6', '#eee4ce'], ['Złoty', 'Różowy', 'Niebieski', 'Fioletowy', 'Kremowy']],
];

export function normalizeAppearance(value) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const result = {};
  for (const [key, , colors] of colorOptions) result[key] = colors.includes(input[key]) ? input[key] : colors[0];
  for (const [key, options] of Object.entries(styleOptions)) {
    const fallback = key === 'maneStyle' || key === 'tailStyle' ? 'long' : key === 'ornament' && input.flower === true ? 'flower' : options[0][0];
    result[key] = options.some(([id]) => id === input[key]) ? input[key] : fallback;
  }
  return result;
}
