const PAGE_SIZE = 5;

// Pages are numbered from 1, the way the page links show them.
function pageOf(items, page, size = PAGE_SIZE) {
  const start = page * size;
  return items.slice(start, start + size);
}

function pageCount(items, size = PAGE_SIZE) {
  return Math.max(1, Math.ceil(items.length / size));
}

module.exports = { pageOf, pageCount, PAGE_SIZE };
