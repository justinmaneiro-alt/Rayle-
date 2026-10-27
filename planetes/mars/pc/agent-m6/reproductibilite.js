/* ═════════════ REPRODUCTIBILITÉ ET RÉSILIENCE (M6 ; module pur, testé : planetes/mars/tests/m6-fiabilite-test.mjs) ═════════════
   - Empreinte (hachage 64 bits non cryptographique, deux FNV-1a croisés) : sert à reconnaître des données ou un état, PAS à protéger contre un attaquant.
   - Résultat signé : chaque résultat d'agent porte la VERSION DU CODE, l'EMPREINTE DES DONNÉES (paire, plage, nombre de bougies), la GRAINE et l'empreinte des critères ; deux fois les mêmes entrées = le même résultat.
   - Sauvegardes : enveloppe avec somme de contrôle (une corruption se détecte), rotation des N dernières, restauration de la dernière valide. Stockage injecté (IndexedDB, fichier ou mémoire). */
export const VERSION_CODE_M6 = 'm6.1';

/* Hachage 64 bits (deux passes FNV-1a 32 bits avec des graines différentes), hexadécimal de 16 caractères. */
export function empreinte(texte) {
  let h1 = 0x811c9dc5, h2 = 0x9747b28c;
  for (let i = 0; i < texte.length; i++) { const c = texte.charCodeAt(i); h1 = Math.imul(h1 ^ c, 0x01000193); h2 = Math.imul(h2 ^ (c + i % 7), 0x01000193) ^ (h1 >>> 13); }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}
/* Empreinte d'une série en colonnes : t, o, h, l, c, v (le delta vb compte aussi s'il existe). */
export function empreinteSerie(s, a = 0, b = s.n) {
  let h1 = 0x811c9dc5, h2 = 0x9747b28c;
  const champs = ['t', 'o', 'h', 'l', 'c', 'v', 'vb'].filter(k => s[k]), f64 = new Float64Array(1), u32 = new Uint32Array(f64.buffer);   // les 64 bits exacts de chaque nombre (les prix de DOGE sont minuscules)
  for (const k of champs) {
    const col = s[k];
    for (let i = a; i < b; i++) {
      f64[0] = Number.isNaN(col[i]) ? 7 : col[i];
      for (let w = 0; w < 2; w++) { const m = u32[w]; h1 = Math.imul(h1 ^ m, 0x01000193); h2 = Math.imul(h2 ^ (m + 0x9e3779b9), 0x85ebca6b) ^ (h1 >>> 11); }
    }
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}
export const resumeDonnees = (paire, s, source) => ({ paire, source: source || null, n: s.n, debut: s.n ? s.t[0] : null, fin: s.n ? s.t[s.n - 1] : null, empreinte: empreinteSerie(s) });

/* Signe un résultat (objet JSON-isable) avec ses conditions de production. Le sceau couvre résultat + méta : modifier l'un ou l'autre le casse. */
export function signerResultat(resultat, { donnees = null, graine = null, criteres = null, config = null, codeVersion = VERSION_CODE_M6 } = {}) {
  const meta = { codeVersion, donnees, graine, criteres, config };
  return { resultat, meta, sceau: empreinte(JSON.stringify(resultat) + '|' + JSON.stringify(meta)) };
}
export function verifierResultat(r) {
  if (!r || !r.meta || r.sceau == null) return { ok: false, raison: 'résultat non signé' };
  return empreinte(JSON.stringify(r.resultat) + '|' + JSON.stringify(r.meta)) === r.sceau ? { ok: true } : { ok: false, raison: 'le sceau ne correspond plus : résultat modifié' };
}
/* Deux résultats sont « comparables » si le code, les données et la graine sont les mêmes : sinon leur écart s'explique par ces différences, pas par le hasard. */
export function memesConditions(a, b) {
  const x = a.meta, y = b.meta; const diffs = [];
  if (x.codeVersion !== y.codeVersion) diffs.push('version du code'); if (JSON.stringify(x.donnees) !== JSON.stringify(y.donnees)) diffs.push('données'); if (x.graine !== y.graine) diffs.push('graine'); if (JSON.stringify(x.criteres) !== JSON.stringify(y.criteres)) diffs.push('critères');
  return { memes: diffs.length === 0, differences: diffs };
}

/* ── Sauvegardes ── */
export function emballer(etat, { genre = 'etat', t = Date.now(), codeVersion = VERSION_CODE_M6 } = {}) {
  const contenu = JSON.stringify(etat);
  return { format: 'rayle-sauvegarde-1', genre, t, codeVersion, taille: contenu.length, somme: empreinte(contenu), contenu };
}
export function deballer(env) {
  if (!env || env.format !== 'rayle-sauvegarde-1' || typeof env.contenu !== 'string') throw new Error('sauvegarde illisible');
  if (env.contenu.length !== env.taille) throw new Error('sauvegarde tronquée (taille ' + env.contenu.length + ' au lieu de ' + env.taille + ')');
  if (empreinte(env.contenu) !== env.somme) throw new Error('sauvegarde corrompue (somme de contrôle différente)');
  return JSON.parse(env.contenu);
}
/* Rotation : garde les `garder` dernières sauvegardes de chaque genre sous les clés « sauvegarde:<genre>:<t> ». `stockage` = { lire(k), ecrire(k, v), supprimer(k), liste() } (asynchrone). */
export function creerSauvegardes(stockage, { garder = 5, maintenant = () => Date.now() } = {}) {
  const prefixe = g => 'sauvegarde:' + g + ':';
  const cles = async g => (await stockage.liste()).filter(k => String(k).startsWith(prefixe(g))).sort();
  return {
    async sauver(genre, etat) {
      const env = emballer(etat, { genre, t: maintenant() }), cle = prefixe(genre) + String(env.t).padStart(15, '0');
      await stockage.ecrire(cle, env);
      const toutes = await cles(genre); for (const k of toutes.slice(0, Math.max(0, toutes.length - garder))) await stockage.supprimer(k);
      return { cle, t: env.t, taille: env.taille };
    },
    /* Restaure la plus récente sauvegarde VALIDE ; les corrompues sont comptées (jamais supprimées en silence : l'appelant décide). */
    async restaurer(genre) {
      const toutes = (await cles(genre)).reverse(), rejetees = [];
      for (const k of toutes) { try { const e = await stockage.lire(k); return { etat: deballer(e), cle: k, t: e.t, rejetees }; } catch (err) { rejetees.push({ cle: k, raison: err.message }); } }
      return { etat: null, cle: null, t: null, rejetees };
    },
    async etat(genre) {
      const toutes = await cles(genre), liste = []; let corrompues = 0;
      for (const k of toutes) { try { const e = await stockage.lire(k); deballer(e); liste.push({ cle: k, t: e.t, taille: e.taille, ok: true }); } catch (err) { corrompues++; liste.push({ cle: k, ok: false, raison: err.message }); } }
      const valides = liste.filter(x => x.ok), derniere = valides.length ? valides[valides.length - 1].t : null;
      return { n: liste.length, corrompues, derniere, liste };
    }
  };
}
