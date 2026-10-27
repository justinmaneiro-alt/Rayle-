/* S1 : le vaisseau de Saturne dans Chrome : entrée, vues, vol au clavier et à la manette simulée, collisions, pilote automatique, salle médicale, ordres vocaux,
   panneau de réglage de manette, trois niveaux de qualité (captures et images/s). Captures dans docs/captures-s1/. */
import { ouvrirGalaxie, attendre, compteur } from './terre-aide.mjs';
import fs from 'node:fs';
const c = compteur(), SORTIE = '../docs/captures-s1/'; fs.mkdirSync(SORTIE, { recursive: true });
const { navigateur, page, erreurs } = await ouvrirGalaxie({ largeur: 1600, hauteur: 900, avant: async p => {
  await p.evaluateOnNewDocument(() => {
    window.__gp = { id: 'Faux contrôleur (STANDARD GAMEPAD Vendor: 0000 Product: 0000)', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
    navigator.getGamepads = () => [window.__gp];
  });
} });
const G = (f, ...a) => page.evaluate(f, ...a);
const etat = () => G(() => window.Saturne.etat());
const attendreEtat = (cond, ms = 20000) => page.waitForFunction(cond, { timeout: ms });
const nom = (t, ok, d = '') => c.verifier(t, ok, String(d).slice(0, 220));

// ── entrée
await G(() => window.Galaxie.nav.allerA('saturne', { entrer: true }));
await attendreEtat(() => window.Saturne && window.Saturne.etat().actif && window.Saturne.etat().entree, 60000);
await attendre(1500);
let e = await etat();
nom('entrée : module actif, vue extérieure, en orbite de Saturne, assistance et limiteur', e.mode === 'vol' && e.vue === 'exterieur' && e.vol.orbite === 'saturne' && e.vol.assist && e.vol.limiteur, JSON.stringify({ m: e.mode, v: e.vue, o: e.vol && e.vol.orbite }));
nom('le vaisseau provisoire de la galaxie est masqué pendant la visite', await G(() => { const o = window.Galaxie.systeme.parId('saturne'); return o.satellites[0].vaisseau.visible === false; }));
await page.screenshot({ path: SORTIE + 'exterieur.png' });

// ── vues
await G(() => window.Saturne.vue('cockpit')); await attendre(1800); e = await etat();
const dist = await G(() => { const e = window.Saturne.etat(), v = window.Saturne.vaisseauObjet(); return window.Saturne.camera().position.distanceTo(v.groupe.position); });
nom('cockpit : la caméra est dans le vaisseau (à moins de 0,8 unité du centre ; le vaisseau fait 3 unités de long)', e.vue === 'cockpit' && dist < 0.8, dist.toFixed(3));
await page.screenshot({ path: SORTIE + 'cockpit.png' });
await G(() => window.Saturne.basculerAssis()); await attendre(1500);
nom('on peut se lever (vue debout) puis se rasseoir', (await etat()).assis === false && (await G(() => window.Saturne.basculerAssis())) && (await etat()).assis === true);
await G(() => window.Saturne.vue('libre')); await attendre(1500); e = await etat();
nom('vue libre : la caméra se détache et regarde le vaisseau', e.vue === 'libre');
await page.screenshot({ path: SORTIE + 'libre.png' });
await G(() => window.Saturne.vue('cockpit')); await attendre(1500);
await G(() => { const t = new Set(); window.Saturne.reglages(); });

// ── vol au clavier : sortie d'orbite, accélération, assistance, postcombustion, vol newtonien
const v0 = (await etat()).vol;
await page.keyboard.down('KeyW'); await attendre(2200);
let w = (await etat()).vol;
nom('clavier W : le vaisseau quitte l’orbite et accélère', w.orbite === null && w.vitesse > 3, `v ${w.vitesse.toFixed(2)}`);
nom('limiteur : la vitesse reste ≤ vitesse de croisière (8)', w.vitesse <= 8.05, w.vitesse.toFixed(2));
await page.keyboard.down('ShiftLeft'); await attendre(2500); w = (await etat()).vol;
nom('postcombustion (Maj) : vitesse bien supérieure à la croisière', w.vitesse > 12 && w.post === true, w.vitesse.toFixed(1));
await page.screenshot({ path: SORTIE + 'vol-postcombustion.png' });
await page.keyboard.up('ShiftLeft'); await page.keyboard.up('KeyW'); await attendre(3500); w = (await etat()).vol;
nom('assistance : relâcher les commandes arrête le vaisseau', w.vitesse < 0.3, w.vitesse.toFixed(2));
await page.keyboard.press('KeyG'); await attendre(300);
nom('touche G : l’assistance se coupe (vol newtonien)', (await etat()).vol.assist === false);
await page.keyboard.down('KeyW'); await attendre(1200); await page.keyboard.up('KeyW'); await attendre(2000); w = (await etat()).vol;
nom('vol newtonien : sans poussée la vitesse se conserve', w.vitesse > 3, w.vitesse.toFixed(2));
await page.keyboard.down('KeyX'); await attendre(1800); await page.keyboard.up('KeyX'); w = (await etat()).vol;
nom('frein (X) : arrêt', w.vitesse < 0.2, w.vitesse.toFixed(2));
await page.keyboard.press('KeyG'); await page.keyboard.press('KeyL'); await attendre(200);
nom('touche L : le limiteur se coupe', (await etat()).vol.limiteur === false); await page.keyboard.press('KeyL');
// rotation : flèche gauche = lacet à gauche
const cap0 = (await etat()).telemetrie.cap; await page.keyboard.down('ArrowLeft'); await attendre(900); await page.keyboard.up('ArrowLeft'); await attendre(300);
const cap1 = (await etat()).telemetrie.cap, dcap = ((cap1 - cap0 + 540) % 360) - 180;
nom('flèche gauche : le cap diminue (lacet à gauche)', dcap < -15, `Δcap ${dcap.toFixed(1)}°`);

// ── manette simulée : stick vers l'avant, bouton de vue
await G(() => { window.Saturne.placer({ vel: [0, 0, 0] }); });
await G(() => { window.__gp.axes = [0, -1, 0, 0]; }); await attendre(2200);
w = (await etat()).vol; e = await etat();
nom('manette simulée : détectée, le stick avant accélère le vaisseau', e.manette && /Faux contrôleur/.test(e.manette) && w.vitesse > 3, `v ${w.vitesse.toFixed(2)}`);
await G(() => { window.__gp.axes = [0, 0, 0, 0]; }); await attendre(2500);
const vueAvant = (await etat()).vue; await G(() => { window.__gp.buttons[9] = { pressed: true, value: 1 }; }); await attendre(250); await G(() => { window.__gp.buttons[9] = { pressed: false, value: 0 }; }); await attendre(300);
nom('bouton de manette : changer de vue (une seule fois par pression)', (await etat()).vue !== vueAvant);
await G(() => window.Saturne.vue('cockpit')); await attendre(1200);

// ── panneau de réglage de la manette
await G(() => { document.querySelector('#saturne-ui [data-a="reglages"]').click(); }); await attendre(900);
const pan = await G(() => ({ ouvert: !document.getElementById('s-panneau').hidden, axes: document.querySelectorAll('#s-panneau .s-axe').length, voyants: document.querySelectorAll('#s-panneau .s-btnvoyant').length, texte: document.getElementById('s-panneau').innerText.slice(0, 80) }));
nom('panneau manette : axes, boutons et nom de la manette affichés', pan.ouvert && pan.axes === 7 && pan.voyants === 17 && /Faux contrôleur/.test(pan.texte + ''), JSON.stringify(pan));
await page.screenshot({ path: SORTIE + 'panneau-manette.png' });
await G(() => { const s = document.querySelector('#s-panneau .s-axe[data-fn="lacet"] [data-p="axe"]'); s.value = '3'; s.dispatchEvent(new Event('change', { bubbles: true })); });
const stock = await G(() => JSON.parse(localStorage.getItem('rayle_saturne_commandes')));
nom('affecter l’axe 3 au lacet enregistre le profil de cette manette (sur l’appareil)', stock && Object.values(stock.profils).some(p => p.axes.lacet && p.axes.lacet.axe === 3), JSON.stringify(Object.keys((stock || {}).profils || {})));
await G(() => { document.querySelector('#saturne-ui [data-a="commandes"]').click(); }); await attendre(600);
nom('F1 / bouton Commandes : schéma des commandes avec touches et boutons', await G(() => /POSTCOMB|Postcombustion/i.test(document.getElementById('s-panneau').innerText) && document.querySelectorAll('#s-panneau table tr').length > 15));
await page.screenshot({ path: SORTIE + 'panneau-commandes.png' });
await G(() => { document.querySelector('#s-panneau [data-f="fermer"]').click(); });

// ── collision : jamais à l'intérieur d'un astre
await G(() => { const s = window.Saturne.corps().find(x => x.id === 'mars'); window.Saturne.placer({ orbite: null, pos: [s.pos[0] - s.rayon - 6, s.pos[1], s.pos[2]], vel: [20, 0, 0], q: [0, -0.7071, 0, 0.7071] }); });
await G(() => window.Saturne.forcerEntrees({ trans: [0, 0, 1], rot: [0, 0, 0], post: true }, 4000)); await attendre(2500);
const prox = await G(() => { const e = window.Saturne.etat(), m = window.Saturne.corps().find(x => x.id === 'mars'); const d = Math.hypot(e.vol.pos[0] - m.pos[0], e.vol.pos[1] - m.pos[1], e.vol.pos[2] - m.pos[2]); return { d, rayon: m.rayon }; });
nom('collision : le vaisseau ne traverse pas Mars', prox.d >= prox.rayon - 1e-6, `${prox.d.toFixed(2)} ≥ ${prox.rayon}`);
await G(() => window.Saturne.forcerEntrees(null));

// ── pilote automatique par l'ordre vocal (bus d'ordres) vers Jupiter
const rep = await G(() => window.RayleOrdres.envoyer({ de: 'rayle', vers: 'saturne', action: 'aller_a', params: { cible: 'jupiter' } }));
nom('ordre « aller_a jupiter » : pilote automatique engagé', rep && rep.ok && /Jupiter/.test(rep.texte), JSON.stringify(rep));
await attendreEtat(() => window.Saturne.etat().vol.orbite === 'jupiter', 90000);
e = await etat();
nom('pilote automatique : le vaisseau arrive en orbite de Jupiter', e.vol.orbite === 'jupiter' && e.auto === null, JSON.stringify({ o: e.vol.orbite }));
await page.screenshot({ path: SORTIE + 'orbite-jupiter.png' });
const rv = await G(() => window.RayleOrdres.envoyer({ de: 'rayle', vers: 'saturne', action: 'changer_vue', params: { vue: 'exterieur' } }));
nom('ordre « changer_vue exterieur »', rv.ok && (await etat()).vue === 'exterieur', JSON.stringify(rv));

// ── salle médicale
await G(() => window.Saturne.vue('cockpit')); await attendre(900);
const rs = await G(() => window.RayleOrdres.envoyer({ de: 'rayle', vers: 'saturne', action: 'ouvrir_salle_medicale', params: {} }));
await attendre(1500); e = await etat();
nom('ordre « ouvrir_salle_medicale » : la salle s’ouvre (table holographique)', rs.ok && e.mode === 'salle' && e.salle, JSON.stringify(rs));
await page.screenshot({ path: SORTIE + 'salle-medicale.png' });
await page.keyboard.press('Escape'); await attendre(1600); e = await etat();
nom('Échap dans la salle médicale : retour au cockpit (pas de sortie du vaisseau)', e.mode === 'vol' && e.actif);

// ── trois niveaux de qualité : détail du vaisseau, captures, images par seconde
const mesure = async ms => { await G(() => { window.__ft = []; const f = t => { window.__ft.push(t); requestAnimationFrame(f); }; requestAnimationFrame(f); }); await attendre(ms); return G(() => { const t = window.__ft, d = []; for (let i = 1; i < t.length; i++) d.push(t[i] - t[i - 1]); d.sort((a, b) => a - b); const moy = d.reduce((s, x) => s + x, 0) / d.length, p1 = d.slice(Math.floor(d.length * 0.99)); return { fps: +(1000 / moy).toFixed(1), pire1: +(1000 / (p1.reduce((s, x) => s + x, 0) / p1.length)).toFixed(1) }; }); };
const fps = {};
for (const q of ['haute', 'moyenne', 'basse']) {
  await G(q => window.Galaxie.qualite(q), q); await attendre(2500);
  for (const v of ['exterieur', 'cockpit']) { await G(v => window.Saturne.vue(v), v); await attendre(1800); await page.screenshot({ path: `${SORTIE}qualite-${q}-${v}.png` }); fps[q + '-' + v] = await mesure(2500); }
  e = await etat();
  nom('qualité ' + q + ' : niveau de détail du vaisseau = ' + { haute: 2, moyenne: 1, basse: 0 }[q], e.detail === { haute: 2, moyenne: 1, basse: 0 }[q], 'detail ' + e.detail);
}
console.log('images/s :', JSON.stringify(fps));
await G(() => window.Galaxie.qualite('haute')); await attendre(1500);

// ── sortie propre
await G(() => window.Saturne.sortir()); await attendre(2000);
nom('sortie : galaxie rendue, vaisseau provisoire de nouveau visible', await G(() => { const o = window.Galaxie.systeme.parId('saturne'); return !window.Saturne.etat().actif && !window.Galaxie.surchargee() && o.satellites[0].vaisseau.visible === true; }));
const ex = erreurs.filter(x => !/faireconomy|404|408|ERR_FAILED|CONNECTION_REFUSED|CORS|Failed to load resource|GPU stall/.test(x));
nom('aucune erreur de page', ex.length === 0, ex.slice(0, 3).join(' | '));
await navigateur.close();
process.exit(c.fin() ? 1 : 0);
