/* ═════════════ « DEMANDER AU COPILOTE » (pur, partagé PC / tablette / téléphone) ═════════════
   Répond UNIQUEMENT à partir des données structurées publiées par le moteur (niveaux, tendance, plans, delta, carnet, annonces, checklist, bilan) :
   jamais d'image, jamais d'IA, jamais de chiffre inventé. Si la donnée manque : « Je ne sais pas » + pourquoi. Ne décide jamais à la place de l'humain. */
import { fmtPrix, fmtNombre, heureParis } from './format.js';

export const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'\-]/g, ' ').replace(/[?!.,;:]/g, ' ').replace(/\s+/g, ' ').trim();
const SENS = { haussiere: 'haussière', baissiere: 'baissière', range: 'en range (pas de direction)', inconnue: 'inconnue' };
const NSP = raison => `Je ne sais pas : ${String(raison).replace(/\s*:\s*je ne sais pas\s*$/i, '')}.`;
const AIDE = 'Je ne sais pas répondre à ça. Je réponds seulement sur la tendance, les niveaux, les plans A et B, le delta, le carnet, les annonces, la checklist, les setups et ton retard d’entrée.';

const NIVEAUX_MOTS = [['veille', ['veilleH', 'veilleL']], ['semaine', ['semH', 'semL']], ['asie', ['asieH', 'asieL']], ['asiatique', ['asieH', 'asieL']], ['londres', ['londresH', 'londresL']], ['vwap', ['vwap']]];

