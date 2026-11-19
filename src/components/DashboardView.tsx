import React, { useEffect, useMemo, useRef, useState } from 'react';
import Chart from 'chart.js/auto';
import { useApp } from '../context/AppContext';
import { FY_MONTH_LABELS, fmt, thDate, todayISO } from '../utils/formatters';

export const DashboardView: React.FC = () => {
  const { dashboard, db, fy } = useApp();
  const [group, setGroup] = useState<string>('ทั้งหมด');
  const ch1Ref = useRef<HTMLCanvasElement | null>(null);
  const ch2Ref = useRef<HTMLCanvasElement | null>(null);
  const chart1Instance = useRef<Chart | null>(null);
  const chart2Instance = useRef<Chart | null>(null);

  const groups = useMemo(
    () => ['ทั้งหมด', ...Array.from(new Set(dashboard.rows.map((r) => r.group)))],
    [dashboard.rows]
  );

  const filteredRows = useMemo(
    () => dashboard.rows.filter((r) => group === 'ทั้งหมด' || r.group === group),
    [dashboard.rows, group]
  );

  const totals = useMemo(() => {
    const sum = (k: 'open' | 'rec' | 'pay' | 'debtor' | 'bal') =>
      filteredRows.reduce((s, r) => s + r[k], 0);
    const open = sum('open');
    const rec = sum('rec');
    const pay = sum('pay');
    const debt = sum('debtor');
    const bal = sum('bal');
    const avail = open + rec;
    const pct = avail > 0 ? Math.round((pay / avail) * 100) : 0;
    return { open, rec, pay, debt, bal, avail, pct };
  }, [filteredRows]);

  useEffect(() => {
    if (!ch1Ref.current || !ch2Ref.current) return;

    if (chart1Instance.current) chart1Instance.current.destroy();
    if (chart2Instance.current) chart2Instance.current.destroy();

    chart1Instance.current = new Chart(ch1Ref.current, {
      type: 'bar',
      data: {
        labels: FY_MONTH_LABELS,
        datasets: [
          {
            label: 'รับ',
            data: dashboard.months.map((m) => m.rec),
            backgroundColor: '#2563eb',
            borderRadius: 4,
          },
          {
            label: 'จ่าย',
            data: dashboard.months.map((m) => m.pay),
            backgroundColor: '#d97706',
            borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top' },
        },
      },
    });

    const nz = filteredRows.filter((r) => r.bal !== 0);
    const displayRows = nz.length ? nz : filteredRows;

    chart2Instance.current = new Chart(ch2Ref.current, {
      type: 'bar',
      data: {
        labels: displayRows.map((r) => r.name.replace('เงินอุดหนุน', '')),
        datasets: [
          {
            label: 'คงเหลือ (บาท)',
            data: displayRows.map((r) => r.bal),
            backgroundColor: displayRows.map((r) => r.color),
            borderRadius: 4,
          },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
        },
      },
    });

    return () => {
      chart1Instance.current?.destroy();
      chart2Instance.current?.destroy();
    };
  }, [dashboard.months, filteredRows]);

  return (
    <div className="space-y-5">
      {/* Header Summary Line */}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            ภาพรวมการเงิน {db.settings.schoolName}
          </h2>
          <p className="text-xs text-slate-500">
            {db.settings.affiliation} · ปีงบประมาณ {fy} · ข้อมูล ณ วันที่ {thDate(todayISO())}
          </p>
        </div>
      </div>

      {/* 4 KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-[#14306b] bg-[#14306b] p-4 text-white">
          <div className="text-xs font-medium text-blue-100">เงินคงเหลือยกมา</div>
          <div className="mt-1.5 text-2xl font-bold tabular-nums">{fmt(totals.open)}</div>
          <div className="mt-1 text-xs text-blue-200">จากปีงบประมาณก่อน (บาท)</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">รับเงินประจำปี</div>
          <div className="mt-1.5 text-2xl font-bold text-[#2563eb] tabular-nums">
            {fmt(totals.rec)}
          </div>
          <div className="mt-1 text-xs text-slate-400">บาท</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">จ่ายเงินประจำปี</div>
          <div className="mt-1.5 text-2xl font-bold text-[#d97706] tabular-nums">
            {fmt(totals.pay)}
          </div>
          <div className="mt-1 text-xs text-slate-400">บาท</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">ใช้จ่ายคิดเป็นร้อยละ</div>
          <div className="mt-1.5 text-2xl font-bold text-slate-900 tabular-nums">
            {totals.pct}%
          </div>
          <div className="mt-1 text-xs text-slate-400">ของเงินที่มีทั้งหมด</div>
        </div>
      </div>

      {/* Interactive Filter Segmented Bar */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-2.5">
        <span className="px-2 text-xs font-semibold text-slate-600">กลุ่มประเภทเงิน</span>
        <div className="flex flex-wrap gap-1.5">
          {groups.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGroup(g)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                group === g
                  ? 'bg-[#14306b] text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-bold text-slate-900">รับ-จ่ายรายเดือน (ต.ค. - ก.ย.)</h3>
          <div className="relative h-72">
            <canvas ref={ch1Ref} />
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-bold text-slate-900">เงินคงเหลือแยกตามประเภท</h3>
          <div className="relative h-72">
            <canvas ref={ch2Ref} />
          </div>
        </div>
      </div>

      {/* 15 Fund Summary Table */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-900">สรุปเงินทุกประเภท (ปีงบประมาณ {fy})</h3>
          <span className="text-xs text-slate-500">
            คงเหลือสุทธิรวม <span className="font-semibold text-slate-900 tabular-nums">{fmt(totals.bal)}</span> บาท
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="px-3 py-2.5 text-left">ประเภทเงิน</th>
                <th className="px-3 py-2.5 text-right">ยอดยกมา</th>
                <th className="px-3 py-2.5 text-right">รับปีนี้</th>
                <th className="px-3 py-2.5 text-right">จ่ายปีนี้</th>
                <th className="px-3 py-2.5 text-right">คงเหลือ</th>
                <th className="px-3 py-2.5 text-left">ใช้ไปแล้ว</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRows.map((r) => {
                const avail = r.open + r.rec;
                const pct = avail > 0 ? Math.min(100, (r.pay / avail) * 100) : 0;
                return (
                  <tr key={r.id} className="hover:bg-slate-50/80">
                    <td className="px-3 py-2.5 text-left font-medium text-slate-800">
                      <span
                        className="mr-2 inline-block h-2.5 w-2.5 rounded-sm align-middle"
                        style={{ backgroundColor: r.color }}
                      />
                      {r.name}
                    </td>
                    <td className={`px-3 py-2.5 text-right tabular-nums ${r.open ? 'text-slate-800' : 'text-slate-400'}`}>
                      {fmt(r.open)}
                    </td>
                    <td className={`px-3 py-2.5 text-right tabular-nums ${r.rec ? 'text-slate-800' : 'text-slate-400'}`}>
                      {fmt(r.rec)}
                    </td>
                    <td className={`px-3 py-2.5 text-right tabular-nums ${r.pay ? 'text-slate-800' : 'text-slate-400'}`}>
                      {fmt(r.pay)}
                    </td>
                    <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${r.bal ? 'text-slate-900' : 'text-slate-400'}`}>
                      {fmt(r.bal)}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-20 overflow-hidden rounded-full bg-slate-200">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${pct}%`, backgroundColor: r.color }}
                          />
                        </div>
                        <span className="text-xs text-slate-500 tabular-nums">
                          {Math.round(pct)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold text-slate-900">
                <td className="px-3 py-2.5 text-left">รวมทั้งหมด</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{fmt(totals.open)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{fmt(totals.rec)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{fmt(totals.pay)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{fmt(totals.bal)}</td>
                <td className="px-3 py-2.5 text-left text-xs text-slate-500 tabular-nums">
                  {totals.pct}%
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {totals.debt > 0.004 && (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            ลูกหนี้เงินยืมคงค้าง {fmt(totals.debt)} บาท (หักออกจากเงินคงเหลือแล้ว ดูรายละเอียดที่ ระบบควบคุมการเงิน &gt; เงินยืม)
          </p>
        )}
      </div>
    </div>
  );
};
