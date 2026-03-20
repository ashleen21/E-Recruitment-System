import React, { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { analyticsAPI, jobsAPI } from '../../services/api';
import {
  DocumentArrowDownIcon,
  CalendarIcon,
  FunnelIcon,
  ChartBarIcon,
  UserGroupIcon,
  ClipboardDocumentCheckIcon,
  BuildingOfficeIcon,
  TrophyIcon,
  ArrowPathIcon,
  PrinterIcon,
  TableCellsIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from '@heroicons/react/24/outline';

const Reports = () => {
  const [reportType, setReportType] = useState('hiring');
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0],
  });
  const [department, setDepartment] = useState('');
  const [expandedSection, setExpandedSection] = useState('all');
  const reportRef = useRef(null);

  const { data: reportData, isLoading, refetch } = useQuery({
    queryKey: ['reports', reportType, dateRange, department],
    queryFn: () => analyticsAPI.getReports({ type: reportType, ...dateRange, department }),
    enabled: false,
  });

  const { data: jobsList } = useQuery({
    queryKey: ['jobs-for-reports'],
    queryFn: () => jobsAPI.getAll({ limit: 200, status: 'all' }),
  });

  const departments = [...new Set((jobsList?.data?.jobs || jobsList?.data || []).map(j => j.department).filter(Boolean))].sort();

  const reportTypes = [
    { id: 'hiring', name: 'Hiring Summary', icon: ChartBarIcon, color: 'blue', description: 'Overview of all jobs, applications, and hiring activity' },
    { id: 'pipeline', name: 'Application Pipeline', icon: FunnelIcon, color: 'purple', description: 'Candidate funnel from application to hire with conversion rates' },
    { id: 'interviews', name: 'Interview Report', icon: ClipboardDocumentCheckIcon, color: 'green', description: 'Interview performance, feedback scores, and outcomes' },
    { id: 'departments', name: 'Department Analysis', icon: BuildingOfficeIcon, color: 'amber', description: 'Hiring and application metrics broken down by department' },
    { id: 'employees', name: 'Employee Overview', icon: UserGroupIcon, color: 'teal', description: 'Employee distribution, internal mobility, and internal hiring' },
    { id: 'offers', name: 'Offers & Decisions', icon: TrophyIcon, color: 'rose', description: 'Offer status tracking, acceptances, rejections, and hires' },
  ];

  const activeReport = reportTypes.find(r => r.id === reportType);
  const report = reportData?.data;

  const handleGenerate = () => { refetch(); };

  // CSV Download
  const downloadCSV = (data, filename) => {
    if (!data || data.length === 0) return;
    const headers = Object.keys(data[0]);
    const csvRows = [
      headers.join(','),
      ...data.map(row => headers.map(h => {
        const val = row[h] ?? '';
        const str = String(val).replace(/"/g, '""');
        return str.includes(',') || str.includes('"') || str.includes('\n') ? `"${str}"` : str;
      }).join(','))
    ];
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    const printContent = reportRef.current;
    if (!printContent) return;
    const win = window.open('', '_blank');
    win.document.write(`
      <html><head><title>${activeReport?.name || 'Report'}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; color: #333; }
        h1 { color: #1a1a1a; border-bottom: 2px solid #4f46e5; padding-bottom: 8px; }
        h2 { color: #374151; margin-top: 24px; }
        table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 13px; }
        th { background: #f3f4f6; padding: 8px 12px; text-align: left; border: 1px solid #e5e7eb; font-weight: 600; }
        td { padding: 8px 12px; border: 1px solid #e5e7eb; }
        tr:nth-child(even) { background: #f9fafb; }
        .summary-grid { display: flex; flex-wrap: wrap; gap: 12px; margin: 12px 0; }
        .stat-card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 16px; min-width: 140px; }
        .stat-value { font-size: 24px; font-weight: bold; color: #1a1a1a; }
        .stat-label { font-size: 12px; color: #6b7280; }
        .meta { color: #6b7280; font-size: 12px; margin-top: 4px; }
        @media print { body { padding: 0; } }
      </style></head><body>
      <h1>${activeReport?.name || 'Report'}</h1>
      <p class="meta">Generated: ${new Date().toLocaleString()} | Date Range: ${dateRange.start} to ${dateRange.end}${department ? ' | Department: ' + department : ''}</p>
      ${printContent.innerHTML}
      </body></html>
    `);
    win.document.close();
    win.print();
  };

  const StatCard = ({ label, value, color = 'gray', sub }) => (
    <div className={`bg-${color}-50 border border-${color}-200 rounded-xl p-4`}>
      <p className={`text-2xl font-bold text-${color}-700`}>{value ?? '—'}</p>
      <p className={`text-xs text-${color}-600 font-medium`}>{label}</p>
      {sub && <p className={`text-xs text-${color}-500 mt-1`}>{sub}</p>}
    </div>
  );

  const SectionToggle = ({ id, title, children }) => {
    const isOpen = expandedSection === 'all' || expandedSection === id;
    return (
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <button
          onClick={() => setExpandedSection(isOpen && expandedSection !== 'all' ? 'none' : id === expandedSection ? 'all' : id)}
          className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
        >
          <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
          {isOpen ? <ChevronUpIcon className="h-4 w-4 text-gray-500" /> : <ChevronDownIcon className="h-4 w-4 text-gray-500" />}
        </button>
        {isOpen && <div className="p-4">{children}</div>}
      </div>
    );
  };

  const DataTable = ({ data, onDownload }) => {
    if (!data || data.length === 0) return <p className="text-sm text-gray-500 italic py-2">No data available</p>;
    const headers = Object.keys(data[0]);
    return (
      <div>
        {onDownload && (
          <div className="flex justify-end mb-2">
            <button onClick={onDownload} className="text-xs text-primary-600 hover:text-primary-800 flex items-center gap-1">
              <DocumentArrowDownIcon className="h-3.5 w-3.5" /> Download CSV
            </button>
          </div>
        )}
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {headers.map(h => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">
                    {h.replace(/_/g, ' ')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.map((row, idx) => (
                <tr key={idx} className="hover:bg-gray-50">
                  {headers.map(h => (
                    <td key={h} className="px-3 py-2 text-gray-700 whitespace-nowrap">
                      {formatCell(h, row[h])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const formatCell = (key, value) => {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (key.includes('rating') || key.includes('score') || key.includes('avg')) {
      const num = parseFloat(value);
      return isNaN(num) ? value : num.toFixed(1);
    }
    if ((key.endsWith('_date') || key === 'date' || key === 'week' || key === 'posted_date' || key === 'hire_date' || key === 'scheduled_date' || key === 'decision_date') && value) {
      try {
        const d = new Date(value);
        return isNaN(d.getTime()) ? value : d.toLocaleDateString();
      } catch { return value; }
    }
    if (key.includes('status')) {
      const colors = {
        offer_extended: 'bg-yellow-100 text-yellow-800',
        offer_accepted: 'bg-emerald-100 text-emerald-800',
        offer_declined: 'bg-orange-100 text-orange-800',
        hired: 'bg-green-100 text-green-800',
        rejected: 'bg-red-100 text-red-800',
        published: 'bg-blue-100 text-blue-800',
        completed: 'bg-green-100 text-green-800',
        scheduled: 'bg-blue-100 text-blue-800',
        withdrawn: 'bg-gray-100 text-gray-800',
        interview_scheduled: 'bg-purple-100 text-purple-800',
        interviewed: 'bg-indigo-100 text-indigo-800',
        confirmed: 'bg-teal-100 text-teal-800',
        submitted: 'bg-slate-100 text-slate-800',
        under_review: 'bg-blue-100 text-blue-800',
        shortlisted: 'bg-indigo-100 text-indigo-800',
      };
      const colorClass = colors[value] || 'bg-gray-100 text-gray-800';
      return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>{value.replace(/_/g, ' ')}</span>;
    }
    return String(value);
  };

  // ================================
  // REPORT RENDERERS
  // ================================

  const renderHiringReport = () => {
    const s = report?.summary || {};
    return (
      <div className="space-y-5">
        <SectionToggle id="summary" title="Summary Statistics">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <StatCard label="Active Jobs" value={s.active_jobs} color="blue" />
            <StatCard label="Closed Jobs" value={s.closed_jobs} color="gray" />
            <StatCard label="Applications" value={s.total_applications} color="purple" />
            <StatCard label="Applicants" value={s.unique_applicants} color="indigo" />
            <StatCard label="Hires" value={s.total_hires} color="green" />
            <StatCard label="Offers Extended" value={s.offers_extended} color="yellow" />
            <StatCard label="Offers Accepted" value={s.offers_accepted} color="emerald" />
            <StatCard label="Offers Declined" value={s.offers_declined} color="orange" />
            <StatCard label="Rejections" value={s.total_rejections} color="red" />
            <StatCard label="Withdrawals" value={s.withdrawals} color="gray" />
            <StatCard label="Interviews" value={s.total_interviews} color="teal" />
            <StatCard label="Avg AI Score" value={s.avg_ai_score} color="indigo" />
          </div>
        </SectionToggle>

        <SectionToggle id="jobs" title="Jobs Breakdown">
          <DataTable
            data={report?.rows}
            onDownload={() => downloadCSV(report?.rows, 'hiring_summary')}
          />
        </SectionToggle>

        {report?.trend?.length > 0 && (
          <SectionToggle id="trend" title="Weekly Application Trend">
            <div className="space-y-2">
              {report.trend.map((w, idx) => {
                const max = Math.max(...report.trend.map(t => parseInt(t.applications)));
                const pct = max > 0 ? (parseInt(w.applications) / max) * 100 : 0;
                return (
                  <div key={idx} className="flex items-center gap-3">
                    <span className="text-xs text-gray-500 w-24 shrink-0">{new Date(w.week).toLocaleDateString()}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                      <div className="bg-blue-500 h-full rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs font-medium text-gray-700 w-8 text-right">{w.applications}</span>
                  </div>
                );
              })}
            </div>
          </SectionToggle>
        )}
      </div>
    );
  };

  const renderPipelineReport = () => {
    const s = report?.summary || {};
    const c = report?.conversion || {};
    const stages = [
      { key: 'submitted', label: 'Submitted', color: 'bg-gray-400' },
      { key: 'under_review', label: 'Under Review', color: 'bg-blue-400' },
      { key: 'shortlisted', label: 'Shortlisted', color: 'bg-indigo-400' },
      { key: 'interview_scheduled', label: 'Interview Scheduled', color: 'bg-purple-400' },
      { key: 'interviewed', label: 'Interviewed', color: 'bg-violet-400' },
      { key: 'offer_extended', label: 'Offer Extended', color: 'bg-yellow-400' },
      { key: 'offer_accepted', label: 'Offer Accepted', color: 'bg-emerald-400' },
      { key: 'offer_declined', label: 'Offer Declined', color: 'bg-orange-400' },
      { key: 'hired', label: 'Hired', color: 'bg-green-500' },
    ];
    const total = parseInt(s.total || 1);

    return (
      <div className="space-y-5">
        <SectionToggle id="funnel" title="Hiring Funnel">
          <div className="space-y-2">
            {stages.map((stage) => {
              const count = parseInt(s[stage.key] || 0);
              const pct = total > 0 ? (count / total) * 100 : 0;
              return (
                <div key={stage.key} className="flex items-center gap-3">
                  <span className="text-xs text-gray-600 w-36 shrink-0 text-right">{stage.label}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-8 overflow-hidden relative">
                    <div className={`${stage.color} h-full rounded-full transition-all flex items-center justify-end pr-2`} style={{ width: `${Math.max(pct, 3)}%` }}>
                      {pct > 15 && <span className="text-xs font-bold text-white">{count}</span>}
                    </div>
                    {pct <= 15 && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-600">{count}</span>}
                  </div>
                  <span className="text-xs text-gray-500 w-12 text-right">{pct.toFixed(0)}%</span>
                </div>
              );
            })}
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-600 w-36 shrink-0 text-right">Rejected</span>
              <div className="flex-1 bg-gray-100 rounded-full h-8 overflow-hidden relative">
                {(() => {
                  const rejPct = (parseInt(s.rejected || 0) / total) * 100;
                  return (
                    <>
                      <div className="bg-red-400 h-full rounded-full transition-all flex items-center justify-end pr-2" style={{ width: `${Math.max(rejPct, 3)}%` }}>
                        {rejPct > 15 && <span className="text-xs font-bold text-white">{s.rejected}</span>}
                      </div>
                      {rejPct <= 15 && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-600">{s.rejected}</span>}
                    </>
                  );
                })()}
              </div>
              <span className="text-xs text-gray-500 w-12 text-right">{((parseInt(s.rejected || 0) / total) * 100).toFixed(0)}%</span>
            </div>
          </div>
        </SectionToggle>

        <SectionToggle id="conversion" title="Conversion Rates">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <StatCard label="App → Review" value={`${c.application_to_review || 0}%`} color="blue" />
            <StatCard label="Review → Shortlist" value={`${c.review_to_shortlist || 0}%`} color="indigo" />
            <StatCard label="Shortlist → Interview" value={`${c.shortlist_to_interview || 0}%`} color="purple" />
            <StatCard label="Interview → Offer" value={`${c.interview_to_offer || 0}%`} color="yellow" />
            <StatCard label="Offer → Hire" value={`${c.offer_to_hire || 0}%`} color="green" />
            <StatCard label="Offer Acceptance" value={`${c.offer_acceptance_rate || 0}%`} color="emerald" />
          </div>
        </SectionToggle>

        <SectionToggle id="pipeline-jobs" title="Pipeline by Job">
          <DataTable
            data={report?.rows}
            onDownload={() => downloadCSV(report?.rows, 'application_pipeline')}
          />
        </SectionToggle>
      </div>
    );
  };

  const renderInterviewReport = () => {
    const s = report?.summary || {};
    const f = report?.feedback || {};
    return (
      <div className="space-y-5">
        <SectionToggle id="int-summary" title="Interview Statistics">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <StatCard label="Total Interviews" value={s.total_interviews} color="blue" />
            <StatCard label="Completed" value={s.completed} color="green" />
            <StatCard label="Scheduled" value={s.scheduled} color="indigo" />
            <StatCard label="Confirmed" value={s.confirmed} color="teal" />
            <StatCard label="Cancelled" value={s.cancelled} color="red" />
            <StatCard label="No Shows" value={s.no_shows} color="gray" />
            <StatCard label="Video" value={s.video_interviews} color="blue" />
            <StatCard label="In-Person" value={s.in_person_interviews} color="purple" />
            <StatCard label="Technical" value={s.technical_interviews} color="indigo" />
            <StatCard label="Panel" value={s.panel_interviews} color="teal" />
          </div>
        </SectionToggle>

        <SectionToggle id="feedback-scores" title="Feedback Scores (Averages)">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <StatCard label="Overall Rating" value={f.avg_overall} color="blue" />
            <StatCard label="Technical Skills" value={f.avg_technical} color="indigo" />
            <StatCard label="Communication" value={f.avg_communication} color="teal" />
            <StatCard label="Problem Solving" value={f.avg_problem_solving} color="purple" />
            <StatCard label="Cultural Fit" value={f.avg_cultural_fit} color="green" />
            <StatCard label="Leadership" value={f.avg_leadership} color="amber" />
            <StatCard label="Recommended Hire" value={f.recommended_hire} color="green" sub={`of ${f.total_feedback || 0} feedbacks`} />
            <StatCard label="Recommended Reject" value={f.recommended_reject} color="red" sub={`of ${f.total_feedback || 0} feedbacks`} />
          </div>
          {f.avg_overall && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                { label: 'Technical', val: f.avg_technical },
                { label: 'Communication', val: f.avg_communication },
                { label: 'Problem Solving', val: f.avg_problem_solving },
                { label: 'Cultural Fit', val: f.avg_cultural_fit },
                { label: 'Leadership', val: f.avg_leadership },
                { label: 'Overall', val: f.avg_overall },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-2">
                  <span className="text-xs text-gray-600 w-28 shrink-0">{item.label}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${parseFloat(item.val) >= 4 ? 'bg-green-500' : parseFloat(item.val) >= 3 ? 'bg-yellow-500' : 'bg-red-500'}`}
                      style={{ width: `${(parseFloat(item.val || 0) / 5) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium text-gray-700 w-8">{parseFloat(item.val || 0).toFixed(1)}/5</span>
                </div>
              ))}
            </div>
          )}
        </SectionToggle>

        <SectionToggle id="int-by-job" title="Interviews by Job">
          <DataTable
            data={report?.rows}
            onDownload={() => downloadCSV(report?.rows, 'interviews_by_job')}
          />
        </SectionToggle>

        <SectionToggle id="int-details" title="Interview Details">
          <DataTable
            data={report?.details}
            onDownload={() => downloadCSV(report?.details, 'interview_details')}
          />
        </SectionToggle>
      </div>
    );
  };

  const renderDepartmentReport = () => {
    const s = report?.summary || {};
    return (
      <div className="space-y-5">
        <SectionToggle id="dept-summary" title="Overview">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <StatCard label="Departments" value={s.total_departments} color="blue" />
            <StatCard label="Total Jobs" value={s.total_jobs} color="indigo" />
            <StatCard label="Applications" value={s.total_applications} color="purple" />
            <StatCard label="Total Hires" value={s.total_hires} color="green" />
            <StatCard label="Most Active Dept" value={s.most_active_dept || '—'} color="amber" />
          </div>
        </SectionToggle>

        <SectionToggle id="dept-breakdown" title="Department Breakdown">
          <DataTable
            data={report?.rows}
            onDownload={() => downloadCSV(report?.rows, 'department_analysis')}
          />
        </SectionToggle>
      </div>
    );
  };

  const renderEmployeeReport = () => {
    const s = report?.summary || {};
    const ia = report?.internalApps || {};
    return (
      <div className="space-y-5">
        <SectionToggle id="emp-summary" title="Employee Overview">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Total Employees" value={s.total_employees} color="blue" />
            <StatCard label="Full-Time" value={s.full_time} color="green" />
            <StatCard label="Part-Time" value={s.part_time} color="teal" />
            <StatCard label="Contract" value={s.contract} color="amber" />
            <StatCard label="Interns" value={s.interns} color="purple" />
            <StatCard label="Departments" value={s.departments} color="indigo" />
            <StatCard label="Mobility Interested" value={s.mobility_interested} color="yellow" />
          </div>
        </SectionToggle>

        <SectionToggle id="int-mobility" title="Internal Mobility & Applications">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
            <StatCard label="Internal Applications" value={ia.total_internal_applications} color="blue" />
            <StatCard label="In Interviews" value={ia.in_interviews} color="purple" />
            <StatCard label="Offers Pending" value={ia.offers_pending} color="yellow" />
            <StatCard label="Offers Accepted" value={ia.offers_accepted} color="emerald" />
            <StatCard label="Offers Declined" value={ia.offers_declined} color="orange" />
            <StatCard label="Internal Hires" value={ia.internal_hires} color="green" />
            <StatCard label="Rejected" value={ia.rejected} color="red" />
          </div>
        </SectionToggle>

        <SectionToggle id="emp-dept" title="Employees by Department">
          <DataTable
            data={report?.rows}
            onDownload={() => downloadCSV(report?.rows, 'employees_by_dept')}
          />
        </SectionToggle>

        <SectionToggle id="emp-details" title="Employee Details">
          <DataTable
            data={report?.details}
            onDownload={() => downloadCSV(report?.details, 'employee_details')}
          />
        </SectionToggle>
      </div>
    );
  };

  const renderOffersReport = () => {
    const s = report?.summary || {};
    return (
      <div className="space-y-5">
        <SectionToggle id="offers-summary" title="Offers Overview">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <StatCard label="Pending Offers" value={s.pending_offers} color="yellow" />
            <StatCard label="Accepted" value={s.accepted_offers} color="emerald" />
            <StatCard label="Declined" value={s.declined_offers} color="orange" />
            <StatCard label="Hires" value={s.hires} color="green" />
            <StatCard label="Total Rejections" value={s.total_rejections} color="gray" />
            <StatCard label="Total Offer Activity" value={s.total_offer_activity} color="indigo" />
            <StatCard label="Acceptance Rate" value={s.acceptance_rate ? `${s.acceptance_rate}%` : '—'} color="blue" />
          </div>
        </SectionToggle>

        <SectionToggle id="offers-details" title="Offer & Decision Details">
          <DataTable
            data={report?.rows}
            onDownload={() => downloadCSV(report?.rows, 'offers_decisions')}
          />
        </SectionToggle>
      </div>
    );
  };

  const renderReport = () => {
    if (!report) return null;
    switch (reportType) {
      case 'hiring': return renderHiringReport();
      case 'pipeline': return renderPipelineReport();
      case 'interviews': return renderInterviewReport();
      case 'departments': return renderDepartmentReport();
      case 'employees': return renderEmployeeReport();
      case 'offers': return renderOffersReport();
      default: return renderHiringReport();
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        </div>
        {report && (
          <div className="flex gap-2">
            <button onClick={handlePrint} className="btn-secondary text-sm flex items-center">
              <PrinterIcon className="h-4 w-4 mr-1" /> Print
            </button>
            {report.rows && (
              <button
                onClick={() => downloadCSV(report.rows, `${reportType}_report`)}
                className="btn-secondary text-sm flex items-center"
              >
                <TableCellsIcon className="h-4 w-4 mr-1" /> Export CSV
              </button>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Panel — Report Type & Filters */}
        <div className="lg:col-span-1 space-y-5">
          {/* Report Type Selection */}
          <div className="card">
            <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wider">Report Type</h2>
            <div className="space-y-1.5">
              {reportTypes.map((rt) => {
                const Icon = rt.icon;
                const isActive = reportType === rt.id;
                return (
                  <button
                    key={rt.id}
                    onClick={() => setReportType(rt.id)}
                    className={`w-full text-left p-3 rounded-lg border transition-all flex items-start gap-3 ${
                      isActive
                        ? 'border-primary-400 bg-primary-50 shadow-sm'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${isActive ? 'text-primary-600' : 'text-gray-400'}`} />
                    <div>
                      <p className={`text-sm font-medium ${isActive ? 'text-primary-700' : 'text-gray-800'}`}>{rt.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{rt.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Filters */}
          <div className="card">
            <h2 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wider flex items-center">
              <FunnelIcon className="h-4 w-4 mr-1.5" /> Filters
            </h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  <CalendarIcon className="h-3.5 w-3.5 inline mr-1" /> Start Date
                </label>
                <input
                  type="date"
                  value={dateRange.start}
                  onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                  className="input-field text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  <CalendarIcon className="h-3.5 w-3.5 inline mr-1" /> End Date
                </label>
                <input
                  type="date"
                  value={dateRange.end}
                  onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                  className="input-field text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  <BuildingOfficeIcon className="h-3.5 w-3.5 inline mr-1" /> Department
                </label>
                <select
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="input-field text-sm"
                >
                  <option value="">All Departments</option>
                  {departments.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleGenerate}
                disabled={isLoading}
                className="btn-primary w-full flex items-center justify-center text-sm"
              >
                {isLoading ? (
                  <><ArrowPathIcon className="h-4 w-4 mr-2 animate-spin" /> Generating...</>
                ) : (
                  <><ChartBarIcon className="h-4 w-4 mr-2" /> Generate Report</>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Right Panel — Report Output */}
        <div className="lg:col-span-3">
          {report ? (
            <div ref={reportRef}>
              {/* Report Header */}
              <div className="bg-gradient-to-r from-primary-600 to-primary-800 rounded-xl p-5 text-white mb-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold flex items-center">
                      {activeReport && <activeReport.icon className="h-6 w-6 mr-2" />}
                      {activeReport?.name}
                    </h2>
                    <p className="text-sm opacity-80 mt-1">
                      {dateRange.start} — {dateRange.end}{department ? ` • ${department}` : ''} • Generated {new Date(report?.generatedAt || Date.now()).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>

              {renderReport()}
            </div>
          ) : (
            <div className="card flex flex-col items-center justify-center py-20 text-center">
              <div className="bg-gray-100 rounded-full p-6 mb-4">
                <DocumentArrowDownIcon className="h-12 w-12 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-700 mb-1">No Report Generated</h3>
              <p className="text-sm text-gray-500 mb-4 max-w-sm">
                Select a report type, set your date range, and click "Generate Report" to see results.
              </p>
              <button onClick={handleGenerate} className="btn-primary text-sm flex items-center">
                <ChartBarIcon className="h-4 w-4 mr-2" /> Generate Report
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Reports;
