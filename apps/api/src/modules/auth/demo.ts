import { randomUUID } from 'node:crypto';
import type { Db } from '../../db/client.js';
import {
  applications,
  reminders,
  stageEvents,
  type Source,
  type Stage,
  type UserRow,
  type WorkMode,
} from '../../db/schema.js';
import { addDays, dateIn } from '../../domain/dates.js';
import { FOLLOW_UP_DAYS, FOLLOW_UP_TITLE, SUBMITTED_STAGES } from '../../domain/stages.js';
import { insertUser } from './repository.js';

const DEMO_TIMEZONE = 'Asia/Singapore';
const DAY_MS = 86_400_000;

/** Not a valid argon2 hash, so password sign-in to a demo account always fails. */
const NO_LOGIN_HASH = '!demo-account-no-password-login';

interface SampleApplication {
  company: string;
  role: string;
  source: Source;
  workMode: WorkMode;
  location: string;
  salary?: [number, number];
  /** Stage history as [stage, days ago]; the first entry is when it was created. */
  history: [Stage, number][];
  notes?: string;
  jobDescription?: string;
  reminder?: [string, number];
}

const SAMPLE_RESUME = `Alex Tan — Software Engineer
Singapore · alex.tan@example.com

EXPERIENCE
Software Engineer Intern, Kopi Analytics (May 2025 – Aug 2025)
- Built a REST API in TypeScript and Node.js that served dashboard data to 2,000 daily users
- Reduced a slow PostgreSQL report query from 4.2s to 300ms by adding composite indexes
- Wrote integration tests with Vitest, raising backend coverage from 40% to 78%

Teaching Assistant, Data Structures & Algorithms (Jan 2025 – Apr 2025)
- Ran weekly labs for 40 students and reviewed their Java assignments

PROJECTS
ApplyTrack — job application tracker (Fastify, PostgreSQL, React)
Campus Eats — food ordering app built by a team of 5 (Spring Boot, MySQL)

SKILLS
TypeScript, JavaScript, Java, Python, SQL, Node.js, React, PostgreSQL, Docker, Git, GitHub Actions`;

const SAMPLE_JD = `We are looking for a Backend Engineer to join our payments platform team.
You will design and build reliable REST and event-driven APIs in TypeScript, own PostgreSQL schemas
and migrations, and improve observability. Experience with Node.js, PostgreSQL, Docker, CI/CD and
automated testing is required. Nice to have: Kubernetes, Kafka, AWS, and experience with
high-volume financial systems.`;

const SAMPLES: SampleApplication[] = [
  {
    company: 'Merlion Pay',
    role: 'Backend Engineer (Graduate)',
    source: 'linkedin',
    workMode: 'hybrid',
    location: 'Singapore',
    salary: [5_000, 6_500],
    history: [['wishlist', 40], ['applied', 38], ['screening', 31], ['interviewing', 24], ['offer', 3]],
    notes: 'Offer received — decision due Friday. Ask about learning budget.',
    jobDescription: SAMPLE_JD,
    reminder: ['Reply to offer', 2],
  },
  {
    company: 'Straits Cloud',
    role: 'Software Engineer, Platform',
    source: 'referral',
    workMode: 'onsite',
    location: 'Singapore',
    salary: [5_500, 7_000],
    history: [['applied', 21], ['screening', 15], ['interviewing', 6]],
    notes: 'Referred by Wei Ling. Technical round focuses on system design.',
    reminder: ['Prepare system design: rate limiter', 1],
  },
  {
    company: 'Tembusu Health',
    role: 'Full-stack Developer',
    source: 'company_site',
    workMode: 'hybrid',
    location: 'Singapore',
    history: [['applied', 18], ['screening', 9]],
    reminder: ['Send portfolio link to recruiter', -1],
  },
  {
    company: 'Orchid Robotics',
    role: 'Junior Software Engineer',
    source: 'job_board',
    workMode: 'onsite',
    location: 'Singapore',
    history: [['applied', 5]],
  },
  {
    company: 'Harbourline Logistics',
    role: 'Backend Developer',
    source: 'job_board',
    workMode: 'remote',
    location: 'Remote (APAC)',
    salary: [4_500, 6_000],
    history: [['applied', 12]],
  },
  {
    company: 'Kampong Games',
    role: 'Gameplay Programmer',
    source: 'career_fair',
    workMode: 'onsite',
    location: 'Singapore',
    history: [['applied', 45], ['screening', 40], ['rejected', 33]],
    notes: 'Rejected after screening — they wanted Unity experience.',
  },
  {
    company: 'Lumen Labs',
    role: 'API Engineer',
    source: 'linkedin',
    workMode: 'remote',
    location: 'Remote',
    history: [['applied', 50], ['rejected', 36]],
  },
  {
    company: 'Banyan Bank',
    role: 'Technology Associate Programme',
    source: 'company_site',
    workMode: 'onsite',
    location: 'Singapore',
    salary: [5_200, 5_800],
    history: [['applied', 60], ['screening', 52], ['interviewing', 44], ['rejected', 30]],
  },
  {
    company: 'Pandan Fintech',
    role: 'Software Engineer',
    source: 'recruiter',
    workMode: 'hybrid',
    location: 'Singapore',
    history: [['applied', 27], ['withdrawn', 20]],
    notes: 'Withdrew — role turned out to be mostly on-call support.',
  },
  {
    company: 'Changi Data',
    role: 'Data Engineer',
    source: 'linkedin',
    workMode: 'hybrid',
    location: 'Singapore',
    history: [['applied', 9]],
  },
  {
    company: 'Sentosa Studios',
    role: 'Frontend Engineer',
    source: 'job_board',
    workMode: 'remote',
    location: 'Remote (SG)',
    history: [['applied', 33]],
  },
  {
    company: 'Kopi Analytics',
    role: 'Software Engineer',
    source: 'referral',
    workMode: 'hybrid',
    location: 'Singapore',
    history: [['applied', 70], ['screening', 66], ['interviewing', 60], ['offer', 55], ['withdrawn', 50]],
    notes: 'Declined the return offer to keep looking at backend-focused roles.',
  },
  {
    company: 'Nimbus Security',
    role: 'Security Engineer Intern → Graduate',
    source: 'career_fair',
    workMode: 'onsite',
    location: 'Singapore',
    history: [['wishlist', 4]],
    reminder: ['Ask Jun Hao about the team', 3],
  },
  {
    company: 'Durian Commerce',
    role: 'Backend Engineer',
    source: 'linkedin',
    workMode: 'hybrid',
    location: 'Singapore',
    history: [['wishlist', 2]],
    jobDescription: SAMPLE_JD,
  },
  {
    company: 'Raintree AI',
    role: 'ML Platform Engineer',
    source: 'other',
    workMode: 'remote',
    location: 'Remote',
    history: [['wishlist', 1]],
  },
];

