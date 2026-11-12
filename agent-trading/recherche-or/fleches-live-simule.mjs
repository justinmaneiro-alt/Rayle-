/* Audit « en direct simulé » des flèches simples : les bougies arrivent UNE PAR UNE, comme un flux. node agent-trading/recherche-or/fleches-live-simule.mjs → RAPPORT-LIVE-SIMULE.md */
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { serieKraken, analyse } from './fleches-simples-rejeu.mjs';
import * as FS from '../front/or/fleches-simples.js'; import { atrSerie } from '../front/or/fleches-terminal-v1.js';
const ici = path.dirname(fileURLToPath(import.meta.url)), H = 3600e3, dt = t => new Date(t).toISOString().slice(5, 16).replace('T', ' ');
const cle = f => `${f.type}|${f.t}|${f.dir}`;   // la zone peut être renumérotée entre deux rejeux : la bougie, le type et le sens identifient la flèche

/* flux en direct : à chaque bougie, le moteur ne voit que l'historique jusqu'à elle */
export function direct(B, depart = 260) {
  const vues = new Map(), pertes = [];   // clé → { apparition, f } ; pertes = flèche vue puis disparue d'un rejeu suivant
  let precedent = new Set();
  for (let n = depart; n <= B.length; n++) {
    const S = B.slice(0, n), r = analyse(S), courant = new Set();
    for (const f of r.F) { const k = cle(f); courant.add(k); if (!vues.has(k)) vues.set(k, { indexApparition: n - 1, indexDessin: f.i, f }); }
    for (const k of precedent) if (!courant.has(k) && !pertes.find(p => p.k === k)) pertes.push({ k, disparueA: n - 1 });
    precedent = courant;
  }
  return { vues, pertes };
}

/* écart entre la bougie de confirmation et le sommet / creux du mouvement (suite continue de bougies touchant la zone, jusqu'à la confirmation incluse) */
export function ecart(B, A, f) {
  const m = FS.P.toucheAtr * A[f.i]; let s = f.i;
  while (s - 1 >= 0 && f.i - (s - 1) <= 36 && B[s - 1].l <= f.zoneHaut + FS.P.toucheAtr * A[s - 1] && B[s - 1].h >= f.zoneBas - FS.P.toucheAtr * A[s - 1]) s--;
  let e = f.i; for (let k = s; k <= f.i; k++) if (f.dir < 0 ? B[k].h >= B[e].h : B[k].l <= B[e].l) e = k;
  const ext = f.dir < 0 ? B[e].h : B[e].l;
  return { bougies: f.i - e, atr: Math.abs(ext - B[f.i].c) / A[f.i], ext };
}
const med = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0; };
const moy = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;

