/* ═════════════ « REGARDE ÇA » : détection des GROS moments (pas du bruit) et panneau « Ce qu'il faut regarder » ═════════════
   Un moment n'existe que si l'une de ces situations se forme :
     · cassure CONFIRMÉE de la MA200 H4 ou Daily (M5 / M15 / H1 seulement si volume extrême ET dans le sens du contexte H4 / Daily) ;
     · bougie de volume EXTRÊME au sommet ou au creux d'un gros mouvement (climax) ;
     · balayage d'un niveau MAJEUR (veille, semaine, range asiatique) puis retour ;
     · début probable d'un mouvement de plusieurs jours (gros mouvement calibré, qui vient de partir, avec une cassure ou un volume derrière).
   Le seuil des « gros » mouvements est calibré sur l'historique de chaque actif (quelques situations par semaine, pas plus). Tout nombre cité existe dans la fiche de lecture ou est calculé ici par le code.
   Pour chaque moment : 3 à 5 chiffres qui comptent VRAIMENT (chacun avec une phrase simple sur pourquoi il compte), les éléments à surligner sur le graphique, ce que ça veut dire, le scénario, ce qui l'invaliderait
   et ce que disent les statistiques de notre base. Lecture seule : jamais « vas-y » ni « n'y va pas ». */
import { actifParId } from '../lecture/fiche.js';
import { sessionEn } from '../lecture/sessions.js';
import { collecterFaits, retirerInconnus } from '../point/faits.js';
import { niveauxProches } from '../point/composer.js';

const H = 3600e3;
export const NOM_UNITE = { J: 'Daily', H4: 'H4', H1: 'H1', M15: 'M15', M5: 'M5' };
const GRANDES = ['J', 'H4'], PETITES = ['H1', 'M15', 'M5'], MAJEURS = ['PDH', 'PDL', 'PWH', 'PWL', 'Asie haut', 'Asie bas'];
const NOM_NIVEAU = { PDH: 'le plus haut de la veille', PDL: 'le plus bas de la veille', PWH: 'le plus haut de la semaine passée', PWL: 'le plus bas de la semaine passée', 'Asie haut': 'le haut du range asiatique', 'Asie bas': 'le bas du range asiatique' };
const POURQUOI = Object.freeze({
  volume: 'Plus le volume est supérieur à la normale, plus des acteurs importants se sont positionnés : une cassure ou un retournement sans volume est bien moins fiable.',
  cloture: 'Ce qui compte, c’est la CLÔTURE de la bougie de l’autre côté de la MA200, pas une mèche qui dépasse.',
  tenue: 'Des clôtures successives du bon côté confirment la cassure ; une seule peut n’être qu’un piège.',
  ecart: 'Plus le prix est loin de la MA200, plus un retour vers elle est probable avant une nouvelle poussée.',
  carnet: 'Le carnet montre qui attend d’acheter ou de vendre juste autour du prix ; un fort déséquilibre peut appuyer ou freiner le mouvement.',
  score: 'Le score résume tendance, momentum, positionnement des fonds, macro et volatilité : c’est le contexte général du moment.',
  session: 'La session dit qui fait le mouvement : Asie calme, Londres qui balaye, New York qui prolonge ou retourne.',
  amplitude: 'L’amplitude en ATR dit si le mouvement sort vraiment de l’ordinaire pour cet actif.',
  contexte: 'Un volume extrême en fin de mouvement signale souvent un épuisement ; en milieu de mouvement, plutôt une poursuite.',
  niveau: 'Un niveau regardé par tout le monde attire les ordres stop : le prix y va, les prend, puis repart souvent dans l’autre sens.',
  stats: 'C’est ce qui s’est réellement passé les fois précédentes dans notre base, avec le nombre de cas : une tendance générale, pas une règle.'
});
const fr = (v, d = 1) => (Number.isFinite(v) ? v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/[  ]/g, ' ').replace('-', '−') : '?');
const deNom = s => String(s).replace(/^le /, 'du ').replace(/^la /, 'de la ').replace(/^les /, 'des ').replace(/^l’/, 'de l’');
const prixTxt = (id, v) => fr(v, Math.abs(v) >= 100 ? 0 : 2);
const sensCtx = F => (F.biais === 'haussier' ? 1 : F.biais === 'baissier' ? -1 : 0);

