/* ═════════════ TRADING ACTIF (OR) : panneau Outils, alertes vocales de séances ═════════════
   Rayle lit, alerte et propose : AUCUN ordre n'est jamais envoyé. Toute règle de trading affiche « non prouvée » : aucun test contre le hasard (Holm) n'est passé (voir recherche-or/).
   Panneau Outils : interrupteurs des couches (par défaut : MA200, golden zone, niveaux de la veille et de la semaine) ; moyenne MA200 ou EMA300 pondérée par le volume.
   Alertes vocales : ouverture et fermeture des séances (heure de Paris). */
import { SEANCES } from './institutionnel-calcul.js';
const CLE_V = 'rayle_or_alertes_voix', H = 3600e3;
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
  const E = { voix: { actif: true, cassure: true, rebond: true, carnet: true, sessions: true, ...lire(CLE_V, {}) }, dits: new Set(lire(CLE_V + '_dits', [])), dernierBar: null, derniereSession: {}, fleches: [] };
  const q = s => racine && racine.querySelector(s);
  /* ── panneau Outils ── */
  const sec = q('[data-rayle]');
  if (sec && !q('[data-ray-outils]')) {
    const d = document.createElement('details'); d.className = 'tor-ray-outils'; d.dataset.rayOutils = ''; d.open = true;
    d.innerHTML = `<summary><b>Outils</b> <small>règles de trading : non prouvées</small></summary><div class="tor-ray-outils-corps">${OUTILS.map(o => `<label><input type="checkbox" data-ray-outil="${o.cle}"> ${esc(o.nom)}</label>`).join('')}
      <label>Moyenne <select data-ray-moyenne><option value="ma200">MA200 (simple, H1)</option><option value="vema300">EMA300 pondérée par le volume</option></select></label>
      <div class="tor-ctx-actions"><button type="button" class="tor-gb" data-a="ray-epure-defaut">Lecture épurée (MA200 + golden zone + niveaux de la veille)</button><button type="button" class="tor-gb" data-a="ray-tout-outils">Tout afficher</button></div>
      <label><input type="checkbox" data-ray-voix="actif"> Alertes vocales</label> <small class="tor-doux">ouverture et fermeture des séances (heure de Paris)</small></div>`;
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
  function alertesSessions() {
    if (!E.voix.sessions) return; const d = new Date(maintenant()), p = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false }).formatToParts(d), o = Object.fromEntries(p.map(x => [x.type, x.value])), min = +o.hour * 60 + +o.minute, jour = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(d);
    if (/^(sam|dim)/i.test(o.weekday)) return;
    for (const s of SEANCES) for (const [bord, m, verbe] of [['de', s.de, 'Ouverture'], ['a', s.a, 'Fermeture']]) if (min >= m && min < m + 3) dire(`s|${jour}|${s.id}|${bord}`, `${verbe} de la séance ${s.id === 'ny' ? 'de New York' : s.id === 'asie' ? 'd’Asie' : 'de Londres'}, ${String(Math.floor(m / 60)).padStart(2, '0')} heures ${String(m % 60).padStart(2, '0')}, heure de Paris.`);
  }
  /* ── voix et texte ── */
  function commande(texte) {
    const n = String(texte || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'`]/g, ' ').replace(/[^a-z0-9+ ?]/g, ' ').replace(/\s+/g, ' ').trim();
    if (/\b(active|allume|reactive|remets?) les alertes vocales?\b/.test(n)) { E.voix.actif = true; ecrire(CLE_V, E.voix); majOutils(); return 'Alertes vocales activées : ouverture et fermeture des séances.'; }
    if (/\b(desactive|coupe|eteins|arrete) les alertes vocales?\b/.test(n)) { E.voix.actif = false; ecrire(CLE_V, E.voix); majOutils(); return 'Alertes vocales coupées.'; }
    if (/\blecture epuree\b|\bmode epure des outils\b/.test(n)) { epure(); return 'Lecture épurée : MA 200, golden zone et niveaux de la veille et de la semaine.'; }
    if (/\b(affiche|montre|active|ouvre) (tous )?les outils\b|\btout afficher\b/.test(n)) { for (const o of OUTILS) poser(o.cle, true); majOutils(); return 'Tous les outils sont affichés.'; }
    const m = n.match(/\b(affiche|montre|active|masque|cache|desactive|enleve)\b.*\b(vwap|profil de volume|sessions?|seances?|offre et demande|zones? d offre|golden zone|niveaux? de la veille|ema 300|ma ?200|boites?)\b/);
    if (m) { const on = /affiche|montre|active/.test(m[1]), mot = m[2], cle = /vwap/.test(mot) ? 'vwap' : /profil/.test(mot) ? 'profil' : /session|seance/.test(mot) ? 'seances' : /offre/.test(mot) ? 'ictOb' : /golden/.test(mot) ? 'rayGolden' : /veille/.test(mot) ? 'veilleSemaine' : /boite/.test(mot) ? 'rayBoites' : 'rayMa'; if (/ema 300/.test(mot)) { strategie.reglage('moyenne', on ? 'vema300' : 'ma200'); return on ? 'EMA 300 pondérée par le volume affichée.' : 'MA 200 simple affichée.'; } poser(cle, on); majOutils(); return `${OUTILS.find(o => o.cle === cle).nom} : ${on ? 'affiché' : 'masqué'}.`; }
    if (/\bgolden zone\b/.test(n)) { const g = strategie.golden(); return g ? `${g.cote === 'achat' ? 'Golden zone d’achat' : 'Golden zone de vente'} entre ${nb(g.bas)} et ${nb(g.haut)}, ${g.invalide ? 'invalidée' : g.dansLaZone ? 'le prix est dedans' : 'le prix est à ' + nb(Math.abs(g.prix - (g.bas + g.haut) / 2)) + ' dollars de son centre'}. Dernier élan de ${g.elan.atr.toFixed(1).replace('.', ',')} ATR. Règle non prouvée.` : 'Pas de golden zone : le dernier élan fait moins de 2 ATR.'; }
    return null;
  }
  function surMaj() { try { const I = strategie.interne(); if (!I.B || !I.res) return; const cle = I.B[I.B.length - 1].t; if (E.dernierBar !== cle) { E.dernierBar = cle; } majOutils(); } catch (e) { console.warn('trading actif :', e.message); } }
  strategie.surMaj(surMaj); majOutils();
  let minuterie = null; if (auto) { minuterie = setInterval(() => { try { alertesSessions(); } catch (e) { /* */ } }, 30000); }
  return { commande, epure, poser, alertesSessions, etat: () => ({ voix: { ...E.voix } }), detruire() { clearInterval(minuterie); } };
}
