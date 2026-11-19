/* ═════════════ ALERTES « MA LISTE » (module PUR, testé ; fenêtre ouverte = annonce vocale, Worker Cloudflare = Telegram) ═════════════
   Trois alertes, toutes calculées sur la liste de suivi et l'horizon choisi :
   1. passage en « Attractif » ou « Très attractif » (le libellé précédent n'était pas dans cet ensemble) ;
   2. ouverture d'une fenêtre saisonnière favorable (le mois en cours est le premier mois de la meilleure fenêtre de l'instrument : positive au moins 70 % des années, 10 ans minimum) ;
   3. prix sur la MA200 Daily (à moins de 0,5 ATR) ou au contact d'un support majeur Daily (à moins de 0,5 ATR au-dessus), une fois par jour et par instrument.
   L'état précédent est conservé par l'appelant (localStorage ou base du Worker). La première lecture d'un instrument n'envoie jamais d'alerte « passage » (pas d'état précédent). Aucune alerte n'est un ordre. */
import { verdictLigne, LIBELLES } from './modele.js';
import { libelleFenetre } from './saison.js';

const BONS = new Set([LIBELLES.TRES, LIBELLES.ATTR]), fin = x => typeof x === 'number' && Number.isFinite(x);
const jour = t => new Date(t).toISOString().slice(0, 10), mois = t => new Date(t).toISOString().slice(0, 7);
/* fenetres : { id: { a, b, median, pctPositif, n } } — meilleure fenêtre significative de chaque instrument (facultatif) */
export function detecterAlertes(liste, lignes, prec = {}, { horizon = 'moyen', ajust = {}, maintenant = Date.now(), fenetres = null } = {}) {
  const alertes = [], etat = { ...prec }, par = new Map(lignes.map(l => [l.id, l])), j = jour(maintenant), m = mois(maintenant), mNum = new Date(maintenant).getUTCMonth() + 1;
  for (const id of liste || []) {
    const l = par.get(id); if (!l) continue; const v = verdictLigne(l, horizon, { ajust }), e = { ...(etat[id] || {}) }, avant = e.lib && e.lib[horizon];
    if (BONS.has(v.lib) && avant && !BONS.has(avant)) alertes.push({ type: 'attractif', id, nom: l.n, lib: v.lib, horizon, score: v.score, texte: `${l.n} passe « ${v.lib} » sur l’horizon ${horizon === 'tactique' ? 'tactique' : horizon === 'swing' ? 'swing' : horizon === 'moyen' ? '1 à 3 ans' : '5 à 10 ans'} (score ${v.score == null ? '—' : Math.round(v.score)}).` });
    e.lib = { ...(e.lib || {}), [horizon]: v.lib };
    const w = fenetres && fenetres[id]; if (w && w.a === mNum && e.fen !== m) { alertes.push({ type: 'fenetre', id, nom: l.n, texte: `Une fenêtre saisonnière favorable s’ouvre pour ${l.n} : ${libelleFenetre(w.a, w.b)}, rendement médian ${(w.median * 100).toFixed(1).replace('.', ',')} % et positive ${Math.round(w.pctPositif * 100)} % des années sur ${w.n} ans.` }); e.fen = m; }
    if (e.niveau !== j) {
      if (fin(l.dma) && Math.abs(l.dma) <= 0.5) { alertes.push({ type: 'ma200', id, nom: l.n, texte: `${l.n} est sur sa MA200 Daily (à ${Math.abs(l.dma).toFixed(1).replace('.', ',')} ATR).` }); e.niveau = j; }
      else if (fin(l.dsup) && l.dsup >= 0 && l.dsup <= 0.5) { alertes.push({ type: 'support', id, nom: l.n, texte: `${l.n} touche un support majeur Daily.` }); e.niveau = j; }
    }
    etat[id] = e;
  }
  return { alertes, etat };
}
export const phraseAlertes = A => (A.length ? A.slice(0, 3).map(a => a.texte).join(' ') + (A.length > 3 ? ` Et ${A.length - 3} autre${A.length > 4 ? 's' : ''}.` : '') + ' Ce n’est pas un conseil.' : '');
