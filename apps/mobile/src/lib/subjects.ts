// Subject / visibility design contracts ported from apps/web PostCard.tsx.

export const SUBJECT_COLORS: Record<string, string> = {
  math: '#00A896',
  science: '#4C6FE7',
  programming: '#FF5A36',
  language: '#B45CC8',
  research: '#F4B43D',
  general: '#6B685C',
};

export const SUBJECTS = Object.keys(SUBJECT_COLORS);

export function subjectColor(subject: string): string {
  return SUBJECT_COLORS[subject] ?? SUBJECT_COLORS.general;
}

// Web renders chips as `${color}1A` — 10% alpha background on the accent.
export function chipBackground(hex: string): string {
  return `${hex}1A`;
}

export const KINDS = ['question', 'explanation', 'note', 'resource'] as const;

export const VISIBILITY_META: Record<string, { icon: string; label: string }> = {
  public: { icon: 'globe-outline', label: 'Public' },
  followers: { icon: 'people-outline', label: 'Followers' },
  room_only: { icon: 'lock-closed-outline', label: 'Room only' },
};

export const ACADEMIC_LEVELS = [
  { value: 'ALL', label: 'All levels' },
  { value: 'high_school', label: 'High school' },
  { value: 'college', label: 'College' },
  { value: 'graduate', label: 'Graduate' },
  { value: 'professional', label: 'Professional' },
];
