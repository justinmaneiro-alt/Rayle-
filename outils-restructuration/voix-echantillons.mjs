// Échantillons audio AVANT / APRÈS la prosodie, avec la voix locale Piper « Siwis » (serveur : node serveur.mjs 8000).
// AVANT = ancienne chaîne (phrases de NormFr, un seul débit, aucune pause) ; APRÈS = Prosodie (pauses, débit et hauteur par phrase).
// Sortie : captures-voix/*.wav + captures-voix/LISEZMOI.md.  node outils-restructuration/voix-echantillons.mjs [voix]
import fs from 'node:fs';
const charger = f => { const m = { exports: {} }; new Function('module', 'exports', 'window', fs.readFileSync(f, 'utf8'))(m, m.exports, undefined); return m.exports; };
const N = charger('core/voice/normalisation-fr.js'), P = charger('core/voice/prosodie.js'), C = charger('core/voice/voix-moteurs-calcul.js');
const VOIX = process.argv[2] || 'piper-siwis', BASE = 'http://127.0.0.1:8000';
const TEXTES = {
  actualite: "Bonjour Justin. Voici l'essentiel de ce matin : le suspect de l'attentat de Trappes avait dressé une liste de personnalités, la justice a ouvert une enquête, et le gouvernement réagira ce soir. Veux-tu que je détaille ? Plus d'informations sur https://www.franceinfo.fr/faits-divers/abc.html",
  marche: "Le US100 gagne +1,25 % à 21 345,5 points, RSI 14 à 68. L'or recule de 0,4 % à 3 985,66 $ ; le support se trouve à 3 950, la MA200 à 3 912. Attention : annonce de la Fed à 20h30…\nPrudence avant la séance de New York !",
  seisme: "Un séisme de magnitude 5,6 a été enregistré près de Tokyo le 11/11/2026 à 22h04. Aucun dégât n'est signalé pour l'instant, mais l'ONU et l'USGS suivent la situation, et les répliques sont attendues dans les prochaines heures."
};
function lireWav(buf) {
  let p = 12, fmt = null, data = null;
  while (p + 8 <= buf.length) { const id = buf.toString('ascii', p, p + 4), n = buf.readUInt32LE(p + 4); if (id === 'fmt ') fmt = { canaux: buf.readUInt16LE(p + 10), taux: buf.readUInt32LE(p + 12), bits: buf.readUInt16LE(p + 22) }; else if (id === 'data') { data = buf.subarray(p + 8, p + 8 + n); break; } p += 8 + n + (n & 1); }
  if (!fmt || !data) throw new Error('WAV illisible'); return { ...fmt, pcm: new Int16Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.length - (data.length & 1))) };
}
function reechantillonner(pcm, facteur) {   // lecture plus rapide (facteur > 1) = plus court ET plus aigu, comme playbackRate sans préservation de hauteur
  if (Math.abs(facteur - 1) < 1e-3) return pcm; const n = Math.floor(pcm.length / facteur), s = new Int16Array(n);
  for (let i = 0; i < n; i++) { const x = i * facteur, a = Math.floor(x), f = x - a; s[i] = Math.round((pcm[a] || 0) * (1 - f) + (pcm[Math.min(a + 1, pcm.length - 1)] || 0) * f); } return s;
}
async function synth(texte, vitesse) {
  const r = await fetch(BASE + '/__voix/synth', { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ voix: VOIX, texte, vitesse }) });
  if (!r.ok) throw new Error('synthèse HTTP ' + r.status + ' : ' + (await r.text()).slice(0, 120)); return lireWav(Buffer.from(await r.arrayBuffer()));
}
const silence = (taux, ms) => new Int16Array(Math.round(taux * ms / 1000));
function ecrireWav(fichier, taux, morceaux) {
  const total = morceaux.reduce((a, m) => a + m.length, 0), buf = Buffer.alloc(44 + total * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + total * 2, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(taux, 24); buf.writeUInt32LE(taux * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(total * 2, 40);
  let o = 44; for (const m of morceaux) for (const v of m) { buf.writeInt16LE(v, o); o += 2; } fs.writeFileSync(fichier, buf); return total / taux;
}
fs.mkdirSync('captures-voix', { recursive: true });
const rapport = ['# Échantillons de voix, avant et après la prosodie', '', 'Voix : ' + VOIX + ' (locale). Générés le ' + new Date().toISOString() + ' par `outils-restructuration/voix-echantillons.mjs`.', '',
  '| Échantillon | Durée avant | Durée après | Phrases (avant → après) | Pauses posées |', '|---|---|---|---|---|'];
for (const [nom, texte] of Object.entries(TEXTES)) {
  // AVANT : ancienne chaîne
  const avantParts = N.phrases(N.normaliser(texte)); let taux = 22050; const A = [];
  for (const p of avantParts) { const w = await synth(p, 1); taux = w.taux; A.push(w.pcm, silence(taux, 120)); }
  const dA = ecrireWav(`captures-voix/${nom}-avant.wav`, taux, A);
  // APRÈS : prosodie
  const segs = P.depuisTexte(texte, N.normaliser); const B = []; let pauses = 0;
  for (const s of segs) { const f = C.facteursLecture(s.vitesse, s.hauteur), w = await synth(s.texte, f.vitesseMoteur); taux = w.taux; B.push(reechantillonner(w.pcm, f.vitesseLecture)); if (s.pause) { B.push(silence(taux, s.pause)); pauses += s.pause; } }
  const dB = ecrireWav(`captures-voix/${nom}-apres.wav`, taux, B);
  rapport.push(`| ${nom} | ${dA.toFixed(1)} s | ${dB.toFixed(1)} s | ${avantParts.length} → ${segs.length} | ${(pauses / 1000).toFixed(1)} s |`);
  rapport.push('', '**' + nom + '** — texte : « ' + texte.replace(/\n/g, ' ↵ ') + ' »', '', '- avant : ' + JSON.stringify(avantParts), '- après : ' + JSON.stringify(segs.map(s => ({ t: s.texte, pause: s.pause, v: s.vitesse, h: s.hauteur }))), '');
  console.log(nom, 'avant', dA.toFixed(1) + ' s', 'après', dB.toFixed(1) + ' s', segs.length + ' segments');
}
fs.writeFileSync('captures-voix/LISEZMOI.md', rapport.join('\n'));
