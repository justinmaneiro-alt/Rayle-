/* ═════════════ GARDIEN PROP : protège le compte d'évaluation (M6 ; module pur, testé : planetes/mars/tests/m6-gardien-test.mjs) ═════════════
   Compte d'évaluation Kraken Prop de 10 000 $ : objectif +10 % (1 000 $), perte quotidienne max 3 % (300 $), drawdown max 6 % (600 $). Ces valeurs sont des RÉGLAGES (les règles exactes du contrat — jour de
   remise à zéro, calcul du drawdown, levier, trades autorisés — sont à vérifier dans ton contrat). Défauts PRUDENTS : drawdown SUIVEUR calculé sur l'ÉQUITÉ (le plus strict), marge de sécurité de 25 %.
   Le gardien ne passe JAMAIS d'ordre : il mesure, il dit PASS ou BLOCK, il explique. Alertes seulement, aucune exécution automatique, aucune clé de courtier. Pas un conseil financier.
   Entrées : les règles, la base (équité connue à une date, pic d'équité atteint), le journal de trades (pertes et gains en dollars), les positions ouvertes (avec leur gain ou perte latent). Rien n'est deviné :
   une équité jamais renseignée est dite « à vérifier ». */
export const REGLES_PROP_DEFAUT = Object.freeze({
  capital: 10000, objectifPct: 10, perteJourPct: 3, drawdownPct: 6,
  modeDrawdown: 'suiveur_equite',          // 'suiveur_equite' (plus strict : pic d'équité, positions ouvertes comprises) | 'suiveur_cloture' (pic des soldes clôturés) | 'fixe' (depuis le capital de départ)
  plafondTrailing: 'aucun',                // 'aucun' (le plancher monte sans limite : plus strict) | 'capital_initial' (le plancher s'arrête au capital de départ)
  modePerteJour: 'equite',                 // 'equite' (latent compris) | 'cloture' (trades clôturés seulement)
  heureResetJourUTC: 0,                    // heure UTC de remise à zéro de la perte du jour (À VÉRIFIER dans le contrat)
  risqueParTradePct: 0.5, bufferSecurite: 0.25, rrMin: 1.5, expositionMaxPct: 200, positionsMax: 1, tradesParJourMax: 3,
  pertesConsecutivesMax: 3, reposApresSerieH: 6, arretJourPartPct: 80, revancheDelaiMin: 30, fraisAllerRetourPct: 0.2, majEquiteMaxH: 24
});
export const BASE_DEFAUT = Object.freeze({ equite: 10322, pic: 10322, t: null, note: 'équité de départ saisie à la main (+322 $) : mets le vrai pic d’équité si tu l’as dépassé' });
const MS_H = 3600e3, MS_J = 86400e3;
const r2 = x => Math.round(x * 100) / 100;

export function fusionRegles(r = {}) {
  const o = { ...REGLES_PROP_DEFAUT, ...r };
  for (const k of ['capital', 'objectifPct', 'perteJourPct', 'drawdownPct', 'risqueParTradePct', 'rrMin', 'expositionMaxPct', 'positionsMax', 'tradesParJourMax', 'pertesConsecutivesMax', 'reposApresSerieH', 'arretJourPartPct', 'revancheDelaiMin']) o[k] = Number.isFinite(Number(o[k])) && Number(o[k]) > 0 ? Number(o[k]) : REGLES_PROP_DEFAUT[k];
  o.bufferSecurite = Math.min(0.9, Math.max(0, Number(o.bufferSecurite))); if (!Number.isFinite(o.bufferSecurite)) o.bufferSecurite = REGLES_PROP_DEFAUT.bufferSecurite;
  if (!['suiveur_equite', 'suiveur_cloture', 'fixe'].includes(o.modeDrawdown)) o.modeDrawdown = REGLES_PROP_DEFAUT.modeDrawdown;
  if (!['aucun', 'capital_initial'].includes(o.plafondTrailing)) o.plafondTrailing = 'aucun';
  if (!['equite', 'cloture'].includes(o.modePerteJour)) o.modePerteJour = 'equite';
  o.heureResetJourUTC = Math.min(23, Math.max(0, Math.floor(Number(o.heureResetJourUTC) || 0)));
  return o;
}
export const limites = r => ({ objectif: r.capital * r.objectifPct / 100, perteJour: r.capital * r.perteJourPct / 100, drawdown: r.capital * r.drawdownPct / 100 });
/* Début de la « journée de trading » qui contient t (remise à zéro à heureResetJourUTC). */
export const debutJournee = (t, heure = 0) => { const d = Math.floor((t - heure * MS_H) / MS_J) * MS_J + heure * MS_H; return d; };

