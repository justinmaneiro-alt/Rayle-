// V16 : pont de notification dans l'appli mobile ouverte + bouton « Test de notification » des réglages. node tests-navigateur/v16-mobile-notif-test.mjs
import fs from 'node:fs';
import { ouvrirMobile, attendre } from './v8-aide.mjs';
fs.mkdirSync('docs/captures-v16', { recursive: true });
let ok = 0, ko = 0; const v = (n, c, d = '') => { if (c) { ok++; console.log('OK  ' + n); } else { ko++; console.log('KO  ' + n + (d !== '' ? ' — ' + d : '')); } };
const ev = (p, f, ...a) => p.evaluate(f, ...a);
const o = await ouvrirMobile('telephone', { attente: 4200 }), p = o.page;
try {
  v('module d’alertes chargé sur le téléphone', await ev(p, () => !!window.AgentAlertes && typeof window.AgentAlertes.tester === 'function'));
  // alerte réelle : une position fraîche détaillée (action, entrée, taille, TP, SL, levier)
  await ev(p, () => { localStorage.removeItem('rayle_agent_vus'); localStorage.setItem('rayle_agent_sim', JSON.stringify({ capital: 10000, risquePct: 1 })); document.getElementById('agent-alertes')?.remove(); });
  const n = await ev(p, () => window.AgentAlertes.surVue({ actives: [{ id: 'm1', actif: 'BTC', tf: 'M15', sens: 1, statut: 'en_attente', entree: 77846, stop: 77386, cible1: 78804, tSignal: Date.now() - 30e3 }] }).length);
  const t = await ev(p, () => (document.querySelector('.agent-alerte') || {}).innerText || '');
  v('une position proposée fait apparaître une alerte', n === 1 && !!t, t);
  v('l’alerte détaille action, entrée, taille, TP, SL et levier', /Achat/.test(t) && /entrée 77846/.test(t) && /taille 16.923 \$/.test(t) && /TP 78804/.test(t) && /SL 77386/.test(t) && /levier 1,7×/.test(t) && /SIMULATION/.test(t), t);
  await ev(p, () => document.getElementById('agent-alertes')?.remove());
  // interrupteur : alertes coupées = pas de bandeau
  await ev(p, () => { localStorage.setItem('rayle_alertes_agent', '0'); localStorage.removeItem('rayle_agent_vus'); });
  await ev(p, () => window.AgentAlertes.surVue({ actives: [{ id: 'm2', actif: 'SOL', tf: 'M15', sens: -1, statut: 'en_attente', entree: 95, stop: 96, cible1: 92, tSignal: Date.now() - 1000 }] }));
  v('alertes désactivées dans les réglages : aucun bandeau', await ev(p, () => !document.querySelector('.agent-alerte')));
  await ev(p, () => { localStorage.removeItem('rayle_alertes_agent'); });
  // bouton de test dans les réglages (feuille « Affichage mobile »)
  await ev(p, () => window.MobilePlus.affichage()); await attendre(700);
  v('réglages : bouton « Test de notification » présent', await ev(p, () => !!document.querySelector('[data-test-notif]')));
  v('réglages : interrupteur « Alertes de l’agent » présent', await ev(p, () => !!document.getElementById('mi-alertes')));
  await ev(p, () => document.querySelector('[data-test-notif]').click()); await attendre(1200);
  const msg = await ev(p, () => document.querySelector('[data-test-notif-msg]').innerText), ban = await ev(p, () => (document.querySelector('.agent-alerte') || {}).innerText || '');
  v('le test affiche une alerte d’exemple complète marquée TEST', /TEST/.test(ban) && /taille/.test(ban) && /levier/.test(ban) && /TP/.test(ban) && /SL/.test(ban), ban);
  v('le test dit ce qui a marché (notification système, vibration)', /Notification système/.test(msg) && /Vibration/.test(msg), msg);
  await p.screenshot({ path: 'docs/captures-v16/mobile-test-notification.png' });
} finally { await o.fermer(); }
console.log('\n' + ok + ' réussis, ' + ko + ' échecs'); process.exitCode = ko ? 1 : 0;
