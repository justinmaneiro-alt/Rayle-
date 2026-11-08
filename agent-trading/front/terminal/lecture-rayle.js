/* ═════════════ TERMINAL : CE QUE RAYLE COMPREND DU TERMINAL (pur, testé) ═════════════
   État structuré (actif, unité, prix, tendance, SMA 200 et distance, niveaux qui comptent, positions, alertes récentes, carnet, santé,
   annonces, COT), UN ou DEUX scénarios avec niveaux, validation, invalidation, stop et cible, et un texte parlé court.
   Règle : aucun chiffre qui ne vienne de l'état ; quand une donnée manque, Rayle le dit. Information de lecture, pas une promesse. */
export const MENTION_LECTURE = 'Information de lecture, pas une promesse.';
const arr = (x, n) => Math.round(x * 10 ** n) / 10 ** n;

/* résumé du carnet : déséquilibre, murs (≥ 3 × la médiane des niveaux à ± 1 %), gros paquets récents (transactions ≥ seuil) */
export function resumeCarnet(c, { transactions = [], seuil = 5000, fenetre = 0.01, maintenant = Date.now() } = {}) {
  if (!c || !c.bids || !c.asks) return null;
  let bid = -Infinity, ask = Infinity; for (const p of c.bids.keys()) if (p > bid) bid = p; for (const p of c.asks.keys()) if (p < ask) ask = p;
  if (!Number.isFinite(bid) || !Number.isFinite(ask)) return null; const mid = (bid + ask) / 2;
  const B = [...c.bids].filter(([p]) => p >= mid * (1 - fenetre)).map(([p, q]) => ({ p, q, usd: p * q })), A = [...c.asks].filter(([p]) => p <= mid * (1 + fenetre)).map(([p, q]) => ({ p, q, usd: p * q }));
  const tous = B.concat(A).map(x => x.usd).sort((a, b) => a - b), med = tous.length ? tous[tous.length >> 1] : 0;
  const murs = L => L.filter(x => med > 0 && x.usd >= 3 * med).sort((a, b) => b.usd - a.usd).slice(0, 3);
  const qb = B.reduce((s, x) => s + x.q, 0), qa = A.reduce((s, x) => s + x.q, 0);
  const paquets = transactions.filter(x => x.usd >= seuil && maintenant - x.t < 15 * 60e3).sort((a, b) => b.usd - a.usd).slice(0, 5).map(x => ({ t: x.t, p: x.p, usd: x.usd, cote: x.cote === 'buy' ? 'achat' : 'vente' }));
  const acheteurs = qb + qa > 0 ? qb / (qb + qa) : null;
  return { milieu: mid, spread: ask - bid, acheteurs, mursAchat: murs(B), mursVente: murs(A), paquets,
    lecture: acheteurs == null ? 'carnet vide' : acheteurs > 0.6 ? 'plus d’acheteurs que de vendeurs près du prix' : acheteurs < 0.4 ? 'plus de vendeurs que d’acheteurs près du prix' : 'carnet équilibré près du prix' };
}

/* niveaux qui comptent : les miens, les automatiques, les zones de réaction, les liquidités, la SMA 200 ; triés par distance au prix */
export function niveauxQuiComptent({ prix, atr, objets = [], auto = [], zones = [], liquidites = [], ma200 = null }) {
  const L = [];
  for (const o of objets) { if (o.type === 'horizontale') L.push({ p: o.p, nom: o.etiquette || 'ma ligne', source: 'moi', retourne: !!o.retourne }); else if (o.type === 'zone') L.push({ p: (o.bas + o.haut) / 2, bas: o.bas, haut: o.haut, nom: o.etiquette || 'ma zone', source: 'moi', retourne: !!o.retourne }); }
  for (const b of auto) L.push({ p: b.p, nom: `niveau à ${b.touches} touches`, source: 'auto' });
  for (const z of zones) L.push({ p: z.p, bas: z.bas, haut: z.haut, nom: `zone de réaction testée ${z.tests} fois, tenue ${z.tenues}`, source: 'volume' });
  for (const q of liquidites) L.push({ p: q.p, nom: 'liquidité ' + (q.sorte || ''), source: 'liquidite' });
  if (ma200 != null) L.push({ p: ma200, nom: 'SMA 200', source: 'ma200' });
  if (!(prix > 0)) return { dessus: [], dessous: [] };
  const fusion = []; for (const n of L.sort((a, b) => a.p - b.p)) { const d = fusion[fusion.length - 1]; if (d && atr && Math.abs(n.p - d.p) < 0.25 * atr) { if (n.source === 'moi') fusion[fusion.length - 1] = { ...n, aussi: d.nom }; else d.aussi = n.nom; } else fusion.push({ ...n }); }
  const dist = n => atr ? Math.abs(n.p - prix) / atr : null;
  return { dessus: fusion.filter(n => n.p > prix).map(n => ({ ...n, distAtr: dist(n) })).slice(0, 4), dessous: fusion.filter(n => n.p <= prix).reverse().map(n => ({ ...n, distAtr: dist(n) })).slice(0, 4) };
}

