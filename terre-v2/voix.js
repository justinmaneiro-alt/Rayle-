/* ═════════════ RAYLÉ PILOTE LA TERRE 2.0 (voix ET texte, sans IA) ═════════════
   « va à Paris », « zoome sur la tour Eiffel », « montre les avions / satellites / séismes / bateaux / caméras de Londres », « mode nuit / thermique / normal »,
   « masque les couches », « retour à la Terre classique ». Raylé répond en français et annonce ce qu'elle fait ; une couche sans clé → elle explique comment l'activer.
   analyser(texte) est pur (testé) ; traiter(texte) ouvre la Terre 2.0 si besoin (PC seulement) et exécute. Les commandes ne parlent que de la Terre. */
export const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'`\-]/g, ' ').replace(/[?!.,;:«»"]/g, ' ').replace(/\s+/g, ' ').trim();

export const COUCHES_VOIX = [
  ['avions', /\b(avions?|vols?|trafic aerien)\b/], ['satellites', /\b(satellites?|iss|station spatiale)\b/], ['seismes', /\b(seismes?|tremblements? de terre)\b/],
  ['bateaux', /\b(bateaux?|navires?|trafic maritime)\b/], ['cameras', /\b(cameras?|webcams?)\b/], ['meteo', /\b(meteo|temperatures?|vent)\b/],
  ['lancements', /\b(lancements?|fusees?)\b/], ['incendies', /\b(incendies?|feux de foret|feux)\b/]
];
export const VISIONS = [['nuit', /\b(mode nuit|vision (de )?nuit|vision nocturne|mode nocturne|infrarouge)\b/], ['thermique', /\b(thermique)\b/], ['crt', /\b(crt|cathodique|vieil ecran|ecran retro)\b/], ['nb', /\b(noir et blanc|noir blanc)\b/], ['normal', /\b(mode normal|vision normale?|couleurs? normales?|mode jour)\b/]];
const NOMS = { avions: 'les avions', satellites: 'les satellites', seismes: 'les séismes', bateaux: 'les bateaux', cameras: 'les caméras publiques', meteo: 'la météo', lancements: 'les lancements', incendies: 'les incendies' };

/* « … de Londres », « … à Paris », « … sur le Japon » → lieu */
function lieuApres(n) {
  const m = n.match(/\b(?:de|du|des|a|au|aux|en|sur|vers|autour de)\s+(?:la |le |les |l )?([a-z0-9][a-z0-9 ]{1,60})$/);
  if (!m) return null; const l = m[1].replace(/\b(s il te plait|stp|merci)\b/g, '').trim();
  return /^(terre|globe|carte|la terre|terre 2|ecran)$/.test(l) ? null : l;
}

export function analyser(texte) {
  const n = norm(texte); if (!n) return null;
  const terre = /\b(terre|globe)\b/.test(n);
  if (/\b(terre classique|ancienne terre|vieille terre)\b/.test(n)) return { type: 'classique', terre: true };
  if (/\b(terre 2|terre deux|nouvelle terre)\b/.test(n) && !/classique/.test(n)) return { type: 'ouvrir', terre: true };
  // masquer
  if (/\b(masque|masquer|cache|cacher|enleve|enlever|retire|retirer|desactive|desactiver|eteins|eteindre|coupe)\b/.test(n)) {
    if (/\b(couches?|tout|toutes)\b/.test(n) && !COUCHES_VOIX.some(([, r]) => r.test(n))) return { type: 'masquer', terre };
    const c = COUCHES_VOIX.find(([, r]) => r.test(n)); if (c) return { type: 'couche', couche: c[0], oui: false, terre };
  }
  // vision
  const v = VISIONS.find(([, r]) => r.test(n)); if (v && (/\b(mode|vision|passe|mets|active)\b/.test(n) || v[0] === 'thermique' || v[0] === 'crt')) return { type: 'vision', mode: v[0], terre };
  // zoom sur un lieu
  let m = n.match(/\b(?:zoome|zoomer|zoom|rapproche toi|approche toi)\s+(?:sur|vers|de)\s+(la |le |les |l )?(.{2,60})$/);
  if (m) return { type: 'zoom', lieu: m[2].trim(), article: m[1] ? (m[1] === 'l ' ? 'l’' : m[1]) : '', terre: true };
  // couches (« montre les avions de Londres »)
  if (/\b(montre|montre moi|affiche|afficher|active|activer|allume|fais voir|ou sont|voir)\b/.test(n)) {
    const c = COUCHES_VOIX.find(([, r]) => r.test(n));
    if (c) { const reste = n.slice(n.search(c[1]) + n.match(c[1])[0].length).trim(); return { type: 'couche', couche: c[0], oui: true, lieu: reste ? lieuApres(' ' + reste) || lieuApres(reste) : null, terre }; }
  }
  // aller quelque part
  m = n.match(/^(?:raylé |rayle )?(?:va|vas|allons|vole|volons|emmene moi|amene moi|direction|pars|file|deplace toi|montre moi|centre toi)\s+(?:a|au|aux|en|vers|sur|jusqu a|dans)\s+(?:la |le |les |l )?(.{2,60})$/);
  if (m && !/^(mars|jupiter|saturne|neptune|venus|mercure|uranus|lune|soleil|galaxie|accueil|terminal|base|salon|bureau|terre)$/.test(m[1].trim())) return { type: 'aller', lieu: m[1].trim(), terre: true };
  return null;
}

