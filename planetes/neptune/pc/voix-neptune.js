import * as M from './maquette-calcul.js';

/* ═════════════ NEPTUNE : COMMANDES VOCALES DE L'ATELIER ═════════════
   `detecter(texte)` est PUR (testé : planetes/neptune/tests/voix-test.mjs) ; `traiter(texte)` exécute la commande sur window.Neptune et rend la phrase à dire (ou null si ce n'est pas
   pour l'atelier). Les commandes de l'atelier ne sont prises que quand il est ouvert ; « ouvre l'atelier 3D » marche partout (via le bus d'ordres). Rien n'est inventé :
   un ordre impossible dit pourquoi. La fabrication utilise des formes paramétriques simples (maquette-calcul.js). */
const sansAccent = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, ' ').replace(/[,;.!?]/g, ' ').replace(/\s+/g, ' ').trim();

export function detecter(texte, { ouvert = false } = {}) {
  const t = sansAccent(texte);
  if (/\b(?:ouvre|lance|va dans|entre dans|montre)\b.*\b(?:atelier|maquettes?)\b|\b(?:atelier|maquettes?) (?:3d|trois d|de neptune|neptune)\b/.test(t) && !ouvert) return { type: 'ouvrir_atelier' };
  if (!ouvert) return null;
  if (/\b(?:ferme|quitte|sors de)\b.*\b(?:atelier|maquettes?)\b/.test(t)) return { type: 'fermer_atelier' };
  if (/\bpoignees?\b/.test(t)) return { type: 'poignees', mode: /\b(?:retire|enleve|cache|masque|desactive|coupe|ferme|sans)\b/.test(t) ? null : /\b(?:tourn|rotation|pivot|angle)/.test(t) ? 'tourner' : /\b(?:taille|echelle|redimension|agrand|zoom)/.test(t) ? 'echelle' : 'deplacer' };
  if (/\baimant(?:e|er|ation)?\b/.test(t)) return { type: 'aimant', actif: !/\b(?:retire|enleve|desactive|coupe|sans|arrete)\b/.test(t) };
  if (/\bpresente\b.*\bpieces?\b|\b(?:pieces?) par (?:pieces?)\b|\bvisite guidee\b|\bpresente (?:la |le |l )?(?:maquette|modele|moteur|bateau|armure|maison)\b/.test(t)) return { type: 'presenter' };
  if (/\b(?:stop|arrete|coupe|interromps)\b.*\b(?:presentation|visite|explication)s?\b/.test(t)) return { type: 'arreter' };
  if (/\bvisite\b|\bfais le tour\b|\bparcours\b/.test(t)) return { type: 'visite' };
  if (/\b(?:fabrique|cree|genere|construis|fais moi|modelise)\b/.test(t)) return { type: 'fabriquer', description: t.replace(/^.*?\b(?:fabrique|cree|genere|construis|modelise|fais moi)\b\s*(?:moi\s*)?/, '') };
  if (/\b(?:isole|isoler)\b/.test(t)) return { type: 'isoler', nom: t.replace(/^.*?\bisole\w*\b\s*(?:moi\s*)?(?:la |le |les |l |un |une )?(?:piece\s*)?/, '') };
  if (/\b(?:affiche|montre|reaffiche|remets|reviens a)\b.*\b(?:tout|tout le modele|toutes les pieces|l ensemble)\b/.test(t)) return { type: 'tout_afficher' };
  if (/\b(?:cache|masque)\b/.test(t)) return { type: 'masquer', nom: t.replace(/^.*?\b(?:cache|masque)\b\s*(?:la |le |les |l )?(?:piece\s*)?/, '') };
  if (/\b(?:eclate|eclater|vue eclatee|desassemble|demonte)\b/.test(t)) return { type: 'eclater', animer: /desassemble|demonte/.test(t) };
  if (/\b(?:rassemble|remonte|assemble|ressemble|referme)\b/.test(t)) return { type: 'assembler' };
  if (/\bcoupe\b.*\b(?:deux|en deux|plan|section)\b|\bplan de coupe\b|\bvue en coupe\b|\bsection\b/.test(t)) return { type: 'coupe', actif: !/\b(?:enleve|retire|desactive|sans)\b/.test(t) };
  if (/\bmesure\b|\bmesurer\b/.test(t)) return { type: 'mesure' };
  if (/\bcirconference\b/.test(t)) return { type: 'circonference' };
  if (/\b(?:controle|verifie|teste)\b.*\b(?:impression|etanche|etancheite|maillage)\b|\bpret pour l impression\b/.test(t)) return { type: 'impression' };
  if (/\bexporte\b|\benregistre\b.*\b(?:stl|glb|obj)\b/.test(t)) return { type: 'exporter', format: /\bstl\b/.test(t) ? 'stl' : /\bobj\b/.test(t) ? 'obj' : 'glb' };
  if (/\b(?:cadre|recentre|centre la vue|remets la vue)\b/.test(t)) return { type: 'cadrer' };
  if (/\bsupprime\b.*\b(?:selection|piece)\b/.test(t)) return { type: 'supprimer' };
  if (/\bduplique\b/.test(t)) return { type: 'dupliquer' };
  if (/\bsymetrique\b|\bsymetrie\b|\bmiroir\b/.test(t)) return { type: 'symetrie' };
  if (/\bimporte\b|\bcharge\b.*\b(?:fichier|modele)\b/.test(t)) return { type: 'importer' };
  return null;
}

