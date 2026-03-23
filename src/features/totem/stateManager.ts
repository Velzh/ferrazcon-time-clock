import { TotemState } from './types';

const ALLOWED: Record<TotemState, TotemState[]> = {
  IDLE: ['WAKE'],
  WAKE: ['RECOGNITION', 'IDLE'],
  RECOGNITION: ['CONFIRMATION', 'RESET'],
  CONFIRMATION: ['RESET'],
  RESET: ['IDLE', 'WAKE'],
};

export function canTransition(from: TotemState, to: TotemState): boolean {
  return ALLOWED[from].includes(to);
}

export function resolveTransition(from: TotemState, to: TotemState): TotemState {
  return canTransition(from, to) ? to : from;
}
