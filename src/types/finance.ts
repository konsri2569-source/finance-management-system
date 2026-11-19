export interface FundType {
  id: string;
  name: string;
  group: string;
  color: string;
}

export interface Transaction {
  id: string;
  date: string; // yyyy-MM-dd
  fy: number; // Thai Buddhist fiscal year e.g. 2569
  fund: string;
  doc: string;
  desc: string;
  rec: number;
  pay: number;
  loc: 'cash' | 'bank' | 'depo';
  kind: 'normal' | 'open' | 'loan' | 'loanret';
  by: string;
  bank: string;
  refLink?: string;
}

export interface SchoolSettings {
  schoolName: string;
  affiliation: string;
  district?: string;
  province?: string;
  schoolCode?: string;
  schoolSize: 'small' | 'large';
  director: string;
  financeName: string;
  driveFolderId?: string;
  sentMarkers?: Record<string, string>;
}

export interface SchoolAssets {
  logo?: string;
  sigDirector?: string;
  sigFinance?: string;
}

export interface BankAccount {
  id: string;
  bank: string;
  accountNo: string;
  accountName: string;
  note: string;
  active: boolean;
}

export interface UserPermissions {
  menus: Array<'dash' | 'plan' | 'fin' | 'docs' | 'eval' | 'set'>;
  canAdd: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canApprove: boolean;
  canViewReport: boolean;
}

export interface AppUser {
  username: string;
  name: string;
  role: 'admin' | 'staff';
  active: boolean;
  pw: string;
  permissions: UserPermissions;
}

export interface BudgetPlan {
  id: string;
  fy: number;
  fund: string;
  dept: string;
  project: string;
  amount: number;
  note: string;
}

export interface BudgetRequest {
  id: string;
  date: string;
  fy: number;
  plan: string;
  fund: string;
  dept: string;
  project: string;
  item: string;
  amount: number;
  person: string;
  status: 'รออนุมัติ' | 'อนุมัติแล้ว' | 'จ่ายเงินแล้ว' | 'ไม่อนุมัติ';
  refLink: string;
  txId: string;
  by: string;
}

export interface ReportFile {
  id: string;
  name: string;
  url: string;
  type: 'PDF' | 'Word';
  by: string;
  date: string;
}

export interface ProjectReport {
  id: string;
  fy: number;
  plan: string;
  project: string;
  dept: string;
  approved: number;
  spent: number;
  summary: string;
  issues: string;
  status: 'เสร็จสิ้นตามแผน' | 'อยู่ระหว่างดำเนินการ' | 'ยกเลิก/ปรับเปลี่ยน';
  reporter: string;
  date: string;
  by: string;
  files: ReportFile[];
}

export interface Loan {
  id: string;
  no: string;
  date: string;
  fy: number;
  fund: string;
  borrower: string;
  purpose: string;
  amount: number;
  due: string;
  txId: string;
  by: string;
}

export interface LoanReturn {
  id: string;
  loan: string;
  date: string;
  fy: number;
  fund: string;
  voucherNo: string;
  voucher: number;
  cashNo: string;
  cash: number;
  loc: 'cash' | 'bank' | 'depo' | '';
  bank: string;
  txId: string;
  by: string;
}

export type LevelKey = 'kindergarten' | 'primary' | 'secondary_low' | 'secondary_high';

export interface GradeEntry {
  name: string;
  m: number;
  f: number;
  count: number;
  rate: number;
}

export interface SubsidyRecord {
  id: string;
  fy: number;
  level: LevelKey;
  count: number;
  small: boolean;
  total: number;
  by: string;
  date: string;
  grades: GradeEntry[];
  rates: Record<string, number>;
  amounts: Record<string, number>;
}

export interface BudgetDoc {
  calcs?: Record<
    string,
    {
      count: number;
      small: boolean;
      teaching: number;
      book: number;
      tools: number;
      uniform: number;
      activity: number;
      smallBonus: number;
      total: number;
      grades: GradeEntry[];
    }
  >;
  pct?: { acad: number; gen: number; res: number };
  gen?: { bud: number; hr: number; gen: number; stu: number };
  act?: Array<[string, number]>;
  lunch?: { n: number; rate: number; days: number };
  poor?: number;
  headFund?: string;
  planConfirm?: { by: string; date: string; total: number; expected: number };
}

