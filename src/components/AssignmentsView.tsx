import React, { useState, useEffect } from 'react';
import { 
  collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc 
} from 'firebase/firestore';
import { 
  Calendar, Clock, User, CheckCircle, Play, Plus, Trash2, 
  AlertCircle, Hammer, Check, FileText, X, ChevronRight, UserCheck, Timer
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Assignment, Ticket, UserProfile } from '../types';

interface AssignmentsViewProps {
  appId: string;
  currentUserProfile: UserProfile | null;
  tickets: Ticket[];
  onToast: (msg: string) => void;
}

export default function AssignmentsView({ appId, currentUserProfile, tickets, onToast }: AssignmentsViewProps) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);
  
  // ดึงรายชื่อช่างเทคนิคที่มีการรับงานซ่อมแซมแล้วจากประวัติใบแจ้งซ่อมจริง
  const ticketTechnicians = Array.from(new Set(
    tickets
      .map(t => t.repairDetails?.technician?.trim())
      .filter((tech): tech is string => typeof tech === 'string' && tech !== '')
  ));

  // Create Assignment form state
  const [assignedTech, setAssignedTech] = useState('');
  const [customTechName, setCustomTechName] = useState('');
  const [isCustomTech, setIsCustomTech] = useState(false);
  const [taskDetails, setTaskDetails] = useState('');
  const [deadline, setDeadline] = useState('');
  const [linkedTicketId, setLinkedTicketId] = useState('');

  // Complete Assignment form state
  const [actionsTaken, setActionsTaken] = useState('');
  const [completedAt, setCompletedAt] = useState('');

  // Filtering states
  const [filterTech, setFilterTech] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  // Load assignments from Firestore
  useEffect(() => {
    setLoading(true);
    const assignmentsCollection = collection(db, 'artifacts', appId, 'public', 'data', 'assignments');
    
    const unsubscribe = onSnapshot(assignmentsCollection, 
      (snapshot) => {
        const data = snapshot.docs.map(doc => ({ 
          id: doc.id, 
          ...doc.data() 
        })) as Assignment[];
        
        setAssignments(data.sort((a, b) => b.createdAt - a.createdAt));
        setLoading(false);
      }, 
      (error) => {
        handleFirestoreError(error, OperationType.GET, `artifacts/${appId}/public/data/assignments`);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [appId]);

  // Sync default assignedTech or isCustomTech when the form opens
  useEffect(() => {
    if (showCreateForm) {
      if (ticketTechnicians.length > 0) {
        setAssignedTech(ticketTechnicians[0]);
        setIsCustomTech(false);
      } else {
        setIsCustomTech(true);
        setAssignedTech('');
      }
      setCustomTechName('');
    }
  }, [showCreateForm, tickets]);

  // Set default deadline to today + 1 day
  useEffect(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(17, 0, 0, 0);
    const pad = (n: number) => n.toString().padStart(2, '0');
    setDeadline(`${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}T17:00`);
  }, []);

  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskDetails.trim() || !deadline) return;

    const finalTechName = isCustomTech ? customTechName.trim() : assignedTech;
    if (!finalTechName) {
      alert('กรุณาระบุชื่อช่างเทคนิค');
      return;
    }

    try {
      const newAssignment = {
        technicianName: finalTechName,
        taskDetails: taskDetails.trim(),
        deadline: deadline,
        status: 'assigned' as const,
        createdBy: currentUserProfile?.name || 'Supervisor',
        createdAt: Date.now(),
        ticketId: linkedTicketId || '',
        actionsTaken: '',
        acceptedAt: '',
        completedAt: ''
      };

      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'assignments'), newAssignment);
      onToast('มอบหมายงานให้ช่างเรียบร้อยแล้ว (Assignment created)');
      
      // Reset form
      setTaskDetails('');
      setCustomTechName('');
      setLinkedTicketId('');
      setShowCreateForm(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `artifacts/${appId}/public/data/assignments`);
    }
  };

  const handleAcceptAssignment = async (assignment: Assignment) => {
    try {
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'assignments', assignment.id);
      const now = new Date();
      const pad = (n: number) => n.toString().padStart(2, '0');
      const nowString = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

      await updateDoc(docRef, {
        status: 'in_progress',
        acceptedAt: nowString
      });

      // If linked to a ticket, optionally update the ticket status/logs
      if (assignment.ticketId) {
        // Can optionally log or partially update, but keeping it simple as per spec
      }

      onToast('รับงานเรียบร้อยแล้ว! (Assignment started)');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `artifacts/${appId}/public/data/assignments/${assignment.id}`);
    }
  };

  const handleOpenCompleteForm = (assignment: Assignment) => {
    setSelectedAssignmentId(assignment.id);
    setActionsTaken('');
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    setCompletedAt(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`);
  };

  const handleCompleteAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAssignmentId || !actionsTaken.trim() || !completedAt) return;

    try {
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'assignments', selectedAssignmentId);
      
      // Format completed datetime-local string to clean Thai format
      const dateObj = new Date(completedAt);
      const pad = (n: number) => n.toString().padStart(2, '0');
      const formattedCompletedAt = `${pad(dateObj.getDate())}/${pad(dateObj.getMonth() + 1)}/${dateObj.getFullYear()} ${pad(dateObj.getHours())}:${pad(dateObj.getMinutes())}`;

      await updateDoc(docRef, {
        status: 'completed',
        actionsTaken: actionsTaken.trim(),
        completedAt: formattedCompletedAt
      });

      onToast('บันทึกผลการทำงานและปิดงานเสร็จสิ้น!');
      setSelectedAssignmentId(null);
      setActionsTaken('');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `artifacts/${appId}/public/data/assignments/${selectedAssignmentId}`);
    }
  };

  const handleDeleteAssignment = async (assignmentId: string) => {
    if (!window.confirm('คุณแน่ใจที่จะลบรายการมอบหมายงานนี้ใช่หรือไม่?')) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'assignments', assignmentId));
      onToast('ลบรายการมอบหมายงานแล้ว');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `artifacts/${appId}/public/data/assignments/${assignmentId}`);
    }
  };

  // Filter assignments
  const filteredAssignments = assignments.filter(item => {
    // Technician filter
    if (filterTech !== 'all') {
      if (filterTech === 'my' && currentUserProfile) {
        // Match user's name exactly or partially (e.g. Somchai vs ช่างสมชาย)
        const myName = currentUserProfile.name.toLowerCase();
        const techName = item.technicianName.toLowerCase();
        if (!techName.includes(myName) && !myName.includes(techName)) return false;
      } else if (filterTech !== 'my') {
        if (item.technicianName !== filterTech) return false;
      }
    }
    // Status filter
    if (filterStatus !== 'all' && item.status !== filterStatus) return false;

    return true;
  });

  const getStatusBadge = (status: Assignment['status']) => {
    switch (status) {
      case 'completed':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <CheckCircle className="w-3 h-3 mr-1" /> เสร็จสิ้น (Completed)
          </span>
        );
      case 'in_progress':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 animate-pulse">
            <Clock className="w-3 h-3 mr-1 animate-spin" /> กำลังดำเนินการ (In Progress)
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
            <UserCheck className="w-3 h-3 mr-1" /> มอบหมายแล้ว (Assigned)
          </span>
        );
    }
  };

  const isOverdue = (deadlineStr: string, status: Assignment['status']) => {
    if (status === 'completed') return false;
    try {
      const deadDate = new Date(deadlineStr);
      return deadDate < new Date();
    } catch (e) {
      return false;
    }
  };

  const formatDateTime = (dateTimeStr: string) => {
    if (!dateTimeStr) return '-';
    try {
      const d = new Date(dateTimeStr);
      if (isNaN(d.getTime())) return dateTimeStr; // Return as-is if fallback
      const pad = (n: number) => n.toString().padStart(2, '0');
      return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())} น.`;
    } catch (e) {
      return dateTimeStr;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-base font-black text-slate-800 flex items-center gap-2">
            <Hammer className="w-5 h-5 text-slate-700" />
            ระบบมอบหมายงานช่างเทคนิค (Task Assignment System)
          </h2>
          <p className="text-slate-500 text-xs mt-1">
            {currentUserProfile?.role === 'admin' 
              ? 'มอบหมายและติดตามสถานะการดำเนินงานของช่างแต่ละคน' 
              : 'รายการและสถานะงานทั้งหมดที่คุณได้รับมอบหมายเพื่อปฏิบัติการซ่อมบำรุง'}
          </p>
        </div>

        {currentUserProfile?.role === 'admin' && (
          <button
            id="btn-toggle-create-assignment"
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="flex items-center justify-center gap-1.5 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 text-xs font-bold uppercase tracking-wider transition-all shadow-md shadow-slate-900/10 cursor-pointer"
          >
            {showCreateForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            {showCreateForm ? 'ปิดแบบฟอร์ม' : 'มอบหมายงานใหม่'}
          </button>
        )}
      </div>

      {/* Assignment Creator Form (Admin only) */}
      {currentUserProfile?.role === 'admin' && showCreateForm && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 shadow-inner animate-fade-in">
          <h3 className="text-xs font-black uppercase text-slate-700 tracking-wider mb-4 flex items-center gap-1.5">
            <Plus className="w-4 h-4" /> สร้างใบมอบหมายงานใหม่
          </h3>
          <form onSubmit={handleCreateAssignment} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Tech selector */}
              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">ช่างเทคนิคผู้รับผิดชอบ (Assigned Technician)</label>
                <div className="flex gap-2">
                  {ticketTechnicians.length > 0 ? (
                    <div className="flex-1 flex gap-2">
                      <select
                        id="select-assign-tech"
                        value={isCustomTech ? 'custom' : assignedTech}
                        onChange={(e) => {
                          if (e.target.value === 'custom') {
                            setIsCustomTech(true);
                          } else {
                            setIsCustomTech(false);
                            setAssignedTech(e.target.value);
                          }
                        }}
                        className="flex-1 px-3 py-2 bg-white border border-slate-200 focus:border-slate-800 rounded-lg text-xs outline-none transition-all shadow-sm font-bold"
                      >
                        {ticketTechnicians.map(tech => (
                          <option key={tech} value={tech}>{tech}</option>
                        ))}
                        <option value="custom">+ พิมพ์ระบุชื่อช่างคนอื่น...</option>
                      </select>

                      {isCustomTech && (
                        <input
                          id="input-assign-tech-custom"
                          type="text"
                          required
                          placeholder="พิมพ์ระบุชื่อช่างเทคนิค"
                          value={customTechName}
                          onChange={(e) => setCustomTechName(e.target.value)}
                          className="flex-1 px-3 py-2 bg-white border border-slate-200 focus:border-slate-800 rounded-lg text-xs outline-none transition-all shadow-sm"
                        />
                      )}
                    </div>
                  ) : (
                    <div className="flex-1 space-y-1">
                      <input
                        id="input-assign-tech-custom"
                        type="text"
                        required
                        placeholder="ไม่มีประวัติรายชื่อช่าง กรุณาพิมพ์ระบุชื่อช่างตรงนี้"
                        value={customTechName}
                        onChange={(e) => {
                          setCustomTechName(e.target.value);
                          setIsCustomTech(true);
                        }}
                        className="w-full px-3 py-2 bg-white border border-slate-200 focus:border-slate-800 rounded-lg text-xs outline-none transition-all shadow-sm font-bold"
                      />
                      <p className="text-[9px] text-amber-600 font-bold">
                        ⚠️ ไม่พบรายชื่อช่างที่รับงานซ่อมแซมเดิมในระบบ กรุณาพิมพ์ระบุชื่อช่างโดยตรง
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Deadline */}
              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">กำหนดเสร็จภายในเมื่อไร (Target Completion Deadline)</label>
                <input
                  id="input-assign-deadline"
                  type="datetime-local"
                  required
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 focus:border-slate-800 rounded-lg text-xs outline-none transition-all shadow-sm"
                />
              </div>
            </div>

            {/* Link to existing ticket */}
            <div>
              <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">เชื่อมโยงกับใบแจ้งซ่อม (Link to Maintenance Ticket - Optional)</label>
              <select
                id="select-assign-linked-ticket"
                value={linkedTicketId}
                onChange={(e) => {
                  const val = e.target.value;
                  setLinkedTicketId(val);
                  // Auto-fill details if linked to a ticket
                  if (val) {
                    const ticket = tickets.find(t => t.id === val);
                    if (ticket) {
                      setTaskDetails(`ซ่อมเครื่องจักร: ${ticket.machine}\nแผนก: ${ticket.department}\nอาการชำรุด: ${ticket.issue}`);
                    }
                  }
                }}
                className="w-full px-3 py-2 bg-white border border-slate-200 focus:border-slate-800 rounded-lg text-xs outline-none transition-all shadow-sm"
              >
                <option value="">-- ไม่ระบุ (ไม่เชื่อมโยงใบแจ้งซ่อม) --</option>
                {tickets.filter(t => t.status !== 'completed').map(ticket => (
                  <option key={ticket.id} value={ticket.id}>
                    [{ticket.workType?.toUpperCase()}] {ticket.machine} - {ticket.issue.substring(0, 40)}... (ผู้แจ้ง: {ticket.requester})
                  </option>
                ))}
              </select>
            </div>

            {/* Task Details */}
            <div>
              <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">รายละเอียดงานมอบหมาย (Task details)</label>
              <textarea
                id="textarea-assign-details"
                required
                rows={3}
                placeholder="ระบุคำสั่งการดำเนินการอย่างชัดเจน อุปกรณ์จำเพาะที่ต้องพกไป หรือขั้นตอนการซ่อมบำรุง..."
                value={taskDetails}
                onChange={(e) => setTaskDetails(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 focus:border-slate-800 rounded-lg text-xs outline-none transition-all shadow-sm"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                id="btn-assign-cancel"
                onClick={() => setShowCreateForm(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-lg uppercase transition-colors cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                id="btn-assign-submit"
                className="px-5 py-2 bg-[#112d3c] hover:bg-[#1b4359] text-white text-xs font-black rounded-lg uppercase tracking-wider transition-all shadow-md cursor-pointer"
              >
                ยืนยันการมอบหมายงาน
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filters bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          {/* Tech filter dropdown */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">ช่างเทคนิค:</span>
            <select
              id="filter-assign-tech"
              value={filterTech}
              onChange={(e) => setFilterTech(e.target.value)}
              className="px-2.5 py-1 bg-slate-50 border border-slate-200 focus:border-slate-800 rounded-lg text-xs outline-none transition-all shadow-inner font-bold"
            >
              <option value="all">ทั้งหมด (All Technicians)</option>
              {currentUserProfile?.role === 'mt' && (
                <option value="my">📌 เฉพาะของฉัน (Assigned to Me)</option>
              )}
              {Array.from(new Set(assignments.map(a => a.technicianName))).map(techName => (
                <option key={techName} value={techName}>{techName}</option>
              ))}
            </select>
          </div>

          {/* Status filter dropdown */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">สถานะงาน:</span>
            <select
              id="filter-assign-status"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-2.5 py-1 bg-slate-50 border border-slate-200 focus:border-slate-800 rounded-lg text-xs outline-none transition-all shadow-inner font-bold"
            >
              <option value="all">ทุกสถานะ (All States)</option>
              <option value="assigned">รอดำเนินการ (Assigned)</option>
              <option value="in_progress">กำลังทำงาน (In Progress)</option>
              <option value="completed">เสร็จสิ้น (Completed)</option>
            </select>
          </div>
        </div>

        <div className="text-[10px] text-slate-400 font-mono font-bold uppercase tracking-wider">
          พบบันทึกทั้งหมด {filteredAssignments.length} รายการ
        </div>
      </div>

      {/* Tasks Queue / List */}
      {loading ? (
        <div className="text-center py-12 text-slate-400 text-xs animate-pulse">
          กำลังโหลดข้อมูลบันทึกมอบหมายงาน...
        </div>
      ) : filteredAssignments.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-200 rounded-xl py-12 text-center text-slate-400 text-xs">
          <Calendar className="w-8 h-8 text-slate-300 mx-auto mb-2.5" />
          ไม่มีรายการมอบหมายงานที่ตรงกับเงื่อนไขในขณะนี้
        </div>
      ) : (
        <div className="space-y-4">
          {filteredAssignments.map(assignment => {
            const overdue = isOverdue(assignment.deadline, assignment.status);
            
            return (
              <div 
                key={assignment.id}
                id={`card-assignment-${assignment.id}`}
                className={`bg-white border rounded-xl overflow-hidden shadow-sm transition-all duration-300 ${overdue ? 'border-red-300 hover:border-red-400' : 'border-slate-200/80 hover:border-slate-300'}`}
              >
                {/* Card Header Info */}
                <div className="px-4 py-3 bg-slate-50/70 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-[#112d3c] text-amber-400 flex items-center justify-center font-bold text-xs">
                      <User className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <span className="font-bold text-xs text-slate-800">{assignment.technicianName}</span>
                      <span className="text-[10px] text-slate-400 ml-1.5 font-mono">
                        (โดย {assignment.createdBy} | {new Date(assignment.createdAt).toLocaleDateString('th-TH')})
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {overdue && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-bold bg-rose-50 text-rose-600 border border-rose-200 uppercase tracking-wider animate-pulse">
                        <AlertCircle className="w-3 h-3 mr-1" /> เกินกำหนดเวลา (Overdue)
                      </span>
                    )}
                    {getStatusBadge(assignment.status)}
                  </div>
                </div>

                {/* Card Body */}
                <div className="p-4 grid grid-cols-1 md:grid-cols-12 gap-4">
                  {/* Left content block: Details and Deadline */}
                  <div className="md:col-span-8 space-y-3">
                    <div className="space-y-1">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">คำสั่ง/รายละเอียดงานมอบหมาย (Assignment details)</p>
                      <div className="text-xs text-slate-700 font-medium leading-relaxed whitespace-pre-wrap bg-slate-50/30 p-2.5 rounded-lg border border-slate-100">
                        {assignment.taskDetails}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500 font-semibold pt-1">
                      <span className="flex items-center">
                        <Calendar className="w-3.5 h-3.5 text-slate-400 mr-1.5 shrink-0" />
                        กำหนดเสร็จ: <strong className="text-slate-700 ml-1">{formatDateTime(assignment.deadline)}</strong>
                      </span>
                      {assignment.ticketId && (
                        <span className="flex items-center bg-blue-50/80 text-blue-700 border border-blue-100 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider">
                          <FileText className="w-3 h-3 mr-1" /> เชื่อมโยงใบแจ้งซ่อม
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right content block: Interactive Actions & Logs */}
                  <div className="md:col-span-4 flex flex-col justify-between border-t md:border-t-0 md:border-l border-slate-100 pt-3 md:pt-0 md:pl-4">
                    {/* Progress details log */}
                    <div className="space-y-1.5 text-[11px] text-slate-500 mb-3">
                      {assignment.acceptedAt && (
                        <p className="flex items-center">
                          <Clock className="w-3 h-3 text-amber-500 mr-1.5 shrink-0" />
                          <span>รับงานเมื่อ: <strong className="text-slate-700 font-mono">{assignment.acceptedAt}</strong></span>
                        </p>
                      )}
                      {assignment.completedAt && (
                        <div className="space-y-1.5 p-2 bg-emerald-50/40 border border-emerald-100 rounded-lg text-emerald-950">
                          <p className="flex items-center font-bold text-emerald-800">
                            <Check className="w-3 h-3 mr-1" /> เสร็จสิ้นเมื่อ: {assignment.completedAt}
                          </p>
                          <div className="text-[10px] border-t border-emerald-100/50 pt-1">
                            <p className="font-bold uppercase tracking-wider text-emerald-700 text-[8px]">รายการซ่อมบำรุงที่ปฏิบัติ (Actions Taken):</p>
                            <p className="mt-0.5 font-medium leading-relaxed italic">{assignment.actionsTaken}</p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Operational buttons for technician and admin */}
                    <div className="flex flex-wrap items-center gap-2 mt-auto">
                      {/* Accept job button (Technician only, or Admin in MT shoes) */}
                      {assignment.status === 'assigned' && (
                        <button
                          id={`btn-accept-assignment-${assignment.id}`}
                          onClick={() => handleAcceptAssignment(assignment)}
                          className="flex-1 min-w-[120px] flex items-center justify-center gap-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-lg text-xs font-black uppercase tracking-wider transition-all shadow-sm cursor-pointer"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" /> รับงานเข้าเครื่อง (Accept Work)
                        </button>
                      )}

                      {/* Complete job button */}
                      {assignment.status === 'in_progress' && selectedAssignmentId !== assignment.id && (
                        <button
                          id={`btn-complete-assignment-${assignment.id}`}
                          onClick={() => handleOpenCompleteForm(assignment)}
                          className="flex-1 min-w-[120px] flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-black uppercase tracking-wider transition-all shadow-sm cursor-pointer animate-pulse"
                        >
                          <CheckCircle className="w-3.5 h-3.5" /> บันทึกงานเสร็จสิ้น (Complete Job)
                        </button>
                      )}

                      {/* Delete assignment (Admin only) */}
                      {currentUserProfile?.role === 'admin' && (
                        <button
                          id={`btn-delete-assignment-${assignment.id}`}
                          onClick={() => handleDeleteAssignment(assignment.id)}
                          className="p-1.5 bg-slate-50 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-lg border border-slate-200 hover:border-red-200 transition-colors cursor-pointer"
                          title="ลบคำสั่งงาน"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Inline completion form */}
                {selectedAssignmentId === assignment.id && (
                  <div className="px-4 py-4 bg-slate-50 border-t border-slate-100 animate-slide-up">
                    <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                      <CheckCircle className="w-4 h-4 text-emerald-600" /> บันทึกรายงานการดำเนินการเสร็จสิ้น (Work Completion Report)
                    </h4>
                    <form onSubmit={handleCompleteAssignment} className="space-y-3.5">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                        <div className="md:col-span-2">
                          <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">รายการแก้ปัญหา/งานบำรุงรักษาที่ทำ (Actions Taken)</label>
                          <input
                            id="input-assign-actions-taken"
                            type="text"
                            required
                            placeholder="เช่น ตรวจเช็กระบบเซนเซอร์, ขัดหน้าสัมผัส, เปลี่ยนซีลยางกระบอกสูบใหม่..."
                            value={actionsTaken}
                            onChange={(e) => setActionsTaken(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-200 focus:border-slate-800 rounded-lg text-xs outline-none transition-all shadow-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">วัน เวลา ที่เสร็จสิ้น (Completion Datetime)</label>
                          <input
                            id="input-assign-completed-at"
                            type="datetime-local"
                            required
                            value={completedAt}
                            onChange={(e) => setCompletedAt(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-200 focus:border-slate-800 rounded-lg text-xs outline-none transition-all shadow-sm"
                          />
                        </div>
                      </div>

                      <div className="flex justify-end gap-2 pt-2 border-t border-slate-200/60">
                        <button
                          type="button"
                          id="btn-assign-complete-cancel"
                          onClick={() => setSelectedAssignmentId(null)}
                          className="px-3.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-lg uppercase transition-all cursor-pointer"
                        >
                          ยกเลิก
                        </button>
                        <button
                          type="submit"
                          id="btn-assign-complete-submit"
                          className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-lg uppercase tracking-wider transition-all shadow-sm cursor-pointer"
                        >
                          บันทึกปิดงาน (Save & Complete)
                        </button>
                      </div>
                    </form>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
