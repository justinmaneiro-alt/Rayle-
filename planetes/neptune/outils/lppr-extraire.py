# Extrait le Titre II de la LPP officielle (PDF ameli) vers data/lppr/lppr_titre2.json.
# Usage : python planetes/neptune/outils/lppr-extraire.py data/lppr/source/LPP-071026.pdf 2026-10-07
# Aucune donnee inventee : une cellule illisible reste vide (null). Les tarifs viennent des tableaux du PDF.
import json, re, sys
import pdfplumber

pdf_path = sys.argv[1]
version = sys.argv[2] if len(sys.argv) > 2 else None
sortie = sys.argv[3] if len(sys.argv) > 3 else 'data/lppr/lppr_titre2.json'

pdf = pdfplumber.open(pdf_path)
n = len(pdf.pages)
RE_CODE = re.compile(r'^\d{7}$')
RE_CHAP = re.compile(r'Chapitre\s+([1-7])\s*[:.]\s*[–-]?\s*([^\n]{3,80})')
RE_TITRE_CHAP = re.compile(r'^Chapitre\s+([1-7])\s*[:.]')
MOTS = {'1': ['Orthèses'], '2': ['Optique'], '3': ['Aides auditives'], '4': ['Prothèses externes non'], '5': ['Prothèses oculaires'], '6': ['Podo'], '7': ['Orthoprothèses']}
RE_T3 = re.compile(r'^\s*Titre III\s*\.?\s*[–-]', re.M)


def nombre(c):
    if c is None:
        return None
    s = c.replace('\n', ' ').strip().replace(' ', '').replace(' ', '')
    m = re.fullmatch(r'(\d+(?:[.,]\d+)?)', s)
    return float(m.group(1).replace(',', '.')) if m else None


def date(c):
    if not c:
        return None
    m = re.search(r'(\d{2})-(\d{2})-(\d{4})', c)
    return m.group(3) + '-' + m.group(2) + '-' + m.group(1) if m else None


def texte(c):
    return re.sub(r'[ \t]+', ' ', (c or '').replace('­', '')).strip()


# 1) bornes : debut = page ou le texte du Titre II commence, fin = debut du Titre III (corps)
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
if fin is None:
    fin = debut + 330
print('Titre II : pages', debut + 1, 'a', fin, file=sys.stderr)

entrees, chap, intitules = [], {}, {}
chap_courant = '1'
intitule_chap = 'Orthèses (ex-petit appareillage)'
cols = None
vus = {}
for i in range(debut, fin):
    p = pdf.pages[i]
    t = p.extract_text() or ''
    for l in t.splitlines():
        m = RE_TITRE_CHAP.match(l.strip())
        if m and any(k in l for k in MOTS[m.group(1)]):
            chap_courant = m.group(1)
            intitules[chap_courant] = re.sub(r'^Chapitre\s+\d\s*[:.]\s*[–-]?\s*', '', l.strip()).strip(' .–-')
    for tab in p.extract_tables():
        for r in tab:
            if not r:
                continue
            c0 = (r[0] or '').strip()
            if c0.lower() == 'code':
                cols = [texte(x).lower() for x in r]
                continue
            if not RE_CODE.match(c0):
                continue
            des = texte(r[1]) if len(r) > 1 else ''
            reste = r[2:]
            if not des and reste and texte(reste[0]) and nombre(reste[0]) is None and len(texte(reste[0])) > 8:
                des, reste = texte(reste[0]), reste[1:]   # designation decalee d'une colonne dans certains tableaux
            tarif = plv = fin_pec = None
            noms = cols[2:] if cols and len(cols) == len(r) else None
            for k, c in enumerate(reste):
                nom = noms[k] if noms else ''
                if 'plv' in nom or 'vente' in nom:
                    plv = nombre(c) if nombre(c) is not None else (texte(c) if texte(c) else plv)
                elif 'date' in nom or 'fin' in nom:
                    fin_pec = date(c) or fin_pec
                elif 'tarif' in nom or 'responsabilit' in nom or nom == '':
                    if tarif is None:
                        v = nombre(c)
                        tarif = v if v is not None else (texte(c) or None)
                if date(c) and fin_pec is None and not noms:
                    fin_pec = date(c)
            if tarif in ('-', '–', ''):
                tarif = None
            if plv in ('-', '–', ''):
                plv = None
            lignes = [x.strip() for x in des.split('\n') if x.strip()]
            e = {
                'code': c0,
                'intitule': lignes[0] if lignes else '',
                'texte': '\n'.join(lignes[1:]),
                'chapitre': chap_courant,
                'chapitre_titre': intitules.get(chap_courant, intitule_chap),
                'tarif': tarif,
                'plv': plv,
                'fin_prise_en_charge': fin_pec,
                'page_pdf': i + 1,
                'colonnes_brutes': [texte(x) for x in reste],
                'lecture_colonnes': 'entete' if noms else 'estimee',
                'entetes': noms if noms else None,
            }
            # un code peut revenir sur deux pages (tableau coupe) : on garde la ligne la plus complete
            if c0 in vus:
                a = entrees[vus[c0]]
                if len(e['intitule'] + e['texte']) > len(a['intitule'] + a['texte']):
                    entrees[vus[c0]] = e
                continue
            vus[c0] = len(entrees)
            entrees.append(e)

meta = {
    'source': 'Liste des produits et prestations remboursables (LPP), Titre II, Assurance Maladie (ameli.fr)',
    'url': 'https://www.ameli.fr/sites/default/files/Documents/LPP-071026.pdf',
    'version': 'Mise à jour du ' + (version or '?'),
    'date_version': version,
    'pages_pdf': [debut + 1, fin],
    'nombre_codes': len(entrees),
    'chapitres': intitules,
    'avertissement': 'Index local construit automatiquement à partir du PDF officiel. Ne remplace pas la nomenclature officielle : à vérifier avec la version en vigueur (ameli.fr, Légifrance).',
}
json.dump({'meta': meta, 'codes': entrees}, open(sortie, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
par = {}
for e in entrees:
    par[e['chapitre']] = par.get(e['chapitre'], 0) + 1
print(len(entrees), 'codes', par, file=sys.stderr)
