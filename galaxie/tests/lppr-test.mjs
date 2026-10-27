// Tests de la LPPR (phase 8) sur le VRAI fichier data/lppr/lppr_titre2.json (extrait du PDF officiel). Lancer : node galaxie/tests/lppr-test.mjs
import fs from 'node:fs';
import { creerIndex, chercher, expliquer, verifierCumul, aideDevis, dire, detecterVoix, A_VERIFIER, jetons } from '../../core/lppr/lppr-calcul.js';
let ok = 0, ko = 0; const v = (n, c, d = '') => { c ? ok++ : ko++; if (!c) console.log('KO  ' + n + (d ? ' — ' + d : '')); };
const chemin = new URL('../../data/lppr/lppr_titre2.json', import.meta.url);
if (!fs.existsSync(chemin)) { console.log('Fichier data/lppr/lppr_titre2.json absent : lancer planetes/neptune/outils/lppr-extraire.py (voir docs/LPPR.md). Test ignoré.'); process.exit(0); }
const donnees = JSON.parse(fs.readFileSync(chemin, 'utf8')), idx = creerIndex(donnees);

v('index chargé, version et date affichables', idx.ok && /07 ?octobre 2026|2026-10-07|Mise à jour/.test(JSON.stringify(idx.meta)) && idx.meta.url.startsWith('https://www.ameli.fr/'));
v('plus de 1000 codes, les 7 chapitres du Titre II', idx.codes.length > 1000 && Object.keys(idx.meta.chapitres).length === 7);
v('chaque code a 7 chiffres, un intitulé et un chapitre', idx.codes.every(e => /^\d{7}$/.test(e.code) && e.intitule && /^[1-7]$/.test(e.chapitre)));
v('aucun code en double', new Set(idx.codes.map(e => e.code)).size === idx.codes.length);
v('les tarifs sont des nombres, du texte officiel (« Sur facture ») ou absents — jamais inventés', idx.codes.every(e => e.tarif == null || typeof e.tarif === 'number' || typeof e.tarif === 'string'));
// valeur connue du PDF (page 1030) : pelote inguino-scrotale B36N = 14,86 €
const pelote = idx.parCode.get('2174738');
v('valeur de contrôle : 2174738 = pelote B36N à 14,86 €', pelote && pelote.tarif === 14.86 && /B36N/.test(pelote.intitule));
v('recherche par code exact', chercher(idx, 'code 2174738').resultats[0].code === '2174738');
v('code inexistant : rien d’inventé', chercher(idx, '9999999').resultats.length === 0 && /n’existe pas/.test(chercher(idx, '9999999').raison));
v('recherche par référence alphanumérique (B36N)', chercher(idx, 'B36N').resultats.some(e => e.code === '2174738'));
const emb = chercher(idx, 'emboîture tibiale');
v('recherche plein texte « emboîture tibiale » : résultats avec code et tarif', emb.ok && emb.resultats.length > 0 && emb.resultats.every(e => /^\d{7}$/.test(e.code)), JSON.stringify(emb.resultats.slice(0, 1).map(e => e.intitule)));
v('recherche sans accent équivalente', chercher(idx, 'emboiture tibiale').total === emb.total);
v('requête absurde : « rien trouvé », pas de code', chercher(idx, 'zzqxw').resultats.length === 0);
v('expliquer renvoie référence (chapitre, page) et le rappel « à vérifier »', (() => { const r = expliquer(idx, '2174738'); return r.ok && /chapitre 1/.test(r.reference) && /page 1030/.test(r.reference) && dire(idx, r, 'expliquer').includes('À vérifier avec la version en vigueur'); })());
v('expliquer un code inconnu : refus net', !expliquer(idx, '1234567').ok);
const cumul = verifierCumul(idx, '2174738', '2167193');
v('cumul entre deux codes sans mention : « aucune règle », jamais « autorisé »', cumul.ok && cumul.verdict === 'aucune_regle' && !/autoris/i.test(dire(idx, cumul, 'cumul').replace(/ne prouve pas que le cumul est autorisé/, '')));
// un code qui en cite un autre
const citant = idx.codes.find(e => /\b\d{7}\b/.test((e.intitule + e.texte).replace(e.code, '')) && idx.parCode.has(((e.intitule + ' ' + e.texte).match(/\b\d{7}\b/g) || []).find(c => c !== e.code)));
if (citant) { const autre = ((citant.intitule + ' ' + citant.texte).match(/\b\d{7}\b/g) || []).find(c => c !== citant.code && idx.parCode.has(c)); const r = verifierCumul(idx, citant.code, autre); v('cumul : un code qui cite l’autre → phrase source citée', r.ok && r.verdict === 'mentionne' && r.mentions[0].phrase.includes(autre)); }
v('cumul avec code inconnu : refus', !verifierCumul(idx, '2174738', '0000000').ok);
const dev = aideDevis(idx, 'prothèse tibiale avec manchon et pied à restitution d’énergie');
v('aide au devis : plusieurs groupes, propositions à valider, codes réels', dev.ok && dev.groupes.length >= 2 && dev.groupes.every(g => g.resultats.every(e => idx.parCode.has(e.code))) && /PROPOSITIONS/.test(dev.avertissement));
v('aide au devis vide : demande des précisions', !aideDevis(idx, '').ok);
v('phrase parlée sans markdown ni émoji', (() => { const s = dire(idx, dev, 'devis') + dire(idx, emb, 'chercher'); return !/[*#`_]{2,}|[\u{1F300}-\u{1FAFF}]/u.test(s); })());
v('index absent : message clair', !chercher({ ok: false, raison: 'absent' }, 'x').ok);
v('A_VERIFIER rappelle la nomenclature officielle', /version en vigueur/.test(A_VERIFIER));
// voix
v('voix : « ouvre la LPPR »', detecterVoix('Ouvre la LPPR').type === 'fenetre');
v('voix : « explique le code 2174738 »', (d => d.type === 'expliquer' && d.code === '2174738')(detecterVoix('explique le code 2174738')));
v('voix : cumul de deux codes', (d => d.type === 'cumul' && d.a === '2174738' && d.b === '2167193')(detecterVoix('peut-on cumuler 2174738 et 2167193')));
v('voix : « code LPPR de l’emboîture tibiale »', (d => d.type === 'chercher' && /emboiture tibiale/.test(d.q))(detecterVoix('quel est le code LPPR de l’emboîture tibiale')));
v('voix : devis', (d => d.type === 'devis' && /manchon/.test(d.texte))(detecterVoix('fais un devis : prothèse tibiale avec manchon')));
v('voix : phrases étrangères ignorées', detecterVoix('quelle heure est-il') === null && detecterVoix('mets le graphique en H4') === null);
v('jetons : mots vides retirés', !jetons('le code de la prothèse').includes('le'));
console.log(ko ? ko + ' échec(s) / ' + (ok + ko) : ok + ' vérifications réussies.'); process.exit(ko ? 1 : 0);
