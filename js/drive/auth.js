/* ═════════════ DRIVE : connexion Google (Google Identity Services) et sélecteur de fichiers (Google Picker) ═════════════
   • Seul l'identifiant client OAuth PUBLIC (Client ID) est lu, depuis js/config-drive.js. Aucun secret, aucun jeton dans le dépôt.
   • Portée : drive.file → Raylé ne voit que les fichiers que tu choisis avec le sélecteur.
   • Le jeton d'accès vit uniquement en mémoire de la page (1 heure). Un simple repère « déjà connecté » est gardé dans localStorage pour tenter
     une reconnexion silencieuse quand le jeton expire ; si Google exige un geste de ta part, on affiche « Se connecter à Google ».
   • Tablette : la fenêtre de connexion de Google s'ouvre en popup (c'est le seul mode sans serveur) ; elle doit être déclenchée par un toucher. */
import { ErreurDrive } from './api.js?v=2026.10.13.10';

export const PORTEE = 'https://www.googleapis.com/auth/drive.file';
export const PORTEE_LECTURE = 'https://www.googleapis.com/auth/drive.readonly';      // optionnelle (config « lectureComplete ») : voir le contenu des dossiers choisis
export const URL_GIS = 'https://accounts.google.com/gsi/client', URL_GAPI = 'https://apis.google.com/js/api.js';
const REPERE = 'rayle_drive_connecte';

export function lireConfig(G = globalThis) {
  const c = (G.RAYLE_DRIVE_CONFIG || {});
  const clientId = String(c.clientId || '').trim();
  return { clientId, appId: String(c.appId || '').trim(), apiKey: String(c.apiKey || '').trim(), lectureComplete: c.lectureComplete === true, valide: /^[\w-]+\.apps\.googleusercontent\.com$/.test(clientId) };
}
export const MESSAGE_CONFIG = 'La connexion à Google n’est pas encore configurée : il manque l’identifiant client dans js/config-drive.js. Les étapes sont dans docs/drive.md.';

const scripts = new Map();
/** charge un script externe une seule fois (avec une empreinte SRI pour les bibliothèques tierces) */
export function chargerScript(url, integrite) {
  if (scripts.has(url)) return scripts.get(url);
  const p = new Promise((ok, ko) => {
    const s = document.createElement('script'); s.src = url; s.async = true;
    if (integrite) { s.integrity = integrite; s.crossOrigin = 'anonymous'; }                  // bibliothèques tierces : empreinte vérifiée par le navigateur
    s.onload = () => ok(); s.onerror = () => { scripts.delete(url); ko(new ErreurDrive('Impossible de charger ' + new URL(url).host + ' (pas de réseau ?).', { raison: 'reseau' })); };
    document.head.appendChild(s);
  });
  scripts.set(url, p); return p;
}

