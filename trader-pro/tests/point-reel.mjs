/* Test « point de la nuit » sur l'or et le Nasdaq : chaque CHIFFRE du texte doit correspondre au graphique.
   Contrôle INDÉPENDANT du code de lecture : on relit les bougies brutes (pro-<actif>.json), on recalcule le mouvement de la nuit, la MA200 H4 / Daily et les extrêmes, et on vérifie que
   · chaque niveau de prix cité est une vraie valeur du graphique (ouverture, plus haut, plus bas ou clôture d'une bougie, ou MA200 recalculée) ;
   · le pourcentage de la nuit est celui qu'on obtient en recalculant à partir des bougies ;
   · les pourcentages de distance aux niveaux sont cohérents avec le prix et le niveau cités.
   Sans argument : jeu de données synthétique (utilisable partout). Avec « --reel <dossier> » : instantanés réels de la branche « donnees » (copie locale).
   Usage : node trader-pro/tests/point-reel.mjs [--reel <dossier>] */
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { construireTout, ecrireFiches } from '../../outils-donnees/lecture.mjs';
import { composerPoint } from '../point/composer.js';
import { debutNuit } from '../lecture/sessions.js';
import { nombresDuTexte } from '../point/faits.js';
import { regrouper, enH4 } from '../commun/analyse.js';
const H = 3600e3, J = 86400e3, i = process.argv.indexOf('--reel'), reel = i >= 0 ? process.argv[i + 1] : null;
let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
const vb = L => (L || []).map(x => ({ t: x[0], o: x[1], h: x[2], l: x[3], c: x[4] }));
const sma = (B, n) => { if (B.length < n) return null; let s = 0; for (const b of B.slice(-n)) s += b.c; return s / n; };

