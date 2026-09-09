export function mountPager(list, label, change, { bottom = true, size = 10 } = {}) {
  const bars = [];
  for (const position of bottom ? ['beforebegin', 'afterend'] : ['beforebegin']) {
    const nav = document.createElement('nav');
    nav.className = 'pager list-pagination';
    nav.setAttribute('aria-label', `${label} pages${position === 'beforebegin' ? ' top' : ' bottom'}`);
    nav.hidden = true;
    nav.innerHTML = '<button type="button" class="btn ghost" data-prev>Previous</button><span aria-live="polite"></span><button type="button" class="btn ghost" data-next>Next</button><label>Per page <select><option>10</option><option>20</option><option>50</option></select></label>';
    nav.querySelector('select').value = String(size);
    nav.querySelector('[data-prev]').onclick = () => change(current.page - 1, current.pageSize);
    nav.querySelector('[data-next]').onclick = () => change(current.page + 1, current.pageSize);
    nav.querySelector('select').onchange = event => change(1, Number(event.target.value));
    list.insertAdjacentElement(position, nav);
    bars.push(nav);
  }
  let current = { page: 1, pageSize: size, pages: 1, total: 0 };
  return { update(page) {
    current = page;
    for (const nav of bars) {
      nav.hidden = !page.total;
      nav.querySelector('span').textContent = `${(page.page - 1) * page.pageSize + 1}–${Math.min(page.page * page.pageSize, page.total)} of ${page.total} · Page ${page.page} of ${page.pages}`;
      nav.querySelector('[data-prev]').disabled = page.page <= 1;
      nav.querySelector('[data-next]').disabled = page.page >= page.pages;
      nav.querySelector('select').value = String(page.pageSize);
    }
  } };
}
