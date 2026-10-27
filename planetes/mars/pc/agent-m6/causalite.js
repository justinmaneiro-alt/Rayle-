import { tranche } from '../agent-btc/colonnes.js';

/* ═════════════ TEST DU « POISON DU FUTUR » GÉNÉRIQUE (M6 ; module pur, testé : planetes/mars/tests/m6-poison-test.mjs) ═════════════
   Principe : une mesure ou un signal à l'index i ne doit dépendre QUE des bougies 0..i. Deux contrôles complémentaires :
   - POISON : on garde la série entière mais on remplace tout ce qui suit i par des valeurs absurdes (prix à 1e9 ou 1e-0, volumes énormes, delta nul) ; la valeur en i ne doit pas bouger ;
   - COUPE  : on recalcule sur la série tronquée à i ; la valeur en i doit être identique à celle de la série complète.
   Toute fuite détectée est rendue avec son nom, son instant et la valeur avant / après : elle doit être CORRIGÉE, jamais contournée. Aucune dépendance au navigateur. */
export const CHAMPS_SERIE = ['t', 'o', 'h', 'l', 'c', 'v', 'vb'];

/* Copie de la série dont tout ce qui suit l'index i est remplacé par des valeurs absurdes (déterministes : alternance prix énormes / minuscules). */
export function poisonner(s, i) {
  const o = { n: s.n };
  for (const k of CHAMPS_SERIE) o[k] = s[k].slice();
  for (let j = i + 1; j < s.n; j++) {
    const grand = j % 2 === 1;
    o.o[j] = o.h[j] = o.l[j] = o.c[j] = grand ? 1e9 : 1e-3;
    o.h[j] = Math.max(o.o[j], o.c[j]); o.l[j] = Math.min(o.o[j], o.c[j]);
    o.v[j] = 1e12; o.vb[j] = j % 3 === 0 ? 0 : NaN;
  }
  return o;
}
export const couper = (s, i) => tranche(s, 0, i + 1);

const egal = (a, b, eps = 1e-9) => (Number.isNaN(a) && Number.isNaN(b)) || a === b || Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b));

/* Compare deux colonnes (ou deux tableaux de nombres) sur les index [de, i]. Rend null si identiques, sinon { index, avant, apres }. */
export function premiereDifference(a, b, de, i, eps) {
  for (let j = de; j <= i; j++) if (!egal(a[j], b[j], eps)) return { index: j, plein: a[j], autre: b[j] };
  return null;
}

/* Vérifie une fonction qui rend des COLONNES : f(serie) → { nom: Float64Array|Int8Array|Array, … }. `coupes` : liste d'index i. `de` : premier index comparé (chauffe des indicateurs).
   Rend { ok, testes, violations:[{mesure, methode, coupe, index, plein, autre}] }. */
export function verifierColonnes(f, serie, coupes, { de = 300, eps = 1e-9, methodes = ['poison', 'coupe'] } = {}) {
  const plein = f(serie), violations = []; let testes = 0;
  for (const i of coupes) {
    for (const methode of methodes) {
      const autre = f(methode === 'poison' ? poisonner(serie, i) : couper(serie, i));
      for (const nom of Object.keys(plein)) {
        testes++;
        const d = premiereDifference(plein[nom], autre[nom], Math.min(de, i), i, eps);
        if (d) violations.push({ mesure: nom, methode, coupe: i, ...d });
      }
    }
  }
  return { ok: violations.length === 0, testes, violations };
}

/* Vérifie une fonction de SIGNAUX : f(serie) → { sens, stop } ; compare le sens et le stop à chaque index où un signal existe. */
export function verifierSignaux(f, serie, coupes, options = {}) {
  const adapte = s => { const r = f(s); return { sens: r.sens, stop: r.sens ? Array.from(r.sens, (x, j) => (x ? r.stop[j] : 0)) : [] }; };
  return verifierColonnes(adapte, serie, coupes, options);
}

/* Résumé en une phrase, pour le journal de santé. */
export function phraseCausalite(r, nom) {
  if (r.ok) return nom + ' : aucune fuite du futur (' + r.testes + ' contrôles).';
  const v = r.violations[0];
  return nom + ' : FUITE DU FUTUR détectée (' + r.violations.length + ' écart(s)) ; premier : ' + v.mesure + ' à l’index ' + v.index + ' (' + v.methode + ', coupe ' + v.coupe + ').';
}
