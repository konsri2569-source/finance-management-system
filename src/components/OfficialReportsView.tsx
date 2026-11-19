import React, { useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Download,
  FileSpreadsheet,
  FileText,
  FolderArchive,
  Plus,
  Printer,
  Save,
  Trash2,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  exportElementToPdf,
  exportHtmlToWord,
  printHtmlSection,
} from '../services/exportService';
import {
  DEFAULT_STAFF_POSITIONS_PART1,
  Part1SchoolSurvey,
} from '../types/finance';
import {
  CashBookOfficialForm,
  DailyBalanceOfficialForm,
  DailyReceivePayDepositForm,
  LedgerSectionInput,
  OffBudgetLedgerOfficialForm,
  ProjectExpenditureControlForm,
  ReceiptControlOfficialForm,
  SchoolIncomeAnnualReportForm,
  buildFundLedgerSections,
} from './OfficialLedgerForms';
import { SignatureToggle } from './SignatureToggle';
import {
  alertError,
  escHtml,
  fmt,
  normalizeTransactionAccounting,
  thaiBaht,
  thDate,
  thMonth,
  todayISO,
  toastSuccess,
} from '../utils/formatters';

type DocSubTab =
  | 'part1'
  | 'part2'
  | 'part3'
  | 'part4'
  | 'part5'
  | 'cashbook'
  | 'daily_official'
  | 'daily_summary'
  | 'offbudget9'
  | 'project_ctrl'
  | 'school_income'
  | 'revenue'
  | 'receipts'
  | 'archive';

const OFF_BUDGET_9_OPTIONS = [
  { key: 'ทะเบียนคุมเงินนอกงบประมาณ', label: 'ทะเบียนคุมเงินนอกงบประมาณ (เลือกประเภท)', fundIds: [] as string[], keyword: '' },
  { key: 'ทะเบียนคุมเงินฝากธนาคาร', label: 'ทะเบียนคุมเงินฝากธนาคารออมทรัพย์', fundIds: [] as string[], keyword: '__BANK__' },
  { key: 'ทะเบียนคุมเงินอุดหนุนทั่วไป', label: 'ทะเบียนคุมเงินอุดหนุนทั่วไป (รายหัว)', fundIds: ['F02', 'F03', 'F15'], keyword: '' },
  { key: 'ทะเบียนเงินกิจกรรมพัฒนาผู้เรียน', label: 'ทะเบียนเงินกิจกรรมพัฒนาผู้เรียน', fundIds: ['F08'], keyword: '' },
  { key: 'ทะเบียนเงินลูกเสือ_เนตรนารี', label: 'ทะเบียนเงินลูกเสือ - เนตรนารี', fundIds: ['F08'], keyword: 'ลูกเสือ' },
  { key: 'ทะเบียนคุมเงินค่ายุวกาชาด', label: 'ทะเบียนคุมเงินค่ายุวกาชาด', fundIds: ['F08'], keyword: 'ยุวกาชาด' },
  { key: 'ทะเบียนคุมเงินภาษีหัก_ณ_ที่จ่าย', label: 'ทะเบียนคุมเงินภาษีหัก ณ ที่จ่าย', fundIds: ['F13'], keyword: '' },
  { key: 'ทะเบียนคุมปัจจัยพื้นฐานยากจน', label: 'ทะเบียนคุมปัจจัยพื้นฐานนักเรียนยากจน', fundIds: ['F04'], keyword: '' },
  { key: 'ทะเบียนคุมเงินอุดหนุนอาหารกลางวัน', label: 'ทะเบียนคุมเงินอุดหนุนอาหารกลางวัน', fundIds: ['F01'], keyword: '' },
];

