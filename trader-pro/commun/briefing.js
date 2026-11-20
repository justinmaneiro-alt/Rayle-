/* ═════════════ BRIEFING DU JOUR ET REVUE DU DIMANCHE (v6, B6) — pur et testé, utilisé par l'appli (voix) ET par le Worker (Telegram) ═════════════
   Entrée = données déjà calculées ailleurs ; sortie = { sections, voix (≈ 1 minute, phrases courtes pensées pour l'écoute), telegram (texte) }. Lecture seule : aucun ordre, aucune recommandation d'entrée. */
const f = (v, d = 0) => (Number.isFinite(v) ? v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/[  ]/g, ' ') : '?');
const pct = v => (Number.isFinite(v) ? (v >= 0 ? 'plus ' : 'moins ') + f(Math.abs(v), 1) + ' pour cent' : null);
const NOM = { or: 'l’or', us100: 'le Nasdaq 100', us500: 'le S&P 500', btc: 'le Bitcoin', sol: 'Solana', eurusd: 'l’EUR/USD', usdchf: 'l’USD/CHF', dxy: 'le dollar' };
const dec = a => (a === 'eurusd' || a === 'usdchf' ? 4 : a === 'sol' ? 2 : 0);
/* d : { date, mouvements: [{ actif, prix, variationPct }], niveaux: [{ actif, nom, prix, distancePct }], annonces: [{ heure, titre, impact }], alertes: { actives, recentes: [texte] }, risque: { total, totalPct, jourReste, etatJour }, donnees: { voyant, phrase } } */
export function construireBriefing(d) {
  const S = [], V = []; const nom = a => NOM[a] || a;
  const M = (d.mouvements || []).filter(m => Number.isFinite(m.variationPct)).sort((a, b) => Math.abs(b.variationPct) - Math.abs(a.variationPct));
  if (M.length) { S.push({ id: 'mouvements', titre: 'Depuis la veille', lignes: M.map(m => `${nom(m.actif)} ${pct(m.variationPct).replace('pour cent', '%')} (${f(m.prix, dec(m.actif))})`) }); V.push('Depuis la veille : ' + M.slice(0, 3).map(m => `${nom(m.actif)}, ${pct(m.variationPct)}`).join(' ; ') + '.'); }
  const N = (d.niveaux || []).filter(n => Number.isFinite(n.distancePct)).sort((a, b) => Math.abs(a.distancePct) - Math.abs(b.distancePct)).slice(0, 5);
  if (N.length) { S.push({ id: 'niveaux', titre: 'Niveaux proches', lignes: N.map(n => `${nom(n.actif)} : ${n.nom} à ${f(n.prix, dec(n.actif))} (${f(Math.abs(n.distancePct), 1)} % ${n.distancePct >= 0 ? 'au-dessus' : 'en dessous'})`) }); V.push('Niveaux à surveiller : ' + N.slice(0, 3).map(n => `${nom(n.actif)}, ${n.nom} à ${f(n.prix, dec(n.actif))}, à ${f(Math.abs(n.distancePct), 1)} pour cent`).join(' ; ') + '.'); }
  const A = d.annonces || []; S.push({ id: 'annonces', titre: 'Annonces du jour', lignes: A.length ? A.map(a => `${a.heure} · ${a.titre}${a.impact ? ' (' + a.impact + ')' : ''}`) : ['Aucune annonce importante aujourd’hui.'] });
  V.push(A.length ? `Annonces : ${A.slice(0, 3).map(a => `${a.heure.replace(':', ' heures ')}, ${a.titre}`).join(' ; ')}.` : 'Pas d’annonce importante aujourd’hui.');
  const al = d.alertes || {}, R = al.recentes || []; S.push({ id: 'alertes', titre: 'Alertes et flèches', lignes: [`${al.actives || 0} alerte${(al.actives || 0) > 1 ? 's' : ''} de prix active${(al.actives || 0) > 1 ? 's' : ''}`, ...R.slice(0, 4)] });
  V.push(R.length ? `Flèches récentes : ${R.slice(0, 2).join(' ; ')}.` : `${al.actives || 0} alerte${(al.actives || 0) > 1 ? 's' : ''} active${(al.actives || 0) > 1 ? 's' : ''}, aucune flèche récente.`);
  const r = d.risque; if (r) { const ligne = `Risque engagé ${f(r.total)} €${Number.isFinite(r.totalPct) ? ' (' + f(r.totalPct, 1) + ' % du capital)' : ''}${Number.isFinite(r.jourReste) ? ', budget du jour restant ' + f(r.jourReste) + ' €' : ''}`; S.push({ id: 'risque', titre: 'Mon risque', lignes: [ligne + (r.etatJour === 'atteinte' ? ' : limite du jour atteinte' : '')] }); V.push(`Ton risque engagé est de ${f(r.total)} euros${Number.isFinite(r.jourReste) ? `, il te reste ${f(r.jourReste)} euros de budget aujourd’hui` : ''}.${r.etatJour === 'atteinte' ? ' La limite du jour est atteinte.' : ''}`); }
  const dn = d.donnees; if (dn) { S.push({ id: 'donnees', titre: 'État des données', lignes: [dn.phrase] }); V.push(dn.voyant === 'vert' ? 'Les données sont à jour.' : dn.phrase); }
  V.push('Lecture seule : aucun ordre n’est passé.');
  const voix = `Briefing du ${d.date || 'jour'}. ` + V.join(' '), telegram = `☀️ Briefing du ${d.date || 'jour'}\n` + S.map(s => `\n${s.titre}\n` + s.lignes.map(l => '• ' + l).join('\n')).join('\n') + '\n\n(Lecture seule : aucun ordre.)';
  return { sections: S, voix, telegram, mots: voix.split(/\s+/).length };
}
/* revue du dimanche : trades de la semaine (€ et R), setups gagnants / perdants, respect des limites, statistiques des flèches, rappel d'import */
export function construireRevue(d) {
  const T = d.trades || [], pnl = T.reduce((s, t) => s + (t.pnl || 0), 0), Rs = T.filter(t => Number.isFinite(t.R)), R = Rs.reduce((s, t) => s + t.R, 0), gag = T.filter(t => t.pnl > 0).length;
  const parSetup = new Map(); for (const t of T) { const k = t.setup || 'autre'; const e = parSetup.get(k) || { n: 0, pnl: 0 }; e.n++; e.pnl += t.pnl || 0; parSetup.set(k, e); }
  const S = [...parSetup.entries()].map(([k, e]) => ({ setup: k, ...e })).sort((a, b) => b.pnl - a.pnl), L = [];
  L.push(T.length ? `${T.length} trade${T.length > 1 ? 's' : ''} : ${gag} gagnant${gag > 1 ? 's' : ''}, résultat ${pnl >= 0 ? '+' : '−'}${f(Math.abs(pnl))} €${Rs.length ? ` (${R >= 0 ? '+' : '−'}${f(Math.abs(R), 1)} R)` : ''}` : 'Aucun trade fermé cette semaine.');
  if (S.length > 1) L.push(`Meilleur setup : ${S[0].setup} (${S[0].pnl >= 0 ? '+' : '−'}${f(Math.abs(S[0].pnl))} €) ; moins bon : ${S[S.length - 1].setup} (${S[S.length - 1].pnl >= 0 ? '+' : '−'}${f(Math.abs(S[S.length - 1].pnl))} €)`);
  const lim = d.limites || {}; L.push(lim.jourDepasse || lim.semaineDepassee ? `Limites de risque : dépassées${lim.jourDepasse ? ' (jour)' : ''}${lim.semaineDepassee ? ' (semaine)' : ''}` : 'Limites de risque : respectées');
  if (d.fleches) L.push(`Flèches : ${d.fleches}`);
  if (d.joursSansImport != null && d.joursSansImport >= 7) L.push(`Rappel : aucun import XTB depuis ${d.joursSansImport} jours (xStation → Historique du compte → Exporter).`); else if (d.joursSansImport == null) L.push('Rappel : importe ton historique XTB pour que la revue soit complète.');
  return { lignes: L, telegram: '📅 Revue de la semaine\n' + L.map(l => '• ' + l).join('\n') + '\n\n(Lecture seule : aucun ordre.)', pnl, R, trades: T.length };
}
