/* ═════════════ APERÇU IMMÉDIAT DU TERMINAL : les dernières bougies enregistrées sur l'appareil ═════════════
   Avant même que le terminal (cadre or.html) ait chargé ses modules, on dessine la dernière copie locale des bougies (IndexedDB « rayle-or-cache », celle du terminal)
   à la place des fausses bougies grises. Rien n'est inventé : la copie est datée, étiquetée « enregistré il y a … » et disparaît quand le vrai graphique est prêt.
   Aucune copie (premier lancement, navigation privée) : on garde le squelette gris. */
const DB = 'rayle-or-cache', ST = 'historique';
const PERIODES = ['H1', 'H4', 'J'];   // M5 et M15 ne sont plus proposées

/* lit la copie la plus récente de la période demandée (toutes les clés « <actif>|<période> ») */
export function lireApercu(periode, { indexedDBImpl = (typeof indexedDB !== 'undefined' ? indexedDB : null), delai = 1500 } = {}) {
  return new Promise(res => {
    if (!indexedDBImpl) { res(null); return; }
    const fin = v => { clearTimeout(t); res(v); }, t = setTimeout(() => res(null), delai);
    try {
      const r = indexedDBImpl.open(DB, 1); r.onerror = r.onblocked = () => fin(null);
      r.onupgradeneeded = () => { try { r.transaction.abort(); } catch (e) { /* base absente */ } };
      r.onsuccess = () => {
        try {
          const db = r.result, q = db.transaction(ST, 'readonly').objectStore(ST).openCursor(); let meilleur = null;
          q.onsuccess = () => { const c = q.result; if (!c) { db.close(); fin(meilleur); return; } const k = String(c.key), v = c.value; if (k.endsWith('|' + periode) && v && v.v && Array.isArray(v.v.k) && v.v.k.length > 30 && (!meilleur || v.t > meilleur.t)) meilleur = { cle: k, t: v.t, bougies: v.v.k }; c.continue(); };
          q.onerror = () => fin(null);
        } catch (e) { fin(null); }
      };
    } catch (e) { fin(null); }
  });
}
export const periodeEnregistree = () => { try { const p = JSON.parse(localStorage.getItem('rayle_or_periode') || 'null'); return PERIODES.includes(p) ? p : 'H1'; } catch (e) { return 'H1'; } };

/* dessine les n dernières bougies [{t,o,h,l,c}] ; renvoie false si le canevas n'est pas utilisable */
export function dessinerBougies(canvas, B, n = 90) {
  const L = B.slice(-n), ctx = canvas.getContext && canvas.getContext('2d'); if (!ctx || L.length < 5) return false;
  const dpr = Math.min(2, window.devicePixelRatio || 1), W = canvas.clientWidth || 600, H = canvas.clientHeight || 300; canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); ctx.scale(dpr, dpr);
  const hi = Math.max(...L.map(b => b.h)), lo = Math.min(...L.map(b => b.l)), pad = (hi - lo) * 0.08 || 1, y = v => H - 24 - ((v - (lo - pad)) / (hi - lo + 2 * pad)) * (H - 48), pas = (W - 64) / L.length;
  ctx.clearRect(0, 0, W, H); ctx.lineWidth = 1; ctx.font = '11px system-ui, sans-serif'; ctx.fillStyle = '#7d8f99'; ctx.strokeStyle = 'rgba(125,143,153,.15)';
  for (let i = 0; i <= 4; i++) { const v = lo + (hi - lo) * i / 4, yy = Math.round(y(v)) + 0.5; ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(W - 56, yy); ctx.stroke(); ctx.fillText(v.toLocaleString('fr-FR', { maximumFractionDigits: v > 1000 ? 0 : 2 }), W - 54, yy + 4); }
  L.forEach((b, i) => { const x = 4 + i * pas + pas / 2, h = b.c >= b.o, col = h ? '#5fb894' : '#d86a6a'; ctx.strokeStyle = col; ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, y(b.h)); ctx.lineTo(Math.round(x) + 0.5, y(b.l)); ctx.stroke(); const y1 = y(Math.max(b.o, b.c)), y2 = y(Math.min(b.o, b.c)); ctx.fillRect(x - Math.max(1, pas * 0.32), y1, Math.max(2, pas * 0.64), Math.max(1, y2 - y1)); });
  return true;
}
const phraseAge = ms => { const m = Math.round(ms / 60000); return m < 1 ? 'à l’instant' : m < 60 ? 'il y a ' + m + ' min' : m < 1440 ? 'il y a ' + Math.round(m / 60) + ' h' : 'il y a ' + Math.round(m / 1440) + ' j'; };

/* remplace les fausses bougies du squelette `sq` par l'aperçu réel, si une copie existe */
export async function monterApercu(sq, { maintenant = Date.now() } = {}) {
  const p = periodeEnregistree(), a = await lireApercu(p); if (!a || !sq.isConnected) return false;
  const zone = sq.querySelector('.tr-sq-b'), txt = sq.querySelector('p'); if (!zone) return false;
  const c = document.createElement('canvas'); c.className = 'tr-apercu'; c.style.cssText = 'width:100%;height:100%;display:block'; zone.replaceChildren(c); zone.style.cssText = 'height:62%;width:100%;align-items:stretch;gap:0';
  if (!dessinerBougies(c, a.bougies)) return false;
  if (txt) txt.textContent = 'Dernier graphique enregistré (' + phraseAge(maintenant - a.t) + ') · mise à jour en cours…';
  sq.dataset.apercu = a.cle; return true;
}
