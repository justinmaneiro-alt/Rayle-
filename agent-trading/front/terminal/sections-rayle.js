/* ═════════════ TERMINAL : CE QUE RAYLE SAIT DES SECTIONS DE LA PAGE (pur, testé ; 2026-11-08) ═════════════
   Chaque section (tableau multi-unités, santé, annonces, COT, rapports, actualités, journal, carnet, positions) expose ses données
   STRUCTURÉES. Rayle s'en sert pour expliquer, résumer, orienter et signaler (« attention, annonce dans 20 minutes », « le prix
   approche la SMA 200 », « le COT montre… »). Elle ne donne jamais d'ordre et propose au plus un ou deux scénarios.
   Règle : aucun chiffre qui ne vienne de ces données ; une donnée absente se dit « je ne sais pas ». */
import { MENTION_LECTURE } from './lecture-rayle.js';

export const QUESTIONS_SECTIONS = Object.freeze({
  tableau: 'Explique-moi le tableau de bord multi-unités : tendance, RSI, volume net, niveaux et score de chaque unité.',
  sante: 'Comment va le marché : volatilité, volume, spread, carnet, séances, corrélations et entreprises liées ?',
  calendrier: 'Quelles annonces économiques arrivent, et laquelle compte le plus ?',
  cot: 'Que montre le rapport COT ?',
  rapports: 'Résume les derniers rapports et analyses publics.',
  actus: 'Résume les actualités financières du moment pour cet actif.',
  journal: 'Fais le point sur mon journal et mes positions.',
  alertes: 'Résume les alertes récentes.',
  registre: 'Que dit le registre des alertes ?',
  cotations: 'Fais le point sur les cotations des cinq actifs.',
  carnet: 'Qu’est-ce qui se passe sur le carnet d’ordres ?',
  positions: 'Explique-moi mes positions en cours.'
});

const nomU = u => (u === 'J' ? 'jour' : u === 'G' ? 'global' : u);
const r1 = x => (Math.round(x * 10) / 10).toString().replace('.', ',');
const usd = x => { const a = Math.abs(x); return (x < 0 ? 'moins ' : '') + (a >= 1e6 ? r1(a / 1e6) + ' millions de dollars' : a >= 1e3 ? Math.round(a / 1e3) + ' mille dollars' : Math.round(a) + ' dollars'); };

/* lignes de contexte (envoyées à /chat avec le reste de l'état) */
export function lignesSections(X = {}, { fmt = x => String(x), heure = t => new Date(t).toISOString(), maintenant = Date.now() } = {}) {
  const L = [];
  if (X.tableau && X.tableau.cols) {
    const c = X.tableau.cols;
    L.push('Tableau multi-unités (score-lecture-v1, synthèse de lecture, pas une prévision) : ' + ['M5', 'M15', 'H1', 'J', 'G'].filter(u => c[u] && c[u].pret).map(u => { const k = c[u];
      return `${nomU(u)} tendance ${k.tendance.sens}, RSI ${k.rsi != null ? r1(k.rsi) : 'inconnu'}, volume net ${k.volNet ? usd(k.volNet.net) : 'inconnu'}, support ${k.support != null ? fmt(k.support) : 'aucun'}, résistance ${k.resistance != null ? fmt(k.resistance) : 'aucune'}, score ${k.score.total} sur 100`; }).join(' ; ') + '.');
  }
  if (X.sante) {
    const s = X.sante, P = [];
    if (s.rangAtr != null) P.push(`ATR au ${s.rangAtr}e centile de l’historique`);
    if (s.seances) P.push('séances ouvertes : ' + (s.seances.filter(x => x.ouverte).map(x => x.nom).join(', ') || 'aucune'));
    if (s.correlations) P.push('corrélations 60 jours : ' + s.correlations.map(c => `${c.nom} ${c.r == null ? 'inconnue' : r1(c.r)}`).join(', '));
    if (s.lies) P.push('liés : ' + s.lies.filter(x => x.var != null).map(x => `${x.s} ${x.var > 0 ? '+' : ''}${r1(x.var)} %`).join(', '));
    if (P.length) L.push('Santé : ' + P.join(' ; ') + '.');
  }
  if (X.cot && X.cot.categories) L.push(`COT ${X.cot.nom} (mardi ${X.cot.date}) : ` + X.cot.categories.map(k => `${k.nom} nets ${k.net != null ? (k.net > 0 ? '+' : '') + k.net.toLocaleString('fr-FR') : 'inconnu'}${k.variation != null ? ` (${k.variation > 0 ? '+' : ''}${k.variation.toLocaleString('fr-FR')} sur la semaine)` : ''}`).join(' ; ') + (X.cot.lecture ? `. ${X.cot.lecture}` : '') + '.');
  if (X.annonces && X.annonces.length) L.push('Annonces de la semaine à venir (impact fort et moyen) : ' + X.annonces.filter(a => a.t >= maintenant).slice(0, 6).map(a => `${a.devise} ${a.titre} ${heure(a.t)} (${a.impact})${a.prevu ? ', prévu ' + a.prevu : ''}${a.precedent ? ', précédent ' + a.precedent : ''}`).join(' ; ') + '.');
  if (X.rapports && X.rapports.length) L.push('Derniers rapports publics : ' + X.rapports.slice(0, 5).map(r => `${r.source} « ${r.titre} »`).join(' ; ') + '.');
  if (X.actus && X.actus.length) L.push('Actualités financières : ' + X.actus.slice(0, 4).map(a => a.titre).join(' ; ') + '.');
  if (X.journal) L.push(`Journal : ${X.journal.ouvertes} position(s) ouverte(s), ${X.journal.attente} en attente, ${X.journal.closes} close(s) au total${X.journal.dernier ? `, dernière : ${X.journal.dernier}` : ''}.`);
  return L;
}

