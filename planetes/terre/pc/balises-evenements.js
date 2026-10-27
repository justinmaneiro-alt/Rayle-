import { projeter } from './projection.js';
import { COULEURS, NIVEAUX, TYPES, ageTexte, filtrerEvenements, nouveautes, rayonBalise, resumeEvenements } from '../../../core/direct/evenements-calcul.js';

/* ═════════════ ÉVÉNEMENTS NATURELS EN DIRECT SUR LA TERRE (étape N) ═════════════
   Séismes (USGS), catastrophes (GDACS) et incendies / tempêtes / volcans / inondations (NASA EONET) en balises vivantes : taille selon la sévérité (échelle indicative expliquée dans la fenêtre de détail),
   pulsation quand un événement NOUVEAU arrive, clic = fenêtre de détail avec source, heure et lien, filtres par type et par gravité. Calque 2D devant la scène (comme les repères de pays) ; aucune donnée inventée :
   sans réponse des sources, la barre dit « indisponible » et pourquoi. Mode jeu : calque coupé. Les sources sont appelées par core/direct/donnees-direct.js (USGS et EONET directement ; GDACS par le Worker). */
const ALT_MIN = 150, ALT_MAX = 25000, RAYON_CLIC = 14, DUREE_NOUVEAU = 40;
const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hhmm = t => new Date(t).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).replace(',', '');
const utc = t => new Date(t).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';

