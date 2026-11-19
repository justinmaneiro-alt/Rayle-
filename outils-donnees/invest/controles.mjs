/* Contrôles automatiques de la publication v2 + enrichissement du catalogue XTB (nom, secteur, devise, capitalisation…) à partir des lignes calculées.
   Usage : node outils-donnees/invest/controles.mjs <dossier de sortie du calcul> [--ecrire-catalogue]   → code de sortie 1 si un contrôle échoue. */
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { verdictLigne, HORIZONS } from '../../trader-pro/invest/modele.js';
const ici = path.dirname(fileURLToPath(import.meta.url)), racine = path.resolve(ici, '../..'), dossier = path.resolve(process.argv[2] || 'sortie-invest'), ecrireCat = process.argv.includes('--ecrire-catalogue');
const lire = f => JSON.parse(fs.readFileSync(f, 'utf8')), man = lire(path.join(dossier, 'manifest.json')), lignes = [];
for (const s of man.shards) lignes.push(...lire(path.join(dossier, 'index', s.id + '.json')).lignes);
let ko = 0; const v = (c, m) => { if (!c) { ko++; console.log('  ✗ ' + m); } };
console.log('instruments par classe :', JSON.stringify(man.comptes)); console.log('actions par pays :', JSON.stringify(man.actionsParPays));
const pal = {}; for (const l of lignes.filter(x => x.c === 'action')) pal[l.pal] = (pal[l.pal] || 0) + 1; console.log('actions par palier :', JSON.stringify(pal));
v(man.comptes.action > 1500 && man.comptes.ETF >= 250 && man.comptes.devise >= 50 && man.comptes.indice >= 20 && man.comptes.crypto >= 25 && man.comptes['matière première'] >= 15 && man.comptes.obligataire >= 8, 'effectifs minimaux par classe');
/* aucun NaN / undefined / null brut dans les chiffres affichables */
let nan = 0; const texte = JSON.stringify(lignes); if (/NaN|Infinity|undefined/.test(texte)) nan++; v(nan === 0, 'aucun NaN ni Infinity dans l’index');
for (const f of fs.readdirSync(path.join(dossier, 'fiches')).slice(0, 400)) { if (/NaN|Infinity|undefined/.test(fs.readFileSync(path.join(dossier, 'fiches', f), 'utf8'))) { nan++; v(false, 'NaN dans la fiche ' + f); break; } }
const par = id => lignes.find(l => l.id === id);
const ECH = ['MC.FR', 'TTE.FR', 'AIR.FR', 'SU.FR', 'AI.FR', 'SAP.DE', 'ASML.NL', 'AAPL.US', 'CHTR.US', 'EURUSD', 'GOLD', 'US100'];
console.log('\nÉchantillon (horizon 1–3 ans) :'); for (const id of ECH) { const l = par(id); if (!l) { v(false, id + ' absent'); continue; } const x = verdictLigne(l, 'moyen', { ajust: man.ajust }), tous = HORIZONS.map(h => verdictLigne(l, h.id, { ajust: man.ajust }).lib.slice(0, 6)).join('/'); console.log(`  ${id.padEnd(8)} ${String(l.n).slice(0, 30).padEnd(30)} ${String(l.d).padEnd(4)} ${String(l.px).padEnd(9)} score ${x.score ?? '—'} ${x.lib} [${tous}] complétude ${l.comp ?? '—'}${l.r.mos != null ? ' marge ' + Math.round(l.r.mos * 100) + ' %' : ''}${x.badges.length ? ' ⚠ ' + x.badges.map(b => b.id).join(',') : ''}`); }
const ch = par('CHTR.US'); if (ch) { const x = verdictLigne(ch, 'moyen', { ajust: man.ajust }); v(x.badges.some(b => b.id === 'piege') && (x.lib === 'Neutre' || x.lib === 'Peu attractif' || x.lib === 'À éviter'), 'CHTR : piège à valeur, jamais mieux que « Neutre » (obtenu : ' + x.lib + ')'); }
v(par('AAPL.US') && par('AAPL.US').d === 'USD' && par('ASML.NL') && par('MC.FR').d === 'EUR', 'devises de cotation cohérentes (AAPL USD, LVMH EUR)');
v(par('MC.FR') && par('MC.FR').cap > 100000 && par('AAPL.US').cap > 1e6, 'capitalisations plausibles (LVMH > 100 Md€, Apple > 1 000 Md€)');
/* enrichissement du catalogue */
if (ecrireCat) {
  const idx = new Map(lignes.map(l => [l.id, l])); const dossierCat = path.join(racine, 'data/xtb-univers'); let n = 0, perdus = 0;
  const tout = []; for (const nom of ['actions', 'etf', 'devises', 'indices', 'matieres', 'crypto', 'obligataire']) { const f = path.join(dossierCat, nom + '.json'); tout.push([f, lire(f)]); }
  const etf = tout.find(([f]) => f.endsWith('etf.json'))[1], dejaEtf = new Set(etf.map(e => e.symbole_xtb)), actionsF = tout.find(([f]) => f.endsWith('actions.json')), restant = [];
  for (const a of actionsF[1]) { const l = idx.get(a.symbole_xtb); if (l && l.c === 'ETF' && !dejaEtf.has(a.symbole_xtb)) { etf.push({ ...a, classe: 'ETF', categorie: l.cat || 'ETF coté', zone: l.z }); continue; } restant.push(a); }
  actionsF[1].length = 0; actionsF[1].push(...restant);
  for (const [f, L] of tout) for (const c of L) { const l = idx.get(c.symbole_xtb); if (!l) { if (c.classe !== 'obligataire') { c.donnees = false; perdus++; } continue; } c.donnees = true; c.nom = l.n || c.nom; c.secteur = l.s || c.secteur; c.industrie = l.i || c.industrie; c.devise = l.d || c.devise; c.capitalisation = l.cap ? l.cap * 1e6 : c.capitalisation; c.bourse = c.bourse || null; if (l.cap) c.capitalisation_devise = 'EUR'; n++; }
  for (const [f, L] of tout) fs.writeFileSync(f, JSON.stringify(L));
  const index = lire(path.join(dossierCat, 'index.json')); index.enrichi = Date.now(); index.comptes = Object.fromEntries(tout.map(([f, L]) => [path.basename(f, '.json'), L.length])); index.comptes.analyses = n; index.comptes.sans_donnees = perdus; fs.writeFileSync(path.join(dossierCat, 'index.json'), JSON.stringify(index, null, 1));
  console.log('\ncatalogue enrichi :', n, 'instruments analysés,', perdus, 'sans cours Yahoo (retirés, titres radiés ou renommés) ; ETF déplacés depuis les actions :', etf.length - dejaEtf.size);
}
console.log(ko ? `\n✗ ${ko} contrôle(s) en échec` : '\ntous les contrôles passent'); process.exit(ko ? 1 : 0);
