import { validerRegle, CATALOGUE, decrireCondition } from '../agent-btc/regles-lab.js';

/* ═════════════ « TESTE MA STRATÉGIE » : FORMAT, VALIDATION ET DESCRIPTION (V1 ; module pur, testé : planetes/mars/tests/ms-strategie-test.mjs) ═════════════
   Une STRATÉGIE de l'utilisatrice = des blocs simples, jamais de code :
     { version, id, nom, cote: 'long' | 'short' | 'les-deux',
       conditions: [ … ],            conditions d'entrée (celles du laboratoire : prix / moyenne mobile, RSI, régime, cassure, volume, delta, session, zone… + « prix dans une zone » et « heures »)
       filtres: { pasRange, heures: {de, a} | null, risqueMaxPct | null },
       stop: { type: 'atr', tf, k } | { type: 'structure', L, pad } | { type: 'fixe', pct },
       sortie: { type: 'cible_R', R } | { type: 'suiveur', k, tf } | { type: 'signal', conditions: [ … ] }, notes }
   Les conditions sont écrites « dans le sens du trade » (voir regles-lab.js : pour un short, RSI bas ↔ RSI haut, au-dessus ↔ en dessous). Les conditions d'une SORTIE sur signal sont vues depuis la
   position : « prix contre l'EMA 20 » = sortir quand le prix repasse du mauvais côté, achat comme vente.
   Aucune stratégie n'est appliquée sans validation de l'utilisatrice (champ `valideeLe`, posé quand elle confirme la description) ; la traduction d'un texte libre par l'IA n'a lieu qu'à sa demande et passe par ici.
   Aucun critère de validation n'est touché : une stratégie de cet onglet n'est JAMAIS « VALIDÉE » au sens du protocole (jeu final, critères v1 et v2). */
export const VERSION_MS = 1;
export const LIMITES_MS = Object.freeze({ conditionsMax: 8, sortieConditionsMax: 4, R: [0.5, 10], stopFixePct: [0.2, 8], suiveurK: [0.5, 6], risqueMax: [0.1, 2], nom: 60 });
export const STOPS_MS = Object.freeze({ atr: { k: [0.5, 6], tf: ['h1', 'h4'] }, structure: { L: [8, 96], pad: [0.1, 1] }, fixe: { pct: [0.2, 8] } });
export const TYPES_EXTRA = Object.freeze({
  zoneprix: { nom: 'Prix dans une zone de prix (bas et haut saisis ou tracés sur le graphique)' },
  heures: { nom: 'Heures de la journée (UTC)' }
});
const estNb = x => typeof x === 'number' && Number.isFinite(x);
const dans = (x, [a, b]) => estNb(x) && x >= a && x <= b;
const arrondi = (x, d = 4) => Math.round(x * 10 ** d) / 10 ** d;
const virgule = x => String(arrondi(x, 4)).replace('.', ',');

/* Valide UNE condition (du laboratoire ou extra). Rend { ok, erreur, condition }. */
export function validerCondition(c) {
  if (!c || typeof c !== 'object') return { ok: false, erreur: 'condition vide' };
  if (c.type === 'zoneprix') {
    if (!estNb(c.bas) || !estNb(c.haut) || !(c.bas > 0) || !(c.haut > c.bas) || c.haut > 1e9) return { ok: false, erreur: 'zone de prix : il faut un bas positif et un haut plus grand que le bas' };
    return { ok: true, condition: { type: 'zoneprix', bas: c.bas, haut: c.haut } };
  }
  if (c.type === 'heures') {
    const de = Math.round(c.de), a = Math.round(c.a);
    if (!dans(de, [0, 23]) || !dans(a, [0, 24]) || de === a) return { ok: false, erreur: 'heures : de 0 à 23 (UTC), début et fin différents' };
    return { ok: true, condition: { type: 'heures', de, a } };
  }
  if (!CATALOGUE[c.type]) return { ok: false, erreur: 'condition inconnue : ' + c.type };
  const v = validerRegle({ nom: 'x', cote: 'long', conditions: [c], stop: { type: 'atr', tf: 'h1', k: 1.5 }, R: 2 });
  if (!v.ok) return { ok: false, erreur: v.erreurs.join(' ; ') };
  return { ok: true, condition: v.regle.conditions[0] };
}

