/* ═════════════ MUSIQUE : calculs purs (testés) ═════════════
   Deux sources : le Mix YouTube d'origine (liste « RD… » générée par YouTube) et « ma playlist fixe » (morceaux enregistrés, qui ne changent
   jamais tout seuls). Respect des conditions de YouTube : lecteur officiel ou lien seulement, aucune extraction d'audio, aucun scraping. */
export const MIX = Object.freeze({ video: '5Xq5Up-6bSg', liste: 'RDGMEMHDXYb1_DDSgDsobPsOFxpAVM5Xq5Up-6bSg', url: 'https://www.youtube.com/watch?v=5Xq5Up-6bSg&list=RDGMEMHDXYb1_DDSgDsobPsOFxpAVM5Xq5Up-6bSg' });
export const CLE_FIXE = 'rayle_musique_fixe';
const ID = /^[A-Za-z0-9_-]{11}$/;

/* identifiant de vidéo à partir d'un lien YouTube (watch, youtu.be, shorts, embed, music.youtube.com) ou d'un identifiant seul */
export function idDepuisLien(l) {
  const s = String(l || '').trim().split(/\s+#|\s/)[0]; if (!s) return null;
  if (ID.test(s)) return s;
  let u; try { u = new URL(s.startsWith('http') ? s : 'https://' + s); } catch (e) { return null; }
  const h = u.hostname.replace(/^www\.|^m\./, '');
  if (h === 'youtu.be') { const id = u.pathname.slice(1, 12); return ID.test(id) ? id : null; }
  if (h === 'youtube.com' || h === 'music.youtube.com' || h === 'youtube-nocookie.com') {
    const v = u.searchParams.get('v'); if (v && ID.test(v)) return v;
    const m = u.pathname.match(/^\/(shorts|embed|live|v)\/([A-Za-z0-9_-]{11})/); if (m) return m[2];
  }
  return null;
}
/* lignes collées → morceaux { id, titre } (titre facultatif après « # ») */
export function lireListe(texte) {
  const vus = new Set(), out = [], rejets = [];
  for (const ligne of String(texte || '').split(/\r?\n/)) {
    const l = ligne.trim(); if (!l) continue;
    const id = idDepuisLien(l); if (!id) { rejets.push(l); continue; }
    if (vus.has(id)) continue; vus.add(id);
    const t = l.includes('#') ? l.slice(l.indexOf('#') + 1).trim() : '';
    out.push({ id, titre: t || null });
  }
  return { morceaux: out, rejets };
}
export const exporter = L => L.map(m => `https://youtu.be/${m.id}${m.titre ? ' # ' + m.titre.replace(/[\r\n]+/g, ' ') : ''}`).join('\n');
/* ajout sans doublon (renvoie la nouvelle liste et ce qui s'est passé) */
export function garder(L, m) {
  if (!m || !ID.test(m.id || '')) return { liste: L, etat: 'invalide' };
  if (L.some(x => x.id === m.id)) return { liste: L, etat: 'deja' };
  return { liste: [...L, { id: m.id, titre: m.titre || null }], etat: 'ajoute' };
}
export function retirer(L, id) { const n = L.filter(x => x.id !== id); return { liste: n, etat: n.length < L.length ? 'retire' : 'absent' }; }
export function fusionner(L, ajout) { let liste = L, n = 0; for (const m of ajout) { const r = garder(liste, m); if (r.etat === 'ajoute') n++; liste = r.liste; if (r.etat === 'deja' && m.titre) liste = liste.map(x => (x.id === m.id && !x.titre ? { ...x, titre: m.titre } : x)); } return { liste, ajoutes: n }; }
export function melanger(L, r = Math.random) { const a = L.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
export const volumeBorne = v => Math.max(0, Math.min(100, Math.round(v)));
/* le lecteur intégré a-t-il refusé le Mix ? (erreur 100/101/150, ou aucune liste chargée après le délai) */
export function mixRefuse({ erreur = null, playlist = null, attenduMs = 0, delai = 6000 }) {
  if (erreur === 2 || erreur === 5 || erreur === 100 || erreur === 101 || erreur === 150 || erreur === 153) return true;
  return attenduMs >= delai && !(Array.isArray(playlist) && playlist.length > 1);
}
export const estMobile = (ua = (globalThis.navigator && navigator.userAgent) || '') => /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
