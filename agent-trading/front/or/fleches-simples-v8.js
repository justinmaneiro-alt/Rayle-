/* ═════════════ FLÈCHES SIMPLES v8 « Direct » « gros mouvements » (2026-11-13) : v7 + 8 règles, module NOUVEAU ═════════════
   Dérivée de fleches-simples-v7 (« Direct (v7 validée) », figée, archivée dans archives/direct-v7-valide/), v6 « Direct (stable) », v5, v4, v1 : tous intacts. Aucun repaint : chaque décision est prise à la clôture de la bougie concernée.
   Objectif de lecture : des flèches seulement sur les retournements des GROSSES zones, pour de gros mouvements de plusieurs bougies ; aucun petit mouvement. Retard accepté : 2 à 3 bougies H1.
   CHANGEMENTS par rapport à la v7 :
   4. GROSSE ZONE : une zone ne porte une flèche que si (a) niveau en trait plein (structure semaine / mois / profils, ou zone de swing déjà touchée ≥ 3 fois) OU (b) zone qui a déjà produit une réaction d'au moins 3 ATR(H1) dans les 200 dernières bougies. Jamais de donnée future.
   5. CONFIRMATION : UNE clôture H1 hors de la zone dans le sens du rebond si son corps dépasse 0,6 ATR, sinon DEUX clôtures consécutives hors de la zone. Flèche posée sur la bougie de confirmation.
   6. ESPACE POUR COURIR : pas de flèche si la distance entrée → prochain niveau majeur dans le sens du trade (connu à ce moment) est inférieure à 1 fois la distance du stop (2 fois dans la consigne ; RELÂCHÉ à 1 R, et « majeur » = structure, réaction ≥ 3 ATR ou ≥ 10 touches : à 2 R et avec toutes les zones, 58 candidats sur ~85 étaient retirés, dont le cas de contrôle de la vente du 12 nov. sur 3 963–3 976).
   7. PAS DE FLÈCHE TARDIVE : si le prix a déjà parcouru plus de 2,5 ATR (2 dans la consigne, RELÂCHÉ pour garder la vente du 12 nov. : 2,3 ATR) depuis le bord de la zone à la bougie de confirmation, aucune flèche.
   11. ALERTE DE CONTACT : première touche d'une grosse zone non cassée depuis 24 bougies = une alerte (aucun marqueur sur le graphique).
   Conservés de la v7 : anti-aller-retour (12 bougies), invalidation sans repaint (2 bougies), rebond après base (marge 1 ATR, ATR moyen sur 48), régime MA200 DÉSACTIVÉ, exception « 2ᵉ touche ».
   Les flèches de cassure MA200 restent calculées (elles pilotent la couleur de la MA200 et l'exception de l'anti-aller-retour) mais l'interface ne les montre que si la case « Flèches MA200 » est cochée.
   Règles CHOISIES EN REGARDANT DES EXEMPLES : aucune preuve de performance. Outil de lecture, jamais un ordre. */
import * as V1 from './fleches-simples.js';
import * as V6 from './fleches-simples-v6.js';
import * as V7 from './fleches-simples-v7.js';
import { atrSerie, resultat } from './fleches-terminal-v1.js';
import { sma } from './fleches-lecture-v1.js';
import { rsiWilder } from './rsi-lecture-v1.js';
import { niveauxSignal, texteNiveaux } from './signal-niveaux.js';
export const VERSION = 'fleches-simples-v8', H = 3600e3, DEPART = V7.DEPART, PLAFOND = V7.PLAFOND, FENETRE = V7.FENETRE;
export const P = Object.freeze({ ...V7.P, corpsAtr: 0.6, clotures: 2, reactionAtr: 3, reactionFenetre: 200, reactionSuite: 48, espaceR: 1, espaceGroupeAtr: 0.5, espaceTouches: 10, tardifAtr: 2.5, contactRepos: 24, boiteBougies: 48 });
export const TYPES = V7.TYPES;
export const { idNiveau, textesRes, deuxiemeTouche, evenementsNiveauxV6, base, divergenceSurZone, niveauxStructure, touchesVues, ETIQUETTE_DEUX, fusionnerRegistre, rebondApresBase, regimeMa, contreRegime } = V7;
const fr = x => Math.round(x).toLocaleString('fr-FR').replace(/[  ]/g, ' ');
const heure = t => new Date(t).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const plageZ = (b, h) => Math.round(b) === Math.round(h) ? fr(h) : `${fr(b)}–${fr(h)}`;

