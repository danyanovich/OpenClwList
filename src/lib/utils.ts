import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

export function generateId(): string {
  return crypto.randomUUID();
}

export function formatDate(iso: string): string {
  return format(new Date(iso), 'd MMM yyyy', { locale: ru });
}
