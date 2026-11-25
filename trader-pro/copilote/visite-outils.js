/* ═════════════ « RAYLE, MONTRE-MOI » : la visite guidée des outils, en direct, sur le graphique de l'actif ═════════════
   Rayle parcourt les outils un par un (MA200, bougies volume, sessions, niveaux, carnet, score), SURLIGNE chaque élément pendant qu'elle explique ce qu'il dit à cet instant, et on peut l'interrompre :
   « pourquoi celle-là ? », « et le volume là ? ». Module pur, testé : les étapes (texte + éléments à surligner) et les réponses aux questions sont calculées à partir de la fiche de lecture ;
   l'affichage est dans copilote/regarde.js. Tout chiffre vient de la fiche. Lecture seule : aucun ordre. */
import { niveauxProches } from '../point/composer.js';
import { collecterFaits, retirerInconnus } from '../point/faits.js';
import { actifParId } from '../lecture/fiche.js';
import { heureParis } from '../lecture/sessions.js';

const fr = (v, d = 1) => (Number.isFinite(v) ? v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/[  ]/g, ' ').replace('-', '−') : '?');
const prix = v => fr(v, Math.abs(v) >= 100 ? 0 : 2);
const NOM_U = { J: 'Daily', H4: 'H4', H1: 'H1' };
const heureP = t => heureParis(t).replace(/^0/, '').replace(':', ' h ').replace(/ h 00$/, ' h');