/* règle 4b : réaction passée d'au moins 3 ATR depuis la zone (dans les 200 dernières bougies, sans clôture au-delà de la zone) ; null si aucune. S = bougies connues jusqu'à la bougie courante i (exclue). */
export function reactionZone(S, A, z, i) {
  const sens = z.cote === 'support' ? 1 : -1;
  for (let k = Math.max(1, i - P.reactionFenetre); k < i; k++) {
    const a = A[k], b = S[k]; if (!(a > 0) || !(b.t >= z.tDebut)) continue;
    const m = V1.P.toucheAtr * a; if (!(b.l <= z.haut + m && b.h >= z.bas - m)) continue;
    if (sens > 0 ? b.c < z.bas - V1.P.casseeAtr * a : b.c > z.haut + V1.P.casseeAtr * a) continue;
    let ext = sens > 0 ? -Infinity : Infinity;
    for (let j = k + 1; j <= Math.min(k + P.reactionSuite, i - 1); j++) {
      if (sens > 0 ? S[j].c < z.bas - V1.P.casseeAtr * a : S[j].c > z.haut + V1.P.casseeAtr * a) break;
      ext = sens > 0 ? Math.max(ext, S[j].h) : Math.min(ext, S[j].l);
    }
    const mv = sens > 0 ? ext - z.haut : z.bas - ext;
    if (Number.isFinite(mv) && mv >= P.reactionAtr * a) return { t: b.t, atr: Math.round(mv / a * 10) / 10 };
  }
  return null;
}

