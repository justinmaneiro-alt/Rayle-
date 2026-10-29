// V8 : faux Worker de Raylé pour les tests de la coque mobile (actualités avec images, paquet de l'agent, commandes, images libres). Déterministe, sans réseau.
// Scénarios modifiables pendant le test : fil 'ok' | '503' | 'panne' | 'lent' ; agent 'ok' | 'vide' | 'panne' | 'limite' | 'pc-eteint' ; pays 'ok' | 'panne'.
import http from 'node:http';
import { bougies as bougiesMarche } from './mock-worker-marche.mjs';
const heure = min => new Date(Date.now() - min * 60000).toISOString();
const IMG = n => `https://img.test/actu-${n}.svg`;
const sujet = (i, titre, cat, importance, lieu) => ({ id: 's' + i, titre, categorie: cat, importance, score: importance * 10, date: heure(10 + i * 7), lieu: lieu || null, regions: [], resume: '',
  image: i % 4 === 3 ? null : IMG(i), sources: [{ nom: i % 2 ? 'franceinfo' : 'Le Monde', url: 'https://exemple.test/a/' + i, titre, date: heure(10 + i * 7), image: i % 4 === 3 ? null : IMG(i) }, { nom: 'Ouest-France', url: 'https://exemple.test/b/' + i, titre, date: heure(20 + i * 7) }] });
const CATS = ['societe', 'economie', 'sport', 'international', 'science', 'tech', 'politique', 'justice'];
export const fil = portee => Array.from({ length: 14 }, (_, i) => sujet(i, (portee === 'monde' ? 'Monde · ' : 'France · ') + 'sujet d’essai numéro ' + (i + 1) + ' avec un titre assez long pour passer à la ligne', CATS[i % CATS.length], 1 + (i % 5), i % 3 === 0 ? { nom: 'Bordeaux', lat: 44.84, lon: -0.58, type: 'ville', origine: 'texte', estime: true, pays: 'FR' } : null));

