'use client';

import { differenceInCalendarMonths, eachDayOfInterval, endOfMonth, format, getDay, parseISO, startOfMonth } from 'date-fns';
import { CalendarDays, ChevronDown, Sparkles } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { activityDate, getCurrentStreak, INTERVALS } from '@/lib/revisions';
import type { DSAQuestion } from '@/types/tracker';

const COLORS = ['#91e3b7', '#efbd68', '#f27b83'];
type Props = {
  questions: DSAQuestion[];
  month: string;
  onMonthChange: (month: string) => void;
  compact?: boolean;
};

export function MonthlyAnalytics({ questions, month, onMonthChange, compact = false }: Props) {
  const [year, monthNumber] = month.split('-').map(Number);
  const firstDay = startOfMonth(new Date(year, monthNumber - 1));
  const lastDay = endOfMonth(firstDay);
  const days = eachDayOfInterval({ start: firstDay, end: lastDay });
  const earliestSolvedDate = questions.map((question) => question.solvedDate).sort()[0];
  const monthCount = earliestSolvedDate
    ? Math.max(differenceInCalendarMonths(new Date(), parseISO(earliestSolvedDate)), 17)
    : 17;
  const months = Array.from({ length: monthCount + 1 }, (_, index) => {
    const date = new Date();
    date.setMonth(date.getMonth() - index);
    return format(date, 'yyyy-MM');
  });
  const monthQuestions = questions.filter((question) => question.solvedDate.startsWith(month));
  const difficultyData = ['Easy', 'Medium', 'Hard'].map((difficulty, index) => ({
    name: difficulty,
    value: monthQuestions.filter((question) => question.difficulty === difficulty).length,
    color: COLORS[index],
  }));
  const activity = days.map((day) => {
    const date = format(day, 'yyyy-MM-dd');
    return {
      label: format(day, 'd'),
      solved: monthQuestions.filter((question) => question.solvedDate === date).length,
      date,
    };
  });
  const scheduled = questions.flatMap((question) =>
    INTERVALS.map((interval) => ({
      targetDate: question.stages[interval].originalTargetDate ?? question.stages[interval].targetDate,
      completed: question.stages[interval].completed,
      completedAt: question.stages[interval].completedAt,
    })),
  ).filter((stage) => stage.targetDate.startsWith(month));
  const completedOnTime = scheduled.filter(
    (stage) => stage.completed && stage.completedAt && activityDate(stage.completedAt) <= stage.targetDate,
  ).length;
  const completionRate = scheduled.length ? Math.round((completedOnTime / scheduled.length) * 100) : 0;
  const topicCounts = monthQuestions.reduce<Record<string, number>>((counts, question) => {
    counts[question.topic] = (counts[question.topic] ?? 0) + 1;
    return counts;
  }, {});
  const practiceCounts = new Map<string, number>();
  for (const question of questions) {
    practiceCounts.set(question.solvedDate, (practiceCounts.get(question.solvedDate) ?? 0) + 1);
    for (const stage of Object.values(question.stages)) {
      if (stage.completedAt) {
        const date = activityDate(stage.completedAt);
        practiceCounts.set(date, (practiceCounts.get(date) ?? 0) + 1);
      }
    }
  }
  const topTopic = Object.entries(topicCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';
  const activityDates = questions.flatMap((question) => [
    question.solvedDate,
    ...Object.values(question.stages)
      .filter((stage) => stage.completedAt)
      .map((stage) => activityDate(stage.completedAt!)),
  ]);
  const activeStreak = getCurrentStreak(activityDates);

  return (
    <section className={`analytics-layout ${compact ? 'analytics-compact' : ''}`}>
      <div className="section-heading analytics-heading">
        <div>
          <div className="eyebrow"><Sparkles size={13} /> YOUR PRACTICE, IN FOCUS</div>
          <h2>Monthly report</h2>
        </div>
        <label className="month-picker">
          <CalendarDays size={15} />
          <select value={month} onChange={(event) => onMonthChange(event.target.value)} aria-label="Choose report month">
            {months.map((key) => (
              <option key={key} value={key}>{format(new Date(`${key}-01T12:00:00`), 'MMMM yyyy')}</option>
            ))}
          </select>
          <ChevronDown size={14} />
        </label>
      </div>

      <div className="report-kpis">
        <div><span>QUESTIONS SOLVED</span><strong>{monthQuestions.length}</strong><small>in {format(firstDay, 'MMMM')}</small></div>
        <div><span>REVISION ON TIME</span><strong>{completionRate}<i>%</i></strong><small>{completedOnTime} of {scheduled.length} milestones</small></div>
        <div><span>ACTIVE STREAK</span><strong>{activeStreak}<i>{activeStreak === 1 ? ' day' : ' days'}</i></strong><small>and counting</small></div>
        <div><span>MOST PRACTICED</span><strong className="topic-kpi">{topTopic}</strong><small>your focus topic</small></div>
      </div>

      <div className="chart-grid">
        <div className="chart-card activity-chart">
          <div className="chart-title"><div><span className="eyebrow">CONSISTENCY</span><h3>Daily practice</h3></div><span className="chart-legend"><i /> solved</span></div>
          <div className="bar-chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={activity} margin={{ top: 8, right: 2, left: -24, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#202830" strokeDasharray="3 5" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} interval={Math.max(Math.floor(days.length / 8), 1)} tick={{ fill: '#727d88', fontSize: 10 }} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: '#727d88', fontSize: 10 }} />
                <Tooltip
                  cursor={{ fill: 'rgba(164, 235, 196, .06)' }}
                  contentStyle={{ background: '#151c22', border: '1px solid #28333a', borderRadius: 10, color: '#e8eee9', fontSize: 12 }}
                  labelFormatter={(label) => `${format(firstDay, 'MMMM')} ${label}`}
                  formatter={(value) => [`${value} ${Number(value) === 1 ? 'problem' : 'problems'}`, 'Solved']}
                />
                <Bar dataKey="solved" fill="#9fe7be" radius={[4, 4, 0, 0]} maxBarSize={16} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="chart-card difficulty-chart">
          <div className="chart-title"><div><span className="eyebrow">YOUR MIX</span><h3>Difficulty split</h3></div></div>
          <div className="donut-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={difficultyData} dataKey="value" nameKey="name" innerRadius="69%" outerRadius="88%" paddingAngle={5} stroke="none">
                  {difficultyData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#151c22', border: '1px solid #28333a', borderRadius: 10, color: '#e8eee9', fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="donut-center"><strong>{monthQuestions.length}</strong><span>SOLVED</span></div>
          </div>
          <div className="difficulty-legend">
            {difficultyData.map((item) => (
              <div key={item.name}><span><i style={{ background: item.color }} />{item.name}</span><strong>{item.value}</strong></div>
            ))}
          </div>
        </div>
      </div>

      <div className="heatmap-card">
        <div className="chart-title"><div><span className="eyebrow">SHOWING UP ADDS UP</span><h3>Practice rhythm</h3></div><span className="heatmap-month">{format(firstDay, 'MMMM yyyy')}</span></div>
        <div className="heatmap">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => <span key={`${day}-${index}`} className="heatmap-day">{day}</span>)}
          {Array.from({ length: getDay(firstDay) }, (_, index) => <span key={`blank-${index}`} className="heatmap-cell heatmap-empty" />)}
          {days.map((day) => {
            const date = format(day, 'yyyy-MM-dd');
            const count = practiceCounts.get(date) ?? 0;
            const intensity = count === 0 ? 0 : Math.min(count, 4);
            return (
              <span
                key={date}
                className={`heatmap-cell heatmap-level-${intensity}`}
                title={`${format(day, 'MMM d')}: ${count} practice ${count === 1 ? 'activity' : 'activities'}`}
              />
            );
          })}
        </div>
        <div className="heatmap-key"><span>LESS</span>{[0, 1, 2, 3, 4].map((level) => <i key={level} className={`heatmap-cell heatmap-level-${level}`} />)}<span>MORE</span></div>
      </div>
    </section>
  );
}
