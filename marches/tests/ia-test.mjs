// Tests de la couche d'analyse IA : node marches/tests/ia-test.mjs
import assert from 'node:assert/strict';
import { extraireJson, validerAnalyse, validerActualite, valider, AVERTISSEMENT } from '../ia/schema.js';
import { texteGraphique, texteActualite, rsi, sma } from '../ia/prompt.js';
import { creerFournisseur, creerQuota, configuration, estimerCout, FOURNISSEURS } from '../ia/fournisseurs.js';
import { creerEchelle, dessinerGraphiqueAnnote, dessinerSurImage } from '../ia/dessin.js';
import { gererMarches } from '../donnees/api.js';

let ok = 0, ko = 0; const t = async (nom, f) => { try { await f(); ok++; } catch (e) { ko++; console.log('ÉCHEC : ' + nom + '\n   ' + String(e && e.message || e).split('\n').slice(0, 3).join('\n   ')); } };

const bougies = Array.from({ length: 260 }, (_, i) => { const c = 3800 + Math.sin(i / 9) * 40 + i * 0.2, t = Date.UTC(2026, 10, 1) + i * 3600e3; return [t, c - 2, c + 6, c - 7, c, 100]; });
const entree = { actif: 'XAU', unite: 'H1', bougies, niveaux: [{ nom: 'Résistance', bas: 3880, haut: 3895, role: 'resistance' }], fleches: [{ t: bougies[250][0], sens: 'baisse', type: 'retournement', niveau: 3885 }] };
const bonne = { type: 'graphique', resume: 'Le prix évolue sous une résistance. Lecture du contexte uniquement.', zones: [{ nom: 'Résistance', bas: 3880, haut: 3895, role: 'resistance' }], niveaux: [{ nom: 'MA200', prix: 3862.5, role: 'support' }], scenarios: [{ nom: 'Reprise', condition: 'Si le prix clôture au-dessus de 3 895', direction: 'haussier', cible: 3930, invalidation: 3870, chemin: [3890, 3910, 3930] }, { nom: 'Repli', condition: 'Si le prix casse 3 850', direction: 'baissier', cible: 3820 }], invalidations: [{ prix: 3850, texte: 'Une clôture sous 3 850 annule la lecture haussière' }] };
const { plage } = texteGraphique(entree);

/* ─── schéma ─── */
await t('réponse valide acceptée ; avertissement imposé par notre code', () => { const a = validerAnalyse({ ...bonne, avertissement: 'Signal fiable à 100 %' }, { plage }); assert.equal(a.avertissement, AVERTISSEMENT); assert.equal(a.scenarios.length, 2); });
await t('JSON entouré de texte et de clôtures ```json accepté', () => { assert.equal(extraireJson('Voici :\n```json\n' + JSON.stringify(bonne) + '\n```\nBonne chance').type, 'graphique'); });
for (const [nom, brut] of [['vide', ''], ['pas de JSON', 'désolé je ne peux pas'], ['JSON tronqué', '{"type":"graphique","resume":"x"'], ['JSON invalide', '{type: graphique}'], ['tableau', '[1,2]']]) await t('rejet propre : ' + nom, () => assert.throws(() => valider('graphique', brut, { plage }), Error));
await t('probabilité chiffrée rejetée', () => { for (const r of ['70 % de chances de hausse', 'probabilité de 60 %', '3 chances sur 4', 'odds 2:1']) assert.throws(() => validerAnalyse({ ...bonne, resume: r }, { plage }), /probabilit|interdit/i, r); });
await t('taille de position rejetée', () => { for (const r of ['prendre 2 lots', 'risquer 1 % du capital', 'taille de position : 0,5', 'levier x10']) assert.throws(() => validerAnalyse({ ...bonne, invalidations: [{ prix: 3850, texte: r }] }, { plage }), /position|interdit/i, r); });
await t('prix absurde (hors graphique) rejeté', () => { assert.throws(() => validerAnalyse({ ...bonne, niveaux: [{ nom: 'X', prix: 99999 }] }, { plage }), /hors du graphique/); assert.throws(() => validerAnalyse({ ...bonne, zones: [{ nom: 'Z', bas: 3900, haut: 3800 }] }, { plage }), /bas > haut/); assert.throws(() => validerAnalyse({ ...bonne, niveaux: [{ nom: 'X', prix: 'abc' }] }, { plage }), /prix numérique/); });
await t('scénario non conditionnel, analyse vide, trop d\'éléments : rejetés', () => { assert.throws(() => validerAnalyse({ ...bonne, scenarios: [{ nom: 'A', condition: 'Le prix montera', direction: 'haussier' }] }, { plage }), /conditionnelle/); assert.throws(() => validerAnalyse({ type: 'graphique', resume: 'rien' }, { plage }), /vide/); assert.throws(() => validerAnalyse({ ...bonne, scenarios: Array(5).fill(bonne.scenarios[0]) }, { plage }), /au plus/); assert.throws(() => validerAnalyse({ ...bonne, type: 'autre' }, { plage }), /type attendu/); });
await t('actualité : valide, et rejette prévision chiffrée', () => { assert.equal(validerActualite({ resume: 'r', themes: [{ titre: 'Taux', explication: 'Les titres évoquent la Fed.', actifs: ['or', 'zzz'] }] }).themes[0].actifs.length, 1); assert.throws(() => validerActualite({ resume: 'r', themes: [{ titre: 'T', explication: '80 % de chances de baisse' }] }), /interdit/); });

