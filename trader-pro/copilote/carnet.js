/* ═════════════ TRADER ENSEMBLE : le carnet de copilote (avant, pendant, après) ═════════════
   AVANT : « je regarde un achat sur l'or » → Rayle lit la situation avec tous ses outils : ce qui va dans ton sens, ce qui va contre, ce qui invaliderait l'idée. Elle ne dit JAMAIS « vas-y » ni « n'y va pas ».
   PENDANT : elle ne te prévient que si la lecture change VRAIMENT (gros volume contre toi, MA200 perdue, balayage contre toi, annonce qui arrive, invalidation touchée).
   APRÈS : un débrief court : ce que les outils montraient à l'entrée et au moment où ça a tourné, et UNE chose précise à regarder la prochaine fois.
   Tout est rangé dans le carnet (avec une copie des bougies pour rejouer le graphique) ; les positions XTB importées y sont rattachées automatiquement ; avec le temps, Rayle montre quels signaux tu repères seul
   et lesquels tu rates encore. Données privées : sur l'appareil et dans ton Worker, jamais dans le dépôt public. Module pur, testé. */
import { collecterFaits, retirerInconnus } from '../point/faits.js';
import { niveauxProches } from '../point/composer.js';
import { actifParId } from '../lecture/fiche.js';
import { heureParis } from '../lecture/sessions.js';
import { infosBougie } from './relecture.js';
import { creerCalcul } from '../volume/bougies-volume-calcul.js';

export const CLE_CARNET = 'rayle_copilote_carnet_v1', MAX_ENTREES = 80, H = 3600e3;
export const OUTILS = Object.freeze({ volume: 'la bougie de volume', ma200: 'la MA200', session: 'la session', niveau: 'les niveaux', carnet: 'le carnet d’ordres', score: 'le score', annonce: 'les annonces', structure: 'la structure (balayage)' });
const fr = (v, d = 1) => (Number.isFinite(v) ? v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/[  ]/g, ' ').replace('-', '−') : '?');
const prix = v => fr(v, Math.abs(v) >= 100 ? 0 : 2), heureP = t => heureParis(t).replace(/^0/, '').replace(':', ' h ').replace(/ h 00$/, ' h');
const nomActif = id => (actifParId[id] ? actifParId[id].nom : id);
const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'`]/g, ' ').replace(/[^a-z0-9% ]+/g, ' ').replace(/\s+/g, ' ').trim();
const ACTIFS = [['or', /\b(or|gold|xau)\b/], ['us100', /\b(nasdaq|us ?100|ndx)\b/], ['us500', /\b(s ?p ?500|us ?500|sp500)\b/], ['btc', /\b(bitcoin|btc)\b/], ['sol', /\b(solana|sol)\b/], ['petrole', /\b(petrole|wti|brent)\b/], ['dxy', /\b(dxy|dollar)\b/]];
const CITES = { volume: /\b(volume|bougie de volume|gros volume)\b/, ma200: /\b(ma ?200|moyenne mobile|moyenne)\b/, session: /\b(session|londres|new york|asie|asiatique|ouverture)\b/, niveau: /\b(niveau|support|resistance|pdh|pdl|zone)\b/, carnet: /\b(carnet|order ?book|desequilibre)\b/, score: /\b(score)\b/, annonce: /\b(annonce|cpi|nfp|fomc|agenda|calendrier)\b/, structure: /\b(balayage|sweep|liquidite|piege)\b/ };
/* « je regarde un achat sur l'or, j'ai vu la bougie de volume et la MA200 » → { actif, sens, outilsCites } ou null */
export function analyserIntention(texte) {
  const n = norm(texte), achat = /\b(achat|acheter|long|buy|monter|haussier)\b/.test(n), vente = /\b(vente|vendre|short|sell|baisse|baisser|baissier)\b/.test(n);
  if (!/\b(je regarde|j envisage|je pense a|je songe a|je vais regarder|j hesite|j ai une idee|idee de|je regarde pour|je veux|je pense prendre|je vais prendre)\b/.test(n) || achat === vente) return null;
  const actif = (ACTIFS.find(([, re]) => re.test(n)) || [])[0]; if (!actif) return null;
  return { actif, sens: achat ? 1 : -1, outilsCites: Object.keys(CITES).filter(k => CITES[k].test(n)), texte: String(texte).slice(0, 300) };
}
export function intentionCloture(texte) {
  const n = norm(texte); if (!/\b(j ai cloture|j ai ferme|je suis sorti|je sors|c est ferme|trade termine|j ai coupe|stop touche|tp touche|j ai pris mes profits)\b/.test(n)) return null;
  const actif = (ACTIFS.find(([, re]) => re.test(n)) || [])[0] || null, m = /\b(?:a|vers|sur|prix)\s*(\d{1,3}(?: \d{3})*(?:[.,]\d+)?)\b/.exec(norm(texte).replace(/(\d) (\d{3})/g, '$1 $2')); const px = m ? parseFloat(m[1].replace(/ /g, '').replace(',', '.')) : null;
  return { actif, prixSortie: Number.isFinite(px) ? px : null };
}

