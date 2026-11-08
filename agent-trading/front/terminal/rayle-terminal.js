/* ═════════════ TERMINAL : RAYLE COMPREND ET AGIT SUR LE TERMINAL (phase D) ═════════════
   • Comprend : état structuré (lecture-rayle.js) envoyé comme CONTEXTE à la route /chat déjà en ligne (le Worker n'est pas modifié) ;
     les chiffres de la réponse sont vérifiés contre ce contexte, sinon Rayle dit le texte local (sans IA). Sans Worker : texte local.
   • Agit : change d'actif ou d'unité, zoome, surligne un niveau, trace les scénarios (« scénario Rayle », effaçables en un clic),
     affiche ou masque les couches, propose une position pré-remplie à valider d'un clic. Elle n'exécute JAMAIS d'ordre.
   • Alertes parlées (si activé) et annonce économique forte 15 minutes avant ; mémoire de contexte du jour (sur l'appareil).
   Rayle reste la seule voix : on parle par window.speak (voix de Rayle) quand elle existe. */
import { resumeCarnet, niveauxQuiComptent, etatTerminal, texteContexte, texteLocal, chiffresVerifies, intention, MENTION_LECTURE } from './lecture-rayle.js';
import { actifDepuisTexte, uniteDepuisTexte, PAR_ID_T, fmt } from './actifs-terminal.js';
import { coucheDepuisTexte, COUCHES } from './couches-terminal.js';
import { COT_ABSENT } from './dashboards-calcul.js';
import { IMPORTANTS } from './alertes-calcul.js';
import { calcul } from './positions-calcul.js';
import { seuilGros } from '../carnet-kraken.js';
import { ouvrirStockage } from './stockage-terminal.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const HM = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });
const heure = t => HM.format(new Date(t)).replace(':', ' h ');
const jour = () => new Date().toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' });

