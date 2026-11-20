/* ═════════════ ALERTES DE CLÔTURE 100 % WORKER (v6, B3) — Telegram même PC éteint et appli fermée ═════════════
   À l'ouverture d'une bougie H1 / H4 / Daily (cron), le Worker : lit signaux.json (calculé par GitHub Actions : flèches MA200 et Volume + dernières bougies closes), évalue MES niveaux tracés (lignes, boîtes,
   tendances, Fibonacci, lus depuis la synchronisation D1 : un niveau tracé sur la tablette déclenche une alerte même tablette éteinte), puis envoie UN message Telegram groupé.
   Coût : 1 sous-requête pour signaux.json (≈ 10 ko) + 1 pour Telegram, quelques lectures D1, comparaisons seulement (CPU négligeable). Lecture seule : aucun ordre n'est jamais passé.
   Anti-spam : un identifiant par événement (jamais deux fois), regroupement par clôture (6 lignes au plus, « + N autres »), heures de silence réglables (les événements retenus partent en un résumé à la fin du silence). */
import { visibles } from '../../terminal/dessins-fusion.js';
export const ACTIFS = ['or', 'us100', 'us500', 'btc', 'sol', 'eurusd'], NOMS = { or: 'Or', us100: 'Nasdaq 100', us500: 'S&P 500', btc: 'Bitcoin', sol: 'Solana', eurusd: 'EUR/USD' };
export const BASE_SIGNAUX = 'https://raw.githubusercontent.com/justinmaneiro-alt/Rayle-/donnees/signaux.json';
const PAS = { H1: 3600e3, H4: 4 * 3600e3, J: 86400e3 }, NOM_U = { H1: 'H1', H4: 'H4', J: 'Daily' }, ANCIENNETE_MAX = 36 * 3600e3, MAX_IDS = 500, MAX_HIST = 100, MAX_ATTENTE = 40, LIGNES_MAX = 6;
const fmt = v => (Number.isFinite(v) ? (+v.toPrecision(v < 10 ? 5 : 7)).toLocaleString('fr-FR', { maximumFractionDigits: v < 10 ? 5 : 2 }) : '?');

