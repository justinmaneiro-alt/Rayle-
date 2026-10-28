"use strict";
/* ═════════════ PAQUETS BINAIRES DE POINTS DE MAIN (V5) : partagé par la page « Caméra Rayle » du téléphone et la page Rayle du PC ═════════════
   Un paquet = 16 octets d'en-tête + 84 octets par main (21 repères × x,y sur 16 bits) : ≈ 100 à 190 octets au lieu de ≈ 2,4 Ko en JSON, donc rien ne s'accumule sur la liaison.
   En-tête (petit-boutiste) : [0] version (1) · [1] drapeaux (bits 0-1 : nombre de mains ; bit 2 : main 1 = « Right » ; bit 3 : main 2 = « Right ») · [2-3] numéro de séquence (16 bits, boucle) ·
   [4-11] heure du téléphone en ms (Float64) · [12-13] rapport largeur/hauteur × 1000 · [14] durée capture→détection sur le téléphone en ms (≤ 255) · [15] confiance de détection (0…255).
   Coordonnées quantifiées sur 16 bits dans [−1 ; 2] : erreur maximale 2,3 × 10⁻⁵ (moins d'un millième de pixel). Aucune image : seulement des coordonnées.
   Suivi de réception : les paquets arrivent non ordonnés (DataChannel non fiable) ; un paquet plus ancien que le dernier vu est ÉCARTÉ (jamais de file d'attente), les manques sont comptés comme pertes. */
