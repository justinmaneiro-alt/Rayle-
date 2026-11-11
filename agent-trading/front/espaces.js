/* ═════════════ LE TERMINAL : onglets du haut + sélecteur d'instruments ═════════════
   Une seule application, « Terminal ». Onglets : Graphique · Actualités · COT · Santé du marché · Institutions · Calendrier · Journal · Capital.
   (« Investissement » reste accessible depuis Capital et à la voix.) Le sélecteur change l'instrument du graphique (l'or par défaut) : la vue est
   rechargée, car les modules du moteur lisent leur instrument au chargement. Pilotable à la voix (window.__espaces.commande). Aucun ordre n'est jamais envoyé. */
import { INSTRUMENTS, instrument, actifCourant, instrumentDepuisTexte, CLE_ACTIF, avertissement } from './or/instruments.js';
export const NOMS = { trading: 'Graphique', actualites: 'Actualités', cot: 'COT', sante: 'Santé du marché', institutions: 'Institutions', calendrier: 'Calendrier', journal: 'Journal', capital: 'Capital' };
const VUES_TRADING = new Set(['trading', 'journal']);
const ALIAS = { graphique: 'trading', trading: 'trading', 'trading actif': 'trading', actualite: 'actualites', actualites: 'actualites', cot: 'cot', sante: 'sante', institutions: 'institutions', institution: 'institutions', calendrier: 'calendrier', journal: 'journal', capital: 'capital', investissement: 'investissement' };
export function monterEspaces({ trading, parler = () => {} } = {}) {
  const ACTIF = actifCourant(), INST = instrument(ACTIF);
  const E = { actif: 'trading', invest: null, capital: null, pages: null }, barre = document.createElement('nav'); barre.className = 'esp-barre'; barre.setAttribute('aria-label', 'Terminal');
  barre.innerHTML = `<b class="esp-marque">Terminal</b>${Object.entries(NOMS).map(([k, n]) => `<button type="button" data-espace="${k}">${n}</button>`).join('')}
    <label class="esp-instr-l">Instrument <select class="esp-instr" data-instrument aria-label="Instrument">${INSTRUMENTS.map(i => `<option value="${i.id}"${i.id === ACTIF ? ' selected' : ''}>${i.nom}</option>`).join('')}</select></label>
    <small class="esp-src" data-instrument-source></small>`;
  document.body.insertBefore(barre, document.body.firstChild);
  barre.querySelector('[data-instrument-source]').textContent = `${INST.court} · ${INST.source} · ${INST.retard}`;
  const zones = {}; for (const k of ['investissement', 'actualites', 'cot', 'sante', 'institutions', 'calendrier', 'capital']) { const d = document.createElement('div'); d.className = 'esp-zone' + (['investissement', 'capital'].includes(k) ? '' : ' pg inv'); d.dataset.zone = k; d.hidden = true; trading.parentNode.insertBefore(d, trading.nextSibling); zones[k] = d; }
  const ensureCss = () => { if (!document.querySelector('link[data-pages-css]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = new URL('./pages/pages.css', import.meta.url).href; l.dataset.pagesCss = ''; document.head.appendChild(l); } };
  ensureCss();
  async function investissement() { if (!E.invest) { const m = await import('./invest/espace.js'); E.invest = m.monterInvestissement(zones.investissement, { parler }); } return E.invest; }
  async function capital() { if (!E.capital) { const m = await import('./invest/capital.js'); E.capital = m.monterCapital(zones.capital, { investissement: await investissement(), allerTrading: async w => { await aller('trading'); if (w === 'cot') { const s = document.querySelector('[data-contexte]'); if (s) s.scrollIntoView({ behavior: 'smooth' }); } } }); const p = document.createElement('p'); p.className = 'pg-barre'; p.innerHTML = '<button type="button" data-espace-aller="investissement">Investissement (long terme)</button>'; zones.capital.insertBefore(p, zones.capital.firstChild); } else E.capital.rendre(); return E.capital; }
  async function pages() { if (!E.pages) { const m = await import('./pages/pages-ui.js'); E.pages = m.monterPages({ zones, parler, aller: k => aller(k), actif: () => ACTIF }); } return E.pages; }
  async function aller(k0) {
    const k = ALIAS[k0] || k0; if (!NOMS[k] && k !== 'investissement') return;
    E.actif = k; trading.hidden = !VUES_TRADING.has(k); trading.dataset.vue = k === 'journal' ? 'journal' : 'graphique';
    for (const z of Object.keys(zones)) zones[z].hidden = z !== k;
    for (const b of barre.querySelectorAll('[data-espace]')) { b.classList.toggle('actif', b.dataset.espace === k); b.setAttribute('aria-pressed', String(b.dataset.espace === k)); }
    if (k === 'investissement') await investissement(); else if (k === 'capital') await capital(); else if (zones[k] && !VUES_TRADING.has(k)) { const P = await pages(); await P.ouvrir(k); }
    try { history.replaceState(null, '', location.pathname + location.search + '#' + k); } catch (e) { /* */ }
    window.dispatchEvent(new CustomEvent('terminal:onglet', { detail: { onglet: k } }));
  }
  function changerInstrument(id) {
    if (!INSTRUMENTS.some(i => i.id === id) || id === ACTIF) return false;
    try { localStorage.setItem(CLE_ACTIF, id); } catch (e) { /* */ }
    const u = new URL(location.href); u.searchParams.set('actif', id); location.href = u.toString(); return true;
  }
  barre.addEventListener('click', ev => { const b = ev.target.closest('[data-espace]'); if (b) aller(b.dataset.espace); });
  barre.querySelector('[data-instrument]').addEventListener('change', ev => changerInstrument(ev.target.value));
  document.addEventListener('click', ev => { const b = ev.target.closest('[data-espace-aller]'); if (b) aller(b.dataset.espaceAller); });
  async function commande(texte) {
    const n = String(texte || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'`]/g, ' ').replace(/\s+/g, ' ').trim();
    const P = await pages(), r = await P.commande(texte); if (r) return r;
    const inst = instrumentDepuisTexte(n);
    if (inst && /\b(passe|mets?|met|bascule|affiche|ouvre|va|charge)\b/.test(n) && !/\b(cot|sante|institutions?|calendrier|journal|capital|investissement|dca|fiche|etude)\b/.test(n)) {
      if (inst === ACTIF) return `Le graphique affiche déjà ${instrument(inst).long}.`;
      setTimeout(() => changerInstrument(inst), 400); return `Je passe sur ${instrument(inst).long}.`;
    }
    if (/\b(ouvre|affiche|va|passe)\b.*\b(graphique|trading actif|espace trading)\b/.test(n)) { await aller('trading'); return `Graphique de ${INST.long}. Les règles scellées ne sont pas prouvées.`; }
    if (/\b(ouvre|affiche|va|passe)\b.*\bjournal\b/.test(n)) { await aller('journal'); return 'Journal de trades, gardien et risque prop.'; }
    if (/\b(ouvre|affiche|va|passe)\b.*\bcapital\b/.test(n)) { await aller('capital'); const c = E.capital.calculer(); return `Rayle Capital : poche investissement ${Math.round(c.investissement.valeur)} euros, risque ouvert du trading ${c.trading.risqueOuvert.toFixed(0)} dollars. Ce n’est pas un conseil financier.`; }
    const nav = /\b(ouvre|affiche|montre|va|passe)\b/.test(n) && Object.keys(ALIAS).find(a => new RegExp('\\b' + a + '\\b').test(n));
    if (nav && ALIAS[nav] !== 'investissement') { await aller(ALIAS[nav]); return `${NOMS[ALIAS[nav]]} ouvert.`; }
    if (/\b(ouvre|affiche|va|passe)\b.*\binvestissement\b|\betude de marche\b|\bplan dca\b|\binterets composes\b|\bmon portefeuille\b|\bfiche (de|d|du) /.test(n)) { const inv = await investissement(); await aller('investissement'); return inv.commande(n) || 'Espace Investissement : étude de marché, plan DCA, intérêts composés et portefeuille. Ceci n’est pas un conseil financier.'; }
    return null;
  }
  const bandeau = avertissement(ACTIF); if (bandeau) { const p = document.createElement('p'); p.className = 'esp-avert'; p.dataset.avertInstrument = ''; p.textContent = bandeau; barre.insertAdjacentElement('afterend', p); }
  const h = (location.hash || '').slice(1);
  aller(NOMS[h] || h === 'investissement' ? h : (NOMS[ALIAS[h]] ? ALIAS[h] : (new URLSearchParams(location.search).get('espace') || 'trading')));
  return { aller, commande, changerInstrument, instrument: () => ({ ...INST }), etat: () => ({ actif: E.actif, instrument: ACTIF }), investissement, capital, pages,
    instantane: async nom => { const P = await pages(); return P.instantane(nom); }, instantanes: () => (E.pages ? E.pages.instantanes() : {}) };
}
