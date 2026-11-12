/* ═════════════ TRADING ACTIF (OR) : panneau Outils, alertes vocales, setup A+ (colle) ═════════════
   Rayle lit, alerte et propose : AUCUN ordre n'est jamais envoyé. Toute règle de trading affiche « non prouvée » : aucun test contre le hasard (Holm) n'est passé (voir recherche-or/).
   Panneau Outils : interrupteurs des couches (par défaut : MA200, golden zone, niveaux de la veille et de la semaine) ; moyenne MA200 ou EMA300 pondérée par le volume.
   Alertes vocales : cassure de la MA200, retour dessus (fausse cassure), rebond (confirmé par le volume ou le carnet), carnet qui accompagne ou non, ouverture et fermeture des séances (heure de Paris).
   Setup A+ (aplus-v1, scellé) : cinq conditions, 3 alertes par jour au plus, 60 minutes entre deux, registre en avant (rayle_or_aplus_forward, ajout seul) mesuré à 6, 12 et 24 bougies. */
import * as ER from '../../recherche-or/ema200-regles.mjs';
import * as AP from './aplus-v1.js'; import * as MA from './ma-evenements-v1.js'; import { SEANCES } from './institutionnel-calcul.js';
const CLE_V = 'rayle_or_alertes_voix', CLE_AP = 'rayle_or_aplus_forward', H = 3600e3;
const lire = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const ecrire = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nb = (x, d = 0) => Number(x).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/[  ]/g, ' ');
const hp = t => new Date(t).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
export const OUTILS = Object.freeze([
  { cle: 'rayMa', nom: 'Moyenne mobile (MA200) et ses événements', defaut: true }, { cle: 'rayGolden', nom: 'Golden zone (61,8–78,6 % du dernier élan)', defaut: true }, { cle: 'veilleSemaine', nom: 'Plus hauts et plus bas de la veille et de la semaine', defaut: true },
  { cle: 'vwap', nom: 'VWAP de session', defaut: false }, { cle: 'profil', nom: 'Profil de volume (POC, VAH, VAL)', defaut: false }, { cle: 'seances', nom: 'Sessions Asie / Londres / New York (bandes discrètes)', defaut: false },
  { cle: 'ictOb', nom: 'Zones d\'offre et de demande récentes (order blocks)', defaut: false }, { cle: 'rayBoites', nom: 'Boîtes de confluence', defaut: false }
]);
const PRESET_EPURE = ['rayMa', 'rayGolden', 'veilleSemaine'];
export function creerTradingActif({ racine, graph, strategie, parler = () => {}, maintenant = () => Date.now(), auto = true } = {}) {
  const E = { voix: { actif: true, cassure: true, rebond: true, carnet: true, sessions: true, ...lire(CLE_V, {}) }, dits: new Set(lire(CLE_V + '_dits', [])), reg: lire(CLE_AP, []), dernierBar: null, derniereSession: {}, fleches: [] };
  const q = s => racine && racine.querySelector(s);
  /* ── panneau Outils ── */
  const sec = q('[data-rayle]');
  if (sec && !q('[data-ray-outils]')) {
    const d = document.createElement('details'); d.className = 'tor-ray-outils'; d.dataset.rayOutils = ''; d.open = true;
    d.innerHTML = `<summary><b>Outils</b> <small>règles de trading : non prouvées</small></summary><div class="tor-ray-outils-corps">${OUTILS.map(o => `<label><input type="checkbox" data-ray-outil="${o.cle}"> ${esc(o.nom)}</label>`).join('')}
      <label>Moyenne <select data-ray-moyenne><option value="ma200">MA200 (simple, H1)</option><option value="vema300">EMA300 pondérée par le volume</option></select></label>
      <div class="tor-ctx-actions"><button type="button" class="tor-gb" data-a="ray-epure-defaut">Lecture épurée (MA200 + golden zone + niveaux de la veille)</button><button type="button" class="tor-gb" data-a="ray-tout-outils">Tout afficher</button></div>
      <label><input type="checkbox" data-ray-voix="actif"> Alertes vocales</label> <small class="tor-doux">cassure / retour / rebond de la MA200, carnet, ouverture et fermeture des séances (heure de Paris)</small></div>`;
    sec.insertBefore(d, sec.querySelector('[data-ray-etat]') || sec.firstChild);
  }
  const couches = () => graph.couches();
  function poser(cle, on) { const c = racine.querySelector(`[data-couche="${cle}"]`); if (c) { c.checked = on; c.dispatchEvent(new Event('change', { bubbles: true })); } else graph.couches({ [cle]: on }); }
  function epure() { const tout = new Set([...OUTILS.map(o => o.cle), 'sr', 'liquidite', 'fleches', 'mouvements', 'volume', 'structure', 'retournements']); for (const k of tout) poser(k, PRESET_EPURE.includes(k) || k === 'fleches'); majOutils(); }
  function majOutils() { for (const c of racine.querySelectorAll('[data-ray-outil]')) c.checked = !!couches()[c.dataset.rayOutil]; const s = q('[data-ray-moyenne]'); if (s) s.value = strategie.etat().reg.moyenne || 'ma200'; const v = q('[data-ray-voix="actif"]'); if (v) v.checked = !!E.voix.actif; }
  racine.addEventListener('change', ev => { const t = ev.target; if (t.dataset && t.dataset.rayOutil) { poser(t.dataset.rayOutil, t.checked); majOutils(); } else if (t.matches && t.matches('[data-ray-moyenne]')) strategie.reglage('moyenne', t.value); else if (t.dataset && t.dataset.rayVoix) { E.voix[t.dataset.rayVoix] = t.checked; ecrire(CLE_V, E.voix); } });
  racine.addEventListener('click', ev => { const b = ev.target.closest('[data-a="ray-epure-defaut"],[data-a="ray-tout-outils"]'); if (!b) return; if (b.dataset.a === 'ray-epure-defaut') epure(); else { for (const o of OUTILS) poser(o.cle, true); majOutils(); } });
  /* ── alertes vocales ── */
  const dire = (id, texte) => { if (!E.voix.actif || E.dits.has(id)) return false; E.dits.add(id); const L = [...E.dits].slice(-200); ecrire(CLE_V + '_dits', L); try { parler(texte); } catch (e) { /* */ } E.dernier = { id, texte, t: maintenant() }; return true; };
  function carnetAccompagne(dir) { const l = strategie.carte && strategie.carte.lecture(); if (!l) return null; return (dir > 0 && l.pression === 'acheteuse') || (dir < 0 && l.pression === 'vendeuse') ? true : l.pression === 'neutre' ? null : false; }
  function alertesMa(I) {
    const { B, res } = I; if (!res || !B) return; const n = B.length;
    for (const e of res.events) {
      if (n - 1 - e.i > 1 || (e.type !== 'cassure' && e.type !== 'fausse' && e.type !== 'rebond')) continue;
      const px = nb(B[e.i].c), sens = e.dir > 0 ? 'haussière' : 'baissière'; let vol = 0, k = 0; for (let j = Math.max(0, e.i - 20); j < e.i; j++) if (B[j].v > 0) { vol += B[j].v; k++; } const vr = k && B[e.i].v > 0 ? B[e.i].v / (vol / k) : null, ca = carnetAccompagne(e.dir);
      if (e.type === 'cassure' && E.voix.cassure) { let t = `Cassure ${sens} de la MA 200 à ${px}.`; if (E.voix.carnet) t += ca === true ? ' Les ordres du carnet accompagnent le mouvement.' : ca === false ? ' Le carnet n’accompagne pas le mouvement.' : ' Carnet sans position nette.'; dire('ma|' + e.id, t + ' Règle non prouvée.'); }
      else if (e.type === 'fausse' && E.voix.cassure) dire('ma|' + e.id, `Retour du prix ${e.dir > 0 ? 'au-dessus' : 'sous'} la MA 200 à ${px} : fausse cassure. Règle non prouvée.`);
      else if (e.type === 'rebond' && E.voix.rebond) { const conf = vr != null && vr > 1.5 ? 'confirmé par le volume' : ca === true ? 'confirmé par le carnet' : 'non confirmé par le volume ni le carnet'; dire('ma|' + e.id, `Rebond ${e.dir > 0 ? 'sur la MA 200 par le haut, appui' : 'sous la MA 200, résistance'} à ${px}, ${conf}. Règle non prouvée.`); }
    }
  }
  function alertesSessions() {
    if (!E.voix.sessions) return; const d = new Date(maintenant()), p = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false }).formatToParts(d), o = Object.fromEntries(p.map(x => [x.type, x.value])), min = +o.hour * 60 + +o.minute, jour = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(d);
    if (/^(sam|dim)/i.test(o.weekday)) return;
    for (const s of SEANCES) for (const [bord, m, verbe] of [['de', s.de, 'Ouverture'], ['a', s.a, 'Fermeture']]) if (min >= m && min < m + 3) dire(`s|${jour}|${s.id}|${bord}`, `${verbe} de la séance ${s.id === 'ny' ? 'de New York' : s.id === 'asie' ? 'd’Asie' : 'de Londres'}, ${String(Math.floor(m / 60)).padStart(2, '0')} heures ${String(m % 60).padStart(2, '0')}, heure de Paris.`);
  }
  /* ── setup A+ ── */
  const emises = () => E.reg.filter(r => r.kind === 'alerte');
  function stat12() { const res = E.reg.filter(r => r.kind === 'resultat' && r.h === 12), g = res.filter(r => r.Rnet > 0).length; return { n: res.length, reussite: res.length ? g / res.length : null }; }
  function aplus(I) {
    const { B, prep, sm } = I; if (!B || !prep || !sm || B.length < 400) return; const n = B.length, ctx = { B, E: ER.emaSerie(B), A: ER.atrSerie(B), h4: MA.tendanceH4(B), prep, swings: sm.h1.swings };
    const evs = ER.evenements(B, { depuisI: n - 1, E: ctx.E, A: ctx.A }), ann = (typeof window !== 'undefined' && window.__or && window.__or.contexte) ? (window.__or.contexte.etat().evenements || []).filter(e => /high/i.test(e.impact || '')).map(e => e.t) : null;
    for (const ev of evs) {
      const id = 'ap|' + ev.id; if (E.reg.some(r => r.id === id)) continue; const ca = carnetAccompagne(ev.dir), ev2 = AP.evaluer(ctx, ev, { carnet: ca === true, annonces: ann }), tCl = B[ev.i].t + H;
      if (!ev2.reunies || !AP.permis(emises(), tCl)) continue;
      const pl = AP.plan(B, ctx.A, ev.i, ev.dir), al = { kind: 'alerte', id, numero: emises().length + 1, t: B[ev.i].t, tCloture: tCl, type: ev.type, dir: ev.dir, plan: pl, conditions: ev2.conditions.map(c => c.ok), notee: maintenant() }; E.reg.push(al);
      E.fleches.push({ t: B[ev.i].t, p: ev.dir > 0 ? B[ev.i].l : B[ev.i].h, dir: ev.dir, id }); E.derniere = { ...al, texte: AP.phrase({ ev, plan: pl }, stat12()) }; try { parler(E.derniere.texte); } catch (e) { /* */ } carte();
    }
    for (const a of emises()) for (const h of AP.P.horizons) { if (E.reg.some(r => r.kind === 'resultat' && r.id === a.id && r.h === h)) continue; const i = B.findIndex(b => b.t === a.t); if (i < 0) continue; const r = AP.resultat(B, ctx.A, i, a.dir, h); if (r) E.reg.push({ kind: 'resultat', id: a.id, h, R0: r.R0, Rnet: r.R0 - 1.5 * 0.67 / r.risque, stoppe: r.stoppe, t: maintenant() }); }
    if (E.reg.length > 1000) E.reg.splice(0, E.reg.length - 1000); ecrire(CLE_AP, E.reg);
  }
  function carte() {
    let el = q('[data-ray-aplus]'); if (!el && racine) { el = document.createElement('aside'); el.className = 'tor-ray-aplus'; el.dataset.rayAplus = ''; el.hidden = true; const g = q('.tor-graph'); (g || racine).appendChild(el); el.addEventListener('click', ev => { const b = ev.target.closest('[data-a="ray-copier-aplus"]'); if (b && E.derniere) { try { navigator.clipboard.writeText(texteCopie(E.derniere)); b.textContent = 'Copié'; } catch (e) { /* */ } } else if (ev.target.closest('[data-a="ray-fermer-aplus"]')) el.hidden = true; }); }
    if (!el) return; const a = E.derniere; if (!a) { el.hidden = true; return; } const s = stat12();
    el.hidden = false; el.innerHTML = `<header><b>Setup A+ · ${a.dir > 0 ? 'achat' : 'vente'}</b> <small>${esc(hp(a.tCloture))}</small><button type="button" data-a="ray-fermer-aplus" aria-label="Fermer">✕</button></header><p>Entrée vers ${nb(a.plan.entree)} · stop ${nb(a.plan.stop)} · taille ${nb(a.plan.taille, 2)} once (0,25 % de risque sur 10 000 $ = ${nb(a.plan.risque$)} $)</p><p><small>${s.n >= 30 ? `Statistique réelle : ${s.n} alertes mesurées, ${Math.round(s.reussite * 100)} % de réussite à 12 bougies.` : `Règle non prouvée : ${s.n} alerte${s.n > 1 ? 's' : ''} mesurée${s.n > 1 ? 's' : ''} à 12 bougies, il en faut 30.`} Rejeu 2026 : voir le panneau. Ce n’est pas un ordre.</small></p><button type="button" data-a="ray-copier-aplus">Copier</button>`;
  }
  const texteCopie = a => `A+ ${a.dir > 0 ? 'ACHAT' : 'VENTE'} XAU/USD · entrée ~${nb(a.plan.entree)} · stop ${nb(a.plan.stop)} · taille ${nb(a.plan.taille, 2)} oz (risque ${nb(a.plan.risque$)} $ = 0,25 % de 10 000 $) · ${hp(a.tCloture)} · règle non prouvée, pas un ordre`;
  /* ── rejeu 2026 (statique) ── */
  let rejeu = null; async function chargerRejeu() { try { const r = await fetch(new URL('./aplus-rejeu-2026.json', import.meta.url).href, { cache: 'no-store' }); if (r.ok) rejeu = await r.json(); } catch (e) { /* indisponible */ } rendre(); }
  function rendre() {
    const el = q('[data-ray-aplus-corps]') || (() => { const x = document.createElement('div'); x.dataset.rayAplusCorps = ''; if (sec) sec.appendChild(x); return x; })(); const s = stat12();
    const reel = `<p class="tor-doux"><b>Setup A+</b> (règle aplus-v1 figée, non prouvée) : ${emises().length} alerte${emises().length > 1 ? 's' : ''} en direct depuis l’ouverture du registre ; ${s.n >= 30 ? `${Math.round(s.reussite * 100)} % de réussite à 12 bougies (n = ${s.n}).` : `pas assez de données (${s.n} mesurée${s.n > 1 ? 's' : ''}, il en faut 30).`} Maximum 3 par jour, 60 minutes entre deux.</p>`;
    const rj = rejeu ? `<details><summary>Rejeu 2026 : ${rejeu.alertes.length} alertes sur ${rejeu.nEvenements} événements (calculé le ${esc(rejeu.calcule)})</summary><p class="tor-doux">Condition 3 (carnet / delta) non évaluable sur l’historique, annonces non évaluées. Grosses cassures de 2026 avec alerte : ${rejeu.grosses.parmiElles} sur ${rejeu.grosses.n}. Cassure à la baisse du 11 novembre : ${rejeu.novembre.some(x => x.alerte) ? 'alerte donnée' : 'pas d’alerte'}. Taux de réussite à 12 bougies : ${Math.round((rejeu.stats[12].reussite || 0) * 100)} % (n = ${rejeu.stats[12].n}, R net moyen ${rejeu.stats[12].esperance.toFixed(2).replace('.', ',')}) : pas assez de données.</p><ul class="tor-ray-evts">${rejeu.alertes.map(a => `<li>#${a.n} ${esc(a.date)} ${esc(a.sens)} : R net 6 / 12 / 24 = ${[a.R6, a.R12, a.R24].map(x => x == null ? '—' : x.toFixed(2).replace('.', ',')).join(' / ')}</li>`).join('')}</ul></details>` : '';
    el.innerHTML = reel + rj;
  }
  /* ── voix et texte ── */
  function commande(texte) {
    const n = String(texte || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'`]/g, ' ').replace(/[^a-z0-9+ ?]/g, ' ').replace(/\s+/g, ' ').trim();
    if (/\b(active|allume|reactive|remets?) les alertes vocales?\b/.test(n)) { E.voix.actif = true; ecrire(CLE_V, E.voix); majOutils(); return 'Alertes vocales activées : cassure, retour et rebond de la MA 200, carnet, séances. Règles non prouvées.'; }
    if (/\b(desactive|coupe|eteins|arrete) les alertes vocales?\b/.test(n)) { E.voix.actif = false; ecrire(CLE_V, E.voix); majOutils(); return 'Alertes vocales coupées.'; }
    if (/\blecture epuree\b|\bmode epure des outils\b/.test(n)) { epure(); return 'Lecture épurée : MA 200, golden zone et niveaux de la veille et de la semaine.'; }
    if (/\b(affiche|montre|active|ouvre) (tous )?les outils\b|\btout afficher\b/.test(n)) { for (const o of OUTILS) poser(o.cle, true); majOutils(); return 'Tous les outils sont affichés.'; }
    const m = n.match(/\b(affiche|montre|active|masque|cache|desactive|enleve)\b.*\b(vwap|profil de volume|sessions?|seances?|offre et demande|zones? d offre|golden zone|niveaux? de la veille|ema 300|ma ?200|boites?)\b/);
    if (m) { const on = /affiche|montre|active/.test(m[1]), mot = m[2], cle = /vwap/.test(mot) ? 'vwap' : /profil/.test(mot) ? 'profil' : /session|seance/.test(mot) ? 'seances' : /offre/.test(mot) ? 'ictOb' : /golden/.test(mot) ? 'rayGolden' : /veille/.test(mot) ? 'veilleSemaine' : /boite/.test(mot) ? 'rayBoites' : 'rayMa'; if (/ema 300/.test(mot)) { strategie.reglage('moyenne', on ? 'vema300' : 'ma200'); return on ? 'EMA 300 pondérée par le volume affichée.' : 'MA 200 simple affichée.'; } poser(cle, on); majOutils(); return `${OUTILS.find(o => o.cle === cle).nom} : ${on ? 'affiché' : 'masqué'}.`; }
    if (/\bgolden zone\b/.test(n)) { const g = strategie.golden(); return g ? `${g.cote === 'achat' ? 'Golden zone d’achat' : 'Golden zone de vente'} entre ${nb(g.bas)} et ${nb(g.haut)}, ${g.invalide ? 'invalidée' : g.dansLaZone ? 'le prix est dedans' : 'le prix est à ' + nb(Math.abs(g.prix - (g.bas + g.haut) / 2)) + ' dollars de son centre'}. Dernier élan de ${g.elan.atr.toFixed(1).replace('.', ',')} ATR. Règle non prouvée.` : 'Pas de golden zone : le dernier élan fait moins de 2 ATR.'; }
    if (/\b(a plus|a\+|setup a)\b/.test(n)) { const s = stat12(), d = E.derniere; return `${d ? `Dernier setup A plus : ${d.dir > 0 ? 'achat' : 'vente'} le ${hp(d.tCloture)}, entrée ${nb(d.plan.entree)}, stop ${nb(d.plan.stop)}.` : 'Aucun setup A plus depuis l’ouverture du registre.'} ${s.n >= 30 ? `Statistique réelle : ${s.n} alertes, ${Math.round(s.reussite * 100)} % de réussite à 12 bougies.` : `Règle non prouvée : ${s.n} alerte${s.n > 1 ? 's' : ''} mesurée${s.n > 1 ? 's' : ''}, il en faut 30.`} Le rejeu 2026 compte ${rejeu ? rejeu.alertes.length : 'un nombre inconnu de'} alertes. Ce n’est pas un ordre.`; }
    return null;
  }
  function surMaj() { try { const I = strategie.interne(); if (!I.B || !I.res) return; const cle = I.B[I.B.length - 1].t; if (E.dernierBar !== cle) { E.dernierBar = cle; alertesMa(I); aplus(I); } majOutils(); } catch (e) { console.warn('trading actif :', e.message); } }
  strategie.surMaj(surMaj); majOutils(); carte(); rendre();
  let minuterie = null; if (auto) { chargerRejeu(); minuterie = setInterval(() => { try { alertesSessions(); } catch (e) { /* */ } }, 30000); }
  return { commande, epure, poser, fleches: () => E.fleches.slice(), registre: () => E.reg.slice(), alertesMa, alertesSessions, stat12, etat: () => ({ voix: { ...E.voix }, derniere: E.derniere, rejeu }), detruire() { clearInterval(minuterie); } };
}
