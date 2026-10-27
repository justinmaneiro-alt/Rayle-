import { niveauxA } from './chart-etat.js';
import { atr } from '../trading/indicateurs.js';
import { normaliserPaire } from './journal.js';
import { coutEnR, coutsDe } from './couts.js';

/* ═════════════ CAPTURE D'ÉCRAN : lecture par une IA qui voit, VÉRIFICATION par le moteur (M6 ; module pur, testé : planetes/mars/tests/m6-capture-test.mjs) ═════════════
   Tu déposes une capture de ton graphique (TradingView ou autre). Une IA qui voit les images (via le Worker, à la demande) RECOPIE ce qui est écrit : symbole, unité de temps, niveaux de prix, zones.
   Elle n'analyse rien. Ce module :
   1. revalide STRICTEMENT cette lecture (types, bornes, plausibilité : une IA se trompe, surtout en lisant un axe de prix) ;
   2. VÉRIFIE chaque niveau sur les VRAIES bougies (le niveau correspond-il à un vrai creux, un vrai sommet, une vraie zone touchée ? à combien d'ATR ? combien de fois touché ?) ;
   3. contrôle l'échelle : un niveau qui ne correspond pas au prix de la paire annoncée est signalé (capture d'une autre paire, d'une autre époque, ou axe mal lu) ;
   4. produit des dessins étiquetés « estimé depuis la capture », que tu peux caler sur le niveau réel le plus proche ou jeter.
   RÈGLE D'OR : les chiffres présentés viennent des DONNÉES ; la capture ne fournit que des points de départ à vérifier. Rien de ce qui vient de l'image n'est présenté comme un fait. Aucun ordre, aucun conseil. */
const TYPES_NIVEAU = ['support', 'resistance', 'entree', 'stop', 'objectif', 'niveau'];
const UNITES = { m15: 'M15', '15': 'M15', '15m': 'M15', '15min': 'M15', h1: 'H1', '1h': 'H1', '60': 'H1', '60m': 'H1', h4: 'H4', '4h': 'H4', '240': 'H4', d1: 'D1', '1d': 'D1', d: 'D1', daily: 'D1', 'journalier': 'D1' };
const nombre = x => (typeof x === 'number' ? x : typeof x === 'string' ? Number(x.replace(/\s/g, '').replace(',', '.')) : NaN);
const texte = (x, n = 60) => String(x == null ? '' : x).replace(/[<>]/g, '').trim().slice(0, n);

/* Revalide la lecture brute du modèle. Rend { ok, lecture, avertissements } ; jamais d'exception. */
export function validerLecture(brut) {
  const avert = []; if (!brut || typeof brut !== 'object' || Array.isArray(brut)) return { ok: false, erreur: 'la lecture n’est pas un objet' };
  if (brut.erreur) return { ok: false, erreur: texte(brut.erreur, 200) };
  const lecture = { instrument: brut.instrument ? texte(brut.instrument, 40) : null, paire: null, paireConnue: false, unite: null, prixDernier: null, niveaux: [], zones: [], sens: null, indicateurs: [], periode: brut.periode ? texte(brut.periode, 80) : null, confiance: 0.5, remarques: texte(brut.remarques, 300) };
  if (lecture.instrument) { const p = normaliserPaire(lecture.instrument); lecture.paire = p.connue ? p.paire : null; lecture.paireConnue = p.connue; if (!p.connue) avert.push('symbole « ' + lecture.instrument + ' » hors BTC / SOL / DOGE'); }
  if (brut.unite != null) { const u = UNITES[String(brut.unite).toLowerCase().replace(/\s+/g, '')]; if (u) lecture.unite = u; else if (String(brut.unite) !== 'null' && String(brut.unite) !== 'autre') avert.push('unité de temps illisible : « ' + texte(brut.unite, 20) + ' »'); }
  const pd = nombre(brut.prixDernier); if (Number.isFinite(pd) && pd > 0) lecture.prixDernier = pd;
  for (const n of Array.isArray(brut.niveaux) ? brut.niveaux.slice(0, 20) : []) { const prix = nombre(n && n.prix), type = TYPES_NIVEAU.includes(n && n.type) ? n.type : 'niveau'; if (Number.isFinite(prix) && prix > 0) lecture.niveaux.push({ type, prix, etiquette: texte(n.etiquette) }); else avert.push('niveau ignoré (prix illisible)'); }
  for (const z of Array.isArray(brut.zones) ? brut.zones.slice(0, 10) : []) { const h = nombre(z && z.prixHaut), b = nombre(z && z.prixBas); if (Number.isFinite(h) && Number.isFinite(b) && h > 0 && b > 0 && h !== b) lecture.zones.push({ prixHaut: Math.max(h, b), prixBas: Math.min(h, b), etiquette: texte(z.etiquette) }); else avert.push('zone ignorée (prix illisibles ou égaux)'); }
  lecture.sens = /^(achat|long|buy)$/i.test(brut.sens) ? 1 : /^(vente|short|sell)$/i.test(brut.sens) ? -1 : null;
  lecture.indicateurs = (Array.isArray(brut.indicateurs) ? brut.indicateurs : []).slice(0, 12).map(x => texte(x, 30)).filter(Boolean);
  const c = nombre(brut.confiance); if (Number.isFinite(c)) lecture.confiance = Math.max(0, Math.min(1, c));
  if (!lecture.niveaux.length && !lecture.zones.length) avert.push('aucun niveau ni aucune zone lisible sur cette capture');
  if (lecture.confiance < 0.4) avert.push('l’IA elle-même est peu sûre de sa lecture (' + Math.round(lecture.confiance * 100) + ' %)');
  return { ok: true, lecture, avertissements: avert };
}

