// M6c dans le Veilleur : l'assistant de régime envoie (ou non) des messages Telegram, avec la fréquence limitée, et ne propose JAMAIS d'entrée tant qu'une règle n'a pas le statut SIGNAL.
// Lancer :  node galaxie/tests/m6c-veilleur-test.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { creerChercheur } from '../../app-pc/veilleur/chercheur.mjs';
import { serieSynth } from '../../planetes/mars/tests/synth-btc.mjs';
import { fauxBinance } from '../../planetes/mars/tests/faux-binance.mjs';
import { contexteRegime, REGLES } from '../../planetes/mars/pc/agent-m6c/regles-regime.js';

let ok = 0, ko = 0;
const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d ? ' — ' + d : '')); };
const PAS = 900e3, T0 = Date.UTC(2024, 0, 1);
// marché fabriqué : longue montée, range propre, cassure haussière à fort volume, puis suite
const segs = [{ n: 3600, derive: 0.01, bruit: 0.1, volume: 100 }, { n: 700, derive: 0, bruit: 0.12, volume: 90, retour: 0.08 }, { n: 8, derive: 0.35, bruit: 0.05, volume: 500 }, { n: 12, derive: -0.12, bruit: 0.05, volume: 120 }, { n: 300, derive: 0.02, bruit: 0.08, volume: 110 }];
const serie = serieSynth({ segments: segs, graine: 11, t0: T0 }), PARAMS = { cassure_range: { mode: 'immediat', score: 2, mult: 1.5 } };
const ctx = contexteRegime(serie), sig = REGLES.cassure_range.signaux(ctx, PARAMS.cassure_range), iCassure = sig.sens.findIndex(x => x !== 0);
v('(préalable) la cassure fabriquée existe', iCassure > 3000, iCassure);
const iRange = (() => { for (let i = iCassure - 1; i > 1500; i--) if (ctx.reg.regime[i] === 3) return i; return -1; })();
v('(préalable) un range précède la cassure', iRange > 0);

async function monter({ statuts }) {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'rayle-m6c-')), horloge = { t: serie.t[iRange] + PAS }, telegram = [];
  const fetchImpl = async (url, opts) => { if (/telegram\/envoyer/.test(String(url))) { telegram.push(JSON.parse(opts.body)); return { ok: true, status: 200, json: async () => ({ ok: true }) }; } throw new Error('inattendu ' + url); };
  fs.writeFileSync(path.join(dossier, 'config.local.json'), JSON.stringify({ url: 'https://worker.test', jeton: 'jeton-test' }));
  const detecteur = { evaluer: async () => ({ jeu: false, raison: null }) };
  const c = creerChercheur({ dossier, fetchImpl, maintenant: () => horloge.t, lire: fauxBinance(serie, horloge), detecteur, sansPriorite: true, annees: 0.2, statutsM6c: statuts, parametresM6c: PARAMS });
  await c.pilote.modifier(p => { p.commande({ type: 'profil', patch: { notifications: { telegram: true } } }); });
  return { c, horloge, telegram };
}
const avancer = async (S, i) => { S.horloge.t = serie.t[i] + PAS; return S.c.direct(); };

// ── règles en INFORMATION (état réel mesuré) : jamais d'ENTRÉE ──
{ const S = await monter({ statuts: {} });
  await S.c.direct();                                                                    // synchronisation initiale
  for (let i = iRange + 1; i <= iCassure + 2; i++) await avancer(S, i);
  const types = S.telegram.map(m => m.type), textes = S.telegram.map(m => m.texte).join('\n');
  v('INFORMATION : aucun message de type ENTREE envoyé', !types.includes('ENTREE'), JSON.stringify(types));
  v('INFORMATION : le range est signalé (« NE PAS ENTRER ») avec ses bornes, une seule fois', (textes.match(/NE PAS ENTRER/g) || []).length === 1 && /bornes/.test(textes), (textes.match(/NE PAS ENTRER/g) || []).length);
  v('INFORMATION : la cassure fabriquée est signalée comme information, jamais comme entrée', /INFORMATION \(règle non validée/.test(textes) || /Fausse cassure|fausse cassure/.test(textes) || S.telegram.some(m => m.type === 'OBSERVATION'), textes.slice(0, 300));
  v('le message donne la paire et reste sans secret', S.telegram.every(m => /\[BTC\]/.test(m.texte) && !/jeton-test/.test(m.texte)));
  const n = S.telegram.length; await avancer(S, iCassure + 3); await avancer(S, iCassure + 4);
  v('fréquence : pas de répétition du range ni de l’information dans les bougies suivantes', S.telegram.filter(m => /NE PAS ENTRER/.test(m.texte)).length === 1 && S.telegram.length - n <= 2, S.telegram.length - n);
  v('l’état du Veilleur résume le régime et les statuts (tous INFORMATION)', S.c.etat.m6c && S.c.etat.m6c.statuts.every(x => /INFORMATION/.test(x)), JSON.stringify(S.c.etat.m6c)); }

// ── une règle au statut SIGNAL : ENTRÉE avec stop, stop suiveur, jugement du gardien (ici : pas de compte connu → présentée sans) ──
{ const S = await monter({ statuts: { cassure_range: 'SIGNAL' } });
  await S.c.direct();
  for (let i = iRange + 1; i <= iCassure + 1; i++) await avancer(S, i);
  const e = S.telegram.find(m => m.type === 'ENTREE');
  v('SIGNAL : un message ENTREE est envoyé avec stop et stop suiveur', !!e && /stop/.test(e.texte) && /stop suiveur/.test(e.texte), JSON.stringify(S.telegram.map(m => m.type)));
  v('SIGNAL : une seule ENTRÉE (repos de 4 h)', S.telegram.filter(m => m.type === 'ENTREE').length === 1); }

// ── Telegram désactivé dans le profil : rien ne part ──
{ const S = await monter({ statuts: { cassure_range: 'SIGNAL' } });
  await S.c.pilote.modifier(p => { p.commande({ type: 'profil', patch: { notifications: { telegram: false } } }); });
  await S.c.direct(); for (let i = iRange + 1; i <= iCassure + 1; i++) await avancer(S, i);
  v('Telegram désactivé dans le profil : aucun message', S.telegram.length === 0, S.telegram.length); }

console.log(ok + ' ok, ' + ko + ' ko'); process.exit(ko ? 1 : 0);
