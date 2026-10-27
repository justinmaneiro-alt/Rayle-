/* ═════════════ CHARGEMENT DES TUILES (fil principal) ═════════════
   Distribue les demandes à quelques Workers, avec une file à priorité (les tuiles proches du centre de l'écran d'abord), un nombre
   maximal de demandes simultanées et l'annulation des demandes devenues inutiles. Rien n'est téléchargé en masse : seulement ce qui est à l'écran. */
export function creerChargeur({ url, travailleurs = 3, simultanees = 10, perdu = null } = {}) {
  const ws = [];
  for (let i = 0; i < travailleurs; i++) {
    const w = new Worker(url, { type: 'module' });
    w.onmessage = e => fin(e.data);
    w.onerror = e => { console.error('[terre] worker des tuiles :', e.message || e); if (perdu) perdu(e); };
    ws.push(w);
  }
  let n = 0, tour = 0, actives = 0, mort = false;
  const file = [], attente = new Map();           // file : demandes pas encore parties ; attente : id → demande partie
  function pousser() {
    while (!mort && actives < simultanees && file.length) {
      file.sort((a, b) => a.priorite - b.priorite);
      const d = file.shift();
      if (d.annulee) continue;
      actives++; d.partie = true; d.worker = ws[tour++ % ws.length];
      attente.set(d.id, d);
      d.worker.postMessage({ id: d.id, ...d.message });
    }
  }
  function fin(r) {
    const d = attente.get(r.id); if (!d) return;
    attente.delete(r.id); actives--;
    if (!d.annulee) { if (r.ok) d.resoudre(r); else d.rejeter(new Error(r.erreur || 'échec')); }
    else if (r.bitmap) r.bitmap.close();
    pousser();
  }
  return {
    /* message : { type, url, ... } → promesse du résultat ; la demande porte une méthode annuler(). */
    demander(message, priorite = 0) {
      const id = ++n; let resoudre, rejeter;
      const p = new Promise((a, b) => { resoudre = a; rejeter = b; });
      const d = { id, message, priorite, resoudre, rejeter, annulee: false, partie: false };
      file.push(d);
      p.annuler = () => {
        if (d.annulee) return; d.annulee = true;
        if (d.partie) { try { d.worker.postMessage({ type: 'annuler', id }); } catch (e) {} } else { const i = file.indexOf(d); if (i >= 0) file.splice(i, 1); }
        rejeter(new Error('annulé'));
      };
      p.changerPriorite = v => { d.priorite = v; };
      p.catch(() => {});                            // une annulation n'est pas une erreur non gérée
      pousser();
      return p;
    },
    etat: () => ({ enFile: file.length, actives }),
    arreter() { mort = true; for (const w of ws) w.terminate(); file.length = 0; attente.clear(); }
  };
}
