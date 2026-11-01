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
  /* Taille SIMULÉE de la position : on risque `risquePct` % du capital virtuel entre l'entrée et le stop. Notionnel = risque ÷ distance au stop ; levier = notionnel ÷ capital. Jamais un ordre réel. */
  const SIM_DEFAUT = { capital: 10000, risquePct: 1 };
  function tailleSimulee(p, sim = SIM_DEFAUT) {
    const cap = fin(sim && sim.capital) && sim.capital > 0 ? sim.capital : SIM_DEFAUT.capital, rp = fin(sim && sim.risquePct) && sim.risquePct > 0 ? sim.risquePct : SIM_DEFAUT.risquePct;
    if (!fin(p.entree) || !fin(p.stop) || p.entree === p.stop) return null; const risqueUsd = cap * rp / 100, notionnel = risqueUsd / (Math.abs(p.entree - p.stop) / p.entree);
    return { risqueUsd, risquePct: rp, notionnel, levier: notionnel / cap, capital: cap };
  }
  const usd0 = x => Math.round(x).toLocaleString('fr-FR').replace(/ /g, ' ') + ' $', virg = (x, d) => x.toFixed(d).replace('.', ',');
  function texte(p, type = 'nouvelle', sim = SIM_DEFAUT) {
    const achat = !(Number(p.sens) < 0 || /vente|short/i.test(String(p.sens))), cible = fin(p.cible1) ? p.cible1 : p.cible, etat = p.statut === 'ouverte' ? 'ouverte' : 'ordre limite en attente', ts = tailleSimulee(p, sim);
    const r = fin(p.entree) && fin(p.stop) && fin(cible) && p.entree !== p.stop ? ' · 1:' + virg(Math.abs(cible - p.entree) / Math.abs(p.entree - p.stop), 1) : '';
    return { titre: (type === 'ouverte' ? 'Position ouverte : ' : type === 'test' ? 'TEST : ' : 'Nouvelle position : ') + (achat ? 'ACHAT' : 'VENTE') + ' ' + (p.actif || '') + (p.tf ? ' ' + p.tf : ''),
      corps: 'Action ' + (achat ? 'Achat' : 'Vente') + ' (' + etat + ') · entrée ' + nombre(p.entree) + ' · taille ' + (ts ? usd0(ts.notionnel) : '—') + ' · TP ' + nombre(cible) + ' · SL ' + nombre(p.stop) + ' · levier ' + (ts ? virg(ts.levier, 1) + '×' : '—') + r
        + (ts ? ' · taille simulée : risque ' + usd0(ts.risqueUsd) + ' (' + virg(ts.risquePct, 1) + ' % de ' + usd0(ts.capital) + ')' : '') + ' · SIMULATION, aucun ordre réel' };
  }
  const API = { positionsVivantes, evenements, texte, tailleSimulee, SIM_DEFAUT, CLE, MAX_VUS };
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
  /* Taille simulée : réglée par le tableau (capital virtuel courant et risque par trade), mémorisée pour la veille de fond. */
  const CLE_SIM = 'rayle_agent_sim', CLE_ACTIF = 'rayle_alertes_agent';
  function simCourante() { try { const j = JSON.parse(localStorage.getItem(CLE_SIM) || 'null'); if (j && fin(j.capital) && fin(j.risquePct)) return j; } catch (e) { /* défaut */ } return SIM_DEFAUT; }
  function reglerSim(sim) { if (sim && fin(sim.capital) && fin(sim.risquePct) && sim.capital > 0 && sim.risquePct > 0) { try { localStorage.setItem(CLE_SIM, JSON.stringify({ capital: Math.round(sim.capital * 100) / 100, risquePct: sim.risquePct })); } catch (e) { /* interdit */ } } }
  const actives = () => { try { return localStorage.getItem(CLE_ACTIF) !== '0'; } catch (e) { return true; } };
  /* Notification système : via le service worker quand il existe (obligatoire sur Android), sinon `new Notification`. Renvoie ce qui a marché. */
  async function notifier(t) {
    const r = { notification: false, vibration: false, via: '' };
    try { if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      const reg = navigator.serviceWorker && navigator.serviceWorker.getRegistration ? await navigator.serviceWorker.getRegistration() : null;
      if (reg && reg.showNotification) { await reg.showNotification(t.titre, { body: t.corps, tag: 'agent-' + t.titre, renotify: true, vibrate: [120, 60, 120] }); r.via = 'service worker'; } else { new Notification(t.titre, { body: t.corps, tag: t.titre }); r.via = 'page'; }
      r.notification = true; } } catch (e) { /* pas de notification */ }
    try { if (navigator.vibrate) r.vibration = !!navigator.vibrate([120, 60, 120]); } catch (e) { /* pas de vibration */ }
    return r;
  }
  /* Appelée à chaque lecture de la vue (par la fenêtre de l'agent ou par la veille de fond). Renvoie les positions signalées. */
  function surVue(vue) {
    if (!vue) return []; const connu = lire(), r = evenements(vue, connu, { premiere: connu === null }); ecrire(r.suivant);
    const sim = simCourante(); for (const a of r.alertes) { if (!actives()) break; const t = texte(a.p, a.type, sim); bandeau(t); notifier(t); try { racine.dispatchEvent(new CustomEvent('agent:nouvelle-position', { detail: { position: a.p, type: a.type, ...t } })); } catch (e) { /* rien */ } }
    return r.alertes.map(a => a.p);
  }
  /* Bouton « Test de notification » (réglages mobile) : montre une alerte d'exemple COMPLÈTE (action, entrée, taille, TP, SL, levier), demande l'autorisation, déclenche la vibration et dit ce qui a marché. */
  async function tester() {
    let permission = typeof Notification !== 'undefined' ? Notification.permission : 'indisponible'; if (permission === 'default') { try { permission = await Notification.requestPermission(); } catch (e) { permission = 'refusée'; } }
    const ex = { actif: 'BTC', tf: 'M15', sens: 1, statut: 'en_attente', entree: 77846, stop: 77386, cible1: 78804 }, t = texte(ex, 'test', simCourante()); bandeau(t); const r = await notifier(t);
    return { permission, bandeau: true, vibration: r.vibration, notification: r.notification, via: r.via, vibrationDisponible: !!(navigator && navigator.vibrate), active: actives() };
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
  racine.AgentAlertes = { ...API, surVue, autoriser, demarrer, tester, reglerSim, actives };
}(typeof window !== 'undefined' ? window : globalThis));
