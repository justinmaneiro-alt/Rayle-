/* ═════════════ IMPORT DE L'HISTORIQUE XTB (xStation) : .zip, .xlsx ou .csv, dans le navigateur et sous Node ═════════════
   Structure réelle étudiée (export « EUR_<compte>_<début>_<fin>.xlsx », 3 feuilles) :
     Closed Positions : Instrument, Ticker, Category, Type, Volume, Open Price, Open Time (UTC), Close Price, Close Time (UTC), Product, Profit/Loss, Gross Profit, …, Stop Loss, Take Profit,
                        Commission, Margin, Swap, Rollover, …, Close Origin, Position ID, Comment ;  Profit/Loss = Gross Profit + Commission + Swap (net).
     Cash Operations  : Type (Deposit, Withdrawal, Close trade, Swap, Free funds interest, …), Time, Amount, ID, Comment, Position ID ; la dernière ligne « Total » est la somme des autres.
     Open Positions   : résumé (valeur, profit) puis une ligne par instrument et une par position.
   Dates : numéros de série Excel (UTC). Le NUMÉRO DE COMPTE n'est jamais lu ni gardé ; les commentaires des opérations de trésorerie (références bancaires) ne sont pas gardés non plus.
   Rien n'est deviné : un fichier non reconnu produit une erreur claire. Résultat : { fermees, tresorerie, ouvertes, resume, periode, avertissements }. */

/* ───── ZIP minimal (stocké ou deflate) ───── */
const u16 = (b, o) => b[o] | (b[o + 1] << 8), u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
async function inflater(data) { const flux = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')); return new Uint8Array(await new Response(flux).arrayBuffer()); }
export function estZip(b) { return b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 3 || b[2] === 5); }
export async function lireZip(octets) {
  const b = octets instanceof Uint8Array ? octets : new Uint8Array(octets); let fin = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 70000); i--) if (u32(b, i) === 0x06054b50) { fin = i; break; }
  if (fin < 0) throw new Error('archive ZIP illisible (fin de répertoire introuvable)');
  const n = u16(b, fin + 10); let o = u32(b, fin + 16); const out = new Map(), td = new TextDecoder('utf-8');
  for (let k = 0; k < n; k++) {
    if (u32(b, o) !== 0x02014b50) throw new Error('archive ZIP corrompue');
    const methode = u16(b, o + 10), taille = u32(b, o + 20), lnom = u16(b, o + 28), lextra = u16(b, o + 30), lcom = u16(b, o + 32), local = u32(b, o + 42), nom = td.decode(b.subarray(o + 46, o + 46 + lnom));
    o += 46 + lnom + lextra + lcom; if (nom.endsWith('/')) continue;
    const lnomL = u16(b, local + 26), lextraL = u16(b, local + 28), debut = local + 30 + lnomL + lextraL, brut = b.subarray(debut, debut + taille);
    out.set(nom, methode === 0 ? brut : methode === 8 ? await inflater(brut) : (() => { throw new Error('compression ZIP non gérée (' + methode + ')'); })());
  }
  return out;
}

