/* Rapport « flèches gros mouvements » (v8) : node agent-trading/recherche-or/fleches-gros-rapport.mjs  → RAPPORT-FLECHES-GROS-MOUVEMENTS.md (informatif, aucune preuve de performance) */
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { serie13 } from './fleches-v6-diag.mjs';
import * as V6 from '../front/or/fleches-simples-v6.js'; import * as V7 from '../front/or/fleches-simples-v7.js'; import * as V8 from '../front/or/fleches-simples-v8.js'; import { zonesDirect } from '../front/or/zones-direct.js';
import { atrSerie } from '../front/or/fleches-terminal-v1.js';
const ici = path.dirname(fileURLToPath(import.meta.url)), H = 3600e3, dt = t => new Date(t).toISOString().slice(5, 16).replace('T', ' ');
const K = serie13(), now = K.at(-1).t + H, o = { maintenant: now, bougies: 1e5 }, A = atrSerie(K), idx = new Map(K.map((b, i) => [b.t, i]));
const r6 = V6.calculer(K, zonesDirect, o), r7 = V7.calculer(K, zonesDirect, o), r8 = V8.calculer(K, zonesDirect, o);
const nCol = r => r.fleches.filter(f => !f.contre && !f.invalidee).length, parType = r => { const m = {}; for (const f of r.fleches) m[f.type] = (m[f.type] || 0) + 1; return m; };
// ── retard entre le contact et la confirmation
const ret = r8.fleches.filter(f => f.type === 'retournement' && f.touchI != null).map(f => { const i = f.i, a = A[i]; let ext = f.dir > 0 ? Infinity : -Infinity; for (let k = f.touchI; k <= i; k++) ext = f.dir > 0 ? Math.min(ext, K[k].l) : Math.max(ext, K[k].h); return { bougies: i - f.touchI, atr: Math.abs(f.prix - ext) / a }; });
const moy = L => L.reduce((s, x) => s + x, 0) / (L.length || 1);
// ── mouvement ≥ 3 ATR dans les 24 bougies suivantes, comparé à 1 000 entrées aléatoires (mêmes dates, sens tiré au hasard)
const suite = (i, dir) => { const a = A[i]; let m = 0; for (let k = i + 1; k <= Math.min(K.length - 1, i + 24); k++) m = Math.max(m, dir > 0 ? K[k].h - K[i].c : K[i].c - K[k].l); return i + 24 <= K.length - 1 ? m >= 3 * a : null; };
const taux = L => { const x = L.filter(v => v != null); return x.length ? x.filter(Boolean).length / x.length : null; };
const pct = x => x == null ? 'n/d' : (x * 100).toFixed(0).replace('.', ',') + ' %';
let seed = 12345; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const tauxFleches = r => taux(r.fleches.filter(f => f.type === 'retournement' && !f.contre && !f.invalidee).map(f => suite(f.i, f.dir)));
const dates = r8.fleches.filter(f => f.type === 'retournement' && !f.contre).map(f => f.i);
const alea = []; for (let k = 0; k < 1000; k++) alea.push(suite(dates[Math.floor(rnd() * dates.length)], rnd() < 0.5 ? 1 : -1));
// ── boîtes : résultat en R, brut et net de frais (hypothèse : 0,5 point d'aller-retour, à ajuster)
const FRAIS = 0.5;
const boitesDe = r => r.fleches.filter(f => !f.contre && !f.invalidee).map(f => V8.boite(K.filter(b => b.t + H <= now), f)).filter(Boolean);
const statB = L => { const F = L.filter(b => b.figee); if (F.length < 30) return `pas assez de données (n = ${F.length} boîtes figées sur ${L.length}, 30 requises)`; const brut = F.map(b => b.R), net = F.map(b => b.R - FRAIS / b.r); return `n = ${F.length} · réussite (R > 0) ${pct(F.filter(b => b.R > 0).length / F.length)} · R moyen brut ${moy(brut).toFixed(2).replace('.', ',')} · net de frais ${moy(net).toFixed(2).replace('.', ',')}`; };
const b6 = boitesDe(r6), b7 = boitesDe(r7), b8 = boitesDe(r8);
// ── diffs v7 → v8
const ids7 = new Set(r7.fleches.map(f => f.id)), ids8 = new Set(r8.fleches.map(f => f.id));
const ligne = f => `${dt(f.tCloture)} UTC · ${f.type === 'ma_cassure' ? 'MA200' : f.type === 'rebond_base' ? 'base' : (f.niveauNom || '') + ' ' + Math.round(f.zoneBas) + '–' + Math.round(f.zoneHaut)} · ${f.dir > 0 ? 'achat' : 'vente'}${f.contre ? ' (gris)' : ''}${f.invalidee ? ' (invalidée)' : ''}`;
const perdues = r7.fleches.filter(f => !ids8.has(f.id) && !r8.fleches.some(g => g.type === f.type && g.dir === f.dir && Math.abs(g.i - f.i) <= 3 && g.levelId === f.levelId));
const retires = r8.retirees;
const md = `# RAPPORT — flèches « gros mouvements » (Direct v8), ${new Date().toISOString().slice(0, 10)}
**Outil de lecture, pas une preuve de performance.** Les règles ont été choisies en regardant des exemples (série Kraken PF_XAUUSD H1 du ${dt(K[0].t)} au ${dt(K.at(-1).t)} UTC, ${K.length} bougies) : toute statistique ci-dessous est descriptive et ne dit rien de l'avenir. Aucun ordre, jamais.

## 1. Nombre de flèches (série de référence)
| Version | Total | Colorées | Gris (contre-tendance) | Invalidées | Types |
|---|---|---|---|---|---|
| v6 « Direct (stable) » | ${r6.fleches.length} | ${nCol(r6)} | ${r6.fleches.filter(f => f.contre).length} | ${r6.fleches.filter(f => f.invalidee).length} | ${JSON.stringify(parType(r6))} |
| v7 « Direct (v7 validée) » | ${r7.fleches.length} | ${nCol(r7)} | ${r7.fleches.filter(f => f.contre).length} | ${r7.fleches.filter(f => f.invalidee).length} | ${JSON.stringify(parType(r7))} |
| **v8 « Direct »** | ${r8.fleches.length} | ${nCol(r8)} | ${r8.fleches.filter(f => f.contre).length} | ${r8.fleches.filter(f => f.invalidee).length} | ${JSON.stringify(parType(r8))} |
Dans la v8, les ${r8.fleches.filter(f => f.type === 'ma_cassure').length} flèches de cassure MA200 sont calculées mais **masquées par défaut** (case « Flèches MA200 ») : sans elles, ${r8.fleches.filter(f => f.type !== 'ma_cassure').length} flèches visibles.

## 2. Flèches retirées par chaque règle (candidats supprimés pendant le rejeu v8)
${Object.entries(retires).map(([k, n]) => `- ${({ tardif: 'règle 7 · signal tardif (> 2,5 ATR du bord)', espace: 'règle 6 · pas assez d\'espace (< 1 R jusqu\'au prochain niveau majeur)', chute: 'garde-fou chute > 5 ATR (v7)', contre: 'contre-tendance (point gris, v7)', proche: 'distance minimale de 6 bougies (v7)', 'aller-retour': 'anti-aller-retour (v7)', plafond: 'plafond de sécurité' })[k] || k} : ${n}`).join('\n')}
Les règles 4 (grosse zone) et 5 (confirmation par le corps ou 2 clôtures) agissent en amont (elles changent quelles zones et quelles bougies produisent un candidat) : leur effet se lit dans la comparaison v7 → v8 ci-dessous.
Flèches de la v7 **absentes** de la v8 (même type, sens, niveau, à ± 3 bougies) : ${perdues.length}
${perdues.map(f => '- ' + ligne(f)).join('\n') || '- aucune'}
Flèches **nouvelles** de la v8 (absentes de la v7) : ${r8.fleches.filter(f => !ids7.has(f.id)).length}
${r8.fleches.filter(f => !ids7.has(f.id)).map(f => '- ' + ligne(f) + (f.confirmation ? ' · confirmation ' + f.confirmation : '')).join('\n')}

## 3. Retard entre le contact et la confirmation (retournements de niveau v8, n = ${ret.length})
- En bougies H1 : moyenne **${moy(ret.map(x => x.bougies)).toFixed(1).replace('.', ',')}**, maximum **${Math.max(...ret.map(x => x.bougies))}**.
- En ATR (distance entre le sommet/creux du contact et la clôture de confirmation) : moyenne **${moy(ret.map(x => x.atr)).toFixed(2).replace('.', ',')} ATR**, maximum **${Math.max(...ret.map(x => x.atr)).toFixed(2).replace('.', ',')} ATR**.
- Confirmations : ${r8.fleches.filter(f => f.confirmation === 'corps').length} par un gros corps (une clôture), ${r8.fleches.filter(f => f.confirmation === '2 clôtures').length} par deux clôtures.
Le retard accepté par Justin est de 2 à 3 bougies : ${ret.filter(x => x.bougies <= 3).length} / ${ret.length} flèches sont dans cette limite.

## 4. Mouvement d'au moins 3 ATR dans les 24 bougies suivantes
| Échantillon | Part avec un mouvement ≥ 3 ATR (sens de la flèche) |
|---|---|
| Flèches de niveau v6 | ${pct(tauxFleches(r6))} |
| Flèches de niveau v7 | ${pct(tauxFleches(r7))} |
| **Flèches de niveau v8** | **${pct(tauxFleches(r8))}** |
| 1 000 entrées aléatoires aux mêmes dates (sens tiré au hasard) | ${pct(taux(alea))} |
Lecture : ${tauxFleches(r8) != null && taux(alea) != null ? (tauxFleches(r8) > taux(alea) ? 'les flèches v8 sont suivies d\'un grand mouvement plus souvent que le hasard sur ces dates' : 'les flèches v8 ne font pas mieux que le hasard sur ces dates') : 'non calculable'} — mais l'échantillon est d'environ ${dates.length} flèches sur ${Math.round(K.length / 24)} jours : **aucune conclusion statistique**.

## 5. Boîtes de position (résultat en R, stop = bord extérieur + 0,2 ATR, TP1 = 1 R, TP2 = 2 R ; stop avant cible dans une même bougie ; 48 bougies maximum)
Frais supposés : ${FRAIS} point par aller-retour (hypothèse non mesurée, à ajuster), converti en R avec la distance du stop de chaque boîte.
- v6 : ${statB(b6)}
- v7 : ${statB(b7)}
- **v8** : ${statB(b8)}
Répartition v8 : ${['stop', 'tp1', 'tp2', 'expiree', 'ouverte'].map(e => `${e} ${b8.filter(b => b.etat === e).length}`).join(' · ')}.

## 6. Cas de contrôle
Voir \`tests/fleches-simples-v8-test.mjs\` (tous verts) : ventes du 5 et du 9 novembre sur le VAH mensuel (4 131–4 145), vente du 12 novembre sur 3 963–3 976 (début de la dernière chute), rebond après base du 2 novembre, cassure MA200 du 10 novembre (ligne colorée ; flèche si la case est cochée), zéro achat coloré dans la chute du 12 novembre.
**Deux règles ont dû être relâchées** pour garder la vente du 12 novembre (conformément à la consigne « relâcher juste assez ») : règle 7 (tardive) de 2 à **2,5 ATR** (la vente se confirme à 2,3 ATR sous la zone) ; règle 6 (espace) de 2 R à **1 R**, avec « niveau majeur » = niveau de structure, réaction passée ≥ 3 ATR ou ≥ 10 touches (à 2 R et avec toutes les zones, 58 candidats sur une centaine étaient retirés, ce qui laissait une série presque vide). Aussi : la flèche « rouge » 3 963–3 972 citée dans la consigne est, dans la v7 validée, un **achat** (12 nov. 01:00) ; la vente rouge voisine est celle de 09:00 sur 3 963–3 976, qui était bloquée par l'anti-aller-retour en v7 et qui est maintenant gardée parce que l'achat de 01:00 est retiré par la règle d'espace (sans lui, rien ne la bloque).

## 7. Réglages par défaut
Points gris masqués · flèches MA200 masquées (ligne MA200 colorée : verte après une cassure haussière, rouge après une cassure baissière) · filtre « régime MA200 » désactivé · boîtes : 3 dernières · zones lisibles : 3 résistances + 3 supports (R1…, S1…), autres niveaux masqués (case pour les réafficher) · alerte de contact : activée (Notifications), texte seul, sans marqueur ni image.
`;
fs.writeFileSync(path.join(ici, 'RAPPORT-FLECHES-GROS-MOUVEMENTS.md'), md); console.log(md.split('\n').slice(0, 40).join('\n'));
