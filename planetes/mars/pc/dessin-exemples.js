import * as X from './exemples.js';

/* ═════════════ DESSIN DES FENÊTRES D'EXEMPLE (canvas 2D + HTML) ═════════════
   Deux usages : l'aperçu gravé sur la fenêtre holographique flottante (petite toile) et le contenu de la grande fenêtre ouverte par un clic.
   Tout est factice (exemples.js) et porte le marqueur EXEMPLE, y compris sur chaque dessin. */
const CYAN = '#8fd0e3', VERT = '#2fd18b', ROUGE = '#ff5d6e', AMBRE = '#e9a23b', TEXTE = '#d6e4ea';

function bougiesDe(def) { const ins = X.INSTRUMENTS.find(i => i.id === def.instrument) || X.INSTRUMENTS[0]; return { ins, b: X.bougies(def.graine || 1, 60, ins.ancre, ins.pas) }; }

/* Bougies + moyennes mobiles dans le rectangle (x, y, w, h). options : { ema, ma, grille } */
export function dessinerBougies(ctx, x, y, w, h, bougies, o = {}) {
  const hauts = bougies.map(b => b.h), bas = bougies.map(b => b.l), max = Math.max(...hauts), min = Math.min(...bas), pas = w / bougies.length, py = v => y + h - (v - min) / (max - min || 1) * h;
  if (o.grille !== false) { ctx.strokeStyle = 'rgba(143,208,227,0.14)'; ctx.lineWidth = 1; for (let i = 0; i <= 4; i++) { const yy = y + h * i / 4; ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + w, yy); ctx.stroke(); } }
  bougies.forEach((b, i) => {
    const cx = x + (i + 0.5) * pas, haus = b.c >= b.o; ctx.strokeStyle = ctx.fillStyle = haus ? VERT : ROUGE; ctx.lineWidth = Math.max(1, pas * 0.12);
    ctx.beginPath(); ctx.moveTo(cx, py(b.h)); ctx.lineTo(cx, py(b.l)); ctx.stroke();
    const top = py(Math.max(b.o, b.c)), bot = py(Math.min(b.o, b.c)); ctx.fillRect(cx - pas * 0.32, top, pas * 0.64, Math.max(1.5, bot - top));
  });
  const ligne = (serie, couleur) => { ctx.strokeStyle = couleur; ctx.lineWidth = Math.max(1.5, pas * 0.18); ctx.beginPath(); let debut = false; serie.forEach((v, i) => { if (v === null) return; const cx = x + (i + 0.5) * pas; if (!debut) { ctx.moveTo(cx, py(v)); debut = true; } else ctx.lineTo(cx, py(v)); }); ctx.stroke(); };
  const cl = bougies.map(b => b.c);
  if (o.ema !== false) ligne(X.moyenneExp(cl, 20), AMBRE);
  if (o.ma !== false) ligne(X.moyenneSimple(cl, 50 > cl.length ? 30 : 30), CYAN);
  return { min, max };
}
export function dessinerCourbe(ctx, x, y, w, h, serie, couleur = CYAN) {
  const max = Math.max(...serie), min = Math.min(...serie), px = i => x + i / (serie.length - 1) * w, py = v => y + h - (v - min) / (max - min || 1) * h;
  const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, 'rgba(143,208,227,0.35)'); g.addColorStop(1, 'rgba(143,208,227,0)');
  ctx.beginPath(); ctx.moveTo(px(0), y + h); serie.forEach((v, i) => ctx.lineTo(px(i), py(v))); ctx.lineTo(px(serie.length - 1), y + h); ctx.closePath(); ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = couleur; ctx.lineWidth = 2.4; ctx.beginPath(); serie.forEach((v, i) => (i ? ctx.lineTo(px(i), py(v)) : ctx.moveTo(px(i), py(v)))); ctx.stroke();
}

/* ── Aperçu de la fenêtre flottante (toile 640 × 400) ──
   def.reel = la fenêtre montre de VRAIES données du Worker : `reel` = { etat:'chargement'|'ok'|'indisponible', bougies?, meta?, volume?, cotations?, erreur?, unite? } ;
   badge « RÉEL » (vert) ; sans donnée : « ATTENTE » ou « INDISPO » (jamais un faux graphique). Sinon c'est un exemple : badge EXEMPLE (ambre), filigrane, données factices. */
