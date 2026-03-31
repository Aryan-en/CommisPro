
import React, { useState, useEffect, useCallback } from 'react';
import { dbService } from '../services/db';
import { StoreName } from '../types';

const STORES: StoreName[] = [
  'invoices', 'payments', 'purchases', 'vendors', 'quotes',
  'fr_mapping', 'quote_override', 'commit_data', 'item_list'
];

interface DuplicateGroup { key: string; records: any[]; }
interface EditState { record: any; storeName: StoreName; }

const DedupeView: React.FC = () => {
  const [selectedStore, setSelectedStore] = useState<StoreName>('invoices');
  const [duplicates, setDuplicates] = useState<DuplicateGroup[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [totalRecords, setTotalRecords] = useState(0);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const scanForDuplicates = useCallback(async (store: StoreName) => {
    setIsScanning(true);
    setDuplicates([]);
    try {
      const records = await dbService.getAllRecords(store);
      setTotalRecords(records.length);
      const groups: Record<string, any[]> = {};
      records.forEach(rec => {
        const fp = Object.entries(rec).filter(([k]) => k !== 'id').sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v ?? ''}`).join('||');
        if (!groups[fp]) groups[fp] = [];
        groups[fp].push(rec);
      });
      setDuplicates(Object.entries(groups).filter(([, r]) => r.length > 1).map(([key, records]) => ({ key, records })));
    } finally { setIsScanning(false); }
  }, []);

  useEffect(() => { scanForDuplicates(selectedStore); }, [selectedStore, scanForDuplicates]);

  const handleDelete = async (store: StoreName, id: number) => {
    setDeletingId(id);
    try { await dbService.deleteRecord(store, id); await scanForDuplicates(store); }
    finally { setDeletingId(null); }
  };

  const handleDeleteAllButFirst = async (store: StoreName, group: DuplicateGroup) => {
    for (const rec of group.records.slice(1)) await dbService.deleteRecord(store, rec.id);
    await scanForDuplicates(store);
  };

  const handleSaveEdit = async () => {
    if (!editState) return;
    await dbService.updateRecord(editState.storeName, editState.record);
    setEditState(null);
    await scanForDuplicates(editState.storeName);
  };

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const totalDups = duplicates.reduce((a, g) => a + g.records.length - 1, 0);
  const previewCols = duplicates[0]?.records[0] ? Object.keys(duplicates[0].records[0]).filter(k => k !== 'id').slice(0, 6) : [];

  return (
    <div className="space-y-6 fade-up">
      {/* Header */}
      <div className="card p-7 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, var(--bg-surface) 0%, #150d2e 100%)', borderColor: 'rgba(139,92,246,0.2)' }}>
        <div className="absolute inset-0 opacity-30" style={{ background: 'radial-gradient(ellipse at 80% 50%, rgba(139,92,246,0.3), transparent 60%)' }} />
        <div className="relative flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center gradient-violet">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
              <span className="label" style={{ color: 'var(--accent-violet)' }}>Data Quality</span>
            </div>
            <h2 className="text-2xl font-black text-white">Deduplication Engine</h2>
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Scan, review, and remove duplicate records across all tables.</p>
          </div>
          <div className="text-right">
            <p className="label mb-1" style={{ color: 'var(--accent-violet)' }}>Extra Copies</p>
            <p className="text-5xl font-black font-mono text-white">{totalDups}</p>
          </div>
        </div>
      </div>

      {/* Store selector */}
      <div className="card p-5">
        <div className="flex flex-wrap gap-2 mb-4">
          {STORES.map(store => (
            <button
              key={store}
              onClick={() => setSelectedStore(store)}
              className={`btn ${selectedStore === store ? '' : 'btn-ghost'} text-[11px]`}
              style={selectedStore === store
                ? { background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.4)', color: 'var(--accent-violet)' }
                : {}
              }
            >
              {store.replace(/_/g, ' ')}
            </button>
          ))}
          <button
            onClick={() => scanForDuplicates(selectedStore)}
            disabled={isScanning}
            className="btn btn-ghost ml-auto"
          >
            {isScanning
              ? <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
              : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            }
            {isScanning ? 'Scanning...' : 'Rescan'}
          </button>
        </div>
        <div className="flex gap-6 text-xs" style={{ color: 'var(--text-muted)' }}>
          <span>Total Records: <strong style={{ color: 'var(--text-primary)' }}>{totalRecords.toLocaleString()}</strong></span>
          <span>Duplicate Groups: <strong style={{ color: 'var(--accent-violet)' }}>{duplicates.length}</strong></span>
          <span>Extra Copies: <strong style={{ color: 'var(--accent-red)' }}>{totalDups}</strong></span>
        </div>
      </div>

      {/* Results */}
      {isScanning ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="w-14 h-14 border-2 rounded-full animate-spin mx-auto mb-4" style={{ borderColor: 'rgba(139,92,246,0.2)', borderTopColor: 'var(--accent-violet)' }} />
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Scanning {selectedStore}...</p>
          </div>
        </div>
      ) : duplicates.length === 0 ? (
        <div className="card p-16 text-center">
          <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)' }}>
            <svg className="w-8 h-8" style={{ color: 'var(--accent-emerald)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-base font-bold mb-1" style={{ color: 'var(--text-primary)' }}>No Duplicates Found</h3>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}><strong style={{ color: 'var(--text-secondary)' }}>{selectedStore}</strong> is clean — {totalRecords.toLocaleString()} unique records.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {duplicates.map((group, gi) => {
            const isOpen = expandedGroups.has(group.key);
            const preview = group.records[0];
            return (
              <div key={gi} className="card overflow-hidden transition-all" style={{ borderColor: 'rgba(239,68,68,0.15)' }}>
                <div
                  className="flex items-center justify-between p-4 cursor-pointer transition-colors"
                  style={{ background: isOpen ? 'rgba(239,68,68,0.06)' : 'transparent' }}
                  onClick={() => toggleGroup(group.key)}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black" style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.25)', color: 'var(--accent-red)' }}>
                      {group.records.length}x
                    </div>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {previewCols.slice(0, 3).map(c => `${c.replace(/_/g, ' ')}: ${String(preview[c] ?? '').slice(0, 20)}`).join(' · ')}
                      </p>
                      <p className="text-[11px] mt-0.5" style={{ color: 'var(--accent-red)' }}>{group.records.length - 1} duplicate{group.records.length > 2 ? 's' : ''}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={e => { e.stopPropagation(); handleDeleteAllButFirst(selectedStore, group); }}
                      className="btn text-xs" style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.25)', color: 'var(--accent-red)' }}
                    >
                      Keep First, Delete Rest
                    </button>
                    <svg className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} style={{ color: 'var(--text-muted)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>

                {isOpen && (
                  <div className="border-t overflow-x-auto" style={{ borderColor: 'var(--border-subtle)' }}>
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-subtle)' }}>
                          <th className="label px-4 py-3 text-left">ID</th>
                          {previewCols.map(c => <th key={c} className="label px-4 py-3 text-left">{c.replace(/_/g, ' ')}</th>)}
                          <th className="label px-4 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.records.map((rec, ri) => (
                          <tr key={rec.id} style={{ borderBottom: '1px solid var(--border-subtle)', background: ri === 0 ? 'rgba(16,185,129,0.04)' : 'rgba(239,68,68,0.03)' }}>
                            <td className="px-4 py-3 font-mono" style={{ color: 'var(--text-muted)' }}>
                              {rec.id}
                              {ri === 0 && <span className="badge ml-2" style={{ background: 'rgba(16,185,129,0.15)', color: 'var(--accent-emerald)', borderColor: 'rgba(16,185,129,0.2)' }}>ORIGINAL</span>}
                            </td>
                            {previewCols.map(c => (
                              <td key={c} className="px-4 py-3 max-w-[150px] truncate" style={{ color: 'var(--text-secondary)' }}>{String(rec[c] ?? '—')}</td>
                            ))}
                            <td className="px-4 py-3">
                              <div className="flex gap-2 justify-end">
                                <button
                                  onClick={() => setEditState({ record: { ...rec }, storeName: selectedStore })}
                                  className="btn text-[11px]" style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.2)', color: 'var(--accent-blue)' }}
                                >Edit</button>
                                <button
                                  onClick={() => handleDelete(selectedStore, rec.id)}
                                  disabled={deletingId === rec.id}
                                  className="btn text-[11px] disabled:opacity-50" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.2)', color: 'var(--accent-red)' }}
                                >{deletingId === rec.id ? '...' : 'Delete'}</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Modal */}
      {editState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(5,11,20,0.85)', backdropFilter: 'blur(12px)' }}>
          <div className="w-full max-w-lg max-h-[85vh] flex flex-col rounded-2xl overflow-hidden" style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-default)' }}>
            <div className="px-6 py-5 border-b flex justify-between items-center" style={{ borderColor: 'var(--border-subtle)' }}>
              <div>
                <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Edit Record</p>
                <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>ID #{editState.record.id} · {editState.storeName}</p>
              </div>
              <button onClick={() => setEditState(null)} className="p-2 rounded-lg transition-colors" style={{ color: 'var(--text-muted)' }}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {Object.entries(editState.record).filter(([k]) => k !== 'id').map(([key, val]) => (
                <div key={key}>
                  <label className="label block mb-1.5">{key.replace(/_/g, ' ')}</label>
                  <input
                    type="text"
                    value={String(val ?? '')}
                    onChange={e => setEditState(p => p ? { ...p, record: { ...p.record, [key]: e.target.value } } : null)}
                    className="w-full px-4 py-2.5 rounded-xl text-sm"
                  />
                </div>
              ))}
            </div>
            <div className="px-6 py-4 border-t flex gap-3 justify-end" style={{ borderColor: 'var(--border-subtle)' }}>
              <button onClick={() => setEditState(null)} className="btn btn-ghost">Cancel</button>
              <button onClick={handleSaveEdit} className="btn btn-primary">Save Changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DedupeView;
