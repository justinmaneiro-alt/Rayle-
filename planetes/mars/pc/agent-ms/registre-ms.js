import { validerStrategie, cleStrategie, strategieVide } from './strategie-ms.js';

/* ═════════════ MES STRATÉGIES : REGISTRE NOMMÉ, MODIFIABLE, DUPLIQUABLE, AVEC COMPTEUR DE VARIANTES (V1 ; module pur, testé : ms-registre-test.mjs) ═════════════
   - Plusieurs stratégies nommées ; modifier, dupliquer, supprimer. Toute MODIFICATION d'une règle retire la validation de l'utilisatrice (`valideeLe`) ET coupe le mode alertes : il faut relire la
     description et valider de nouveau (jamais de règle appliquée sans validation humaine).
   - COMPTEUR DE VARIANTES par LIGNÉE : une stratégie et toutes ses copies (dupliquer ne remet pas le compteur à zéro). Chaque règle DIFFÉRENTE testée (clé de règle distincte) ajoute 1 ; retester la même règle
     n'ajoute rien. Ce nombre alimente le Sharpe déflaté et l'avertissement de sur-ajustement (test-ms.js).
   - Aucun test, aucun résultat n'est effacé en silence : l'historique des variantes testées est gardé (clé, date, verdict, espérance). */
export const VERSION_REGISTRE = 1;
const nouvelId = (t, k) => 'ms' + t.toString(36) + k.toString(36);

