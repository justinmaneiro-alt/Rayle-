/* ═════════════ ORDRES DE MARS (bus d'ordres) ═════════════
   Déclarés dans planetes/mars/manifeste.json, branchés ici dès l'ouverture de la galaxie (petit fichier : la planète elle-même, lourde, ne se charge qu'au premier clic).
   « entre dans la base » : ouvre la galaxie, vole jusqu'à Mars, entre en orbite, puis dans le salon. « sors de la base » : retour à l'orbite. */
const pause = ms => new Promise(r => setTimeout(r, ms));
async function attendre(cond, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (cond()) return true; await pause(120); } return false; }

export function brancher({ O, galaxie, ouvrirGalaxie }) {
  const mars = () => window.Mars || null;
  const enOrbite = () => { const m = mars(); const e = m && m.etat(); return !!(e && e.actif && !e.transition); };
  /* Amène l'utilisateur en orbite de Mars (galaxie ouverte, vol, module chargé). */
  async function versMars() {
    await ouvrirGalaxie();
    if (enOrbite()) return true;
    galaxie.nav.allerA('mars', { entrer: true });
    return attendre(enOrbite, 30000);
  }
  const sur = (action, fn, delai = 45000) => { try { O.enregistrer('mars', action, fn, { delai }); } catch (e) { /* ordre non déclaré par le manifeste : ignoré */ } };

  sur('entrer_base', async () => {
    if (!(await versMars())) return { ok: false, erreur: 'Mars n’a pas pu s’ouvrir' };
    const e = mars().etat();
    if (e.mode === 'interieur') return { ok: true, texte: 'Je suis déjà dans la base.' };
    return (await mars().entrerBase()) ? { ok: true, texte: 'Voici la base martienne : le salon du terminal de trading.' } : { ok: false, erreur: 'l’entrée dans la base a été interrompue' };
  });
  sur('sortir_base', async () => {
    const m = mars(), e = m && m.etat();
    if (!e || !e.actif || e.mode !== 'interieur') return { ok: true, texte: 'Je ne suis pas dans la base.' };
    return (await m.sortirBase()) ? { ok: true, texte: 'Me voici de nouveau en orbite de Mars.' } : { ok: false, erreur: 'la sortie a été interrompue' };
  });
  sur('visiter_bureau', async () => {
    if (!(await versMars())) return { ok: false, erreur: 'Mars n’a pas pu s’ouvrir' };
    const r = mars().choisirZone('bureau');
    return { ok: !!r.ok, texte: 'Le bureau arrive bientôt : il accueillera les agents de trading. Pour l’instant, seul le terminal est aménagé.' };
  });
  /* Entre dans la base si besoin (galaxie, vol, orbite, salon). */
  async function dansLaBase() {
    if (!(await versMars())) return { ok: false, erreur: 'Mars n’a pas pu s’ouvrir' };
    if (mars().etat().mode !== 'interieur' && !(await mars().entrerBase())) return { ok: false, erreur: 'l’entrée dans la base a été interrompue' };
    return { ok: true };
  }
  const afficher = async (demande, phrase) => {
    const r0 = await dansLaBase(); if (!r0.ok) return r0;
    const r = await mars().afficherGraphique(demande);
    return r.ok ? { ok: true, texte: phrase(r.libelle) } : { ok: false, erreur: r.erreur };
  };
  sur('afficher_graphique', ({ instrument, unite }) => afficher({ instrument, unite }, l => 'Voici ' + l + '.'), 60000);
  sur('changer_actif', ({ actif }) => afficher({ instrument: actif }, l => 'Voici ' + l + '.'), 60000);
  sur('choisir_source', ({ source }) => afficher({ source }, l => 'Voici ' + l + '.'), 60000);
  sur('changer_unite', ({ unite }) => afficher({ unite }, l => 'Graphique en ' + l + '.'), 60000);
  sur('ouvrir_fenetre', async ({ fenetre }) => {
    if (fenetre === 'analyse') return { ok: false, erreur: 'l’analyse fondamentale par agent arrive à une étape suivante : rien d’inventé en attendant' };
    const r0 = await dansLaBase(); if (!r0.ok) return r0;
    const FINANCE = { cot: 'COT de la CFTC', calendrier: 'calendrier économique', actus: 'actualités financières', banques: 'banques centrales', taux: 'taux et inflation', heatmap: 'Nasdaq 100', publications: 'publications publiques', alertes: 'alertes du Veilleur' };
    if (FINANCE[fenetre]) { const E = await import('./trading/fenetre.js'); await E.ouvrirEspace({ dock: fenetre, focus: fenetre }); return { ok: true, texte: 'Voici ' + (fenetre === 'calendrier' ? 'le ' : fenetre === 'taux' ? 'les ' : fenetre === 'alertes' || fenetre === 'actus' || fenetre === 'banques' || fenetre === 'publications' ? 'les ' : 'le ') + FINANCE[fenetre] + '.' }; }
    if (['agent', 'gardien', 'tilt', 'journal', 'simulation', 'regime', 'capture', 'sante'].includes(fenetre)) {           // M6 : le poste de pilotage de l'agent, ouvert directement sur l'onglet voulu
      const P = await import('./trading/fenetre-agent.js'); await P.ouvrirPoste({ onglet: fenetre === 'agent' ? 'ensemble' : fenetre });
      return { ok: true, texte: 'Voici ' + ({ agent: 'le poste de pilotage de l’agent', gardien: 'le gardien prop', tilt: 'le détecteur de tilt', journal: 'ton journal de trades', simulation: 'la simulation de l’évaluation', regime: 'le régime de marché', capture: 'la lecture de capture d’écran', sante: 'la santé de l’agent' }[fenetre]) + '.' };
    }
    if (fenetre === 'agent_btc') { const P = await import('./trading/fenetre-agent.js'); await P.ouvrirPoste({}); return { ok: true, texte: 'Voici le poste de pilotage de l’agent Bitcoin.' }; }
    const cible = { dashboard: 'dashboard', contexte: 'contexte' }[fenetre] || 'graphique-us100';
    mars().ouvrirFenetre(cible);
    return { ok: true, texte: { dashboard: 'Voici le dashboard analytique.', contexte: 'Voici le contexte de marché : volatilité, dollar, taux et grandes valeurs.', agent_btc: 'Voici l’agent Bitcoin.' }[fenetre] || 'Voici le terminal.' };
  }, 60000);
  sur('agent_expliquer', async ({ sujet }) => { const A = await import('./trading/session-agent.js'); return { ok: true, texte: await A.expliquerAgent(sujet) }; }, 60000);
  sur('agent_recherche', async () => { const A = await import('./trading/session-agent.js'); return { ok: true, texte: await A.lancerRechercheAgent() }; }, 60000);
  sur('analyser', async () => ({ ok: false, erreur: 'l’agent d’analyse arrive à l’étape M4 ; pour l’instant le résumé du marché est calculé dans le terminal, sans IA' }));
  import('./trading/chart-api.js').then(M => M.brancherOrdresGraphique(sur)).catch(() => { /* API du graphique indisponible : ces ordres répondent « pas encore disponible » */ });      // M6 : lire / tracer / tester une zone / expliquer une bougie / rejouer
  import('./trading/rapports-agent.js').then(M => M.brancherOrdresRapports(sur)).catch(() => { /* rapports de l'agent : idem */ });
  sur('regler_heure', async ({ heure }) => {
    const m = mars(); if (!m || !m.etat().actif) return { ok: false, erreur: 'Mars n’est pas ouverte' };
    m.definirHeure(heure); m.auto(false);
    return { ok: true, texte: 'Il est ' + String(Math.floor(((heure % 24) + 24) % 24)).padStart(2, '0') + ' heures sur Mars.' };
  }, 10000);
}
