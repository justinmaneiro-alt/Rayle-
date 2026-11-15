/* ═════════════ FICHE D'ORDRE XTB : à recopier dans xStation (AUCUN ordre n'est envoyé : XTB n'a plus d'API) ═════════════
   Pour chaque signal : nom XTB de l'instrument, sens, entrée, stop, objectif, rapport gain/risque, et la TAILLE EN LOTS calculée à partir de TON capital, de TON risque par trade (Réglages du Portefeuille,
   synchronisés entre appareils) et de la valeur du point mesurée sur TES positions (ou saisie à la main). Rien n'est deviné : sans capital ou sans valeur du point, la fiche le dit au lieu d'inventer. */
export const NOMS_XTB = Object.freeze({ or: 'GOLD', argent: 'SILVER', us100: 'US100', us500: 'US500', btc: 'BITCOIN', sol: 'SOLANA', petrole: 'OIL.WTI' });
const arrondiBas = (v, pas) => Math.floor(v / pas + 1e-9) * pas;
const decimales = pas => { const s = String(pas); return s.includes('.') ? s.split('.')[1].length : 0; };

/* Calcul PUR. signal = { dir, entree, sl, tp, rr, ... } ; reglages = { capital, risquePct, valeursPoint, xtbNoms } ; vp = valeursDuPoint(...) ({ TICKER: { k } }) ; pas = { TICKER: plus petit lot observé } */
export function calculerFiche(signal, { actif, reglages = {}, vp = {}, pas = {}, decalage = 0 } = {}) {
  const nom = (reglages.xtbNoms && reglages.xtbNoms[actif]) || NOMS_XTB[actif] || null, manques = [];
  if (!nom) manques.push('nom XTB de l’instrument inconnu pour « ' + actif + ' » (à saisir dans Réglages)');
  const kReg = reglages.valeursPoint && Number(reglages.valeursPoint[nom]), k = kReg > 0 ? kReg : (vp[nom] && vp[nom].k) || null;
  if (!k) manques.push('valeur du point de ' + (nom || actif) + ' inconnue (pas assez de positions pour la mesurer : à saisir dans Portefeuille › Réglages)');
  const capital = Number(reglages.capital) > 0 ? Number(reglages.capital) : null, risquePct = Number(reglages.risquePct) > 0 ? Number(reglages.risquePct) : 1;
  if (!capital) manques.push('capital du compte non renseigné (Portefeuille › Réglages)');
  const d = signal.dir, entree = signal.entree + decalage, sl = signal.sl + decalage, tp = signal.tp + decalage, distance = Math.abs(entree - sl), p = pas[nom] || 0.01;
  let lots = null, risqueReel = null, risqueVoulu = null, trop = false;
  if (k && capital && distance > 0) {
    risqueVoulu = capital * risquePct / 100; const brut = risqueVoulu / (distance * k); lots = arrondiBas(brut, p);
    if (lots < p) { lots = p; trop = true; } risqueReel = lots * distance * k; lots = +lots.toFixed(decimales(p));
  }
  return { nom, sens: d > 0 ? 'Acheter' : 'Vendre', entree, sl, tp, rr: signal.rr, distance, k, capital, risquePct, lots, pasLot: p, risqueVoulu, risqueReel, tropPetit: trop, gainVise: lots && k ? lots * Math.abs(tp - entree) * k : null, decalage, manques };
}
const f2 = v => (Number.isFinite(v) ? v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/[  ]/g, ' ') : '—');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/* texte à copier (une ligne par champ, valeurs avec le point décimal comme dans xStation) */
export function texteFiche(F) {
  if (!F.nom) return 'Fiche incomplète : ' + F.manques.join(' ; ');
  const n = v => (Number.isFinite(v) ? v.toFixed(2) : '?');
  return `${F.nom} · ${F.sens} · ${F.lots != null ? F.lots + ' lot' : 'taille à calculer'} · entrée ${n(F.entree)} · stop loss ${n(F.sl)} · take profit ${n(F.tp)} · R/R ${F.rr}`;
}
export function htmlFiche(F, { note = '' } = {}) {
  const manque = F.manques.length ? `<p class="tp-doux" role="status">À compléter : ${F.manques.map(esc).join(' ; ')}.</p>` : '';
  return `<table><tr><th>Instrument XTB</th><td><b>${esc(F.nom || '?')}</b></td></tr><tr><th>Sens</th><td><b>${esc(F.sens)}</b> (ordre au marché ou limite à l’entrée)</td></tr><tr><th>Entrée</th><td>${f2(F.entree)}</td></tr><tr><th>Stop loss</th><td>${f2(F.sl)} <small>(${f2(F.distance)} points)</small></td></tr><tr><th>Take profit</th><td>${f2(F.tp)} <small>(R/R ${F.rr})</small></td></tr>
    <tr><th>Taille</th><td>${F.lots != null ? `<b>${esc(String(F.lots).replace('.', ','))} lot</b> <small>pour risquer ${f2(F.risqueVoulu)} € (${esc(String(F.risquePct).replace('.', ','))} % de ${f2(F.capital)} €)${F.tropPetit ? ' ; le lot minimal dépasse ce risque : risque réel ' + f2(F.risqueReel) + ' €' : ' ; risque réel ' + f2(F.risqueReel) + ' €'}</small>` : '—'}</td></tr>${F.gainVise != null ? `<tr><th>Gain visé</th><td>${f2(F.gainVise)} €</td></tr>` : ''}</table>${manque}${note ? `<p class="tp-doux">${esc(note)}</p>` : ''}
    <pre class="tp-copie" data-copie>${esc(texteFiche(F))}</pre><p class="tp-doux">À recopier dans xStation : l’appli n’envoie aucun ordre. Vérifie l’échelle de prix de xStation avant de saisir.</p>`;
}
/* version navigateur : lit le Portefeuille (réglages, valeur du point mesurée, plus petit lot observé) et, pour l'or, le décalage entre le prix au comptant et l'échelle Kraken */
export async function ficheHtml(signal, { actif }) {
  const [{ creerStockageParDefaut }, { creerPortefeuille }, { valeursDuPoint }] = await Promise.all([import('../../agent-trading/front/donnees/couche.js'), import('../portefeuille/stockage.js'), import('../portefeuille/calcul.js')]);
  const L = await creerPortefeuille({ stockage: creerStockageParDefaut() }).charger(), vp = valeursDuPoint(L.fermees), pas = {};
  for (const t of L.fermees) if (t.volume > 0 && (!pas[t.ticker] || t.volume < pas[t.ticker])) pas[t.ticker] = +t.volume.toFixed(4);
  let decalage = 0, note = '';
  if (actif === 'or') { try { const { lireSpotOr, marcheOrOuvert } = await import('./donnees.js'), kr = await (await import('../../agent-trading/front/or/sources-or.js')).tickerKraken(); const spot = await lireSpotOr(); if (marcheOrOuvert() && Number.isFinite(spot.prix) && Number.isFinite(+kr.last)) { decalage = +(spot.prix - +kr.last).toFixed(2); note = `Niveaux convertis pour xStation (GOLD au comptant) : décalage de ${decalage > 0 ? '+' : ''}${decalage} $ par rapport à l’échelle Kraken du signal.`; } else note = 'Marché au comptant fermé : niveaux sur l’échelle Kraken ; à recalculer à l’ouverture.'; } catch (e) { note = 'Décalage au comptant non mesuré : les niveaux sont sur l’échelle Kraken PF_XAUUSD.'; } }
  return htmlFiche(calculerFiche(signal, { actif, reglages: L.reglages || {}, vp, pas, decalage }), { note });
}
