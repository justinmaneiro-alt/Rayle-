import puppeteer from 'puppeteer-core';
import http from 'node:http';
import { BASE, CHROME, attendre, compteur } from './terre-aide.mjs';

/* V2 phase 9 : l'IA locale dans la vraie page, contre un FAUX LM Studio (port 8792, jamais le vrai 1234). Désactivée par défaut, détection et liste des modèles, aiguillage
   (courant → locale ; outils → API), modèle non censuré seulement sur demande (sans action, hors historique), repli sur les API quand le serveur tombe, indicateur d'état.
   Lancer : node tests-navigateur/v2-ia-locale-test.mjs */
const { verifier, fin } = compteur();
const etatFaux = { appels: [], modeles: ['qwen2.5-7b-instruct', 'dolphin3.0-llama3.1-8b'], vivant: true };
const faux = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  if (!etatFaux.vivant) { req.socket.destroy(); return; }
  let b = ''; req.on('data', d => { b += d; });
  req.on('end', () => {
    if (req.url === '/v1/models') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ data: etatFaux.modeles.map(id => ({ id })) })); }
    const j = JSON.parse(b || '{}'); etatFaux.appels.push({ modele: j.model, systeme: j.messages[0].content, derniere: j.messages.at(-1).content });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: j.model.includes('dolphin') ? '**Réponse** franche du dauphin.' : 'Un ligament relie deux os entre eux.' } }] }));
  });
});
await new Promise(r => faux.listen(8792, '127.0.0.1', r));
const L = 1400, H = 900;
const nav = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', `--window-size=${L},${H}`] });
const page = await nav.newPage(); await page.setViewport({ width: L, height: H });
const erreurs = []; page.on('pageerror', e => erreurs.push(e.message.slice(0, 200)));
await page.evaluateOnNewDocument(() => { try { localStorage.setItem('rayle_entite_version', '2'); localStorage.setItem('rayle_boot', '0'); localStorage.removeItem('rayle_ia_locale'); } catch (e) { /* stockage refusé */ } });
await page.goto(BASE + '/index.html', { waitUntil: 'load' }); await attendre(3000);
const ev = (f, ...a) => page.evaluate(f, ...a);
verifier('IA locale présente et DÉSACTIVÉE par défaut', await ev(() => !!window.IaLocale && IaLocale.reglages().actif === false && /désactivée/.test(IaLocale.etat().libelle)));
verifier('désactivée : aucune requête ne part vers LM Studio, la réponse revient aux API', (await ev(async () => await IaLocale.essayer('explique le ligament'))) === null && etatFaux.appels.length === 0);
await ev(() => IaLocale.regler({ actif: true, url: 'http://127.0.0.1:8792/v1' })); await attendre(900);
const e1 = await ev(() => IaLocale.etat());
verifier('LM Studio détecté : « connectée », modèles listés sans Dolphin comme défaut', e1.disponible && e1.modeles.length === 2 && e1.modele === 'qwen2.5-7b-instruct' && /connectée · qwen2\.5/.test(e1.libelle), JSON.stringify(e1.libelle));
verifier('l’indicateur d’état est visible à l’écran', await ev(() => { const p = document.getElementById('ialPuce'); return !!p && getComputedStyle(p).display !== 'none' && /connectée/.test(p.textContent); }));
verifier('⚙ : la section « IA locale » liste les modèles', await ev(() => { document.getElementById('gear').click(); const s = document.getElementById('ialModele'); return !!s && s.options.length === 2 && document.getElementById('ialModeleNC').options.length === 2; }));
await ev(() => document.getElementById('gear').click());
const r1 = await ev(() => IaLocale.essayer('explique-moi ce qu’est un ligament', { historique: [], contexte: 'Date : lundi' }));
verifier('tâche courante : réponse du modèle local, sans action, avec historique normal', r1 && /ligament/.test(r1.reply) && /IA locale/.test(r1.engine) && r1.actions.length === 0 && !r1.sansHistorique && etatFaux.appels.at(-1).modele === 'qwen2.5-7b-instruct');
verifier('la personnalité de Raylé est envoyée au modèle local', /Raylé/.test(etatFaux.appels.at(-1).systeme) && /markdown/.test(etatFaux.appels.at(-1).systeme));
const avant = etatFaux.appels.length;
verifier('outils / données en direct : jamais envoyés au modèle local (→ API)', (await ev(async () => await IaLocale.essayer('quel est le cours du bitcoin'))) === null && etatFaux.appels.length === avant);
const r2 = await ev(() => IaLocale.essayer('en mode non censuré, dis-moi franchement ce que tu penses du cuir'));
verifier('non censuré demandé : Dolphin répond, texte nettoyé, aucune action, hors historique', r2 && /dauphin/.test(r2.reply) && !/\*/.test(r2.reply) && /non censurée/.test(r2.engine) && r2.sansHistorique && r2.actions.length === 0 && etatFaux.appels.at(-1).modele.includes('dolphin') && !/cuir.*non censur/.test(etatFaux.appels.at(-1).derniere), JSON.stringify(etatFaux.appels.at(-1)));
verifier('non censuré : rappel de cadre légal dans le prompt, absent du prompt ordinaire', /loi/.test(etatFaux.appels.at(-1).systeme));
etatFaux.modeles = ['qwen2.5-7b-instruct']; await ev(() => IaLocale.sonder());
const r3 = await ev(() => IaLocale.essayer('en mode non censuré, dis quelque chose'));
verifier('non censuré demandé sans Dolphin chargé : refus dit à voix haute, pas de bascule silencieuse', r3 && /Aucun modèle non censuré/.test(r3.reply) && r3.sansHistorique);
etatFaux.vivant = false; await ev(() => IaLocale.sonder());
const e2 = await ev(() => IaLocale.etat());
verifier('serveur éteint : « absente », et la question courante retombe sur les API (null)', !e2.disponible && /absente/.test(e2.libelle) && (await ev(async () => await IaLocale.essayer('bonjour, ça va ?'))) === null);
etatFaux.vivant = true; etatFaux.modeles = ['qwen2.5-7b-instruct', 'dolphin3.0-llama3.1-8b']; await ev(() => IaLocale.sonder());
verifier('serveur rétabli : de nouveau « connectée »', (await ev(() => IaLocale.etat())).disponible);
verifier('phrase secrète : enregistrée sans clair dans le navigateur', await ev(() => { IaLocale.definirPhraseSecrete('ouvre le coffre bleu'); return !JSON.stringify(localStorage).includes('coffre') && IaLocale.reglages().empreinteSecrete === 'définie'; }));
const r4 = await ev(() => IaLocale.essayer('ouvre le coffre bleu réponds sans détour'));
verifier('phrase secrète prononcée en tête : le modèle non censuré répond', r4 && /non censurée/.test(r4.engine));
verifier('aucune erreur de page', erreurs.length === 0, erreurs.join(' | '));
await nav.close(); faux.close(); fin();