const VERT_BADGE = '#2fd18b';
const heure = t => { try { return new Date(t).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', hour12: false }).replace(',', ''); } catch (e) { return ''; } };
export function dessinerFenetreFlottante(ctx, def, survol = false, reel = null) {
  /* Toile logique 640 × 400 ; la toile réelle peut être plus grande (×2 : texte net en haute résolution), le dessin garde ses coordonnées. */
  const E = ctx.canvas.width / 640, w = 640, h = 400, vrai = !!def.reel;
  ctx.setTransform(E, 0, 0, E, 0, 0); ctx.clearRect(0, 0, w, h); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  const coupe = 14;                                         // coins coupés : le cadre est un polygone fin de 1 px
  const cadre = (m = 3) => { ctx.beginPath(); ctx.moveTo(m, m); ctx.lineTo(w - m - coupe, m); ctx.lineTo(w - m, m + coupe); ctx.lineTo(w - m, h - m); ctx.lineTo(m + coupe, h - m); ctx.lineTo(m, h - m - coupe); ctx.closePath(); };
  cadre(); const fond = ctx.createLinearGradient(0, 0, 0, h); fond.addColorStop(0, 'rgba(12,22,32,0.94)'); fond.addColorStop(1, 'rgba(5,9,14,0.96)');
  ctx.fillStyle = fond; ctx.fill();
  ctx.strokeStyle = survol ? 'rgba(255,255,255,0.85)' : 'rgba(143,208,227,0.5)'; ctx.lineWidth = survol ? 2.2 : 1.4; ctx.stroke();
  ctx.strokeStyle = 'rgba(143,208,227,0.9)'; ctx.lineWidth = 2; for (const [cx, cy, dx, dy] of [[3, 3, 1, 1], [w - 3, h - 3, -1, -1]]) { ctx.beginPath(); ctx.moveTo(cx + dx * 22, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy + dy * 22); ctx.stroke(); }
  ctx.fillStyle = 'rgba(143,208,227,0.07)'; ctx.fillRect(4, 4, w - 8 - coupe, 52); ctx.fillStyle = 'rgba(143,208,227,0.3)'; ctx.fillRect(4, 56, w - 8, 1);
  const titre = vrai && def.type === 'bougies' && reel && reel.unite ? def.titre + ' · ' + reel.unite : def.titre;
  ctx.fillStyle = '#e6eef2'; ctx.font = '600 25px "Segoe UI Variable","Segoe UI",system-ui,sans-serif'; ctx.fillText(titre.toUpperCase().split('').join(String.fromCharCode(8202)), 22, 31, w - 230);
  // pastille d'état : RÉEL (direct), DIFFÉRÉ (publication retardée par nature), PÉRIMÉ (ancienne copie), INDISPO (panne) ; les fenêtres du hub Finance donnent leur propre `etiquette`
  const etat = vrai ? (!reel || reel.etat === 'chargement' ? 'ATTENTE' : reel.etat === 'indisponible' ? 'INDISPO' : (reel.etiquette || 'RÉEL')) : X.MARQUEUR;
  const couleur = vrai ? ({ 'RÉEL': VERT_BADGE, 'DIFFÉRÉ': CYAN, 'PÉRIMÉ': AMBRE, 'INDISPO': ROUGE, 'SIMULÉ': '#c9b27a', 'BACKTEST': '#9db0bb', 'ESTIMÉ': AMBRE, 'MIXTE': CYAN }[etat] || '#9db0bb') : '#c9b27a';
  ctx.font = '600 17px "Segoe UI Variable","Segoe UI",system-ui,sans-serif'; const lp = ctx.measureText(etat).width + 36, xp = w - 22 - coupe - lp + 6;
  ctx.strokeStyle = couleur; ctx.globalAlpha = 0.55; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.roundRect(xp, 14, lp, 28, 14); ctx.stroke(); ctx.globalAlpha = 1;
  ctx.fillStyle = couleur; ctx.beginPath(); ctx.arc(xp + 15, 28, 4, 0, 6.2832); ctx.fill(); ctx.textAlign = 'left'; ctx.fillText(etat, xp + 26, 29);
  const zx = 30, zy = 96, zw = w - 60, zh = h - 150;
  let pied = 'données factices · cliquer pour ouvrir';
  if (vrai) {
    if (!reel || reel.etat === 'chargement') { ctx.fillStyle = TEXTE; ctx.font = '30px ui-monospace, Consolas, monospace'; ctx.textAlign = 'center'; ctx.fillText('Chargement des données…', w / 2, zy + zh / 2); ctx.textAlign = 'left'; pied = 'en attente du Worker · cliquer pour ouvrir'; }
    else if (reel.etat === 'indisponible') { ctx.fillStyle = '#ffb3bc'; ctx.font = '26px ui-monospace, Consolas, monospace'; ctx.textAlign = 'center'; const t = 'INDISPONIBLE : ' + String(reel.erreur || 'pas de réponse'); ctx.fillText(t.slice(0, 44), w / 2, zy + zh / 2 - 16, zw); ctx.fillText(t.slice(44, 88), w / 2, zy + zh / 2 + 22, zw); ctx.textAlign = 'left'; pied = 'aucune donnée inventée · cliquer pour ouvrir'; }
    else if (reel.etat === 'bientot') { ctx.fillStyle = TEXTE; ctx.font = '28px ui-monospace, Consolas, monospace'; ctx.textAlign = 'center'; ctx.fillText('En préparation', w / 2, zy + zh / 2 - 14); ctx.font = '22px ui-monospace, Consolas, monospace'; ctx.fillStyle = '#9bc4d6'; ctx.fillText(String(reel.message || 'aucun chiffre tant que la donnée n’est pas branchée').slice(0, 52), w / 2, zy + zh / 2 + 26, zw); ctx.textAlign = 'left'; pied = 'aucune donnée inventée · cliquer pour ouvrir'; }
    else if (reel.jauges) {                                  // M6 : jauges horizontales { nom, texte, part (0..1), couleur } (gardien prop)
      ctx.font = '23px ui-monospace, Consolas, monospace';
      reel.jauges.slice(0, 3).forEach((j, i) => {
        const yy = zy + 8 + i * 82; ctx.fillStyle = '#8fb2c3'; ctx.textAlign = 'left'; ctx.fillText(j.nom, zx, yy + 12); ctx.fillStyle = TEXTE; ctx.textAlign = 'right'; ctx.fillText(j.texte, zx + zw, yy + 12);
        ctx.fillStyle = 'rgba(255,255,255,0.09)'; ctx.fillRect(zx, yy + 26, zw, 20); const p = Math.max(0, Math.min(1, j.part || 0)); ctx.fillStyle = j.couleur === 'ko' ? ROUGE : j.couleur === 'warn' ? AMBRE : j.couleur === 'info' ? CYAN : VERT; ctx.fillRect(zx, yy + 26, zw * p, 20); ctx.strokeStyle = CYAN; ctx.lineWidth = 1.5; ctx.strokeRect(zx, yy + 26, zw, 20);
      });
      ctx.textAlign = 'left'; pied = (reel.pied || '') + ' · cliquer pour ouvrir';
    }
    else if (reel.courbes) {                                 // M6 : courbes de capital en R { nom, valeurs, couleur } (performance des stratégies : BACKTEST hors échantillon et SIMULÉ en direct)
      const tout = reel.courbes.flatMap(c => c.valeurs), max = Math.max(1, ...tout), min = Math.min(0, ...tout), py = v => zy + zh - 34 - (v - min) / (max - min || 1) * (zh - 60);
      ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(zx, py(0)); ctx.lineTo(zx + zw, py(0)); ctx.stroke();
      reel.courbes.slice(0, 4).forEach((c, k) => { const col = [CYAN, VERT, AMBRE, '#b78cff'][k]; ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.beginPath(); c.valeurs.forEach((v, i) => { const x = zx + i / Math.max(1, c.valeurs.length - 1) * zw; if (i) ctx.lineTo(x, py(v)); else ctx.moveTo(x, py(v)); }); ctx.stroke(); ctx.fillStyle = col; ctx.font = '20px ui-monospace, Consolas, monospace'; ctx.textAlign = 'left'; ctx.fillText(String(c.nom).slice(0, 26) + ' ' + (c.fin >= 0 ? '+' : '') + c.fin.toFixed(1) + ' R', zx + 4 + (k % 2) * zw / 2, zy + zh - 8 - Math.floor(k / 2) * 0); });
      pied = (reel.pied || '') + ' · cliquer pour ouvrir';
    }
    else if (reel.liste) {                                   // hub Finance : lignes { g, d, c } (gauche, droite, couleur), en-tête et pied fournis par la donnée
      ctx.font = '24px ui-monospace, Consolas, monospace'; ctx.textAlign = 'left';
      if (reel.entete) { ctx.fillStyle = AMBRE; ctx.font = '21px ui-monospace, Consolas, monospace'; ctx.fillText(String(reel.entete).slice(0, 56), zx, zy + 4); ctx.font = '24px ui-monospace, Consolas, monospace'; }
      const y0 = zy + (reel.entete ? 38 : 16), pas = reel.entete ? 44 : 50;
      reel.liste.slice(0, 5).forEach((l, i) => { const yy = y0 + i * pas; ctx.textAlign = 'left'; ctx.fillStyle = l.c || TEXTE; ctx.fillText(String(l.g).slice(0, l.d ? 26 : 44), zx, yy, l.d ? zw * 0.62 : zw); if (l.d) { ctx.fillStyle = l.cd || '#fff'; ctx.textAlign = 'right'; ctx.fillText(String(l.d).slice(0, 22), zx + zw, yy, zw * 0.4); ctx.textAlign = 'left'; } });
      if (!reel.liste.length) { ctx.fillStyle = '#9bc4d6'; ctx.textAlign = 'center'; ctx.fillText(reel.vide || 'Aucun élément', w / 2, zy + zh / 2); ctx.textAlign = 'left'; }
      pied = (reel.pied || '') + ' · cliquer pour ouvrir';
    }
    else if (def.type === 'agent' && reel.agent) {
      const A = reel.agent; ctx.font = '25px ui-monospace, Consolas, monospace';
      const L = [['Phase', A.phase || '—', A.phaseCode === 1 ? VERT : A.phaseCode === 2 ? ROUGE : TEXTE], ['Volume', A.volume || '—', TEXTE], ['Stratégie', A.strategie || '—', A.strategieCouleur === 'ok' ? VERT : A.strategieCouleur === 'ko' ? ROUGE : TEXTE], ['Setup', A.setup || '—', A.setupCouleur === 'entree' ? VERT : A.setupCouleur === 'prep' ? AMBRE : TEXTE], ['Compte simulé', A.compte || '—', TEXTE]];
      L.forEach(([k, val, col], i) => { const yy = zy + 14 + i * 46; ctx.fillStyle = '#8fb2c3'; ctx.textAlign = 'left'; ctx.fillText(k, zx, yy); ctx.fillStyle = col; ctx.textAlign = 'right'; ctx.fillText(String(val).slice(0, 30), zx + zw, yy, zw * 0.68); ctx.textAlign = 'left'; });
      pied = (A.source || 'Binance') + ' · ' + (A.heure || '—') + ' · aucune position réelle';
    }
    else if (def.type === 'dashboard') {
      const cols = reel.colonnes || [], lib = ['Tendance', 'RSI 14', 'Support', 'Résist.', 'Score'], noms = ['M15', 'H1', 'H4', 'D1'];
      ctx.font = 'bold 22px ui-monospace, Consolas, monospace'; ctx.fillStyle = AMBRE; ctx.textAlign = 'right'; noms.forEach((n, i) => ctx.fillText(n, zx + 170 + (i + 1) * ((zw - 170) / 4.2), zy + 6)); ctx.textAlign = 'left';
      ctx.font = '22px ui-monospace, Consolas, monospace';
      lib.forEach((l, r) => { const yy = zy + 38 + r * 43; ctx.fillStyle = '#8fb2c3'; ctx.fillText(l, zx, yy); cols.forEach((c, i) => { const x = zx + 170 + (i + 1) * ((zw - 170) / 4.2); let t = '—', col = TEXTE; if (c && c.dispo) { if (r === 0 && c.bull != null) { t = c.bull ? '▲' : '▼'; col = c.bull ? VERT : ROUGE; } else if (r === 1 && c.rsi != null) t = c.rsi.toFixed(0); else if (r === 2 && c.support != null) { t = c.support.toFixed(c.support > 1000 ? 0 : 2); col = VERT; } else if (r === 3 && c.resistance != null) { t = c.resistance.toFixed(c.resistance > 1000 ? 0 : 2); col = ROUGE; } else if (r === 4 && c.score != null) { t = String(c.score); col = c.score >= 50 ? VERT : ROUGE; } } ctx.fillStyle = col; ctx.textAlign = 'right'; ctx.fillText(t, x, yy); ctx.textAlign = 'left'; }); });
      pied = (reel.instrument || '') + ' · ' + (reel.source || 'source ?') + (reel.perime ? ' · PÉRIMÉ' : '') + ' · calculé dans le navigateur';
    } else if (def.type === 'contexte') {
      ctx.font = '26px ui-monospace, Consolas, monospace';
      (reel.lignes || []).slice(0, 5).forEach((l, i) => { const yy = zy + 20 + i * 52; ctx.fillStyle = TEXTE; ctx.fillText(l.label, zx, yy, zw * 0.5); ctx.fillStyle = '#fff'; ctx.textAlign = 'right'; ctx.fillText(l.prix == null ? '—' : l.prix.toLocaleString('fr-FR', { maximumFractionDigits: 2 }), zx + zw * 0.7, yy); ctx.fillStyle = l.variation == null ? TEXTE : l.variation >= 0 ? VERT : ROUGE; ctx.fillText(l.variation == null ? '—' : (l.variation > 0 ? '+' : '') + l.variation.toFixed(2) + ' %', zx + zw, yy); ctx.textAlign = 'left'; });
      pied = (reel.sources || 'Worker') + ' · DIFFÉRÉ' + (reel.perime ? ' · ANCIENNE COPIE' : '') + ' · cliquer pour ouvrir';
    }
    else if (def.type === 'bougies') {
      const b = reel.bougies.slice(-60); dessinerBougies(ctx, zx, zy, zw, zh, b, { ema: false, ma: false });
      const c = reel.bougies.map(x => x.c), dernier = c[c.length - 1], prec = c[c.length - 2];
      ctx.fillStyle = dernier >= prec ? VERT : ROUGE; ctx.font = 'bold 30px ui-monospace, Consolas, monospace'; ctx.textAlign = 'right'; ctx.fillText(dernier.toFixed(dernier >= 1000 ? 1 : 2), zx + zw, zy + 22); ctx.textAlign = 'left';
      pied = (reel.meta ? reel.meta.source + (reel.meta.differe ? ' · différé' : '') + (reel.meta.secours ? ' · SECOURS' : '') + (reel.meta.perime ? ' · PÉRIMÉ' : '') : '') + ' · ' + heure(reel.bougies[reel.bougies.length - 1].t);
    } else if (def.type === 'marche') {
      ctx.font = '27px ui-monospace, Consolas, monospace';
      (reel.cotations || []).slice(0, 5).forEach((q, i) => { const yy = zy + 20 + i * 52; ctx.fillStyle = TEXTE; ctx.fillText(q.nom, zx, yy); if (q.vide) { ctx.fillStyle = '#ffb3bc'; ctx.textAlign = 'right'; ctx.fillText('indisponible', zx + zw, yy); ctx.textAlign = 'left'; return; } ctx.fillStyle = '#fff'; ctx.textAlign = 'right'; ctx.fillText(q.prix.toLocaleString('fr-FR', { maximumFractionDigits: q.decimales }), zx + zw * 0.64, yy); ctx.fillStyle = q.pct >= 0 ? VERT : ROUGE; ctx.fillText(q.pct == null ? '—' : (q.pct > 0 ? '+' : '') + q.pct.toFixed(2) + ' %', zx + zw, yy); ctx.textAlign = 'left'; });
      const src = [...new Set((reel.cotations || []).filter(q => !q.vide && q.source).map(q => q.source))].join(' · '); pied = (src || 'cotations') + ' · cliquer pour ouvrir';
    }
  } else if (def.type === 'positions') {
    ctx.font = '28px ui-monospace, Consolas, monospace';
    X.positions().forEach((p, i) => { const yy = zy + 24 + i * 62; ctx.fillStyle = TEXTE; ctx.fillText(p.actif + ' · ' + p.sens, zx, yy); ctx.fillStyle = p.pl >= 0 ? VERT : ROUGE; ctx.textAlign = 'right'; ctx.fillText((p.pl >= 0 ? '+' : '') + p.pl.toFixed(1), zx + zw, yy); ctx.textAlign = 'left'; ctx.strokeStyle = 'rgba(143,208,227,0.18)'; ctx.beginPath(); ctx.moveTo(zx, yy + 28); ctx.lineTo(zx + zw, yy + 28); ctx.stroke(); });
  } else if (def.type === 'performance') dessinerCourbe(ctx, zx, zy, zw, zh, X.courbe(def.graine || 5, 60, 10000));
  else if (def.type === 'bougies') { const { b } = bougiesDe(def); dessinerBougies(ctx, zx, zy, zw, zh, b); }
  else {
    const lignes = def.type === 'signaux' ? X.signaux().map(s => [s.heure, s.actif]) : X.evenements().map(e => [e.heure, e.pays + ' · ' + e.nom.replace('Exemple · ', '')]);
    ctx.font = '27px ui-monospace, Consolas, monospace';
    lignes.forEach((l, i) => { const yy = zy + 24 + i * 62; ctx.fillStyle = CYAN; ctx.fillText(l[0], zx, yy); ctx.fillStyle = TEXTE; ctx.fillText(l[1], zx + 118, yy, zw - 120); });
  }
  ctx.fillStyle = vrai ? 'rgba(155,196,214,0.95)' : 'rgba(255,179,71,0.9)'; ctx.font = '23px ui-monospace, Consolas, monospace'; ctx.fillText(pied, 26, h - 30, w - 52);
  if (!vrai) { ctx.save(); ctx.translate(w / 2, h / 2 + 18); ctx.rotate(-0.28); ctx.fillStyle = 'rgba(255,179,71,0.10)'; ctx.font = 'bold 130px ui-monospace, Consolas, monospace'; ctx.textAlign = 'center'; ctx.fillText(X.MARQUEUR, 0, 0); ctx.restore(); }
}

/* ── Contenu de la grande fenêtre (HTML dans Panneaux.ouvrir) ── */
const el = (tag, classe, texte) => { const e = document.createElement(tag); if (classe) e.className = classe; if (texte !== undefined) e.textContent = texte; return e; };
export function construireContenu(def, conteneur) {
  conteneur.classList.add('mars-ex');
  const bandeau = el('div', 'mars-ex-bandeau'); bandeau.append(el('b', '', X.MARQUEUR), el('span', '', ' ' + X.AVERTISSEMENT.replace(X.MARQUEUR + ' · ', ''))); conteneur.appendChild(bandeau);
  let nettoyage = null;
  if (def.type === 'bougies') {
    let instrument = def.instrument, ema = true, ma = true;
    const barre = el('div', 'mars-ex-barre'); conteneur.appendChild(barre);
    const cv = document.createElement('canvas'); cv.width = 880; cv.height = 400; cv.className = 'mars-ex-canvas'; conteneur.appendChild(cv);
    const legende = el('div', 'mars-ex-legende'); conteneur.appendChild(legende);
    const dessiner = () => {
      const ctx = cv.getContext('2d'), d = { ...def, instrument }; ctx.clearRect(0, 0, cv.width, cv.height); ctx.fillStyle = 'rgba(2,10,20,0.6)'; ctx.fillRect(0, 0, cv.width, cv.height);
      const { ins, b } = bougiesDe({ ...d, graine: (def.graine || 1) + (instrument === def.instrument ? 0 : 7) });
      const r = dessinerBougies(ctx, 14, 16, cv.width - 90, cv.height - 40, b, { ema, ma });
      ctx.fillStyle = TEXTE; ctx.font = '15px ui-monospace, Consolas, monospace'; ctx.textAlign = 'right';
      for (let i = 0; i <= 4; i++) ctx.fillText((r.max - (r.max - r.min) * i / 4).toFixed(0), cv.width - 8, 22 + (cv.height - 40) * i / 4);
      ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(255,179,71,0.12)'; ctx.font = 'bold 120px ui-monospace, Consolas, monospace'; ctx.save(); ctx.translate(cv.width / 2 - 50, cv.height / 2 + 30); ctx.rotate(-0.2); ctx.textAlign = 'center'; ctx.fillText(X.MARQUEUR, 0, 0); ctx.restore();
      legende.textContent = ins.nom + ' · bougies factices' + (ema ? ' · EMA 20 (orange)' : '') + (ma ? ' · MA 30 (cyan)' : '');
    };
    const bouton = (txt, actif, clic) => { const b = el('button', 'mars-ex-btn' + (actif ? ' actif' : ''), txt); b.type = 'button'; b.addEventListener('click', () => { clic(b); }); barre.appendChild(b); return b; };
    for (const ins of X.INSTRUMENTS) { const b = bouton(ins.id === 'US100' ? 'US100 · Nasdaq 100' : 'XAU/USD · or', ins.id === instrument, () => { instrument = ins.id; barre.querySelectorAll('[data-i]').forEach(x => x.classList.toggle('actif', x.dataset.i === instrument)); dessiner(); }); b.dataset.i = ins.id; }
    barre.appendChild(el('span', 'mars-ex-sep', '│'));
    bouton('EMA', true, b => { ema = !ema; b.classList.toggle('actif', ema); dessiner(); });
    bouton('MA', true, b => { ma = !ma; b.classList.toggle('actif', ma); dessiner(); });
    dessiner();
  } else if (def.type === 'performance') {
    const tuiles = el('div', 'mars-ex-tuiles'); for (const [n, val] of [['Capital (exemple)', '10 842 €'], ['Jour (exemple)', '+0,62 %'], ['Semaine (exemple)', '+2,1 %'], ['Taux de réussite (exemple)', '58 %']]) { const t = el('div', 'mars-ex-tuile'); t.append(el('span', '', n), el('b', '', val)); tuiles.appendChild(t); }
    conteneur.appendChild(tuiles);
    const cv = document.createElement('canvas'); cv.width = 880; cv.height = 300; cv.className = 'mars-ex-canvas'; conteneur.appendChild(cv);
    const ctx = cv.getContext('2d'); ctx.fillStyle = 'rgba(2,10,20,0.6)'; ctx.fillRect(0, 0, cv.width, cv.height); dessinerCourbe(ctx, 14, 16, cv.width - 28, cv.height - 32, X.courbe(def.graine || 5, 60, 10000));
    conteneur.appendChild(el('div', 'mars-ex-legende', 'Courbe de capital factice (60 points).'));
  } else if (def.type === 'positions') {
    const t = el('table', 'mars-ex-table'); t.innerHTML = '<thead><tr><th>Actif</th><th>Sens</th><th>Taille</th><th>Entrée</th><th>Cours</th><th>Résultat</th></tr></thead>';
    const tb = document.createElement('tbody'); for (const p of X.positions()) { const tr = document.createElement('tr'); [p.actif, p.sens, p.taille, p.entree, p.courant, (p.pl >= 0 ? '+' : '') + p.pl.toFixed(1)].forEach((v, i) => { const td = el('td', i === 5 ? (p.pl >= 0 ? 'gain' : 'perte') : '', String(v)); tr.appendChild(td); }); tb.appendChild(tr); }
    t.appendChild(tb); conteneur.appendChild(t); conteneur.appendChild(el('div', 'mars-ex-legende', 'Lignes factices : aucune position réelle n’est lue.'));
  } else if (def.type === 'signaux') {
    const l = el('ul', 'mars-ex-liste'); for (const s of X.signaux()) { const li = document.createElement('li'); li.append(el('b', '', s.heure + ' · ' + s.actif), el('span', '', s.texte)); l.appendChild(li); } conteneur.appendChild(l);
  } else {
    const tuiles = el('div', 'mars-ex-tuiles'); for (const t of X.tuiles()) { const d = el('div', 'mars-ex-tuile'); d.append(el('span', '', t.nom + ' (exemple)'), el('b', '', t.valeur)); tuiles.appendChild(d); } conteneur.appendChild(tuiles);
    const l = el('ul', 'mars-ex-liste'); for (const e of X.evenements()) { const li = document.createElement('li'); li.append(el('b', '', e.heure + ' · ' + e.pays + ' · ' + '●'.repeat(e.impact)), el('span', '', e.nom)); l.appendChild(li); } conteneur.appendChild(l);
  }
  return nettoyage;
}
