/* ═════════════ IMAGE DE SIGNAL (Telegram sendPhoto) : SVG → PNG (@resvg/resvg-js), environ 800×450, thème sombre Jarvis or ═════════════
   60 dernières bougies H1, niveau en bande colorée, MA200, grosse flèche sur la bougie de confirmation, lignes ENTRÉE / STOP / TP1 / TP2 (calcul unique : front/or/signal-niveaux.js).
   Repère de lecture, jamais un ordre. Si la génération échoue, l'appelant envoie le texte seul (jamais d'échec silencieux : l'erreur est journalisée). */
import { niveauxSignal, AVERTISSEMENT } from './front/or/signal-niveaux.js';
import { sma } from './front/or/fleches-lecture-v1.js';
export const L = 800, HH = 450, NB = 60;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = (x, d = 0) => Number(x).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/[  ]/g, ' ');
const heureParis = t => new Date(t).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });
export const plage = f => f.zoneBas != null && f.zoneHaut != null ? (Math.round(f.zoneBas) === Math.round(f.zoneHaut) ? nf(f.zoneHaut) : `${nf(f.zoneBas)}–${nf(f.zoneHaut)}`) : '';
export const nomNiveau = f => f.type === 'ma_cassure' ? `Cassure ${f.dir > 0 ? 'haussière' : 'baissière'} MA200` : (f.niveauType === 'structure' && f.niveauNom ? `${f.niveauNom} ${plage(f)}` : `${f.dir > 0 ? 'Support' : 'Résistance'} ${plage(f)}`);
export const titreSignal = (f, actif = 'OR', unite = 'H1') => `${f.dir > 0 ? 'ACHAT' : 'VENTE'} · ${actif} ${unite} · ${nomNiveau(f)} · confirmé ${heureParis(f.tCloture)}`;
/* légende texte : type, actif, niveau, entrée, stop, TP1, TP2, R, heure */
export function legendeSignal(f, actif = 'OR', unite = 'H1') {
  const n = niveauxSignal(f), l = [titreSignal(f, actif, unite)];
  if (n) l.push(`Entrée ${nf(n.entree)} · Stop ${nf(n.stop)} (${nf(n.r)} pts, ${nf(n.rAtr, 1)} ATR) · TP1 ${nf(n.tp1)} (1 R) · TP2 ${nf(n.tp2)} (2 R) · R = ${nf(n.r)} pts`);
  else l.push('Stop / objectifs non calculables');
  l.push(`Heure (Paris) : ${heureParis(f.tCloture)} · ${AVERTISSEMENT}`);
  return l.join('\n').slice(0, 1000);
}
export function svgSignal({ bougies, f, actif = 'OR', unite = 'H1' }) {
  const B = bougies, idx = B.findIndex(b => b.t === f.t); if (idx < 0) throw new Error('bougie de confirmation introuvable');
  const M = sma(B), deb = Math.max(0, idx - NB + 1), S = B.slice(deb, idx + 1), N = S.length, n = niveauxSignal(f);
  const vente = f.dir < 0, xg = 18, xd = 596, yh = 58 + (vente ? 74 : 8), yb = 404 - (vente ? 8 : 74), pas = (xd - xg) / (N + 1.5), cw = Math.max(3, pas * 0.62);
  let lo = Math.min(...S.map(b => b.l)), hi = Math.max(...S.map(b => b.h));
  const ma = f.type === 'ma_cassure' ? M.slice(deb, idx + 1).filter(v => v != null) : []; if (ma.length) {   // la MA200 n'élargit le cadre que pour une cassure de la MA200 (sinon elle écraserait les bougies)
    lo = Math.min(lo, Math.min(...ma)); hi = Math.max(hi, Math.max(...ma)); }
  if (n) { lo = Math.min(lo, n.stop, n.tp1, n.tp2); hi = Math.max(hi, n.stop, n.tp1, n.tp2); }
  if (f.zoneBas != null) { lo = Math.min(lo, f.zoneBas); hi = Math.max(hi, f.zoneHaut); }
  const mg = (hi - lo) * 0.06; lo -= mg; hi += mg;
  const X = k => xg + (k + 1) * pas, Y = p => yb - (p - lo) / (hi - lo) * (yb - yh);
  const vert = '#2ecc71', rouge = '#ff4d4d', or = '#c9b27a', cyan = '#8fd0e3', coul = f.dir > 0 ? vert : rouge;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${L}" height="${HH}" viewBox="0 0 ${L} ${HH}" font-family="Segoe UI, Arial, Helvetica, sans-serif">`;
  s += `<rect width="${L}" height="${HH}" fill="#0b0f14"/><rect x="0.5" y="0.5" width="${L - 1}" height="${HH - 1}" fill="none" stroke="#1f2a33"/>`;
  s += `<rect x="0" y="0" width="${L}" height="40" fill="#10161b"/><rect x="0" y="39" width="${L}" height="1" fill="${or}" opacity=".5"/>`;
  s += `<text x="16" y="26" font-size="16" fill="#e6edf3"><tspan fill="${coul}" font-weight="700">${esc(f.dir > 0 ? 'ACHAT' : 'VENTE')}</tspan>${esc(' · ' + titreSignal(f, actif, unite).split(' · ').slice(1).join(' · '))}</text>`;
  // bande du niveau
  if (f.zoneBas != null && f.type !== 'ma_cassure') { const y1 = Y(f.zoneHaut), y2 = Y(f.zoneBas), h = Math.max(3, y2 - y1); s += `<rect x="${xg}" y="${y1}" width="${xd - xg}" height="${h}" fill="${coul}" opacity=".16"/><line x1="${xg}" x2="${xd}" y1="${y1}" y2="${y1}" stroke="${coul}" opacity=".5"/><line x1="${xg}" x2="${xd}" y1="${y1 + h}" y2="${y1 + h}" stroke="${coul}" opacity=".5"/>`; }
  // MA200
  const pts = [], horsCadre = []; for (let k = 0; k < N; k++) { const m = M[deb + k]; if (m == null) continue; if (m >= lo && m <= hi) pts.push(`${X(k).toFixed(1)},${Y(m).toFixed(1)}`); else horsCadre.push(m); }
  if (pts.length > 1) s += `<polyline points="${pts.join(' ')}" fill="none" stroke="${cyan}" stroke-width="1.6" opacity=".9"/>`;
  // bougies
  for (let k = 0; k < N; k++) { const b = S[k], x = X(k), haut = b.c >= b.o, c = haut ? vert : rouge, y1 = Y(Math.max(b.o, b.c)), y2 = Y(Math.min(b.o, b.c));
    s += `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${Y(b.h).toFixed(1)}" y2="${Y(b.l).toFixed(1)}" stroke="${c}" stroke-width="1"/><rect x="${(x - cw / 2).toFixed(1)}" y="${y1.toFixed(1)}" width="${cw.toFixed(1)}" height="${Math.max(1, y2 - y1).toFixed(1)}" fill="${c}"/>`; }
  // lignes entrée / stop / TP
  const etiq = [];
  if (n) {
    const defs = [['ENTRÉE', n.entree, '#e6edf3', '5 4'], ['STOP LOSS', n.stop, rouge, ''], ['TP1 · 1R', n.tp1, vert, '2 3'], ['TP2 · 2R', n.tp2, vert, '']];
    for (const [nom, p, c, da] of defs) { const y = Y(p); s += `<line x1="${xg}" x2="${xd + 6}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${c}" stroke-width="1.4" ${da ? `stroke-dasharray="${da}"` : ''}/>`; etiq.push({ y, nom, p, c }); }
  } else etiq.push({ y: Y(f.prix), nom: 'ENTRÉE', p: f.prix, c: '#e6edf3' });
  etiq.sort((a, b) => a.y - b.y); for (let k = 1; k < etiq.length; k++) if (etiq[k].y - etiq[k - 1].y < 30) etiq[k].y = etiq[k - 1].y + 30;   // aucune étiquette ne chevauche la précédente (deux lignes par étiquette)
  const dec = etiq.length ? Math.max(0, etiq[etiq.length - 1].y - (yb + 8)) : 0; if (dec > 0) for (const e of etiq) e.y -= dec;
  for (const e of etiq) {
    const sous = e.nom === 'STOP LOSS' && n ? `${nf(n.r)} pts · ${nf(n.rAtr, 1)} ATR` : e.nom === 'ENTRÉE' ? 'clôture confirmation' : '';
    s += `<rect x="604" y="${(e.y - 13).toFixed(1)}" width="186" height="27" rx="3" fill="#10161b" stroke="${e.c}" stroke-width="1"/><text x="611" y="${(e.y - 1).toFixed(1)}" fill="${e.c}" font-size="12.5" font-weight="700">${esc(e.nom)}  ${esc(nf(e.p))}</text>${sous ? `<text x="611" y="${(e.y + 11).toFixed(1)}" fill="#9aa4ae" font-size="10.5">${esc(sous)}</text>` : ''}`;
  }
  // grosse flèche sur la bougie de confirmation
  const xc = X(N - 1), b = S[N - 1], up = f.dir > 0, ya = up ? Y(b.l) + 8 : Y(b.h) - 8, ac = f.type === 'ma_cassure' ? cyan : coul;
  s += up ? `<path d="M${xc},${ya} l-15,26 h9 v18 h12 v-18 h9 z" fill="${coul}" stroke="#0b0f14" stroke-width="1.5"/>` : `<path d="M${xc},${ya} l-15,-26 h9 v-18 h12 v18 h9 z" fill="${coul}" stroke="#0b0f14" stroke-width="1.5"/>`;
  s += `<text x="${Math.min(xc, xd - 40)}" y="${up ? ya + 66 : ya - 54}" fill="${ac}" font-size="12" font-weight="700" text-anchor="middle">${up ? 'ACHAT' : 'VENTE'}</text>`;
  s += `<text x="16" y="${HH - 28}" fill="${cyan}" font-size="11">— MA200 H1${horsCadre.length && !pts.length ? ' (hors cadre : ' + nf(M[idx]) + ')' : ''}</text><text x="${horsCadre.length && !pts.length ? 250 : 104}" y="${HH - 28}" fill="#9aa4ae" font-size="11">${esc(`${actif} ${unite} · ${N} bougies · bande = niveau ${plage(f) || 'MA200'}`)}</text>`;
  s += `<rect x="0" y="${HH - 22}" width="${L}" height="22" fill="#10161b"/><text x="16" y="${HH - 7}" fill="${or}" font-size="11.5">${esc(AVERTISSEMENT.charAt(0).toUpperCase() + AVERTISSEMENT.slice(1))}</text>`;
  return s + '</svg>';
}
export async function pngSignal(o) {
  const { Resvg } = await import('@resvg/resvg-js');
  const r = new Resvg(svgSignal(o), { fitTo: { mode: 'width', value: L }, font: { loadSystemFonts: true, defaultFontFamily: 'Segoe UI' } });
  return Buffer.from(r.render().asPng());
}
