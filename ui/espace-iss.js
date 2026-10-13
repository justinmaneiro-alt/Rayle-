"use strict";
/* ═════════════ ISS : modèle procédural articulé (RayleUI.espaceISS) ═════════════
   Repère de la station (mètres) : +z = sens du déplacement, +y = zénith (vers le haut), +x = le long du treillis (perpendiculaire au plan orbital).
   Le treillis est donc perpendiculaire à la vitesse, comme sur la vraie station en attitude LVLH.

   Articulations réelles reproduites :
   - SARJ (cardan « alpha ») : chaque côté du treillis extérieur tourne autour de l'axe du treillis (x) d'un tour par orbite ;
   - BGA (cardan « beta ») : chaque paire d'ailes tourne autour de son propre mât pour présenter ses cellules au Soleil ;
   - TRRJ : les radiateurs tournent autour de l'axe du treillis pour rester EN BORD vers le Soleil (ils n'en reçoivent que la tranche).
   `angles(s, prec)` calcule tout cela depuis la direction du Soleil dans le repère de la station (fonction pure, testée dans tests/espace-iss-test.mjs).

   Modules, en partant de l'arrière (z < 0) : Zvezda, Zarya, Unity (Tranquility à bâbord avec la Cupola, Quest à tribord), Destiny, Harmony (Columbus à tribord, Kibo à bâbord),
   PMA avec Crew Dragon ; Soyouz sous Zarya (Rassvet), Progress à l'arrière de Zvezda ; Canadarm2 sur le treillis. Dimensions d'après les fiches NASA (docs/espace-sources.md).
   Niveau de détail : 0 = complet, 1 = tablette (moins de segments, pas de texture de bosses ni de treillis détaillé). */
