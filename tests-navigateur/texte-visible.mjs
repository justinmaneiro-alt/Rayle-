/* Contrôle du texte VISIBLE d'une fenêtre : échoue si « [object Object] », « undefined », « NaN » ou « null » apparaît (V1, partie 5-d). */
export const MOTIFS = [/\[object Object\]/, /\bundefined\b/, /\bNaN\b/, /\bnull\b/, /Infinity/];
export async function defautsTexte(page, selecteur = 'body') {
  const t = await page.evaluate(sel => {
    const racine = document.querySelector(sel); if (!racine) return null;
    const w = document.createTreeWalker(racine, NodeFilter.SHOW_TEXT), out = [];
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const e = n.parentElement; if (!e || /^(SCRIPT|STYLE|NOSCRIPT)$/.test(e.tagName)) continue;
      const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden') continue;
      out.push(n.nodeValue);
    }
    return out.join('\n');
  }, selecteur);
  if (t == null) return null;
  return MOTIFS.filter(m => m.test(t)).map(m => m.source + ' → …' + (t.match(new RegExp('.{0,40}' + m.source + '.{0,40}')) || [''])[0].replace(/\s+/g, ' ') + '…');
}
