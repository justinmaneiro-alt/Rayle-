/* ═════════════ CARTE « LECTURE DU CARNET » : colle de carnet-lecture-v1.js (carte à côté du graphique, enregistreur forward en ajout seul, rapport local) ═════════════
   Quand le prix est à ≤ 0,25 ATR d'une boîte ou dedans, une petite carte apparaît avec une mini-bougie rouge (pression vendeuse), verte (acheteuse) ou grise, les mesures et un verdict d'une phrase.
   Chaque arrivée est enregistrée (déséquilibre, delta, mur, verdict) puis comparée au résultat à 6, 12 et 24 bougies H1. Garde le carnet existant et les grosses transactions tels quels. */
import * as C from './carnet-lecture-v1.js';
const CLE_FWD = 'rayle_or_carnet_forward', H = 3600e3;
const lire = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const ecrire = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nb = (x, d = 0) => (x == null || !Number.isFinite(x) ? '—' : Number(x).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/[  ]/g, ' '));

export function creerCarteCarnet({ racine, flux = () => null, zones = () => [], atr = () => null, prix = () => null, barres = () => [], maintenant = () => Date.now(), parler = () => {}, auto = true, surTick = () => {} } = {}) {
  const E = { registre: lire(CLE_FWD, []), suivi: C.creerSuiviMurs(), lecture: null, zone: null, injecte: null, dernierParZone: new Map() };
  const q = s => racine && racine.querySelector(s);
  if (!document.querySelector('link[data-rayle-css]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = new URL('./rayle.css', import.meta.url).href; l.dataset.rayleCss = ''; document.head.appendChild(l); }
  let carte = q('[data-ray-carte]');
  if (!carte && racine) { carte = document.createElement('aside'); carte.className = 'tor-ray-carte'; carte.dataset.rayCarte = ''; carte.hidden = true; carte.setAttribute('aria-live', 'polite'); const g = q('.tor-graph'); (g || racine).appendChild(carte); }
  const source = () => E.injecte || (() => { const f = flux(); const c = f && f.carnet && f.carnet(); return c && c.pret ? { carnet: c, trades: f.transactions() } : null; })();
  /* zone concernée : la zone valide la plus proche dont le voisinage (± 0,25 ATR) contient le prix */
  function zoneDArrivee(p, a) {
    let meilleure = null, dist = Infinity;
    for (const z of zones()) { if (z.invalide) continue; const d = p < z.bas ? z.bas - p : p > z.haut ? p - z.haut : 0; if (d <= C.P.arriveeAtr * a && d < dist) { dist = d; meilleure = z; } }
    return meilleure;
  }
  function enregistrer(z, l, now) {
    const cle = `${z.id}|${z.tFormation}`, dernier = E.dernierParZone.get(cle) ?? E.registre.filter(r => r.kind === 'arrivee' && r.cle === cle).reduce((m, r) => Math.max(m, r.t), 0);
    if (now - dernier < 24 * H) return null;
    const id = `${cle}|${now}`; E.dernierParZone.set(cle, now);
    E.registre.push({ kind: 'arrivee', id, cle, t: now, cote: z.cote, zonePrix: z.prix, ref: l.mid, atr: l.atr, conf: z.conf, pourZone: l.pourZone, pression: l.pression, verdict: l.texte, mesures: l.mesures });
    return id;
  }
  function resultats() {
    const B = barres(); if (!B.length) return;
    for (const a of E.registre.filter(r => r.kind === 'arrivee')) for (const h of C.P.horizons) {
      if (E.registre.some(r => r.kind === 'resultat' && r.id === a.id && r.h === h)) continue; const i = C.issueForward(B, Math.ceil(a.t / H) * H, a.ref, a.cote, a.atr, h); if (i === null) continue;
      E.registre.push({ kind: 'resultat', id: a.id, h, issue: i, t: maintenant() });
    }
  }
  function compterClasse(pourZone) { return E.registre.filter(r => r.kind === 'arrivee' && r.pourZone === pourZone).length; }
  function tick() {
    const now = maintenant(), a = atr(), p = prix(), s = source();
    if (!s || !(a > 0) || p == null) { E.lecture = null; E.zone = null; rendre(); surTick(); return null; }
    const mid = C.milieu(s.carnet); const px = mid ? mid.mid : p, z = zoneDArrivee(px, a);
    const suivi = mid ? E.suivi.maj(s.carnet, s.trades, now, mid.mid, a) : null;
    if (!z) { E.lecture = null; E.zone = null; rendre(); surTick(); return null; }
    const l = C.lire({ carnet: s.carnet, trades: s.trades, now, atr: a, zone: z, suivi }); E.lecture = l.ok ? l : null; E.zone = z;
    if (l.ok) { const id = enregistrer(z, l, now); if (id) { if (E.registre.length > 3000) E.registre.splice(0, E.registre.length - 3000); } resultats(); ecrire(CLE_FWD, E.registre); }
    rendre(); surTick(); return E.lecture;
  }
  function rendre() {
    if (carte) {
      const l = E.lecture, z = E.zone; carte.hidden = !l;
      if (l && z) {
        const cl = l.bougie.couleur, n = compterClasse(l.pourZone), h = Math.round(28 + 44 * l.bougie.corps);
        carte.dataset.pression = l.pression;
        const html = `<div class="tor-ray-carte-t"><span class="tor-ray-bougie ${esc(cl)}" aria-hidden="true"><i style="height:${h}%"></i></span><b>Carnet · ${esc(z.cote === 'vente' ? 'zone de vente' : 'zone d’achat')} ${esc(nb(z.prix, 0))}</b></div>
          <p>${esc(l.texte)}</p>
          <ul><li>ordres dans ±${esc(nb(l.mesures.largeur, 0))} $ : ${l.mesures.partAcheteurs != null ? Math.round(l.mesures.partAcheteurs * 100) + ' % achat / ' + Math.round(l.mesures.partVendeurs * 100) + ' % vente' : '—'}</li>
          <li>flux exécuté : ${l.mesures.delta1 >= 0 ? '+' : '−'}${esc(nb(Math.abs(l.mesures.delta1), 0))} (1 min), ${l.mesures.delta5 >= 0 ? '+' : '−'}${esc(nb(Math.abs(l.mesures.delta5), 0))} (5 min)</li>
          <li>${l.mesures.mur ? `plus gros mur : ${esc(nb(l.mesures.mur.q, 0))} lots à ${esc(nb(l.mesures.mur.p, 2))}, ${esc(nb(l.mesures.mur.x, 1))} fois la médiane` : 'aucun mur marqué'}</li>
          ${l.mesures.murRetire ? `<li>mur retiré : ${esc(nb(l.mesures.murRetire.q, 0))} lots à ${esc(nb(l.mesures.murRetire.p, 2))} (${esc(l.mesures.murRetire.raison)})</li>` : ''}</ul>
          <small>${esc(C.mentionValidation(n))}</small> <button type="button" data-a="ray-lire-carnet">Lire à voix haute</button>`; if (carte.dataset.h !== html) { carte.dataset.h = html; carte.innerHTML = html; }
      } else if (carte.dataset.h !== '') { carte.dataset.h = ''; carte.innerHTML = ''; }
    }
    const r = q('[data-ray-carnet-corps]'); if (r) { const R = rapport(); r.innerHTML = `<p class="tor-doux"><b>Lecture du carnet</b> (enregistreur forward, ${R.arrivees} arrivée${R.arrivees > 1 ? 's' : ''} sur une boîte) : ${esc(R.phrases[0])}</p>`; }
  }
  const rapport = () => C.rapportForward(E.registre);
  if (carte) carte.addEventListener('click', ev => { if (ev.target.closest('[data-a="ray-lire-carnet"]') && E.lecture) { try { parler(E.lecture.texte + ' Lecture en observation, non validée.'); } catch (e) { /* */ } } });
  let minuterie = null; if (auto) minuterie = setInterval(() => { try { tick(); } catch (e) { console.warn('carnet Rayle :', e.message); } }, 1000);
  return { tick, rapport, lecture: () => E.lecture, zone: () => E.zone, registre: () => E.registre.slice(), injecter(s) { E.injecte = s; }, texteLecture: () => (E.lecture ? E.lecture.texte : null), detruire() { clearInterval(minuterie); } };
}