/* Machine à états des retournements : celle de la v6 avec la confirmation de la v8 (corps > 0,6 ATR en une clôture, sinon deux clôtures consécutives hors de la zone). */
export function evenementsNiveauxV8(B, A, zones) {
  const events = [], contacts = [], maj = [];
  for (const z of zones) {
    const sens = z.cote === 'support' ? 1 : -1, bas = z.bas, haut = z.haut, levelId = V1.idNiveau(z), P1 = V1.P;
    let i0 = B.findIndex(b => b.t >= z.tDebut); if (i0 < 1) i0 = 1; if (z.retournee) i0 += 1;
    let i1 = B.length - 1; if (z.tFin != null) { const k = B.findIndex(b => b.t >= z.tFin); if (k >= 0) i1 = k; }
    let att = null, dernier = -1e9, arme = true, cassee = false, confirme = !z.retournee, toucheAvant = false, rs = 0;
    const nom = z.nom || z.id, contact = (i, raison, extra = {}) => contacts.push({ i, levelId, zoneBas: bas, zoneHaut: haut, dir: sens, raison, source: nom, ...extra });
    for (let i = i0; i <= i1; i++) {
      const a = A[i]; if (!(a > 0)) continue;
      const m = P1.toucheAtr * a, b = B[i], c = b.c, prec = B[i - 1].c;
      const touche = b.l <= haut + m && b.h >= bas - m, debutContact = touche && !toucheAvant; toucheAvant = touche;
      if (sens > 0 ? c < bas - P1.casseeAtr * a : c > haut + P1.casseeAtr * a) { cassee = true; rs = 0; if (att) { maj.push({ i, levelId, att0: att.i, raison: 'bloqué : zone cassée avant la confirmation' }); att = null; } }
      if (cassee) { if (debutContact) contact(i, 'bloqué : zone cassée'); continue; }
      const traverse = sens > 0 ? c < bas : c > haut, ressort = sens > 0 ? c > haut : c < bas;
      const corps = sens > 0 ? c - b.o : b.o - c, gros = corps > P.corpsAtr * a;
      if (!arme && i - dernier >= P1.reposZone) arme = true;
      const poser = (i0t, mode) => {
        if (!confirme) { confirme = true; att = null; rs = 0; dernier = i; arme = false; contact(i0t, 'bloqué : niveau au rôle récemment inversé (premier retournement de contrôle, sans flèche)'); return; }
        events.push({ type: 'retournement', dir: sens, i, prix: c, niveau: sens > 0 ? haut : bas, atr: a, levelId, zoneBas: bas, zoneHaut: haut, touches: z.force || 0, source: nom, att0: i0t, confirmation: mode,
          nom: (sens > 0 ? 'Retournement haussier sur support majeur' : 'Retournement baissier sur résistance majeure') });
        dernier = i; arme = false; att = null; rs = 0;
      };
      if (att) {
        if (traverse) { maj.push({ i, levelId, att0: att.i, raison: 'bloqué : pas de rebond confirmé (clôture au-delà du niveau)' }); att = null; rs = 0; }
        else if (i - att.i > P1.attenteMax) { maj.push({ i, levelId, att0: att.i, raison: 'bloqué : pas de rebond confirmé en 36 bougies' }); att = null; rs = 0; }
        else if (ressort) { rs++; if (gros || rs >= P.clotures) { poser(att.i, gros ? 'corps' : '2 clôtures'); } continue; }
        else rs = 0;
      }
      if (!att && arme && touche && !traverse && (sens > 0 ? prec >= bas : prec <= haut)) {
        att = { i }; rs = 0;
        if (ressort) { rs = 1; if (gros) poser(i, 'corps'); else contact(i, 'en attente : deuxième clôture hors de la zone pas encore close', { attente: true }); }
        else contact(i, 'en attente : bougie de confirmation pas encore close', { attente: true });
      } else if (debutContact && !att) {
        if (!arme) contact(i, 'bloqué : cooldown (repos de 24 bougies sur ce niveau)');
        else if (traverse) contact(i, 'bloqué : le prix a clôturé de l\'autre côté du niveau (traversée, pas un rebond)');
        else contact(i, 'bloqué : le prix arrive par l\'autre côté du niveau (retest, pas un rebond)');
      }
    }
  }
  return { events, contacts, maj };
}

/* règle 6 : distance entrée → prochain niveau majeur dans le sens du trade, en multiples de R (Infinity si aucun) */
export function espaceDevant(f, zones) {
  const n = niveauxSignal(f); if (!n) return { n: null, espace: Infinity, niveau: null };
  let best = null;
  for (const z of zones) {
    if (V1.idNiveau(z) === f.levelId) continue;
    if (!(z.niveauType === 'structure' || z.reaction || (z.touchesVues || 0) >= P.espaceTouches)) continue;   // « majeur » pour cette règle : structure, réaction passée ou ≥ 10 touches (sinon le réseau serré de zones bloque presque tout)
    const d = f.dir > 0 ? z.bas - f.prix : f.prix - z.haut;     // distance de l'entrée au bord proche du niveau, dans le sens du trade
    const collee = (f.dir > 0 ? z.bas - f.zoneHaut : f.zoneBas - z.haut) < P.espaceGroupeAtr * f.atr;   // niveau collé à la zone tradée (même bande) : pas un « prochain niveau »
    if (d > 0 && !collee && (best == null || d < best.d)) best = { d, z };
  }
  return { n, espace: best ? best.d / n.r : Infinity, niveau: best ? best.z : null };
}

