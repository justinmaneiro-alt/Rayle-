import { modeleActus, phraseActus } from './actus-contenu.js';
import * as M from './meteo-contenu.js';
import { libelleMaj, libelleImportance } from './actus-sujets.js';

/* ═════════════ FENÊTRES HOLOGRAPHIQUES DE LA TERRE (actualités, météo) ═════════════
   Même cadre que les fenêtres de l'accueil : Panneaux.ouvrir (core/commun/panneaux.js). Les données viennent du Worker (/actualites, /meteo) par wjson ;
   Worker verrouillé, pas à jour ou source en panne : la fenêtre dit « indisponible » et pourquoi, jamais de valeur inventée.
   Aucun texte d'article n'est affiché : titre, média, date, lien. */
const ICONES = {   // pictogrammes simples (SVG constants, aucun contenu externe)
  soleil: '<circle cx="24" cy="24" r="9" fill="none" stroke="currentColor" stroke-width="2.4"/><g stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M24 5v6M24 37v6M5 24h6M37 24h6M10.6 10.6l4.2 4.2M33.2 33.2l4.2 4.2M10.6 37.4l4.2-4.2M33.2 14.8l4.2-4.2"/></g>',
  nuage: '<path d="M14 35a8 8 0 0 1-.9-15.9A10 10 0 0 1 32.4 17 8.5 8.5 0 0 1 34 35z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/>',
  'soleil-nuage': '<circle cx="17" cy="16" r="6" fill="none" stroke="currentColor" stroke-width="2.2"/><g stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M17 4v3M5 16h3M7.5 6.5l2.1 2.1M26.5 6.5l-2.1 2.1"/></g><path d="M16 39a7 7 0 0 1-.8-13.9A9 9 0 0 1 32.6 24 7.5 7.5 0 0 1 34 39z" fill="rgba(4,10,20,.85)" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/>',
  pluie: '<path d="M14 28a8 8 0 0 1-.9-15.9A10 10 0 0 1 32.4 10 8.5 8.5 0 0 1 34 28z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><g stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M16 34l-2 6M24 34l-2 6M32 34l-2 6"/></g>',
  neige: '<path d="M14 28a8 8 0 0 1-.9-15.9A10 10 0 0 1 32.4 10 8.5 8.5 0 0 1 34 28z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><g fill="currentColor"><circle cx="16" cy="36" r="2"/><circle cx="24" cy="39" r="2"/><circle cx="32" cy="36" r="2"/></g>',
  orage: '<path d="M14 26a8 8 0 0 1-.9-15.9A10 10 0 0 1 32.4 8 8.5 8.5 0 0 1 34 26z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><path d="M25 27l-6 9h5l-3 8 9-11h-5z" fill="currentColor"/>',
  brouillard: '<g stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M8 17h32M12 25h28M8 33h30M14 41h22"/></g>',
  inconnu: '<circle cx="24" cy="24" r="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-dasharray="4 4"/><path d="M20 20a4 4 0 1 1 6 3.4c-1.4.9-2 1.6-2 3.1M24 32v.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>'
};
export const svgIcone = (nom, taille = 44) => '<svg class="t-ic" viewBox="0 0 48 48" width="' + taille + '" height="' + taille + '" aria-hidden="true">' + (ICONES[nom] || ICONES.inconnu) + '</svg>';

