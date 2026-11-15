/* ═════════════ DONNÉES DES FENÊTRES « PRO » : toujours rapides, jamais bloquées ═════════════
   Principe : (1) la dernière copie gardée sur l'appareil s'affiche TOUT DE SUITE avec son âge ; (2) la lecture réseau part en parallèle avec un délai maximal ;
   (3) si elle échoue, un message clair + « Réessayer » ; jamais « Chargement… » à l'infini. Sources : instantanés du robot (branche « donnees »), puis lecture directe quand elle existe.
   Testable sous Node : fetch, stockage et horloge sont injectables. */
import { lireDonnee, urlSnapshot, originePc, creerStockageParDefaut } from '../../agent-trading/front/donnees/couche.js';

export const DELAI_MS = 6000;

export const avecDelai = (p, ms = DELAI_MS, msg = 'délai dépassé') => new Promise((ok, ko) => { const t = setTimeout(() => ko(Object.assign(new Error(msg + ' (' + Math.round(ms / 1000) + ' s)'), { delai: true })), ms); Promise.resolve(p).then(v => { clearTimeout(t); ok(v); }, e => { clearTimeout(t); ko(e); }); });

/* Lecture d'un instantané du robot. Renvoie { donnees, origine, t, horsLigne } ou lève une erreur lisible. */
export function lireSnapshot(fichier, { delai = DELAI_MS, ttl = 0, fetchFn, stockage, maintenant, valider } = {}) {
  const sources = [{ niveau: 'snapshot', nom: 'instantané ' + fichier, url: urlSnapshot(fichier), ms: delai }];
  return avecDelai(lireDonnee('tp|' + fichier, { sources, ttl, valider: valider || (d => (d && typeof d === 'object' ? true : 'réponse vide')), stockage: stockage || creerStockageParDefaut(), ...(fetchFn ? { fetchFn } : {}), ...(maintenant ? { maintenant } : {}) }), delai + 1500, fichier + ' : pas de réponse');
}
/* Lecture « copie d'abord, puis réseau ».
   onMaj({ statut: 'cache' | 'ok' | 'erreur', donnees, t, origine, horsLigne, erreur }) est appelé au plus deux fois ; la promesse rendue se termine toujours (jamais d'attente infinie). */
export async function lectureProgressive(cle, lire, onMaj, { delai = DELAI_MS, stockage } = {}) {
  const st = stockage || creerStockageParDefaut(); let servi = false;
  try { const c = await st.lire('tp-copie|' + cle); if (c && c.donnees) { servi = true; onMaj({ statut: 'cache', donnees: c.donnees, t: c.t, origine: 'copie locale' }); } } catch (e) { /* stockage indisponible : on continue */ }
  try {
    const r = await avecDelai(lire(), delai + 1500, cle + ' : pas de réponse');
    const t = r && Number.isFinite(r.t) ? r.t : Date.now();
    try { await st.ecrire('tp-copie|' + cle, { t, donnees: r.donnees !== undefined ? r.donnees : r }); } catch (e) { /* copie facultative */ }
    onMaj({ statut: 'ok', donnees: r.donnees !== undefined ? r.donnees : r, t, origine: r.origine || 'réseau', horsLigne: r.horsLigne || null }); return true;
  } catch (e) { onMaj({ statut: 'erreur', erreur: String(e && e.message || e), garde: servi }); return false; }
}

/* ───── séries d'un actif ───── */
export const ACTIFS = Object.freeze([
  { id: 'or', nom: 'Or', court: 'XAU/USD', cot: 'OR', jour: 'XAUUSD', dec: 2, mots: /\bgold\b|\bxau\b|bullion|precious|\bor\b/i },
  { id: 'us100', nom: 'Nasdaq 100', court: 'US100', cot: 'NASDAQ', jour: 'US100', dec: 1, mots: /nasdaq|tech stocks|big tech|equities|nvidia|apple|microsoft/i },
  { id: 'us500', nom: 'S&P 500', court: 'US500', cot: 'SP500', jour: 'US500', dec: 1, mots: /s&p|stocks|wall street|equities/i },
  { id: 'btc', nom: 'Bitcoin', court: 'BTC', cot: 'BTC', jour: 'BTC', dec: 0, mots: /bitcoin|btc|crypto/i },
  { id: 'sol', nom: 'Solana', court: 'SOL', cot: 'SOL', jour: 'SOL', dec: 2, mots: /solana|\bsol\b|crypto/i },
  { id: 'dxy', nom: 'Dollar (DXY)', court: 'DXY', cot: 'DXY', jour: 'DXY', dec: 2, mots: /dollar|\bdxy\b|greenback|usd/i }
]);
export const parId = Object.freeze(Object.fromEntries(ACTIFS.map(a => [a.id, a])));
export const versBougies = L => (L || []).map(x => ({ t: x[0], o: x[1], h: x[2], l: x[3], c: x[4], v: x[5] || 0 }));

