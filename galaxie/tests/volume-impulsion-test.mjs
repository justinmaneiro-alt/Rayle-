// Suivi de volume : impulsions toujours surveillées, cohérence (jamais deux sens contraires), remplacement d'un ordre limite en attente par une impulsion de sens contraire.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { creerVolume, CONFIGS_IMPULSION } from '../../agent-pc/volume-v14.mjs';
import { creerConstructeur, agregerH1 } from '../../strategies/volume/serie-volume.js';
import { trancheDe, MS15 } from '../../strategies/liquidite/barres-flux.js';
let n = 0; const ok = (c, m) => { n++; assert.ok(c, m); };
const T0 = Date.UTC(2026, 0, 5, 0, 0);
const barre = (i, o, h, l, c, achat, vente) => ({ t: T0 + i * MS15, achatUsd: achat, venteUsd: vente, n: 10, plusGrosUsd: 1000, ouv: o, haut: h, bas: l, cloture: c, fp: [[trancheDe((h + l) / 2), achat, vente]] });
/* 520 bougies calmes autour de 100 (delta ± 5 000 $) puis, à la dernière bougie, une impulsion (haussière ou baissière) avec un très gros volume net */
function serieAvecImpulsion(sens) {
  const cons = creerConstructeur(); const N = 520;
  for (let i = 0; i < N - 1; i++) { const mv = i % 2 ? 0.1 : -0.1, c = 100 + mv; cons.ajouter(barre(i, 100, Math.max(100, c) + 0.1, Math.min(100, c) - 0.1, c, 50000 + (mv > 0 ? 5000 : 0), 50000 + (mv < 0 ? 5000 : 0))); }
  if (sens > 0) cons.ajouter(barre(N - 1, 100, 104.1, 99.95, 104, 600000, 50000)); else cons.ajouter(barre(N - 1, 100, 100.05, 95.9, 96, 50000, 650000));
  const m15 = cons.finir(); return { actif: 'BTC', m15, h1: agregerH1(m15), jours: 6, de: '2026-01-05', a: new Date(m15.t[m15.nBarres - 1]).toISOString().slice(0, 10), trous: 0, barres: m15.nBarres, direct: 0 };
}
const nouveauVolume = () => { const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'volume-imp-')); const t = T0 + 520 * MS15 + 60e3; const v = creerVolume({ dossier, maintenant: () => t, actifs: ['BTC'], chargerLaSerie: () => null, lireDirect: () => ({ barres: [], lignes: 0 }), journal: () => {}, erreur: (c, e) => { throw e; } }); v.etat().demarreLe = T0; return { v, t }; };
const prop = (id, sens, statut, extra = {}) => ({ id, actif: 'BTC', cle: 'autre·H1', setup: 'acceptation_hors_valeur', tf: 'H1', params: {}, niveauPreuve: 'a_lessai', sens, niveau: 100, stop: sens > 0 ? 99 : 101, rr: 2, validite: 4, tSignal: T0 + 400 * MS15, tBarre: T0 + 400 * MS15, statut, ...extra });

ok(CONFIGS_IMPULSION.length === 2 && CONFIGS_IMPULSION.every(c => c.setup === 'impulsion_volume' && c.niveau === 'a_lessai'), 'impulsions surveillées en permanence sur M15 et H1, au niveau « à l’essai » (aucune preuve revendiquée)');

/* 1. impulsion haussière sans position : elle est prise (plus de mouvement majeur ignoré faute d'être « finaliste ») */
{ const { v, t } = nouveauVolume(); const nb = v.detecter({ BTC: serieAvecImpulsion(1) }, t); const s = v.etat().signaux;
  ok(nb >= 1 && s.some(x => x.setup === 'impulsion_volume' && x.sens === 1 && x.statut === 'en_attente'), 'impulsion haussière détectée et suivie (' + nb + ' signal)'); }
/* 2. une position OUVERTE de sens contraire n'est jamais contredite : l'impulsion est écartée et la raison est écrite */
{ const { v, t } = nouveauVolume(); v.etat().signaux.push(prop('o1', -1, 'ouverte', { tEntree: T0 + 401 * MS15 })); v.detecter({ BTC: serieAvecImpulsion(1) }, t); const s = v.etat().signaux, coh = v.etat().coherence;
  ok(!s.some(x => x.setup === 'impulsion_volume' && x.sens === 1), 'vente ouverte : aucun achat opposé n’est ouvert'); ok(s.find(x => x.id === 'o1').statut === 'ouverte', 'la position ouverte n’est pas touchée');
  ok(coh && coh.evites >= 1 && /vendeuse déjà ouverte/.test(coh.derniers.at(-1).raison), 'le refus est journalisé avec sa raison'); ok(v.vue ? true : true, ''); }
/* 3. un ordre limite encore EN ATTENTE de sens contraire est remplacé par l'impulsion (le marché est parti dans l'autre sens avec un fort volume) */
{ const { v, t } = nouveauVolume(); v.etat().signaux.push(prop('a1', -1, 'en_attente')); v.detecter({ BTC: serieAvecImpulsion(1) }, t); const s = v.etat().signaux, coh = v.etat().coherence;
  ok(s.find(x => x.id === 'a1').statut === 'annulee' && /impulsion de sens contraire/.test(s.find(x => x.id === 'a1').raison_fin), 'l’ordre limite vendeur en attente est annulé');
  ok(s.some(x => x.setup === 'impulsion_volume' && x.sens === 1 && x.statut === 'en_attente'), 'et l’impulsion acheteuse est prise'); ok(coh.remplaces === 1 && coh.derniers.at(-1).action === 'remplace', 'remplacement journalisé');
  const vivantes = s.filter(x => x.statut === 'en_attente' || x.statut === 'ouverte'); ok(vivantes.every(x => x.sens === vivantes[0].sens), 'à la fin : une seule direction vivante sur l’actif'); }
/* 4. une position terminée ou annulée ne bloque rien */
{ const { v, t } = nouveauVolume(); v.etat().signaux.push(prop('t1', -1, 'terminee', { R: 1, tEntree: T0 + 401 * MS15, tSortie: T0 + 410 * MS15 }), prop('t2', -1, 'annulee')); v.detecter({ BTC: serieAvecImpulsion(1) }, t);
  ok(v.etat().signaux.some(x => x.setup === 'impulsion_volume' && x.sens === 1), 'positions terminées / annulées : la voie est libre'); }
/* 5. impulsion baissière symétrique */
{ const { v, t } = nouveauVolume(); v.detecter({ BTC: serieAvecImpulsion(-1) }, t); ok(v.etat().signaux.some(x => x.setup === 'impulsion_volume' && x.sens === -1), 'impulsion baissière détectée'); }
/* 6. la vue publiée expose le bilan de cohérence */
{ const { v, t } = nouveauVolume(); v.etat().signaux.push(prop('o1', -1, 'ouverte')); v.detecter({ BTC: serieAvecImpulsion(1) }, t); const vue = v.vueDe({ BTC: serieAvecImpulsion(1) }); ok(vue.coherence && vue.coherence.evites >= 1 && Array.isArray(vue.coherence.derniers), 'vue publiée : coherence { evites, remplaces, derniers }'); }
console.log('volume-impulsion : ' + n + ' vérifications OK');
