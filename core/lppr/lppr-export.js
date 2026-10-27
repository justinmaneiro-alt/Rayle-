/* ═════════════ LPPR : EXPORT DU DEVIS EN PDF ET EN WORD (module pur, sans dépendance ; testé : galaxie/tests/lppr-graphe-test.mjs) ═════════════
   `devisVersPdf(devis, options)` et `devisVersDocx(devis, options)` rendent un Uint8Array. Modèle simple, sobre. AUCUNE donnée de patient n'est enregistrée par Raylé : les champs « patient », « prescripteur »
   et « notes » ne sont lus que pour fabriquer le fichier, jamais écrits dans le dépôt, le navigateur ou le Worker (le fichier est téléchargé, c'est tout).
   PDF : A4, Helvetica, codage WinAnsi, texte non compressé (relisible). Word : .docx minimal (WordprocessingML) fabriqué avec un petit écrivain ZIP « stocké » (CRC32). */
const fr = (v, d = 2) => (v == null || !Number.isFinite(v) ? '—' : v.toFixed(d).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, ' '));
const euro = v => (v == null ? '—' : fr(v) + ' €');

/* Contenu commun : une liste de blocs { type: 'titre' | 'sous-titre' | 'texte' | 'petit' | 'ligne' | 'tableau' | 'espace', … } */
export function contenuDevis(devis, { patient = '', prescripteur = '', notes = '', date = new Date() } = {}) {
  const b = [], jour = date.toISOString().slice(0, 10).split('-').reverse().join('/');
  b.push({ type: 'titre', texte: 'Devis — appareillage orthopédique (proposition)' });
  b.push({ type: 'petit', texte: 'Établi le ' + jour + ' · nomenclature utilisée : LPP Titre II, ' + (devis.version || 'version inconnue') + ' · à confirmer ligne par ligne' });
  if (patient || prescripteur) b.push({ type: 'texte', texte: [patient && 'Patient : ' + patient, prescripteur && 'Prescripteur : ' + prescripteur].filter(Boolean).join('   ·   ') });
  if (devis.appareil) b.push({ type: 'texte', texte: 'Appareil : ' + devis.appareil + (devis.deja_compris ? ' — ' + Object.entries(devis.deja_compris).map(([k, v]) => k.replace(/_/g, ' ') + ' : ' + v).join(' ; ') : '') });
  b.push({ type: 'espace' });
  const lignes = devis.lignes || [];
  b.push({ type: 'tableau', entetes: ['Code', 'Désignation', 'Qté', 'Tarif (base)', 'Prix limite', 'Total'], largeurs: [0.12, 0.43, 0.06, 0.13, 0.13, 0.13],
    lignes: lignes.map(l => [l.code + (l.reference ? '\n' + l.reference : ''), (l.designation || '') + (l.role ? '\n(' + l.role + ')' : ''), String(l.quantite || 1), l.tarif_texte && l.base_remboursement == null ? l.tarif_texte : euro(l.base_remboursement), euro(l.prix_limite_vente), l.total != null ? euro(l.total) : 'sur devis']) });
  const tot = devis.totaux || {};
  b.push({ type: 'espace' });
  b.push({ type: 'ligne', gauche: 'Base de remboursement estimée (lignes chiffrées)', droite: euro(tot.base_remboursement_estimee) });
  if (tot.lignes_a_chiffrer && tot.lignes_a_chiffrer.length) b.push({ type: 'texte', texte: 'Lignes à chiffrer sur devis : ' + tot.lignes_a_chiffrer.join(', ') });
  if ((devis.alertes || []).length) { b.push({ type: 'sous-titre', texte: 'Points d’attention' }); for (const a of devis.alertes) b.push({ type: 'texte', texte: '• ' + a.texte }); }
  if ((devis.entente_prealable || []).length) { b.push({ type: 'sous-titre', texte: 'Accord préalable' }); for (const e of devis.entente_prealable.slice(0, 3)) b.push({ type: 'texte', texte: '• ' + e.phrase + ' (' + e.source + ')' }); }
  if ((devis.justificatifs || []).length) { b.push({ type: 'sous-titre', texte: 'Justificatifs à joindre' }); for (const j of devis.justificatifs) b.push({ type: 'texte', texte: '• ' + j }); }
  if (notes) { b.push({ type: 'sous-titre', texte: 'Notes' }); b.push({ type: 'texte', texte: notes }); }
  b.push({ type: 'espace' });
  b.push({ type: 'petit', texte: devis.avertissement || 'À vérifier avec la nomenclature en vigueur (ameli.fr, Légifrance).' });
  b.push({ type: 'petit', texte: 'Document produit par Raylé. Aucune donnée de patient n’est enregistrée par Raylé ; ce fichier n’est pas un devis contractuel tant qu’il n’est pas relu et signé par l’orthoprothésiste.' });
  return b;
}

