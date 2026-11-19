import React, { useState } from 'react';
import {
  Building2,
  Cloud,
  Code2,
  Copy,
  Database,
  Download,
  FileCode2,
  FolderPlus,
  Image as ImageIcon,
  Landmark,
  RefreshCw,
  Save,
  Shield,
  Trash2,
  UploadCloud,
  UserPlus,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { SignatureToggle } from './SignatureToggle';
import { triggerBlobDownload } from '../services/exportService';
import { generateCodeGs, generateIndexHtml } from '../services/gasPackageGenerator';
import {
  ADMIN_PERMISSIONS,
  AppUser,
  DEFAULT_STAFF_PERMISSIONS,
  SchoolAssets,
  UserPermissions,
} from '../types/finance';
import { alertError, toastSuccess } from '../utils/formatters';

type SettingsTab = 'school' | 'assets' | 'users' | 'banks' | 'cloud' | 'gas';

const THAI_BANKS = [
  'ธนาคารกรุงไทย',
  'ธนาคารออมสิน',
  'ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร (ธ.ก.ส.)',
  'ธนาคารไทยพาณิชย์',
  'ธนาคารกสิกรไทย',
  'ธนาคารกรุงเทพ',
  'ธนาคารกรุงศรีอยุธยา',
  'ธนาคารทหารไทยธนชาต (ttb)',
];

const MENU_LABELS: Array<{ id: UserPermissions['menus'][number]; label: string }> = [
  { id: 'dash', label: 'แดชบอร์ดภาพรวม' },
  { id: 'plan', label: 'ระบบแผน/งบประมาณ' },
  { id: 'fin', label: 'ระบบควบคุมการเงิน' },
  { id: 'docs', label: 'เอกสารราชการและส่งออก' },
  { id: 'eval', label: 'ประเมินสัมฤทธิผลฯ ผอ.' },
  { id: 'set', label: 'ตั้งค่าระบบและสิทธิ์' },
];

/** Shrink image onto offscreen canvas until <= 45KB PNG/JPEG base64 for Google Sheets cell storage */
async function shrinkImageDataUrl(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('ไม่สามารถอ่านไฟล์ภาพได้'));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('ไฟล์ภาพไม่ถูกต้อง'));
    el.src = dataUrl;
  });

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;

  let maxDim = 420;
  let result = '';
  for (let step = 0; step < 5; step++) {
    const ratio = Math.min(1, maxDim / Math.max(img.width, img.height));
    canvas.width = Math.max(1, Math.round(img.width * ratio));
    canvas.height = Math.max(1, Math.round(img.height * ratio));
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    result = canvas.toDataURL('image/png');
    if (result.length <= 45000) break;
    maxDim = Math.round(maxDim * 0.72);
  }
  return result;
}

