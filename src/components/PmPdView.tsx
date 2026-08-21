import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, doc, setDoc, onSnapshot, deleteDoc, updateDoc, query 
} from 'firebase/firestore';
import { 
  Settings, Calendar, AlertTriangle, Plus, FileText, BarChart3, Wrench, 
  X, ClipboardCheck, Download, Search, User, Trash2, Edit, ShieldCheck, 
  PlusCircle, MinusCircle, Clock, FileSpreadsheet, AlertCircle, RefreshCw
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { UserProfile } from '../types';

interface PmPdViewProps {
  appId: string;
  currentUserProfile: UserProfile | null;
  onToast: (msg: string) => void;
}

export interface Machine {
  id: string;
  name: string;
  model: string;
  installDate: string;
  status: string;
  healthScore: number;
  lastPM: string;
  nextPM: string;
  pmInterval: number;
  temp: number;
  vibration: number;
  updatedAt?: string;
}

export interface MaintenanceLog {
  id: string;
  machineId: string;
  type: string;
  date: string;
  technician: string;
  status: string;
  notes: string;
  parts: string;
  pmIntervalAtTime?: number;
}

export default function PmPdView({ appId, currentUserProfile, onToast }: PmPdViewProps) {
  // App UI State
  const [activeSubTab, setActiveSubTab] = useState<'dashboard' | 'machines' | 'history'>('dashboard');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPMModalOpen, setIsPMModalOpen] = useState(false);
  const [selectedMachine, setSelectedMachine] = useState<Machine | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [historySearchQuery, setHistorySearchQuery] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [loading, setLoading] = useState(true);

  // Data State
  const [machines, setMachines] = useState<Machine[]>([]);
  const [logs, setLogs] = useState<MaintenanceLog[]>([]);

  // Form State
  const [newMachine, setNewMachine] = useState<Partial<Machine>>({
    id: '', name: '', model: '', installDate: '', status: 'Operational', healthScore: 100,
    lastPM: new Date().toISOString().split('T')[0], nextPM: '', pmInterval: 6, temp: 35, vibration: 0.01
  });

  const [pmRecord, setPmRecord] = useState({
    action: '', spareParts: [{ name: '', quantity: 1 }], technician: ''
  });

  // Real-time Data Sync
  useEffect(() => {
    setLoading(true);
    const machinesCol = collection(db, 'artifacts', appId, 'public', 'data', 'machines');
    const logsCol = collection(db, 'artifacts', appId, 'public', 'data', 'maintenance_logs');

    const unsubMachines = onSnapshot(machinesCol, 
      (snapshot) => {
        const machineList = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as Machine[];
        setMachines(machineList);
        setLoading(false);
      }, 
      (error) => {
        console.error("Firestore machine error:", error);
        handleFirestoreError(error, OperationType.GET, `artifacts/${appId}/public/data/machines`);
        setLoading(false);
      }
    );

    const unsubLogs = onSnapshot(logsCol, 
      (snapshot) => {
        const logList = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as MaintenanceLog[];
        logList.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setLogs(logList);
      }, 
      (error) => {
        console.error("Firestore log error:", error);
        handleFirestoreError(error, OperationType.GET, `artifacts/${appId}/public/data/maintenance_logs`);
      }
    );

    return () => {
      unsubMachines();
      unsubLogs();
    };
  }, [appId]);

  const calculateNextPM = (startDate: string, intervalMonths: number | string) => {
    if (!startDate || !intervalMonths) return '';
    const date = new Date(startDate);
    date.setMonth(date.getMonth() + parseInt(intervalMonths as string));
    return date.toISOString().split('T')[0];
  };

  // Sync nextPM field in form when lastPM or pmInterval changes
  useEffect(() => {
    if (newMachine.lastPM && newMachine.pmInterval) {
      const nextDate = calculateNextPM(newMachine.lastPM, newMachine.pmInterval);
      setNewMachine(prev => ({ ...prev, nextPM: nextDate }));
    }
  }, [newMachine.lastPM, newMachine.pmInterval]);

  // CRUD Handlers
  const handleSaveMachine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMachine.id || !newMachine.name || !newMachine.lastPM || !newMachine.pmInterval) return;

    try {
      const machineDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'machines', newMachine.id);
      const updatedNextPM = calculateNextPM(newMachine.lastPM, newMachine.pmInterval);
      
      const payload = { 
        ...newMachine, 
        nextPM: updatedNextPM,
        healthScore: Number(newMachine.healthScore || 100),
        temp: Number(newMachine.temp || 35),
        vibration: Number(newMachine.vibration || 0.01),
        pmInterval: Number(newMachine.pmInterval),
        updatedAt: new Date().toISOString()
      };

      await setDoc(machineDocRef, payload);
      onToast(isEditMode ? 'แก้ไขข้อมูลเครื่องจักรสำเร็จ' : 'เพิ่มข้อมูลเครื่องจักรเข้าคลาวด์สำเร็จ');
      setIsModalOpen(false);
      resetMachineForm();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `artifacts/${appId}/public/data/machines/${newMachine.id}`);
    }
  };

  const handleDeleteMachine = async (id: string) => {
    if (currentUserProfile?.role !== 'admin') {
      onToast('เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถลบเครื่องจักรได้');
      return;
    }
    if (window.confirm('คุณต้องการลบเครื่องจักรนี้ใช่หรือไม่? ข้อมูลจะหายไปถาวร')) {
      try {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'machines', id));
        onToast('ลบเครื่องจักรออกจากฐานข้อมูลเรียบร้อยแล้ว');
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `artifacts/${appId}/public/data/machines/${id}`);
      }
    }
  };

  const handleRecordPM = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMachine) return;
    
    const todayStr = new Date().toISOString().split('T')[0];
    const currentInterval = selectedMachine.pmInterval || 6;
    const newNextPM = calculateNextPM(todayStr, currentInterval);
    
    const partsString = pmRecord.spareParts
      .filter(p => p.name.trim() !== '')
      .map(p => `${p.name} (x${p.quantity})`)
      .join(', ') || 'ไม่ได้ใช้ spare part';

    const logId = `LOG-${Date.now()}`;
    const newLog = {
      machineId: selectedMachine.id, 
      type: 'PM', 
      date: todayStr,
      technician: pmRecord.technician || currentUserProfile?.name || 'Technician', 
      status: 'Completed', 
      notes: pmRecord.action, 
      parts: partsString,
      pmIntervalAtTime: currentInterval 
    };

    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'maintenance_logs', logId), newLog);
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'machines', selectedMachine.id), {
        status: 'Operational',
        healthScore: 100,
        lastPM: todayStr,
        nextPM: newNextPM
      });
      onToast('บันทึกผลการบำรุงรักษา PM สำเร็จ!');
      setIsPMModalOpen(false);
      setPmRecord({ action: '', spareParts: [{ name: '', quantity: 1 }], technician: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `artifacts/${appId}/public/data/maintenance_logs/${logId}`);
    }
  };

  const handleEditMachine = (machine: Machine) => {
    setNewMachine(machine);
    setIsEditMode(true);
    setIsModalOpen(true);
  };

  const resetMachineForm = () => {
    setIsEditMode(false);
    setNewMachine({
      id: '', name: '', model: '', installDate: '', status: 'Operational', healthScore: 100,
      lastPM: new Date().toISOString().split('T')[0], nextPM: '', pmInterval: 6, temp: 35, vibration: 0.01
    });
  };

  const addSparePartRow = () => {
    setPmRecord({
      ...pmRecord,
      spareParts: [...pmRecord.spareParts, { name: '', quantity: 1 }]
    });
  };

  const removeSparePartRow = (index: number) => {
    const newParts = pmRecord.spareParts.filter((_, i) => i !== index);
    setPmRecord({ ...pmRecord, spareParts: newParts });
  };

  const updateSparePart = (index: number, field: 'name' | 'quantity', value: string | number) => {
    const newParts = [...pmRecord.spareParts];
    if (field === 'name') {
      newParts[index].name = value as string;
    } else {
      newParts[index].quantity = value as number;
    }
    setPmRecord({ ...pmRecord, spareParts: newParts });
  };

  const handleExportHistory = () => {
    if (filteredLogs.length === 0) return;
    const headers = ['Date', 'Machine ID', 'Machine Name', 'Type', 'Technician', 'PM Cycle', 'Details', 'Parts'];
    const csvData = filteredLogs.map(log => {
      const machine = machines.find(m => m.id === log.machineId);
      return [
        log.date,
        log.machineId,
        `"${(machine?.name || 'Unknown').replace(/"/g, '""')}"`,
        log.type,
        `"${(log.technician || '').replace(/"/g, '""')}"`,
        log.pmIntervalAtTime ? `${log.pmIntervalAtTime} months` : 'N/A',
        `"${(log.notes || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`, 
        `"${(log.parts || '').replace(/"/g, '""')}"`
      ].join(',');
    });
    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + [headers.join(','), ...csvData].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `maintenance_history_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    onToast('ส่งออกไฟล์ประวัติการบำรุงรักษาสำเร็จ');
  };

  // Memoized lists for Dashboard
  const pmOverdue = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return machines.filter(m => {
      if (!m.nextPM) return false;
      const target = new Date(m.nextPM);
      target.setHours(0, 0, 0, 0);
      return target < today;
    });
  }, [machines]);

  const pmThisMonth = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return machines.filter(m => {
      if (!m.nextPM) return false;
      const target = new Date(m.nextPM);
      target.setHours(0, 0, 0, 0);
      const diffTime = target.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays >= 0 && diffDays <= 30; 
    });
  }, [machines]);

  const pmNextMonth = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return machines.filter(m => {
      if (!m.nextPM) return false;
      const target = new Date(m.nextPM);
      target.setHours(0, 0, 0, 0);
      const diffTime = target.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays > 30 && diffDays <= 60; 
    });
  }, [machines]);

  const filteredMachines = useMemo(() => {
    return machines.filter(m => {
      const searchLower = searchQuery.toLowerCase();
      const matchSearch = m.name.toLowerCase().includes(searchLower) || m.id.toLowerCase().includes(searchLower) || m.model.toLowerCase().includes(searchLower);
      const matchMonth = filterMonth ? (m.nextPM?.startsWith(filterMonth) || m.lastPM?.startsWith(filterMonth)) : true;
      return matchSearch && matchMonth;
    });
  }, [machines, searchQuery, filterMonth]);

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const machine = machines.find(m => m.id === log.machineId);
      const searchLower = historySearchQuery.toLowerCase();
      const matchSearch = 
        log.machineId.toLowerCase().includes(searchLower) || 
        (machine?.name || '').toLowerCase().includes(searchLower) ||
        (log.technician || '').toLowerCase().includes(searchLower) ||
        (log.notes || '').toLowerCase().includes(searchLower);
      const matchMonth = filterMonth ? log.date.startsWith(filterMonth) : true;
      return matchSearch && matchMonth;
    });
  }, [logs, machines, historySearchQuery, filterMonth]);

  return (
    <div className="space-y-6">
      {/* Tab Navigation bar inside view */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-base font-black text-slate-800 flex items-center gap-2">
            <Settings className="w-5 h-5 text-indigo-600 animate-spin-slow" />
            ระบบแผนซ่อมบำรุงทวีภาคี (PM & PD Preventive Maintenance)
          </h2>
          <p className="text-slate-500 text-xs mt-1">
            ตรวจเช็ค วางแผน และบันทึกผลการบำรุงรักษาเครื่องจักรเชิงป้องกันบนฐานข้อมูลคลาวด์
          </p>
        </div>

        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 self-start sm:self-center">
          {[
            { id: 'dashboard', label: 'สรุปภาพรวม', icon: BarChart3 },
            { id: 'machines', label: 'ฐานข้อมูลเครื่องจักร', icon: Wrench },
            { id: 'history', label: 'ประวัติบันทึก PM', icon: FileText },
          ].map((subTab) => (
            <button
              key={subTab.id}
              onClick={() => setActiveSubTab(subTab.id as 'dashboard' | 'machines' | 'history')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all text-xs font-bold uppercase cursor-pointer ${
                activeSubTab === subTab.id ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
              }`}
            >
              <subTab.icon size={13} />
              <span>{subTab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-slate-400 text-xs flex flex-col items-center justify-center gap-3">
          <RefreshCw className="w-8 h-8 animate-spin text-slate-400" />
          กำลังเชื่อมข้อมูลแผน PM/PD จาก Cloud Server...
        </div>
      ) : (
        <>
          {/* TAB 1: DASHBOARD OVERVIEW */}
          {activeSubTab === 'dashboard' && (
            <div className="space-y-6 animate-fade-in">
              {/* Top Stats Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200/80 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">สถานะคลาวด์บอร์ด</p>
                    <h4 className="text-sm font-black text-slate-800 flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                      Cloud Database Sync
                    </h4>
                    <p className="text-[10px] text-slate-500 mt-1">อัปเดตแบบเรียลไทม์กับวิศวกร</p>
                  </div>
                  <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping" />
                </div>

                <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200/80 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">เครื่องจักรในระบบ</p>
                    <h4 className="text-lg font-black text-slate-800">{machines.length} เครื่อง</h4>
                    <p className="text-[10px] text-slate-500 mt-1">ทะเบียนครุภัณฑ์ซ่อมบำรุง</p>
                  </div>
                  <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                    <Wrench className="w-5 h-5" />
                  </div>
                </div>

                <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200/80 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">งาน PM ใน 30 วันนี้</p>
                    <h4 className="text-lg font-black text-amber-600">{pmThisMonth.length} งาน</h4>
                    <p className="text-[10px] text-slate-500 mt-1">ครบกำหนดรักษาเชิงป้องกัน</p>
                  </div>
                  <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl">
                    <Calendar className="w-5 h-5" />
                  </div>
                </div>
              </div>

              {/* OVERDUE PM WORK LIST (Red Accent) */}
              <div className="bg-white rounded-2xl shadow-md border border-rose-200 overflow-hidden">
                <div className="px-5 py-3.5 border-b border-rose-100 flex justify-between items-center bg-rose-50/40">
                  <h3 className="font-extrabold text-xs text-rose-800 flex items-center gap-2 uppercase tracking-wider">
                    <AlertCircle size={16} className="text-rose-600 animate-pulse" />
                    เครื่องจักรเกินกำหนดแผนบำรุงรักษา (Overdue PM)
                  </h3>
                  <span className="bg-rose-600 text-white text-[9px] px-2.5 py-0.5 rounded-full font-black uppercase tracking-widest">
                    {pmOverdue.length} เครื่องจักร
                  </span>
                </div>
                <div className="divide-y divide-rose-50 max-h-[300px] overflow-y-auto">
                  {pmOverdue.length === 0 ? (
                    <div className="p-8 text-center text-slate-400 text-xs italic">
                      👍 ยอดเยี่ยม! ไม่มีเครื่องจักรที่เกินกำหนดรอบแผนบำรุงรักษา
                    </div>
                  ) : (
                    pmOverdue.map(m => (
                      <div key={m.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-rose-50/10 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center font-mono font-black text-rose-600 text-xs">
                            {m.id}
                          </div>
                          <div>
                            <p className="font-bold text-slate-800 text-xs">{m.name}</p>
                            <p className="text-[10px] text-rose-500 font-bold uppercase tracking-tight mt-0.5">
                              เกินกำหนดตั้งแต่วันที่: {new Date(m.nextPM).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })} (รอบ {m.pmInterval} ด.)
                            </p>
                          </div>
                        </div>
                        <button 
                          onClick={() => { setSelectedMachine(m); setIsPMModalOpen(true); }} 
                          className="bg-rose-600 text-white px-3.5 py-1.5 rounded-lg font-black text-2xs hover:bg-rose-700 transition-colors shadow-sm self-start sm:self-center uppercase tracking-wider cursor-pointer"
                        >
                          บันทึก PM ทันที
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* THIS MONTH PM WORK LIST (Blue Accent) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-slate-100 flex justify-between items-center bg-indigo-50/20">
                    <h3 className="font-extrabold text-xs text-slate-800 flex items-center gap-2 uppercase tracking-wider">
                      <Calendar size={15} className="text-indigo-600" />
                      แผนงาน PM รายเดือน (ภายใน 30 วันนี้)
                    </h3>
                    <span className="bg-indigo-100 text-indigo-800 text-[9px] px-2 py-0.5 rounded-full font-bold">
                      {pmThisMonth.length}
                    </span>
                  </div>
                  <div className="divide-y divide-slate-50 max-h-[300px] overflow-y-auto">
                    {pmThisMonth.length === 0 ? (
                      <div className="p-8 text-center text-slate-400 text-xs italic">
                        ไม่มีเครื่องจักรที่ต้องทำ PM ภายในเดือนนี้
                      </div>
                    ) : (
                      pmThisMonth.map(m => (
                        <div key={m.id} className="p-4 flex items-center justify-between gap-2 hover:bg-slate-50 transition-colors">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center font-mono font-bold text-2xs border border-indigo-100">
                              {m.id.substring(0, 5)}
                            </div>
                            <div>
                              <p className="font-bold text-slate-700 text-xs">{m.name}</p>
                              <p className="text-[9px] text-slate-400 font-semibold uppercase mt-0.5">
                                ครบกำหนด: {m.nextPM} (รอบ {m.pmInterval} ด.)
                              </p>
                            </div>
                          </div>
                          <button 
                            onClick={() => { setSelectedMachine(m); setIsPMModalOpen(true); }} 
                            className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg font-bold text-2xs transition-colors cursor-pointer"
                          >
                            บันทึก PM
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* NEXT MONTH PM WORK LIST (Grey/Clock Accent) */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h3 className="font-extrabold text-xs text-slate-700 flex items-center gap-2 uppercase tracking-wider">
                      <Clock size={15} className="text-slate-500" />
                      แผนงาน PM ล่วงหน้า (31-60 วันถัดไป)
                    </h3>
                    <span className="bg-slate-200 text-slate-700 text-[9px] px-2 py-0.5 rounded-full font-bold">
                      {pmNextMonth.length}
                    </span>
                  </div>
                  <div className="divide-y divide-slate-50 max-h-[300px] overflow-y-auto">
                    {pmNextMonth.length === 0 ? (
                      <div className="p-8 text-center text-slate-400 text-xs italic">
                        ไม่มีแผนงาน PM ในช่วงเดือนถัดไป
                      </div>
                    ) : (
                      pmNextMonth.map(m => (
                        <div key={m.id} className="p-4 flex items-center justify-between gap-2 hover:bg-slate-50 transition-colors opacity-90">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center font-mono font-semibold text-2xs border border-slate-200">
                              {m.id.substring(0, 5)}
                            </div>
                            <div>
                              <p className="font-bold text-slate-600 text-xs">{m.name}</p>
                              <p className="text-[9px] text-slate-400 font-semibold mt-0.5">
                                ครบกำหนด: {m.nextPM}
                              </p>
                            </div>
                          </div>
                          <span className="px-2 py-1 rounded bg-slate-50 border border-slate-100 text-slate-400 text-2xs font-bold uppercase tracking-wider">
                            ล่วงหน้า
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: MACHINE REGISTRY / CRUD TABLE */}
          {activeSubTab === 'machines' && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden animate-fade-in">
              {/* Table Action Bar */}
              <div className="p-5 border-b border-slate-100 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-slate-50/40">
                <div>
                  <h3 className="text-sm font-black text-slate-800">ฐานข้อมูลทะเบียนประวัติเครื่องจักร</h3>
                  <p className="text-slate-500 text-[10px] mt-0.5">เพิ่ม แก้ไข ทะเบียนครุภัณฑ์และวงรอบแผนการซ่อมบำรุง</p>
                </div>

                <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                  <div className="relative flex-1 lg:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                    <input 
                      type="text" 
                      placeholder="ค้นหาชื่อ, รหัส ID หรือรุ่นเครื่องจักร..." 
                      value={searchQuery} 
                      onChange={(e) => setSearchQuery(e.target.value)} 
                      className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-xs" 
                    />
                  </div>

                  {currentUserProfile?.role === 'admin' && (
                    <button 
                      onClick={() => { resetMachineForm(); setIsModalOpen(true); }} 
                      className="flex items-center gap-1.5 bg-[#112d3c] hover:bg-[#1b4359] text-white px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md cursor-pointer"
                    >
                      <Plus size={15} /> 
                      เพิ่มเครื่องจักรใหม่
                    </button>
                  )}
                </div>
              </div>

              {/* Responsive Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/70 border-b border-slate-100 text-slate-500 text-[9px] uppercase tracking-widest font-black">
                      <th className="px-6 py-4">ข้อมูลหลักครุภัณฑ์ (Machine ID)</th>
                      <th className="px-6 py-4">รุ่น/ซีรีส์ (Model Specification)</th>
                      <th className="px-6 py-4 text-center">วงรอบกำหนด PM</th>
                      <th className="px-6 py-4 text-center">วันที่ทำ PM ล่าสุด</th>
                      <th className="px-6 py-4 text-center">แผนกำหนด PM ถัดไป</th>
                      <th className="px-6 py-4 text-right">สิทธิ์สั่งดำเนินงาน</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredMachines.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-16 text-slate-400 italic">
                          ❌ ไม่พบข้อมูลเครื่องจักรที่ค้นหาในระบบ
                        </td>
                      </tr>
                    ) : (
                      filteredMachines.map((machine) => (
                        <tr key={machine.id} className="hover:bg-slate-50/40 transition-colors">
                          <td className="px-6 py-4 font-semibold">
                            <div className="font-bold text-slate-800 text-xs">{machine.name}</div>
                            <div className="text-[10px] text-slate-400 font-mono mt-0.5">{machine.id}</div>
                          </td>
                          <td className="px-6 py-4 text-slate-500 font-mono">
                            {machine.model || '-'}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className="font-bold text-slate-700 bg-slate-100 border border-slate-200 px-2.5 py-0.5 rounded text-[10px] font-mono">
                              {machine.pmInterval} เดือน
                            </span>
                          </td>
                          <td className="px-6 py-4 text-center font-mono font-medium text-slate-600">
                            {machine.lastPM ? new Date(machine.lastPM).toLocaleDateString('th-TH') : '-'}
                          </td>
                          <td className="px-6 py-4 text-center font-mono font-bold">
                            <span className={`text-xs ${
                              new Date(machine.nextPM).getTime() < new Date().setHours(0,0,0,0)
                                ? 'text-rose-600 bg-rose-50 border border-rose-100 px-2 py-0.5 rounded'
                                : 'text-slate-700'
                            }`}>
                              {machine.nextPM ? new Date(machine.nextPM).toLocaleDateString('th-TH') : '-'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button 
                                onClick={() => { setSelectedMachine(machine); setIsPMModalOpen(true); }} 
                                className="text-indigo-600 p-1.5 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-indigo-100" 
                                title="บันทึกผล PM"
                              >
                                <ClipboardCheck size={16} />
                              </button>
                              
                              {currentUserProfile?.role === 'admin' && (
                                <>
                                  <button 
                                    onClick={() => handleEditMachine(machine)} 
                                    className="text-slate-400 p-1.5 hover:bg-slate-100 hover:text-slate-700 rounded-lg transition-colors cursor-pointer" 
                                    title="แก้ไขข้อมูลหลัก"
                                  >
                                    <Edit size={16} />
                                  </button>
                                  <button 
                                    onClick={() => handleDeleteMachine(machine.id)} 
                                    className="text-rose-400 p-1.5 hover:bg-rose-50 hover:text-rose-600 rounded-lg transition-colors cursor-pointer" 
                                    title="ลบข้อมูล"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </>
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
          )}

          {/* TAB 3: PM HISTORY LEDGER */}
          {activeSubTab === 'history' && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden animate-fade-in">
              <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-50/40">
                <div>
                  <h3 className="text-sm font-black text-slate-800">บันทึกสมุดประวัติงานบำรุงรักษาเชิงป้องกัน (PM History)</h3>
                  <p className="text-slate-500 text-[10px] mt-0.5">รวมรายการปฏิบัติงานซ่อมบำรุง การเปลี่ยน Spare Parts และผู้ปฏิบัติการ</p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
                  <div className="relative flex-1 md:w-56">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5" />
                    <input 
                      type="text" 
                      placeholder="ค้นหาเครื่องจักร, ช่างเทคนิค หรือคำอธิบาย..." 
                      value={historySearchQuery} 
                      onChange={(e) => setHistorySearchQuery(e.target.value)} 
                      className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-xs" 
                    />
                  </div>

                  <div className="flex items-center gap-1.5">
                    <input 
                      type="month" 
                      value={filterMonth} 
                      onChange={(e) => setFilterMonth(e.target.value)} 
                      className="px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs font-bold bg-white outline-none" 
                    />
                    {filterMonth && (
                      <button 
                        onClick={() => setFilterMonth('')} 
                        className="text-rose-500 hover:bg-rose-50 p-1.5 rounded-lg transition-colors cursor-pointer"
                      >
                        <X size={15} />
                      </button>
                    )}
                  </div>

                  <button 
                    onClick={handleExportHistory}
                    disabled={filteredLogs.length === 0}
                    className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <FileSpreadsheet size={15} /> 
                    <span>Export Excel</span>
                  </button>
                </div>
              </div>

              <div className="p-5 space-y-4 max-h-[500px] overflow-y-auto">
                {filteredLogs.length === 0 ? (
                  <div className="text-center py-16 text-slate-400 text-xs italic">
                    ไม่พบรายการประวัติบันทึกการบำรุงรักษาเชิงป้องกันในสมุดบันทึก
                  </div>
                ) : (
                  filteredLogs.map(log => {
                    const machine = machines.find(m => m.id === log.machineId);
                    return (
                      <div key={log.id} className="flex gap-4 border-b border-slate-100 pb-4 last:border-0 hover:bg-slate-50/30 p-3 rounded-xl transition-colors">
                        <div className="mt-1 p-2 h-fit rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100 shrink-0">
                          <Calendar size={18} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-start gap-2">
                            <div>
                              <h4 className="font-extrabold text-slate-800 text-xs">
                                {machine ? `${machine.name} (${log.machineId})` : `รหัสเครื่องจักร: ${log.machineId}`}
                              </h4>
                              <p className="text-[9px] font-black text-indigo-600 uppercase tracking-widest mt-0.5">
                                บำรุงรักษาเชิงป้องกัน (Preventive Maintenance)
                              </p>
                            </div>
                            <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full shrink-0">
                              {new Date(log.date).toLocaleDateString('th-TH')}
                            </span>
                          </div>

                          <div className="text-xs text-slate-600 mt-2 italic bg-slate-50 border border-slate-100 p-2.5 rounded-lg whitespace-pre-wrap leading-relaxed">
                            "{log.notes}"
                          </div>

                          <div className="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10px] text-slate-400 font-bold uppercase tracking-wider border-t border-slate-50 pt-2.5">
                            <span className="flex items-center gap-1">
                              <User size={13} className="text-slate-300" />
                              ช่างผู้บำรุงรักษา: <strong className="text-slate-700">{log.technician}</strong>
                            </span>
                            <span className="w-1 h-1 rounded-full bg-slate-200" />
                            <span className="flex items-center gap-1">
                              <Clock size={13} className="text-slate-300" />
                              วงรอบ ณ วันซ่อม: <strong className="text-slate-700">{log.pmIntervalAtTime || 'N/A'} เดือน</strong>
                            </span>
                            <span className="w-1 h-1 rounded-full bg-slate-200" />
                            <span className="flex items-center gap-1 max-w-[280px] truncate">
                              <PlusCircle size={13} className="text-slate-300 shrink-0" />
                              อะไหล่สำรองที่เปลี่ยน: <strong className="text-slate-700 truncate">{log.parts}</strong>
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* MODAL: ADD/EDIT MACHINE SPEC (Admin Only) */}
      {isModalOpen && currentUserProfile?.role === 'admin' && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-zoom-in">
            <div className="px-6 py-4.5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">
                {isEditMode ? '🛠️ แก้ไขข้อมูลทะเบียนเครื่องจักร' : '➕ ทะเบียนครุภัณฑ์เครื่องจักรใหม่'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSaveMachine} className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">รหัสเครื่องจักร (Machine ID)</label>
                  <input 
                    required 
                    disabled={isEditMode} 
                    type="text" 
                    placeholder="เช่น CNC-01, BL-05"
                    className="w-full px-3 py-2 border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg outline-none uppercase font-mono text-xs font-bold disabled:bg-slate-100 disabled:text-slate-500" 
                    value={newMachine.id || ''} 
                    onChange={(e) => setNewMachine({...newMachine, id: e.target.value.toUpperCase()})} 
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">ชื่อเครื่องจักร (Machine Name)</label>
                  <input 
                    required 
                    type="text" 
                    placeholder="เช่น เครื่องพับเหล็กไฮโดรลิค"
                    className="w-full px-3 py-2 border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg outline-none text-xs font-semibold" 
                    value={newMachine.name || ''} 
                    onChange={(e) => setNewMachine({...newMachine, name: e.target.value})} 
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">รุ่น/สเปกซีรีส์ (Model / Series)</label>
                  <input 
                    type="text" 
                    placeholder="เช่น Series-X 2026"
                    className="w-full px-3 py-2 border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg outline-none text-xs" 
                    value={newMachine.model || ''} 
                    onChange={(e) => setNewMachine({...newMachine, model: e.target.value})} 
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">วันที่ติดตั้ง (Installing Date)</label>
                  <input 
                    type="date" 
                    className="w-full px-3 py-2 border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg outline-none text-xs" 
                    value={newMachine.installDate || ''} 
                    onChange={(e) => setNewMachine({...newMachine, installDate: e.target.value})} 
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">รอบทำ PM (ทุกๆ กี่เดือน)</label>
                  <input 
                    required 
                    type="number" 
                    min="1" 
                    max="120"
                    placeholder="เช่น 6"
                    className="w-full px-3 py-2 border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg outline-none text-xs font-bold" 
                    value={newMachine.pmInterval || ''} 
                    onChange={(e) => setNewMachine({...newMachine, pmInterval: e.target.value})} 
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">วันที่ทำ PM ล่าสุด (Last PM)</label>
                  <input 
                    required 
                    type="date" 
                    className="w-full px-3 py-2 border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg outline-none text-xs" 
                    value={newMachine.lastPM || ''} 
                    onChange={(e) => setNewMachine({...newMachine, lastPM: e.target.value})} 
                  />
                </div>
              </div>

              <div className="pt-4 flex gap-2 border-t border-slate-100">
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)} 
                  className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg transition-colors cursor-pointer text-center"
                >
                  ยกเลิก
                </button>
                <button 
                  type="submit" 
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg font-black uppercase tracking-wider transition-all shadow-md cursor-pointer text-center"
                >
                  บันทึกลงระบบคลาวด์
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RECORD PM ACTION MODAL (Admins and Technicians) */}
      {isPMModalOpen && selectedMachine && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl my-8 overflow-hidden animate-zoom-in text-xs">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-indigo-50/40">
              <div>
                <h3 className="text-sm font-black text-slate-800">📝 บันทึกรายงานแผนปฏิบัติการ PM</h3>
                <p className="text-[10px] text-slate-500 font-bold mt-0.5">
                  เครื่องจักร: {selectedMachine.name} ({selectedMachine.id}) • รอบแผน {selectedMachine.pmInterval} เดือน
                </p>
              </div>
              <button onClick={() => setIsPMModalOpen(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleRecordPM} className="p-6 space-y-5">
              <div className="space-y-1">
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider">รายละเอียดการปฏิบัติงานบำรุงรักษา</label>
                <textarea 
                  required 
                  placeholder="อธิบายละเอียด เช่น ทำความสะอาดพัดลมระบายอากาศ, ตรวจวัดค่าความต้านทานไดนาโม, เป่าฝุ่นฟิลเตอร์ไอเสีย..." 
                  className="w-full px-3 py-2 border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none rounded-lg min-h-[90px] text-xs leading-relaxed" 
                  value={pmRecord.action} 
                  onChange={(e) => setPmRecord({...pmRecord, action: e.target.value})} 
                />
              </div>

              {/* Dynamic Spare Parts Section */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider">อะไหล่และอุปกรณ์สำรองที่เปลี่ยน (Spare Parts Used)</label>
                  <button 
                    type="button" 
                    onClick={addSparePartRow} 
                    className="text-indigo-600 flex items-center gap-1 text-[10px] font-bold uppercase hover:text-indigo-700 transition-colors cursor-pointer"
                  >
                    <PlusCircle size={14} /> เพิ่มอะไหล่
                  </button>
                </div>
                <div className="space-y-2 max-h-[140px] overflow-y-auto pr-1">
                  {pmRecord.spareParts.map((part, index) => (
                    <div key={index} className="flex gap-2 items-center animate-fade-in">
                      <input 
                        required
                        placeholder="ระบุรหัสอะไหล่ หรือชื่ออะไหล่" 
                        className="flex-1 px-3 py-1.5 border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg outline-none text-xs font-semibold" 
                        value={part.name} 
                        onChange={(e) => updateSparePart(index, 'name', e.target.value)} 
                      />
                      <input 
                        type="number" 
                        min="1" 
                        placeholder="จำนวน" 
                        className="w-20 px-3 py-1.5 border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg outline-none text-xs font-bold font-mono text-center" 
                        value={part.quantity} 
                        onChange={(e) => updateSparePart(index, 'quantity', parseInt(e.target.value) || 1)} 
                      />
                      {pmRecord.spareParts.length > 1 && (
                        <button 
                          type="button" 
                          onClick={() => removeSparePartRow(index)} 
                          className="text-rose-400 hover:text-rose-600 p-1 rounded transition-colors cursor-pointer"
                        >
                          <MinusCircle size={17} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider">ชื่อช่างผู้ดำเนินงานหลัก</label>
                <input 
                  required 
                  type="text" 
                  className="w-full px-3 py-2 border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg outline-none text-xs font-bold" 
                  value={pmRecord.technician || currentUserProfile?.name || ''} 
                  onChange={(e) => setPmRecord({...pmRecord, technician: e.target.value})} 
                />
              </div>

              <div className="pt-3 flex gap-2 border-t border-slate-100">
                <button 
                  type="button" 
                  onClick={() => setIsPMModalOpen(false)} 
                  className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg transition-all cursor-pointer text-center"
                >
                  ยกเลิก
                </button>
                <button 
                  type="submit" 
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-2 rounded-lg font-black uppercase tracking-wider transition-all shadow-md cursor-pointer text-center"
                >
                  บันทึกปิดรอบแผนสำเร็จ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
