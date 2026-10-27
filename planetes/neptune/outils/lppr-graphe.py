# Reconstruit la LPPR (Titre II) de façon STRUCTURÉE à partir du PDF officiel de l'Assurance Maladie : hiérarchie (chapitre > section > sous-section), lignes de codes avec leurs colonnes,
# dispositions générales, phrases de règles. Sortie : data/lppr/graphe-brut.json (puis `node core/lppr/construire-graphe.mjs` fabrique data/lppr/graphe.json et l'index).
# Usage : python -I planetes/neptune/outils/lppr-graphe.py data/lppr/source/LPP-071026.pdf 2026-10-07
# Aucune donnée inventée : une cellule illisible reste vide (null) ; chaque information garde sa page du PDF.
import json, re, sys
import pdfplumber

pdf_path = sys.argv[1]
version = sys.argv[2] if len(sys.argv) > 2 else None
sortie = sys.argv[3] if len(sys.argv) > 3 else 'data/lppr/graphe-brut.json'
pdf = pdfplumber.open(pdf_path)
RE_CODE = re.compile(r'^\d{7}$')
RE_T3 = re.compile(r'^\s*Titre III\s*\.?\s*[–-]', re.M)
RE_LIGNE_CODE = re.compile(r'^(\d{7})\s+(.+)$')
RE_DATE = re.compile(r'\d{2}-\d{2}-\d{4}')
RE_DATE_SEULE = re.compile(r'^\s*(\d{4})\s*$|^\s*\d{2}-\d{2}-\d{4}\s*$')
RE_MONTANT_FIN = re.compile(r'(?:^|\s)(-|\d{1,3}(?: \d{3})*,\d{1,2}|\d+,\d{1,2})\s*$')
RE_TITREISH = re.compile(r'^(Chapitre|Section|Sous-section|§|Titre)\b', re.I)
NETTOIE = lambda s: re.sub(r'[ \t ]+', ' ', (s or '').replace('­', '')).strip()


def nombre(c):
    if c is None:
        return None
    s = re.sub(r'\s', '', c.replace('\n', ' '))
    m = re.fullmatch(r'(\d+(?:[.,]\d+)?)', s)
    return float(m.group(1).replace(',', '.')) if m else None


def date(c):
    m = re.search(r'(\d{2})-(\d{2})-(\d{4})', c or '')
    return m.group(3) + '-' + m.group(2) + '-' + m.group(1) if m else None


# 1) bornes du Titre II
debut = fin = None
for i in range(1000, 1500):
    t = pdf.pages[i].extract_text() or ''
    if debut is None and 'Titre II. – Orthèses et Prothèses externes' in t and 'spécifications techniques' in t:
        debut = i
    elif debut is not None and RE_T3.search(t[:500]) and i > debut + 100:
        fin = i
        break
if debut is None:
    sys.exit('debut du Titre II introuvable')
fin = fin or debut + 330
print('Titre II : pages', debut + 1, 'a', fin, file=sys.stderr)

# 2) niveaux de titres
NIVEAUX = [
    ('chapitre', re.compile(r'^Chapitre\s+([1-7])\s*[:.]?\s*[–-]?\s*(.*)$', re.I)),
    ('section', re.compile(r'^(Section\s+[IVX\d]+(?:er)?)\s*[:.]?\s*[–-]?\s*(.*)$', re.I)),
    ('sous_section', re.compile(r'^(Sous-section\s+[IVX\d]+)\s*[:.]?\s*[–-]?\s*(.*)$', re.I)),
    ('romain', re.compile(r'^([IVX]{1,5})\s*[.)]\s*[–-]\s*(.{3,})$')),
    ('lettre', re.compile(r'^([A-H])\s*[.)]\s*[–-]\s*(.{3,120})$')),
    ('nombre', re.compile(r'^(\d{1,2})\s*[°.)]\s*[–-]?\s*(.{3,120})$')),
    ('groupe', re.compile(r'^([A-Z]{1,3}\d{1,2})\s*:\s*(.{3,100})$')),
]
ORDRE = ['chapitre', 'section', 'sous_section', 'romain', 'lettre', 'nombre', 'groupe']
chemin = {}


def titre_de(ligne):
    for nom, rx in NIVEAUX:
        m = rx.match(ligne)
        if m:
            # une ligne de liste (« A. – Acier ; ») n'est pas un titre : elle finit par « ; » ou « , »
            if nom in ('lettre', 'nombre', 'romain') and (ligne.rstrip().endswith((';', ',', '.')) and len(ligne) < 40 or len(ligne) > 130):
                continue
            return nom, NETTOIE(m.group(1) + ((' – ' + m.group(2)) if m.group(2) else ''))
    return None, None


def chemin_texte():
    return [chemin[n] for n in ORDRE if n in chemin]


