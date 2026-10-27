/* ═════════════ ORDRES DE NEPTUNE (bus d'ordres) ═════════════
   Déclarés dans planetes/neptune/manifeste.json, branchés ici dès l'ouverture de la galaxie (petit fichier : l'atelier lui-même, lourd, ne se charge qu'au premier clic).
   « ouvre l'atelier 3D » : ouvre la galaxie, vole jusqu'à Neptune, charge l'atelier. Ensuite : fabriquer, ouvrir une maquette de la bibliothèque locale, présenter. */
const pause = ms => new Promise(r => setTimeout(r, ms));
async function attendre(cond, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (cond()) return true; await pause(120); } return false; }

export function brancher({ O, galaxie, ouvrirGalaxie }) {
  const nep = () => window.Neptune || null;
  const ouvert = () => { const n = nep(), e = n && n.etat(); return !!(e && e.actif && !e.transition); };
  async function versNeptune() {
    await ouvrirGalaxie();
    if (ouvert()) return true;
    galaxie.nav.allerA('neptune', { entrer: true });
    return attendre(ouvert, 40000);
  }
  const sur = (action, fn, delai = 45000) => { try { O.enregistrer('neptune', action, fn, { delai }); } catch (e) { /* ordre non déclaré par le manifeste : ignoré */ } };

  sur('entrer_atelier', async () => {
    if (ouvert()) return { ok: true, texte: 'L’atelier 3D est déjà ouvert.' };
    return (await versNeptune()) ? { ok: true, texte: 'Voici l’atelier 3D de Neptune. Importe un fichier, ou demande-moi de fabriquer une forme.' } : { ok: false, erreur: 'l’atelier n’a pas pu s’ouvrir' };
  });
  sur('creer_maquette', async ({ description }) => {
    if (!(await versNeptune())) return { ok: false, erreur: 'l’atelier n’a pas pu s’ouvrir' };
    const r = nep().fabriquer(description || '');
    return r.ok ? { ok: true, texte: r.message + ' ' + (r.notes || []).slice(-1)[0] } : { ok: false, erreur: r.message };
  });
  sur('ouvrir_maquette', async ({ nom }) => {
    if (!(await versNeptune())) return { ok: false, erreur: 'l’atelier n’a pas pu s’ouvrir' };
    const B = await import(new URL('./bibliotheque.js', import.meta.url).href), r = await B.ouvrir(nom || '');
    if (!r.ok) { const l = await B.lister(); return { ok: false, erreur: r.raison + (l.length ? ' Maquettes gardées : ' + l.map(x => x.nom).join(', ') + '.' : ' La bibliothèque est vide : importe d’abord un fichier.') }; }
    const res = await nep().importer(r.fichiers, { garder: false });
    return res ? { ok: true, texte: 'Voici « ' + r.nom + ' ».' } : { ok: false, erreur: 'le fichier n’a pas pu être relu' };
  });
  sur('presenter_pieces', async () => {
    if (!ouvert()) return { ok: false, erreur: 'l’atelier n’est pas ouvert : dis « ouvre l’atelier 3D »' };
    nep().presenter(); return { ok: true, texte: 'Je commence la présentation pièce par pièce.' };
  });
}