/* exécute (navigateur) — rend la phrase de Raylé, ou null si la phrase n'est pas pour la Terre 2.0 */
export async function traiter(texte, { ouvrir = ouvrirTerre2 } = {}) {
  const a = analyser(texte); if (!a) return null;
  let T = window.Terre2 && window.Terre2.etat().actif ? window.Terre2 : null;
  // hors de la Terre 2.0 : seulement les phrases qui la concernent sans ambiguïté (sinon les autres commandes décident)
  if (!T) {
    // Terre classique par défaut : hors de la 2.0, SEULE la demande explicite (« Terre 2.0 ») l'ouvre ; « va à Paris » reste à la Terre classique
    const sansAmbiguite = a.type === 'ouvrir';
    if (!sansAmbiguite) return null;
    if (a.type === 'classique') return null;   // la Terre classique s'ouvre déjà par ses propres commandes
    try { T = await ouvrir(); } catch (e) { return 'Je n’arrive pas à ouvrir la Terre 2.0 : ' + (e && e.message || e) + '.'; }
  }
  switch (a.type) {
    case 'ouvrir': return 'Voici la Terre 2.0.';
    case 'classique': await T.classique(); return 'Je repasse sur la Terre classique.';
    case 'masquer': T.masquerCouches(); return 'J’ai masqué toutes les couches.';
    case 'vision': T.vision(a.mode); return { nuit: 'Vision nocturne activée.', thermique: 'Vision thermique activée.', crt: 'Mode écran cathodique.', nb: 'Passage en noir et blanc.', normal: 'Retour à la vision normale.' }[a.mode];
    case 'aller': case 'zoom': {
      const l = (await T.chercher(a.lieu))[0]; if (!l) return `Je ne trouve pas « ${a.lieu} » sur la carte.`;
      if (a.type === 'zoom') { T.zoomerSur(l); return `Je zoome sur ${a.article || ''}${l.court || a.lieu}.`; }
      T.aller(l); return `Je t’emmène à ${l.court || a.lieu}.`;
    }
    case 'couche': {
      if (!a.oui) { await T.activerCouche(a.couche, false); return `J’ai masqué ${NOMS[a.couche]}.`; }
      let ou = '';
      if (a.lieu) { const l = (await T.chercher(a.lieu))[0]; if (l) { T.aller(l, { hauteur: a.couche === 'satellites' ? 2.5e7 : a.couche === 'cameras' ? 40000 : 400000 }); ou = ' autour de ' + (l.court || a.lieu); } }
      const r = await T.activerCouche(a.couche, true);
      if (r.cleManquante) return `${NOMS[a.couche][0].toUpperCase()}${NOMS[a.couche].slice(1)} demandent une clé gratuite que je n’ai pas encore. ${r.erreur}`;
      if (!r.ok) return `Je n’arrive pas à afficher ${NOMS[a.couche]} : la source ne répond pas.`;
      return `Je t’affiche ${NOMS[a.couche]}${ou}.`;
    }
    default: return null;
  }
}

/* ouvre la galaxie, vole jusqu'à la Terre et attend la Terre 2.0 (PC seulement) */
async function ouvrirTerre2(delai = 60000) {
  const bus = window.RayleBus; if (!bus) throw new Error('Raylé n’est pas prête');
  if (bus.demander('vue') !== 'galaxie') await bus.demander('vue:ouvrir', 'galaxie');
  const attendre = async (f, max) => { const t0 = Date.now(); while (Date.now() - t0 < max) { try { if (f()) return true; } catch (e) { /* */ } await new Promise(r => setTimeout(r, 150)); } return false; };
  if (!(await attendre(() => window.Galaxie && window.Galaxie.enMarche && window.Galaxie.enMarche(), 20000))) throw new Error('la galaxie ne répond pas');
  // la Terre classique est la Terre par défaut : la 2.0 (expérimentale) s'ouvre pour CETTE visite seulement
  if (window.Terre && window.Terre.etat && window.Terre.etat().actif) { if (window.Terre.sortir) window.Terre.sortir(); await new Promise(r => setTimeout(r, 400)); }
  try { sessionStorage.setItem('rayle_terre_visite', 'v2'); } catch (e) { /* */ }
  window.Galaxie.nav.allerA('terre', { entrer: true });
  if (!(await attendre(() => window.Terre2 && window.Terre2.etat().actif && window.Terre2.etat().globe, delai))) throw new Error('le globe ne s’ouvre pas (réglage « Terre classique » ou hors ligne ?)');
  return window.Terre2;
}
