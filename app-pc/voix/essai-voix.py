# -*- coding: utf-8 -*-
"""Essai du service de voix locale : synthétise la phrase d'essai avec chaque voix, mesure durée, latence et niveau sonore.
Usage : assets-lourds/voix/py/Scripts/python.exe app-pc/voix/essai-voix.py [port]"""
import json, sys, time, math, struct, wave, io, urllib.request

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8766
PHRASE = "Bonjour, je suis Rayle. L'or est à quatre mille soixante-dix dollars, au-dessus de sa moyenne mobile."

sante = json.load(urllib.request.urlopen('http://127.0.0.1:%d/sante' % PORT))
print('moteurs :', sante['moteurs'])
for v in sante['voix']:
    req = urllib.request.Request('http://127.0.0.1:%d/synth' % PORT, data=json.dumps({'voix': v['id'], 'texte': PHRASE, 'vitesse': 1.0}).encode('utf-8'), headers={'Content-Type': 'application/json; charset=utf-8'})
    t0 = time.time()
    try:
        wav = urllib.request.urlopen(req, timeout=60).read()
    except Exception as e:   # noqa
        print(v['id'], 'ECHEC', e); continue
    dt = time.time() - t0
    w = wave.open(io.BytesIO(wav)); n = w.getnframes(); s = struct.unpack('<%dh' % n, w.readframes(n))
    rms = math.sqrt(sum(x * x for x in s) / n) / 32768
    open('essai-%s.wav' % v['id'], 'wb').write(wav)
    print('%-14s %.2fs de parole en %.2fs (x%.1f temps réel) niveau %.3f' % (v['id'], n / w.getframerate(), dt, (n / w.getframerate()) / dt, rms))
