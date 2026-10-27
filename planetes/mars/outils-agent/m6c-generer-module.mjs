import fs from 'node:fs';
import { CRITERES_M6C, empreinteM6c } from '../pc/agent-m6c/criteres-m6c.js';

/* Écrit planetes/mars/pc/agent-m6c/resultats-m6c.js à partir des DERNIERS fichiers de docs/resultats-m6c/ (validation-*.json et mesures-*.json).
   Ce module est lu par la page (statuts des règles, tableau de performance) : il ne contient que des RÉSULTATS MESURÉS (jamais inventés) et la date de la mesure. */
const dossier = new URL('../../../docs/resultats-m6c/', import.meta.url), dernier = prefixe => { const f = fs.readdirSync(dossier).filter(x => x.startsWith(prefixe) && x.endsWith('.json')).sort().pop(); if (!f) throw new Error('aucun fichier ' + prefixe); return { f, j: JSON.parse(fs.readFileSync(new URL(f, dossier), 'utf8')) }; };
const val = dernier('validation-'), mes = dernier('mesures-');
const reduire = (a, max = 80) => { if (!a || a.length <= max) return a || []; const out = []; for (let i = 0; i < max; i++) out.push(+a[Math.round(i * (a.length - 1) / (max - 1))].toFixed(2)); return out; };
const r2 = x => (x == null ? null : Math.round(x * 1000) / 1000);
const R = { genereLe: new Date().toISOString().slice(0, 10), sources: [val.f, mes.f], criteres: { version: CRITERES_M6C.version, empreinte: empreinteM6c(), figesLe: CRITERES_M6C.figesLe }, paires: {} }, STATUTS = {};
for (const [p, v] of Object.entries(val.j)) {
  STATUTS[p] = {}; const o = { bougies: v.bougies, zoneAMois: Math.round(v.zoneAMois), nVariantes: v.nVariantes, regles: {}, mesures: mes.j[p] || null };
  for (const [id, r] of Object.entries(v.regles)) {
    STATUTS[p][id] = r.statut ? r.statut.statut : 'INFORMATION'; const st = r.stats || (r.wf && r.wf.stats) || {};
    o.regles[id] = { statut: STATUTS[p][id], raisons: r.statut ? r.statut.raisons.slice(0, 6) : [], n: st.n, esperance: r2(st.esperance), Rtotal: r2(st.Rtotal), ddR: r2(st.ddR), tauxReussite: r2(st.tauxReussite), factProfit: r2(st.factProfit), parSemaine: r2(st.parSemaine), rendementPct: r2(st.rendementPct), ddPct: r2(st.ddPct), courbeR: reduire(st.courbeR),
      centileHasard: r2(r.hasard && r.hasard.centile), croisement: r.croisement ? { n: r.croisement.n, esperance: r2(r.croisement.esperance) } : null, gainFiltre: r2(r.gainFiltre), achatConservation: r.achatConservation ? { rendementPct: r2(r.achatConservation.rendementPct), ddPct: r2(r.achatConservation.ddPct), rapport: r2(r.achatConservation.rapport) } : null,
      parAnnee: (r.parAnnee || []).map(a => ({ annee: a.annee, n: a.n, R: r2(a.R) })), parRegime: (r.parRegime || []).map(a => ({ regime: a.regime, n: a.n, esperance: r2(a.esperance), taux: r2(a.taux) })), cotes: r.cotes ? { long: { n: r.cotes.long.n, esperance: r2(r.cotes.long.esperance) }, court: { n: r.cotes.court.n, esperance: r2(r.cotes.court.esperance) } } : null,
      defautOOS: r.defautOOS ? { n: r.defautOOS.n, esperance: r2(r.defautOOS.esperance) } : null, Rtrades: (r.wf && r.wf.Rtrades) || [], lignes: (r.lignes || []).map(l => ({ critere: l.critere, ok: l.ok })), evenements: (r.evenements || []).length };
  }
  R.paires[p] = o;
}
const texte = '/* GÉNÉRÉ par planetes/mars/outils-agent/m6c-generer-module.mjs : NE PAS ÉDITER À LA MAIN. Résultats MESURÉS de la validation M6c (zone de recherche A seulement, jeu final jamais ouvert), source : ' + R.sources.join(' + ') + '. */\n' +
  'export const RESULTATS_M6C = ' + JSON.stringify(R) + ';\nexport const STATUTS_M6C = ' + JSON.stringify(STATUTS) + ';\n';
fs.writeFileSync(new URL('../pc/agent-m6c/resultats-m6c.js', import.meta.url), texte);
console.log('resultats-m6c.js écrit (' + texte.length + ' octets) ; statuts :', JSON.stringify(STATUTS));
