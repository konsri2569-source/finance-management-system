import {
  ADMIN_PERMISSIONS,
  AppUser,
  BankAccount,
  BudgetDoc,
  BudgetPlan,
  BudgetRequest,
  DEFAULT_STAFF_PERMISSIONS,
  DirectorEvalIndicator,
  FUNDS,
  FundType,
  Loan,
  LoanReturn,
  Part1SchoolSurvey,
  PdfArchiveRecord,
  ProjectReport,
  ReceiptControlEntry,
  ReceiptRequisition,
  SchoolAssets,
  SchoolSettings,
  SubsidyRecord,
  Transaction,
  UserPermissions,
} from '../types/finance';
import { normalizeTransactionAccounting, numRound, todayISO } from '../utils/formatters';

const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const DRIVE_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

export const THAI_REPORT_TABS = [
  'รายงานส่วนที่_1',
  'รายงานส่วนที่_2',
  'รายงานส่วนที่_3',
  'รายงานส่วนที่_4_รับ',
  'รายงานส่วนที่_4_จ่าย',
  'รายงานส่วนที่_5',
  'สมุดเงินสด',
  'รายงานเงินคงเหลือประจำวัน',
  'ทะเบียนคุมเงินนอกงบประมาณ',
  'ทะเบียนคุมเงินฝากธนาคาร',
  'ทะเบียนคุมเงินอุดหนุนทั่วไป',
  'ทะเบียนเงินกิจกรรมพัฒนาผู้เรียน',
  'ทะเบียนเงินลูกเสือ_เนตรนารี',
  'ทะเบียนคุมเงินค่ายุวกาชาด',
  'ทะเบียนคุมเงินภาษีหัก_ณ_ที่จ่าย',
  'ทะเบียนคุมปัจจัยพื้นฐานยากจน',
  'ทะเบียนคุมเงินอุดหนุนอาหารกลางวัน',
  'บันทึกการเก็บรักษาเงิน',
  'ใบส่งรายได้แผ่นดิน',
  'รายงานใบเสร็จ',
  'คลังเอกสาร_PDF',
];

const CORE_SHEETS: Array<{ title: string; headers: string[] }> = [
  { title: 'FIN_FundTypes', headers: ['id', 'name', 'group', 'color'] },
  {
    title: 'FIN_Transactions',
    headers: ['id', 'date', 'fy', 'fund', 'doc', 'desc', 'rec', 'pay', 'loc', 'kind', 'by', 'bank', 'refLink'],
  },
  { title: 'FIN_Settings', headers: ['key', 'value'] },
  { title: 'FIN_Assets', headers: ['key', 'dataUrl'] },
  { title: 'FIN_Alloc', headers: ['fy', 'json', 'by', 'date'] },
  {
    title: 'FIN_Loans',
    headers: ['id', 'no', 'date', 'fy', 'fund', 'borrower', 'purpose', 'amount', 'due', 'txId', 'by'],
  },
  {
    title: 'FIN_LoanRets',
    headers: ['id', 'loan', 'date', 'fy', 'fund', 'voucherNo', 'voucher', 'cashNo', 'cash', 'loc', 'bank', 'txId', 'by'],
  },
  {
    title: 'FIN_Reports',
    headers: ['id', 'fy', 'plan', 'project', 'dept', 'approved', 'spent', 'summary', 'issues', 'status', 'reporter', 'date', 'by', 'files'],
  },
  { title: 'FIN_Plans', headers: ['id', 'fy', 'fund', 'dept', 'project', 'amount', 'note'] },
  {
    title: 'FIN_Requests',
    headers: ['id', 'date', 'fy', 'plan', 'fund', 'dept', 'project', 'item', 'amount', 'person', 'status', 'refLink', 'txId', 'by'],
  },
  {
    title: 'FIN_Subsidy',
    headers: ['id', 'fy', 'level', 'count', 'small', 'total', 'by', 'date', 'grades', 'rates', 'amounts'],
  },
  { title: 'FIN_Banks', headers: ['id', 'bank', 'accountNo', 'accountName', 'note', 'active'] },
  {
    title: 'FIN_Users',
    headers: ['username', 'name', 'role', 'active', 'pw', 'permissionsJson'],
  },
  {
    title: 'FIN_Receipts',
    headers: ['id', 'fy', 'bookNo', 'receiptNo', 'date', 'desc', 'payer', 'amount', 'collector', 'cancelled'],
  },
  {
    title: 'FIN_ReceiptReq',
    headers: ['id', 'date', 'bookType', 'qtyRequested', 'qtyIssued', 'rangeNote', 'requester', 'approver'],
  },
  {
    title: 'FIN_DirectorEval',
    headers: ['id', 'aspect', 'indicator', 'target', 'result', 'score', 'weight', 'evidence'],
  },
  {
    title: 'คลังเอกสาร_PDF',
    headers: ['รหัส', 'ปีงบประมาณ', 'รหัสรายงาน', 'ชื่อเอกสารรายงาน', 'ชื่อไฟล์ PDF', 'ลิงก์ Google Drive', 'วันที่สร้าง', 'ผู้จัดทำ'],
  },
];

