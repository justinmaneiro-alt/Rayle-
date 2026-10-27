import { CRITERES2 } from './criteres-v2.js';
import { empreinteCriteres } from './criteres.js';

/* ═════════════ PROFIL DE L'AGENT ET CONSIGNES EN LANGAGE CLAIR (M5 ; module pur, testé : m5-profil-test.mjs) ═════════════
   Le profil est un ensemble de CONTRAINTES que l'agent respecte (style, unités de temps, risque par trade, fréquence maximale, règles interdites, objectif de rentabilité, budget de calcul,
   heures de recherche en arrière-plan). Les consignes en français sont lues par des règles simples (aucune IA) et l'interprétation est MONTRÉE avant d'être appliquée.
   Les seuils de VALIDATION (critères) ne sont pas des préférences : les modifier exige une confirmation explicite, crée de nouveaux critères (nouvelle empreinte) et ne s'applique qu'aux
   FUTURES recherches ; une stratégie déjà testée n'est jamais « sauvée » par ce biais (sa variante a déjà consommé son jeu final). */
export const REGLES_INTERDITES = Object.freeze({
  weekend: 'pas de signal le week-end (samedi et dimanche, UTC)', asie: 'pas de signal pendant la session asiatique (0 h à 7 h UTC)', contre_tendance: 'jamais à contre-sens de la phase H1 (achat en baisse, vente en hausse)',
  delta_contre: 'pas de signal quand le delta va à contre-sens du trade', nuit_paris: 'pas de signal entre 23 h et 7 h, heure de Paris (UTC+1 / +2 selon la saison : approximé à 22 h – 6 h UTC)'
});
export const STYLES = Object.freeze({ prudent: { maxParSemaine: 2, risquePct: 0.5 }, equilibre: { maxParSemaine: 3, risquePct: 1 }, dynamique: { maxParSemaine: 5, risquePct: 1 } });
export const PROFIL_DEFAUT = Object.freeze({
  style: 'equilibre', unites: ['m15', 'h1', 'h4'], risquePct: 1, maxParSemaine: 3, maxSimultanees: 1, reposHeures: 4, reglesInterdites: [], capital: 10000,
  objectif: { rNetMin: CRITERES2.objectif.rNetMin, tradesMin: CRITERES2.objectif.tradesMin, rNetHaut: CRITERES2.objectif.rNetHaut }, cible: 3, confirmationTrades: CRITERES2.confirmation.tradesReels,
  budget: { chantiersParTranche: 60, tempsMsParTranche: 60000, charge: 'douce' }, arrierePlan: { actif: false, heureDebut: '22:00', heureFin: '07:00', pauseDansJeu: true, processusJeu: [] },
  notifications: { telegram: true, application: true, hebdo: true }, consignes: ''
});
const clone = o => JSON.parse(JSON.stringify(o));
const borne = (x, a, b) => Math.min(b, Math.max(a, x));

