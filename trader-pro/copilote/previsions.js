/* ═════════════ CARNET DE PRÉVISIONS : Rayle se vérifie elle-même, et le dit honnêtement ═════════════
   Chaque scénario PRINCIPAL que Rayle donne est enregistré (actif, direction, horizon, niveau d'invalidation, type de situation). Il est vérifié AUTOMATIQUEMENT à +1, +3 et +5 jours :
     juste (le prix a avancé dans le sens du scénario d'au moins 0,25 ATR Daily) · faux (il a reculé d'au moins 0,25 ATR) · neutre (ni l'un ni l'autre) · invalidé (une clôture H1 a franchi le niveau d'invalidation).
   La fenêtre « Fiabilité de Rayle » donne le taux de réussite par actif, par unité de temps et par type de situation. Rayle s'en sert : elle adapte sa confiance (« ce type de situation m'a donné raison 7 fois
   sur 10 ce mois-ci ») et dit franchement quand une situation lui réussit mal. Moins de 5 cas : elle dit « trop tôt pour juger ». Module pur, testé ; aucune donnée personnelle. */
export const JOUR = 86400e3, H = 3600e3, HORIZONS = Object.freeze([1, 3, 5]), TOL_ATR = 0.25, MIN_CAS = 5, MIN_CAS_AJUSTEMENT = 8, MAX_PREVISIONS = 600;
export const NOM_SITUATION = Object.freeze({ cassure_ma200_volume: 'une cassure de la MA200 avec volume', volume_extreme_fin: 'une bougie de volume extrême en fin de mouvement', balayage: 'un balayage de niveau clé', avant_annonce: 'une situation à l’approche d’une annonce', tendance_alignee: 'une tendance Daily et H4 alignées', tendance_mixte: 'une tendance mixte' });
export const NOM_ACTIF = Object.freeze({ or: 'l’or', us100: 'le Nasdaq 100', us500: 'le S&P 500', btc: 'le Bitcoin', sol: 'Solana', petrole: 'le pétrole', dxy: 'le dollar' });
const arr = (v, d = 2) => (Number.isFinite(v) ? +v.toFixed(d) : null), SITUATIONS_EVENT = ['cassure_ma200_volume', 'volume_extreme_fin', 'balayage'];

/* ───── enregistrement ───── */
export function enregistrer(liste, scenarios, maintenant = Date.now(), { atrJ = {}, minEspaceMs = 12 * H } = {}) {
  const L = (liste || []).map(p => ({ ...p, verifs: { ...p.verifs } })); let n = 0;
  for (const s of scenarios || []) {
    if (!s || !s.sens || !Number.isFinite(s.prix0)) continue; const derniere = L.filter(p => p.actif === s.actif).sort((a, b) => b.t - a.t)[0];
    const nouveau = !derniere || maintenant - derniere.t >= minEspaceMs || derniere.sens !== s.sens || (SITUATIONS_EVENT.includes(s.situation) && derniere.situation !== s.situation && maintenant - derniere.t >= 2 * H);
    if (!nouveau) continue;
    L.push({ id: `${s.actif}|${Math.floor(maintenant / H)}`, actif: s.actif, t: maintenant, sens: s.sens, unite: s.unite || 'H4', situation: s.situation, prix0: arr(s.prix0, 6), inval: s.invalidation ? { prix: arr(s.invalidation.prix, 6), nom: s.invalidation.nom } : null, objectifPct: s.objectifPct ?? null, confiance: s.confiance || null, atrJ: arr(atrJ[s.actif], 6), horizonJours: 5, verifs: { j1: null, j3: null, j5: null }, statut: 'ouvert' }); n++;
  }
  return { liste: L.sort((a, b) => a.t - b.t).slice(-MAX_PREVISIONS), ajoutees: n };
}

/* ───── vérification à +1, +3, +5 jours ───── */
const prixA = (B, t, tolMs = 60 * H) => { let lo = 0, hi = B.length - 1, r = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (B[m].t + H <= t) { r = m; lo = m + 1; } else hi = m - 1; } return r >= 0 && t - (B[r].t + H) <= tolMs ? { c: B[r].c, i: r } : null; };
export function verifier(liste, barresH1, maintenant = Date.now()) {
  const L = (liste || []).map(p => ({ ...p, verifs: { ...p.verifs } })); let n = 0;
  for (const p of L) {
    if (p.statut === 'clos') continue; const B = barresH1[p.actif]; if (!B || !B.length) continue; const seuil = (p.atrJ || 0) * TOL_ATR;
    for (const k of HORIZONS) {
      const cle = 'j' + k; if (p.verifs[cle]) continue; const cible = p.t + k * JOUR; if (maintenant < cible + H) break;
      /* invalidé : une clôture H1 au-delà du niveau, contre le scénario, avant l'échéance */
      let invalide = false; if (p.inval) for (const b of B) { if (b.t < p.t || b.t + H > cible) continue; if ((p.sens > 0 && b.c < p.inval.prix) || (p.sens < 0 && b.c > p.inval.prix)) { invalide = true; break; } }
      if (invalide) { for (const k2 of HORIZONS) if (k2 >= k && !p.verifs['j' + k2]) p.verifs['j' + k2] = 'invalide'; p.statut = 'clos'; n++; break; }
      const x = prixA(B, cible); if (!x) continue; const gain = (x.c - p.prix0) * p.sens; p.verifs[cle] = gain >= seuil ? 'juste' : gain <= -seuil ? 'faux' : 'neutre'; n++;
    }
    if (p.verifs.j5) p.statut = 'clos';
  }
  return { liste: L, verifiees: n };
}

