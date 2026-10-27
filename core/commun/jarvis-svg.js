/* ═════════════ ANNEAUX DU HUD JARVIS (génération pure du SVG, testée sous Node : galaxie/tests/jarvis-test.mjs) ═════════════
   Anneaux et échelles graduées autour de l'entité : pur dessin vectoriel, animé par CSS (rotations seulement), sans donnée.
   Couleur = var(--jv) (suit l'état de Raylé). Utilisable dans la page (window.JarvisSvg) et sous Node (module.exports). */
(function(racine){
  "use strict";
  const f=x=>+x.toFixed(2);
  const pt=(r,a)=>[f(r*Math.sin(a*Math.PI/180)),f(-r*Math.cos(a*Math.PI/180))];
  /* n graduations entre les rayons r0 (intérieur) et r1 (extérieur) ; une sur `chaque` est plus longue (de `plus`) */
  function graduations(n,r0,r1,chaque,plus){
    const l=[];
    for(let i=0;i<n;i++){
      const a=i*360/n, long=i%chaque===0, [x0,y0]=pt(long?r0-plus:r0,a), [x1,y1]=pt(r1,a);
      l.push(`<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}"${long?' class="l"':''}/>`);
    }
    return l.join('');
  }
  /* cercle dont le contour est découpé en arcs : motif « trait vide trait vide… » en degrés, départ en haut */
  const arcs=(r,motif,cls)=>`<circle class="${cls}" r="${r}" pathLength="360" stroke-dasharray="${motif}" transform="rotate(-90)"/>`;
  function repere(a,r){ const [x,y]=pt(r,a); return `<text x="${x}" y="${y}" transform="rotate(${a} ${x} ${y})">${String(a).padStart(3,'0')}</text>`; }

  function anneaux(){
    return `<svg class="jv-svg" viewBox="-100 -100 200 200" focusable="false" aria-hidden="true">
<g class="jv-a"><circle r="97.5" class="fin"/>${graduations(120,93.5,97.5,5,2.5)}<g class="num">${[0,90,180,270].map(a=>repere(a,86)).join('')}</g></g>
<g class="jv-b">${arcs(88,'60 12 24 8 90 10 44 14 70 28','epais')}</g>
<g class="jv-c"><circle r="79" class="fin pointille"/>${arcs(79,'20 70 20 70 20 70 20 70','epais fin2')}</g>
<g class="jv-d">${arcs(70,'110 70 40 140','epais')}${graduations(36,64,67,3,2)}</g>
<g class="jv-e"><circle r="58" class="fin pointille2"/></g>
<g class="jv-fixe"><path d="M0 -100 l-2.6 -5 h5.2 z M100 0 l5 -2.6 v5.2 z M0 100 l-2.6 5 h5.2 z M-100 0 l-5 -2.6 v5.2 z" class="rempli"/></g>
</svg>`;
  }
  const api={anneaux,graduations,arcs};
  if(typeof module!=='undefined'&&module.exports) module.exports=api; else racine.JarvisSvg=api;
})(typeof window!=='undefined'?window:globalThis);