/* règle 11 : première touche d'une grosse zone non cassée depuis 24 bougies */
function alertesContact(S, A, zones, i) {
  const out = [], b = S[i], a = A[i]; if (!(a > 0)) return out;
  for (const z of zones) {
    const m = V1.P.toucheAtr * a, touche = (bb, aa) => bb.l <= z.haut + V1.P.toucheAtr * aa && bb.h >= z.bas - V1.P.toucheAtr * aa;
    if (!touche(b, a)) continue;
    if (z.cote === 'support' ? b.c < z.bas - V1.P.casseeAtr * a : b.c > z.haut + V1.P.casseeAtr * a) continue;   // zone cassée
    let recent = false; for (let j = Math.max(0, i - P.contactRepos); j < i; j++) if (A[j] > 0 && touche(S[j], A[j])) { recent = true; break; }
    if (recent) continue; void m;
    const levelId = V1.idNiveau(z), nom = z.niveauNom || z.nom || null;
    out.push({ id: `contactzone|${b.t}|${levelId}`, t: b.t, tCloture: b.t + H, levelId, cote: z.cote, zoneBas: z.bas, zoneHaut: z.haut, niveauNom: nom, prix: b.c });
  }
  return out;
}

export function rejouer(B, zonesA, { depart = DEPART, deja = [], exception = true, exclure = null, regime = false, anti = true, rebond = true, tardif = true, espace = true } = {}) {
  const acceptees = deja.slice(), vus = [], invalidees = [], supprimees = [], contactsMap = new Map(), alertesMap = new Map(), histo = [], dernierRebond = { 1: -1e9, '-1': -1e9 }, retirees = {};
  let refus = 0, zonesFin = [];
  const cpt = k => { retirees[k] = (retirees[k] || 0) + 1; };
  const A = atrSerie(B), M = sma(B), R = rsiWilder(B.map(b => b.c));
  for (let n = Math.max(depart, 40); n <= B.length; n++) {
    const S = B.slice(0, n), now = S[n - 1].t + H, a = A[n - 1], c = S[n - 1].c, i = n - 1;
    for (const g of acceptees) {
      if (g.type !== 'retournement' || g.contre || g.invalidee || !(g.i < i && i - g.i <= P.invalidBougies)) continue;
      if (g.dir > 0 ? c < g.zoneBas : c > g.zoneHaut) { g.invalidee = true; g.invalideeT = now; invalidees.push({ id: g.id, invalideeT: now }); }
    }
    const cand = zonesA(S, now).filter(z => z.actif !== false && z.tFin == null && (z.force || 0) >= P.touchesVues && z.haut - z.bas >= P.largeurAtr * a).map(z => ({ ...z, tv: touchesVues(S, z) }));
    const garder = z => !(exclure && exclure(z, a, now));
    const swing = [], faibles = [];
    for (const z of cand) {
      if (!garder(z)) continue;
      if (z.tv >= P.touchesVues) { swing.push({ ...z, force: 99, retournee: false, niveauType: 'swing', touchesVues: z.tv }); continue; }
      const re = reactionZone(S, A, z, i);                                   // règle 4b : réaction passée d'au moins 3 ATR
      if (re) swing.push({ ...z, force: 99, retournee: false, niveauType: 'swing', touchesVues: z.tv, reaction: re });
      else if ((z.force || 0) >= P.faibleMin) faibles.push({ ...z, force: 99, retournee: false, niveauType: 'swing', touchesVues: z.tv });
    }
    const struct = niveauxStructure(S).map(q => ({ id: `nm|${q.nom}|${Math.round(q.p * 100)}`, cote: q.p > c ? 'resistance' : 'support', bas: q.p, haut: q.p, tDebut: q.tDebut, tFin: null, nom: q.nom, force: 99, retournee: false, niveauType: 'structure', niveauNom: q.nom, typeStructure: q.type })).filter(garder);
    const zones = [...swing, ...struct], majeures = V1.zonesMajeures(zones), info = new Map(zones.map(z => [V1.idNiveau(z), z]));
    if (n === B.length) zonesFin = zones;
    const N = evenementsNiveauxV8(S, A, majeures), evMa = V1.evenementsMa(S, A, M);
    const ev = N.events.concat(evMa), reg = regimeMa(evMa);
    if (rebond) for (const d of [1, -1]) { if (i - dernierRebond[d] < P.rebondRepos) continue; const e = rebondApresBase(S, A, i, d); if (e) ev.push(e); }
    for (const al of alertesContact(S, A, majeures, i)) alertesMap.set(al.id, al);
    for (const k of N.contacts) if (k.i === i) { const z = info.get(k.levelId); contactsMap.set(`${k.levelId}|${k.i}`, { ...k, niveauNom: z ? z.niveauNom || z.nom || null : null, t: S[i].t, tCloture: S[i].t + H, id: `contact|${S[i].t}|${k.dir}|${k.levelId}` }); }
    for (const u of N.maj) if (u.i === i) { const e = contactsMap.get(`${u.levelId}|${u.att0}`); if (e) { e.raison = u.raison; delete e.attente; } }
    if (faibles.length) {
      const F2 = evenementsNiveauxV6(S, A, faibles), vus2 = new Set();
      for (const k of [...F2.events, ...F2.contacts].filter(k => k.i === i)) { if (vus2.has(k.levelId)) continue; vus2.add(k.levelId); const z = faibles.find(w => V1.idNiveau(w) === k.levelId);
        const kk = `${k.levelId}|${i}`; if (!contactsMap.has(kk)) contactsMap.set(kk, { i, levelId: k.levelId, zoneBas: k.zoneBas, zoneHaut: k.zoneHaut, dir: k.dir, source: k.source, raison: `bloqué : zone pas assez grosse (${z.tv} touche vue, ${P.touchesVues} requises, aucune réaction de ${P.reactionAtr} ATR)`, niveauNom: z.nom || null, t: S[i].t, tCloture: S[i].t + H, id: `contact|${S[i].t}|${k.dir}|${k.levelId}` }); }
    }
    const rang = e => e.type === 'ma_cassure' ? 0 : e.type === 'rebond_base' ? 2 : 1;
    const pose = ev.filter(f => f.i === i).map(f => ({ ...f, t: S[f.i].t, tCloture: S[f.i].t + H })).sort((x, y) => rang(x) - rang(y));
    for (const f of pose) {
      const info1 = (raison) => { const z = info.get(f.levelId); contactsMap.set(`${f.levelId}|${f.i}|x`, { i: f.i, levelId: f.levelId, zoneBas: f.zoneBas, zoneHaut: f.zoneHaut, dir: f.dir, raison, source: f.source, niveauNom: z ? z.niveauNom || z.nom || null : null, t: f.t, tCloture: f.tCloture, id: `contact|${f.t}|${f.dir}|${f.levelId}|x` }); };
      let deux = null;
      if (f.type === 'retournement') {
        deux = exception ? deuxiemeTouche(S, A, histo, f) : null;
        histo.push({ i: f.i, c: f.prix, dir: f.dir, zoneBas: f.zoneBas, zoneHaut: f.zoneHaut });
        if (f.att0 != null) contactsMap.delete(`${f.levelId}|${f.att0}`);
      }
      const chute = f.type === 'retournement' && f.dir > 0 && n > P.chuteBougies && S[n - 1 - P.chuteBougies].c - S[n - 1].c > P.chuteAtr * a;
      if (chute && !deux) { info1('bloqué : garde-fou chute > 5 ATR en 24 bougies'); cpt('chute'); continue; }
      if (f.type === 'retournement') {
        if (tardif && (f.dir > 0 ? c - f.zoneHaut : f.zoneBas - c) > P.tardifAtr * a) { info1(`bloqué : signal tardif (le prix a déjà parcouru plus de ${P.tardifAtr} ATR depuis le bord de la zone)`); cpt('tardif'); continue; }
        if (espace) { const e = espaceDevant(f, zones); if (e.n && e.espace < P.espaceR - 1e-9) { info1(`bloqué : pas assez d'espace (prochain niveau à ${e.espace.toFixed(1).replace('.', ',')} R, ${P.espaceR} R requis)`); cpt('espace'); continue; } }
      }
      if (f.type !== 'ma_cassure' && acceptees.some(g => Math.abs(g.i - f.i) < P.distanceMin)) { info1(`bloqué : trop proche d'une autre flèche (moins de ${P.distanceMin} bougies)`); cpt('proche'); continue; }
      if (acceptees.filter(g => g.i > f.i - FENETRE).length >= PLAFOND) { refus++; info1('bloqué : plafond de sécurité atteint'); cpt('plafond'); continue; }
      const g = { ...f, masquee: false, indexApparition: n - 1, indexDessin: f.i, version: VERSION, id: `${f.type}|${f.t}|${f.dir}|${f.levelId}` }; if (f.att0 != null) g.touchI = f.att0; delete g.att0;   // touchI : bougie du contact (mesure du retard)
      if (f.type === 'retournement') {
        const z = info.get(f.levelId);
        if (z) { g.niveauType = z.niveauType; g.niveauStyle = 'trait plein'; g.niveauNom = z.niveauNom || z.nom || null; g.touchesVues = z.niveauType === 'swing' ? z.touchesVues : null; if (z.typeStructure) g.typeStructure = z.typeStructure; if (z.reaction) g.reaction = z.reaction; }
        g.contre = false; g.stabilisation = null;
        if (regime ? contreRegime(reg, f.dir) : V6.contreTendance(S, M, i, f.dir)) {
          if (deux) g.deuxiemeTouche = deux;
          else if (base(S, i, f.dir, a)) g.stabilisation = 'base';
          else if (divergenceSurZone(S, R, i, f.dir, g, a)) g.stabilisation = 'rsi';
          else { g.contre = true; g.raison = regime ? `bloqué : contre-tendance (dernière cassure MA200 ${reg < 0 ? 'baissière' : 'haussière'}, aucune cassure de sens opposé depuis)` : `bloqué : contre-tendance (MA200 ${f.dir > 0 ? 'baissière' : 'haussière'} à ${fr(M[i])}, ${f.dir > 0 ? 'plus bas plus bas' : 'plus haut plus haut'})`; cpt('contre'); }
        } else if (deux) g.deuxiemeTouche = deux;
        if (deux && !g.contre) g.garde = chute ? 'chute' : null;
      }
      if (anti && !g.contre && f.type !== 'ma_cassure' && !g.deuxiemeTouche) {
        const pre = acceptees.find(q => !q.contre && !q.invalidee && q.dir !== f.dir && f.i - q.i >= 0 && f.i - q.i < P.antiBougies);
        if (pre) { supprimees.push({ id: g.id, t: g.t, tCloture: g.tCloture, dir: g.dir, type: g.type, levelId: g.levelId, avecId: pre.id, avecT: pre.tCloture }); info1(`bloqué : anti-aller-retour (flèche ${pre.dir > 0 ? 'verte' : 'rouge'} de sens opposé il y a moins de ${P.antiBougies} bougies)`); cpt('aller-retour'); continue; }
      }
      acceptees.push(g); vus.push(g); if (f.type === 'rebond_base') dernierRebond[f.dir] = i;
    }
  }
  const dernierT = B.length ? B[B.length - 1].t : 0;
  const contacts = [...contactsMap.values()].filter(k => !(k.attente && k.t !== dernierT)).map(k => { const o = { ...k }; delete o.attente; return o; });
  return { fleches: vus, toutes: acceptees, refus, invalidees, contacts, supprimees, alertes: [...alertesMap.values()], retirees, zonesFin };
}

