/* Voix du copilote en direct : « Rayle, montre-moi (l'or) », « regarde ça / qu'est-ce qui mérite d'être regardé ? », « je regarde un achat sur l'or », « j'ai clôturé l'or », « Formation sur le Nasdaq »,
   « qu'est-ce que j'ai appris ? », « alertes silencieuses jusqu'à demain ». Reconnaissance pure (testée) + exécution (ouvre les fenêtres, lit à voix haute). Jamais d'ordre. */
import { analyserIntention, intentionCloture } from './carnet.js';
import { ACTIFS_POINT } from '../point/intention.js';

const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'`]/g, ' ').replace(/[^a-z0-9% ]+/g, ' ').replace(/\s+/g, ' ').trim();
const actifDe = n => (ACTIFS_POINT.find(([, re]) => re.test(n)) || [])[0] || null;
export const CLE_SILENCE = 'rayle_copilote_silence_v1';
export function intentionCopilote(texte) {
  const n = norm(texte); if (!n) return null;
  if (/\balertes? (silencieuses?|en silence)\b|\bsilence (jusqu a|pour|toute)\b|\bpas d alertes?\b.*\b(demain|ce soir|nuit)\b/.test(n)) return { type: 'silence', jusqua: /\bdemain\b/.test(n) ? 'demain' : /\bcette nuit|ce soir\b/.test(n) ? 'matin' : 'demain' };
  if (analyserIntention(texte)) return { type: 'idee' };
  if (intentionCloture(texte)) return { type: 'cloture' };
  if (/\b(formation|relis les gros mouvements|relire les gros mouvements|apprends moi|apprendre a lire)\b/.test(n)) return { type: 'formation', actif: actifDe(n) || 'or' };
  if (/\b(ce que j ai appris|mes progres|signaux que je repere|ce que je repere seul)\b/.test(n)) return { type: 'competences' };
  if (/\b(ta fiabilite|ton taux de reussite|tu as souvent raison|a quel point tu as raison|tes previsions|ta precision|tu te trompes souvent)\b/.test(n)) return { type: 'fiabilite' };
  if (/\bmontre moi\b/.test(n) && !/\bmontre moi le point\b/.test(n)) return { type: 'montre', actif: actifDe(n) || 'or' };
  if (/\bregarde ca\b|\b(qu est ce qui|y a t il quelque chose qui) (merite|vaut) (d etre regarde|le coup)\b|\bgros moments?\b|\bqu est ce que tu vois d important\b/.test(n)) return { type: 'regarde', actif: actifDe(n) };
  return null;
}
export async function repondreCopilote(texte) {
  const it = intentionCopilote(texte); if (!it) return null;
  if (it.type === 'silence') { const jusqua = it.jusqua === 'matin' ? Date.now() + 10 * 3600e3 : (() => { const d = new Date(); d.setHours(7, 0, 0, 0); if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1); return d.getTime(); })();
    try { localStorage.setItem(CLE_SILENCE, JSON.stringify({ jusqua })); } catch (e) { /* stockage plein */ } try { const K = await import('../reseau/client.js'); await K.envoyerReglagesCopilote({ silenceJusqua: jusqua }); } catch (e) { /* le Worker l'apprendra à la prochaine synchro */ }
    return `C’est noté : alertes silencieuses jusqu’à ${new Date(jusqua).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', hour: '2-digit', minute: '2-digit' }).replace(':', ' h ')}. Plus de voix, et les messages Telegram arrivent sans notification.`; }
  if (it.type === 'idee') { const C = await import('./carnet-ui.js'); return C.noterIdee(texte); }
  if (it.type === 'cloture') { const C = await import('./carnet-ui.js'); return C.cloturerIdee(texte); }
  if (it.type === 'fiabilite') { const K = await import('../reseau/client.js'), P = await import('./previsions.js'), L = await K.lirePrevisions(); import('./fiabilite-ui.js').then(m => m.ouvrirFiabilite({ liste: L })).catch(() => {}); return P.resumeParle(P.statistiques(L)); }
  if (it.type === 'competences') { const C = await import('./carnet-ui.js'); return C.texteCompetences(); }
  if (it.type === 'formation') { const F = await import('./formation-ui.js'); F.ouvrirFormation({ actif: it.actif }); return `J’ouvre la formation sur ${it.actif === 'or' ? 'l’or' : 'cet actif'} : je relis avec toi les plus gros mouvements des derniers mois, bougie par bougie.`; }
  const Rg = await import('./regarde.js');
  if (it.type === 'montre') { try { await Rg.ouvrirMontreMoi(it.actif); return `Je te montre les outils sur ${it.actif === 'or' ? 'l’or' : 'cet actif'}, un par un.`; } catch (e) { return 'Je n’ai pas de lecture de marché disponible pour cet actif pour le moment.'; } }
  if (it.type === 'regarde') { const M = await Rg.momentsActuels({ actif: it.actif }); if (!M.length) return 'Rien de gros à regarder pour le moment : pas de cassure confirmée de la MA200, pas de bougie de volume extrême en bout de mouvement, pas de balayage d’un niveau clé.'; await Rg.ouvrirRegardeCa(M[0], { parler: () => {} }); return M[0].texteVoix; }
  return null;
}
