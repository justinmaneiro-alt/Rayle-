/* ═════════════ TABLEAU DE BORD DE L'OR (une seule page qui défile ; même composant pour la page or.html, le terminal de Mars et le mode télé) ═════════════
   PC (≥ 1000 px, paysage) : graphique à gauche, carnet d'ordres à droite, puis Lecture du graphique, zones, journal, gardien et calculateur de taille.
   La musique et la télé ne sont PAS ici : ce sont des tuiles indépendantes de Rayle (media-rayle.js).
   Téléphone et tablette : une colonne. Un seul centre de notifications (cloche), aucun message éparpillé.
   Modules partagés : carnet.js + carnet-kraken.js (le même carnet que l'agent), moteur-or.js (données et calculs), graphique-or.js. */
import { creerCarnet } from '../carnet.js';
import { creerMoteurOr } from './moteur-or.js';
import { creerGraphiqueOr, COUCHES, ratio } from './graphique-or.js';
import { PERIODES, REGLES, TEXTE_REGLES, KRAKEN } from './config-or.js';
import { texteType, texteHistorique, NOMS_TYPES } from './zones-or.js';
import { heureParis } from './temps-or.js';
import { nomClair } from './reperes-or.js';
import { REGLES_NIVEAUX, REGLES_FLECHES, TEXTE_REGLES_FLECHES } from './niveaux-periode.js';
import { interpreter } from './commandes-or.js';

const lireJ = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const ecrireJ = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* refusé */ } };
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const nb = (p, d = 2) => p == null || !Number.isFinite(+p) ? '—' : Number(p).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/ | /g, ' ');
const ETATS = { loin: 'loin', approche: 'approche', sur: 'sur la zone', inconnu: '—' };
let cssCharge = false;
export function chargerCssOr() {
  if (cssCharge || document.getElementById('tor-css')) return; cssCharge = true;
  for (const [f, id] of [['../jetons.css', 'at-jetons'], ['../agent.css', 'at-css'], ['./tableau-or.css', 'tor-css']]) { if (document.getElementById(id)) continue; const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = new URL(f, import.meta.url).href; l.id = id; document.head.appendChild(l); }
}
/* niveaux, liquidité et flèches de la période affichée (niveaux-periode.js) pour le graphique */
const VIDE = Object.freeze([]);
export const dessinPeriode = S => ({ bandes: S.niveauxP ? S.niveauxP.bandes : VIDE, liquidite: S.liquidite ? S.liquidite.zones : VIDE, balayages: S.liquidite ? S.liquidite.balayages : VIDE, fleches: S.fleches && S.fleches.periode === S.periode ? S.fleches.liste : VIDE });
export const disposition = (l, h) => (l >= 1000 && l >= h ? 'pc' : 'colonne');

