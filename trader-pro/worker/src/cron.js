/* ═════════════ UN SEUL DÉCLENCHEUR PLANIFIÉ (v6) : toutes les 5 minutes, la tâche est choisie selon l'heure ═════════════
   Plan gratuit : 5 déclencheurs pour TOUT le compte ; Rayle n'en utilise qu'UN (toutes les 5 minutes, voir wrangler.toml) et décide ici de ce qu'il faut faire. 10 ms de CPU par exécution : chaque tâche ne fait que des
   comparaisons et de petites lectures ; tout calcul lourd est fait la nuit par GitHub Actions et publié en fichiers. Au plus 50 appels externes par exécution (budget par tâche ci-dessous).
   Tâches (chacune isolée : l'échec de l'une n'empêche pas les autres) :
     · budget       : toujours (une écriture D1 par passage) ;
     · alertes de prix, rappel d'import XTB, alertes Investissement : toujours (déjà en place) ;
     · clôtures     : à l'ouverture d'une bougie H1 / H4 / Daily (minutes 0 à 4) → alertes de flèches et de niveaux (B3) ;
     · briefing     : jours de semaine, 7 h 45 heure de Paris (B6) ;
     · revue        : dimanche, 18 h heure de Paris (B6). */
export const heureParis = t => { const p = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false }).formatToParts(new Date(t)); const g = k => (p.find(x => x.type === k) || {}).value; return { h: +g('hour') % 24, m: +g('minute'), jour: g('weekday') }; };
const SEM = { 'lun.': 1, 'mar.': 2, 'mer.': 3, 'jeu.': 4, 'ven.': 5, 'sam.': 6, 'dim.': 0 };
/* tâches à lancer pour ce passage (pur, testé) */
export function tachesDuPassage(t = Date.now(), { heureBriefing = [7, 45], heureRevue = [18, 0] } = {}) {
  const d = new Date(t), mn = d.getUTCMinutes(), hu = d.getUTCHours(), P = heureParis(t), js = SEM[P.jour] ?? d.getUTCDay(), L = ['budget', 'alertes-prix', 'rappel-import', 'alertes-invest'];
  if (mn < 5) { L.push('cloture-h1'); if (hu % 4 === 0) L.push('cloture-h4'); if (hu === 0) L.push('cloture-jour'); }
  if (js >= 1 && js <= 5 && P.h === heureBriefing[0] && P.m >= heureBriefing[1] && P.m < heureBriefing[1] + 5) L.push('briefing');
  if (js === 0 && P.h === heureRevue[0] && P.m >= heureRevue[1] && P.m < heureRevue[1] + 5) L.push('revue');
  return L;
}
/* exécute les tâches ; `taches` = { nom: async () => … } ; chaque échec est avalé et compté (jamais d'exception vers Cloudflare) */
export async function lancerTaches(noms, taches) {
  const res = {}; await Promise.all(noms.map(async n => { const f = taches[n]; if (!f) { res[n] = 'absente'; return; } try { res[n] = (await f()) ?? 'ok'; } catch (e) { res[n] = 'erreur : ' + String(e && e.message || e).slice(0, 100); } })); return res;
}
