/* ═════════════ MUSIQUE : calculs purs (testés) ═════════════
   Trois sources : « ma playlist YouTube » (lien enregistré sur l’appareil), « ma liste de morceaux » (liens enregistrés un par un) et le Mix YouTube
   d’origine (liste « RD… », source de secours). Respect des conditions de YouTube : lecteur officiel seulement (publicités comprises, jamais masquées), aucune extraction d'audio, aucun scraping. */
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
/* codes d'erreur de l'API IFrame qui veulent dire « ce morceau ne se lit pas ici » (2 identifiant invalide, 5 HTML5, 100 introuvable/privé,
   101/150 intégration refusée par l'auteur, 153 référent manquant) */
export const CODES_REFUS = Object.freeze([2, 5, 100, 101, 150, 153]);
export const estRefus = c => CODES_REFUS.includes(Number(c));
/* après un refus : morceau suivant, ou arrêt (tous refusés à la suite, fin de liste, ou morceau déjà refusé dans cette lecture = boucle) — jamais de boucle */
export function apresRefus({ index = -1, longueur = 0, echecsSuite = 1, dejaRefuse = false }) {
  if (dejaRefuse) return { action: 'arret', raison: 'boucle' };
  if (!(longueur > 1) || index < 0) return { action: 'arret', raison: 'seul' };
  if (echecsSuite >= longueur) return { action: 'arret', raison: 'tous' };
  if (index + 1 >= longueur) return { action: 'arret', raison: 'fin' };
  return { action: 'suivant', index: index + 1 };
}
/* « Morceaux non lisibles » : sans doublon, plus récents d'abord, 50 au plus */
export const CLE_NON_LISIBLES = 'rayle_musique_non_lisibles';
export function noterNonLisible(L, m) {
  if (!m || !ID.test(m.id || '')) return L;
  const vieux = L.find(x => x.id === m.id), titre = m.titre || (vieux && vieux.titre) || null;
  return [{ id: m.id, titre, code: m.code ?? null, quand: m.quand || null }, ...L.filter(x => x.id !== m.id)].slice(0, 50);
}
/* « Lien de ma playlist YouTube » : lien (…list=…) ou identifiant seul. Listes personnelles et publiques (PL, OLAK5uy_ albums, UU chaînes, FL) ;
   les listes privées de l'appareil (WL « à regarder plus tard », LL « j'aime ») ne se lisent pas dans un lecteur intégré : refusées. */
export const CLE_PLAYLIST = 'rayle_musique_playlist';
const PL = /^(PL|OLAK5uy_|UU|FL|RD|OL)[A-Za-z0-9_-]{10,80}$/;
export function idPlaylistDepuisLien(l) {
  const s = String(l || '').trim(); if (!s) return null;
  if (PL.test(s)) return s;
  let u; try { u = new URL(s.startsWith('http') ? s : 'https://' + s); } catch (e) { return null; }
  const h = u.hostname.replace(/^www\.|^m\./, '');
  if (!['youtube.com', 'music.youtube.com', 'youtube-nocookie.com', 'youtu.be'].includes(h)) return null;
  const v = u.searchParams.get('list'); return v && PL.test(v) ? v : null;
}
/* le cadre du lecteur : RESTREINT (sandbox sans allow-popups ni allow-top-navigation) → un clic sur une publicité ou sur « Regarder sur YouTube »
   n'ouvre ni onglet ni fenêtre, et ne fait pas quitter Rayle. Scripts + même origine : indispensables au lecteur officiel (et à ses publicités). */
export const SANDBOX = 'allow-scripts allow-same-origin allow-presentation';
export const PERMISSIONS = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
export const HOTE = 'https://www.youtube-nocookie.com';
/* adresse du lecteur intégré officiel pour une source : mix (vidéo + liste RD), playlist (videoseries?list=), fixe (1re vidéo + playlist=autres) */
export function urlLecteur({ source, video = null, liste = null, ids = [], origine = '', autoplay = true }) {
  const p = new URLSearchParams({ enablejsapi: '1', playsinline: '1', rel: '0', ...(autoplay ? { autoplay: '1' } : {}), ...(origine ? { origin: origine } : {}) });
  let chemin;
  if ((source === 'mix' || source === 'playlist') && !liste) return null;
  if (source === 'mix') { chemin = video; p.set('list', liste); p.set('listType', 'playlist'); }
  else if (source === 'playlist') { chemin = 'videoseries'; p.set('list', liste); p.set('listType', 'playlist'); }
  else { const L = ids.filter(x => ID.test(x)).slice(0, 200); if (!L.length) return null; chemin = L[0]; if (L.length > 1) p.set('playlist', L.slice(1).join(',')); }
  if (!chemin) return null;
  return `${HOTE}/embed/${chemin}?${p.toString()}`;
}
export const estMobile = (ua = (globalThis.navigator && navigator.userAgent) || '') => /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