/* un ou deux scénarios (jamais plus), ou aucun avec la raison */
export function scenarios({ prix, atr, tendance = 'inconnue', niveaux }) {
  if (!(prix > 0) || !(atr > 0)) return { liste: [], raison: 'prix ou volatilité inconnus' };
  const S1 = niveaux.dessous[0], S2 = niveaux.dessous[1], R1 = niveaux.dessus[0], R2 = niveaux.dessus[1];
  if (!S1 && !R1) return { liste: [], raison: 'aucun niveau autour du prix : ajoute une ligne, une zone ou la couche des supports' };
  const rebond = (S, cible, nom) => ({ nom, sens: 'hausse', niveau: S.p, nomNiveau: S.nom, entree: S.p + 0.1 * atr, validation: `une clôture au-dessus de ${S.p.toFixed(5)} + 0,5 ATR après une touche`, invalidation: `une clôture sous ${S.p.toFixed(5)} − 0,5 ATR`, stop: S.p - atr, cible: cible ? cible.p : S.p + 2 * atr, nomCible: cible ? cible.nom : '2 ATR' });
  const rejet = (R, cible, nom) => ({ nom, sens: 'baisse', niveau: R.p, nomNiveau: R.nom, entree: R.p - 0.1 * atr, validation: `une clôture sous ${R.p.toFixed(5)} − 0,5 ATR après une touche`, invalidation: `une clôture au-dessus de ${R.p.toFixed(5)} + 0,5 ATR`, stop: R.p + atr, cible: cible ? cible.p : R.p - 2 * atr, nomCible: cible ? cible.nom : '2 ATR' });
  const cassureH = (R, cible, nom) => ({ nom, sens: 'hausse', niveau: R.p, nomNiveau: R.nom, entree: R.p + 0.5 * atr, validation: `une clôture au-dessus de ${R.p.toFixed(5)} + 0,5 ATR (cassure confirmée)`, invalidation: `un retour sous ${R.p.toFixed(5)}`, stop: R.p - 0.5 * atr, cible: cible ? cible.p : R.p + 2 * atr, nomCible: cible ? cible.nom : '2 ATR' });
  const cassureB = (S, cible, nom) => ({ nom, sens: 'baisse', niveau: S.p, nomNiveau: S.nom, entree: S.p - 0.5 * atr, validation: `une clôture sous ${S.p.toFixed(5)} − 0,5 ATR (cassure confirmée)`, invalidation: `un retour au-dessus de ${S.p.toFixed(5)}`, stop: S.p + 0.5 * atr, cible: cible ? cible.p : S.p - 2 * atr, nomCible: cible ? cible.nom : '2 ATR' });
  let L = [];
  if (tendance === 'haussière') { if (S1) L.push(rebond(S1, R1, 'A · rebond sur support, avec la tendance')); if (R1) L.push(cassureH(R1, R2, 'B · cassure de la résistance')); }
  else if (tendance === 'baissière') { if (R1) L.push(rejet(R1, S1, 'A · rejet sous résistance, avec la tendance')); if (S1) L.push(cassureB(S1, S2, 'B · cassure du support')); }
  else { const pS = S1 ? (prix - S1.p) : Infinity, pR = R1 ? (R1.p - prix) : Infinity; if (pS <= pR && S1) { L.push(rebond(S1, R1, 'A · rebond sur le support le plus proche')); if (R1) L.push(rejet(R1, S1, 'B · rejet sous la résistance')); } else if (R1) { L.push(rejet(R1, S1, 'A · rejet sous la résistance la plus proche')); if (S1) L.push(rebond(S1, R1, 'B · rebond sur le support')); } }
  L = L.slice(0, 2).map(s => ({ ...s, R: Math.abs(s.cible - s.entree) / Math.abs(s.entree - s.stop) }));
  return { liste: L, raison: null };
}

