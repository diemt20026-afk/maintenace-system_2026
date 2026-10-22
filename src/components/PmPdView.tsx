import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, doc, setDoc, onSnapshot, deleteDoc, updateDoc 
} from 'firebase/firestore';
import { 
  Settings, Calendar, AlertTriangle, Plus, FileText, BarChart3, Wrench, 
  X, ClipboardCheck, Search, User, Trash2, Edit, ShieldCheck, 
  PlusCircle, MinusCircle, Clock, FileSpreadsheet, AlertCircle, RefreshCw,
  ChevronDown, ChevronUp, Layers, CheckSquare, Square, Check, Sparkles,
  Tag, CornerDownRight, CheckCircle2
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { UserProfile, MaintenancePoint, Machine, MaintenanceLog } from '../types';

interface PmPdViewProps {
  appId: string;
  currentUserProfile: UserProfile | null;
  onToast: (msg: string) => void;
}

export default function PmPdView({ appId, currentUserProfile, onToast }: PmPdViewProps) {
  // App UI State
  const [activeSubTab, setActiveSubTab] = useState<'dashboard' | 'machines' | 'history'>('dashboard');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPMModalOpen, setIsPMModalOpen] = useState(false);
  const [isSubPointModalOpen, setIsSubPointModalOpen] = useState(false);
  const [selectedMachine, setSelectedMachine] = useState<Machine | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [historySearchQuery, setHistorySearchQuery] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [loading, setLoading] = useState(true);

  // Accordion state for machine sub-points in table
  const [expandedMachineIds, setExpandedMachineIds] = useState<Record<string, boolean>>({});

  // Sub-points filter / view mode on dashboard
  const [dashboardViewMode, setDashboardViewMode] = useState<'machines' | 'subpoints'>('subpoints');

  // Data State
  const [machines, setMachines] = useState<Machine[]>([]);
  const [logs, setLogs] = useState<MaintenanceLog[]>([]);

  // Form State for Machine
  const [newMachine, setNewMachine] = useState<Partial<Machine>>({
    id: '', name: '', model: '', installDate: '', status: 'Operational', healthScore: 100,
    lastPM: new Date().toISOString().split('T')[0], nextPM: '', pmInterval: 6, temp: 35, vibration: 0.01,
    subPoints: []
  });

  // State for Sub-Point Management Modal
  const [currentEditingPointIndex, setCurrentEditingPointIndex] = useState<number | null>(null);
  const [pointForm, setPointForm] = useState<Partial<MaintenancePoint>>({
    id: '',
    pointName: '',
    component: 'Cylinder',
    actionRequired: '',
    intervalMonths: 12,
    lastPM: new Date().toISOString().split('T')[0],
    nextPM: '',
    spareParts: '',
    notes: ''
  });

  // Form State for Recording PM
  const [pmRecord, setPmRecord] = useState({
    action: '', 
    spareParts: [{ name: '', quantity: 1 }], 
    technician: '',
    selectedPointIds: [] as string[],
    recordAllMachine: true
  });

  // Real-time Data Sync
  useEffect(() => {
    setLoading(true);
    const machinesCol = collection(db, 'artifacts', appId, 'public', 'data', 'machines');
    const logsCol = collection(db, 'artifacts', appId, 'public', 'data', 'maintenance_logs');

    const unsubMachines = onSnapshot(machinesCol, 
      (snapshot) => {
        const machineList = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            ...data,
            id: doc.id,
            subPoints: Array.isArray(data.subPoints) ? data.subPoints : []
          };
        }) as Machine[];
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

  // Utility to calculate next PM date
  const calculateNextPM = (startDate: string, intervalMonths: number | string) => {
    if (!startDate || !intervalMonths) return '';
    const date = new Date(startDate);
    date.setMonth(date.getMonth() + parseInt(intervalMonths as string));
    return date.toISOString().split('T')[0];
  };

  // Sync nextPM in Machine form when lastPM or pmInterval changes
  useEffect(() => {
    if (newMachine.lastPM && newMachine.pmInterval) {
      const nextDate = calculateNextPM(newMachine.lastPM, newMachine.pmInterval);
      setNewMachine(prev => ({ ...prev, nextPM: nextDate }));
    }
  }, [newMachine.lastPM, newMachine.pmInterval]);

  // Sync nextPM in Sub-Point form when lastPM or intervalMonths changes
  useEffect(() => {
    if (pointForm.lastPM && pointForm.intervalMonths) {
      const nextDate = calculateNextPM(pointForm.lastPM, pointForm.intervalMonths);
      setPointForm(prev => ({ ...prev, nextPM: nextDate }));
    }
  }, [pointForm.lastPM, pointForm.intervalMonths]);

  // Toggle machine row expand
  const toggleMachineExpand = (machineId: string) => {
    setExpandedMachineIds(prev => ({
      ...prev,
      [machineId]: !prev[machineId]
    }));
  };

  // Calculate earliest nextPM for a machine based on its subPoints or master cycle
  const getEffectiveNextPM = (machine: Machine) => {
    if (machine.subPoints && machine.subPoints.length > 0) {
      const dates = machine.subPoints
        .map(p => p.nextPM)
        .filter(Boolean)
        .sort();
      if (dates.length > 0) return dates[0];
    }
    return machine.nextPM;
  };

  // Get status of a specific sub-point
  const getSubPointStatus = (nextPM: string) => {
    if (!nextPM) return { label: 'ไม่มีข้อมูล', color: 'bg-slate-100 text-slate-600', isOverdue: false, isDueSoon: false };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(nextPM);
    target.setHours(0, 0, 0, 0);

    const diffDays = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return { 
        label: `เกินกำหนด ${Math.abs(diffDays)} วัน`, 
        color: 'bg-rose-100 text-rose-700 border-rose-200', 
        isOverdue: true, 
        isDueSoon: false 
      };
    }
    if (diffDays <= 30) {
      return { 
        label: `ครบกำหนดใน ${diffDays} วัน`, 
        color: 'bg-amber-100 text-amber-800 border-amber-200', 
        isOverdue: false, 
        isDueSoon: true 
      };
    }
    return { 
      label: `ปกติ (${nextPM})`, 
      color: 'bg-emerald-50 text-emerald-700 border-emerald-100', 
      isOverdue: false, 
      isDueSoon: false 
    };
  };

  // CRUD Handlers for Machine
  const handleSaveMachine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMachine.id || !newMachine.name || !newMachine.lastPM || !newMachine.pmInterval) return;

    try {
      const machineDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'machines', newMachine.id);
      const updatedNextPM = calculateNextPM(newMachine.lastPM, newMachine.pmInterval);
      
      const payload: Partial<Machine> = { 
        ...newMachine, 
        nextPM: updatedNextPM,
        healthScore: Number(newMachine.healthScore || 100),
        temp: Number(newMachine.temp || 35),
        vibration: Number(newMachine.vibration || 0.01),
        pmInterval: Number(newMachine.pmInterval),
        subPoints: Array.isArray(newMachine.subPoints) ? newMachine.subPoints : [],
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
    if (window.confirm('คุณต้องการลบเครื่องจักรนี้ใช่หรือไม่? ข้อมูลจุดย่อยทั้งหมดจะหายไปถาวร')) {
      try {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'machines', id));
        onToast('ลบเครื่องจักรออกจากฐานข้อมูลเรียบร้อยแล้ว');
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `artifacts/${appId}/public/data/machines/${id}`);
      }
    }
  };

  // Sub-Points Management Modal Open
  const handleOpenSubPointsModal = (machine: Machine) => {
    setSelectedMachine(machine);
    setCurrentEditingPointIndex(null);
    setPointForm({
      id: '',
      pointName: '',
      component: 'Cylinder',
      actionRequired: '',
      intervalMonths: 12,
      lastPM: new Date().toISOString().split('T')[0],
      nextPM: calculateNextPM(new Date().toISOString().split('T')[0], 12),
      spareParts: '',
      notes: ''
    });
    setIsSubPointModalOpen(true);
  };

  // Save or update sub-point in the selected machine
  const handleSaveSubPoint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMachine) return;
    if (!pointForm.pointName || !pointForm.component || !pointForm.intervalMonths || !pointForm.lastPM) {
      onToast('กรุณากรอกข้อมูลจุดย่อยให้ครบถ้วน');
      return;
    }

    const calculatedNextPM = calculateNextPM(pointForm.lastPM, pointForm.intervalMonths);
    const existingPoints = selectedMachine.subPoints || [];
    let updatedPoints: MaintenancePoint[];

    const newPointData: MaintenancePoint = {
      id: pointForm.id || `pt_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      pointName: pointForm.pointName.trim(),
      component: pointForm.component.trim(),
      actionRequired: (pointForm.actionRequired || pointForm.pointName).trim(),
      intervalMonths: Number(pointForm.intervalMonths),
      lastPM: pointForm.lastPM,
      nextPM: calculatedNextPM,
      spareParts: (pointForm.spareParts || '').trim(),
      notes: (pointForm.notes || '').trim()
    };

    if (currentEditingPointIndex !== null && currentEditingPointIndex >= 0) {
      updatedPoints = [...existingPoints];
      updatedPoints[currentEditingPointIndex] = newPointData;
    } else {
      updatedPoints = [...existingPoints, newPointData];
    }

    // Sort sub-points by nextPM
    updatedPoints.sort((a, b) => new Date(a.nextPM).getTime() - new Date(b.nextPM).getTime());

    // Compute effective machine nextPM
    const earliestNextPM = updatedPoints.length > 0 ? updatedPoints[0].nextPM : selectedMachine.nextPM;

    try {
      const machineDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'machines', selectedMachine.id);
      await updateDoc(machineDocRef, {
        subPoints: updatedPoints,
        nextPM: earliestNextPM,
        updatedAt: new Date().toISOString()
      });

      setSelectedMachine({
        ...selectedMachine,
        subPoints: updatedPoints,
        nextPM: earliestNextPM
      });

      onToast(currentEditingPointIndex !== null ? 'แก้ไขจุดย่อยสำเร็จ' : 'เพิ่มจุดย่อยสำเร็จ');
      setCurrentEditingPointIndex(null);
      setPointForm({
        id: '',
        pointName: '',
        component: 'Cylinder',
        actionRequired: '',
        intervalMonths: 12,
        lastPM: new Date().toISOString().split('T')[0],
        nextPM: calculateNextPM(new Date().toISOString().split('T')[0], 12),
        spareParts: '',
        notes: ''
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `artifacts/${appId}/public/data/machines/${selectedMachine.id}`);
    }
  };

  // Delete sub-point
  const handleDeleteSubPoint = async (indexToDelete: number) => {
    if (!selectedMachine) return;
    if (!window.confirm('คุณต้องการลบจุดย่อยนี้ใช่หรือไม่?')) return;

    const existingPoints = selectedMachine.subPoints || [];
    const updatedPoints = existingPoints.filter((_, idx) => idx !== indexToDelete);
    const earliestNextPM = updatedPoints.length > 0 ? updatedPoints[0].nextPM : selectedMachine.nextPM;

    try {
      const machineDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'machines', selectedMachine.id);
      await updateDoc(machineDocRef, {
        subPoints: updatedPoints,
        nextPM: earliestNextPM,
        updatedAt: new Date().toISOString()
      });

      setSelectedMachine({
        ...selectedMachine,
        subPoints: updatedPoints,
        nextPM: earliestNextPM
      });

      if (currentEditingPointIndex === indexToDelete) {
        setCurrentEditingPointIndex(null);
      }
      onToast('ลบจุดย่อยเรียบร้อยแล้ว');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `artifacts/${appId}/public/data/machines/${selectedMachine.id}`);
    }
  };

  // Load sample Cylinder & Motor template points for rapid registration
  const handleLoadSampleTemplate = async (templateType: 'cylinder' | 'motor') => {
    if (!selectedMachine) return;
    const today = new Date().toISOString().split('T')[0];
    let samplePoints: MaintenancePoint[] = [];

    if (templateType === 'cylinder') {
      samplePoints = [
        {
          id: `pt_cyl_oring_${Date.now()}`,
          pointName: 'กระบอกสูบ (Cylinder) - เปลี่ยนชุด O-Ring & ซีลลูกสูบ',
          component: 'Cylinder (กระบอกสูบ)',
          actionRequired: 'ถอดตรวจเช็คและเปลี่ยนชุด O-Ring & Piston Seal',
          intervalMonths: 12, // 1 Year
          lastPM: today,
          nextPM: calculateNextPM(today, 12),
          spareParts: 'ชุด O-Ring ซีลกระบอกสูบ #40 (1 ชุด)',
          notes: 'ตรวจเช็ครอยขีดข่วนบนผิวก้านสูบและทาจาระบีซิลิโคนก่อนประกอบ'
        },
        {
          id: `pt_cyl_oil_${Date.now() + 1}`,
          pointName: 'กระบอกสูบ (Cylinder) - เปลี่ยนถ่ายน้ำมันไฮดรอลิก',
          component: 'Cylinder & Hydraulic Unit',
          actionRequired: 'ถ่ายน้ำมันเก่า ล้างตะกอนก้นถัง และเติมน้ำมันไฮดรอลิกใหม่',
          intervalMonths: 24, // 2 Years
          lastPM: today,
          nextPM: calculateNextPM(today, 24),
          spareParts: 'น้ำมันไฮดรอลิก ISO VG 46 (10 ลิตร), กรองน้ำมันไฮดรอลิก',
          notes: 'ตรวจวัดค่าความหนืดและกรองสิ่งแปลกปลอมก่อนเติม'
        }
      ];
    } else {
      samplePoints = [
        {
          id: `pt_motor_bearing_${Date.now()}`,
          pointName: 'มอเตอร์ขับเคลื่อน - อัดจาระบีลูกปืนหัว-ท้าย',
          component: 'Motor (มอเตอร์)',
          actionRequired: 'อัดจาระบีทนความร้อนสูงเข้าหัวอัด Bearing',
          intervalMonths: 6, // 6 Months
          lastPM: today,
          nextPM: calculateNextPM(today, 6),
          spareParts: 'จาระบีทนความร้อน NLGI-2',
          notes: 'ตรวจวัดอุณหภูมิผิวลูกปืนหลังเดินเครื่อง 15 นาที'
        },
        {
          id: `pt_motor_brush_${Date.now() + 1}`,
          pointName: 'มอเตอร์ขับเคลื่อน - ตรวจสอบความตึงสายพานและแปรงถ่าน',
          component: 'Transmission & Drive',
          actionRequired: 'ตรวจเช็คระยะยุบสายพานและวัดความยาวแปรงถ่าน',
          intervalMonths: 12, // 1 Year
          lastPM: today,
          nextPM: calculateNextPM(today, 12),
          spareParts: 'สายพาน V-Belt เบอร์ B-52',
          notes: 'เปลี่ยนทันทีหากพบรอยแตกงาหรือหย่อนเกิน 10mm'
        }
      ];
    }

    const currentPoints = selectedMachine.subPoints || [];
    const merged = [...currentPoints, ...samplePoints];
    merged.sort((a, b) => new Date(a.nextPM).getTime() - new Date(b.nextPM).getTime());
    const earliestNextPM = merged[0]?.nextPM || selectedMachine.nextPM;

    try {
      const machineDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'machines', selectedMachine.id);
      await updateDoc(machineDocRef, {
        subPoints: merged,
        nextPM: earliestNextPM,
        updatedAt: new Date().toISOString()
      });

      setSelectedMachine({
        ...selectedMachine,
        subPoints: merged,
        nextPM: earliestNextPM
      });

      onToast(`โหลดชุดตัวอย่าง ${templateType === 'cylinder' ? 'กระบอกสูบ (Cylinder: 1 ปี & 2 ปี)' : 'มอเตอร์ (Motor)'} สำเร็จ!`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `artifacts/${appId}/public/data/machines/${selectedMachine.id}`);
    }
  };

  // Open PM Modal with pre-selection of overdue/due points
  const handleOpenPMModal = (machine: Machine, specificPointId?: string) => {
    setSelectedMachine(machine);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let initialSelectedPoints: string[] = [];
    if (specificPointId) {
      initialSelectedPoints = [specificPointId];
    } else if (machine.subPoints && machine.subPoints.length > 0) {
      // Auto-select overdue or due in 30 days
      initialSelectedPoints = machine.subPoints
        .filter(p => {
          if (!p.nextPM) return false;
          const target = new Date(p.nextPM);
          target.setHours(0, 0, 0, 0);
          const diffDays = Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          return diffDays <= 30; // Due soon or overdue
        })
        .map(p => p.id);

      // If none due soon, select all
      if (initialSelectedPoints.length === 0) {
        initialSelectedPoints = machine.subPoints.map(p => p.id);
      }
    }

    setPmRecord({
      action: specificPointId && machine.subPoints 
        ? `ดำเนินการบำรุงรักษาจุด: ${machine.subPoints.find(p => p.id === specificPointId)?.pointName || ''}` 
        : '',
      spareParts: [{ name: '', quantity: 1 }],
      technician: currentUserProfile?.name || '',
      selectedPointIds: initialSelectedPoints,
      recordAllMachine: (!machine.subPoints || machine.subPoints.length === 0)
    });

    setIsPMModalOpen(true);
  };

  // Record PM submission with Sub-points updating
  const handleRecordPM = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMachine) return;
    
    const todayStr = new Date().toISOString().split('T')[0];
    const currentInterval = selectedMachine.pmInterval || 6;
    
    // Check which sub-points were serviced
    let updatedSubPoints = selectedMachine.subPoints ? [...selectedMachine.subPoints] : [];
    const servicedPointsNames: string[] = [];

    if (updatedSubPoints.length > 0 && pmRecord.selectedPointIds.length > 0) {
      updatedSubPoints = updatedSubPoints.map(point => {
        if (pmRecord.selectedPointIds.includes(point.id)) {
          servicedPointsNames.push(`${point.pointName} (${point.intervalMonths}ด.)`);
          const newPointNext = calculateNextPM(todayStr, point.intervalMonths);
          return {
            ...point,
            lastPM: todayStr,
            nextPM: newPointNext
          };
        }
        return point;
      });
      // Sort by nextPM
      updatedSubPoints.sort((a, b) => new Date(a.nextPM).getTime() - new Date(b.nextPM).getTime());
    }

    // Determine machine's new nextPM
    let newMachineNextPM = calculateNextPM(todayStr, currentInterval);
    if (updatedSubPoints.length > 0) {
      newMachineNextPM = updatedSubPoints[0].nextPM;
    }

    const partsString = pmRecord.spareParts
      .filter(p => p.name.trim() !== '')
      .map(p => `${p.name} (x${p.quantity})`)
      .join(', ') || 'ไม่ได้ใช้ spare part';

    const servicedSummary = servicedPointsNames.length > 0 
      ? servicedPointsNames.join(', ') 
      : 'บำรุงรักษาเครื่องจักรภาพรวม';

    const logId = `LOG-${Date.now()}`;
    const newLog: MaintenanceLog = {
      id: logId,
      machineId: selectedMachine.id, 
      type: 'PM', 
      date: todayStr,
      technician: pmRecord.technician || currentUserProfile?.name || 'Technician', 
      status: 'Completed', 
      notes: `${pmRecord.action}${servicedPointsNames.length > 0 ? ` [จุดย่อยที่ทำ: ${servicedSummary}]` : ''}`, 
      parts: partsString,
      pmIntervalAtTime: currentInterval,
      subPointsServiced: servicedSummary
    };

    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'maintenance_logs', logId), newLog);
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'machines', selectedMachine.id), {
        status: 'Operational',
        healthScore: 100,
        lastPM: todayStr,
        nextPM: newMachineNextPM,
        subPoints: updatedSubPoints,
        updatedAt: new Date().toISOString()
      });

      onToast('บันทึกผลการบำรุงรักษา PM สำเร็จ!');
      setIsPMModalOpen(false);
      setPmRecord({ 
        action: '', 
        spareParts: [{ name: '', quantity: 1 }], 
        technician: '',
        selectedPointIds: [],
        recordAllMachine: true
      });
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
      lastPM: new Date().toISOString().split('T')[0], nextPM: '', pmInterval: 6, temp: 35, vibration: 0.01,
      subPoints: []
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
    const headers = ['Date', 'Machine ID', 'Machine Name', 'Type', 'Technician', 'PM Cycle', 'Sub-points Serviced', 'Details', 'Parts'];
    const csvData = filteredLogs.map(log => {
      const machine = machines.find(m => m.id === log.machineId);
      return [
        log.date,
        log.machineId,
        `"${(machine?.name || 'Unknown').replace(/"/g, '""')}"`,
        log.type,
        `"${(log.technician || '').replace(/"/g, '""')}"`,
        log.pmIntervalAtTime ? `${log.pmIntervalAtTime} months` : 'N/A',
        `"${(log.subPointsServiced || '-').replace(/"/g, '""')}"`,
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

  // Flattened list of all sub-points across all machines with parent machine metadata
  const allSubPoints = useMemo(() => {
    const list: Array<MaintenancePoint & { machineId: string; machineName: string; machineModel: string }> = [];
    machines.forEach(m => {
      if (m.subPoints && m.subPoints.length > 0) {
        m.subPoints.forEach(p => {
          list.push({
            ...p,
            machineId: m.id,
            machineName: m.name,
            machineModel: m.model || ''
          });
        });
      }
    });
    return list;
  }, [machines]);

  // Sub-points Overdue
  const subPointsOverdue = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return allSubPoints.filter(p => {
      if (!p.nextPM) return false;
      const target = new Date(p.nextPM);
      target.setHours(0, 0, 0, 0);
      return target < today;
    });
  }, [allSubPoints]);

  // Sub-points Due in 30 days
  const subPointsThisMonth = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return allSubPoints.filter(p => {
      if (!p.nextPM) return false;
      const target = new Date(p.nextPM);
      target.setHours(0, 0, 0, 0);
      const diffTime = target.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays >= 0 && diffDays <= 30; 
    });
  }, [allSubPoints]);

  // Machines Overdue (considering either machine.nextPM or any subPoint overdue)
  const pmOverdue = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return machines.filter(m => {
      // Check if machine has any overdue sub-point
      if (m.subPoints && m.subPoints.length > 0) {
        return m.subPoints.some(p => {
          if (!p.nextPM) return false;
          const target = new Date(p.nextPM);
          target.setHours(0, 0, 0, 0);
          return target < today;
        });
      }
      if (!m.nextPM) return false;
      const target = new Date(m.nextPM);
      target.setHours(0, 0, 0, 0);
      return target < today;
    });
  }, [machines]);

  // Machines Due This Month
  const pmThisMonth = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return machines.filter(m => {
      // Check effective next PM
      const effectiveNext = getEffectiveNextPM(m);
      if (!effectiveNext) return false;
      const target = new Date(effectiveNext);
      target.setHours(0, 0, 0, 0);
      const diffTime = target.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays >= 0 && diffDays <= 30; 
    });
  }, [machines]);

  const filteredMachines = useMemo(() => {
    return machines.filter(m => {
      const searchLower = searchQuery.toLowerCase();
      const matchSearch = 
        m.name.toLowerCase().includes(searchLower) || 
        m.id.toLowerCase().includes(searchLower) || 
        m.model.toLowerCase().includes(searchLower) ||
        (m.subPoints && m.subPoints.some(p => 
          p.pointName.toLowerCase().includes(searchLower) || 
          p.component.toLowerCase().includes(searchLower) ||
          (p.spareParts && p.spareParts.toLowerCase().includes(searchLower))
        ));
      const effectiveNext = getEffectiveNextPM(m);
      const matchMonth = filterMonth ? (effectiveNext?.startsWith(filterMonth) || m.lastPM?.startsWith(filterMonth)) : true;
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
        (log.notes || '').toLowerCase().includes(searchLower) ||
        ((log.subPointsServiced || '').toLowerCase().includes(searchLower));
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
            ตรวจเช็ค วางแผน และบันทึกผลการบำรุงรักษาเครื่องจักรและจุดย่อยแยกตามรอบกำหนดอิสระ (Sub-points PM Cycles)
          </p>
        </div>

        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 self-start sm:self-center">
          {[
            { id: 'dashboard', label: 'สรุปภาพรวม', icon: BarChart3 },
            { id: 'machines', label: 'ฐานข้อมูลเครื่องจักร & จุดย่อย', icon: Wrench },
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-4.5 rounded-2xl shadow-sm border border-slate-200/80 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">สถานะคลาวด์บอร์ด</p>
                    <h4 className="text-sm font-black text-slate-800 flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                      Sync Realtime
                    </h4>
                    <p className="text-[10px] text-slate-500 mt-1">อัปเดตแบบเรียลไทม์กับวิศวกร</p>
                  </div>
                  <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping" />
                </div>

                <div className="bg-white p-4.5 rounded-2xl shadow-sm border border-slate-200/80 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">เครื่องจักรในระบบ</p>
                    <h4 className="text-lg font-black text-slate-800">{machines.length} เครื่อง</h4>
                    <p className="text-[10px] text-indigo-600 font-bold mt-1">
                      ลงทะเบียน {allSubPoints.length} จุดย่อย
                    </p>
                  </div>
                  <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                    <Layers className="w-5 h-5" />
                  </div>
                </div>

                <div className="bg-white p-4.5 rounded-2xl shadow-sm border border-slate-200/80 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">งาน PM ใน 30 วันนี้</p>
                    <h4 className="text-lg font-black text-amber-600">
                      {dashboardViewMode === 'subpoints' ? `${subPointsThisMonth.length} จุดย่อย` : `${pmThisMonth.length} เครื่อง`}
                    </h4>
                    <p className="text-[10px] text-slate-500 mt-1">ครบกำหนดรอบบำรุงรักษา</p>
                  </div>
                  <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl">
                    <Calendar className="w-5 h-5" />
                  </div>
                </div>

                <div className="bg-white p-4.5 rounded-2xl shadow-sm border border-rose-200 flex items-center justify-between bg-rose-50/20">
                  <div>
                    <p className="text-[10px] font-black text-rose-500 uppercase tracking-wider mb-1">เกินกำหนด (Overdue)</p>
                    <h4 className="text-lg font-black text-rose-700">
                      {dashboardViewMode === 'subpoints' ? `${subPointsOverdue.length} จุดย่อย` : `${pmOverdue.length} เครื่อง`}
                    </h4>
                    <p className="text-[10px] text-rose-500 mt-1">ต้องรีบดำเนินการทันที</p>
                  </div>
                  <div className="p-2.5 bg-rose-100 text-rose-600 rounded-xl">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                </div>
              </div>

              {/* View Switcher: Machines vs Sub-Points */}
              <div className="flex items-center justify-between bg-white p-3 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-slate-700">มุมมองตารางเตือน PM:</span>
                  <div className="inline-flex bg-slate-100 p-1 rounded-xl">
                    <button
                      onClick={() => setDashboardViewMode('subpoints')}
                      className={`px-3 py-1 text-xs font-bold rounded-lg cursor-pointer transition-all ${
                        dashboardViewMode === 'subpoints' 
                          ? 'bg-indigo-600 text-white shadow-sm' 
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      🎯 ตามจุดย่อยบำรุงรักษา ({allSubPoints.length} จุด)
                    </button>
                    <button
                      onClick={() => setDashboardViewMode('machines')}
                      className={`px-3 py-1 text-xs font-bold rounded-lg cursor-pointer transition-all ${
                        dashboardViewMode === 'machines' 
                          ? 'bg-indigo-600 text-white shadow-sm' 
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      🏭 ตามเครื่องจักรภาพรวม ({machines.length} เครื่อง)
                    </button>
                  </div>
                </div>

                <p className="hidden md:block text-[11px] text-slate-400">
                  💡 เช่น จุดกระบอกสูบ (Cylinder): เปลี่ยน O-Ring 1 ปี / เปลี่ยนน้ำมัน 2 ปี
                </p>
              </div>

              {/* OVERDUE PM WORK LIST (Red Accent) */}
              <div className="bg-white rounded-2xl shadow-md border border-rose-200 overflow-hidden">
                <div className="px-5 py-3.5 border-b border-rose-100 flex justify-between items-center bg-rose-50/40">
                  <h3 className="font-extrabold text-xs text-rose-800 flex items-center gap-2 uppercase tracking-wider">
                    <AlertCircle size={16} className="text-rose-600 animate-pulse" />
                    รายการเกินกำหนดรอบแผนบำรุงรักษา (Overdue PM)
                  </h3>
                  <span className="bg-rose-600 text-white text-[9px] px-2.5 py-0.5 rounded-full font-black uppercase tracking-widest">
                    {dashboardViewMode === 'subpoints' ? `${subPointsOverdue.length} จุดย่อย` : `${pmOverdue.length} เครื่องจักร`}
                  </span>
                </div>
                <div className="divide-y divide-rose-50 max-h-[340px] overflow-y-auto">
                  {(dashboardViewMode === 'subpoints' ? subPointsOverdue.length === 0 : pmOverdue.length === 0) ? (
                    <div className="p-8 text-center text-slate-400 text-xs italic">
                      👍 ยอดเยี่ยม! ไม่มีรายการหรือจุดย่อยที่เกินกำหนดรอบแผนบำรุงรักษา
                    </div>
                  ) : dashboardViewMode === 'subpoints' ? (
                    subPointsOverdue.map(p => {
                      const parentMachine = machines.find(m => m.id === p.machineId);
                      return (
                        <div key={`${p.machineId}_${p.id}`} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-rose-50/15 transition-colors">
                          <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 flex flex-col items-center justify-center font-mono font-black text-rose-600 text-[10px] shrink-0">
                              <span>{p.machineId}</span>
                              <span className="text-[8px] text-rose-400 font-normal">{p.intervalMonths}ด.</span>
                            </div>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-black text-slate-800 text-xs">{p.pointName}</span>
                                <span className="bg-slate-100 text-slate-600 text-[9px] px-2 py-0.5 rounded font-bold">
                                  {p.component}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500 mt-0.5">
                                เครื่อง: <strong className="text-slate-700">{p.machineName}</strong> ({p.machineId})
                              </p>
                              <p className="text-[10px] text-rose-600 font-bold uppercase tracking-tight mt-0.5 flex items-center gap-1.5">
                                <span>⚠️ เกินกำหนดตั้งแต่วันที่: {new Date(p.nextPM).toLocaleDateString('th-TH')}</span>
                                <span>• รอบบำรุงรักษา: {p.intervalMonths} เดือน ({p.intervalMonths >= 12 ? `${p.intervalMonths / 12} ปี` : ''})</span>
                              </p>
                              {p.spareParts && (
                                <p className="text-[10px] text-slate-400 mt-0.5">
                                  🔧 อะไหล่ที่ต้องใช้: <span className="text-slate-600 font-semibold">{p.spareParts}</span>
                                </p>
                              )}
                            </div>
                          </div>
                          {parentMachine && (
                            <button 
                              onClick={() => handleOpenPMModal(parentMachine, p.id)} 
                              className="bg-rose-600 text-white px-3.5 py-1.5 rounded-lg font-black text-2xs hover:bg-rose-700 transition-colors shadow-sm self-start sm:self-center uppercase tracking-wider cursor-pointer shrink-0"
                            >
                              บันทึก PM จุดนี้
                            </button>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    pmOverdue.map(m => {
                      const effectiveNext = getEffectiveNextPM(m);
                      return (
                        <div key={m.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-rose-50/10 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center font-mono font-black text-rose-600 text-xs">
                              {m.id}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-bold text-slate-800 text-xs">{m.name}</p>
                                {m.subPoints && m.subPoints.length > 0 && (
                                  <span className="bg-indigo-50 text-indigo-700 border border-indigo-100 text-[9px] px-1.5 py-0.5 rounded font-bold">
                                    {m.subPoints.length} จุดย่อย
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] text-rose-500 font-bold uppercase tracking-tight mt-0.5">
                                เกินกำหนดตั้งแต่วันที่: {new Date(effectiveNext).toLocaleDateString('th-TH')} (รอบ {m.pmInterval} ด.)
                              </p>
                            </div>
                          </div>
                          <button 
                            onClick={() => handleOpenPMModal(m)} 
                            className="bg-rose-600 text-white px-3.5 py-1.5 rounded-lg font-black text-2xs hover:bg-rose-700 transition-colors shadow-sm self-start sm:self-center uppercase tracking-wider cursor-pointer"
                          >
                            บันทึก PM ทันที
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* THIS MONTH PM WORK LIST */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-100 flex justify-between items-center bg-indigo-50/20">
                  <h3 className="font-extrabold text-xs text-slate-800 flex items-center gap-2 uppercase tracking-wider">
                    <Calendar size={15} className="text-indigo-600" />
                    แผนงาน PM ที่ครบกำหนดใน 30 วันนี้ (This Month PM)
                  </h3>
                  <span className="bg-indigo-100 text-indigo-800 text-[9px] px-2 py-0.5 rounded-full font-bold">
                    {dashboardViewMode === 'subpoints' ? `${subPointsThisMonth.length} จุดย่อย` : `${pmThisMonth.length} เครื่อง`}
                  </span>
                </div>
                <div className="divide-y divide-slate-100 max-h-[340px] overflow-y-auto">
                  {(dashboardViewMode === 'subpoints' ? subPointsThisMonth.length === 0 : pmThisMonth.length === 0) ? (
                    <div className="p-8 text-center text-slate-400 text-xs italic">
                      ไม่มีรายการบำรุงรักษาที่ต้องทำภายในช่วง 30 วันนี้
                    </div>
                  ) : dashboardViewMode === 'subpoints' ? (
                    subPointsThisMonth.map(p => {
                      const parentMachine = machines.find(m => m.id === p.machineId);
                      return (
                        <div key={`${p.machineId}_${p.id}`} className="p-4 flex items-center justify-between gap-3 hover:bg-slate-50 transition-colors">
                          <div className="flex items-start gap-3">
                            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 flex flex-col items-center justify-center font-mono font-bold text-[10px] border border-amber-200 shrink-0">
                              <span>{p.machineId}</span>
                              <span className="text-[8px] text-amber-500 font-normal">{p.intervalMonths}ด.</span>
                            </div>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-slate-800 text-xs">{p.pointName}</span>
                                <span className="bg-slate-100 text-slate-600 text-[9px] px-1.5 py-0.5 rounded font-bold">
                                  {p.component}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500 mt-0.5">
                                เครื่อง: <strong className="text-slate-700">{p.machineName}</strong>
                              </p>
                              <p className="text-[10px] text-amber-600 font-bold mt-0.5">
                                ครบกำหนด: {new Date(p.nextPM).toLocaleDateString('th-TH')} (รอบ {p.intervalMonths} เดือน)
                              </p>
                              {p.spareParts && (
                                <p className="text-[10px] text-slate-400 mt-0.5">
                                  🔧 อะไหล่: <span className="text-slate-600">{p.spareParts}</span>
                                </p>
                              )}
                            </div>
                          </div>
                          {parentMachine && (
                            <button 
                              onClick={() => handleOpenPMModal(parentMachine, p.id)} 
                              className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg font-bold text-2xs transition-colors cursor-pointer shrink-0"
                            >
                              บันทึก PM
                            </button>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    pmThisMonth.map(m => {
                      const effectiveNext = getEffectiveNextPM(m);
                      return (
                        <div key={m.id} className="p-4 flex items-center justify-between gap-2 hover:bg-slate-50 transition-colors">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center font-mono font-bold text-2xs border border-indigo-100">
                              {m.id.substring(0, 5)}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-bold text-slate-700 text-xs">{m.name}</p>
                                {m.subPoints && m.subPoints.length > 0 && (
                                  <span className="bg-indigo-50 text-indigo-700 text-[9px] px-1.5 py-0.5 rounded font-bold">
                                    {m.subPoints.length} จุดย่อย
                                  </span>
                                )}
                              </div>
                              <p className="text-[9px] text-slate-400 font-semibold uppercase mt-0.5">
                                ครบกำหนด: {effectiveNext} (รอบ {m.pmInterval} ด.)
                              </p>
                            </div>
                          </div>
                          <button 
                            onClick={() => handleOpenPMModal(m)} 
                            className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg font-bold text-2xs transition-colors cursor-pointer"
                          >
                            บันทึก PM
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: MACHINE REGISTRY & SUB-POINTS CRUD */}
          {activeSubTab === 'machines' && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden animate-fade-in">
              {/* Table Action Bar */}
              <div className="p-5 border-b border-slate-100 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-slate-50/40">
                <div>
                  <h3 className="text-sm font-black text-slate-800">ฐานข้อมูลทะเบียนเครื่องจักร & รายละเอียดย่อย (Sub-points PM)</h3>
                  <p className="text-slate-500 text-[10px] mt-0.5">
                    กำหนดจุดย่อยที่มีรอบบำรุงรักษาต่างกัน (เช่น Cylinder เปลี่ยน O-ring 1 ปี / เปลี่ยนน้ำมัน 2 ปี)
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                  <div className="relative flex-1 lg:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                    <input 
                      type="text" 
                      placeholder="ค้นหาชื่อ, รหัส ID, จุดย่อย หรืออะไหล่..." 
                      value={searchQuery} 
                      onChange={(e) => setSearchQuery(e.target.value)} 
                      className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-xs bg-white" 
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

              {/* Responsive Table with Sub-points Accordion */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/70 border-b border-slate-100 text-slate-500 text-[9px] uppercase tracking-widest font-black">
                      <th className="px-5 py-4 w-10 text-center">จุดย่อย</th>
                      <th className="px-5 py-4">ข้อมูลหลักครุภัณฑ์ (Machine ID)</th>
                      <th className="px-5 py-4">รุ่น/ซีรีส์ (Model Specification)</th>
                      <th className="px-5 py-4 text-center">จุดย่อยที่ลงทะเบียน</th>
                      <th className="px-5 py-4 text-center">วันที่ทำ PM ล่าสุด</th>
                      <th className="px-5 py-4 text-center">แผนกำหนด PM ถัดไป</th>
                      <th className="px-5 py-4 text-right">การจัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredMachines.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center py-16 text-slate-400 italic">
                          ❌ ไม่พบข้อมูลเครื่องจักรที่ค้นหาในระบบ
                        </td>
                      </tr>
                    ) : (
                      filteredMachines.map((machine) => {
                        const effectiveNext = getEffectiveNextPM(machine);
                        const isExpanded = !!expandedMachineIds[machine.id];
                        const subPointsCount = machine.subPoints?.length || 0;
                        const hasOverdueSubPoint = machine.subPoints?.some(p => {
                          if (!p.nextPM) return false;
                          const t = new Date(p.nextPM);
                          t.setHours(0, 0, 0, 0);
                          return t < new Date();
                        });

                        return (
                          <React.Fragment key={machine.id}>
                            <tr className={`hover:bg-slate-50/60 transition-colors ${isExpanded ? 'bg-indigo-50/20' : ''}`}>
                              {/* Accordion Toggle Button */}
                              <td className="px-5 py-4 text-center">
                                <button
                                  onClick={() => toggleMachineExpand(machine.id)}
                                  className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                                    isExpanded 
                                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' 
                                      : 'bg-white text-slate-400 hover:text-indigo-600 hover:border-indigo-200 border-slate-200'
                                  }`}
                                  title={isExpanded ? 'ย่อรายละเอียดจุดย่อย' : 'ดูรายละเอียดจุดย่อย PM ทั้งหมด'}
                                >
                                  {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                </button>
                              </td>

                              <td className="px-5 py-4 font-semibold">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-slate-800 text-xs">{machine.name}</span>
                                  {hasOverdueSubPoint && (
                                    <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" title="มีจุดย่อยเกินกำหนด PM" />
                                  )}
                                </div>
                                <div className="text-[10px] text-slate-400 font-mono mt-0.5">{machine.id}</div>
                              </td>

                              <td className="px-5 py-4 text-slate-500 font-mono">
                                {machine.model || '-'}
                              </td>

                              {/* Sub-Points Count & Quick Manager Button */}
                              <td className="px-5 py-4 text-center">
                                <button
                                  onClick={() => handleOpenSubPointsModal(machine)}
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                                    subPointsCount > 0
                                      ? hasOverdueSubPoint
                                        ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                                        : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
                                      : 'bg-slate-100 text-slate-500 border-dashed border-slate-300 hover:border-indigo-300 hover:text-indigo-600'
                                  }`}
                                  title="คลิกเพื่อจัดการจุดย่อย PM ของเครื่องนี้"
                                >
                                  <Layers size={13} />
                                  <span>{subPointsCount > 0 ? `${subPointsCount} จุดย่อย` : '+ เพิ่มจุดย่อย'}</span>
                                </button>
                              </td>

                              <td className="px-5 py-4 text-center font-mono font-medium text-slate-600">
                                {machine.lastPM ? new Date(machine.lastPM).toLocaleDateString('th-TH') : '-'}
                              </td>

                              <td className="px-5 py-4 text-center font-mono font-bold">
                                <span className={`text-xs px-2 py-0.5 rounded ${
                                  new Date(effectiveNext).getTime() < new Date().setHours(0,0,0,0)
                                    ? 'text-rose-600 bg-rose-50 border border-rose-100'
                                    : 'text-slate-700 bg-slate-50 border border-slate-100'
                                }`}>
                                  {effectiveNext ? new Date(effectiveNext).toLocaleDateString('th-TH') : '-'}
                                </span>
                              </td>

                              <td className="px-5 py-4 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  <button 
                                    onClick={() => handleOpenPMModal(machine)} 
                                    className="bg-indigo-50 hover:bg-indigo-600 hover:text-white text-indigo-600 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer border border-indigo-100 text-[11px] font-bold flex items-center gap-1" 
                                    title="บันทึกผล PM"
                                  >
                                    <ClipboardCheck size={14} />
                                    <span>บันทึก PM</span>
                                  </button>
                                  
                                  {currentUserProfile?.role === 'admin' && (
                                    <>
                                      <button 
                                        onClick={() => handleEditMachine(machine)} 
                                        className="text-slate-400 p-1.5 hover:bg-slate-100 hover:text-slate-700 rounded-lg transition-colors cursor-pointer" 
                                        title="แก้ไขข้อมูลหลัก"
                                      >
                                        <Edit size={15} />
                                      </button>
                                      <button 
                                        onClick={() => handleDeleteMachine(machine.id)} 
                                        className="text-rose-400 p-1.5 hover:bg-rose-50 hover:text-rose-600 rounded-lg transition-colors cursor-pointer" 
                                        title="ลบข้อมูล"
                                      >
                                        <Trash2 size={15} />
                                      </button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>

                            {/* EXPANDED SUB-POINTS ACCORDION ROW */}
                            {isExpanded && (
                              <tr className="bg-slate-50/70 border-b border-indigo-100">
                                <td colSpan={7} className="p-4 sm:px-8 sm:py-5">
                                  <div className="bg-white rounded-2xl p-4 border border-indigo-100 shadow-sm space-y-3">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                                      <div className="flex items-center gap-2">
                                        <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
                                          <Layers size={16} />
                                        </div>
                                        <div>
                                          <h4 className="font-black text-slate-800 text-xs flex items-center gap-2">
                                            รายการจุดย่อยบำรุงรักษาเชิงป้องกัน (Sub-points PM Checklist)
                                            <span className="text-[10px] text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full font-bold">
                                              {subPointsCount} จุด
                                            </span>
                                          </h4>
                                          <p className="text-[10px] text-slate-400">
                                            เครื่อง {machine.name} ({machine.id}) • แต่ละจุดมีวงรอบและชิ้นส่วนอะไหล่เฉพาะตัว
                                          </p>
                                        </div>
                                      </div>

                                      <div className="flex items-center gap-2">
                                        <button
                                          onClick={() => handleOpenSubPointsModal(machine)}
                                          className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-xl text-2xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-sm"
                                        >
                                          <Plus size={13} />
                                          <span>เพิ่ม / จัดการจุดย่อย</span>
                                        </button>
                                      </div>
                                    </div>

                                    {/* Sub-points List */}
                                    {subPointsCount === 0 ? (
                                      <div className="py-6 text-center text-slate-400 text-xs bg-slate-50/50 rounded-xl border border-dashed border-slate-200 flex flex-col items-center justify-center gap-2">
                                        <p>ยังไม่มีการลงทะเบียนจุดย่อยสำหรับเครื่องจักรนี้</p>
                                        <div className="flex items-center gap-2">
                                          <button
                                            onClick={() => handleOpenSubPointsModal(machine)}
                                            className="text-indigo-600 font-bold hover:underline text-xs flex items-center gap-1"
                                          >
                                            <PlusCircle size={14} /> ลงทะเบียนจุดย่อยแรก
                                          </button>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="divide-y divide-slate-100">
                                        {machine.subPoints?.map((point, pIndex) => {
                                          const pStatus = getSubPointStatus(point.nextPM);
                                          return (
                                            <div key={point.id || pIndex} className="py-3 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-slate-50/50 px-2 rounded-lg transition-colors">
                                              <div className="flex items-start gap-3">
                                                <div className="w-6 h-6 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center text-[10px] font-black shrink-0 mt-0.5">
                                                  {pIndex + 1}
                                                </div>
                                                <div>
                                                  <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="font-black text-slate-800 text-xs">{point.pointName}</span>
                                                    <span className="bg-slate-100 text-slate-600 text-[9px] px-2 py-0.5 rounded font-bold">
                                                      {point.component}
                                                    </span>
                                                    <span className={`text-[9px] px-2 py-0.5 rounded border font-bold ${pStatus.color}`}>
                                                      {pStatus.label}
                                                    </span>
                                                  </div>

                                                  <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-slate-400 font-medium">
                                                    <span>รอบกำหนด: <strong className="text-slate-700">{point.intervalMonths} เดือน ({point.intervalMonths >= 12 ? `${point.intervalMonths / 12} ปี` : ''})</strong></span>
                                                    <span>ทำล่าสุด: <strong className="text-slate-600">{point.lastPM ? new Date(point.lastPM).toLocaleDateString('th-TH') : '-'}</strong></span>
                                                    <span>ครบถัดไป: <strong className="text-slate-800 font-mono">{point.nextPM ? new Date(point.nextPM).toLocaleDateString('th-TH') : '-'}</strong></span>
                                                  </div>

                                                  {point.spareParts && (
                                                    <div className="mt-1 text-[10px] text-slate-500 flex items-center gap-1">
                                                      <span className="text-indigo-600 font-bold">🔧 อะไหล่สำรอง:</span>
                                                      <span>{point.spareParts}</span>
                                                    </div>
                                                  )}

                                                  {point.notes && (
                                                    <div className="mt-0.5 text-[10px] text-slate-400 italic">
                                                      📝 {point.notes}
                                                    </div>
                                                  )}
                                                </div>
                                              </div>

                                              <div className="flex items-center gap-2 self-end md:self-center">
                                                <button
                                                  onClick={() => handleOpenPMModal(machine, point.id)}
                                                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded-lg text-2xs font-bold transition-all cursor-pointer shadow-sm flex items-center gap-1"
                                                  title="บันทึกผล PM เฉพาะจุดย่อยนี้"
                                                >
                                                  <ClipboardCheck size={13} />
                                                  <span>บันทึก PM จุดนี้</span>
                                                </button>
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })
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
                  <p className="text-slate-500 text-[10px] mt-0.5">รวมรายการปฏิบัติงานซ่อมบำรุง จุดย่อยที่ทำ การเปลี่ยน Spare Parts และผู้ปฏิบัติการ</p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
                  <div className="relative flex-1 md:w-56">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5" />
                    <input 
                      type="text" 
                      placeholder="ค้นหาเครื่องจักร, จุดย่อย, ช่างเทคนิค..." 
                      value={historySearchQuery} 
                      onChange={(e) => setHistorySearchQuery(e.target.value)} 
                      className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-xs bg-white" 
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

                          {log.subPointsServiced && (
                            <div className="mt-2 bg-indigo-50/50 border border-indigo-100 rounded-lg p-2 text-xs flex items-start gap-2">
                              <Layers size={14} className="text-indigo-600 shrink-0 mt-0.5" />
                              <div>
                                <span className="font-bold text-indigo-900">จุดย่อยที่บำรุงรักษา: </span>
                                <span className="text-indigo-700">{log.subPointsServiced}</span>
                              </div>
                            </div>
                          )}

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

      {/* MODAL: SUB-POINTS MANAGEMENT & REGISTRATION (ลงทะเบียนรายละเอียดย่อยของเครื่องจักร) */}
      {isSubPointModalOpen && selectedMachine && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl my-8 overflow-hidden animate-zoom-in text-xs max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="px-6 py-4.5 border-b border-slate-100 flex justify-between items-center bg-indigo-50/40 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-600 text-white rounded-xl shadow-sm">
                  <Layers size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-800">
                    จัดการรายละเอียดย่อยของเครื่องจักร (Sub-points PM Registration)
                  </h3>
                  <p className="text-[10px] text-slate-500 font-bold mt-0.5">
                    เครื่องจักร: <span className="text-indigo-600 font-extrabold">{selectedMachine.name}</span> ({selectedMachine.id}) • รุ่น: {selectedMachine.model || '-'}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setIsSubPointModalOpen(false)} 
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg cursor-pointer transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {/* Quick Template Presets for User */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles size={13} className="text-amber-500" />
                    ปุ่มลัดโหลดตัวอย่างจุดย่อยตามมาตรฐาน (Quick Preset Templates):
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleLoadSampleTemplate('cylinder')}
                    className="bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 text-slate-700 hover:text-indigo-700 px-3 py-1.5 rounded-xl text-2xs font-bold transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>🎯 กระบอกสูบ (Cylinder): O-ring 1 ปี & น้ำมัน 2 ปี</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLoadSampleTemplate('motor')}
                    className="bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 text-slate-700 hover:text-indigo-700 px-3 py-1.5 rounded-xl text-2xs font-bold transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>⚡ มอเตอร์ขับเคลื่อน: อัดจาระบี 6 เดือน & สายพาน 1 ปี</span>
                  </button>
                </div>
              </div>

              {/* Existing Sub-Points Table / List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-black text-slate-800 text-xs flex items-center gap-1.5 uppercase tracking-wider">
                    <CheckSquare size={15} className="text-indigo-600" />
                    รายการจุดย่อยที่ลงทะเบียนแล้ว ({selectedMachine.subPoints?.length || 0} รายการ)
                  </h4>
                  {currentEditingPointIndex !== null && (
                    <button
                      type="button"
                      onClick={() => {
                        setCurrentEditingPointIndex(null);
                        setPointForm({
                          id: '',
                          pointName: '',
                          component: 'Cylinder',
                          actionRequired: '',
                          intervalMonths: 12,
                          lastPM: new Date().toISOString().split('T')[0],
                          nextPM: calculateNextPM(new Date().toISOString().split('T')[0], 12),
                          spareParts: '',
                          notes: ''
                        });
                      }}
                      className="text-xs text-rose-500 font-bold hover:underline"
                    >
                      ยกเลิกโหมดแก้ไข
                    </button>
                  )}
                </div>

                {(!selectedMachine.subPoints || selectedMachine.subPoints.length === 0) ? (
                  <div className="p-6 text-center text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                    <p className="font-medium">เครื่องจักรนี้ยังไม่มีการลงทะเบียนจุดย่อย</p>
                    <p className="text-[10px] mt-1 text-slate-400">กรอกแบบฟอร์มด้านล่าง หรือกดปุ่มโหลดตัวอย่างด้านบนเพื่อเริ่มลงทะเบียน</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-2xs">
                    {selectedMachine.subPoints.map((point, index) => {
                      const pStatus = getSubPointStatus(point.nextPM);
                      const isCurrentlyEditing = currentEditingPointIndex === index;
                      return (
                        <div key={point.id || index} className={`p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                          isCurrentlyEditing ? 'bg-indigo-50/40 border-l-4 border-l-indigo-600' : 'hover:bg-slate-50'
                        }`}>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-extrabold text-slate-800 text-xs">{point.pointName}</span>
                              <span className="bg-slate-100 text-slate-600 text-[9px] px-2 py-0.5 rounded font-bold">
                                {point.component}
                              </span>
                              <span className={`text-[9px] px-2 py-0.5 rounded border font-bold ${pStatus.color}`}>
                                {pStatus.label}
                              </span>
                            </div>

                            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-slate-500 font-medium">
                              <span>รอบกำหนด: <strong className="text-indigo-600 font-bold">{point.intervalMonths} เดือน ({point.intervalMonths >= 12 ? `${point.intervalMonths / 12} ปี` : ''})</strong></span>
                              <span>ทำล่าสุด: <strong>{point.lastPM ? new Date(point.lastPM).toLocaleDateString('th-TH') : '-'}</strong></span>
                              <span>ครบกำหนดถัดไป: <strong className="font-mono text-slate-700">{point.nextPM ? new Date(point.nextPM).toLocaleDateString('th-TH') : '-'}</strong></span>
                            </div>

                            {point.spareParts && (
                              <p className="text-[10px] text-slate-500 mt-0.5">
                                <span className="font-bold text-slate-600">อะไหล่:</span> {point.spareParts}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                            <button
                              type="button"
                              onClick={() => {
                                setCurrentEditingPointIndex(index);
                                setPointForm(point);
                              }}
                              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                              title="แก้ไขจุดย่อยนี้"
                            >
                              <Edit size={15} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteSubPoint(index)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              title="ลบจุดย่อยนี้"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Form: Add or Edit Sub-Point */}
              <div className="bg-slate-50/70 border border-slate-200 rounded-2xl p-5 space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-200/80 pb-2.5">
                  <PlusCircle size={16} className="text-indigo-600" />
                  <h4 className="font-extrabold text-slate-800 text-xs">
                    {currentEditingPointIndex !== null ? '🛠️ แก้ไขข้อมูลจุดย่อย' : '➕ ลงทะเบียนจุดย่อยใหม่สำหรับเครื่องนี้'}
                  </h4>
                </div>

                <form onSubmit={handleSaveSubPoint} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                        ชื่อจุดบำรุงรักษา / ชิ้นส่วนย่อย <span className="text-rose-500">*</span>
                      </label>
                      <input 
                        required 
                        type="text" 
                        placeholder="เช่น กระบอกสูบ - เปลี่ยน O-ring, เปลี่ยนน้ำมัน"
                        className="w-full px-3 py-2 border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg outline-none text-xs font-semibold bg-white" 
                        value={pointForm.pointName || ''} 
                        onChange={(e) => setPointForm({...pointForm, pointName: e.target.value})} 
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                        ชิ้นส่วน / ระบบหลัก (Component Group) <span className="text-rose-500">*</span>
                      </label>
                      <input 
                        required 
                        type="text" 
                        placeholder="เช่น Cylinder, Motor, Hydraulic, Belt, Filter"
                        className="w-full px-3 py-2 border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg outline-none text-xs bg-white" 
                        value={pointForm.component || ''} 
                        onChange={(e) => setPointForm({...pointForm, component: e.target.value})} 
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-1 sm:col-span-1">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                        รอบกำหนด PM (เดือน) <span className="text-rose-500">*</span>
                      </label>
                      <input 
                        required 
                        type="number" 
                        min="1" 
                        max="120"
                        placeholder="เช่น 12 หรือ 24"
                        className="w-full px-3 py-2 border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg outline-none text-xs font-bold font-mono bg-white" 
                        value={pointForm.intervalMonths || ''} 
                        onChange={(e) => setPointForm({...pointForm, intervalMonths: Number(e.target.value)})} 
                      />
                      {/* Interval Quick Presets */}
                      <div className="flex flex-wrap gap-1 pt-1">
                        {[
                          { m: 3, label: '3ด.' },
                          { m: 6, label: '6ด.' },
                          { m: 12, label: '1 ปี' },
                          { m: 24, label: '2 ปี' },
                          { m: 36, label: '3 ปี' }
                        ].map(preset => (
                          <button
                            key={preset.m}
                            type="button"
                            onClick={() => setPointForm({...pointForm, intervalMonths: preset.m})}
                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition-all cursor-pointer ${
                              pointForm.intervalMonths === preset.m
                                ? 'bg-indigo-600 text-white'
                                : 'bg-slate-200/80 text-slate-600 hover:bg-slate-300'
                            }`}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1 sm:col-span-1">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                        วันที่ทำ PM ล่าสุด (Last PM)
                      </label>
                      <input 
                        required 
                        type="date" 
                        className="w-full px-3 py-2 border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg outline-none text-xs bg-white" 
                        value={pointForm.lastPM || ''} 
                        onChange={(e) => setPointForm({...pointForm, lastPM: e.target.value})} 
                      />
                    </div>

                    <div className="space-y-1 sm:col-span-1">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                        ครบกำหนดรอบถัดไป (Next PM)
                      </label>
                      <input 
                        type="date" 
                        className="w-full px-3 py-2 border border-slate-200 bg-slate-100 text-slate-700 rounded-lg outline-none text-xs font-mono font-bold" 
                        value={pointForm.nextPM || ''} 
                        onChange={(e) => setPointForm({...pointForm, nextPM: e.target.value})} 
                      />
                      <span className="text-[9px] text-slate-400">คำนวณอัตโนมัติจากรอบกำหนด</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                        อะไหล่สำรองที่เกี่ยวข้อง (Spare Parts)
                      </label>
                      <input 
                        type="text" 
                        placeholder="เช่น ชุดซีล O-Ring #32 (2 ชิ้น), น้ำมัน ISO VG 46 (5L)"
                        className="w-full px-3 py-2 border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg outline-none text-xs bg-white" 
                        value={pointForm.spareParts || ''} 
                        onChange={(e) => setPointForm({...pointForm, spareParts: e.target.value})} 
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                        ข้อควรระวัง / สเปกเพิ่มเติม (Notes)
                      </label>
                      <input 
                        type="text" 
                        placeholder="เช่น ห้ามใช้น้ำมันผิดเบอร์, ทาจาระบีบางๆ ก่อนขันน็อต"
                        className="w-full px-3 py-2 border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg outline-none text-xs bg-white" 
                        value={pointForm.notes || ''} 
                        onChange={(e) => setPointForm({...pointForm, notes: e.target.value})} 
                      />
                    </div>
                  </div>

                  <div className="pt-2 flex justify-end gap-2">
                    <button
                      type="submit"
                      className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md cursor-pointer flex items-center gap-1.5"
                    >
                      <Check size={14} />
                      <span>{currentEditingPointIndex !== null ? 'บันทึกการแก้ไขจุดย่อย' : 'บันทึกจุดย่อยลงระบบ'}</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50/70 flex justify-end">
              <button
                type="button"
                onClick={() => setIsSubPointModalOpen(false)}
                className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-5 py-2 rounded-xl font-bold transition-colors cursor-pointer text-xs"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
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
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">รอบทำ PM มาตรฐาน (ทุกๆ กี่เดือน)</label>
                  <input 
                    required 
                    type="number" 
                    min="1" 
                    max="120"
                    placeholder="เช่น 6 หรือ 12"
                    className="w-full px-3 py-2 border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg outline-none text-xs font-bold" 
                    value={newMachine.pmInterval || ''} 
                    onChange={(e) => setNewMachine({...newMachine, pmInterval: Number(e.target.value)})} 
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

              <p className="text-[10px] text-slate-400 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                💡 หลังจากบันทึกเครื่องจักรแล้ว ท่านสามารถกดปุ่ม <strong>"จัดการจุดย่อย"</strong> เพื่อลงทะเบียนชิ้นส่วนย่อย เช่น กระบอกสูบ (O-ring 1 ปี, น้ำมัน 2 ปี) ได้อย่างอิสระ
              </p>

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

      {/* RECORD PM ACTION MODAL (Supports Sub-Points Selection) */}
      {isPMModalOpen && selectedMachine && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl my-8 overflow-hidden animate-zoom-in text-xs max-h-[92vh] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-indigo-50/40 shrink-0">
              <div>
                <h3 className="text-sm font-black text-slate-800">📝 บันทึกรายงานแผนปฏิบัติการ PM</h3>
                <p className="text-[10px] text-slate-500 font-bold mt-0.5">
                  เครื่องจักร: {selectedMachine.name} ({selectedMachine.id}) • รอบมาตรฐาน {selectedMachine.pmInterval} เดือน
                </p>
              </div>
              <button onClick={() => setIsPMModalOpen(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleRecordPM} className="p-6 space-y-5 overflow-y-auto flex-1">
              {/* Sub-Points Selection Section (If machine has sub-points) */}
              {selectedMachine.subPoints && selectedMachine.subPoints.length > 0 && (
                <div className="bg-indigo-50/30 border border-indigo-100 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-extrabold text-slate-800 text-xs flex items-center gap-1.5">
                        <CheckSquare size={15} className="text-indigo-600" />
                        เลือกจุดย่อยที่บำรุงรักษาในครั้งนี้:
                      </h4>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        จุดที่เลือกจะถูกอัปเดตวันทำ PM ล่าสุด และคำนวณวันครบกำหนดถัดไปตามรอบของจุดนั้น
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 text-[10px]">
                      <button
                        type="button"
                        onClick={() => {
                          const allIds = selectedMachine.subPoints?.map(p => p.id) || [];
                          setPmRecord({ ...pmRecord, selectedPointIds: allIds });
                        }}
                        className="text-indigo-600 font-bold hover:underline"
                      >
                        เลือกทั้งหมด
                      </button>
                      <span>|</span>
                      <button
                        type="button"
                        onClick={() => {
                          setPmRecord({ ...pmRecord, selectedPointIds: [] });
                        }}
                        className="text-slate-500 hover:underline"
                      >
                        ล้าง
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                    {selectedMachine.subPoints.map((point) => {
                      const isChecked = pmRecord.selectedPointIds.includes(point.id);
                      const pStatus = getSubPointStatus(point.nextPM);
                      return (
                        <label
                          key={point.id}
                          className={`flex items-start gap-2.5 p-2.5 rounded-xl border transition-all cursor-pointer ${
                            isChecked 
                              ? 'bg-white border-indigo-300 shadow-2xs' 
                              : 'bg-white/60 border-slate-200 opacity-75'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setPmRecord({
                                  ...pmRecord,
                                  selectedPointIds: [...pmRecord.selectedPointIds, point.id]
                                });
                              } else {
                                setPmRecord({
                                  ...pmRecord,
                                  selectedPointIds: pmRecord.selectedPointIds.filter(id => id !== point.id)
                                });
                              }
                            }}
                            className="mt-0.5 w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-bold text-slate-800 text-xs truncate">{point.pointName}</span>
                              <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded shrink-0">
                                รอบ {point.intervalMonths}ด. ({point.intervalMonths >= 12 ? `${point.intervalMonths / 12} ปี` : ''})
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400">
                              <span>ชิ้นส่วน: {point.component}</span>
                              <span>•</span>
                              <span>ครบถัดไป: {point.nextPM}</span>
                              <span className={`px-1 py-0.2 rounded text-[8px] font-bold ${pStatus.color}`}>
                                {pStatus.label}
                              </span>
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider">
                  รายละเอียดการปฏิบัติงานบำรุงรักษา
                </label>
                <textarea 
                  required 
                  placeholder="อธิบายละเอียด เช่น ถอดเปลี่ยนชุด O-ring กระบอกสูบ, ล้างตะกอนและเปลี่ยนน้ำมันไฮดรอลิกใหม่, ตรวจเช็คแรงดัน..." 
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