/* niveau d'une tendance au temps t (droite passant par les deux points) */
const surTendance = (o, t) => (o.t2 !== o.t1 ? o.p1 + (o.p2 - o.p1) * (t - o.t1) / (o.t2 - o.t1) : o.p1);
/* événements de niveaux pour UN actif et UNE unité : precedente / derniere = bougies closes { t, o, h, l, c } */
export function evaluerNiveaux(actif, unite, dessins, { derniere, precedente } = {}) {
  const E = []; if (!derniere || !precedente || !Array.isArray(dessins)) return E; const nom = NOMS[actif] || actif, u = NOM_U[unite] || unite;
  const cote = (c, L) => (c > L ? 1 : c < L ? -1 : 0);
  const croisement = (id, type, Lprec, Lder, libelle) => {
    const sp = cote(precedente.c, Lprec), sd = cote(derniere.c, Lder), base = `niv|${actif}|${unite}|${derniere.t}|${id}`;
    if (sp !== 0 && sd !== 0 && sp !== sd) E.push({ id: base + '|cassure', source: 'niveau', actif, unite, t: derniere.t, dir: sd, texte: `${nom} ${u} : clôture ${sd > 0 ? 'au-dessus' : 'sous'} de ${libelle} (${fmt(Lder)})`, niveau: Lder });
    else if (sd !== 0 && sp === sd && (sd > 0 ? derniere.l <= Lder && derniere.c > Lder : derniere.h >= Lder && derniere.c < Lder)) E.push({ id: base + '|rejet', source: 'niveau', actif, unite, t: derniere.t, dir: sd, texte: `${nom} ${u} : rejet sur ${libelle} (${fmt(Lder)}), clôture ${sd > 0 ? 'au-dessus' : 'sous'}`, niveau: Lder });
  };
  for (const o of visibles(dessins)) {
    const id = String(o.id || o.type);
    if (o.type === 'horizontale' && Number.isFinite(o.p)) croisement(id, 'h', o.p, o.p, 'ta ligne');
    else if (o.type === 'tendance' && [o.t1, o.p1, o.t2, o.p2].every(Number.isFinite)) croisement(id, 't', surTendance(o, precedente.t), surTendance(o, derniere.t), 'ta tendance');
    else if (o.type === 'boite' && Number.isFinite(o.haut) && Number.isFinite(o.bas)) {
      const dedans = c => c <= o.haut && c >= o.bas, base = `niv|${actif}|${unite}|${derniere.t}|${id}|boite`;
      if (dedans(precedente.c) && !dedans(derniere.c)) E.push({ id: base, source: 'niveau', actif, unite, t: derniere.t, dir: derniere.c > o.haut ? 1 : -1, texte: `${nom} ${u} : clôture ${derniere.c > o.haut ? 'au-dessus' : 'sous'} de ta boîte (${fmt(o.bas)}–${fmt(o.haut)})`, niveau: derniere.c > o.haut ? o.haut : o.bas });
    } else if (o.type === 'fibo' && Number.isFinite(o.p1) && Number.isFinite(o.p2)) for (const r of [0.382, 0.5, 0.618, 0.705]) { const L = o.p2 - (o.p2 - o.p1) * r; croisement(id + '|' + r, 'f', L, L, 'Fibonacci ' + String(r).replace('.', ',')); }
  }
  return E;
}
/* flèches de signaux.json à annoncer : récentes, déjà clôturées, selon les réglages (MA200 et Volume ; le Volume H1 seulement si demandé) */
export function choisirFleches(signaux, reglages = {}, maintenant = Date.now()) {
  const E = []; for (const [actif, a] of Object.entries((signaux && signaux.actifs) || {})) for (const f of a.fleches || []) {
    if (!(f.tFin <= maintenant && maintenant - f.tFin < ANCIENNETE_MAX)) continue;
    if (f.source === 'ma200' && reglages.actif === false) continue; if (f.source === 'volume' && (reglages.volume === false || (f.unite === 'H1' && reglages.volumeH1 !== true))) continue;
    E.push({ id: 'fl|' + f.id, source: f.source, actif, unite: f.unite, t: f.t, dir: f.dir, texte: f.texte, niveau: f.niveau });
  }
  return E;
}
/* heures de silence (heure de Paris) : { actif, debut: 'HH:MM', fin: 'HH:MM' } ; traverse minuit si debut > fin */
export function dansSilence(t, reg, heureParis) {
  if (!reg || reg.actif === false || !reg.debut || !reg.fin) return false; const { h, m } = heureParis(t), x = h * 60 + m, mm = s => { const [a, b] = String(s).split(':').map(Number); return a * 60 + (b || 0); }, d = mm(reg.debut), f = mm(reg.fin);
  return d === f ? false : d < f ? x >= d && x < f : x >= d || x < f;
}
/* message groupé */
export function composerMessage(events, { titre = 'Rayle', resume = false } = {}) {
  if (!events.length) return ''; const L = events.slice(0, LIGNES_MAX).map(e => '• ' + e.texte), reste = events.length - L.length;
  return `🔔 ${titre}${resume ? ' · résumé de la nuit' : ''}${events.length > 1 ? ` (${events.length} événements)` : ''}\n${L.join('\n')}${reste > 0 ? `\n… et ${reste} autre${reste > 1 ? 's' : ''}` : ''}\n(Lecture seule : aucun ordre n'est passé.)`;
}
export const etatVide = () => ({ envoyees: [], attente: [], historique: [] });
/* une passe : renvoie { nouveaux, envoyes, retenus } ; état dans D1 (une ligne « alertes-cloture ») écrit seulement s'il change */
export async function traiterClotures(env, depot, t, { fetchFn = fetch, heureParis, unites = ['H1', 'H4', 'J'] } = {}) {
  const etat = (await depot.kvLire('alertes-cloture')) || etatVide(), sync = (await depot.kvLire('sync')) || { cles: {} }, regl = (sync.cles['rayle_tp_fleches_alertes'] || {}).valeur || {}, silence = (sync.cles['rayle_alertes_silence_v1'] || {}).valeur || null;
  let signaux = null; try { const r = await fetchFn(BASE_SIGNAUX + '?v=' + Math.floor(t / 60000), { signal: AbortSignal.timeout(8000) }); if (r.ok) signaux = await r.json(); } catch (e) { /* signaux indisponibles : seuls les niveaux seront évalués avec les dernières bougies connues */ }
  const deja = new Set([...etat.envoyees, ...etat.attente.map(e => e.id)]), candidats = choisirFleches(signaux, regl, t);
  if (signaux) for (const actif of ACTIFS) { const a = signaux.actifs && signaux.actifs[actif]; if (!a || !a.derniere) continue; const D = (await depot.kvLire('dessins:' + actif)) || []; if (!D.length) continue; for (const u of unites) { const b = a.derniere[u]; if (b && b.derniere && b.derniere.t + PAS[u] <= t && t - (b.derniere.t + PAS[u]) < ANCIENNETE_MAX) candidats.push(...evaluerNiveaux(actif, u, D, b)); } }
  const vusIci = new Set(), neufs = candidats.filter(e => !deja.has(e.id) && !vusIci.has(e.id) && vusIci.add(e.id)), enSilence = dansSilence(t, silence, heureParis), tg = !!(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID);
  let aEnvoyer = [], resume = false, changement = false, envoye = false;
  if (enSilence) { if (neufs.length) { etat.attente = [...etat.attente, ...neufs].slice(-MAX_ATTENTE); for (const e of neufs) etat.historique.push({ t, id: e.id, source: e.source, actif: e.actif, unite: e.unite, texte: e.texte, envoye: 'retenue (heures de silence)' }); changement = true; } }
  else { aEnvoyer = [...etat.attente, ...neufs]; resume = etat.attente.length > 0; }
  if (aEnvoyer.length) {
    if (tg) { try { const r = await fetchFn(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: composerMessage(aEnvoyer, { resume }) }), signal: AbortSignal.timeout(8000) }); envoye = r.ok; } catch (e) { envoye = false; } }
    if (tg && !envoye) { etat.attente = aEnvoyer.slice(-MAX_ATTENTE); changement = true; }   // Telegram a refusé : on retentera au prochain passage, sans doublon
    else { for (const e of aEnvoyer) { etat.historique.push({ t, id: e.id, source: e.source, actif: e.actif, unite: e.unite, texte: e.texte, envoye: tg ? 'telegram' : 'non configuré' }); etat.envoyees.push(e.id); } etat.attente = []; changement = true; }   // sans Telegram : noté une fois, jamais renvoyé en boucle
  }
  etat.envoyees = etat.envoyees.slice(-MAX_IDS); etat.historique = etat.historique.slice(-MAX_HIST);
  if (changement) await depot.kvEcrire('alertes-cloture', etat);   // aucune écriture quand rien ne s'est passé
  return { nouveaux: neufs.length, envoyes: envoye ? aEnvoyer.length : 0, retenus: etat.attente.length };
}
/* GET /alertes/historique : les 100 dernières alertes (pour l'appli) */
export async function historiqueAlertes(depot) { const e = (await depot.kvLire('alertes-cloture')) || etatVide(); return { historique: [...e.historique].reverse(), enAttente: e.attente.length }; }
