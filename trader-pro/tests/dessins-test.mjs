/* Tests : stockage des dessins, fusion entre appareils, synchronisation par le Worker Portefeuille (vrai SQLite). node trader-pro/tests/dessins-test.mjs */
import { DatabaseSync } from 'node:sqlite';
import { traiter } from '../worker/src/coeur.js';
import { depotD1, d1DepuisSqlite } from '../worker/src/depot-d1.js';
import { nettoyerDessin, nettoyerListe, fusionner, supprimer, remplacer, visibles } from '../terminal/dessins-fusion.js';
import { lireDessins, ecrireDessins, synchroniser, lireConn, CLE } from '../terminal/dessins-stockage.js';
import { creer, modifier } from '../terminal/niveaux.js';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, x) => m.set(k, String(x)), removeItem: k => m.delete(k), _m: m }; };
const T = Date.now() - 60000, d1 = (o = {}) => creer('horizontale', { p: 3600, unite: 'H4', ...o }, { t: T, id: o.id || 'a1' }), bx = creer('boite', { t1: T, p1: 90, t2: T + 1e6, p2: 100, unite: 'H1' }, { t: T, id: 'b1' });
const ev = (id, vueLe = null) => ({ id, niveauId: 'a1', type: 'rebond', dir: 1, unite: 'H4', t: T, tFin: T + 4e6, entree: 3600, niveau: 3600, volRatio: 1.6, atr: 5, vueLe });

/* validation */
v(nettoyerDessin(d1()) && nettoyerDessin(bx) && nettoyerDessin({ id: 'x', type: 'horizontale', unite: 'H4', p: -3, maj: 1 }) === null && nettoyerDessin({ id: 'x y', type: 'horizontale', unite: 'H4', p: 3, maj: 1 }) === null && nettoyerDessin({ id: 'x', type: 'horizontale', unite: 'M5', p: 3, maj: 1 }) === null, 'validation : champs, unité, identifiant');
v(nettoyerDessin({ id: 'z', supprime: true, maj: 5 }).supprime === true, 'pierre tombale conservée'); v(nettoyerListe('pas une liste').length === 0, 'liste invalide : vide');
v(nettoyerDessin({ ...d1(), evenements: [ev('e1'), { id: 'mauvais' }] }).evenements.length === 1, 'événements invalides écartés');
/* stockage local */
const st = mem(); v(lireDessins('or', st).length === 0, 'rien au départ'); ecrireDessins('or', [d1(), bx], st); v(lireDessins('or', st).length === 2 && lireDessins('us100', st).length === 0, 'dessins gardés par actif');
st.setItem(CLE('or'), '{pas du json'); v(lireDessins('or', st).length === 0, 'stockage corrompu : liste vide, pas d’erreur');
/* fusion : le plus récent gagne */
const a = { ...d1(), maj: 100, p: 3600 }, b = { ...d1(), maj: 200, p: 3650 }; v(fusionner([a], [b])[0].p === 3650 && fusionner([b], [a])[0].p === 3650, 'conflit : le plus récent gagne (dans les deux sens)');
v(fusionner([a], [{ ...bx, maj: 50 }]).length === 2, 'dessins différents : union');
const sup = supprimer([a, bx], 'a1', 300); v(visibles(sup).length === 1 && sup[0].supprime === true, 'suppression = pierre tombale'); v(visibles(fusionner([{ ...a, maj: 100 }], sup)).length === 1, 'la suppression plus récente l’emporte sur un appareil en retard');
v(visibles(fusionner(sup, [{ ...a, maj: 400 }])).length === 2, 'un dessin recréé / modifié plus tard revit');
v(fusionner([{ id: 'v', supprime: true, maj: 1 }], [], 1 + 31 * 86400e3).length === 0 && fusionner([{ id: 'v', supprime: true, maj: 1 }], [], 1 + 5 * 86400e3).length === 1, 'pierres tombales purgées après 30 jours');
const ua = { ...a, maj: 100, evenements: [ev('e1', 111)] }, ub = { ...a, maj: 200, p: 3650, evenements: [ev('e1', null), ev('e2', null)] }, fu = fusionner([ua], [ub])[0];
v(fu.evenements.length === 2 && fu.evenements.find(e => e.id === 'e1').vueLe === 111, 'événements : union, et une annonce déjà faite par un appareil reste faite (pas de double annonce)');
v(modifier(a, { p: 3700 }, 999).maj === 999, 'modifier() met à jour `maj` (nécessaire à la fusion)');
v(remplacer([a], { ...a, p: 1 }).length === 1 && remplacer([a], bx).length === 2, 'remplacer / ajouter');