/* ───── XLSX ───── */
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = s => String(s).replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e.toLowerCase()]));
const texteDe = x => [...x.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(m => decode(m[1])).join('');
export async function lireXlsx(octets) {
  const Z = await lireZip(octets), td = new TextDecoder('utf-8'), lire = n => (Z.has(n) ? td.decode(Z.get(n)) : null);
  const wb = lire('xl/workbook.xml'); if (!wb) throw new Error('classeur Excel illisible (workbook.xml absent)');
  const rels = lire('xl/_rels/workbook.xml.rels') || '', cible = {}; for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) { const id = /Id="([^"]+)"/.exec(m[0]), t = /Target="([^"]+)"/.exec(m[0]); if (id && t) cible[id[1]] = t[1].replace(/^\//, '').replace(/^(?!xl\/)/, 'xl/'); }
  const ssx = lire('xl/sharedStrings.xml') || '', S = [...ssx.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => texteDe(m[1])), feuilles = {};
  for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
    const nom = /name="([^"]*)"/.exec(m[0]), rid = /r:id="([^"]*)"/.exec(m[0]) || /\bid="([^"]*)"/.exec(m[0]); if (!nom || !rid) continue;
    const xml = lire(cible[rid[1]] || ''); if (!xml) continue; const lignes = [];
    for (const r of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const o = {};
      for (const c of r[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const col = /\br="([A-Z]+)\d+"/.exec(c[1]); if (!col) continue; const t = /\bt="(\w+)"/.exec(c[1]), corps = c[2] || '', v = /<v>([\s\S]*?)<\/v>/.exec(corps);
        if (t && t[1] === 'inlineStr') o[col[1]] = texteDe(corps); else if (!v) continue; else if (t && t[1] === 's') o[col[1]] = S[+v[1]]; else if (t && (t[1] === 'str' || t[1] === 'e')) o[col[1]] = decode(v[1]); else if (t && t[1] === 'b') o[col[1]] = v[1] === '1'; else o[col[1]] = +v[1];
      }
      lignes.push(o);
    }
    feuilles[decode(nom[1])] = lignes;
  }
  return feuilles;
}

/* ───── CSV (séparateur ; , ou tabulation ; virgule décimale tolérée) ───── */
export function lireCsv(texte) {
  const t = String(texte).replace(/^﻿/, ''), premiere = t.split(/\r?\n/, 1)[0], sep = [';', '\t', ','].map(s => [s, premiere.split(s).length]).sort((a, b) => b[1] - a[1])[0][0], lignes = []; let ligne = [], champ = '', q = false;
  for (let i = 0; i < t.length; i++) { const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { champ += '"'; i++; } else q = false; } else champ += c; }
    else if (c === '"') q = true; else if (c === sep) { ligne.push(champ); champ = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; ligne.push(champ); champ = ''; if (ligne.some(x => x !== '')) lignes.push(ligne); ligne = []; } else champ += c; }
  ligne.push(champ); if (ligne.some(x => x !== '')) lignes.push(ligne);
  return lignes.map(l => Object.fromEntries(l.map((v, i) => [colonne(i), v])));
}
const colonne = i => { let s = '', n = i + 1; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };

/* ───── normalisation ───── */
const nombre = v => { if (typeof v === 'number') return Number.isFinite(v) ? v : null; if (v == null) return null; const s = String(v).trim().replace(/\s/g, '').replace(/(\d),(\d)/g, '$1.$2'); if (s === '' || !/^-?\d*\.?\d+(e[+-]?\d+)?$/i.test(s)) return null; return +s; };
export function dateMs(v) {
  if (v == null || v === '') return null; if (typeof v === 'number') return Math.round((v - 25569) * 86400e3 / 1000) * 1000;
  const s = String(v).trim(); if (/^-?\d+(\.\d+)?$/.test(s)) return Math.round((+s - 25569) * 86400e3 / 1000) * 1000;
  let m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(s); if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  m = /^(\d{2})[./](\d{2})[./](\d{4})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(s); if (m) return Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +(m[6] || 0));
  return null;
}
const norm = s => String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim();
const idPos = v => { const n = nombre(v); return n == null ? (v ? String(v).trim() : null) : String(Math.round(n)); };
/* trouve la ligne d'en-têtes contenant tous les noms demandés ; renvoie { entete: { colonne → nom normalisé }, debut } */
function trouverEntete(lignes, requis, depuis = 0) {
  for (let i = depuis; i < lignes.length; i++) { const noms = Object.entries(lignes[i]).map(([c, v]) => [c, norm(v)]); if (requis.every(r => noms.some(([, n]) => n === r))) return { entete: Object.fromEntries(noms), debut: i + 1 }; }
  return null;
}
const parNom = (ligne, entete) => { const o = {}; for (const [c, n] of Object.entries(entete)) if (n && !(n in o)) o[n] = ligne[c]; return o; };
const sens = v => { const s = String(v || '').trim().toUpperCase(); return s === 'BUY' || s === 'ACHAT' || s === 'LONG' ? 'BUY' : s === 'SELL' || s === 'VENTE' || s === 'SHORT' ? 'SELL' : null; };

