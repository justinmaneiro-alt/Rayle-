/* ═════════════ VR : transformer un élément de la page en image (texture d'un panneau 3D) ═════════════
   Le navigateur ne sait pas copier directement un élément HTML dans une texture. On le clone avec ses styles calculés, on le met dans un SVG « foreignObject », puis on dessine ce SVG sur un canevas.
   Limites assumées : pas de polices web personnalisées ni de flous d'arrière-plan (backdrop-filter) ; les <canvas> et les images de même origine sont recopiés ; les iframes et scripts sont retirés ;
   au-delà de 2 500 nœuds l'élément n'est pas rastérisé (trop lourd pour un casque). Aucune donnée ne quitte la page : tout reste dans des images en mémoire. */
const PROPRIETES = ['display', 'position', 'top', 'left', 'right', 'bottom', 'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height', 'box-sizing', 'margin', 'padding', 'border', 'border-radius', 'border-width', 'border-style', 'border-color',
  'border-top', 'border-right', 'border-bottom', 'border-left', 'outline', 'background', 'background-color', 'background-image', 'background-size', 'background-position', 'background-repeat', 'color', 'opacity', 'visibility', 'overflow', 'overflow-x', 'overflow-y',
  'font-family', 'font-size', 'font-weight', 'font-style', 'font-variant', 'line-height', 'letter-spacing', 'text-align', 'text-transform', 'text-decoration', 'text-overflow', 'white-space', 'word-break', 'overflow-wrap', 'vertical-align', 'list-style',
  'flex', 'flex-direction', 'flex-wrap', 'flex-grow', 'flex-shrink', 'flex-basis', 'align-items', 'align-content', 'align-self', 'justify-content', 'justify-self', 'justify-items', 'gap', 'row-gap', 'column-gap', 'order',
  'grid-template-columns', 'grid-template-rows', 'grid-column', 'grid-row', 'grid-auto-flow', 'grid-auto-columns', 'grid-auto-rows', 'box-shadow', 'text-shadow', 'z-index', 'clip-path', 'fill', 'stroke', 'stroke-width', 'cursor', 'table-layout', 'border-collapse', 'border-spacing'];
const NS = 'http://www.w3.org/1999/xhtml', MAX_NOEUDS = 2500;

function copierStyles(source, cible) {
  const cs = getComputedStyle(source); let css = '';
  for (const p of PROPRIETES) { const v = cs.getPropertyValue(p); if (v) css += p + ':' + v + ';'; }
  cible.setAttribute('style', css);
}
function enImage(src) { return new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; }); }

