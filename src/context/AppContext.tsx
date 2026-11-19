import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  ADMIN_PERMISSIONS,
  AppUser,
  BankAccount,
  BudgetDoc,
  BudgetPlan,
  BudgetRequest,
  DEFAULT_DIRECTOR_INDICATORS,
  DEFAULT_SHEET_ID,
  DEFAULT_STAFF_PERMISSIONS,
  DEFAULT_STAFF_POSITIONS_PART1,
  DirectorEvalIndicator,
  FUNDS,
  FundType,
  LOAN_PURPOSES,
  Loan,
  LoanReturn,
  Part1SchoolSurvey,
  PdfArchiveRecord,
  ProjectReport,
  RATE_LABELS,
  ReceiptControlEntry,
  ReceiptRequisition,
  SchoolAssets,
  SchoolSettings,
  SubsidyRecord,
  Transaction,
  UserPermissions,
} from '../types/finance';
import {
  classifyDocDirection,
  confirmAction,
  fyOf,
  normalizeTransactionAccounting,
  numRound,
  todayISO,
} from '../utils/formatters';
import {
  getAccessToken,
  googleSignIn,
  initAuth,
  logoutGoogle,
} from '../services/googleAuth';
import {
  appendSheetRow,
  createDriveRootFolder,
  createNewSchoolSpreadsheet,
  deleteDriveFile,
  ensureSpreadsheetStructure,
  extractDriveId,
  getDriveFolderName,
  loadAllFromGoogleSheets,
  SheetDatabaseSnapshot,
  syncSnapshotToGoogleSheets,
  uploadFileToDriveFolder,
  writeSheetRows,
} from '../services/googleSheetsDb';

const LOCAL_STORAGE_DATA_KEY = 'dms_school_finance_state_v1';
const LOCAL_STORAGE_SHEET_ID_KEY = 'dms_school_sheet_id_v1';
const LOCAL_STORAGE_SIGNATURES_KEY = 'dms_include_signatures_v1';

const COUNTED_STATUSES: Array<BudgetRequest['status']> = ['อนุมัติแล้ว', 'จ่ายเงินแล้ว'];

function createDefaultSnapshot(): SheetDatabaseSnapshot {
  const currentFy = fyOf(todayISO());
  return {
    funds: FUNDS,
    transactions: [],
    settings: {
      schoolName: 'โรงเรียนตัวอย่าง',
      affiliation: 'สำนักงานเขตพื้นที่การศึกษาประถมศึกษาระยอง เขต 2',
      district: '',
      province: '',
      schoolCode: '',
      schoolSize: 'small',
      director: '',
      financeName: '',
      driveFolderId: '',
      sentMarkers: {},
    },
    assets: {},
    allocDocs: {},
    loans: [],
    loanRets: [],
    reports: [],
    plans: [],
    requests: [],
    subsidies: [],
    banks: [],
    users: [
      {
        username: 'admin',
        name: 'ผู้ดูแลระบบ',
        role: 'admin',
        active: true,
        pw: '1939',
        permissions: ADMIN_PERMISSIONS,
      },
    ],
    receipts: [],
    receiptReqs: [],
    directorEval: DEFAULT_DIRECTOR_INDICATORS,
    pdfArchive: [],
    part1Survey: {
      fy: currentFy,
      round1SurveyDate: `${currentFy - 544}-11-10`,
      round2SurveyDate: `${currentFy - 543}-06-10`,
      hasAccountingRoom: ['มี', 'มี'],
      hasSafeBox: ['มี', 'มี'],
      hasFinanceSign: ['มี', 'มี'],
      staffCounts: DEFAULT_STAFF_POSITIONS_PART1.map((position, idx) => ({
        no: idx + 1,
        position,
        round1: 0,
        round2: 0,
      })),
    },
  };
}

export interface DashboardFundRow extends FundType {
  open: number;
  rec: number;
  pay: number;
  loan: number;
  loanRet: number;
  setl: number;
  debtor: number;
  bal: number;
}

export interface DailyReportData {
  date: string;
  rows: Array<{ id: string; name: string; group: string; cash: number; bank: number; depo: number }>;
  school: string;
  affiliation: string;
  district: string;
  province: string;
  director: string;
  financeName: string;
  logo: string;
  sigDirector: string;
  sigFinance: string;
  banks: Array<BankAccount & { bal: number }>;
  unassigned: number;
  limit: number;
  incomeCash: number;
  overLimit: boolean;
  hasMove: boolean;
  loans: Array<{ no: string; borrower: string; fund: string; out: number; due: string }>;
}

export interface AppContextValue {
  // Navigation & Fiscal Year
  fy: number;
  setFy: (fy: number) => void;
  availableYears: number[];

  // Google Workspace Auth & Sync
  googleUser: User | null;
  googleToken: string | null;
  isGoogleConnected: boolean;
  isSyncing: boolean;
  spreadsheetId: string;
  lastSyncedAt: string | null;
  connectGoogleWorkspace: () => Promise<void>;
  disconnectGoogleWorkspace: () => Promise<void>;
  pullFromGoogleSheets: (customSheetId?: string) => Promise<void>;
  pushToGoogleSheets: (confirmMsg?: string, customSnap?: SheetDatabaseSnapshot) => Promise<boolean>;
  createAndConnectNewSheet: (schoolName?: string) => Promise<string | null>;
  changeSpreadsheetId: (newId: string) => Promise<void>;

  // App RBAC Authentication
  currentUser: AppUser | null;
  loginAppUser: (username: string, password: string) => AppUser;
  logoutAppUser: () => void;
  hasPermission: (perm: keyof Omit<UserPermissions, 'menus'>) => boolean;
  canAccessMenu: (menu: UserPermissions['menus'][number]) => boolean;

  // Data Snapshot & UI Print Preferences
  db: SheetDatabaseSnapshot;
  fundName: (id: string) => string;
  includeSignatures: boolean;
  setIncludeSignatures: (on: boolean) => void;

  // Computed Views
  dashboard: {
    fy: number;
    years: number[];
    rows: DashboardFundRow[];
    months: Array<{ rec: number; pay: number }>;
  };
  getDailyReport: (date: string) => DailyReportData;
  getRegister: (fy: number, fundId: string) => {
    fund: FundType;
    fy: number;
    events: Array<{
      date: string;
      doc: string;
      desc: string;
      open?: boolean;
      amount?: number;
      loc: string;
      rec: number;
      debtor: number;
      voucher: number;
      total: number;
      delta: number;
      o: number;
    }>;
  };
  getVoucherRegister: (fy: number) => Array<{ date: string; doc: string; desc: string; amount: number; fund: string }>;
  getChecks: (fy: number) => {
    alerts: Array<{ level: 'red' | 'amber'; msg: string }>;
    monthly: Array<{ key: string; month: string; due: string; sent: string; state: 'done' | 'late' | 'open' | 'future' }>;
    annual: Array<{ key: string; label: string; due: string; sent: string; state: 'done' | 'late' | 'open' }>;
  };
  nextDocNo: (prefix: string, date: string) => string;

  // Domain Mutations (persist locally and sync to Google Sheets with confirmation when connected)
  addTransaction: (tx: {
    date: string;
    fund: string;
    doc: string;
    desc: string;
    rec: number;
    pay: number;
    loc: 'cash' | 'bank' | 'depo';
    bank: string;
    kind: 'normal' | 'open';
    refLink?: string;
  }) => Promise<void>;
  updateTransaction: (
    id: string,
    tx: {
      date: string;
      fund: string;
      doc: string;
      desc: string;
      rec: number;
      pay: number;
      loc: 'cash' | 'bank' | 'depo';
      bank: string;
      kind: 'normal' | 'open';
      refLink?: string;
    }
  ) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;

  saveSubsidy: (payload: {
    fy: number;
    level: SubsidyRecord['level'];
    small: boolean;
    rates: Record<string, number>;
    grades: Array<{ name: string; m: number; f: number; count: number; rate: number }>;
  }) => Promise<{ total: number; updated: boolean }>;
  deleteSubsidy: (id: string) => Promise<void>;

  saveBudgetDoc: (fy: number, partial: Partial<BudgetDoc>) => Promise<void>;
  createPlansFromDoc: (fy: number) => Promise<number>;
  confirmPlanCheck: (fy: number, total: number, expected: number) => Promise<void>;

  savePlan: (p: { id?: string; fy: number; fund: string; dept: string; project: string; amount: number; note: string }) => Promise<void>;
  deletePlan: (id: string) => Promise<void>;

  saveRequest: (r: { plan: string; item: string; amount: number; person: string; refLink: string }) => Promise<void>;
  updateRequest: (id: string, r: { plan: string; item: string; amount: number; person: string; refLink: string }) => Promise<void>;
  deleteRequest: (id: string) => Promise<void>;
  setRequestStatus: (id: string, status: BudgetRequest['status']) => Promise<void>;
  payRequest: (id: string, d: { date: string; doc: string; loc: 'cash' | 'bank' | 'depo'; bank: string }) => Promise<void>;
  uploadRefDocument: (file: File, targetFy?: number) => Promise<{ url: string; name: string }>;

  saveReport: (r: Omit<ProjectReport, 'id' | 'date' | 'by' | 'files'>) => Promise<ProjectReport>;
  uploadReportDocument: (reportId: string, file: File) => Promise<void>;
  deleteReportDocument: (reportId: string, fileId: string) => Promise<void>;

  createLoan: (d: {
    date: string;
    due: string;
    fund: string;
    borrower: string;
    purpose: string;
    amount: number;
    loc: 'cash' | 'bank' | 'depo';
    bank: string;
    approved: boolean;
  }) => Promise<string>;
  returnLoan: (d: {
    loanId: string;
    date: string;
    voucherNo: string;
    voucher: number;
    cashNo: string;
    cash: number;
    loc: 'cash' | 'bank' | 'depo';
    bank: string;
  }) => Promise<void>;
  deleteLoan: (id: string) => Promise<void>;
  deleteLoanReturn: (id: string) => Promise<void>;

  markReportSent: (key: string, on: boolean) => Promise<void>;

  saveSettings: (s: Partial<SchoolSettings>) => Promise<void>;
  saveAsset: (key: keyof SchoolAssets, dataUrl: string) => Promise<void>;
  saveUser: (u: AppUser) => Promise<void>;
  saveBank: (b: Omit<BankAccount, 'id'> & { id?: string }) => Promise<void>;
  saveDriveFolder: (idOrUrl: string) => Promise<string>;
  createAndLinkDriveFolder: (folderName: string) => Promise<{ id: string; name: string }>;

  // Section 4 & Director PA
  savePart1Survey: (survey: Part1SchoolSurvey) => Promise<void>;
  addReceiptEntry: (entry: Omit<ReceiptControlEntry, 'id'>) => Promise<void>;
  deleteReceiptEntry: (id: string) => Promise<void>;
  addReceiptRequisition: (req: Omit<ReceiptRequisition, 'id'>) => Promise<void>;
  saveDirectorEval: (indicators: DirectorEvalIndicator[]) => Promise<void>;
  saveThaiReportToSheet: (sheetTitle: string, rows2D: any[][]) => Promise<void>;
  archivePdfReport: (params: {
    reportKey: string;
    reportTitle: string;
    fileName: string;
    pdfBlob: Blob;
    uploadToDrive: boolean;
  }) => Promise<PdfArchiveRecord>;
}