/* ───── AVANT : la lecture de la situation pour une idée d'achat ou de vente ───── */
export function lectureAvant(F, sens, { maintenant = Date.now() } = {}) {
  if (!F || !Number.isFinite(F.prix)) return null;
  const T = F.tendance || {}, nom = nomActif(F.actif), achat = sens > 0, derives = [], d = v => { derives.push(v); return v; }, pour = [], contre = [], presents = new Set(), N = niveauxProches(F);
  const lie = (ok, s) => (ok ? pour : contre).push(s), mot = achat ? 'haussier' : 'baissier';
  if (T.J && T.J.sens) { presents.add('ma200'); if (T.J.sens === 'mixte') contre.push('Le Daily est mixte : le prix et la pente de sa MA200 ne disent pas la même chose.'); else lie(T.J.sens === mot, `Le Daily est ${T.J.sens} (prix ${T.J.position === 'dessus' ? 'au-dessus' : 'sous'} sa MA200, pente ${T.J.pente20 || 'indéterminée'}) : ${T.J.sens === mot ? 'c’est dans le sens de ton idée' : 'c’est contre ton idée'}.`); }
  if (T.H4 && T.H4.sens) { if (T.H4.sens === 'mixte') contre.push('Le H4 est mixte.'); else lie(T.H4.sens === mot, `Le H4 est ${T.H4.sens} (${fr(Math.abs(d(T.H4.ecartAtr)), 1)} ATR ${T.H4.position === 'dessus' ? 'au-dessus' : 'sous'} sa MA200) : ${T.H4.sens === mot ? 'dans ton sens' : 'contre toi'}.`); if (Math.abs(T.H4.ecartAtr) >= 6 && ((achat && T.H4.ecartAtr > 0) || (!achat && T.H4.ecartAtr < 0))) contre.push(`Le prix est très étiré dans le sens de ton idée (${fr(Math.abs(d(T.H4.ecartAtr)), 1)} ATR de la MA200 H4) : entrer après un mouvement déjà long est plus risqué.`); }
  for (const e of (F.evenements || []).filter(x => x.t >= maintenant - 24 * H)) {
    if (e.type === 'volume_extreme' && ['J', 'H4', 'H1'].includes(e.unite)) { presents.add('volume'); if (e.contexte === 'fin' && e.dir === sens) contre.push(`Une bougie de volume extrême (${fr(d(e.volumeRel), 1)} fois la normale) vient de se former en fin de mouvement dans ton sens : un essoufflement est possible.`); else lie(e.dir === sens, `Une bougie de volume ${fr(d(e.volumeRel), 1)} fois la normale ${e.dir === sens ? 'va dans ton sens' : 'va contre toi'}.`); }
    if (e.type === 'croisement_ma200' && ['J', 'H4'].includes(e.unite) && e.statut === 'confirmee') { presents.add('ma200'); lie(e.dir === sens, `La MA200 ${e.unite === 'J' ? 'Daily' : 'H4'} a été cassée ${e.dir > 0 ? 'à la hausse' : 'à la baisse'} récemment${e.vraieCassure ? ' avec un fort volume' : ''} : ${e.dir === sens ? 'dans ton sens' : 'contre toi'}.`); }
    if (e.type === 'balayage') { presents.add('structure'); const ok = (e.sensProbable === 'haussier') === achat; lie(ok, `Un balayage récent ${e.cote === 'haut' ? 'par le haut' : 'par le bas'} puis retour suggère plutôt un mouvement ${e.sensProbable} : ${ok ? 'dans ton sens' : 'contre toi'}.`); }
  }
  const sess = (F.sessions || []).filter(s => s.comportement && s.comportement.texte && s.id !== 'creux').slice(-1)[0]; if (sess) { presents.add('session'); lie((sess.pct > 0) === achat, `${sess.nom} : ${sess.comportement.texte} (${sess.pct >= 0 ? '+' : '−'}${fr(Math.abs(d(sess.pct)), 1)} %).`); }
  if (F.score && F.score.score100 != null) { presents.add('score'); const ok = achat ? F.score.score100 >= 58 : F.score.score100 <= 42; if (ok || (achat ? F.score.score100 <= 42 : F.score.score100 >= 58)) lie(ok, `Le score de marché est de ${fr(d(F.score.score100), 0)} sur 100 (${F.score.verdict.toLowerCase()}) : ${ok ? 'dans ton sens' : 'contre toi'}.`); }
  if (F.carnet) { presents.add('carnet'); const p = F.carnet.acheteursPct10, ok = achat ? p >= 60 : p <= 40; if (ok || (achat ? p <= 40 : p >= 60)) lie(ok, `Le carnet d’ordres est acheteur à ${fr(d(p), 0)} % sur les 10 premiers niveaux : ${ok ? 'dans ton sens' : 'contre toi'}.`); }
  if (F.cot && F.cot.extreme && ((achat && F.cot.extreme === 'haut') || (!achat && F.cot.extreme === 'bas'))) contre.push(`Les fonds sont déjà à un extrême ${F.cot.extreme === 'haut' ? 'acheteur' : 'vendeur'} (COT à ${fr(d(F.cot.indexSpec), 0)} sur 100) : le camp de ton idée est plein.`);
  const st = F.statsJ; if (st && st.dispo && !st.petit) { const ok = achat ? st.partHaussePct >= 55 : st.partHaussePct <= 45; if (ok || (achat ? st.partHaussePct <= 45 : st.partHaussePct >= 55)) lie(ok, `Dans ${fr(d(st.cas), 0)} situations de tendance Daily semblables, ${fr(d(st.partHaussePct), 0)} % des cas se sont terminés en hausse à 5 jours : ${ok ? 'plutôt dans ton sens' : 'plutôt contre toi'}.`); }
  const ag = (F.agenda || []).filter(a => a.t > maintenant && a.t < maintenant + 3 * H)[0]; if (ag) { presents.add('annonce'); contre.push(`${ag.titre} est annoncé à ${heureP(ag.t)} : volatilité attendue, les premières minutes sont souvent erratiques.`); }
  const nv = achat ? N.dessous : N.dessus, but = achat ? N.dessus : N.dessous; if (nv || but) presents.add('niveau');
  const invalidation = nv ? { prix: nv.prix, nom: nv.nom, texte: `Ce qui invaliderait ton idée : une clôture ${achat ? 'sous' : 'au-dessus de'} ${nv.nom} (${prix(d(nv.prix))}).` } : null, cible = but ? `Le prochain repère dans ton sens est ${but.nom} à ${prix(d(but.prix))}.` : null;
  const P = [`Pour ${achat ? 'un achat' : 'une vente'} sur ${nom}, voici ma lecture avec les outils, au prix de ${prix(d(F.prix))}.`, pour.length ? `Ce qui va dans ton sens : ${pour.slice(0, 4).join(' ')}` : 'Rien ne va franchement dans ton sens pour l’instant.', contre.length ? `Ce qui va contre : ${contre.slice(0, 4).join(' ')}` : 'Rien de franchement contre non plus.', invalidation ? invalidation.texte : '', cible, 'Je ne te dis ni d’y aller ni de ne pas y aller : c’est toi qui décides, je te montre ce que disent les outils.'].filter(Boolean).join(' ');
  const faits = collecterFaits({ F }, { nombres: derives }), v = retirerInconnus(P, faits), equilibre = pour.length - contre.length;
  return { actif: F.actif, sens, prix: F.prix, pour, contre, invalidation, cible, outilsPresents: [...presents], equilibre, texte: v.texte, retirees: v.retirees, derives };
}

