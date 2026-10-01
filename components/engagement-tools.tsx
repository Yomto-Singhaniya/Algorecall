'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { addDays, format, parseISO } from 'date-fns';
import confetti from 'canvas-confetti';
import {
  Activity,
  CalendarClock,
  Check,
  Clock3,
  Flame,
  Mail,
  RefreshCw,
  Shield,
  Sparkles,
  Trophy,
} from 'lucide-react';
import { STREAK_MILESTONES } from '@/hooks/use-tracker';
import { dateKey, INTERVALS } from '@/lib/revisions';
import type {
  DSAQuestion,
  PracticeLogEntry,
  RevisionInterval,
  StreakMilestone,
  UserSettings,
} from '@/types/tracker';

type DueItem = { question: DSAQuestion; interval: RevisionInterval };
type PracticeLogInput = Pick<PracticeLogEntry, 'date' | 'questionsSolvedCount' | 'revisionsCompletedCount' | 'notes'>;
type Props = {
  questions: DSAQuestion[];
  practiceLogs: PracticeLogEntry[];
  milestones: StreakMilestone[];
  settings: UserSettings;
  activeDates: string[];
  streak: number;
  dueItems: DueItem[];
  onSavePracticeLog: (input: PracticeLogInput, manualOverride?: boolean, previousDate?: string) => Promise<unknown>;
  onSaveSettings: (update: Partial<UserSettings>) => Promise<void>;
  onUseStreakFreeze: (date: string) => Promise<void>;
  onAddQuestion: (date: string) => void;
  onReschedule: (mode: 'catch-up' | 'postpone') => Promise<void>;
  onNotice: (message: string) => void;
};

