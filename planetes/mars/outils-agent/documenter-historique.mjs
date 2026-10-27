// Génère docs/historique-btc.md à partir du cache des VRAIES bougies (donnees-btc-cache/) : étendue, source, delta, trous. Lancer :  node planetes/mars/outils-agent/documenter-historique.mjs
import fs from 'node:fs';
import { historiqueReel } from '../tests/aide-btc.mjs';
import { lacunes } from '../pc/agent-btc/colonnes.js';

const { serie, etat } = await historiqueReel({ annees: 9.17 });
const l = lacunes(serie), iso = t => new Date(t).toISOString().slice(0, 16).replace('T', ' ');
const total = l.reduce((s, x) => s + x.manquantes, 0), plus = l.slice().sort((a, b) => b.manquantes - a.manquantes).slice(0, 8);
const sansVb = (() => { let k = 0; for (let i = 0; i < serie.n; i++) if (Number.isNaN(serie.vb[i])) k++; return k; })();
const md = `# Historique Bitcoin M15 de l'agent (M5) : sources, étendue, trous

Généré le ${new Date().toISOString().slice(0, 10)} par \`planetes/mars/outils-agent/documenter-historique.mjs\` à partir des VRAIES bougies téléchargées (cache \`donnees-btc-cache/\`, ignoré par git). Rien n'est inventé : un trou reste un trou.

## Ce qui est utilisé
- **Source** : Binance, paire BTC/USDT, bougies de 15 minutes, \`data-api.binance.vision\` (CORS ouvert, gratuit, sans clé), appelée directement par le navigateur ou par Node. Le **volume acheteur agressif (« taker »)** est fourni : le **delta est RÉEL** pour ${((1 - sansVb / serie.n) * 100).toFixed(1).replace('.', ',')} % des bougies.
- **Étendue** : ${serie.n.toLocaleString('fr-FR')} bougies M15, du **${iso(serie.t[0])} UTC** au **${iso(serie.t[serie.n - 1])} UTC**, soit **${etat.annees.toFixed(2).replace('.', ',')} ans**. C'est le **maximum disponible chez Binance** : la paire BTC/USDT y a été ouverte le 2017-08-17, il n'existe pas de bougie plus ancienne. L'agent demande 9,17 ans (départ le 21 août 2017 et non le 17) : demander plus loin ferait basculer le téléchargement sur le secours Bitstamp pour quelques jours (delta estimé), ce que je refuse pour garder un delta réel partout.
- **Source de secours** : Bitstamp (BTC/USD, historique plus profond mais **sans séparation acheteur / vendeur** : delta **ESTIMÉ**). Elle ne sert que si Binance ne répond pas (par exemple pays bloqués), et chaque donnée dit alors « SECOURS » et « delta estimé ». Je n'ai PAS mélangé Bitstamp avant 2017 aux données Binance : changer de place de marché au milieu d'un historique ferait apparaître de faux changements de régime (prix, volume, spread), et le delta ne serait plus réel pour cette période.
- **H1, H4 et D1** sont déduites des bougies M15 (bougies complètes seulement, jamais de bougie en cours, jamais de bougie bâtie sur un trou).

## Les trous (${l.length} trous, ${total} bougies manquantes sur ${serie.n.toLocaleString('fr-FR')}, soit ${(total / serie.n * 100).toFixed(3).replace('.', ',')} %)
Un trou = des bougies absentes de la source (maintenance de l'échange). L'agent ne les comble pas ; les indicateurs et les trades traversant un trou sont conservés tels quels, la bougie suivante repart de son vrai prix. Les plus longs :

| De | À | Bougies manquantes |
|---|---|---|
${plus.map(x => `| ${iso(x.de)} | ${iso(x.a)} | ${x.manquantes} |`).join('\n')}

Liste complète (${l.length}) :
${l.map(x => `- ${iso(x.de)} → ${iso(x.a)} (${x.manquantes})`).join('\n')}

## Limites honnêtes
- Binance est une seule place de marché : son volume et son delta ne sont pas ceux de tout le marché Bitcoin.
- Le prix d'un CFD chez un courtier diffère un peu ; les frais du backtest (0,06 % par côté, spread 0,02 %, glissement 0,02 %) sont ceux d'un ordre au marché sur un échange.
- Les ${(serie.n / 35040).toFixed(1).replace('.', ',')} ans couvrent plusieurs régimes (hausse 2017, krach 2018, 2020-2021, 2022, 2024-2026) : c'est utile pour tester la robustesse, mais le passé ne garantit rien.
`;
fs.writeFileSync(new URL('../../../docs/historique-btc.md', import.meta.url), md);
console.log('docs/historique-btc.md écrit :', serie.n, 'bougies,', l.length, 'trous');