/* ───── création d'une entrée du carnet (avec une copie des bougies pour rejouer le graphique) ───── */
export function creerEntree({ actif, sens, F, lecture, outilsCites = [], texteUtilisateur = '', t = Date.now() }) {
  const barres = (F.h1 || []).slice(-72).map(b => b.map((x, i) => (i ? +x.toFixed(4) : x)));
  return { id: 'k' + t.toString(36) + Math.floor(Math.random() * 1e4).toString(36), actif, sens, t, maj: t, etat: 'ouvert', prixRef: F.prix, texteUtilisateur: String(texteUtilisateur).slice(0, 300), outilsCites, outilsPresents: lecture ? lecture.outilsPresents : [], lecture: lecture ? { pour: lecture.pour, contre: lecture.contre, invalidation: lecture.invalidation, equilibre: lecture.equilibre } : null, snapshot: { h1: barres, niveaux: lecture && lecture.invalidation ? [lecture.invalidation] : [], ma200H4: F.tendance && F.tendance.H4 ? F.tendance.H4.ma200 : null, ma200J: F.tendance && F.tendance.J ? F.tendance.J.ma200 : null, sensJ: F.tendance && F.tendance.J ? F.tendance.J.sens : null, sensH4: F.tendance && F.tendance.H4 ? F.tendance.H4.sens : null, ecartAtrH4: F.tendance && F.tendance.H4 ? F.tendance.H4.ecartAtr : null, annonceProche: (F.agenda || []).some(a => Math.abs(a.t - t) < 2 * H) }, xtb: null, alertes: [], debrief: null };
}
export const fusionnerCarnets = (local = [], distant = []) => { const m = new Map(); for (const e of [...local, ...distant]) if (e && e.id) { const a = m.get(e.id); if (!a || (e.maj || 0) > (a.maj || 0)) m.set(e.id, e); } return [...m.values()].sort((a, b) => b.t - a.t).slice(0, MAX_ENTREES); };

