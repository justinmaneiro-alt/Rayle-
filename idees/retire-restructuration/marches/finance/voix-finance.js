import { contratDeLaPhrase, demandeCot, phraseCot, CONTRATS_COT } from './cot-calcul.js';
import { phraseCalendrier } from './calendrier-calcul.js';
import { phraseTaux } from './taux-calcul.js';
import { banqueDeLaPhrase, nomBanque, phraseBanque } from './flux-calcul.js';
import { actifDeLaPhrase, NOMS_ACTIFS } from './impact.js';
import { NASDAQ100, phraseHeatmap } from './heatmap-calcul.js';
import { phraseSec } from './sec-calcul.js';

/* ═════════════ COMMANDES VOCALES DU HUB FINANCE (M2b ; module pur, testé : finance-test.mjs / finance-voix) ═════════════
   « le COT de l'or », « le calendrier de la semaine », « que dit la Fed ? », « les actualités qui font bouger le Nasdaq », « la courbe des taux », « la carte du Nasdaq 100 », « les résultats de Nvidia ».
   `analyserDemandeFinance(texte)` → { type, … } ou null (pur) ; `repondre(demande, finance)` → { texte, panneau, reglage } (la réponse parlée est construite à partir des données réelles ou dit « indisponible »).
   Aucune IA. Une demande hors sujet rend null : les autres commandes de Raylé décident. */
