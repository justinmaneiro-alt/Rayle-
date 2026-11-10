/* ═════════════ « CE QUI FAIT BOUGER L'OR » : calculs, phrases et fiches (pur, testé) ═════════════
   Faits = valeurs mesurées par les sources (jamais inventées) ; sens habituel = relation historique générale (corrélation, pas une cause, pas une promesse) ; interprétation = hypothèse à valider.
   Rien ici n'est un ordre ni un conseil. Source absente = « indisponible » + raison. */
export const FACTEURS = Object.freeze([
  { id: 'dxy', nom: 'Dollar américain (DXY)', effet: 'inverse', unite: '', source: 'Yahoo Finance via le Worker de Rayle', sens: 'En général, quand le dollar monte l\'or a plutôt tendance à baisser (l\'or est coté en dollars : un dollar plus cher le rend plus cher pour les autres monnaies).' },
  { id: 'us10y', nom: 'Taux américain à 10 ans', effet: 'inverse', unite: '%', source: 'Yahoo Finance (^TNX) via le Worker de Rayle', sens: 'Des taux qui montent rendent les obligations plus attrayantes que l\'or, qui ne verse aucun intérêt : en général plutôt défavorable à l\'or.' },
  { id: 'reels', nom: 'Taux réels à 10 ans (TIPS)', effet: 'inverse', unite: '%', source: 'FRED (DFII10), série officielle de la Fed de Saint-Louis', sens: 'Taux d\'intérêt moins l\'inflation attendue. C\'est le lien historique le plus net : taux réels en hausse, or plutôt sous pression, et inversement.' },
  { id: 'fed', nom: 'Fed : taux directeur effectif', effet: 'inverse', unite: '%', source: 'FRED (DFF)', sens: 'Une Fed qui resserre (hausse des taux) pèse en général sur l\'or ; une Fed qui assouplit le soutient. Les attentes comptent plus que le niveau.' },
  { id: 'cot', nom: 'Positions des fonds sur l\'or (CFTC, COT)', effet: 'direct', unite: 'contrats', source: 'CFTC (publicreporting.cftc.gov), rapport du mardi publié le vendredi', sens: 'Position nette des « gros spéculateurs » (Managed Money) sur le contrat à terme or COMEX. Très haute = marché déjà plein d\'acheteurs (risque de retournement) ; basse = peu de monde dedans. Donnée hebdomadaire : jamais en temps réel.' },
  { id: 'gld', nom: 'ETF or (GLD)', effet: 'direct', unite: '$', source: 'Yahoo Finance (GLD) via le Worker de Rayle', sens: 'Un ETF qui suit le prix de l\'or. Son cours monte avec l\'or ; ses flux (entrées/sorties, non mesurés ici) montrent l\'appétit des investisseurs.' },
  { id: 'mineurs', nom: 'Mineurs d\'or (GDX)', effet: 'direct', unite: '$', source: 'Yahoo Finance (GDX) via le Worker de Rayle', sens: 'Les actions de mines d\'or réagissent souvent avant ou plus fort que l\'or : si elles baissent pendant que l\'or monte, la hausse est moins confirmée.' },
  { id: 'geo', nom: 'Risque géopolitique (actualités)', effet: 'direct', unite: '', source: 'actualités publiques (fil du monde du Worker de Rayle), mots-clés comptés', sens: 'Tensions, guerres, sanctions : l\'or sert souvent de valeur refuge. Ici : simple comptage de titres sur 24 h, pas une mesure officielle du risque.' },
  { id: 'calendrier', nom: 'Calendrier économique du jour', effet: 'aucun', unite: '', source: 'calendrier public (Forex Factory), événements USD de la semaine', sens: 'Les annonces américaines (inflation, emploi, Fed) font bouger le dollar, les taux et donc l\'or, surtout dans les minutes qui suivent.' }
]);
/* FOMC 2026 (calendrier publié par la Fed — À VÉRIFIER sur federalreserve.gov) : jour de la décision */
export const FOMC_2026 = Object.freeze(['2026-01-28', '2026-03-18', '2026-04-29', '2026-06-17', '2026-07-29', '2026-09-16', '2026-10-28', '2026-12-09']);
export const prochainFomc = (iso = new Date().toISOString().slice(0, 10)) => FOMC_2026.find(d => d >= iso) || null;

