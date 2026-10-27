import { executerTranche } from './pilote-calcul.js';

/* ═════════════ WORKER DE NAVIGATEUR : une tranche de la recherche sans fin tourne ICI, jamais sur le thread de l'interface ni dans le Worker Cloudflare ═════════════
   Messages reçus : { type: 'serie', serie } (les bougies M15 en colonnes, gardées en mémoire) · { type: 'tranche', charge } · { type: 'arret' }.
   Messages émis : { type: 'evenement', ev } (progrès), { type: 'fin', res } (résultat de la tranche), { type: 'erreur', message }.
   Pauses selon la charge choisie : max = aucune, normale = petite, douce = la moitié du processeur (pour jouer en même temps). */
let serie = null, arret = false;
const PAUSE_MS = { max: 0, normale: 8, douce: 40 };
self.onmessage = async e => {
  const m = e.data;
  if (m.type === 'arret') { arret = true; return; }
  if (m.type === 'serie') { serie = m.serie; return; }
  if (m.type !== 'tranche') return;
  arret = false;
  const pause = PAUSE_MS[m.charge && m.charge.profil && m.charge.profil.budget && m.charge.profil.budget.charge] != null ? PAUSE_MS[m.charge.profil.budget.charge] : PAUSE_MS.douce;
  try {
    if (!serie) throw new Error('aucune donnée reçue');
    const res = await executerTranche(m.charge, { m15: serie, cede: () => new Promise(r => setTimeout(r, pause)), arret: () => arret,
      surEvenement: ev => { if (ev.type === 'progres' || ev.type === 'chantier' || ev.type === 'debut') self.postMessage({ type: 'evenement', ev: { type: ev.type, N: ev.N, niveau: ev.niveau, chantier: ev.chantier ? { nom: ev.chantier.nom } : undefined } }); } });
    self.postMessage({ type: 'fin', res });
  } catch (err) { self.postMessage({ type: 'erreur', message: String(err && err.message || err) }); }
};
