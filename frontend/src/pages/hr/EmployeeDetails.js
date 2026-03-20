import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  UserIcon,
  EnvelopeIcon,
  PhoneIcon,
  MapPinIcon,
  BriefcaseIcon,
  AcademicCapIcon,
  ArrowLeftIcon,
  CheckBadgeIcon,
  BookOpenIcon,
  ChartBarIcon,
  DocumentTextIcon,
  PencilIcon,
  CheckIcon,
  XMarkIcon,
  ArrowDownTrayIcon,
  DocumentArrowDownIcon,
} from '@heroicons/react/24/outline';
import { employeesAPI } from '../../services/api';

const EmployeeDetails = () => {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [editingEmployment, setEditingEmployment] = useState(false);
  const [editingPerformance, setEditingPerformance] = useState(false);

  const [employmentForm, setEmploymentForm] = useState({});
  const [performanceForm, setPerformanceForm] = useState({});

  const { data: employee, isLoading, error } = useQuery({
    queryKey: ['employee', id],
    queryFn: () => employeesAPI.getById(id),
  });

  const updateMutation = useMutation({
    mutationFn: (data) => employeesAPI.updateById(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employee', id] });
      toast.success('Employee updated successfully');
      setEditingEmployment(false);
      setEditingPerformance(false);
    },
    onError: () => {
      toast.error('Failed to update employee');
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (error || !employee?.data) {
    return (
      <div className="text-center py-12">
        <UserIcon className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-sm font-medium text-gray-900">Employee not found</h3>
        <Link to="/hr/employees" className="mt-4 text-primary-600 hover:underline">
          ← Back to Employees
        </Link>
      </div>
    );
  }

  const emp = employee.data;

  const getStatusBadge = (status) => {
    const styles = {
      active: 'bg-green-100 text-green-800',
      inactive: 'bg-gray-100 text-gray-800',
      suspended: 'bg-red-100 text-red-800',
    };
    return styles[status] || styles.active;
  };

  const formatDate = (date) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const yearsAtCompany = emp.hire_date
    ? Math.floor((new Date() - new Date(emp.hire_date)) / (365.25 * 24 * 60 * 60 * 1000))
    : 0;

  const startEditEmployment = () => {
    setEmploymentForm({
      department: emp.department || '',
      job_title: emp.job_title || '',
      employment_status: emp.employment_status || 'full_time',
      location: emp.location || '',
      hire_date: emp.hire_date ? emp.hire_date.split('T')[0] : '',
    });
    setEditingEmployment(true);
  };

  const saveEmployment = () => {
    updateMutation.mutate(employmentForm);
  };

  const startEditPerformance = () => {
    setPerformanceForm({
      performance_rating: emp.performance_rating || '',
      last_review_date: emp.last_review_date ? emp.last_review_date.split('T')[0] : '',
    });
    setEditingPerformance(true);
  };

  const savePerformance = () => {
    updateMutation.mutate(performanceForm);
  };

  const getFileUrl = (url) => {
    if (!url) return null;
    if (url.startsWith('http')) return url;
    return `http://localhost:5000${url}`;
  };

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link to="/hr/employees" className="inline-flex items-center text-gray-600 hover:text-gray-900 mb-4">
          <ArrowLeftIcon className="h-4 w-4 mr-2" />
          Back to Employees
        </Link>
      </div>

      {/* Profile Header with Photo */}
      <div className="card mb-6">
        <div className="flex items-start gap-6">
          <div className="w-28 h-28 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0 overflow-hidden border-4 border-white shadow-lg">
            {emp.photo_url ? (
              <img
                src={getFileUrl(emp.photo_url)}
                alt={`${emp.first_name} ${emp.last_name}`}
                className="w-28 h-28 rounded-full object-cover"
              />
            ) : (
              <UserIcon className="h-14 w-14 text-primary-600" />
            )}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">
                {emp.first_name} {emp.last_name}
              </h1>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusBadge(emp.account_status)}`}>
                {emp.account_status || 'Active'}
              </span>
              {emp.internal_mobility_interest && (
                <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
                  Open to Internal Mobility
                </span>
              )}
            </div>
            <p className="text-lg text-primary-600 mt-1">{emp.job_title || 'No Title'}</p>
            <p className="text-gray-600">{emp.department || 'No Department'}</p>
            
            <div className="flex flex-wrap gap-4 mt-4 text-sm text-gray-600">
              <div className="flex items-center gap-1">
                <EnvelopeIcon className="h-4 w-4" />
                <span>{emp.email}</span>
              </div>
              {emp.phone && (
                <div className="flex items-center gap-1">
                  <PhoneIcon className="h-4 w-4" />
                  <span>{emp.phone}</span>
                </div>
              )}
              {emp.location && (
                <div className="flex items-center gap-1">
                  <MapPinIcon className="h-4 w-4" />
                  <span>{emp.location}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Info Grid - Employment & Performance (editable) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Employment Info - Editable */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <BriefcaseIcon className="h-5 w-5 text-primary-600" />
              Employment Info
            </h3>
            {!editingEmployment ? (
              <button onClick={startEditEmployment} className="text-primary-600 hover:text-primary-800 p-1 rounded hover:bg-primary-50 transition-colors" title="Edit Employment Info">
                <PencilIcon className="h-4 w-4" />
              </button>
            ) : (
              <div className="flex gap-1">
                <button onClick={saveEmployment} disabled={updateMutation.isPending} className="text-green-600 hover:text-green-800 p-1 rounded hover:bg-green-50 transition-colors" title="Save">
                  <CheckIcon className="h-4 w-4" />
                </button>
                <button onClick={() => setEditingEmployment(false)} className="text-red-600 hover:text-red-800 p-1 rounded hover:bg-red-50 transition-colors" title="Cancel">
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
          {editingEmployment ? (
            <div className="space-y-3 text-sm">
              <div>
                <label className="text-gray-500 block mb-1">Department</label>
                <input type="text" value={employmentForm.department} onChange={(e) => setEmploymentForm({...employmentForm, department: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div>
                <label className="text-gray-500 block mb-1">Job Title</label>
                <input type="text" value={employmentForm.job_title} onChange={(e) => setEmploymentForm({...employmentForm, job_title: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div>
                <label className="text-gray-500 block mb-1">Employment Status</label>
                <select value={employmentForm.employment_status} onChange={(e) => setEmploymentForm({...employmentForm, employment_status: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                  <option value="full_time">Full Time</option>
                  <option value="part_time">Part Time</option>
                  <option value="contract">Contract</option>
                  <option value="intern">Intern</option>
                </select>
              </div>
              <div>
                <label className="text-gray-500 block mb-1">Location</label>
                <input type="text" value={employmentForm.location} onChange={(e) => setEmploymentForm({...employmentForm, location: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
              <div>
                <label className="text-gray-500 block mb-1">Hire Date</label>
                <input type="date" value={employmentForm.hire_date} onChange={(e) => setEmploymentForm({...employmentForm, hire_date: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                {employmentForm.hire_date && (
                  <p className="text-xs text-gray-500 mt-1">
                    Years at Company: <span className="font-semibold text-primary-600">{Math.max(0, Math.floor((new Date() - new Date(employmentForm.hire_date)) / (365.25 * 24 * 60 * 60 * 1000)))}</span>
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Employee ID:</span>
                <span className="font-medium">{emp.employee_id || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Department:</span>
                <span className="font-medium">{emp.department || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Job Title:</span>
                <span className="font-medium">{emp.job_title || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Hire Date:</span>
                <span className="font-medium">{formatDate(emp.hire_date)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Years at Company:</span>
                <span className="font-medium">{yearsAtCompany} years</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Employment Status:</span>
                <span className="font-medium capitalize">{emp.employment_status?.replace('_', ' ') || 'Full Time'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Location:</span>
                <span className="font-medium">{emp.location || 'N/A'}</span>
              </div>
              {emp.manager_first_name && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Manager:</span>
                  <span className="font-medium">{emp.manager_first_name} {emp.manager_last_name}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Performance - Editable */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <ChartBarIcon className="h-5 w-5 text-primary-600" />
              Performance
            </h3>
            {!editingPerformance ? (
              <button onClick={startEditPerformance} className="text-primary-600 hover:text-primary-800 p-1 rounded hover:bg-primary-50 transition-colors" title="Edit Performance">
                <PencilIcon className="h-4 w-4" />
              </button>
            ) : (
              <div className="flex gap-1">
                <button onClick={savePerformance} disabled={updateMutation.isPending} className="text-green-600 hover:text-green-800 p-1 rounded hover:bg-green-50 transition-colors" title="Save">
                  <CheckIcon className="h-4 w-4" />
                </button>
                <button onClick={() => setEditingPerformance(false)} className="text-red-600 hover:text-red-800 p-1 rounded hover:bg-red-50 transition-colors" title="Cancel">
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
          {editingPerformance ? (
            <div className="space-y-3 text-sm">
              <div>
                <label className="text-gray-500 block mb-1">Performance Rating (1-5)</label>
                <input type="number" min="1" max="5" step="0.1" value={performanceForm.performance_rating} onChange={(e) => setPerformanceForm({...performanceForm, performance_rating: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" placeholder="e.g. 4.5" />
              </div>
              <div>
                <label className="text-gray-500 block mb-1">Last Review Date</label>
                <input type="date" value={performanceForm.last_review_date} onChange={(e) => setPerformanceForm({...performanceForm, last_review_date: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
            </div>
          ) : (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Rating:</span>
                <div className="flex items-center gap-2">
                  <span className="font-medium">
                    {emp.performance_rating ? `${emp.performance_rating}/5` : 'Not Rated'}
                  </span>
                  {emp.performance_rating && (
                    <div className="flex gap-0.5">
                      {[1,2,3,4,5].map(star => (
                        <span key={star} className={`text-sm ${star <= Math.round(emp.performance_rating) ? 'text-yellow-400' : 'text-gray-300'}`}>★</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Last Review:</span>
                <span className="font-medium">{formatDate(emp.last_review_date)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Last Login:</span>
                <span className="font-medium">{formatDate(emp.last_login)}</span>
              </div>
              {emp.ai_retention_risk_score && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Retention Risk:</span>
                  <span className={`font-medium ${emp.ai_retention_risk_score > 0.7 ? 'text-red-600' : emp.ai_retention_risk_score > 0.4 ? 'text-yellow-600' : 'text-green-600'}`}>
                    {(emp.ai_retention_risk_score * 100).toFixed(0)}%
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Skills */}
      <div className="card mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <AcademicCapIcon className="h-5 w-5 text-primary-600" />
          Skills ({emp.skills?.length || 0})
        </h3>
        {emp.skills && emp.skills.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {emp.skills.map((skill, idx) => (
              <div
                key={skill.id || idx}
                className="px-3 py-2 bg-gray-100 rounded-lg text-sm"
              >
                <span className="font-medium">{skill.name}</span>
                {skill.proficiency && (
                  <span className="text-gray-500 ml-2">• {skill.proficiency}</span>
                )}
                {skill.years && (
                  <span className="text-gray-500 ml-1">({skill.years}y)</span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-sm">No skills recorded</p>
        )}
      </div>

      {/* Uploaded Resume */}
      <div className="card mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <DocumentTextIcon className="h-5 w-5 text-primary-600" />
          Uploaded Resume
        </h3>
        {emp.resume_url ? (
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-50 rounded-lg">
                <DocumentArrowDownIcon className="h-8 w-8 text-red-500" />
              </div>
              <div>
                <p className="font-medium text-gray-900">Resume</p>
                <p className="text-xs text-gray-500">
                  {emp.resume_url.endsWith('.pdf') ? 'PDF Document' : 
                   emp.resume_url.endsWith('.docx') ? 'Word Document' : 'Document'}
                  {emp.last_document_parse && ` • Parsed ${formatDate(emp.last_document_parse)}`}
                </p>
              </div>
            </div>
            <a
              href={getFileUrl(emp.resume_url)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors"
            >
              <ArrowDownTrayIcon className="h-4 w-4" />
              View / Download
            </a>
          </div>
        ) : (
          <p className="text-gray-500 text-sm">No resume uploaded</p>
        )}
      </div>

      {/* Certifications with document links */}
      <div className="card mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <CheckBadgeIcon className="h-5 w-5 text-primary-600" />
          Certifications ({emp.certifications?.length || 0})
        </h3>
        {emp.certifications && emp.certifications.length > 0 ? (
          <div className="space-y-3">
            {emp.certifications.map((cert, idx) => (
              <div key={cert.id || idx} className="flex justify-between items-center p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex items-center gap-3">
                  {cert.credential_url ? (
                    <div className="p-2 bg-green-50 rounded-lg">
                      <DocumentArrowDownIcon className="h-6 w-6 text-green-600" />
                    </div>
                  ) : (
                    <div className="p-2 bg-gray-100 rounded-lg">
                      <CheckBadgeIcon className="h-6 w-6 text-gray-400" />
                    </div>
                  )}
                  <div>
                    <p className="font-medium text-gray-900">{cert.name}</p>
                    <p className="text-sm text-gray-600">{cert.issuer || 'Unknown issuer'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right text-sm">
                    <p className="text-gray-600">Issued: {formatDate(cert.date)}</p>
                    {cert.expiry && (
                      <p className={`${new Date(cert.expiry) < new Date() ? 'text-red-600' : 'text-gray-600'}`}>
                        Expires: {formatDate(cert.expiry)}
                      </p>
                    )}
                  </div>
                  {cert.credential_url && (
                    <a
                      href={getFileUrl(cert.credential_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 transition-colors"
                    >
                      <ArrowDownTrayIcon className="h-3.5 w-3.5" />
                      View
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-sm">No certifications recorded</p>
        )}
      </div>

      {/* Training with document links */}
      <div className="card mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <BookOpenIcon className="h-5 w-5 text-primary-600" />
          Training & Courses ({emp.training?.length || 0})
        </h3>
        {emp.training && emp.training.length > 0 ? (
          <div className="space-y-3">
            {emp.training.map((train, idx) => (
              <div key={train.id || idx} className="flex justify-between items-center p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex items-center gap-3">
                  {train.certificate_url ? (
                    <div className="p-2 bg-blue-50 rounded-lg">
                      <DocumentArrowDownIcon className="h-6 w-6 text-blue-600" />
                    </div>
                  ) : (
                    <div className="p-2 bg-gray-100 rounded-lg">
                      <BookOpenIcon className="h-6 w-6 text-gray-400" />
                    </div>
                  )}
                  <div>
                    <p className="font-medium text-gray-900">{train.name}</p>
                    <p className="text-sm text-gray-600">{train.provider || 'Unknown provider'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      train.status === 'completed' ? 'bg-green-100 text-green-800' :
                      train.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {train.status?.replace('_', ' ') || 'Completed'}
                    </span>
                    <p className="text-sm text-gray-600 mt-1">{formatDate(train.date)}</p>
                  </div>
                  {train.certificate_url && (
                    <a
                      href={getFileUrl(train.certificate_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition-colors"
                    >
                      <ArrowDownTrayIcon className="h-3.5 w-3.5" />
                      View
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-sm">No training records</p>
        )}
      </div>

      {/* Career Aspirations */}
      {(emp.career_aspirations || emp.preferred_roles?.length > 0) && (
        <div className="card mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Career Aspirations</h3>
          {emp.career_aspirations && (
            <p className="text-gray-700 mb-4">{emp.career_aspirations}</p>
          )}
          {emp.preferred_roles && emp.preferred_roles.length > 0 && (
            <div>
              <p className="text-sm text-gray-500 mb-2">Preferred Roles:</p>
              <div className="flex flex-wrap gap-2">
                {emp.preferred_roles.map((role, idx) => (
                  <span key={idx} className="px-3 py-1 bg-primary-100 text-primary-800 rounded-full text-sm">
                    {role}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Career Paths */}
      {emp.career_paths && emp.career_paths.length > 0 && (
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">AI Career Path Recommendations</h3>
          <div className="space-y-3">
            {emp.career_paths.map((path, idx) => (
              <div key={path.id || idx} className="p-3 bg-gray-50 rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="font-medium text-gray-900">{path.role}</span>
                  <div className="flex gap-3 text-sm">
                    <span className="text-primary-600">Readiness: {path.readiness}%</span>
                    <span className="text-green-600">Success: {(path.probability * 100).toFixed(0)}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default EmployeeDetails;