/* Paquet de l'agent, de la forme publiée par agent-pc/bundle-mobile.mjs */
export function paquetAgent({ avecPositions = true, maintenant = Date.now() } = {}) {
  const J = 86400e3, jours = {}, courbe = []; let cum = 0;
  for (let k = 20; k >= 1; k--) { const R = k % 3 === 0 ? -1 : k % 4 === 0 ? 2.1 : 0.8; cum += R; courbe.push([maintenant - k * J, +cum.toFixed(3)]); jours[new Date(maintenant - k * J).toISOString().slice(0, 10)] = R; }
  const stats = n => ({ n, Rtotal: +cum.toFixed(3), pct: +(cum * 0.5).toFixed(3), reussite: 0.55, rrMoyen: 1.9, esperance: cum / n, drawdownR: 3, meilleureSerie: 4, pireSerie: 2, courbe, jours });
  const props = avecPositions ? [
    { id: 'p1', agent: 'rebond', actif: 'BTC', tf: 'H1', sens: 1, limite: 80000, stop: 79500, cible: 81000, cible2: 82000, zone: [80100, 79900], rr: 2, raison: 'Balayage du plus bas de 02 h, mur de 4,2 fois la médiane en dessous, delta qui se retourne', invalidation: 'clôture H1 sous 79 500', tValide: maintenant + 4 * 3600e3, t: maintenant - 600e3, statut: 'en_attente', nomType: 'Balayage de liquidité', confluence: { diamant: true }, diamant: true, preuve: { niveau: 'candidate', n: 112, tauxReussite: 0.46, rrMoyen: 1.8, esperance: 0.09, fourchette: [-0.08, 0.27] } },
    { id: 'p2', agent: 'continuation', actif: 'SOL', tf: 'M15', sens: -1, limite: 100, stop: 101, cible: 98, rr: 2, raison: 'Repli sur la moyenne 20 dans une tendance baissière H1', invalidation: 'clôture M15 au-dessus de 101', tValide: maintenant + 3600e3, t: maintenant - 3600e3, statut: 'ouverte', nomType: 'Repli sur la moyenne 20', preuve: { niveau: 'non_concluante', n: 53, tauxReussite: 0.45, rrMoyen: 1.7, esperance: 0.25, fourchette: [-0.16, 0.67] } },
    { id: 'p3', agent: 'extremes', actif: 'DOGE', tf: 'H1', sens: 1, limite: 0.08, stop: 0.079, cible: 0.082, rr: 2, raison: 'Fin de range après une cascade de liquidations', invalidation: 'clôture H1 sous 0,079', tValide: maintenant + 2 * 3600e3, t: maintenant - 7200e3, statut: 'en_attente', nomType: 'Fin de range', preuve: { niveau: 'non_testee' } }
  ] : [];
  return { v: 1, t: maintenant, serviceLe: maintenant, phase: 'attente',
    positions: { ok: true, t: maintenant, reglages: { agents: { rebond: true, continuation: true, extremes: true }, actifs: ['BTC', 'SOL', 'DOGE'], unites: ['M15', 'H1'], maxParAgent: 3, maxNouvellesParJour: 5, confluenceMin: 2, niveauPreuveMin: 'candidate', afficherIdees: false, risquePct: 0.5, alertesObservation: false, seuilDiamant: 5, surveillance: false, versionCriteres: 'equilibre' },
      versionCriteres: 'équilibré (v4)', dernierCycle: maintenant - 60e3, propositions: props, recentes: [],
      hypotheses_du_moment: avecPositions ? [] : [{ type: 'preuve', actif: 'BTC', tf: 'H1', limite: 80000, stop: 79500, cible: 81000, sens: 1, rr: 2, raison: 'Balayage du plus bas', invalidation: 'clôture sous 79 500', tValide: maintenant + 3600e3, t: maintenant, statut: 'en_attente', pourquoi: 'Confluence insuffisante (1 élément sur 2).', quand: 'Je la proposerais si le prix balaie 79 900.', preuve: { niveau: 'non_concluante', n: 40 } }],
      zonesDiamant: { BTC: [{ niveau: 79000, cote: 'support', distancePct: 2.2, tf: 'H1', enApproche: false, resume: 'POC + mur + absorption' }, { niveau: 81500, cote: 'resistance', distancePct: 0.8, tf: 'H1', enApproche: true, resume: 'plus haut du jour + mur' }] },
      bilan: { tous: { ...stats(20), phrase: avecPositions ? '20 jours : +' + cum.toFixed(1) + ' R sur 20 trades, preuve encore insuffisante.' : 'Aucune position proposée pour l’instant : rien à bilanter.', hasard: { assez: true, esperance: 0.02 }, esperance: cum / 20, hebdo: { assez: true, n: 8, moyenne: 0.9, bas: 0.2, haut: 1.6, part1: 0.375, part2: 0.125, probPositive: 0.93 } }, parAgent: [] },
      types: [{ nomType: 'Repli sur la moyenne 20', actif: 'BTC', tf: 'H1', agent: 'continuation', niveau: 'non_concluante', n: 120, esperance: 0.05, fourchette: [-0.1, 0.2], tauxReussite: 0.45, rrMoyen: 1.7, pourquoi: 'Fourchette négative.' }, { nomType: 'Balayage de liquidité', actif: 'SOL', tf: 'M15', agent: 'rebond', niveau: 'candidate', n: 110, esperance: 0.09, fourchette: [-0.05, 0.25], tauxReussite: 0.46, rrMoyen: 1.8, pourquoi: '' }, { nomType: 'Absorption', actif: 'DOGE', tf: 'H1', agent: 'rebond', niveau: 'non_testee', n: 12, esperance: null, pourquoi: '' }],
      journalNiveaux: [{ t: maintenant - 2 * J, texte: 'Balayage de liquidité SOL : non concluante → Candidate' }], essais: { total: 643217, jeuxFinauxOuverts: 0 }, empreinteV4: 'abcd1234' },
    performance: { risquePct: 0.5, tous: stats(20), parAgent: { rebond: { ...stats(8), n: 8 }, continuation: { ...stats(7), n: 7 }, extremes: { ...stats(5), n: 5 } }, parActif: { BTC: { ...stats(9), n: 9 }, SOL: { ...stats(7), n: 7 }, DOGE: { ...stats(4), n: 4 } }, pasUnePromesse: 'Simulation avec frais et glissement ; estimation à partir du passé, pas une promesse.' },
    pistes: { pistes: [{ id: 'x:SOL', nom: 'Cassure H1 avec volume', famille: 'cassure', paire: 'SOL', statut: { code: 'prometteuse', texte: 'PROMETTEUSE, NON PROUVÉE : positive hors échantillon mais des preuves manquent' }, trades: 71, esperanceApres: 0.2, tauxReussite: 0.4, rrMoyen: 2.4, bootstrapBas: 0.1, dsr: 0.12, ddPct: 11, manque: [{ critere: 'hasard', texte: 'probabilité que ce ne soit pas du hasard : 12 % (il en faut 95 %)' }], niveaux: { strict: { niveau: 'non_concluante' }, equilibre: { niveau: 'candidate' } }, enPepiniere: true }], toutes: [], variantes: 42740, entonnoir: { evaluations: 400, criteres: [{ critere: 'Espérance > hasard attendu', rate: 400, seul: 0, part: 1 }, { critere: 'Intervalle de confiance (bootstrap)', rate: 392, seul: 0, part: 0.98 }, { critere: 'Facteur de profit', rate: 355, seul: 0, part: 0.89 }] } },
    equipe: { equipe: { kepler: { role: 'Exécutant', lignes: ['Kepler surveille 0 stratégie.'] }, chercheur: { role: 'Écrit des hypothèses', lignes: ['0 hypothèse aujourd’hui.'] }, auditeur: { role: 'Vérifie', lignes: ['Aucune candidate rejetée.'] } }, hypotheses: [{ id: 'h1', titre: 'Absorption après cascade', raison: 'Parce que les vendeurs agressifs s’épuisent.', statut: 'testée' }], pepiniere: { actives: 19, acceptees: 0, retirees: 4, tradesTotal: 63 } },
    agent: { enMarche: true, versionActive: null, pause: false, charge: 'normal', alertes: [{ id: 'a1', type: 'RAPPORT', t: maintenant - 3600e3, titre: '📝 Rapport hebdomadaire', texte: 'x', mode: 'SIMULATION' }], versions: [], strategies: [], rapport: { lignes: ['Kepler — rapport du jour.', 'Aucune stratégie validée.', 'Pépinière : 19 candidates.', 'Équipe : 0 hypothèse.', 'Aucun ordre n’est exécuté.'] } },
    occasions: { total: 787, prises: 0, ratees: 787, contextes: { flux_persistant: 186, divergence_cvd: 33 }, resume: '787 grosses impulsions repérées, 787 manquées.', avertissement: 'Ce journal sert à générer des hypothèses, jamais à les valider.', recentes: [{ actif: 'BTC', t: maintenant - 3600e3, contexte: 'flux_persistant' }] },
    exemples: { total: 0, phrase: 'Aucun exemple noté pour l’instant.', recents: [] },
    donnees: { flux: { enregistre: true, phrase: 'Enregistre BTC/SOL/DOGE depuis 1,4 jour(s), 0,16 Go sur 15 Go, trous : 13.', jours: 1.4, octets: 176603319, quotaGo: 15, trous: 13, fluxPrets: '9/9', derniersTrous: [{ t: maintenant - 3600e3, flux: 'kraken', raison: 'connexion coupée puis rétablie' }] } } };
}

