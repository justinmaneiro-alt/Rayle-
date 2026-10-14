// Fusion de géométries avec attributs personnalisés (couleurs par sommet, type de pièce, mât, sommet de pivot…) : un seul maillage par navire pour la coque, un seul pour la voilure.
// const F = new Fusion(THREE, { aKind: 1, aPivot: 2 }); F.ajouter(geo, { matrice, couleur: 0xrrggbb|[r,g,b], donnees: { aKind: 2, aPivot: (i, x, y, z) => [x, z] } }); const geometrie = F.construire();
export class Fusion {
  constructor(THREE, attrs = {}) { this.T = THREE; this.attrs = attrs; this.pos = []; this.nor = []; this.col = []; this.uv = []; this.perso = {}; for (const k of Object.keys(attrs)) this.perso[k] = []; this.n = 0; }
  ajouter(geo, { matrice, couleur = 0xffffff, donnees = {} } = {}) {
    const T = this.T, g = geo.index ? geo.toNonIndexed() : geo, p = g.attributes.position, nrm = g.attributes.normal, uv = g.attributes.uv, m = matrice || new T.Matrix4(), mn = new T.Matrix3().getNormalMatrix(m);
    const c = Array.isArray(couleur) ? couleur : (() => { const x = new T.Color(couleur); return [x.r, x.g, x.b]; })(), v = new T.Vector3(), nn = new T.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m); this.pos.push(v.x, v.y, v.z);
      if (nrm) nn.fromBufferAttribute(nrm, i).applyMatrix3(mn).normalize(); else nn.set(0, 1, 0); this.nor.push(nn.x, nn.y, nn.z);
      const cc = typeof couleur === 'function' ? couleur(i, v.x, v.y, v.z) : c; this.col.push(cc[0], cc[1], cc[2]);
      this.uv.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
      for (const k of Object.keys(this.attrs)) { const d = donnees[k], val = typeof d === 'function' ? d(i, v.x, v.y, v.z, uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0) : d; const taille = this.attrs[k]; if (taille === 1) this.perso[k].push(val == null ? 0 : val); else for (let t = 0; t < taille; t++) this.perso[k].push(val == null ? 0 : val[t]); }
    }
    this.n += p.count;
  }
  construire() {
    const T = this.T, g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(this.pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(this.nor, 3)); g.setAttribute('color', new T.Float32BufferAttribute(this.col, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(this.uv, 2));
    for (const k of Object.keys(this.attrs)) g.setAttribute(k, new T.Float32BufferAttribute(this.perso[k], this.attrs[k]));
    g.computeBoundingSphere(); return g;
  }
}
