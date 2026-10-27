# Extrait quelques fichiers CSV de l'archive Kraken_OHLCVT_Full.zip SANS la recoller (les 5 morceaux sont lus bout a bout : pas de 10 Go en plus sur le disque).
# usage : python -I extraire-kraken.py <dossier_morceaux> <dossier_sortie> <regex_noms>
import io, os, re, sys, zipfile

class Morceaux(io.RawIOBase):
    def __init__(self, chemins):
        self.f = [open(c, 'rb') for c in chemins]
        self.t = [os.path.getsize(c) for c in chemins]
        self.total = sum(self.t); self.pos = 0
    def readable(self): return True
    def seekable(self): return True
    def tell(self): return self.pos
    def seek(self, off, wh=0):
        self.pos = off if wh == 0 else (self.pos + off if wh == 1 else self.total + off)
        return self.pos
    def readinto(self, b):
        n = len(b); out = 0; p = self.pos
        for fh, t in zip(self.f, self.t):
            if p >= t: p -= t; continue
            fh.seek(p); lu = fh.read(min(n - out, t - p)); b[out:out + len(lu)] = lu; out += len(lu); p = 0
            if out >= n: break
        self.pos += out; return out

def main():
    dossier, sortie, motif = sys.argv[1], sys.argv[2], re.compile(sys.argv[3])
    chemins = sorted(os.path.join(dossier, x) for x in os.listdir(dossier) if re.search(r'\.zip\.part\d+$', x))
    os.makedirs(sortie, exist_ok=True)
    archives = []   # (etiquette, archive) : un sous-dossier par archive, la fusion se fait cote Node (un trimestriel ne doit JAMAIS ecraser l'historique)
    if chemins: archives.append(('complet', zipfile.ZipFile(io.BufferedReader(Morceaux(chemins)))))
    for x in sorted(os.listdir(dossier)):
        if x.endswith('.zip'): archives.append((x[:-4], zipfile.ZipFile(os.path.join(dossier, x))))
    n = 0
    for etiquette, z in archives:
        os.makedirs(os.path.join(sortie, etiquette), exist_ok=True)
        for info in z.infolist():
            base = os.path.basename(info.filename)
            if info.is_dir() or not motif.search(base): continue
            with z.open(info) as a, open(os.path.join(sortie, etiquette, base), 'wb') as b:
                while True:
                    bloc = a.read(1 << 20)
                    if not bloc: break
                    b.write(bloc)
            n += 1; print('extrait', etiquette + '/' + base)
    print('total', n)
main()
