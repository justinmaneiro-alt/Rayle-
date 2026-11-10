/* ═════════════ TERMINAL : « RAPPORT DU JOUR » ET ÉTAT ÉTENDU POUR RAYLE (pur, testé : agent-trading/tests/terminal-b-test.mjs) ═════════════
   · etatEtendu : tout ce que Rayle peut citer (bougies et motifs, carte de chaleur résumée, bougie du carnet et delta, CVD / profil / VWAP, régime, événements,
     annonces sorties et à venir, COT, rapports, actualités, santé, positions) ; chaque rubrique dit sa SOURCE ; rien d'absent n'est inventé.
   · rapportJour : texte du panneau et version parlée (court / normal / détaillé), un ou deux scénarios maximum.
   Règle : faits mesurés et hypothèses sont séparés ; une actualité n'est jamais présentée comme la cause d'un mouvement (au mieux : « coïncide avec »). */
import { MENTION, plagesSeances, extremes, regime, lireMotifs } from './analyses-calcul.js';

export const SEPARATION = 'Faits mesurés : chiffres du terminal. Hypothèses : ce qui pourrait se passer, jamais une certitude.';

export function etatEtendu({ base, motifs = [], chaleur = null, bougieCarnet = null, institutionnel = null, regimeInfo = null, evenements = [], annonces = [], cot = null, rapports = [], actus = [], sante = null, positions = [], journal = null } = {}) {
  return {
    base, mention: MENTION, separation: SEPARATION,
    bougies: { motifs: motifs.map(m => ({ nom: m.nom, sens: m.sens, texte: m.texte, stat: m.stat ? m.stat.texte : null })), source: 'bougies de l’unité affichée' },
    chaleur: chaleur ? { ...chaleur, source: 'carte de chaleur, enregistrée depuis l’activation' } : null,
    bougieCarnet: bougieCarnet ? { ...bougieCarnet, source: 'carnet d’ordres Kraken, depuis l’ouverture du terminal' } : null,
    institutionnel: institutionnel ? { ...institutionnel, source: 'calculs du terminal (CVD, profil, VWAP)' } : null,
    regime: regimeInfo, evenements: evenements.map(e => ({ type: e.type, texte: e.texte })),
    annonces: { sorties: annonces.filter(a => a.sortie).slice(0, 4), aVenir: annonces.filter(a => !a.sortie).slice(0, 4) },
    cot, rapports: rapports.slice(0, 3), actus: actus.slice(0, 4), sante, positions, journal
  };
}
/* texte de contexte (ajouté à celui de /chat) : une ligne par rubrique PRÉSENTE avec sa source */
export function lignesEtendues(X, { fmt = x => String(x) } = {}) {
  const L = [];
  if (X.bougies && X.bougies.motifs.length) L.push('Motifs de bougies (lecture, pas un signal) : ' + X.bougies.motifs.map(m => m.texte).join(' ; '));
  if (X.regime && X.regime.regime && X.regime.regime !== 'inconnu') L.push(`Régime (${X.regime.raison}) : ${X.regime.regime}${X.regime.compression ? ', volatilité en compression' : ''}.`);
  if (X.evenements && X.evenements.length) L.push('Événements sur les niveaux : ' + X.evenements.map(e => e.texte).join(' ; ') + '.');
  if (X.chaleur) L.push(`Carte de chaleur (${X.chaleur.source}) : ${X.chaleur.resume}.`);
  if (X.bougieCarnet) L.push(`Bougie du carnet (${X.bougieCarnet.source}) : ${X.bougieCarnet.texte}`);
  const I = X.institutionnel; if (I) L.push(`Outils institutionnels : ${[I.cvd != null ? `CVD ${fmt(I.cvd)}` : '', I.poc != null ? `POC ${fmt(I.poc)}, valeur ${fmt(I.val)} à ${fmt(I.vah)}` : '', I.vwap != null ? `VWAP de séance ${fmt(I.vwap)}` : '', I.deduction || ''].filter(Boolean).join(' ; ')}.`);
  if (X.annonces && (X.annonces.sorties.length || X.annonces.aVenir.length)) L.push(`Annonces : sorties ${X.annonces.sorties.map(a => `${a.titre} (effet mesuré ${a.effet || 'non mesuré'})`).join(', ') || 'aucune'} ; à venir ${X.annonces.aVenir.map(a => `${a.devise} ${a.titre} dans ${a.dansMin} min`).join(', ') || 'aucune'}.`);
  L.push('Consignes : sépare toujours FAITS MESURÉS (chiffres ci-dessus) et HYPOTHÈSES ; cite la source de chaque donnée ; pour relier une actualité à un mouvement, dis seulement « coïncide avec » et jamais « a causé » ; au plus deux scénarios ; ' + MENTION);
  return L;
}

