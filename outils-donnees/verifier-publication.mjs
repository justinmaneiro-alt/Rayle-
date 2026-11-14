/* Garde-fou de publication : refuse de publier un dossier de snapshots qui contiendrait un secret ou une donnée personnelle.
   Usage : node outils-donnees/verifier-publication.mjs <dossier>  (code 1 + noms de fichiers SEULEMENT, jamais le contenu trouvé) */
import fs from 'node:fs'; import path from 'node:path';
export const MOTIFS = [
  ['jeton Telegram', /\b\d{8,10}:[A-Za-z0-9_-]{34,36}\b/], ['clé OpenAI / compatible (sk-)', /\bsk-[A-Za-z0-9_-]{20,}\b/], ['clé Google (AIza)', /\bAIza[0-9A-Za-z_-]{30,}\b/],
  ['clé Groq (gsk_)', /\bgsk_[A-Za-z0-9]{20,}\b/], ['clé Anthropic', /\bsk-ant-[A-Za-z0-9_-]{20,}\b/], ['clé privée', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['jeton GitHub', /\b(?:ghp|gho|ghs|github_pat)_[A-Za-z0-9_]{20,}\b/], ['adresse e-mail personnelle', /[A-Za-z0-9._%+-]+@gmail\.com/i], ['chemin Windows personnel', /C:\Users\[A-Za-z0-9_-]+/i],
  ['en-tête d\u2019autorisation', /"authorization"\s*:\s*"[^"]{8,}"/i]
];
export function verifier(dossier) {
  const problemes = [];
  (function parcourir(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.name === '.git') continue;
    if (e.isDirectory()) { parcourir(p); continue; }
    if (!/\.(json|txt|md)$/i.test(e.name)) { problemes.push([p, 'type de fichier non prévu']); continue; }
    const t = fs.readFileSync(p, 'utf8'); for (const [nom, re] of MOTIFS) if (re.test(t)) problemes.push([p, nom]); } })(dossier);
  return problemes;
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))) {
  const d = process.argv[2]; if (!d || !fs.existsSync(d)) { console.error('dossier absent'); process.exit(2); }
  const P = verifier(d); if (P.length) { for (const [f, m] of P) console.error('✗ ' + path.relative(d, f) + ' : ' + m); console.error('Publication REFUSÉE.'); process.exit(1); }
  console.log('publication vérifiée : aucun secret ni donnée personnelle détecté');
}