export function lireFermees(lignes) {
  const h = trouverEntete(lignes, ['position id', 'open time (utc)', 'close time (utc)']); if (!h) return null; const out = [], rejets = [];
  for (let i = h.debut; i < lignes.length; i++) {
    const r = parNom(lignes[i], h.entete), id = idPos(r['position id']); if (!id) continue;
    const t = { id, instrument: String(r['instrument'] || '').trim(), ticker: String(r['ticker'] || r['instrument'] || '').trim(), categorie: String(r['category'] || '').trim(), sens: sens(r['type']), volume: nombre(r['volume']), prixOuv: nombre(r['open price']), tOuv: dateMs(r['open time (utc)']), prixFerm: nombre(r['close price']), tFerm: dateMs(r['close time (utc)']),
      pnl: nombre(r['profit/loss']), brut: nombre(r['gross profit']), commission: nombre(r['commission']) || 0, swap: nombre(r['swap']) || 0, rollover: nombre(r['rollover']) || 0, marge: nombre(r['margin']), sl: nombre(r['stop loss']), tp: nombre(r['take profit']), origine: String(r['close origin'] || '').trim(), commentaire: String(r['comment'] || '').trim().slice(0, 60) };
    if (!t.sens || t.volume == null || t.tOuv == null || t.tFerm == null || t.pnl == null) { rejets.push(id); continue; } out.push(t);
  }
  return { lignes: out, rejets };
}
/* types de trésorerie : flux de capital (hors performance), éléments de performance déjà comptés dans les positions, revenus et frais du compte */
export const TYPES_CAPITAL = /^(deposit|withdrawal|transfer|pea deposit|pea return full|dépôt|retrait|virement)/i;
export const TYPES_POSITION = /^(close trade|swap|correction|rollover|commission)/i;
export function lireTresorerie(lignes) {
  const h = trouverEntete(lignes, ['type', 'amount', 'id', 'time']); if (!h) return null; const out = []; let totalFichier = null;
  for (let i = h.debut; i < lignes.length; i++) {
    const r = parNom(lignes[i], h.entete), type = String(r['type'] || '').trim(); if (!type) continue; const montant = nombre(r['amount']);
    if (/^total$/i.test(type)) { totalFichier = montant; continue; }
    const t = dateMs(r['time']); if (montant == null || t == null) continue;
    out.push({ id: 'c' + String(r['id'] == null ? '' : (nombre(r['id']) != null ? Math.round(nombre(r['id'])) : r['id'])).trim(), type, t, montant, idPosition: idPos(r['position id']), ticker: String(r['ticker'] || '').trim() });
  }
  return { lignes: out, totalFichier };
}
export function lireOuvertes(lignes) {
  const rep = trouverEntete(lignes, ['open price', 'current price', 'value']); if (!rep) return null;
  const res = {}; for (const l of lignes) { const m = norm(l.B); if (m === 'open position value') res.valeur = nombre(l.C); if (m === 'open position profit') res.profit = nombre(l.C); if (norm(l.D) === 'eur' || norm(l.D) === 'usd' || norm(l.D) === 'gbp') res.devise = String(l.D).toUpperCase(); }
  const out = [];
  for (let i = rep.debut; i < lignes.length; i++) {
    const r = parNom(lignes[i], rep.entete), s = sens(r['type']); if (!s) continue;   // les lignes « instrument » n'ont pas de sens : seules les positions en ont
    const id = idPos(r['instrument/position']); if (!id) continue;
    out.push({ id, ticker: String(r['ticker'] || '').trim(), sens: s, volume: nombre(r['volume']), valeur: nombre(r['value']), prixCourant: nombre(r['current price']), prixOuv: nombre(r['open price']), tOuv: dateMs(r['open time (utc)']), sl: nombre(r['stop loss']), tp: nombre(r['take profit']), pnl: nombre(r['net profit']), brut: nombre(r['gross profit']), marge: nombre(r['margin']), swap: nombre(r['swap']) || 0 });
  }
  return { lignes: out, resume: res };
}

