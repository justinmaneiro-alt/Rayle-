/* ═════════════ PAGES DU TERMINAL : CALCULS ET PHRASES (pur, testé en Node) ═════════════
   Aucune valeur inventée : une donnée absente donne « indisponible » avec sa raison. Chaque phrase de « ce que ça veut dire » décrit le marché,
   elle ne dit jamais d'acheter ou de vendre. Le garde-fou `sansConseil` refuse tout texte qui contiendrait un ordre. */
export const nf = (x, d = 0) => (x == null || !Number.isFinite(+x) ? '—' : Number(x).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/[  ]/g, ' '));
export const signe = (x, d = 0) => (x == null || !Number.isFinite(+x) ? '—' : (x > 0 ? '+' : x < 0 ? '−' : '') + nf(Math.abs(x), d));
export const dateFr = (iso) => { const m = String(iso || '').match(/^(\d{4})-(\d\d)-(\d\d)/); return m ? `${m[3]}/${m[2]}/${m[1]}` : '—'; };
export const dateMs = (t) => (t ? dateFr(new Date(t).toISOString()) : '—');

export function sma(valeurs, n) { const o = []; let s = 0; for (let i = 0; i < valeurs.length; i++) { s += valeurs[i]; if (i >= n) s -= valeurs[i - n]; o.push(i >= n - 1 ? s / n : null); } return o; }
export function percentile(valeurs, v) { const L = valeurs.filter(Number.isFinite); if (!L.length || !Number.isFinite(v)) return null; return Math.round(100 * L.filter(x => x <= v).length / L.length); }
export const variationPct = (a, b) => (Number.isFinite(a) && Number.isFinite(b) && b !== 0 ? (a / b - 1) * 100 : null);

/* ── alignement par jour (UTC) puis corrélation des rendements journaliers ── */
export const jourDe = t => new Date(t).toISOString().slice(0, 10);
export function parJour(serie) { const m = new Map(); for (const p of serie || []) if (Number.isFinite(p.c) && p.c > 0) m.set(jourDe(p.t), p.c); return m; }
export function correlation(sa, sb, jours = 60) {
  const A = parJour(sa), B = parJour(sb), communs = [...A.keys()].filter(d => B.has(d)).sort(), R = [];
  for (let i = 1; i < communs.length; i++) { const a0 = A.get(communs[i - 1]), a1 = A.get(communs[i]), b0 = B.get(communs[i - 1]), b1 = B.get(communs[i]); R.push([a1 / a0 - 1, b1 / b0 - 1]); }
  const X = R.slice(-jours); if (X.length < 20) return { r: null, n: X.length };
  const ma = X.reduce((s, x) => s + x[0], 0) / X.length, mb = X.reduce((s, x) => s + x[1], 0) / X.length;
  let sab = 0, saa = 0, sbb = 0; for (const [a, b] of X) { sab += (a - ma) * (b - mb); saa += (a - ma) ** 2; sbb += (b - mb) ** 2; }
  return saa > 0 && sbb > 0 ? { r: sab / Math.sqrt(saa * sbb), n: X.length } : { r: null, n: X.length };
}
export function mots(r) { if (r == null) return 'indisponible'; const a = Math.abs(r); const f = a >= 0.6 ? 'forte' : a >= 0.3 ? 'moyenne' : a >= 0.1 ? 'faible' : 'quasi nulle'; return r === 0 || a < 0.1 ? f : `${f}, ${r > 0 ? 'dans le même sens' : 'en sens inverse'}`; }

