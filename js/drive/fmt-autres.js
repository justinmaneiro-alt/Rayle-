/* ═════════════ DRIVE : texte brut, Markdown, PDF, Sheets, Slides (fonctions pures) ═════════════ */

/* ───── texte brut et Markdown : un paragraphe = un bloc séparé par une ligne vide ; les séparateurs sont gardés pour réécrire le fichier à l'identique ───── */
export function lireTexte(brut) {
  const crlf = /\r\n/.test(brut), t = String(brut).replace(/\r\n/g, '\n');
  const P = []; const re = /\n{2,}/g; let dernier = 0, m;
  const ajouter = (bloc, sep) => {
    const md = bloc.match(/^(#{1,6})[ \t]+(.*)$/);
    P.push({ texte: md ? md[2] : bloc, prefixe: md ? md[1] + ' ' : '', niveau: md ? md[1].length : 0, editable: true, sep });
  };
  while ((m = re.exec(t))) { ajouter(t.slice(dernier, m.index), m[0]); dernier = m.index + m[0].length; }
  ajouter(t.slice(dernier), '');
  return { paragraphes: P.filter(p => p.texte !== '' || p.sep !== '' || P.length === 1), crlf, avertissements: [] };
}
/** réécrit le fichier à partir des paragraphes (ceux qui n'ont pas changé restent identiques) */
export function ecrireTexte(paragraphes, crlf) {
  let s = '';
  paragraphes.forEach((p, k) => { s += (p.prefixe || '') + p.texte + (k < paragraphes.length - 1 ? (p.sep || '\n\n') : (p.sep || '')); });
  return crlf ? s.replace(/\n/g, '\r\n') : s;
}

/* ───── PDF : éléments de texte de pdf.js → paragraphes avec numéro de page ───── */
/** pages = [{ items:[{ str, transform:[a,b,c,d,x,y], height, hasEOL }] }] (le format de page.getTextContent()) */
export function paragraphesPdf(pages) {
  const P = [], hauteurs = [];
  pages.forEach(pg => pg.items.forEach(it => { if (it.str && it.str.trim() && it.height) hauteurs.push(Math.round(it.height * 10) / 10); }));
  hauteurs.sort((a, b) => a - b);
  const mediane = hauteurs.length ? hauteurs[Math.floor(hauteurs.length / 2)] : 10;
  pages.forEach((pg, k) => {
    const lignes = [];
    for (const it of pg.items) {
      if (!it.str || !it.str.trim()) continue;
      const y = it.transform[5], x = it.transform[4], h = it.height || mediane;
      const l = lignes.find(l => Math.abs(l.y - y) < Math.max(2, l.h * 0.4));
      if (l) { l.morceaux.push({ x, s: it.str }); l.h = Math.max(l.h, h); } else lignes.push({ y, h, morceaux: [{ x, s: it.str }] });
    }
    lignes.sort((a, b) => b.y - a.y);
    let courant = null, precY = null, precH = null;
    const clore = () => { if (courant) { courant.texte = courant.texte.replace(/\s+/g, ' ').trim(); if (courant.texte) P.push(courant); } courant = null; };
    for (const l of lignes) {
      const texte = l.morceaux.sort((a, b) => a.x - b.x).map(m => m.s).join(' ').replace(/\s+/g, ' ').trim();
      const titre = l.h >= mediane * 1.25 && texte.length <= 110;
      const niveau = titre ? (l.h >= mediane * 1.6 ? 1 : 2) : 0;
      const saut = precY == null ? true : (precY - l.y) > Math.max(precH, l.h) * 1.7;
      if (!courant || saut || niveau !== courant.niveau || titre) { clore(); courant = { texte: '', niveau, page: k + 1, editable: false }; }
      const t = courant.texte;
      courant.texte = t && /[a-zà-ÿ]-$/.test(t) && /^[a-zà-ÿ]/.test(texte) ? t.slice(0, -1) + texte : t + (t ? ' ' : '') + texte;       // mot coupé en fin de ligne
      precY = l.y; precH = l.h;
    }
    clore();
  });
  const avert = ['PDF : lecture seule.'];
  if (!P.length) avert.push('Ce PDF ne contient pas de texte lisible (probablement un scan) : je n’ai pas de reconnaissance de caractères.');
  return { paragraphes: P, avertissements: avert };
}

/* ───── Google Sheets : valeurs → paragraphes lisibles (« Ligne 3 : Nom = Dupont ; Âge = 22 ») ───── */
export function paragraphesFeuille(feuilles) {
  const P = [];
  for (const f of feuilles) {
    P.push({ texte: f.titre, niveau: 1, editable: false });
    const v = f.valeurs || [];
    if (!v.length) { P.push({ texte: 'Feuille vide.', niveau: 0, editable: false }); continue; }
    const entetes = (v[0] || []).map(x => String(x == null ? '' : x).trim());
    const aEntetes = entetes.filter(Boolean).length >= 2 && v.length > 1;
    v.forEach((ligne, r) => {
      if (aEntetes && r === 0) return;
      const cases = (ligne || []).map((c, k) => ({ c: String(c == null ? '' : c).trim(), e: aEntetes ? entetes[k] : '' })).filter(x => x.c);
      if (!cases.length) return;
      P.push({ texte: 'Ligne ' + (r + 1) + ' : ' + cases.map(x => (x.e ? x.e + ' = ' : '') + x.c).join(' ; '), niveau: 0, editable: false, ligne: r + 1 });
    });
    if (f.tronque) P.push({ texte: 'La feuille continue au-delà des ' + f.tronque + ' premières lignes lues.', niveau: 0, editable: false });
  }
  return { paragraphes: P, avertissements: ['Google Sheets : lecture seule (valeurs affichées, pas les formules).'] };
}

/* ───── Google Slides : texte de chaque diapositive ───── */
export function paragraphesDiapos(pres) {
  const P = [];
  const texteElements = els => (els || []).map(e => (e.textRun && e.textRun.content) || '').join('');
  const formes = (els, sortie) => {
    for (const e of els || []) {
      if (e.shape && e.shape.text) {
        const type = e.shape.placeholder && e.shape.placeholder.type;
        const lignes = texteElements(e.shape.text.textElements).split('\n').map(s => s.trim()).filter(Boolean);
        lignes.forEach(l => sortie.push({ l, titre: /TITLE/.test(type || '') }));
      } else if (e.table) {
        for (const r of e.table.tableRows || []) for (const c of r.tableCells || []) { const t = texteElements(c.text && c.text.textElements).replace(/\n/g, ' ').trim(); if (t) sortie.push({ l: t, titre: false }); }
      } else if (e.elementGroup) formes(e.elementGroup.children, sortie);
    }
  };
  (pres.slides || []).forEach((s, k) => {
    const lignes = []; formes(s.pageElements, lignes);
    const titre = lignes.find(x => x.titre);
    P.push({ texte: 'Diapositive ' + (k + 1) + (titre ? ' : ' + titre.l : ''), niveau: 1, page: k + 1, editable: false });
    lignes.filter(x => x !== titre).forEach(x => P.push({ texte: x.l, niveau: 0, page: k + 1, editable: false }));
    const notes = [];
    const np = s.slideProperties && s.slideProperties.notesPage; if (np) formes(np.pageElements, notes);
    const nt = notes.map(x => x.l).join(' ').trim();
    if (nt) P.push({ texte: 'Notes du présentateur : ' + nt, niveau: 0, page: k + 1, editable: false });
  });
  return { paragraphes: P, avertissements: ['Google Slides : lecture seule (le texte des diapositives).'] };
}
