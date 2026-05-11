import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { TokenPayload, UserRole } from '../services/interfaces/auth.interface';

const prisma = new PrismaClient();

// Extend Express Request to include organizationId
declare global {
  namespace Express {
    interface Request {
      organizationId?: string;
    }
  }
}

/**
 * Organization isolation middleware
 * Ensures users can only access data within their own organization
 * Super admins bypass this check and can access any organization
 */
export function orgIsolationMiddleware() {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Super admins bypass org isolation
    if (req.user?.role === 'saas_super_admin') {
      // Use impersonated org if set, or header for cross-org access
      req.organizationId = req.user.impersonatingOrgId || (req.headers['x-org-id'] as string) || undefined;
      next();
      return;
    }

    if (!req.user?.organizationId) {
      res.status(403).json({ error: 'Organization context required' });
      return;
    }

    // Attach organizationId to request for use in services
    req.organizationId = req.user.organizationId;
    next();
  };
}

/**
 * Supervisor access middleware
 * Ensures supervisors can only access data for their assigned groups/students
 * Admins have full access within their organization
 * Super admins have full access across all organizations
 */
export function trainerAccessMiddleware() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Super admins have full access across all organizations
    if (req.user.role === 'saas_super_admin') {
      next();
      return;
    }

    // Admins have full access within their organization
    if (req.user.role === 'admin') {
      next();
      return;
    }

    // Supervisors need to verify access to specific trainee
    if (req.user.role === 'supervisor') {
      const targetTraineeId = req.params.traineeId || req.params.id;

      if (targetTraineeId) {
        const hasAccess = await verifyTrainerAccess(req.user.userId, targetTraineeId);

        if (!hasAccess) {
          res.status(403).json({
            error: 'Access denied: Student not in your assigned groups',
          });
          return;
        }
      }
    }

    // Students can only access their own data
    if (req.user.role === 'student') {
      const targetTraineeId = req.params.traineeId || req.params.id;

      if (targetTraineeId && targetTraineeId !== req.user.userId) {
        res.status(403).json({ error: 'Access denied: Can only view own data' });
        return;
      }
    }

    next();
  };
}

/**
 * Helper: Verify supervisor has access to specific student
 * Returns true if student is in any group assigned to this supervisor
 */
export async function verifyTrainerAccess(trainerId: string, traineeId: string): Promise<boolean> {
  // Check if trainee is in any group assigned to this trainer
  const access = await prisma.groupMember.findFirst({
    where: {
      traineeId: traineeId,
      isActive: true,
      group: {
        trainerAssignments: {
          some: {
            trainerId: trainerId,
            isActive: true,
          },
        },
      },
    },
  });

  return access !== null;
}

/**
 * Get accessible trainee IDs for a user based on role
 * Returns 'all' for admin (signals to include all org trainees)
 * Returns array of trainee IDs for supervisors
 * Returns only own ID for students
 */
export async function getAccessibleTraineeIds(
  userId: string,
  role: UserRole,
  organizationId: string
): Promise<string[] | 'all'> {
  // Super admins and admins have full access
  if (role === 'saas_super_admin' || role === 'admin') {
    return 'all'; // Signal to include all org trainees
  }

  if (role === 'supervisor') {
    const assignments = await prisma.trainerGroupAssignment.findMany({
      where: { trainerId: userId, isActive: true },
      include: {
        group: {
          include: {
            members: {
              where: { isActive: true },
              select: { traineeId: true },
            },
          },
        },
      },
    });

    const traineeIds = new Set<string>();
    for (const assignment of assignments) {
      for (const member of assignment.group.members) {
        traineeIds.add(member.traineeId);
      }
    }
    return Array.from(traineeIds);
  }

  // Student can only see themselves
  return [userId];
}

/**
 * Get groups accessible to a user based on role
 * Admins see all org groups
 * Supervisors see only assigned groups
 */
export async function getAccessibleGroupIds(
  userId: string,
  role: UserRole,
  organizationId: string
): Promise<string[] | 'all'> {
  // Super admins and admins have full access
  if (role === 'saas_super_admin' || role === 'admin') {
    return 'all';
  }

  if (role === 'supervisor') {
    const assignments = await prisma.trainerGroupAssignment.findMany({
      where: { trainerId: userId, isActive: true },
      select: { groupId: true },
    });

    return assignments.map((a) => a.groupId);
  }

  // Students see only their own groups
  const memberships = await prisma.groupMember.findMany({
    where: { traineeId: userId, isActive: true },
    select: { groupId: true },
  });

  return memberships.map((m) => m.groupId);
}

/**
 * Middleware to require specific role(s)
 * More explicit than checking in authMiddleware for better code clarity
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (!allowedRoles.includes(req.user.role as UserRole)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    next();
  };
}

/**
 * Middleware to ensure user belongs to target organization
 * Prevents cross-organization data access
 * Super admins bypass this check
 */
export function ensureOrgMatch(targetOrgIdParam: string = 'organizationId') {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Super admins can access any organization
    if (req.user.role === 'saas_super_admin') {
      next();
      return;
    }

    const targetOrgId = req.params[targetOrgIdParam] || req.body?.[targetOrgIdParam];

    if (targetOrgId && targetOrgId !== req.user.organizationId) {
      res.status(403).json({ error: 'Access denied: Organization mismatch' });
      return;
    }

    next();
  };
}
