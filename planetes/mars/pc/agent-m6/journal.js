import { resumeR, wilson, pct, qualiteEchantillon, AVERTISSEMENT } from './stats-m6.js';

/* ═════════════ JOURNAL DE TRADES (M6 ; module pur, testé : planetes/mars/tests/m6-journal-test.mjs) ═════════════
   Saisie manuelle et import CSV (le format d'export de Kraken Prop est INCONNU : l'import propose un mappage des colonnes que tu corriges, et se souvient de ton choix ; colle-moi un exemple et je le
   fixe). Chaque trade peut porter des étiquettes (setup, stratégie, régime, erreur) et une capture d'écran. Analyse après chaque trade, bilan hebdomadaire et revue de discipline avec RÈGLES pour la
   session suivante : tout par modèles de phrases, sans IA. Les données restent sur cet appareil. Un trade ne se « corrige » jamais en silence : toute modification est horodatée dans son historique. */
export const ETIQUETTES_ERREUR = Object.freeze(['revanche', 'stop_reculé', 'taille_trop_grosse', 'entrée_trop_tôt', 'entrée_trop_tard', 'hors_plan', 'surtrading', 'sortie_trop_tôt', 'peur_de_rater', 'autre']);
/* Nombre lu dans un texte : « 0,0800 », « 1 234,56 », « 1,234.50 », « $12.5 ». decimal : 'virgule' | 'point' | 'auto' (auto : le dernier séparateur présent est la décimale ; une seule virgule = décimale). */
const num = (x, decimal = 'auto') => {
  if (typeof x === 'number') return Number.isFinite(x) ? x : NaN; if (typeof x !== 'string') return NaN;
  let s = x.replace(/[\s  $€£]/g, ''); if (s === '') return NaN;
  const vir = s.lastIndexOf(','), pt = s.lastIndexOf('.');
  if (decimal === 'virgule') s = s.replace(/\./g, '').replace(',', '.'); else if (decimal === 'point') s = s.replace(/,/g, '');
  else if (vir >= 0 && pt >= 0) s = vir > pt ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, ''); else if (vir >= 0) s = s.replace(/,(?=.*,)/g, '').replace(',', '.');
  return /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s) ? Number(s) : NaN;
};
const MS_J = 86400e3;

/* ── Normalisations ── */
export function normaliserPaire(s) {
  const t = String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (/(XBT|BTC)/.test(t)) return { paire: 'BTC', connue: true }; if (/(XDG|DOGE)/.test(t)) return { paire: 'DOGE', connue: true }; if (/SOL/.test(t)) return { paire: 'SOL', connue: true };
  return { paire: t || '?', connue: false };
}
export function normaliserSens(s) {
  const t = String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  if (/^(achat|buy|long|b|acheter|bid|\+1|1)$/.test(t)) return 1; if (/^(vente|sell|short|s|vendre|ask|-1|−1)$/.test(t)) return -1; return 0;
}
/* Instant local → UTC (ms) pour un fuseau IANA, DST compris, sans bibliothèque. */
function localVersUtc(y, mo, d, h, mi, s, fuseau) {
  if (!fuseau || fuseau === 'UTC') return Date.UTC(y, mo - 1, d, h, mi, s);
  const devine = Date.UTC(y, mo - 1, d, h, mi, s), fmt = new Intl.DateTimeFormat('en-GB', { timeZone: fuseau, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const off = t => { const p = Object.fromEntries(fmt.formatToParts(new Date(t)).filter(x => x.type !== 'literal').map(x => [x.type, Number(x.value)])); return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - t; };
  let t = devine - off(devine); t = devine - off(t); return t;
}
/* Date d'un fichier : ISO, « JJ/MM/AAAA HH:mm[:ss] » (ou MM/JJ selon `ordre`), secondes ou millisecondes unix. Rend NaN si illisible. */
export function lireDateCSV(brut, { ordre = 'JMA', fuseau = 'UTC' } = {}) {
  const s = String(brut == null ? '' : brut).trim(); if (!s) return NaN;
  if (/^\d{13}$/.test(s)) return Number(s); if (/^\d{9,10}(\.\d+)?$/.test(s)) return Math.round(Number(s) * 1000);
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i);
  if (m) { if (m[7]) return Date.parse(s.replace(' ', 'T')); return localVersUtc(+m[1], +m[2], +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0), fuseau); }
  m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) { const a = +m[1], b = +m[2], j = ordre === 'MJA' ? b : a, mo = ordre === 'MJA' ? a : b; if (mo < 1 || mo > 12 || j < 1 || j > 31) return NaN; return localVersUtc(+m[3], mo, j, +(m[4] || 0), +(m[5] || 0), +(m[6] || 0), fuseau); }
  return NaN;
}