/* ───────────────── PDF ───────────────── */
const WINANSI = { '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8A, '‹': 0x8B, 'Œ': 0x8C, 'Ž': 0x8E, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9A, '›': 0x9B, 'œ': 0x9C, 'ž': 0x9E, 'Ÿ': 0x9F, ' ': 0x20, ' ': 0x20, '⧉': 0x3f };
export function winAnsi(s) {
  const out = []; for (const ch of String(s)) { const c = ch.codePointAt(0); out.push(WINANSI[ch] != null ? WINANSI[ch] : (c < 256 ? c : 0x3f)); } return out;
}
const hex = bytes => bytes.map(b => b.toString(16).padStart(2, '0')).join('');
const echapperPdf = bytes => { const o = []; for (const b of bytes) { if (b === 0x28 || b === 0x29 || b === 0x5c) o.push(0x5c, b); else if (b === 0x0a || b === 0x0d) o.push(0x20); else o.push(b); } return o; };
// largeurs moyennes de Helvetica (millièmes d'em) : approximation suffisante pour couper les lignes sans chevauchement
const LARG = c => (/[iljI.,;:!'’|]/.test(c) ? 0.27 : /[mwMW—]/.test(c) ? 0.85 : /[A-Z0-9]/.test(c) ? 0.62 : /\s/.test(c) ? 0.28 : 0.5);
const largeurTexte = (t, taille) => { let w = 0; for (const c of t) w += LARG(c); return w * taille; };
function couper(texte, taille, largeur) {
  const out = []; for (const para of String(texte).split('\n')) {
    let ligne = ''; for (const mot of para.split(/\s+/)) { const essai = ligne ? ligne + ' ' + mot : mot; if (largeurTexte(essai, taille) <= largeur || !ligne) ligne = essai; else { out.push(ligne); ligne = mot; } }
    out.push(ligne);
  } return out;
}
export function devisVersPdf(devis, options = {}) {
  const blocs = contenuDevis(devis, options), L = 595.28, H = 841.89, M = 42, util = L - 2 * M, pages = []; let ops = [], y = H - M;
  const nouvellePage = () => { if (ops.length) pages.push(ops); ops = []; y = H - M; };
  const texte = (t, x, yy, taille, gras) => ops.push('BT /' + (gras ? 'F2' : 'F1') + ' ' + taille + ' Tf ' + x.toFixed(2) + ' ' + yy.toFixed(2) + ' Td <' + hex(winAnsi(t)) + '> Tj ET');
  const trait = (x1, y1, x2, y2) => ops.push('0.6 w ' + x1.toFixed(2) + ' ' + y1.toFixed(2) + ' m ' + x2.toFixed(2) + ' ' + y2.toFixed(2) + ' l S');
  const ecrire = (t, taille, gras, retrait = 0) => { const lh = taille * 1.35; for (const l of couper(t, taille, util - retrait)) { if (y - lh < M) nouvellePage(); y -= lh; texte(l, M + retrait, y, taille, gras); } };
  for (const b of blocs) {
    if (b.type === 'titre') { ecrire(b.texte, 17, true); y -= 4; } else if (b.type === 'sous-titre') { y -= 6; ecrire(b.texte, 12, true); } else if (b.type === 'texte') ecrire(b.texte, 10, false);
    else if (b.type === 'petit') ecrire(b.texte, 8, false); else if (b.type === 'espace') y -= 8;
    else if (b.type === 'ligne') { if (y - 14 < M) nouvellePage(); y -= 14; texte(b.gauche, M, y, 10, true); const w = largeurTexte(b.droite, 10); texte(b.droite, L - M - w, y, 10, true); }
    else if (b.type === 'tableau') {
      const xs = []; let cx = M; for (const f of b.largeurs) { xs.push(cx); cx += f * util; } const ent = () => { if (y - 18 < M) nouvellePage(); y -= 4; trait(M, y, L - M, y); y -= 12; b.entetes.forEach((e, i) => texte(e, xs[i] + 2, y, 8.5, true)); y -= 4; trait(M, y, L - M, y); };
      ent();
      for (const r of b.lignes) {
        const cellules = r.map((c, i) => couper(c, 8.5, b.largeurs[i] * util - 5)), hauteur = Math.max(...cellules.map(c => c.length)) * 11.5 + 5;
        if (y - hauteur < M) { nouvellePage(); ent(); }
        let yy = y - 11; cellules.forEach((lig, i) => lig.forEach((t, k) => texte(t, xs[i] + 2, yy - k * 11.5, 8.5, false))); y -= hauteur; trait(M, y, L - M, y);
      }
    }
  }
  if (ops.length) pages.push(ops);
  // assemblage : 1 catalogue, 2 pages, 3 police normale, 4 police grasse, puis (page, contenu) par page
  const objets = []; const ajouter = s => { objets.push(s); return objets.length; };
  ajouter('<< /Type /Catalog /Pages 2 0 R >>'); ajouter(''); ajouter('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'); ajouter('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const idsPages = [];
  pages.forEach((p, k) => { const pied = 'BT /F1 8 Tf ' + M + ' 22 Td <' + hex(winAnsi('Raylé · devis LPPR · page ' + (k + 1) + ' / ' + pages.length)) + '> Tj ET', flux = p.join('\n') + '\n' + pied; const c = ajouter('<< /Length ' + flux.length + ' >>\nstream\n' + flux + '\nendstream'); idsPages.push(ajouter('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + L + ' ' + H + '] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ' + c + ' 0 R >>')); });
  objets[1] = '<< /Type /Pages /Kids [' + idsPages.map(i => i + ' 0 R').join(' ') + '] /Count ' + idsPages.length + ' >>';
  let pdf = '%PDF-1.4\n%âãÏÓ\n'; const pos = [];
  objets.forEach((o, i) => { pos.push(pdf.length); pdf += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
  const xref = pdf.length; pdf += 'xref\n0 ' + (objets.length + 1) + '\n0000000000 65535 f \n' + pos.map(p => String(p).padStart(10, '0') + ' 00000 n \n').join('') + 'trailer\n<< /Size ' + (objets.length + 1) + ' /Root 1 0 R /Info << /Title (Devis LPPR) /Producer (Rayle) >> >>\nstartxref\n' + xref + '\n%%EOF\n';
  return Uint8Array.from(pdf, c => c.charCodeAt(0) & 255);   // toutes les lettres du fichier sont < 256 : un caractère = un octet
}

/* ───────────────── Word (.docx) ───────────────── */
const xml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export const crc32 = u8 => { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
/* Petit écrivain ZIP : fichiers STOCKÉS (sans compression), assez pour un .docx. */
export function ecrireZip(fichiers) {
  const enc = new TextEncoder(), parties = [], centraux = []; let off = 0;
  const u16 = n => [n & 255, (n >> 8) & 255], u32 = n => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
  for (const [nom, contenu] of Object.entries(fichiers)) {
    const n = enc.encode(nom), d = typeof contenu === 'string' ? enc.encode(contenu) : contenu, crc = crc32(d);
    const local = Uint8Array.from([0x50, 0x4b, 3, 4, ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(d.length), ...u32(d.length), ...u16(n.length), ...u16(0), ...n]);
    parties.push(local, d);
    centraux.push(Uint8Array.from([0x50, 0x4b, 1, 2, ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(d.length), ...u32(d.length), ...u16(n.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off), ...n]));
    off += local.length + d.length;
  }
  const taille = centraux.reduce((a, c) => a + c.length, 0), fin = Uint8Array.from([0x50, 0x4b, 5, 6, ...u16(0), ...u16(0), ...u16(centraux.length), ...u16(centraux.length), ...u32(taille), ...u32(off), ...u16(0)]);
  const tout = [...parties, ...centraux, fin], total = tout.reduce((a, p) => a + p.length, 0), res = new Uint8Array(total); let p0 = 0; for (const p of tout) { res.set(p, p0); p0 += p.length; } return res;
}
export function devisVersDocx(devis, options = {}) {
  const blocs = contenuDevis(devis, options);
  const para = (t, { gras = false, taille = 21, couleur = null, apres = 80 } = {}) => '<w:p><w:pPr><w:spacing w:after="' + apres + '"/></w:pPr>' + String(t).split('\n').map((l, i) => '<w:r><w:rPr>' + (gras ? '<w:b/>' : '') + '<w:sz w:val="' + taille + '"/>' + (couleur ? '<w:color w:val="' + couleur + '"/>' : '') + '</w:rPr>' + (i ? '<w:br/>' : '') + '<w:t xml:space="preserve">' + xml(l) + '</w:t></w:r>').join('') + '</w:p>';
  const cellule = (t, larg, gras) => '<w:tc><w:tcPr><w:tcW w:w="' + larg + '" w:type="dxa"/></w:tcPr>' + para(t, { gras, taille: 17, apres: 20 }) + '</w:tc>';
  let corps = '';
  for (const b of blocs) {
    if (b.type === 'titre') corps += para(b.texte, { gras: true, taille: 34, apres: 100 }); else if (b.type === 'sous-titre') corps += para(b.texte, { gras: true, taille: 24, apres: 60 }); else if (b.type === 'texte') corps += para(b.texte);
    else if (b.type === 'petit') corps += para(b.texte, { taille: 16, couleur: '555555' }); else if (b.type === 'espace') corps += para('', { apres: 60 }); else if (b.type === 'ligne') corps += para(b.gauche + '   :   ' + b.droite, { gras: true });
    else if (b.type === 'tableau') {
      const total = 9600, larg = b.largeurs.map(f => Math.round(f * total));
      corps += '<w:tbl><w:tblPr><w:tblW w:w="' + total + '" w:type="dxa"/><w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(s => '<w:' + s + ' w:val="single" w:sz="4" w:space="0" w:color="999999"/>').join('') + '</w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>' + larg.map(w => '<w:gridCol w:w="' + w + '"/>').join('') + '</w:tblGrid>'
        + '<w:tr><w:trPr><w:tblHeader/></w:trPr>' + b.entetes.map((e, i) => cellule(e, larg[i], true)).join('') + '</w:tr>' + b.lignes.map(r => '<w:tr>' + r.map((c, i) => cellule(c, larg[i], false)).join('') + '</w:tr>').join('') + '</w:tbl>';
    }
  }
  const document = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + corps + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="900" w:right="900" w:bottom="900" w:left="900" w:header="400" w:footer="400" w:gutter="0"/></w:sectPr></w:body></w:document>';
  return ecrireZip({
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/document.xml': document
  });
}
export const typesMime = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