(function (racine) {
  const VERSION = 1, ENTETE = 16, PAR_MAIN = 84, MIN = -1, ETENDUE = 3;
  const q = v => Math.max(0, Math.min(65535, Math.round((v - MIN) / ETENDUE * 65535)));
  const dq = n => n / 65535 * ETENDUE + MIN;

  /* trame : { t, ratio, mains:[{ lat:'Left'|'Right', pts:[[x,y]…21] }], seq, dt, conf (0…1) } → ArrayBuffer */
  function encoder(trame) {
    const mains = (trame.mains || []).slice(0, 2), buf = new ArrayBuffer(ENTETE + PAR_MAIN * mains.length), vue = new DataView(buf);
    let drap = mains.length;
    if (mains[0] && mains[0].lat === 'Right') drap |= 4; if (mains[1] && mains[1].lat === 'Right') drap |= 8;
    vue.setUint8(0, VERSION); vue.setUint8(1, drap); vue.setUint16(2, (trame.seq || 0) & 0xFFFF, true); vue.setFloat64(4, trame.t, true);
    vue.setUint16(12, Math.max(0, Math.min(65535, Math.round((trame.ratio || 4 / 3) * 1000))), true);
    vue.setUint8(14, Math.max(0, Math.min(255, Math.round(trame.dt || 0)))); vue.setUint8(15, Math.max(0, Math.min(255, Math.round((trame.conf == null ? 1 : trame.conf) * 255))));
    mains.forEach((m, k) => { let o = ENTETE + PAR_MAIN * k; for (let i = 0; i < 21; i++) { vue.setUint16(o, q(m.pts[i][0]), true); vue.setUint16(o + 2, q(m.pts[i][1]), true); o += 4; } });
    return buf;
  }
  /* ArrayBuffer → trame { a:'mains', t, ratio, mains, seq, dt, conf } ou null (paquet mal formé : ignoré). */
  function decoder(buf) {
    if (!buf || typeof buf.byteLength !== 'number' || buf.byteLength < ENTETE) return null;
    const vue = new DataView(buf.buffer && buf.buffer !== buf ? buf.buffer : buf, buf.byteOffset || 0, buf.byteLength);
    if (vue.getUint8(0) !== VERSION) return null;
    const drap = vue.getUint8(1), n = drap & 3; if (n > 2 || buf.byteLength !== ENTETE + PAR_MAIN * n) return null;
    const t = vue.getFloat64(4, true); if (!isFinite(t)) return null;
    const mains = []; for (let k = 0; k < n; k++) { let o = ENTETE + PAR_MAIN * k; const pts = []; for (let i = 0; i < 21; i++) { pts.push([dq(vue.getUint16(o, true)), dq(vue.getUint16(o + 2, true)), 0]); o += 4; } mains.push({ lat: drap & (4 << k) ? 'Right' : 'Left', pts }); }
    return { a: 'mains', t, ratio: vue.getUint16(12, true) / 1000, mains, seq: vue.getUint16(2, true), dt: vue.getUint8(14), conf: vue.getUint8(15) / 255 };
  }

  /* Écart de séquence sur 16 bits avec bouclage : > 0 = plus récent que `precedent`, < 0 = plus ancien. */
  const ecartSeq = (seq, precedent) => { let d = (seq - precedent) & 0xFFFF; if (d > 32767) d -= 65536; return d; };

  /* Suivi de réception : débit (paquets utiles/s), pertes (manques de séquence sur ~2 s), paquets écartés (en retard), gigue. `horloge` injectable pour les tests. */
  function creerSuivi(horloge = () => Date.now()) {
    let dernier = null, vus = [], vus2 = [], manques = [], ecartes = 0, total = 0, perdusTotal = 0, intervalles = [], tPrec = 0;
    const purge = t => { while (vus.length && t - vus[0] > 1000) vus.shift(); while (vus2.length && t - vus2[0] > 2000) vus2.shift(); while (manques.length && t - manques[0].t > 2000) manques.shift(); };
    return {
      /* Renvoie 'ok' (à traiter), 'ancien' (écarté : plus vieux que le dernier vu) ou 'doublon'. */
      noter(seq) {
        const t = horloge();
        if (seq == null) { vus.push(t); vus2.push(t); total++; purge(t); return 'ok'; }
        if (dernier === null) { dernier = seq; vus.push(t); vus2.push(t); total++; tPrec = t; return 'ok'; }
        const d = ecartSeq(seq, dernier);
        if (d === 0) return 'doublon';
        if (d < 0) { ecartes++; return 'ancien'; }
        if (d > 1) { manques.push({ t, n: d - 1 }); perdusTotal += d - 1; }
        dernier = seq; vus.push(t); vus2.push(t); total++; if (tPrec) { intervalles.push(t - tPrec); if (intervalles.length > 120) intervalles.shift(); } tPrec = t; purge(t); return 'ok';
      },
      stats() {
        const t = horloge(); purge(t); const perdus = manques.reduce((s, m) => s + m.n, 0), recus = vus.length, recus2 = vus2.length;   // la perte se mesure sur 2 s, le débit sur 1 s
        const moy = intervalles.length ? intervalles.reduce((s, x) => s + x, 0) / intervalles.length : 0, gigue = intervalles.length ? Math.sqrt(intervalles.reduce((s, x) => s + (x - moy) * (x - moy), 0) / intervalles.length) : 0;
        return { debit: recus, perdusRecents: perdus, perte: recus2 + perdus ? perdus / (recus2 + perdus) : 0, ecartes, total, perdusTotal, gigue: +gigue.toFixed(1) };
      },
      reinitialiser() { dernier = null; vus = []; vus2 = []; manques = []; ecartes = 0; total = 0; perdusTotal = 0; intervalles = []; tPrec = 0; }
    };
  }

  /* Délai bout en bout estimé (ms) : capture + détection sur le téléphone + moitié de l'aller-retour réseau + traitement sur le PC. null si l'aller-retour est inconnu. */
  const delaiBoutEnBout = (dtTelephone, rttMs, traitementPcMs) => rttMs == null ? null : Math.round((dtTelephone || 0) + rttMs / 2 + (traitementPcMs || 0));

  /* Conseil court quand le débit tombe sous 25 paquets/s (ou que le délai est trop grand). */
  function conseil({ debit = 0, perte = 0, delai = null, mainsVues = true, actif = true } = {}) {
    if (!actif) return '';
    if (!mainsVues && debit < 25) return '';   // sans main le téléphone n'envoie qu'un battement : c'est normal
    if (debit >= 25 && (delai == null || delai < 80) && perte < 0.15) return '';
    if (perte >= 0.15) return 'Beaucoup de paquets perdus : rapproche le téléphone du routeur Wi-Fi ou passe en 5 GHz.';
    if (debit < 25) return debit < 12 ? 'Débit très bas : plus de lumière sur la main, rapproche-la du téléphone, ferme l’aperçu (mode économie).' : 'Débit sous 25/s : plus de lumière, rapproche la main (40 à 60 cm), ferme l’aperçu sur le téléphone.';
    return 'Délai élevé : ferme les autres applications du téléphone et vérifie le Wi-Fi.';
  }

  racine.PaquetBinaire = { VERSION, ENTETE, PAR_MAIN, encoder, decoder, ecartSeq, creerSuivi, delaiBoutEnBout, conseil };
  if (typeof module !== 'undefined' && module.exports) module.exports = racine.PaquetBinaire;
})(typeof globalThis !== 'undefined' ? globalThis : window);