/** gestionnaire de connexion. Dépendances injectables pour les tests : { G, charger, maintenant, stockage, delaiSilencieux } */
export function creerAuth(dep = {}) {
  const G = dep.G || globalThis, charger = dep.charger || chargerScript, maintenant = dep.maintenant || (() => Date.now());
  const stock = dep.stockage || { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) { /* ignore */ } } };
  const delaiSilencieux = dep.delaiSilencieux || 12000;
  let jetonActuel = null, expireA = 0, client = null, enAttente = null, derniereErreur = '';
  const abonnes = new Set();
  const prevenir = () => abonnes.forEach(f => { try { f(etat()); } catch (e) { /* ignore */ } });

  function etat() {
    const cfg = lireConfig(G);
    const vivant = !!jetonActuel && maintenant() < expireA - 30000;
    return { configure: cfg.valide, connecte: vivant, dejaConnecte: stock.get(REPERE) === '1', expireDans: vivant ? Math.round((expireA - maintenant()) / 1000) : 0, erreur: derniereErreur };
  }

  async function preparer() {
    const cfg = lireConfig(G);
    if (!cfg.valide) throw new ErreurDrive(MESSAGE_CONFIG, { raison: 'config' });
    if (client) return client;
    await charger(URL_GIS);
    const oauth2 = G.google && G.google.accounts && G.google.accounts.oauth2;
    if (!oauth2) throw new ErreurDrive('Le service de connexion Google ne s’est pas chargé.', { raison: 'reseau' });
    client = oauth2.initTokenClient({
      client_id: cfg.clientId, scope: cfg.lectureComplete ? PORTEE + ' ' + PORTEE_LECTURE : PORTEE,
      callback: rep => {
        const a = enAttente; enAttente = null; if (!a) return;
        if (rep && rep.access_token) {
          jetonActuel = rep.access_token; expireA = maintenant() + (Number(rep.expires_in) || 3600) * 1000; derniereErreur = '';
          stock.set(REPERE, '1'); prevenir(); a.ok(jetonActuel);
        } else { derniereErreur = (rep && (rep.error_description || rep.error)) || 'connexion refusée'; prevenir(); a.ko(new ErreurDrive('Connexion à Google refusée : ' + derniereErreur + '.', { raison: 'refus' })); }
      },
      error_callback: err => {
        const a = enAttente; enAttente = null; if (!a) return;
        const t = err && err.type;
        derniereErreur = t || 'erreur';
        a.ko(new ErreurDrive(t === 'popup_failed_to_open' ? 'Le navigateur a bloqué la fenêtre de connexion Google : touche « Se connecter à Google » pour l’ouvrir.' : t === 'popup_closed' ? 'La fenêtre de connexion Google a été fermée.' : 'Connexion à Google impossible (' + (t || 'erreur') + ').', { raison: t === 'popup_failed_to_open' ? 'popup' : 'fermee' }));
      }
    });
    return client;
  }

  function demander(options, delai) {
    return new Promise(async (ok, ko) => {
      let tm = null;
      try {
        const c = await preparer();
        if (enAttente) { enAttente.ko(new ErreurDrive('Nouvelle demande de connexion.', { raison: 'remplace' })); }
        enAttente = { ok: v => { clearTimeout(tm); ok(v); }, ko: e => { clearTimeout(tm); ko(e); } };
        if (delai) tm = setTimeout(() => { if (enAttente) { const a = enAttente; enAttente = null; a.ko(new ErreurDrive('Reconnexion silencieuse impossible : touche « Se connecter à Google ».', { raison: 'reconnexion' })); } }, delai);
        c.requestAccessToken(options);
      } catch (e) { ko(e); }
    });
  }

  return {
    etat,
    surChangement(f) { abonnes.add(f); return () => abonnes.delete(f); },
    /** connexion demandée par un geste de l'utilisateur (bouton) */
    async connecter() { return demander({ prompt: stock.get(REPERE) === '1' ? '' : 'consent' }); },
    /** jeton valide pour un appel d'API : réutilise, sinon reconnexion silencieuse (sans fenêtre si Google le permet) */
    async jeton(forcer) {
      if (!forcer && etat().connecte) return jetonActuel;
      if (!lireConfig(G).valide) throw new ErreurDrive(MESSAGE_CONFIG, { raison: 'config' });
      if (stock.get(REPERE) !== '1') throw new ErreurDrive('Pas encore connecté à Google : touche « Se connecter à Google ».', { raison: 'reconnexion' });
      jetonActuel = null;
      return demander({ prompt: '' }, delaiSilencieux);
    },
    async deconnecter() {
      const t = jetonActuel; jetonActuel = null; expireA = 0; stock.set(REPERE, null); derniereErreur = '';
      try { if (t && G.google && G.google.accounts) await new Promise(r => G.google.accounts.oauth2.revoke(t, r)); } catch (e) { /* le jeton expirera de lui-même */ }
      prevenir();
    },
    /** pour les tests */
    _forcer(j, ttl) { jetonActuel = j; expireA = maintenant() + ttl; }
  };
}

/** sélecteur Google : renvoie les fichiers choisis [{ id, name, mimeType }] ([] si annulé) */
export async function choisirFichiers({ auth, mimes, dossiers = false, titre, G = globalThis, charger = chargerScript }) {
  const cfg = lireConfig(G);
  if (!cfg.valide) throw new ErreurDrive(MESSAGE_CONFIG, { raison: 'config' });
  const jeton = await auth.jeton();
  await charger(URL_GAPI);
  await new Promise((ok, ko) => G.gapi.load('picker', { callback: ok, onerror: () => ko(new ErreurDrive('Le sélecteur Google ne s’est pas chargé.', { raison: 'reseau' })), timeout: 15000, ontimeout: () => ko(new ErreurDrive('Le sélecteur Google ne répond pas.', { raison: 'reseau' })) }));
  const P = G.google.picker;
  return new Promise(ok => {
    const types = dossiers ? [...mimes, 'application/vnd.google-apps.folder'] : mimes;
    const vue = (v) => { v.setMimeTypes(types.join(',')).setIncludeFolders(true); if (dossiers && v.setSelectFolderEnabled) v.setSelectFolderEnabled(true); return v; };
    let b = new P.PickerBuilder()
      .addView(vue(new P.DocsView(P.ViewId.DOCS)))
      .addView(vue(new P.DocsView(P.ViewId.DOCS).setOwnedByMe(false)))
      .enableFeature(P.Feature.MULTISELECT_ENABLED)
      .setOAuthToken(jeton).setLocale('fr').setTitle(titre || 'Choisis les documents que Raylé peut lire')
      .setCallback(d => {
        if (d[P.Response.ACTION] === P.Action.PICKED) ok((d[P.Response.DOCUMENTS] || []).map(x => ({ id: x[P.Document.ID], name: x[P.Document.NAME], mimeType: x[P.Document.MIME_TYPE] })));
        else if (d[P.Response.ACTION] === P.Action.CANCEL) ok([]);
      });
    if (cfg.appId) b = b.setAppId(cfg.appId);
    if (cfg.apiKey) b = b.setDeveloperKey(cfg.apiKey);
    b.build().setVisible(true);
  });
}
