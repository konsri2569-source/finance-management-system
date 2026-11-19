import React, { useState } from 'react';
import {
  Award,
  BarChart3,
  BookOpen,
  CalendarRange,
  ClipboardList,
  Cloud,
  CloudOff,
  Landmark,
  LogIn,
  LogOut,
  Menu,
  RefreshCw,
  Settings,
  X,
} from 'lucide-react';
import { AppProvider, useApp } from './context/AppContext';
import { DashboardView } from './components/DashboardView';
import { PlanBudgetView } from './components/PlanBudgetView';
import { FinancialControlView } from './components/FinancialControlView';
import { OfficialReportsView } from './components/OfficialReportsView';
import { DirectorAssessmentView } from './components/DirectorAssessmentView';
import { SettingsView } from './components/SettingsView';
import { LoginModal } from './components/LoginModal';
import { PrintPreviewModal } from './components/PrintPreviewModal';
import { UserPermissions } from './types/finance';
import { alertError, confirmAction, toastSuccess } from './utils/formatters';

type RouteId = UserPermissions['menus'][number];

const NAV_ITEMS: Array<{
  id: RouteId;
  label: string;
  title: string;
  icon: React.ReactNode;
}> = [
  {
    id: 'dash',
    label: 'แดชบอร์ดภาพรวม',
    title: 'ภาพรวมการเงินและงบประมาณสถานศึกษา',
    icon: <BarChart3 className="h-4 w-4 shrink-0" />,
  },
  {
    id: 'plan',
    label: 'ระบบแผน/งบประมาณ',
    title: 'ระบบวางแผน คำนวณอุดหนุน จัดสรร และรายงานผลโครงการ',
    icon: <ClipboardList className="h-4 w-4 shrink-0" />,
  },
  {
    id: 'fin',
    label: 'ระบบควบคุมการเงิน',
    title: 'ระบบควบคุมการเงินและบัญชีสถานศึกษา (ระเบียบฯ พ.ศ. 2544)',
    icon: <Landmark className="h-4 w-4 shrink-0" />,
  },
  {
    id: 'docs',
    label: 'เอกสารราชการและส่งออก',
    title: 'รายงานการเงินส่วนที่ 1–5 สมุดเงินสด ทะเบียนคุม และส่งออก Word/PDF',
    icon: <BookOpen className="h-4 w-4 shrink-0" />,
  },
  {
    id: 'eval',
    label: 'ประเมินสัมฤทธิผลฯ ผอ.',
    title: 'ประเมินสัมฤทธิผลการปฏิบัติงานตามข้อตกลง (PA) ผู้อำนวยการสถานศึกษา',
    icon: <Award className="h-4 w-4 shrink-0" />,
  },
  {
    id: 'set',
    label: 'ตั้งค่าระบบและสิทธิ์',
    title: 'ตั้งค่าสถานศึกษา ผู้ใช้งาน (RBAC) ธนาคาร และ Google Sheets/Drive',
    icon: <Settings className="h-4 w-4 shrink-0" />,
  },
];