/* Trade du journal : { id, t (entrée), tSortie, paire, sens, pnl (en $, frais compris), statut: 'ferme'|'ouvert', … }. Les trades fermés sont triés par date de sortie. */
const fermes = j => j.filter(x => x.statut !== 'ouvert' && Number.isFinite(x.pnl) && Number.isFinite(x.tSortie)).sort((a, b) => a.tSortie - b.tSortie);

/* État du compte à l'instant `maintenant`. `latent` = gain ou perte latent total des positions ouvertes (en $), `ouvertes` = leurs notionnels. */
export function etatCompte({ regles, base, journal = [], latent = 0, maintenant = Date.now() }) {
  const R = fusionRegles(regles), L = limites(R), B = { ...BASE_DEFAUT, ...(base || {}) };
  const depuisBase = B.t == null ? fermes(journal) : fermes(journal).filter(x => x.tSortie > B.t);
  let realisee = B.equite, picCloture = Math.max(B.pic, B.equite);
  const chemin = [{ t: B.t, eq: B.equite }];
  for (const x of depuisBase) { realisee += x.pnl; chemin.push({ t: x.tSortie, eq: realisee }); if (realisee > picCloture) picCloture = realisee; }
  const equite = realisee + (latent || 0), picEquite = Math.max(picCloture, equite);
  // début de journée : équité réalisée juste avant la première sortie du jour (ou la réalisée actuelle s'il n'y en a pas)
  const jour0 = debutJournee(maintenant, R.heureResetJourUTC); let eqDebut = B.equite;
  for (const p of chemin) { if (p.t == null || p.t < jour0) eqDebut = p.eq; }
  const reference = R.modePerteJour === 'equite' ? equite : realisee, perteJour = Math.max(0, eqDebut - reference);
  const gainsJour = depuisBase.filter(x => x.tSortie >= jour0).reduce((s, x) => s + x.pnl, 0);
  // drawdown
  let plancher;
  if (R.modeDrawdown === 'fixe') plancher = R.capital - L.drawdown;
  else { const pic = R.modeDrawdown === 'suiveur_equite' ? picEquite : picCloture; plancher = pic - L.drawdown; if (R.plafondTrailing === 'capital_initial') plancher = Math.min(plancher, R.capital); }
  const refDd = R.modeDrawdown === 'suiveur_cloture' ? realisee : equite, drawdown = Math.max(0, (R.modeDrawdown === 'fixe' ? R.capital : (R.modeDrawdown === 'suiveur_equite' ? picEquite : picCloture)) - refDd);
  const restantDd = refDd - plancher, restantJour = L.perteJour - perteJour;
  // série de pertes consécutives (les plus récentes d'abord)
  let serie = 0; const f = fermes(journal); for (let i = f.length - 1; i >= 0 && f[i].pnl < 0; i--) serie++;
  const derniere = f.length ? f[f.length - 1] : null;
  const tradesJour = journal.filter(x => (x.t || 0) >= jour0).length;
  return { regles: R, limites: L, base: B, maintenant, equite: r2(equite), realisee: r2(realisee), picEquite: r2(picEquite), picCloture: r2(picCloture), latent: r2(latent || 0), equiteDebutJour: r2(eqDebut),
    perteJour: r2(perteJour), gainsJour: r2(gainsJour), restantJour: r2(restantJour), drawdown: r2(drawdown), plancher: r2(plancher), restantDrawdown: r2(restantDd),
    gainTotal: r2(equite - R.capital), resteObjectif: r2(L.objectif - (equite - R.capital)), progression: (equite - R.capital) / L.objectif,
    partJour: L.perteJour > 0 ? perteJour / L.perteJour : 0, partDrawdown: L.drawdown > 0 ? drawdown / L.drawdown : 0,
    margeRestante: r2(Math.max(0, Math.min(restantJour, restantDd))), pertesConsecutives: serie, derniereSortie: derniere ? derniere.tSortie : null, dernierePerte: derniere && derniere.pnl < 0 ? derniere : null, tradesJour, jour0 };
}