(function(){
  const G=typeof window!=='undefined'?window:globalThis;
  const UI=G.RayleUI=G.RayleUI||{};
  const TAU=Math.PI*2;
  const norme=a=>{ a=((a%TAU)+TAU)%TAU; return a>Math.PI?a-TAU:a; };
  const ecart=(a,b)=>Math.abs(norme(a-b));

  /** direction du Soleil s (unitaire, repère station) → angles des articulations, en choisissant la solution la plus proche de la précédente.
   *  alpha : SARJ (rotation autour de x, 0 = mât vers le zénith) · beta : BGA (rotation autour du mât, 0 = cellules vers +x) · radiateurs : TRRJ (idem alpha, 0 = vers le zénith) */
  function angles(s,prec){
    prec=prec||{alpha:0,beta:0,rad:0};
    const q=Math.hypot(s[1],s[2]);
    if(q<1e-4) return {alpha:prec.alpha,beta:prec.beta,rad:prec.rad,degenere:true};     // Soleil dans l'axe du treillis : rien à suivre
    const a1=Math.atan2(s[1],-s[2]), a2=a1+Math.PI;                                    // mât u = (0, cos α, sin α) perpendiculaire au Soleil, au signe près
    const pas=ecart(a1,prec.alpha)<=ecart(a2,prec.alpha);
    const alpha=pas?a1:a2, signe=pas?1:-1;
    const beta=Math.atan2(signe*q,s[0]);
    const r1=Math.atan2(s[2],s[1]), r2=r1+Math.PI, rad=ecart(r1,prec.rad)<=ecart(r2,prec.rad)?r1:r2;
    return {alpha,beta,rad,degenere:false};
  }
  /** vecteurs de contrôle (repère station) pour des angles donnés : mât, normale des cellules, grand axe des radiateurs */
  function vecteurs(a){
    const ca=Math.cos(a.alpha), sa=Math.sin(a.alpha), cb=Math.cos(a.beta), sb=Math.sin(a.beta);
    const mat=[0,ca,sa], w=[0,sa,-ca];
    return {mat,normale:[cb,sb*w[1],sb*w[2]],radiateur:[0,Math.cos(a.rad),Math.sin(a.rad)]};
  }

  function construire(THREE,opts){
    opts=opts||{}; const niveau=opts.niveau>=1?1:0, seg=niveau?10:20;
    const g=new THREE.Group(), mats=[], geos=[], textures=[];
    const mat=(c,o)=>{ const m=new THREE.MeshStandardMaterial(Object.assign({color:c,roughness:.5,metalness:.4},o||{})); mats.push(m); return m; };
    const geo=x=>{ geos.push(x); return x; };
    const tex=cv=>{ const t=new THREE.CanvasTexture(cv); t.anisotropy=4; textures.push(t); return t; };
    const ouvrir=(w,h)=>{ const cv=document.createElement('canvas'); cv.width=w; cv.height=h; return cv; };

    // feuilles thermiques dorées (MLI) : léger froissement en bosses (niveau 0 seulement)
    let bosses=null;
    if(!niveau){
      const cv=ouvrir(128,128), cx=cv.getContext('2d'), im=cx.createImageData(128,128); let r=12345;
      const alea=()=>{ r=(r*1664525+1013904223)>>>0; return r/4294967296; };
      const bruit=new Float32Array(128*128); for(let i=0;i<bruit.length;i++) bruit[i]=alea();
      for(let y=0;y<128;y++) for(let x=0;x<128;x++){ const v=(bruit[y*128+x]*.5+bruit[((y+1)%128)*128+x]*.25+bruit[y*128+(x+1)%128]*.25)*255; const o=(y*128+x)*4; im.data[o]=im.data[o+1]=im.data[o+2]=v; im.data[o+3]=255; }
      cx.putImageData(im,0,0); bosses=tex(cv); bosses.wrapS=bosses.wrapT=THREE.RepeatWrapping;
    }
    const or=mat(0xd3a53f,{metalness:.85,roughness:.34,bumpMap:bosses||null,bumpScale:.6});
    const blanc=mat(0xe6e6e0,{roughness:.55,metalness:.22});
    const alu=mat(0xb9bdc5,{roughness:.42,metalness:.75});
    const sombre=mat(0x2a2c31,{roughness:.7,metalness:.3});
    const noir=mat(0x111317,{roughness:.8,metalness:.2});
    const rouge=mat(0xb23a2e,{roughness:.6,metalness:.3});

    // cellules solaires : bleu nuit à grille argentée (face avant, vers le Soleil) et dos gris (face arrière)
    const cv1=ouvrir(64,256), c1=cv1.getContext('2d');
    c1.fillStyle='#12204f'; c1.fillRect(0,0,64,256);
    for(let j=0;j<64;j++) for(let i=0;i<16;i++){ c1.fillStyle=((i+j)&1)?'#16286a':'#101c46'; c1.fillRect(i*4+.5,j*4+.5,3,3); }
    c1.strokeStyle='rgba(176,196,235,.55)'; c1.lineWidth=1; for(let i=0;i<=16;i++){ c1.beginPath(); c1.moveTo(i*4,0); c1.lineTo(i*4,256); c1.stroke(); } for(let j=0;j<=64;j++){ c1.beginPath(); c1.moveTo(0,j*4); c1.lineTo(64,j*4); c1.stroke(); }
    c1.strokeStyle='rgba(212,170,70,.8)'; c1.lineWidth=2; c1.strokeRect(1,1,62,254);
    const cv2=ouvrir(32,128), c2=cv2.getContext('2d'); c2.fillStyle='#8e949c'; c2.fillRect(0,0,32,128); c2.strokeStyle='rgba(60,64,70,.7)'; for(let j=0;j<=16;j++){ c2.beginPath(); c2.moveTo(0,j*8); c2.lineTo(32,j*8); c2.stroke(); } c2.strokeRect(.5,.5,31,127);
    const t1=tex(cv1), t2=tex(cv2);
    const cellules=mat(0xffffff,{map:t1,metalness:.7,roughness:.2,emissive:0x050b22,emissiveIntensity:.8,envMapIntensity:1});
    const dos=mat(0xffffff,{map:t2,metalness:.3,roughness:.6});
    const russe=mat(0xffffff,{map:t1,metalness:.65,roughness:.25,side:THREE.DoubleSide,emissive:0x050b22,emissiveIntensity:.8});

    // radiateurs : panneaux blancs nervurés
    const cv3=ouvrir(64,128), c3=cv3.getContext('2d'); c3.fillStyle='#ecece8'; c3.fillRect(0,0,64,128); c3.strokeStyle='rgba(120,124,130,.55)'; for(let j=0;j<=16;j++){ c3.beginPath(); c3.moveTo(0,j*8); c3.lineTo(64,j*8); c3.stroke(); } for(let i=0;i<=4;i++){ c3.beginPath(); c3.moveTo(i*16,0); c3.lineTo(i*16,128); c3.stroke(); }
    const radMat=mat(0xffffff,{map:tex(cv3),roughness:.55,metalness:.15,side:THREE.DoubleSide});

    const boite=(w,h,d,m,x,y,z,p)=>{ const o=new THREE.Mesh(geo(new THREE.BoxGeometry(w,h,d)),m); o.position.set(x,y,z); (p||g).add(o); return o; };
    // cylindre d'axe x, y ou z
    const cyl=(r,l,m,x,y,z,axe,p,r2)=>{ const o=new THREE.Mesh(geo(new THREE.CylinderGeometry(r2==null?r:r2,r,l,seg)),m); o.position.set(x,y,z); if(axe==='x') o.rotation.z=Math.PI/2; else if(axe==='z') o.rotation.x=Math.PI/2; (p||g).add(o); return o; };
    const sph=(r,m,x,y,z,p)=>{ const o=new THREE.Mesh(geo(new THREE.SphereGeometry(r,seg,Math.max(6,seg/2))),m); o.position.set(x,y,z); (p||g).add(o); return o; };

    // cylindre entre deux points (perches, mâts)
    const entre=(a,b,r,m,p)=>{ const A=new THREE.Vector3(...a), B=new THREE.Vector3(...b), d=B.clone().sub(A), o=new THREE.Mesh(geo(new THREE.CylinderGeometry(r,r,d.length(),8)),m);
      o.position.copy(A).addScaledVector(d,.5); o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize()); (p||g).add(o); return o; };

    /* ───── treillis intégré (axe x), au-dessus de Destiny ───── */
    const TY=4.9, TZ=4.2, DEMI=47, X_SARJ=17, X_BGA=[31,47];                   // treillis de 94 m (NASA) ; envergure des ailes ≈ 105 m (109 m annoncés)
    const truss=new THREE.Group(); truss.position.set(0,TY,TZ); g.add(truss);
    for(const sy of [-1,1]) for(const sz of [-1,1]) boite(2*DEMI,.22,.22,alu,0,sy*1.55,sz*1.55,truss);          // quatre longerons
    const pas=niveau?9:4.5, nTr=Math.floor(DEMI/pas);
    if(niveau){
      for(let i=-nTr;i<=nTr;i++) boite(.2,3.3,3.3,alu,i*pas,0,0,truss);
    }else{
      const cadre=new THREE.InstancedMesh(geo(new THREE.BoxGeometry(1,1,1)),alu,(2*nTr+1)*8), M=new THREE.Matrix4(), Q=new THREE.Quaternion(), S=new THREE.Vector3(), P=new THREE.Vector3(), E=new THREE.Euler(); let k=0;
      for(let i=-nTr;i<=nTr;i++){
        const x=i*pas;
        for(const [py,pz,sy,sz] of [[1.55,0,.14,3.1],[-1.55,0,.14,3.1],[0,1.55,3.1,.14],[0,-1.55,3.1,.14]]){ M.compose(P.set(x,py,pz),Q.identity(),S.set(.14,sy,sz)); cadre.setMatrixAt(k++,M); }
        if(i===nTr) continue;
        const ang=Math.atan2(3.1,pas)*(i&1?1:-1), L=Math.hypot(pas,3.1);                                    // diagonales en alternance, sur les quatre faces
        for(const pz of [1.55,-1.55]){ Q.setFromEuler(E.set(0,0,ang)); M.compose(P.set(x+pas/2,0,pz),Q,S.set(L,.1,.1)); cadre.setMatrixAt(k++,M); }
        for(const py of [1.55,-1.55]){ Q.setFromEuler(E.set(0,-ang,0)); M.compose(P.set(x+pas/2,py,0),Q,S.set(L,.1,.1)); cadre.setMatrixAt(k++,M); }
      }
      cadre.count=k; cadre.instanceMatrix.needsUpdate=true; truss.add(cadre);
    }
    boite(8,4.2,4.2,blanc,0,0,0,truss);                                                                      // S0 (segment central)
    boite(2.4,1.6,2.4,alu,0,-3.1,0,truss);                                                                   // fixation sur Destiny

    /* ───── côtés tribord (+1) et bâbord (−1) ───── */
    const ailes=[], sarj=[], radiateurs=[];
    for(const s of [-1,1]){
      cyl(2.4,2.8,alu,s*X_SARJ,TY,TZ,'x');                                                                   // anneau du SARJ
      boite(5.2,3.6,3.6,blanc,s*10.5,TY,TZ);                                                                 // S1 / P1
      // tout ce qui est au-delà du SARJ tourne avec lui (alpha)
      const ext=new THREE.Group(); ext.position.set(s*X_SARJ,TY,TZ); g.add(ext); sarj.push(ext);
      // radiateur de S1 / P1 (TRRJ) : tourne autour de x pour rester en bord vers le Soleil
      const rad=new THREE.Group(); rad.position.set(s*10.5,TY,TZ); g.add(rad); radiateurs.push(rad);
      const rp=new THREE.Mesh(geo(new THREE.BoxGeometry(11.6,22.9,.18)),radMat); rp.position.set(0,13.6,0); rad.add(rp);
      cyl(.55,3.4,alu,0,2.4,0,'y',rad);
      // deux cardans bêta par côté (S4/S6 ou P4/P6), chacun portant deux ailes de 33,5 × 11,6 m
      for(const xp of X_BGA){
        const bga=new THREE.Group(); bga.position.set(s*(xp-X_SARJ),0,0); ext.add(bga);
        boite(2.6,2.2,2.6,or,0,0,0,bga);                                                                     // boîtier du cardan
        const mat1=new THREE.Group(); bga.add(mat1);                                                         // mât : tourne autour de y local (bêta)
        cyl(.45,3.4,alu,0,0,0,'y',mat1);
        for(const sg of [-1,1]){
          const w=new THREE.Mesh(geo(new THREE.BoxGeometry(.07,33.5,11.6)),[cellules,dos,alu,alu,alu,alu]);  // +x : cellules (vers le Soleil), −x : dos gris
          w.position.set(0,sg*18.6,0); mat1.add(w);
          boite(.5,.5,11.8,alu,0,sg*35.5,0,mat1);                                                            // barre d'extrémité
          for(const z of [-5.9,5.9]) boite(.35,33.5,.35,alu,0,sg*18.6,z,mat1);                               // mâts latéraux de la couverture
        }
        ailes.push({sarj:ext,bga:mat1,cote:s});
      }
    }

    /* ───── modules pressurisés (axe z) ───── */
    cyl(2.1,13,blanc,0,0,-24.5,'z'); cyl(2.9,1.6,alu,0,0,-17.6,'z',undefined,2.1);                           // Zvezda (+ cône de transfert)
    cyl(2.05,12.6,or,0,0,-11.8,'z');                                                                         // Zarya
    cyl(2.3,5.5,blanc,0,0,-2.75,'z');                                                                        // Unity
    cyl(2.2,8.5,blanc,0,0,4.25,'z');                                                                         // Destiny
    cyl(2.2,7.2,blanc,0,0,12.1,'z');                                                                         // Harmony
    cyl(1.4,2.4,alu,0,0,16.9,'z');                                                                           // PMA-2
    cyl(2.2,5,blanc,-4.8,0,-2.75,'x');                                                                       // Tranquility (bâbord de Unity)
    cyl(1.5,1.2,alu,-4.8,-3.1,-2.75,'y'); { const d=sph(1.45,blanc,-4.8,-3.6,-2.75); d.scale.set(1,.55,1); } cyl(.95,.1,noir,-4.8,-4.1,-2.75,'y');   // Cupola
    cyl(1.8,4.5,blanc,4.55,0,-2.75,'x');                                                                     // Quest (sas, tribord)
    cyl(2.25,6.9,blanc,5.65,0,12.1,'x');                                                                     // Columbus (tribord de Harmony)
    cyl(2.2,11.2,blanc,-7.8,0,12.1,'x'); boite(5,2.4,4.6,alu,-16.2,-1,12.1);                                 // Kibo + plateforme exposée
    cyl(1.9,4.4,blanc,-5.2,3.9,12.1,'x');                                                                    // logistique pressurisée de Kibo
    cyl(1.15,3.4,blanc,0,-3.75,-11.8,'y');                                                                   // Rassvet (sous Zarya)
    // Soyouz amarré sous Rassvet (module orbital, descente, service + deux ailes)
    { const s=new THREE.Group(); s.position.set(0,-5.45,-11.8); g.add(s);
      sph(1.1,or,0,-1.1,0,s); cyl(1.0,2.2,or,0,-3.1,0,'y',s,1.35); cyl(1.2,2.7,or,0,-5.6,0,'y',s); cyl(.6,.6,alu,0,-7.2,0,'y',s);
      for(const sg of [-1,1]){ const p=new THREE.Mesh(geo(new THREE.BoxGeometry(5.4,.05,2.4)),russe); p.position.set(sg*3.9,-5.6,0); s.add(p); } }
    // Progress à l'arrière de Zvezda
    cyl(1.3,7.2,blanc,0,0,-34.6,'z'); for(const sg of [-1,1]){ const p=new THREE.Mesh(geo(new THREE.BoxGeometry(2.6,.05,5.4)),russe); p.position.set(sg*2.9,0,-34.6); g.add(p); }
    // Crew Dragon amarré à l'avant de Harmony (nez vers la station)
    { const d=new THREE.Group(); d.position.set(0,0,18.1); g.add(d);
      cyl(.7,2.2,blanc,0,0,1.1,'z',d,2.0); cyl(2.0,1.2,blanc,0,0,2.8,'z',d); cyl(2.0,3.9,noir,0,0,5.35,'z',d);
      for(const sg of [-1,1]){ const p=new THREE.Mesh(geo(new THREE.BoxGeometry(.06,.1,3.7)),russe); p.position.set(sg*2.03,0,5.35); d.add(p); } }
    // panneaux solaires russes (Zarya, Zvezda) : plats, orientés vers le zénith
    for(const sg of [-1,1]){
      const z1=new THREE.Mesh(geo(new THREE.BoxGeometry(10.5,.08,3.4)),russe); z1.position.set(sg*7.4,2.6,-11.8); g.add(z1);
      const z2=new THREE.Mesh(geo(new THREE.BoxGeometry(2.4,.08,24)),russe); z2.position.set(sg*4.4,2.9,-24.5); g.add(z2);
    }
    // Canadarm2 : base sur le treillis, deux perches articulées vers l'avant (pose de repos), préhenseur
    { const base=[3,TY+2.4,TZ+2.5], coude=[3,TY+7.4,TZ+9.4], main=[3,TY+4,TZ+17.1];
      boite(1.8,1.2,1.8,alu,base[0],base[1],base[2]);
      entre(base,coude,.22,blanc); sph(.45,noir,...coude); entre(coude,main,.22,blanc); sph(.4,noir,...main); sph(.35,noir,...base); }
    // antennes et petites pièces qui cassent la silhouette
    boite(3.6,.3,2.2,alu,-5,TY+2.3,TZ-3.6); entre([5,TY+2,TZ],[5,TY+5.4,TZ],.14,alu); cyl(1.1,.12,alu,5,TY+5.6,TZ,'y');
    g.userData.taille=109;

    /* ───── mise à jour : direction du Soleil dans le repère de la station ───── */
    const etat={alpha:0,beta:0,rad:0,init:false};
    function maj(s,dt){
      const a=angles(s,etat);
      if(a.degenere) return etat;
      const k=etat.init?Math.min(1,(dt||0)*1.5):1;
      etat.alpha+=norme(a.alpha-etat.alpha)*k; etat.beta+=norme(a.beta-etat.beta)*k; etat.rad+=norme(a.rad-etat.rad)*k; etat.init=true;
      for(const e of sarj) e.rotation.x=etat.alpha;
      for(const w of ailes) w.bga.rotation.y=etat.beta;
      for(const r of radiateurs) r.rotation.x=etat.rad;
      return etat;
    }
    function dispose(){ geos.forEach(x=>{ try{ x.dispose(); }catch(e){} }); mats.forEach(x=>{ try{ x.dispose(); }catch(e){} }); textures.forEach(x=>{ try{ x.dispose(); }catch(e){} }); }
    return {groupe:g,maj,dispose,etat,ailes,radiateurs,sarj,niveau};
  }
  UI.espaceISS={angles,vecteurs,construire,TAILLE:109};
})();
