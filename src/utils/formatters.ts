import Swal from 'sweetalert2';

export const TH_MONTHS = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
];

export const FY_MONTH_LABELS = [
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.',
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
];

export function todayISO(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export function addDaysISO(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export function fyOf(dateStr: string): number {
  const y = Number(dateStr.slice(0, 4)) || new Date().getFullYear();
  const m = Number(dateStr.slice(5, 7)) || new Date().getMonth() + 1;
  return (m >= 10 ? y + 1 : y) + 543;
}

export function thDate(dateStr?: string): string {
  if (!dateStr) return '-';
  const m = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    return `${Number(m[3])} ${TH_MONTHS[Number(m[2]) - 1]} ${Number(m[1]) + 543}`;
  }
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return `${d.getDate()} ${TH_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`;
}

export function thDateShort(dateStr?: string): string {
  if (!dateStr) return '-';
  const m = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return dateStr;
  const shortMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  return `${Number(m[3])} ${shortMonths[Number(m[2]) - 1]} ${String(Number(m[1]) + 543).slice(-2)}`;
}

export function thMonth(ym: string): string {
  const m = String(ym).match(/^(\d{4})-(\d{2})/);
  if (!m) return ym;
  return `${TH_MONTHS[Number(m[2]) - 1]} ${Number(m[1]) + 543}`;
}

export function fmt(n: number | undefined | null): string {
  return (Number(n) || 0).toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function f0(n: number | undefined | null): string {
  const num = Number(n) || 0;
  return Number.isInteger(num) ? num.toLocaleString('th-TH') : fmt(num);
}

export function numRound(v: unknown): number {
  return Math.round((Number(v) || 0) * 100) / 100;
}

export function thaiBaht(n: number): string {
  n = Math.round((Number(n) || 0) * 100) / 100;
  if (!n) return 'ศูนย์บาทถ้วน';
  const D = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
  const U = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];

  const six = (s: string, more: boolean) => {
    s = s.padStart(6, '0');
    let o = '';
    for (let i = 0; i < 6; i++) {
      const d = Number(s[i]);
      const p = 5 - i;
      if (!d) continue;
      if (p === 1 && d === 1) o += 'สิบ';
      else if (p === 1 && d === 2) o += 'ยี่สิบ';
      else if (p === 0 && d === 1 && (more || Number(s.slice(0, 5)) > 0)) o += 'เอ็ด';
      else o += D[d] + U[p];
    }
    return o;
  };

  const intTxt = (s: string): string => {
    s = s.replace(/^0+/, '');
    if (!s) return '';
    if (s.length <= 6) return six(s, false);
    const tail = s.slice(-6);
    return intTxt(s.slice(0, -6)) + 'ล้าน' + (Number(tail) ? six(tail, true) : '');
  };

  const b = Math.floor(n);
  const st = Math.round((n - b) * 100);
  return (b ? intTxt(String(b)) + 'บาท' : '') + (st ? six(String(st), false) + 'สตางค์' : 'ถ้วน');
}

export function escHtml(s: unknown): string {
  return String(s ?? '').replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] || c)
  );
}

export function toastSuccess(title: string, text?: string) {
  return Swal.fire({
    toast: true,
    position: 'bottom-end',
    icon: 'success',
    title,
    text,
    showConfirmButton: false,
    timer: 2800,
    timerProgressBar: true,
  });
}

export function alertError(message: string, title = 'ไม่สามารถดำเนินการได้') {
  return Swal.fire({
    icon: 'error',
    title,
    text: message,
    confirmButtonText: 'ตกลง',
    confirmButtonColor: '#14306b',
  });
}

export function alertInfo(title: string, text?: string) {
  return Swal.fire({
    icon: 'info',
    title,
    text,
    confirmButtonText: 'ตกลง',
    confirmButtonColor: '#14306b',
  });
}