export const SettingsView: React.FC = () => {
  const {
    db,
    spreadsheetId,
    isGoogleConnected,
    isSyncing,
    lastSyncedAt,
    connectGoogleWorkspace,
    saveSettings,
    saveAsset,
    saveUser,
    saveBank,
    saveDriveFolder,
    createAndLinkDriveFolder,
    changeSpreadsheetId,
    createAndConnectNewSheet,
    pullFromGoogleSheets,
    pushToGoogleSheets,
  } = useApp();

  const [tab, setTab] = useState<SettingsTab>('school');
  const [busy, setBusy] = useState(false);

  // School Info Form
  const [schoolForm, setSchoolForm] = useState({
    schoolName: db.settings.schoolName,
    affiliation: db.settings.affiliation,
    district: db.settings.district || '',
    province: db.settings.province || '',
    schoolCode: db.settings.schoolCode || '',
    schoolSize: db.settings.schoolSize,
    director: db.settings.director,
    financeName: db.settings.financeName,
  });

  // User RBAC Form
  const [userForm, setUserForm] = useState<AppUser>({
    username: '',
    name: '',
    role: 'staff',
    active: true,
    pw: '',
    permissions: { ...DEFAULT_STAFF_PERMISSIONS },
  });

  // Bank Form
  const [bankForm, setBankForm] = useState({
    id: '',
    bank: 'ธนาคารกรุงไทย',
    accountNo: '',
    accountName: '',
    note: '',
    active: true,
  });

  // Cloud Sheet / Drive Form
  const [sheetInput, setSheetInput] = useState(spreadsheetId);
  const [driveInput, setDriveInput] = useState(db.settings.driveFolderId || '');
  const [newDriveFolderName, setNewDriveFolderName] = useState(`เอกสารการเงิน_${db.settings.schoolName}`);

  const handleSaveSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await saveSettings(schoolForm);
      toastSuccess('บันทึกข้อมูลโรงเรียนแล้ว');
    } catch (err: any) {
      if (err.message !== '__CANCELLED__') alertError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleUploadAsset = async (key: keyof SchoolAssets, file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      const shrunk = await shrinkImageDataUrl(file);
      await saveAsset(key, shrunk);
      toastSuccess('บันทึกรูปภาพเรียบร้อยแล้ว');
    } catch (err: any) {
      if (err.message !== '__CANCELLED__') alertError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveAsset = async (key: keyof SchoolAssets) => {
    try {
      await saveAsset(key, '');
      toastSuccess('ลบรูปภาพเรียบร้อยแล้ว');
    } catch (err: any) {
      if (err.message !== '__CANCELLED__') alertError(err.message);
    }
  };

  const toggleMenuPerm = (menuId: UserPermissions['menus'][number]) => {
    setUserForm((prev) => {
      const has = prev.permissions.menus.includes(menuId);
      const nextMenus = has
        ? prev.permissions.menus.filter((m) => m !== menuId)
        : [...prev.permissions.menus, menuId];
      return {
        ...prev,
        permissions: { ...prev.permissions, menus: nextMenus },
      };
    });
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await saveUser(userForm);
      toastSuccess('บันทึกผู้ใช้งานและสิทธิ์เรียบร้อยแล้ว');
      setUserForm({
        username: '',
        name: '',
        role: 'staff',
        active: true,
        pw: '',
        permissions: { ...DEFAULT_STAFF_PERMISSIONS },
      });
    } catch (err: any) {
      if (err.message !== '__CANCELLED__') alertError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleSaveBank = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await saveBank(bankForm);
      toastSuccess('บันทึกบัญชีธนาคารเรียบร้อยแล้ว');
      setBankForm({
        id: '',
        bank: 'ธนาคารกรุงไทย',
        accountNo: '',
        accountName: '',
        note: '',
        active: true,
      });
    } catch (err: any) {
      if (err.message !== '__CANCELLED__') alertError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleConnectSheet = async () => {
    setBusy(true);
    try {
      await changeSpreadsheetId(sheetInput);
      toastSuccess('เชื่อมต่อและอัปเดต Google Sheet ID แล้ว');
    } catch (err: any) {
      if (err.message !== '__CANCELLED__') alertError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleCreateNewSheet = async () => {
    setBusy(true);
    try {
      const id = await createAndConnectNewSheet(schoolForm.schoolName);
      if (id) {
        setSheetInput(id);
        toastSuccess('สร้าง Google Sheet ใหม่และซิงก์ข้อมูลสำเร็จ');
      }
    } catch (err: any) {
      if (err.message !== '__CANCELLED__') alertError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handlePull = async () => {
    setBusy(true);
    try {
      await pullFromGoogleSheets();
      toastSuccess('ดึงข้อมูลจาก Google Sheets สำเร็จ');
    } catch (err: any) {
      alertError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handlePush = async () => {
    setBusy(true);
    try {
      const ok = await pushToGoogleSheets(
        'ต้องการอัปโหลดข้อมูลทั้งหมดในระบบไปยัง Google Sheets (เขียนทับข้อมูลในชีตปัจจุบัน) หรือไม่?'
      );
      if (ok) toastSuccess('ซิงก์ข้อมูลขึ้น Google Sheets สำเร็จ');
    } catch (err: any) {
      alertError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleSaveDriveFolder = async () => {
    setBusy(true);
    try {
      const name = await saveDriveFolder(driveInput);
      toastSuccess(`ผูกโฟลเดอร์ "${name}" เรียบร้อยแล้ว`);
    } catch (err: any) {
      if (err.message !== '__CANCELLED__') alertError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleCreateDriveFolder = async () => {
    setBusy(true);
    try {
      const created = await createAndLinkDriveFolder(newDriveFolderName);
      setDriveInput(created.id);
      toastSuccess(`สร้างและผูกโฟลเดอร์ "${created.name}" แล้ว`);
    } catch (err: any) {
      if (err.message !== '__CANCELLED__') alertError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleDownloadCodeGs = () => {
    const content = generateCodeGs(spreadsheetId, db.settings.schoolName);
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    triggerBlobDownload(blob, 'code.gs');
    toastSuccess('ดาวน์โหลดไฟล์ code.gs แล้ว');
  };

  const handleDownloadIndexHtml = () => {
    const content = generateIndexHtml(db.settings.schoolName);
    const blob = new Blob([content], { type: 'text/html;charset=utf-8' });
    triggerBlobDownload(blob, 'index.html');
    toastSuccess('ดาวน์โหลดไฟล์ index.html แล้ว');
  };

  const handleDownloadGasBundle = () => {
    handleDownloadCodeGs();
    setTimeout(() => {
      handleDownloadIndexHtml();
    }, 350);
    toastSuccess('ดาวน์โหลดครบ 2 ไฟล์ (code.gs และ index.html) เรียบร้อยแล้ว');
  };

  const handleCopyGasFile = async (which: 'code.gs' | 'index.html') => {
    const text =
      which === 'code.gs'
        ? generateCodeGs(spreadsheetId, db.settings.schoolName)
        : generateIndexHtml(db.settings.schoolName);
    await navigator.clipboard.writeText(text);
    toastSuccess(`คัดลอกโค้ด ${which} ไปยังคลิปบอร์ดแล้ว`);
  };

  const TABS: Array<{ id: SettingsTab; label: string; icon: React.ReactNode }> = [
    { id: 'school', label: 'ข้อมูลโรงเรียน', icon: <Building2 className="h-4 w-4" /> },
    { id: 'assets', label: 'โลโก้และลายเซ็น', icon: <ImageIcon className="h-4 w-4" /> },
    { id: 'users', label: 'ผู้ใช้งานและสิทธิ์ (RBAC)', icon: <Shield className="h-4 w-4" /> },
    { id: 'banks', label: 'บัญชีธนาคาร', icon: <Landmark className="h-4 w-4" /> },
    { id: 'cloud', label: 'Google Sheets & Drive', icon: <Cloud className="h-4 w-4" /> },
    { id: 'gas', label: 'ดาวน์โหลด GAS (2 ไฟล์)', icon: <FileCode2 className="h-4 w-4" /> },
  ];

  return (
    <div className="space-y-4">
      {/* Sub-navigation */}
      <div className="flex flex-wrap gap-1.5 rounded-xl border border-slate-200 bg-white p-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              tab === t.id
                ? 'bg-[#14306b] text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* 1. School Info */}
      {tab === 'school' && (
        <form onSubmit={handleSaveSchool} className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <h3 className="text-base font-bold text-slate-900">ข้อมูลพื้นฐานสถานศึกษา</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">ชื่อโรงเรียน</label>
              <input
                type="text"
                required
                value={schoolForm.schoolName}
                onChange={(e) => setSchoolForm({ ...schoolForm, schoolName: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">สังกัด / สำนักงานเขตพื้นที่ฯ</label>
              <input
                type="text"
                value={schoolForm.affiliation}
                onChange={(e) => setSchoolForm({ ...schoolForm, affiliation: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">อำเภอ</label>
              <input
                type="text"
                value={schoolForm.district}
                onChange={(e) => setSchoolForm({ ...schoolForm, district: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">จังหวัด</label>
              <input
                type="text"
                value={schoolForm.province}
                onChange={(e) => setSchoolForm({ ...schoolForm, province: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">รหัสสถานศึกษา (10 หลัก)</label>
              <input
                type="text"
                value={schoolForm.schoolCode}
                onChange={(e) => setSchoolForm({ ...schoolForm, schoolCode: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">ขนาดโรงเรียน (กำหนดวงเงินเก็บรักษาเงินสด)</label>
              <select
                value={schoolForm.schoolSize}
                onChange={(e) =>
                  setSchoolForm({ ...schoolForm, schoolSize: e.target.value as 'small' | 'large' })
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="small">โรงเรียนขนาดเล็ก / ทั่วไป (เก็บรักษาไม่เกิน 20,000 บาท/วัน)</option>
                <option value="large">โรงเรียนขนาดใหญ่ (เก็บรักษาไม่เกิน 30,000 บาท/วัน)</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">ชื่อ-สกุล ผู้อำนวยการสถานศึกษา</label>
              <input
                type="text"
                value={schoolForm.director}
                onChange={(e) => setSchoolForm({ ...schoolForm, director: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">ชื่อ-สกุล เจ้าหน้าที่การเงิน</label>
              <input
                type="text"
                value={schoolForm.financeName}
                onChange={(e) => setSchoolForm({ ...schoolForm, financeName: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#14306b] px-4 py-2 text-xs font-medium text-white hover:bg-[#1d428e] disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              บันทึกข้อมูลโรงเรียน
            </button>
          </div>
        </form>
      )}

      {/* 2. Assets (Logo & Signatures) */}
      {tab === 'assets' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
            <div>
              <h4 className="text-sm font-bold text-slate-900">การแสดงลายเซ็นอัตโนมัติบนเอกสารราชการ</h4>
              <p className="text-xs text-slate-500">
                เลือกเปิดเพื่อฝังภาพลายเซ็นอัตโนมัติ หรือปิดเพื่อเว้นช่องลงชื่อว่างสำหรับเซ็นด้วยปากกา (สามารถสลับได้ทันทีจากหน้าพิมพ์/ส่งออกทุกเมนู)
              </p>
            </div>
            <SignatureToggle />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {(
            [
              { key: 'logo', title: 'ตราสัญลักษณ์โรงเรียน', hint: 'แสดงบนหัวเอกสารราชการและรายงานประจำวัน' },
              { key: 'sigDirector', title: 'ลายเซ็นผู้อำนวยการ', hint: 'แสดงท้ายเอกสารราชการอัตโนมัติ' },
              { key: 'sigFinance', title: 'ลายเซ็นเจ้าหน้าที่การเงิน', hint: 'แสดงท้ายเอกสารราชการอัตโนมัติ' },
            ] as const
          ).map((item) => {
            const val = db.assets[item.key];
            return (
              <div key={item.key} className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">{item.title}</h4>
                  <p className="text-xs text-slate-500">{item.hint}</p>
                </div>
                <div className="flex h-36 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 p-2">
                  {val ? (
                    <img src={val} alt={item.title} className="max-h-32 object-contain" />
                  ) : (
                    <span className="text-xs text-slate-400">ยังไม่ได้อัปโหลดภาพ</span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <label className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                    อัปโหลดภาพ (PNG/JPG)
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleUploadAsset(item.key, e.target.files?.[0])}
                    />
                  </label>
                  {val && (
                    <button
                      type="button"
                      onClick={() => handleRemoveAsset(item.key)}
                      className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      ลบ
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          </div>
        </div>
      )}

      {/* 3. Users & Granular RBAC */}
      {tab === 'users' && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <form onSubmit={handleSaveUser} className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <div className="flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-[#14306b]" />
              <h3 className="text-sm font-bold text-slate-900">เพิ่ม / แก้ไขผู้ใช้งานและกำหนดสิทธิ์ (RBAC)</h3>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="mb-1 block text-xs text-slate-600">ชื่อผู้ใช้ (a-z, 0-9)</label>
                <input
                  type="text"
                  required
                  value={userForm.username}
                  onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                  placeholder="เช่น staff01"
                  className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-600">ชื่อ-สกุลแสดงผล</label>
                <input
                  type="text"
                  required
                  value={userForm.name}
                  onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
                  placeholder="เช่น นางสาวการเงิน"
                  className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-600">บทบาทหลัก</label>
                <select
                  value={userForm.role}
                  onChange={(e) => {
                    const role = e.target.value as 'admin' | 'staff';
                    setUserForm({
                      ...userForm,
                      role,
                      permissions: role === 'admin' ? { ...ADMIN_PERMISSIONS } : { ...DEFAULT_STAFF_PERMISSIONS },
                    });
                  }}
                  className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
                >
                  <option value="staff">เจ้าหน้าที่ (Staff)</option>
                  <option value="admin">ผู้ดูแลระบบ (Admin)</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-600">รหัสผ่าน (4 ตัวขึ้นไป)</label>
                <input
                  type="password"
                  value={userForm.pw}
                  onChange={(e) => setUserForm({ ...userForm, pw: e.target.value })}
                  placeholder="เว้นว่างหากคงเดิม"
                  className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
                />
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
              <div className="text-xs font-semibold text-slate-700">สิทธิ์เข้าถึงเมนู</div>
              <div className="grid grid-cols-2 gap-1.5">
                {MENU_LABELS.map((m) => (
                  <label key={m.id} className="inline-flex items-center gap-1.5 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={userForm.role === 'admin' || userForm.permissions.menus.includes(m.id)}
                      disabled={userForm.role === 'admin'}
                      onChange={() => toggleMenuPerm(m.id)}
                    />
                    {m.label}
                  </label>
                ))}
              </div>
              <div className="pt-1 text-xs font-semibold text-slate-700">สิทธิ์ปฏิบัติการ</div>
              <div className="grid grid-cols-2 gap-1.5">
                {(
                  [
                    ['canAdd', 'เพิ่มข้อมูล/สร้างรายการ'],
                    ['canEdit', 'แก้ไขข้อมูล'],
                    ['canDelete', 'ลบรายการ'],
                    ['canApprove', 'อนุมัติคำขอใช้เงิน/ยืมเงิน'],
                    ['canViewReport', 'ดูรายงานและส่งออก'],
                  ] as const
                ).map(([k, lbl]) => (
                  <label key={k} className="inline-flex items-center gap-1.5 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={userForm.role === 'admin' || userForm.permissions[k]}
                      disabled={userForm.role === 'admin'}
                      onChange={(e) =>
                        setUserForm({
                          ...userForm,
                          permissions: { ...userForm.permissions, [k]: e.target.checked },
                        })
                      }
                    />
                    {lbl}
                  </label>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="inline-flex items-center gap-1.5 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={userForm.active}
                  onChange={(e) => setUserForm({ ...userForm, active: e.target.checked })}
                />
                เปิดใช้งานบัญชีนี้
              </label>
              <button
                type="submit"
                disabled={busy}
                className="rounded-lg bg-[#14306b] px-4 py-1.5 text-xs font-medium text-white hover:bg-[#1d428e] disabled:opacity-50"
              >
                บันทึกผู้ใช้งาน
              </button>
            </div>
          </form>

          <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-bold text-slate-900">รายชื่อผู้ใช้งานในระบบ</h3>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                    <th className="px-2.5 py-2 text-left">ผู้ใช้</th>
                    <th className="px-2.5 py-2 text-left">ชื่อ-สกุล</th>
                    <th className="px-2.5 py-2 text-center">บทบาท</th>
                    <th className="px-2.5 py-2 text-left">เมนู/สิทธิ์</th>
                    <th className="px-2.5 py-2 text-center">สถานะ</th>
                    <th className="px-2.5 py-2 text-center">แก้ไข</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {db.users.map((u) => (
                    <tr key={u.username}>
                      <td className="px-2.5 py-2 font-medium text-slate-900">{u.username}</td>
                      <td className="px-2.5 py-2">{u.name}</td>
                      <td className="px-2.5 py-2 text-center">
                        {u.role === 'admin' ? 'แอดมิน' : 'เจ้าหน้าที่'}
                      </td>
                      <td className="px-2.5 py-2 text-slate-500">
                        {u.role === 'admin' ? 'ทุกเมนูและทุกสิทธิ์' : `${u.permissions?.menus?.length || 0} เมนู`}
                      </td>
                      <td className="px-2.5 py-2 text-center">
                        <span className={u.active ? 'text-emerald-700 font-medium' : 'text-red-600'}>
                          {u.active ? 'ใช้งาน' : 'ปิดใช้งาน'}
                        </span>
                      </td>
                      <td className="px-2.5 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => setUserForm({ ...u, pw: '' })}
                          className="rounded border border-slate-300 px-2 py-1 text-[11px] hover:bg-slate-50"
                        >
                          เลือกแก้ไข
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 4. Bank Accounts */}
      {tab === 'banks' && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <form onSubmit={handleSaveBank} className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <h3 className="text-sm font-bold text-slate-900">เพิ่ม / แก้ไขบัญชีเงินฝากธนาคาร</h3>
            <div>
              <label className="mb-1 block text-xs text-slate-600">ธนาคาร</label>
              <input
                list="thai-bank-list"
                required
                value={bankForm.bank}
                onChange={(e) => setBankForm({ ...bankForm, bank: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
              />
              <datalist id="thai-bank-list">
                {THAI_BANKS.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-600">เลขที่บัญชี</label>
              <input
                type="text"
                required
                value={bankForm.accountNo}
                onChange={(e) => setBankForm({ ...bankForm, accountNo: e.target.value })}
                placeholder="เช่น 123-4-56789-0"
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs tabular-nums"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-600">ชื่อบัญชี</label>
              <input
                type="text"
                required
                value={bankForm.accountName}
                onChange={(e) => setBankForm({ ...bankForm, accountName: e.target.value })}
                placeholder="เช่น เงินอุดหนุนโรงเรียน..."
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-600">หมายเหตุ</label>
              <input
                type="text"
                value={bankForm.note}
                onChange={(e) => setBankForm({ ...bankForm, note: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
              />
            </div>
            <div className="flex items-center justify-between pt-1">
              <label className="inline-flex items-center gap-1.5 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={bankForm.active}
                  onChange={(e) => setBankForm({ ...bankForm, active: e.target.checked })}
                />
                ใช้งานบัญชีนี้
              </label>
              <button
                type="submit"
                disabled={busy}
                className="rounded-lg bg-[#14306b] px-4 py-1.5 text-xs font-medium text-white hover:bg-[#1d428e] disabled:opacity-50"
              >
                บันทึกบัญชีธนาคาร
              </button>
            </div>
          </form>

          <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-bold text-slate-900">รายการบัญชีธนาคารของโรงเรียน</h3>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                    <th className="px-2.5 py-2 text-left">ธนาคาร</th>
                    <th className="px-2.5 py-2 text-left">เลขที่บัญชี</th>
                    <th className="px-2.5 py-2 text-left">ชื่อบัญชี</th>
                    <th className="px-2.5 py-2 text-center">สถานะ</th>
                    <th className="px-2.5 py-2 text-center">แก้ไข</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {db.banks.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-5 text-center text-slate-500">
                        ยังไม่ได้เพิ่มบัญชีธนาคาร
                      </td>
                    </tr>
                  ) : (
                    db.banks.map((b) => (
                      <tr key={b.id}>
                        <td className="px-2.5 py-2 font-medium text-slate-900">{b.bank}</td>
                        <td className="px-2.5 py-2 tabular-nums">{b.accountNo}</td>
                        <td className="px-2.5 py-2">{b.accountName}</td>
                        <td className="px-2.5 py-2 text-center">
                          <span className={b.active ? 'text-emerald-700' : 'text-slate-400'}>
                            {b.active ? 'ใช้งาน' : 'ปิด'}
                          </span>
                        </td>
                        <td className="px-2.5 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => setBankForm(b)}
                            className="rounded border border-slate-300 px-2 py-1 text-[11px] hover:bg-slate-50"
                          >
                            แก้ไข
                          </button>
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

      {/* 5. Google Sheets & Drive Integration */}
      {tab === 'cloud' && (
        <div className="space-y-4">
          {!isGoogleConnected && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div className="text-xs text-amber-900">
                ยังไม่ได้เชื่อมต่อบัญชี Google Workspace กรุณาเข้าสู่ระบบ Google เพื่อใช้งานการซิงก์ Google Sheets และจัดเก็บ PDF/Word ใน Google Drive
              </div>
              <button
                type="button"
                onClick={connectGoogleWorkspace}
                className="rounded-lg bg-[#14306b] px-4 py-2 text-xs font-medium text-white hover:bg-[#1d428e] whitespace-nowrap shrink-0"
              >
                เชื่อมต่อ Google Workspace
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Google Sheets */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-[#14306b]" />
                  <h3 className="text-sm font-bold text-slate-900">ฐานข้อมูล Google Sheets (แท็บระบบ &amp; แท็บภาษาไทยอัตโนมัติ)</h3>
                </div>
                {lastSyncedAt && (
                  <span className="text-[11px] text-emerald-700">ซิงก์ล่าสุด: {lastSyncedAt}</span>
                )}
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">Google Spreadsheet ID ปัจจุบัน</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={sheetInput}
                    onChange={(e) => setSheetInput(e.target.value)}
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-mono-num"
                  />
                  <button
                    type="button"
                    disabled={busy || isSyncing}
                    onClick={handleConnectSheet}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
                  >
                    เชื่อมต่อ ID นี้
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  disabled={busy || isSyncing || !isGoogleConnected}
                  onClick={handleCreateNewSheet}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#14306b] px-3 py-2 text-xs font-medium text-white hover:bg-[#1d428e] disabled:opacity-50"
                >
                  <Database className="h-3.5 w-3.5" />
                  สร้าง Google Sheet ใหม่พร้อมแท็บภาษาไทยอัตโนมัติ
                </button>
                <button
                  type="button"
                  disabled={busy || isSyncing || !isGoogleConnected}
                  onClick={handlePull}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-800 hover:bg-blue-100 disabled:opacity-50"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  ดึงข้อมูลจาก Google Sheets
                </button>
                <button
                  type="button"
                  disabled={busy || isSyncing || !isGoogleConnected}
                  onClick={handlePush}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                >
                  <UploadCloud className="h-3.5 w-3.5" />
                  ซิงก์ข้อมูลขึ้น Google Sheets
                </button>
              </div>
            </div>

            {/* Google Drive */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
              <div className="flex items-center gap-2">
                <FolderPlus className="h-4 w-4 text-[#14306b]" />
                <h3 className="text-sm font-bold text-slate-900">โฟลเดอร์ Google Drive (เก็บ PDF รายงาน &amp; ผลโครงการ)</h3>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Google Drive Folder ID (วาง ID หรือลิงก์โฟลเดอร์ได้)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={driveInput}
                    onChange={(e) => setDriveInput(e.target.value)}
                    placeholder="วาง Folder ID หรือ URL Google Drive"
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleSaveDriveFolder}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
                  >
                    บันทึก ID โฟลเดอร์
                  </button>
                </div>
              </div>

              <div className="border-t border-slate-200 pt-3">
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  หรือสร้างโฟลเดอร์ใหม่ใน Google Drive ของคุณอัตโนมัติ
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newDriveFolderName}
                    onChange={(e) => setNewDriveFolderName(e.target.value)}
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
                  />
                  <button
                    type="button"
                    disabled={busy || !isGoogleConnected}
                    onClick={handleCreateDriveFolder}
                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50 whitespace-nowrap shrink-0"
                  >
                    <FolderPlus className="h-3.5 w-3.5" />
                    สร้างโฟลเดอร์ Drive
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 6. Standalone 2-File Google Apps Script Download System */}
      {tab === 'gas' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  ดาวน์โหลดชุดติดตั้ง Google Apps Script (โครงสร้าง 2 ไฟล์เท่านั้น)
                </h3>
                <p className="mt-1 text-xs text-slate-600">
                  ส่งออกโค้ดพร้อมใช้งานบน Google Apps Script ผูกกับ Google Sheet ID:{' '}
                  <span className="font-mono-num font-semibold text-[#14306b]">{spreadsheetId || 'Active Spreadsheet'}</span>{' '}
                  โดยรวม HTML, CSS และ JavaScript ไว้ในไฟล์เดียว ไม่มีการสร้างไฟล์ CSS, JS, JSON หรือ HTML แยกเพิ่มเติม
                </p>
              </div>
              <button
                type="button"
                onClick={handleDownloadGasBundle}
                className="inline-flex items-center gap-2 rounded-lg bg-[#14306b] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#1d428e] whitespace-nowrap shrink-0"
              >
                <Download className="h-4 w-4" />
                ดาวน์โหลดทั้ง 2 ไฟล์พร้อมกัน
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileCode2 className="h-5 w-5 text-[#14306b]" />
                    <div>
                      <div className="text-sm font-bold text-slate-900">1. index.html</div>
                      <div className="text-[11px] text-slate-500">Frontend รวม HTML, CSS และ JavaScript ไว้ในไฟล์เดียว</div>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-slate-600">
                  มีระบบแดชบอร์ด, ลงบัญชีรับ-จ่าย (แยก บค/บจ ลงช่องจ่ายอัตโนมัติ), พิมพ์ A4 แนวนอน (สมุดเงินสด) และ A4 แนวตั้ง, ส่งออก Word (.doc) และประเมิน ผอ. (PA)
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleDownloadIndexHtml}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-emerald-700"
                  >
                    <Download className="h-3.5 w-3.5" />
                    ดาวน์โหลด index.html
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCopyGasFile('index.html')}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    คัดลอกโค้ด
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Code2 className="h-5 w-5 text-[#14306b]" />
                    <div>
                      <div className="text-sm font-bold text-slate-900">2. code.gs</div>
                      <div className="text-[11px] text-slate-500">Backend Google Apps Script (เชื่อม Sheets &amp; Drive)</div>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-slate-600">
                  สร้างแท็บ FIN_* และแท็บรายงานภาษาไทย 21 แท็บอัตโนมัติ มีระบบ normalize แยกรับ-จ่าย (บค/บจ) และรองรับบันทึก PDF ลง Google Drive
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleDownloadCodeGs}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-emerald-700"
                  >
                    <Download className="h-3.5 w-3.5" />
                    ดาวน์โหลด code.gs
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCopyGasFile('code.gs')}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    คัดลอกโค้ด
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-blue-200 bg-blue-50/70 p-4 text-xs text-slate-700 space-y-1.5">
              <div className="font-bold text-[#14306b]">ขั้นตอนการนำไปใช้งานบน Google Apps Script (เพียง 2 ไฟล์เท่านั้น):</div>
              <ol className="list-decimal pl-5 space-y-1">
                <li>เปิด Google Sheets ของโรงเรียน แล้วเลือกเมนู <strong>ส่วนขยาย (Extensions) &rarr; Apps Script</strong> (หรือสร้างที่ script.google.com)</li>
                <li>ในไฟล์ <strong>Code.gs</strong> เดิม ให้วางเนื้อหาจากไฟล์ <strong>code.gs</strong> ที่ดาวน์โหลดไป (ระบบใส่ Sheet ID ปัจจุบันให้แล้ว)</li>
                <li>กดปุ่ม <strong>+</strong> ข้างเมนู ไฟล์ &rarr; เลือก <strong>HTML</strong> แล้วตั้งชื่อว่า <code className="rounded bg-white px-1.5 py-0.5 font-mono-num">index</code> (จะได้ไฟล์ index.html) จากนั้นวางโค้ดจาก <strong>index.html</strong></li>
                <li>กด <strong>บันทึก</strong> &rarr; กด <strong>ทำให้ใช้งานได้ (Deploy) &rarr; การทำให้ใช้งานได้ใหม่ &rarr; เว็บแอป (Web app)</strong> เลือกสิทธิ์การเข้าถึงแล้วใช้งานได้ทันที (ห้ามสร้างไฟล์ CSS, JS, JSON หรือ HTML อื่นเพิ่มเติม)</li>
              </ol>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