export function EngagementTools({
  questions,
  practiceLogs,
  milestones,
  settings,
  activeDates,
  streak,
  dueItems,
  onSavePracticeLog,
  onSaveSettings,
  onUseStreakFreeze,
  onAddQuestion,
  onReschedule,
  onNotice,
}: Props) {
  const [logDate, setLogDate] = useState(dateKey());
  const [solvedCount, setSolvedCount] = useState('0');
  const [revisionCount, setRevisionCount] = useState('0');
  const [logNotes, setLogNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState(settings.email ?? '');
  const [digestTime, setDigestTime] = useState(settings.preferredEmailTime);
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailError, setEmailError] = useState('');

  useEffect(() => {
    setEmail(settings.email ?? '');
    setDigestTime(settings.preferredEmailTime);
  }, [settings.email, settings.preferredEmailTime]);

  const byTopic = useMemo(() => {
    const grouped = questions.reduce<Record<string, DSAQuestion[]>>((result, question) => {
      const topic = question.topic.trim() || 'Other';
      (result[topic] ??= []).push(question);
      return result;
    }, {});
    return Object.entries(grouped).map(([topic, topicQuestions]) => {
      let overdueStages = 0;
      let oldestOverdueDays = 0;
      let completedStages = 0;
      let totalStages = 0;
      for (const question of topicQuestions) {
        for (const interval of INTERVALS) {
          const stage = question.stages[interval];
          totalStages += 1;
          if (stage.completed) {
            completedStages += 1;
          } else if (stage.targetDate < dateKey()) {
            overdueStages += 1;
            oldestOverdueDays = Math.max(
              oldestOverdueDays,
              Math.max(0, Math.floor((Date.now() - parseISO(stage.targetDate).getTime()) / 86_400_000)),
            );
          }
        }
      }
      const risk = overdueStages * 2 + Math.min(oldestOverdueDays, 14);
      return {
        topic,
        questions: topicQuestions.length,
        overdueStages,
        oldestOverdueDays,
        completionRate: totalStages ? Math.round((completedStages / totalStages) * 100) : 0,
        risk,
      };
    }).sort((left, right) => right.risk - left.risk || left.topic.localeCompare(right.topic));
  }, [questions]);

  const riskyTopic = byTopic.find((topic) => topic.overdueStages > 0);
  const freezeDate = useMemo(() => {
    const active = new Set(activeDates);
    let candidate = addDays(parseISO(dateKey()), -1);
    for (let scanned = 0; scanned < 7 && active.has(dateKey(candidate)); scanned += 1) {
      candidate = addDays(candidate, -1);
    }
    const candidateKey = dateKey(candidate);
    const previousDay = dateKey(addDays(candidate, -1));
    const daysOld = Math.floor((Date.now() - candidate.getTime()) / 86_400_000);
    return !active.has(candidateKey) && active.has(previousDay) && daysOld < 7 ? candidateKey : null;
  }, [activeDates]);

  const submitPracticeLog = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    try {
      await onSavePracticeLog({
        date: logDate,
        questionsSolvedCount: Number(solvedCount),
        revisionsCompletedCount: Number(revisionCount),
        notes: logNotes,
      }, true);
      onNotice('Practice history saved.');
      setLogNotes('');
    } catch (error) {
      onNotice(error instanceof Error ? error.message : 'Could not save practice history.');
    } finally {
      setBusy(false);
    }
  };

  const repairStreak = async () => {
    if (!freezeDate) return;
    try {
      await onUseStreakFreeze(freezeDate);
      onNotice(`Streak freeze applied to ${format(parseISO(freezeDate), 'MMM d')}.`);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : 'Could not apply streak freeze.');
    }
  };

  const saveEmail = async () => {
    setEmailError('');
    try {
      await onSaveSettings({ email: email.trim(), emailNotificationsEnabled: true });
      onNotice('Email digest settings saved.');
    } catch (error) {
      setEmailError(error instanceof Error ? error.message : 'Could not save email settings.');
    }
  };

  const sendDigest = async () => {
    setEmailError('');
    setEmailBusy(true);
    try {
      const response = await fetch('/api/send-reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: settings.email,
          date: dateKey(),
          dueQuestions: dueItems.map(({ question, interval }) => ({
            name: question.name,
            topic: question.topic,
            interval,
            targetDate: question.stages[interval].targetDate,
          })),
        }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? 'The digest could not be sent.');
      onNotice('Your daily recall digest has been sent.');
    } catch (error) {
      setEmailError(error instanceof Error ? error.message : 'The digest could not be sent.');
    } finally {
      setEmailBusy(false);
    }
  };

  const unlockedMilestones = new Set(milestones.filter((milestone) => milestone.unlocked).map((milestone) => milestone.days));

  return (
    <section className="engagement-tools" aria-label="Practice insights and settings">
      <div className="engagement-card analyst-card">
        <div className="tools-heading">
          <span className="tools-icon analyst-icon"><Activity size={17} /></span>
          <div><span className="eyebrow">ALGOANALYST · LOCAL DIAGNOSTICS</span><h2>Your retention check-in</h2></div>
        </div>
        {questions.length ? (
          <>
            {riskyTopic ? (
              <div className="analyst-alert">
                <span className="risk-indicator"><Sparkles size={15} /></span>
                <div><strong>{riskyTopic.topic} may be fading</strong><p>{riskyTopic.overdueStages} overdue review {riskyTopic.overdueStages === 1 ? 'milestone' : 'milestones'}; the oldest is {riskyTopic.oldestOverdueDays} days late. Start with one recall attempt today.</p></div>
              </div>
            ) : (
              <div className="analyst-alert analyst-clear">
                <span className="risk-indicator"><Check size={15} /></span>
                <div><strong>No topic decay flags</strong><p>Your review schedule is current. Keep using retrieval practice to protect long-term recall.</p></div>
              </div>
            )}
            <div className="topic-risk-list">
              {byTopic.slice(0, 4).map((topic) => (
                <div className="topic-risk-row" key={topic.topic}>
                  <span>{topic.topic}</span><span>{topic.questions} {topic.questions === 1 ? 'problem' : 'problems'}</span>
                  <strong className={topic.overdueStages ? 'topic-risk-high' : ''}>{topic.overdueStages ? `${topic.overdueStages} overdue` : `${topic.completionRate}% reviewed`}</strong>
                </div>
              ))}
            </div>
            <p className="tools-disclaimer">A transparent schedule-based heuristic, not a prediction from a trained AI model.</p>
          </>
        ) : <p className="tools-empty">Add solved problems to get topic-level retention signals.</p>}
      </div>

      <div className="engagement-card trophies-card">
        <div className="tools-heading">
          <span className="tools-icon trophy-icon"><Trophy size={17} /></span>
          <div><span className="eyebrow">MILESTONE TROPHY CASE</span><h2>{streak} day streak</h2></div>
        </div>
        <div className="trophy-grid">
          {STREAK_MILESTONES.map((milestone) => {
            const unlocked = unlockedMilestones.has(milestone.days);
            return (
              <div className={`trophy-badge ${unlocked ? 'trophy-unlocked' : ''}`} key={milestone.days} title={`${milestone.days} days · ${milestone.title}`}>
                <span>{unlocked ? milestone.badge : <Shield size={18} />}</span><strong>{milestone.days} days</strong><small>{milestone.title}</small>
              </div>
            );
          })}
        </div>
        <div className="freeze-row">
          <div><strong><Flame size={14} /> Streak freeze</strong><span>{settings.streakFreezeAvailable} available · repairs one missed day</span></div>
          <button className="secondary-button" disabled={!freezeDate || settings.streakFreezeAvailable < 1} onClick={() => void repairStreak()}>Repair streak</button>
        </div>
      </div>

      <div className="engagement-card manual-log-card">
        <div className="tools-heading">
          <span className="tools-icon calendar-icon"><CalendarClock size={17} /></span>
          <div><span className="eyebrow">BACKFILL & STREAK REPAIR</span><h2>Practice history</h2></div>
        </div>
        <form className="manual-log-form" onSubmit={(event) => void submitPracticeLog(event)}>
          <label className="field-label">Practice date<input type="date" value={logDate} max={dateKey()} onChange={(event) => setLogDate(event.target.value)} required /></label>
          <label className="field-label">Solved<input type="number" min="0" max="500" value={solvedCount} onChange={(event) => setSolvedCount(event.target.value)} required /></label>
          <label className="field-label">Revisions<input type="number" min="0" max="500" value={revisionCount} onChange={(event) => setRevisionCount(event.target.value)} required /></label>
          <label className="field-label manual-note-field">Note <span className="optional-label">OPTIONAL</span><input value={logNotes} onChange={(event) => setLogNotes(event.target.value)} placeholder="What did you work on?" maxLength={500} /></label>
          <div className="manual-log-actions">
            <button type="submit" className="primary-button" disabled={busy}>{busy ? 'Saving…' : 'Save / edit day'}</button>
            <button type="button" className="secondary-button" onClick={() => onAddQuestion(logDate)}>Add solved question</button>
          </div>
        </form>
        <div className="practice-log-list">
          {practiceLogs.slice(0, 5).map((entry) => (
            <PracticeLogEditor key={entry.id} entry={entry} onSave={onSavePracticeLog} onNotice={onNotice} />
          ))}
          {!practiceLogs.length && <p className="tools-empty">No manually logged days yet. Record a past session above.</p>}
        </div>
      </div>

      <div className="engagement-card reschedule-card">
        <div className="tools-heading">
          <span className="tools-icon reschedule-icon"><RefreshCw size={17} /></span>
          <div><span className="eyebrow">QUEUE CONTROL</span><h2>Reset your review rhythm</h2></div>
        </div>
        <p>Bring overdue milestones into today’s queue, or move all due work three days ahead. Original target dates are kept for your records.</p>
        <div className="reschedule-actions">
          <button className="secondary-button" disabled={!dueItems.length} onClick={() => void onReschedule('catch-up')}>Catch up overdue</button>
          <button className="secondary-button" disabled={!dueItems.length} onClick={() => void onReschedule('postpone')}>Postpone due · 3 days</button>
        </div>
      </div>

      <div className="engagement-card email-card">
        <div className="tools-heading">
          <span className="tools-icon email-icon"><Mail size={17} /></span>
          <div><span className="eyebrow">ON-DEMAND EMAIL DIGEST</span><h2>Send your recall queue</h2></div>
        </div>
        <p>Digest email is sent only when you ask from this open app. Background delivery is unavailable while your question bank is stored only on this device.</p>
        <div className="email-settings-row">
          <label className="field-label">Recipient<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required /></label>
          <label className="field-label email-time"><Clock3 size={12} /> Preferred time<input type="time" value={digestTime} onChange={(event) => setDigestTime(event.target.value)} onBlur={() => {
            if (digestTime) void onSaveSettings({ preferredEmailTime: digestTime }).catch((error: unknown) => setEmailError(error instanceof Error ? error.message : 'Could not save digest time.'));
          }} /></label>
        </div>
        <label className="email-opt-in"><input type="checkbox" checked={settings.emailNotificationsEnabled} onChange={(event) => void onSaveSettings({ emailNotificationsEnabled: event.target.checked }).catch((error: unknown) => setEmailError(error instanceof Error ? error.message : 'Could not update email settings.'))} /> Enable email digests</label>
        {emailError && <p className="form-error" role="alert">{emailError}</p>}
        <div className="email-actions">
          <button className="secondary-button" onClick={() => void saveEmail()}>Save recipient</button>
          <button className="primary-button" disabled={!settings.emailNotificationsEnabled || !dueItems.length || emailBusy || email.trim().toLowerCase() !== settings.email?.toLowerCase()} onClick={() => void sendDigest()}>{emailBusy ? 'Sending…' : `Send digest · ${dueItems.length} due`}</button>
        </div>
        <p className="tools-disclaimer">Sending requires RESEND_API_KEY, RESEND_FROM_EMAIL, and ALLOWED_REMINDER_EMAIL on the server.</p>
      </div>
    </section>
  );
}

