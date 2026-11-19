import React, { useEffect, useRef, useState } from 'react';
import { Download, FileText, Printer, X } from 'lucide-react';
import {
  exportElementToPdf,
  exportHtmlToWord,
  PrintPreviewPayload,
  registerPrintPreviewHandler,
  runNativePortalPrint,
} from '../services/exportService';
import { alertError, toastSuccess } from '../utils/formatters';

export const PrintPreviewModal: React.FC = () => {
  const [payload, setPayload] = useState<PrintPreviewPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const paperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    registerPrintPreviewHandler((req) => {
      setPayload(req);
    });
    return () => registerPrintPreviewHandler(null);
  }, []);

  if (!payload) return null;

  const handleDownloadPdf = async () => {
    if (!paperRef.current) return;
    setBusy(true);
    try {
      await exportElementToPdf(paperRef.current, `${payload.title}.pdf`, {
        download: true,
        orientation: payload.orientation,
      });
      toastSuccess('บันทึกไฟล์ PDF เพื่อสั่งพิมพ์เรียบร้อยแล้ว');
    } catch (e: any) {
      alertError(e?.message || 'ไม่สามารถสร้างไฟล์ PDF ได้');
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadWord = () => {
    exportHtmlToWord(`${payload.title}.doc`, payload.title, payload.html, {
      orientation: payload.orientation,
    });
    toastSuccess('ดาวน์โหลดไฟล์ Word (.doc) เรียบร้อยแล้ว');
  };

  const handleBrowserPrint = () => {
    const { triggered } = runNativePortalPrint(payload.html, payload.orientation);
    if (!triggered) {
      toastSuccess(
        'เบราว์เซอร์จำกัดหน้าต่าง Print ในโหมด Preview',
        'กรุณากด "ดาวน์โหลด PDF เพื่อสั่งพิมพ์" ด้านบนเพื่อสั่งพิมพ์จากเครื่องได้ทันที'
      );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/60 p-3 sm:p-6 print:hidden">
      <div className="mx-auto flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-bold text-slate-900">
              ตัวอย่างก่อนพิมพ์: {payload.title}
            </h3>
            <p className="text-xs text-slate-500">
              ขนาด A4 {payload.orientation === 'landscape' ? 'แนวนอน (Landscape)' : 'แนวตั้ง (Portrait)'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={handleDownloadPdf}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#14306b] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#1d428e] disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Download className="h-3.5 w-3.5" />
              {busy ? 'กำลังสร้าง PDF...' : 'ดาวน์โหลด PDF เพื่อสั่งพิมพ์'}
            </button>
            <button
              type="button"
              onClick={handleDownloadWord}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap shrink-0"
            >
              <FileText className="h-3.5 w-3.5" />
              Word (.doc)
            </button>
            <button
              type="button"
              onClick={handleBrowserPrint}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap shrink-0"
            >
              <Printer className="h-3.5 w-3.5" />
              สั่งพิมพ์ผ่านเบราว์เซอร์
            </button>
            <button
              type="button"
              onClick={() => setPayload(null)}
              className="rounded-lg border border-slate-300 bg-white p-2 text-slate-600 hover:bg-slate-100"
              aria-label="ปิดตัวอย่างก่อนพิมพ์"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Info strip when running inside preview iframe */}
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
          หากเปิดใช้งานในหน้าต่าง Preview ซึ่งระบบป้องกันหน้าต่าง Pop-up การพิมพ์ของเบราว์เซอร์ สามารถกด <b>&quot;ดาวน์โหลด PDF เพื่อสั่งพิมพ์&quot;</b> เพื่อเปิดและสั่งพิมพ์ผ่านเครื่องพิมพ์ได้ทันทีทุกเมนู
        </div>

        {/* Scrollable A4 Paper Preview */}
        <div className="flex-1 overflow-auto bg-slate-200 p-4 sm:p-6">
          <div
            ref={paperRef}
            className={`mx-auto text-slate-900 ${
              payload.orientation === 'landscape' ? 'max-w-[1122px]' : 'max-w-[794px]'
            } ${
              payload.html.includes('pdf-page')
                ? 'space-y-6 bg-transparent p-0'
                : 'bg-white p-6 sm:p-8 shadow-md [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-slate-400 [&_th]:bg-slate-100 [&_th]:px-2 [&_th]:py-1.5 [&_td]:border [&_td]:border-slate-300 [&_td]:px-2 [&_td]:py-1.5'
            }`}
            dangerouslySetInnerHTML={{ __html: payload.html }}
          />
        </div>
      </div>
    </div>
  );
};