export interface ReceiptControlEntry {
  id: string;
  fy: number;
  bookNo: string;
  receiptNo: string;
  date: string;
  desc: string;
  payer: string;
  amount: number;
  collector: string;
  cancelled?: boolean;
}

export interface ReceiptRequisition {
  id: string;
  date: string;
  bookType: string;
  qtyRequested: number;
  qtyIssued: number;
  rangeNote: string;
  requester: string;
  approver: string;
}

export interface Part1SchoolSurvey {
  fy: number;
  round1SurveyDate: string;
  round2SurveyDate: string;
  hasAccountingRoom: [string, string];
  hasSafeBox: [string, string];
  hasFinanceSign: [string, string];
  staffCounts: Array<{
    no: number;
    position: string;
    round1: number;
    round2: number;
  }>;
}

export interface DirectorEvalIndicator {
  id: string;
  aspect: string;
  indicator: string;
  target: string;
  result: string;
  score: number; // 1-5
  weight: number; // %
  evidence: string;
}

export interface PdfArchiveRecord {
  id: string;
  fy: number;
  reportKey: string;
  reportTitle: string;
  fileName: string;
  driveFileId?: string;
  driveUrl?: string;
  createdAt: string;
  createdBy: string;
}

export const DEFAULT_SHEET_ID = '1xJu3uZTE7tvttJxSJ0lULyuKDZ1UYmHuaNNhMGrreHE';

export const FUNDS: FundType[] = [
  { id: 'F01', name: 'เงินโครงการอาหารกลางวันในโรงเรียน', group: 'เงินอุดหนุน', color: '#2563eb' },
  { id: 'F02', name: 'เงินอุดหนุนค่าใช้จ่ายรายหัวก่อนประถม', group: 'เงินอุดหนุน', color: '#7c3aed' },
  { id: 'F03', name: 'เงินอุดหนุนค่าใช้จ่ายรายหัวประถม', group: 'เงินอุดหนุน', color: '#9333ea' },
  { id: 'F15', name: 'เงินอุดหนุนค่าใช้จ่ายรายหัวก่อนประถมและประถมศึกษา', group: 'เงินอุดหนุน', color: '#8b5cf6' },
  { id: 'F04', name: 'เงินอุดหนุนปัจจัยพื้นฐานนักเรียนยากจน', group: 'เงินอุดหนุน', color: '#c026d3' },
  { id: 'F05', name: 'เงินอุดหนุนค่าเครื่องแบบนักเรียน', group: 'เงินอุดหนุน', color: '#0891b2' },
  { id: 'F06', name: 'เงินอุดหนุนอุปกรณ์การเรียน', group: 'เงินอุดหนุน', color: '#059669' },
  { id: 'F07', name: 'เงินอุดหนุนค่าหนังสือแบบเรียน', group: 'เงินอุดหนุน', color: '#65a30d' },
  { id: 'F08', name: 'เงินค่ากิจกรรมพัฒนาผู้เรียน', group: 'เงินอุดหนุน', color: '#ea580c' },
  { id: 'F09', name: 'เงินอุดหนุนอื่น ๆ', group: 'เงินอุดหนุน', color: '#64748b' },
  { id: 'F10', name: 'เงินรายได้สถานศึกษา', group: 'เงินรายได้', color: '#dc2626' },
  { id: 'F11', name: 'เงินรายได้แผ่นดิน', group: 'เงินรายได้', color: '#e11d48' },
  { id: 'F12', name: 'เงินประกันสัญญา', group: 'เงินประกัน/ภาษี', color: '#475569' },
  { id: 'F13', name: 'เงินภาษีหัก ณ ที่จ่าย', group: 'เงินประกัน/ภาษี', color: '#78716c' },
  { id: 'F14', name: 'เงินอื่น ๆ', group: 'อื่น ๆ', color: '#94a3b8' },
];

