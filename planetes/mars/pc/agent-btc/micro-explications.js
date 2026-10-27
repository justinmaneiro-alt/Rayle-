import { CONCEPTS_PAR_ID, expliquerConcept, phraseCourte } from './micro-concepts.js';

/* ═════════════ EXPLICATIONS PARLÉES DE LA MICROSTRUCTURE, AVEC LES MESURES EN COURS (M4 ; module pur, testé : agent-micro-test.mjs) ═════════════
   Modèles de phrases à partir de `instantane().micro` (micro-mesures.js:lireMicro). Aucune IA, aucun jeton. Une donnée absente est dite absente ; ce qui est ESTIMÉ est dit estimé.
   Réponses parlées : phrases courtes, pas de markdown. On ne dit jamais qu'un acteur précis manipule le marché. */
const nb = (x, d = 0) => (x == null || !Number.isFinite(x) ? 'inconnu' : x.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }));
const prix = x => nb(x, 0) + ' dollars';
const heureUTC = h => { const hh = Math.floor(h), mm = Math.round((h - hh) * 60); return hh + ' heures' + (mm ? ' ' + mm : '') + ' UTC'; };
const SANS = 'Je n’ai pas encore de mesures sur le Bitcoin : active l’agent pour télécharger l’historique.';

export function expliquerMicro(sujet, concept, s) {
  if (sujet === 'micro') {
    const base = expliquerConcept(concept); if (!base) return null;
    const m = s && s.micro; if (!m || !m.ok) return base + ' ' + (m && m.raison ? m.raison : SANS);
    return base + ' ' + enCours(concept, m);
  }
  const m = s && s.micro; if (!m || !m.ok) return m && m.raison ? m.raison : SANS;
  if (sujet === 'session') {
    const ses = m.session;
    let t = 'La session en cours est ' + ses.nom + ', il est ' + heureUTC(ses.heureUTC) + '.';
    if (ses.asie) t += ' Le haut de la session asiatique est à ' + prix(ses.asie.haut) + ' et le bas à ' + prix(ses.asie.bas) + '.'; else if (ses.code === 0) t += ' La session asiatique n’est pas terminée, ses extrêmes ne sont pas encore connus.';
    return t + ' ' + CONCEPTS_PAR_ID.sessions.limites;
  }
  if (sujet === 'zones') {
    const z = m.zones || [], dessus = z.filter(x => x.cote === 'dessus').slice(0, 3), dessous = z.filter(x => x.cote === 'dessous').slice(0, 3);
    if (!z.length) return 'Je ne repère pas de zone de liquidité nette près du prix pour le moment. Ce sont des zones probables, je ne vois pas le carnet d’ordres.';
    const fmt = l => l.map(x => x.type + ' à ' + prix(x.prix) + ' (' + nb(x.distanceATR, 1) + ' ATR)').join(', ');
    return 'Bitcoin à ' + prix(m.prix) + '. ' + (dessus.length ? 'Au-dessus : ' + fmt(dessus) + '. ' : '') + (dessous.length ? 'En dessous : ' + fmt(dessous) + '. ' : '') + 'Ce sont des zones où des ordres sont probables, pas certaines : je ne vois pas le carnet d’ordres.';
  }
  if (sujet === 'micro_resume') return ['session', 'vwap', 'flux', 'financement', 'interet_ouvert'].map(c => enCours(c, m)).filter(Boolean).join(' ');
  return null;
}