export function repondre(question, { actif, visuel, global, prix } = {}) {
  const q = norm(question);
  if (!q) return 'Pose-moi une question sur le graphique.';
  const v = visuel, f = p => fmtPrix(actif, p);
  if (!v) return NSP(`je n’ai pas encore de données pour ${actif || 'cet actif'} (moteur hors ligne ou en démarrage)`);
  const crit = id => v.confluence && v.confluence.criteres && v.confluence.criteres.find(k => k.id === id);
  const plans = v.plans || [];
  // décision : jamais à la place de l'humain
  if (/\b(dois je|je dois|faut il|tu prendrais|tu acheterais|tu vendrais|je prends|je rentre|j y vais)\b/.test(q)) {
    const A = plans.find(p => p.nom === 'A');
    return 'Je ne décide pas à ta place : c’est toi qui décides. ' + (A ? `Les faits : plan A ${A.sens === 'achat' ? 'achat' : 'vente'} zone ${f(A.zoneBas)} – ${f(A.zoneHaut)}, invalidation ${f(A.stop)}, checklist ${v.confluence ? v.confluence.n : '?'} sur 6.` : 'Aucun plan en cours.');
  }
  if (/\b(trop tard|en retard|encore temps|rattraper)\b/.test(q)) {
    if (!plans.length) return NSP('aucun plan en cours');
    if (prix == null) return NSP('le prix actuel n’est pas disponible');
    return plans.map(p => { const d = p.sens === 'achat' ? 1 : -1, tard = d * (prix - p.tropTard) >= 0; return `Plan ${p.nom} (${p.sens}) : ${tard ? 'TROP TARD' : 'pas encore trop tard'} (ligne ${f(p.tropTard)}, prix ${f(prix)}, moins de ${fmtNombre(p.seuil, 1)} R restants au-delà).`; }).join(' ');
  }
  if (/\b(plan|plans|scenario|scenarios|entree|entrer|zone d entree|stop|invalidation|cible|cibles|objectif)\b/.test(q)) {
    if (!plans.length) return 'Aucun plan en cours : j’attends un niveau clair.' + (v.retires && v.retires.length ? ` Dernier plan retiré : ${v.retires[v.retires.length - 1].raison}.` : '');
    return plans.map(p => `Plan ${p.nom} : ${p.sens === 'achat' ? 'ACHAT' : 'VENTE'} zone ${f(p.zoneBas)} – ${f(p.zoneHaut)} (${p.nomNiveau}), invalidation ${f(p.stop)}, cibles 2R ${f(p.cibles[0])} à 5R ${f(p.cibles[3])}, cible de référence ${f(p.cible)} (${p.cibleNom}), TROP TARD au-delà de ${f(p.tropTard)}. État : ${p.etat === 'touche' ? 'zone touchée' : p.dansZone ? 'prix dans la zone' : 'en attente'}.`).join(' ');
  }
  if (/\b(tendance|haussier|haussiere|baissier|baissiere|direction|structure|h1|h4)\b/.test(q)) {
    const t = v.tendance; if (!t) return NSP('tendance pas encore calculée');
    return `H1 ${SENS[t.h1.sens] || t.h1.sens} (${t.h1.raison}). H4 ${SENS[t.h4.sens] || t.h4.sens} (${t.h4.raison}). Règle : structure des sommets et des creux, sans moyenne mobile.`;
  }
  if (/\b(delta|cvd|volume net|acheteurs|vendeurs|agressif|agressifs)\b/.test(q)) { const c = crit('delta'); return c ? (c.ok === null ? NSP(c.detail) : `Delta : ${c.detail}.`) : NSP('pas de plan en cours, donc pas de lecture du delta au niveau'); }
  if (/\b(carnet|mur|murs|spoof|liquidite|ordres)\b/.test(q)) { const c = crit('mur'); return c ? (c.ok === null ? NSP(c.detail) : `Carnet : ${c.detail}.`) : NSP('pas de plan en cours, donc pas de mur à surveiller'); }
  if (/\b(annonce|annonces|macro|calendrier|cpi|nfp|fomc|fed|news|chiffres)\b/.test(q)) {
    const c = crit('macro'), cal = global && global.calendrier;
    if (!cal && !c) return NSP('le calendrier des annonces n’est pas disponible');
    const proch = cal && cal.prochaines && cal.prochaines.length ? ' Prochaines : ' + cal.prochaines.slice(0, 3).map(x => `${x.titre} (${new Date(x.t).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', weekday: 'short', hour: '2-digit', minute: '2-digit' })})`).join(', ') + '.' : '';
    return (c ? (c.ok === null ? NSP(c.detail) : c.detail[0].toUpperCase() + c.detail.slice(1) + '.') : '') + proch + (cal ? ` Source : ${cal.source}, annonces USD à fort impact seulement.` : '');
  }
  if (/\b(checklist|confluence|criteres|critere|score|jauge|sur 6)\b/.test(q)) {
    const c = v.confluence; if (!c || !c.criteres || !c.criteres.length) return NSP('aucun plan en cours, donc pas de checklist');
    return `Checklist du plan ${c.planNom} : ${c.n} sur 6. ` + c.criteres.map(k => `${k.ok === true ? 'oui' : k.ok === false ? 'non' : 'inconnu'} : ${k.nom.toLowerCase()}`).join(' ; ') + '.';
  }
  if (/\b(setup|setups|valide|validee|hasard|statistique|statistiques|fiable|bilan|retro|backtest)\b/.test(q)) {
    const s = global && global.setups; if (!s) return NSP('le bilan des setups n’est pas encore publié');
    const L = Object.values(s), val = L.filter(x => x.statut === 'validé');
    return (val.length ? `Setups validés : ${val.map(x => x.nom).join(', ')}.` : 'Aucun setup ne bat le hasard hors échantillon : leurs alertes restent désactivées.') + ' ' + L.map(x => `${x.nom} : ${x.statut}`).join(' ; ') + '.';
  }
  if (/\b(retard|pris|prise|prises|mes entrees)\b/.test(q)) {
    const p = global && global.prises; if (!p || !p.n) return NSP('tu n’as encore noté aucune entrée avec « Je l’ai pris »');
    return `Sur ${p.n} entrée${p.n > 1 ? 's' : ''} notée${p.n > 1 ? 's' : ''} : retard moyen ${fmtNombre(p.retardMoyenMin, 0)} min, coût moyen ${fmtNombre(p.coutMoyenR, 2)} R par rapport à l’entrée du plan.`;
  }
  if (/\b(donnees|kraken|fiabilite|trous|volume)\b/.test(q)) {
    const d = v.donnees; if (!d || d.videsPct == null) return NSP('la fiabilité des données n’est pas encore mesurée');
    return `Sur 30 jours, ${fmtNombre(d.videsPct, 1)} % des bougies M15 de ${actif} n’ont aucun échange sur Kraken.` + (d.alerte ? ' ' + d.alerte : ' Données correctes.');
  }
  // niveaux (général ou nommé)
  const nommes = NIVEAUX_MOTS.filter(([m]) => q.includes(m)).flatMap(([, ids]) => ids);
  if (nommes.length || /\b(support|supports|resistance|resistances|niveau|niveaux|plus haut|plus bas|poc|vah|val|profil)\b/.test(q)) {
    const N = v.niveaux || [];
    if (/\b(poc|vah|val|profil)\b/.test(q)) return v.profil ? `Profil du jour (${v.profil.source === 'approx' ? 'approximé depuis les bougies' : 'échanges enregistrés'}) : VAH ${f(v.profil.vah)}, POC ${f(v.profil.poc)}, VAL ${f(v.profil.val)}. Affichage seulement.` : NSP('le profil de volume du jour n’est pas disponible');
    if (nommes.length) { const L = N.filter(n => nommes.includes(n.id)); return L.length ? L.map(n => `${n.nom} : ${f(n.p)}${n.enCours ? ' (session en cours)' : ''}`).join(' ; ') + '.' : NSP('ce niveau n’est pas encore connu (historique trop court)'); }
    const s = v.situation; if (!s) return NSP('niveaux pas encore calculés');
    return `${s.support ? `Support le plus proche : ${s.support.nom} ${f(s.support.p)}.` : 'Aucun support connu sous le prix.'} ${s.resistance ? `Résistance la plus proche : ${s.resistance.nom} ${f(s.resistance.p)}.` : 'Aucune résistance connue au-dessus.'} Le prix est ${s.ou === 'support' ? 'près du support' : s.ou === 'resistance' ? 'près de la résistance' : 'au milieu'}.`;
  }
  if (/\b(situation|resume|quoi de neuf|ca dit quoi|comment ca va|marche)\b/.test(q)) return v.situation ? v.situation.phrase + (v.commentaire ? ' ' + v.commentaire : '') : NSP('situation pas encore calculée');
  return AIDE;
}
export const _heure = heureParis;
