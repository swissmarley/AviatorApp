import type { EmergencyKind } from './types.js';

export const EMERGENCY_SQUAWKS: Record<string, { kind: EmergencyKind; label: string }> = {
  '7500': { kind: 'unlawful', label: 'Hijack / unlawful interference' },
  '7600': { kind: 'nordo', label: 'Radio failure' },
  '7700': { kind: 'general', label: 'General emergency' },
};

export function emergencyFromSquawk(squawk?: string): EmergencyKind {
  if (!squawk) return 'none';
  return EMERGENCY_SQUAWKS[squawk]?.kind ?? 'none';
}

export function isEmergencySquawk(squawk?: string): boolean {
  return !!squawk && squawk in EMERGENCY_SQUAWKS;
}

export function emergencyLabel(kind: EmergencyKind, squawk?: string): string {
  if (squawk && EMERGENCY_SQUAWKS[squawk]) return EMERGENCY_SQUAWKS[squawk].label;
  switch (kind) {
    case 'general': return 'General emergency';
    case 'lifeguard': return 'Lifeguard / medical';
    case 'minfuel': return 'Minimum fuel';
    case 'nordo': return 'Radio failure';
    case 'unlawful': return 'Unlawful interference';
    case 'downed': return 'Downed aircraft';
    case 'reserved': return 'Reserved emergency';
    default: return '';
  }
}
