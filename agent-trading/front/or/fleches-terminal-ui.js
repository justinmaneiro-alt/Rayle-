/* ═════════════ FLÈCHES DU TERMINAL : interface (interrupteur, infobulle, registre, alertes) ═════════════
   Calcul : fleches-terminal-v1.js (scellé). Ici : bougies H1 closes du moteur → flèches → graphique ; registre local en ajout seul (une flèche posée n'est
   jamais déplacée ni retirée) ; interrupteur « historique 30 jours » ; infobulle au survol (date, type, résultat mesuré à 6, 12 et 24 bougies).
   Les flèches restent visibles en mode Pro épuré. Information de lecture, jamais un ordre. */
import { creerNotifieur } from './fleches-notif.js'; import { notifierNavigateur, permissionNavigateur, demanderPermission } from './canal-navigateur.js';
import * as V1 from './fleches-simples.js'; import { zonesDirect } from './zones-direct.js';
import { exclureDe, CLE_MASQUES } from './suppression-calcul.js';
import * as F8 from './fleches-simples-v8.js'; import * as F7 from './fleches-simples-v7.js'; import * as F6 from './fleches-simples-v6.js';   // v8 (2026-11-13, gros mouvements) = « Direct » par défaut ; v7 = « Direct (v7 validée) » figée ; v6 = « Direct (stable) ».   // v7 (2026-11-13, affinage) = « Direct » par défaut ; v6 = « Direct (stable) », intacte. Ancienne ligne : import * as F from './fleches-simples-v6.js';
//   // v6 (2026-11-13) : v5 + exception « 2ᵉ touche » + raison des points gris. Ancienne ligne : import * as F from './fleches-simples-v5.js';   // v5 (2026-11-13) : v4 + contre-tendance (point gris) + invalidation. Ancienne ligne : import * as F from './fleches-simples-v4.js'; import { zonesDirect } from './zones-direct.js';   // v4 (2026-11-12) : seulement les niveaux en trait plein (structure niveaux-majeurs-v1 + zones de swing actives, ≥ 3 touches vues). Ancienne ligne : import * as F from './fleches-simples-v3.js'; import { zonesDirect } from './zones-direct.js';   // v3 : zones majeures causales (3 touches déjà vues). Ancienne ligne : import * as F from './fleches-simples-v2.js'; import { zonesDirect } from './zones-direct.js';   // v2 (2026-11-12) : flèches simples rejouées EN DIRECT (causales). Ancienne ligne : import * as F from './fleches-simples.js';   // v2 (2026-11-12) : flèches lues sur les zones H1 DESSINÉES ; v1 et terminal-v1 (scellées) restent disponibles. Ancienne ligne :    // 2026-11-12 : flèches de lecture (MA200 et gros niveaux seulement, sans grappes) ; l'ancienne règle fleches-terminal-v1 (scellée) reste disponible en mode debug

const CLE_CTC = 'rayle_or_contacts_t11', CLE_REG = 'rayle_or_fleches_t11', CLE_VU = 'rayle_or_fleches_t11_vu', CLE_HIST = 'rayle_or_fleches_t1_hist', CLE_MODE = 'rayle_or_fleches_mode', CLE_NOTIF = 'rayle_or_notif', CLE_NOTIF_ETAT = 'rayle_or_notif_etat';   // mode : 'direct' (v4, causale, par défaut) ou 'historique' (v1 scellée : rétrospective, jamais pour entrer)
export const BANDEAU = 'Flèches rétrospectives : placées avec des informations postérieures, ne pas utiliser pour entrer.';
const lireJ = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const ecrireJ = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* plein ou refusé */ } };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dateLongue = t => new Date(t).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