const AppContext = createContext<AppContextValue | null>(null);

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [db, setDb] = useState<SheetDatabaseSnapshot>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_DATA_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<SheetDatabaseSnapshot>;
        const def = createDefaultSnapshot();
        return {
          ...def,
          ...parsed,
          transactions: Array.isArray(parsed.transactions)
            ? parsed.transactions.map((t) => normalizeTransactionAccounting(t))
            : def.transactions,
          funds: parsed.funds?.length ? parsed.funds : def.funds,
          users: parsed.users?.length ? parsed.users : def.users,
          directorEval: parsed.directorEval?.length ? parsed.directorEval : def.directorEval,
          settings: { ...def.settings, ...(parsed.settings || {}) },
        };
      }
    } catch {
      // ignore storage errors
    }
    return createDefaultSnapshot();
  });

  const [spreadsheetId, setSpreadsheetId] = useState<string>(() => {
    return localStorage.getItem(LOCAL_STORAGE_SHEET_ID_KEY) || DEFAULT_SHEET_ID;
  });

  const [fy, setFy] = useState<number>(() => fyOf(todayISO()));
  const [googleUser, setGoogleUser] = useState<User | null>(null);
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [includeSignatures, setIncludeSignatures] = useState<boolean>(() => {
    try {
      return localStorage.getItem(LOCAL_STORAGE_SIGNATURES_KEY) !== '0';
    } catch {
      return true;
    }
  });

  // Persist domain data locally (note: NO OAuth tokens are ever written to localStorage)
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_DATA_KEY, JSON.stringify(db));
    } catch {
      // ignore quota issues
    }
  }, [db]);

  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_SHEET_ID_KEY, spreadsheetId);
    } catch {
      // ignore
    }
  }, [spreadsheetId]);

  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_SIGNATURES_KEY, includeSignatures ? '1' : '0');
    } catch {
      // ignore
    }
  }, [includeSignatures]);

  // Listen to Firebase Auth state (clears cached token on sign-out per SKILL.md)
  useEffect(() => {
    const unsub = initAuth(
      (user, token) => {
        setGoogleUser(user);
        setGoogleToken(token);
      },
      () => {
        setGoogleUser(null);
        setGoogleToken(null);
      }
    );
    return () => unsub();
  }, []);

  const isGoogleConnected = Boolean(googleUser && googleToken);

  const updateDb = (updater: (prev: SheetDatabaseSnapshot) => SheetDatabaseSnapshot) => {
    let nextSnapshot!: SheetDatabaseSnapshot;
    setDb((prev) => {
      nextSnapshot = updater(prev);
      return nextSnapshot;
    });
    return nextSnapshot;
  };

  const pushToGoogleSheets = async (
    confirmMsg?: string,
    customSnap?: SheetDatabaseSnapshot
  ): Promise<boolean> => {
    const token = getAccessToken() || googleToken;
    if (!token) return false;
    if (confirmMsg) {
      const ok = await confirmAction('ยืนยันการบันทึกข้อมูลลง Google Sheets', confirmMsg, 'ยืนยันบันทึก');
      if (!ok) return false;
    }
    setIsSyncing(true);
    try {
      await syncSnapshotToGoogleSheets(spreadsheetId, token, customSnap || db);
      setLastSyncedAt(new Date().toLocaleTimeString('th-TH'));
      return true;
    } finally {
      setIsSyncing(false);
    }
  };

  const pullFromGoogleSheets = async (customSheetId?: string) => {
    const token = getAccessToken() || googleToken;
    if (!token) throw new Error('กรุณาเชื่อมต่อบัญชี Google ก่อนโหลดข้อมูลจาก Google Sheets');
    const targetId = (customSheetId || spreadsheetId).trim();
    setIsSyncing(true);
    try {
      const remote = await loadAllFromGoogleSheets(targetId, token);
      setDb((prev) => ({
        ...remote,
        directorEval: remote.directorEval.length ? remote.directorEval : prev.directorEval,
        part1Survey: remote.part1Survey || prev.part1Survey,
      }));
      if (customSheetId) setSpreadsheetId(targetId);
      setLastSyncedAt(new Date().toLocaleTimeString('th-TH'));
    } finally {
      setIsSyncing(false);
    }
  };

  const connectGoogleWorkspace = async () => {
    const { user, accessToken } = await googleSignIn();
    setGoogleUser(user);
    setGoogleToken(accessToken);
  };

  const disconnectGoogleWorkspace = async () => {
    await logoutGoogle();
    setGoogleUser(null);
    setGoogleToken(null);
  };

  const createAndConnectNewSheet = async (schoolName?: string): Promise<string | null> => {
    const token = getAccessToken() || googleToken;
    if (!token) throw new Error('กรุณาเข้าสู่ระบบ Google Workspace ก่อนสร้างไฟล์ Google Sheet');
    const ok = await confirmAction(
      'สร้าง Google Sheet ใหม่สำหรับโรงเรียน',
      `ระบบจะสร้างไฟล์ Google Sheet ใหม่ชื่อ "ระบบบริหารการเงินสถานศึกษา - ${schoolName || db.settings.schoolName}" พร้อมแท็บภาษาไทยและโครงสร้างฐานข้อมูลทั้งหมดใน Google Drive ของคุณ`,
      'สร้าง Google Sheet'
    );
    if (!ok) return null;

    setIsSyncing(true);
    try {
      const created = await createNewSchoolSpreadsheet(schoolName || db.settings.schoolName, token);
      setSpreadsheetId(created.spreadsheetId);
      await syncSnapshotToGoogleSheets(created.spreadsheetId, token, db);
      setLastSyncedAt(new Date().toLocaleTimeString('th-TH'));
      return created.spreadsheetId;
    } finally {
      setIsSyncing(false);
    }
  };

  const changeSpreadsheetId = async (newId: string) => {
    const clean = newId.trim();
    if (!clean) throw new Error('กรุณาระบุ Spreadsheet ID');
    const token = getAccessToken() || googleToken;
    if (token) {
      const ok = await confirmAction(
        'เปลี่ยนรหัส Google Sheet และเชื่อมต่อ',
        `ระบบจะเชื่อมต่อกับชีต ${clean} และสร้างแท็บที่จำเป็นให้อัตโนมัติ`,
        'เชื่อมต่อชีต'
      );
      if (!ok) return;
      await pullFromGoogleSheets(clean);
    } else {
      setSpreadsheetId(clean);
    }
  };

  /* ---------- RBAC & App Login ---------- */
  const loginAppUser = (username: string, password: string): AppUser => {
    const un = username.trim().toLowerCase();
    const found = db.users.find((u) => u.username.toLowerCase() === un && u.active);
    if (!found || String(found.pw) !== String(password)) {
      throw new Error('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง (ค่าเริ่มต้น admin / 1939)');
    }
    setCurrentUser(found);
    return found;
  };

  const logoutAppUser = () => setCurrentUser(null);

  const hasPermission = (perm: keyof Omit<UserPermissions, 'menus'>): boolean => {
    if (!currentUser) return false;
    if (currentUser.role === 'admin') return true;
    return Boolean(currentUser.permissions?.[perm]);
  };

  const canAccessMenu = (menu: UserPermissions['menus'][number]): boolean => {
    if (menu === 'dash') return true;
    if (!currentUser) return false;
    if (currentUser.role === 'admin') return true;
    return Boolean(currentUser.permissions?.menus?.includes(menu));
  };

  const fundName = (id: string) => db.funds.find((f) => f.id === id)?.name || id;

  const availableYears = useMemo(() => {
    const set = new Set<number>([fyOf(todayISO()), fy]);
    db.transactions.forEach((t) => set.add(t.fy));
    db.plans.forEach((p) => set.add(p.fy));
    db.subsidies.forEach((s) => set.add(s.fy));
    return Array.from(set).sort((a, b) => b - a);
  }, [db.transactions, db.plans, db.subsidies, fy]);

  /* ---------- Dashboard Calculation (Exact parity with Code.gs) ---------- */
  const dashboard = useMemo(() => {
    const rows: DashboardFundRow[] = db.funds.map((f) => ({
      ...f,
      open: 0,
      rec: 0,
      pay: 0,
      loan: 0,
      loanRet: 0,
      setl: 0,
      debtor: 0,
      bal: 0,
    }));
    const map: Record<string, DashboardFundRow> = {};
    rows.forEach((r) => {
      map[r.id] = r;
    });

    const months = Array.from({ length: 12 }, () => ({ rec: 0, pay: 0 }));

    db.transactions
      .filter((t) => t.fy === fy && map[t.fund])
      .map((t) => normalizeTransactionAccounting(t))
      .forEach((t) => {
        const r = map[t.fund];
        if (t.kind === 'open') {
          r.open += t.rec - t.pay;
          return;
        }
        if (t.kind === 'loan') {
          r.loan += t.pay;
          return;
        }
        if (t.kind === 'loanret') {
          r.loanRet += t.rec;
          return;
        }
        r.rec += t.rec;
        r.pay += t.pay;
        const mIdx = (Number(t.date.slice(5, 7)) + 2) % 12;
        if (months[mIdx]) {
          months[mIdx].rec += t.rec;
          months[mIdx].pay += t.pay;
        }
      });

    db.loanRets
      .filter((x) => x.fy === fy && map[x.fund] && x.voucher > 0)
      .forEach((x) => {
        map[x.fund].pay += x.voucher;
        map[x.fund].setl += x.voucher;
        const mIdx = (Number(x.date.slice(5, 7)) + 2) % 12;
        if (months[mIdx]) months[mIdx].pay += x.voucher;
      });

    rows.forEach((r) => {
      r.debtor = numRound(r.loan - r.loanRet - r.setl);
      r.bal = numRound(r.open + r.rec - r.pay - r.debtor);
    });

    return { fy, years: availableYears, rows, months };
  }, [db.funds, db.transactions, db.loanRets, fy, availableYears]);

  const loansFull = (upTo?: string) => {
    const rets = db.loanRets.filter((r) => !upTo || r.date <= upTo);
    const refDate = upTo || todayISO();
    return db.loans
      .filter((l) => !upTo || l.date <= upTo)
      .map((l) => {
        const rs = rets.filter((r) => r.loan === l.id);
        const back = rs.reduce((s, r) => s + r.voucher + r.cash, 0);
        const out = numRound(l.amount - back);
        return {
          ...l,
          rets: rs,
          back: numRound(back),
          out,
          overdue: out > 0.004 && l.due < refDate,
        };
      });
  };

  const getDailyReport = (date: string): DailyReportData => {
    const rows = db.funds.map((f) => ({
      id: f.id,
      name: f.name,
      group: f.group,
      cash: 0,
      bank: 0,
      depo: 0,
    }));
    const map: Record<string, (typeof rows)[number]> = {};
    rows.forEach((r) => (map[r.id] = r));

    const normTxs = db.transactions
      .filter((t) => t.date <= date)
      .map((t) => normalizeTransactionAccounting(t));

    normTxs
      .filter((t) => map[t.fund])
      .forEach((t) => {
        if (map[t.fund][t.loc] !== undefined) {
          map[t.fund][t.loc] = numRound(map[t.fund][t.loc] + t.rec - t.pay);
        }
      });

    const limit = db.settings.schoolSize === 'large' ? 30000 : 20000;
    const incomeCash = map['F10'] ? map['F10'].cash : 0;
    const btx = normTxs.filter((t) => t.loc === 'bank');
    const sum = (arr: Transaction[]) => arr.reduce((x, t) => x + t.rec - t.pay, 0);

    const banks = db.banks
      .filter((b) => b.active || btx.some((t) => t.bank === b.id))
      .map((b) => ({ ...b, bal: numRound(sum(btx.filter((t) => t.bank === b.id))) }));
    const unassigned = numRound(sum(btx.filter((t) => !banks.some((b) => b.id === t.bank))));

    return {
      date,
      rows,
      school: db.settings.schoolName,
      affiliation: db.settings.affiliation,
      district: db.settings.district || '',
      province: db.settings.province || '',
      director: db.settings.director,
      financeName: db.settings.financeName,
      logo: db.assets.logo || '',
      sigDirector: db.assets.sigDirector || '',
      sigFinance: db.assets.sigFinance || '',
      banks,
      unassigned,
      limit,
      incomeCash,
      overLimit: incomeCash > limit,
      hasMove: db.transactions.some((t) => t.date === date && t.kind !== 'open'),
      loans: loansFull(date)
        .filter((l) => l.out > 0.004)
        .map((l) => ({ no: l.no, borrower: l.borrower, fund: l.fund, out: l.out, due: l.due })),
    };
  };

  const nextDocNo = (prefix: string, date: string): string => {
    const targetFy = fyOf(date || todayISO());
    const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`^\\s*${escapedPrefix}\\s*0*(\\d+)\\s*/\\s*${targetFy}\\s*$`);
    const docs = [
      ...db.transactions.map((t) => t.doc),
      ...db.loans.map((l) => l.no),
      ...db.loanRets.flatMap((r) => [r.voucherNo, r.cashNo]),
    ];
    let mx = 0;
    docs.forEach((d) => {
      const m = re.exec(String(d || ''));
      if (m) mx = Math.max(mx, Number(m[1]));
    });
    return `${prefix} ${mx + 1}/${targetFy}`;
  };

  const getRegister = (targetFy: number, fundId: string) => {
    const fund = db.funds.find((f) => f.id === fundId) || db.funds[0];
    const ev: Array<any> = [];
    db.transactions
      .filter((t) => t.fy === targetFy && t.fund === fundId && t.kind !== 'loanret')
      .map((t) => normalizeTransactionAccounting(t))
      .forEach((t, i) => {
        if (t.kind === 'open') {
          ev.push({
            date: t.date,
            doc: t.doc,
            desc: t.desc || 'ยอดยกมา',
            open: true,
            amount: t.rec - t.pay,
            loc: t.loc,
            rec: 0,
            debtor: 0,
            voucher: 0,
            total: 0,
            delta: t.rec - t.pay,
            o: i,
          });
        } else if (t.kind === 'loan') {
          ev.push({
            date: t.date,
            doc: t.doc,
            desc: t.desc,
            rec: 0,
            debtor: t.pay,
            voucher: 0,
            total: t.pay,
            loc: t.loc,
            delta: -t.pay,
            o: i,
          });
        } else {
          ev.push({
            date: t.date,
            doc: t.doc,
            desc: t.desc,
            rec: t.rec,
            debtor: 0,
            voucher: t.pay,
            total: t.pay,
            loc: t.loc,
            delta: t.rec - t.pay,
            o: i,
          });
        }
      });

    db.loanRets
      .filter((r) => r.fy === targetFy && r.fund === fundId)
      .forEach((r, i) => {
        const l = db.loans.find((x) => x.id === r.loan);
        ev.push({
          date: r.date,
          doc: [r.voucherNo, r.cashNo].filter(Boolean).join(' / '),
          desc: `รับส่งใช้เงินยืม ${l?.no || ''}${r.voucher ? ' เป็นใบสำคัญ' : ''}${r.cash ? ' เป็นเงิน' : ''}`,
          rec: 0,
          debtor: -(r.voucher + r.cash),
          voucher: r.voucher,
          total: -r.cash,
          loc: r.loc || 'bank',
          delta: r.cash,
          o: 100000 + i,
        });
      });

    ev.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.o - b.o));
    return { fund, fy: targetFy, events: ev };
  };

  const getVoucherRegister = (targetFy: number) => {
    const rows: Array<{ date: string; doc: string; desc: string; amount: number; fund: string }> = [];
    db.transactions
      .filter((t) => t.fy === targetFy)
      .map((t) => normalizeTransactionAccounting(t))
      .filter((t) => t.kind === 'normal' && t.pay > 0)
      .forEach((t) => {
        rows.push({
          date: t.date,
          doc: t.doc,
          desc: t.desc,
          amount: t.pay,
          fund: fundName(t.fund),
        });
      });
    db.loanRets
      .filter((r) => r.fy === targetFy && r.voucher > 0)
      .forEach((r) => {
        const l = db.loans.find((x) => x.id === r.loan);
        rows.push({
          date: r.date,
          doc: r.voucherNo,
          desc: `ส่งใช้เงินยืม ${l?.no || ''} – ${l?.borrower || ''}`,
          amount: r.voucher,
          fund: fundName(r.fund),
        });
      });
    rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    return rows;
  };

  const getChecks = (targetFy: number) => {
    const today = todayISO();
    const alerts: Array<{ level: 'red' | 'amber'; msg: string }> = [];
    const sent = db.settings.sentMarkers || {};

    loansFull()
      .filter((l) => l.out > 0.004)
      .forEach((l) => {
        alerts.push({
          level: l.overdue ? 'red' : 'amber',
          msg: `${l.overdue ? 'เงินยืมเกินกำหนดส่งใช้ ' : 'เงินยืมค้างส่งใช้ '}${l.no} ผู้ยืม ${l.borrower} ค้าง ${l.out.toFixed(2)} บาท กำหนดส่ง ${l.due}${l.overdue ? ' → ติดตามทวงถาม' : ''}`,
        });
      });

    const rep = getDailyReport(today);
    if (rep.overLimit) {
      alerts.push({
        level: 'red',
        msg: `เงินสดเงินรายได้สถานศึกษาคงเหลือ ${rep.incomeCash.toFixed(2)} บาท เกินวงเงินเก็บรักษา ${rep.limit} บาท/วัน ให้นำฝากธนาคาร`,
      });
    }

    const f11 = rep.rows.find((r) => r.id === 'F11');
    if (f11 && f11.cash + f11.bank > 0.004) {
      alerts.push({
        level: 'amber',
        msg: `มีเงินรายได้แผ่นดิน (เช่น ดอกเบี้ย) คงเหลือ ${(f11.cash + f11.bank).toFixed(2)} บาท ต้องนำส่ง สพป. (อย่างน้อยเดือนละ 1 ครั้ง)`,
      });
    }

    rep.rows
      .filter((r) => r.cash < -0.004 || r.bank < -0.004 || r.depo < -0.004)
      .forEach((r) => {
        alerts.push({
          level: 'red',
          msg: `ยอดคงเหลือติดลบในประเภท ${r.name} ตรวจสอบการบันทึก`,
        });
      });

    const ce = targetFy - 543;
    const monthly = Array.from({ length: 12 }, (_, k) => {
      const m = ((9 + k) % 12) + 1;
      const y = m >= 10 ? ce - 1 : ce;
      const ny = m === 12 ? y + 1 : y;
      const nm = m === 12 ? 1 : m + 1;
      const key = `${targetFy}_${m < 10 ? '0' : ''}${m}`;
      const due = `${ny}-${nm < 10 ? '0' : ''}${nm}-15`;
      const monthStr = `${y}-${m < 10 ? '0' : ''}${m}`;
      const state: 'done' | 'late' | 'open' | 'future' = sent[key]
        ? 'done'
        : today > due
        ? 'late'
        : today >= `${monthStr}-01`
        ? 'open'
        : 'future';
      return { key, month: monthStr, due, sent: sent[key] || '', state };
    });

    const annual = [
      { key: `${targetFy}_REC`, label: 'รายงานการใช้ใบเสร็จรับเงิน ส่ง สพป.', due: `${ce}-10-15` },
      {
        key: `${targetFy}_INC`,
        label: 'รายงานการรับ-จ่ายเงินรายได้สถานศึกษาประจำปี ส่ง สพป. (ภายใน 30 วันนับแต่สิ้นปีงบประมาณ)',
        due: `${ce}-10-30`,
      },
      {
        key: `${targetFy}_SEM1`,
        label: 'รายงานเงินรายได้สถานศึกษาต่อคณะกรรมการสถานศึกษา ภาคเรียนที่ 1',
        due: `${ce - 1}-11-15`,
      },
      {
        key: `${targetFy}_SEM2`,
        label: 'รายงานเงินรายได้สถานศึกษาต่อคณะกรรมการสถานศึกษา ภาคเรียนที่ 2',
        due: `${ce}-04-30`,
      },
    ].map((a) => ({
      ...a,
      sent: sent[a.key] || '',
      state: (sent[a.key] ? 'done' : today > a.due ? 'late' : 'open') as 'done' | 'late' | 'open',
    }));

    [...monthly, ...annual]
      .filter((x) => x.state === 'late')
      .forEach((x) => {
        alerts.push({
          level: 'red',
          msg: `เลยกำหนดส่งรายงาน: ${'label' in x ? x.label : `รายงานเงินคงเหลือประจำวัน เดือน ${x.month}`} (กำหนด ${x.due})`,
        });
      });

    return { alerts, monthly, annual };
  };

  /* ---------- Helpers for sync with confirmation ---------- */
  const persistChange = async (
    nextSnap: SheetDatabaseSnapshot,
    confirmTitle: string,
    confirmDetail: string
  ) => {
    const token = getAccessToken() || googleToken;
    if (token) {
      const ok = await confirmAction(confirmTitle, confirmDetail, 'ยืนยันและซิงก์ Google Sheets');
      if (!ok) throw new Error('__CANCELLED__');
      setDb(nextSnap);
      setIsSyncing(true);
      try {
        await syncSnapshotToGoogleSheets(spreadsheetId, token, nextSnap);
        setLastSyncedAt(new Date().toLocaleTimeString('th-TH'));
      } finally {
        setIsSyncing(false);
      }
    } else {
      setDb(nextSnap);
    }
  };

  const uid = (prefix = '') => prefix + Math.random().toString(36).slice(2, 8);

  /* ---------- Mutations ---------- */
  const addTransaction: AppContextValue['addTransaction'] = async (d) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) throw new Error('วันที่ไม่ถูกต้อง');
    let rec = numRound(d.rec);
    let pay = numRound(d.pay);
    if (rec < 0 || pay < 0 || (rec > 0) === (pay > 0)) {
      throw new Error('กรอกจำนวนเงิน "รับ" หรือ "จ่าย" อย่างใดอย่างหนึ่ง');
    }
    if (!d.doc.trim() || !d.desc.trim()) throw new Error('ต้องระบุที่เอกสารและรายการ');

    const docDir = classifyDocDirection(d.doc);
    if (d.kind !== 'open' && docDir === 'pay' && rec > 0 && pay === 0) {
      // เอกสารด้านจ่าย (บคล = บันทึกการจ่าย, บค, บจ, บก) ต้องบันทึกลงช่องรายจ่ายเสมอ
      pay = rec;
      rec = 0;
    } else if (d.kind !== 'open' && docDir === 'rec' && pay > 0 && rec === 0) {
      throw new Error('เอกสาร บร (ใบเสร็จรับเงิน) เป็นรายการรับ กรุณากรอกยอดในช่อง "รับ" หรือเปลี่ยนเลขที่เอกสารเป็น บจ/บค/บคล/บก');
    }

    if (pay > 0 && d.kind !== 'open') {
      const bal = db.transactions
        .filter((t) => t.fund === d.fund)
        .map((t) => normalizeTransactionAccounting(t))
        .reduce((s, t) => s + t.rec - t.pay, 0);
      if (pay > bal + 0.001) {
        throw new Error(`ยอดจ่ายเกินเงินคงเหลือของประเภทนี้ (คงเหลือ ${bal.toFixed(2)} บาท)`);
      }
    }
    const tx: Transaction = {
      id: uid('T'),
      date: d.date,
      fy: fyOf(d.date),
      fund: d.fund,
      doc: d.doc.trim(),
      desc: d.desc.trim(),
      rec,
      pay,
      loc: d.loc,
      kind: d.kind,
      by: currentUser?.username || 'admin',
      bank: d.loc === 'bank' ? d.bank : '',
      refLink: d.refLink?.trim() || '',
    };
    const nextSnap: SheetDatabaseSnapshot = {
      ...db,
      transactions: [...db.transactions, tx],
    };
    await persistChange(
      nextSnap,
      'บันทึกรายการรับ-จ่าย',
      `ต้องการบันทึกรายการ "${tx.desc}" (${rec > 0 ? 'รายรับ' : 'รายจ่าย'} ${rec > 0 ? rec.toLocaleString() : pay.toLocaleString()} บาท) ลงฐานข้อมูลและ Google Sheets หรือไม่?`
    );
  };

  const updateTransaction: AppContextValue['updateTransaction'] = async (id, d) => {
    const target = db.transactions.find((t) => t.id === id);
    if (!target) throw new Error('ไม่พบรายการที่ต้องการแก้ไข');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) throw new Error('วันที่ไม่ถูกต้อง');
    let rec = numRound(d.rec);
    let pay = numRound(d.pay);
    if (rec < 0 || pay < 0 || (rec > 0) === (pay > 0)) {
      throw new Error('กรอกจำนวนเงิน "รับ" หรือ "จ่าย" อย่างใดอย่างหนึ่ง');
    }
    if (!d.doc.trim() || !d.desc.trim()) throw new Error('ต้องระบุที่เอกสารและรายการ');

    const effectiveKind =
      target.kind === 'loan' || target.kind === 'loanret' ? target.kind : d.kind;
    const docDir = classifyDocDirection(d.doc);
    if (effectiveKind !== 'open' && effectiveKind !== 'loanret' && docDir === 'pay' && rec > 0 && pay === 0) {
      pay = rec;
      rec = 0;
    } else if (effectiveKind !== 'open' && effectiveKind !== 'loan' && docDir === 'rec' && pay > 0 && rec === 0) {
      throw new Error('เอกสาร บร (ใบเสร็จรับเงิน) เป็นรายการรับ กรุณากรอกยอดในช่อง "รับ" หรือเปลี่ยนเลขที่เอกสารเป็น บจ/บค/บคล/บก');
    }

    if (pay > 0 && effectiveKind !== 'open') {
      const bal = db.transactions
        .filter((t) => t.fund === d.fund && t.id !== id)
        .map((t) => normalizeTransactionAccounting(t))
        .reduce((s, t) => s + t.rec - t.pay, 0);
      if (pay > bal + 0.001) {
        throw new Error(`ยอดจ่ายเกินเงินคงเหลือของประเภทนี้ (คงเหลือหลังหักรายการเดิม ${bal.toFixed(2)} บาท)`);
      }
    }

    const updatedTx: Transaction = {
      ...target,
      date: d.date,
      fy: fyOf(d.date),
      fund: d.fund,
      doc: d.doc.trim(),
      desc: d.desc.trim(),
      rec,
      pay,
      loc: d.loc,
      kind: effectiveKind,
      bank: d.loc === 'bank' ? d.bank : '',
      refLink: d.refLink !== undefined ? d.refLink.trim() : target.refLink || '',
    };

    const nextSnap: SheetDatabaseSnapshot = {
      ...db,
      transactions: db.transactions.map((t) => (t.id === id ? updatedTx : t)),
      requests: db.requests.map((r) =>
        r.txId === id
          ? {
              ...r,
              fund: updatedTx.fund,
              amount: updatedTx.pay > 0 ? updatedTx.pay : r.amount,
              refLink: updatedTx.refLink || r.refLink,
            }
          : r
      ),
    };
    await persistChange(
      nextSnap,
      'บันทึกการแก้ไขรายการรับ-จ่าย',
      `ต้องการบันทึกการแก้ไขรายการ "${updatedTx.doc} — ${updatedTx.desc}" (${rec > 0 ? 'รายรับ' : 'รายจ่าย'} ${rec > 0 ? rec.toLocaleString() : pay.toLocaleString()} บาท) หรือไม่?`
    );
  };

  const deleteTransaction: AppContextValue['deleteTransaction'] = async (id) => {
    if (db.loans.some((l) => l.txId === id) || db.loanRets.some((r) => r.txId === id)) {
      throw new Error('รายการนี้เกิดจากเงินยืม ให้ลบที่เมนู เงินยืม');
    }
    const target = db.transactions.find((t) => t.id === id);
    if (!target) throw new Error('ไม่พบรายการ');
    const ok = await confirmAction(
      'ยืนยันการลบรายการ',
      `ลบรายการ "${target.doc} — ${target.desc}" ออกจากทะเบียนและ Google Sheets?`,
      'ลบรายการ',
      true
    );
    if (!ok) return;

    const nextSnap: SheetDatabaseSnapshot = {
      ...db,
      transactions: db.transactions.filter((t) => t.id !== id),
      requests: db.requests.map((r) =>
        r.txId === id ? { ...r, status: 'อนุมัติแล้ว', txId: '' } : r
      ),
    };
    setDb(nextSnap);
    const token = getAccessToken() || googleToken;
    if (token) {
      setIsSyncing(true);
      try {
        await syncSnapshotToGoogleSheets(spreadsheetId, token, nextSnap);
        setLastSyncedAt(new Date().toLocaleTimeString('th-TH'));
      } finally {
        setIsSyncing(false);
      }
    }
  };

  const rebuildCalcsInDoc = (
    targetFy: number,
    subs: SubsidyRecord[],
    prevDocs: Record<number, BudgetDoc>
  ): Record<number, BudgetDoc> => {
    const doc = { ...(prevDocs[targetFy] || {}) };
    const calcs: NonNullable<BudgetDoc['calcs']> = {};
    subs
      .filter((s) => s.fy === targetFy)
      .forEach((s) => {
        calcs[s.level] = {
          count: s.count,
          small: s.small,
          teaching: s.amounts.teaching || 0,
          book: s.amounts.book || 0,
          tools: s.amounts.tools || 0,
          uniform: s.amounts.uniform || 0,
          activity: s.amounts.activity || 0,
          smallBonus: s.amounts.small || 0,
          total: s.total,
          grades: s.grades,
        };
      });
    doc.calcs = calcs;
    return { ...prevDocs, [targetFy]: doc };
  };

  const saveSubsidy: AppContextValue['saveSubsidy'] = async (d) => {
    const grades = d.grades
      .map((g) => ({
        name: g.name,
        m: Math.floor(Number(g.m)) || 0,
        f: Math.floor(Number(g.f)) || 0,
        count: Math.floor(Number(g.m) + Number(g.f)) || 0,
        rate: Number(g.rate) || 0,
      }))
      .filter((g) => g.count > 0);
    const count = grades.reduce((s, g) => s + g.count, 0);
    if (count < 1) throw new Error('กรอกจำนวนนักเรียนอย่างน้อย 1 ชั้น');

    const rates: Record<string, number> = {};
    const A: Record<string, number> = {};
    Object.keys(RATE_LABELS).forEach((k) => {
      rates[k] = Number(d.rates[k]) || 0;
      A[k] =
        k === 'small' && !d.small
          ? 0
          : numRound(
              k === 'book' && grades.length
                ? grades.reduce((s, g) => s + g.count * g.rate, 0)
                : rates[k] * count
            );
    });
    const total = numRound(Object.values(A).reduce((s, v) => s + v, 0));
    const existing = db.subsidies.find((s) => s.fy === d.fy && s.level === d.level);
    const record: SubsidyRecord = {
      id: existing ? existing.id : uid('S'),
      fy: d.fy,
      level: d.level,
      count,
      small: d.small,
      total,
      by: currentUser?.username || 'admin',
      date: todayISO(),
      grades,
      rates,
      amounts: A,
    };

    const nextSubs = existing
      ? db.subsidies.map((s) => (s.id === existing.id ? record : s))
      : [...db.subsidies, record];
    const nextDocs = rebuildCalcsInDoc(d.fy, nextSubs, db.allocDocs);
    const nextSnap = { ...db, subsidies: nextSubs, allocDocs: nextDocs };

    await persistChange(
      nextSnap,
      'บันทึกผลคำนวณเงินอุดหนุนรายหัว',
      `บันทึกยอดรวม ${total.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท (${count} คน)`
    );
    return { total, updated: Boolean(existing) };
  };

  const deleteSubsidy: AppContextValue['deleteSubsidy'] = async (id) => {
    const target = db.subsidies.find((s) => s.id === id);
    if (!target) return;
    const ok = await confirmAction(
      'ลบผลคำนวณเงินอุดหนุน',
      'ยอดรวมในการจัดสรรและสรุปรวมจะเปลี่ยนตาม ยืนยันการลบหรือไม่?',
      'ลบข้อมูล',
      true
    );
    if (!ok) return;
    const nextSubs = db.subsidies.filter((s) => s.id !== id);
    const nextDocs = rebuildCalcsInDoc(target.fy, nextSubs, db.allocDocs);
    const nextSnap = { ...db, subsidies: nextSubs, allocDocs: nextDocs };
    setDb(nextSnap);
    const token = getAccessToken() || googleToken;
    if (token) {
      setIsSyncing(true);
      try {
        await syncSnapshotToGoogleSheets(spreadsheetId, token, nextSnap);
        setLastSyncedAt(new Date().toLocaleTimeString('th-TH'));
      } finally {
        setIsSyncing(false);
      }
    }
  };

  const saveBudgetDoc: AppContextValue['saveBudgetDoc'] = async (targetFy, partial) => {
    const prevDoc = db.allocDocs[targetFy] || {};
    const nextDoc: BudgetDoc = { ...prevDoc, ...partial };
    const nextSnap: SheetDatabaseSnapshot = {
      ...db,
      allocDocs: { ...db.allocDocs, [targetFy]: nextDoc },
    };
    await persistChange(
      nextSnap,
      'บันทึกการจัดสรรงบประมาณ',
      `ยืนยันบันทึกเอกสารจัดสรรงบประมาณปีงบประมาณ ${targetFy} ลง Google Sheets?`
    );
  };

  const createPlansFromDoc: AppContextValue['createPlansFromDoc'] = async (targetFy) => {
    const doc = db.allocDocs[targetFy] || {};
    const c = Object.values(doc.calcs || {});
    if (!c.length) throw new Error('ยังไม่มีผลคำนวณเงินอุดหนุน กรุณาคำนวณและบันทึกก่อน');

    const sum = (k: 'teaching' | 'smallBonus' | 'book' | 'tools' | 'uniform') =>
      c.reduce((s, x) => s + (Number(x[k]) || 0), 0);
    const base = numRound(sum('teaching') + sum('smallBonus'));
    const pct = doc.pct || { acad: 50, gen: 30, res: 20 };
    const g = doc.gen || { bud: 0, hr: 0, gen: 0, stu: 0 };
    const hf = doc.headFund || 'F03';

    const L: Array<[string, string, string, number]> = [
      [hf, 'กลุ่มบริหารวิชาการ', 'งบกลุ่มบริหารวิชาการ', (base * (pct.acad || 0)) / 100],
      [hf, 'กลุ่มบริหารงบประมาณ', 'งบกลุ่มบริหารงบประมาณ', g.bud || 0],
      [hf, 'กลุ่มบริหารงานบุคคล', 'งบกลุ่มบริหารงานบุคคล', g.hr || 0],
      [hf, 'กลุ่มบริหารทั่วไป', 'งบกลุ่มบริหารทั่วไป', g.gen || 0],
      [hf, 'กลุ่มบริหารกิจการนักเรียน', 'งบกลุ่มบริหารกิจการนักเรียน', g.stu || 0],
      [hf, 'ส่วนกลาง', 'งบสำรอง/ค่าไฟฟ้า', (base * (pct.res || 0)) / 100],
      ['F07', 'ส่วนกลาง', 'ค่าหนังสือเรียน', sum('book')],
      ['F06', 'ส่วนกลาง', 'ค่าอุปกรณ์การเรียน', sum('tools')],
      ['F05', 'ส่วนกลาง', 'ค่าเครื่องแบบนักเรียน', sum('uniform')],
    ];
    (doc.act || []).forEach((a) =>
      L.push(['F08', 'กลุ่มบริหารกิจการนักเรียน', `กิจกรรมพัฒนาผู้เรียน – ${a[0]}`, a[1]])
    );
    const lu = doc.lunch || { n: 0, rate: 27, days: 200 };
    L.push(['F01', 'ส่วนกลาง', 'โครงการอาหารกลางวัน', (lu.n || 0) * (lu.rate || 0) * (lu.days || 0)]);
    L.push(['F04', 'ส่วนกลาง', 'เงินอุดหนุนปัจจัยพื้นฐานนักเรียนยากจน', doc.poor || 0]);

    const oldAllocPlans = db.plans.filter(
      (p) => p.fy === targetFy && p.note.startsWith('[จัดสรร]')
    );
    if (oldAllocPlans.some((p) => db.requests.some((q) => q.plan === p.id))) {
      throw new Error('มีคำขอใช้เงินในโครงการที่สร้างจากการจัดสรรแล้ว สร้างใหม่ไม่ได้ ให้แก้ไขที่หน้าโครงการ');
    }

    const generated: BudgetPlan[] = L.filter((x) => numRound(x[3]) > 0).map((x) => ({
      id: uid('P'),
      fy: targetFy,
      fund: x[0],
      dept: x[1],
      project: x[2],
      amount: numRound(x[3]),
      note: '[จัดสรร]',
    }));

    const remainingPlans = db.plans.filter(
      (p) => !(p.fy === targetFy && p.note.startsWith('[จัดสรร]'))
    );
    const nextSnap: SheetDatabaseSnapshot = {
      ...db,
      plans: [...remainingPlans, ...generated],
    };

    await persistChange(
      nextSnap,
      'สร้างโครงการตามแผนจากการจัดสรร',
      `จะสร้างโครงการตามแผนจำนวน ${generated.length} รายการ (แทนที่รายการ [จัดสรร] เดิมที่ยังไม่มีคำขอใช้เงิน)`
    );
    return generated.length;
  };

  const confirmPlanCheck: AppContextValue['confirmPlanCheck'] = async (targetFy, total, expected) => {
    const prevDoc = db.allocDocs[targetFy] || {};
    const nextDoc: BudgetDoc = {
      ...prevDoc,
      planConfirm: {
        by: currentUser?.username || 'admin',
        date: todayISO(),
        total: numRound(total),
        expected: numRound(expected),
      },
    };
    const nextSnap = {
      ...db,
      allocDocs: { ...db.allocDocs, [targetFy]: nextDoc },
    };
    await persistChange(
      nextSnap,
      'ยืนยันความตรงกันของงบประมาณ',
      'ยืนยันว่างบจัดสรรตรงกับโครงการตามแผนทั้งหมดแล้ว?'
    );
  };

  const savePlan: AppContextValue['savePlan'] = async (p) => {
    if (!p.project.trim()) throw new Error('ต้องระบุชื่อโครงการ');
    if (!(numRound(p.amount) > 0)) throw new Error('งบประมาณต้องมากกว่า 0');
    const amt = numRound(p.amount);

    if (p.id) {
      const used = db.requests
        .filter((r) => r.plan === p.id && COUNTED_STATUSES.includes(r.status))
        .reduce((s, r) => s + r.amount, 0);
      if (amt < used) {
        throw new Error(`ลดงบต่ำกว่ายอดที่อนุมัติ/จ่ายไปแล้วไม่ได้ (${used.toFixed(2)})`);
      }
    }

    const plan: BudgetPlan = {
      id: p.id || uid('P'),
      fy: p.fy,
      fund: p.fund,
      dept: p.dept || 'ส่วนกลาง',
      project: p.project.trim(),
      amount: amt,
      note: p.note || '',
    };

    const nextPlans = p.id
      ? db.plans.map((x) => (x.id === p.id ? plan : x))
      : [...db.plans, plan];
    const nextSnap = { ...db, plans: nextPlans };

    await persistChange(
      nextSnap,
      p.id ? 'แก้ไขโครงการตามแผน' : 'เพิ่มโครงการตามแผน',
      `บันทึกโครงการ "${plan.project}" งบประมาณ ${amt.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท?`
    );
  };

  const deletePlan: AppContextValue['deletePlan'] = async (id) => {
    if (db.requests.some((r) => r.plan === id)) {
      throw new Error('มีคำขอใช้เงินในโครงการนี้แล้ว ลบไม่ได้');
    }
    const target = db.plans.find((p) => p.id === id);
    if (!target) return;
    const ok = await confirmAction('ลบโครงการ', `ยืนยันลบโครงการ "${target.project}"?`, 'ลบโครงการ', true);
    if (!ok) return;
    const nextSnap = { ...db, plans: db.plans.filter((p) => p.id !== id) };
    setDb(nextSnap);
    const token = getAccessToken() || googleToken;
    if (token) {
      setIsSyncing(true);
      try {
        await syncSnapshotToGoogleSheets(spreadsheetId, token, nextSnap);
        setLastSyncedAt(new Date().toLocaleTimeString('th-TH'));
      } finally {
        setIsSyncing(false);
      }
    }
  };

  const saveRequest: AppContextValue['saveRequest'] = async (r) => {
    const amount = numRound(r.amount);
    if (!(amount > 0) || !r.item.trim() || !r.person.trim()) {
      throw new Error('กรอกรายการ จำนวนเงิน และผู้รับผิดชอบให้ครบ');
    }
    const plan = db.plans.find((p) => p.id === r.plan);
    if (!plan) throw new Error('ไม่พบโครงการตามแผน');
    const used = db.requests
      .filter((x) => x.plan === plan.id && COUNTED_STATUSES.includes(x.status))
      .reduce((s, x) => s + x.amount, 0);
    if (amount > plan.amount - used + 0.001) {
      throw new Error(`เกินงบตามแผนของโครงการ (คงเหลือ ${(plan.amount - used).toFixed(2)} บาท)`);
    }

    const req: BudgetRequest = {
      id: uid('Q'),
      date: todayISO(),
      fy: plan.fy,
      plan: plan.id,
      fund: plan.fund,
      dept: plan.dept,
      project: plan.project,
      item: r.item.trim(),
      amount,
      person: r.person.trim(),
      status: 'รออนุมัติ',
      refLink: r.refLink || '',
      txId: '',
      by: currentUser?.username || 'staff',
    };
    const nextSnap = { ...db, requests: [req, ...db.requests] };
    await persistChange(
      nextSnap,
      'ยื่นคำขอใช้งบประมาณ',
      `ยื่นขอใช้งบรายการ "${req.item}" จำนวน ${amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท?`
    );
  };

  const updateRequest: AppContextValue['updateRequest'] = async (id, r) => {
    const target = db.requests.find((x) => x.id === id);
    if (!target) throw new Error('ไม่พบคำขอใช้งบประมาณ');
    const amount = numRound(r.amount);
    if (!(amount > 0) || !r.item.trim() || !r.person.trim()) {
      throw new Error('กรอกรายการ จำนวนเงิน และผู้รับผิดชอบให้ครบ');
    }
    const plan = db.plans.find((p) => p.id === r.plan);
    if (!plan) throw new Error('ไม่พบโครงการตามแผน');
    const used = db.requests
      .filter((x) => x.plan === plan.id && x.id !== id && COUNTED_STATUSES.includes(x.status))
      .reduce((s, x) => s + x.amount, 0);
    if (amount > plan.amount - used + 0.001) {
      throw new Error(`เกินงบตามแผนของโครงการ (คงเหลือ ${(plan.amount - used).toFixed(2)} บาท)`);
    }

    let nextTransactions = db.transactions;
    if (target.status === 'จ่ายเงินแล้ว' && target.txId) {
      const linkedTx = db.transactions.find((t) => t.id === target.txId);
      if (linkedTx) {
        const bal = db.transactions
          .filter((t) => t.fund === plan.fund && t.id !== linkedTx.id)
          .map((t) => normalizeTransactionAccounting(t))
          .reduce((s, t) => s + t.rec - t.pay, 0);
        if (amount > bal + 0.001) {
          throw new Error(`ยอดจ่ายเกินเงินคงเหลือของประเภทเงินนี้ (คงเหลือ ${bal.toFixed(2)} บาท)`);
        }
        nextTransactions = db.transactions.map((t) =>
          t.id === linkedTx.id
            ? {
                ...t,
                fund: plan.fund,
                desc: `${plan.project} – ${r.item.trim()}`,
                pay: amount,
                refLink: r.refLink.trim() || t.refLink || '',
              }
            : t
        );
      }
    }

    const updatedReq: BudgetRequest = {
      ...target,
      fy: plan.fy,
      plan: plan.id,
      fund: plan.fund,
      dept: plan.dept,
      project: plan.project,
      item: r.item.trim(),
      amount,
      person: r.person.trim(),
      refLink: r.refLink.trim(),
    };

    const nextSnap: SheetDatabaseSnapshot = {
      ...db,
      transactions: nextTransactions,
      requests: db.requests.map((x) => (x.id === id ? updatedReq : x)),
    };
    await persistChange(
      nextSnap,
      'บันทึกการแก้ไขคำขอใช้เงิน',
      `บันทึกการแก้ไขคำขอ "${updatedReq.item}" จำนวน ${amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท?`
    );
  };

  const deleteRequest: AppContextValue['deleteRequest'] = async (id) => {
    const target = db.requests.find((r) => r.id === id);
    if (!target) throw new Error('ไม่พบคำขอใช้งบประมาณ');
    if (target.txId && (db.loans.some((l) => l.txId === target.txId) || db.loanRets.some((lr) => lr.txId === target.txId))) {
      throw new Error('รายการนี้เชื่อมโยงกับสัญญาเงินยืม');
    }
    const ok = await confirmAction(
      'ยืนยันการลบคำขอใช้เงิน',
      target.status === 'จ่ายเงินแล้ว' && target.txId
        ? `คำขอ "${target.item}" จ่ายเงินแล้ว การลบจะลบคำขอและรายการจ่ายที่เชื่อมโยงในทะเบียนคุมออกด้วย ยืนยันหรือไม่?`
        : `ต้องการลบคำขอ "${target.item}" (${target.amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท) หรือไม่?`,
      'ลบคำขอ',
      true
    );
    if (!ok) return;

    const nextSnap: SheetDatabaseSnapshot = {
      ...db,
      requests: db.requests.filter((r) => r.id !== id),
      transactions:
        target.txId && target.status === 'จ่ายเงินแล้ว'
          ? db.transactions.filter((t) => t.id !== target.txId)
          : db.transactions,
    };
    setDb(nextSnap);
    const token = getAccessToken() || googleToken;
    if (token) {
      setIsSyncing(true);
      try {
        await syncSnapshotToGoogleSheets(spreadsheetId, token, nextSnap);
        setLastSyncedAt(new Date().toLocaleTimeString('th-TH'));
      } finally {
        setIsSyncing(false);
      }
    }
  };

  const setRequestStatus: AppContextValue['setRequestStatus'] = async (id, status) => {
    const target = db.requests.find((r) => r.id === id);
    if (!target) throw new Error('ไม่พบคำขอ');
    if (target.status === 'จ่ายเงินแล้ว') {
      throw new Error('คำขอนี้จ่ายเงินแล้ว เปลี่ยนสถานะไม่ได้ (ให้แอดมินลบรายการจ่ายในทะเบียนก่อน)');
    }
    if (status === 'อนุมัติแล้ว') {
      const plan = db.plans.find((p) => p.id === target.plan);
      const used = db.requests
        .filter((x) => x.plan === target.plan && x.id !== id && COUNTED_STATUSES.includes(x.status))
        .reduce((s, x) => s + x.amount, 0);
      if (!plan || target.amount > plan.amount - used + 0.001) {
        throw new Error('อนุมัติไม่ได้ เกินงบตามแผน');
      }
    }
    const nextSnap = {
      ...db,
      requests: db.requests.map((r) => (r.id === id ? { ...r, status } : r)),
    };
    await persistChange(
      nextSnap,
      `เปลี่ยนสถานะคำขอเป็น "${status}"`,
      `ยืนยันเปลี่ยนสถานะคำขอ "${target.item}" เป็น ${status}?`
    );
  };

  const payRequest: AppContextValue['payRequest'] = async (id, d) => {
    const target = db.requests.find((r) => r.id === id);
    if (!target) throw new Error('ไม่พบคำขอ');
    if (target.status !== 'อนุมัติแล้ว') throw new Error('จ่ายได้เฉพาะคำขอที่อนุมัติแล้ว');
    const bal = db.transactions
      .filter((t) => t.fund === target.fund)
      .map((t) => normalizeTransactionAccounting(t))
      .reduce((s, t) => s + t.rec - t.pay, 0);
    if (target.amount > bal + 0.001) {
      throw new Error(`ยอดจ่ายเกินเงินคงเหลือของประเภทเงินนี้ (คงเหลือ ${bal.toFixed(2)} บาท)`);
    }

    const txId = uid('T');
    const tx: Transaction = {
      id: txId,
      date: d.date,
      fy: fyOf(d.date),
      fund: target.fund,
      doc: d.doc.trim() || id,
      desc: `${target.project} – ${target.item}`,
      rec: 0,
      pay: target.amount,
      loc: d.loc,
      kind: 'normal',
      by: currentUser?.username || 'admin',
      bank: d.loc === 'bank' ? d.bank : '',
      refLink: target.refLink || '',
    };

    const nextSnap = {
      ...db,
      transactions: [...db.transactions, tx],
      requests: db.requests.map((r) =>
        r.id === id ? { ...r, status: 'จ่ายเงินแล้ว' as const, txId } : r
      ),
    };
    await persistChange(
      nextSnap,
      'ยืนยันการจ่ายเงินตามคำขอ',
      `บันทึกรายการจ่าย "${tx.desc}" จำนวน ${tx.pay.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท ในทะเบียนคุม?`
    );
  };

  const uploadRefDocument: AppContextValue['uploadRefDocument'] = async (file, targetFy) => {
    const token = getAccessToken() || googleToken;
    if (!token) {
      throw new Error(
        'กรุณาเชื่อมต่อ Google Workspace (ปุ่ม "เชื่อมต่อ Google" ด้านบน) ก่อนอัปโหลดไฟล์ไปยัง Google Drive หรือวางลิงก์ไฟล์ในช่องได้โดยตรง'
      );
    }

    let folderId = db.settings.driveFolderId || '';
    if (!folderId) {
      const ok = await confirmAction(
        'สร้างโฟลเดอร์ Google Drive อัตโนมัติ',
        `ยังไม่ได้กำหนด Folder ID ต้องการสร้างโฟลเดอร์ "เอกสารการเงิน-${db.settings.schoolName}" และอัปโหลดไฟล์ "${file.name}" หรือไม่?`,
        'สร้างโฟลเดอร์และอัปโหลด'
      );
      if (!ok) throw new Error('__CANCELLED__');
      const created = await createDriveRootFolder(`เอกสารการเงิน-${db.settings.schoolName}`, token);
      folderId = created.id;
      const nextSnap: SheetDatabaseSnapshot = {
        ...db,
        settings: { ...db.settings, driveFolderId: folderId },
      };
      setDb(nextSnap);
      await syncSnapshotToGoogleSheets(spreadsheetId, token, nextSnap);
    } else {
      const ok = await confirmAction(
        'อัปโหลดเอกสารแนบไปยัง Google Drive',
        `ต้องการอัปโหลดไฟล์ "${file.name}" เข้าโฟลเดอร์ "ปีงบประมาณ ${targetFy || fy}" เพื่อสร้างลิงก์เอกสารอ้างอิงหรือไม่?`,
        'อัปโหลดไฟล์'
      );
      if (!ok) throw new Error('__CANCELLED__');
    }

    setIsSyncing(true);
    try {
      const uploaded = await uploadFileToDriveFolder(
        folderId,
        targetFy || fy,
        file.name,
        file,
        file.type || 'application/octet-stream',
        token
      );
      return { url: uploaded.webViewLink, name: uploaded.name };
    } finally {
      setIsSyncing(false);
    }
  };

  const saveReport: AppContextValue['saveReport'] = async (r) => {
    if (!r.project.trim() || !r.reporter.trim() || !r.summary.trim()) {
      throw new Error('กรอกชื่อโครงการ สรุปผล และผู้รายงานให้ครบ');
    }
    const rep: ProjectReport = {
      id: uid('R'),
      fy: r.fy,
      plan: r.plan || '',
      project: r.project.trim(),
      dept: r.dept || '',
      approved: numRound(r.approved),
      spent: numRound(r.spent),
      summary: r.summary,
      issues: r.issues || '',
      status: r.status || 'เสร็จสิ้นตามแผน',
      reporter: r.reporter.trim(),
      date: todayISO(),
      by: currentUser?.username || 'admin',
      files: [],
    };
    const nextSnap = { ...db, reports: [rep, ...db.reports] };
    await persistChange(
      nextSnap,
      'บันทึกรายงานผลโครงการ',
      `บันทึกรายงานผลโครงการ "${rep.project}" ลงระบบและ Google Sheets?`
    );
    return rep;
  };

  const uploadReportDocument: AppContextValue['uploadReportDocument'] = async (reportId, file) => {
    const token = getAccessToken() || googleToken;
    if (!token) throw new Error('กรุณาเชื่อมต่อ Google Workspace ก่อนอัปโหลดไฟล์ไปยัง Google Drive');
    const folderId = db.settings.driveFolderId;
    if (!folderId) throw new Error('ยังไม่ได้ตั้งค่า Folder ID (ตั้งค่าระบบ > ที่เก็บข้อมูล)');
    const rep = db.reports.find((r) => r.id === reportId);
    if (!rep) throw new Error('ไม่พบรายงานโครงการ');

    const ok = await confirmAction(
      'อัปโหลดไฟล์รายงานไปยัง Google Drive',
      `ต้องการอัปโหลดไฟล์ "${file.name}" เข้าโฟลเดอร์ "ปีงบประมาณ ${rep.fy}" และผูกลิงก์กับรายงาน "${rep.project}" หรือไม่?`,
      'อัปโหลดไฟล์'
    );
    if (!ok) return;

    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const uploaded = await uploadFileToDriveFolder(
      folderId,
      rep.fy,
      file.name,
      file,
      file.type || 'application/octet-stream',
      token
    );
    const nextReports = db.reports.map((r) =>
      r.id === reportId
        ? {
            ...r,
            files: [
              ...r.files,
              {
                id: uploaded.id,
                name: uploaded.name,
                url: uploaded.webViewLink,
                type: (ext === 'pdf' ? 'PDF' : 'Word') as 'PDF' | 'Word',
                by: currentUser?.username || 'admin',
                date: todayISO(),
              },
            ],
          }
        : r
    );
    const nextSnap = { ...db, reports: nextReports };
    setDb(nextSnap);
    await syncSnapshotToGoogleSheets(spreadsheetId, token, nextSnap);
    setLastSyncedAt(new Date().toLocaleTimeString('th-TH'));
  };

  const deleteReportDocument: AppContextValue['deleteReportDocument'] = async (reportId, fileId) => {
    const ok = await confirmAction(
      'ลบไฟล์รายงานออกจาก Google Drive',
      'ไฟล์จะถูกลบออกจาก Google Drive และถอดลิงก์ออกจากรายงานโครงการ ยืนยันหรือไม่?',
      'ลบไฟล์',
      true
    );
    if (!ok) return;

    const token = getAccessToken() || googleToken;
    if (token) {
      await deleteDriveFile(fileId, token);
    }
    const nextSnap = {
      ...db,
      reports: db.reports.map((r) =>
        r.id === reportId ? { ...r, files: r.files.filter((f) => f.id !== fileId) } : r
      ),
    };
    setDb(nextSnap);
    if (token) {
      await syncSnapshotToGoogleSheets(spreadsheetId, token, nextSnap);
    }
  };

  const createLoan: AppContextValue['createLoan'] = async (d) => {
    const amount = numRound(d.amount);
    const borrower = d.borrower.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date) || !/^\d{4}-\d{2}-\d{2}$/.test(d.due)) {
      throw new Error('วันที่ยืมและกำหนดส่งใช้ไม่ถูกต้อง');
    }
    if (d.due < d.date) throw new Error('กำหนดส่งใช้ต้องไม่ก่อนวันที่ยืม');
    if (!(amount > 0) || !borrower) throw new Error('กรอกชื่อผู้ยืมและจำนวนเงินให้ครบ');
    if (!LOAN_PURPOSES.includes(d.purpose)) {
      throw new Error('ให้ยืมได้เฉพาะ ค่าจ้างชั่วคราว ค่าตอบแทนใช้สอยและวัสดุ ค่าสาธารณูปโภค และอาหารกลางวัน');
    }
    if (!d.approved) throw new Error('ต้องได้รับอนุมัติจากผู้อำนวยการก่อน (ติ๊กยืนยันการอนุมัติ)');

    const old = loansFull().find(
      (l) => l.out > 0.004 && l.borrower.trim().toLowerCase() === borrower.toLowerCase()
    );
    if (old) {
      throw new Error(
        `ผู้ยืมยังส่งใช้เงินยืมรายเก่าไม่เสร็จ (${old.no} ค้าง ${old.out.toFixed(2)} บาท) ห้ามอนุมัติยืมรายใหม่`
      );
    }

    const bal = db.transactions
      .filter((t) => t.fund === d.fund)
      .map((t) => normalizeTransactionAccounting(t))
      .reduce((s, t) => s + t.rec - t.pay, 0);
    if (amount > bal + 0.001) {
      throw new Error(`ยอดให้ยืมเกินเงินคงเหลือของประเภทนี้ (คงเหลือ ${bal.toFixed(2)} บาท)`);
    }

    const targetFy = fyOf(d.date);
    const no = nextDocNo('บย', d.date);
    const txId = uid('T');
    const tx: Transaction = {
      id: txId,
      date: d.date,
      fy: targetFy,
      fund: d.fund,
      doc: no,
      desc: `จ่ายให้ยืม ${d.purpose} – ${borrower}`,
      rec: 0,
      pay: amount,
      loc: d.loc,
      kind: 'loan',
      by: currentUser?.username || 'admin',
      bank: d.loc === 'bank' ? d.bank : '',
    };
    const loan: Loan = {
      id: uid('L'),
      no,
      date: d.date,
      fy: targetFy,
      fund: d.fund,
      borrower,
      purpose: d.purpose,
      amount,
      due: d.due,
      txId,
      by: currentUser?.username || 'admin',
    };
    const nextSnap = {
      ...db,
      transactions: [...db.transactions, tx],
      loans: [loan, ...db.loans],
    };
    await persistChange(
      nextSnap,
      'บันทึกสัญญายืมเงิน',
      `สร้างสัญญายืมเงิน ${no} ผู้ยืม ${borrower} จำนวน ${amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท?`
    );
    return no;
  };

  const returnLoan: AppContextValue['returnLoan'] = async (d) => {
    const v = numRound(d.voucher);
    const c = numRound(d.cash);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) throw new Error('วันที่ไม่ถูกต้อง');
    if (v < 0 || c < 0 || v + c <= 0) throw new Error('กรอกยอดส่งใช้ด้วยใบสำคัญและ/หรือเงินสด');
    if (v > 0 && !d.voucherNo.trim()) throw new Error('ส่งใช้ด้วยใบสำคัญ ต้องระบุเลขที่ใบสำคัญ (บค/บจ/บคล)');
    if (c > 0 && !d.cashNo.trim()) throw new Error('ส่งใช้เป็นเงิน ต้องระบุเลขที่ใบเสร็จรับเงิน (บร)');

    const loan = loansFull().find((l) => l.id === d.loanId);
    if (!loan) throw new Error('ไม่พบสัญญายืมเงิน');
    if (d.date < loan.date) throw new Error('วันที่ส่งใช้ต้องไม่ก่อนวันที่ยืม');
    if (v + c > loan.out + 0.004) {
      throw new Error(`ยอดส่งใช้เกินยอดค้างชำระ (ค้าง ${loan.out.toFixed(2)} บาท)`);
    }

    let txId = '';
    const extraTx: Transaction[] = [];
    if (c > 0) {
      txId = uid('T');
      extraTx.push({
        id: txId,
        date: d.date,
        fy: fyOf(d.date),
        fund: loan.fund,
        doc: d.cashNo.trim(),
        desc: `รับคืนเงินยืม ${loan.no} – ${loan.borrower}`,
        rec: c,
        pay: 0,
        loc: d.loc,
        kind: 'loanret',
        by: currentUser?.username || 'admin',
        bank: d.loc === 'bank' ? d.bank : '',
      });
    }

    const ret: LoanReturn = {
      id: uid('LR'),
      loan: loan.id,
      date: d.date,
      fy: fyOf(d.date),
      fund: loan.fund,
      voucherNo: d.voucherNo.trim(),
      voucher: v,
      cashNo: d.cashNo.trim(),
      cash: c,
      loc: c > 0 ? d.loc : '',
      bank: c > 0 && d.loc === 'bank' ? d.bank : '',
      txId,
      by: currentUser?.username || 'admin',
    };

    const nextSnap = {
      ...db,
      transactions: [...db.transactions, ...extraTx],
      loanRets: [...db.loanRets, ret],
    };
    await persistChange(
      nextSnap,
      'บันทึกการส่งใช้เงินยืม',
      `บันทึกส่งใช้เงินยืม ${loan.no} รวม ${(v + c).toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท?`
    );
  };

  const deleteLoan: AppContextValue['deleteLoan'] = async (id) => {
    if (db.loanRets.some((r) => r.loan === id)) {
      throw new Error('มีการส่งใช้เงินยืมแล้ว ให้ลบรายการส่งใช้ก่อน');
    }
    const loan = db.loans.find((l) => l.id === id);
    if (!loan) return;
    const ok = await confirmAction(
      'ลบสัญญายืมเงิน',
      `ยืนยันลบสัญญา ${loan.no} และรายการจ่ายให้ยืมในทะเบียน?`,
      'ลบสัญญา',
      true
    );
    if (!ok) return;

    const nextSnap = {
      ...db,
      loans: db.loans.filter((l) => l.id !== id),
      transactions: db.transactions.filter((t) => t.id !== loan.txId),
    };
    setDb(nextSnap);
    const token = getAccessToken() || googleToken;
    if (token) {
      await syncSnapshotToGoogleSheets(spreadsheetId, token, nextSnap);
    }
  };

  const deleteLoanReturn: AppContextValue['deleteLoanReturn'] = async (id) => {
    const ret = db.loanRets.find((r) => r.id === id);
    if (!ret) return;
    const ok = await confirmAction('ลบรายการส่งใช้เงินยืม', 'ยืนยันลบรายการส่งใช้เงินยืมนี้?', 'ลบรายการ', true);
    if (!ok) return;

    const nextSnap = {
      ...db,
      loanRets: db.loanRets.filter((r) => r.id !== id),
      transactions: ret.txId ? db.transactions.filter((t) => t.id !== ret.txId) : db.transactions,
    };
    setDb(nextSnap);
    const token = getAccessToken() || googleToken;
    if (token) {
      await syncSnapshotToGoogleSheets(spreadsheetId, token, nextSnap);
    }
  };

  const markReportSent: AppContextValue['markReportSent'] = async (key, on) => {
    const nextMarkers = { ...(db.settings.sentMarkers || {}) };
    if (on) nextMarkers[key] = todayISO();
    else delete nextMarkers[key];

    const nextSnap = {
      ...db,
      settings: { ...db.settings, sentMarkers: nextMarkers },
    };
    await persistChange(
      nextSnap,
      on ? 'บันทึกว่าส่งรายงานแล้ว' : 'ยกเลิกสถานะการส่งรายงาน',
      'ยืนยันอัปเดตสถานะในปฏิทินส่งรายงาน?'
    );
  };

  const saveSettings: AppContextValue['saveSettings'] = async (s) => {
    if (s.schoolName !== undefined && !s.schoolName.trim()) {
      throw new Error('ต้องระบุชื่อโรงเรียน');
    }
    const nextSnap = {
      ...db,
      settings: { ...db.settings, ...s },
    };
    await persistChange(nextSnap, 'บันทึกข้อมูลโรงเรียน', 'ยืนยันบันทึกการตั้งค่าโรงเรียนลงระบบและ Google Sheets?');
  };

  const saveAsset: AppContextValue['saveAsset'] = async (key, dataUrl) => {
    const nextSnap = {
      ...db,
      assets: { ...db.assets, [key]: dataUrl },
    };
    await persistChange(
      nextSnap,
      dataUrl ? 'บันทึกรูปภาพ/ลายเซ็น' : 'ลบรูปภาพ/ลายเซ็น',
      'ยืนยันอัปเดตข้อมูลรูปภาพในระบบและ Google Sheets?'
    );
  };

  const saveUser: AppContextValue['saveUser'] = async (u) => {
    const un = u.username.trim().toLowerCase();
    if (!/^[a-z0-9_.-]{3,20}$/.test(un)) {
      throw new Error('ชื่อผู้ใช้ใช้ได้เฉพาะ a-z ตัวเลข _ . - ยาว 3-20 ตัว');
    }
    const exists = db.users.find((x) => x.username.toLowerCase() === un);
    if (!exists && !u.pw) throw new Error('ผู้ใช้ใหม่ต้องตั้งรหัสผ่าน');
    if (u.pw && u.pw.length < 4) throw new Error('รหัสผ่านต้องยาวอย่างน้อย 4 ตัว');

    const othersActiveAdmin = db.users.filter(
      (x) => x.role === 'admin' && x.active && x.username.toLowerCase() !== un
    ).length;
    if (othersActiveAdmin === 0 && !(u.role === 'admin' && u.active)) {
      throw new Error('ต้องมีแอดมินที่ใช้งานอยู่อย่างน้อย 1 คน');
    }

    const finalUser: AppUser = {
      username: un,
      name: u.name.trim() || un,
      role: u.role,
      active: u.active,
      pw: u.pw || exists?.pw || '1939',
      permissions: u.permissions || (u.role === 'admin' ? ADMIN_PERMISSIONS : DEFAULT_STAFF_PERMISSIONS),
    };

    const nextUsers = exists
      ? db.users.map((x) => (x.username.toLowerCase() === un ? finalUser : x))
      : [...db.users, finalUser];
    const nextSnap = { ...db, users: nextUsers };
    await persistChange(
      nextSnap,
      'บันทึกข้อมูลผู้ใช้งานและสิทธิ์',
      `บันทึกสิทธิ์การใช้งานสำหรับผู้ใช้ "${finalUser.name}" (${finalUser.username})?`
    );
  };

  const saveBank: AppContextValue['saveBank'] = async (b) => {
    if (!b.bank.trim() || !b.accountName.trim()) throw new Error('ต้องระบุชื่อธนาคารและชื่อบัญชี');
    if (!/^[0-9-]{6,20}$/.test(b.accountNo.trim())) {
      throw new Error('เลขที่บัญชีใช้ตัวเลขและขีด (-) ยาว 6-20 ตัว');
    }
    const bankObj: BankAccount = {
      id: b.id || uid('B'),
      bank: b.bank.trim(),
      accountNo: b.accountNo.trim(),
      accountName: b.accountName.trim(),
      note: b.note.trim(),
      active: b.active,
    };
    const nextBanks = b.id
      ? db.banks.map((x) => (x.id === b.id ? bankObj : x))
      : [...db.banks, bankObj];
    const nextSnap = { ...db, banks: nextBanks };
    await persistChange(nextSnap, 'บันทึกบัญชีธนาคาร', `บันทึกบัญชี ${bankObj.bank} เลขที่ ${bankObj.accountNo}?`);
  };

  const saveDriveFolder: AppContextValue['saveDriveFolder'] = async (idOrUrl) => {
    const id = extractDriveId(idOrUrl);
    if (!id) throw new Error('รูปแบบ Folder ID ไม่ถูกต้อง (วางรหัสโฟลเดอร์หรือลิงก์โฟลเดอร์ได้)');
    const token = getAccessToken() || googleToken;
    let folderName = id;
    if (token) {
      folderName = await getDriveFolderName(id, token);
    }
    const nextSnap = {
      ...db,
      settings: { ...db.settings, driveFolderId: id },
    };
    await persistChange(
      nextSnap,
      'บันทึกโฟลเดอร์ Google Drive',
      `ผูกโฟลเดอร์ "${folderName}" (${id}) สำหรับจัดเก็บไฟล์รายงาน?`
    );
    return folderName;
  };

  const createAndLinkDriveFolder: AppContextValue['createAndLinkDriveFolder'] = async (folderName) => {
    const token = getAccessToken() || googleToken;
    if (!token) throw new Error('กรุณาเชื่อมต่อ Google Workspace ก่อนสร้างโฟลเดอร์');
    const ok = await confirmAction(
      'สร้างโฟลเดอร์ใน Google Drive',
      `สร้างโฟลเดอร์ใหม่ชื่อ "${folderName}" ใน Google Drive ของคุณ?`,
      'สร้างโฟลเดอร์'
    );
    if (!ok) throw new Error('__CANCELLED__');

    const created = await createDriveRootFolder(folderName, token);
    const nextSnap = {
      ...db,
      settings: { ...db.settings, driveFolderId: created.id },
    };
    setDb(nextSnap);
    await syncSnapshotToGoogleSheets(spreadsheetId, token, nextSnap);
    return created;
  };

  /* ---------- Section 4 Official Reports & Director PA ---------- */
  const savePart1Survey: AppContextValue['savePart1Survey'] = async (survey) => {
    const nextSnap = { ...db, part1Survey: survey };
    await persistChange(nextSnap, 'บันทึกข้อมูลรายงานส่วนที่ 1', 'บันทึกข้อมูลพื้นฐานโรงเรียนและบุคลากรลง Google Sheets?');
  };

  const addReceiptEntry: AppContextValue['addReceiptEntry'] = async (entry) => {
    const rec: ReceiptControlEntry = { ...entry, id: uid('RC') };
    const nextSnap = { ...db, receipts: [...db.receipts, rec] };
    await persistChange(nextSnap, 'บันทึกรายการใบเสร็จรับเงิน', `บันทึกใบเสร็จเลขที่ ${rec.receiptNo}?`);
  };

  const deleteReceiptEntry: AppContextValue['deleteReceiptEntry'] = async (id) => {
    const ok = await confirmAction('ลบรายการใบเสร็จรับเงิน', 'ยืนยันลบรายการใบเสร็จนี้ออกจากทะเบียนคุม?', 'ลบรายการ', true);
    if (!ok) return;
    const nextSnap = { ...db, receipts: db.receipts.filter((r) => r.id !== id) };
    setDb(nextSnap);
    const token = getAccessToken() || googleToken;
    if (token) await syncSnapshotToGoogleSheets(spreadsheetId, token, nextSnap);
  };

  const addReceiptRequisition: AppContextValue['addReceiptRequisition'] = async (req) => {
    const item: ReceiptRequisition = { ...req, id: uid('RQ') };
    const nextSnap = { ...db, receiptReqs: [item, ...db.receiptReqs] };
    await persistChange(nextSnap, 'บันทึกใบเบิกใบเสร็จรับเงิน', `บันทึกการขอเบิกใบเสร็จ ${item.qtyRequested} เล่ม?`);
  };

  const saveDirectorEval: AppContextValue['saveDirectorEval'] = async (indicators) => {
    const nextSnap = { ...db, directorEval: indicators };
    await persistChange(
      nextSnap,
      'บันทึกผลการประเมินสัมฤทธิผลฯ ผู้อำนวยการ',
      'ยืนยันบันทึกคะแนนและหลักฐานประกอบการประเมิน PA ลง Google Sheets?'
    );
  };

  const saveThaiReportToSheet: AppContextValue['saveThaiReportToSheet'] = async (sheetTitle, rows2D) => {
    const token = getAccessToken() || googleToken;
    if (!token) throw new Error('กรุณาเชื่อมต่อ Google Workspace (ปุ่ม Sign in with Google) ก่อนบันทึกเข้า Google Sheets');

    const ok = await confirmAction(
      `บันทึกข้อมูลลงแท็บ "${sheetTitle}"`,
      `ระบบจะสร้างแท็บ "${sheetTitle}" (หากยังไม่มี) และเขียนตารางข้อมูลรายงานลงใน Google Sheet ID: ${spreadsheetId}`,
      'บันทึกลง Google Sheet'
    );
    if (!ok) return;

    setIsSyncing(true);
    try {
      await ensureSpreadsheetStructure(spreadsheetId, token);
      await writeSheetRows(spreadsheetId, sheetTitle, rows2D, token);
      setLastSyncedAt(new Date().toLocaleTimeString('th-TH'));
    } finally {
      setIsSyncing(false);
    }
  };

  const archivePdfReport: AppContextValue['archivePdfReport'] = async ({
    reportKey,
    reportTitle,
    fileName,
    pdfBlob,
    uploadToDrive,
  }) => {
    const token = getAccessToken() || googleToken;
    let driveFileId = '';
    let driveUrl = '';

    if (uploadToDrive && token && db.settings.driveFolderId) {
      const ok = await confirmAction(
        'บันทึก PDF ลง Google Drive และ Google Sheets',
        `อัปโหลดไฟล์ "${fileName}" ไปยัง Google Drive และบันทึกประวัติลงแท็บ "คลังเอกสาร_PDF" ใน Google Sheets?`,
        'ยืนยันบันทึก'
      );
      if (!ok) throw new Error('__CANCELLED__');

      const uploaded = await uploadFileToDriveFolder(
        db.settings.driveFolderId,
        fy,
        fileName,
        pdfBlob,
        'application/pdf',
        token
      );
      driveFileId = uploaded.id;
      driveUrl = uploaded.webViewLink;
    } else if (token) {
      const ok = await confirmAction(
        'บันทึกประวัติ PDF ลง Google Sheets',
        `บันทึกข้อมูลเอกสาร "${reportTitle}" ลงแท็บ "คลังเอกสาร_PDF" ใน Google Sheets?`,
        'บันทึกข้อมูล'
      );
      if (!ok) throw new Error('__CANCELLED__');
    }

    const record: PdfArchiveRecord = {
      id: uid('PDF'),
      fy,
      reportKey,
      reportTitle,
      fileName,
      driveFileId,
      driveUrl: driveUrl || 'ดาวน์โหลดแล้ว (ในเครื่อง)',
      createdAt: todayISO(),
      createdBy: currentUser?.name || currentUser?.username || 'ผู้ใช้งาน',
    };

    const nextSnap = {
      ...db,
      pdfArchive: [record, ...db.pdfArchive],
    };
    setDb(nextSnap);

    if (token) {
      setIsSyncing(true);
      try {
        await ensureSpreadsheetStructure(spreadsheetId, token);
        await appendSheetRow(
          spreadsheetId,
          'คลังเอกสาร_PDF',
          [
            record.id,
            record.fy,
            record.reportKey,
            record.reportTitle,
            record.fileName,
            record.driveUrl || '',
            record.createdAt,
            record.createdBy,
          ],
          token
        );
        setLastSyncedAt(new Date().toLocaleTimeString('th-TH'));
      } finally {
        setIsSyncing(false);
      }
    }

    return record;
  };

  return (
    <AppContext.Provider
      value={{
        fy,
        setFy,
        availableYears,
        googleUser,
        googleToken,
        isGoogleConnected,
        isSyncing,
        spreadsheetId,
        lastSyncedAt,
        connectGoogleWorkspace,
        disconnectGoogleWorkspace,
        pullFromGoogleSheets,
        pushToGoogleSheets,
        createAndConnectNewSheet,
        changeSpreadsheetId,
        currentUser,
        loginAppUser,
        logoutAppUser,
        hasPermission,
        canAccessMenu,
        db,
        fundName,
        includeSignatures,
        setIncludeSignatures,
        dashboard,
        getDailyReport,
        getRegister,
        getVoucherRegister,
        getChecks,
        nextDocNo,
        addTransaction,
        updateTransaction,
        deleteTransaction,
        saveSubsidy,
        deleteSubsidy,
        saveBudgetDoc,
        createPlansFromDoc,
        confirmPlanCheck,
        savePlan,
        deletePlan,
        saveRequest,
        updateRequest,
        deleteRequest,
        setRequestStatus,
        payRequest,
        uploadRefDocument,
        saveReport,
        uploadReportDocument,
        deleteReportDocument,
        createLoan,
        returnLoan,
        deleteLoan,
        deleteLoanReturn,
        markReportSent,
        saveSettings,
        saveAsset,
        saveUser,
        saveBank,
        saveDriveFolder,
        createAndLinkDriveFolder,
        savePart1Survey,
        addReceiptEntry,
        deleteReceiptEntry,
        addReceiptRequisition,
        saveDirectorEval,
        saveThaiReportToSheet,
        archivePdfReport,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};