/* ── COT ── */
export const SEMAINES = Object.freeze({ '1': 52, '2': 104, '3': 156 });
export function fenetreCot(cot, ans = '3') { const n = SEMAINES[ans] || 156; return (cot && cot.serie ? cot.serie : []).slice(-n); }
export function statsCot(cot, ans = '3') {
  const S = fenetreCot(cot, ans); if (!S.length) return null;
  const der = S[S.length - 1], avant = S[S.length - 5] || S[0], nets = S.map(x => x.spec.net), netsC = S.filter(x => x.comm).map(x => x.comm.net);
  return { n: S.length, der, specNet: der.spec.net, specVar4: der.spec.net - avant.spec.net, specPct: percentile(nets, der.spec.net), specMin: Math.min(...nets), specMax: Math.max(...nets),
    commNet: der.comm ? der.comm.net : null, commVar4: der.comm && avant.comm ? der.comm.net - avant.comm.net : null, commPct: der.comm ? percentile(netsC, der.comm.net) : null, oi: der.oi };
}
export function phraseSpec(cot, st) {
  if (!st) return 'Pas de donnée COT disponible.';
  const sens = st.specNet >= 0 ? 'acheteurs' : 'vendeurs', ext = st.specPct >= 90 ? 'un niveau parmi les plus hauts de la période : positionnement très chargé à l’achat' : st.specPct <= 10 ? 'un niveau parmi les plus bas de la période : positionnement très chargé à la vente' : 'une zone médiane de la période';
  return `Ce que ça veut dire : ${cot.nomSpec.toLowerCase()} sont nets ${sens} de ${nf(Math.abs(st.specNet))} contrats, soit ${ext} (percentile ${st.specPct} sur ${st.n} semaines). En 4 semaines : ${signe(st.specVar4)} contrats. C’est une photo du positionnement, pas une prévision du prix.`;
}
export function phraseComm(cot, st) {
  if (!st || st.commNet == null) return 'Pas de donnée disponible pour cette catégorie.';
  const base = cot.genre === 'matieres' ? 'Les commerciaux (producteurs, négociants) se couvrent : ils vendent à l’avance leur production, donc ils sont souvent vendeurs nets quand le prix monte.' : 'Les intermédiaires financiers (dealers) servent de contrepartie aux autres : leur position est souvent le miroir de celle des fonds.';
  return `Ce que ça veut dire : ${base} Position nette actuelle : ${signe(st.commNet)} contrats (percentile ${st.commPct}, variation sur 4 semaines : ${signe(st.commVar4)}).`;
}

/* ── santé du marché ── */
export function ecartMa(serie, n = 200) {
  const c = (serie || []).map(p => p.c).filter(Number.isFinite); if (c.length < n) return { ok: false, raison: `seulement ${c.length} jours de données, il en faut ${n}` };
  const m = sma(c, n), ma = m[m.length - 1], px = c[c.length - 1]; return { ok: true, prix: px, ma, ecartPct: variationPct(px, ma), dessus: px >= ma, penteMa: variationPct(ma, m[m.length - 21]) };
}
export function phraseMa(nom, e) {
  if (!e || !e.ok) return `${nom} : MA200 indisponible (${e ? e.raison : 'données absentes'}).`;
  return `${nom} est ${e.dessus ? 'au-dessus' : 'en dessous'} de sa moyenne mobile 200 jours (${signe(e.ecartPct, 1)} %). ${e.dessus ? 'La tendance de fond est orientée à la hausse.' : 'La tendance de fond est orientée à la baisse.'}`;
}
export function variationSerie(serie, jours = 20) { const c = (serie || []).map(p => p.c ?? p.v).filter(Number.isFinite); if (c.length <= jours) return null; return variationPct(c[c.length - 1], c[c.length - 1 - jours]); }
export function phraseGld(g) {
  if (!g || !g.serie || g.serie.length < 30) return 'Flux du fonds GLD indisponibles.';
  const S = g.serie, d = S[S.length - 1], i30 = S[S.length - 22] || S[0], i90 = S[S.length - 64] || S[0], v30 = d.tonnes - i30.tonnes, v90 = d.tonnes - i90.tonnes;
  return `Ce que ça veut dire : le fonds GLD détient ${nf(d.tonnes, 1)} tonnes d’or (au ${dateFr(d.date)}). Sur environ 1 mois : ${signe(v30, 1)} t ; sur environ 3 mois : ${signe(v90, 1)} t. Des entrées de tonnes signalent plutôt des achats par les investisseurs de l’ETF, des sorties plutôt des ventes ; c’est un indicateur de demande parmi d’autres.`;
}
export function phraseCorrel(nom, c) { return c.r == null ? `${nom} : indisponible (${c.n} jours communs)` : `${nom} : ${c.r >= 0 ? '+' : '−'}${Math.abs(c.r).toFixed(2).replace('.', ',')} (${mots(c.r)}, ${c.n} jours)`; }