const norm = t => String(t == null ? '' : t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘`']/g, ' ').replace(/[?!.,;:«»"()]/g, ' ').replace(/\s+/g, ' ').trim();
const mots = t => t.split(' ').length;

/* Valeur du Nasdaq 100 citée (« Nvidia », « Apple », « le titre Tesla »). */
const ALIAS_VALEURS = { alphabet: 'GOOGL', google: 'GOOGL', meta: 'META', facebook: 'META', amazon: 'AMZN', microsoft: 'MSFT', apple: 'AAPL', nvidia: 'NVDA', tesla: 'TSLA', netflix: 'NFLX', broadcom: 'AVGO', costco: 'COST', palantir: 'PLTR', amd: 'AMD', intel: 'INTC', qualcomm: 'QCOM', cisco: 'CSCO', pepsi: 'PEP', paypal: 'PYPL', airbnb: 'ABNB', adobe: 'ADBE', micron: 'MU', shopify: 'SHOP', starbucks: 'SBUX' };
export function valeurDeLaPhrase(texte) {
  const t = norm(texte); let meilleur = null, taille = 0;
  for (const [a, s] of Object.entries(ALIAS_VALEURS)) if (a.length > taille && new RegExp('(^| )' + a + '( |$)').test(t)) { meilleur = s; taille = a.length; }
  for (const x of NASDAQ100) { const n = norm(x.nom); if (n.length > taille && n.length >= 4 && new RegExp('(^| )' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '( |$)').test(t)) { meilleur = x.s; taille = n.length; } }
  return meilleur;
}

export function analyserDemandeFinance(texte) {
  const t = norm(texte); if (!t || mots(t) > 16) return null;
  const question = /^(que|qu|quel|quelle|quels|quelles|dis|donne|montre|affiche|ouvre|ouvrir|et|les|le|la|l)\b/.test(t) || /\?/.test(String(texte));
  // COT
  if (demandeCot(texte) || /\bcot\b/.test(t)) return { type: 'cot', contrat: contratDeLaPhrase(texte) || 'NDX' };
  // banques centrales : « que dit la Fed ? », « la BCE a dit quoi »
  const banque = banqueDeLaPhrase(texte);
  if (banque && (/\b(dit|disent|dire|annonce|annoncent|publie|publient|communique|communiques?|publications?|derniers? mots|minutes|decision|discours)\b/.test(t) || /^(la|les|l) /.test(t) && mots(t) <= 5)) return { type: 'banque', banque };
  if (/\b(publications? (de la |du |des )?(bce|bri|institutions?|banques?)|analyses? (publiques?|des banques)|recherche des banques|etudes? des banques)\b/.test(t)) return { type: 'publications' };
  // calendrier
  if (/\b(calendrier|agenda)\b/.test(t) && /\b(economique|economiques|semaine|jour|aujourd hui|demain|macro|annonces|evenements|marches?)\b/.test(t) || /\b(annonces|evenements) (economiques|macro)( de la semaine| de la journee)?\b/.test(t) || /\bquelles? (annonces|publications|donnees) (economiques|macro)\b/.test(t))
    return { type: 'calendrier', jours: /\b(aujourd hui|jour|journee)\b/.test(t) ? 1 : /\bdemain\b/.test(t) ? 2 : /\bmois\b/.test(t) ? 30 : 7 };
  // actualités qui font bouger / actualités financières
  if (/\b(font bouger|fait bouger|bougent|font monter|font baisser|font chuter|font reagir|impactent|impact sur)\b/.test(t) || /\bactualites? (financieres?|de marche|des marches|du marche|boursieres?|economiques?)\b/.test(t) || /\bnews (finance|marche|marches|bourse)\b/.test(t))
    return { type: 'actus', actif: actifDeLaPhrase(texte), bougePrix: /\b(font|fait|bougent|impactent)\b/.test(t) };
  // taux, inflation
  if (/\b(courbe des taux|taux americains?|rendements? (americains?|obligataires?)|taux (a|de) (2|10|30) ans|inflation americaine|inflation us|cpi americain|chomage americain|taux de chomage americain)\b/.test(t) || (/\b(les taux|taux 10 ans|taux a 10 ans)\b/.test(t) && question && !/\b(directeurs?|banque)\b/.test(t))) return { type: 'taux' };
  // carte de chaleur et dépôts SEC
  if (/\b(heatmap|carte de chaleur|carte du nasdaq|carte du nasdaq 100|performances? du nasdaq 100|composition du nasdaq|valeurs du nasdaq)\b/.test(t)) return { type: 'heatmap' };
  const valeur = valeurDeLaPhrase(texte);
  if (valeur && /\b(sec|edgar|depots?|resultats?|8 k|initie|inities|insider|events? importants?|evenements importants?)\b/.test(t)) return { type: 'sec', symbole: valeur };
  return null;
}

/* Réponse parlée à partir des données (client de données.js). Rend { texte, panneau, reglage } ; `panneau` = onglet de l'espace de travail à ouvrir. */
export async function repondre(d, fin, { maintenant = Date.now() } = {}) {
  switch (d.type) {
    case 'cot': {
      const r = await fin.cot(d.contrat), c = CONTRATS_COT[d.contrat];
      return { panneau: 'cot', reglage: { contrat: d.contrat }, texte: r.etat === 'ok' ? phraseCot(d.contrat, r.analyse) + (r.etiquette === 'PÉRIMÉ' ? ' Attention : cette copie est périmée (' + r.raison + ').' : '') : 'Le rapport COT sur ' + c.court + ' est indisponible : ' + r.raison + '.' };
    }
    case 'calendrier': {
      const r = await fin.calendrier();
      return { panneau: 'calendrier', texte: r.etat === 'ok' ? phraseCalendrier(r.evenements, { maintenant, jours: d.jours, impactMin: 'high' }) + (r.sources.some(s => s.etat !== 'ok') ? ' Certaines sources sont indisponibles : ' + r.sources.filter(s => s.etat !== 'ok').map(s => s.nom + ' (' + s.raison + ')').join(', ') + '.' : '') : 'Le calendrier économique est indisponible : ' + r.raison + '.' };
    }
    case 'banque': {
      const r = await fin.flux('banques');
      return { panneau: 'banques', reglage: { banque: d.banque }, texte: r.etat === 'ok' ? phraseBanque(d.banque, r.items, maintenant) : 'Les publications de ' + nomBanque[d.banque] + ' sont indisponibles : ' + r.raison + '.' };
    }
    case 'publications': return { panneau: 'publications', texte: 'J’ouvre les publications publiques de la BCE, de la BRI et d’ING Think. Les analyses des banques d’investissement sont payantes : je ne les affiche pas.' };
    case 'actus': {
      const r = await fin.flux('actus', { actif: d.actif });
      if (r.etat !== 'ok') return { panneau: 'actus', reglage: { actif: d.actif }, texte: 'Les actualités financières sont indisponibles : ' + r.raison + '.' };
      const l = r.items.filter(i => (!d.actif || i.classe.actifs.includes(d.actif)) && (d.bougePrix ? i.classe.bougePrix || i.classe.impact === 'fort' : i.classe.impact !== 'faible')).slice(0, 3);
      const cible = d.actif ? NOMS_ACTIFS[d.actif] : 'les marchés';
      return { panneau: 'actus', reglage: { actif: d.actif, bouge: !!d.bougePrix }, texte: l.length ? 'Ce qui fait le plus parler pour ' + cible + ' : ' + l.map(i => '« ' + i.titre + ' » (' + i.source + ', impact ' + i.classe.impact + ')').join(' ; ') + '. Classement par règles de mots-clés, titres dans la langue d’origine.' : 'Aucun titre à fort impact pour ' + cible + ' en ce moment.' };
    }
    case 'taux': {
      const [c, b] = await Promise.all([fin.courbe(), fin.bls()]);
      let t = c.etat === 'ok' ? phraseTaux(c.courbe) : 'La courbe des taux est indisponible : ' + c.raison + '.';
      if (b.etat === 'ok' && b.donnees.chomage && b.donnees.cpi_nsa && b.donnees.cpi_nsa.length > 12) { const x = b.donnees.cpi_nsa, ref = x.find(p => p.annee === x[0].annee - 1 && p.mois === x[0].mois); if (ref) t += ' Inflation américaine sur un an : ' + ((x[0].valeur / ref.valeur - 1) * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + ' pour cent, chômage ' + b.donnees.chomage[0].valeur.toLocaleString('fr-FR', { minimumFractionDigits: 1 }) + ' pour cent, source BLS.'; }
      return { panneau: 'taux', texte: t };
    }
    case 'heatmap': {
      const r = await fin.heatmap();
      return { panneau: 'heatmap', texte: r.etat === 'ok' ? phraseHeatmap(r.resume) : 'Les cotations du Nasdaq 100 sont indisponibles : ' + r.raison + '.' };
    }
    case 'sec': {
      const r = await fin.sec(d.symbole);
      return { panneau: 'heatmap', reglage: { symbole: d.symbole }, texte: r.etat === 'ok' ? phraseSec(r.resume) : 'Les dépôts de la SEC pour ' + d.symbole + ' sont indisponibles : ' + r.raison + '.' };
    }
    default: return null;
  }
}