/* Valide et complète un profil (toujours dans les bornes de sécurité : risque ≤ 2 %, 1 à 5 positions par semaine, etc.). */
export function profilValide(brut = {}) {
  const p = { ...clone(PROFIL_DEFAUT), ...clone(brut) };
  p.style = STYLES[p.style] ? p.style : 'equilibre';
  p.unites = (Array.isArray(p.unites) ? p.unites : []).filter(u => ['m15', 'h1', 'h4'].includes(u)); if (!p.unites.length) p.unites = ['m15', 'h1', 'h4'];
  p.risquePct = borne(Number(p.risquePct) || 1, 0.1, 2);
  p.maxParSemaine = Math.round(borne(Number(p.maxParSemaine) || 3, 1, 5)); p.maxSimultanees = Math.round(borne(Number(p.maxSimultanees) || 1, 1, 3));
  p.reposHeures = borne(Number(p.reposHeures) >= 0 ? Number(p.reposHeures) : 4, 0, 48); p.capital = Math.max(100, Number(p.capital) || 10000);
  p.reglesInterdites = [...new Set((p.reglesInterdites || []).filter(r => REGLES_INTERDITES[r]))];
  p.cible = Math.round(borne(Number(p.cible) || 3, 1, 5)); p.confirmationTrades = Math.round(borne(Number(p.confirmationTrades) || 20, 5, 200));
  const o = p.objectif || {}; p.objectif = { rNetMin: Math.max(1, Number(o.rNetMin) || 20), tradesMin: Math.round(Math.max(30, Number(o.tradesMin) || 150)), rNetHaut: Math.max(1, Number(o.rNetHaut) || 30) };
  if (p.objectif.rNetHaut < p.objectif.rNetMin) p.objectif.rNetHaut = p.objectif.rNetMin;
  const b = p.budget || {}; p.budget = { chantiersParTranche: Math.round(borne(Number(b.chantiersParTranche) || 60, 5, 2000)), tempsMsParTranche: Math.round(borne(Number(b.tempsMsParTranche) || 60000, 5000, 600000)), charge: ['douce', 'normale', 'max'].includes(b.charge) ? b.charge : 'douce' };
  const a = p.arrierePlan || {}, heure = h => (/^([01]?\d|2[0-3]):[0-5]\d$/.test(h) ? h : null);
  p.arrierePlan = { actif: !!a.actif, heureDebut: heure(a.heureDebut) || '22:00', heureFin: heure(a.heureFin) || '07:00', pauseDansJeu: a.pauseDansJeu !== false, processusJeu: (Array.isArray(a.processusJeu) ? a.processusJeu : []).map(String).filter(x => /^[\w .-]{1,60}$/.test(x)).slice(0, 30) };
  const n = p.notifications || {}; p.notifications = { telegram: n.telegram !== false, application: n.application !== false, hebdo: n.hebdo !== false };
  p.consignes = String(p.consignes || '').slice(0, 2000);
  return p;
}

/* Est-ce l'heure de chercher en arrière-plan ? (heures locales du PC ; fenêtre qui peut passer minuit). */
export function dansLesHeures(profil, date = new Date()) {
  const a = profil.arrierePlan; if (!a.actif) return false;
  const m = (date.getHours() * 60 + date.getMinutes()), h = s => { const [x, y] = s.split(':').map(Number); return x * 60 + y; }, d = h(a.heureDebut), f = h(a.heureFin);
  return d === f ? true : d < f ? m >= d && m < f : m >= d || m < f;
}

