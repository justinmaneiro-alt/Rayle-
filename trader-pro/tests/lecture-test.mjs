/* Tests du moteur de lecture de marché (phase 1 du copilote) : sessions et heure d'été / hiver, tendance par unité, croisements de MA200 (confirmé, échoué, vraie cassure), bougies volume,
   mouvements par session, niveaux, gros mouvements calibrés, fiche complète sans regard vers l'avenir. Usage : node trader-pro/tests/lecture-test.mjs */
import { decalageHeures, instantLocal, TZ, fenetresDuJour, sessionEn, reperesDuJour, debutNuit, sessionsRecentes, killzones } from '../lecture/sessions.js';
import { tendanceUnite, croisementsMa200, bougiesVolumeRecentes, mouvementRecent, mouvementSessions, comportementSession, calibrerSeuil, grosMouvements, regime, PAS, H, J } from '../lecture/calculs.js';
import { construireFiche, agendaDuJour, actusDe } from '../lecture/fiche.js';
import { regrouper, enH4 } from '../commun/analyse.js';

let ok = 0, ko = 0; const v = (c, m) => { if (c) ok++; else { ko++; console.log('  ✗ ' + m); } };
const U = (a, m, j, h = 0, mi = 0) => Date.UTC(a, m - 1, j, h, mi);

console.log('— sessions : heures de Paris et décalages heure d’été / hiver —');
{
  v(decalageHeures(TZ.tokyo, U(2026, 11, 24)) === 9 && decalageHeures(TZ.tokyo, U(2026, 7, 1)) === 9, 'Tokyo : UTC+9 toute l’année');
  v(decalageHeures(TZ.londres, U(2026, 1, 15)) === 0 && decalageHeures(TZ.londres, U(2026, 7, 15)) === 1, 'Londres : UTC+0 en hiver, UTC+1 en été');
  v(decalageHeures(TZ.newyork, U(2026, 1, 15)) === -5 && decalageHeures(TZ.newyork, U(2026, 7, 15)) === -4, 'New York : UTC−5 en hiver, UTC−4 en été');
  // hiver : Paris − New York = 6 h ; été : 6 h ; semaines de décalage : États-Unis passent à l'été le 8 mars 2026, l'Europe le 29 mars 2026
  const diff = t => decalageHeures(TZ.paris, t) - decalageHeures(TZ.newyork, t);
  v(diff(U(2026, 2, 20, 12)) === 6, 'hiver : Paris est 6 h devant New York');
  v(diff(U(2026, 3, 18, 12)) === 5, 'semaines de décalage de mars (États-Unis déjà à l’heure d’été, Europe pas encore) : Paris n’est que 5 h devant');
  v(diff(U(2026, 4, 10, 12)) === 6, 'été : retour à 6 h');
  // octobre : l'Europe repasse à l'heure d'hiver le 25 octobre, les États-Unis le 1er novembre
  v(diff(U(2026, 10, 28, 12)) === 5, 'fin octobre (Europe déjà à l’heure d’hiver, États-Unis pas encore) : 5 h');
  v(diff(U(2026, 11, 3, 12)) === 6, 'novembre : retour à 6 h');
  // ouverture cash US (9 h 30 New York) en heure de Paris : 15 h 30 presque toute l'année, 14 h 30 pendant les semaines de décalage
  const ouv = t => reperesDuJour(t).ouvertureCashUS.replace(/\s/g, '');
  v(ouv(U(2026, 11, 24, 12)) === '15h30' && ouv(U(2026, 7, 14, 12)) === '15h30', 'ouverture cash du Nasdaq / S&P : 15 h 30 à Paris en hiver et en été');
  v(ouv(U(2026, 3, 18, 12)) === '14h30' && ouv(U(2026, 10, 28, 12)) === '14h30', 'ouverture cash : 14 h 30 à Paris pendant les semaines de décalage (mars, octobre)');
  const r = reperesDuJour(U(2026, 11, 24, 12)); v(r.londresOuverture.replace(/\s/g, '') === '09h00' && r.comexOr.replace(/\s/g, '') === '14h20' && r.tokyoOuverture.replace(/\s/g, '') === '01h00', 'hiver : Londres 9 h, COMEX or 14 h 20, Tokyo 1 h (Paris)');
  // fenêtres : 4 fenêtres contiguës qui couvrent tout le jour
  const F = fenetresDuJour(2026, 11, 24); v(F.length === 4 && F[0].fin === F[1].debut && F[1].fin === F[2].debut && F[2].fin === F[3].debut, 'les 4 fenêtres sont contiguës');
  v(F[0].debut === U(2026, 11, 24, 0, 0) && F[1].debut === U(2026, 11, 24, 8, 0) && F[2].debut === U(2026, 11, 24, 13, 0) && F[3].debut === U(2026, 11, 24, 22, 0), 'hiver : Asie 00 h UTC, Londres 08 h, New York 13 h, creux 22 h');
  const E = fenetresDuJour(2026, 7, 14); v(E[1].debut === U(2026, 7, 14, 7, 0) && E[2].debut === U(2026, 7, 14, 12, 0), 'été : Londres 07 h UTC, New York 12 h UTC');
  v(sessionEn(U(2026, 11, 24, 9, 30)).id === 'londres' && sessionEn(U(2026, 11, 24, 15, 0)).id === 'newyork' && sessionEn(U(2026, 11, 24, 3, 0)).id === 'asie' && sessionEn(U(2026, 11, 24, 23, 0)).id === 'creux', 'sessionEn identifie la session');
  v(debutNuit(U(2026, 11, 24, 7, 0)) === U(2026, 11, 23, 22, 0), 'la nuit commence à la clôture de New York de la veille (17 h New York)');
  v(sessionsRecentes(U(2026, 11, 24, 10, 0), 2).filter(s => s.enCours).length === 1, 'une seule session en cours');
  v(killzones(U(2026, 11, 24)).length === 3, 'killzones');
  v(instantLocal(2026, 3, 29, 8, 0, TZ.londres) === U(2026, 3, 29, 7, 0), 'le jour du changement d’heure (29 mars 2026) Londres est déjà à l’heure d’été à 8 h');
}

