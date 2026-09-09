// Shared, browser-independent rules for the application workspace.
export const ACTIVE_STATUSES = ['shortlisted', 'applied', 'interviewing', 'offer'];

export function localDateKey(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function validDateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function followUpState(item, today = localDateKey()) {
  if (!ACTIVE_STATUSES.includes(item.decision) || !validDateKey(item.followUpDate)) return null;
  if (item.followUpDate < today) return 'overdue';
  if (item.followUpDate === today) return 'today';
  return 'upcoming';
}

export function trackerSummary(items, today = localDateKey()) {
  return {
    total: items.length,
    active: items.filter((item) => ACTIVE_STATUSES.includes(item.decision)).length,
    interviewing: items.filter((item) => item.decision === 'interviewing').length,
    due: items.filter((item) => ['today', 'overdue'].includes(followUpState(item, today))).length,
  };
}

export function filterTracker(items, { query = '', statuses = ACTIVE_STATUSES, dueOnly = false, today = localDateKey(), sort = 'newest' } = {}) {
  const q = query.trim().toLowerCase();
  const visible = new Set(statuses);
  return items.filter((item) => visible.has(item.decision)
    && (!dueOnly || ['today', 'overdue'].includes(followUpState(item, today)))
    && (!q || [item.title, item.company, item.board, item.note, item.location, item.contactName, item.contactEmail].filter(Boolean).join(' ').toLowerCase().includes(q)))
    .sort((a, b) => {
      if (dueOnly && a.followUpDate !== b.followUpDate) return a.followUpDate.localeCompare(b.followUpDate);
      const time = (item) => Number.isFinite(Number(item.at)) && item.at != null ? Number(item.at) : Date.parse(item.updatedAt || item.date || '') || 0;
      return (time(a) - time(b)) * (sort === 'oldest' ? 1 : -1);
    });
}
