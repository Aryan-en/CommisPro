
import React, { useRef, useState, useEffect, useMemo } from 'react';

interface DataTableProps {
  data: any[];
  onInvoiceClick?: (invoiceNumber: string) => void;
}

type SortDirection = 'asc' | 'desc' | null;
interface SortConfig { key: string; direction: SortDirection; }

const BADGE_COLS = ['payment_check', 'eligible', 'item_category', 'commit_flex'];

const getCategoryColor = (val: string) => {
  const v = String(val).toLowerCase();
  if (v === 'gcp') return { bg: 'rgba(59,130,246,0.15)', text: '#60a5fa', border: 'rgba(59,130,246,0.3)' };
  if (v === 'gws') return { bg: 'rgba(16,185,129,0.15)', text: '#34d399', border: 'rgba(16,185,129,0.3)' };
  if (v === 'gemini') return { bg: 'rgba(139,92,246,0.15)', text: '#a78bfa', border: 'rgba(139,92,246,0.3)' };
  if (v === 'services' || v === 'service') return { bg: 'rgba(245,158,11,0.15)', text: '#fbbf24', border: 'rgba(245,158,11,0.3)' };
  if (v === 'rebate') return { bg: 'rgba(239,68,68,0.15)', text: '#f87171', border: 'rgba(239,68,68,0.3)' };
  if (v === 'yes' || v.includes('fully')) return { bg: 'rgba(16,185,129,0.15)', text: '#34d399', border: 'rgba(16,185,129,0.3)' };
  if (v === 'no' || v.includes('partial') || v.includes('mismatch')) return { bg: 'rgba(239,68,68,0.15)', text: '#f87171', border: 'rgba(239,68,68,0.3)' };
  if (v === 'commit') return { bg: 'rgba(59,130,246,0.12)', text: '#93c5fd', border: 'rgba(59,130,246,0.25)' };
  if (v === 'flex') return { bg: 'rgba(168,85,247,0.12)', text: '#c4b5fd', border: 'rgba(168,85,247,0.25)' };
  return { bg: 'rgba(100,116,139,0.15)', text: '#94a3b8', border: 'rgba(100,116,139,0.25)' };
};

