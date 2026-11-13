// Contrôle les fichiers de data/ : fichiers manquants, identifiants en double,
// noms vides, horaires impossibles… et compte les éléments marqués « à vérifier ».
// Lancer avec : npm run verifier
const fs = require('fs');
const path = require('path');
const { DOSSIER_DATA } = require('./lib/outils');

const erreurs = [];
const avertissements = [];
const lire = f => JSON.parse(fs.readFileSync(path.join(DOSSIER_DATA, f), 'utf8'));

const jeux = lire('jeux.json');
for (const jeu of jeux) {
  if (!jeu.disponible) continue;
  console.log(`\n${jeu.nom}`);
  for (const cat of jeu.categories) {
    const fichier = `${jeu.id}/${cat.id}.json`;
    if (!fs.existsSync(path.join(DOSSIER_DATA, fichier))) { erreurs.push(`${fichier} : fichier manquant`); continue; }
    const liste = lire(fichier);
    const ids = new Set();
    let aVerifier = 0;
    for (const e of liste) {
      const ou = `${fichier} → ${e.id || '(sans id)'}`;
      if (!e.id || !/^[a-z0-9-]+$/.test(e.id)) erreurs.push(`${ou} : identifiant invalide`);
      if (ids.has(e.id)) erreurs.push(`${ou} : identifiant en double`);
      ids.add(e.id);
      if (!e.nom || !e.nom.fr || !e.nom.en) erreurs.push(`${ou} : nom manquant`);
      if (!e.image) avertissements.push(`${ou} : pas d'image`);
      if (e.a_verifier && e.a_verifier.length) aVerifier++;
      if (cat.type === 'creature') {
        if (!e.dispo) { erreurs.push(`${ou} : pas de disponibilité`); continue; }
        for (const [hemi, periodes] of Object.entries(e.dispo)) {
          if (!periodes.length) erreurs.push(`${ou} : aucune période (${hemi})`);
          for (const p of periodes) {
            if (!p.mois.length || p.mois.some(m => m < 1 || m > 12)) erreurs.push(`${ou} : mois impossibles (${hemi})`);
            if (!p.heures.length || p.heures.some(([a, b]) => a < 0 || a > 23 || b < 0 || b > 24)) erreurs.push(`${ou} : heures impossibles (${hemi})`);
          }
        }
      }
    }
    console.log(`  ${cat.nom.padEnd(24)} ${String(liste.length).padStart(5)} éléments${aVerifier ? `  · ${aVerifier} à vérifier` : ''}`);
  }
}

if (avertissements.length) {
  console.log(`\n${avertissements.length} avertissement(s) :`);
  avertissements.slice(0, 20).forEach(a => console.log('  ⚠', a));
  if (avertissements.length > 20) console.log(`  … et ${avertissements.length - 20} autres`);
}
if (erreurs.length) {
  console.log(`\n${erreurs.length} erreur(s) :`);
  erreurs.slice(0, 50).forEach(e => console.log('  ✖', e));
  process.exitCode = 1;
} else {
  console.log('\n✔ Aucune erreur.');
}
