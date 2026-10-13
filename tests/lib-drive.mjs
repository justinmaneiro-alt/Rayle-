// Fausse API Google Drive / Docs / Sheets / Slides en mémoire, derrière un `fetch` factice : sert aux tests du module Drive (tests/drive-*.mjs).
// Le vrai js/drive/api.js est utilisé (URL, en-têtes, erreurs) ; seul le réseau est simulé.

/* ───── Google Doc simulé : une suite de caractères avec attributs (gras) ; le style d'un paragraphe est porté par son saut de ligne ───── */
export class FauxGoogleDoc {
  constructor(paragraphes) {            // [{ texte, style?:'HEADING_1', gras?:[[deb,fin]], puce?:true }]
    this.car = []; this.revision = 1;
    for (const p of paragraphes) {
      [...p.texte].forEach((c, k) => { const unites = c.length; for (let u = 0; u < unites; u++) this.car.push({ c: c[u], gras: !!(p.gras || []).some(([a, b]) => k >= a && k < b) }); });
      this.car.push({ c: '\n', style: p.style || 'NORMAL_TEXT', puce: !!p.puce, gras: false });
    }
  }
  get(id) {
    const content = [{ sectionBreak: {}, startIndex: 0, endIndex: 1 }];
    let i = 1, deb = 1, runs = [];
    const fermer = (nl) => {
      const elements = []; let pos = deb;
      for (const r of runs) { elements.push({ startIndex: pos, endIndex: pos + r.t.length, textRun: { content: r.t, textStyle: r.gras ? { bold: true } : {} } }); pos += r.t.length; }
      content.push({ startIndex: deb, endIndex: i + 1, paragraph: { elements, paragraphStyle: { namedStyleType: nl.style }, bullet: nl.puce ? { listId: 'l' } : undefined } });
    };
    for (const k of this.car) {
      if (k.c === '\n') { runs.push({ t: '\n', gras: false }); fermer(k); runs = []; deb = i + 1; }
      else { const dernier = runs[runs.length - 1]; if (dernier && dernier.gras === k.gras && dernier.t !== '\n') dernier.t += k.c; else runs.push({ t: k.c, gras: k.gras }); }
      i++;
    }
    // fusionne le saut de ligne dans le dernier run texte comme le fait Google
    return { documentId: id, revisionId: 'rev' + this.revision, body: { content } };
  }
  tailleStyle(i) { let j = i; while (j < this.car.length && this.car[j].c !== '\n') j++; return this.car[j]; }
  batch(requetes) {
    for (const r of requetes) {
      if (r.insertText) {
        const idx = r.insertText.location.index - 1, txt = r.insertText.text;
        const avant = idx > 0 ? this.car[idx - 1] : null, apresParag = this.tailleStyle(Math.max(0, idx));
        const neufs = [...txt].map(c => c === '\n' ? { c, style: apresParag.style, puce: apresParag.puce, gras: false } : { c, gras: avant && avant.c !== '\n' ? avant.gras : false });
        this.car.splice(idx, 0, ...neufs);
      } else if (r.deleteContentRange) {
        const { startIndex: a, endIndex: b } = r.deleteContentRange.range;
        if (b - 1 > this.car.length || a < 1) throw new Error('plage invalide ' + a + '-' + b);
        if (b - 1 === this.car.length) throw new Error('on ne peut pas supprimer le dernier saut de ligne');
        this.car.splice(a - 1, b - a);
      } else if (r.updateParagraphStyle) {
        const { startIndex: a, endIndex: b } = r.updateParagraphStyle.range;
        for (let k = a - 1; k < b - 1 && k < this.car.length; k++) { const n = this.tailleStyle(k); n.style = r.updateParagraphStyle.paragraphStyle.namedStyleType; }
      } else if (r.updateTextStyle) {
        const { startIndex: a, endIndex: b } = r.updateTextStyle.range;
        for (let k = a - 1; k < b - 1 && k < this.car.length; k++) if (this.car[k].c !== '\n') this.car[k].gras = false;
      } else if (r.deleteParagraphBullets) {
        const { startIndex: a, endIndex: b } = r.deleteParagraphBullets.range;
        for (let k = a - 1; k < b - 1 && k < this.car.length; k++) { const n = this.tailleStyle(k); n.puce = false; }
      } else throw new Error('requête inconnue : ' + Object.keys(r)[0]);
    }
    this.revision++;
  }
  /** texte brut par paragraphe (pour comparer) */
  paragraphes() { return this.car.map(k => k.c).join('').split('\n').slice(0, -1); }
  /** texte en gras (concaténé) */
  gras() { return this.car.filter(k => k.gras).map(k => k.c).join(''); }
  styles() { return this.car.filter(k => k.c === '\n').map(k => k.style); }
}

