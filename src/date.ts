import type { DateKey } from './types';

export function todayLocalISO(): DateKey {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return year + '-' + month + '-' + day;
}

export function isValidDateKey(value: unknown): value is DateKey {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parts = value.split('-').map(Number);
  const candidate = new Date(parts[0], parts[1] - 1, parts[2]);
  return (
    candidate.getFullYear() === parts[0] &&
    candidate.getMonth() === parts[1] - 1 &&
    candidate.getDate() === parts[2]
  );
}

export function formatDate(value: DateKey | null | undefined): string {
  if (!value || !isValidDateKey(value)) {
    return '—';
  }

  const parts = value.split('-');
  return parts[2] + '/' + parts[1] + '/' + parts[0];
}

export function formatGrams(value: number): string {
  return new Intl.NumberFormat('nl-BE', {
    maximumFractionDigits: 1
  }).format(value) + ' g';
}