/* instantané pro d'un actif : { id, nom, source, recalage, t, prix, tPrix, j, h4, h1, m15 } avec les séries déjà converties en bougies */
export async function lireActifPro(id, opts = {}) {
  const r = await lireSnapshot(`pro-${id}.json`, { ...opts, valider: d => (d && Array.isArray(d.j) && d.j.length > 30 ? true : 'série incomplète') });
  const d = r.donnees; return { ...r, donnees: { ...d, j: versBougies(d.j), h4: versBougies(d.h4), h1: versBougies(d.h1), m15: versBougies(d.m15) } };
}
export const lireCot = (inst, opts = {}) => lireSnapshot(`cot-${inst}.json`, { ...opts, valider: d => (d && Array.isArray(d.serie) && d.serie.length ? true : 'COT vide') });
export const lireCalendrier = (opts = {}) => lireSnapshot('calendrier2.json', { ...opts, valider: d => (d && Array.isArray(d.evenements) ? true : 'calendrier vide') });
export const lireActus = (q = 'marches', opts = {}) => lireSnapshot(`actus-${q}.json`, { ...opts, valider: d => (d && Array.isArray(d.items) ? true : 'actualités vides') });
export const lireJour = (id, opts = {}) => lireSnapshot(`jour-${id}.json`, { ...opts, valider: d => (d && Array.isArray(d.b) && d.b.length > 30 ? true : 'série vide') });
export { originePc };

/* ───── UN SEUL prix de l'or dans toute l'appli ─────
   Référence : le XAU/USD AU COMPTANT (celui de l'accueil : Worker de Rayle, Twelve Data), le plus proche du cours de XTB ; le week-end il vaut la clôture du vendredi, comme chez XTB.
   Repli 1 : Kraken PF_XAUUSD (perpétuel, par le relais dédié), qui continue de coter le week-end : c'est alors une INDICATION, et l'appli le dit.
   Repli 2 : dernier prix de l'instantané pro-or (Kraken ou, à défaut, futures COMEX, étiqueté comme tel). Chaque prix porte sa source et son heure. */
