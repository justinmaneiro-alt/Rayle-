// Données de DÉRIVÉS de Binance pour une paire (financement, intérêt ouvert, ratios long/short, ratio acheteur/vendeur agressif) : gratuites, sans clé, via les API publiques et les archives de
// data.binance.vision. Mises à jour chaque jour par le service de l'agent ; stockées sur le PC (jamais dans git).
// Les liquidations n'ont AUCUNE source gratuite complète : aucun montant n'est présenté comme réel (voir planetes/mars/pc/agent-btc/deriv-donnees.js).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { analyserMetrics, lireZipTexte } from '../planetes/mars/pc/agent-btc/deriv-donnees.js';
import { paire as infoPaire } from '../planetes/mars/pc/agent-m6/paires.js';

const JOUR = 86400e3, HEURE = 3600e3;
export const urlFunding = (symbole, t0, limite = 1000) => 'https://fapi.binance.com/fapi/v1/fundingRate?symbol=' + symbole + '&startTime=' + t0 + '&limit=' + limite;
export const urlArchive = (symbole, jour) => 'https://data.binance.vision/data/futures/um/daily/metrics/' + symbole + '/' + symbole + '-metrics-' + jour + '.zip';
export const jourISO = t => new Date(t).toISOString().slice(0, 10);
const inflater = async octets => new Uint8Array(zlib.inflateRawSync(octets));
const lireJsonFichier = (f, def) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return def; } };
const ecrireJsonFichier = (f, v) => { const tmp = f + '.tmp'; fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(tmp, JSON.stringify(v)); fs.renameSync(tmp, f); };

/* Réduit des lignes de 5 minutes à une par heure (dernière valeur de l'heure) : l'agent travaille en M15/H1. */
export function reduireHoraire(lignes) {
  const m = new Map(); for (const l of lignes) m.set(Math.floor(l.t / HEURE), l);
  return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([h, l]) => ({ t: h * HEURE, oi: l.oi, oiValeur: l.oiValeur, lsGros: Number.isFinite(l.lsGros) ? l.lsGros : null, lsComptes: Number.isFinite(l.lsComptes) ? l.lsComptes : null, taker: Number.isFinite(l.taker) ? l.taker : null }));
}
/* Met à jour le fichier de dérivés d'une paire. Idempotent : ne télécharge que ce qui manque. `fetchJson(url)` et `fetchOctets(url)` injectables. Rend un résumé honnête (rien d'inventé). */
export async function mettreAJourDerives({ paire, dossier, fetchJson, fetchOctets, maintenant = () => Date.now(), joursMetrics = 120, pause = ms => new Promise(r => setTimeout(r, ms)) }) {
  const info = infoPaire(paire); if (!info) throw new Error('paire inconnue : ' + paire);
  const fichier = path.join(dossier, 'derives-' + paire.toLowerCase() + '.json'), etat = lireJsonFichier(fichier, { funding: [], metrics: [], maj: null }), symbole = info.futuresBinance, now = maintenant();
  const resume = { paire, fundingNouveaux: 0, metricsJours: 0, erreurs: [] };
  // 1) financement : tout l'historique, puis seulement la suite
  try {
    const f = new Map(etat.funding.map(x => [x.t, x]));
    let curseur = etat.funding.length ? etat.funding[etat.funding.length - 1].t + 1 : info.debutHistorique;
    for (let pages = 0; pages < 60 && curseur < now; pages++) {
      const page = await fetchJson(urlFunding(symbole, curseur)); if (!Array.isArray(page) || !page.length) break;
      for (const x of page) { const t = +x.fundingTime, taux = +x.fundingRate; if (Number.isFinite(t) && Number.isFinite(taux) && !f.has(t)) { f.set(t, { t, taux }); resume.fundingNouveaux++; } }
      const dernier = +page[page.length - 1].fundingTime; if (!(dernier >= curseur)) break; curseur = dernier + 1; if (page.length < 100) break; await pause(150);
    }
    etat.funding = [...f.values()].sort((a, b) => a.t - b.t);
  } catch (e) { resume.erreurs.push('financement : ' + String(e.message).slice(0, 100)); }
  // 2) intérêt ouvert et ratios : archives quotidiennes (jusqu'à hier), `joursMetrics` jours maximum, seulement les jours manquants
  try {
    const connus = new Set(etat.metrics.map(x => jourISO(x.t))), parHeure = new Map(etat.metrics.map(x => [x.t, x]));
    for (let k = joursMetrics; k >= 1; k--) {
      const jour = jourISO(now - k * JOUR); if (connus.has(jour)) continue;
      try { const zip = await fetchOctets(urlArchive(symbole, jour)); const lignes = reduireHoraire(analyserMetrics(await lireZipTexte(zip, inflater))); if (lignes.length) { for (const l of lignes) parHeure.set(l.t, l); resume.metricsJours++; } }
      catch (e) { /* jour absent de l'archive : on le saute, il reste un trou signalé */ }
      await pause(60);
    }
    etat.metrics = [...parHeure.values()].sort((a, b) => a.t - b.t);
  } catch (e) { resume.erreurs.push('intérêt ouvert : ' + String(e.message).slice(0, 100)); }
  etat.maj = now; etat.symbole = symbole; ecrireJsonFichier(fichier, etat);
  return { ...resume, financement: etat.funding.length, financementDernier: etat.funding.length ? etat.funding[etat.funding.length - 1] : null, metrics: etat.metrics.length, metricsDernier: etat.metrics.length ? etat.metrics[etat.metrics.length - 1].t : null, fichier };
}
export const lireDerives = (dossier, paire) => lireJsonFichier(path.join(dossier, 'derives-' + paire.toLowerCase() + '.json'), { funding: [], metrics: [], maj: null });
