
import React, { useState } from 'react';

interface LogicInputProps {
  onCalculate: (logic: string) => void;
  isLoading: boolean;
}

const suggestions = [
  "Summarise total commission by commission owner",
  "Show top 5 earners ranked by commission amount",
  "Apply an extra 2% bonus on all GCP eligible deals",
  "Group by item category and show total commission per category",
  "Which owners have the highest applied revenue vs commission ratio?",
  "Show all eligible GWS deals and their commission totals",
];

const LogicInput: React.FC<LogicInputProps> = ({ onCalculate, isLoading }) => {
  const [logic, setLogic] = useState('');

  return (
    <div className="card p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center gradient-violet" style={{ border: '1px solid rgba(139,92,246,0.3)' }}>
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Natural Language Logic</p>
          <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Describe your commission rules in plain English</p>
        </div>
      </div>

      <form onSubmit={e => { e.preventDefault(); if (logic.trim()) onCalculate(logic); }}>
        <div className="relative">
          <textarea
            value={logic}
            onChange={e => setLogic(e.target.value)}
            rows={4}
            placeholder="e.g. 10% commission for sales over $50,000, 5% otherwise. Group results by salesperson..."
            className="w-full p-4 rounded-xl text-sm resize-none"
            style={{ fontFamily: 'Inter, sans-serif' }}
          />
          <button
            type="submit"
            disabled={isLoading || !logic.trim()}
            className="btn btn-primary absolute bottom-3 right-3"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
          >
            {isLoading ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Running...
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Run Logic
              </>
            )}
          </button>
        </div>
      </form>

      <div className="mt-4">
        <p className="label mb-2.5">Quick Templates</p>
        <div className="flex flex-wrap gap-2">
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => setLogic(s)}
              className="btn btn-ghost text-[11px] rounded-full py-1.5"
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default LogicInput;
