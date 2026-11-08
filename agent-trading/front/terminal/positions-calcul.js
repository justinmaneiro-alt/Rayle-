/* ═════════════ TERMINAL : POSITIONS SIMULÉES, JOURNAL, GARDIEN (pur, testé) ═════════════
   Aucune position n'est un ordre : c'est un tracé que le terminal SUIT (règles alertes-terminal-v2, partie « positions »).
   États : proposee (pré-remplie par Rayle, à valider) → attente (entrée non touchée) → ouverte (entrée touchée) → objectif | stop | annulee | cloturee.
   Dans une même bougie : l'entrée d'abord, puis le stop AVANT l'objectif (hypothèse prudente). */
export const ETATS = Object.freeze({ proposee: 'proposée', attente: 'en attente', ouverte: 'ouverte', objectif: 'objectif atteint', stop: 'stop touché', annulee: 'annulée', cloturee: 'clôturée à la main' });
export const FINAUX = Object.freeze(['objectif', 'stop', 'annulee', 'cloturee']);
export const SETUPS = Object.freeze(['rebond MA200', 'réintégration', 'W/M', 'prise de liquidité', 'retournement de structure', 'autre']);
export const DEFAUTS = Object.freeze({ capital: 10000, risquePct: 0.5 });
export const GARDIEN = Object.freeze({ alerteJour: 2, avertissementJour: 3, limiteTotale: 6, minTrades: 30 });
let k = 0;
export const idPosition = (t = Date.now()) => `p${t.toString(36)}${(k++).toString(36)}${Math.floor(Math.random() * 1e5).toString(36)}`;

/* calcul : sens, risque par unité, R de l'objectif, risque en $, taille en contrats (arrondie au pas, vers le bas) */
export function calcul(p, { pasQ = 0.001 } = {}) {
  const risqueU = Math.abs(p.entree - (p.stop0 ?? p.stop)), sens = (p.stop0 ?? p.stop) < p.entree ? 1 : -1;
  if (!(risqueU > 0) || !(p.entree > 0)) return null;
  const risque$ = (p.capital || DEFAUTS.capital) * (p.risquePct ?? DEFAUTS.risquePct) / 100;
  const taille = Math.floor(risque$ / risqueU / pasQ + 1e-9) * pasQ;
  const rObjectif = p.objectif > 0 ? (p.objectif - p.entree) * sens / risqueU : null;
  return { sens, achat: sens > 0, risqueU, risque$, taille, rObjectif, risqueReel$: taille * risqueU };
}
export function creerPosition(d, { t = Date.now(), pasQ } = {}) {
  const p = { id: d.id || idPosition(t), actif: d.actif, unite: d.unite || 'M15', cree: d.cree ?? t, entree: +d.entree, stop: +d.stop, stop0: +(d.stop0 ?? d.stop), objectif: +d.objectif, capital: +(d.capital || DEFAUTS.capital), risquePct: +(d.risquePct ?? DEFAUTS.risquePct),
    etat: d.etat || 'attente', setup: d.setup || '', actualite: d.actualite || '', note: d.note || '', origine: d.origine || 'moi', historique: d.historique || [], tEntree: d.tEntree ?? null, tSortie: d.tSortie ?? null, prixSortie: d.prixSortie ?? null, plus1R: !!d.plus1R, be: !!d.be };
  const c = calcul(p, { pasQ }); if (!c) return null;
  if (!(p.objectif > 0) || (p.objectif - p.entree) * c.sens <= 0) return null;   // objectif du bon côté
  return p;
}
/* modification des niveaux (seulement avant la sortie) ; le stop initial (stop0, base du R) ne change que tant que la position n'est pas ouverte */
export function modifierPosition(p, ch, opts) {
  if (FINAUX.includes(p.etat)) return null;
  const n = { ...p, ...ch }; if (p.etat === 'attente' || p.etat === 'proposee') n.stop0 = n.stop; if (p.etat === 'ouverte' && 'entree' in ch) n.entree = p.entree;
  return creerPosition(n, opts);
}
export function resultatR(p, prixSortie) { const c = calcul(p); return c ? (prixSortie - p.entree) * c.sens / c.risqueU : null; }