export async function monterRayle(T, { stockage = null, maintenant = () => Date.now(), parlerFn = null, wfetchFn = null } = {}) {
  const st = stockage || await ouvrirStockage();
  const E = { scen: [], surligne: null, memoire: ((await st.lire('contexte', 'jour')) || { id: 'jour', jour: jour(), m: [] }), derniere: null, annoncesDites: new Set(), detruit: false };
  if (E.memoire.jour !== jour()) E.memoire = { id: 'jour', jour: jour(), m: [] };
  const G = T.graph, f = p => fmt(T.actif(), p), nom = () => PAR_ID_T[T.actif()].nom;
  const parler = async txt => { if (!txt) return; try { if (parlerFn) return parlerFn(txt); if (typeof window.speak === 'function') return await window.speak(txt); const u = new SpeechSynthesisUtterance(txt); u.lang = 'fr-FR'; speechSynthesis.speak(u); } catch (e) { /* pas de voix */ } };
  async function retenir(quoi) { E.memoire.m.push({ t: maintenant(), quoi: `${heure(maintenant())} ${quoi}` }); E.memoire.m = E.memoire.m.slice(-30); await st.ecrire('contexte', E.memoire); }

  /* ── état structuré ── */
  function etat() {
    const D = T.module('dessin'), P = T.module('positions'), c = T.etatCarnet(), ma = T.valeursMA(), B = T.serie() ? T.serie().bougies() : [];
    const S = T.serie(), sma = ma.ma200 ? ma.ma200[ma.ma200.length - 1] : (() => { if (B.length < 200) return null; let s = 0; for (let i = B.length - 200; i < B.length; i++) s += B[i].c; return s / 200; })();
    const na = T.niveauxAuto(), atr = T.atr(), prix = T.prix();
    const niveaux = niveauxQuiComptent({ prix, atr, objets: D ? D.objets() : [], auto: na.niveaux ? na.niveaux.bandes : [], zones: D ? D.zones() : [], liquidites: na.liquidite ? na.liquidite.zones : [], ma200: sma });
    const dd = T.dash.donnees(), tr = c ? c.transactions : [];
    return etatTerminal({ actif: T.actif(), nomActif: nom(), unite: T.unite(), prix, atr, tendance: T.tendance(), ma200: sma, niveaux,
      positions: P ? P.positions().filter(p => ['attente', 'ouverte', 'proposee'].includes(p.etat)).map(p => ({ ...p, sens: calcul(p).achat ? 'achat' : 'vente' })) : [],
      alertes: D ? D.E.alertes : [], carnet: c ? resumeCarnet(c.carnet, { transactions: tr, seuil: seuilGros(tr.map(x => x.usd)), maintenant: maintenant() }) : null, sante: T.sante(),
      annonces: dd.annonces || [], cot: dd.cot && T.actif() && PAR_ID_T[T.actif()].cot ? dd.cot : null, cotAbsent: COT_ABSENT[T.actif()] || null, maintenant: maintenant(), source: S ? S.info().source : null, memoire: E.memoire.m });
  }

  /* ── question : IA par la route /chat (contexte), chiffres vérifiés ; sinon texte local ── */
  async function repondre(question, sujet) {
    const e = etat(); E.derniere = e; const local = texteLocal(e, sujet, { fmt: f, heure });
    const wf = wfetchFn || (typeof window.wfetch === 'function' && (typeof window.workerReady !== 'function' || window.workerReady()) ? window.wfetch : null);
    let txt = local, source = 'lecture locale (sans IA)';
    if (wf) {
      const ctx = texteContexte(e, { fmt: f, heure });
      try {
        const r = await wf('/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: question, context: ctx, history: [] }) }, 40000);
        if (r.ok) { const d = await r.json(), rep = String(d.reply || '').trim(); const v = chiffresVerifies(rep, ctx);
          if (rep && v.ok) { txt = /pas une promesse/i.test(rep) ? rep : rep + ' ' + MENTION_LECTURE; source = 'Rayle (IA), chiffres vérifiés'; }
          else if (rep) source = `lecture locale : la réponse de l’IA citait des chiffres absents du terminal (${v.inconnus.slice(0, 3).join(', ')})`; }
      } catch (x) { source = 'lecture locale : Worker indisponible'; }
    }
    if (T.couches().scenarios !== false && e.scenarios.liste.length && sujet === 'etat') tracer(e.scenarios.liste);
    await retenir(`question « ${question.slice(0, 60)} » sur ${e.nomActif} à ${f(e.prix)}${e.scenarios.liste.length ? ', scénarios ' + e.scenarios.liste.map(s => s.nom.split(' · ')[0] + ' ' + f(s.niveau)).join(' / ') : ''}`);
    afficherReponse(question, txt, source); return txt;
  }

  /* ── actions sur le graphique ── */
  function tracer(L) { E.scen = L.map(s => ({ ...s, actif: T.actif(), t: maintenant() })); G.redessiner(); rendre(); }
  function effacerScenarios() { const n = E.scen.length; E.scen = []; G.redessiner(); rendre(); return n; }
  G.ajouterPrimitive((ctx, D) => {
    const W = D.width; ctx.font = '11px Segoe UI, system-ui, sans-serif';
    if (T.couches().scenarios !== false) for (const [k, s] of E.scen.filter(s => s.actif === T.actif()).entries()) {
      const col = s.sens === 'hausse' ? 'rgba(79,209,139,.85)' : 'rgba(239,106,95,.85)', x0 = W * 0.62 + k * 40, y0 = G.yDe(s.entree), y1 = G.yDe(s.cible), ys = G.yDe(s.stop); if (y0 == null || y1 == null) continue;
      ctx.strokeStyle = col; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + 70, y1); ctx.stroke(); ctx.setLineDash([]);
      const a = Math.atan2(y1 - y0, 70); ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x0 + 70, y1); ctx.lineTo(x0 + 70 - 8 * Math.cos(a - 0.4), y1 - 8 * Math.sin(a - 0.4)); ctx.lineTo(x0 + 70 - 8 * Math.cos(a + 0.4), y1 - 8 * Math.sin(a + 0.4)); ctx.fill();
      ctx.strokeStyle = 'rgba(201,178,122,.7)'; ctx.setLineDash([2, 3]); for (const [y, t] of [[y0, 'niveau'], [ys, 'stop']]) if (y != null) { ctx.beginPath(); ctx.moveTo(x0 - 20, y); ctx.lineTo(x0 + 90, y); ctx.stroke(); } ctx.setLineDash([]);
      const t = `scénario Rayle ${s.nom.split(' · ')[0]} · ${f(s.niveau)} → ${f(s.cible)} · stop ${f(s.stop)}`, w = ctx.measureText(t).width + 8;
      ctx.fillStyle = 'rgba(5,8,12,.86)'; ctx.fillRect(x0 - 20, y0 + (s.sens === 'hausse' ? 6 : -20), w, 14); ctx.fillStyle = '#c9b27a'; ctx.fillText(t, x0 - 16, y0 + (s.sens === 'hausse' ? 17 : -9));
    }
    if (E.surligne && E.surligne.actif === T.actif() && maintenant() < E.surligne.fin) {
      const y = G.yDe(E.surligne.p); if (y != null) { ctx.fillStyle = 'rgba(143,208,227,.16)'; ctx.fillRect(0, y - 6, W, 12); ctx.strokeStyle = '#8fd0e3'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); ctx.fillStyle = '#8fd0e3'; ctx.fillText('Rayle : ' + E.surligne.nom + ' ' + f(E.surligne.p), 8, y - 9); }
    }
  }, 'top');
  function niveauCite(texte) {
    const n = (String(texte).replace(/(\d)[\s  ](?=\d{3}\b)/g, '$1').match(/\d+(?:[.,]\d+)?/) || [])[0]; if (n) { const v = +n.replace(',', '.'); if (v > 0) return { p: v, nom: 'niveau' }; }
    const e = etat(), t = texte.toLowerCase();
    if (/ma ?200|moyenne/.test(t) && e.ma200) return { p: e.ma200.valeur, nom: 'SMA 200' };
    if (/resistance|résistance/.test(t) && e.niveaux.dessus[0]) return { p: e.niveaux.dessus[0].p, nom: e.niveaux.dessus[0].nom };
    if (/support|zone|niveau/.test(t) && e.niveaux.dessous[0]) return { p: e.niveaux.dessous[0].p, nom: e.niveaux.dessous[0].nom };
    return null;
  }
  const actions = {
    surligner(texte) { const n = niveauCite(texte); if (!n) return 'Je ne trouve pas ce niveau sur le graphique.'; E.surligne = { ...n, actif: T.actif(), fin: maintenant() + 12000 }; G.redessiner(); setTimeout(() => G.redessiner(), 12100); return `Je surligne ${n.nom} à ${f(n.p)}.`; },
    zoomer(texte) {
      const n = niveauCite(texte), a = T.atr() || 1, B = T.serie() ? T.serie().bougies() : []; if (!B.length) return 'Pas de bougies à zoomer.';
      const p = n ? n.p : T.prix(), t1 = B[B.length - 1].t, t0 = B[Math.max(0, B.length - 80)].t; G.zoomer(t0, t1 + 5 * G.ms(), p - 3 * a, p + 3 * a); setTimeout(() => G.autoEchelle(), 20000);
      return n ? `Je zoome sur ${n.nom}, ${f(n.p)}.` : `Je zoome sur le prix actuel.`;
    },
    couche(texte, on) { const c = coucheDepuisTexte(texte); if (!c) return null; T.couche(c, on); const nm = COUCHES.find(x => x.id === c).nom; return `${on ? 'J’affiche' : 'Je masque'} : ${nm}.`; },
    async proposer() {
      const e = etat(), s = e.scenarios.liste[0]; if (!s) return `Je n’ai pas de scénario pour proposer une position : ${e.scenarios.raison}.`;
      const P = T.module('positions'); if (!P) return 'Le module des positions n’est pas chargé.';
      const p = await P.proposer({ entree: s.entree, stop: s.stop, objectif: s.cible, note: 'proposée par Rayle : ' + s.nom });
      if (!p) return 'Je n’ai pas pu préparer la position.';
      await retenir(`position proposée sur ${e.nomActif} (${s.nom})`);
      return `Je te propose une position ${s.sens === 'hausse' ? 'à l’achat' : 'à la vente'} : entrée ${f(s.entree)}, stop ${f(s.stop)}, cible ${f(s.cible)}. Elle est en pointillés ; valide-la d’un clic si elle te va. Je ne passe aucun ordre. ${MENTION_LECTURE}`;
    }
  };

  /* ── commande (voix ou texte) : renvoie la phrase dite, ou null si la phrase ne concerne pas le terminal ── */
  async function commande(texte, { force = false } = {}) {
    const it = intention(texte); if (!it && !force) return null;
    let rep = null;
    if (!it) rep = await repondre(texte, 'etat');
    else if (it.type === 'ordre') rep = 'Je ne passe jamais d’ordre, ni réel ni automatique. Je peux te proposer un tracé de position que tu valides toi-même.';
    else if (it.type === 'effacer-scenarios') { const n = effacerScenarios(); rep = n ? 'J’efface mes scénarios du graphique.' : 'Il n’y a pas de scénario à effacer.'; }
    else if (it.type === 'tracer-scenarios') { const e = etat(); if (e.scenarios.liste.length) { tracer(e.scenarios.liste); rep = `Je trace ${e.scenarios.liste.length === 1 ? 'un scénario' : 'deux scénarios'}, étiquetés scénario Rayle. ${MENTION_LECTURE}`; } else rep = `Pas de scénario : ${e.scenarios.raison}.`; }
    else if (it.type === 'proposer') rep = await actions.proposer();
    else if (it.type === 'zoomer') rep = actions.zoomer(texte);
    else if (it.type === 'surligner') rep = actions.surligner(texte);
    else if (it.type === 'couche') rep = actions.couche(texte, it.on) || 'Je ne connais pas cette couche.';
    else if (it.type === 'question') rep = await repondre(texte, it.sujet);
    if (it && (it.type === 'actif' || it.type === 'unite')) {
      const a = actifDepuisTexte(texte), u = uniteDepuisTexte(texte), P = [];
      if (a && a !== T.actif()) { T.choisirActif(a); P.push(`Je passe sur ${PAR_ID_T[a].nom}`); }
      if (u && u !== T.unite()) { T.choisirUnite(u); P.push(`${P.length ? 'en' : 'Je passe en'} ${u === 'J' ? 'journalier' : u}`); }
      rep = P.length ? P.join(' ') + '.' : 'C’est déjà affiché.'; await retenir(rep);
    }
    if (rep && !(it && it.type === 'question')) afficherReponse(texte, rep, 'action locale');
    return rep;
  }

  /* ── alertes parlées et annonces économiques à 15 minutes ── */
  const offAlerte = T.on('alerte', a => { const D = T.module('dessin'); if (!D || !D.E.regl.voix) return; if (!IMPORTANTS.includes(a.type) && a.type !== 'gardien') return; parler(a.phrase || a.texte); retenir('alerte : ' + a.texte); });
  const minut = setInterval(() => {
    const D = T.module('dessin'), L = (T.dash.donnees().annonces || []), now = maintenant();
    for (const a of L) { if (a.impact !== 'fort') continue; const m = (a.t - now) / 60e3; const id = `annonce|${a.devise}|${a.titre}|${a.t}`;
      if (m > 0 && m <= 15 && !E.annoncesDites.has(id)) { E.annoncesDites.add(id); const txt = `Annonce économique dans ${Math.round(m)} minutes : ${a.devise} ${a.titre}, à ${heure(a.t)}.`;
        if (D) D.alerter({ id, objet: 'annonce', type: 'annonce', actif: T.actif(), unite: '', t: now, tFin: now, prix: null, texte: txt, phrase: txt }); else T.bandeau(txt); } }
  }, 30000);

  /* ── panneau « Rayle » ── */
  const pR = T.panneau('rayle');
  function afficherReponse(q, rep, source) { E.dernierEchange = { q, rep, source, t: maintenant() }; rendre(); if (T.ongletOuvert() !== 'rayle') T.bandeau(rep.length > 140 ? rep.slice(0, 137) + '…' : rep, 9000); }
  function rendre() {
    const x = E.dernierEchange, e = E.derniere;
    pR.innerHTML = `<div class="tr-rayle"><div>
      <form data-rq><input type="text" placeholder="Demande à Rayle : « comment tu le sens ? », « qu’est-ce qui se passe sur le carnet ? », « trace les scénarios », « propose-moi une position »" aria-label="Question à Rayle"><button class="tr-btn" type="submit">Envoyer</button><button class="tr-btn" type="button" data-ra="micro" title="Parler à Rayle">🎤</button></form>
      ${x ? `<p class="tr-reponse"><b>${esc(x.q)}</b>\n${esc(x.rep)}</p><p class="tr-mini">Source : ${esc(x.source)}</p>` : '<p class="tr-doux">Rayle lit le terminal (prix, tendance, SMA 200, tes niveaux, zones, carnet, annonces, COT) et répond avec un ou deux scénarios. Elle ne passe jamais d’ordre.</p>'}
      <p class="tr-mini">${esc(MENTION_LECTURE)}</p></div>
      <div><h4 class="tr-sous">Scénarios tracés</h4>${E.scen.length ? `<ul class="tr-liste">${E.scen.map(s => `<li>${esc(s.nom)} : ${fmt(s.actif, s.niveau)} → ${fmt(s.actif, s.cible)} (stop ${fmt(s.actif, s.stop)})</li>`).join('')}</ul><button class="tr-btn" data-ra="effacer">Effacer les scénarios de Rayle</button>` : '<p class="tr-doux">Aucun.</p>'}
      <h4 class="tr-sous">Mémoire du jour</h4>${E.memoire.m.length ? `<ul class="tr-liste">${E.memoire.m.slice(-8).reverse().map(m => `<li>${esc(m.quoi)}</li>`).join('')}</ul>` : '<p class="tr-doux">Rien encore aujourd’hui.</p>'}
      ${e ? `<details><summary>Ce que Rayle voit</summary><pre class="tr-regles">${esc(texteContexte(e, { fmt: f, heure }))}</pre></details>` : ''}</div></div>`;
  }
  pR.addEventListener('submit', async ev => { ev.preventDefault(); const i = pR.querySelector('[data-rq] input'), q = i.value.trim(); if (!q) return; i.value = ''; const r = await commande(q, { force: true }); if (r) parler(r); });
  pR.addEventListener('click', ev => { const a = ev.target.dataset.ra; if (a === 'effacer') effacerScenarios(); if (a === 'micro') { try { if (window.RayleBus) RayleBus.emit('raylé:ecouter', {}); const b = document.getElementById('miniReactor') || document.querySelector('.reactor'); if (b) b.click(); } catch (x) { /* */ } } });
  const offAct = T.on('action', a => { if (a === 'rayle') T.ongletBas('rayle'); });
  rendre();

  return {
    commande, etat, repondre, tracer, effacerScenarios, scenarios: () => E.scen, memoire: () => E.memoire.m, actions,
    detruire() { E.detruit = true; clearInterval(minut); offAlerte(); offAct(); }
  };
}