/* ───── fiabilité ───── */
export const verdict = (p, horizon = 3) => p.verifs && p.verifs['j' + horizon] || null;
export function statsDe(L, horizon = 3) {
  const V = L.map(p => verdict(p, horizon)).filter(Boolean), c = x => V.filter(v => v === x).length, n = V.length;
  return { n, juste: c('juste'), faux: c('faux'), neutre: c('neutre'), invalide: c('invalide'), taux: n ? c('juste') / n : null };
}
export function filtrer(liste, { actif = null, situation = null, unite = null, jours = null, maintenant = Date.now() } = {}) {
  return (liste || []).filter(p => (!actif || p.actif === actif) && (!situation || p.situation === situation) && (!unite || p.unite === unite) && (jours == null || p.t >= maintenant - jours * JOUR));
}
export function statistiques(liste, maintenant = Date.now()) {
  const L = liste || [], groupe = (cle, valeurs) => Object.fromEntries(valeurs.map(v => [v, { ...statsDe(L.filter(p => p[cle] === v)), total: L.filter(p => p[cle] === v).length }]).filter(([, s]) => s.total > 0));
  return { total: L.length, ouvertes: L.filter(p => p.statut === 'ouvert').length, parHorizon: Object.fromEntries(HORIZONS.map(k => ['j' + k, statsDe(L, k)])), global: statsDe(L, 3),
    parActif: groupe('actif', [...new Set(L.map(p => p.actif))]), parUnite: groupe('unite', [...new Set(L.map(p => p.unite))]), parSituation: groupe('situation', [...new Set(L.map(p => p.situation))]),
    mois: statsDe(filtrer(L, { jours: 30, maintenant }), 3), recentes: L.slice().sort((a, b) => b.t - a.t).slice(0, 12) };
}
const sur10 = (j, n) => `${j} fois sur ${n}`;
/* « ce type de situation m'a donné raison 7 fois sur 10 ce mois-ci » : texte + ajustement de la confiance (seulement avec assez de cas) */
export function fiabiliteSituation(liste, { actif = null, situation, maintenant = Date.now() } = {}) {
  const L = filtrer(liste, { situation, jours: 30, maintenant }), S = statsDe(L, 3), nom = NOM_SITUATION[situation] || 'ce type de situation', nombres = [S.n, S.juste, S.faux, S.invalide];
  if (S.n < MIN_CAS) return { n: S.n, taux: S.taux, texte: S.n ? `Sur ${nom}, je n’ai que ${S.n} cas vérifié${S.n > 1 ? 's' : ''} ce mois-ci : trop tôt pour juger ma fiabilité.` : '', nombres, ajuste: c => c };
  const raison = `${S.juste} fois sur ${S.n}`; nombres.push(S.juste, S.n);
  if (S.taux < 0.4) return { n: S.n, taux: S.taux, texte: `Attention : ${nom} me réussit mal ce mois-ci : ${NOM_ACTIF[actif] ? '' : ''}je n’ai eu raison que ${raison} à trois jours. Je baisse donc ma confiance.`, nombres, ajuste: c => (/solide|moyen/.test(c) ? 'signal faible' : c) };
  if (S.taux >= 0.7 && S.n >= MIN_CAS_AJUSTEMENT) return { n: S.n, taux: S.taux, texte: `Ce type de situation (${nom}) m’a donné raison ${raison} ce mois-ci.`, nombres, ajuste: c => (/moyen/.test(c) ? 'signal assez solide' : c) };
  return { n: S.n, taux: S.taux, texte: `Ce type de situation (${nom}) m’a donné raison ${raison} ce mois-ci.`, nombres, ajuste: c => c };
}
/* objet passé au compositeur de points : previsions.fiabilite({ actif, situation, maintenant }) */
export const creerPrevisions = liste => ({ liste: liste || [], fiabilite: a => fiabiliteSituation(liste || [], a) });
/* phrases de la fenêtre « Fiabilité de Rayle » */
export function resumeParle(st) {
  if (!st.total) return 'Je n’ai pas encore enregistré de prévision : ma fiabilité se mesurera au fil des jours.';
  const g = st.global; if (g.n < MIN_CAS) return `J’ai enregistré ${st.total} prévision${st.total > 1 ? 's' : ''}, mais seulement ${g.n} ${g.n > 1 ? 'sont vérifiées' : 'est vérifiée'} à trois jours : trop tôt pour juger.`;
  const meilleur = Object.entries(st.parSituation).filter(([, s]) => s.n >= MIN_CAS).sort((a, b) => b[1].taux - a[1].taux), pire = meilleur[meilleur.length - 1], bon = meilleur[0];
  return `À trois jours, j’ai eu raison ${sur10(g.juste, g.n)} (${Math.round(g.taux * 100)} %), tort ${g.faux} fois, et ${g.invalide} scénario${g.invalide > 1 ? 's ont' : ' a'} été invalidé${g.invalide > 1 ? 's' : ''}.${bon ? ` Ma meilleure situation : ${NOM_SITUATION[bon[0]] || bon[0]} (${sur10(bon[1].juste, bon[1].n)}).` : ''}${pire && pire !== bon && pire[1].taux < 0.5 ? ` Celle qui me réussit le moins : ${NOM_SITUATION[pire[0]] || pire[0]} (${sur10(pire[1].juste, pire[1].n)}).` : ''}`;
}
