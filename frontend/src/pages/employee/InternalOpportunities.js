import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  MapPinIcon,
  BriefcaseIcon,
  ClockIcon,
  BuildingOfficeIcon,
  ChartBarIcon,
  BookmarkIcon,
  XMarkIcon,
  AcademicCapIcon,
  CalendarIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  EnvelopeIcon,
  DocumentArrowUpIcon,
} from '@heroicons/react/24/outline';
import { BookmarkIcon as BookmarkSolidIcon } from '@heroicons/react/24/solid';
import { employeesAPI } from '../../services/api';

const InternalOpportunities = () => {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const highlightJobId = searchParams.get('jobId');
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({
    department: '',
    location: '',
    type: '',
  });
  const [showFilters, setShowFilters] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);
  const [showContactModal, setShowContactModal] = useState(false);
  const [contactForm, setContactForm] = useState({ subject: '', message: '' });
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [coverLetter, setCoverLetter] = useState('');

  const { data: opportunities, isLoading } = useQuery({
    queryKey: ['internal-opportunities', filters],
    queryFn: () => employeesAPI.getInternalOpportunities(filters),
  });

  const { data: savedJobs } = useQuery({
    queryKey: ['saved-internal-jobs'],
    queryFn: () => employeesAPI.getSavedJobs(),
  });

  // Auto-select the job when navigating from a notification
  useEffect(() => {
    if (highlightJobId && opportunities?.data) {
      const matchedJob = opportunities.data.find(j => j.id === highlightJobId);
      if (matchedJob) {
        setSelectedJob(matchedJob);
      }
    }
  }, [highlightJobId, opportunities]);

  const saveMutation = useMutation({
    mutationFn: (jobId) => employeesAPI.saveJob(jobId),
    onSuccess: (data) => {
      queryClient.invalidateQueries(['saved-internal-jobs']);
      toast.success(data.data.saved ? 'Job saved!' : 'Job removed from saved');
    },
    onError: () => {
      toast.error('Failed to save job');
    },
  });

  const applyMutation = useMutation({
    mutationFn: ({ jobId, coverLetter }) => employeesAPI.applyInternal(jobId, coverLetter),
    onSuccess: () => {
      queryClient.invalidateQueries(['internal-opportunities']);
      toast.success('Application submitted successfully! HR has been notified.');
      setSelectedJob(prev => prev ? { ...prev, application_id: 'applied' } : null);
      setShowApplyModal(false);
      setCoverLetter('');
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to submit application');
    },
  });

  const contactHRMutation = useMutation({
    mutationFn: (data) => employeesAPI.contactHR(data),
    onSuccess: () => {
      toast.success('Message sent to HR successfully!');
      setShowContactModal(false);
      setContactForm({ subject: '', message: '' });
    },
    onError: (error) => {
      toast.error(error.response?.data?.error || 'Failed to send message');
    },
  });

  const jobsList = opportunities?.data || [];
  const savedJobIds = (savedJobs?.data || []).map(j => j.id);
  const hasResume = jobsList.length > 0 ? jobsList[0]?.has_resume : true;

  const filteredJobs = jobsList.filter(job =>
    job.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    job.department?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const departments = [...new Set(jobsList.map(j => j.department).filter(Boolean))];
  const locations = [...new Set(jobsList.map(j => j.location).filter(Boolean))];

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return 'N/A';
    }
  };

  const handleApply = () => {
    if (selectedJob) {
      applyMutation.mutate({ jobId: selectedJob.id, coverLetter });
    }
  };

  const handleContactHR = () => {
    if (!contactForm.subject || !contactForm.message) {
      toast.error('Please fill in all fields');
      return;
    }
    contactHRMutation.mutate({
      ...contactForm,
      jobId: selectedJob?.id,
    });
  };

  const renderSkill = (skill, idx) => {
    const skillName = typeof skill === 'string' ? skill : (skill?.name || skill?.skill || JSON.stringify(skill));
    return (
      <span key={idx} className="px-3 py-1 bg-primary-100 text-primary-700 rounded-full text-sm">
        {skillName}
      </span>
    );
  };

  const renderRequirement = (req, idx) => {
    const reqText = typeof req === 'string' ? req : (req?.name || req?.requirement || JSON.stringify(req));
    return <li key={idx}>{reqText}</li>;
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Internal Opportunities</h1>
      </div>

      {/* Search & Filters */}
      <div className="card mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search positions or departments..."
              className="input pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="btn-secondary"
          >
            <FunnelIcon className="h-5 w-5 mr-2" />
            Filters
          </button>
        </div>

        {showFilters && (
          <div className="grid md:grid-cols-3 gap-4 mt-4 pt-4 border-t">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
              <select
                className="input"
                value={filters.department}
                onChange={(e) => setFilters({ ...filters, department: e.target.value })}
              >
                <option value="">All Departments</option>
                {departments.map(dept => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
              <select
                className="input"
                value={filters.location}
                onChange={(e) => setFilters({ ...filters, location: e.target.value })}
              >
                <option value="">All Locations</option>
                {locations.map(loc => (
                  <option key={loc} value={loc}>{loc}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Job Type</label>
              <select
                className="input"
                value={filters.type}
                onChange={(e) => setFilters({ ...filters, type: e.target.value })}
              >
                <option value="">All Types</option>
                <option value="full_time">Full Time</option>
                <option value="part_time">Part Time</option>
                <option value="contract">Contract</option>
              </select>
            </div>
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Jobs List */}
        <div className="space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
            </div>
          ) : filteredJobs.length > 0 ? (
            filteredJobs.map((job) => {
              const isHighlighted = highlightJobId && job.id === highlightJobId;
              return (
              <div
                key={job.id}
                onClick={() => setSelectedJob(job)}
                className={`card cursor-pointer transition-all hover:shadow-md ${
                  selectedJob?.id === job.id ? 'ring-2 ring-primary-500' : ''
                } ${isHighlighted ? 'ring-2 ring-green-400 border-green-300 bg-green-50/50 relative' : ''}`}
              >
                {isHighlighted && (
                  <div className="absolute -top-3 left-4 px-3 py-0.5 bg-green-500 text-white text-xs font-bold rounded-full shadow-md flex items-center gap-1">
                    <CheckCircleIcon className="h-3 w-3" />
                    Strong Match
                  </div>
                )}
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold text-gray-900">{job.title}</h3>
                    <p className="text-sm text-gray-600">{job.department}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {job.application_id && (
                      <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full flex items-center gap-1">
                        <CheckCircleIcon className="h-3 w-3" />
                        Applied
                      </span>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        saveMutation.mutate(job.id);
                      }}
                      className="text-gray-400 hover:text-primary-600"
                    >
                      {savedJobIds.includes(job.id) ? (
                        <BookmarkSolidIcon className="h-5 w-5 text-primary-600" />
                      ) : (
                        <BookmarkIcon className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-3 text-sm text-gray-500">
                  <span className="flex items-center">
                    <MapPinIcon className="h-4 w-4 mr-1" />
                    {job.location || 'Not specified'}
                  </span>
                  <span className="flex items-center">
                    <BriefcaseIcon className="h-4 w-4 mr-1" />
                    {job.job_type?.replace('_', ' ') || 'Full Time'}
                  </span>
                  {job.deadline && (
                    <span className="flex items-center text-orange-600">
                      <CalendarIcon className="h-4 w-4 mr-1" />
                      Deadline: {formatDate(job.deadline)}
                    </span>
                  )}
                </div>

                {job.required_skills && Array.isArray(job.required_skills) && job.required_skills.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {job.required_skills.slice(0, 3).map((skill, idx) => (
                      <span key={idx} className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs">
                        {typeof skill === 'string' ? skill : (skill?.name || skill?.skill || '')}
                      </span>
                    ))}
                    {job.required_skills.length > 3 && (
                      <span className="text-xs text-gray-500">+{job.required_skills.length - 3} more</span>
                    )}
                  </div>
                )}
              </div>
              );
            })
          ) : (
            <div className="card text-center py-12">
              <BriefcaseIcon className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <p className="text-gray-500">No opportunities found</p>
              <p className="text-sm text-gray-400 mt-1">Try adjusting your filters</p>
            </div>
          )}
        </div>

        {/* Job Details Panel */}
        {selectedJob ? (
          <div className="card sticky top-6 max-h-[calc(100vh-8rem)] overflow-y-auto">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{selectedJob.title}</h2>
                <p className="text-primary-600">{selectedJob.department}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => saveMutation.mutate(selectedJob.id)}
                  className="p-2 text-gray-400 hover:text-primary-600 rounded-full hover:bg-gray-100"
                >
                  {savedJobIds.includes(selectedJob.id) ? (
                    <BookmarkSolidIcon className="h-5 w-5 text-primary-600" />
                  ) : (
                    <BookmarkIcon className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>

            {/* Job Meta Info */}
            <div className="grid grid-cols-2 gap-4 mb-4 p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2 text-sm">
                <MapPinIcon className="h-4 w-4 text-gray-500" />
                <span>{selectedJob.location || 'Not specified'}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <BriefcaseIcon className="h-4 w-4 text-gray-500" />
                <span className="capitalize">{selectedJob.job_type?.replace('_', ' ') || 'Full Time'}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <ChartBarIcon className="h-4 w-4 text-gray-500" />
                <span className="capitalize">{selectedJob.experience_level?.replace('_', ' ') || 'Not specified'}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <AcademicCapIcon className="h-4 w-4 text-gray-500" />
                <span className="capitalize">{selectedJob.education_requirement?.replace('_', ' ') || 'Not specified'}</span>
              </div>
              {selectedJob.is_remote && (
                <div className="col-span-2">
                  <span className="inline-flex items-center px-2 py-1 bg-green-100 text-green-800 rounded text-xs">
                    <CheckCircleIcon className="h-3 w-3 mr-1" />
                    Remote Available
                  </span>
                </div>
              )}
            </div>

            {/* Deadline Warning */}
            {selectedJob.deadline && (
              <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded-lg flex items-center gap-2">
                <ExclamationCircleIcon className="h-5 w-5 text-orange-600" />
                <span className="text-sm text-orange-800">
                  Application Deadline: <strong>{formatDate(selectedJob.deadline)}</strong>
                </span>
              </div>
            )}

            {/* Strong Match Banner */}
            {highlightJobId && selectedJob.id === highlightJobId && (
              <div className="mb-4 p-4 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl flex items-center gap-3">
                <div className="bg-green-100 p-2 rounded-lg">
                  <CheckCircleIcon className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <p className="font-semibold text-green-800">Strong Match for Your Profile!</p>
                  <p className="text-sm text-green-700">Based on your skills, education, and experience, this role is a great fit. Consider applying!</p>
                </div>
              </div>
            )}

            {/* Description */}
            <div className="mb-4">
              <h3 className="font-semibold text-gray-900 mb-2">About the Role</h3>
              <p className="text-gray-600 text-sm whitespace-pre-line">{selectedJob.description || 'No description available'}</p>
            </div>

            {/* Requirements */}
            {selectedJob.requirements && Array.isArray(selectedJob.requirements) && selectedJob.requirements.length > 0 && (
              <div className="mb-4">
                <h3 className="font-semibold text-gray-900 mb-2">Requirements</h3>
                <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                  {selectedJob.requirements.map((req, idx) => renderRequirement(req, idx))}
                </ul>
              </div>
            )}

            {/* Responsibilities */}
            {selectedJob.responsibilities && Array.isArray(selectedJob.responsibilities) && selectedJob.responsibilities.length > 0 && (
              <div className="mb-4">
                <h3 className="font-semibold text-gray-900 mb-2">Responsibilities</h3>
                <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                  {selectedJob.responsibilities.map((resp, idx) => (
                    <li key={idx}>{typeof resp === 'string' ? resp : (resp?.name || JSON.stringify(resp))}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Required Skills */}
            {selectedJob.required_skills && Array.isArray(selectedJob.required_skills) && selectedJob.required_skills.length > 0 && (
              <div className="mb-4">
                <h3 className="font-semibold text-gray-900 mb-2">Required Skills</h3>
                <div className="flex flex-wrap gap-2">
                  {selectedJob.required_skills.map((skill, idx) => renderSkill(skill, idx))}
                </div>
              </div>
            )}

            {/* Benefits */}
            {selectedJob.benefits && Array.isArray(selectedJob.benefits) && selectedJob.benefits.length > 0 && (
              <div className="mb-4">
                <h3 className="font-semibold text-gray-900 mb-2">Benefits</h3>
                <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                  {selectedJob.benefits.map((benefit, idx) => (
                    <li key={idx}>{typeof benefit === 'string' ? benefit : (benefit?.name || JSON.stringify(benefit))}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Resume Required Warning */}
            {!hasResume && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
                <DocumentArrowUpIcon className="h-5 w-5 text-red-600 flex-shrink-0" />
                <span className="text-sm text-red-800">
                  You must <strong>upload your resume</strong> in your Profile before you can apply for positions.
                </span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="mt-6 pt-4 border-t flex gap-3">
              <button
                onClick={() => setShowApplyModal(true)}
                disabled={applyMutation.isPending || selectedJob.application_id || !hasResume}
                className={`btn-primary flex-1 ${(selectedJob.application_id || !hasResume) ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {selectedJob.application_id 
                  ? '✓ Already Applied' 
                  : !hasResume
                    ? 'Upload Resume to Apply'
                    : applyMutation.isPending 
                      ? 'Submitting...' 
                      : 'Express Interest'}
              </button>
              <button 
                onClick={() => setShowContactModal(true)}
                className="btn-secondary flex items-center gap-2"
              >
                <EnvelopeIcon className="h-4 w-4" />
                Contact HR
              </button>
            </div>
          </div>
        ) : (
          <div className="card flex items-center justify-center h-96">
            <div className="text-center text-gray-500">
              <BriefcaseIcon className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <p>Select a position to view details</p>
            </div>
          </div>
        )}
      </div>

      {/* Apply Modal */}
      {showApplyModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-lg w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Express Interest</h3>
              <button onClick={() => setShowApplyModal(false)} className="text-gray-400 hover:text-gray-600">
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
            
            <p className="text-gray-600 mb-4">
              You are applying for: <strong>{selectedJob?.title}</strong>
            </p>
            
            <div className="flex gap-3">
              <button
                onClick={handleApply}
                disabled={applyMutation.isPending}
                className="btn-primary flex-1"
              >
                {applyMutation.isPending ? 'Submitting...' : 'Submit Application'}
              </button>
              <button onClick={() => setShowApplyModal(false)} className="btn-secondary">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Contact HR Modal */}
      {showContactModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-lg w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Contact HR</h3>
              <button onClick={() => setShowContactModal(false)} className="text-gray-400 hover:text-gray-600">
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
            
            {selectedJob && (
              <p className="text-gray-600 mb-4 text-sm">
                Regarding: <strong>{selectedJob.title}</strong>
              </p>
            )}
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                <input
                  type="text"
                  value={contactForm.subject}
                  onChange={(e) => setContactForm({ ...contactForm, subject: e.target.value })}
                  className="input"
                  placeholder="e.g., Question about the position"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
                <textarea
                  value={contactForm.message}
                  onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })}
                  rows={5}
                  className="input"
                  placeholder="Type your message here..."
                />
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={handleContactHR}
                disabled={contactHRMutation.isPending}
                className="btn-primary flex-1"
              >
                {contactHRMutation.isPending ? 'Sending...' : 'Send Message'}
              </button>
              <button onClick={() => setShowContactModal(false)} className="btn-secondary">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InternalOpportunities;
