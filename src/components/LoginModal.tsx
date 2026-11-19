import React, { useState } from 'react';
import { X, Lock, User as UserIcon } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { alertError, toastSuccess } from '../utils/formatters';

interface LoginModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ open, onClose, onSuccess }) => {
  const { loginAppUser, connectGoogleWorkspace, isGoogleConnected, pullFromGoogleSheets } = useApp();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const user = loginAppUser(username, password);
      setPassword('');
      toastSuccess(`เข้าสู่ระบบสำเร็จ`, `${user.name} (${user.role === 'admin' ? 'ผู้ดูแลระบบ' : 'ผู้ใช้งาน'})`);
      onClose();
      onSuccess?.();
    } catch (err: any) {
      alertError(err.message || 'เข้าสู่ระบบไม่สำเร็จ');
    }
  };

  const handleGoogleSignIn = async () => {
    setBusy(true);
    try {
      await connectGoogleWorkspace();
      toastSuccess('เชื่อมต่อบัญชี Google สำเร็จ', 'สามารถอ่านและบันทึกข้อมูลลง Google Sheets ได้แล้ว');
      try {
        await pullFromGoogleSheets();
      } catch {
        // User may configure a new sheet ID afterward
      }
    } catch (err: any) {
      alertError(err.message || 'ไม่สามารถเชื่อมต่อบัญชี Google ได้');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[1px]">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div>
            <h3 className="text-lg font-bold text-slate-900">เข้าสู่ระบบเจ้าหน้าที่</h3>
            <p className="text-xs text-slate-500">ตรวจสอบสิทธิ์การเข้าถึงเมนูและอนุมัติรายการ</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="ปิดหน้าต่าง"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">ชื่อผู้ใช้</label>
            <div className="relative">
              <UserIcon className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                placeholder="admin"
                className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm text-slate-900 focus:border-[#14306b] focus:outline-none focus:ring-1 focus:ring-[#14306b]"
                required
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">รหัสผ่าน</label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="กรอกรหัสผ่าน (ค่าเริ่มต้น 1939)"
                className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm text-slate-900 focus:border-[#14306b] focus:outline-none focus:ring-1 focus:ring-[#14306b]"
                required
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              className="rounded-lg bg-[#14306b] px-5 py-2 text-sm font-medium text-white hover:bg-[#1d428e] whitespace-nowrap shrink-0"
            >
              เข้าสู่ระบบ
            </button>
          </div>
        </form>

        <div className="mt-5 border-t border-slate-200 pt-4">
          <p className="mb-2.5 text-xs text-slate-500">
            เชื่อมต่อ Google Workspace เพื่อซิงก์ฐานข้อมูล Google Sheets และจัดเก็บเอกสารใน Google Drive
          </p>
          {!isGoogleConnected ? (
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={busy}
              className="gsi-material-button w-full"
            >
              <div className="gsi-material-button-state" />
              <div className="gsi-material-button-content-wrapper">
                <div className="gsi-material-button-icon">
                  <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" style={{ display: 'block' }}>
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                    <path fill="none" d="M0 0h48v48H0z" />
                  </svg>
                </div>
                <span className="gsi-material-button-contents">
                  {busy ? 'กำลังเชื่อมต่อ...' : 'Sign in with Google'}
                </span>
              </div>
            </button>
          ) : (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              เชื่อมต่อบัญชี Google Sheets &amp; Drive เรียบร้อยแล้ว
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