/* ───── PENDANT : la lecture a-t-elle VRAIMENT changé ? ───── */
export function changementsDeLecture(entree, F, maintenant = Date.now()) {
  if (!entree || entree.etat !== 'ouvert' || !F || entree.actif !== F.actif) return []; const nom = nomActif(entree.actif), sens = entree.sens, deja = new Set((entree.alertes || []).map(a => a.cle)), out = [];
  const apres = (F.evenements || []).filter(e => e.t > entree.t), add = (cle, texte, gravite = 2) => { if (!deja.has(cle)) out.push({ cle, texte, gravite, t: maintenant }); };
  for (const e of apres) {
    if (e.type === 'volume_extreme' && e.dir === -sens && e.volumeRel >= 3 && ['J', 'H4', 'H1'].includes(e.unite)) add(`vol|${e.unite}|${e.t}`, `Gros volume contre toi sur ${nom} : bougie ${e.unite === 'J' ? 'Daily' : e.unite} ${e.dir > 0 ? 'acheteuse' : 'vendeuse'} à ${fr(e.volumeRel, 1)} fois la normale. La lecture change.`, 3);
    if (e.type === 'croisement_ma200' && e.dir === -sens && ['J', 'H4'].includes(e.unite) && ['confirmee', 'en_attente'].includes(e.statut)) add(`ma|${e.unite}|${e.t}`, `MA200 ${e.unite === 'J' ? 'Daily' : 'H4'} perdue sur ${nom} : clôture ${e.dir > 0 ? 'au-dessus' : 'sous'} à ${prix(e.prix)}${e.statut === 'confirmee' ? ', et ça tient' : ' (à confirmer)'}. La lecture change.`, 3);
    if (e.type === 'balayage' && (e.sensProbable === 'haussier') === (sens < 0)) add(`bal|${e.niveau}|${e.t}`, `Balayage de ${e.niveau} (${prix(e.prix)}) ${e.cote === 'haut' ? 'par le haut' : 'par le bas'} puis retour sur ${nom} : plutôt contre ton idée.`, 2);
  }
  const ag = (F.agenda || []).find(a => a.t > maintenant && a.t - maintenant <= 30 * 60e3); if (ag) add(`ann|${ag.t}`, `${ag.titre} dans moins de 30 minutes (${heureP(ag.t)}) : prudence, ta position y est exposée.`, 2);
  const inv = entree.lecture && entree.lecture.invalidation; if (inv && Number.isFinite(inv.prix) && ((sens > 0 && F.prix < inv.prix) || (sens < 0 && F.prix > inv.prix))) add(`inv|${inv.prix}`, `Le prix ${sens > 0 ? 'passe sous' : 'passe au-dessus de'} ${inv.nom} (${prix(inv.prix)}) : c’était ce qui invalidait ton idée.`, 3);
  return out;
}

