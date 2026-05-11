export interface AdminOverviewStats {
  totalUsers: number;
  activeUsers: number;
  totalSessions: number;
  completedSessions: number;
  averageScore: number;
  averageSessionsPerUser: number;
}

export interface TeamPerformance {
  bestPerformer: {
    id: string;
    name: string;
    email: string;
    averageScore: number;
    totalSessions: number;
  } | null;
  worstPerformer: {
    id: string;
    name: string;
    email: string;
    averageScore: number;
    totalSessions: number;
  } | null;
  averageTeamScore: number;
}

export interface MonthlyTrend {
  month: string;
  year: number;
  averageScore: number;
  totalSessions: number;
  activeUsers: number;
}

export interface EmployeeListItem {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  totalSessions: number;
  completedSessions: number;
  averageScore: number | null;
  lastActivityAt: Date | null;
  createdAt: Date;
  status: string;
}

export interface EmployeeDetail extends EmployeeListItem {
  sessions: {
    id: string;
    scenarioType: string;
    difficultyLevel: string;
    status: string;
    score: number | null;
    grade: string | null;
    completedAt: Date | null;
    durationSeconds: number | null;
  }[];
  scoreHistory: {
    date: Date;
    score: number;
    sessionId: string;
  }[];
  skillBreakdown: {
    skill: string;
    averageScore: number;
    sessionCount: number;
  }[];
  weakSkills: string[];
  recommendations: string[];
}

export interface AdminDashboardData {
  overview: AdminOverviewStats;
  teamPerformance: TeamPerformance;
  monthlyTrends: MonthlyTrend[];
  recentActivity: {
    userId: string;
    userName: string;
    action: string;
    timestamp: Date;
    details: string;
  }[];
}

// Supervisor scope options for filtering data by supervisor's assigned groups
export interface SupervisorScope {
  trainerId: string;
  role: 'supervisor';
}

// Query options with optional trainer scope
export interface AdminQueryOptions {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
  supervisorScope?: SupervisorScope; // When set, filter data to trainer's groups only
}

export interface IAdminService {
  getOverviewStats(organizationId: string, supervisorScope?: SupervisorScope): Promise<AdminOverviewStats>;
  getTeamPerformance(organizationId: string, supervisorScope?: SupervisorScope): Promise<TeamPerformance>;
  getMonthlyTrends(organizationId: string, months?: number, supervisorScope?: SupervisorScope): Promise<MonthlyTrend[]>;
  getDashboardData(organizationId: string, supervisorScope?: SupervisorScope): Promise<AdminDashboardData>;
  getEmployeeList(organizationId: string, options?: AdminQueryOptions): Promise<{ employees: EmployeeListItem[]; total: number; page: number; totalPages: number }>;
  getEmployeeDetail(employeeId: string, organizationId: string, supervisorScope?: SupervisorScope): Promise<EmployeeDetail>;
  updateEmployeeRole(employeeId: string, role: 'user' | 'admin', adminId: string): Promise<void>;
  // Helper method to get trainee IDs for a trainer's groups
  getTrainerTraineeIds(trainerId: string, organizationId: string): Promise<string[]>;
}