export const LOAN_PURPOSES = [
  'ค่าจ้างชั่วคราว',
  'ค่าตอบแทนใช้สอยและวัสดุ',
  'ค่าสาธารณูปโภค',
  'อาหารกลางวัน',
];

export const LEVEL_NAMES: Record<LevelKey, string> = {
  kindergarten: 'ก่อนประถมศึกษา',
  primary: 'ประถมศึกษา',
  secondary_low: 'มัธยมศึกษาตอนต้น',
  secondary_high: 'มัธยมศึกษาตอนปลาย',
};

export const RATES: Record<LevelKey, Record<string, number>> = {
  kindergarten: { teaching: 2040, tools: 290, uniform: 325, activity: 570 },
  primary: { teaching: 2280, tools: 440, uniform: 400, activity: 630 },
  secondary_low: { teaching: 3570, book: 1400, tools: 420, uniform: 450, activity: 880 },
  secondary_high: { teaching: 3876, book: 1530, tools: 460, uniform: 500, activity: 950 },
};

export const GRADES: Record<LevelKey, Array<[string, number]>> = {
  kindergarten: [
    ['อนุบาล 1', 200],
    ['อนุบาล 2', 200],
    ['อนุบาล 3', 200],
  ],
  primary: [
    ['ป.1', 656],
    ['ป.2', 650],
    ['ป.3', 653],
    ['ป.4', 707],
    ['ป.5', 846],
    ['ป.6', 859],
  ],
  secondary_low: [
    ['ม.1', 808],
    ['ม.2', 921],
    ['ม.3', 996],
  ],
  secondary_high: [
    ['ม.4', 1384],
    ['ม.5', 1326],
    ['ม.6', 1164],
  ],
};

export const RATE_LABELS: Record<string, string> = {
  teaching: 'ค่าจัดการเรียนการสอน',
  book: 'ค่าหนังสือเรียน',
  tools: 'ค่าอุปกรณ์การเรียน',
  uniform: 'ค่าเครื่องแบบนักเรียน',
  activity: 'กิจกรรมพัฒนาคุณภาพผู้เรียน',
  small: 'เงินเพิ่ม รร. ขนาดเล็ก',
};

export const DEF_ACT = [
  'ทักษะวิชาการ',
  'แนะแนว',
  'ลูกเสือ-เนตรนารี',
  'กิจกรรมคุณธรรม',
  'ทัศนศึกษา',
  'กิจกรรมสาธารณประโยชน์',
];

export const DEPARTMENTS = [
  'กลุ่มบริหารวิชาการ',
  'กลุ่มบริหารงบประมาณ',
  'กลุ่มบริหารงานบุคคล',
  'กลุ่มบริหารทั่วไป',
  'กลุ่มบริหารกิจการนักเรียน',
  'ส่วนกลาง',
];

export const DEFAULT_STAFF_POSITIONS_PART1 = [
  'ผู้อำนวยการโรงเรียน',
  'รองผู้อำนวยการโรงเรียน',
  'ครู',
  'ข้าราชการครู (ช่วยราชการ)',
  'ลูกจ้างประจำ (เงินงบประมาณ)',
  'ลูกจ้างชั่วคราว (เงินงบประมาณ/เงินอื่น)',
  'พนักงานราชการ (ครู)',
  'พนักงานราชการ (นอกเหนือจากครู)',
  'ธุรการโครงการคืนครูให้นักเรียน',
  'บุคลากรทางการศึกษา 38 ค.(2)',
  'นักการภารโรง',
  'พนักงานขับรถ',
  'ลูกจ้างชั่วคราว ตำแหน่ง ช่างไม้ ช่างครุภัณฑ์ ช่างอื่นๆ',
  'เจ้าหน้าที่ประจำห้องปฏิบัติการ',
  'พี่เลี้ยงเด็กพิการ',
  'อื่นๆ นอกเหนือจากรายการ 1-15 (บรรณารักษ์, พยาบาล, แม่บ้าน, แม่ครัว, รักษาความปลอดภัย, คนสวน ฯลฯ)',
];

