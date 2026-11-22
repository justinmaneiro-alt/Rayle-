/* Fausses données réalistes pour tester les rapports guidés sans réseau (mêmes formes que les vrais outils du cerveau). */
const H = 3600e3, J = 86400e3;
const MAINT = Date.UTC(2026, 10, 22, 14, 5);   // dimanche 22/11/2026 14:05 UTC
export const maintenant = () => MAINT;
function marche(n, pas, fin, base, pente, bruit, volBase) {
  const B = []; let c = base;
  for (let i = 0; i < n; i++) { const t = fin - (n - 1 - i) * pas, o = c, k = Math.sin(i * 1.7) + Math.cos(i * 0.9); c = o + pente + bruit * 0.6 * k; const h = Math.max(o, c) + bruit * (0.5 + Math.abs(Math.sin(i))), l = Math.min(o, c) - bruit * (0.5 + Math.abs(Math.cos(i * 1.3))); B.push({ t, o, h, l, c, v: volBase * (0.7 + Math.abs(Math.sin(i * 0.4))) }); }
  return B;
}
export function fauxPro(id = 'or') {
  const prix0 = id === 'btc' ? 90000 : id === 'dxy' ? 104 : id === 'us100' ? 21000 : 3500, bruit = prix0 * 0.004;
  const j = marche(320, J, Date.UTC(2026, 10, 21), prix0 * 0.9, prix0 * 0.0004, bruit, 1000), h4 = marche(600, 4 * H, Date.UTC(2026, 10, 21, 20), prix0 * 0.96, prix0 * 0.00006, bruit * 0.4, 400), h1 = marche(900, H, Date.UTC(2026, 10, 21, 21), prix0 * 0.98, prix0 * 0.00002, bruit * 0.2, 100);
  /* dernière bougie Daily : pin bar haussière sur un niveau */
  const dernier = j[j.length - 1], px = dernier.c; dernier.o = px; dernier.l = px - bruit * 4; dernier.h = px + bruit * 0.2; dernier.c = px + bruit * 0.1; dernier.v = 2400;
  return { id, nom: id, source: 'faux', t: MAINT - 30 * 60e3, prix: j[j.length - 1].c, tPrix: MAINT - 30 * 60e3, j, h4, h1, m15: [] };
}
const dateIso = t => new Date(t).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
export function fauxAnalyse(id = 'or', D = fauxPro(id)) {
  const prix = D.prix, atrJ = prix * 0.012, atrH = prix * 0.0045, r2 = x => +x.toFixed(2);
  return { actif: id, nom: id, prix: r2(prix), donneesDu: dateIso(D.t), source: 'faux',
    weekly: { tendance: 'haussière', structure: { lecture: 'plus hauts et plus bas hauts (structure haussière)', sens: 1 }, moyenne50Semaines: r2(prix * 0.93), positionMoyenne50: 'au-dessus', derniereBougie: { ouverture: r2(prix * 0.99), haut: r2(prix * 1.01), bas: r2(prix * 0.98) } },
    daily: { tendance: 'haussière', regime: { type: 'tendance', sens: 1, volatilite: 'normale' }, ma200: r2(prix * 0.95), positionMa200: 'au-dessus', ecartMa200Pct: 5.26, structure: { lecture: 'plus hauts et plus bas hauts (structure haussière)', sens: 1 }, atr: r2(atrJ) },
    h4: { tendance: 'haussière', regime: { type: 'tendance', sens: 1, volatilite: 'normale' }, ma200: r2(prix * 0.985), positionMa200: 'au-dessus', ecartMa200Pct: 1.5, structure: { lecture: 'plus hauts et plus bas hauts (structure haussière)', sens: 1 }, atr: r2(atrH) },
    position: { premiumDiscountDaily3Mois: { pct: 70, zone: 'premium (zone chère)' }, premiumDiscountH4: { pct: 55, zone: 'équilibre' },
      auDessus: [{ niveau: 'PDH', prix: r2(prix * 1.006), distancePct: 0.6, distanceEnAtrH4: 1.3 }, { niveau: 'PWH', prix: r2(prix * 1.02), distancePct: 2, distanceEnAtrH4: 4.4 }, { niveau: 'FVG baissier (bas)', prix: r2(prix * 1.035), distancePct: 3.5, distanceEnAtrH4: 7.7 }],
      enDessous: [{ niveau: 'POC H4', prix: r2(prix * 0.995), distancePct: -0.5, distanceEnAtrH4: -1.1 }, { niveau: 'PWL', prix: r2(prix * 0.975), distancePct: -2.5, distanceEnAtrH4: -5.5 }, { niveau: 'PDL', prix: r2(prix * 0.96), distancePct: -4, distanceEnAtrH4: -8.8 }] },
    volumeEtFlux: { actif: id, volumeH4: { volumeRelatifDerniereBougie: 1.4, cvdTendance: 'en hausse', deltaEstime: true } },
    positionnementEtContexte: {}, monRisque: { risque: 'Risque engagé : 1,2 % du capital sur 2 positions, sous ta limite du jour.', portefeuille: 'Deux positions ouvertes, résultat du jour +0,4 %.' } };
}
export function fauxNiveaux(id = 'or', D = fauxPro(id)) {
  const p = D.prix, r2 = x => +x.toFixed(2);
  return { actif: id, prix: r2(p), mesNiveauxTraces: [{ type: 'ligne', unite: 'H4', prix: r2(p * 0.9998) }], volume: { pocH4: r2(p * 0.995), vah: r2(p * 1.004), val: r2(p * 0.986), zonesDeVolume: [r2(p * 0.97), r2(p * 1.01)] },
    reperesIct: [{ nom: 'PDH', prix: r2(p * 1.006) }, { nom: 'PDL', prix: r2(p * 0.96) }, { nom: 'PWH', prix: r2(p * 1.02) }, { nom: 'PWL', prix: r2(p * 0.975) }, { nom: 'Ouverture jour', prix: r2(p * 0.998) }], fvg: [{ sens: 'baissier', bas: r2(p * 1.035), haut: r2(p * 1.04) }],
    bougiesWeekly: [{ date: '2026-11-02', ouverture: r2(p * .96), haut: r2(p * .99), bas: r2(p * .95), cloture: r2(p * .98) }, { date: '2026-11-09', ouverture: r2(p * .98), haut: r2(p * 1.01), bas: r2(p * .97), cloture: r2(p * 1) }, { date: '2026-11-16', ouverture: r2(p * 1), haut: r2(p * 1.02), bas: r2(p * .975), cloture: r2(p * 1.003) }], donneesDu: dateIso(D.t) };
}
export function fauxCot(inst = 'OR', semaines = 200) {
  const serie = []; for (let i = 0; i < semaines; i++) { const t = Date.UTC(2026, 10, 17) - (semaines - 1 - i) * 7 * J, net = Math.round(120000 + 60000 * Math.sin(i / 9) + i * 80), comm = -Math.round(net * 0.9); serie.push({ date: new Date(t).toISOString().slice(0, 10), oi: 480000 + i * 300 + Math.round(15000 * Math.sin(i / 5)), spec: { long: net + 90000, court: 90000, net }, comm: { long: 50000, court: 50000 - comm, net: comm } }); }
  return { inst, libelle: inst === 'EURUSD' ? 'Euro (CME)' : 'Or (COMEX)', nomSpec: 'Fonds spéculatifs (managed money)', nomComm: 'Commerciaux (producteurs et négociants)', source: 'CFTC · faux', serie };
}
export const fauxCalendrier = () => ({ evenements: [
  { date: '2026-11-18T13:30:00Z', title: 'CPI m/m', country: 'USD', impact: 'High', forecast: '0.3%', previous: '0.2%', actual: '0.4%' },
  { date: '2026-11-24T13:30:00Z', title: 'Core PCE Price Index m/m', country: 'USD', impact: 'High', forecast: '0.3%', previous: '0.3%' },
  { date: '2026-11-25T19:00:00Z', title: 'FOMC Meeting Minutes', country: 'USD', impact: 'High', forecast: '', previous: '' },
  { date: '2026-11-26T13:30:00Z', title: 'Unemployment Claims', country: 'USD', impact: 'High', forecast: '225K', previous: '220K' },
  { date: '2026-11-27T10:00:00Z', title: 'German Prelim CPI m/m', country: 'EUR', impact: 'Medium', forecast: '0.2%', previous: '0.2%' }] });
