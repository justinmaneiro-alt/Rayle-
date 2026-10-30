"use strict";
/* ═════════════ LIAISON TÉLÉPHONE ↔ PC (V11) : calculs PURS, partagés par la page « Caméra Rayle » (téléphone) et la page Rayle (PC) ═════════════
   Trois chemins : A = direct (WebRTC), B = relais temps réel du Worker (WebSocket, Durable Object, sans D1), C = ancien relais par D1 (dernier recours).
   Ce module ne touche ni au réseau ni au DOM : il choisit le chemin, résume les candidats ICE et EXPLIQUE EN FRANÇAIS pourquoi une liaison échoue (bouton « Diagnostic de liaison »). */
(function (racine) {
  const VERSION_ATTENDUE = 11;

  /* « candidate:… typ host|srflx|prflx|relay … » → type ; une adresse « xxxx.local » est un candidat mDNS (adresse masquée par le navigateur). */
  function typeCandidat(texte) {
    const t = String(texte || ''), m = /\styp\s+(host|srflx|prflx|relay)\b/.exec(t);
    if (!m) return null;
    const mdns = /\s[0-9a-f-]{8,}\.local\s/i.test(t) || /\.local\s+\d+\s+typ/i.test(t);
    return { type: m[1], mdns };
  }
  function compterCandidat(c, texte) {
    const x = typeCandidat(texte); if (!x) return c;
    if (x.type === 'host') { c.host++; if (x.mdns) c.mdns++; } else if (x.type === 'srflx' || x.type === 'prflx') c.srflx++; else if (x.type === 'relay') c.relay++;
    return c;
  }
  const candidatsVides = () => ({ host: 0, srflx: 0, relay: 0, mdns: 0 });

  /* Chemin utilisé d'après ce qui est ouvert et mesuré. Préfère le direct ; ne quitte le chemin courant que pour un gain net (hystérésis : pas d'oscillation). */
  function choisirChemin({ directOuvert, rttDirect, relaisOuvert, rttRelais, courant }) {
    if (!directOuvert && !relaisOuvert) return 'worker';
    if (!directOuvert) return 'relais';
    if (!relaisOuvert) return 'direct';
    if (rttDirect == null || rttRelais == null) return courant === 'relais' ? 'relais' : 'direct';
    if (courant === 'relais') return rttDirect + 10 < rttRelais * 0.8 ? 'direct' : 'relais';   // retour au direct seulement s'il est nettement meilleur
    return rttDirect > rttRelais * 1.5 + 25 ? 'relais' : 'direct';                               // quitte le direct seulement s'il est nettement plus lent
  }

  const NOMS = { direct: 'Direct', relais: 'Relais temps réel', worker: 'Worker lent', aucun: 'Aucune liaison' };
  /* « Direct · 58 paquets/s · 22 ms » */
  function libelleChemin({ chemin, debit, delai }) {
    const nom = NOMS[chemin] || NOMS.aucun;
    if (chemin === 'aucun' || !chemin) return nom;
    return nom + ' · ' + (debit || 0) + ' paquets/s' + (delai != null ? ' · ' + Math.round(delai) + ' ms' : '');
  }
  /* Objectif V11 : au moins 30 paquets/s ; en dessous, la liaison est signalée « lente ». */
  const classeChemin = ({ chemin, debit }) => (chemin === 'direct' || chemin === 'relais') ? ((debit || 0) >= 30 ? 'ok' : 'att') : (chemin === 'worker' ? 'att' : 'ko');

  /* Diagnostic. `f` = faits observés (tous facultatifs) :
       worker: { joignable, version, relais, turn, raison }   signal: { offre, reponse, erreur }
       ice: { etat, conn, local:{host,srflx,relay,mdns}, distant:{…}, paire }    ws: { etat, code, raison, rtt }
       direct: { ouvert, rtt, echec }   chemin, debit, delai, trames   → { etapes:[{id,etat:'ok'|'ko'|'att'|'na',titre,detail}], chemin, cause, conseils:[] } */
  function diagnostiquer(f) {
    f = f || {}; const w = f.worker || {}, ice = f.ice || {}, ws = f.ws || {}, d = f.direct || {}, sg = f.signal || {};
    const loc = ice.local || candidatsVides(), dis = ice.distant || candidatsVides();
    const e = [], conseils = []; let cause = '';
    // 1. Worker
    if (w.joignable === false) { e.push({ id: 'worker', etat: 'ko', titre: 'Worker', detail: 'Le Worker ne répond pas (réseau coupé, adresse fausse ou Worker arrêté).' }); cause = cause || 'Le Worker ne répond pas : rien ne peut passer.'; conseils.push('Vérifie la connexion Internet du PC et du téléphone, puis l’adresse du Worker dans ⚙ Réglages.'); }
    else if (w.version == null && w.joignable !== true) e.push({ id: 'worker', etat: 'att', titre: 'Worker', detail: 'Pas encore interrogé.' });
    else if (w.version == null || w.version < VERSION_ATTENDUE) { e.push({ id: 'worker', etat: 'ko', titre: 'Worker', detail: 'Mise à jour du Worker requise : il ne connaît pas encore la liaison temps réel (version ' + (w.version == null ? 'ancienne' : w.version) + ', il faut la ' + VERSION_ATTENDUE + ').' }); cause = cause || 'Mise à jour du Worker requise : le Worker en ligne est trop ancien pour la liaison rapide.'; conseils.push('Sur le PC : ouvre un terminal dans le dossier worker puis lance  npx.cmd wrangler deploy'); }
    else e.push({ id: 'worker', etat: 'ok', titre: 'Worker', detail: 'À jour (liaison version ' + w.version + ').' });
    // 2. signalisation
    if (sg.erreur) { e.push({ id: 'signal', etat: 'ko', titre: 'Signalisation', detail: 'Échange offre / réponse impossible : ' + sg.erreur + '.' }); cause = cause || 'La signalisation (offre / réponse) a échoué : ' + sg.erreur + '.'; }
    else if (sg.reponse) e.push({ id: 'signal', etat: 'ok', titre: 'Signalisation', detail: 'Offre et réponse échangées.' });
    else if (sg.offre) e.push({ id: 'signal', etat: 'att', titre: 'Signalisation', detail: 'Offre envoyée, en attente de la réponse de l’autre côté.' });
    else e.push({ id: 'signal', etat: 'na', titre: 'Signalisation', detail: 'Pas encore démarrée.' });
    // 3. serveurs STUN / TURN
    const stunOk = loc.srflx > 0 || loc.relay > 0, turnOk = loc.relay > 0;
    if (w.turn === false) e.push({ id: 'turn', etat: 'att', titre: 'Serveur TURN', detail: 'Non configuré sur le Worker' + (w.raison ? ' (' + w.raison + ')' : '') + ' : deux appareils sur des réseaux différents ne pourront pas se joindre en direct.' });
    else if (turnOk) e.push({ id: 'turn', etat: 'ok', titre: 'Serveur TURN', detail: 'Joignable (' + loc.relay + ' adresse(s) de relais obtenue(s)).' });
    else if (w.turn === true && ice.etat && ice.etat !== 'new') e.push({ id: 'turn', etat: 'ko', titre: 'Serveur TURN', detail: 'Configuré mais aucune adresse de relais obtenue : le réseau bloque peut-être le port 3478 / 5349.' });
    else e.push({ id: 'turn', etat: 'na', titre: 'Serveur TURN', detail: w.turn === true ? 'Configuré, pas encore essayé.' : 'Inconnu.' });
    e.push({ id: 'stun', etat: stunOk ? 'ok' : (ice.etat && ice.etat !== 'new' ? 'ko' : 'na'), titre: 'Serveur STUN', detail: stunOk ? 'Joignable : adresse publique connue (' + loc.srflx + ').' : (ice.etat && ice.etat !== 'new' ? 'Aucune adresse publique obtenue : le réseau bloque peut-être les serveurs STUN (UDP).' : 'Pas encore essayé.') });
    // 4. candidats et état ICE
    const types = 'réseau local ' + loc.host + (loc.mdns ? ' (dont ' + loc.mdns + ' masqués en « .local »)' : '') + ' · public ' + loc.srflx + ' · relais ' + loc.relay + ' ; reçus de l’autre côté : local ' + dis.host + ', public ' + dis.srflx + ', relais ' + dis.relay;
    const ok = ice.conn === 'connected' || ice.conn === 'completed' || ice.etat === 'connected' || ice.etat === 'completed' || d.ouvert;
    if (ok) e.push({ id: 'ice', etat: 'ok', titre: 'Liaison directe (ICE)', detail: 'Établie' + (ice.paire ? ' par ' + ({ host: 'le réseau local', srflx: 'l’adresse publique', prflx: 'l’adresse publique', relay: 'le serveur de relais' }[ice.paire] || ice.paire) : '') + '. ' + types + '.' });
    else if (ice.etat === 'failed' || ice.conn === 'failed' || d.echec) {
      e.push({ id: 'ice', etat: 'ko', titre: 'Liaison directe (ICE)', detail: 'Échec. ' + types + '.' });
      const memeVu = dis.host + dis.srflx + dis.relay > 0;
      if (!memeVu) cause = cause || 'Aucune adresse n’est arrivée de l’autre côté : la signalisation est incomplète (Worker pas à jour ou message perdu).';
      else if (loc.mdns > 0 && loc.srflx + loc.relay === 0) cause = cause || 'Le navigateur masque les adresses locales (« .local ») et n’a obtenu aucune adresse publique : les deux appareils ne peuvent pas se trouver. Souvent : isolation des appareils du Wi-Fi, ou pare-feu Windows.';
      else if (loc.srflx > 0 && loc.relay === 0 && w.turn !== true) cause = cause || 'Les deux appareils ne sont probablement pas sur le même réseau (téléphone en 4G/5G, PC en Wi-Fi) et il n’y a pas de serveur TURN pour faire le pont.';
      else if (loc.relay > 0) cause = cause || 'Même avec le serveur de relais, la connexion a échoué : un pare-feu ou un réseau d’entreprise bloque tout le trafic UDP/TCP vers le relais.';
      else cause = cause || 'Les deux appareils ne se joignent pas : réseaux différents, isolation des appareils du Wi-Fi ou pare-feu Windows.';
      conseils.push('Mets le téléphone sur le MÊME Wi-Fi que le PC (pas en 4G/5G), et désactive « isolation des appareils / AP isolation » sur la box.');
      conseils.push('Pare-feu Windows : autorise Rayle (ou Edge) sur les réseaux privés ; Réseau privé plutôt que Public.');
      if (w.turn !== true) conseils.push('Pour fonctionner partout : crée la clé TURN gratuite Cloudflare (voir docs/DIAGNOSTIC_LIAISON.md).');
    } else if (ice.etat) e.push({ id: 'ice', etat: 'att', titre: 'Liaison directe (ICE)', detail: 'En cours (' + ice.etat + '). ' + types + '.' });
    else e.push({ id: 'ice', etat: 'na', titre: 'Liaison directe (ICE)', detail: 'Pas encore démarrée.' });
    // 5. relais temps réel
    if (ws.etat === 'ouvert') e.push({ id: 'relais', etat: 'ok', titre: 'Relais temps réel (WebSocket)', detail: 'Ouvert' + (ws.rtt != null ? ' · aller-retour ' + Math.round(ws.rtt) + ' ms' : '') + '.' });
    else if (ws.etat === 'refuse' || ws.etat === 'ferme') {
      const c = ws.code;
      let txt = 'Fermé' + (ws.raison ? ' : ' + ws.raison : '') + (c ? ' (code ' + c + ')' : '') + '.';
      if (c === 501 || /Durable|installé/i.test(ws.raison || '')) { txt = 'Le Worker n’a pas le relais temps réel (Durable Object absent).'; cause = cause || 'Mise à jour du Worker requise : le relais temps réel n’est pas installé.'; conseils.push('Sur le PC : dossier worker, puis  npx.cmd wrangler deploy'); }
      e.push({ id: 'relais', etat: 'ko', titre: 'Relais temps réel (WebSocket)', detail: txt });
    } else e.push({ id: 'relais', etat: ws.etat === 'connexion' ? 'att' : 'na', titre: 'Relais temps réel (WebSocket)', detail: ws.etat === 'connexion' ? 'Connexion en cours…' : 'Pas encore ouvert.' });
    // 6. chemin retenu
    const ch = f.chemin || 'aucun';
    e.push({ id: 'chemin', etat: ch === 'direct' || ch === 'relais' ? ((f.debit || 0) >= 30 ? 'ok' : 'att') : (ch === 'worker' ? 'att' : 'ko'), titre: 'Chemin utilisé', detail: libelleChemin({ chemin: ch, debit: f.debit, delai: f.delai }) + (ch === 'worker' ? ' — c’est le dernier recours, lent (quelques paquets par seconde).' : '') });
    if (ch === 'worker' && !cause) cause = 'Ni la liaison directe ni le relais temps réel ne sont ouverts : les points passent par l’ancien relais lent (D1).';
    if (!cause && (ch === 'direct' || ch === 'relais')) cause = (f.debit || 0) >= 30 ? 'Tout va bien : liaison rapide établie.' : 'Liaison établie mais lente : ' + (f.debit || 0) + ' paquets/s (objectif ≥ 30). Vérifie la détection sur le téléphone (lumière, caméra).';
    return { etapes: e, chemin: ch, cause: cause || 'Aucun problème détecté pour l’instant.', conseils: [...new Set(conseils)] };
  }
  function texteDiagnostic(r) {
    return ['DIAGNOSTIC DE LIAISON', ...r.etapes.map(x => ({ ok: '✔', ko: '✘', att: '…', na: '–' }[x.etat]) + ' ' + x.titre + ' : ' + x.detail), '', 'Cause : ' + r.cause, ...r.conseils.map(c => '→ ' + c)].join('\n');
  }
  const api = { VERSION_ATTENDUE, typeCandidat, compterCandidat, candidatsVides, choisirChemin, libelleChemin, classeChemin, diagnostiquer, texteDiagnostic };
  racine.LiaisonCalcul = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