export function creerFenetres() {
  const P = () => window.Panneaux;
  const esc = t => (P() ? P().esc(t) : String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const workerOk = () => { try { return (typeof workerReady === 'function' && !!workerReady()); } catch (e) { return false; } };
  const messageErreur = e => { try { return window.errMsg(e); } catch (x) { return String((e && e.message) || e); } };
  async function appeler(chemin, ms) {
    if (!P()) throw new Error('fenêtres indisponibles');
    if (!workerOk()) throw new Error('Worker verrouillé ou non configuré : déverrouillez Raylé pour voir cette information');
    return window.wjson(chemin, ms);
  }
  const indisponible = (id, titre, icone, raison, pied) => P().ouvrir({ id, type: id.split('-').slice(0, 2).join('-'), titre, icone, corps: { html: '<div class="t-indispo"><b>Indisponible</b><span>' + esc(raison) + '</span></div>' }, pied, duree: 60000 });
  const ouvrirChargement = (id, type, titre, icone, texte) => P().ouvrir({ id, type, titre, icone, corps: { html: '<div class="t-charge"><i></i><span>' + esc(texte) + '</span></div>' }, duree: 120000 });
  const sourcesHtml = m => '<div class="pn-sous t-sources">Sources : ' + (m.sources.length ? esc(m.sources.join(', ')) : 'aucune') + '.'
    + (m.indisponibles.length ? ' <span class="t-panne">Indisponibles : ' + esc(m.indisponibles.join(', ')) + '.</span>' : '') + (m.note ? ' ' + esc(m.note) : '') + ' Titres et liens seulement.</div>';

  return {
    /* Actualités d'un pays (code ISO) ; nom : nom français (pour GDELT si le pays n'est pas dans le registre du Worker). */
    async actualites(code, nom, lieuPays = null) {
      const id = 'terre-actus', titre = 'Actualités · ' + (nom || code);
      ouvrirChargement(id, 'holo-actus', titre, '◈', 'Lecture des journaux…');
      try {
        const res = await appeler('/actualites?pays=' + encodeURIComponent(code) + '&n=12' + (nom ? '&nom=' + encodeURIComponent(nom) : ''), 20000);
        const m = modeleActus(res);
        if (!m.lignes.length) { indisponible(id, m.titre, '◈', 'Aucun titre trouvé pour ' + (nom || code) + ' pour le moment.', null); return { ok: false, modele: m }; }
        const avecImages = !!(window.ImagesActus && ImagesActus.actif());
        P().ouvrir({
          id, type: 'holo-actus', titre: m.titre, icone: '◈', duree: 300000,
          corps: { html: '<ol class="t-actus">' + m.lignes.map((l, i) => '<li' + (avecImages ? ' class="t-avec-img"' : '') + '><a href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer"' + (l.langue ? ' lang="' + esc(l.langue) + '"' + (/^(?:ar|he|fa|ur)$/.test(l.langue) ? ' dir="rtl"' : '') : '') + '>' + esc(l.titre) + '</a><span class="t-src">' + (l.langue ? '<i class="t-lang" title="Titre dans sa langue d’origine (pas de traduction)">' + esc(String(l.langue).toUpperCase()) + '</i> ' : '') + '<b>' + esc(l.source) + '</b>' + (l.quand ? ' · ' + esc(l.quand) : '') + '</span>' + (avecImages ? '<span class="t-f-img ia-zone" data-ia="' + i + '"></span>' : '') + '</li>').join('') + '</ol>' + sourcesHtml(m) }
        });
        if (avecImages) document.querySelectorAll('#panneaux .pn[data-id="' + id + '"] .t-f-img[data-ia]').forEach(z => { const l = m.lignes[+z.dataset.ia]; if (l) ImagesActus.attacher(z, { image: l.image, source: l.source, url: l.url }, { lieu: lieuPays, largeur: 74, hauteur: 50 }); });
        return { ok: true, modele: m, phrase: phraseActus(m) };
      } catch (e) {
        const raison = messageErreur(e);
        indisponible(id, titre, '◈', raison, null);
        return { ok: false, erreur: raison };
      }
    },
    /* Météo d'un lieu (degrés) ; nom : nom affiché (ou null → coordonnées). */
    async meteo(lat, lon, nom) {
      const id = 'terre-meteo', lieu = nom || (Math.abs(lat).toFixed(2).replace('.', ',') + '° ' + (lat >= 0 ? 'N' : 'S') + ' · ' + Math.abs(lon).toFixed(2).replace('.', ',') + '° ' + (lon >= 0 ? 'E' : 'O')), titre = 'Météo · ' + lieu;
      ouvrirChargement(id, 'holo-meteo', titre, '☁', 'Interrogation du modèle météo…');
      try {
        const m = await appeler('/meteo?lat=' + lat.toFixed(3) + '&lon=' + lon.toFixed(3), 15000);
        if (!m || !m.actuel) throw new Error('réponse météo incomplète');
        const a = m.actuel, trace = M.tracerHeures(m.heures), mm = M.pluie24h(m.heures);
        const detail = (nomD, val) => '<div><span>' + nomD + '</span><b>' + val + '</b></div>';
        const jours = (m.jours || []).slice(0, 6).map((j, i) => '<li>' + svgIcone(M.icone(j.code), 22) + '<span class="t-j">' + esc(M.jourSemaine(j.date, i)) + '</span><span class="t-jt">' + M.nombre(j.tmin, 0, '°') + ' / <b>' + M.nombre(j.tmax, 0, '°') + '</b></span><span class="t-jp">' + (j.pluie !== null ? M.nombre(j.pluie, 1, ' mm') : 'indisponible') + '</span></li>').join('');
        const svg = trace ? '<svg class="t-courbe" viewBox="0 0 ' + trace.largeur + ' ' + trace.hauteur + '" preserveAspectRatio="none" role="img" aria-label="Température et pluie des 24 prochaines heures">'
          + trace.barres.map(b => '<rect x="' + b.x.toFixed(1) + '" y="' + (b.y - b.h).toFixed(1) + '" width="' + b.l.toFixed(1) + '" height="' + Math.max(b.h, b.mm > 0 ? 1 : 0).toFixed(1) + '" class="t-barre"/>').join('')
          + '<path d="' + trace.chemin + '" class="t-trait"/>' + trace.labels.map(l => '<text x="' + l.x.toFixed(1) + '" y="9" class="t-lab" text-anchor="middle">' + esc(l.t) + '</text>').join('') + '</svg>' : '<div class="t-indispo"><span>Courbe des heures indisponible.</span></div>';
        P().ouvrir({
          id, type: 'holo-meteo', titre, icone: '☁', duree: 300000,
          corps: { html:
            '<div class="t-m-haut">' + svgIcone(M.icone(a.code), 56) + '<div><b class="t-temp">' + M.nombre(a.temp, 0, '°') + '</b><span class="t-desc">' + esc(M.decrire(a.code) || 'état du ciel indisponible') + '</span><span class="t-ress">Ressenti ' + M.nombre(a.ressenti, 0, '°') + '</span></div></div>'
            + '<div class="t-details">' + detail('Vent', a.vent !== null ? M.nombre(a.vent, 0, ' km/h') + (M.directionCourte(a.direction) ? ' · ' + M.directionCourte(a.direction) : '') : 'indisponible') + detail('Rafales', M.nombre(a.rafales, 0, ' km/h')) + detail('Humidité', M.nombre(a.humidite, 0, ' %')) + detail('Nuages', M.nombre(a.nuages, 0, ' %')) + detail('Pression', M.nombre(a.pression, 0, ' hPa')) + detail('Pluie (24 h)', mm === null ? 'indisponible' : M.nombre(mm, 1, ' mm')) + '</div>'
            + '<div class="pn-sous">Prochaines 24 h · température et pluie</div>' + svg
            + '<ul class="t-jours">' + jours + '</ul>'
            + '<div class="pn-sous t-sources">Source : <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo.com</a> (' + esc(m.licence || 'CC BY 4.0') + ') · modèle : ' + esc(m.modele || 'inconnu') + '. Altitude du lieu : ' + (m.lieu && m.lieu.altitude !== null ? Math.round(m.lieu.altitude) + ' m' : 'indisponible') + '.</div>' }
        });
        return { ok: true, meteo: m, phrase: M.phraseMeteo(m, nom), lieu };
      } catch (e) {
        const raison = messageErreur(e);
        indisponible(id, titre, '☁', raison, null);
        return { ok: false, erreur: raison };
      }
    },
    /* Panneau « France » ou « Monde » : tous les sujets du fil, du plus important au moins important (m : modelesFil). Un clic sur « Voir » éclaire la balise (événement terre:voir-sujet). */
    panneauFil(portee, m, titre) {
      const id = 'terre-fil-' + portee, nom = titre || (portee === 'france' ? 'France' : portee === 'monde' ? 'Monde' : 'Pays');
      const avecImages = !!(window.ImagesActus && ImagesActus.actif());
      const lignes = m.sujets.slice(0, 18).map((s, i) => '<li style="--c:' + s.couleur + '"><span class="t-f-cat" title="' + esc(s.catNom) + '"></span><div><a href="' + esc(s.url) + '" target="_blank" rel="noopener noreferrer">' + esc(s.titre) + '</a>'
        + '<span class="t-src"><b>' + esc(s.source) + '</b>' + (s.quand ? ' · ' + esc(s.quand) : '') + ' · ' + esc(libelleImportance(s.importance)) + (s.lieu ? ' · ' + esc(s.lieu.texte) : ' · lieu non déterminé') + '</span></div>' + (avecImages ? '<span class="t-f-img ia-zone" data-ia="' + i + '"></span>' : '')
        + (s.lieu ? '<button type="button" class="t-voir" data-voir="' + esc(s.id) + '" title="Voir ce sujet sur la Terre">Voir</button>' : '') + '</li>').join('');
      P().ouvrir({
        id, type: 'holo-fil', titre: 'Actualités · ' + nom, icone: '◈', duree: 900000,
        corps: { html: '<ol class="t-fil">' + lignes + '</ol><div class="pn-sous t-sources">' + esc(libelleMaj(m.genere)) + (m.perime ? ' · <span class="t-panne">copie ancienne : les sources ne répondent pas pour le moment</span>' : '')
          + '. ' + m.sources.length + ' média' + (m.sources.length > 1 ? 's' : '') + ' lu' + (m.sources.length > 1 ? 's' : '') + '.'
          + (m.indisponibles.length ? ' <span class="t-panne">Indisponibles : ' + esc(m.indisponibles.join(', ')) + '.</span>' : '') + ' Titres et liens seulement ; catégories et lieux sont estimés.</div>' }
      });
      if (avecImages) document.querySelectorAll('#panneaux .pn[data-id="' + id + '"] .t-f-img[data-ia]').forEach(z => { const s = m.sujets[+z.dataset.ia]; if (s) ImagesActus.attacher(z, s, { lieu: s.lieu, largeur: 74, hauteur: 50 }); });
    },
    panneauFilIndisponible(portee, raison) { indisponible('terre-fil-' + portee, 'Actualités · ' + (portee === 'france' ? 'France' : portee === 'monde' ? 'Monde' : 'Pays'), '◈', raison, null); },
    fermer(id) { try { P().fermer(id); } catch (e) {} },
    element: id => document.querySelector('#panneaux .pn[data-id="' + id + '"]'),
    ouvertes: () => ['terre-actus', 'terre-meteo', 'terre-fil-france', 'terre-fil-monde', 'terre-fil-pays'].filter(id => !!document.querySelector('#panneaux .pn[data-id="' + id + '"]'))
  };
}