/* Verdict du gardien : niveau, coupe-circuit, phrases. Rien ici ne bloque une ORDRE (il n'y en a pas) : cela commande les alertes et les phrases de Rayle. */
export function evaluerGardien(c, { positionsOuvertes = 0, levees = [] } = {}) {
  const R = c.regles, part = Math.max(c.partJour, c.partDrawdown);
  let niveau = part >= 1 ? 'BLOQUE' : part >= 0.8 ? 'ROUGE' : part >= 0.5 ? 'ORANGE' : 'VERT';
  const coupe = []; const maintenant = c.maintenant;
  if (c.pertesConsecutives >= R.pertesConsecutivesMax && c.derniereSortie != null) {
    const jusqua = c.derniereSortie + R.reposApresSerieH * MS_H;
    if (maintenant < jusqua && !levees.some(l => l.type === 'serie' && l.t >= c.derniereSortie)) coupe.push({ type: 'serie', raison: c.pertesConsecutives + ' pertes d’affilée : repos de ' + R.reposApresSerieH + ' h', jusqua });
  }
  if (c.partJour * 100 >= R.arretJourPartPct && !levees.some(l => l.type === 'jour' && l.t >= c.jour0)) coupe.push({ type: 'jour', raison: 'perte du jour à ' + Math.round(c.partJour * 100) + ' % de la limite (arrêt à ' + R.arretJourPartPct + ' %)', jusqua: c.jour0 + MS_J });
  if (c.partDrawdown >= 0.85 && !levees.some(l => l.type === 'drawdown')) coupe.push({ type: 'drawdown', raison: 'drawdown à ' + Math.round(c.partDrawdown * 100) + ' % de la limite : plus aucun nouveau trade tant que tu ne l’as pas décidé en connaissance de cause', jusqua: null });
  if (coupe.length && niveau === 'VERT') niveau = 'ORANGE';
  const actif = coupe.length > 0, risqueStandard = c.regles.capital * R.risqueParTradePct / 100, assezDeMarge = c.margeRestante * (1 - R.bufferSecurite) >= risqueStandard;
  const $ = x => Math.round(x).toLocaleString('fr-FR') + ' $';
  const phrases = [];
  phrases.push('Marge du jour : ' + $(Math.max(0, c.restantJour)) + ' sur ' + $(c.limites.perteJour) + (c.perteJour > 0 ? ' (perte du jour ' + $(c.perteJour) + ')' : '') + '. Marge de drawdown : ' + $(Math.max(0, c.restantDrawdown)) + ' sur ' + $(c.limites.drawdown) + ' (' + (R.modeDrawdown === 'fixe' ? 'fixe' : 'suiveur') + ', plancher à ' + $(c.plancher) + ').');
  phrases.push('Objectif : ' + (c.gainTotal >= 0 ? '+' : '−') + $(Math.abs(c.gainTotal)) + ' sur ' + $(c.limites.objectif) + ' (' + Math.max(0, Math.round(c.progression * 100)) + ' %), il reste ' + $(Math.max(0, c.resteObjectif)) + '.');
  const decision = niveau === 'BLOQUE' ? 'LIMITE ATTEINTE : vérifie ton compte, aucun nouveau trade.' : actif ? 'Coupe-circuit : ' + coupe.map(x => x.raison).join(' ; ') + '. Pas de nouveau setup.' : !assezDeMarge ? 'Marge insuffisante pour un trade au risque normal : pas de nouveau setup.' : niveau === 'ROUGE' ? 'Zone rouge : seulement un trade réduit, si le setup est très net.' : niveau === 'ORANGE' ? 'Zone orange : prudence, taille réduite.' : 'Marge confortable.';
  phrases.push(decision);
  return { niveau, coupeCircuit: { actif, causes: coupe }, assezDeMarge, peutProposer: !actif && assezDeMarge && niveau !== 'BLOQUE', decision, phrases, phrase: phrases.join(' '), margeRestante: c.margeRestante, risqueStandard: r2(risqueStandard),
    jauges: { perteJour: { valeur: c.perteJour, limite: c.limites.perteJour, part: c.partJour }, drawdown: { valeur: c.drawdown, limite: c.limites.drawdown, part: c.partDrawdown }, objectif: { valeur: Math.max(0, c.gainTotal), limite: c.limites.objectif, part: Math.max(0, c.progression) } },
    mentions: ['Alertes seulement : aucun ordre n’est passé.', 'Vérifie dans ton contrat Kraken Prop ce qui est autorisé (alertes, robots, copie) et les règles exactes du compte.'] };
}