/* ── CSV ── */
export function detecterDelimiteur(texte) {
  const ligne = texte.split(/\r?\n/).find(l => l.trim()) || ''; const n = c => (ligne.match(new RegExp(c === '\t' ? '\t' : '\\' + c, 'g')) || []).length;
  const cand = [[';', n(';')], [',', n(',')], ['\t', n('\t')], ['|', n('|')]].sort((a, b) => b[1] - a[1]); return cand[0][1] > 0 ? cand[0][0] : ',';
}
export function analyserCSV(texte, delimiteur = null) {
  const d = delimiteur || detecterDelimiteur(texte), lignes = []; let champ = '', ligne = [], guill = false;
  const fin = () => { ligne.push(champ); champ = ''; if (ligne.some(x => x.trim() !== '')) lignes.push(ligne); ligne = []; };
  const s = texte.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (guill) { if (c === '"') { if (s[i + 1] === '"') { champ += '"'; i++; } else guill = false; } else champ += c; }
    else if (c === '"') guill = true; else if (c === d) { ligne.push(champ); champ = ''; } else if (c === '\n') fin(); else if (c !== '\r') champ += c;
  }
  if (champ !== '' || ligne.length) fin();
  if (!lignes.length) return { ok: false, erreur: 'fichier vide' };
  const entetes = lignes[0].map(x => x.trim()), corps = lignes.slice(1).filter(l => l.length > 1 || (l[0] || '').trim());
  return { ok: true, delimiteur: d, entetes, lignes: corps, n: corps.length };
}
const SYN = {
  paire: ['symbol', 'symbole', 'pair', 'paire', 'instrument', 'market', 'marche', 'asset', 'actif', 'contract', 'contrat', 'ticker'],
  sens: ['side', 'sens', 'direction', 'type', 'buy/sell', 'action', 'position side', 'long/short'],
  t: ['t', 'open time', 'opened', 'opening time', 'entry time', 'date ouverture', 'heure ouverture', 'date d ouverture', 'open date', 'time opened', 'date', 'time', 'timestamp', 'created', 'date entree', 'heure entree', 'entry date'],
  tSortie: ['tsortie', 'close time', 'closed', 'closing time', 'exit time', 'date fermeture', 'heure fermeture', 'date de cloture', 'close date', 'time closed', 'sortie', 'exit date'],
  prixEntree: ['prixentree', 'entry price', 'open price', 'prix d entree', 'prix ouverture', 'avg entry', 'entry', 'price', 'prix', 'avg open price'],
  prixSortie: ['prixsortie', 'exit price', 'close price', 'prix de sortie', 'prix fermeture', 'avg exit', 'exit', 'avg close price'],
  quantite: ['quantite', 'size', 'quantity', 'quantite', 'qty', 'volume', 'amount', 'lots', 'taille', 'position size', 'vol'],
  pnl: ['pnl', 'p&l', 'profit', 'profit/loss', 'realized pnl', 'realised pnl', 'net pnl', 'gain', 'resultat', 'gain/perte', 'net profit', 'profit net', 'rpnl'],
  frais: ['fee', 'fees', 'frais', 'commission', 'commissions', 'trading fee', 'swap'],
  stop: ['stop', 'stop loss', 'sl', 'stoploss', 'stop price'], objectif: ['take profit', 'tp', 'target', 'objectif', 'takeprofit', 'tp price']
};
const sansAccent = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[_\-\.]/g, ' ').replace(/\s+/g, ' ').trim();
/* Propose un mappage { champ: nomDeColonne } à partir des en-têtes (à corriger par l'utilisateur). Les colonnes non reconnues restent absentes : jamais de deviner au hasard. */
export function proposerMappage(entetes) {
  const norm = entetes.map(sansAccent), map = {}, pris = new Set();
  const passe = exact => {
    for (const champ of Object.keys(SYN)) {
      if (map[champ]) continue; let meilleur = -1, score = 0;
      norm.forEach((h, i) => { if (pris.has(i)) return; SYN[champ].forEach((syn, k) => { const sc = h === syn.replace(/ /g, h.includes(' ') ? ' ' : '') || h === syn ? 100 - k : (!exact && h.includes(syn) && syn.length > 3 ? 40 - k : 0); if (sc > score) { score = sc; meilleur = i; } }); });
      if (meilleur >= 0) { map[champ] = entetes[meilleur]; pris.add(meilleur); }
    }
  };
  passe(true); passe(false); return map;
}
/* Devine le format des dates d'une colonne : 'JMA' si un premier champ dépasse 12, 'MJA' si le second le dépasse, sinon ambigu (JMA par défaut, signalé). */
export function devinerOrdreDates(valeurs) {
  let jma = false, mja = false;
  for (const v of valeurs) { const m = String(v).match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-]\d{4}/); if (!m) continue; if (+m[1] > 12) jma = true; if (+m[2] > 12) mja = true; }
  return jma && !mja ? { ordre: 'JMA', sur: true } : mja && !jma ? { ordre: 'MJA', sur: true } : { ordre: 'JMA', sur: !jma && !mja ? false : false, ambigu: !jma && !mja };
}
/* Applique le mappage à toutes les lignes. options : { fuseau, ordre, decimal } ; rend { trades, rejetes:[{ligne, raison}], doublons, avertissements }. */
export function appliquerMappage(csv, mappage, { fuseau = 'UTC', ordre = null, dejaConnus = [] } = {}) {
  const idx = {}; for (const [champ, nom] of Object.entries(mappage || {})) { const i = csv.entetes.indexOf(nom); if (i >= 0) idx[champ] = i; }
  const avert = [], trades = [], rejetes = [], vus = new Set(dejaConnus);
  for (const c of ['paire', 'sens', 't']) if (idx[c] == null) avert.push('colonne « ' + c + ' » non mappée : les lignes seront rejetées');
  if (idx.pnl == null && (idx.prixEntree == null || idx.prixSortie == null || idx.quantite == null)) avert.push('ni le gain (pnl) ni (prix d’entrée, prix de sortie, quantité) ne sont mappés : le gain ne pourra pas être calculé');
  const dates = idx.t != null ? csv.lignes.map(l => l[idx.t]) : [], det = ordre ? { ordre, sur: true } : devinerOrdreDates(dates);
  if (!ordre && det.ambigu) avert.push('format des dates ambigu (jour/mois ou mois/jour) : lu comme JJ/MM, change-le si c’est faux'); if (fuseau !== 'UTC') avert.push('heures lues en ' + fuseau); else if (dates.length && !dates.some(d => /Z|[+-]\d\d:?\d\d$/.test(String(d)))) avert.push('heures lues en UTC faute de fuseau dans le fichier : précise le fuseau si ce n’est pas le cas');
  let doublons = 0;
  csv.lignes.forEach((l, k) => {
    const g = c => (idx[c] != null ? l[idx[c]] : undefined), ligne = k + 2;
    const p = normaliserPaire(g('paire')), sens = normaliserSens(g('sens')), t = lireDateCSV(g('t'), { ordre: det.ordre, fuseau }), ts = g('tSortie') != null && String(g('tSortie')).trim() !== '' ? lireDateCSV(g('tSortie'), { ordre: det.ordre, fuseau }) : NaN;
    if (!sens) return rejetes.push({ ligne, raison: 'sens illisible (« ' + g('sens') + ' »)' }); if (!Number.isFinite(t)) return rejetes.push({ ligne, raison: 'date d’ouverture illisible (« ' + g('t') + ' »)' });
    const dec = csv.delimiteur === ';' ? 'virgule' : 'point', n = c => num(g(c), dec), e = n('prixEntree'), x = n('prixSortie'), q = n('quantite'), fr = n('frais'); let pnl = n('pnl');
    if (!Number.isFinite(pnl)) { if (Number.isFinite(e) && Number.isFinite(x) && Number.isFinite(q)) pnl = sens * (x - e) * q - (Number.isFinite(fr) ? Math.abs(fr) : 0); else return rejetes.push({ ligne, raison: 'gain introuvable' }); }
    const r = { paire: p.paire, sens, t, tSortie: Number.isFinite(ts) ? ts : null, prixEntree: Number.isFinite(e) ? e : null, prixSortie: Number.isFinite(x) ? x : null, quantite: Number.isFinite(q) ? q : null, pnl, frais: Number.isFinite(fr) ? Math.abs(fr) : null,
      stop: Number.isFinite(n('stop')) ? n('stop') : null, objectif: Number.isFinite(n('objectif')) ? n('objectif') : null, statut: Number.isFinite(ts) ? 'ferme' : 'ouvert', source: 'csv', paireInconnue: !p.connue };
    const cle = [r.paire, r.t, r.prixEntree, r.quantite, r.sens].join('|'); if (vus.has(cle)) { doublons++; return; } vus.add(cle); trades.push(r);
  });
  if (trades.some(x => x.paireInconnue)) avert.push(trades.filter(x => x.paireInconnue).length + ' trade(s) sur une paire hors BTC / SOL / DOGE : gardés, mais l’agent ne les connaît pas');
  return { trades, rejetes, doublons, avertissements: avert, ordreDates: det.ordre };
}
export function exporterCSV(journal) {
  const cols = ['id', 'paire', 'sens', 't', 'tSortie', 'prixEntree', 'prixSortie', 'quantite', 'stop', 'objectif', 'pnl', 'frais', 'strategie', 'setup', 'regime', 'etiquettes', 'erreurs', 'statut', 'notes'], esc = v => { const s = v == null ? '' : Array.isArray(v) ? v.join('|') : String(v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return [cols.join(';'), ...journal.map(x => cols.map(c => esc(c === 't' || c === 'tSortie' ? (x[c] ? new Date(x[c]).toISOString() : '') : x[c])).join(';'))].join('\n');
}

/* ── Le journal ── */
export function validerTrade(b, maintenant = Date.now()) {
  const e = [], x = { ...b };
  x.paire = normaliserPaire(b.paire).paire; x.sens = typeof b.sens === 'number' ? Math.sign(b.sens) : normaliserSens(b.sens); if (!x.sens) e.push('sens : achat ou vente');
  x.t = typeof b.t === 'number' ? b.t : lireDateCSV(b.t); if (!Number.isFinite(x.t)) e.push('date d’ouverture illisible'); else if (x.t > maintenant + 5 * 60e3) e.push('date d’ouverture dans le futur');
  x.tSortie = b.tSortie == null || b.tSortie === '' ? null : (typeof b.tSortie === 'number' ? b.tSortie : lireDateCSV(b.tSortie)); if (x.tSortie != null && !Number.isFinite(x.tSortie)) e.push('date de sortie illisible'); else if (x.tSortie != null && x.tSortie < x.t) e.push('la sortie précède l’entrée');
  for (const k of ['prixEntree', 'prixSortie', 'quantite', 'stop', 'objectif', 'pnl', 'frais']) { const v = b[k] == null || b[k] === '' ? null : num(b[k]); if (v != null && !Number.isFinite(v)) e.push(k + ' : nombre attendu'); x[k] = v; }
  for (const k of ['prixEntree', 'quantite']) if (x[k] != null && !(x[k] > 0)) e.push(k + ' doit être positif');
  if (x.pnl == null && x.prixEntree != null && x.prixSortie != null && x.quantite != null && x.tSortie != null) x.pnl = x.sens * (x.prixSortie - x.prixEntree) * x.quantite - (x.frais || 0);
  x.statut = x.tSortie != null ? 'ferme' : 'ouvert'; if (x.statut === 'ferme' && x.pnl == null) e.push('trade fermé sans gain : donne le gain ou les prix de sortie');
  if (x.stop != null && x.prixEntree != null && (x.sens > 0 ? x.stop >= x.prixEntree : x.stop <= x.prixEntree)) e.push('le stop est du mauvais côté de l’entrée');
  if (x.stop != null && x.prixEntree != null && x.quantite != null) { x.risqueUSD = x.quantite * Math.abs(x.prixEntree - x.stop); if (x.pnl != null && x.risqueUSD > 0) x.R = x.pnl / x.risqueUSD; }
  if (x.stop != null && x.objectif != null && x.prixEntree != null) x.rr = Math.abs(x.objectif - x.prixEntree) / Math.abs(x.prixEntree - x.stop);
  x.etiquettes = Array.isArray(b.etiquettes) ? b.etiquettes.map(s => String(s).slice(0, 40)) : []; x.erreurs = Array.isArray(b.erreurs) ? b.erreurs.filter(s => ETIQUETTES_ERREUR.includes(s)) : [];
  for (const k of ['strategie', 'setup', 'regime', 'notes']) x[k] = b[k] == null ? '' : String(b[k]).replace(/[<>]/g, '').slice(0, k === 'notes' ? 500 : 80);
  x.source = b.source || 'manuel'; x.horsPlan = !!b.horsPlan; x.capture = b.capture || null;
  return e.length ? { ok: false, erreurs: e } : { ok: true, trade: x };
}
export function creerJournal({ maintenant = () => Date.now(), initial = [] } = {}) {
  const liste = []; let n = 0; const ecouteurs = new Set(); const ch = () => { for (const f of ecouteurs) { try { f(); } catch (e) { /* écouteur cassé */ } } };
  const cle = x => [x.paire, x.t, x.prixEntree, x.quantite, x.sens].join('|');
  const api = {
    ajouter(brut) { const r = validerTrade(brut, maintenant()); if (!r.ok) return r; if (liste.some(x => cle(x) === cle(r.trade))) return { ok: false, erreurs: ['ce trade est déjà dans le journal (même paire, heure, prix et quantité)'] }; const t = { id: 'T' + (++n) + '-' + maintenant().toString(36), creeLe: maintenant(), historique: [], ...r.trade }; liste.push(t); ch(); return { ok: true, id: t.id, trade: t }; },
    modifier(id, patch) { const i = liste.findIndex(x => x.id === id); if (i < 0) return { ok: false, erreurs: ['trade inconnu'] }; const r = validerTrade({ ...liste[i], ...patch }, maintenant()); if (!r.ok) return r; const avant = {}; for (const k of Object.keys(patch)) avant[k] = liste[i][k]; liste[i] = { ...liste[i], ...r.trade, id, creeLe: liste[i].creeLe, historique: [...liste[i].historique, { t: maintenant(), avant, apres: patch }] }; ch(); return { ok: true, trade: liste[i] }; },
    supprimer(id) { const i = liste.findIndex(x => x.id === id); if (i < 0) return { ok: false, erreurs: ['trade inconnu'] }; liste.splice(i, 1); ch(); return { ok: true }; },
    importerLignes(trades) { let ajoutes = 0; const refus = []; for (const t of trades) { const r = api.ajouter(t); if (r.ok) ajoutes++; else refus.push(r.erreurs[0]); } return { ajoutes, refus }; },
    trouver: id => liste.find(x => x.id === id) || null, lister: (f = {}) => liste.filter(x => (!f.paire || x.paire === f.paire) && (!f.statut || x.statut === f.statut) && (!f.depuis || x.t >= f.depuis) && (!f.etiquette || x.etiquettes.includes(f.etiquette) || x.erreurs.includes(f.etiquette))).sort((a, b) => b.t - a.t),
    tout: () => liste.slice(), restaurer(l) { liste.length = 0; for (const x of l) liste.push(JSON.parse(JSON.stringify(x))); n = liste.reduce((m, x) => Math.max(m, parseInt(String(x.id).replace(/^T(\d+).*/, '$1'), 10) || 0), 0); ch(); return liste.length; },       // recharge un état sauvegardé tel quel (identifiants conservés)
    exporter: () => JSON.stringify({ format: 'rayle-journal-1', trades: liste }), surChangement: f => { ecouteurs.add(f); return () => ecouteurs.delete(f); }, n: () => liste.length,
    importer(texte) { let j; try { j = JSON.parse(texte); } catch (e) { return { ok: false, erreur: 'fichier illisible' }; } if (!j || j.format !== 'rayle-journal-1' || !Array.isArray(j.trades)) return { ok: false, erreur: 'ce n’est pas un journal Rayle' }; const r = api.importerLignes(j.trades); return { ok: true, ...r }; }
  };
  for (const t of initial) api.ajouter(t);
  return api;
}

/* ── Analyse après un trade (modèles de phrases) ── */
export function analyseTrade(x, { regles = {}, gardienAvant = null } = {}) {
  const rr = regles.rrMin || 1.5, bien = [], mal = [], regle = [];
  const $ = v => (v >= 0 ? '+' : '−') + Math.abs(Math.round(v * 100) / 100).toLocaleString('fr-FR') + ' $';
  if (x.stop != null) bien.push('un stop était posé'); else { mal.push('aucun stop posé'); regle.push('Ne jamais ouvrir un trade sans stop posé.'); }
  if (x.objectif != null) bien.push('un objectif était fixé' + (x.rr ? ' (R/R ' + x.rr.toFixed(1).replace('.', ',') + ')' : '')); else { mal.push('pas d’objectif fixé avant l’entrée'); regle.push('Fixer le stop ET l’objectif avant d’entrer.'); }
  if (x.rr != null && x.rr < rr) { mal.push('R/R de ' + x.rr.toFixed(1).replace('.', ',') + ' sous le minimum de ' + rr); regle.push('Refuser tout trade sous un R/R de ' + rr + '.'); }
  if (x.strategie || x.setup) bien.push('rattaché à ' + (x.strategie || x.setup)); else { mal.push('pas de stratégie ni de setup associé'); regle.push('Nommer le setup avant d’entrer, sinon ne pas entrer.'); }
  if (x.horsPlan) mal.push('marqué hors plan');
  for (const e of x.erreurs || []) { mal.push('erreur notée : ' + e.replace(/_/g, ' ')); }
  if (x.R != null && x.stop != null && x.pnl < 0 && x.R < -1.25) { mal.push('perte de ' + Math.abs(x.R).toFixed(1).replace('.', ',') + ' R : au-delà du stop prévu'); regle.push('Respecter le stop : aucune sortie au-delà du risque prévu.'); }
  const issue = x.statut !== 'ferme' ? 'Trade encore ouvert.' : (x.pnl > 0 ? 'Trade gagnant ' + $(x.pnl) : x.pnl < 0 ? 'Trade perdant ' + $(x.pnl) : 'Trade à l’équilibre') + (x.R != null ? ' (' + (x.R >= 0 ? '+' : '−') + Math.abs(x.R).toFixed(2).replace('.', ',') + ' R)' : '') + '.';
  const qualite = mal.length === 0 ? 'exécution propre' : mal.length <= 1 ? 'exécution correcte avec un point à corriger' : 'exécution à améliorer';
  return { issue, bien, mal, regles: [...new Set(regle)], qualite, phrase: issue + ' ' + qualite.charAt(0).toUpperCase() + qualite.slice(1) + '.' + (bien.length ? ' Bien : ' + bien.join(', ') + '.' : '') + (mal.length ? ' À corriger : ' + mal.join(', ') + '.' : '') + ' Un seul trade ne dit rien de ta méthode : regarde la série.' };
}

/* ── Bilan de la semaine (lundi → dimanche UTC contenant `date`) ── */
export const debutSemaine = t => { const d = new Date(t), j = (d.getUTCDay() + 6) % 7; return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - j); };
export function bilanSemaine(journal, { date = Date.now(), regles = {} } = {}) {
  const d0 = debutSemaine(date), d1 = d0 + 7 * MS_J, sem = journal.filter(x => x.t >= d0 && x.t < d1 && x.statut === 'ferme' && Number.isFinite(x.pnl));
  if (!sem.length) return { ok: true, n: 0, debut: d0, phrase: 'Aucun trade fermé cette semaine.', discipline: null, regles: [] };
  const pnl = sem.map(x => x.pnl), g = sem.filter(x => x.pnl > 0), p = sem.filter(x => x.pnl < 0), Rs = sem.filter(x => Number.isFinite(x.R)).map(x => x.R), rs = resumeR(Rs);
  const total = pnl.reduce((s, y) => s + y, 0), esp = total / sem.length, taux = wilson(g.length, sem.length);
  const nc = sem.filter(x => x.stop != null).length, np = sem.filter(x => (x.strategie || x.setup) && !x.horsPlan).length, nrr = sem.filter(x => x.rr == null || x.rr >= (regles.rrMin || 1.5)).length, nerr = sem.filter(x => (x.erreurs || []).length === 0).length;
  const discipline = Math.round(100 * (nc + np + nrr + nerr) / (4 * sem.length));
  const erreurs = {}; for (const x of sem) for (const e of x.erreurs || []) erreurs[e] = (erreurs[e] || 0) + 1;
  const topErr = Object.entries(erreurs).sort((a, b) => b[1] - a[1]);
  const consignes = revueDiscipline(sem, regles);
  const $ = v => (v >= 0 ? '+' : '−') + Math.abs(Math.round(v)).toLocaleString('fr-FR') + ' $';
  const phrase = 'Semaine du ' + new Date(d0).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', timeZone: 'UTC' }) + ' : ' + sem.length + ' trade' + (sem.length > 1 ? 's' : '') + ', ' + $(total) + ' ; réussite ' + pct(taux.p) + ' (fourchette ' + pct(taux.bas) + ' à ' + pct(taux.haut) + ') ; gain moyen ' + $(esp) + ' par trade' + (Rs.length ? ' soit ' + (rs.esperance >= 0 ? '+' : '−') + Math.abs(rs.esperance).toFixed(2).replace('.', ',') + ' R en moyenne' : '') + '. Discipline : ' + discipline + ' / 100 (stop posé ' + nc + '/' + sem.length + ', dans le plan ' + np + '/' + sem.length + '). ' + (topErr.length ? 'Erreur la plus fréquente : ' + topErr[0][0].replace(/_/g, ' ') + ' (' + topErr[0][1] + '×). ' : '') + 'Échantillon ' + qualiteEchantillon(sem.length) + ' : ' + AVERTISSEMENT;
  return { ok: true, n: sem.length, debut: d0, total, esperance: esp, taux, gagnants: g.length, perdants: p.length, meilleur: Math.max(...pnl), pire: Math.min(...pnl), R: rs, discipline, erreurs: topErr, regles: consignes, phrase };
}
/* Règles pour la session suivante, déduites des faits (jamais de conseil de trading : de la DISCIPLINE). */
export function revueDiscipline(trades, regles = {}) {
  const c = [], sans = trades.filter(x => x.stop == null).length, hors = trades.filter(x => x.horsPlan || (!x.strategie && !x.setup)).length, rev = trades.filter(x => (x.erreurs || []).includes('revanche')).length, grand = trades.filter(x => (x.erreurs || []).includes('taille_trop_grosse')).length;
  if (sans) c.push('Aucun trade sans stop posé (' + sans + ' trade(s) sans stop cette période).');
  if (hors) c.push('Nommer le setup avant d’entrer ; sinon pas de trade (' + hors + ' trade(s) hors plan).');
  if (rev) c.push('Après une perte : 30 minutes sans aucun trade (' + rev + ' revanche(s) notée(s)).');
  if (grand) c.push('Ne jamais dépasser le risque par trade réglé (' + grand + ' fois trop gros).');
  const parJour = new Map(); for (const x of trades) { const k = Math.floor(x.t / MS_J); parJour.set(k, (parJour.get(k) || 0) + 1); }
  const max = Math.max(0, ...parJour.values()); if (max > (regles.tradesParJourMax || 3)) c.push('Pas plus de ' + (regles.tradesParJourMax || 3) + ' trades par jour (jusqu’à ' + max + ' cette période).');
  const sansObj = trades.filter(x => x.objectif == null).length; if (sansObj) c.push('Fixer l’objectif avant l’entrée (' + sansObj + ' sans objectif).');
  if (!c.length) c.push('Rien à corriger dans les faits du journal : garde la même rigueur.');
  return c;
}
