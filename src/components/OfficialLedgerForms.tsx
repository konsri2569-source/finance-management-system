import React from 'react';
import {
  BudgetPlan,
  BudgetRequest,
  FundType,
  ReceiptControlEntry,
  ReceiptRequisition,
  SchoolSettings,
  Transaction,
} from '../types/finance';
import {
  fmt,
  normalizeTransactionAccounting,
  numRound,
  TH_MONTHS,
  thDate,
  thMonth,
} from '../utils/formatters';

/* -------------------------------------------------------------------------- */
/* 1. Daily Balance Official Form (ตามเอกสาร 1 — A4 แนวตั้ง)                  */
/* -------------------------------------------------------------------------- */
export interface DailyReportData {
  date: string;
  rows: Array<{ id: string; name: string; cash: number; bank: number; depo: number }>;
  school: string;
  affiliation: string;
  district?: string;
  province?: string;
  director: string;
  financeName: string;
  logo?: string;
  sigDirector?: string;
  sigFinance?: string;
  banks: Array<{ id: string; bank: string; accountNo: string; accountName: string; bal: number }>;
  unassigned: number;
  limit: number;
  incomeCash: number;
  overLimit: boolean;
  hasMove: boolean;
  loans: Array<{ no: string; borrower: string; fund: string; out: number; due: string }>;
}

type BucketTriple = { cash: number; bank: number; depo: number };

const zeroTriple = (): BucketTriple => ({ cash: 0, bank: 0, depo: 0 });

const addTriple = (a: BucketTriple, b: BucketTriple): BucketTriple => ({
  cash: numRound(a.cash + b.cash),
  bank: numRound(a.bank + b.bank),
  depo: numRound(a.depo + b.depo),
});

export const DailyBalanceOfficialForm: React.FC<{
  daily: DailyReportData;
  transactions?: Transaction[];
  committeeNames?: [string, string, string];
  showSignatures?: boolean;
}> = ({ daily, transactions = [], committeeNames, showSignatures = true }) => {
  const normTxs = transactions
    .filter((t) => t.date <= daily.date)
    .map((t) => normalizeTransactionAccounting(t));

  // Helper to get balance triple for a fund from daily.rows
  const rowMap: Record<string, BucketTriple> = {};
  daily.rows.forEach((r) => {
    rowMap[r.id] = { cash: r.cash, bank: r.bank, depo: r.depo };
  });
  const getRow = (id: string): BucketTriple => rowMap[id] || zeroTriple();

  // Split F11 (เงินรายได้แผ่นดิน) across sub-items 1-3 if transaction history exists
  const f11Row = getRow('F11');
  const f11Txs = normTxs.filter((t) => t.fund === 'F11');
  const revSub1 = zeroTriple();
  const revSub2 = zeroTriple();
  const revSub3 = zeroTriple();
  if (f11Txs.length > 0) {
    f11Txs.forEach((t) => {
      const d = (t.desc || '').trim();
      const delta = numRound(t.rec - t.pay);
      const bucket =
        d.includes('ดอกเบี้ย') && d.includes('อาหารกลางวัน')
          ? revSub2
          : d.includes('ดอกเบี้ย')
          ? revSub1
          : revSub3;
      if (t.loc === 'cash' || t.loc === 'bank' || t.loc === 'depo') {
        bucket[t.loc] = numRound(bucket[t.loc] + delta);
      }
    });
  } else {
    revSub3.cash = f11Row.cash;
    revSub3.bank = f11Row.bank;
    revSub3.depo = f11Row.depo;
  }

  // Split F09 and F14 by description keywords when matching specific items 7, 10, 13
  const healthAbt = zeroTriple();
  const lunchFund = zeroTriple();
  const eefFund = zeroTriple();
  const otherSub = zeroTriple();

  const f09PlusF14Txs = normTxs.filter((t) => t.fund === 'F09' || t.fund === 'F14');
  if (f09PlusF14Txs.length > 0) {
    f09PlusF14Txs.forEach((t) => {
      const d = (t.desc || '').trim();
      const delta = numRound(t.rec - t.pay);
      const bucket =
        d.includes('สุขภาพ') || d.includes('อบต')
          ? healthAbt
          : d.includes('กองทุน') && d.includes('อาหาร')
          ? lunchFund
          : d.includes('กสศ') || d.includes('เสมอภาค')
          ? eefFund
          : otherSub;
      if (t.loc === 'cash' || t.loc === 'bank' || t.loc === 'depo') {
        bucket[t.loc] = numRound(bucket[t.loc] + delta);
      }
    });
  } else {
    const f09 = getRow('F09');
    const f14 = getRow('F14');
    otherSub.cash = numRound(f09.cash + f14.cash);
    otherSub.bank = numRound(f09.bank + f14.bank);
    otherSub.depo = numRound(f09.depo + f14.depo);
  }

  // Include any custom funds beyond F01..F15 in ข้อ 14 (เงินอื่น ๆ)
  const standardIds = new Set([
    'F01',
    'F02',
    'F03',
    'F04',
    'F05',
    'F06',
    'F07',
    'F08',
    'F09',
    'F10',
    'F11',
    'F12',
    'F13',
    'F14',
    'F15',
  ]);
  const extraOther = daily.rows
    .filter((r) => !standardIds.has(r.id))
    .reduce((acc, r) => addTriple(acc, { cash: r.cash, bank: r.bank, depo: r.depo }), zeroTriple());

  const nonBudgetItems: Array<{ label: string; note?: string; data: BucketTriple }> = [
    {
      label: '1. เงินค่าจัดการเรียนการสอน',
      note: 'รวมเงิน',
      data: addTriple(addTriple(getRow('F02'), getRow('F03')), getRow('F15')),
    },
    { label: '2. เงินปัจจัยพื้นฐานสำหรับนักเรียนยากจน', note: 'บช.020', data: getRow('F04') },
    { label: '3. เงินค่าหนังสือเรียน', note: 'รวมเงิน', data: getRow('F07') },
    { label: '4. เงินค่าเครื่องแบบนักเรียน', data: getRow('F05') },
    { label: '5. เงินค่าอุปกรณ์การเรียน', data: getRow('F06') },
    { label: '6. เงินค่ากิจกรรมพัฒนาคุณภาพผู้เรียน', data: getRow('F08') },
    { label: '7. เงินโครงการส่งเสริมสุขภาพ(อบต.)', data: healthAbt },
    { label: '8. เงินรายได้สถานศึกษา', data: getRow('F10') },
    { label: '9. เงินอุดหนุนโครงการอาหารกลางวัน', data: getRow('F01') },
    { label: '10. เงินกองทุนเพื่อโครงการอาหารกลางวัน', data: lunchFund },
    { label: '11. เงินภาษีหัก ณ ที่จ่าย', data: getRow('F13') },
    { label: '12. เงินประกันสัญญา', data: getRow('F12') },
    { label: '13. เงินกองทุนเพื่อความเสมอภาคทางการศึกษา(กสศ.)', data: eefFund },
    { label: '14. เงินอื่น ๆ (ระบุ)', data: addTriple(otherSub, extraOther) },
  ];

  const revGroupTot = f11Row;
  const nonBudGroupTot = daily.rows
    .filter((r) => r.id !== 'F11')
    .reduce((acc, r) => addTriple(acc, { cash: r.cash, bank: r.bank, depo: r.depo }), zeroTriple());

  const totCash = numRound(daily.rows.reduce((s, r) => s + r.cash, 0));
  const totBank = numRound(daily.rows.reduce((s, r) => s + r.bank, 0));
  const totDepo = numRound(daily.rows.reduce((s, r) => s + r.depo, 0));
  const totAll = numRound(totCash + totBank + totDepo);

  const cellNum = (v: number) => (Math.abs(v) > 0.004 ? fmt(v) : '-');
  const sumTriple = (t: BucketTriple) => numRound(t.cash + t.bank + t.depo);
  const locHeader = `${daily.school || '....................................'}${
    daily.district ? ` อำเภอ${daily.district}` : ''
  }${daily.province ? ` จังหวัด${daily.province}` : ''}`;

  const comm = committeeNames || ['', '', ''];

  return (
    <div
      className="pdf-page official-doc-form mx-auto bg-white text-black"
      style={{
        width: '100%',
        maxWidth: '794px',
        minHeight: '1080px',
        padding: '24px 30px',
        fontFamily: "'Sarabun', 'TH SarabunPSK', sans-serif",
        fontSize: '12.5px',
        lineHeight: 1.38,
        border: '1px solid #e2e8f0',
      }}
    >
      {/* Official Header matching ภาพ 1 */}
      <div style={{ textAlign: 'center', marginBottom: '10px', fontWeight: 700 }}>
        <div style={{ fontSize: '15.5px' }}>รายงานเงินคงเหลือประจำวัน</div>
        <div style={{ fontSize: '13.5px', marginTop: '2px' }}>ส่วนราชการ {locHeader}</div>
        <div style={{ fontSize: '13.5px', marginTop: '2px' }}>ประจำวันที่ {thDate(daily.date)}</div>
      </div>

      {/* Main 6-Column Official Table matching ภาพ 1 */}
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          tableLayout: 'fixed',
          border: '1.5px solid #000000',
          fontSize: '11.5px',
        }}
      >
        <colgroup>
          <col style={{ width: '36%' }} />
          <col style={{ width: '12%' }} />
          <col style={{ width: '14%' }} />
          <col style={{ width: '13%' }} />
          <col style={{ width: '14%' }} />
          <col style={{ width: '11%' }} />
        </colgroup>
        <thead>
          <tr>
            <th
              rowSpan={2}
              style={{
                border: '1px solid #000000',
                padding: '5px 4px',
                textAlign: 'center',
                verticalAlign: 'middle',
                fontWeight: 700,
                backgroundColor: '#ffffff',
              }}
            >
              รายการ
            </th>
            <th
              colSpan={4}
              style={{
                border: '1px solid #000000',
                padding: '4px 4px',
                textAlign: 'center',
                fontWeight: 700,
                backgroundColor: '#ffffff',
              }}
            >
              จำนวนเงิน
            </th>
            <th
              rowSpan={2}
              style={{
                border: '1px solid #000000',
                padding: '5px 4px',
                textAlign: 'center',
                verticalAlign: 'middle',
                fontWeight: 700,
                backgroundColor: '#ffffff',
              }}
            >
              หมายเหตุ
            </th>
          </tr>
          <tr>
            {['เงินสด', 'เงินฝากธนาคาร', 'ส่วนราชการผู้เบิก', 'รวม'].map((label, i) => (
              <th
                key={i}
                style={{
                  border: '1px solid #000000',
                  padding: '4px 3px',
                  textAlign: 'center',
                  verticalAlign: 'middle',
                  fontWeight: 700,
                  backgroundColor: '#ffffff',
                  fontSize: '11px',
                }}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* Group 1: เงินรายได้แผ่นดิน */}
          <tr style={{ fontWeight: 700 }}>
            <td style={{ border: '1px solid #000', padding: '3px 6px' }}>เงินรายได้แผ่นดิน</td>
            <td className="tabular-nums" style={{ border: '1px solid #000', padding: '3px 5px', textAlign: 'right' }}>
              {cellNum(revGroupTot.cash)}
            </td>
            <td className="tabular-nums" style={{ border: '1px solid #000', padding: '3px 5px', textAlign: 'right' }}>
              {cellNum(revGroupTot.bank)}
            </td>
            <td className="tabular-nums" style={{ border: '1px solid #000', padding: '3px 5px', textAlign: 'right' }}>
              {cellNum(revGroupTot.depo)}
            </td>
            <td className="tabular-nums" style={{ border: '1px solid #000', padding: '3px 5px', textAlign: 'right' }}>
              {cellNum(sumTriple(revGroupTot))}
            </td>
            <td style={{ border: '1px solid #000', padding: '3px 4px', textAlign: 'center' }}>บช.011</td>
          </tr>
          {[
            { label: '1. ดอกเบี้ยเงินอุดหนุน', data: revSub1, note: 'รวมเงิน' },
            { label: '2. ดอกเบี้ยเงินอุดหนุนโครงการอาหารกลางวัน', data: revSub2, note: 'บช.011' },
            { label: '3. เงินรายได้แผ่นดินอื่น ๆ (ระบุ)', data: revSub3, note: 'รวมเงิน' },
          ].map((item, idx) => (
            <tr key={`rev-${idx}`}>
              <td style={{ border: '1px solid #000', borderBottom: '1px dotted #94a3b8', padding: '2.5px 6px 2.5px 10px' }}>
                {item.label}
              </td>
              <td className="tabular-nums" style={{ border: '1px solid #000', borderBottom: '1px dotted #94a3b8', padding: '2.5px 5px', textAlign: 'right' }}>
                {cellNum(item.data.cash)}
              </td>
              <td className="tabular-nums" style={{ border: '1px solid #000', borderBottom: '1px dotted #94a3b8', padding: '2.5px 5px', textAlign: 'right' }}>
                {cellNum(item.data.bank)}
              </td>
              <td className="tabular-nums" style={{ border: '1px solid #000', borderBottom: '1px dotted #94a3b8', padding: '2.5px 5px', textAlign: 'right' }}>
                {cellNum(item.data.depo)}
              </td>
              <td className="tabular-nums" style={{ border: '1px solid #000', borderBottom: '1px dotted #94a3b8', padding: '2.5px 5px', textAlign: 'right' }}>
                {cellNum(sumTriple(item.data))}
              </td>
              <td style={{ border: '1px solid #000', borderBottom: '1px dotted #94a3b8', padding: '2.5px 4px', textAlign: 'center' }}>
                {item.note}
              </td>
            </tr>
          ))}

          {/* Group 2: เงินนอกงบประมาณ */}
          <tr style={{ fontWeight: 700 }}>
            <td style={{ border: '1px solid #000', padding: '3px 6px' }}>เงินนอกงบประมาณ</td>
            <td className="tabular-nums" style={{ border: '1px solid #000', padding: '3px 5px', textAlign: 'right' }}>
              {cellNum(nonBudGroupTot.cash)}
            </td>
            <td className="tabular-nums" style={{ border: '1px solid #000', padding: '3px 5px', textAlign: 'right' }}>
              {cellNum(nonBudGroupTot.bank)}
            </td>
            <td className="tabular-nums" style={{ border: '1px solid #000', padding: '3px 5px', textAlign: 'right' }}>
              {cellNum(nonBudGroupTot.depo)}
            </td>
            <td className="tabular-nums" style={{ border: '1px solid #000', padding: '3px 5px', textAlign: 'right' }}>
              {cellNum(sumTriple(nonBudGroupTot))}
            </td>
            <td style={{ border: '1px solid #000', padding: '3px 4px', textAlign: 'center' }}>บช.020</td>
          </tr>
          {nonBudgetItems.map((item, idx) => (
            <tr key={`nb-${idx}`}>
              <td style={{ border: '1px solid #000', borderBottom: '1px dotted #94a3b8', padding: '2.5px 6px 2.5px 10px' }}>
                {item.label}
              </td>
              <td className="tabular-nums" style={{ border: '1px solid #000', borderBottom: '1px dotted #94a3b8', padding: '2.5px 5px', textAlign: 'right' }}>
                {cellNum(item.data.cash)}
              </td>
              <td className="tabular-nums" style={{ border: '1px solid #000', borderBottom: '1px dotted #94a3b8', padding: '2.5px 5px', textAlign: 'right' }}>
                {cellNum(item.data.bank)}
              </td>
              <td className="tabular-nums" style={{ border: '1px solid #000', borderBottom: '1px dotted #94a3b8', padding: '2.5px 5px', textAlign: 'right' }}>
                {cellNum(item.data.depo)}
              </td>
              <td className="tabular-nums" style={{ border: '1px solid #000', borderBottom: '1px dotted #94a3b8', padding: '2.5px 5px', textAlign: 'right' }}>
                {cellNum(sumTriple(item.data))}
              </td>
              <td style={{ border: '1px solid #000', borderBottom: '1px dotted #94a3b8', padding: '2.5px 4px', textAlign: 'center' }}>
                {item.note || ''}
              </td>
            </tr>
          ))}

          {/* รวมทั้งสิ้น */}
          <tr style={{ fontWeight: 700 }}>
            <td
              style={{
                borderTop: '1.5px solid #000',
                borderLeft: '1px solid #000',
                borderRight: '1px solid #000',
                borderBottom: '1.5px solid #000',
                padding: '4px 10px',
                textAlign: 'center',
              }}
            >
              รวมทั้งสิ้น
            </td>
            <td
              className="tabular-nums"
              style={{
                borderTop: '1.5px solid #000',
                borderLeft: '1px solid #000',
                borderRight: '1px solid #000',
                borderBottom: '1.5px solid #000',
                padding: '4px 5px',
                textAlign: 'right',
              }}
            >
              {cellNum(totCash)}
            </td>
            <td
              className="tabular-nums"
              style={{
                borderTop: '1.5px solid #000',
                borderLeft: '1px solid #000',
                borderRight: '1px solid #000',
                borderBottom: '1.5px solid #000',
                padding: '4px 5px',
                textAlign: 'right',
              }}
            >
              {cellNum(totBank)}
            </td>
            <td
              className="tabular-nums"
              style={{
                borderTop: '1.5px solid #000',
                borderLeft: '1px solid #000',
                borderRight: '1px solid #000',
                borderBottom: '1.5px solid #000',
                padding: '4px 5px',
                textAlign: 'right',
              }}
            >
              {cellNum(totDepo)}
            </td>
            <td
              className="tabular-nums"
              style={{
                borderTop: '1.5px solid #000',
                borderLeft: '1px solid #000',
                borderRight: '1px solid #000',
                borderBottom: '1.5px solid #000',
                padding: '4px 5px',
                textAlign: 'right',
              }}
            >
              {cellNum(totAll)}
            </td>
            <td
              style={{
                borderTop: '1.5px solid #000',
                borderLeft: '1px solid #000',
                borderRight: '1px solid #000',
                borderBottom: '1.5px solid #000',
                padding: '4px 4px',
              }}
            />
          </tr>
        </tbody>
      </table>

      {/* ผู้จัดทำรายงาน */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: showSignatures && daily.sigFinance ? '14px' : '22px', fontSize: '12px' }}>
        <div style={{ width: '360px', textAlign: 'center' }}>
          {showSignatures && daily.sigFinance && (
            <img
              src={daily.sigFinance}
              alt="ลายเซ็นผู้จัดทำรายงาน"
              style={{ height: '32px', margin: '0 auto 2px auto', objectFit: 'contain' }}
            />
          )}
          <div>
            ({daily.financeName || '........................................'}) ผู้จัดทำรายงาน
          </div>
          <div style={{ marginTop: '2px' }}>ตำแหน่ง เจ้าหน้าที่การเงินและบัญชี</div>
        </div>
      </div>

      {/* คณะกรรมการเก็บรักษาเงิน */}
      <div style={{ marginTop: '10px', fontSize: '12px', textIndent: '24px' }}>
        คณะกรรมการเก็บรักษาเงินได้ตรวจนับเงินสดคงเหลือประจำวันถูกต้องตามรายการข้างต้นแล้ว และได้นำเงินสดเก็บรักษาไว้ในตู้นิรภัยเป็นที่เรียบร้อยแล้ว
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: '10px',
          marginTop: '22px',
          textAlign: 'center',
          fontSize: '12px',
        }}
      >
        {[0, 1, 2].map((idx) => (
          <div key={idx}>
            <div>
              {comm[idx] ? `(${comm[idx]})` : '...........................................'}
            </div>
            <div style={{ marginTop: '3px' }}>กรรมการ</div>
          </div>
        ))}
      </div>

      {/* หัวหน้าหน่วยงานย่อย */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: showSignatures && daily.sigDirector ? '14px' : '24px', fontSize: '12px' }}>
        <div style={{ width: '370px', textAlign: 'center' }}>
          {showSignatures && daily.sigDirector && (
            <img
              src={daily.sigDirector}
              alt="ลายเซ็นหัวหน้าหน่วยงานย่อย"
              style={{ height: '32px', margin: '0 auto 2px auto', objectFit: 'contain' }}
            />
          )}
          <div>
            (ลงชื่อ)...............................................หัวหน้าหน่วยงานย่อย
          </div>
          <div style={{ marginTop: '2px' }}>
            ({daily.director || '...................................................'})
          </div>
          <div style={{ marginTop: '2px' }}>
            ตำแหน่ง ผู้อำนวยการ{daily.school || 'สถานศึกษา'}
          </div>
        </div>
      </div>

      {/* บันทึกการรับมอบหมายเงินสด */}
      <div
        style={{
          marginTop: '12px',
          paddingTop: '8px',
          borderTop: '1px solid #000000',
          fontSize: '12px',
        }}
      >
        <div>
          ข้าพเจ้าผู้รับมอบหมายได้รับเงินสดตามรายการข้างต้นแล้ว เมื่อวันที่ {thDate(daily.date)}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
          <div style={{ width: '350px', textAlign: 'left' }}>
            <div>(ลงชื่อ)......................................................ผู้รับเงิน</div>
            <div style={{ marginTop: '8px' }}>(ลงชื่อ)......................................................หัวหน้าหน่วยงานย่อย</div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* 2. Cash Book Official Form (ตามภาพ 1 — สมุดเงินสด A4 แนวนอน แยกเดือน)        */
