// Tests des réglages et de la mesure des images par seconde. Lancer :  node galaxie/tests/reglages-test.mjs
import { DEFAUTS, normaliser, lire, ecrire, detecterAppareil, appareilEffectif, niveauDeDepart, parametres, CLE } from '../reglages.js';
import { MesureFps, banc, recommander, resume } from '../mesure.js';
import { NIVEAUX } from '../qualite.js';

let ok = 0, ko = 0;
const v = (nom, cond, detail = '') => { cond ? ok++ : ko++; if (!cond) console.log('KO  ' + nom + (detail ? ' — ' + detail : '')); };
const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* ── Normalisation : toujours un réglage complet et valide ── */
v('défauts : null → défauts', egal(normaliser(null), normaliser({})) && normaliser(null).qualite === 'auto');
v('texte, nombre, tableau → défauts', [normaliser('x'), normaliser(42), normaliser([1, 2])].every(r => r.qualite === 'auto' && r.echelle === 100));
v('qualité inconnue → auto', normaliser({ qualite: 'ultra' }).qualite === 'auto');
v('échelle bornée 50–100', normaliser({ echelle: 5 }).echelle === 50 && normaliser({ echelle: 900 }).echelle === 100 && normaliser({ echelle: '75' }).echelle === 75 && normaliser({ echelle: 'abc' }).echelle === 100);
v('densité bornée 20–100', normaliser({ densite: 0 }).densite === 20 && normaliser({ densite: 999 }).densite === 100);
v('bloom : booléen ou null', normaliser({ bloom: true }).bloom === true && normaliser({ bloom: 'oui' }).bloom === null);
v('msaa : 0, 2, 4 ou null', normaliser({ msaa: 2 }).msaa === 2 && normaliser({ msaa: 8 }).msaa === null);
v('limite d’images : valeurs permises', normaliser({ fpsMax: 60 }).fpsMax === 60 && normaliser({ fpsMax: 77 }).fpsMax === null && normaliser({ fpsMax: 0 }).fpsMax === 0);
v('mode jeu : sous-réglages bornés', (() => { const j = normaliser({ jeu: { fps: 999, echelle: 1, pauseHorsFocus: 'x' } }).jeu; return j.fps === 30 && j.echelle === 40 && j.pauseHorsFocus === true && j.reduireTextures === true; })());
v('vitesse du système : bornée 10–300, défaut 100', normaliser({}).vitesse === 100 && normaliser({ vitesse: 1 }).vitesse === 10 && normaliser({ vitesse: 999 }).vitesse === 300 && normaliser({ vitesse: 50 }).vitesse === 50 && normaliser({ vitesse: 'x' }).vitesse === 100);
v('champ inconnu ignoré', !('hack' in normaliser({ hack: 1 })));
v('normaliser est idempotent', (() => { const r = normaliser({ qualite: 'haute', echelle: 80, bloom: false, jeu: { fps: 15 } }); return egal(r, normaliser(r)); })());

/* ── Persistance (stockage simulé) ── */
const faux = () => { const d = {}; return { getItem: k => (k in d ? d[k] : null), setItem: (k, x) => { d[k] = String(x); }, brut: d }; };
{ const s = faux(); ecrire({ qualite: 'moyenne', echelle: 70 }, s); const r = lire(s); v('écriture puis lecture', r.qualite === 'moyenne' && r.echelle === 70 && r.jeu.fps === 30); }
{ const s = faux(); s.setItem(CLE, '{pas du json'); v('JSON corrompu → défauts', lire(s).qualite === 'auto'); }
{ const s = faux(); s.setItem(CLE, JSON.stringify({ qualite: 'haute', echelle: -5, jeu: null })); const r = lire(s); v('contenu invalide corrigé', r.qualite === 'haute' && r.echelle === 50 && r.jeu.fps === 30); }
{ const casse = { getItem() { throw new Error('bloqué'); }, setItem() { throw new Error('bloqué'); } }; v('stockage indisponible : pas de plantage', lire(casse).qualite === 'auto' && (ecrire({}, casse), true)); }

