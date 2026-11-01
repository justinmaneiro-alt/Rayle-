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
  /* Parmi les positions vivantes, celles dont l'identifiant n'a pas encore été signalé. */
  function nouvelles(vue, dejaVus) { const s = dejaVus instanceof Set ? dejaVus : new Set(dejaVus || []); return positionsVivantes(vue).filter(p => !s.has(p.id)); }
  function texte(p) {
    const sens = Number(p.sens) < 0 || /vente|short/i.test(String(p.sens)) ? 'VENTE' : 'ACHAT', cible = fin(p.cible1) ? p.cible1 : p.cible, etat = p.statut === 'ouverte' ? 'ouverte' : 'en attente (ordre limite)';
    const r = fin(p.entree) && fin(p.stop) && fin(cible) && p.entree !== p.stop ? ' · 1:' + (Math.abs(cible - p.entree) / Math.abs(p.entree - p.stop)).toFixed(1).replace('.', ',') : '';
    return { titre: 'Nouvelle position : ' + sens + ' ' + (p.actif || '') + (p.tf ? ' ' + p.tf : ''), corps: etat + ' · entrée ' + nombre(p.entree) + ' · stop ' + nombre(p.stop) + ' · objectif ' + nombre(cible) + r + ' · SIMULATION, aucun ordre réel' };
  }
  const API = { positionsVivantes, nouvelles, texte, CLE, MAX_VUS };
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; return; }

  /* ── partie navigateur ── */
  const lire = () => { try { const j = JSON.parse(localStorage.getItem(CLE) || 'null'); return Array.isArray(j) ? j : null; } catch (e) { return null; } };
  const ecrire = l => { try { localStorage.setItem(CLE, JSON.stringify(l.slice(-MAX_VUS))); } catch (e) { /* stockage plein ou interdit */ } };
  function bandeau(t) {
    if (typeof document === 'undefined') return; let h = document.getElementById('agent-alertes'); if (!h) { h = document.createElement('div'); h.id = 'agent-alertes'; h.setAttribute('role', 'status'); h.setAttribute('aria-live', 'assertive'); h.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:99999;display:flex;flex-direction:column;gap:6px;width:min(560px,94vw);pointer-events:none'; document.body.appendChild(h); }
    const c = document.createElement('div'); c.className = 'agent-alerte'; c.style.cssText = 'pointer-events:auto;background:rgba(6,8,12,.96);border:1px solid #27d98a;border-left:4px solid #27d98a;color:#e8f2f5;padding:10px 12px;font:600 14px system-ui,sans-serif;cursor:pointer';
    c.innerHTML = '<div>' + esc(t.titre) + '</div><div style="font-weight:400;font-size:13px;color:#b8c7cf;margin-top:2px">' + esc(t.corps) + '</div>'; c.addEventListener('click', () => c.remove()); h.appendChild(c); setTimeout(() => c.remove(), 30000);
  }
  function notifier(t) { try { if (typeof Notification !== 'undefined' && Notification.permission === 'granted') new Notification(t.titre, { body: t.corps, tag: t.titre }); } catch (e) { /* pas de notification */ } try { if (navigator.vibrate) navigator.vibrate([120, 60, 120]); } catch (e) { /* pas de vibration */ } }
  /* Appelée à chaque lecture de la vue. Renvoie les positions signalées (utile aux tests). */
  function surVue(vue) {
    if (!vue) return []; const connues = lire(), vivantes = positionsVivantes(vue);
    if (connues === null) { ecrire(vivantes.map(p => p.id)); return []; }   // première lecture : on mémorise sans sonner
    const nv = nouvelles(vue, connues); if (!nv.length) return [];
    ecrire(connues.concat(nv.map(p => p.id))); for (const p of nv) { const t = texte(p); bandeau(t); notifier(t); try { racine.dispatchEvent(new CustomEvent('agent:nouvelle-position', { detail: { position: p, ...t } })); } catch (e) { /* rien */ } }
    return nv;
  }
  function autoriser() { try { if (typeof Notification !== 'undefined' && Notification.permission === 'default') return Notification.requestPermission(); } catch (e) { /* refusé */ } return Promise.resolve(typeof Notification !== 'undefined' ? Notification.permission : 'denied'); }
  racine.AgentAlertes = { ...API, surVue, autoriser };
}(typeof window !== 'undefined' ? window : globalThis));