const r1 = x => (Math.round(x * 10) / 10).toString().replace('.', ',');
const pct = (a, b) => (b ? (a - b) / b * 100 : 0);
/* actifs : [{ nom, B (bougies H1 ou M15), prix, tendances:{M15,H1,H4,J}, ma200, niveaux:{dessus,dessous}, carnet, positions, annonces:[{titre,devise,t,effet,sortie}], motifs:[], evenements:[], scenarios:[], cot, actus:[] }] */
export function rapportJour(actifs, { fmt = (n, x) => String(x), heure = t => new Date(t).toISOString(), maintenant = Date.now(), detail = 'normal' } = {}) {
  const part = [], voix = [];
  if (!actifs || !actifs.length) return { texte: `Aucun actif suivi à rapporter. ${MENTION}`, parle: `Je n’ai aucun actif à rapporter. ${MENTION}`, sections: [] };
  const sections = [];
  for (const A of actifs) {
    const f = x => fmt(A.nom, x), S = [], V = [];
    if (!A.B || A.B.length < 2 || !(A.prix > 0)) { sections.push({ nom: A.nom, texte: `${A.nom} : données indisponibles, je ne sais pas.`, parle: `${A.nom} : je n’ai pas les données.` }); continue; }
    const jour = new Date(maintenant).toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' });
    const B = A.B.filter(b => new Date(b.t).toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' }) === jour);
    // 1. ce qui s'est passé
    if (B.length) {
      const o = B[0].o, h = Math.max(...B.map(b => b.h)), l = Math.min(...B.map(b => b.l)), v = B.reduce((s, b) => s + (b.v || 0), 0), mv = pct(A.prix, o);
      S.push(`Aujourd’hui : ouverture ${f(o)}, plus haut ${f(h)}, plus bas ${f(l)}, mouvement ${mv > 0 ? '+' : ''}${r1(mv)} %${v > 0 ? `, volume ${Math.round(v).toLocaleString('fr-FR')}` : ''}.`);
      V.push(`${A.nom} ouvre à ${f(o)}, a touché ${f(h)} en haut et ${f(l)} en bas, et ${mv >= 0 ? 'gagne' : 'perd'} ${r1(Math.abs(mv))} pour cent.`);
      const se = plagesSeances(A.B, maintenant).filter(x => x.n);
      if (se.length && detail !== 'court') S.push('Par séance : ' + se.map(x => `${x.nom} ${x.mouvement > 0 ? '+' : ''}${r1(pct(x.ouverture + x.mouvement, x.ouverture))} %`).join(', ') + '.');
    } else S.push('Pas encore de bougie aujourd’hui.');
    const sorties = (A.annonces || []).filter(a => a.sortie);
    if (sorties.length) { S.push('Annonces sorties : ' + sorties.map(a => `${a.devise} ${a.titre}${a.effet ? `, effet mesuré ${a.effet}` : ', effet non mesuré'}`).join(' ; ') + '. Un mouvement qui coïncide avec une annonce n’en est pas forcément l’effet.'); V.push(`Annonce sortie : ${sorties[0].titre}. Elle coïncide avec le mouvement, sans que je puisse dire qu’elle l’explique.`); }
    if ((A.motifs || []).length && detail !== 'court') S.push('Motifs de bougies marquants : ' + A.motifs.slice(0, 3).map(m => m.nom + (m.stat ? ` (${m.stat.texte || m.stat})` : '')).join(' ; ') + '. Lecture, pas un signal.');
    if ((A.evenements || []).length) S.push('Sur tes niveaux : ' + A.evenements.slice(0, 3).map(e => e.texte).join(' ; ') + '.');
    // 2. état actuel
    const T = A.tendances ? Object.entries(A.tendances).filter(([, s]) => s && s !== 'inconnue').map(([u, s]) => `${u} ${s}`).join(', ') : '';
    S.push(`Maintenant : ${f(A.prix)}${T ? `, tendance ${T}` : ''}${A.ma200 ? `, ${A.prix >= A.ma200 ? 'au-dessus' : 'au-dessous'} de la MA200 (${f(A.ma200)})` : ''}.`);
    V.push(`Maintenant ${f(A.prix)}${A.ma200 ? `, ${A.prix >= A.ma200 ? 'au-dessus' : 'sous'} la moyenne mobile deux cents` : ''}${A.tendances && A.tendances.H1 ? `, tendance H1 ${A.tendances.H1}` : ''}.`);
    const nv = A.niveaux || {}, s0 = nv.dessous && nv.dessous[0], r0 = nv.dessus && nv.dessus[0];
    if (s0 || r0) S.push(`Niveaux : ${r0 ? `résistance ${f(r0.p)}` : ''}${r0 && s0 ? ', ' : ''}${s0 ? `support ${f(s0.p)}` : ''}.`);
    if (A.carnet) S.push(`Carnet : ${A.carnet.lecture}${A.pressionCarnet != null ? `, pression ${Math.round(A.pressionCarnet * 100)} %` : ''}.`);
    if ((A.positions || []).length) S.push(`Positions simulées : ${A.positions.map(p => `${p.sens} ${p.etat}`).join(', ')}.`);
    // 3. à venir
    const avenir = (A.annonces || []).filter(a => !a.sortie && a.t > maintenant && a.t - maintenant <= 6 * 3600e3);
    if (avenir.length) { S.push('À venir dans les prochaines heures : ' + avenir.map(a => `${a.devise} ${a.titre} à ${heure(a.t)}`).join(' ; ') + '.'); V.push(`À venir : ${avenir[0].titre} à ${heure(avenir[0].t)}.`); }
    if (A.cot && detail !== 'court') S.push(`COT : ${A.cot}.`);
    if ((A.actus || []).length && detail === 'detail') S.push('Actualités utiles (contexte, pas une cause) : ' + A.actus.slice(0, 2).join(' ; ') + '.');
    // 4. un ou deux scénarios
    for (const sc of (A.scenarios || []).slice(0, 2)) { S.push(`Scénario ${sc.nom.split(' · ')[0]} : ${sc.sens === 'hausse' ? 'à la hausse' : 'à la baisse'} depuis ${f(sc.niveau)} ; validation : ${sc.validation}; invalidation : ${sc.invalidation}.`); V.push(`Scénario ${sc.nom.split(' · ')[0]}, ${sc.sens === 'hausse' ? 'hausse' : 'baisse'} depuis ${f(sc.niveau)}.`); }
    sections.push({ nom: A.nom, texte: `■ ${A.nom}\n` + S.join('\n'), parle: V.join(' ') });
  }
  const texte = `RAPPORT DU JOUR (${heure(maintenant)})\n\n` + sections.map(s => s.texte).join('\n\n') + `\n\n${SEPARATION}\n${MENTION} Les alertes marchent tant que Rayle est ouvert.`;
  const maxMots = detail === 'court' ? 160 : detail === 'detail' ? 330 : 260;   // ≈ 1 à 2 minutes à 2,7 mots par seconde
  let parle = sections.map(s => s.parle).join(' ') + ` ${MENTION}`;
  const mots = parle.split(/\s+/); if (mots.length > maxMots) parle = mots.slice(0, maxMots).join(' ').replace(/[^.!?]*$/, '') + ` ${MENTION}`;
  return { texte, parle, sections: sections.map(s => ({ nom: s.nom, texte: s.texte })) };
}
export const estRapport = t => { const n = String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); return /(fais|donne|prepare)[- ]moi (un |le )?(rapport|compte[- ]rendu)|rapport (sur|du jour|des marches)|rapport d'aujourd'hui/.test(n) ? (/(detail|complet|approfondi)/.test(n) ? 'detail' : /(court|rapide|bref|en deux mots)/.test(n) ? 'court' : 'normal') : null; };
