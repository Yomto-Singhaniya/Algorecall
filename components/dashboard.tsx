'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addDays, differenceInCalendarDays, format, parseISO, startOfWeek } from 'date-fns';
import * as Dialog from '@radix-ui/react-dialog';
import confetti from 'canvas-confetti';
import { AnimatePresence, motion } from 'framer-motion';
import type { DragEvent, FormEvent, ReactNode } from 'react';
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  Bell,
  BellRing,
  BookOpenCheck,
  CalendarCheck2,
  Check,
  CheckCheck,
  ChevronRight,
  CircleHelp,
  Clock3,
  Code2,
  Flame,
  LayoutDashboard,
  Link2,
  ListFilter,
  LoaderCircle,
  MoreHorizontal,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Target,
  Upload,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { AmbientCanvas } from '@/components/ambient-canvas';
import { EngagementTools } from '@/components/engagement-tools';
import { MonthlyAnalytics } from '@/components/monthly-analytics';
import { useTracker, type NewQuestion } from '@/hooks/use-tracker';
import {
  activityDate,
  dateKey,
  getCurrentStreak,
  getPendingStages,
  INTERVALS,
  evaluateQuestionDueStatus,
} from '@/lib/revisions';
import type { DSAQuestion, Difficulty, RevisionInterval } from '@/types/tracker';

type Page = 'Overview' | 'Practice' | 'Question bank' | 'Monthly report';
type Filter = 'All' | Difficulty;
type BankView = 'list' | 'board';
type DueItem = { question: DSAQuestion; interval: RevisionInterval };

const navigation = [
  { label: 'Overview' as const, icon: LayoutDashboard },
  { label: 'Practice' as const, icon: CalendarCheck2 },
  { label: 'Question bank' as const, icon: BookOpenCheck },
  { label: 'Monthly report' as const, icon: Activity },
];

const difficultyClass: Record<Difficulty, string> = {
  Easy: 'difficulty-easy',
  Medium: 'difficulty-medium',
  Hard: 'difficulty-hard',
};

