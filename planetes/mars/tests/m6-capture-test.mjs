// M6 partie 4 : capture d'écran. La lecture de l'IA est revalidée strictement, puis chaque niveau est VÉRIFIÉ sur les vraies bougies ; les chiffres viennent des données.
// Lancer :  node planetes/mars/tests/m6-capture-test.mjs
import { validerLecture, verifierSurDonnees, rapportCapture, dessinsDepuisCapture, devinerPaireParEchelle, dimensionsReduites, MENTION_ENVOI } from '../pc/agent-m6/capture.js';
import { validerDessin } from '../pc/agent-m6/dessins.js';

let ok = 0, ko = 0;
const v = (nom, cond, detail = '') => { if (cond) ok++; else { ko++; console.log('KO  ' + nom + (detail !== '' ? ' — ' + detail : '')); } };

// ── lecture brute du modèle : validation ──
{
  const r = validerLecture({ instrument: 'BINANCE:SOLUSDT', unite: '1h', prixDernier: '104,30', niveaux: [{ type: 'support', prix: 101.5, etiquette: 'support' }, { type: 'resistance', prix: '108,2' }, { type: 'bizarre', prix: 100 }, { type: 'stop', prix: 'abc' }, { type: 'niveau', prix: -3 }], zones: [{ prixHaut: 106, prixBas: 105 }, { prixHaut: 5, prixBas: 5 }], sens: 'achat', indicateurs: ['MA 200', 'RSI'], confiance: 0.9, remarques: '<b>axe flou</b>' });
  v('lecture valide : paire SOL, unité H1, prix lu avec virgule', r.ok && r.lecture.paire === 'SOL' && r.lecture.unite === 'H1' && r.lecture.prixDernier === 104.3 && r.lecture.sens === 1);
  v('niveaux : prix illisibles ou négatifs ignorés, type inconnu ramené à « niveau », virgule décimale lue', r.lecture.niveaux.length === 3 && r.lecture.niveaux[1].prix === 108.2 && r.lecture.niveaux[2].type === 'niveau' && r.avertissements.filter(a => /niveau ignoré/.test(a)).length === 2);
  v('zones : une valide, une sans épaisseur ignorée', r.lecture.zones.length === 1 && r.lecture.zones[0].prixHaut === 106 && r.avertissements.some(a => /zone ignorée/.test(a)));
  v('balises retirées, indicateurs gardés', !/[<>]/.test(r.lecture.remarques) && r.lecture.indicateurs.join() === 'MA 200,RSI');
  v('erreur du modèle remontée', validerLecture({ erreur: 'ce n’est pas un graphique' }).erreur === 'ce n’est pas un graphique');
  v('lecture absurde refusée sans exception', !validerLecture(null).ok && !validerLecture('texte').ok && !validerLecture([1, 2]).ok);
  const vide = validerLecture({ instrument: 'ETHUSD', unite: 'semaine', niveaux: [], confiance: 0.1 }); v('rien de lisible : avertissements (symbole hors paires, unité illisible, aucun niveau, confiance basse)', vide.ok && vide.lecture.paire === null && vide.avertissements.length >= 4 && vide.lecture.unite === null);
  v('unités reconnues : 15, 1h, 4h, 240, D, 1D', ['15', '1h', '4h', '240', 'D', '1D'].map(u => validerLecture({ unite: u, niveaux: [{ prix: 1 }] }).lecture.unite).join() === 'M15,H1,H4,H4,D1,D1');
  v('confiance bornée à [0, 1]', validerLecture({ confiance: 7, niveaux: [{ prix: 1 }] }).lecture.confiance === 1 && validerLecture({ confiance: -2, niveaux: [{ prix: 1 }] }).lecture.confiance === 0);
  v('au plus 20 niveaux et 10 zones gardés', validerLecture({ niveaux: Array.from({ length: 40 }, (_, i) => ({ prix: 100 + i })), zones: Array.from({ length: 30 }, (_, i) => ({ prixHaut: 110 + i, prixBas: 100 })) }).lecture.niveaux.length === 20);
}
// ── échelle de prix ──
{
  const d = { BTC: 81000, SOL: 104, DOGE: 0.08 };
  v('échelle : des prix autour de 105 → SOL ; 80 500 → BTC ; 0,081 → DOGE', devinerPaireParEchelle([103, 105, 107], d) === 'SOL' && devinerPaireParEchelle([80500, 79000], d) === 'BTC' && devinerPaireParEchelle([0.081, 0.079], d) === 'DOGE');
  v('échelle : prix qui ne ressemblent à rien → null', devinerPaireParEchelle([5000000], d) === null && devinerPaireParEchelle([], d) === null);
}
// ── vérification sur de vraies (synthétiques) bougies : des creux répétés à 95, des sommets à 105 ──
const T0 = Date.UTC(2026, 0, 1), H = 3600e3;
function serie() {
  const out = [];
  for (let i = 0; i < 900; i++) {
    const phase = (i % 60) / 60 * 2 * Math.PI, c = 100 + 5 * Math.sin(phase), c2 = 100 + 5 * Math.sin(phase + 2 * Math.PI / 60);
    out.push({ t: T0 + i * H, o: c, c: c2, h: Math.max(c, c2) + 0.15, l: Math.min(c, c2) - 0.15, v: 100 });
  }
  return out;
}
const B = serie(), dernier = B[B.length - 1].c;
{
  const lec = { instrument: 'BTCUSDT', paire: 'BTC', unite: 'H1', prixDernier: null, niveaux: [{ type: 'support', prix: 94.9, etiquette: '' }, { type: 'resistance', prix: 105.1, etiquette: '' }, { type: 'support', prix: 98.2, etiquette: '' }, { type: 'niveau', prix: 400, etiquette: '' }], zones: [{ prixHaut: 95.6, prixBas: 94.6, etiquette: 'demande' }], sens: null, indicateurs: [], confiance: 0.8, remarques: '' };
  const r = verifierSurDonnees(lec, B, { paire: 'BTC', derniersPrix: { BTC: dernier } });
  const par = Object.fromEntries(r.niveaux.map(x => [x.prix, x.verification]));
  v('creux à 94,9 : confirmé par les bougies, touché plusieurs fois, niveau réel proche', r.ok && par[94.9].statut === 'confirme' && par[94.9].touches >= 5 && par[94.9].distanceATR < 0.5, JSON.stringify(par[94.9]));
  v('sommet à 105,1 : confirmé', par[105.1].statut === 'confirme');
  v('niveau 98,2 au milieu du mouvement : pas de vrai niveau (approximatif ou sans appui, jamais « confirmé »)', par[98.2].statut !== 'confirme', JSON.stringify(par[98.2]));
  v('niveau 400 sur un instrument à 100 : HORS ÉCHELLE', par[400].statut === 'hors_echelle');
  v('zone 94,6-95,6 : confirmée, largeur en ATR donnée', r.zones[0].verification.statut === 'confirme' && r.zones[0].verification.largeurATR > 0);
  v('synthèse comptée', r.synthese.confirme >= 3 && r.synthese.hors_echelle === 1);
  v('chaque niveau est étiqueté « estimé depuis la capture »', r.niveaux.every(x => x.source === 'estimé depuis la capture') && r.zones.every(z => z.source === 'estimé depuis la capture'));
  // mauvaise paire
  const m = verifierSurDonnees({ ...lec, paire: 'SOL' }, B, { paire: 'BTC', derniersPrix: { BTC: 81000, SOL: 100 } });
  v('capture annonçant SOL alors que BTC est choisi : alerte', m.alertes.some(a => /annonce SOL mais tu as choisi BTC/.test(a)));
  v('échelle de SOL (≈ 100) alors que BTC est choisi (81 000) : l’alerte le dit', m.alertes.some(a => /échelle de SOL/.test(a)) && m.coherence.paireDevinee === 'SOL');
  const ancien = verifierSurDonnees({ ...lec, prixDernier: 130 }, B, { paire: 'BTC' }); v('dernier prix lu éloigné de 30 % du prix réel : capture ancienne ou lecture fausse', ancien.alertes.some(a => /s’écarte/.test(a)));
  // plan de trade
  const plan = verifierSurDonnees({ ...lec, sens: 1, niveaux: [{ type: 'entree', prix: 100, etiquette: '' }, { type: 'stop', prix: 95, etiquette: '' }, { type: 'objectif', prix: 110, etiquette: '' }], zones: [] }, B, { paire: 'BTC' });
  v('plan lu : R/R 2, stop à 5 % du prix, frais en R, cohérent', plan.plan && plan.plan.coherent && Math.abs(plan.plan.rr - 2) < 1e-9 && Math.abs(plan.plan.distanceStopPct - 5) < 1e-9 && plan.plan.coutR.total > 0);
  const bad = verifierSurDonnees({ ...lec, sens: 1, niveaux: [{ type: 'entree', prix: 100, etiquette: '' }, { type: 'stop', prix: 105, etiquette: '' }, { type: 'objectif', prix: 110, etiquette: '' }], zones: [] }, B, { paire: 'BTC' });
  v('plan incohérent (stop au-dessus d’un achat) signalé', bad.plan && !bad.plan.coherent && bad.alertes.some(a => /incohérent/.test(a)));
  const incomplet = verifierSurDonnees({ ...lec, niveaux: [{ type: 'entree', prix: 100, etiquette: '' }, { type: 'stop', prix: 95, etiquette: '' }], zones: [] }, B, { paire: 'BTC' }); v('plan sans objectif : signalé incomplet, pas de rapport risque / gain inventé', incomplet.plan === null && incomplet.alertes.some(a => /incomplet/.test(a)));
  const loin = verifierSurDonnees({ ...lec, sens: 1, niveaux: [{ type: 'entree', prix: 109, etiquette: '' }, { type: 'stop', prix: 107, etiquette: '' }, { type: 'objectif', prix: 115, etiquette: '' }], zones: [] }, B, { paire: 'BTC' }); v('entrée à plus de 3 % du prix actuel : plan déjà joué ou futur', loin.alertes.some(a => /déjà joué, ou futur/.test(a)));
  v('trop peu de bougies : refus clair', !verifierSurDonnees(lec, B.slice(0, 50), {}).ok);
  // rapport
  const rap = rapportCapture(lec, r, { paire: 'BTC' }); v('rapport : « estimé depuis la capture », niveau réel, ATR, touches, avertissement final', /estimé depuis la capture/.test(rap.texte) && /le niveau réel le plus proche est/.test(rap.texte) && /touché \d+ fois/.test(rap.texte) && /pas un conseil financier/.test(rap.texte) && /HORS ÉCHELLE/.test(rap.texte), rap.texte.slice(0, 400));
  v('rapport d’une vérification impossible', /pas pu vérifier/.test(rapportCapture(lec, { ok: false, erreur: 'x' }).texte));
  // dessins
  const ds = dessinsDepuisCapture(lec, r, { maintenant: B[B.length - 1].t }); v('dessins : niveaux hors échelle exclus, étiquetés « ≈ … estimé (capture) », groupe capture, auteur utilisateur', ds.filter(d => d.type === 'ligne_h').length === 3 && ds.every(d => /≈/.test(d.etiquette) && d.groupe === 'capture' && d.auteur === 'utilisateur'));
  v('tous ces dessins passent la validation du magasin de dessins', ds.every(d => validerDessin(d, { prixRef: dernier, maintenant: B[B.length - 1].t + H }).ok), JSON.stringify(ds.map(d => validerDessin(d, { prixRef: dernier, maintenant: B[B.length - 1].t + H })).filter(x => !x.ok)));
  const cales = dessinsDepuisCapture(lec, r, { cale: true, maintenant: B[B.length - 1].t }); v('calage : au moins un niveau est calé et l’étiquette le dit', cales.some(d => /calé/.test(d.etiquette)));
  v('niveau 94,9 calé sur le creux réel (≈ 94,85), différent du prix lu', (() => { const d = cales.find(x => x.type === 'ligne_h' && Math.abs(x.prix - 94.9) < 0.3); return d && d.prix !== 94.9; })());
}
// ── divers ──
{
  v('réduction d’image : 3200 × 1800 → 1600 × 900 ; petite image inchangée', JSON.stringify(dimensionsReduites(3200, 1800)) === '{"l":1600,"h":900}' && dimensionsReduites(1200, 700).l === 1200);
  v('mention d’envoi claire : une seule fois, Worker puis Gemini, pas gardée, données personnelles', /UNE seule fois/.test(MENTION_ENVOI) && /Gemini/.test(MENTION_ENVOI) && /pas gardée/.test(MENTION_ENVOI) && /e-mail/.test(MENTION_ENVOI));
}
console.log(ok + ' ok, ' + ko + ' ko'); process.exit(ko ? 1 : 0);
