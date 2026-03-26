export type UserRole = 'employee' | 'office_boy' | 'admin';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  dailyOrderCount: number;
  weeklyOrderCount: number;
  lastOrderTimestamp: string | null;
}

export type OrderStatus = 'pending' | 'accepted' | 'in_progress' | 'completed' | 'cancelled';
export type Priority = 'normal' | 'urgent';

export interface Order {
  id: string;
  userId: string;
  userName: string;
  drinkType: string;
  sugarLevel: string;
  milk: boolean;
  notes: string;
  priority: Priority;
  status: OrderStatus;
  createdAt: string;
  acceptedAt?: string;
  startedAt?: string;
  completedAt?: string;
  slaDeadline: string;
}

export interface AuditLog {
  id: string;
  action: string;
  userId: string;
  userName: string;
  timestamp: string;
  details: string;
}

export interface GlobalSettings {
  dailyLimit: number;
  weeklyLimit: number;
  slaMinutes: number;
}
