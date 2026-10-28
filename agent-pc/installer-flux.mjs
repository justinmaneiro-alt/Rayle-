// Installation de l'enregistreur de carnet d'ordres, UNE ÉTAPE À LA FOIS (V4).
//   node agent-pc/installer-flux.mjs            fait l'étape suivante et dit quoi faire ensuite
//   node agent-pc/installer-flux.mjs --etat     où en est-on ?
//   node agent-pc/installer-flux.mjs --etape 3  refaire une étape précise
// Étapes : 1 vérifier le PC et les sources · 2 choisir le quota de disque · 3 essai de 20 secondes · 4 démarrer l'enregistrement (et le service Kepler qui le relance) · 5 (facultatif) historique des transactions
// Rien n'est installé hors de ton dossier utilisateur. Aucune clé, aucun compte : seulement des flux publics.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dossierAgent, lireJson, ecrireJson } from './etat-agent.mjs';
import { fichiersFlux, statutFlux, assurerEnregistreur, lireQuotaGo, QUOTA_DEFAUT_GO } from './flux/service-flux.mjs';

const ICI = path.dirname(fileURLToPath(import.meta.url)), dossier = dossierAgent(), FF = fichiersFlux(dossier), progres = path.join(dossier, 'installation-flux.json');
fs.mkdirSync(FF.dossier, { recursive: true });
const faites = lireJson(progres, { etapes: {} });
const marquer = n => { faites.etapes[n] = Date.now(); ecrireJson(progres, faites); };
const args = process.argv.slice(2);
const attendre = ms => new Promise(r => setTimeout(r, ms));
const ouvrirWs = (url, ms = 6000) => new Promise(ok => { try { const ws = new WebSocket(url); const t = setTimeout(() => { try { ws.close(); } catch (e) { /* */ } ok(false); }, ms); ws.onmessage = () => { clearTimeout(t); try { ws.close(); } catch (e) { /* */ } ok(true); }; ws.onopen = () => { if (/kraken/.test(url)) ws.send(JSON.stringify({ method: 'subscribe', params: { channel: 'trade', symbol: ['BTC/USD'] } })); }; ws.onerror = () => { clearTimeout(t); ok(false); }; } catch (e) { ok(false); } });