/* Taille de position : le risque en dollars est le plus petit de (risque par trade réglé, partie permise de la marge restante), converti en quantité par la distance au stop (frais compris). */
export function taillePosition({ compte, plan, reduction = 1 }) {
  const R = compte.regles, e = plan.entree, s = plan.stop, dist = Math.abs(e - s);
  if (!(e > 0) || !(s > 0) || !(dist > 0)) return { ok: false, raison: 'entrée et stop invalides' };
  const risqueReg = compte.regles.capital * R.risqueParTradePct / 100 * reduction, permis = compte.margeRestante * (1 - R.bufferSecurite);
  const risque = Math.min(risqueReg, permis); if (!(risque > 0)) return { ok: false, raison: 'aucune marge restante' };
  const fraisParUnite = e * R.fraisAllerRetourPct / 100, quantite = risque / (dist + fraisParUnite), notionnel = quantite * e;
  return { ok: true, quantite, notionnel: r2(notionnel), risqueUSD: r2(quantite * (dist + fraisParUnite)), limitePar: risque === permis && permis < risqueReg ? 'marge restante' : 'risque par trade', rr: plan.objectif ? Math.abs(plan.objectif - e) / dist : null, distancePct: dist / e * 100 };
}

/* Contrôle avant trade en 9 points. plan = { paire, sens (+1/−1), entree, stop, objectif, quantite? , strategie?, t? } ; contexte = { compte, gardien, ouvertes: [{notionnel}], journal, maintenant }. */
export function controleAvantTrade(plan, { compte, gardien, ouvertes = [], journal = [], maintenant = Date.now() }) {
  const R = compte.regles, pts = [], ajout = (id, nom, etat, detail) => pts.push({ id, nom, etat, detail });
  const sensOk = plan.sens > 0 ? plan.stop < plan.entree : plan.sens < 0 ? plan.stop > plan.entree : false;
  ajout(1, 'Stop présent et du bon côté', plan.stop > 0 && sensOk ? 'PASS' : 'BLOCK', plan.stop > 0 ? (sensOk ? 'stop à ' + plan.stop : 'le stop est du mauvais côté de l’entrée') : 'aucun stop : pas de trade sans stop');
  const rr = plan.objectif > 0 && plan.stop > 0 ? Math.abs(plan.objectif - plan.entree) / Math.abs(plan.entree - plan.stop) : null, objOk = plan.objectif > 0 && (plan.sens > 0 ? plan.objectif > plan.entree : plan.objectif < plan.entree);
  ajout(2, 'Objectif présent et R/R suffisant', !objOk || rr == null ? 'BLOCK' : rr >= R.rrMin ? 'PASS' : 'BLOCK', !objOk ? 'objectif absent ou du mauvais côté (plan de sortie à fixer AVANT l’entrée)' : rr == null ? 'R/R inconnu sans stop' : 'R/R ' + rr.toFixed(2).replace('.', ',') + (rr >= R.rrMin ? '' : ' < minimum ' + R.rrMin));
  const t = taillePosition({ compte, plan }), q = plan.quantite > 0 ? plan.quantite : (t.ok ? t.quantite : 0), dist = Math.abs(plan.entree - plan.stop), perteStop = q * (dist + plan.entree * R.fraisAllerRetourPct / 100), risqueMax = R.capital * R.risqueParTradePct / 100;
  ajout(3, 'Risque du trade ≤ risque maximum réglé', perteStop <= risqueMax * 1.0001 ? 'PASS' : 'BLOCK', 'perte maximale si le stop est touché : ' + r2(perteStop) + ' $ (maximum ' + r2(risqueMax) + ' $)');
  const margeJ = compte.restantJour, margeD = compte.restantDrawdown, utile = x => Math.max(0, x) * (1 - R.bufferSecurite);
  ajout(4, 'Perte maximale ≤ marge du jour', perteStop <= utile(margeJ) + 1e-9 ? 'PASS' : 'BLOCK', 'stop = −' + r2(perteStop) + ' $ ; marge du jour ' + r2(Math.max(0, margeJ)) + ' $ (utilisable ' + r2(utile(margeJ)) + ' $ avec la marge de sécurité de ' + Math.round(R.bufferSecurite * 100) + ' %)');
  ajout(5, 'Perte maximale ≤ marge de drawdown', perteStop <= utile(margeD) + 1e-9 ? 'PASS' : 'BLOCK', 'stop = −' + r2(perteStop) + ' $ ; marge de drawdown ' + r2(Math.max(0, margeD)) + ' $ (utilisable ' + r2(utile(margeD)) + ' $)');
  const notionnelTotal = ouvertes.reduce((s, x) => s + (x.notionnel || 0), 0) + q * plan.entree, plafond = compte.equite * R.expositionMaxPct / 100;
  ajout(6, 'Exposition totale ≤ plafond', notionnelTotal <= plafond ? 'PASS' : 'BLOCK', 'exposition ' + Math.round(notionnelTotal).toLocaleString('fr-FR') + ' $ pour un plafond de ' + Math.round(plafond).toLocaleString('fr-FR') + ' $ (' + R.expositionMaxPct + ' % de l’équité)');
  const dejaJour = compte.tradesJour;
  ajout(7, 'Nombre de positions et de trades du jour', ouvertes.length >= R.positionsMax ? 'BLOCK' : dejaJour >= R.tradesParJourMax ? 'BLOCK' : dejaJour === R.tradesParJourMax - 1 ? 'WARN' : 'PASS', ouvertes.length + ' position(s) ouverte(s) sur ' + R.positionsMax + ' permise(s) ; ' + dejaJour + ' trade(s) aujourd’hui sur ' + R.tradesParJourMax);
  const perte = compte.dernierePerte, minDepuis = perte ? (maintenant - perte.tSortie) / 60e3 : Infinity;
  const revanche = perte && minDepuis < R.revancheDelaiMin && perte.paire === plan.paire;
  const cc = gardien && gardien.coupeCircuit.actif;
  ajout(8, 'Pas de coupe-circuit ni de trade de revanche', cc ? 'BLOCK' : revanche ? 'BLOCK' : minDepuis < 2 * R.revancheDelaiMin ? 'WARN' : 'PASS', cc ? gardien.coupeCircuit.causes.map(x => x.raison).join(' ; ') : revanche ? 'trade de revanche : la perte précédente sur ' + plan.paire + ' date de ' + Math.round(minDepuis) + ' min (délai de ' + R.revancheDelaiMin + ' min)' : 'aucun coupe-circuit actif');
  const ageH = compte.base.t != null || journal.length ? (maintenant - Math.max(compte.base.t || 0, ...journal.map(x => x.tSortie || x.t || 0))) / MS_H : null;
  ajout(9, 'Compte à jour', ageH == null ? 'WARN' : ageH > R.majEquiteMaxH ? 'WARN' : 'PASS', ageH == null ? 'équité jamais renseignée : vérifie ton solde réel avant de te fier à ces marges' : 'dernière mise à jour du compte il y a ' + Math.round(ageH) + ' h' + (ageH > R.majEquiteMaxH ? ' : mets l’équité à jour' : ''));
  if (gardien && gardien.niveau === 'BLOQUE') pts.push({ id: 10, nom: 'Limite atteinte', etat: 'BLOCK', detail: 'une limite du compte est atteinte : plus de nouveau trade' });
  const blocs = pts.filter(p => p.etat === 'BLOCK'), warns = pts.filter(p => p.etat === 'WARN');
  return { decision: blocs.length ? 'BLOCK' : 'PASS', points: pts, blocages: blocs.map(p => p.nom + ' — ' + p.detail), avertissements: warns.map(p => p.nom + ' — ' + p.detail), taille: t, quantite: q, perteStop: r2(perteStop), rr,
    phrase: (blocs.length ? 'BLOQUÉ par le gardien : ' + blocs[0].nom.toLowerCase() + ' (' + blocs[0].detail + ').' : 'PASS : les points de contrôle sont tenus, taille ' + (q > 0 ? q.toPrecision(3) : '—') + ', perte maximale ' + r2(perteStop) + ' $.') + (warns.length ? ' Attention : ' + warns[0].detail + '.' : '') + ' Alerte seulement : aucun ordre n’est passé.' };
}