/* avance l'état d'une position sur des bougies (closes ou en cours ; un fait accompli ne se défait jamais). Renvoie { p, evenements } */
export function suivre(p0, bougies, { ms = 0 } = {}) {
  if (FINAUX.includes(p0.etat) || p0.etat === 'proposee') return { p: p0, evenements: [] };
  const p = { ...p0, historique: p0.historique.slice() }, ev = [], c = calcul(p); if (!c) return { p: p0, evenements: [] };
  const un = p.entree + c.sens * c.risqueU;
  const passer = (etat, t, prix, extra = {}) => { p.etat = etat; const e = { type: etat, t, prix, ...extra }; p.historique.push(e); ev.push(e); };
  for (const b of bougies) {
    if (b.t + ms <= p.cree) continue;
    if (p.etat === 'attente') {
      if (b.l <= p.entree && b.h >= p.entree) { p.tEntree = b.t; passer('ouverte', b.t, p.entree); }
      else continue;
    }
    if (p.etat === 'ouverte') {
      const stopT = c.sens > 0 ? b.l <= p.stop : b.h >= p.stop, objT = c.sens > 0 ? b.h >= p.objectif : b.l <= p.objectif;
      if (stopT) { p.tSortie = b.t; p.prixSortie = p.stop; passer('stop', b.t, p.stop, { R: resultatR(p, p.stop) }); break; }
      if (objT) { p.tSortie = b.t; p.prixSortie = p.objectif; passer('objectif', b.t, p.objectif, { R: resultatR(p, p.objectif) }); break; }
      if (!p.plus1R && (c.sens > 0 ? b.h >= un : b.l <= un)) { p.plus1R = true; const e = { type: 'plus1R', t: b.t, prix: un }; p.historique.push(e); ev.push(e); }
    }
  }
  return { p, evenements: ev };
}
export function cloturer(p, prix, t = Date.now()) { if (p.etat !== 'ouverte') return null; const n = { ...p, historique: p.historique.concat({ type: 'cloturee', t, prix, R: resultatR(p, prix) }), etat: 'cloturee', tSortie: t, prixSortie: prix }; return n; }
export function annuler(p, t = Date.now()) { if (p.etat !== 'attente' && p.etat !== 'proposee') return null; return { ...p, etat: 'annulee', historique: p.historique.concat({ type: 'annulee', t }) }; }
export function passerBE(p) { if (p.etat !== 'ouverte') return null; return { ...p, stop: p.entree, be: true, historique: p.historique.concat({ type: 'be', t: Date.now(), prix: p.entree }) }; }
export function valider(p) { if (p.etat !== 'proposee') return null; return { ...p, etat: 'attente', historique: p.historique.concat({ type: 'validee', t: Date.now() }) }; }

/* ligne de journal pour un changement d'état (ajoutée automatiquement) */
export function ligneJournal(p, e) {
  const fin = FINAUX.includes(e.type) && e.type !== 'annulee';
  return { id: `${p.id}|${e.type}|${e.t}`, position: p.id, t: e.t, actif: p.actif, sens: calcul(p).achat ? 'achat' : 'vente', evenement: e.type, prix: e.prix ?? null, R: fin ? e.R ?? null : null,
    duree: fin && p.tEntree ? (e.t - p.tEntree) : null, setup: p.setup, actualite: p.actualite, note: p.note, unite: p.unite };
}

/* bilans (positions closes : objectif, stop, clôturée) — « pas assez de données » sous 30 */
const heureParis = t => { const d = new Date(t); const an = d.getUTCFullYear(), dim = m => { const x = new Date(Date.UTC(an, m + 1, 0, 1)); x.setUTCDate(x.getUTCDate() - x.getUTCDay()); return x.getTime(); }; const ete = t >= dim(2) && t < dim(9); return (d.getUTCHours() + (ete ? 2 : 1)) % 24; };
export const jourParis = t => { const d = new Date(t); const an = d.getUTCFullYear(), dim = m => { const x = new Date(Date.UTC(an, m + 1, 0, 1)); x.setUTCDate(x.getUTCDate() - x.getUTCDay()); return x.getTime(); }; const ete = t >= dim(2) && t < dim(9); return new Date(t + (ete ? 7200e3 : 3600e3)).toISOString().slice(0, 10); };
export const fermees = P => P.filter(p => ['objectif', 'stop', 'cloturee'].includes(p.etat) && p.tSortie);
export function bilan(P, cle, { min = GARDIEN.minTrades } = {}) {
  const F = fermees(P), g = new Map();
  const cleDe = { setup: p => p.setup || 'sans étiquette', actif: p => p.actif, heure: p => String(heureParis(p.tEntree || p.cree)).padStart(2, '0') + ' h' }[cle];
  for (const p of F) { const k2 = cleDe(p); if (!g.has(k2)) g.set(k2, []); g.get(k2).push(resultatR(p, p.prixSortie)); }
  return [...g.entries()].map(([nom, R]) => ({ nom, n: R.length, assez: R.length >= min, total: R.reduce((a, b) => a + b, 0), moyenne: R.length ? R.reduce((a, b) => a + b, 0) / R.length : null, gagnants: R.filter(r => r > 0).length })).sort((a, b) => b.n - a.n);
}
/* gardien : pertes du jour (réalisé + latent) et drawdown total depuis le plus haut de l'équité réalisée, en % du capital */
export function gardien(P, { capital = DEFAUTS.capital, maintenant = Date.now(), latent = 0, R = GARDIEN } = {}) {
  const F = fermees(P).sort((a, b) => a.tSortie - b.tSortie), j = jourParis(maintenant);
  let eq = 0, pic = 0, dd = 0, jour = 0;
  for (const p of F) { const pl = resultatR(p, p.prixSortie) * calcul(p).risque$; eq += pl; pic = Math.max(pic, eq); dd = Math.max(dd, pic - eq); if (jourParis(p.tSortie) === j) jour += pl; }
  const jourPct = -(jour + latent) / capital * 100, ddPct = (pic - (eq + latent)) / capital * 100;
  const niveau = ddPct >= R.limiteTotale ? 'limite' : jourPct >= R.avertissementJour ? 'avertissement' : jourPct >= R.alerteJour ? 'alerte' : 'ok';
  return { resultatJour$: jour + latent, pertesJourPct: Math.max(0, jourPct), drawdownPct: Math.max(0, ddPct), drawdownMaxPct: dd / capital * 100, equite: capital + eq + latent, niveau,
    message: niveau === 'limite' ? `Limite du défi atteinte : ${ddPct.toFixed(2).replace('.', ',')} % de perte depuis le plus haut (limite ${R.limiteTotale} %).` : niveau === 'avertissement' ? `Avertissement : ${jourPct.toFixed(2).replace('.', ',')} % de perte aujourd’hui (≥ ${R.avertissementJour} %). Stop pour aujourd’hui ?` : niveau === 'alerte' ? `Attention : ${jourPct.toFixed(2).replace('.', ',')} % de perte aujourd’hui (≥ ${R.alerteJour} %).` : 'Dans les limites.' };
}
export function latent(P, prixDe) { let s = 0; for (const p of P) if (p.etat === 'ouverte') { const x = prixDe(p.actif); if (x > 0) s += resultatR(p, x) * calcul(p).risque$; } return s; }

