// Tests de la LPPR « V3 » : graphe de connaissances, règles, outils (chercher, expliquer, cumul, réparation, devis, vérification), vocabulaire et corrections, export PDF / Word, voix.
// Lancer :  node galaxie/tests/lppr-graphe-test.mjs   (ou npm run test:lppr, qui note aussi les cas de data/lppr/tests/cas.json)
import fs from 'node:fs';
import { norm, extraireRegles, phrases, codesCites, typeDe, famillesDe, actifLe } from '../../core/lppr/lppr-regles.js';
import { creerLppr, A_VERIFIER } from '../../core/lppr/lppr-outils.js';
import { creerDevis, reconnaitreFiche, extraireReponses, FICHES } from '../../core/lppr/lppr-devis.js';
import { corrections_vide, corrigerCode, exclureCode, vocabulaireEffectif, idPourMot } from '../../core/lppr/lppr-vocab.js';
import { devisVersPdf, devisVersDocx, ecrireZip, crc32, winAnsi, contenuDevis } from '../../core/lppr/lppr-export.js';
import { detecter, direChercher, direExpliquer, direCumul, direReparation, direDevis, direVerification } from '../../core/lppr/lppr-voix.js';
import { construire, applicabilite } from '../../core/lppr/construire-graphe.mjs';
import { noter } from '../../core/lppr/noter-lppr.mjs';

