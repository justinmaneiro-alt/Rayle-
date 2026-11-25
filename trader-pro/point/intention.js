/* Reconnaissance des demandes de « points » à la voix (module pur, testé) :
   « Rayle, qu'est-ce qui se passe ? Dis-moi tout » → depuis ta dernière connexion ; « fais-moi un point sur cette nuit » → nuit ; « le point du matin » ; « le point de la journée / du soir » ;
   « où en est l'or ? » / « fais-moi un point sur le Nasdaq » → un actif ; « qu'est-ce que j'ai raté ? » → depuis ta dernière connexion. */
const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'`]/g, ' ').replace(/[^a-z0-9% ]+/g, ' ').replace(/\s+/g, ' ').trim();
export const ACTIFS_POINT = [['or', /\b(or|gold|xau|xauusd)\b/], ['us100', /\b(nasdaq|us ?100|ndx)\b/], ['us500', /\b(s ?p ?500|us ?500|sp500)\b/], ['btc', /\b(bitcoin|btc)\b/], ['sol', /\b(solana|sol)\b/], ['petrole', /\b(petrole|wti|brent|oil)\b/], ['dxy', /\b(dxy|dollar|indice dollar)\b/]];
export function intentionPoint(texte) {
  const n = norm(texte); if (!n) return null;
  const actif = (ACTIFS_POINT.find(([, re]) => re.test(n)) || [])[0] || null;
  if (/\bpoint\b/.test(n) && /\b(du matin|matinal)\b/.test(n)) return { type: 'matin' };
  if (/\bpoint\b.*\b(journee|soir|soiree)\b|\b(journee|soiree)\b.*\bpoint\b|\bbilan de la journee\b/.test(n)) return { type: 'journee' };
  if (/\bcette nuit\b/.test(n) && /\b(point|passe|resume|raconte|dis moi)\b/.test(n)) return { type: 'nuit' };
  const global = /\b(dis moi tout|dis moi ce qui se passe|qu est ce qui se passe|que se passe t il|qu est ce que j ai rate|qu est ce que j ai loupe|j ai rate quoi|fais moi le point|fais moi un point)\b/.test(n);
  if (global && !actif) return { type: 'depuis' };
  if (actif && (global || /\b(ou en est|ou en sont|point sur|dis moi tout sur|que se passe t il sur|qu est ce qui se passe sur)\b/.test(n))) return { type: 'actif', actif };
  return null;
}
