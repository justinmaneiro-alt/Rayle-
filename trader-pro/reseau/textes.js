/* ═════════════ TEXTES PARLÉS ET ÉCRITS DU RÉSEAU D'INFORMATION (modules purs, testés) ═════════════
   Rayle parle comme une analyste : une phrase claire, le chiffre qui compte, jamais un ordre. Tout chiffre cité existe dans la carte (score, réaction mesurée, nombre de sources).
   Réponses vocales : « Quoi de neuf d'important ? », « Qu'est-ce que Trump a dit aujourd'hui ? », « Qu'est-ce qui peut faire bouger l'or cette semaine ? ». */
import { aLaUne, lignesPersonnes, titreCourt, tableauSources } from './etat.js';
import { PERSONNES, NOMS_COURTS, NOMS_ACTIFS, SUJETS } from './config.js';

export const nomSujet = id => (SUJETS.find(s => s.id === id) || {}).nom || id;
export const nomPers = (id, personnes = PERSONNES) => { const p = personnes.find(x => x.id === id); return p ? (p.court || p.nom) : id; };
export function ageParle(t, now = Date.now()) { const m = Math.max(0, Math.round((now - t) / 60e3)); if (m < 1) return 'à l’instant'; if (m < 60) return `il y a ${m} minute${m > 1 ? 's' : ''}`; const h = Math.round(m / 60); if (h < 24) return `il y a ${h} heure${h > 1 ? 's' : ''}`; const j = Math.round(h / 24); return `il y a ${j} jour${j > 1 ? 's' : ''}`; }
export const heureParisCourte = t => new Date(t).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }).replace(':', ' h ');
const actifsTxt = c => (c.actifs.length ? c.actifs.map(a => NOMS_ACTIFS[a]).join(', ') : 'aucun de mes actifs');
const reactionTxt = c => (c.reaction && c.reaction.max ? c.reaction.texte.replace(/^le marché a réagi : /, 'le marché a réagi, ') + '. ' : '');

/* « Rayle, explique-moi » : une info, en mots simples */
export function texteExplication(c, { precedents = [], personnes = PERSONNES, now = Date.now() } = {}) {
  const qui = c.personne ? nomPers(c.personne, personnes) : (c.sources[0] ? c.sources[0].nom : 'une source');
  const P = [`${qui} : ${titreCourt(c.titre, 160)}. C’est sorti ${ageParle(c.t, now)}, repris par ${c.sources.length} source${c.sources.length > 1 ? 's' : ''}.`];
  P.push(c.sujets.length ? `Le sujet : ${nomSujet(c.sujets[0])}. Actifs concernés : ${actifsTxt(c)}.` : `Aucun sujet de marché précis ne ressort. Actifs concernés : ${actifsTxt(c)}.`);
  P.push(reactionTxt(c) || (c.reaction && c.reaction.attente ? 'La réaction du marché est en cours de mesure. ' : ''));
  for (const p of precedents.slice(0, 2)) if (p && p.n >= 3) P.push(p.texte);
  P.push(`Importance ${c.score} sur 100. C’est une hypothèse de lecture, pas un signal : à confirmer sur le graphique avant toute décision, qui reste la tienne.`);
  return P.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}
/* demande envoyée à l'IA (≥ 70 seulement) : deux scénarios courts, jamais un ordre */
export function promptScenarios(c, { precedents = [] } = {}) {
  return `Info : « ${titreCourt(c.titre, 220)} » (${c.sources.map(s => s.nom).slice(0, 4).join(', ')}, ${new Date(c.t).toISOString().slice(0, 16).replace('T', ' ')} UTC). Actifs concernés : ${actifsTxt(c)}. ${c.reaction && c.reaction.max ? 'Réaction mesurée : ' + c.reaction.texte + '. ' : ''}${precedents.filter(p => p && p.n >= 3).map(p => p.texte).join(' ')}
Écris EXACTEMENT 2 scénarios courts (2 phrases chacun) : « Scénario 1 : … » puis « Scénario 2 : … ». Pour chacun : les actifs concernés, le sens possible, ce qui le CONFIRMERAIT et ce qui l’ANNULERAIT. Formule des hypothèses (« si… alors… »), sans probabilité chiffrée, sans ordre d’achat ou de vente, sans conseil de position.`;
}
export const phraseScenariosRegles = (c, expliquer) => c.actifs.slice(0, 3).map(a => { try { return expliquer({ titre: c.titre, resume: c.resume || '' }, a); } catch (e) { return null; } }).filter(x => x && x.texte).map((x, i) => `Lecture ${i + 1} : ${x.texte}`);

