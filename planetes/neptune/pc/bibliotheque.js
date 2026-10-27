/* ═════════════ NEPTUNE : BIBLIOTHÈQUE LOCALE DE MAQUETTES (IndexedDB « rayle-neptune ») ═════════════
   Garde dans le navigateur les derniers modèles importés (fichier principal + fichiers associés) pour « ouvre la maquette … ». Rien ne quitte l'appareil.
   Plafonds : 12 maquettes, 80 Mo chacune ; au-delà la plus ancienne est retirée. Si IndexedDB est refusé (navigation privée…), tout continue sans bibliothèque. */
const BASE = 'rayle-neptune', STORE = 'maquettes', MAX_MAQUETTES = 12, MAX_OCTETS = 80 * 1024 * 1024;
const ARTICLES = new Set(['le', 'la', 'les', 'un', 'une', 'de', 'du', 'des', 'mon', 'ma', 'mes', 'maquette', 'modele']);
const sansAccent = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim();

function ouvrirBase() {
  return new Promise((ok, ko) => {
    if (typeof indexedDB === 'undefined') return ko(new Error('IndexedDB indisponible'));
    const r = indexedDB.open(BASE, 1); r.onupgradeneeded = () => { r.result.createObjectStore(STORE, { keyPath: 'nom' }); }; r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error || new Error('IndexedDB refusé'));
  });
}
const tx = (db, mode) => db.transaction(STORE, mode).objectStore(STORE);
const promesse = req => new Promise((ok, ko) => { req.onsuccess = () => ok(req.result); req.onerror = () => ko(req.error); });

export async function enregistrer(nom, fichiers) {
  const total = fichiers.reduce((s, f) => s + f.size, 0); if (total > MAX_OCTETS) return { ok: false, raison: 'Trop gros pour la bibliothèque locale (' + Math.round(total / 1048576) + ' Mo, plafond ' + MAX_OCTETS / 1048576 + ' Mo).' };
  try {
    const db = await ouvrirBase(); const existants = await promesse(tx(db, 'readonly').getAll());
    const sans = existants.filter(e => e.nom !== nom).sort((a, b) => a.date - b.date);
    while (sans.length >= MAX_MAQUETTES) { const vieux = sans.shift(); await promesse(tx(db, 'readwrite').delete(vieux.nom)); }
    const contenu = await Promise.all(fichiers.map(async f => ({ nom: f.name, type: f.type, donnees: await f.arrayBuffer() })));   // lire AVANT d'ouvrir la transaction (sinon elle se referme)
    await promesse(tx(db, 'readwrite').put({ nom, date: Date.now(), octets: total, fichiers: contenu }));
    db.close(); return { ok: true };
  } catch (e) { return { ok: false, raison: String(e && e.message || e) }; }
}
export async function lister() { try { const db = await ouvrirBase(), l = await promesse(tx(db, 'readonly').getAll()); db.close(); return l.map(e => ({ nom: e.nom, date: e.date, octets: e.octets })).sort((a, b) => b.date - a.date); } catch (e) { return []; } }
/* Cherche par nom (sans accent ni majuscule) : égalité, puis « contient » ; rend des File prêts à importer. */
export async function ouvrir(nom) {
  try {
    const db = await ouvrirBase(), tous = (await promesse(tx(db, 'readonly').getAll())).sort((x, y) => y.date - x.date); db.close();
    const mots = sansAccent(nom).split(' ').filter(m => m.length > 1 && !ARTICLES.has(m)), n = mots.join(' ');
    // égalité, puis tous les mots de la demande contenus dans le nom ; à égalité, la maquette la plus récente
    const e = tous.find(x => sansAccent(x.nom) === n) || tous.find(x => mots.length && mots.every(m => sansAccent(x.nom).includes(m)));
    return e ? { ok: true, nom: e.nom, fichiers: e.fichiers.map(f => new File([f.donnees], f.nom, { type: f.type })) } : { ok: false, raison: 'Aucune maquette nommée « ' + nom + ' » dans la bibliothèque locale.' };
  } catch (e) { return { ok: false, raison: 'Bibliothèque indisponible : ' + String(e && e.message || e) }; }
}
export async function supprimer(nom) { try { const db = await ouvrirBase(); await promesse(tx(db, 'readwrite').delete(nom)); db.close(); return true; } catch (e) { return false; } }
