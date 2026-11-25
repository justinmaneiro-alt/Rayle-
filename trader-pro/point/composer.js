/* ═════════════ LES POINTS DE RAYLE : « dis-moi tout », cette nuit, point du matin, point de la journée, où en est l'or ═════════════
   Rayle raconte comme une analyste qui est restée devant les écrans : ce qui s'est passé (session par session), ce que tu as raté, où on en est, ce que ça veut dire, scénario principal et alternatif, conseil, agenda.
   RÈGLE ANTI-INVENTION : tout chiffre vient de la fiche de lecture (phase 1), du réseau d'information (phase 3) ou d'un calcul fait ICI par le code à partir d'eux (enregistré dans `derives`) ; jamais par une IA.
   `trader-pro/point/faits.js` revérifie chaque nombre du texte final. Lecture seule : Rayle ne dit jamais « vas-y » ni « n'y va pas ». Ton : phrases parlées, pas de liste de chiffres lue bêtement. */
import { collecterFaits, retirerInconnus, verifierTexte } from './faits.js';
import { fenetresDe, sessionEn, debutNuit, plageParis, heureParis, TZ } from '../lecture/sessions.js';
import { actifParId } from '../lecture/fiche.js';

export const H = 3600e3, J = 86400e3;
export const TYPES = Object.freeze({ depuis: 'depuis ta dernière connexion', nuit: 'cette nuit', matin: 'point du matin', journee: 'point de la journée', actif: 'point sur un actif' });
export const BUDGET_MOTS = Object.freeze({ matin: 340, nuit: 300, journee: 300, depuis: 320, actif: 260 });
const DEC = { or: 0, us100: 0, us500: 0, btc: 0, sol: 2, petrole: 2, dxy: 2 };
const NOM = id => (actifParId[id] ? actifParId[id].nom : id), NOM_COURT = id => (actifParId[id] ? actifParId[id].nomCourt : id);
const Maj = s => s.charAt(0).toUpperCase() + s.slice(1);
const NOMS_NIVEAUX = { PDH: 'le plus haut de la veille', PDL: 'le plus bas de la veille', PWH: 'le plus haut de la semaine passée', PWL: 'le plus bas de la semaine passée', 'Asie haut': 'le haut du range asiatique', 'Asie bas': 'le bas du range asiatique' };
const deNom = s => String(s).replace(/^le /, 'du ').replace(/^la /, 'de la ').replace(/^les /, 'des ').replace(/^un /, 'd’un ').replace(/^une /, 'd’une ').replace(/^l’/, 'de l’');
const NOM_UNITE = { J: 'Daily', H4: 'H4', H1: 'H1', M15: 'M15', M5: 'M5' };
const fr = (v, d = 1) => (Number.isFinite(v) ? v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/[\u00a0\u202f ]/g, ' ') : '?');
const sg = (v, d = 1) => (v > 0 ? '+' : v < 0 ? '−' : '') + fr(Math.abs(v), d);
const prix = (id, v) => fr(v, DEC[id] ?? 2);
const heureP = t => heureParis(t).replace(/^0/, '').replace(':', ' h ').replace(/ h 00$/, ' h');
const jourP = (t, now) => { const j = x => new Date(x).toLocaleDateString('fr-CA', { timeZone: TZ.paris }); return j(t) === j(now) ? '' : j(t) === j(now - J) ? 'hier ' : new Date(t).toLocaleDateString('fr-FR', { timeZone: TZ.paris, weekday: 'long' }) + ' '; };
const quand = (t, now) => `${jourP(t, now)}à ${heureP(t)}`;
const dureeParlee = ms => { const h = Math.round(ms / H); return h < 1 ? 'moins d’une heure' : h < 48 ? `${h} heure${h > 1 ? 's' : ''}` : `${Math.round(h / 24)} jours`; };

