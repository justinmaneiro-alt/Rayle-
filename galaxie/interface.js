/* ═════════════ INTERFACE DE LA GALAXIE (étiquette, carte d'information, sas, fil d'Ariane) ═════════════ */
const $ = id => document.getElementById(id);
const ETAT = { active: 'Active', en_attente: 'En attente : prête à être programmée' };

export function creerInterface() {
  const etiquette = $('etiquette'), carte = $('carte'), sas = $('sas'), fil = $('fil-planete');
  let nav = null, derniereCarte = null;

  return {
    brancher(n) {
      nav = n;
      $('carte-entrer').addEventListener('click', () => { if (derniereCarte) nav.allerA(derniereCarte.id, { entrer: true }); });
      $('carte-fermer').addEventListener('click', () => nav.selectionner(null));
      $('sas-retour').addEventListener('click', () => nav.retour());
      $('fil-accueil').addEventListener('click', () => nav.retour());
    },
    etiquette(c, x, y, rayon, devant) {
      if (!c || !devant) { etiquette.hidden = true; return; }
      etiquette.hidden = false;
      etiquette.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
      const txt = etiquette.firstElementChild; txt.textContent = c.nom + (c.etat === 'en_attente' ? ' · en attente' : '');
      txt.style.top = (rayon + 12).toFixed(1) + 'px';
    },
    carte(c) {
      derniereCarte = c;
      if (!c) { carte.hidden = true; return; }
      carte.hidden = false;
      $('carte-titre').textContent = c.nom; $('carte-theme').textContent = c.theme; $('carte-etat').textContent = ETAT[c.etat] || c.etat;
      $('carte-entrer').hidden = c.entrable === false;
    },
    sas(c) {
      if (!c) { sas.hidden = true; return; }
      sas.hidden = false; carte.hidden = true;
      $('sas-titre').textContent = c.nom; $('sas-theme').textContent = c.theme;
      $('sas-etat').textContent = c.etat === 'en_attente' ? 'Cette planète attend d’être programmée.' : 'Contenu à venir : cette planète sera construite dans un prochain sprint.';
      const liste = $('sas-ordres'); liste.replaceChildren();
      const ordres = c.ordres || [];
      $('sas-ordres-titre').hidden = !ordres.length;
      for (const o of ordres) { const li = document.createElement('li'); li.textContent = ((window.RayleOrdres ? window.RayleOrdres.disponible(c.id, o.action) : o.disponible) ? '● ' : '○ ') + o.description; li.title = o.action; liste.appendChild(li); }
    },
    avertir(problemes) {
      const zone = $('alertes'); zone.hidden = !problemes.length; zone.replaceChildren();
      for (const p of problemes) { const d = document.createElement('div'); d.textContent = '⚠ manifeste « ' + p.id + ' » ignoré : ' + p.erreurs.slice(0, 2).join(' ; ') + (p.erreurs.length > 2 ? ' (+' + (p.erreurs.length - 2) + ')' : ''); zone.appendChild(d); }
    },
    fil(c) { fil.textContent = c ? c.nom : ''; $('fil-sep').hidden = !c; }
  };
}