const DataTable: React.FC<DataTableProps> = ({ data, onInvoiceClick }) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [isScrollable, setIsScrollable] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: '', direction: null });
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  useEffect(() => {
    const checkScrollable = () => {
      if (scrollContainerRef.current) {
        const { scrollWidth, clientWidth } = scrollContainerRef.current;
        setIsScrollable(scrollWidth > clientWidth);
      }
    };
    checkScrollable();
    window.addEventListener('resize', checkScrollable);
    return () => window.removeEventListener('resize', checkScrollable);
  }, [data]);

  const handleScroll = () => {
    if (scrollContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
      setScrollProgress((scrollLeft / (scrollWidth - clientWidth)) * 100);
    }
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (scrollContainerRef.current) {
      const { scrollWidth, clientWidth } = scrollContainerRef.current;
      const val = parseFloat(e.target.value);
      scrollContainerRef.current.scrollLeft = (val / 100) * (scrollWidth - clientWidth);
      setScrollProgress(val);
    }
  };

  const handleSort = (key: string) => {
    let dir: SortDirection = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') dir = 'desc';
    else if (sortConfig.key === key && sortConfig.direction === 'desc') dir = null;
    setSortConfig({ key, direction: dir });
    setPage(1);
  };

  const columns = useMemo(() => {
    if (!data.length) return [];
    return Object.keys(data[0]).filter(k => k !== 'id' && k !== 'raw_data');
  }, [data]);

  const processedData = useMemo(() => {
    let filtered = filterText
      ? data.filter(row => columns.some(col => String(row[col]).toLowerCase().includes(filterText.toLowerCase())))
      : data;

    if (sortConfig.key && sortConfig.direction) {
      filtered = [...filtered].sort((a, b) => {
        const parse = (v: any) => {
          if (typeof v === 'number') return v;
          const str = String(v).replace(/[$,%]/g, '').trim();
          const n = parseFloat(str);
          return isNaN(n) ? String(v).toLowerCase() : n;
        };
        const A = parse(a[sortConfig.key]), B = parse(b[sortConfig.key]);
        if (A < B) return sortConfig.direction === 'asc' ? -1 : 1;
        if (A > B) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return filtered;
  }, [data, filterText, sortConfig, columns]);

  const totalPages = Math.ceil(processedData.length / PAGE_SIZE);
  const pageData = processedData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (!data.length) {
    return (
      <div className="card p-16 text-center fade-up">
        <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)' }}>
          <svg className="w-8 h-8" style={{ color: 'var(--accent-blue)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
        </div>
        <h3 className="text-base font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>No Data Available</h3>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Upload a CSV file to populate this table.</p>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden fade-up">
      {/* Toolbar */}
      <div className="px-5 py-3.5 flex flex-wrap items-center gap-3 border-b" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-surface)' }}>
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search records..."
            value={filterText}
            onChange={(e) => { setFilterText(e.target.value); setPage(1); }}
            className="w-full pl-9 pr-8 py-2 rounded-lg text-sm"
          />
          {filterText && (
            <button onClick={() => setFilterText('')} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 ml-auto text-xs" style={{ color: 'var(--text-muted)' }}>
          <span className="font-mono" style={{ color: 'var(--accent-blue)' }}>{processedData.length.toLocaleString()}</span>
          <span>rows</span>
          {filterText && <span style={{ color: 'var(--accent-blue)' }}>· filtered</span>}
        </div>

        {isScrollable && (
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <svg className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text-muted)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
            <input
              type="range" min="0" max="100" step="0.5"
              value={scrollProgress} onChange={handleSliderChange}
              className="flex-1 min-w-[100px] max-w-[160px]"
            />
          </div>
        )}
      </div>

      {/* Table */}
      <div ref={scrollContainerRef} onScroll={handleScroll} className="overflow-x-auto">
        <table className="w-full text-left text-sm border-collapse" style={{ minWidth: '600px' }}>
          <thead>
            <tr style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-default)' }}>
              {columns.map(col => {
                const active = sortConfig.key === col;
                return (
                  <th
                    key={col}
                    onClick={() => handleSort(col)}
                    className="label px-5 py-3.5 text-left cursor-pointer select-none whitespace-nowrap transition-colors group"
                    style={{
                      color: active ? 'var(--accent-blue)' : 'var(--text-muted)',
                      borderRight: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div className="flex items-center gap-1.5">
                      {col.replace(/_/g, ' ')}
                      <span className={`transition-all ${active ? 'opacity-100' : 'opacity-0 group-hover:opacity-40'}`}>
                        {sortConfig.direction === 'desc' && active
                          ? <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M14.707 10.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 12.586V5a1 1 0 012 0v7.586l2.293-2.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>
                          : <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd"/></svg>
                        }
                      </span>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {pageData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-5 py-12 text-center text-sm italic" style={{ color: 'var(--text-muted)' }}>
                  No records matching "{filterText}"
                </td>
              </tr>
            ) : (
              pageData.map((row, idx) => (
                <tr
                  key={idx}
                  className="table-row-hover transition-colors"
                  style={{
                    borderBottom: '1px solid var(--border-subtle)',
                    background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                  }}
                >
                  {columns.map(col => {
                    const val = row[col];
                    const colKey = col.toLowerCase();
                    const isBadge = BADGE_COLS.some(b => colKey === b);
                    const isInvNum = colKey === 'invoice_number';
                    const isAmount = (colKey.includes('amount') || colKey.includes('commission_amount') || colKey.includes('tax') || colKey.includes('purchases')) && typeof val === 'number';
                    const isMargin = colKey.includes('margin') || colKey === 'commission_percentage';

                    if (isInvNum && onInvoiceClick) {
                      return (
                        <td key={col} className="px-5 py-3" style={{ borderRight: '1px solid var(--border-subtle)' }}>
                          <button
                            onClick={() => onInvoiceClick(String(val))}
                            className="font-mono text-xs font-bold hover:underline transition-colors"
                            style={{ color: 'var(--accent-blue)' }}
                          >
                            {String(val)}
                          </button>
                        </td>
                      );
                    }

                    if (isBadge) {
                      const colors = getCategoryColor(String(val));
                      return (
                        <td key={col} className="px-5 py-3" style={{ borderRight: '1px solid var(--border-subtle)' }}>
                          <span className="badge" style={{ background: colors.bg, color: colors.text, borderColor: colors.border }}>
                            {String(val)}
                          </span>
                        </td>
                      );
                    }

                    if (isAmount) {
                      return (
                        <td key={col} className="px-5 py-3 font-mono text-xs" style={{ borderRight: '1px solid var(--border-subtle)', color: colKey.includes('commission') ? 'var(--accent-emerald)' : 'var(--text-primary)' }}>
                          ${(val as number).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      );
                    }

                    if (isMargin) {
                      return (
                        <td key={col} className="px-5 py-3 font-mono text-xs font-bold" style={{ borderRight: '1px solid var(--border-subtle)', color: 'var(--accent-amber)' }}>
                          {String(val)}
                        </td>
                      );
                    }

                    return (
                      <td key={col} className="px-5 py-3 text-xs" style={{ borderRight: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {String(val ?? '—')}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-5 py-3 flex items-center justify-between border-t text-xs" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-surface)' }}>
          <span style={{ color: 'var(--text-muted)' }}>
            Page {page} of {totalPages} · {processedData.length.toLocaleString()} total rows
          </span>
          <div className="flex gap-1">
            <button onClick={() => setPage(1)} disabled={page === 1} className="btn-ghost px-2.5 py-1.5 rounded-lg text-xs disabled:opacity-30" style={{ background: 'var(--bg-hover)' }}>«</button>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="btn-ghost px-2.5 py-1.5 rounded-lg text-xs disabled:opacity-30" style={{ background: 'var(--bg-hover)' }}>‹</button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const p = Math.min(Math.max(page - 2, 1) + i, totalPages);
              return (
                <button key={p} onClick={() => setPage(p)} className="px-2.5 py-1.5 rounded-lg font-medium transition-all text-xs" style={{ background: p === page ? 'rgba(59,130,246,0.25)' : 'var(--bg-hover)', color: p === page ? 'var(--accent-blue)' : 'var(--text-secondary)', border: p === page ? '1px solid var(--border-accent)' : '1px solid transparent' }}>
                  {p}
                </button>
              );
            })}
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="btn-ghost px-2.5 py-1.5 rounded-lg text-xs disabled:opacity-30" style={{ background: 'var(--bg-hover)' }}>›</button>
            <button onClick={() => setPage(totalPages)} disabled={page === totalPages} className="btn-ghost px-2.5 py-1.5 rounded-lg text-xs disabled:opacity-30" style={{ background: 'var(--bg-hover)' }}>»</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DataTable;