/* ───── réponses vocales (sans IA : lues directement dans l'état) ───── */
export function quoiDeNeuf(etat, now = Date.now(), { n = 3 } = {}) {
  const U = aLaUne(etat, now, n); if (!U.length) return 'Rien d’important pour le moment dans mes sources.';
  return `Voici les ${U.length > 1 ? U.length + ' infos' : 'info'} les plus importantes des dernières 24 heures. ` + U.map((c, i) => `${i + 1}. ${titreCourt(c.titre, 130)}, importance ${c.score} sur 100, ${ageParle(c.t, now)}. ${reactionTxt(c)}`.trim()).join(' ');
}
export function dernieresDe(etat, id, now = Date.now(), { personnes = PERSONNES, n = 3 } = {}) {
  const nom = nomPers(id, personnes), L = etat.cartes.filter(c => c.personne === id && c.t >= now - 24 * 3600e3).sort((a, b) => b.t - a.t).slice(0, n);
  if (!L.length) { const d = etat.cartes.filter(c => c.personne === id).sort((a, b) => b.t - a.t)[0]; return d ? `${nom} n’a rien dit de marquant aujourd’hui. Sa dernière déclaration relevée date de ${ageParle(d.t, now)} : ${titreCourt(d.titre, 130)}.` : `Je n’ai relevé aucune déclaration de ${nom} sur les dernières 72 heures.`; }
  const fil = L[0].fil ? etat.fils.find(f => f.id === L[0].fil) : null;
  return `${nom} aujourd’hui : ` + L.map(c => `${titreCourt(c.titre, 130)} (${heureParisCourte(c.t)}, importance ${c.score})${c.reaction && c.reaction.max ? ', ' + c.reaction.texte.replace(/^le marché a réagi : /, 'le marché a réagi, ') : ''}`).join(' ; ') + '.' + (fil && fil.revirement ? ' Attention : il y a eu un revirement dans ce fil d’histoire.' : '');
}
export function faitBougerActif(etat, actif, now = Date.now(), { evenements = [], n = 3, semaineMs = 7 * 86400e3 } = {}) {
  const L = etat.cartes.filter(c => c.actifs.includes(actif) && c.t >= now - 3 * 86400e3).sort((a, b) => b.score - a.score).slice(0, n), ev = evenements.filter(e => e.t > now && e.t < now + semaineMs && e.impact === 'fort' && e.pays === 'USD').slice(0, 4), nom = NOMS_ACTIFS[actif] || actif, P = [];
  if (L.length) P.push(`Côté actualité, pour ${nom} : ` + L.map(c => `${titreCourt(c.titre, 120)} (importance ${c.score})`).join(' ; ') + '.'); else P.push(`Je ne vois pas d’actualité marquante pour ${nom} sur les trois derniers jours.`);
  if (ev.length) P.push('Au calendrier cette semaine : ' + ev.map(e => `${e.titre} le ${new Date(e.t).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', hour: '2-digit', minute: '2-digit' }).replace(':', ' h ')}`).join(', ') + '.');
  return P.join(' ');
}
/* briefing du matin : les 3 infos clés + les annonces du jour */
export function briefingReseau(etat, evenements = [], now = Date.now()) {
  const U = aLaUne(etat, now, 3), jour = t => new Date(t).toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' }), auj = jour(now), ev = evenements.filter(e => jour(e.t) === auj && e.impact === 'fort' && e.pays === 'USD').slice(0, 4), P = [];
  P.push(U.length ? 'Les infos clés : ' + U.map((c, i) => `${i + 1}. ${titreCourt(c.titre, 110)} (importance ${c.score})`).join(' ; ') + '.' : 'Pas d’info majeure dans mes sources depuis hier.');
  P.push(ev.length ? 'Annonces du jour : ' + ev.map(e => `${e.titre} à ${heureParisCourte(e.t)}`).join(', ') + '.' : 'Pas d’annonce américaine majeure aujourd’hui.');
  return P.join(' ');
}
/* reconnaissance de la demande parlée → { type, ... } ou null */
const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'`]/g, ' ').replace(/\s+/g, ' ').trim();
export function intentionReseau(texte, personnes = PERSONNES) {
  const n = norm(texte);
  if (/\b(quoi de neuf|quoi de nouveau|des nouvelles|actu(alite)? importante|qu est ce qui se passe sur les marches|infos? importantes?)\b/.test(n)) return { type: 'neuf' };
  const qui = personnes.find(p => p.alias.concat([p.nom.toLowerCase(), (p.court || '').toLowerCase()]).filter(Boolean).some(a => n.includes(norm(a)) && norm(a).length > 3));
  if (qui && /\b(a dit|dit|declar|annonce|tweet|poste|publie|truth|aujourd hui|que fait|raconte)\b/.test(n)) return { type: 'personne', id: qui.id };
  const m = /\b(faire bouger|peut faire bouger|va faire bouger|fait bouger)\b.*\b(or|gold|nasdaq|s ?p ?500|bitcoin|btc|solana|sol|petrole|dollar|dxy)\b/.exec(n);
  if (m) { const k = m[2]; const id = /^(or|gold)$/.test(k) ? 'or' : k === 'nasdaq' ? 'us100' : /^s ?p/.test(k) ? 'us500' : /^(bitcoin|btc)$/.test(k) ? 'btc' : /^(solana|sol)$/.test(k) ? 'sol' : k === 'petrole' ? 'petrole' : 'dxy'; return { type: 'actif', id }; }
  return null;
}
export function reponseReseau(texte, etat, { now = Date.now(), personnes = PERSONNES, evenements = [] } = {}) {
  const I = intentionReseau(texte, personnes); if (!I) return null; if (!etat || !etat.cartes || !etat.cartes.length) return 'Je n’ai pas encore lu mon réseau d’information : il est vide ou injoignable pour le moment.';
  if (I.type === 'neuf') return quoiDeNeuf(etat, now); if (I.type === 'personne') return dernieresDe(etat, I.id, now, { personnes }); return faitBougerActif(etat, I.id, now, { evenements });
}
export { lignesPersonnes, tableauSources };