import * as V2 from '../front/or/fleches-simples-v2.js'; import { zonesDirect } from '../front/or/zones-direct.js'; import { serieDuka } from './fleches-simples-rejeu.mjs';
export const rejeuV2 = (B, o = {}) => V2.calculer(B, zonesDirect, { maintenant: B[B.length - 1].t + H, bougies: 100000, ...o }).fleches;
export const max600 = (L, n) => { let m = 0; for (let d = 0; d + 600 <= n; d += 6) m = Math.max(m, L.filter(f => f.i >= d && f.i < d + 600).length); return m; };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const K = serieKraken(), A = atrSerie(K), full = analyse(K);
  /* 1. audit de la v1 (zones finales) : à quel pas chaque flèche aurait-elle réellement été connue ? (flèches d'avant la 260e bougie = échauffement, non comptées) */
  const { vues } = direct(K), v1 = [...vues.values()].filter(v => v.f.i >= 259), retro = v1.filter(v => v.indexApparition !== v.indexDessin);
  /* 2. v2 : rejeu en direct */
  const t0 = Date.now(), F2 = rejeuV2(K), tmp = Math.round((Date.now() - t0) / 1000);
  const mal2 = F2.filter(f => f.indexApparition !== f.indexDessin);
  const nr = K.length - 40, F2b = rejeuV2(K.slice(0, nr)), cleAff = f => `${f.type}|${f.t}|${f.dir}|${f.levelId}`, set2 = new Set(F2.map(cleAff));
  const nonRepaint = F2b.every(f => set2.has(cleAff(f))) && F2.filter(f => f.i < nr).length === F2b.length;
  /* reconstruction « rechargement » : rejeu depuis une autre bougie de départ (deja vide) doit redonner les mêmes flèches sur la fin */
  const dep = 600, F2c = V2.calculer(K, zonesDirect, { maintenant: K[K.length - 1].t + H, depart: dep, deja: F2.filter(f => f.i < dep - 1) }).fleches;
  const memes = F2c.map(cleAff).join() === F2.filter(f => f.i >= dep - 1).map(cleAff).join();
  const ret = F2.filter(f => f.type === 'retournement'), E = ret.map(f => ({ f, ...ecart(K, A, f) }));
  const D = serieDuka().slice(-1700), FD = rejeuV2(D);
  const chute = F2.filter(f => f.tCloture >= Date.UTC(2026, 10, 12, 6) && f.tCloture <= Date.UTC(2026, 10, 12, 19) && f.dir > 0);
  const lignes = E.map(e => `| ${dt(e.f.tCloture)} | ${Math.round(e.f.zoneBas)}–${Math.round(e.f.zoneHaut)} | ${e.f.dir > 0 ? 'achat' : 'vente'} | ${e.bougies} | ${e.atr.toFixed(2)} |`).join('\n');
  const rows = F2.map(f => `| ${dt(f.tCloture)} | ${f.type === 'ma_cassure' ? 'MA200 ' + (f.dir > 0 ? '↑' : '↓') : f.levelId.split('@')[0] + (f.dir > 0 ? ' ↑' : ' ↓')} | ${f.indexApparition} | ${f.indexDessin} | ${f.indexApparition === f.indexDessin ? 'OK' : 'ÉCART'} |`).join('\n');
  const res = { v1_flux: v1.length, v1_retro: retro.length, v2: F2.length, v2_mal: mal2.length, nonRepaint, memes, max600K: max600(F2, K.length), dernieres600K: F2.filter(f => f.i >= K.length - 600).length, duka: FD.length, max600D: max600(FD, D.length), chute: chute.length, secondes: tmp };
  console.log(JSON.stringify(res)); fs.writeFileSync(path.join(ici, 'fleches-live-simule.json'), JSON.stringify({ res, v2: F2.map(f => [dt(f.tCloture), f.type, f.dir, Math.round(f.prix), f.levelId]) }));
  fs.writeFileSync(path.join(ici, 'RAPPORT-LIVE-SIMULE.md'), `# Flèches simples : audit « en direct simulé »

Série Kraken PF_XAUUSD H1 (celle du graphique), ${K.length} bougies ; le moteur reçoit l'historique bougie par bougie (à partir de la 260e), zones H1 dessinées recalculées à chaque pas avec les seules bougies connues (\`zones-direct.js\`).

## Constat sur fleches-simples-v1 (scellée, intacte)
- Une flèche est bien posée sur la bougie dont la **clôture** la confirme (jamais avant le contact). Mais avec les zones FINALES du graphique, **${retro.length} flèches sur ${v1.length}** (bougies ≥ 260) étaient **rétroactives** : indexApparition > indexDessin, parce que la zone n'existait pas encore, ou n'était pas encore « majeure » (≥ 12 touches / parmi les 4 plus touchées : les touches comptent l'avenir), à la clôture de la bougie. Ces flèches « apparaissaient » après coup sur une bougie passée, et le registre append-only les ajoutait à une date antérieure. **${retro.length} flèches mal placées / non causales.**

## Correction : fleches-simples-v2 (nouveau module, branché sur le graphique)
Mêmes règles que la v1, mais rejouées en flux : seule une flèche posée sur la **dernière bougie close** est acceptée (indexApparition = indexDessin = bougie de confirmation, première clôture hors de la zone). Une flèche acceptée ne bouge ni ne disparaît. Espacement ≥ 6 bougies appliqué au fil de l'eau (une cassure MA200 est toujours gardée).

## Résultats v2 (Kraken)
- Flèches : **${F2.length}** (${ret.length} retournements, ${F2.length - ret.length} cassures MA200) ; mal placées (indexDessin ≠ indexApparition) : **${mal2.length}**.
- Non-repaint : rejeu de l'historique tronqué de 40 bougies = préfixe exact du rejeu complet : **${nonRepaint ? 'OUI' : 'NON'}** ; rechargement partiel (reprise à la bougie ${dep} avec le registre) = rejeu complet : **${memes ? 'OUI' : 'NON'}**.
- Maximum sur 600 bougies : **${max600(F2, K.length)}** (600 dernières : ${F2.filter(f => f.i >= K.length - 600).length}) ; or 2026 Dukascopy (1 700 dernières bougies) : ${FD.length} flèches, max/600 ${max600(FD, D.length)}.
- Chute du 12 nov. (6–19 h UTC) : flèches d'achat = **${chute.length}**.
- Cassure MA200 du 10 nov. : ${F2.some(f => f.type === 'ma_cassure' && f.dir < 0 && f.tCloture >= Date.UTC(2026, 10, 10, 16) && f.tCloture <= Date.UTC(2026, 10, 10, 22)) ? 'flèche cyan baissière présente (17:00 UTC)' : 'ABSENTE'}.
- Conséquence assumée : sur les zones 4 131–4 156, la v2 pose moins de flèches rouges que la v1 (celles de la v1 dépendaient de touches futures). Aucun seuil n'a été retouché.

## Décalage sommet/creux → bougie de confirmation (retournements v2 : ${E.length})
- Bougies : moyenne **${moy(E.map(e => e.bougies)).toFixed(2)}**, médiane **${med(E.map(e => e.bougies))}** ; flèches sur la bougie même du sommet/creux : ${E.filter(e => e.bougies === 0).length}/${E.length} (la bougie fait une mèche dans la zone et clôture dehors : confirmée à sa propre clôture, rien n'est connu avant).
- Distance extrême → clôture de confirmation : moyenne **${moy(E.map(e => e.atr)).toFixed(2)} ATR**, médiane **${med(E.map(e => e.atr)).toFixed(2)} ATR** (écart entre « le prix de la flèche » et « le meilleur prix »).

| clôture UTC | zone | sens | décalage (bougies) | distance (ATR) |
|---|---|---|---|---|
${lignes}

## Flèches v2 (flux direct)
| clôture UTC | niveau | indexApparition | indexDessin | |
|---|---|---|---|---|
${rows}

Infobulle : date/heure d'apparition (clôture de la bougie de confirmation), prix de clôture, « Arrive après le plus haut/bas : repère de lecture, pas un ordre ».
`);
}
