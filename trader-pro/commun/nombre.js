/* ═════════════ NOMBRES SAISIS : virgule ET point décimal acceptés partout ═════════════
   lireNombre('0,1') = lireNombre('0.1') = 0,1 ; « 1 234,5 », « 1.234,5 » et « 1,234.5 » valent 1234,5 ; un vide ou un texte sans chiffre rend null (jamais 0 par défaut).
   installerSaisieNombres() : surveille les champs inputmode="decimal" de la page ; une virgule « exotique » (virgule arabe, virgule pleine chasse…) devient « , » et tout caractère étranger est retiré,
   mais la virgule ou le point tapé n'est JAMAIS supprimé. Testable sous Node (lireNombre est pur). */
const NORMES = { '٫': ',', '‚': ',', '，': ',', '．': '.', '․': '.', '−': '-', '–': '-', '—': '-', '﹣': '-', '－': '-' };

export function lireNombre(s) {
  if (typeof s === 'number') return Number.isFinite(s) ? s : null;
  let t = String(s == null ? '' : s).replace(/[\s   ']/g, '').replace(/[٫‚，．․−–—﹣－]/g, c => NORMES[c]);
  if (!/\d/.test(t)) return null;
  const signe = /^[-+]/.test(t) ? t[0] : ''; t = t.replace(/^[-+]/, '').replace(/[^\d.,]/g, '');
  const iv = t.lastIndexOf(','), ip = t.lastIndexOf('.'), nv = (t.match(/,/g) || []).length, np = (t.match(/\./g) || []).length;
  let dec = null;
  if (iv >= 0 && ip >= 0) dec = iv > ip ? ',' : '.';            // les deux : le dernier est la décimale, l'autre sépare les milliers
  else if (nv === 1) dec = ','; else if (np === 1) dec = '.';    // un seul séparateur : c'est la décimale (« 0,1 » vaut 0,1)
  let ent = t, fra = '';
  if (dec) { const i = t.lastIndexOf(dec); ent = t.slice(0, i); fra = t.slice(i + 1); }
  ent = ent.replace(/[.,]/g, ''); if (!ent && !fra) return null;
  const v = parseFloat((signe === '-' ? '-' : '') + (ent || '0') + (fra ? '.' + fra : ''));
  return Number.isFinite(v) ? v : null;
}
/* même chose, mais 0 quand le champ est vide ou illisible */
export const lireNombreOuZero = s => { const v = lireNombre(s); return v == null ? 0 : v; };

/* nettoie un texte en cours de saisie : garde chiffres, signe, un seul séparateur décimal (le premier tapé) et les espaces ; ne touche jamais à un « , » ou « . » légitime */
export function nettoyerSaisie(txt) {
  let t = String(txt == null ? '' : txt).replace(/[٫‚，．․−–—﹣－]/g, c => NORMES[c]);
  t = t.replace(/[^\d.,\s  \-+]/g, ''); return t;
}

let installe = false;
export function installerSaisieNombres(doc = (typeof document !== 'undefined' ? document : null)) {
  if (!doc || installe) return false; installe = true;
  doc.addEventListener('input', e => {
    const c = e.target; if (!c || c.tagName !== 'INPUT' || String(c.getAttribute('inputmode')).toLowerCase() !== 'decimal') return;
    const v = c.value, n = nettoyerSaisie(v); if (n === v) return;
    const pos = c.selectionStart; c.value = n; try { c.setSelectionRange(Math.min(pos == null ? n.length : pos, n.length), Math.min(pos == null ? n.length : pos, n.length)); } catch (er) { /* champ sans sélection */ }
  }, true);
  return true;
}
