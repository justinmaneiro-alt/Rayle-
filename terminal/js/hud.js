/* ═════════════ Petits outils communs des pages du terminal (rendu HUD animé) ═════════════ */
export const esc = x => String(x == null ? '' : x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const sansAnimation = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };

// Nombre à la française, décimales fixes
export function nombre(v, dec) {
  if (v == null || !isFinite(v)) return '—';
  return Number(v).toLocaleString('fr-FR', { minimumFractionDigits: dec == null ? 0 : dec, maximumFractionDigits: dec == null ? 2 : dec });
}
export const signe = (v, dec, unite) => v == null || !isFinite(v) ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + nombre(Math.abs(v), dec) + (unite || '');
export const sens = v => v == null || !isFinite(v) || v === 0 ? '' : v > 0 ? 'up' : 'down';

/* Chiffre qui défile vers sa nouvelle valeur. Les éléments à animer portent data-v (valeur), data-dec (décimales), data-pre / data-suf (texte autour). */
export function defiler(racine, duree) {
  const els = [...racine.querySelectorAll('[data-v][data-dec]')].filter(el => el.dataset.v !== '');
  if (!els.length) return;
  const d = sansAnimation() ? 0 : (duree || 800);
  const t0 = performance.now();
  const rendre = (el, v) => { el.textContent = (el.dataset.pre || '') + nombre(v, +el.dataset.dec) + (el.dataset.suf || ''); };
  if (!d) { els.forEach(el => rendre(el, +el.dataset.v)); return; }
  const depart = els.map(el => { const a = el.dataset.from; return a != null && a !== '' ? +a : 0; });
  const pas = now => {
    const k = Math.min(1, (now - t0) / d), e = 1 - Math.pow(1 - k, 3);
    els.forEach((el, i) => rendre(el, depart[i] + (+el.dataset.v - depart[i]) * e));
    if (k < 1) requestAnimationFrame(pas);
  };
  requestAnimationFrame(pas);
}
// Fait clignoter brièvement les cases dont la valeur a changé depuis le dernier rendu
export function clignoter(racine, avant) {
  if (sansAnimation() || !avant) return;
  racine.querySelectorAll('[data-k]').forEach(el => {
    const a = avant[el.dataset.k];
    if (a != null && a !== el.dataset.v) { el.classList.remove('tick-up', 'tick-down'); void el.offsetWidth; el.classList.add(+el.dataset.v > +a ? 'tick-up' : 'tick-down'); }
  });
}
export const instantane = racine => { const o = {}; racine.querySelectorAll('[data-k]').forEach(el => { o[el.dataset.k] = el.dataset.v; }); return o; };

export const hhmm = d => new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
export const jourCourt = iso => { const d = new Date(String(iso).slice(0, 10) + 'T12:00:00'); return isNaN(d) ? String(iso) : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }); };
export const jourLong = iso => { const d = new Date(String(iso).slice(0, 10) + 'T12:00:00'); return isNaN(d) ? String(iso) : d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }); };

/* Appel du Worker avec l'adresse et le code de Raylé (fournis par le bus). Lance une erreur lisible ; code 401 = code refusé. */
export async function appelWorker(chemin, opts, delai) {
  const c = RayleBus.demander('worker') || { url: '', token: '' };
  const base = String(c.url || '').replace(/\/+$/, '');
  if (!base) throw new Error('Worker non configuré (⚙ Réglages de Raylé)');
  const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), delai || 20000);
  let r;
  try { r = await fetch(base + chemin, Object.assign({}, opts, { headers: Object.assign({ 'X-Rayle-Token': String(c.token || '').trim() }, (opts && opts.headers) || {}), signal: ctl.signal })); }
  catch (e) { throw new Error(e.name === 'AbortError' ? 'le Worker ne répond pas (délai dépassé)' : 'Worker injoignable'); }
  finally { clearTimeout(tm); }
  let d = null; try { d = await r.json(); } catch (e) {}
  if (r.status === 401) { const er = new Error("code d'accès refusé"); er.code = 401; throw er; }
  if (!r.ok || !d || d.error) throw new Error((d && d.error) || ('erreur Worker HTTP ' + r.status));
  return d;
}

// Demande à Raylé (comme si Justin l'avait dit) : elle répond à voix haute avec ses outils
export function demanderARayle(texte) {
  try { return RayleBus.demander('rayle:demande', texte); } catch (e) { return false; }
}

/* Tracé d'une courbe SVG qui se dessine toute seule : renvoie le chemin 'M x y L x y …' */
export function chemin(points) { return points.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' '); }
