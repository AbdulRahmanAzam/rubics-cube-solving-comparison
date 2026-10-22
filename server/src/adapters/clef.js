import { CONFIG } from '../config.js';
import { postDecision } from './decisions.js';

const url = () => `https://api.cloudflare.com/client/v4/accounts/${CONFIG.clef.accountId}/ai/run/@cf/cloudflare/clef`;

export const clef = {
  id: 'clef',
  configured: () => Boolean(CONFIG.clef.accountId && CONFIG.clef.apiToken),
  describe: () => ({ route: 'Cloudflare Workers AI', model: CONFIG.clef.model }),
  decide: ({ state, timeoutMs }) =>
    postDecision({
      url: url(),
      token: CONFIG.clef.apiToken,
      model: CONFIG.clef.model,
      state,
      timeoutMs,
      // Cloudflare wraps the answer: { result: { model, answers, usage }, success, errors }
      unwrap: (j) => j.result,
    }),
};
