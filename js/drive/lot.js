/* ═════════════ DRIVE : boîte « X documents ajoutés au total, en ajouter d'autres ? » (mode par lots) ═════════════
   demanderSuite({ total }) → Promise<boolean> : true = « Ajouter d'autres documents » (rouvre le sélecteur), false = « Terminer ».
   Aucune limite de lots. Grands boutons (44 px) pour le toucher ; Échap = Terminer. */
export const phraseLot = total => total + ' document' + (total > 1 ? 's' : '') + ' ajouté' + (total > 1 ? 's' : '') + ' au total, en ajouter d’autres ?';

export function demanderSuite({ total, doc = globalThis.document }) {
  return new Promise(ok => {
    if (!doc || !doc.body) { ok(false); return; }
    const mk = (tag, cls, txt) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (txt) e.textContent = txt; return e; };
    const fond = mk('div', 'dr-lot'), boite = mk('div', 'dr-lot-boite');
    boite.setAttribute('role', 'alertdialog'); boite.setAttribute('aria-label', 'Documents ajoutés');
    const msg = mk('p', 'dr-lot-msg', phraseLot(total));
    const bPlus = mk('button', 'dr-b dr-gros dr-ok', 'Ajouter d’autres documents'), bFin = mk('button', 'dr-b dr-gros', 'Terminer');
    bPlus.type = bFin.type = 'button';
    const fermer = v => { doc.removeEventListener('keydown', touche, true); fond.remove(); ok(v); };
    const touche = ev => { if (ev.key === 'Escape') { ev.stopPropagation(); fermer(false); } };
    bPlus.addEventListener('click', () => fermer(true)); bFin.addEventListener('click', () => fermer(false));
    doc.addEventListener('keydown', touche, true);
    boite.append(msg, mk('div', 'dr-lot-boutons')); boite.lastChild.append(bPlus, bFin);
    fond.append(boite); doc.body.append(fond);
    try { bPlus.focus(); } catch (e) { /* ignore */ }
  });
}
