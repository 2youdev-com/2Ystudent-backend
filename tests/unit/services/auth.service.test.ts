import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { AuthService } from '../../../src/services/auth/auth.service';
import { ITraineeRepository } from '../../../src/repositories/interfaces/trainee.repository.interface';

// Mock bcrypt and jwt
vi.mock('bcryptjs', () => ({
  default: {
    compare: vi.fn(),
    hash: vi.fn(),
  },
}));

vi.mock('jsonwebtoken', () => ({
  default: {
    sign: vi.fn(),
    verify: vi.fn(),
  },
}));

describe('AuthService', () => {
  let authService: AuthService;
  let mockTraineeRepo: Record<string, Mock>;
  let mockPrisma: any;

  const mockTrainee = {
    id: 'trainee-1',
    email: 'test@example.com',
    firstName: 'John',
    lastName: 'Doe',
    passwordHash: 'hashed-password',
    organizationId: 'org-1',
    status: 'active',
    role: 'student',
    currentLevelId: null,
    totalTimeOnPlatform: 0,
    currentStreak: 0,
    lastActiveAt: null,
    assignedTeacher: null,
    assignedTeacherId: null,
    currentSkillLevel: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockTraineeRepo = {
      findByEmail: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findByOrganization: vi.fn(),
      getWithProgress: vi.fn(),
    };

    mockPrisma = {
      trainee: {
        findUnique: vi.fn(),
      },
      organization: {
        create: vi.fn(),
      },
    };

    authService = new AuthService(
      mockTraineeRepo as unknown as ITraineeRepository,
      mockPrisma
    );

    (jwt.sign as Mock).mockReturnValue('mock-jwt-token');
  });

  describe('login', () => {
    it('should return auth result for valid credentials', async () => {
      mockTraineeRepo.findByEmail.mockResolvedValue(mockTrainee);
      (bcrypt.compare as Mock).mockResolvedValue(true);
      mockTraineeRepo.update.mockResolvedValue(mockTrainee);
      mockPrisma.trainee.findUnique.mockResolvedValue(null);

      const result = await authService.login({
        email: 'test@example.com',
        password: 'correct-password',
      });

      expect(result.accessToken).toBe('mock-jwt-token');
      expect(result.user.id).toBe('trainee-1');
      expect(result.user.email).toBe('test@example.com');
      expect(result.user.role).toBe('student');
      expect(mockTraineeRepo.update).toHaveBeenCalledWith('trainee-1', expect.objectContaining({
        lastActiveAt: expect.any(Date),
      }));
    });

    it('should throw for non-existent email', async () => {
      mockTraineeRepo.findByEmail.mockResolvedValue(null);

      await expect(
        authService.login({ email: 'nobody@example.com', password: 'password' })
      ).rejects.toThrow('Invalid email or password');
    });

    it('should throw for wrong password', async () => {
      mockTraineeRepo.findByEmail.mockResolvedValue(mockTrainee);
      (bcrypt.compare as Mock).mockResolvedValue(false);

      await expect(
        authService.login({ email: 'test@example.com', password: 'wrong' })
      ).rejects.toThrow('Invalid email or password');
    });

    it('should throw for suspended account', async () => {
      mockTraineeRepo.findByEmail.mockResolvedValue({ ...mockTrainee, status: 'suspended' });
      (bcrypt.compare as Mock).mockResolvedValue(true);

      await expect(
        authService.login({ email: 'test@example.com', password: 'correct' })
      ).rejects.toThrow('Account is suspended');
    });

    it('should normalize legacy role "user" to "student"', async () => {
      mockTraineeRepo.findByEmail.mockResolvedValue({ ...mockTrainee, role: 'user' });
      (bcrypt.compare as Mock).mockResolvedValue(true);
      mockTraineeRepo.update.mockResolvedValue(mockTrainee);
      mockPrisma.trainee.findUnique.mockResolvedValue(null);

      const result = await authService.login({
        email: 'test@example.com',
        password: 'correct',
      });

      expect(result.user.role).toBe('student');
    });

    it('should normalize legacy role "trainee" to "student"', async () => {
      mockTraineeRepo.findByEmail.mockResolvedValue({ ...mockTrainee, role: 'trainee' });
      (bcrypt.compare as Mock).mockResolvedValue(true);
      mockTraineeRepo.update.mockResolvedValue(mockTrainee);
      mockPrisma.trainee.findUnique.mockResolvedValue(null);

      const result = await authService.login({
        email: 'test@example.com',
        password: 'correct',
      });

      expect(result.user.role).toBe('student');
    });

    it('should normalize legacy role "org_admin" to "admin"', async () => {
      mockTraineeRepo.findByEmail.mockResolvedValue({ ...mockTrainee, role: 'org_admin' });
      (bcrypt.compare as Mock).mockResolvedValue(true);
      mockTraineeRepo.update.mockResolvedValue(mockTrainee);
      mockPrisma.trainee.findUnique.mockResolvedValue(null);

      const result = await authService.login({
        email: 'test@example.com',
        password: 'correct',
      });

      expect(result.user.role).toBe('admin');
    });

    it('should fetch assigned teacher info for student login', async () => {
      mockTraineeRepo.findByEmail.mockResolvedValue(mockTrainee);
      (bcrypt.compare as Mock).mockResolvedValue(true);
      mockTraineeRepo.update.mockResolvedValue(mockTrainee);
      mockPrisma.trainee.findUnique.mockResolvedValue({
        assignedTeacher: 'alex',
        assignedTeacherId: 'teacher-1',
        currentSkillLevel: 'intermediate',
        assignedTeacherRecord: {
          avatarUrl: 'https://example.com/avatar.png',
          displayNameAr: 'أليكس',
          displayNameEn: 'Alex',
          voiceId: 'voice-123',
        },
      });

      const result = await authService.login({
        email: 'test@example.com',
        password: 'correct',
      });

      expect(result.user.assignedTeacher).toBe('alex');
      expect(result.user.assignedTeacherId).toBe('teacher-1');
      expect(result.user.assignedTeacherAvatar).toBe('https://example.com/avatar.png');
      expect(result.user.assignedTeacherVoiceId).toBe('voice-123');
    });

    it('should exclude base64 avatar URLs from response', async () => {
      mockTraineeRepo.findByEmail.mockResolvedValue(mockTrainee);
      (bcrypt.compare as Mock).mockResolvedValue(true);
      mockTraineeRepo.update.mockResolvedValue(mockTrainee);
      mockPrisma.trainee.findUnique.mockResolvedValue({
        assignedTeacher: 'alex',
        assignedTeacherId: 'teacher-1',
        currentSkillLevel: null,
        assignedTeacherRecord: {
          avatarUrl: 'data:image/png;base64,iVBOR...',
          displayNameAr: null,
          displayNameEn: null,
          voiceId: null,
        },
      });

      const result = await authService.login({
        email: 'test@example.com',
        password: 'correct',
      });

      expect(result.user.assignedTeacherAvatar).toBeNull();
    });
  });

  describe('register', () => {
    it('should create a new student account', async () => {
      mockTraineeRepo.findByEmail.mockResolvedValue(null);
      (bcrypt.hash as Mock).mockResolvedValue('hashed-new-password');
      mockTraineeRepo.create.mockResolvedValue({
        ...mockTrainee,
        id: 'new-trainee',
        email: 'new@example.com',
      });

      const result = await authService.register({
        email: 'new@example.com',
        password: 'password123',
        firstName: 'Jane',
        lastName: 'Smith',
        organizationId: 'org-1',
      });

      expect(result.accessToken).toBe('mock-jwt-token');
      expect(result.user.email).toBe('new@example.com');
      expect(mockTraineeRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        email: 'new@example.com',
        passwordHash: 'hashed-new-password',
        role: 'student',
      }));
    });

    it('should throw for duplicate email', async () => {
      mockTraineeRepo.findByEmail.mockResolvedValue(mockTrainee);

      await expect(
        authService.register({
          email: 'test@example.com',
          password: 'password123',
          firstName: 'Jane',
          lastName: 'Smith',
        })
      ).rejects.toThrow('Email already registered');
    });

    it('should create new org and make user admin when organizationName is provided', async () => {
      mockTraineeRepo.findByEmail.mockResolvedValue(null);
      (bcrypt.hash as Mock).mockResolvedValue('hashed-pw');
      mockPrisma.organization.create.mockResolvedValue({ id: 'new-org-id', name: 'ACME Corp' });
      mockTraineeRepo.create.mockResolvedValue({
        ...mockTrainee,
        id: 'admin-user',
        organizationId: 'new-org-id',
      });

      const result = await authService.register({
        email: 'admin@acme.com',
        password: 'password123',
        firstName: 'Admin',
        lastName: 'User',
        organizationName: 'ACME Corp',
        industryType: 'hvac_systems',
      });

      expect(mockPrisma.organization.create).toHaveBeenCalledWith({
        data: { name: 'ACME Corp', type: 'training_company' },
      });
      expect(mockTraineeRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        organizationId: 'new-org-id',
        role: 'admin',
      }));
    });

    it('should map industry types correctly', async () => {
      mockTraineeRepo.findByEmail.mockResolvedValue(null);
      (bcrypt.hash as Mock).mockResolvedValue('hashed-pw');
      mockPrisma.organization.create.mockResolvedValue({ id: 'org-id' });
      mockTraineeRepo.create.mockResolvedValue({ ...mockTrainee, organizationId: 'org-id' });

      await authService.register({
        email: 'test@corp.com',
        password: 'password123',
        firstName: 'Test',
        lastName: 'User',
        organizationName: 'Corp',
        industryType: 'electrical_power',
      });

      expect(mockPrisma.organization.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ type: 'corporate_client' }),
      });
    });

    it('should use default org when no org specified', async () => {
      mockTraineeRepo.findByEmail.mockResolvedValue(null);
      (bcrypt.hash as Mock).mockResolvedValue('hashed-pw');
      mockTraineeRepo.create.mockResolvedValue({ ...mockTrainee, organizationId: 'default-org' });

      await authService.register({
        email: 'solo@example.com',
        password: 'password123',
        firstName: 'Solo',
        lastName: 'User',
      });

      expect(mockTraineeRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        organizationId: 'default-org',
      }));
    });
  });

  describe('validateToken', () => {
    it('should return decoded payload for valid token', async () => {
      const payload = { userId: 'u1', email: 'a@b.com', role: 'student', organizationId: 'org-1' };
      (jwt.verify as Mock).mockReturnValue(payload);

      const result = await authService.validateToken('valid-token');
      expect(result).toEqual(payload);
    });

    it('should throw for invalid token', async () => {
      (jwt.verify as Mock).mockImplementation(() => { throw new Error('invalid'); });

      await expect(authService.validateToken('bad-token')).rejects.toThrow('Invalid token');
    });
  });

  describe('changePassword', () => {
    it('should update password when current password is correct', async () => {
      mockTraineeRepo.findById.mockResolvedValue(mockTrainee);
      (bcrypt.compare as Mock).mockResolvedValue(true);
      (bcrypt.hash as Mock).mockResolvedValue('new-hashed-pw');
      mockTraineeRepo.update.mockResolvedValue(mockTrainee);

      await authService.changePassword('trainee-1', 'current-pw', 'new-pw');

      expect(mockTraineeRepo.update).toHaveBeenCalledWith('trainee-1', expect.objectContaining({
        passwordHash: 'new-hashed-pw',
        passwordChangedAt: expect.any(Date),
      }));
    });

    it('should throw when user not found', async () => {
      mockTraineeRepo.findById.mockResolvedValue(null);

      await expect(
        authService.changePassword('nonexistent', 'old', 'new')
      ).rejects.toThrow('User not found');
    });

    it('should throw when current password is wrong', async () => {
      mockTraineeRepo.findById.mockResolvedValue(mockTrainee);
      (bcrypt.compare as Mock).mockResolvedValue(false);

      await expect(
        authService.changePassword('trainee-1', 'wrong', 'new')
      ).rejects.toThrow('Current password is incorrect');
    });
  });

  describe('generateResetToken', () => {
    it('should generate a reset token for existing email', async () => {
      mockTraineeRepo.findByEmail.mockResolvedValue(mockTrainee);
      (jwt.sign as Mock).mockReturnValue('reset-token');

      const token = await authService.generateResetToken('test@example.com');

      expect(token).toBe('reset-token');
      expect(jwt.sign).toHaveBeenCalledWith(
        { userId: 'trainee-1', purpose: 'password-reset' },
        expect.any(String),
        { expiresIn: '1h' }
      );
    });

    it('should throw for non-existent email', async () => {
      mockTraineeRepo.findByEmail.mockResolvedValue(null);

      await expect(
        authService.generateResetToken('nobody@example.com')
      ).rejects.toThrow('Email not found');
    });
  });

  describe('resetPassword', () => {
    it('should reset password with valid reset token', async () => {
      (jwt.verify as Mock).mockReturnValue({ userId: 'trainee-1', purpose: 'password-reset' });
      (bcrypt.hash as Mock).mockResolvedValue('new-hashed');
      mockTraineeRepo.update.mockResolvedValue(mockTrainee);

      await authService.resetPassword('valid-reset-token', 'new-password');

      expect(mockTraineeRepo.update).toHaveBeenCalledWith('trainee-1', expect.objectContaining({
        passwordHash: 'new-hashed',
        passwordChangedAt: expect.any(Date),
      }));
    });

    it('should throw for invalid reset token', async () => {
      (jwt.verify as Mock).mockImplementation(() => { throw new Error('expired'); });

      await expect(
        authService.resetPassword('expired-token', 'new-pw')
      ).rejects.toThrow('Invalid or expired reset token');
    });

    it('should throw for token with wrong purpose', async () => {
      (jwt.verify as Mock).mockReturnValue({ userId: 'trainee-1', purpose: 'login' });

      await expect(
        authService.resetPassword('wrong-purpose-token', 'new-pw')
      ).rejects.toThrow('Invalid or expired reset token');
    });
  });

  describe('refreshToken', () => {
    it('should issue new token for valid refresh token', async () => {
      const payload = { userId: 'trainee-1', email: 'test@example.com', role: 'student', organizationId: 'org-1' };
      (jwt.verify as Mock).mockReturnValue(payload);
      mockTraineeRepo.findById.mockResolvedValue(mockTrainee);
      mockPrisma.trainee.findUnique.mockResolvedValue(null);

      const result = await authService.refreshToken('valid-refresh-token');

      expect(result.accessToken).toBe('mock-jwt-token');
      expect(result.user.id).toBe('trainee-1');
    });

    it('should throw when user not found during refresh', async () => {
      (jwt.verify as Mock).mockReturnValue({ userId: 'gone' });
      mockTraineeRepo.findById.mockResolvedValue(null);

      await expect(authService.refreshToken('token')).rejects.toThrow('User not found');
    });
  });
});
