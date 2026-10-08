export function mountPager(list, label, change, { bottom = true, size = 10 } = {}) {
  const bars = [];
  let current = { page: 1, pageSize: size, pages: 1, total: 0 };
  const go = (page, pageSize = current.pageSize) => {
    const target = Math.max(1, Math.min(current.pages, Number(page) || 1));
    change(target, pageSize);
    if (!list.closest('dialog, [role="dialog"]')) bars[0].scrollIntoView({ block: 'start' });
  };
  for (const position of bottom ? ['beforebegin', 'afterend'] : ['beforebegin']) {
    const nav = document.createElement('nav');
    nav.className = 'pager list-pagination';
    nav.setAttribute('aria-label', `${label} pages${position === 'beforebegin' ? ' top' : ' bottom'}`);
    nav.hidden = true;
    nav.innerHTML = `<span class="page-range" aria-live="polite"></span><div class="page-controls"><button type="button" class="btn" data-prev>← Previous</button><div class="page-numbers"></div><button type="button" class="btn" data-next>Next →</button></div><label>Per page <select aria-label="Items per page"><option>10</option><option>20</option><option>50</option></select></label><form class="page-jump"><label>Go to page <input type="number" min="1" step="1" required aria-label="Go to page" /></label><button class="btn small" type="submit">Go</button></form>`;
    nav.querySelector('select').value = String(size);
    nav.querySelector('[data-prev]').onclick = () => go(current.page - 1);
    nav.querySelector('[data-next]').onclick = () => go(current.page + 1);
    nav.querySelector('select').onchange = event => go(1, Number(event.target.value));
    nav.querySelector('form').onsubmit = event => { event.preventDefault(); go(nav.querySelector('input').value); };
    list.insertAdjacentElement(position, nav);
    bars.push(nav);
  }
  return { update(page) {
    current = page || { page: 1, pageSize: size, pages: 1, total: 0 };
    for (const nav of bars) {
      nav.hidden = !current.total;
      nav.querySelector('.page-range').textContent = `${(current.page - 1) * current.pageSize + 1}–${Math.min(current.page * current.pageSize, current.total)} of ${current.total} · Page ${current.page} of ${current.pages}`;
      nav.querySelector('[data-prev]').disabled = current.page <= 1;
      nav.querySelector('[data-next]').disabled = current.page >= current.pages;
      nav.querySelector('select').value = String(current.pageSize);
      nav.querySelector('input').max = current.pages;
      nav.querySelector('input').value = current.page;
      nav.querySelector('.page-jump').hidden = current.pages <= 1;
      const numbers = nav.querySelector('.page-numbers'); numbers.replaceChildren();
      const visible = [...new Set([1, current.page - 1, current.page, current.page + 1, current.pages])].filter(number => number >= 1 && number <= current.pages).sort((a, b) => a - b);
      let previous = 0;
      for (const number of visible) {
        if (previous && number - previous > 1) { const gap = document.createElement('span'); gap.textContent = '…'; numbers.append(gap); }
        const button = document.createElement('button'); button.type = 'button'; button.className = 'btn page-number'; button.textContent = number;
        button.setAttribute('aria-label', `Page ${number}`);
        if (number === current.page) button.setAttribute('aria-current', 'page');
        button.onclick = () => go(number); numbers.append(button); previous = number;
      }
    }
  } };
}
