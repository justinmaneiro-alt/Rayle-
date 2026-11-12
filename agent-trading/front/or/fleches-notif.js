/* ═════════════ NOTIFICATIONS DES FLÈCHES (mode Direct seulement) — module unique, pur, sans DOM, sans réseau ═════════════
   Alimenté par le moteur de flèches Direct (fleches-simples-v5), jamais par l'Historique. Utilisé par la page (canaux vocal + navigateur/PWA) et par le script serveur (Telegram).
   Une notification par flèche (déduplication par identifiant, persistante grâce à `etat.ids`) ; rien pour les points gris contre-tendance ; « Signal invalidé » une seule fois par flèche invalidée.
   Anti-spam : au plus 6 notifications par heure et par actif, repos de 5 minutes entre deux notifications d'un même niveau ; plusieurs nouveautés d'un même passage = UN message groupé.
   Information de lecture, jamais un ordre. */
export const LIMITE_HEURE = 6, REPOS_NIVEAU = 5 * 60e3, MAX_IDS = 400, FRAICHEUR = 2 * 3600e3;
const heure = t => new Date(t).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });
const fr = x => Math.round(x).toLocaleString('fr-FR').replace(/[\u00a0\u202f]/g, ' ');
const plage = f => f.zoneBas != null && f.zoneHaut != null ? (Math.round(f.zoneBas) === Math.round(f.zoneHaut) ? fr(f.zoneHaut) : `${fr(f.zoneBas)}–${fr(f.zoneHaut)}`) : '';

/* événements à notifier : flèches normales récentes (jamais un point gris), invalidations récentes */
export function evenements(registre, { maintenant, vus = new Set(), fraicheur = FRAICHEUR } = {}) {
  const out = [];
  for (const f of registre || []) {
    if (!f || f.masquee || f.contre) continue;                                     // point gris : ni notification ni alerte vocale
    if (f.tCloture > maintenant - fraicheur && !vus.has('f|' + f.id)) out.push({ cle: 'f|' + f.id, genre: 'fleche', f, t: f.tCloture });
    if (f.invalidee && f.invalideeT > maintenant - fraicheur && !vus.has('i|' + f.id)) out.push({ cle: 'i|' + f.id, genre: 'invalide', f, t: f.invalideeT });
  }
  return out.sort((a, b) => a.t - b.t);
}
/* texte d'un événement : { titre, corps } (titre court de type « OR H1 · Retournement haussier sur 4 131–4 144 (confirmé 21:00) ») */
export function formater(e, actif = 'OR', unite = 'H1') {
  const f = e.f, p = `${actif} ${unite} · `, h = heure(f.tCloture);
  if (e.genre === 'invalide') {
    const quoi = f.type === 'ma_cassure' ? 'cassure' : `${f.dir > 0 ? 'retournement haussier' : 'retournement baissier'} sur ${plage(f)}`;
    return { titre: `${p}Signal invalidé : ${quoi} (à ${heure(f.invalideeT)})`, corps: `Une bougie a clôturé de l'autre côté du niveau : le rebond est ravalé. Signal posé à ${h}, repère de lecture, pas un ordre.` };
  }
  if (f.type === 'ma_cassure') return { titre: `${p}${f.dir > 0 ? 'Cassure haussière' : 'Cassure baissière'} de la MA200 confirmée (${h})`, corps: `Apparue à ${h} (clôture de la bougie H1) · prix ${fr(f.prix)} · repère de lecture, pas un ordre.` };
  const niveau = f.niveauType === 'structure' && f.niveauNom ? `${f.niveauNom} ${plage(f)}` : plage(f);
  return { titre: `${p}${f.dir > 0 ? 'Retournement haussier' : 'Retournement baissier'} sur ${niveau} (confirmé ${h})`, corps: `Apparue à ${h} (clôture de la bougie H1) · prix ${fr(f.prix)}${f.stabilisation ? ' · contre-tendance mais ' + (f.stabilisation === 'base' ? 'base confirmée' : 'divergence RSI') : ''} · repère de lecture, pas un ordre.` };
}
/* notifieur : etat = { ids: [], envois: [{ t, actif, niveau }] } (sérialisable : fichier du serveur, stockage de la page) ; canaux = [async ({ titre, corps, groupe, evenements }) => void] */
export function creerNotifieur({ etat = {}, canaux = [], maintenant = () => Date.now(), actif = 'OR', unite = 'H1' } = {}) {
  etat.ids = etat.ids || []; etat.envois = etat.envois || [];
  const stats = { envoyes: 0, groupes: 0, refusesLimite: 0, refusesRepos: 0, erreurs: 0 };
  const vu = () => new Set(etat.ids);
  async function traiter(registre, { silencieux = false } = {}) {
    const n = maintenant(), nouveaux = evenements(registre, { maintenant: n, vus: vu() });
    for (const e of nouveaux) { etat.ids.push(e.cle); }                              // dédupliqué dans tous les cas (même si la limite refuse l'envoi : jamais de rattrapage tardif)
    if (etat.ids.length > MAX_IDS) etat.ids = etat.ids.slice(-MAX_IDS);
    if (silencieux || !nouveaux.length) return [];
    etat.envois = etat.envois.filter(x => x.t > n - 3600e3);
    const gardes = [];
    for (const e of nouveaux) {
      const niveau = e.f.levelId || 'MA200';
      if (etat.envois.length + gardes.length >= LIMITE_HEURE) { stats.refusesLimite++; continue; }
      if (etat.envois.some(x => x.niveau === niveau && n - x.t < REPOS_NIVEAU)) { stats.refusesRepos++; continue; }
      gardes.push(e);
    }
    if (!gardes.length) return [];
    const unique = gardes.length === 1, textes = gardes.map(e => formater(e, actif, unite));
    const msg = unique ? { ...textes[0], groupe: false, evenements: gardes } : { titre: `${actif} ${unite} · ${gardes.length} signaux`, corps: textes.map(t => '• ' + t.titre.replace(`${actif} ${unite} · `, '')).join('\n') + '\nRepères de lecture, pas des ordres.', groupe: true, evenements: gardes };
    for (const e of gardes) etat.envois.push({ t: n, actif, niveau: e.f.levelId || 'MA200' });
    if (!unique) stats.groupes++;
    for (const c of canaux) { try { await c(msg); stats.envoyes++; } catch (er) { stats.erreurs++; } }
    return gardes;
  }
  return { traiter, etat, stats };
}
