/* ═════════════ RÈGLES DES ALERTES (module pur ; testé : planetes/mars/tests/alertes-regles-test.mjs) ═════════════
   Partagé par le Veilleur (Node, sur le PC) et la page. Aucune IA, aucun réseau, aucun ordre de trading : on décide seulement SI et COMMENT prévenir Justin.
   Quatre types : ENTREE (seulement une stratégie VALIDÉE par le backtest), PREPARATION (setup en formation), OBSERVATION (situation notable, NON validée, jamais présentée comme une entrée), MACRO (rappel avant
   un événement important, résultat après).
   Anti-saturation : types activables, heures silencieuses, dédoublonnage, repos entre deux alertes, maximum par jour et par semaine (PREPARATION + OBSERVATION), maximum de rappels MACRO par jour.
   ENTREE n'a pas de plafond ici : elle est déjà limitée par l'agent (positions par semaine, repos après sortie) et c'est la seule alerte qui compte vraiment. */

export const TYPES = ['ENTREE', 'PREPARATION', 'OBSERVATION', 'MACRO'];
export const REGLAGES_DEFAUT = Object.freeze({
  actif: false,                                   // le Veilleur n'envoie rien tant que Justin ne l'a pas activé
  canaux: Object.freeze({ telegram: true, application: true }),
  types: Object.freeze({ ENTREE: true, PREPARATION: true, OBSERVATION: false, MACRO: true }),
  maxParJour: 5, maxParSemaine: 15, maxMacroParJour: 4,
  reposMinutes: 20,                               // entre deux alertes PREPARATION / OBSERVATION
  dedoublonnageMinutes: 360,                      // même situation (même clé) : pas deux fois dans ce délai
  silence: true, silenceDebut: '23:00', silenceFin: '07:00', entreeToujours: false,
  macroAvantMinutes: Object.freeze([60, 15]), macroImpactMin: 'high', macroResultat: true,
  volumeSeuil: 2.5                                // OBSERVATION : volume 4 h au moins N fois la normale
});
const IMPACTS = { low: 1, medium: 2, high: 3 };
const num = (v, min, max, def) => { const x = Number(v); return Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : def; };
const hhmm = (v, def) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v)) ? String(v) : def);

/* Réglages envoyés par l'interface : on garde seulement ce qui est connu, borné et typé. */
export function reglagesValides(patch, base = REGLAGES_DEFAUT) {
  const p = patch || {}, r = JSON.parse(JSON.stringify(base));
  if ('actif' in p) r.actif = !!p.actif;
  if (p.canaux) for (const k of Object.keys(r.canaux)) if (k in p.canaux) r.canaux[k] = !!p.canaux[k];
  if (p.types) for (const k of TYPES) if (k in p.types) r.types[k] = !!p.types[k];
  if ('maxParJour' in p) r.maxParJour = Math.round(num(p.maxParJour, 0, 50, r.maxParJour));
  if ('maxParSemaine' in p) r.maxParSemaine = Math.round(num(p.maxParSemaine, 0, 200, r.maxParSemaine));
  if ('maxMacroParJour' in p) r.maxMacroParJour = Math.round(num(p.maxMacroParJour, 0, 20, r.maxMacroParJour));
  if ('reposMinutes' in p) r.reposMinutes = Math.round(num(p.reposMinutes, 0, 1440, r.reposMinutes));
  if ('dedoublonnageMinutes' in p) r.dedoublonnageMinutes = Math.round(num(p.dedoublonnageMinutes, 0, 4320, r.dedoublonnageMinutes));
  if ('silence' in p) r.silence = !!p.silence;
  if ('silenceDebut' in p) r.silenceDebut = hhmm(p.silenceDebut, r.silenceDebut);
  if ('silenceFin' in p) r.silenceFin = hhmm(p.silenceFin, r.silenceFin);
  if ('entreeToujours' in p) r.entreeToujours = !!p.entreeToujours;
  if (Array.isArray(p.macroAvantMinutes)) r.macroAvantMinutes = [...new Set(p.macroAvantMinutes.map(Number).filter(x => Number.isFinite(x) && x >= 1 && x <= 1440).map(Math.round))].sort((a, b) => b - a).slice(0, 4);
  if (p.macroImpactMin in IMPACTS) r.macroImpactMin = p.macroImpactMin;
  if ('macroResultat' in p) r.macroResultat = !!p.macroResultat;
  if ('volumeSeuil' in p) r.volumeSeuil = num(p.volumeSeuil, 1.2, 10, r.volumeSeuil);
  return r;
}

/* Minutes depuis minuit, heure de Paris. */
export function minutesParis(t) {
  const p = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(t));
  const g = ty => Number(p.find(x => x.type === ty).value);
  return (g('hour') % 24) * 60 + g('minute');
}
export const jourParis = t => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
const semaine = t => Math.floor((t - 4 * 86400000) / (7 * 86400000));   // semaines du lundi au dimanche (l'époque est un jeudi)
const versMin = s => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));