/* ── Appareils ── */
v('PC : ni tactile ni mobile', detecterAppareil({ tactile: false, mobile: false, largeur: 1440 }) === 'pc');
v('téléphone : tactile et petit écran', detecterAppareil({ tactile: true, mobile: true, largeur: 390 }) === 'telephone');
v('tablette : tactile et grand écran', detecterAppareil({ tactile: true, mobile: true, largeur: 820 }) === 'tablette');
v('appareil forcé prime sur la détection', appareilEffectif(normaliser({ appareil: 'telephone' }), { tactile: false, mobile: false, largeur: 1920 }) === 'telephone');
v('niveau de départ : PC = haute, tablette = moyenne, téléphone = basse', ['pc', 'tablette', 'telephone'].map(a => niveauDeDepart(normaliser({ appareil: a }))).join() === 'haute,moyenne,basse');
v('niveau choisi à la main : respecté', niveauDeDepart(normaliser({ qualite: 'basse', appareil: 'pc' })) === 'basse');

/* ── Paramètres de rendu ── */
const base = normaliser({});
const haute = parametres(base, 'haute', { appareil: 'pc' });
v('haute = valeurs du niveau', haute.dpr === NIVEAUX.haute.dpr && haute.bloom === true && haute.msaa === 4 && haute.etoiles === NIVEAUX.haute.etoiles && haute.fpsMax === 0 && haute.animerDecor === true);
v('échelle 50 % : résolution divisée par deux', parametres(normaliser({ echelle: 50 }), 'haute', { appareil: 'pc' }).dpr === NIVEAUX.haute.dpr / 2);
v('bloom forcé à faux', parametres(normaliser({ bloom: false }), 'haute', { appareil: 'pc' }).bloom === false);
v('bloom forcé à vrai sur le niveau bas', parametres(normaliser({ bloom: true }), 'basse', { appareil: 'pc' }).bloom === true);
v('msaa forcé', parametres(normaliser({ msaa: 2 }), 'basse', { appareil: 'pc' }).msaa === 2);
v('densité 50 % : moitié des étoiles', parametres(normaliser({ densite: 50 }), 'haute', { appareil: 'pc' }).etoiles === Math.round(NIVEAUX.haute.etoiles / 2));
v('limite d’images par défaut : PC illimité, tablette 60, téléphone 30', [0, 60, 30].join() === ['pc', 'tablette', 'telephone'].map(a => parametres(base, 'moyenne', { appareil: a }).fpsMax).join());
v('limite d’images choisie prime sur l’appareil', parametres(normaliser({ fpsMax: 120 }), 'haute', { appareil: 'telephone' }).fpsMax === 120);
const jeu = parametres(normaliser({ bloom: true, msaa: 4, densite: 100, echelle: 100, fpsMax: 144 }), 'haute', { jeu: true, appareil: 'pc' });
v('mode jeu : bloom, MSAA et décor animé coupés quoi qu’il arrive', jeu.bloom === false && jeu.msaa === 0 && jeu.animerDecor === false && jeu.anisotropie === 1);
v('mode jeu : limite d’images et échelle du mode jeu', jeu.fpsMax === 30 && Math.abs(jeu.dpr - NIVEAUX.basse.dpr * 0.6) < 1e-9);
v('mode jeu : bien moins de particules que la qualité basse', jeu.etoiles < NIVEAUX.basse.etoiles && jeu.asteroides < NIVEAUX.basse.asteroides && jeu.nuee < NIVEAUX.basse.nuee);
v('décor riche : oui en haute et moyenne, non en basse et en mode jeu', parametres(base, 'haute', { appareil: 'pc' }).riche === true && parametres(base, 'moyenne', { appareil: 'pc' }).riche === true && parametres(base, 'basse', { appareil: 'pc' }).riche === false && jeu.riche === false);
v('mode jeu : plus léger que tous les niveaux', jeu.dpr < NIVEAUX.basse.dpr && jeu.etoiles < NIVEAUX.basse.etoiles);
v('résolution jamais sous 0,4', parametres(normaliser({ echelle: 50, jeu: { echelle: 40 } }), 'basse', { jeu: true }).dpr >= 0.4);