async function sheetsFetch(url: string, token: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || `Google Sheets API Error (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

export async function getSpreadsheetMetadata(spreadsheetId: string, token: string) {
  return sheetsFetch(
    `${SHEETS_BASE}/${encodeURIComponent(spreadsheetId)}?fields=spreadsheetId,properties.title,sheets.properties`,
    token
  );
}

export async function createNewSchoolSpreadsheet(
  schoolName: string,
  token: string
): Promise<{ spreadsheetId: string; title: string }> {
  const title = `ระบบบริหารการเงินสถานศึกษา - ${schoolName || 'โรงเรียน'}`;
  const sheetsPayload = [
    ...CORE_SHEETS.map((s) => ({ properties: { title: s.title } })),
    ...THAI_REPORT_TABS.filter((t) => t !== 'คลังเอกสาร_PDF').map((title) => ({
      properties: { title },
    })),
  ];

  const created = await sheetsFetch(SHEETS_BASE, token, {
    method: 'POST',
    body: JSON.stringify({
      properties: { title, locale: 'th_TH', timeZone: 'Asia/Bangkok' },
      sheets: sheetsPayload,
    }),
  });

  const spreadsheetId = created.spreadsheetId as string;
  await seedCoreHeadersAndDefaults(spreadsheetId, token, new Set(sheetsPayload.map((s) => s.properties.title)));
  return { spreadsheetId, title };
}

export async function ensureSpreadsheetStructure(spreadsheetId: string, token: string): Promise<string[]> {
  const meta = await getSpreadsheetMetadata(spreadsheetId, token);
  const existingTitles = new Set<string>(
    (meta.sheets || []).map((s: any) => s.properties?.title as string).filter(Boolean)
  );

  const missingCore = CORE_SHEETS.filter((s) => !existingTitles.has(s.title));
  const missingThai = THAI_REPORT_TABS.filter((t) => !existingTitles.has(t));

  const requests = [
    ...missingCore.map((s) => ({ addSheet: { properties: { title: s.title } } })),
    ...missingThai.map((t) => ({ addSheet: { properties: { title: t } } })),
  ];

  if (requests.length > 0) {
    await sheetsFetch(`${SHEETS_BASE}/${encodeURIComponent(spreadsheetId)}:batchUpdate`, token, {
      method: 'POST',
      body: JSON.stringify({ requests }),
    });
  }

  await seedCoreHeadersAndDefaults(spreadsheetId, token, new Set([...missingCore.map((s) => s.title)]));
  return Array.from(new Set([...existingTitles, ...missingCore.map((s) => s.title), ...missingThai]));
}

async function seedCoreHeadersAndDefaults(
  spreadsheetId: string,
  token: string,
  newlyCreated: Set<string>
) {
  const valueUpdates: Array<{ range: string; values: any[][] }> = [];

  for (const s of CORE_SHEETS) {
    if (newlyCreated.has(s.title)) {
      valueUpdates.push({ range: `'${s.title}'!A1`, values: [s.headers] });
    }
  }

  if (newlyCreated.has('FIN_FundTypes')) {
    valueUpdates.push({
      range: `'FIN_FundTypes'!A2`,
      values: FUNDS.map((f) => [f.id, f.name, f.group, f.color]),
    });
  }

  if (newlyCreated.has('FIN_Settings')) {
    valueUpdates.push({
      range: `'FIN_Settings'!A2`,
      values: [
        ['schoolName', 'โรงเรียนตัวอย่าง'],
        ['affiliation', 'สำนักงานเขตพื้นที่การศึกษาประถมศึกษาระยอง เขต 2'],
        ['schoolSize', 'small'],
        ['director', ''],
        ['financeName', ''],
      ],
    });
  }

  if (newlyCreated.has('FIN_Users')) {
    valueUpdates.push({
      range: `'FIN_Users'!A2`,
      values: [['admin', 'ผู้ดูแลระบบ', 'admin', 'Y', '1939', JSON.stringify(ADMIN_PERMISSIONS)]],
    });
  }

  if (valueUpdates.length > 0) {
    await sheetsFetch(
      `${SHEETS_BASE}/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`,
      token,
      {
        method: 'POST',
        body: JSON.stringify({
          valueInputOption: 'USER_ENTERED',
          data: valueUpdates,
        }),
      }
    );
  }
}

export async function readRange(spreadsheetId: string, range: string, token: string): Promise<string[][]> {
  const data = await sheetsFetch(
    `${SHEETS_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`,
    token
  );
  return (data.values || []) as string[][];
}

export async function writeSheetRows(
  spreadsheetId: string,
  sheetTitle: string,
  rows: any[][],
  token: string
) {
  // Ensure tab exists first
  const meta = await getSpreadsheetMetadata(spreadsheetId, token);
  const exists = (meta.sheets || []).some((s: any) => s.properties?.title === sheetTitle);
  if (!exists) {
    await sheetsFetch(`${SHEETS_BASE}/${encodeURIComponent(spreadsheetId)}:batchUpdate`, token, {
      method: 'POST',
      body: JSON.stringify({ requests: [{ addSheet: { properties: { title: sheetTitle } } }] }),
    });
  }

  // Clear existing range
  await sheetsFetch(
    `${SHEETS_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(`'${sheetTitle}'!A1:Z5000`)}:clear`,
    token,
    { method: 'POST', body: JSON.stringify({}) }
  );

  if (rows.length > 0) {
    await sheetsFetch(
      `${SHEETS_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(`'${sheetTitle}'!A1`)}?valueInputOption=USER_ENTERED`,
      token,
      {
        method: 'PUT',
        body: JSON.stringify({ values: rows }),
      }
    );
  }
}

export async function appendSheetRow(
  spreadsheetId: string,
  sheetTitle: string,
  row: any[],
  token: string
) {
  await sheetsFetch(
    `${SHEETS_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(`'${sheetTitle}'!A1`)}:append?valueInputOption=USER_ENTERED`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({ values: [row] }),
    }
  );
}

const jp = <T,>(s: unknown, fallback: T): T => {
  try {
    return s ? (JSON.parse(String(s)) as T) : fallback;
  } catch {
    return fallback;
  }
};

export interface SheetDatabaseSnapshot {
  funds: FundType[];
  transactions: Transaction[];
  settings: SchoolSettings;
  assets: SchoolAssets;
  allocDocs: Record<number, BudgetDoc>;
  loans: Loan[];
  loanRets: LoanReturn[];
  reports: ProjectReport[];
  plans: BudgetPlan[];
  requests: BudgetRequest[];
  subsidies: SubsidyRecord[];
  banks: BankAccount[];
  users: AppUser[];
  receipts: ReceiptControlEntry[];
  receiptReqs: ReceiptRequisition[];
  directorEval: DirectorEvalIndicator[];
  pdfArchive: PdfArchiveRecord[];
  part1Survey?: Part1SchoolSurvey;
}

export async function loadAllFromGoogleSheets(
  spreadsheetId: string,
  token: string
): Promise<SheetDatabaseSnapshot> {
  await ensureSpreadsheetStructure(spreadsheetId, token);

  const ranges = [
    "'FIN_FundTypes'!A2:D100",
    "'FIN_Transactions'!A2:M5000",
    "'FIN_Settings'!A2:B500",
    "'FIN_Assets'!A2:B20",
    "'FIN_Alloc'!A2:D100",
    "'FIN_Loans'!A2:K1000",
    "'FIN_LoanRets'!A2:M2000",
    "'FIN_Reports'!A2:N1000",
    "'FIN_Plans'!A2:G1000",
    "'FIN_Requests'!A2:N2000",
    "'FIN_Subsidy'!A2:K500",
    "'FIN_Banks'!A2:F200",
    "'FIN_Users'!A2:F200",
    "'FIN_Receipts'!A2:J2000",
    "'FIN_ReceiptReq'!A2:H500",
    "'FIN_DirectorEval'!A2:H100",
    "'คลังเอกสาร_PDF'!A2:H1000",
  ];

  const query = ranges.map((r) => `ranges=${encodeURIComponent(r)}`).join('&');
  const batch = await sheetsFetch(
    `${SHEETS_BASE}/${encodeURIComponent(spreadsheetId)}/values:batchGet?${query}`,
    token
  );
  const vr = (batch.valueRanges || []) as Array<{ values?: string[][] }>;
  const rowsAt = (idx: number) => (vr[idx]?.values || []).filter((r) => r && r[0]);

  const fundsRaw = rowsAt(0);
  const funds: FundType[] = fundsRaw.length
    ? fundsRaw.map((r) => ({ id: r[0], name: r[1] || r[0], group: r[2] || 'อื่น ๆ', color: r[3] || '#64748b' }))
    : FUNDS;

  const transactions: Transaction[] = rowsAt(1).map((r) =>
    normalizeTransactionAccounting({
      id: String(r[0]),
      date: String(r[1] || todayISO()).slice(0, 10),
      fy: Number(r[2]) || 2569,
      fund: String(r[3] || 'F01'),
      doc: String(r[4] || ''),
      desc: String(r[5] || ''),
      rec: Number(r[6]) || 0,
      pay: Number(r[7]) || 0,
      loc: (r[8] as Transaction['loc']) || 'bank',
      kind: (r[9] as Transaction['kind']) || 'normal',
      by: String(r[10] || 'admin'),
      bank: String(r[11] || ''),
      refLink: String(r[12] || ''),
    })
  );

  const settingsMap: Record<string, string> = {};
  rowsAt(2).forEach((r) => {
    settingsMap[r[0]] = r[1] || '';
  });
  const sentMarkers: Record<string, string> = {};
  Object.keys(settingsMap).forEach((k) => {
    if (k.startsWith('sent_') && settingsMap[k]) {
      sentMarkers[k.slice(5)] = settingsMap[k];
    }
  });

  const settings: SchoolSettings = {
    schoolName: settingsMap.schoolName || 'โรงเรียนตัวอย่าง',
    affiliation: settingsMap.affiliation || 'สำนักงานเขตพื้นที่การศึกษาประถมศึกษาระยอง เขต 2',
    district: settingsMap.district || '',
    province: settingsMap.province || '',
    schoolCode: settingsMap.schoolCode || '',
    schoolSize: settingsMap.schoolSize === 'large' ? 'large' : 'small',
    director: settingsMap.director || '',
    financeName: settingsMap.financeName || '',
    driveFolderId: settingsMap.driveFolderId || '',
    sentMarkers,
  };

  const assets: SchoolAssets = {};
  rowsAt(3).forEach((r) => {
    if (r[0] === 'logo' || r[0] === 'sigDirector' || r[0] === 'sigFinance') {
      assets[r[0]] = r[1] || '';
    }
  });

  const allocDocs: Record<number, BudgetDoc> = {};
  rowsAt(4).forEach((r) => {
    const fy = Number(r[0]);
    if (fy) allocDocs[fy] = jp<BudgetDoc>(r[1], {});
  });

  const loans: Loan[] = rowsAt(5).map((r) => ({
    id: String(r[0]),
    no: String(r[1] || ''),
    date: String(r[2] || '').slice(0, 10),
    fy: Number(r[3]) || 2569,
    fund: String(r[4] || ''),
    borrower: String(r[5] || ''),
    purpose: String(r[6] || ''),
    amount: numRound(r[7]),
    due: String(r[8] || '').slice(0, 10),
    txId: String(r[9] || ''),
    by: String(r[10] || ''),
  }));

  const loanRets: LoanReturn[] = rowsAt(6).map((r) => ({
    id: String(r[0]),
    loan: String(r[1] || ''),
    date: String(r[2] || '').slice(0, 10),
    fy: Number(r[3]) || 2569,
    fund: String(r[4] || ''),
    voucherNo: String(r[5] || ''),
    voucher: numRound(r[6]),
    cashNo: String(r[7] || ''),
    cash: numRound(r[8]),
    loc: (r[9] as LoanReturn['loc']) || '',
    bank: String(r[10] || ''),
    txId: String(r[11] || ''),
    by: String(r[12] || ''),
  }));

  const reports: ProjectReport[] = rowsAt(7).map((r) => ({
    id: String(r[0]),
    fy: Number(r[1]) || 2569,
    plan: String(r[2] || ''),
    project: String(r[3] || ''),
    dept: String(r[4] || ''),
    approved: numRound(r[5]),
    spent: numRound(r[6]),
    summary: String(r[7] || ''),
    issues: String(r[8] || ''),
    status: (r[9] as ProjectReport['status']) || 'เสร็จสิ้นตามแผน',
    reporter: String(r[10] || ''),
    date: String(r[11] || '').slice(0, 10),
    by: String(r[12] || ''),
    files: jp(r[13], []),
  }));

  const plans: BudgetPlan[] = rowsAt(8).map((r) => ({
    id: String(r[0]),
    fy: Number(r[1]) || 2569,
    fund: String(r[2] || ''),
    dept: String(r[3] || ''),
    project: String(r[4] || ''),
    amount: numRound(r[5]),
    note: String(r[6] || ''),
  }));

  const requests: BudgetRequest[] = rowsAt(9).map((r) => ({
    id: String(r[0]),
    date: String(r[1] || '').slice(0, 10),
    fy: Number(r[2]) || 2569,
    plan: String(r[3] || ''),
    fund: String(r[4] || ''),
    dept: String(r[5] || ''),
    project: String(r[6] || ''),
    item: String(r[7] || ''),
    amount: numRound(r[8]),
    person: String(r[9] || ''),
    status: (r[10] as BudgetRequest['status']) || 'รออนุมัติ',
    refLink: String(r[11] || ''),
    txId: String(r[12] || ''),
    by: String(r[13] || ''),
  }));

  const subsidies: SubsidyRecord[] = rowsAt(10).map((r) => ({
    id: String(r[0]),
    fy: Number(r[1]) || 2569,
    level: r[2] as SubsidyRecord['level'],
    count: Number(r[3]) || 0,
    small: r[4] === 'Y',
    total: numRound(r[5]),
    by: String(r[6] || ''),
    date: String(r[7] || '').slice(0, 10),
    grades: jp(r[8], []),
    rates: jp(r[9], {}),
    amounts: jp(r[10], {}),
  }));

  const banks: BankAccount[] = rowsAt(11).map((r) => ({
    id: String(r[0]),
    bank: String(r[1] || ''),
    accountNo: String(r[2] || ''),
    accountName: String(r[3] || ''),
    note: String(r[4] || ''),
    active: r[5] !== 'N',
  }));

  const usersRaw = rowsAt(12);
  const users: AppUser[] = usersRaw.length
    ? usersRaw.map((r) => {
        const role = r[2] === 'admin' ? 'admin' : 'staff';
        const fallbackPerms = role === 'admin' ? ADMIN_PERMISSIONS : DEFAULT_STAFF_PERMISSIONS;
        return {
          username: String(r[0]),
          name: String(r[1] || r[0]),
          role,
          active: r[3] !== 'N',
          pw: String(r[4] || ''),
          permissions: jp<UserPermissions>(r[5], fallbackPerms),
        };
      })
    : [
        {
          username: 'admin',
          name: 'ผู้ดูแลระบบ',
          role: 'admin',
          active: true,
          pw: '1939',
          permissions: ADMIN_PERMISSIONS,
        },
      ];

  const receipts: ReceiptControlEntry[] = rowsAt(13).map((r) => ({
    id: String(r[0]),
    fy: Number(r[1]) || 2569,
    bookNo: String(r[2] || ''),
    receiptNo: String(r[3] || ''),
    date: String(r[4] || ''),
    desc: String(r[5] || ''),
    payer: String(r[6] || ''),
    amount: numRound(r[7]),
    collector: String(r[8] || ''),
    cancelled: r[9] === 'Y',
  }));

  const receiptReqs: ReceiptRequisition[] = rowsAt(14).map((r) => ({
    id: String(r[0]),
    date: String(r[1] || ''),
    bookType: String(r[2] || '50 แผ่น'),
    qtyRequested: Number(r[3]) || 1,
    qtyIssued: Number(r[4]) || 1,
    rangeNote: String(r[5] || ''),
    requester: String(r[6] || ''),
    approver: String(r[7] || ''),
  }));

  const directorEval: DirectorEvalIndicator[] = rowsAt(15).map((r) => ({
    id: String(r[0]),
    aspect: String(r[1] || ''),
    indicator: String(r[2] || ''),
    target: String(r[3] || ''),
    result: String(r[4] || ''),
    score: Number(r[5]) || 5,
    weight: Number(r[6]) || 25,
    evidence: String(r[7] || ''),
  }));

  const pdfArchive: PdfArchiveRecord[] = rowsAt(16).map((r) => ({
    id: String(r[0]),
    fy: Number(r[1]) || 2569,
    reportKey: String(r[2] || ''),
    reportTitle: String(r[3] || ''),
    fileName: String(r[4] || ''),
    driveUrl: String(r[5] || ''),
    createdAt: String(r[6] || ''),
    createdBy: String(r[7] || ''),
  }));

  const part1Survey = settingsMap.part1Survey
    ? jp<Part1SchoolSurvey | undefined>(settingsMap.part1Survey, undefined)
    : undefined;

  return {
    funds,
    transactions,
    settings,
    assets,
    allocDocs,
    loans,
    loanRets,
    reports,
    plans,
    requests,
    subsidies,
    banks,
    users,
    receipts,
    receiptReqs,
    directorEval,
    pdfArchive,
    part1Survey,
  };
}

export async function syncSnapshotToGoogleSheets(
  spreadsheetId: string,
  token: string,
  snap: SheetDatabaseSnapshot
) {
  await ensureSpreadsheetStructure(spreadsheetId, token);

  const settingsRows: any[][] = [
    ['key', 'value'],
    ['schoolName', snap.settings.schoolName],
    ['affiliation', snap.settings.affiliation],
    ['district', snap.settings.district || ''],
    ['province', snap.settings.province || ''],
    ['schoolCode', snap.settings.schoolCode || ''],
    ['schoolSize', snap.settings.schoolSize],
    ['director', snap.settings.director],
    ['financeName', snap.settings.financeName],
    ['driveFolderId', snap.settings.driveFolderId || ''],
  ];

  if (snap.settings.sentMarkers) {
    Object.entries(snap.settings.sentMarkers).forEach(([k, v]) => {
      if (v) settingsRows.push(['sent_' + k, v]);
    });
  }
  if (snap.part1Survey) {
    settingsRows.push(['part1Survey', JSON.stringify(snap.part1Survey)]);
  }

  await Promise.all([
    writeSheetRows(
      spreadsheetId,
      'FIN_FundTypes',
      [['id', 'name', 'group', 'color'], ...snap.funds.map((f) => [f.id, f.name, f.group, f.color])],
      token
    ),
    writeSheetRows(
      spreadsheetId,
      'FIN_Transactions',
      [
        ['id', 'date', 'fy', 'fund', 'doc', 'desc', 'rec', 'pay', 'loc', 'kind', 'by', 'bank', 'refLink'],
        ...snap.transactions.map((t) => [
          t.id,
          t.date,
          t.fy,
          t.fund,
          t.doc,
          t.desc,
          t.rec,
          t.pay,
          t.loc,
          t.kind,
          t.by,
          t.bank,
          t.refLink || '',
        ]),
      ],
      token
    ),
    writeSheetRows(spreadsheetId, 'FIN_Settings', settingsRows, token),
    writeSheetRows(
      spreadsheetId,
      'FIN_Assets',
      [
        ['key', 'dataUrl'],
        ...(snap.assets.logo ? [['logo', snap.assets.logo]] : []),
        ...(snap.assets.sigDirector ? [['sigDirector', snap.assets.sigDirector]] : []),
        ...(snap.assets.sigFinance ? [['sigFinance', snap.assets.sigFinance]] : []),
      ],
      token
    ),
    writeSheetRows(
      spreadsheetId,
      'FIN_Alloc',
      [
        ['fy', 'json', 'by', 'date'],
        ...Object.entries(snap.allocDocs).map(([fy, doc]) => [
          Number(fy),
          JSON.stringify(doc),
          'system',
          todayISO(),
        ]),
      ],
      token
    ),
    writeSheetRows(
      spreadsheetId,
      'FIN_Loans',
      [
        ['id', 'no', 'date', 'fy', 'fund', 'borrower', 'purpose', 'amount', 'due', 'txId', 'by'],
        ...snap.loans.map((l) => [
          l.id,
          l.no,
          l.date,
          l.fy,
          l.fund,
          l.borrower,
          l.purpose,
          l.amount,
          l.due,
          l.txId,
          l.by,
        ]),
      ],
      token
    ),
    writeSheetRows(
      spreadsheetId,
      'FIN_LoanRets',
      [
        ['id', 'loan', 'date', 'fy', 'fund', 'voucherNo', 'voucher', 'cashNo', 'cash', 'loc', 'bank', 'txId', 'by'],
        ...snap.loanRets.map((r) => [
          r.id,
          r.loan,
          r.date,
          r.fy,
          r.fund,
          r.voucherNo,
          r.voucher,
          r.cashNo,
          r.cash,
          r.loc,
          r.bank,
          r.txId,
          r.by,
        ]),
      ],
      token
    ),
    writeSheetRows(
      spreadsheetId,
      'FIN_Reports',
      [
        ['id', 'fy', 'plan', 'project', 'dept', 'approved', 'spent', 'summary', 'issues', 'status', 'reporter', 'date', 'by', 'files'],
        ...snap.reports.map((r) => [
          r.id,
          r.fy,
          r.plan,
          r.project,
          r.dept,
          r.approved,
          r.spent,
          r.summary,
          r.issues,
          r.status,
          r.reporter,
          r.date,
          r.by,
          JSON.stringify(r.files || []),
        ]),
      ],
      token
    ),
    writeSheetRows(
      spreadsheetId,
      'FIN_Plans',
      [
        ['id', 'fy', 'fund', 'dept', 'project', 'amount', 'note'],
        ...snap.plans.map((p) => [p.id, p.fy, p.fund, p.dept, p.project, p.amount, p.note]),
      ],
      token
    ),
    writeSheetRows(
      spreadsheetId,
      'FIN_Requests',
      [
        ['id', 'date', 'fy', 'plan', 'fund', 'dept', 'project', 'item', 'amount', 'person', 'status', 'refLink', 'txId', 'by'],
        ...snap.requests.map((r) => [
          r.id,
          r.date,
          r.fy,
          r.plan,
          r.fund,
          r.dept,
          r.project,
          r.item,
          r.amount,
          r.person,
          r.status,
          r.refLink,
          r.txId,
          r.by,
        ]),
      ],
      token
    ),
    writeSheetRows(
      spreadsheetId,
      'FIN_Subsidy',
      [
        ['id', 'fy', 'level', 'count', 'small', 'total', 'by', 'date', 'grades', 'rates', 'amounts'],
        ...snap.subsidies.map((s) => [
          s.id,
          s.fy,
          s.level,
          s.count,
          s.small ? 'Y' : 'N',
          s.total,
          s.by,
          s.date,
          JSON.stringify(s.grades),
          JSON.stringify(s.rates),
          JSON.stringify(s.amounts),
        ]),
      ],
      token
    ),
    writeSheetRows(
      spreadsheetId,
      'FIN_Banks',
      [
        ['id', 'bank', 'accountNo', 'accountName', 'note', 'active'],
        ...snap.banks.map((b) => [b.id, b.bank, b.accountNo, b.accountName, b.note, b.active ? 'Y' : 'N']),
      ],
      token
    ),
    writeSheetRows(
      spreadsheetId,
      'FIN_Users',
      [
        ['username', 'name', 'role', 'active', 'pw', 'permissionsJson'],
        ...snap.users.map((u) => [
          u.username,
          u.name,
          u.role,
          u.active ? 'Y' : 'N',
          u.pw,
          JSON.stringify(u.permissions),
        ]),
      ],
      token
    ),
    writeSheetRows(
      spreadsheetId,
      'FIN_Receipts',
      [
        ['id', 'fy', 'bookNo', 'receiptNo', 'date', 'desc', 'payer', 'amount', 'collector', 'cancelled'],
        ...snap.receipts.map((r) => [
          r.id,
          r.fy,
          r.bookNo,
          r.receiptNo,
          r.date,
          r.desc,
          r.payer,
          r.amount,
          r.collector,
          r.cancelled ? 'Y' : 'N',
        ]),
      ],
      token
    ),
    writeSheetRows(
      spreadsheetId,
      'FIN_ReceiptReq',
      [
        ['id', 'date', 'bookType', 'qtyRequested', 'qtyIssued', 'rangeNote', 'requester', 'approver'],
        ...snap.receiptReqs.map((r) => [
          r.id,
          r.date,
          r.bookType,
          r.qtyRequested,
          r.qtyIssued,
          r.rangeNote,
          r.requester,
          r.approver,
        ]),
      ],
      token
    ),
    writeSheetRows(
      spreadsheetId,
      'FIN_DirectorEval',
      [
        ['id', 'aspect', 'indicator', 'target', 'result', 'score', 'weight', 'evidence'],
        ...snap.directorEval.map((d) => [
          d.id,
          d.aspect,
          d.indicator,
          d.target,
          d.result,
          d.score,
          d.weight,
          d.evidence,
        ]),
      ],
      token
    ),
    writeSheetRows(
      spreadsheetId,
      'คลังเอกสาร_PDF',
      [
        ['รหัส', 'ปีงบประมาณ', 'รหัสรายงาน', 'ชื่อเอกสารรายงาน', 'ชื่อไฟล์ PDF', 'ลิงก์ Google Drive', 'วันที่สร้าง', 'ผู้จัดทำ'],
        ...snap.pdfArchive.map((p) => [
          p.id,
          p.fy,
          p.reportKey,
          p.reportTitle,
          p.fileName,
          p.driveUrl || '',
          p.createdAt,
          p.createdBy,
        ]),
      ],
      token
    ),
  ]);
}

/* ---------- Google Drive Folder & File Operations ---------- */

export function extractDriveId(input: string): string {
  const m = String(input || '').match(/[-\w]{25,}/);
  return m ? m[0] : '';
}

export async function getDriveFolderName(folderId: string, token: string): Promise<string> {
  const id = extractDriveId(folderId);
  if (!id) throw new Error('รูปแบบ Folder ID ไม่ถูกต้อง');
  const res = await fetch(`${DRIVE_BASE}/files/${encodeURIComponent(id)}?fields=id,name,mimeType`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.message || 'เปิดโฟลเดอร์ Google Drive ไม่ได้ กรุณาตรวจสอบสิทธิ์หรือรหัสโฟลเดอร์');
  }
  return data.name as string;
}

export async function createDriveRootFolder(name: string, token: string): Promise<{ id: string; name: string }> {
  const res = await fetch(`${DRIVE_BASE}/files?fields=id,name`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || 'สร้างโฟลเดอร์ Google Drive ไม่สำเร็จ');
  return { id: data.id, name: data.name };
}

async function getOrCreateFySubfolder(rootFolderId: string, fy: number, token: string): Promise<string> {
  const subName = `ปีงบประมาณ ${fy}`;
  const q = encodeURIComponent(
    `'${rootFolderId}' in parents and name='${subName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );
  const searchRes = await fetch(`${DRIVE_BASE}/files?q=${q}&fields=files(id,name)`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const searchData = await searchRes.json().catch(() => ({}));
  if (searchRes.ok && searchData.files?.length > 0) {
    return searchData.files[0].id as string;
  }

  const createRes = await fetch(`${DRIVE_BASE}/files?fields=id,name`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: subName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [rootFolderId],
    }),
  });
  const created = await createRes.json().catch(() => ({}));
  if (!createRes.ok) throw new Error(created?.error?.message || 'สร้างโฟลเดอร์ย่อยปีงบประมาณไม่สำเร็จ');
  return created.id as string;
}

export async function uploadFileToDriveFolder(
  rootFolderId: string,
  fy: number,
  fileName: string,
  blob: Blob,
  mimeType: string,
  token: string
): Promise<{ id: string; name: string; webViewLink: string }> {
  const cleanId = extractDriveId(rootFolderId);
  if (!cleanId) throw new Error('ยังไม่ได้ตั้งค่า Folder ID ในเมนูตั้งค่าระบบ > ที่เก็บข้อมูล');

  const parentId = await getOrCreateFySubfolder(cleanId, fy, token);
  const metadata = {
    name: fileName,
    parents: [parentId],
    mimeType,
  };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', blob, fileName);

  const res = await fetch(`${DRIVE_UPLOAD}&fields=id,name,webViewLink`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || 'อัปโหลดไฟล์ไปยัง Google Drive ไม่สำเร็จ');
  return {
    id: data.id,
    name: data.name,
    webViewLink: data.webViewLink || `https://drive.google.com/file/d/${data.id}/view`,
  };
}

export async function deleteDriveFile(fileId: string, token: string) {
  const res = await fetch(`${DRIVE_BASE}/files/${encodeURIComponent(fileId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 404) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error?.message || 'ลบไฟล์จาก Google Drive ไม่สำเร็จ');
  }
}