const ETAPES = {
  1: { nom: 'vérifier le PC et les sources', faire: async () => {
    const maj = Number(process.versions.node.split('.')[0]); let bon = maj >= 22; const l = [(maj >= 22 ? 'OK' : 'KO') + '  Node.js ' + process.versions.node + ' (22 ou plus requis pour les WebSocket intégrés)'];
    let libre = null; try { const s = fs.statfsSync(dossier); libre = Number(s.bavail) * Number(s.bsize); } catch (e) { /* inconnu */ }
    l.push((libre == null || libre > 20 * 1024 ** 3 ? 'OK' : '--') + '  espace libre : ' + (libre == null ? 'inconnu' : (libre / 1024 ** 3).toFixed(0) + ' Go') + ' (15 Go par défaut pour le carnet, + ≈ 1 Go pour l’historique)');
    const k = await ouvrirWs('wss://ws.kraken.com/v2'), bs = await ouvrirWs('wss://stream.binance.com:9443/stream?streams=btcusdt@aggTrade'), bf = await ouvrirWs('wss://fstream.binance.com/stream?streams=btcusdt@aggTrade');
    l.push((k ? 'OK' : 'KO') + '  Kraken (flux public)'); l.push((bs ? 'OK' : 'KO') + '  Binance comptant'); l.push((bf ? 'OK' : '--') + '  Binance futures' + (bf ? '' : ' (indisponible : le reste marchera sans les liquidations)'));
    console.log(l.join('\n')); return bon && (k || bs);
  }, ensuite: 'Étape 2 : choisir la place que le carnet peut prendre sur le disque.' },
  2: { nom: 'choisir le quota de disque', faire: async () => {
    const i = args.indexOf('--quota'), go = i >= 0 ? Number(args[i + 1]) : lireQuotaGo(FF);
    if (!(go >= 1)) { console.log('Donne un nombre de Go, par exemple : node agent-pc/installer-flux.mjs --etape 2 --quota 25'); return false; }
    ecrireJson(FF.config, { ...(lireJson(FF.config, {}) || {}), quotaGo: go });
    console.log('Quota : ' + go + ' Go (défaut ' + QUOTA_DEFAUT_GO + '). Quand il est atteint, les plus VIEUX jours bruts sont supprimés ; les agrégats d’une minute, les dérivés et le journal des trous sont gardés pour toujours.\nOrdre de grandeur : ≈ 0,15 à 0,5 Go par jour pour BTC + SOL + DOGE sur Kraken et Binance. Tu pourras le changer : --etape 2 --quota 30.'); return true;
  }, ensuite: 'Étape 3 : un essai de 20 secondes pour voir que tout est reçu.' },
  3: { nom: 'essai de 20 secondes', faire: async () => {
    const { creerStockage } = await import('./flux/stockage-flux.mjs'), { creerEnregistreur } = await import('./flux/enregistreur.mjs');
    const essai = path.join(dossier, 'flux-essai'); fs.rmSync(essai, { recursive: true, force: true });
    const S = creerStockage({ dossier: essai }), R = creerEnregistreur({ stockage: S, options: { minEchantillons: 200 } }); R.demarrer(); await attendre(20000);
    const e = R.etat(); R.arreter(); const prets = Object.entries(e.flux).filter(([, v]) => v.pret);
    for (const [k, v] of Object.entries(e.flux)) console.log((v.pret ? 'OK  ' : 'KO  ') + k + ' : ' + v.secondes + ' s enregistrées, ' + v.niveaux + ' niveaux' + (v.niveau ? ', spread ' + v.niveau.spreadPct.toFixed(4) + ' %' : ''));
    fs.rmSync(essai, { recursive: true, force: true }); console.log(prets.length + ' flux sur ' + Object.keys(e.flux).length + ' prêts.');
    return prets.length >= 6;
  }, ensuite: 'Étape 4 : démarrer l’enregistrement pour de bon.' },
  4: { nom: 'démarrer l’enregistrement', faire: async () => {
    const r = assurerEnregistreur(dossier); console.log('Enregistreur : ' + r + '.');
    if (process.platform === 'win32') { try { const out = execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(ICI, 'installer-demarrage.ps1')], { encoding: 'utf8' }).trim(); console.log('Démarrage avec Windows (service Kepler, qui relance aussi l’enregistreur) : ' + out); spawn('wscript.exe', [path.join(ICI, 'RayleAgent.vbs')], { detached: true, stdio: 'ignore' }).unref(); } catch (e) { console.log('Démarrage automatique : ' + e.message.slice(0, 120)); } }
    await attendre(15000); console.log(statutFlux(dossier).phrase);
    console.log('\nPour que le PC ne s’endorme pas (l’enregistreur demande « système requis », mais Windows peut quand même couper le courant) : Paramètres > Système > Alimentation > Veille : « Jamais » quand le PC est branché. L’écran peut s’éteindre.');
    return true;
  }, ensuite: 'Facultatif, étape 5 : l’historique des transactions (2 ans, ≈ 25 Go à télécharger, ≈ 0,5 Go gardés) : node agent-pc/installer-flux.mjs --etape 5' },
  5: { nom: 'historique des transactions (facultatif)', faire: async () => {
    console.log('Je lance le téléchargement en arrière-plan (priorité basse, avec reprise si ça coupe). Suivi : node agent-pc/flux/historique-trades.mjs --statut');
    spawn(process.execPath, [path.join(ICI, 'flux', 'historique-trades.mjs'), '--mois', '24'], { detached: true, stdio: 'ignore', windowsHide: true }).unref(); return true;
  }, ensuite: 'Terminé. Vérifie : node agent-pc/service.mjs --statut (ligne « carnetOrdres »).' }
};
if (args.includes('--etat')) { for (const [n, e] of Object.entries(ETAPES)) console.log((faites.etapes[n] ? 'fait    ' : 'à faire ') + n + ' · ' + e.nom + (faites.etapes[n] ? ' (' + new Date(faites.etapes[n]).toLocaleString('fr-FR') + ')' : '')); process.exit(0); }
const iE = args.indexOf('--etape'), n = iE >= 0 ? Number(args[iE + 1]) : [1, 2, 3, 4].find(k => !faites.etapes[k]);
if (!n) { console.log('Les étapes 1 à 4 sont faites. Vérifie : node agent-pc/service.mjs --statut'); process.exit(0); }
if (!ETAPES[n]) { console.log('Étape inconnue (1 à 5).'); process.exit(1); }
console.log('— Étape ' + n + ' : ' + ETAPES[n].nom + ' —');
const ok = await ETAPES[n].faire();
if (ok) { marquer(n); console.log('\nÉtape ' + n + ' faite. ' + ETAPES[n].ensuite); } else console.log('\nÉtape ' + n + ' non terminée : corrige le point ci-dessus puis relance la même commande.');
process.exit(ok ? 0 : 1);