export function strategieVide(cote = 'long') {
  return { version: VERSION_MS, id: null, nom: 'Ma stratégie', cote, conditions: [], filtres: { pasRange: false, heures: null, risqueMaxPct: null },
    stop: { type: 'atr', tf: 'h1', k: 1.5 }, sortie: { type: 'cible_R', R: 2 }, notes: '' };
}

/* Valide une stratégie venant de l'éditeur, d'un fichier ou d'une traduction. Rend { ok, erreurs[], avertissements[], strategie } (copie nettoyée, champs inconnus supprimés). */
export function validerStrategie(brut) {
  const erreurs = [], avertissements = [];
  if (!brut || typeof brut !== 'object') return { ok: false, erreurs: ['stratégie absente'], avertissements, strategie: null };
  const s = strategieVide(brut.cote); s.id = brut.id == null ? null : String(brut.id).slice(0, 40); s.nom = String(brut.nom || 'Ma stratégie').trim().slice(0, LIMITES_MS.nom) || 'Ma stratégie';
  s.notes = String(brut.notes || '').slice(0, 400);
  if (!['long', 'short', 'les-deux'].includes(brut.cote)) erreurs.push('côté inconnu (long, short ou les-deux)');
  s.cote = ['long', 'short', 'les-deux'].includes(brut.cote) ? brut.cote : 'long';
  const liste = Array.isArray(brut.conditions) ? brut.conditions : [];
  if (liste.length > LIMITES_MS.conditionsMax) erreurs.push('trop de conditions d’entrée (maximum ' + LIMITES_MS.conditionsMax + ')');
  else for (const c of liste) { const r = validerCondition(c); if (r.ok) s.conditions.push(r.condition); else erreurs.push('entrée : ' + r.erreur); }
  const f = brut.filtres || {};
  s.filtres.pasRange = !!f.pasRange;
  if (f.heures) { const r = validerCondition({ type: 'heures', ...f.heures }); if (r.ok) s.filtres.heures = { de: r.condition.de, a: r.condition.a }; else erreurs.push('filtre : ' + r.erreur); }
  if (f.risqueMaxPct != null && f.risqueMaxPct !== '') { if (dans(Number(f.risqueMaxPct), LIMITES_MS.risqueMax)) s.filtres.risqueMaxPct = Number(f.risqueMaxPct); else erreurs.push('risque maximal : entre ' + LIMITES_MS.risqueMax[0] + ' et ' + LIMITES_MS.risqueMax[1] + ' % par trade'); }
  if (!s.conditions.length && !s.filtres.pasRange && !s.filtres.heures) erreurs.push('au moins une condition d’entrée est nécessaire');
  // stop
  const st = brut.stop || {};
  if (st.type === 'atr') { if (!dans(st.k, STOPS_MS.atr.k) || !STOPS_MS.atr.tf.includes(st.tf)) erreurs.push('stop ATR : k entre ' + STOPS_MS.atr.k.join(' et ') + ', unité H1 ou H4'); else s.stop = { type: 'atr', tf: st.tf, k: st.k }; }
  else if (st.type === 'structure') { if (!dans(st.L, STOPS_MS.structure.L) || !dans(st.pad, STOPS_MS.structure.pad)) erreurs.push('stop de structure : L entre ' + STOPS_MS.structure.L.join(' et ') + ' bougies, marge entre ' + STOPS_MS.structure.pad.join(' et ') + ' ATR'); else s.stop = { type: 'structure', L: Math.round(st.L), pad: st.pad }; }
  else if (st.type === 'fixe') {
    if (!dans(st.pct, STOPS_MS.fixe.pct)) erreurs.push('stop fixe : entre ' + STOPS_MS.fixe.pct.join(' et ') + ' % du prix'); else { s.stop = { type: 'fixe', pct: st.pct }; if (st.pct < 0.25 || st.pct > 6) avertissements.push('Un stop fixe de ' + virgule(st.pct) + ' % sort des limites du moteur (0,25 à 6 %) : les entrées seront écartées.'); }
  } else erreurs.push('stop inconnu (atr, structure ou fixe)');
  // sortie
  const so = brut.sortie || {};
  if (so.type === 'cible_R') { if (!dans(so.R, LIMITES_MS.R)) erreurs.push('objectif : entre ' + LIMITES_MS.R.join(' et ') + ' R'); else s.sortie = { type: 'cible_R', R: so.R }; }
  else if (so.type === 'suiveur') { if (!dans(so.k, LIMITES_MS.suiveurK) || !['h1', 'h4'].includes(so.tf)) erreurs.push('stop suiveur : k entre ' + LIMITES_MS.suiveurK.join(' et ') + ', unité H1 ou H4'); else s.sortie = { type: 'suiveur', k: so.k, tf: so.tf }; }
  else if (so.type === 'signal') {
    const cs = Array.isArray(so.conditions) ? so.conditions : [], ok = [];
    if (!cs.length) erreurs.push('sortie sur signal : au moins une condition'); else if (cs.length > LIMITES_MS.sortieConditionsMax) erreurs.push('sortie sur signal : maximum ' + LIMITES_MS.sortieConditionsMax + ' conditions');
    else for (const c of cs) { const r = validerCondition(c); if (r.ok) ok.push(r.condition); else erreurs.push('sortie : ' + r.erreur); }
    s.sortie = { type: 'signal', conditions: ok };
  } else erreurs.push('sortie inconnue (cible_R, suiveur ou signal)');
  if (s.sortie.type === 'signal') avertissements.push('Sortie sur signal : le stop reste en place en cas de retournement brutal, mais aucun objectif n’est fixé (la détention est limitée à 2 jours).');
  if (s.stop.type === 'atr' && s.stop.k < 1) avertissements.push('Un stop à moins d’1 ATR est souvent touché par le simple bruit.');
  return { ok: !erreurs.length, erreurs, avertissements, strategie: s };
}

