/* ═════════════ ACTIONS DU CERVEAU (v8, phase 3) : Rayle ouvre et règle les fenêtres elle-même ═════════════
   Outils « d'action » déclarés au modèle avec les outils de lecture : ouvrir_fenetre, fermer_fenetre. Ils ne font que NAVIGUER (ouvrir une fenêtre, choisir un actif, une unité, un onglet) :
   ils ne modifient jamais les dessins, les niveaux tracés ni les données de Justin. Tout est annulable à la voix (« ferme », « retour à l'accueil » : commandes de l'application).
   `surligner(liste)` met en évidence, dans la fenêtre ouverte, les éléments dont Rayle parle (ligne de la MA200 qui pulse, niveau, ligne COT, carte Mes actifs). */
const ATT = ms => new Promise(r => setTimeout(r, ms));
async function attendre(cond, ms = 15000, pas = 120) { const t0 = Date.now(); for (;;) { let v = null; try { v = cond(); } catch (e) { v = null; } if (v) return v; if (Date.now() - t0 > ms) return null; await ATT(pas); } }
const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'`]/g, ' ').replace(/\s+/g, ' ').trim();
const ACTIF_TERMINAL = { or: 'OR', us100: 'NASDAQ', us500: 'SP500', btc: 'BTC', sol: 'SOL', eurusd: 'EURUSD', dxy: 'DXY' };
const NOM_TERMINAL = { OR: 'or', NASDAQ: 'nasdaq 100', SP500: 's&p 500', BTC: 'bitcoin', SOL: 'solana', EURUSD: 'eur/usd', DXY: 'dollar' };
const ACTIF_COUV = { or: 'XAUUSD', us100: 'US100', us500: 'US500', btc: 'BTC', sol: 'SOL', dxy: 'DXY', petrole: 'WTI' };
export const FENETRES = ['terminal', 'marches', 'couverture', 'portefeuille', 'invest', 'accueil'];
export const DECLARATIONS = [
  { name: 'ouvrir_fenetre', description: 'Ouvre une fenêtre de l’application et la règle. À appeler en plus des outils de lecture quand la demande concerne une fenêtre. terminal : actif (or, us100, us500, btc, sol, eurusd, dxy), unite (H1, H4, J), mode (classique ou volume), onglet (htf = bougies Weekly/HTF et repères ICT, carnet, jour). marches : section (aujourdhui = annonces et calendrier, actifs, cot, macro, actualite, alertes) et actif pour le COT. invest : section mesactifs avec actif (or, btc, sol, us100, us500, petrole). couverture : actif et sens (achat ou vente). portefeuille : section (globale, positions, coach, risque, setups).',
    parameters: { type: 'object', properties: { fenetre: { type: 'string', enum: FENETRES }, actif: { type: 'string' }, unite: { type: 'string', enum: ['H1', 'H4', 'J'] }, mode: { type: 'string', enum: ['classique', 'volume'] }, onglet: { type: 'string', enum: ['htf', 'carnet', 'jour'] }, section: { type: 'string' }, sens: { type: 'string', enum: ['achat', 'vente'] } }, required: ['fenetre'] } },
  { name: 'afficher_images', description: 'Cherche des images libres (Wikipédia, Wikimedia Commons) sur une personne, un lieu, un monument, un animal, un objet, une œuvre ou une planète, et les affiche pendant que tu parles. À appeler pour les questions de culture générale portant sur un sujet précis (« Qui était Napoléon ? », « la tour Eiffel », « la Joconde », « le lion », « Mars »). Donne le sujet le plus précis possible (ex. « planète Mars », « Joconde »). Ne l’appelle pas pour le trading.', parameters: { type: 'object', properties: { sujet: { type: 'string', description: 'le sujet à illustrer, en français' } }, required: ['sujet'] } },
  { name: 'fermer_fenetre', description: 'Ferme la fenêtre ouverte et revient à l’accueil (« ferme ça », « retour à l’accueil »).' }
];
export const EST_ACTION = n => n === 'ouvrir_fenetre' || n === 'fermer_fenetre' || n === 'afficher_images';
const app = () => (typeof window !== 'undefined' ? window.Application : null);

