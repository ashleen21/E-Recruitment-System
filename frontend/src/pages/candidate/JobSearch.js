import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  MagnifyingGlassIcon,
  MapPinIcon,
  BriefcaseIcon,
  AdjustmentsHorizontalIcon,
  ClockIcon,
  BookmarkIcon,
  SparklesIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { jobsAPI, applicationsAPI, resumeAPI } from '../../services/api';

const JobSearch = () => {
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({
    location: '',
    employmentType: '',
    experienceLevel: '',
    department: '',
  });
  const [selectedJob, setSelectedJob] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showResumeModal, setShowResumeModal] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: jobs, isLoading } = useQuery({
    queryKey: ['jobs', search, filters],
    queryFn: () => jobsAPI.getAll({ search, ...filters, status: 'published' }),
  });

  // Fetch user's resume status
  const { data: resumes } = useQuery({
    queryKey: ['my-resumes'],
    queryFn: () => resumeAPI.getAll(),
    staleTime: 60000, // Cache for 1 minute
  });

  const hasResume = resumes?.data?.length > 0;

  const applyMutation = useMutation({
    mutationFn: (data) => applicationsAPI.apply(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['jobs']);
      queryClient.invalidateQueries(['my-applications']);
      setSelectedJob(prev => prev ? { ...prev, has_applied: true } : null);
      toast.success('Application submitted successfully!');
    },
    onError: (error) => toast.error(error.response?.data?.error || 'Failed to apply'),
  });

  const handleApply = (jobId) => {
    // Check if user has uploaded a resume
    if (!hasResume) {
      setShowResumeModal(true);
      return;
    }
    applyMutation.mutate({ job_id: jobId });
  };

  const goToProfile = () => {
    setShowResumeModal(false);
    navigate('/candidate/profile');
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Find Your Dream Job</h1>
      </div>

      {/* Search Bar */}
      <div className="card mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="h-5 w-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search jobs, skills, or companies..."
              className="input-field pl-10"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="btn-secondary flex items-center justify-center"
          >
            <AdjustmentsHorizontalIcon className="h-5 w-5 mr-2" />
            Filters
          </button>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4 pt-4 border-t">
            <select
              value={filters.location}
              onChange={(e) => setFilters({ ...filters, location: e.target.value })}
              className="input-field"
            >
              <option value="">All Locations</option>
              <option value="remote">Remote</option>
              <option value="new_york">New York</option>
              <option value="san_francisco">San Francisco</option>
              <option value="chicago">Chicago</option>
            </select>
            <select
              value={filters.employmentType}
              onChange={(e) => setFilters({ ...filters, employmentType: e.target.value })}
              className="input-field"
            >
              <option value="">All Types</option>
              <option value="full_time">Full Time</option>
              <option value="part_time">Part Time</option>
              <option value="contract">Contract</option>
              <option value="internship">Internship</option>
            </select>
            <select
              value={filters.experienceLevel}
              onChange={(e) => setFilters({ ...filters, experienceLevel: e.target.value })}
              className="input-field"
            >
              <option value="">All Levels</option>
              <option value="entry">Entry Level</option>
              <option value="mid">Mid Level</option>
              <option value="senior">Senior Level</option>
              <option value="lead">Lead / Principal</option>
            </select>
            <select
              value={filters.department}
              onChange={(e) => setFilters({ ...filters, department: e.target.value })}
              className="input-field"
            >
              <option value="">All Departments</option>
              <option value="Engineering">Engineering</option>
              <option value="Sales">Sales</option>
              <option value="Marketing">Marketing</option>
              <option value="HR">HR</option>
              <option value="Finance">Finance</option>
            </select>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Job List */}
        <div className="lg:col-span-1 space-y-4">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-600">{jobs?.data?.jobs?.length || 0} jobs found</p>
              {(jobs?.data?.jobs || []).map((job) => (
                <div
                  key={job.id}
                  onClick={() => setSelectedJob(job)}
                  className={`card cursor-pointer transition-all ${
                    selectedJob?.id === job.id ? 'ring-2 ring-primary-500' : 'hover:shadow-lg'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-semibold text-gray-900">{job.title}</h3>
                      <p className="text-primary-600">{job.company || 'Company'}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {job.has_applied && (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">
                          Applied
                        </span>
                      )}
                      {job.matchScore && (
                        <span className="flex items-center text-green-600 text-sm">
                          <SparklesIcon className="h-4 w-4 mr-1" />
                          {job.matchScore}%
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-sm text-gray-600">
                    <span className="flex items-center">
                      <MapPinIcon className="h-4 w-4 mr-1" />
                      {job.location}
                    </span>
                    <span className="flex items-center">
                      <BriefcaseIcon className="h-4 w-4 mr-1" />
                      {(job.job_type || job.employmentType)?.replace(/_/g, ' ')}
                    </span>
                    {(job.experience_level || job.experienceLevel) && (
                      <span className="flex items-center">
                        {(job.experience_level || job.experienceLevel)?.replace(/_/g, ' ')}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-gray-500">
                    Posted {new Date(job.created_at || job.createdAt).toLocaleDateString()}
                  </p>
                </div>
              ))}
              {jobs?.data?.length === 0 && (
                <div className="text-center py-12">
                  <BriefcaseIcon className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-500">No jobs found matching your criteria</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Job Details */}
        <div className="lg:col-span-2">
          {selectedJob ? (
            <div className="card sticky top-4">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">{selectedJob.title}</h2>
                  <p className="text-lg text-primary-600">{selectedJob.company || 'Company'}</p>
                </div>
                <button className="p-2 text-gray-400 hover:text-primary-600">
                  <BookmarkIcon className="h-6 w-6" />
                </button>
              </div>

              <div className="flex flex-wrap gap-4 mb-6 text-sm">
                <span className="flex items-center text-gray-600">
                  <MapPinIcon className="h-5 w-5 mr-1" />
                  {selectedJob.location}
                </span>
                <span className="flex items-center text-gray-600">
                  <BriefcaseIcon className="h-5 w-5 mr-1" />
                  {(selectedJob.job_type || selectedJob.employmentType)?.replace(/_/g, ' ')}
                </span>
                {(selectedJob.closes_at || selectedJob.closesAt) && (
                  <span className="flex items-center text-gray-600">
                    <ClockIcon className="h-5 w-5 mr-1" />
                    Deadline: {new Date(selectedJob.closes_at || selectedJob.closesAt).toLocaleDateString()}
                  </span>
                )}
              </div>

              {/* Additional Job Details */}
              <div className="grid grid-cols-2 gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
                {(selectedJob.experience_level || selectedJob.experienceLevel) && (
                  <div>
                    <p className="text-xs text-gray-500 uppercase">Experience Level</p>
                    <p className="font-medium text-gray-900 capitalize">
                      {(selectedJob.experience_level || selectedJob.experienceLevel)?.replace(/_/g, ' ')}
                    </p>
                  </div>
                )}
                {(selectedJob.min_experience_years || selectedJob.minExperienceYears) && (
                  <div>
                    <p className="text-xs text-gray-500 uppercase">Years of Experience</p>
                    <p className="font-medium text-gray-900">
                      {selectedJob.min_experience_years || selectedJob.minExperienceYears}+ years
                    </p>
                  </div>
                )}
                {(selectedJob.job_type || selectedJob.employmentType) && (
                  <div>
                    <p className="text-xs text-gray-500 uppercase">Contract Type</p>
                    <p className="font-medium text-gray-900 capitalize">
                      {(selectedJob.job_type || selectedJob.employmentType)?.replace(/_/g, ' ')}
                    </p>
                  </div>
                )}
                {selectedJob.department && (
                  <div>
                    <p className="text-xs text-gray-500 uppercase">Department</p>
                    <p className="font-medium text-gray-900">{selectedJob.department}</p>
                  </div>
                )}
              </div>

              <div className="flex gap-3 mb-6">
                <button
                  onClick={() => handleApply(selectedJob.id)}
                  disabled={applyMutation.isPending || selectedJob.has_applied}
                  className="btn-primary flex-1 disabled:opacity-50"
                >
                  {applyMutation.isPending
                    ? 'Applying...'
                    : selectedJob.has_applied
                    ? 'Already Applied'
                    : 'Apply Now'}
                </button>
                <button className="btn-secondary">
                  <BookmarkIcon className="h-5 w-5" />
                </button>
              </div>

              {selectedJob.matchScore && (
                <div className="mb-6 p-4 bg-green-50 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <SparklesIcon className="h-5 w-5 text-green-600" />
                    <span className="font-medium text-green-800">AI Match Score: {selectedJob.matchScore}%</span>
                  </div>
                  <p className="text-sm text-green-700">
                    Based on your skills and experience, you're a strong match for this position.
                  </p>
                </div>
              )}

              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Job Description</h3>
                  <div className="prose max-w-none text-gray-700 whitespace-pre-wrap">
                    {selectedJob.description}
                  </div>
                </div>

                {selectedJob.requirements?.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">Requirements</h3>
                    <ul className="space-y-2">
                      {selectedJob.requirements.map((req, idx) => (
                        <li key={idx} className="flex items-start">
                          <span className="text-primary-600 mr-2">•</span>
                          <span className="text-gray-700">{req}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {(selectedJob.required_skills || selectedJob.skills)?.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">Required Skills</h3>
                    <div className="flex flex-wrap gap-2">
                      {(selectedJob.required_skills || selectedJob.skills || []).map((skill, idx) => (
                        <span key={idx} className="px-3 py-1 bg-primary-100 text-primary-800 rounded-full text-sm">
                          {typeof skill === 'string' ? skill : skill.name || skill}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {(selectedJob.application_deadline || selectedJob.applicationDeadline) && (
                  <div className="p-4 bg-yellow-50 rounded-lg">
                    <p className="text-yellow-800 font-medium">
                      ⏰ Application Deadline: {new Date(selectedJob.application_deadline || selectedJob.applicationDeadline).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    </p>
                    {new Date(selectedJob.application_deadline || selectedJob.applicationDeadline) < new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) && (
                      <p className="text-sm text-yellow-700 mt-1">Deadline approaching soon!</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="card text-center py-16">
              <BriefcaseIcon className="h-16 w-16 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Select a job to view details</h3>
              <p className="text-gray-500">Click on a job from the list to see full details</p>
            </div>
          )}
        </div>
      </div>

      {/* Resume Required Modal */}
      {showResumeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-14 w-14 rounded-full bg-yellow-100 mb-4">
                <ExclamationTriangleIcon className="h-7 w-7 text-yellow-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Resume Required</h3>
              <p className="text-gray-600 mb-6">
                Please upload your resume before applying for jobs. A resume helps employers
                understand your qualifications and increases your chances of getting hired.
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => setShowResumeModal(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={goToProfile}
                  className="btn-primary flex items-center"
                >
                  <DocumentTextIcon className="h-5 w-5 mr-2" />
                  Upload Resume
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default JobSearch;
