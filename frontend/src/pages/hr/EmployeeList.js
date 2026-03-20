import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import {
  UserIcon,
  EnvelopeIcon,
  BriefcaseIcon,
  AcademicCapIcon,
  MagnifyingGlassIcon,
  StarIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { employeesAPI } from '../../services/api';

const getFileUrl = (url) => {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return `http://localhost:5000${url}`;
};

const EmployeeList = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const matchJobId = searchParams.get('matchJobId');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ department: '' });

  const { data: employees, isLoading } = useQuery({
    queryKey: ['employees', filters, search, matchJobId],
    queryFn: () => employeesAPI.getAll({ ...filters, search, ...(matchJobId ? { matchJobId } : {}) }),
  });

  const clearMatchFilter = () => {
    searchParams.delete('matchJobId');
    setSearchParams(searchParams);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const employeeList = employees?.data?.employees || employees?.data || [];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Employees</h1>
      </div>

      {/* Job Match Banner */}
      {matchJobId && (
        <div className="mb-6 bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-100 p-2 rounded-lg">
              <StarIcon className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <p className="font-semibold text-indigo-900">Showing Job Match Results</p>
              <p className="text-sm text-indigo-700">Employees are highlighted based on how well they match the published job. Match scores reflect skills, education, and experience.</p>
            </div>
          </div>
          <button
            onClick={clearMatchFilter}
            className="text-indigo-600 hover:text-indigo-800 p-1.5 rounded-lg hover:bg-indigo-100 transition-colors"
            title="Clear match filter"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="card mb-6">
        <div className="flex flex-wrap gap-4">
          <div className="relative flex-1 min-w-[200px]">
            <MagnifyingGlassIcon className="h-5 w-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search employees..."
              className="input-field pl-10"
            />
          </div>
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
            <option value="Administration">Administration</option>
          </select>
        </div>
      </div>

      {/* Employee Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {employeeList.map((employee) => {
          const isMatched = matchJobId && employee.overall_match_score > 0;
          const matchScore = Math.round(employee.overall_match_score || 0);
          const matchColor = matchScore >= 70 ? 'green' : matchScore >= 50 ? 'yellow' : 'gray';
          const borderClass = isMatched
            ? matchScore >= 70
              ? 'ring-2 ring-green-400 border-green-300'
              : matchScore >= 50
              ? 'ring-2 ring-yellow-400 border-yellow-300'
              : 'ring-2 ring-blue-300 border-blue-200'
            : '';

          return (
            <div key={employee.id} className={`card hover:shadow-lg transition-all ${borderClass} ${isMatched ? 'relative' : ''}`}>
              {/* Match Score Badge */}
              {isMatched && (
                <div className={`absolute -top-3 -right-3 px-3 py-1 rounded-full text-xs font-bold shadow-md ${
                  matchColor === 'green' ? 'bg-green-500 text-white' :
                  matchColor === 'yellow' ? 'bg-yellow-500 text-white' :
                  'bg-blue-500 text-white'
                }`}>
                  {matchScore}% Match
                </div>
              )}

              <div className="flex items-start gap-4">
                <div className="w-16 h-16 rounded-full bg-primary-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                  {employee.photo_url ? (
                    <img
                      src={getFileUrl(employee.photo_url)}
                      alt={employee.first_name}
                      className="w-16 h-16 rounded-full object-cover"
                    />
                  ) : (
                    <UserIcon className="h-8 w-8 text-primary-600" />
                  )}
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">{employee.first_name} {employee.last_name}</h3>
                  <p className="text-primary-600">{employee.job_title}</p>
                  <p className="text-sm text-gray-600">{employee.department}</p>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t space-y-2">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <EnvelopeIcon className="h-4 w-4" />
                  <span>{employee.email}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <BriefcaseIcon className="h-4 w-4" />
                  <span>{employee.hire_date ? Math.floor((new Date() - new Date(employee.hire_date)) / (365.25 * 24 * 60 * 60 * 1000)) : 0} years at company</span>
                </div>
                {employee.skills?.length > 0 && (
                  <div className="flex items-start gap-2 text-sm text-gray-600">
                    <AcademicCapIcon className="h-4 w-4 mt-0.5" />
                    <div className="flex flex-wrap gap-1">
                      {employee.skills.slice(0, 3).map((skill, idx) => (
                        <span key={idx} className="px-2 py-0.5 bg-gray-100 rounded-full text-xs">
                          {skill.name}
                        </span>
                      ))}
                      {employee.skills.length > 3 && (
                        <span className="text-xs text-gray-500">+{employee.skills.length - 3} more</span>
                      )}
                    </div>
                  </div>
                )}

                {/* Skill Gaps for matched employees */}
                {isMatched && employee.skill_gaps && (() => {
                  const gaps = typeof employee.skill_gaps === 'string' ? JSON.parse(employee.skill_gaps) : employee.skill_gaps;
                  return gaps.length > 0 ? (
                    <div className="mt-2 p-2 bg-orange-50 rounded-lg">
                      <p className="text-xs font-medium text-orange-700 mb-1">Skill Gaps:</p>
                      <div className="flex flex-wrap gap-1">
                        {gaps.slice(0, 3).map((gap, idx) => (
                          <span key={idx} className="px-2 py-0.5 bg-orange-100 text-orange-800 rounded-full text-xs">{gap}</span>
                        ))}
                        {gaps.length > 3 && <span className="text-xs text-orange-600">+{gaps.length - 3} more</span>}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 p-2 bg-green-50 rounded-lg">
                      <p className="text-xs font-medium text-green-700">Has all required skills!</p>
                    </div>
                  );
                })()}
              </div>

              <div className="mt-4 pt-4 border-t flex justify-between items-center">
                <Link
                  to={`/hr/employees/${employee.id}`}
                  className="text-primary-600 hover:text-primary-700 text-sm font-medium"
                >
                  View Profile &rarr;
                </Link>
                {employee.internal_mobility_interest && (
                  <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs">
                    Open to mobility
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {employeeList.length === 0 ? (
        <div className="text-center py-12">
          <UserIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No employees found</h3>
          <p className="mt-1 text-sm text-gray-500">Try adjusting your search or filters.</p>
        </div>
      ) : null}
    </div>
  );
};

export default EmployeeList;