/* ───── terminal : cadre or.html (un actif par page) ───── */
const cadreTerminal = () => [...document.querySelectorAll('iframe.tr-or, iframe')].find(f => { try { return f.contentWindow && f.contentWindow.location && /or\.html/.test(f.contentWindow.location.href); } catch (e) { return false; } }) || null;
const pretTerminal = f => { try { return !!(f.contentWindow.__orPro && f.contentWindow.__tpVolume && f.contentDocument.querySelector('[data-or-prix]')); } catch (e) { return false; } };
async function terminal({ actif, unite, mode, onglet }) {
  const A = app(); if (!A) return { ok: false, raison: 'application indisponible' };
  const id = actif ? ACTIF_TERMINAL[String(actif).toLowerCase()] || ACTIF_TERMINAL[norm(actif)] : null; if (actif && !id) return { ok: false, raison: 'actif absent du terminal : ' + actif };
  await A.ouvrir('terminal');
  let f = await attendre(cadreTerminal, 20000); if (!f) return { ok: false, raison: 'le terminal ne s’est pas ouvert' };
  await attendre(() => pretTerminal(f), 25000);
  if (id) {
    const titre = () => norm((f.contentDocument.querySelector('.tor-titre b') || {}).textContent || '');
    const t0 = await attendre(() => titre(), 60000);   // jamais de rechargement tant que le cadre n'a pas affiché son actif (un cadre en cours de chargement serait recommencé pour rien)
    if (t0 && t0 !== NOM_TERMINAL[id]) { try { localStorage.setItem('rayle_terminal_actif', id); } catch (e) { /* */ } try { f.contentWindow.location.replace(new URL('or.html?vue=1&actif=' + id, f.contentWindow.location.href).href); } catch (e) { return { ok: false, raison: 'changement d’actif impossible' }; } await ATT(600); await attendre(() => { try { return pretTerminal(f) && titre() === NOM_TERMINAL[id]; } catch (e) { return false; } }, 30000); }
  }
  const D = f.contentDocument, clic = s => { const b = D.querySelector(s); if (b) { b.click(); return true; } return false; };
  await attendre(() => D.querySelector('[data-periode][aria-pressed="true"]'), 40000);   // le graphique a dessiné sa barre de périodes (données chargées)
  const res = { ok: true, fenetre: 'terminal', actif: id || null };
  if (unite && clic('[data-periode="' + unite + '"]')) { res.unite = unite; await attendre(() => D.querySelector('[data-periode="' + unite + '"][aria-pressed="true"]'), 15000); }
  if (mode) { if (clic('.tp-mode [data-mode="' + mode + '"]')) res.mode = mode; await attendre(() => { try { const e = f.contentWindow.__tpVolume.etat(); return mode === 'classique' || (e && e.charge); } catch (x) { return false; } }, 25000); }
  if (onglet && mode !== 'classique') { if (!(D.querySelector('.tp-mode [data-mode="volume"]') && D.querySelector('.tp-mode [data-mode="volume"]').getAttribute('aria-pressed') === 'true')) { clic('.tp-mode [data-mode="volume"]'); await attendre(() => { try { return f.contentWindow.__tpVolume.etat().charge; } catch (x) { return false; } }, 25000); res.mode = 'volume'; } await ATT(300); if (clic('.tpv [data-onglet="' + (onglet === 'htf' ? 'ict' : onglet) + '"]')) res.onglet = onglet; }
  return res;
}
/* ───── fenêtres « pro » : même principe, par les boutons d'onglets ───── */
const racinePro = id => document.querySelector(({ marches: '#marches-fenetre', couverture: '.tp-couverture, #couverture-fenetre', portefeuille: '.tp-portefeuille, #portefeuille-fenetre', invest: '.tp-invest, #invest-fenetre' })[id] || 'x') || document.querySelector('.tp[aria-label]');
async function ouvrirPro(id, onglet) {
  const A = app(); if (!A) return { ok: false, raison: 'application indisponible' };
  await A.ouvrir(id); const nav = await attendre(() => { const b = document.querySelector('.tp-nav [data-onglet]'); return b ? b.closest('.tp') || document : null; }, 15000); if (!nav) return { ok: false, raison: 'la fenêtre ne s’est pas ouverte' };
  if (onglet) { const b = await attendre(() => document.querySelector('.tp-nav [data-onglet="' + onglet + '"]'), 4000); if (b) { b.click(); await ATT(500); return { ok: true, fenetre: id, onglet }; } return { ok: true, fenetre: id, onglet: null, note: 'onglet « ' + onglet + ' » introuvable' }; }
  return { ok: true, fenetre: id };
}
async function marches({ section, actif }) {
  const sec = ({ calendrier: 'aujourdhui', annonces: 'aujourdhui', aujourdhui: 'aujourdhui', actifs: 'actifs', cot: 'cot', macro: 'macro', actualite: 'actualite', actualites: 'actualite', alertes: 'alertes' })[norm(section || 'aujourdhui')] || 'aujourdhui';
  const r = await ouvrirPro('marches', sec); if (!r.ok) return r;
  if (sec === 'cot' && actif) { const id = String(actif).toLowerCase(), b = await attendre(() => document.querySelector('#marches-fenetre [data-actif="' + id + '"]'), 8000); if (b) { b.click(); r.actif = id; } }
  return r;
}
async function invest({ section, actif }) {
  const r = await ouvrirPro('invest', ({ mesactifs: 'mesactifs', 'mes actifs': 'mesactifs' })[norm(section || 'mesactifs')] || 'mesactifs'); if (!r.ok) return r;
  if (actif) { const c = await attendre(() => document.querySelector('[data-ma-actif="' + String(actif).toLowerCase() + '"]'), 10000); if (c) { r.actif = String(actif).toLowerCase(); try { c.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { /* */ } } }
  return r;
}
async function couverture({ actif, sens }) {
  const r = await ouvrirPro('couverture', 'couvrir'); if (!r.ok) return r;
  const sel = await attendre(() => document.querySelector('form[data-form] select[name="actif"]'), 10000); if (!sel) return { ...r, note: 'formulaire de couverture introuvable' };
  const id = ACTIF_COUV[String(actif || '').toLowerCase()], opt = id && [...sel.options].find(o => o.value === id || norm(o.value) === norm(id)); if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event('change', { bubbles: true })); r.actif = actif; }
  const s2 = document.querySelector('form[data-form] select[name="sens"]'); if (s2 && sens) { s2.value = /vente|short|vend/i.test(sens) ? '-1' : '1'; s2.dispatchEvent(new Event('change', { bubbles: true })); r.sens = sens; }
  return r;
}
const SECTION_PF = { globale: 'globale', global: 'globale', positions: 'pos', coach: 'coach', risque: 'risque', 'risque global': 'risque', setups: 'setups', transactions: 'trans' };