/* ───── faux Drive ───── */
export class FauxDrive {
  constructor() { this.fichiers = new Map(); this.journal = []; this.panne = null; this.jetonsValides = new Set(['jeton-1', 'jeton-2']); this.expirerAuProchain = false; this.apiDocsActive = true; this.ignorerEcritures = false; this.taillePage = 200; this.pannesFichiers = new Map(); this.dossiersOpaques = new Set(); }
  ajouter(id, meta, contenu) { this.fichiers.set(id, { meta: { id, version: 1, modifiedTime: '2026-10-13T10:00:00.000Z', capabilities: { canEdit: true }, ...meta }, contenu }); return this; }
  touche(id) { const f = this.fichiers.get(id); f.meta.version++; f.meta.modifiedTime = new Date(Date.parse(f.meta.modifiedTime) + 60000).toISOString(); }
  fetch = async (url, opts = {}) => {
    const u = new URL(url), chemin = u.pathname, methode = (opts.method || 'GET').toUpperCase();
    const auth = (opts.headers && opts.headers.Authorization) || '';
    this.journal.push({ methode, url: String(url) });
    const json = (corps, statut = 200) => new Response(JSON.stringify(corps), { status: statut, headers: { 'Content-Type': 'application/json' } });
    const erreur = (statut, message, raison = '') => json({ error: { code: statut, message, status: raison, errors: [{ reason: raison, message }] } }, statut);
    if (!auth.startsWith('Bearer ') || !this.jetonsValides.has(auth.slice(7))) return erreur(401, 'Invalid Credentials', 'authError');
    if (this.expirerAuProchain) { this.expirerAuProchain = false; return erreur(401, 'Invalid Credentials', 'authError'); }
    if (this.panne) { const p = this.panne; return erreur(p.statut, p.message, p.raison || ''); }
    let m;
    if (chemin === '/drive/v3/files' && methode === 'GET') {          // liste d'un dossier : « 'ID' in parents and trashed=false » (pagination par taillePage)
      const parent = /'([^']+)' in parents/.exec(u.searchParams.get('q') || '');
      if (!parent) return erreur(400, 'requête de liste inattendue', 'badRequest');
      const tous = this.dossiersOpaques.has(parent[1]) ? [] : [...this.fichiers.values()].map(x => x.meta).filter(x => (x.parents || []).includes(parent[1]) && !x.trashed);
      const debut = Number(u.searchParams.get('pageToken') || 0), page = tous.slice(debut, debut + this.taillePage);
      return json({ files: page, nextPageToken: debut + this.taillePage < tous.length ? String(debut + this.taillePage) : undefined });
    }
    const panne = (chemin.match(/^\/drive\/v3\/files\/([^/]+)/) || [])[1];
    if (panne && this.pannesFichiers.has(decodeURIComponent(panne)) && (u.searchParams.get('alt') === 'media' || /export/.test(chemin))) { const p = this.pannesFichiers.get(decodeURIComponent(panne)); return erreur(p.statut, p.message, p.raison || ''); }
    const fich = id => { const f = this.fichiers.get(decodeURIComponent(id)); return f || null; };
    if ((m = chemin.match(/^\/drive\/v3\/files\/([^/]+)\/export$/))) {
      const f = fich(m[1]); if (!f) return erreur(404, 'File not found', 'notFound');
      return new Response(f.contenu instanceof FauxGoogleDoc ? f.contenu.paragraphes().join('\n') : String(f.contenu), { status: 200 });
    }
    if ((m = chemin.match(/^\/drive\/v3\/files\/([^/]+)$/))) {
      const f = fich(m[1]); if (!f) return erreur(404, 'File not found', 'notFound');
      if (u.searchParams.get('alt') === 'media') {
        const c = f.contenu;
        if (typeof c === 'string') return new Response(c, { status: 200 });
        return new Response(c instanceof Uint8Array ? c : new Uint8Array(0), { status: 200 });
      }
      return json(f.meta);
    }
    if ((m = chemin.match(/^\/upload\/drive\/v3\/files\/([^/]+)$/)) && methode === 'PATCH') {
      const f = fich(m[1]); if (!f) return erreur(404, 'File not found', 'notFound');
      f.contenu = typeof opts.body === 'string' ? opts.body : new Uint8Array(opts.body); this.touche(decodeURIComponent(m[1]));
      return json(f.meta);
    }
    if ((m = chemin.match(/^\/v1\/documents\/([^/:]+)(:batchUpdate)?$/)) && u.host === 'docs.googleapis.com') {
      if (!this.apiDocsActive) return erreur(403, 'Google Docs API has not been used in project 123 before or it is disabled.', 'SERVICE_DISABLED');
      const f = fich(m[1]); if (!f) return erreur(404, 'Requested entity was not found.', 'NOT_FOUND');
      if (m[2]) {
        const corps = JSON.parse(opts.body), exige = corps.writeControl && corps.writeControl.requiredRevisionId;
        if (exige && exige !== 'rev' + f.contenu.revision) return erreur(400, 'The required revision ID does not match the current revision.', 'FAILED_PRECONDITION');
        if (this.ignorerEcritures) return json({ documentId: decodeURIComponent(m[1]) });
        try { f.contenu.batch(corps.requests); } catch (e) { return erreur(400, 'Invalid requests: ' + e.message, 'INVALID_ARGUMENT'); }
        this.touche(decodeURIComponent(m[1]));
        return json({ documentId: decodeURIComponent(m[1]) });
      }
      return json(f.contenu.get(decodeURIComponent(m[1])));
    }
    if ((m = chemin.match(/^\/v4\/spreadsheets\/([^/]+)\/values\/(.+)$/))) {
      const f = fich(m[1]); if (!f) return erreur(404, 'not found', 'NOT_FOUND');
      const nom = decodeURIComponent(m[2]).replace(/!.*$/, '').replace(/^'|'$/g, '');
      return json({ values: f.contenu.feuilles.find(s => s.titre === nom).valeurs });
    }
    if ((m = chemin.match(/^\/v4\/spreadsheets\/([^/]+)$/))) {
      const f = fich(m[1]); if (!f) return erreur(404, 'not found', 'NOT_FOUND');
      return json({ sheets: f.contenu.feuilles.map((s, k) => ({ properties: { title: s.titre, sheetId: k, gridProperties: { rowCount: s.valeurs.length } } })) });
    }
    if ((m = chemin.match(/^\/v1\/presentations\/([^/]+)$/))) {
      const f = fich(m[1]); if (!f) return erreur(404, 'not found', 'NOT_FOUND');
      return json(f.contenu);
    }
    return erreur(404, 'route inconnue ' + chemin, 'notFound');
  };
}

