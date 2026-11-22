/* ═════════════ MOTEUR DE VISITE GUIDÉE (v11, phase 1) : lit un rapport étape par étape, synchronisé avec la voix ═════════════
   Le moteur ne touche NI le DOM NI le réseau : tout passe par `env` (testé dans trader-pro/tests/moteur-test.mjs avec une fausse voix et un faux écran ; branché au vrai écran dans lecteur.js).
   env = {
     src                       données (voir construire.js)
     store                     stockage (getItem/setItem/removeItem) pour l'historique des rapports
     maintenant()              horloge
     quota()                   compteur Azure du mois ({ mois, n, limite }) ou null
     parler(texte, { surProgression(f), vitesse }) → Promise<{ interrompu }>   UNE requête de voix par étape ; f = fraction lue (0 à 1) ; interrompu = quelqu'un d'autre a pris la parole
     pauseVoix() / reprendreVoix() / arreterVoix() / voixLibre()→Promise    contrôle de la voix unique
     prechauffer(texte)        prépare la voix de l'étape suivante (cache), sans la jouer
     ecran = { prep, etape, segment, page, enrichi, pause, fin, fermer, message, graphique }   tout est facultatif et sans effet de bord sur les données
     reglages = { ecoute, pageMax, prepMin, delaiEtape }                    durées en ms
   }
   Garde-fous : une étape sans donnée est annoncée en une phrase puis on passe ; les marques de Rayle restent dans leur couche ; aucune donnée n'est modifiée. */
import { creerRapport, demandeRapport, COUT_MOYEN_ETAPE, TYPES } from './construire.js';
import * as H from './historique.js';

const ATT = ms => new Promise(r => setTimeout(r, ms));
const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'`]/g, ' ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
export const SILENCE = '✔';   // « commande traitée, rien à dire » : Application.commande renvoie une chaîne non vide ; clean() retire ce symbole, donc speak() ne dit rien et le journal affiche juste ✔
export const VITESSES = [0.9, 1, 1.15, 1.3];
export const REGLAGES = { ecoute: 400, pageMax: 500, prepMin: 1800, delaiEtape: 50000, anticipe: 5500 };   /* anticipe : la page de l'étape suivante s'ouvre pendant les 5,5 dernières secondes de l'étape en cours (le son continue de jouer pendant que la page charge : pas de blanc) */

export function commandeRapport(texte) {
  const n = norm(texte).replace(/^(hey |dis moi |dis )?(rayle |raile )/, '').trim();
  if (/^(suivant|suivante|etape suivante|passe a la suite|passe|la suite|on continue|continue|saute|saute cette etape)$/.test(n)) return 'suivant';
  if (/^(reviens|reviens en arriere|retour|precedent|precedente|etape precedente|reviens a l etape precedente|recommence l etape|reprends l etape)$/.test(n)) return 'precedent';
  if (/^(pause|mets toi en pause|mets en pause|mets le rapport en pause|attends|une seconde|un instant)$/.test(n)) return 'pause';
  if (/^(reprends|reprend|reprendre|reprends le rapport|vas y|poursuis|continue le rapport|on reprend)$/.test(n)) return 'reprendre';
  if (/^(stop|arrete|arrete toi|arrete le rapport|stoppe|termine|termine le rapport|c est bon|ca suffit|annule|annule le rapport|ferme le rapport)$/.test(n)) return 'stop';
  if (/(detaille|plus de details|developpe|explique (ca|plus|mieux)|vas y plus loin|approfondis)/.test(n) && n.split(' ').length <= 7) return 'detail';
  if (/(montre( moi)?( ca)? sur le graphique|sur le graphique|remets le graphique|montre le graphique)/.test(n) && n.split(' ').length <= 8) return 'graphique';
  if (/^(plus vite|accelere|va plus vite)$/.test(n)) return 'plus-vite';
  if (/^(plus lentement|ralentis|va plus lentement|plus doucement)$/.test(n)) return 'plus-lent';
  return null;
}