export function Dashboard() {
  const tracker = useTracker();
  const { loading: trackerLoading, awardMilestones } = tracker;
  const [page, setPage] = useState<Page>('Overview');
  const [filter, setFilter] = useState<Filter>('All');
  const [bankView, setBankView] = useState<BankView>('list');
  const [search, setSearch] = useState('');
  const [showQuestionForm, setShowQuestionForm] = useState(false);
  const [showDueModal, setShowDueModal] = useState(false);
  const [questionFormDate, setQuestionFormDate] = useState<string | undefined>();
  const [month, setMonth] = useState(dateKey().slice(0, 7));
  const [today, setToday] = useState(dateKey());
  const [dailyPlanned, setDailyPlanned] = useState<number | null>(null);
  const [notice, setNotice] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [postponedToday, setPostponedToday] = useState(false);
  const [dragging, setDragging] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const dueItems = useMemo(
    () => tracker.questions.flatMap((question) =>
      INTERVALS.filter((interval) => {
        const stage = question.stages[interval];
        return !stage.completed && stage.targetDate <= today;
      }).map((interval) => ({ question, interval })),
    ),
    [tracker.questions, today],
  );
  const dueCount = new Set(dueItems.map((item) => item.question.id)).size;
  const activeDates = [
    ...tracker.questions.flatMap((question) => [
      question.solvedDate,
      ...Object.values(question.stages)
        .filter((stage) => stage.completedAt)
        .map((stage) => activityDate(stage.completedAt!)),
    ]),
    ...tracker.practiceLogs
      .filter((entry) => entry.questionsSolvedCount + entry.revisionsCompletedCount > 0 || entry.manualOverride)
      .map((entry) => entry.date),
  ];
  const streak = getCurrentStreak(activeDates);
  const activeDateSet = new Set(activeDates);
  const streakWeek = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const dueState = tracker.questions.reduce(
    (state, question) => {
      const status = evaluateQuestionDueStatus(question.stages);
      return { due: state.due + Number(status.isDueToday), overdue: state.overdue + Number(status.isOverdue) };
    },
    { due: 0, overdue: 0 },
  );
  const reviewedToday = tracker.questions.reduce((count, question) => count + Object.values(question.stages).filter(
    (stage) => stage.completedAt != null && activityDate(stage.completedAt) === today,
  ).length, 0);
  const todayProgress = dailyPlanned
    ? Math.min(100, Math.round((reviewedToday / dailyPlanned) * 100))
    : 0;

  const filteredQuestions = useMemo(() => tracker.questions.filter((question) => {
    const matchesDifficulty = filter === 'All' || question.difficulty === filter;
    const haystack = `${question.name} ${question.topic} ${question.problemUrl ?? ''}`.toLowerCase();
    return matchesDifficulty && haystack.includes(search.toLowerCase());
  }), [tracker.questions, filter, search]);
  const boardQuestions = useMemo(() => tracker.questions.filter((question) => {
    const matchesDifficulty = filter === 'All' || question.difficulty === filter;
    const haystack = `${question.name} ${question.topic} ${question.problemUrl ?? ''}`.toLowerCase();
    return matchesDifficulty && haystack.includes(search.toLowerCase());
  }), [tracker.questions, filter, search]);

  useEffect(() => {
    const midnightRefresh = window.setInterval(() => {
      const nextDay = dateKey();
      if (today !== nextDay) {
        setToday(nextDay);
        setDailyPlanned(null);
        setPostponedToday(false);
      }
    }, 60_000);
    return () => window.clearInterval(midnightRefresh);
  }, [today]);

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      const target = event.target;
      if (event.key !== '/' || target instanceof HTMLElement && (
        target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
      )) return;
      event.preventDefault();
      setPage('Question bank');
      window.setTimeout(() => searchInputRef.current?.focus(), 0);
    };
    window.addEventListener('keydown', focusSearch);
    return () => window.removeEventListener('keydown', focusSearch);
  }, []);

  useEffect(() => {
    if (!tracker.loading && dailyPlanned === null) setDailyPlanned(reviewedToday + dueItems.length);
  }, [tracker.loading, dailyPlanned, reviewedToday, dueItems.length]);

  useEffect(() => {
    if (!tracker.loading) setSoundEnabled(tracker.settings.soundEnabled);
  }, [tracker.loading, tracker.settings.soundEnabled]);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.register('/sw.js').catch(() => {
        setNotice('Browser reminders are unavailable in this browser session.');
      });
    }
  }, []);

  useEffect(() => {
    if (trackerLoading) return;
    void awardMilestones(streak).then((unlocked) => {
      if (!unlocked.length) return;
      confetti({ particleCount: 115, spread: 76, origin: { y: 0.62 }, colors: ['#a6f2cd', '#e7c279', '#f6f4ec'] });
      setNotice(`${unlocked[unlocked.length - 1].title} · ${unlocked[unlocked.length - 1].days}-day trophy unlocked!`);
    }).catch(() => {
      setNotice('A streak trophy could not be saved. Please try again later.');
    });
  }, [trackerLoading, awardMilestones, streak]);

  const sendReminder = useCallback(() => {
    if (!('Notification' in window) || Notification.permission !== 'granted' || dueCount === 0) return;
    const sentDate = window.localStorage.getItem('algorecall-reminder-date');
    if (sentDate === today) return;
    new Notification('AlgoRecall · review time', {
      body: `${dueCount} ${dueCount === 1 ? 'question is' : 'questions are'} ready for a quick review.`,
      icon: '/icon.svg',
      tag: `algorecall-${today}`,
    });
    window.localStorage.setItem('algorecall-reminder-date', today);
  }, [dueCount, today]);

  useEffect(() => {
    sendReminder();
    const intervalId = window.setInterval(sendReminder, 30 * 60 * 1000);
    return () => window.clearInterval(intervalId);
  }, [sendReminder]);

  const handleAddQuestion = async (input: NewQuestion) => {
    const added = await tracker.addQuestion(input);
    const newlyDue = getPendingStages(added).length;
    if (newlyDue) {
      setDailyPlanned((planned) => (planned ?? reviewedToday + dueItems.length) + newlyDue);
    }
    setShowQuestionForm(false);
    setQuestionFormDate(undefined);
    setNotice('Question added to your recall plan.');
    window.setTimeout(() => setNotice(''), 3500);
  };

  const handleRevision = async (item: DueItem) => {
    await tracker.completeRevision(item.question.id, item.interval);
    if (soundEnabled) playChime();
    if (dueItems.length === 1 && !postponedToday) {
      confetti({ particleCount: 95, spread: 68, origin: { y: 0.68 }, colors: ['#a6f2cd', '#e7c279', '#f6f4ec'] });
      setNotice('Your revision queue is clear. Beautiful work.');
    } else {
      setNotice('Revision logged · +15 XP');
      window.setTimeout(() => setNotice(''), 2800);
    }
  };

  const handlePostpone = async (item: DueItem) => {
    await tracker.postponeRevision(item.question.id, item.interval);
    setPostponedToday(true);
    setNotice('Reminder moved to tomorrow.');
    window.setTimeout(() => setNotice(''), 2800);
  };

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    void tracker.saveSettings({ soundEnabled: next }).catch((error: unknown) => {
      setNotice(error instanceof Error ? error.message : 'Sound settings could not be saved.');
    });
  };

  const addQuestionForDate = (date: string) => {
    setQuestionFormDate(date);
    setShowQuestionForm(true);
  };

  const rescheduleDue = async (mode: 'catch-up' | 'postpone') => {
    try {
      await tracker.rescheduleDueStages(mode);
      setNotice(mode === 'catch-up' ? 'Overdue milestones are in today’s queue.' : 'Due milestones moved three days ahead.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Due milestones could not be rescheduled.');
    }
  };

  const enableNotifications = async () => {
    if (!('Notification' in window)) {
      setNotice('This browser does not support web notifications.');
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      setNotice('Reminders enabled. We’ll nudge you when reviews are due.');
      window.localStorage.removeItem('algorecall-reminder-date');
      sendReminder();
    } else {
      setNotice('Notifications are off. You can enable them in browser settings.');
    }
    window.setTimeout(() => setNotice(''), 4000);
  };

  const exportJson = () => {
    const rows = tracker.questions.map((question) => ({
      ID: question.id,
      'Question Name': question.name,
      'Date Solved': question.solvedDate,
      '+3 Days': question.stages[3].targetDate,
      '+7 Days': question.stages[7].targetDate,
      '+15 Days': question.stages[15].targetDate,
      '+30 Days': question.stages[30].targetDate,
      '+60 Days': question.stages[60].targetDate,
      '+120 Days': question.stages[120].targetDate,
      Status: question.status,
      'Due Today?': evaluateQuestionDueStatus(question.stages).isDueToday ? 'Yes' : 'No',
      Topic: question.topic,
      Difficulty: question.difficulty,
      'Problem URL': question.problemUrl ?? '',
      Notes: question.notes ?? '',
      Revisions: Object.fromEntries(INTERVALS.map((interval) => [
        interval,
        {
          targetDate: question.stages[interval].targetDate,
          ...(question.stages[interval].originalTargetDate
            ? { originalTargetDate: question.stages[interval].originalTargetDate }
            : {}),
          completed: question.stages[interval].completed,
          ...(question.stages[interval].completedAt
            ? { completedAt: question.stages[interval].completedAt }
            : {}),
        },
      ])),
    }));
    const backup = {
      schemaVersion: 2,
      exportedAt: new Date().toISOString(),
      questions: rows,
      practiceLogs: tracker.practiceLogs,
      milestones: tracker.milestones,
      settings: tracker.settings,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `algorecall-${today}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice('Your tracker is exported as JSON.');
    window.setTimeout(() => setNotice(''), 2800);
  };

  const importFile = async (file?: File) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.json')) {
      setNotice('Please choose an AlgoRecall JSON export.');
      return;
    }
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const imported = await tracker.importQuestions(parsed);
      setNotice(`${imported} ${imported === 1 ? 'question' : 'questions'} imported.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not read that JSON file.');
    }
    window.setTimeout(() => setNotice(''), 4200);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    void importFile(event.dataTransfer.files[0]);
  };

  const shownTitle = page === 'Overview' ? 'A little progress, every day.' : page;

  return (
    <div
      className="app-shell"
      onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={handleDrop}
    >
      <AmbientCanvas />
      <aside className="sidebar">
        <button type="button" className="brand" onClick={() => setPage('Overview')}>
          <span className="brand-mark"><Code2 size={19} strokeWidth={2.2} /></span>
          <span>algo<span>recall</span><small>YOUR DSA MEMORY STUDIO</small></span>
        </button>

        <div className="sidebar-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Main navigation">
          {navigation.map(({ label, icon: Icon }) => (
            <button key={label} className={`nav-item ${page === label ? 'nav-active' : ''}`} onClick={() => setPage(label)}>
              <Icon size={17} strokeWidth={1.8} />
              <span>{label}</span>
              {label === 'Practice' && dueCount > 0 && <i className="nav-count">{dueCount}</i>}
            </button>
          ))}
        </nav>

        <div className="sidebar-spacer" />
        <div className="sidebar-quote">
          <div className="quote-icon"><Sparkles size={15} /></div>
          <p>“Small, consistent revisions beat one heroic cram session.”</p>
          <span>THE ALGORITHM OF LEARNING</span>
        </div>
        <div className="sidebar-bottom">
          <div className="avatar">A</div>
          <div className="profile-copy"><strong>Your workspace</strong><span>Local & private</span></div>
          <button className="icon-button subtle" aria-label="Settings and reminders" title="Enable browser reminders" onClick={enableNotifications}><Settings2 size={17} /></button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb"><span>Workspace</span><ChevronRight size={13} /><strong>{page}</strong></div>
          <div className="top-actions">
            <span className="today-label"><span className="live-dot" /> {format(new Date(), 'EEEE, MMM d')}</span>
            <button className="icon-button sound-toggle" aria-label={soundEnabled ? 'Mute completion sound' : 'Enable completion sound'} onClick={toggleSound}>
              {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>
            <button className={`reminder-button ${dueCount ? 'has-reminders' : ''}`} onClick={() => setShowDueModal(true)}>
              {dueCount ? <BellRing size={16} /> : <Bell size={16} />}
              <span>{dueCount ? `${dueCount} due today` : 'All caught up'}</span>
              {dueCount > 0 && <i>{dueCount}</i>}
            </button>
          </div>
        </header>

        <div className="page-content">
          {tracker.error && <div className="error-banner" role="alert"><CircleHelp size={16} /><span>{tracker.error}</span><button onClick={tracker.clearError}><X size={15} /></button></div>}

          {page === 'Overview' && (
            <>
              <section className="welcome-row">
                <div className="welcome-copy">
                  <div className="eyebrow"><span className="eyebrow-line" /> {format(new Date(), 'EEEE, MMMM d, yyyy').toUpperCase()}</div>
                  <h1>{shownTitle}</h1>
                  <p>Build the kind of recall that shows up when it matters.</p>
                </div>
                <motion.button whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }} className="primary-button" onClick={() => setShowQuestionForm(true)}>
                  <Plus size={17} /> Log a problem
                </motion.button>
              </section>

              <section className="stats-grid">
                <StatCard icon={<Target size={17} />} label="PROBLEMS SOLVED" value={tracker.loading ? '—' : `${tracker.questions.length}`} caption="and counting" tone="mint" />
                <StatCard icon={<Flame size={17} />} label="CURRENT STREAK" value={`${streak} ${streak === 1 ? 'day' : 'days'}`} caption={streak ? 'keep the spark alive' : 'start a streak today'} tone="orange" />
                <StatCard icon={<Clock3 size={17} />} label="READY TO RECALL" value={`${dueCount}`} caption={dueState.overdue ? `${dueState.overdue} need a little catch-up` : 'your review queue'} tone="purple" />
                <StatCard icon={<Sparkles size={17} />} label="TOTAL XP" value={tracker.xp.toLocaleString()} caption="earned by showing up" tone="gold" />
              </section>

              <section className="focus-grid">
                <div className="focus-card">
                  <div className="focus-glow" />
                  <div className="focus-head">
                    <div className="focus-icon"><CalendarCheck2 size={18} /></div>
                    <span className="focus-status"><span /> TODAY&apos;S RECALL</span>
                    <button className="text-button" onClick={() => setPage('Practice')}>Open practice <ArrowRight size={14} /></button>
                  </div>
                  <div className="focus-main">
                    <div><h2>{dueCount ? 'Bring it back to mind.' : 'A clear mind, a clear queue.'}</h2><p>{dueCount ? `${dueItems.length} revision ${dueItems.length === 1 ? 'milestone is' : 'milestones are'} ready. A few minutes now makes it stick.` : 'No reviews due right now. Add a solved problem to start your recall rhythm.'}</p></div>
                    <button className={`focus-cta ${dueCount ? 'focus-cta-ready' : ''}`} onClick={() => dueCount ? setShowDueModal(true) : setShowQuestionForm(true)}>
                      {dueCount ? 'Start reviewing' : 'Log your first problem'} <ArrowRight size={15} />
                    </button>
                  </div>
                  <div className="focus-progress">
                    <div className="progress-label"><span>DAILY RECALL</span><span>{reviewedToday} complete <b>·</b> {dueItems.length} left</span></div>
                    <div className="progress-track"><motion.div initial={{ width: 0 }} animate={{ width: `${todayProgress}%` }} /></div>
                  </div>
                </div>

                <div className="streak-card">
                  <div className="streak-orb"><Flame size={21} fill="currentColor" /></div>
                  <span className="eyebrow">YOUR MOMENTUM</span>
                  <strong>{streak}<small>day streak</small></strong>
                  <p>{streak > 0 ? 'You’re building a habit that lasts.' : 'One problem today is all it takes.'}</p>
                  <div className="streak-dots">{streakWeek.map((day) => {
                    const key = dateKey(day);
                    const dayClass = key === today ? 'streak-today' : key > today ? 'streak-future' : activeDateSet.has(key) ? 'streak-active' : '';
                    return <span key={key} className={dayClass} title={format(day, 'EEEE, MMM d')}>{format(day, 'EEEEE')}</span>;
                  })}</div>
                </div>
              </section>

              <EngagementTools
                questions={tracker.questions}
                practiceLogs={tracker.practiceLogs}
                milestones={tracker.milestones}
                settings={tracker.settings}
                activeDates={activeDates}
                streak={streak}
                dueItems={dueItems}
                onSavePracticeLog={tracker.savePracticeLog}
                onSaveSettings={tracker.saveSettings}
                onUseStreakFreeze={tracker.useStreakFreeze}
                onAddQuestion={addQuestionForDate}
                onReschedule={rescheduleDue}
                onNotice={setNotice}
              />

              <MonthlyAnalytics questions={tracker.questions} practiceLogs={tracker.practiceLogs} month={month} onMonthChange={setMonth} compact />

              <QuestionSection
                questions={tracker.questions.slice(0, 5)}
                allCount={tracker.questions.length}
                title="Recently added"
                onSeeAll={() => setPage('Question bank')}
                onDelete={tracker.deleteQuestion}
              />
            </>
          )}

          {page === 'Practice' && (
            <>
              <PageIntro eyebrow="YOUR RECALL SESSION" title="Practice, then make it stick." description="A little retrieval practice today saves a lot of relearning tomorrow." action={<button className="secondary-button" onClick={enableNotifications}><Bell size={15} /> Reminders</button>} />
              <div className="practice-summary">
                <div><span>REVISION MILESTONES DUE</span><strong>{dueItems.length}</strong><small>{dueCount} unique {dueCount === 1 ? 'problem' : 'problems'}</small></div>
                <div><span>COMPLETED TODAY</span><strong>{reviewedToday}</strong><small>+15 XP each</small></div>
                <div><span>OVERDUE PROBLEMS</span><strong>{dueState.overdue}</strong><small>no rush, start where you are</small></div>
                <div className="practice-progress"><span>TODAY&apos;S PROGRESS</span><strong>{todayProgress}%</strong><div className="progress-track"><i style={{ width: `${todayProgress}%` }} /></div></div>
              </div>
              <section className="content-card practice-list-card">
                <div className="section-heading">
                  <div><div className="eyebrow">READY WHEN YOU ARE</div><h2>Today&apos;s revision queue</h2></div>
                  <span className="queue-count">{dueItems.length} {dueItems.length === 1 ? 'milestone' : 'milestones'}</span>
                </div>
                {dueItems.length ? (
                  <div className="review-list">
                    {dueItems.map((item) => (
                      <ReviewRow key={`${item.question.id}-${item.interval}`} item={item} onComplete={handleRevision} onPostpone={handlePostpone} />
                    ))}
                  </div>
                ) : <EmptyState icon={<CheckCheck size={22} />} title="No revisions due today" description={tracker.questions.length ? 'Your recall queue is clear. Come back when your next milestone arrives.' : 'Log your first solved problem and we’ll build a revision schedule around it.'} action={!tracker.questions.length ? <button className="secondary-button" onClick={() => setShowQuestionForm(true)}><Plus size={15} /> Add a problem</button> : undefined} />}
              </section>
              <section className="schedule-note"><Sparkles size={17} /><div><strong>Made for long-term recall</strong><p>Your problem comes back after 3, 7, 15, 30, 60, and 120 days. Mark a milestone revised to earn <b>+15 XP</b>.</p></div></section>
            </>
          )}

          {page === 'Question bank' && (
            <>
              <PageIntro eyebrow="YOUR PERSONAL PROBLEM SET" title="The question bank." description="Every problem you’ve solved, organized into a plan you can actually keep." action={<button className="primary-button" onClick={() => setShowQuestionForm(true)}><Plus size={16} /> Add question</button>} />
              <div className="bank-toolbar">
                <div className="filter-tabs" role="tablist" aria-label="Filter by difficulty">
                  {(['All', 'Easy', 'Medium', 'Hard'] as const).map((item) => <button key={item} className={filter === item ? 'filter-active' : ''} onClick={() => setFilter(item)} role="tab" aria-selected={filter === item}>{item === 'All' ? 'All questions' : item}<span>{item === 'All' ? tracker.questions.length : tracker.questions.filter((question) => question.difficulty === item).length}</span></button>)}
                </div>
                <label className="search-box"><Search size={16} /><input ref={searchInputRef} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search problems, topics..." /><kbd>/</kbd></label>
                <div className="view-toggle" role="group" aria-label="Question layout">
                  <button className={bankView === 'list' ? 'view-selected' : ''} onClick={() => setBankView('list')} aria-label="List view"><ListFilter size={15} /></button>
                  <button className={bankView === 'board' ? 'view-selected' : ''} onClick={() => setBankView('board')} aria-label="Difficulty board"><LayoutDashboard size={15} /></button>
                </div>
              </div>
              {bankView === 'list' ? (
                <QuestionSection questions={filteredQuestions} allCount={filteredQuestions.length} title={filter === 'All' ? 'All questions' : `${filter} problems`} onDelete={tracker.deleteQuestion} full />
              ) : (
                <QuestionBoard questions={boardQuestions} onDelete={tracker.deleteQuestion} />
              )}
              <div className="import-export-row">
                <div><strong>Bring your tracker with you.</strong><span>Back up questions, practice history, trophies, and settings as JSON.</span></div>
                <div>
                  <button className="secondary-button" onClick={() => importInputRef.current?.click()}><Upload size={15} /> Import JSON</button>
                  <button className="secondary-button" onClick={exportJson}><ArrowDownToLine size={15} /> Export JSON</button>
                </div>
              </div>
            </>
          )}

          {page === 'Monthly report' && (
            <>
              <PageIntro eyebrow="LOOK HOW FAR YOU’VE COME" title="Progress, made visible." description="Small wins add up. Here’s the shape of your practice over time." action={<span className="private-label"><span /> Stored privately on this device</span>} />
              <MonthlyAnalytics questions={tracker.questions} practiceLogs={tracker.practiceLogs} month={month} onMonthChange={setMonth} />
              <section className="content-card report-note"><div className="report-note-icon"><Sparkles size={18} /></div><div><strong>Consistency beats intensity.</strong><p>Your report updates automatically as you solve problems and complete review milestones.</p></div></section>
            </>
          )}
        </div>
        <footer className="page-footer"><span>ALGORecall <i>·</i> REMEMBER MORE OF WHAT YOU SOLVE</span><span><span className="privacy-dot" /> Your question bank stays on this device</span></footer>
      </main>

      <AnimatePresence>
        {showQuestionForm && <QuestionForm key="question-form" initialDate={questionFormDate} onClose={() => { setShowQuestionForm(false); setQuestionFormDate(undefined); }} onSubmit={handleAddQuestion} />}
        {showDueModal && <DueModal key="due-modal" items={dueItems} onClose={() => setShowDueModal(false)} onComplete={handleRevision} onPostpone={handlePostpone} />}
        {notice && <motion.div key="notice" className="toast" role="status" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}><span className="toast-check"><Check size={14} /></span>{notice}<button onClick={() => setNotice('')} aria-label="Dismiss message"><X size={14} /></button></motion.div>}
        {dragging && <motion.div key="drop-overlay" className="drop-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><div><Upload size={28} /><strong>Drop your JSON tracker here</strong><span>We’ll merge it into your local question bank</span></div></motion.div>}
      </AnimatePresence>
      <input ref={importInputRef} type="file" accept=".json,application/json" hidden onChange={(event) => { void importFile(event.target.files?.[0]); event.target.value = ''; }} />
    </div>
  );
}