export const fauxMacro = () => ({ sections: [{ mesures: [{ id: 'taux.ust10', valeur: 4.21 }, { id: 'taux.pente10_2', valeur: 0.34 }, { id: 'taux.reel10', valeur: 1.87 }] }] });
export const fauxStats = () => ({ types: [{ id: 'ma200-rebond', nom: 'Rebond sur la MA200' }], actifs: { or: { H4: { types: { 'ma200-rebond': { n: 233, taux: 0.343, rMed20: -1, significatif: true } } } } } });
const COULEURS = { or: 'haussier', us100: 'haussier', us500: 'neutre', btc: 'baissier', sol: 'neutre', dxy: 'baissier', petrole: 'neutre', eurusd: 'haussier' };
export function fauxGlobal() {
  const actifs = Object.entries(COULEURS).map(([actif, couleur]) => ({ actif, nom: actif.toUpperCase(), couleur, score: couleur === 'haussier' ? 2 : couleur === 'baissier' ? -2 : 0, prix: fauxPro(actif === 'petrole' || actif === 'eurusd' ? 'or' : actif).prix, variationJourPct: 0.4, phrase: actif.toUpperCase() + ' : Daily ' + couleur + ', H4 ' + couleur, aligne: couleur !== 'neutre', donneesDu: '2026-11-22 13:30 UTC' }));
  return { actifs, climat: { lecture: 'risk-on (actions américaines fortes, dollar pas haussier)', base: 'score actions 1.5, score dollar -2' }, lesDeuxPlusInteressants: [{ actif: 'or', nom: 'Or', couleur: 'haussier', pourquoi: 'Or : Daily haussier, H4 haussier (Daily et H4 alignés)' }, { actif: 'us100', nom: 'Nasdaq 100', couleur: 'haussier', pourquoi: 'Nasdaq 100 : Daily haussier, H4 haussier' }], annoncesEtActualites: {}, avertissement: 'Couleur = Daily + H4 + position par rapport à la MA200 Daily.', donneesDu: '2026-11-22 14:00 UTC' };
}
/* src complet ; options : { sans: ['cot', 'niveaux', …] } fait échouer ces sources, { delai: ms } simule la latence */
export function fauxSrc({ sans = [], delai = 0 } = {}) {
  const cache = {}, pro = id => (cache[id] = cache[id] || fauxPro(id)), att = () => (delai ? new Promise(r => setTimeout(r, delai)) : null);
  const appels = [];
  const src = {
    appels, maintenant,
    async pro(id) { appels.push('pro:' + id); await att(); if (sans.includes('pro') || id === 'eurusd' || id === 'petrole') throw new Error('instantané pro-' + id + ' absent'); return pro(id); },
    async outil(nom, args = {}) { appels.push(nom + ':' + (args.actif || '')); await att(); if (sans.includes(nom)) return { indisponible: nom + ' en panne (test)' };
      const id = args.actif || 'or';
      if (nom === 'niveaux') return fauxNiveaux(id, pro(id));
      if (nom === 'analyse_marche') { if (id === 'petrole' || id === 'eurusd') return { indisponible: 'actif non suivi' }; return fauxAnalyse(id, pro(id)); }
      if (nom === 'marche_global') return fauxGlobal();
      if (nom === 'prix_et_tendance') return { actif: id, dernieresFleches: [{ unite: 'H4', sens: 'achat (haussier)', type: 'Rebond sur la MA200', date: '2026-11-20 08:00 UTC', niveau: 3480.5 }], donneesDu: '2026-11-22 13:00 UTC' };
      if (nom === 'marches') return { actualites: [{ titre: 'Gold holds near record as Fed bets rise', source: 'Reuters', date: '2026-11-22 09:00 UTC' }], annoncesDuJour: [] };
      if (nom === 'mes_actifs') { if (id === 'dxy') return { indisponible: 'non couvert' }; return { actif: id, nom: id, prix: 100, prixDu: '2026-11-22 12:00 UTC', horizons: [{ horizon: '1–10 jours', verdict: 'neutre', score100: 50, confiancePct: 40, raisons: [] }, { horizon: '1–6 mois', verdict: 'plutôt cher', score100: 38, confiancePct: 55, raisons: ['prix loin de sa moyenne à 200 jours', 'taux réels en hausse'] }, { horizon: '1–3 ans', verdict: 'neutre', score100: 52, confiancePct: 45, raisons: [] }], phrase: 'phrase mes actifs' }; }
      if (nom === 'carnet_et_volume') return { actif: id, terminalVolume: { actif: id, unite: 'H4', murs: [{ cote: 'achat', prix: 3480 }], carnetVivant: true, deltaReel: true }, lectureTerminal: 'Or en H4 : le point de contrôle est à 3 480. Le carnet Kraken penche côté acheteurs (22 % sur dix niveaux), avec un mur acheteur à 3 480. Dernière flèche : absorption.' };
      return { indisponible: 'outil inconnu ' + nom };
    },
    async cot(inst) { appels.push('cot:' + inst); await att(); if (sans.includes('cot')) throw new Error('cot-' + inst + ' absent'); return fauxCot(inst); },
    async calendrier() { await att(); if (sans.includes('calendrier')) throw new Error('calendrier absent'); return fauxCalendrier(); },
    async macro() { await att(); if (sans.includes('macro')) throw new Error('macro absent'); return fauxMacro(); },
    async statsFleches() { return fauxStats(); }
  };
  return src;
}