/* Clé stable (sans le nom, l'id ni les notes) : deux stratégies identiques à ce que leurs règles disent ont la même clé. Sert au compteur de variantes. */
export const cleStrategie = s => JSON.stringify({ c: s.cote, k: s.conditions, f: s.filtres && { r: !!s.filtres.pasRange, h: s.filtres.heures || null }, s: s.stop, o: s.sortie });

const COTE = { long: 'achète seulement (long)', short: 'vend seulement (short)', 'les-deux': 'achète et vend' };
const decrireExtra = c => c.type === 'zoneprix' ? 'le prix est dans la zone ' + virgule(c.bas) + ' – ' + virgule(c.haut) : 'entre ' + c.de + ' h et ' + c.a + ' h (UTC)';
export const decrireCond = c => (TYPES_EXTRA[c.type] ? decrireExtra(c) : decrireCondition(c));
/* Description en français (une ligne par bloc) : c'est CE TEXTE que l'utilisatrice relit et valide avant tout test. */
export function decrireStrategie(s) {
  const l = [s.nom + ' : ' + COTE[s.cote] + '.'];
  for (const c of s.conditions) l.push('Entrée si ' + decrireCond(c) + '.');
  if (s.filtres && s.filtres.pasRange) l.push('Filtre : pas d’entrée quand le marché est en range.');
  if (s.filtres && s.filtres.heures) l.push('Filtre : seulement ' + decrireExtra({ type: 'heures', ...s.filtres.heures }) + '.');
  if (s.filtres && s.filtres.risqueMaxPct) l.push('Risque maximal : ' + virgule(s.filtres.risqueMaxPct) + ' % du capital par trade.');
  const st = s.stop; l.push(st.type === 'atr' ? 'Stop : ' + virgule(st.k) + ' ATR ' + st.tf.toUpperCase() + ' sous (au-dessus de) l’entrée.' : st.type === 'structure' ? 'Stop : au-delà du dernier creux (sommet) des ' + st.L + ' dernières bougies M15, marge ' + virgule(st.pad) + ' ATR.' : 'Stop fixe : ' + virgule(st.pct) + ' % du prix.');
  const so = s.sortie; l.push(so.type === 'cible_R' ? 'Sortie : objectif à ' + virgule(so.R) + ' R.' : so.type === 'suiveur' ? 'Sortie : stop suiveur à ' + virgule(so.k) + ' ATR ' + so.tf.toUpperCase() + ', pas d’objectif fixe.' : 'Sortie : dès que ' + so.conditions.map(decrireCond).join(' et ') + ' (vu depuis ta position).');
  return l;
}

/* Une règle du laboratoire (traduction d'une idée libre par le Worker, ou règle de l'agent) devient une stratégie de cet onglet. */
export function depuisRegleLab(regle, nom = null) {
  return validerStrategie({ nom: nom || regle.nom, cote: regle.cote, conditions: regle.conditions, stop: regle.stop, sortie: { type: 'cible_R', R: regle.R } });
}
