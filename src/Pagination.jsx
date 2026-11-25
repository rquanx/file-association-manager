import { useLanguage } from './Language.jsx';
import { IconButton } from './Controls.jsx';
import { useLayoutEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';


export function usePage(items, page, size) {
  const index = Math.min(page, Math.max(0, Math.ceil(items.length / size) - 1));
  const start = index * size;
  return { index, start, end: Math.min(start + size, items.length), total: items.length, items: items.slice(start, start + size) };
}

export function Pagination({ page, onChange, label, compact = false }) {
  const { t, language } = useLanguage();
  const format = new Intl.NumberFormat(language);
  return <nav className={compact ? 'pagination compact' : 'pagination'} aria-label={label}>
    <span>{page.total ? format.format(page.start + 1) + '–' + format.format(page.end) : '0'} / {format.format(page.total)}</span>
    <span className="pagination-buttons">
      <IconButton compact type="button" aria-label={t("上一页")} disabled={page.index === 0} onClick={() => onChange(page.index - 1)}><ChevronLeft size={16} /></IconButton>
      <IconButton compact type="button" aria-label={t("下一页")} disabled={page.end >= page.total} onClick={() => onChange(page.index + 1)}><ChevronRight size={16} /></IconButton>
    </span>
  </nav>;
}

export function useTablePageSize(containerRef) {
  const [size, setSize] = useState(10);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const measure = () => {
      const styles = getComputedStyle(container);
      const row = parseFloat(styles.getPropertyValue('--table-row-size'));
      const header = container.querySelector('thead').getBoundingClientRect().height;
      setSize(Math.max(1, Math.floor((container.clientHeight - header) / row)));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    measure();
    return () => observer.disconnect();
  }, [containerRef]);

  return size;
}
