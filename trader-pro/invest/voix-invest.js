/* ═════════════ VOIX DE RAYLE POUR L'INVESTISSEMENT (module PUR, testé) ═════════════
   « Rayle, montre-moi les actions européennes attractives sur 1 à 3 ans hors méga-caps »
   « quelle est la saisonnalité de LVMH d'août à décembre ? »    « pourquoi Airbus est neutre ? »
   `intentionInvest(texte)` reconnaît la demande ; `repondreInvest(texte, API)` compose la réponse parlée à partir des vraies données (API injectée : testée avec de fausses données).
   Réponses courtes, chiffrées, jamais d'ordre ni de conseil ; sans donnée, Rayle le dit. */
import { verdictLigne, pourquoi, HORIZONS, LIBELLES } from './modele.js';
import { statsFenetre, meilleuresFenetres, decoder, libelleFenetre, fenetreDefaut } from './saison.js';
import { trouverInstrument } from './donnees-invest.js';

export const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'`]/g, ' ').replace(/[^a-z0-9%.&-]+/g, ' ').replace(/\s+/g, ' ').trim();
const MOIS_N = { janvier: 1, janv: 1, fevrier: 2, fevr: 2, mars: 3, avril: 4, avr: 4, mai: 5, juin: 6, juillet: 7, juil: 7, aout: 8, septembre: 9, sept: 9, octobre: 10, oct: 10, novembre: 11, nov: 11, decembre: 12, dec: 12 };
const RE_MOIS = '(janvier|janv|fevrier|fevr|mars|avril|avr|mai|juin|juillet|juil|aout|septembre|sept|octobre|oct|novembre|nov|decembre|dec)';
export function parserFenetre(n) {
  const m = new RegExp('(?:de |d |du |en |depuis )?' + RE_MOIS + '\\b.{0,12}?\\b(?:a|au|jusqu a|jusqu au|->|et|puis|vers)\\b ?(?:fin |la fin de |fin d |debut |le |l |de |d )?' + RE_MOIS + '\\b').exec(n);
  if (m) return { a: MOIS_N[m[1]], b: MOIS_N[m[2]] };
  const u = new RegExp('\\b' + RE_MOIS + '\\b').exec(n); return u ? { a: MOIS_N[u[1]], b: MOIS_N[u[1]] } : null;
}
const ZONES = [[/\b(europe|europeen(ne)?s?)\b/, { zone: 'Europe' }], [/\b(americain(e)?s?|us|etats unis|wall street)\b/, { zone: 'US' }], [/\b(francais(e)?s?|france|paris)\b/, { pays: 'FR' }], [/\b(allemand(e)?s?|allemagne)\b/, { pays: 'DE' }], [/\b(britannique|anglais(e)?s?|royaume uni)s?\b/, { pays: 'UK' }], [/\b(espagnol(e)?s?|espagne)\b/, { pays: 'ES' }], [/\b(italien(ne)?s?|italie)\b/, { pays: 'IT' }], [/\b(suisse)s?\b/, { pays: 'CH' }], [/\b(neerlandais(e)?s?|hollandais(e)?s?|pays bas)\b/, { pays: 'NL' }]];
const CLASSES_V = [[/\betf\b/, 'ETF'], [/\bdevises?\b|\bforex\b/, 'devise'], [/\bindices?\b/, 'indice'], [/\bmatieres? premieres?\b/, 'matière première'], [/\bcryptos?\b|\bcryptomonnaies?\b/, 'crypto'], [/\bobligations?\b|\bobligataires?\b|\btaux\b/, 'obligataire'], [/\bactions?\b|\bsocietes?\b|\bentreprises?\b/, 'action']];
export function horizonDe(n) {
  if (/\b(5 a 10 ans|cinq a dix ans|long terme|tres long terme|retraite)\b/.test(n)) return 'long'; if (/\b(1 a 3 ans|un a trois ans|moyen terme|2 ans|3 ans)\b/.test(n)) return 'moyen';
  if (/\b(court terme|tactique|quelques jours|1 a 10 jours|cette semaine|day|scalp)\b/.test(n)) return 'tactique'; if (/\b(swing|saisonni\w+|1 a 6 mois|quelques mois)\b/.test(n)) return 'swing'; return null;
}
export function intentionInvest(texte) {
  const n = norm(texte).replace(/^(hey |dis moi |dis )?rayle /, ''); if (!n) return null;
  /* pourquoi X est neutre / attractif… */
  let m = /\bpourquoi\b (.+?) (?:est|etait|reste|serait|est il|est elle|c est|passe|devient) ?(?:donc )?(neutre|tres attractive?|attractive?|peu attractive?|a eviter|pas attractive?|cher|chere|bon marche)?\s*(?:sur .+)?$/.exec(n);
  if (m && m[1] && !/\b(portefeuille|resultat|risque|erreur)\b/.test(m[1])) return { type: 'pourquoi', nom: m[1].replace(/^(l |la |le |les |l action |l entreprise |la societe |l etf )/, '').trim(), horizon: horizonDe(n) };
  m = /\b(?:explique|expliquer|justifie)\b.*\b(?:verdict|score|note)\b (?:de |d |du |sur )?(.+)$/.exec(n); if (m) return { type: 'pourquoi', nom: m[1].replace(/^(l |la |le |les )/, '').trim(), horizon: horizonDe(n) };
  /* saisonnalité de X d'août à décembre */
  if (/\bsaisonnalite|saisonnier|saisonniere\b/.test(n) && !/\b(actions?|societes?) .*\b(attractif|saisonni)/.test(n) || /\bsaisonnalite\b/.test(n)) {
    const f = parserFenetre(n); let q = /\bsaisonnalite\b ?(?:de |d |du |des |pour |sur |chez )?(.+?)(?: (?:de|d|du|en|depuis|entre|sur|a|au)\b ?(?:janvier|janv|fevrier|fevr|mars|avril|avr|mai|juin|juillet|juil|aout|septembre|sept|octobre|oct|novembre|nov|decembre|dec)\b.*)?$/.exec(n);
    const nom = q ? q[1].replace(/^(l |la |le |les )/, '').trim() : ''; if (nom && !/^(du mois|de ce mois|actuelle)$/.test(nom)) return { type: 'saison', nom, fenetre: f };
    return { type: 'liste', spec: { horizon: 'swing', filtre: { classe: 'action', saisonSignificative: true, liqMin: 5 }, verdict: '', fenetreMois: true }, libelle: 'les meilleures opportunités saisonnières du mois' };
  }
  const m2 = /^(.+?) d (janvier|janv|fevrier|fevr|mars|avril|avr|mai|juin|juillet|juil|aout|septembre|sept|octobre|oct|novembre|nov|decembre|dec)\b/.exec(n);   // « LVMH d'août à décembre »
  if (m2 && /\b(?:saison|fenetre)\b/.test(n)) return { type: 'saison', nom: m2[1].replace(/^(quelle est la |la )/, '').trim(), fenetre: parserFenetre(n) };
  /* montre-moi les actions … attractives */
  const attr = /\btres attractive?s?\b/.test(n) ? LIBELLES.TRES : /\bpeu attractive?s?\b/.test(n) ? LIBELLES.PEU : /\ba eviter\b|\bsurevaluee?s?\b/.test(n) ? LIBELLES.EVITER : /\battractive?s?\b|\bpepites?\b|\bopportunites?\b/.test(n) ? 'ATTRACTIF+' : /\bneutres?\b/.test(n) ? LIBELLES.NEUTRE : null;
  if ((attr || /\b(hors|sans) (les )?(mega|geantes)/.test(n)) && /\b(montre|affiche|donne|liste|trouve|cherche|quelles?|quels?|filtre|ouvre)\b/.test(n)) {
    const spec = { horizon: horizonDe(n) || 'moyen', filtre: {}, verdict: '' }; let lib = 'instruments';
    for (const [re, c] of CLASSES_V) if (re.test(n)) { spec.filtre.classe = c; lib = c === 'action' ? 'actions' : c === 'ETF' ? 'ETF' : c === 'devise' ? 'devises' : c === 'indice' ? 'indices' : c === 'matière première' ? 'matières premières' : c === 'crypto' ? 'cryptos' : 'instruments obligataires'; break; }
    if (!spec.filtre.classe) spec.filtre.classe = 'action', lib = 'actions';
    for (const [re, z] of ZONES) if (re.test(n)) Object.assign(spec.filtre, z);
    if (/\b(hors|sans) (les )?(mega|geantes?|tres grandes?)/.test(n)) spec.filtre.exclureMega = true; if (/\bpea\b/.test(n)) spec.filtre.pea = true;
    if (/\bpetites? (caps?|capitalisations?)\b/.test(n)) spec.filtre.caps = ['petite']; if (/\bmoyennes? (caps?|capitalisations?)\b/.test(n)) spec.filtre.caps = ['moyenne'];
    spec.verdict = attr && attr !== 'ATTRACTIF+' ? attr : ''; spec.attractifs = attr === 'ATTRACTIF+'; if (spec.attractifs) spec.filtre.scoreMin = 58; if (/\bpepites?\b/.test(n)) { spec.filtre.qMin = 60; spec.filtre.exclureMega = true; }
    return { type: 'liste', spec, libelle: lib };
  }
  return null;
}
const nomCourt = n => String(n || '').split(/[,(]/)[0].replace(/ (SE|SA|AG|NV|N\.V\.|plc|PLC|Inc\.?|Corporation|Corp\.?|Company|Holding|Holdings|S\.p\.A\.|Ltd\.?|AB|ASA|A\/S|Oyj)$/i, '').trim();
const nf = (v, d = 0) => (Number.isFinite(v) ? v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/[  ]/g, ' ') : '?');
const signe = v => (v >= 0 ? 'plus ' : 'moins ') + nf(Math.abs(v * 100), 1) + ' pour cent';
const NOM_H = { tactique: 'tactique', swing: 'swing', moyen: '1 à 3 ans', long: '5 à 10 ans' };
const MOIS_PAR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const phraseFenetre = (a, b) => (a === b ? `en ${MOIS_PAR[a - 1]}` : `de ${/^[aeiouhéèêâ]/i.test(MOIS_PAR[a - 1]) ? 'd’' : ''}${MOIS_PAR[a - 1]} à ${MOIS_PAR[b - 1]}`.replace('de d’', 'd’'));
/* API : { lignes(classes), saison(classes), piloter(spec) → { total, premiers }, horizon() } */
export async function repondreInvest(texte, API, { maintenant = Date.now() } = {}) {
  const I = intentionInvest(texte); if (!I) return null;
  try {
    if (I.type === 'liste') {
      const spec = { ...I.spec }; if (spec.fenetreMois) spec.fenetre = fenetreDefaut(maintenant); const r = await API.piloter({ ...spec, reinitialiser: true, filtre: spec.filtre });
      if (!r || !r.total) return `Je n’ai trouvé aucun ${I.libelle.replace(/s$/, '')} qui corresponde à ces critères.`;
      const L = (r.premiers || []).slice(0, 3).map(p => `${nomCourt(p.nom)}, ${p.lib.toLowerCase()}${Number.isFinite(p.score) ? ' ' + Math.round(p.score) : ''}`).join(' ; ');
      return `J’affiche ${r.total} ${I.libelle} sur l’horizon ${NOM_H[spec.horizon]}${spec.attractifs ? ', les plus attractifs d’abord' : ''}. En tête : ${L}. Ce n’est pas un conseil d’investissement.`;
    }
    const lignes = await API.lignes(['action', 'ETF', 'devise', 'indice', 'matière première', 'crypto']), l = trouverInstrument(lignes, I.nom);
    if (!l) return `Je ne trouve pas « ${I.nom} » dans l’univers XTB.`;
    if (I.type === 'pourquoi') {
      const h = I.horizon || API.horizon(), ajust = API.ajust ? await API.ajust() : {}, v = verdictLigne(l, h, { ajust }), P = pourquoi(l, v);
      return `${nomCourt(l.n)} est ${v.lib.toLowerCase()} sur l’horizon ${NOM_H[h]}${Number.isFinite(v.score) ? ', score ' + Math.round(v.score) + ' sur 100' : ''}, confiance ${v.confLib}. ${P.join(' ')} Ce n’est pas un conseil.`;
    }
    if (I.type === 'saison') {
      const { encodes, ref } = await API.saison(['action', 'ETF', 'devise', 'indice', 'matière première', 'crypto']), e = encodes[l.id]; if (!e) return `Je n’ai pas l’historique mensuel de ${nomCourt(l.n)}.`;
      const M = decoder(e), Mb = ref && ref[l.p] ? decoder(ref[l.p]) : null, nom = nomCourt(l.n);
      if (!I.fenetre) { const b = meilleuresFenetres(M, Mb, 1)[0]; if (!b) return `Aucune fenêtre saisonnière ne ressort nettement pour ${nom} : positive au moins 70 pour cent des années sur 10 ans minimum.`; return `La meilleure fenêtre de ${nom} est ${phraseFenetre(b.a, b.b)} : rendement médian ${signe(b.median)}, positive ${Math.round(b.pctPositif * 100)} pour cent des années sur ${b.n} ans. Une saisonnalité passée ne prédit pas l’avenir.`; }
      const s = statsFenetre(M, I.fenetre.a, I.fenetre.b, Mb); if (!s.significatif) return `La saisonnalité de ${nom} ${phraseFenetre(I.fenetre.a, I.fenetre.b)} n’est pas significative : ${s.n} année${s.n > 1 ? 's' : ''} d’historique, il en faut au moins 10.`;
      return `Sur ${s.n} ans, ${nom} ${phraseFenetre(I.fenetre.a, I.fenetre.b)} : rendement médian ${signe(s.median)}, positif ${Math.round(s.pctPositif * 100)} pour cent des années${Number.isFinite(s.excesMedian) ? `, ${s.excesMedian >= 0 ? 'avec' : 'avec'} ${signe(s.excesMedian)} contre son indice` : ''}. La pire année fait ${signe(s.pire)}. Une saisonnalité passée ne prédit pas l’avenir, et ce n’est pas un conseil.`;
    }
  } catch (e) { return 'Je n’ai pas pu lire les données d’investissement : ' + String(e && e.message || e).slice(0, 120); }
  return null;
}
