// Relais PC de Raylé : la LISTE BLANCHE des actions et la façon de les exécuter (sans aucune commande libre).
// Chaque action devient une liste d'étapes {prog, args} lancées SANS shell (child_process.spawn, shell: false) :
// aucune phrase dictée n'est jamais passée à cmd ou à PowerShell. Les seules valeurs variables sont :
//   • un nom d'appli → cherché dans la config (c'est toi qui choisis la commande lancée) ;
//   • une adresse http(s) vérifiée → ouverte par le navigateur par défaut ;
//   • un nombre (volume) ;
//   • un nom de fichier → cherché par le relais UNIQUEMENT dans Documents et Téléchargements.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const OPS = ['ouvrir_app', 'ouvrir_site', 'volume', 'media', 'capture', 'etat', 'annuler', 'verrouiller', 'veille', 'redemarrer', 'eteindre', 'ouvrir_fichier'];
export const APPS_DEFAUT = {
  chrome: ['cmd.exe', '/c', 'start', '', 'chrome'],
  edge: ['cmd.exe', '/c', 'start', '', 'msedge'],
  blocnotes: ['notepad.exe'],
  calculatrice: ['calc.exe'],
  explorateur: ['explorer.exe'],
  xtb: ['https://xstation5.xtb.com/'],
  tradingview: ['https://www.tradingview.com/chart/']
};
const NOMS = { xtb: 'xStation XTB', tradingview: 'TradingView', chrome: 'Chrome', edge: 'Edge', blocnotes: 'le Bloc-notes', calculatrice: 'la Calculatrice', explorateur: 'l’Explorateur' };
// Extensions jamais ouvertes depuis un fichier (programmes, scripts, raccourcis)
const DANGEREUX = /\.(?:exe|com|bat|cmd|ps1|psm1|vbs|vbe|js|jse|wsf|wsh|msi|msp|scr|pif|lnk|url|reg|hta|cpl|jar|appref-ms|application|gadget|inf|sct|dll|sys)$/i;