/* Quelle paire a l'échelle de prix de ces niveaux ? (sert à repérer une capture d'une autre paire ou un axe mal lu) */
export function devinerPaireParEchelle(prix, derniers) {
  if (!prix.length) return null; const m = prix.slice().sort((a, b) => a - b)[Math.floor(prix.length / 2)]; let meilleure = null;
  for (const [p, dernier] of Object.entries(derniers)) { if (!(dernier > 0)) continue; const r = Math.abs(Math.log(m / dernier)); if (!meilleure || r < meilleure.r) meilleure = { paire: p, r }; }
  return meilleure && meilleure.r < Math.log(2) ? meilleure.paire : null;
}

const decimales = x => (x >= 1000 ? 0 : x >= 1 ? 2 : 5);
const fnb = x => x.toLocaleString('fr-FR', { maximumFractionDigits: decimales(x) });

/* Vérification sur les vraies bougies de l'unité demandée (objets { t, o, h, l, c, v }, du plus ancien au plus récent).
   options : { paire (choisie dans l'interface), derniersPrix: { BTC: …, SOL: …, DOGE: … } (pour deviner l'échelle), fenetre (bougies relues) } */
export function verifierSurDonnees(lecture, bougies, { paire = null, derniersPrix = {}, fenetre = 600 } = {}) {
  if (!bougies || bougies.length < 100) return { ok: false, erreur: 'pas assez de bougies pour vérifier (il en faut 100 au moins)' };
  const n = bougies.length, dernier = bougies[n - 1].c, a = atr(bougies, 14), at = a[n - 1] || dernier * 0.005, recents = bougies.slice(Math.max(0, n - fenetre));
  const alertes = [], res = { paire, dernierPrix: dernier, atr: at, niveaux: [], zones: [], plan: null, coherence: {}, alertes };
  // 1. paire et échelle
  const prixLus = [...lecture.niveaux.map(x => x.prix), ...lecture.zones.flatMap(z => [z.prixHaut, z.prixBas])];
  const devinee = Object.keys(derniersPrix).length ? devinerPaireParEchelle(prixLus, derniersPrix) : null; res.coherence.paireDevinee = devinee;
  if (lecture.paire && paire && lecture.paire !== paire) alertes.push('La capture annonce ' + lecture.paire + ' mais tu as choisi ' + paire + ' : je vérifie sur ' + paire + ', mais les niveaux risquent de ne pas correspondre.');
  if (devinee && paire && devinee !== paire) alertes.push('Les prix lus ont l’échelle de ' + devinee + ', pas de ' + paire + ' : capture d’une autre paire, ou axe mal lu.');
  if (lecture.prixDernier) { const e = Math.abs(lecture.prixDernier / dernier - 1) * 100; res.coherence.ecartPrixDernierPct = e; if (e > 5) alertes.push('Le dernier prix lu (' + fnb(lecture.prixDernier) + ') s’écarte de ' + e.toFixed(1).replace('.', ',') + ' % du prix réel actuel (' + fnb(dernier) + ') : capture ancienne, ou mauvaise lecture.'); }
  // 2. niveaux de référence réels (supports / résistances, POC, zone de valeur), calculés sur le passé
  const nv = niveauxA(bougies, n - 1), reels = [...nv.supports.map(x => ({ prix: x.prix, nom: 'support' })), ...nv.resistances.map(x => ({ prix: x.prix, nom: 'résistance' })), ...(nv.profil ? [{ prix: nv.profil.poc, nom: 'POC' }, { prix: nv.profil.vah, nom: 'haut de la zone de valeur' }, { prix: nv.profil.val, nom: 'bas de la zone de valeur' }] : [])];
  // pivots réels des bougies récentes (sommets et creux locaux sur 5 bougies de chaque côté)
  const pivots = []; for (let i = 5; i < recents.length - 5; i++) { let hi = true, lo = true; for (let k = 1; k <= 5; k++) { if (recents[i].h <= recents[i - k].h || recents[i].h < recents[i + k].h) hi = false; if (recents[i].l >= recents[i - k].l || recents[i].l > recents[i + k].l) lo = false; } if (hi) pivots.push({ prix: recents[i].h, nom: 'sommet' }); if (lo) pivots.push({ prix: recents[i].l, nom: 'creux' }); }
  const tout = [...reels, ...pivots];
  const verifier = prixLu => {
    const hors = prixLu > dernier * 2 || prixLu < dernier / 2;
    let proche = null; for (const r of tout) { const d = Math.abs(r.prix - prixLu); if (!proche || d < proche.d) proche = { ...r, d }; }
    const tol = 0.15 * at; let touches = 0, rejets = 0; for (const b of recents) { if (b.l - tol <= prixLu && b.h + tol >= prixLu) { touches++; const dedans = b.c >= prixLu - tol && b.c <= prixLu + tol; if (!dedans && ((b.h >= prixLu && b.c < prixLu - tol) || (b.l <= prixLu && b.c > prixLu + tol))) rejets++; } }
    const dATR = proche ? proche.d / at : null, statut = hors ? 'hors_echelle' : dATR != null && dATR <= 0.5 && touches >= 2 ? 'confirme' : dATR != null && dATR <= 1.5 ? 'approximatif' : 'sans_appui';
    return { statut, distanceATR: dATR, niveauReel: proche ? proche.prix : null, nomReel: proche ? proche.nom : null, touches, rejets, distancePrixPct: (prixLu / dernier - 1) * 100 };
  };
  for (const x of lecture.niveaux) res.niveaux.push({ ...x, source: 'estimé depuis la capture', verification: verifier(x.prix) });
  for (const z of lecture.zones) { const milieu = (z.prixHaut + z.prixBas) / 2; res.zones.push({ ...z, source: 'estimé depuis la capture', verification: { ...verifier(milieu), largeurATR: (z.prixHaut - z.prixBas) / at } }); }
  // 3. plan de trade éventuel (entrée, stop, objectif)
  const e = lecture.niveaux.find(x => x.type === 'entree'), s = lecture.niveaux.find(x => x.type === 'stop'), o = lecture.niveaux.find(x => x.type === 'objectif');
  if (e && s && o) {
    const sens = lecture.sens || (o.prix > e.prix ? 1 : -1), bon = sens > 0 ? s.prix < e.prix && o.prix > e.prix : s.prix > e.prix && o.prix < e.prix, dist = Math.abs(e.prix - s.prix), rr = Math.abs(o.prix - e.prix) / dist;
    res.plan = { sens, coherent: bon, entree: e.prix, stop: s.prix, objectif: o.prix, rr, distanceStopPct: dist / e.prix * 100, distanceStopATR: dist / at, distanceAuPrixPct: (e.prix / dernier - 1) * 100, coutR: paire ? coutEnR(coutsDe(paire), dist / e.prix * 100) : null };
    if (!bon) alertes.push('Le plan lu est incohérent : le stop et l’objectif ne sont pas de chaque côté de l’entrée.');
    if (Math.abs(res.plan.distanceAuPrixPct) > 3) alertes.push('L’entrée lue est à ' + res.plan.distanceAuPrixPct.toFixed(1).replace('.', ',') + ' % du prix actuel : plan déjà joué, ou futur.');
  } else if (lecture.niveaux.some(x => ['entree', 'stop', 'objectif'].includes(x.type))) alertes.push('Plan de trade incomplet sur la capture (il faut entrée, stop ET objectif) : pas de rapport risque / gain.');
  const nb = { confirme: 0, approximatif: 0, sans_appui: 0, hors_echelle: 0 }; for (const x of [...res.niveaux, ...res.zones]) nb[x.verification.statut]++;
  res.synthese = nb; res.ok = true; return res;
}

