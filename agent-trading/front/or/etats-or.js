/* ═════════════ RAYLE COMPREND LE GRAPHIQUE : états du prix face à une zone, événements, anti-bruit (pur, testé) ═════════════
   Règles figées « zones-or-v1 » (config-or.js, TEXTE_REGLES). Le prix et les zones sont comparés dans le MÊME repère (référence Binance) ;
   l'affichage ajoute l'écart Kraken − Binance. Jamais d'ordre : des constats. */
import { REGLES } from './config-or.js';
import { mediane } from './bougies-or.js';

/* état continu du prix face à une zone (a = ATR H1) */
export function etatZone(prix, z, a, R = REGLES) {
  if (!a || !(prix > 0)) return 'inconnu';
  const d = prix > z.haut ? prix - z.haut : prix < z.bas ? z.bas - prix : 0;
  return d <= R.sur * a ? 'sur' : d <= R.approche * a ? 'approche' : 'loin';
}
/* événement à la clôture de la DERNIÈRE bougie M15 (m15 de référence avec volume et delta) : « rejet », « cassure » ou null */
export function evenementZone(m15, z, a, R = REGLES) {
  const n = m15.length; if (n < R.volumeMedianeN + 3 || !a) return null;
  const b = m15[n - 1], prec = m15[n - 2], med = mediane(m15.slice(n - 1 - R.volumeMedianeN, n - 1).map(x => x.v)), vol = b.v >= med;
  // le prix doit avoir été sur la zone (à 0,25 ATR près) pendant l'une des 3 bougies précédentes ou celle-ci
  const touche = m15.slice(n - 4).some(x => x.l <= z.haut + R.sur * a && x.h >= z.bas - R.sur * a); if (!touche) return null;
  const venu = m15.slice(n - 8, n - 3).reduce((s, x) => s + x.c, 0) / 5;   // d'où vient le prix : moyenne des clôtures avant le toucher
  const support = venu > z.haut, resistance = venu < z.bas;
  const dPrec = prec.d ?? 0, dCur = b.d ?? 0;
  if (support) {
    if (b.c <= z.bas - R.cassureEcart * a && vol) return { type: 'cassure', sens: 'baisse', vol, t: b.t };
    if (b.c >= z.haut + R.rejetEcart * a && vol && dCur > 0 && dPrec <= 0) return { type: 'rejet', sens: 'hausse', vol, t: b.t };
  } else if (resistance) {
    if (b.c >= z.haut + R.cassureEcart * a && vol) return { type: 'cassure', sens: 'hausse', vol, t: b.t };
    if (b.c <= z.bas - R.rejetEcart * a && vol && dCur < 0 && dPrec >= 0) return { type: 'rejet', sens: 'baisse', vol, t: b.t };
  }
  return null;
}

/* anti-bruit : un seul message par zone et par événement, 60 min avant de répéter, plafond par jour, heures calmes, bouton couper */
export function creerAntiBruit({ repetitionMin = REGLES.repetitionMin, plafond = REGLES.plafondJour, calme = REGLES.calme } = {}) {
  const vus = new Map(); let jour = null, n = 0, coupe = false, reglages = { repetitionMin, plafond, calme: { ...calme, actif: true } };
  return {
    reglages: () => ({ ...reglages, coupe }),
    regler(o) { reglages = { ...reglages, ...o, calme: { ...reglages.calme, ...(o.calme || {}) } }; },
    couper(v = true) { coupe = v; },
    /* renvoie { ok, raison } ; heure = heure de Paris (0-23), cleJour = date de Paris */
    autoriser(cle, t, heure, cleJour) {
      if (coupe) return { ok: false, raison: 'coupé' };
      if (jour !== cleJour) { jour = cleJour; n = 0; }
      const c = reglages.calme; if (c.actif && (c.de > c.a ? (heure >= c.de || heure < c.a) : (heure >= c.de && heure < c.a))) return { ok: false, raison: 'heures calmes' };
      const v = vus.get(cle); if (v != null && t - v < reglages.repetitionMin * 60e3) return { ok: false, raison: 'déjà dit il y a moins de ' + reglages.repetitionMin + ' min' };
      if (n >= reglages.plafond) return { ok: false, raison: 'plafond du jour atteint' };
      vus.set(cle, t); n++; return { ok: true, raison: null };
    },
    compte: () => n
  };
}