/* état structuré complet (sérialisable) */
export function etatTerminal(x) {
  const { actif, nomActif, unite, prix, atr, tendance, ma200, ma200H1, niveaux, positions = [], alertes = [], carnet = null, sante = null, annonces = [], cot = null, cotAbsent = null, maintenant = Date.now(), source = null, memoire = [] } = x;
  const sc = scenarios({ prix, atr, tendance: tendance && tendance.sens, niveaux });
  const prochaines = annonces.filter(a => a.t >= maintenant && a.impact === 'fort').slice(0, 3);
  return { actif, nomActif, unite, prix, atr, source, tendance, ma200: ma200 != null ? { valeur: ma200, distance: prix - ma200, distanceAtr: atr ? (prix - ma200) / atr : null, cote: prix >= ma200 ? 'au-dessus' : 'au-dessous', proche: atr ? Math.abs(prix - ma200) < 1.5 * atr : false } : null,
    ma200H1, niveaux, scenarios: sc, positions: positions.map(p => ({ actif: p.actif, sens: p.sens, etat: p.etat, entree: p.entree, stop: p.stop, objectif: p.objectif, R: p.R })), alertes: alertes.slice(0, 6).map(a => ({ texte: a.texte, recu: a.recu })),
    carnet, sante, annonces: prochaines.map(a => ({ t: a.t, devise: a.devise, titre: a.titre, dansMin: Math.round((a.t - maintenant) / 60e3) })), cot, cotAbsent, memoire: memoire.slice(-12) };
}

/* texte du contexte envoyé à la route /chat (le Worker n'est pas modifié) : chiffres arrondis à la précision de l'actif */
export function texteContexte(E, { fmt = x => String(x), heure = t => new Date(t).toISOString() } = {}) {
  const L = [`TERMINAL DE TRADING DE RAYLE (lecture seulement, aucun ordre). Actif : ${E.nomActif}, unité ${E.unite}, prix ${fmt(E.prix)}${E.source ? ' (source ' + E.source + ')' : ''}${E.atr ? `, ATR ${fmt(E.atr)}` : ''}.`];
  if (E.tendance) L.push(`Tendance ${E.unite} : ${E.tendance.sens} (${E.tendance.raison}).`);
  if (E.ma200) L.push(`SMA 200 ${E.unite} : ${fmt(E.ma200.valeur)}, prix ${E.ma200.cote} de ${fmt(Math.abs(E.ma200.distance))}${E.ma200.distanceAtr != null ? ` (${Math.abs(E.ma200.distanceAtr).toFixed(1).replace('.', ',')} ATR)` : ''}${E.ma200.proche ? ', elle est proche' : ''}.`);
  const nv = n => `${fmt(n.p)} (${n.nom}${n.aussi ? ' + ' + n.aussi : ''}${n.retourne ? ', retourné' : ''})`;
  L.push(`Au-dessus : ${E.niveaux.dessus.map(nv).join(' ; ') || 'aucun niveau'}. Au-dessous : ${E.niveaux.dessous.map(nv).join(' ; ') || 'aucun niveau'}.`);
  if (E.scenarios.liste.length) for (const s of E.scenarios.liste) L.push(`Scénario ${s.nom} : niveau ${fmt(s.niveau)} (${s.nomNiveau}) ; validation : ${s.validation.replace(/\d+\.\d+/g, m => fmt(+m))} ; invalidation : ${s.invalidation.replace(/\d+\.\d+/g, m => fmt(+m))} ; stop suggéré ${fmt(s.stop)}, cible ${fmt(s.cible)} (${s.nomCible}), environ ${s.R.toFixed(1).replace('.', ',')} R.`);
  else L.push(`Aucun scénario : ${E.scenarios.raison}.`);
  if (E.carnet) L.push(`Carnet : ${E.carnet.lecture}${E.carnet.acheteurs != null ? ` (${Math.round(E.carnet.acheteurs * 100)} % d’acheteurs à ± 1 %)` : ''} ; murs acheteurs ${E.carnet.mursAchat.map(m => fmt(m.p)).join(', ') || 'aucun'} ; murs vendeurs ${E.carnet.mursVente.map(m => fmt(m.p)).join(', ') || 'aucun'} ; gros paquets récents ${E.carnet.paquets.map(x => `${x.cote} ${Math.round(x.usd).toLocaleString('fr-FR')} $ à ${fmt(x.p)}`).join(', ') || 'aucun'}.`);
  else L.push('Carnet : pas encore reçu.');
  if (E.sante) L.push(`Santé : volatilité ${E.sante.volatilite ? E.sante.volatilite.mot : 'inconnue'}, volume ${E.sante.volumeRelatif ? E.sante.volumeRelatif.mot : 'inconnu'}.`);
  L.push(E.annonces.length ? `Annonces fortes à venir : ${E.annonces.map(a => `${a.devise} ${a.titre} à ${heure(a.t)} (dans ${a.dansMin} min)`).join(' ; ')}.` : 'Aucune annonce forte connue à venir cette semaine.');
  if (E.cot) L.push(`COT ${E.cot.nom} (mardi ${E.cot.date}) : spéculateurs nets ${E.cot.categories[0].net > 0 ? '+' : ''}${E.cot.categories[0].net.toLocaleString('fr-FR')} contrats${E.cot.lecture ? ', ' + E.cot.lecture : ''}.`); else if (E.cotAbsent) L.push(E.cotAbsent);
  if (E.positions.length) L.push(`Positions suivies : ${E.positions.map(p => `${p.actif} ${p.sens} ${p.etat}, entrée ${fmt(p.entree)}, stop ${fmt(p.stop)}, objectif ${fmt(p.objectif)}`).join(' ; ')}.`);
  if (E.alertes.length) L.push(`Alertes récentes : ${E.alertes.map(a => a.texte).join(' ; ')}.`);
  if (E.memoire.length) L.push(`Plus tôt aujourd’hui : ${E.memoire.map(m => m.quoi).join(' ; ')}.`);
  L.push('Consignes : réponds en français parlé, phrases courtes, sans liste ni markdown ; donne au plus DEUX scénarios, ceux ci-dessus, avec leurs niveaux, validation, invalidation, stop et cible ; n’invente AUCUN chiffre absent de ce contexte ; si une donnée manque, dis que tu ne sais pas ; termine par « information de lecture, pas une promesse » ; ne propose jamais de passer un ordre.');
  return L.join('\n');
}

