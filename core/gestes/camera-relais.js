"use strict";
/* ═════════════ CAMÉRA DU TÉLÉPHONE PAR HTTPS (V3, phase 4 ; liaison directe WebRTC ajoutée ensuite) : côté page Rayle ═════════════
   Le PC demande une session au Worker (jeton aléatoire, usage unique, 5 minutes), affiche le QR code (adresse de la page HTTPS « Caméra Rayle » + session + jeton dans le FRAGMENT de l'adresse),
   puis reçoit les POINTS de main que le téléphone envoie et les passe au moteur de gestes. Jamais de vidéo vers le Worker. Chaque trame reçue est REVALIDÉE ici (GestesCalcul.validerMains) : ni le relais
   ni le téléphone ne sont crus sur parole.
   V11 : trois chemins, le même moteur derrière, le téléphone prend le plus rapide qui marche :
     A. DIRECT (WebRTC DataChannel, non fiable et non ordonné : une trame perdue ne retarde pas la suivante). STUN + TURN fournis par le Worker (/camera/ice-pc). Le Worker ne sert qu'à échanger
        offre / réponse / candidats (/camera/signal*), ensuite les points vont du téléphone au PC sans repasser par lui.
     B. RELAIS TEMPS RÉEL (WebSocket vers un Durable Object du Worker, /camera/ws) : mêmes paquets binaires, sans D1, ≥ 30 paquets/s, quelques dizaines de ms. Ouvert dès le début, en parallèle de A.
     C. ANCIEN RELAIS par le Worker et D1 (lent : quelques paquets par seconde), seulement en dernier recours.
   Aucune clé n'est affichée ni stockée : le jeton de session ne vit que dans le QR et dans la mémoire de la page. */
