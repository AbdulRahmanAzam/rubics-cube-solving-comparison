import { CONFIG } from '../config.js';
import { postDecision } from './decisions.js';

export const jev = {
  id: 'jev',
  configured: () => Boolean(CONFIG.jev.apiKey),
  describe: () => ({ route: 'TypeSafe System One API', model: CONFIG.jev.model }),
  decide: ({ state, timeoutMs }) =>
    postDecision({ url: CONFIG.jev.url, token: CONFIG.jev.apiKey, model: CONFIG.jev.model, state, timeoutMs }),
};