/* ── boîtes de position (règle 12) : entrée → stop (rouge) et entrée → TP1 (vert), TP2 en ligne ; stop et cible dans la même bougie : le stop. Repère de lecture, jamais un ordre.
   Résultat : stop = −1 R ; TP2 = +2 R ; TP1 atteint puis stop ou fin de fenêtre = +1 R (TP1 est « encaissé ») ; rien touché après 48 bougies = résultat du moment en R. */
export function boite(B, f, { max = P.boiteBougies } = {}) {
  const n = niveauxSignal(f); if (!n || !B.length) return null;
  let i0 = B.findIndex(b => b.t === f.t); if (i0 < 0) return null;
  let tp1 = false, fin = null, etat = 'ouverte', Rr = null;
  for (let k = i0 + 1; k < B.length && k <= i0 + max; k++) {
    const b = B[k], dir = n.dir, st = dir > 0 ? b.l <= n.stop : b.h >= n.stop, t1 = dir > 0 ? b.h >= n.tp1 : b.l <= n.tp1, t2 = dir > 0 ? b.h >= n.tp2 : b.l <= n.tp2;
    if (st) { etat = tp1 ? 'tp1' : 'stop'; Rr = tp1 ? 1 : -1; fin = k; break; }
    if (t2) { etat = 'tp2'; Rr = 2; fin = k; break; }
    if (t1) tp1 = true;
  }
  if (fin == null) {
    const k = Math.min(B.length - 1, i0 + max), dir = n.dir;
    if (i0 + max <= B.length - 1) { etat = 'expiree'; fin = k; Rr = tp1 ? 1 : Math.round((B[k].c - n.entree) * dir / n.r * 100) / 100; }
    else { etat = 'ouverte'; fin = B.length - 1; Rr = tp1 ? 1 : Math.round((B[k].c - n.entree) * dir / n.r * 100) / 100; }
  }
  const nb = x => (Math.abs(x - Math.round(x)) < 1e-9 ? String(Math.round(x)) : x.toFixed(1)).replace('.', ',');
  const lib = etat === 'stop' ? '−1 R' : etat === 'tp2' ? '+2 R' : etat === 'tp1' ? '+1 R' : (Rr >= 0 ? '+' : '−') + nb(Math.abs(Rr)) + ' R';
  return { id: f.id, dir: n.dir, entree: n.entree, stop: n.stop, tp1: n.tp1, tp2: n.tp2, r: n.r, t0: f.tCloture, tFin: B[fin].t + H, etat, tp1Atteint: tp1, R: Rr, libelle: lib, figee: etat !== 'ouverte', expiree: etat === 'expiree' };
}