/* ─── texte exporté ─── */
await t('texte exporté : actif, unité, MA200, RSI, niveaux, flèches, échelle, format JSON, consignes', () => {
  const x = texteGraphique(entree).texte; for (const m of ['XAU', 'H1', 'MA200 :', 'RSI(14)', 'Résistance', 'FLÈCHES v8', 'ÉCHELLE DE PRIX', 'FORMAT JSON ATTENDU', '"scenarios"', 'JAMAIS de probabilité', 'commence par « Si »', AVERTISSEMENT]) assert.ok(x.includes(m), m);
  const closes = bougies.map(b => b[4]); assert.ok(x.includes(String(Number(sma(closes, 200).toFixed(2)))), 'valeur de la MA200'); assert.ok(rsi(closes) > 0 && rsi(closes) < 100);
  assert.equal((x.match(/^2026-/gm) || []).length, 40, '40 dernières bougies'); assert.match(texteActualite({ titres: [{ titre: 'T1', source: 'S', heure: 'h' }] }).texte, /TITRES/); assert.throws(() => texteGraphique({ bougies: [[1, 1, 1, 1, 1]] }), /trop peu/);
});

/* ─── fournisseurs ─── */
const rep = (corps, status = 200) => async () => new Response(JSON.stringify(corps), { status });
const REP = { gemini: j => ({ candidates: [{ content: { parts: [{ text: j }] } }] }), groq: j => ({ choices: [{ message: { content: j } }] }), openrouter: j => ({ choices: [{ message: { content: j } }] }), anthropic: j => ({ content: [{ type: 'text', text: j }] }) };
await t('fournisseur « aucun » : jamais d\'erreur, retour au mode manuel', async () => { const F = creerFournisseur({ env: {} }); const r = await F.analyserGraphique(entree); assert.equal(r.ok, false); assert.equal(r.retourManuel, true); assert.match(r.raison, /aucun fournisseur/); const e = F.etat(); assert.equal(e.automatique, false); assert.equal(e.fournisseur, 'aucun'); assert.ok(e.cout.texte); });
await t('fournisseur inconnu ou clé absente : message clair', async () => { let F = creerFournisseur({ env: { AI_PROVIDER: 'zzz' } }); assert.match((await F.analyserGraphique(entree)).raison, /inconnu/); F = creerFournisseur({ env: { AI_PROVIDER: 'groq' } }); const r = await F.analyserGraphique(entree); assert.match(r.raison, /clé/); assert.equal(r.retourManuel, true); });
for (const id of ['gemini', 'groq', 'openrouter', 'anthropic']) await t('fournisseur ' + id + ' : réponse validée, clé jamais exposée', async () => {
  let vu = null; const F = creerFournisseur({ env: { AI_PROVIDER: id, AI_API_KEY: 'CLE-SECRETE-123' }, fetchImpl: async (url, o) => { vu = { url, o }; return new Response(JSON.stringify(REP[id](JSON.stringify(bonne))), { status: 200 }); } });
  const r = await F.analyserGraphique(entree); assert.ok(r.ok, r.raison); assert.equal(r.analyse.scenarios.length, 2); assert.ok(!JSON.stringify(r).includes('CLE-SECRETE-123'), 'clé absente de la réponse'); assert.ok(JSON.stringify(vu.o.headers).includes('CLE-SECRETE-123') && !vu.url.includes('CLE-SECRETE'), 'clé dans l\'en-tête seulement'); assert.ok(!JSON.stringify(vu.o.body).includes('CLE-SECRETE')); assert.equal(F.etat().automatique, true);
});
await t('quota du fournisseur dépassé (429) : message clair, retour manuel, pas de plantage', async () => { const F = creerFournisseur({ env: { AI_PROVIDER: 'gemini', AI_API_KEY: 'k' }, fetchImpl: rep({ error: 'quota' }, 429) }); const r = await F.analyserGraphique(entree); assert.equal(r.ok, false); assert.match(r.raison, /quota|429/); assert.equal(r.retourManuel, true); });
await t('clé refusée, erreur 500, réseau coupé, délai : tous gérés', async () => { for (const [f, motif] of [[rep({}, 401), /refusée/], [rep({}, 500), /HTTP 500/], [async () => { throw new TypeError('fetch failed CLE-SECRETE-9'); }, /injoignable/], [async () => { const e = new Error('x'); e.name = 'AbortError'; throw e; }, /délai/]]) { const F = creerFournisseur({ env: { AI_PROVIDER: 'groq', AI_API_KEY: 'CLE-SECRETE-9' }, fetchImpl: f }); const r = await F.analyserGraphique(entree); assert.equal(r.ok, false); assert.match(r.raison, motif); assert.ok(!r.raison.includes('CLE-SECRETE-9'), 'clé masquée'); assert.equal(r.retourManuel, true); } });
await t('réponse de l\'IA invalide ou interdite : rejetée proprement', async () => { for (const brut of ['pas du json', JSON.stringify({ ...bonne, resume: '80 % de chances de hausse' }), JSON.stringify({ ...bonne, niveaux: [{ nom: 'X', prix: 1 }] })]) { const F = creerFournisseur({ env: { AI_PROVIDER: 'openrouter', AI_API_KEY: 'k' }, fetchImpl: rep(REP.openrouter(brut)) }); const r = await F.analyserGraphique(entree); assert.equal(r.ok, false); assert.equal(r.reponseRejetee, true); assert.match(r.raison, /rejetée/); } const F2 = creerFournisseur({ env: { AI_PROVIDER: 'groq', AI_API_KEY: 'k' }, fetchImpl: async () => new Response('<html>', { status: 200 }) }); assert.equal((await F2.analyserGraphique(entree)).ok, false); });
await t('limite quotidienne : atteinte → message, plus aucun appel ; réinitialisée le lendemain', async () => {
  let n = 0, jour = Date.UTC(2026, 10, 14, 10); const quota = creerQuota({ limite: 2, maintenant: () => jour }); const F = creerFournisseur({ env: { AI_PROVIDER: 'groq', AI_API_KEY: 'k' }, quota, fetchImpl: async () => { n++; return new Response(JSON.stringify(REP.groq(JSON.stringify(bonne))), { status: 200 }); } });
  assert.ok((await F.analyserGraphique(entree)).ok); assert.ok((await F.analyserGraphique(entree)).ok); const r = await F.analyserGraphique(entree); assert.equal(r.ok, false); assert.match(r.raison, /limite quotidienne/); assert.equal(n, 2); assert.equal(F.etat().quota.restants, 0);
  jour += 864e5; assert.ok((await F.analyserGraphique(entree)).ok); assert.equal(n, 3);
});
await t('coût estimé : gratuit = quota du fournisseur ; payant sans tarif = non estimable ; avec tarif = chiffré', () => {
  assert.match(estimerCout('x'.repeat(7000), configuration({ AI_PROVIDER: 'groq' }), {}).texte, /gratuit/); assert.match(estimerCout('x'.repeat(7000), configuration({ AI_PROVIDER: 'anthropic' }), {}).texte, /non estimable/);
  const c = estimerCout('x'.repeat(7000), configuration({ AI_PROVIDER: 'anthropic' }), { AI_PRICE_IN_PER_MTOK: '1', AI_PRICE_OUT_PER_MTOK: '5' }); assert.ok(c.usd > 0 && /\$/.test(c.texte)); assert.equal(FOURNISSEURS.anthropic.gratuit, false); assert.ok(['gemini', 'groq', 'openrouter'].every(k => FOURNISSEURS[k].gratuit));
});
await t('type actualité par fournisseur', async () => { const j = { type: 'actualite', resume: 'r', themes: [{ titre: 'Fed', explication: 'Les titres parlent de la Fed.', actifs: ['usd'] }] }; const F = creerFournisseur({ env: { AI_PROVIDER: 'groq', AI_API_KEY: 'k' }, fetchImpl: rep(REP.groq(JSON.stringify(j))) }); const r = await F.analyser('actualite', { titres: [{ titre: 'T', source: 'S', heure: 'h' }] }); assert.ok(r.ok, r.raison); assert.equal(r.analyse.themes.length, 1); });