export const OfficialReportsView: React.FC = () => {
  const {
    db,
    fy,
    dashboard,
    fundName,
    getDailyReport,
    getRegister,
    includeSignatures,
    isGoogleConnected,
    hasPermission,
    savePart1Survey,
    addReceiptEntry,
    deleteReceiptEntry,
    addReceiptRequisition,
    saveThaiReportToSheet,
    archivePdfReport,
  } = useApp();

  const [tab, setTab] = useState<DocSubTab>('part1');
  const [busy, setBusy] = useState(false);
  const previewRef = useRef<HTMLDivElement | null>(null);

  // Part 1 Survey local state
  const [survey, setSurvey] = useState<Part1SchoolSurvey>(() => {
    if (db.part1Survey && db.part1Survey.staffCounts?.length) return db.part1Survey;
    return {
      fy,
      round1SurveyDate: `${fy - 544}-11-10`,
      round2SurveyDate: `${fy - 543}-06-10`,
      hasAccountingRoom: ['มี', 'มี'],
      hasSafeBox: ['มี', 'มี'],
      hasFinanceSign: ['มี', 'มี'],
      staffCounts: DEFAULT_STAFF_POSITIONS_PART1.map((position, i) => ({
        no: i + 1,
        position,
        round1: 0,
        round2: 0,
      })),
    };
  });

  // Part 2 manual supplement
  const [part2Notes, setPart2Notes] = useState({
    carryBudget: 0,
    revPending: 0,
  });

  // Daily official date & committee
  const [dailyDate, setDailyDate] = useState<string>(todayISO());
  const [dailyCommittee, setDailyCommittee] = useState<[string, string, string]>(['', '', '']);

  // Daily receive-pay-deposit summary (ภาพ 4)
  const [dailySummaryDate, setDailySummaryDate] = useState<string>(todayISO());

  // Cashbook month filter
  const [cashbookMonth, setCashbookMonth] = useState<string>('ALL');

  // Off-budget 9 selector
  const [reg9Key, setReg9Key] = useState<string>(OFF_BUDGET_9_OPTIONS[0].key);
  const [regFundId, setRegFundId] = useState<string>('F01');
  const [offBudgetMode, setOffBudgetMode] = useState<'single' | 'all_active' | 'all_funds'>('all_active');
  const [includeCover, setIncludeCover] = useState<boolean>(true);
  const [coverOnly, setCoverOnly] = useState<boolean>(false);

  // Project expenditure control (ภาพ 3)
  const [selectedProjectPlanId, setSelectedProjectPlanId] = useState<string>('ALL');

  // School income annual report (ภาพ 5)
  const [incomeAsOfDate, setIncomeAsOfDate] = useState<string>(todayISO());
  const [incomeCustomLabels, setIncomeCustomLabels] = useState({
    rec61: '',
    rec62: '',
    rec63: '',
    pay51: '',
    pay52: '',
  });

  // Revenue Remittance state
  const [revDocNo, setRevDocNo] = useState(`ศธ 04xxx/ว.${fy}`);
  const [revDate, setRevDate] = useState(todayISO());
  const [revNote, setRevNote] = useState('ดอกเบี้ยเงินฝากธนาคาร (เงินรายได้แผ่นดิน)');

  // Receipt Control & Requisition forms (ภาพ 2)
  const [receiptViewMode, setReceiptViewMode] = useState<'official_ledger' | 'itemized'>('official_ledger');
  const [rcBook, setRcBook] = useState('เล่ม 1');
  const [rcNo, setRcNo] = useState('');
  const [rcDate, setRcDate] = useState(todayISO());
  const [rcDesc, setRcDesc] = useState('');
  const [rcPayer, setRcPayer] = useState('');
  const [rcAmt, setRcAmt] = useState('');
  const [rcCollector, setRcCollector] = useState(db.settings.financeName || '');
  const [rcCancelled, setRcCancelled] = useState(false);

  const [rqAction, setRqAction] = useState<'รับ' | 'จ่าย'>('จ่าย');
  const [rqDate, setRqDate] = useState(todayISO());
  const [rqType, setRqType] = useState('ใบเสร็จรับเงิน (เล่มละ 50 ฉบับ)');
  const [rqQtyReq, setRqQtyReq] = useState('1');
  const [rqQtyIss, setRqQtyIss] = useState('1');
  const [rqRange, setRqRange] = useState('เล่ม 1 เลขที่ 001 - 050');
  const [rqReqBy, setRqReqBy] = useState(db.settings.financeName || '');
  const [rqAppBy, setRqAppBy] = useState(db.settings.director || '');

  const canEdit = hasPermission('canEdit') || hasPermission('canAdd');

  /* ---------- Derived Financial Aggregates for Part 2, 3, 4, 5 ---------- */
  const part2Rows = useMemo(() => {
    const freeIds = ['F02', 'F03', 'F05', 'F06', 'F07', 'F08', 'F15'];
    const freeOpen = dashboard.rows
      .filter((r) => freeIds.includes(r.id))
      .reduce((s, r) => s + r.open, 0);
    const otherOpen = dashboard.rows
      .filter((r) => !freeIds.includes(r.id) && r.id !== 'F11')
      .reduce((s, r) => s + r.open, 0);
    const revOpen = dashboard.rows.find((r) => r.id === 'F11')?.open || 0;
    return {
      carryBudget: part2Notes.carryBudget,
      revOpen: revOpen + part2Notes.revPending,
      freeOpen,
      otherOpen,
      total: part2Notes.carryBudget + revOpen + part2Notes.revPending + freeOpen + otherOpen,
    };
  }, [dashboard.rows, part2Notes]);

  const part4Agg = useMemo(() => {
    const txs = db.transactions
      .filter((t) => t.fy === fy && t.kind !== 'open')
      .map((t) => normalizeTransactionAccounting(t));
    const ce = fy - 543;
    const r1End = `${ce}-03-31`;

    const bucket = (list: typeof txs, field: 'rec' | 'pay') => {
      const sumBy = (ids: string[]) =>
        list.filter((t) => ids.includes(t.fund)).reduce((s, t) => s + t[field], 0);
      return {
        free15: sumBy(['F02', 'F03', 'F05', 'F06', 'F07', 'F08', 'F15']),
        lunchPoor: sumBy(['F01', 'F04', 'F09']),
        income: sumBy(['F10']),
        rev: sumBy(['F11']),
        other: sumBy(['F12', 'F13', 'F14']),
      };
    };

    const r1List = txs.filter((t) => t.date <= r1End);
    const r2List = txs.filter((t) => t.date > r1End);
    return {
      recR1: bucket(r1List, 'rec'),
      recR2: bucket(r2List, 'rec'),
      payR1: bucket(r1List, 'pay'),
      payR2: bucket(r2List, 'pay'),
    };
  }, [db.transactions, fy]);

  const cashbookRows = useMemo(() => {
    return db.transactions
      .filter((t) => t.fy === fy)
      .map((t) => normalizeTransactionAccounting(t))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }, [db.transactions, fy]);

  const cashbookMonths = useMemo(() => {
    const set = new Set<string>();
    cashbookRows.forEach((t) => {
      if (t.date && /^\d{4}-\d{2}/.test(t.date)) {
        set.add(t.date.slice(0, 7));
      }
    });
    return Array.from(set).sort();
  }, [cashbookRows]);

  const dailyRep = useMemo(() => getDailyReport(dailyDate), [getDailyReport, dailyDate]);

  const reg9Events = useMemo(() => {
    const opt = OFF_BUDGET_9_OPTIONS.find((o) => o.key === reg9Key) || OFF_BUDGET_9_OPTIONS[0];
    if (opt.keyword === '__BANK__') {
      return db.transactions
        .filter((t) => t.fy === fy && t.loc === 'bank')
        .map((t) => normalizeTransactionAccounting(t))
        .sort((a, b) => (a.date < b.date ? -1 : 1));
    }
    if (opt.key === 'ทะเบียนคุมเงินนอกงบประมาณ') {
      return getRegister(fy, regFundId).events;
    }
    return db.transactions
      .filter(
        (t) =>
          t.fy === fy &&
          opt.fundIds.includes(t.fund) &&
          (!opt.keyword || t.desc.includes(opt.keyword))
      )
      .map((t) => normalizeTransactionAccounting(t))
      .sort((a, b) => (a.date < b.date ? -1 : 1));
  }, [reg9Key, regFundId, db.transactions, fy, getRegister]);

  const offBudgetSections = useMemo<LedgerSectionInput[]>(() => {
    const opt = OFF_BUDGET_9_OPTIONS.find((o) => o.key === reg9Key) || OFF_BUDGET_9_OPTIONS[0];
    if (opt.key === 'ทะเบียนคุมเงินนอกงบประมาณ') {
      return buildFundLedgerSections(db.funds, db.transactions, fy, offBudgetMode, regFundId);
    }
    if (opt.keyword === '__BANK__') {
      return [
        {
          id: opt.key,
          fundTitle: opt.label,
          transactions: db.transactions.filter((t) => t.fy === fy && t.loc === 'bank'),
        },
      ];
    }
    return [
      {
        id: opt.key,
        fundTitle: opt.label,
        transactions: db.transactions.filter(
          (t) =>
            t.fy === fy &&
            opt.fundIds.includes(t.fund) &&
            (!opt.keyword || t.desc.includes(opt.keyword))
        ),
      },
    ];
  }, [reg9Key, regFundId, offBudgetMode, db.funds, db.transactions, fy]);

  const revenueSummary = useMemo(() => {
    const f11Row = dashboard.rows.find((r) => r.id === 'F11');
    const remittable = f11Row ? f11Row.open + f11Row.rec - f11Row.pay : 0;
    const txF11 = db.transactions.filter((t) => t.fy === fy && t.fund === 'F11');
    return { f11Row, remittable, txF11 };
  }, [dashboard.rows, db.transactions, fy]);

  const fyReceipts = useMemo(
    () => db.receipts.filter((r) => r.fy === fy).sort((a, b) => (a.date < b.date ? -1 : 1)),
    [db.receipts, fy]
  );

  /* ---------- Build 2D Matrix for Google Sheets Thai Tabs ---------- */
  const buildSheetPayloadForCurrentTab = (): { title: string; rows: any[][] } => {
    const school = db.settings.schoolName;
    const aff = db.settings.affiliation;
    switch (tab) {
      case 'part1':
        return {
          title: 'รายงานส่วนที่_1',
          rows: [
            ['รายงานข้อมูลพื้นฐานของโรงเรียน และข้อมูลบุคลากรที่ปฏิบัติงานจริง', school, aff, `ปีงบประมาณ ${fy}`],
            ['สถานที่ปฏิบัติงานการเงิน', 'รอบ 1 (10 พ.ย.)', 'รอบ 2 (10 มิ.ย.)'],
            ['ห้องบัญชี/การเงิน', survey.hasAccountingRoom[0], survey.hasAccountingRoom[1]],
            ['ตู้นิรภัย/ที่เก็บเงิน', survey.hasSafeBox[0], survey.hasSafeBox[1]],
            ['ป้ายแสดงตำแหน่งการเงิน', survey.hasFinanceSign[0], survey.hasFinanceSign[1]],
            [],
            ['ที่', 'ตำแหน่ง', `รอบ 1 (${survey.round1SurveyDate})`, `รอบ 2 (${survey.round2SurveyDate})`],
            ...survey.staffCounts.map((s) => [s.no, s.position, s.round1, s.round2]),
          ],
        };
      case 'part2':
        return {
          title: 'รายงานส่วนที่_2',
          rows: [
            ['รายงานส่วนที่ 2: รายงานเงินคงเหลือจากปีงบประมาณที่ผ่านมา', school, `ปีงบประมาณ ${fy}`],
            ['รายการประเภทเงิน', 'จำนวนเงินคงเหลือยกมา (บาท)'],
            ['1. เงินงบประมาณกันไว้เบิกเหลื่อมปี', part2Rows.carryBudget],
            ['2. เงินรายได้แผ่นดินคงเหลือรอนำส่ง', part2Rows.revOpen],
            ['3.1 เงินนอกงบประมาณ โครงการสนับสนุนค่าใช้จ่าย 15 ปี', part2Rows.freeOpen],
            ['3.2 เงินนอกงบประมาณอื่นๆ (อาหารกลางวัน รายได้สถานศึกษา ฯลฯ)', part2Rows.otherOpen],
            ['รวมเงินคงเหลือยกมาทั้งสิ้น', part2Rows.total],
          ],
        };
      case 'part3':
        return {
          title: 'รายงานส่วนที่_3',
          rows: [
            ['รายงานส่วนที่ 3: รายรับของโรงเรียน', school, `ปีงบประมาณ ${fy}`],
            ['รหัส', 'ประเภทเงิน', 'ยอดยกมา', 'รับจริงปีงบประมาณนี้', 'รวมรับทั้งสิ้น'],
            ...dashboard.rows.map((r) => [r.id, r.name, r.open, r.rec, r.open + r.rec]),
          ],
        };
      case 'part4':
        return {
          title: 'รายงานส่วนที่_4_จ่าย',
          rows: [
            ['รายงานส่วนที่ 4: รายรับ-รายจ่าย แยกภาคเรียน', school, `ปีงบประมาณ ${fy}`],
            ['รอบเวลา', 'เรียนฟรี 15 ปี', 'อาหารกลางวัน/ปัจจัยพื้นฐาน', 'รายได้สถานศึกษา', 'รายได้แผ่นดิน', 'อื่น ๆ'],
            ['รายรับ รอบ 1 (1 ต.ค.-31 มี.ค.)', part4Agg.recR1.free15, part4Agg.recR1.lunchPoor, part4Agg.recR1.income, part4Agg.recR1.rev, part4Agg.recR1.other],
            ['รายรับ รอบ 2 (1 เม.ย.-30 ก.ย.)', part4Agg.recR2.free15, part4Agg.recR2.lunchPoor, part4Agg.recR2.income, part4Agg.recR2.rev, part4Agg.recR2.other],
            ['รายจ่าย รอบ 1 (1 ต.ค.-31 มี.ค.)', part4Agg.payR1.free15, part4Agg.payR1.lunchPoor, part4Agg.payR1.income, part4Agg.payR1.rev, part4Agg.payR1.other],
            ['รายจ่าย รอบ 2 (1 เม.ย.-30 ก.ย.)', part4Agg.payR2.free15, part4Agg.payR2.lunchPoor, part4Agg.payR2.income, part4Agg.payR2.rev, part4Agg.payR2.other],
          ],
        };
      case 'part5':
        return {
          title: 'รายงานส่วนที่_5',
          rows: [
            ['รายงานส่วนที่ 5: สรุปเงินคงเหลือและอัตราการใช้จ่ายงบประมาณ', school, `ปีงบประมาณ ${fy}`],
            ['ประเภทเงิน', 'ยอดมีทั้งสิ้น (ยกมา+รับ)', 'จ่ายจริง', 'ลูกหนี้ค้าง', 'คงเหลือสุทธิ', 'ร้อยละการใช้'],
            ...dashboard.rows.map((r) => {
              const av = r.open + r.rec;
              const pct = av > 0 ? ((r.pay / av) * 100).toFixed(2) : '0.00';
              return [r.name, av, r.pay, r.debtor, r.bal, `${pct}%`];
            }),
          ],
        };
      case 'cashbook':
        return {
          title: 'สมุดเงินสด',
          rows: [
            ['สมุดเงินสด (รับ - จ่าย)', school, `ปีงบประมาณ ${fy}`],
            ['วันที่', 'ที่เอกสาร', 'ประเภทเงิน', 'รายการ', 'แหล่งเก็บ', 'รับ (บาท)', 'จ่าย (บาท)'],
            ...cashbookRows.map((t) => [
              t.date,
              t.doc,
              fundName(t.fund),
              t.desc,
              t.loc === 'cash' ? 'เงินสด' : t.loc === 'bank' ? 'ธนาคาร' : 'ฝากคลัง',
              t.rec,
              t.pay,
            ]),
          ],
        };
      case 'daily_official':
        return {
          title: 'รายงานเงินคงเหลือประจำวัน',
          rows: [
            ['รายงานเงินคงเหลือประจำวัน (แบบทางการ)', school, `ณ วันที่ ${thDate(dailyDate)}`],
            ['ประเภทเงิน', 'เงินสด', 'เงินฝากธนาคาร', 'เงินฝากส่วนราชการ/คลัง', 'รวมคงเหลือ'],
            ...dailyRep.rows
              .filter((r) => r.cash || r.bank || r.depo)
              .map((r) => [r.name, r.cash, r.bank, r.depo, r.cash + r.bank + r.depo]),
          ],
        };
      case 'offbudget9':
        return {
          title: reg9Key,
          rows: [
            [reg9Key, school, `ปีงบประมาณ ${fy}`],
            ['วันที่', 'ที่เอกสาร', 'รายการ', 'รับ (บาท)', 'จ่าย/ใบสำคัญ (บาท)', 'แหล่งเก็บ'],
            ...reg9Events.map((e: any) => [
              e.date,
              e.doc,
              e.desc,
              e.rec || 0,
              e.pay ?? e.total ?? e.voucher ?? 0,
              e.loc || '',
            ]),
          ],
        };
      case 'daily_summary': {
        const dayTxs = db.transactions.filter((t) => t.date === dailySummaryDate && t.kind !== 'open');
        return {
          title: 'สรุปรับจ่ายนำฝากประจำวัน',
          rows: [
            ['แบบสรุปการรับ-การจ่าย-การนำส่ง-การนำฝากเงิน', school, `ประจำวันที่ ${thDate(dailySummaryDate)}`],
            ['ที่เอกสาร/ใบเสร็จ', 'รายการ', 'รับ (บาท)', 'จ่าย (บาท)', 'แหล่งเก็บ'],
            ...dayTxs.map((t) => [t.doc, t.desc, t.rec, t.pay, t.loc]),
          ],
        };
      }
      case 'project_ctrl': {
        const fyPlans = db.plans.filter((p) => p.fy === fy);
        return {
          title: 'ทะเบียนคุมจ่ายเงินโครงการ',
          rows: [
            ['ทะเบียนคุมการใช้จ่ายเงินโครงการตามแผนปฏิบัติการประจำปี', school, `ปีงบประมาณ ${fy}`],
            ['กลุ่มงาน', 'ชื่อโครงการ', 'แหล่งเงิน', 'งบที่ได้รับจัดสรร'],
            ...fyPlans.map((p) => [p.dept, p.project, fundName(p.fund), p.amount]),
          ],
        };
      }
      case 'school_income': {
        const f10Txs = db.transactions.filter((t) => t.fy === fy && t.fund === 'F10');
        return {
          title: 'รายงานรับจ่ายเงินรายได้สถานศึกษา',
          rows: [
            ['รายงานการรับ-จ่ายเงินรายได้สถานศึกษาประจำปีงบประมาณ', school, `พ.ศ. ${fy}`],
            ['วันที่', 'ที่เอกสาร', 'รายการ', 'รับ (บาท)', 'จ่าย (บาท)'],
            ...f10Txs.map((t) => [t.date, t.doc, t.desc, t.rec, t.pay]),
          ],
        };
      }
      case 'revenue':
        return {
          title: 'ใบส่งรายได้แผ่นดิน',
          rows: [
            ['ใบนำส่งเงินรายได้แผ่นดิน / หนังสือนำส่ง', school, aff],
            ['เลขที่หนังสือ', revDocNo, 'วันที่', revDate],
            ['รายละเอียด', revNote, 'จำนวนเงินนำส่ง (บาท)', Math.max(0, revenueSummary.remittable)],
            ['จำนวนเงินตัวอักษร', thaiBaht(Math.max(0, revenueSummary.remittable))],
          ],
        };
      case 'receipts':
        return {
          title: 'รายงานใบเสร็จ',
          rows: [
            ['รายงานการใช้ใบเสร็จรับเงินและทะเบียนคุม', school, `ปีงบประมาณ ${fy}`],
            ['เล่มที่', 'เลขที่ใบเสร็จ', 'วันที่', 'รายการ', 'ผู้ชำระเงิน', 'จำนวนเงิน', 'ผู้รับเงิน', 'หมายเหตุ'],
            ...fyReceipts.map((r) => [
              r.bookNo,
              r.receiptNo,
              r.date,
              r.desc,
              r.payer,
              r.cancelled ? 0 : r.amount,
              r.collector,
              r.cancelled ? 'ยกเลิก' : 'ปกติ',
            ]),
          ],
        };
      default:
        return { title: 'คลังเอกสาร_PDF', rows: [] };
    }
  };

  const handleSaveToThaiSheet = async () => {
    const payload = buildSheetPayloadForCurrentTab();
    if (!payload.rows.length) return;
    setBusy(true);
    try {
      await saveThaiReportToSheet(payload.title, payload.rows);
      toastSuccess(`บันทึกลงแท็บ "${payload.title}" สำเร็จ`, 'ข้อมูลอยู่ใน Google Sheets แล้ว');
    } catch (e: any) {
      alertError(e.message || 'ไม่สามารถบันทึกลง Google Sheets ได้');
    } finally {
      setBusy(false);
    }
  };

  const currentOrientation: 'portrait' | 'landscape' =
    tab === 'cashbook' ||
    tab === 'project_ctrl' ||
    tab === 'daily_summary' ||
    (tab === 'receipts' && receiptViewMode === 'official_ledger')
      ? 'landscape'
      : 'portrait';

  const handleExportWord = () => {
    if (!previewRef.current) return;
    const payload = buildSheetPayloadForCurrentTab();
    exportHtmlToWord(`${payload.title}_${fy}.doc`, payload.title, previewRef.current.innerHTML, {
      orientation: currentOrientation,
    });
    toastSuccess('ดาวน์โหลดไฟล์ Word (.doc) แล้ว', 'สามารถเปิดแก้ไขเพิ่มเติมใน Microsoft Word ได้ทันที');
  };

  const handleExportPdfAndArchive = async () => {
    if (!previewRef.current) return;
    const payload = buildSheetPayloadForCurrentTab();
    const fileName = `${payload.title}_${fy}.pdf`;
    setBusy(true);
    try {
      const blob = await exportElementToPdf(previewRef.current, fileName, {
        download: true,
        orientation: currentOrientation,
      });
      await archivePdfReport({
        reportKey: tab,
        reportTitle: `${payload.title} (ปีงบประมาณ ${fy})`,
        fileName,
        pdfBlob: blob,
        uploadToDrive: Boolean(isGoogleConnected && db.settings.driveFolderId),
      });
      toastSuccess('สร้างและบันทึก PDF เรียบร้อยแล้ว');
    } catch (e: any) {
      if (e.message !== '__CANCELLED__') {
        alertError(e.message || 'ไม่สามารถสร้าง/บันทึก PDF ได้');
      }
    } finally {
      setBusy(false);
    }
  };

  const handlePrint = () => {
    if (!previewRef.current) return;
    const payload = buildSheetPayloadForCurrentTab();
    printHtmlSection(previewRef.current, `${payload.title}_${fy}`, currentOrientation);
  };

  const handleCompileFullWordBook = () => {
    const s = db.settings;
    const as = db.assets;
    const sigHtml = `
      <table style="border:none;margin-top:24pt;">
        <tr>
          <td style="border:none;text-align:center;width:50%;">
            ${includeSignatures && as.sigFinance ? `<img src="${as.sigFinance}" style="height:44px;margin:0 auto 4px;display:block" alt="sigFinance"/><br/>` : ''}
            ลงชื่อ......................................................<br/>
            (${escHtml(s.financeName || 'เจ้าหน้าที่การเงิน')})<br/>
            เจ้าหน้าที่การเงิน
          </td>
          <td style="border:none;text-align:center;width:50%;">
            ${includeSignatures && as.sigDirector ? `<img src="${as.sigDirector}" style="height:44px;margin:0 auto 4px;display:block" alt="sigDirector"/><br/>` : ''}
            ลงชื่อ......................................................<br/>
            (${escHtml(s.director || 'ผู้อำนวยการสถานศึกษา')})<br/>
            ผู้อำนวยการ ${escHtml(s.schoolName)}
          </td>
        </tr>
      </table>`;

    const p2Html = `
      <h2>รายงานส่วนที่ 2 : รายงานเงินคงเหลือจากปีงบประมาณที่ผ่านมา (ปีงบประมาณ ${fy})</h2>
      <p>${escHtml(s.schoolName)} · ${escHtml(s.affiliation)}</p>
      <table>
        <thead><tr><th>ที่</th><th>ประเภทเงิน</th><th class="text-right">จำนวนเงิน (บาท)</th></tr></thead>
        <tbody>
          <tr><td class="text-center">1</td><td>เงินงบประมาณกันไว้เบิกเหลื่อมปี</td><td class="text-right">${fmt(part2Rows.carryBudget)}</td></tr>
          <tr><td class="text-center">2</td><td>เงินรายได้แผ่นดินคงเหลือ</td><td class="text-right">${fmt(part2Rows.revOpen)}</td></tr>
          <tr><td class="text-center">3.1</td><td>เงินนอกงบประมาณ โครงการสนับสนุนค่าใช้จ่าย 15 ปี</td><td class="text-right">${fmt(part2Rows.freeOpen)}</td></tr>
          <tr><td class="text-center">3.2</td><td>เงินนอกงบประมาณอื่นๆ</td><td class="text-right">${fmt(part2Rows.otherOpen)}</td></tr>
          <tr class="font-bold"><td colspan="2" class="text-right">รวมเงินคงเหลือยกมาทั้งสิ้น</td><td class="text-right">${fmt(part2Rows.total)}</td></tr>
        </tbody>
      </table>${sigHtml}`;

    const p3Html = `
      <div class="page-break"></div>
      <h2>รายงานส่วนที่ 3 และ 5 : สรุปฐานะการเงินรายรับ-รายจ่าย และคงเหลือสุทธิ (ปีงบประมาณ ${fy})</h2>
      <table>
        <thead><tr><th>ประเภทเงิน</th><th class="text-right">ยอดยกมา</th><th class="text-right">รับปีนี้</th><th class="text-right">จ่ายปีนี้</th><th class="text-right">ลูกหนี้ค้าง</th><th class="text-right">คงเหลือสุทธิ</th></tr></thead>
        <tbody>
          ${dashboard.rows
            .map(
              (r) =>
                `<tr><td>${escHtml(r.name)}</td><td class="text-right">${fmt(r.open)}</td><td class="text-right">${fmt(r.rec)}</td><td class="text-right">${fmt(r.pay)}</td><td class="text-right">${fmt(r.debtor)}</td><td class="text-right font-bold">${fmt(r.bal)}</td></tr>`
            )
            .join('')}
        </tbody>
      </table>${sigHtml}`;

    const cbHtml = `
      <div class="page-break"></div>
      <h2>สมุดเงินสด (รับ - จ่าย) ปีงบประมาณ ${fy}</h2>
      <table>
        <thead><tr><th>วันที่</th><th>ที่เอกสาร</th><th>ประเภทเงิน</th><th>รายการ</th><th class="text-right">รับ</th><th class="text-right">จ่าย</th></tr></thead>
        <tbody>
          ${cashbookRows
            .map(
              (t) =>
                `<tr><td>${thDate(t.date)}</td><td>${escHtml(t.doc)}</td><td>${escHtml(fundName(t.fund))}</td><td>${escHtml(t.desc)}</td><td class="text-right">${t.rec ? fmt(t.rec) : '-'}</td><td class="text-right">${t.pay ? fmt(t.pay) : '-'}</td></tr>`
            )
            .join('')}
        </tbody>
      </table>${sigHtml}`;

    exportHtmlToWord(
      `เล่มเอกสารรายงานการเงิน_${s.schoolName}_${fy}.doc`,
      `เอกสารรายงานการเงิน ${s.schoolName}`,
      `<div style="text-align:center;margin-top:80pt;margin-bottom:40pt;">
        <h1>เล่มรายงานการเงินและบัญชีสถานศึกษา</h1>
        <h2>${escHtml(s.schoolName)}</h2>
        <h3>${escHtml(s.affiliation)}</h3>
        <p>ประจำปีงบประมาณ พ.ศ. ${fy}</p>
        <p>จัดพิมพ์เมื่อวันที่ ${thDate(todayISO())}</p>
      </div><div class="page-break"></div>${p2Html}${p3Html}${cbHtml}`
    );
    toastSuccess('รวมเล่มเอกสารเป็นไฟล์ Word (.doc) สำเร็จ');
  };

  /* ---------- Handlers for Part 1 & Receipts ---------- */
  const handleSavePart1 = async () => {
    try {
      await savePart1Survey(survey);
      toastSuccess('บันทึกข้อมูลรายงานส่วนที่ 1 แล้ว');
    } catch (e: any) {
      if (e.message !== '__CANCELLED__') alertError(e.message);
    }
  };

  const handleAddReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rcNo.trim() || !rcDesc.trim()) return alertError('กรุณากรอกเลขที่ใบเสร็จและรายการ');
    try {
      await addReceiptEntry({
        fy,
        bookNo: rcBook.trim(),
        receiptNo: rcNo.trim(),
        date: rcDate,
        desc: rcDesc.trim(),
        payer: rcPayer.trim() || '-',
        amount: rcCancelled ? 0 : Number(rcAmt) || 0,
        collector: rcCollector.trim() || db.settings.financeName || '-',
        cancelled: rcCancelled,
      });
      setRcNo('');
      setRcDesc('');
      setRcPayer('');
      setRcAmt('');
      setRcCancelled(false);
      toastSuccess('บันทึกใบเสร็จรับเงินในทะเบียนคุมแล้ว');
    } catch (err: any) {
      if (err.message !== '__CANCELLED__') alertError(err.message);
    }
  };

  const handleAddReceiptReq = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addReceiptRequisition({
        date: rqDate,
        bookType: `[${rqAction}] ${rqType.trim() || 'ใบเสร็จรับเงิน'}`,
        qtyRequested: Number(rqQtyReq) || 1,
        qtyIssued: rqAction === 'รับ' ? 0 : Number(rqQtyIss) || 1,
        rangeNote: rqRange,
        requester: rqReqBy,
        approver: rqAppBy,
      });
      toastSuccess(
        rqAction === 'รับ' ? 'บันทึกรับใบเสร็จเข้าทะเบียนคุมแล้ว' : 'บันทึกจ่าย/เบิกใบเสร็จรับเงินแล้ว'
      );
    } catch (err: any) {
      if (err.message !== '__CANCELLED__') alertError(err.message);
    }
  };

  const TABS: Array<{ id: DocSubTab; label: string }> = [
    { id: 'part1', label: 'ส่วนที่ 1 ข้อมูล/บุคลากร' },
    { id: 'part2', label: 'ส่วนที่ 2 ยกมาจากปีก่อน' },
    { id: 'part3', label: 'ส่วนที่ 3 รายรับโรงเรียน' },
    { id: 'part4', label: 'ส่วนที่ 4 รับ-จ่าย 2 รอบ' },
    { id: 'part5', label: 'ส่วนที่ 5 คงเหลือ & สรุป' },
    { id: 'cashbook', label: 'สมุดเงินสด' },
    { id: 'daily_official', label: 'คงเหลือประจำวัน (ทางการ)' },
    { id: 'daily_summary', label: 'สรุปรับ-จ่าย-นำฝากประจำวัน' },
    { id: 'offbudget9', label: 'ทะเบียนคุมเงินนอกฯ 9 แบบ' },
    { id: 'project_ctrl', label: 'ทะเบียนคุมจ่ายเงินโครงการ' },
    { id: 'school_income', label: 'รับ-จ่าย เงินรายได้สถานศึกษา' },
    { id: 'revenue', label: 'ใบส่งรายได้แผ่นดิน' },
    { id: 'receipts', label: 'ทะเบียนคุมใบเสร็จรับเงิน' },
    { id: 'archive', label: `คลังเอกสาร PDF (${db.pdfArchive.length})` },
  ];

  return (
    <div className="space-y-4">
      {/* Header & Global Book Compiler */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            เอกสารราชการ ส่งออก Word / PDF และบันทึกแท็บภาษาไทย (Google Sheets)
          </h2>
          <p className="text-xs text-slate-500">
            จัดทำรายงานการเงินส่วนที่ 1–5 สมุดเงินสด ทะเบียนคุมเงินนอกงบประมาณ 9 ประเภท ใบส่งรายได้แผ่นดิน และทะเบียนคุมใบเสร็จรับเงิน
          </p>
        </div>
        <button
          type="button"
          onClick={handleCompileFullWordBook}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#14306b] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#1d428e] whitespace-nowrap shrink-0"
        >
          <BookOpen className="h-4 w-4" />
          รวมเล่มรายงานทั้งหมดเป็น Word (.doc)
        </button>
      </div>

      {/* Horizontal Scrollable Sub-Tabs */}
      <div className="flex gap-1.5 overflow-x-auto rounded-xl border border-slate-200 bg-white p-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              tab === t.id
                ? 'bg-[#14306b] text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Action Bar for Active Report (except archive) */}
      {tab !== 'archive' && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5">
          <div className="text-xs text-slate-600">
            แท็บเป้าหมายใน Google Sheet:{' '}
            <span className="font-semibold text-slate-900">
              {buildSheetPayloadForCurrentTab().title}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SignatureToggle />
            <button
              type="button"
              disabled={busy}
              onClick={handleSaveToThaiSheet}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              บันทึกลงแท็บ Google Sheet
            </button>
            <button
              type="button"
              onClick={handleExportWord}
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-800 hover:bg-blue-100 whitespace-nowrap shrink-0"
            >
              <FileText className="h-3.5 w-3.5" />
              ส่งออก Word (.doc แก้ไขได้)
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={handleExportPdfAndArchive}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#14306b] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#1d428e] disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Download className="h-3.5 w-3.5" />
              สร้าง PDF &amp; บันทึกคลัง
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap shrink-0"
            >
              <Printer className="h-3.5 w-3.5" />
              พิมพ์
            </button>
          </div>
        </div>
      )}

      {/* Interactive Inputs above Official Preview */}
      {tab === 'part1' && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-slate-900">กรอก/แก้ไขข้อมูลส่วนที่ 1 (รอบ 10 พ.ย. และ 10 มิ.ย.)</h3>
            {canEdit && (
              <button
                type="button"
                onClick={handleSavePart1}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 whitespace-nowrap shrink-0"
              >
                <Save className="h-3.5 w-3.5" />
                บันทึกข้อมูลส่วนที่ 1
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <label className="mb-1 block text-xs text-slate-600">วันที่สำรวจรอบ 1 (10 พ.ย.)</label>
              <input
                type="date"
                value={survey.round1SurveyDate}
                onChange={(e) => setSurvey({ ...survey, round1SurveyDate: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-600">วันที่สำรวจรอบ 2 (10 มิ.ย.)</label>
              <input
                type="date"
                value={survey.round2SurveyDate}
                onChange={(e) => setSurvey({ ...survey, round2SurveyDate: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-600">ห้องบัญชี/การเงิน (รอบ 1 / รอบ 2)</label>
              <div className="flex gap-1">
                <select
                  value={survey.hasAccountingRoom[0]}
                  onChange={(e) => setSurvey({ ...survey, hasAccountingRoom: [e.target.value, survey.hasAccountingRoom[1]] })}
                  className="w-1/2 rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                >
                  <option value="มี">มี</option>
                  <option value="ไม่มี">ไม่มี</option>
                </select>
                <select
                  value={survey.hasAccountingRoom[1]}
                  onChange={(e) => setSurvey({ ...survey, hasAccountingRoom: [survey.hasAccountingRoom[0], e.target.value] })}
                  className="w-1/2 rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                >
                  <option value="มี">มี</option>
                  <option value="ไม่มี">ไม่มี</option>
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-600">ตู้นิรภัยเก็บเงิน (รอบ 1 / รอบ 2)</label>
              <div className="flex gap-1">
                <select
                  value={survey.hasSafeBox[0]}
                  onChange={(e) => setSurvey({ ...survey, hasSafeBox: [e.target.value, survey.hasSafeBox[1]] })}
                  className="w-1/2 rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                >
                  <option value="มี">มี</option>
                  <option value="ไม่มี">ไม่มี</option>
                </select>
                <select
                  value={survey.hasSafeBox[1]}
                  onChange={(e) => setSurvey({ ...survey, hasSafeBox: [survey.hasSafeBox[0], e.target.value] })}
                  className="w-1/2 rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                >
                  <option value="มี">มี</option>
                  <option value="ไม่มี">ไม่มี</option>
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-600">ป้ายตำแหน่งการเงิน (รอบ 1 / รอบ 2)</label>
              <div className="flex gap-1">
                <select
                  value={survey.hasFinanceSign[0]}
                  onChange={(e) => setSurvey({ ...survey, hasFinanceSign: [e.target.value, survey.hasFinanceSign[1]] })}
                  className="w-1/2 rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                >
                  <option value="มี">มี</option>
                  <option value="ไม่มี">ไม่มี</option>
                </select>
                <select
                  value={survey.hasFinanceSign[1]}
                  onChange={(e) => setSurvey({ ...survey, hasFinanceSign: [survey.hasFinanceSign[0], e.target.value] })}
                  className="w-1/2 rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                >
                  <option value="มี">มี</option>
                  <option value="ไม่มี">ไม่มี</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'part2' && (
        <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">1. เงินงบประมาณกันไว้เบิกเหลื่อมปี (บาท)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={part2Notes.carryBudget}
              onChange={(e) => setPart2Notes({ ...part2Notes, carryBudget: Number(e.target.value) || 0 })}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm tabular-nums"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">2. เงินรายได้แผ่นดินยกมาเพิ่มเติม (ถ้ามีนอกระบบ)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={part2Notes.revPending}
              onChange={(e) => setPart2Notes({ ...part2Notes, revPending: Number(e.target.value) || 0 })}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm tabular-nums"
            />
          </div>
        </div>
      )}

      {tab === 'cashbook' && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-xs font-medium text-slate-700">เลือกเดือน (สมุดเงินสด A4 แนวนอน):</label>
            <select
              value={cashbookMonth}
              onChange={(e) => setCashbookMonth(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
            >
              <option value="ALL">ทุกเดือนที่มีรายการ (แยกหน้าละ 1 เดือน พร้อมยอดยกมา)</option>
              {cashbookMonths.map((ym) => (
                <option key={ym} value={ym}>
                  {thMonth(ym)}
                </option>
              ))}
            </select>
          </div>
          <span className="text-xs text-slate-500">
            รูปแบบ A4 แนวนอน · ยอดยกไปสิ้นเดือนยกไปเป็นยอดยกมาเดือนถัดไปอัตโนมัติ
          </span>
        </div>
      )}

      {tab === 'daily_official' && (
        <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-xs font-medium text-slate-700">วันที่รายงานเงินคงเหลือประจำวัน:</label>
              <input
                type="date"
                value={dailyDate}
                onChange={(e) => setDailyDate(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
              />
            </div>
            <span className="text-xs text-slate-500">
              แบบรายงานเงินคงเหลือประจำวันครบทุกรายการ (A4 แนวตั้ง ตามเอกสารราชการ)
            </span>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {[0, 1, 2].map((idx) => (
              <input
                key={idx}
                type="text"
                value={dailyCommittee[idx]}
                onChange={(e) => {
                  const next: [string, string, string] = [...dailyCommittee] as [string, string, string];
                  next[idx] = e.target.value;
                  setDailyCommittee(next);
                }}
                placeholder={`ชื่อกรรมการเก็บรักษาเงิน คนที่ ${idx + 1} (ถ้ามี)`}
                className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
              />
            ))}
          </div>
        </div>
      )}

      {tab === 'daily_summary' && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-xs font-medium text-slate-700">เลือกวันที่สรุปรายการ:</label>
            <input
              type="date"
              value={dailySummaryDate}
              onChange={(e) => setDailySummaryDate(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
            />
          </div>
          <span className="text-xs text-slate-500">
            แบบสรุปการรับ-การจ่าย-การนำส่ง-การนำฝากเงินประจำวัน (A4 แนวนอน)
          </span>
        </div>
      )}

      {tab === 'project_ctrl' && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-xs font-medium text-slate-700">เลือกโครงการตามแผนปฏิบัติการ:</label>
            <select
              value={selectedProjectPlanId}
              onChange={(e) => setSelectedProjectPlanId(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
            >
              <option value="ALL">ทุกโครงการที่มีแผน ({db.plans.filter((p) => p.fy === fy).length} โครงการ — แยกหน้า)</option>
              {db.plans
                .filter((p) => p.fy === fy)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.project} ({fundName(p.fund)})
                  </option>
                ))}
            </select>
          </div>
          <span className="text-xs text-slate-500">
            ทะเบียนคุมการใช้จ่ายเงินโครงการตามแผนปฏิบัติการ (A4 แนวนอน)
          </span>
        </div>
      )}

      {tab === 'school_income' && (
        <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-xs font-medium text-slate-700">ข้อมูล ณ วันที่:</label>
              <input
                type="date"
                value={incomeAsOfDate}
                onChange={(e) => setIncomeAsOfDate(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
              />
            </div>
            <span className="text-xs text-slate-500">
              รายงานการรับ–จ่ายเงินรายได้สถานศึกษาประจำปีงบประมาณ พ.ศ. {fy} (A4 แนวตั้ง)
            </span>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <input
              type="text"
              value={incomeCustomLabels.rec61}
              onChange={(e) => setIncomeCustomLabels({ ...incomeCustomLabels, rec61: e.target.value })}
              placeholder="ระบุรายการ 6.1 (ถ้าต้องการกำหนดเอง)"
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
            />
            <input
              type="text"
              value={incomeCustomLabels.rec62}
              onChange={(e) => setIncomeCustomLabels({ ...incomeCustomLabels, rec62: e.target.value })}
              placeholder="ระบุรายการ 6.2"
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
            />
            <input
              type="text"
              value={incomeCustomLabels.rec63}
              onChange={(e) => setIncomeCustomLabels({ ...incomeCustomLabels, rec63: e.target.value })}
              placeholder="ระบุรายการ 6.3"
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
            />
            <input
              type="text"
              value={incomeCustomLabels.pay51}
              onChange={(e) => setIncomeCustomLabels({ ...incomeCustomLabels, pay51: e.target.value })}
              placeholder="ระบุรายจ่าย 5.1"
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
            />
            <input
              type="text"
              value={incomeCustomLabels.pay52}
              onChange={(e) => setIncomeCustomLabels({ ...incomeCustomLabels, pay52: e.target.value })}
              placeholder="ระบุรายจ่าย 5.2"
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
            />
          </div>
        </div>
      )}

      {tab === 'offbudget9' && (
        <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs text-slate-600">เลือกทะเบียนคุม (A4 แนวตั้ง)</label>
              <select
                value={reg9Key}
                onChange={(e) => setReg9Key(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
              >
                {OFF_BUDGET_9_OPTIONS.map((o) => (
                  <option key={o.key} value={o.key}>{o.label}</option>
                ))}
              </select>
            </div>
            {reg9Key === 'ทะเบียนคุมเงินนอกงบประมาณ' && (
              <>
                <div>
                  <label className="mb-1 block text-xs text-slate-600">ขอบเขตการแสดงผลตามประเภท</label>
                  <select
                    value={offBudgetMode}
                    onChange={(e) => setOffBudgetMode(e.target.value as 'single' | 'all_active' | 'all_funds')}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
                  >
                    <option value="all_active">ทุกประเภทที่มีรายการ (แยกชุดตามประเภท)</option>
                    <option value="all_funds">ครบทุกประเภทเงิน ({db.funds.length} ประเภท)</option>
                    <option value="single">เลือกเฉพาะ 1 ประเภท</option>
                  </select>
                </div>
                {offBudgetMode === 'single' && (
                  <div>
                    <label className="mb-1 block text-xs text-slate-600">เลือกประเภทเงิน</label>
                    <select
                      value={regFundId}
                      onChange={(e) => setRegFundId(e.target.value)}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
                    >
                      {db.funds.map((f) => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-4 pb-1">
            <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={includeCover}
                onChange={(e) => {
                  setIncludeCover(e.target.checked);
                  if (!e.target.checked) setCoverOnly(false);
                }}
              />
              แสดงปกทะเบียนคุม
            </label>
            <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={coverOnly}
                onChange={(e) => {
                  setCoverOnly(e.target.checked);
                  if (e.target.checked) setIncludeCover(true);
                }}
              />
              พิมพ์เฉพาะปก
            </label>
          </div>
        </div>
      )}

      {tab === 'revenue' && (
        <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs text-slate-600">ที่หนังสือราชการ</label>
            <input
              type="text"
              value={revDocNo}
              onChange={(e) => setRevDocNo(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-600">ลงวันที่</label>
            <input
              type="date"
              value={revDate}
              onChange={(e) => setRevDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-600">รายการนำส่งเงินรายได้แผ่นดิน</label>
            <input
              type="text"
              value={revNote}
              onChange={(e) => setRevNote(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
            />
          </div>
        </div>
      )}

      {tab === 'receipts' && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-700">รูปแบบเอกสารใบเสร็จ:</span>
            <button
              type="button"
              onClick={() => setReceiptViewMode('official_ledger')}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                receiptViewMode === 'official_ledger'
                  ? 'bg-[#14306b] text-white'
                  : 'border border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              ทะเบียนคุมใบเสร็จรับเงิน (A4 แนวนอน)
            </button>
            <button
              type="button"
              onClick={() => setReceiptViewMode('itemized')}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                receiptViewMode === 'itemized'
                  ? 'bg-[#14306b] text-white'
                  : 'border border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              ทะเบียนคุมการใช้รายฉบับ &amp; ประวัติใบเบิก
            </button>
          </div>
        </div>
      )}

      {tab === 'receipts' && canEdit && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <form onSubmit={handleAddReceipt} className="rounded-xl border border-slate-200 bg-white p-4 space-y-2.5">
            <h3 className="text-sm font-bold text-slate-900">บันทึกทะเบียนคุมการใช้ใบเสร็จรับเงิน (ฉบับ 1-50)</h3>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={rcBook}
                onChange={(e) => setRcBook(e.target.value)}
                placeholder="เล่มที่"
                className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
              />
              <input
                type="text"
                value={rcNo}
                onChange={(e) => setRcNo(e.target.value)}
                placeholder="เลขที่ใบเสร็จ (เช่น 001)"
                className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
              />
              <input
                type="date"
                value={rcDate}
                onChange={(e) => setRcDate(e.target.value)}
                className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
              />
              <input
                type="number"
                min="0"
                step="0.01"
                value={rcAmt}
                onChange={(e) => setRcAmt(e.target.value)}
                disabled={rcCancelled}
                placeholder="จำนวนเงิน (บาท)"
                className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs tabular-nums"
              />
              <input
                type="text"
                value={rcDesc}
                onChange={(e) => setRcDesc(e.target.value)}
                placeholder="รายการรับเงิน"
                className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs col-span-2"
              />
              <input
                type="text"
                value={rcPayer}
                onChange={(e) => setRcPayer(e.target.value)}
                placeholder="ผู้ชำระเงิน"
                className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
              />
              <input
                type="text"
                value={rcCollector}
                onChange={(e) => setRcCollector(e.target.value)}
                placeholder="ผู้รับเงิน"
                className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
              />
            </div>
            <div className="flex items-center justify-between pt-1">
              <label className="inline-flex items-center gap-1.5 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={rcCancelled}
                  onChange={(e) => setRcCancelled(e.target.checked)}
                />
                ใบเสร็จฉบับนี้ยกเลิก
              </label>
              <button
                type="submit"
                className="inline-flex items-center gap-1 rounded-lg bg-[#14306b] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#1d428e] whitespace-nowrap shrink-0"
              >
                <Plus className="h-3.5 w-3.5" />
                เพิ่มลงทะเบียนใบเสร็จ
              </button>
            </div>
          </form>

          <form onSubmit={handleAddReceiptReq} className="rounded-xl border border-slate-200 bg-white p-4 space-y-2.5">
            <h3 className="text-sm font-bold text-slate-900">บันทึกรับ/จ่ายเล่มใบเสร็จรับเงิน (ลงทะเบียนคุมใบเสร็จรับเงิน)</h3>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={rqAction}
                onChange={(e) => setRqAction(e.target.value as 'รับ' | 'จ่าย')}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium"
              >
                <option value="รับ">รับใบเสร็จเข้าคลัง (+ คงเหลือ)</option>
                <option value="จ่าย">จ่าย/เบิกใบเสร็จไปใช้ (- คงเหลือ)</option>
              </select>
              <input
                type="date"
                value={rqDate}
                onChange={(e) => setRqDate(e.target.value)}
                className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
              />
              <input
                type="text"
                value={rqType}
                onChange={(e) => setRqType(e.target.value)}
                placeholder="รายการ / ประเภทใบเสร็จ"
                className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs col-span-2"
              />
              <input
                type="number"
                min="1"
                value={rqAction === 'รับ' ? rqQtyReq : rqQtyIss}
                onChange={(e) =>
                  rqAction === 'รับ' ? setRqQtyReq(e.target.value) : setRqQtyIss(e.target.value)
                }
                placeholder={rqAction === 'รับ' ? 'จำนวนรับ (เล่ม)' : 'จำนวนจ่าย (เล่ม)'}
                className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
              />
              <input
                type="text"
                value={rqRange}
                onChange={(e) => setRqRange(e.target.value)}
                placeholder="เล่มที่ - เลขที่ (เช่น เล่ม 1 เลขที่ 001-050)"
                className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
              />
              <input
                type="text"
                value={rqReqBy}
                onChange={(e) => setRqReqBy(e.target.value)}
                placeholder="ผู้รับใบเสร็จ / ผู้เบิก"
                className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
              />
              <input
                type="text"
                value={rqAppBy}
                onChange={(e) => setRqAppBy(e.target.value)}
                placeholder="ผู้อนุมัติจ่าย"
                className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
              />
            </div>
            <div className="flex justify-end pt-1">
              <button
                type="submit"
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 whitespace-nowrap shrink-0"
              >
                <Plus className="h-3.5 w-3.5" />
                {rqAction === 'รับ' ? 'บันทึกรับใบเสร็จ' : 'บันทึกจ่ายใบเสร็จ'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Official Document Preview / Printable Area */}
      {tab !== 'archive' ? (
        <div
          className={`rounded-xl border border-slate-200 overflow-x-auto ${
            tab === 'cashbook' ||
            tab === 'daily_official' ||
            tab === 'daily_summary' ||
            tab === 'offbudget9' ||
            tab === 'project_ctrl' ||
            tab === 'school_income' ||
            (tab === 'receipts' && receiptViewMode === 'official_ledger')
              ? 'bg-slate-100 p-4 sm:p-6'
              : 'bg-white p-6'
          }`}
        >
          <div
            ref={previewRef}
            className={
              tab === 'cashbook' ||
              tab === 'project_ctrl' ||
              tab === 'daily_summary' ||
              (tab === 'receipts' && receiptViewMode === 'official_ledger')
                ? 'min-w-[980px] text-slate-900'
                : 'min-w-[680px] text-slate-900'
            }
          >
            {/* Common Official Document Letterhead (omitted for self-contained A4 official forms) */}
            {tab !== 'cashbook' &&
              tab !== 'daily_official' &&
              tab !== 'daily_summary' &&
              tab !== 'offbudget9' &&
              tab !== 'project_ctrl' &&
              tab !== 'school_income' &&
              !(tab === 'receipts' && receiptViewMode === 'official_ledger') && (
              <div className="mb-4 flex items-center justify-between border-b-2 border-slate-800 pb-3">
                <div className="flex items-center gap-3">
                  {db.assets.logo && (
                    <img
                      src={db.assets.logo}
                      alt="ตราโรงเรียน"
                      className="h-14 w-14 object-contain"
                    />
                  )}
                  <div>
                    <div className="text-base font-bold text-slate-900">{db.settings.schoolName}</div>
                    <div className="text-xs text-slate-600">{db.settings.affiliation}</div>
                    {(db.settings.district || db.settings.province) && (
                      <div className="text-xs text-slate-500">
                        อำเภอ{db.settings.district || '-'} จังหวัด{db.settings.province || '-'}
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-right text-xs text-slate-600">
                  <div className="font-semibold text-slate-900">ปีงบประมาณ พ.ศ. {fy}</div>
                  <div>รหัสสถานศึกษา: {db.settings.schoolCode || '-'}</div>
                </div>
              </div>
            )}

            {/* PART 1 */}
            {tab === 'part1' && (
              <div className="space-y-4">
                <h3 className="text-center text-base font-bold">
                  ส่วนที่ 1 : ข้อมูลพื้นฐานของโรงเรียน และข้อมูลบุคลากรที่ปฏิบัติงานจริงในโรงเรียน
                </h3>
                <table className="w-full border-collapse border border-slate-400 text-xs">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="border border-slate-400 px-2 py-1.5 text-left">ข้อมูลสถานที่ปฏิบัติงานการเงิน</th>
                      <th className="border border-slate-400 px-2 py-1.5 text-center">
                        รอบ 1 ({thDate(survey.round1SurveyDate)})
                      </th>
                      <th className="border border-slate-400 px-2 py-1.5 text-center">
                        รอบ 2 ({thDate(survey.round2SurveyDate)})
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="border border-slate-400 px-2 py-1">1. ห้องบัญชี / ห้องปฏิบัติงานการเงิน</td>
                      <td className="border border-slate-400 px-2 py-1 text-center">{survey.hasAccountingRoom[0]}</td>
                      <td className="border border-slate-400 px-2 py-1 text-center">{survey.hasAccountingRoom[1]}</td>
                    </tr>
                    <tr>
                      <td className="border border-slate-400 px-2 py-1">2. ตู้นิรภัย / ที่เก็บรักษาเงิน</td>
                      <td className="border border-slate-400 px-2 py-1 text-center">{survey.hasSafeBox[0]}</td>
                      <td className="border border-slate-400 px-2 py-1 text-center">{survey.hasSafeBox[1]}</td>
                    </tr>
                    <tr>
                      <td className="border border-slate-400 px-2 py-1">3. ป้ายแสดงตำแหน่งเจ้าหน้าที่การเงิน</td>
                      <td className="border border-slate-400 px-2 py-1 text-center">{survey.hasFinanceSign[0]}</td>
                      <td className="border border-slate-400 px-2 py-1 text-center">{survey.hasFinanceSign[1]}</td>
                    </tr>
                  </tbody>
                </table>

                <table className="w-full border-collapse border border-slate-400 text-xs">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="border border-slate-400 px-2 py-1.5 text-center w-12">ที่</th>
                      <th className="border border-slate-400 px-2 py-1.5 text-left">ตำแหน่งบุคลากร (16 ประเภท)</th>
                      <th className="border border-slate-400 px-2 py-1.5 text-center w-28">รอบ 1 (10 พ.ย.)</th>
                      <th className="border border-slate-400 px-2 py-1.5 text-center w-28">รอบ 2 (10 มิ.ย.)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {survey.staffCounts.map((s, idx) => (
                      <tr key={s.no}>
                        <td className="border border-slate-400 px-2 py-1 text-center">{s.no}</td>
                        <td className="border border-slate-400 px-2 py-1">{s.position}</td>
                        <td className="border border-slate-400 px-2 py-1 text-center">
                          <input
                            type="number"
                            min="0"
                            value={s.round1}
                            onChange={(e) => {
                              const next = [...survey.staffCounts];
                              next[idx] = { ...s, round1: Number(e.target.value) || 0 };
                              setSurvey({ ...survey, staffCounts: next });
                            }}
                            className="w-16 rounded border border-slate-200 px-1 py-0.5 text-center tabular-nums"
                          />
                        </td>
                        <td className="border border-slate-400 px-2 py-1 text-center">
                          <input
                            type="number"
                            min="0"
                            value={s.round2}
                            onChange={(e) => {
                              const next = [...survey.staffCounts];
                              next[idx] = { ...s, round2: Number(e.target.value) || 0 };
                              setSurvey({ ...survey, staffCounts: next });
                            }}
                            className="w-16 rounded border border-slate-200 px-1 py-0.5 text-center tabular-nums"
                          />
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-slate-50 font-bold">
                      <td colSpan={2} className="border border-slate-400 px-2 py-1.5 text-right">รวมบุคลากรทั้งสิ้น (คน)</td>
                      <td className="border border-slate-400 px-2 py-1.5 text-center tabular-nums">
                        {survey.staffCounts.reduce((a, b) => a + b.round1, 0)}
                      </td>
                      <td className="border border-slate-400 px-2 py-1.5 text-center tabular-nums">
                        {survey.staffCounts.reduce((a, b) => a + b.round2, 0)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* PART 2 */}
            {tab === 'part2' && (
              <div className="space-y-4">
                <h3 className="text-center text-base font-bold">
                  ส่วนที่ 2 : รายงานเงินคงเหลือจากปีงบประมาณที่ผ่านมา (ยกมา ณ 1 ตุลาคม พ.ศ. {fy - 1})
                </h3>
                <table className="w-full border-collapse border border-slate-400 text-xs">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="border border-slate-400 px-3 py-2 text-center w-16">ที่</th>
                      <th className="border border-slate-400 px-3 py-2 text-left">รายการเงินคงเหลือจากปีงบประมาณก่อน</th>
                      <th className="border border-slate-400 px-3 py-2 text-right w-44">จำนวนเงินคงเหลือ (บาท)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="border border-slate-400 px-3 py-2 text-center">1</td>
                      <td className="border border-slate-400 px-3 py-2">เงินงบประมาณกันไว้เบิกเหลื่อมปี</td>
                      <td className="border border-slate-400 px-3 py-2 text-right tabular-nums">{fmt(part2Rows.carryBudget)}</td>
                    </tr>
                    <tr>
                      <td className="border border-slate-400 px-3 py-2 text-center">2</td>
                      <td className="border border-slate-400 px-3 py-2">เงินรายได้แผ่นดินคงเหลือรอนำส่ง</td>
                      <td className="border border-slate-400 px-3 py-2 text-right tabular-nums">{fmt(part2Rows.revOpen)}</td>
                    </tr>
                    <tr>
                      <td className="border border-slate-400 px-3 py-2 text-center">3.1</td>
                      <td className="border border-slate-400 px-3 py-2">เงินนอกงบประมาณ โครงการสนับสนุนค่าใช้จ่าย 15 ปี</td>
                      <td className="border border-slate-400 px-3 py-2 text-right tabular-nums">{fmt(part2Rows.freeOpen)}</td>
                    </tr>
                    <tr>
                      <td className="border border-slate-400 px-3 py-2 text-center">3.2</td>
                      <td className="border border-slate-400 px-3 py-2">เงินนอกงบประมาณอื่นๆ (อาหารกลางวัน ปัจจัยพื้นฐาน รายได้สถานศึกษา ฯลฯ)</td>
                      <td className="border border-slate-400 px-3 py-2 text-right tabular-nums">{fmt(part2Rows.otherOpen)}</td>
                    </tr>
                    <tr className="bg-slate-50 font-bold">
                      <td colSpan={2} className="border border-slate-400 px-3 py-2 text-right">รวมเงินคงเหลือยกมาทั้งสิ้น</td>
                      <td className="border border-slate-400 px-3 py-2 text-right tabular-nums">{fmt(part2Rows.total)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* PART 3 */}
            {tab === 'part3' && (
              <div className="space-y-4">
                <h3 className="text-center text-base font-bold">
                  ส่วนที่ 3 : รายงานรายรับของโรงเรียน ประจำปีงบประมาณ {fy}
                </h3>
                <table className="w-full border-collapse border border-slate-400 text-xs">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="border border-slate-400 px-2 py-2 text-center w-14">รหัส</th>
                      <th className="border border-slate-400 px-2 py-2 text-left">ประเภทเงิน / แหล่งเงิน</th>
                      <th className="border border-slate-400 px-2 py-2 text-right">1. ยอดยกมา</th>
                      <th className="border border-slate-400 px-2 py-2 text-right">2. รับจริงในปีงบประมาณ</th>
                      <th className="border border-slate-400 px-2 py-2 text-right">รวมรายรับทั้งสิ้น</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.rows.map((r) => (
                      <tr key={r.id}>
                        <td className="border border-slate-400 px-2 py-1.5 text-center">{r.id}</td>
                        <td className="border border-slate-400 px-2 py-1.5">{r.name}</td>
                        <td className="border border-slate-400 px-2 py-1.5 text-right tabular-nums">{fmt(r.open)}</td>
                        <td className="border border-slate-400 px-2 py-1.5 text-right tabular-nums">{fmt(r.rec)}</td>
                        <td className="border border-slate-400 px-2 py-1.5 text-right font-semibold tabular-nums">{fmt(r.open + r.rec)}</td>
                      </tr>
                    ))}
                    <tr className="bg-slate-50 font-bold">
                      <td colSpan={2} className="border border-slate-400 px-2 py-2 text-right">รวมทั้งสิ้น</td>
                      <td className="border border-slate-400 px-2 py-2 text-right tabular-nums">
                        {fmt(dashboard.rows.reduce((s, r) => s + r.open, 0))}
                      </td>
                      <td className="border border-slate-400 px-2 py-2 text-right tabular-nums">
                        {fmt(dashboard.rows.reduce((s, r) => s + r.rec, 0))}
                      </td>
                      <td className="border border-slate-400 px-2 py-2 text-right tabular-nums">
                        {fmt(dashboard.rows.reduce((s, r) => s + r.open + r.rec, 0))}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* PART 4 */}
            {tab === 'part4' && (
              <div className="space-y-4">
                <h3 className="text-center text-base font-bold">
                  ส่วนที่ 4 : รายรับ-รายจ่ายของโรงเรียน แยกตามภาคเรียน (1 ต.ค. - 31 มี.ค. และ 1 เม.ย. - 30 ก.ย.)
                </h3>
                <table className="w-full border-collapse border border-slate-400 text-xs">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="border border-slate-400 px-2 py-2 text-left">รายการ / รอบการรายงาน</th>
                      <th className="border border-slate-400 px-2 py-2 text-right">เรียนฟรี 15 ปี</th>
                      <th className="border border-slate-400 px-2 py-2 text-right">อาหารกลางวัน/ปัจจัยฯ</th>
                      <th className="border border-slate-400 px-2 py-2 text-right">รายได้สถานศึกษา</th>
                      <th className="border border-slate-400 px-2 py-2 text-right">รายได้แผ่นดิน</th>
                      <th className="border border-slate-400 px-2 py-2 text-right">อื่น ๆ / ประกัน/ภาษี</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="border border-slate-400 px-2 py-2 font-medium">รายรับ รอบ 1 (1 ต.ค. - 31 มี.ค.)</td>
                      <td className="border border-slate-400 px-2 py-2 text-right tabular-nums">{fmt(part4Agg.recR1.free15)}</td>
                      <td className="border border-slate-400 px-2 py-2 text-right tabular-nums">{fmt(part4Agg.recR1.lunchPoor)}</td>
                      <td className="border border-slate-400 px-2 py-2 text-right tabular-nums">{fmt(part4Agg.recR1.income)}</td>
                      <td className="border border-slate-400 px-2 py-2 text-right tabular-nums">{fmt(part4Agg.recR1.rev)}</td>
                      <td className="border border-slate-400 px-2 py-2 text-right tabular-nums">{fmt(part4Agg.recR1.other)}</td>
                    </tr>
                    <tr>
                      <td className="border border-slate-400 px-2 py-2 font-medium">รายรับ รอบ 2 (1 เม.ย. - 30 ก.ย.)</td>
                      <td className="border border-slate-400 px-2 py-2 text-right tabular-nums">{fmt(part4Agg.recR2.free15)}</td>
                      <td className="border border-slate-400 px-2 py-2 text-right tabular-nums">{fmt(part4Agg.recR2.lunchPoor)}</td>
                      <td className="border border-slate-400 px-2 py-2 text-right tabular-nums">{fmt(part4Agg.recR2.income)}</td>
                      <td className="border border-slate-400 px-2 py-2 text-right tabular-nums">{fmt(part4Agg.recR2.rev)}</td>
                      <td className="border border-slate-400 px-2 py-2 text-right tabular-nums">{fmt(part4Agg.recR2.other)}</td>
                    </tr>
                    <tr className="bg-amber-50/40">
                      <td className="border border-slate-400 px-2 py-2 font-medium">รายจ่าย รอบ 1 (1 ต.ค. - 31 มี.ค.)</td>
                      <td className="border border-slate-400 px-2 py-2 text-right tabular-nums">{fmt(part4Agg.payR1.free15)}</td>
                      <td className="border border-slate-400 px-2 py-2 text-right tabular-nums">{fmt(part4Agg.payR1.lunchPoor)}</td>
                      <td className="border border-slate-400 px-2 py-2 text-right tabular-nums">{fmt(part4Agg.payR1.income)}</td>
                      <td className="border border-slate-400 px-2 py-2 text-right tabular-nums">{fmt(part4Agg.payR1.rev)}</td>
                      <td className="border border-slate-400 px-2 py-2 text-right tabular-nums">{fmt(part4Agg.payR1.other)}</td>
                    </tr>
                    <tr className="bg-amber-50/40">
                      <td className="border border-slate-400 px-2 py-2 font-medium">รายจ่าย รอบ 2 (1 เม.ย. - 30 ก.ย.)</td>
                      <td className="border border-slate-400 px-2 py-2 text-right tabular-nums">{fmt(part4Agg.payR2.free15)}</td>
                      <td className="border border-slate-400 px-2 py-2 text-right tabular-nums">{fmt(part4Agg.payR2.lunchPoor)}</td>
                      <td className="border border-slate-400 px-2 py-2 text-right tabular-nums">{fmt(part4Agg.payR2.income)}</td>
                      <td className="border border-slate-400 px-2 py-2 text-right tabular-nums">{fmt(part4Agg.payR2.rev)}</td>
                      <td className="border border-slate-400 px-2 py-2 text-right tabular-nums">{fmt(part4Agg.payR2.other)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* PART 5 */}
            {tab === 'part5' && (
              <div className="space-y-4">
                <h3 className="text-center text-base font-bold">
                  ส่วนที่ 5 : รายงานเงินคงเหลือ ณ วันสิ้นงวด และสรุปอัตราการใช้จ่ายงบประมาณ ปี {fy}
                </h3>
                <table className="w-full border-collapse border border-slate-400 text-xs">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="border border-slate-400 px-2 py-2 text-left">ประเภทเงิน</th>
                      <th className="border border-slate-400 px-2 py-2 text-right">รวมมี (ยกมา+รับ)</th>
                      <th className="border border-slate-400 px-2 py-2 text-right">จ่ายจริง</th>
                      <th className="border border-slate-400 px-2 py-2 text-right">ลูกหนี้ค้างส่งใช้</th>
                      <th className="border border-slate-400 px-2 py-2 text-right">คงเหลือสุทธิ</th>
                      <th className="border border-slate-400 px-2 py-2 text-right">อัตราใช้จ่าย</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.rows.map((r) => {
                      const avail = r.open + r.rec;
                      const pct = avail > 0 ? ((r.pay / avail) * 100).toFixed(2) : '0.00';
                      return (
                        <tr key={r.id}>
                          <td className="border border-slate-400 px-2 py-1.5">{r.name}</td>
                          <td className="border border-slate-400 px-2 py-1.5 text-right tabular-nums">{fmt(avail)}</td>
                          <td className="border border-slate-400 px-2 py-1.5 text-right tabular-nums">{fmt(r.pay)}</td>
                          <td className="border border-slate-400 px-2 py-1.5 text-right tabular-nums">{fmt(r.debtor)}</td>
                          <td className="border border-slate-400 px-2 py-1.5 text-right font-semibold tabular-nums">{fmt(r.bal)}</td>
                          <td className="border border-slate-400 px-2 py-1.5 text-right tabular-nums">{pct}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* CASHBOOK (ตามภาพ 1 — สมุดเงินสด A4 แนวนอน แยกเดือน พร้อมยอดยกมา) */}
            {tab === 'cashbook' && (
              <CashBookOfficialForm
                transactions={db.transactions}
                fy={fy}
                schoolName={db.settings.schoolName}
                selectedMonth={cashbookMonth}
              />
            )}

            {/* DAILY OFFICIAL (ตามภาพ 1 — รายงานเงินคงเหลือประจำวัน A4 แนวตั้งครบทุกรายการ) */}
            {tab === 'daily_official' && (
              <DailyBalanceOfficialForm
                daily={dailyRep}
                transactions={db.transactions}
                committeeNames={dailyCommittee}
                showSignatures={includeSignatures}
              />
            )}

            {/* DAILY RECEIVE-PAY-DEPOSIT (ตามภาพ 4 — A4 แนวนอน) */}
            {tab === 'daily_summary' && (
              <DailyReceivePayDepositForm
                transactions={db.transactions}
                receipts={db.receipts}
                date={dailySummaryDate}
                schoolName={db.settings.schoolName}
                financeName={db.settings.financeName}
                director={db.settings.director}
                sigFinance={db.assets.sigFinance}
                sigDirector={db.assets.sigDirector}
                showSignatures={includeSignatures}
              />
            )}

            {/* OFF-BUDGET 9 + COVER (ตามภาพ 3 เดิม และปกทะเบียนคุม A4 แนวตั้ง แยกตามประเภท) */}
            {tab === 'offbudget9' && (
              <OffBudgetLedgerOfficialForm
                sections={offBudgetSections}
                fy={fy}
                settings={db.settings}
                logo={db.assets.logo}
                includeCover={includeCover}
                coverOnly={coverOnly}
              />
            )}

            {/* PROJECT EXPENDITURE CONTROL (ตามภาพ 3 ใหม่ — ทะเบียนคุมการใช้จ่ายเงินโครงการ A4 แนวนอน) */}
            {tab === 'project_ctrl' && (
              <ProjectExpenditureControlForm
                plans={db.plans}
                requests={db.requests}
                transactions={db.transactions}
                funds={db.funds}
                fy={fy}
                schoolName={db.settings.schoolName}
                selectedPlanId={selectedProjectPlanId}
              />
            )}

            {/* SCHOOL INCOME ANNUAL REPORT (ตามภาพ 5 — รายงานรับ-จ่ายเงินรายได้สถานศึกษา A4 แนวตั้ง) */}
            {tab === 'school_income' && (
              <SchoolIncomeAnnualReportForm
                transactions={db.transactions}
                fy={fy}
                asOfDate={incomeAsOfDate}
                settings={db.settings}
                customLabels={incomeCustomLabels}
              />
            )}

            {/* REVENUE REMITTANCE */}
            {tab === 'revenue' && (
              <div className="space-y-4 text-xs leading-relaxed">
                <div className="flex justify-between">
                  <div>ที่ {revDocNo}</div>
                  <div>{db.settings.schoolName}</div>
                </div>
                <div className="text-right">วันที่ {thDate(revDate)}</div>
                <div>
                  <div><strong>เรื่อง</strong> ขอส่งเงินรายได้แผ่นดิน</div>
                  <div><strong>เรียน</strong> ผู้อำนวยการ {db.settings.affiliation}</div>
                </div>
                <p className="indent-8">
                  ด้วย {db.settings.schoolName} ขอส่งเงินรายได้แผ่นดิน ประเภท <strong>{revNote}</strong>{' '}
                  ประจำปีงบประมาณ พ.ศ. {fy} เป็นจำนวนเงินทั้งสิ้น{' '}
                  <strong className="tabular-nums">{fmt(Math.max(0, revenueSummary.remittable))}</strong> บาท{' '}
                  (<strong>{thaiBaht(Math.max(0, revenueSummary.remittable))}</strong>) เพื่อดำเนินการนำส่งคลังตามระเบียบต่อไป
                </p>
                <table className="w-full border-collapse border border-slate-400">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="border border-slate-400 px-2 py-1.5 text-left">รายการเงินรายได้แผ่นดิน</th>
                      <th className="border border-slate-400 px-2 py-1.5 text-right">จำนวนเงิน (บาท)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="border border-slate-400 px-2 py-1.5">{revNote}</td>
                      <td className="border border-slate-400 px-2 py-1.5 text-right tabular-nums font-bold">
                        {fmt(Math.max(0, revenueSummary.remittable))}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* RECEIPTS (ภาพ 2 — ทะเบียนคุมใบเสร็จรับเงิน A4 แนวนอน + รายงานรายฉบับ) */}
            {tab === 'receipts' && receiptViewMode === 'official_ledger' && (
              <ReceiptControlOfficialForm
                receiptReqs={db.receiptReqs}
                receipts={db.receipts}
                fy={fy}
                schoolName={db.settings.schoolName}
              />
            )}

            {tab === 'receipts' && receiptViewMode === 'itemized' && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-center text-base font-bold mb-2">
                    ทะเบียนคุมการใช้ใบเสร็จรับเงิน ประจำปีงบประมาณ {fy}
                  </h3>
                  <table className="w-full border-collapse border border-slate-400 text-xs">
                    <thead>
                      <tr className="bg-slate-100">
                        <th className="border border-slate-400 px-2 py-1.5">เล่มที่</th>
                        <th className="border border-slate-400 px-2 py-1.5">เลขที่</th>
                        <th className="border border-slate-400 px-2 py-1.5">วันที่</th>
                        <th className="border border-slate-400 px-2 py-1.5 text-left">รายการ</th>
                        <th className="border border-slate-400 px-2 py-1.5 text-left">ผู้ชำระ</th>
                        <th className="border border-slate-400 px-2 py-1.5 text-right">จำนวนเงิน</th>
                        <th className="border border-slate-400 px-2 py-1.5">ผู้รับเงิน</th>
                        <th className="border border-slate-400 px-2 py-1.5">สถานะ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fyReceipts.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="border border-slate-400 px-2 py-3 text-center text-slate-500">
                            ยังไม่มีรายการใบเสร็จรับเงินในปีงบประมาณนี้
                          </td>
                        </tr>
                      ) : (
                        fyReceipts.map((r) => (
                          <tr key={r.id}>
                            <td className="border border-slate-400 px-2 py-1 text-center">{r.bookNo}</td>
                            <td className="border border-slate-400 px-2 py-1 text-center">{r.receiptNo}</td>
                            <td className="border border-slate-400 px-2 py-1 text-center">{thDate(r.date)}</td>
                            <td className="border border-slate-400 px-2 py-1">{r.desc}</td>
                            <td className="border border-slate-400 px-2 py-1">{r.payer}</td>
                            <td className="border border-slate-400 px-2 py-1 text-right tabular-nums">
                              {r.cancelled ? '0.00' : fmt(r.amount)}
                            </td>
                            <td className="border border-slate-400 px-2 py-1 text-center">{r.collector}</td>
                            <td className="border border-slate-400 px-2 py-1 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <span>{r.cancelled ? 'ยกเลิก' : 'ใช้งาน'}</span>
                                {canEdit && (
                                  <button
                                    type="button"
                                    onClick={() => deleteReceiptEntry(r.id)}
                                    className="text-red-600 hover:text-red-800 print:hidden"
                                    title="ลบ"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <div>
                  <h4 className="text-sm font-bold mb-2">ประวัติการเบิกจ่ายแบบพิมพ์ใบเสร็จรับเงิน</h4>
                  <table className="w-full border-collapse border border-slate-400 text-xs">
                    <thead>
                      <tr className="bg-slate-100">
                        <th className="border border-slate-400 px-2 py-1">วันที่</th>
                        <th className="border border-slate-400 px-2 py-1 text-left">ประเภทแบบพิมพ์</th>
                        <th className="border border-slate-400 px-2 py-1 text-center">ขอเบิก</th>
                        <th className="border border-slate-400 px-2 py-1 text-center">จ่ายจริง</th>
                        <th className="border border-slate-400 px-2 py-1 text-left">ช่วงเลขที่</th>
                        <th className="border border-slate-400 px-2 py-1 text-left">ผู้เบิก / ผู้อนุมัติ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {db.receiptReqs.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="border border-slate-400 px-2 py-3 text-center text-slate-500">
                            ยังไม่มีประวัติการเบิกใบเสร็จรับเงิน
                          </td>
                        </tr>
                      ) : (
                        db.receiptReqs.map((rq) => (
                          <tr key={rq.id}>
                            <td className="border border-slate-400 px-2 py-1 text-center">{thDate(rq.date)}</td>
                            <td className="border border-slate-400 px-2 py-1">{rq.bookType}</td>
                            <td className="border border-slate-400 px-2 py-1 text-center">{rq.qtyRequested}</td>
                            <td className="border border-slate-400 px-2 py-1 text-center">{rq.qtyIssued}</td>
                            <td className="border border-slate-400 px-2 py-1">{rq.rangeNote}</td>
                            <td className="border border-slate-400 px-2 py-1">
                              {rq.requester} / {rq.approver}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Common Signatures Footer (omitted for self-contained A4 official forms) */}
            {tab !== 'cashbook' &&
              tab !== 'daily_official' &&
              tab !== 'daily_summary' &&
              tab !== 'offbudget9' &&
              tab !== 'project_ctrl' &&
              tab !== 'school_income' &&
              !(tab === 'receipts' && receiptViewMode === 'official_ledger') && (
              <div className="mt-10 grid grid-cols-2 gap-8 pt-4 text-center text-xs">
                <div>
                  {includeSignatures && db.assets.sigFinance && (
                    <img src={db.assets.sigFinance} alt="ลายเซ็นเจ้าหน้าที่การเงิน" className="mx-auto mb-1 h-12 object-contain" />
                  )}
                  <div>ลงชื่อ..............................................................</div>
                  <div className="mt-1 font-medium">({db.settings.financeName || '..............................................'})</div>
                  <div>เจ้าหน้าที่การเงินและบัญชี</div>
                </div>
                <div>
                  {includeSignatures && db.assets.sigDirector && (
                    <img src={db.assets.sigDirector} alt="ลายเซ็นผู้อำนวยการ" className="mx-auto mb-1 h-12 object-contain" />
                  )}
                  <div>ลงชื่อ..............................................................</div>
                  <div className="mt-1 font-medium">({db.settings.director || '..............................................'})</div>
                  <div>ผู้อำนวยการ {db.settings.schoolName}</div>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* PDF ARCHIVE TAB */
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <FolderArchive className="h-4 w-4 text-[#14306b]" />
            <h3 className="text-sm font-bold text-slate-900">
              คลังจัดเก็บเอกสาร PDF (ซิงก์แท็บ &quot;คลังเอกสาร_PDF&quot; ใน Google Sheets &amp; Google Drive)
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <th className="px-3 py-2 text-left">วันที่สร้าง</th>
                  <th className="px-3 py-2 text-center">ปีงบประมาณ</th>
                  <th className="px-3 py-2 text-left">ชื่อรายงาน</th>
                  <th className="px-3 py-2 text-left">ชื่อไฟล์</th>
                  <th className="px-3 py-2 text-left">การจัดเก็บ / ลิงก์ Drive</th>
                  <th className="px-3 py-2 text-left">ผู้จัดทำ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {db.pdfArchive.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                      ยังไม่มีเอกสาร PDF ที่บันทึกไว้ กด &quot;สร้าง PDF &amp; บันทึกคลัง&quot; จากหน้ารายงานใดก็ได้
                    </td>
                  </tr>
                ) : (
                  db.pdfArchive.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2">{thDate(item.createdAt)}</td>
                      <td className="px-3 py-2 text-center">{item.fy}</td>
                      <td className="px-3 py-2 font-medium text-slate-800">{item.reportTitle}</td>
                      <td className="px-3 py-2 text-slate-600">{item.fileName}</td>
                      <td className="px-3 py-2">
                        {item.driveUrl?.startsWith('http') ? (
                          <a
                            href={item.driveUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-blue-600 underline hover:text-blue-800"
                          >
                            เปิดไฟล์ใน Google Drive
                          </a>
                        ) : (
                          <span className="text-slate-500">{item.driveUrl || 'บันทึกแล้ว'}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-600">{item.createdBy}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
