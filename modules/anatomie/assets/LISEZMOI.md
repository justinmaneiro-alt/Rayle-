# Modèles 3D anatomiques

## Couches haute fidélité (BodyParts3D)
`cerveau-bp3d.glb` (cerveau détaillé, fenêtre Cerveau, voir `docs/anatomie-presentations-cerveau.md`), puis `os-axial-bp3d.glb`, `os-detail-bp3d.glb` (os) puis `muscles-bp3d.glb`, `tendons-bp3d.glb`, `arteres-bp3d.glb`, `veines-bp3d.glb`, `arteres-fin-bp3d.glb`, `veines-fin-bp3d.glb`, `organes-bp3d.glb`, `nerfs-bp3d.glb` viennent **du même corps** et sont produits par `node scripts/convertir-corps-bp3d.mjs` puis `scripts/compresser-glb.mjs` (voir `docs/anatomie-haute-fidelite.md`). Les os sont déclarés dans `manifest.json` (`_atlas`, dans l'ordre de priorité) ; les couches de tissus mous sont chargées par `js/anatomie/corps-hd.js` quand on affiche le calque correspondant. Chaque fichier a un repli : sans lui, l'application garde ses formes procédurales.
Nœuds des tissus mous : `<identifiant>__<G|D|M>__<n>` (G / D : côté du patient, M : médian, n : tête ou partie). Attributs : `_FIBRE` (fibres des muscles), `_SKI` / `_SKW` (4 ancres osseuses et leurs poids), `asset.extras.ancres` (liste des ancres).
Pour ajouter une structure : une ligne dans `js/anatomie/donnees-corps.js` (ou `donnees-vaisseaux.js`, `donnees-organes-hd.js`), une fiche dans `js/anatomie/fiches-*.js`, puis relancer la conversion.


**Installé** : `squelette-cc0.glb` (squelette humain complet, CC0, voir `CREDITS.md`), déclaré dans le manifeste par l'entrée `_atlas`. La table `js/anatomie/correspondance-squelette.js` dit quel nœud du fichier habille quel os.
Pour **remplacer le squelette par un autre** : donnez à vos nœuds les mêmes noms que ceux du GLB actuel (liste dans la table), ou ajoutez une table dans `correspondance-squelette.js` et pointez `"table"` dessus ; sinon utilisez les entrées individuelles ci-dessous (qui ont priorité sur l'atlas).

## Entrées individuelles (optionnelles)


Déposez ici des fichiers `.glb` et un `manifest.json`. Sans manifeste, ou si un fichier manque, est invalide, ou a des dimensions incohérentes, Raylé garde
automatiquement la forme procédurale de la structure (un message d'avertissement est écrit dans la console du navigateur, et l'onglet « Affichage » le signale).

## Manifeste

```json
{
  "crane": { "fichier": "crane.glb", "licence": "CC0-1.0", "auteur": "…", "source": "https://…" },
  "humerus": "humerus.glb",
  "bassin": { "fichier": "bassin.glb", "echelle": 0.001, "decalage": [0, 0.98, 0], "rotation": [-90, 0, 0] }
}
```

- Les clés sont les identifiants de base de `js/anatomie/registre.js` (`crane`, `humerus`, `femur`, `bassin`, `sternum`, `biceps-brachial`, `foie`…).
- `echelle` (nombre ou `[x, y, z]`), `decalage` (mètres) et `rotation` (degrés) servent à recaler un modèle exporté dans un autre repère (beaucoup de modèles sont en millimètres, `echelle: 0.001`).
- Repère de l'application : mètres, y vers le haut, face vers +z, pieds à y = 0, **structures du côté gauche** (x > 0) ; le côté droit est le miroir.
- Les matériaux du fichier sont remplacés par ceux de Raylé. Le rachis (vertèbres, côtes, disques, moelle) et les os fracturés restent procéduraux : ils se déforment en direct.
- Les fichiers sont mis en cache par le navigateur (Cache API `rayle-anatomie-glb-v1`). Si vous **remplacez** un fichier sans changer son nom, renommez-le ou videz le cache
  (console : `(await import('./js/anatomie/modeles-glb.js')).viderCache()`).
- Chemins relatifs uniquement : les chemins absolus, les URL et `..` sont refusés.

## Licences
Notez chaque modèle dans `CREDITS.md` (à la racine). N'ajoutez que des fichiers CC0, domaine public ou CC BY (en citant l'auteur) ; CC BY-SA oblige à garder la même licence.