export function enSilence(t, r) {
  if (!r.silence) return false;
  const m = minutesParis(t), a = versMin(r.silenceDebut), b = versMin(r.silenceFin);
  if (a === b) return false;
  return a < b ? (m >= a && m < b) : (m >= a || m < b);
}

/* ── Historique des alertes envoyées : [{ id, type, cle, t }], gardé 45 jours. ── */
export const inscrire = (histo, alerte, t) => [...(histo || []).filter(x => t - x.t < 45 * 86400000), { id: alerte.id, type: alerte.type, cle: alerte.cle || alerte.id, t }];

/* Décide si une alerte part maintenant. Rend { envoyer, raison }. La raison est toujours donnée, pour le journal du Veilleur et pour l'interface. */
export function decider(histo, alerte, r, t) {
  const h = histo || [];
  if (!r.actif) return { envoyer: false, raison: 'veilleur désactivé' };
  if (!TYPES.includes(alerte.type)) return { envoyer: false, raison: 'type inconnu' };
  if (!r.types[alerte.type]) return { envoyer: false, raison: 'type ' + alerte.type + ' désactivé' };
  if (h.some(x => x.id === alerte.id)) return { envoyer: false, raison: 'déjà envoyée' };
  if (enSilence(t, r) && !(alerte.type === 'ENTREE' && r.entreeToujours)) return { envoyer: false, raison: 'heures silencieuses' };
  const cle = alerte.cle || alerte.id;
  if (h.some(x => x.cle === cle && t - x.t < r.dedoublonnageMinutes * 60000)) return { envoyer: false, raison: 'même situation déjà signalée il y a moins de ' + r.dedoublonnageMinutes + ' min' };
  if (alerte.type === 'PREPARATION' || alerte.type === 'OBSERVATION') {
    const bavardes = h.filter(x => x.type === 'PREPARATION' || x.type === 'OBSERVATION');
    const derniere = bavardes.reduce((m, x) => Math.max(m, x.t), -Infinity);
    if (t - derniere < r.reposMinutes * 60000) return { envoyer: false, raison: 'repos de ' + r.reposMinutes + ' min entre deux alertes' };
    const jour = jourParis(t);
    if (bavardes.filter(x => jourParis(x.t) === jour).length >= r.maxParJour) return { envoyer: false, raison: 'maximum de ' + r.maxParJour + ' alertes par jour atteint' };
    if (bavardes.filter(x => semaine(x.t) === semaine(t)).length >= r.maxParSemaine) return { envoyer: false, raison: 'maximum de ' + r.maxParSemaine + ' alertes par semaine atteint' };
  }
  if (alerte.type === 'MACRO') {
    const jour = jourParis(t);
    if (h.filter(x => x.type === 'MACRO' && jourParis(x.t) === jour).length >= r.maxMacroParJour) return { envoyer: false, raison: 'maximum de ' + r.maxMacroParJour + ' rappels macro par jour atteint' };
  }
  return { envoyer: true, raison: 'ok' };
}

/* ── Mise en forme (texte simple : Telegram et notification) ── */
const f0 = x => (x == null || !Number.isFinite(x) ? 'n/d' : Math.round(x).toLocaleString('fr-FR'));
const f2 = x => (x == null || !Number.isFinite(x) ? 'n/d' : x.toLocaleString('fr-FR', { maximumFractionDigits: 2 }));
const heureFr = t => new Date(t).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).replace(',', '');
const PIED = 'Pas un conseil financier. Raylé n’envoie aucun ordre.';

export function formaterMessage(a) {
  switch (a.type) {
    case 'ENTREE': {
      const dist = Math.abs(a.entree - a.stop), qte = a.risqueCash && dist ? a.risqueCash / dist : null;
      return ['🟢 ENTRÉE BITCOIN (stratégie validée)', (a.sens > 0 ? 'Sens : ACHAT' : 'Sens : VENTE'), 'Entrée : ' + f0(a.entree), 'Stop : ' + f0(a.stop), 'Objectif : ' + f0(a.cible) + ' (' + f2(a.R) + ' R)',
        'Taille : ' + (qte ? f2(qte) + ' BTC pour risquer ' + f0(a.risqueCash) + ' $ (' + f2(a.risquePct) + ' % du capital)' : 'selon ton risque'), 'Phase du marché : ' + (a.phase || 'n/d'),
        'Raison : ' + (a.raison || 'les conditions de « ' + (a.nomStrategie || 'la stratégie') + ' » sont réunies sur la bougie M15 fermée.'), 'Invalidation : ' + (a.invalidation || 'si le prix touche le stop avant l’entrée.'), PIED].join('\n');
    }
    case 'PREPARATION':
      return ['🟡 PRÉPARATION BITCOIN', a.texte.replace(/^PRÉPARATION · /, ''), 'Ce n’est pas encore une entrée : attendre la confirmation.', 'Phase du marché : ' + (a.phase || 'n/d'), PIED].join('\n');
    case 'OBSERVATION':
      return ['🔵 OBSERVATION BITCOIN — NON VALIDÉ', a.texte, 'Ce n’est PAS une entrée : aucune stratégie validée ne l’appuie.', PIED].join('\n');
    case 'MACRO':
      return ['🟠 MACRO — ' + a.titre, a.texte, PIED].join('\n');
    default: return a.texte || '';
  }
}

