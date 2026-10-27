import { CREDITS, CREDITS_COURT, CREDITS_REGIONAUX } from './sources.js';
import { parId } from './imagerie-regionale.js';
import { libelle } from './geocodage.js';

/* ═════════════ INTERFACE DE LA TERRE (DOM) ═════════════
   Habillage au-dessus de la scène : titre, recherche de lieu, mesures (altitude, coordonnées du centre, images/s, tuiles, mémoire vidéo),
   boutons, panneau de réglages, mentions de licence. Aucune logique de rendu ici. */
const nf = new Intl.NumberFormat('fr-FR');
export const formaterDistance = km => (km >= 100 ? nf.format(Math.round(km)) + ' km' : km >= 1 ? km.toFixed(1).replace('.', ',') + ' km' : Math.round(km * 1000) + ' m');
export const formaterCoord = (v, pos, neg) => Math.abs(v).toFixed(3).replace('.', ',') + '° ' + (v >= 0 ? pos : neg);

export function creerInterface({ racine, reglages, surReglage, actions }) {
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
  const ui = el('div'); ui.id = 'terre-ui'; ui.hidden = true;
  ui.innerHTML = `
    <div class="t-noms-zone"></div>
    <div class="t-titre"><b>T E R R E</b><span>Base de données du monde</span></div>
    <form class="t-recherche" autocomplete="off"><input type="search" placeholder="Aller à… (ville, pays, montagne)" aria-label="Aller à un lieu" maxlength="80"><button type="submit" title="Y aller">→</button><div class="t-resultats" hidden></div></form>
    <div class="t-boutons"><button type="button" data-a="meteo-ici" title="Météo du lieu au centre de la vue">Météo ici</button><button type="button" data-a="france" title="Actualités de France, sur la Terre">France</button><button type="button" data-a="monde" title="À la une dans le monde, sur la Terre">Monde</button><button type="button" data-a="pays" title="Choisir un pays, un continent ou mes favoris (actualités)">Pays ▾</button><button type="button" data-a="radar" data-etat="radar" title="Radar de pluie (RainViewer)">Radar</button><button type="button" data-a="evenements" title="Séismes, catastrophes, incendies et tempêtes en direct (USGS, GDACS, NASA)">Événements</button><button type="button" data-a="sources" title="Hub des sources en direct (communiqués, télévisions, podcasts…)">Sources</button><button type="button" data-a="orbite" title="Revenir en orbite (touche O)">Orbite</button><button type="button" data-a="reglages" title="Réglages de la Terre">⚙</button><button type="button" data-a="sortir" title="Retour à la galaxie (Échap)">Quitter ✕</button></div>
    <div class="t-bas"><div class="t-radar" hidden><button type="button" data-a="radar-lecture" title="Animer les dernières images du radar">▶</button><span class="t-radar-heure"></span><input type="range" min="0" max="12" step="1" value="12" data-radar aria-label="Image du radar"></div>
      <div class="t-actions" hidden></div>
      <div class="t-message" hidden></div></div>
    <div class="t-mesures" aria-live="off"></div>
    <div class="t-aide">Glisser : tourner la Terre · Molette : altitude · Clic droit + glisser : incliner et orienter · Double-clic : se rapprocher · O : orbite · Échap : sortir</div>
    <div class="t-credits"><span>${CREDITS_COURT}</span> <button type="button" data-a="credits" title="Sources, licences et obligations de crédit">Crédits et licences</button></div>
    <aside class="t-credits-panneau" hidden><div class="t-pt"><h2>Crédits et licences</h2><button type="button" data-a="fermer-credits">✕</button></div>${CREDITS.concat(['Photographies aériennes (selon le lieu, quand elles existent) :']).concat(CREDITS_REGIONAUX).concat(['Recherche de lieux : Open-Meteo Geocoding (GeoNames, CC BY 4.0)']).map(c => '<p>' + c.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</p>').join('')}</aside>
    <aside class="t-panneau" hidden>
      <div class="t-pt"><h2>Réglages · Terre</h2><button type="button" data-a="fermer-reglages">✕</button></div>
      <label>Exagération du relief <b data-v="exag"></b><input type="range" data-r="exag" min="1" max="10" step="0.5"></label>
      <label>Qualité <select data-r="profil"><option value="auto">Comme la galaxie</option><option value="haute">Haute (PC)</option><option value="moyenne">Moyenne</option><option value="basse">Basse</option></select></label>
      <label class="t-case"><input type="checkbox" data-r="eox"> Imagerie satellite haute résolution (Sentinel-2, usage non commercial)</label>
      <label class="t-case"><input type="checkbox" data-r="regional"> Photos aériennes locales (IGN, swisstopo… : données ouvertes)</label>
      <label class="t-case"><input type="checkbox" data-r="batiments"> Bâtiments en volume</label>
      <label class="t-case"><input type="checkbox" data-ia-reglage> Images dans les actualités (média, photo libre du lieu ou carte)</label>
      <label class="t-case"><input type="checkbox" data-r="ombres"> Ombres portées (bâtiments, relief)</label>
      <label class="t-case"><input type="checkbox" data-r="noms"> Noms de lieux</label>
      <label class="t-case"><input type="checkbox" data-r="nuages"> Nuages</label>
      <label class="t-case"><input type="checkbox" data-r="ocean"> Océans réfléchissants</label>
      <label class="t-case"><input type="checkbox" data-r="radar"> Radar de pluie (RainViewer, usage personnel)</label>
      <label class="t-case"><input type="checkbox" data-r="nuagesReels"> Image satellite du jour (vrais nuages, NASA VIIRS)</label>
      <label class="t-case"><input type="checkbox" data-r="meteoAnim"> Nuages et pluie animés d’après la météo du lieu</label>
      <label class="t-case"><input type="checkbox" data-r="fps"> Détails techniques (tuiles, mémoire vidéo)</label>
      <div class="t-petit">Les réglages restent sur cet appareil.</div>
    </aside>`;
  const fondu = el('div'); fondu.id = 'terre-fondu';
  racine.appendChild(ui); racine.appendChild(fondu);
  const q = s => ui.querySelector(s);
  const zoneActions = q('.t-actions'), zoneRadar = q('.t-radar'), curseurRadar = q('[data-radar]'), heureRadar = q('.t-radar-heure');
  const zoneNoms = q('.t-noms-zone'), mesures = q('.t-mesures'), message = q('.t-message'), panneau = q('.t-panneau'), credits = q('.t-credits-panneau'), res = q('.t-resultats'), champ = q('.t-recherche input');

  function appliquerReglages(r) {
    for (const i of ui.querySelectorAll('[data-r]')) { if (i.type === 'checkbox') i.checked = !!r[i.dataset.r]; else i.value = r[i.dataset.r]; }
    const cIA = ui.querySelector('[data-ia-reglage]'); if (cIA && window.ImagesActus) cIA.checked = ImagesActus.reglage.lire();
    q('[data-v="exag"]').textContent = '×' + String(r.exag).replace('.', ',');
  }
  ui.addEventListener('change', e => { if (e.target.hasAttribute && e.target.hasAttribute('data-ia-reglage') && window.ImagesActus) ImagesActus.reglage.ecrire(e.target.checked); });
  ui.addEventListener('input', e => { const k = e.target.dataset && e.target.dataset.r; if (!k) return; surReglage({ [k]: e.target.type === 'checkbox' ? e.target.checked : (e.target.type === 'range' ? Number(e.target.value) : e.target.value) }); });
  curseurRadar.addEventListener('input', () => actions['radar-rang'] && actions['radar-rang'](Number(curseurRadar.value)));
  ui.addEventListener('click', e => {
    const a = e.target.closest('[data-a]'); if (!a) return;
    if (a.dataset.a === 'reglages') { panneau.hidden = !panneau.hidden; if (!panneau.hidden) { credits.hidden = true; ui.classList.remove('t-credits-ouverts'); } ui.classList.toggle('t-panneau-ouvert', !panneau.hidden); }
    else if (a.dataset.a === 'fermer-reglages') { panneau.hidden = true; ui.classList.remove('t-panneau-ouvert'); }
    else if (a.dataset.a === 'credits') { credits.hidden = !credits.hidden; if (!credits.hidden) { panneau.hidden = true; ui.classList.remove('t-panneau-ouvert'); } ui.classList.toggle('t-credits-ouverts', !credits.hidden); }
    else if (a.dataset.a === 'fermer-credits') { credits.hidden = true; ui.classList.remove('t-credits-ouverts'); }
    else actions[a.dataset.a] && actions[a.dataset.a]();
  });
  q('.t-recherche').addEventListener('submit', async e => {
    e.preventDefault(); res.hidden = true;
    const texte = champ.value.trim(); if (texte.length < 2) return;
    try {
      const l = await actions.chercher(texte);
      if (!l.length) { dire('Aucun lieu trouvé pour « ' + texte + ' ».'); return; }
      actions.aller(l[0]); proposer(l[0]);
      if (l.length > 1) {
        res.replaceChildren(...l.slice(1).map(r => { const b = el('button'); b.type = 'button'; b.textContent = libelle(r); b.addEventListener('click', () => { res.hidden = true; actions.aller(r); }); return b; }));
        res.hidden = false;
      }
    } catch (x) { dire('Recherche indisponible : ' + (x && x.message || x)); }
  });
  /* Après une recherche : la météo du lieu et les actualités de son pays, à un clic. */
  function proposer(r) {
    zoneActions.replaceChildren();
    const bouton = (texte, f) => { const b = el('button'); b.type = 'button'; b.textContent = texte; b.addEventListener('click', f); zoneActions.appendChild(b); };
    bouton('Météo · ' + r.nom, () => actions['meteo-lieu'] && actions['meteo-lieu'](r));
    if (r.codePays) bouton('Actualités · ' + (r.pays || r.codePays), () => actions['actus-pays'] && actions['actus-pays'](r.codePays, r.pays));
    zoneActions.hidden = false; clearTimeout(tActions); tActions = setTimeout(() => { zoneActions.hidden = true; }, 20000);
  }
  let tActions = 0, derniereSource = '';
  const ligneCredits = q('.t-credits span');
  let tMessage = 0;
  function dire(texte, ms = 5000) { message.textContent = texte; message.hidden = !texte; clearTimeout(tMessage); if (texte && ms) tMessage = setTimeout(() => { message.hidden = true; }, ms); }

  return {
    racine: ui, zoneNoms, fondu, champ, dire, appliquerReglages,
    montrer(oui) { ui.hidden = !oui; if (!oui) { panneau.hidden = true; credits.hidden = true; ui.classList.remove('t-credits-ouverts'); res.hidden = true; } },
    /* sources régionales actuellement à l'écran : leur crédit s'ajoute à la ligne du bas */
    sources(ids) { const t = ids.map(i => { const s = parId(i); return s ? s.credit : null; }).filter(Boolean).join(' · '); if (t !== derniereSource) { derniereSource = t; ligneCredits.textContent = CREDITS_COURT + (t ? ' · ' + t : ''); } },
    panneauOuvert: () => !panneau.hidden, fermerPanneau() { panneau.hidden = true; },
    /* Radar : état des boutons et du curseur (rang = image affichée, n = nombre d'images, heure = texte de l'image) */
    radar({ actif, rang, n, heure, lecture, indisponible }) {
      zoneRadar.hidden = !actif; ui.querySelector('[data-etat="radar"]').classList.toggle('actif', !!actif);
      if (n) { curseurRadar.max = String(n - 1); curseurRadar.value = String(rang); }
      heureRadar.textContent = indisponible ? 'radar indisponible' : (heure ? 'écho de ' + heure + (rang === n - 1 ? ' (dernière image)' : '') : '');
      q('[data-a="radar-lecture"]').textContent = lecture ? '❚❚' : '▶';
    },
    /* m : { altitude, lat, lon, sol, fps, tuiles:{...}, vram, details } */
    mesures(m) {
      mesures.innerHTML =
        `<div><span>ALTITUDE</span><b>${formaterDistance(m.altitude)}</b></div>` +
        `<div><span>CENTRE</span><b>${formaterCoord(m.lat, 'N', 'S')} · ${formaterCoord(m.lon, 'E', 'O')}</b></div>` +
        (m.sol !== null && m.sol !== undefined ? `<div><span>SOL</span><b>${nf.format(Math.round(m.sol * 1000))} m</b></div>` : '') +
        (m.soleil ? `<div class="t-lg"><span>SOLEIL</span><b>${m.soleil}</b></div>` : '') +
        (m.fps ? `<div class="t-lg"><span>IMAGES/S</span><b>${m.fps}</b></div>` : '') +
        (m.details ? `<div class="t-d"><span>TUILES</span><b>${m.tuiles.affichees} affichées · ${m.tuiles.tuiles} en mémoire · ${m.tuiles.enAttente} en attente</b></div><div class="t-d"><span>MÉMOIRE VIDÉO</span><b>≈ ${Math.round(m.vram / 1048576)} Mo (tuiles)</b></div>` : '');
    }
  };
}