const CameraRelais = (() => {
  const PAGE_PAR_DEFAUT = 'https://justinmaneiro-alt.github.io/Rayle-/camera/';
  const ICE_SECOURS = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }];   // STUN seul : le Worker (/camera/ice-pc) ajoute le TURN quand il est configuré
  const DELAI_DIRECT_MS = 15000, TAILLE_IMAGE_MAX = 16000, RELAIS_MS = 4000;
  const LC = () => window.LiaisonCalcul;
  const E = { etat: 'inactive', session: null, jeton: null, expire: 0, url: '', erreur: '', recues: 0, derniere: 0, dernierEnvoi: null, qr: null, liaison: 'aucune', rtt: null, delai: null, apercu: null, apercuVoulu: false, derniereTrame: null, directEchec: '', perte: 0, ecartes: 0, gigue: 0, dtTel: 0, confiance: null, traitement: 0, delaiTotal: null, conseil: '', binaire: false, decalage: null, rttMin: null, delaiMesure: null, chemin: 'aucun', rttDirect: null, rttRelais: null, ws: { etat: 'aucun', code: null, raison: '', rtt: null, depuis: 0 }, workerInfo: { joignable: null, version: null, relais: null, turn: null, raison: '' }, signal: { offre: false, reponse: false, erreur: '' }, ice: { etat: '', conn: '', local: { host: 0, srflx: 0, relay: 0, mdns: 0 }, distant: { host: 0, srflx: 0, relay: 0, mdns: 0 }, paire: '' }, diagTel: null, versionAlerte: '', tel: null, calcul: 'telephone', calculVoulu: false, piste: null, reglagesEnvoyes: null };
  const ecouteurs = []; let minuteur = 0, apres = 0, sigApres = 0, enVol = false, surTrames = null, voulu = false;
  let pairWs = false, nPing = 0, dernierOct = 0, pair = null, canal = null, ctrl = null, ws = null, wsRetard = 0, wsEssais = 0, wsCode = 0, iceServeurs = ICE_SECOURS, dernierLien = '', dernierLienT = 0, liensPings = 0, sondesL = {}, pings = 0, sondes = {}, sondesDate = {}, echHorloge = [], latRecentes = [], debutNegociation = 0, vus = [], surTelephone = null, surPiste = null;
  const PB = () => window.PaquetBinaire, suivi = window.PaquetBinaire ? window.PaquetBinaire.creerSuivi() : null;   // V5 : paquets binaires, séquence, pertes
  const prevenir = () => { for (const f of ecouteurs.slice()) { try { f(E); } catch (e) { /* un écouteur fautif n'arrête pas les autres */ } } };
  const surEvenement = f => { ecouteurs.push(f); return () => { const i = ecouteurs.indexOf(f); if (i >= 0) ecouteurs.splice(i, 1); }; };
  const workerOk = () => typeof workerReady !== 'undefined' && workerReady();
  const workerUrl = () => { try { return RayleBus.demander('worker').url; } catch (e) { return ''; } };

  /* Adresse de la page du téléphone : celle du site si Rayle tourne sur GitHub Pages, sinon celle du dépôt public (réglable : window.RAYLE_CAMERA_PAGE). */
  function pageCamera() {
    if (window.RAYLE_CAMERA_PAGE) return String(window.RAYLE_CAMERA_PAGE);
    if (/\.github\.io$/.test(location.hostname)) { const base = location.pathname.replace(/[^/]*$/, ''); return location.origin + base + 'camera/'; }
    return PAGE_PAR_DEFAUT;
  }
  /* Le QR porte le moins d'octets possible : l'adresse du Worker sans « https:// ». */
  function adresseQR(page, id, jeton, worker) { return page + '#s=' + id + '&j=' + jeton + '&w=' + String(worker).replace(/^https:\/\//i, '').replace(/\/+$/, ''); }

  async function api(chemin, corps) {
    const res = await wfetch(chemin, corps === undefined ? { method: 'GET' } : { method: 'POST', body: JSON.stringify(corps) }, 12000);
    let j = null; try { j = await res.json(); } catch (e) { /* corps illisible */ }
    if (!res.ok) { const err = new Error((j && j.error) || ('HTTP ' + res.status)); err.status = res.status; throw err; }
    return j;
  }
  function messageErreur(e) {
    const m = String(e && e.message || e);
    if (e && e.status === 404) return 'Le Worker n’est pas à jour : la caméra du téléphone par HTTPS demande la version V3 phase 4 (voir docs/deploiement-worker-v3.md).';
    if (e && e.status === 429) return m;
    if (e && e.status === 400 && /D1/.test(m)) return 'Le Worker n’a pas de base D1 : ajoutez la liaison DB.';
    return typeof errMsg === 'function' ? errMsg(e) : m;
  }

  // ── réception d'une trame (les deux chemins passent ici) ──
  function recevoir(brut, lien) {
    const g = window.GestesCalcul, v = g ? g.validerMains(brut) : null; if (!v) return false;
    const maintenant = Date.now(); E.recues++; E.derniere = maintenant; if (lien) { dernierLien = lien; dernierLienT = maintenant; } vus.push(maintenant); if (vus.length > 200) vus = vus.slice(-100);
    E.derniereTrame = { t: v.t, ratio: v.ratio, mains: v.mains }; if (v.dt != null) E.dtTel = v.dt; if (v.conf != null) E.confiance = v.conf;
    let lat = null; if (E.decalage != null) { const reseau = maintenant - (v.t - E.decalage); if (reseau > -50 && reseau < 3000) { lat = Math.max(0, reseau) + (v.dt || 0); latRecentes.push(lat); if (latRecentes.length > 90) latRecentes.shift(); } }
    const p0 = performance.now(); if (surTrames) surTrames({ t: v.t, ratio: v.ratio, mains: v.mains, seq: v.seq, dt: v.dt, conf: v.conf, lat, oct: dernierOct }); dernierOct = 0; E.traitement = E.traitement * 0.9 + (performance.now() - p0) * 0.1;
    return true;
  }
  /* Trames reçues pendant la dernière seconde (par n'importe quel chemin). */
  function debit() { const lim = Date.now() - 1000; vus = vus.filter(t => t >= lim); return vus.length; }
  /* Chemin réellement utilisé : celui d'où viennent les trames depuis 1,5 s ; sinon celui qui est ouvert. */
  function cheminActuel() {
    const frais = Date.now() - dernierLienT < 1500;
    if (frais && dernierLien === 'a') return 'direct'; if (frais && dernierLien === 'b') return 'relais'; if (frais && dernierLien === 'c') return 'worker';
    const a = canal && canal.readyState === 'open', b = ws && ws.readyState === 1;
    return a ? 'direct' : b ? 'relais' : (voulu && E.session ? 'worker' : 'aucun');
  }
  const lienA = () => !!(canal && canal.readyState === 'open'), lienB = () => !!(ws && ws.readyState === 1);
  const compterLocal = txt => { if (LC()) LC().compterCandidat(E.ice.local, txt); }, compterDistant = txt => { if (LC()) LC().compterCandidat(E.ice.distant, txt); };
  /* Candidat choisi par WebRTC (local / public / relais) : lu une fois la liaison établie. */
  async function lirePaire(p) {
    try { const st = await p.getStats(); let tr = null; st.forEach(r => { if (r.type === 'transport' && r.selectedCandidatePairId) tr = r.selectedCandidatePairId; });
      st.forEach(r => { if (r.type === 'candidate-pair' && (r.id === tr || r.nominated && r.state === 'succeeded')) { const l = st.get(r.localCandidateId); if (l && l.candidateType) E.ice.paire = l.candidateType; } }); } catch (e) { /* statistiques non disponibles */ }
  }

  // ── liaison directe ──
  const envoyerSignal = m => (lienB() && pairWs && envoyerWs({ t: 'sig', m })) ? Promise.resolve() : api('/camera/signal-pc', { s: E.session, m }).catch(e => { E.signal.erreur = e && e.status === 404 ? 'Worker sans signalisation (mise à jour requise)' : 'signalisation injoignable'; });
  function fermerPair() {
    if (!lienB()) { clearInterval(pings); pings = 0; sondes = {}; echHorloge = []; latRecentes = []; }
    try { ctrl && ctrl.close(); } catch (e) { /* déjà fermé */ } ctrl = null; E.piste = null; E.calcul = 'telephone'; E.decalage = null; E.tel = null;
    try { canal && canal.close(); } catch (e) { /* déjà fermé */ } try { pair && pair.close(); } catch (e) { /* déjà fermée */ }
    canal = null; pair = null; debutNegociation = 0; E.rttDirect = null;
    if (E.liaison === 'direct' || E.liaison === 'negociation') E.liaison = E.session ? 'worker' : 'aucune';
    E.rtt = E.rttRelais; E.delai = E.rtt != null ? Math.max(1, Math.round(E.rtt / 2)) : null; E.apercu = null; E.binaire = false; if (suivi) suivi.reinitialiser();
  }
  /* Une fois par seconde : débit, pertes, délai bout en bout et conseil, sur la fenêtre de suivi ET renvoyés au téléphone. */
  function mesures() {
    if (!suivi || !PB()) return; const st = suivi.stats(); E.perte = st.perte; E.ecartes = st.ecartes; E.gigue = st.gigue;
    E.delaiTotal = PB().delaiBoutEnBout(E.dtTel, E.rtt, E.traitement); if (latRecentes.length >= 10) { const s = latRecentes.slice().sort((a, b) => a - b); E.delaiMesure = Math.round(s[Math.floor(s.length * 0.5)]); E.delaiMesureP95 = Math.round(s[Math.floor(s.length * 0.95)]); E.delaiTotal = E.delaiMesure; }   // V10 : le vrai délai (horloges synchronisées) remplace l'estimation
    E.chemin = cheminActuel(); const actif = (E.chemin === 'direct' || E.chemin === 'relais') && E.etat === 'connecte', mainsVues = !!(E.derniereTrame && E.derniereTrame.mains.length && Date.now() - E.derniere < 700);
    E.conseil = PB().conseil({ debit: debit(), perte: E.perte, delai: E.delaiTotal, mainsVues, actif });
    envoyerMeilleur({ t: 'stats', delai: E.delaiTotal, perte: +E.perte.toFixed(3), debit: debit(), conseil: E.conseil, rttA: E.rttDirect, rttB: E.rttRelais, chemin: E.chemin });
  }
  /* Décalage d'horloge téléphone − PC : le pong porte l'heure du téléphone (m.h) ; on suppose l'aller et le retour égaux et on garde l'échantillon de plus petit aller-retour des 12 derniers (le moins faussé). */
  function echantillonHorloge(m, rtt, d) {
    if (!Number.isFinite(m.h) || d == null) return;
    echHorloge.push({ rtt, off: m.h - (d + rtt / 2) }); if (echHorloge.length > 12) echHorloge.shift();
    const meilleur = echHorloge.reduce((a, b) => (b.rtt < a.rtt ? b : a)); E.decalage = meilleur.off; E.rttMin = meilleur.rtt;
  }
  function envoyerCtrl(o) { const s = JSON.stringify(o); for (const k of [ctrl, canal]) { if (k && k.readyState === 'open') { try { k.send(s); return true; } catch (e) { /* canal en difficulté : on essaie l'autre */ } } } if (o.t !== 'sdp' && lienB()) { try { ws.send(s); return true; } catch (e) { /* relais en difficulté */ } } return false; }
  /* Réglages envoyés au téléphone (résolution, mains, aperçu, calcul…) : le téléphone les applique et les affiche. */
  function envoyerReglages(patch) { E.reglagesEnvoyes = { ...patch }; return envoyerCtrl({ t: 'cfg', ...patch }); }
  /* Mode « calcul sur le PC » : désactivé par défaut. `voulu` autorise le PC à accepter la vidéo ; le téléphone doit ENCORE accepter de son côté. */
  function demanderCalculPc(oui) { E.calculVoulu = !!oui; if (!oui && E.piste) { E.piste = null; if (surPiste) surPiste(null); } return envoyerReglages({ calcul: oui ? 'pc' : 'telephone' }); }
  /* Un message du canal de contrôle (fiable) ou du canal de points. */
  async function traiterControle(m) {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'tel') {
      const b = x => (typeof x === 'number' && isFinite(x) ? x : null), s = { cam: b(m.cam), det: b(m.det), detMs: b(m.detMs), sautes: b(m.sautes), bat: b(m.bat), charge: typeof m.charge === 'boolean' ? m.charge : null, eco: !!m.eco, res: b(m.res), calcul: m.calcul === 'pc' ? 'pc' : 'telephone', lum: b(m.lum), mode: String(m.mode || '').slice(0, 12), delegate: String(m.delegate || '').slice(0, 6), mains: m.mains === 1 ? 1 : 2, noir: !!m.noir, auto: !!m.auto };
      E.tel = s; if (surTelephone) surTelephone(s);
    } else if (m.t === 'calcul') { E.calcul = m.etat === 'pc' ? 'pc' : 'telephone'; if (m.etat === 'refuse') E.calculVoulu = false; if (E.calcul !== 'pc') { E.piste = null; if (surPiste) surPiste(null); } prevenir(); }
    else if (m.t === 'sdp' && m.type === 'offer' && typeof m.sdp === 'string' && pair) {
      if (!E.calculVoulu) return;   // le PC n'a pas demandé la vidéo : une offre ne change rien (le réglage est ici, par défaut éteint)
      try { await pair.setRemoteDescription({ type: 'offer', sdp: m.sdp }); const a = await pair.createAnswer(); await pair.setLocalDescription(a); envoyerCtrl({ t: 'sdp', type: 'answer', sdp: a.sdp }); } catch (e) { E.directEchec = 'négociation de la vidéo impossible'; }
    }
  }
  function brancherCtrl(c) {
    ctrl = c; c.onmessage = ev => { if (typeof ev.data !== 'string' || ev.data.length > 24000) return; let m; try { m = JSON.parse(ev.data); } catch (e) { return; } traiterControle(m); };
    c.onclose = () => { if (ctrl === c) ctrl = null; };
  }
  function envoyerCanal(o) { if (canal && canal.readyState === 'open') { try { canal.send(JSON.stringify(o)); return true; } catch (e) { return false; } } return false; }
  function envoyerWs(o) { if (lienB()) { try { ws.send(JSON.stringify(o)); return true; } catch (e) { return false; } } return false; }
  const envoyerMeilleur = o => envoyerCanal(o) || envoyerWs(o);   // le message part par le chemin direct s'il est ouvert, sinon par le relais temps réel
  function arretLiens() { clearInterval(pings); pings = 0; sondes = {}; }
  /* Une fois par seconde, sur CHAQUE liaison ouverte : un ping (aller-retour mesuré par liaison), l'annonce « je lis les paquets binaires », puis les mesures. */
  function tickLiens() {
    for (const [l, ouvert, envoyer] of [['a', lienA(), envoyerCanal], ['b', lienB(), envoyerWs]]) if (ouvert) { const n = ++nPing; sondes[n] = { t: performance.now(), l, d: Date.now() }; envoyer({ t: 'ping', n, l }); envoyer({ t: 'caps', binaire: !!PB() }); }
    mesures(); for (const k of Object.keys(sondes)) if (performance.now() - sondes[k].t > 6000) delete sondes[k];
  }
  function demarrerLiens() { if (!pings) pings = setInterval(tickLiens, 1000); }
  function traiterPong(m, rtt, sd) {
    if (sd.l === 'b') { E.rttRelais = rtt; E.ws.rtt = rtt; } else E.rttDirect = rtt;
    echantillonHorloge(m, rtt, sd.d);
    E.chemin = cheminActuel(); E.rtt = E.chemin === 'relais' ? (E.rttRelais != null ? E.rttRelais : rtt) : (E.rttDirect != null ? E.rttDirect : rtt);
    E.delai = Math.max(1, Math.round(E.rtt / 2)); (sd.l === 'b' ? envoyerWs : envoyerCanal)({ t: 'rtt', ms: rtt });
  }
  /* Un message reçu par l'un des deux liens rapides ('a' = direct, 'b' = relais temps réel). */
  function traiterMessage(ev, lien) {
    if (ev.data instanceof ArrayBuffer && PB()) {   // V5 : paquet binaire (100 à 184 octets)
      if (ev.data.byteLength > 400) return; const t = PB().decoder(ev.data); if (!t) return;
      if (suivi.noter(t.seq) !== 'ok') return;   // plus vieux que le dernier vu, ou doublon : écarté, jamais traité en retard
      E.binaire = true; dernierOct = ev.data.byteLength; recevoir(t, lien); return;
    }
    if (typeof ev.data !== 'string' || ev.data.length > 24000) return;   // un message de points fait ~ 2 Ko ; une image d'aperçu 16 Ko au plus
    let m; try { m = JSON.parse(ev.data); } catch (e) { return; } if (!m || typeof m !== 'object') return;
    const repondre = lien === 'b' ? envoyerWs : envoyerCanal;
    if (m.a === 'mains') { recevoir(m, lien); }
    else if (m.t === 'ping') repondre({ t: 'pong', n: m.n, l: m.l });
    else if (m.t === 'pong') { const sd = sondes[m.n]; if (sd) { delete sondes[m.n]; traiterPong(m, Math.round(performance.now() - sd.t), sd); } }
    else if (m.t === 'tel' || m.t === 'calcul' || m.t === 'sdp') traiterControle(m);
    else if (m.t === 'diag') { E.diagTel = nettoyerDiag(m); prevenir(); }
    else if (m.t === 'sig') { if (m.m && typeof m.m === 'object') traiterSignal(m.m); }
    else if (m.t === 'bienvenue') { E.workerInfo.version = Number(m.v) || E.workerInfo.version; E.workerInfo.joignable = true; E.workerInfo.relais = true; pairWs = !!m.pair; if (m.pair && E.etat === 'attente') E.etat = 'connecte'; prevenir(); }
    else if (m.t === 'pair') { pairWs = !!m.present; if (m.present && E.etat === 'attente') { E.etat = 'connecte'; E.jeton = null; } prevenir(); }
    else if (m.a === 'image') { if (lien === 'a' && E.apercuVoulu && typeof m.d === 'string' && m.d.length <= TAILLE_IMAGE_MAX && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(m.d)) { E.apercu = m.d; prevenir(); } }   // aperçu : seulement si Justin l'a demandé, seulement du JPEG, seulement en direct
  }
  const petit = (x, max) => (typeof x === 'string' ? x.slice(0, max) : ''), nombre = x => (typeof x === 'number' && isFinite(x) ? Math.round(x) : 0);
  const cands = c => ({ host: nombre(c && c.host), srflx: nombre(c && c.srflx), relay: nombre(c && c.relay), mdns: nombre(c && c.mdns) });
  function nettoyerDiag(m) { return { ice: { etat: petit(m.ice && m.ice.etat, 24), conn: petit(m.ice && m.ice.conn, 24), local: cands(m.ice && m.ice.local), distant: cands(m.ice && m.ice.distant), paire: petit(m.ice && m.ice.paire, 12) }, ws: { etat: petit(m.ws && m.ws.etat, 12), code: nombre(m.ws && m.ws.code) || null, raison: petit(m.ws && m.ws.raison, 80), rtt: m.ws && typeof m.ws.rtt === 'number' ? nombre(m.ws.rtt) : null }, direct: { ouvert: !!(m.direct && m.direct.ouvert), echec: petit(m.direct && m.direct.echec, 80) }, chemin: petit(m.chemin, 10), signal: { offre: !!(m.signal && m.signal.offre), reponse: !!(m.signal && m.signal.reponse), erreur: petit(m.signal && m.signal.erreur, 80) }, recu: Date.now() }; }
  function brancherCanal(c) {
    canal = c; try { c.binaryType = 'arraybuffer'; } catch (e) { /* navigateur sans binaryType : texte seulement */ }
    c.onopen = () => {
      E.liaison = 'direct'; E.directEchec = ''; debutNegociation = 0; E.erreur = ''; E.chemin = cheminActuel(); demarrerLiens();
      if (E.apercuVoulu) envoyerCanal({ t: 'apercu', actif: true });
      envoyerCanal({ t: 'caps', binaire: !!PB() });   // annonce : « je sais lire les paquets binaires »
      lirePaire(pair); prevenir();
    };
    c.onclose = () => { if (canal !== c) return; canal = null; if (!lienB()) arretLiens(); E.liaison = voulu ? 'worker' : 'aucune'; E.rttDirect = null; E.rtt = E.rttRelais; E.delai = E.rtt != null ? Math.max(1, Math.round(E.rtt / 2)) : null; E.apercu = null; E.chemin = cheminActuel(); prevenir(); };
    c.onmessage = ev => traiterMessage(ev, 'a');
  }
  /* ── chemin B : relais temps réel (WebSocket vers le Durable Object du Worker). Ticket de 2 minutes fabriqué par le Worker (route protégée), jamais de D1 par paquet. ── */
  const planifierRelais = () => { clearTimeout(wsRetard); if (voulu && E.session) { wsEssais++; wsRetard = setTimeout(ouvrirRelais, Math.min(wsEssais > 6 ? 30000 : 8000, 400 * Math.pow(2, Math.min(wsEssais, 5)))); } };
  async function verifierWorker() {
    try { const r = await wfetch('/camera/version', { method: 'GET' }, 8000), j = r.ok ? await r.json() : null; E.workerInfo.joignable = true;
      if (j) { E.workerInfo.version = Number(j.v) || null; E.workerInfo.relais = !!j.relais; E.workerInfo.turn = !!j.turn; } else { E.workerInfo.version = null; E.workerInfo.relais = false; E.versionAlerte = 'mise à jour du Worker requise'; }
    } catch (e) { E.workerInfo.joignable = false; }
    prevenir();
  }
  async function ouvrirRelais() {
    clearTimeout(wsRetard); if (!voulu || !E.session) return; if (typeof WebSocket === 'undefined') { E.ws = { etat: 'refuse', code: null, raison: 'WebSocket indisponible dans ce navigateur', rtt: null, depuis: 0 }; prevenir(); return; } if (ws && ws.readyState <= 1) return;
    E.ws = { ...E.ws, etat: 'connexion', raison: '' }; prevenir(); let ticket;
    try { ticket = (await api('/camera/ticket', { s: E.session })).ticket; }
    catch (e) { E.ws = { etat: 'refuse', code: e.status || null, raison: e.status === 404 ? 'Worker sans relais temps réel (mise à jour requise)' : messageErreur(e), rtt: null, depuis: 0 }; if (e.status === 404) { E.workerInfo.joignable = true; E.workerInfo.version = null; E.versionAlerte = 'mise à jour du Worker requise'; prevenir(); return; } prevenir(); return planifierRelais(); }   // 404 : ce Worker n'a pas le relais, inutile de réessayer
    if (!voulu || !E.session) return;
    const adresse = workerUrl().replace(/^http/i, 'ws') + '/camera/ws?s=' + encodeURIComponent(E.session); let w;
    try { w = new WebSocket(adresse, ['rayle.v1', 't.' + ticket]); } catch (e) { E.ws = { etat: 'refuse', code: null, raison: 'WebSocket impossible dans ce navigateur', rtt: null, depuis: 0 }; prevenir(); return; }
    w.binaryType = 'arraybuffer'; ws = w; let ouvert = false;
    w.onopen = () => { if (ws !== w) return; ouvert = true; wsEssais = 0; E.ws = { etat: 'ouvert', code: null, raison: '', rtt: null, depuis: Date.now() }; envoyerWs({ t: 'caps', binaire: !!PB() }); demarrerLiens(); E.chemin = cheminActuel(); prevenir(); };
    w.onmessage = ev => { if (ws === w) traiterMessage(ev, 'b'); };
    w.onclose = ev => {
      if (ws !== w) return; ws = null; pairWs = false; E.rttRelais = null; E.rtt = E.rttDirect; E.ws = { etat: 'ferme', code: ev.code || null, raison: ev.reason || (ouvert ? '' : 'connexion refusée ou impossible'), rtt: null, depuis: 0 };
      if (!lienA()) arretLiens(); E.chemin = cheminActuel(); if (!ouvert) verifierWorker(); prevenir();
      if (voulu && ev.code !== 4003 && ev.code !== 4000) planifierRelais();   // 4003 : session fermée ; 4000 : remplacée par un autre onglet du PC
    };
    w.onerror = () => { /* le détail arrive dans onclose */ };
  }
  function fermerRelais() { clearTimeout(wsRetard); wsEssais = 0; const w = ws; ws = null; pairWs = false; try { w && w.close(1000, 'fin'); } catch (e) { /* déjà fermé */ } E.ws = { etat: 'aucun', code: null, raison: '', rtt: null, depuis: 0 }; E.rttRelais = null; }
  async function traiterSignal(m) {
    if (!m || typeof m !== 'object') return;
    if (m.k === 'offre' && typeof m.sdp === 'string') {
      if (typeof RTCPeerConnection === 'undefined') return;
      fermerPair(); E.liaison = 'negociation'; debutNegociation = Date.now(); E.signal = { offre: true, reponse: false, erreur: '' }; E.ice = { etat: 'new', conn: 'new', local: { host: 0, srflx: 0, relay: 0, mdns: 0 }, distant: { host: 0, srflx: 0, relay: 0, mdns: 0 }, paire: '' };
      const p = pair = new RTCPeerConnection({ iceServers: iceServeurs });
      p.oniceconnectionstatechange = () => { if (pair !== p) return; E.ice.etat = p.iceConnectionState; E.ice.conn = p.connectionState; if (p.iceConnectionState === 'connected' || p.iceConnectionState === 'completed') lirePaire(p); prevenir(); };
      p.ondatachannel = ev => { if (pair !== p) return; if (ev.channel.label === 'ctrl') brancherCtrl(ev.channel); else brancherCanal(ev.channel); };
      p.ontrack = ev => { if (pair !== p || !E.calculVoulu) return; E.piste = ev.streams && ev.streams[0] ? ev.streams[0] : new MediaStream([ev.track]); E.calcul = 'pc'; try { ev.receiver.jitterBufferTarget = 0; } catch (e) { /* non pris en charge */ } try { ev.receiver.playoutDelayHint = 0; } catch (e) { /* non pris en charge */ } if (surPiste) surPiste(E.piste); prevenir(); };
      p.onicecandidate = ev => { if (ev.candidate && pair === p) compterLocal(ev.candidate.candidate); if (ev.candidate && pair === p) envoyerSignal({ k: 'ice', c: { candidate: ev.candidate.candidate, sdpMLineIndex: ev.candidate.sdpMLineIndex, sdpMid: ev.candidate.sdpMid } }); };
      p.onconnectionstatechange = () => { if (pair === p && (p.connectionState === 'failed' || p.connectionState === 'closed')) { E.directEchec = 'la liaison directe a échoué'; fermerPair(); prevenir(); } };
      try { await p.setRemoteDescription({ type: 'offer', sdp: m.sdp }); const r = await p.createAnswer(); await p.setLocalDescription(r); await envoyerSignal({ k: 'reponse', sdp: r.sdp }); E.signal.reponse = true; }
      catch (e) { E.directEchec = 'négociation impossible'; E.signal.erreur = 'négociation impossible'; fermerPair(); }
    } else if (m.k === 'ice' && pair && m.c) { compterDistant(m.c.candidate); try { await pair.addIceCandidate({ candidate: m.c.candidate, sdpMLineIndex: m.c.sdpMLineIndex, sdpMid: m.c.sdpMid }); } catch (e) { /* candidat périmé : sans importance */ } }
  }
  /* Aperçu vidéo : désactivé par défaut. L'image ne passe que par la liaison DIRECTE (jamais par le Worker), en petit JPEG, et seulement tant que Justin le demande. */
  function definirApercu(oui) { E.apercuVoulu = !!oui; if (!oui) E.apercu = null; envoyerCanal({ t: 'apercu', actif: !!oui }); prevenir(); return E.apercuVoulu && canal && canal.readyState === 'open'; }

  async function demarrer({ aSurTrames } = {}) {
    await arreter(false); surTrames = aSurTrames || surTrames; E.erreur = ''; E.directEchec = '';
    if (!workerOk()) { E.etat = 'erreur'; E.erreur = 'Le Worker n’est pas configuré (⚙ Réglages) : le téléphone passe par lui.'; prevenir(); return false; }
    try {
      const s = await api('/camera/session', {});
      E.session = s.id; E.jeton = s.jeton; E.expire = s.expire; E.etat = 'attente'; E.recues = 0; E.derniere = 0; E.dernierEnvoi = null; apres = 0; sigApres = 0; vus = []; voulu = true; E.liaison = 'worker'; E.chemin = 'worker'; E.workerInfo = { joignable: true, version: Number(s.v) || null, relais: null, turn: null, raison: '' }; E.versionAlerte = Number(s.v) >= 11 ? '' : 'mise à jour du Worker requise'; E.signal = { offre: false, reponse: false, erreur: '' }; wsEssais = 0;
      E.url = adresseQR(pageCamera(), s.id, s.jeton, workerUrl());
      E.qr = window.QrMatrice ? window.QrMatrice.matriceQR(E.url) : null;
    } catch (e) { E.etat = 'erreur'; E.erreur = messageErreur(e); E.session = E.jeton = null; prevenir(); return false; }
    prevenir(); planifier(1000);
    api('/camera/ice-pc', {}).then(r => { if (r && Array.isArray(r.iceServers) && r.iceServers.length) iceServeurs = r.iceServers; E.workerInfo.version = Number(r.v) || E.workerInfo.version; E.workerInfo.turn = !!r.turn; E.workerInfo.raison = r.raison || ''; E.workerInfo.relais = true; E.versionAlerte = ''; prevenir(); }).catch(e => { iceServeurs = ICE_SECOURS; if (e && e.status === 404) { E.workerInfo.version = null; E.versionAlerte = 'mise à jour du Worker requise'; } prevenir(); });
    ouvrirRelais();   // chemin B, en parallèle du chemin A
    return true;
  }
  function planifier(ms) { clearTimeout(minuteur); if (voulu) minuteur = setTimeout(tour, ms); }
  async function tour() {
    if (!voulu || !E.session) return; if (enVol) return planifier(100); enVol = true; let delai = 120;
    try {
      const r = await api('/camera/lire?s=' + encodeURIComponent(E.session) + '&apres=' + apres + '&sig=' + sigApres);
      apres = r.seq; E.dernierEnvoi = r.dernierEnvoi; E.expire = r.expire || E.expire;
      if (r.etat === 'rejointe') { if (E.etat !== 'connecte') E.etat = 'connecte'; E.jeton = null; }   // le jeton a servi : il ne reste plus nulle part
      else if (r.etat === 'attente') { E.etat = 'attente'; delai = 1000; }
      else if (r.etat === 'expiree') { E.etat = 'expiree'; voulu = false; fermerPair(); }
      else if (r.etat === 'fermee') { E.etat = 'fermee'; voulu = false; fermerPair(); }
      for (const x of (r.signaux || [])) { sigApres = Math.max(sigApres, Number(x.q) || 0); await traiterSignal(x.m); }
      for (const t of (r.trames || [])) recevoir(t, 'c');
      if (E.liaison === 'negociation' && debutNegociation && Date.now() - debutNegociation > DELAI_DIRECT_MS) { E.directEchec = 'la liaison directe n’a pas abouti en ' + DELAI_DIRECT_MS / 1000 + ' s' + (lienB() ? ' (le relais temps réel prend le relais)' : ''); fermerPair(); E.liaison = 'worker'; }
      if (E.liaison === 'direct' || lienB()) delai = E.liaison === 'negociation' && !lienB() ? 150 : (E.etat === 'attente' ? 1000 : 3000);   // les points arrivent par un lien rapide : on ne consulte le Worker (D1) que pour savoir si la session vit encore
      else if (E.liaison === 'negociation') delai = 150;
      else if (E.etat === 'connecte' && E.dernierEnvoi && Date.now() - E.dernierEnvoi > 4000) delai = 600;   // téléphone silencieux : on ralentit
      E.erreur = '';
    } catch (e) { E.erreur = messageErreur(e); delai = 2500; if (e && (e.status === 401 || e.status === 404)) voulu = false; }
    enVol = false; prevenir(); if (voulu) planifier(delai);
  }
  /* Faits observés pour le « Diagnostic de liaison » (calcul pur dans camera/liaison-calcul.js). Le téléphone envoie aussi les siens (E.diagTel) : on garde les plus parlants. */
  function faitsDiagnostic() {
    const t = E.diagTel, tel = t && Date.now() - t.recu < 15000 ? t : null;
    return { worker: { ...E.workerInfo }, signal: { ...E.signal, ...(tel && tel.signal && tel.signal.erreur ? { erreur: tel.signal.erreur } : {}) }, ice: { ...E.ice, local: { ...E.ice.local }, distant: { ...E.ice.distant } }, ws: { ...E.ws }, direct: { ouvert: lienA(), rtt: E.rttDirect, echec: E.directEchec }, chemin: cheminActuel(), debit: debit(), delai: E.delai, trames: E.recues, telephone: tel };
  }
  function diagnostic() { const f = faitsDiagnostic(); const r = LC() ? LC().diagnostiquer(f) : { etapes: [], chemin: f.chemin, cause: 'Module de diagnostic absent.', conseils: [] }; r.faits = f; return r; }
  async function arreter(prevenirAussi = true) {
    voulu = false; clearTimeout(minuteur); const s = E.session; envoyerMeilleur({ t: 'fin' }); fermerPair(); fermerRelais(); arretLiens(); E.chemin = 'aucun'; E.diagTel = null; E.session = null; E.jeton = null; E.qr = null; E.url = ''; E.liaison = 'aucune'; E.derniereTrame = null;
    if (s && workerOk()) { try { await api('/camera/fin', { s }); } catch (e) { /* le Worker referme tout seul à l'expiration */ } }
    if (E.etat !== 'erreur') E.etat = 'inactive';
    if (prevenirAussi) prevenir();
  }
  return { demarrer, arreter, mesures, diagnostic, faitsDiagnostic, envoyerReglages, demanderCalculPc, definirSurTelephone: f => { surTelephone = f; }, definirSurPiste: f => { surPiste = f; }, delaisRecents: () => latRecentes.slice(), etat: () => ({ ...E, qr: E.qr, debit: debit(), chemin: cheminActuel() }), debit, surEvenement, pageCamera, adresseQR, definirSurTrames: f => { surTrames = f; }, definirApercu, recevoirTrame: recevoir };
})();
window.CameraRelais = CameraRelais;
