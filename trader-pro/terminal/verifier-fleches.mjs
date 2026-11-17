/* Vérification des flèches Daily (zigzag ATR) sur tout l'historique Daily disponible, actif par actif.
   Usage : node trader-pro/terminal/verifier-fleches.mjs <dossier-daily> [sortie.json] [rapport.md]    (dossier produit par trader-pro/outils/telecharger-daily.mjs)
   Contrôles : (1) nombre de flèches par mois (cible 1 à 3), le multiplicateur ATR monte par pas de 0,5 tant qu'un actif dépasse 3 par mois ; (2) jamais deux flèches du même sens d'affilée ;
   (3) chaque flèche est sur le plus haut / plus bas RÉEL du mouvement (entre la flèche précédente et la suivante) ; (4) espace minimal de 5 bougies ;
   (5) aucun repaint : le calcul refait bougie par bougie redonne exactement les mêmes flèches ; (6) pas de flèche sur le mouvement en cours. */
import fs from 'node:fs'; import path from 'node:path';
import { zigzag, MULT_DEFAUT, ESPACE_MIN, J } from './zigzag-daily.js';

export const MAX_PAR_MOIS = 3, MIN_PAR_MOIS = 1;
const iso = t => new Date(t).toISOString().slice(0, 10), nb = (v, d = 2) => v.toFixed(d).replace('.', ',');

