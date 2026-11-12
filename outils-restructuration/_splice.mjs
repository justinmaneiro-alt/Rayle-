import fs from 'node:fs';
let t = fs.readFileSync('core/commun/miniatures.js', 'utf8').split(String.fromCharCode(13)).join('');
const nouveau = fs.readFileSync('outils-restructuration/_terre_mini.txt', 'utf8');
const i0 = t.indexOf('  /* ───── terre : globe et actualité ───── */'), i1 = t.indexOf('  /* ───── développement 3D : engrenage ───── */');
if (i0 < 0 || i1 < 0) throw new Error('bornes');
let n = nouveau;
// composition identique à la galaxie : rendu → sortie (ACES + sRGB)
n = n.replace("    globe.scene.add(ciel.groupe);\n", "    globe.scene.add(ciel.groupe);\n    const [{EffectComposer},{RenderPass},{OutputPass}]=await Promise.all([import('three/addons/postprocessing/EffectComposer.js'),import('three/addons/postprocessing/RenderPass.js'),import('three/addons/postprocessing/OutputPass.js')]);\n    const cible=new T.WebGLRenderTarget(W,H,{type:T.HalfFloatType}); const composer=new EffectComposer(rendu,cible); composer.setPixelRatio(1); composer.setSize(W,H); composer.addPass(new RenderPass(globe.scene,globe.camera)); composer.addPass(new OutputPass());\n");
n = n.replace("const t0=performance.now(); rendu.render(globe.scene,globe.camera); rendu.toneMapping=tm; rendu.toneMappingExposure=ex;", "const t0=performance.now(); composer.render(dt); rendu.toneMapping=tm; rendu.toneMappingExposure=ex;");
t = t.slice(0, i0) + n + '\n' + t.slice(i1);
// plus de texte posé sur les images 3D : libellé discret dans le pied du panneau
t = t.replace(" if(m.erreur){ m.ctx.fillStyle='#9db0bb'; m.ctx.font='13px \"Segoe UI\",system-ui,sans-serif'; m.ctx.fillText(m.erreur,12,H-18); } }, intervalle:50, statique:true };", " }, intervalle:50, statique:true };");
fs.writeFileSync('core/commun/miniatures.js', t);
console.log('ok', t.includes('function pos('));