/* ── garde-fou : Rayle ne dit jamais d'acheter ou de vendre ── */
export const ORDRES = /\b(acheter?|achetez|achete|achetons|vends?|vendez|vendre|vendons|prends? (une )?position|entre(z)? (en )?(long|short)|shorte[zr])\b/i;
export const sansConseil = (t) => !ORDRES.test(String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, ''));
/* un titre de presse qui parle d'acheter / vendre n'est pas lu à voix haute (il reste affiché, avec sa source) */
export const TITRE_CONSEIL = /\b(buy|sell|long|short|achat|achète|vente|vend|acheter|vendre)\b/i;
export function titreLisible(t) { return !TITRE_CONSEIL.test(String(t || '')); }

/* ── lecture à voix haute et instantanés structurés (Rayle lit la page : jamais un chiffre qui ne vient pas des données chargées) ── */
export function phraseBanques(B, n = 3) {
  if (!B || !B.items) return 'Les prévisions de banques ne sont pas chargées.';
  if (!B.items.length) return 'Je n’ai trouvé aucune prévision de banque dans la presse financière ces derniers jours. Les rapports payants ne me sont pas accessibles.';
  const L = B.items.filter(x => titreLisible(x.titre)).slice(0, n);
  const lues = L.map(x => `${x.banque || 'une banque'}, le ${dateMs(x.date)} : ${x.titre.replace(/\s+-\s+[^-]+$/, '')}`);
  const tu = B.items.length - L.length;
  return `Voici ce que la presse financière rapporte des banques ces derniers jours. ${lues.join(' ; ')}.${tu > 0 ? ` ${tu} titre${tu > 1 ? 's' : ''} ${tu > 1 ? 'ne sont' : 'n’est'} pas lu${tu > 1 ? 's' : ''} à voix haute, ${tu > 1 ? 'ils restent' : 'il reste'} affiché${tu > 1 ? 's' : ''} sur la page.` : ''} Les rapports payants ne sont pas accessibles ; c’est de l’information, pas une consigne.`;
}
export function phraseCotVoix(cot, ans = '3') {
  if (!cot || cot.erreur) return `Le rapport COT n’est pas disponible${cot && cot.erreur ? ' : ' + cot.erreur : ''}.`;
  const st = statsCot(cot, ans); if (!st) return 'Le rapport COT est vide.';
  return `COT ${cot.libelle}, rapport du ${dateFr(st.der.date)}, publié par la CFTC. ${phraseSpec(cot, st).replace('Ce que ça veut dire : ', '')} ${phraseComm(cot, st).replace('Ce que ça veut dire : ', '')}`;
}
export function changePourOr({ cot, sante, calendrier, banques, actus }) {
  const L = [];
  const st = statsCot(cot, '1'); if (st) L.push(`Les fonds spéculatifs sont à ${signe(st.specNet)} contrats nets, ${signe(st.specVar4)} en 4 semaines (COT du ${dateFr(st.der.date)}).`);
  if (sante && sante.dxy != null) L.push(`Le dollar varie de ${signe(sante.dxy, 1)} % sur 20 jours.`);
  if (sante && sante.reels != null) L.push(`Le taux réel à 10 ans est à ${nf(sante.reels, 2)} %.`);
  if (sante && sante.gldVar30 != null) L.push(`Le fonds GLD a ${sante.gldVar30 >= 0 ? 'gagné' : 'perdu'} ${nf(Math.abs(sante.gldVar30), 1)} tonnes sur un mois.`);
  if (calendrier && calendrier.length) L.push(`Prochaine annonce importante : ${calendrier[0].titre} (${calendrier[0].pays}) le ${calendrier[0].quand}.`);
  if (banques && banques.length) { const b = banques.find(x => titreLisible(x.titre)); if (b) L.push(`Côté banques, ${b.banque || 'la presse'} rapporte le ${dateMs(b.date)} : ${b.titre.replace(/\s+-\s+[^-]+$/, '')}.`); }
  return L.length ? L.join(' ') : 'Je n’ai pas encore assez de données chargées pour dire ce qui change pour l’or : ouvre les pages COT, Santé du marché et Calendrier.';
}
