/* ═════════════ CORPS HAUTE FIDÉLITÉ : muscles, tendons, vaisseaux, organes, nerfs (BodyParts3D) ═════════════
   Tous les maillages viennent du MÊME corps (BodyParts3D, CC BY 4.0, voir scripts/convertir-corps-bp3d.mjs) : os, muscles, vaisseaux et organes se touchent donc comme dans le corps.
   Recalage par points d'attache : chaque sommet d'un tissu mou porte jusqu'à 4 ancres (les os les plus proches, poids en 1/d³ : attributs _SKI / _SKW). À l'exécution, chaque os affiché est
   recalé sur le squelette de l'application (ajustement.js, matrice du paquet `en.pack`) ; le sommet suit le mélange linéaire des transformations de ses ancres. Un sommet collé à un os (insertion
   d'un muscle) reçoit presque tout son poids de cet os : l'insertion reste sur l'os, où qu'il ait été recalé ; entre deux os (ventre musculaire), la transition est douce.
   Repli : sans le squelette BodyParts3D (fichier absent, hors ligne, scoliose, fracture vertébrale), ou sans le fichier de la couche, l'application garde ses formes procédurales.
   Une couche ne se charge que lorsqu'on l'affiche (chargement progressif) ; les couches « fines » (branches vasculaires) ne se chargent qu'en qualité Haute et Ultra. */
import { chargerCouche, lireManifeste } from './modeles-glb.js?v=2026.10.14.2';
import { MUSCLES_HD, TENDONS_HD, VAISSEAUX_HD, ORGANES_HD, NERFS_HD, REMPLACE, BLEUS, ROUGES } from './donnees-corps.js?v=2026.10.14.2';

const COULEURS_ORGANE = { oesophage: 0xd68a86, 'vesicule-biliaire': 0x6e9a3c, 'voies-biliaires': 0x8fb04a, 'surrenale-droite': 0xe0b25c, 'surrenale-gauche': 0xe0b25c, langue: 0xc4636b, 'larynx-cartilages': 0xcfe0e6, hypophyse: 0xe6c7b8, 'corps-calleux': 0xf2e8de, thalamus: 0xcfa3b3 };
const sidDeAncre = id => id.startsWith('main:') ? 'carpe:' + id.slice(5) : id.startsWith('pied:') ? 'talus:' + id.slice(5) : id;
const MEMBRE_REGION = { Bras: 'MS', 'Avant-bras': 'MS', Main: 'MS', Cuisse: 'MI', Jambe: 'MI', Pied: 'MI' };

/** Variation de teinte stable d'un identifiant (deux muscles voisins ne sont pas exactement de la même couleur) → nombre dans [−1, 1] */
export function hachage(id) { let h = 2166136261; for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 2001) / 1000 - 1; }

export class CorpsHD {
  constructor(moteur) {
    this.m = moteur; this.T = moteur.THREE;
    this.matrices = null;          // Map ancre → Matrix4 (BodyParts3D → application), null tant que le squelette n'est pas prêt
    this.disponible = false;       // squelette BodyParts3D complet chargé et recalé
    this.actif = false;            // disponible ET pas de scoliose / fracture vertébrale : les tissus mous haute fidélité remplacent les formes procédurales
    this.couches = {};             // nom → { etat: 'attente'|'chargement'|'pret'|'echec', entrees: [sid] }
    this.promesseMatrices = null;
  }

  /** Squelette BodyParts3D prêt ? Calcule une fois la matrice de chaque ancre (matrice du monde du paquet de l'os affiché) */
  matricesAncres(ids) {
    if (!this.promesseMatrices) this.promesseMatrices = (async () => {
      const m = this.m; m.assurer('squelette');
      await Promise.all(Array.from(m.entrees.values()).map(e => e.pret).filter(Boolean));
      const res = new Map(), manque = [];
      for (const id of ids) {
        const en = m.entrees.get(sidDeAncre(id));
        if (en && en.pack && /^bodyparts3d/.test(en.tableGLB || '')) { en.pack.updateWorldMatrix(true, false); res.set(id, en.pack.matrixWorld.clone()); }
        else if (id !== 'sternum') manque.push(id);                 // le sternum de BodyParts3D est incomplet : son os affiché est celui du squelette CC0, sans ancre
      }
      if (manque.length) { console.warn('[anatomie] corps haute fidélité : os BodyParts3D absents (' + manque.slice(0, 6).join(', ') + (manque.length > 6 ? '…' : '') + ') → formes procédurales conservées'); return null; }
      return res;
    })();
    return this.promesseMatrices;
  }
  /** Les os affichés peuvent être reconstruits (pathologie) : on recalcule les matrices au prochain besoin */
  invalider() { this.promesseMatrices = null; this.matrices = null; this.disponible = false; }

