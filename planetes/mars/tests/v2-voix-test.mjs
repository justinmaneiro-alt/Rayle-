// Tests de la détection vocale des agents prêts, de la lecture du marché et des outils (V2, phase 6).  Lancer :  node planetes/mars/tests/v2-voix-test.mjs
import { detecterVoixV2 } from '../pc/agents-v2/voix-agents-v2.js';
import { agreger } from '../pc/agents-v2/lecture-marche-v2.js';
let ok = 0, ko = 0; const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d ? ' — ' + d : '')); };
const norm = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/['’\-\/]/g, ' ').replace(/[?!.,;:…«»"]/g, ' ').replace(/\s+/g, ' ').trim();
const d = t => detecterVoixV2(norm(t));

// outils
for (const [p, mot] of [['À quoi sert le gardien prop ?', 'Gardien prop'], ['À quoi sert le dashboard analytique ?', 'Dashboard'], ['C’est quoi l’outil COT ?', 'COT'], ['Explique-moi le panneau corrélations', 'Corrélations'], ['À quoi servent les banques centrales ?', 'Banques centrales'], ['À quoi sert la watchlist ?', 'Marché · watchlist']]) {
  const r = d(p); v('« ' + p + ' » → outil « ' + mot + ' »', r && r.type === 'outil' && r.texte.includes(mot), JSON.stringify(r));
}
v('outil inconnu : réponse honnête', d('À quoi sert le panneau frigo magique ?').type === 'outil' && /Je ne connais pas/.test(d('À quoi sert le panneau frigo magique ?').texte));
v('« à quoi sert » sans outil connu ni mot « outil » : laissé aux autres commandes (IA)', d('À quoi sert la vie ?') === null);
v('une question générale n’est PAS volée', d('Explique-moi la relativité') === null && d('Quelle heure est-il ?') === null && d('Parle-moi de Mars') === null);
// agents prêts
for (const p of ['Ouvre les agents prêts', 'Lance l’assistant de stratégie', 'Crée une stratégie guidée', 'Montre-moi l’agent tendance', 'Ouvre l’agent divergence RSI']) v('« ' + p + ' » → agents prêts', (d(p) || {}).type === 'agents', JSON.stringify(d(p)));
// lecture
const L = d('Lis le marché'); v('« lis le marché » → lecture H1, paire courante', L && L.type === 'lecture' && L.unite === 'H1' && L.paire === null, JSON.stringify(L));
const L2 = d('Analyse le Bitcoin en H4'); v('« analyse le Bitcoin en H4 »', L2 && L2.paire === 'BTC' && L2.unite === 'H4', JSON.stringify(L2));
const L3 = d('Explique les 10 dernières bougies de Solana'); v('« explique les 10 dernières bougies de Solana »', L3 && L3.paire === 'SOL' && L3.n === 10 && L3.parBougie && L3.unite === 'M15', JSON.stringify(L3));
const L4 = d('Lecture du marché Dogecoin en M15'); v('« lecture du marché Dogecoin en M15 »', L4 && L4.paire === 'DOGE' && L4.unite === 'M15', JSON.stringify(L4));
v('« bougie par bougie » → lecture M15 par défaut', (d('Fais-moi une lecture bougie par bougie') || {}).parBougie === true);
v('bornes : 500 bougies → 30 au plus', (d('explique les 500 dernières bougies') || {}).n === 30);
v('phrases sans rapport : aucune détection', ['Ouvre Mars', 'Montre-moi l’or en H1', 'Coupure', 'Merci'].every(p => d(p) === null));

// agrégation
const m15 = []; const T = Date.UTC(2025, 0, 6, 0, 0); for (let i = 0; i < 16; i++) m15.push({ t: T + i * 900e3, o: 100 + i, h: 101 + i, l: 99 + i, c: 100.5 + i, v: 10, vb: 4 });
const h1 = agreger(m15, 'H1'); v('agrégation M15 → H1 : 4 bougies', h1.length === 4 && h1[0].o === 100 && h1[0].c === 103.5 && h1[0].h === 104 && h1[0].l === 99 && h1[0].v === 40 && h1[0].t === T);
const h4 = agreger(m15, 'H4'); v('agrégation M15 → H4 : 1 bougie qui couvre tout', h4.length === 1 && h4[0].h === 116 && h4[0].l === 99 && h4[0].c === 115.5);
v('agrégation M15 : bougies inchangées (copie)', agreger(m15, 'M15').length === 16 && agreger(m15, 'M15') !== m15);
console.log(ko ? ko + ' échec(s) / ' + (ok + ko) : ok + ' vérifications réussies.'); process.exit(ko ? 1 : 0);
