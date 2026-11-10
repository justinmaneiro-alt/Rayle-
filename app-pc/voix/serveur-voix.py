# -*- coding: utf-8 -*-
"""Service de synthèse vocale LOCAL de Raylé (gratuit, hors ligne, aucun cloud).

Moteurs : Kokoro (kokoro-onnx, voix française ff_siwis) et Piper (fr_FR-siwis-medium, fr_FR-upmc-medium « jessica »).
Écoute seulement sur 127.0.0.1. Lancé à la demande par serveur.mjs (app-pc/voix-locale.mjs) ; modèles dans assets-lourds/voix/modeles/
(installés une seule fois par `node app-pc/installer-voix.mjs`, ensuite tout marche sans réseau).

Routes :
  GET  /sante            -> {moteurs: {kokoro: {pret, erreur?}, piper: {...}}, voix: [...]}
  POST /synth            -> corps JSON {moteur, voix, texte, vitesse} ; réponse audio/wav (16 bits, mono)
Licences : voir NOTICE.md (kokoro-onnx MIT, modèle Kokoro Apache-2.0, Piper GPL-3.0 lancé comme programme séparé, voix SIWIS CC BY 4.0, UPMC CC BY-SA 4.0).
"""
import io, json, os, sys, threading, time, wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

DOSSIER = os.environ.get('RAYLE_VOIX_MODELES') or os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'assets-lourds', 'voix', 'modeles')
DOSSIER = os.path.abspath(DOSSIER)
PORT = int(os.environ.get('RAYLE_VOIX_PORT') or (sys.argv[1] if len(sys.argv) > 1 else 8766))

# voix proposées : identifiant -> (moteur, réglages)
VOIX = {
    'kokoro-siwis': {'moteur': 'kokoro', 'nom': 'Kokoro · Siwis (française)', 'voix': 'ff_siwis', 'licence': 'Apache-2.0 / CC BY 4.0'},
    'piper-siwis': {'moteur': 'piper', 'nom': 'Piper · Siwis (française)', 'fichier': 'fr_FR-siwis-medium.onnx', 'locuteur': None, 'licence': 'CC BY 4.0'},
    'piper-jessica': {'moteur': 'piper', 'nom': 'Piper · Jessica (UPMC)', 'fichier': 'fr_FR-upmc-medium.onnx', 'locuteur': 0, 'licence': 'CC BY-SA 4.0'},
}

verrou = threading.Lock()   # un seul calcul à la fois (onnxruntime) : la file d'attente est dans la page
etat = {'kokoro': {'pret': False, 'erreur': None}, 'piper': {'pret': False, 'erreur': None}}
kokoro = None
piper_voix = {}


def charger_kokoro():
    global kokoro
    try:
        from kokoro_onnx import Kokoro
        modele = os.path.join(DOSSIER, 'kokoro-v1.0.int8.onnx')
        voix = os.path.join(DOSSIER, 'voices-v1.0.bin')
        if not (os.path.isfile(modele) and os.path.isfile(voix)):
            raise FileNotFoundError('modèle Kokoro absent (lancer : node app-pc/installer-voix.mjs)')
        kokoro = Kokoro(modele, voix)
        kokoro.create('Bonjour.', voice='ff_siwis', speed=1.0, lang='fr-fr')   # échauffement
        etat['kokoro'] = {'pret': True, 'erreur': None}
    except Exception as e:   # noqa
        etat['kokoro'] = {'pret': False, 'erreur': str(e)[:300]}


def charger_piper(fichier):
    from piper import PiperVoice
    if fichier not in piper_voix:
        chemin = os.path.join(DOSSIER, fichier)
        if not os.path.isfile(chemin):
            raise FileNotFoundError('voix Piper absente : ' + fichier + ' (lancer : node app-pc/installer-voix.mjs)')
        piper_voix[fichier] = PiperVoice.load(chemin)
    return piper_voix[fichier]


def preparer_piper():
    try:
        charger_piper('fr_FR-siwis-medium.onnx')
        etat['piper'] = {'pret': True, 'erreur': None}
    except Exception as e:   # noqa
        etat['piper'] = {'pret': False, 'erreur': str(e)[:300]}


def wav_octets(echantillons, taux):
    import numpy as np
    a = np.asarray(echantillons, dtype='float32')
    a = np.clip(a, -1.0, 1.0)
    pcm = (a * 32767.0).astype('<i2')
    tampon = io.BytesIO()
    with wave.open(tampon, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(int(taux)); w.writeframes(pcm.tobytes())
    return tampon.getvalue()


def synthetiser(idv, texte, vitesse):
    cfg = VOIX.get(idv)
    if not cfg:
        raise ValueError('voix inconnue : ' + str(idv))
    vitesse = max(0.5, min(2.0, float(vitesse or 1.0)))
    if cfg['moteur'] == 'kokoro':
        if kokoro is None:
            raise RuntimeError('Kokoro pas prêt : ' + str(etat['kokoro'].get('erreur')))
        with verrou:
            audio, taux = kokoro.create(texte, voice=cfg['voix'], speed=vitesse, lang='fr-fr')
        return wav_octets(audio, taux)
    from piper import SynthesisConfig
    v = charger_piper(cfg['fichier'])
    config = SynthesisConfig(length_scale=1.0 / vitesse, speaker_id=cfg.get('locuteur'))
    tampon = io.BytesIO()
    with verrou:
        with wave.open(tampon, 'wb') as w:
            v.synthesize_wav(texte, w, syn_config=config)
    return tampon.getvalue()


class Gestionnaire(BaseHTTPRequestHandler):
    def log_message(self, *a):   # silence
        pass

    def _repondre(self, code, corps, type_='application/json; charset=utf-8'):
        if isinstance(corps, (dict, list)):
            corps = json.dumps(corps, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', type_)
        self.send_header('Content-Length', str(len(corps)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(corps)

    def do_GET(self):
        if self.path.startswith('/sante'):
            return self._repondre(200, {'moteurs': etat, 'voix': [{'id': k, **{x: y for x, y in v.items() if x in ('moteur', 'nom', 'licence')}} for k, v in VOIX.items()]})
        self._repondre(404, {'erreur': 'route inconnue'})

    def do_POST(self):
        if not self.path.startswith('/synth'):
            return self._repondre(404, {'erreur': 'route inconnue'})
        try:
            n = int(self.headers.get('Content-Length') or 0)
            corps = json.loads(self.rfile.read(n).decode('utf-8'))
            texte = str(corps.get('texte') or '').strip()[:1500]
            if not texte:
                return self._repondre(400, {'erreur': 'texte manquant'})
            t0 = time.time()
            wav = synthetiser(corps.get('voix'), texte, corps.get('vitesse'))
            self._repondre(200, wav, 'audio/wav')
        except Exception as e:   # noqa
            self._repondre(500, {'erreur': str(e)[:300]})


if __name__ == '__main__':
    threading.Thread(target=charger_kokoro, daemon=True).start()
    threading.Thread(target=preparer_piper, daemon=True).start()
    serveur = ThreadingHTTPServer(('127.0.0.1', PORT), Gestionnaire)
    print('voix locale prête sur http://127.0.0.1:%d' % PORT, flush=True)
    try:
        serveur.serve_forever()
    except KeyboardInterrupt:
        pass
