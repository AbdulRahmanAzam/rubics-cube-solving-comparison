import { jev } from './jev.js';
import { clef } from './clef.js';
import { opus } from './opus.js';
import { luna, lunaHigh } from './luna.js';
import { jevHints, jevPlanner, plannerOnly, plannerRandom } from './plannerLanes.js';

export const ADAPTERS = {
  opus,
  jev,
  'jev-planner': jevPlanner,
  'jev-hints': jevHints,
  'planner-random': plannerRandom,
  'planner-only': plannerOnly,
  luna,
  'luna-high': lunaHigh,
  clef,
};
