// Transitions entre thèmes de l'Univers : zoom continu depuis la Terre jusqu'à un océan (Espace → Bataille navale) et retour (Bataille navale → Espace).
// Les autres paires de thèmes passent par un simple fondu (noyau.changerThemeBrut). Ajouter un thème = ajouter ses paires ici, sans toucher aux autres.
//   basculer(noyau, id, options)   options : { lieu:'la Manche' | lat, lon, scenario, nom }
//   choisirOcean({texte, lat, lon, position}) → { nom, lat, lon }      (pur, testé)
// Déroulé Espace → navale : la caméra file vers l'océan choisi (position réelle de l'utilisateur la plus proche, ou le lieu demandé), plonge à travers l'atmosphère et les nuages
// (fondu vers un blanc de nuage), puis le thème navale démarre en altitude et descend jusqu'aux navires (météo et heure réelles du lieu). Le retour fait l'inverse. « Passer l'animation »
// raccourcit chaque étape sans coupure.
const RAD = Math.PI / 180;
export const OCEANS = [
  { nom: 'le cap Trafalgar', lat: 36.18, lon: -6.35, mots: ['trafalgar', 'cadix', 'gibraltar', 'espagne'] },
  { nom: 'la Manche', lat: 49.9, lon: -2.6, mots: ['manche', 'channel', 'angleterre', 'normandie', 'bretagne'] },
  { nom: 'le golfe de Gascogne', lat: 45.8, lon: -6.5, mots: ['gascogne', 'biscaye', 'atlantique'] },
  { nom: 'la mer des Caraïbes', lat: 15.2, lon: -72.5, mots: ['caraibes', 'antilles', 'caribbean', 'jamaique', 'martinique'] },
  { nom: 'l’océan Atlantique Nord', lat: 38, lon: -32, mots: ['atlantique nord', 'nord'] },
  { nom: 'la mer Méditerranée', lat: 38.2, lon: 11.5, mots: ['mediterranee', 'méditerranée', 'italie', 'malte', 'sicile'] },
  { nom: 'l’océan Indien', lat: -14, lon: 74, mots: ['indien', 'inde', 'ceylan'] },
  { nom: 'l’océan Pacifique', lat: 8, lon: -140, mots: ['pacifique', 'hawai'] },
  { nom: 'la mer du Nord', lat: 56.5, lon: 3.2, mots: ['mer du nord', 'ecosse', 'hollande', 'danemark'] },
];
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const dist = (a, b) => { const p1 = a.lat * RAD, p2 = b.lat * RAD, dl = (b.lon - a.lon) * RAD; return Math.acos(Math.max(-1, Math.min(1, Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos(dl)))); };
export function choisirOcean({ texte, lat, lon, position, rnd = Math.random } = {}) {
  if (lat != null && lon != null && isFinite(lat) && isFinite(lon)) return { nom: texte || 'cet océan', lat: +lat, lon: +lon };
  const t = norm(texte);
  if (t) { for (const o of OCEANS) if (o.mots.some(m => t.includes(norm(m)))) return { nom: o.nom, lat: o.lat, lon: o.lon }; }
  if (position && isFinite(position.lat)) { let b = OCEANS[0], d = 9; for (const o of OCEANS) { const x = dist(position, o); if (x < d) { d = x; b = o; } } return { nom: b.nom, lat: b.lat, lon: b.lon }; }
  const o = OCEANS[Math.floor(rnd() * OCEANS.length)]; return { nom: o.nom, lat: o.lat, lon: o.lon };
}
const maPosition = () => { try { const p = window.RayleLocalisation && RayleLocalisation.maPosition(); return p && isFinite(p.lat) ? { lat: p.lat, lon: p.lon } : null; } catch (e) { return null; } };
const vue = () => document.getElementById('vueUnivers');
const nuage = oui => { const v = vue(); if (v) v.classList.toggle('transition-nuage', !!oui); };

export async function basculer(N, id, options = {}) {
  const de = N.etat().theme;
  if (de === id) return N.instance();
  if (de === 'espace' && id === 'navale' && !options.sansTransition) return espaceVersNavale(N, options);
  if (de === 'navale' && id === 'espace' && !options.sansTransition) return navaleVersEspace(N, options);
  return N.changerThemeBrut(id, options);
}

async function espaceVersNavale(N, options) {
  const inst = N.instance(), I = inst && inst._; if (!I || !I.vol) return N.changerThemeBrut('navale', options);
  const lieu = choisirOcean({ texte: options.lieu, lat: options.lat, lon: options.lon, position: maPosition() });
  N.hud.carte(null); N.hud.legende('Cap sur ' + lieu.nom + '…', 8000);
  nuage(true);
  try {
    await N.cinematique(async api => {
      if (I.vueNom() !== 'terre') await I.allerVue('terre');
      await I.vol(api, { lat: lieu.lat, lon: lieu.lon, dist: 1.5, duree: 3.4 });
      // plongée : la caméra descend à la verticale de l'océan, à travers l'atmosphère et la couche de nuages
      const cam = I.camera, c = I.ctrl.c, r0 = cam.position.length(), dir = cam.position.clone().normalize(); c.enabled = false;
      await api.tween(4.6, e => { const r = Math.exp(Math.log(r0) * (1 - e) + Math.log(1.0006) * e); cam.position.copy(dir).multiplyScalar(r); cam.lookAt(0, 0, 0); }, { ease: N.EASE.entree || undefined });
      await N.fondu(true);
    });
  } finally { /* la suite se fait même si l'utilisateur passe l'animation */ }
  const opts = Object.assign({}, options, { depuis: 'espace', lat: lieu.lat, lon: lieu.lon, lieuNom: lieu.nom });
  try { return await N.changerThemeBrut('navale', opts); } finally { setTimeout(() => nuage(false), 900); }
}

async function navaleVersEspace(N, options) {
  const inst = N.instance(), I = inst && inst._; if (!I || !I.ascension) return N.changerThemeBrut('espace', options);
  const m = I.meteo ? I.meteo() : {}, lat = options.lat != null ? options.lat : (m.lat != null ? m.lat : 46), lon = options.lon != null ? options.lon : (m.lon != null ? m.lon : 2);
  N.hud.carte(null); nuage(true);
  try {
    await N.cinematique(async api => { await I.ascension(api); await N.fondu(true); });
  } finally { /* suite assurée */ }
  const opts = Object.assign({}, options, { depuis: 'navale', lat, lon });
  try { return await N.changerThemeBrut('espace', opts); } finally { setTimeout(() => nuage(false), 900); }
}
