import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { PlusIcon, PencilIcon, TrashIcon, EyeIcon, ShareIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { jobsAPI } from '../../services/api';

const JobList = () => {
  const [filters, setFilters] = useState({ status: '', department: '' });
  const queryClient = useQueryClient();

  const { data: jobsResponse, isLoading } = useQuery({
    queryKey: ['jobs', filters],
    queryFn: () => jobsAPI.getAll(filters),
  });

  // Extract jobs array from response
  const jobs = jobsResponse?.data?.jobs || jobsResponse?.data || [];

  const deleteMutation = useMutation({
    mutationFn: (id) => jobsAPI.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['jobs']);
      toast.success('Job deleted successfully');
    },
    onError: () => toast.error('Failed to delete job'),
  });

  const publishMutation = useMutation({
    mutationFn: (id) => jobsAPI.publish(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['jobs']);
      toast.success('Job published successfully');
    },
    onError: () => toast.error('Failed to publish job'),
  });

  const getStatusBadge = (status) => {
    const styles = {
      draft: 'bg-gray-100 text-gray-800',
      published: 'bg-green-100 text-green-800',
      closed: 'bg-red-100 text-red-800',
      paused: 'bg-yellow-100 text-yellow-800',
    };
    return styles[status] || styles.draft;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Job Postings</h1>
          <p className="text-gray-600">Manage your job openings</p>
        </div>
        <Link to="/hr/jobs/new" className="btn-primary flex items-center">
          <PlusIcon className="h-5 w-5 mr-2" />
          Create Job
        </Link>
      </div>

      {/* Filters */}
      <div className="card mb-6">
        <div className="flex flex-wrap gap-4">
          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            className="input-field w-auto"
          >
            <option value="">All Status</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="closed">Closed</option>
            <option value="paused">Paused</option>
          </select>
          <select
            value={filters.department}
            onChange={(e) => setFilters({ ...filters, department: e.target.value })}
            className="input-field w-auto"
          >
            <option value="">All Departments</option>
            <option value="Engineering">Engineering</option>
            <option value="Sales">Sales</option>
            <option value="Marketing">Marketing</option>
            <option value="HR">HR</option>
            <option value="Finance">Finance</option>
          </select>
        </div>
      </div>

      {/* Jobs Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Job Title</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Department</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Applications</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Posted</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {(Array.isArray(jobs) ? jobs : []).map((job) => (
                <tr key={job.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Link to={`/hr/jobs/${job.id}`} className="text-primary-600 hover:text-primary-700 font-medium">
                      {job.title}
                    </Link>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-gray-600">{job.department}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-gray-600">{job.location}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-gray-600">{job.application_count || 0}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(job.status)}`}>
                      {job.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-gray-600">
                    {new Date(job.created_at || job.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="flex justify-end space-x-2">
                      <Link to={`/hr/jobs/${job.id}`} className="text-gray-600 hover:text-primary-600">
                        <EyeIcon className="h-5 w-5" />
                      </Link>
                      <Link to={`/hr/jobs/${job.id}/edit`} className="text-gray-600 hover:text-primary-600">
                        <PencilIcon className="h-5 w-5" />
                      </Link>
                      {job.status === 'draft' && (
                        <button
                          onClick={() => publishMutation.mutate(job.id)}
                          className="text-gray-600 hover:text-green-600"
                          title="Publish"
                        >
                          <ShareIcon className="h-5 w-5" />
                        </button>
                      )}
                      <button
                        onClick={() => {
                          if (window.confirm('Are you sure you want to delete this job?')) {
                            deleteMutation.mutate(job.id);
                          }
                        }}
                        className="text-gray-600 hover:text-red-600"
                      >
                        <TrashIcon className="h-5 w-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(!jobs || jobs.length === 0) && (
            <div className="text-center py-12">
              <BriefcaseIcon className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No jobs found</h3>
              <p className="mt-1 text-sm text-gray-500">Get started by creating a new job posting.</p>
              <div className="mt-6">
                <Link to="/hr/jobs/new" className="btn-primary">
                  <PlusIcon className="h-5 w-5 mr-2 inline" />
                  Create Job
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const BriefcaseIcon = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008H12v-.008z" />
  </svg>
);

export default JobList;
