/* ═════════════ TABLEAU DE L'INVESTISSEMENT LONG TERME : filtres, tri, comptes, concurrents (module PUR, testé) ═════════════
   Une ligne = { tk, nom, secteur, pays, prix, v (valeur), mos (marge de sécurité), badge, q (qualité /10), per, ev, fy, mc (capitalisation, M$) }. */
const fin = x => typeof x === 'number' && Number.isFinite(x);
const sans = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const secteursDe = L => [...new Set(L.map(l => l.secteur).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
export const comptes = L => { const c = {}; for (const l of L) c[l.badge] = (c[l.badge] || 0) + 1; return c; };
export function filtrerLignes(L, { secteur = '', pays = '', badge = '', texte = '', qMin = 0 } = {}) {
  const t = sans(texte).trim();
  return L.filter(l => (!secteur || l.secteur === secteur) && (!pays || l.pays === pays) && (!badge || l.badge === badge) && (!qMin || (fin(l.q) && l.q >= qMin)) && (!t || sans(l.tk).includes(t) || sans(l.nom).includes(t)));
}
/* tri : les valeurs absentes toujours en bas, quel que soit le sens ; textes comparés sans accents */
export function trierLignes(L, cle = 'mos', sens = -1) {
  const txt = ['tk', 'nom', 'secteur', 'pays'].includes(cle), ordreBadge = { 'PAS CHÈRE': 0, 'PRIX JUSTE': 1, 'CHÈRE': 2, 'N/D': 3 };
  const val = l => (cle === 'badge' ? (ordreBadge[l.badge] ?? 4) : txt ? sans(l[cle]) : l[cle]);
  const absent = v => (txt ? !v : cle === 'badge' ? false : !fin(v));
  return L.slice().sort((a, b) => { const x = val(a), y = val(b), ax = absent(x), ay = absent(y); if (ax || ay) return ax === ay ? a.tk.localeCompare(b.tk) : ax ? 1 : -1; return (x < y ? -1 : x > y ? 1 : 0) * sens || a.tk.localeCompare(b.tk); });
}
/* concurrents : même secteur et même pays, les plus proches en capitalisation, 8 au plus (l'entreprise elle-même exclue) */
export function pairesDe(L, l, n = 8) {
  const P = L.filter(x => x.tk !== l.tk && x.secteur === l.secteur && x.pays === l.pays); if (!fin(l.mc)) return P.slice(0, n);
  return P.sort((a, b) => Math.abs(Math.log((a.mc || 1) / l.mc)) - Math.abs(Math.log((b.mc || 1) / l.mc))).slice(0, n);
}
