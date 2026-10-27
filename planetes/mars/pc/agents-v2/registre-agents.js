import { FAMILLES_V2, ORDRE_AGENTS_V2 } from './familles-v2.js';
import { FAMILLES_BOTS, BOTS, ORDRE_BOTS } from './bots-externes.js';

/* Registre unique des agents évaluables de la V2 : les 2 agents prêts (Tendance, Divergence RSI) et les 5 bots open source adaptés. Même format, même moteur, mêmes critères. */
export const AGENTS = { ...FAMILLES_V2, ...FAMILLES_BOTS };
export const ORDRE_AGENTS = [...ORDRE_AGENTS_V2, ...ORDRE_BOTS];
export { FAMILLES_V2, FAMILLES_BOTS, BOTS, ORDRE_AGENTS_V2, ORDRE_BOTS };
