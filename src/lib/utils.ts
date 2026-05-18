import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function parseLocalDate(dateString: string): Date {
  if (!dateString) return new Date();
  const parts = dateString.split('-');
  if (parts.length !== 3) return new Date();
  const [year, month, day] = parts.map(Number);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return new Date();
  return new Date(year, month - 1, day);
}

export function getLocalDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function formatDateWithMonthName(dateString?: string | null): string {
  if (!dateString) return '-';
  try {
    const date = parseLocalDate(dateString);
    return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
  } catch {
    return dateString;
  }
}

export type ExpirationStatus = 'expired' | 'warning' | 'safe' | 'none';

export function getExpirationStatus(dateStr: string | null | undefined): ExpirationStatus {
  if (!dateStr) return 'none';
  try {
    const expirationDate = parseLocalDate(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Warning period: 3 months (approx 90 days)
    const warningPeriod = new Date();
    warningPeriod.setMonth(warningPeriod.getMonth() + 3);
    
    if (expirationDate < today) return 'expired';
    if (expirationDate <= warningPeriod) return 'warning';
    return 'safe';
  } catch {
    return 'none';
  }
}

export function getTimeRemainingMessage(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  try {
    const expirationDate = parseLocalDate(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const diffTime = expirationDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) {
      const absDays = Math.abs(diffDays);
      if (absDays >= 30) {
        const months = Math.floor(absDays / 30);
        return `Caducó hace ${months} ${months === 1 ? 'mes' : 'meses'}`;
      }
      return `Caducó hace ${absDays} ${absDays === 1 ? 'día' : 'días'}`;
    }
    
    if (diffDays === 0) {
      return 'Caduca hoy';
    }
    
    if (diffDays < 30) {
      return `Caduca en ${diffDays} ${diffDays === 1 ? 'día' : 'días'}`;
    }
    
    const months = Math.floor(diffDays / 30);
    const remainingDays = diffDays % 30;
    
    if (remainingDays === 0) {
      return `Caduca en ${months} ${months === 1 ? 'mes' : 'meses'}`;
    }
    
    return `Caduca en ${months} ${months === 1 ? 'mes' : 'meses'} y ${remainingDays} ${remainingDays === 1 ? 'día' : 'días'}`;
  } catch {
    return '';
  }
}