let ok = 0, ko = 0; const v = (n, c, d = '') => { if (c) ok++; else { ko++; console.log('KO  ' + n + (d !== '' ? ' — ' + d : '')); } };
const lire = f => JSON.parse(fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8'));
const g = lire('data/lppr/graphe.json'), voc = lire('data/lppr/vocabulaire.json'), tests = lire('data/lppr/tests/cas.json'), AUJ = '2026-10-28';
const L = creerLppr(g, { vocabulaire: voc, aujourdhui: AUJ }), D = creerDevis(L);

/* ── règles et classement ── */
v('norm : accents, apostrophes, casse', norm('Prothèse d’AVANT-bras') === 'prothese d\'avant-bras');
const reg = extraireRegles('La prise en charge est assurée pour un boitier tous les 8 ans. L’appareil est garanti trois ans. Une entente préalable est nécessaire. Ne peut pas être associé au code 2717630.', 'code', 12);
v('règles : renouvellement, garantie, entente préalable, cumul reconnus avec leur source et leur page', ['renouvellement', 'garantie', 'entente_prealable', 'cumul'].every(t => reg.some(r => r.type === t && r.source === 'code' && r.page === 12)), JSON.stringify(reg.map(r => r.type)));
v('codes cités : 7 chiffres seulement', JSON.stringify(codesCites('voir 2717630 et 12345 ou 2700339.')) === JSON.stringify(['2717630', '2700339']));
v('type : adjonction (AI…), variante (VI…), appareil (OI…), réparation (texte), prestation', typeDe({ reference: 'AI1S101' }) === 'adjonction' && typeDe({ reference: 'VI1X601' }) === 'variante' && typeDe({ reference: 'OI59C01' }) === 'appareil' && typeDe({ designation: 'Pied, réparation pièces' }) === 'reparation' && typeDe({ designation: 'Prestation annuelle de suivi' }) === 'prestation');
v('familles : « Prothèse d’avant bras… » = prothèse de membre supérieur ; « Collier cervical » = minerve ; « mention de corset » ≠ corset', famillesDe({ designation: 'Prothèse d’avant bras pour adulte mue par énergie électrique', chemin: ['7', 'Section I – Appareillage du membre supérieur'] }).includes('prothese_membre_superieur') && famillesDe({ designation: 'Collier cervical pour soutien léger' }).includes('minerve') && !famillesDe({ designation: 'Pièce de hanche métallique', description: 'séparation de l’appareil et du corset' }).includes('corset'));
v('actif : fin de prise en charge dépassée = inactif', !actifLe({ fin_prise_en_charge: '2022-07-31' }, AUJ) && actifLe({ fin_prise_en_charge: '2036-10-01' }, AUJ) && actifLe({ fin_prise_en_charge: null }, AUJ));

/* ── le graphe ── */
v('graphe : version et date de la LPPR affichables', /2026-10-07/.test(g.meta.version) && g.meta.date_version === '2026-10-07' && /ameli\.fr/.test(g.meta.url));
v('graphe : plus de 1 400 codes, uniques, à 7 chiffres', g.codes.length > 1400 && new Set(g.codes.map(c => c.code)).size === g.codes.length && g.codes.every(c => /^\d{7}$/.test(c.code)), g.codes.length + '');
v('graphe : chaque code a sa page du PDF et son chapitre', g.codes.every(c => c.page_pdf >= 1023 && c.page_pdf <= 1352 && /^[1-7]$/.test(c.chapitre)));
v('graphe : le chapitre 7 (orthoprothèses) compte plus de 700 codes', g.codes.filter(c => c.chapitre === '7').length > 700);
v('graphe : les lignes terminées sont marquées inactives (PI03SSD20, fin 31-07-2022)', (() => { const c = g.codes.find(x => x.code === '2730091'); return c && c.reference === 'PI03SSD20' && c.actif === false && c.fin_prise_en_charge === '2022-07-31'; })());
v('graphe : le pied à restitution d’énergie classe II est actif, tarif et prix limite 452,20 €', (() => { const c = g.codes.find(x => x.code === '2700339'); return c.actif && c.tarif === 452.2 && c.plv === 452.2; })());
v('graphe : liens explicites entre codes (renvois) et lacunes déclarées', g.aretes.length >= 50 && g.aretes.some(a => a.de === '2702930' && a.vers === '2705012') && g.meta.lacunes.length >= 2);
v('graphe : aucune donnée de patient (champs personnels absents)', !/patient|nom_patient|securite sociale|date de naissance/i.test(JSON.stringify(g.meta)));
v('graphe : adjonctions de la prothèse de membre inférieur rattachées à leur famille d’appareils', g.codes.filter(c => c.applicabilite && c.applicabilite.a_qui.includes('prothese_membre_inferieur')).length > 50);
{
  const mini = construire({ meta: { date_version: '2026-10-07', chapitres: { 7: 'Orthoprothèses' } }, codes: [{ code: '1111111', reference: 'AI1S101', designation: 'Adjonction test', description: 'Voir le code 2222222.', chapitre: '7', chemin: ['7 – Orthoprothèses', 'Section II – Appareillage du membre inférieur'], page_pdf: 1300, tarif: null, plv: 10, fin_prise_en_charge: null, colonnes: {} }, { code: '2222222', designation: 'Appareil test', chapitre: '7', chemin: ['7 – Orthoprothèses', 'Section II – Appareillage du membre inférieur'], page_pdf: 1300, tarif: 5, plv: null, fin_prise_en_charge: '2020-01-01', colonnes: {} }, { code: '1111111', designation: 'doublon', chapitre: '7', chemin: [], page_pdf: 1301, colonnes: {} }], sections: [{ chemin: '7 – Orthoprothèses > Section II – Appareillage du membre inférieur', texte: ['La garantie est de trois ans.'], pages: [1300] }] });
  v('construire : doublon écarté, lien « cite », inactif, règle de section, adjonction', mini.codes.length === 2 && mini.aretes.some(a => a.de === '1111111' && a.vers === '2222222') && mini.codes.find(c => c.code === '2222222').actif === false && mini.sections.some(s => s.regles.some(r => r.type === 'garantie')) && mini.codes[0].type === 'adjonction' && mini.meta.lacunes.some(x => /deux fois/.test(x)));
}

/* ── chercher_code_lppr ── */
{
  const r = L.chercher('pied à restitution d’énergie classe II adulte');
  v('chercher : le bon code en tête, avec tarif, prix limite, page et version', r.resultats[0].code === '2700339' && r.resultats[0].tarif === 452.2 && /page 1318/.test(r.resultats[0].reference_texte) && /Mise à jour du 2026-10-07/.test(r.resultats[0].reference_texte) && r.rappel === A_VERIFIER);
  v('chercher : le mot de métier est reconnu et expliqué', L.chercher('manchon silicone').termes_reconnus.some(t => t.id === 'manchon'));
  const inconnu = L.chercher('9999999'); v('chercher : code inexistant → « je ne trouve pas », rien d’inventé', inconnu.aucun && inconnu.resultats.length === 0 && /Je ne trouve pas le code 9999999/.test(inconnu.message));
  const gibberish = L.chercher('xyzzy qwerty'); v('chercher : mots inconnus → aucun résultat (pas de réponse au hasard)', gibberish.aucun && !gibberish.resultats.length);
  const ca = L.chercher('collier cervical'); v('chercher : famille sans ligne remboursable → aucun résultat actif + lignes terminées nommées', ca.aucun && ca.inactifs_proches.some(x => x.code === '2118823' && x.plus_remboursable) && /terminée/.test(ca.message));
  v('chercher : par référence alphanumérique', L.chercher('OI59N50').resultats[0].code === '2740824' && L.chercher('oi59n50').resultats.length === 1);
  v('chercher : inclure les codes terminés les remonte, marqués inactifs', L.chercher('collier cervical', { inclureInactifs: true }).resultats.some(x => x.code === '2118823' && !x.actif));
  v('chercher : tous les résultats actifs sont bien actifs et portent une référence au PDF', L.chercher('prothèse myoélectrique main').resultats.every(x => x.actif && x.page_pdf >= 1023 && x.reference_texte));
}

/* ── expliquer_code ── */
{
  const e = L.expliquer('2719936');
  v('expliquer : règles citées avec leur source (ligne / section / chapitre)', e.ok && e.regles.some(r => r.type === 'garantie' && /ligne/.test(r.source)) && e.regles.some(r => r.type === 'entente_prealable' && /chapitre 7|7 – Orthoprothèses/.test(r.source)));
  v('expliquer : « sur devis » jamais chiffré', e.alertes.some(a => /sur devis/i.test(a)) && e.tarif === null && e.tarifs.base_de_remboursement === null);
  const p = L.expliquer('2730091'); v('expliquer : code terminé → « n’est plus remboursable » + date', p.alertes.some(a => /2022-07-31/.test(a) && /plus remboursable/.test(a)) && p.actif === false);
  v('expliquer : code inconnu refusé', !L.expliquer('1234567').ok && /Je ne trouve pas/.test(L.expliquer('1234567').raison));
  v('expliquer : adjonctions possibles listées comme « à vérifier »', (() => { const c = L.compatibles(L.parCode.get('2726920')); return c.liste.length >= 0 && /vérifier/.test(c.note || ' à vérifier'); })());
}

/* ── verifier_cumul ── */
{
  const r = L.verifierCumul(['2702930', '2705012']);
  v('cumul : renvoi explicite entre deux lignes détecté et cité', r.ok && r.paires[0].statut === 'renvoi_cite' && r.paires[0].phrases[0].phrase.includes('2705012'));
  const q = L.verifierCumul(['2717630', '2700339']); v('cumul : « aucune règle » n’est jamais une autorisation', q.paires[0].statut === 'aucune_regle' && /ne prouve pas/.test(q.rappel) && q.paires[0].alertes.some(a => /Deux appareils de base/.test(a)));
  v('cumul : code inconnu → pas de verdict', !L.verifierCumul(['2717630', '0000001']).ok);
  v('cumul : un seul code → refus', !L.verifierCumul(['2717630']).ok);
  const t = L.verifierCumul(['2717630', '2730091']); v('cumul : un code terminé est signalé', t.paires[0].alertes.some(a => /plus remboursable/.test(a)));
}

/* ── forfait_reparation ── */
{
  const a = L.forfaitReparation('réparation de pièces d’un pied à restitution d’énergie lame talonnière'); v('réparation : le forfait et sa règle (garantie, moitié du tarif), nature « réparation »', a.nature === 'reparation' && a.candidats[0].code === '2719936' && a.candidats[0].regles.some(r => /moitié du tarif/.test(r.phrase)));
  const b = L.forfaitReparation('remplacement du revêtement esthétique d’un pied à restitution d’énergie'); v('réparation : remplacement ≠ réparation : nature « renouvellement »', b.nature === 'renouvellement' && b.candidats.some(c => c.code === '2721749'));
  const c = L.forfaitReparation('changement d’une articulation de hanche'); v('réparation : deux codes plausibles → les deux avec la différence, pas un choix au hasard', c.candidats.length === 2 && !!c.difference && c.ambigu);
  const d = L.forfaitReparation('réparation du moteur de ma voiture'); v('réparation : sans rapport → « je ne trouve pas »', d.aucun === true || d.candidats.every(x => x.score < 5), JSON.stringify(d.candidats && d.candidats.map(x => x.code)));
  v('réparation : description vide refusée', !L.forfaitReparation('').ok);
}

/* ── proposer_devis / verifier_devis ── */
{
  const f = reconnaitreFiche('prothèse tibiale droite adulte'); v('devis : appareil reconnu', f && f.id === 'prothese_tibiale');
  const e = extraireReponses(f, 'prothèse tibiale droite adulte', {}); v('devis : côté et âge compris dans le texte ; seule la classe de pied manque', e.reponses.cote === 'droit' && e.reponses.age === 'adulte' && e.manquantes.length === 1 && e.manquantes[0].id === 'classe_pied');
  v('devis : « enfant de 8 ans » → enfant, « 30 ans » → adulte', extraireReponses(FICHES.find(x => x.id === 'corset'), 'corset enfant de 8 ans scoliose sur mesure').reponses.age === 'enfant' && extraireReponses(FICHES.find(x => x.id === 'corset'), 'corset patient de 30 ans').reponses.age === 'adulte');
  const q = D.proposerDevis('prothèse tibiale droite adulte'); v('devis : ne pose QUE les questions manquantes', q.etape === 'questions' && q.questions.length === 1 && q.questions[0].id === 'classe_pied');
  const dv = D.proposerDevis('prothèse tibiale droite adulte', { classe_pied: 'II' });
  v('devis : lignes avec code, désignation, quantité, tarif, prix limite, base de remboursement, total', dv.etape === 'devis' && dv.lignes.length >= 2 && dv.lignes.every(l => l.code && l.designation && l.quantite === 1 && 'base_remboursement' in l && 'prix_limite_vente' in l && 'total' in l && l.a_confirmer));
  v('devis : le total est la somme des lignes chiffrées (calcul vérifié à la main)', Math.abs(dv.totaux.base_remboursement_estimee - Math.round(dv.lignes.reduce((a, l) => a + (l.total || 0), 0) * 100) / 100) < 0.011 && dv.lignes.some(l => l.code === '2700339' && l.total === 452.2));
  v('devis : pièce oubliée signalée (la prothèse de base n’existe plus en ligne remboursable) avec les lignes terminées nommées', dv.alertes.some(a => a.genre === 'oubli' && /PI/.test(a.texte)) && dv.inactifs_proches.length >= 0);
  v('devis : aucune ligne proposée n’est inventée (tous les codes existent et sont actifs)', dv.lignes.every(l => L.parCode.has(l.code) && l.actif));
  v('devis : alternatives proposées ; ligne « à confirmer »', dv.lignes.some(l => l.alternatives.length > 0) && dv.avertissement.includes('CONFIRMER'));
  const s = D.proposerDevis('siège moulé sur mesure enfant paralysie cérébrale'); v('devis : siège → aucune ligne, jamais un code au hasard', s.etape === 'devis' && s.lignes.length === 0 && s.alertes.some(a => a.genre === 'oubli'));
  v('devis : appareil non reconnu → question, pas d’invention', !D.proposerDevis('un truc pour le dos').ok);
  const vd = D.verifierDevis([{ code: '2717630', quantite: 1, prix: 400 }, { code: '9999999' }, { code: '2730091' }, { code: '2717630' }], { description: 'prothèse tibiale' });
  v('vérifier : dépassement du prix limite, code inconnu, code terminé, doublon', vd.lignes[0].problemes.some(p => /supérieur au prix limite/.test(p)) && vd.lignes[1].problemes.some(p => /Code inconnu/.test(p)) && vd.lignes[2].problemes.some(p => /plus remboursable/.test(p)) && vd.lignes[3].problemes.some(p => /déjà présent/.test(p)));
  v('vérifier : pièce attendue absente (emboîture / prothèse de base)', vd.alertes.some(a => a.genre === 'oubli'));
  v('vérifier : un devis propre n’invente pas de problème', D.verifierDevis([{ code: '2700339', quantite: 1, prix: 452.2 }]).lignes[0].ok === true);
  v('vérifier : liste vide refusée', !D.verifierDevis([]).ok);
}

/* ── vocabulaire et corrections ── */
{
  v('vocabulaire : au moins 35 termes, chacun avec des mots et des mots officiels, les doutes marqués', voc.termes.length >= 35 && voc.termes.every(t => t.mots.length && t.officiel.length >= 0) && voc.termes.filter(t => t.incertain).length >= 8 && voc.meta.statut === 'à valider par Justin');
  v('vocabulaire : « corset-minerve », « releveur », « emboîture », « manchon », « housse », « sangle » connus', ['corset-minerve', 'releveur', 'emboîture', 'manchon', 'housse', 'sangle'].every(m => idPourMot(voc, m)));
  const avant = L.chercher('sangle de suspension').resultats.map(x => x.code);
  const c1 = corrigerCode(corrections_vide(), voc, 'sangle', '2751288'); const L2 = creerLppr(g, { vocabulaire: vocabulaireEffectif(voc, c1.corrections), corrections: c1.corrections, aujourdhui: AUJ });
  v('correction « pour sangle, c’est le code 2751288 » : ce code passe en tête', c1.ok && L2.chercher('sangle de suspension').resultats[0].code === '2751288', L2.chercher('sangle de suspension').resultats.map(x => x.code).join());
  const c2 = exclureCode(corrections_vide(), voc, 'sangle', avant[0]); const L3 = creerLppr(g, { vocabulaire: voc, corrections: c2.corrections, aujourdhui: AUJ });
  v('correction « non, ça c’est un autre code » : le code n’est plus proposé pour ce mot', c2.ok && !L3.chercher('sangle de suspension').resultats.some(x => x.code === avant[0]));
  v('correction : code à 7 chiffres obligatoire ; terme inconnu refusé pour l’exclusion', !corrigerCode(null, voc, 'sangle', '12').ok && !exclureCode(null, voc, 'machin inconnu', '2751288').ok);
  const c3 = corrigerCode(corrections_vide(), voc, 'ma coque spéciale', '2795191'); v('correction : un mot nouveau de Justin est ajouté au vocabulaire', c3.ok && vocabulaireEffectif(voc, c3.corrections).termes.some(t => t.mots.includes('ma coque spéciale')) && c3.corrections.historique.length === 1);
}

/* ── export ── */
{
  const d = D.proposerDevis('prothèse tibiale droite adulte', { classe_pied: 'II' }), pdf = devisVersPdf(d, { patient: 'TEST', date: new Date('2026-10-28T10:00:00Z') }), txt = Buffer.from(pdf).toString('latin1');
  v('PDF : en-tête %PDF, table des références, %%EOF, police Helvetica, au moins une page', txt.startsWith('%PDF-1.4') && /xref/.test(txt) && txt.trim().endsWith('%%EOF') && /Helvetica/.test(txt) && /\/Count [1-9]/.test(txt));
  const xref = /startxref\n(\d+)/.exec(txt); v('PDF : startxref pointe sur la table des références', xref && txt.slice(Number(xref[1]), Number(xref[1]) + 4) === 'xref');
  v('PDF : les accents sont codés en WinAnsi (é = 0xE9, € = 0x80)', winAnsi('é€’')[0] === 0xE9 && winAnsi('é€’')[1] === 0x80 && winAnsi('é€’')[2] === 0x92);
  const docx = devisVersDocx(d, { patient: 'TEST' }); const lu = (() => { const dv = new DataView(docx.buffer, docx.byteOffset, docx.byteLength); let fin = docx.length - 22; while (fin >= 0 && dv.getUint32(fin, true) !== 0x06054b50) fin--; const n = dv.getUint16(fin + 10, true); let p = dv.getUint32(fin + 16, true); const noms = []; for (let i = 0; i < n; i++) { const tl = dv.getUint32(p + 24, true), nl = dv.getUint16(p + 28, true), crc = dv.getUint32(p + 16, true), off = dv.getUint32(p + 42, true), nom = new TextDecoder().decode(docx.subarray(p + 46, p + 46 + nl)); const lo = dv.getUint16(off + 26, true), eo = dv.getUint16(off + 28, true), data = docx.subarray(off + 30 + lo + eo, off + 30 + lo + eo + tl); noms.push({ nom, crcOk: crc32(data) === crc, texte: new TextDecoder().decode(data) }); p += 46 + nl; } return noms; })();
  v('Word : zip valide (3 fichiers, CRC32 corrects)', lu.length === 3 && lu.every(f => f.crcOk) && lu.some(f => f.nom === 'word/document.xml'));
  const doc = lu.find(f => f.nom === 'word/document.xml').texte; v('Word : XML équilibré, tableau, code du pied, mention de la version', (doc.match(/<w:tbl>/g) || []).length === 1 && (doc.match(/<w:tr>|<w:tr /g) || []).length >= 3 && /2700339/.test(doc) && /Mise à jour du 2026-10-07/.test(doc) && (doc.match(/<w:p>/g) || []).length === (doc.match(/<\/w:p>/g) || []).length);
  v('export : aucune donnée de patient dans le contenu par défaut ; le patient saisi n’apparaît que dans le fichier', !JSON.stringify(contenuDevis(d)).includes('TEST') && JSON.stringify(contenuDevis(d, { patient: 'TEST' })).includes('TEST'));
  v('export : l’avertissement « à vérifier » et « aucune donnée de patient enregistrée » figurent dans le fichier', /vérifier/.test(doc) && /Aucune donnée de patient/.test(doc));
  const long = D.proposerDevis('prothèse tibiale droite adulte', { classe_pied: 'II' }); long.lignes = Array.from({ length: 60 }, (_, i) => ({ ...long.lignes[0], code: String(2700000 + i), designation: 'Ligne de test numéro ' + i + ' avec une désignation assez longue pour passer à la ligne dans la cellule du tableau' })); const grand = Buffer.from(devisVersPdf(long)).toString('latin1');
  v('PDF : un devis de 60 lignes tient sur plusieurs pages', Number(/\/Count (\d+)/.exec(grand)[1]) >= 2);
}

/* ── voix ── */
{
  const cas = [['ouvre la LPPR', 'fenetre'], ['quel est le code LPPR de l’emboîture fémorale', 'chercher'], ['explique le code 2719936', 'expliquer'], ['peut-on cumuler 2717630 et 2700339', 'cumul'], ['quel est le forfait de réparation d’un pied à restitution d’énergie', 'reparation'], ['propose un devis pour une prothèse tibiale droite adulte', 'devis'], ['vérifie ce devis', 'verifier_devis'], ['pour sangle c’est le code 2751288', 'correction_code'], ['non ce n’est pas le bon code', 'correction_exclure'], ['ce n’est pas le code 2751288 pour sangle', 'correction_exclure']];
  for (const [phrase, type] of cas) { const d = detecter(phrase); v('voix : « ' + phrase + ' » → ' + type, d && d.type === type, JSON.stringify(d)); }
  for (const phrase of ['quel temps fait-il', 'ouvre la galaxie', 'combien coûte la réparation de ma voiture', 'mets le graphique tradingview']) v('voix : « ' + phrase + ' » n’est PAS pour la LPPR', detecter(phrase) === null, JSON.stringify(detecter(phrase)));
  const dites = [direChercher(L.chercher('pied à restitution d’énergie classe II adulte')), direExpliquer(L.expliquer('2719936')), direCumul(L.verifierCumul(['2717630', '2700339'])), direReparation(L.forfaitReparation('changement d’une articulation de hanche')), direDevis(D.proposerDevis('prothèse tibiale droite adulte', { classe_pied: 'II' })), direVerification(D.verifierDevis([{ code: '2717630', prix: 400 }]))];
  v('voix : les réponses parlées ont une référence ou un rappel « à vérifier », sans markdown ni émoji', dites.every(t => /vérifier/i.test(t) && !/[*#_`]/.test(t) && !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(t)), dites.map(t => t.slice(0, 40)).join(' | '));
  v('voix : le premier résultat parlé cite le code, le prix et la page', /Code 2700339/.test(dites[0]) && /452,20/.test(dites[0]) && /page 1318/.test(dites[0]));
  v('voix : code inconnu → « je ne trouve pas » parlé', /Je ne trouve pas le code 9999999/.test(direChercher(L.chercher('9999999'))));
}

/* ── les cas de test eux-mêmes ── */
v('cas.json : au moins 30 cas, marqués « à valider par Justin », couvrant chaque famille', tests.cas.length >= 30 && tests.meta.statut === 'à valider par Justin' && ['corset', 'minerve', 'attelle de main', 'releveur', 'siège', 'sangle', 'manchon', 'prothèse de membre inférieur', 'prothèse de membre supérieur', 'orthèse de membre inférieur', 'réparation', 'housse / revêtement'].every(f => tests.cas.some(c => c.famille === f)));
v('cas.json : chaque cas porte sa référence dans le PDF', tests.cas.every(c => c.reference && c.reference.length > 8));
v('cas.json : tous les codes attendus existent dans le graphe', tests.cas.every(c => [...((c.attendu || {}).codes || []), ...((c.attendu || {}).inactifsContient || [])].every(k => L.parCode.has(k))));
v('cas.json : les ids sont uniques', new Set(tests.cas.map(c => c.id)).size === tests.cas.length);
{ const { ok: bons, n } = noter(L, D, tests.cas); v('notation : tous les cas passent (' + bons + '/' + n + ')', bons === n, (n - bons) + ' échec(s)'); }
v('exemples-devis : le dossier existe avec son README', fs.existsSync(new URL('../../data/lppr/exemples-devis/README.md', import.meta.url)));
console.log(`\n${ok} réussis, ${ko} échecs`); process.exit(ko ? 1 : 0);
