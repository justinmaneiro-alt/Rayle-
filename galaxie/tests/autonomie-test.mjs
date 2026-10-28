import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { detecterImpulsions, etaitPrise, majOccasions, resumeOccasions, contexteEn, expliquerExemple, resumeExemples, ajusterRecherche, ordonnerFamilles, pourquoiRienValide, rapportQuotidien, alerteObservationTexte, GARDE_FOU_OCCASIONS } from '../../strategies/autonomie.js';
import { construireContexte } from '../../planetes/mars/pc/agent-btc/contexte.js';
import { depuisBougies } from '../../planetes/mars/pc/agent-btc/colonnes.js';
import { planifier } from '../../agent-pc/recherche.mjs';
import { etatInitial } from '../../strategies/agent-etat.js';
import { creerRoutesFlux } from '../../app-pc/flux-routes.mjs';
import { empreinteV3 } from '../../strategies/criteres-v3.js';
import { marcheMixte } from '../../planetes/mars/tests/synth-btc.mjs';

let ok = 0, ko = 0;
const v = (nom, cond, detail = '') => { if (cond) ok++; else { ko++; console.log('KO  ' + nom + (detail !== '' ? ' — ' + detail : '')); } };
v('critères v3 inchangés', empreinteV3() === 'c9b4ddd4');