let dossier = reel, nettoyer = false, MAINT;
if (!reel) {
  MAINT = Math.floor(Date.UTC(2026, 10, 24, 10, 0) / 900e3) * 900e3; dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'rayle-reel-')); nettoyer = true;
  const alea = g => { let s = g >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
  for (const [id, g, p0] of [['or', 7, 3700], ['us100', 11, 20000]]) { const R = alea(g), n = 420 * 96, t0 = MAINT - n * 900e3, M = []; let p = p0; for (let k = 0; k < n; k++) { const kk = n - k, o = p, c = o * (1 + (R() - 0.5) * 0.0024 + (kk < 40 ? -0.0009 : 0)); M.push({ t: t0 + k * 900e3, o, h: Math.max(o, c) * 1.0005, l: Math.min(o, c) * 0.9995, c, v: 100 * (0.7 + R() * 0.6) }); p = c; }
    const cp = B => B.map(b => [b.t, +b.o.toFixed(4), +b.h.toFixed(4), +b.l.toFixed(4), +b.c.toFixed(4), Math.round(b.v)]), nu = B => B.map(({ enCours, ...b }) => b);
    fs.writeFileSync(path.join(dossier, `pro-${id}.json`), JSON.stringify({ id, nom: id, source: 'synthétique', t: MAINT, prix: M[M.length - 1].c, tPrix: M[M.length - 1].t + 900e3, j: cp(nu(regrouper(M, J, 22 * H, MAINT))), h4: cp(nu(enH4(M, MAINT))), h1: cp(nu(regrouper(M, H, 0, MAINT))), m15: cp(M.slice(-500)) })); }
} else { const p = JSON.parse(fs.readFileSync(path.join(dossier, 'pro-or.json'), 'utf8')); MAINT = p.tPrix + 10 * 60e3; }
try {
  const R = await construireTout(dossier, { maintenant: MAINT, reseau: false, actifs: ['or', 'us100'] }); if (!reel) ecrireFiches(dossier, R);
  const reseauFile = path.join(dossier, 'reseau-etat.json'), reseau = fs.existsSync(reseauFile) ? JSON.parse(fs.readFileSync(reseauFile, 'utf8')) : null;
  for (const id of ['or', 'us100']) {
    if (!R.fiches[id]) { console.log(`  ℹ pas de fiche pour ${id} (instantané absent)`); continue; }
    console.log(`— point de la nuit : ${id} —`);
    const P = composerPoint({ type: 'nuit', fiches: { [id]: R.fiches[id] }, maintenant: MAINT, reseau, evenements: [] }), pro = JSON.parse(fs.readFileSync(path.join(dossier, `pro-${id}.json`), 'utf8')), T = P.texteParle;
    console.log('  ' + T.replace(/(.{150}\s)/g, '$1\n  ').slice(0, 1400));
    const J_ = vb(pro.j), H4 = vb(pro.h4).filter(b => b.t + 4 * H <= MAINT), H1 = vb(pro.h1).filter(b => b.t + H <= MAINT), M15 = vb(pro.m15).filter(b => b.t + 900e3 <= MAINT);
    /* valeurs réellement présentes sur le graphique : o / h / l / c de chaque bougie, MA200 recalculées */
    const dec = Math.abs(pro.prix) >= 100 ? 0 : 2, arrondi = x => Math.round(x * 10 ** dec) / 10 ** dec, V = new Set(), ajouter = x => { if (Number.isFinite(x)) V.add(arrondi(x)); };
    for (const B of [J_, H4, H1, M15]) for (const b of B) { ajouter(b.o); ajouter(b.h); ajouter(b.l); ajouter(b.c); } ajouter(pro.prix);
    const ma4 = sma(H4, 200), maJ = sma(J_.filter(b => b.t + J <= MAINT), 200), ma1 = sma(H1, 200); [ma4, maJ, ma1].forEach(ajouter);
    for (const k of [-3, -2, -1]) { const B4 = H4.slice(0, H4.length + k + 1); if (B4.length >= 200) ajouter(sma(B4, 200)); }
    const nums = nombresDuTexte(T).filter(n => n.valeur >= (dec ? 50 : 500) && !n.heure && !n.minute), inconnus = nums.filter(n => !V.has(arrondi(n.valeur)) && !V.has(Math.round(n.valeur)));
    v(nums.length >= 1, `${id} : le texte cite des niveaux de prix (${nums.length})`);
    v(inconnus.length === 0, `${id} : chaque niveau cité est une vraie valeur du graphique (bougies ou MA200)${inconnus.length ? ' — introuvables : ' + inconnus.map(n => n.brut).join(', ') : ''}`);
    /* mouvement de la nuit recalculé à la main */
    const debut = debutNuit(MAINT), avant = H1.filter(b => b.t + H <= debut), p0 = avant.length ? avant[avant.length - 1].c : null, p1 = pro.prix, pct = p0 ? (p1 / p0 - 1) * 100 : null;
    if (pct != null) { const attendu = Math.abs(pct).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).replace(/[  ]/g, ' '); const dit = /(?:a pris|a perdu) ([\d,]+) %/.exec(T) || /: ([+−-][\d,]+) %, entre/.exec(T);
      if (Math.abs(pct) >= 0.3) v(!!dit && (dit[1].replace(/[+−-]/, '') === attendu || Math.abs(parseFloat(dit[1].replace(',', '.').replace(/[+−-]/, '')) - Math.abs(pct)) < 0.06), `${id} : le mouvement de la nuit (${pct.toFixed(2)} % recalculé) est celui qui est dit${dit ? ' (« ' + dit[1] + ' % »)' : ''}`); else console.log(`  ℹ ${id} : nuit calme (${pct.toFixed(2)} %), pas de pourcentage à comparer`); }
    /* distances en % aux niveaux : « <niveau> à <prix> (+x,x %) » → recalcul */
    let verifs = 0; for (const m of T.matchAll(/ à ((?:\d[\d ]*)(?:,\d+)?) \(([+−-]\d+,\d) %\)/g)) { const niveau = parseFloat(m[1].replace(/[   ]/g, '').replace(',', '.')), dit = parseFloat(m[2].replace('−', '-').replace(',', '.')), calc = (niveau / p1 - 1) * 100; verifs++; v(Math.abs(calc - dit) <= 0.06 + 0.5 / p1 * 100, `${id} : « ${m[1]} (${m[2]} %) » : recalcul ${calc.toFixed(2)} %`); }
    if (!verifs) console.log(`  ℹ ${id} : aucune distance en % dans ce texte`);
    v(P.retirees.length === 0, `${id} : aucune phrase retirée par la règle anti-invention`);
  }
} finally { if (nettoyer) fs.rmSync(dossier, { recursive: true, force: true }); }
console.log(ko ? `${ko} échec(s) sur ${ok + ko}` : `tous les contrôles passent (${ok})`); process.exit(ko ? 1 : 0);
