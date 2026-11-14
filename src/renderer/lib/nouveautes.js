// Lecture de NOUVEAUTES.md (fenêtre « Quoi de neuf ? »). Ce fichier ne fait que découper le texte :
// l'affichage est dans vues/fenetres.js. Testé par tests/nouveautes.test.js.
//
// Format du fichier : une partie par version, qui commence par « ## 1.1.0 » ; dedans, des titres « ### … »,
// des paragraphes et des listes « - … ». Le gras s'écrit **comme ceci**.

// Texte de la partie d'une version (sans la ligne « ## »), ou null si la version n'a pas de partie.
export function partieVersion(texte, version) {
  const lignes = String(texte || '').split(/\r?\n/);
  const debut = lignes.findIndex(l => l.trim() === `## ${version}`);
  if (debut < 0) return null;
  let fin = lignes.findIndex((l, i) => i > debut && /^## /.test(l));
  if (fin < 0) fin = lignes.length;
  const res = lignes.slice(debut + 1, fin).join('\n').trim();
  return res || null;
}

// Versions présentes dans le fichier, dans l'ordre (la plus récente en premier).
export function versions(texte) {
  return String(texte || '').split(/\r?\n/).map(l => /^## (\S+)\s*$/.exec(l)).filter(Boolean).map(m => m[1]);
}

// Découpe une partie en blocs : { type: 'titre' | 'paragraphe' | 'liste', texte | elements }.
export function blocs(partie) {
  const res = [];
  for (const brut of String(partie || '').split(/\r?\n/)) {
    const l = brut.trim();
    if (!l) continue;
    if (l.startsWith('### ')) res.push({ type: 'titre', texte: l.slice(4) });
    else if (l.startsWith('- ')) {
      const prec = res[res.length - 1];
      if (prec && prec.type === 'liste') prec.elements.push(l.slice(2));
      else res.push({ type: 'liste', elements: [l.slice(2)] });
    } else res.push({ type: 'paragraphe', texte: l });
  }
  return res;
}

// « un **mot** en gras » -> [{ texte: 'un ' }, { texte: 'mot', gras: true }, { texte: ' en gras' }]
export function morceaux(texte) {
  return String(texte).split(/(\*\*[^*]+\*\*)/).filter(Boolean)
    .map(m => (m.startsWith('**') && m.endsWith('**') ? { texte: m.slice(2, -2), gras: true } : { texte: m }));
}