export function etapesVisite(F, { unite = 'H4' } = {}) {
  if (!F || !Number.isFinite(F.prix)) return [];
  const nom = actifParId[F.actif] ? actifParId[F.actif].nom : F.actif, T = F.tendance || {}, N = niveauxProches(F), derives = [], d = v => { derives.push(v); return v; }, E = [];
  const U = T[unite] && T[unite].ma200 ? unite : 'H4', t = T[U] || {};
  /* 1. MA200 */
  if (t.ma200) E.push({ outil: 'ma200', titre: `La MA200 ${NOM_U[U]}`, surligner: [{ type: 'ma200', unite: U }, { type: 'niveau', prix: t.ma200, titre: `MA200 ${NOM_U[U]}` }],
    texte: `Voici la MA200 ${NOM_U[U]}, la moyenne des 200 dernières clôtures : elle est à ${prix(d(t.ma200))}. ${Maj(nom)} est ${t.position === 'dessus' ? 'au-dessus' : 'en dessous'}, à ${fr(Math.abs(d(t.ecartPct)), 1)} % soit ${fr(Math.abs(d(t.ecartAtr)), 1)} ATR, et la pente est ${t.pente20 || 'indéterminée'}. ${Math.abs(t.ecartAtr) >= 6 ? 'C’est très étiré : un rebond sur cette moyenne est peu probable à court terme.' : 'On est assez près pour que cette moyenne compte dans la lecture.'} Tendance générale, pas une règle.` });
  /* 2. bougies volume */
  const vu = [U, 'H4', 'H1', 'J'].find(u => F.volume && F.volume[u] && F.volume[u].disponible && F.volume[u].liste.length) || U, vol = F.volume && F.volume[vu] && F.volume[vu].disponible ? F.volume[vu].liste : [], v0 = vol[0];
  E.push(v0 ? { outil: 'volume', titre: 'Les bougies à fort volume', surligner: [{ type: 'bougie', t: v0.t, unite: vu }, { type: 'zone', bas: Math.min(v0.bas, v0.haut), haut: Math.max(v0.bas, v0.haut), titre: 'zone de la bougie' }],
    texte: `Voici la dernière bougie ${NOM_U[vu]} à gros volume : ${v0.dir > 0 ? 'acheteuse' : 'vendeuse'}, ${fr(d(v0.volumeRel), 1)} fois la normale (${v0.niveau === 'extreme' ? 'extrême' : 'forte'}), ${heureP(v0.tFin)}. ${v0.nomContexte ? `Elle est ${v0.nomContexte === 'fin de mouvement' ? 'en fin de mouvement' : v0.nomContexte === 'sortie de range' ? 'en sortie de range' : 'en plein mouvement'}.` : ''} ${v0.stats && !v0.stats.petit ? `Sur ${d(v0.stats.n)} cas semblables, ${d(v0.stats.continuation5Pct)} % ont continué et ${d(v0.stats.retournement5Pct)} % se sont retournés à 5 bougies.` : 'Échantillon trop petit pour dire ce qui suit d’habitude.'} Elle dit qu’il s’est passé quelque chose ici, pas dans quel sens ça continue.` }
    : { outil: 'volume', titre: 'Les bougies à fort volume', surligner: [], texte: `Je ne vois pas de bougie ${NOM_U[U]} à fort volume récente sur ${nom}${F.volume && F.volume[U] && !F.volume[U].disponible ? ' (volume non disponible pour cet actif)' : ''} : le volume est ordinaire, rien de particulier de ce côté.` });
  /* 3. sessions */
  const S = (F.sessions || []).filter(s => s.id !== 'creux').slice(-3), ra = F.niveaux && F.niveaux.rangeAsie;
  if (S.length) E.push({ outil: 'sessions', titre: 'Les sessions', surligner: [...(ra && !ra.enCours ? [{ type: 'niveau', prix: ra.haut, titre: 'haut du range asiatique' }, { type: 'niveau', prix: ra.bas, titre: 'bas du range asiatique' }] : [])],
    texte: `Les trois dernières sessions : ${S.map(s => `${s.nom}${s.enCours ? ' (en cours)' : ''} ${s.pct >= 0 ? '+' : '−'}${fr(Math.abs(s.pct), 1)} %${s.comportement && s.comportement.texte ? ' (' + s.comportement.texte + ')' : ''}`).join(' ; ')}. ${ra && !ra.enCours ? `Le range asiatique est entre ${prix(d(ra.bas))} et ${prix(d(ra.haut))} : ces deux repères sont souvent balayés à l’ouverture de Londres.` : ''}` });
  /* 4. niveaux */
  const nv = [N.dessus, N.dessous].filter(Boolean);
  if (nv.length) E.push({ outil: 'niveaux', titre: 'Les niveaux', surligner: nv.map(x => ({ type: 'niveau', prix: x.prix, titre: x.nom })),
    texte: `Les repères les plus proches : ${nv.map(x => `${x.nom} à ${prix(d(x.prix))} (${x.distPct >= 0 ? '+' : '−'}${fr(Math.abs(d(+x.distPct.toFixed(1))), 1)} %)`).join(' et ')}. Un niveau n’a de poids que s’il converge avec un autre repère : la MA200, une zone de volume, la veille ou la semaine passée.` });
  /* 5. carnet */
  E.push({ outil: 'carnet', titre: 'Le carnet d’ordres', surligner: [], texte: F.carnet ? `Le carnet d’ordres est acheteur à ${fr(d(F.carnet.acheteursPct10), 0)} % sur les 10 premiers niveaux (instantané). Un fort déséquilibre peut appuyer ou freiner le mouvement, mais les gros ordres peuvent être retirés avant d’être touchés.` : 'Je n’ai pas d’instantané du carnet d’ordres pour cet actif : il n’est lisible en direct que dans le terminal Volume, pour l’or, le Bitcoin et Solana.' });
  /* 6. score */
  if (F.score && F.score.score100 != null) E.push({ outil: 'score', titre: 'Le score de marché', surligner: [], texte: `Le score de marché est de ${fr(d(F.score.score100), 0)} sur 100 : ${F.score.verdict.toLowerCase()}. ${F.score.composants.length ? 'Ce qui pèse le plus : ' + [...F.score.composants].sort((a, b) => Math.abs(b.points) - Math.abs(a.points)).slice(0, 2).map(c => `${c.nom.toLowerCase()} (${c.points >= 0 ? '+' : '−'}${fr(Math.abs(d(c.points)), 0)} points)`).join(' et ') + '.' : ''} C’est une photographie, pas une prévision.` });
  E.push({ outil: 'fin', titre: 'En résumé', surligner: [], texte: `Voilà pour les outils sur ${nom}. Ils disent ensemble : ${F.biais === 'haussier' ? 'un contexte plutôt haussier' : F.biais === 'baissier' ? 'un contexte plutôt baissier' : 'un contexte mixte'}${F.score && F.score.score100 != null ? `, score ${fr(F.score.score100, 0)} sur 100` : ''}. Tu peux m’interrompre : demande-moi « pourquoi celle-là ? » ou « et le volume là ? ». Je ne décide pas à ta place.` });
  const faits = collecterFaits({ F }, { nombres: derives });
  return E.map(e => { const r = retirerInconnus(e.texte, faits); return { ...e, texte: r.texte || e.texte, retirees: r.retirees }; });
}
const Maj = s => s.charAt(0).toUpperCase() + s.slice(1);

