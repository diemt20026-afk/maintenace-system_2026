import React, { useState, useEffect } from 'react';
import { 
  collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc, getDocFromServer 
} from 'firebase/firestore';
import { 
  signInAnonymously, onAuthStateChanged, User as FirebaseUser 
} from 'firebase/auth';
import { 
  Wrench, ClipboardList, PlusCircle, Save, Clock, FileText, CheckCircle, 
  AlertCircle, ArrowLeft, Timer, History, X, BarChart3, AlertTriangle, 
  LogOut, ShieldCheck, UserCircle, Hammer, Download, Search, Zap, 
  Lightbulb, CalendarClock, Edit3, Trash2, Filter, Users, ChevronRight
} from 'lucide-react';
import { db, auth, handleFirestoreError, OperationType } from './firebase';
import { 
  Ticket, RepairDetails, RoleType, UserProfile, TicketFormData, RepairFormData 
} from './types';
import LoginScreen from './components/LoginScreen';
import AssignmentsView from './components/AssignmentsView';
import PmPdView from './components/PmPdView';
import SparepartsView from './components/SparepartsView';

const appId = '68f312ad-3096-474d-91bd-386cec79d9cb';

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState<'list' | 'form' | 'repair' | 'dashboard' | 'assignments' | 'pmpd' | 'spareparts'>('list'); 
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [historyMachine, setHistoryMachine] = useState<string | null>(null);
  const [machineSearch, setMachineSearch] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isUpdatingTicket, setIsUpdatingTicket] = useState(false);
  const [toastMessage, setToastMessage] = useState(''); 
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [acknowledgedPendingCount, setAcknowledgedPendingCount] = useState(0);

  // Filter states for Dashboard
  const [dashFilterMonth, setDashFilterMonth] = useState<number>(new Date().getMonth() + 1); // 1-12
  const [dashFilterYear, setDashFilterYear] = useState<number>(new Date().getFullYear());

  // Filter states for Live Work Order Queue
  const [listSearchText, setListSearchText] = useState('');
  const [listFilterDay, setListFilterDay] = useState<string>('all'); // 'all' or '01'..'31'
  const [listFilterMonth, setListFilterMonth] = useState<number>(new Date().getMonth() + 1); // 1-12
  const [listFilterYear, setListFilterYear] = useState<number>(new Date().getFullYear());
  const [listFilterTeam, setListFilterTeam] = useState<string>('all'); // 'all', 'A', 'B', 'C', 'Office'

  const thaiMonths = [
    "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", 
    "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
  ];
  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

  const defaultDepartments = [
    'สำนักงาน (Office)', 'TE', 'QA', 'Extrusion', 'Coating', 'Cutting', 
    'Rewinding', 'Billet Cutting', 'Die'
  ];

  const workTypes = [
    { id: 'urgent', label: 'Urgent (ฉุกเฉิน)', color: 'bg-rose-500', icon: Zap },
    { id: 'improvement', label: 'Improvement (ปรับปรุง)', color: 'bg-blue-500', icon: Lightbulb },
    { id: 'repair', label: 'Repair (ซ่อมทั่วไป)', color: 'bg-amber-500', icon: Wrench }
  ] as const;

  const [isCustomDept, setIsCustomDept] = useState(false);
  const [formData, setFormData] = useState<TicketFormData>({
    requester: '',
    employeeId: '',
    department: 'ฝ่ายผลิต (Production)',
    customDepartment: '',
    machine: '',
    issue: '',
    workType: 'urgent',
    team: ''
  });

  const [repairFormData, setRepairFormData] = useState<RepairFormData>({
    technician: '',
    cause: '',
    solution: '',
    prevention: '',
    diagnosisTime: '',
    partsReplaced: false, 
    partNumber: '',
    startTime: '',
    endTime: '',
    workType: 'urgent'
  });

  // Init Auth anonymously by default to allow Zero-Trust read/writes
  useEffect(() => {
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (error) {
        console.warn("Anonymous authentication fallback activated:", error);
        setUser({ uid: 'public-operator' } as FirebaseUser);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
      } else {
        setUser({ uid: 'public-operator' } as FirebaseUser);
      }
    });
    return () => unsubscribe();
  }, []);

  // Validate connection to Firestore on startup as mandated
  useEffect(() => {
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    };
    testConnection();
  }, []);

  // Live snapshot fetch
  useEffect(() => {
    if (!user) return;
    setLoading(true);
    const ticketsCollection = collection(db, 'artifacts', appId, 'public', 'data', 'tickets');
    
    const unsubscribe = onSnapshot(ticketsCollection, 
      (snapshot) => {
        const ticketsData = snapshot.docs.map(doc => ({ 
          id: doc.id, 
          ...doc.data() 
        })) as Ticket[];
        
        setTickets(ticketsData.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)));
        setLoading(false);
      }, 
      (error) => {
        handleFirestoreError(error, OperationType.GET, `artifacts/${appId}/public/data/tickets`);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [user]);

  const pendingCount = tickets.filter(t => t.status === 'pending').length;
  
  const filteredTickets = tickets.filter(ticket => {
    // 1. Filter by Month and Year (using timestamp or fallback parsing)
    const ticketDateObj = ticket.timestamp ? new Date(ticket.timestamp) : null;
    let tMonth = 0;
    let tYear = 0;
    let tDay = 0;

    if (ticketDateObj) {
      tMonth = ticketDateObj.getMonth() + 1; // 1-12
      tYear = ticketDateObj.getFullYear();
      tDay = ticketDateObj.getDate();
    } else if (ticket.date) {
      // Fallback parsing "DD/MM/YYYY" (Buddhist era year conversion)
      const parts = ticket.date.split('/');
      if (parts.length === 3) {
        tDay = parseInt(parts[0], 10);
        tMonth = parseInt(parts[1], 10);
        const y = parseInt(parts[2], 10);
        tYear = y > 2500 ? y - 543 : y; // Convert Buddhist Era back to AD if needed
      }
    }

    // Month & Year Filter
    if (listFilterMonth !== 0 && tMonth !== listFilterMonth) return false;
    if (listFilterYear !== 0 && tYear !== listFilterYear) return false;

    // Day Filter
    if (listFilterDay !== 'all') {
      const dNum = parseInt(listFilterDay, 10);
      if (tDay !== dNum) return false;
    }

    // Team Filter
    if (listFilterTeam !== 'all') {
      if ((ticket.team || '') !== listFilterTeam) return false;
    }

    // Text search (Machine OR Requester)
    if (listSearchText.trim() !== '') {
      const query = listSearchText.toLowerCase();
      const machineMatch = ticket.machine ? ticket.machine.toLowerCase().includes(query) : false;
      const requesterMatch = ticket.requester ? ticket.requester.toLowerCase().includes(query) : false;
      if (!machineMatch && !requesterMatch) return false;
    }

    return true;
  });
  
  const showBigAlert = isLoggedIn && 
                       currentUserProfile && 
                       (currentUserProfile.role === 'mt' || currentUserProfile.role === 'admin') && 
                       pendingCount > 0 && 
                       pendingCount > acknowledgedPendingCount;

  useEffect(() => {
    if (pendingCount < acknowledgedPendingCount) {
      setAcknowledgedPendingCount(pendingCount);
    }
  }, [pendingCount, acknowledgedPendingCount]);

  const handleAppLogin = (profile: UserProfile) => {
    setCurrentUserProfile(profile);
    setIsLoggedIn(true);
    if (profile.role === 'requester') {
      setCurrentView('list');
      setFormData(prev => ({ ...prev, requester: profile.name }));
    } else if (profile.role === 'admin') {
      setCurrentView('dashboard');
    } else {
      setCurrentView('list');
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setCurrentUserProfile(null);
    setCurrentView('list');
    setAcknowledgedPendingCount(0);
  };

  const calculateDuration = (start: number, end: number) => {
    const diffMs = end - start;
    if (diffMs < 0) return { text: '0 นาที', ms: 0 };
    const diffMins = Math.floor(diffMs / 60000);
    const hours = Math.floor(diffMins / 60);
    const minutes = diffMins % 60;
    return { 
      text: hours > 0 ? `${hours} ชม. ${minutes} นาที` : `${minutes} นาที`, 
      ms: diffMs 
    };
  };

  const formatMsToText = (ms: number) => {
    if (!ms) return "0 นาที";
    const mins = Math.floor(ms / 60000);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h} ชม. ${m} นาที` : `${m} นาที`;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    if (name === 'department') setIsCustomDept(value === 'OTHER');
    setFormData(prev => ({ ...prev, [name]: value }));
  };
  
  const handleRepairChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    setRepairFormData(prev => ({ 
      ...prev, 
      [name]: type === 'checkbox' ? checked : value 
    }));
  };

  const openRequesterForm = (ticket: Ticket | null = null) => {
    if (ticket) {
      const isCustom = !defaultDepartments.includes(ticket.department);
      setIsUpdatingTicket(true);
      setSelectedTicket(ticket);
      setFormData({
        requester: ticket.requester,
        employeeId: ticket.employeeId,
        department: isCustom ? 'OTHER' : ticket.department,
        customDepartment: isCustom ? ticket.department : '',
        machine: ticket.machine,
        issue: ticket.issue,
        workType: ticket.workType,
        team: ticket.team || ''
      });
      setIsCustomDept(isCustom);
    } else {
      setIsUpdatingTicket(false);
      setSelectedTicket(null);
      setFormData({
        requester: currentUserProfile?.name || '',
        employeeId: '',
        department: 'ฝ่ายผลิต (Production)',
        customDepartment: '',
        machine: '',
        issue: '',
        workType: 'urgent',
        team: ''
      });
      setIsCustomDept(false);
    }
    setCurrentView('form');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const finalDepartment = isCustomDept ? formData.customDepartment : formData.department;
    
    try {
      if (isUpdatingTicket && selectedTicket) {
        const ticketRef = doc(db, 'artifacts', appId, 'public', 'data', 'tickets', selectedTicket.id);
        await updateDoc(ticketRef, {
          employeeId: formData.employeeId,
          department: finalDepartment,
          machine: formData.machine,
          issue: formData.issue,
          workType: formData.workType,
          team: formData.team || ''
        });
        setToastMessage('อัปเดตข้อมูลเรียบร้อยแล้ว (Updated successfully)');
      } else {
        const now = new Date();
        const newTicket = {
          date: now.toLocaleDateString('th-TH', { year: 'numeric', month: '2-digit', day: '2-digit' }),
          time: now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false }),
          timestamp: now.getTime(),
          requester: formData.requester,
          employeeId: formData.employeeId,
          department: finalDepartment,
          machine: formData.machine,
          issue: formData.issue,
          workType: formData.workType,
          status: 'pending',
          repairDetails: null,
          createdBy: user.uid,
          team: formData.team || ''
        };
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'tickets'), newTicket);
        setToastMessage('บันทึกข้อมูลเรียบร้อยแล้ว (Ticket created)');
      }
      setTimeout(() => setToastMessage(''), 4000); 
      setCurrentView('list');
      setIsUpdatingTicket(false);
      setSelectedTicket(null);
    } catch (error) { 
      handleFirestoreError(
        error, 
        isUpdatingTicket ? OperationType.UPDATE : OperationType.CREATE, 
        `artifacts/${appId}/public/data/tickets${selectedTicket ? '/' + selectedTicket.id : ''}`
      );
    }
  };

  const handleDeleteTicket = async (ticketId: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'tickets', ticketId));
      setToastMessage('ลบรายการเรียบร้อยแล้ว (Deleted successfully)');
      setShowDeleteConfirm(null);
      setTimeout(() => setToastMessage(''), 3000);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `artifacts/${appId}/public/data/tickets/${ticketId}`);
    }
  };

  const toDatetimeLocal = (timestamp: number) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  const initiateRepair = (ticket: Ticket, isEditMode = false) => {
    setSelectedTicket(ticket);
    setIsEditing(isEditMode);
    
    if (isEditMode && ticket.repairDetails) {
      setRepairFormData({ 
        technician: ticket.repairDetails.technician, 
        cause: ticket.repairDetails.cause || '',
        solution: ticket.repairDetails.solution, 
        prevention: ticket.repairDetails.prevention || '', 
        diagnosisTime: ticket.repairDetails.diagnosisTime || '',
        partsReplaced: ticket.repairDetails.partsReplaced || false, 
        partNumber: ticket.repairDetails.partNumber || '',
        startTime: ticket.repairDetails.startTime || toDatetimeLocal(ticket.timestamp),
        endTime: ticket.repairDetails.endTime || toDatetimeLocal(ticket.repairDetails.finishTimestamp),
        workType: ticket.workType || 'urgent'
      });
    } else {
      const now = Date.now();
      setRepairFormData({ 
        technician: currentUserProfile?.role === 'mt' ? currentUserProfile.name : '', 
        cause: '',
        solution: '', 
        prevention: '', 
        diagnosisTime: '',
        partsReplaced: false, 
        partNumber: '',
        startTime: toDatetimeLocal(ticket.timestamp),
        endTime: toDatetimeLocal(now),
        workType: ticket.workType || 'urgent'
      });
    }
    setCurrentView('repair');
  };

  const handleRepairSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedTicket) return;
    
    const startObj = new Date(repairFormData.startTime);
    const endObj = new Date(repairFormData.endTime);
    const startTimestamp = startObj.getTime();
    const finishTimestamp = endObj.getTime();
    const durationObj = calculateDuration(startTimestamp, finishTimestamp);

    let repairUpdate: Record<string, any> = {};

    if (isEditing) {
      repairUpdate = {
        workType: repairFormData.workType,
        repairDetails: {
          ...selectedTicket.repairDetails,
          ...repairFormData,
          finishedAt: endObj.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false }),
          finishTimestamp: finishTimestamp,
          duration: durationObj.text,
          durationMs: durationObj.ms
        }
      };
    } else {
      repairUpdate = {
        status: 'waiting_confirm',
        workType: repairFormData.workType,
        repairDetails: {
          ...repairFormData,
          finishedAt: endObj.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false }),
          finishTimestamp: finishTimestamp,
          duration: durationObj.text,
          durationMs: durationObj.ms
        }
      };
    }

    try {
      const ticketRef = doc(db, 'artifacts', appId, 'public', 'data', 'tickets', selectedTicket.id);
      await updateDoc(ticketRef, repairUpdate);
      setToastMessage('บันทึกความคืบหน้าการซ่อมเรียบร้อยแล้ว');
      setTimeout(() => setToastMessage(''), 3000);
      setCurrentView('list');
      setSelectedTicket(null);
      setIsEditing(false);
    } catch (error) { 
      handleFirestoreError(error, OperationType.UPDATE, `artifacts/${appId}/public/data/tickets/${selectedTicket.id}`);
    }
  };

  const confirmRepair = async (ticket: Ticket) => {
    if (!user) return;
    try {
      const ticketRef = doc(db, 'artifacts', appId, 'public', 'data', 'tickets', ticket.id);
      await updateDoc(ticketRef, { status: 'completed' });
      setToastMessage('ยืนยันงานซ่อมเสร็จสิ้นเรียบร้อยแล้ว');
      setTimeout(() => setToastMessage(''), 3000);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `artifacts/${appId}/public/data/tickets/${ticket.id}`);
    }
  };

  const exportToExcel = () => {
    const headers = ["วันที่", "เวลา", "ประเภทงาน", "เครื่องจักร", "แผนก", "ผู้แจ้ง", "อาการเสีย", "สถานะ", "ช่างซ่อม", "สาเหตุ", "เวลาวิเคราะห์(นาที)", "วิธีแก้ไข", "วิธีป้องกัน", "เวลาที่ใช้"];
    const rows = tickets.map(t => [
      t.date || '', 
      t.time || '', 
      t.workType?.toUpperCase() || 'URGENT', 
      t.machine || '', 
      t.department || '', 
      t.requester || '', 
      t.issue || '', 
      t.status === 'completed' ? 'เสร็จสิ้น' : (t.status === 'waiting_confirm' ? 'รอยืนยัน' : 'รอดำเนินการ'),
      t.repairDetails?.technician || '-',
      t.repairDetails?.cause || '-',
      t.repairDetails?.diagnosisTime || '0',
      t.repairDetails?.solution || '-',
      t.repairDetails?.prevention || '-',
      t.repairDetails?.duration || '-'
    ]);

    const escapeCSV = (val: any) => {
      if (val === undefined || val === null) return '""';
      let str = String(val);
      // Replace newlines with space to prevent row breakdown in spreadsheets
      str = str.replace(/\r?\n/g, ' ');
      // Escape double quotes by doubling them
      const escaped = str.replace(/"/g, '""');
      return `"${escaped}"`;
    };

    const csvContent = "\uFEFF" + [
      headers.map(escapeCSV).join(","), 
      ...rows.map(row => row.map(escapeCSV).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.setAttribute("href", URL.createObjectURL(blob));
    link.setAttribute("download", `maintenance_report_${new Date().toISOString().split('T')[0]}.csv`);
    link.click();
  };

  const getDashboardData = () => {
    const filteredTickets = tickets.filter(t => {
      if (!t.timestamp) return false;
      const d = new Date(t.timestamp);
      return (d.getMonth() + 1 === dashFilterMonth) && (d.getFullYear() === dashFilterYear);
    });

    const completedOrWaiting = filteredTickets.filter(t => 
      (t.status === 'completed' || t.status === 'waiting_confirm') && 
      t.repairDetails?.durationMs
    );
    
    const top5UrgentLongest = [...completedOrWaiting]
      .filter(t => t.workType === 'urgent')
      .sort((a, b) => (b.repairDetails?.durationMs || 0) - (a.repairDetails?.durationMs || 0))
      .slice(0, 5);

    interface TechAccumulator {
      name: string;
      count: number;
      totalMs: number;
      longestMs: number;
      longestMachine: string;
    }

    const techStatsMap: Record<string, TechAccumulator> = {};
    filteredTickets.forEach(t => {
      if ((t.status === 'completed' || t.status === 'waiting_confirm') && t.repairDetails?.technician) {
        const name = t.repairDetails.technician;
        if (!techStatsMap[name]) {
          techStatsMap[name] = { name, count: 0, totalMs: 0, longestMs: 0, longestMachine: '-' };
        }
        techStatsMap[name].count += 1;
        
        if (t.workType === 'urgent') {
          const duration = t.repairDetails.durationMs || 0;
          techStatsMap[name].totalMs += duration;
          if (duration > techStatsMap[name].longestMs) {
            techStatsMap[name].longestMs = duration;
            techStatsMap[name].longestMachine = t.machine;
          }
        }
      }
    });
    const technicianStats = Object.values(techStatsMap).sort((a, b) => b.count - a.count);

    const machines = Array.from(new Set(tickets.map(t => t.machine)));
    const statusStats = {
      pending: tickets.filter(t => t.status === 'pending').length,
      waitingConfirm: tickets.filter(t => t.status === 'waiting_confirm').length,
      completed: tickets.filter(t => t.status === 'completed').length
    };
    return { top5UrgentLongest, technicianStats, machineList: machines, statusStats };
  };

  const getWorkTypeStyle = (type: 'urgent' | 'improvement' | 'repair' | 'pm') => {
    switch (type) {
      case 'improvement': 
        return { 
          color: 'text-sky-400 bg-sky-500/10 border-sky-500/20', 
          label: 'IMPROVEMENT', 
          icon: <Lightbulb className="w-3.5 h-3.5 mr-1 text-sky-400" /> 
        };
      case 'repair': 
        return { 
          color: 'text-amber-500 bg-amber-500/10 border-amber-500/20', 
          label: 'REPAIR', 
          icon: <Wrench className="w-3.5 h-3.5 mr-1 text-amber-500" /> 
        };
      case 'pm': 
        return { 
          color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', 
          label: 'PM', 
          icon: <CalendarClock className="w-3.5 h-3.5 mr-1 text-emerald-400" /> 
        };
      default: 
        return { 
          color: 'text-rose-400 bg-rose-500/10 border-rose-500/20', 
          label: 'URGENT', 
          icon: <Zap className="w-3.5 h-3.5 mr-1 text-rose-400" /> 
        };
    }
  };

  const getTeamBadgeStyle = (team?: string) => {
    switch (team) {
      case 'A':
        return 'bg-blue-50 text-blue-700 border-blue-100';
      case 'B':
        return 'bg-emerald-50 text-emerald-700 border-emerald-100';
      case 'C':
        return 'bg-purple-50 text-purple-700 border-purple-100';
      case 'Office':
        return 'bg-amber-50 text-amber-700 border-amber-100';
      default:
        return 'bg-slate-50 text-slate-600 border-slate-200';
    }
  };

  if (loading && !isLoggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="text-center space-y-4">
          <div className="relative w-16 h-16 mx-auto">
            <div className="absolute inset-0 rounded-full border-4 border-t-blue-500 border-slate-800 animate-spin"></div>
            <Wrench className="w-8 h-8 text-blue-400 absolute inset-0 m-auto animate-pulse" />
          </div>
          <p className="text-slate-400 font-semibold italic text-sm">กำลังเชื่อมต่อระบบแจ้งซ่อมบำรุง...</p>
        </div>
      </div>
    );
  }

  if (!isLoggedIn) return <LoginScreen onLogin={handleAppLogin} pendingCount={pendingCount} />;

  const stats = getDashboardData();
  const completedTickets = tickets.filter(t => t.status === 'completed' && t.repairDetails?.durationMs);
  const avgDurationMs = completedTickets.length > 0
    ? completedTickets.reduce((sum, t) => sum + (t.repairDetails?.durationMs || 0), 0) / completedTickets.length
    : 0;
  const mttrText = avgDurationMs > 0 ? `${(avgDurationMs / 3600000).toFixed(1)}h` : '1.4h';

  const systemHealth = tickets.length > 0 
    ? ((tickets.filter(t => t.status === 'completed').length / tickets.length) * 100).toFixed(1) + '%' 
    : '100%';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-12 relative font-sans">
      
      {toastMessage && (
        <div className="fixed top-16 right-4 z-50">
          <div className="bg-slate-900 text-white px-4 py-3 rounded-xl shadow-xl border border-slate-800 flex items-center font-bold text-xs uppercase tracking-wide">
            <CheckCircle className="w-4 h-4 mr-2 text-emerald-400" />
            {toastMessage}
          </div>
        </div>
      )}

      {showBigAlert && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/85 backdrop-blur-md">
          <div className="relative w-full max-w-lg mx-4">
            <div className="relative bg-white border border-red-500 text-slate-900 p-8 rounded-2xl shadow-2xl flex flex-col items-center text-center">
              <AlertTriangle className="w-16 h-16 mb-4 text-red-500 animate-bounce" />
              <h2 className="text-xl font-black uppercase tracking-tight text-red-600 mb-2">มีงานแจ้งซ่อมด่วนเข้ามา! (Alert MT)</h2>
              <p className="text-xs text-slate-500 font-bold mb-6 uppercase leading-relaxed">
                ขณะนี้มีงานแจ้งซ่อมรอรับการดำเนินการ <br/>
                <span className="text-3xl font-black text-slate-900 mx-1">{pendingCount}</span> งาน
              </p>
              <button 
                id="btn-alert-acknowledge"
                onClick={() => setAcknowledgedPendingCount(pendingCount)}
                className="bg-red-600 text-white px-8 py-3 rounded-xl text-xs font-black hover:bg-red-700 transition-all uppercase tracking-wider flex items-center shadow-lg shadow-red-600/30 cursor-pointer"
              >
                <CheckCircle className="w-4 h-4 mr-2" /> รับทราบเรื่อง (Acknowledge)
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-sm w-full shadow-2xl text-center">
            <div className="w-12 h-12 bg-red-50 text-red-600 flex items-center justify-center mx-auto mb-4 border border-red-100 rounded-xl">
              <Trash2 className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider mb-2">ยืนยันการลบรายการ?</h3>
            <p className="text-slate-400 text-[11px] mb-6 leading-relaxed">คุณแน่ใจที่จะลบคำแจ้งซ่อมนี้ใช่หรือไม่? ข้อมูลนี้จะไม่สามารถกู้คืนกลับมาได้อีกหลังจากลบออกไป</p>
            <div className="flex gap-3">
              <button 
                id="btn-delete-cancel"
                onClick={() => setShowDeleteConfirm(null)} 
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold uppercase transition-colors border border-slate-200 rounded-lg cursor-pointer"
              >
                ยกเลิก
              </button>
              <button 
                id="btn-delete-confirm"
                onClick={() => handleDeleteTicket(showDeleteConfirm)} 
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase tracking-wider transition-colors rounded-lg cursor-pointer shadow-md shadow-red-600/20"
              >
                ใช่, ยืนยันลบ
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="h-14 bg-gradient-to-r from-[#0F1E24] to-[#162F38] text-white flex items-center justify-between border-b border-[#21434F]/30 sticky top-0 z-40 shadow-md">
        <div className="max-w-6xl w-full mx-auto px-4 flex justify-between items-center h-full">

          <div 
            id="nav-logo"
            className="flex items-center space-x-2 cursor-pointer h-full" 
            onClick={() => { setCurrentView('list'); setHistoryMachine(null); setIsEditing(false); setIsUpdatingTicket(false); }}
          >
            <div className="w-7 h-7 bg-gradient-to-br from-amber-400 to-amber-500 rounded-lg flex items-center justify-center font-black text-slate-950 text-xs shrink-0 shadow-md shadow-amber-500/20">
              M
            </div>
            <div>
              <span className="font-extrabold tracking-tight text-xs uppercase flex items-center">
                MaintainPro 
                <span className="text-slate-400 font-normal ml-1.5 bg-[#21434F]/50 border border-[#21434F] px-1 py-0.2 rounded text-[8px] uppercase font-mono">v4.2.1</span>
              </span>
              <div className="flex items-center text-slate-400 text-[8px] font-mono uppercase tracking-widest mt-0.5">
                 {currentUserProfile?.name} <span className="mx-1 text-slate-700">|</span> {currentUserProfile?.role === 'mt' ? 'MT_TECH' : currentUserProfile?.role?.toUpperCase()}
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-1.5">
            {currentUserProfile?.role === 'admin' && (
              <button 
                id="nav-btn-dashboard"
                onClick={() => setCurrentView('dashboard')} 
                className={`px-3 py-1.5 text-[10px] rounded-lg uppercase font-bold tracking-wider transition-all cursor-pointer ${currentView === 'dashboard' ? 'bg-[#21434F] text-white shadow-inner' : 'text-slate-300 hover:bg-[#21434F]/40 hover:text-white'}`}
              >
                Dashboard
              </button>
            )}
            {(currentUserProfile?.role === 'admin' || currentUserProfile?.role === 'mt') && (
              <button 
                id="nav-btn-spareparts"
                onClick={() => {setCurrentView('spareparts'); setIsEditing(false); setIsUpdatingTicket(false);}} 
                className={`px-3 py-1.5 text-[10px] rounded-lg uppercase font-bold tracking-wider transition-all cursor-pointer ${currentView === 'spareparts' ? 'bg-[#21434F] text-white shadow-inner' : 'text-slate-300 hover:bg-[#21434F]/40 hover:text-white'}`}
              >
                จัดการอะไหล่
              </button>
            )}
            {currentUserProfile?.role === 'requester' && (
              <button 
                id="nav-btn-new-ticket"
                onClick={() => openRequesterForm()} 
                className={`px-3 py-1.5 text-[10px] rounded-lg uppercase font-bold tracking-wider transition-all cursor-pointer ${currentView === 'form' && !isUpdatingTicket ? 'bg-[#21434F] text-white shadow-inner' : 'text-slate-300 hover:bg-[#21434F]/40 hover:text-white'}`}
              >
                แจ้งซ่อมใหม่
              </button>
            )}
            {(currentUserProfile?.role === 'admin' || currentUserProfile?.role === 'mt') && (
              <>
                <button 
                  id="nav-btn-assignments"
                  onClick={() => {setCurrentView('assignments'); setIsEditing(false); setIsUpdatingTicket(false);}} 
                  className={`px-3 py-1.5 text-[10px] rounded-lg uppercase font-bold tracking-wider transition-all cursor-pointer ${currentView === 'assignments' ? 'bg-[#21434F] text-white shadow-inner' : 'text-slate-300 hover:bg-[#21434F]/40 hover:text-white'}`}
                >
                  มอบหมายงาน
                </button>
                <button 
                  id="nav-btn-pmpd"
                  onClick={() => {setCurrentView('pmpd'); setIsEditing(false); setIsUpdatingTicket(false);}} 
                  className={`px-3 py-1.5 text-[10px] rounded-lg uppercase font-bold tracking-wider transition-all cursor-pointer ${currentView === 'pmpd' ? 'bg-[#21434F] text-white shadow-inner' : 'text-slate-300 hover:bg-[#21434F]/40 hover:text-white'}`}
                >
                  แผน PM/PD
                </button>
              </>
            )}
            <button 
              id="nav-btn-list"
              onClick={() => {setCurrentView('list'); setIsEditing(false); setIsUpdatingTicket(false);}} 
              className={`px-3 py-1.5 text-[10px] rounded-lg uppercase font-bold tracking-wider transition-all cursor-pointer ${currentView === 'list' ? 'bg-[#21434F] text-white shadow-inner' : 'text-slate-300 hover:bg-[#21434F]/40 hover:text-white'}`}
            >
              ใบแจ้งซ่อม
            </button>
            <div className="w-px h-4 bg-slate-800 mx-1"></div>
            <div className="text-[9px] opacity-60 font-mono hidden sm:inline-block mr-1">ST_ID: NORD-04</div>
            <button 
              id="nav-btn-logout"
              onClick={handleLogout} 
              className="p-1.5 hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 rounded-lg transition-colors cursor-pointer"
              title="ออกจากระบบ"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {['list', 'form', 'repair'].includes(currentView) && (
          <div className="bg-white border border-slate-200/80 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 divide-y sm:divide-y-0 md:divide-x divide-slate-100 shrink-0 mb-8 shadow-[0_2px_12px_rgba(0,0,0,0.03)] rounded-2xl overflow-hidden">
            <div className="p-4 flex flex-col justify-between">
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Pending</p>
              <p className="text-xl font-black text-slate-800 font-mono mt-1">{tickets.filter(t => t.status === 'pending').length}</p>
            </div>
            <div className="p-4 flex flex-col justify-between">
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">In Progress</p>
              <p className="text-xl font-black text-slate-800 font-mono mt-1">{tickets.filter(t => t.status === 'waiting_confirm').length}</p>
            </div>
            <div className="p-4 bg-red-50/50 flex flex-col justify-between">
              <p className="text-[9px] text-red-600 font-bold uppercase tracking-wider">Critical Pending</p>
              <p className="text-xl font-black text-red-600 font-mono mt-1">{tickets.filter(t => t.status === 'pending' && t.workType === 'urgent').length}</p>
            </div>
            <div className="p-4 flex flex-col justify-between">
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">MTTR</p>
              <p className="text-xl font-black text-slate-800 font-mono mt-1">{mttrText}</p>
            </div>
            <div className="p-4 bg-emerald-50/50 flex flex-col justify-between">
              <p className="text-[9px] text-emerald-600 font-bold uppercase tracking-wider">System Health</p>
              <p className="text-xl font-black text-emerald-700 font-mono mt-1">{systemHealth}</p>
            </div>
            <div className="p-4 flex items-center justify-center bg-slate-50/30">
              {(currentUserProfile?.role === 'requester' || currentUserProfile?.role === 'admin') ? (
                <button 
                  id="btn-metric-new-ticket"
                  onClick={() => openRequesterForm()}
                  className="bg-gradient-to-r from-[#0F1E24] to-[#162F38] hover:from-[#132830] hover:to-[#1a3843] text-white px-2.5 py-2 text-[9px] font-bold rounded-lg uppercase tracking-wider transition-all w-full text-center shadow-md shadow-slate-900/10 cursor-pointer"
                >
                  + NEW TICKET
                </button>
              ) : (
                <div className="text-[9px] font-mono text-slate-400 text-center uppercase font-bold tracking-widest">
                  ST: ACTIVE
                </div>
              )}
            </div>
          </div>
        )}

        {currentView === 'assignments' && (
          <AssignmentsView 
            appId={appId}
            currentUserProfile={currentUserProfile}
            tickets={tickets}
            onToast={(msg) => {
              setToastMessage(msg);
              setTimeout(() => setToastMessage(''), 4000);
            }}
          />
        )}

        {currentView === 'pmpd' && (
          <PmPdView 
            appId={appId}
            currentUserProfile={currentUserProfile}
            onToast={(msg) => {
              setToastMessage(msg);
              setTimeout(() => setToastMessage(''), 4000);
            }}
          />
        )}

        {currentView === 'spareparts' && (
          <div className="bg-white border border-slate-200/80 rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.04)] p-6 animate-fade-in">
            <SparepartsView 
              appId={appId}
              currentUserProfile={currentUserProfile}
              onToast={(msg) => {
                setToastMessage(msg);
                setTimeout(() => setToastMessage(''), 4000);
              }}
            />
          </div>
        )}

        {currentView === 'dashboard' && currentUserProfile?.role === 'admin' && (
          <div className="space-y-6 animate-fade-in">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-300">
              <div className="flex items-center space-x-2">
                <BarChart3 className="w-5 h-5 text-slate-800" />
                <div>
                  <h2 className="text-sm font-black uppercase text-slate-900 tracking-wider">ระบบวิเคราะห์งานซ่อมบำรุง (Maintenance Analytics)</h2>
                  <p className="text-[10px] text-slate-500 mt-0.5">ภาพรวม สถิติช่าง และการทำงานของระบบในรอบเดือน</p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="flex items-center gap-2 bg-white p-2 rounded-sm border border-slate-300 shadow-sm">
                  <Filter className="w-3.5 h-3.5 text-slate-400 ml-1" />
                  <select 
                    id="select-dash-month"
                    value={dashFilterMonth} 
                    onChange={(e) => setDashFilterMonth(parseInt(e.target.value))}
                    className="bg-transparent text-[10px] font-black outline-none cursor-pointer text-slate-700 border-none mr-2 uppercase"
                  >
                    {thaiMonths.map((m, i) => <option className="bg-white text-slate-800" key={m} value={i+1}>{m}</option>)}
                  </select>
                  <div className="w-px h-3 bg-slate-300"></div>
                  <select 
                    id="select-dash-year"
                    value={dashFilterYear} 
                    onChange={(e) => setDashFilterYear(parseInt(e.target.value))}
                    className="bg-transparent text-[10px] font-black outline-none cursor-pointer text-slate-700 border-none font-mono"
                  >
                    {years.map(y => <option className="bg-white text-slate-800" key={y} value={y}>{y + 543}</option>)}
                  </select>
                </div>
                <button 
                  id="btn-dash-export"
                  onClick={exportToExcel} 
                  className="bg-slate-900 hover:bg-slate-800 text-white px-3 py-2 text-[10px] font-bold uppercase tracking-wider rounded-sm shadow-sm transition-colors flex items-center justify-center"
                >
                  <Download className="w-3.5 h-3.5 mr-2" /> ส่งออกข้อมูล (CSV)
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white p-4 border border-slate-300 rounded-sm shadow-sm">
                <p className="text-[9px] font-black uppercase text-slate-400 tracking-wider mb-1">งานแจ้งซ่อมสะสมทั้งหมด</p>
                <div className="flex items-end justify-between">
                   <span className="text-xl font-black text-slate-900 font-mono leading-none">{tickets.length}</span>
                   <ClipboardList className="w-4 h-4 text-slate-300" />
                </div>
              </div>
              <div className="bg-white p-4 border border-slate-300 border-l-4 border-amber-500 rounded-sm shadow-sm">
                <p className="text-[9px] font-black uppercase text-amber-600 tracking-wider mb-1">งานรอทีมช่างรับ (Pending)</p>
                <div className="flex items-end justify-between">
                   <span className="text-xl font-black text-amber-605 font-mono leading-none">{stats.statusStats.pending}</span>
                   <Clock className="w-4 h-4 text-amber-300/60" />
                </div>
              </div>
              <div className="bg-white p-4 border border-slate-300 border-l-4 border-purple-500 rounded-sm shadow-sm">
                <p className="text-[9px] font-black uppercase text-purple-600 tracking-wider mb-1">รอยืนยันปิดงาน (Waiting)</p>
                <div className="flex items-end justify-between">
                   <span className="text-xl font-black text-purple-600 font-mono leading-none">{stats.statusStats.waitingConfirm}</span>
                   <AlertCircle className="w-4 h-4 text-purple-300/60" />
                </div>
              </div>
              <div className="bg-white p-4 border border-slate-300 border-l-4 border-emerald-500 rounded-sm shadow-sm">
                <p className="text-[9px] font-black uppercase text-emerald-600 tracking-wider mb-1">ปิดงานซ่อมแล้ว (Completed)</p>
                <div className="flex items-end justify-between">
                   <span className="text-xl font-black text-emerald-700 font-mono leading-none">{stats.statusStats.completed}</span>
                   <CheckCircle className="w-4 h-4 text-emerald-300/60" />
                </div>
              </div>
            </div>

            <div className="bg-white border border-slate-300 rounded-sm shadow-sm overflow-hidden">
              <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-300 flex items-center justify-between">
                <h3 className="text-[10px] font-black text-slate-800 uppercase tracking-wider flex items-center">
                  <Users className="w-4 h-4 mr-2 text-slate-700" />
                  สถิติประสิทธิภาพการซ่อมแซมของช่าง (Technician Performance) - {thaiMonths[dashFilterMonth-1]} {dashFilterYear + 543}
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900 text-white font-mono text-[9px] uppercase tracking-wider border-b border-slate-950">
                    <tr>
                      <th className="py-2.5 px-4 font-bold">ชื่อช่างเทคนิค</th>
                      <th className="py-2.5 px-4 text-center font-bold">งานที่ดำเนินการเสร็จ</th>
                      <th className="py-2.5 px-4 text-center font-bold">เวลารวม (เฉพาะงาน Urgent)</th>
                      <th className="py-2.5 px-4 font-bold">เครื่องจักรที่ซ่อมนานสุด (Urgent)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {stats.technicianStats.length > 0 ? (
                      stats.technicianStats.map((tech) => (
                        <tr key={tech.name} className="hover:bg-slate-50 transition-colors">
                          <td className="py-2 px-4 font-bold text-slate-800 flex items-center">
                             <div className="w-5 h-5 rounded-sm bg-slate-900 text-white flex items-center justify-center mr-2 text-[9px] font-mono">
                                {tech.name.charAt(0)}
                             </div>
                             {tech.name}
                          </td>
                          <td className="py-2 px-4 text-center">
                            <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-sm text-[10px] font-bold">
                              {tech.count} งาน
                            </span>
                          </td>
                          <td className="py-2 px-4 text-center font-mono font-bold text-slate-700">
                            {formatMsToText(tech.totalMs)}
                          </td>
                          <td className="py-2 px-4">
                            <div className="flex flex-col">
                              <span className="text-xs font-mono font-bold text-slate-900">{tech.longestMachine}</span>
                              <span className="text-[9px] text-slate-400 font-mono font-bold uppercase">เวลา: {formatMsToText(tech.longestMs)}</span>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-slate-400 text-[10px] italic">ไม่มีสถิติการซ่อมในระบบสำหรับเดือนนี้</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-sm border border-slate-300 p-4 shadow-sm">
                <h3 className="font-black text-[10px] text-slate-800 uppercase tracking-wider flex items-center mb-4">
                  <Timer className="w-3.5 h-3.5 mr-2 text-red-600" /> 
                  งานซ่อมด่วนสะสมที่ใช้เวลานานที่สุด (Top 5 Urgent Hours)
                </h3>
                
                <div className="space-y-4">
                  {stats.top5UrgentLongest.length > 0 ? (
                    stats.top5UrgentLongest.map((t, idx) => {
                      const maxMs = stats.top5UrgentLongest[0].repairDetails?.durationMs || 1;
                      const barWidth = ((t.repairDetails?.durationMs || 0) / maxMs) * 100;
                      return (
                        <div key={t.id} className="relative group cursor-pointer" onClick={() => setHistoryMachine(t.machine)}>
                          <div className="flex justify-between items-end mb-1">
                            <div>
                               <span className="text-[9px] font-mono text-slate-400 mr-1.5">#0{idx+1}</span>
                               <span className="font-bold text-slate-800 text-xs hover:text-slate-950 hover:underline">{t.machine}</span>
                            </div>
                            <span className="text-[9px] font-mono font-bold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-sm">{t.repairDetails?.duration}</span>
                          </div>
                          <div className="w-full h-2 bg-slate-100 rounded-none overflow-hidden border border-slate-200">
                            <div className="h-full bg-slate-900 rounded-none transition-all duration-1000" style={{ width: `${barWidth}%` }}></div>
                          </div>
                          <div className="text-[9px] text-slate-400 font-mono mt-1 font-bold">วันที่: {t.date} | ช่าง: {t.repairDetails?.technician}</div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <div className="w-8 h-8 bg-slate-100 rounded-sm border border-slate-200 flex items-center justify-center mb-2 text-slate-400">
                        <Timer className="w-4 h-4" />
                      </div>
                      <p className="text-slate-500 text-[10px] italic">ไม่พบประวัติงานซ่อมด่วนในเดือนนี้</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-white rounded-sm border border-slate-300 p-4 shadow-sm flex flex-col justify-between">
                <div>
                  <h3 className="font-black text-[10px] text-slate-800 uppercase tracking-wider flex items-center mb-1">
                    <Search className="w-3.5 h-3.5 mr-2 text-slate-700" /> 
                    สืบค้นประวัติเครื่องจักร (Asset History Search)
                  </h3>
                  <p className="text-[10px] text-slate-400 mb-3 uppercase tracking-tight">ระบุชื่อหรือรหัสเครื่องจักรเพื่อแสดงสรุปประวัติอาการซ่อมบำรุง</p>
                  <input 
                    id="input-dash-search-machine"
                    type="text" 
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-sm text-xs text-slate-800 outline-none focus:border-slate-900 transition-colors mb-3 font-mono"
                    placeholder="เช่น CNC-01, PUMP-04..."
                    value={machineSearch}
                    onChange={(e) => setMachineSearch(e.target.value)}
                  />
                </div>
                <div className="overflow-y-auto max-h-[180px] space-y-2 divide-y divide-slate-100">
                  {machineSearch ? (
                    tickets.filter(t => t.machine.toLowerCase().includes(machineSearch.toLowerCase())).length > 0 ? (
                      tickets.filter(t => t.machine.toLowerCase().includes(machineSearch.toLowerCase())).map(h => {
                        const wt = getWorkTypeStyle(h.workType);
                        return (
                          <div 
                            key={h.id} 
                            className="pt-2 hover:bg-slate-50 cursor-pointer flex justify-between items-center transition-all" 
                            onClick={() => setHistoryMachine(h.machine)}
                          >
                            <div>
                              <div className="flex items-center mb-1">
                                <span className={`text-[8px] font-bold px-1.5 py-0.2 border rounded-sm mr-1.5 uppercase ${wt.color}`}>
                                  {wt.label}
                                </span>
                                <span className="text-[8px] text-slate-400 font-mono font-bold">{h.date}</span>
                              </div>
                              <div className="font-bold text-xs text-slate-850">{h.machine}</div>
                              <div className="text-[9px] text-slate-500 truncate max-w-xs mt-0.5">อาการ: {h.issue}</div>
                            </div>
                            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-center text-slate-500 text-[10px] py-6 italic">ไม่พบประวัติข้อมูลบำรุงรักษา</div>
                    )
                  ) : <div className="text-center text-slate-400 text-[10px] py-10 uppercase tracking-wider font-bold">พิมพ์รหัสเพื่อเริ่มต้นค้นหาประวัติบำรุงรักษา</div>}
                </div>
              </div>
            </div>
          </div>
        )}

        {currentView === 'list' && (
          <div className="space-y-6 animate-fade-in">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h2 className="text-sm font-black uppercase text-slate-800 tracking-wider">รายการใบแจ้งซ่อมบำรุง (Live Work Order Queue)</h2>
                <p className="text-[10px] text-slate-400 mt-1">คิวงานซ่อมแซม และสถานะการดำเนินการซ่อมบำรุงของสถานีปฏิบัติการแบบเรียลไทม์</p>
              </div>
              {(currentUserProfile?.role === 'requester' || currentUserProfile?.role === 'admin') && (
                <button 
                  id="btn-list-new-ticket"
                  onClick={() => openRequesterForm()} 
                  className="bg-gradient-to-r from-[#0F1E24] to-[#162F38] hover:from-[#132830] hover:to-[#1a3843] text-white px-4 py-2.5 text-[10px] font-bold rounded-lg uppercase tracking-wider transition-all shadow-md shadow-slate-900/10 cursor-pointer"
                >
                  <PlusCircle className="w-3.5 h-3.5 mr-2 inline-block align-middle" /> 
                  <span className="align-middle">เขียนใบแจ้งซ่อมบำรุง</span>
                </button>
              )}
            </div>

            {/* Search & Filter Controls Panel */}
            <div className="bg-[#FAFDFC] border border-slate-200/80 rounded-2xl p-5 shadow-[0_2px_12px_rgba(0,0,0,0.02)] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {/* Text Search */}
              <div className="sm:col-span-2 lg:col-span-2">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  ค้นหาเครื่องจักร หรือ ผู้แจ้งซ่อม (Search Machine or Requester)
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                    <Search className="h-3.5 w-3.5 text-slate-400" />
                  </span>
                  <input
                    type="text"
                    className="w-full pl-9 pr-9 py-2 bg-white border border-slate-200 focus:border-[#162F38] focus:ring-1 focus:ring-[#162F38]/10 rounded-lg text-xs text-slate-800 outline-none transition-all shadow-sm"
                    placeholder="พิมพ์รหัสเครื่องจักร หรือชื่อผู้แจ้ง..."
                    value={listSearchText}
                    onChange={(e) => setListSearchText(e.target.value)}
                  />
                  {listSearchText && (
                    <button
                      onClick={() => setListSearchText('')}
                      className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>

              {/* Team Filter */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  ทีมผู้รับผิดชอบ (Team)
                </label>
                <select
                  className="w-full px-3 py-2 bg-white border border-slate-200 focus:border-[#162F38] rounded-lg text-xs text-slate-800 outline-none transition-all shadow-sm font-sans"
                  value={listFilterTeam}
                  onChange={(e) => setListFilterTeam(e.target.value)}
                >
                  <option value="all">ทั้งหมด (All Teams)</option>
                  <option value="A">Team A</option>
                  <option value="B">Team B</option>
                  <option value="C">Team C</option>
                  <option value="Office">Team Office</option>
                </select>
              </div>

              {/* Day Select */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  วันแจ้งซ่อม (Day)
                </label>
                <select
                  className="w-full px-3 py-2 bg-white border border-slate-200 focus:border-[#162F38] rounded-lg text-xs text-slate-800 outline-none transition-all shadow-sm font-sans"
                  value={listFilterDay}
                  onChange={(e) => setListFilterDay(e.target.value)}
                >
                  <option value="all">ทั้งหมด (All Days)</option>
                  {Array.from({ length: 31 }, (_, i) => {
                    const dayNum = i + 1;
                    const dayStr = dayNum.toString().padStart(2, '0');
                    return (
                      <option key={dayNum} value={dayStr}>
                        วันที่ {dayNum}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Month & Year Select */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  เดือน / ปี ที่แจ้ง (Month / Year)
                </label>
                <div className="flex gap-2">
                  <select
                    className="flex-1 px-3 py-2 bg-white border border-slate-200 focus:border-[#162F38] rounded-lg text-xs text-slate-800 outline-none transition-all shadow-sm font-sans"
                    value={listFilterMonth}
                    onChange={(e) => setListFilterMonth(Number(e.target.value))}
                  >
                    {thaiMonths.map((m, idx) => (
                      <option key={idx} value={idx + 1}>{m}</option>
                    ))}
                  </select>
                  
                  <select
                    className="w-24 px-3 py-2 bg-white border border-slate-200 focus:border-[#162F38] rounded-lg text-xs text-slate-800 outline-none transition-all shadow-sm font-sans"
                    value={listFilterYear}
                    onChange={(e) => setListFilterYear(Number(e.target.value))}
                  >
                    {years.map(y => (
                      <option key={y} value={y}>{y + 543}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_2px_12px_rgba(0,0,0,0.03)] overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="bg-gradient-to-r from-[#0F1E24] to-[#162F38] text-white text-[9px] uppercase font-mono tracking-wider border-b border-slate-800">
                        <th className="py-3 px-4 font-bold">ประเภท / เครื่องจักร (Machine)</th>
                        <th className="py-3 px-4 font-bold">รายละเอียดอาการชำรุด (Issue Details)</th>
                        <th className="py-3 px-4 font-bold">ทีม / ผู้แจ้งซ่อม (Team & Requester)</th>
                        <th className="py-3 px-4 text-center font-bold">สถานะ</th>
                        <th className="py-3 px-4 text-center font-bold">การจัดการ (Actions)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredTickets.length > 0 ? (
                        filteredTickets.map((ticket) => {
                          const wt = getWorkTypeStyle(ticket.workType);
                          const canModify = currentUserProfile?.role === 'requester' && 
                                           ticket.requester === currentUserProfile.name && 
                                           ticket.status === 'pending';

                          return (
                            <tr key={ticket.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="py-3 px-4">
                                <div className={`text-[8px] font-bold inline-flex items-center px-2 py-0.5 rounded-md mb-1.5 border uppercase ${wt.color}`}>
                                  {wt.label}
                                </div>
                                <div className="font-black text-xs text-slate-900">{ticket.machine}</div>
                                <div className="text-[9px] text-slate-400 font-mono font-bold mt-0.5">{ticket.date} @ {ticket.time} น.</div>
                              </td>
                              <td className="py-3 px-4">
                                <div className="max-w-xs md:max-w-md break-all text-slate-600 font-medium leading-relaxed text-xs">
                                  {ticket.issue}
                                </div>
                              </td>
                              <td className="py-3 px-4">
                                <div className="text-slate-800 font-bold text-xs flex items-center gap-1.5 flex-wrap">
                                  <span>{ticket.requester}</span>
                                  {ticket.team && (
                                    <span className={`px-1.5 py-0.5 rounded text-[8px] font-black border uppercase tracking-wider ${getTeamBadgeStyle(ticket.team)}`}>
                                      TEAM {ticket.team}
                                    </span>
                                  )}
                                </div>
                                <div className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">{ticket.department}</div>
                              </td>
                              <td className="py-3 px-4 text-center">
                                <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold border uppercase tracking-wider ${
                                  ticket.status === 'completed' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 
                                  ticket.status === 'waiting_confirm' ? 'bg-purple-50 border-purple-100 text-purple-700' :
                                  'bg-amber-50 border-amber-100 text-amber-700'
                                }`}>
                                   {ticket.status === 'pending' ? 'รอช่างรับงาน' : 
                                    ticket.status === 'waiting_confirm' ? 'รอยืนยันเสร็จ' : 'ซ่อมเสร็จสิ้น'}
                                </span>
                              </td>
                              <td className="py-3 px-4">
                                <div className="flex flex-col gap-1 items-center justify-center">
                                  {ticket.status === 'pending' && (currentUserProfile?.role === 'mt' || currentUserProfile?.role === 'admin') && (
                                    <button 
                                      id={`btn-action-start-${ticket.id}`}
                                      onClick={() => initiateRepair(ticket)} 
                                      className="bg-amber-500 hover:bg-amber-600 text-slate-950 px-3 py-1.5 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all border border-amber-600/10 cursor-pointer shadow-sm shadow-amber-500/15"
                                    >
                                       ดำเนินการซ่อม
                                    </button>
                                  )}
                                  {(canModify || currentUserProfile?.role === 'admin') && (
                                    <div className="flex gap-1.5">
                                      {canModify && (
                                        <button 
                                          id={`btn-action-edit-${ticket.id}`}
                                          onClick={() => openRequesterForm(ticket)} 
                                          className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-md transition-colors cursor-pointer" 
                                          title="แก้ไขข้อมูลใบแจ้งซ่อม"
                                        >
                                          <Edit3 className="w-3.5 h-3.5" />
                                        </button>
                                      )}
                                      <button 
                                        id={`btn-action-delete-${ticket.id}`}
                                        onClick={() => setShowDeleteConfirm(ticket.id)} 
                                        className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors cursor-pointer" 
                                        title="ลบรายการแจ้งซ่อม"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  )}
                                  {ticket.status === 'waiting_confirm' && (currentUserProfile?.role === 'requester' || currentUserProfile?.role === 'admin') && (
                                    <button 
                                      id={`btn-action-confirm-${ticket.id}`}
                                      onClick={() => confirmRepair(ticket)} 
                                      className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer shadow-md shadow-purple-600/10"
                                    >
                                       กดยืนยันใช้งานได้
                                    </button>
                                  )}
                                  {ticket.status === 'completed' && (
                                    <button 
                                      id={`btn-action-history-${ticket.id}`}
                                      onClick={() => setHistoryMachine(ticket.machine)} 
                                      className="text-slate-500 hover:text-slate-800 font-bold text-[9px] bg-slate-50 hover:bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg transition-all cursor-pointer"
                                    >
                                      ประวัติบำรุงรักษา
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={5} className="py-12 text-center text-slate-400 italic text-xs">
                            ไม่พบใบแจ้งซ่อมที่ตรงตามเงื่อนไขการค้นหาในเดือนที่เลือก (No work orders matching current search or selected date)
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
          </div>
        )}

        {currentView === 'form' && (
          <div className="bg-white border border-slate-200/80 rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.04)] p-8 max-w-xl mx-auto animate-fade-in">
            <button 
              id="btn-form-cancel"
              onClick={() => setCurrentView('list')} 
              className="text-slate-400 text-[10px] font-bold mb-5 flex items-center hover:text-slate-800 transition-colors uppercase cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5 mr-1" /> ย้อนกลับ (Back)
            </button>
            
            <div className="flex items-center mb-6 pb-3 border-b border-slate-100">
              {isUpdatingTicket ? <Edit3 className="w-5 h-5 mr-2.5 text-slate-800" /> : <FileText className="w-5 h-5 mr-2.5 text-slate-800" />}
              <h2 className="text-xs font-black uppercase text-slate-800 tracking-wider">
                {isUpdatingTicket ? 'แก้ไขข้อมูลใบแจ้งซ่อมบำรุง' : 'เขียนใบแจ้งซ่อมบำรุง (Maintenance Ticket)'}
              </h2>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  ประเภทงานแจ้งซ่อมบำรุง (Work Type) <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                  {workTypes.map((type) => {
                    const Icon = type.icon;
                    const isSelected = formData.workType === type.id;
                    return (
                      <button
                        key={type.id}
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, workType: type.id }))}
                        className={`flex items-center p-3 border rounded-xl transition-all text-left cursor-pointer ${
                          isSelected 
                          ? 'border-[#162F38] bg-slate-50/50 ring-1 ring-[#162F38]/20' 
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                        }`}
                      >
                        <div className={`p-1.5 mr-2.5 rounded-lg ${isSelected ? 'bg-[#162F38] text-white' : 'bg-slate-100 text-slate-500'}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <span className="text-[10px] font-bold text-slate-800 uppercase">{type.label.split(' ')[0]}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div className="bg-[#FAFDFC] p-3.5 border border-slate-200/80 rounded-xl">
                   <label className="block text-[8px] font-bold text-slate-400 uppercase tracking-wider mb-1">ผู้แจ้งรายการ (Requester)</label>
                   <div className="font-bold text-xs text-slate-900">{formData.requester}</div>
                </div>
                <div>
                  <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">รหัสพนักงาน (Employee ID) <span className="text-red-500">*</span></label>
                  <input 
                    id="input-form-employee-id"
                    type="text" 
                    name="employeeId" 
                    required 
                    value={formData.employeeId} 
                    onChange={handleChange} 
                    placeholder="เช่น MT-4569"
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 focus:border-[#162F38] rounded-lg text-slate-800 text-xs outline-none font-mono shadow-sm" 
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">แผนกผู้ดูแล (Department) <span className="text-red-500">*</span></label>
                  <select 
                    id="select-form-department"
                    name="department" 
                    value={isCustomDept ? 'OTHER' : formData.department} 
                    onChange={handleChange} 
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 focus:border-[#162F38] rounded-lg text-slate-800 text-xs outline-none cursor-pointer shadow-sm"
                  >
                    {defaultDepartments.map(dept => <option className="bg-white" key={dept} value={dept}>{dept}</option>)}
                    <option className="bg-white font-bold" value="OTHER">+ ระบุแผนกอื่นนอกเหนือลิสต์</option>
                  </select>
                  {isCustomDept && (
                    <input 
                      id="input-form-custom-department"
                      type="text" 
                      name="customDepartment" 
                      required 
                      value={formData.customDepartment} 
                      onChange={handleChange} 
                      className="w-full px-3.5 py-2.5 mt-2 bg-white border border-slate-200 rounded-lg text-slate-800 text-xs outline-none focus:border-[#162F38] shadow-sm" 
                      placeholder="กรุณาระบุแผนกของคุณ..." 
                    />
                  )}
                </div>
                <div>
                  <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">ทีมที่รับผิดชอบ (Team) <span className="text-red-500">*</span></label>
                  <select 
                    id="select-form-team"
                    name="team" 
                    required 
                    value={formData.team} 
                    onChange={handleChange} 
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 focus:border-[#162F38] rounded-lg text-slate-800 text-xs outline-none cursor-pointer shadow-sm font-sans"
                  >
                    <option value="" disabled>-- เลือกทีม (Team) --</option>
                    <option value="A">Team A</option>
                    <option value="B">Team B</option>
                    <option value="C">Team C</option>
                    <option value="Office">Team Office</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">ชื่อเครื่องจักร / รหัสเครื่องจักร (Machine ID) <span className="text-red-500">*</span></label>
                  <input 
                    id="input-form-machine"
                    type="text" 
                    name="machine" 
                    required 
                    value={formData.machine} 
                    onChange={handleChange} 
                    placeholder="เช่น CNC-01 / Conveyor Belt Line B"
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 focus:border-[#162F38] rounded-lg text-slate-800 text-xs outline-none font-mono shadow-sm" 
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">รายละเอียดความผิดปกติ / อาการชำรุด (Issue Details) <span className="text-red-500">*</span></label>
                  <textarea 
                    id="textarea-form-issue"
                    name="issue" 
                    required 
                    rows={3} 
                    value={formData.issue} 
                    onChange={handleChange} 
                    placeholder="ระบุอาการชำรุดอย่างละเอียด เช่น มอเตอร์ไม่หมุน มีเสียงดังผิดปกติ..."
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 focus:border-[#162F38] rounded-lg text-slate-800 text-xs outline-none leading-relaxed shadow-sm" 
                  />
                </div>
              </div>
              <button 
                id="btn-form-submit"
                type="submit" 
                className="w-full mt-4 py-2.5 bg-gradient-to-r from-[#0F1E24] to-[#162F38] hover:from-[#132830] hover:to-[#1a3843] text-white font-bold text-[10px] rounded-lg uppercase tracking-wider shadow-md shadow-slate-900/10 transition-colors cursor-pointer"
              >
                <Save className="w-3.5 h-3.5 mr-1.5 inline-block align-middle" /> 
                <span className="align-middle">{isUpdatingTicket ? 'บันทึกรายการแก้ไข' : 'ส่งใบแจ้งซ่อมเข้าระบบ'}</span>
              </button>
            </form>
          </div>
        )}

        {currentView === 'repair' && selectedTicket && (
          <div className="bg-white border border-slate-200/80 rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.04)] overflow-hidden animate-fade-in max-w-xl mx-auto">
            <div className="bg-gradient-to-r from-[#0F1E24] to-[#162F38] p-5 border-b border-slate-800 flex justify-between items-center text-white">
               <div>
                 <button 
                   id="btn-repair-cancel"
                   onClick={() => setCurrentView('list')} 
                   className="text-slate-400 text-[10px] font-bold mb-1 flex items-center hover:text-white transition-colors uppercase cursor-pointer"
                 >
                   <ArrowLeft className="w-3.5 h-3.5 mr-1" /> ย้อนกลับ (Cancel)
                 </button>
                 <h2 className="text-xs font-black uppercase tracking-wider text-white">
                   {isEditing ? 'แก้ไขข้อมูลการซ่อมบำรุง' : 'บันทึกการดำเนินการซ่อมบำรุง (Maintenance Record)'}
                 </h2>
                 <p className="text-[10px] text-slate-300 mt-0.5">เครื่องจักร: <span className="text-amber-400 font-mono font-bold">{selectedTicket.machine}</span></p>
               </div>
            </div>
            
            <div className="p-6 md:p-8">
              <form onSubmit={handleRepairSubmit} className="space-y-4">
                <div className="p-3.5 border border-slate-200 bg-[#FAFDFC] rounded-xl">
                  <label className="block text-[8px] font-bold text-slate-400 uppercase tracking-wider mb-1">ช่างเทคนิคผู้ดูแลรับผิดชอบ (Technician)</label>
                  <input 
                    id="input-repair-technician"
                    type="text" 
                    name="technician" 
                    required 
                    value={repairFormData.technician} 
                    onChange={handleRepairChange} 
                    className="w-full bg-transparent border-none text-slate-800 font-bold text-xs outline-none focus:ring-0 p-0" 
                  />
                </div>

                <div>
                  <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                    ประเภทรายการซ่อม (Work Type Classification) <span className="text-red-500">*</span>
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                    {[
                      { id: 'urgent', label: 'Urgent (งานด่วน)', description: 'กระทบการผลิตโดยตรง', color: 'border-rose-500 bg-rose-50/20 text-rose-700 hover:bg-rose-50/40', activeColor: 'ring-rose-500/30 border-rose-600 bg-rose-50/50 text-rose-700', icon: Zap },
                      { id: 'improvement', label: 'Improvement (ปรับปรุง)', description: 'ปรับปรุงประสิทธิภาพ', color: 'border-sky-500 bg-sky-50/20 text-sky-700 hover:bg-sky-50/40', activeColor: 'ring-sky-500/30 border-sky-600 bg-sky-50/50 text-sky-700', icon: Lightbulb },
                      { id: 'repair', label: 'Repair (ซ่อมทั่วไป)', description: 'ซ่อมบำรุงทั่วไป', color: 'border-amber-500 bg-amber-50/20 text-amber-700 hover:bg-amber-50/40', activeColor: 'ring-amber-500/30 border-amber-600 bg-amber-50/50 text-amber-700', icon: Wrench }
                    ].map((type) => {
                      const Icon = type.icon;
                      const isSelected = repairFormData.workType === type.id;
                      return (
                        <button
                          key={type.id}
                          type="button"
                          onClick={() => setRepairFormData(prev => ({ ...prev, workType: type.id as any }))}
                          className={`flex flex-col items-start p-2.5 border rounded-xl transition-all text-left cursor-pointer ${
                            isSelected 
                            ? `ring-2 ${type.activeColor}` 
                            : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <div className="flex items-center w-full mb-1">
                            <div className={`p-1 mr-2 rounded-lg ${isSelected ? 'bg-current text-white' : 'bg-slate-100 text-slate-500'}`}>
                              <Icon className="w-3.5 h-3.5" />
                            </div>
                            <span className="text-[10px] font-bold uppercase">{type.label}</span>
                          </div>
                          <span className="text-[8px] opacity-70 leading-normal">{type.description}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">วันและเวลาเริ่มดำเนินการ</label>
                    <input 
                      id="input-repair-start-time"
                      type="datetime-local" 
                      name="startTime" 
                      required 
                      value={repairFormData.startTime} 
                      onChange={handleRepairChange} 
                      className="w-full bg-white border border-slate-200 px-3 py-2.5 rounded-lg text-slate-800 text-xs focus:border-[#162F38] outline-none font-mono shadow-sm" 
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">วันและเวลาซ่อมเสร็จสิ้น</label>
                    <input 
                      id="input-repair-end-time"
                      type="datetime-local" 
                      name="endTime" 
                      required 
                      value={repairFormData.endTime} 
                      onChange={handleRepairChange} 
                      className="w-full bg-white border border-slate-200 px-3 py-2.5 rounded-lg text-slate-800 text-xs focus:border-[#162F38] outline-none font-mono shadow-sm" 
                    />
                  </div>
                </div>
                
                <div>
                  <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">เวลาตรวจสอบวิเคราะห์ปัญหา (นาที / Diagnosis Time)</label>
                  <input 
                    id="input-repair-diagnosis-time"
                    type="number" 
                    name="diagnosisTime" 
                    required 
                    value={repairFormData.diagnosisTime} 
                    onChange={handleRepairChange} 
                    placeholder="ระบุเป็นตัวเลขจำนวนนาที เช่น 15, 30"
                    className="w-full bg-white border border-slate-200 px-3 py-2.5 rounded-lg text-slate-800 text-xs focus:border-[#162F38] outline-none font-mono shadow-sm" 
                  />
                </div>
                
                <div>
                  <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">วิเคราะห์สาเหตุหลักที่แท้จริง (Root Cause) <span className="text-red-500">*</span></label>
                  <textarea 
                    id="textarea-repair-cause"
                    name="cause" 
                    required 
                    rows={2} 
                    value={repairFormData.cause} 
                    onChange={handleRepairChange} 
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-lg text-slate-800 text-xs focus:border-[#162F38] outline-none leading-relaxed shadow-sm" 
                    placeholder="กรุณาระบุสาเหตุชำรุดเสียหาย..." 
                  />
                </div>
                
                <div>
                  <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">วิธีการดำเนินการแก้ไขซ่อมแซม (Solution) <span className="text-red-500">*</span></label>
                  <textarea 
                    id="textarea-repair-solution"
                    name="solution" 
                    required 
                    rows={2} 
                    value={repairFormData.solution} 
                    onChange={handleRepairChange} 
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-lg text-slate-800 text-xs focus:border-[#162F38] outline-none leading-relaxed shadow-sm" 
                    placeholder="กรุณาระบุขั้นตอนวิธีทำซ่อม..."
                  />
                </div>
                
                <div>
                  <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">มาตรการป้องกันปัญหาเกิดขึ้นซ้ำ (Prevention Action) <span className="text-red-500">*</span></label>
                  <textarea 
                    id="textarea-repair-prevention"
                    name="prevention" 
                    required 
                    rows={2} 
                    value={repairFormData.prevention} 
                    onChange={handleRepairChange} 
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-lg text-slate-800 text-xs focus:border-[#162F38] outline-none leading-relaxed shadow-sm" 
                    placeholder="ระบุมาตรการหรือแผนตรวจสอบเพื่อป้องกันเกิดซ้ำ..."
                  />
                </div>
                
                <div 
                  id="toggle-repair-parts"
                  className="flex items-center gap-2.5 p-3.5 border border-slate-200 hover:bg-[#FAFDFC] bg-white rounded-xl cursor-pointer transition-colors shadow-sm" 
                  onClick={() => setRepairFormData(prev => ({ ...prev, partsReplaced: !prev.partsReplaced }))}
                >
                  <div className={`w-4 h-4 rounded-md border flex items-center justify-center transition-colors ${repairFormData.partsReplaced ? 'bg-[#162F38] border-[#162F38] text-white' : 'border-slate-300'}`}>
                    {repairFormData.partsReplaced && <CheckCircle className="w-3.5 h-3.5 text-white" />}
                  </div>
                  <span className="font-bold text-slate-700 text-[10px] uppercase tracking-wide">มีการเบิกเปลี่ยนชิ้นส่วนอะไหล่สำหรับการซ่อม (Spare Parts Replaced)</span>
                </div>
                
                {repairFormData.partsReplaced && (
                   <input 
                     id="input-repair-part-number"
                     type="text" 
                     name="partNumber" 
                     required 
                     value={repairFormData.partNumber} 
                     onChange={handleRepairChange} 
                     className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-lg text-slate-800 text-xs focus:border-[#162F38] outline-none transition-colors font-mono shadow-sm" 
                     placeholder="กรุณาระบุ รหัสอะไหล่ / ชื่ออะไหล่..." 
                   />
                )}
                
                <button 
                  id="btn-repair-submit"
                  type="submit" 
                  className="w-full py-2.5 bg-gradient-to-r from-[#0F1E24] to-[#162F38] hover:from-[#132830] hover:to-[#1a3843] text-white font-bold text-[10px] rounded-lg uppercase tracking-wider shadow-md shadow-slate-900/10 transition-colors cursor-pointer"
                >
                  {isEditing ? <Save className="w-3.5 h-3.5 mr-1.5 inline-block align-middle" /> : <CheckCircle className="w-3.5 h-3.5 mr-1.5 inline-block align-middle" />}
                  <span className="align-middle">{isEditing ? 'บันทึกการแก้ไขข้อมูลซ่อม' : 'บันทึกเสร็จสิ้น ส่งให้ผู้แจ้งกดยืนยัน'}</span>
                </button>
              </form>
            </div>
          </div>
        )}

        {historyMachine && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
            <div className="bg-white border border-slate-200 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
              <div className="bg-gradient-to-r from-[#0F1E24] to-[#162F38] text-white p-4.5 border-b border-slate-800 flex justify-between items-center">
                <div className="flex items-center space-x-2.5">
                  <History className="w-4 h-4 text-amber-400" />
                  <h3 className="font-extrabold text-xs uppercase tracking-wider text-white">ประวัติบำรุงรักษา: <span className="text-amber-400 font-mono">{historyMachine}</span></h3>
                </div>
                <button 
                  id="btn-modal-history-close"
                  onClick={() => setHistoryMachine(null)} 
                  className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-5 overflow-y-auto space-y-4">
                {tickets.filter(t => t.machine === historyMachine).length > 0 ? (
                  tickets.filter(t => t.machine === historyMachine).map((h, idx) => {
                    const wt = getWorkTypeStyle(h.workType);
                    return (
                      <div key={idx} className="border border-slate-200/80 rounded-xl p-4.5 bg-slate-50/50 shadow-sm">
                        <div className="flex justify-between items-start md:items-center gap-1.5 mb-2.5 pb-2.5 border-b border-slate-200/60 flex-col md:flex-row">
                          <span className="text-[9px] font-mono font-bold text-slate-500">วันที่: {h.date} | ผู้แจ้ง: {h.requester}</span>
                          <div className="flex items-center space-x-2">
                            {(currentUserProfile?.role === 'mt' || currentUserProfile?.role === 'admin') && h.status !== 'pending' && (
                              <button 
                                id={`btn-modal-history-edit-${h.id}`}
                                onClick={() => { initiateRepair(h, true); setHistoryMachine(null); }} 
                                className="text-[9px] font-bold text-slate-600 hover:text-slate-900 hover:underline transition-colors bg-white px-2.5 py-1 rounded-lg border border-slate-200 cursor-pointer shadow-sm"
                              >
                                แก้ไขข้อมูลซ่อม
                              </button>
                            )}
                            <span className={`text-[8px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${
                              h.status === 'completed' ? 'border-emerald-100 bg-emerald-50 text-emerald-700' : 
                              h.status === 'waiting_confirm' ? 'border-purple-100 bg-purple-50 text-purple-700' :
                              'border-amber-100 bg-amber-50 text-amber-700'
                            }`}>
                              {h.status === 'pending' ? 'รอดำเนินการ' : h.status === 'waiting_confirm' ? 'รอยืนยัน' : 'เสร็จสิ้น'}
                            </span>
                          </div>
                        </div>
                        <p className="font-bold text-xs text-slate-800 flex items-center mb-2.5">
                          <span className={`text-[8px] font-bold px-2 py-0.5 border rounded-md mr-2.5 uppercase ${wt.color}`}>
                            {wt.label}
                          </span>
                          อาการเสีย: <span className="text-slate-600 font-medium ml-1.5">{h.issue}</span>
                        </p>
                        {h.repairDetails && (
                          <div className="bg-white border border-slate-200/60 p-3.5 rounded-xl mt-3 text-[11px] space-y-2 leading-relaxed text-slate-600 shadow-inner">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-slate-500">
                              <div><span className="text-slate-400 font-bold uppercase text-[9px] mr-1">ช่างผู้ซ่อม:</span> {h.repairDetails.technician}</div>
                              <div><span className="text-slate-400 font-bold uppercase text-[9px] mr-1">ระยะเวลาซ่อม:</span> {h.repairDetails.duration}</div>
                              <div><span className="text-slate-400 font-bold uppercase text-[9px] mr-1">เวลาวิเคราะห์จุดชำรุด:</span> {h.repairDetails.diagnosisTime} นาที</div>
                              <div><span className="text-slate-400 font-bold uppercase text-[9px] mr-1">อะไหล่ที่เปลี่ยน:</span> {h.repairDetails.partsReplaced ? `${h.repairDetails.partNumber}` : 'ไม่มี'}</div>
                            </div>
                            <div className="h-px bg-slate-100 my-2"></div>
                            <p><span className="text-slate-500 font-bold uppercase text-[9px] mr-1">วิเคราะห์ต้นเหตุ (Root Cause):</span> {h.repairDetails.cause || '-'}</p>
                            <p><span className="text-slate-500 font-bold uppercase text-[9px] mr-1">วิธีการแก้ไข:</span> {h.repairDetails.solution}</p>
                            <p><span className="text-slate-500 font-bold uppercase text-[9px] mr-1">มาตรการป้องกันเกิดซ้ำ:</span> {h.repairDetails.prevention || '-'}</p>
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center text-slate-400 text-xs italic py-12">ไม่มีประวัติการแจ้งซ่อมของเครื่องจักรนี้</div>
                )}
              </div>
            </div>
          </div>
        )}

        <footer className="text-center py-8 text-slate-400 text-[10px] uppercase font-mono font-bold tracking-widest border-t border-slate-200/60 mt-12">
          Maintenance Management System &copy; 2026 Live Cloud Storage Infrastructure
        </footer>
      </main>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes fadeIn { from { opacity: 0; transform: translateY(2px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-in { animation: fadeIn 0.15s ease-out forwards; }
      `}} />
    </div>
  );
}