export function creerBalisesEvenements(conteneur, { surChoix = () => {}, charger = null, parler = () => {} } = {}) {
  const canvas = document.createElement('canvas'); canvas.className = 't-evenements'; conteneur.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  let tous = [], visibles = [], L = 0, H = 0, dpr = 1, t = 0, actif = false, survolId = null, choisiId = null, etat = null, timer = null, premier = true, enCours = false;
  const vus = new Set(), nouveauxTemps = new Map();
  const filtres = { types: new Set(['seisme', 'incendie', 'tempete', 'volcan', 'inondation']), severiteMin: 1 };
  let barre = null;

  function taille(l, h, d) { if (l === L && h === H && d === dpr) return; L = l; H = h; dpr = d; canvas.width = Math.round(l * d); canvas.height = Math.round(h * d); canvas.style.width = l + 'px'; canvas.style.height = h + 'px'; }
  const filtrees = () => filtrerEvenements(tous, { types: [...filtres.types], severiteMin: filtres.severiteMin });

  /* ── Barre de contrôle (activation, types, gravité, état des sources) ── */
  function monterBarre(parent) {
    if (barre) return barre.racine;
    const racine = document.createElement('div'); racine.className = 't-evt'; racine.hidden = true;
    racine.innerHTML = '<div class="t-evt-tete"><b>ÉVÉNEMENTS EN DIRECT</b><span class="t-evt-etat">…</span><button type="button" data-evt="fermer" title="Masquer les événements">✕</button></div>'
      + '<div class="t-evt-chips">' + Object.keys(TYPES).filter(k => k !== 'autre' && k !== 'secheresse').map(k => '<button type="button" class="t-evt-chip actif" data-type="' + k + '" style="--c:' + COULEURS[k] + '">' + esc(TYPES[k]) + '</button>').join('')
      + '<button type="button" class="t-evt-chip" data-evt="majeurs" title="Seulement les événements de gravité forte ou majeure">Majeurs seulement</button></div><div class="t-evt-sources"></div>';
    racine.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.type) { if (filtres.types.has(b.dataset.type)) filtres.types.delete(b.dataset.type); else filtres.types.add(b.dataset.type); b.classList.toggle('actif', filtres.types.has(b.dataset.type)); majEtat(); }
      else if (b.dataset.evt === 'majeurs') { filtres.severiteMin = filtres.severiteMin >= 3 ? 1 : 3; b.classList.toggle('actif', filtres.severiteMin >= 3); majEtat(); }
      else if (b.dataset.evt === 'fermer') api.arreter();
    });
    parent.appendChild(racine); barre = { racine }; return racine;
  }
  function majEtat() {
    if (!barre) return; const r = barre.racine, e = r.querySelector('.t-evt-etat'), s = r.querySelector('.t-evt-sources');
    if (!etat) { e.textContent = 'chargement…'; s.textContent = ''; return; }
    if (etat.etat !== 'ok') { e.innerHTML = '<span class="ko">INDISPONIBLE</span>'; s.textContent = 'Aucune source ne répond : ' + String(etat.raison || ''); return; }
    const f = filtrees(), res = resumeEvenements(f);
    e.innerHTML = '<span class="' + (etat.etiquette === 'RÉEL' ? 'ok' : 'att') + '">' + esc(etat.etiquette) + '</span> · ' + f.length + ' affichés sur ' + tous.length + (res.majeurs ? ' · <b>' + res.majeurs + ' majeur' + (res.majeurs > 1 ? 's' : '') + '</b>' : '');
    s.innerHTML = (etat.sources || []).map(x => '<span class="' + (x.etat === 'ok' ? 'ok' : 'ko') + '" title="' + esc(x.raison || '') + '">' + esc(x.nom) + (x.etat === 'ok' ? ' (' + x.n + ')' : ' · ' + esc(x.raison || 'indisponible')) + '</span>').join(' · ') + ' · reçu ' + esc(hhmm(etat.recuLe));
  }

  /* ── Chargement et sondage (toutes les 2 minutes tant que le calque est actif) ── */
  let promesse = null;
  function actualiser() { if (!actif || !charger) return Promise.resolve(); if (!promesse) promesse = chargerEtMaj().finally(() => { promesse = null; }); return promesse; }   // un chargement déjà en cours est attendu, jamais doublé
  async function chargerEtMaj() {
    enCours = true;
    try {
      etat = await charger(); if (etat.etat === 'ok') {
        tous = etat.evenements; const nv = nouveautes(tous, vus, premier); premier = false;
        const maintenant = performance.now() / 1000; for (const e of nv) nouveauxTemps.set(e.id, maintenant);
        const majeurs = nv.filter(e => e.severite >= 3 && filtres.types.has(e.type)); if (majeurs.length) parler(majeurs);
      }
    } catch (e) { etat = { etat: 'indisponible', raison: String(e && e.message || e) }; }
    enCours = false; majEtat();
  }

  /* ── Détail d'un événement (fenêtre holographique) ── */
  function detail(e) {
    if (!window.Panneaux) return false; choisiId = e.id;
    const niv = NIVEAUX[e.severite], sources = e.sources ? e.sources.join(' + ') : e.source;
    const ligne = (k, v) => v == null || v === '' ? '' : '<div><span>' + k + '</span><b>' + v + '</b></div>';
    const html = '<div class="t-evt-det" style="--c:' + COULEURS[e.type] + '"><h4>' + esc(e.titre) + '</h4><div class="t-details">'
      + ligne('Type', esc(TYPES[e.type] || e.type)) + ligne('Gravité (échelle indicative)', '<b>' + esc(niv) + '</b> · ' + e.severite + ' / 4') + ligne('Niveau d’alerte officiel', e.niveau ? esc(e.niveau) : null)
      + ligne('Magnitude', e.mag != null ? esc(e.mag) : null) + ligne('Profondeur', e.profondeurKm != null ? e.profondeurKm + ' km' : null)
      + ligne('Date', esc(hhmm(e.t)) + ' · ' + esc(utc(e.t)) + ' · ' + esc(ageTexte(e.t))) + ligne('Position', Math.abs(e.lat).toFixed(2) + '° ' + (e.lat >= 0 ? 'N' : 'S') + ' · ' + Math.abs(e.lon).toFixed(2) + '° ' + (e.lon >= 0 ? 'E' : 'O'))
      + ligne('Lieu', e.lieu ? esc(e.lieu) : null) + ligne('Source', esc(sources)) + '</div>'
      + (e.details && e.details.description ? '<p class="t-evt-desc">' + esc(e.details.description) + '</p>' : '')
      + '<div class="pn-sous">Pourquoi cette gravité : ' + esc((e.raisons || []).join(' ; ') || 'aucune information') + '. Échelle calculée par Rayle à partir des données de la source (magnitude, niveau d’alerte, surface, vent), pas une mesure officielle.</div>'
      + '<div class="pn-sous t-sources">' + (e.url ? '<a href="' + esc(e.url) + '" target="_blank" rel="noopener noreferrer">Fiche officielle (' + esc(e.source) + ')</a>' : 'Pas de fiche en ligne') + (e.urlGdacs ? ' · <a href="' + esc(e.urlGdacs) + '" target="_blank" rel="noopener noreferrer">Fiche GDACS</a>' : '') + '. Données gratuites et publiques ; la première estimation peut être révisée.</div></div>';
    window.Panneaux.ouvrir({ id: 'terre-evenement', type: 'holo-evenement', titre: (e.type === 'seisme' ? 'Séisme' : TYPES[e.type] || 'Événement') + ' · ' + hhmm(e.t), icone: e.type === 'seisme' ? '〰' : e.type === 'incendie' ? '🔥' : e.type === 'tempete' ? '🌀' : e.type === 'volcan' ? '🌋' : '⚠', duree: 600000, corps: { html } });
    surChoix(e); return true;
  }

  const api = {
    canvas, monterBarre,
    definir(evts) { tous = evts || []; majEtat(); },
    actif: () => actif,
    demarrer({ types = null, severiteMin = null } = {}) {
      if (types) { filtres.types = new Set(types); if (barre) for (const b of barre.racine.querySelectorAll('[data-type]')) b.classList.toggle('actif', filtres.types.has(b.dataset.type)); }
      if (severiteMin != null) { filtres.severiteMin = severiteMin; if (barre) barre.racine.querySelector('[data-evt="majeurs"]').classList.toggle('actif', severiteMin >= 3); }
      actif = true; if (barre) barre.racine.hidden = false; majEtat(); actualiser(); if (!timer) timer = setInterval(actualiser, 120000);
    },
    arreter() { actif = false; if (timer) { clearInterval(timer); timer = null; } if (barre) barre.racine.hidden = true; visibles = []; },
    actualiser,
    filtrer: f => { if (f.types) filtres.types = new Set(f.types); if (f.severiteMin != null) filtres.severiteMin = f.severiteMin; majEtat(); },
    maj(dt, { pose, fov, largeur, hauteur, jeu = false }) {
      taille(largeur, hauteur, Math.min(window.devicePixelRatio || 1, 2)); t += dt;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, L, H); visibles = [];
      if (!actif || jeu || pose.altitude < ALT_MIN || pose.altitude > ALT_MAX) return;
      const maintenant = performance.now() / 1000, zoom = Math.max(0.7, Math.min(1.5, 1.6 - Math.log10(Math.max(pose.altitude, 100)) * 0.28));
      const liste = filtrees().sort((a, b) => a.severite - b.severite);                 // les plus graves sont dessinées en dernier (au-dessus)
      for (const e of liste) {
        const q = projeter(pose, fov, largeur, hauteur, e.lon, e.lat, 0); if (!q || q.x < -20 || q.x > largeur + 20 || q.y < -20 || q.y > hauteur + 20) continue;
        const r = rayonBalise(e.severite, 4.5) * zoom, c = COULEURS[e.type] || '#fff', nv = nouveauxTemps.get(e.id), age = nv != null ? maintenant - nv : 1e9, choisi = e.id === choisiId, chaud = e.id === survolId;
        visibles.push({ e, x: q.x, y: q.y, r });
        ctx.globalAlpha = Math.min(1, 0.55 + e.severite * 0.12); ctx.fillStyle = c; ctx.beginPath(); ctx.arc(q.x, q.y, r * 0.55, 0, 6.2832); ctx.fill();
        ctx.globalAlpha = 0.9; ctx.strokeStyle = c; ctx.lineWidth = chaud || choisi ? 2.6 : e.severite >= 3 ? 2 : 1.3; ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, 6.2832); ctx.stroke();
        if (age < DUREE_NOUVEAU) { const p = (age * 0.9) % 1; ctx.globalAlpha = (1 - p) * Math.min(1, (DUREE_NOUVEAU - age) / 8); ctx.lineWidth = 2.2; ctx.beginPath(); ctx.arc(q.x, q.y, r + p * 34, 0, 6.2832); ctx.stroke(); ctx.beginPath(); ctx.arc(q.x, q.y, r + p * 18, 0, 6.2832); ctx.stroke(); }
        else if (e.severite >= 3) { const p = (t * 0.5 + e.t % 7) % 1; ctx.globalAlpha = (1 - p) * 0.55; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(q.x, q.y, r + p * 16, 0, 6.2832); ctx.stroke(); }
        if (chaud || choisi) { ctx.globalAlpha = 1; ctx.fillStyle = 'rgba(3,10,18,.88)'; ctx.font = '12px ui-monospace, Consolas, monospace'; const tx = String(e.titre).slice(0, 52) + ' · ' + ageTexte(e.t), w = ctx.measureText(tx).width + 12; ctx.fillRect(q.x + r + 6, q.y - 11, w, 22); ctx.strokeStyle = c; ctx.lineWidth = 1; ctx.strokeRect(q.x + r + 6, q.y - 11, w, 22); ctx.fillStyle = '#e8f6ff'; ctx.fillText(tx, q.x + r + 12, q.y + 4); }
      }
      ctx.globalAlpha = 1;
    },
    survoler(x, y) { const v = api.pris(x, y); survolId = v ? v.e.id : null; return v ? v.e : null; },
    pris(x, y) { let m = null, d = 1e9; for (const v of visibles) { const dd = Math.hypot(v.x - x, v.y - y); if (dd < Math.max(RAYON_CLIC, v.r + 4) && dd < d) { d = dd; m = v; } } return m; },
    detail,
    ouvrir(x, y) { const v = api.pris(x, y); if (!v) return false; return detail(v.e); },
    vider() { api.arreter(); tous = []; visibles = []; vus.clear(); nouveauxTemps.clear(); premier = true; etat = null; choisiId = null; ctx.clearRect(0, 0, L, H); try { window.Panneaux && window.Panneaux.fermer('terre-evenement'); } catch (e) { /* déjà fermé */ } },
    liste: () => visibles.map(v => ({ id: v.e.id, x: v.x, y: v.y, type: v.e.type, severite: v.e.severite })),
    etat: () => ({ actif, nombre: tous.length, affiches: filtrees().length, visibles: visibles.length, etat: etat && etat.etat, etiquette: etat && etat.etiquette, filtres: { types: [...filtres.types], severiteMin: filtres.severiteMin }, nouveaux: [...nouveauxTemps.keys()].length, sources: etat && etat.sources || [] }),
    evenements: () => tous.slice(),
    trouver: id => tous.find(e => e.id === id) || null
  };
  return api;
}
