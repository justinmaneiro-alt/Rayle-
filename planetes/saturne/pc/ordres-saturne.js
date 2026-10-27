/* ═════════════ ORDRES DE SATURNE (bus d'ordres) ═════════════
   Déclarés dans planetes/saturne/manifeste.json, branchés ici dès l'ouverture de la galaxie (petit fichier : le vaisseau lui-même, lourd, ne se charge qu'à la première visite).
   « monte à bord » : ouvre la galaxie, vole jusqu'à Saturne, charge le vaisseau. À bord : « emmène-moi sur Mars » (pilote automatique), vues, siège, salle médicale, arrêt, orbite.
   Les réponses sont des phrases courtes, parlées par Raylé depuis le cockpit. Rien n'est inventé : un ordre impossible dit pourquoi. */
const pause = ms => new Promise(r => setTimeout(r, ms));
async function attendre(cond, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (cond()) return true; await pause(120); } return false; }
const NOMS = { soleil: 'le Soleil', mercure: 'Mercure', venus: 'Vénus', terre: 'la Terre', mars: 'Mars', jupiter: 'Jupiter', saturne: 'Saturne', uranus: 'Uranus', neptune: 'Neptune' };

export function brancher({ O, galaxie, ouvrirGalaxie }) {
  const vais = () => window.Saturne || null;
  const abord = () => { const v = vais(), e = v && v.etat(); return !!(e && e.actif && !e.transition); };
  /* Amène l'utilisateur à bord (galaxie ouverte, vol jusqu'à Saturne, module chargé). */
  async function monterAbord() {
    await ouvrirGalaxie();
    if (abord()) return true;
    galaxie.nav.allerA('saturne', { entrer: true });
    return attendre(abord, 40000);
  }
  const sur = (action, fn, delai = 45000) => { try { O.enregistrer('saturne', action, fn, { delai }); } catch (e) { /* ordre non déclaré par le manifeste : ignoré */ } };
  const exige = () => (abord() ? null : { ok: false, erreur: 'tu n’es pas à bord du vaisseau : dis « monte à bord »' });

  sur('entrer_vaisseau', async () => {
    if (!(await monterAbord())) return { ok: false, erreur: 'le vaisseau n’a pas pu s’ouvrir' };
    return { ok: true, texte: 'Bienvenue à bord du Vésale, en orbite de Saturne. Touche C pour le cockpit.' };
  });
  sur('aller_a', async ({ cible }) => {
    const e0 = exige(); if (e0) return e0;
    const v = vais(); if (v.etat().mode !== 'vol') await v.sortirSalle();
    const nom = NOMS[cible] || cible;
    const p = v.aller(cible);                                        // se résout à l'arrivée en orbite
    const debut = await Promise.race([p, pause(1800).then(() => null)]);
    if (debut && !debut.ok) return { ok: false, erreur: debut.erreur };
    if (debut) return debut;
    return { ok: true, texte: 'Pilote automatique engagé : cap sur ' + nom + '. Je te préviens à l’arrivée.' };
  }, 20000);
  sur('changer_vue', async ({ vue }) => { const e0 = exige(); if (e0) return e0; const v = vais(); if (v.etat().mode === 'salle') await v.sortirSalle(); return v.vue(vue) ? { ok: true, texte: { cockpit: 'Vue du cockpit.', exterieur: 'Vue extérieure du vaisseau.', libre: 'Vue libre : la caméra se détache du vaisseau.' }[vue] } : { ok: false, erreur: 'la vue n’a pas pu changer' }; }, 15000);
  sur('s_asseoir', async () => { const e0 = exige(); if (e0) return e0; const v = vais(); if (v.etat().vue !== 'cockpit') v.vue('cockpit'); if (v.etat().assis) return { ok: true, texte: 'Je suis déjà au poste de pilotage.' }; v.basculerAssis(); return { ok: true, texte: 'Tu es installé au poste de pilotage.' }; }, 15000);
  sur('se_lever', async () => { const e0 = exige(); if (e0) return e0; const v = vais(); if (v.etat().vue !== 'cockpit') return { ok: true, texte: 'Tu n’es pas dans le cockpit.' }; if (!v.etat().assis) return { ok: true, texte: 'Tu es déjà debout.' }; v.basculerAssis(); return { ok: true, texte: 'Tu te lèves. La salle médicale est la porte du fond.' }; }, 15000);
  sur('ouvrir_salle_medicale', async () => { const e0 = exige(); if (e0) return e0; const v = vais(); if (v.etat().mode === 'salle') return { ok: true, texte: 'Nous sommes déjà dans la salle médicale.' }; return (await v.salleMedicale()) ? { ok: true, texte: 'Voici la salle médicale : la table holographique d’anatomie est au centre.' } : { ok: false, erreur: 'la salle médicale n’a pas pu s’ouvrir' }; }, 30000);
  sur('fermer_salle_medicale', async () => { const e0 = exige(); if (e0) return e0; const v = vais(); if (v.etat().mode !== 'salle') return { ok: true, texte: 'Nous ne sommes pas dans la salle médicale.' }; return (await v.sortirSalle()) ? { ok: true, texte: 'Retour au cockpit.' } : { ok: false, erreur: 'la sortie a été interrompue' }; }, 20000);
  sur('arreter_vaisseau', async () => { const e0 = exige(); if (e0) return e0; vais().stopper(); return { ok: true, texte: 'Je freine : le vaisseau s’immobilise.' }; }, 10000);
  sur('mettre_en_orbite', async () => { const e0 = exige(); if (e0) return e0; const id = vais().orbiter(); return id ? { ok: true, texte: 'Nous passons en orbite de ' + (NOMS[id] || id) + '.' } : { ok: false, erreur: 'aucun astre assez proche' }; }, 10000);
  sur('afficher_commandes', async () => { const e0 = exige(); if (e0) return e0; await vais().ouvrirPanneauCommandes(); return { ok: true, texte: 'Voici le schéma des commandes de pilotage.' }; }, 15000);
  sur('reglage_vol', async ({ reglage, etat }) => {
    const e0 = exige(); if (e0) return e0; const v = vais(), oui = etat === 'oui';
    if (reglage === 'assistance') { v.reglerAssistance(oui); return { ok: true, texte: oui ? 'Assistance de vol activée.' : 'Assistance de vol coupée : vol newtonien, rien ne freine le vaisseau.' }; }
    v.reglerLimiteur(oui); return { ok: true, texte: oui ? 'Limiteur de vitesse activé.' : 'Limiteur de vitesse coupé : attention, la vitesse n’est plus plafonnée.' };
  }, 10000);
  /* Anatomie (S2) : table holographique de la salle médicale. Les noms sont cherchés dans l'index (français, latin, anglais) ; rien n'est deviné. */
  const SYSTEMES = { squelette: 'os', nerveux: 'nerfs', vasculaire: 'arteres', organes: 'coeur', muscles: 'muscles', cerveau: 'cerveau', arteres: 'arteres', veines: 'veines', nerfs: 'nerfs', nerfs_peripheriques: 'nerfs-periph', ligaments: 'conjonctif', coeur: 'coeur', poumons: 'respiratoire', digestif: 'digestif', dents: 'dents' };
  const NOMS_SYS = { os: 'le squelette', muscles: 'les muscles', arteres: 'les artères', veines: 'les veines', nerfs: 'les nerfs crâniens', 'nerfs-periph': 'les nerfs des membres, en schéma approximatif (pas un modèle anatomique exact)', 'nerfs-periph': 'les nerfs des membres, en schéma approximatif (pas un modèle anatomique exact)', cerveau: 'le cerveau', conjonctif: 'les ligaments', coeur: 'le cœur', respiratoire: 'les poumons', digestif: 'l’appareil digestif', dents: 'les dents' };
  const salleAnat = async () => {
    const v = vais(); if (!v || !v.etat().actif) return { erreur: 'tu n’es pas à bord du vaisseau : dis « monte à bord »' };
    if (v.etat().mode !== 'salle') { if (!(await v.salleMedicale())) return { erreur: 'la salle médicale n’a pas pu s’ouvrir' }; }
    try { return { a: await v.anatomie() }; } catch (e) { return { erreur: 'l’anatomie n’est pas disponible (' + (e && e.message || e) + ')' }; }
  };
  const surAnat = (action, fn, delai = 60000) => sur(action, async p => { const r = await salleAnat(); if (r.erreur) return { ok: false, erreur: r.erreur }; return fn(r.a, p || {}); }, delai);
  surAnat('afficher_systeme', async (a, { systeme }) => {
    const sys = SYSTEMES[systeme]; if (!sys) return { ok: false, erreur: 'système inconnu : ' + systeme };
    const r = await a.afficherSysteme(sys); return r.ok ? { ok: true, texte: 'Voici ' + (NOMS_SYS[sys] || sys) + ' sur la table holographique.' } : { ok: false, erreur: r.erreur };
  });
  surAnat('decrire', async (a, { nom }) => { const r = await a.decrire(nom); return r.ok ? { ok: true, texte: r.texte } : { ok: false, erreur: r.erreur }; });
  surAnat('anatomie_montrer', async (a, { nom }) => { const t = a.index.resoudre(nom); if (!t.length) return { ok: false, erreur: 'je ne trouve pas « ' + nom + ' » dans le modèle' }; await a.selectionner(t); return { ok: true, texte: 'Voici ' + a.index.libelle(t[0], 'fr') + (t.length > 1 ? ' et son symétrique' : '') + '.' }; });
  surAnat('anatomie_isoler', async (a, { nom }) => { const t = a.index.resoudre(nom); if (!t.length) return { ok: false, erreur: 'je ne trouve pas « ' + nom + ' » dans le modèle' }; await a.selectionner(t); a.isoler(true); return { ok: true, texte: a.index.libelle(t[0], 'fr') + ' est isolé. Dis « affiche tout » pour revenir.' }; });
  surAnat('anatomie_comparer', async (a, { nom }) => { const t = a.index.resoudre(nom)[0]; if (!t) return { ok: false, erreur: 'je ne trouve pas « ' + nom + ' » dans le modèle' }; const r = await a.comparer(t); return r.ok ? { ok: true, texte: r.texte + '. Mesures indicatives du modèle.' } : { ok: false, erreur: r.erreur }; });
  surAnat('anatomie_couches', async (a, { niveau }) => { const n = a.couches(niveau === 'profonde' ? 3 : niveau === 'intermediaire' ? 2 : 1); await a.afficherSysteme('muscles'); a.couches(n); return { ok: true, texte: ['Tous les muscles sont affichés.', 'La couche superficielle est retirée : couches intermédiaire et profonde.', 'Seule la couche profonde reste affichée.'][n - 1] + ' Les couches sont estimées par la géométrie du modèle.' }; });
  surAnat('anatomie_flux', async (a, { etat }) => { await a.afficherSysteme('arteres'); await a.afficherSysteme('veines'); await a.afficherSysteme('coeur'); if (etat !== 'non') a.masquerSysteme('muscles'); const on = a.flux(etat !== 'non'); return { ok: true, texte: on ? 'Animation de la circulation : les artères partent du cœur, les veines y reviennent, le cœur bat. C’est une illustration : la vitesse n’est pas mesurée.' : 'Animation arrêtée.' }; });
  surAnat('animer', async (a, { mouvement }) => {
    const r = await a.orchestre.lancerMouvement(mouvement); if (!r.ok) return { ok: false, erreur: r.erreur + ' : essaie la marche, le squat, la flexion du genou, l’abduction de l’épaule…' };
    return { ok: true, texte: r.texte };
  });
  surAnat('anatomie_mouvement_stop', async a => { const mv = a.mouvementObjet(); const fait = mv && a.orchestre.arreter(); return { ok: true, texte: fait ? 'Mouvement arrêté, le squelette reprend sa pose.' : 'Aucun mouvement en cours.' }; });
  surAnat('afficher_pathologie', async (a, { nom }) => {
    const deg = String(nom).match(/(\d{1,2}) ?(?:degres?|degrés?|°)/i), cote = /gauche/i.test(nom) ? 'gauche' : 'droit';
    const r = await a.orchestre.lancerPathologie(String(nom).replace(/ de \d{1,2} ?(?:degres?|degrés?|°)/i, ''), { valeur: deg ? +deg[1] : undefined, cote }); if (!r.ok) return { ok: false, erreur: r.erreur + ' : essaie une scoliose, une amputation transtibiale, une fracture du col du fémur, un genu valgum, un pied tombant…' };
    return { ok: true, texte: r.texte };
  });
  surAnat('anatomie_pathologie_stop', async a => { const p = a.pathologiesObjet(); const fait = p && a.orchestre.arreter(); return { ok: true, texte: fait ? 'Le squelette retrouve son état normal.' : 'Aucune pathologie affichée.' }; });
  surAnat('anatomie_cotation', async a => ({ ok: true, texte: a.echelle().texte }));
  surAnat('anatomie_tout', async a => { a.toutAfficher(); return { ok: true, texte: 'Tout est réaffiché.' }; });
  surAnat('anatomie_coupe', async (a, { plan }) => { if (plan === 'aucune') { a.couper(null); return { ok: true, texte: 'Plan de coupe retiré.' }; } a.couper(plan, 0); return { ok: true, texte: 'Plan de coupe ' + ({ x: 'sagittal', y: 'transversal', z: 'frontal' }[plan]) + ' : le curseur Coupe le déplace.' }; });
  surAnat('anatomie_noms', async (a, { langue }) => { a.langue(langue); return { ok: true, texte: { fr: 'Noms en français.', la: 'Noms en latin.', 'fr+la': 'Noms en français et en latin.' }[langue] || 'Noms changés.' }; });
  surAnat('anatomie_transparence', async (a, { etat }) => { if (etat === 'oui' && !a.etat.selection.length) return { ok: false, erreur: 'sélectionne d’abord une structure' }; a.transparence(etat === 'oui' ? 0.15 : 1); return { ok: true, texte: etat === 'oui' ? 'Les autres structures sont transparentes.' : 'Transparence retirée.' }; });
  // arrivée : Raylé l'annonce de vive voix
  window.addEventListener('saturne:arrive', e => { const id = e.detail && e.detail.id; try { if (typeof speak === 'function') speak('Nous voici en orbite de ' + (NOMS[id] || id) + '.'); } catch (x) { /* voix indisponible */ } });
}