export function calculer(B, zonesA, { maintenant = Date.now(), depart = null, deja = [], bougies = 720, exception = true, exclure = null, regime = false, anti = true, rebond = true, tardif = true, espace = true } = {}) {
  const closes = (B || []).filter(b => b.t + H <= maintenant && b.c > 0);
  if (closes.length < 40) return { fleches: [], contacts: [], alertes: [], boites: [], zones: [], n: closes.length, raison: `seulement ${closes.length} bougies H1 closes`, refus: 0, invalidees: [], supprimees: [], retirees: {} };
  const d = depart == null ? Math.max(DEPART, closes.length - bougies) : Math.max(DEPART, depart);
  const r = rejouer(closes, zonesA, { depart: d, deja, exception, exclure, regime, anti, rebond, tardif, espace });
  const pris = new Set(r.fleches.map(f => f.t));
  const rangC = k => /^en attente|garde-fou/.test(k.raison) ? 0 : /swing|assez grosse/.test(k.raison) ? 1 : /plafond|trop proche|rôle|anti-aller|tardif|espace/.test(k.raison) ? 2 : /cassée/.test(k.raison) ? 3 : /traversée/.test(k.raison) ? 4 : /cooldown/.test(k.raison) ? 5 : 6;
  const ctc = []; for (const k of r.contacts.slice().sort((x, y) => x.t - y.t || rangC(x) - rangC(y))) if (!pris.has(k.t)) { pris.add(k.t); ctc.push(k); }
  const fl = r.fleches.map(f => ({ ...f, resultat: resultat(closes, f) }));
  const boites = fl.filter(f => !f.contre && !f.invalidee).map(f => boite(closes, f)).filter(Boolean);
  return { fleches: fl, contacts: ctc, alertes: r.alertes, boites, zones: r.zonesFin, n: closes.length, raison: null, vers: closes.length, refus: r.refus, invalidees: r.invalidees, supprimees: r.supprimees, retirees: r.retirees };
}

