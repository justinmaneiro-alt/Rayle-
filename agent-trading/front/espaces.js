/* ═════════════ ESPACES DE LA PLATEFORME : Investissement (long terme) · Trading actif (or) · Capital (les deux poches) ═════════════
   Une barre commune, un seul thème Rayle / Jarvis ; chaque espace est pilotable à la voix (window.__espaces.commande, branché sur TableauOr.commande). Aucun ordre n'est jamais envoyé. */
const NOMS = { investissement: 'Investissement', trading: 'Trading actif', capital: 'Capital' };
export function monterEspaces({ trading, parler = () => {} } = {}) {
  const E = { actif: 'trading', invest: null, capital: null }, barre = document.createElement('nav'); barre.className = 'esp-barre'; barre.setAttribute('aria-label', 'Espaces');
  barre.innerHTML = `<b class="esp-marque">Rayle</b>${Object.entries(NOMS).map(([k, n]) => `<button type="button" data-espace="${k}">${n}</button>`).join('')}`; document.body.insertBefore(barre, document.body.firstChild);
  const zones = {}; for (const k of ['investissement', 'capital']) { const d = document.createElement('div'); d.className = 'esp-zone'; d.dataset.zone = k; d.hidden = true; trading.parentNode.insertBefore(d, trading.nextSibling); zones[k] = d; }
  async function investissement() { if (!E.invest) { const m = await import('./invest/espace.js'); E.invest = m.monterInvestissement(zones.investissement, { parler }); } return E.invest; }
  async function capital() { if (!E.capital) { const m = await import('./invest/capital.js'); E.capital = m.monterCapital(zones.capital, { investissement: await investissement(), allerTrading: async w => { await aller('trading'); if (w === 'cot') { const s = document.querySelector('[data-contexte]'); if (s) s.scrollIntoView({ behavior: 'smooth' }); } } }); } else E.capital.rendre(); return E.capital; }
  async function aller(k) {
    if (!NOMS[k]) return; E.actif = k; trading.hidden = k !== 'trading'; for (const z of Object.keys(zones)) zones[z].hidden = z !== k;
    for (const b of barre.querySelectorAll('[data-espace]')) { b.classList.toggle('actif', b.dataset.espace === k); b.setAttribute('aria-pressed', String(b.dataset.espace === k)); }
    if (k === 'investissement') await investissement(); else if (k === 'capital') await capital();
    try { history.replaceState(null, '', '#' + k); } catch (e) { /* */ }
  }
  barre.addEventListener('click', ev => { const b = ev.target.closest('[data-espace]'); if (b) aller(b.dataset.espace); });
  async function commande(texte) {
    const n = String(texte || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'`]/g, ' ').replace(/\s+/g, ' ').trim();
    if (/\b(ouvre|affiche|va|passe)\b.*\b(trading actif|espace trading)\b/.test(n)) { await aller('trading'); return 'Espace Trading actif : l’or, les concepts ICT, le carnet, la golden zone et les alertes. Règles non prouvées.'; }
    if (/\b(ouvre|affiche|va|passe)\b.*\bcapital\b/.test(n)) { await aller('capital'); const c = E.capital.calculer(); return `Rayle Capital : poche investissement ${Math.round(c.investissement.valeur)} euros, risque ouvert du trading ${c.trading.risqueOuvert.toFixed(0)} dollars. Ce n’est pas un conseil financier.`; }
    if (/\b(ouvre|affiche|va|passe)\b.*\binvestissement\b|\betude de marche\b|\bplan dca\b|\binterets composes\b|\bmon portefeuille\b|\bfiche (de|d|du) /.test(n)) { const inv = await investissement(); await aller('investissement'); return inv.commande(n) || 'Espace Investissement : étude de marché, plan DCA, intérêts composés et portefeuille. Ceci n’est pas un conseil financier.'; }
    return null;
  }
  const depart = (location.hash || '').slice(1); aller(NOMS[depart] ? depart : (new URLSearchParams(location.search).get('espace') || 'trading'));
  return { aller, commande, etat: () => ({ actif: E.actif }), investissement, capital };
}
