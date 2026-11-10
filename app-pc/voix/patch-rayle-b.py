# -*- coding: utf-8 -*-
# Branche les analyses (partie B) dans rayle-terminal.js : contexte étendu, rapport du jour, bougie du carnet, motifs / régime, bouton. Outil à usage unique.
import sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read()


def rep(a, b):
    global s
    assert a in s, a[:70]
    s = s.replace(a, b, 1)


rep("import { intentionVoix,", "import { lignesEtendues } from './rapport-jour.js';\nimport { lectureBougieCarnet } from './carnet-bougie-calcul.js';\nimport { intentionVoix,")
i = s.index("function contexteComplet(e) {")
j = s.index("\n", i)
s = s[:i] + ("function contexteComplet(e) { const L = texteContexte(e, { fmt: f, heure }).split('\\n'), consignes = L.pop(); const An = T.module('analyses'); let ext = []; "
             "try { ext = An ? lignesEtendues(An.etat(e), { fmt: f }).slice(0, -1) : []; } catch (x) { /* analyses non chargées */ } "
             "return L.concat(lignesSections(sections(), { fmt: f, heure, maintenant: maintenant() }), ext, [consignes]).join('\\n'); }") + s[j:]
rep("    const iv = intentionVoix(texte,", r"""    const An = T.module('analyses'), niveauRapport = An ? An.estRapport(texte) : null;
    if (niveauRapport) { const R = await An.rapport(niveauRapport); E.dernierSujet = { sujet: 'rapport', niveau: niveauRapport }; afficherReponse(texte, R.texte, 'rapport du jour (calculs du terminal, sans IA)'); await retenir('rapport du jour demandé'); return R.parle; }
    if (An && /(bougie|pression) du carnet|delta des echanges|\bcvd\b/.test(norm0(texte))) { const rep = lectureBougieCarnet(An.bougiesCarnet().derniere()); afficherReponse(texte, rep, 'bougie du carnet (sans IA)'); return rep; }
    if (An && /(quels? (sont )?(les )?motifs|motifs de bougies?|regime|range ou tendance|que se passe[- ]t[- ]il sur mes niveaux)/.test(norm0(texte))) { An.calculer(); const m = An.motifs(), r = An.regime(), ev = An.evenements(); const rep = [r && r.regime !== 'inconnu' ? `Régime : ${r.regime} (${r.raison}).` : 'Régime : pas assez de bougies.', m.length ? m.map(x => x.texte).join(' ') : 'Pas de motif de bougie à la dernière clôture.', ev.length ? ev.map(x => x.texte).join(' ; ') + '.' : 'Rien de particulier sur tes niveaux.', MENTION_LECTURE].join(' '); afficherReponse(texte, rep, 'analyses du terminal (sans IA)'); return rep; }
    const iv = intentionVoix(texte,""")
rep("  async function commandeVoix(texte, iv) {", "  const norm0 = t => String(t || '').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');\n  async function commandeVoix(texte, iv) {")
rep("</form>", "</form><div class=\"tr-rapport-btn\"><button class=\"tr-btn\" type=\"button\" data-rapport>Rapport du jour</button> <small class=\"tr-doux\">les alertes marchent tant que Rayle est ouvert</small></div>")
rep("  pR.addEventListener('submit',", "  pR.addEventListener('click', async ev => { if (!ev.target.closest('[data-rapport]')) return; const r = await commande('fais-moi un rapport sur les marchés aujourd’hui', { force: true }); if (r) parler(r); });\n  pR.addEventListener('submit',")
open(p, 'w', encoding='utf-8').write(s)
print('ok')
