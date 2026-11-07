/* ═════════════ MODE TÉLÉ : calculs purs (testés) ═════════════ */
export const RELAIS_WS = 'wss://rayle-or-relais.justinmaneiro.workers.dev/tele/ws';
export const ADRESSE_COURTE = 'justinmaneiro-alt.github.io/Rayle-/tv';
export const ADRESSE_TELECOMMANDE = 'https://justinmaneiro-alt.github.io/Rayle-/tc/';
export function codeAleatoire(r = Math.random) { return String(Math.floor(r() * 10000)).padStart(4, '0'); }
export const codeValide = c => /^\d{4}$/.test(String(c || ''));
export const urlTelecommande = (code, base = ADRESSE_TELECOMMANDE) => `${base}?code=${code}`;
/* touches de télécommande / clavier → action */
export function toucheVersAction(e) {
  const k = e.key || '', c = e.keyCode;
  if (k === 'ArrowLeft' || c === 37) return { nav: 'gauche' }; if (k === 'ArrowRight' || c === 39) return { nav: 'droite' };
  if (k === 'ArrowUp' || c === 38) return { nav: 'haut' }; if (k === 'ArrowDown' || c === 40) return { nav: 'bas' };
  if (k === 'Enter' || k === ' ' || c === 13 || c === 23) return { ok: true };
  if (k === 'MediaPlayPause' || c === 179 || c === 85) return { cmd: 'pause_reprendre' };
  if (k === 'MediaTrackNext' || c === 176 || c === 87) return { cmd: 'suivant' };
  if (k === 'MediaTrackPrevious' || c === 177 || c === 88) return { cmd: 'precedent' };
  if (k === 'AudioVolumeUp' || c === 175) return { cmd: 'volume_plus' }; if (k === 'AudioVolumeDown' || c === 174) return { cmd: 'volume_moins' };
  if (k === 'Escape' || k === 'GoBack' || k === 'BrowserBack' || c === 4 || c === 10009) return { retour: true };
  return null;
}
/* déplacement du focus dans une grille de boutons (positions {x, y, l, h}) : le plus proche dans la direction voulue */
export function voisin(boutons, iCourant, dir) {
  const a = boutons[iCourant]; if (!a) return 0;
  const ca = { x: a.x + a.l / 2, y: a.y + a.h / 2 }; let meilleur = iCourant, best = Infinity;
  boutons.forEach((b, i) => {
    if (i === iCourant) return; const cb = { x: b.x + b.l / 2, y: b.y + b.h / 2 }, dx = cb.x - ca.x, dy = cb.y - ca.y;
    const ok = dir === 'droite' ? dx > 4 : dir === 'gauche' ? dx < -4 : dir === 'bas' ? dy > 4 : dy < -4; if (!ok) return;
    const principal = dir === 'droite' || dir === 'gauche' ? Math.abs(dx) : Math.abs(dy), lateral = dir === 'droite' || dir === 'gauche' ? Math.abs(dy) : Math.abs(dx);
    const d = principal + 2.5 * lateral; if (d < best) { best = d; meilleur = i; }
  });
  return meilleur;
}
/* qualité automatique de la Terre selon les images par seconde (hystérésis : baisse vite, remonte lentement) */
export function ajusterQualite(niveau, ips, { bas = 28, haut = 50 } = {}) {
  if (ips < bas && niveau > 0) return niveau - 1;
  if (ips > haut && niveau < 2) return niveau + 1;
  return niveau;
}
export const QUALITES = [{ nom: 'basse', ratio: 0.5, nuages: false, segments: 48 }, { nom: 'moyenne', ratio: 0.75, nuages: true, segments: 64 }, { nom: 'haute', ratio: 1, nuages: true, segments: 96 }];
/* position du soleil (sous-solaire) approchée pour éclairer la Terre à l'heure réelle */
export function sousSolaire(t) {
  const d = new Date(t), j = (Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86400e3;
  const decl = -23.44 * Math.cos(2 * Math.PI / 365 * (j + 10)), h = d.getUTCHours() + d.getUTCMinutes() / 60;
  return { lat: decl, lon: (12 - h) * 15 };
}
/* météo Open-Meteo (code WMO) → texte court */
export function texteMeteo(code) {
  const T = { 0: 'Ciel clair', 1: 'Plutôt clair', 2: 'Partiellement nuageux', 3: 'Couvert', 45: 'Brouillard', 48: 'Brouillard givrant', 51: 'Bruine', 53: 'Bruine', 55: 'Bruine forte', 61: 'Pluie faible', 63: 'Pluie', 65: 'Forte pluie', 71: 'Neige faible', 73: 'Neige', 75: 'Forte neige', 80: 'Averses', 81: 'Averses', 82: 'Fortes averses', 95: 'Orage', 96: 'Orage et grêle', 99: 'Orage et grêle' };
  return T[code] || 'Météo';
}
