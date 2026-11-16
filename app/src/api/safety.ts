import type { User } from './auth';
import { ApiError, apiFetch } from './client';

export const REPORT_REASONS = [
  'scam',
  'advance_payment',
  'fake_item',
  'offensive',
  'other',
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
export type ReportTarget = 'listing' | 'user' | 'message';

/**
 * Report a listing, a user or a message. Resolves to 'sent', or to 'already' if I had
 * already reported it (only one report per person per item).
 */
export async function sendReport(
  targetType: ReportTarget,
  targetId: number,
  reason: ReportReason,
  text: string,
): Promise<'sent' | 'already'> {
  try {
    await apiFetch('/api/reports/', {
      method: 'POST',
      body: { target_type: targetType, target_id: targetId, reason, text },
      auth: true,
    });
    return 'sent';
  } catch (error) {
    if (
      error instanceof ApiError &&
      (error.data as { code?: string } | null)?.code === 'already_reported'
    ) {
      return 'already';
    }
    throw error;
  }
}

export type BlockedUser = { id: number; display_name: string; blocked_at: string };

/** The people I blocked. */
export function fetchBlockedUsers() {
  return apiFetch<BlockedUser[]>('/api/blocks/', { auth: true });
}

export function blockUser(userId: number) {
  return apiFetch<BlockedUser>('/api/blocks/', {
    method: 'POST',
    body: { user: userId },
    auth: true,
  });
}

export async function unblockUser(userId: number) {
  try {
    await apiFetch<unknown>(`/api/blocks/${userId}/`, { method: 'DELETE', auth: true });
  } catch (error) {
    // 404 = they weren't blocked any more, which is what we wanted.
    if (!(error instanceof ApiError && error.status === 404)) throw error;
  }
}

/** I read the "Buy safely" tips: don't show them again (on any phone). */
export function markSafetyTipsSeen() {
  return apiFetch<{ user: User }>('/api/auth/safety-tips/seen/', { method: 'POST', auth: true });
}
