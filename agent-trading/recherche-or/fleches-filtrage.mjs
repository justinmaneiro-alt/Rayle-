// Rapport avant / après du filtrage des flèches du terminal, sur l'historique 2026 H1 de l'or (Dukascopy, bougies plates retirées).
// node agent-trading/recherche-or/fleches-filtrage.mjs   → RAPPORT-FLECHES-FILTRAGE.md. INFORMATIF : les flèches sont des repères de lecture, pas des trades.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { charger } from './donnees.mjs';
import * as FT from '../front/or/fleches-terminal-v1.js';
import * as FL from '../front/or/fleches-lecture-v1.js';
import { fleches as flechesV1 } from '../front/or/niveaux-periode.js';
import { flechesH1v2 } from '../front/or/fleches-h1-v2.js'; import { flechesH1v3 } from '../front/or/fleches-h1-v3.js'; import { flechesH1v4 } from '../front/or/fleches-h1-v4.js';
import { flechesH1v5 } from '../front/or/fleches-h1-v5.js'; import { flechesH1v6 } from '../front/or/fleches-h1-v6.js'; import { flechesH1v7 } from '../front/or/fleches-h1-v7.js';
import { flechesH1v8 } from '../front/or/fleches-h1-v8.js'; import { flechesH1v9 } from '../front/or/fleches-h1-v9.js';
const ici = path.dirname(fileURLToPath(import.meta.url)), H = 3600e3, T2026 = Date.UTC(2026, 0, 1);
const D = charger({ debut: 2025, fin: 2026 }), brut = D.h1.filter(b => !(b.h === b.l && !b.v)), B = brut.map(b => ({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v }));
const maintenant = B[B.length - 1].t + H, V = new Map(B.map(b => [b.t, b.v]));
const en2026 = f => (f.tCloture ?? (f.t + H)) >= T2026;
const compte = (L, cle = f => f.type) => { const o = {}; for (const f of L.filter(en2026)) { const k = cle(f) || '?'; o[k] = (o[k] || 0) + 1; } return o; };
const total = o => Object.values(o).reduce((a, b) => a + b, 0);
const lignesAvant = [];
const essai = (nom, fn, cle) => { try { const L = fn(); const c = compte(L, cle); lignesAvant.push({ nom, n: total(c), detail: c }); } catch (e) { lignesAvant.push({ nom, n: null, detail: { erreur: String(e.message).slice(0, 80) } }); } };
essai('Niveaux de période (fleches-v1, tous niveaux : veille, semaine, VWAP, POC, ronds…)', () => flechesV1(B, { periode: 'H1', maintenant, volumes: V }).map(f => ({ ...f, tCloture: f.t + H })));
for (const [n, f] of [['v2', flechesH1v2], ['v3', flechesH1v3], ['v4', flechesH1v4], ['v5', flechesH1v5], ['v6', flechesH1v6], ['v7', flechesH1v7], ['v8', flechesH1v8], ['v9', flechesH1v9]]) essai(`H1 ${n} (version affichée par défaut : v9)`, () => f(B, { maintenant, volumes: V }).map(x => ({ ...x, tCloture: x.t + H })));
essai('Terminal v1 (MA200 : cassure, retour, rebond, fausse cassure ; niveaux majeurs)', () => FT.calculer(B, { objets: [], maintenant, jours: null }).fleches);
const R = FL.calculer(B, { maintenant, jours: null }), apres2026 = R.toutes.filter(en2026), gardees = R.fleches.filter(en2026), masq = apres2026.filter(f => f.masquee);
const bilan = FL.bilan(B, gardees.length ? R.fleches : []);
const n2026 = B.filter(b => b.t >= T2026).length;
// contrôles de structure sur les 600 dernières bougies et sur toute l'année
const visibles = gardees.slice().sort((a, b) => a.i - b.i); let grappes = 0; for (let k = 1; k < visibles.length; k++) if (visibles[k].i - visibles[k - 1].i < FL.P.grappe) grappes++;
const fen600 = (() => { const fin = B.length - 1; let max = 0; for (let d = 0; d + 600 <= B.length; d += 24) { const k = R.fleches.filter(f => f.i >= d && f.i < d + 600).length; if (k > max) max = k; } return max; })();
const L = ['# Flèches du terminal : filtrage (avant / après)', '', `Généré le ${new Date().toISOString()} par \`agent-trading/recherche-or/fleches-filtrage.mjs\`. Règle \`${FL.VERSION}\` (écrite le ${FL.ECRITES_LE}). Données : XAU/USD H1 Dukascopy, ${B.length} bougies, **${n2026} bougies en 2026** (du ${new Date(Math.max(T2026, B[0].t)).toISOString().slice(0, 10)} au ${new Date(B[B.length - 1].t).toISOString().slice(0, 10)}).`, '',
  '> **Les flèches marquent des événements de lecture, pas des trades rentables.** Les mesures ci-dessous sont INFORMATIVES (jamais utilisées pour décider) ; aucun type n\'a été supprimé parce qu\'il ne bat pas le hasard : seuls le bruit (niveaux mineurs, VWAP, POC, veille, semaine, niveaux ronds, « proposé H4 », zones tracées) et les grappes sont retirés.', '',
  '## 1. Avant : ce que le terminal pouvait afficher en 2026 (par producteur, avant tout filtrage)', '', '| Producteur | Flèches 2026 | Détail par type |', '|---|---|---|'];
