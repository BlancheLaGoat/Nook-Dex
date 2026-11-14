// Recherche, filtres, tri et calcul de progression.
import { estDisponible, disponibleEnMois, heuresDuMois, periodes, partBientot, arriveCeMois } from './dispo.js';

export const cle = (categorie, id) => `${categorie}:${id}`;

// "Écrevisse" -> "ecrevisse" : pour chercher sans se soucier des accents ni des majuscules.
export function simplifier(texte) {
  return String(texte || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae');
}

// L'élément fait-il partie du jeu tel que le profil y joue ? (ex. objets Happy Home Paradise)
export function estActif(element, extensions) {
  return !element.ext || (extensions || []).includes(element.ext);
}

export function etatElement(profil, categorie, id) {
  return (profil && profil.elements && profil.elements[cle(categorie, id)]) || null;
}

export function filtrer(elements, c, ctx) {
  const { profil, categorie, maintenant } = ctx;
  const hemi = (profil && profil.hemisphere) || 'nord';
  const texte = simplifier(c.texte).trim();
  return elements.filter(e => {
    if (!estActif(e, profil && profil.extensions)) return false;
    if (texte) {
      const foin = simplifier(`${e.nom.fr} ${e.nom.en} ${e.lieu_texte || ''} ${e.groupe ? e.groupe.fr : ''}`);
      if (!texte.split(/\s+/).every(mot => foin.includes(mot))) return false;
    }
    const st = etatElement(profil, categorie, e.id) || {};
    if (c.obtenu === 'oui' && !st.obtenu) return false;
    if (c.obtenu === 'non' && st.obtenu) return false;
    if (c.musee === 'oui' && !st.musee) return false;
    if (c.musee === 'non' && (st.musee || !e.musee)) return false;
    if (c.lieu && e.lieu_texte !== c.lieu) return false;
    if (c.sous && e.sous !== c.sous && !(e.groupe && e.groupe.fr === c.sous)) return false;
    if (c.ombre && e.ombre !== c.ombre) return false;
    if (c.hybride === 'oui' && !e.hybride) return false;
    if (c.hybride === 'non' && e.hybride) return false;
    if (c.aVerifier && !(e.a_verifier && e.a_verifier.length)) return false;
    if (c.provenance && !(ctx.provenance && ctx.provenance(e) === c.provenance)) return false;
    if (c.nouveaute && !(e.v && e.v.startsWith(c.nouveaute))) return false;
    if (c.maintenant && estDisponible(e, hemi, maintenant) !== true) return false;
    if (c.mois) {
      if (!periodes(e, hemi)) return false;
      if (!disponibleEnMois(e, hemi, Number(c.mois))) return false;
      if (c.heure !== '' && c.heure != null && !heuresDuMois(e, hemi, Number(c.mois)).has(Number(c.heure))) return false;
    } else if (c.heure !== '' && c.heure != null) {
      const p = periodes(e, hemi);
      if (!p) return false;
      const mois = maintenant.getMonth() + 1;
      if (!heuresDuMois(e, hemi, mois).has(Number(c.heure))) return false;
    }
    if (c.saison === 'part' && !partBientot(e, hemi, maintenant.getMonth() + 1)) return false;
    if (c.saison === 'arrive' && !arriveCeMois(e, hemi, maintenant.getMonth() + 1)) return false;
    return true;
  });
}

const comparerNoms = (a, b) => a.nom.fr.localeCompare(b.nom.fr, 'fr', { sensitivity: 'base' });

// ctx.rarete (facultatif, jeux avec taux d'apparition) :
//   max(id)        -> pourcentage maximum sur l'année, ou null si inconnu
//   maintenant(id) -> pourcentage en ce moment (0 si absente), ou null si inconnu
// Pour les tris par rareté, les plus rares d'abord ; les espèces sans taux (inconnues) à la fin.
export function trier(elements, tri, ctx = {}) {
  const liste = [...elements];
  const prix = e => (e.prix && (e.prix.vente ?? e.prix.achat)) ?? -1;
  const r = ctx.rarete;
  const ouFin = v => (v == null || v <= 0 ? Infinity : v);
  if (r && tri === 'rarete') {
    return liste.sort((a, b) => ouFin(r.max(a.id)) - ouFin(r.max(b.id)) || comparerNoms(a, b));
  }
  if (r && tri === 'rarete-maintenant') {
    return liste.sort((a, b) => ouFin(r.maintenant(a.id)) - ouFin(r.maintenant(b.id)) || ouFin(r.max(a.id)) - ouFin(r.max(b.id)) || comparerNoms(a, b));
  }
  switch (tri) {
    case 'numero': return liste.sort((a, b) => (a.n ?? 9999) - (b.n ?? 9999) || comparerNoms(a, b));
    case 'prix-desc': return liste.sort((a, b) => prix(b) - prix(a) || comparerNoms(a, b));
    case 'prix-asc': return liste.sort((a, b) => prix(a) - prix(b) || comparerNoms(a, b));
    case 'lieu': return liste.sort((a, b) => String(a.lieu_texte || a.sous || '').localeCompare(String(b.lieu_texte || b.sous || ''), 'fr') || comparerNoms(a, b));
    case 'groupe': return liste.sort((a, b) => String(a.groupe ? a.groupe.fr : a.sous || '').localeCompare(String(b.groupe ? b.groupe.fr : b.sous || ''), 'fr') || comparerNoms(a, b));
    default: return liste.sort(comparerNoms);
  }
}

// { total, obtenus, musee, totalMusee } pour une catégorie.
export function progression(elements, profil, categorie) {
  let total = 0, obtenus = 0, musee = 0, totalMusee = 0;
  for (const e of elements) {
    if (!estActif(e, profil && profil.extensions)) continue;
    total++;
    const st = etatElement(profil, categorie, e.id);
    if (st && st.obtenu) obtenus++;
    if (e.musee) {
      totalMusee++;
      if (st && st.musee) musee++;
    }
  }
  return { total, obtenus, musee, totalMusee };
}

// Valeurs distinctes d'un champ (pour remplir les listes déroulantes de filtres).
export function valeursDistinctes(elements, lecteur) {
  const s = new Set();
  for (const e of elements) { const v = lecteur(e); if (v) s.add(v); }
  return [...s].sort((a, b) => String(a).localeCompare(String(b), 'fr'));
}
