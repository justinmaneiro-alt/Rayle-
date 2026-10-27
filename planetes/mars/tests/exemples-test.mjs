import * as E from '../pc/exemples.js';
let ok = 0, ko = 0;
const v = (nom, cond, detail = '') => { if (cond) ok++; else { ko++; console.log('KO  ' + nom + (detail !== '' ? ' — ' + detail : '')); } };

v('vingt et une fenêtres avec identifiants uniques (13 d’origine + Solana, Dogecoin et les six fenêtres de performance de l’agent)', E.FENETRES.length === 21 && new Set(E.FENETRES.map(f => f.id)).size === 21);
v('M6 : les huit nouvelles fenêtres sont réelles ; les six de performance ouvrent le poste de l’agent sur le bon onglet', ['graphique-sol', 'graphique-doge'].every(i => E.fenetre(i) && E.fenetre(i).reel && E.fenetre(i).type === 'bougies') && [['perf-strategies', 'strategies'], ['gardien-prop', 'gardien'], ['propositions-agent', 'ensemble'], ['regime-marche', 'regime'], ['journal-tilt', 'journal'], ['proba-evaluation', 'simulation']].every(([i, o]) => E.fenetre(i) && E.fenetre(i).reel && E.fenetre(i).focus === 'agent' && E.fenetre(i).onglet === o));
v('plus aucune fenêtre factice sur la table', E.FENETRES.every(f => f.reel === true));
v('fenêtres demandées : graphiques US100 / or / Bitcoin, marché, dashboard, contexte, agent BTC', ['graphique-us100','graphique-or','graphique-btc','marche','dashboard','contexte','agent-btc'].every(i => E.fenetre(i)));
v('positions, signaux et performance factices supprimés ; le calendrier est maintenant RÉEL', !E.fenetre('positions') && !E.fenetre('signaux') && !E.fenetre('performance') && E.fenetre('calendrier') && E.fenetre('calendrier').reel === true);
v('fenêtres du hub Finance et des alertes', ['alertes','calendrier','cot','actus-finance','banques','taux'].every(i => E.fenetre(i) && E.fenetre(i).reel && E.fenetre(i).dock));
v('chaque fenêtre a un titre, un type et un aperçu', E.FENETRES.every(f => f.titre && f.type && f.apercu));
v('instruments par défaut : US100 puis XAU/USD', E.INSTRUMENTS[0].id === 'US100' && E.INSTRUMENTS[0].nom === 'Nasdaq 100' && E.INSTRUMENTS[1].id === 'XAUUSD');
v('indicateurs au choix : EMA et MA', E.INDICATEURS.includes('EMA') && E.INDICATEURS.includes('MA'));
v('marqueur « EXEMPLE » présent dans l’avertissement', /EXEMPLE/.test(E.AVERTISSEMENT) && /factices/.test(E.AVERTISSEMENT));
v('textes d’exemple étiquetés', E.signaux().every(s => /Exemple/.test(s.texte)) && E.evenements().every(e => /Exemple/.test(e.nom)));

const b1 = E.bougies(11, 60, 20150, 14), b2 = E.bougies(11, 60, 20150, 14), b3 = E.bougies(12, 60, 20150, 14);
v('bougies reproductibles', JSON.stringify(b1) === JSON.stringify(b2) && JSON.stringify(b1) !== JSON.stringify(b3));
v('bougies cohérentes (bas ≤ ouverture, clôture ≤ haut)', b1.every(x => x.l <= Math.min(x.o, x.c) && x.h >= Math.max(x.o, x.c)));
v('60 bougies', b1.length === 60);
const ma = E.moyenneSimple([1, 2, 3, 4, 5], 3), ema = E.moyenneExp([1, 2, 3, 4, 5], 3);
v('moyenne simple : null puis valeurs', ma[0] === null && ma[1] === null && ma[2] === 2 && ma[4] === 4);
v('moyenne exponentielle : cohérente', ema[0] === null && ema[4] > 3 && ema[4] < 5);
const cv = E.courbe(5, 60, 10000);
v('courbe : 60 points positifs', cv.length === 60 && cv.every(x => x > 0));
v('positions : 3 lignes complètes', E.positions().length === 3 && E.positions().every(p => p.actif && p.sens && Number.isFinite(p.pl)));
v('fenetre(id) retrouve la fenêtre', E.fenetre('dashboard').type === 'dashboard' && E.fenetre('inconnue') === null);
console.log(ok + ' réussis, ' + ko + ' échecs');
process.exit(ko ? 1 : 0);
