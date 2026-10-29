// V8 : captures des vues historiques sur téléphone (terminal, carte, réglages, pays, sources, événements). node tests-navigateur/v8-vues.mjs [telephone|tablette] [dossier]
import fs from 'node:fs';
import { ouvrirMobile, attendre, recouvert } from './v8-aide.mjs';
const cle = process.argv[2] || 'telephone', dos = process.argv[3] || 'docs/captures-v8/vues';
fs.mkdirSync(dos, { recursive: true });
const o = await ouvrirMobile(cle, { attente: 3500 }), p = o.page;
const tuile = id => p.evaluate(i => { MobileCoque.aller('plus'); const b = document.querySelector('.m-tuile[data-id="' + i + '"]'); b.click(); }, id);
for (const id of ['terminal', 'carte', 'pays', 'sources', 'evenements', 'reglages', 'affichage', 'anatomie']) {
  await tuile(id); await attendre(3500);
  await p.screenshot({ path: `${dos}/${id}-${cle}.png` });
  // retour : touche Échap / fermeture générique
  await p.evaluate(() => { MobileCoque.fermerFeuilles(); const r = document.getElementById('btnRetour'); if (r && document.body.classList.contains('vue-terminal')) r.click(); if (window.HoteModules && HoteModules.ouvert()) HoteModules.fermer(); const c = document.getElementById('cfgClose'); if (c) c.click(); if (window.Panneaux) { try { document.querySelectorAll('#panneaux .pn-x').forEach(x => x.click()); } catch (e) {} } });
  await attendre(800);
}
console.log('erreurs', o.erreurs.length, o.erreurs.slice(0, 6));
await o.fermer();
