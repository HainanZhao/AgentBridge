import cron from 'node-cron';

export interface ScheduleConfig {
  id: string;
  cronExpression?: string;
  oneTime?: boolean;
  runAt?: Date;
  message: string;
  description?: string;
  createdAt: Date;
  lastRun?: Date;
  active: boolean;
}

export interface ScheduleJob {
  config: ScheduleConfig;
  task?: cron.ScheduledTask;
  timeout?: NodeJS.Timeout;
  inFlight?: boolean;
}

export class CronScheduler {
  private jobs: Map<string, ScheduleJob> = new Map();
  private jobCallback: (schedule: ScheduleConfig) => Promise<void>;

  constructor(callback: (schedule: ScheduleConfig) => Promise<void>) {
    this.jobCallback = callback;
  }

  /**
   * Create a new schedule
   */
  createSchedule(config: Omit<ScheduleConfig, 'id' | 'createdAt' | 'active'>): ScheduleConfig {
    const scheduleConfig: ScheduleConfig = {
      ...config,
      id: this.generateId(),
      createdAt: new Date(),
      active: true,
    };

    // Validate schedule configuration
    if (scheduleConfig.oneTime) {
      if (!scheduleConfig.runAt) {
        throw new Error('One-time schedules require a runAt date');
      }
      if (scheduleConfig.runAt <= new Date()) {
        throw new Error('One-time schedule runAt must be in the future');
      }
    } else {
      if (!scheduleConfig.cronExpression) {
        throw new Error('Recurring schedules require a cronExpression');
      }
      if (!cron.validate(scheduleConfig.cronExpression)) {
        throw new Error('Invalid cron expression');
      }
    }

    const job: ScheduleJob = {
      config: scheduleConfig,
    };

    if (scheduleConfig.oneTime && scheduleConfig.runAt) {
      // Schedule one-time job
      const delay = scheduleConfig.runAt.getTime() - Date.now();
      if (delay > 0) {
        job.timeout = setTimeout(async () => {
          await this.executeJob(scheduleConfig.id);
          this.removeSchedule(scheduleConfig.id);
        }, delay);
      }
    } else if (scheduleConfig.cronExpression) {
      // Schedule recurring job
      job.task = cron.schedule(
        scheduleConfig.cronExpression,
        async () => {
          await this.executeJob(scheduleConfig.id);
        },
        {
          timezone: process.env.TZ || 'UTC',
        }
      );
    }

    this.jobs.set(scheduleConfig.id, job);
    return scheduleConfig;
  }

  /**
   * Execute a scheduled job
   */
  private async executeJob(scheduleId: string): Promise<void> {
    const job = this.jobs.get(scheduleId);
    if (!job || !job.config.active) {
      return;
    }

    // Skip if job is already in flight (prevents overlapping executions)
    if (job.inFlight) {
      console.warn(`[CronScheduler] Job ${scheduleId} skipped - previous execution still in progress`);
      return;
    }

    job.inFlight = true;
    job.config.lastRun = new Date();

    try {
      await this.jobCallback(job.config);
    } catch (error: any) {
      console.error(`[CronScheduler] Job ${scheduleId} execution failed:`, error);
    } finally {
      job.inFlight = false;
    }
  }

  /**
   * Get a schedule by ID
   */
  getSchedule(scheduleId: string): ScheduleConfig | null {
    const job = this.jobs.get(scheduleId);
    return job ? job.config : null;
  }

  /**
   * List all schedules
   */
  listSchedules(): ScheduleConfig[] {
    return Array.from(this.jobs.values()).map(job => job.config);
  }

  /**
   * Remove a schedule
   */
  removeSchedule(scheduleId: string): boolean {
    const job = this.jobs.get(scheduleId);
    if (!job) {
      return false;
    }

    // Stop the cron task if it exists
    if (job.task) {
      job.task.stop();
    }

    // Clear timeout if it exists (for one-time jobs)
    if (job.timeout) {
      clearTimeout(job.timeout);
    }

    this.jobs.delete(scheduleId);
    return true;
  }

  /**
   * Pause/resume a schedule
   */
  toggleSchedule(scheduleId: string, active: boolean): boolean {
    const job = this.jobs.get(scheduleId);
    if (!job) {
      return false;
    }

    job.config.active = active;

    if (job.task) {
      if (active) {
        job.task.start();
      } else {
        job.task.stop();
      }
    }

    return true;
  }

  /**
   * Generate a unique ID for a schedule
   */
  private generateId(): string {
    return `schedule_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Shutdown all scheduled jobs
   */
  shutdown(): void {
    for (const [scheduleId] of this.jobs) {
      this.removeSchedule(scheduleId);
    }
  }
}