/* ───── fenêtre de temps : mouvement de l'actif entre `depuis` et maintenant, à partir des bougies H1 de la fiche ───── */
export function mouvementFenetre(F, depuis, maintenant) {
  const B = (F.h1 || []).filter(b => b[0] + H <= maintenant); if (B.length < 3 || !Number.isFinite(F.prix)) return null;
  const avant = B.filter(b => b[0] + H <= depuis), dedans = B.filter(b => b[0] + H > depuis), tronque = !avant.length, p0 = avant.length ? avant[avant.length - 1][4] : B[0][1];
  let hi = F.prix, lo = F.prix, tHi = maintenant, tLo = maintenant; for (const b of dedans) { if (b[2] > hi) { hi = b[2]; tHi = b[0]; } if (b[3] < lo) { lo = b[3]; tLo = b[0]; } }
  return { p0, p1: F.prix, pct: (F.prix / p0 - 1) * 100, hi, lo, tHi, tLo, nbBarres: dedans.length, tronque };
}
const niveauxPlats = F => {
  const L = [], T = F.tendance || {}, r = (F.niveaux && F.niveaux.reperes) || {};
  if (T.H4 && T.H4.ma200) L.push({ nom: 'la MA200 H4', prix: T.H4.ma200, cle: 'ma200h4' }); if (T.J && T.J.ma200) L.push({ nom: 'la MA200 Daily', prix: T.J.ma200, cle: 'ma200j' });
  for (const [k, n] of [['PDH', 'le plus haut de la veille'], ['PDL', 'le plus bas de la veille'], ['PWH', 'le plus haut de la semaine passée'], ['PWL', 'le plus bas de la semaine passée']]) if (r[k]) L.push({ nom: n, prix: r[k], cle: k });
  for (const s of (F.niveaux && F.niveaux.supports) || []) L.push({ nom: `un support ${NOM_UNITE[s.unite] || s.unite}`, prix: s.prix, cle: 'sup' }); for (const s of (F.niveaux && F.niveaux.resistances) || []) L.push({ nom: `une résistance ${NOM_UNITE[s.unite] || s.unite}`, prix: s.prix, cle: 'res' });
  const ra = F.niveaux && F.niveaux.rangeAsie; if (ra && !ra.enCours) { L.push({ nom: 'le haut du range asiatique', prix: ra.haut, cle: 'asieH' }, { nom: 'le bas du range asiatique', prix: ra.bas, cle: 'asieB' }); }
  return L.filter(x => Number.isFinite(x.prix));
};
export function niveauxProches(F) {
  const L = niveauxPlats(F), px = F.prix, atr = F.atrJ; const au = L.filter(x => x.prix > px).sort((a, b) => a.prix - b.prix)[0] || null, en = L.filter(x => x.prix <= px).sort((a, b) => b.prix - a.prix)[0] || null;
  const enrichir = x => x && { ...x, distPct: (x.prix / px - 1) * 100, distAtrJ: atr ? (x.prix - px) / atr : null }; return { dessus: enrichir(au), dessous: enrichir(en), tous: L };
}

