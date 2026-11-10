# -*- coding: utf-8 -*-
"""Résume un fichier JSON produit par terminal-perf.mjs. Usage : python agent-trading/tests/perf-resume.py docs/perf-terminal-avant.json [apres.json]"""
import sys, json, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')


def lire(p):
    t = open(p, encoding='utf-8', errors='replace').read()
    return json.loads(t[t.index('{'):])


def afficher(d):
    for k, v in d.items():
        if isinstance(v, dict):
            print('%-22s %4s i/s  pire image %3s ms  tâches>100 ms : %s  pire tâche %s ms' % (k, v['fps'], v['pireImageMs'], v['tachesPlus100'], v['pireTacheMs']))
        elif k != 'profilTop':
            print(k, v)
    for l in d.get('profilTop', [])[:10]:
        print('   ', l)


for p in sys.argv[1:]:
    print('==', p)
    afficher(lire(p))