const AppShell: React.FC = () => {
  const {
    fy,
    setFy,
    availableYears,
    db,
    currentUser,
    logoutAppUser,
    canAccessMenu,
    isGoogleConnected,
    googleUser,
    isSyncing,
    lastSyncedAt,
    connectGoogleWorkspace,
    disconnectGoogleWorkspace,
    pullFromGoogleSheets,
  } = useApp();

  const [route, setRoute] = useState<RouteId>('dash');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [pendingRoute, setPendingRoute] = useState<RouteId | null>(null);

  const activeNav = NAV_ITEMS.find((n) => n.id === route) || NAV_ITEMS[0];

  const handleSelectRoute = (target: RouteId) => {
    setMobileMenuOpen(false);
    if (target === 'dash') {
      setRoute('dash');
      return;
    }
    if (!currentUser) {
      setPendingRoute(target);
      setLoginOpen(true);
      return;
    }
    if (!canAccessMenu(target)) {
      alertError('บัญชีผู้ใช้งานของคุณไม่ได้รับสิทธิ์เข้าถึงเมนูนี้');
      return;
    }
    setRoute(target);
  };

  const handleLoginSuccess = () => {
    if (pendingRoute) {
      setRoute(pendingRoute);
      setPendingRoute(null);
    }
  };

  const handleStaffLogout = async () => {
    const ok = await confirmAction('ออกจากระบบเจ้าหน้าที่', 'ต้องการออกจากระบบผู้ใช้งานปัจจุบันหรือไม่?', 'ออกจากระบบ');
    if (!ok) return;
    logoutAppUser();
    setRoute('dash');
    toastSuccess('ออกจากระบบเจ้าหน้าที่แล้ว');
  };

  const handleGoogleAction = async () => {
    if (!isGoogleConnected) {
      try {
        await connectGoogleWorkspace();
        toastSuccess('เชื่อมต่อ Google Workspace สำเร็จ');
        try {
          await pullFromGoogleSheets();
          toastSuccess('ซิงก์ข้อมูลจาก Google Sheets ล่าสุดแล้ว');
        } catch {
          // Allow user to configure sheet ID in settings
        }
      } catch (err: any) {
        alertError(err.message || 'ไม่สามารถเชื่อมต่อ Google ได้');
      }
      return;
    }
    const ok = await confirmAction(
      'ยกเลิกการเชื่อมต่อ Google Workspace?',
      `กำลังเชื่อมต่อด้วยบัญชี ${googleUser?.email || ''} ต้องการออกจากระบบ Google หรือไม่?`,
      'ออกจากระบบ Google',
      true
    );
    if (ok) {
      await disconnectGoogleWorkspace();
      toastSuccess('ยกเลิกการเชื่อมต่อ Google แล้ว');
    }
  };

  const handleManualPull = async () => {
    try {
      await pullFromGoogleSheets();
      toastSuccess('โหลดข้อมูลล่าสุดจาก Google Sheets เรียบร้อยแล้ว');
    } catch (err: any) {
      alertError(err.message || 'โหลดข้อมูลไม่สำเร็จ');
    }
  };

  return (
    <div className="flex min-h-screen bg-[#f4f7fb] text-slate-900">
      {/* Mobile Sidebar Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Left Fixed Sidebar (260px desktop, drawer mobile) */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[260px] flex-col border-r border-slate-200 bg-[#0f2454] text-white transition-transform duration-200 lg:static lg:translate-x-0 print:hidden ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-4">
          <div className="flex items-center gap-2.5 min-w-0">
            {db.assets.logo ? (
              <img
                src={db.assets.logo}
                alt="Logo"
                className="h-9 w-9 shrink-0 rounded-md bg-white object-contain p-0.5"
              />
            ) : (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white/15 font-bold text-white">
                DMS
              </div>
            )}
            <div className="min-w-0">
              <div className="truncate text-sm font-bold text-white">
                {db.settings.schoolName}
              </div>
              <div className="truncate text-[11px] text-blue-200">
                ระบบบริหารการเงินสถานศึกษา
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="rounded p-1 text-blue-200 hover:bg-white/10 lg:hidden"
            aria-label="ปิดเมนู"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {NAV_ITEMS.map((item) => {
            const active = route === item.id;
            const allowed = item.id === 'dash' || !currentUser || canAccessMenu(item.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectRoute(item.id)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-white text-[#0f2454] font-semibold'
                    : allowed
                    ? 'text-blue-100 hover:bg-white/10 hover:text-white'
                    : 'text-blue-300/40 hover:bg-white/5'
                }`}
              >
                {item.icon}
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-3 text-[11px] text-blue-200 space-y-2">
          <div className="flex items-center justify-between">
            <span>สถานะ Google Cloud</span>
            <span className={isGoogleConnected ? 'text-emerald-300 font-medium' : 'text-amber-300'}>
              {isGoogleConnected ? 'เชื่อมต่อแล้ว' : 'ยังไม่เชื่อมต่อ'}
            </span>
          </div>
          {lastSyncedAt && (
            <div className="text-[10px] text-blue-300">ซิงก์ล่าสุด: {lastSyncedAt}</div>
          )}
          <div className="text-[10px] text-blue-300/80">
            ระเบียบฯ เงินรายได้ พ.ศ. 2544
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* 3-Zone TopBar */}
        <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-6 print:hidden">
          {/* Left Zone: Hamburger + Page Title */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 lg:hidden"
              aria-label="เปิดเมนู"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-base font-bold text-slate-900 sm:text-lg">
                {activeNav.label}
              </h1>
              <p className="hidden truncate text-xs text-slate-500 sm:block">
                {activeNav.title}
              </p>
            </div>
          </div>

          {/* Right Zone: FY Selector + Google Sync + Staff Auth */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Fiscal Year Selector */}
            <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5">
              <CalendarRange className="h-3.5 w-3.5 text-slate-500" />
              <label htmlFor="fy-select" className="text-xs font-medium text-slate-600 whitespace-nowrap">
                ปีงบประมาณ
              </label>
              <select
                id="fy-select"
                value={fy}
                onChange={(e) => setFy(Number(e.target.value))}
                className="bg-transparent text-xs font-bold text-[#14306b] focus:outline-none tabular-nums"
              >
                {availableYears.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            {/* Pull Google Sheets button when connected */}
            {isGoogleConnected && (
              <button
                type="button"
                disabled={isSyncing}
                onClick={handleManualPull}
                title="โหลดข้อมูลล่าสุดจาก Google Sheets"
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">ดึงชีต</span>
              </button>
            )}

            {/* Google Workspace Connect / Account */}
            <button
              type="button"
              onClick={handleGoogleAction}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                isGoogleConnected
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {isGoogleConnected ? (
                <>
                  <Cloud className="h-3.5 w-3.5" />
                  <span className="max-w-[130px] truncate">{googleUser?.email || 'Google Connected'}</span>
                </>
              ) : (
                <>
                  <CloudOff className="h-3.5 w-3.5 text-slate-400" />
                  <span>เชื่อมต่อ Google</span>
                </>
              )}
            </button>

            {/* App Staff Auth Button */}
            {currentUser ? (
              <button
                type="button"
                onClick={handleStaffLogout}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                <LogOut className="h-3.5 w-3.5 text-slate-500" />
                <span>{currentUser.name}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setPendingRoute(null);
                  setLoginOpen(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#14306b] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#1d428e] whitespace-nowrap shrink-0"
              >
                <LogIn className="h-3.5 w-3.5" />
                <span>เข้าสู่ระบบเจ้าหน้าที่</span>
              </button>
            )}
          </div>
        </header>

        {/* Main Workspace Container */}
        <main className="mx-auto w-full max-w-[1440px] flex-1 p-4 sm:p-6">
          {route === 'dash' && <DashboardView />}
          {route === 'plan' && <PlanBudgetView />}
          {route === 'fin' && <FinancialControlView />}
          {route === 'docs' && <OfficialReportsView />}
          {route === 'eval' && <DirectorAssessmentView />}
          {route === 'set' && <SettingsView />}
        </main>
      </div>

      <LoginModal
        open={loginOpen}
        onClose={() => {
          setLoginOpen(false);
          setPendingRoute(null);
        }}
        onSuccess={handleLoginSuccess}
      />
      <PrintPreviewModal />
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  );
}