export async function demarrerFauxWorkerMobile(port = 8797) {
  const scenario = { fil: 'ok', agent: 'ok', pays: 'ok', lentMs: 0 }, journal = [], commandes = [];
  const srv = http.createServer((req, res) => {
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*', 'Content-Type': 'application/json' };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
    const u = new URL(req.url, 'http://x'), p = u.pathname; journal.push({ chemin: p, q: Object.fromEntries(u.searchParams), methode: req.method });
    const rep = (o, code = 200) => { res.writeHead(code, cors); res.end(JSON.stringify(o)); };
    let corps = ''; req.on('data', c => { corps += c; });
    req.on('end', () => {
      if (p === '/ping') return rep({ ok: true, version: 'mock', adresse: 'tu', voix: 'Test', feminin: true, vitesse: -8, ia: ['Mock'], d1: true, mode: 'normal' });
      if (p === '/securite/etat') return rep({ appareil: null, appaire: false, configure: false, deverrouille: false, expire_dans: 0, bloque_dans: 0, defi_dans: 0 });
      if (['/evenements', '/reglages', '/memoire', '/souvenirs'].includes(p)) return rep({ alertes: [], mode: 'normal', notes: [], items: [] });
      const suite = () => {
        if (p === '/actualites/fil') {
          if (scenario.fil === '503') return rep({ error: 'actualités en préparation : le Worker lit ses médias par petits lots (un cycle de 15 minutes après un déploiement) ; réessayez dans quelques minutes' }, 503);
          if (scenario.fil === 'panne') return rep({ error: 'sources indisponibles' }, 502);
          const portee = u.searchParams.get('portee') || 'france';
          return rep({ portee, genere: heure(4), sujets: fil(portee), sources: { ok: ['franceinfo'], indisponibles: [] } });
        }
        if (p === '/actualites') {
          if (u.searchParams.get('liste')) return rep({ pays: [{ code: 'FR', nom: 'France', lat: 46.6, lon: 2.5, dist: 1500, flux: 6 }], sansSource: [] });
          if (scenario.pays === 'panne') return rep({ error: 'indisponible' }, 502);
          return rep({ pays: { code: 'FR', nom: 'France' }, genere: heure(1), titres: Array.from({ length: 12 }, (_, i) => ({ titre: 'Titre direct ' + (i + 1) + ' pour la France', url: 'https://exemple.test/d/' + i, source: i % 2 ? 'Journal B' : 'Journal A', date: heure(5 + i * 9), image: i % 3 ? IMG(i) : undefined })), sources: [] });
        }
        if (p === '/agent/mobile') {
          if (scenario.agent === 'panne') return rep({ error: 'erreur interne' }, 500);
          if (scenario.agent === 'limite') return rep({ error: 'La liaison Worker est limitée aujourd’hui.', limite: true }, 503);
          const now = Date.now();
          if (scenario.agent === 'vide') return rep({ existe: false, note: 'Le PC n’a pas encore publié de paquet pour le téléphone.' });
          return rep({ existe: true, paquet: paquetAgent({ maintenant: now - 120e3 }), recuLe: now - 120e3, pcVivantLe: scenario.agent === 'pc-eteint' ? now - 3 * 3600e3 : now - 20e3, maintenant: now });
        }
        if (p === '/agent/commande' && req.method === 'POST') { let b = {}; try { b = JSON.parse(corps); } catch (e) { /* vide */ } commandes.push(b); return rep({ ok: true, id: 'c' + commandes.length }); }
        if (p === '/images') {
          const q = u.searchParams.get('q') || '';
          return rep({ q, sujet: { titre: q || 'Sujet', url: 'https://fr.wikipedia.org/wiki/Test' }, images: Array.from({ length: 3 }, (_, i) => ({ titre: 'Photo ' + (i + 1) + ' de ' + q, auteur: 'Auteur ' + (i + 1), licence: 'CC BY-SA 4.0', licence_url: 'https://creativecommons.org/licenses/by-sa/4.0/', source_url: 'https://commons.wikimedia.org/wiki/File:Test' + (i + 1) + '.jpg', miniature: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a' + i + '/Test' + i + '.jpg/500px-Test' + i + '.jpg', grande: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a' + i + '/Test' + i + '.jpg/960px-Test' + i + '.jpg', largeur: 960, hauteur: 640, origine: 'commons' })) });
        }
        if (p === '/marche') {
          const actif = u.searchParams.get('actif'), iv = u.searchParams.get('intervalle'), n = Math.min(500, Number(u.searchParams.get('n')) || 250);
          if (!['15min', '1h', '4h', '1day'].includes(iv)) return rep({ error: 'paramètres invalides' }, 400);
          return rep({ actif, nom: actif, intervalle: iv, source: 'Mock', symbole_source: actif, secours: false, differe: false, note: '', maj: new Date().toISOString(), bougies: bougiesMarche(actif, iv, n, Date.now()) });
        }
        if (p === '/finance/brut') { res.writeHead(200, { ...cors, 'Content-Type': 'text/plain' }); return res.end('<?xml version="1.0"?><rss><channel></channel></rss>'); }
        if (p === '/calendar') return rep([]);
        return rep({ error: 'route inconnue' }, 404);
      };
      if (scenario.lentMs && (p === '/actualites/fil' || p === '/agent/mobile')) setTimeout(suite, scenario.lentMs); else suite();
    });
  });
  await new Promise(ok => srv.listen(port, '127.0.0.1', ok));
  return { url: 'http://127.0.0.1:' + port, scenario, journal, commandes, fermer: () => new Promise(ok => { srv.closeAllConnections && srv.closeAllConnections(); srv.close(ok); }) };
}