const STAT = { confirme: 'confirmé par les bougies', approximatif: 'approximatif', sans_appui: 'sans appui dans les bougies', hors_echelle: 'HORS ÉCHELLE (prix incohérent)' };
export function rapportCapture(lecture, v, { paire = null } = {}) {
  if (!v.ok) return { texte: 'Je n’ai pas pu vérifier la capture : ' + v.erreur + '.', phrases: [] };
  const p = [], nom = { BTC: 'Bitcoin', SOL: 'Solana', DOGE: 'Dogecoin' };
  p.push('J’ai lu sur la capture : ' + (lecture.paire ? nom[lecture.paire] : (lecture.instrument || 'un instrument non identifié')) + (lecture.unite ? ' en ' + lecture.unite : '') + ', ' + v.niveaux.length + ' niveau(x) et ' + v.zones.length + ' zone(s). Tout ce qui vient de l’image est ESTIMÉ ; les chiffres ci-dessous viennent des vraies bougies' + (paire ? ' de ' + nom[paire] : '') + '.');
  for (const x of v.niveaux) { const w = x.verification; p.push(x.type + ' lu ' + fnb(x.prix) + ' (estimé depuis la capture) : ' + STAT[w.statut] + (w.niveauReel != null && w.statut !== 'hors_echelle' ? ' — le niveau réel le plus proche est ' + fnb(w.niveauReel) + ' (' + w.nomReel + ', à ' + w.distanceATR.toFixed(1).replace('.', ',') + ' ATR), touché ' + w.touches + ' fois sur les ' + 'dernières bougies, ' + w.rejets + ' rejet(s)' : '') + '.'); }
  for (const z of v.zones) { const w = z.verification; p.push('zone lue ' + fnb(z.prixBas) + ' à ' + fnb(z.prixHaut) + ' (estimée depuis la capture, ' + w.largeurATR.toFixed(1).replace('.', ',') + ' ATR de large) : ' + STAT[w.statut] + ', touchée ' + w.touches + ' fois.'); }
  if (v.plan) p.push('Plan lu : ' + (v.plan.sens > 0 ? 'achat' : 'vente') + ', risque / gain ' + v.plan.rr.toFixed(1).replace('.', ',') + ', stop à ' + v.plan.distanceStopATR.toFixed(1).replace('.', ',') + ' ATR (' + v.plan.distanceStopPct.toFixed(2).replace('.', ',') + ' %)' + (v.plan.coutR != null ? ', frais et glissement ≈ ' + v.plan.coutR.total.toFixed(2).replace('.', ',') + ' R' : '') + (v.plan.coherent ? '' : ' — INCOHÉRENT') + '.');
  for (const a of v.alertes) p.push('Attention : ' + a);
  p.push('Ce n’est pas un conseil financier ; aucun ordre n’est passé. Les niveaux de la capture sont des points de départ à vérifier, pas des faits.');
  return { texte: p.join(' '), phrases: p };
}