/* texte parlé SANS IA (secours, ou Worker absent) */
const Le = n => (n === 'Or' ? 'L’or' : 'Le ' + n), de = n => (n === 'Or' ? 'de l’or' : 'du ' + n);
export function texteLocal(E, question = 'etat', { fmt = x => String(x), heure = t => new Date(t).toISOString() } = {}) {
  const P = [];
  if (question === 'carnet') {
    if (!E.carnet) return `Je n’ai pas encore reçu le carnet ${de(E.nomActif)}. Je ne sais pas.`;
    P.push(`Sur le carnet ${de(E.nomActif)}, ${E.carnet.lecture}${E.carnet.acheteurs != null ? `, ${Math.round(E.carnet.acheteurs * 100)} % d’acheteurs` : ''}.`);
    if (E.carnet.mursVente.length) P.push(`Mur vendeur vers ${fmt(E.carnet.mursVente[0].p)}.`); if (E.carnet.mursAchat.length) P.push(`Mur acheteur vers ${fmt(E.carnet.mursAchat[0].p)}.`);
    P.push(E.carnet.paquets.length ? `Gros paquets récents : ${E.carnet.paquets.slice(0, 2).map(x => `${x.cote} de ${Math.round(x.usd).toLocaleString('fr-FR')} dollars à ${fmt(x.p)}`).join(', ')}.` : 'Pas de gros paquet ces quinze dernières minutes.');
    return P.join(' ') + ' ' + MENTION_LECTURE;
  }
  if (!(E.prix > 0)) return `Je n’ai pas le prix ${de(E.nomActif)} pour l’instant. Je ne sais pas.`;
  P.push(`${Le(E.nomActif)} est à ${fmt(E.prix)} en ${E.unite}${E.tendance && E.tendance.sens !== 'inconnue' ? `, tendance ${E.tendance.sens}` : ''}.`);
  if (E.ma200) P.push(`La moyenne 200 est ${E.ma200.cote === 'au-dessus' ? 'en dessous' : 'au-dessus'}, à ${fmt(E.ma200.valeur)}${E.ma200.proche ? ', elle approche' : ''}.`);
  const s0 = E.niveaux.dessous[0], r0 = E.niveaux.dessus[0];
  if (s0 && s0.distAtr != null && s0.distAtr < 0.5) P.push(`Le prix est sur un support, ${fmt(s0.p)}.`); else if (r0 && r0.distAtr != null && r0.distAtr < 0.5) P.push(`Le prix est sous une résistance, ${fmt(r0.p)}.`);
  if (E.scenarios.liste.length) for (const s of E.scenarios.liste) P.push(`Scénario ${s.nom.split(' · ')[0]} : ${s.sens === 'hausse' ? 'à la hausse' : 'à la baisse'} depuis ${fmt(s.niveau)}, validé par ${s.validation.replace(/\d+\.\d+/g, m => fmt(+m))}, invalidé par ${s.invalidation.replace(/\d+\.\d+/g, m => fmt(+m))}, stop vers ${fmt(s.stop)}, cible ${fmt(s.cible)}.`);
  else P.push(`Je n’ai pas de scénario clair : ${E.scenarios.raison}.`);
  if (E.annonces.length) P.push(`Attention, ${E.annonces[0].devise} ${E.annonces[0].titre} à ${heure(E.annonces[0].t)}.`);
  if (E.cot) P.push(`Le COT : ${E.cot.lecture || 'positionnement connu'}.`);
  return P.join(' ') + ' ' + MENTION_LECTURE;
}