/* Ouvrir une fenêtre peut prendre quelques secondes (le terminal charge son graphique) : on n'y fait jamais attendre la réponse de Rayle. L'action continue en arrière-plan (unité, mode, onglet, surbrillance) et l'outil répond « en cours » après ATTENTE_MAX ms. */
export const ATTENTE_MAX = 7000;
export async function executerAction(nom, args = {}) {
  if (nom !== 'ouvrir_fenetre') return faireAction(nom, args);
  const p = faireAction(nom, args); p.catch(() => {});
  return Promise.race([p, ATT(ATTENTE_MAX).then(() => ({ ok: true, fenetre: args.fenetre, enCours: true, note: 'la fenêtre finit de s’ouvrir et se règle en arrière-plan' }))]);
}
async function faireAction(nom, args = {}) {
  try {
    if (nom === 'afficher_images') {
      const W = typeof window !== 'undefined' ? window.ImagesWiki : null; if (!W) return { ok: false, raison: 'module d’images absent' };
      let r = null; try { r = await W.chercher(String(args.sujet || '').slice(0, 90)); } catch (e) { return { ok: false, raison: 'Wikipédia injoignable (' + String((e && e.message) || e).slice(0, 80) + ')' }; }
      if (!r) return { ok: false, raison: 'aucune image libre trouvée pour « ' + args.sujet + ' »' };
      window.__galeriePending = r;   // ouverte par la page juste avant que Rayle parle (phrase.js)
      return { ok: true, titre: r.titre, description: r.description, images: 1 + (r.secondaires || []).length, dates: (r.dates || []).map(d => d.label + ' ' + d.val), resume: (r.resume || '').slice(0, 400) };
    }
    if (nom === 'fermer_fenetre') { const A = app(); if (!A) return { ok: false, raison: 'application indisponible' }; const s = A.etat(); if (s.ouvert) await A.fermer(); else A.aller(0); return { ok: true, ferme: true }; }
    const f = String(args.fenetre || '').toLowerCase();
    if (f === 'terminal') return await terminal(args);
    if (f === 'marches') return await marches(args);
    if (f === 'invest') return await invest(args);
    if (f === 'couverture') return await couverture(args);
    if (f === 'portefeuille') return await ouvrirPro('portefeuille', SECTION_PF[norm(args.section || 'globale')] || 'globale');
    if (f === 'accueil') { const A = app(); if (A) { if (A.etat().ouvert) await A.fermer(); A.aller(0); } return { ok: true, fenetre: 'accueil' }; }
    return { ok: false, raison: 'fenêtre inconnue : ' + args.fenetre };
  } catch (e) { return { ok: false, raison: String((e && e.message) || e).slice(0, 120) }; }
}

