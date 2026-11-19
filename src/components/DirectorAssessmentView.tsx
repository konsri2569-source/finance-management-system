import React, { useMemo, useRef, useState } from 'react';
import {
  Award,
  Download,
  FileText,
  Plus,
  Printer,
  Save,
  Trash2,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { SignatureToggle } from './SignatureToggle';
import {
  captureHtmlSnapshot,
  exportElementToPdf,
  exportHtmlToWord,
  printHtmlSection,
} from '../services/exportService';
import { DirectorEvalIndicator } from '../types/finance';
import {
  alertError,
  escHtml,
  fmt,
  thDate,
  todayISO,
  toastSuccess,
} from '../utils/formatters';

export const DirectorAssessmentView: React.FC = () => {
  const {
    db,
    fy,
    dashboard,
    getChecks,
    includeSignatures,
    hasPermission,
    isGoogleConnected,
    saveDirectorEval,
    archivePdfReport,
  } = useApp();

  const [rows, setRows] = useState<DirectorEvalIndicator[]>(() => db.directorEval);
  const [busy, setBusy] = useState(false);
  const bookRef = useRef<HTMLDivElement | null>(null);

  const canEdit = hasPermission('canEdit') || hasPermission('canAdd') || hasPermission('canApprove');

  // Sync live financial KPIs for the Director PA Evaluation
  const liveKpis = useMemo(() => {
    const totalOpenRec = dashboard.rows.reduce((s, r) => s + r.open + r.rec, 0);
    const totalPay = dashboard.rows.reduce((s, r) => s + r.pay, 0);
    const totalDebtor = dashboard.rows.reduce((s, r) => s + r.debtor, 0);
    const spendPct = totalOpenRec > 0 ? Math.round((totalPay / totalOpenRec) * 100) : 0;

    const fyPlans = db.plans.filter((p) => p.fy === fy);
    const totalPlanAmt = fyPlans.reduce((s, p) => s + p.amount, 0);
    const fyReportsCount = db.reports.filter((r) => r.fy === fy).length;
    const checks = getChecks(fy);
    const redAlerts = checks.alerts.filter((a) => a.level === 'red').length;

    return {
      spendPct,
      totalOpenRec,
      totalPay,
      totalDebtor,
      plansCount: fyPlans.length,
      totalPlanAmt,
      fyReportsCount,
      redAlerts,
    };
  }, [dashboard.rows, db.plans, db.reports, fy, getChecks]);

  // Weighted evaluation summary
  const summary = useMemo(() => {
    const totalWeight = rows.reduce((s, r) => s + (Number(r.weight) || 0), 0);
    const weightedPoints = rows.reduce(
      (s, r) => s + ((Number(r.score) || 0) / 5) * (Number(r.weight) || 0),
      0
    );
    const pct = totalWeight > 0 ? (weightedPoints / totalWeight) * 100 : 0;
    const avg5 = (pct / 100) * 5;

    let grade = 'ต้องปรับปรุง';
    if (pct >= 90) grade = 'ดีเด่น (ร้อยละ 90 ขึ้นไป)';
    else if (pct >= 80) grade = 'ดีมาก (ร้อยละ 80 - 89.99)';
    else if (pct >= 70) grade = 'ดี (ร้อยละ 70 - 79.99)';
    else if (pct >= 60) grade = 'พอใช้ (ร้อยละ 60 - 69.99)';

    return { totalWeight, pct, avg5, grade };
  }, [rows]);

  const updateRow = (idx: number, patch: Partial<DirectorEvalIndicator>) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const addIndicator = () => {
    setRows((prev) => [
      ...prev,
      {
        id: `PA${prev.length + 1}`,
        aspect: 'ด้านการพัฒนาคุณภาพผู้เรียนและสถานศึกษา',
        indicator: `${prev.length + 1}. ตัวชี้วัดเพิ่มเติม`,
        target: 'บรรลุเป้าหมายตามแผนพัฒนาคุณภาพการศึกษา',
        result: 'ดำเนินการแล้วเสร็จตามกำหนด',
        score: 5,
        weight: 0,
        evidence: 'เอกสารรายงานโครงการ',
      },
    ]);
  };

  const removeIndicator = (idx: number) => {
    if (rows.length <= 1) return alertError('ต้องมีตัวชี้วัดอย่างน้อย 1 รายการ');
    setRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    setBusy(true);
    try {
      await saveDirectorEval(rows);
      toastSuccess('บันทึกผลการประเมิน PA ผู้อำนวยการเรียบร้อยแล้ว');
    } catch (e: any) {
      if (e.message !== '__CANCELLED__') alertError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleExportWordBook = () => {
    const s = db.settings;
    const html = `
      <div style="text-align:center;margin-top:40pt;margin-bottom:24pt;">
        <h1>แบบรายงานผลการประเมินสัมฤทธิผลการปฏิบัติงานในหน้าที่ (PA)</h1>
        <h2>ตำแหน่งผู้อำนวยการสถานศึกษา</h2>
        <h3>${escHtml(s.schoolName)} · ${escHtml(s.affiliation)}</h3>
        <p>ประจำปีงบประมาณ พ.ศ. ${fy}</p>
        <p>ผู้รับการประเมิน: ${escHtml(s.director || '................................................')}</p>
      </div>
      <h3>ส่วนที่ 1 : ข้อมูลสารสนเทศทางการเงินและงบประมาณประกอบการประเมิน (ข้อมูลจริง ณ ${thDate(todayISO())})</h3>
      <table>
        <thead>
          <tr><th>รายการข้อมูลพื้นฐานด้านการบริหารงบประมาณและการเงิน</th><th class="text-right">ผลการดำเนินงาน</th></tr>
        </thead>
        <tbody>
          <tr><td>เงินรับรวมและยอดยกมาทั้งหมดในปีงบประมาณ ${fy}</td><td class="text-right">${fmt(liveKpis.totalOpenRec)} บาท</td></tr>
          <tr><td>การเบิกจ่ายงบประมาณและเงินนอกงบประมาณสะสม</td><td class="text-right">${fmt(liveKpis.totalPay)} บาท (ร้อยละ ${liveKpis.spendPct})</td></tr>
          <tr><td>โครงการตามแผนปฏิบัติการประจำปี</td><td class="text-right">${liveKpis.plansCount} โครงการ (${fmt(liveKpis.totalPlanAmt)} บาท)</td></tr>
          <tr><td>จำนวนรายงานผลโครงการที่จัดทำแล้วเสร็จ</td><td class="text-right">${liveKpis.fyReportsCount} โครงการ</td></tr>
          <tr><td>ลูกหนี้เงินยืมคงค้าง ณ ปัจจุบัน</td><td class="text-right">${fmt(liveKpis.totalDebtor)} บาท</td></tr>
        </tbody>
      </table>
      <div class="page-break"></div>
      <h3>ส่วนที่ 2 : ผลการประเมินตามตัวชี้วัดข้อตกลงในการพัฒนางาน (PA)</h3>
      <table>
        <thead>
          <tr>
            <th>ด้าน / ตัวชี้วัด</th>
            <th>ค่าเป้าหมาย</th>
            <th>ผลการปฏิบัติงานและหลักฐานอ้างอิง</th>
            <th class="text-center">น้ำหนัก (%)</th>
            <th class="text-center">คะแนน (1-5)</th>
            <th class="text-right">คะแนนถ่วงน้ำหนัก</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map((r) => {
              const wScore = (((Number(r.score) || 0) / 5) * (Number(r.weight) || 0)).toFixed(2);
              return `<tr>
                <td><strong>${escHtml(r.aspect)}</strong><br/>${escHtml(r.indicator)}</td>
                <td>${escHtml(r.target)}</td>
                <td>${escHtml(r.result)}<br/><em>หลักฐาน: ${escHtml(r.evidence)}</em></td>
                <td class="text-center">${r.weight}%</td>
                <td class="text-center">${r.score}</td>
                <td class="text-right">${wScore}</td>
              </tr>`;
            })
            .join('')}
          <tr class="font-bold">
            <td colspan="3" class="text-right">รวมผลคะแนนประเมินสัมฤทธิผลฯ</td>
            <td class="text-center">${summary.totalWeight}%</td>
            <td class="text-center">${summary.avg5.toFixed(2)} / 5.00</td>
            <td class="text-right">${summary.pct.toFixed(2)}% (${escHtml(summary.grade)})</td>
          </tr>
        </tbody>
      </table>
      <table style="border:none;margin-top:32pt;">
        <tr>
          <td style="border:none;text-align:center;width:50%;">
            ${includeSignatures && db.assets.sigDirector ? `<img src="${db.assets.sigDirector}" style="height:44px;margin:0 auto 4px;display:block" alt="sig"/><br/>` : ''}
            ลงชื่อ......................................................<br/>
            (${escHtml(s.director || 'ผู้อำนวยการสถานศึกษา')})<br/>
            ผู้รับการประเมิน
          </td>
          <td style="border:none;text-align:center;width:50%;">
            ลงชื่อ......................................................<br/>
            (......................................................)<br/>
            ประธานกรรมการประเมินสัมฤทธิผลการปฏิบัติงาน
          </td>
        </tr>
      </table>`;

    exportHtmlToWord(
      `เล่มประเมินสัมฤทธิผล_ผอ_${s.schoolName}_${fy}.doc`,
      `ประเมินสัมฤทธิผลฯ ผู้อำนวยการ ${s.schoolName}`,
      html,
      { orientation: 'portrait' }
    );
    toastSuccess('ดาวน์โหลดเล่มประเมิน PA (.doc) เรียบร้อยแล้ว', 'สามารถเปิดแก้ไขเพิ่มเติมใน Word ได้ทันที');
  };

  const handleExportPdf = async () => {
    if (!bookRef.current) return;
    setBusy(true);
    try {
      const fileName = `ประเมินสัมฤทธิผล_ผอ_${fy}.pdf`;
      const blob = await exportElementToPdf(bookRef.current, fileName, {
        download: true,
        orientation: 'portrait',
      });
      await archivePdfReport({
        reportKey: 'director_pa',
        reportTitle: `รายงานผลประเมินสัมฤทธิผลฯ ผอ. (ปี ${fy})`,
        fileName,
        pdfBlob: blob,
        uploadToDrive: Boolean(isGoogleConnected && db.settings.driveFolderId),
      });
      toastSuccess('ส่งออกและบันทึก PDF เรียบร้อยแล้ว');
    } catch (e: any) {
      if (e.message !== '__CANCELLED__') alertError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handlePrint = () => {
    if (!bookRef.current) return;
    printHtmlSection(
      captureHtmlSnapshot(bookRef.current),
      `ประเมินสัมฤทธิผลฯ_${fy}`,
      'portrait'
    );
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#14306b] text-white">
            <Award className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              ระบบประเมินสัมฤทธิผลการปฏิบัติงานในหน้าที่ ตำแหน่งผู้อำนวยการสถานศึกษา (PA)
            </h2>
            <p className="text-xs text-slate-500">
              เชื่อมโยงตัวชี้วัดกับการบริหารงบประมาณและการเงินจริงของ {db.settings.schoolName} ปีงบประมาณ {fy}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SignatureToggle />
          {canEdit && (
            <button
              type="button"
              disabled={busy}
              onClick={handleSave}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Save className="h-3.5 w-3.5" />
              บันทึกผลประเมิน
            </button>
          )}
          <button
            type="button"
            onClick={handleExportWordBook}
            className="inline-flex items-center gap-1.5 rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-800 hover:bg-blue-100 whitespace-nowrap shrink-0"
          >
            <FileText className="h-3.5 w-3.5" />
            ส่งออกเล่ม Word (.doc)
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={handleExportPdf}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#14306b] px-3 py-2 text-xs font-medium text-white hover:bg-[#1d428e] disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <Download className="h-3.5 w-3.5" />
            ส่งออก PDF &amp; เก็บคลัง
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap shrink-0"
          >
            <Printer className="h-3.5 w-3.5" />
            พิมพ์
          </button>
        </div>
      </div>

      {/* Live KPI Cards linked to Finance */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-[#14306b] bg-[#14306b] p-4 text-white">
          <div className="text-xs text-blue-100">คะแนนประเมิน PA รวม</div>
          <div className="mt-1 text-2xl font-bold tabular-nums">{summary.pct.toFixed(2)}%</div>
          <div className="mt-1 text-xs text-blue-200">{summary.grade}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">อัตราการเบิกจ่ายงบประมาณ</div>
          <div className="mt-1 text-2xl font-bold text-[#2563eb] tabular-nums">{liveKpis.spendPct}%</div>
          <div className="mt-1 text-xs text-slate-400">
            จ่ายแล้ว {fmt(liveKpis.totalPay)} บาท
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">โครงการตามแผน &amp; รายงานผล</div>
          <div className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">
            {liveKpis.fyReportsCount} / {liveKpis.plansCount}
          </div>
          <div className="mt-1 text-xs text-slate-400">โครงการที่รายงานผลแล้ว</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">จุดตรวจสอบการเงิน (ระเบียบฯ 2544)</div>
          <div className={`mt-1 text-2xl font-bold tabular-nums ${liveKpis.redAlerts ? 'text-red-600' : 'text-emerald-600'}`}>
            {liveKpis.redAlerts === 0 ? 'ผ่านเกณฑ์' : `${liveKpis.redAlerts} จุดเร่งด่วน`}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            ลูกหนี้เงินยืมคงค้าง {fmt(liveKpis.totalDebtor)} บาท
          </div>
        </div>
      </div>

      {/* Editable Indicators Table + Printable Book Section */}
      <div ref={bookRef} className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              ตารางตัวชี้วัดและหลักฐานประกอบการประเมิน (PA) — {db.settings.director || 'ผู้อำนวยการสถานศึกษา'}
            </h3>
            <p className="text-xs text-slate-500">
              น้ำหนักรวมปัจจุบัน: <span className="font-semibold text-slate-900 tabular-nums">{summary.totalWeight}%</span> (ควรเท่ากับ 100%) · คะแนนเฉลี่ย{' '}
              <span className="font-semibold text-slate-900 tabular-nums">{summary.avg5.toFixed(2)}</span> / 5.00
            </p>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={addIndicator}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 print:hidden whitespace-nowrap shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              เพิ่มตัวชี้วัด
            </button>
          )}
        </div>

        <div className="space-y-3">
          {rows.map((r, idx) => {
            const weighted = (((Number(r.score) || 0) / 5) * (Number(r.weight) || 0)).toFixed(2);
            return (
              <div key={r.id + idx} className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex-1 min-w-[260px] space-y-2">
                    <input
                      type="text"
                      value={r.aspect}
                      disabled={!canEdit}
                      onChange={(e) => updateRow(idx, { aspect: e.target.value })}
                      className="w-full rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-[#14306b]"
                    />
                    <textarea
                      rows={2}
                      value={r.indicator}
                      disabled={!canEdit}
                      onChange={(e) => updateRow(idx, { indicator: e.target.value })}
                      className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-900"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <div>
                      <label className="block text-[11px] text-slate-500">น้ำหนัก (%)</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        disabled={!canEdit}
                        value={r.weight}
                        onChange={(e) => updateRow(idx, { weight: Number(e.target.value) || 0 })}
                        className="w-20 rounded border border-slate-300 bg-white px-2 py-1 text-center text-xs font-semibold tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500">ระดับคะแนน (1-5)</label>
                      <select
                        disabled={!canEdit}
                        value={r.score}
                        onChange={(e) => updateRow(idx, { score: Number(e.target.value) })}
                        className="w-20 rounded border border-slate-300 bg-white px-2 py-1 text-center text-xs font-bold text-[#14306b] tabular-nums"
                      >
                        {[5, 4, 3, 2, 1].map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                    <div className="text-right min-w-[70px]">
                      <div className="text-[11px] text-slate-500">ที่ได้ (%)</div>
                      <div className="text-sm font-bold text-slate-900 tabular-nums">{weighted}</div>
                    </div>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => removeIndicator(idx)}
                        className="mt-3 rounded p-1.5 text-red-500 hover:bg-red-50 print:hidden"
                        title="ลบตัวชี้วัด"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-slate-600">ค่าเป้าหมายตามข้อตกลง</label>
                    <textarea
                      rows={2}
                      disabled={!canEdit}
                      value={r.target}
                      onChange={(e) => updateRow(idx, { target: e.target.value })}
                      className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-slate-600">ผลการปฏิบัติงานที่เกิดขึ้นจริง</label>
                    <textarea
                      rows={2}
                      disabled={!canEdit}
                      value={r.result}
                      onChange={(e) => updateRow(idx, { result: e.target.value })}
                      className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-slate-600">เอกสาร / ร่องรอยหลักฐาน</label>
                    <textarea
                      rows={2}
                      disabled={!canEdit}
                      value={r.evidence}
                      onChange={(e) => updateRow(idx, { evidence: e.target.value })}
                      className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