  /** Applique la peau à une géométrie : positions ← Σ poids · M(ancre) · position ; normales recalculées ; attributs _SKI/_SKW retirés */
  peau(geo, ancres, mats, moyenne) {
    const p = geo.attributes.position, I = geo.attributes._ski, W = geo.attributes._skw; if (!p || !I || !W) return;
    const el = ancres.map(id => { const M = mats.get(id); return M ? M.elements : null; }), n = p.count, out = new Float32Array(n * 3), me = moyenne.elements;
    for (let i = 0; i < n; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i); let ox = 0, oy = 0, oz = 0, sw = 0;
      for (let k = 0; k < 4; k++) {
        const w = k === 0 ? W.getX(i) : k === 1 ? W.getY(i) : k === 2 ? W.getZ(i) : W.getW(i); if (w <= 0) continue;
        const e = el[k === 0 ? I.getX(i) : k === 1 ? I.getY(i) : k === 2 ? I.getZ(i) : I.getW(i)]; if (!e) continue;
        ox += w * (e[0] * x + e[4] * y + e[8] * z + e[12]); oy += w * (e[1] * x + e[5] * y + e[9] * z + e[13]); oz += w * (e[2] * x + e[6] * y + e[10] * z + e[14]); sw += w;
      }
      if (sw < 1e-6) { ox = me[0] * x + me[4] * y + me[8] * z + me[12]; oy = me[1] * x + me[5] * y + me[9] * z + me[13]; oz = me[2] * x + me[6] * y + me[10] * z + me[14]; sw = 1; }
      out[3 * i] = ox / sw; out[3 * i + 1] = oy / sw; out[3 * i + 2] = oz / sw;
    }
    geo.setAttribute('position', new this.T.BufferAttribute(out, 3));
    geo.deleteAttribute('_ski'); geo.deleteAttribute('_skw');
    if (geo.attributes._fibre && !geo.attributes.aFibre) { geo.setAttribute('aFibre', geo.attributes._fibre); geo.deleteAttribute('_fibre'); }
    geo.computeVertexNormals(); geo.computeBoundingBox(); geo.computeBoundingSphere();
  }
  moyenne(mats) {
    const T = this.T, s = new Array(16).fill(0); let n = 0;
    for (const M of mats.values()) { for (let i = 0; i < 16; i++) s[i] += M.elements[i]; n++; }
    return new T.Matrix4().fromArray(s.map(v => v / Math.max(n, 1)));
  }

  /** Charge un fichier de couche, recale ses sommets, renvoie les nœuds { nom, geo } ou null */
  async preparer(fichier) {
    if (!(await lireManifeste())) return null;          // pas de manifeste (hors ligne, tests) : formes schématiques, sans bruit
    const c = await chargerCouche(fichier); if (!c) return null;
    const mats = this.matrices || await this.matricesAncres(c.ancres);
    if (!mats) return null;
    if (!this.matrices) { this.matrices = mats; this.moy = this.moyenne(mats); this.disponible = true; }
    const noeuds = [];
    c.scene.traverse(o => { if (o.isMesh) noeuds.push(o); });
    const res = [];
    for (const o of noeuds) { const geo = o.geometry.clone(); this.peau(geo, c.ancres, mats, this.moy); res.push({ nom: o.name, geo }); }
    return res;
  }

  /** « id__K__i » → { id, k: 'G' | 'D' | 'M' } */
  static analyser(nom) { const p = nom.split('__'); return { id: p[0], k: p[1], i: +p[2] || 0 }; }

  /** Muscles et tendons : entrées nouvelles pour les structures sans forme procédurale, remplacement de la géométrie pour les autres */
  async muscles() {
    if (this.couches.muscles) return; this.couches.muscles = { etat: 'chargement', entrees: [] };
    try {
      const [mu, te] = await Promise.all([this.preparer('muscles-bp3d.glb'), this.preparer('tendons-bp3d.glb')]);
      if (this.m.mort) return;
      if (!mu) { this.couches.muscles.etat = 'echec'; return; }
      this.integrer(mu, MUSCLES_HD, 'muscle', 'muscle');
      if (te) this.integrer(te, TENDONS_HD, 'tendon', 'ligament');
      this.couches.muscles.etat = 'pret';
      for (const [ancien, nouveaux] of Object.entries(REMPLACE)) for (const c of ['D', 'G']) { const en = this.m.entrees.get(ancien + ':' + c); if (en && nouveaux.some(b => this.m.entrees.has(b + ':' + c))) en.remplace = true; }
      this.majActif(); this.m.appliquerCoupesSiBesoin(); this.m.synchroniser(this.m.store.obtenir(), null);
    } catch (e) { this.couches.muscles.etat = 'echec'; console.warn('[anatomie] muscles haute fidélité : ' + (e && e.message || e)); }
  }

  /** Crée (ou complète) les entrées du moteur pour les nœuds d'un fichier */
  integrer(noeuds, rangees, type, profil, couche) {
    const T = this.T, m = this.m, par = new Map();
    for (const n of noeuds) { const a = CorpsHD.analyser(n.nom); const cle = a.id + '__' + a.k; if (!par.has(cle)) par.set(cle, []); par.get(cle).push({ a, geo: n.geo }); }
    const def = new Map(rangees.map(r => [r[0], r]));
    for (const [cle, liste] of par) {
      const [id, k] = cle.split('__'), r = def.get(id); if (!r) continue;
      liste.sort((x, y) => x.a.i - y.a.i);
      const sid = k === 'M' ? id : id + ':' + k, cote = k === 'M' ? null : k;
      const groupe = new T.Group(); groupe.name = sid;
      let en = m.entrees.get(sid);
      const procedural = en && en.type === type && !en.hd;
      const mat = procedural ? en.mats[0] : this.materiau(profil, id, r);
      const nomCouche = couche || 'muscles';
      liste.forEach(({ geo }) => { const mesh = new T.Mesh(geo, mat); mesh.castShadow = mesh.receiveShadow = m.niveau !== 'eco'; groupe.add(mesh); });
      if (procedural) {                                                    // même identifiant que la forme schématique : la haute fidélité la remplace (la forme reste le repli)
        groupe.userData.sid = sid; groupe.traverse(o => { o.userData.sid = sid; });
        en.geoProc = en.obj.geometry; en.hdGroupe = groupe; en.obj.add(groupe); en.hd = true;
      } else {
        const membre = (type === 'artere' || type === 'veine' ? r[6] : r[5]) !== undefined ? (type === 'artere' || type === 'veine' ? r[6] : r[5]) : (MEMBRE_REGION[r[3]] || null);
        en = m.enregistrer(sid, type, groupe, [mat], membre, cote); en.hd = true; en.hdSeul = true; en.hdGroupe = groupe;
      }
      this.couches[nomCouche] && this.couches[nomCouche].entrees.push(sid);
    }
  }
  materiau(profil, id, r) {
    const m = this.m, T = this.T;
    if (profil === 'ligament') return m.mat('ligament', 0xe9e3d2, { roughness: .45 });
    if (profil === 'artere' || profil === 'veine') {
      const bleu = profil === 'veine' ? !ROUGES.includes(id) : BLEUS.includes(id), c = new T.Color(bleu ? 0x3f6fcf : 0xc0392b), h = hachage(id);
      c.offsetHSL(h * .008, h * .04, h * .03);
      return m.mat('organe', c.getHex(), { roughness: .38, emissive: bleu ? 0x0a1a40 : 0x400a08, emissiveIntensity: .25 });
    }
    if (profil === 'nerf') return m.mat('nerf', 0xffd24d, { emissive: 0xffd24d, emissiveIntensity: .35, roughness: .4 });
    if (profil === 'organe') return m.mat('organe', COULEURS_ORGANE[id] || 0xd9a6a6, { roughness: .45 });
    const c = new T.Color(0xb23a3a), h = hachage(id); c.offsetHSL(h * .012, h * .05, h * .04);
    return m.mat('muscle', c.getHex(), { roughness: .55 });
  }

  /** Vaisseaux : réseau principal (étiquetable) puis, en qualité Haute et Ultra, branches fines fusionnées (sans étiquette individuelle) */
  async vaisseaux(type) {
    const nom = type === 'artere' ? 'arteres' : 'veines'; if (this.couches[nom]) return; this.couches[nom] = { etat: 'chargement', entrees: [] };
    try {
      const principal = await this.preparer(nom + '-bp3d.glb');
      if (this.m.mort) return;
      if (!principal) { this.couches[nom].etat = 'echec'; return; }
      this.integrer(principal, VAISSEAUX_HD.filter(r => r[5] === type), type, type, nom);
      this.couches[nom].etat = 'pret'; this.majActif(); this.m.appliquerCoupesSiBesoin(); this.m.synchroniser(this.m.store.obtenir(), null);
      if (['haute', 'ultra'].includes(this.m.niveau)) {
        const fin = await this.preparer(nom + '-fin-bp3d.glb');
        if (fin && !this.m.mort) { this.integrer(fin, VAISSEAUX_HD.filter(r => r[5] === type), type, type, nom); this.m.appliquerCoupesSiBesoin(); this.m.synchroniser(this.m.store.obtenir(), null); }
      }
    } catch (e) { this.couches[nom].etat = 'echec'; console.warn('[anatomie] ' + nom + ' haute fidélité : ' + (e && e.message || e)); }
  }
  /** Organes : le modèle remplace la forme schématique du même identifiant ; les organes sans forme schématique sont ajoutés */
  async organes() {
    if (this.couches.organes) return; this.couches.organes = { etat: 'chargement', entrees: [] };
    try {
      const o = await this.preparer('organes-bp3d.glb');
      if (this.m.mort) return;
      if (!o) { this.couches.organes.etat = 'echec'; return; }
      this.integrer(o, ORGANES_HD, 'organe', 'organe', 'organes');
      this.couches.organes.etat = 'pret'; this.majActif(); this.m.synchroniser(this.m.store.obtenir(), null);
    } catch (e) { this.couches.organes.etat = 'echec'; console.warn('[anatomie] organes haute fidélité : ' + (e && e.message || e)); }
  }
  /** Nerfs : BodyParts3D n'a que les nerfs de l'orbite ; les nerfs périphériques sont des tracés reconstitués (scripts/traces-nerfs.mjs) posés sur les os, muscles et artères du modèle */
  async nerfs() {
    if (this.couches.nerfs) return; this.couches.nerfs = { etat: 'chargement', entrees: [] };
    try {
      const n = await this.preparer('nerfs-bp3d.glb');
      if (this.m.mort) return;
      if (!n) { this.couches.nerfs.etat = 'echec'; return; }
      this.integrer(n, NERFS_HD, 'nerf', 'nerf', 'nerfs');
      this.couches.nerfs.etat = 'pret'; this.majActif(); this.m.appliquerCoupesSiBesoin(); this.m.synchroniser(this.m.store.obtenir(), null);
    } catch (e) { this.couches.nerfs.etat = 'echec'; console.warn('[anatomie] nerfs haute fidélité : ' + (e && e.message || e)); }
  }

  /** Active ou désactive la haute fidélité selon l'état (pathologies qui déforment le squelette) */
  majActif() {
    const m = this.m, oui = this.disponible && m.rachisGLBPossible();
    this.actif = oui;
    for (const en of m.entrees.values()) {
      if (en.hdGroupe && !en.hdSeul) { en.hdGroupe.visible = oui; en.obj.geometry = oui ? (this.vide || (this.vide = new this.T.BufferGeometry())) : en.geoProc; }
    }
  }
}
