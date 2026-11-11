/* Tests de feuille-decision-v1 : 5 conditions en direct, « k / 5 », « Pas de contexte » au milieu, état du journal, rapport local honnête, aucun mot d'ordre, sceau SHA-256. */
import fs from 'node:fs'; import crypto from 'node:crypto';
import * as F from '../front/or/feuille-decision-v1.js';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('ÉCHEC', m); } };
const H = 3600e3, T0 = Date.UTC(2026, 1, 2), B = Array.from({ length: 300 }, (_, i) => ({ t: T0 + i * H, o: 4000, h: 4002, l: 3998, c: 4000 })), ATR = 10;
const zone = (cote, prix, extra = {}) => ({ id: `${cote}|${Math.round(prix / 0.5)}`, cote, prix, bas: prix - 1, haut: prix + 1, invalide: false, ...extra });
const sm = (ten, events = []) => ({ etat: { tendance: ten }, events, tendance: new Array(300).fill(ten) });
const base = { B, evenements: [], zones: [zone('vente', 4003), zone('achat', 3950), zone('achat', 3900)], qualifiees: [], prix: 4001, atr: ATR, h1: sm(0), h4: sm(0), lecture: null };
// au milieu : aucune boîte à proximité
const milieu = F.evaluer({ ...base, prix: 3975 }); v(!milieu.contexte && milieu.texte === 'Pas de contexte' && milieu.n === 0 && milieu.conditions.length === 5, 'au milieu : « Pas de contexte », 5 conditions grises');
// dans la boîte : 5 conditions évaluées, aucune réunie
const f0 = F.evaluer(base);
v(f0.contexte && f0.total === 5 && f0.conditions.length === 5 && f0.n === 1 && f0.texte === '1 / 5 conditions réunies' && f0.conditions[4].ok && !f0.conditions[0].ok, 'dans une boîte, seule la place jusqu à la zone suivante est réunie : 1 / 5 (' + f0.texte + ')');
const f1 = F.evaluer({ ...base, evenements: [{ type: 'confirmee', dir: -1, i: 297 }] }); v(f1.conditions[0].ok && /cassure confirmée baissière/.test(f1.conditions[0].detail) && f1.n === 2, 'condition 1 : événement sur la moyenne mobile récent');
v(!F.evaluer({ ...base, evenements: [{ type: 'confirmee', dir: -1, i: 280 }] }).conditions[0].ok, 'condition 1 : un événement vieux de 19 bougies ne compte pas'); v(!F.evaluer({ ...base, evenements: [{ type: 'expiree', dir: -1, i: 299 }] }).conditions[0].ok, 'une cassure expirée ne compte pas');
// condition 2 : boîte forte
const f2 = F.evaluer({ ...base, qualifiees: [zone('vente', 4003).id] }); v(f2.conditions[1].ok && /suffisante/.test(f2.conditions[1].detail), 'condition 2 : boîte qualifiée par la probabilité mesurée'); v(/insuffisante/.test(f0.conditions[1].detail), 'condition 2 grise : probabilité insuffisante');
// condition 3 : carnet
v(F.evaluer({ ...base, lecture: { ok: true, pourZone: 'retournement', pression: 'vendeuse' } }).conditions[2].ok, 'condition 3 : pression vendeuse sur une résistance'); v(!F.evaluer({ ...base, lecture: { ok: true, pourZone: 'cassure', pression: 'acheteuse' } }).conditions[2].ok, 'condition 3 : pression acheteuse contre une résistance : grise'); v(/indisponible/.test(f0.conditions[2].detail), 'condition 3 : carnet indisponible dit tel quel');
// condition 4 : tendances alignées dans le sens du retournement (baissier pour une résistance) ou CHoCH confirmé
v(F.evaluer({ ...base, h1: sm(-1), h4: sm(-1) }).conditions[3].ok, 'condition 4 : H1 et H4 baissières pour une résistance'); v(!F.evaluer({ ...base, h1: sm(1), h4: sm(1) }).conditions[3].ok, 'condition 4 : tendances haussières ≠ sens du retournement d\'une résistance');
const ch = F.evaluer({ ...base, h1: sm(1, [{ type: 'confirme', dir: -1, i: 290, t: B[290].t }]), h4: sm(1) }).conditions[3]; v(ch.ok && /retournement confirmé/.test(ch.detail), 'condition 4 : changement de caractère confirmé baissier récent');
v(!F.evaluer({ ...base, h1: sm(1, [{ type: 'confirme', dir: -1, i: 200, t: B[200].t }]), h4: sm(1) }).conditions[3].ok, 'un changement de caractère vieux de plus de 24 bougies ne compte pas');
// condition 5 : place ≥ 2 R. Résistance 4003, prix 4001 ; dFar = 4004 − 4001 = 3 ; stop = max(10, 3 + 2,5) = 10 ; zone suivante : support 3950 (haut 3951) → 50 $ = 5 R
const c5 = f0.conditions[4]; v(c5.ok && /5,0 R/.test(c5.detail) && /stop de 10,0 \$/.test(c5.detail), 'condition 5 : 5 R jusqu\'au support 3 950 pour un stop de 10 $ (' + c5.detail + ')');
const c5b = F.evaluer({ ...base, zones: [zone('vente', 4003), zone('achat', 3985)] }).conditions[4]; v(!c5b.ok && /1,5 R/.test(c5b.detail), 'condition 5 grise : 1,5 R seulement (' + c5b.detail + ')'); v(!F.evaluer({ ...base, zones: [zone('vente', 4003)] }).conditions[4].ok, 'condition 5 : aucune zone suivante = grise');
// toutes réunies
const tout = F.evaluer({ ...base, evenements: [{ type: 'rebond', dir: -1, i: 299 }], qualifiees: [zone('vente', 4003).id], lecture: { ok: true, pourZone: 'retournement', pression: 'vendeuse' }, h1: sm(-1), h4: sm(-1) }); v(tout.n === 5 && tout.texte === '5 / 5 conditions réunies' && tout.booleens.every(Boolean), '5 / 5 conditions réunies');
// zone d'achat : sens inversé
const fa = F.evaluer({ ...base, prix: 3951, h1: sm(1), h4: sm(1), zones: [zone('achat', 3950), zone('vente', 4003)] }); v(fa.sens === 1 && fa.conditions[3].ok, 'zone d\'achat : le sens attendu est haussier');
// invalidée : ignorée
v(!F.evaluer({ ...base, zones: [zone('vente', 4003, { invalide: true })] }).contexte, 'une zone invalidée ne crée pas de contexte');
// journal
const ej = F.etatPourJournal(tout); v(ej.version === F.VERSION && ej.conditions.length === 5 && ej.n === 5 && F.etatPourJournal(null) === null, 'état enregistré dans le journal : 5 booléens, version, zone');
// rapport
const rN = t => t.r; const peu = F.rapportJournal([{ feuille: ej, r: 1 }, { feuille: ej, r: -1 }], rN); v(!peu.assez && /Pas assez de trades.*2 trades clos.*il en faut 30/.test(peu.phrase), 'rapport : pas assez de trades (2 sur 30) : ' + peu.phrase.slice(0, 80));
const gros = []; for (let k = 0; k < 40; k++) gros.push({ feuille: { conditions: [k % 2 === 0, false, false, false, false] }, r: k % 2 === 0 ? 1 + (k % 3) * 0.1 : -1 + (k % 3) * 0.1 });
const rg = F.rapportJournal(gros, rN); v(rg.assez && rg.conditions[0].verdict.startsWith('semble compter') && rg.conditions[1].verdict === 'pas assez de données', 'rapport : la condition 1 « semble compter » avec 40 trades ; les autres : pas assez de données');
const all = JSON.stringify([milieu, f0, tout, peu, rg]); v(!/(achète|achetez|vends|vendez|entre en position)/i.test(all), 'aucun mot d\'ordre');
// sceau
{ const f = new URL('../front/or/feuille-decision-v1.js', import.meta.url), s = JSON.parse(fs.readFileSync(new URL('../front/or/feuille-decision-v1.sceau.json', import.meta.url), 'utf8')), sha = crypto.createHash('sha256').update(fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n')).digest('hex'); v(s.version === F.VERSION && s.sha256 === sha, 'sceau SHA-256 de feuille-decision-v1.js'); }
console.log(`feuille-decision : ${ok} ok, ${ko} échec`); process.exit(ko ? 1 : 0);