/* export / import du journal */
export const FORMAT_JOURNAL = 'rayle-terminal-journal-1';
const COLONNES = ['date', 'actif', 'sens', 'evenement', 'prix', 'R', 'duree_min', 'setup', 'actualite', 'note', 'position'];
export function exporterJson(positions, lignes) { return JSON.stringify({ format: FORMAT_JOURNAL, exporte: new Date().toISOString(), positions, lignes }, null, 1); }
export function exporterCsv(lignes) {
  const q = v => { const s = v == null ? '' : String(v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return [COLONNES.join(';')].concat(lignes.slice().sort((a, b) => a.t - b.t).map(l => [new Date(l.t).toISOString(), l.actif, l.sens, l.evenement, l.prix, l.R == null ? '' : l.R.toFixed(3), l.duree == null ? '' : Math.round(l.duree / 60e3), l.setup, l.actualite, l.note, l.position].map(q).join(';'))).join('\n');
}
export function importerJson(texte) {
  let d; try { d = JSON.parse(texte); } catch (e) { throw new Error('fichier illisible (JSON attendu)'); }
  if (!d || d.format !== FORMAT_JOURNAL || !Array.isArray(d.positions)) throw new Error('ce fichier n’est pas un export du journal du terminal');
  return { positions: d.positions.map(p => creerPosition(p, { t: p.cree })).filter(Boolean).map((p, i) => ({ ...p, ...pick(d.positions[i]) })), lignes: Array.isArray(d.lignes) ? d.lignes.filter(l => l && l.id && l.t) : [] };
}
const pick = o => ({ etat: o.etat, tEntree: o.tEntree ?? null, tSortie: o.tSortie ?? null, prixSortie: o.prixSortie ?? null, historique: o.historique || [] });
export function importerCsv(texte) {
  const L = texte.replace(/\r/g, '').split('\n').filter(Boolean); if (!L.length) return [];
  const sep = L[0].includes(';') ? ';' : ',', tete = decouper(L[0], sep).map(s => s.trim().toLowerCase());
  return L.slice(1).map(l => { const v = decouper(l, sep), o = Object.fromEntries(tete.map((k2, i) => [k2, v[i]])); const t = Date.parse(o.date);
    return Number.isFinite(t) ? { id: `csv|${o.position || ''}|${o.evenement || ''}|${t}`, t, actif: o.actif || '', sens: o.sens || '', evenement: o.evenement || 'importé', prix: o.prix ? +o.prix : null, R: o.r !== undefined && o.r !== '' ? +o.r : null, duree: o.duree_min ? +o.duree_min * 60e3 : null, setup: o.setup || '', actualite: o.actualite || '', note: o.note || '', position: o.position || '', importe: true } : null; }).filter(Boolean);
}
function decouper(l, sep) { const o = []; let c = '', q = false; for (let i = 0; i < l.length; i++) { const ch = l[i]; if (q) { if (ch === '"' && l[i + 1] === '"') { c += '"'; i++; } else if (ch === '"') q = false; else c += ch; } else if (ch === '"') q = true; else if (ch === sep) { o.push(c); c = ''; } else c += ch; } o.push(c); return o; }
