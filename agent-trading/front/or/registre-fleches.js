/* ═════════════ REGISTRE DES FLÈCHES H1 (pur, testé) : daté, en AJOUT SEUL ═════════════
   Une liste par version (fleches-v1 calculée en arrière-plan, fleches-h1-v2 affichée). Une flèche n'y entre qu'une fois, à la première
   fois qu'elle est vue, avec cette date ; une entrée n'est JAMAIS modifiée ni retirée. Chaque entrée porte l'empreinte de la précédente
   (chaîne) : une retouche ou une suppression se voit à la vérification. Navigateur : localStorage ; Node : fichier JSON (rapport local). */
export const CLE_REGISTRE = 'rayle_or_registre_fleches_h1';
export const VERSIONS = Object.freeze(['fleches-v1', 'fleches-h1-v2', 'fleches-h1-v3', 'fleches-h1-v4', 'fleches-h1-v5', 'fleches-h1-v6', 'fleches-h1-v7', 'fleches-h1-v8']);   // une liste par version ; ajouter une version n'en touche aucune autre

/* FNV-1a 32 bits en hexadécimal : simple, sans dépendance, identique navigateur / Node */
export function empreinte(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); }
const contenu = e => `${e.version}|${e.t}|${e.sens}|${Number(e.niveau).toFixed(4)}|${e.type}|${e.vu}|${e.prec}`;

export function registreVide(cree = Date.now()) { return { cree, versions: Object.fromEntries(VERSIONS.map(v => [v, []])) }; }
export function lireRegistre(brut, cree) {
  const r = brut && typeof brut === 'object' && brut.versions ? brut : registreVide(cree);
  for (const v of VERSIONS) if (!Array.isArray(r.versions[v])) r.versions[v] = [];
  return r;
}
/* ajoute les flèches nouvelles (t ≥ depuis, pas déjà présentes) ; renvoie un NOUVEAU registre et le nombre d'ajouts ; rien n'est modifié */
export function ajouter(reg, version, F, { depuis = 0, vu = Date.now() } = {}) {
  if (!VERSIONS.includes(version)) throw new Error('version inconnue : ' + version);
  const L = reg.versions[version], deja = new Set(L.map(e => `${e.t}|${e.sens}`)), nv = L.slice();
  let prec = L.length ? L[L.length - 1].h : '0', n = 0;
  for (const f of F.slice().sort((x, y) => x.t - y.t)) {
    if (f.t < depuis || deja.has(`${f.t}|${f.sens}`)) continue;
    const e = { version, t: f.t, sens: f.sens, niveau: +Number(f.niveau).toFixed(4), type: f.type, vu, prec };
    e.h = empreinte(contenu(e)); nv.push(Object.freeze(e)); prec = e.h; deja.add(`${f.t}|${f.sens}`); n++;
  }
  return { registre: { ...reg, versions: { ...reg.versions, [version]: nv } }, ajoutes: n };
}
/* vérifie la chaîne d'une version : { ok, n, erreur } */
export function verifier(reg, version) {
  const L = reg.versions[version] || []; let prec = '0';
  for (let k = 0; k < L.length; k++) { const e = L[k]; if (e.prec !== prec || empreinte(contenu(e)) !== e.h) return { ok: false, n: L.length, erreur: `entrée ${k + 1} retouchée ou chaîne rompue` }; prec = e.h; }
  return { ok: true, n: L.length };
}
/* fusion sûre avec ce qui est déjà stocké : on n'écrit que si le stocké est un préfixe exact du nouveau (jamais d'écrasement d'une entrée) */
export function prefixeDe(ancien, nouveau) {
  for (const v of VERSIONS) { const a = (ancien && ancien.versions && ancien.versions[v]) || [], b = nouveau.versions[v]; if (a.length > b.length) return false; for (let k = 0; k < a.length; k++) if (a[k].h !== b[k].h || empreinte(contenu(a[k])) !== a[k].h) return false; }
  return true;
}
/* les entrées comme flèches (pour le bilan) */
export const flechesDu = (reg, version) => (reg.versions[version] || []).map(e => ({ t: e.t, sens: e.sens, niveau: e.niveau, type: e.type, version }));