/* Une phrase sur l'état actuel pour un concept (ou '' si rien d'utile). */
export function enCours(concept, m) {
  switch (concept) {
    case 'sessions': case 'session': return 'En ce moment : session ' + m.session.nom + '.' + (m.session.asie ? ' Asie : haut ' + prix(m.session.asie.haut) + ', bas ' + prix(m.session.asie.bas) + '.' : '');
    case 'liquidite': {
      const z = (m.zones || []).slice(0, 2); return z.length ? 'En ce moment, les zones les plus proches sont : ' + z.map(x => x.type + ' à ' + prix(x.prix) + ' (' + (x.cote === 'dessus' ? 'au-dessus' : 'en dessous') + ')').join(', ') + '.' : 'En ce moment, pas de zone nette près du prix.';
    }
    case 'balayage': {
      const z = (m.zones || []).filter(x => /Asie|veille/.test(x.type)).slice(0, 2); return z.length ? 'Les extrêmes que je surveille : ' + z.map(x => x.type + ' à ' + prix(x.prix)).join(', ') + '. Je n’ai aucune alerte de balayage : aucune stratégie ne l’exploite tant qu’elle n’est pas validée.' : 'Je n’ai pas d’extrême de session à surveiller pour le moment.';
    }
    case 'absorption': {
      const a = m.flux && m.flux.absorption; return a ? 'En ce moment : ' + a.texte + '.' : 'En ce moment, la dernière bougie ne montre pas d’absorption.';
    }
    case 'desequilibre': case 'flux': {
      const f = m.flux; if (!f || f.deltaRatio == null) return '';
      const r = f.deltaRatio; return 'Sur la dernière bougie, le delta représente ' + nb(r * 100, 0) + ' pour cent du volume (' + (r > 0.05 ? 'acheteurs agressifs dominants' : r < -0.05 ? 'vendeurs agressifs dominants' : 'équilibre') + '), volume ' + nb(f.volRel, 1) + ' fois la normale. Le delta est ' + (f.estime ? 'estimé' : 'réel') + '.';
    }
    case 'vwap': {
      const w = m.vwap; return w ? 'En ce moment, le VWAP du jour est à ' + prix(w.prix) + ' et le prix est à ' + nb(Math.abs(w.ecarts), 1) + ' écart-type ' + (w.ecarts >= 0 ? 'au-dessus' : 'en dessous') + '. VWAP calculé sur ' + w.plateforme + '.' : '';
    }
    case 'prix_ronds': { const r = (m.ronds || []).slice().sort((a, b) => a.distanceATR - b.distanceATR)[0]; return r ? 'Le prix rond le plus proche est ' + prix(r.prix) + ', à ' + nb(r.distanceATR, 1) + ' ATR.' : ''; }
    case 'volatilite': return m.volatilite ? 'En ce moment : ' + m.volatilite.note + '.' : '';
    case 'financement': {
      const f = m.financement; return f && f.etat === 'reel' ? 'Le financement Binance est de ' + nb(f.tauxPct, 4) + ' pour cent par période de 8 heures : ' + f.note + '. Donnée réelle, d’une seule plateforme.' : 'Je n’ai pas les données de financement : active-les dans l’agent. Rien n’est estimé.';
    }
    case 'interet_ouvert': {
      const o = m.interetOuvert; return o && o.etat === 'reel' ? 'L’intérêt ouvert Binance est de ' + nb(o.valeur, 0) + ' bitcoins ; ' + o.lecture + '. Donnée réelle, d’une seule plateforme.' : 'Je n’ai pas les données d’intérêt ouvert : active-les dans l’agent. Rien n’est estimé.';
    }
    case 'liquidations': {
      const l = m.liquidations; return l && l.estime && !l.aucune ? 'Indice ESTIMÉ : une forte baisse de l’intérêt ouvert (' + nb(l.oiVar1h * 100, 1) + ' pour cent en une heure) avec une grande bougie suggère des positions ' + l.cote + ' fermées de force. Ce n’est pas une donnée réelle.' : l && l.etat === 'estime' ? 'Indice estimé : aucune purge détectée en ce moment. Je n’ai aucune donnée réelle de liquidations.' : 'Je n’ai pas de donnée de liquidations, ni d’indice estimé sans l’intérêt ouvert. Rien n’est affiché comme réel.';
    }
    default: return '';
  }
}

/* Phrases d'explication affichées sous chaque mesure de la fenêtre « Agent BTC » (une ligne). */
export const AIDE_MESURES = Object.fromEntries(['liquidite', 'balayage', 'absorption', 'desequilibre', 'sessions', 'prix_ronds', 'vwap', 'volatilite', 'financement', 'interet_ouvert', 'liquidations'].map(id => [id, phraseCourte(id)]));
