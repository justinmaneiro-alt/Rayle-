// Registre des capacités de Raylé (js/rayle/capacites.js) : chaque exemple est passé dans le VRAI analyseur de phrases ; paramètres lus dans le code ; contexte et état.
//   node tests/capacites-test.mjs
import vm from 'node:vm';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { chargerRegistre } from './lib-capacites.mjs';

const R = await chargerRegistre();
const { reg, verifier, ctx } = R;
let ok = 0; const t = async (n, f) => { try { await f(); ok++; console.log('  ✔', n); } catch (e) { console.log('  ✘', n, '\n   ', e.stack.split('\n').slice(0, 3).join('\n    ')); process.exitCode = 1; } };

await t('chaque exemple de chaque famille « vérifiée » déclenche vraiment une commande (sinon le registre est désynchronisé du code)', async () => {
  let total = 0;
  for (const f of reg.FAMILLES) {
    if (!f.verif) continue;
    for (const ex of f.ex) { const r = await verifier(f.verif, ex); assert.ok(r, 'famille « ' + f.id + ' » : l’exemple « ' + ex + ' » ne déclenche rien'); total++; }
  }
  assert.ok(total >= 30, 'au moins 30 exemples vérifiés : ' + total);
});
await t('les familles sans analyseur local sont déclarées comme telles (verif:null), jamais « vérifiées » à tort', () => {
  const sans = reg.FAMILLES.filter(f => !f.verif).map(f => f.id).sort();
  assert.deepEqual([...sans], ['agent', 'appareils', 'memoire', 'univers', 'voix']);
  for (const f of reg.FAMILLES) { assert.ok(f.nom && f.court && f.ex.length >= 2, f.id); assert.equal(typeof f.params(), 'string'); assert.ok(Array.isArray(f.limites)); }
});
await t('paramètres lus dans le code : tous les astres, rovers et actifs apparaissent ; un astre ajouté apparaît tout seul', () => {
  const p = reg.famille('espace').params();
  for (const m of ['Mercure', 'Vénus', 'Mars', 'Jupiter', 'Saturne', 'Uranus', 'Neptune', 'Soleil', 'Lune', 'ISS', 'Perseverance', 'Curiosity', 'cratère Gale', 'cratère Jezero', 'Terre–Lune', 'ciels']) assert.ok(p.includes(m), m + ' absent de : ' + p);
  assert.match(reg.famille('terminal').params(), /Nasdaq.*Bitcoin.*Solana.*l'or|Nasdaq/s);
  ctx.RayleUI.espace.ASTRES.pluton = { nom: 'Pluton', court: 'Pluton' };
  assert.ok(reg.famille('espace').params().includes('Pluton'), 'un astre ajouté dans le code apparaît dans le registre');
  delete ctx.RayleUI.espace.ASTRES.pluton;
});
await t('contexte pour l’IA : toutes les familles, règles, état ; détail ciblé selon la phrase ; taille raisonnable (jetons)', () => {
  const c = reg.contexte('montre-moi Mars puis Perseverance');
  for (const f of reg.FAMILLES) assert.ok(c.includes(f.nom), f.nom);
  assert.match(c, /ne dis jamais « je ne peux pas »/); assert.match(c, /ÉTAT :/); assert.match(c, /DÉTAIL « Univers : scène 3D en fond/);
  assert.match(c, /ne lance jamais de recherche web quand un outil local existe/); assert.match(c, /Ne dis jamais qu’une action est faite si le résultat de l’outil dit qu’elle a échoué/);
  assert.ok(c.length < 8200, 'contexte de ' + c.length + ' caractères');      // 6000 avant les familles « Présentations animées », « Cerveau 3D » et « Terre vivante », 7000 avant « Univers 3D »
  assert.ok(!/DÉTAIL « Terminal/.test(reg.contexte('montre-moi Mars')), 'le détail ne concerne que les familles pertinentes');
});
await t('état : écran actif, scène de l’Univers (en fond ou en plein écran), astre affiché, temps, historique récent', () => {
  ctx.vueActive = 'rayle';
  ctx.RayleUnivers = { etat: () => ({ ouvert: true, plein: false, fond: true, scene: { vue: 'systeme', suivi: 'mars', temps: { vitesse: 1, pause: false }, ciel: 'realiste' } }) };
  reg.noterEchange('user', 'montre-moi Mars'); reg.noterEchange('ray', 'Direction Mars.');
  reg.noterEchange('user', 'zoome'); reg.noterEchange('ray', 'Je me rapproche.');
  const e = reg.etat(); assert.equal(e.ecran, 'rayle'); assert.equal(e.espace.cible, 'mars'); assert.equal(e.espace.univers, 'fond'); assert.equal(e.espace.vue, 'systeme');
  const s = reg.etatTexte();
  assert.match(s, /EN FOND derrière l’accueil/); assert.match(s, /vue = systeme/); assert.match(s, /astre affiché = Mars/); assert.match(s, /temps réel/);
  assert.match(s, /« montre-moi Mars » → Direction Mars\./); assert.match(s, /« zoome » → Je me rapproche\./);
  ctx.RayleUnivers = { etat: () => ({ ouvert: true, plein: true, fond: false, scene: { vue: 'terre', temps: { vitesse: 3600, pause: false } } }) };
  assert.match(reg.etatTexte(), /en plein écran : vue = terre/); assert.match(reg.etatTexte(), /accéléré ×3600/); assert.ok(!/astre affiché/.test(reg.etatTexte()), 'sur la Terre : pas d’astre');
  ctx.RayleUnivers = { etat: () => ({ ouvert: false }) }; assert.ok(!/scène de l’Univers/.test(reg.etatTexte()), 'Univers fermé : rien');
  ctx.vueActive = 'terminal'; assert.match(reg.etatTexte(), /écran actif = terminal de trading/);
  ctx.vueActive = 'rayle'; delete ctx.RayleUnivers;
});
await t('journal borné à 6 échanges ; texte long tronqué', () => {
  for (let i = 0; i < 10; i++) { reg.noterEchange('user', 'phrase ' + i + ' ' + 'x'.repeat(300)); reg.noterEchange('ray', 'réponse ' + i); }
  assert.equal(reg.journal.length, 6); assert.ok(reg.journal[0].u.length <= 120); assert.match(reg.journal[5].r, /réponse 9/);
});
await t('markdown généré : une section par famille, exemples et mention de vérification', () => {
  const md = reg.markdown(); for (const f of reg.FAMILLES) assert.ok(md.includes('## ' + f.nom), f.nom);
  assert.match(md, /Vérification automatique\*\* : oui/); assert.match(md, /Vérification automatique\*\* : non/);
});
console.log(ok + ' tests réussis');