/* Dessins (agent-m6/dessins.js) à partir de la lecture vérifiée. cale = true : chaque niveau est remplacé par le niveau réel le plus proche quand il est « confirmé » ou « approximatif ». */
export function dessinsDepuisCapture(lecture, v, { cale = false, groupe = 'capture', maintenant = Date.now() } = {}) {
  const out = [], nomType = { support: 'support', resistance: 'résistance', entree: 'entrée', stop: 'stop', objectif: 'objectif', niveau: 'niveau' };
  const prix = x => (cale && x.verification.niveauReel != null && ['confirme', 'approximatif'].includes(x.verification.statut) ? x.verification.niveauReel : x.prix);
  for (const x of v.niveaux) {
    if (x.verification.statut === 'hors_echelle') continue;
    out.push({ type: 'ligne_h', prix: prix(x), etiquette: '≈ ' + nomType[x.type] + (cale && prix(x) !== x.prix ? ' calé' : ' estimé') + ' (capture)', groupe, auteur: 'utilisateur', couleur: x.type === 'support' || x.type === 'objectif' ? 'haussier' : x.type === 'resistance' || x.type === 'stop' ? 'baissier' : 'info', note: x.source + ' · ' + STAT[x.verification.statut] });
  }
  for (const z of v.zones) { if (z.verification.statut === 'hors_echelle') continue; out.push({ type: 'zone', prixHaut: z.prixHaut, prixBas: z.prixBas, de: maintenant - 24 * 3600e3, etiquette: '≈ zone estimée (capture)', groupe, auteur: 'utilisateur', couleur: 'alerte', note: z.source + ' · ' + STAT[z.verification.statut] }); }
  return out;
}

/* Réduction d'une image avant l'envoi : la page la dessine dans un canevas (largeur 1600 px au plus) et l'exporte en JPEG. Cette fonction ne calcule que les dimensions et reste testable. */
export function dimensionsReduites(l, h, max = 1600) { if (l <= max) return { l, h }; const f = max / l; return { l: max, h: Math.round(h * f) }; }
export const MENTION_ENVOI = 'La capture est envoyée UNE seule fois à ton Worker Raylé, puis à Gemini pour LIRE les chiffres ; elle n’est pas gardée par le Worker. Ne l’envoie pas si elle montre ton nom, ton e-mail, un numéro de compte ou un solde que tu veux garder pour toi : recadre-la sur le graphique.';
