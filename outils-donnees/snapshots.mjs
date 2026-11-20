/* ═════════════ ROBOT DE SNAPSHOTS (GitHub Actions ou PC) : télécharge les sources publiques, valide, écrit des JSON ═════════════
   Usage : node outils-donnees/snapshots.mjs --sortie <dossier> [--lot rapide|horaire|bougies|pro|tout] [--seulement nom1,nom2]
   Lots : rapide = actus, calendrier, yahoo, panneaux Marchés ; horaire = COT, banques, institutions, santé, GLD ; bougies = bougies Yahoo compactes ; pro = séries compactes par actif (pro-<id>.json, construites à partir des bougies déjà écrites).
   Règles : DONNÉES DE MARCHÉ SEULEMENT (publiques, aucune donnée personnelle, aucun secret). Une source en panne ne détruit JAMAIS la copie précédente :
   le fichier existant est gardé et l'échec est noté dans index.json (erreur + âge). Fichier écrit seulement si la réponse est valide. */
import fs from 'node:fs'; import path from 'node:path';
import { cot, actus, banques, institutions, sante, gld, calendrier2, bougies, MARCHES_COT } from '../app-pc/terminal-donnees.mjs';
import { yahoo } from '../app-pc/terminal-sources.mjs';
import { listeUnivers, telechargerJour, nomFichierJour } from './univers-jours.mjs';
import { construirePro } from './pro.mjs';
import { actusAccueil } from './actus-accueil.mjs';

export const SYMBOLES_BOUGIES = ['^NDX', '^GSPC', 'BTC-USD', 'SOL-USD', 'GC=F', 'DX-Y.NYB', 'EURUSD=X', 'CHF=X'];
export const INTERVALLES_BOUGIES = [['5m', '14d'], ['15m', '60d'], ['1h', '730d'], ['1d', '10y']];
export const SYMS_YAHOO = ['DX-Y.NYB', '^TNX', '^VIX', '^GSPC', '^NDX', 'GLD', 'GDX', 'GC=F', 'BTC-USD'];
export const PANNEAUX_MARCHES = ['ensemble', 'or', 'us100', 'btc', 'usd', 'chf', 'macro', 'cot', 'calendrier', 'actualites', 'correlations'];
export const ACTIFS_MARCHES = ['or', 'us100', 'btc', 'usd', 'chf'];
export const nomBougies = (sym, iv) => `bougies-${String(sym).replace(/[^A-Za-z0-9]/g, '_')}-${iv}.json`;
export const compacter = d => ({ ...d, bougies: undefined, b: (d.bougies || []).map(x => [x.t, x.o, x.h, x.l, x.c, x.v]) });

const arg = n => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : null; };
const sortie = path.resolve(arg('sortie') || 'donnees-sortie'), lot = arg('lot') || 'tout', seulement = (arg('seulement') || '').split(',').filter(Boolean);
fs.mkdirSync(sortie, { recursive: true });
const indexFichier = path.join(sortie, 'index.json');
let index = { fichiers: {} }; try { index = JSON.parse(fs.readFileSync(indexFichier, 'utf8')); index.fichiers = index.fichiers || {}; } catch (e) { /* premier passage */ }

const taches = [];   // { nom, lot, f: async () => objet, valider?: objet => true | message }
const ajoute = (nom, lots, f, valider = () => true) => taches.push({ nom, lots, f, valider });
const aucuneErreur = d => (d && !d.erreur ? true : (d && d.erreur) || 'réponse vide');

