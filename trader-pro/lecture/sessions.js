/* ═════════════ SESSIONS DE MARCHÉ : horaires réels, décalage heure d'été / hiver géré automatiquement ═════════════
   Chaque session est définie à l'HEURE LOCALE de sa place financière (jamais en UTC fixe) : le décalage change tout seul aux dates où chaque pays change d'heure, y compris les semaines où
   l'Europe et les États-Unis ne changent pas en même temps (≈ 3 semaines en mars, 1 semaine en octobre / novembre).
   Journée de session « J » (étiquetée par sa date UTC) :
     · Asie     : ouverture de Tokyo (09:00 JST, UTC+9 toute l'année) → ouverture de Londres (08:00 Londres)
     · Londres  : 08:00 Londres → 08:00 New York (le « chevauchement » Londres–New York commence à 08:00 New York ≈ 13:00 UTC en hiver)
     · New York : 08:00 New York (ouverture des futures américains, COMEX de l'or 08:20) → 17:00 New York (l'ouverture CASH du Nasdaq / S&P est à 09:30 New York, dedans)
     · Creux    : 17:00 New York → ouverture de Tokyo suivante (liquidité faible)
   Fonctions pures, testées, utilisables dans le navigateur, Node et le Worker. */
export const H = 3600e3, MIN = 60e3, J = 86400e3;
export const TZ = Object.freeze({ tokyo: 'Asia/Tokyo', londres: 'Europe/London', newyork: 'America/New_York', paris: 'Europe/Paris' });

const FORMATEURS = new Map();
function formateur(tz) {
  let f = FORMATEURS.get(tz);
  if (!f) { f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }); FORMATEURS.set(tz, f); }
  return f;
}
/* décalage (heure locale − UTC), en ms, d'un fuseau à l'instant t */
export function decalageMs(tz, t) {
  const p = formateur(tz).formatToParts(new Date(t)), g = k => +p.find(x => x.type === k).value;
  return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute'), g('second')) - Math.floor(t / 1000) * 1000;
}
/* instant UTC (ms) de l'heure murale h:mi du jour a-m-j dans le fuseau tz (m de 1 à 12) */
export function instantLocal(a, m, j, h, mi, tz) {
  const brut = Date.UTC(a, m - 1, j, h, mi); let t = brut - decalageMs(tz, brut); t = brut - decalageMs(tz, t); return t;
}
export const decalageHeures = (tz, t) => decalageMs(tz, t) / H;

export const SESSIONS = Object.freeze([
  { id: 'asie', nom: 'Asie' }, { id: 'londres', nom: 'Londres' }, { id: 'newyork', nom: 'New York' }, { id: 'creux', nom: 'Creux du soir' }
]);
export const NOM_SESSION = Object.freeze({ asie: 'Asie', londres: 'Londres', newyork: 'New York', creux: 'creux du soir' });