/* ───── rattachement automatique des positions XTB (données privées : jamais dans git) ───── */
export const TICKERS = { or: 'GOLD', us100: 'US100', us500: 'US500', btc: 'BITCOIN', sol: 'SOLANA', petrole: 'OIL.WTI', dxy: 'DXY' };
export function rattacherXtb(entrees, positions, { fenetreAvantMs = 30 * 60e3, fenetreApresMs = 6 * H, tolPrix = 0.006 } = {}) {
  const prises = new Set((entrees || []).filter(e => e.xtb).map(e => e.xtb.id)); let n = 0;
  const E = (entrees || []).map(e => {
    if (e.xtb) return e; const cand = (positions || []).filter(p => !prises.has(p.id) && String(p.ticker).toUpperCase() === TICKERS[e.actif] && (p.sens === 'BUY') === (e.sens > 0) && p.tOuv >= e.t - fenetreAvantMs && p.tOuv <= e.t + fenetreApresMs && (!e.prixRef || Math.abs(p.prixOuv / e.prixRef - 1) <= tolPrix)).sort((a, b) => Math.abs(a.tOuv - e.t) - Math.abs(b.tOuv - e.t))[0];
    if (!cand) return e; prises.add(cand.id); n++; return { ...e, maj: Date.now(), xtb: { id: cand.id, prixOuv: cand.prixOuv, tOuv: cand.tOuv, sl: cand.sl ?? null, tp: cand.tp ?? null, prixFerm: cand.prixFerm ?? null, tFerm: cand.tFerm ?? null, pnl: cand.pnl ?? null }, etat: cand.tFerm ? 'ferme' : e.etat };
  });
  return { entrees: E, rattachees: n };
}