export function creerRegistre(etat = null, { maintenant = () => Date.now() } = {}) {
  let e = etat && etat.version === VERSION_REGISTRE && Array.isArray(etat.strategies) ? JSON.parse(JSON.stringify(etat)) : { version: VERSION_REGISTRE, strategies: [], compteurId: 0 };
  const recs = () => e.strategies, par = id => recs().find(x => x.id === id) || null;
  const prochainId = () => { e.compteurId++; return nouvelId(maintenant(), e.compteurId); };
  const lignee = id => { const r = par(id); return r ? recs().filter(x => x.lignee === r.lignee) : []; };
  const nVariantes = id => new Set(lignee(id).flatMap(x => x.variantes.map(v => v.cle))).size;
  const vue = r => ({ ...r, nVariantes: nVariantes(r.id), cle: cleStrategie(r.strategie), valide: !!r.valideeLe });

  return {
    liste: () => recs().map(vue),
    obtenir: id => (par(id) ? vue(par(id)) : null),
    /* Crée une stratégie (brouillon NON validée). Rend { ok, id, erreurs, avertissements }. */
    creer(brut, { source = 'blocs', texteLibre = null } = {}) {
      const v = validerStrategie(brut || strategieVide()); if (!v.ok) return { ok: false, erreurs: v.erreurs, avertissements: v.avertissements };
      const id = prochainId(), t = maintenant();
      recs().push({ id, lignee: id, nom: v.strategie.nom, strategie: { ...v.strategie, id }, source, texteLibre, creeLe: t, modifieLe: t, valideeLe: null, nModifs: 0, variantes: [], dernierTest: null, alertes: { actif: false, depuis: null, confirmeLe: null } });
      return { ok: true, id, erreurs: [], avertissements: v.avertissements };
    },
    /* Modifie la règle ou le nom. Si la RÈGLE change : validation retirée, alertes coupées. */
    modifier(id, brut) {
      const r = par(id); if (!r) return { ok: false, erreurs: ['stratégie introuvable'] };
      const v = validerStrategie({ ...r.strategie, ...brut, id }); if (!v.ok) return { ok: false, erreurs: v.erreurs, avertissements: v.avertissements };
      const change = cleStrategie(v.strategie) !== cleStrategie(r.strategie);
      r.strategie = { ...v.strategie, id }; r.nom = v.strategie.nom; r.modifieLe = maintenant();
      if (change) { r.nModifs++; r.valideeLe = null; r.alertes = { actif: false, depuis: null, confirmeLe: null }; }
      return { ok: true, change, erreurs: [], avertissements: v.avertissements };
    },
    renommer(id, nom) { const r = par(id); if (!r) return false; r.nom = String(nom || '').trim().slice(0, 60) || r.nom; r.strategie.nom = r.nom; r.modifieLe = maintenant(); return true; },
    /* Duplique : même lignée (le compteur de variantes continue), validation et alertes à refaire. */
    dupliquer(id, nom = null) {
      const r = par(id); if (!r) return { ok: false, erreurs: ['stratégie introuvable'] };
      const nid = prochainId(), t = maintenant();
      recs().push({ id: nid, lignee: r.lignee, nom: nom || r.nom + ' (copie)', strategie: { ...JSON.parse(JSON.stringify(r.strategie)), id: nid, nom: nom || r.nom + ' (copie)' }, source: r.source, texteLibre: r.texteLibre, creeLe: t, modifieLe: t, valideeLe: null, nModifs: 0, variantes: [], dernierTest: null, alertes: { actif: false, depuis: null, confirmeLe: null } });
      return { ok: true, id: nid };
    },
    supprimer(id) { const n = recs().length; e.strategies = recs().filter(x => x.id !== id); return e.strategies.length < n; },
    /* L'utilisatrice a RELU la description et la valide : seule voie pour qu'une règle puisse être testée en alertes. */
    valider(id) { const r = par(id); if (!r) return false; r.valideeLe = maintenant(); return true; },
    /* Enregistre un test : compte la variante si la règle est NOUVELLE dans la lignée. Rend { nouvelle, nVariantes } (nVariantes inclut ce test). */
    enregistrerTest(id, { verdict = null, paires = [], esperance = null, n = null } = {}) {
      const r = par(id); if (!r) return null;
      const cle = cleStrategie(r.strategie), deja = new Set(lignee(id).flatMap(x => x.variantes.map(v => v.cle))), nouvelle = !deja.has(cle);
      if (nouvelle || !r.variantes.some(v => v.cle === cle)) r.variantes.push({ cle, t: maintenant(), verdict, paires, esperance, n });
      r.dernierTest = { t: maintenant(), cle, verdict, paires, esperance, n };
      return { nouvelle, nVariantes: nVariantes(id) };
    },
    /* Nombre de variantes comptées si on testait la règle actuelle maintenant (sans rien enregistrer). */
    variantesAvecTest(id) { const r = par(id); if (!r) return 0; const deja = new Set(lignee(id).flatMap(x => x.variantes.map(v => v.cle))); return deja.size + (deja.has(cleStrategie(r.strategie)) ? 0 : 1); },
    /* Mode alertes : seulement pour une stratégie VALIDÉE par l'utilisatrice et déjà TESTÉE ; `confirme` = elle a lu l'étiquette (NON VALIDÉE comprise). */
    reglerAlertes(id, actif, { confirme = false } = {}) {
      const r = par(id); if (!r) return { ok: false, erreur: 'stratégie introuvable' };
      if (!actif) { r.alertes = { actif: false, depuis: null, confirmeLe: null }; return { ok: true }; }
      if (!r.valideeLe) return { ok: false, erreur: 'relis d’abord la description et valide la stratégie : jamais de règle appliquée sans ta validation' };
      if (!r.dernierTest || r.dernierTest.cle !== cleStrategie(r.strategie)) return { ok: false, erreur: 'teste d’abord cette version de la stratégie (le dernier test porte sur une autre version)' };
      if (r.dernierTest.verdict !== 'bat_le_hasard' && !confirme) return { ok: false, erreur: 'cette stratégie est NON VALIDÉE (elle ne bat pas le hasard ou manque de trades) : confirme explicitement que tu veux quand même des alertes', demandeConfirmation: true };
      r.alertes = { actif: true, depuis: maintenant(), confirmeLe: confirme ? maintenant() : null }; return { ok: true };
    },
    alertesActives: () => recs().filter(x => x.alertes.actif && x.valideeLe).map(vue),
    etat: () => JSON.parse(JSON.stringify(e))
  };
}