/* réponse locale (sans IA) pour une section */
export function texteSection(id, E, X = {}, { fmt = x => String(x), heure = t => new Date(t).toISOString(), maintenant = Date.now() } = {}) {
  const P = [];
  if (id === 'tableau') {
    const c = X.tableau && X.tableau.cols; if (!c) return 'Le tableau multi-unités n’est pas encore calculé. Je ne sais pas.';
    const ok = ['M5', 'M15', 'H1', 'J'].filter(u => c[u] && c[u].pret), h = ok.filter(u => c[u].tendance.sens === 'haussière'), b = ok.filter(u => c[u].tendance.sens === 'baissière');
    P.push(h.length && b.length ? `Les unités ne sont pas d’accord : haussières en ${h.map(nomU).join(', ')}, baissières en ${b.map(nomU).join(', ')}.` : h.length ? `Toutes les unités lues sont haussières.` : b.length ? `Toutes les unités lues sont baissières.` : 'Tendance inconnue.');
    for (const u of ok) if (c[u].rsi >= 70 || c[u].rsi <= 30) P.push(`RSI ${c[u].rsi >= 70 ? 'suracheté' : 'survendu'} en ${nomU(u)}, ${r1(c[u].rsi)}.`);
    if (c.G && c.G.pret) P.push(`Le score global est de ${c.G.score.total} sur 100, ${c.G.score.mot}. C’est une synthèse de lecture, pas une prévision.`);
    if (c.H1 && c.H1.pret && c.H1.support != null && c.H1.resistance != null) P.push(`En H1, support ${fmt(c.H1.support)}, résistance ${fmt(c.H1.resistance)}.`);
  } else if (id === 'sante') {
    const s = X.sante || {}, E2 = E.sante || {};
    P.push(E2.volatilite ? `Volatilité ${E2.volatilite.mot}${s.rangAtr != null ? `, au ${s.rangAtr}e centile de l’historique` : ''}.` : 'Volatilité inconnue.');
    if (E2.volumeRelatif) P.push(`Volume ${E2.volumeRelatif.mot}.`);
    if (s.seances) { const o = s.seances.filter(x => x.ouverte).map(x => x.nom); P.push(o.length ? `Séance ouverte : ${o.join(' et ')}.` : 'Aucune grande séance ouverte.'); }
    if (s.correlations) { const f = s.correlations.filter(c => c.r != null && Math.abs(c.r) >= 0.5); if (f.length) P.push(`Corrélation marquée avec ${f.map(c => `${c.nom} (${r1(c.r)})`).join(', ')}.`); }
  } else if (id === 'calendrier') {
    const L = (X.annonces || []).filter(a => a.t >= maintenant); if (!L.length) return 'Je ne connais aucune annonce à venir cette semaine.';
    const f = L.find(a => a.impact === 'fort'); if (f) { const m = Math.round((f.t - maintenant) / 60e3); P.push(`La prochaine annonce forte : ${f.devise} ${f.titre}, ${m < 120 ? `dans ${m} minutes` : heure(f.t)}${f.prevu ? `, prévu ${f.prevu}` : ''}${f.precedent ? `, précédent ${f.precedent}` : ''}.`); if (m <= 30) P.push('Attention : le prix peut bouger vite autour de l’heure de l’annonce.'); }
    P.push(`${L.length} annonce${L.length > 1 ? 's' : ''} à impact fort ou moyen d’ici la fin de la semaine.`);
  } else if (id === 'cot') {
    if (!X.cot || !X.cot.categories) return E.cotAbsent || 'Je n’ai pas le rapport COT pour l’instant. Je ne sais pas.';
    const s = X.cot.categories[0]; P.push(`Le COT ${X.cot.nom} du mardi ${X.cot.date} : spéculateurs nets ${s.net > 0 ? 'acheteurs' : 'vendeurs'} de ${Math.abs(s.net).toLocaleString('fr-FR')} contrats${s.variation != null ? `, ${s.variation > 0 ? 'en hausse' : 'en baisse'} de ${Math.abs(s.variation).toLocaleString('fr-FR')} sur la semaine` : ''}.`);
    const c = X.cot.categories[1]; if (c && c.net != null) P.push(`Les commerciaux sont nets ${c.net > 0 ? 'acheteurs' : 'vendeurs'}, souvent à l’inverse des spéculateurs.`);
    P.push('Le COT a quelques jours de retard : c’est un contexte, pas un signal.');
  } else if (id === 'rapports') {
    if (!X.rapports || !X.rapports.length) return 'Je n’ai pas de rapport public chargé pour l’instant.';
    P.push('Les dernières publications : ' + X.rapports.slice(0, 3).map(r => `${r.source}, « ${r.titre} »`).join(' ; ') + '. Ouvre le lien pour le texte complet.');
  } else if (id === 'actus') {
    if (!X.actus || !X.actus.length) return 'Je n’ai pas d’actualité financière dans le fil du moment.';
    P.push('À retenir : ' + X.actus.slice(0, 3).map(a => a.titre).join(' ; ') + '.');
  } else if (id === 'journal' || id === 'positions') {
    const j = X.journal; if (!j) return 'Le journal n’est pas chargé.';
    P.push(`${j.ouvertes} position${j.ouvertes > 1 ? 's' : ''} ouverte${j.ouvertes > 1 ? 's' : ''}, ${j.attente} en attente.`);
    for (const p of (E.positions || []).slice(0, 3)) P.push(`${p.actif} ${p.sens} ${p.etat} : entrée ${fmt(p.entree)}, stop ${fmt(p.stop)}, objectif ${fmt(p.objectif)}.`);
    if (j.dernier) P.push(`Dernier événement : ${j.dernier}.`);
    P.push('Ce sont des positions simulées : aucun ordre réel.');
  } else return null;
  return P.join(' ') + ' ' + MENTION_LECTURE;
}