export function detecterMoments(F, { maintenant = Date.now(), maxAgeMs = 6 * H } = {}) {
  if (!F || !Number.isFinite(F.prix)) return [];
  const id = F.actif, nom = actifParId[id] ? actifParId[id].nom : id, ctx = sensCtx(F), M = [], t0 = maintenant - maxAgeMs, evts = (F.evenements || []).filter(e => e.t >= t0 && e.t <= maintenant + 60e3), derives = [], d = v => { derives.push(v); return v; };
  const N = niveauxProches(F), T = F.tendance || {}, vol = u => (F.volume && F.volume[u] && F.volume[u].disponible ? F.volume[u].liste : []);
  const chiffreScore = F.score && F.score.score100 != null ? { label: `score de marché ${fr(d(F.score.score100), 0)} sur 100 (${F.score.verdict.toLowerCase()})`, pourquoi: POURQUOI.score } : null;
  const chiffreCarnet = F.carnet ? { label: `carnet acheteur à ${fr(d(F.carnet.acheteursPct10), 0)} % sur les 10 premiers niveaux`, pourquoi: POURQUOI.carnet } : null;
  const sess = t => { const s = sessionEn(t); return s.id === 'creux' ? 'creux du soir' : s.nom; };

  /* 1. cassure confirmée de la MA200 */
  for (const e of evts.filter(x => x.type === 'croisement_ma200')) {
    const grande = GRANDES.includes(e.unite), petiteOk = PETITES.includes(e.unite) && e.volumeRelMax >= 3 && e.dir === ctx && ctx !== 0;
    if (e.statut !== 'confirmee' || !(grande || petiteOk)) continue;
    const vr = F.croisements.find(c => c.unite === e.unite && Math.abs(c.tFin - e.t) < 1000) || {}, marge = vr.margeAtr, ecartPct = e.ma200 ? (e.prix / e.ma200 - 1) * 100 : null, U = NOM_UNITE[e.unite];
    const chiffres = [
      e.volumeRelMax != null ? { label: `volume ${fr(d(e.volumeRelMax), 1)} fois la normale`, pourquoi: POURQUOI.volume } : null,
      ecartPct != null ? { label: `clôture à ${fr(Math.abs(d(+ecartPct.toFixed(1))), 1)} % ${e.dir > 0 ? 'au-dessus' : 'en dessous'} de la MA200 ${U}${marge != null ? ` (${fr(d(marge), 1)} ATR)` : ''}`, pourquoi: POURQUOI.cloture } : null,
      vr.tenue != null ? { label: `${d(vr.tenue)} clôture${vr.tenue > 1 ? 's' : ''} qui tiennent sur ${d(vr.requis)} demandées`, pourquoi: POURQUOI.tenue } : null, chiffreCarnet, chiffreScore].filter(Boolean).slice(0, 5);
    const surl = [{ type: 'bougie', t: e.t - (e.unite === 'J' ? 86400e3 : e.unite === 'H4' ? 4 * H : H), unite: e.unite }, { type: 'ma200', unite: e.unite }];
    const st = F.statsJ && F.statsJ.dispo && !F.statsJ.petit ? `Dans ${fr(d(F.statsJ.cas), 0)} situations de tendance Daily semblables, ${fr(d(F.statsJ.partHaussePct), 0)} % des cas se sont terminés en hausse à 5 jours, avec une hausse maximale médiane de ${fr(d(F.statsJ.hausseMaxMedianePct), 1)} % et une baisse maximale médiane de ${fr(d(F.statsJ.baisseMaxMedianePct), 1)} %.` : 'Pas assez de cas semblables dans notre base pour chiffrer ce qui suit d’habitude.';
    M.push(moment(F, { type: 'cassure_ma200', t: e.t, unite: e.unite, dir: e.dir, severite: grande && e.vraieCassure ? 3 : grande ? 2 : 2, titre: `cassure confirmée de la MA200 ${U} ${e.dir > 0 ? 'à la hausse' : 'à la baisse'}${petiteOk ? ' (volume extrême, dans le sens du contexte)' : ''}`, chiffres, surl,
      voit: `${nom.charAt(0).toUpperCase() + nom.slice(1)} a clôturé ${e.dir > 0 ? 'au-dessus' : 'sous'} sa MA200 ${U} à ${prixTxt(id, d(e.prix))} (la moyenne est à ${prixTxt(id, d(e.ma200))})${e.volumeRelMax != null ? `, avec un volume ${fr(d(e.volumeRelMax), 1)} fois la normale` : ''}, et la cassure tient.`,
      sens: e.vraieCassure ? 'Une cassure avec ce volume, c’est en général plus sérieux qu’une simple touche (tendance générale, pas une règle).' : 'Sans fort volume, une cassure est plus fragile : la tenue des clôtures suivantes compte.', stats: st, derives, nom, N, T }));
  }
  /* 2. climax : volume extrême au sommet ou au creux d'un gros mouvement */
  for (const e of evts.filter(x => x.type === 'volume_extreme' && GRANDES.includes(x.unite) && x.contexte === 'fin')) {
    const v = vol(e.unite).find(x => Math.abs(x.tFin - e.t) < 1000), U = NOM_UNITE[e.unite], haut = e.dir > 0;
    const chiffres = [{ label: `volume ${fr(d(e.volumeRel), 1)} fois la normale`, pourquoi: POURQUOI.volume }, { label: `bougie ${U} ${haut ? 'acheteuse' : 'vendeuse'} en fin de mouvement`, pourquoi: POURQUOI.contexte }, e.positionMa200 ? { label: `clôture ${e.positionMa200 === 'dessus' ? 'au-dessus' : 'sous'} la MA200`, pourquoi: POURQUOI.ecart } : null, T.H4 && Number.isFinite(T.H4.ecartAtr) ? { label: `prix à ${fr(Math.abs(d(T.H4.ecartAtr)), 1)} ATR de la MA200 H4`, pourquoi: POURQUOI.ecart } : null, chiffreScore].filter(Boolean).slice(0, 5);
    const stats = v && v.stats ? (v.stats.petit ? `Échantillon trop petit pour chiffrer ce qui suit d’habitude (${d(v.stats.n)} cas).` : `Sur ${d(v.stats.n)} bougies semblables de notre base, ${d(v.stats.continuation5Pct)} % ont continué et ${d(v.stats.retournement5Pct)} % se sont retournées dans les 5 bougies suivantes.`) : null;
    M.push(moment(F, { type: 'climax', t: e.t, unite: e.unite, dir: e.dir, severite: e.volumeRel >= 4 ? 3 : 2, titre: `bougie de volume extrême ${haut ? 'au sommet' : 'au creux'} d’un mouvement (${U})`, chiffres, surl: [{ type: 'bougie', t: e.t - (e.unite === 'J' ? 86400e3 : 4 * H), unite: e.unite }, ...(v ? [{ type: 'zone', bas: Math.min(e.prix, e.prix), haut: e.prix, titre: 'zone de la bougie' }] : [])],
      voit: `Une grosse bougie ${U} ${haut ? 'acheteuse' : 'vendeuse'} vient de se former sur ${nom}, avec un volume ${fr(d(e.volumeRel), 1)} fois la normale, ${haut ? 'tout en haut' : 'tout en bas'} du mouvement.`,
      sens: haut ? 'Un volume extrême tout en haut d’un mouvement signale souvent un épuisement : un retournement baissier est envisageable (tendance générale, pas une règle).' : 'Un volume extrême tout en bas d’un mouvement peut signaler une capitulation : un rebond est envisageable (tendance générale, pas une règle).', stats, derives, nom, N, T }));
  }
  /* 3. balayage d'un niveau majeur puis retour */
  for (const e of evts.filter(x => x.type === 'balayage' && MAJEURS.includes(x.niveau))) {
    const haut = e.cote === 'haut', n = NOM_NIVEAU[e.niveau] || e.niveau;
    const chiffres = [{ label: `${n} à ${prixTxt(id, d(e.prix))}`, pourquoi: POURQUOI.niveau }, { label: `balayé ${haut ? 'par le haut' : 'par le bas'} puis réintégré`, pourquoi: POURQUOI.niveau }, { label: `session ${sess(e.t)}`, pourquoi: POURQUOI.session }, chiffreScore].filter(Boolean).slice(0, 5);
    M.push(moment(F, { type: 'balayage', t: e.t, unite: 'H1', dir: haut ? -1 : 1, severite: ['PWH', 'PWL'].includes(e.niveau) ? 3 : 2, titre: `balayage ${deNom(n)} puis retour`, chiffres, surl: [{ type: 'niveau', prix: e.prix, titre: n }, { type: 'bougie', t: e.t - H, unite: 'H1' }],
      voit: `${nom.charAt(0).toUpperCase() + nom.slice(1)} est passé ${haut ? 'au-dessus' : 'en dessous'} ${deNom(n)} (${prixTxt(id, d(e.prix))}) puis est revenu de l’autre côté.`, sens: haut ? 'Le prix est allé chercher les ordres stop au-dessus du niveau puis est revenu : plutôt un piège acheteur, un mouvement baissier est envisageable (tendance générale, pas une règle).' : 'Le prix est allé chercher les ordres stop sous le niveau puis est revenu : plutôt un piège vendeur, un mouvement haussier est envisageable (tendance générale, pas une règle).', stats: 'Pas de statistique chiffrée sur les balayages dans notre base pour le moment.', derives, nom, N, T }));
  }
  /* 4. début probable d'un mouvement de plusieurs jours */
  for (const g of (F.grosMouvements || []).filter(x => x.fin >= maintenant - 12 * H && Math.abs(x.atrH4) >= (F.calibrage ? F.calibrage.seuil * 1.2 : 3))) {
    const cassure = evts.find(x => x.type === 'croisement_ma200' && GRANDES.includes(x.unite) && x.dir === g.sens), gros = evts.find(x => x.type === 'volume_extreme' && x.dir === g.sens && x.t >= g.depart - 8 * H);
    if (!cassure && !gros) continue;
    const chiffres = [{ label: `${g.pct > 0 ? '+' : '−'}${fr(Math.abs(d(g.pct)), 1)} % en ${d(g.bougiesH4)} bougies H4`, pourquoi: POURQUOI.amplitude }, { label: `${fr(Math.abs(d(g.atrH4)), 1)} fois l’ATR H4`, pourquoi: POURQUOI.amplitude }, gros ? { label: `volume ${fr(d(gros.volumeRel), 1)} fois la normale`, pourquoi: POURQUOI.volume } : null, cassure ? { label: `cassure de la MA200 ${NOM_UNITE[cassure.unite]} dans le même sens`, pourquoi: POURQUOI.cloture } : null, chiffreScore].filter(Boolean).slice(0, 5);
    M.push(moment(F, { type: 'debut_mouvement', t: g.fin, unite: 'H4', dir: g.sens, severite: 3, titre: `début probable d’un mouvement de plusieurs jours ${g.sens > 0 ? 'à la hausse' : 'à la baisse'}`, chiffres, surl: [{ type: 'bougie', t: g.depart, unite: 'H4' }, ...(cassure ? [{ type: 'ma200', unite: cassure.unite }] : [])],
      voit: `${nom.charAt(0).toUpperCase() + nom.slice(1)} vient de faire ${g.sens > 0 ? 'une hausse' : 'une baisse'} de ${fr(Math.abs(d(g.pct)), 1)} % en ${d(g.bougiesH4)} bougies H4, soit ${fr(Math.abs(d(g.atrH4)), 1)} fois l’ATR H4${cassure ? `, avec une cassure de la MA200 ${NOM_UNITE[cassure.unite]} dans le même sens` : ''}${gros ? `${cassure ? ' et' : ', avec'} une bougie de volume ${fr(d(gros.volumeRel), 1)} fois la normale` : ''}.`,
      sens: 'Un mouvement de cette taille, appuyé par le volume ou une cassure, démarre souvent une séquence de plusieurs jours, mais il peut aussi se replier avant (tendance générale, pas une règle).', stats: F.statsJ && F.statsJ.dispo && !F.statsJ.petit ? `Dans ${fr(d(F.statsJ.cas), 0)} situations de tendance Daily semblables, la plus forte ${g.sens > 0 ? 'hausse' : 'baisse'} atteinte en 5 jours a été de ${fr(d(g.sens > 0 ? F.statsJ.hausseMaxMedianePct : F.statsJ.baisseMaxMedianePct), 1)} % en médiane.` : 'Pas assez de cas semblables dans notre base pour chiffrer la suite.', derives, nom, N, T }));
  }
  /* peu de situations : au plus 2 par actif, les plus sévères et les plus récentes */
  const vus = new Set(); return M.filter(m => !vus.has(m.id) && vus.add(m.id)).sort((a, b) => b.severite - a.severite || b.t - a.t).slice(0, 2);
}
function moment(F, o) {
  const { type, t, unite, dir, severite, titre, chiffres, surl, voit, sens, stats, derives, nom, N, T } = o, id = F.actif, d = v => { derives.push(v); return v; };
  const ctx = sensCtx(F), inval = dir > 0 ? N.dessous : N.dessus, alt = dir > 0 ? N.dessus : N.dessous;
  const scenario = `Scénario : ${type === 'balayage' ? (dir > 0 ? 'rebond' : 'repli') : dir > 0 ? 'poursuite de la hausse' : 'poursuite de la baisse'}${alt ? `, avec ${alt.nom} (${prixTxt(id, d(alt.prix))}) comme prochain repère` : ''}.`;
  const invalide = inval ? `Ce qui l’invaliderait : une clôture ${dir > 0 ? 'sous' : 'au-dessus'} ${deNom(inval.nom)} (${prixTxt(id, d(inval.prix))}).` : 'Ce qui l’invaliderait : le retour du prix de l’autre côté du dernier niveau franchi.';
  const accord = ctx !== 0 && ctx === dir ? 'Il va dans le sens du contexte Daily et H4.' : ctx !== 0 && ctx !== dir ? 'Il va contre le contexte Daily et H4 : raison de plus de rester prudent.' : 'Le contexte Daily et H4 est mixte.';
  const surlignages = surl.concat((N.dessus ? [{ type: 'niveau', prix: N.dessus.prix, titre: N.dessus.nom }] : []), (N.dessous ? [{ type: 'niveau', prix: N.dessous.prix, titre: N.dessous.nom }] : []));
  const parlee = [`Regarde ça : ${titre} sur ${nom}.`, voit, sens, accord, stats, scenario, invalide, 'Je ne te dis pas quoi faire : c’est ce que montrent les outils.'].filter(Boolean).join(' ');
  const faits = collecterFaits({ F }, { nombres: derives }), verif = retirerInconnus(parlee, faits);
  return { id: `${type}|${F.actif}|${unite || ''}|${t}`, type, actif: F.actif, nom, t, dir, unite, severite, titre: `${titre.charAt(0).toUpperCase() + titre.slice(1)} — ${nom}`, chiffres, surlignages, texteVoix: verif.texte, retirees: verif.retirees, scenario, invalidation: invalide, stats, accord, F };
}
/* résumé d'un moment sans la fiche complète (alertes, Telegram, stockage) */
export const resumeMoment = m => ({ id: m.id, type: m.type, actif: m.actif, t: m.t, dir: m.dir, unite: m.unite, severite: m.severite, titre: m.titre, texte: m.texteVoix, chiffres: m.chiffres.map(c => c.label) });
/* phrase d'alerte : une phrase claire + le conseil (jamais un ordre) */
export function phraseAlerteMoment(m) {
  const base = { cassure_ma200: 'Cassure confirmée de la MA200', climax: 'Bougie de volume extrême', balayage: 'Balayage d’un niveau clé', debut_mouvement: 'Début probable d’un mouvement de plusieurs jours' }[m.type] || 'Gros moment';
  const conseil = { cassure_ma200: 'regarde si la clôture suivante tient avant de lire quoi que ce soit', climax: m.dir > 0 ? 'méfie-toi, un scénario de retournement baissier est envisageable' : 'méfie-toi, un scénario de rebond est envisageable', balayage: 'regarde si le prix reste de l’autre côté du niveau', debut_mouvement: 'regarde le graphique : le mouvement est peut-être déjà bien avancé' }[m.type] || 'regarde le graphique';
  return `${base} sur ${m.nom} (${NOM_UNITE[m.unite] || m.unite}) : ${conseil}.`;
}
