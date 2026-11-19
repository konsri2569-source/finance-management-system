import React from 'react';
import { PenLine, FileSignature } from 'lucide-react';
import { useApp } from '../context/AppContext';

export const SignatureToggle: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { includeSignatures, setIncludeSignatures } = useApp();

  return (
    <div
      className={`no-print inline-flex items-center rounded-lg border border-slate-300 bg-white p-0.5 text-xs ${className}`}
      role="group"
      aria-label="ตัวเลือกการใส่ลายเซ็นอัตโนมัติ"
    >
      <button
        type="button"
        onClick={() => setIncludeSignatures(true)}
        className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition-colors whitespace-nowrap shrink-0 ${
          includeSignatures
            ? 'bg-[#14306b] text-white'
            : 'text-slate-600 hover:bg-slate-100'
        }`}
        title="แสดงลายเซ็นอัตโนมัติท้ายเอกสารที่ตั้งค่าไว้"
      >
        <FileSignature className="h-3.5 w-3.5" />
        ใส่ลายเซ็นอัตโนมัติ
      </button>
      <button
        type="button"
        onClick={() => setIncludeSignatures(false)}
        className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition-colors whitespace-nowrap shrink-0 ${
          !includeSignatures
            ? 'bg-slate-700 text-white'
            : 'text-slate-600 hover:bg-slate-100'
        }`}
        title="เว้นช่องลงชื่อว่างไว้สำหรับเซ็นด้วยปากกา"
      >
        <PenLine className="h-3.5 w-3.5" />
        ไม่ใส่ลายเซ็น
      </button>
    </div>
  );
};
