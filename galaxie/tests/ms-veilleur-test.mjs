// « Teste ma stratégie » dans le Veilleur : les stratégies mises EN ALERTES (fichier ms-strategies.json écrit par la page) sont suivies application fermée ; Telegram avec l'étiquette de confiance,
// une seule fois par alerte, jamais d'ordre. Lancer :  node galaxie/tests/ms-veilleur-test.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { creerChercheur } from '../../app-pc/veilleur/chercheur.mjs';
import { serieSynth } from '../../planetes/mars/tests/synth-btc.mjs';
import { fauxBinance } from '../../planetes/mars/tests/faux-binance.mjs';
import { validerStrategie } from '../../planetes/mars/pc/agent-ms/strategie-ms.js';
import { etiquetteConfiance } from '../../planetes/mars/pc/agent-ms/alertes-ms.js';

let ok = 0, ko = 0;
const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d ? ' — ' + d : '')); };
const PAS = 900e3, T0 = Date.UTC(2024, 0, 1);
const serie = serieSynth({ segments: [{ n: 3600, derive: 0.004, bruit: 0.2, volume: 100 }, { n: 800, derive: -0.004, bruit: 0.22, volume: 110 }, { n: 800, derive: 0.004, bruit: 0.2, volume: 100 }], graine: 5, t0: T0 });
const strat = validerStrategie({ nom: 'RSI fréquent', cote: 'long', conditions: [{ type: 'rsi', tf: 'm15', periode: 14, op: '<', seuil: 45 }], stop: { type: 'atr', tf: 'h1', k: 1 }, sortie: { type: 'cible_R', R: 1 } }).strategie;
const fichierStrat = (nom = 'ms-strategies.json') => nom;

async function monter({ avecStrategies = true } = {}) {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'rayle-ms-')), horloge = { t: serie.t[3700] + PAS }, telegram = [];
  const fetchImpl = async (url, opts) => { if (/telegram\/envoyer/.test(String(url))) { telegram.push(JSON.parse(opts.body)); return { ok: true, status: 200, json: async () => ({ ok: true }) }; } throw new Error('inattendu ' + url); };
  fs.writeFileSync(path.join(dossier, 'config.local.json'), JSON.stringify({ url: 'https://worker.test', jeton: 'jeton-test' }));
  if (avecStrategies) fs.writeFileSync(path.join(dossier, fichierStrat()), JSON.stringify({ t: Date.now(), strategies: [{ id: 'ms1', nom: 'RSI fréquent', strategie: strat, confiance: etiquetteConfiance({ dernierVerdict: 'ne_bat_pas' }) }] }));
  const c = creerChercheur({ dossier, fetchImpl, maintenant: () => horloge.t, lire: fauxBinance(serie, horloge), detecteur: { evaluer: async () => ({ jeu: false, raison: null }) }, sansPriorite: true, annees: 0.2 });
  await c.pilote.modifier(p => { p.commande({ type: 'profil', patch: { notifications: { telegram: true } } }); });
  return { c, horloge, telegram, dossier };
}
const avancer = async (S, i) => { S.horloge.t = serie.t[i] + PAS; return S.c.direct(); };

{
  const S = await monter(); await S.c.direct();
  for (let i = 3701; i <= 3860; i++) await avancer(S, i);
  const ms = S.telegram.filter(m => /RSI fréquent/.test(m.texte));
  v('des alertes de la stratégie partent sur Telegram (entrées et sorties)', ms.length >= 2 && ms.some(m => /ACHAT/.test(m.texte)) && ms.some(m => /SORTIE/.test(m.texte)), String(ms.length));
  v('chaque message porte NON VALIDÉE, la paire et « Aucun ordre n’est passé », sans secret', ms.every(m => /NON VALIDÉE/.test(m.texte) && /\[BTC\]/.test(m.texte) && /Aucun ordre/.test(m.texte) && !/jeton-test/.test(m.texte)));
  v('les entrées donnent la raison et le régime (aide à la décision)', ms.filter(m => /ACHAT/.test(m.texte)).every(m => /raison :/.test(m.texte) && /Régime/.test(m.texte)));
  v('type OBSERVATION (jamais « ENTREE » du protocole validé)', ms.every(m => m.type === 'OBSERVATION'));
  const ids = ms.map(m => m.texte); v('aucun message en double', new Set(ids).size === ids.length);
  v('état du Veilleur : stratégies suivies et alertes comptées', S.c.etat.ms && S.c.etat.ms.strategies === 1);
  v('état de suivi écrit sur disque (compte simulé par stratégie)', fs.existsSync(path.join(S.dossier, 'ms-etat-btc.json')) && Object.keys(JSON.parse(fs.readFileSync(path.join(S.dossier, 'ms-etat-btc.json'), 'utf8')).comptes).includes('ms1:BTC'));
  const n = S.telegram.length; await avancer(S, 3860); v('même bougie rejouée : rien de nouveau', S.telegram.length === n);
}
{ const S = await monter({ avecStrategies: false }); await S.c.direct(); for (let i = 3701; i <= 3730; i++) await avancer(S, i); v('aucune stratégie en alertes : aucun message de stratégie', S.telegram.filter(m => /RSI fréquent/.test(m.texte)).length === 0); }
{ const S = await monter(); fs.writeFileSync(path.join(S.dossier, fichierStrat()), '{pas du json'); await S.c.direct(); for (let i = 3701; i <= 3720; i++) await avancer(S, i); v('fichier de stratégies illisible : le Veilleur continue sans planter, aucun message', S.telegram.filter(m => /RSI fréquent/.test(m.texte)).length === 0); }
{ const S = await monter(); fs.writeFileSync(path.join(S.dossier, fichierStrat()), JSON.stringify({ strategies: [{ id: 'x', nom: 'Cassée', strategie: { cote: 'long', conditions: [{ type: 'astro' }] }, confiance: { etiquette: 'NON VALIDÉE', phrase: '' } }] })); await S.c.direct(); for (let i = 3701; i <= 3720; i++) await avancer(S, i); v('stratégie invalide : ignorée (jamais appliquée)', S.telegram.length === 0 || !S.telegram.some(m => /Cassée/.test(m.texte))); }

console.log(ok + ' ok, ' + ko + ' ko'); process.exit(ko ? 1 : 0);