/* ───── le compositeur ───── */
export function blocActif(F, ctx) {
  const { depuis, maintenant, reseau, evenements = [] } = ctx, id = F.actif, nom = NOM(id), derives = [], d = v => { derives.push(v); return v; }, S = [], prio = (t, p, cat) => S.push({ t, p, cat });
  const W = mouvementFenetre(F, depuis, maintenant), px = F.prix, N = niveauxProches(F), T = F.tendance || {};
  const evts = (F.evenements || []).filter(e => e.t >= depuis && e.t <= maintenant + 60e3);
  /* 1. ce qui s'est passé */
  if (F.tPrix && maintenant - F.tPrix > 3 * H) prio(`Attention : mon dernier prix pour ${nom} date de ${quand(F.tPrix, maintenant)} ; soit le marché est fermé, soit mes données sont en retard.`, 11, 'fraicheur');
  if (W) {
    const duree = dureeParlee(maintenant - depuis), tronque = W.tronque ? ` (je n’ai les bougies que sur ${d(F.h1.length)} heures)` : '';
    if (Math.abs(W.pct) < 0.15) prio(`${Maj(nom)} est resté calme depuis ${duree} : ${sg(d(+W.pct.toFixed(2)), 2)} %, entre ${prix(id, d(W.lo))} et ${prix(id, d(W.hi))}${tronque}.`, 5, 'passe');
    else prio(`${Maj(nom)} ${W.pct > 0 ? 'a pris' : 'a perdu'} ${fr(Math.abs(d(+W.pct.toFixed(1))), 1)} % depuis ${duree}, de ${prix(id, d(W.p0))} à ${prix(id, d(px))}, avec un plus haut à ${prix(id, d(W.hi))} et un plus bas à ${prix(id, d(W.lo))}${tronque}.`, 9, 'passe');
  } else prio(`${Maj(nom)} : je n’ai pas assez de bougies récentes pour raconter la période.`, 2, 'passe');
  for (const e of evts) {
    if (e.type === 'croisement_ma200' && ['J', 'H4', 'H1'].includes(e.unite)) {
      const stat = { confirmee: 'et il tient depuis', confirmee_puis_perdue: 'mais il est ensuite repassé de l’autre côté', echouee: 'mais c’était une fausse cassure : il est revenu', en_attente: 'cassure pas encore confirmée (il faut des clôtures qui tiennent)' }[e.statut], vol = e.vraieCassure ? `avec une bougie de volume ${fr(d(e.volumeRelMax), 1)} fois supérieure à la normale` : e.volumeRelMax != null ? `sans fort volume (${fr(d(e.volumeRelMax), 1)} fois la normale)` : 'volume non disponible';
      prio(`${Maj(quand(e.t, maintenant))}, ${nom} a cassé la MA200 ${NOM_UNITE[e.unite]} à la ${e.dir > 0 ? 'hausse' : 'baisse'} (clôture ${prix(id, d(e.prix))}, MA200 ${prix(id, d(e.ma200))}), ${vol}, ${stat}.`, e.vraieCassure ? 10 : e.unite === 'J' ? 9 : 7, 'cassure');
    } else if (e.type === 'volume_extreme' && ['J', 'H4', 'H1'].includes(e.unite)) {
      const vol = F.volume && F.volume[e.unite] && F.volume[e.unite].liste.find(x => Math.abs(x.tFin - e.t) < 1000), ctx2 = { fin: 'en fin de mouvement', range: 'en sortie de range', milieu: 'en plein mouvement' }[e.contexte] || '', pos = e.positionMa200 === 'dessus' ? 'au-dessus de la MA200' : e.positionMa200 === 'dessous' ? 'sous la MA200' : '';
      let stat = ''; if (vol && vol.stats) stat = vol.stats.petit ? ` Échantillon trop petit pour dire ce qui suit d’habitude (${d(vol.stats.n)} cas).` : ` Sur ${d(vol.stats.n)} cas semblables, ${d(vol.stats.continuation5Pct)} % ont continué et ${d(vol.stats.retournement5Pct)} % se sont retournés dans les 5 bougies suivantes.`;
      prio(`${Maj(quand(e.t, maintenant))}, grosse bougie ${NOM_UNITE[e.unite]} ${e.dir > 0 ? 'acheteuse' : 'vendeuse'} sur ${nom} : volume ${fr(d(e.volumeRel), 1)} fois la normale${ctx2 ? ', ' + ctx2 : ''}${pos ? ', ' + pos : ''}.${stat}`, e.volumeRel >= 3 ? 8 : 6, 'volume');
    } else if (e.type === 'balayage') prio(`${Maj(nom)} a balayé ${NOMS_NIVEAUX[e.niveau] || e.niveau} (${prix(id, d(e.prix))}) ${e.cote === 'haut' ? 'par le haut' : 'par le bas'} puis il est revenu : ${e.sensProbable === 'baissier' ? 'plutôt un piège acheteur' : 'plutôt un piège vendeur'}.`, 7, 'balayage');
  }
  /* 2. ce que tu as raté : les gros mouvements */
  const rate = [], montre = [];
  for (const g of (F.grosMouvements || []).filter(x => x.fin >= depuis)) {
    const sess = sessionEn(g.depart), vols = evts.filter(e => e.type === 'volume_extreme' && e.t >= g.depart && e.t <= g.fin + H4_MS).sort((a, b) => b.volumeRel - a.volumeRel)[0];
    const decl = declencheur(F, g, reseau, evenements, evts), part = g.prixFin !== g.prixDepart ? (g.prixFin - px) / (g.prixFin - g.prixDepart) : 0;
    const etat = part < -0.05 ? 'il continue encore au-delà de son précédent extrême' : part <= 0.2 ? 'il tient près de son extrême : pour l’instant ce n’est pas fini' : part <= 0.6 ? `il a déjà rendu ${fr(d(Math.round(part * 100)), 0)} % du mouvement : plutôt une pause ou un repli en cours` : `il a rendu ${fr(d(Math.round(Math.min(part, 1) * 100)), 0)} % du mouvement : l’essentiel est derrière nous`;
    const suite = g.sens > 0 ? N.dessus : N.dessous, reste = part < -0.05 ? `Reste à voir où il s’arrête : le prochain repère est ${suite ? suite.nom + ' (' + prix(id, d(suite.prix)) + ')' : 'le dernier niveau connu'}.` : part <= 0.2 ? `Reste à voir si une continuation suit ou si un repli vers ${N.dessous && g.sens > 0 ? N.dessous.nom + ' (' + prix(id, d(N.dessous.prix)) + ')' : N.dessus && g.sens < 0 ? N.dessus.nom + ' (' + prix(id, d(N.dessus.prix)) + ')' : 'le dernier niveau'} se produit d’abord.` : part <= 0.6 ? 'Un repli plus profond reste possible, mais le mouvement n’est pas annulé tant que le prix ne reperd pas son point de départ.' : 'Il reste surtout à voir si le prix retrouve son point de départ, ce qui annulerait le mouvement.';
    const corps = `Tu as raté un gros mouvement sur ${nom} : ${g.sens > 0 ? 'hausse' : 'baisse'} de ${fr(Math.abs(d(g.pct)), 1)} % en ${d(g.bougiesH4)} bougies H4, ${quand(g.depart, maintenant)} (session ${sess.id === 'creux' ? 'creux du soir' : sess.nom}), soit ${fr(Math.abs(d(g.atrH4)), 1)} fois l’ATR H4${vols ? `, avec une bougie de volume ${fr(d(vols.volumeRel), 1)} fois la normale` : ''}${decl ? ', déclenché par ' + decl : ''}. Maintenant, ${etat}.`; rate.push({ actif: id, texte: corps + ' ' + reste, court: corps, t0: g.depart, t1: g.fin });
    montre.push({ actif: id, unite: 'H4', t0: g.depart - 6 * H, t1: Math.min(maintenant, g.fin + 8 * H), titre: `Gros mouvement ${g.sens > 0 ? 'haussier' : 'baissier'} sur ${nom}`, niveaux: niveauxPlats(F).slice(0, 8) });
  }
  /* 3. où on en est */
  const nv = [N.dessus && `${N.dessus.nom} à ${prix(id, d(N.dessus.prix))} (${sg(d(+N.dessus.distPct.toFixed(1)), 1)} %)`, N.dessous && `${N.dessous.nom} à ${prix(id, d(N.dessous.prix))} (${sg(d(+N.dessous.distPct.toFixed(1)), 1)} %)`].filter(Boolean);
  const ou = nv.length ? `${Maj(nom)} vaut ${prix(id, d(px))}. Les repères les plus proches : ${nv.join(' et ')}.` : `${Maj(nom)} vaut ${prix(id, d(px))}.`;
  /* 4. ce que ça veut dire (connaissances : tendances générales, pas des règles) */
  const lect = [], sJ = T.J && T.J.sens, s4 = T.H4 && T.H4.sens, nm = s => ({ haussier: 'haussier', baissier: 'baissier', mixte: 'mixte' }[s] || 'indéterminé');
  if (sJ && s4) lect.push(sJ === s4 && sJ !== 'mixte' ? `Le Daily et le H4 sont du même côté de leur MA200 (${nm(sJ)}) : c’est le contexte le plus lisible.` : `Le Daily est ${nm(sJ)} et le H4 ${nm(s4)} : la H4 ressemble plutôt à un repli ou un rebond dans le sens du Daily, il faut rester prudent.`);
  if (T.H4 && Number.isFinite(T.H4.ecartAtr) && Math.abs(T.H4.ecartAtr) >= 6) lect.push(`Le prix est très étiré de sa MA200 H4 (${fr(d(Math.abs(T.H4.ecartAtr)), 1)} ATR) : un rebond sur cette moyenne est peu probable à court terme, le marché a d’abord tendance à se calmer.`);
  const vraie = evts.find(e => e.type === 'croisement_ma200' && e.vraieCassure && ['J', 'H4'].includes(e.unite)); if (vraie) lect.push('Une cassure avec ce volume, c’est en général plus sérieux qu’une simple touche (tendance générale, pas une règle).');
  const fin = evts.find(e => e.type === 'volume_extreme' && e.contexte === 'fin'); if (fin) lect.push(fin.dir > 0 ? 'Grosse bougie de volume tout en haut du mouvement : un essoufflement, donc un retournement baissier, est envisageable.' : 'Grosse bougie de volume tout en bas du mouvement : une capitulation, donc un rebond, est envisageable.');
  const reg = F.regime && F.regime.H4; if (reg && reg.dispo) lect.push(reg.type === 'range' ? `Sur le H4 le marché est plutôt en range (efficacité ${fr(d(reg.efficacite), 2)}) : les cassures de MA200 y sont plus souvent du bruit.` : `Sur le H4 le marché est en tendance (efficacité ${fr(d(reg.efficacite), 2)}).`); if (reg && reg.compression) lect.push('La volatilité est comprimée : un mouvement peut se préparer, sans que cela dise dans quel sens.');
  if (F.score && F.score.score100 != null) lect.push(`Le score de marché est de ${fr(d(F.score.score100), 0)} sur 100 (${F.score.verdict.toLowerCase()}).`); if (F.cot && F.cot.extreme) lect.push(`Les fonds sont à un extrême ${F.cot.extreme === 'haut' ? 'acheteur' : 'vendeur'} (COT à ${fr(d(F.cot.indexSpec), 0)} sur 100) : ça n’est pas un timing, mais ça rend le camp dominant plus fragile.`);
  if (F.carnet) lect.push(`Le carnet d’ordres est acheteur à ${fr(d(F.carnet.acheteursPct10), 0)} % sur les 10 premiers niveaux (instantané).`);
  /* 5. scénarios */
  const sens = (sJ === s4 && sJ !== 'mixte') ? (sJ === 'haussier' ? 1 : -1) : (s4 === 'haussier' ? 1 : s4 === 'baissier' ? -1 : 0), st = F.statsJ; let scen = null;
  if (sens && px) {
    const inval = sens > 0 ? N.dessous : N.dessus, invAlt = sens > 0 ? N.dessus : N.dessous, obj = st && st.dispo && !st.petit ? (sens > 0 ? st.hausseMaxMedianePct : st.baisseMaxMedianePct) : null;
    scen = { principal: `Scénario principal : ${sens > 0 ? 'poursuite de la hausse' : 'poursuite de la baisse'}${obj != null ? `. Dans ${fr(d(st.cas), 0)} situations semblables de notre base, la plus forte ${sens > 0 ? 'hausse' : 'baisse'} atteinte en 5 jours a été de ${sg(d(obj), 1)} % en médiane` : ' (pas assez de cas semblables dans notre base pour chiffrer un objectif)'}${inval ? `. Il serait mis en défaut par une clôture ${sens > 0 ? 'sous' : 'au-dessus'} ${deNom(inval.nom)} (${prix(id, d(inval.prix))})` : ''}.`,
      alternatif: `Scénario alternatif : ${sens > 0 ? 'repli ou retournement baissier' : 'rebond ou retournement haussier'}${invAlt ? `, qui deviendrait crédible après une clôture ${sens > 0 ? 'sous' : 'au-dessus'} ${deNom(inval ? inval.nom : 'le dernier niveau')} et serait écarté si le prix franchit ${invAlt.nom} (${prix(id, d(invAlt.prix))})` : ''}.` };
  }
  /* 6. conseil copilote (outil et chiffre cités ; jamais un ordre) */
  const cons = []; let aligne = 0; if (sJ === s4 && sJ !== 'mixte') aligne++; if (reg && reg.type === 'tendance') aligne++; if (evts.some(e => e.type === 'croisement_ma200' && e.vraieCassure && e.dir === sens)) aligne++; if (st && st.dispo && !st.petit && ((sens > 0 && st.partHaussePct >= 55) || (sens < 0 && st.partHaussePct <= 45))) aligne++; if (F.score && F.score.score100 != null && ((sens > 0 && F.score.score100 >= 58) || (sens < 0 && F.score.score100 <= 42))) aligne++;
  const confiance = !sens ? 'signal faible' : aligne >= 4 ? 'signal assez solide' : aligne >= 2 ? 'signal moyen' : 'signal faible';
  const ma4 = T.H4 && T.H4.ma200;
  if (sens && ma4) { const dist = (ma4 / px - 1) * 100; cons.push(sens > 0 ? `On privilégie plutôt les achats sur un repli vers la MA200 H4 (${prix(id, d(ma4))}, à ${fr(Math.abs(d(+dist.toFixed(1))), 1)} % ${dist < 0 ? 'en dessous' : 'au-dessus'} du prix), d’après la position du prix et la pente de la MA200 H4` : `On privilégie plutôt les ventes sur un rebond vers la MA200 H4 (${prix(id, d(ma4))}, à ${fr(Math.abs(d(+dist.toFixed(1))), 1)} % ${dist > 0 ? 'au-dessus' : 'en dessous'} du prix), d’après la position du prix et la pente de la MA200 H4`); }
  if (fin) cons.push(`Attention : grosse bougie de volume ${fr(d(fin.volumeRel), 1)} fois la normale ${fin.dir > 0 ? 'tout en haut du mouvement, un retournement baissier est envisageable' : 'tout en bas du mouvement, un rebond est envisageable'} (outil Bougies volume, ${NOM_UNITE[fin.unite]})`);
  const ag = (F.agenda || []).filter(a => a.t > maintenant && a.t < maintenant + 8 * H)[0]; if (ag) cons.push(`Prudence avant ${ag.titre} à ${heureP(ag.t)}`);
  return { actif: id, nom, F, W, passe: S, rate, montre, ou, lect, scen, cons, confiance, sens, derives, interet: (W ? Math.abs(W.pct) / Math.max(0.2, (F.tendance && F.tendance.J && F.tendance.J.atrPct) || 1) : 0) + rate.length * 3 + evts.filter(e => e.type !== 'gros_mouvement').length * 0.7, evts };
}
const H4_MS = 4 * H;
/* ce qui a déclenché un gros mouvement : annonce, actualité, personnalité, cassure de MA200, balayage (dans les 3 heures qui encadrent son départ) */
export function declencheur(F, g, reseau, evenements, evts) {
  const a = g.depart - 3 * H, b = g.depart + 3 * H, id = F.actif;
  const ann = (evenements || []).filter(e => e.t >= a && e.t <= b && e.impact === 'fort' && (e.pays === 'USD' || e.pays === 'EUR')).sort((x, y) => Math.abs(x.t - g.depart) - Math.abs(y.t - g.depart))[0];
  if (ann) return `l’annonce « ${ann.titre} »`;
  const carte = ((reseau && reseau.cartes) || []).filter(c => c.actifs.includes(id) && c.t >= a && c.t <= b && c.score >= 50).sort((x, y) => y.score - x.score)[0];
  if (carte) return carte.personne ? `${carte.reaction && carte.reaction.max ? '' : ''}les propos de ${carte.personne.charAt(0).toUpperCase() + carte.personne.slice(1)} (« ${carte.titre.length > 70 ? carte.titre.slice(0, 67) + '…' : carte.titre} », importance ${carte.score})` : `une info marquante (« ${carte.titre.length > 70 ? carte.titre.slice(0, 67) + '…' : carte.titre} », importance ${carte.score})`;
  const cr = evts.find(e => e.type === 'croisement_ma200' && e.t >= a && e.t <= b + H); if (cr) return `la cassure de la MA200 ${NOM_UNITE[cr.unite]}`;
  const ba = evts.find(e => e.type === 'balayage' && e.t >= a && e.t <= b + H); if (ba) return `le balayage de ${ba.niveau}`;
  return null;
}