/* ── Lecture des consignes en français : rend { patch, comprises:[{texte, effet}], nonComprises:[phrases], seuils:{…} si l'utilisatrice demande de changer l'objectif (NÉCESSITE confirmation) } ── */
const num = s => Number(String(s).replace(',', '.'));
const MOTS = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5 };
const nombreMot = s => (MOTS[s] != null ? MOTS[s] : num(s));
export function lireConsignes(texte) {
  const comprises = [], patch = {}, nonComprises = [], seuils = {}, interdites = new Set();
  const phrases = String(texte || '').split(/[.;\n]+/).map(s => s.trim()).filter(Boolean);
  for (const brute of phrases) {
    const s = brute.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); let m, reconnu = false;
    const ok = (effet) => { comprises.push({ texte: brute, effet }); reconnu = true; };
    if (/(pas|jamais|aucun|interdit|evite)\b.*\b(week-?end|samedi|dimanche)/.test(s)) { interdites.add('weekend'); ok('Interdit : ' + REGLES_INTERDITES.weekend); }
    if (/(pas|jamais|aucun|interdit|evite)\b.*\b(asie|asiatique|nuit)/.test(s)) { interdites.add(/nuit/.test(s) && !/asie/.test(s) ? 'nuit_paris' : 'asie'); ok('Interdit : ' + REGLES_INTERDITES[/nuit/.test(s) && !/asie/.test(s) ? 'nuit_paris' : 'asie']); }
    if (/(pas|jamais|aucun|interdit|evite)\b.*contre[- ]?(tendance|sens)/.test(s)) { interdites.add('contre_tendance'); ok('Interdit : ' + REGLES_INTERDITES.contre_tendance); }
    if (/(pas|jamais|interdit)\b.*delta.*(contre|oppose)/.test(s)) { interdites.add('delta_contre'); ok('Interdit : ' + REGLES_INTERDITES.delta_contre); }
    if ((m = s.match(/(?:au plus|maximum|max|pas plus de|jusqu a)\s+(un|une|deux|trois|quatre|cinq|\d)\s+(?:position|trade|signal)s?\s+par\s+semaine/))) { patch.maxParSemaine = Math.round(borne(nombreMot(m[1]), 1, 5)); ok('Fréquence maximale : ' + patch.maxParSemaine + ' position(s) par semaine (limite de sécurité : 1 à 5)'); }
    if ((m = s.match(/(?:une seule|pas plus d une)\s+position\s+a\s+la\s+fois/))) { patch.maxSimultanees = 1; ok('Une seule position à la fois'); }
    if ((m = s.match(/(?:risque|risquer)\s*(?:de\s*)?(\d+(?:[.,]\d+)?)\s*%/))) { patch.risquePct = borne(num(m[1]), 0.1, 2); ok('Risque par trade : ' + patch.risquePct + ' % du capital (limite de sécurité : 0,1 à 2 %)'); }
    if ((m = s.match(/(?:uniquement|seulement|que)\s+(?:en\s+)?((?:m15|h1|h4)(?:\s*(?:,|et|ou)\s*(?:m15|h1|h4))*)/))) { patch.unites = [...new Set(m[1].match(/m15|h1|h4/g))]; ok('Unités de temps : ' + patch.unites.map(u => u.toUpperCase()).join(', ')); }
    if (/\b(prudent|prudence|tranquille)\b/.test(s)) { patch.style = 'prudent'; Object.assign(patch, STYLES.prudent); ok('Style prudent : 2 positions par semaine au plus, risque 0,5 %'); }
    else if (/\b(dynamique|agressif|offensif)\b/.test(s)) { patch.style = 'dynamique'; Object.assign(patch, STYLES.dynamique); ok('Style dynamique : jusqu’à 5 positions par semaine'); }
    else if (/\b(equilibre)\b/.test(s)) { patch.style = 'equilibre'; Object.assign(patch, STYLES.equilibre); ok('Style équilibré'); }
    if ((m = s.match(/objectif\s*(?:de\s*)?\+?\s*(\d+(?:[.,]\d+)?)\s*r\b(?:.*?(?:sur|avec)\s*(?:au moins\s*)?(\d+)\s*trades?)?/))) { seuils.rNetMin = num(m[1]); if (m[2]) seuils.tradesMin = Number(m[2]); ok('Objectif de rentabilité : +' + seuils.rNetMin + ' R' + (seuils.tradesMin ? ' sur ' + seuils.tradesMin + ' trades' : '') + ' — CHANGEMENT DE SEUIL : demande une confirmation, ne vaut que pour les futures recherches'); }
    if ((m = s.match(/(\d)\s+strategies?/))) { patch.cible = Math.round(borne(num(m[1]), 1, 5)); ok('Objectif : ' + patch.cible + ' stratégie(s) validée(s) avant de ralentir (1 à 5)'); }
    if (!reconnu) nonComprises.push(brute);
  }
  if (interdites.size) patch.reglesInterdites = [...interdites];
  return { patch, comprises, nonComprises, seuils: Object.keys(seuils).length ? seuils : null };
}

