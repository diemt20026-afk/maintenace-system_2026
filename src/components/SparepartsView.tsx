import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  collection, 
  doc, 
  setDoc, 
  onSnapshot, 
  updateDoc, 
  deleteDoc
} from 'firebase/firestore';
import { 
  Plus, 
  Search, 
  ArrowDownCircle, 
  ArrowUpCircle, 
  Camera, 
  X, 
  LayoutDashboard, 
  Box,
  History,
  Cpu,
  RefreshCw,
  AlertTriangle,
  FileSpreadsheet,
  Trash2,
  Edit2,
  QrCode,
  Printer,
  SlidersHorizontal,
  Tag,
  Hash,
  Clock,
  Calendar,
  Sparkles,
  Layers,
  ArrowUpDown,
  Filter
} from 'lucide-react';
import QRCode from 'qrcode';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { UserProfile } from '../types';

interface SparepartsViewProps {
  appId: string;
  currentUserProfile: UserProfile | null;
  onToast: (msg: string) => void;
}

export interface Part {
  id: string;
  name: string;
  code: string;
  machine: string;
  location: string;
  minStock: number;
  unitPrice: number;
  image?: string | null;
  stockIn?: any[];
  stockOut?: any[];
  createdAt?: string;
  updatedAt?: string;
  modelSerial?: string;
  brand?: string;
}

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

