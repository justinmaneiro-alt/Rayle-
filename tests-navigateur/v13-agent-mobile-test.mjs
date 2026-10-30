// V13 : la vue Agent lisible dans la coque mobile (téléphone et tablette) : barre d'état, quatre chiffres, graphique avec 3 zones au plus, courbe, liste en 3 groupes, « Détails » = les onglets d'avant.
// Faux Worker (paquet de l'agent avec la vue du mode Trader), fausses sources externes. node tests-navigateur/v13-agent-mobile-test.mjs
import fs from 'node:fs';
import { ouvrirMobile, attendre, texte, existe } from './v8-aide.mjs';
fs.mkdirSync('docs/captures-v13', { recursive: true });
let ok = 0, ko = 0; const v = (n, c, d = '') => { if (c) { ok++; console.log('OK  ' + n); } else { ko++; console.log('KO  ' + n + (d !== '' ? ' — ' + d : '')); } };
const ev = (p, f, ...a) => p.evaluate(f, ...a);
for (const cle of ['telephone', 'tablette']) {
  console.log('\n══ ' + cle + ' ══');
  const o = await ouvrirMobile(cle, { attente: 3800, scenario: { agent: 'trader' } }), p = o.page, erreurs = []; p.on('pageerror', e => erreurs.push(e.message.slice(0, 200)));
  await ev(p, () => MobileCoque.aller('agent')); await ev(p, () => { const d = document.querySelector('#m-agent .m-vv-simple'); if (d) d.open = true; }); await p.waitForFunction(() => { const c = document.querySelector('#m-agent [data-al-chart]'); return c && c.dataset.nzones != null; }, { timeout: 25000 }).catch(() => {}); await attendre(1200);
  const t = await texte(p, '#m-agent .al');
  v('la vue principale est la fenêtre lisible', await existe(p, '#m-agent .al-barre') && await existe(p, '#m-agent .al-chiffres'));
  v('barre d’état : service, dernière bougie, « simulation, aucun ordre réel »', /Service en marche/.test(t) && /Dernière bougie \d\d:\d\d/.test(t) && /simulation, aucun ordre réel/.test(t), t.slice(0, 160).replace(/\n/g, ' | '));
  v('quatre chiffres + « échantillon trop petit pour juger » (2 trades)', /trades terminés/.test(t) && /réussite/.test(t) && /R moyen/.test(t) && /cumul/.test(t) && /trop petit pour juger/.test(t));
  const g = await ev(p, () => { const c = document.querySelector('#m-agent [data-al-chart]'), gr = document.querySelector('#m-agent .al-graphe').getBoundingClientRect(); return { nz: +c.dataset.nzones, nm: +c.dataset.nmarq, h: gr.height, vh: innerHeight, perf: document.querySelectorAll('#m-agent [data-al-perf] canvas').length, boutons: [...document.querySelectorAll('#m-agent [data-al-actif]')].every(b => b.getBoundingClientRect().height >= 44), debord: document.documentElement.scrollWidth > innerWidth + 2 }; });
  v('6 positions (5 en attente, 1 en cours) : 3 zones au plus sur le graphique', g.nz === 3, JSON.stringify(g));
  v('deux positions terminées : deux marqueurs ✔ / ✖', g.nm === 2);
  v('mini-courbe de performance présente', g.perf > 0);
  v('graphique grand (≥ 40 % de la hauteur de l’écran), trois boutons d’actif tactiles, pas de débordement', g.h >= g.vh * 0.4 && g.boutons && !g.debord, JSON.stringify(g));
  const l = await ev(p, () => ({ att: document.querySelectorAll('#m-agent [data-groupe="attente"] .al-ligne').length, cours: document.querySelectorAll('#m-agent [data-groupe="cours"] .al-ligne').length, term: document.querySelectorAll('#m-agent [data-groupe="terminees"] .al-ligne').length, termOuvert: document.querySelector('#m-agent [data-groupe="terminees"]').open, taille: parseFloat(getComputedStyle(document.querySelector('#m-agent .al-ligne-b')).fontSize) }));
  v('liste : 5 en attente, 1 en cours, 2 terminées (repliées), texte ≥ 13 px', l.att === 5 && l.cours === 1 && l.term === 2 && !l.termOuvert && l.taille >= 13, JSON.stringify(l));
  v('aucune position de démonstration', !/DÉMO|démonstration/i.test(t));
  await p.screenshot({ path: `docs/captures-v13/apres-agent-mobile-${cle}.png` });
  // Détails : les onglets d'avant, rien de perdu ; retour à l'agent
  await ev(p, () => document.querySelector('#m-agent [data-al-details]').click()); await attendre(900);
  const d = await ev(p, () => ({ onglets: [...document.querySelectorAll('#m-agent .m-onglets [data-o]')].length, lisibleCache: document.querySelector('#m-agent [data-m-lisible]').hidden, garde: !!document.querySelector('#m-agent .m-garde') }));
  v('« Détails » : les onglets d’avant sont là (' + d.onglets + ') et la vue lisible est rangée', d.onglets >= 10 && d.lisibleCache && d.garde, JSON.stringify(d));
  await ev(p, () => document.querySelector('#m-agent [data-retour-agent]').click()); await attendre(500);
  v('« ← Agent » ramène à la vue lisible', await ev(p, () => !document.querySelector('#m-agent [data-m-lisible]').hidden && document.querySelector('#m-agent [data-m-details]').hidden));
  v('aucune erreur JavaScript', erreurs.length === 0, erreurs.join(' | '));
  await o.fermer();
}
{
  console.log('\n══ état vide (aucune position) ══');
  const o = await ouvrirMobile('telephone', { attente: 3800, scenario: { agent: 'sans-position' } }), p = o.page;
  await ev(p, () => MobileCoque.aller('agent')); await ev(p, () => { const d = document.querySelector('#m-agent .m-vv-simple'); if (d) d.open = true; }); await p.waitForFunction(() => { const c = document.querySelector('#m-agent [data-al-chart]'); return c && c.dataset.nzones != null; }, { timeout: 25000 }).catch(() => {}); await attendre(1200);
  const t = await texte(p, '#m-agent .al');
  v('état vide : « Aucune position en attente. Kepler surveille BTC / SOL / DOGE. » + dernière analyse', /Aucune position en attente\. Kepler surveille BTC \/ SOL \/ DOGE\./.test(t) && /Dernière analyse : \d\d:\d\d/.test(t), t.slice(0, 200).replace(/\n/g, ' | '));
  v('état vide : « Pas encore de trade terminé », aucune ligne', /Pas encore de trade terminé/.test(t) && await ev(p, () => document.querySelectorAll('#m-agent .al-ligne').length === 0));
  await p.screenshot({ path: 'docs/captures-v13/apres-agent-mobile-vide.png' });
  await o.fermer();
}
console.log('\n' + ok + ' réussis, ' + ko + ' échecs'); process.exit(ko ? 1 : 0);
