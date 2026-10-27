import { strategieVide, validerStrategie } from './strategie-ms.js';

/* ═════════════ LECTURE LOCALE D'UN TEXTE FRANÇAIS (V1 ; module pur, SANS IA, testé : ms-texte-test.mjs) ═════════════
   « achète quand le RSI H1 passe sous 30 et que le prix est au-dessus de l'EMA 200, stop 1,5 ATR, objectif 2 R » → des blocs.
   C'est une aide : elle liste ce qu'elle a compris (`compris`), ce qu'elle n'a pas compris (`nonCompris`) et les choix par défaut (`avertissements`) ; la stratégie obtenue n'est JAMAIS appliquée avant que
   l'utilisatrice relise et valide la description (strategie-ms.js). La traduction par l'IA (route /agent/idee du Worker) n'a lieu qu'à sa demande ; le résultat passe par la même validation.
   Les valeurs sont lues comme on les dit du MARCHÉ (« RSI au-dessus de 70 ») ; pour une stratégie à la vente seulement, elles sont converties dans le « sens du trade » du laboratoire. */
const norm = t => String(t == null ? '' : t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/œ/g, 'oe').replace(/['’`]/g, ' ').replace(/[-–—]/g, ' ').replace(/(\d),(\d)/g, '$1.$2').replace(/\s+/g, ' ').trim();
const nb = x => { const v = Number(String(x).replace(',', '.')); return Number.isFinite(v) ? v : null; };
const TF = [[/\b(?:m15|15 ?min(?:utes?)?|quinze minutes)\b/, 'm15'], [/\b(?:h4|4 ?h(?:eures?)?|quatre heures)\b/, 'h4'], [/\b(?:h1|1 ?h(?:eure)?|une heure|60 ?min(?:utes?)?)\b/, 'h1']];
const tfDe = (s, defaut = 'h1') => { for (const [re, tf] of TF) if (re.test(s)) return tf; return defaut; };
const SESSIONS = [[/\b(?:asie|asiatique)\b/, 0], [/\blondres\b|\beurop/, 1], [/\bnew york\b|\bny\b|\bamerica|\bus\b/, 2], [/\bcreux\b|\bfin de journee\b/, 3]];
const BAS = '(?:sous|inferieur[e]?|<|en dessous|au dessous|moins|descend sous|passe sous|repasse sous|baisse sous)', HAUT = '(?:au dessus|superieur[e]?|>|plus de|depasse|passe au dessus|monte au dessus|repasse au dessus)';

/* Convertit « vu du marché » en « sens du trade » : seulement pour une stratégie à la vente seule (les-deux et long gardent le sens du texte ; le moteur reflète pour les ventes). */
const versSensTrade = (cote, c) => {
  if (cote !== 'short') return c;
  if (c.type === 'rsi') return { ...c, op: c.op === '<' ? '>' : '<', seuil: 100 - c.seuil };
  if (c.type === 'ema') return { ...c, position: c.position === 'avec' ? 'contre' : 'avec' };
  return c;
};

function detecterConditions(clause, cote, notes) {
  const out = [], dit = [];
  // RSI
  for (const m of clause.matchAll(/rsi/g)) {
    const w = clause.slice(m.index, m.index + 90), per = /^rsi ?\(?(\d{1,2})\)? ?(?:en |sur |de )?(?:m15|h1|h4|[0-9]+ ?h|une heure|quatre heures|15 ?min)?[^0-9]*[0-9]/.exec(w);
    const bas = new RegExp(BAS + '[^0-9]{0,14}(\\d{1,2}(?:\\.\\d)?)').exec(w), haut = new RegExp(HAUT + '[^0-9]{0,14}(\\d{1,2}(?:\\.\\d)?)').exec(w);
    const sel = (bas && (!haut || bas.index < haut.index)) ? ['<', bas[1]] : haut ? ['>', haut[1]] : null;
    if (!sel) continue;
    const seuil = nb(sel[1]); let periode = per ? nb(per[1]) : 14; if (!(periode >= 5 && periode <= 30)) periode = 14;
    const lit = { type: 'rsi', tf: tfDe(w), periode, op: sel[0], seuil };
    out.push(versSensTrade(cote, lit)); dit.push('RSI ' + periode + ' en ' + lit.tf.toUpperCase() + (sel[0] === '<' ? ' sous ' : ' au-dessus de ') + seuil);
  }
  // prix par rapport à une moyenne mobile
  for (const m of clause.matchAll(/(au dessus|sous|en dessous|au dessous|repasse sous|passe sous|passe au dessus|repasse au dessus)[^a-z0-9]{0,6}(?:de |du |d |des )?(?:la |l |le )?(?:ema|sma|ma|mm|moyenne(?: mobile)?(?: exponentielle)?)\b ?(?:de |a |sur )?(\d{1,3})?/g)) {
    const w = clause.slice(m.index, m.index + 70), dessus = /au dessus|passe au dessus|repasse au dessus/.test(m[1]); let p = m[2] ? nb(m[2]) : 50;
    if (!(p >= 10 && p <= 200)) { notes.avertissements.push('Moyenne mobile ' + m[2] + ' hors des bornes (10 à 200) : 50 utilisée.'); p = 50; }
    if (/\bsma\b|simple/.test(w)) notes.avertissements.push('Moyenne simple demandée : le moteur utilise l’EMA (moyenne exponentielle).');
    const lit = { type: 'ema', tf: tfDe(w), periode: Math.round(p), position: dessus ? 'avec' : 'contre' };
    out.push(versSensTrade(cote, lit)); dit.push('prix ' + (dessus ? 'au-dessus' : 'en dessous') + ' de l’EMA ' + Math.round(p) + ' en ' + lit.tf.toUpperCase());
  }
  // cassure
  const ca = /cassure (?:du |de |d )?(?:plus )?(haut|bas)(?: de| des| sur)? ?(\d{1,3}) ?(?:bougies?|periodes?)/.exec(clause) || /cassure[^0-9]{0,30}(\d{1,3}) ?(?:bougies?|periodes?)/.exec(clause);
  if (ca) {
    const dir = ca.length === 3 ? ca[1] : null, N = nb(ca.length === 3 ? ca[2] : ca[1]);
    if (N >= 10 && N <= 300) { out.push({ type: 'cassure', tf: tfDe(clause), N: Math.round(N) }); dit.push('cassure du plus ' + (cote === 'short' ? 'bas' : 'haut') + ' de ' + Math.round(N) + ' bougies ' + tfDe(clause).toUpperCase());
      if (dir && ((dir === 'haut' && cote === 'short') || (dir === 'bas' && cote === 'long'))) notes.avertissements.push('Cassure du plus ' + dir + ' avec une stratégie ' + (cote === 'short' ? 'à la vente' : 'à l’achat') + ' : le moteur lit la cassure dans le sens du trade (vers le haut pour un achat, vers le bas pour une vente).'); }
  }
  // volume, delta
  const vo = /volume[^0-9]{0,30}(\d(?:\.\d)?) ?(?:fois|x)/.exec(clause); if (vo && nb(vo[1]) >= 0.5 && nb(vo[1]) <= 5) { out.push({ type: 'volume', min: nb(vo[1]) }); dit.push('volume au moins ' + nb(vo[1]) + ' fois la moyenne'); }
  const de = /delta (positif|acheteur|negatif|vendeur)/.exec(clause); if (de) { const pos = /positif|acheteur/.test(de[1]); out.push({ type: 'delta', sens: (pos === (cote !== 'short')) ? 'avec' : 'contre', ratioMin: 0.1 }); dit.push('delta ' + de[1]); }
  // régime
  if (/\b(?:pas|hors|sans|jamais)\b[^.]{0,28}\brange\b/.test(clause)) { notes.filtres.pasRange = true; dit.push('filtre : pas d’entrée en range'); }
  else if (/tendance haussiere|marche haussier|regime haussier/.test(clause)) { out.push({ type: 'regime', valeurs: ['haussier'] }); dit.push('régime haussier'); }
  else if (/tendance baissiere|marche baissier|regime baissier/.test(clause)) { out.push({ type: 'regime', valeurs: ['baissier'] }); dit.push('régime baissier'); }
  else if (/\bun range\b|\ben range\b|regime range|marche en range|marche lateral/.test(clause)) { out.push({ type: 'regime', valeurs: ['range'] }); dit.push('régime range'); }
  else if (/\bvolatil/.test(clause)) { out.push({ type: 'regime', valeurs: ['volatil'] }); dit.push('régime volatil'); }
  // session, heures
  if (/session/.test(clause)) { const vals = SESSIONS.filter(([re]) => re.test(clause)).map(x => x[1]); if (vals.length) { out.push({ type: 'session', valeurs: vals }); dit.push('session ' + vals.map(x => ['Asie', 'Londres', 'New York', 'creux'][x]).join(' + ')); } }
  const he = /entre (\d{1,2}) ?h(?: ?\d\d)? et (\d{1,2}) ?h/.exec(clause); if (he) { notes.filtres.heures = { de: nb(he[1]), a: nb(he[2]) }; dit.push('filtre : heures ' + he[1] + ' h – ' + he[2] + ' h'); notes.avertissements.push('Les heures sont lues en UTC (heure de Paris = UTC + 1 l’hiver, + 2 l’été).'); }
  // zone de prix
  const zo = /(?:zone|entre) (?:de prix )?(\d[\d ]{2,8}(?:\.\d+)?) (?:et|a|-) (\d[\d ]{2,8}(?:\.\d+)?)(?! ?h)/.exec(clause); if (zo && !he) { const a = nb(zo[1].replace(/ /g, '')), b = nb(zo[2].replace(/ /g, '')); if (a > 0 && b > a) { out.push({ type: 'zoneprix', bas: a, haut: b }); dit.push('prix dans la zone ' + a + ' – ' + b); } }
  return { conditions: out, dit };
}

/* Lit un texte libre. Rend { strategie, compris[], nonCompris[], avertissements[], validation } ; `strategie` est déjà passée par validerStrategie (jamais appliquée sans validation humaine). */
export function lireTexteFrancais(texte) {
  const t = norm(texte), notes = { avertissements: [], filtres: { pasRange: false, heures: null, risqueMaxPct: null } };
  if (!t) return { strategie: null, compris: [], nonCompris: [], avertissements: ['Texte vide.'], validation: null };
  const long = /\b(long|achat|acheter|j achete|achete|position longue|a la hausse)\b/.test(t), court = /\b(short|vendre|vente|vends|position courte|a la baisse)\b/.test(t);
  const cote = long && court ? 'les-deux' : court ? 'short' : long ? 'long' : 'les-deux';
  if (!long && !court) notes.avertissements.push('Côté non précisé : achat et vente. Dis « achète » ou « vends » pour le fixer.');
  const clauses = t.split(/(?<!\d)\.(?!\d)|[;\n]|, | puis | et si | et que | et quand /).map(x => x.trim()).filter(Boolean);
  const s = strategieVide(cote), compris = [], nonCompris = []; let sortieSignal = null;
  if (long || court) compris.push('Côté : ' + (cote === 'les-deux' ? 'achat et vente' : cote === 'long' ? 'achat seulement' : 'vente seulement'));
  for (const cl of clauses) {
    let reconnu = false;
    const estSortie = /\b(sortie|sors|sortir|sortez|ferme|fermer|cloture|clotures?|liquide|prends? mes benefices)\b/.test(cl) && /\b(quand|des que|si|lorsque|apres)\b/.test(cl);
    if (estSortie) {
      const r = detecterConditions(cl.replace(/^.*?\b(quand|des que|si|lorsque)\b/, ''), cote, notes);
      if (r.conditions.length) { sortieSignal = (sortieSignal || []).concat(r.conditions); compris.push('Sortie dès que : ' + r.dit.join(' et ')); reconnu = true; }
    } else {
      const r = detecterConditions(cl, cote, notes);
      if (r.conditions.length) { s.conditions.push(...r.conditions); compris.push('Entrée : ' + r.dit.join(' ; ')); reconnu = true; }
      else if (r.dit.length) { compris.push(r.dit.join(' ; ')); reconnu = true; }
    }
    // stop
    let m = /stop[^0-9a-z]{0,6}(?:a |de |fixe de |fixe a )?(\d(?:\.\d+)?) ?atr/.exec(cl);
    if (m) { s.stop = { type: 'atr', tf: tfDe(cl), k: nb(m[1]) }; compris.push('Stop : ' + nb(m[1]) + ' ATR ' + s.stop.tf.toUpperCase()); reconnu = true; }
    else if ((m = /stop[^0-9a-z]{0,6}(?:a |de |fixe de |fixe a )?(\d(?:\.\d+)?) ?%/.exec(cl))) { s.stop = { type: 'fixe', pct: nb(m[1]) }; compris.push('Stop fixe : ' + nb(m[1]) + ' %'); reconnu = true; }
    else if (/stop[^.]{0,30}(dernier|derniere|sous le|derriere|au dela)[^.]{0,25}(creux|plus bas|sommet|plus haut|swing|structure)/.test(cl)) { s.stop = { type: 'structure', L: 24, pad: 0.3 }; compris.push('Stop : au-delà du dernier creux / sommet (24 bougies M15, marge 0,3 ATR)'); reconnu = true; }
    // sortie : objectif, suiveur
    if ((m = /(?:objectif|cible|tp|take profit|ratio)[^0-9a-z]{0,8}(?:de |a |1 ?[:/] ?)?(\d(?:\.\d+)?) ?r?\b/.exec(cl)) && !estSortie) { s.sortie = { type: 'cible_R', R: nb(m[1]) }; compris.push('Objectif : ' + nb(m[1]) + ' R'); reconnu = true; }
    if (/stop suiveur|trailing|suiveur/.test(cl)) { const k = /(\d(?:\.\d+)?) ?atr/.exec(cl); s.sortie = { type: 'suiveur', k: k ? nb(k[1]) : 3, tf: tfDe(cl) }; compris.push('Sortie : stop suiveur ' + (k ? nb(k[1]) : 3) + ' ATR ' + s.sortie.tf.toUpperCase()); if (!k) notes.avertissements.push('Stop suiveur sans distance : 3 ATR utilisés.'); reconnu = true; }
    if ((m = /risque (?:max(?:imum)?|de|par trade)[^0-9]{0,8}(\d(?:\.\d+)?) ?%/.exec(cl))) { notes.filtres.risqueMaxPct = nb(m[1]); compris.push('Risque maximal : ' + nb(m[1]) + ' %'); reconnu = true; }
    if (!reconnu && cl.length > 3 && !/^(long|short|achat|achete|achetes|acheter|vends|vendre|vente|j achete|je vends)( seulement| uniquement)?$/.test(cl)) nonCompris.push(cl);
  }
  s.filtres = { ...s.filtres, ...notes.filtres, heures: notes.filtres.heures, pasRange: notes.filtres.pasRange };
  if (sortieSignal) s.sortie = { type: 'signal', conditions: sortieSignal };
  if (!clauses.some(c => /stop/.test(c))) notes.avertissements.push('Stop non précisé : 1,5 ATR H1 utilisé par défaut.');
  if (!s.sortie || (s.sortie.type === 'cible_R' && !clauses.some(c => /objectif|cible|tp|take profit|ratio/.test(c)))) { if (!sortieSignal && !clauses.some(c => /suiveur|trailing/.test(c))) notes.avertissements.push('Sortie non précisée : objectif à 2 R utilisé par défaut.'); }
  s.nom = (long && court ? 'Achat et vente' : court ? 'Vente' : long ? 'Achat' : 'Ma stratégie') + ' · ' + (s.conditions[0] ? s.conditions[0].type : 'filtres');
  const validation = validerStrategie(s);
  return { strategie: validation.strategie, compris, nonCompris, avertissements: [...notes.avertissements, ...validation.avertissements], validation: { ok: validation.ok, erreurs: validation.erreurs } };
}
