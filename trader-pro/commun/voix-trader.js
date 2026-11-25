/* ═════════════ VOIX DE RAYLE POUR LE TRADING : « où en est mon portefeuille », « quel risque j'ai », « quelles sont mes erreurs », « couvre ma position sur l'or », « quels signaux H4 aujourd'hui », « que disent les COT sur l'or » ═════════════
   `intention(texte)` reconnaît la demande (module pur, testé) ; `repondre(texte, source)` compose la réponse parlée à partir des données de `source` (injectée : testée avec de fausses données, branchée sur les vraies en navigateur).
   Réponses courtes, avec les chiffres mesurés ; jamais d'ordre, de prévision ni de conseil ; sans donnée, Rayle le dit. */
import { phraseCouverture } from '../couverture/phrase.js';
import { lectureCot } from '../marches/cot.js';
import { setupDeTexte, NOM_SETUP, ACTIFS_XTB } from '../portefeuille/journal-setups.js';

export const normaliser = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'`]/g, ' ').replace(/[^a-z0-9% ]+/g, ' ').replace(/\s+/g, ' ').trim();
const ACTIFS = [['or', /\b(or|gold|xau|xauusd)\b/, 'l’or'], ['us100', /\b(nasdaq|us ?100|ndx)\b/, 'le Nasdaq 100'], ['us500', /\b(s ?p ?500|us ?500|sp500)\b/, 'le S&P 500'], ['btc', /\b(bitcoin|btc)\b/, 'le Bitcoin'], ['sol', /\b(solana|sol)\b/, 'Solana'], ['argent', /\b(argent|silver)\b/, 'l’argent'], ['petrole', /\b(petrole|wti|oil)\b/, 'le pétrole'], ['dxy', /\b(dollar|dxy)\b/, 'le dollar'], ['eurusd', /\b(euro dollar|eur ?usd|euro)\b/, 'l’EUR/USD']];
export const uniteDe = n => (/\b(h ?1|1 ?h|une heure)\b/.test(n) ? 'H1' : /\b(h ?4|4 ?h|quatre heures)\b/.test(n) ? 'H4' : /\b(daily|jour|journalier|d ?1)\b/.test(n) ? 'J' : null);
export const actifDe = n => { const a = ACTIFS.find(([, re]) => re.test(n)); return a ? { id: a[0], nom: a[2] } : null; };
/* ───── saisie rapide d'un trade à la voix : « j'ai acheté l'or à 3 620, stop 3 600, setup rebond MA200 » (module pur, testé) ───── */
const NOMBRE = '\\d{1,3}(?: \\d{3})+(?:[.,]\\d+)?|\\d+(?:[.,]\\d+)?';
const versNombre = s => { const x = parseFloat(String(s).replace(/ /g, '').replace(',', '.')); return Number.isFinite(x) ? x : null; };
export function analyserPrise(texte) {
  const t = String(texte || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'`]/g, ' ').replace(/\bma ?200\b/g, 'ma200').replace(/\b(us|sp) ?(100|500)\b/g, 'idx').replace(/\bh ?([14])\b/g, ' h$1 ').replace(/[^a-z0-9.,% ]+/g, ' ').replace(/\s+/g, ' ');
  if (!/\b(j ai|je viens de|je viens d|ca y est|je suis)\b/.test(t)) return null;
  const achat = /\b(achete|acheter|long|pris un achat|pris un long)\b/.test(t), vente = /\b(vendu|vendre|short|pris un short|pris une vente)\b/.test(t); if (achat === vente) return null;
  const n = normaliser(texte), actif = actifDe(n); if (!actif || !ACTIFS_XTB[actif.id]) return null;
  const re = k => new RegExp('\\b(?:' + k + ')\\s*(?:loss|profit)?\\s*(?:a|de|vers|sur)?\\s*(' + NOMBRE + ')');
  const tNum = t.replace(/ma200/g, 'ma'), mStop = re('stop|sl').exec(tNum), mCible = re('cible|objectif|tp|take profit').exec(tNum); let reste = tNum; for (const m of [mStop, mCible]) if (m) reste = reste.replace(m[0], ' ');
  const mPrix = new RegExp('(' + NOMBRE + ')').exec(reste); if (!mPrix) return { incomplet: 'prix', actif: actif.id, sens: achat ? 'BUY' : 'SELL' };
  const u = /\b(h1|h4|jour|daily|journalier)\b/.exec(t), setup = setupDeTexte(t.slice(Math.max(0, t.indexOf('setup')))) || setupDeTexte(t);
  return { sens: achat ? 'BUY' : 'SELL', actif: actif.id, prix: versNombre(mPrix[1]), stop: mStop ? versNombre(mStop[1]) : null, cible: mCible ? versNombre(mCible[1]) : null, setup: setup || 'autre', setupDit: !!setup, unite: u ? (u[1] === 'h1' ? 'H1' : u[1] === 'h4' ? 'H4' : 'J') : null };
}
export function intention(texte) {
  const n = normaliser(texte); if (!n) return null;
  { const p = analyserPrise(texte); if (p) return { type: 'prise', prise: p }; }
  /* v4 : mode Volume du Terminal */
  if (/\b(mode|terminal) volume\b/.test(n)) return { type: 'volume', action: /\b(quitte|quitter|sors|sortir|ferme|retour|reviens|revenir|classique)\b/.test(n) ? 'classique' : 'ouvrir', actif: actifDe(n), unite: uniteDe(n) };
  if (/\bmode classique\b/.test(n)) return { type: 'volume', action: 'classique' };
  if (/\bvwap\b/.test(n) && /\b(ancre|ancrer|ancres|pose|poser|mets|mettre|place|placer)\b/.test(n)) return { type: 'volume', action: 'vwap' };
  if (/\breactions?\b/.test(n) && /\b(niveaux?|zones?)\b/.test(n)) return { type: 'volume', action: 'reaction', actif: actifDe(n), unite: uniteDe(n) };
  if (/\bpoc\b/.test(n) && /\b(nus?|non touches?)\b/.test(n)) return { type: 'volume', action: 'poc-nus', actif: actifDe(n) };
  if (/\bvolume\b/.test(n) && /\b(analyse|analyser|lis|lire|explique|expliquer|que dit|dis moi|decris|resume|regarde)\b/.test(n)) return { type: 'volume', action: 'analyse', actif: actifDe(n) || { id: 'or', nom: 'l’or' }, unite: uniteDe(n) };
  if (/\bcouvr(e|ir|ez|ons|ant)\b/.test(n) && /\b(position|achat|vente|trade|or|gold|nasdaq|us100|bitcoin|btc|solana|sol|argent|petrole|s ?p ?500)\b/.test(n)) return { type: 'couverture', actif: actifDe(n) };
  if (/\b(fleches?|retournements?)\b/.test(n) || (/\bsignaux?\b/.test(n) && /\b(h4|h 4|jour|journalier|journaliers|aujourd hui|du jour|recents?|derniers?|y a t il)\b/.test(n))) return { type: 'fleches', actif: actifDe(n) };
  if (/\bscores?\b/.test(n) && /\b(marche|marches|or|gold|nasdaq|us100|bitcoin|btc|solana|sol|s ?p ?500|dollar)\b/.test(n)) return { type: 'score', actif: actifDe(n) || { id: 'or', nom: 'l’or' } };
  if (/\bcot\b|commitments|positions? des fonds|fonds speculatifs|managed money/.test(n)) return { type: 'cot', actif: actifDe(n) || { id: 'or', nom: 'l’or' } };
  if (/\b(quel|quels|combien|c est quoi)\b.*\brisques?\b|\bmon risque\b|\brisque (total|actuel|que j ai|de mes positions)\b|\bmes risques\b/.test(n)) return { type: 'risque' };
  /* v6 : « Rayle, est-ce que mes données sont à jour ? » */
  if (/\bbriefing\b/.test(n)) return { type: 'briefing' };
  if (/\bdonnees\b/.test(n) && /\b(a jour|etat|fraiches?|perimees?|retard|panne|fiables?)\b/.test(n)) return { type: 'donnees' };
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
    if (i.type === 'briefing') return S.briefing ? await S.briefing() : 'Je ne peux pas préparer le briefing ici.';
    if (i.type === 'donnees') return S.donnees ? await S.donnees() : 'Je ne peux pas lire l’état des données ici.';
    if (i.type === 'volume') return S.volume ? await S.volume(i) : 'Le terminal Volume n’est pas disponible ici.';
    if (i.type === 'couverture') {
      if (!i.actif) return 'Sur quel actif veux-tu une couverture : l’or, le Nasdaq, le Bitcoin ?';
      const r = await S.couverture(i.actif.id); if (!r) return `Je n’ai pas les séries nécessaires pour couvrir ${i.actif.nom} (le robot les publie chaque heure).`;
      return phraseCouverture(i.actif.nom, r.sens, r.meilleur, r.notionnel) + (r.deMaPosition ? ' C’est calculé pour ta position ouverte.' : ' Je suppose un achat : dis-moi si c’est une vente.');
    }
    if (i.type === 'fleches') {
      const L = await S.fleches(i.actif ? i.actif.id : null); if (!L || !L.length) return 'Je n’ai pas les données Daily pour le moment.';
      const quoi = f => `${f.type === 'cassure' ? 'grosse flèche' : 'petite flèche'} ${f.dir > 0 ? 'verte, achat' : 'rouge, vente'}, ${f.libelle || ''}, entrée vers ${f.niveauTxt || ''}`.replace(/, entrée vers $/, '').replace(/, , /, ', ');
      const jour = t => new Date(t).toLocaleDateString('fr-FR', { timeZone: 'UTC', day: 'numeric', month: 'long' });
      const recents = L.filter(x => x.recentes.length);
      if (!recents.length) return 'Aucune flèche MA200 Daily + H4 dans les 7 derniers jours' + (i.actif ? ' sur ' + i.actif.nom : '') + '.' + (L.length === 1 && L[0].derniere ? ` La dernière, ${L[0].derniere.dir < 0 ? 'rouge, une vente' : 'verte, un achat'}, a été confirmée le ${jour(L[0].derniere.t)}.` : '');
      return recents.map(x => x.recentes.slice(-2).map(f => `Sur ${x.nom} : ${quoi(f)}${f.stopTxt ? `, stop ${f.stopTxt}` : ''}. Ce n’est pas un ordre.`).join(' ')).join(' ');
    }
    if (i.type === 'prise') {
      const p = i.prise, A = ACTIFS_XTB[p.actif]; if (p.incomplet) return 'Il me manque le prix d’entrée. Redis par exemple : j’ai acheté l’or à 3 620, stop 3 600, setup rebond MA200.';
      if (!S.prise) return 'Je ne peux pas noter ce trade sur cet appareil.';
      const r = await S.prise({ ticker: A.ticker, sens: p.sens, prix: p.prix, stop: p.stop, cible: p.cible, setup: p.setup, unite: p.unite, t: maintenant, source: 'voix' }); if (!r) return 'Je n’ai pas pu noter ce trade : vérifie le prix.';
      return `C’est noté : ${p.sens === 'BUY' ? 'achat' : 'vente'} ${A.nom.startsWith('l’') ? 'd’' + A.nom.slice(2) : A.nom.startsWith('le ') ? 'du ' + A.nom.slice(3) : 'de ' + A.nom} à ${nf(p.prix, p.prix < 100 ? 2 : 0)}${p.stop ? ', stop ' + nf(p.stop, p.stop < 100 ? 2 : 0) : ''}${p.cible ? ', cible ' + nf(p.cible, p.cible < 100 ? 2 : 0) : ''}, setup ${NOM_SETUP[p.setup]}${p.unite ? ' ' + (p.unite === 'J' ? 'Jour' : p.unite) : ''}.${p.setupDit ? '' : ' Je l’ai classé « autre » : dis le setup pour le préciser, par exemple rebond MA200.'} Je le rapprocherai de ton import XTB.`;
    }
    if (i.type === 'score') {
      const r = await S.score(i.actif.id); return r ? phraseScore(i.actif.nom, r) : `Je n’ai pas les données pour calculer le score de ${i.actif.nom}.`;
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
    async fleches(id) {
      const M = await charge(), { flechesDe } = await import('../terminal/fleches-registre.js'), { niveauParle, typeLibelle } = await import('../terminal/ma200-h4.js'), ids = id ? [id] : ['or', 'us100', 'us500', 'btc', 'sol', 'doge'], noms = { or: 'l’or', us100: 'le Nasdaq 100', us500: 'le S&P 500', btc: 'le Bitcoin', sol: 'Solana', doge: 'Dogecoin' };
      const out = []; for (const a of ids) { if (!noms[a]) continue; try { const r = await M.dn.lireActifPro(a, { delai: 8000 }), reg = flechesDe(a, r.donnees), maintenant = Date.now(); const avec = f => ({ ...f, niveauTxt: niveauParle(f.entree), stopTxt: niveauParle(f.stop), libelle: typeLibelle(f) }); out.push({ id: a, nom: noms[a], derniere: reg.length ? avec(reg[reg.length - 1]) : null, recentes: reg.filter(x => maintenant - x.tFin < 7 * 86400e3 && x.tFin <= maintenant).map(avec) }); } catch (e) { /* actif sans données */ } } return out;
    },
    /* v4 : pilote le terminal Volume (cherche le contrôleur dans cette page et dans ses cadres ; sinon ouvre le Terminal et attend) */
    async briefing() {
      const { construireBriefing } = await import('./briefing.js'), { lireEtat, phraseDonnees } = await import('./fraicheur.js'), B = 'https://raw.githubusercontent.com/justinmaneiro-alt/Rayle-/donnees/', j = async f => { try { const r = await fetch(B + f, { signal: AbortSignal.timeout(8000) }); return r.ok ? await r.json() : null; } catch (e) { return null; } };
      const [sig, cal, E] = await Promise.all([j('signaux.json'), j('calendrier2.json'), lireEtat()]), mouvements = [], fr = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }), auj = fr.format(new Date());
      for (const [a, x] of Object.entries((sig && sig.actifs) || {})) { const J = x.derniere && x.derniere.J, H = x.derniere && x.derniere.H1; if (J && J.derniere && H && H.derniere) mouvements.push({ actif: a, prix: H.derniere.c, variationPct: (H.derniere.c / J.derniere.c - 1) * 100 }); }
      const annonces = ((cal && cal.evenements) || []).filter(e => /^(High|Medium)$/i.test(e.impact || '') && fr.format(new Date(e.date)) === auj).slice(0, 6).map(e => ({ heure: new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(e.date)), titre: e.title }));
      return construireBriefing({ date: new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()), mouvements, niveaux: [], annonces, alertes: { actives: 0, recentes: [] }, risque: null, donnees: { voyant: E.voyant, phrase: phraseDonnees(E.liste) } }).voix;
    },
    async donnees() { const { lireEtat, phraseDonnees } = await import('./fraicheur.js'); const E = await lireEtat(); return phraseDonnees(E.liste); },
    async volume(i) {
      const trouver = () => { try { if (window.__tpVolume) return window.__tpVolume; for (const f of document.querySelectorAll('iframe')) { try { if (f.contentWindow && f.contentWindow.__tpVolume) return f.contentWindow.__tpVolume; } catch (e) { /* autre origine */ } } } catch (e) { /* ignoré */ } return null; };
      let V = trouver(); if (!V && typeof window !== 'undefined' && window.Application && window.Application.ouvrir) { try { await window.Application.ouvrir('terminal'); } catch (e) { /* ignoré */ } for (let k = 0; k < 40 && !V; k++) { await new Promise(r => setTimeout(r, 250)); V = trouver(); } }
      if (!V) return 'Je n’arrive pas à joindre le terminal Volume : ouvre le Terminal puis redis ta demande.';
      const A = ['or', 'us100', 'us500', 'btc', 'sol', 'eurusd'];
      if (i.action === 'classique') { V.fermerMode(); return 'Retour au mode classique.'; }
      if (i.action === 'ouvrir') { await V.ouvrirMode({ actif: i.actif && A.includes(i.actif.id) ? i.actif.id : undefined, unite: i.unite || undefined }); return 'Mode Volume ouvert.'; }
      await V.ouvrirMode({ actif: i.actif && A.includes(i.actif.id) ? i.actif.id : undefined, unite: i.unite || undefined });
      if (i.action === 'vwap') return V.ancrer();
      if (i.action === 'poc-nus') return V.pocsNus();
      if (i.action === 'reaction') { await V.attendre(); return V.reaction(); }
      await V.attendre(); return V.analyse();
    },
    async prise(d) { const J = await import('../portefeuille/journal-stockage.js'), { creerPrise } = await import('../portefeuille/journal-setups.js'); return J.ajouter(creerPrise(d)); },
    async score(id) { const { calculerScoreActif } = await import('./dashboard.js'); return calculerScoreActif(id); },
    async cot(id) {
      const M = await charge(), { analyserCot } = await import('../marches/cot.js'), a = M.dn.parId[id] || null; if (!a) return null; const r = await M.dn.lireCot(a.cot, { delai: 8000 }); return analyserCot(r.donnees);
    }
  };
}
/* Investissement (v2) : « montre-moi les actions européennes attractives sur 1 à 3 ans hors méga-caps », « saisonnalité de LVMH d'août à décembre », « pourquoi Airbus est neutre » */
export function sourceInvest() {
  let D = null; const donnees = async () => D || (D = (await import('../invest/donnees-invest.js')).creerDonnees());
  return {
    lignes: async c => (await donnees()).lignes(c), saison: async c => (await donnees()).saison(c),
    horizon: () => { try { return (JSON.parse(localStorage.getItem('rayle_lt2_etat') || '{}')).horizon || 'moyen'; } catch (e) { return 'moyen'; } },
    ajust: async () => { try { return (await (await donnees()).manifeste()).ajust || {}; } catch (e) { return {}; } },
    async piloter(spec) { if (typeof window !== 'undefined' && window.Application && window.Application.ouvrir) await window.Application.ouvrir('invest'); const m = await import('../invest/fenetre.js'), inst = await m.ouvrir({}); return inst.piloter(spec); }
  };
}
/* v7 : « Rayle, est-ce que l'or est cher ? », « où en est le Bitcoin sur 1 à 3 ans ? » : verdict de « Mes actifs » (mes-actifs.json), parlé à partir des vrais indicateurs */
export async function repondreMesActifs(texte, { donnees = null } = {}) {
  const M = await import('../invest/mes-actifs-calcul.js'), I = M.intentionMesActifs(texte); if (!I) return null;
  try { const D = await (donnees || (await import('../invest/donnees-invest.js')).creerDonnees()).mesActifs(), A = D && D.actifs && D.actifs[I.actif]; if (!A) return `Je n’ai pas encore les indicateurs de ${I.nom.toLowerCase()} : la tâche quotidienne ne les a pas publiés.`; return M.phraseVerdict(I.nom, A.indicateurs, I.horizon); }
  catch (e) { return `Je n’arrive pas à lire les indicateurs de ${I.nom.toLowerCase()} pour le moment (${String(e && e.message || e).slice(0, 80)}).`; }
}
/* réseau d'information : « quoi de neuf d'important ? », « qu'est-ce que Trump a dit aujourd'hui ? », « qu'est-ce qui peut faire bouger l'or cette semaine ? » (lu dans l'état, sans IA) */
/* points de Rayle : « qu'est-ce qui se passe ? dis-moi tout », « fais-moi un point sur cette nuit », « le point du matin », « où en est l'or ? » : le point est composé (chiffres vérifiés), lu, et ouvert en fenêtre */
export async function repondrePoint(texte) {
  const I = await import('../point/intention.js'), it = I.intentionPoint(texte); if (!it) return null;
  const [C, Vi, F] = await Promise.all([import('../point/charger.js'), import('../point/visite.js'), import('../point/fenetre.js')]), vis = Vi.lireVisite(), maintenant = Date.now();
  const prec = it.type === 'depuis' && vis && vis.precedente && maintenant - vis.precedente < 7 * 86400e3 ? vis.precedente : null;
  const P = await C.construirePoint({ type: it.type, actif: it.actif || null, depuis: prec, absenceMs: prec ? maintenant - prec : null, maintenant });
  try { F.ouvrirPoint({ type: it.type, actif: it.actif || null, depuis: prec, absenceMs: prec ? maintenant - prec : null, point: P }); } catch (e) { /* la fenêtre est facultative : le texte est lu */ }
  return P.texteParle;
}
export async function repondreReseau(texte) {
  const T = await import('../reseau/textes.js'); if (!T.intentionReseau(texte)) return null;
  const C = await import('./donnees.js'), K = await import('../reseau/client.js'), Cal = await import('../marches/calendrier.js');
  const [E, cal] = await Promise.allSettled([K.lireReseau(), C.lireCalendrier({ delai: 6000 })]);
  if (E.status !== 'fulfilled') return 'Mon réseau d’information est injoignable pour le moment.';
  return T.reponseReseau(texte, E.value.donnees, { evenements: cal.status === 'fulfilled' ? Cal.lireEvenements(cal.value.donnees) : [] });
}
/* copilote en direct : « montre-moi », « regarde ça », « je regarde un achat sur l'or », « j'ai clôturé », « formation », « alertes silencieuses jusqu'à demain » */
export async function repondreCopilote(texte) {
  const V = await import('../copilote/voix.js'); if (!V.intentionCopilote(texte)) return null; return V.repondreCopilote(texte);
}
export async function commande(texte) {
  { const r = await repondreCopilote(texte); if (r) return r; }
  { const r = await repondrePoint(texte); if (r) return r; }
  { const r = await repondreReseau(texte); if (r) return r; }
  { const r = await repondreMesActifs(texte); if (r) return r; }
  if (!intention(texte)) { const I = await import('../invest/voix-invest.js'); return I.intentionInvest(texte) ? I.repondreInvest(texte, sourceInvest()) : null; }
  return repondre(texte, sourceNavigateur());
}
