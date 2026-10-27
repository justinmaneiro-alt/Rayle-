// Précharge (node --import) : force le thème Jarvis dans les anciens tests Chrome de l'accueil (le thème par défaut est maintenant Aurore).
import { Page } from 'puppeteer-core';
const goto = Page.prototype.goto;
Page.prototype.goto = async function (...a) {
  if (!this.__themeJarvis) { this.__themeJarvis = true; await this.evaluateOnNewDocument(anc => { try { if (!localStorage.getItem('rayle_theme')) localStorage.setItem('rayle_theme', 'jarvis'); if (anc) localStorage.setItem('rayle_mars_ancien_espace', '1'); } catch (e) {} }, !!process.env.ANCIEN_ESPACE); }
  return goto.apply(this, a);
};