export async function traiter(texte) {
  const N = window.Neptune, ouvert = !!(N && N.etat && N.etat().actif), d = detecter(texte, { ouvert });
  if (!d) return null;
  if (d.type === 'ouvrir_atelier') {
    if (window.RayleOrdres) { const r = await window.RayleOrdres.envoyer({ de: 'rayle', vers: 'neptune', action: 'entrer_atelier', params: {} }); return r && r.texte ? r.texte : (r && r.erreur) || 'L’atelier n’a pas pu s’ouvrir.'; }
    return 'Je ne peux pas ouvrir l’atelier : le bus d’ordres n’est pas prêt.';
  }
  const A = N.atelier();
  if (d.type === 'fermer_atelier') { N.sortir ? N.sortir() : null; return 'Je ferme l’atelier.'; }
  if (d.type === 'fabriquer') { const r = N.fabriquer(d.description); return r.ok ? r.message + ' ' + (r.notes || []).slice(-1)[0] : r.message; }
  if (d.type === 'presenter') {       // l'introduction est dite par la page ; la suite (une pièce après l'autre) démarre quand elle a fini de parler
    const ps = A.pieces(); if (!ps.length) return 'Il n’y a rien à présenter : importe ou fabrique d’abord un modèle.';
    const nom = A.modele.children[0] ? A.modele.children[0].name : 'ce modèle';
    setTimeout(() => N.presenter({ sansIntro: true, attendreParole: true }), 300);
    return M.introPresentation(nom, ps.length);
  }
  if (d.type === 'poignees') { const r = A.poignees(d.mode); return r ? 'Poignées de ' + { deplacer: 'déplacement', tourner: 'rotation', echelle: 'taille' }[r] + (A.etat.selection ? '.' : ' : choisis d’abord une pièce en cliquant dessus.') : 'Poignées retirées.'; }
  if (d.type === 'aimant') return A.aimanter(d.actif) ? 'Aimantation activée : la pièce avance par pas réguliers.' : 'Aimantation coupée.';
  if (d.type === 'arreter') { N.arreterPresentation(); A.arreterVisite(); return 'D’accord, j’arrête.'; }
  if (d.type === 'visite') { const r = A.lancerVisite(); return r.ok ? 'Je lance la visite ' + (r.genre === 'maison' ? 'de la maison' : r.genre === 'bateau' ? 'du bateau' : 'de l’objet') + ', environ ' + Math.round(r.duree) + ' secondes.' : r.raison; }
  if (d.type === 'isoler' || d.type === 'masquer') {
    const nom = (d.nom || '').trim(); if (!nom) { const id = A.etat.selection; if (!id) return 'Dis-moi quelle pièce, ou sélectionne-la d’abord.'; if (d.type === 'isoler') { A.isoler(id); return 'Voici cette pièce isolée.'; } A.afficher(id, false); return 'Pièce masquée.'; }
    const m = chercherPiece(A, nom); if (!m) return 'Je ne trouve pas de pièce nommée « ' + nom + ' ». Les pièces sont dans la liste de gauche.';
    if (d.type === 'isoler') { A.isoler(m.id); A.selectionner(m.id); A.cadrer(A.parId(m.id)); return 'Je t’isole « ' + m.nom + ' ».'; } A.afficher(m.id, false); return '« ' + m.nom + ' » est masquée.';
  }
  if (d.type === 'tout_afficher') { A.toutAfficher(); A.cadrer(); return 'Tout est de nouveau visible.'; }
  if (d.type === 'eclater') { if (d.animer) { const r = A.animerAssemblage('desassembler', 3); return r.ok ? 'Je désassemble.' : r.raison; } const r = A.eclater(1); return r.ok ? 'Vue éclatée : ' + r.pieces + ' pièces écartées.' : r.raison; }
  if (d.type === 'assembler') { const r = A.animerAssemblage('assembler', 3); return r.ok ? 'Je rassemble les pièces.' : r.raison; }
  if (d.type === 'coupe') { A.regler({ coupe: { ...A.etat.coupe, actif: d.actif } }); return d.actif ? 'Plan de coupe activé : le curseur Position le déplace.' : 'Plan de coupe retiré.'; }
  if (d.type === 'mesure') { A.regler({ mesure: !A.etat.mesure }); if (!A.etat.mesure) A.effacerMesure(); return A.etat.mesure ? 'Mesure : clique deux points sur le modèle.' : 'Mesure terminée.'; }
  if (d.type === 'circonference') { const r = A.circonference(A.etat.selection, 1, 0.5); return r.ok ? 'À mi-hauteur, le contour mesure ' + +r.circonference.toPrecision(4) + ' ' + r.unite + '. ' + r.note : r.raison; }
  if (d.type === 'impression') { const r = A.controleImpression(A.etat.selection); return !r.ok ? r.raison : (r.imprimable ? 'Aucun défaut géométrique détecté. ' : 'Problèmes : ' + r.problemes.slice(0, 3).join(' ') + ' ') + r.note; }
  if (d.type === 'exporter') { try { const r = await A.exporter(d.format); return 'Exporté : ' + r.fichier + '.'; } catch (e) { return 'Export impossible : ' + (e && e.message || e); } }
  if (d.type === 'cadrer') { A.cadrer(); return 'Vue cadrée.'; }
  if (d.type === 'supprimer') { const id = A.etat.selection; return id && A.supprimer(id) ? 'Pièce supprimée.' : 'Sélectionne d’abord une pièce.'; }
  if (d.type === 'dupliquer') { const id = A.etat.selection, n = id && A.dupliquer(id); return n ? 'Pièce dupliquée.' : 'Sélectionne d’abord une pièce.'; }
  if (d.type === 'symetrie') { const id = A.etat.selection, n = id && A.symetrie(id, 0); return n ? 'Copie symétrique créée.' : 'Sélectionne d’abord une pièce.'; }
  if (d.type === 'importer') return 'Utilise le bouton Importer, ou dépose le fichier sur l’écran : je ne peux pas ouvrir tes dossiers toute seule.';
  return null;
}

/* Cherche une pièce par son nom (sans accents ni majuscules) : égalité, puis « contient », puis un mot en commun. */
export function chercherPiece(atelier, nom) {
  const n = sansAccent(nom).replace(/^(?:la |le |les |l )/, ''), liste = []; (function rec(o) { if (!o.userData.__aide) liste.push(o); o.children.forEach(rec); })(atelier.modele);
  const cand = liste.filter(o => o !== atelier.modele && o.name).map(o => ({ id: o.uuid, nom: o.name, n: sansAccent(o.name) }));
  return cand.find(c => c.n === n) || cand.find(c => c.n.includes(n) || n.includes(c.n)) || cand.find(c => c.n.split(' ').some(m => m.length > 3 && n.split(' ').includes(m))) || null;
}
