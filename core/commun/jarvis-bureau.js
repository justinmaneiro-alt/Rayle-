import { creerGestionnaire, chargerStyle } from './gestionnaire-fenetres.js';
import { creerCalcul } from './fenetres-calcul.js';
import { creerDossiers } from './dossiers.js';

/* ═════════════ LE BUREAU DE L'ACCUEIL JARVIS (V2, phase 3) ═════════════
   Même moteur que le terminal de Mars (gestionnaire commun + dossiers) appliqué aux VRAIES fenêtres de l'accueil Jarvis :
   · les sept fenêtres du tableau de bord (heure, météo, actualités, système, agent de trading, marché, événements de la Terre) : un bouton ⤢ la POSE dans une fenêtre
     déplaçable, redimensionnable, réductible ; fermée ou « rangée », elle retourne dans sa colonne (le même élément, donc les mêmes données vivantes) ;
   · « Sources en direct » (6 onglets : événements, communiqués, télévisions, réseaux, podcasts, aujourd'hui) : une fenêtre du bureau qui s'ouvre TOUJOURS au même endroit
     (à droite, sous l'en-tête) tant que Justin ne l'a pas déplacée, puis là où il l'a laissée (mémoire par appareil) ;
   · quatre PILES (Infos du jour, Marchés et agent, Terre et événements, Sources en direct) : un appui ouvre le carrousel de la pile, la fenêtre choisie se pose sur l'écran.
   Aucune donnée inventée : le contenu est celui des fenêtres d'avant. Ancien système : ⚙ « Utiliser l'ancien système de fenêtres » (rayle_fenetres_v1). */
const DOSSIERS = [
  { id: 'infos', titre: 'Infos du jour', icone: '🗞', ids: ['heure', 'meteo', 'actus', 'systeme'] },
  { id: 'marches', titre: 'Marchés et agent', icone: '📈', ids: ['marche', 'agent'] },
  { id: 'terre', titre: 'Terre et événements', icone: '🌍', ids: ['terre'] },
  { id: 'sources', titre: 'Sources en direct', icone: '📡', ids: ['sources'] }
];
const INFOS = {
  heure: { titre: 'Heure et date', icone: '🕒', apercu: 'Heure, date, secondes' },
  meteo: { titre: 'Météo', icone: '⛅', apercu: 'Prévision de la ville choisie (Open-Meteo)' },
  actus: { titre: 'Actualités', icone: '📰', apercu: 'Fil France par sujets' },
  systeme: { titre: 'Système', icone: '🖥', apercu: 'Worker, Veilleur, micro, affichage' },
  marche: { titre: 'Marché', icone: '💹', apercu: 'BTC, SOL, DOGE, or, US100 avec mini-courbes' },
  agent: { titre: 'Agent de trading', icone: '🛰', apercu: 'Régime, état, signaux, gardien prop' },
  terre: { titre: 'Événements de la Terre', icone: '🌋', apercu: 'Séismes, catastrophes (USGS, EONET, GDACS)' },
  sources: { titre: 'Sources en direct', icone: '📡', apercu: 'Événements, communiqués, télévisions, réseaux, podcasts, aujourd’hui' }
};
const fenetres = Object.fromEntries(Object.entries(INFOS).map(([id, i]) => [id, { ...i, etat: 'reel' }]));
const calc = creerCalcul({ marge: 10, haut: 64, bas: 170, miniL: 300, miniH: 200, tailles: { widget: [0.26, 0.46], sources: [0.5, 0.72], selecteur: [0.24, 0.5] }, plafond: { widget: [460, 520], sources: [980, 820], selecteur: [440, 560] } });
const CLE = 'jarvis-bureau';

let B = null;
export const actif = () => { try { return localStorage.getItem('rayle_fenetres_v1') !== '1' && document.body.classList.contains('jarvis') && !document.body.classList.contains('g1'); } catch (e) { return false; } };