/* ───── faux zip (JSZip minimal) ───── */
export class FauxZip {
  constructor(fichiers) { this.fichiers = new Map(Object.entries(fichiers || {})); }
  file(nom, valeur) { if (valeur === undefined) { return this.fichiers.has(nom) ? { async: async () => this.fichiers.get(nom) } : null; } this.fichiers.set(nom, valeur); return this; }
  async generateAsync() { return new TextEncoder().encode(JSON.stringify([...this.fichiers])); }
}
export const FauxJSZip = { async loadAsync(octets) { const t = new TextDecoder().decode(octets instanceof ArrayBuffer ? new Uint8Array(octets) : octets); return new FauxZip(Object.fromEntries(JSON.parse(t))); } };
export const octetsDocx = (xml, extra = {}) => new FauxZip({ 'word/document.xml': xml, '[Content_Types].xml': '<Types/>', 'word/styles.xml': '<styles/>', ...extra }).generateAsync();

/** service branché sur le faux Drive (jeton fixe) */
export async function monterService(drive, { correcteur, ui, stockage } = {}) {
  const { creerApi } = await import('../js/drive/api.js');
  const { creerService } = await import('../js/drive/service.js');
  const api = creerApi({ jeton: async () => 'jeton-1', fetch: drive.fetch });
  const mem = new Map();
  const st = stockage || { get: k => (mem.has(k) ? mem.get(k) : null), set: (k, v) => { v == null ? mem.delete(k) : mem.set(k, v); } };
  const evenements = [];
  const ui2 = ui || { afficher: () => evenements.push('afficher'), montrer: (i, o) => evenements.push(['montrer', i, o]), apercu: a => evenements.push(['apercu', a]), rafraichir: () => evenements.push('rafraichir'), visible: () => -1, demanderConnexion: () => evenements.push('connexion') };
  const service = creerService({ api, auth: null, ui: ui2, env: { zip: async () => FauxJSZip }, correcteur, stockage: st, maintenant: () => 1760000000000 });
  return { service, api, evenements, stockage: st };
}