/* série avec une impulsion franche à la barre 700 (hausse de 4 ATR en 6 barres), précédée de ventes absorbées */
const t0 = Date.UTC(2026, 0, 5); const bougies = []; let c = 100;
for (let i = 0; i < 1000; i++) { const o = c; let cl = o + (i % 2 ? 0.04 : -0.04); if (i >= 701 && i <= 706) cl = o + 0.7; if (i === 700) cl = 100.05; bougies.push({ t: t0 + i * 900000, o, h: Math.max(o, cl) + 0.1, l: Math.min(o, cl) - 0.1, c: cl, v: i === 700 ? 400 : 100, vb: i === 700 ? 40 : (i % 2 ? 52 : 48) }); c = cl; }
const serie = depuisBougies(bougies), ctx = construireContexte(serie);
const imps = detecterImpulsions(serie, ctx.atr15, { n: 3 });
v('impulsion repérée : la grosse hausse après la barre 700, sens +1, au moins 3 ATR', imps.length >= 1 && imps.some(x => x.sens === 1 && x.i0 >= 692 && x.i0 <= 702 && x.ampleurATR >= 3), JSON.stringify(imps.slice(0, 3)));
v('une zone calme ne produit aucune impulsion avant la barre 600', imps.every(x => x.i0 > 600));
const imp = imps.find(x => x.i0 >= 692), tr = [{ t: serie.t[imp.i0], tSortie: serie.t[imp.i0] + 3600e3, sens: 1 }];
v('« prise » seulement si une position dans le même sens couvrait le début de l’impulsion', etaitPrise(imp, serie, tr) && !etaitPrise(imp, serie, [{ t: serie.t[imp.i0], tSortie: serie.t[imp.i0] + 3600e3, sens: -1 }]) && !etaitPrise(imp, serie, []));
const cx = contexteEn(ctx, 700, 1); v('contexte connu AVANT l’impulsion : phase, session, volume relatif, quatre drapeaux de flux (absorption des ventes à la barre 700)', ['phase', 'session', 'volumeRel', 'absorption', 'divergence_cvd', 'balayage_liquidite', 'flux_persistant'].every(k => k in cx) && cx.absorption === true && cx.volumeRel > 3, JSON.stringify(cx));
const journal = { liste: [] }, n1 = majOccasions(journal, ctx, []), n2 = majOccasions(journal, ctx, []);
v('journal des occasions : ajouté une fois, jamais deux (par date), non prises par défaut', n1 >= 1 && n2 === 0 && journal.liste.every(x => x.prise === false));
const r = resumeOccasions(journal); v('résumé : total, manquées, contextes comptés, et le GARDE-FOU est rappelé (génère des hypothèses, ne valide jamais)', r.total === journal.liste.length && r.ratees === r.total && /jamais à les valider/.test(r.avertissement) && r.avertissement === GARDE_FOU_OCCASIONS && /retestée sur des données qu’elle n’a pas vues/.test(r.resume));
v('journal vide : message honnête', /Aucune impulsion/.test(resumeOccasions({ liste: [] }).resume));
/* causalité : le contexte d'une impulsion ne dépend pas de ce qui suit */
{ const court = construireContexte(depuisBougies(bougies.slice(0, 702))); const a = contexteEn(court, 700, 1); v('contexte causal : identique quand on coupe la série juste après la barre', JSON.stringify(a) === JSON.stringify(cx)); }
/* exemples de Justin */
{
  const ex1 = { t: serie.t[700] + 900e3, sens: 'achat', actif: 'BTC' }, ex2 = { t: serie.t[300], sens: 'vente', actif: 'BTC' };
  const e1 = expliquerExemple(ex1, ctx, { familles: ['absorption_extreme', 'divergence_cvd'] }), e2 = expliquerExemple(ex2, ctx, { familles: ['absorption_extreme'] });
  v('un exemple « j’aurais acheté » juste après l’absorption est expliqué par la famille d’absorption', e1.explique && e1.par.includes('absorption_extreme') && !!e1.contexte, JSON.stringify(e1.par));
  v('un exemple sans signal correspondant n’est PAS expliqué (c’est une piste, pas une preuve)', e2.explique === false && e2.par.length === 0);
  v('exemple hors des données : dit clairement', expliquerExemple({ t: 1, sens: 'achat', actif: 'BTC' }, ctx).explique === false);
  const re = resumeExemples([{ ...ex1, explication: e1 }, { ...ex2, explication: e2 }]); v('résumé des exemples : « X sur N expliqués », pistes jamais preuves', re.total === 2 && re.expliques === 1 && /pistes pour de nouvelles hypothèses, jamais des preuves/.test(re.phrase) && /Aucun exemple/.test(resumeExemples([]).phrase));
}
/* ajustement de la recherche */
{
  const diag = { balayages: [{ id: 'a', nom: 'Mauvaise', paire: 'BTC', avecAssezDeTrades: 30, positivesBrutes: 0, positivesNettes: 0, nettesSeuil: 0, meilleur: { esperance: -0.3 } }, { id: 'b', nom: 'Prometteuse', paire: 'BTC', avecAssezDeTrades: 30, positivesBrutes: 20, positivesNettes: 8, nettesSeuil: 1, meilleur: { esperance: 0.3 } }, { id: 'c', nom: 'Neutre', paire: 'BTC', avecAssezDeTrades: 5, positivesBrutes: 0, positivesNettes: 0, nettesSeuil: 0, meilleur: { esperance: -0.3 } }] };
  const aj = ajusterRecherche(diag); v('ajustement : creuser la prometteuse, abandonner celle qui perd même avant frais, laisser la neutre (trop peu de variantes)', aj.creuser.join() === 'b' && aj.abandonner.join() === 'a' && aj.raisons.length === 2);
  const ids = ['a', 'b', 'c']; v('ordre : « à creuser » d’abord, « abandonnées » retirées', ordonnerFamilles(ids, aj).join() === 'b,c' && ordonnerFamilles(ids, aj, { revue: true }).join() === 'b,a,c' && ordonnerFamilles(ids, null).join() === 'a,b,c');
  const e = etatInitial(1e12); const dfp = { BTC: 1e12 }, base = planifier(e, { paires: ['BTC'], debutFinal: dfp, cache: { has: () => false }, generations: 0 }), prio = planifier(e, { paires: ['BTC'], debutFinal: dfp, cache: { has: () => false }, generations: 0, priorites: { creuser: [base[base.length - 1].famille], abandonner: [base[0].famille] } });
  v('le planificateur applique les priorités (la dernière famille passe devant, la première est mise de côté)', prio[0].famille === base[base.length - 1].famille && !prio.some(t => t.famille === base[0].famille) && prio.length === base.length - 1);
  v('le jour de revue, les familles mises de côté reviennent', planifier(e, { paires: ['BTC'], debutFinal: dfp, cache: { has: () => false }, generations: 0, priorites: { creuser: [], abandonner: [base[0].famille] }, revue: true }).length === base.length);
  const d2 = { conclusion: { chiffres: { posBrutes: 255, posNettes: 87, seuil: 5 }, verdict: 'PEU DE PISTES' }, entonnoir: { criteres: [{ part: 1 }, { part: 0.96 }, { part: 0.5 }] }, hasard: [{ coutsMoyens: 0.25 }] };
  const p5 = pourquoiRienValide(d2, etatInitial(1e12)); v('« pourquoi rien n’est validé aujourd’hui » en 5 lignes au plus, chiffres du diagnostic, sans critère assoupli', p5.length === 5 && /255 variantes positives avant frais/.test(p5.join(' ')) && /critères ne changent pas/.test(p5[4]));
  const rq = rapportQuotidien({ diag: d2, etat: etatInitial(1e12), pepiniere: { actives: 40, tradesTotal: 120, acceptees: 0 }, equipe: { chercheur: { hypotheses: { total: 12 } }, auditeur: { rejetes: 1 } }, hypothesesAcceptees: 4, occasions: { total: 30, ratees: 25 }, exemples: { total: 2, phrase: '1 exemple sur 2 expliqué.' }, flux: { enregistre: true, phrase: 'Enregistre BTC/SOL/DOGE depuis 3,0 jour(s), 0,40 Go sur 15 Go, trous : 2.' }, donnees: { trous: 5 }, disqueLibreGo: 8, pcVivant: true }, Date.UTC(2026, 9, 28, 7));
  v('rapport quotidien court (≤ 11 lignes) : état, pépinière, équipe, occasions, carnet, trous, santé du PC, rappel « aucun ordre »', rq.length <= 11 && /28\/10\/2026/.test(rq[0]) && rq.some(l => /Pépinière : 40/.test(l)) && rq.some(l => /Équipe : 4 nouvelle/.test(l)) && rq.some(l => /Carnet : enregistré BTC/.test(l)) && rq.some(l => /5 trou/.test(l)) && rq.some(l => /ATTENTION : disque presque plein/.test(l)) && /aucun ordre/.test(rq[rq.length - 1]), rq.join(' | '));
  const rqKo = rapportQuotidien({ diag: d2, etat: etatInitial(1e12), flux: { enregistre: false, phrase: 'ARRÊTÉ (dernier battement il y a 90 min)' }, pcVivant: false }); v('carnet arrêté ou service arrêté : signalé clairement', rqKo.some(l => /ATTENTION carnet/.test(l)) && rqKo.some(l => /service arrêté/.test(l)));
  const ob = alerteObservationTexte({ nom: 'Idée', paire: 'BTC', sens: 1, stop: 81000 }); v('alerte « Observation (non validé) » : « observation, pas de preuve statistique », jamais confondue avec une alerte validée', /OBSERVATION \(non validé\)/.test(ob[0]) && /pas de preuve statistique/.test(ob[0]) && /PAS passé les critères/.test(ob[2]) && /Aucun ordre/.test(ob[2]));
}
/* route locale des exemples (seule écriture) */
{
  const dos = fs.mkdtempSync(path.join(os.tmpdir(), 'rayle-ex-')), R = creerRoutesFlux({ ...process.env, RAYLE_AGENT_DOSSIER: dos }), srv = http.createServer((req, res) => R.gerer(req, res, new URL(req.url, 'http://x').pathname)); await new Promise(r => srv.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + srv.address().port;
  const post = (b, h = {}) => fetch(base + '/__flux/exemples', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Rayle-Multi': '1', ...h }, body: JSON.stringify(b) });
  const r1 = await post({ t: Date.now(), sens: 'achat', actif: 'BTC', flux: 'binance-spot', prix: 81000 });
  v('POST /__flux/exemples : un exemple valide est écrit', r1.status === 200 && fs.readFileSync(path.join(dos, 'exemples.jsonl'), 'utf8').split('\n').filter(Boolean).length === 1);
  v('exemple invalide (sens, actif, date) refusé', (await post({ t: 5, sens: 'achat', actif: 'BTC' })).status === 400 && (await post({ t: Date.now(), sens: 'acheter', actif: 'BTC' })).status === 400 && (await post({ t: Date.now(), sens: 'achat', actif: 'ETH' })).status === 400);
  v('sans l’en-tête de Rayle : refusé (403)', (await fetch(base + '/__flux/exemples', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status === 403);
  const g = await (await fetch(base + '/__flux/exemples')).json(); v('GET /__flux/exemples : la liste', g.ok && g.exemples.length === 1 && g.exemples[0].actif === 'BTC');
  v('toute autre écriture reste refusée (405)', (await fetch(base + '/__flux/statut', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Rayle-Multi': '1' }, body: '{}' })).status === 405);
  srv.close(); fs.rmSync(dos, { recursive: true, force: true });
}
console.log(ok + ' réussis, ' + ko + ' échecs'); process.exit(ko ? 1 : 0);