export const normaliser = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function urlSure(v) {
  const s = String(v || '');
  if (s.length > 500 || /[\s"'<>`^|&]/.test(s)) return '';
  let u; try { u = new URL(s); } catch (e) { return ''; }
  return /^https?:$/.test(u.protocol) ? u.href : '';
}
// Un script PowerShell FIXE (aucune donnée dictée dedans), passé encodé pour éviter tout souci de guillemets
export const ps = (script) => ({ prog: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')] });
const touches = (code, n) => ps(`$w=New-Object -ComObject WScript.Shell; 1..${Math.max(1, Math.min(60, n | 0))} | ForEach-Object { $w.SendKeys([char]${code}) }`);

export function scriptCapture(fichier, largeur = 1280, qualite = 70) {
  const f = String(fichier).replace(/'/g, "''");
  return `Add-Type -AssemblyName System.Windows.Forms,System.Drawing
Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetProcessDPIAware();' -Name Dpi -Namespace Rayle
[void][Rayle.Dpi]::SetProcessDPIAware()
$b=[System.Windows.Forms.SystemInformation]::VirtualScreen
$bmp=New-Object System.Drawing.Bitmap $b.Width,$b.Height
$g=[System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($b.Left,$b.Top,0,0,$bmp.Size); $g.Dispose()
$w=[Math]::Min(${largeur | 0},$b.Width); $h=[int]($b.Height*$w/$b.Width)
$s=New-Object System.Drawing.Bitmap $bmp,$w,$h
$enc=[System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$p=New-Object System.Drawing.Imaging.EncoderParameters 1
$p.Param[0]=New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality),([long]${qualite | 0})
$s.Save('${f}',$enc,$p); $s.Dispose(); $bmp.Dispose()`;
}
export const SCRIPT_BATTERIE = `$b=Get-CimInstance Win32_Battery | Select-Object -First 1 EstimatedChargeRemaining,BatteryStatus; if($b){ $b | ConvertTo-Json -Compress } else { '{}' }`;

// Les dossiers autorisés pour « ouvre le fichier / dossier … »
export function racinesAutorisees(maison = os.homedir()) {
  const l = [path.join(maison, 'Documents'), path.join(maison, 'Downloads'), path.join(maison, 'OneDrive', 'Documents'), path.join(maison, 'Téléchargements')];
  return l.filter((p, i) => l.indexOf(p) === i && fs.existsSync(p)).map((p) => fs.realpathSync(p));
}
const dedans = (p, racine) => { const r = path.relative(racine, p); return !!r && !r.startsWith('..') && !path.isAbsolute(r); };
// Cherche (profondeur 3, 4000 entrées au plus) le fichier ou dossier dont le nom ressemble le plus à la demande
export function trouverFichier(demande, racines) {
  const q = normaliser(demande).replace(/^(?:le|la|les|mon|ma|mes)\s+/, '');
  if (q.length < 2) return null;
  let meilleur = null, vus = 0;
  const noter = (p, nom, dossier, prof) => {
    const n = normaliser(dossier ? nom : nom.replace(/\.[^.]+$/, ''));
    let score = n === q ? 100 : n.startsWith(q) ? 80 : (' ' + n + ' ').includes(' ' + q + ' ') ? 70 : n.includes(q) ? 50 : 0;
    if (!score) return;
    score -= prof * 3;
    if (!meilleur || score > meilleur.score) meilleur = { chemin: p, dossier, score };
  };
  const parcourir = (dir, racine, prof) => {
    if (prof > 3 || vus > 4000) return;
    let l = [];
    try { l = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    for (const e of l) {
      if (++vus > 4000) return;
      if (e.name.startsWith('.') || e.isSymbolicLink()) continue;
      const p = path.join(dir, e.name);
      noter(p, e.name, e.isDirectory(), prof);
      if (e.isDirectory()) parcourir(p, racine, prof + 1);
    }
  };
  for (const r of racines) parcourir(r, r, 0);
  if (!meilleur) return null;
  // sécurité : chemin réel toujours DANS une racine autorisée, jamais un programme
  let reel;
  try { reel = fs.realpathSync(meilleur.chemin); } catch (e) { return null; }
  if (!racines.some((r) => dedans(reel, r))) return null;
  if (!meilleur.dossier && DANGEREUX.test(reel)) return { refuse: true, chemin: reel };
  return { chemin: reel, dossier: meilleur.dossier };
}

// action {type:'systeme', op, valeur} → {etapes:[{prog,args}], message, special?} ou {erreur}
export function plan(a, config = {}, racines = null) {
  if (!a || a.type !== 'systeme' || !OPS.includes(a.op)) return { erreur: 'action hors liste blanche' };
  const v = String(a.valeur == null ? '' : a.valeur);
  const apps = Object.assign({}, APPS_DEFAUT, config.apps || {});
  switch (a.op) {
    case 'ouvrir_app': {
      const k = normaliser(v).replace(/\s+/g, '');
      const c = apps[k];
      if (!Array.isArray(c) || !c.length || typeof c[0] !== 'string') return { erreur: 'appli « ' + v + ' » inconnue : ajoute-la dans config.json (rubrique apps)' };
      const nom = NOMS[k] || k;
      if (/^https?:\/\//i.test(c[0])) { const u = urlSure(c[0]); return u ? { etapes: [{ prog: 'rundll32.exe', args: ['url.dll,FileProtocolHandler', u] }], message: nom + ' est ouvert sur le PC.' } : { erreur: 'adresse invalide dans config.json pour ' + k }; }
      return { etapes: [{ prog: c[0], args: c.slice(1).map(String) }], message: nom + ' est ouvert sur le PC.' };
    }
    case 'ouvrir_site': {
      const u = urlSure(v);
      return u ? { etapes: [{ prog: 'rundll32.exe', args: ['url.dll,FileProtocolHandler', u] }], message: 'La page est ouverte sur le PC.' } : { erreur: 'adresse refusée (http ou https seulement)' };
    }
    case 'volume': {
      if (v === 'plus') return { etapes: [touches(175, 5)], message: 'J’ai monté le son du PC.' };
      if (v === 'moins') return { etapes: [touches(174, 5)], message: 'J’ai baissé le son du PC.' };
      if (v === 'muet') return { etapes: [touches(173, 1)], message: 'Son du PC coupé (ou remis).' };
      if (/^\d{1,3}$/.test(v) && +v <= 100) return { etapes: [touches(174, 50), ...(+v >= 2 ? [touches(175, Math.round(+v / 2))] : [])], message: 'Volume du PC réglé à ' + (+v) + ' %.' };
      return { erreur: 'volume invalide' };
    }
    case 'media': {
      const code = { pause: 179, suivant: 176, precedent: 177 }[v];
      return code ? { etapes: [touches(code, 1)], message: v === 'pause' ? 'Lecture ou pause sur le PC.' : v === 'suivant' ? 'Morceau suivant sur le PC.' : 'Morceau précédent sur le PC.' } : { erreur: 'commande de lecture invalide' };
    }
    case 'capture': return { etapes: [], special: 'capture', message: 'Capture envoyée à Raylé.' };
    case 'etat': return { etapes: [], special: 'etat' };
    case 'annuler': return { etapes: [{ prog: 'shutdown.exe', args: ['/a'] }], message: 'Arrêt du PC annulé.', toleree: true };
    case 'verrouiller': return { etapes: [{ prog: 'rundll32.exe', args: ['user32.dll,LockWorkStation'] }], message: 'Le PC est verrouillé.' };
    case 'veille': return { etapes: [{ prog: 'rundll32.exe', args: ['powrprof.dll,SetSuspendState', '0,1,0'] }], message: 'Le PC se met en veille.', differe: 1500 };
    case 'redemarrer': return { etapes: [{ prog: 'shutdown.exe', args: ['/r', '/t', '30', '/c', 'Raylé : redémarrage dans 30 secondes. Dis « annule l’arrêt du PC » pour l’empêcher.'] }], message: 'Le PC redémarre dans 30 secondes. Dis « annule l’arrêt du PC » pour l’empêcher.' };
    case 'eteindre': return { etapes: [{ prog: 'shutdown.exe', args: ['/s', '/t', '30', '/c', 'Raylé : arrêt dans 30 secondes. Dis « annule l’arrêt du PC » pour l’empêcher.'] }], message: 'Le PC s’éteint dans 30 secondes. Dis « annule l’arrêt du PC » pour l’empêcher.' };
    case 'ouvrir_fichier': {
      const f = trouverFichier(v, racines || racinesAutorisees());
      if (!f) return { erreur: 'rien trouvé qui ressemble à « ' + v + ' » dans Documents ou Téléchargements' };
      if (f.refuse) return { erreur: 'je n’ouvre pas les programmes ni les scripts' };
      return { etapes: [{ prog: 'explorer.exe', args: [f.chemin] }], message: (f.dossier ? 'Le dossier « ' : 'Le fichier « ') + path.basename(f.chemin) + ' » est ouvert sur le PC.' };
    }
  }
  return { erreur: 'action inconnue' };
}

export function texteEtat(uptimeS, batterie) {
  const h = Math.floor(uptimeS / 3600), m = Math.floor((uptimeS % 3600) / 60);
  const duree = h >= 24 ? Math.floor(h / 24) + ' j ' + (h % 24) + ' h' : h ? h + ' h ' + String(m).padStart(2, '0') : m + ' min';
  let t = 'Le PC est allumé depuis ' + duree;
  if (batterie && batterie.EstimatedChargeRemaining != null) t += ', batterie à ' + batterie.EstimatedChargeRemaining + ' %' + (batterie.BatteryStatus === 2 ? ' (en charge ou sur secteur)' : '');
  else t += ', sans batterie détectée (PC fixe ou sur secteur)';
  return t + '.';
}
