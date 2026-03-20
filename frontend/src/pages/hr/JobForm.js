import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { XMarkIcon, PlusIcon } from '@heroicons/react/24/outline';
import { jobsAPI, skillsAPI } from '../../services/api';

const JobForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [skills, setSkills] = useState([]);
  const [skillInput, setSkillInput] = useState('');
  const [requirements, setRequirements] = useState([]);
  const [requirementInput, setRequirementInput] = useState('');

  const { register, handleSubmit, setValue, formState: { errors } } = useForm();

  const { data: job, isLoading } = useQuery({
    queryKey: ['job', id],
    queryFn: () => jobsAPI.getById(id),
    enabled: !!id,
  });

  const { data: skillSuggestions } = useQuery({
    queryKey: ['skill-suggestions', skillInput],
    queryFn: () => skillsAPI.search(skillInput),
    enabled: skillInput.length > 2,
  });

  useEffect(() => {
    if (job?.data) {
      const jobData = job.data;
      setValue('title', jobData.title);
      setValue('department', jobData.department);
      setValue('location', jobData.location);
      setValue('employmentType', jobData.job_type || jobData.employmentType);
      setValue('experienceLevel', jobData.experience_level || jobData.experienceLevel);
      setValue('minExperienceYears', jobData.min_experience_years || jobData.minExperienceYears || '');
      setValue('maxExperienceYears', jobData.max_experience_years || jobData.maxExperienceYears || '');
      setValue('description', jobData.description);
      setValue('applicationDeadline', (jobData.closes_at || jobData.applicationDeadline)?.split('T')[0]);
      
      // Handle skills - they can be objects or strings
      const skillsData = jobData.skills || [];
      setSkills(skillsData.map(s => typeof s === 'object' ? s.name : s));
      
      // Handle requirements - can be array or JSON string
      let reqData = jobData.requirements || [];
      if (typeof reqData === 'string') {
        try { reqData = JSON.parse(reqData); } catch (e) { reqData = []; }
      }
      setRequirements(Array.isArray(reqData) ? reqData : []);
    }
  }, [job, setValue]);

  const createMutation = useMutation({
    mutationFn: (data) => jobsAPI.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['jobs']);
      toast.success('Job created successfully');
      navigate('/hr/jobs');
    },
    onError: (error) => toast.error(error.response?.data?.error || 'Failed to create job'),
  });

  const updateMutation = useMutation({
    mutationFn: (data) => jobsAPI.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['jobs']);
      queryClient.invalidateQueries(['job', id]);
      toast.success('Job updated successfully');
      navigate('/hr/jobs');
    },
    onError: (error) => {
      console.error('Update error:', error.response?.data);
      toast.error(error.response?.data?.details || error.response?.data?.error || 'Failed to update job');
    },
  });

  const onSubmit = (data) => {
    const jobData = {
      title: data.title,
      department: data.department,
      location: data.location,
      job_type: data.employmentType,
      experience_level: data.experienceLevel,
      min_experience_years: data.minExperienceYears ? parseInt(data.minExperienceYears) : null,
      max_experience_years: data.maxExperienceYears ? parseInt(data.maxExperienceYears) : null,
      description: data.description,
      requirements: requirements,
      required_skills: skills.map(s => ({ name: s })),
      closes_at: data.applicationDeadline || null,
    };

    if (id) {
      updateMutation.mutate(jobData);
    } else {
      createMutation.mutate(jobData);
    }
  };

  const addSkill = (skill) => {
    if (skill && !skills.includes(skill)) {
      setSkills([...skills, skill]);
    }
    setSkillInput('');
  };

  const removeSkill = (skillToRemove) => {
    setSkills(skills.filter(s => s !== skillToRemove));
  };

  const addRequirement = () => {
    if (requirementInput.trim()) {
      setRequirements([...requirements, requirementInput.trim()]);
      setRequirementInput('');
    }
  };

  const removeRequirement = (index) => {
    setRequirements(requirements.filter((_, i) => i !== index));
  };

  if (isLoading && id) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {id ? 'Edit Job' : 'Create New Job'}
        </h1>
        <p className="text-gray-600">
          {id ? 'Update the job posting details' : 'Fill in the details for the new job posting'}
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Basic Information */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Job Title *</label>
              <input
                type="text"
                {...register('title', { required: 'Job title is required' })}
                className="input-field"
                placeholder="e.g., Senior Software Engineer"
              />
              {errors.title && <p className="text-red-500 text-sm mt-1">{errors.title.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Department *</label>
              <select {...register('department', { required: 'Department is required' })} className="input-field">
                <option value="">Select department</option>
                <option value="Engineering">Engineering</option>
                <option value="Sales">Sales</option>
                <option value="Marketing">Marketing</option>
                <option value="HR">HR</option>
                <option value="Finance">Finance</option>
                <option value="Operations">Operations</option>
                <option value="Product">Product</option>
                <option value="Design">Design</option>
              </select>
              {errors.department && <p className="text-red-500 text-sm mt-1">{errors.department.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Location *</label>
              <input
                type="text"
                {...register('location', { required: 'Location is required' })}
                className="input-field"
                placeholder="e.g., Harare"
              />
              {errors.location && <p className="text-red-500 text-sm mt-1">{errors.location.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Employment Type *</label>
              <select {...register('employmentType', { required: 'Employment type is required' })} className="input-field">
                <option value="">Select type</option>
                <option value="full_time">Full Time</option>
                <option value="part_time">Part Time</option>
                <option value="contract">Contract</option>
                <option value="internship">Internship</option>
              </select>
              {errors.employmentType && <p className="text-red-500 text-sm mt-1">{errors.employmentType.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Experience Level *</label>
              <select {...register('experienceLevel', { required: 'Experience level is required' })} className="input-field">
                <option value="">Select level</option>
                <option value="entry">Entry Level</option>
                <option value="mid">Mid Level</option>
                <option value="senior">Senior Level</option>
                <option value="lead">Lead / Principal</option>
                <option value="executive">Executive</option>
              </select>
              {errors.experienceLevel && <p className="text-red-500 text-sm mt-1">{errors.experienceLevel.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Min Experience (Years)</label>
              <input
                type="number"
                min="0"
                {...register('minExperienceYears')}
                className="input-field"
                placeholder="e.g., 2"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Experience (Years)</label>
              <input
                type="number"
                min="0"
                {...register('maxExperienceYears')}
                className="input-field"
                placeholder="e.g., 5"
              />
            </div>
          </div>
        </div>

        {/* Description */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Job Description</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
            <textarea
              {...register('description', { required: 'Description is required' })}
              rows={6}
              className="input-field"
              placeholder="Describe the role, responsibilities, and what makes it a great opportunity..."
            />
            {errors.description && <p className="text-red-500 text-sm mt-1">{errors.description.message}</p>}
          </div>
        </div>

        {/* Skills */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Required Skills</h2>
          <div className="relative">
            <input
              type="text"
              value={skillInput}
              onChange={(e) => setSkillInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSkill(skillInput))}
              className="input-field"
              placeholder="Type to search or add skills..."
            />
            {skillSuggestions?.data?.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-60 overflow-auto">
                {skillSuggestions.data.map((suggestion) => (
                  <button
                    key={suggestion.id}
                    type="button"
                    onClick={() => addSkill(suggestion.name)}
                    className="w-full px-4 py-2 text-left hover:bg-gray-100"
                  >
                    {suggestion.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            {skills.map((skill, idx) => (
              <span key={idx} className="inline-flex items-center px-3 py-1 bg-primary-100 text-primary-800 rounded-full text-sm">
                {skill}
                <button type="button" onClick={() => removeSkill(skill)} className="ml-2">
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </span>
            ))}
          </div>
        </div>

        {/* Requirements */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Requirements</h2>
          <div className="flex gap-2">
            <input
              type="text"
              value={requirementInput}
              onChange={(e) => setRequirementInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addRequirement())}
              className="input-field flex-1"
              placeholder="Add a requirement..."
            />
            <button type="button" onClick={addRequirement} className="btn-secondary">
              <PlusIcon className="h-5 w-5" />
            </button>
          </div>
          <ul className="mt-3 space-y-2">
            {requirements.map((req, idx) => (
              <li key={idx} className="flex items-center justify-between bg-gray-50 px-4 py-2 rounded-lg">
                <span className="text-gray-700">{req}</span>
                <button type="button" onClick={() => removeRequirement(idx)} className="text-red-600 hover:text-red-700">
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Application Deadline */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Application Deadline</h2>
          <div className="max-w-xs">
            <input type="date" {...register('applicationDeadline')} className="input-field" />
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-4">
          <button type="button" onClick={() => navigate('/hr/jobs')} className="btn-secondary">
            Cancel
          </button>
          <button
            type="submit"
            disabled={createMutation.isPending || updateMutation.isPending}
            className="btn-primary disabled:opacity-50"
          >
            {createMutation.isPending || updateMutation.isPending ? 'Saving...' : id ? 'Update Job' : 'Create Job'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default JobForm;
