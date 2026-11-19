import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BudgetPlan,
  DEF_ACT,
  DEPARTMENTS,
  GRADES,
  LEVEL_NAMES,
  LevelKey,
  ProjectReport,
  RATES,
  SubsidyRecord,
} from '../types/finance';
import { useApp } from '../context/AppContext';
import {
  alertError,
  escHtml,
  f0,
  fmt,
  numRound,
  thDate,
  toastSuccess,
} from '../utils/formatters';
import {
  captureHtmlSnapshot,
  exportElementToPdf,
  exportHtmlToWord,
  printHtmlSection,
} from '../services/exportService';
import { FileText, Printer, Upload, Trash2, CheckCircle2, AlertTriangle, Download } from 'lucide-react';
import { SignatureToggle } from './SignatureToggle';

type SubTab = 'calc' | 'alloc' | 'sum' | 'proj' | 'prep';

export const PlanBudgetView: React.FC = () => {
  const {
    fy,
    db,
    fundName,
    includeSignatures,
    hasPermission,
    isGoogleConnected,
    saveSubsidy,
    deleteSubsidy,
    saveBudgetDoc,
    createPlansFromDoc,
    confirmPlanCheck,
    savePlan,
    deletePlan,
    saveReport,
    uploadReportDocument,
    deleteReportDocument,
    archivePdfReport,
  } = useApp();

  const [tab, setTab] = useState<SubTab>('calc');

  /* ---------- 1. Subsidy Calculator State ---------- */
  const [level, setLevel] = useState<LevelKey>('primary');
  const [small, setSmall] = useState(false);
  const [rates, setRates] = useState<Record<string, number>>({ ...RATES.primary, small: 500 });
  const [gradeRows, setGradeRows] = useState<Array<{ name: string; m: number; f: number; rate: number }>>(() =>
    GRADES.primary.map(([name, rate]) => ({ name, m: 0, f: 0, rate }))
  );
  const [editingSubId, setEditingSubId] = useState<string | null>(null);
  const [subQuery, setSubQuery] = useState('');

  const switchLevel = (lv: LevelKey, keepRates = false, preset?: SubsidyRecord) => {
    setLevel(lv);
    if (preset) {
      setSmall(preset.small);
      setRates({ small: 500, ...RATES[lv], ...preset.rates });
      setGradeRows(
        GRADES[lv].map(([name, defRate]) => {
          const found = preset.grades.find((g) => g.name === name);
          return {
            name,
            m: found ? found.m : 0,
            f: found ? found.f : 0,
            rate: found ? found.rate : defRate,
          };
        })
      );
      return;
    }
    if (!keepRates) {
      setRates({ small: 500, ...RATES[lv] });
      setGradeRows(GRADES[lv].map(([name, rate]) => ({ name, m: 0, f: 0, rate })));
    }
  };

  const calcTotals = useMemo(() => {
    let m = 0,
      f = 0,
      n = 0,
      teach = 0,
      plus = 0,
      head = 0,
      book = 0,
      tools = 0,
      unif = 0,
      act = 0,
      tot = 0;

    const computedRows = gradeRows.map((g) => {
      const cnt = (Number(g.m) || 0) + (Number(g.f) || 0);
      const rTeach = cnt * (Number(rates.teaching) || 0);
      const rPlus = small ? cnt * (Number(rates.small) || 0) : 0;
      const rHead = rTeach + rPlus;
      const rBook = cnt * (Number(g.rate) || 0);
      const rTools = cnt * (Number(rates.tools) || 0);
      const rUnif = cnt * (Number(rates.uniform) || 0);
      const rAct = cnt * (Number(rates.activity) || 0);
      const rTot = rHead + rBook + rTools + rUnif + rAct;

      m += Number(g.m) || 0;
      f += Number(g.f) || 0;
      n += cnt;
      teach += rTeach;
      plus += rPlus;
      head += rHead;
      book += rBook;
      tools += rTools;
      unif += rUnif;
      act += rAct;
      tot += rTot;

      return { ...g, cnt, rTeach, rPlus, rHead, rBook, rTools, rUnif, rAct, rTot };
    });

    return { computedRows, m, f, n, teach, plus, head, book, tools, unif, act, tot };
  }, [gradeRows, rates, small]);

  const subsForFy = useMemo(() => {
    const q = subQuery.trim().toLowerCase();
    return db.subsidies
      .filter((s) => s.fy === fy)
      .filter(
        (s) =>
          !q ||
          [LEVEL_NAMES[s.level], s.by, s.date, s.count, s.total]
            .join(' ')
            .toLowerCase()
            .includes(q)
      );
  }, [db.subsidies, fy, subQuery]);

  const handleSaveSubsidy = async () => {
    if (!hasPermission('canAdd') && !hasPermission('canEdit')) {
      return alertError('คุณไม่มีสิทธิ์บันทึกผลคำนวณเงินอุดหนุน');
    }
    try {
      const res = await saveSubsidy({
        fy,
        level,
        small,
        rates,
        grades: gradeRows.map((g) => ({ ...g, count: g.m + g.f })),
      });
      setEditingSubId(null);
      toastSuccess(
        `บันทึกผลคำนวณแล้ว รวม ${fmt(res.total)} บาท`,
        res.updated ? 'อัปเดตข้อมูลเดิมของระดับนี้แล้ว' : undefined
      );
    } catch (e: any) {
      if (e.message !== '__CANCELLED__') alertError(e.message);
    }
  };

  /* ---------- 2. Budget Allocation State ---------- */
  const currentDoc = db.allocDocs[fy] || {};
  const [pa, setPa] = useState(50);
  const [pg, setPg] = useState(30);
  const [pr, setPr] = useState(20);
  const [headFund, setHeadFund] = useState('F03');
  const [gBud, setGBud] = useState(0);
  const [gHr, setGHr] = useState(0);
  const [gGen, setGGen] = useState(0);
  const [gStu, setGStu] = useState(0);
  const [actList, setActList] = useState<Array<[string, number]>>(DEF_ACT.map((n) => [n, 0]));
  const [lunchN, setLunchN] = useState(0);
  const [lunchRate, setLunchRate] = useState(27);
  const [lunchDays, setLunchDays] = useState(200);
  const [poorAmt, setPoorAmt] = useState(0);

  useEffect(() => {
    const doc = db.allocDocs[fy] || {};
    const p = doc.pct || { acad: 50, gen: 30, res: 20 };
    const g = doc.gen || { bud: 0, hr: 0, gen: 0, stu: 0 };
    const lu = doc.lunch || { n: 0, rate: 27, days: 200 };
    const anySmall = Object.values(doc.calcs || {}).some((c) => c.small);
    setPa(p.acad ?? 50);
    setPg(p.gen ?? 30);
    setPr(p.res ?? 20);
    setHeadFund(doc.headFund || (anySmall ? 'F15' : 'F03'));
    setGBud(g.bud || 0);
    setGHr(g.hr || 0);
    setGGen(g.gen || 0);
    setGStu(g.stu || 0);
    setActList(doc.act?.length ? doc.act : DEF_ACT.map((n) => [n, 0]));
    setLunchN(lu.n || 0);
    setLunchRate(lu.rate || 27);
    setLunchDays(lu.days || 200);
    setPoorAmt(doc.poor || 0);
  }, [db.allocDocs, fy]);

  const sumCalc = (k: 'teaching' | 'smallBonus' | 'book' | 'tools' | 'uniform' | 'activity' | 'total') =>
    Object.values(currentDoc.calcs || {}).reduce((s, c) => s + (Number(c[k]) || 0), 0);

  const allocBase = sumCalc('teaching') + sumCalc('smallBonus');
  const acadAmt = (allocBase * pa) / 100;
  const genAmt = (allocBase * pg) / 100;
  const resAmt = (allocBase * pr) / 100;
  const genSubSum = gBud + gHr + gGen + gStu;
  const actSum = actList.reduce((s, a) => s + (Number(a[1]) || 0), 0);
  const lunchTotal = lunchN * lunchRate * lunchDays;
  const grandAllocTotal = sumCalc('total') + lunchTotal + poorAmt;

  const allocPayload = () => ({
    pct: { acad: pa, gen: pg, res: pr },
    gen: { bud: gBud, hr: gHr, gen: gGen, stu: gStu },
    act: actList.filter((a) => a[0].trim()),
    lunch: { n: lunchN, rate: lunchRate, days: lunchDays },
    poor: poorAmt,
    headFund,
  });

  const handleSaveAlloc = async () => {
    if (!hasPermission('canEdit')) return alertError('คุณไม่มีสิทธิ์บันทึกการจัดสรรงบประมาณ');
    try {
      await saveBudgetDoc(fy, allocPayload());
      toastSuccess('บันทึกการจัดสรรงบประมาณแล้ว');
    } catch (e: any) {
      if (e.message !== '__CANCELLED__') alertError(e.message);
    }
  };

  const handleCreatePlansFromAlloc = async () => {
    if (!hasPermission('canAdd')) return alertError('คุณไม่มีสิทธิ์สร้างโครงการตามแผน');
    try {
      await saveBudgetDoc(fy, allocPayload());
      const count = await createPlansFromDoc(fy);
      toastSuccess(`สร้างโครงการตามแผน ${count} รายการแล้ว`);
      setTab('proj');
    } catch (e: any) {
      if (e.message !== '__CANCELLED__') alertError(e.message);
    }
  };

  /* ---------- 4. Plans & Check State ---------- */
  const [editPlanId, setEditPlanId] = useState<string>('');
  const [pFund, setPFund] = useState('F03');
  const [pDept, setPDept] = useState(DEPARTMENTS[0]);
  const [pName, setPName] = useState('');
  const [pAmt, setPAmt] = useState('');
  const [pNote, setPNote] = useState('');

  const plansForFy = useMemo(() => {
    const reqs = db.requests;
    return db.plans
      .filter((p) => p.fy === fy)
      .map((p) => {
        const mine = reqs.filter((r) => r.plan === p.id);
        const used = mine
          .filter((r) => r.status === 'อนุมัติแล้ว' || r.status === 'จ่ายเงินแล้ว')
          .reduce((s, r) => s + r.amount, 0);
        const paid = mine
          .filter((r) => r.status === 'จ่ายเงินแล้ว')
          .reduce((s, r) => s + r.amount, 0);
        return {
          ...p,
          used: numRound(used),
          paid: numRound(paid),
          left: numRound(p.amount - used),
        };
      });
  }, [db.plans, db.requests, fy]);

  const planCheck = useMemo(() => {
    const calcs = Object.values(currentDoc.calcs || {});
    if (!calcs.length) return null;
    const hf = currentDoc.headFund || 'F03';
    const pct = currentDoc.pct || { acad: 50, gen: 30, res: 20 };
    const g = currentDoc.gen || { bud: 0, hr: 0, gen: 0, stu: 0 };
    const lu = currentDoc.lunch || { n: 0, rate: 27, days: 200 };
    const base = sumCalc('teaching') + sumCalc('smallBonus');
    const exp: Record<string, number> = {
      [hf]: (base * ((pct.acad || 0) + (pct.gen || 0) + (pct.res || 0))) / 100,
      F07: sumCalc('book'),
      F06: sumCalc('tools'),
      F05: sumCalc('uniform'),
      F08: (currentDoc.act || []).reduce((s, a) => s + (Number(a[1]) || 0), 0),
      F01: (lu.n || 0) * (lu.rate || 0) * (lu.days || 0),
      F04: Number(currentDoc.poor) || 0,
    };

    const planBy = (f: string) =>
      plansForFy.filter((x) => x.fund === f).reduce((s, x) => s + x.amount, 0);
    const rows: Array<{ title: string; expected: number; actual: number; diff: number }> = [];
    const add = (title: string, e: number, a: number) =>
      rows.push({
        title,
        expected: numRound(e),
        actual: numRound(a),
        diff: numRound(a - e),
      });

    Object.keys(exp).forEach((f) => {
      if (exp[f] > 0 || planBy(f) > 0) add(`ประเภทเงิน: ${fundName(f)}`, exp[f], planBy(f));
    });

    const deptList: Array<[string, number]> = [
      ['กลุ่มบริหารวิชาการ', (base * (pct.acad || 0)) / 100],
      ['กลุ่มบริหารงบประมาณ', g.bud || 0],
      ['กลุ่มบริหารงานบุคคล', g.hr || 0],
      ['กลุ่มบริหารทั่วไป', g.gen || 0],
      ['กลุ่มบริหารกิจการนักเรียน', g.stu || 0],
      ['ส่วนกลาง', (base * (pct.res || 0)) / 100],
    ];
    deptList.forEach(([d, e]) => {
      const a = plansForFy
        .filter((x) => x.fund === hf && x.dept === d)
        .reduce((s, x) => s + x.amount, 0);
      if (e > 0 || a > 0) add(`เงินรายหัว – ${d}`, e, a);
    });

    const tExp = Object.values(exp).reduce((s, v) => s + v, 0);
    const tAct = Object.keys(exp).reduce((s, f) => s + planBy(f), 0);
    const bad = rows.filter((r) => Math.abs(r.diff) >= 0.01).length + (Math.abs(tAct - tExp) >= 0.01 ? 1 : 0);
    const other = plansForFy.filter((x) => !(x.fund in exp));
    const otherAmt = other.reduce((s, x) => s + x.amount, 0);

    return { rows, tExp, tAct, bad, otherCount: other.length, otherAmt, cf: currentDoc.planConfirm };
  }, [currentDoc, plansForFy, fundName]);

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasPermission('canAdd') && !hasPermission('canEdit')) return alertError('ไม่มีสิทธิ์บันทึกโครงการ');
    try {
      await savePlan({
        id: editPlanId || undefined,
        fy,
        fund: pFund,
        dept: pDept,
        project: pName,
        amount: Number(pAmt),
        note: pNote,
      });
      setEditPlanId('');
      setPName('');
      setPAmt('');
      setPNote('');
      toastSuccess('บันทึกโครงการเรียบร้อยแล้ว');
    } catch (err: any) {
      if (err.message !== '__CANCELLED__') alertError(err.message);
    }
  };

  /* ---------- 5. Project Report State ---------- */
  const [rpPlanId, setRpPlanId] = useState('');
  const [rpName, setRpName] = useState('');
  const [rpDept, setRpDept] = useState('');
  const [rpAppr, setRpAppr] = useState('');
  const [rpSpent, setRpSpent] = useState('');
  const [rpSum, setRpSum] = useState('');
  const [rpIss, setRpIss] = useState('');
  const [rpStatus, setRpStatus] = useState<ProjectReport['status']>('เสร็จสิ้นตามแผน');
  const [rpWho, setRpWho] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadTargetReportId, setUploadTargetReportId] = useState<string | null>(null);
  const sumSectionRef = useRef<HTMLDivElement | null>(null);

  const reportsForFy = useMemo(
    () => db.reports.filter((r) => r.fy === fy),
    [db.reports, fy]
  );

  const buildReportHtml = (r: ProjectReport) => {
    const s = db.settings;
    const as = db.assets;
    const multi = (t: string) => escHtml(t || '-').replace(/\n/g, '<br/>');
    return `
      <div style="text-align:center;border-bottom:2px solid #1e3a8a;padding-bottom:10px;margin-bottom:14px">
        ${as.logo ? `<img src="${as.logo}" style="height:64px;margin:0 auto 6px" alt="logo"/><br/>` : ''}
        <b style="font-size:18px">${escHtml(s.schoolName)}</b><br/>
        <span>${escHtml(s.affiliation)}</span><br/>
        <b>แบบรายงานผลการดำเนินงานโครงการตามแผนปฏิบัติการประจำปี งบประมาณ ${r.fy}</b>
      </div>
      <table style="width:100%;border-collapse:collapse">
        <tr><th style="width:30%;text-align:left">ชื่อโครงการ</th><td><b>${escHtml(r.project)}</b></td></tr>
        <tr><th style="text-align:left">ฝ่ายงาน</th><td>${escHtml(r.dept)}</td></tr>
        <tr><th style="text-align:left">งบประมาณที่ได้รับ</th><td>${fmt(r.approved)} บาท</td></tr>
        <tr><th style="text-align:left">ใช้จ่ายจริง</th><td>${fmt(r.spent)} บาท</td></tr>
        <tr><th style="text-align:left">คงเหลือ/เกินงบ</th><td>${fmt(r.approved - r.spent)} บาท</td></tr>
        <tr><th style="text-align:left">สถานะโครงการ</th><td>${escHtml(r.status)}</td></tr>
      </table>
      <p style="margin-top:12px"><b>1. ผลการดำเนินงานและความสำเร็จ</b></p>
      <div style="border:1px solid #94a3b8;padding:10px;min-height:60px">${multi(r.summary)}</div>
      <p style="margin-top:10px"><b>2. ปัญหา อุปสรรค และข้อเสนอแนะ</b></p>
      <div style="border:1px solid #94a3b8;padding:10px;min-height:48px">${multi(r.issues)}</div>
      <table style="width:100%;border:none;margin-top:28px">
        <tr>
          <td style="border:none;text-align:center;width:50%">
            <br/><br/>ลงชื่อ..........................................<br/>
            (${escHtml(r.reporter)})<br/>ผู้รับผิดชอบโครงการ
          </td>
          <td style="border:none;text-align:center;width:50%">
            ${includeSignatures && as.sigDirector ? `<img src="${as.sigDirector}" style="height:48px;margin:0 auto" alt="sig"/>` : '<br/>'}<br/>
            ลงชื่อ..........................................<br/>
            (${escHtml(s.director || '..............................')})<br/>
            ผู้อำนวยการ${escHtml(s.schoolName)}
          </td>
        </tr>
      </table>
    `;
  };

  const handleSaveProjectReport = async (andPrint = false) => {
    try {
      const saved = await saveReport({
        fy,
        plan: rpPlanId,
        project: rpName,
        dept: rpDept,
        approved: Number(rpAppr) || 0,
        spent: Number(rpSpent) || 0,
        summary: rpSum,
        issues: rpIss,
        status: rpStatus,
        reporter: rpWho,
      });
      toastSuccess('บันทึกรายงานผลโครงการแล้ว');
      if (andPrint) {
        printHtmlSection(buildReportHtml(saved), `รายงานผลโครงการ_${saved.project}`, 'portrait');
      }
      return saved;
    } catch (e: any) {
      if (e.message !== '__CANCELLED__') alertError(e.message);
      return null;
    }
  };

  const handleFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      let targetId = uploadTargetReportId;
      if (!targetId) {
        const created = await handleSaveProjectReport(false);
        if (!created) return;
        targetId = created.id;
      }
      await uploadReportDocument(targetId, file);
      toastSuccess('อัปโหลดไฟล์รายงานเข้า Google Drive แล้ว');
    } catch (err: any) {
      if (err.message !== '__CANCELLED__') alertError(err.message);
    } finally {
      setUploadTargetReportId(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Sub-navigation tabs */}
      <div className="flex flex-wrap gap-1.5 rounded-xl border border-slate-200 bg-white p-2">
        {(
          [
            ['calc', 'คำนวณเงินอุดหนุน'],
            ['alloc', 'จัดสรรงบประมาณ'],
            ['sum', 'สรุปรวมงบประมาณ'],
            ['proj', 'เพิ่ม/แก้ไขโครงการ & ตรวจสอบงบ'],
            ['prep', 'รายงานผลโครงการ (Word/PDF)'],
          ] as Array<[SubTab, string]>
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

      {/* TAB 1: Subsidy Calculator */}
      {tab === 'calc' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-bold text-slate-900">คำนวณเงินอุดหนุนรายหัว</h3>
              {editingSubId && (
                <span className="text-xs font-semibold text-amber-700">
                  กำลังแก้ไขผลคำนวณ: {LEVEL_NAMES[level]}
                </span>
              )}
            </div>

            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="block text-xs font-medium text-slate-600">
                ระดับการศึกษา
                <select
                  value={level}
                  disabled={Boolean(editingSubId)}
                  onChange={(e) => switchLevel(e.target.value as LevelKey)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  <option value="kindergarten">ก่อนประถมศึกษา</option>
                  <option value="primary">ประถมศึกษา</option>
                  <option value="secondary_low">มัธยมศึกษาตอนต้น</option>
                  <option value="secondary_high">มัธยมศึกษาตอนปลาย</option>
                </select>
              </label>

              <label className="block text-xs font-medium text-slate-600">
                โรงเรียนขนาดเล็ก
                <select
                  value={small ? '1' : '0'}
                  onChange={(e) => setSmall(e.target.value === '1')}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  <option value="0">ไม่ใช่</option>
                  <option value="1">ใช่ (เงินเพิ่ม + รวมรายหัว)</option>
                </select>
              </label>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] border-collapse text-xs">
                <thead>
                  <tr className="bg-amber-300 text-slate-900">
                    <th className="border border-slate-300 px-2 py-2 text-left">ชั้น</th>
                    <th className="border border-slate-300 px-2 py-2 text-right">ชาย</th>
                    <th className="border border-slate-300 px-2 py-2 text-right">หญิง</th>
                    <th className="border border-slate-300 px-2 py-2 text-right">รวม</th>
                    <th className="border border-slate-300 px-2 py-2 text-right">รายหัว/ปี</th>
                    <th className="border border-slate-300 px-2 py-2 text-right">เพิ่ม</th>
                    <th className="border border-slate-300 px-2 py-2 text-right">รวมรายหัว</th>
                    <th className="border border-slate-300 px-2 py-2 text-right">1 ค่าหนังสือ</th>
                    <th className="border border-slate-300 px-2 py-2 text-right">2 ค่าอุปกรณ์ฯ</th>
                    <th className="border border-slate-300 px-2 py-2 text-right">3 ค่าเครื่องแบบฯ</th>
                    <th className="border border-slate-300 px-2 py-2 text-right">4 ค่ากิจกรรมฯ</th>
                    <th className="border border-slate-300 px-2 py-2 text-right">รวมทั้งสิ้น</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-amber-50 font-medium">
                    <td className="border border-slate-200 px-2 py-1.5 text-left">อัตรา/คน (แก้ไขได้)</td>
                    <td className="border border-slate-200" colSpan={3} />
                    <td className="border border-slate-200 p-1 text-right">
                      <input
                        type="number"
                        value={rates.teaching || 0}
                        onChange={(e) => setRates({ ...rates, teaching: Number(e.target.value) })}
                        className="w-16 rounded border border-slate-300 bg-white px-1.5 py-1 text-right tabular-nums"
                      />
                    </td>
                    <td className="border border-slate-200 p-1 text-right">
                      {small ? (
                        <input
                          type="number"
                          value={rates.small || 0}
                          onChange={(e) => setRates({ ...rates, small: Number(e.target.value) })}
                          className="w-16 rounded border border-slate-300 bg-white px-1.5 py-1 text-right tabular-nums"
                        />
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="border border-slate-200 px-2 text-right">—</td>
                    <td className="border border-slate-200 px-2 text-center text-slate-500">ตามชั้น</td>
                    <td className="border border-slate-200 p-1 text-right">
                      <input
                        type="number"
                        value={rates.tools || 0}
                        onChange={(e) => setRates({ ...rates, tools: Number(e.target.value) })}
                        className="w-16 rounded border border-slate-300 bg-white px-1.5 py-1 text-right tabular-nums"
                      />
                    </td>
                    <td className="border border-slate-200 p-1 text-right">
                      <input
                        type="number"
                        value={rates.uniform || 0}
                        onChange={(e) => setRates({ ...rates, uniform: Number(e.target.value) })}
                        className="w-16 rounded border border-slate-300 bg-white px-1.5 py-1 text-right tabular-nums"
                      />
                    </td>
                    <td className="border border-slate-200 p-1 text-right">
                      <input
                        type="number"
                        value={rates.activity || 0}
                        onChange={(e) => setRates({ ...rates, activity: Number(e.target.value) })}
                        className="w-16 rounded border border-slate-300 bg-white px-1.5 py-1 text-right tabular-nums"
                      />
                    </td>
                    <td className="border border-slate-200" />
                  </tr>

                  {calcTotals.computedRows.map((g, idx) => (
                    <tr key={g.name} className="hover:bg-slate-50">
                      <td className="border border-slate-200 px-2 py-1.5 text-left font-medium">{g.name}</td>
                      <td className="border border-slate-200 p-1 text-right">
                        <input
                          type="number"
                          min={0}
                          value={g.m}
                          onChange={(e) => {
                            const next = [...gradeRows];
                            next[idx].m = Number(e.target.value) || 0;
                            setGradeRows(next);
                          }}
                          className="w-14 rounded border border-slate-300 px-1.5 py-1 text-right tabular-nums"
                        />
                      </td>
                      <td className="border border-slate-200 p-1 text-right">
                        <input
                          type="number"
                          min={0}
                          value={g.f}
                          onChange={(e) => {
                            const next = [...gradeRows];
                            next[idx].f = Number(e.target.value) || 0;
                            setGradeRows(next);
                          }}
                          className="w-14 rounded border border-slate-300 px-1.5 py-1 text-right tabular-nums"
                        />
                      </td>
                      <td className="border border-slate-200 px-2 py-1.5 text-right font-semibold tabular-nums">
                        {f0(g.cnt)}
                      </td>
                      <td className="border border-slate-200 px-2 py-1.5 text-right tabular-nums">{f0(g.rTeach)}</td>
                      <td className="border border-slate-200 px-2 py-1.5 text-right tabular-nums">{f0(g.rPlus)}</td>
                      <td className="border border-slate-200 px-2 py-1.5 text-right font-semibold tabular-nums">
                        {f0(g.rHead)}
                      </td>
                      <td className="border border-slate-200 p-1 text-right">
                        <input
                          type="number"
                          value={g.rate}
                          onChange={(e) => {
                            const next = [...gradeRows];
                            next[idx].rate = Number(e.target.value) || 0;
                            setGradeRows(next);
                          }}
                          className="w-16 rounded border border-slate-300 px-1.5 py-1 text-right tabular-nums"
                        />
                        <div className="mt-0.5 text-[11px] text-slate-500 tabular-nums">{f0(g.rBook)}</div>
                      </td>
                      <td className="border border-slate-200 px-2 py-1.5 text-right tabular-nums">{f0(g.rTools)}</td>
                      <td className="border border-slate-200 px-2 py-1.5 text-right tabular-nums">{f0(g.rUnif)}</td>
                      <td className="border border-slate-200 px-2 py-1.5 text-right tabular-nums">{f0(g.rAct)}</td>
                      <td className="border border-slate-200 px-2 py-1.5 text-right font-bold text-[#14306b] tabular-nums">
                        {f0(g.rTot)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-blue-50 font-bold text-slate-900">
                    <td className="border border-slate-300 px-2 py-2 text-left">รวม</td>
                    <td className="border border-slate-300 px-2 py-2 text-right tabular-nums">{f0(calcTotals.m)}</td>
                    <td className="border border-slate-300 px-2 py-2 text-right tabular-nums">{f0(calcTotals.f)}</td>
                    <td className="border border-slate-300 px-2 py-2 text-right tabular-nums">{f0(calcTotals.n)}</td>
                    <td className="border border-slate-300 px-2 py-2 text-right tabular-nums">{f0(calcTotals.teach)}</td>
                    <td className="border border-slate-300 px-2 py-2 text-right tabular-nums">{f0(calcTotals.plus)}</td>
                    <td className="border border-slate-300 px-2 py-2 text-right tabular-nums">{f0(calcTotals.head)}</td>
                    <td className="border border-slate-300 px-2 py-2 text-right tabular-nums">{f0(calcTotals.book)}</td>
                    <td className="border border-slate-300 px-2 py-2 text-right tabular-nums">{f0(calcTotals.tools)}</td>
                    <td className="border border-slate-300 px-2 py-2 text-right tabular-nums">{f0(calcTotals.unif)}</td>
                    <td className="border border-slate-300 px-2 py-2 text-right tabular-nums">{f0(calcTotals.act)}</td>
                    <td className="border border-slate-300 px-2 py-2 text-right tabular-nums">{f0(calcTotals.tot)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleSaveSubsidy}
                className="rounded-lg bg-[#14306b] px-4 py-2 text-sm font-medium text-white hover:bg-[#1d428e] whitespace-nowrap shrink-0"
              >
                {editingSubId ? 'อัปเดตผลคำนวณ' : 'บันทึกผลคำนวณ'}
              </button>
              {editingSubId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingSubId(null);
                    switchLevel(level);
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  ยกเลิกการแก้ไข
                </button>
              )}
              <span className="text-xs text-slate-500">
                คำนวณได้ทุกระดับ (บันทึกซ้ำระดับเดิมคือการอัปเดต) แล้วไปต่อที่เมนู จัดสรรงบประมาณ
              </span>
            </div>
          </div>

          {/* Saved Subsidies List */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-900">
                ผลคำนวณที่บันทึกไว้ ปีงบประมาณ {fy}
              </h3>
              <input
                type="text"
                value={subQuery}
                onChange={(e) => setSubQuery(e.target.value)}
                placeholder="ค้นหา ระดับ / ผู้บันทึก / วันที่"
                className="w-60 rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
              />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                    <th className="px-3 py-2 text-left">ระดับ</th>
                    <th className="px-3 py-2 text-right">จำนวน นร.</th>
                    <th className="px-3 py-2 text-right">รวมเงินอุดหนุน</th>
                    <th className="px-3 py-2 text-right">วันที่ / ผู้บันทึก</th>
                    <th className="px-3 py-2 text-right">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {subsForFy.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-4 text-center text-xs text-slate-400">
                        ยังไม่มีผลคำนวณที่บันทึกไว้ในปีงบประมาณนี้
                      </td>
                    </tr>
                  ) : (
                    subsForFy.map((r) => (
                      <tr key={r.id}>
                        <td className="px-3 py-2 font-medium">
                          {LEVEL_NAMES[r.level]} {r.small && <span className="text-xs text-slate-500">(รร.ขนาดเล็ก)</span>}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.count}</td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums">{fmt(r.total)}</td>
                        <td className="px-3 py-2 text-right text-xs text-slate-500">
                          {thDate(r.date)} · {r.by}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="inline-flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingSubId(r.id);
                                switchLevel(r.level, false, r);
                              }}
                              className="rounded border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                            >
                              แก้ไข
                            </button>
                            {hasPermission('canDelete') && (
                              <button
                                type="button"
                                onClick={() => deleteSubsidy(r.id)}
                                className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                              >
                                ลบ
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
          </div>
        </div>
      )}

      {/* TAB 2: Budget Allocation */}
      {tab === 'alloc' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-3 text-base font-bold text-slate-900">
              1) จัดสรรเงินจากเงินอุดหนุนรายหัว (รวมเงินเพิ่ม)
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <label className="text-xs font-medium text-slate-600">
                รายหัว + เงินเพิ่ม (บาท)
                <input
                  readOnly
                  value={fmt(allocBase)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-900 tabular-nums"
                />
              </label>
              <label className="text-xs font-medium text-slate-600">
                ประเภทเงินรายหัว
                <select
                  value={headFund}
                  onChange={(e) => setHeadFund(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="F15">ก่อนประถมและประถมศึกษา (รร.ขนาดเล็ก)</option>
                  <option value="F03">รายหัวประถม</option>
                  <option value="F02">รายหัวก่อนประถม</option>
                </select>
              </label>
              <label className="text-xs font-medium text-slate-600">
                กลุ่มบริหารวิชาการ (%)
                <input
                  type="number"
                  value={pa}
                  onChange={(e) => setPa(Number(e.target.value) || 0)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
                />
              </label>
              <label className="text-xs font-medium text-slate-600">
                งบบริหารทั่วไป (%)
                <input
                  type="number"
                  value={pg}
                  onChange={(e) => setPg(Number(e.target.value) || 0)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
                />
              </label>
              <label className="text-xs font-medium text-slate-600">
                งบสำรอง / กันค่าไฟฟ้า (%)
                <input
                  type="number"
                  value={pr}
                  onChange={(e) => setPr(Number(e.target.value) || 0)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
                />
              </label>
            </div>

            <div className={`mt-2 text-xs font-semibold ${pa + pg + pr === 100 ? 'text-emerald-700' : 'text-red-600'}`}>
              {pa + pg + pr === 100
                ? '✓ ร้อยละรวม 100%'
                : `✗ ร้อยละรวมปัจจุบัน ${pa + pg + pr}% (ควรเท่ากับ 100%)`}
            </div>

            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[420px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                    <th className="px-3 py-2 text-left">รายการเงินจัดสรรงบประมาณ</th>
                    <th className="px-3 py-2 text-right">จำนวนเงิน (บาท)</th>
                    <th className="px-3 py-2 text-right">ร้อยละ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr>
                    <td className="px-3 py-2">งบกลุ่มบริหารวิชาการ</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(acadAmt)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{pa}%</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2">งบบริหารทั่วไป</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(genAmt)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{pg}%</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2">งบสำรอง / ค่าไฟฟ้า</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(resAmt)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{pr}%</td>
                  </tr>
                  <tr className="bg-slate-50 font-bold">
                    <td className="px-3 py-2">รวมเงินจัดสรรรายหัว</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(acadAmt + genAmt + resAmt)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{pa + pg + pr}%</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <h4 className="mt-4 mb-2 text-sm font-bold text-slate-900">งบบริหารทั่วไป แยกตามกลุ่มงาน</h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-xs font-medium text-slate-600">
                กลุ่มบริหารงบประมาณ
                <input
                  type="number"
                  value={gBud}
                  onChange={(e) => setGBud(Number(e.target.value) || 0)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
                />
              </label>
              <label className="text-xs font-medium text-slate-600">
                กลุ่มบริหารงานบุคคล
                <input
                  type="number"
                  value={gHr}
                  onChange={(e) => setGHr(Number(e.target.value) || 0)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
                />
              </label>
              <label className="text-xs font-medium text-slate-600">
                กลุ่มบริหารทั่วไป
                <input
                  type="number"
                  value={gGen}
                  onChange={(e) => setGGen(Number(e.target.value) || 0)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
                />
              </label>
              <label className="text-xs font-medium text-slate-600">
                กลุ่มบริหารกิจการนักเรียน
                <input
                  type="number"
                  value={gStu}
                  onChange={(e) => setGStu(Number(e.target.value) || 0)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
                />
              </label>
            </div>
            <div
              className={`mt-2 text-xs font-semibold ${
                Math.abs(genSubSum - genAmt) < 0.01 ? 'text-emerald-700' : 'text-red-600'
              }`}
            >
              {Math.abs(genSubSum - genAmt) < 0.01
                ? '✓ ยอดแยกกลุ่มงานตรงกับงบบริหารทั่วไป'
                : `✗ ผลต่างจากงบบริหารทั่วไป ${fmt(genSubSum - genAmt)} บาท`}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">2) รายการจัดสรรงบประมาณ กิจกรรมพัฒนาผู้เรียน</h3>
              <button
                type="button"
                onClick={() => setActList([...actList, ['', 0]])}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                + เพิ่มกิจกรรม
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[380px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                    <th className="px-3 py-2 text-left">กิจกรรม</th>
                    <th className="px-3 py-2 text-right">จำนวนเงิน (บาท)</th>
                    <th className="px-3 py-2 text-right">ลบ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {actList.map((a, idx) => (
                    <tr key={idx}>
                      <td className="px-2 py-1.5">
                        <input
                          type="text"
                          value={a[0]}
                          onChange={(e) => {
                            const next = [...actList];
                            next[idx] = [e.target.value, next[idx][1]];
                            setActList(next);
                          }}
                          className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm"
                        />
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <input
                          type="number"
                          value={a[1]}
                          onChange={(e) => {
                            const next = [...actList];
                            next[idx] = [next[idx][0], Number(e.target.value) || 0];
                            setActList(next);
                          }}
                          className="w-36 rounded border border-slate-300 px-2.5 py-1.5 text-right text-sm tabular-nums"
                        />
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <button
                          type="button"
                          onClick={() => setActList(actList.filter((_, i) => i !== idx))}
                          className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                        >
                          ลบ
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div
              className={`mt-2 text-xs font-semibold ${
                Math.abs(actSum - sumCalc('activity')) < 0.01 ? 'text-emerald-700' : 'text-red-600'
              }`}
            >
              {Math.abs(actSum - sumCalc('activity')) < 0.01
                ? `✓ ยอดกิจกรรมตรงกับเงินกิจกรรมพัฒนาผู้เรียน (${fmt(sumCalc('activity'))} บาท)`
                : `✗ ผลต่างจากเงินกิจกรรมพัฒนาผู้เรียน ${fmt(actSum - sumCalc('activity'))} บาท`}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-3 text-base font-bold text-slate-900">
              3) งบอุดหนุนอาหารกลางวัน และ 4) เงินอุดหนุนปัจจัยพื้นฐานนักเรียนยากจน
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-xs font-medium text-slate-600">
                จำนวนนักเรียนอาหารกลางวัน (คน)
                <input
                  type="number"
                  value={lunchN}
                  onChange={(e) => setLunchN(Number(e.target.value) || 0)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
                />
              </label>
              <label className="text-xs font-medium text-slate-600">
                งบ/คน/วัน (บาท)
                <input
                  type="number"
                  value={lunchRate}
                  onChange={(e) => setLunchRate(Number(e.target.value) || 0)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
                />
              </label>
              <label className="text-xs font-medium text-slate-600">
                จำนวนวัน/ปี
                <input
                  type="number"
                  value={lunchDays}
                  onChange={(e) => setLunchDays(Number(e.target.value) || 0)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
                />
              </label>
              <label className="text-xs font-medium text-slate-600">
                ปัจจัยพื้นฐานนักเรียนยากจน (บาท)
                <input
                  type="number"
                  value={poorAmt}
                  onChange={(e) => setPoorAmt(Number(e.target.value) || 0)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
                />
              </label>
            </div>
            <p className="mt-2 text-xs text-slate-600 tabular-nums">
              อาหารกลางวัน {fmt(lunchTotal)} บาท | ปัจจัยพื้นฐาน {fmt(poorAmt)} บาท | รวม 3)+4) ={' '}
              <b>{fmt(lunchTotal + poorAmt)}</b> บาท
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 text-center">
            <div className="text-3xl font-bold text-[#14306b] tabular-nums">{fmt(grandAllocTotal)}</div>
            <div className="mt-1 text-xs text-slate-500">รวมเงินทั้งหมดของปีงบประมาณ (บาท)</div>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={handleSaveAlloc}
                className="rounded-lg bg-[#14306b] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#1d428e]"
              >
                บันทึกการจัดสรร
              </button>
              <button
                type="button"
                onClick={handleCreatePlansFromAlloc}
                className="rounded-lg border border-[#14306b] bg-white px-5 py-2.5 text-sm font-medium text-[#14306b] hover:bg-blue-50"
              >
                บันทึกและสร้างโครงการตามแผนจากการจัดสรร
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Summary */}
      {tab === 'sum' && (
        <div className="rounded-xl border border-slate-200 bg-white p-5" ref={sumSectionRef}>
          <div className="no-print mb-4 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                if (!sumSectionRef.current) return;
                exportHtmlToWord(
                  `สรุปรวมงบประมาณ_${fy}.doc`,
                  `สรุปรวมงบประมาณ ปี ${fy}`,
                  captureHtmlSnapshot(sumSectionRef.current),
                  { orientation: 'portrait' }
                );
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <FileText className="h-4 w-4" /> ส่งออก Word (.doc)
            </button>
            <button
              type="button"
              onClick={async () => {
                if (!sumSectionRef.current) return;
                const blob = await exportElementToPdf(sumSectionRef.current, `สรุปรวมงบประมาณ_${fy}.pdf`, {
                  orientation: 'portrait',
                });
                await archivePdfReport({
                  reportKey: 'budget_summary',
                  reportTitle: `สรุปรวมงบประมาณ ปีงบประมาณ ${fy}`,
                  fileName: `สรุปรวมงบประมาณ_${fy}.pdf`,
                  pdfBlob: blob,
                  uploadToDrive: Boolean(isGoogleConnected && db.settings.driveFolderId),
                }).catch(() => {});
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-4 w-4" /> ดาวน์โหลด PDF
            </button>
            <button
              type="button"
              onClick={() =>
                sumSectionRef.current &&
                printHtmlSection(captureHtmlSnapshot(sumSectionRef.current), `สรุปงบประมาณ_${fy}`, 'portrait')
              }
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#14306b] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#1d428e]"
            >
              <Printer className="h-4 w-4" /> พิมพ์เอกสาร
            </button>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center">
            <div className="text-xs text-slate-500">รวมเงินที่ได้รับทั้งหมด ปีงบประมาณ {fy}</div>
            <div className="mt-1 text-3xl font-bold text-[#14306b] tabular-nums">
              {fmt(grandAllocTotal)} บาท
            </div>
          </div>

          <h4 className="mt-5 mb-2 text-sm font-bold text-slate-900">เงินอุดหนุนรายหัวและเรียนฟรี 15 ปี</h4>
          <table className="w-full border-collapse text-sm">
            <tbody>
              {[
                ['1. ค่าจัดการเรียนการสอน', sumCalc('teaching')],
                ['2. ค่าหนังสือเรียน', sumCalc('book')],
                ['3. ค่าอุปกรณ์การเรียน', sumCalc('tools')],
                ['4. ค่าเครื่องแบบนักเรียน', sumCalc('uniform')],
                ['5. กิจกรรมพัฒนาคุณภาพผู้เรียน', sumCalc('activity')],
                ['6. เงินเพิ่ม รร. ขนาดเล็ก', sumCalc('smallBonus')],
              ].map(([label, val]) => (
                <tr key={String(label)} className="border-b border-slate-200">
                  <td className="px-3 py-2">{label}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt(Number(val))}</td>
                </tr>
              ))}
              <tr className="bg-slate-50 font-bold">
                <td className="px-3 py-2">รวมเงินอุดหนุนรายหัวและเรียนฟรี 15 ปี</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(sumCalc('total'))}</td>
              </tr>
              <tr className="border-b border-slate-200">
                <td className="px-3 py-2">อาหารกลางวัน</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(lunchTotal)}</td>
              </tr>
              <tr className="border-b border-slate-200">
                <td className="px-3 py-2">ปัจจัยพื้นฐานนักเรียนยากจน</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(poorAmt)}</td>
              </tr>
              <tr className="bg-blue-50 font-bold text-[#14306b]">
                <td className="px-3 py-2">รวมเงินทั้งหมดของปีงบประมาณ</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(grandAllocTotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 4: Projects & Plan Check */}
      {tab === 'proj' && (
        <div className="space-y-4">
          <form onSubmit={handleSavePlan} className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-3 text-base font-bold text-slate-900">
              {editPlanId ? 'แก้ไขโครงการตามแผน' : 'เพิ่มโครงการตามแผน'}
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <label className="text-xs font-medium text-slate-600">
                ประเภทเงิน
                <select
                  value={pFund}
                  onChange={(e) => setPFund(e.target.value)}
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
                ฝ่ายงาน
                <select
                  value={pDept}
                  onChange={(e) => setPDept(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  {DEPARTMENTS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-medium text-slate-600">
                ชื่อโครงการ
                <input
                  type="text"
                  value={pName}
                  onChange={(e) => setPName(e.target.value)}
                  required
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs font-medium text-slate-600">
                งบตามแผน (บาท)
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={pAmt}
                  onChange={(e) => setPAmt(e.target.value)}
                  required
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
                />
              </label>
              <label className="text-xs font-medium text-slate-600">
                หมายเหตุ
                <input
                  type="text"
                  value={pNote}
                  onChange={(e) => setPNote(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="submit"
                className="rounded-lg bg-[#14306b] px-4 py-2 text-sm font-medium text-white hover:bg-[#1d428e]"
              >
                บันทึกโครงการ
              </button>
              {editPlanId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditPlanId('');
                    setPName('');
                    setPAmt('');
                    setPNote('');
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700"
                >
                  ยกเลิก
                </button>
              )}
            </div>
          </form>

          {/* Plan vs Allocation Check */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-2 text-sm font-bold text-slate-900">
              ตรวจสอบงบประมาณที่จัดสรรกับโครงการตามแผน ปีงบประมาณ {fy}
            </h3>
            {!planCheck ? (
              <p className="text-xs text-slate-500">
                ยังไม่มีผลคำนวณเงินอุดหนุน กรุณาคำนวณเงินอุดหนุนและบันทึกการจัดสรรก่อน
              </p>
            ) : (
              <>
                <div className="mb-3 flex flex-wrap items-center gap-3">
                  {planCheck.bad > 0 ? (
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-xs font-bold text-white">
                      <AlertTriangle className="h-4 w-4" />
                      งบไม่ตรงกัน ({planCheck.bad} รายการ) ตรวจสอบตารางด้านล่าง
                    </span>
                  ) : planCheck.cf &&
                    Math.abs(planCheck.cf.total - planCheck.tAct) < 0.01 &&
                    Math.abs((planCheck.cf.expected || 0) - planCheck.tExp) < 0.01 ? (
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white">
                      <CheckCircle2 className="h-4 w-4" />
                      ยืนยันแล้ว โดย {planCheck.cf.by} เมื่อ {thDate(planCheck.cf.date)}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => confirmPlanCheck(fy, planCheck.tAct, planCheck.tExp)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      งบตรงกัน กดเพื่อยืนยันความตรงกัน
                    </button>
                  )}
                  {planCheck.otherCount > 0 && (
                    <span className="text-xs text-slate-500">
                      มีโครงการนอกเหนือการจัดสรร {planCheck.otherCount} รายการ รวม {fmt(planCheck.otherAmt)} บาท
                    </span>
                  )}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                        <th className="px-3 py-2 text-left">รายการ</th>
                        <th className="px-3 py-2 text-right">งบที่จัดสรร</th>
                        <th className="px-3 py-2 text-right">งบตามโครงการ</th>
                        <th className="px-3 py-2 text-right">ผลต่าง</th>
                        <th className="px-3 py-2 text-left">สถานะ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {planCheck.rows.map((r) => (
                        <tr key={r.title}>
                          <td className="px-3 py-2">{r.title}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmt(r.expected)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmt(r.actual)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmt(r.diff)}</td>
                          <td
                            className={`px-3 py-2 text-xs font-semibold ${
                              Math.abs(r.diff) < 0.01 ? 'text-emerald-700' : 'text-red-600'
                            }`}
                          >
                            {Math.abs(r.diff) < 0.01
                              ? '✓ ตรงกัน'
                              : r.diff < 0
                              ? `ตั้งงบยังไม่ครบ ขาด ${fmt(-r.diff)}`
                              : `ตั้งงบเกินจัดสรร ${fmt(r.diff)}`}
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-slate-50 font-bold">
                        <td className="px-3 py-2">รวมทุกประเภทเงินที่จัดสรร</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmt(planCheck.tExp)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmt(planCheck.tAct)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {fmt(planCheck.tAct - planCheck.tExp)}
                        </td>
                        <td />
                      </tr>
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          {/* Plans List */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-bold text-slate-900">
              โครงการตามแผนและงบประมาณ ปีงบประมาณ {fy}
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[740px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                    <th className="px-3 py-2 text-left">โครงการ / ฝ่ายงาน</th>
                    <th className="px-3 py-2 text-left">ประเภทเงิน</th>
                    <th className="px-3 py-2 text-right">งบตามแผน</th>
                    <th className="px-3 py-2 text-right">อนุมัติ/ใช้ไป</th>
                    <th className="px-3 py-2 text-right">จ่ายจริง</th>
                    <th className="px-3 py-2 text-right">คงเหลือ</th>
                    <th className="px-3 py-2 text-left">ความคืบหน้า</th>
                    <th className="px-3 py-2 text-right">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {plansForFy.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-3 py-6 text-center text-xs text-slate-400">
                        ยังไม่มีโครงการตามแผนในปีงบประมาณนี้
                      </td>
                    </tr>
                  ) : (
                    plansForFy.map((p) => {
                      const pct = p.amount > 0 ? Math.min(100, (p.used / p.amount) * 100) : 0;
                      return (
                        <tr key={p.id} className="hover:bg-slate-50">
                          <td className="px-3 py-2">
                            <div className="font-medium text-slate-900">{p.project}</div>
                            <div className="text-xs text-slate-500">{p.dept}</div>
                          </td>
                          <td className="px-3 py-2 text-xs text-slate-600">{fundName(p.fund)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmt(p.amount)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmt(p.used)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmt(p.paid)}</td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums">{fmt(p.left)}</td>
                          <td className="px-3 py-2">
                            <div className="h-2 w-20 overflow-hidden rounded-full bg-slate-200">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${pct}%`,
                                  backgroundColor: pct > 90 ? '#dc2626' : '#2563eb',
                                }}
                              />
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <div className="inline-flex gap-1.5">
                              {hasPermission('canEdit') && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditPlanId(p.id);
                                    setPFund(p.fund);
                                    setPDept(p.dept);
                                    setPName(p.project);
                                    setPAmt(String(p.amount));
                                    setPNote(p.note);
                                    window.scrollTo({ top: 0, behavior: 'smooth' });
                                  }}
                                  className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                                >
                                  แก้ไข
                                </button>
                              )}
                              {hasPermission('canDelete') && (
                                <button
                                  type="button"
                                  onClick={() => deletePlan(p.id)}
                                  className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                                >
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

      {/* TAB 5: Project Reports */}
      {tab === 'prep' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-3 text-base font-bold text-slate-900">บันทึกรายงานผลโครงการ</h3>
            <div className="space-y-3">
              <label className="block text-xs font-medium text-slate-600">
                เลือกจากโครงการตามแผน
                <select
                  value={rpPlanId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setRpPlanId(id);
                    const found = plansForFy.find((x) => x.id === id);
                    if (found) {
                      setRpName(found.project);
                      setRpDept(found.dept);
                      setRpAppr(String(found.amount));
                      setRpSpent(String(found.paid));
                    }
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="">— เลือกโครงการ (หรือกรอกเอง) —</option>
                  {plansForFy.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.project}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-medium text-slate-600">
                ชื่อโครงการ
                <input
                  type="text"
                  value={rpName}
                  onChange={(e) => setRpName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <label className="block text-xs font-medium text-slate-600">
                  ฝ่ายงาน
                  <input
                    type="text"
                    value={rpDept}
                    onChange={(e) => setRpDept(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-xs font-medium text-slate-600">
                  งบที่ได้รับ (บาท)
                  <input
                    type="number"
                    value={rpAppr}
                    onChange={(e) => setRpAppr(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
                  />
                </label>
                <label className="block text-xs font-medium text-slate-600">
                  ใช้จ่ายจริง (บาท)
                  <input
                    type="number"
                    value={rpSpent}
                    onChange={(e) => setRpSpent(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
                  />
                </label>
              </div>
              <label className="block text-xs font-medium text-slate-600">
                ผลการดำเนินงาน / ความสำเร็จ
                <textarea
                  rows={3}
                  value={rpSum}
                  onChange={(e) => setRpSum(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-xs font-medium text-slate-600">
                ปัญหา อุปสรรค ข้อเสนอแนะ
                <textarea
                  rows={2}
                  value={rpIss}
                  onChange={(e) => setRpIss(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block text-xs font-medium text-slate-600">
                  สถานะโครงการ
                  <select
                    value={rpStatus}
                    onChange={(e) => setRpStatus(e.target.value as ProjectReport['status'])}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    <option value="เสร็จสิ้นตามแผน">เสร็จสิ้นตามแผน</option>
                    <option value="อยู่ระหว่างดำเนินการ">อยู่ระหว่างดำเนินการ</option>
                    <option value="ยกเลิก/ปรับเปลี่ยน">ยกเลิก/ปรับเปลี่ยน</option>
                  </select>
                </label>
                <label className="block text-xs font-medium text-slate-600">
                  ผู้รายงาน
                  <input
                    type="text"
                    value={rpWho}
                    onChange={(e) => setRpWho(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => handleSaveProjectReport(false)}
                  className="rounded-lg bg-[#14306b] px-4 py-2 text-xs font-medium text-white hover:bg-[#1d428e]"
                >
                  บันทึกรายงาน
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveProjectReport(true)}
                  className="rounded-lg border border-[#14306b] bg-white px-4 py-2 text-xs font-medium text-[#14306b] hover:bg-blue-50"
                >
                  บันทึกและพิมพ์ PDF
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setUploadTargetReportId(null);
                    if (fileInputRef.current) {
                      fileInputRef.current.accept = '.doc,.docx,.pdf';
                      fileInputRef.current.click();
                    }
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Upload className="h-3.5 w-3.5" /> อัปโหลด Word / PDF เข้า Drive
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleFileChosen}
              />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-bold text-slate-900">รายงานที่บันทึกแล้ว ({reportsForFy.length})</h3>
              <SignatureToggle />
            </div>
            <div className="space-y-2.5">
              {reportsForFy.length === 0 ? (
                <p className="py-8 text-center text-xs text-slate-400">ยังไม่มีรายงานผลโครงการในปีงบประมาณนี้</p>
              ) : (
                reportsForFy.map((r) => (
                  <div key={r.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold text-slate-900">{r.project}</div>
                        <div className="text-xs text-slate-500">
                          {r.dept} · {thDate(r.date)} · สถานะ: {r.status}
                        </div>
                        <div className="mt-1 text-xs text-slate-700 tabular-nums">
                          งบได้รับ {fmt(r.approved)} บาท · ใช้จ่ายจริง {fmt(r.spent)} บาท
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => printHtmlSection(buildReportHtml(r), r.project, 'portrait')}
                          className="rounded border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          พิมพ์ PDF
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            exportHtmlToWord(`รายงานผล_${r.project}.doc`, r.project, buildReportHtml(r), {
                              orientation: 'portrait',
                            })
                          }
                          className="rounded border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Word (.doc)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setUploadTargetReportId(r.id);
                            if (fileInputRef.current) {
                              fileInputRef.current.accept = '.doc,.docx,.pdf';
                              fileInputRef.current.click();
                            }
                          }}
                          className="rounded border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          แนบไฟล์ Drive
                        </button>
                      </div>
                    </div>
                    {r.files?.length > 0 && (
                      <div className="mt-2 space-y-1 border-t border-slate-100 pt-2">
                        {r.files.map((f) => (
                          <div key={f.id} className="flex items-center justify-between text-xs">
                            <a
                              href={f.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[#2563eb] hover:underline"
                            >
                              [{f.type}] {f.name}
                            </a>
                            {hasPermission('canDelete') && (
                              <button
                                type="button"
                                onClick={() => deleteReportDocument(r.id, f.id)}
                                className="inline-flex items-center gap-1 text-red-600 hover:underline"
                              >
                                <Trash2 className="h-3 w-3" /> ลบ
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
