/* ═════════════ RÈGLE ANTI-INVENTION : chaque chiffre ou niveau que Rayle dit doit exister dans la fiche de lecture ═════════════
   `collecterFaits(sources, extras)` parcourt les fiches (JSON de la phase 1), le réseau d'information et le calendrier et range tous les nombres qu'ils contiennent (et les heures de Paris de leurs horodatages).
   `verifierTexte(texte, faits)` extrait les nombres du texte et vérifie un par un qu'il existe (arrondi à l'affichage). `retirerInconnus` supprime les phrases qui contiennent un nombre introuvable : si trop de phrases
   tombent, l'appelant retombe sur le texte déterministe. Pur, testé, utilisé dans le navigateur, le Worker et GitHub Actions.
   Tolérances : un entier de 0 à 12 sans unité (« 3 sessions », « deux ») est un simple comptage et passe ; tout nombre à virgule, tout nombre ≥ 13, et tout nombre suivi de %, ×, ATR ou « fois » doit être un fait. */
import { TZ } from '../lecture/sessions.js';

const MAX_DEC = 3;
const arrondi = (x, d) => { const f = 10 ** d; return Math.round(x * f) / f; };
const parisHM = t => { const p = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ.paris, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(t)); return [+p.find(x => x.type === 'hour').value, +p.find(x => x.type === 'minute').value]; };

export function collecterFaits(sources, extras = {}) {
  const nums = Array.from({ length: MAX_DEC + 1 }, () => new Set()), signes = Array.from({ length: MAX_DEC + 1 }, () => new Set()), heures = new Set(), minutes = new Set([0]);
  const ajouter = v => { if (!Number.isFinite(v)) return; if (Math.abs(v) > 1e11) { const [h, m] = parisHM(v); heures.add(h); minutes.add(m); const u = new Date(v); heures.add(u.getUTCHours()); minutes.add(u.getUTCMinutes()); return; } for (let d = 0; d <= MAX_DEC; d++) { nums[d].add(arrondi(Math.abs(v), d)); signes[d].add(arrondi(v, d)); } };
  const vu = new WeakSet(), marcher = o => { if (o == null) return; if (typeof o === 'number') { ajouter(o); return; } if (typeof o === 'string') { for (const m of o.matchAll(/\d+(?:[.,]\d+)?/g)) ajouter(parseFloat(m[0].replace(',', '.'))); return; } if (typeof o !== 'object' || vu.has(o)) return; vu.add(o); if (Array.isArray(o)) { for (const x of o) marcher(x); return; } for (const x of Object.values(o)) marcher(x); };
  marcher(sources); for (const v of extras.nombres || []) ajouter(v); for (const h of extras.heures || []) heures.add(h); for (const m of extras.minutes || []) minutes.add(m);
  return { nums, signes, heures, minutes };
}
/* nombres d'un texte français : « 3 909,2 », « −1,9 % », « ×3,2 », « 15 h 30 » (heure : suivi de « h » ou précédé de « à ») */
/* noms d'instruments et d'unités (S&P 500, MA200, H4, M15, Nasdaq 100…) : leurs chiffres ne sont pas des mesures */
const IDENTIFIANTS = /\b(?:sur 100|S&P ?500|Nasdaq ?100|US ?(?:100|500)|MA ?200|XAU\/USD|[HM]\d{1,2}|ATR ?14)\b/gi;
export function nombresDuTexte(brutTexte) {
  const texte = String(brutTexte).replace(IDENTIFIANTS, m => '_'.repeat(m.length)), out = [], re = /([+−-])?\s?(\d{1,3}(?:[\u00a0\u202f ]\d{3})+(?:[,.]\d+)?|\d+(?:[,.]\d+)?)/g; let m;
  while ((m = re.exec(texte))) {
    const brut = m[2], valeur = parseFloat(brut.replace(/[\u00a0\u202f ]/g, '').replace(',', '.')), dec = (brut.split(/[,.]/)[1] || '').length, debut = m.index + (m[1] ? m[0].indexOf(m[1]) : m[0].indexOf(brut)), fin = m.index + m[0].length;
    const avant = texte.slice(Math.max(0, debut - 2), debut), apres = texte.slice(fin, fin + 7), explicite = m[1] && m[1] !== '-' ? m[1] : (m[1] === '-' && /^\s?\d/.test(brut) ? '-' : null);
    const suivi = /^\s?(%|pour cent|ATR|fois|points?\b)/i.test(apres) || /×$/.test(avant.trim()) || /^\s?×/.test(apres), heure = /^\s?h(?![a-zé])/i.test(apres) && Number.isInteger(valeur), minute = /\d\s?h\s?$/i.test(texte.slice(Math.max(0, debut - 5), debut)) && Number.isInteger(valeur) && dec === 0 && valeur < 60;
    out.push({ brut: m[0].trim(), valeur, decimales: dec, signe: explicite === '-' ? '−' : explicite, strict: suivi || dec > 0 || valeur >= 13, heure, minute, index: debut });
  }
  return out;
}
export function nombreConnu(n, faits) {
  if (n.heure) return faits.heures.has(n.valeur) || faits.heures.has(n.valeur % 24);
  if (n.minute) return faits.minutes.has(n.valeur);
  if (!n.strict) return true; const d = Math.min(MAX_DEC, n.decimales);
  if (n.signe) return faits.signes[d].has(arrondi(n.signe === '−' ? -n.valeur : n.valeur, d)) || faits.nums[d].has(arrondi(n.valeur, d)) && false;
  return faits.nums[d].has(arrondi(n.valeur, d));
}
export const phrases = t => String(t).split(/(?<=[.!?…])\s+(?=[A-ZÀ-ÖØ-Ý«"“(\d])/);
export function verifierTexte(texte, faits) {
  const inconnus = []; for (const p of phrases(texte)) for (const n of nombresDuTexte(p)) if (!nombreConnu(n, faits)) inconnus.push({ nombre: n.brut, phrase: p });
  return { ok: inconnus.length === 0, inconnus };
}
/* retire les phrases à nombre introuvable ; { texte, retirees, ok } */
export function retirerInconnus(texte, faits) {
  const gardees = [], retirees = []; for (const p of phrases(texte)) { if (nombresDuTexte(p).every(n => nombreConnu(n, faits))) gardees.push(p); else retirees.push(p); }
  return { texte: gardees.join(' '), retirees, ok: retirees.length === 0 };
}