/* ───── données synthétiques : marche aléatoire M15 reproductible sur 420 jours ───── */
function aleatoire(graine) { let s = graine >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function genererM15({ jours = 420, fin = U(2026, 11, 24, 10, 0), graine = 7, prix0 = 1000, derive = 0, vol = 0.0012, volume = true } = {}) {
  const R = aleatoire(graine), n = jours * 96, B = []; let p = prix0; const t0 = Math.floor(fin / 900e3) * 900e3 - n * 900e3;
  for (let i = 0; i < n; i++) {
    const t = t0 + i * 900e3, o = p, ch = (R() - 0.5) * 2 * vol + derive, c = o * (1 + ch), h = Math.max(o, c) * (1 + R() * vol * 0.5), l = Math.min(o, c) * (1 - R() * vol * 0.5);
    B.push({ t, o, h, l, c, v: volume ? 100 * (0.7 + R() * 0.6) : 0 }); p = c;
  }
  return B;
}
const depuisM15 = (M15, maintenant) => ({ M15, H1: regrouper(M15, H, 0, maintenant).map(({ enCours, ...b }) => b), H4: enH4(M15, maintenant).map(({ enCours, ...b }) => b), J: regrouper(M15, J, 22 * H, maintenant).map(({ enCours, ...b }) => b) });
const MAINT = U(2026, 11, 24, 10, 0);

console.log('— tendance par unité : prix vs MA200, pente, distance en % et en ATR —');
{
  const M = genererM15({ derive: 0.00012, graine: 3 }), B = depuisM15(M, MAINT), T = tendanceUnite(B.J, 'J', MAINT);
  v(T.dispo && T.ma200 > 0 && T.position === 'dessus' && T.sens === 'haussier', 'marché qui monte : au-dessus de la MA200, sens haussier');
  v(Number.isFinite(T.ecartPct) && Number.isFinite(T.ecartAtr) && Number.isFinite(T.penteMa200Pct) && T.penteMa200Pct > 0, 'distance en % et en ATR, pente positive');
  const court = tendanceUnite(B.J.slice(0, 20), 'J', MAINT); v(!court.dispo && /pas assez/.test(court.raison), 'moins de 30 bougies : indisponible, avec la raison');
  const peu = tendanceUnite(B.J.slice(0, 100), 'J', MAINT); v(peu.dispo && peu.ma200 === null && /MA200 indisponible/.test(peu.raison), 'moins de 200 bougies : MA200 indisponible, jamais inventée');
  const bas = tendanceUnite(depuisM15(genererM15({ derive: -0.00012, graine: 3 }), MAINT).J, 'J', MAINT); v(bas.position === 'dessous' && bas.sens === 'baissier', 'marché qui baisse : sous la MA200, sens baissier');
  // une bougie en formation n'est jamais utilisée
  const enForm = B.J.concat([{ t: MAINT - 3600e3, o: 1, h: 2, l: 0.5, c: 1.5, v: 1 }]); v(tendanceUnite(enForm, 'J', MAINT).t === T.t, 'la bougie Daily en formation est ignorée');
}

console.log('— croisements de la MA200 : confirmé, échoué, vraie cassure —');
{
  // série H4 plate à 100 (ATR ≈ 1) puis scénarios construits à la main
  const plat = Array.from({ length: 210 }, (_, i) => ({ t: i * PAS.H4, o: 100, h: 100.5, l: 99.5, c: 100, v: 100 }));
  const suite = L => plat.concat(L.map(([c, vol], k) => ({ t: (210 + k) * PAS.H4, o: k ? L[k - 1][0] : 100, h: Math.max(c, k ? L[k - 1][0] : 100) + 0.3, l: Math.min(c, k ? L[k - 1][0] : 100) - 0.3, c, v: vol })));
  const fin = k => (210 + k) * PAS.H4 + 1;
  // tendance initiale haussière (clôture à 102), puis cassure baissière à 98 avec volume ×3, tenue 3 clôtures
  const A = suite([[102, 100], [98, 300], [97.5, 100], [97, 100], [96.8, 100]]), c = croisementsMa200(A, 'H4', 'btc', fin(5), { fenetre: 100 * PAS.H4 });
  v(c.length === 1 && c[0].dir === -1 && c[0].statut === 'confirmee' && c[0].tenue >= 2, 'cassure baissière tenue 3 clôtures : confirmée');
  v(c[0].vraieCassure && c[0].volumeRelMax >= 2.5, 'avec volume ×3 : « vraie cassure »');
  const B2 = suite([[102, 100], [98, 100], [97.5, 100], [97, 100]]), c2 = croisementsMa200(B2, 'H4', 'btc', fin(4), { fenetre: 100 * PAS.H4 }); v(c2[0].statut === 'confirmee' && !c2[0].vraieCassure && !c2[0].fortVolume, 'sans fort volume : confirmée mais pas « vraie cassure »');
  const C = suite([[102, 100], [98, 100], [101, 100], [101.5, 100]]), c3 = croisementsMa200(C, 'H4', 'btc', fin(4), { fenetre: 100 * PAS.H4 }); v(c3.length === 2 && c3[1].statut === 'echouee' && c3[0].dir === 1, 'cassure vite reperdue : « échouée » (fausse cassure) puis nouvelle cassure haussière');
  const D = suite([[102, 100], [98, 100]]), c4 = croisementsMa200(D, 'H4', 'btc', fin(2), { fenetre: 100 * PAS.H4 }); v(c4[0].statut === 'en_attente' && c4[0].tenue === 0, 'cassure à la dernière clôture : en attente de confirmation');
  const E = suite([[102, 100], [99.9, 100], [102, 100]]); v(croisementsMa200(E, 'H4', 'btc', fin(3), { fenetre: 100 * PAS.H4 }).length === 0, 'clôture sous la MA à moins de 0,3 ATR : pas un croisement (bruit)');
  v(croisementsMa200(plat.slice(0, 150), 'H4', 'btc', 150 * PAS.H4).length === 0, 'moins de 210 bougies : aucun croisement annoncé');
}

console.log('— bougies de fort volume récentes et statistiques —');
{
  const M = genererM15({ graine: 11 }), B = depuisM15(M, MAINT);
  // on force une bougie H1 extrême à la dernière heure clôturée
  const h1 = B.H1.slice(); const k = h1.length - 3; h1[k] = { ...h1[k], v: h1[k].v * 6, c: h1[k].o * 1.01, h: h1[k].o * 1.011 };
  const V = bougiesVolumeRecentes(h1, 'H1', 'btc', MAINT); const x = V.liste.find(y => y.t === h1[k].t);
  v(V.disponible && x && x.niveau === 'extreme' && x.volumeRel >= 3 && x.dir === 1, 'la bougie extrême acheteuse est repérée (×3 ou plus)');
  v(x && ['fin', 'range', 'milieu', null].includes(x.contexte) && x.stats && typeof x.stats.n === 'number', 'contexte et stats présents');
  v(V.liste.every(y => y.stats.petit ? y.stats.continuation5Pct === null : true), 'moins de 20 cas : aucun pourcentage (échantillon trop petit)');
  const sans = bougiesVolumeRecentes(B.J.map(b => ({ ...b, v: 0 })), 'J', 'dxy', MAINT); v(!sans.disponible && /volume non disponible/.test(sans.raison), 'sans volume : « indisponible », rien d’inventé');
}

console.log('— mouvement récent et par session —');
{
  const M = genererM15({ graine: 5 }), B = depuisM15(M, MAINT), m = mouvementRecent(B.H1, 'H1', MAINT);
  v(m.dispo && m.bougies === 6 && /en 6 bougies H1/.test(m.texte) && m.consecutives.n >= 1 && m.plusHaut.prix >= m.plusBas.prix, 'texte « x % en 6 bougies H1 », bougies consécutives, plus haut / plus bas');
  const S = mouvementSessions(B.M15, 'M15', MAINT, { atrJ: 20 });
  v(S.length >= 3 && S.every(s => s.h >= s.l && s.o > 0) && S.filter(s => s.enCours).length <= 1, 'sessions : OHLC cohérent, au plus une en cours');
  v(S.every(s => /h/.test(s.plageParis)) && S.some(s => s.id === 'asie') && S.some(s => s.id === 'londres'), 'heures de Paris affichées');
  // comportement : balayage du haut asiatique par Londres puis retour
  const cas = (as, lo, ny) => [{ id: 'asie', jour: 'x', h: as.h, l: as.l, amplitudeAtrJ: as.amp, sens: 0 }, { id: 'londres', jour: 'x', h: lo.h, l: lo.l, c: lo.c, sens: lo.sens || 1 }, { id: 'newyork', jour: 'x', sens: ny }];
  const t1 = cas({ h: 100, l: 99, amp: 0.3 }, { h: 100.5, l: 99.2, c: 99.6 }, -1), s1 = t1.map((s, i) => ({ ...s, comportement: null }));
  v(comportementSession(t1[0], t1).code === 'range_asiatique', 'Asie calme = range asiatique');
  v(comportementSession(t1[1], t1).code === 'balayage_haut_puis_retour', 'Londres balaie le haut asiatique puis revient');
  v(comportementSession(t1[2], t1).code === 'ny_retournement', 'New York retourne Londres');
  v(comportementSession({ ...t1[1], l: 98.5 }, t1).code === 'londres_double_balayage' && comportementSession({ ...t1[1], h: 99.5, l: 99.1 }, t1).code === 'londres_dans_range', 'double balayage et « reste dans le range »');
}

console.log('— gros mouvements : seuil calibré sur l’historique —');
{
  const M = genererM15({ graine: 21, vol: 0.002 }), B = depuisM15(M, MAINT), cal = calibrerSeuil(B.H4, MAINT);
  v(cal.calibre && cal.seuil >= 2 && cal.parSemaine <= 3, 'le seuil donne au plus 3 situations par semaine : ' + cal.seuil + ' ATR H4 (' + cal.parSemaine + ' / semaine)');
  const trop = calibrerSeuil(B.H4.slice(0, 100), MAINT); v(!trop.calibre, 'historique H4 trop court : seuil par défaut, dit non calibré');
  // un mouvement forcé : +12 % en 6 bougies H4 à la fin → détecté, sens haussier
  const H4 = B.H4.slice(); const n = H4.length; for (let i = n - 6; i < n; i++) { const prev = H4[i - 1].c; H4[i] = { ...H4[i], o: prev, c: prev * 1.02, h: prev * 1.021, l: prev * 0.999 }; }
  const g = grosMouvements(H4, MAINT, { seuil: cal.seuil, heures: 72 }); v(g.some(x => x.sens === 1 && x.pct > 8), 'un mouvement de +12 % est détecté (sens et amplitude)');
  v(grosMouvements(B.H4.slice(0, 600), MAINT, { seuil: 4, heures: 72 }).length === 0, 'rien à signaler dans un historique ancien (hors fenêtre)');
}

console.log('— fiche de lecture complète —');
{
  const M = genererM15({ graine: 9, derive: 0.00008 }), B = depuisM15(M, MAINT);
  const evenements = [{ t: U(2026, 11, 24, 13, 30), titre: 'CPI m/m', pays: 'USD', impact: 'fort', prevu: '0.3%', precedent: '0.2%', actuel: '' }, { t: U(2026, 11, 24, 8, 0), titre: 'Retail Sales', pays: 'EUR', impact: 'fort', prevu: '', precedent: '', actuel: '' }, { t: U(2026, 11, 25, 13, 30), titre: 'Core CPI', pays: 'USD', impact: 'fort', prevu: '', precedent: '', actuel: '' }];
  const actus = [{ titre: 'Gold rallies as dollar slips', source: 'X', t: MAINT - 3 * H, lien: 'https://exemple.test/a' }, { titre: 'Pizza prices', source: 'Y', t: MAINT - 2 * H }, { titre: 'Gold old news', source: 'Z', t: MAINT - 30 * H }];
  const F = construireFiche({ id: 'or', B, prix: B.M15[B.M15.length - 1].c, evenements, actus }, MAINT);
  v(F.version === 1 && F.actif === 'or' && F.t === MAINT && F.tendance.J.dispo && F.tendance.H4.dispo && F.tendance.H1.dispo, 'fiche : version, actif, horodatage, 3 unités de tendance');
  v(F.interne.M15 && F.interne.M15.sens !== undefined, 'M15 en interne seulement (détection)');
  v(['haussier', 'baissier', 'mixte', null].includes(F.biais), 'biais cohérent');
  v(F.sessions.length >= 3 && F.nuit && F.niveaux && F.niveaux.reperes.PDH > 0 && F.niveaux.reperes.PDL > 0 && F.niveaux.reperes.PWH > 0, 'sessions, nuit, PDH / PDL / PWH');
  v(F.agenda.length === 1 && F.agenda[0].titre === 'CPI m/m' && F.agenda[0].genre, 'agenda : seulement les annonces du jour, en dollars, pour cet actif');
  v(F.actus.length === 1 && /Gold rallies/.test(F.actus[0].titre), 'actualités : celles de l’actif des 12 dernières heures');
  v(F.score && F.score.score100 >= 0 && F.score.score100 <= 100 && Array.isArray(F.score.manquants), 'score de marché 0-100 (avec composantes manquantes listées)');
  v(F.regime.H4.dispo && ['tendance', 'range'].includes(F.regime.H4.type) && typeof F.regime.H4.compression === 'boolean', 'régime : tendance ou range, compression');
  v(JSON.stringify(F).length < 40000, 'la fiche reste petite (' + JSON.stringify(F).length + ' octets)');
  v(F.evenements.every((e, i, L) => i === 0 || L[i - 1].t >= e.t), 'journal des faits trié du plus récent au plus ancien');
  // aucun regard vers l'avenir : la fiche calculée une heure plus tôt n'utilise aucune bougie postérieure
  const tPlusTot = MAINT - 6 * H, Bplus = depuisM15(M.filter(b => b.t + 900e3 <= MAINT), tPlusTot), F2 = construireFiche({ id: 'or', B: Bplus }, tPlusTot);
  const Bcoupe = depuisM15(M.filter(b => b.t + 900e3 <= tPlusTot), tPlusTot), F3 = construireFiche({ id: 'or', B: Bcoupe }, tPlusTot);
  v(F2.tendance.H4.cloture === F3.tendance.H4.cloture && F2.tendance.J.ma200 === F3.tendance.J.ma200 && F2.mouvement.H1.pct === F3.mouvement.H1.pct, 'même fiche avec ou sans les bougies postérieures : aucun regard vers l’avenir');
  v(agendaDuJour([], 'or', MAINT).length === 0 && actusDe([], 'or', MAINT).length === 0, 'listes vides acceptées');
  const vide = construireFiche({ id: 'sol', B: { J: [], H4: [], H1: [] } }, MAINT); v(vide.manques.length >= 3 && vide.score === null && vide.prix === null, 'sans données : la fiche le dit (manques) au lieu d’inventer');
}

console.log(ko ? `${ko} échec(s) sur ${ok + ko}` : `tous les tests passent (${ok})`); process.exit(ko ? 1 : 0);
