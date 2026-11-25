/* Carnet de copilote : fenêtre (liste des idées, lectures, débriefs, compétences) et flux « avant / après » utilisés par la voix.
   Données privées : sur l'appareil et dans ton Worker. Lecture seule : Rayle ne dit jamais « vas-y » ni « n'y va pas ». */
import { lireFiches } from '../reseau/client.js';
import { lireCarnet, majEntree, synchroniserCarnet } from './stockage.js';
import { lectureAvant, creerEntree, analyserIntention, intentionCloture, debrief, competences, rattacherXtb, changementsDeLecture, OUTILS } from './carnet.js';
import { lireActifPro } from '../commun/donnees.js';
import { lireConn } from '../terminal/dessins-stockage.js';
import { parler } from '../commun/ia.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const NOMS = { or: 'l’or', us100: 'le Nasdaq 100', us500: 'le S&P 500', btc: 'le Bitcoin', sol: 'Solana', petrole: 'le pétrole', dxy: 'le dollar' };
const vb = L => (L || []).map(x => ({ t: x[0], o: x[1], h: x[2], l: x[3], c: x[4], v: x[5] || 0 }));
let instance = null;

/* « je regarde un achat sur l'or » */
export async function noterIdee(texte) {
  const it = analyserIntention(texte); if (!it) return null;
  const fiches = await lireFiches(), F = fiches[it.actif]; if (!F) return `Je n’ai pas de lecture de marché pour ${NOMS[it.actif] || it.actif} pour le moment : je ne peux pas te dire ce que disent les outils.`;
  const L = lectureAvant(F, it.sens); if (!L) return 'Je n’arrive pas à lire la situation maintenant.';
  const e = creerEntree({ actif: it.actif, sens: it.sens, F, lecture: L, outilsCites: it.outilsCites, texteUtilisateur: it.texte }); await majEntree(e);
  return `${L.texte} Je l’ai noté dans ton carnet de copilote, et je te préviendrai seulement si la lecture change vraiment.`;
}
/* positions XTB (importées par la fenêtre Portefeuille, stockées dans TON Worker) : rattachement automatique aux idées du carnet */
export async function positionsXtb({ conn = lireConn(), fetchFn = (...a) => fetch(...a) } = {}) {
  if (!conn) return []; try { const r = await fetchFn(conn.url + '/donnees?depuis=0', { headers: conn.code ? { 'X-Portefeuille-Code': conn.code } : {}, signal: AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined }); if (!r.ok) return []; const j = await r.json(), recent = Date.now() - 60 * 86400e3;
    return [...(j.fermees || []).filter(x => x.tOuv >= recent), ...(((j.ouvertes || {}).positions || []).map(x => ({ ...x, sens: x.sens, tFerm: null })))].map(x => ({ id: x.id, ticker: x.ticker, sens: x.sens, tOuv: x.tOuv, prixOuv: x.prixOuv, tFerm: x.tFerm ?? null, prixFerm: x.prixFerm ?? null, pnl: x.pnl ?? null, sl: x.sl ?? null, tp: x.tp ?? null })); } catch (e) { return []; }
}
export async function rattacherAuCarnet() { const L = lireCarnet(), R = rattacherXtb(L, await positionsXtb()); if (R.rattachees) for (const e of R.entrees) if (e.xtb && !L.find(x => x.id === e.id && x.xtb)) await majEntree(e); return R.rattachees; }
/* « j'ai clôturé l'or » → débrief sur le graphique */
export async function cloturerIdee(texte, { ouvrirGraphique = true } = {}) {
  const it = intentionCloture(texte); if (!it) return null; const L = lireCarnet().filter(e => e.etat === 'ouvert' && (!it.actif || e.actif === it.actif)).sort((a, b) => b.t - a.t), e = L[0];
  if (!e) return `Je n’ai aucune idée ouverte${it.actif ? ' sur ' + (NOMS[it.actif] || it.actif) : ''} dans ton carnet : dis-moi d’abord « je regarde un achat ou une vente sur… » la prochaine fois pour que je la suive.`;
  await rattacherAuCarnet(); const e1 = lireCarnet().find(x => x.id === e.id) || e, D = await lireActifPro(e1.actif, { delai: 12000 }).then(r => vb(r.donnees.h4)), db = debrief(e1, { B: D, unite: 'H4', tSortie: Date.now(), prixSortie: it.prixSortie });
  if (!db) return 'Je n’ai pas assez de bougies récentes pour faire le débrief de cette idée.';
  await majEntree({ ...e1, etat: 'ferme', debrief: { texte: db.texte, lecon: db.lecon, gainPct: db.gainPct, t: db.t } });
  if (ouvrirGraphique) { try { const R = await import('./relecture.js'); await R.ouvrirRelecture({ actif: e1.actif, unite: 'H4', t0: e1.t - 8 * 3600e3, t1: Date.now(), titre: `Débrief : ${NOMS[e1.actif] || e1.actif}`, nom: e1.actif, racine: document.body, parler, auDemarrage: false, texteInitial: db.texte, surlignages: [{ type: 'bougie', t: D[db.iEntree].t, unite: 'H4' }, ...(e1.lecture && e1.lecture.invalidation ? [{ type: 'niveau', prix: e1.lecture.invalidation.prix, titre: 'invalidation' }] : [])] }); } catch (er) { /* le texte suffit */ } }
  return db.texte;
}
export const texteCompetences = () => competences(lireCarnet()).texte;

