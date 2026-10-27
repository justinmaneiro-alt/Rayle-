// Télécommande tactile de Rayle (K2) : activation DEPUIS Rayle, sur le serveur déjà lancé.
// - Un serveur réseau local (adresse privée seulement, SEULE la page /clavier et sa liaison WebSocket), jeton QR aléatoire + code d'appairage à 6 chiffres affiché sur le PC,
//   puis un jeton PAR APPAREIL (révocable, avec expiration réglable). Journal des connexions. Aucune connexion hors réseau local.
// - Une liaison WebSocket (écrite ici, sans dépendance) : tablette → page Rayle du PC (événements de la liste blanche) et page → tablette (réponses, état).
// - Routes /__tele/… sur le serveur principal (127.0.0.1) pour la page Rayle : état, activer, désactiver, arrêt d'urgence, déconnecter, réglages.
// Rien n'agit au niveau de Windows : le serveur ne fait que relayer ; la page Rayle applique (liste blanche dans core/commun/telecommande-calcul.js).
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { adresseLocale } from './reseau-local.mjs';
import { matriceQR } from './qr-console.mjs';
await import('../core/commun/telecommande-calcul.js');
const T = globalThis.TeleCalcul;

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const egal = (a, b) => { const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || '')); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const MAX_TRAME = 16 * 1024;

// ── WebSocket minimal (RFC 6455) : texte, ping/pong, fermeture ──
export function trameTexte(texte) {
  const b = Buffer.from(texte), n = b.length; let h;
  if (n < 126) h = Buffer.from([0x81, n]); else if (n < 65536) { h = Buffer.alloc(4); h[0] = 0x81; h[1] = 126; h.writeUInt16BE(n, 2); } else { h = Buffer.alloc(10); h[0] = 0x81; h[1] = 127; h.writeBigUInt64BE(BigInt(n), 2); }
  return Buffer.concat([h, b]);
}
const trameControle = (op, charge = Buffer.alloc(0)) => Buffer.concat([Buffer.from([0x80 | op, charge.length]), charge]);
// Lit les trames reçues (toujours masquées côté client) ; renvoie les messages complets au fur et à mesure.
function lecteurTrames(surMessage, surFermeture) {
  let tampon = Buffer.alloc(0), fragments = [];
  return donnees => {
    tampon = Buffer.concat([tampon, donnees]);
    for (;;) {
      if (tampon.length < 2) return;
      const op = tampon[0] & 0x0f, fin = (tampon[0] & 0x80) !== 0, masque = (tampon[1] & 0x80) !== 0; let n = tampon[1] & 0x7f, pos = 2;
      if (n === 126) { if (tampon.length < 4) return; n = tampon.readUInt16BE(2); pos = 4; } else if (n === 127) { if (tampon.length < 10) return; const g = tampon.readBigUInt64BE(2); if (g > BigInt(MAX_TRAME)) return surFermeture(1009); n = Number(g); pos = 10; }
      if (!masque) return surFermeture(1002);
      if (n > MAX_TRAME) return surFermeture(1009);
      if (tampon.length < pos + 4 + n) return;
      const cle = tampon.subarray(pos, pos + 4), charge = Buffer.from(tampon.subarray(pos + 4, pos + 4 + n));
      for (let i = 0; i < n; i++) charge[i] ^= cle[i & 3];
      tampon = tampon.subarray(pos + 4 + n);
      if (op === 8) return surFermeture(1000);
      if (op === 9) { surMessage(null, charge); continue; }
      if (op === 10) continue;
      if (op === 1 || op === 0) { fragments.push(charge); if (fin) { const t = Buffer.concat(fragments).toString('utf8'); fragments = []; surMessage(t); } continue; }
      return surFermeture(1003);
    }
  };
}