/* ── Mesure des images par seconde ── */
{
  const m = new MesureFps(); let t = 1000;
  for (let i = 0; i < 301; i++) { m.image(t); t += 1000 / 60; }
  const s = m.stats(5000);
  v('60 images/s stables mesurées', Math.abs(s.fps - 60) < 0.5 && Math.abs(s.pire1 - 60) < 1 && s.pics === 0, JSON.stringify(s));
}
{
  const m = new MesureFps(); let t = 0;
  for (let i = 0; i < 400; i++) { m.image(t); t += (i % 50 === 49) ? 120 : 10; }   // 100 i/s avec une saccade de 120 ms toutes les 50 images
  const s = m.stats(8000);
  v('les saccades font chuter le « pire 1 % » sans bouger la moyenne', s.moyenne > 60 && s.pire1 < 12 && s.pics >= 5, JSON.stringify(s));
}
{
  const m = new MesureFps(10); for (let i = 0; i < 100; i++) m.image(i * 16);
  v('tampon circulaire : jamais plus de la capacité', m.n === 10 && m.durees(1e9).length === 10);
}
{
  const m = new MesureFps(); m.image(0); m.image(5000); v('pause de plus de 2 s ignorée (onglet masqué)', m.stats().images === 0);
}
{
  const m = new MesureFps(); let t = 0; for (let i = 0; i < 100; i++) { m.image(t); t += 16.7; } m.reset();
  v('reset vide la mesure', m.n === 0 && m.stats().fps === 0);
}
{
  const m = new MesureFps(); let t = 0; for (let i = 0; i < 20; i++) { m.image(t); t += 20; } for (let i = 0; i < 20; i++) { m.image(t); t += 10; }
  v('fenêtre glissante : seul le récent compte', m.stats(150).fps > 95, String(m.stats(150).fps));
  v('courbe : n dernières durées', m.courbe(15).length === 15 && m.courbe(15).every(x => Math.abs(x - 10) < 1e-6));
}
v('stats sans données : zéros, pas de NaN', Object.values(new MesureFps().stats()).every(x => x === 0));

/* ── Recommandation et test de performance ── */
v('recommandation : le plus haut niveau fluide', recommander([{ niveau: 'haute', pire1: 80 }, { niveau: 'moyenne', pire1: 100 }, { niveau: 'basse', pire1: 120 }]) === 'haute');
v('recommandation : haute saccade → moyenne', recommander([{ niveau: 'haute', pire1: 30 }, { niveau: 'moyenne', pire1: 70 }, { niveau: 'basse', pire1: 120 }]) === 'moyenne');
v('recommandation : tout saccade → basse', recommander([{ niveau: 'haute', pire1: 10 }, { niveau: 'moyenne', pire1: 20 }, { niveau: 'basse', pire1: 30 }]) === 'basse');
v('résumé parlé', /Je recommande la qualité moyenne/.test(resume([{ niveau: 'haute', moyenne: 40, pire1: 20 }], 'moyenne')));
{
  const mesure = new MesureFps(); const appliques = []; let horloge = 0; const pas = { haute: 30, moyenne: 60, basse: 144 };
  let niveau = null;
  const hote = {
    mesure, progres() {},
    async appliquer(n) { niveau = n; appliques.push(n); },
    async attendre(ms) { const fin = horloge + ms; while (horloge < fin) { horloge += 1000 / pas[niveau]; mesure.image(horloge); } }   // simule des images à la cadence du niveau
  };
  const r = await banc(hote, { echauffement: 500, duree: 2000 });
  v('banc : essaie haute, moyenne puis basse', appliques.join() === 'haute,moyenne,basse');
  v('banc : mesures cohérentes avec la cadence simulée', Math.abs(r.resultats[0].moyenne - 30) < 2 && Math.abs(r.resultats[1].moyenne - 60) < 3 && Math.abs(r.resultats[2].moyenne - 144) < 6, JSON.stringify(r.resultats.map(x => Math.round(x.moyenne))));
  v('banc : recommande moyenne quand haute tourne à 30', r.recommandation === 'moyenne', r.recommandation);
  v('banc : texte parlé complet', r.texte.startsWith('Test terminé.') && r.texte.includes('haute') && r.texte.includes('moyenne'));
}

console.log(`${ok} réussis, ${ko} échecs`);
process.exit(ko ? 1 : 0);