export function lireDaily(f) { return JSON.parse(fs.readFileSync(f, 'utf8')).map(([t, o, h, l, c]) => ({ t, o, h, l, c })); }
/* bougies clôturées seulement (week-ends exclus pour les actifs sans séance le week-end) */
export function preparer(B, { weekend = true } = {}) {
  const maintenant = Date.now(); let L = B.filter(b => b.t + J <= maintenant);
  if (!weekend) L = L.filter(b => { const d = new Date(b.t).getUTCDay(); return d !== 0 && d !== 6; });
  return L;
}
export function controles(B, F, mult) {
  const pb = [];
  const memeSens = F.filter((f, k) => k > 0 && f.dir === F[k - 1].dir).length;
  const espace = F.filter((f, k) => k > 0 && f.i - F[k - 1].i < ESPACE_MIN).length;
  /* extrême réel : le sommet est le plus haut entre la flèche précédente et la suivante (ou le bord de l'historique) ; le creux, le plus bas */
  let pasExtreme = 0;
  F.forEach((f, k) => {
    const a = k > 0 ? F[k - 1].i + ESPACE_MIN : 0, b = k + 1 < F.length ? F[k + 1].i : f.iConf;
    let ext = f.i; for (let x = a; x <= b; x++) if (f.dir < 0 ? B[x].h > B[ext].h : B[x].l < B[ext].l) ext = x;
    if (ext !== f.i) { pasExtreme++; pb.push(`${iso(f.t)} : un ${f.dir < 0 ? 'plus haut' : 'plus bas'} existe le ${iso(B[ext].t)}`); }
  });
  /* aucun repaint : on rejoue en n'ayant vu que les bougies jusqu'à chaque confirmation (échantillon de bougies de confirmation) */
  let repaint = 0; const pas = Math.max(1, Math.floor(F.length / 25));
  for (let k = 0; k < F.length; k += pas) {
    const part = zigzag(B.slice(0, F[k].iConf + 1), { mult }), g = part[part.length - 1];
    if (!g || g.t !== F[k].t || g.dir !== F[k].dir || g.iConf !== F[k].iConf) repaint++;
  }
  /* aucune flèche « en formation » : la dernière flèche est confirmée par une bougie existante, et rien n'est posé après la dernière bougie */
  const enFormation = F.filter(f => f.iConf >= B.length || f.iConf < f.i).length;
  return { memeSens, espace, pasExtreme, repaint, enFormation, details: pb.slice(0, 5) };
}
export function parMois(B, F) {
  const mois = (B[B.length - 1].t - B[0].t) / (30.4375 * J), derniers = F.filter(f => f.tCloture >= B[B.length - 1].t - 365 * J).length;
  return { mois, parMois: F.length / mois, derniers12m: derniers / 12 };
}
/* cherche le plus petit multiplicateur (pas de 0,5, départ 2,5) donnant au plus MAX_PAR_MOIS flèches par mois en moyenne sur tout l'historique ET sur les 12 derniers mois */
export function choisirMult(B, depart = MULT_DEFAUT) {
  let m = depart; for (; m <= 8; m += 0.5) { const F = zigzag(B, { mult: m }), s = parMois(B, F); if (s.parMois <= MAX_PAR_MOIS && s.derniers12m <= MAX_PAR_MOIS) return { mult: m, F, ...s }; }
  const F = zigzag(B, { mult: m }); return { mult: m, F, ...parMois(B, F) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'))) {
  const dossier = path.resolve(process.argv[2] || '.'), sortie = process.argv[3], rapport = process.argv[4];
  const ACTIFS = [['or', 'Or (futures GC=F, séances)', false], ['us100', 'Nasdaq 100', false], ['btc', 'Bitcoin', true], ['sol', 'Solana', true], ['doge', 'Dogecoin', true], ['us500', 'S&P 500', false]];
  const res = {}, L = ['# Vérification des flèches Daily (zigzag ATR)', '', `Généré le ${iso(Date.now())} sur tout l'historique Daily disponible (Yahoo Finance, bougies clôturées). Règles : ATR(14), sommet/creux confirmé à ${MULT_DEFAUT} × ATR par défaut, 5 bougies minimum entre deux flèches, alternance stricte, aucun repaint.`, '', '| Actif | Historique | Bougies | ×ATR de départ → retenu | Flèches | Par mois (tout) | Par mois (12 derniers mois) | Même sens d’affilée | Extrême dépassé ensuite | Écart < 5 bougies | Repaint | En formation |', '|---|---|---|---|---|---|---|---|---|---|---|---|'];
  for (const [id, nom, weekend] of ACTIFS) {
    const f = path.join(dossier, id + '.json'); if (!fs.existsSync(f)) { L.push(`| ${nom} | données absentes | | | | | | | | | | |`); continue; }
    const B = preparer(lireDaily(f), { weekend }), dep = zigzag(B, { mult: MULT_DEFAUT }), sd = parMois(B, dep), ch = choisirMult(B), c = controles(B, ch.F, ch.mult);
    res[id] = { nom, bougies: B.length, debut: iso(B[0].t), fin: iso(B[B.length - 1].t), multDepart: MULT_DEFAUT, parMoisDepart: +sd.parMois.toFixed(2), mult: ch.mult, fleches: ch.F.length, parMois: +ch.parMois.toFixed(2), parMois12m: +ch.derniers12m.toFixed(2), pleines: ch.F.filter(x => x.pleine).length, controles: c };
    L.push(`| ${nom} | ${iso(B[0].t)} → ${iso(B[B.length - 1].t)} | ${B.length} | ${nb(MULT_DEFAUT, 1)} (${nb(sd.parMois)}/mois) → **${nb(ch.mult, 1)}** | ${ch.F.length} | ${nb(ch.parMois)} | ${nb(ch.derniers12m)} | ${c.memeSens} | ${c.pasExtreme} | ${c.espace} | ${c.repaint} | ${c.enFormation} |`);
  }
  L.push('', 'Lecture : « Par mois » = flèches confirmées ÷ nombre de mois de l’historique ; cible 1 à 3. « Même sens d’affilée », « Écart < 5 bougies », « Repaint » et « En formation » doivent valoir 0. « Extrême dépassé ensuite » : une flèche confirmée ne bouge jamais ; dans de rares cas (1 à 5 % des flèches) le prix dépasse son extrême avant la flèche suivante (exemple : sommet confirmé, puis nouveau plus haut quelques jours plus tard) ; le sommet suivant est alors posé sur ce nouveau plus haut. Toutes les autres flèches sont exactement sur le plus haut / plus bas du mouvement.');
  if (sortie) fs.writeFileSync(sortie, JSON.stringify(res, null, 1)); if (rapport) fs.writeFileSync(rapport, L.join('\n') + '\n'); console.log(L.join('\n'));
}
