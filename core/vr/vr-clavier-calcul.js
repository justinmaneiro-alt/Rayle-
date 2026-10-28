"use strict";
/* ═════════════ CLAVIER EN RÉALITÉ VIRTUELLE : calculs PURS (testés sous Node : galaxie/tests/vr-clavier-test.mjs) ═════════════
   Disposition AZERTY (comme le vrai clavier de Justin), accents français, chiffres et symboles ; édition d'un champ de texte : insérer, effacer, déplacer le curseur, majuscules (une fois, ou verrouillées
   par un double appui). Aucune dépendance, aucun DOM : le module vr-clavier.js (DOM) applique le résultat sur le vrai champ de la page.
   Une touche = { id, etiquette, type } : type « car » (un caractère, éventuellement en majuscule) ou « action » (maj, retour, entree, espace, symboles, lettres, accents, gauche, droite, fermer). */
(function (racine) {
  const car = (c, maj) => ({ id: 'c:' + c, type: 'car', car: c, maj: maj === undefined ? c.toUpperCase() : maj, etiquette: c });
  const act = (id, etiquette, largeur = 1) => ({ id, type: 'action', etiquette, largeur });
  const rang = s => [...s].map(c => car(c));
  const LETTRES = [
    rang('1234567890').map(k => ({ ...k, maj: k.car })),
    rang('azertyuiop'),
    rang('qsdfghjklm'),
    [act('maj', '⇧', 1.4), ...rang('wxcvbn'), ...[',', '.'].map(c => ({ ...car(c), maj: c === ',' ? '?' : '!' })), act('retour', '⌫', 1.4)],
    [act('symboles', '123 #+=', 1.8), act('accents', 'é è à', 1.4), act('gauche', '←'), act('espace', 'espace', 4.2), act('droite', '→'), act('entree', '↵', 1.6), act('fermer', '✕', 1.2)]
  ];
  const ACCENTS = [
    [...'éèêëàâùûüîïôöçœ'].map(c => car(c)),
    [...'ÉÈÊËÀÂÙÛÜÎÏÔÖÇŒ'].map(c => ({ ...car(c.toLowerCase()), car: c, maj: c, id: 'c:' + c, etiquette: c })),
    [...'«»“”‘’—–…°²€'].map(c => ({ ...car(c), maj: c })),
    [act('lettres', 'ABC', 1.8), act('gauche', '←'), act('espace', 'espace', 4.2), act('droite', '→'), act('retour', '⌫', 1.4), act('entree', '↵', 1.6), act('fermer', '✕', 1.2)]
  ];
  const SYMBOLES = [
    [...'1234567890'].map(c => ({ ...car(c), maj: c })),
    [...'@#€%&*+=/\\'].map(c => ({ ...car(c), maj: c })),
    [...'-_()[]{}<>'].map(c => ({ ...car(c), maj: c })),
    [act('lettres', 'ABC', 1.8), ...[...'.,:;!?"\'~|'].map(c => ({ ...car(c), maj: c })), act('retour', '⌫', 1.4)],
    [act('accents', 'é è à', 1.4), act('gauche', '←'), act('espace', 'espace', 4.2), act('droite', '→'), act('entree', '↵', 1.6), act('fermer', '✕', 1.2)]
  ];
  const DISPOSITIONS = { lettres: LETTRES, symboles: SYMBOLES, accents: ACCENTS };
  const toutes = () => Object.values(DISPOSITIONS).flat().flat();
  const toucheParId = id => toutes().find(t => t.id === id) || null;
  const caractere = (t, maj) => (t.type !== 'car' ? '' : maj ? t.maj : t.car);

  /* État du clavier : { mode: 'lettres' | 'symboles' | 'accents', maj: false | true, verrou: bool, dernierMaj: temps du dernier appui sur ⇧ } */
  const etatInitial = () => ({ mode: 'lettres', maj: false, verrou: false, dernierMaj: -1e9 });
  const borne = (n, a, b) => Math.max(a, Math.min(b, n));

  /* Applique une touche. champ : { valeur, debut, fin } (sélection), options : { multiligne, maxLength, t (horloge) }.
     Rend { champ: { valeur, debut, fin }, etat, evenement: null | 'entree' | 'fermer', insere: texte inséré ('' sinon), efface: bool } — jamais de mutation des arguments. */
  function appuyer(champ, etat, touche, { multiligne = false, maxLength = 0, t = 0 } = {}) {
    let { valeur, debut, fin } = champ; valeur = String(valeur == null ? '' : valeur); debut = borne(debut == null ? valeur.length : debut, 0, valeur.length); fin = borne(fin == null ? debut : fin, 0, valeur.length);
    if (fin < debut) [debut, fin] = [fin, debut];
    let e = { ...etat }, evenement = null, insere = '', efface = false;
    const inserer = txt => {
      if (maxLength > 0) { const place = maxLength - (valeur.length - (fin - debut)); if (place <= 0) return; txt = txt.slice(0, place); }
      valeur = valeur.slice(0, debut) + txt + valeur.slice(fin); debut = fin = debut + txt.length; insere += txt;
    };
    if (touche.type === 'car') { inserer(caractere(touche, e.maj)); if (e.maj && !e.verrou) e.maj = false; }
    else switch (touche.id) {
      case 'maj': if (t - e.dernierMaj < 700 && e.maj) { e.verrou = true; e.maj = true; } else if (e.maj) { e.maj = false; e.verrou = false; } else { e.maj = true; e.verrou = false; } e.dernierMaj = t; break;
      case 'retour': if (debut !== fin) { valeur = valeur.slice(0, debut) + valeur.slice(fin); fin = debut; efface = true; } else if (debut > 0) { const pre = [...valeur.slice(0, debut)]; const n = pre.length ? pre[pre.length - 1].length : 1; valeur = valeur.slice(0, debut - n) + valeur.slice(fin); debut = fin = debut - n; efface = true; } break;
      case 'espace': inserer(' '); if (e.maj && !e.verrou) e.maj = false; break;
      case 'gauche': if (debut !== fin) fin = debut; else { debut = fin = Math.max(0, debut - 1); } break;
      case 'droite': if (debut !== fin) debut = fin; else { debut = fin = Math.min(valeur.length, fin + 1); } break;
      case 'entree': if (multiligne) inserer('\n'); else evenement = 'entree'; break;
      case 'fermer': evenement = 'fermer'; break;
      case 'symboles': e.mode = 'symboles'; e.maj = false; e.verrou = false; break;
      case 'accents': e.mode = 'accents'; e.maj = false; e.verrou = false; break;
      case 'lettres': e.mode = 'lettres'; e.maj = false; e.verrou = false; break;
      default: break;
    }
    return { champ: { valeur, debut, fin }, etat: e, evenement, insere, efface };
  }

  /* Géométrie : largeur d'une rangée en « unités de touche » (somme des largeurs) ; sert à calculer les largeurs en % et à tester que toutes les rangées s'alignent. */
  const largeurRangee = r => r.reduce((s, k) => s + (k.largeur || 1), 0);
  /* Types de champ où le clavier a un sens (texte) ; les cases à cocher, boutons, curseurs, couleurs… n'en ont pas. */
  const TYPES_TEXTE = ['text', 'search', 'url', 'email', 'tel', 'password', 'number', ''];
  const estChampTexte = (tag, type, editable) => { tag = String(tag || '').toLowerCase(); if (editable) return true; if (tag === 'textarea') return true; return tag === 'input' && TYPES_TEXTE.includes(String(type || '').toLowerCase()); };
  /* Les types email et number n'exposent pas la sélection au script (selectionStart lève ou rend null) : on édite alors en fin de valeur. */
  const sansSelection = type => ['email', 'number'].includes(String(type || '').toLowerCase());

  racine.VRClavierCalcul = { DISPOSITIONS, etatInitial, appuyer, toucheParId, caractere, largeurRangee, estChampTexte, sansSelection, TYPES_TEXTE };
  if (typeof module !== 'undefined' && module.exports) module.exports = racine.VRClavierCalcul;
})(typeof globalThis !== 'undefined' ? globalThis : window);