export default function SparepartsView({ appId, currentUserProfile, onToast }: SparepartsViewProps) {
  const [view, setView] = useState<'inventory' | 'history' | 'dashboard'>('inventory');
  const [parts, setParts] = useState<Part[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBrand, setSelectedBrand] = useState<string>('all');
  
  // 20 items limit toggle for inventory
  const [limit20Mode, setLimit20Mode] = useState<boolean>(true);

  // Month & Year filtering for history (defaults strictly to current month & current year)
  const now = new Date();
  const currentMonthNum = now.getMonth() + 1; // 1-12
  const currentYearNum = now.getFullYear();
  const [historyMonth, setHistoryMonth] = useState<number>(currentMonthNum);
  const [historyYear, setHistoryYear] = useState<number>(currentYearNum);
  const [historyFilterMode, setHistoryFilterMode] = useState<'current_month' | 'selected_month' | 'all'>('current_month');
  
  // Modals & transactions
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [selectedPart, setSelectedPart] = useState<Part | null>(null);
  const [adjustingPart, setAdjustingPart] = useState<Part | null>(null);
  const [transactionType, setTransactionType] = useState<'in' | 'out' | null>(null);
  const [deleteConfirmPart, setDeleteConfirmPart] = useState<Part | null>(null);
  const [selectedPartForQr, setSelectedPartForQr] = useState<Part | null>(null);
  const [qrUrl, setQrUrl] = useState<string>('');

  useEffect(() => {
    if (selectedPartForQr) {
      QRCode.toDataURL(selectedPartForQr.code, {
        width: 300,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff'
        }
      }).then(url => {
        setQrUrl(url);
      }).catch(err => {
        console.error("Failed to generate QR Code:", err);
        onToast("สร้าง QR Code ไม่สำเร็จ");
      });
    } else {
      setQrUrl('');
    }
  }, [selectedPartForQr]);

  // Scanner refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [scannerError, setScannerError] = useState<string | null>(null);

  // New part & edit states
  const [newPart, setNewPart] = useState({ 
    name: '', code: '', machine: '', location: '', minStock: 5, initialStock: 0, unitPrice: 0, modelSerial: '', brand: ''
  });
  const [editingPart, setEditingPart] = useState<(Part & { currentStock?: number; targetStock?: number }) | null>(null);
  
  const [transactionData, setTransactionData] = useState({
    amount: '', user: currentUserProfile?.name || '', date: new Date().toISOString(), machineTarget: ''
  });

  // Stock Adjustment state for Admin
  const [adjustData, setAdjustData] = useState({
    currentStock: 0,
    targetStock: 0,
    reason: 'ตรวจนับสต็อกจริงพบจำนวนไม่ตรง',
    customReason: ''
  });

  // Role permissions
  const isAdmin = currentUserProfile?.role === 'admin';
  const hasEditAccess = isAdmin; // Only admin can create/edit/delete parts
  const currentStaffName = currentUserProfile?.name || 'Staff';

  // Load external libraries if not already present
  useEffect(() => {
    const scripts = [
      "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js",
      "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"
    ];
    scripts.forEach(src => {
      if (!document.querySelector(`script[src="${src}"]`)) {
        const script = document.createElement("script");
        script.src = src;
        script.async = true;
        document.body.appendChild(script);
      }
    });
  }, []);

  // Sync parts list from Firestore
  useEffect(() => {
    const partsCollection = collection(db, 'artifacts', appId, 'public', 'data', 'parts');
    
    const unsubscribe = onSnapshot(partsCollection, 
      (snapshot) => {
        const partsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Part[];
        setParts(partsData);
        setLoading(false);
      }, 
      (error) => {
        handleFirestoreError(error, OperationType.LIST, `artifacts/${appId}/public/data/parts`);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [appId]);

  // Keep transaction worker name updated
  useEffect(() => {
    if (currentStaffName) {
      setTransactionData(prev => ({ ...prev, user: currentStaffName }));
    }
  }, [currentStaffName]);

  // Handle QR scanner loop
  useEffect(() => {
    let stream: MediaStream | null = null;
    let animationFrameId: number | null = null;

    const startScanner = async () => {
      if (!isScannerOpen) return;
      setScannerError(null);
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute("playsinline", "true");
          videoRef.current.play();
          animationFrameId = requestAnimationFrame(tick);
        }
      } catch (err: any) {
        setScannerError("ไม่สามารถเข้าถึงกล้องได้: " + err.message);
      }
    };

    const tick = () => {
      if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
        const canvas = canvasRef.current;
        const video = videoRef.current;
        if (canvas) {
          const ctx = canvas.getContext("2d");
          if (ctx) {
            canvas.height = video.videoHeight;
            canvas.width = video.videoWidth;
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            // @ts-ignore
            const code = window.jsQR ? window.jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" }) : null;
            if (code) {
              handleScannedCode(code.data);
              return;
            }
          }
        }
      }
      animationFrameId = requestAnimationFrame(tick);
    };

    const handleScannedCode = (scannedValue: string) => {
      const foundPart = parts.find(p => p.code === scannedValue);
      if (foundPart) {
        setSelectedPart(foundPart);
        setTransactionType('out');
        setIsScannerOpen(false);
        onToast(`พบอะไหล่: ${foundPart.name}`);
      } else {
        onToast(`ไม่พบอะไหล่สำหรับรหัส: ${scannedValue}`);
      }
    };

    if (isScannerOpen) startScanner();
    return () => {
      if (stream) stream.getTracks().forEach(track => track.stop());
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, [isScannerOpen, parts]);

  const calculateStock = (part: Part) => {
    const totalIn = (part.stockIn || []).reduce((sum, item) => sum + Number(item.amount), 0);
    const totalOut = (part.stockOut || []).reduce((sum, item) => sum + Number(item.amount), 0);
    return totalIn - totalOut;
  };

  // Helper to extract the latest update timestamp of a part
  const getPartLastUpdated = (part: Part): number => {
    let latest = 0;
    if (part.updatedAt) {
      const t = new Date(part.updatedAt).getTime();
      if (!isNaN(t) && t > latest) latest = t;
    }
    if (part.createdAt) {
      const t = new Date(part.createdAt).getTime();
      if (!isNaN(t) && t > latest) latest = t;
    }
    if (part.stockIn && Array.isArray(part.stockIn)) {
      part.stockIn.forEach(item => {
        if (item?.date) {
          const t = new Date(item.date).getTime();
          if (!isNaN(t) && t > latest) latest = t;
        }
      });
    }
    if (part.stockOut && Array.isArray(part.stockOut)) {
      part.stockOut.forEach(item => {
        if (item?.date) {
          const t = new Date(item.date).getTime();
          if (!isNaN(t) && t > latest) latest = t;
        }
      });
    }
    if (latest === 0 && part.id && !isNaN(Number(part.id))) {
      latest = Number(part.id);
    }
    return latest;
  };

  // Distinct Brands list for filtering
  const brandList = useMemo(() => {
    const brands = new Set<string>();
    parts.forEach(p => {
      if (p.brand && p.brand.trim()) {
        brands.add(p.brand.trim());
      }
    });
    return Array.from(brands).sort();
  }, [parts]);

  // All transaction history flattened
  const allHistory = useMemo(() => {
    const history: any[] = [];
    parts.forEach(part => {
      (part.stockIn || []).forEach(tx => {
        history.push({ 
          ...tx, 
          partId: part.id, 
          partName: part.name, 
          partCode: part.code, 
          brand: part.brand || '',
          modelSerial: part.modelSerial || '',
          type: tx.isAdjustment ? 'ADJUST_IN' : 'IN' 
        });
      });
      (part.stockOut || []).forEach(tx => {
        history.push({ 
          ...tx, 
          partId: part.id, 
          partName: part.name, 
          partCode: part.code, 
          brand: part.brand || '',
          modelSerial: part.modelSerial || '',
          type: tx.isAdjustment ? 'ADJUST_OUT' : 'OUT' 
        });
      });
    });
    return history.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [parts]);

  // History filtered by Current Month (or selected month)
  const filteredHistory = useMemo(() => {
    return allHistory.filter(h => {
      if (!h.date) return false;
      const d = new Date(h.date);
      if (isNaN(d.getTime())) return false;

      if (historyFilterMode === 'current_month') {
        return (d.getMonth() + 1 === currentMonthNum) && (d.getFullYear() === currentYearNum);
      } else if (historyFilterMode === 'selected_month') {
        return (d.getMonth() + 1 === historyMonth) && (d.getFullYear() === historyYear);
      }
      return true; // 'all'
    });
  }, [allHistory, historyFilterMode, historyMonth, historyYear, currentMonthNum, currentYearNum]);

  // Summary stats for current month's transactions
  const monthStats = useMemo(() => {
    let inCount = 0;
    let outCount = 0;
    let adjustCount = 0;
    filteredHistory.forEach(h => {
      if (h.type === 'IN') inCount += Number(h.amount || 0);
      else if (h.type === 'OUT') outCount += Number(h.amount || 0);
      else if (h.type === 'ADJUST_IN' || h.type === 'ADJUST_OUT') adjustCount += 1;
    });
    return { inCount, outCount, adjustCount, totalLogs: filteredHistory.length };
  }, [filteredHistory]);

  // Enhanced search + Sort by latest update + Limit 20 items default
  const sortedAndFilteredParts = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    const result = parts.filter(part => {
      // Brand filter
      if (selectedBrand !== 'all') {
        const pBrand = (part.brand || '').trim().toLowerCase();
        if (pBrand !== selectedBrand.toLowerCase()) {
          return false;
        }
      }

      if (!term) return true;

      const nameMatch = (part.name || '').toLowerCase().includes(term);
      const codeMatch = (part.code || '').toLowerCase().includes(term);
      const machineMatch = (part.machine || '').toLowerCase().includes(term);
      const brandMatch = (part.brand || '').toLowerCase().includes(term);
      const modelMatch = (part.modelSerial || '').toLowerCase().includes(term);
      const locationMatch = (part.location || '').toLowerCase().includes(term);

      return nameMatch || codeMatch || machineMatch || brandMatch || modelMatch || locationMatch;
    });

    // Sort by latest update timestamp descending
    return result.sort((a, b) => getPartLastUpdated(b) - getPartLastUpdated(a));
  }, [parts, searchTerm, selectedBrand]);

  // Displayed parts (Top 20 latest updated items by default)
  const displayedParts = useMemo(() => {
    if (limit20Mode) {
      return sortedAndFilteredParts.slice(0, 20);
    }
    return sortedAndFilteredParts;
  }, [sortedAndFilteredParts, limit20Mode]);

  const exportToExcel = () => {
    // @ts-ignore
    if (typeof XLSX === 'undefined') {
      onToast("กำลังโหลดปลั๊กอินสำหรับส่งออกกรุณารอสักครู่");
      return;
    }
    const inventoryData = sortedAndFilteredParts.map(p => ({
      'รหัสอะไหล่': p.code,
      'ชื่ออะไหล่': p.name,
      'แบรนด์': p.brand || '-',
      'รุ่น/ซีเรียล': p.modelSerial || '-',
      'เครื่องจักรหลัก': p.machine,
      'ตำแหน่ง': p.location,
      'ราคาต่อหน่วย': p.unitPrice || 0,
      'คงเหลือ': calculateStock(p),
      'ขั้นต่ำ': p.minStock,
      'อัปเดตล่าสุด': getPartLastUpdated(p) ? new Date(getPartLastUpdated(p)).toLocaleString('th-TH') : '-'
    }));

    const historyData = filteredHistory.map(h => ({
      'วันที่': new Date(h.date).toLocaleString('th-TH'),
      'ประเภท': h.type.startsWith('ADJUST') ? 'ปรับปรุงยอดสต็อก' : (h.type === 'IN' ? 'รับเข้า' : 'เบิกออก'),
      'รหัสอะไหล่': h.partCode,
      'ชื่ออะไหล่': h.partName,
      'แบรนด์': h.brand || '-',
      'รุ่น/ซีเรียล': h.modelSerial || '-',
      'จำนวน': h.amount,
      'ผู้ดำเนินการ': h.user,
      'เครื่องจักรที่ใช้ / หมายเหตุ': h.machineTarget || h.note || '-'
    }));
    
    // @ts-ignore
    const wb = XLSX.utils.book_new();
    // @ts-ignore
    const ws1 = XLSX.utils.json_to_sheet(inventoryData);
    // @ts-ignore
    const ws2 = XLSX.utils.json_to_sheet(historyData);
    // @ts-ignore
    XLSX.utils.book_append_sheet(wb, ws1, "สต็อกอะไหล่");
    // @ts-ignore
    XLSX.utils.book_append_sheet(wb, ws2, "ประวัติเบิกจ่าย");
    // @ts-ignore
    XLSX.writeFile(wb, `SpareParts_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
    onToast("ส่งออกไฟล์เรียบร้อยแล้ว");
  };

  const handleAddPart = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = Date.now().toString();
    const nowIso = new Date().toISOString();
    const initialRecord = Number(newPart.initialStock) > 0 ? [{
      amount: Number(newPart.initialStock),
      user: currentStaffName,
      date: nowIso
    }] : [];

    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'parts', id), {
        name: newPart.name.trim(),
        code: newPart.code.trim(),
        machine: newPart.machine.trim(),
        location: newPart.location.trim(),
        minStock: Number(newPart.minStock),
        unitPrice: Number(newPart.unitPrice),
        modelSerial: newPart.modelSerial?.trim() || '',
        brand: newPart.brand?.trim() || '',
        stockIn: initialRecord,
        stockOut: [],
        createdAt: nowIso,
        updatedAt: nowIso
      });
      setIsAddModalOpen(false);
      setNewPart({ name: '', code: '', machine: '', location: '', minStock: 5, initialStock: 0, unitPrice: 0, modelSerial: '', brand: '' });
      onToast("เพิ่มอะไหล่ใหม่เรียบร้อยแล้ว");
    } catch (err) { 
      handleFirestoreError(err, OperationType.WRITE, `artifacts/${appId}/public/data/parts/${id}`); 
    }
  };

  const handleUpdatePart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPart) return;
    try {
      const partRef = doc(db, 'artifacts', appId, 'public', 'data', 'parts', editingPart.id);
      const nowIso = new Date().toISOString();
      
      const updatePayload: any = {
        name: editingPart.name.trim(),
        code: editingPart.code.trim(),
        machine: editingPart.machine.trim(),
        location: editingPart.location.trim(),
        unitPrice: Number(editingPart.unitPrice),
        minStock: Number(editingPart.minStock),
        modelSerial: editingPart.modelSerial?.trim() || '',
        brand: editingPart.brand?.trim() || '',
        updatedAt: nowIso
      };

      // If Admin adjusted the stock directly in the Edit modal
      if (isAdmin && editingPart.targetStock !== undefined) {
        const current = calculateStock(editingPart);
        const target = Number(editingPart.targetStock);
        if (!isNaN(target) && target >= 0 && target !== current) {
          const diff = target - current;
          if (diff > 0) {
            updatePayload.stockIn = [
              ...(editingPart.stockIn || []),
              {
                amount: diff,
                user: `${currentStaffName} (Admin)`,
                date: nowIso,
                note: `[ปรับปรุงยอดแก้ไขข้อมูล ${current} -> ${target}]`,
                isAdjustment: true
              }
            ];
          } else if (diff < 0) {
            updatePayload.stockOut = [
              ...(editingPart.stockOut || []),
              {
                amount: Math.abs(diff),
                user: `${currentStaffName} (Admin)`,
                date: nowIso,
                machineTarget: 'ปรับยอดคงเหลือจริง',
                note: `[ปรับปรุงยอดแก้ไขข้อมูล ${current} -> ${target}]`,
                isAdjustment: true
              }
            ];
          }
        }
      }

      await updateDoc(partRef, updatePayload);
      setIsEditModalOpen(false);
      setEditingPart(null);
      onToast("แก้ไขข้อมูลอะไหล่เรียบร้อยแล้ว");
    } catch (err) { 
      handleFirestoreError(err, OperationType.UPDATE, `artifacts/${appId}/public/data/parts/${editingPart.id}`); 
    }
  };

  const openAdjustModal = (part: Part) => {
    const current = calculateStock(part);
    setAdjustingPart(part);
    setAdjustData({
      currentStock: current,
      targetStock: current,
      reason: 'ตรวจนับสต็อกจริงพบจำนวนไม่ตรง',
      customReason: ''
    });
    setIsAdjustModalOpen(true);
  };

  const handleAdjustStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustingPart) return;
    
    const current = calculateStock(adjustingPart);
    const target = Number(adjustData.targetStock);
    
    if (isNaN(target) || target < 0) {
      onToast("กรุณาระบุจำนวนที่ถูกต้อง (0 ขึ้นไป)");
      return;
    }

    const diff = target - current;
    if (diff === 0) {
      setIsAdjustModalOpen(false);
      setAdjustingPart(null);
      onToast("จำนวนคงเหลือตรงกับระบบอยู่แล้ว ไม่มีการเปลี่ยนแปลง");
      return;
    }

    const effectiveReason = adjustData.reason === 'custom' 
      ? (adjustData.customReason.trim() || 'ปรับปรุงยอดสต็อกจริง') 
      : adjustData.reason;

    const partRef = doc(db, 'artifacts', appId, 'public', 'data', 'parts', adjustingPart.id);
    const nowIso = new Date().toISOString();

    try {
      if (diff > 0) {
        // Add discrepancy as inward adjustment
        const updatedStockIn = [
          ...(adjustingPart.stockIn || []),
          {
            amount: diff,
            user: `${currentStaffName} (Admin)`,
            date: nowIso,
            note: `[ปรับปรุงยอด ${current} -> ${target}] ${effectiveReason}`,
            isAdjustment: true
          }
        ];
        await updateDoc(partRef, { stockIn: updatedStockIn, updatedAt: nowIso });
      } else {
        // Add discrepancy as outward adjustment
        const updatedStockOut = [
          ...(adjustingPart.stockOut || []),
          {
            amount: Math.abs(diff),
            user: `${currentStaffName} (Admin)`,
            date: nowIso,
            machineTarget: 'ปรับยอดคงเหลือจริง',
            note: `[ปรับปรุงยอด ${current} -> ${target}] ${effectiveReason}`,
            isAdjustment: true
          }
        ];
        await updateDoc(partRef, { stockOut: updatedStockOut, updatedAt: nowIso });
      }

      setIsAdjustModalOpen(false);
      setAdjustingPart(null);
      onToast(`ปรับปรุงยอดสต็อก "${adjustingPart.name}" เป็น ${target} ชิ้นเรียบร้อยแล้ว`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `artifacts/${appId}/public/data/parts/${adjustingPart.id}`);
    }
  };

  const handleTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPart || !transactionType) return;
    const balance = calculateStock(selectedPart);
    const amountNum = Number(transactionData.amount);
    
    if (transactionType === 'out' && amountNum > balance) {
      onToast("จำนวนอะไหล่ไม่พอกับยอดเบิกออก");
      return;
    }

    const partRef = doc(db, 'artifacts', appId, 'public', 'data', 'parts', selectedPart.id);
    const nowIso = new Date().toISOString();
    const updatedData = transactionType === 'in' 
      ? { stockIn: [...(selectedPart.stockIn || []), { amount: amountNum, user: transactionData.user, date: nowIso }], updatedAt: nowIso }
      : { stockOut: [...(selectedPart.stockOut || []), { amount: amountNum, user: transactionData.user, date: nowIso, machineTarget: transactionData.machineTarget }], updatedAt: nowIso };

    try {
      await updateDoc(partRef, updatedData);
      setSelectedPart(null);
      setTransactionData({ amount: '', user: currentStaffName, date: new Date().toISOString(), machineTarget: '' });
      onToast(transactionType === 'in' ? "รับเข้าคลังอะไหล่สำเร็จ" : "เบิกจ่ายอะไหล่สำเร็จ");
    } catch (err) { 
      handleFirestoreError(err, OperationType.UPDATE, `artifacts/${appId}/public/data/parts/${selectedPart.id}`); 
    }
  };

  const handleDeletePart = async () => {
    if (!deleteConfirmPart) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'parts', deleteConfirmPart.id));
      setDeleteConfirmPart(null);
      onToast("ลบข้อมูลอะไหล่เรียบร้อยแล้ว");
    } catch (err) { 
      handleFirestoreError(err, OperationType.DELETE, `artifacts/${appId}/public/data/parts/${deleteConfirmPart.id}`); 
    }
  };

  const openEditModal = (part: Part) => {
    const current = calculateStock(part);
    setEditingPart({ ...part, currentStock: current, targetStock: current });
    setIsEditModalOpen(true);
  };

  return (
    <div className="space-y-6 animate-fade-in font-sans">
      {/* Header and Sub Navigation */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center">
            <Cpu className="w-5 h-5 mr-2 text-blue-600" />
            ระบบจัดการอะไหล่ (Spare Parts Management)
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            ค้นหาตามแบรนด์/ซีเรียล ควบคุมเบิกจ่าย ปรับปรุงยอดสต็อก และสแกน QR Code ตรวจสอบอะไหล่
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          <button 
            onClick={() => setView('inventory')} 
            className={`px-3 py-1.5 text-[10px] rounded-lg uppercase font-bold tracking-wider transition-all cursor-pointer ${view === 'inventory' ? 'bg-[#21434F] text-white shadow-inner' : 'text-slate-600 hover:bg-[#21434F]/10 hover:text-slate-800'}`}
          >
            คลังอะไหล่
          </button>
          <button 
            onClick={() => setView('history')} 
            className={`px-3 py-1.5 text-[10px] rounded-lg uppercase font-bold tracking-wider transition-all cursor-pointer ${view === 'history' ? 'bg-[#21434F] text-white shadow-inner' : 'text-slate-600 hover:bg-[#21434F]/10 hover:text-slate-800'}`}
          >
            ประวัติการทำรายการ ({filteredHistory.length})
          </button>
          {isAdmin && (
            <button 
              onClick={() => setView('dashboard')} 
              className={`px-3 py-1.5 text-[10px] rounded-lg uppercase font-bold tracking-wider transition-all cursor-pointer ${view === 'dashboard' ? 'bg-[#21434F] text-white shadow-inner' : 'text-slate-600 hover:bg-[#21434F]/10 hover:text-slate-800'}`}
            >
              แดชบอร์ด
            </button>
          )}
          <button 
            onClick={() => setIsScannerOpen(true)} 
            className="px-3 py-1.5 text-[10px] bg-slate-900 text-white rounded-lg uppercase font-bold tracking-wider hover:bg-slate-800 transition-all cursor-pointer flex items-center gap-1 shadow-sm"
          >
            <Camera className="w-3.5 h-3.5" /> สแกน QR
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <RefreshCw className="animate-spin text-blue-600 mb-4" size={32} />
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">กำลังดึงข้อมูลคลังอะไหล่จากคลาวด์...</p>
        </div>
      ) : (
        <>
          {/* VIEW: INVENTORY */}
          {view === 'inventory' && (
            <div className="space-y-4">
              {/* Search and Filter Bar */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 shadow-sm space-y-3">
                <div className="flex flex-col md:flex-row gap-2.5">
                  {/* Search input with Brand/Serial support */}
                  <div className="relative flex-1">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                    <input 
                      className="w-full pl-10 pr-9 py-2.5 bg-white rounded-xl border border-slate-200 focus:border-[#21434F] outline-none transition-all text-xs font-medium text-slate-800 shadow-sm placeholder:text-slate-400" 
                      placeholder="ค้นหาชื่ออะไหล่, รหัส QR, แบรนด์ (Brand), รุ่น/ซีเรียล (Serial), เครื่องจักร หรือตำแหน่ง..." 
                      value={searchTerm} 
                      onChange={e => setSearchTerm(e.target.value)} 
                    />
                    {searchTerm && (
                      <button 
                        onClick={() => setSearchTerm('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
                        title="ล้างข้อความค้นหา"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  {/* Brand Filter Selector */}
                  <div className="w-full md:w-56 shrink-0">
                    <div className="relative">
                      <select
                        value={selectedBrand}
                        onChange={(e) => setSelectedBrand(e.target.value)}
                        className="w-full appearance-none pl-8 pr-8 py-2.5 bg-white border border-slate-200 focus:border-[#21434F] rounded-xl text-xs font-semibold text-slate-700 outline-none cursor-pointer shadow-sm"
                      >
                        <option value="all">แบรนด์ทั้งหมด (All Brands)</option>
                        {brandList.map(brand => (
                          <option key={brand} value={brand}>{brand}</option>
                        ))}
                      </select>
                      <Tag className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5 pointer-events-none" />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-[10px]">▼</div>
                    </div>
                  </div>

                  {/* Add Part Button (Admin) */}
                  {hasEditAccess && (
                    <button 
                      onClick={() => setIsAddModalOpen(true)} 
                      className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs tracking-wider uppercase shadow-sm transition-all cursor-pointer flex items-center justify-center shrink-0"
                    >
                      <Plus className="w-4 h-4 mr-1.5" /> เพิ่มอะไหล่ใหม่
                    </button>
                  )}
                </div>

                {/* Quick Info & 20 Items View Toggle Bar */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-slate-500 font-medium">
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Badge showing 20 latest updated items */}
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50/80 text-blue-800 rounded-lg text-[11px] font-bold border border-blue-200/70">
                      <Clock size={13} className="text-blue-600 shrink-0" />
                      <span>
                        {limit20Mode ? (
                          <>แสดง <strong>20 รายการที่มีการอัปเดตล่าสุด</strong> (จากทั้งหมด {sortedAndFilteredParts.length} รายการ)</>
                        ) : (
                          <>แสดงทั้งหมด <strong>{sortedAndFilteredParts.length} รายการ</strong> (เรียงตามอัปเดตล่าสุด)</>
                        )}
                      </span>
                    </div>

                    {/* Limit 20 toggle button */}
                    <button 
                      onClick={() => setLimit20Mode(!limit20Mode)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer border flex items-center gap-1 ${
                        limit20Mode 
                          ? 'bg-slate-200/80 hover:bg-slate-300/80 text-slate-700 border-slate-300' 
                          : 'bg-[#21434F] text-white border-[#21434F]'
                      }`}
                    >
                      <Layers size={11} />
                      {limit20Mode ? `ดูรายการทั้งหมด (${sortedAndFilteredParts.length})` : 'ย่อเหลือ 20 รายการล่าสุด'}
                    </button>

                    {selectedBrand !== 'all' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md font-bold text-[10px] border border-blue-100">
                        แบรนด์: {selectedBrand}
                        <button onClick={() => setSelectedBrand('all')} className="hover:text-blue-900 cursor-pointer"><X size={10} /></button>
                      </span>
                    )}
                    {searchTerm && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-200/70 text-slate-700 rounded-md font-bold text-[10px]">
                        คำค้น: "{searchTerm}"
                        <button onClick={() => setSearchTerm('')} className="hover:text-slate-900 cursor-pointer"><X size={10} /></button>
                      </span>
                    )}
                  </div>

                  {isAdmin && (
                    <div className="flex items-center gap-1 text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200/60 font-semibold">
                      <SlidersHorizontal size={11} className="shrink-0" />
                      <span>Admin ปรับยอดสต็อกเมื่อพบจำนวนไม่ตรงได้ที่ไอคอนสีส้ม</span>
                    </div>
                  )}
                </div>
              </div>

              {displayedParts.length === 0 ? (
                <div className="text-center py-16 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                  <Box className="mx-auto text-slate-300 mb-3" size={40} />
                  <p className="text-slate-700 font-bold text-sm">ไม่พบอะไหล่ตามเงื่อนไขการค้นหา</p>
                  <p className="text-slate-400 text-xs mt-1">ลองเปลี่ยนคำค้นหา หรือคลิกเพื่อล้างตัวกรอง</p>
                  {(searchTerm || selectedBrand !== 'all') && (
                    <button 
                      onClick={() => { setSearchTerm(''); setSelectedBrand('all'); }}
                      className="mt-3 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg text-xs font-bold text-slate-700 cursor-pointer"
                    >
                      ล้างตัวกรองทั้งหมด
                    </button>
                  )}
                </div>
              ) : (
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50/90 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                          <th className="py-3 px-4 w-28">รหัสอะไหล่</th>
                          <th className="py-3 px-4 min-w-[200px]">ชื่อเรียก / แบรนด์ / รุ่น</th>
                          <th className="py-3 px-4">เครื่องจักรหลัก</th>
                          <th className="py-3 px-4">ตำแหน่งจัดเก็บ</th>
                          <th className="py-3 px-4 text-right">ราคา/หน่วย</th>
                          <th className="py-3 px-4 text-center">คงเหลือ / ขั้นต่ำ</th>
                          <th className="py-3 px-4 text-center">อัปเดตล่าสุด</th>
                          <th className="py-3 px-4 text-center">สถานะ</th>
                          <th className="py-3 px-4 text-center min-w-[160px]">การทำรายการ / จัดการ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium">
                        {displayedParts.map((part, index) => {
                          const balance = calculateStock(part);
                          const isLow = balance <= (part.minStock || 0);
                          const lastUpdatedTimestamp = getPartLastUpdated(part);
                          return (
                            <tr key={part.id} className="hover:bg-slate-50/60 transition-colors">
                              {/* Part Code */}
                              <td className="py-3 px-4">
                                <span className="font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded text-[10px] border border-blue-100">
                                  {part.code}
                                </span>
                              </td>

                              {/* Part Name + Brand & Model/Serial */}
                              <td className="py-3 px-4 text-slate-800">
                                <div className="font-bold text-slate-900 leading-snug flex items-center gap-1.5" title={part.name}>
                                  <span>{part.name}</span>
                                  {index < 3 && limit20Mode && !searchTerm && selectedBrand === 'all' && (
                                    <span className="inline-flex items-center px-1.5 py-0.2 bg-emerald-50 text-emerald-700 text-[8px] font-black rounded border border-emerald-200">
                                      NEW
                                    </span>
                                  )}
                                </div>
                                {(part.brand || part.modelSerial) && (
                                  <div className="text-[10px] text-slate-500 mt-1 flex flex-wrap gap-1.5 font-medium items-center">
                                    {part.brand && (
                                      <button 
                                        onClick={() => setSelectedBrand(part.brand || 'all')}
                                        className="inline-flex items-center gap-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded text-[9px] font-bold border border-slate-200 transition-colors cursor-pointer"
                                        title={`กรองเฉพาะแบรนด์ ${part.brand}`}
                                      >
                                        <Tag size={9} className="text-blue-500" />
                                        <span>{part.brand}</span>
                                      </button>
                                    )}
                                    {part.modelSerial && (
                                      <span className="inline-flex items-center gap-0.5 bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold border border-slate-200">
                                        <Hash size={9} className="text-slate-400" />
                                        <span>{part.modelSerial}</span>
                                      </span>
                                    )}
                                  </div>
                                )}
                              </td>

                              {/* Machine */}
                              <td className="py-3 px-4 text-slate-600 font-semibold">{part.machine || '-'}</td>

                              {/* Location */}
                              <td className="py-3 px-4 font-mono text-slate-500">{part.location || '-'}</td>

                              {/* Price */}
                              <td className="py-3 px-4 text-right font-semibold text-slate-700">
                                {part.unitPrice ? `${part.unitPrice.toLocaleString('th-TH')} ฿` : '0 ฿'}
                              </td>

                              {/* Balance / Min */}
                              <td className="py-3 px-4 text-center">
                                <span className={`font-mono text-sm font-extrabold ${isLow ? 'text-red-600' : 'text-slate-800'}`}>
                                  {balance}
                                </span>
                                <span className="text-slate-400 text-[10px]"> / {part.minStock}</span>
                              </td>

                              {/* Last Updated Timestamp */}
                              <td className="py-3 px-4 text-center text-[10px] text-slate-500 font-mono">
                                {lastUpdatedTimestamp ? new Date(lastUpdatedTimestamp).toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '-'}
                              </td>

                              {/* Status */}
                              <td className="py-3 px-4 text-center">
                                {isLow ? (
                                  <span className="inline-flex items-center px-2 py-0.5 bg-rose-50 text-rose-600 text-[9px] font-bold rounded border border-rose-100">
                                    <AlertTriangle className="w-2.5 h-2.5 mr-1" /> ต่ำกว่าเกณฑ์
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2 py-0.5 bg-emerald-50 text-emerald-600 text-[9px] font-bold rounded border border-emerald-100">
                                    ปกติ
                                  </span>
                                )}
                              </td>

                              {/* Actions */}
                              <td className="py-3 px-4">
                                <div className="flex items-center justify-center gap-1 flex-wrap">
                                  {isAdmin && (
                                    <button 
                                      onClick={() => { setSelectedPart(part); setTransactionType('in'); }} 
                                      className="p-1.5 bg-green-50 text-green-600 hover:bg-green-600 hover:text-white rounded-lg transition-colors cursor-pointer"
                                      title="รับอะไหล่เข้าคลัง"
                                    >
                                      <ArrowDownCircle size={14} />
                                    </button>
                                  )}
                                  <button 
                                    onClick={() => { setSelectedPart(part); setTransactionType('out'); }} 
                                    className="p-1.5 bg-orange-50 text-orange-600 hover:bg-orange-600 hover:text-white rounded-lg transition-colors cursor-pointer"
                                    title="เบิกอะไหล่ใช้งาน"
                                  >
                                    <ArrowUpCircle size={14} />
                                  </button>
                                  <button 
                                    onClick={() => setSelectedPartForQr(part)} 
                                    className="p-1.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white rounded-lg transition-colors cursor-pointer"
                                    title="พิมพ์ QR Code"
                                  >
                                    <QrCode size={14} />
                                  </button>

                                  {/* Admin Direct Stock Adjustment Button */}
                                  {isAdmin && (
                                    <button 
                                      onClick={() => openAdjustModal(part)} 
                                      className="p-1.5 bg-amber-50 text-amber-700 hover:bg-amber-600 hover:text-white rounded-lg transition-colors cursor-pointer border border-amber-200/80"
                                      title="ปรับยอดสต็อก (แก้ไขจำนวนเมื่อตรวจพบไม่ถูกต้อง)"
                                    >
                                      <SlidersHorizontal size={14} />
                                    </button>
                                  )}

                                  {hasEditAccess && (
                                    <>
                                      <span className="h-4 w-px bg-slate-200 mx-0.5"></span>
                                      <button 
                                        onClick={() => openEditModal(part)} 
                                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                                        title="แก้ไขข้อมูลอะไหล่"
                                      >
                                        <Edit2 size={13} />
                                      </button>
                                      <button 
                                        onClick={() => setDeleteConfirmPart(part)} 
                                        className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                                        title="ลบ"
                                      >
                                        <Trash2 size={13} />
                                      </button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {limit20Mode && sortedAndFilteredParts.length > 20 && (
                    <div className="p-3 bg-slate-50 border-t border-slate-200 text-center">
                      <button 
                        onClick={() => setLimit20Mode(false)}
                        className="px-4 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer inline-flex items-center gap-1.5"
                      >
                        <Layers size={13} />
                        แสดงรายการอะไหล่ที่เหลืออีก {sortedAndFilteredParts.length - 20} รายการ
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* VIEW: TRANSACTION HISTORY */}
          {view === 'history' && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
              {/* Header & Filter by Month */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div>
                  <h3 className="text-xs font-black uppercase text-slate-800 tracking-wider flex items-center gap-2">
                    <History className="w-4 h-4 text-blue-600" />
                    ประวัติการเคลื่อนไหวและการปรับปรุงยอดอะไหล่
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1">
                    <Calendar size={12} className="text-slate-400" />
                    {historyFilterMode === 'current_month' && (
                      <span className="font-bold text-blue-700">
                        แสดงเฉพาะเดือนปัจจุบัน ({THAI_MONTHS[currentMonthNum - 1]} {currentYearNum + 543})
                      </span>
                    )}
                    {historyFilterMode === 'selected_month' && (
                      <span className="font-bold text-slate-700">
                        แสดงเดือน {THAI_MONTHS[historyMonth - 1]} {historyYear + 543}
                      </span>
                    )}
                    {historyFilterMode === 'all' && (
                      <span className="font-bold text-slate-700">แสดงข้อมูลทุกเดือน ({allHistory.length} รายการ)</span>
                    )}
                  </p>
                </div>

                {/* Filter Controls & Export */}
                <div className="flex items-center flex-wrap gap-2">
                  {/* Quick toggle between current month and all */}
                  <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-[10px] font-bold">
                    <button
                      onClick={() => setHistoryFilterMode('current_month')}
                      className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${historyFilterMode === 'current_month' ? 'bg-[#21434F] text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                    >
                      เดือนปัจจุบัน
                    </button>
                    <button
                      onClick={() => setHistoryFilterMode('selected_month')}
                      className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${historyFilterMode === 'selected_month' ? 'bg-[#21434F] text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                    >
                      เลือกเดือน
                    </button>
                    <button
                      onClick={() => setHistoryFilterMode('all')}
                      className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${historyFilterMode === 'all' ? 'bg-[#21434F] text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                    >
                      ทั้งหมด
                    </button>
                  </div>

                  {/* Month & Year Selectors if in selected_month mode */}
                  {historyFilterMode === 'selected_month' && (
                    <div className="flex items-center gap-1">
                      <select
                        value={historyMonth}
                        onChange={e => setHistoryMonth(Number(e.target.value))}
                        className="bg-white border border-slate-200 px-2 py-1 rounded-lg text-xs font-bold text-slate-700 outline-none cursor-pointer"
                      >
                        {THAI_MONTHS.map((m, idx) => (
                          <option key={idx + 1} value={idx + 1}>{m}</option>
                        ))}
                      </select>
                      <select
                        value={historyYear}
                        onChange={e => setHistoryYear(Number(e.target.value))}
                        className="bg-white border border-slate-200 px-2 py-1 rounded-lg text-xs font-bold text-slate-700 outline-none cursor-pointer"
                      >
                        <option value={currentYearNum}>{currentYearNum + 543}</option>
                        <option value={currentYearNum - 1}>{currentYearNum - 1 + 543}</option>
                        <option value={currentYearNum - 2}>{currentYearNum - 2 + 543}</option>
                      </select>
                    </div>
                  )}

                  <button 
                    onClick={exportToExcel}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-[10px] uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-all shadow-sm"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" /> ส่งออก Excel
                  </button>
                </div>
              </div>

              {/* Monthly Stats Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">รายการทั้งหมดในเดือนนี้</span>
                  <span className="text-lg font-black text-slate-800 font-mono">{monthStats.totalLogs}</span>
                  <span className="text-[10px] text-slate-400 ml-1">ครั้ง</span>
                </div>
                <div className="p-3 bg-emerald-50/70 rounded-xl border border-emerald-200/80">
                  <span className="text-[9px] font-black text-emerald-700 uppercase tracking-wider block">รับเข้าคลัง (Receive)</span>
                  <span className="text-lg font-black text-emerald-700 font-mono">{monthStats.inCount}</span>
                  <span className="text-[10px] text-emerald-600 ml-1">ชิ้น</span>
                </div>
                <div className="p-3 bg-orange-50/70 rounded-xl border border-orange-200/80">
                  <span className="text-[9px] font-black text-orange-700 uppercase tracking-wider block">เบิกใช้งาน (Withdraw)</span>
                  <span className="text-lg font-black text-orange-700 font-mono">{monthStats.outCount}</span>
                  <span className="text-[10px] text-orange-600 ml-1">ชิ้น</span>
                </div>
                <div className="p-3 bg-amber-50/70 rounded-xl border border-amber-200/80">
                  <span className="text-[9px] font-black text-amber-800 uppercase tracking-wider block">ปรับปรุงยอดสต็อกจริง</span>
                  <span className="text-lg font-black text-amber-800 font-mono">{monthStats.adjustCount}</span>
                  <span className="text-[10px] text-amber-700 ml-1">ครั้ง</span>
                </div>
              </div>

              {filteredHistory.length === 0 ? (
                <div className="text-center py-12 bg-slate-50 rounded-xl border border-slate-200">
                  <History className="mx-auto text-slate-300 mb-2" size={32} />
                  <p className="text-slate-700 font-bold text-xs">ไม่มีข้อมูลประวัติการทำรายการในเดือนนี้</p>
                  <p className="text-slate-400 text-[11px] mt-0.5">
                    คลิกเลือก "ทั้งหมด" หรือเลือกเดือนอื่นเพื่อดูประวัติย้อนหลัง
                  </p>
                  {historyFilterMode !== 'all' && (
                    <button
                      onClick={() => setHistoryFilterMode('all')}
                      className="mt-2.5 px-3 py-1 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg text-xs font-bold text-slate-700 cursor-pointer"
                    >
                      ดูประวัติทุกเดือน
                    </button>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                        <th className="py-2.5">วันเวลา</th>
                        <th className="py-2.5">รายการอะไหล่ / แบรนด์ / รุ่น</th>
                        <th className="py-2.5 text-center">ประเภท</th>
                        <th className="py-2.5 text-center">จำนวน</th>
                        <th className="py-2.5">ผู้ทำรายการ</th>
                        <th className="py-2.5">เครื่องจักรเป้าหมาย / หมายเหตุการปรับยอด</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 font-medium">
                      {filteredHistory.map((h, i) => (
                        <tr key={i} className="hover:bg-slate-50/50">
                          <td className="py-3 text-[10px] text-slate-500 font-mono">
                            {new Date(h.date).toLocaleString('th-TH')}
                          </td>
                          <td className="py-3">
                            <p className="font-extrabold text-slate-800">{h.partName}</p>
                            <div className="flex items-center gap-2 text-[9px] font-bold text-slate-400 font-mono">
                              <span>{h.partCode}</span>
                              {h.brand && <span className="text-slate-500 font-sans">[{h.brand}]</span>}
                              {h.modelSerial && <span className="text-slate-500 font-mono">#{h.modelSerial}</span>}
                            </div>
                          </td>
                          <td className="py-3 text-center">
                            {h.type === 'ADJUST_IN' || h.type === 'ADJUST_OUT' ? (
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-amber-100 text-amber-800 border border-amber-200">
                                {h.type === 'ADJUST_IN' ? 'ADJUST (+)' : 'ADJUST (-)'}
                              </span>
                            ) : (
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${h.type === 'IN' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                                {h.type === 'IN' ? 'RECEIVE' : 'WITHDRAW'}
                              </span>
                            )}
                          </td>
                          <td className="py-3 text-center font-extrabold text-slate-800">{h.amount}</td>
                          <td className="py-3 text-slate-600 font-semibold">{h.user}</td>
                          <td className="py-3 text-slate-600">
                            {h.note ? (
                              <span className="text-amber-900 bg-amber-50 px-2 py-0.5 rounded text-[10px] font-medium border border-amber-100">
                                {h.note}
                              </span>
                            ) : (
                              <span className="font-mono text-slate-500">{h.machineTarget || '-'}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* VIEW: DASHBOARD (ADMIN) */}
          {view === 'dashboard' && isAdmin && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">รายการอะไหล่ทั้งหมด</p>
                  <p className="text-3xl font-black text-slate-800 font-mono">{parts.length}</p>
                </div>
                <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">อะไหล่ใกล้หมด (Low Stock)</p>
                  <p className="text-3xl font-black text-red-500 font-mono">
                    {parts.filter(p => calculateStock(p) <= (p.minStock || 0)).length}
                  </p>
                </div>
                <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">จำนวนการเคลื่อนไหวรวม</p>
                  <p className="text-3xl font-black text-orange-500 font-mono">{allHistory.length}</p>
                </div>
              </div>

              {/* Warning List */}
              <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm space-y-4">
                <h3 className="text-xs font-black uppercase text-slate-800 tracking-wider flex items-center">
                  <AlertTriangle className="w-4 h-4 mr-2 text-rose-500" />
                  รายการอะไหล่เร่งด่วนที่ต้องจัดหาเพิ่มเติม
                </h3>
                
                {parts.filter(p => calculateStock(p) <= (p.minStock || 0)).length === 0 ? (
                  <p className="text-slate-400 text-xs font-medium text-center py-4">ไม่มีอะไหล่ชิ้นใดต่ำกว่าเกณฑ์ขั้นต่ำ</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {parts.filter(p => calculateStock(p) <= (p.minStock || 0)).map(part => {
                      const bal = calculateStock(part);
                      return (
                        <div key={part.id} className="py-2.5 flex justify-between items-center text-xs font-medium">
                          <div>
                            <span className="font-extrabold text-slate-800">{part.name}</span>
                            <span className="text-[10px] font-mono text-slate-400 ml-2">({part.code})</span>
                            {part.brand && <span className="text-[9px] bg-slate-100 text-slate-600 px-1 py-0.5 rounded ml-2 font-bold">{part.brand}</span>}
                          </div>
                          <div className="text-right flex items-center gap-3">
                            <div>
                              <span className="text-red-500 font-extrabold">{bal} </span>
                              <span className="text-slate-400">/ ขั้นต่ำ {part.minStock}</span>
                            </div>
                            <button 
                              onClick={() => openAdjustModal(part)}
                              className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 text-[10px] font-bold rounded border border-amber-200 cursor-pointer"
                            >
                              ปรับยอด
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* MODAL: Scan QR */}
      {isScannerOpen && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex flex-col items-center justify-center z-[100] p-4 animate-fade-in">
          <div className="w-full max-w-sm relative bg-white rounded-3xl overflow-hidden shadow-2xl p-5 border border-slate-200">
            <button 
              onClick={() => setIsScannerOpen(false)} 
              className="absolute top-4 right-4 p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-full transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>
            <h3 className="text-sm font-extrabold text-slate-800 tracking-tight mb-4 flex items-center">
              <Camera className="w-4 h-4 mr-2 text-blue-600" />
              สแกน QR Code คลังอะไหล่
            </h3>
            
            <div className="relative aspect-square bg-black rounded-2xl overflow-hidden mb-3 flex items-center justify-center">
              {scannerError ? (
                <div className="p-6 text-center text-red-500 text-xs font-bold">{scannerError}</div>
              ) : (
                <>
                  <video ref={videoRef} className="w-full h-full object-cover" />
                  <canvas ref={canvasRef} className="hidden" />
                  <div className="absolute inset-8 border-2 border-dashed border-blue-500 rounded-xl pointer-events-none animate-pulse"></div>
                </>
              )}
            </div>
            <p className="text-[10px] text-slate-400 text-center font-bold">หันหน้ากล้องไปยังสติกเกอร์ QR Code ของเครื่องมือหรือกล่องอะไหล่</p>
          </div>
        </div>
      )}

      {/* MODAL: ADD PART */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md flex items-center justify-center z-[100] p-4 animate-fade-in">
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full shadow-2xl overflow-y-auto max-h-[90vh] space-y-3">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">เพิ่มรายการอะไหล่ใหม่</h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer"><X size={16} /></button>
            </div>
            
            <form onSubmit={handleAddPart} className="space-y-2.5 text-xs">
              <div className="space-y-1">
                <label className="block text-[9px] font-black text-slate-500 uppercase tracking-wide">ชื่ออะไหล่ <span className="text-red-500">*</span></label>
                <input required className="w-full bg-slate-50 border border-slate-200 p-2 rounded-xl font-bold outline-none" placeholder="เช่น Solenoid Valve 24VDC" value={newPart.name} onChange={e => setNewPart({...newPart, name: e.target.value})} />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label className="block text-[9px] font-black text-slate-500 uppercase tracking-wide">รหัส QR Code <span className="text-red-500">*</span></label>
                  <input required className="w-full bg-slate-50 border border-slate-200 p-2 rounded-xl font-mono font-bold text-blue-600 outline-none" placeholder="SP-XXXX" value={newPart.code} onChange={e => setNewPart({...newPart, code: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <label className="block text-[9px] font-black text-slate-500 uppercase tracking-wide">เครื่องจักรหลัก <span className="text-red-500">*</span></label>
                  <input required className="w-full bg-slate-50 border border-slate-200 p-2 rounded-xl font-bold outline-none" placeholder="เช่น Extruder 01" value={newPart.machine} onChange={e => setNewPart({...newPart, machine: e.target.value})} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label className="block text-[9px] font-black text-slate-500 uppercase tracking-wide">แบรนด์ (Brand)</label>
                  <input className="w-full bg-slate-50 border border-slate-200 p-2 rounded-xl font-bold outline-none" placeholder="เช่น SMC, AirTAC, Mitsubishi" value={newPart.brand || ''} onChange={e => setNewPart({...newPart, brand: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <label className="block text-[9px] font-black text-slate-500 uppercase tracking-wide">รุ่น / ซีเรียล (Model/Serial)</label>
                  <input className="w-full bg-slate-50 border border-slate-200 p-2 rounded-xl font-bold outline-none" placeholder="เช่น SY5120-5G, FX3U-48MR" value={newPart.modelSerial || ''} onChange={e => setNewPart({...newPart, modelSerial: e.target.value})} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label className="block text-[9px] font-black text-slate-500 uppercase tracking-wide">ตำแหน่งจัดเก็บ <span className="text-red-500">*</span></label>
                  <input required className="w-full bg-slate-50 border border-slate-200 p-2 rounded-xl font-bold outline-none" placeholder="เช่น Cabinet A Shelf 2" value={newPart.location} onChange={e => setNewPart({...newPart, location: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <label className="block text-[9px] font-black text-slate-500 uppercase tracking-wide">แจ้งเตือนขั้นต่ำ <span className="text-red-500">*</span></label>
                  <input type="number" required min="1" className="w-full bg-slate-50 border border-slate-200 p-2 rounded-xl font-bold outline-none text-red-600" value={newPart.minStock} onChange={e => setNewPart({...newPart, minStock: Number(e.target.value)})} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label className="block text-[9px] font-black text-slate-500 uppercase tracking-wide">จำนวนตั้งต้น <span className="text-red-500">*</span></label>
                  <input type="number" required min="0" className="w-full bg-slate-50 border border-slate-200 p-2 rounded-xl font-bold outline-none" value={newPart.initialStock} onChange={e => setNewPart({...newPart, initialStock: Number(e.target.value)})} />
                </div>
                <div className="space-y-1">
                  <label className="block text-[9px] font-black text-slate-500 uppercase tracking-wide">ราคา/หน่วย (บาท) <span className="text-red-500">*</span></label>
                  <input type="number" step="0.01" required min="0" className="w-full bg-slate-50 border border-slate-200 p-2 rounded-xl font-bold outline-none" value={newPart.unitPrice} onChange={e => setNewPart({...newPart, unitPrice: Number(e.target.value)})} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2">
                <button 
                  type="button" 
                  onClick={() => setIsAddModalOpen(false)}
                  className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 py-2 rounded-xl font-bold tracking-wider uppercase transition-all cursor-pointer border border-slate-200"
                >
                  ยกเลิก
                </button>
                <button 
                  type="submit" 
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-xl font-bold tracking-wider uppercase transition-all cursor-pointer shadow-md shadow-blue-500/10"
                >
                  ลงทะเบียน
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT PART (Supports direct target stock edit for Admin) */}
      {isEditModalOpen && editingPart && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md flex items-center justify-center z-[100] p-4 animate-fade-in">
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full shadow-2xl overflow-y-auto max-h-[90vh] space-y-3">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <h3 className="text-xs font-black text-blue-600 uppercase tracking-wider flex items-center gap-1.5">
                <Edit2 size={13} /> แก้ไขข้อมูลอะไหล่
              </h3>
              <button onClick={() => { setIsEditModalOpen(false); setEditingPart(null); }} className="text-slate-400 hover:text-slate-600 cursor-pointer"><X size={16} /></button>
            </div>
            
            <form onSubmit={handleUpdatePart} className="space-y-2.5 text-xs">
              <div className="space-y-1">
                <label className="block text-[9px] font-black text-slate-500 uppercase tracking-wide">ชื่ออะไหล่ <span className="text-red-500">*</span></label>
                <input required className="w-full bg-slate-50 border border-slate-200 p-2 rounded-xl font-bold outline-none" placeholder="ชื่อเรียกอะไหล่" value={editingPart.name} onChange={e => setEditingPart({...editingPart, name: e.target.value})} />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label className="block text-[9px] font-black text-slate-500 uppercase tracking-wide">รหัส QR Code <span className="text-red-500">*</span></label>
                  <input required className="w-full bg-slate-50 border border-slate-200 p-2 rounded-xl font-mono font-bold text-blue-600 outline-none" placeholder="รหัส QR" value={editingPart.code} onChange={e => setEditingPart({...editingPart, code: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <label className="block text-[9px] font-black text-slate-500 uppercase tracking-wide">เครื่องจักรหลัก <span className="text-red-500">*</span></label>
                  <input required className="w-full bg-slate-50 border border-slate-200 p-2 rounded-xl font-bold outline-none" placeholder="เครื่องจักรหลัก" value={editingPart.machine} onChange={e => setEditingPart({...editingPart, machine: e.target.value})} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label className="block text-[9px] font-black text-slate-500 uppercase tracking-wide">แบรนด์ (Brand)</label>
                  <input className="w-full bg-slate-50 border border-slate-200 p-2 rounded-xl font-bold outline-none" placeholder="เช่น SMC, AirTAC, Omron" value={editingPart.brand || ''} onChange={e => setEditingPart({...editingPart, brand: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <label className="block text-[9px] font-black text-slate-500 uppercase tracking-wide">รุ่น / ซีเรียล (Model/Serial)</label>
                  <input className="w-full bg-slate-50 border border-slate-200 p-2 rounded-xl font-bold outline-none" placeholder="เช่น SY5120-5G" value={editingPart.modelSerial || ''} onChange={e => setEditingPart({...editingPart, modelSerial: e.target.value})} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label className="block text-[9px] font-black text-slate-500 uppercase tracking-wide">ตำแหน่งจัดเก็บ <span className="text-red-500">*</span></label>
                  <input required className="w-full bg-slate-50 border border-slate-200 p-2 rounded-xl font-bold outline-none" placeholder="ตำแหน่งจัดเก็บ" value={editingPart.location} onChange={e => setEditingPart({...editingPart, location: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <label className="block text-[9px] font-black text-slate-500 uppercase tracking-wide">แจ้งเตือนขั้นต่ำ <span className="text-red-500">*</span></label>
                  <input type="number" required min="1" className="w-full bg-slate-50 border border-slate-200 p-2 rounded-xl font-bold outline-none text-red-600" value={editingPart.minStock} onChange={e => setEditingPart({...editingPart, minStock: Number(e.target.value)})} />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-[9px] font-black text-slate-500 uppercase tracking-wide">ราคา/หน่วย (บาท) <span className="text-red-500">*</span></label>
                <input type="number" step="0.01" required min="0" className="w-full bg-slate-50 border border-slate-200 p-2 rounded-xl font-bold outline-none" value={editingPart.unitPrice} onChange={e => setEditingPart({...editingPart, unitPrice: Number(e.target.value)})} />
              </div>

              {/* Admin Stock Count Adjustment inside edit form */}
              {isAdmin && (
                <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl space-y-1.5 mt-2">
                  <div className="flex justify-between items-center">
                    <label className="block text-[9px] font-black text-amber-800 uppercase tracking-wider flex items-center gap-1">
                      <SlidersHorizontal size={11} /> แก้ไขยอดคงเหลือจริง (Admin Stock Count)
                    </label>
                    <span className="text-[10px] text-amber-700 font-bold">ปัจจุบัน: {editingPart.currentStock} ชิ้น</span>
                  </div>
                  <input 
                    type="number" 
                    min="0" 
                    className="w-full bg-white border border-amber-300 p-2 rounded-lg font-mono font-bold text-amber-900 outline-none text-sm" 
                    value={editingPart.targetStock !== undefined ? editingPart.targetStock : editingPart.currentStock} 
                    onChange={e => setEditingPart({...editingPart, targetStock: Number(e.target.value)})} 
                  />
                  <p className="text-[9px] text-amber-600 font-medium leading-tight">
                    * หากตรวจนับแล้วพบว่ายอดไม่ตรง สามารถแก้จำนวนในช่องนี้ได้ ระบบจะปรับปรุงประวัติการตรวจนับให้อัตโนมัติ
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 pt-2">
                <button 
                  type="button" 
                  onClick={() => { setIsEditModalOpen(false); setEditingPart(null); }}
                  className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 py-2 rounded-xl font-bold tracking-wider uppercase transition-all cursor-pointer border border-slate-200"
                >
                  ยกเลิก
                </button>
                <button 
                  type="submit" 
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-xl font-bold tracking-wider uppercase transition-all cursor-pointer shadow-md"
                >
                  บันทึก
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADMIN DIRECT STOCK ADJUSTMENT */}
      {isAdjustModalOpen && adjustingPart && (
        <div className="fixed inset-0 bg-slate-900/75 backdrop-blur-md flex items-center justify-center z-[100] p-4 animate-fade-in">
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full shadow-2xl space-y-3.5">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <h3 className="text-xs font-black uppercase tracking-wider text-amber-700 flex items-center gap-1.5">
                <SlidersHorizontal size={14} />
                ปรับปรุงยอดสต็อกจริง (Stock Adjustment)
              </h3>
              <button 
                onClick={() => { setIsAdjustModalOpen(false); setAdjustingPart(null); }} 
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Part Summary Card */}
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80 space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-extrabold text-slate-900 text-xs">{adjustingPart.name}</p>
                  <p className="text-[10px] font-bold text-blue-600 font-mono">{adjustingPart.code}</p>
                </div>
                <span className="text-[10px] font-mono text-slate-500 font-semibold bg-white px-2 py-0.5 rounded border border-slate-200">
                  {adjustingPart.location || '-'}
                </span>
              </div>
              {(adjustingPart.brand || adjustingPart.modelSerial) && (
                <div className="flex flex-wrap gap-1.5 text-[9px] text-slate-500 font-semibold pt-1 border-t border-slate-200/60">
                  {adjustingPart.brand && <span>แบรนด์: <strong>{adjustingPart.brand}</strong></span>}
                  {adjustingPart.modelSerial && <span>รุ่น: <strong>{adjustingPart.modelSerial}</strong></span>}
                </div>
              )}
            </div>

            <form onSubmit={handleAdjustStock} className="space-y-3 text-xs">
              {/* Current vs Target Quantity */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-2.5 bg-slate-100/80 rounded-xl border border-slate-200 text-center">
                  <span className="text-[9px] font-black text-slate-500 uppercase block tracking-wider mb-0.5">ยอดในระบบปัจจุบัน</span>
                  <span className="text-xl font-mono font-black text-slate-800">{adjustData.currentStock}</span>
                  <span className="text-[9px] text-slate-400 block font-semibold">ชิ้น</span>
                </div>

                <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-200 text-center">
                  <span className="text-[9px] font-black text-amber-800 uppercase block tracking-wider mb-0.5">จำนวนนับจริง (Target)</span>
                  <div className="flex items-center justify-center gap-1.5 mt-0.5">
                    <button 
                      type="button" 
                      onClick={() => setAdjustData(prev => ({ ...prev, targetStock: Math.max(0, prev.targetStock - 1) }))}
                      className="w-6 h-6 rounded-full bg-white hover:bg-amber-100 border border-amber-300 text-xs font-bold flex items-center justify-center cursor-pointer select-none"
                    >
                      -
                    </button>
                    <input 
                      type="number" 
                      required 
                      min="0" 
                      className="w-12 text-xl font-mono font-black text-center bg-transparent outline-none text-amber-900" 
                      value={adjustData.targetStock} 
                      onChange={e => setAdjustData({ ...adjustData, targetStock: Math.max(0, parseInt(e.target.value, 10) || 0) })} 
                    />
                    <button 
                      type="button" 
                      onClick={() => setAdjustData(prev => ({ ...prev, targetStock: prev.targetStock + 1 }))}
                      className="w-6 h-6 rounded-full bg-white hover:bg-amber-100 border border-amber-300 text-xs font-bold flex items-center justify-center cursor-pointer select-none"
                    >
                      +
                    </button>
                  </div>
                  <span className="text-[9px] text-amber-600 block font-semibold">ชิ้น</span>
                </div>
              </div>

              {/* Difference badge */}
              <div className="text-center py-1 bg-slate-50 rounded-lg border border-slate-200/60 font-bold text-xs">
                {(() => {
                  const diff = adjustData.targetStock - adjustData.currentStock;
                  if (diff > 0) {
                    return <span className="text-emerald-600">ผลการปรับ: เพิ่มขึ้น +{diff} ชิ้น (บันทึกรับเข้าปรับยอด)</span>;
                  } else if (diff < 0) {
                    return <span className="text-rose-600">ผลการปรับ: ลดลง {diff} ชิ้น (บันทึกตัดยอดออก)</span>;
                  } else {
                    return <span className="text-slate-500">ผลการปรับ: ยอดตรงกัน (ไม่มีการเปลี่ยนแปลง)</span>;
                  }
                })()}
              </div>

              {/* Reason selector */}
              <div className="space-y-1">
                <label className="block text-[9px] font-black text-slate-500 uppercase tracking-wide">
                  สาเหตุการปรับยอดสต็อก <span className="text-red-500">*</span>
                </label>
                <select 
                  value={adjustData.reason} 
                  onChange={e => setAdjustData({ ...adjustData, reason: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 p-2 rounded-xl font-bold text-slate-700 outline-none cursor-pointer"
                >
                  <option value="ตรวจนับสต็อกจริงพบจำนวนไม่ตรง">ตรวจนับสต็อกจริงพบจำนวนไม่ตรง</option>
                  <option value="ของชำรุดเสียหาย/เสื่อมสภาพ ตัดยอดออก">ของชำรุดเสียหาย/เสื่อมสภาพ ตัดยอดออก</option>
                  <option value="รับเข้าสต็อกตกหล่น">รับเข้าสต็อกตกหล่น</option>
                  <option value="เบิกใช้งานหน้างานโดยไม่ได้บันทึก">เบิกใช้งานหน้างานโดยไม่ได้บันทึก</option>
                  <option value="custom">ระบุเหตุผลอื่นๆ...</option>
                </select>
              </div>

              {adjustData.reason === 'custom' && (
                <div className="space-y-1">
                  <label className="block text-[9px] font-black text-slate-500 uppercase tracking-wide">
                    ระบุรายละเอียดสาเหตุ <span className="text-red-500">*</span>
                  </label>
                  <input 
                    required 
                    className="w-full bg-slate-50 border border-slate-200 p-2 rounded-xl font-bold outline-none text-slate-800" 
                    placeholder="เช่น ปรับยอดจากการย้ายตู้จัดเก็บ"
                    value={adjustData.customReason} 
                    onChange={e => setAdjustData({ ...adjustData, customReason: e.target.value })} 
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button 
                  type="button"
                  onClick={() => { setIsAdjustModalOpen(false); setAdjustingPart(null); }}
                  className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold tracking-wider uppercase transition-all cursor-pointer border border-slate-200"
                >
                  ยกเลิก
                </button>
                <button 
                  type="submit" 
                  className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold tracking-wider uppercase transition-all cursor-pointer shadow-md"
                >
                  บันทึกปรับยอด
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: TRANSACTION IN/OUT */}
      {selectedPart && transactionType && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md flex items-center justify-center z-[100] p-4 animate-fade-in">
          <div className="bg-white rounded-2xl p-5 max-w-xs md:max-w-sm w-full shadow-2xl space-y-3">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <h3 className={`text-xs font-black uppercase tracking-wider ${transactionType === 'in' ? 'text-green-600' : 'text-orange-600'}`}>
                {transactionType === 'in' ? 'รับอะไหล่เข้าคลัง' : 'เบิกอะไหล่ไปใช้งาน'}
              </h3>
              <button onClick={() => setSelectedPart(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer"><X size={16} /></button>
            </div>

            <form onSubmit={handleTransaction} className="space-y-3 text-xs">
              <div className="bg-slate-50 p-2.5 rounded-xl flex items-center gap-3 border border-slate-100">
                <div className="w-9 h-9 bg-white rounded-lg border border-slate-200 flex items-center justify-center shrink-0">
                  <Box size={16} className="text-slate-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-extrabold text-slate-800 text-xs truncate">{selectedPart.name}</p>
                  <p className="text-[9px] font-black text-blue-600 font-mono">{selectedPart.code}</p>
                </div>
              </div>

              {transactionType === 'out' && (
                <div className="space-y-1">
                  <label className="block text-[9px] font-black text-slate-500 uppercase tracking-wide">เครื่องจักรเป้าหมายที่นำไปใช้ <span className="text-red-500">*</span></label>
                  <input required className="w-full bg-slate-50 border border-slate-200 p-2 rounded-xl font-bold outline-none" placeholder="ระบุชื่อหรือรหัสเครื่องจักร" value={transactionData.machineTarget} onChange={e => setTransactionData({...transactionData, machineTarget: e.target.value})} />
                </div>
              )}

              <div className="space-y-1">
                <label className="block text-[9px] font-black text-slate-500 uppercase tracking-wide">ชื่อผู้ทำรายการ <span className="text-red-500">*</span></label>
                <input required className="w-full bg-slate-50 border border-slate-200 p-2 rounded-xl font-bold outline-none" placeholder="ชื่อสกุลผู้เบิก/รับ" value={transactionData.user} onChange={e => setTransactionData({...transactionData, user: e.target.value})} />
              </div>

              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 flex flex-col items-center">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">จำนวนที่ต้องการ (ชิ้น/หน่วย)</label>
                <div className="flex items-center gap-3">
                  <button 
                    type="button" 
                    onClick={() => setTransactionData(prev => ({ ...prev, amount: String(Math.max(1, Number(prev.amount) - 1)) }))}
                    className="w-7 h-7 rounded-full bg-white hover:bg-slate-100 border border-slate-200 text-sm font-bold flex items-center justify-center cursor-pointer select-none"
                  >
                    -
                  </button>
                  <input 
                    type="number" 
                    required 
                    min="1" 
                    className="w-12 text-2xl font-black text-center bg-transparent outline-none py-0.5 font-mono" 
                    value={transactionData.amount} 
                    onChange={e => setTransactionData({...transactionData, amount: e.target.value})} 
                  />
                  <button 
                    type="button" 
                    onClick={() => setTransactionData(prev => ({ ...prev, amount: String(Number(prev.amount) + 1) }))}
                    className="w-7 h-7 rounded-full bg-white hover:bg-slate-100 border border-slate-200 text-sm font-bold flex items-center justify-center cursor-pointer select-none"
                  >
                    +
                  </button>
                </div>
                <p className="text-[9px] font-bold text-slate-400 mt-1">คงเหลือในคลัง: {calculateStock(selectedPart)} ชิ้น</p>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button 
                  type="button"
                  onClick={() => setSelectedPart(null)}
                  className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold tracking-wider uppercase transition-all cursor-pointer border border-slate-200"
                >
                  ยกเลิก
                </button>
                <button 
                  type="submit" 
                  className={`w-full py-2 text-white rounded-xl font-bold tracking-wider uppercase transition-all cursor-pointer shadow-md ${transactionType === 'in' ? 'bg-green-600 hover:bg-green-700' : 'bg-orange-600 hover:bg-orange-700'}`}
                >
                  ยืนยัน
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: DELETE CONFIRMATION */}
      {deleteConfirmPart && (
        <div className="fixed inset-0 bg-slate-900/75 backdrop-blur-md flex items-center justify-center z-[100] p-4 animate-fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl text-center space-y-4">
            <div className="w-14 h-14 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto">
              <Trash2 size={28} />
            </div>
            <div>
              <h4 className="text-sm font-extrabold text-slate-900 uppercase tracking-tight">ยืนยันการลบรายการอะไหล่?</h4>
              <p className="text-[10px] text-slate-500 mt-1 leading-normal">
                คุณกำลังจะลบข้อมูลอะไหล่ "{deleteConfirmPart.name}" ออกจากระบบอย่างถาวร รายการประวัติและการบันทึกทั้งหมดของชิ้นส่วนนี้จะสูญหาย
              </p>
            </div>
            
            <div className="flex gap-3 pt-2">
              <button 
                onClick={() => setDeleteConfirmPart(null)} 
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs uppercase tracking-wider border border-slate-200 transition-colors cursor-pointer"
              >
                ยกเลิก
              </button>
              <button 
                onClick={handleDeletePart} 
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-xs uppercase tracking-wider shadow-md transition-colors cursor-pointer"
              >
                ยืนยันลบ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: QR CODE GENERATOR & PRINT */}
      {selectedPartForQr && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md flex items-center justify-center z-[100] p-4 animate-fade-in print:hidden">
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full shadow-2xl space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                <QrCode size={16} className="text-indigo-600" />
                พิมพ์ QR Code อะไหล่
              </h3>
              <button 
                onClick={() => { setSelectedPartForQr(null); }} 
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex flex-col items-center space-y-3">
              {/* Sticker Preview */}
              <div className="w-full bg-slate-50 p-4 rounded-xl border border-slate-200/60 flex flex-col items-center">
                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-2">ตัวอย่างสติกเกอร์ (Sticker Preview)</p>
                
                <div className="bg-white border-2 border-slate-800 p-4 rounded-xl w-full flex flex-col items-center text-center max-w-[240px] shadow-sm text-slate-800">
                  <div className="text-[9px] font-black uppercase tracking-wider border-b border-slate-800 pb-1 w-full text-slate-700">
                    Maintenance Spare Part
                  </div>
                  
                  {qrUrl ? (
                    <img src={qrUrl} className="w-32 h-32 my-2 select-none" alt="QR Code" />
                  ) : (
                    <div className="w-32 h-32 my-2 bg-slate-100 rounded flex items-center justify-center text-[10px] text-slate-400 font-bold">
                      กำลังสร้าง QR...
                    </div>
                  )}

                  <div className="text-left w-full space-y-1 text-slate-800">
                    <p className="text-[11px] font-black truncate leading-tight">
                      <span className="text-[8px] font-bold text-slate-400 block tracking-wider uppercase">ชื่ออะไหล่ / Name</span>
                      {selectedPartForQr.name}
                    </p>
                    <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                      <div>
                        <span className="text-[8px] font-bold text-slate-400 block tracking-wider uppercase">รหัส / Code</span>
                        <p className="text-[10px] font-black font-mono text-indigo-600">{selectedPartForQr.code}</p>
                      </div>
                      <div>
                        <span className="text-[8px] font-bold text-slate-400 block tracking-wider uppercase">ตำแหน่ง / Loc</span>
                        <p className="text-[10px] font-bold text-slate-600 truncate">{selectedPartForQr.location || '-'}</p>
                      </div>
                    </div>
                    {(selectedPartForQr.brand || selectedPartForQr.modelSerial) && (
                      <div className="grid grid-cols-2 gap-1.5 pt-0.5 border-t border-slate-100 mt-1">
                        {selectedPartForQr.brand && (
                          <div>
                            <span className="text-[8px] font-bold text-slate-400 block tracking-wider uppercase">แบรนด์</span>
                            <p className="text-[9px] font-semibold text-slate-600 truncate">{selectedPartForQr.brand}</p>
                          </div>
                        )}
                        {selectedPartForQr.modelSerial && (
                          <div>
                            <span className="text-[8px] font-bold text-slate-400 block tracking-wider uppercase">รุ่น/ซีเรียล</span>
                            <p className="text-[9px] font-semibold text-slate-600 truncate">{selectedPartForQr.modelSerial}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button 
                type="button"
                onClick={() => setSelectedPartForQr(null)}
                className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold tracking-wider uppercase transition-all cursor-pointer border border-slate-200 text-[11px]"
              >
                ปิดหน้าต่าง
              </button>
              <button 
                type="button" 
                onClick={() => window.print()}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold tracking-wider uppercase transition-all cursor-pointer shadow-md shadow-indigo-600/10 flex items-center justify-center gap-1.5 text-[11px]"
              >
                <Printer size={14} />
                พิมพ์สติกเกอร์
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PRINT-ONLY SECTION (Only visible via @media print) */}
      {selectedPartForQr && (
        <div id="print-section" className="hidden">
          <div className="border-[3px] border-black p-5 rounded-2xl w-[260px] flex flex-col items-center text-center bg-white text-black font-sans">
            <div className="text-[10px] font-black uppercase tracking-widest border-b-2 border-black pb-1.5 w-full">
              MAINTENANCE SPARE PART
            </div>
            
            {qrUrl && (
              <img src={qrUrl} className="w-40 h-40 my-3" alt="QR Code" />
            )}

            <div className="text-left w-full space-y-1.5">
              <div className="border-b border-dashed border-slate-300 pb-1">
                <span className="text-[8px] font-black text-slate-500 block tracking-wider uppercase">ชื่ออะไหล่ / PART NAME</span>
                <p className="text-xs font-extrabold text-black leading-tight break-words">{selectedPartForQr.name}</p>
              </div>
              
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[8px] font-black text-slate-500 block tracking-wider uppercase">รหัสอะไหล่ / CODE</span>
                  <p className="text-[11px] font-black font-mono text-black">{selectedPartForQr.code}</p>
                </div>
                <div>
                  <span className="text-[8px] font-black text-slate-500 block tracking-wider uppercase">ตำแหน่งจัดเก็บ / LOCATION</span>
                  <p className="text-[11px] font-bold text-black">{selectedPartForQr.location || '-'}</p>
                </div>
              </div>

              {(selectedPartForQr.brand || selectedPartForQr.modelSerial) && (
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-dashed border-slate-200 mt-1">
                  {selectedPartForQr.brand && (
                    <div>
                      <span className="text-[8px] font-black text-slate-500 block tracking-wider uppercase">แบรนด์ / BRAND</span>
                      <p className="text-[10px] font-bold text-black truncate">{selectedPartForQr.brand}</p>
                    </div>
                  )}
                  {selectedPartForQr.modelSerial && (
                    <div>
                      <span className="text-[8px] font-black text-slate-500 block tracking-wider uppercase">รุ่น/ซีเรียล / MODEL</span>
                      <p className="text-[10px] font-bold text-black truncate">{selectedPartForQr.modelSerial}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
