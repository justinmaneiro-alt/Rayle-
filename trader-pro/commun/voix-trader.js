/* ═════════════ VOIX DE RAYLE POUR LE TRADING : « où en est mon portefeuille », « quel risque j'ai », « quelles sont mes erreurs », « couvre ma position sur l'or », « quels signaux H4 aujourd'hui », « que disent les COT sur l'or » ═════════════
   `intention(texte)` reconnaît la demande (module pur, testé) ; `repondre(texte, source)` compose la réponse parlée à partir des données de `source` (injectée : testée avec de fausses données, branchée sur les vraies en navigateur).
   Réponses courtes, avec les chiffres mesurés ; jamais d'ordre, de prévision ni de conseil ; sans donnée, Rayle le dit. */
import { phraseCouverture } from '../couverture/phrase.js';
import { lectureCot } from '../marches/cot.js';

export const normaliser = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'`]/g, ' ').replace(/[^a-z0-9% ]+/g, ' ').replace(/\s+/g, ' ').trim();
const ACTIFS = [['or', /\b(or|gold|xau|xauusd)\b/, 'l’or'], ['us100', /\b(nasdaq|us ?100|ndx)\b/, 'le Nasdaq 100'], ['us500', /\b(s ?p ?500|us ?500|sp500)\b/, 'le S&P 500'], ['btc', /\b(bitcoin|btc)\b/, 'le Bitcoin'], ['sol', /\b(solana|sol)\b/, 'Solana'], ['argent', /\b(argent|silver)\b/, 'l’argent'], ['petrole', /\b(petrole|wti|oil)\b/, 'le pétrole'], ['dxy', /\b(dollar|dxy)\b/, 'le dollar']];
export const actifDe = n => { const a = ACTIFS.find(([, re]) => re.test(n)); return a ? { id: a[0], nom: a[2] } : null; };
export function intention(texte) {
  const n = normaliser(texte); if (!n) return null;
  if (/\bcouvr(e|ir|ez|ons|ant)\b/.test(n) && /\b(position|achat|vente|trade|or|gold|nasdaq|us100|bitcoin|btc|solana|sol|argent|petrole|s ?p ?500)\b/.test(n)) return { type: 'couverture', actif: actifDe(n) };
  if (/\bsignaux?\b/.test(n) && /\b(h4|h 4|jour|journalier|journaliers|aujourd hui|du jour|recents?|derniers?|y a t il)\b/.test(n)) return { type: 'signaux', actif: actifDe(n) };
  if (/\bcot\b|commitments|positions? des fonds|fonds speculatifs|managed money/.test(n)) return { type: 'cot', actif: actifDe(n) || { id: 'or', nom: 'l’or' } };
  if (/\b(quel|quels|combien|c est quoi)\b.*\brisques?\b|\bmon risque\b|\brisque (total|actuel|que j ai|de mes positions)\b|\bmes risques\b/.test(n)) return { type: 'risque' };
  if (/\b(mes erreurs|mes fautes|mes defauts|ma discipline|mon coach|que (est ce que )?je fais mal|quelles sont mes erreurs|mes points faibles)\b/.test(n)) return { type: 'erreurs' };
  if (/\b(portefeuille|mes resultats|mes performances|mon bilan|mon compte xtb|mes positions)\b/.test(n) && /\b(ou en est|etat|bilan|resume|comment|dis moi|donne moi|quel|quels|mes resultats|mes performances)\b|^(mon|mes|le) /.test(n)) return { type: 'portefeuille' };
  return null;
}
const nf = (v, d = 0) => (Number.isFinite(v) ? v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/[  ]/g, ' ') : '?');
const signe = v => (v > 0 ? 'plus ' : v < 0 ? 'moins ' : '') + nf(Math.abs(v), 2);
const SANS_HISTORIQUE = 'Je n’ai pas encore ton historique XTB sur cet appareil : importe ton fichier dans la fenêtre Portefeuille.';
const ago = (t, maintenant = Date.now()) => { const h = Math.round((maintenant - t) / 3600e3); return h < 1 ? 'il y a moins d’une heure' : h < 48 ? 'il y a ' + h + ' heures' : 'il y a ' + Math.round(h / 24) + ' jours'; };

