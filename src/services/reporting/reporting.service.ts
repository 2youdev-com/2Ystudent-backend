import { injectable, inject } from 'tsyringe';
import { IReportRepository } from '../../repositories/interfaces/report.repository.interface';
import { ISimulationRepository } from '../../repositories/interfaces/simulation.repository.interface';
import { ITraineeRepository } from '../../repositories/interfaces/trainee.repository.interface';
import {
  IReportingService,
  SessionReport,
  LevelReport,
  ProgramReport,
  SkillAssessment,
  KnowledgeGap,
  Recommendation,
} from '../interfaces/reporting.interface';

@injectable()
export class ReportingService implements IReportingService {
  constructor(
    @inject('ReportRepository') private reportRepository: IReportRepository,
    @inject('SimulationRepository') private simulationRepository: ISimulationRepository,
    @inject('TraineeRepository') private traineeRepository: ITraineeRepository
  ) {}

  private parseJson<T>(value: string | T): T {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return {} as T;
      }
    }
    return value;
  }

  async generateSessionReport(sessionId: string, traineeId: string): Promise<SessionReport> {
    const existingReport = await this.reportRepository.findBySourceId(sessionId);
    if (existingReport) {
      return this.mapToSessionReport(existingReport);
    }

    const session = await this.simulationRepository.findByIdWithTurns(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const metrics = this.parseJson<Record<string, unknown>>(session.metrics as string | Record<string, unknown>) || {};
    const score = (metrics.preliminaryScore as number) || 70;

    const strengths = this.analyzeStrengths(score);
    const weaknesses = this.analyzeWeaknesses(score);
    const recommendations = this.generateRecommendations(score, strengths, weaknesses);

    const report = await this.reportRepository.create({
      traineeId,
      reportType: 'session',
      sourceType: 'simulation',
      sourceId: sessionId,
      summary: {
        overallScore: score,
        percentileRank: null,
        trend: 'stable',
        timeSpentMinutes: Math.ceil((session.durationSeconds || 0) / 60),
      },
      strengths,
      weaknesses,
      knowledgeGaps: [],
      recommendations,
      suggestedNextSteps: recommendations.map(r => r.title),
    });

    return this.mapToSessionReport(report);
  }

  async generateLevelReport(levelId: string, traineeId: string): Promise<LevelReport> {
    const trainee = await this.traineeRepository.getWithProgress(traineeId);
    if (!trainee) {
      throw new Error('Trainee not found');
    }

    const simulations = await this.simulationRepository.findByStudent(traineeId);
    const completedSimulations = simulations.filter(s => s.status === 'completed');

    const avgScore = completedSimulations.length > 0
      ? completedSimulations.reduce((sum, s) => {
          const metrics = this.parseJson<Record<string, unknown>>(s.metrics as string | Record<string, unknown>) || {};
          return sum + ((metrics.preliminaryScore as number) || 70);
        }, 0) / completedSimulations.length
      : 70;

    return {
      id: `level-report-${levelId}-${traineeId}`,
      traineeId,
      levelId,
      overallScore: Math.round(avgScore),
      lecturesCompleted: trainee.completedLectures.length,
      lecturesTotal: 10,
      assessmentsPassed: trainee.completedAssessments.length,
      assessmentsTotal: 5,
      simulationsCompleted: completedSimulations.length,
      competencyTrends: [
        {
          competencyName: 'Technical Communication',
          scores: [],
          trend: 'stable',
        },
        {
          competencyName: 'Knowledge Depth',
          scores: [],
          trend: 'improving',
        },
      ],
      recommendations: this.generateRecommendations(avgScore, [], []),
    };
  }

  async generateProgramReport(programId: string, traineeId: string): Promise<ProgramReport> {
    const trainee = await this.traineeRepository.getWithProgress(traineeId);
    if (!trainee) {
      throw new Error('Trainee not found');
    }

    const simulations = await this.simulationRepository.findByStudent(traineeId);
    const completedSimulations = simulations.filter(s => s.status === 'completed');

    const avgScore = completedSimulations.length > 0
      ? completedSimulations.reduce((sum, s) => {
          const metrics = this.parseJson<Record<string, unknown>>(s.metrics as string | Record<string, unknown>) || {};
          return sum + ((metrics.preliminaryScore as number) || 70);
        }, 0) / completedSimulations.length
      : 70;

    return {
      id: `program-report-${programId}-${traineeId}`,
      traineeId,
      programId,
      overallScore: Math.round(avgScore),
      completionDate: new Date(),
      totalTimeSpent: trainee.totalTimeOnPlatform,
      levelsCompleted: 3,
      finalAssessment: {
        strengths: ['Strong technical communication', 'Solid engineering fundamentals'],
        areasForGrowth: ['Critical thinking in complex scenarios', 'Advanced troubleshooting techniques'],
        certificationReady: avgScore >= 75,
      },
    };
  }

  async getStudentReports(traineeId: string): Promise<SessionReport[]> {
    const reports = await this.reportRepository.findByStudent(traineeId, 20);
    return reports.map(r => this.mapToSessionReport(r));
  }

  async getOrganizationAnalytics(organizationId: string): Promise<{
    totalTrainees: number;
    activeTrainees: number;
    averageScore: number;
    completionRate: number;
    topPerformers: { traineeId: string; score: number }[];
  }> {
    const allUsers = await this.traineeRepository.findByOrganization(organizationId);
    const trainees = allUsers.filter(t => t.role === 'student');
    const activeTrainees = trainees.filter(t => t.status === 'active');

    const allScores: number[] = [];
    const performerScores: { traineeId: string; score: number }[] = [];

    for (const trainee of trainees) {
      const stats = await this.simulationRepository.getTraineeSimulationStats(trainee.id);
      if (stats.averageScore > 0) {
        allScores.push(stats.averageScore);
        performerScores.push({ traineeId: trainee.id, score: stats.averageScore });
      }
    }

    performerScores.sort((a, b) => b.score - a.score);

    return {
      totalTrainees: trainees.length,
      activeTrainees: activeTrainees.length,
      averageScore: allScores.length > 0
        ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length)
        : 0,
      completionRate: trainees.length > 0
        ? (trainees.filter(t => t.status === 'completed').length / trainees.length) * 100
        : 0,
      topPerformers: performerScores.slice(0, 5),
    };
  }

  private mapToSessionReport(report: {
    id: string;
    traineeId: string;
    sourceId: string;
    summary: unknown;
    strengths: unknown;
    weaknesses: unknown;
    knowledgeGaps: unknown;
    recommendations: unknown;
  }): SessionReport {
    const summary = this.parseJson<Record<string, unknown>>(report.summary as string | Record<string, unknown>) || {};

    return {
      id: report.id,
      traineeId: report.traineeId,
      sessionId: report.sourceId,
      overallScore: (summary.overallScore as number) || 70,
      percentileRank: (summary.percentileRank as number) || null,
      trend: (summary.trend as 'improving' | 'stable' | 'declining') || 'stable',
      timeSpentMinutes: (summary.timeSpentMinutes as number) || 0,
      strengths: this.parseJson<SkillAssessment[]>(report.strengths as string | SkillAssessment[]) || [],
      weaknesses: this.parseJson<SkillAssessment[]>(report.weaknesses as string | SkillAssessment[]) || [],
      knowledgeGaps: this.parseJson<KnowledgeGap[]>(report.knowledgeGaps as string | KnowledgeGap[]) || [],
      recommendations: this.parseJson<Recommendation[]>(report.recommendations as string | Recommendation[]) || [],
    };
  }

  private analyzeStrengths(score: number): SkillAssessment[] {
    const strengths: SkillAssessment[] = [];

    if (score >= 70) {
      strengths.push({
        skillName: 'Technical Communication',
        category: 'communication',
        score: score + 5,
        evidence: ['Clear technical explanations', 'Correct use of engineering terminology'],
        benchmarkComparison: 'above',
      });
    }

    if (score >= 75) {
      strengths.push({
        skillName: 'Problem Solving',
        category: 'engineering',
        score: score + 3,
        evidence: ['Systematic approach to troubleshooting', 'Logical reasoning demonstrated'],
        benchmarkComparison: 'at',
      });
    }

    return strengths;
  }

  private analyzeWeaknesses(score: number): SkillAssessment[] {
    const weaknesses: SkillAssessment[] = [];

    if (score < 80) {
      weaknesses.push({
        skillName: 'Critical Thinking',
        category: 'engineering',
        score: score - 10,
        evidence: ['Missed deeper analysis opportunities', 'Surface-level reasoning on complex topics'],
        benchmarkComparison: 'below',
      });
    }

    if (score < 75) {
      weaknesses.push({
        skillName: 'Knowledge Depth',
        category: 'engineering',
        score: score - 5,
        evidence: ['Some technical concepts need deeper understanding'],
        benchmarkComparison: 'below',
      });
    }

    return weaknesses;
  }

  private generateRecommendations(
    score: number,
    strengths: SkillAssessment[],
    weaknesses: SkillAssessment[]
  ): Recommendation[] {
    const recommendations: Recommendation[] = [];

    if (score < 70) {
      recommendations.push({
        priority: 'high',
        category: 'review_content',
        title: 'Review Fundamentals',
        description: 'Strengthen your foundation in engineering techniques.',
        actionableSteps: [
          'Complete the objection handling module',
          'Practice with easier scenarios',
          'Review communication best practices',
        ],
      });
    }

    if (weaknesses.some(w => w.skillName.includes('Critical Thinking'))) {
      recommendations.push({
        priority: 'medium',
        category: 'practice_skill',
        title: 'Improve Critical Thinking',
        description: 'Focus on deeper analysis and evaluation of engineering problems.',
        actionableSteps: [
          'Practice analysing engineering scenarios from multiple perspectives',
          'Review case studies of complex engineering decisions',
          'Work on root cause analysis techniques',
        ],
      });
    }

    recommendations.push({
      priority: 'low',
      category: 'advance',
      title: 'Continue Practice',
      description: 'Regular practice maintains and improves skills.',
      actionableSteps: [
        'Complete at least one simulation weekly',
        'Try different scenario types',
        'Increase difficulty gradually',
      ],
    });

    return recommendations;
  }
}