/* -------------------------------------------------------------------------- */
interface CashBucket {
  cash: number;
  bud: number;
  rev: number;
  nonBud: number;
}

interface CashSideRow {
  month: string;
  day: string;
  doc: string;
  desc: string;
  amounts: CashBucket;
  isSummary?: boolean;
}

function txToBucket(t: Transaction, amount: number): CashBucket {
  const val = numRound(amount);
  const isRev = t.fund === 'F11';
  return {
    cash: val,
    bud: 0,
    rev: isRev ? val : 0,
    nonBud: isRev ? 0 : val,
  };
}

function addBuckets(a: CashBucket, b: CashBucket): CashBucket {
  return {
    cash: numRound(a.cash + b.cash),
    bud: numRound(a.bud + b.bud),
    rev: numRound(a.rev + b.rev),
    nonBud: numRound(a.nonBud + b.nonBud),
  };
}

function subBuckets(a: CashBucket, b: CashBucket): CashBucket {
  return {
    cash: numRound(a.cash - b.cash),
    bud: numRound(a.bud - b.bud),
    rev: numRound(a.rev - b.rev),
    nonBud: numRound(a.nonBud - b.nonBud),
  };
}

function thMonthOnly(ym: string): string {
  const m = Number(ym.slice(5, 7));
  return TH_MONTHS[m - 1] || ym;
}

function fmtCellDash(n: number): string {
  return Math.abs(n) > 0.004 ? fmt(n) : '-';
}

