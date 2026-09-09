import { jobMatchesLanguageFilter } from './cv-keywords.mjs';

export function paginate(items, url) {
  const integer = (key, fallback) => {
    const value = Number(url.searchParams.get(key));
    return Number.isFinite(value) && value > 0 ? Math.max(1, Math.floor(value)) : fallback;
  };
  const pageSize = Math.min(50, Math.max(5, integer('pageSize', 10)));
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(integer('page', 1), pages);
  return { page, pageSize, total, pages, items: items.slice((page - 1) * pageSize, page * pageSize) };
}

export function digestItems(jobs, url) {
  const hidden = new Set(['applied', 'interviewing', 'offer', 'accepted', ...(url.searchParams.get('hide') || '').split(',')]);
  const lang = url.searchParams.get('lang') || 'all';
  return jobs.filter(job => job.isNew && job.currentSearch?.current
    && !hidden.has(job.decision?.decision || 'none')
    && (lang === 'all' || jobMatchesLanguageFilter(job, lang)));
}
