import { pathToFileURL, fileURLToPath } from 'node:url';

/* « Agent » LOCAL de démonstration (aucune IA, aucune clé) : quelques règles simples choisissent le VRAI outil de la Terre du Worker (afficher_terre, aller_a,
   afficher_actualites, expliquer_actualite, meteo) selon la phrase, l'exécutent avec les vraies données (vrais flux, vraie météo), puis composent une réponse
   à partir des titres reçus : « [1] D'après <média>, <titre>. » — rien d'autre n'est dit. En ligne, c'est l'IA du Worker qui choisit et formule ; ici c'est une SIMULATION,
   sa seule utilité est de montrer le résultat à l'écran (balises, caméra, voix) sans déployer le Worker. Aucune formulation n'est devinée : phrase non reconnue → réponse neutre. */
const RACINE = fileURLToPath(new URL('../worker/src/', import.meta.url));
const norm = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, ' ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
let FIL = null;
const fil = async () => FIL || (FIL = await import(pathToFileURL(RACINE + 'terre/fil.js').href));
let OUTILS_T = null;
const outilsTerre = async () => OUTILS_T || (OUTILS_T = await import(pathToFileURL(RACINE + 'terre/outils.js').href));

async function lancer(OUT, nom, args, ctx, env = {}) {
  const s = { actions: [], canal: '' };
  try { const texte = await OUT.get(nom).executer(env, ctx, args, s); return { ok: true, texte, s }; }
  catch (e) { return { ok: false, erreur: String(e && e.message || e), s }; }
}
const dit = (reply, essais, s, nom, ok) => ({ reply, actions: s ? s.actions : [], outils: [{ nom, ok }], engine: 'Agent local de démonstration (sans IA)', model: 'règles simples · vrais outils', essais });

export async function agentLocal(texte, OUT, ctx, env = {}) {
  const n = norm(texte), T = await outilsTerre();
  const apres = re => { const m = n.match(re); return m ? m[1].trim() : ''; };
  // météo
  if (/\bmeteo\b|quel temps|il fait (quel )?temps|pleut|pluie/.test(n)) {
    const lieu = apres(/(?:a|au|aux|en|de|pour|sur) ([a-z0-9 ]+)$/) || apres(/meteo ([a-z0-9 ]+)$/);
    if (!lieu) return { reply: 'Pour quel lieu ?', actions: [], outils: [] };
    const r = await lancer(OUT, 'meteo', { lieu }, ctx, env);
    if (!r.ok) return dit('Je n’ai pas pu avoir la météo : ' + r.erreur + '.', [], null, 'meteo', false);
    const m = r.texte.match(/MÉTÉO RÉELLE .*? : (\d[^\n]*?)\. Prévisions/);
    return dit('Voici la météo réelle de ' + lieu + ' : ' + (m ? m[1] : 'valeurs affichées dans la fenêtre') + '.', [], r.s, 'meteo', true);
  }
  // expliquer un sujet
  if (/^explique|^peux tu m expliquer|^dis m en plus/.test(n)) {
    const el = n.replace(/^(explique moi|explique|peux tu m expliquer|dis m en plus sur|dis m en plus)\s*/, '');
    const r = await lancer(OUT, 'expliquer_actualite', { element: el }, ctx, env);
    if (!r.ok || /AUCUN sujet/.test(r.texte)) return dit('Je ne trouve aucun sujet qui corresponde dans l’actualité du moment.', [], null, 'expliquer_actualite', false);
    const a = r.s.actions[0].donnees[0];
    return dit('D’après ' + a.sources[0].nom + ', ' + a.titre.replace(/[.!?]+$/, '') + '. ' + (a.importance > 1 ? 'Le sujet est repris par ' + a.importance + ' médias. ' : '') + 'Les titres ne donnent pas plus de détails.', [], r.s, 'expliquer_actualite', true);
  }
  // actualités
  if (/actualit|\bnews\b|se passe|quoi de neuf|les infos|dernieres nouvelles/.test(n)) {
    const F = await fil();
    let args = { portee: 'france' };
    if (/monde|mondial|international/.test(n)) args = { portee: 'monde' };
    else {
      const reg = F.regionDemandee(n.replace(/^.*(?:dans |en |au |a )/, ''));
      if (reg) args = { portee: 'france', region: reg.nom };
      else if (!/\bfrance\b|francais/.test(n)) {
        const lieu = apres(/(?:au|aux|en|a|dans|de|pour) ([a-z0-9 ]+?)(?: aujourd hui| maintenant| en ce moment)?$/);
        const code = lieu && T.codePays(lieu);
        if (code) args = { portee: 'pays', pays: lieu };
      }
    }
    const theme = apres(/sur (?:la |le |les |l )?([a-z0-9 ]+)$/); if (theme && !/monde|france/.test(theme)) args.sujet = theme;
    const r = await lancer(OUT, 'afficher_actualites', args, ctx, env);
    if (!r.ok) return dit('Je n’ai pas pu lire l’actualité : ' + r.erreur + '.', [], null, 'afficher_actualites', false);
    const a = r.s.actions[0], d = a.donnees;
    if (!d.length) return dit('Aucun sujet ne correspond pour le moment.', [], r.s, 'afficher_actualites', true);
    const zone = a.vue ? a.vue.nom : 'le monde';
    const lignes = d.slice(0, 5).map((x, i) => '[' + (i + 1) + '] D’après ' + x.sources[0].nom + ', ' + x.titre.replace(/[.!?]+$/, '') + '.' + (x.importance > 1 ? ' Le sujet est repris par ' + x.importance + ' médias.' : ' Un seul média en parle pour le moment.') + (x.lieu && x.lieu.estime ? ' Le lieu est estimé d’après le titre.' : ''));
    return dit('Voici l’actualité, ' + zone + '. ' + lignes.join(' ') + ' Tout est affiché sur la Terre.', [], r.s, 'afficher_actualites', true);
  }
  // aller quelque part / montrer la Terre
  if (/\b(terre|planete bleue)\b/.test(n) && /montre|affiche|va |vas |emmene|ouvre/.test(n)) {
    const r = await lancer(OUT, 'afficher_terre', {}, ctx, env); return dit('Voici la Terre.', [], r.s, 'afficher_terre', r.ok);
  }
  if (/^(va|vas|emmene moi|montre moi|aller) (a |au |aux |en |sur |vers )?([a-z0-9 ]+)$/.test(n)) {
    const lieu = n.replace(/^(va|vas|emmene moi|montre moi|aller) (a |au |aux |en |sur |vers )?/, '');
    const r = await lancer(OUT, 'aller_a', { lieu }, ctx, env);
    return r.ok ? dit('En route vers ' + lieu + '.', [], r.s, 'aller_a', true) : dit('Je ne trouve pas ce lieu.', [], null, 'aller_a', false);
  }
  return { reply: 'Agent local de démonstration : je ne comprends que « montre-moi la Terre », « l’actualité en France / dans le monde / au Japon / dans le Sud-Ouest », « explique-moi … », « la météo à … » et « va à … ». En ligne, l’IA du Worker comprend toutes les formulations.', actions: [], outils: [], engine: 'Agent local de démonstration (sans IA)' };
}
