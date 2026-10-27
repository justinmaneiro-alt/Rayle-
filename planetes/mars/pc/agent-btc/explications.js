import { normaliser } from '../trading/instruments.js';

/* ═════════════ EXPLICATIONS DE L'AGENT BTC (M3c ; module pur, testé : agent-explications-test.mjs) ═════════════
   Raylé explique l'agent à la voix et par écrit. Les phrases sont construites par des MODÈLES à partir des données structurées de l'agent (instantané) : aucune IA, aucun jeton, rien d'inventé :
   une donnée absente est dite absente. Une question libre (« que penses-tu de… ») n'est PAS prise ici : elle va à l'IA comme d'habitude. Réponses parlées : pas de markdown, phrases courtes. */
export const SUJETS = ['agent', 'phase', 'setup', 'backtests', 'volume_profile', 'delta', 'marche'];

/* Phrase parlée → { sujet } ou null. */
export function detecterSujet(texte) {
  const t = normaliser(texte); if (!t || t.split(' ').length > 14) return null;
  const q = /\b(?:qu est ce que|qu est ce qu|c est quoi|que veut dire|explique(?:-moi)?|expliquer|dis moi ce que|a quoi sert|comment marche|comment fonctionne|que fait|que fais)\b/.test(t) || /^qu\b/.test(t);
  if (/\b(?:volume profile|profil de volume|profile de volume)\b/.test(t) && (q || /\bquoi\b/.test(t))) return { sujet: 'volume_profile' };
  if (/\b(?:delta|cvd|volume delta)\b/.test(t) && q) return { sujet: 'delta' };
  if (/\bphase\b/.test(t) && /\b(?:quelle|quel|en quelle|dans quelle|est|actuelle|marche|bitcoin|btc)\b/.test(t)) return { sujet: 'phase' };
  if (/\b(?:resume|resumer|resultat|resultats|explique|donne|dis moi|montre|bilan)\b/.test(t) && /\bbacktests?\b/.test(t)) return { sujet: 'backtests' };
  if (/\bbacktests?\b/.test(t) && /\b(?:quoi|combien|que|quels?)\b/.test(t)) return { sujet: 'backtests' };
  if (/\bstrategie\b/.test(t) && /\b(?:rentable|valide|validee|robuste|marche|fiable)\b/.test(t) && /\b(?:agent|bitcoin|btc|la strategie)\b/.test(t)) return { sujet: 'backtests' };
  if (/\bpourquoi\b/.test(t) && /\b(?:setup|alerte|signal|trade|position)\b/.test(t)) return { sujet: 'setup' };
  if (/\b(?:y a t il|existe t il|as tu|a t il)\b/.test(t) && /\b(?:setup|alerte|signal)\b/.test(t)) return { sujet: 'setup' };
  if (/\b(?:setup|alerte)\b/.test(t) && /\b(?:en cours|actuel|actuelle|du moment|maintenant|bitcoin|btc)\b/.test(t) && !/\bprix\b/.test(t)) return { sujet: 'setup' };
  if (/\bagent\b/.test(t) && (q || /\bquoi\b/.test(t) || /\b(?:fait|fais|sert|role)\b/.test(t))) return { sujet: 'agent' };
  if (/\b(?:resume|etat|situation|analyse|lecture)\b/.test(t) && /\b(?:marche|bitcoin|btc)\b/.test(t) && /\b(?:bitcoin|btc|agent)\b/.test(t)) return { sujet: 'marche' };
  return null;
}

const nb = (x, d = 0) => (x == null || !Number.isFinite(x) ? 'inconnu' : x.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }));
const prix = x => nb(x, 0) + ' dollars';
const heure = t => { try { return new Date(t).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).replace(',', ' à').replace(':', 'h'); } catch (e) { return ''; } };
const PAS_DE_CONSEIL = ' Ce n’est pas un conseil financier, et l’agent ne passe aucun ordre.';
const ETATS = { jamais: 'aucune recherche n’a encore été lancée', en_recherche: 'une recherche est en cours', validee: 'une stratégie est validée', rejetee: 'la dernière candidate a été rejetée sur le jeu final', aucune: 'aucune stratégie robuste n’a été trouvée', attente_jeu_final: 'une candidate attend un jeu final de validation', interrompue: 'la dernière recherche a été interrompue', refus_historique: 'l’historique est trop court pour chercher' };