export async function confirmAction(
  title: string,
  text: string,
  confirmButtonText = 'ยืนยัน',
  isDanger = false
): Promise<boolean> {
  const res = await Swal.fire({
    icon: isDanger ? 'warning' : 'question',
    title,
    text,
    showCancelButton: true,
    confirmButtonText,
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: isDanger ? '#dc2626' : '#14306b',
    cancelButtonColor: '#64748b',
    reverseButtons: true,
  });
  return res.isConfirmed;
}

export type DocDirection = 'pay' | 'rec' | 'loan' | 'unknown';

export const DOC_PREFIX_OPTIONS = [
  { value: 'บจ', label: 'บจ — ใบเสร็จเจ้าหนี้ (จ่าย)', direction: 'pay' as const },
  { value: 'บค', label: 'บค — ใบสำคัญรับเงิน (จ่าย)', direction: 'pay' as const },
  { value: 'บคล', label: 'บคล — บันทึกการจ่าย (จ่าย)', direction: 'pay' as const },
  { value: 'บก', label: 'บก — ใบรับรองแทนใบเสร็จ (จ่าย)', direction: 'pay' as const },
  { value: 'บร', label: 'บร — ใบเสร็จรับเงิน (รับ)', direction: 'rec' as const },
];

/**
 * สกัดคำนำหน้าเอกสารทางบัญชีสถานศึกษา โดยเรียงลำดับ "บคล" ก่อน "บค" เพื่อป้องกันการจับผิดเป็น บค
 */
export function extractDocPrefix(doc?: string): string {
  const s = String(doc || '').trim();
  if (!s) return '';
  if (/^บันทึกการจ่าย/.test(s)) return 'บคล';
  const m = s.match(/^(บคล|บค|บจ|บก|บร|บย|ขบ)(?=$|[\s./\-\d])/);
  if (m) return m[1];
  if (/^(?:แบบ\s*)?4231(?=$|[\s./\-\d])/.test(s)) return '4231';
  return '';
}

/**
 * จำแนกทิศทางบัญชีของเอกสาร:
 * - pay: บคล (บันทึกการจ่าย), บค (ใบสำคัญรับเงิน), บจ (ใบเสร็จเจ้าหนี้), บก (ใบรับรองแทนใบเสร็จ)
 * - rec: บร (ใบเสร็จรับเงิน), ขบ, แบบ 4231
 * - loan: บย (สัญญายืมเงิน)
 */
export function classifyDocDirection(doc?: string): DocDirection {
  const pre = extractDocPrefix(doc);
  if (pre === 'บคล' || pre === 'บค' || pre === 'บจ' || pre === 'บก') return 'pay';
  if (pre === 'บร' || pre === 'ขบ' || pre === '4231') return 'rec';
  if (pre === 'บย') return 'loan';
  return 'unknown';
}

/**
 * ปรับรายการบัญชีให้ถูกต้องตามหลักบัญชีสถานศึกษา:
 * หากรายการปกติ (normal) ใช้เอกสารด้านจ่าย โดยเฉพาะ "บคล" (บันทึกการจ่าย), บค, บจ, บก
 * แต่มียอดบันทึกค้างอยู่ในช่องรายรับ (rec > 0 && pay === 0) ให้ย้ายไปลงช่องรายจ่าย (pay) ทันที
 */
export function normalizeTransactionAccounting<
  T extends { doc: string; kind: string; rec: number; pay: number }
>(tx: T): T {
  const rec = numRound(tx.rec);
  const pay = numRound(tx.pay);
  if (tx.kind === 'open' || tx.kind === 'loanret') {
    return rec === tx.rec && pay === tx.pay ? tx : { ...tx, rec, pay };
  }
  const dir = classifyDocDirection(tx.doc);
  if ((dir === 'pay' || tx.kind === 'loan') && rec > 0 && pay === 0) {
    return { ...tx, rec: 0, pay: rec };
  }
  return rec === tx.rec && pay === tx.pay ? tx : { ...tx, rec, pay };
}

