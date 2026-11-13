// Textes affichés pour les codes utilisés dans les données.

export const OMBRES = {
  '1': 'Minuscule (1)',
  '2': 'Petite (2)',
  '3': 'Moyenne (3)',
  '4': 'Grande (4)',
  '5': 'Très grande (5)',
  '6': 'Énorme (6)',
  '5-aileron': 'Très grande avec aileron',
  '6-aileron': 'Énorme avec aileron',
  'longue': 'Longue et fine',
};

export function texteCondition(c) {
  if (c === 'pluie') return '🌧️ Seulement quand il pleut';
  if (c === 'pluie-neige') return '🌧️ Seulement quand il pleut ou qu\'il neige';
  if (c === 'sans-pluie') return '☀️ Pas quand il pleut';
  const m = /^apres-(\d+)-prises$/.exec(c);
  if (m) return `🎣 Apparaît après ${m[1]} prises au total`;
  if (c === 'ile-tortimer') return "🏝️ Aussi sur l'île de Tortimer";
  if (c === 'ile-des-animaux') return "🏝️ Aussi sur l'île des animaux (avec la Game Boy Advance)";
  if (c === 'seulement-ile') return "🏝️ Seulement sur l'île";
  return c;
}

export const VITESSES = {
  'Stationary': 'Immobile',
  'Very slow': 'Très lente',
  'Slow': 'Lente',
  'Medium': 'Moyenne',
  'Fast': 'Rapide',
  'Very fast': 'Très rapide',
};

export const COULEURS_FLEURS = {
  red: 'Rouge', white: 'Blanc', yellow: 'Jaune', orange: 'Orange', pink: 'Rose',
  purple: 'Violet', blue: 'Bleu', black: 'Noir', green: 'Vert', gold: 'Doré',
};

export const CHAMPS_A_VERIFIER = {
  'nom.fr': 'nom français',
  'heures': 'horaires',
  'lieu': 'lieu',
  'ombre': "taille de l'ombre",
  'groupe': 'groupe',
  'mois': 'mois',
  'prix': 'prix',
};

export const TRIS = [
  ['nom', 'Nom (A → Z)'],
  ['numero', 'Numéro'],
  ['prix-desc', 'Prix (le plus cher)'],
  ['prix-asc', 'Prix (le moins cher)'],
  ['lieu', 'Lieu / sous-catégorie'],
];