/* contrôle des chiffres d'une réponse de l'IA : tout nombre > 100 doit exister dans le contexte (à 0,15 % près) */
export function nombres(texte) { return (String(texte).replace(/(\d)[\s  ](?=\d{3}\b)/g, '$1').match(/\d+(?:[.,]\d+)?/g) || []).map(s => +s.replace(',', '.')).filter(Number.isFinite); }
export function chiffresVerifies(reponse, contexte) {
  const C = nombres(contexte), inconnus = nombres(reponse).filter(n => n > 100 && !C.some(c => Math.abs(c - n) <= Math.max(0.5, c * 0.0015)));
  return { ok: !inconnus.length, inconnus };
}

/* intention d'une phrase adressée au terminal (pur) */
export function intention(texte) {
  const t = String(texte || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, "'");
  if (/\b(achete|vends|vend|passe (un |l')?ordre|prends? (la|une) position (pour moi|reelle)|execute)\b/.test(t) && !/propose/.test(t)) return { type: 'ordre' };
  if (/(efface|enleve|supprime|retire).*(scenario|trace de rayle)/.test(t)) return { type: 'effacer-scenarios' };
  if (/(trace|dessine|montre).*(scenario)/.test(t)) return { type: 'tracer-scenarios' };
  if (/propose.*(position|trade|entree)|prepare.*position/.test(t)) return { type: 'proposer' };
  if (/(zoom|zoome|rapproche|agrandis)/.test(t)) return { type: 'zoomer' };
  if (/(surligne|souligne|montre[- ]moi (le|la|les) (support|resistance|niveau|ma200|moyenne))/.test(t)) return { type: 'surligner' };
  if (/(affiche|montre|active|ajoute|masque|cache|enleve|desactive|retire)\b.*(ma ?200|sma|moyenne|support|resistance|liquidit|zones?|volume|fleche|position|dessin|scenario|chaleur|heatmap|bookmap)/.test(t)) return { type: 'couche', on: !/(masque|cache|enleve|desactive|retire)/.test(t) };
  if (/(carnet|order ?book|murs?|gros paquets|ordres en attente)/.test(t)) return { type: 'question', sujet: 'carnet' };
  if (/(comment tu le sens|tu le sens comment|ou on en est|on en est ou|qu'est-ce qui se passe|que se passe|analyse|scenario|ton avis|lecture du marche|resume|point sur)/.test(t)) return { type: 'question', sujet: 'etat' };
  if (/(passe|mets|montre|affiche|va) .*(m5|m15|h1|h4|jour|journalier|minutes|heure)/.test(t) || /^(m5|m15|h1|h4|jour)$/.test(t.trim())) return { type: 'unite' };
  if (/(passe|mets|montre|affiche|ouvre|va) .*(bitcoin|btc|solana|sol\b|doge|nasdaq|us100|l'or\b|\bor\b)/.test(t)) return { type: 'actif' };
  return null;
}