/* ───── lecture session par session (nuit, journée, absence) ───── */
export function lectureSessions(F, depuis, maintenant) {
  const out = [], nom = NOM(F.actif);
  for (const s of (F.sessions || []).filter(x => x.fin > depuis && x.debut < maintenant && x.id !== 'creux')) {
    const typ = s.comportement && s.comportement.typique, txt = s.comportement ? s.comportement.texte : '';
    out.push({ id: s.id, nom: s.nom, plage: s.plageParis, pct: s.pct, amplitudeAtrJ: s.amplitudeAtrJ, enCours: s.enCours, texte: `${s.nom}${s.enCours ? ' (en cours)' : ''} : ${nom} ${Math.abs(s.pct) < 0.1 ? 'presque stable' : (s.pct > 0 ? 'en hausse de ' : 'en baisse de ') + fr(Math.abs(s.pct), 1) + ' %'}${Number.isFinite(s.amplitudeAtrJ) ? ', amplitude ' + fr(s.amplitudeAtrJ, 1) + ' ATR du jour' : ''}${txt ? ' ; ' + txt : ''}${typ === false ? ', c’est inhabituel' : typ === true ? ', comportement typique' : ''}.` });
  }
  return out;
}

/* ───── assemblage ───── */
export function fenetreDe(type, maintenant, depuis) {
  if (type === 'depuis') return depuis; if (type === 'nuit' || type === 'matin') return debutNuit(maintenant);
  if (type === 'journee') { const F = fenetresDe(maintenant); return F[1].debut <= maintenant ? F[1].debut : F[0].debut; } return depuis ?? maintenant - 12 * H;
}
const agendaTexte = (fiches, maintenant) => {
  const ev = new Map(); for (const F of Object.values(fiches)) for (const a of F.agenda || []) if (a.t > maintenant - 30 * 60e3) ev.set(a.t + a.titre, a); const L = [...ev.values()].sort((a, b) => a.t - b.t).slice(0, 4);
  const sess = fenetresDe(maintenant).concat(fenetresDe(maintenant + J)).filter(s => s.debut > maintenant && s.id !== 'creux').slice(0, 2);
  const hm = t => { const p = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ.paris, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(t)); return [+p.find(x => x.type === 'hour').value, +p.find(x => x.type === 'minute').value]; }, hh = [...L.map(a => a.t), ...sess.map(s => s.debut)].map(hm);
  const P = []; if (L.length) P.push(`Au programme : ${L.map(a => `${a.titre} à ${heureP(a.t)}`).join(', ')}.`); else P.push('Pas d’annonce majeure au programme pour le moment.');
  if (sess.length) P.push(`Sessions à surveiller : ${sess.map(s => `${s.nom} à ${heureP(s.debut)}`).join(', puis ')}.`); return { texte: P.join(' '), annonces: L, heures: hh.map(x => x[0]), minutes: hh.map(x => x[1]) };
};
export function composerPoint({ type = 'depuis', fiches = {}, actifs = null, depuis = null, maintenant = Date.now(), reseau = null, evenements = [], absenceMs = null } = {}) {
  const ids = (actifs && actifs.length ? actifs : Object.keys(fiches)).filter(id => fiches[id] && Number.isFinite(fiches[id].prix)), t0 = fenetreDe(type, maintenant, depuis ?? maintenant - 12 * H);
  if (!ids.length) return { type, vide: true, texteParle: 'Je n’ai pas de lecture de marché disponible pour le moment : les fiches ne sont pas encore calculées.', sections: [], faits: collecterFaits({}), montre: [], actifs: [], t0, maintenant };
  const blocs = ids.map(id => blocActif(fiches[id], { depuis: t0, maintenant, reseau, evenements })).sort((a, b) => b.interet - a.interet), top = type === 'actif' ? blocs : blocs.slice(0, type === 'matin' ? 4 : 3), derives = blocs.flatMap(b => b.derives), sections = [], mots = BUDGET_MOTS[type] || 240;
  const intro = type === 'depuis' && absenceMs != null ? `Tu étais absent depuis ${dureeParlee(absenceMs)}. ` : type === 'matin' ? 'Bonjour Justin. Voici le point du matin. ' : type === 'nuit' ? 'Voici ce qui s’est passé depuis la clôture de New York. ' : type === 'journee' ? 'Voici le point de la journée : ce qu’ont fait Londres et New York. ' : '';
  /* ce qui s'est passé */
  const passe = []; for (const b of top) { const perime = b.passe.some(x => x.cat === 'fraicheur'), calme = !perime && b.W && Math.abs(b.W.pct) < 0.3 && !b.evts.some(e => e.type !== 'gros_mouvement'); if (calme && type !== 'actif') continue;   // un actif calme ne prend pas de place dans le récit
    const p = b.passe.filter(x => x.cat === 'fraicheur').concat(b.passe.filter(x => x.cat === 'passe').slice(0, 1)).concat(b.passe.filter(x => x.cat !== 'passe').sort((x, y) => y.p - x.p).slice(0, type === 'actif' ? 3 : 1)); for (const x of p) passe.push({ t: x.t, p: x.p }); }
  if (!passe.length) passe.push({ t: `Rien de marquant sur mes actifs depuis ${dureeParlee(maintenant - t0)} : les mouvements sont restés petits.`, p: 5 });
  sections.push({ id: 'passe', titre: 'Ce qui s’est passé', paragraphes: passe.map(x => x.t), prio: 10 });
  /* ce que tu as raté */
  const rate = blocs.flatMap(b => b.rate); if (rate.length) sections.push({ id: 'rate', titre: 'Ce que tu as raté', paragraphes: rate.slice(0, 3).map(r => r.texte), parle: rate.slice(0, type === 'actif' ? 3 : 2).map(r => (type === 'actif' ? r.texte : r.court)), prio: 12 });
  /* session par session */
  if (['nuit', 'matin', 'journee', 'depuis'].includes(type)) { const S = []; for (const b of top.slice(0, 3)) { const L = lectureSessions(b.F, t0, maintenant); if (L.length) S.push(...L.map(l => `${l.texte}`)); } if (S.length) sections.push({ id: 'sessions', titre: 'Session par session', paragraphes: S.slice(0, type === 'journee' ? 8 : 6), prio: 9 }); }
  sections.push({ id: 'ou', titre: 'Où on en est', paragraphes: top.slice(0, type === 'actif' ? 1 : 2).map(b => b.ou), prio: 8 });
  const lect = top.slice(0, type === 'actif' ? 1 : 2).flatMap(b => b.lect.slice(0, type === 'actif' ? 5 : 3).map(x => (type === 'actif' ? x : `${NOM_COURT(b.actif)} : ${x}`))); if (lect.length) sections.push({ id: 'lecture', titre: 'Ce que ça veut dire', paragraphes: lect, prio: 7 });
  const sc = top.filter(b => b.scen).slice(0, type === 'actif' ? 1 : 2).flatMap(b => [b.scen.principal, b.scen.alternatif]); if (sc.length) sections.push({ id: 'scenarios', titre: 'Scénarios', paragraphes: sc, parle: type === 'actif' ? sc : sc.slice(0, 2), prio: 10.6 });   /* à l'oral, les scénarios du seul actif le plus important */
  const cs = top.slice(0, type === 'actif' ? 1 : 2).flatMap(b => b.cons.map((c, i) => (i === 0 ? `${Maj(c)} (${b.confiance}).` : `${Maj(c)}.`))); if (cs.length) sections.push({ id: 'conseil', titre: 'Le conseil de la copilote', paragraphes: cs, prio: 11 });
  const ag = agendaTexte(Object.fromEntries(ids.map(id => [id, fiches[id]])), maintenant); sections.push({ id: 'agenda', titre: 'Agenda', paragraphes: [ag.texte], prio: 5 });
  /* texte parlé : on garde les sections par ordre de priorité jusqu'au budget de mots */
  const ordre = ['passe', 'rate', 'sessions', 'ou', 'lecture', 'scenarios', 'conseil', 'agenda'], reste = { v: mots - intro.split(/\s+/).length }, choisies = [];
  const parts = sections.filter(s => s.paragraphes.length).map(s => ({ s, mots: s.paragraphes.join(' ').split(/\s+/).length }));
  for (const { s } of [...parts].sort((a, b) => b.s.prio - a.s.prio)) { const phr = []; for (const p of (s.parle || s.paragraphes)) { const m = p.split(/\s+/).length; if (reste.v - m < 0 && phr.length && !(s.id === 'scenarios' && reste.v > -25)) break;   /* le scénario principal et l'alternatif vont toujours ensemble */ if (reste.v - m < -20 && !phr.length && s.prio < 11) continue; phr.push(p); reste.v -= m; } if (phr.length) choisies.push({ id: s.id, texte: phr.join(' ') }); }
  const parle = ordre.map(id => (choisies.find(c => c.id === id) || {}).texte).filter(Boolean); let texteParle = (intro + parle.join(' ')).replace(/\s+/g, ' ').trim();
  const montre = blocs.flatMap(b => b.montre).slice(0, 6), faits = collecterFaits({ fiches: ids.map(id => fiches[id]), reseau: reseau ? { cartes: (reseau.cartes || []).map(c => ({ score: c.score, t: c.t, reaction: c.reaction && c.reaction.max })) } : null, evenements }, { nombres: [...derives, ...(absenceMs != null ? [Math.round(absenceMs / H)] : [])], heures: ag.heures, minutes: ag.minutes });
  const verif = retirerInconnus(texteParle, faits); texteParle = verif.texte;
  for (const s of sections) s.paragraphes = s.paragraphes.filter(p => retirerInconnus(p, faits).ok);
  return { type, titre: Maj(TYPES[type]), t0, maintenant, actifs: ids, ordreActifs: blocs.map(b => b.actif), sections, texteParle, mots: texteParle.split(/\s+/).length, faits, retirees: verif.retirees, montre, confiances: Object.fromEntries(blocs.map(b => [b.actif, b.confiance])), agenda: ag.annonces, vide: false };
}
export { verifierTexte };