export const DEFAULT_DIRECTOR_INDICATORS: DirectorEvalIndicator[] = [
  {
    id: 'PA1',
    aspect: 'ด้านการบริหารจัดการสถานศึกษา (การเงินและงบประมาณ)',
    indicator: '1. การวางแผนและจัดสรรงบประมาณตามแผนปฏิบัติการประจำปี (สอดคล้องกับเงินอุดหนุนรายหัวและนโยบายเรียนฟรี 15 ปี)',
    target: 'ร้อยละ 100 ของเงินอุดหนุนจัดสรรลงแผนปฏิบัติการถูกต้องและตรวจสอบตรงกัน',
    result: 'ดำเนินการคำนวณ จัดสรร และตรวจสอบงบโครงการตรงตามคู่มือ',
    score: 5,
    weight: 25,
    evidence: 'เอกสารจัดสรรงบประมาณประจำปี และตารางตรวจสอบงบจัดสรรกับโครงการ',
  },
  {
    id: 'PA2',
    aspect: 'ด้านการบริหารการเงินและควบคุมภายใน (ระเบียบ พ.ศ. 2544)',
    indicator: '2. การจัดทำรายงานเงินคงเหลือประจำวัน ทะเบียนคุมเงินนอกงบประมาณ และทะเบียนคุมใบสำคัญคู่จ่าย (บจ/บค)',
    target: 'จัดทำครบถ้วนทุกวันที่มีการรับ-จ่าย เงินสดคงเหลือไม่เกินวงเงินเก็บรักษา',
    result: 'บันทึกทะเบียนคุมและตรวจนับเงินสดประจำวันเป็นปัจจุบัน ถูกต้องตามระเบียบ',
    score: 5,
    weight: 25,
    evidence: 'รายงานเงินคงเหลือประจำวัน สมุดเงินสด ทะเบียนคุมเงินนอกงบประมาณ',
  },
  {
    id: 'PA3',
    aspect: 'ด้านความโปร่งใสและการส่งรายงานต่อต้นสังกัด',
    indicator: '3. การส่งรายงานการเงินประจำเดือน/ภาคเรียน/สิ้นปี และรายงานการเงินส่วนที่ 1-5 ต่อ สพป. และคณะกรรมการสถานศึกษา',
    target: 'ส่งรายงานตรงตามปฏิทินกำหนดการ ร้อยละ 100 ไม่มียอดลูกหนี้เงินยืมค้างเกินกำหนด',
    result: 'จัดส่งรายงานตามกำหนดและติดตามการส่งใช้เงินยืมอย่างต่อเนื่อง',
    score: 4,
    weight: 25,
    evidence: 'ปฏิทินส่งรายงาน หนังสือนำส่งรายได้แผ่นดิน รายงานส่วนที่ 1-5',
  },
  {
    id: 'PA4',
    aspect: 'ด้านผลสัมฤทธิ์การใช้จ่ายงบประมาณและโครงการ',
    indicator: '4. ประสิทธิภาพการเบิกจ่ายงบประมาณตามแผนปฏิบัติการเพื่อพัฒนาคุณภาพผู้เรียนและสถานศึกษา',
    target: 'อัตราการเบิกจ่ายงบประมาณตามแผนไม่น้อยกว่าร้อยละ 80 และมีรายงานผลโครงการครบถ้วน',
    result: 'ดำเนินโครงการและจัดทำรายงานสรุปผลโครงการพร้อมเอกสารหลักฐานครบถ้วน',
    score: 4,
    weight: 25,
    evidence: 'สรุปรายงานผลโครงการ (PDF/Word) และฐานข้อมูล Google Sheets',
  },
];

export const ADMIN_PERMISSIONS: UserPermissions = {
  menus: ['dash', 'plan', 'fin', 'docs', 'eval', 'set'],
  canAdd: true,
  canEdit: true,
  canDelete: true,
  canApprove: true,
  canViewReport: true,
};

export const DEFAULT_STAFF_PERMISSIONS: UserPermissions = {
  menus: ['dash', 'plan', 'fin', 'docs', 'eval'],
  canAdd: true,
  canEdit: false,
  canDelete: false,
  canApprove: false,
  canViewReport: true,
};