export function marcheOrOuvert(t = Date.now()) {
  const d = new Date(t), j = d.getUTCDay(), h = d.getUTCHours();   // fermé du vendredi 22 h UTC au dimanche 22 h UTC
  return !((j === 5 && h >= 22) || j === 6 || (j === 0 && h < 22));
}
/* spot XAU/USD par le client de marché de l'appli (Worker de Rayle) : même chiffre que l'accueil */
export async function lireSpotOr() {
  const [s, c] = await Promise.all([import('../../marches/trading/session.js'), import('../../marches/trading/cotations.js')]);
  const client = await s.obtenirClient(), [q] = await c.lireCotations(client, ['XAU']);
  if (!q || q.vide || !Number.isFinite(q.prix)) throw new Error((q && q.erreur) || 'pas de prix au comptant');
  return q;
}
/* dernier cours au comptant reçu, gardé sur l'appareil : si le direct ne répond pas, on garde CE prix (étiqueté « dernier cours reçu »), jamais un chiffre d'une autre source */
const CLE_SPOT = 'tp_prix_or_dernier', JOURS4 = 4 * 86400e3;
const lireSpotGarde = () => { try { const v = JSON.parse(localStorage.getItem(CLE_SPOT) || 'null'); return v && Number.isFinite(v.prix) ? v : null; } catch (e) { return null; } };
const garderSpot = v => { try { localStorage.setItem(CLE_SPOT, JSON.stringify({ prix: v.prix, t: v.t, pct: v.pct, source: v.source })); } catch (e) { /* stockage plein ou interdit */ } };
export async function prixOrUnique({ lireSpot, lireTicker, lirePro, lireGarde = lireSpotGarde, garder = garderSpot, maintenant = Date.now(), delaiSpot = 9000 } = {}) {
  const ferme = !marcheOrOuvert(maintenant);
  const mention = ferme ? 'Marché fermé : dernier cours de clôture, comme sur XTB. ' : '';
  if (lireSpot) { try { const q = await avecDelai(lireSpot(), delaiSpot, 'prix au comptant'); if (q && Number.isFinite(q.prix)) { const r = { prix: q.prix, t: q.t || maintenant, source: 'XAU/USD au comptant (' + (q.source || 'Worker de Rayle') + ')', reference: true, ferme, pct: Number.isFinite(q.pct) ? q.pct : null, note: mention + (q.differe ? 'Prix différé. ' : '') + (q.perime ? 'Donnée périmée. ' : '') }; try { garder(r); } catch (e) { /* */ } return r; } } catch (e) { /* on passe au dernier cours gardé */ } }
  if (lireGarde) { try { const g = lireGarde(), age = g ? maintenant - g.t : Infinity; if (g && (ferme ? age < JOURS4 : age < 20 * 60e3)) return { prix: g.prix, t: g.t, source: g.source || 'XAU/USD au comptant', reference: true, ferme, pct: Number.isFinite(g.pct) ? g.pct : null, note: mention + 'Dernier cours reçu : le prix en direct n’a pas répondu. ' }; } catch (e) { /* aucun cours gardé */ } }
  if (lireTicker) { try { const k = await avecDelai(lireTicker(), 5000, 'Kraken'); const p = k && Number.isFinite(+k.last) ? +k.last : null; if (p) return { prix: p, t: Date.parse(k.lastTime) || maintenant, source: 'Kraken PF_XAUUSD (perpétuel, direct)', reference: false, note: (ferme ? 'Le comptant est fermé : indication du perpétuel Kraken (il cote le week-end), pas le cours de clôture de XTB. ' : 'Prix du perpétuel Kraken : le prix au comptant n’a pas répondu. '), bid: +k.bid || null, ask: +k.ask || null }; } catch (e) { /* on passe à l'instantané */ } }
  if (lirePro) { try { const r = await lirePro(), d = r.donnees; if (d && Number.isFinite(d.prix)) { const kr = /Kraken/.test(d.source || ''); return { prix: d.prix, t: d.tPrix || r.t, source: kr ? 'Kraken PF_XAUUSD (instantané)' : 'futures COMEX GC=F (instantané) : pas le XAU/USD au comptant', reference: false, note: (kr ? '' : 'Prix des futures, plusieurs dollars à dizaines de dollars de l’or au comptant. ') + (ferme ? 'Marché au comptant fermé. ' : '') + 'Prix issu d’un instantané du robot, pas du direct.' }; } } catch (e) { /* aucune source */ } }
  return null;
}
/* le lecteur par défaut, câblé sur les vraies sources de l'appli */
/* Les fenêtres demandent le prix en même temps : une seule lecture partagée pendant 15 s, donc EXACTEMENT le même chiffre partout */
let _prixOr = null;
export function prixOr(opts = {}) {
  const perso = Object.keys(opts).length > 0, maintenant = Date.now();
  if (!perso && _prixOr && (_prixOr.p || maintenant - _prixOr.t0 < 15000)) return _prixOr.promesse;
  const promesse = prixOrUnique({ lireSpot: lireSpotOr, lireTicker: async () => (await import('../../agent-trading/front/or/sources-or.js')).tickerKraken(), lirePro: () => lireActifPro('or'), ...opts });
  if (!perso) { _prixOr = { t0: maintenant, p: true, promesse }; promesse.then(v => { if (_prixOr && _prixOr.promesse === promesse) { _prixOr.p = false; _prixOr.t0 = Date.now(); if (!v) _prixOr = null; } }, () => { _prixOr = null; }); }
  return promesse;
}