/* voix : celle de Rayle si la page est dans Rayle (window.speak), sinon la synthèse du navigateur */
export function parler(texte) {
  try { if (typeof window.speak === 'function') return window.speak(texte); } catch (e) { /* repli */ }
  try { const u = new SpeechSynthesisUtterance(texte); u.lang = 'fr-FR'; u.rate = 0.95; const v = speechSynthesis.getVoices().find(x => /^fr/i.test(x.lang)); if (v) u.voice = v; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch (e) { /* pas de voix */ }
}

export function monterTableauOr(el, { modules = {}, contexte = 'page', fetchFn, WS, etudeAuto = true } = {}) {
  chargerCssOr();
  const mobile = Math.min(innerWidth, innerHeight) < 600;
  el.innerHTML = `<div class="tor" data-contexte="${esc(contexte)}">
  <header class="tor-tete">
    <div class="tor-titre"><b>Or</b> <small>Kraken ${KRAKEN.symbole}</small> <span class="tor-prix" data-or-prix>—</span> <small class="tor-var" data-or-var></small></div>
    <nav class="tor-periodes" aria-label="Période">${Object.keys(PERIODES).map(p => `<button type="button" data-periode="${p}">${p === 'J' ? 'Jour' : p}</button>`).join('')}</nav>
    <div class="tor-outils">
      <details class="tor-couches"><summary>Couches</summary>${Object.entries(COUCHES).map(([k, v]) => `<label><input type="checkbox" data-couche="${k}"> ${v}</label>`).join('')}</details>
      <button type="button" data-a="position" title="Poser entrée, stop et objectif sur le graphique">📐 Position</button>
      <button type="button" class="tor-cloche" data-a="notifs" aria-label="Centre de notifications">🔔<i data-notifs-n hidden>0</i></button>
    </div>
  </header>
  <p class="tor-bandeau" data-bandeau role="status" hidden></p>
  <section class="tor-ecran1">
    <div class="tor-graph"><div class="tor-graph-lw" data-graph></div><p class="tor-pos" data-pos hidden></p><p class="tor-graph-source" data-source></p><p class="tor-graph-source tor-bilan" data-bilan-fleches></p></div>
    <aside class="tor-carnet at" data-carnet aria-label="Carnet d’ordres"></aside>
  </section>
  <section class="tor-bloc tor-lecture" data-lecture>
    <h2>Lecture du graphique <small>informations de marché, jamais un ordre</small></h2>
    <dl><dt>Biais H1</dt><dd data-l-biais>—</dd><dt>Zone au-dessus</dt><dd data-l-dessus>—</dd><dt>Zone au-dessous</dt><dd data-l-dessous>—</dd><dt>État</dt><dd data-l-etat>—</dd></dl>
    <form class="tor-demande" data-demande><input type="text" placeholder="Demander à Rayle… (« on en est où ? »)" aria-label="Demander à Rayle"><button type="button" data-a="micro" title="Parler">🎤</button><button type="submit">Envoyer</button><button type="button" data-a="ou" title="Rayle, on en est où ?">🔊 On en est où ?</button></form>
    <p class="tor-reponse" data-reponse aria-live="polite"></p>
    <details class="tor-zones-det" data-zones><summary>Zones de retournement en détail <small>les plus proches, classées par confluence</small></summary><ol class="tor-zones" data-zones-liste></ol><p class="tor-doux" data-etude></p>
    <details><summary>Règles figées ${REGLES.version}</summary><pre class="tor-regles">${esc(TEXTE_REGLES)}</pre></details>
    <details><summary>Règles figées des niveaux et des flèches (${REGLES_NIVEAUX.version}, ${REGLES_FLECHES.version})</summary><pre class="tor-regles">${esc(TEXTE_REGLES_FLECHES)}</pre></details></details>
  </section>
  <section class="tor-bloc" data-journal-bloc></section>
  <section class="tor-bloc" data-gardien-bloc></section>
  <footer class="tor-pied">Simulation et information seulement : Rayle ne passe aucun ordre. Prix : Kraken Futures ${KRAKEN.symbole} (relais public sans clé). Volume, delta et niveaux : Binance XAUUSDT, décalés de l’écart mesuré. Graphique : <a href="https://www.tradingview.com/" target="_blank" rel="noopener">TradingView</a> Lightweight Charts™ (Apache-2.0). Heure de Paris.</footer>
  <div class="tor-notifs" data-notifs hidden><header><b>Notifications</b><button type="button" data-a="fermer-notifs" aria-label="Fermer">✕</button></header>
    <div class="tor-notifs-regl">
      <label><input type="checkbox" data-r="voix"> Voix automatique</label>
      <label><input type="checkbox" data-r="telegram"> Telegram (INFO MARCHÉ, pas un signal)</label>
      <label><input type="checkbox" data-r="couper"> Couper les alertes</label>
      <label>Heures calmes <input type="number" min="0" max="23" data-r="calmeDe"> h → <input type="number" min="0" max="23" data-r="calmeA"> h</label>
      <label>Plafond par jour <input type="number" min="1" max="50" data-r="plafond"></label>
    </div><ol data-notifs-liste></ol></div>
</div>`;
  const R = el.firstElementChild, q = s => R.querySelector(s);
  const notifs = []; let nonLues = 0;
  const regl = lireJ('rayle_or_regl', { voix: false, telegram: false });
  function notifier(texte, { niveau = 'info', dit = true, raison = null, t = Date.now() } = {}) {
    notifs.unshift({ texte, niveau, t, dit, raison }); notifs.length = Math.min(notifs.length, 80); if (dit) nonLues++;
    const n = q('[data-notifs-n]'); n.hidden = !nonLues; n.textContent = nonLues;
    q('[data-notifs-liste]').innerHTML = notifs.map(x => `<li class="tor-n-${x.niveau}${x.dit ? '' : ' tor-n-tu'}"><time>${heureParis(x.t)}</time> ${esc(x.texte)}${x.dit ? '' : ` <small>(non annoncé : ${esc(x.raison)})</small>`}</li>`).join('');
  }
  const api = { notifier, R, modules };

  /* moteur + graphique + carnet (le même carnet que l'agent) */
  const graph = creerGraphiqueOr(q('[data-graph]'), { mobile });
  graph.surPosition = (pos, outil) => majPosition(pos, outil);
  graph.surBordGauche = () => { moteur.plusAncien(); };   // glisser vers la gauche : historique plus ancien
  const carnet = creerCarnet(q('[data-carnet]'), { racine: q('[data-carnet]'), WS });   // racine = élément « .at » qui porte les couleurs du carnet (jetons.css)
  carnet.maj('OR', null);
  const moteur = creerMoteurOr({ ...(fetchFn ? { fetchFn } : {}), etudeAuto, surMaj: () => rendre(), surEvenement: ev => evenement(ev) });
  api.moteur = moteur; api.graph = graph; api.carnet = carnet;
  let derTr = 0;
  const pompe = setInterval(() => {
    const L = carnet._flux.transactions().filter(x => x.t > derTr); if (!L.length) return; derTr = L[L.length - 1].t;
    if (moteur.transactions(L)) { const b = moteur.S.k[moteur.S.k.length - 1]; graph.majDerniere(b); rendreTete(); }
  }, 400);

  function evenement(ev) {
    notifier(ev.texte, { niveau: ev.type === 'cassure' || ev.type === 'rejet' ? 'fort' : 'info', dit: ev.dit, raison: ev.raison, t: ev.t });
    if (!ev.dit) return;
    if (regl.voix) parler(ev.texte);
    if (regl.telegram) envoyerTelegram(ev.texte);
    modules.surEvenement && modules.surEvenement(ev);
  }
  /* pont Telegram EXISTANT du Worker principal (route /telegram/envoyer, type ENTREE, seul type relayé) : jamais modifié ; seulement si Rayle est configurée */
  async function envoyerTelegram(texte) {
    try {
      const w = (window.RayleBus && RayleBus.demander('worker')) || {}, store = k => { try { const v = localStorage.getItem(k); return v ? (v.startsWith('"') ? JSON.parse(v) : v) : ''; } catch (e) { return ''; } };
      const url = (w.url || store('rayle_worker_url')).replace(/\/+$/, ''), jeton = w.token || store('rayle_worker_appareil') || store('rayle_worker_token');
      if (!url || !jeton) { notifier('Telegram : Rayle n’est pas configurée sur cet appareil (adresse et jeton du Worker).', { niveau: 'doux' }); return; }
      const r = await fetch(url + '/telegram/envoyer', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Rayle-Token': jeton }, body: JSON.stringify({ type: 'ENTREE', texte: 'INFO MARCHÉ, pas un signal\n' + texte }) });
      if (!r.ok) notifier('Telegram : refusé (' + r.status + ').', { niveau: 'doux' });
    } catch (e) { notifier('Telegram indisponible : ' + e.message, { niveau: 'doux' }); }
  }

  function rendreTete() {
    const S = moteur.S, p = S.prix, o = S.ticker && S.ticker.open24h;
    q('[data-or-prix]').textContent = nb(p); q('[data-or-prix]').dataset.valeur = p ?? '';
    q('[data-or-var]').textContent = p && o ? `${p >= o ? '+' : ''}${nb((p / o - 1) * 100)} % sur 24 h` : '';
    carnet.maj('OR', p ? { prix: p } : null);
  }
  /* où en est l'historique chargé (glisser vers la gauche pour en charger plus) */
  function texteHistoriqueCharge(S) {
    const H = S.hist; if (!H) return '';
    const d = t => new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
    if (S.chargementAncien) return ' · chargement de l’historique plus ancien…';
    const k = S.k.length ? `Kraken depuis le ${d(S.k[0].t)}${H.krakenEpuise ? ' (mise en ligne du perpétuel)' : ''}` : '';
    const r = H.ref.length ? ` · référence Binance depuis le ${d(H.ref[0].t)}${H.refEpuise ? ' (début de la série)' : ''}` : '';
    return ` · ${k}${r}${H.krakenEpuise && H.refEpuise ? ' · tout l’historique disponible est chargé' : ' · glisse vers la gauche pour remonter'}`;
  }
  function rendre() {
    const S = moteur.S;
    rendreTete();
    for (const b of R.querySelectorAll('[data-periode]')) b.setAttribute('aria-pressed', String(b.dataset.periode === S.periode));
    graph.bougies(moteur.serie(), S.hist ? S.refP : S.periode === 'M15' ? S.refM15 : S.refP, { cle: S.periode + (S.hist ? ':historique' : ':court'), debutKraken: S.hist && S.k.length ? S.k[0].t : null, ecart: S.ecart });
    graph.dessin({ zonesVol: S.zonesVol, niveaux: S.niveaux, retournement: S.zones, prix: S.prix, a: S.a, ...dessinPeriode(S) });
    // bandeau unique : marché fermé, retard, données peu fiables, panne
    const msg = [];
    if (S.erreurs.kraken) msg.push('Prix Kraken indisponible : ' + S.erreurs.kraken);
    if (S.erreurs.binance) msg.push('Référence Binance indisponible : ' + S.erreurs.binance);
    if (S.marche && !S.marche.ouvert) msg.push(S.marche.texte);
    else if (S.retard && S.retard.enRetard) msg.push(S.retard.texte);
    if (S.fiable === false) msg.push(`Données peu fiables : seulement ${nb(S.volume24h / 1e6, 0)} M$ échangés sur 24 h sur la référence.`);
    const b = q('[data-bandeau]'); b.hidden = !msg.length; b.textContent = msg.join(' · ');
    const bf = q('[data-bilan-fleches]'), BF = S.bilanFleches && S.fleches && S.fleches.periode === S.periode ? S.bilanFleches : null;
    bf.textContent = BF ? `Flèches de rebond (${S.periode}) : ${BF.texte} Informations de lecture, jamais un ordre.` : 'Flèches de rebond : calcul en cours…';
    q('[data-source]').textContent = `Prix Kraken · volume Binance · écart Kraken − Binance ${S.ecart == null ? 'non mesuré' : (S.ecart >= 0 ? '+' : '') + nb(S.ecart)} $${S.ecartN ? ` (médiane de ${S.ecartN} bougies)` : ''} · ATR H1 ${nb(S.a)} $${texteHistoriqueCharge(S)}`;
    // lecture
    const L = S.lecture; if (L) {
      q('[data-l-biais]').textContent = S.biais ? `${L.biais} (${S.biais.texte})` : '—';
      const zl = z => z ? `${nb(z.p, 0)} (${z.noms.slice(0, 2).map(nomClair).join(', ')}) · ${texteHistorique(z)}` : 'aucune dans la liste';
      q('[data-l-dessus]').textContent = zl(L.dessus); q('[data-l-dessous]').textContent = zl(L.dessous); q('[data-l-etat]').textContent = L.etat;
    }
    // zones
    q('[data-zones-liste]').innerHTML = S.zones.map((z, i) => `<li data-zone="${z.id}"><div><b>${z.cote === 'support' ? 'Support' : 'Résistance'} ${nb(z.p, 0)}</b> <span class="tor-etat tor-etat-${S.etats[z.id]}">${ETATS[S.etats[z.id]] || '—'}</span></div>
      <span>${esc(z.noms.map(nomClair).join(', '))} · de ${nb(z.bas)} à ${nb(z.haut)} · à ${nb(z.distAtr, 1)} ATR H1 du prix</span>
      <span>Historique réel (30 derniers jours) : ${texteHistorique(z)}${z.tests ? '' : ''}</span>
      <small>${[...new Set(z.types)].map(t => esc(S.etude ? texteType(S.etude, t) : `${NOMS_TYPES[t]} : mesure ${S.etudeEtat}`)).join('<br>')}</small></li>`).join('') || '<li>Aucune zone pour le moment (données en cours de chargement).</li>';
    const E = S.etude;
    q('[data-etude]').textContent = E ? `Taux de réaction mesurés sur ${E.jours} jours (${new Date(E.debut).toLocaleDateString('fr-FR')} → ${new Date(E.fin).toLocaleDateString('fr-FR')}, M15 Binance XAUUSDT ; la série commence le 11/12/2025, moins de 12 mois disponibles) contre ${E.hasard.tirages} niveaux au hasard ; correction de Holm. Aucun type ne bat le hasard de façon nette : ces zones décrivent le marché, elles ne prédisent rien.` : `Taux de réaction : mesure ${S.etudeEtat}.`;
    if (E && Object.values(E.parType).some(r => r.assez && r.pHolm < 0.05 && r.taux > r.hasard.taux)) q('[data-etude]').textContent = q('[data-etude]').textContent.replace('Aucun type ne bat le hasard de façon nette : ces zones décrivent le marché, elles ne prédisent rien.', 'Au moins un type tient mieux que le hasard (voir chaque zone) ; cela reste une mesure passée, pas une promesse.');
    modules.journal && modules.journal.majMarche && modules.journal.majMarche(S);
    modules.gardien && modules.gardien.majMarche && modules.gardien.majMarche(S);
    api.surRendu && api.surRendu(S);
  }
  function majPosition(pos, outil) {
    const p = q('[data-pos]'), r = ratio(pos);
    p.hidden = !outil && !pos; const btn = q('[data-a="position"]'); btn.setAttribute('aria-pressed', String(!!outil));
    p.textContent = outil ? `Clique sur le graphique pour poser ${outil === 'entree' ? 'l’entrée' : outil === 'stop' ? 'le stop' : 'l’objectif'}.` : r ? `${r.sens === 'achat' ? 'Achat' : 'Vente'} · entrée ${nb(pos.entree)} · stop ${nb(pos.stop)} · objectif ${nb(pos.objectif)} · gain/risque ${nb(r.rr, 1)}${r.coherent ? '' : ' · objectif du mauvais côté'} · glisse un trait pour l’ajuster` : '';
    if (r) p.insertAdjacentHTML('beforeend', ' <button type="button" data-a="effacer-pos">Effacer</button>');
    modules.gardien && modules.gardien.majPosition && modules.gardien.majPosition(pos);
  }

  /* commandes (texte et voix) */
  async function repondre(texte) {
    const c = interpreter(texte), rep = q('[data-reponse]');
    let dire = null;
    if (c.type === 'lecture') dire = moteur.S.lecture ? moteur.S.lecture.phrase : 'Je charge encore les données de l’or.';
    else if (c.type === 'vue' && modules.surVue) dire = modules.surVue(c.vue);
    else if (c.type === 'musique' || c.type === 'fenetre') { try { dire = await (await import('./media-rayle.js')).commande(texte, { global: false }); } catch (e) { dire = 'La musique n’est pas disponible ici.'; } }
    else dire = 'Je n’ai pas compris. Essaie « on en est où ? ».';
    if (dire) { rep.textContent = dire; parler(dire); }
    return dire;
  }
  api.repondre = repondre; api.commande = texte => interpreter(texte).type === 'lecture' ? repondre(texte) : null;   // musique et télé : media-rayle.js, depuis n'importe quel écran

  /* événements de l'interface */
  R.addEventListener('click', e => {
    const b = e.target.closest('[data-periode],[data-a]'); if (!b) return;
    if (b.dataset.periode) { moteur.periode(b.dataset.periode); return; }
    const a = b.dataset.a;
    if (a === 'position') { const o = graph.outil(graph.etat().outil ? null : 'entree'); majPosition(graph.position(), o); }
    else if (a === 'effacer-pos') { graph.effacerPosition(); majPosition(null, null); }
    else if (a === 'notifs') { const n = q('[data-notifs]'); n.hidden = !n.hidden; if (!n.hidden) { nonLues = 0; q('[data-notifs-n]').hidden = true; } }
    else if (a === 'fermer-notifs') q('[data-notifs]').hidden = true;
    else if (a === 'ou') repondre('on en est où');
    else if (a === 'micro') ecouter();
  });
  q('[data-demande]').addEventListener('submit', e => { e.preventDefault(); const i = e.target.querySelector('input'); if (i.value.trim()) repondre(i.value.trim()); i.value = ''; });
  for (const c of R.querySelectorAll('[data-couche]')) { c.checked = graph.couches()[c.dataset.couche] !== false; c.addEventListener('change', () => graph.couches({ [c.dataset.couche]: c.checked })); }
  // réglages des notifications
  const anti = moteur.anti.reglages();
  const champs = { voix: regl.voix, telegram: regl.telegram, couper: anti.coupe, calmeDe: anti.calme.de, calmeA: anti.calme.a, plafond: anti.plafond };
  for (const i of R.querySelectorAll('[data-r]')) {
    const k = i.dataset.r; if (i.type === 'checkbox') i.checked = !!champs[k]; else i.value = champs[k];
    i.addEventListener('change', () => {
      if (k === 'voix' || k === 'telegram') { regl[k] = i.checked; ecrireJ('rayle_or_regl', regl); }
      else if (k === 'couper') moteur.reglerAlertes({ coupe: i.checked });
      else if (k === 'plafond') moteur.reglerAlertes({ plafond: Math.max(1, +i.value || REGLES.plafondJour) });
      else moteur.reglerAlertes({ calme: { [k === 'calmeDe' ? 'de' : 'a']: Math.max(0, Math.min(23, +i.value || 0)) } });
    });
  }
  function ecouter() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { notifier('La reconnaissance vocale n’est pas disponible dans ce navigateur : écris ta question.', { niveau: 'doux' }); return; }
    const r = new SR(); r.lang = 'fr-FR'; r.interimResults = false; r.maxAlternatives = 1;
    r.onresult = ev => repondre(ev.results[0][0].transcript); r.onerror = ev => notifier('Micro : ' + ev.error, { niveau: 'doux' }); r.start();
  }
  const surTaille = () => { R.dataset.disposition = disposition(el.clientWidth || innerWidth, contexte === 'fenetre' ? el.clientHeight || innerHeight : innerHeight); };
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(surTaille) : null; ro ? ro.observe(el) : addEventListener('resize', surTaille); surTaille();

  // modules B et C (montés dans leurs blocs) : chargés à la demande, chacun indépendant
  api.monterModule = (nom, m) => { modules[nom] = m; };
  moteur.demarrer().then(() => { notifier('Données de l’or chargées.', { niveau: 'doux', dit: false, raison: 'information interne' }); }).catch(e => notifier('Chargement impossible : ' + e.message, { niveau: 'fort' }));
  api.detruire = () => { if (window.TableauOr === api) window.TableauOr = null; clearInterval(pompe); moteur.arreter(); carnet.detruire(); graph.detruire(); ro && ro.disconnect(); for (const m of Object.values(modules)) m && m.detruire && m.detruire(); el.innerHTML = ''; };
  api.valeurs = () => { const c = carnet._flux.carnet(), m = c && c.pret ? (() => { let b = -Infinity, a = Infinity; for (const p of c.bids.keys()) b = Math.max(b, p); for (const p of c.asks.keys()) a = Math.min(a, p); return { bid: b, ask: a, milieu: (a + b) / 2, spread: a - b }; })() : null; return { prix: moteur.S.prix, carnet: m, zones: moteur.S.zones.map(z => z.id), lecture: moteur.S.lecture && moteur.S.lecture.phrase }; };
  return api;
}
