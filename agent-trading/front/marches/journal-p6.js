/* JOURNAL DE TRADES XTB (Phase 6, A4) : import CSV / Excel, statistiques, simulation « mes résultats passés avec la couverture proposée ». PUR (testé : agent-trading/tests/journal-p6-test.mjs).
   Les données restent sur l'appareil : rien n'est envoyé en ligne. Sous 30 trades : « échantillon trop petit ». Jamais d'ordre, jamais de taille de position imposée. */
import { importerCsv, plNet, rNet } from '../or/journal-calcul.js';
export const MIN_TRADES = 30;
const H = 3600e3, arr = (v, d = 2) => (Number.isFinite(v) ? +v.toFixed(d) : null);
const moyenne = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);

/* ───── lecture d'un classeur Excel (.xlsx) sans bibliothèque : ZIP + XML (navigateur moderne ou Node ≥ 18) ───── */
export async function lireXlsx(buffer) {
  const b = new Uint8Array(buffer), dv = new DataView(b.buffer, b.byteOffset, b.byteLength); let e = b.length - 22; while (e > 0 && dv.getUint32(e, true) !== 0x06054b50) e--; if (e <= 0) throw new Error('fichier Excel illisible (archive)');
  const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true); const fichiers = {}, txt = new TextDecoder();
  for (let i = 0; i < n; i++) { const meth = dv.getUint16(p + 10, true), cs = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true), nom = txt.decode(b.subarray(p + 46, p + 46 + nl)), ln = dv.getUint16(lo + 26, true), le = dv.getUint16(lo + 28, true), ds = lo + 30 + ln + le;
    fichiers[nom] = async () => { const d = b.subarray(ds, ds + cs); if (meth === 0) return d; if (meth !== 8) throw new Error('compression Excel non gérée'); const f = new Blob([d]).stream().pipeThrough(new DecompressionStream('deflate-raw')); return new Uint8Array(await new Response(f).arrayBuffer()); }; p += 46 + nl + el + cl; }
  const lire = async nom => (fichiers[nom] ? txt.decode(await fichiers[nom]()) : '');
  const ss = await lire('xl/sharedStrings.xml'), strs = [...ss.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x => x[1]).join('').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'"));
  const noms = Object.keys(fichiers).filter(k => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort(); let meilleur = null, plus = 0;
  for (const nom of noms) { const xml = await lire(nom), nl = (xml.match(/<row /g) || []).length; if (nl > plus) { plus = nl; meilleur = xml; } } if (!meilleur) throw new Error('aucune feuille de données dans le classeur');
  const lignes = [], col = r => r.split('').reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  for (const m of meilleur.matchAll(/<row [^>]*>([\s\S]*?)<\/row>/g)) { const l = []; for (const c of m[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>(?:<f>[\s\S]*?<\/f>)?(?:<v>([\s\S]*?)<\/v>|<is><t[^>]*>([\s\S]*?)<\/t><\/is>)?<\/c>)/g)) l[col(c[1])] = /t="s"/.test(c[2]) ? strs[+c[3]] : (c[4] != null ? c[4] : c[3]); lignes.push(l); }
  return lignes;
}
const serieExcel = v => { const x = Number(v); return Number.isFinite(x) && x > 20000 && x < 80000 ? new Date(Math.round((x - 25569) * 86400e3)).toISOString().replace('T', ' ').slice(0, 19) : v; };
/* lignes de classeur → texte CSV compatible avec importerCsv (en-têtes détectés par leur nom) */
export function lignesVersCsv(lignes) {
  const h = lignes.findIndex(l => l && l.some(x => /^(symbol|instrument)$/i.test(String(x || '').trim()))); if (h < 0) throw new Error('en-têtes XTB introuvables (colonne « Symbol » attendue)');
  const tete = lignes[h].map(x => String(x == null ? '' : x).trim()); const heures = tete.map(t => /time/i.test(t));
  return [tete.join(';'), ...lignes.slice(h + 1).filter(l => l && l.some(x => x != null && x !== '')).map(l => tete.map((_, i) => { const v = l[i]; return String(v == null ? '' : (heures[i] ? serieExcel(v) : v)).replace(/;/g, ','); }).join(';'))].join('\n');
}
/* import : CSV (texte) ou Excel (ArrayBuffer) → { trades, ignores, format } ; tous les instruments (pas seulement l'or) */
export async function importer(source, { nomFichier = '' } = {}) {
  let texte = source; if (typeof source !== 'string') { const b = new Uint8Array(source); texte = b[0] === 0x50 && b[1] === 0x4b ? lignesVersCsv(await lireXlsx(source)) : new TextDecoder().decode(b); }
  if (!String(texte).trim()) return { trades: [], ignores: 0, format: 'vide', erreur: 'fichier vide' };
  const r = importerCsv(texte, { orSeulement: false }); return { ...r, nomFichier };
}
/* trade du journal → enregistrement d'analyse */
export function normaliser(t) {
  const pl = plNet(t), t0 = t.tEntree, t1 = t.tSortie; if (pl == null || !Number.isFinite(t0)) return null;
  return { id: t.id, actif: String(t.instrument || t.symbole || t.actif || 'inconnu').toUpperCase(), sens: t.sens === 'vente' ? -1 : 1, t0, t1: Number.isFinite(t1) ? t1 : t0, pl, frais: Number.isFinite(+t.frais) ? +t.frais : 0, taille: +t.taille || null, entree: +t.entree || null, sortie: +t.sortie || null, R: rNet(t) };
}
const parisHeure = t => +new Date(t).toLocaleString('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hour12: false }) % 24, parisJour = t => new Date(t).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long' });
function bloc(L) { const n = L.length, g = L.filter(x => x.pl > 0), p = L.filter(x => x.pl < 0), sg = g.reduce((s, x) => s + x.pl, 0), sp = -p.reduce((s, x) => s + x.pl, 0); return { n, reussitePct: n ? arr(g.length / n * 100, 1) : null, gainMoyen: g.length ? arr(sg / g.length) : null, perteMoyenne: p.length ? arr(-sp / p.length) : null, total: arr(L.reduce((s, x) => s + x.pl, 0)), esperance: n ? arr(L.reduce((s, x) => s + x.pl, 0) / n, 3) : null, factorProfit: sp > 0 ? arr(sg / sp) : null }; }
function groupe(L, f) { const m = {}; for (const x of L) (m[f(x)] = m[f(x)] || []).push(x); return Object.fromEntries(Object.entries(m).map(([k, v]) => [k, { ...bloc(v), petit: v.length < MIN_TRADES }])); }
/* statistiques : trades du journal (format de journal-calcul) */
export function statistiques(trades, { fraisConnus = true } = {}) {
  const L = (trades || []).map(normaliser).filter(Boolean).sort((a, b) => a.t0 - b.t0), n = L.length;
  if (!n) return { n: 0, petit: true, avertissement: 'Aucun trade clôturé lisible.' };
  const B = bloc(L), R = L.map(x => x.R).filter(Number.isFinite);
  let eq = 0, pic = 0, dd = 0, serie = 0, maxSerie = 0; for (const x of L) { eq += x.pl; pic = Math.max(pic, eq); dd = Math.min(dd, eq - pic); if (x.pl < 0) { serie++; maxSerie = Math.max(maxSerie, serie); } else serie = 0; }
  /* biais de revanche : trade ouvert dans les 15 minutes qui suivent la clôture d'une perte, avec une taille supérieure */
  let rev = 0, revPl = 0; for (let i = 1; i < L.length; i++) { const a = L[i - 1], b = L[i]; if (a.pl < 0 && b.t0 - a.t1 <= 15 * 60e3 && b.t0 >= a.t1 && a.taille && b.taille && b.taille > a.taille * 1.05) { rev++; revPl += b.pl; } }
  const nuit = L.filter(x => { const h = parisHeure(x.t0); return h >= 23 || h < 7; });
  return { n, petit: n < MIN_TRADES, avertissement: n < MIN_TRADES ? `échantillon trop petit (${n} trades : il en faut au moins ${MIN_TRADES} pour que les moyennes aient un sens)` : null, ...B,
    espéranceR: R.length >= 5 ? arr(moyenne(R), 3) : null, nR: R.length, noteR: R.length ? 'R calculé sur les prix quand le stop est connu' : 'R non calculable : pas de stop dans les données', frais: arr(L.reduce((s, x) => s + x.frais, 0)), fraisNote: fraisConnus ? null : 'frais non fournis',
    drawdown: arr(dd), plusLonguePerte: maxSerie, revanche: { n: rev, total: arr(revPl), texte: rev ? `${rev} trade(s) ouverts dans les 15 min après une perte, avec une taille plus grande` : 'aucun trade de revanche détecté (taille accrue dans les 15 min après une perte)' }, nuit: { ...bloc(nuit), petit: nuit.length < MIN_TRADES, definition: 'ouverts entre 23 h et 7 h (heure de Paris)' },
    parHeure: groupe(L, x => String(parisHeure(x.t0)).padStart(2, '0') + ' h'), parJour: groupe(L, x => parisJour(x.t0)), parActif: groupe(L, x => x.actif), parSens: groupe(L, x => (x.sens > 0 ? 'achat' : 'vente')), debut: L[0].t0, fin: L[n - 1].t0 };
}
/* ───── « mes résultats passés avec la couverture proposée » ─────
   jambeCouverture : { serie: [[t,c]] du produit de couverture, h: ratio nominal signé (couverture-calcul), cle: id }.
   Le notionnel de chaque trade est déduit de SON propre résultat (pl / rendement du trade) : aucune taille n'est supposée. Rendement du produit de couverture sur la durée du trade
   (journalier : un trade plus court qu'un jour n'a pas de rendement de couverture). Montre aussi ce qui s'est dégradé. */