/* les 4 fenêtres de la journée de session dont la date UTC est (a, m, j) */
export function fenetresDuJour(a, m, j) {
  const asie0 = instantLocal(a, m, j, 9, 0, TZ.tokyo), lon0 = instantLocal(a, m, j, 8, 0, TZ.londres), ny0 = instantLocal(a, m, j, 8, 0, TZ.newyork), ny1 = instantLocal(a, m, j, 17, 0, TZ.newyork);
  const asieSuiv = instantLocal(a, m, j + 1, 9, 0, TZ.tokyo);
  return [
    { id: 'asie', nom: 'Asie', debut: asie0, fin: lon0 },
    { id: 'londres', nom: 'Londres', debut: lon0, fin: ny0 },
    { id: 'newyork', nom: 'New York', debut: ny0, fin: ny1 },
    { id: 'creux', nom: 'Creux du soir', debut: ny1, fin: asieSuiv }
  ];
}
const dateUTC = t => { const d = new Date(t); return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()]; };
export function fenetresDe(t) { const [a, m, j] = dateUTC(t); return fenetresDuJour(a, m, j); }
/* session en cours à l'instant t */
export function sessionEn(t) {
  const F = fenetresDe(t); for (const f of F) if (t >= f.debut && t < f.fin) return { ...f, jour: dateUTC(t).join('-') };
  const [a, m, j] = dateUTC(t - J), F2 = fenetresDuJour(a, m, j); for (const f of F2) if (t >= f.debut && t < f.fin) return { ...f, jour: [a, m, j].join('-') };
  return { ...F[0], jour: dateUTC(t).join('-') };
}
/* les sessions COMPLÈTES ou en cours des `jours` derniers jours de session, de la plus ancienne à la plus récente (la dernière peut être en cours) */
export function sessionsRecentes(t, jours = 3) {
  const out = []; for (let k = jours; k >= 0; k--) { const d = t - k * J, [a, m, j] = dateUTC(d); for (const f of fenetresDuJour(a, m, j)) if (f.debut <= t) out.push({ ...f, jour: [a, m, j].join('-'), enCours: f.fin > t }); }
  return out;
}
/* fin de la dernière session New York terminée (17 h New York) : début de « la nuit » */
export function debutNuit(t) {
  const L = sessionsRecentes(t, 3).filter(s => s.id === 'newyork' && !s.enCours); return L.length ? L[L.length - 1].fin : t - 12 * H;
}
export const heureParis = (t, opts = {}) => new Date(t).toLocaleTimeString('fr-FR', { timeZone: TZ.paris, hour: '2-digit', minute: '2-digit', ...opts });
export const jourHeureParis = t => new Date(t).toLocaleString('fr-FR', { timeZone: TZ.paris, weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
/* « de 01 h 00 à 09 h 00 (Paris) » */
export function plageParis(f) {
  const h = t => new Date(t).toLocaleTimeString('fr-FR', { timeZone: TZ.paris, hour: '2-digit', minute: '2-digit' }).replace(':', ' h ');
  return `${h(f.debut)} – ${h(f.fin)} (Paris)`;
}
/* tableau des heures de Paris des repères du jour (pour la base de connaissances et l'écran) */
export function reperesDuJour(t) {
  const [a, m, j] = dateUTC(t), P = x => new Date(x).toLocaleTimeString('fr-FR', { timeZone: TZ.paris, hour: '2-digit', minute: '2-digit' }).replace(':', ' h ');
  const ny = (h, mi) => instantLocal(a, m, j, h, mi, TZ.newyork), lo = (h, mi) => instantLocal(a, m, j, h, mi, TZ.londres);
  return {
    tokyoOuverture: P(instantLocal(a, m, j, 9, 0, TZ.tokyo)), londresOuverture: P(lo(8, 0)), londresFixingOr: P(lo(10, 30)), londresFixingOrPM: P(lo(15, 0)), londresCloture: P(lo(16, 30)),
    comexOr: P(ny(8, 20)), futuresNY: P(ny(8, 0)), ouvertureCashUS: P(ny(9, 30)), clotureCashUS: P(ny(16, 0)), clotureNY: P(ny(17, 0)),
    decalageParisNewYork: decalageHeures(TZ.paris, t) - decalageHeures(TZ.newyork, t), decalageParisLondres: decalageHeures(TZ.paris, t) - decalageHeures(TZ.londres, t)
  };
}
/* killzones (créneaux où l'on observe le plus de mouvement), à l'heure locale des places : Londres 02:00–05:00 et New York 07:00–10:00 (heure de New York), plus l'ouverture de Londres 08:00–10:00 (heure de Londres) */
export function killzones(t) {
  const [a, m, j] = dateUTC(t);
  return [
    { id: 'kz-londres', nom: 'Killzone Londres', debut: instantLocal(a, m, j, 2, 0, TZ.newyork), fin: instantLocal(a, m, j, 5, 0, TZ.newyork) },
    { id: 'kz-ouverture-londres', nom: 'Ouverture de Londres', debut: instantLocal(a, m, j, 8, 0, TZ.londres), fin: instantLocal(a, m, j, 10, 0, TZ.londres) },
    { id: 'kz-newyork', nom: 'Killzone New York', debut: instantLocal(a, m, j, 7, 0, TZ.newyork), fin: instantLocal(a, m, j, 10, 0, TZ.newyork) }
  ];
}
