/* ═════════════ DRIVE : appels aux API Google (Drive v3, Docs, Sheets, Slides) ═════════════
   Aucune clé ni secret ici : l'accès vient du jeton OAuth de l'utilisateur (portée drive.file : seulement les fichiers qu'il a choisis).
   `creerApi({ jeton, fetch })` : `jeton(forcer)` renvoie une promesse de jeton valide (js/drive/auth.js) ; `fetch` est injectable (tests : fausse API). */

export const MIME = {
  gdoc: 'application/vnd.google-apps.document',
  gsheet: 'application/vnd.google-apps.spreadsheet',
  gslides: 'application/vnd.google-apps.presentation',
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain', md: 'text/markdown', csv: 'text/csv'
};
const DRIVE = 'https://www.googleapis.com/drive/v3', UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const DOCS = 'https://docs.googleapis.com/v1', SHEETS = 'https://sheets.googleapis.com/v4', SLIDES = 'https://slides.googleapis.com/v1';
const API_NOM = { 'docs.googleapis.com': 'Google Docs', 'sheets.googleapis.com': 'Google Sheets', 'slides.googleapis.com': 'Google Slides', 'www.googleapis.com': 'Google Drive', 'drive.googleapis.com': 'Google Drive' };

/** reconnaissance par le nom (et non instanceof : un module chargé deux fois, avec et sans ?v=, a deux classes distinctes) */
export const estErreurDrive = e => !!e && e.name === 'ErreurDrive';
/** erreur lisible, avec le statut HTTP et la raison Google */
export class ErreurDrive extends Error {
  constructor(message, { statut = 0, raison = '', api = '' } = {}) { super(message); this.name = 'ErreurDrive'; this.statut = statut; this.raison = raison; this.api = api; }
}
async function erreurDe(rep, url) {
  let corps = null; try { corps = await rep.json(); } catch (e) { /* pas de JSON */ }
  const e = corps && corps.error || {}, raison = (e.errors && e.errors[0] && e.errors[0].reason) || e.status || '';
  let hote = ''; try { hote = new URL(url).host; } catch (x) { /* ignore */ }
  const api = API_NOM[hote] || 'Google';
  let msg;
  if (rep.status === 401) msg = 'La connexion à Google a expiré : reconnecte-toi.';
  else if (rep.status === 403 && /SERVICE_DISABLED|accessNotConfigured/i.test(JSON.stringify(corps || '') + raison)) msg = 'L’API ' + api + ' n’est pas activée dans le projet Google Cloud (voir docs/drive.md).';
  else if (rep.status === 403 && /insufficient|PERMISSION_DENIED|forbidden/i.test(raison + (e.message || ''))) msg = 'Raylé n’a pas le droit d’écrire dans ce document (autorisation insuffisante ou lecture seule).';
  else if (rep.status === 404) msg = 'Document introuvable, ou non autorisé pour Raylé : choisis-le de nouveau avec le sélecteur Google.';
  else if (rep.status === 429) msg = 'Google limite le nombre de requêtes : réessaie dans un instant.';
  else if (rep.status === 400 && /revision/i.test(e.message || '')) msg = 'Le document a changé sur le Drive pendant l’opération.';
  else msg = 'Erreur ' + api + ' (' + rep.status + ')' + (e.message ? ' : ' + String(e.message).slice(0, 160) : '') + '.';
  return new ErreurDrive(msg, { statut: rep.status, raison, api });
}

export function creerApi({ jeton, fetch: f }) {
  const net = f || ((...a) => globalThis.fetch(...a));
  async function appeler(url, opts = {}, essai = 0) {
    const t = await jeton(essai > 0);
    let rep;
    try { rep = await net(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: 'Bearer ' + t } }); }
    catch (e) { throw new ErreurDrive('Pas de réseau vers Google (' + (e && e.message || e) + ').', { raison: 'reseau' }); }
    if (rep.status === 401 && essai === 0) return appeler(url, opts, 1);        // jeton refusé : on en redemande un (silencieusement) une fois
    if (!rep.ok) throw await erreurDe(rep, url);
    return rep;
  }
  const json = async (url, opts) => (await appeler(url, opts)).json();
  const enc = encodeURIComponent;
  return {
    meta: id => json(DRIVE + '/files/' + enc(id) + '?supportsAllDrives=true&fields=' + enc('id,name,mimeType,modifiedTime,version,size,headRevisionId,webViewLink,capabilities/canEdit')),
    /** contenu d'un dossier (toutes les pages) : [{ id, name, mimeType, modifiedTime, version, size }] — seulement ce que l'autorisation de Raylé lui laisse voir */
    async liste(dossierId) {
      const sortie = []; let page = '';
      for (let k = 0; k < 50; k++) {
        const q = "'" + String(dossierId).replace(/['\\]/g, '') + "' in parents and trashed=false";
        const r = await json(DRIVE + '/files?supportsAllDrives=true&includeItemsFromAllDrives=true&pageSize=200&q=' + enc(q) + '&fields=' + enc('nextPageToken,files(id,name,mimeType,modifiedTime,version,size)') + (page ? '&pageToken=' + enc(page) : ''));
        sortie.push(...(r.files || [])); page = r.nextPageToken || ''; if (!page) break;
      }
      return sortie;
    },
    async octets(id) { return (await appeler(DRIVE + '/files/' + enc(id) + '?alt=media&supportsAllDrives=true')).arrayBuffer(); },
    async texte(id) { return (await appeler(DRIVE + '/files/' + enc(id) + '?alt=media&supportsAllDrives=true')).text(); },
    async exporter(id, mime) { return (await appeler(DRIVE + '/files/' + enc(id) + '/export?mimeType=' + enc(mime))).text(); },
    /** remplace le contenu d'un fichier (docx, texte…) */
    async televerser(id, contenu, mime) {
      const rep = await appeler(UPLOAD + '/files/' + enc(id) + '?uploadType=media&supportsAllDrives=true&fields=' + enc('id,name,mimeType,modifiedTime,version'), { method: 'PATCH', headers: { 'Content-Type': mime }, body: contenu });
      return rep.json();
    },
    docsGet: id => json(DOCS + '/documents/' + enc(id)),
    docsBatch: (id, requests, revisionId) => json(DOCS + '/documents/' + enc(id) + ':batchUpdate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requests, writeControl: revisionId ? { requiredRevisionId: revisionId } : undefined }) }),
    sheetsMeta: id => json(SHEETS + '/spreadsheets/' + enc(id) + '?fields=' + enc('properties.title,sheets.properties(title,sheetId,gridProperties)')),
    sheetsValeurs: (id, plage) => json(SHEETS + '/spreadsheets/' + enc(id) + '/values/' + enc(plage) + '?valueRenderOption=FORMATTED_VALUE'),
    slidesGet: id => json(SLIDES + '/presentations/' + enc(id))
  };
}
