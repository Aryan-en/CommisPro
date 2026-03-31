
import React, { useRef, useState } from 'react';
import { dbService } from '../services/db';
import { StoreName } from '../types';

interface UploaderProps {
  onSuccess: (target: StoreName) => void;
}

const STORES: { value: StoreName; label: string }[] = [
  { value: 'invoices', label: 'Invoices' },
  { value: 'payments', label: 'Payments' },
  { value: 'purchases', label: 'Purchases' },
  { value: 'vendors', label: 'Vendor List' },
  { value: 'quotes', label: 'Quotes' },
  { value: 'fr_mapping', label: 'FR Mapping' },
  { value: 'quote_override', label: 'Quote Override' },
  { value: 'commit_data', label: 'Commit Data' },
  { value: 'item_list', label: 'Item List' },
];

const Uploader: React.FC<UploaderProps> = ({ onSuccess }) => {
  const [isUploading, setIsUploading] = useState(false);
  const [targetStore, setTargetStore] = useState<StoreName>('invoices');
  const [isUpdateMode, setIsUpdateMode] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = async (file: File) => {
    setIsUploading(true);
    const reader = new FileReader();

    reader.onload = async (event) => {
      const text = event.target?.result as string;
      const lines = text.split(/\r?\n/);
      if (lines.length < 2) { setIsUploading(false); return; }

      let delimiter = ',';
      const nameLower = file.name.toLowerCase();
      if (nameLower.endsWith('.tsv') || nameLower.endsWith('.txt')) delimiter = '\t';
      else if (lines[0].includes('\t') && !lines[0].includes(',')) delimiter = '\t';

      const parseLine = (line: string, delim: string) => {
        if (delim === '\t') return line.split('\t');
        const result: string[] = [];
        let cur = '', inQ = false;
        for (let i = 0; i < line.length; i++) {
          const c = line[i];
          if (c === '"') { inQ = !inQ; }
          else if (c === delim && !inQ) { result.push(cur.trim().replace(/^"|"$/g, '')); cur = ''; }
          else { cur += c; }
        }
        result.push(cur.trim().replace(/^"|"$/g, ''));
        return result;
      };

      const headers = parseLine(lines[0], delimiter).map(h => h.trim().toLowerCase());
      const records = lines.slice(1).filter(l => l.trim()).map(line => {
        const values = parseLine(line, delimiter);
        const record: any = {};
        headers.forEach((h, i) => { record[h.replace(/\s+/g, '_')] = values[i]?.trim(); });
        return record;
      });

      try {
        if (isUpdateMode && targetStore === 'quotes') {
          const keyField = headers.includes('quote_number') ? 'quote_number' : (headers.includes('quote_no') ? 'quote_no' : null);
          if (!keyField) { alert("Update mode requires 'quote_number' header."); setIsUploading(false); return; }
          await dbService.upsertRecords(targetStore, records, keyField);
        } else {
          await dbService.clearStore(targetStore);
          await dbService.addRecords(targetStore, records);
        }
        onSuccess(targetStore);
      } catch (err) {
        console.error(err);
        alert('Upload failed. Check console.');
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };

    reader.readAsText(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  return (
    <div className="card p-5 flex flex-col gap-4">
      {/* Header row */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid var(--border-accent)' }}>
            <svg className="w-4 h-4" style={{ color: 'var(--accent-blue)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Import Data</p>
            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>CSV / TSV / TXT</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {targetStore === 'quotes' && (
            <label className="flex items-center gap-1.5 cursor-pointer">
              <div
                className="w-8 h-4 rounded-full transition-colors relative"
                style={{ background: isUpdateMode ? 'rgba(59,130,246,0.5)' : 'var(--bg-hover)' }}
              >
                <div className="absolute top-0.5 w-3 h-3 rounded-full transition-all" style={{ background: isUpdateMode ? 'var(--accent-blue)' : 'var(--text-muted)', left: isUpdateMode ? '17px' : '2px' }} />
                <input type="checkbox" className="hidden" checked={isUpdateMode} onChange={e => setIsUpdateMode(e.target.checked)} />
              </div>
              <span className="label">Upsert</span>
            </label>
          )}

          <select
            value={targetStore}
            onChange={e => { setTargetStore(e.target.value as StoreName); if (e.target.value !== 'quotes') setIsUpdateMode(false); }}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg cursor-pointer"
          >
            {STORES.map(s => <option key={s.value} value={s.value} style={{ background: 'var(--bg-raised)' }}>{s.label}</option>)}
          </select>
        </div>
      </div>

      {/* Drop zone */}
      <div
        className="relative rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all duration-200"
        style={{
          height: '130px',
          border: `2px dashed ${isDragging ? 'var(--accent-blue)' : 'var(--border-default)'}`,
          background: isDragging ? 'rgba(59,130,246,0.08)' : 'var(--bg-surface)',
        }}
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input type="file" accept=".csv,.tsv,.txt" onChange={handleFileChange} ref={fileInputRef} disabled={isUploading} className="hidden" />

        {isUploading ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--accent-blue)', borderTopColor: 'transparent' }} />
            <p className="text-xs font-semibold" style={{ color: 'var(--accent-blue)' }}>Importing records...</p>
          </div>
        ) : (
          <>
            <div className="w-10 h-10 rounded-xl mb-2 flex items-center justify-center transition-all" style={{ background: isDragging ? 'rgba(59,130,246,0.2)' : 'var(--bg-hover)' }}>
              <svg className={`w-5 h-5 transition-colors`} style={{ color: isDragging ? 'var(--accent-blue)' : 'var(--text-muted)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
              {isDragging ? 'Drop to import' : `Drop or click to upload ${targetStore}`}
            </p>
            <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>Replaces existing data unless in Upsert mode</p>
          </>
        )}
      </div>
    </div>
  );
};

export default Uploader;