export async function repondre(texte, S, { maintenant = Date.now() } = {}) {
  const i = intention(texte); if (!i) return null;
  try {
    if (i.type === 'portefeuille' || i.type === 'risque' || i.type === 'erreurs') {
      const P = await S.portefeuille(); if (!P || !P.R || !P.R.n) return SANS_HISTORIQUE;
      if (i.type === 'portefeuille') {
        const O = P.exposition, ouv = O && O.positions.length ? `Tu as ${O.positions.length} position${O.positions.length > 1 ? 's' : ''} ouverte${O.positions.length > 1 ? 's' : ''}, résultat latent ${signe(O.latent)} euros.` : 'Aucune position ouverte dans le dernier import.';
        return `Sur ${P.R.n} positions, ${nf(P.R.winRate * 100)} pour cent sont gagnantes, résultat net ${signe(P.R.pnl)} euros${P.R.profitFactor ? ', facteur de profit ' + nf(P.R.profitFactor, 2) : ''}. ${P.coach && P.coach.note ? `Ta note de discipline est de ${P.coach.note.note} sur 100. ` : ''}${ouv} Dernier import ${P.dernierImport ? ago(P.dernierImport, maintenant) : 'inconnu'}.`;
      }
      if (i.type === 'risque') {
        const O = P.exposition; if (!O || !O.positions.length) return 'Aucune position ouverte dans ton dernier import : ton risque en cours est nul.';
        const cap = O.risquePct != null ? ` soit ${nf(O.risquePct, 1)} pour cent de ton capital` : ' (renseigne ton capital dans les réglages du Portefeuille pour avoir le pourcentage)';
        return `Si tous tes stops sont touchés, tu perds environ ${nf(O.risqueAuStop)} euros${cap}. ${O.sansStop ? `${O.sansStop} position${O.sansStop > 1 ? 's' : ''} n’${O.sansStop > 1 ? 'ont' : 'a'} pas de stop : le risque réel est plus grand. ` : ''}Valeur exposée : ${nf(O.valeur)} euros. Dernier import ${P.dernierImport ? ago(P.dernierImport, maintenant) : 'inconnu'}.`;
      }
      const C = P.coach; if (!C || !C.erreurs.length) return 'Aucune erreur mesurée ne coûte de l’argent sur ton historique : continue comme ça.';
      return `Ta note de discipline est de ${C.note.note} sur 100. Tes plus grosses erreurs : ` + C.erreurs.map((e, k) => `${k + 1}, ${e.titre.toLowerCase()} : ${e.texte}`).join(' ') + (C.regles.length ? ' Pour corriger : ' + C.regles[0] : '');
    }
    if (i.type === 'couverture') {
      if (!i.actif) return 'Sur quel actif veux-tu une couverture : l’or, le Nasdaq, le Bitcoin ?';
      const r = await S.couverture(i.actif.id); if (!r) return `Je n’ai pas les séries nécessaires pour couvrir ${i.actif.nom} (le robot les publie chaque heure).`;
      return phraseCouverture(i.actif.nom, r.sens, r.meilleur, r.notionnel) + (r.deMaPosition ? ' C’est calculé pour ta position ouverte.' : ' Je suppose un achat : dis-moi si c’est une vente.');
    }
    if (i.type === 'signaux') {
      const L = await S.signaux(i.actif ? i.actif.id : null); if (!L || !L.length) return 'Je n’ai pas les données H4 et Jour pour le moment.';
      const recents = L.filter(x => x.signaux.length); if (!recents.length) return 'Aucun signal H4 ou Jour dans les dernières 48 heures' + (i.actif ? ' sur ' + i.actif.nom : '') + ' : il n’y en a que quelques-uns par mois.';
      return recents.map(x => x.signaux.slice(0, 2).map(s => `Sur ${x.nom} : ${s.dir > 0 ? 'achat' : 'vente'} ${s.tf === 'J' ? 'Jour' : 'H4'}, ${s.type}, entrée ${nf(s.entree)}, stop ${nf(s.sl)}, objectif ${nf(s.tp)}.`).join(' ') + (x.verdict === 'negatif' ? ' Attention : le backtest de ces règles est négatif sur cet actif.' : '')).join(' ');
    }
    if (i.type === 'cot') {
      const a = await S.cot(i.actif.id); if (!a) return `Je n’ai pas les données COT pour ${i.actif.nom} pour le moment.`;
      return lectureCot(a, i.actif.nom);
    }
  } catch (e) { return 'Je n’ai pas pu lire les données : ' + String(e && e.message || e).slice(0, 120); }
  return null;
}