/* ───── point d'entrée : un ou plusieurs fichiers (octets) → données normalisées ───── */
async function feuillesDe(nom, octets) {
  const n = String(nom || '').toLowerCase();
  if (/\.xlsx?$|\.xlsm$/.test(n)) return Object.entries(await lireXlsx(octets)).map(([titre, lignes]) => ({ titre, lignes }));   // un .xlsx est lui-même une archive : à traiter AVANT les .zip
  if (estZip(octets)) { const Z = await lireZip(octets); let tout = []; for (const [f, o] of Z) { if (/\.(zip|xlsx|xlsm|csv)$/i.test(f) && !/^__macosx/i.test(f)) tout = tout.concat(await feuillesDe(f, o)); } return tout; }
  if (/\.xlsx?$|\.xlsm$/.test(n)) return Object.entries(await lireXlsx(octets)).map(([titre, lignes]) => ({ titre, lignes }));
  if (/\.csv$|\.txt$/.test(n) || !/\./.test(n)) return [{ titre: nom, lignes: lireCsv(new TextDecoder('utf-8').decode(octets)) }];
  return [];
}
export async function importerXtb(fichiers) {
  const F = (Array.isArray(fichiers) ? fichiers : [fichiers]); let feuilles = [];
  for (const f of F) feuilles = feuilles.concat(await feuillesDe(f.nom, f.octets instanceof Uint8Array ? f.octets : new Uint8Array(f.octets)));
  if (!feuilles.length) throw new Error('Aucun fichier .zip, .xlsx ou .csv exploitable. Exportez l’historique depuis xStation (Historique du compte → Exporter) puis choisissez le fichier .zip tel quel.');
  const R = { fermees: [], tresorerie: [], ouvertes: [], resume: {}, avertissements: [], totalTresorerieFichier: null }; let vu = 0;
  for (const { titre, lignes } of feuilles) {
    const f = lireFermees(lignes); if (f) { R.fermees = R.fermees.concat(f.lignes); if (f.rejets.length) R.avertissements.push(f.rejets.length + ' position(s) fermée(s) ignorée(s) (champs manquants) dans « ' + titre + ' »'); vu++; continue; }
    const c = lireTresorerie(lignes); if (c) { R.tresorerie = R.tresorerie.concat(c.lignes); if (c.totalFichier != null) R.totalTresorerieFichier = c.totalFichier; vu++; continue; }
    const o = lireOuvertes(lignes); if (o) { R.ouvertes = R.ouvertes.concat(o.lignes); R.resume = { ...R.resume, ...o.resume }; vu++; continue; }
  }
  if (!vu) throw new Error('Fichier non reconnu : les colonnes attendues (Position ID, Open Time (UTC), Close Time (UTC)… ou Type, Amount, ID, Time…) sont introuvables. Utilisez l’export de l’historique du compte de xStation.');
  const dedoublonner = (L, cle) => { const m = new Map(); for (const x of L) m.set(cle(x), x); return [...m.values()]; };
  R.fermees = dedoublonner(R.fermees, x => x.id).sort((a, b) => a.tFerm - b.tFerm); R.tresorerie = dedoublonner(R.tresorerie, x => x.id).sort((a, b) => a.t - b.t); R.ouvertes = dedoublonner(R.ouvertes, x => x.id);
  const ts = R.fermees.map(x => x.tFerm).concat(R.tresorerie.map(x => x.t)); R.periode = ts.length ? { du: Math.min(...ts), au: Math.max(...ts) } : null;
  return R;
}
