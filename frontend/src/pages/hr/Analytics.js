import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement,
  Filler,
} from 'chart.js';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import { analyticsAPI, aiAPI } from '../../services/api';
import {
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  UserGroupIcon,
  BriefcaseIcon,
  ClockIcon,
  SparklesIcon,
  FunnelIcon,
  ChartBarIcon,
  CheckCircleIcon,
  XCircleIcon,
  GiftIcon,
  CalendarIcon,
  BuildingOfficeIcon,
  ArrowPathIcon,
  DocumentTextIcon,
  AcademicCapIcon,
  ChevronRightIcon,
  EyeIcon,
  UsersIcon,
  LightBulbIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement,
  Filler
);

const Analytics = () => {
  const [days, setDays] = useState('90');
  const [activeTab, setActiveTab] = useState('overview');
  const [refreshing, setRefreshing] = useState(false);

  const { data: analyticsRes, isLoading, refetch } = useQuery({
    queryKey: ['comprehensive-analytics', days],
    queryFn: () => analyticsAPI.getComprehensive({ days }),
    refetchInterval: 120000,
  });

  // Prediction Insights Query
  const { data: predictionsRes } = useQuery({
    queryKey: ['prediction-insights', days],
    queryFn: () => aiAPI.getPredictionInsights({ days }),
    staleTime: 5 * 60 * 1000,
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setTimeout(() => setRefreshing(false), 600);
  };

  const d = analyticsRes?.data || {};
  const ov = d.overview || {};
  const pipeline = d.pipeline || {};
  const interviewStats = d.interviewStats || {};
  const offerData = d.offerAnalytics || {};
  const internalApps = d.internalApps || {};
  const departments = d.departments || [];
  const topJobs = d.topJobs || [];
  const statusBreakdown = d.statusBreakdown || [];
  const weeklyTrend = d.weeklyTrend || [];
  const scoreDistribution = d.scoreDistribution || [];
  const monthlyHires = d.monthlyHires || [];
  const dailyPattern = d.dailyPattern || [];

  // Prediction insights data
  const predictionInsights = predictionsRes?.data || {};
  const successDistribution = predictionInsights.successDistribution || [];
  const retentionDistribution = predictionInsights.retentionDistribution || [];
  const predictionAccuracy = predictionInsights.accuracy || {};

  // Computed metrics
  const totalApps = parseInt(ov.total_applications || 0);
  const prevApps = parseInt(ov.prev_applications || 0);
  const appChange = prevApps > 0 ? Math.round(((totalApps - prevApps) / prevApps) * 100) : 0;
  const totalHires = parseInt(ov.total_hires || 0);
  const prevHires = parseInt(ov.prev_hires || 0);
  const hireChange = prevHires > 0 ? Math.round(((totalHires - prevHires) / prevHires) * 100) : 0;
  const hiringRate = totalApps > 0 ? ((totalHires / totalApps) * 100).toFixed(1) : 0;
  const totalInterviews = parseInt(ov.total_interviews || 0);
  const prevInterviews = parseInt(ov.prev_interviews || 0);
  const interviewChange = prevInterviews > 0 ? Math.round(((totalInterviews - prevInterviews) / prevInterviews) * 100) : 0;

  // Pipeline conversion
  const pTotal = parseInt(pipeline.total || 0);
  const pHired = parseInt(pipeline.hired || 0);
  const pOffered = parseInt(pipeline.offered || 0);
  const pInterviewed = parseInt(pipeline.interviewed || 0);
  const pShortlisted = parseInt(pipeline.shortlisted || 0);

  // Day name helper
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Trend indicator component
  const TrendBadge = ({ value, suffix = '%', inverted = false }) => {
    if (value === 0 || isNaN(value)) return <span className="text-xs text-gray-400">—</span>;
    const isUp = inverted ? value < 0 : value > 0;
    return (
      <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${isUp ? 'text-green-600' : 'text-red-600'}`}>
        {isUp ? <ArrowTrendingUpIcon className="h-3.5 w-3.5" /> : <ArrowTrendingDownIcon className="h-3.5 w-3.5" />}
        {Math.abs(value)}{suffix}
      </span>
    );
  };

  // Metric card
  const MetricCard = ({ label, value, icon: Icon, color, trend, trendLabel, sub }) => (
    <div className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-sm transition-shadow">
      <div className="flex items-center justify-between mb-2">
        <div className={`p-2 rounded-lg ${color === 'indigo' ? 'bg-indigo-100' : color === 'green' ? 'bg-green-100' : color === 'purple' ? 'bg-purple-100' : 'bg-yellow-100'}`}>
          <Icon className={`h-5 w-5 ${color === 'indigo' ? 'text-indigo-600' : color === 'green' ? 'text-green-600' : color === 'purple' ? 'text-purple-600' : 'text-yellow-600'}`} />
        </div>
        {trend !== undefined && <TrendBadge value={trend} />}
      </div>
      <p className="text-2xl font-bold text-gray-900">{value ?? '—'}</p>
      <p className="text-xs text-gray-500 font-medium">{label}</p>
      {trendLabel && <p className="text-[10px] text-gray-400 mt-0.5">{trendLabel}</p>}
      {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );

  // ===== CHART CONFIGS =====

  // Status doughnut
  const statusColors = {
    submitted: '#94a3b8', under_review: '#60a5fa', shortlisted: '#818cf8',
    interview_scheduled: '#a78bfa', interviewed: '#8b5cf6', offer_extended: '#fbbf24',
    offer_accepted: '#34d399', offer_declined: '#fb923c', hired: '#22c55e',
    rejected: '#f87171', withdrawn: '#d1d5db',
  };
  const statusChartData = {
    labels: statusBreakdown.map(s => (s.status || '').replace(/_/g, ' ')),
    datasets: [{
      data: statusBreakdown.map(s => parseInt(s.count)),
      backgroundColor: statusBreakdown.map(s => statusColors[s.status] || '#d1d5db'),
      borderWidth: 2, borderColor: '#fff',
    }],
  };

  // Weekly trend area chart
  const weeklyChartData = {
    labels: weeklyTrend.map(w => new Date(w.week).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
    datasets: [
      {
        label: 'Applications',
        data: weeklyTrend.map(w => parseInt(w.applications)),
        borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.08)',
        fill: true, tension: 0.4, pointRadius: 4, pointBackgroundColor: '#6366f1',
        pointBorderColor: '#fff', pointBorderWidth: 2,
      },
      {
        label: 'Hires',
        data: weeklyTrend.map(w => parseInt(w.hires)),
        borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.08)',
        fill: true, tension: 0.4, pointRadius: 3, pointBackgroundColor: '#22c55e',
        pointBorderColor: '#fff', pointBorderWidth: 2,
      },
    ],
  };

  // AI Score distribution bar
  const scoreRangeOrder = ['90-100', '80-89', '70-79', '60-69', '50-59', 'Below 50'];
  const orderedScores = scoreRangeOrder.map(r => {
    const found = scoreDistribution.find(s => s.score_range === r);
    return { range: r, count: found ? parseInt(found.count) : 0 };
  });
  const scoreChartData = {
    labels: orderedScores.map(s => s.range),
    datasets: [{
      label: 'Candidates',
      data: orderedScores.map(s => s.count),
      backgroundColor: ['#22c55e', '#4ade80', '#86efac', '#fbbf24', '#fb923c', '#f87171'],
      borderRadius: 6,
    }],
  };

  // Department bar chart
  const deptChartData = {
    labels: departments.map(d => d.department || 'Unassigned'),
    datasets: [
      { label: 'Applications', data: departments.map(d => parseInt(d.total_apps || 0)), backgroundColor: 'rgba(99,102,241,0.7)', borderRadius: 4 },
      { label: 'Hires', data: departments.map(d => parseInt(d.hires || 0)), backgroundColor: 'rgba(34,197,94,0.7)', borderRadius: 4 },
      { label: 'Offers', data: departments.map(d => parseInt(d.offers || 0)), backgroundColor: 'rgba(251,191,36,0.7)', borderRadius: 4 },
    ],
  };

  // Monthly hires line chart
  const monthlyChartData = {
    labels: monthlyHires.map(m => new Date(m.month).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })),
    datasets: [
      {
        label: 'Applications',
        data: monthlyHires.map(m => parseInt(m.applications)),
        borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.06)',
        fill: true, tension: 0.4,
      },
      {
        label: 'Hires',
        data: monthlyHires.map(m => parseInt(m.hires)),
        borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.06)',
        fill: true, tension: 0.4,
      },
    ],
  };

  // Daily pattern bar
  const dailyChartData = {
    labels: dailyPattern.map(d => dayNames[d.day_of_week] || d.day_of_week),
    datasets: [{
      label: 'Applications',
      data: dailyPattern.map(d => parseInt(d.count)),
      backgroundColor: dailyPattern.map(d => parseInt(d.day_of_week) === 0 || parseInt(d.day_of_week) === 6 ? 'rgba(251,113,133,0.6)' : 'rgba(99,102,241,0.6)'),
      borderRadius: 6,
    }],
  };

  // Offer doughnut
  const offerChartData = {
    labels: ['Pending', 'Accepted', 'Declined', 'Hired'],
    datasets: [{
      data: [
        parseInt(offerData.pending || 0),
        parseInt(offerData.accepted || 0),
        parseInt(offerData.declined || 0),
        parseInt(offerData.hired || 0),
      ],
      backgroundColor: ['#fbbf24', '#22c55e', '#fb923c', '#10b981'],
      borderWidth: 2, borderColor: '#fff',
    }],
  };

  // ===== TAB DEFINITIONS =====
  const tabs = [
    { id: 'overview', label: 'Overview', icon: ChartBarIcon },
    { id: 'pipeline', label: 'Pipeline', icon: FunnelIcon },
    { id: 'interviews', label: 'Interviews', icon: CalendarIcon },
    { id: 'jobs', label: 'Jobs', icon: BriefcaseIcon },
    { id: 'departments', label: 'Departments', icon: BuildingOfficeIcon },
    { id: 'predictions', label: 'Predictions', icon: LightBulbIcon },
    { id: 'insights', label: 'Insights', icon: SparklesIcon },
  ];

  // Common chart tooltip config
  const tooltipConfig = {
    backgroundColor: '#1e1b4b', padding: 10, cornerRadius: 8,
    titleFont: { size: 12 }, bodyFont: { size: 12 },
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-200 border-t-indigo-600"></div>
        <p className="text-sm text-gray-500">Loading analytics...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ChartBarIcon className="h-7 w-7 text-indigo-600" />
            Recruitment Analytics
          </h1>
          {d.generatedAt && (
            <p className="text-sm text-gray-500 mt-1">
              <span className="text-xs text-gray-400">
                Updated: {new Date(d.generatedAt).toLocaleTimeString()}
              </span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <select
            value={days}
            onChange={(e) => setDays(e.target.value)}
            className="input-field w-auto text-sm"
          >
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="180">Last 6 months</option>
            <option value="365">Last year</option>
          </select>
          <button onClick={handleRefresh} className="btn-secondary text-sm flex items-center gap-1.5">
            <ArrowPathIcon className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <Link to="/hr/reports" className="btn-primary text-sm flex items-center gap-1.5">
            <DocumentTextIcon className="h-4 w-4" /> Reports
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-200 p-1 flex gap-1 overflow-x-auto">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                active
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ==================== OVERVIEW TAB ==================== */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard label="Total Applications" value={totalApps} icon={DocumentTextIcon} color="indigo" trend={appChange} trendLabel={`vs prev ${days}d`} />
            <MetricCard label="Total Hires" value={totalHires} icon={CheckCircleIcon} color="green" trend={hireChange} sub={`${hiringRate}% hiring rate`} />
            <MetricCard label="Interviews Conducted" value={totalInterviews} icon={CalendarIcon} color="purple" trend={interviewChange} />
            <MetricCard label="Pending Offers" value={ov.offers_pending || 0} icon={GiftIcon} color="yellow" sub={`${ov.offers_accepted || 0} accepted · ${ov.offers_declined || 0} declined`} />
          </div>

          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            <div className="bg-gradient-to-br from-blue-50 to-white rounded-lg border border-blue-100 p-3 text-center">
              <p className="text-lg font-bold text-blue-700">{ov.active_jobs || 0}</p>
              <p className="text-[10px] text-blue-500 font-medium">Active Jobs</p>
            </div>
            <div className="bg-gradient-to-br from-indigo-50 to-white rounded-lg border border-indigo-100 p-3 text-center">
              <p className="text-lg font-bold text-indigo-700">{ov.shortlisted || 0}</p>
              <p className="text-[10px] text-indigo-500 font-medium">Shortlisted</p>
            </div>
            <div className="bg-gradient-to-br from-red-50 to-white rounded-lg border border-red-100 p-3 text-center">
              <p className="text-lg font-bold text-red-700">{ov.total_rejections || 0}</p>
              <p className="text-[10px] text-red-500 font-medium">Rejections</p>
            </div>
            <div className="bg-gradient-to-br from-teal-50 to-white rounded-lg border border-teal-100 p-3 text-center">
              <p className="text-lg font-bold text-teal-700">{ov.unique_candidates || 0}</p>
              <p className="text-[10px] text-teal-500 font-medium">Candidates</p>
            </div>
            <div className="bg-gradient-to-br from-amber-50 to-white rounded-lg border border-amber-100 p-3 text-center">
              <p className="text-lg font-bold text-amber-700">{ov.avg_ai_score || '—'}</p>
              <p className="text-[10px] text-amber-500 font-medium">Avg AI Score</p>
              {ov.prev_avg_ai_score && (
                <TrendBadge value={parseFloat(ov.avg_ai_score || 0) - parseFloat(ov.prev_avg_ai_score || 0)} suffix=" pts" />
              )}
            </div>
            <div className="bg-gradient-to-br from-purple-50 to-white rounded-lg border border-purple-100 p-3 text-center">
              <p className="text-lg font-bold text-purple-700">{ov.total_employees || 0}</p>
              <p className="text-[10px] text-purple-500 font-medium">Employees</p>
            </div>
          </div>

          {/* Trend + Status Chart */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4 flex items-center gap-2">
                <ArrowTrendingUpIcon className="h-4 w-4 text-indigo-500" /> Weekly Trend
              </h3>
              {weeklyTrend.length > 0 ? (
                <div style={{ height: '250px' }}>
                  <Line data={weeklyChartData} options={{
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11 } } }, tooltip: tooltipConfig },
                    scales: {
                      x: { grid: { display: false }, ticks: { font: { size: 10 } } },
                      y: { beginAtZero: true, grid: { color: '#f3f4f6' }, ticks: { stepSize: 1, font: { size: 10 } } },
                    },
                  }} />
                </div>
              ) : <div className="flex items-center justify-center h-48 text-gray-400 text-sm">No trend data</div>}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4 flex items-center gap-2">
                <UsersIcon className="h-4 w-4 text-indigo-500" /> Status Distribution
              </h3>
              {statusBreakdown.length > 0 ? (
                <div className="flex flex-col items-center">
                  <div style={{ width: '180px', height: '180px' }}>
                    <Doughnut data={statusChartData} options={{
                      responsive: true, maintainAspectRatio: false, cutout: '65%',
                      plugins: { legend: { display: false }, tooltip: { ...tooltipConfig, callbacks: { label: (ctx) => ` ${ctx.label}: ${ctx.raw}` } } },
                    }} />
                  </div>
                  <div className="mt-3 flex flex-wrap justify-center gap-x-3 gap-y-1">
                    {statusBreakdown.slice(0, 6).map(s => (
                      <div key={s.status} className="flex items-center gap-1">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: statusColors[s.status] || '#d1d5db' }} />
                        <span className="text-[10px] text-gray-600">{(s.status || '').replace(/_/g, ' ')} ({s.count})</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : <div className="flex items-center justify-center h-48 text-gray-400 text-sm">No data</div>}
            </div>
          </div>

          {/* Monthly Hires + Score Distribution */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4 flex items-center gap-2">
                <CheckCircleIcon className="h-4 w-4 text-green-500" /> Monthly Applications & Hires (6mo)
              </h3>
              {monthlyHires.length > 0 ? (
                <div style={{ height: '220px' }}>
                  <Line data={monthlyChartData} options={{
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11 } } }, tooltip: tooltipConfig },
                    scales: { x: { grid: { display: false } }, y: { beginAtZero: true, grid: { color: '#f3f4f6' } } },
                  }} />
                </div>
              ) : <div className="flex items-center justify-center h-48 text-gray-400 text-sm">No data</div>}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4 flex items-center gap-2">
                <AcademicCapIcon className="h-4 w-4 text-amber-500" /> AI Score Distribution
              </h3>
              {scoreDistribution.length > 0 ? (
                <div style={{ height: '220px' }}>
                  <Bar data={scoreChartData} options={{
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { display: false }, tooltip: tooltipConfig },
                    scales: { x: { grid: { display: false } }, y: { beginAtZero: true, grid: { color: '#f3f4f6' }, ticks: { stepSize: 1 } } },
                  }} />
                </div>
              ) : <div className="flex items-center justify-center h-48 text-gray-400 text-sm">No scored applications</div>}
            </div>
          </div>
        </div>
      )}

      {/* ==================== PIPELINE TAB ==================== */}
      {activeTab === 'pipeline' && (
        <div className="space-y-6">
          {/* Funnel Visualization */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4 flex items-center gap-2">
              <FunnelIcon className="h-4 w-4 text-indigo-500" /> Hiring Funnel
            </h3>
            {pTotal > 0 ? (
              <div className="space-y-3">
                {[
                  { label: 'Submitted', count: parseInt(pipeline.submitted || 0), color: '#94a3b8' },
                  { label: 'Under Review', count: parseInt(pipeline.under_review || 0), color: '#60a5fa' },
                  { label: 'Shortlisted', count: pShortlisted, color: '#818cf8' },
                  { label: 'Interviewed', count: pInterviewed, color: '#8b5cf6' },
                  { label: 'Offered', count: pOffered, color: '#fbbf24' },
                  { label: 'Hired', count: pHired, color: '#22c55e' },
                ].map((stage, idx) => {
                  const pct = (stage.count / pTotal) * 100;
                  return (
                    <div key={idx} className="flex items-center gap-3">
                      <span className="text-xs text-gray-600 w-28 shrink-0 text-right font-medium">{stage.label}</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-8 overflow-hidden relative">
                        <div
                          className="h-full rounded-full transition-all duration-700 flex items-center justify-end pr-3"
                          style={{ width: `${Math.max(pct, 3)}%`, backgroundColor: stage.color }}
                        >
                          {pct > 12 && <span className="text-xs font-bold text-white drop-shadow-sm">{stage.count}</span>}
                        </div>
                        {pct <= 12 && stage.count > 0 && (
                          <span className="absolute text-xs font-medium text-gray-600" style={{ left: `${Math.max(pct, 3) + 2}%`, top: '50%', transform: 'translateY(-50%)' }}>{stage.count}</span>
                        )}
                      </div>
                      <span className="text-xs text-gray-400 w-12 text-right">{pct.toFixed(0)}%</span>
                    </div>
                  );
                })}
                <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
                  <span className="text-xs text-gray-600 w-28 shrink-0 text-right font-medium">Rejected</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-8 overflow-hidden relative">
                    {(() => {
                      const rejCount = parseInt(pipeline.rejected || 0);
                      const rejPct = (rejCount / pTotal) * 100;
                      return (
                        <>
                          <div className="bg-red-400 h-full rounded-full transition-all duration-700 flex items-center justify-end pr-3" style={{ width: `${Math.max(rejPct, 3)}%` }}>
                            {rejPct > 12 && <span className="text-xs font-bold text-white">{rejCount}</span>}
                          </div>
                          {rejPct <= 12 && rejCount > 0 && <span className="absolute text-xs font-medium text-gray-600" style={{ left: `${Math.max(rejPct, 3) + 2}%`, top: '50%', transform: 'translateY(-50%)' }}>{rejCount}</span>}
                        </>
                      );
                    })()}
                  </div>
                  <span className="text-xs text-gray-400 w-12 text-right">{pTotal > 0 ? ((parseInt(pipeline.rejected || 0) / pTotal) * 100).toFixed(0) : 0}%</span>
                </div>
              </div>
            ) : <p className="text-gray-400 text-sm text-center py-8">No pipeline data</p>}
          </div>

          {/* Conversion Rates */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">Stage Conversion Rates</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {[
                { label: 'App → Review', value: pTotal > 0 ? Math.round(((pTotal - parseInt(pipeline.submitted || 0)) / pTotal) * 100) : 0, bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', sub: 'text-blue-600' },
                { label: 'Review → Shortlist', value: pTotal > 0 ? Math.round(pShortlisted / pTotal * 100) : 0, bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-700', sub: 'text-indigo-600' },
                { label: 'Shortlist → Interview', value: pShortlisted > 0 ? Math.round(pInterviewed / pShortlisted * 100) : 0, bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', sub: 'text-purple-600' },
                { label: 'Interview → Offer', value: pInterviewed > 0 ? Math.round((pOffered + pHired) / pInterviewed * 100) : 0, bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700', sub: 'text-yellow-600' },
                { label: 'Offer → Hire', value: (pOffered + pHired) > 0 ? Math.round(pHired / (pOffered + pHired) * 100) : 0, bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', sub: 'text-green-600' },
              ].map((conv, idx) => (
                <div key={idx} className={`${conv.bg} border ${conv.border} rounded-xl p-4 text-center`}>
                  <p className={`text-2xl font-bold ${conv.text}`}>{conv.value}%</p>
                  <p className={`text-xs ${conv.sub} font-medium`}>{conv.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Offer Analytics */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4 flex items-center gap-2">
                <GiftIcon className="h-4 w-4 text-yellow-500" /> Offer Outcomes
              </h3>
              {parseInt(offerData.total_offers || 0) > 0 ? (
                <div className="flex items-center gap-6">
                  <div style={{ width: '150px', height: '150px' }}>
                    <Doughnut data={offerChartData} options={{
                      responsive: true, maintainAspectRatio: false, cutout: '60%',
                      plugins: { legend: { display: false }, tooltip: tooltipConfig },
                    }} />
                  </div>
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-sm text-gray-600"><span className="w-3 h-3 rounded-full bg-yellow-400" /> Pending</span>
                      <span className="text-sm font-bold text-gray-900">{offerData.pending || 0}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-sm text-gray-600"><span className="w-3 h-3 rounded-full bg-green-500" /> Accepted</span>
                      <span className="text-sm font-bold text-gray-900">{offerData.accepted || 0}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-sm text-gray-600"><span className="w-3 h-3 rounded-full bg-orange-400" /> Declined</span>
                      <span className="text-sm font-bold text-gray-900">{offerData.declined || 0}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-sm text-gray-600"><span className="w-3 h-3 rounded-full bg-emerald-500" /> Hired</span>
                      <span className="text-sm font-bold text-gray-900">{offerData.hired || 0}</span>
                    </div>
                    <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
                      <span className="text-xs text-gray-500 font-medium">Acceptance Rate</span>
                      <span className="text-sm font-bold text-indigo-600">{offerData.acceptance_rate || 0}%</span>
                    </div>
                  </div>
                </div>
              ) : <p className="text-gray-400 text-sm text-center py-8">No offer data</p>}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4 flex items-center gap-2">
                <UserGroupIcon className="h-4 w-4 text-teal-500" /> Internal Mobility
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-blue-50 rounded-lg p-3 text-center">
                  <p className="text-xl font-bold text-blue-700">{internalApps.total_internal_apps || 0}</p>
                  <p className="text-[10px] text-blue-500 font-medium">Internal Applications</p>
                </div>
                <div className="bg-purple-50 rounded-lg p-3 text-center">
                  <p className="text-xl font-bold text-purple-700">{internalApps.internal_interviewing || 0}</p>
                  <p className="text-[10px] text-purple-500 font-medium">Interviewing</p>
                </div>
                <div className="bg-green-50 rounded-lg p-3 text-center">
                  <p className="text-xl font-bold text-green-700">{internalApps.internal_hires || 0}</p>
                  <p className="text-[10px] text-green-500 font-medium">Internal Hires</p>
                </div>
                <div className="bg-yellow-50 rounded-lg p-3 text-center">
                  <p className="text-xl font-bold text-yellow-700">{internalApps.internal_offers || 0}</p>
                  <p className="text-[10px] text-yellow-500 font-medium">Pending Offers</p>
                </div>
              </div>
              <div className="mt-3 bg-gray-50 rounded-lg p-3 flex items-center justify-between">
                <span className="text-xs text-gray-600">{ov.mobility_interested || 0} employees interested in mobility</span>
                <span className="text-xs text-gray-400">{ov.total_employees || 0} total employees</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== INTERVIEWS TAB ==================== */}
      {activeTab === 'interviews' && (
        <div className="space-y-6">
          {/* Interview KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <p className="text-2xl font-bold text-blue-700">{interviewStats.total_interviews || 0}</p>
              <p className="text-xs text-gray-500 font-medium">Total Interviews</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <p className="text-2xl font-bold text-green-700">{interviewStats.completed || 0}</p>
              <p className="text-xs text-gray-500 font-medium">Completed</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <p className="text-2xl font-bold text-indigo-700">{interviewStats.upcoming || 0}</p>
              <p className="text-xs text-gray-500 font-medium">Upcoming</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <p className="text-2xl font-bold text-red-700">{interviewStats.cancelled || 0}</p>
              <p className="text-xs text-gray-500 font-medium">Cancelled</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <p className="text-2xl font-bold text-orange-700">{interviewStats.no_shows || 0}</p>
              <p className="text-xs text-gray-500 font-medium">No Shows</p>
            </div>
          </div>

          {/* Interview Types */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">Interview Types</h3>
              <div className="space-y-3">
                {[
                  { label: 'Video', count: interviewStats.video || 0, color: 'bg-blue-500', icon: '🎥' },
                  { label: 'In-Person', count: interviewStats.in_person || 0, color: 'bg-green-500', icon: '🤝' },
                  { label: 'Technical', count: interviewStats.technical || 0, color: 'bg-purple-500', icon: '💻' },
                  { label: 'Panel', count: interviewStats.panel || 0, color: 'bg-amber-500', icon: '👥' },
                ].map((type, idx) => {
                  const total = parseInt(interviewStats.total_interviews || 1);
                  const pct = total > 0 ? (parseInt(type.count) / total) * 100 : 0;
                  return (
                    <div key={idx} className="flex items-center gap-3">
                      <span className="text-lg w-8 text-center">{type.icon}</span>
                      <span className="text-sm text-gray-700 w-24 font-medium">{type.label}</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
                        <div className={`${type.color} h-full rounded-full transition-all`} style={{ width: `${Math.max(pct, 2)}%` }} />
                      </div>
                      <span className="text-sm font-bold text-gray-700 w-8 text-right">{type.count}</span>
                      <span className="text-xs text-gray-400 w-10 text-right">{pct.toFixed(0)}%</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">Feedback Scores</h3>
              <div className="space-y-4">
                {[
                  { label: 'Overall Rating', value: interviewStats.avg_rating, color: 'indigo' },
                  { label: 'Technical Skills', value: interviewStats.avg_technical, color: 'blue' },
                  { label: 'Communication', value: interviewStats.avg_communication, color: 'teal' },
                  { label: 'Cultural Fit', value: interviewStats.avg_cultural_fit, color: 'green' },
                ].map((score, idx) => {
                  const val = parseFloat(score.value || 0);
                  const pct = (val / 5) * 100;
                  return (
                    <div key={idx}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-gray-600">{score.label}</span>
                        <span className={`text-sm font-bold ${score.color === 'indigo' ? 'text-indigo-700' : score.color === 'blue' ? 'text-blue-700' : score.color === 'teal' ? 'text-teal-700' : 'text-green-700'}`}>{val > 0 ? val.toFixed(1) : '—'}/5</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2.5">
                        <div
                          className={`h-2.5 rounded-full transition-all ${score.color === 'indigo' ? 'bg-indigo-500' : score.color === 'blue' ? 'bg-blue-500' : score.color === 'teal' ? 'bg-teal-500' : 'bg-green-500'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              {!interviewStats.avg_rating && (
                <p className="text-gray-400 text-sm text-center mt-4">No feedback data yet</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==================== JOBS TAB ==================== */}
      {activeTab === 'jobs' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider flex items-center gap-2">
                <BriefcaseIcon className="h-4 w-4 text-indigo-500" /> Job Performance
              </h3>
              <Link to="/hr/jobs" className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1">
                Manage Jobs <ChevronRightIcon className="h-3 w-3" />
              </Link>
            </div>
            {topJobs.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Job Title</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Department</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Status</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Apps</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Avg Score</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Offers</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Hires</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Conversion</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Positions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {topJobs.map((job) => {
                      const jobStatusColors = {
                        published: 'bg-green-100 text-green-700',
                        closed: 'bg-gray-100 text-gray-700',
                        filled: 'bg-blue-100 text-blue-700',
                        draft: 'bg-yellow-100 text-yellow-700',
                      };
                      return (
                        <tr key={job.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3">
                            <Link to={`/hr/jobs/${job.id}`} className="font-medium text-gray-900 hover:text-indigo-600">{job.title}</Link>
                          </td>
                          <td className="px-4 py-3 text-gray-600">{job.department || '—'}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${jobStatusColors[job.job_status] || 'bg-gray-100 text-gray-700'}`}>
                              {job.job_status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center font-semibold text-indigo-600">{job.application_count || 0}</td>
                          <td className="px-4 py-3 text-center">
                            {job.avg_score ? (
                              <span className={`font-semibold ${
                                parseFloat(job.avg_score) >= 70 ? 'text-green-600' :
                                parseFloat(job.avg_score) >= 50 ? 'text-yellow-600' : 'text-red-600'
                              }`}>{job.avg_score}</span>
                            ) : <span className="text-gray-400">—</span>}
                          </td>
                          <td className="px-4 py-3 text-center font-semibold text-yellow-600">{job.pending_offers || 0}</td>
                          <td className="px-4 py-3 text-center font-semibold text-green-600">{job.hires || 0}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`text-sm font-semibold ${
                              parseFloat(job.conversion_rate) >= 10 ? 'text-green-600' :
                              parseFloat(job.conversion_rate) > 0 ? 'text-yellow-600' : 'text-gray-400'
                            }`}>{job.conversion_rate || 0}%</span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {job.positions_available > 0 ? (
                              <div className="flex items-center gap-2 justify-center">
                                <span className="text-xs text-gray-500">{job.positions_filled || 0}/{job.positions_available}</span>
                                <div className="w-16 bg-gray-200 rounded-full h-1.5">
                                  <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${Math.min(((job.positions_filled || 0) / job.positions_available) * 100, 100)}%` }} />
                                </div>
                              </div>
                            ) : <span className="text-gray-400 text-xs">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-12 text-center text-gray-400">
                <BriefcaseIcon className="h-10 w-10 mx-auto mb-2" />
                <p>No job data available</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== DEPARTMENTS TAB ==================== */}
      {activeTab === 'departments' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4 flex items-center gap-2">
              <BuildingOfficeIcon className="h-4 w-4 text-indigo-500" /> Department Performance
            </h3>
            {departments.length > 0 ? (
              <div style={{ height: '280px' }}>
                <Bar data={deptChartData} options={{
                  responsive: true, maintainAspectRatio: false,
                  plugins: { legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11 } } }, tooltip: tooltipConfig },
                  scales: { x: { grid: { display: false } }, y: { beginAtZero: true, grid: { color: '#f3f4f6' }, ticks: { stepSize: 1 } } },
                }} />
              </div>
            ) : <p className="text-gray-400 text-sm text-center py-8">No department data</p>}
          </div>

          {departments.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Department Details</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Department</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Jobs</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Applications</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Offers</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Hires</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Rejected</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Avg Score</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Hire Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {departments.map((dept, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">{dept.department}</td>
                        <td className="px-4 py-3 text-center text-gray-700">{dept.job_count}</td>
                        <td className="px-4 py-3 text-center font-semibold text-indigo-600">{dept.total_apps}</td>
                        <td className="px-4 py-3 text-center font-semibold text-yellow-600">{dept.offers}</td>
                        <td className="px-4 py-3 text-center font-semibold text-green-600">{dept.hires}</td>
                        <td className="px-4 py-3 text-center text-red-600">{dept.rejected}</td>
                        <td className="px-4 py-3 text-center">
                          {dept.avg_score ? (
                            <span className={`font-semibold ${parseFloat(dept.avg_score) >= 70 ? 'text-green-600' : parseFloat(dept.avg_score) >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                              {dept.avg_score}
                            </span>
                          ) : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-sm font-bold ${parseFloat(dept.hire_rate) >= 10 ? 'text-green-600' : parseFloat(dept.hire_rate) > 0 ? 'text-yellow-600' : 'text-gray-400'}`}>
                            {dept.hire_rate}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==================== PREDICTIONS TAB ==================== */}
      {activeTab === 'predictions' && (
        <div className="space-y-6">
          {/* Prediction Model Overview */}
          <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl border border-indigo-100 p-6">
            <div className="flex items-center gap-3 mb-4">
              <LightBulbIcon className="h-8 w-8 text-indigo-600" />
              <div>
                <h2 className="text-lg font-bold text-gray-900">Predictive Models</h2>
                <p className="text-sm text-gray-600">AI-powered success and retention predictions for candidates</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-lg p-4 border border-indigo-100">
                <p className="text-sm text-gray-600">Total Analyzed</p>
                <p className="text-2xl font-bold text-indigo-700">
                  {successDistribution.reduce((sum, d) => sum + parseInt(d.count || 0), 0)}
                </p>
              </div>
              <div className="bg-white rounded-lg p-4 border border-green-100">
                <p className="text-sm text-gray-600">Avg Success Prediction</p>
                <p className="text-2xl font-bold text-green-700">
                  {predictionAccuracy.avg_predicted_success 
                    ? `${Math.round(parseFloat(predictionAccuracy.avg_predicted_success) * 100)}%`
                    : '—'}
                </p>
              </div>
              <div className="bg-white rounded-lg p-4 border border-blue-100">
                <p className="text-sm text-gray-600">Avg Retention Prediction</p>
                <p className="text-2xl font-bold text-blue-700">
                  {predictionAccuracy.avg_predicted_retention 
                    ? `${Math.round(parseFloat(predictionAccuracy.avg_predicted_retention) * 100)}%`
                    : '—'}
                </p>
              </div>
              <div className="bg-white rounded-lg p-4 border border-purple-100">
                <p className="text-sm text-gray-600">Model Version</p>
                <p className="text-2xl font-bold text-purple-700">{predictionInsights.modelVersion || '2.0'}</p>
              </div>
            </div>
          </div>

          {/* Success & Retention Distribution */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Success Prediction Distribution */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4 flex items-center gap-2">
                <ShieldCheckIcon className="h-4 w-4 text-green-500" /> Success Prediction Distribution
              </h3>
              {successDistribution.length > 0 ? (
                <div className="space-y-3">
                  {successDistribution.map((tier, idx) => {
                    const total = successDistribution.reduce((s, d) => s + parseInt(d.count || 0), 0);
                    const pct = total > 0 ? (parseInt(tier.count) / total) * 100 : 0;
                    const color = tier.success_tier?.includes('High') ? 'bg-green-500' :
                                  tier.success_tier?.includes('Medium') ? 'bg-yellow-500' :
                                  tier.success_tier?.includes('Low') ? 'bg-orange-500' : 'bg-red-500';
                    return (
                      <div key={idx}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-600">{tier.success_tier}</span>
                          <span className="font-medium">{tier.count} ({pct.toFixed(1)}%)</span>
                        </div>
                        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full ${color} rounded-full transition-all duration-500`} 
                               style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-400">
                  <LightBulbIcon className="h-10 w-10 mx-auto mb-2 opacity-50" />
                  <p>No success predictions available yet</p>
                  <p className="text-xs mt-1">Screen applications to generate predictions</p>
                </div>
              )}
            </div>

            {/* Retention Risk Distribution */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4 flex items-center gap-2">
                <ClockIcon className="h-4 w-4 text-blue-500" /> Retention Risk Distribution
              </h3>
              {retentionDistribution.length > 0 ? (
                <div className="space-y-3">
                  {retentionDistribution.map((level, idx) => {
                    const total = retentionDistribution.reduce((s, d) => s + parseInt(d.count || 0), 0);
                    const pct = total > 0 ? (parseInt(level.count) / total) * 100 : 0;
                    const color = level.risk_level === 'Low Risk' ? 'bg-green-500' :
                                  level.risk_level === 'Medium Risk' ? 'bg-yellow-500' : 'bg-red-500';
                    return (
                      <div key={idx}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-600">{level.risk_level}</span>
                          <span className="font-medium">{level.count} ({pct.toFixed(1)}%)</span>
                        </div>
                        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full ${color} rounded-full transition-all duration-500`} 
                               style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-400">
                  <ClockIcon className="h-10 w-10 mx-auto mb-2 opacity-50" />
                  <p>No retention predictions available yet</p>
                  <p className="text-xs mt-1">Screen applications to generate predictions</p>
                </div>
              )}
            </div>
          </div>

          {/* Prediction Accuracy (if hire data available) */}
          {predictionAccuracy.total_hires > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4 flex items-center gap-2">
                <CheckCircleIcon className="h-4 w-4 text-emerald-500" /> Model Accuracy (Based on Hired Candidates)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-gray-50 rounded-lg p-4 text-center">
                  <p className="text-sm text-gray-600 mb-1">Total Hires Tracked</p>
                  <p className="text-2xl font-bold text-gray-900">{predictionAccuracy.total_hires}</p>
                </div>
                <div className="bg-green-50 rounded-lg p-4 text-center">
                  <p className="text-sm text-gray-600 mb-1">Avg Predicted Success</p>
                  <p className="text-2xl font-bold text-green-700">
                    {predictionAccuracy.avg_predicted_success 
                      ? `${Math.round(parseFloat(predictionAccuracy.avg_predicted_success) * 100)}%`
                      : '—'}
                  </p>
                </div>
                <div className="bg-blue-50 rounded-lg p-4 text-center">
                  <p className="text-sm text-gray-600 mb-1">Actual Retention Rate</p>
                  <p className="text-2xl font-bold text-blue-700">
                    {predictionAccuracy.actual_retention_rate 
                      ? `${Math.round(parseFloat(predictionAccuracy.actual_retention_rate) * 100)}%`
                      : '—'}
                  </p>
                </div>
                <div className="bg-purple-50 rounded-lg p-4 text-center">
                  <p className="text-sm text-gray-600 mb-1">Avg Performance</p>
                  <p className="text-2xl font-bold text-purple-700">
                    {predictionAccuracy.avg_performance 
                      ? parseFloat(predictionAccuracy.avg_performance).toFixed(1)
                      : '—'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* How Predictions Work */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">
              How Predictive Models Work
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <h4 className="font-medium text-green-700 flex items-center gap-2">
                  <ShieldCheckIcon className="h-5 w-5" /> Success Prediction
                </h4>
                <p className="text-sm text-gray-600">Predicts likelihood of candidate success based on:</p>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li className="flex items-start gap-2">
                    <span className="text-green-500">•</span> Skills Match (25%)
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-500">•</span> Experience Relevance (20%)
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-500">•</span> Education Fit (15%)
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-500">•</span> Career Progression (15%)
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-500">•</span> Job Stability (10%)
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-500">•</span> Cultural Fit (10%)
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-500">•</span> Motivation Indicators (5%)
                  </li>
                </ul>
              </div>
              <div className="space-y-3">
                <h4 className="font-medium text-blue-700 flex items-center gap-2">
                  <ClockIcon className="h-5 w-5" /> Retention Prediction
                </h4>
                <p className="text-sm text-gray-600">Predicts likelihood of long-term tenure based on:</p>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500">•</span> Tenure History (25%)
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500">•</span> Career Alignment (20%)
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500">•</span> Skills Growth Potential (15%)
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500">•</span> Role Expectation Match (15%)
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500">•</span> Internal Mobility Bonus (15%)
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500">•</span> Company Size Fit (10%)
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== INSIGHTS TAB ==================== */}
      {activeTab === 'insights' && (
        <div className="space-y-6">
          {/* Application Patterns */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4 flex items-center gap-2">
                <ClockIcon className="h-4 w-4 text-indigo-500" /> Application Day Pattern
              </h3>
              {dailyPattern.length > 0 ? (
                <div style={{ height: '220px' }}>
                  <Bar data={dailyChartData} options={{
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { display: false }, tooltip: tooltipConfig },
                    scales: { x: { grid: { display: false } }, y: { beginAtZero: true, grid: { color: '#f3f4f6' }, ticks: { stepSize: 1 } } },
                  }} />
                </div>
              ) : <p className="text-gray-400 text-sm text-center py-8">No pattern data</p>}
              <p className="text-[10px] text-gray-400 text-center mt-2">Red = weekends · Purple = weekdays</p>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4 flex items-center gap-2">
                <AcademicCapIcon className="h-4 w-4 text-amber-500" /> AI Score Distribution
              </h3>
              {scoreDistribution.length > 0 ? (
                <div style={{ height: '220px' }}>
                  <Bar data={scoreChartData} options={{
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { display: false }, tooltip: tooltipConfig },
                    scales: { x: { grid: { display: false } }, y: { beginAtZero: true, grid: { color: '#f3f4f6' }, ticks: { stepSize: 1 } } },
                  }} />
                </div>
              ) : <p className="text-gray-400 text-sm text-center py-8">No data</p>}
            </div>
          </div>

          {/* Key Insights Cards */}
          <div className="bg-gradient-to-r from-indigo-600 to-purple-700 rounded-xl p-6">
            <h3 className="text-sm font-semibold text-white/80 uppercase tracking-wider mb-4 flex items-center gap-2">
              <SparklesIcon className="h-4 w-4" /> Key Insights & Recommendations
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Hiring effectiveness */}
              <div className="bg-white/15 backdrop-blur rounded-lg p-4">
                <p className="text-white/80 text-xs font-medium mb-1">Hiring Effectiveness</p>
                <p className="text-white text-lg font-bold">{hiringRate}%</p>
                <p className="text-white/60 text-xs mt-1">
                  {parseFloat(hiringRate) >= 10 ? 'Good conversion rate! Your pipeline is working well.' :
                   parseFloat(hiringRate) >= 5 ? 'Average rate. Consider improving screening criteria.' :
                   'Low rate. Review your job requirements and sourcing channels.'}
                </p>
              </div>

              {/* Offer acceptance */}
              <div className="bg-white/15 backdrop-blur rounded-lg p-4">
                <p className="text-white/80 text-xs font-medium mb-1">Offer Acceptance Rate</p>
                <p className="text-white text-lg font-bold">{offerData.acceptance_rate || 0}%</p>
                <p className="text-white/60 text-xs mt-1">
                  {parseFloat(offerData.acceptance_rate || 0) >= 80 ? 'Excellent! Your offers are competitive.' :
                   parseFloat(offerData.acceptance_rate || 0) >= 60 ? 'Decent. Consider reviewing compensation packages.' :
                   parseInt(offerData.total_offers || 0) === 0 ? 'No offers made yet in this period.' :
                   'Low acceptance. Review offer competitiveness and candidate experience.'}
                </p>
              </div>

              {/* Application volume */}
              <div className="bg-white/15 backdrop-blur rounded-lg p-4">
                <p className="text-white/80 text-xs font-medium mb-1">Application Trend</p>
                <p className="text-white text-lg font-bold flex items-center gap-2">
                  {appChange > 0 ? '+' : ''}{appChange}%
                  {appChange > 0 ? <ArrowTrendingUpIcon className="h-4 w-4" /> : appChange < 0 ? <ArrowTrendingDownIcon className="h-4 w-4" /> : null}
                </p>
                <p className="text-white/60 text-xs mt-1">
                  {appChange > 20 ? 'Strong growth! Ensure your team can handle the volume.' :
                   appChange > 0 ? 'Positive trend. Keep up the sourcing efforts.' :
                   appChange === 0 ? 'Stable volume compared to previous period.' :
                   'Declining applications. Consider refreshing job postings or sourcing strategy.'}
                </p>
              </div>

              {/* Candidate quality */}
              <div className="bg-white/15 backdrop-blur rounded-lg p-4">
                <p className="text-white/80 text-xs font-medium mb-1">Candidate Quality (AI Avg)</p>
                <p className="text-white text-lg font-bold">{ov.avg_ai_score || '—'}</p>
                <p className="text-white/60 text-xs mt-1">
                  {parseFloat(ov.avg_ai_score || 0) >= 70 ? 'High quality candidates across the board.' :
                   parseFloat(ov.avg_ai_score || 0) >= 50 ? 'Average quality. Consider tightening job requirements.' :
                   !ov.avg_ai_score ? 'No AI scores available yet.' :
                   'Below average. Review job posting clarity and sourcing channels.'}
                </p>
              </div>

              {/* Internal mobility */}
              <div className="bg-white/15 backdrop-blur rounded-lg p-4">
                <p className="text-white/80 text-xs font-medium mb-1">Internal Mobility</p>
                <p className="text-white text-lg font-bold">{ov.mobility_interested || 0} interested</p>
                <p className="text-white/60 text-xs mt-1">
                  {parseInt(ov.mobility_interested || 0) > 0
                    ? `${internalApps.total_internal_apps || 0} internal applications made. Consider internal-first hiring.`
                    : 'No employees have flagged mobility interest.'}
                </p>
              </div>

              {/* Busiest day */}
              <div className="bg-white/15 backdrop-blur rounded-lg p-4">
                <p className="text-white/80 text-xs font-medium mb-1">Peak Application Day</p>
                {dailyPattern.length > 0 ? (() => {
                  const peak = dailyPattern.reduce((max, dp) => parseInt(dp.count) > parseInt(max.count) ? dp : max, dailyPattern[0]);
                  return (
                    <>
                      <p className="text-white text-lg font-bold">{dayNames[peak.day_of_week]}</p>
                      <p className="text-white/60 text-xs mt-1">{peak.count} applications on {dayNames[peak.day_of_week]}s. Schedule reviews accordingly.</p>
                    </>
                  );
                })() : <p className="text-white/60 text-xs">No pattern data</p>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Analytics;