/* ───── branchement sur les vraies données (navigateur) ───── */
export function sourceNavigateur() {
  const charge = async () => {
    const [{ creerStockageParDefaut }, { creerPortefeuille }, calc, coach, dn, xtb] = await Promise.all([import('../../agent-trading/front/donnees/couche.js'), import('../portefeuille/stockage.js'), import('../portefeuille/calcul.js'), import('../portefeuille/coach.js'), import('./donnees.js'), import('./xtb.js')]);
    return { creerStockageParDefaut, creerPortefeuille, calc, coach, dn, xtb };
  };
  return {
    async portefeuille() {
      const M = await charge(), L = await M.creerPortefeuille({ stockage: M.creerStockageParDefaut() }).charger(); if (!L.fermees.length) return null;
      const vp = M.calc.valeursDuPoint(L.fermees), E = M.calc.enrichir(L.fermees, vp), R = M.calc.resume(E), K = M.calc.courbes(L.tresorerie, E, +L.reglages.soldeInitial || 0), capital = +L.reglages.capital > 0 ? +L.reglages.capital : (+L.reglages.soldeInitial > 0 ? K.soldeFinal : null);
      return { R, K, coach: E.length >= 10 ? M.coach.rapportCalcule(E) : null, exposition: M.calc.exposition(L.ouvertes.positions || [], vp, capital), dernierImport: (L.ouvertes && L.ouvertes.t) || null };
    },
    async couverture(id) {
      const M = await charge(), C = await import('../couverture/calcul.js'), cal = { or: 'XAUUSD', argent: 'XAGUSD', us100: 'US100', us500: 'US500', btc: 'BTC', sol: 'SOL', dxy: 'DXY', petrole: 'WTI' }[id]; if (!cal) return null;
      const { depuisSnapshotJour } = await import('./series.js'), S = {};
      await Promise.all(C.UNIVERS_COUV.map(async a => { try { const r = await M.dn.lireJour(a.id, { delai: 8000 }); const s = depuisSnapshotJour(r.donnees).slice(-1100); if (s.length > 60) S[a.id] = s; } catch (e) { /* actif absent */ } }));
      let sens = 1, notionnel = null, deMaPosition = false; const pos = (JSON.parse(localStorage.getItem(M.xtb.CLE_POSITIONS_OUVERTES) || '[]')).find(p => M.xtb.idDepuisTicker(p.ticker) === cal); if (pos) { sens = pos.sens === 'BUY' ? 1 : -1; notionnel = pos.valeur || null; deMaPosition = true; }
      const L = C.classerCouvertures(S, cal, sens, { notionnel }); return L.length ? { sens, notionnel, meilleur: L[0], deMaPosition } : null;
    },
    async signaux(id) {
      const M = await charge(), { lireHJ } = await import('../terminal/lecture-hj.js'), ids = id ? [id] : ['or', 'us100', 'us500', 'btc', 'sol'], noms = { or: 'l’or', us100: 'le Nasdaq 100', us500: 'le S&P 500', btc: 'le Bitcoin', sol: 'Solana' }; let bt = null; try { bt = await (await fetch(new URL('../terminal/backtest-hj.json', import.meta.url))).json(); } catch (e) { /* sans verdict */ }
      const out = []; for (const a of ids) { if (!noms[a]) continue; try { const r = await M.dn.lireActifPro(a, { delai: 8000 }), L = lireHJ(r.donnees, { jours: 2 }); if (L.ok) { const b = bt && bt.actifs.find(x => x.id === a); out.push({ id: a, nom: noms[a], signaux: L.signaux, verdict: b && L.signaux.length ? ((b.tf[L.signaux[0].tf] || {}).verdict || {}).niveau : null }); } } catch (e) { /* actif sans données */ } } return out;
    },
    async cot(id) {
      const M = await charge(), { analyserCot } = await import('../marches/cot.js'), a = M.dn.parId[id] || null; if (!a) return null; const r = await M.dn.lireCot(a.cot, { delai: 8000 }); return analyserCot(r.donnees);
    }
  };
}
export async function commande(texte) { if (!intention(texte)) return null; return repondre(texte, sourceNavigateur()); }