function StatCard({ icon, label, value, caption, tone }: { icon: ReactNode; label: string; value: string; caption: string; tone: string }) {
  return <motion.div className="stat-card" whileHover={{ y: -2 }}><div className={`stat-icon stat-${tone}`}>{icon}</div><span className="stat-label">{label}</span><strong>{value}</strong><small>{caption}</small><span className={`stat-spark stat-spark-${tone}`} /></motion.div>;
}

function PageIntro({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <section className="page-intro"><div><div className="eyebrow"><span className="eyebrow-line" /> {eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action}</section>;
}

function QuestionSection({ questions, allCount, title, onSeeAll, onDelete, full = false }: { questions: DSAQuestion[]; allCount: number; title: string; onSeeAll?: () => void; onDelete: (id: string) => Promise<void>; full?: boolean }) {
  return (
    <section className={`content-card question-section ${full ? 'question-section-full' : ''}`}>
      <div className="section-heading">
        <div><div className="eyebrow">{full ? 'YOUR LIBRARY' : 'KEEP THE MOMENTUM'}</div><h2>{title}<span className="heading-count">{allCount}</span></h2></div>
        {onSeeAll && <button className="text-button" onClick={onSeeAll}>View all <ArrowRight size={14} /></button>}
      </div>
      {questions.length ? (
        <div className="question-list">
          {questions.map((question) => <QuestionRow key={question.id} question={question} onDelete={onDelete} />)}
        </div>
      ) : (
        <EmptyState icon={<Code2 size={22} />} title="Your next breakthrough starts here." description="Log a problem you’ve solved. We’ll schedule the right moments to bring it back." action={<span className="empty-hint"><Sparkles size={13} /> +10 to +50 XP for every problem</span>} />
      )}
    </section>
  );
}

function QuestionRow({ question, onDelete }: { question: DSAQuestion; onDelete: (id: string) => Promise<void> }) {
  const pending = INTERVALS.filter((interval) => !question.stages[interval].completed).length;
  const solvedDate = parseISO(question.solvedDate);
  return (
    <div className="question-row">
      <span className={`question-symbol ${difficultyClass[question.difficulty]}`}><Code2 size={16} /></span>
      <div className="question-main">
        <div className="question-title">{question.problemUrl ? <a href={question.problemUrl} target="_blank" rel="noreferrer">{question.name}<Link2 size={12} /></a> : <strong>{question.name}</strong>}</div>
        <div className="question-meta"><span>{question.topic}</span><i>·</i><span>Solved {format(solvedDate, 'MMM d')}</span></div>
      </div>
      <span className={`difficulty-pill ${difficultyClass[question.difficulty]}`}>{question.difficulty}</span>
      <div className="question-status"><span className={`status-indicator ${question.status === 'Mastered' ? 'status-mastered' : ''}`} />{question.status === 'Mastered' ? 'Mastered' : `${pending} milestones left`}</div>
      <button className="icon-button row-more" aria-label={`Delete ${question.name}`} title="Delete question" onClick={() => {
        if (window.confirm(`Remove “${question.name}” and its revision history?`)) void onDelete(question.id);
      }}><MoreHorizontal size={17} /></button>
    </div>
  );
}

function QuestionBoard({ questions, onDelete }: { questions: DSAQuestion[]; onDelete: (id: string) => Promise<void> }) {
  const columns: Difficulty[] = ['Easy', 'Medium', 'Hard'];
  return (
    <div className="difficulty-board">
      {columns.map((difficulty) => {
        const columnQuestions = questions.filter((question) => question.difficulty === difficulty);
        return (
          <section className={`board-column ${difficultyClass[difficulty]}`} key={difficulty}>
            <div className="board-heading"><span className="board-dot" /><strong>{difficulty}</strong><i>{columnQuestions.length}</i></div>
            {columnQuestions.length ? columnQuestions.map((question) => (
              <article className="board-card" key={question.id}>
                <div className="board-card-meta"><span className={`difficulty-pill ${difficultyClass[difficulty]}`}>{difficulty}</span><button className="icon-button row-more" title="Delete question" aria-label={`Delete ${question.name}`} onClick={() => { if (window.confirm(`Remove “${question.name}” and its revision history?`)) void onDelete(question.id); }}><MoreHorizontal size={16} /></button></div>
                <strong className="board-card-title">{question.problemUrl ? <a href={question.problemUrl} target="_blank" rel="noreferrer">{question.name}<Link2 size={11} /></a> : question.name}</strong>
                <div className="board-card-topic"><span>{question.topic}</span><span>{question.status === 'Mastered' ? 'Mastered' : `${INTERVALS.filter((interval) => !question.stages[interval].completed).length} stages left`}</span></div>
              </article>
            )) : <div className="board-empty">No {difficulty.toLowerCase()} problems yet</div>}
          </section>
        );
      })}
    </div>
  );
}

function ReviewRow({ item, onComplete, onPostpone }: { item: DueItem; onComplete: (item: DueItem) => Promise<void>; onPostpone: (item: DueItem) => Promise<void> }) {
  const stage = item.question.stages[item.interval];
  const overdueDays = Math.max(0, differenceInCalendarDays(parseISO(dateKey()), parseISO(stage.targetDate)));
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const complete = async () => {
    setBusy(true);
    setActionError('');
    try { await onComplete(item); } catch { setActionError('Could not save this revision. Try again.'); } finally { setBusy(false); }
  };
  const postpone = async () => {
    setBusy(true);
    setActionError('');
    try { await onPostpone(item); } catch { setActionError('Could not move this reminder. Try again.'); } finally { setBusy(false); }
  };
  return (
    <motion.div layout className="review-row">
      <div className="review-check"><Clock3 size={17} /></div>
      <div className="review-question"><strong>{item.question.name}</strong><span>{item.question.topic}<i>·</i><span className={`difficulty-text ${difficultyClass[item.question.difficulty]}`}>{item.question.difficulty}</span></span></div>
      <div className="review-interval"><strong>+{item.interval} days</strong><span>{overdueDays ? `${overdueDays}d overdue` : 'due today'}</span></div>
      <button className="postpone-button" onClick={() => void postpone()} disabled={busy} title="Postpone until tomorrow"><Clock3 size={14} /><span>Tomorrow</span></button>
      <button className="complete-button" onClick={() => void complete()} disabled={busy}>{busy ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />} Mark revised <span>+15 XP</span></button>
      {actionError && <span className="review-error" role="alert">{actionError}</span>}
    </motion.div>
  );
}

function EmptyState({ icon, title, description, action }: { icon: ReactNode; title: string; description: string; action?: ReactNode }) {
  return <div className="empty-state"><span className="empty-icon">{icon}</span><strong>{title}</strong><p>{description}</p>{action}</div>;
}

function QuestionForm({ initialDate, onClose, onSubmit }: { initialDate?: string; onClose: () => void; onSubmit: (input: NewQuestion) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('Medium');
  const [solvedDate, setSolvedDate] = useState(initialDate ?? dateKey());
  const [problemUrl, setProblemUrl] = useState('');
  const [notes, setNotes] = useState('');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError('');
    setBusy(true);
    try {
      await onSubmit({
        name: name.trim(),
        topic: topic.trim(),
        difficulty,
        solvedDate,
        ...(problemUrl.trim() ? { problemUrl: problemUrl.trim() } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });
    } catch {
      setFormError('Couldn’t save your question. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} label="Add a solved problem">
      <div className="form-modal">
        <div className="modal-kicker"><span className="modal-icon"><Plus size={17} /></span><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={17} /></button></div>
        <div className="modal-title"><span className="eyebrow">GIVE IT A FUTURE</span><h2>Log a problem.</h2><p>We’ll plan six gentle nudges so the solution stays with you.</p></div>
        <form onSubmit={(event) => void submit(event)}>
          <label className="field-label">Problem name<input autoFocus required value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Two Sum" maxLength={120} /></label>
          <div className="form-two-col">
            <label className="field-label">Topic<input required value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="e.g. Arrays" maxLength={60} /></label>
            <label className="field-label">Date solved<input required type="date" value={solvedDate} max={dateKey()} onChange={(event) => setSolvedDate(event.target.value)} /></label>
          </div>
          <fieldset className="difficulty-field"><legend className="field-label">Difficulty</legend><div className="difficulty-options">{(['Easy', 'Medium', 'Hard'] as const).map((item) => <button type="button" key={item} className={`difficulty-option ${difficulty === item ? 'difficulty-selected' : ''} ${difficultyClass[item]}`} onClick={() => setDifficulty(item)}><span />{item}<small>{item === 'Easy' ? '+10' : item === 'Medium' ? '+20' : '+50'} XP</small></button>)}</div></fieldset>
          <label className="field-label">Problem URL <span className="optional-label">OPTIONAL</span><input type="url" value={problemUrl} onChange={(event) => setProblemUrl(event.target.value)} placeholder="https://leetcode.com/problems/..." /></label>
          <label className="field-label">A note to future you <span className="optional-label">OPTIONAL</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="What insight made it click?" rows={2} maxLength={500} /></label>
          {formError && <p className="form-error" role="alert">{formError}</p>}
          <div className="schedule-preview"><Sparkles size={15} /><span>Your recall plan</span><strong>+3&nbsp; +7&nbsp; +15&nbsp; +30&nbsp; +60&nbsp; +120 days</strong></div>
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button" disabled={busy}>{busy ? <LoaderCircle size={16} className="spin" /> : <Plus size={16} />} Add to my plan</button></div>
        </form>
      </div>
    </Modal>
  );
}

function DueModal({ items, onClose, onComplete, onPostpone }: { items: DueItem[]; onClose: () => void; onComplete: (item: DueItem) => Promise<void>; onPostpone: (item: DueItem) => Promise<void> }) {
  return (
    <Modal onClose={onClose} label="Revision reminders">
      <div className="due-modal">
        <div className="modal-kicker"><span className="modal-icon modal-icon-bell"><BellRing size={17} /></span><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={17} /></button></div>
        <div className="modal-title"><span className="eyebrow">YOUR RECALL QUEUE</span><h2>{items.length ? `${items.length} little reminders.` : 'You’re all caught up.'}</h2><p>{items.length ? 'A quick attempt from memory is all it takes. Reveal the solution only after you’ve tried.' : 'There’s nothing waiting for you today. Enjoy the breathing room.'}</p></div>
        {items.length ? <div className="modal-due-list">{items.map((item) => <ReviewRow key={`${item.question.id}-${item.interval}`} item={item} onComplete={onComplete} onPostpone={onPostpone} />)}</div> : <div className="modal-clear"><CheckCheck size={20} /><span>Fresh page, clear head.</span></div>}
        <button className="modal-done" onClick={onClose}>{items.length ? 'Back to workspace' : 'Lovely'} <ArrowRight size={15} /></button>
      </div>
    </Modal>
  );
}

function Modal({ children, onClose, label }: { children: ReactNode; onClose: () => void; label: string }) {
  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay asChild>
          <motion.div
            className="modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
          >
            <Dialog.Content asChild>
              <motion.div
                className="modal-panel"
                initial={{ y: 18, opacity: 0, scale: .985 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: 10, opacity: 0, scale: .99 }}
                transition={{ type: 'spring', duration: .4, bounce: .12 }}
              >
                <Dialog.Title className="sr-only">{label}</Dialog.Title>
                {children}
              </motion.div>
            </Dialog.Content>
          </motion.div>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function playChime() {
  const AudioContextClass = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;
  const audio = new AudioContextClass();
  const now = audio.currentTime;
  [660, 880].forEach((frequency, index) => {
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, now + index * 0.11);
    gain.gain.exponentialRampToValueAtTime(0.045, now + index * 0.11 + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.11 + 0.28);
    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.start(now + index * 0.11);
    oscillator.stop(now + index * 0.11 + 0.3);
  });
  window.setTimeout(() => { void audio.close(); }, 800);
}