/* ── Critères en vigueur d'après le profil ── */
export function criteresDepuisProfil(profil) {
  const o = profil.objectif;
  const modif = o.rNetMin !== CRITERES2.objectif.rNetMin || o.tradesMin !== CRITERES2.objectif.tradesMin || o.rNetHaut !== CRITERES2.objectif.rNetHaut || profil.confirmationTrades !== CRITERES2.confirmation.tradesReels;
  if (!modif) return CRITERES2;
  return Object.freeze({ ...CRITERES2, modifie: true, objectif: Object.freeze({ ...o }), horsEchantillon: Object.freeze({ ...CRITERES2.horsEchantillon, tradesMin: Math.max(o.tradesMin, 30) }), confirmation: Object.freeze({ tradesReels: profil.confirmationTrades }) });
}
/* Compare deux jeux de critères : rend { assoupli:[…], durci:[…] } en français. Sert à l'avertissement avant de confirmer. */
export function comparerCriteres(avant, apres) {
  const assoupli = [], durci = [], f = (nom, a, b, plusHautEstPlusStrict) => { if (a === b) return; ((b < a) === plusHautEstPlusStrict ? assoupli : durci).push(nom + ' : ' + a + ' → ' + b); };
  f('Gain net minimal hors échantillon (R)', avant.objectif.rNetMin, apres.objectif.rNetMin, true); f('Trades minimum hors échantillon', avant.objectif.tradesMin, apres.objectif.tradesMin, true); f('Objectif haut (R)', avant.objectif.rNetHaut, apres.objectif.rNetHaut, true);
  f('Trades en direct pour être CONFIRMÉE', avant.confirmation.tradesReels, apres.confirmation.tradesReels, true);
  return { assoupli, durci, empreinteAvant: empreinteCriteres(avant), empreinteApres: empreinteCriteres(apres) };
}
export function avertissementSeuils(cmp) {
  if (!cmp.assoupli.length && !cmp.durci.length) return 'Aucun changement de seuil.';
  return (cmp.assoupli.length ? 'ATTENTION : ces changements ASSOUPLISSENT la validation : ' + cmp.assoupli.join(' ; ') + '. Des stratégies dues au hasard deviennent plus faciles à valider. ' : '') + (cmp.durci.length ? 'Ces changements durcissent la validation : ' + cmp.durci.join(' ; ') + '. ' : '') +
    'Ils ne s’appliquent qu’aux FUTURES recherches (la recherche repart du début, le compteur de variantes est conservé) ; aucune stratégie existante n’est revalidée ni sauvée, et une variante déjà passée au jeu final n’y repasse pas.';
}

/* ── Contraintes appliquées aux signaux (recherche ET direct : ce qui est validé respecte les règles interdites) ── */
export function appliquerContraintes(ctx, signaux, profil) {
  const interdites = profil && profil.reglesInterdites || []; if (!interdites.length) return signaux;
  const n = ctx.n, t = ctx.m15.t, sens = signaux.sens, set = new Set(interdites);
  for (let i = 0; i < n; i++) {
    const s = sens[i]; if (!s) continue;
    const jour = Math.floor(t[i] / 86400e3 + 4) % 7, h = (t[i] % 86400e3) / 3600e3, ph = ctx.h1.phase[i];
    if ((set.has('weekend') && (jour === 0 || jour === 6)) || (set.has('asie') && h < 7) || (set.has('nuit_paris') && (h >= 22 || h < 6)) || (set.has('contre_tendance') && ((ph === 1 && s < 0) || (ph === 2 && s > 0))) || (set.has('delta_contre') && s * ctx.delta15[i] < 0)) sens[i] = 0;
  }
  return signaux;
}
/* Une règle du laboratoire est-elle compatible avec les unités de temps autorisées ? (les familles d'origine sont en M15 avec contexte H1 / H4). */
export function uniteAutorisee(variante, profil) {
  const u = new Set(profil.unites); if (variante.famille !== 'regle') return u.has('m15');
  const tfs = new Set(); for (const c of variante.params.conditions) if (c.tf) tfs.add(c.tf); if (variante.params.stop.tf) tfs.add(variante.params.stop.tf);
  if (!tfs.size) return u.has('m15'); return [...tfs].every(tf => u.has(tf));
}