export function expliquer(sujet, s) {
  if (!s) return 'L’agent Bitcoin n’est pas encore démarré.';
  const L = s.lecture, strat = s.strategie, d = s.donnees;
  switch (sujet) {
    case 'agent': {
      const base = 'L’agent Bitcoin surveille le Bitcoin en quinze minutes, avec le contexte une heure et quatre heures. Il lit le marché : le volume, la direction du volume, la phase, la volatilité. Il cherche aussi seul, par règles et sans intelligence artificielle, une stratégie testée sur ' + (d.annees ? nb(d.annees, 1) + ' ans' : 'plusieurs années') + ' d’historique, avec des frais réalistes et des contrôles contre la sur-optimisation. Il vise très peu de positions de qualité, quatre à six fois le risque, au plus quelques-unes par semaine.';
      const etat = ' État actuel : ' + (ETATS[s.etatStrategie] || s.etatStrategie) + '.';
      const poss = s.etatStrategie === 'aucune' ? ' Concrètement, il n’y a donc aucune position à proposer pour l’instant.' : '';
      return base + etat + poss + PAS_DE_CONSEIL;
    }
    case 'phase': {
      if (!L || !L.ok) return L && L.raison ? L.raison : 'Je n’ai pas encore assez de bougies pour lire la phase du marché.';
      const r = L.phase, r4 = L.phaseH4;
      return 'Le Bitcoin est en phase de ' + r.phase + ' sur une heure' + (r.enChangement ? ', avec un signal brut de ' + r.brute + ' pas encore confirmé' : '') + ', et en ' + r4.phase + ' sur quatre heures. ' + r.intro + ' ' + r.raisons.slice(0, 3).join('. ') + '.';
    }
    case 'setup': {
      const st = s.setup;
      if (!st) return 'Je n’ai pas encore évalué de setup.';
      if (st.statut === 'entree') return 'Il y a un signal d’entrée ' + (st.sens > 0 ? 'à l’achat' : 'à la vente') + ', de la stratégie « ' + st.nomStrategie + ' ». Pourquoi : les conditions de cette stratégie sont réunies sur la dernière bougie fermée, dans la phase ' + (st.phase || 'inconnue') + '. Entrée vers ' + prix(st.entree) + ', stop à ' + prix(st.stop) + ', objectif à ' + prix(st.cible) + ', soit ' + st.R + ' fois le risque. Avec ' + nb(st.risquePct, 1) + ' pour cent de risque, la taille serait d’environ ' + nb(st.quantite, 4) + ' bitcoin. ' + st.invalidation + (st.validee ? '' : ' Attention : cette stratégie n’est pas validée, c’est de l’observation.') + PAS_DE_CONSEIL;
      if (st.statut === 'preparation') return 'Un setup se prépare ' + (st.sens > 0 ? 'à l’achat' : 'à la vente') + ' : ' + st.texte.replace(/^PRÉPARATION · /, '') + '. Ce n’est pas encore une entrée.';
      if (st.statut === 'bloque') return st.raison;
      return st.raison || 'Pas de setup pour l’instant.';
    }
    case 'backtests': {
      const v = s.verdict;
      if (!v) return 'Aucun backtest n’a encore été lancé. Dis « lance la recherche » ou appuie sur le bouton de l’agent.';
      if (!strat) return 'Résultat de la dernière recherche : ' + v.resume + ' ' + nb(v.nVariantes) + ' variantes ont été testées au total. Les critères d’acceptation étaient écrits avant les tests. Les résultats passés ne garantissent rien.';
      const h = strat.horsEchantillon, f = strat.jeuFinal;
      return 'Stratégie ' + (strat.validee ? 'validée' : 'rejetée') + ' : ' + strat.nom + '. Hors échantillon, sur ' + h.n + ' trades : espérance ' + nb(h.esperance, 2) + ' R par trade, facteur de profit ' + nb(h.factProfit, 2) + ', creux maximal ' + nb(h.ddR, 1) + ' R. ' + (f ? 'Sur le jeu final, ouvert une seule fois : ' + f.stats.n + ' trades, espérance ' + nb(f.stats.esperance, 2) + ' R, facteur de profit ' + nb(f.stats.factProfit, 2) + '. ' : '') + nb(v.nVariantes) + ' variantes ont été testées. Les résultats passés ne garantissent rien.';
    }
    case 'volume_profile': {
      const def = 'Le profil de volume montre à quels prix il s’est échangé le plus de volume. Le POC, point de contrôle, est le prix le plus échangé. La zone de valeur contient soixante-dix pour cent du volume. Les nœuds de volume hauts sont des prix acceptés, où le prix s’arrête souvent. Les nœuds bas sont des prix rejetés, que le prix traverse vite.';
      if (!L || !L.ok || !L.profil) return def + ' Je n’ai pas encore assez de bougies pour le calculer sur le Bitcoin.';
      return def + ' Sur les sept derniers jours en quinze minutes, le POC est à ' + prix(L.profil.poc) + ', et la zone de valeur va de ' + prix(L.profil.val) + ' à ' + prix(L.profil.vah) + '. Le prix est à ' + prix(L.prix) + '.';
    }
    case 'delta': {
      const def = 'Le delta est la différence entre le volume des acheteurs agressifs et celui des vendeurs agressifs. Le CVD est son cumul : s’il monte, les acheteurs dominent. Quand le prix monte mais que le CVD baisse, c’est une divergence.';
      if (!L || !L.ok) return def;
      return def + ' Sur vingt-quatre heures, le delta est ' + (L.direction.estime ? 'estimé à partir de la forme des bougies' : 'réel, fourni par la plateforme') + ' : ' + L.direction.lecture + '.' + (L.direction.divergence ? ' Il y a une divergence ' + L.direction.divergence + '.' : '');
    }
    case 'marche': {
      if (!L || !L.ok) return L && L.raison ? L.raison : 'Pas encore assez de bougies pour lire le marché.';
      const z = L.zones;
      return 'Bitcoin à ' + prix(L.prix) + '. Phase : ' + L.phase.phase + ' sur une heure, ' + L.phaseH4.phase + ' sur quatre heures. Volume : ' + L.volume.note + '. Direction du volume : ' + L.direction.lecture + ' (delta ' + (L.direction.estime ? 'estimé' : 'réel') + '). Volatilité : ' + L.volatilite.note + '.' + (z.dessus ? ' Prochaine zone au-dessus : ' + z.dessus.type + ' à ' + prix(z.dessus.prix) + '.' : '') + (z.dessous ? ' En dessous : ' + z.dessous.type + ' à ' + prix(z.dessous.prix) + '.' : '') + ' Données ' + (d.source || 'inconnues') + ', dernière bougie fermée à ' + heure(d.fin) + '.';
    }
    default: return null;
  }
}