export function creerMoteur(env) {
  const R = { ...REGLAGES, ...(env.reglages || {}) }, E = () => env.ecran || {}, now = () => (env.maintenant ? env.maintenant() : Date.now());
  const appel = (nom, ...a) => { try { const f = E()[nom]; return f ? f(...a) : undefined; } catch (e) { return undefined; } };
  let run = null, seq = 0, dernier = null;
  const vide = () => ({ dummy: 0 });
  void vide;

  const actif = () => !!run && !run.fin;
  const histoire = () => H.lire(env.store);

  function budget(rapport) { const est = rapport.estimation; return H.phraseBudget(est, env.quota ? env.quota() : null, now()); }

  /* ───── préparation d'une étape (données lues pendant que l'étape précédente est dite) ───── */
  function pret(r, i) {
    if (!r.pret[i]) {
      const def = r.rapport.etapes[i], t0 = now();
      r.pret[i] = (async () => {
        let s; try { s = await Promise.race([def.faire(), ATT(R.delaiEtape).then(() => { throw new Error('délai dépassé (' + Math.round(R.delaiEtape / 1000) + ' s)'); })]); }
        catch (e) { const why = 'lecture impossible (' + String((e && e.message) || e).slice(0, 90) + ').'; s = { ok: false, passer: true, id: def.id, chapitre: def.chapitre, titre: def.chapitre, page: null, segments: [{ texte: def.chapitre + ' : ' + why + ' Je passe à la suite.' }], texte: def.chapitre + ' : ' + why + ' Je passe à la suite.', caracteres: 0, detail: '', annotations: [], carte: { titre: def.chapitre, lignes: [{ label: 'Donnée manquante', val: why, ton: 'bas' }] }, manque: why }; s.caracteres = s.texte.length; }
        s.prepareMs = now() - t0; r.preps.push({ id: def.id, ms: s.prepareMs, attendu: r.i });
        return s;
      })();
    }
    return r.pret[i];
  }

  /* ───── lecture d'une étape ───── */
  async function lireEtape(r, i, step, mode) {
    r.i = i; r.etapeCourante = step; r.mode = mode; appel('etape', step, i, r.rapport.nbEtapes, mode);
    const tEtape = now();
    const ant = r.anticipee && r.anticipee.i === i && r.anticipee.p ? r.anticipee.p : null; r.anticipee = null;
    const pageP = step.passer ? Promise.resolve() : ant || Promise.resolve(appel('page', step)).catch(() => {});
    r.pageP = pageP; await Promise.race([pageP, ATT(R.pageMax)]);
    if (step.annotations && step.annotations.length && !step.passer && env.annoter) pageP.then(() => env.annoter(step.annotations)).catch(() => {});   /* en arrière-plan : les marques de Rayle se posent dès que le graphique est prêt, sans retarder la voix */
    if (r.fin || r.go != null) return { type: r.fin ? 'fin' : 'saut' };
    while (r.paused && !r.fin && r.go == null) await ATT(60);
    if (r.fin || r.go != null) return { type: r.fin ? 'fin' : 'saut' };
    /* suite en direct (ex. carnet et footprint du terminal Volume) : lue APRÈS le texte principal, une fois la page ouverte ; préparée pendant que le texte principal est dit, donc sans blanc */
    const suiteP = mode === 'normal' && step.suite && !step.passer ? pageP.then(() => Promise.race([step.suite(), ATT(8000).then(() => null)])).catch(() => null) : null;
    const texte = mode === 'detail' ? (step.detail || 'Je n’ai pas de détail de plus sur cette étape.') : step.texte;
    const segs = mode === 'detail' ? [{ texte }] : step.segments, tot = Math.max(1, segs.reduce((s, x) => s + x.texte.length + 1, 0)), debuts = []; let cum = 0; for (const s of segs) { debuts.push(cum / tot); cum += s.texte.length + 1; }
    let k = -1; const montrer = j => { if (j > k) { for (let q = k + 1; q <= j; q++) appel('segment', step, q, mode); k = j; } };
    if (env.voixLibre) await Promise.race([env.voixLibre(), ATT(5000)]);
    if (r.fin || r.go != null) return { type: r.fin ? 'fin' : 'saut' };
    montrer(0); r.tDebutParole = now(); if (r.finPrecedente != null && mode === 'normal') r.ecarts.push(r.tDebutParole - r.finPrecedente);   /* le vrai blanc : de la fin de la voix précédente au début de la suivante */
    const res = await env.parler(texte, { vitesse: r.vitesse, surProgression: (f, restantMs) => { let j = k; while (j + 1 < debuts.length && f >= debuts[j + 1]) j++; if (j > k) montrer(j); if (mode === 'normal' && restantMs != null && restantMs <= R.anticipe && !r.anticipee) anticiper(r, i); } });
    if (suiteP && !r.fin && r.go == null && !(res && res.interrompu)) { const x = await suiteP; if (x && x.texte && !r.fin && r.go == null) { appel('enrichi', step, x); r.chars += x.texte.length; const res2 = await env.parler(x.texte, { vitesse: r.vitesse, surProgression: () => {} }); if (res2 && res2.interrompu) res.interrompu = true; } }
    r.chars += texte.length; r.lues.push({ i, id: step.id, mode, chars: texte.length, ms: now() - tEtape }); r.finPrecedente = now();
    if (r.fin) return { type: 'fin' };
    if (r.go != null) return { type: 'saut' };
    if (res && res.interrompu) return { type: 'pause-externe' };
    montrer(segs.length - 1);
    return { type: 'ok' };
  }

  /* ouvre la page de l'étape suivante pendant la fin de l'étape en cours (si ses données sont déjà prêtes) */
  function anticiper(r, i) {
    if (r.anticipee || i + 1 >= r.rapport.nbEtapes || r.fin || r.go != null) return; const cible = r.anticipee = { i: i + 1, p: null };
    pret(r, i + 1).then(s => { if (r.anticipee === cible && !s.passer && !r.fin && r.go == null && !r.paused) cible.p = Promise.resolve(appel('page', s)).catch(() => {}); });
  }

  async function attendreReprise(r) { r.paused = true; appel('pause', true, true); while (r.paused && !r.fin && r.go == null) await ATT(80); appel('pause', false); }

  async function boucle(r) {
    const n = r.rapport.nbEtapes; let i = 0, mode = 'normal';
    try {
      while (i < n && !r.fin) {
        const attente = setTimeout(() => { if (!r.fin) appel('message', 'Lecture des données de l’étape…'); }, 1500); const step = await pret(r, i); clearTimeout(attente); if (r.fin) break;
        if (i + 1 < n) pret(r, i + 1).then(s2 => { if (!r.fin && !s2.passer && env.prechauffer && mode === 'normal') { try { env.prechauffer(s2.texte); } catch (e) { /* le préchauffage est facultatif */ } } });   /* la voix de l'étape suivante est préparée (copie en cache) pendant que celle-ci est dite */
        const issue = await lireEtape(r, i, step, mode);
        if (r.fin) break;
        if (issue.type === 'saut') { const g = r.go; r.go = null; r.finPrecedente = now(); if (g.detail) { mode = 'detail'; i = g.i; } else { mode = 'normal'; i = g.i; } continue; }
        if (issue.type === 'pause-externe') { await attendreReprise(r); r.finPrecedente = now(); mode = 'normal'; continue; }
        if (mode === 'detail') { mode = 'normal'; }
        i++;
        if (i < n && R.ecoute) await ATT(R.ecoute);   // petite fenêtre d'écoute entre deux étapes : une commande vocale peut passer
      }
    } catch (e) { r.erreur = String((e && e.message) || e); }
    await terminer(r, r.fin ? r.fin : 'fini');
  }

  async function terminer(r, raison) {
    if (r.termine) return; r.termine = true; const etapes = [];
    for (let i = 0; i < r.rapport.nbEtapes; i++) if (r.pret[i] && r.lues.some(l => l.i === i)) { try { etapes.push(await r.pret[i]); } catch (e) { /* étape non lue */ } }
    const entree = etapes.length >= (raison === 'fini' ? 1 : 2) ? H.creerEntree({ type: r.rapport.type, actif: r.rapport.actif, titre: r.rapport.titre + (raison === 'fini' ? '' : ' (arrêté)'), etapes, caracteres: r.chars, maintenant: now() }) : null;
    let comparaison = null;
    if (entree) { const prev = H.dernierDuMemeSujet(histoire(), { type: r.rapport.type, actif: r.rapport.actif }, entree.date); comparaison = H.comparer(prev, entree); entree.comparaison = comparaison.disponible ? comparaison.phrase : null; }
    r.fin = r.fin || 'fini';
    if (raison === 'fini' && comparaison && comparaison.disponible) {   // la comparaison avec le rapport précédent est dite à la fin (une phrase dense)
      const t = 'Par rapport au rapport précédent : ' + comparaison.phrases.slice(0, 3).join(' ').slice(0, 420); r.fin = null; r.chars += t.length; try { appel('etape', { id: 'comparaison', chapitre: 'Comparaison', titre: 'Depuis le rapport précédent', segments: [{ texte: t }], texte: t, carte: { titre: 'Depuis le rapport précédent', lignes: comparaison.phrases.map(p => ({ label: '', val: p, ton: '' })) }, donneesDu: null }, r.rapport.nbEtapes, r.rapport.nbEtapes, 'normal'); await env.parler(t, { vitesse: r.vitesse, surProgression: () => {} }); } catch (e) { /* la comparaison reste à l'écran */ } r.fin = 'fini';
    }
    if (entree) { entree.caracteres = r.chars; H.enregistrer(env.store, entree); }
    dernier = { preps: r.preps.slice(), id: r.id, type: r.rapport.type, raison, entree, comparaison, caracteres: r.chars, ecarts: r.ecarts.slice(), lues: r.lues.slice(), erreur: r.erreur || null, manques: etapes.filter(e => e.manque).map(e => e.titre + ' : ' + e.manque) };
    appel(raison === 'fini' ? 'fin' : 'fermer', dernier);
    if (run === r) { /* on garde `run` pour etat() jusqu'au prochain lancement */ }
  }

  /* ───── lancement ───── */
  async function lancer({ type, actif: a, parDefaut } = {}) {
    if (!TYPES[type]) return { ok: false, raison: 'type de rapport inconnu : ' + type };
    if (run && !run.fin) await arreter('remplace');
    let rapport; try { rapport = creerRapport(type, { actif: a || 'or' }, env.src); } catch (e) { return { ok: false, raison: String((e && e.message) || e) }; }
    const r = run = { id: ++seq, rapport, pret: [], i: 0, paused: false, fin: null, go: null, vitesse: 1, chars: 0, lues: [], ecarts: [], preps: [], finPrecedente: null, termine: false };
    const b = budget(rapport); r.budget = b; appel('prep', rapport, b); try { if (rapport.prechauffer) rapport.prechauffer(); } catch (e) { /* les étapes liront seules */ }
    const p0 = pret(r, 0), minimum = ATT(R.prepMin);
    /* les données de TOUTES les étapes sont préparées en arrière-plan, une à la fois dans l'ordre (un seul calcul lourd à la fois) : quand l'étape arrive, elle est prête */
    r.fond = (async () => { for (let k = 1; k < rapport.nbEtapes && !r.fin; k++) { await pret(r, k).catch(() => {}); } })();
    r.promesse = (async () => { await Promise.all([minimum, p0.catch(() => {})]); if (!r.fin) await boucle(r); })();
    r.promesse.catch(() => {});
    return { ok: true, type, actif: rapport.actif, titre: rapport.titre, etapes: rapport.nbEtapes, estimation: rapport.estimation, budget: b };
  }

  /* ───── commandes ───── */
  async function arreter(raison = 'stop') { const r = run; if (!r || r.fin) return false; r.fin = raison === 'remplace' ? 'remplace' : 'stop'; r.paused = false; try { env.arreterVoix && env.arreterVoix(); } catch (e) { /* */ } await Promise.race([r.promesse || Promise.resolve(), ATT(4000)]); return true; }
  function aller(delta) { const r = run; if (!r || r.fin) return false; const i = Math.max(0, Math.min(r.rapport.nbEtapes - 1, r.i + delta)); if (delta > 0 && r.i >= r.rapport.nbEtapes - 1) { return arreterFini(r); } r.go = { i }; r.paused = false; appel('pause', false); try { env.arreterVoix && env.arreterVoix(); } catch (e) { /* */ } return true; }
  function arreterFini(r) { r.fin = 'fini'; try { env.arreterVoix && env.arreterVoix(); } catch (e) { /* */ } return true; }
  function pause() { const r = run; if (!r || r.fin || r.paused) return false; r.paused = true; try { env.pauseVoix && env.pauseVoix(); } catch (e) { /* */ } appel('pause', true); return true; }
  function reprendre() { const r = run; if (!r || r.fin || !r.paused) return false; r.paused = false; try { env.reprendreVoix && env.reprendreVoix(); } catch (e) { /* */ } appel('pause', false); return true; }
  function detail() { const r = run; if (!r || r.fin) return false; r.go = { i: r.i, detail: true }; r.paused = false; try { env.arreterVoix && env.arreterVoix(); } catch (e) { /* */ } return true; }
  function graphique() { const r = run; if (!r || r.fin || !r.etapeCourante) return false; appel('graphique', r.etapeCourante); return true; }
  function vitesse(d) { const r = run; if (!r || r.fin) return null; const k = Math.max(0, Math.min(VITESSES.length - 1, VITESSES.indexOf(r.vitesse) + d)); r.vitesse = VITESSES[k]; if (env.vitesse) env.vitesse(r.vitesse); appel('message', 'Vitesse ×' + r.vitesse); return r.vitesse; }

  /* Entrée vocale : renvoie SILENCE (traitée), une phrase à dire, ou null (pas pour nous). Pendant un rapport, toute AUTRE demande met le rapport en pause (la voix est unique) : « reprends » le relance. */
  function commande(texte) {
    if (actif()) {
      const c = commandeRapport(texte);
      if (c === 'suivant') { aller(+1); return SILENCE; } if (c === 'precedent') { aller(-1); return SILENCE; }
      if (c === 'pause') { pause(); return SILENCE; } if (c === 'reprendre') { if (!reprendre()) return null; return SILENCE; }
      if (c === 'stop') { arreter('stop'); return 'Rapport arrêté.'; }
      if (c === 'detail') { detail(); return SILENCE; } if (c === 'graphique') { graphique(); return SILENCE; }
      if (c === 'plus-vite') { vitesse(+1); return SILENCE; } if (c === 'plus-lent') { vitesse(-1); return SILENCE; }
      const d = demandeRapport(texte); if (d) { lancer(d); return 'Je prépare ' + (d.type === 'cot' ? 'le rapport COT' : d.type === 'marche' ? 'le rapport sur le marché' : d.type === 'macro' ? 'le rapport macro' : 'le rapport complet') + '.'; }
      if (norm(texte).split(' ').length >= 2) pause();   // une question ou une autre demande : le rapport attend, la réponse passe
      return null;
    }
    const d = demandeRapport(texte);
    if (d) { lancer(d); return d.type === 'cot' ? 'Je prépare le rapport COT' + (d.actif ? ' sur ' + ({ or: 'l’or', us100: 'le Nasdaq', us500: 'le S&P 500', btc: 'le Bitcoin', sol: 'Solana', dxy: 'le dollar', eurusd: 'l’EUR/USD', petrole: 'le pétrole' }[d.actif] || d.actif) : '') + '.' : d.type === 'marche' ? 'Je prépare le rapport sur le marché.' : d.type === 'macro' ? 'Je prépare le rapport macro et calendrier.' : 'Je prépare le rapport complet sur ' + ({ or: 'l’or', us100: 'le Nasdaq', us500: 'le S&P 500', btc: 'le Bitcoin', sol: 'Solana', dxy: 'le dollar', eurusd: 'l’EUR/USD', petrole: 'le pétrole' }[d.actif] || d.actif) + '.'; }
    return null;
  }

  return {
    lancer, arreter, aller, pause, reprendre, detail, graphique, vitesse, commande, actif,
    etat: () => (run ? { actif: !run.fin, id: run.id, type: run.rapport.type, titre: run.rapport.titre, i: run.i, n: run.rapport.nbEtapes, pause: run.paused, vitesse: run.vitesse, caracteres: run.chars, fin: run.fin, estimation: run.rapport.estimation, ecarts: run.ecarts.slice(), lues: run.lues.slice() } : null),
    dernier: () => dernier, attendreFin: () => (run && run.promesse ? run.promesse : Promise.resolve()),
    historique: histoire, supprimer: id => H.supprimer(env.store, id), vider: () => H.vider(env.store),
    comparaisonDe: id => { const L = histoire(), e = L.find(x => x.id === id); return e ? H.comparer(H.dernierDuMemeSujet(L, { type: e.type, actif: e.actif }, e.date), e) : null; },
    COUT_MOYEN_ETAPE
  };
}