/* ── zones lisibles (règle 13) : au plus 3 résistances et 3 supports, les plus proches du prix (et les plus fortes à distance égale), étiquettes R1, R2, S1, S2… par ordre de distance */
export function zonesLisibles(zones, prix, { max = 3 } = {}) {
  const dist = z => z.haut < prix ? prix - z.haut : z.bas > prix ? z.bas - prix : 0, fort = z => (z.niveauType === 'structure' ? 100 : 0) + (z.touchesVues || 0) + (z.reaction ? 5 : 0);
  const trie = L => L.slice().sort((x, y) => dist(x) - dist(y) || fort(y) - fort(x));
  const uniques = L => { const out = []; for (const z of L) if (!out.some(q => Math.abs(q.bas - z.bas) < 1e-6 && Math.abs(q.haut - z.haut) < 1e-6 || (q.bas <= z.haut && q.haut >= z.bas))) out.push(z); return out; };
  const res = uniques(trie(zones.filter(z => z.bas + (z.haut - z.bas) / 2 >= prix))).slice(0, max).map((z, k) => ({ ...z, etiquette: `R${k + 1}`, plage: plageZ(z.bas, z.haut), sens: 'resistance' }));
  const sup = uniques(trie(zones.filter(z => z.bas + (z.haut - z.bas) / 2 < prix))).slice(0, max).map((z, k) => ({ ...z, etiquette: `S${k + 1}`, plage: plageZ(z.bas, z.haut), sens: 'support' }));
  return [...res, ...sup];
}