for (const q of ['or', 'marches', 'tout']) ajoute(`actus-${q}.json`, ['rapide'], () => actus(q, 60), d => (d && Array.isArray(d.items) && d.items.length ? true : 'aucune actualité'));
for (const o of ['france', 'monde', 'marches']) ajoute(`actus-accueil-${o}.json`, ['rapide'], () => actusAccueil(o), d => (d && Array.isArray(d.items) && d.items.length >= 10 ? true : 'moins de 10 articles'));   // v4 : fil défilant de l'accueil
ajoute('calendrier2.json', ['rapide'], () => calendrier2(), d => (d && Array.isArray(d.evenements) && d.evenements.length ? true : 'calendrier vide'));
ajoute('yahoo-2y.json', ['rapide'], () => yahoo(SYMS_YAHOO.join(','), '2y'), d => (d && d.cotes && Object.values(d.cotes).some(c => !c.erreur && c.serie && c.serie.length) ? true : 'aucune cotation'));
ajoute('banques.json', ['horaire'], () => banques(40), d => (d && Array.isArray(d.items) ? true : 'réponse invalide'));
ajoute('institutions.json', ['horaire'], () => institutions(), d => (d && d.f13 ? true : 'réponse invalide'));
ajoute('sante.json', ['horaire', 'rapide'], () => sante(), d => (d && (d.reels || d.fed) ? true : 'aucune donnée de santé'));
ajoute('gld.json', ['horaire'], () => gld(), d => (d && d.serie && d.serie.length > 10 ? true : 'série GLD vide'));
for (const k of Object.keys(MARCHES_COT)) ajoute(`cot-${k}.json`, ['horaire'], () => cot(k, 300), d => (d && d.serie && d.serie.length ? true : aucuneErreur(d)));
for (const sym of SYMBOLES_BOUGIES) for (const [iv, rg] of INTERVALLES_BOUGIES) ajoute(nomBougies(sym, iv), ['bougies'], async () => compacter(await bougies(sym, iv, rg)), d => (d && d.b && d.b.length > 30 ? true : 'trop peu de bougies'));
/* Phase 6 : séries journalières ajustées de l'univers (couverture et performances) */
for (const u of listeUnivers()) ajoute(nomFichierJour(u.id), ['horaire'], () => telechargerJour(u), d => (d && d.b && d.b.length > 30 ? true : 'trop peu de points'));
/* panneaux de Rayle Marchés (hub de données portable) */
ajoute('__marches__', ['rapide'], async () => {
  const { gererMarches, hubPartage } = await import('../marches/donnees/api.js'); const hub = hubPartage({}); const ecrits = [];
  const demande = async (nom, url) => {
    try { const r = await gererMarches(new Request('http://snap' + url), { env: {}, hub }), d = await r.json(); if (!d || d.error || !(d.sections || d.evenements || d.actualites || d.correlations || d.sources)) throw new Error(d && d.error || 'panneau vide');
      d.t = Date.now(); ecrire(nom, d); ecrits.push(nom); } catch (e) { noter(nom, false, String(e.message || e)); }
  };
  for (const id of PANNEAUX_MARCHES) await demande(`marches-${id}.json`, `/marches/panneau?id=${id}`);
  for (const id of ['calendrier', 'actualites']) for (const a of ACTIFS_MARCHES) await demande(`marches-${id}-${a}.json`, `/marches/panneau?id=${id}&actif=${a}`);
  await demande('marches-sources.json', '/marches/panneau?id=sources');
  return { __ecrit: ecrits };
}, () => true);

function noter(nom, ok, erreur, octets) { const avant = index.fichiers[nom] || {}; index.fichiers[nom] = ok ? { t: Date.now(), ok: true, octets } : { ...avant, ok: false, erreur: String(erreur).slice(0, 200), dernierEssai: Date.now() }; }
function ecrire(nom, d) { const txt = JSON.stringify(d); fs.writeFileSync(path.join(sortie, nom), txt); noter(nom, true, null, txt.length); }

const choisies = taches.filter(t => (lot === 'tout' || t.lots.includes(lot)) && (!seulement.length || seulement.includes(t.nom)));
let ok = 0, ko = 0;
const lots2 = []; for (let i = 0; i < choisies.length; i += 4) lots2.push(choisies.slice(i, i + 4));
for (const groupe of lots2) await Promise.all(groupe.map(async t => {
  try {
    const d = await Promise.race([t.f(), new Promise((_, r) => setTimeout(() => r(new Error('délai de 90 s dépassé')), 90000))]);
    if (d && d.__ecrit) { ok += d.__ecrit.length; return; }
    const v = t.valider(d); if (v !== true) throw new Error(typeof v === 'string' ? v : 'réponse invalide');
    if (d && !d.t) d.t = Date.now(); ecrire(t.nom, d); ok++;
  } catch (e) { ko++; noter(t.nom, false, e && e.message || e); console.error('✗ ' + t.nom + ' : ' + String(e && e.message || e).slice(0, 140)); }
}));
/* instantanés « pro » (séries compactes par actif) : construits APRÈS les bougies, à partir des fichiers déjà écrits dans le dossier de sortie */
if (['bougies', 'pro', 'tout'].includes(lot)) { const pro = await construirePro(sortie); for (const e of pro.ecrits) noter(e.nom, true, null, e.octets); for (const e of pro.echecs) { noter(e.nom, false, e.erreur); console.error('✗ ' + e.nom + ' : ' + e.erreur.slice(0, 140)); } ok += pro.ecrits.length; ko += pro.echecs.length; }
index.t = Date.now(); index.lot = lot; index.avertissement = 'Données publiques de marché, différées ; copie précédente conservée quand une source échoue.';
fs.writeFileSync(indexFichier, JSON.stringify(index, null, 1));
console.log(`snapshots : ${ok} écrits, ${ko} en échec, dossier ${sortie}`);
process.exit(0);
