/* Petits outils communs à la fenêtre et au pop-up : DOM, chargement de three.js */
export const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js';
let promesseThree = null;
/** three.js, chargé une seule fois (même instance que les fonds 3D quand UI.three existe) */
export function chargerTHREE() {
  if (!promesseThree) promesseThree = (window.RayleUI && window.RayleUI.three ? window.RayleUI.three() : import(THREE_URL)).catch(e => { promesseThree = null; throw e; });
  return promesseThree;
}
export function webglDisponible() {
  try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch (e) { return false; }
}
/** h('div', {class:'x', onclick:fn}, enfants…) */
export function h(tag, attrs, ...enfants) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'textContent') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  enfants.flat(9).forEach(c => { if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c))); });
  return el;
}
export const vider = el => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
export const cm = m => Math.round(m * 1000) / 10;   // mètres → centimètres (1 décimale)