/* ───── APRÈS : le débrief ───── */
export function debrief(entree, { B, unite = 'H4', tSortie = Date.now(), prixSortie = null } = {}) {
  if (!entree || !Array.isArray(B) || B.length < 220) return null; const pas = { H1: H, H4: 4 * H, J: 24 * H }[unite], calc = creerCalcul(entree.actif).maj(B), sens = entree.sens, derives = [], d = v => { derives.push(v); return v; };
  const iE = B.findIndex(b => b.t + pas > entree.t), iS = Math.min(B.length - 1, Math.max(iE, B.findIndex(b => b.t + pas > tSortie) === -1 ? B.length - 1 : B.findIndex(b => b.t + pas > tSortie)));
  if (iE < 0 || iE >= B.length - 1) return null; const e0 = infosBougie(B, calc, Math.max(0, iE - 1), unite), px0 = entree.xtb && entree.xtb.prixOuv ? entree.xtb.prixOuv : entree.prixRef, atr = calc.atr(iE) || e0.atr || 1;
  let pire = 0, iPire = iE, meilleur = 0, iMeilleur = iE; for (let i = iE; i <= iS; i++) { const adverse = sens > 0 ? px0 - B[i].l : B[i].h - px0, favorable = sens > 0 ? B[i].h - px0 : px0 - B[i].l; if (adverse > pire) { pire = adverse; iPire = i; } if (favorable > meilleur) { meilleur = favorable; iMeilleur = i; } }
  const iTourne = meilleur > 0 && iPire > iMeilleur ? iPire : iMeilleur === iE ? iPire : iMeilleur + Math.min(1, iS - iMeilleur), eT = infosBougie(B, calc, Math.min(iS, iTourne), unite);
  const sortie = Number.isFinite(prixSortie) ? prixSortie : (entree.xtb && entree.xtb.prixFerm) || B[iS].c, gain = (sortie - px0) * sens, gainAtr = gain / atr, gainPct = gain / px0 * 100;
  const avant = [`À l’entrée (${heureP(entree.t)}), le prix était à ${prix(d(px0))}.`], moment = [];
  const s = entree.snapshot || {}; if (s.sensJ) avant.push(`Le Daily était ${s.sensJ} et le H4 ${s.sensH4 || 'indéterminé'}${(s.sensJ === 'haussier') === (sens > 0) && s.sensJ !== 'mixte' ? ', dans ton sens.' : s.sensJ === 'mixte' ? '.' : ', et le Daily allait contre ton idée.'}`);
  if (e0.rel != null) avant.push(e0.niveau ? `La bougie précédente avait un volume ${fr(d(e0.rel), 1)} fois la normale (${e0.niveau === 'extreme' ? 'extrême' : 'fort'}).` : `Le volume était ordinaire (${fr(d(e0.rel), 1)} fois la normale).`);
  if (e0.ma != null) avant.push(`Le prix était à ${fr(Math.abs(d(e0.ecartMaAtr)), 1)} ATR ${e0.positionMa === 'dessus' ? 'au-dessus' : 'sous'} de la MA200 ${NOM_U[unite]}.`);
  moment.push(`Au moment où ça a tourné (${heureP(eT.t)}), la bougie ${NOM_U[unite]} était ${eT.dir > 0 ? 'haussière' : 'baissière'}${eT.rel != null ? ` avec un volume ${fr(d(eT.rel), 1)} fois la normale${eT.niveau ? ' (' + (eT.niveau === 'extreme' ? 'extrême' : 'fort') + ')' : ''}` : ''}, ${eT.session ? 'session ' + eT.session : ''}.`);
  if (eT.ma != null) moment.push(`Le prix était alors ${eT.positionMa === 'dessus' ? 'au-dessus' : 'sous'} la MA200 (à ${fr(Math.abs(d(eT.ecartMaAtr)), 1)} ATR).`);
  moment.push(`Le trade a ${gain >= 0 ? 'gagné' : 'perdu'} ${fr(Math.abs(d(+gainPct.toFixed(2))), 2)} % (${fr(Math.abs(d(+gainAtr.toFixed(1))), 1)} ATR${entree.xtb && Number.isFinite(entree.xtb.pnl) ? ', résultat XTB rattaché' : ''}).`);
  let lecon; const contreDaily = s.sensJ && s.sensJ !== 'mixte' && (s.sensJ === 'haussier') !== (sens > 0), etire = Number.isFinite(s.ecartAtrH4) && Math.abs(s.ecartAtrH4) >= 6 && (s.ecartAtrH4 > 0) === (sens > 0), volContre = eT.niveau === 'extreme' && eT.dir === -sens;
  if (contreDaily && gain < 0) lecon = 'La prochaine fois, regarde l’alignement Daily / H4 avant d’entrer : ici le Daily allait contre ton idée, et le trade a perdu.'; else if (volContre) lecon = `La prochaine fois, surveille les bougies de volume extrême contre toi : celle de ${heureP(eT.t)} (${fr(eT.rel, 1)} fois la normale) était le signal que la lecture changeait.`;
  else if (etire && gain < 0) lecon = 'La prochaine fois, regarde la distance à la MA200 H4 : entrer très étiré dans le sens du mouvement laisse peu de marge avant un repli.'; else if (s.annonceProche && gain < 0) lecon = 'La prochaine fois, regarde l’agenda : une annonce tombait autour de ton entrée, et ses premières minutes sont souvent erratiques.';
  else if (gain >= 0) lecon = `Ce qui a bien marché : ${s.sensJ && (s.sensJ === 'haussier') === (sens > 0) ? 'le Daily était dans ton sens' : 'ton entrée a tenu'}. Refais ce contrôle de l’alignement Daily / H4 à chaque fois.`; else lecon = 'La prochaine fois, regarde la bougie de volume au niveau clé avant d’entrer : c’est elle qui dit si le niveau tient.';
  const texte = [...avant, ...moment, lecon].join(' '), faits = collecterFaits({ B: B.slice(-5), s, e0, eT }, { nombres: derives }), v = retirerInconnus(texte, faits);
  return { t: tSortie, iEntree: iE, iTourne: Math.min(iS, iTourne), iSortie: iS, gainPct, gainAtr, avant, moment, lecon, texte: v.texte, retirees: v.retirees, unite };
}
const NOM_U = { J: 'Daily', H4: 'H4', H1: 'H1' };