/** Creates a demo user with realistic, back-dated sample data. */
export async function createDemoAccount(db: Db, now: Date): Promise<UserRow> {
  const at = (daysAgo: number) => new Date(now.getTime() - daysAgo * DAY_MS);
  const today = dateIn(now, DEMO_TIMEZONE);

  return db.transaction(async (tx) => {
    const user = await insertUser(tx, {
      email: `demo-${randomUUID()}@demo.applytrack.invalid`,
      name: 'Demo User',
      passwordHash: NO_LOGIN_HASH,
      timezone: DEMO_TIMEZONE,
      isDemo: true,
      resumeText: SAMPLE_RESUME,
    });
    if (!user) throw new Error('demo user email collision');

    for (const sample of SAMPLES) {
      const [first] = sample.history;
      const last = sample.history.at(-1)!;
      const firstSubmitted = sample.history.find(([stage]) => SUBMITTED_STAGES.has(stage));
      const appliedOn = firstSubmitted ? dateIn(at(firstSubmitted[1]), DEMO_TIMEZONE) : null;

      const [app] = await tx
        .insert(applications)
        .values({
          userId: user.id,
          company: sample.company,
          role: sample.role,
          source: sample.source,
          workMode: sample.workMode,
          location: sample.location,
          salaryMin: sample.salary?.[0],
          salaryMax: sample.salary?.[1],
          notes: sample.notes,
          jobDescription: sample.jobDescription,
          stage: last[0],
          appliedOn,
          createdAt: at(first![1]),
          updatedAt: at(last[1]),
        })
        .returning();

      await tx.insert(stageEvents).values(
        sample.history.map(([stage, daysAgo], i) => ({
          applicationId: app!.id,
          fromStage: i === 0 ? null : sample.history[i - 1]![0],
          toStage: stage,
          occurredAt: at(daysAgo),
        })),
      );

      const reminderRows: (typeof reminders.$inferInsert)[] = [];
      if (appliedOn && last[0] === 'applied') {
        reminderRows.push({
          userId: user.id,
          applicationId: app!.id,
          title: FOLLOW_UP_TITLE,
          dueOn: addDays(appliedOn, FOLLOW_UP_DAYS),
          isAuto: true,
        });
      }
      if (sample.reminder) {
        reminderRows.push({
          userId: user.id,
          applicationId: app!.id,
          title: sample.reminder[0],
          dueOn: addDays(today, sample.reminder[1]),
        });
      }
      if (reminderRows.length) await tx.insert(reminders).values(reminderRows);
    }
    return user;
  });
}