const MOT = { direct: { F: F8, reg: 'rayle_or_fleches_t13', vu: 'rayle_or_fleches_t13_vu', ctc: 'rayle_or_contacts_t13' }, v7: { F: F7, reg: 'rayle_or_fleches_t12', vu: 'rayle_or_fleches_t12_vu', ctc: 'rayle_or_contacts_t12' }, stable: { F: F6, reg: CLE_REG, vu: CLE_VU, ctc: CLE_CTC } };   // un registre par moteur : jamais de mélange entre « Direct » et « Direct (stable) »
const normMode = m => m === 'historique' || m === 'stable' || m === 'v7' ? m : 'direct';
const cleMoteur = m => m === 'stable' || m === 'v7' ? m : 'direct', cleDe = o => Object.keys(MOT).find(k => MOT[k] === o);
export function monterFlechesTerminal(T, { maintenant = () => Date.now(), pret = Promise.resolve() } = {}) {
  const mode0 = normMode(lireJ(CLE_MODE, 'direct')); let F = MOT[cleMoteur(mode0)].F; const mot = () => MOT[cleMoteur(E.mode)];
  const R = T.R, E = { registre: lireJ(MOT[cleMoteur(mode0)].reg, null), hist: lireJ(CLE_HIST, true), notif: { vocal: true, navigateur: false, contact: true, ...lireJ(CLE_NOTIF, {}) }, mode: mode0, retro: [], cle: '', liste: [], contacts: lireJ(MOT[cleMoteur(mode0)].ctc, []), banque: {}, dernier: null, nouvelles: 0 };
  let premier = E.registre === null; if (premier) E.registre = [];
  /* notifications du mode Direct : un seul module (fleches-notif.js) ; canaux vocal et navigateur/PWA activables ; Telegram = script serveur (alertes-serveur.mjs) */
  const notifieur = creerNotifieur({ etat: lireJ(CLE_NOTIF_ETAT, {}), maintenant, actif: 'OR', unite: 'H1', canaux: [
    async m => { if (E.notif.vocal) T.notifier(m.titre.replace(/^OR H1 · /, ''), { niveau: 'fort', dit: true }); },
    async m => { if (E.notif.navigateur) await notifierNavigateur(m); } ] });
  const barre = R.querySelector('[data-graph-barre]');
  if (barre && !barre.querySelector('[data-ft]')) {
    const l = document.createElement('label'); l.className = 'tor-gb tor-ft'; l.dataset.ft = ''; l.title = 'Repères de lecture posés à la clôture de la bougie H1 : MA200 (cassure confirmée, retest, rebond) et gros supports / résistances (2 bougies sur le niveau, rebond confirmé). Jamais redessinés, jamais un ordre ni une promesse de gain.';
    l.innerHTML = '<input type="checkbox" data-ft-hist> Flèches : historique 30 j <b data-ft-n></b>'; barre.appendChild(l);
  }
  const CLE_AV = 'rayle_tm_avance';
  const appliquerAvance = () => { try { document.body.classList.toggle('tm-avance', localStorage.getItem(CLE_AV) === '1'); } catch (e) { /* */ } }; appliquerAvance();
  function placerNotif() {
    const h = hoteReglages(); if (!h || R.querySelector('[data-ft-notif]')) return;
    const d = document.createElement('details'); d.className = 'tp-menu'; d.dataset.ftNotif = '';
    d.innerHTML = `<summary>Notifications ▾</summary><div class="tp-menu-corps"><label><input type="checkbox" data-nt="vocal"> Vocal (voix fr-FR)</label><label><input type="checkbox" data-nt="navigateur"> Notification navigateur / appli <small data-nt-etat></small></label><label><input type="checkbox" data-nt="contact"> Alerte de contact avec une grosse zone (sans marqueur)</label><label><input type="checkbox" data-nt="avance"> Afficher les panneaux avancés (téléphone)</label><small>Telegram : script serveur <code>alertes-serveur.mjs</code> (voir PROGRESS.md). Mode Direct seulement, jamais l’Historique. Maximum 6 par heure, repos de 5 min par niveau.</small></div>`;
    const doux = h.querySelector('.tp-doux'); if (doux && h.contains(doux)) h.insertBefore(d, doux); else h.appendChild(d);
    const maj = () => { for (const c of d.querySelectorAll('[data-nt]')) c.checked = c.dataset.nt === 'avance' ? (() => { try { return localStorage.getItem(CLE_AV) === '1'; } catch (e) { return false; } })() : !!E.notif[c.dataset.nt]; const st = d.querySelector('[data-nt-etat]'); if (st) st.textContent = '(permission : ' + permissionNavigateur() + ')'; };
    d.addEventListener('change', async e => { const c = e.target.closest('[data-nt]'); if (!c) return; if (c.dataset.nt === 'avance') { try { localStorage.setItem(CLE_AV, c.checked ? '1' : '0'); } catch (er) { /* */ } appliquerAvance(); return; } E.notif[c.dataset.nt] = c.checked; if (c.dataset.nt === 'navigateur' && c.checked) { const r = await demanderPermission(); if (r !== 'granted') { E.notif.navigateur = false; } } ecrireJ(CLE_NOTIF, E.notif); maj(); });
    maj();
  }
  /* ligne des réglages de flèches : ligne du haut du Terminal (mode Pro) ; sinon, sur téléphone, une ligne sous l'en-tête (la barre du graphique y est masquée) ; sinon la barre du graphique */
  function hoteReglages() {
    const h = R.querySelector('.tp-haut'); if (h) return h;
    if (window.matchMedia && matchMedia('(max-width:600px)').matches) { let l = R.querySelector('.tor-ft-ligne'); if (!l) { const t = R.querySelector('.tor-tete'); if (t) { l = document.createElement('div'); l.className = 'tor-ft-ligne'; t.insertAdjacentElement('afterend', l); } } if (l) return l; }
    return barre;
  }
  function placerMode() { const h = hoteReglages(); if (!h) return; for (const n of [R.querySelector('.tor-ft-m'), R.querySelector('[data-ft-notif]')]) { if (n && n.parentNode !== h) { const d = h.querySelector('.tp-doux'); if (d && d.parentNode === h) h.insertBefore(n, d); else h.appendChild(n); } } }   // dans la ligne du haut du Terminal (visible en mode Pro épuré)
  if ((barre || R.querySelector('.tp-haut') || R.querySelector('.tor-tete')) && !R.querySelector('[data-ft-mode]')) {
    const l = document.createElement('label'); l.className = 'tor-gb tor-ft-m'; l.title = 'Direct : flèches « gros mouvements » (v8 : grosses zones seulement, confirmation par le corps ou 2 clôtures, espace pour courir, boîtes de position). Direct (v7 validée) : la version affinée du 13 novembre, figée. Direct (stable) : v6, inchangée. Direct (v4), posées à la bougie de confirmation, comme en temps réel (alertes vocales). Historique : flèches rétrospectives (v1), placées avec des informations postérieures : à regarder, jamais pour entrer.';
    l.innerHTML = 'Flèches <select data-ft-mode><option value="direct">Direct</option><option value="v7">Direct (v7 validée)</option><option value="stable">Direct (stable)</option><option value="historique">Historique</option></select>'; (barre || R.querySelector('.tp-haut') || R.querySelector('.tor-tete')).appendChild(l); placerMode();
  }
  const choix = R.querySelector('[data-ft-mode]'); if (choix) { choix.value = E.mode; choix.addEventListener('change', () => api.fixerMode(choix.value)); }
  R.addEventListener('change', e => { if (e.target && e.target.matches && e.target.matches('[data-couche="pointsGris"], [data-couche="flechesMa"]')) afficher(); });
  const caseHist = R.querySelector('[data-ft-hist]'); if (caseHist) { caseHist.checked = !!E.hist; caseHist.addEventListener('change', () => { E.hist = caseHist.checked; ecrireJ(CLE_HIST, E.hist); afficher(); }); }
  const bulle = document.createElement('div'); bulle.className = 'tor-ft-bulle'; bulle.hidden = true; bulle.setAttribute('role', 'tooltip');
  const zone = R.querySelector('[data-graph]'); if (zone) { zone.style.position = zone.style.position || 'relative'; zone.appendChild(bulle); }
  const bandeau = document.createElement('div'); bandeau.className = 'tor-ft-bandeau'; bandeau.dataset.ftBandeau = ''; bandeau.setAttribute('role', 'status'); bandeau.textContent = BANDEAU;
  bandeau.style.cssText = 'position:absolute;top:0;left:0;right:0;z-index:6;padding:4px 8px;font:600 12px system-ui,sans-serif;text-align:center;background:rgba(201,178,122,.92);color:#10161b;pointer-events:none';
  bandeau.hidden = E.mode !== 'historique'; if (zone) zone.appendChild(bandeau);

  /* arrows visibles : tout l'historique des 30 jours, ou seulement les dernières 24 heures quand l'interrupteur est coupé */
  const visibles = () => { const n = maintenant(), de = n - (E.hist ? 30 : 1) * 86400e3; if (E.mode === 'historique') return E.retro.filter(f => !f.masquee && f.tCloture >= de); return E.liste.filter(f => !f.masquee && f.tCloture >= de && !(F.boite && f.type === 'ma_cassure' && !flechesMaVisibles()) && (f.levelId === 'MA200' || f.niveauType === 'structure' || !E.ids || E.ids.some(z => z.bas <= f.zoneHaut + 2 && z.haut >= f.zoneBas - 2))); };   // jamais de flèche sans niveau dessiné
  /* contacts expliqués (points gris) : un seul marqueur par bougie, la flèche prime ; même fenêtre de temps que les flèches */
  const contactsVisibles = V => { const n = maintenant(), de = n - (E.hist ? 30 : 1) * 86400e3, pris = new Set(V.map(f => f.tCloture)); return (E.contacts || []).filter(k => k.tCloture >= de && !pris.has(k.tCloture)); };
  /* points gris (contacts expliqués et rebonds contre-tendance) : masqués par défaut dans « Direct » (case Couches « Points gris », mémorisée) ; toujours visibles dans « Direct (stable) » */
  const grisVisibles = () => E.mode === 'stable' || !!(T.graph.couches && T.graph.couches().pointsGris === true);
  const flechesMaVisibles = () => !!(T.graph.couches && T.graph.couches().flechesMa === true);
  /* v8 : boîtes de position, grosses zones lisibles (3 + 3) et régime de la MA200, d'après le registre et les zones du dernier calcul */
  function lectureV8(V) {
    if (E.mode !== 'direct' || !F.boite) return null;
    const H1 = (T.h1 ? T.h1() : []).filter(b => b.t + 3600e3 <= maintenant()), prix = H1.length ? H1[H1.length - 1].c : null; if (!H1.length) return null;
    const bo = V.filter(f => f.type !== 'ma_cassure' && !f.contre && !f.invalidee || f.type === 'ma_cassure' && flechesMaVisibles()).map(f => F.boite(H1, f)).filter(Boolean);
    const zs = prix != null && E.zonesFin ? F.zonesLisibles(E.zonesFin, prix) : [];
    return { boites: bo, zones: zs, regime: F.segmentsRegimeMa(E.registre, H1[0].t, H1[H1.length - 1].t + 3600e3) };
  }
  function afficher() {
    bandeau.hidden = E.mode !== 'historique'; const V0 = visibles(), V = grisVisibles() || E.mode === 'historique' ? V0 : V0.filter(f => !f.contre); try { T.graph.flechesTerminal(V, E.mode === 'historique' ? [] : grisVisibles() ? contactsVisibles(V) : []); } catch (e) { /* graphique pas prêt */ }
    try { if (T.graph.lectureV8) T.graph.lectureV8(lectureV8(V0)); } catch (e) { /* graphique pas prêt */ }
    const b = R.querySelector('[data-ft-n]'); if (b) b.textContent = `(${V.length})`;
    ancrerBulle(V);
  }
  function calculer() {
    const H1 = T.h1 ? T.h1() : [], objets = (T.modules && T.modules.outils && T.modules.outils.E && T.modules.outils.E.objets) || [];
    const zones = T.graph.zonesH1 ? T.graph.zonesH1() : [];
    E.ids = zones.map(z => ({ bas: z.bas, haut: z.haut }));
    if (!zones.length) { E.raison = 'zones H1 pas encore dessinées'; return false; }
    const masques = (T.suppression && T.suppression.masques ? T.suppression.masques() : lireJ(CLE_MASQUES, [])).filter(m => m.kind === 'zone');   // niveaux masqués : plus de nouvelles flèches
    const sig = (H1.length ? H1[H1.length - 1].t : 0) + '|' + H1.length + '|' + zones.map(z => z.id + z.tDebut + (z.tFin || '')).join(',') + '|m' + masques.map(m => m.cle).join(',');
    if (sig === E.cle) return false; E.cle = sig;
    const vu = lireJ(mot().vu, null), closes = H1.filter(b => b.t + 3600e3 <= maintenant()), dernierT = closes.length ? closes[closes.length - 1].t : 0;
    const depart = vu && vu.t < dernierT ? closes.findIndex(b => b.t > vu.t) : null;   // reprise : seulement les nouvelles bougies (le registre garde le reste)
    const deja = E.registre.filter(f => f.version === F.VERSION).map(f => ({ ...f, i: closes.findIndex(b => b.t === f.t) })).filter(f => f.i >= 0);
    const r = vu && vu.t >= dernierT && !F.boite ? { fleches: [], n: closes.length, raison: null } : F.calculer(H1, zonesDirect, { maintenant: maintenant(), depart: F.boite && vu && vu.t >= dernierT ? Math.max(0, closes.length - 1) : depart == null || depart < 0 ? null : depart, deja, exclure: exclureDe(masques) });   // rejeu bougie par bougie
    if (closes.length) ecrireJ(mot().vu, { t: dernierT });
    E.raison = r.raison; E.n = r.n; if (r.zones) E.zonesFin = r.zones; if (r.alertes) E.alertes = (E.alertes || []).filter(a => !r.alertes.some(q => q.id === a.id)).concat(r.alertes).slice(-100);
    const avant = new Set(E.registre.map(f => f.id));
    E.registre = F.fusionnerRegistre(E.registre, r.fleches, r.invalidees || []);
    const envoyes = notifieur.traiter(F.boite && !flechesMaVisibles() ? E.registre.filter(f => f.type !== 'ma_cassure') : E.registre, { silencieux: premier && !E.notifPremiere, alertes: F.boite && E.notif.contact ? E.alertes || [] : [] }); E.notifPremiere = true;   // 1er chargement d'un appareil neuf : on marque sans annoncer tout l'historique
    envoyes.then(L => { E.nouvelles += L.length; ecrireJ(CLE_NOTIF_ETAT, notifieur.etat); }).catch(() => {});
    ecrireJ(mot().reg, E.registre.slice(-600));
    E.contacts = (E.contacts || []).filter(k => !/^en attente/.test(k.raison)).filter(k => !(r.contacts || []).some(q => q.id === k.id)).concat(r.contacts || []).slice(-400); ecrireJ(mot().ctc, E.contacts);
    E.liste = E.registre; retro(H1, zones);
    return true;
  }
  /* mode Historique : règle v1 scellée appliquée aux zones FINALES (informations postérieures) ; calculé à part, ne touche ni au registre ni aux alertes */
  function retro(H1, zones) { try { const r = V1.calculer(H1, zones, { maintenant: maintenant(), jours: 30 }); E.retro = r.fleches || []; } catch (e) { E.retro = []; } }
  /* infobulle : survol d'une flèche (bougie du graphique qui porte la marque) */
  let abonne = false, parTemps = new Map();
  function ancrerBulle(V) {
    parTemps = new Map(); for (const f of V.concat(E.mode === 'historique' || !grisVisibles() ? [] : contactsVisibles(V))) { const t = T.graph.tempsDeBougie ? T.graph.tempsDeBougie(f.tCloture - 1) : null; if (t != null) { if (!parTemps.has(t)) parTemps.set(t, []); parTemps.get(t).push(f); } }
    if (abonne) return; const ch = T.graph.chart && T.graph.chart(); if (!ch) return; abonne = true;
    ch.subscribeCrosshairMove(p => {
      if (!p || !p.point || p.time == null) { bulle.hidden = true; return; }
      const L = parTemps.get(p.time); if (!L || !L.length) { bulle.hidden = true; return; }
      if (E.mode === 'historique') { bulle.innerHTML = '<div class="tor-ft-f"><b>Flèche rétrospective</b><span>' + esc(dateLongue(L[0].tCloture)) + '</span><span>' + esc(BANDEAU) + '</span></div>'; bulle.hidden = false; const w0 = bulle.offsetWidth || 260; bulle.style.left = Math.max(4, Math.min(p.point.x + 12, (zone ? zone.clientWidth : 600) - w0 - 4)) + 'px'; bulle.style.top = Math.max(4, p.point.y - 20) + 'px'; return; }
      bulle.innerHTML = L.map(f => f.type ? `<div class="tor-ft-f"><b>${esc(f.nom)}</b><span>${esc(dateLongue(f.tCloture))} (clôture de la bougie H1)</span>${F.detail(f).concat(F.textesRes(f.resultat)).map(x => `<span>${esc(x)}</span>`).join('')}</div>` : `<div class="tor-ft-f" data-ft-contact><b>Pas de flèche</b>${F.detailContact(f).map(x => `<span>${esc(x)}</span>`).join('')}</div>`).join('') + '<small>Description de ce qui s’est passé, jamais un ordre.</small>';
      bulle.hidden = false; const w = bulle.offsetWidth || 260; bulle.style.left = Math.max(4, Math.min(p.point.x + 12, (zone ? zone.clientWidth : 600) - w - 4)) + 'px'; bulle.style.top = Math.max(4, p.point.y - 20) + 'px';
    });
  }
  const api = {
    maj() { try { placerMode(); placerNotif(); if (calculer()) afficher(); else if (!E.liste.length) afficher(); } catch (e) { console.warn('flèches du Terminal :', e.message); } },
    fixerMode(m) { const avant = mot(); E.mode = normMode(m); ecrireJ(CLE_MODE, E.mode); const apres = mot();
      if (avant !== apres) { E.banque[cleDe(avant)] = { registre: E.registre, contacts: E.contacts, liste: E.liste }; const b = E.banque[cleDe(apres)]; F = apres.F; E.cle = ''; E.registre = b ? b.registre : lireJ(apres.reg, null) || []; premier = !b && lireJ(apres.reg, null) === null; E.contacts = b ? b.contacts : lireJ(apres.ctc, []); E.liste = E.registre; try { api.maj(); } catch (e) { /* */ } } if (choix) choix.value = E.mode; if (E.mode === 'historique' && !E.retro.length) { try { retro(T.h1 ? T.h1() : [], T.graph.zonesH1 ? T.graph.zonesH1() : []); } catch (e) { /* */ } } afficher(); },
    mode: () => E.mode, notifieur: () => notifieur, reglagesNotif: () => ({ ...E.notif }), direct: () => E.liste.slice(), retro: () => E.retro.slice(),
    etat: () => ({ mode: E.mode, bandeau: !bandeau.hidden, n: E.liste.length, visibles: visibles().length, hist: E.hist, raison: E.raison || null, nouvelles: E.nouvelles, barres: E.n || 0 }),
    liste: () => E.liste.slice(), contacts: () => (E.contacts || []).slice(), visibles, bilan: () => F.bilan(T.h1 ? T.h1() : [], E.liste.filter(f => !f.masquee)), fixerHistorique(v) { E.hist = !!v; ecrireJ(CLE_HIST, E.hist); if (caseHist) caseHist.checked = E.hist; afficher(); }
  };
  pret.then(() => api.maj());
  return api;
}