/* ─── dessin ─── */
await t('échelle prix → pixel exacte (aller-retour)', () => { const E = creerEchelle({ min: 3700, max: 3900, hauteur: 760, haut: 46, bas: 70 }); for (const p of [3700, 3777.77, 3862.5, 3900]) assert.ok(Math.abs(E.prix(E.y(p)) - p) < 1e-9); assert.ok(E.y(3900) < E.y(3700)); assert.equal(E.y(3900), 46); assert.equal(E.y(3700), 760 - 70); assert.throws(() => creerEchelle({ min: 5, max: 5, hauteur: 100 }), /invalide/); });
const faux = () => { const appels = { texte: [], rect: 0, ligne: 0 }; const ctx = new Proxy({}, { get: (_, k) => k === 'measureText' ? t => ({ width: String(t).length * 6 }) : k === 'fillText' ? t => appels.texte.push(String(t)) : k === 'fillRect' ? () => { appels.rect++; } : k === 'lineTo' ? () => { appels.ligne++; } : () => {}, set: () => true }); return { ctx, appels }; };
await t('image annotée interne : zones, niveaux, scénarios, invalidations, légende, avertissement dessinés', () => {
  const { ctx, appels } = faux(); const a = validerAnalyse(bonne, { plage }); const r = dessinerGraphiqueAnnote(ctx, { bougies, analyse: a, actif: 'XAU', unite: 'H1' });
  assert.deepEqual(r.fait, { zones: 1, niveaux: 1, scenarios: 2, invalidations: 1 }); const T = appels.texte.join('|'); for (const m of ['Résistance', 'MA200', '✕ invalidation', '1. Reprise', 'Scénario haussier', 'positions exactes', AVERTISSEMENT]) assert.ok(T.includes(m), m); assert.ok(appels.ligne > 100 && appels.rect > 100, 'bougies et traits');
  assert.ok(Math.abs(r.E.y(3862.5) - (46 + (r.E.max - 3862.5) * ((760 - 46 - 70) / (r.E.max - r.E.min)))) < 1e-6);
});
await t('capture importée : mention « POSITIONS APPROXIMATIVES » très visible', () => { const { ctx, appels } = faux(); const r = dessinerSurImage(ctx, { image: {}, largeur: 1000, hauteur: 600, prixHaut: 3950, prixBas: 3750, analyse: validerAnalyse(bonne, { plage }) }); assert.ok(appels.texte.some(x => /POSITIONS APPROXIMATIVES/.test(x))); assert.equal(r.fait.zones, 1); });

