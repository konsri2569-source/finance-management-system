import React, { useMemo, useRef, useState } from 'react';
import { LOAN_PURPOSES } from '../types/finance';
import { useApp } from '../context/AppContext';
import {
  addDaysISO,
  alertError,
  classifyDocDirection,
  DOC_PREFIX_OPTIONS,
  escHtml,
  extractDocPrefix,
  fmt,
  normalizeTransactionAccounting,
  numRound,
  thaiBaht,
  thDate,
  thMonth,
  toastSuccess,
  todayISO,
} from '../utils/formatters';
import { exportElementToPdf, exportHtmlToWord, printHtmlSection } from '../services/exportService';
import {
  DailyBalanceOfficialForm,
  OffBudgetLedgerOfficialForm,
  buildFundLedgerSections,
} from './OfficialLedgerForms';
import { SignatureToggle } from './SignatureToggle';
import { Printer, FileText, Download, CheckCircle2, AlertTriangle, Upload, Pencil, Trash2, Save, X } from 'lucide-react';

type FinTab = 'req' | 'ledger' | 'loan' | 'reg' | 'vouch' | 'daily' | 'chk';

export const FinancialControlView: React.FC = () => {
  const {
    fy,
    db,
    fundName,
    includeSignatures,
    hasPermission,
    isGoogleConnected,
    nextDocNo,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    saveRequest,
    updateRequest,
    deleteRequest,
    setRequestStatus,
    payRequest,
    uploadRefDocument,
    createLoan,
    returnLoan,
    deleteLoan,
    deleteLoanReturn,
    getRegister,
    getVoucherRegister,
    getDailyReport,
    getChecks,
    markReportSent,
    archivePdfReport,
  } = useApp();

  const [tab, setTab] = useState<FinTab>('req');

  /* ---------- 1. Requests & Pay ---------- */
  const plansForFy = useMemo(() => {
    return db.plans
      .filter((p) => p.fy === fy)
      .map((p) => {
        const used = db.requests
          .filter((r) => r.plan === p.id && (r.status === 'อนุมัติแล้ว' || r.status === 'จ่ายเงินแล้ว'))
          .reduce((s, r) => s + r.amount, 0);
        return { ...p, left: numRound(p.amount - used) };
      });
  }, [db.plans, db.requests, fy]);

  const [rPlan, setRPlan] = useState('');
  const [rItem, setRItem] = useState('');
  const [rAmt, setRAmt] = useState('');
  const [rPerson, setRPerson] = useState('');
  const [rLink, setRLink] = useState('');
  const [editingReqId, setEditingReqId] = useState<string | null>(null);
  const [uploadingReqFile, setUploadingReqFile] = useState(false);
  const reqFormRef = useRef<HTMLFormElement | null>(null);
  const reqFileInputRef = useRef<HTMLInputElement | null>(null);

  // Pay modal state
  const [payModalId, setPayModalId] = useState<string | null>(null);
  const [payDate, setPayDate] = useState(todayISO());
  const [payDoc, setPayDoc] = useState('');
  const [payLoc, setPayLoc] = useState<'cash' | 'bank' | 'depo'>('bank');
  const [payBank, setPayBank] = useState('');

  const reqsForFy = useMemo(
    () =>
      db.requests
        .filter((r) => r.fy === fy)
        .sort((a, b) => (a.date < b.date ? 1 : -1)),
    [db.requests, fy]
  );

  const resetReqForm = () => {
    setEditingReqId(null);
    setRPlan('');
    setRItem('');
    setRAmt('');
    setRPerson('');
    setRLink('');
  };

  const startEditRequest = (r: (typeof reqsForFy)[number]) => {
    setEditingReqId(r.id);
    setRPlan(r.plan);
    setRItem(r.item);
    setRAmt(String(r.amount));
    setRPerson(r.person);
    setRLink(r.refLink || '');
    reqFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const submitRequestForm = async () => {
    try {
      const payload = {
        plan: rPlan || plansForFy[0]?.id || '',
        item: rItem,
        amount: Number(rAmt),
        person: rPerson,
        refLink: rLink,
      };
      if (editingReqId) {
        await updateRequest(editingReqId, payload);
        resetReqForm();
        toastSuccess('บันทึกการแก้ไขคำขอใช้เงินแล้ว');
      } else {
        await saveRequest(payload);
        setRItem('');
        setRAmt('');
        setRLink('');
        toastSuccess('บันทึกคำขอใช้เงินแล้ว');
      }
    } catch (err: any) {
      if (err.message !== '__CANCELLED__') alertError(err.message);
    }
  };

  const handleSaveRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitRequestForm();
  };

  const handleReqFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingReqFile(true);
    try {
      const uploaded = await uploadRefDocument(file, fy);
      setRLink(uploaded.url);
      toastSuccess(`อัปโหลดไฟล์ "${uploaded.name}" แล้ว`, 'สร้างลิงก์เอกสารอ้างอิงเรียบร้อย');
    } catch (err: any) {
      if (err.message !== '__CANCELLED__') alertError(err.message);
    } finally {
      setUploadingReqFile(false);
    }
  };

  /* ---------- 2. Ledger ---------- */
  const [fDate, setFDate] = useState(todayISO());
  const [fFund, setFFund] = useState(db.funds[0]?.id || 'F01');
  const [fDoc, setFDoc] = useState('');
  const [fDesc, setFDesc] = useState('');
  const [fRec, setFRec] = useState('');
  const [fPay, setFPay] = useState('');
  const [fLoc, setFLoc] = useState<'cash' | 'bank' | 'depo'>('bank');
  const [fBank, setFBank] = useState('');
  const [fKind, setFKind] = useState<'normal' | 'open'>('normal');
  const [fPre, setFPre] = useState('บจ');
  const [fRefLink, setFRefLink] = useState('');
  const [editingTxId, setEditingTxId] = useState<string | null>(null);
  const [uploadingTxFile, setUploadingTxFile] = useState(false);
  const ledgerFormRef = useRef<HTMLFormElement | null>(null);
  const txFileInputRef = useRef<HTMLInputElement | null>(null);

  const activeDocPrefix = useMemo(() => extractDocPrefix(fDoc), [fDoc]);
  const activeDocDir = useMemo(
    () => (fKind === 'open' ? 'unknown' : classifyDocDirection(fDoc)),
    [fDoc, fKind]
  );

  const handleDocInputChange = (val: string) => {
    setFDoc(val);
    if (fKind !== 'open') {
      const dir = classifyDocDirection(val);
      if (dir === 'pay' && Number(fRec) > 0 && !(Number(fPay) > 0)) {
        setFPay(fRec);
        setFRec('');
      } else if (dir === 'rec' && Number(fPay) > 0 && !(Number(fRec) > 0)) {
        setFRec(fPay);
        setFPay('');
      }
    }
  };

  const txForFy = useMemo(
    () =>
      db.transactions
        .filter((t) => t.fy === fy)
        .map((t) => normalizeTransactionAccounting(t))
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .slice(0, 300),
    [db.transactions, fy]
  );

  const resetLedgerForm = () => {
    setEditingTxId(null);
    setFDoc('');
    setFDesc('');
    setFRec('');
    setFPay('');
    setFRefLink('');
  };

  const startEditTx = (x: (typeof txForFy)[number]) => {
    setEditingTxId(x.id);
    setFDate(x.date);
    setFFund(x.fund);
    setFDoc(x.doc);
    const detectedPre = extractDocPrefix(x.doc);
    if (detectedPre && DOC_PREFIX_OPTIONS.some((o) => o.value === detectedPre)) {
      setFPre(detectedPre);
    }
    setFDesc(x.desc);
    setFRec(x.rec > 0 ? String(x.rec) : '');
    setFPay(x.pay > 0 ? String(x.pay) : '');
    setFLoc(x.loc || 'bank');
    setFBank(x.bank || '');
    setFKind(x.kind === 'open' ? 'open' : 'normal');
    setFRefLink(x.refLink || '');
    ledgerFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const submitLedgerForm = async () => {
    try {
      let recVal = Number(fRec) || 0;
      let payVal = Number(fPay) || 0;
      if (fKind !== 'open' && classifyDocDirection(fDoc) === 'pay' && recVal > 0 && payVal === 0) {
        payVal = recVal;
        recVal = 0;
      }
      const payload = {
        date: fDate,
        fund: fFund,
        doc: fDoc,
        desc: fDesc,
        rec: recVal,
        pay: payVal,
        loc: fLoc,
        bank: fLoc === 'bank' ? fBank : '',
        kind: fKind,
        refLink: fRefLink,
      };
      if (editingTxId) {
        await updateTransaction(editingTxId, payload);
        resetLedgerForm();
        toastSuccess('บันทึกการแก้ไขรายการในทะเบียนคุมแล้ว');
      } else {
        await addTransaction(payload);
        resetLedgerForm();
        toastSuccess('บันทึกรายการในทะเบียนคุมแล้ว');
      }
    } catch (err: any) {
      if (err.message !== '__CANCELLED__') alertError(err.message);
    }
  };

  const handleAddTx = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitLedgerForm();
  };

  const handleTxFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingTxFile(true);
    try {
      const uploaded = await uploadRefDocument(file, fy);
      setFRefLink(uploaded.url);
      toastSuccess(`อัปโหลดเอกสาร "${uploaded.name}" แล้ว`, 'แนบลิงก์เอกสารกับรายการเรียบร้อย');
    } catch (err: any) {
      if (err.message !== '__CANCELLED__') alertError(err.message);
    } finally {
      setUploadingTxFile(false);
    }
  };

  /* ---------- 3. Loans ---------- */
  const [lDate, setLDate] = useState(todayISO());
  const [lDue, setLDue] = useState(addDaysISO(todayISO(), 30));
  const [lFund, setLFund] = useState('F01');
  const [lWho, setLWho] = useState('');
  const [lPur, setLPur] = useState(LOAN_PURPOSES[0]);
  const [lAmt, setLAmt] = useState('');
  const [lLoc, setLLoc] = useState<'cash' | 'bank' | 'depo'>('bank');
  const [lBank, setLBank] = useState('');
  const [lOk, setLOk] = useState(false);

  const loansEnriched = useMemo(() => {
    const today = todayISO();
    return [...db.loans]
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .map((l) => {
        const rets = db.loanRets.filter((r) => r.loan === l.id);
        const back = rets.reduce((s, r) => s + r.voucher + r.cash, 0);
        const out = numRound(l.amount - back);
        return {
          ...l,
          rets,
          back: numRound(back),
          out,
          overdue: out > 0.004 && l.due < today,
        };
      });
  }, [db.loans, db.loanRets]);

  const [retModalLoanId, setRetModalLoanId] = useState<string | null>(null);
  const [retDate, setRetDate] = useState(todayISO());
  const [retVoucher, setRetVoucher] = useState('0');
  const [retVNo, setRetVNo] = useState('');
  const [retCash, setRetCash] = useState('0');
  const [retCNo, setRetCNo] = useState('');
  const [retLoc, setRetLoc] = useState<'cash' | 'bank' | 'depo'>('bank');
  const [retBank, setRetBank] = useState('');

  /* ---------- 4. Register ---------- */
  const [gFund, setGFund] = useState('F10');
  const [gType, setGType] = useState<'1' | '2' | '3'>('1');
  const [gAllFunds, setGAllFunds] = useState(false);
  const [gWithCover, setGWithCover] = useState(true);
  const regRef = useRef<HTMLDivElement | null>(null);

  const regData = useMemo(() => getRegister(fy, gFund), [getRegister, fy, gFund]);

  const regRows = useMemo(() => {
    const bal = { cash: 0, bank: 0, depo: 0 };
    const Y = { rec: 0, debtor: 0, voucher: 0, total: 0 };
    let M = { rec: 0, debtor: 0, voucher: 0, total: 0 };
    let cur = '';
    const rendered: Array<any> = [];

    const flush = () => {
      if (!cur) return;
      rendered.push({ type: 'sub', label: 'รวมเดือนนี้', ...M });
      rendered.push({ type: 'sub', label: 'รวมแต่ต้นปี', ...Y });
    };

    regData.events.forEach((e) => {
      const key = e.date.slice(0, 7);
      let first = false;
      if (key !== cur) {
        flush();
        M = { rec: 0, debtor: 0, voucher: 0, total: 0 };
        cur = key;
        first = true;
      }
      if (e.delta) {
        const locKey = (e.loc || 'bank') as keyof typeof bal;
        bal[locKey] = numRound(bal[locKey] + e.delta);
      }
      if (e.open) {
        Y.rec += e.amount || 0;
      } else {
        M.rec += e.rec;
        M.debtor += e.debtor;
        M.voucher += e.voucher;
        M.total += e.total;
        Y.rec += e.rec;
        Y.debtor += e.debtor;
        Y.voucher += e.voucher;
        Y.total += e.total;
      }
      rendered.push({
        type: 'row',
        first,
        monthLabel: first ? thMonth(e.date) : '',
        day: Number(e.date.slice(8)),
        doc: e.doc,
        desc: e.desc,
        open: e.open,
        rec: e.rec,
        debtor: e.debtor,
        voucher: e.voucher,
        total: e.total,
        bal: { ...bal },
      });
    });
    flush();
    return rendered;
  }, [regData]);

  /* ---------- 5. Voucher Register ---------- */
  const vouchRef = useRef<HTMLDivElement | null>(null);
  const vouchRows = useMemo(() => getVoucherRegister(fy), [getVoucherRegister, fy]);
  const vouchTotal = useMemo(() => vouchRows.reduce((s, r) => s + r.amount, 0), [vouchRows]);

  /* ---------- 6. Daily Report ---------- */
  const [dDate, setDDate] = useState(todayISO());
  const [committeeNames, setCommitteeNames] = useState<[string, string, string]>(['', '', '']);
  const dailyRef = useRef<HTMLDivElement | null>(null);
  const daily = useMemo(() => getDailyReport(dDate), [getDailyReport, dDate]);

  const dailyTotals = useMemo(() => {
    return daily.rows.reduce(
      (acc, r) => [acc[0] + r.cash, acc[1] + r.bank, acc[2] + r.depo],
      [0, 0, 0]
    );
  }, [daily]);

  const printCustodyMemo = () => {
    const cashRows = daily.rows.filter((x) => x.cash > 0.004);
    const tot = cashRows.reduce((s, x) => s + x.cash, 0);
    const html = `
      <div style="text-align:center">
        <b style="font-size:18px">บันทึกการรับเงินเพื่อเก็บรักษา</b><br/>
        ${escHtml(daily.school)}<br/>
        วันที่ ${thDate(daily.date)}
      </div>
      <p>ข้าพเจ้าได้รับเงินคงเหลือตามรายการ ดังต่อไปนี้</p>
      <table style="width:100%;border-collapse:collapse">
        <tr><th style="text-align:left">รายการ</th><th style="width:25%;text-align:right">จำนวนเงิน</th><th style="width:20%">หมายเหตุ</th></tr>
        ${
          cashRows.length
            ? cashRows
                .map(
                  (x) =>
                    `<tr><td>${escHtml(x.name)}</td><td style="text-align:right">${fmt(x.cash)}</td><td></td></tr>`
                )
                .join('')
            : '<tr><td colspan="3">ไม่มีเงินสดคงเหลือ</td></tr>'
        }
        <tr><td><b>รวมทั้งสิ้น</b> (${thaiBaht(tot)})</td><td style="text-align:right"><b>${fmt(tot)}</b></td><td></td></tr>
      </table>
      <p style="margin-top:14px">ข้าพเจ้าจะรับผิดชอบในการเก็บรักษาเงินดังกล่าว และจะส่งคืนให้เจ้าหน้าที่การเงินเพื่อจ่ายในวันทำการถัดไป</p>
      <div style="text-align:right;margin-top:26px">${includeSignatures && daily.sigDirector ? `<img src="${daily.sigDirector}" style="height:40px;display:inline-block;margin-bottom:2px" alt="sig"/><br/>` : ''}ลงชื่อ .............................. หัวหน้าสถานศึกษา<br/>(${escHtml(daily.director || '..............................')})</div>
      <p style="margin-top:18px">ข้าพเจ้าได้รับเงินจำนวน ${fmt(tot)} บาท (${thaiBaht(tot)}) คืนจากหัวหน้าสถานศึกษาในวันที่ ............ เดือน ........................ พ.ศ. ........ เพื่อจะนำไปใช้ตามระเบียบของทางราชการ</p>
      <div style="text-align:right;margin-top:26px">${includeSignatures && daily.sigFinance ? `<img src="${daily.sigFinance}" style="height:40px;display:inline-block;margin-bottom:2px" alt="sig"/><br/>` : ''}ลงชื่อ .............................. เจ้าหน้าที่การเงิน<br/>(${escHtml(daily.financeName || '..............................')})</div>
      <p style="color:#475569;font-size:12px;margin-top:16px">หมายเหตุ บันทึกการรับเงินเพื่อเก็บรักษา ให้ถือเป็นหลักฐานแทนเงินสด ต้องบันทึกไว้ทุกวันที่เก็บรักษาเงินสด และแสดงไว้ในรายงานเงินคงเหลือประจำวัน</p>
    `;
    printHtmlSection(html, `บันทึกการเก็บรักษาเงิน_${daily.date}`);
  };

  /* ---------- 7. Checks ---------- */
  const checks = useMemo(() => getChecks(fy), [getChecks, fy]);

  return (
    <div className="space-y-5">
      {/* Sub-navigation tabs */}
      <div className="flex flex-wrap gap-1.5 rounded-xl border border-slate-200 bg-white p-2">
        {(
          [
            ['req', 'ขอใช้และจ่ายเงิน'],
            ['ledger', 'ทะเบียนรายการ'],
            ['loan', 'เงินยืม'],
            ['reg', 'ทะเบียนคุมเงินนอกฯ (แบบ 1/2)'],
            ['vouch', 'ทะเบียนคุมใบสำคัญคู่จ่าย'],
            ['daily', 'รายงานเงินคงเหลือประจำวัน'],
            ['chk', 'ตรวจสอบตามคู่มือ'],
          ] as Array<[FinTab, string]>
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`rounded-lg px-3.5 py-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              tab === k
                ? 'bg-[#14306b] text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* TAB 1: Requests */}
      {tab === 'req' && (
        <div className="space-y-4">
          <form
            ref={reqFormRef}
            onSubmit={handleSaveRequest}
            className={`rounded-xl border p-4 ${
              editingReqId ? 'border-amber-400 bg-amber-50/30' : 'border-slate-200 bg-white'
            }`}
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-bold text-slate-900">
                {editingReqId ? 'แก้ไขคำขอใช้งบประมาณตามแผน' : 'ขอใช้งบประมาณตามแผน'}
              </h3>
              {editingReqId && (
                <span className="text-xs font-semibold text-amber-800">
                  กำลังแก้ไขรายการ: {rItem || editingReqId}
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <label className="text-xs font-medium text-slate-600">
                โครงการตามแผน
                <select
                  value={rPlan || plansForFy[0]?.id || ''}
                  onChange={(e) => setRPlan(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  {plansForFy.length === 0 ? (
                    <option value="">ยังไม่มีโครงการตามแผน</option>
                  ) : (
                    plansForFy.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.project} — คงเหลือ {fmt(p.left)}
                      </option>
                    ))
                  )}
                </select>
              </label>
              <label className="text-xs font-medium text-slate-600">
                รายการค่าใช้จ่าย
                <input
                  type="text"
                  value={rItem}
                  onChange={(e) => setRItem(e.target.value)}
                  required
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs font-medium text-slate-600">
                จำนวนเงิน (บาท)
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={rAmt}
                  onChange={(e) => setRAmt(e.target.value)}
                  required
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm tabular-nums"
                />
              </label>
              <label className="text-xs font-medium text-slate-600">
                ผู้รับผิดชอบ
                <input
                  type="text"
                  value={rPerson}
                  onChange={(e) => setRPerson(e.target.value)}
                  required
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                />
              </label>
              <div className="text-xs font-medium text-slate-600">
                <label className="block">
                  ลิงก์เอกสารอ้างอิง
                  <input
                    type="text"
                    value={rLink}
                    onChange={(e) => setRLink(e.target.value)}
                    placeholder="https://drive.google.com/..."
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  />
                </label>
                <div className="mt-1.5 flex items-center gap-2">
                  <button
                    type="button"
                    disabled={uploadingReqFile}
                    onClick={() => reqFileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400 bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-950 hover:bg-amber-200 disabled:opacity-50 whitespace-nowrap shrink-0"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    {uploadingReqFile ? 'กำลังอัปโหลด...' : 'เลือกอัพโหลดไฟล์'}
                  </button>
                  <input
                    ref={reqFileInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                    className="hidden"
                    onChange={handleReqFileChosen}
                  />
                </div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {editingReqId ? (
                <>
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 whitespace-nowrap shrink-0"
                  >
                    <Save className="h-4 w-4" />
                    บันทึก
                  </button>
                  <button
                    type="button"
                    onClick={resetReqForm}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
                  >
                    <X className="h-4 w-4" />
                    ยกเลิกแก้ไข
                  </button>
                </>
              ) : (
                <button
                  type="submit"
                  className="rounded-lg bg-[#14306b] px-4 py-2 text-sm font-medium text-white hover:bg-[#1d428e] whitespace-nowrap shrink-0"
                >
                  ยื่นขออนุมัติ
                </button>
              )}
            </div>
          </form>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-bold text-slate-900">รายการขอใช้เงิน ปีงบประมาณ {fy}</h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[780px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                    <th className="px-3 py-2 text-left">วันที่</th>
                    <th className="px-3 py-2 text-left">โครงการ / รายการ</th>
                    <th className="px-3 py-2 text-right">จำนวนเงิน</th>
                    <th className="px-3 py-2 text-center">สถานะ</th>
                    <th className="px-3 py-2 text-right">การดำเนินการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reqsForFy.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-xs text-slate-400">
                        ยังไม่มีคำขอใช้เงินในปีงบประมาณนี้
                      </td>
                    </tr>
                  ) : (
                    reqsForFy.map((r) => {
                      const isEditingThis = editingReqId === r.id;
                      return (
                        <tr
                          key={r.id}
                          className={isEditingThis ? 'bg-amber-50/70' : 'hover:bg-slate-50'}
                        >
                          <td className="px-3 py-2 text-xs text-slate-600 whitespace-nowrap">{thDate(r.date)}</td>
                          <td className="px-3 py-2">
                            <div className="font-medium text-slate-900">{r.project}</div>
                            <div className="text-xs text-slate-500">
                              {r.item} · {r.person} · {fundName(r.fund)}
                              {r.refLink && (
                                <>
                                  {' '}
                                  ·{' '}
                                  <a
                                    href={r.refLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[#2563eb] hover:underline"
                                  >
                                    เอกสาร
                                  </a>
                                </>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums">{fmt(r.amount)}</td>
                          <td className="px-3 py-2 text-center text-xs font-bold whitespace-nowrap">
                            <span
                              className={
                                r.status === 'จ่ายเงินแล้ว'
                                  ? 'text-emerald-700'
                                  : r.status === 'อนุมัติแล้ว'
                                  ? 'text-blue-700'
                                  : r.status === 'ไม่อนุมัติ'
                                  ? 'text-red-600'
                                  : 'text-amber-600'
                              }
                            >
                              {r.status}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                              {r.status === 'รออนุมัติ' && hasPermission('canApprove') && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => setRequestStatus(r.id, 'อนุมัติแล้ว')}
                                    className="rounded bg-[#14306b] px-2.5 py-1 text-xs font-medium text-white hover:bg-[#1d428e] whitespace-nowrap shrink-0"
                                  >
                                    อนุมัติ
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setRequestStatus(r.id, 'ไม่อนุมัติ')}
                                    className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 whitespace-nowrap shrink-0"
                                  >
                                    ไม่อนุมัติ
                                  </button>
                                </>
                              )}
                              {r.status === 'อนุมัติแล้ว' && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setPayModalId(r.id);
                                      setPayDate(todayISO());
                                      setPayDoc('');
                                      setPayLoc('bank');
                                      setPayBank('');
                                    }}
                                    className="rounded bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700 whitespace-nowrap shrink-0"
                                  >
                                    จ่ายเงิน
                                  </button>
                                  {hasPermission('canApprove') && (
                                    <button
                                      type="button"
                                      onClick={() => setRequestStatus(r.id, 'รออนุมัติ')}
                                      className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 whitespace-nowrap shrink-0"
                                    >
                                      ยกเลิกอนุมัติ
                                    </button>
                                  )}
                                </>
                              )}
                              {r.status === 'ไม่อนุมัติ' && hasPermission('canApprove') && (
                                <button
                                  type="button"
                                  onClick={() => setRequestStatus(r.id, 'รออนุมัติ')}
                                  className="rounded border border-slate-300 px-2.5 py-1 text-xs text-slate-700 whitespace-nowrap shrink-0"
                                >
                                  ส่งกลับรออนุมัติ
                                </button>
                              )}

                              {isEditingThis ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={submitRequestForm}
                                    className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700 whitespace-nowrap shrink-0"
                                  >
                                    <Save className="h-3 w-3" />
                                    บันทึก
                                  </button>
                                  <button
                                    type="button"
                                    onClick={resetReqForm}
                                    className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 whitespace-nowrap shrink-0"
                                  >
                                    ยกเลิก
                                  </button>
                                </>
                              ) : (
                                (hasPermission('canEdit') || (hasPermission('canAdd') && r.status === 'รออนุมัติ')) && (
                                  <button
                                    type="button"
                                    onClick={() => startEditRequest(r)}
                                    className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
                                  >
                                    <Pencil className="h-3 w-3" />
                                    แก้ไข
                                  </button>
                                )
                              )}

                              {(hasPermission('canDelete') || (hasPermission('canAdd') && r.status === 'รออนุมัติ')) && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    deleteRequest(r.id).catch((err: any) => alertError(err.message))
                                  }
                                  className="inline-flex items-center gap-1 rounded border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 whitespace-nowrap shrink-0"
                                >
                                  <Trash2 className="h-3 w-3" />
                                  ลบ
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Ledger */}
      {tab === 'ledger' && (
        <div className="space-y-4">
          <form
            ref={ledgerFormRef}
            onSubmit={handleAddTx}
            className={`rounded-xl border p-4 ${
              editingTxId ? 'border-amber-400 bg-amber-50/30' : 'border-slate-200 bg-white'
            }`}
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-bold text-slate-900">
                {editingTxId ? 'แก้ไขรายการรับ - จ่าย' : 'บันทึกรายการรับ - จ่าย'}
              </h3>
              {editingTxId && (
                <span className="text-xs font-semibold text-amber-800">
                  กำลังแก้ไขเอกสาร: {fDoc || editingTxId}
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <label className="text-xs font-medium text-slate-600">
                วันที่ ({thDate(fDate)})
                <input
                  type="date"
                  value={fDate}
                  onChange={(e) => setFDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs font-medium text-slate-600">
                ประเภทเงิน
                <select
                  value={fFund}
                  onChange={(e) => setFFund(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  {db.funds.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-medium text-slate-600">
                ที่เอกสาร
                <input
                  type="text"
                  value={fDoc}
                  onChange={(e) => handleDocInputChange(e.target.value)}
                  placeholder="เช่น บจ 1/2569 หรือ บคล 1/2569"
                  required
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs font-medium text-slate-600 lg:col-span-2">
                รายการ
                <input
                  type="text"
                  value={fDesc}
                  onChange={(e) => setFDesc(e.target.value)}
                  required
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs font-medium text-slate-600">
                รับ (บาท)
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={fRec}
                  disabled={activeDocDir === 'pay'}
                  onChange={(e) => setFRec(e.target.value)}
                  placeholder={activeDocDir === 'pay' ? 'เฉพาะด้านจ่าย' : '0.00'}
                  className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm tabular-nums ${
                    activeDocDir === 'pay'
                      ? 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                      : 'border-slate-300 bg-white'
                  }`}
                />
              </label>
              <label className="text-xs font-medium text-slate-600">
                จ่าย (บาท)
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={fPay}
                  disabled={activeDocDir === 'rec'}
                  onChange={(e) => setFPay(e.target.value)}
                  placeholder={activeDocDir === 'rec' ? 'เฉพาะด้านรับ' : '0.00'}
                  className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm tabular-nums ${
                    activeDocDir === 'rec'
                      ? 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                      : activeDocDir === 'pay'
                      ? 'border-amber-400 bg-amber-50/40'
                      : 'border-slate-300 bg-white'
                  }`}
                />
              </label>
              <label className="text-xs font-medium text-slate-600">
                เก็บรักษาที่
                <select
                  value={fLoc}
                  onChange={(e) => setFLoc(e.target.value as 'cash' | 'bank' | 'depo')}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="cash">เงินสด</option>
                  <option value="bank">เงินฝากธนาคาร</option>
                  <option value="depo">เงินฝากส่วนราชการผู้เบิก</option>
                </select>
              </label>
              {fLoc === 'bank' && (
                <label className="text-xs font-medium text-slate-600">
                  บัญชีธนาคาร
                  <select
                    value={fBank}
                    onChange={(e) => setFBank(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">ไม่ระบุบัญชี</option>
                    {db.banks
                      .filter((b) => b.active)
                      .map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.bank} {b.accountNo}
                        </option>
                      ))}
                  </select>
                </label>
              )}
              <label className="text-xs font-medium text-slate-600">
                ชนิดรายการ
                <select
                  value={fKind}
                  onChange={(e) => setFKind(e.target.value as 'normal' | 'open')}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="normal">รายการปกติ</option>
                  <option value="open">ยอดยกมา</option>
                </select>
              </label>
              <div className="text-xs font-medium text-slate-600">
                <label className="block">
                  เอกสารแนบ / อัปโหลดไฟล์
                  <input
                    type="text"
                    value={fRefLink}
                    onChange={(e) => setFRefLink(e.target.value)}
                    placeholder="วางลิงก์หรือกดเลือกไฟล์"
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  />
                </label>
                <div className="mt-1.5 flex items-center gap-2">
                  <button
                    type="button"
                    disabled={uploadingTxFile}
                    onClick={() => txFileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400 bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-950 hover:bg-amber-200 disabled:opacity-50 whitespace-nowrap shrink-0"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    {uploadingTxFile ? 'กำลังอัปโหลด...' : 'เลือกอัพโหลดไฟล์'}
                  </button>
                  <input
                    ref={txFileInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                    className="hidden"
                    onChange={handleTxFileChosen}
                  />
                </div>
              </div>
            </div>

            {activeDocDir === 'pay' && (
              <p className="mt-2 text-xs text-amber-800">
                เอกสาร &quot;{activeDocPrefix}&quot; เป็นเอกสารด้านจ่าย ระบบกำหนดให้ลงในช่อง &quot;จ่าย (บาท)&quot; ตามหลักบัญชีสถานศึกษาอัตโนมัติ
              </p>
            )}
            {activeDocDir === 'rec' && (
              <p className="mt-2 text-xs text-blue-800">
                เอกสาร &quot;{activeDocPrefix}&quot; เป็นเอกสารด้านรับ ระบบกำหนดให้ลงในช่อง &quot;รับ (บาท)&quot; ตามหลักบัญชีสถานศึกษาอัตโนมัติ
              </p>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <select
                value={fPre}
                onChange={(e) => setFPre(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs"
              >
                {DOC_PREFIX_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => handleDocInputChange(nextDocNo(fPre, fDate))}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                ออกเลขที่อัตโนมัติ
              </button>
              {editingTxId ? (
                <>
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-700 whitespace-nowrap shrink-0"
                  >
                    <Save className="h-4 w-4" />
                    บันทึก
                  </button>
                  <button
                    type="button"
                    onClick={resetLedgerForm}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
                  >
                    <X className="h-4 w-4" />
                    ยกเลิกแก้ไข
                  </button>
                </>
              ) : (
                <button
                  type="submit"
                  className="rounded-lg bg-[#14306b] px-5 py-2 text-sm font-medium text-white hover:bg-[#1d428e] whitespace-nowrap shrink-0"
                >
                  บันทึกรายการ
                </button>
              )}
            </div>
          </form>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-bold text-slate-900">
              ทะเบียนคุมเงินนอกงบประมาณ (รายการล่าสุด ปีงบประมาณ {fy})
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                    <th className="px-3 py-2 text-left">วันที่</th>
                    <th className="px-3 py-2 text-left">ประเภทเงิน</th>
                    <th className="px-3 py-2 text-left">ที่เอกสาร / รายการ</th>
                    <th className="px-3 py-2 text-right">รับ</th>
                    <th className="px-3 py-2 text-right">จ่าย</th>
                    <th className="px-3 py-2 text-right">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {txForFy.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-xs text-slate-400">
                        ยังไม่มีรายการในปีงบประมาณนี้ บันทึกรายการแรกด้านบนได้เลย
                      </td>
                    </tr>
                  ) : (
                    txForFy.map((x) => {
                      const isEditingThis = editingTxId === x.id;
                      return (
                        <tr
                          key={x.id}
                          className={isEditingThis ? 'bg-amber-50/70' : 'hover:bg-slate-50'}
                        >
                          <td className="px-3 py-2 text-xs text-slate-600 whitespace-nowrap">{thDate(x.date)}</td>
                          <td className="px-3 py-2 text-xs">
                            {fundName(x.fund)}
                            {x.kind === 'open' && <span className="ml-1 text-slate-400">(ยกมา)</span>}
                            {x.kind === 'loan' && <span className="ml-1 text-slate-400">(ให้ยืม)</span>}
                            {x.kind === 'loanret' && <span className="ml-1 text-slate-400">(รับคืนเงินยืม)</span>}
                          </td>
                          <td className="px-3 py-2">
                            <span className="font-medium text-slate-800">{x.doc}</span> — {x.desc}
                            {x.refLink && (
                              <>
                                {' '}
                                ·{' '}
                                <a
                                  href={x.refLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs font-medium text-[#2563eb] hover:underline"
                                >
                                  เอกสาร
                                </a>
                              </>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-blue-700">{fmt(x.rec)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-amber-700">{fmt(x.pay)}</td>
                          <td className="px-3 py-2 text-right">
                            <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                              {isEditingThis ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={submitLedgerForm}
                                    className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700 whitespace-nowrap shrink-0"
                                  >
                                    <Save className="h-3 w-3" />
                                    บันทึก
                                  </button>
                                  <button
                                    type="button"
                                    onClick={resetLedgerForm}
                                    className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 whitespace-nowrap shrink-0"
                                  >
                                    ยกเลิก
                                  </button>
                                </>
                              ) : (
                                (hasPermission('canEdit') || hasPermission('canAdd')) && (
                                  <button
                                    type="button"
                                    onClick={() => startEditTx(x)}
                                    className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
                                  >
                                    <Pencil className="h-3 w-3" />
                                    แก้ไข
                                  </button>
                                )
                              )}
                              {hasPermission('canDelete') && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    deleteTransaction(x.id).catch((e: any) => alertError(e.message))
                                  }
                                  className="inline-flex items-center gap-1 rounded border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 whitespace-nowrap shrink-0"
                                >
                                  <Trash2 className="h-3 w-3" />
                                  ลบ
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Loans */}
      {tab === 'loan' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-3 text-base font-bold text-slate-900">ทำสัญญายืมเงิน (เอกสาร บย)</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-xs font-medium text-slate-600">
                วันที่ยืม
                <input
                  type="date"
                  value={lDate}
                  onChange={(e) => {
                    setLDate(e.target.value);
                    setLDue(addDaysISO(e.target.value, 30));
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs font-medium text-slate-600">
                กำหนดส่งใช้
                <input
                  type="date"
                  value={lDue}
                  onChange={(e) => setLDue(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs font-medium text-slate-600">
                ประเภทเงินที่ยืม
                <select
                  value={lFund}
                  onChange={(e) => setLFund(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  {db.funds.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-medium text-slate-600">
                ผู้ยืม
                <input
                  type="text"
                  value={lWho}
                  onChange={(e) => setLWho(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs font-medium text-slate-600">
                วัตถุประสงค์
                <select
                  value={lPur}
                  onChange={(e) => setLPur(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  {LOAN_PURPOSES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-medium text-slate-600">
                จำนวนเงิน (บาท)
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={lAmt}
                  onChange={(e) => setLAmt(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
                />
              </label>
              <label className="text-xs font-medium text-slate-600">
                จ่ายจาก
                <select
                  value={lLoc}
                  onChange={(e) => setLLoc(e.target.value as 'cash' | 'bank' | 'depo')}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="cash">เงินสด</option>
                  <option value="bank">เงินฝากธนาคาร</option>
                  <option value="depo">เงินฝากส่วนราชการผู้เบิก</option>
                </select>
              </label>
              {lLoc === 'bank' && (
                <label className="text-xs font-medium text-slate-600">
                  บัญชีธนาคาร
                  <select
                    value={lBank}
                    onChange={(e) => setLBank(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">ไม่ระบุบัญชี</option>
                    {db.banks
                      .filter((b) => b.active)
                      .map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.bank} {b.accountNo}
                        </option>
                      ))}
                  </select>
                </label>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-800">
                <input
                  type="checkbox"
                  checked={lOk}
                  onChange={(e) => setLOk(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                ผู้อำนวยการอนุมัติแล้ว
              </label>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const no = await createLoan({
                      date: lDate,
                      due: lDue,
                      fund: lFund,
                      borrower: lWho,
                      purpose: lPur,
                      amount: Number(lAmt),
                      loc: lLoc,
                      bank: lBank,
                      approved: lOk,
                    });
                    setLWho('');
                    setLAmt('');
                    setLOk(false);
                    toastSuccess(`บันทึกสัญญายืมเงิน ${no} แล้ว`);
                  } catch (e: any) {
                    if (e.message !== '__CANCELLED__') alertError(e.message);
                  }
                }}
                className="rounded-lg bg-[#14306b] px-4 py-2 text-sm font-medium text-white hover:bg-[#1d428e]"
              >
                บันทึกสัญญายืมเงิน
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              ตามคู่มือ: ให้ยืมเฉพาะ ค่าจ้างชั่วคราว ค่าตอบแทนใช้สอยและวัสดุ ค่าสาธารณูปโภค และอาหารกลางวัน ห้ามยืมรายใหม่ถ้ายังไม่ส่งใช้รายเก่า
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-bold text-slate-900">สัญญายืมเงินและการส่งใช้</h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                    <th className="px-3 py-2 text-left">เลขที่ / วันที่</th>
                    <th className="px-3 py-2 text-left">ผู้ยืม / วัตถุประสงค์</th>
                    <th className="px-3 py-2 text-right">จำนวนเงิน</th>
                    <th className="px-3 py-2 text-right">ส่งใช้แล้ว</th>
                    <th className="px-3 py-2 text-right">ค้างชำระ</th>
                    <th className="px-3 py-2 text-left">กำหนดส่งใช้</th>
                    <th className="px-3 py-2 text-center">สถานะ</th>
                    <th className="px-3 py-2 text-right">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loansEnriched.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-3 py-6 text-center text-xs text-slate-400">
                        ยังไม่มีสัญญายืมเงิน
                      </td>
                    </tr>
                  ) : (
                    loansEnriched.map((l) => (
                      <React.Fragment key={l.id}>
                        <tr className="hover:bg-slate-50">
                          <td className="px-3 py-2">
                            <div className="font-semibold">{l.no}</div>
                            <div className="text-xs text-slate-500">{thDate(l.date)}</div>
                          </td>
                          <td className="px-3 py-2">
                            <div className="font-medium">{l.borrower}</div>
                            <div className="text-xs text-slate-500">
                              {l.purpose} · {fundName(l.fund)}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmt(l.amount)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmt(l.back)}</td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums">{fmt(l.out)}</td>
                          <td className="px-3 py-2 text-xs">{thDate(l.due)}</td>
                          <td className="px-3 py-2 text-center text-xs font-bold">
                            <span
                              className={
                                l.out <= 0.004
                                  ? 'text-emerald-700'
                                  : l.overdue
                                  ? 'text-red-600'
                                  : 'text-amber-600'
                              }
                            >
                              {l.out <= 0.004
                                ? 'ส่งใช้ครบ'
                                : l.overdue
                                ? 'เกินกำหนด'
                                : l.back > 0
                                ? 'ส่งใช้บางส่วน'
                                : 'ค้างชำระ'}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <div className="inline-flex gap-1.5">
                              {l.out > 0.004 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setRetModalLoanId(l.id);
                                    setRetDate(todayISO());
                                    setRetVoucher(String(l.out));
                                    setRetCash('0');
                                    setRetVNo('');
                                    setRetCNo('');
                                  }}
                                  className="rounded bg-[#14306b] px-2.5 py-1 text-xs font-medium text-white hover:bg-[#1d428e]"
                                >
                                  ส่งใช้
                                </button>
                              )}
                              {hasPermission('canDelete') && !l.rets.length && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    deleteLoan(l.id).catch((e: any) => alertError(e.message))
                                  }
                                  className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                                >
                                  ลบ
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {l.rets.map((r) => (
                          <tr key={r.id} className="bg-slate-50/70 text-xs text-slate-600">
                            <td colSpan={8} className="px-6 py-1.5">
                              ↳ {thDate(r.date)}:{' '}
                              {r.voucher > 0 ? `ใบสำคัญ ${r.voucherNo} ${fmt(r.voucher)} บาท ` : ''}
                              {r.cash > 0 ? `เงินสด/โอน ${r.cashNo} ${fmt(r.cash)} บาท` : ''}
                              {hasPermission('canDelete') && (
                                <button
                                  type="button"
                                  onClick={() => deleteLoanReturn(r.id)}
                                  className="ml-3 text-red-600 hover:underline"
                                >
                                  ลบ
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </React.Fragment>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: Off-Budget Register */}
      {tab === 'reg' && (
        <div className="rounded-xl border border-slate-200 bg-white p-4" ref={regRef}>
          <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {!(gType === '3' && gAllFunds) && (
                <select
                  value={gFund}
                  onChange={(e) => setGFund(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
                >
                  {db.funds.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              )}
              <select
                value={gType}
                onChange={(e) => setGType(e.target.value as '1' | '2' | '3')}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
              >
                <option value="1">แบบที่ 1 (มีเงินยืม — แนวนอน)</option>
                <option value="2">แบบที่ 2 (ไม่มีเงินยืม — แนวนอน)</option>
                <option value="3">แบบทะเบียนคุม A4 แนวตั้ง + ปก (แยกประเภท)</option>
              </select>
              {gType === '3' && (
                <>
                  <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 cursor-pointer ml-1">
                    <input
                      type="checkbox"
                      checked={gAllFunds}
                      onChange={(e) => setGAllFunds(e.target.checked)}
                    />
                    แสดงทุกประเภทที่มีรายการ
                  </label>
                  <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={gWithCover}
                      onChange={(e) => setGWithCover(e.target.checked)}
                    />
                    สร้างหน้าปก
                  </label>
                </>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  regRef.current &&
                  exportHtmlToWord(
                    `ทะเบียนคุม_${gAllFunds ? 'ทุกประเภท' : regData.fund.id}_${fy}.doc`,
                    regData.fund.name,
                    regRef.current.innerHTML,
                    { orientation: gType === '3' ? 'portrait' : 'landscape' }
                  )
                }
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                <FileText className="h-3.5 w-3.5" /> Word (.doc)
              </button>
              <button
                type="button"
                onClick={() =>
                  regRef.current &&
                  printHtmlSection(
                    regRef.current,
                    gType === '3' && gAllFunds ? `ทะเบียนคุมเงินนอกงบประมาณ_ทุกประเภท_${fy}` : regData.fund.name,
                    gType === '3' ? 'portrait' : 'landscape'
                  )
                }
                className="inline-flex items-center gap-1 rounded-lg bg-[#14306b] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#1d428e] whitespace-nowrap shrink-0"
              >
                <Printer className="h-3.5 w-3.5" /> พิมพ์ / PDF
              </button>
            </div>
          </div>

          {gType === '3' ? (
            <div className="bg-slate-100 p-3 sm:p-5 rounded-lg overflow-x-auto">
              <OffBudgetLedgerOfficialForm
                sections={buildFundLedgerSections(
                  db.funds,
                  db.transactions,
                  fy,
                  gAllFunds ? 'all_active' : 'single',
                  gFund
                )}
                fy={fy}
                settings={db.settings}
                logo={db.assets.logo}
                includeCover={gWithCover}
              />
            </div>
          ) : (
            <>
              <div className="mb-3 text-center">
                <div className="font-bold text-slate-900">
                  {gFund === 'F11'
                    ? 'ทะเบียนคุมการรับและนำส่งเงินรายได้แผ่นดิน'
                    : `ทะเบียนคุมเงินนอกงบประมาณ แบบที่ ${gType}`}
                </div>
                <div className="text-xs text-slate-600">
                  ประเภท {regData.fund.name} ประจำปีงบประมาณ {fy}
                </div>
                <div className="text-xs text-slate-500">
                  {db.settings.schoolName} · {db.settings.affiliation}
                </div>
              </div>

              <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] border-collapse text-xs">
              <thead>
                <tr className="bg-amber-300 text-slate-900">
                  <th rowSpan={2} className="border border-slate-300 px-2 py-2">เดือน</th>
                  <th rowSpan={2} className="border border-slate-300 px-2 py-2">วันที่</th>
                  <th rowSpan={2} className="border border-slate-300 px-2 py-2">ที่เอกสาร</th>
                  <th rowSpan={2} className="border border-slate-300 px-2 py-2 text-left">รายการ</th>
                  <th rowSpan={2} className="border border-slate-300 px-2 py-2 text-right">รับ</th>
                  {gType === '1' ? (
                    <th colSpan={3} className="border border-slate-300 px-2 py-1 text-center">
                      {gFund === 'F11' ? 'นำส่ง' : 'จ่าย'}
                    </th>
                  ) : (
                    <th rowSpan={2} className="border border-slate-300 px-2 py-2 text-right">
                      {gFund === 'F11' ? 'นำส่ง' : 'จ่าย'}
                    </th>
                  )}
                  <th colSpan={3} className="border border-slate-300 px-2 py-1 text-center">คงเหลือ</th>
                </tr>
                <tr className="bg-amber-200 text-slate-900">
                  {gType === '1' && (
                    <>
                      <th className="border border-slate-300 px-2 py-1 text-right">ลูกหนี้</th>
                      <th className="border border-slate-300 px-2 py-1 text-right">ใบสำคัญ</th>
                      <th className="border border-slate-300 px-2 py-1 text-right">รวม</th>
                    </>
                  )}
                  <th className="border border-slate-300 px-2 py-1 text-right">เงินสด</th>
                  <th className="border border-slate-300 px-2 py-1 text-right">เงินฝากธนาคาร</th>
                  <th className="border border-slate-300 px-2 py-1 text-right">เงินฝากเขตฯ</th>
                </tr>
              </thead>
              <tbody>
                {regRows.length === 0 ? (
                  <tr>
                    <td colSpan={gType === '1' ? 11 : 9} className="border border-slate-200 py-6 text-center text-slate-400">
                      ยังไม่มีรายการในประเภทเงินนี้ ปีงบประมาณนี้
                    </td>
                  </tr>
                ) : (
                  regRows.map((row, i) =>
                    row.type === 'sub' ? (
                      <tr key={i} className="bg-blue-50 font-bold">
                        <td colSpan={4} className="border border-slate-200 px-2 py-1.5 text-right">
                          {row.label}
                        </td>
                        <td className="border border-slate-200 px-2 py-1.5 text-right tabular-nums">
                          {row.rec ? fmt(row.rec) : ''}
                        </td>
                        {gType === '1' && (
                          <>
                            <td className="border border-slate-200 px-2 py-1.5 text-right tabular-nums">
                              {row.debtor ? fmt(row.debtor) : ''}
                            </td>
                            <td className="border border-slate-200 px-2 py-1.5 text-right tabular-nums">
                              {row.voucher ? fmt(row.voucher) : ''}
                            </td>
                          </>
                        )}
                        <td className="border border-slate-200 px-2 py-1.5 text-right tabular-nums">
                          {row.total ? fmt(row.total) : ''}
                        </td>
                        <td colSpan={3} className="border border-slate-200" />
                      </tr>
                    ) : (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="border border-slate-200 px-2 py-1.5">{row.monthLabel}</td>
                        <td className="border border-slate-200 px-2 py-1.5 text-center tabular-nums">{row.day}</td>
                        <td className="border border-slate-200 px-2 py-1.5">{row.doc}</td>
                        <td className="border border-slate-200 px-2 py-1.5">{row.desc}</td>
                        <td className="border border-slate-200 px-2 py-1.5 text-right tabular-nums">
                          {row.open || !row.rec ? '' : fmt(row.rec)}
                        </td>
                        {gType === '1' && (
                          <>
                            <td className="border border-slate-200 px-2 py-1.5 text-right tabular-nums">
                              {row.debtor ? (row.debtor < 0 ? `(${fmt(-row.debtor)})` : fmt(row.debtor)) : ''}
                            </td>
                            <td className="border border-slate-200 px-2 py-1.5 text-right tabular-nums">
                              {row.voucher ? fmt(row.voucher) : ''}
                            </td>
                          </>
                        )}
                        <td className="border border-slate-200 px-2 py-1.5 text-right tabular-nums">
                          {row.total ? (row.total < 0 ? `(${fmt(-row.total)})` : fmt(row.total)) : ''}
                        </td>
                        <td className="border border-slate-200 px-2 py-1.5 text-right tabular-nums">
                          {row.bal.cash ? fmt(row.bal.cash) : ''}
                        </td>
                        <td className="border border-slate-200 px-2 py-1.5 text-right tabular-nums">
                          {row.bal.bank ? fmt(row.bal.bank) : ''}
                        </td>
                        <td className="border border-slate-200 px-2 py-1.5 text-right tabular-nums">
                          {row.bal.depo ? fmt(row.bal.depo) : ''}
                        </td>
                      </tr>
                    )
                  )
                )}
              </tbody>
            </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB 5: Voucher Register */}
      {tab === 'vouch' && (
        <div className="rounded-xl border border-slate-200 bg-white p-4" ref={vouchRef}>
          <div className="no-print mb-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() =>
                vouchRef.current &&
                exportHtmlToWord(`ทะเบียนคุมใบสำคัญคู่จ่าย_${fy}.doc`, 'ทะเบียนคุมใบสำคัญคู่จ่าย', vouchRef.current.innerHTML)
              }
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <FileText className="h-3.5 w-3.5" /> Word (.doc)
            </button>
            <button
              type="button"
              onClick={() =>
                vouchRef.current && printHtmlSection(vouchRef.current, 'ทะเบียนคุมใบสำคัญคู่จ่าย', 'portrait')
              }
              className="inline-flex items-center gap-1 rounded-lg bg-[#14306b] px-3 py-1.5 text-xs font-medium text-white"
            >
              <Printer className="h-3.5 w-3.5" /> พิมพ์ / PDF
            </button>
          </div>
          <div className="mb-3 text-center">
            <div className="font-bold">ทะเบียนคุมใบสำคัญคู่จ่าย</div>
            <div className="text-xs text-slate-600">
              ประจำปีงบประมาณ {fy} · {db.settings.schoolName} {db.settings.affiliation}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[740px] border-collapse text-xs">
              <thead>
                <tr className="bg-amber-300 text-slate-900">
                  <th className="border border-slate-300 px-2 py-2 text-left">วันที่</th>
                  <th className="border border-slate-300 px-2 py-2 text-left">บจ</th>
                  <th className="border border-slate-300 px-2 py-2 text-left">บค</th>
                  <th className="border border-slate-300 px-2 py-2 text-left">บคล</th>
                  <th className="border border-slate-300 px-2 py-2 text-left">รายการ</th>
                  <th className="border border-slate-300 px-2 py-2 text-right">จำนวนเงิน</th>
                  <th className="border border-slate-300 px-2 py-2 text-left">ประเภทเงิน</th>
                </tr>
              </thead>
              <tbody>
                {vouchRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="border border-slate-200 py-6 text-center text-slate-400">
                      ยังไม่มีรายการจ่าย
                    </td>
                  </tr>
                ) : (
                  <>
                    {vouchRows.map((r, i) => {
                      const pre = extractDocPrefix(r.doc);
                      const isKc = pre === 'บค';
                      const isBkl = pre === 'บคล';
                      return (
                        <tr key={i}>
                          <td className="border border-slate-200 px-2 py-1.5">{thDate(r.date)}</td>
                          <td className="border border-slate-200 px-2 py-1.5">{!isKc && !isBkl ? r.doc : ''}</td>
                          <td className="border border-slate-200 px-2 py-1.5">{isKc ? r.doc : ''}</td>
                          <td className="border border-slate-200 px-2 py-1.5">{isBkl ? r.doc : ''}</td>
                          <td className="border border-slate-200 px-2 py-1.5">{r.desc}</td>
                          <td className="border border-slate-200 px-2 py-1.5 text-right tabular-nums">{fmt(r.amount)}</td>
                          <td className="border border-slate-200 px-2 py-1.5">{r.fund}</td>
                        </tr>
                      );
                    })}
                    <tr className="bg-blue-50 font-bold">
                      <td colSpan={5} className="border border-slate-200 px-2 py-1.5 text-right">
                        รวมทั้งสิ้น
                      </td>
                      <td className="border border-slate-200 px-2 py-1.5 text-right tabular-nums">{fmt(vouchTotal)}</td>
                      <td className="border border-slate-200" />
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            บจ = ใบเสร็จรับเงินจากเจ้าหนี้/บุคคลภายนอก, บค = ใบสำคัญรับเงิน (แนบสำเนาบัตรประชาชนผู้รับเงิน), บคล = บันทึกการจ่าย ทุกฉบับต้องประทับตรา &quot;จ่ายเงินแล้ว&quot; ลงชื่อผู้จ่าย และวันที่จ่าย
          </p>
        </div>
      )}

      {/* TAB 6: Daily Report (ตามเอกสาร 1 — A4 แนวตั้ง) */}
      {tab === 'daily' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="no-print flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                ประจำวันที่
                <input
                  type="date"
                  value={dDate}
                  onChange={(e) => setDDate(e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                />
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <SignatureToggle />
                {dailyTotals[0] > 0.004 && (
                  <button
                    type="button"
                    onClick={printCustodyMemo}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
                  >
                    พิมพ์บันทึกการรับเงินเพื่อเก็บรักษา
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (!dailyRef.current) return;
                    exportHtmlToWord(
                      `รายงานเงินคงเหลือประจำวัน_${dDate}.doc`,
                      'รายงานเงินคงเหลือประจำวัน',
                      dailyRef.current.innerHTML,
                      { orientation: 'portrait' }
                    );
                    toastSuccess('ดาวน์โหลดไฟล์ Word (.doc) แล้ว');
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
                >
                  <FileText className="h-3.5 w-3.5" /> Word (.doc)
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!dailyRef.current) return;
                    try {
                      const blob = await exportElementToPdf(
                        dailyRef.current,
                        `รายงานเงินคงเหลือประจำวัน_${dDate}.pdf`,
                        { download: true, orientation: 'portrait' }
                      );
                      toastSuccess('บันทึกไฟล์ PDF เรียบร้อยแล้ว');
                      await archivePdfReport({
                        reportKey: 'daily_report',
                        reportTitle: `รายงานเงินคงเหลือประจำวัน ${thDate(dDate)}`,
                        fileName: `รายงานเงินคงเหลือประจำวัน_${dDate}.pdf`,
                        pdfBlob: blob,
                        uploadToDrive: Boolean(isGoogleConnected && db.settings.driveFolderId),
                      }).catch(() => {});
                    } catch (e: any) {
                      alertError(e?.message || 'ไม่สามารถสร้างไฟล์ PDF ได้');
                    }
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
                >
                  <Download className="h-3.5 w-3.5" /> บันทึกเป็น PDF
                </button>
                <button
                  type="button"
                  onClick={() =>
                    dailyRef.current &&
                    printHtmlSection(dailyRef.current, `รายงานเงินคงเหลือประจำวัน_${dDate}`, 'portrait')
                  }
                  className="inline-flex items-center gap-1 rounded-lg bg-[#14306b] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#1d428e] whitespace-nowrap shrink-0"
                >
                  <Printer className="h-3.5 w-3.5" /> พิมพ์
                </button>
              </div>
            </div>

            {daily.overLimit && (
              <div className="no-print mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                เงินสดเงินรายได้สถานศึกษาคงเหลือ {fmt(daily.incomeCash)} บาท เกินวงเงินเก็บรักษา {fmt(daily.limit)} บาท/วัน ให้นำส่วนที่เกินฝากธนาคารหรือฝากสำนักงานเขตพื้นที่ฯ
              </div>
            )}
            {!daily.hasMove && (
              <p className="no-print mt-2 text-xs text-red-600">
                หมายเหตุ: ไม่มีการรับ-จ่ายเงินในวันที่เลือก (หากวันนั้นมีเฉพาะการส่งใช้เงินยืมด้วยใบสำคัญ ไม่ต้องจัดทำรายงาน)
              </p>
            )}
            <div className="no-print mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {[0, 1, 2].map((idx) => (
                <input
                  key={idx}
                  type="text"
                  value={committeeNames[idx]}
                  onChange={(e) => {
                    const next: [string, string, string] = [...committeeNames] as [string, string, string];
                    next[idx] = e.target.value;
                    setCommitteeNames(next);
                  }}
                  placeholder={`ชื่อกรรมการเก็บรักษาเงิน คนที่ ${idx + 1} (ถ้ามี)`}
                  className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
                />
              ))}
            </div>
          </div>

          {/* Printable Official Document matching ภาพ 1 */}
          <div className="rounded-xl border border-slate-200 bg-slate-100 p-4 sm:p-6 overflow-x-auto">
            <div ref={dailyRef} className="min-w-[680px]">
              <DailyBalanceOfficialForm
                daily={daily}
                transactions={db.transactions}
                committeeNames={committeeNames}
                showSignatures={includeSignatures}
              />
            </div>
          </div>

          {/* Supplemental Bank Accounts & Outstanding Loans reference (screen/info) */}
          <div className="no-print rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <h4 className="text-xs font-bold text-slate-800">รายละเอียดประกอบ: ยอดคงเหลือบัญชีเงินฝากธนาคาร ณ {thDate(daily.date)}</h4>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-700">
                    <th className="border border-slate-300 px-2.5 py-2 text-left">บัญชีเงินฝากธนาคาร</th>
                    <th className="border border-slate-300 px-2.5 py-2 text-left">เลขที่บัญชี</th>
                    <th className="border border-slate-300 px-2.5 py-2 text-left">ชื่อบัญชี</th>
                    <th className="border border-slate-300 px-2.5 py-2 text-right">ยอดคงเหลือ</th>
                  </tr>
                </thead>
                <tbody>
                  {daily.banks.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="border border-slate-200 py-3 text-center text-slate-400">
                        ยังไม่ได้เพิ่มบัญชีธนาคาร (ตั้งค่า &gt; บัญชีธนาคาร)
                      </td>
                    </tr>
                  ) : (
                    daily.banks.map((b) => (
                      <tr key={b.id}>
                        <td className="border border-slate-200 px-2.5 py-1.5">{b.bank}</td>
                        <td className="border border-slate-200 px-2.5 py-1.5 tabular-nums">{b.accountNo}</td>
                        <td className="border border-slate-200 px-2.5 py-1.5">{b.accountName}</td>
                        <td className="border border-slate-200 px-2.5 py-1.5 text-right tabular-nums">{fmt(b.bal)}</td>
                      </tr>
                    ))
                  )}
                  {daily.unassigned !== 0 && (
                    <tr>
                      <td colSpan={3} className="border border-slate-200 px-2.5 py-1.5">ไม่ระบุบัญชี</td>
                      <td className="border border-slate-200 px-2.5 py-1.5 text-right tabular-nums">{fmt(daily.unassigned)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {daily.loans.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
                <b>ลูกหนี้เงินยืมคงค้าง ณ {thDate(daily.date)}</b> (ตัดจากเงินคงเหลือของประเภทเงินแล้ว ไม่ถือเป็นเงินสด)
                <ul className="mt-1 list-disc pl-5">
                  {daily.loans.map((l) => (
                    <li key={l.no}>
                      {l.no} {l.borrower} {fmt(l.out)} บาท กำหนดส่ง {thDate(l.due)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 7: Manual Compliance Checks */}
      {tab === 'chk' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-3 text-base font-bold text-slate-900">รายการที่ต้องตรวจสอบหรือติดตาม</h3>
            {checks.alerts.length === 0 ? (
              <div className="flex items-center gap-2 text-sm font-medium text-emerald-700">
                <CheckCircle2 className="h-4 w-4" /> ไม่พบรายการผิดปกติตามเกณฑ์ของคู่มือ
              </div>
            ) : (
              <div className="space-y-2">
                {checks.alerts.map((a, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
                      a.level === 'red'
                        ? 'border-red-200 bg-red-50 text-red-900'
                        : 'border-amber-200 bg-amber-50 text-amber-900'
                    }`}
                  >
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{a.msg}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-bold text-slate-900">
              รายงานเงินคงเหลือประจำวัน ณ วันทำการสุดท้ายของเดือน ส่ง สพป. ภายในวันที่ 15 ของเดือนถัดไป (ปีงบประมาณ {fy})
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[540px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                    <th className="px-3 py-2 text-left">รายการ</th>
                    <th className="px-3 py-2 text-left">กำหนดส่ง</th>
                    <th className="px-3 py-2 text-left">สถานะ</th>
                    <th className="px-3 py-2 text-right">บันทึก</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {checks.monthly.map((m) => (
                    <tr key={m.key}>
                      <td className="px-3 py-2 text-xs">
                        รายงานเงินคงเหลือประจำวัน ณ วันทำการสุดท้ายของเดือน {thMonth(m.month)}
                      </td>
                      <td className="px-3 py-2 text-xs tabular-nums">{thDate(m.due)}</td>
                      <td
                        className={`px-3 py-2 text-xs font-bold ${
                          m.state === 'done'
                            ? 'text-emerald-700'
                            : m.state === 'late'
                            ? 'text-red-600'
                            : m.state === 'open'
                            ? 'text-amber-600'
                            : 'text-slate-400'
                        }`}
                      >
                        {m.state === 'done'
                          ? `ส่งแล้ว ${thDate(m.sent)}`
                          : m.state === 'late'
                          ? 'เลยกำหนด'
                          : m.state === 'open'
                          ? 'ถึงเวลาส่ง / ยังไม่ส่ง'
                          : 'ยังไม่ถึงเดือน'}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => markReportSent(m.key, !m.sent)}
                          className={`rounded px-2.5 py-1 text-xs font-medium ${
                            m.sent
                              ? 'border border-slate-300 bg-white text-slate-700'
                              : 'bg-[#14306b] text-white'
                          }`}
                        >
                          {m.sent ? 'ยกเลิกการส่ง' : 'บันทึกว่าส่งแล้ว'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-bold text-slate-900">รายงานประจำปี / ประจำภาคเรียน</h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[540px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                    <th className="px-3 py-2 text-left">รายการ</th>
                    <th className="px-3 py-2 text-left">กำหนดส่ง</th>
                    <th className="px-3 py-2 text-left">สถานะ</th>
                    <th className="px-3 py-2 text-right">บันทึก</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {checks.annual.map((a) => (
                    <tr key={a.key}>
                      <td className="px-3 py-2 text-xs">{a.label}</td>
                      <td className="px-3 py-2 text-xs tabular-nums">{thDate(a.due)}</td>
                      <td
                        className={`px-3 py-2 text-xs font-bold ${
                          a.state === 'done'
                            ? 'text-emerald-700'
                            : a.state === 'late'
                            ? 'text-red-600'
                            : 'text-amber-600'
                        }`}
                      >
                        {a.state === 'done'
                          ? `ส่งแล้ว ${thDate(a.sent)}`
                          : a.state === 'late'
                          ? 'เลยกำหนด'
                          : 'ถึงเวลาส่ง / ยังไม่ส่ง'}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => markReportSent(a.key, !a.sent)}
                          className={`rounded px-2.5 py-1 text-xs font-medium ${
                            a.sent
                              ? 'border border-slate-300 bg-white text-slate-700'
                              : 'bg-[#14306b] text-white'
                          }`}
                        >
                          {a.sent ? 'ยกเลิกการส่ง' : 'บันทึกว่าส่งแล้ว'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Pay Request Modal */}
      {payModalId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
            <h3 className="text-base font-bold text-slate-900">จ่ายเงินตามคำขอ</h3>
            <div className="mt-3 space-y-3">
              <label className="block text-xs font-medium text-slate-600">
                วันที่จ่าย
                <input
                  type="date"
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-xs font-medium text-slate-600">
                ที่เอกสาร (ใบสำคัญรับเงิน/ใบเสร็จ/บคล)
                <input
                  type="text"
                  value={payDoc}
                  onChange={(e) => setPayDoc(e.target.value)}
                  placeholder="เช่น บจ 1/2569, บค 1/2569 หรือ บคล 1/2569"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-xs font-medium text-slate-600">
                จ่ายจาก
                <select
                  value={payLoc}
                  onChange={(e) => setPayLoc(e.target.value as 'cash' | 'bank' | 'depo')}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="cash">เงินสด</option>
                  <option value="bank">เงินฝากธนาคาร</option>
                  <option value="depo">เงินฝากส่วนราชการผู้เบิก</option>
                </select>
              </label>
              {payLoc === 'bank' && (
                <label className="block text-xs font-medium text-slate-600">
                  บัญชีธนาคาร
                  <select
                    value={payBank}
                    onChange={(e) => setPayBank(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">ไม่ระบุบัญชี</option>
                    {db.banks
                      .filter((b) => b.active)
                      .map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.bank} {b.accountNo}
                        </option>
                      ))}
                  </select>
                </label>
              )}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPayModalId(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await payRequest(payModalId, {
                      date: payDate,
                      doc: payDoc,
                      loc: payLoc,
                      bank: payBank,
                    });
                    setPayModalId(null);
                    toastSuccess('จ่ายเงินและบันทึกในทะเบียนคุมแล้ว');
                  } catch (e: any) {
                    if (e.message !== '__CANCELLED__') alertError(e.message);
                  }
                }}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-700"
              >
                ยืนยันจ่ายเงิน
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Return Loan Modal */}
      {retModalLoanId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
            <h3 className="text-base font-bold text-slate-900">ส่งใช้เงินยืม</h3>
            <div className="mt-3 space-y-2.5">
              <label className="block text-xs font-medium text-slate-600">
                วันที่ส่งใช้
                <input
                  type="date"
                  value={retDate}
                  onChange={(e) => setRetDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs font-medium text-slate-600">
                  ส่งใช้เป็นใบสำคัญ (บาท)
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={retVoucher}
                    onChange={(e) => setRetVoucher(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm tabular-nums"
                  />
                </label>
                <label className="block text-xs font-medium text-slate-600">
                  เลขที่ บค/บจ/บคล
                  <div className="mt-1 flex gap-1">
                    <input
                      type="text"
                      value={retVNo}
                      onChange={(e) => setRetVNo(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setRetVNo(nextDocNo('บค', retDate))}
                      className="rounded border border-slate-300 px-2 text-xs whitespace-nowrap"
                    >
                      บค
                    </button>
                    <button
                      type="button"
                      onClick={() => setRetVNo(nextDocNo('บคล', retDate))}
                      className="rounded border border-slate-300 px-2 text-xs whitespace-nowrap"
                    >
                      บคล
                    </button>
                  </div>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs font-medium text-slate-600">
                  ส่งใช้เป็นเงินสด/ฝาก (บาท)
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={retCash}
                    onChange={(e) => setRetCash(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm tabular-nums"
                  />
                </label>
                <label className="block text-xs font-medium text-slate-600">
                  เลขที่ใบเสร็จ บร
                  <div className="mt-1 flex gap-1">
                    <input
                      type="text"
                      value={retCNo}
                      onChange={(e) => setRetCNo(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setRetCNo(nextDocNo('บร', retDate))}
                      className="rounded border border-slate-300 px-2 text-xs whitespace-nowrap"
                    >
                      บร
                    </button>
                  </div>
                </label>
              </div>
              <label className="block text-xs font-medium text-slate-600">
                นำเงินเข้า
                <select
                  value={retLoc}
                  onChange={(e) => setRetLoc(e.target.value as 'cash' | 'bank' | 'depo')}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
                >
                  <option value="cash">เงินสด</option>
                  <option value="bank">เงินฝากธนาคาร</option>
                  <option value="depo">เงินฝากส่วนราชการผู้เบิก</option>
                </select>
              </label>
              {retLoc === 'bank' && (
                <label className="block text-xs font-medium text-slate-600">
                  บัญชีธนาคาร
                  <select
                    value={retBank}
                    onChange={(e) => setRetBank(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
                  >
                    <option value="">ไม่ระบุบัญชี</option>
                    {db.banks
                      .filter((b) => b.active)
                      .map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.bank} {b.accountNo}
                        </option>
                      ))}
                  </select>
                </label>
              )}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRetModalLoanId(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await returnLoan({
                      loanId: retModalLoanId,
                      date: retDate,
                      voucherNo: retVNo,
                      voucher: Number(retVoucher) || 0,
                      cashNo: retCNo,
                      cash: Number(retCash) || 0,
                      loc: retLoc,
                      bank: retBank,
                    });
                    setRetModalLoanId(null);
                    toastSuccess('บันทึกการส่งใช้เงินยืมแล้ว');
                  } catch (e: any) {
                    if (e.message !== '__CANCELLED__') alertError(e.message);
                  }
                }}
                className="rounded-lg bg-[#14306b] px-4 py-2 text-xs font-medium text-white hover:bg-[#1d428e]"
              >
                บันทึกการส่งใช้
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
