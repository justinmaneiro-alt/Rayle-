/* Modèle d'affichage de la stratégie Rayle v1 (pur, testé) : choisit ce qui est visible en mode Épuré ou Complet, écrit les phrases de mesure (toujours avec n et la base),
   compte les objets visibles (maximum 12 hors bougies et moyenne mobile en Épuré). Aucune décision : une description, jamais un ordre. */
import * as MA from './ma-evenements-v1.js';
export const MAX_EPURE = 12, H = 3600e3;
const pc = x => (x == null ? '—' : Math.round(x * 100) + ' %');
const nb = (x, d = 0) => (x == null || !Number.isFinite(x) ? '—' : Number(x).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/[  ]/g, ' '));
export const hp = t => new Date(t).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const CLE_STATS = { cassure: 'cassure', confirmee: 'cassure_confirmee', fausse: 'cassure_fausse', rebond: 'rebond' };
const NOM_CAR = { corps: 'corps de la bougie', volume: 'volume de ticks', extension: 'extension avant la cassure', pente: 'pente de la MA', h4: 'tendance H4', session: 'session' };

/* phrase de mesure d'une cellule { n, taux, ic, base, part, basePart, verdict } : toujours n et la base à côté ; jamais un mot fort sans écart net */
export function phraseCellule(c, nom) {
  if (!c) return `${nom} : mesure indisponible`; if (!c.assez) return `${nom} : pas assez de données (n = ${c.n}, il en faut 30)`;
  const mot = c.verdict === 'au-dessus de la base' ? ' → au-dessus de la base' : c.verdict === 'en dessous de la base' ? ' → en dessous de la base' : ' → pas nettement différent de la base';
  return `${nom} (n = ${c.n}) : continuation ${pc(c.taux)} [${pc(c.ic[0])} – ${pc(c.ic[1])}] contre ${pc(c.base)} pour la base (mêmes conditions, toutes les bougies) ; parmi les issues tranchées ${pc(c.part)} contre ${pc(c.basePart)}${mot}`;
}
export function phrasesMesure(stats, e) {
  const cle = CLE_STATS[e.type]; const q = stats && stats.evenements && cle && stats.evenements[cle] && stats.evenements[cle][e.dir > 0 ? 'haussier' : 'baissier'];
  if (!q) return ['mesure indisponible (statistiques non chargées)'];
  return [phraseCellule(q.long, '2015–2025'), phraseCellule(q.recent, '18 derniers mois')];
}
export function lignesProfil(stats, e) {
  if (!e.profil || !stats || !stats.classes) return [];
  const L = [];
  for (const c of MA.CARACTERISTIQUES) {
    const v = e.profil[c], cel = stats.classes[`${c}=${v}`], x = cel && cel.long;
    L.push(`${NOM_CAR[c]} : ${v}` + (x && x.n >= 30 ? ` — cassures de cette classe : continuation ${pc(x.taux)} (n = ${x.n}) contre ${pc(x.base)} pour la base, devient vraie ${pc(cel.vraie.long.taux)} des fois` : x ? ` — pas assez de données (n = ${x.n})` : ''));
  }
  return L;
}
const DEFS = {
  cassure: 'clôture H1 de l\'autre côté de la moyenne mobile avec un écart d\'au moins 0,25 ATR ; à confirmer dans les 6 bougies',
  confirmee: 'retest de la moyenne mobile qui tient en clôture, ou 3 clôtures consécutives au-delà, dans les 6 bougies suivant la cassure',
  fausse: 'clôture de retour du côté d\'origine dans les 6 bougies suivant la cassure',
  rebond: 'extrême à 0,25 ATR ou moins de la moyenne mobile, puis clôture à 0,5 ATR ou plus dans les 3 bougies, sans clôture de l\'autre côté',
  expiree: 'ni confirmée ni réintégrée au bout de 6 bougies'
};
/* événements de la MA à afficher. Épuré : les 2 derniers événements récents non résolus ou résolus (la cassure résolue disparaît derrière son issue) ; Complet : les 12 derniers, les anciens grisés. */
export function evenementsAffiches(res, B, { vue = 'epure', stats = null, max = null } = {}) {
  if (!res || !B.length) return [];
  const n = B.length, resolus = new Set(res.events.filter(e => e.ref).map(e => e.ref));
  let L = res.events.filter(e => e.type !== 'expiree');
  if (vue === 'epure') L = L.filter(e => !(e.type === 'cassure' && resolus.has(e.id)) && n - 1 - e.i <= 120);
  L = L.slice(-(max ?? (vue === 'epure' ? 2 : 12)));
  return L.map(e => {
    const b = B[e.i], sens = e.dir > 0 ? 'haussière' : 'baissière', recent = n - 1 - e.i <= 24;
    const nom = e.type === 'fausse' ? `Fausse cassure ${e.dir > 0 ? 'baissière' : 'haussière'}, réintégration` : e.type === 'rebond' ? `Rebond sur la MA (${e.dir > 0 ? 'appui' : 'résistance'})` : `${MA.NOMS[e.type]} ${sens}`;
    const lib = e.type === 'fausse' ? MA.etiquette({ ...e, type: 'fausse' }, stats) : MA.etiquette(e, stats);
    return {
      id: e.id, type: e.type, dir: e.dir, t: b.t, p: e.dir > 0 ? b.l : b.h, nom, etiquette: lib, grise: vue === 'complet' && !recent || (e.type === 'cassure' && resolus.has(e.id)),
      detail: [`posé à la clôture de la bougie H1 du ${hp(b.t)} (heure de Paris), jamais modifié ensuite`, DEFS[e.type], `MA ${nb(e.niveau, 2)} · ATR ${nb(e.atr, 2)}`, ...phrasesMesure(stats, e), ...lignesProfil(stats, e), 'lecture en observation, jamais un ordre'].filter(Boolean)
    };
  });
}
/* compte les objets visibles d'un modèle (hors bougies et hors ligne de moyenne mobile) */
export function compterObjets(m) {
  if (!m) return 0; let c = 0;
  c += (m.evenements || []).length; c += (m.boites || []).length; if (m.ligne) c++;
  c += (m.structure || []).length; c += (m.aplus || []).length; c += (m.niveaux || []).length; c += (m.annotations || []).length;
  if (m.scenarios) c += (m.scenarios.actifs || []).length;
  return c;
}
/* texte du bandeau d'état de la moyenne mobile */
export function texteMa(res, B) {
  if (!res || !B.length) return 'Moyenne mobile : pas assez de bougies H1 (il en faut 200).';
  const E = res.etat; if (E.ma == null) return 'Moyenne mobile : pas assez de bougies H1 (il en faut 200).';
  const cote = E.cote > 0 ? 'au-dessus' : E.cote < 0 ? 'en dessous' : 'sur'; const d = E.dernier;
  let s = `Le prix est ${cote} de la ${res.mode === 'jour' ? 'moyenne mobile 200 jours' : 'moyenne mobile 200 H1'} (${nb(E.ma, 2)}), à ${nb(Math.abs(E.ecartAtr), 2)} ATR.`;
  if (E.enAttente.length) { const e = E.enAttente[E.enAttente.length - 1]; s += ` Cassure ${e.dir > 0 ? 'haussière' : 'baissière'} à confirmer (${hp(B[e.i].t)}).`; }
  else if (d) s += ` Dernier événement : ${MA.NOMS[d.type].toLowerCase()} le ${hp(B[d.i].t)}.`;
  return s;
}