sections = {}      # chemin (texte) -> { 'texte': [lignes], 'pages': set }
lignes_codes = []
cols = None        # en-têtes du dernier tableau (conservés d'une page à l'autre : un tableau continue sur la page suivante sans répéter son en-tête)
courant = None     # dernière ligne de code (pour les cellules qui continuent sur la page suivante)
lignes_vues = 0

for i in range(debut, fin):
    page = pdf.pages[i]
    tables = page.find_tables()
    bbox = [t.bbox for t in tables]
    def hors_table(o, bbox=bbox):
        if o.get('object_type') != 'char':
            return True
        x, y = (o['x0'] + o['x1']) / 2, (o['top'] + o['bottom']) / 2
        return not any(b[0] - 1 <= x <= b[2] + 1 and b[1] - 1 <= y <= b[3] + 1 for b in bbox)
    libre = page.filter(hors_table)
    elements = []
    for ln in libre.extract_text_lines(return_chars=False):
        elements.append((ln['top'], 'texte', ln['text']))
    for t in tables:
        elements.append((t.bbox[1], 'table', t.extract()))
    elements.sort(key=lambda e: e[0])
    for _, genre, contenu in elements:
        if genre == 'texte':
            ligne = NETTOIE(contenu)
            if not ligne:
                continue
            mt = RE_LIGNE_CODE.match(ligne)
            if mt:
                # ligne de code écrite en texte (sans cadre de tableau) : prix en fin de ligne, parfois « Sur devis » ; la date de fin peut passer à la ligne suivante
                code, reste = mt.group(1), mt.group(2)
                fin_pc = date(reste)
                reste = RE_DATE.sub('', reste).strip()
                montants = []
                while True:
                    mm = RE_MONTANT_FIN.search(reste)
                    if not mm:
                        break
                    montants.insert(0, mm.group(1)); reste = reste[:mm.start()].rstrip()
                devis = bool(re.search(r'\bsur\s+(devis|facture)\b', reste, re.I))
                ref = None
                mr = re.match(r'^([A-Z]{1,4}\d[A-Z0-9.]{0,10})\.?\s+(.+)$', reste)
                if mr and not re.match(r'^(Sur|Prix)', reste):
                    ref, reste = mr.group(1), mr.group(2)
                d = {'code': code, 'page_pdf': i + 1, 'chemin': chemin_texte(), 'chapitre': None, 'reference': ref, 'designation': reste.strip(' -–') or None, 'description': None, 'prix_cession_ht': None, 'tarif': None, 'plv': None,
                     'tarif_brut': ' '.join(montants) or None, 'fin_prise_en_charge': fin_pc, 'colonnes': {}, 'lecture': 'texte'}
                vals = [nombre(m) for m in montants]
                if len(vals) == 1:
                    d['tarif'] = vals[0]
                elif len(vals) == 2:
                    d['tarif'], d['plv'] = vals
                elif len(vals) >= 3:
                    d['prix_cession_ht'], d['tarif'], d['plv'] = vals[-3:]
                if devis:
                    d['tarif_texte'] = 'Sur devis'
                lignes_codes.append(d); courant = d; lignes_vues += 1
                cle = ' > '.join(chemin_texte()) or '(début)'
                sections.setdefault(cle, {'texte': [], 'pages': []})['texte'].append(ligne)
                continue
            if courant is not None and courant.get('lecture') == 'texte' and not RE_TITREISH.match(ligne):
                fd = date(ligne) if RE_DATE_SEULE.match(ligne) else None
                if fd and not courant['fin_prise_en_charge']:
                    courant['fin_prise_en_charge'] = fd
                elif len(ligne) < 400 and not titre_de(ligne)[0] and not re.match(r'^(Code|CODE)\b', ligne) and courant.get('_n', 0) < 8:
                    courant['_n'] = courant.get('_n', 0) + 1
                    courant['description'] = NETTOIE((courant['description'] or '') + ' ' + ligne)
            nom, titre = titre_de(ligne)
            if nom:
                k = ORDRE.index(nom)
                for n in ORDRE[k:]:
                    chemin.pop(n, None)
                chemin[nom] = titre
            cle = ' > '.join(chemin_texte()) or '(début)'
            s = sections.setdefault(cle, {'texte': [], 'pages': []})
            s['texte'].append(ligne)
            if i + 1 not in s['pages']:
                s['pages'].append(i + 1)
            continue
        rows = contenu or []
        if not rows:
            continue
        ent = [NETTOIE((c or '').replace('\n', ' ')).lower() for c in rows[0]]
        if 'code' in ent[0] and len(ent) >= 3:
            cols = ent
            donnees = rows[1:]
        else:
            donnees = rows
        for r in donnees:
            r = [(c or '') for c in r]
            cell0 = [NETTOIE(x) for x in r[0].split(chr(10)) if NETTOIE(x)]
            code = (cell0[0] if cell0 else '').replace(' ', '')                  # la cellule « Code » contient parfois aussi la référence alphanumérique (2e ligne)
            ref_cellule = cell0[1] if len(cell0) > 1 else None
            if RE_CODE.match(code) and cols:
                d = {'code': code, 'page_pdf': i + 1, 'chemin': chemin_texte(), 'chapitre': (chemin.get('chapitre') or '').split(' ')[1].rstrip(':.–') if chemin.get('chapitre') else None,
                     'reference': None, 'designation': None, 'description': None, 'prix_cession_ht': None, 'tarif': None, 'plv': None, 'tarif_brut': None, 'fin_prise_en_charge': None, 'colonnes': {}}
                for nom_col, cell in zip(cols, r):
                    c = NETTOIE(cell)
                    if 'code' == nom_col:
                        continue
                    if 'nomenclature' in nom_col or 'signation' in nom_col:
                        lignes = [NETTOIE(x) for x in cell.split('\n') if NETTOIE(x)]
                        # les tableaux de grand appareillage commencent par la référence alphanumérique (ex. PS9C02)
                        if lignes and re.fullmatch(r'[A-Z]{1,3}\d[A-Z0-9.\-/ ]{0,14}', lignes[0]) and len(lignes) > 1:
                            d['reference'] = lignes[0]; lignes = lignes[1:]
                        d['designation'] = lignes[0] if lignes else None
                        d['description'] = NETTOIE(' '.join(lignes[1:])) or None
                    elif 'rence' in nom_col and 'tarif' not in nom_col:
                        d['reference'] = c or d['reference']
                    elif 'cession' in nom_col:
                        d['prix_cession_ht'] = nombre(c); d['colonnes']['prix_cession_ht'] = c
                    elif 'plv' in nom_col or 'limite' in nom_col:
                        d['plv'] = nombre(c); d['colonnes']['plv'] = c
                    elif 'tarif' in nom_col:
                        d['tarif'] = nombre(c); d['tarif_brut'] = c or None; d['colonnes']['tarif'] = c
                    elif 'date' in nom_col:
                        d['fin_prise_en_charge'] = date(c); d['colonnes']['date_fin'] = c
                if ref_cellule and not d['reference']:
                    d['reference'] = ref_cellule
                if d['tarif'] is None and d['tarif_brut'] is None:
                    d['tarif_brut'] = d['colonnes'].get('plv') or None
                for cle2 in ('tarif', 'plv'):
                    if d[cle2] is None and re.search(r'sur\s+(devis|facture)', ' '.join(r), re.I):
                        d[cle2 + '_texte'] = 'Sur devis' if re.search(r'devis', ' '.join(r), re.I) else 'Sur facture'
                lignes_codes.append(d); courant = d; lignes_vues += 1
            elif courant is not None and not code and any(NETTOIE(c) for c in r):
                # continuation d'une cellule (changement de page) : on rattache le texte à la ligne précédente
                suite = NETTOIE(' '.join(c for c in r[1:2]))
                if suite:
                    courant['description'] = NETTOIE((courant['description'] or '') + ' ' + suite)

