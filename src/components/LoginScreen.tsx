import React, { useState } from 'react';
import { 
  Wrench, AlertTriangle, UserCircle, Hammer, ShieldCheck, ArrowLeft, Eye, EyeOff 
} from 'lucide-react';
import { RoleType, UserProfile } from '../types';

interface LoginScreenProps {
  onLogin: (profile: UserProfile) => void;
  pendingCount: number;
}

export default function LoginScreen({ onLogin, pendingCount }: LoginScreenProps) {
  const [selectedRole, setSelectedRole] = useState<RoleType | null>(null); 
  const [formData, setFormData] = useState({ name: '', password: '' });
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleRoleSelect = (role: RoleType) => {
    setSelectedRole(role);
    setFormData({ name: '', password: '' });
    setError('');
    setShowPassword(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (selectedRole === 'requester') {
      if (!formData.name.trim()) {
        setError('กรุณาระบุชื่อผู้แจ้ง (Please enter requester name)');
        return;
      }
      onLogin({ role: 'requester', name: formData.name.trim() });
    } else if (selectedRole === 'mt') {
      if (!formData.name.trim()) {
        setError('กรุณาระบุชื่อช่าง (Please enter technician name)');
        return;
      }
      if (formData.password === '1234') {
        onLogin({ role: 'mt', name: formData.name.trim() });
      } else {
        setError('รหัสผ่านไม่ถูกต้อง (Incorrect password)');
      }
    } else if (selectedRole === 'admin') {
      if (formData.password === 'admin') {
        onLogin({ role: 'admin', name: 'ผู้ดูแลระบบ (Admin)' });
      } else {
        setError('รหัสผ่านไม่ถูกต้อง (Incorrect password)');
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 relative font-sans">
      {pendingCount > 0 && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 w-[90%] max-w-md pointer-events-none">
          <div className="bg-red-50 text-red-600 p-3.5 rounded-lg border border-red-200/80 flex items-center justify-between shadow-lg backdrop-blur-md">
            <div className="flex items-center">
              <AlertTriangle className="w-5 h-5 mr-3 text-red-500 animate-pulse shrink-0" />
              <div>
                <h3 className="font-bold text-xs uppercase tracking-tight">แจ้งเตือนทีมช่าง (Alert MT)</h3>
                <p className="text-[10px] opacity-90 mt-0.5">
                  มีงานรอการแจ้งซ่อมจำนวน <span className="font-black text-red-700 underline text-xs">{pendingCount}</span> งาน
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="w-full max-w-4xl bg-white flex flex-col md:flex-row h-auto md:h-[550px] border border-slate-200/80 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
        {/* Left Column: Industrial style */}
        <div className="bg-gradient-to-b from-[#0f212a] to-[#081319] md:w-5/12 p-8 flex flex-col justify-between text-white relative">
          <div className="flex flex-col h-full justify-between">
            <div>
              <div className="w-8 h-8 bg-gradient-to-br from-amber-400 to-amber-600 rounded-lg flex items-center justify-center font-black text-slate-950 text-sm mb-6 uppercase shadow-md shadow-amber-500/20">
                M
              </div>
              <h1 className="text-xl font-black tracking-tight uppercase bg-gradient-to-r from-white via-slate-100 to-slate-300 bg-clip-text text-transparent">MaintainPro</h1>
              <p className="text-slate-400 text-[10px] font-mono mt-1 uppercase tracking-wider">v4.2.1-Enterprise</p>
              
              <div className="mt-8 space-y-3">
                <div className="p-3 bg-slate-900/60 border border-slate-800/80 rounded-lg">
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Status</p>
                  <p className="text-xs font-bold text-emerald-400 flex items-center mt-0.5">
                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full mr-1.5 animate-pulse"></span>
                    API Connected
                  </p>
                </div>
                <div className="p-3 bg-slate-900/60 border border-slate-800/80 rounded-lg">
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Station</p>
                  <p className="text-xs font-mono text-slate-300 mt-0.5">STATION_ID: NORD-04-A</p>
                </div>
              </div>
            </div>
            
            <div className="text-[9px] text-slate-500 font-mono tracking-widest mt-6 uppercase">
              ONLINE MAINTENANCE SYSTEM
            </div>
          </div>
        </div>

        {/* Right Column: High Density Login Form */}
        <div className="md:w-7/12 p-8 md:p-10 flex flex-col justify-center bg-slate-50/50">
          {!selectedRole ? (
            <div className="space-y-6">
              <div>
                <h2 className="text-xs font-black uppercase text-slate-400 tracking-wider">ประเภทผู้ใช้งาน (Select Role)</h2>
                <h3 className="text-lg font-black text-slate-800 mt-1">ยินดีต้อนรับสู่ระบบ MaintainPro</h3>
                <p className="text-[11px] text-slate-400 mt-1">กรุณาเลือกสถานะการเข้าใช้งานเพื่อดำเนินการต่อในระบบบำรุงรักษา</p>
              </div>
              
              <div className="grid gap-3.5">
                <button 
                  id="btn-login-role-requester"
                  onClick={() => handleRoleSelect('requester')} 
                  className="group flex items-center p-3.5 bg-white hover:bg-[#FAFDFC] border border-slate-200/80 hover:border-amber-500/50 rounded-xl shadow-[0_2px_8px_-3px_rgba(0,0,0,0.04)] hover:shadow-md transition-all duration-300 text-left cursor-pointer"
                >
                  <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center mr-3 group-hover:bg-[#112d3c] group-hover:text-amber-400 transition-all duration-300 shrink-0">
                    <UserCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 text-xs uppercase tracking-tight group-hover:text-[#112d3c] transition-colors">ผู้แจ้งซ่อม (Requester)</h3>
                    <p className="text-[10px] text-slate-400 mt-0.5">แจ้งอาการชำรุดเครื่องจักร และกดยืนยันปิดงานซ่อม</p>
                  </div>
                </button>

                <button 
                  id="btn-login-role-mt"
                  onClick={() => handleRoleSelect('mt')} 
                  className="group flex items-center p-3.5 bg-white hover:bg-[#FAFDFC] border border-slate-200/80 hover:border-amber-500/50 rounded-xl shadow-[0_2px_8px_-3px_rgba(0,0,0,0.04)] hover:shadow-md transition-all duration-300 text-left cursor-pointer"
                >
                  <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center mr-3 group-hover:bg-[#112d3c] group-hover:text-amber-400 transition-all duration-300 shrink-0">
                    <Hammer className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 text-xs uppercase tracking-tight group-hover:text-[#112d3c] transition-colors">ช่างเทคนิค (Technician)</h3>
                    <p className="text-[10px] text-slate-400 mt-0.5">รับเรื่อง ดำเนินการแก้ปัญหาหน้างาน และบันทึกผลงานซ่อมบำรุง</p>
                  </div>
                </button>

                <button 
                  id="btn-login-role-admin"
                  onClick={() => handleRoleSelect('admin')} 
                  className="group flex items-center p-3.5 bg-white hover:bg-[#FAFDFC] border border-slate-200/80 hover:border-amber-500/50 rounded-xl shadow-[0_2px_8px_-3px_rgba(0,0,0,0.04)] hover:shadow-md transition-all duration-300 text-left cursor-pointer"
                >
                  <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center mr-3 group-hover:bg-[#112d3c] group-hover:text-amber-400 transition-all duration-300 shrink-0">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 text-xs uppercase tracking-tight group-hover:text-[#112d3c] transition-colors">ผู้ดูแลระบบ (Admin)</h3>
                    <p className="text-[10px] text-slate-400 mt-0.5">ดูสรุปประสิทธิภาพ แดชบอร์ด ส่งออกรายงาน และค้นหาประวัติ</p>
                  </div>
                </button>
              </div>
            </div>
          ) : (
            <div className="w-full">
              <button 
                id="btn-login-back"
                onClick={() => setSelectedRole(null)} 
                className="text-[10px] font-bold text-slate-400 hover:text-slate-800 mb-4 flex items-center uppercase transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5 mr-1" /> ย้อนกลับ (Back)
              </button>
              
              <div className="mb-5">
                <span className="text-[9px] font-black uppercase text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/50">
                  {selectedRole === 'requester' ? 'Requester Auth' : 
                   selectedRole === 'mt' ? 'Technician Auth' : 'Administrator Auth'}
                </span>
                <h2 className="text-sm font-black uppercase text-slate-800 mt-2 tracking-wider">
                  {selectedRole === 'requester' ? 'ลงชื่อเข้าใช้: ผู้แจ้งซ่อม' : 
                   selectedRole === 'mt' ? 'ลงชื่อเข้าใช้: ช่างเทคนิค' : 'ลงชื่อเข้าใช้: ผู้ดูแลระบบ'}
                </h2>
                <p className="text-[10px] text-slate-400 mt-1">กรุณากรอกข้อมูลเพื่อลงชื่อเข้าใช้งานระบบ</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {selectedRole === 'requester' && (
                  <div>
                    <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">ชื่อ-นามสกุล (Your Name)</label>
                    <input 
                      id="input-login-name"
                      type="text" 
                      required
                      value={formData.name} 
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })} 
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-200 focus:border-[#112d3c] focus:ring-1 focus:ring-[#112d3c]/10 rounded-lg text-slate-800 text-xs outline-none transition-all shadow-sm" 
                      placeholder="เช่น สมชาย ใจดี" 
                      autoFocus 
                    />
                  </div>
                )}

                {selectedRole === 'mt' && (
                  <div className="space-y-3.5">
                    <div>
                      <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">ชื่อช่างเทคนิค (Technician Name)</label>
                      <input 
                        id="input-login-mt-name"
                        type="text" 
                        required
                        value={formData.name} 
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })} 
                        className="w-full px-3.5 py-2.5 bg-white border border-slate-200 focus:border-[#112d3c] focus:ring-1 focus:ring-[#112d3c]/10 rounded-lg text-slate-800 text-xs outline-none transition-all shadow-sm" 
                        placeholder="ระบุชื่อช่างของคุณ" 
                        autoFocus 
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">รหัสผ่านสำหรับช่าง (Technician Password)</label>
                      <div className="relative">
                        <input 
                          id="input-login-mt-password"
                          type={showPassword ? "text" : "password"} 
                          required
                          value={formData.password} 
                          onChange={(e) => setFormData({ ...formData, password: e.target.value })} 
                          className="w-full pl-3.5 pr-10 py-2.5 bg-white border border-slate-200 focus:border-[#112d3c] focus:ring-1 focus:ring-[#112d3c]/10 rounded-lg text-slate-800 text-xs outline-none transition-all font-mono shadow-sm" 
                          placeholder="••••••••" 
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none cursor-pointer"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {selectedRole === 'admin' && (
                  <div>
                    <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">รหัสผ่านผู้ดูแลระบบ (Admin Password)</label>
                    <div className="relative">
                      <input 
                        id="input-login-admin-password"
                        type={showPassword ? "text" : "password"} 
                        required
                        value={formData.password} 
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })} 
                        className="w-full pl-3.5 pr-10 py-2.5 bg-white border border-slate-200 focus:border-[#112d3c] focus:ring-1 focus:ring-[#112d3c]/10 rounded-lg text-slate-800 text-xs outline-none transition-all font-mono shadow-sm" 
                        placeholder="••••••••" 
                        autoFocus 
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none cursor-pointer"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                )}

                {error && (
                  <p className="text-red-600 text-[10px] font-bold bg-red-50 border border-red-200 p-2.5 text-center rounded-lg">
                    {error}
                  </p>
                )}

                <button 
                  id="btn-login-submit"
                  type="submit" 
                  className="w-full py-2.5 bg-gradient-to-r from-[#0f212a] to-[#16303d] hover:from-[#152e3b] hover:to-[#1e4456] text-white font-bold text-[10px] rounded-lg uppercase tracking-wider transition-all shadow-md shadow-slate-900/10 cursor-pointer"
                >
                  เข้าสู่ระบบ (Sign In)
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
