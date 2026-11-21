/* Tests du cerveau (v8) : passerelle Gemini avec repli entre modèles, outils déclarés, séparation parlé/détail, prise en main des questions de trading. Lancer : node worker-gemini/tests/gemini-cerveau-test.mjs */
import fs from 'node:fs'; import vm from 'node:vm';
import { appelerCerveau, construireCorps, routeCerveau, reinitialiserCerveau, MODELES_TEXTE } from '../gemini-cerveau.js';
import { DECLARATIONS, OUTILS, actifDe, executer, etiquettesDe, surlignagesDe } from '../../trader-pro/cerveau/outils.js';
import { DECLARATIONS as DECL_ACTIONS, EST_ACTION, FENETRES } from '../../trader-pro/cerveau/actions.js';
let ok = 0, ko = 0; const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d ? ' — ' + d : '')); };
const rep = (statut, corps) => ({ ok: statut >= 200 && statut < 300, status: statut, json: async () => corps, text: async () => JSON.stringify(corps) });
const ok200 = parts => rep(200, { candidates: [{ content: { parts }, finishReason: 'STOP' }], usageMetadata: { totalTokenCount: 10 } });
const req = { system: 'Tu es Rayle', contents: [{ role: 'user', parts: [{ text: 'salut' }] }], outils: DECLARATIONS };