for (const l of lignesAvant) L.push(`| ${l.nom} | ${l.n ?? 'erreur'} | ${Object.entries(l.detail).map(([k, v]) => `${k} : ${v}`).join(', ')} |`);
L.push('', '(Les flèches « proposé H4 » et celles des objets tracés par l\'utilisateur dépendent de ses dessins : elles ne peuvent pas être comptées sur l\'historique ; elles sont retirées de l\'affichage par défaut. Le terminal en superposait plusieurs versions à la fois.)', '',
  '## 2. Après : fleches-lecture-v1 sur 2026', '', `| Type | Posées (affichées) | Masquées (grappe < ${FL.P.grappe} bougies ou plafond ${FL.P.plafond} par ${FL.P.plafondFenetre} bougies) |`, '|---|---|---|');
for (const t of Object.keys(FL.TYPES)) L.push(`| ${FL.TYPES[t]} | ${gardees.filter(f => f.type === t).length} | ${masq.filter(f => f.type === t).length} |`);
L.push(`| **Total** | **${gardees.length}** | **${masq.length}** |`, '', `Contacts avec un gros niveau (inscrits, jamais dessinés en flèche) : ${R.contacts.filter(c => c.tCloture >= T2026).length}.`, '',
  `Contrôles : grappes parmi les flèches affichées (écart < ${FL.P.grappe} bougies) = **${grappes}** ; maximum de flèches affichées sur une fenêtre de 600 bougies H1 = **${fen600}** (limite 12).`, '',
  '## 3. Résultat mesuré à titre INFORMATIF (mouvement favorable maximal en ATR, médiane ; comparaison avec 1 000 tirages d\'entrées aléatoires, mêmes horizons et même sens)', '', '« part du hasard au-dessus » = proportion de tirages dont la médiane égale ou dépasse celle des flèches (proche de 0,5 : comme le hasard). « pas assez de données » sous 30 flèches mesurables.', '',
  '| Type | n | 6 bougies | 12 bougies | 24 bougies |', '|---|---|---|---|---|');
for (const t of Object.keys(FL.TYPES)) { const o = bilan[t]; if (!o) continue; const c = h => { const x = o.horizons[h]; return !x ? '—' : x.texte ? `${x.texte} (n = ${x.n})` : `${String(x.medianeAtr).replace('.', ',')} ATR (hasard ${String(x.hasardAtr).replace('.', ',')} ; part du hasard au-dessus ${String(x.partHasardAuDessus).replace('.', ',')})`; }; L.push(`| ${FL.TYPES[t]} | ${o.n} | ${c(6)} | ${c(12)} | ${c(24)} |`); }
L.push('', '## 4. Remarques', '', '- La cassure de la MA200 n\'est affichée qu\'à sa **confirmation** (6 clôtures du même côté) : c\'est la façon de ne jamais poser puis retirer une flèche. Une fausse cassure ne produit donc aucune flèche.', '- Grappes : comme rien ne peut être retiré après coup, la première flèche posée reste ; une flèche décidée moins de 12 bougies plus tard est masquée (gardée au registre).', '- Le signal précoce (2 bougies sur le niveau) n\'est jamais doublé par une seconde flèche : si la réaction ≥ 0,5 ATR vient ensuite, l\'infobulle de la flèche précoce l\'indique.', '- Rien ici n\'est un ordre ni une promesse de rentabilité.');
fs.writeFileSync(path.join(ici, 'RAPPORT-FLECHES-FILTRAGE.md'), L.join('\n'));
console.log('avant :', lignesAvant.map(l => `${l.nom.slice(0, 30)}=${l.n}`).join(' | '));
console.log('après :', gardees.length, 'affichées,', masq.length, 'masquées ; grappes', grappes, '; max/600', fen600, '; contacts', R.contacts.length);
console.log(Object.fromEntries(Object.keys(FL.TYPES).map(t => [t, gardees.filter(f => f.type === t).length])));