/* questions pendant la visite : `etat` = { F, etape (objet), info (infosBougie de la bougie surlignée ou de la dernière), texteBougie } */
export function repondreQuestion(question, { F, etape = null, info = null, texteBougie = null } = {}) {
  const q = String(question || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'`]/g, ' ').replace(/\s+/g, ' ').trim();
  if (/pourquoi (celle|celui|ce|cette) ?(la|ci)?|pourquoi elle|pourquoi lui/.test(q) || /pourquoi.*(choisi|surligne|montre)/.test(q)) {
    if (!etape || !etape.surligner.length) return 'Je n’ai rien surligné à cette étape : je te parlais de l’outil en général.';
    const b = etape.surligner.find(s => s.type === 'bougie');
    if (etape.outil === 'volume' && b && info) return `Je l’ai choisie parce que c’est la dernière bougie ${NOM_U[b.unite] || ''} dont le volume dépasse deux fois la normale : ${info.rel != null ? fr(info.rel, 1) + ' fois, précisément' : 'volume mesuré'}. C’est elle qui peut avoir laissé une zone de support ou de résistance. Les autres bougies sont dans l’ordinaire.`;
    if (etape.outil === 'ma200') return 'J’ai surligné la MA200 parce que c’est le repère de tendance de base : le prix au-dessus ou en dessous dit qui domine, et la distance dit si le prix est étiré.';
    if (etape.outil === 'niveaux') return 'J’ai surligné les deux repères les plus proches du prix, un au-dessus et un en dessous : ce sont les endroits où le prix a le plus de chances de réagir en premier.';
    if (etape.outil === 'sessions') return 'J’ai surligné le haut et le bas du range asiatique : l’ouverture de Londres vient souvent les balayer avant de choisir une vraie direction.';
    return 'C’est l’élément le plus parlant de cet outil à cet instant.';
  }
  if (/volume/.test(q) && /(la|ici|celle|cette|bougie)/.test(q)) {
    if (!info) return 'Je n’ai pas de bougie sélectionnée : mets le graphique en pause sur une bougie et redemande-moi.';
    return texteBougie ? texteBougie : (info.rel == null ? 'Je n’ai pas de volume fiable pour cette bougie.' : `Le volume de cette bougie est ${fr(info.rel, 1)} fois la normale${info.niveau ? ' : c’est une bougie à volume ' + (info.niveau === 'extreme' ? 'extrême' : 'fort') : ' : ordinaire'}.`);
  }
  if (/ma ?200|moyenne/.test(q) && info && info.ma != null) return `À cette bougie la MA200 est à ${prix(info.ma)} et le prix ${info.positionMa === 'dessus' ? 'au-dessus' : 'en dessous'}, à ${fr(Math.abs(info.ecartMaAtr), 1)} ATR.`;
  if (/session/.test(q) && info) return `Cette bougie est dans la session ${info.session}.`;
  if (/(suivant|apres|ensuite|continue)/.test(q)) return null;
  return 'Je peux t’expliquer pourquoi j’ai surligné cet élément, ce que dit le volume de la bougie, la MA200 ou la session. Dis-moi par exemple « pourquoi celle-là ? » ou « et le volume là ? ».';
}