/* signaux à dire (au plus un par sujet) : annonce forte proche, prix qui approche la SMA 200, changement du COT, position qui avance */
export function signaux(E, X = {}, { maintenant = Date.now(), fmt = x => String(x), heure = t => new Date(t).toISOString() } = {}) {
  const S = [];
  const f = (X.annonces || []).find(a => a.impact === 'fort' && a.t > maintenant && a.t - maintenant <= 30 * 60e3);
  if (f) S.push({ id: `annonce|${f.devise}|${f.titre}|${f.t}`, texte: `Attention, annonce dans ${Math.round((f.t - maintenant) / 60e3)} minutes : ${f.devise} ${f.titre}, à ${heure(f.t)}.` });
  if (E.ma200 && E.atr && Math.abs(E.ma200.distance) < 0.5 * E.atr) S.push({ id: `ma200|${E.actif}|${E.unite}|${Math.floor(maintenant / 3600e3)}`, texte: `Le prix ${E.nomActif === 'Or' ? 'de l’or' : 'du ' + E.nomActif} approche la SMA 200 ${E.unite} (${fmt(E.ma200.valeur)}).` });
  if (X.cot && X.cot.categories && X.cot.categories[0].variation != null && X.cot.categories[0].net) { const s = X.cot.categories[0]; if (Math.abs(s.variation) > 0.1 * Math.abs(s.net)) S.push({ id: `cot|${X.cot.nom}|${X.cot.date}`, texte: `Le COT montre un mouvement net des spéculateurs : ${s.variation > 0 ? '+' : ''}${s.variation.toLocaleString('fr-FR')} contrats sur la semaine.` }); }
  return S;
}
