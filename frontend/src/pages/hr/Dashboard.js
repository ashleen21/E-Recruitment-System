import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  BriefcaseIcon,
  DocumentTextIcon,
  UsersIcon,
  CalendarIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  GiftIcon,
  ChartBarIcon,
  EyeIcon,
  ArrowPathIcon,
  SparklesIcon,
  UserGroupIcon,
  BuildingOfficeIcon,
} from '@heroicons/react/24/outline';
import { analyticsAPI } from '../../services/api';
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

const Dashboard = () => {
  const [refreshing, setRefreshing] = useState(false);

  const { data: analytics, isLoading, refetch } = useQuery({
    queryKey: ['dashboard-analytics'],
    queryFn: () => analyticsAPI.getDashboard(),
    refetchInterval: 60000, // Auto-refresh every 60 seconds
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setTimeout(() => setRefreshing(false), 600);
  };

  const data = analytics?.data || {};
  const overview = data.overview || {};
  const pipeline = data.pipeline || {};
  const statusData = data.applicationsByStatus || [];
  const trendData = data.applicationsOverTime || [];
  const topJobs = data.topJobs || [];
  const departmentStats = data.departmentStats || [];
  const recentApps = data.recentApplications || [];
  const upcomingInterviews = data.upcomingInterviews || [];

  // Compute derived metrics
  const totalApps = parseInt(overview.total_applications || 0);
  const totalHires = parseInt(overview.total_hires || 0);
  const hiringRate = totalApps > 0 ? Math.round((totalHires / totalApps) * 100) : 0;
  const appsThisWeek = parseInt(overview.apps_this_week || 0);
  const appsLastWeek = parseInt(overview.apps_last_week || 0);
  const weeklyTrend = appsLastWeek > 0 ? Math.round(((appsThisWeek - appsLastWeek) / appsLastWeek) * 100) : 0;

  // ===== STATUS COLORS MAP =====
  const statusColors = {
    submitted: { bg: 'bg-slate-100', text: 'text-slate-700' },
    under_review: { bg: 'bg-blue-100', text: 'text-blue-700' },
    shortlisted: { bg: 'bg-indigo-100', text: 'text-indigo-700' },
    interview_scheduled: { bg: 'bg-purple-100', text: 'text-purple-700' },
    interviewed: { bg: 'bg-violet-100', text: 'text-violet-700' },
    offer_extended: { bg: 'bg-yellow-100', text: 'text-yellow-700' },
    offer_accepted: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
    offer_declined: { bg: 'bg-orange-100', text: 'text-orange-700' },
    hired: { bg: 'bg-green-100', text: 'text-green-700' },
    rejected: { bg: 'bg-red-100', text: 'text-red-700' },
    withdrawn: { bg: 'bg-gray-100', text: 'text-gray-700' },
  };

  const getStatusBadge = (status) => {
    const c = statusColors[status] || { bg: 'bg-gray-100', text: 'text-gray-700' };
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
        {(status || '').replace(/_/g, ' ')}
      </span>
    );
  };

  // ===== CHART DATA =====
  // Applications Over Time (Line)
  const trendChartData = {
    labels: trendData.map(d => new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
    datasets: [{
      label: 'Applications',
      data: trendData.map(d => parseInt(d.count)),
      borderColor: '#6366f1',
      backgroundColor: 'rgba(99, 102, 241, 0.08)',
      fill: true,
      tension: 0.4,
      pointBackgroundColor: '#6366f1',
      pointBorderColor: '#fff',
      pointBorderWidth: 2,
      pointRadius: 4,
      pointHoverRadius: 6,
    }],
  };

  // Applications by Status (Doughnut)
  const chartStatusColors = {
    submitted: '#94a3b8', under_review: '#60a5fa', shortlisted: '#818cf8',
    interview_scheduled: '#a78bfa', interviewed: '#8b5cf6', offer_extended: '#fbbf24',
    offer_accepted: '#34d399', offer_declined: '#fb923c', hired: '#22c55e',
    rejected: '#f87171', withdrawn: '#d1d5db',
  };
  const statusChartData = {
    labels: statusData.map(s => (s.status || '').replace(/_/g, ' ')),
    datasets: [{
      data: statusData.map(s => parseInt(s.count)),
      backgroundColor: statusData.map(s => chartStatusColors[s.status] || '#d1d5db'),
      borderWidth: 2,
      borderColor: '#fff',
    }],
  };

  // Department Breakdown (Bar)
  const deptChartData = {
    labels: departmentStats.map(d => d.department || 'Unassigned'),
    datasets: [
      {
        label: 'Applications',
        data: departmentStats.map(d => parseInt(d.applications || 0)),
        backgroundColor: 'rgba(99, 102, 241, 0.7)',
        borderRadius: 4,
      },
      {
        label: 'Hires',
        data: departmentStats.map(d => parseInt(d.hires || 0)),
        backgroundColor: 'rgba(34, 197, 94, 0.7)',
        borderRadius: 4,
      },
      {
        label: 'Offers',
        data: departmentStats.map(d => parseInt(d.offers || 0)),
        backgroundColor: 'rgba(251, 191, 36, 0.7)',
        borderRadius: 4,
      },
    ],
  };

  // Pipeline funnel data
  const pipelineStages = [
    { key: 'submitted', label: 'Submitted', color: '#94a3b8' },
    { key: 'under_review', label: 'Reviewing', color: '#60a5fa' },
    { key: 'shortlisted', label: 'Shortlisted', color: '#818cf8' },
    { key: 'interview_scheduled', label: 'Interviewing', color: '#a78bfa' },
    { key: 'interviewed', label: 'Interviewed', color: '#8b5cf6' },
    { key: 'offer_extended', label: 'Offered', color: '#fbbf24' },
    { key: 'offer_accepted', label: 'Accepted', color: '#34d399' },
    { key: 'hired', label: 'Hired', color: '#22c55e' },
  ];

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-200 border-t-primary-600"></div>
        <p className="text-sm text-gray-500">Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ChartBarIcon className="h-7 w-7 text-primary-600" />
            HR Dashboard
          </h1>
          {data.generatedAt && (
            <p className="text-sm text-gray-500 mt-1">
              <span className="text-xs text-gray-400">
                Last updated: {new Date(data.generatedAt).toLocaleTimeString()}
              </span>
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleRefresh}
            className="btn-secondary text-sm flex items-center gap-1.5"
          >
            <ArrowPathIcon className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <Link to="/hr/reports" className="btn-primary text-sm flex items-center gap-1.5">
            <DocumentTextIcon className="h-4 w-4" />
            Reports
          </Link>
        </div>
      </div>

      {/* ===== KEY METRICS ROW ===== */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-4 gap-4">
        {/* Active Jobs */}
        <Link to="/hr/jobs" className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md hover:border-blue-300 transition-all group">
          <div className="flex items-center justify-between mb-2">
            <div className="bg-blue-100 p-2 rounded-lg group-hover:bg-blue-200 transition-colors">
              <BriefcaseIcon className="h-5 w-5 text-blue-600" />
            </div>
            {parseInt(overview.closed_jobs || 0) > 0 && (
              <span className="text-xs text-gray-400">{overview.closed_jobs} closed</span>
            )}
          </div>
          <p className="text-2xl font-bold text-gray-900">{overview.active_jobs || 0}</p>
          <p className="text-xs text-gray-500 font-medium">Active Jobs</p>
        </Link>

        {/* Total Applications */}
        <Link to="/hr/applications" className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md hover:border-purple-300 transition-all group">
          <div className="flex items-center justify-between mb-2">
            <div className="bg-purple-100 p-2 rounded-lg group-hover:bg-purple-200 transition-colors">
              <DocumentTextIcon className="h-5 w-5 text-purple-600" />
            </div>
            <div className="flex items-center gap-1">
              {weeklyTrend !== 0 && (
                <>
                  {weeklyTrend > 0 ? (
                    <ArrowTrendingUpIcon className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <ArrowTrendingDownIcon className="h-3.5 w-3.5 text-red-500" />
                  )}
                  <span className={`text-xs font-medium ${weeklyTrend > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {weeklyTrend > 0 ? '+' : ''}{weeklyTrend}%
                  </span>
                </>
              )}
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900">{totalApps}</p>
          <p className="text-xs text-gray-500 font-medium">Applications</p>
          <p className="text-xs text-gray-400 mt-0.5">{appsThisWeek} this week</p>
        </Link>

        {/* Hires */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="bg-green-100 p-2 rounded-lg">
              <CheckCircleIcon className="h-5 w-5 text-green-600" />
            </div>
            <span className="text-xs font-medium text-green-600 bg-green-50 px-1.5 py-0.5 rounded">{hiringRate}% rate</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{totalHires}</p>
          <p className="text-xs text-gray-500 font-medium">Total Hires</p>
        </div>

        {/* Pending Offers */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="bg-yellow-100 p-2 rounded-lg">
              <GiftIcon className="h-5 w-5 text-yellow-600" />
            </div>
            <div className="flex gap-2 text-xs">
              <span className="text-emerald-600 font-medium">{overview.offers_accepted || 0} accepted</span>
              <span className="text-orange-600 font-medium">{overview.offers_declined || 0} declined</span>
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900">{overview.offers_pending || 0}</p>
          <p className="text-xs text-gray-500 font-medium">Pending Offers</p>
        </div>
      </div>

      {/* ===== SECONDARY METRICS ROW ===== */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        <div className="bg-gradient-to-br from-indigo-50 to-white rounded-lg border border-indigo-100 p-3 text-center">
          <p className="text-lg font-bold text-indigo-700">{overview.shortlisted_count || 0}</p>
          <p className="text-xs text-indigo-500">Shortlisted</p>
        </div>
        <Link to="/hr/interviews" className="bg-gradient-to-br from-purple-50 to-white rounded-lg border border-purple-100 p-3 text-center hover:shadow-sm transition-shadow">
          <p className="text-lg font-bold text-purple-700">{overview.total_interviews || 0}</p>
          <p className="text-xs text-purple-500">Interviews</p>
        </Link>
        <div className="bg-gradient-to-br from-blue-50 to-white rounded-lg border border-blue-100 p-3 text-center">
          <p className="text-lg font-bold text-blue-700">{overview.upcoming_interviews_count || 0}</p>
          <p className="text-xs text-blue-500">Upcoming</p>
        </div>
        <div className="bg-gradient-to-br from-red-50 to-white rounded-lg border border-red-100 p-3 text-center">
          <p className="text-lg font-bold text-red-700">{overview.total_rejections || 0}</p>
          <p className="text-xs text-red-500">Rejections</p>
        </div>
        <div className="bg-gradient-to-br from-teal-50 to-white rounded-lg border border-teal-100 p-3 text-center">
          <p className="text-lg font-bold text-teal-700">{overview.unique_candidates || 0}</p>
          <p className="text-xs text-teal-500">Candidates</p>
        </div>
        <div className="bg-gradient-to-br from-amber-50 to-white rounded-lg border border-amber-100 p-3 text-center">
          <p className="text-lg font-bold text-amber-700">{overview.avg_candidate_score || '—'}</p>
          <p className="text-xs text-amber-500">Avg AI Score</p>
        </div>
      </div>

      {/* ===== PIPELINE FUNNEL ===== */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider flex items-center gap-2">
            <SparklesIcon className="h-4 w-4 text-indigo-500" />
            Hiring Pipeline
          </h2>
          <Link to="/hr/analytics" className="text-xs text-primary-600 hover:text-primary-800 font-medium">
            View full pipeline →
          </Link>
        </div>
        <div className="space-y-2">
          {pipelineStages.map((stage) => {
            const count = parseInt(pipeline[stage.key] || 0);
            const total = parseInt(pipeline.total || 1);
            const pct = total > 0 ? (count / total) * 100 : 0;
            return (
              <div key={stage.key} className="flex items-center gap-3">
                <span className="text-xs text-gray-600 w-24 shrink-0 text-right font-medium">{stage.label}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-7 overflow-hidden relative">
                  <div
                    className="h-full rounded-full transition-all duration-500 flex items-center justify-end pr-2"
                    style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: stage.color }}
                  >
                    {pct > 12 && <span className="text-xs font-bold text-white drop-shadow-sm">{count}</span>}
                  </div>
                  {pct <= 12 && count > 0 && (
                    <span className="absolute left-[calc(max(2%,_var(--w))+8px)] top-1/2 -translate-y-1/2 text-xs font-medium text-gray-600" style={{'--w': `${pct}%`, left: `${Math.max(pct, 2) + 2}%`}}>{count}</span>
                  )}
                </div>
                <span className="text-xs text-gray-400 w-10 text-right">{pct.toFixed(0)}%</span>
              </div>
            );
          })}
          {/* Rejected (shown separately) */}
          <div className="flex items-center gap-3 pt-1 border-t border-gray-100">
            <span className="text-xs text-gray-600 w-24 shrink-0 text-right font-medium">Rejected</span>
            <div className="flex-1 bg-gray-100 rounded-full h-7 overflow-hidden relative">
              {(() => {
                const rejCount = parseInt(pipeline.rejected || 0);
                const total = parseInt(pipeline.total || 1);
                const rejPct = total > 0 ? (rejCount / total) * 100 : 0;
                return (
                  <>
                    <div className="bg-red-400 h-full rounded-full transition-all duration-500 flex items-center justify-end pr-2" style={{ width: `${Math.max(rejPct, 2)}%` }}>
                      {rejPct > 12 && <span className="text-xs font-bold text-white">{rejCount}</span>}
                    </div>
                    {rejPct <= 12 && rejCount > 0 && (
                      <span className="absolute text-xs font-medium text-gray-600" style={{ left: `${Math.max(rejPct, 2) + 2}%`, top: '50%', transform: 'translateY(-50%)' }}>{rejCount}</span>
                    )}
                  </>
                );
              })()}
            </div>
            <span className="text-xs text-gray-400 w-10 text-right">
              {parseInt(pipeline.total || 1) > 0 ? ((parseInt(pipeline.rejected || 0) / parseInt(pipeline.total || 1)) * 100).toFixed(0) : 0}%
            </span>
          </div>
        </div>
      </div>

      {/* ===== CHARTS ROW ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Applications Trend */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4 flex items-center gap-2">
            <ArrowTrendingUpIcon className="h-4 w-4 text-indigo-500" />
            Application Trend (Weekly)
          </h2>
          {trendData.length > 0 ? (
            <div style={{ height: '220px' }}>
              <Line
                data={trendChartData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: { display: false },
                    tooltip: {
                      backgroundColor: '#1e1b4b',
                      titleFont: { size: 12 },
                      bodyFont: { size: 12 },
                      padding: 10,
                      cornerRadius: 8,
                    },
                  },
                  scales: {
                    x: { grid: { display: false }, ticks: { font: { size: 11 } } },
                    y: { beginAtZero: true, grid: { color: '#f3f4f6' }, ticks: { font: { size: 11 }, stepSize: 1 } },
                  },
                }}
              />
            </div>
          ) : (
            <div className="flex items-center justify-center h-48 text-gray-400 text-sm">No trend data available</div>
          )}
        </div>

        {/* Status Distribution */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4 flex items-center gap-2">
            <UsersIcon className="h-4 w-4 text-indigo-500" />
            By Status
          </h2>
          {statusData.length > 0 ? (
            <div className="flex flex-col items-center">
              <div style={{ width: '180px', height: '180px' }}>
                <Doughnut
                  data={statusChartData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '65%',
                    plugins: {
                      legend: { display: false },
                      tooltip: {
                        backgroundColor: '#1e1b4b',
                        padding: 8,
                        cornerRadius: 8,
                        callbacks: {
                          label: (ctx) => ` ${ctx.label}: ${ctx.raw}`,
                        },
                      },
                    },
                  }}
                />
              </div>
              <div className="mt-3 flex flex-wrap justify-center gap-x-3 gap-y-1">
                {statusData.slice(0, 6).map((s) => (
                  <div key={s.status} className="flex items-center gap-1.5">
                    <span
                      className="w-2.5 h-2.5 rounded-full inline-block"
                      style={{ backgroundColor: chartStatusColors[s.status] || '#d1d5db' }}
                    />
                    <span className="text-xs text-gray-600">{(s.status || '').replace(/_/g, ' ')} ({s.count})</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-48 text-gray-400 text-sm">No status data</div>
          )}
        </div>
      </div>

      {/* ===== DEPARTMENT + TOP JOBS ROW ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Department Breakdown */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4 flex items-center gap-2">
            <BuildingOfficeIcon className="h-4 w-4 text-indigo-500" />
            Department Overview
          </h2>
          {departmentStats.length > 0 ? (
            <div style={{ height: '220px' }}>
              <Bar
                data={deptChartData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11 } } },
                    tooltip: { backgroundColor: '#1e1b4b', padding: 8, cornerRadius: 8 },
                  },
                  scales: {
                    x: { grid: { display: false }, ticks: { font: { size: 11 } } },
                    y: { beginAtZero: true, grid: { color: '#f3f4f6' }, ticks: { stepSize: 1, font: { size: 11 } } },
                  },
                }}
              />
            </div>
          ) : (
            <div className="flex items-center justify-center h-48 text-gray-400 text-sm">No department data</div>
          )}
        </div>

        {/* Top Jobs */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider flex items-center gap-2">
              <BriefcaseIcon className="h-4 w-4 text-indigo-500" />
              Active Jobs Performance
            </h2>
            <Link to="/hr/jobs" className="text-xs text-primary-600 hover:text-primary-800 font-medium">View All →</Link>
          </div>
          {topJobs.length > 0 ? (
            <div className="space-y-3 max-h-[230px] overflow-y-auto pr-1">
              {topJobs.map((job) => (
                <Link key={job.id} to={`/hr/jobs/${job.id}`} className="block p-3 bg-gray-50 rounded-lg hover:bg-indigo-50 transition-colors border border-transparent hover:border-indigo-200">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{job.title}</p>
                      <p className="text-xs text-gray-500">{job.department}</p>
                    </div>
                    <div className="flex items-center gap-3 ml-3 shrink-0">
                      <div className="text-center">
                        <p className="text-sm font-bold text-indigo-600">{job.application_count}</p>
                        <p className="text-[10px] text-gray-400">Apps</p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-bold text-green-600">{job.hires}</p>
                        <p className="text-[10px] text-gray-400">Hires</p>
                      </div>
                      {job.avg_score && (
                        <div className="text-center">
                          <p className="text-sm font-bold text-amber-600">{job.avg_score}</p>
                          <p className="text-[10px] text-gray-400">Score</p>
                        </div>
                      )}
                    </div>
                  </div>
                  {job.positions_available > 0 && (
                    <div className="mt-2">
                      <div className="flex items-center justify-between text-[10px] text-gray-400 mb-0.5">
                        <span>Positions filled</span>
                        <span>{job.positions_filled || 0}/{job.positions_available}</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-1.5">
                        <div
                          className="bg-green-500 h-1.5 rounded-full transition-all"
                          style={{ width: `${Math.min(((job.positions_filled || 0) / job.positions_available) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  )}
                </Link>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-48 text-gray-400 text-sm">No active jobs</div>
          )}
        </div>
      </div>

      {/* ===== RECENT ACTIVITY ROW ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Recent Applications */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider flex items-center gap-2">
              <ClockIcon className="h-4 w-4 text-indigo-500" />
              Recent Applications
            </h2>
            <Link to="/hr/applications" className="text-xs text-primary-600 hover:text-primary-800 font-medium">View All →</Link>
          </div>
          {recentApps.length > 0 ? (
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
              {recentApps.map((app) => (
                <Link
                  key={app.id}
                  to={`/hr/applications/${app.id}`}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors border border-gray-100"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900 truncate">{app.candidate_name}</p>
                      {app.type === 'internal' && (
                        <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">Internal</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 truncate">{app.job_title}</p>
                  </div>
                  <div className="flex items-center gap-3 ml-3 shrink-0">
                    {app.ai_overall_score && (
                      <span className={`text-xs font-bold ${
                        parseFloat(app.ai_overall_score) >= 70 ? 'text-green-600' :
                        parseFloat(app.ai_overall_score) >= 50 ? 'text-yellow-600' : 'text-red-600'
                      }`}>
                        {parseFloat(app.ai_overall_score).toFixed(0)}
                      </span>
                    )}
                    {getStatusBadge(app.status)}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-gray-400">
              <DocumentTextIcon className="h-8 w-8 mb-2" />
              <p className="text-sm">No recent applications</p>
            </div>
          )}
        </div>

        {/* Upcoming Interviews */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider flex items-center gap-2">
              <CalendarIcon className="h-4 w-4 text-indigo-500" />
              Upcoming Interviews
            </h2>
            <Link to="/hr/interviews" className="text-xs text-primary-600 hover:text-primary-800 font-medium">View All →</Link>
          </div>
          {upcomingInterviews.length > 0 ? (
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
              {upcomingInterviews.map((iv) => (
                <div
                  key={iv.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{iv.candidate_name}</p>
                    <p className="text-xs text-gray-500 truncate">{iv.job_title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-medium">
                        {(iv.interview_type || 'general').replace(/_/g, ' ')}
                      </span>
                      {iv.location && (
                        <span className="text-[10px] text-gray-400 truncate">{iv.location}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right ml-3 shrink-0">
                    <p className="text-sm font-medium text-gray-900">
                      {new Date(iv.scheduled_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </p>
                    {iv.start_time && (
                      <p className="text-xs text-gray-500">
                        {iv.start_time.substring(0, 5)}
                        {iv.end_time ? ` - ${iv.end_time.substring(0, 5)}` : ''}
                      </p>
                    )}
                    <span className={`text-[10px] font-medium ${
                      iv.interview_status === 'confirmed' ? 'text-green-600' : 'text-blue-600'
                    }`}>
                      {iv.interview_status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-gray-400">
              <CalendarIcon className="h-8 w-8 mb-2" />
              <p className="text-sm">No upcoming interviews</p>
            </div>
          )}
        </div>
      </div>

      {/* ===== QUICK ACTIONS ===== */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-700 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-white/80 uppercase tracking-wider mb-3">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Link to="/hr/jobs/new" className="flex items-center gap-2 bg-white/15 hover:bg-white/25 backdrop-blur rounded-lg px-4 py-3 text-white transition-colors">
            <BriefcaseIcon className="h-5 w-5" />
            <span className="text-sm font-medium">Post New Job</span>
          </Link>
          <Link to="/hr/applications" className="flex items-center gap-2 bg-white/15 hover:bg-white/25 backdrop-blur rounded-lg px-4 py-3 text-white transition-colors">
            <EyeIcon className="h-5 w-5" />
            <span className="text-sm font-medium">Review Applications</span>
          </Link>
          <Link to="/hr/interviews" className="flex items-center gap-2 bg-white/15 hover:bg-white/25 backdrop-blur rounded-lg px-4 py-3 text-white transition-colors">
            <CalendarIcon className="h-5 w-5" />
            <span className="text-sm font-medium">Manage Interviews</span>
          </Link>
          <Link to="/hr/reports" className="flex items-center gap-2 bg-white/15 hover:bg-white/25 backdrop-blur rounded-lg px-4 py-3 text-white transition-colors">
            <ChartBarIcon className="h-5 w-5" />
            <span className="text-sm font-medium">View Reports</span>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