/* Dessine `el` dans `canvas` (qui prend la taille voulue). Rend { ok, noeuds, raison }. `fond` : couleur posée derrière (les fenêtres sont en verre transparent). */
export async function rasteriser(el, canvas, { largeurMax = 1024, fond = 'rgba(6,10,16,0.94)' } = {}) {
  if (!el || !el.isConnected) return { ok: false, raison: 'élément absent' };
  const r = el.getBoundingClientRect(), w = Math.ceil(r.width), h = Math.ceil(r.height);
  if (w < 4 || h < 4) return { ok: false, raison: 'élément trop petit ou masqué' };
  const origine = [el, ...el.querySelectorAll('*')]; if (origine.length > MAX_NOEUDS) return { ok: false, raison: 'trop de nœuds (' + origine.length + ')' };
  const clone = el.cloneNode(true), copie = [clone, ...clone.querySelectorAll('*')];
  const aRemplacer = [];
  for (let i = 0; i < origine.length; i++) {
    const o = origine[i], c = copie[i];
    if (!(o instanceof Element) || !c) continue;
    if (/^(SCRIPT|IFRAME|OBJECT|EMBED|VIDEO|AUDIO)$/i.test(o.tagName)) { aRemplacer.push([c, null]); continue; }
    copierStyles(o, c);
    if (o.tagName === 'CANVAS') { let d = null; try { d = o.toDataURL('image/png'); } catch (e) { /* toile « salie » : laissée vide */ } aRemplacer.push([c, d, o.getBoundingClientRect()]); continue; }
    if (o.tagName === 'IMG' && o.complete && o.naturalWidth) { try { const t = document.createElement('canvas'); t.width = o.naturalWidth; t.height = o.naturalHeight; t.getContext('2d').drawImage(o, 0, 0); c.setAttribute('src', t.toDataURL('image/png')); } catch (e) { c.removeAttribute('src'); } }
    if (o.tagName === 'INPUT' || o.tagName === 'TEXTAREA' || o.tagName === 'SELECT') { if (o.tagName === 'TEXTAREA') c.textContent = o.value; else c.setAttribute('value', o.value); if (o.checked) c.setAttribute('checked', 'checked'); }
    c.removeAttribute('id'); c.removeAttribute('onclick');
  }
  for (const [c, d, rect] of aRemplacer) {
    if (!d) { c.remove(); continue; }
    const im = document.createElementNS(NS, 'img'); im.setAttribute('src', d); im.setAttribute('style', 'display:block;width:' + Math.round(rect.width) + 'px;height:' + Math.round(rect.height) + 'px;'); c.replaceWith(im);
  }
  // la racine : posée en (0,0), sans décalage ni transformation de la page
  clone.setAttribute('xmlns', NS);
  clone.style.cssText += ';position:relative;left:0;top:0;right:auto;bottom:auto;margin:0;transform:none;opacity:1;visibility:visible;animation:none;transition:none;width:' + w + 'px;height:' + h + 'px;box-sizing:border-box;';   // une fenêtre qui s'ouvre est encore à opacité 0 : le panneau, lui, doit toujours être visible
  const xml = new XMLSerializer().serializeToString(clone);
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '"><foreignObject x="0" y="0" width="100%" height="100%">' + xml + '</foreignObject></svg>';
  const image = await enImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
  if (!image) return { ok: false, raison: 'le navigateur n’a pas pu dessiner cet élément' };
  const k = Math.min(1, largeurMax / w), cw = Math.max(2, Math.round(w * k)), ch = Math.max(2, Math.round(h * k));
  if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
  const g = canvas.getContext('2d'); g.clearRect(0, 0, cw, ch); if (fond) { g.fillStyle = fond; g.fillRect(0, 0, cw, ch); } g.drawImage(image, 0, 0, cw, ch);
  return { ok: true, noeuds: origine.length, largeur: cw, hauteur: ch };
}

/* Élément le plus profond du sous-arbre de `racine` qui contient le point de la page (x, y) (les éléments « pointer-events: none » sont ignorés). Sert à envoyer le clic au bon bouton. */
export function cibleDans(racine, x, y) {
  let meilleur = racine, prof = 0;
  const parcourir = (n, p) => {
    for (const e of n.children) {
      const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || cs.pointerEvents === 'none') continue;
      const r = e.getBoundingClientRect(); if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom && r.width > 0 && r.height > 0) { if (p + 1 >= prof) { meilleur = e; prof = p + 1; } parcourir(e, p + 1); }
    }
  };
  parcourir(racine, 0); return meilleur;
}
/* Envoie un clic (appui, relâchement, clic) à l'élément visé, comme le ferait une souris posée à cet endroit. */
export function cliquerSur(cible, x, y) {
  const base = { bubbles: true, cancelable: true, composed: true, view: window, clientX: x, clientY: y, screenX: x, screenY: y, button: 0, detail: 1 };
  const p = (type, extra) => { try { cible.dispatchEvent(new PointerEvent(type, { ...base, pointerId: 9002, pointerType: 'mouse', isPrimary: true, ...extra })); } catch (e) { /* PointerEvent absent */ } };
  const m = (type, extra) => cible.dispatchEvent(new MouseEvent(type, { ...base, ...extra }));
  p('pointerover'); m('mouseover'); p('pointermove'); m('mousemove');
  p('pointerdown', { buttons: 1 }); m('mousedown', { buttons: 1 });
  const f = cible.closest && cible.closest('input,textarea,select,[contenteditable="true"],button,a'); if (f && f.focus) { try { f.focus(); } catch (e) { /* non focalisable */ } }
  p('pointerup', { buttons: 0 }); m('mouseup', { buttons: 0 }); m('click', { buttons: 0 });
  return cible;
}
export function rouler(cible, x, y, dx, dy) {
  let e = cible, pris = false;
  try { pris = !cible.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, composed: true, view: window, clientX: x, clientY: y, deltaX: dx, deltaY: dy, deltaMode: 0 })); } catch (x2) { /* WheelEvent absent */ }
  while (!pris && e && e !== document.documentElement) { const s = getComputedStyle(e); if ((/auto|scroll/.test(s.overflowY) && e.scrollHeight > e.clientHeight) || (/auto|scroll/.test(s.overflowX) && e.scrollWidth > e.clientWidth)) { e.scrollBy(dx, dy); break; } e = e.parentElement; }
}
