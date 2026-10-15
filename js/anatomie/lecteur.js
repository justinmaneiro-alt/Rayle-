/* ═════════════ LECTEUR DE PRÉSENTATIONS ANIMÉES ═════════════
   Joue un script (presentation.js) : pour chaque étape, l'adaptateur de la scène (corps ou cerveau) cadre la caméra, isole les structures, fait apparaître les étiquettes ;
   Raylé dit les phrases une par une (sous-titres synchronisés) ; barre tactile : précédent · pause/reprise · suivant · passer la phrase · vitesse · plein écran · fermer.
   Le lecteur ne connaît ni three.js ni le registre : tout passe par l'adaptateur { appliquer(etape, ctx), etiquette(etape, lab, i, ctx), retirerEtiquettes(), nettoyer() }.
   Voix : services du bus « anatomie:narrer » (promesse résolue à la fin de la phrase), « anatomie:silence », « anatomie:vitesse-voix » ; sans voix, la durée des sous-titres suit la longueur du texte. */
import { h } from './outils.js?v=2026.10.15.6';

export const VITESSES = [0.75, 1, 1.25, 1.5, 2];
const attente = ms => new Promise(r => setTimeout(r, Math.max(0, ms)));
const bus = (nom, arg) => { try { return window.RayleBus ? RayleBus.demander(nom, arg) : null; } catch (e) { return null; } };
const ICONES = { precedent: '⏮', suivant: '⏭', pause: '⏸', lecture: '▶', phrase: '⏩', plein: '⛶', fermer: '✕', rejouer: '↺' };

export class Lecteur {
  /** opts : { conteneur (élément où se superposent les commandes), racine (élément passé en plein écran), script, adaptateur, surFermer, dire, taire, sansVoix, vitesse } */
  constructor(opts) {
    this.o = opts; this.script = opts.script; this.etapes = opts.script.etapes; this.ad = opts.adaptateur;
    this.i = 0; this.k = 0; this.etat = 'arret'; this.jeton = 0; this.vitesse = opts.vitesse || 1; this.entreeFaite = false; this.ferme = false;
    this.dire = opts.dire || (t => bus('anatomie:narrer', t)); this.taire = opts.taire || (() => bus('anatomie:silence'));
    this.monter();
  }
  monter() {
    const O = this.o; this.dom = {};
    this.dom.titre = h('div', { class: 'pr-titre', 'aria-live': 'polite' });
    this.dom.etape = h('div', { class: 'pr-etape' });
    this.dom.source = h('div', { class: 'pr-source' });
    this.dom.sous = h('div', { class: 'pr-soustitre', role: 'status', 'aria-live': 'polite' });
    this.dom.prog = h('div', { class: 'pr-progres', title: 'Progression', onclick: ev => { const r = ev.currentTarget.getBoundingClientRect(); this.aller(Math.floor((ev.clientX - r.left) / r.width * this.etapes.length)); } }, this.dom.barre = h('i'));
    const bouton = (cle, titre, fn, extra = '') => h('button', { type: 'button', class: 'pr-btn ' + extra, title: titre, 'aria-label': titre, onclick: fn }, ICONES[cle]);
    this.btn = {
      precedent: bouton('precedent', 'Étape précédente', () => this.precedent()),
      pause: bouton('pause', 'Pause / reprise', () => this.basculer()),
      suivant: bouton('suivant', 'Étape suivante', () => this.suivant()),
      phrase: bouton('phrase', 'Passer cette phrase', () => this.passerPhrase()),
      vitesse: h('button', { type: 'button', class: 'pr-btn pr-vitesse', title: 'Vitesse', 'aria-label': 'Vitesse', onclick: () => this.changerVitesse() }, '1×'),
      plein: bouton('plein', 'Plein écran', () => this.pleinEcran()),
      fermer: bouton('fermer', 'Fermer la présentation', () => this.fermer())
    };
    this.dom.barre2 = h('div', { class: 'pr-barre', role: 'toolbar', 'aria-label': 'Commandes de la présentation' }, this.btn.precedent, this.btn.pause, this.btn.suivant, this.btn.phrase, this.dom.prog, this.btn.vitesse, this.btn.plein, this.btn.fermer);
    this.dom.racine = h('div', { class: 'pr-lecteur' }, this.dom.titre, this.dom.etape, this.dom.source, this.dom.sous, this.dom.barre2);
    O.conteneur.appendChild(this.dom.racine);
    this.clavier = ev => {
      if (this.ferme || /^(INPUT|TEXTAREA|SELECT)$/.test((ev.target && ev.target.tagName) || '')) return;
      if (ev.key === ' ') { ev.preventDefault(); this.basculer(); } else if (ev.key === 'ArrowRight') this.suivant(); else if (ev.key === 'ArrowLeft') this.precedent(); else if (ev.key === 'Escape') this.fermer();
    };
    document.addEventListener('keydown', this.clavier);
    this.chgPlein = () => { if (!document.fullscreenElement && this.o.racine) this.o.racine.classList.remove('pr-plein'); };
    document.addEventListener('fullscreenchange', this.chgPlein);
  }

