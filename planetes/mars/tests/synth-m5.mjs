import { depuisBougies } from '../pc/agent-btc/colonnes.js';
import { alea } from '../pc/mars-calcul.js';

/* Marché synthétique pour les tests M5. Le rendement de chaque bougie M15 = bruit + dérive(heure UTC).
   - `derive(heure)` = rendement moyen par bougie en % (0 = marche au hasard pur : AUCUN avantage possible, sert à vérifier qu'on ne valide rien par chance) ;
   - un avantage planté (par exemple +0,09 % par bougie entre 14 h et 15 h UTC) sert à vérifier que le protocole sait valider une vraie stratégie. */
export function marcheM5({ n = 110000, graine = 21, bruitPct = 0.12, derive = () => 0, t0 = Date.UTC(2019, 0, 1), prix = 8000, centrer = false } = {}) {
  const a = alea(graine), gauss = () => { let s = 0; for (let i = 0; i < 12; i++) s += a(); return s - 6; }, out = [];
  let moy = 0; if (centrer) { for (let k = 0; k < 96; k++) moy += derive(k / 4, 0); moy /= 96; }          // centrer : la dérive moyenne sur 24 h est retirée, le prix reste réaliste (pas d'explosion)
  let p = prix;
  for (let i = 0; i < n; i++) {
    const t = t0 + i * 900e3, h = (t % 86400e3) / 3600e3, r = (derive(h, t) - moy + bruitPct * gauss()) / 100, o = p, c = o * Math.exp(r);
    const meche = Math.abs(gauss()) * bruitPct / 100 * 0.6, hh = Math.max(o, c) * (1 + meche), ll = Math.min(o, c) * (1 - Math.abs(gauss()) * bruitPct / 100 * 0.6);
    const v = 50 + a() * 100, vb = v * (0.5 + 0.25 * Math.tanh(r * 400) + (a() - 0.5) * 0.1);
    out.push({ t, o, h: hh, l: ll, c, v, vb }); p = c;
  }
  return depuisBougies(out);
}

/* Avantage planté des tests : +0,45 % par bougie de 14 h à 16 h UTC (une envolée d environ 3,6 % chaque jour), compensé par −0,225 % de 3 h à 7 h pour que le prix reste réaliste. Assez fort pour survivre à un
   compteur de variantes de plus de 200 000 (le compteur d'un état neuf démarre au total des essais antérieurs : voir essais-anterieurs.js) ; un avantage plus faible serait, à raison, démasqué comme du hasard. */
export const DERIVE_PLANTEE = h => (h >= 14 && h < 16 ? 0.45 : h >= 3 && h < 7 ? -0.225 : 0);