function creer() {
  chargerStyle();
  const hote = document.createElement('div'); hote.className = 'jb-hote'; document.body.appendChild(hote);
  const instances = new Map();       // id → fonction de fermeture (hub)
  let D = null;
  const gf = creerGestionnaire({ ui: hote, prefixe: 'gf', calc, cle: CLE, idRacine: 'jarvis-bureau', libelleBarre: 'Bureau', barreVisible: false, vue: 'Accueil', surRanger: wid => { const id = wid.replace(/^w-/, ''); if (D) D.rentrer(id); } });
  const posee = id => !!gf.obtenir('w-' + id);
  const compteur = () => { const n = DOSSIERS.reduce((a, d) => a + d.ids.filter(posee).length, 0); document.body.dataset.bureau = n ? String(n) : ''; if (D) D.majMur(); };
  function ouvrirFenetre(id, o = {}) {
    const info = INFOS[id]; if (!info) return false; const wid = 'w-' + id;
    if (gf.obtenir(wid)) { gf.focus(wid); gf.reduire(wid, false); if (id === 'sources' && o.onglet && window.DirectPage) { import(new URL('core/direct/hub-sources.js', document.baseURI).href).then(H => { const i = H.instanceHub(); if (i) i.aller(o.onglet); }); } return true; }
    const e = { l: window.innerWidth, h: window.innerHeight };
    if (id === 'sources') {
      const t = calc.tailleParDefaut('sources', e), corps = document.createElement('div'); corps.className = 'jb-hub';
      const w = gf.ouvrir({ id: wid, titre: info.titre, sousTitre: 'Accueil', genre: 'sources', contenu: corps, taille: t, position: { x: Math.max(calc.MARGE, e.l - t.l - 14), y: calc.HAUT_RESERVE }, pastille: 'reel', rangeable: true, dossier: 'Sources en direct', sur: { fermer: () => { const f = instances.get(id); if (f) f(); instances.delete(id); compteur(); }, redim: () => {} } });
      w.corps.classList.add('gf-sans-marge');
      import(new URL('core/direct/hub-sources.js', document.baseURI).href).then(H => { instances.set(id, H.monterHub(corps, { onglet: o.onglet })); }).catch(err => { corps.innerHTML = '<p class="jb-ko">INDISPONIBLE : ' + String(err && err.message || err).replace(/[<>&]/g, '') + '</p>'; });
    } else if (window.TableauBord) {
      const el = window.TableauBord.detacher(id); if (!el) return false;
      el.classList.add('jb-widget');
      const pied = document.createElement('button'); pied.type = 'button'; pied.className = 'jb-vue'; pied.textContent = 'Vue complète'; pied.addEventListener('click', ev => { ev.stopPropagation(); window.TableauBord.vue(id); }); el.appendChild(pied);
      const w = gf.ouvrir({ id: wid, titre: info.titre, sousTitre: 'Accueil', genre: 'widget', contenu: el, taille: calc.tailleParDefaut('widget', e), pastille: 'reel', rangeable: true, dossier: (DOSSIERS.find(d => d.ids.includes(id)) || {}).titre || '', sur: { fermer: () => { el.classList.remove('jb-widget'); pied.remove(); window.TableauBord.rattacher(id); compteur(); } } });
      w.corps.classList.add('gf-sans-marge');
    } else return false;
    compteur(); return true;
  }
  const retirer = id => { const wid = 'w-' + id; if (gf.obtenir(wid)) gf.fermer(wid); compteur(); };
  D = creerDossiers({
    dossiers: DOSSIERS, fenetres, vue: 'Accueil',
    estPosee: posee, poser: id => ouvrirFenetre(id), ranger: id => retirer(id),
    rectFenetre: id => { const o = gf.obtenir('w-' + id); return o ? o.rect : null; },
    apresLot: () => { gf.reorganiser('arc'); }
  });
  gf.enregistrerTiroir({ vue: 'Accueil · bureau', entrees: () => DOSSIERS.flatMap(d => d.ids.map(id => ({ id: 'w-' + id, titre: INFOS[id].titre, dossier: d.titre, apercu: INFOS[id].apercu, icone: INFOS[id].icone, posee: posee(id), afficher: () => ouvrirFenetre(id) }))) });

  /* la fenêtre « Bureau » : les quatre piles + disposition */
  const sel = document.createElement('div'); sel.className = 'jb-sel';
  const mur = document.createElement('div'), act = document.createElement('div'); act.className = 'jb-actions';
  act.innerHTML = '<button type="button" class="jb-b" data-a="arc">Disposer en arc</button><button type="button" class="jb-b" data-a="grille">Grille</button><button type="button" class="jb-b" data-a="ranger">Tout ranger</button>';
  sel.append(mur, act); D.rendreMur(mur);
  act.addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (!b) return; if (b.dataset.a === 'ranger') toutRanger(); else gf.reorganiser(b.dataset.a === 'arc' ? 'arc' : 'grille'); });
  function toutRanger() { D.fermer(true); for (const d of DOSSIERS) for (const id of d.ids) retirer(id); }
  function ouvrirBureau() {
    const e = { l: window.innerWidth, h: window.innerHeight }, t = calc.tailleParDefaut('selecteur', e);
    const w = gf.ouvrir({ id: 'bureau', titre: 'Bureau', sousTitre: 'Appuie sur une pile pour l’ouvrir', genre: 'selecteur', contenu: sel, taille: t, position: { x: 14, y: calc.HAUT_RESERVE + 70 }, pastille: 'reel' });
    w.corps.classList.add('jb-corps-sel'); D.majMur(); return true;
  }
  B = {
    ouvrir: (id, o) => ouvrirFenetre(id, o || {}), ranger: retirer, toutRanger, ouvrirBureau, ouvrirDossier: id => D.ouvrir(id), gestionnaire: gf, dossiers: D,
    estOuvert: id => posee(id), disposer: m => gf.reorganiser(m || 'arc'), etat: () => ({ fenetres: gf.liste().map(f => f.id) }),
    fermer() { toutRanger(); gf.fermer && gf.fermer('bureau'); }
  };
  return B;
}
export const bureau = () => B || creer();
