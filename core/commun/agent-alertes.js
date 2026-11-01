"use strict";
/* ═════════════ ALERTES « NOUVELLE POSITION » (partagées PC / tablette / téléphone ; window.AgentAlertes) ═════════════
   Dès qu'une position apparaît (en attente ou ouverte) dans la vue publiée par l'agent, la page prévient : bandeau en haut de l'écran, notification du navigateur si l'autorisation est accordée,
   vibration sur mobile. Une position n'alerte qu'UNE fois (identifiants vus gardés dans le stockage de l'appareil) ; à la toute première lecture rien ne sonne (on ne rejoue pas le passé).
   Aucun ordre n'est passé : l'alerte sert à copier la position à la main. Deux formes de vue acceptées : `actives` (mode Trader) et `actifs[x].positions` (tableau vivant). Calcul pur testé :
   galaxie/tests/agent-alertes-test.mjs. */
(function (racine) {
  const CLE = 'rayle_agent_vus', MAX_VUS = 400;
  const fin = x => typeof x === 'number' && Number.isFinite(x);
  const nombre = p => (!fin(p) ? '—' : Math.abs(p) >= 1000 ? String(Math.round(p)) : Math.abs(p) >= 10 ? p.toFixed(2).replace('.', ',') : p.toFixed(4).replace('.', ','));
  const esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* Toutes les positions « vivantes » (en attente / ouvertes) de la vue, sans les démos ni les fantômes. */
  function positionsVivantes(vue) {
    const sortie = [], vues = new Set();
    const ajouter = (p, actif) => { if (!p || p.fantome || p.demo || (p.statut !== 'en_attente' && p.statut !== 'ouverte') || p.id == null || vues.has(p.id)) return; vues.add(p.id); sortie.push({ ...p, actif: p.actif || actif }); };
    if (vue && Array.isArray(vue.actives)) for (const p of vue.actives) ajouter(p, p.actif);
    if (vue && vue.actifs) for (const [a, x] of Object.entries(vue.actifs)) for (const p of (x && x.positions) || []) ajouter(p, a);
    return sortie;
  }
  /* Événements à signaler. `connu` = { id: dernier statut vu }. Nouvelle position (jamais vue) → « nouvelle » ; ordre limite devenu position ouverte → « ouverte ». À la toute première lecture (`premiere`), seules
     les positions de moins de `fraicheurMs` sont signalées (on ne rejoue pas le passé, mais on ne rate pas ce qui vient d'arriver). Renvoie aussi la mémoire mise à jour. */
  function evenements(vue, connu, { maintenant = Date.now(), premiere = false, fraicheurMs = 30 * 60e3 } = {}) {
    const m = connu || {}, alertes = [], suivant = { ...m };
    for (const p of positionsVivantes(vue)) {
      const avant = m[p.id], t = p.tSignal || p.t || p.tEntree || null, recente = t != null && maintenant - t <= fraicheurMs;
      if (avant === undefined) { if (!premiere || recente) alertes.push({ p, type: 'nouvelle' }); }
      else if (avant === 'en_attente' && p.statut === 'ouverte') alertes.push({ p, type: 'ouverte' });
      suivant[p.id] = p.statut;
    }
    return { alertes, suivant };
  }
  function texte(p, type = 'nouvelle') {
    const sens = Number(p.sens) < 0 || /vente|short/i.test(String(p.sens)) ? 'VENTE' : 'ACHAT', cible = fin(p.cible1) ? p.cible1 : p.cible, etat = p.statut === 'ouverte' ? 'ouverte' : 'en attente (ordre limite)';
    const r = fin(p.entree) && fin(p.stop) && fin(cible) && p.entree !== p.stop ? ' · 1:' + (Math.abs(cible - p.entree) / Math.abs(p.entree - p.stop)).toFixed(1).replace('.', ',') : '';
    return { titre: (type === 'ouverte' ? 'Position ouverte : ' : 'Nouvelle position : ') + sens + ' ' + (p.actif || '') + (p.tf ? ' ' + p.tf : ''), corps: etat + ' · entrée ' + nombre(p.entree) + ' · stop ' + nombre(p.stop) + ' · objectif ' + nombre(cible) + r + ' · SIMULATION, aucun ordre réel' };
  }
  const API = { positionsVivantes, evenements, texte, CLE, MAX_VUS };
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; return; }

  /* ── partie navigateur ── */
  if (racine.AgentAlertes) return;   // module chargé deux fois (index.html + fenêtre de l'agent) : une seule veille
  const lire = () => { try { const j = JSON.parse(localStorage.getItem(CLE) || 'null'); if (Array.isArray(j)) { const o = {}; for (const id of j) o[id] = 'en_attente'; return o; } return j && typeof j === 'object' ? j : null; } catch (e) { return null; } };
  const ecrire = o => { try { const k = Object.keys(o); if (k.length > MAX_VUS) for (const id of k.slice(0, k.length - MAX_VUS)) delete o[id]; localStorage.setItem(CLE, JSON.stringify(o)); } catch (e) { /* stockage plein ou interdit */ } };
  function bandeau(t) {
    if (typeof document === 'undefined' || !document.body) return; let h = document.getElementById('agent-alertes'); if (!h) { h = document.createElement('div'); h.id = 'agent-alertes'; h.setAttribute('role', 'status'); h.setAttribute('aria-live', 'assertive'); h.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:99999;display:flex;flex-direction:column;gap:6px;width:min(560px,94vw);pointer-events:none'; document.body.appendChild(h); }
    const c = document.createElement('div'); c.className = 'agent-alerte'; c.style.cssText = 'pointer-events:auto;background:rgba(6,8,12,.96);border:1px solid #27d98a;border-left:4px solid #27d98a;color:#e8f2f5;padding:10px 12px;font:600 14px system-ui,sans-serif;cursor:pointer';
    c.innerHTML = '<div>' + esc(t.titre) + '</div><div style="font-weight:400;font-size:13px;color:#b8c7cf;margin-top:2px">' + esc(t.corps) + '</div>'; c.addEventListener('click', () => c.remove()); h.appendChild(c); setTimeout(() => c.remove(), 30000);
  }
  function notifier(t) { try { if (typeof Notification !== 'undefined' && Notification.permission === 'granted') new Notification(t.titre, { body: t.corps, tag: t.titre }); } catch (e) { /* pas de notification */ } try { if (navigator.vibrate) navigator.vibrate([120, 60, 120]); } catch (e) { /* pas de vibration */ } }
  /* Appelée à chaque lecture de la vue (par la fenêtre de l'agent ou par la veille de fond). Renvoie les positions signalées. */
  function surVue(vue) {
    if (!vue) return []; const connu = lire(), r = evenements(vue, connu, { premiere: connu === null }); ecrire(r.suivant);
    for (const a of r.alertes) { const t = texte(a.p, a.type); bandeau(t); notifier(t); try { racine.dispatchEvent(new CustomEvent('agent:nouvelle-position', { detail: { position: a.p, type: a.type, ...t } })); } catch (e) { /* rien */ } }
    return r.alertes.map(a => a.p);
  }
  function autoriser() { try { if (typeof Notification !== 'undefined' && Notification.permission === 'default') return Notification.requestPermission(); } catch (e) { /* refusé */ } return Promise.resolve(typeof Notification !== 'undefined' ? Notification.permission : 'denied'); }
  /* Veille de fond : l'alerte ne dépend plus de la fenêtre de l'agent. Lit le service du PC (30 s), sinon la copie du Worker (90 s). Une seule veille par page. */
  let veille = null;
  async function lireFond() {
    try { const r = await fetch('/__agent/trader', { cache: 'no-store' }); if (r.ok) { const j = await r.json(); if (j && j.ok && j.existe && j.vue) return { vue: j.vue, pc: true }; } } catch (e) { /* pas de serveur local */ }
    try { if (racine.wjson && typeof workerReady !== 'undefined' && workerReady()) { const j = await racine.wjson('/agent/mobile', 15000); if (j && j.paquet && j.paquet.trader) return { vue: j.paquet.trader, pc: false }; } } catch (e) { /* Worker injoignable */ }
    return null;
  }
  function demarrer({ lire: lecteur = lireFond, pasPc = 30000, pasWorker = 90000 } = {}) {
    if (veille) return veille; let arret = false, minuteur = null;
    const tour = async () => { if (arret) return; let pas = pasPc; try { const d = await lecteur(); if (d && d.vue) { surVue(d.vue); if (!d.pc) pas = pasWorker; } else pas = pasWorker; } catch (e) { pas = pasWorker; } if (!arret) minuteur = setTimeout(tour, pas); };
    minuteur = setTimeout(tour, 4000); veille = { arreter() { arret = true; clearTimeout(minuteur); veille = null; } }; return veille;
  }
  racine.AgentAlertes = { ...API, surVue, autoriser, demarrer };
}(typeof window !== 'undefined' ? window : globalThis));