export const pct = (a, b) => (a > 0 && b > 0 ? (a / b - 1) * 100 : null);
const fr = (x, d = 2) => (x == null || !Number.isFinite(x) ? '—' : Number(x).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }));
export const nombre = fr;
/* résumé d'une série de bougies { t, c } : dernier cours, variations sur 1 h et 24 h (par horodatage) */
export function resumeSerie(B, maintenant = Date.now()) {
  const L = (B || []).filter(b => b && b.c > 0 && Number.isFinite(b.t)).sort((a, b) => a.t - b.t); if (L.length < 2) return null; const der = L[L.length - 1];
  const avant = h => { const cible = der.t - h * 3600e3; let r = null; for (const b of L) { if (b.t <= cible) r = b; else break; } return r; };
  const a1 = avant(1), a24 = avant(24); return { valeur: der.c, t: der.t, age: Math.max(0, maintenant - der.t), var1h: a1 ? pct(der.c, a1.c) : null, var24h: a24 ? pct(der.c, a24.c) : null };
}
/* effet de la variation d'un facteur sur l'or, d'après le sens habituel (jamais une certitude) */
export function sensPourOr(effet, variation, seuil = 0.08) {
  if (variation == null || effet === 'aucun') return { code: 'inconnu', texte: '—' }; if (Math.abs(variation) < seuil) return { code: 'neutre', texte: 'neutre (variation faible)' };
  const hausse = variation > 0; const bon = effet === 'direct' ? hausse : !hausse;
  return bon ? { code: 'favorable', texte: 'plutôt favorable à l\'or' } : { code: 'defavorable', texte: 'plutôt défavorable à l\'or' };
}
export function parseFred(csv) {
  const L = String(csv || '').trim().split(/\r?\n/).slice(1).map(l => l.split(',')).filter(x => x.length >= 2 && x[1] !== '.' && x[1] !== '' && Number.isFinite(+x[1])).map(x => ({ date: x[0], valeur: +x[1] }));
  if (!L.length) return null; const der = L[L.length - 1], av = L[L.length - 2] || null, sem = L.filter(x => x.date <= new Date(new Date(der.date).getTime() - 7 * 864e5).toISOString().slice(0, 10)).pop() || null;
  return { date: der.date, valeur: der.valeur, veille: av && av.valeur, deltaJour: av ? +(der.valeur - av.valeur).toFixed(3) : null, deltaSemaine: sem ? +(der.valeur - sem.valeur).toFixed(3) : null };
}
export function parseCot(rows) {
  const L = (rows || []).map(r => ({ date: String(r.report_date_as_yyyy_mm_dd || '').slice(0, 10), long: +r.m_money_positions_long_all, court: +r.m_money_positions_short_all, oi: +r.open_interest_all })).filter(r => r.date && Number.isFinite(r.long) && Number.isFinite(r.court)).sort((a, b) => b.date.localeCompare(a.date));
  if (!L.length) return null; const a = L[0], b = L[1] || null; const net = a.long - a.court; return { date: a.date, long: a.long, court: a.court, net, variation: b ? net - (b.long - b.court) : null, partOI: a.oi > 0 ? net / a.oi : null };
}
const MOTS_GEO = /(guerre|conflit|offensive|frappe|missile|bombard|attaque|sanction|escalade|tension|invasion|cessez-le-feu|nucl[ée]aire|otage|taïwan|taiwan|ukraine|gaza|isra[ée]l|iran|russie|war\b|strike|sanctions|ceasefire|missile|escalat)/i;
export function scoreGeo(titres, { ref = 12 } = {}) { const n = (titres || []).filter(t => MOTS_GEO.test(String(t))).length; return { n, total: (titres || []).length, niveau: n >= ref ? 'élevé' : n >= ref / 3 ? 'modéré' : 'faible' }; }
/* événements américains du jour (heure de Paris) depuis le calendrier public ; impact « High » / « Medium » seulement */
export function evenementsDuJour(evts, maintenant = Date.now(), tz = 'Europe/Paris') {
  const jour = t => new Intl.DateTimeFormat('fr-CA', { timeZone: tz }).format(new Date(t)), hm = t => new Intl.DateTimeFormat('fr-FR', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(new Date(t)), auj = jour(maintenant);
  return (evts || []).filter(e => e && e.country === 'USD' && /^(High|Medium)$/i.test(e.impact || '')).map(e => ({ titre: e.title, t: Date.parse(e.date), impact: e.impact, prevu: e.forecast || '', precedent: e.previous || '', reel: e.actual || '' })).filter(e => Number.isFinite(e.t) && jour(e.t) === auj).sort((a, b) => a.t - b.t).map(e => ({ ...e, heure: hm(e.t), dansMin: Math.round((e.t - maintenant) / 60e3) }));
}
/* « Pourquoi l'or bouge ? » : 4 à 6 phrases, FAITS MESURÉS puis INTERPRÉTATION. `f` = { prix, var1h, var3h, var24h, niveau (texte), session, evenement, dxy, us10y, reels, geo, rythme } ; champs absents = phrase omise */
export function pourquoi(f) {
  const faits = [], interp = [];
  if (f.prix != null) { const d = f.var3h ?? f.var1h; faits.push(`L'or est à ${fr(f.prix)} dollars${d != null ? `, ${d >= 0 ? 'en hausse' : 'en baisse'} de ${fr(Math.abs(d))} pour cent sur les dernières heures` : ''}${f.var24h != null ? ` et de ${fr(f.var24h)} pour cent sur 24 heures` : ''}.`); }
  if (f.niveau) faits.push(f.niveau.endsWith('.') ? f.niveau : f.niveau + '.');
  if (f.session) faits.push(`Nous sommes en séance ${f.session}${f.rythme ? `, ${f.rythme}` : ''}.`);
  if (f.evenement) faits.push(f.evenement.endsWith('.') ? f.evenement : f.evenement + '.');
  const corr = []; for (const [n, v, e] of [['le dollar', f.dxy, 'inverse'], ['le taux à 10 ans', f.us10y, 'inverse'], ['les taux réels', f.reels, 'inverse']]) if (v != null && Math.abs(v) >= 0.05) corr.push(`${n} ${v > 0 ? 'monte' : 'baisse'}`);
  if (corr.length) faits.push(`Côté marchés : ${corr.join(', ')}.`);
  if (f.geo && f.geo.niveau && f.geo.total) faits.push(`Actualité : ${f.geo.n} titres sur ${f.geo.total} touchent aux tensions géopolitiques, un niveau ${f.geo.niveau}.`);
  const dir = (f.var3h ?? f.var1h ?? 0) >= 0 ? 1 : -1, pressions = [['dxy', f.dxy, -1], ['us10y', f.us10y, -1], ['reels', f.reels, -1]].filter(x => x[1] != null && Math.abs(x[1]) >= 0.05);
  const accord = pressions.filter(x => Math.sign(x[1]) * x[2] === dir).length;
  if (pressions.length) interp.push(accord === pressions.length ? `Interprétation (à valider) : les mouvements du dollar et des taux vont dans le sens habituel de celui de l'or, ce qui renforce la lecture.` : accord === 0 ? `Interprétation (à valider) : le dollar et les taux ne confirment pas le mouvement de l'or. Le mouvement vient peut-être d'ailleurs (flux, annonce, niveau technique) ou manque de soutien.` : `Interprétation (à valider) : le dollar et les taux ne sont qu'en partie d'accord avec le mouvement de l'or.`);
  else interp.push('Interprétation : je n\'ai pas de mesure fiable du dollar et des taux en ce moment, donc je ne peux pas dire s\'ils soutiennent le mouvement.');
  interp.push('Ce sont des corrélations habituelles, pas des certitudes, et aucune promesse de gain.');
  return { faits, interpretation: interp, texte: [...faits.slice(0, 4), ...interp].join(' '), nbPhrases: faits.slice(0, 4).length + interp.length };
}
/* fiches « Comment lire ça » */
export const FICHES = Object.freeze({
  vwap: { titre: 'VWAP de séance', texte: 'Le VWAP est le prix moyen de la journée, pondéré par les volumes échangés. Les grosses institutions s\'en servent comme repère de « prix juste » du jour. Au-dessus, les acheteurs dominent ; au-dessous, les vendeurs. Les bandes à plus ou moins un et deux écarts-types montrent l\'éloignement : loin du VWAP, le prix a tendance à y revenir, sauf jour de tendance forte.' },
  vwapAncre: { titre: 'VWAP ancré', texte: 'Même calcul que le VWAP, mais commencé à un point précis : le plus bas ou le plus haut de la veille, ou l\'ouverture de la semaine. Il montre le prix moyen payé par ceux qui sont entrés depuis ce point : il agit souvent comme un support ou une résistance.' },
  profil: { titre: 'Profil de volume', texte: 'L\'histogramme montre à quels prix on a le plus échangé. Le POC est le prix le plus échangé. La zone de valeur, entre VAL et VAH, contient environ 70 pour cent des volumes. Le prix a tendance à revenir vers le POC, et une sortie de la zone de valeur peut annoncer un mouvement.' },
  cvd: { titre: 'CVD et delta', texte: 'Le delta d\'une bougie est la différence entre les achats et les ventes agressifs. Le CVD cumule ces deltas. Si le prix monte pendant que le CVD baisse, la hausse est portée par peu d\'acheteurs agressifs : c\'est une divergence, à surveiller. Ici, mesuré seulement pendant que cette page est ouverte, à partir des transactions Kraken en direct.' },
  veilleSemaine: { titre: 'Plus hauts et plus bas de la veille et de la semaine', texte: 'Ce sont des repères que tout le monde regarde. Le prix s\'y arrête souvent, ou les dépasse brièvement avant de repartir en sens inverse : on parle de balayage de liquidité.' },
  ouvertures: { titre: 'Ouvertures du jour et de la semaine', texte: 'Le prix d\'ouverture sépare les acheteurs des vendeurs de la période : au-dessus de l\'ouverture, la période est haussière ; au-dessous, baissière. Beaucoup d\'opérateurs y reviennent comme à un point d\'équilibre.' },
  seances: { titre: 'Séances Asie, Londres, New York', texte: 'Le marché de l\'or tourne autour du monde. L\'Asie est souvent calme et trace une fourchette ; Londres et New York sortent souvent de cette fourchette. Un balayage est quand une séance dépasse l\'extrême d\'une autre puis revient dedans : un piège possible. Heures de Paris : Asie 1 h à 9 h, Londres 9 h à 15 h 30, New York 15 h 30 à 22 h.' },
  ronds: { titre: 'Niveaux ronds', texte: 'Les prix ronds (tous les 50 ou 100 dollars) attirent les ordres, car beaucoup d\'opérateurs y placent leurs objectifs et leurs stops. Le prix y hésite, y rebondit ou les traverse avec élan.' },
  liquiditeZones: { titre: 'Zones de liquidité', texte: 'Des hauts ou des bas à peu près égaux, et des extrêmes jamais retouchés, concentrent des ordres de stop. Le prix est souvent attiré vers ces zones pour « chercher » cette liquidité, puis réagit.' },
  carteCarnet: { titre: 'Carte thermique du carnet', texte: 'Elle montre, dans le temps, où se trouvent les gros ordres en attente dans le carnet Kraken. Les zones claires sont des murs ; un mur qui disparaît avant que le prix l\'atteigne peut être un leurre. Lecture seule.' },
  mouvements: { titre: 'Mouvements H1', texte: 'Les rectangles marquent, après coup, les mouvements de quatre à six bougies d\'une heure d\'au moins une fois et demie l\'ATR. C\'est une lecture rétrospective : ils ne prédisent pas le suivant.' },
  positions: { titre: 'Positions de Rayle', texte: 'Ce sont des positions simulées d\'après les études de structure. Elles sont étiquetées par niveau de preuve et n\'engagent aucun argent : jamais un ordre, jamais une promesse.' },
  propositions: { titre: 'Propositions H1', texte: 'À la clôture de chaque bougie d\'une heure, Rayle peut proposer une entrée, un stop et une cible sur des niveaux de structure. Chaque type de proposition montre les résultats mesurés sur 2003 à 2019, frais déduits. Tant qu\'aucun type n\'est validé, le panneau le dit : ce sont des lectures, pas des signaux.' },
  facteurs: { titre: 'Ce qui fait bouger l\'or', texte: 'Le dollar, les taux américains (surtout les taux réels), la Fed, les positions des fonds, les ETF, les mines et les tensions dans le monde influencent l\'or. Pour chaque facteur, le panneau montre la valeur mesurée, sa variation et le sens habituel de son effet. Ce sont des corrélations, pas des causes.' }
});
export const ALIAS_FICHES = [
  ['vwapAncre', /vwap ancre|vwap ancree|ancre/], ['vwap', /\bvwap\b/], ['profil', /profil de volume|poc\b|zone de valeur|\bvah\b|\bval\b/], ['cvd', /\bcvd\b|delta/], ['veilleSemaine', /plus haut.*(veille|semaine)|plus bas.*(veille|semaine)|hauts? et bas de la (veille|semaine)|\bpdh\b|\bpdl\b/], ['ouvertures', /ouverture du jour|ouverture de la semaine|ouvertures/],
  ['seances', /seance|session|asie|londres|new york|balayage/], ['ronds', /niveaux? ronds?|prix ronds?/], ['liquiditeZones', /zones? de liquidite|liquidite/], ['carteCarnet', /carte thermique|heatmap|carte de chaleur/], ['mouvements', /mouvements? h1|mouvements/], ['positions', /positions? de rayle|trades? simules?/], ['propositions', /propositions? h1|propositions?/], ['facteurs', /ce qui fait bouger|facteurs/]
];
export function ficheDe(texteNormalise) { for (const [id, re] of ALIAS_FICHES) if (re.test(texteNormalise)) return { id, ...FICHES[id] }; return null; }
