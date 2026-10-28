// Estimation du spread et du glissement RÉELS d'après le carnet d'ordres enregistré par le service (V6, phase 1).
//   node agent-pc/estimer-couts.mjs [--heures 24] [--cles kraken-BTC,binance-fut-BTC] [--montants 5000,20000,100000]
// Lit le carnet enregistré (lecture seule), calcule : le spread moyen par heure UTC (meilleur achat / meilleure vente) et le glissement d'un ordre au marché de chaque montant, mange le carnet tranche par tranche.
// N'ÉCRIT RIEN dans couts.json : ce sont des suggestions (couts-estimes.json) que Justin recopie s'il est d'accord. Le carnet enregistré ne couvre que ±3 % autour du prix : un montant trop gros pour lui
// est signalé « carnet insuffisant », jamais un chiffre inventé. Frais maker / taker : non publiés par l'API, à lire dans le contrat (question dans docs/QUESTIONS_POUR_JUSTIN.md).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dossierAgent } from './etat-agent.mjs';
import { creerStockage } from './flux/stockage-flux.mjs';
import { estimerGlissement, niveauxDepuisTranches, spreadParHeure, moyenne } from '../strategies/couts-r.js';

const fr = (x, d = 3) => (x == null || !Number.isFinite(x) ? '—' : x.toFixed(d).replace('.', ','));
const mediane = l => { if (!l.length) return null; const s = l.slice().sort((a, b) => a - b); return s[s.length >> 1]; };

/* Calcule les estimations pour une clé de flux (ex. « kraken-BTC »). `lireProfondeur(cle, t0, t1)` rend { entete, enregistrements } (injecté : testable sans disque). */
export function estimerPourCle(lireProfondeur, cle, { t1 = Date.now(), heures = 24, montants = [5000, 20000, 100000], pasSecondes = 10 } = {}) {
  const d = lireProfondeur(cle, t1 - heures * 3600e3, t1); if (!d || !d.entete || !d.enregistrements.length) return { cle, ok: false, raison: 'pas de carnet enregistré sur cette période' };
  const e = d.entete, enr = d.enregistrements.filter((r, i) => i % pasSecondes === 0), inst = enr.map(r => ({ t: r.tSec * 1000, meilleurAchat: r.meilleurBid, meilleureVente: r.meilleurAsk }));
  const sp = spreadParHeure(inst), gl = {};
  for (const m of montants) {
    const achats = [], ventes = [], insuffisants = { achat: 0, vente: 0 };
    for (const r of enr) {
      const milieu = (r.meilleurBid + r.meilleurAsk) / 2; if (!(milieu > 0)) continue;
      const a = estimerGlissement(niveauxDepuisTranches(Array.from(r.ask), r.meilleurAsk, e.pasPct, 'ask'), m, milieu), v = estimerGlissement(niveauxDepuisTranches(Array.from(r.bid), r.meilleurBid, e.pasPct, 'bid'), m, milieu);
      if (a) { if (a.epuise) insuffisants.achat++; else achats.push(a.glissementPct); } if (v) { if (v.epuise) insuffisants.vente++; else ventes.push(v.glissementPct); }
    }
    gl[m] = { achatMedianPct: mediane(achats), venteMedianPct: mediane(ventes), pire95Pct: achats.length ? achats.slice().sort((x, y) => x - y)[Math.floor(achats.length * 0.95)] : null, echantillons: achats.length + ventes.length, carnetInsuffisant: insuffisants };
  }
  const demiSpread = sp.moyenne != null ? sp.moyenne / 2 : null;
  return { cle, ok: true, secondes: enr.length * pasSecondes, du: new Date(inst[0].t).toISOString(), au: new Date(inst[inst.length - 1].t).toISOString(), spreadMoyenPct: sp.moyenne, spreadParHeure: sp.parHeure, multiplicateurs: sp.multiplicateurs, demiSpreadPct: demiSpread, glissement: gl };
}
/* Suggestion de réglage pour couts.json : spread médian mesuré, glissement médian d'un ordre de `montant`. À recopier par Justin. */
export function suggestion(estim, montant) {
  if (!estim || !estim.ok) return null; const g = estim.glissement[montant]; if (!g || g.achatMedianPct == null) return null;
  const glissementPct = +(((g.achatMedianPct + (g.venteMedianPct == null ? g.achatMedianPct : g.venteMedianPct)) / 2) - (estim.demiSpreadPct || 0)).toFixed(4);
  return { spreadPct: +estim.spreadMoyenPct.toFixed(4), glissementPct: Math.max(0, glissementPct), note: 'mesuré sur ' + Math.round(estim.secondes / 3600) + ' h de carnet (' + estim.cle + '), ordre de ' + montant + ' $ ; le glissement ci-dessus est le surplus au-delà du demi-spread ; les tranches du carnet font 0,02 % de large : 0,01 % est le PLANCHER de ce que cette mesure peut voir' };
}

const estPrincipal = () => { try { return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url); } catch (e) { return false; } };
if (estPrincipal()) {
  const args = process.argv.slice(2), arg = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  const dossier = dossierAgent(), heures = Number(arg('--heures') || 24), montants = (arg('--montants') || '5000,20000,100000').split(',').map(Number);
  const cles = (arg('--cles') || 'kraken-BTC,binance-fut-BTC,kraken-SOL,kraken-DOGE').split(','), st = creerStockage({ dossier: path.join(dossier, 'flux') }), sortie = {};
  for (const c of cles) {
    const e = estimerPourCle((k, a, b) => st.lireProfondeur(k, a, b), c, { heures, montants }); sortie[c] = e;
    if (!e.ok) { console.log(c + ' : ' + e.raison); continue; }
    console.log('\n' + c + ' — ' + e.du.slice(0, 16) + ' → ' + e.au.slice(0, 16) + ' (UTC)');
    console.log('  spread moyen : ' + fr(e.spreadMoyenPct) + ' % ; par heure UTC : ' + e.spreadParHeure.map((x, h) => (x == null ? '—' : h + 'h ' + fr(x))).join(' · '));
    for (const m of montants) { const g = e.glissement[m]; console.log('  ordre de ' + m + ' $ au marché : glissement médian ' + fr(g.achatMedianPct) + ' % à l’achat, ' + fr(g.venteMedianPct) + ' % à la vente' + (g.carnetInsuffisant.achat || g.carnetInsuffisant.vente ? ' (carnet insuffisant ' + g.carnetInsuffisant.achat + ' / ' + g.carnetInsuffisant.vente + ' fois)' : '')); }
    const s = suggestion(e, montants[1] || montants[0]); if (s) console.log('  à recopier dans couts.json si tu es d’accord : ' + JSON.stringify({ spreadPct: s.spreadPct, glissementPct: s.glissementPct }) + ' — ' + s.note);
  }
  fs.writeFileSync(path.join(dossier, 'couts-estimes.json'), JSON.stringify({ t: Date.now(), heures, estimations: sortie }), 'utf8'); console.log('\nÉcrit : ' + path.join(dossier, 'couts-estimes.json') + ' (suggestions seulement ; couts.json n’est pas modifié).');
}
