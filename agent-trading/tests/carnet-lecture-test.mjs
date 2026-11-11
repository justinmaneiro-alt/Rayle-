/* Tests de carnet-lecture-v1 : déséquilibre dans ±0,3 ATR, murs et taille relative, flux exécuté 1 et 5 min, absorption, persistance 30 s, mur retiré / mangé, verdict d'une phrase,
   mention « non validée », issue forward à 6 / 12 / 24 bougies, rapport honnête, aucun mot d'ordre, sceau SHA-256. */
import fs from 'node:fs'; import crypto from 'node:crypto';
import * as C from '../front/or/carnet-lecture-v1.js';
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('ÉCHEC', m); } };
const carnet = (bids, asks) => ({ bids: new Map(bids), asks: new Map(asks) });
const base = (extra = {}) => { const b = [], a = []; for (let k = 0; k < 40; k++) { b.push([4099.75 - k * 0.25, 5 + (k % 3)]); a.push([4100.25 + k * 0.25, 5 + (k % 3)]); } for (const [p, q, c] of extra.murs || []) (c === 'a' ? a : b).push([p, q]); return carnet(b, a); };
const ATR = 10, t = 1e12;
// milieu et déséquilibre
const c0 = base(), m = C.milieu(c0); v(Math.abs(m.mid - 4100) < 1e-9, 'milieu du carnet');
const d0 = C.desequilibre(c0, 4100, ATR); v(d0.partAcheteurs > 0.4 && d0.partAcheteurs < 0.6 && d0.largeur === 3, 'carnet équilibré : ~50 % dans ±3 $ (0,3 ATR)');
const cv = base({ murs: [[4101, 400, 'a']] }), dv = C.desequilibre(cv, 4100, ATR); v(dv.partVendeurs >= 0.6, 'mur vendeur dans ±0,3 ATR : part vendeuse ≥ 60 % (' + Math.round(dv.partVendeurs * 100) + ' %)');
const dh = C.desequilibre(base({ murs: [[4099, 400, 'b']] }), 4100, ATR); v(dh.partAcheteurs >= 0.6, 'mur acheteur : part acheteuse ≥ 60 %');
// murs
const ms = C.murs(cv, 4100, ATR); v(ms.length === 1 && ms[0].cote === 'vente' && ms[0].p === 4101 && ms[0].x > 10, 'plus gros mur : côté, prix, multiple de la médiane (' + (ms[0] && ms[0].x.toFixed(0)) + ' fois)');
v(C.murs(c0, 4100, ATR).length === 0, 'aucun mur sur un carnet régulier');
// flux
const tr = []; for (let k = 0; k < 20; k++) tr.push({ t: t - 200e3 + k * 9e3, p: 4100 - k * 0.01, q: 3, cote: 'sell' }); for (let k = 0; k < 5; k++) tr.push({ t: t - 30e3 + k * 5e3, p: 4099.9, q: 1, cote: 'buy' });
const f1 = C.flux(tr, t, 60e3), f5 = C.flux(tr, t, 300e3); v(f5.delta === 3 * 20 * -1 + 5 && f5.n === 25, 'delta sur 5 min = achats − ventes agressifs (' + f5.delta + ')'); v(f1.n < f5.n && f1.ms === 60000, 'fenêtre de 1 minute plus courte que celle de 5 minutes');
v(C.flux(tr, t, 300e3).partDelta < -0.5, 'part du delta dans le volume agressif');
// absorption : ventes agressives, prix qui ne baisse pas
const trA = []; for (let k = 0; k < 30; k++) trA.push({ t: t - 250e3 + k * 8e3, p: 4100 + (k % 2) * 0.05, q: 4, cote: 'sell' }); const ab = C.absorption(C.flux(trA, t, 300e3), ATR); v(ab && ab.cote === 'achat' && /absorbées/.test(ab.texte), 'absorption : ventes agressives sans baisse du prix');
const trM = []; for (let k = 0; k < 30; k++) trM.push({ t: t - 250e3 + k * 8e3, p: 4100 - k * 0.3, q: 4, cote: 'sell' }); v(C.absorption(C.flux(trM, t, 300e3), ATR) === null, 'pas d absorption quand le prix baisse de 8,7 $ sous les ventes agressives');
// suivi des murs : persistance 30 s, retiré / mangé
const S = C.creerSuiviMurs(); let r = S.maj(cv, [], t, 4100, ATR); v(r.murs.length === 1 && !r.murs[0].persistant && r.murs[0].age === 0, 'un mur nouveau n\'est pas persistant');
r = S.maj(cv, [], t + 40e3, 4100, ATR); v(r.murs[0].persistant && r.murs[0].age === 40e3, 'persistant après 30 s (âge 40 s)');
r = S.maj(c0, [], t + 41e3, 4100, ATR); v(r.nouveauxRetires.length === 1 && r.nouveauxRetires[0].raison === 'retiré sans être exécuté', 'mur disparu sans transaction : signalé « retiré sans être exécuté »');
const S2 = C.creerSuiviMurs(); S2.maj(cv, [], t, 4100, ATR); const r2 = S2.maj(c0, [{ t: t + 5000, p: 4101, q: 300, cote: 'buy' }], t + 20e3, 4100, ATR); v(r2.nouveauxRetires.length === 1 && /mangé/.test(r2.nouveauxRetires[0].raison), 'mur disparu avec des transactions au même prix : « mangé »');
const S3 = C.creerSuiviMurs(); S3.maj(cv, [], t, 4100, ATR); const r3 = S3.maj(cv, [], t + 1000, 4100, ATR); v(r3.nouveauxRetires.length === 0, 'mur toujours présent : pas de retrait');
// verdict d'une phrase
const zoneV = { cote: 'vente', prix: 4135, bas: 4134.5, haut: 4135.5 };
const trV = []; for (let k = 0; k < 30; k++) trV.push({ t: t - 280e3 + k * 9e3, p: 4100 - k * 0.02, q: 14, cote: 'sell' });
const Sv = C.creerSuiviMurs(); Sv.maj(cv, [], t - 300e3, 4100, ATR); const suiv = Sv.maj(cv, trV, t, 4100, ATR);
const lv = C.lire({ carnet: cv, trades: trV, now: t, atr: ATR, zone: zoneV, suivi: suiv });
v(lv.ok && lv.pression === 'vendeuse' && lv.pourZone === 'retournement' && lv.bougie.couleur === 'rouge' && /% d'ordres à la vente dans ±3 \$/.test(lv.texte) && /delta −/.test(lv.texte) && /mur de 400 lots/.test(lv.texte) && /maintenu depuis 5 min/.test(lv.texte) && /pression vendeuse, retournement plus plausible/.test(lv.texte), 'verdict : résistance + pression vendeuse = retournement plus plausible (' + lv.texte + ')');
const lc = C.lire({ carnet: cv, trades: trV, now: t, atr: ATR, zone: { cote: 'achat', prix: 4065, bas: 4064.5, haut: 4065.5 }, suivi: suiv }); v(lc.pourZone === 'cassure' && /cassure plus plausible/.test(lc.texte), 'même pression vendeuse sur un SUPPORT : cassure plus plausible');
const ln = C.lire({ carnet: c0, trades: [], now: t, atr: ATR, zone: zoneV }); v(ln.pression === 'neutre' && ln.bougie.couleur === 'gris' && /pas de pression nette/.test(ln.texte), 'carnet calme : pression neutre, mini-bougie grise');
const lh = C.lire({ carnet: base({ murs: [[4099, 400, 'b']] }), trades: trV.map((x, k) => ({ ...x, cote: 'buy', p: 4100 + k * 0.2 })), now: t, atr: ATR, zone: zoneV }); v(lh.pression === 'acheteuse' && lh.bougie.couleur === 'vert', 'pression acheteuse : mini-bougie verte');
v(!C.lire({ carnet: null, trades: [], now: t, atr: ATR, zone: zoneV }).ok, 'carnet indisponible : lecture refusée, jamais inventée');
v(![lv, lc, ln, lh].some(x => /(achète|achetez|vends|vendez|entre en position)/i.test(x.texte)), 'aucun mot d\'ordre dans les verdicts');
// mention
v(/non validée \(3 cas enregistrés, il en faut 30\)/.test(C.mentionValidation(3)) && /pas encore une règle/.test(C.mentionValidation(31)), 'mention « lecture en observation, non validée » tant que n < 30');
// issue forward
const H = 3600e3, T0 = Date.UTC(2026, 1, 2); const Bf = Array.from({ length: 30 }, (_, i) => ({ t: T0 + i * H, o: 4100, h: 4101, l: 4099, c: 4100 })); Bf[3].l = 4085;   // −15 $ : retournement d'une zone de vente (ATR 10 : 1 ATR = 10 $)
v(C.issueForward(Bf, T0 + 1.5 * H, 4100, 'vente', 10, 6) === 1, 'issue forward : retournement d\'une zone de vente (le prix baisse de 1 ATR)'); Bf[4].h = 4115; v(C.issueForward(Bf, T0 + 1.5 * H, 4100, 'vente', 10, 6) === 1, 'le retournement vient avant la cassure'); const Bg = Bf.map(b => ({ ...b })); Bg[3] = { ...Bg[3], l: 4099, h: 4112 }; v(C.issueForward(Bg, T0 + 1.5 * H, 4100, 'vente', 10, 6) === -1, 'cassure : le prix monte de 1 ATR avant de baisser');
v(C.issueForward(Bf, T0 + 28 * H, 4100, 'vente', 10, 6) === null, 'horizon pas encore écoulé : pas d\'issue');
// rapport honnête
const reg = []; for (let k = 0; k < 4; k++) { reg.push({ kind: 'arrivee', id: 'a' + k, pourZone: 'retournement' }); reg.push({ kind: 'resultat', id: 'a' + k, h: 12, issue: k % 2 ? 1 : -1 }); }
const rap = C.rapportForward(reg); v(/Pas assez de données/.test(rap.phrases[0]) && rap.classes[12].retournement.n === 4, 'rapport : pas assez de données avec 4 cas');
const reg2 = []; for (let k = 0; k < 40; k++) { reg2.push({ kind: 'arrivee', id: 'r' + k, pourZone: 'retournement' }, { kind: 'resultat', id: 'r' + k, h: 12, issue: k < 30 ? 1 : -1 }, { kind: 'arrivee', id: 'c' + k, pourZone: 'cassure' }, { kind: 'resultat', id: 'c' + k, h: 12, issue: k < 10 ? 1 : -1 }); }
const rap2 = C.rapportForward(reg2); v(/sépare/.test(rap2.phrases[0]) && /75 %/.test(rap2.phrases[0]) && /25 %/.test(rap2.phrases[0]), 'rapport : séparation mesurée avec n et IC (' + rap2.phrases[0].slice(0, 100) + ')');
// sceau
{ const f = new URL('../front/or/carnet-lecture-v1.js', import.meta.url), s = JSON.parse(fs.readFileSync(new URL('../front/or/carnet-lecture-v1.sceau.json', import.meta.url), 'utf8')), sha = crypto.createHash('sha256').update(fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n')).digest('hex'); v(s.version === C.VERSION && s.sha256 === sha, 'sceau SHA-256 de carnet-lecture-v1.js'); }
console.log(`carnet-lecture : ${ok} ok, ${ko} échec`); process.exit(ko ? 1 : 0);
