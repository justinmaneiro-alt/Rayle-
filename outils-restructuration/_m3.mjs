import fs from 'node:fs';
const nl = s => s.split(String.fromCharCode(13)).join('');
let t = nl(fs.readFileSync('core/commun/miniatures.js', 'utf8'));
const i0 = t.indexOf('  /* ───── anatomie : squelette ───── */'), i1 = t.indexOf('  /* ───── terre :');
if (i0 < 0 || i1 < 0) throw new Error('bornes');
const nouveau = `  /* ───── anatomie : le squelette COMPLET de la grande fenêtre (os-1 + os-2), même matériau or chaud (anatomie-or.js), éclairage à trois points, contours ───── */
  async function creerAnatomie(m){
    await moteur(); const T=THREE, base=u=>new URL(u,document.baseURI).href;
    const OR=await import(base('planetes/saturne/pc/anatomie-or.js'));
    m.scene=new T.Scene(); m.camera=new T.PerspectiveCamera(30,W/H,0.1,100); m.camera.position.set(0,0.05,5.4);
    OR.eclairageTroisPoints(m.scene,T);
    const pivot=new T.Group(); m.scene.add(pivot); m.pivot=pivot;
    try{
      const [{GLTFLoader},{MeshoptDecoder}]=await Promise.all([import('three/addons/loaders/GLTFLoader.js'),import('three/addons/libs/meshopt_decoder.module.js')]);
      const L=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder), parties=await Promise.all(['os-1','os-2'].map(f=>L.loadAsync(base('assets-lourds/anatomie/'+f+'.glb'))));
      const corps=new T.Group(); for(const g of parties) corps.add(g.scene);
      OR.teinterOr(corps,T);
      const boite=new T.Box3().setFromObject(corps), taille=boite.getSize(new T.Vector3()), centre=boite.getCenter(new T.Vector3());
      const s=3.6/Math.max(taille.y,0.001); corps.scale.setScalar(s); corps.position.sub(centre.multiplyScalar(s)); pivot.add(corps);
      m.nbOs=OR.contours(corps,T);
    }catch(e){ m.erreur='squelette indisponible : '+String((e&&e.message)||e).slice(0,50); }
    return { tic(now,dt){ pivot.rotation.y+=dt*0.45; peindre3D(m); }, intervalle:50, statique:true };
  }

`;
t = t.slice(0, i0) + nouveau + t.slice(i1);
fs.writeFileSync('core/commun/miniatures.js', t);
// grande fenêtre : même matériau or pour le système « os »
let v = nl(fs.readFileSync('planetes/saturne/pc/anatomie-vue.js', 'utf8'));
const a = "racine.add(g); ajouterMeshs(g); appliquerEtat(); })();";
if (!v.includes(a)) throw new Error('anatomie-vue');
v = v.replace(a, "if (sys === 'os') { try { const OR = await import('./anatomie-or.js'); OR.teinterOr(g, THREE); } catch (e) { /* teinte facultative */ } } racine.add(g); ajouterMeshs(g); appliquerEtat(); })();");
v = v.replace("COULEUR_SEL = new THREE.Color(0x6fe6ff)", "COULEUR_SEL = new THREE.Color(0xff7a1a)");
fs.writeFileSync('planetes/saturne/pc/anatomie-vue.js', v);
console.log('ok');
