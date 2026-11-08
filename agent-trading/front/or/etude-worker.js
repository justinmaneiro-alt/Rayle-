/* Worker de l'étude des taux de réaction (zones-or.js) : le même calcul, hors du fil de l'interface (sinon ≈ 3 s de pause, une fois par jour). */
import { etudeReaction } from './zones-or.js';
self.onmessage = e => { try { const { m15, h1, a } = e.data; self.postMessage({ ok: true, etude: etudeReaction(m15, h1, a) }); } catch (x) { self.postMessage({ ok: false, erreur: x.message }); } };