/* ── OBSERVATION : situations notables de la lecture du marché (jamais présentées comme des entrées) ──
   `precedent` = { phaseCode } de la lecture précédente (ou null). Rend { alertes, suivant }. */
export function observationsDepuisLecture(lec, precedent, r = REGLAGES_DEFAUT) {
  const suivant = lec && lec.ok ? { phaseCode: lec.phase.code } : precedent || null;
  if (!lec || !lec.ok) return { alertes: [], suivant };
  const out = [], t = lec.derniereBougie, tranche = Math.floor(t / 3600e3);
  const base = { type: 'OBSERVATION', validee: false, t };
  if (precedent && precedent.phaseCode != null && precedent.phaseCode !== lec.phase.code && !lec.phase.enChangement)
    out.push({ ...base, id: 'O:phase:' + lec.phase.code + ':' + Math.floor(t / 86400e3), cle: 'O:phase:' + lec.phase.code, texte: 'La phase H1 passe à « ' + lec.phase.phase + ' ». ' + (lec.phase.raison || '') });
  if (lec.volume.relatif4h != null && lec.volume.relatif4h >= r.volumeSeuil)
    out.push({ ...base, id: 'O:volume:' + tranche, cle: 'O:volume', texte: 'Volume sur 4 h à ' + f2(lec.volume.relatif4h) + ' fois la normale. ' + lec.direction.lecture + (lec.direction.estime ? ' (delta estimé)' : '') + '.' });
  if (lec.direction.divergence && lec.volume.relatif4h != null && lec.volume.relatif4h >= 1.5)
    out.push({ ...base, id: 'O:divergence:' + Math.floor(t / 14400e3), cle: 'O:divergence', texte: 'Divergence ' + lec.direction.divergence + ' avec un volume élevé.' });
  const z = lec.zones && (lec.zones.dessus && lec.zones.dessous ? (lec.zones.dessus.distanceATR < lec.zones.dessous.distanceATR ? lec.zones.dessus : lec.zones.dessous) : lec.zones.dessus || lec.zones.dessous);
  if (z && z.distanceATR != null && z.distanceATR < 0.3)
    out.push({ ...base, id: 'O:zone:' + z.type + ':' + Math.round(z.prix) + ':' + Math.floor(t / 7200e3), cle: 'O:zone:' + z.type, texte: 'Le prix (' + f0(lec.prix) + ') est sur « ' + z.type + ' » à ' + f0(z.prix) + '.' });
  return { alertes: out, suivant };
}

/* ── MACRO : rappels avant un événement important, résultat après. Événement : { id, titre, t (ms), impact: low|medium|high, pays?, precedent?, prevu?, reel?, type? ('resultats' pour une entreprise) } ──
   `vus` = ensemble d'identifiants déjà produits (le décideur écarte aussi les doublons). Rend la liste des alertes MACRO à envisager maintenant. */
export function alertesMacro(evenements, r, t) {
  const out = [], seuil = IMPACTS[r.macroImpactMin] || 3;
  for (const e of evenements || []) {
    if (!e || !Number.isFinite(e.t) || (IMPACTS[e.impact] || 0) < seuil) continue;
    const detail = (e.pays ? e.pays + ' · ' : '') + 'à ' + heureFr(e.t) + (e.precedent != null ? ' · précédent ' + e.precedent : '') + (e.prevu != null ? ' · prévu ' + e.prevu : '');
    for (const m of r.macroAvantMinutes || []) {
      const reste = e.t - t;
      if (reste > 0 && reste <= m * 60000)
        out.push({ id: 'M:' + e.id + ':avant:' + m, cle: 'M:' + e.id + ':avant:' + m, evt: e.id, type: 'MACRO', t, titre: e.titre, texte: 'Dans ' + Math.max(1, Math.round(reste / 60000)) + ' min. ' + detail + '. Prévoir de la volatilité.' });
    }
    if (r.macroResultat && e.reel != null && e.t <= t && t - e.t < 3 * 3600e3)
      out.push({ id: 'M:' + e.id + ':resultat', cle: 'M:' + e.id + ':resultat', type: 'MACRO', t, titre: 'Résultat : ' + e.titre, texte: 'Publié : ' + e.reel + (e.prevu != null ? ' (prévu ' + e.prevu + ')' : '') + (e.precedent != null ? ' (précédent ' + e.precedent + ')' : '') + '.' });
  }
  // un seul rappel « avant » par événement : le plus proche de l'échéance
  const parEvt = new Map();
  for (const a of out) { const m = Number((a.id.match(/:avant:(\d+)$/) || [])[1]); if (!/:avant:/.test(a.id)) continue; if (!parEvt.has(a.evt) || m < parEvt.get(a.evt).m) parEvt.set(a.evt, { a, m }); }
  return out.filter(a => !/:avant:/.test(a.id) || parEvt.get(a.evt).a === a);
}
