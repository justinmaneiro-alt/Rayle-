// Politique Telegram de Kepler : alerte d'exécution (action, entrée, taille, TP, SL, levier) et bilan de fin de journée. Lancer : node galaxie/tests/telegram-politique-test.mjs
import { autorise, TYPES_TELEGRAM, dimension, texteExecution, bilanJour } from '../../agent-pc/telegram-politique.mjs';
let ok = 0, ko = 0; const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d ? ' — ' + d : '')); };

v('types autorisés : exécution, bilan, test', TYPES_TELEGRAM.join() === 'EXECUTION,BILAN_JOUR,TEST');
for (const t of ['RAPPORT', 'OBSERVATION', 'PREPARATION', 'SYSTEME', 'MACRO', 'ENTREE', undefined]) v('refusé : ' + t, !autorise(t));
for (const t of ['EXECUTION', 'BILAN_JOUR']) v('autorisé : ' + t, autorise(t));

const p = { actif: 'BTC', tf: 'M15', sens: 1, nom: 'Rebond', entree: 100000, stop: 99000, cible1: 103000, cible2: 105000 };
const d = dimension(p, { capital: 10000, risquePct: 1 });
v('taille = risque / distance au stop', Math.abs(d.taille - 0.1) < 1e-9 && d.risqueUsd === 100);
v('levier = valeur de la position / capital', Math.abs(d.levier - 1) < 1e-9);
const t = texteExecution(p, { capital: 10000, risquePct: 1 });
for (const [n, re] of [['action', /Action : ACHAT/], ['entrée', /Entrée : 100000,0/], ['taille', /Taille : 0,1000 BTC/], ['TP', /TP : 103000,0 · TP2 105000,0/], ['SL', /SL : 99000,0/], ['levier', /Levier : x1,0/], ['simulation', /aucun ordre/]]) v('exécution : ' + n, re.test(t), t);
const tv = texteExecution({ ...p, sens: -1, entree: 100, stop: 100.5, cible1: 98, cible2: null }, { capital: 10000, risquePct: 1 });
v('vente : action VENTE, levier calculé', /Action : VENTE/.test(tv) && /Levier : x2,0/.test(tv), tv);
v('stop invalide : n.c., jamais un faux chiffre', /Taille : n\.c\./.test(texteExecution({ ...p, stop: p.entree })) && /Levier : n\.c\./.test(texteExecution({ ...p, stop: p.entree })));

const J = Date.UTC(2026, 10, 2, 21, 0), h = (n, min) => J - 86400e3 / 2 + n * 3600e3 + (min || 0);
const lignes = [
  { id: 'a', actif: 'BTC', sens: 1, entree: 100, statut: 'terminee', tEntree: h(0), tSortie: h(2), R: 1.5, usd: 150, type: 'TP' },
  { id: 'b', actif: 'SOL', sens: -1, entree: 50, statut: 'terminee', tEntree: h(1), tSortie: h(3), R: -1, usd: -101.5, type: 'SL' },
  { id: 'c', actif: 'DOGE', sens: 1, entree: 0.2, statut: 'ouverte', tEntree: h(4) },
  { id: 'hier', actif: 'BTC', sens: 1, entree: 90, statut: 'terminee', tEntree: J - 2 * 86400e3, tSortie: J - 86400e3 - 3600e3, R: 2, usd: 200, type: 'TP' }];
const b = bilanJour(lignes, J, { capital: 10048.5 });
v('bilan : date', /bilan du 02\/11\/2026/.test(b), b);
v('bilan : positions du jour listées (TP, SL, ouverte), pas celle d’hier', /BTC ACHAT[^\n]*TP \+1,50 R/.test(b) && /SOL VENTE[^\n]*SL −1,00 R/.test(b) && /DOGE[^\n]*encore ouverte/.test(b) && !/@ 90/.test(b), b);
v('bilan : performance du jour en R et en $ (hier exclu)', /Performance du jour : \+0,50 R · \+48,50 \$/.test(b), b);
v('bilan : compteurs', /Terminées : 2 \(1 gagnante\) · Encore ouvertes : 1/.test(b), b);
v('bilan : journée vide', /Aucune position aujourd’hui/.test(bilanJour([], J)));
console.log(ok + ' ok, ' + ko + ' ko'); process.exit(ko ? 1 : 0);
