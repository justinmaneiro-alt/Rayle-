import { historiqueReel } from './aide-btc.mjs';
/* Télécharge (ou complète) l'historique M15 RÉEL dans donnees-btc-cache/ : node planetes/mars/tests/telecharger-btc.mjs [années] */
const annees = Number(process.argv[2]) || 4; const t0 = Date.now(); let derniere = 0;
const { serie, etat } = await historiqueReel({ annees, surProgres: p => { if (p.phase === 'telechargement' && p.pages && Date.now() - derniere > 3000) { derniere = Date.now(); console.log('  page', p.pages, p.bougies, 'bougies,', p.source, new Date(p.fin).toISOString().slice(0, 10)); } } });
console.log('terminé en', Math.round((Date.now() - t0) / 1000), 's :', serie.n, 'bougies M15 de', new Date(etat.debut).toISOString().slice(0, 10), 'à', new Date(etat.fin).toISOString().slice(0, 16), '· source', etat.source, '· secours', etat.secours, '· delta réel', Math.round(etat.deltaReelPct * 100) + ' %', '· lacunes', etat.lacunes.length, '· erreur', etat.erreur);
