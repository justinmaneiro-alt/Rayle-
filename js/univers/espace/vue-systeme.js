// VUE « SYSTÈME SOLAIRE » du thème Espace : planètes, Soleil, lunes, Cérès, Vesta, ceinture d'astéroïdes ; sélection, vol de caméra, fiches, présentation animée.
// Contrat d'une vue : creerVue(P) → { id, entrer(opts), sortir(), maj(dt, t, ts, tSim), tap(x, y), menu(), commande(nom, args), etat(), near(camera), ctrlAvant(c), detruire() }
// P = contexte partagé du thème (voir theme-espace.js) : THREE, noyau, q, ctx, hud, scene, camera, ctrl, ts(), H, pont(), suivreTerre(), esc, vec.
import { creerSysteme, UA_U } from './systeme.js?v=2026.10.15.9';
import { ASTRES, ORDRE_PLANETES, comparaisons } from '../donnees/planetes.js?v=2026.10.15.9';
import { composerAstre, ANGLES_LIBELLES, choisir } from '../donnees/presentation.js?v=2026.10.15.9';
import * as Reg from '../planetes/registre.js?v=2026.10.15.9';

const RAD = Math.PI / 180;
const ICONES = { mercure: '☿', venus: '♀', terre: '🌍', mars: '♂', jupiter: '♃', saturne: '♄', uranus: '⛢', neptune: '♆', soleil: '☀', ceres: '⚪', vesta: '🪨', asteroides: '☄' };
const norm = t => String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/['’\-]/g, ' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
export const NOMS = { soleil: ['soleil'], mercure: ['mercure'], venus: ['venus'], terre: ['terre', 'planete terre'], mars: ['mars', 'planete mars'], jupiter: ['jupiter'], saturne: ['saturne'], uranus: ['uranus'], neptune: ['neptune'], ceres: ['ceres'], vesta: ['vesta'], asteroides: ['asteroides', 'ceinture d asteroides', 'la ceinture', 'ceinture principale', 'ceinture dasteroides'] };
export function trouverAstre(nom) { const n = norm(nom).replace(/^(?:la |le |les |l )/, '').replace(/^planete /, ''); for (const [id, l] of Object.entries(NOMS)) if (l.includes(n)) return id; return null; }

export default async function creerVue(P) {
  const { THREE, noyau, hud, camera, ctrl, ctx } = P, vec = P.vec, esc = P.esc;
  hud.charge('Système solaire…', .6);
  const S = await creerSysteme(ctx); P.scene.add(S.groupe); S.groupe.visible = false;
  let actif = false, suivi = null, presEnCours = 0;
  const ids = ['soleil', ...ORDRE_PLANETES, 'ceres', 'vesta'];

  // étiquettes : nom de chaque corps, au-dessus de lui ; elles s'effacent quand on est tout près
  for (const id of ids) {
    const d = ASTRES[id], pos = () => { const p = S.positionMonde(id); return p ? p.clone().add(vec(0, S.rayon(id) * 1.35 + (id === 'soleil' ? 0 : 0), 0)) : vec(0, 0, 0); };
    ctx.etiquettes.ajouter({ id: 'sys:' + id, texte: (ICONES[id] || '') + ' ' + d.nom, classe: 'pays', position: pos, onClick: () => { if (actif) allerAstre(id); },
      alpha: () => { if (!actif) return 0; const dd = camera.getWorldPosition(vec(0, 0, 0)).distanceTo(S.positionMonde(id)), r = S.rayon(id); if (['ceres', 'vesta'].includes(id)) return dd < 400 && dd > r * 8 ? 1 : 0; return dd < r * 5 ? 0 : 1; } });
  }
  ctx.etiquettes.ajouter({ id: 'sys:ceinture', texte: '☄ Ceinture d’astéroïdes', classe: 'mer', position: () => vec(UA_U * 2.7 * .707, 0, -UA_U * 2.7 * .707), alpha: () => { if (!actif) return 0; const d = camera.getWorldPosition(vec(0, 0, 0)).length(); return d > 250 && d < 2500 ? 1 : 0; } });

  /* ───── caméra : vol vers un corps, puis suivi (la caméra accompagne le corps sur son orbite) ───── */
  const suit = () => { if (!suivi) return; const p = S.positionMonde(suivi); if (!p) return; const delta = p.clone().sub(ctrl.c.target); camera.position.add(delta); ctrl.c.target.copy(p); };
  function poseVers(id) {
    const p = S.positionMonde(id), r = S.rayon(id), anneaux = id === 'saturne' || id === 'uranus';
    const mult = id === 'soleil' ? 3.2 : anneaux ? 5.4 : id === 'jupiter' ? 3.6 : ['ceres', 'vesta'].includes(id) ? 4.5 : 3.4;
    const depuis = id === 'soleil' ? vec(1, .25, .4) : p.clone().setY(0).normalize().negate().applyAxisAngle(vec(0, 1, 0), 38 * RAD).add(vec(0, .26, 0)).normalize();   // on arrive du côté du Soleil (face éclairée), un peu au-dessus du plan
    return { pos: p.clone().addScaledVector(depuis, Math.max(r * mult, .25)), regard: p, r };
  }
  async function volerVers(id) {
    P.suivreTerre(false); const c = ctrl.c; c.enabled = false; suivi = null;
    if (S.tourne() && S.tourne() !== id) S.tourner(null);                       // on change de planète : la précédente cesse de tourner
    await noyau.cinematique(async api => {
      const c0 = camera.position.clone(), t0 = c.target.clone(), long = c0.distanceTo(S.positionMonde(id));
      await api.tween(Math.max(2.4, Math.min(6.5, 2 + Math.log10(long + 1) * 1.3)), e => { const pz = poseVers(id); camera.position.lerpVectors(c0, pz.pos, e); const r = t0.clone().lerp(pz.regard, e); camera.lookAt(r); c.target.copy(r); }, { ease: noyau.EASE.sinus });
    });
    const pz = poseVers(id); c.minDistance = Math.max(.12, pz.r * 1.18); c.maxDistance = 6000; c.target.copy(pz.regard); suivi = id; c.enabled = true; c.update();
  }
  // on entre dans la ceinture : la caméra se place au milieu des rochers, du côté où Mars vient de passer
  async function dansCeinture() {
    P.suivreTerre(false); suivi = null; const c = ctrl.c; c.enabled = false; hud.carte(null);
    const m = S.positionMonde('mars'), th = Math.atan2(m.z, m.x) + .9, R = UA_U * 2.72;
    const B = vec(Math.cos(th) * R, 0, Math.sin(th) * R), tang = vec(-Math.sin(th), 0, Math.cos(th)), dehors = vec(Math.cos(th), 0, Math.sin(th));
    const pose = B.clone().addScaledVector(dehors, -16).add(vec(0, 7, 0)), regard = B.clone().addScaledVector(tang, 26).addScaledVector(dehors, 10);
    await noyau.cinematique(async api => { const c0 = camera.position.clone(), t0 = c.target.clone(); await api.tween(5.5, e => { camera.position.lerpVectors(c0, pose, e); const r = t0.clone().lerp(regard, e); camera.lookAt(r); c.target.copy(r); }, { ease: noyau.EASE.sinus }); });
    c.minDistance = .3; c.maxDistance = 7000; c.target.copy(regard); c.enabled = true; c.update();
  }
  async function vueEnsemble(mode) {
    P.suivreTerre(false); suivi = null; const c = ctrl.c; c.enabled = false; hud.carte(null);
    const inner = mode === 'interne', pose = inner ? vec(0, 210, 330) : vec(0, 1500, 2400);
    await noyau.cinematique(async api => { const c0 = camera.position.clone(), t0 = c.target.clone(); await api.tween(4, e => { camera.position.lerpVectors(c0, pose, e); const r = t0.clone().lerp(vec(0, 0, 0), e); camera.lookAt(r); c.target.copy(r); }, { ease: noyau.EASE.sinus }); });
    c.minDistance = 2; c.maxDistance = 7000; c.target.set(0, 0, 0); c.enabled = true; c.update();
  }

  /* ───── fiches ───── */
  const fmt = (n, d = 0) => Number(n).toLocaleString('fr-FR', { maximumFractionDigits: d });
  function ficheAstre(id) {
    const a = ASTRES[id]; if (!a) return;
    const l = [];
    if (a.type) l.push('<small>' + esc(a.type) + '</small>');
    if (a.rayonKm >= 1) l.push('Rayon : ' + fmt(a.rayonKm) + ' km');
    if (a.a > 0 && id !== 'soleil') l.push('Distance au Soleil : ' + fmt(a.a, 2) + ' UA (' + fmt(a.a * 149.6, 0) + ' millions de km)');
    if (a.periodeJ > 0 && a.a > 0) l.push('Année : ' + (a.periodeJ > 700 ? fmt(a.periodeJ / 365.25, 1) + ' ans' : fmt(a.periodeJ, 0) + ' jours'));
    if (a.rotationH) l.push('Jour (rotation) : ' + (Math.abs(a.rotationH) > 72 ? fmt(Math.abs(a.rotationH) / 24, 1) + ' jours' : fmt(Math.abs(a.rotationH), 1) + ' h') + (a.rotationH < 0 ? ' (sens inverse)' : ''));
    if (a.lunes) l.push('Lunes connues : ' + (a.lunes > 20 ? 'plus de ' + Math.floor(a.lunes / 10) * 10 : a.lunes));
    if (a.temp) l.push('Température : ' + esc(a.temp));
    const reg = Reg.PLANETES[id];                                                // monde intérieur : scène installée, ou « bientôt »
    if (reg) l.push('Monde intérieur : ' + (reg.themeInterieur ? '<b>' + esc(reg.themeInterieur.nom) + '</b>' : 'bientôt' + (reg.themePrevu ? ' <small>(prévu : ' + esc(reg.themePrevu) + ')</small>' : '')));
    const un = choisir([...(a.records || []), ...(a.anecdotes || []), ...(a.composition || [])], 'fiche:' + id);
    const actions = [{ texte: '🎬 Présenter', clic: () => presenter(id) }, { texte: '🎯 Zoom', clic: () => allerAstre(id) }];
    if (S.nommes.planetes.has(id)) actions.push({ texte: S.tourne() === id ? '⏸ Arrêter la rotation' : '🔄 Faire tourner', clic: () => { tournerAutour(id, S.tourne() !== id); ficheAstre(id); P.majMenu(); } });
    if (reg) actions.push({ texte: '🚪 Entrer', clic: () => entrerDans(id) });
    actions.push({ texte: '🎲 Un autre fait', clic: () => ficheAstre(id) });
    hud.carte({ titre: (ICONES[id] || '') + ' ' + a.nom.charAt(0).toUpperCase() + a.nom.slice(1), html: '<p>' + l.join('<br>') + '</p>' + (un ? '<p><small>' + esc(un) + '</small></p>' : ''), actions });
  }
  /* ───── navigation : tourner, zoomer, entrer ───── */
  // « fais tourner Jupiter » : on se place devant la planète (si besoin) et elle tourne sur elle-même, plus vite que la vraie ; le doigt ou la souris font tourner la vue en plus.
  function tournerAutour(id, oui) {
    const ok = oui ? S.tourner(id) : S.tourner(null);
    if (oui && !ok) return false;
    hud.legende(oui ? 'La planète tourne sur elle-même (bien plus vite qu’en vrai). Glisse pour tourner la vue, pince pour zoomer.' : 'La rotation est arrêtée.', 5000);
    return true;
  }
  // zoom doux vers/depuis le point regardé (la planète suivie) ; facteur < 1 rapproche, > 1 éloigne
  async function zoomer(facteur = .6) {
    const c = ctrl.c, cible = c.target.clone(), dir = camera.position.clone().sub(cible), d0 = dir.length(); if (d0 < 1e-6) return false;
    const d1 = Math.max(c.minDistance, Math.min(c.maxDistance, d0 * facteur)); dir.normalize();
    await noyau.tween(.9, e => { camera.position.copy(cible).addScaledVector(dir, d0 + (d1 - d0) * e); c.update(); });
    return true;
  }
  // « entre dedans » : le registre des planètes charge la scène intérieure à la demande (ou dit que la planète est prête à recevoir un thème)
  async function entrerDans(nom) {
    const p = nom ? Reg.trouver(nom) : (suivi ? Reg.PLANETES[suivi] : null);
    if (!p) return { ok: false, texte: nom ? 'Je ne connais pas « ' + nom + ' ».' : 'Choisis d’abord une planète : dis « va sur Mars », puis « entre dedans ».' };
    if (p.themeInterieur) hud.legende('Entrée dans ' + p.art + '…', 0);
    const r = await Reg.entrer(p, P);
    hud.legende(r && r.pret ? r.texte : null, r && r.pret ? 8000 : 0);
    return r;
  }
  async function allerAstre(id) {
    if (!ASTRES[id] && id !== 'asteroides') return { ok: false, texte: 'Astre inconnu.' };
    if (id === 'asteroides') { await dansCeinture(); hud.legende('La ceinture d’astéroïdes, entre Mars et Jupiter. Les rochers sont agrandis pour être visibles : en réalité ils sont séparés par des centaines de milliers de kilomètres.', 9000); ficheAstre('asteroides'); return { ok: true, texte: 'Voici la ceinture d’astéroïdes.' }; }
    ficheAstre(id); await volerVers(id);
    return { ok: true, texte: 'Voici ' + ASTRES[id].art + '.' };
  }

  /* ───── présentation animée ───── */
  async function presenter(id, options = {}) {
    const d = ASTRES[id]; const Pt = P.pont();
    if (!d) return { ok: false, texte: 'Je ne connais pas cet astre.' };
    const n = ++presEnCours, epoque = Pt.epoque ? Pt.epoque() : 0, vivant = () => n === presEnCours && (!Pt.epoque || Pt.epoque() === epoque);
    const texte = composerAstre(d, { angles: options.angles || 3, rnd: options.rnd || Math.random });
    ficheAstre(id);
    const fin = id === 'asteroides' ? dansCeinture() : volerVers(id);
    await fin;
    ctrl.c.autoRotate = id !== 'asteroides'; ctrl.c.autoRotateSpeed = .5;
    for (let i = 0; i < texte.segments.length && vivant(); i++) {
      const seg = texte.segments[i];
      hud.carte({ titre: (ICONES[id] || '') + ' ' + d.nom, html: '<p><small>' + esc(ANGLES_LIBELLES[seg.angle] || '') + ' · ' + (i + 1) + '/' + texte.segments.length + '</small></p><p>' + esc(seg.texte) + '</p>', actions: [{ texte: '⏹ Arrêter', clic: () => { presEnCours++; try { Pt.arreter && Pt.arreter(); } catch (e) { /* rien à couper */ } hud.carte(null); } }] });
      if (Pt.dire) { const ok = await Pt.dire(seg.texte); if (ok === false) break; } else await noyau.attendre(Math.min(8, 2 + seg.texte.length / 40));
    }
    ctrl.c.autoRotate = false;
    if (vivant()) setTimeout(() => { if (n === presEnCours) hud.carte(null); }, 12000);
    return { ok: true, texte: texte.segments.map(s => s.texte).join(' '), sources: texte.sources };
  }

  /* ───── contrat de vue ───── */
  async function entrer(opts = {}) {
    actif = true; S.groupe.visible = true; P.suivreTerre(false); ctrl.c.enabled = true;
    if (opts.cible) { camera.position.set(0, 230, 360); ctrl.c.target.set(0, 0, 0); ctrl.c.update(); await volerVers(opts.cible); ficheAstre(opts.cible); }
    else { camera.position.set(0, 230, 360); camera.lookAt(0, 0, 0); ctrl.c.target.set(0, 0, 0); ctrl.c.minDistance = 2; ctrl.c.maxDistance = 7000; ctrl.c.update(); hud.legende('Distances vraies ; planètes agrandies d’un même facteur (×390), Soleil réduit. Touche un astre pour le découvrir.', 9000); }
  }
  function sortir() { actif = false; S.groupe.visible = false; suivi = null; presEnCours++; ctrl.c.autoRotate = false; S.tourner(null); }
  function maj(dt, t, ts, tSim) { S.maj(dt, t, ts, tSim, camera); suit(); }
  // la Terre est la maison de Rayle : la toucher ramène sur la Terre ; toucher deux fois dans le vide ramène aussi (vue d'ensemble → Terre)
  let dernierVide = 0;
  function tap(x, y) {
    const { w, h } = noyau.dims(); const id = S.pick(camera, x, y, w, h);
    if (id === 'terre') { P.allerVue('terre'); return; }
    if (id) { dernierVide = 0; ficheAstre(id); if (suivi !== id) volerVers(id); return; }
    const t = performance.now(); if (t - dernierVide < 600) { dernierVide = 0; P.allerVue('terre'); } else dernierVide = t;
  }
  const menu = () => {
    const it = [{ id: 'interne', texte: '☀ Système interne', titre: 'Mercure à Mars, et la ceinture d’astéroïdes', clic: () => vueEnsemble('interne') }, { id: 'complet', texte: '🔭 Système complet', titre: 'Jusqu’à Neptune', clic: () => vueEnsemble('complet') }];
    for (const id of ['soleil', ...ORDRE_PLANETES]) it.push({ id: 'p-' + id, texte: (ICONES[id] || '') + ' ' + ASTRES[id].nom, titre: ASTRES[id].nom, actif: suivi === id, clic: () => { ficheAstre(id); volerVers(id).then(() => P.majMenu()); } });
    if (suivi && S.nommes.planetes.has(suivi)) it.push({ id: 'tourner', texte: S.tourne() === suivi ? '⏸ Arrêter la rotation' : '🔄 Faire tourner', titre: 'Faire tourner la planète devant toi', actif: S.tourne() === suivi, clic: () => { tournerAutour(suivi, S.tourne() !== suivi); P.majMenu(); } });
    if (suivi && Reg.PLANETES[suivi]) it.push({ id: 'entrer', texte: '🚪 Entrer dans ' + ASTRES[suivi].art, titre: Reg.PLANETES[suivi].themeInterieur ? 'Entrer dans le monde intérieur : ' + Reg.PLANETES[suivi].themeInterieur.nom : 'Prête à recevoir un thème intérieur', clic: () => entrerDans(suivi) });
    it.push({ id: 'ast', texte: '☄ Astéroïdes', titre: 'La ceinture d’astéroïdes, Cérès et Vesta', clic: () => allerAstre('asteroides') });
    it.push({ id: 'echelle', texte: '📏 Échelle : ' + (S.echelleActuelle() === 'reelle' ? 'réelle' : 'didactique'), titre: 'Basculer entre planètes agrandies et vraie échelle (les planètes deviennent des points)', clic: () => { S.echelle(S.echelleActuelle() === 'reelle' ? 'didactique' : 'reelle'); hud.legende(S.echelleActuelle() === 'reelle' ? 'Vraie échelle : les planètes sont minuscules, zoome pour les trouver.' : 'Échelle didactique : planètes agrandies d’un même facteur.', 6000); P.majMenu(); } });
    return it;
  };
  async function commande(nom, a = {}) {
    switch (nom) {
      case 'aller': { const id = trouverAstre(a.nom); if (!id) return undefined; return allerAstre(id); }
      case 'presenter': { const id = trouverAstre(a.nom); if (!id) return undefined; return presenter(id, a); }
      case 'systeme': S.tourner(null); await vueEnsemble(a.complet ? 'complet' : 'interne'); return { ok: true, texte: 'Voici le système solaire.' };
      case 'tourner': {
        if (a.oui === false) { tournerAutour(null, false); P.majMenu(); return { ok: true, texte: 'J’ai arrêté la rotation.' }; }
        const id = a.nom ? trouverAstre(a.nom) : suivi;
        if (!id) return { ok: false, texte: a.nom ? 'Je ne connais pas « ' + a.nom + ' ».' : 'Dis d’abord quelle planète, par exemple « fais tourner Jupiter ».' };
        if (!S.nommes.planetes.has(id)) return { ok: false, texte: (ASTRES[id] ? ASTRES[id].nom : 'Cet astre') + ' ne se fait pas tourner ici : choisis une planète.' };
        if (suivi !== id) { ficheAstre(id); await volerVers(id); }
        tournerAutour(id, true); P.majMenu(); return { ok: true, texte: ASTRES[id].nom + ' tourne devant toi.' };
      }
      case 'zoom': { const ok = await zoomer(a.facteur || .6); return ok ? { ok: true, texte: a.facteur > 1 ? 'Je m’éloigne.' : 'Je me rapproche.' } : { ok: false, texte: 'Je ne peux pas zoomer ici.' }; }
      case 'entrer': return entrerDans(a.nom ? a.nom : null);
      case 'echelle': S.echelle(a.reelle ? 'reelle' : 'didactique'); P.majMenu(); return { ok: true, texte: a.reelle ? 'Vraie échelle : les planètes sont de minuscules points.' : 'Échelle didactique : planètes agrandies.' };
      case 'surprise': { const l = ['soleil', ...ORDRE_PLANETES, 'asteroides']; return presenter(l[Math.floor(Math.random() * l.length)]); }
      default: return undefined;
    }
  }
  const etat = () => ({ vue: 'systeme', suivi, tourne: S.tourne(), interieur: suivi && Reg.PLANETES[suivi] ? Reg.PLANETES[suivi].etat : null, echelle: S.echelleActuelle(), distanceSoleil: +camera.getWorldPosition(vec(0, 0, 0)).length().toFixed(1), asteroides: S.ceinture.nombre });
  // plan proche de la caméra : près du corps le plus proche ; dans la ceinture, les rochers passent tout près
  function near(c) {
    const p = c.getWorldPosition(vec(0, 0, 0)); let m = 1e9;
    const rxz = Math.hypot(p.x, p.z); if (rxz > UA_U * 2 && rxz < UA_U * 3.4 && Math.abs(p.y) < 60) m = 1.5;
    for (const id of ids) { const q = S.positionMonde(id); if (q) m = Math.min(m, p.distanceTo(q) - S.rayon(id)); }
    return Math.max(.02, Math.min(m * .1, 20));
  }
  function ctrlAvant(c) { const d = camera.position.distanceTo(c.target); c.rotateSpeed = Math.max(.25, Math.min(.9, d / 300)); c.zoomSpeed = 1.1; }
  function detruire() { actif = false; S.detruire(); P.scene.remove(S.groupe); }
  return { id: 'systeme', entrer, sortir, maj, tap, menu, commande, etat, near, ctrlAvant, detruire, _: { S, ficheAstre, allerAstre, vueEnsemble, presenter, suivi: () => suivi, tournerAutour, zoomer, entrerDans } };
}