/* surveillance locale (appli ouverte) : la lecture a-t-elle vraiment changé pour une idée ouverte ? */
export async function surveillerIdees({ fiches = null, annoncer = t => parler(t) } = {}) {
  const ouvertes = lireCarnet().filter(e => e.etat === 'ouvert'); if (!ouvertes.length) return [];
  const F = fiches || await lireFiches(), vues = []; for (const e of ouvertes) { const C = changementsDeLecture(e, F[e.actif], Date.now()); if (C.length) { await majEntree({ ...e, alertes: [...(e.alertes || []), ...C.map(c => ({ cle: c.cle, t: c.t, texte: c.texte }))] }); for (const c of C) { annoncer(c.texte); vues.push(c); } } } return vues;
}
export async function ouvrirCarnet({ racine = document.body } = {}) {
  if (instance) instance.fermer(); await synchroniserCarnet(lireCarnet()).catch(() => {}); await rattacherAuCarnet().catch(() => {});
  const el = document.createElement('section'); el.className = 'tp tp-point'; el.id = 'carnet-copilote'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Carnet de copilote');
  const dessiner = () => { const L = lireCarnet(), C = competences(L);
    el.querySelector('[data-corps]').innerHTML = `<p class="tp-doux">Tes idées, ce que disaient les outils, et ce qui s’est passé. Données privées (sur cet appareil et dans ton Worker). Rayle ne dit jamais « vas-y » ni « n’y va pas ».</p>
      <form data-nouvelle class="tp-form-ajout"><input name="texte" placeholder="Ex. : je regarde un achat sur l’or, j’ai vu la bougie de volume" maxlength="300" required style="flex:1;min-width:220px"> <button type="submit">Demander à Rayle</button></form>
      <div class="tp-point-sec tp-visible"><h3>Ce que tu repères seul</h3><p>${esc(C.texte)}</p></div>
      ${L.length ? L.map(e => `<section class="tp-point-sec tp-visible" data-id="${esc(e.id)}"><h3>${e.sens > 0 ? 'Achat' : 'Vente'} sur ${esc(NOMS[e.actif] || e.actif)} · ${esc(new Date(e.t).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }))} · ${e.etat === 'ouvert' ? 'ouverte' : 'terminée'}</h3>
        ${e.lecture ? `<p><b>Dans ton sens :</b> ${esc((e.lecture.pour || []).slice(0, 3).join(' ') || 'rien')}</p><p><b>Contre :</b> ${esc((e.lecture.contre || []).slice(0, 3).join(' ') || 'rien')}</p>${e.lecture.invalidation ? `<p>${esc(e.lecture.invalidation.texte)}</p>` : ''}` : ''}
        ${e.xtb ? `<p class="tp-doux">Position XTB rattachée (ouverte à ${esc(e.xtb.prixOuv)}${e.xtb.prixFerm != null ? ', fermée à ' + esc(e.xtb.prixFerm) : ''}).</p>` : ''}
        ${(e.alertes || []).length ? `<p><b>Pendant :</b> ${esc(e.alertes.map(a => a.texte).join(' '))}</p>` : ''}
        ${e.debrief ? `<p><b>Débrief :</b> ${esc(e.debrief.texte)}</p>` : `<p class="tp-actions"><button type="button" data-cloturer="${esc(e.id)}">J’ai clôturé</button></p>`}</section>`).join('') : '<p class="tp-doux">Aucune idée dans le carnet. Dis par exemple « Rayle, je regarde un achat sur l’or ».</p>'}`; };
  el.innerHTML = `<header class="tp-tete"><b>Carnet de copilote</b><button type="button" data-fermer aria-label="Fermer">✕</button></header><main class="tp-corps" data-corps></main>`; racine.appendChild(el); dessiner();
  el.addEventListener('click', async e => { if (e.target.closest('[data-fermer]')) { el.remove(); instance = null; return; } const c = e.target.closest('[data-cloturer]'); if (c) { const en = lireCarnet().find(x => x.id === c.dataset.cloturer); if (en) { const r = await cloturerIdee(`j’ai clôturé ${NOMS[en.actif] || en.actif}`, { ouvrirGraphique: true }); parler(r); dessiner(); } } });
  el.addEventListener('submit', async e => { const f = e.target.closest('[data-nouvelle]'); if (!f) return; e.preventDefault(); const t = new FormData(f).get('texte'), r = await noterIdee(String(t)); const p = document.createElement('p'); p.className = 'tp-point-sec tp-visible'; p.textContent = r || 'Je n’ai pas compris : dis par exemple « je regarde un achat sur l’or ».'; f.after(p); if (r) { parler(r); setTimeout(dessiner, 4000); } });
  instance = { fermer: () => { el.remove(); instance = null; }, el }; return instance;
}
export { OUTILS };
