/* ═════════════ CONNEXION AU RELAIS (même JSON pour tous les écrans) ═════════════
   WebSocket vers le Worker de l'agent → reçoit exactement ce que le moteur publie. Ne calcule rien : fusionne seulement les bougies reçues
   (la bougie live publiée remplace la même bougie de l'historique). Moteur hors ligne : on garde le dernier état, marqué « hors ligne depuis X ». */
export const URL_DEFAUT = 'https://rayle-agent-trading.justinmaneiro.workers.dev';
export const HORS_LIGNE_MS = 15000;

function lireLS(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
export function configuration() {
  let url = lireLS('rayle_agent_trading_url') || URL_DEFAUT, jeton = '';
  try { const w = window.RayleBus && window.RayleBus.demander('worker'); if (w && w.token) jeton = String(w.token).trim(); } catch (e) { /* bus absent */ }
  if (!jeton) jeton = lireLS('rayle_agent_trading_jeton') || lireLS('rayle_worker_appareil') || lireLS('rayle_worker_token');
  return { url, jeton };
}

export function creerConnexion({ url, jeton, WS = window.WebSocket, horloge = () => Date.now() } = {}) {
  const cfg = configuration(); url = url || cfg.url; jeton = jeton || cfg.jeton;
  const store = { etat: null, lent: null, courbe: null, historiques: {}, moteur: { enLigne: null, moteurVu: null }, connexion: 'déconnecté', erreur: null };
  const abonnes = new Set(); let ws = null, attente = 1000, arrete = false, focus = null, minuterie = null;
  const prevenir = quoi => { for (const f of abonnes) try { f(quoi, store); } catch (e) { console.error(e); } };

  function fusionnerBougies(actif, unite, liste) {
    const h = store.historiques[actif] || (store.historiques[actif] = {}), s = h[unite] || (h[unite] = []);
    for (const b of liste) {
      if (!s.length || b[0] > s[s.length - 1][0]) s.push(b);
      else { for (let i = s.length - 1; i >= 0 && i >= s.length - 5; i--) if (s[i][0] === b[0]) { s[i] = b; break; } }
    }
  }
  function recevoir(texte) {
    let m; try { m = JSON.parse(texte); } catch (e) { return; }
    if (m.type === 'auth') { store.connexion = m.ok ? 'connecté' : 'jeton refusé'; if (m.ok) { attente = 1000; if (focus) envoyerFocus(); } prevenir('connexion'); return; }
    if (m.type === 'etat') {
      if (store.etat && m.seq <= store.etat.seq && m.moteur && store.etat.moteur && m.moteur.demarre === store.etat.moteur.demarre) return;   // jamais revenir en arrière
      store.etat = m;
      for (const [a, x] of Object.entries(m.actifs || {})) for (const u of ['M15', 'H1']) if (x.bougies && x.bougies[u] && store.historiques[a] && store.historiques[a][u]) fusionnerBougies(a, u, x.bougies[u]);
      prevenir('etat'); return;
    }
    if (m.type === 'historique') { const h = store.historiques[m.actif] || (store.historiques[m.actif] = {}); h[m.unite] = m.bougies.slice(); const e = store.etat && store.etat.actifs[m.actif]; if (e && e.bougies[m.unite]) fusionnerBougies(m.actif, m.unite, e.bougies[m.unite]); prevenir('historique:' + m.actif); return; }
    if (m.type === 'lent') { store.lent = m; prevenir('lent'); return; }
    if (m.type === 'courbe') { store.courbe = m; prevenir('courbe'); return; }
    if (m.type === 'moteur') { store.moteur = { enLigne: m.enLigne, moteurVu: m.moteurVu }; prevenir('moteur'); }
  }
  function envoyerFocus() { try { ws && ws.readyState === 1 && ws.send(JSON.stringify({ type: 'focus', actif: focus })); } catch (e) { /* */ } }
  function connecter() {
    if (arrete) return;
    if (!jeton) { store.connexion = 'pas de code d’accès'; store.erreur = 'Code d’accès Raylé absent (⚙ Réglages)'; prevenir('connexion'); return; }
    store.connexion = 'connexion…'; prevenir('connexion');
    try { ws = new WS(url.replace(/^http/, 'ws').replace(/\/+$/, '') + '/flux'); } catch (e) { store.erreur = e.message; return planifier(); }
    ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', role: 'ecran', jeton, focus }));
    ws.onmessage = e => recevoir(typeof e.data === 'string' ? e.data : '');
    ws.onclose = () => { if (store.connexion !== 'jeton refusé') store.connexion = 'déconnecté'; prevenir('connexion'); planifier(); };
    ws.onerror = () => { try { ws.close(); } catch (e) { /* */ } };
  }
  function planifier() { if (arrete || store.connexion === 'jeton refusé') return; setTimeout(connecter, attente); attente = Math.min(30000, attente * 2); }
  const onVisible = () => { if (!document.hidden && (!ws || ws.readyState > 1)) { attente = 1000; connecter(); } };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
  minuterie = setInterval(() => prevenir('horloge'), 1000);   // « hors ligne depuis X », compte à rebours
  connecter();

  return {
    store, abonner(f) { abonnes.add(f); return () => abonnes.delete(f); },
    regarder(actif) { focus = actif; envoyerFocus(); },
    /* « Je l'ai pris » : une NOTE pour le copilote (prix + heure), jamais un ordre */
    pris(id, prix, t) { try { if (ws && ws.readyState === 1) { ws.send(JSON.stringify({ type: 'pris', id: String(id), prix: Number(prix), t: Number(t) })); return true; } } catch (e) { /* */ } return false; },
    /* état de fraîcheur : live seulement si le dernier état a moins de 15 s */
    fraicheur() {
      const e = store.etat; if (!e) return { live: false, depuis: null, raison: store.connexion };
      const age = horloge() - e.t;
      return { live: age < HORS_LIGNE_MS && store.moteur.enLigne !== false, depuis: e.t, age };
    },
    _recevoir: recevoir,
    fermer() { arrete = true; clearInterval(minuterie); if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible); try { ws && ws.close(); } catch (e) { /* */ } }
  };
}
