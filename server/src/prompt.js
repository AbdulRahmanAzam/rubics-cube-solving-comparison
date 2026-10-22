// One state builder and one instruction text for every model (fairness: identical information).
import { MOVES, MOVE_DESCRIPTIONS, allowedMoves, toFaces } from '../../shared/cube.js';

export const NOTATION = [
  'The cube state is given as 54 letters in face order U R F D L B (Up, Right, Front, Down, Left, Back), 9 stickers per face.',
  'Each letter names the face whose center sticker has that color, so the cube is solved when every face shows 9 copies of its own letter.',
  'Sticker order inside each face is row by row, top-left to bottom-right, while looking straight at that face:',
  'U is seen from above with the Back face at the top edge; R, F, L and B are seen from outside with U at the top edge; D is seen from below with the Front face at the top edge.',
  'The center sticker (index 4 of each face) never moves.',
].join(' ');

export const INSTRUCTIONS =
  'You are solving a 3x3 Rubik\'s Cube one move at a time. Choose the single next move most likely to bring the cube closer to the solved state, where every face shows one letter. ' +
  'The face turned by the previous move cannot be turned again right away, so only the moves in allowed_moves can be chosen.';

export const criteriaFor = (moves) => Object.fromEntries(moves.map((m) => [m, MOVE_DESCRIPTIONS[m]]));

export function buildState({ facelets, history, movesUsed = history.length, moveLimit }) {
  return {
    cube_facelets: facelets,
    faces: toFaces(facelets),
    notation: NOTATION,
    recent_moves: history,
    allowed_moves: allowedMoves(history),
    moves_used: movesUsed,
    moves_remaining: moveLimit - movesUsed,
  };
}

// Chat models (Opus, Luna) get the same instruction, notation and move list as the
// decision models' `choice` question, plus the required answer format.
export const CHAT_SYSTEM_PROMPT = [
  INSTRUCTIONS,
  NOTATION,
  'Allowed moves (half-turn metric):',
  ...MOVES.map((m) => `- ${m}: ${MOVE_DESCRIPTIONS[m]}`),
  'Reply with JSON only, exactly in this form: {"move": "<one move from allowed_moves>"}',
].join('\n');

export function chatUserMessage(state) {
  return `Current state:\n${JSON.stringify(state, null, 2)}`;
}

export const MOVE_SCHEMA = {
  type: 'object',
  properties: { move: { type: 'string', enum: MOVES } },
  required: ['move'],
  additionalProperties: false,
};
