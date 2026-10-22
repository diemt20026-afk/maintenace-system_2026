export interface RepairDetails {
  technician: string;
  cause: string;
  solution: string;
  prevention: string;
  diagnosisTime: string;
  partsReplaced: boolean;
  partNumber: string;
  startTime: string;
  endTime: string;
  finishedAt: string;
  finishTimestamp: number;
  duration: string;
  durationMs: number;
}

export interface Ticket {
  id: string;
  date: string;
  time: string;
  timestamp: number;
  requester: string;
  employeeId: string;
  department: string;
  machine: string;
  issue: string;
  workType: 'urgent' | 'improvement' | 'repair' | 'pm';
  status: 'pending' | 'waiting_confirm' | 'completed';
  repairDetails: RepairDetails | null;
  createdBy: string;
  team?: 'A' | 'B' | 'C' | 'Office' | '';
}

export type RoleType = 'requester' | 'mt' | 'admin';

export interface UserProfile {
  role: RoleType;
  name: string;
}

export interface TicketFormData {
  requester: string;
  employeeId: string;
  department: string;
  customDepartment: string;
  machine: string;
  issue: string;
  workType: 'urgent' | 'improvement' | 'repair' | 'pm';
  team: 'A' | 'B' | 'C' | 'Office' | '';
}

export interface RepairFormData {
  technician: string;
  cause: string;
  solution: string;
  prevention: string;
  diagnosisTime: string;
  partsReplaced: boolean;
  partNumber: string;
  startTime: string;
  endTime: string;
  workType: 'urgent' | 'improvement' | 'repair' | 'pm';
}

export interface Assignment {
  id: string;
  technicianName: string;
  taskDetails: string;
  deadline: string;
  status: 'assigned' | 'in_progress' | 'completed';
  acceptedAt?: string;
  actionsTaken?: string;
  completedAt?: string;
  createdBy: string;
  createdAt: number;
  ticketId?: string;
}

export interface MaintenancePoint {
  id: string;
  pointName: string;
  component: string;
  actionRequired: string;
  intervalMonths: number;
  lastPM: string;
  nextPM: string;
  spareParts?: string;
  notes?: string;
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
  subPoints?: MaintenancePoint[];
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
  subPointsServiced?: string;
}