/* ─── API ─── */
const appel = async (chemin, corps, ia, env = {}) => { const r = await gererMarches(new Request('http://x' + chemin, corps === undefined ? {} : { method: 'POST', body: typeof corps === 'string' ? corps : JSON.stringify(corps) }), { ia, env }); return { status: r.status, j: await r.json() }; };
await t('API : état « aucun », analyser sans fournisseur = retour manuel (200), corps invalide = 400, jamais de clé', async () => {
  const ia = creerFournisseur({ env: {} }); let r = await appel('/marches/ia/etat', undefined, ia); assert.equal(r.j.automatique, false); r = await appel('/marches/ia/analyser', { type: 'graphique', entree }, ia); assert.equal(r.status, 200); assert.equal(r.j.ok, false); assert.equal(r.j.retourManuel, true);
  r = await appel('/marches/ia/analyser', 'pas json', ia); assert.equal(r.status, 400); r = await appel('/marches/ia/estimer', { type: 'graphique', entree }, ia); assert.ok(r.j.cout.texte);
  const ia2 = creerFournisseur({ env: { AI_PROVIDER: 'groq', AI_API_KEY: 'SECRET-XYZ' }, fetchImpl: rep(REP.groq(JSON.stringify(bonne))) }); r = await appel('/marches/ia/analyser', { type: 'graphique', entree }, ia2); assert.equal(r.j.ok, true); assert.ok(!JSON.stringify(r.j).includes('SECRET-XYZ')); r = await appel('/marches/ia/etat', undefined, ia2); assert.ok(!JSON.stringify(r.j).includes('SECRET-XYZ')); assert.equal(r.j.automatique, true);
  r = await appel('/marches/ia/analyser', { type: 'graphique', entree: { bougies: [] } }, ia2); assert.equal(r.j.ok, false);
});

console.log((ko ? '✗ ' : '✓ ') + ok + ' réussis, ' + ko + ' échec(s)'); process.exit(ko ? 1 : 0);