/* corps de requête */
const c1 = construireCorps(req, 'gemini-2.5-flash'), c2 = construireCorps(req, 'gemini-3.1-flash-lite'), est0 = u => u.includes('/models/' + MODELES_TEXTE[0] + ':');
v('outils transmis en functionDeclarations, appel automatique', c1.tools[0].functionDeclarations.length === DECLARATIONS.length && c1.toolConfig.functionCallingConfig.mode === 'AUTO');
v('réflexion réduite (économise secondes et quota) : 2.5 budget 0 ; 3.x niveau « low »', c1.generationConfig.thinkingConfig.thinkingBudget === 0 && c2.generationConfig.thinkingConfig.thinkingLevel === 'low');
/* repli entre modèles : 429 → modèle suivant ; 404 → suivant ; tout en échec → 429 explicite */
reinitialiserCerveau(); const appels = [];
let r = await appelerCerveau(req, { cle: 'k', fetchFn: async (u) => { appels.push(u); return est0(u) ? rep(429, { error: { message: 'quota', details: [{ violations: [{ quotaMetric: 'x', quotaId: 'GenerateRequestsPerMinute' }] }] } }) : ok200([{ text: 'Bonjour' }]); } });
v('premier modèle en quota → le suivant répond', r.model === MODELES_TEXTE[1] && r.parts[0].text === 'Bonjour' && appels.length === 2, r.model);
appels.length = 0; r = await appelerCerveau(req, { cle: 'k', fetchFn: async u => { appels.push(u); return ok200([{ text: 'ok' }]); } });
v('le modèle en quota est mis de côté (pas de nouvel essai pendant la pause)', r.model === MODELES_TEXTE[1] && appels.length === 1, appels.join());
reinitialiserCerveau(); r = await appelerCerveau(req, { cle: 'k', fetchFn: async u => (est0(u) ? rep(404, {}) : ok200([{ functionCall: { name: 'prix_et_tendance', args: { actif: 'or' } }, thoughtSignature: 'sig' }])) });
v('modèle absent (404) → suivant ; appel de fonction et signature de réflexion renvoyés intacts', r.parts[0].functionCall.name === 'prix_et_tendance' && r.parts[0].thoughtSignature === 'sig');
reinitialiserCerveau(); let e = null; try { await appelerCerveau(req, { cle: 'k', fetchFn: async () => rep(429, { error: { message: 'Quota exceeded PerDay' } }) }); } catch (x) { e = x; }
v('tous les modèles en quota : erreur 429 avec le détail de chaque modèle', e && e.statut === 429 && e.quota === true && /PerDay/.test(e.message) && e.message.split(';').length >= MODELES_TEXTE.length, e && e.message.slice(0, 120));
reinitialiserCerveau(); e = null; try { await appelerCerveau(req, { cle: '', fetchFn: async () => ok200([{ text: 'x' }]) }); } catch (x) { e = x; }
v('clé absente : erreur claire', e && /GEMINI_KEY/.test(e.message));
/* route */
const json = (o, s = 200) => ({ statut: s, o }); reinitialiserCerveau();
let q = await routeCerveau({ text: async () => '{"contents":[]}' }, { GEMINI_KEY: 'k' }, null, {}, { json }); v('requête sans message refusée', q.statut === 400);
q = await routeCerveau({ text: async () => 'x'.repeat(400000) }, { GEMINI_KEY: 'k' }, null, {}, { json }); v('requête trop grande refusée', q.statut === 413);
q = await routeCerveau({ text: async () => JSON.stringify(req) }, { GEMINI_KEY: 'k' }, null, {}, { json, fetchFn: async () => ok200([{ text: 'Salut Justin' }]) }); v('route : réponse du modèle', q.statut === 200 && q.o.parts[0].text === 'Salut Justin');
/* outils */
const noms = DECLARATIONS.map(d => d.name);
v('9 outils déclarés, noms uniques, tous implémentés', noms.length === 9 && new Set(noms).size === 9 && noms.every(n => typeof OUTILS[n] === 'function'), noms.join());
v('aucune déclaration avec « properties » vide (refusé par Gemini)', DECLARATIONS.every(d => !d.parameters || Object.keys(d.parameters.properties || {}).length > 0));
v('reconnaissance des actifs parlés', actifDe('le Bitcoin') === 'btc' && actifDe('un point sur l’or') === 'or' && actifDe('Nasdaq 100') === 'us100' && actifDe('le S&P 500') === 'us500' && actifDe('le pétrole') === 'petrole' && actifDe('la tour Eiffel') === null);
const x = await executer('prix_et_tendance', { actif: 'martien' }); v('actif inconnu : « indisponible » avec la raison, jamais un chiffre inventé', x.indisponible && /inconnu/.test(x.indisponible));
v('outil inconnu : refusé proprement', (await executer('supprimer_tout', {})).indisponible);
/* outils d'action (phase 3 et 4) */
v('3 outils d’action déclarés : ouvrir_fenetre, afficher_images, fermer_fenetre', DECL_ACTIONS.map(d => d.name).join() === 'ouvrir_fenetre,afficher_images,fermer_fenetre');
v('EST_ACTION distingue lecture et action', EST_ACTION('ouvrir_fenetre') && EST_ACTION('afficher_images') && EST_ACTION('fermer_fenetre') && !EST_ACTION('prix_et_tendance'));
v('aucune déclaration d’action avec « properties » vide ; fenêtres déclarées', DECL_ACTIONS.every(d => !d.parameters || Object.keys(d.parameters.properties || {}).length > 0) && FENETRES.includes('terminal') && FENETRES.includes('invest'));
v('noms d’outils uniques lecture + action', new Set(DECLARATIONS.concat(DECL_ACTIONS).map(d => d.name)).size === DECLARATIONS.length + DECL_ACTIONS.length);
const tour = [{ nom: 'prix_et_tendance', args: { actif: 'or' }, resultat: { actif: 'or', nom: 'Or', unite: 'H4', prix: 3558.3, variationDepuisHierPct: 0.49, ma200: 3953.77, positionMa200: 'sous', ecartMa200Pct: -10, tendanceDaily: 'baissière', tendanceH4: 'baissière' } }, { nom: 'niveaux', args: { actif: 'or' }, resultat: { actif: 'or', prix: 3558.3, reperesIct: [{ nom: 'PDH', prix: 3561.15 }, { nom: 'PWL', prix: 3505.33 }], volume: { pocH4: 4020, vah: 4168, val: 3872 } } }, { nom: 'marches', args: { actif: 'or' }, resultat: { cot: { indexSpeculateurs: 37 }, scoreMarche: { score100: 20, verdict: 'Vendeur fort' } } }];
const E = etiquettesDe(tour), S = surlignagesDe(tour);
v('étiquettes de chiffres clés : prix, MA200, tendance, support, résistance, COT, score', E.length === 5 && E[0].val.includes('3') && /MA200 H4/.test(E[1].label) && E.some(x => /Support/.test(x.label)) , E.map(x => x.label).join(' | '));
v('étiquettes : ton haut/bas selon le signe (prix sous la MA200 = bas)', E[1].ton === 'bas' && E[0].ton === 'haut');
v('surbrillance : la MA200 et les niveaux proches ; COT', S.some(x => x.type === 'prix' && x.prix === 3953.77) && S.some(x => x.type === 'prix' && x.texte === 'PDH') && S.some(x => x.type === 'cot'));
v('un outil indisponible ne produit ni étiquette ni surbrillance', etiquettesDe([{ nom: 'prix_et_tendance', resultat: { indisponible: 'x' } }]).length === 0 && surlignagesDe([{ nom: 'prix_et_tendance', resultat: { indisponible: 'x' } }]).length === 0);
/* script de la page : prise en main et découpe parlé/détail */
const src = fs.readFileSync('core/intelligence/cerveau.js', 'utf8'); const win = {}; vm.runInNewContext(src + '\nthis.Cerveau=window.Cerveau;', { window: win, document: { baseURI: 'http://x/' }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, Intl, Date, JSON, console, setTimeout, clearTimeout, AbortController, W: { token: () => 't', url: () => 'u' } }); const C = win.Cerveau;
for (const t of ['Rayle, fais-moi un point sur l’or', 'Montre-moi le rapport COT de l’or', 'Est-ce que le Bitcoin est cher ?', 'Comment me couvrir si j’achète de l’or ?', 'Quel est mon risque aujourd’hui ?', 'Quelles annonces aujourd’hui ?', 'et en H4 pour le Nasdaq ?']) v('prise en main : ' + t, C.prendLaMain(t));
for (const t of ['ouvre le terminal', 'ferme ça', 'retour à l’accueil', 'Qui était Napoléon Bonaparte ?', 'la tour Eiffel', 'raconte-moi une blague']) v('laissé aux commandes ou à la culture générale : ' + t, !C.prendLaMain(t));
const s = C.separer('Le prix est 3 558.\n---DETAIL---\n- MA200 : 3 953'); v('découpe : parlé court + détail à l’écran', s.parle === 'Le prix est 3 558.' && /MA200/.test(s.detail) && !/---/.test(s.parle));
v('le texte parlé n’a pas de markdown', C.separer('**Or** : `3 558` dollars').parle === 'Or : 3 558 dollars');
console.log(`${ok} ok, ${ko} KO`); process.exit(ko ? 1 : 0);