/* synchronisation PC ↔ tablette ↔ téléphone par le vrai Worker (SQLite) */
const env = { PORTEFEUILLE_CODE: 'code-de-test-123456', ORIGINES: 'https://x.test' }, depot = depotD1(d1DepuisSqlite(new DatabaseSync(':memory:')));
const fetchW = async (url, opt = {}) => { const r = await traiter(new Request(url, { method: opt.method || 'GET', headers: { ...(opt.headers || {}), Origin: 'https://x.test' }, body: opt.body }), env, depot); const t = await r.text(); return { ok: r.status < 400, status: r.status, json: async () => JSON.parse(t) }; };
const conn = { url: 'https://w.test', code: 'code-de-test-123456' };
const pc = [d1({ id: 'pc1' }), bx];
let r = await synchroniser('or', pc, { conn, fetchFn: fetchW, maintenant: T }); v(r.ok && r.dessins.length === 2, 'PC : envoi au Worker');
const tel = await synchroniser('or', [], { conn, fetchFn: fetchW, maintenant: T }); v(tel.ok && tel.dessins.length === 2 && tel.dessins.some(d => d.id === 'pc1'), 'téléphone (vide) : récupère les dessins du PC');
const dTel = { ...creer('tendance', { t1: T, p1: 3500, t2: T + 1e6, p2: 3600, unite: 'H1' }, { t: T + 5, id: 'tel1' }), maj: T + 5 };
r = await synchroniser('or', [...tel.dessins, dTel], { conn, fetchFn: fetchW, maintenant: T + 10 }); v(r.dessins.length === 3, 'téléphone : ajoute une trendline');
const tab = await synchroniser('or', [], { conn, fetchFn: fetchW, maintenant: T + 20 }); v(tab.dessins.length === 3, 'tablette : voit les trois dessins');
const supPc = supprimer(r.dessins, 'pc1', T + 30); await synchroniser('or', supPc, { conn, fetchFn: fetchW, maintenant: T + 31 });
const tab2 = await synchroniser('or', tab.dessins, { conn, fetchFn: fetchW, maintenant: T + 40 }); v(visibles(tab2.dessins).length === 2 && !visibles(tab2.dessins).some(d => d.id === 'pc1'), 'la suppression faite sur le PC se propage à la tablette');
const autre = await synchroniser('us100', [], { conn, fetchFn: fetchW, maintenant: T + 50 }); v(autre.dessins.length === 0, 'les dessins d’un actif ne se mélangent pas avec ceux d’un autre');
const mauvais = await synchroniser('or', [], { conn: { url: 'https://w.test', code: 'mauvais-code-123' }, fetchFn: fetchW }); v(mauvais.ok === false && mauvais.statut === 401, 'mauvais code : refusé (401), les dessins locaux restent');
const hors = await synchroniser('or', pc, { conn: null }); v(hors.ok === false && hors.horsConfig === true && hors.dessins === pc, 'Worker non configuré : aucun problème, les dessins restent locaux');
const reseau = await synchroniser('or', pc, { conn, fetchFn: async () => { throw new Error('hors ligne'); } }); v(reseau.ok === false && reseau.dessins === pc, 'hors ligne : liste locale conservée');
const rBad = await traiter(new Request('https://w.test/dessins', { method: 'PUT', headers: { 'X-Portefeuille-Code': 'code-de-test-123456', Origin: 'https://x.test' }, body: JSON.stringify({ actif: '../etc', dessins: [] }) }), env, depot); v(rBad.status === 400, 'actif invalide : 400');
const pollue = await traiter(new Request('https://w.test/dessins', { method: 'PUT', headers: { 'X-Portefeuille-Code': 'code-de-test-123456', Origin: 'https://x.test' }, body: JSON.stringify({ actif: 'or', dessins: [{ id: 'evil', type: 'horizontale', unite: 'H4', p: 'x', maj: 1, script: '<script>' }] }) }), env, depot); v((await pollue.json()).dessins.every(d => d.id !== 'evil'), 'le Worker rejette un dessin invalide');
v(lireConn(mem()) === null && lireConn({ getItem: () => JSON.stringify({ url: 'https://w.test/', code: 'abc' }) }).url === 'https://w.test', 'lecture de la connexion Portefeuille (même clé que la fenêtre Portefeuille)');
console.log(ko ? `✗ ${ko} échec(s), ${ok} ok` : `tous les tests passent (${ok})`); process.exit(ko ? 1 : 0);
