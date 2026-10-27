# Modèles lourds de Raylé (exclus de git)

Ce dossier reçoit les modèles 3D volumineux (glTF compressé Draco / Meshopt, textures KTX2) : anatomie, vaisseaux détaillés, etc.
- **Il n'est pas publié** : `.gitignore` l'exclut (GitHub Pages : 100 Mo par fichier, 1 Go pour le site), à l'exception de ce fichier et du manifeste.
- `manifeste.json` décrit les systèmes disponibles et leurs parties (chargement progressif). Les licences de chaque fichier sont dans `CREDITS.md`.
- Pour héberger ces fichiers ailleurs plus tard (par exemple Cloudflare R2, gratuit) : copier le dossier, puis définir `window.RAYLE_ASSETS_URL = 'https://…/'` ou écrire le réglage `rayle_assets_url` dans l'appareil. Rien d'autre à changer.