print(lignes_vues, 'lignes de codes ;', len(sections), 'sections de texte', file=sys.stderr)
chapitres = {'1': 'Orthèses (ex-petit appareillage)', '2': 'Optique médicale', '3': 'Aides auditives', '4': 'Prothèses externes non orthopédiques', '5': 'Prothèses oculaires et faciales', '6': 'Podo-orthèses', '7': 'Orthoprothèses'}
for d in lignes_codes:
    m = re.match(r'(?:Chapitre\s+)?([1-7])\b', d['chemin'][0]) if d['chemin'] else None
    d['chapitre'] = m.group(1) if m else None
for d in lignes_codes:
    d.pop('_n', None)
json.dump({'meta': {'source': 'Liste des produits et prestations remboursables (LPP), Titre II, Assurance Maladie (ameli.fr)', 'url': 'https://www.ameli.fr/sites/default/files/Documents/LPP-071026.pdf', 'version': 'Mise à jour du ' + (version or '?'), 'date_version': version,
           'pages_pdf': [debut + 1, fin], 'chapitres': chapitres, 'avertissement': 'Index local construit automatiquement à partir du PDF officiel. Ne remplace pas la nomenclature officielle : à vérifier avec la version en vigueur (ameli.fr, Légifrance).'},
           'codes': lignes_codes, 'sections': [{'chemin': k, 'texte': v['texte'], 'pages': v['pages']} for k, v in sections.items()]}, open(sortie, 'w', encoding='utf-8'), ensure_ascii=False)
print('écrit', sortie, file=sys.stderr)