/* ── MA200 colorée par le régime : segments [{t0, t1, dir}] d'après les cassures confirmées (dir 0 avant la première) */
export function segmentsRegimeMa(flechesOuEvents, tDebut, tFin) {
  const ev = flechesOuEvents.filter(f => f.type === 'ma_cassure').slice().sort((a, b) => a.t - b.t), out = []; let t0 = tDebut, dir = 0;
  for (const e of ev) { if (e.t > t0) out.push({ t0, t1: e.t, dir }); t0 = e.t; dir = e.dir; }
  out.push({ t0, t1: tFin, dir }); return out;
}

export const detail = f => {
  const l = V7.detail(f);
  if (f.type === 'retournement') {
    if (f.confirmation) l.push(`Confirmation : ${f.confirmation === 'corps' ? `une clôture hors de la zone avec un corps de plus de ${P.corpsAtr} ATR` : `${P.clotures} clôtures consécutives hors de la zone`}`);
    if (f.reaction) l.push(`Grosse zone : réaction passée de ${String(f.reaction.atr).replace('.', ',')} ATR (${heure(f.reaction.t)})`);
  }
  return l;
};
export const detailContact = V6.detailContact;
export const detailAlerte = a => [`Attention : prix sur ${a.niveauNom ? a.niveauNom + ' ' : ''}${plageZ(a.zoneBas, a.zoneHaut)} (${a.cote === 'resistance' ? 'résistance' : 'support'} majeur), surveille un retournement`, 'Aucun signal : la flèche n\'apparaît qu\'à la confirmation'];
export const bilan = () => ({});