/* Décision du gardien sur une alerte d'ENTRÉE de l'agent : { alerte } → { decision, controle, texte, marge }. Les alertes qui feraient dépasser une limite sont BLOQUÉES (elles ne sont plus présentées comme des entrées). */
export function jugerAlerte(alerte, contexte) {
  const plan = { paire: alerte.paire || 'BTC', sens: alerte.sens, entree: alerte.entree, stop: alerte.stop, objectif: alerte.cible != null ? alerte.cible : alerte.objectif, strategie: alerte.nomStrategie };
  const c = controleAvantTrade(plan, contexte), g = contexte.gardien;
  const marge = 'marge du jour ' + Math.round(Math.max(0, contexte.compte.restantJour)) + ' $ sur ' + Math.round(contexte.compte.limites.perteJour) + ' $, drawdown ' + Math.round(Math.max(0, contexte.compte.restantDrawdown)) + ' $ sur ' + Math.round(contexte.compte.limites.drawdown) + ' $';
  return { decision: c.decision, controle: c, marge, niveau: g ? g.niveau : null, quantite: c.quantite,
    texte: c.decision === 'PASS' ? 'Gardien : PASS · ' + marge + ' · taille ' + (c.quantite > 0 ? c.quantite.toPrecision(3) : '—') + ' · perte max ' + c.perteStop + ' $' + (c.avertissements.length ? ' · ⚠ ' + c.avertissements[0] : '') : 'Gardien : BLOQUÉ · ' + c.blocages[0] + ' · ' + marge };
}