export function simulerCouverture(trades, jambe) {
  const L = (trades || []).map(normaliser).filter(x => x && x.entree && x.sortie && x.t1 > x.t0), S = jambe && jambe.serie ? jambe.serie.filter(p => p[1] > 0) : [];
  if (!S.length || !Number.isFinite(jambe.h)) return { erreur: 'jambe de couverture sans donnée' };
  const dernierAvant = t => { let lo = 0, hi = S.length - 1, r = null; while (lo <= hi) { const m = (lo + hi) >> 1; if (S[m][0] <= t) { r = S[m]; lo = m + 1; } else hi = m - 1; } return r; };
  const lignes = []; let ignores = 0;
  for (const x of L) { const retA = (x.sortie / x.entree - 1) * x.sens, a = dernierAvant(x.t0), b = dernierAvant(x.t1); if (Math.abs(retA) < 0.0005 || !a || !b || b[0] - a[0] < 12 * H || x.t0 < S[0][0]) { ignores++; continue; }
    const retB = b[1] / a[1] - 1, N = x.pl / retA; if (!(N > 0)) { ignores++; continue; }   // notionnel déduit du trade lui-même (le résultat net garde le signe du rendement)
    const couvPl = -x.sens * jambe.h * N * retB; lignes.push({ id: x.id, avant: x.pl, apres: x.pl + couvPl, couv: couvPl, t0: x.t0 }); }
  const cum = k => { let e = 0, pic = 0, dd = 0; for (const l of lignes) { e += l[k]; pic = Math.max(pic, e); dd = Math.min(dd, e - pic); } return { total: arr(e), drawdown: arr(dd) }; };
  const A = cum('avant'), P = cum('apres'), degrade = lignes.filter(l => l.apres < l.avant - Math.max(0.5, Math.abs(l.avant) * 0.25)).sort((a, b) => (a.apres - a.avant) - (b.apres - b.avant)).slice(0, 5);
  return { n: lignes.length, ignores, avant: A, apres: P, difference: arr(P.total - A.total), drawdownMieux: P.drawdown > A.drawdown, degrades: degrade.map(l => ({ id: l.id, avant: arr(l.avant), apres: arr(l.apres) })), note: 'Simulation sur des trades PASSÉS, rendements journaliers de la jambe de couverture ; ce n’est pas une prévision et une couverture réduit le risque, pas l’espérance de gain.' + (lignes.length < MIN_TRADES ? ' Échantillon trop petit.' : '') };
}