/* ───── ce que j'ai appris à LIRE : signaux repérés seul, signaux encore ratés ───── */
export function competences(entrees, { min = 3 } = {}) {
  const S = {}; for (const e of entrees || []) { if (!e.outilsPresents) continue; for (const o of e.outilsPresents) { const x = (S[o] ||= { present: 0, cite: 0 }); x.present++; if ((e.outilsCites || []).includes(o)) x.cite++; } }
  const L = Object.entries(S).filter(([, x]) => x.present >= min).map(([o, x]) => ({ outil: o, nom: OUTILS[o], present: x.present, cite: x.cite, taux: x.cite / x.present }));
  const seul = L.filter(x => x.taux >= 0.6).sort((a, b) => b.taux - a.taux), rates = L.filter(x => x.taux <= 0.34).sort((a, b) => a.taux - b.taux);
  const t = []; if (seul.length) t.push(`Tu repères déjà seul : ${seul.map(x => `${x.nom} (${x.cite} fois sur ${x.present})`).join(', ')}.`); if (rates.length) t.push(`Tu rates encore souvent : ${rates.map(x => `${x.nom} (cité ${x.cite} fois sur ${x.present})`).join(', ')}.`);
  if (!t.length) t.push(`Pas encore assez d’idées dans le carnet (il en faut au moins ${min} par outil) pour dire ce que tu repères seul.`);
  return { seul, rates, texte: t.join(' '), total: (entrees || []).length };
}