/* ───── surbrillance : jamais de modification de données, seulement des repères visuels temporaires ───── */
let css = false;
function styleSurbrillance(doc) { if (doc.getElementById('ra-surbrillance-css')) return; const s = doc.createElement('style'); s.id = 'ra-surbrillance-css'; s.textContent = '@keyframes raPulse{0%,100%{opacity:.35}50%{opacity:1}}@keyframes raCadre{0%,100%{box-shadow:0 0 0 0 rgba(255,174,61,.0)}50%{box-shadow:0 0 0 4px rgba(255,174,61,.55)}}.ra-ligne{position:absolute;left:0;right:58px;height:0;border-top:2px solid #ffae3d;pointer-events:none;z-index:7;animation:raPulse 1s ease-in-out infinite}.ra-ligne span{position:absolute;right:0;top:-19px;font:600 11px/1 system-ui,sans-serif;letter-spacing:.04em;color:#10161b;background:#ffae3d;padding:3px 6px;clip-path:polygon(6px 0,100% 0,100% 100%,0 100%,0 6px)}.ra-surligne{animation:raCadre 1.1s ease-in-out 5;outline:2px solid rgba(255,174,61,.7);outline-offset:2px}'; doc.head.appendChild(s); }
export async function surligner(liste, { duree = 9000 } = {}) {
  const fait = [];
  for (const s of liste || []) {
    try {
      if (s.type === 'prix') {
        const f = cadreTerminal(), g = f && f.contentWindow.__orPro && f.contentWindow.__orPro.graphe && f.contentWindow.__orPro.graphe(); if (!g) continue;
        const D = f.contentDocument; styleSurbrillance(D); const y = await attendre(() => { const v = g.serie().priceToCoordinate(s.prix); return v != null && Number.isFinite(v) ? v : null; }, 45000, 500); if (y == null) continue;   // le graphique doit avoir ses données et son échelle
        const hote = g.conteneur(); if (getComputedStyle(hote).position === 'static') hote.style.position = 'relative';
        const l = D.createElement('div'); l.className = 'ra-ligne'; l.style.top = Math.round(y) + 'px'; l.innerHTML = '<span></span>'; l.firstChild.textContent = s.texte + ' · ' + Math.round(s.prix * 100) / 100; hote.appendChild(l); setTimeout(() => l.remove(), duree); fait.push(s.texte);
      } else if (s.type === 'cot') { const b = await attendre(() => document.querySelector('#marches-fenetre [data-actif][aria-pressed="true"]'), 30000); if (b) { styleSurbrillance(document); b.classList.add('ra-surligne'); setTimeout(() => b.classList.remove('ra-surligne'), duree); fait.push('cot'); } }
      else if (s.type === 'carte') { const c = await attendre(() => document.querySelector('[data-ma-actif="' + s.actif + '"]'), 30000); if (c) { styleSurbrillance(document); c.classList.add('ra-surligne'); setTimeout(() => c.classList.remove('ra-surligne'), duree); fait.push('carte ' + s.actif); } }
    } catch (e) { /* un repère visuel qui échoue ne gêne jamais la réponse */ }
  }
  return fait;
}