  // ───────────────────────── commandes ─────────────────────────
  demarrer() { if (this.ferme) return; this.i = 0; this.k = 0; this.entreeFaite = false; this.jouer(); }
  basculer() { if (this.etat === 'lecture') this.pause(); else this.reprendre(); }
  pause() { if (this.etat !== 'lecture') return; this.etat = 'pause'; this.jeton++; this.taire(); this.majBoutons(); }
  reprendre() { if (this.etat === 'fini') { this.demarrer(); return; } if (this.etat === 'lecture') return; this.jouer(); }
  aller(i) { this.jeton++; this.taire(); this.i = Math.max(0, Math.min(this.etapes.length - 1, i)); this.k = 0; this.entreeFaite = false; if (this.etat !== 'pause') this.jouer(); else { this.afficherEtape(); this.etat = 'pause'; this.entrerSansLire(); } }
  suivant() { this.aller(this.i + 1); }
  precedent() { this.aller(this.k > 0 || this.entreeFaite && this.i === 0 ? this.i : this.i - 1); }
  passerPhrase() {
    if (this.etat !== 'lecture') return; const e = this.etapes[this.i];
    this.jeton++; this.taire(); this.k++;
    if (this.k >= e.phrases.length) { this.i++; this.k = 0; this.entreeFaite = false; }
    if (this.i >= this.etapes.length) { this.i = this.etapes.length - 1; this.k = Math.max(0, this.etapes[this.i].phrases.length - 1); }
    this.jouer();
  }
  changerVitesse() {
    const j = (VITESSES.indexOf(this.vitesse) + 1) % VITESSES.length; this.vitesse = VITESSES[j];
    this.btn.vitesse.textContent = (this.vitesse + '').replace('.', ',') + '×';
    bus('anatomie:vitesse-voix', Math.round((this.vitesse - 1) * 28));       // 1,5× ≈ +14 % sur la voix de Raylé
    this.ad.vitesse && this.ad.vitesse(this.vitesse);
  }
  pleinEcran() {
    const r = this.o.racine; if (!r) return;
    if (document.fullscreenElement) { document.exitFullscreen && document.exitFullscreen().catch(() => { }); r.classList.remove('pr-plein'); return; }
    r.classList.add('pr-plein');
    try { const p = r.requestFullscreen ? r.requestFullscreen() : null; if (p && p.catch) p.catch(() => { }); } catch (e) { }
    setTimeout(() => this.ad.redimensionner && this.ad.redimensionner(), 300);
  }
  fermer() {
    if (this.ferme) return; this.ferme = true; this.jeton++; this.etat = 'arret'; this.taire(); bus('anatomie:vitesse-voix', 0);
    document.removeEventListener('keydown', this.clavier); document.removeEventListener('fullscreenchange', this.chgPlein);
    try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) { }
    if (this.o.racine) this.o.racine.classList.remove('pr-plein');
    try { this.ad.retirerEtiquettes && this.ad.retirerEtiquettes(); this.ad.nettoyer && this.ad.nettoyer(); } catch (e) { console.warn('[lecteur] nettoyage', e); }
    this.dom.racine.remove(); this.o.surFermer && this.o.surFermer(this);
  }

  // ───────────────────────── déroulement ─────────────────────────
  majBoutons() {
    this.btn.pause.textContent = this.etat === 'lecture' ? ICONES.pause : this.etat === 'fini' ? ICONES.rejouer : ICONES.lecture;
    this.btn.pause.classList.toggle('actif', this.etat !== 'lecture');
    const n = this.etapes.length, e = this.etapes[this.i];
    this.dom.barre.style.width = Math.round(((this.i + (e ? (this.k + 1) / Math.max(1, e.phrases.length) : 1)) / n) * 100) + '%';
    this.dom.etape.textContent = `${this.i + 1} / ${n}`;
  }
  afficherEtape() {
    const e = this.etapes[this.i]; if (!e) return;
    vide(this.dom.titre); this.dom.titre.append(e.titre || this.script.titre, h('small', null, e.sous || this.script.sous || ''));
    this.dom.titre.style.animation = 'none'; void this.dom.titre.offsetWidth; this.dom.titre.style.animation = '';
    this.dom.source.textContent = e.fin && e.references ? 'Sources : ' + e.references.join(' · ') : '';
    this.majBoutons();
  }
  async entrer(e, jeton) {
    this.afficherEtape(); this.dom.sous.textContent = '';
    try { this.ad.retirerEtiquettes && this.ad.retirerEtiquettes(); } catch (er) { }
    try {
      await Promise.race([this.ad.appliquer(e, { vitesse: this.vitesse, attente: txt => { if (jeton === this.jeton) this.dom.sous.textContent = txt; }, jeton: () => jeton === this.jeton }), attente(20000)]);
    } catch (er) { console.warn('[lecteur] scène', er); }
    this.entreeFaite = true;
  }
  async entrerSansLire() { const j = ++this.jeton; await this.entrer(this.etapes[this.i], j); }
  montrerPhrase(e, k) {
    const txt = e.phrases[k] || ''; this.dom.sous.textContent = ''; this.dom.sous.append(txt); this.dom.sous.style.animation = 'none'; void this.dom.sous.offsetWidth; this.dom.sous.style.animation = ''; this.majBoutons();
    (e.scene.etiquettes || []).filter(l => (l.phrase || 0) === k).forEach((l, n) => { try { this.ad.etiquette && this.ad.etiquette(e, l, n, { vitesse: this.vitesse }); } catch (er) { console.warn('[lecteur] étiquette', er); } });
  }
  async direPhrase(txt, jeton) {
    const t0 = Date.now();
    if (!this.o.sansVoix) {
      for (let n = 0; n < 60 && bus('anatomie:parle') && jeton === this.jeton; n++) await attente(150);      // Raylé finit d'abord sa phrase d'annonce
      if (jeton !== this.jeton) return;
      try { await Promise.race([Promise.resolve(this.dire(txt)), attente(45000)]); } catch (e) { }
    }
    if (jeton !== this.jeton) return;
    const mini = Math.max(1300, txt.length * 55) / this.vitesse, reste = mini - (Date.now() - t0);      // sans voix (ou voix très rapide) : le temps de lire le sous-titre
    if (reste > 0) await attente(reste);
  }
  async jouer() {
    if (this.ferme) return; const jeton = ++this.jeton; this.etat = 'lecture'; this.majBoutons();
    while (this.i < this.etapes.length) {
      const e = this.etapes[this.i];
      if (!this.entreeFaite) { await this.entrer(e, jeton); if (jeton !== this.jeton) return; await attente(250 / this.vitesse); if (jeton !== this.jeton) return; }
      for (; this.k < e.phrases.length; this.k++) {
        this.montrerPhrase(e, this.k);
        await this.direPhrase(e.phrases[this.k], jeton); if (jeton !== this.jeton) return;
        await attente(180 / this.vitesse); if (jeton !== this.jeton) return;
      }
      if (this.i >= this.etapes.length - 1) break;
      await attente(450 / this.vitesse); if (jeton !== this.jeton) return;
      this.i++; this.k = 0; this.entreeFaite = false;
    }
    if (jeton !== this.jeton) return;
    this.etat = 'fini'; this.majBoutons(); this.dom.barre.style.width = '100%';
    this.o.surFin && this.o.surFin(this);
  }
}
function vide(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