export const CashBookOfficialForm: React.FC<{
  transactions: Transaction[];
  fy: number;
  schoolName?: string;
  selectedMonth?: string; // 'ALL' or 'YYYY-MM'
}> = ({ transactions, fy, schoolName, selectedMonth = 'ALL' }) => {
  const fyTxs = transactions
    .filter((t) => t.fy === fy)
    .map((t) => normalizeTransactionAccounting(t))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const monthSet = new Set<string>();
  fyTxs.forEach((t) => {
    if (t.date && /^\d{4}-\d{2}/.test(t.date)) {
      monthSet.add(t.date.slice(0, 7));
    }
  });
  if (selectedMonth !== 'ALL' && /^\d{4}-\d{2}$/.test(selectedMonth)) {
    monthSet.add(selectedMonth);
  }
  const allMonths = Array.from(monthSet).sort();

  const monthPages: Array<{
    ym: string;
    budYear: number;
    leftRows: CashSideRow[];
    rightRows: CashSideRow[];
    leftTotals: CashBucket;
    rightPayTotals: CashBucket;
    carryNext: CashBucket;
  }> = [];

  let runningCarry: CashBucket = { cash: 0, bud: 0, rev: 0, nonBud: 0 };

  allMonths.forEach((ym, monthIdx) => {
    const budYear = Number(ym.slice(0, 4)) + 543;
    const inMonth = fyTxs.filter((t) => t.date.slice(0, 7) === ym);
    const openInMonth = inMonth.filter((t) => t.kind === 'open');
    const normalInMonth = inMonth.filter((t) => t.kind !== 'open');

    // เดือนแรกของปีใช้รายการยอดยกมา (kind === 'open') เป็นยอดยกมาตั้งต้น
    // ส่วนเดือนถัดไป ยอดยกมาต้องตรงกับ "ยอดยกไป" ของเดือนก่อนหน้าเสมอ
    // และหากมีรายการที่ถูกระบุเป็น open ในเดือนถัดไป ให้แสดงเป็นรายการรับ/จ่ายตามวันที่จริงในเดือนนั้น
    let monthOpen = { ...runningCarry };
    let openDay = '1';
    let movementInMonth = normalInMonth;
    if (monthIdx === 0) {
      if (openInMonth.length > 0) {
        openDay = String(Number(openInMonth[0].date.slice(8, 10)) || 1);
        openInMonth.forEach((t) => {
          const net = numRound(t.rec - t.pay);
          monthOpen = addBuckets(monthOpen, txToBucket(t, net));
        });
      }
    } else if (openInMonth.length > 0) {
      movementInMonth = inMonth;
    }

    const leftRows: CashSideRow[] = [
      {
        month: thMonthOnly(ym),
        day: openDay,
        doc: '',
        desc: 'ยอดยกมา',
        amounts: monthOpen,
      },
      ...movementInMonth
        .filter((t) => t.rec > 0)
        .map((t) => ({
          month: thMonthOnly(t.date.slice(0, 7)),
          day: String(Number(t.date.slice(8, 10)) || ''),
          doc: t.doc,
          desc: t.desc,
          amounts: txToBucket(t, t.rec),
        })),
    ];

    const rightRows: CashSideRow[] = movementInMonth
      .filter((t) => t.pay > 0)
      .map((t) => ({
        month: thMonthOnly(t.date.slice(0, 7)),
        day: String(Number(t.date.slice(8, 10)) || ''),
        doc: t.doc,
        desc: t.desc,
        amounts: txToBucket(t, t.pay),
      }));

    const leftTotals = leftRows.reduce(
      (acc, r) => addBuckets(acc, r.amounts),
      { cash: 0, bud: 0, rev: 0, nonBud: 0 }
    );
    const rightPayTotals = rightRows.reduce(
      (acc, r) => addBuckets(acc, r.amounts),
      { cash: 0, bud: 0, rev: 0, nonBud: 0 }
    );
    const carryNext = subBuckets(leftTotals, rightPayTotals);
    runningCarry = carryNext;

    if (selectedMonth === 'ALL' || selectedMonth === ym) {
      monthPages.push({
        ym,
        budYear,
        leftRows,
        rightRows,
        leftTotals,
        rightPayTotals,
        carryNext,
      });
    }
  });

  if (monthPages.length === 0) {
    const fallbackBudYear = fy - 1;
    monthPages.push({
      ym: `${fy - 544}-10`,
      budYear: fallbackBudYear,
      leftRows: [
        {
          month: 'ตุลาคม',
          day: '1',
          doc: '',
          desc: 'ยอดยกมา',
          amounts: { cash: 0, bud: 0, rev: 0, nonBud: 0 },
        },
      ],
      rightRows: [],
      leftTotals: { cash: 0, bud: 0, rev: 0, nonBud: 0 },
      rightPayTotals: { cash: 0, bud: 0, rev: 0, nonBud: 0 },
      carryNext: { cash: 0, bud: 0, rev: 0, nonBud: 0 },
    });
  }

  const BODY_ROWS_PER_PAGE = 21;

  // Split long months cleanly into landscape A4 pages, keeping final summary on last page
  const renderedSheets: Array<{
    ym: string;
    budYear: number;
    pageIdx: number;
    totalPages: number;
    leftSlice: CashSideRow[];
    rightSlice: CashSideRow[];
    isLastPage: boolean;
    leftTotals: CashBucket;
    carryNext: CashBucket;
  }> = [];

  monthPages.forEach((mp) => {
    const maxLen = Math.max(mp.leftRows.length, mp.rightRows.length, 1);
    const totalPages = Math.max(1, Math.ceil(maxLen / BODY_ROWS_PER_PAGE));
    for (let p = 0; p < totalPages; p++) {
      const start = p * BODY_ROWS_PER_PAGE;
      const end = start + BODY_ROWS_PER_PAGE;
      renderedSheets.push({
        ym: mp.ym,
        budYear: mp.budYear,
        pageIdx: p,
        totalPages,
        leftSlice: mp.leftRows.slice(start, end),
        rightSlice: mp.rightRows.slice(start, end),
        isLastPage: p === totalPages - 1,
        leftTotals: mp.leftTotals,
        carryNext: mp.carryNext,
      });
    }
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {renderedSheets.map((sheet, sIdx) => (
        <div
          key={`${sheet.ym}-${sheet.pageIdx}-${sIdx}`}
          className="pdf-page official-doc-form mx-auto bg-white text-black"
          style={{
            width: '100%',
            maxWidth: '1122px',
            minHeight: '755px',
            padding: '16px 20px',
            fontFamily: "'Sarabun', 'TH SarabunPSK', sans-serif",
            fontSize: '10.5px',
            lineHeight: 1.25,
            border: '1px solid #cbd5e1',
          }}
        >
          {/* Header matching ภาพ 1 */}
          <div style={{ textAlign: 'center', marginBottom: '6px', position: 'relative' }}>
            <div style={{ fontSize: '18px', fontWeight: 700, letterSpacing: '0.3px' }}>สมุดเงินสด</div>
            <div style={{ fontSize: '11px', color: '#334155' }}>
              {schoolName ? `${schoolName} · ` : ''}ประจำเดือน {thMonth(sheet.ym)}
              {sheet.totalPages > 1 ? ` (หน้า ${sheet.pageIdx + 1}/${sheet.totalPages})` : ''}
            </div>
          </div>

          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              tableLayout: 'fixed',
              border: '1.5px solid #000000',
              fontSize: '10px',
            }}
          >
            <colgroup>
              {/* Left 8 columns = 50% */}
              <col style={{ width: '5.5%' }} />
              <col style={{ width: '3%' }} />
              <col style={{ width: '5.5%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '6%' }} />
              <col style={{ width: '5%' }} />
              <col style={{ width: '6%' }} />
              <col style={{ width: '6%' }} />
              {/* Right 8 columns = 50% */}
              <col style={{ width: '5.5%' }} />
              <col style={{ width: '3%' }} />
              <col style={{ width: '5.5%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '6%' }} />
              <col style={{ width: '5%' }} />
              <col style={{ width: '6%' }} />
              <col style={{ width: '6%' }} />
            </colgroup>
            <thead>
              <tr style={{ backgroundColor: '#ffffff', fontWeight: 700, textAlign: 'center' }}>
                <th colSpan={2} style={{ border: '1px solid #000', padding: '3px 2px' }}>
                  พ.ศ. {sheet.budYear}
                </th>
                <th rowSpan={2} style={{ border: '1px solid #000', padding: '3px 2px' }}>
                  ที่เอกสาร
                </th>
                <th rowSpan={2} style={{ border: '1px solid #000', padding: '3px 4px' }}>
                  รายการรับ
                </th>
                <th style={{ border: '1px solid #000', padding: '3px 2px' }}>เดบิต</th>
                <th colSpan={3} style={{ border: '1px solid #000', padding: '3px 2px' }}>
                  เครดิต
                </th>
                <th colSpan={2} style={{ border: '1px solid #000', borderLeft: '1.5px solid #000', padding: '3px 2px' }}>
                  พ.ศ. {sheet.budYear}
                </th>
                <th rowSpan={2} style={{ border: '1px solid #000', padding: '3px 2px' }}>
                  ที่เอกสาร
                </th>
                <th rowSpan={2} style={{ border: '1px solid #000', padding: '3px 4px' }}>
                  รายการจ่าย
                </th>
                <th style={{ border: '1px solid #000', padding: '3px 2px' }}>เดบิต</th>
                <th colSpan={3} style={{ border: '1px solid #000', padding: '3px 2px' }}>
                  เครดิต
                </th>
              </tr>
              <tr style={{ backgroundColor: '#ffffff', fontWeight: 700, textAlign: 'center' }}>
                <th style={{ border: '1px solid #000', padding: '3px 2px' }}>เดือน</th>
                <th style={{ border: '1px solid #000', padding: '3px 2px' }}>วันที่</th>
                <th style={{ border: '1px solid #000', padding: '3px 2px' }}>เงินสด</th>
                <th style={{ border: '1px solid #000', padding: '3px 2px' }}>เงินงบประมาณ</th>
                <th style={{ border: '1px solid #000', padding: '3px 2px' }}>เงินรายได้แผ่นดิน</th>
                <th style={{ border: '1px solid #000', padding: '3px 2px' }}>เงินนอกงบประมาณ</th>
                <th style={{ border: '1px solid #000', borderLeft: '1.5px solid #000', padding: '3px 2px' }}>เดือน</th>
                <th style={{ border: '1px solid #000', padding: '3px 2px' }}>วันที่</th>
                <th style={{ border: '1px solid #000', padding: '3px 2px' }}>เงินสด</th>
                <th style={{ border: '1px solid #000', padding: '3px 2px' }}>เงินงบประมาณ</th>
                <th style={{ border: '1px solid #000', padding: '3px 2px' }}>เงินรายได้แผ่นดิน</th>
                <th style={{ border: '1px solid #000', padding: '3px 2px' }}>เงินนอกงบประมาณ</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: BODY_ROWS_PER_PAGE }).map((_, rIdx) => {
                const L = sheet.leftSlice[rIdx];
                const R = sheet.rightSlice[rIdx];
                const dottedBottom = '1px dotted #64748b';
                return (
                  <tr key={rIdx} style={{ height: '22px' }}>
                    {/* Left 8 */}
                    <td style={{ borderLeft: '1px solid #000', borderRight: '1px solid #000', borderBottom: dottedBottom, padding: '2px 3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {L?.month || ''}
                    </td>
                    <td className="tabular-nums" style={{ borderRight: '1px solid #000', borderBottom: dottedBottom, padding: '2px 2px', textAlign: 'center' }}>
                      {L?.day || ''}
                    </td>
                    <td style={{ borderRight: '1px solid #000', borderBottom: dottedBottom, padding: '2px 3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {L?.doc || ''}
                    </td>
                    <td
                      style={{
                        borderRight: '1px solid #000',
                        borderBottom: dottedBottom,
                        padding: '2px 4px',
                        textAlign: L?.desc === 'ยอดยกมา' ? 'right' : 'left',
                        fontWeight: L?.desc === 'ยอดยกมา' ? 600 : 400,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {L?.desc || ''}
                    </td>
                    <td className="tabular-nums" style={{ borderRight: '1px solid #000', borderBottom: dottedBottom, padding: '2px 3px', textAlign: 'right', fontWeight: L ? 600 : 400 }}>
                      {L ? fmtCellDash(L.amounts.cash) : '-'}
                    </td>
                    <td className="tabular-nums" style={{ borderRight: '1px solid #000', borderBottom: dottedBottom, padding: '2px 3px', textAlign: 'right' }}>
                      {L && Math.abs(L.amounts.bud) > 0.004 ? fmt(L.amounts.bud) : ''}
                    </td>
                    <td className="tabular-nums" style={{ borderRight: '1px solid #000', borderBottom: dottedBottom, padding: '2px 3px', textAlign: 'right', fontWeight: L?.desc === 'ยอดยกมา' ? 600 : 400 }}>
                      {L ? fmtCellDash(L.amounts.rev) : ''}
                    </td>
                    <td className="tabular-nums" style={{ borderRight: '1.5px solid #000', borderBottom: dottedBottom, padding: '2px 3px', textAlign: 'right', fontWeight: L?.desc === 'ยอดยกมา' ? 600 : 400 }}>
                      {L ? fmtCellDash(L.amounts.nonBud) : ''}
                    </td>

                    {/* Right 8 */}
                    <td style={{ borderRight: '1px solid #000', borderBottom: dottedBottom, padding: '2px 3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {R?.month || ''}
                    </td>
                    <td className="tabular-nums" style={{ borderRight: '1px solid #000', borderBottom: dottedBottom, padding: '2px 2px', textAlign: 'center' }}>
                      {R?.day || ''}
                    </td>
                    <td style={{ borderRight: '1px solid #000', borderBottom: dottedBottom, padding: '2px 3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {R?.doc || ''}
                    </td>
                    <td style={{ borderRight: '1px solid #000', borderBottom: dottedBottom, padding: '2px 4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {R?.desc || ''}
                    </td>
                    <td className="tabular-nums" style={{ borderRight: '1px solid #000', borderBottom: dottedBottom, padding: '2px 3px', textAlign: 'right' }}>
                      {R ? fmtCellDash(R.amounts.cash) : '-'}
                    </td>
                    <td className="tabular-nums" style={{ borderRight: '1px solid #000', borderBottom: dottedBottom, padding: '2px 3px', textAlign: 'right' }}>
                      {R && Math.abs(R.amounts.bud) > 0.004 ? fmt(R.amounts.bud) : ''}
                    </td>
                    <td className="tabular-nums" style={{ borderRight: '1px solid #000', borderBottom: dottedBottom, padding: '2px 3px', textAlign: 'right' }}>
                      {R ? fmtCellDash(R.amounts.rev) : ''}
                    </td>
                    <td className="tabular-nums" style={{ borderRight: '1px solid #000', borderBottom: dottedBottom, padding: '2px 3px', textAlign: 'right' }}>
                      {R ? fmtCellDash(R.amounts.nonBud) : ''}
                    </td>
                  </tr>
                );
              })}

              {/* Bottom 4 summary rows matching ภาพ 1 */}
              {/* Row 1: ยอดยกไป */}
              <tr style={{ height: '22px' }}>
                <td style={{ borderRight: '1px solid #000', borderBottom: '1px dotted #64748b' }} />
                <td style={{ borderRight: '1px solid #000', borderBottom: '1px dotted #64748b' }} />
                <td style={{ borderRight: '1px solid #000', borderBottom: '1px dotted #64748b' }} />
                <td style={{ borderRight: '1px solid #000', borderBottom: '1px dotted #64748b' }} />
                <td style={{ borderRight: '1px solid #000', borderBottom: '1px dotted #64748b', textAlign: 'right', padding: '2px 3px' }}>-</td>
                <td style={{ borderRight: '1px solid #000', borderBottom: '1px dotted #64748b' }} />
                <td style={{ borderRight: '1px solid #000', borderBottom: '1px dotted #64748b' }} />
                <td style={{ borderRight: '1.5px solid #000', borderBottom: '1px dotted #64748b' }} />

                <td style={{ borderRight: '1px solid #000', borderBottom: '1px dotted #64748b' }} />
                <td style={{ borderRight: '1px solid #000', borderBottom: '1px dotted #64748b' }} />
                <td style={{ borderRight: '1px solid #000', borderBottom: '1px dotted #64748b' }} />
                <td style={{ borderRight: '1px solid #000', borderBottom: '1px dotted #64748b', padding: '2px 4px', textAlign: 'right', fontWeight: 700 }}>
                  {sheet.isLastPage ? 'ยอดยกไป' : 'รวมยอดยกไปหน้าถัดไป'}
                </td>
                <td className="tabular-nums" style={{ borderRight: '1px solid #000', borderBottom: '1px dotted #64748b', padding: '2px 3px', textAlign: 'right', fontWeight: 700 }}>
                  {sheet.isLastPage ? fmtCellDash(sheet.carryNext.cash) : '-'}
                </td>
                <td className="tabular-nums" style={{ borderRight: '1px solid #000', borderBottom: '1px dotted #64748b', padding: '2px 3px', textAlign: 'right', fontWeight: 700 }}>
                  {sheet.isLastPage ? fmtCellDash(sheet.carryNext.bud) : '-'}
                </td>
                <td className="tabular-nums" style={{ borderRight: '1px solid #000', borderBottom: '1px dotted #64748b', padding: '2px 3px', textAlign: 'right', fontWeight: 700 }}>
                  {sheet.isLastPage ? fmtCellDash(sheet.carryNext.rev) : '-'}
                </td>
                <td className="tabular-nums" style={{ borderRight: '1px solid #000', borderBottom: '1px dotted #64748b', padding: '2px 3px', textAlign: 'right', fontWeight: 700 }}>
                  {sheet.isLastPage ? fmtCellDash(sheet.carryNext.nonBud) : '-'}
                </td>
              </tr>

              {/* Row 2: ผู้ลงบัญชี */}
              <tr style={{ height: '22px' }}>
                <td style={{ borderRight: '1px solid #000', borderBottom: '1px solid #000' }} />
                <td style={{ borderRight: '1px solid #000', borderBottom: '1px solid #000' }} />
                <td style={{ borderRight: '1px solid #000', borderBottom: '1px solid #000' }} />
                <td style={{ borderRight: '1px solid #000', borderBottom: '1px solid #000' }} />
                <td style={{ borderRight: '1px solid #000', borderBottom: '1px solid #000', textAlign: 'right', padding: '2px 3px' }}>-</td>
                <td style={{ borderRight: '1px solid #000', borderBottom: '1px solid #000' }} />
                <td style={{ borderRight: '1px solid #000', borderBottom: '1px solid #000' }} />
                <td style={{ borderRight: '1.5px solid #000', borderBottom: '1px solid #000' }} />

                <td style={{ borderRight: '1px solid #000', borderBottom: '1px solid #000' }} />
                <td style={{ borderRight: '1px solid #000', borderBottom: '1px solid #000' }} />
                <td style={{ borderRight: '1px solid #000', borderBottom: '1px solid #000' }} />
                <td style={{ borderRight: '1px solid #000', borderBottom: '1px solid #000', padding: '2px 4px', textAlign: 'right' }}>
                  ผู้ลงบัญชี
                </td>
                <td style={{ borderRight: '1px solid #000', borderBottom: '1px solid #000' }} />
                <td style={{ borderRight: '1px solid #000', borderBottom: '1px solid #000' }} />
                <td style={{ borderRight: '1px solid #000', borderBottom: '1px solid #000' }} />
                <td style={{ borderRight: '1px solid #000', borderBottom: '1px solid #000' }} />
              </tr>

              {/* Row 3: Grand Total Balancing Row + ผู้ตรวจสอบ */}
              <tr style={{ height: '24px', fontWeight: 700 }}>
                <td style={{ borderRight: '1px solid #000', borderBottom: '1px solid #000' }} />
                <td style={{ borderRight: '1px solid #000', borderBottom: '1px solid #000' }} />
                <td style={{ borderRight: '1px solid #000', borderBottom: '1px solid #000' }} />
                <td style={{ borderRight: '1px solid #000', borderBottom: '1px solid #000', padding: '2px 4px', textAlign: 'right' }}>
                  รวมทั้งสิ้น
                </td>
                <td className="tabular-nums" style={{ borderRight: '1px solid #000', borderBottom: '1px solid #000', padding: '2px 3px', textAlign: 'right' }}>
                  {fmtCellDash(sheet.leftTotals.cash)}
                </td>
                <td className="tabular-nums" style={{ borderRight: '1px solid #000', borderBottom: '1px solid #000', padding: '2px 3px', textAlign: 'right' }}>
                  {fmtCellDash(sheet.leftTotals.bud)}
                </td>
                <td className="tabular-nums" style={{ borderRight: '1px solid #000', borderBottom: '1px solid #000', padding: '2px 3px', textAlign: 'right' }}>
                  {fmtCellDash(sheet.leftTotals.rev)}
                </td>
                <td className="tabular-nums" style={{ borderRight: '1.5px solid #000', borderBottom: '1px solid #000', padding: '2px 3px', textAlign: 'right' }}>
                  {fmtCellDash(sheet.leftTotals.nonBud)}
                </td>

                <td style={{ borderRight: '1px solid #000', borderBottom: '1px solid #000' }} />
                <td style={{ borderRight: '1px solid #000', borderBottom: '1px solid #000' }} />
                <td style={{ borderRight: '1px solid #000', borderBottom: '1px solid #000' }} />
                <td style={{ borderRight: '1px solid #000', borderBottom: '1px solid #000', padding: '2px 4px', textAlign: 'right', fontWeight: 400 }}>
                  ผู้ตรวจสอบ
                </td>
                <td className="tabular-nums" style={{ borderRight: '1px solid #000', borderBottom: '1px solid #000', padding: '2px 3px', textAlign: 'right' }}>
                  {fmtCellDash(sheet.leftTotals.cash)}
                </td>
                <td className="tabular-nums" style={{ borderRight: '1px solid #000', borderBottom: '1px solid #000', padding: '2px 3px', textAlign: 'right' }}>
                  {fmtCellDash(sheet.leftTotals.bud)}
                </td>
                <td className="tabular-nums" style={{ borderRight: '1px solid #000', borderBottom: '1px solid #000', padding: '2px 3px', textAlign: 'right' }}>
                  {fmtCellDash(sheet.leftTotals.rev)}
                </td>
                <td className="tabular-nums" style={{ borderRight: '1px solid #000', borderBottom: '1px solid #000', padding: '2px 3px', textAlign: 'right' }}>
                  {fmtCellDash(sheet.leftTotals.nonBud)}
                </td>
              </tr>

              {/* Row 4: ผู้บริหาร */}
              <tr style={{ height: '24px' }}>
                <td style={{ borderRight: '1px solid #000' }} />
                <td style={{ borderRight: '1px solid #000' }} />
                <td style={{ borderRight: '1px solid #000' }} />
                <td style={{ borderRight: '1px solid #000' }} />
                <td style={{ borderRight: '1px solid #000' }} />
                <td style={{ borderRight: '1px solid #000' }} />
                <td style={{ borderRight: '1px solid #000' }} />
                <td style={{ borderRight: '1.5px solid #000' }} />

                <td style={{ borderRight: '1px solid #000' }} />
                <td style={{ borderRight: '1px solid #000' }} />
                <td style={{ borderRight: '1px solid #000' }} />
                <td style={{ borderRight: '1px solid #000', padding: '2px 4px', textAlign: 'right' }}>
                  ผู้บริหาร
                </td>
                <td style={{ borderRight: '1px solid #000' }} />
                <td style={{ borderRight: '1px solid #000' }} />
                <td style={{ borderRight: '1px solid #000' }} />
                <td style={{ borderRight: '1px solid #000' }} />
              </tr>
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* 3. Off-Budget Ledger Cover Page (ข้อ 5: ปกทะเบียนคุมเงินนอกงบประมาณ A4 แนวตั้ง) */
/* -------------------------------------------------------------------------- */
export const OffBudgetCoverPage: React.FC<{
  fundTitle: string;
  fy: number;
  settings: SchoolSettings;
  logo?: string;
}> = ({ fundTitle, fy, settings, logo }) => {
  return (
    <div
      className="pdf-page official-doc-form mx-auto bg-white text-black"
      style={{
        width: '100%',
        maxWidth: '794px',
        minHeight: '1040px',
        padding: '32px',
        fontFamily: "'Sarabun', 'TH SarabunPSK', sans-serif",
        border: '1px solid #cbd5e1',
        display: 'flex',
      }}
    >
      {/* Formal Double Outer Border */}
      <div
        style={{
          flex: 1,
          border: '2.5px solid #000000',
          padding: '6px',
          display: 'flex',
        }}
      >
        <div
          style={{
            flex: 1,
            border: '1px solid #000000',
            padding: '54px 48px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          {/* Top Seal & School Heading */}
          <div style={{ textAlign: 'center' }}>
            {logo && (
              <img
                src={logo}
                alt="ตราสัญลักษณ์โรงเรียน"
                style={{ height: '92px', width: '92px', margin: '0 auto 18px auto', objectFit: 'contain' }}
              />
            )}
            <div style={{ fontSize: '16px', fontWeight: 600, color: '#1e293b' }}>
              เอกสารควบคุมทางบัญชีและการเงินสถานศึกษา
            </div>
            <div style={{ fontSize: '14px', color: '#475569', marginTop: '4px' }}>
              ตามระเบียบกระทรวงศึกษาธิการและกรมบัญชีกลาง
            </div>
          </div>

          {/* Center Main Cover Title + 4 Official Fields */}
          <div style={{ textAlign: 'center', margin: '24px 0' }}>
            <div
              style={{
                fontSize: '30px',
                fontWeight: 800,
                letterSpacing: '0.5px',
                marginBottom: '44px',
              }}
            >
              ทะเบียนคุมเงินนอกงบประมาณ
            </div>

            <div
              style={{
                maxWidth: '560px',
                margin: '0 auto',
                textAlign: 'left',
                fontSize: '18px',
                lineHeight: 2.3,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
                <span style={{ fontWeight: 700, minWidth: '115px', flexShrink: 0 }}>ประเภท</span>
                <span
                  style={{
                    flex: 1,
                    borderBottom: '1.5px dotted #000000',
                    paddingLeft: '8px',
                    fontWeight: 600,
                  }}
                >
                  {fundTitle}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
                <span style={{ fontWeight: 700, minWidth: '115px', flexShrink: 0 }}>ปีงบประมาณ</span>
                <span
                  style={{
                    flex: 1,
                    borderBottom: '1.5px dotted #000000',
                    paddingLeft: '8px',
                    fontWeight: 600,
                  }}
                >
                  พ.ศ. {fy}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
                <span style={{ fontWeight: 700, minWidth: '115px', flexShrink: 0 }}>โรงเรียน</span>
                <span
                  style={{
                    flex: 1,
                    borderBottom: '1.5px dotted #000000',
                    paddingLeft: '8px',
                    fontWeight: 600,
                  }}
                >
                  {settings.schoolName || '-'}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
                <span style={{ fontWeight: 700, minWidth: '115px', flexShrink: 0 }}>สังกัด</span>
                <span
                  style={{
                    flex: 1,
                    borderBottom: '1.5px dotted #000000',
                    paddingLeft: '8px',
                    fontWeight: 600,
                  }}
                >
                  {settings.affiliation || '-'}
                </span>
              </div>
            </div>
          </div>

          {/* Bottom Institutional Footer */}
          <div style={{ textAlign: 'center', borderTop: '1px solid #94a3b8', paddingTop: '20px' }}>
            <div style={{ fontSize: '15px', fontWeight: 700 }}>{settings.schoolName}</div>
            {(settings.district || settings.province) && (
              <div style={{ fontSize: '13.5px', color: '#334155', marginTop: '4px' }}>
                อำเภอ{settings.district || '-'} จังหวัด{settings.province || '-'}
              </div>
            )}
            <div style={{ fontSize: '13px', color: '#475569', marginTop: '4px' }}>
              รหัสสถานศึกษา {settings.schoolCode || '-'} · ระยะเวลาบัญชี 1 ตุลาคม พ.ศ. {fy - 1} – 30 กันยายน พ.ศ. {fy}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* 4. Off-Budget Ledger Official Form (ตามภาพ 3 — A4 แนวตั้ง แยกประเภท + ปก)   */
/* -------------------------------------------------------------------------- */
export interface LedgerSectionInput {
  id: string;
  fundTitle: string;
  transactions: Transaction[];
}

interface ComputedLedgerRow {
  month: string;
  day: string;
  doc: string;
  desc: string;
  rec: number;
  pay: number;
  bal: number;
  note: string;
  isOpening?: boolean;
}

export const OffBudgetLedgerOfficialForm: React.FC<{
  sections: LedgerSectionInput[];
  fy: number;
  settings: SchoolSettings;
  logo?: string;
  includeCover?: boolean;
  coverOnly?: boolean;
}> = ({ sections, fy, settings, logo, includeCover = true, coverOnly = false }) => {
  const ROWS_PER_PAGE = 29;
  const fyShortSpan = `${fy - 1}-${String(fy).slice(-2)}`;

  const renderFundPages = (sec: LedgerSectionInput) => {
    const normalized = sec.transactions
      .filter((t) => t.fy === fy)
      .map((t) => normalizeTransactionAccounting(t))
      .sort((a, b) => {
        if (a.kind === 'open' && b.kind !== 'open') return -1;
        if (a.kind !== 'open' && b.kind === 'open') return 1;
        return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
      });

    let running = 0;
    const rows: ComputedLedgerRow[] = normalized.map((t) => {
      const mIdx = Number(t.date.slice(5, 7)) - 1;
      const monthName = TH_MONTHS[mIdx] || '';
      const dayStr = t.date.slice(8, 10) || '';
      const recVal = t.kind === 'open' ? numRound(t.rec - t.pay) : numRound(t.rec);
      const payVal = t.kind === 'open' ? 0 : numRound(t.pay);
      running = numRound(running + recVal - payVal);
      return {
        month: monthName,
        day: dayStr,
        doc: t.doc === '-' ? '' : t.doc,
        desc: t.desc,
        rec: recVal,
        pay: payVal,
        bal: running,
        note: t.kind === 'open' ? 'ยอดยกมา' : t.kind === 'loan' ? 'เงินยืม' : t.kind === 'loanret' ? 'คืนเงินยืม' : '',
        isOpening: t.kind === 'open',
      };
    });

    const pages: ComputedLedgerRow[][] = [];
    if (rows.length === 0) {
      pages.push([]);
    } else {
      for (let i = 0; i < rows.length; i += ROWS_PER_PAGE) {
        pages.push(rows.slice(i, i + ROWS_PER_PAGE));
      }
    }

    return (
      <React.Fragment key={sec.id}>
        {(includeCover || coverOnly) && (
          <OffBudgetCoverPage
            fundTitle={sec.fundTitle}
            fy={fy}
            settings={settings}
            logo={logo}
          />
        )}

        {!coverOnly &&
          pages.map((pageRows, pIdx) => (
            <div
              key={`${sec.id}-page-${pIdx}`}
              className="pdf-page official-doc-form mx-auto bg-white text-black"
              style={{
                width: '100%',
                maxWidth: '794px',
                minHeight: '1040px',
                padding: '22px 26px',
                fontFamily: "'Sarabun', 'TH SarabunPSK', sans-serif",
                fontSize: '11.5px',
                lineHeight: 1.3,
                border: '1px solid #cbd5e1',
              }}
            >
              {/* Title matching ภาพ 3 */}
              <div style={{ textAlign: 'center', marginBottom: '8px' }}>
                <div style={{ fontSize: '17px', fontWeight: 700 }}>
                  ทะเบียนคุมเงินนอกงบประมาณ
                </div>
                <div style={{ fontSize: '15px', fontWeight: 700, marginTop: '2px' }}>
                  ประเภท {sec.fundTitle}
                </div>
                {pages.length > 1 && (
                  <div style={{ fontSize: '11px', color: '#475569' }}>
                    (แผ่นที่ {pIdx + 1} / {pages.length})
                  </div>
                )}
              </div>

              {/* Exact 8-column A4 Portrait table matching ภาพ 3 */}
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  tableLayout: 'fixed',
                  border: '1.5px solid #000000',
                  fontSize: '11px',
                }}
              >
                <colgroup>
                  <col style={{ width: '9.5%' }} />
                  <col style={{ width: '4.5%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '31%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '9%' }} />
                </colgroup>
                <thead>
                  <tr style={{ backgroundColor: '#ffffff', fontWeight: 700, textAlign: 'center' }}>
                    <th colSpan={2} style={{ border: '1px solid #000', padding: '4px 2px' }}>
                      พ.ศ. {fyShortSpan}
                    </th>
                    <th rowSpan={2} style={{ border: '1px solid #000', padding: '4px 2px' }}>
                      ที่เอกสาร
                    </th>
                    <th rowSpan={2} style={{ border: '1px solid #000', padding: '4px 4px' }}>
                      รายการ
                    </th>
                    <th rowSpan={2} style={{ border: '1px solid #000', padding: '4px 3px' }}>
                      รับ
                    </th>
                    <th rowSpan={2} style={{ border: '1px solid #000', padding: '4px 3px' }}>
                      จ่าย
                    </th>
                    <th rowSpan={2} style={{ border: '1px solid #000', padding: '4px 3px' }}>
                      คงเหลือ
                    </th>
                    <th rowSpan={2} style={{ border: '1px solid #000', padding: '4px 2px' }}>
                      หมายเหตุ
                    </th>
                  </tr>
                  <tr style={{ backgroundColor: '#ffffff', fontWeight: 700, textAlign: 'center' }}>
                    <th style={{ border: '1px solid #000', padding: '3px 2px' }}>เดือน</th>
                    <th style={{ border: '1px solid #000', padding: '3px 2px' }}>วันที่</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: ROWS_PER_PAGE }).map((_, rIdx) => {
                    const row = pageRows[rIdx];
                    const bottomStyle =
                      rIdx === ROWS_PER_PAGE - 1 ? '1.5px solid #000' : '1px dotted #64748b';
                    return (
                      <tr key={rIdx} style={{ height: '27px' }}>
                        <td
                          style={{
                            borderLeft: '1px solid #000',
                            borderRight: '1px solid #000',
                            borderBottom: bottomStyle,
                            padding: '2px 3px',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {row?.month || ''}
                        </td>
                        <td
                          className="tabular-nums"
                          style={{
                            borderRight: '1px solid #000',
                            borderBottom: bottomStyle,
                            padding: '2px 2px',
                            textAlign: 'center',
                          }}
                        >
                          {row?.day || ''}
                        </td>
                        <td
                          style={{
                            borderRight: '1px solid #000',
                            borderBottom: bottomStyle,
                            padding: '2px 3px',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {row?.doc || ''}
                        </td>
                        <td
                          style={{
                            borderRight: '1px solid #000',
                            borderBottom: bottomStyle,
                            padding: '2px 4px',
                            fontWeight: row?.isOpening ? 600 : 400,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {row?.desc || ''}
                        </td>
                        <td
                          className="tabular-nums"
                          style={{
                            borderRight: '1px solid #000',
                            borderBottom: bottomStyle,
                            padding: '2px 4px',
                            textAlign: 'right',
                          }}
                        >
                          {row && row.rec > 0 ? fmt(row.rec) : ''}
                        </td>
                        <td
                          className="tabular-nums"
                          style={{
                            borderRight: '1px solid #000',
                            borderBottom: bottomStyle,
                            padding: '2px 4px',
                            textAlign: 'right',
                          }}
                        >
                          {row && row.pay > 0 ? fmt(row.pay) : ''}
                        </td>
                        <td
                          className="tabular-nums"
                          style={{
                            borderRight: '1px solid #000',
                            borderBottom: bottomStyle,
                            padding: '2px 4px',
                            textAlign: 'right',
                            fontWeight: row ? 600 : 400,
                          }}
                        >
                          {row ? fmt(row.bal) : ''}
                        </td>
                        <td
                          style={{
                            borderRight: '1px solid #000',
                            borderBottom: bottomStyle,
                            padding: '2px 3px',
                            fontSize: '10px',
                            textAlign: 'center',
                          }}
                        >
                          {row?.note || ''}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
      </React.Fragment>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {sections.map((sec) => renderFundPages(sec))}
    </div>
  );
};

export function buildFundLedgerSections(
  funds: FundType[],
  transactions: Transaction[],
  fy: number,
  mode: 'single' | 'all_active' | 'all_funds',
  selectedFundId: string
): LedgerSectionInput[] {
  const fyTx = transactions.filter((t) => t.fy === fy);
  if (mode === 'single') {
    const f = funds.find((x) => x.id === selectedFundId) || funds[0];
    if (!f) return [];
    return [
      {
        id: f.id,
        fundTitle: f.name,
        transactions: fyTx.filter((t) => t.fund === f.id),
      },
    ];
  }
  const list =
    mode === 'all_active'
      ? funds.filter((f) => fyTx.some((t) => t.fund === f.id))
      : funds;
  return (list.length > 0 ? list : funds.slice(0, 1)).map((f) => ({
    id: f.id,
    fundTitle: f.name,
    transactions: fyTx.filter((t) => t.fund === f.id),
  }));
}

/* -------------------------------------------------------------------------- */
/* 5. ทะเบียนคุมใบเสร็จรับเงิน (ตามภาพ 2 — A4 แนวนอน)                          */
/* -------------------------------------------------------------------------- */
interface ReceiptLedgerRow {
  dateText: string;
  desc: string;
  recQty: string;
  recRange: string;
  payQty: string;
  payRange: string;
  balQty: string;
  balRange: string;
  receiverSig: string;
}

export const ReceiptControlOfficialForm: React.FC<{
  receiptReqs: ReceiptRequisition[];
  receipts: ReceiptControlEntry[];
  fy: number;
  schoolName: string;
  startFy?: number;
  endFy?: number;
}> = ({ receiptReqs, receipts, fy, schoolName, startFy, endFy }) => {
  const ROWS_PER_PAGE = 14;
  const sortedReqs = [...receiptReqs].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const entries: ReceiptLedgerRow[] = [];
  let runningBooks = 0;

  if (sortedReqs.length > 0) {
    sortedReqs.forEach((rq) => {
      const cleanType = rq.bookType.replace(/^\[(รับ|จ่าย)\]\s*/, '').trim();
      const isReceive = rq.bookType.startsWith('[รับ]');
      if (isReceive) {
        const qty = Number(rq.qtyRequested) || 0;
        runningBooks += qty;
        entries.push({
          dateText: thDate(rq.date),
          desc: cleanType || 'รับใบเสร็จรับเงินเข้าคลัง',
          recQty: qty ? String(qty) : '',
          recRange: rq.rangeNote || '',
          payQty: '',
          payRange: '',
          balQty: String(runningBooks),
          balRange: rq.rangeNote || '',
          receiverSig: rq.requester || '',
        });
      } else {
        const qty = Number(rq.qtyIssued) || Number(rq.qtyRequested) || 0;
        runningBooks = Math.max(0, runningBooks - qty);
        entries.push({
          dateText: thDate(rq.date),
          desc: cleanType ? `จ่าย${cleanType}` : 'เบิกจ่ายใบเสร็จรับเงิน',
          recQty: '',
          recRange: '',
          payQty: qty ? String(qty) : '',
          payRange: rq.rangeNote || '',
          balQty: runningBooks > 0 ? String(runningBooks) : '-',
          balRange: '',
          receiverSig: rq.requester || '',
        });
      }
    });
  } else if (receipts.length > 0) {
    // Fallback summary grouped by receipt book when no requisition book entries exist yet
    const byBook = new Map<string, ReceiptControlEntry[]>();
    receipts
      .filter((r) => r.fy === fy)
      .forEach((r) => {
        const k = r.bookNo || 'เล่ม 1';
        if (!byBook.has(k)) byBook.set(k, []);
        byBook.get(k)!.push(r);
      });
    byBook.forEach((list, bookNo) => {
      const first = list[0];
      const last = list[list.length - 1];
      const range =
        first.receiptNo === last.receiptNo
          ? `${bookNo} - เลขที่ ${first.receiptNo}`
          : `${bookNo} - เลขที่ ${first.receiptNo}-${last.receiptNo}`;
      entries.push({
        dateText: thDate(first.date),
        desc: `ใช้ใบเสร็จรับเงิน (${list.length} ฉบับ)`,
        recQty: '',
        recRange: '',
        payQty: '1',
        payRange: range,
        balQty: '-',
        balRange: '',
        receiverSig: first.collector || '',
      });
    });
  }

  const totalPages = Math.max(1, Math.ceil(entries.length / ROWS_PER_PAGE));
  const pages = Array.from({ length: totalPages }, (_, idx) =>
    entries.slice(idx * ROWS_PER_PAGE, (idx + 1) * ROWS_PER_PAGE)
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {pages.map((pageRows, pageIdx) => (
        <div
          key={`rc-page-${pageIdx}`}
          className="pdf-page official-doc-form mx-auto bg-white text-black"
          style={{
            width: '100%',
            maxWidth: '1122px',
            minHeight: '760px',
            padding: '28px 34px',
            fontFamily: "'Sarabun', 'TH SarabunPSK', sans-serif",
            fontSize: '12.5px',
            lineHeight: 1.4,
            border: '1px solid #e2e8f0',
          }}
        >
          {/* Header matching ภาพ 2 */}
          <div style={{ textAlign: 'center', marginBottom: '14px' }}>
            <div style={{ fontSize: '18px', fontWeight: 700 }}>ทะเบียนคุมใบเสร็จรับเงิน</div>
            <div style={{ fontSize: '14px', marginTop: '4px' }}>
              โรงเรียน{' '}
              <span style={{ borderBottom: '1px dotted #334155', padding: '0 22px' }}>
                {schoolName || '..............................................................'}
              </span>
            </div>
            <div style={{ fontSize: '13.5px', marginTop: '3px' }}>
              เริ่มปีงบประมาณ พ.ศ.{' '}
              <span style={{ borderBottom: '1px dotted #334155', padding: '0 14px' }}>
                {startFy || fy}
              </span>
              ถึง พ.ศ.{' '}
              <span style={{ borderBottom: '1px dotted #334155', padding: '0 14px' }}>
                {endFy || fy}
              </span>
            </div>
          </div>

          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              tableLayout: 'fixed',
              border: '1.5px solid #000000',
              fontSize: '12px',
            }}
          >
            <colgroup>
              <col style={{ width: '11%' }} />
              <col style={{ width: '23%' }} />
              <col style={{ width: '6.5%' }} />
              <col style={{ width: '11.5%' }} />
              <col style={{ width: '6.5%' }} />
              <col style={{ width: '11.5%' }} />
              <col style={{ width: '6.5%' }} />
              <col style={{ width: '11.5%' }} />
              <col style={{ width: '12%' }} />
            </colgroup>
            <thead>
              <tr>
                <th
                  rowSpan={2}
                  style={{
                    border: '1px solid #000',
                    padding: '6px 4px',
                    textAlign: 'center',
                    verticalAlign: 'middle',
                    fontWeight: 700,
                    backgroundColor: '#ffffff',
                  }}
                >
                  วัน เดือน ปี
                </th>
                <th
                  rowSpan={2}
                  style={{
                    border: '1px solid #000',
                    padding: '6px 4px',
                    textAlign: 'center',
                    verticalAlign: 'middle',
                    fontWeight: 700,
                    backgroundColor: '#ffffff',
                  }}
                >
                  รายการ
                </th>
                <th
                  colSpan={2}
                  style={{
                    border: '1px solid #000',
                    padding: '4px 4px',
                    textAlign: 'center',
                    fontWeight: 700,
                    backgroundColor: '#ffffff',
                  }}
                >
                  รับ
                </th>
                <th
                  colSpan={2}
                  style={{
                    border: '1px solid #000',
                    padding: '4px 4px',
                    textAlign: 'center',
                    fontWeight: 700,
                    backgroundColor: '#ffffff',
                  }}
                >
                  จ่าย
                </th>
                <th
                  colSpan={2}
                  style={{
                    border: '1px solid #000',
                    padding: '4px 4px',
                    textAlign: 'center',
                    fontWeight: 700,
                    backgroundColor: '#ffffff',
                  }}
                >
                  คงเหลือ
                </th>
                <th
                  rowSpan={2}
                  style={{
                    border: '1px solid #000',
                    padding: '6px 4px',
                    textAlign: 'center',
                    verticalAlign: 'middle',
                    fontWeight: 700,
                    backgroundColor: '#ffffff',
                  }}
                >
                  ลายเซ็นผู้รับ
                  <br />
                  ใบเสร็จ
                </th>
              </tr>
              <tr>
                {['จำนวน', 'เล่มที่ – เลขที่', 'จำนวน', 'เล่มที่ – เลขที่', 'จำนวน', 'เล่มที่ – เลขที่'].map(
                  (lbl, idx) => (
                    <th
                      key={idx}
                      style={{
                        border: '1px solid #000',
                        padding: '4px 3px',
                        textAlign: 'center',
                        fontWeight: 700,
                        backgroundColor: '#ffffff',
                        fontSize: '11.5px',
                      }}
                    >
                      {lbl}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: ROWS_PER_PAGE }).map((_, rIdx) => {
                const row = pageRows[rIdx];
                return (
                  <tr key={rIdx} style={{ height: '32px' }}>
                    <td style={{ border: '1px solid #000', padding: '4px 5px', textAlign: 'center', fontSize: '11px' }}>
                      {row?.dateText || ''}
                    </td>
                    <td style={{ border: '1px solid #000', padding: '4px 6px', fontSize: '11.5px' }}>
                      {row?.desc || ''}
                    </td>
                    <td className="tabular-nums" style={{ border: '1px solid #000', padding: '4px 4px', textAlign: 'center' }}>
                      {row?.recQty || ''}
                    </td>
                    <td style={{ border: '1px solid #000', padding: '4px 5px', textAlign: 'center', fontSize: '11px' }}>
                      {row?.recRange || ''}
                    </td>
                    <td className="tabular-nums" style={{ border: '1px solid #000', padding: '4px 4px', textAlign: 'center' }}>
                      {row?.payQty || ''}
                    </td>
                    <td style={{ border: '1px solid #000', padding: '4px 5px', textAlign: 'center', fontSize: '11px' }}>
                      {row?.payRange || ''}
                    </td>
                    <td className="tabular-nums" style={{ border: '1px solid #000', padding: '4px 4px', textAlign: 'center' }}>
                      {row?.balQty || ''}
                    </td>
                    <td style={{ border: '1px solid #000', padding: '4px 5px', textAlign: 'center', fontSize: '11px' }}>
                      {row?.balRange || ''}
                    </td>
                    <td style={{ border: '1px solid #000', padding: '4px 5px', textAlign: 'center', fontSize: '11px' }}>
                      {row?.receiverSig || ''}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* 6. ทะเบียนคุมการใช้จ่ายเงินโครงการตามแผนปฏิบัติการประจำปี (ตามภาพ 3)        */
/* -------------------------------------------------------------------------- */
type ProjectExpenseCat = 'tempWage' | 'comp' | 'supplies' | 'material' | 'equip';

function classifyProjectExpense(text: string): ProjectExpenseCat {
  const s = (text || '').trim();
  if (/จ้างชั่วคราว|ค่าจ้าง|ลูกจ้าง|แม่ครัว|ค่าแรง/.test(s)) return 'tempWage';
  if (/ค่าตอบแทน|วิทยากร|เบี้ยเลี้ยง|กรรมการ|ล่วงเวลา|สอนพิเศษ/.test(s)) return 'comp';
  if (/ครุภัณฑ์|คอมพิวเตอร์|ปริ้นเตอร์|เครื่องพิมพ์|โปรเจคเตอร์|เครื่องปรับอากาศ|ตู้เหล็ก|โต๊ะ|เก้าอี้/.test(s))
    return 'equip';
  if (/วัสดุ|อาหารสด|อาหารแห้ง|อาหารกลางวัน|เครื่องเขียน|กระดาษ|อุปกรณ์การเรียน|หนังสือ|เครื่องแบบ|น้ำมัน/.test(s))
    return 'material';
  return 'supplies';
}

interface ProjectRowItem {
  dateText: string;
  docNo: string;
  desc: string;
  rec: number;
  tempWage: number;
  comp: number;
  supplies: number;
  material: number;
  equip: number;
  bal: number;
  note: string;
  isSummary?: boolean;
}

export const ProjectExpenditureControlForm: React.FC<{
  plans: BudgetPlan[];
  requests: BudgetRequest[];
  transactions: Transaction[];
  funds: FundType[];
  fy: number;
  schoolName: string;
  selectedPlanId?: string;
}> = ({ plans, requests, transactions, funds, fy, schoolName, selectedPlanId = 'ALL' }) => {
  const fyPlans = plans.filter((p) => p.fy === fy);
  const targetPlans =
    selectedPlanId === 'ALL'
      ? fyPlans
      : fyPlans.filter((p) => p.id === selectedPlanId);

  const txMap = new Map<string, Transaction>();
  transactions.forEach((t) => txMap.set(t.id, t));

  const getFundTitle = (fundId: string) =>
    funds.find((f) => f.id === fundId)?.name || fundId || '..................................';

  const ROWS_PER_PAGE = 11;

  const renderProjectPages = (
    plan: BudgetPlan | null,
    planIdx: number,
    totalPlansCount: number
  ) => {
    const projectReqs = plan
      ? requests
          .filter(
            (r) =>
              r.fy === fy &&
              (r.plan === plan.id || r.project === plan.project) &&
              (r.status === 'อนุมัติแล้ว' || r.status === 'จ่ายเงินแล้ว')
          )
          .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      : [];

    const rows: ProjectRowItem[] = [];
    let runningBal = plan ? numRound(plan.amount) : 0;

    if (plan) {
      rows.push({
        dateText: `1 ต.ค. ${String(fy - 1).slice(-2)}`,
        docNo: 'แผนฯ',
        desc: `ได้รับจัดสรรงบประมาณ (${plan.project})`,
        rec: numRound(plan.amount),
        tempWage: 0,
        comp: 0,
        supplies: 0,
        material: 0,
        equip: 0,
        bal: runningBal,
        note: plan.dept || '',
      });

      projectReqs.forEach((req) => {
        const linkedTx = req.txId ? txMap.get(req.txId) : undefined;
        const amt = numRound(req.amount);
        runningBal = numRound(runningBal - amt);
        const cat = classifyProjectExpense(`${req.item} ${plan.note || ''}`);
        rows.push({
          dateText: thDate(req.date),
          docNo: linkedTx?.doc || req.id,
          desc: req.item,
          rec: 0,
          tempWage: cat === 'tempWage' ? amt : 0,
          comp: cat === 'comp' ? amt : 0,
          supplies: cat === 'supplies' ? amt : 0,
          material: cat === 'material' ? amt : 0,
          equip: cat === 'equip' ? amt : 0,
          bal: runningBal,
          note: req.person || req.status,
        });
      });
    }

    const totRec = numRound(rows.reduce((s, r) => s + r.rec, 0));
    const totTw = numRound(rows.reduce((s, r) => s + r.tempWage, 0));
    const totCp = numRound(rows.reduce((s, r) => s + r.comp, 0));
    const totSp = numRound(rows.reduce((s, r) => s + r.supplies, 0));
    const totMt = numRound(rows.reduce((s, r) => s + r.material, 0));
    const totEq = numRound(rows.reduce((s, r) => s + r.equip, 0));

    const totalPagesForPlan = Math.max(1, Math.ceil(Math.max(1, rows.length) / ROWS_PER_PAGE));

    return Array.from({ length: totalPagesForPlan }).map((_, pIdx) => {
      const slice = rows.slice(pIdx * ROWS_PER_PAGE, (pIdx + 1) * ROWS_PER_PAGE);
      const isLast = pIdx === totalPagesForPlan - 1;
      const pageNumText =
        totalPlansCount > 0 ? `${planIdx + 1}` : '1';
      const totalNumText =
        totalPlansCount > 0 ? `${totalPlansCount}` : '1';

      return (
        <div
          key={`proj-${plan?.id || 'empty'}-${pIdx}`}
          className="pdf-page official-doc-form mx-auto bg-white text-black"
          style={{
            width: '100%',
            maxWidth: '1122px',
            minHeight: '760px',
            padding: '24px 30px',
            fontFamily: "'Sarabun', 'TH SarabunPSK', sans-serif",
            fontSize: '12px',
            lineHeight: 1.38,
            border: '1px solid #e2e8f0',
          }}
        >
          {/* Top-right box matching ภาพ 3 */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '4px' }}>
            <div
              style={{
                border: '1.5px solid #000000',
                padding: '6px 10px',
                minWidth: '250px',
                fontSize: '11.5px',
                lineHeight: 1.5,
              }}
            >
              <div>
                โครงการหน้า......{pageNumText}......ถึง......{totalNumText}......(10)
              </div>
              <div>
                ใช้เงิน{' '}
                <span style={{ borderBottom: '1px dotted #334155', padding: '0 6px', fontWeight: 600 }}>
                  {plan ? getFundTitle(plan.fund) : '..............................'}
                </span>{' '}
                (11)
              </div>
            </div>
          </div>

          {/* Center header matching ภาพ 3 */}
          <div style={{ textAlign: 'center', marginBottom: '12px' }}>
            <div style={{ fontSize: '14px' }}>
              โรงเรียน{' '}
              <span style={{ borderBottom: '1px dotted #334155', padding: '0 16px' }}>
                {schoolName || '........................................'}
              </span>
            </div>
            <div style={{ fontSize: '16px', fontWeight: 700, marginTop: '3px' }}>
              ทะเบียนคุมการใช้จ่ายเงินโครงการตามแผนปฏิบัติการประจำปีของโรงเรียน
            </div>
            <div style={{ fontSize: '13.5px', marginTop: '2px' }}>
              ประจำปีงบประมาณ / ปีการศึกษา .......(1) {fy} .......
            </div>
            <div style={{ fontSize: '13.5px', marginTop: '2px' }}>
              โครงการ{' '}
              <span style={{ borderBottom: '1px dotted #334155', padding: '0 14px', fontWeight: 600 }}>
                {plan ? `(2) ${plan.project}` : '..................(2)................................................'}
              </span>
            </div>
          </div>

          {/* Exact 12-Column Table matching ภาพ 3 */}
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              tableLayout: 'fixed',
              border: '1.5px solid #000000',
              fontSize: '11px',
            }}
          >
            <colgroup>
              <col style={{ width: '9%' }} />
              <col style={{ width: '7.5%' }} />
              <col style={{ width: '19.5%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '7.5%' }} />
              <col style={{ width: '7.5%' }} />
              <col style={{ width: '7.5%' }} />
              <col style={{ width: '7.5%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '9%' }} />
            </colgroup>
            <thead>
              <tr>
                <th rowSpan={2} style={{ border: '1px solid #000', padding: '4px 3px', textAlign: 'center', backgroundColor: '#ffffff' }}>
                  วันเดือนปี
                  <br />
                  (3)
                </th>
                <th rowSpan={2} style={{ border: '1px solid #000', padding: '4px 3px', textAlign: 'center', backgroundColor: '#ffffff' }}>
                  ที่เอกสาร
                  <br />
                  (4)
                </th>
                <th rowSpan={2} style={{ border: '1px solid #000', padding: '4px 3px', textAlign: 'center', backgroundColor: '#ffffff' }}>
                  รายการ
                  <br />
                  (5)
                </th>
                <th rowSpan={2} style={{ border: '1px solid #000', padding: '4px 3px', textAlign: 'center', backgroundColor: '#ffffff' }}>
                  รับ
                  <br />
                  (6)
                </th>
                <th colSpan={5} style={{ border: '1px solid #000', padding: '4px 3px', textAlign: 'center', backgroundColor: '#ffffff' }}>
                  จ่าย &nbsp; (7)
                </th>
                <th rowSpan={2} style={{ border: '1px solid #000', padding: '4px 3px', textAlign: 'center', backgroundColor: '#ffffff' }}>
                  คงเหลือ
                  <br />
                  (8)
                </th>
                <th rowSpan={2} style={{ border: '1px solid #000', padding: '4px 3px', textAlign: 'center', backgroundColor: '#ffffff' }}>
                  หมายเหตุ
                  <br />
                  (9)
                </th>
              </tr>
              <tr>
                {['ค่าจ้าง\nชั่วคราว', 'ค่าตอบแทน', 'ค่าใช้สอย', 'ค่าวัสดุ', 'ค่าครุภัณฑ์'].map((lbl, idx) => (
                  <th
                    key={idx}
                    style={{
                      border: '1px solid #000',
                      padding: '4px 2px',
                      textAlign: 'center',
                      backgroundColor: '#ffffff',
                      whiteSpace: 'pre-line',
                      fontSize: '10.5px',
                    }}
                  >
                    {lbl}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: ROWS_PER_PAGE }).map((_, rIdx) => {
                const row = slice[rIdx];
                const cell = (v: number) => (v > 0.004 ? fmt(v) : '');
                return (
                  <tr key={rIdx} style={{ height: '30px' }}>
                    <td style={{ border: '1px solid #000', padding: '3px 4px', textAlign: 'center', fontSize: '10.5px' }}>
                      {row?.dateText || ''}
                    </td>
                    <td style={{ border: '1px solid #000', padding: '3px 4px', textAlign: 'center', fontSize: '10.5px' }}>
                      {row?.docNo || ''}
                    </td>
                    <td style={{ border: '1px solid #000', padding: '3px 5px', fontSize: '11px' }}>
                      {row?.desc || ''}
                    </td>
                    <td className="tabular-nums" style={{ border: '1px solid #000', padding: '3px 4px', textAlign: 'right' }}>
                      {row ? cell(row.rec) : ''}
                    </td>
                    <td className="tabular-nums" style={{ border: '1px solid #000', padding: '3px 4px', textAlign: 'right' }}>
                      {row ? cell(row.tempWage) : ''}
                    </td>
                    <td className="tabular-nums" style={{ border: '1px solid #000', padding: '3px 4px', textAlign: 'right' }}>
                      {row ? cell(row.comp) : ''}
                    </td>
                    <td className="tabular-nums" style={{ border: '1px solid #000', padding: '3px 4px', textAlign: 'right' }}>
                      {row ? cell(row.supplies) : ''}
                    </td>
                    <td className="tabular-nums" style={{ border: '1px solid #000', padding: '3px 4px', textAlign: 'right' }}>
                      {row ? cell(row.material) : ''}
                    </td>
                    <td className="tabular-nums" style={{ border: '1px solid #000', padding: '3px 4px', textAlign: 'right' }}>
                      {row ? cell(row.equip) : ''}
                    </td>
                    <td className="tabular-nums" style={{ border: '1px solid #000', padding: '3px 4px', textAlign: 'right', fontWeight: row ? 600 : 400 }}>
                      {row ? fmt(row.bal) : ''}
                    </td>
                    <td style={{ border: '1px solid #000', padding: '3px 4px', fontSize: '10.5px', textAlign: 'center' }}>
                      {row?.note || ''}
                    </td>
                  </tr>
                );
              })}

              {isLast && plan && (
                <tr style={{ fontWeight: 700, height: '30px' }}>
                  <td colSpan={3} style={{ border: '1px solid #000', padding: '4px 8px', textAlign: 'right' }}>
                    รวมทั้งโครงการ
                  </td>
                  <td className="tabular-nums" style={{ border: '1px solid #000', padding: '4px 4px', textAlign: 'right' }}>
                    {fmt(totRec)}
                  </td>
                  <td className="tabular-nums" style={{ border: '1px solid #000', padding: '4px 4px', textAlign: 'right' }}>
                    {totTw > 0 ? fmt(totTw) : '-'}
                  </td>
                  <td className="tabular-nums" style={{ border: '1px solid #000', padding: '4px 4px', textAlign: 'right' }}>
                    {totCp > 0 ? fmt(totCp) : '-'}
                  </td>
                  <td className="tabular-nums" style={{ border: '1px solid #000', padding: '4px 4px', textAlign: 'right' }}>
                    {totSp > 0 ? fmt(totSp) : '-'}
                  </td>
                  <td className="tabular-nums" style={{ border: '1px solid #000', padding: '4px 4px', textAlign: 'right' }}>
                    {totMt > 0 ? fmt(totMt) : '-'}
                  </td>
                  <td className="tabular-nums" style={{ border: '1px solid #000', padding: '4px 4px', textAlign: 'right' }}>
                    {totEq > 0 ? fmt(totEq) : '-'}
                  </td>
                  <td className="tabular-nums" style={{ border: '1px solid #000', padding: '4px 4px', textAlign: 'right' }}>
                    {fmt(runningBal)}
                  </td>
                  <td style={{ border: '1px solid #000', padding: '4px 4px', textAlign: 'center', fontSize: '10.5px' }}>
                    {totRec > 0 ? `ใช้ ${(((totRec - runningBal) / totRec) * 100).toFixed(1)}%` : ''}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      );
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {targetPlans.length === 0
        ? renderProjectPages(null, 0, 0)
        : targetPlans.map((plan, idx) => renderProjectPages(plan, idx, targetPlans.length))}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* 7. แบบสรุปการรับ-การจ่าย-การนำส่ง-การนำฝากเงินประจำวัน (ตามภาพ 4)          */
/* -------------------------------------------------------------------------- */
export const DailyReceivePayDepositForm: React.FC<{
  transactions: Transaction[];
  receipts: ReceiptControlEntry[];
  date: string;
  schoolName: string;
  financeName?: string;
  director?: string;
  sigFinance?: string;
  sigDirector?: string;
  showSignatures?: boolean;
}> = ({
  transactions,
  receipts,
  date,
  schoolName,
  financeName,
  director,
  sigFinance,
  sigDirector,
  showSignatures = true,
}) => {
  const dayTxs = transactions
    .filter((t) => t.date === date && t.kind !== 'open')
    .map((t) => normalizeTransactionAccounting(t));

  const isDepositOrRemit = (t: Transaction) =>
    /นำฝาก|ฝากธนาคาร|นำส่ง|ส่งคลัง|ส่งรายได้/.test(`${t.desc} ${t.doc}`);

  const recItems: Array<{ receiptNo: string; desc: string; amount: number; note: string }> = [];
  const payItems: Array<{ desc: string; amount: number; note: string }> = [];
  const depItems: Array<{ desc: string; amount: number; note: string }> = [];

  dayTxs.forEach((t) => {
    if (isDepositOrRemit(t)) {
      const amt = numRound(t.rec > 0 ? t.rec : t.pay);
      if (amt > 0) {
        depItems.push({ desc: t.desc, amount: amt, note: t.doc || '' });
      }
      return;
    }
    if (t.rec > 0) {
      recItems.push({
        receiptNo: t.doc || '-',
        desc: t.desc,
        amount: numRound(t.rec),
        note: t.loc === 'bank' ? 'โอนเข้าธนาคาร' : '',
      });
    }
    if (t.pay > 0) {
      payItems.push({
        desc: `${t.doc ? `${t.doc} ` : ''}${t.desc}`,
        amount: numRound(t.pay),
        note: '',
      });
    }
  });

  // Include standalone receipt register entries from that date if not already duplicated in transactions
  receipts
    .filter((r) => r.date === date && !r.cancelled && r.amount > 0)
    .forEach((r) => {
      const exists = recItems.some(
        (x) => x.receiptNo.includes(r.receiptNo) || (Math.abs(x.amount - r.amount) < 0.01 && x.desc.includes(r.desc))
      );
      if (!exists) {
        recItems.push({
          receiptNo: `${r.bookNo ? `${r.bookNo}/` : ''}${r.receiptNo}`,
          desc: `${r.desc}${r.payer && r.payer !== '-' ? ` (${r.payer})` : ''}`,
          amount: numRound(r.amount),
          note: '',
        });
      }
    });

  const maxRows = Math.max(recItems.length, payItems.length, depItems.length);
  const ROWS_COUNT = Math.max(12, maxRows);

  const totRec = numRound(recItems.reduce((s, x) => s + x.amount, 0));
  const totPay = numRound(payItems.reduce((s, x) => s + x.amount, 0));
  const totDep = numRound(depItems.reduce((s, x) => s + x.amount, 0));

  return (
    <div
      className="pdf-page official-doc-form mx-auto bg-white text-black"
      style={{
        width: '100%',
        maxWidth: '1122px',
        minHeight: '760px',
        padding: '28px 34px',
        fontFamily: "'Sarabun', 'TH SarabunPSK', sans-serif",
        fontSize: '12.5px',
        lineHeight: 1.4,
        border: '1px solid #e2e8f0',
      }}
    >
      {/* Header matching ภาพ 4 */}
      <div style={{ textAlign: 'center', marginBottom: '14px' }}>
        <div style={{ fontSize: '14.5px' }}>
          โรงเรียน{' '}
          <span style={{ borderBottom: '1px dotted #334155', padding: '0 16px' }}>
            {schoolName || '........................................'}
          </span>
        </div>
        <div style={{ fontSize: '16.5px', fontWeight: 700, marginTop: '4px' }}>
          แบบสรุปการรับ-การจ่าย-การนำส่ง-การนำฝากเงิน
        </div>
        <div style={{ fontSize: '14px', marginTop: '3px' }}>
          ประจำวันที่{' '}
          <span style={{ borderBottom: '1px dotted #334155', padding: '0 16px' }}>
            {thDate(date)}
          </span>
        </div>
      </div>

      {/* Exact 8-Column Table matching ภาพ 4 */}
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          tableLayout: 'fixed',
          border: '1.5px solid #000000',
          fontSize: '11.5px',
        }}
      >
        <colgroup>
          <col style={{ width: '11%' }} />
          <col style={{ width: '16%' }} />
          <col style={{ width: '10%' }} />
          <col style={{ width: '15%' }} />
          <col style={{ width: '10%' }} />
          <col style={{ width: '15%' }} />
          <col style={{ width: '10%' }} />
          <col style={{ width: '13%' }} />
        </colgroup>
        <thead>
          <tr>
            <th colSpan={3} style={{ border: '1px solid #000', padding: '5px 4px', textAlign: 'center', backgroundColor: '#ffffff' }}>
              รับ
            </th>
            <th colSpan={2} style={{ border: '1px solid #000', padding: '5px 4px', textAlign: 'center', backgroundColor: '#ffffff' }}>
              จ่าย
            </th>
            <th colSpan={2} style={{ border: '1px solid #000', padding: '5px 4px', textAlign: 'center', backgroundColor: '#ffffff' }}>
              นำฝาก/นำส่ง
            </th>
            <th rowSpan={2} style={{ border: '1px solid #000', padding: '5px 4px', textAlign: 'center', verticalAlign: 'middle', backgroundColor: '#ffffff' }}>
              หมายเหตุ
            </th>
          </tr>
          <tr>
            <th style={{ border: '1px solid #000', padding: '4px 3px', textAlign: 'center', backgroundColor: '#ffffff', lineHeight: 1.25 }}>
              เลขที่
              <br />
              ใบเสร็จรับเงิน
            </th>
            <th style={{ border: '1px solid #000', padding: '4px 3px', textAlign: 'center', backgroundColor: '#ffffff' }}>
              รายการ
            </th>
            <th style={{ border: '1px solid #000', padding: '4px 3px', textAlign: 'center', backgroundColor: '#ffffff' }}>
              จำนวนเงิน
            </th>
            <th style={{ border: '1px solid #000', padding: '4px 3px', textAlign: 'center', backgroundColor: '#ffffff' }}>
              รายการ
            </th>
            <th style={{ border: '1px solid #000', padding: '4px 3px', textAlign: 'center', backgroundColor: '#ffffff' }}>
              จำนวนเงิน
            </th>
            <th style={{ border: '1px solid #000', padding: '4px 3px', textAlign: 'center', backgroundColor: '#ffffff' }}>
              รายการ
            </th>
            <th style={{ border: '1px solid #000', padding: '4px 3px', textAlign: 'center', backgroundColor: '#ffffff' }}>
              จำนวนเงิน
            </th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: ROWS_COUNT }).map((_, i) => {
            const r = recItems[i];
            const p = payItems[i];
            const d = depItems[i];
            const note = [r?.note, p?.note, d?.note].filter(Boolean).join(', ');
            return (
              <tr key={i} style={{ height: '30px' }}>
                <td style={{ border: '1px solid #000', padding: '4px 4px', textAlign: 'center', fontSize: '11px' }}>
                  {r?.receiptNo || ''}
                </td>
                <td style={{ border: '1px solid #000', padding: '4px 5px', fontSize: '11px' }}>
                  {r?.desc || ''}
                </td>
                <td className="tabular-nums" style={{ border: '1px solid #000', padding: '4px 5px', textAlign: 'right' }}>
                  {r ? fmt(r.amount) : ''}
                </td>
                <td style={{ border: '1px solid #000', padding: '4px 5px', fontSize: '11px' }}>
                  {p?.desc || ''}
                </td>
                <td className="tabular-nums" style={{ border: '1px solid #000', padding: '4px 5px', textAlign: 'right' }}>
                  {p ? fmt(p.amount) : ''}
                </td>
                <td style={{ border: '1px solid #000', padding: '4px 5px', fontSize: '11px' }}>
                  {d?.desc || ''}
                </td>
                <td className="tabular-nums" style={{ border: '1px solid #000', padding: '4px 5px', textAlign: 'right' }}>
                  {d ? fmt(d.amount) : ''}
                </td>
                <td style={{ border: '1px solid #000', padding: '4px 5px', fontSize: '10.5px', textAlign: 'center' }}>
                  {note}
                </td>
              </tr>
            );
          })}
          {/* Total Row */}
          <tr style={{ fontWeight: 700, height: '32px' }}>
            <td colSpan={2} style={{ border: '1px solid #000', padding: '4px 8px', textAlign: 'right' }}>
              รวมรับ
            </td>
            <td className="tabular-nums" style={{ border: '1px solid #000', padding: '4px 5px', textAlign: 'right' }}>
              {totRec > 0 ? fmt(totRec) : '-'}
            </td>
            <td style={{ border: '1px solid #000', padding: '4px 8px', textAlign: 'right' }}>
              รวมจ่าย
            </td>
            <td className="tabular-nums" style={{ border: '1px solid #000', padding: '4px 5px', textAlign: 'right' }}>
              {totPay > 0 ? fmt(totPay) : '-'}
            </td>
            <td style={{ border: '1px solid #000', padding: '4px 8px', textAlign: 'right' }}>
              รวมนำฝาก/นำส่ง
            </td>
            <td className="tabular-nums" style={{ border: '1px solid #000', padding: '4px 5px', textAlign: 'right' }}>
              {totDep > 0 ? fmt(totDep) : '-'}
            </td>
            <td style={{ border: '1px solid #000', padding: '4px 5px', textAlign: 'center' }} />
          </tr>
        </tbody>
      </table>

      {/* Sign-off block */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '32px',
          marginTop: '24px',
          textAlign: 'center',
          fontSize: '12px',
        }}
      >
        <div>
          {showSignatures && sigFinance && (
            <img
              src={sigFinance}
              alt="ลายเซ็นเจ้าหน้าที่การเงิน"
              style={{ height: '36px', margin: '0 auto 3px auto', objectFit: 'contain' }}
            />
          )}
          <div>ลงชื่อ......................................................เจ้าหน้าที่การเงิน</div>
          <div style={{ marginTop: '3px' }}>({financeName || '..............................................'})</div>
        </div>
        <div>
          {showSignatures && sigDirector && (
            <img
              src={sigDirector}
              alt="ลายเซ็นผู้อำนวยการ"
              style={{ height: '36px', margin: '0 auto 3px auto', objectFit: 'contain' }}
            />
          )}
          <div>ลงชื่อ......................................................ผู้อำนวยการสถานศึกษา</div>
          <div style={{ marginTop: '3px' }}>({director || '..............................................'})</div>
        </div>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* 8. รายงานการรับ – จ่ายเงินรายได้สถานศึกษาประจำปีงบประมาณ (ตามภาพ 5)        */
/* -------------------------------------------------------------------------- */
function splitBahtSatang(amount: number): [string, string] {
  if (Math.abs(amount) < 0.005) return ['', ''];
  const fixed = numRound(amount).toFixed(2);
  const [intStr, decStr] = fixed.split('.');
  const n = Number(intStr);
  return [n.toLocaleString('en-US'), decStr];
}

export const SchoolIncomeAnnualReportForm: React.FC<{
  transactions: Transaction[];
  fy: number;
  asOfDate: string;
  settings: SchoolSettings;
  customLabels?: {
    rec61: string;
    rec62: string;
    rec63: string;
    pay51: string;
    pay52: string;
  };
}> = ({ transactions, fy, asOfDate, settings, customLabels }) => {
  const f10Txs = transactions
    .filter((t) => t.fy === fy && t.fund === 'F10' && (!asOfDate || t.date <= asOfDate))
    .map((t) => normalizeTransactionAccounting(t));

  let openBal = 0;
  const rBuckets = {
    r1: 0,
    r2: 0,
    r3: 0,
    r41: 0,
    r42: 0,
    r5: 0,
    r61: 0,
    r62: 0,
    r63: 0,
  };
  const pBuckets = {
    p1: 0,
    p21: 0,
    p22: 0,
    p23: 0,
    p24: 0,
    p31: 0,
    p32: 0,
    p4: 0,
    p51: 0,
    p52: 0,
  };

  const extraRecNotes: string[] = [];
  const extraPayNotes: string[] = [];

  f10Txs.forEach((t) => {
    const desc = (t.desc || '').trim();
    if (t.kind === 'open') {
      openBal = numRound(openBal + (t.rec - t.pay));
      return;
    }
    if (t.rec > 0) {
      const val = numRound(t.rec);
      if (/ราชพัสดุ|เช่าที่|ค่าเช่า/.test(desc)) rBuckets.r1 = numRound(rBuckets.r1 + val);
      else if (/ลาศึกษา/.test(desc)) rBuckets.r2 = numRound(rBuckets.r2 + val);
      else if (/เบี้ยปรับ/.test(desc)) rBuckets.r3 = numRound(rBuckets.r3 + val);
      else if (/มอบให้|บริจาค|สนับสนุน/.test(desc)) {
        if (/ไม่ชัดแจ้ง|ทั่วไป/.test(desc)) rBuckets.r42 = numRound(rBuckets.r42 + val);
        else rBuckets.r41 = numRound(rBuckets.r41 + val);
      } else if (/บำรุงการศึกษา|ค่าเทอม/.test(desc)) rBuckets.r5 = numRound(rBuckets.r5 + val);
      else {
        // Put uncategorized F10 income into 6.1, 6.2, 6.3 sequentially
        if (!extraRecNotes.includes(desc) && desc) extraRecNotes.push(desc);
        const slot = extraRecNotes.indexOf(desc);
        if (slot <= 0) rBuckets.r61 = numRound(rBuckets.r61 + val);
        else if (slot === 1) rBuckets.r62 = numRound(rBuckets.r62 + val);
        else rBuckets.r63 = numRound(rBuckets.r63 + val);
      }
    }
    if (t.pay > 0) {
      const val = numRound(t.pay);
      if (/บุคลากร|เงินเดือน|ค่าจ้างประจำ|ลูกจ้าง/.test(desc)) pBuckets.p1 = numRound(pBuckets.p1 + val);
      else if (/ตอบแทน|วิทยากร|เบี้ยเลี้ยง|กรรมการ/.test(desc)) pBuckets.p21 = numRound(pBuckets.p21 + val);
      else if (/ใช้สอย|อบรม|ทัศนศึกษา|พาหนะ|ซ่อมแซม|จ้างเหมา/.test(desc)) pBuckets.p22 = numRound(pBuckets.p22 + val);
      else if (/วัสดุ|อุปกรณ์|เครื่องเขียน|อาหาร|น้ำมัน/.test(desc)) pBuckets.p23 = numRound(pBuckets.p23 + val);
      else if (/สาธารณูปโภค|ไฟฟ้า|ประปา|อินเทอร์เน็ต|โทรศัพท์/.test(desc)) pBuckets.p24 = numRound(pBuckets.p24 + val);
      else if (/ครุภัณฑ์|คอมพิวเตอร์|โต๊ะ|เก้าอี้|ตู้|แอร์/.test(desc)) pBuckets.p31 = numRound(pBuckets.p31 + val);
      else if (/ที่ดิน|สิ่งก่อสร้าง|อาคาร|ต่อเติม/.test(desc)) pBuckets.p32 = numRound(pBuckets.p32 + val);
      else if (/อุดหนุน/.test(desc)) pBuckets.p4 = numRound(pBuckets.p4 + val);
      else {
        if (!extraPayNotes.includes(desc) && desc) extraPayNotes.push(desc);
        const slot = extraPayNotes.indexOf(desc);
        if (slot <= 0) pBuckets.p51 = numRound(pBuckets.p51 + val);
        else pBuckets.p52 = numRound(pBuckets.p52 + val);
      }
    }
  });

  const rec4Total = numRound(rBuckets.r41 + rBuckets.r42);
  const rec6Total = numRound(rBuckets.r61 + rBuckets.r62 + rBuckets.r63);
  const totalRec = numRound(rBuckets.r1 + rBuckets.r2 + rBuckets.r3 + rec4Total + rBuckets.r5 + rec6Total);
  const openPlusRec = numRound(openBal + totalRec);

  const pay2Total = numRound(pBuckets.p21 + pBuckets.p22 + pBuckets.p23 + pBuckets.p24);
  const pay3Total = numRound(pBuckets.p31 + pBuckets.p32);
  const pay5Total = numRound(pBuckets.p51 + pBuckets.p52);
  const totalPay = numRound(pBuckets.p1 + pay2Total + pay3Total + pBuckets.p4 + pay5Total);

  const closingBal = numRound(openPlusRec - totalPay);

  const parsedAsOf = asOfDate ? asOfDate.split('-') : [];
  const dDay = parsedAsOf.length === 3 ? String(Number(parsedAsOf[2])) : '......';
  const dMonth = parsedAsOf.length === 3 ? TH_MONTHS[Number(parsedAsOf[1]) - 1] || '.............' : '.............';
  const dYear = parsedAsOf.length === 3 ? String(Number(parsedAsOf[0]) + 543) : String(fy);

  const l61 = customLabels?.rec61 || extraRecNotes[0] || '';
  const l62 = customLabels?.rec62 || extraRecNotes[1] || '';
  const l63 = customLabels?.rec63 || extraRecNotes[2] || '';
  const l51 = customLabels?.pay51 || extraPayNotes[0] || '';
  const l52 = customLabels?.pay52 || extraPayNotes[1] || '';

  const rows: Array<{
    label: string;
    indent?: number;
    amount: number | null;
    bold?: boolean;
    alignCenter?: boolean;
  }> = [
    { label: 'ยอดยกมาจากปีงบประมาณที่ผ่านมา', amount: openBal, bold: true, alignCenter: true },
    { label: 'รายรับ', amount: null, bold: true },
    { label: '1.  ผลประโยชน์จากที่ราชพัสดุ', indent: 1, amount: rBuckets.r1 },
    { label: '2.  เบี้ยปรับจากการผิดสัญญาลาศึกษา', indent: 1, amount: rBuckets.r2 },
    { label: '3.  เบี้ยปรับที่เกิดจากการผิดสัญญาการซื้อทรัพย์สินหรือจ้างทำของด้วยเงินงบประมาณ', indent: 1, amount: rBuckets.r3 },
    { label: '4.  เงินที่มีผู้มอบให้ โดย', indent: 1, amount: rec4Total },
    { label: '4.1  ระบุวัตถุประสงค์ชัดแจ้ง', indent: 2, amount: rBuckets.r41 },
    { label: '4.2  ระบุวัตถุประสงค์ไม่ชัดแจ้ง', indent: 2, amount: rBuckets.r42 },
    { label: '5.  เงินบำรุงการศึกษา', indent: 1, amount: rBuckets.r5 },
    { label: '6.  ผลประโยชน์อื่น ๆ', indent: 1, amount: rec6Total },
    { label: `6.1  ${l61 || '...............................................................'}`, indent: 2, amount: rBuckets.r61 },
    { label: `6.2  ${l62 || '...............................................................'}`, indent: 2, amount: rBuckets.r62 },
    { label: `6.3  ${l63 || '...............................................................'}`, indent: 2, amount: rBuckets.r63 },
    { label: 'รวมรายรับ', amount: totalRec, bold: true },
    { label: 'รวมยอดยกมาและรายรับ', amount: openPlusRec, bold: true },
    { label: 'รายจ่าย', amount: null, bold: true },
    { label: '1.  งบบุคลากร', indent: 1, amount: pBuckets.p1 },
    { label: '2.  งบดำเนินงาน', indent: 1, amount: pay2Total },
    { label: '2.1  ค่าตอบแทน', indent: 2, amount: pBuckets.p21 },
    { label: '2.2  ค่าใช้สอย', indent: 2, amount: pBuckets.p22 },
    { label: '2.3  ค่าวัสดุ', indent: 2, amount: pBuckets.p23 },
    { label: '2.4  ค่าสาธารณูปโภค', indent: 2, amount: pBuckets.p24 },
    { label: '3.  งบลงทุน', indent: 1, amount: pay3Total },
    { label: '3.1  ค่าครุภัณฑ์', indent: 2, amount: pBuckets.p31 },
    { label: '3.2  ค่าที่ดินและสิ่งก่อสร้าง', indent: 2, amount: pBuckets.p32 },
    { label: '4.  งบเงินอุดหนุน', indent: 1, amount: pBuckets.p4 },
    { label: '5.  อื่น ๆ', indent: 1, amount: pay5Total },
    { label: `5.1  ${l51 || '...............................................................'}`, indent: 2, amount: pBuckets.p51 },
    { label: `5.2  ${l52 || '...............................................................'}`, indent: 2, amount: pBuckets.p52 },
    { label: 'รวมรายจ่าย', amount: totalPay, bold: true },
    { label: 'ยอดยกไป', amount: closingBal, bold: true, alignCenter: true },
  ];

  return (
    <div
      className="pdf-page official-doc-form mx-auto bg-white text-black"
      style={{
        width: '100%',
        maxWidth: '794px',
        minHeight: '1080px',
        padding: '26px 36px',
        fontFamily: "'Sarabun', 'TH SarabunPSK', sans-serif",
        fontSize: '12px',
        lineHeight: 1.35,
        border: '1px solid #e2e8f0',
      }}
    >
      {/* Header matching ภาพ 5 */}
      <div style={{ textAlign: 'center', marginBottom: '10px', lineHeight: 1.55 }}>
        <div style={{ fontSize: '14px', fontWeight: 700 }}>
          รายงานการรับ – จ่ายเงินรายได้สถานศึกษาประจำปีงบประมาณ พ.ศ. {fy}
        </div>
        <div style={{ fontSize: '13px' }}>
          โรงเรียน {settings.schoolName || '........................................'} สังกัด{' '}
          {settings.affiliation || 'สำนักงานเขตพื้นที่การศึกษา................................'}
        </div>
        <div style={{ fontSize: '13px' }}>
          ณ วันที่ {dDay} เดือน {dMonth} พ.ศ. {dYear}
        </div>
      </div>

      {/* Exact 3-Column Table (รายการ | จำนวนเงิน: บาท | สต.) matching ภาพ 5 */}
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          tableLayout: 'fixed',
          border: '1.5px solid #000000',
          fontSize: '11.5px',
        }}
      >
        <colgroup>
          <col style={{ width: '76%' }} />
          <col style={{ width: '17.5%' }} />
          <col style={{ width: '6.5%' }} />
        </colgroup>
        <thead>
          <tr>
            <th style={{ border: '1px solid #000', padding: '5px 8px', textAlign: 'center', fontWeight: 700, backgroundColor: '#ffffff' }}>
              รายการ
            </th>
            <th colSpan={2} style={{ border: '1px solid #000', padding: '5px 4px', textAlign: 'center', fontWeight: 700, backgroundColor: '#ffffff' }}>
              จำนวนเงิน
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const [baht, satang] = row.amount === null ? ['', ''] : splitBahtSatang(row.amount);
            const padLeft = row.alignCenter ? 8 : row.indent === 2 ? 42 : row.indent === 1 ? 22 : 8;
            return (
              <tr key={idx} style={{ fontWeight: row.bold ? 700 : 400, height: '24px' }}>
                <td
                  style={{
                    border: '1px solid #000',
                    padding: `2.5px 8px 2.5px ${padLeft}px`,
                    textAlign: row.alignCenter ? 'center' : 'left',
                  }}
                >
                  {row.label}
                </td>
                <td
                  className="tabular-nums"
                  style={{
                    border: '1px solid #000',
                    padding: '2.5px 6px',
                    textAlign: 'right',
                  }}
                >
                  {baht}
                </td>
                <td
                  className="tabular-nums"
                  style={{
                    border: '1px solid #000',
                    padding: '2.5px 4px',
                    textAlign: 'center',
                  }}
                >
                  {satang}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