function PracticeLogEditor({
  entry,
  onSave,
  onNotice,
}: {
  entry: PracticeLogEntry;
  onSave: (input: PracticeLogInput, manualOverride?: boolean, previousDate?: string) => Promise<unknown>;
  onNotice: (message: string) => void;
}) {
  const [date, setDate] = useState(entry.date);
  const [solved, setSolved] = useState(String(entry.questionsSolvedCount));
  const [revisions, setRevisions] = useState(String(entry.revisionsCompletedCount));
  const [notes, setNotes] = useState(entry.notes ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await onSave({
        date,
        questionsSolvedCount: Number(solved),
        revisionsCompletedCount: Number(revisions),
        notes,
      }, Boolean(entry.manualOverride), entry.date);
      onNotice(`Practice log for ${format(parseISO(date), 'MMM d')} updated.`);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : 'Could not update practice log.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="practice-log-entry">
      <div className="practice-log-date">
        <label className="log-date-input"><span>Date</span><input aria-label={`Practice date for ${entry.date}`} type="date" max={dateKey()} value={date} onChange={(event) => setDate(event.target.value)} /></label>
        {entry.manualOverride && <span className="manual-tag">MANUAL</span>}
      </div>
      <label><span>Solved</span><input aria-label={`Questions solved on ${entry.date}`} type="number" min="0" max="500" value={solved} onChange={(event) => setSolved(event.target.value)} /></label>
      <label><span>Revisions</span><input aria-label={`Revisions completed on ${entry.date}`} type="number" min="0" max="500" value={revisions} onChange={(event) => setRevisions(event.target.value)} /></label>
      <label className="log-note-input"><span>Note</span><input aria-label={`Practice note for ${entry.date}`} value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} /></label>
      <button className="icon-button subtle" aria-label={`Save practice log for ${entry.date}`} disabled={saving} onClick={() => void save()}><Check size={14} /></button>
    </div>
  );
}