export function creerTelecommande({ racine, dossierDonnees, port = Number(process.env.RAYLE_PORT_RESEAU) || undefined, ip, maintenant = () => Date.now(), journalConsole = false,
  // V2 phase 11 : la même mécanique sert la « Caméra Rayle » du téléphone (instance SÉPARÉE : autres jetons, autre code d'appairage, autre fichier, autre liste blanche)
  prefixe = '/clavier', dossierPage = 'clavier', nomCookie = 'rayle_k2', prefixeLocal = '/__tele/', fichierDonnees = 'telecommande.json', enteteLocal = 'x-rayle-tele', valideur = null, tls = null, preparerTls = null, fichiersSpeciaux = {}, dossiersStatiques = {} } = {}) {
  const dossierClavier = path.join(racine, dossierPage);
  let tlsActuel = tls;   // le certificat de la caméra du téléphone est fabriqué à l'activation (preparerTls) : getUserMedia exige une page HTTPS
  const fichier = dossierDonnees ? path.join(dossierDonnees, fichierDonnees) : null;
  let donnees = { appareils: [], reglages: { expirationHeures: 24 * 30 }, journal: [] };
  try { if (fichier) { const l = JSON.parse(fs.readFileSync(fichier, 'utf8')); if (l && Array.isArray(l.appareils)) donnees = { ...donnees, ...l, reglages: { ...donnees.reglages, ...(l.reglages || {}) } }; } } catch (e) { /* premier lancement */ }
  const sauver = () => { if (!fichier) return; try { fs.mkdirSync(path.dirname(fichier), { recursive: true }); fs.writeFileSync(fichier, JSON.stringify(donnees)); } catch (e) { /* disque indisponible : l'état reste en mémoire */ } };
  const noter = (evt, extra = {}) => { donnees.journal.push({ h: new Date(maintenant()).toISOString(), evt, ...extra }); if (donnees.journal.length > 200) donnees.journal.splice(0, donnees.journal.length - 200); sauver(); if (journalConsole) console.log('[télécommande]', evt, extra.appareil || '', extra.raison || ''); };

  let reseau = null;            // serveur HTTP du réseau local
  let actif = false, adresse = null, jetonQR = null, erreur = '', avertissement = '';
  let code = null, codeFin = 0, echecs = 0, verrouJusque = 0;
  const liaisons = new Set();   // { sock, role:'tablette'|'pc', id, latence, vu }
  const ecouteurs = new Set();  // surEvenement(message validé, appareil) : appelés pour chaque événement de tablette accepté

  const nouveauCode = () => { code = String(crypto.randomInt(0, 1000000)).padStart(6, '0'); codeFin = maintenant() + 5 * 60 * 1000; echecs = 0; };
  const codeValide = () => { if (!code || maintenant() > codeFin) nouveauCode(); return code; };
  const hors = (l) => [...liaisons].filter(x => x.role === l);
  const envoyer = (liaison, objet) => { try { liaison.sock.write(trameTexte(JSON.stringify(objet))); } catch (e) { /* liaison en cours de fermeture */ } };
  const diffuser = (role, objet) => hors(role).forEach(l => envoyer(l, objet));
  const diffuserEtat = () => { diffuser('pc', { t: 'etat', etat: etat() }); diffuser('tablette', { t: 'pc', connecte: hors('pc').length > 0 }); };
  const fermer = (l, codeFermeture = 1000) => { try { const c = Buffer.alloc(2); c.writeUInt16BE(codeFermeture); l.sock.write(trameControle(8, c)); l.sock.end(); } catch (e) { /* déjà fermée */ } liaisons.delete(l); };

  function etat() {
    const url = actif && adresse ? (tlsActuel ? 'https' : 'http') + '://' + adresse.ip + ':' + adresse.port + prefixe + '?jeton=' + jetonQR : null;
    let qr = null; if (url) { try { qr = matriceQR(url).map(l => l.map(v => v ? '1' : '0').join('')); } catch (e) { qr = null; } }
    return {
      actif, erreur, avertissement, https: !!tlsActuel, url, adresse: adresse ? adresse.ip + ':' + adresse.port : null, qr, code: actif ? codeValide() : null, codeExpire: actif ? codeFin : null,
      expirationHeures: donnees.reglages.expirationHeures, pagesPC: hors('pc').length,
      appareils: donnees.appareils.map(a => { const l = hors('tablette').find(x => x.id === a.id); return { id: a.id, nom: a.nom, cree: a.cree, expire: a.expire, dernier: a.dernier || null, connecte: !!l, latence: l ? l.latence : null }; }),
      journal: donnees.journal.slice(-40)
    };
  }

  // ── Activation / arrêt ──
  async function activer() {
    if (actif) return etat();
    if (preparerTls && !tlsActuel) { avertissement = ''; try { tlsActuel = await preparerTls(); } catch (e) { avertissement = 'Certificat HTTPS impossible (' + e.message + ') : la page du téléphone sera en HTTP et Chrome refusera la caméra, sauf réglage manuel (docs/GESTES.md).'; tlsActuel = null; } }   // sans certificat : la page reste en HTTP (voir docs/GESTES.md : option de Chrome pour le téléphone)
    const ipEcoute = ip || adresseLocale();
    erreur = '';
    if (!ipEcoute) { erreur = 'Aucune adresse de réseau local trouvée : connecte le PC au Wi-Fi ou au câble de ta box.'; return Promise.reject(new Error(erreur)); }
    return new Promise((ok, ko) => {
      const srv = creerServeurReseau();
      srv.once('error', e => {
        erreur = e.code === 'EADDRINUSE'
          ? 'Le port ' + (port || '?') + ' est déjà utilisé (un autre Rayle lancé avec « --reseau-local », ou un autre programme). Ferme l’autre ou choisis un port libre avec la variable RAYLE_PORT_RESEAU.'
          : e.code === 'EADDRNOTAVAIL' ? 'L’adresse ' + ipEcoute + ' n’est plus disponible (changement de réseau ?). Réessaie.' : 'Écoute impossible : ' + e.message;
        ko(new Error(erreur));
      });
      srv.listen(port || 0, ipEcoute, () => {
        reseau = srv; adresse = { ip: ipEcoute, port: srv.address().port }; actif = true; jetonQR = crypto.randomBytes(12).toString('hex'); nouveauCode();
        noter('activation', { ip: ipEcoute });
        diffuserEtat(); ok(etat());
      });
    });
  }
  function arreter(raison = 'désactivation') {
    if (!actif && !reseau) return etat();
    actif = false;
    hors('tablette').forEach(l => fermer(l, 1001));
    try { reseau.close(); reseau.closeAllConnections && reseau.closeAllConnections(); } catch (e) { /* déjà fermé */ }
    reseau = null; adresse = null; jetonQR = null; code = null;
    noter(raison); diffuserEtat();
    return etat();
  }
  function urgence() { donnees.appareils = []; sauver(); const e = arreter('arrêt d’urgence'); return e; }
  function deconnecter(id) {
    const i = donnees.appareils.findIndex(a => a.id === id); if (i < 0) return false;
    const [a] = donnees.appareils.splice(i, 1); sauver();
    hors('tablette').filter(l => l.id === id).forEach(l => fermer(l, 4001));
    noter('appareil déconnecté', { appareil: a.nom }); diffuserEtat(); return true;
  }
  function reglages(r) {
    const h = Math.round(Number(r && r.expirationHeures));
    if (!(h >= 1 && h <= 8760)) return false;
    donnees.reglages.expirationHeures = h; sauver(); noter('réglage : expiration', { raison: h + ' h' }); diffuserEtat(); return true;
  }

  // ── Appairage et jetons d'appareil ──
  function appairer(codeSaisi, nom, ipClient) {
    const t = maintenant();
    if (t < verrouJusque) { noter('refus', { raison: 'appairage verrouillé', ip: ipClient }); return { ok: false, erreur: 'Trop d’essais. Attends une minute.' }; }
    if (!actif || !egal(codeSaisi, codeValide())) {
      echecs++; noter('refus', { raison: 'code d’appairage incorrect', ip: ipClient });
      if (echecs >= 5) { verrouJusque = t + 60000; nouveauCode(); diffuserEtat(); }
      return { ok: false, erreur: 'Code incorrect.' };
    }
    const jeton = crypto.randomBytes(24).toString('hex'), id = crypto.randomBytes(5).toString('hex');
    const propre = String(nom || 'Appareil').replace(/[^\p{L}\p{N} ._'-]/gu, '').trim().slice(0, 32) || 'Appareil';
    donnees.appareils.push({ id, nom: propre, hash: sha(jeton), cree: t, expire: t + donnees.reglages.expirationHeures * 3600 * 1000, dernier: t });
    nouveauCode(); sauver(); noter('appairage', { appareil: propre, ip: ipClient }); diffuserEtat();
    return { ok: true, jeton };
  }
  function appareilParJeton(jeton) {
    const h = sha(jeton); const a = donnees.appareils.find(x => egal(x.hash, h));
    if (!a) return { refus: 'jeton inconnu ou révoqué' };
    if (maintenant() > a.expire) { donnees.appareils = donnees.appareils.filter(x => x !== a); sauver(); return { refus: 'jeton expiré', nom: a.nom }; }
    return { appareil: a };
  }

  // ── Serveur du réseau local ──
  function creerServeurReseau() {
    const gestionnaire = (req, res) => {
      const refus = (c, m) => { res.writeHead(c, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(m); };
      const ipC = req.socket.remoteAddress;
      if (!T.estReseauLocal(ipC)) { noter('refus', { raison: 'hors réseau local', ip: ipC }); return refus(403, 'réseau local seulement'); }
      let url, chemin; try { url = new URL(req.url, 'http://x'); chemin = decodeURIComponent(url.pathname); } catch (e) { return refus(400, 'requête invalide'); }
      if (chemin !== prefixe && !chemin.startsWith(prefixe + '/')) return refus(403, 'interdit');
      const cookie = new RegExp('(?:^|;\\s*)' + nomCookie + '=([0-9a-f]+)').exec(req.headers.cookie || '');
      const parUrl = egal(url.searchParams.get('jeton'), jetonQR), parCookie = egal(cookie && cookie[1], jetonQR);
      if (!actif || (!parUrl && !parCookie)) { noter('refus', { raison: 'jeton QR absent ou faux', ip: ipC }); return refus(403, 'jeton requis'); }
      if (chemin === prefixe + '/statut') {   // la page de la tablette demande si son jeton est encore valable (sans effet de bord)
        const tj = url.searchParams.get('jeton'), rj = tj ? appareilParJeton(tj) : null;
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end(JSON.stringify({ k2: true, jetonValide: !!(rj && rj.appareil) }));
      }
      if (chemin === prefixe + '/appairer') {
        if (req.method !== 'POST') return refus(405, 'méthode refusée');
        let corps = ''; req.on('data', d => { corps += d; if (corps.length > 1024) req.destroy(); });
        return req.on('end', () => {
          let o; try { o = JSON.parse(corps); } catch (e) { return refus(400, 'requête invalide'); }
          const r = appairer(String(o.code || ''), o.nom, ipC);
          res.writeHead(r.ok ? 200 : 403, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(r));
        });
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return refus(405, 'méthode refusée');
      const sous = chemin === prefixe || chemin === prefixe + '/' ? 'index.html' : chemin.slice((prefixe + '/').length);
      const f = path.normalize(path.join(dossierClavier, sous)), rel = path.relative(dossierClavier, f);
      if (!dossiersStatiques[sous.split('/')[0]] && !fichiersSpeciaux[sous] && (rel.startsWith('..') || path.isAbsolute(rel))) return refus(403, 'interdit');
      // Le calcul pur (liste blanche, inertie…) est servi sous /clavier/telecommande-calcul.js : il vient du dossier core, jamais d'une autre route.
      const dossierStatique = Object.keys(dossiersStatiques).find(k => sous.startsWith(k + '/')), fichierStatique = dossierStatique ? path.normalize(path.join(dossiersStatiques[dossierStatique], sous.slice(dossierStatique.length + 1))) : null;
      if (fichierStatique && (path.relative(dossiersStatiques[dossierStatique], fichierStatique).startsWith('..') || !/\.(?:mjs|js|wasm|task)$/.test(fichierStatique))) return refus(403, 'interdit');
      const source = fichierStatique || (Object.prototype.hasOwnProperty.call(fichiersSpeciaux, sous) ? fichiersSpeciaux[sous] : (sous === 'telecommande-calcul.js' && prefixe === '/clavier' ? path.join(racine, 'core', 'commun', 'telecommande-calcul.js') : f));
      fs.stat(source, (err, st) => {
        if (err || !st.isFile()) return refus(404, 'introuvable');
        const h = { 'Content-Type': TYPES[path.extname(source).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
        if (parUrl) h['Set-Cookie'] = nomCookie + '=' + jetonQR + '; Path=' + prefixe + '; HttpOnly; SameSite=Strict' + (tlsActuel ? '; Secure' : '');
        res.writeHead(200, h); if (req.method === 'HEAD') return res.end(); fs.createReadStream(source).pipe(res);
      });
    };
    const srv = tlsActuel ? https.createServer(tlsActuel, gestionnaire) : http.createServer(gestionnaire);
    srv.on('upgrade', (req, sock) => {
      const ipC = req.socket.remoteAddress, ferme = (c, m) => { try { sock.write('HTTP/1.1 ' + c + ' ' + m + '\r\nConnection: close\r\n\r\n'); } catch (e) {} sock.destroy(); };
      if (!T.estReseauLocal(ipC)) { noter('refus', { raison: 'hors réseau local (liaison)', ip: ipC }); return ferme(403, 'Forbidden'); }
      let url; try { url = new URL(req.url, 'http://x'); } catch (e) { return ferme(400, 'Bad Request'); }
      if (url.pathname !== prefixe + '/ws' || !actif) return ferme(403, 'Forbidden');
      const origine = req.headers.origin; if (origine) { try { if (new URL(origine).host !== req.headers.host) { noter('refus', { raison: 'origine étrangère', ip: ipC }); return ferme(403, 'Forbidden'); } } catch (e) { return ferme(403, 'Forbidden'); } }
      const r = appareilParJeton(url.searchParams.get('jeton'));
      if (!r.appareil) { noter('refus', { raison: r.refus, appareil: r.nom, ip: ipC }); return ferme(401, 'Unauthorized'); }
      const l = accepter(req, sock, 'tablette', r.appareil);
      if (!l) return;
      r.appareil.dernier = maintenant(); sauver(); noter('connexion', { appareil: r.appareil.nom, ip: ipC });
      envoyer(l, { t: 'bienvenue', appareil: r.appareil.nom, pc: hors('pc').length > 0, expire: r.appareil.expire, delaiMax: T.DELAI_MAX_MS });
      diffuserEtat();
    });
    return srv;
  }

  // Poignée de main WebSocket puis lecture des messages
  function accepter(req, sock, role, appareil) {
    const cle = req.headers['sec-websocket-key']; if (!cle || req.headers.upgrade?.toLowerCase() !== 'websocket') { sock.destroy(); return null; }
    sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + crypto.createHash('sha1').update(cle + GUID).digest('base64') + '\r\n\r\n');
    sock.setNoDelay(true);
    const l = { sock, role, id: appareil && appareil.id, nom: appareil && appareil.nom, latence: null, vu: maintenant() };
    liaisons.add(l);
    const fin = () => { if (liaisons.delete(l)) { if (role === 'tablette') noter('déconnexion', { appareil: l.nom }); diffuserEtat(); } };
    const lire = lecteurTrames((texte, ping) => {
      l.vu = maintenant();
      if (texte === null) { try { sock.write(trameControle(10, ping)); } catch (e) {} return; }
      let m; try { m = JSON.parse(texte); } catch (e) { return; }
      if (role === 'tablette') surTablette(l, m); else surPC(l, m);
    }, c => fermer(l, c));
    sock.on('data', lire); sock.on('close', fin); sock.on('error', () => { try { sock.destroy(); } catch (e) {} });
    return l;
  }
  function surTablette(l, m) {
    if (m && m.t === 'ping') {   // mesure de latence : la tablette envoie sa dernière mesure, le serveur répond aussitôt
      if (typeof m.l === 'number' && m.l >= 0 && m.l < 60000 && Math.round(m.l) !== l.latence) { l.latence = Math.round(m.l); diffuser('pc', { t: 'etat', etat: etat() }); }   // la page du PC affiche la latence
      return envoyer(l, { t: 'pong', n: m.n });
    }
    const a = donnees.appareils.find(x => x.id === l.id);
    if (!a || maintenant() > a.expire) { noter('refus', { raison: 'jeton expiré en cours de liaison', appareil: l.nom }); return fermer(l, 4002); }
    const v = valideur ? valideur(m) : T.valider(m);
    if (!v) { noter('action ignorée', { raison: String(m && m.a).slice(0, 24), appareil: l.nom }); return; }   // hors liste blanche : ignorée
    if (v.a === 'pointeur') { /* flux dense : pas de journal */ }
    hors('pc').forEach(p => envoyer(p, { t: 'ev', de: l.nom, m: v }));
    ecouteurs.forEach(f => { try { f(v, l.nom); } catch (e) {} });
  }
  function surPC(l, m) {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'reponse' && typeof m.texte === 'string') return diffuser('tablette', { t: 'reponse', texte: m.texte.slice(0, 600) });
    if (m.t === 'carte' && m.carte && typeof m.carte === 'object') return diffuser('tablette', { t: 'carte', carte: T.normaliserCarte(m.carte) });   // V2 phase 4 : mini-carte (nettoyée et bornée ici)
    if (m.t === 'surface' && (m.v === '3d' || m.v === '2d')) return diffuser('tablette', { t: 'surface', v: m.v });
    if (m.t === 'etat-rayle' && ['ACTIF', 'VEILLE', 'COUPE'].includes(m.mode)) return diffuser('tablette', { t: 'etat-rayle', mode: m.mode, parole: m.parole === true });
  }

  // ── Routes locales (serveur principal, 127.0.0.1) ──
  const boucle = a => a === '::1' || /^(::ffff:)?127\./.test(String(a));
  const origineLocale = req => { const o = req.headers.origin; if (!o) return true; try { return new URL(o).host === req.headers.host; } catch (e) { return false; } };
  function gererLocal(req, res, chemin) {
    const json = (c, o) => { res.writeHead(c, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(o)); };
    if (!boucle(req.socket.remoteAddress) || !origineLocale(req) || req.headers[enteteLocal] !== '1') return json(403, { erreur: 'interdit' });
    const action = chemin.slice(prefixeLocal.length);
    if (action === 'etat' && req.method === 'GET') return json(200, etat());
    if (req.method !== 'POST') return json(405, { erreur: 'méthode refusée' });
    let corps = ''; req.on('data', d => { corps += d; if (corps.length > 2048) req.destroy(); });
    req.on('end', async () => {
      let o = {}; try { o = corps ? JSON.parse(corps) : {}; } catch (e) { return json(400, { erreur: 'requête invalide' }); }
      if (action === 'activer') { try { return json(200, await activer()); } catch (e) { return json(200, { ...etat(), erreur: e.message }); } }
      if (action === 'desactiver') return json(200, arreter());
      if (action === 'urgence') return json(200, urgence());
      if (action === 'deconnecter') return json(200, { ok: deconnecter(String(o.id || '')), etat: etat() });
      if (action === 'reglages') return json(200, { ok: reglages(o), etat: etat() });
      return json(404, { erreur: 'route inconnue' });
    });
  }
  // Liaison de la page Rayle du PC : WebSocket /__tele/ws sur le serveur principal (boucle locale et même origine seulement)
  function upgradeLocal(req, sock) {
    const ferme = (c, m) => { try { sock.write('HTTP/1.1 ' + c + ' ' + m + '\r\nConnection: close\r\n\r\n'); } catch (e) {} sock.destroy(); };
    if (!boucle(req.socket.remoteAddress) || !origineLocale(req) || !req.headers.origin) return ferme(403, 'Forbidden');
    let u; try { u = new URL(req.url, 'http://x'); } catch (e) { return ferme(400, 'Bad Request'); }
    if (u.pathname !== prefixeLocal + 'ws') return ferme(404, 'Not Found');
    const l = accepter(req, sock, 'pc', null); if (!l) return;
    envoyer(l, { t: 'etat', etat: etat() }); diffuserEtat();
  }

  return { gererLocal, upgradeLocal, activer, arreter, urgence, deconnecter, reglages, etat, appairer, appareilParJeton, surEvenement: f => { ecouteurs.add(f); return () => ecouteurs.delete(f); }, fermerTout: () => { arreter('arrêt du serveur'); } };
}

// Pour serveur.mjs : crée la télécommande avec le dossier de données habituel de l'application (%LOCALAPPDATA%\Rayle).
export function creerTelecommandeApp(racine, env = process.env) {
  const donnees = env.RAYLE_DONNEES || path.join(env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Rayle');
  return creerTelecommande({ racine, dossierDonnees: donnees });
}
