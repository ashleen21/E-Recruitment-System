import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import {
  UserCircleIcon,
  PlusIcon,
  TrashIcon,
  PencilIcon,
  DocumentArrowUpIcon,
  PhotoIcon,
  AcademicCapIcon,
  BookOpenIcon,
  BriefcaseIcon,
  CalendarIcon,
  IdentificationIcon,
  MapPinIcon,
  PhoneIcon,
  EnvelopeIcon,
  XMarkIcon,
  ArrowDownTrayIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';
import { employeesAPI, skillsAPI } from '../../services/api';

const EmployeeProfile = () => {
  const queryClient = useQueryClient();
  const [editMode, setEditMode] = useState(false);
  const [activeTab, setActiveTab] = useState('personal');
  const [showAddSkillModal, setShowAddSkillModal] = useState(false);
  const [showAddCertModal, setShowAddCertModal] = useState(false);
  const [showAddTrainingModal, setShowAddTrainingModal] = useState(false);
  const [newSkill, setNewSkill] = useState({ skill_name: '', proficiency_level: 'intermediate', years_of_experience: 1 });
  const [newCert, setNewCert] = useState({ name: '', issuing_organization: '', issue_date: '', expiry_date: '', credential_id: '', credential_url: '', uploadType: 'url' });
  const [newTraining, setNewTraining] = useState({ training_name: '', provider: '', completion_date: '', certificate_url: '', description: '', uploadType: 'url' });
  const [certFile, setCertFile] = useState(null);
  const [trainingFile, setTrainingFile] = useState(null);
  const [parsedResumeData, setParsedResumeData] = useState(null);
  
  const photoInputRef = useRef(null);
  const resumeInputRef = useRef(null);
  const certFileInputRef = useRef(null);
  const trainingFileInputRef = useRef(null);

  const { data: profile, isLoading } = useQuery({
    queryKey: ['employee-profile'],
    queryFn: async () => {
      const response = await employeesAPI.getProfile();
      return response.data;
    },
  });

  const { data: resumeData, refetch: refetchResume } = useQuery({
    queryKey: ['employee-resume'],
    queryFn: async () => {
      const response = await employeesAPI.getResume();
      // Set parsed data if available
      if (response.data?.parsed_data) {
        setParsedResumeData(response.data.parsed_data);
      }
      return response.data;
    },
  });

  const { data: allSkills } = useQuery({
    queryKey: ['skills'],
    queryFn: async () => {
      const response = await skillsAPI.getCategories();
      return response.data;
    },
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm();

  React.useEffect(() => {
    if (profile) {
      reset(profile);
    }
  }, [profile, reset]);

  const updateProfileMutation = useMutation({
    mutationFn: (data) => employeesAPI.updateProfile(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['employee-profile']);
      toast.success('Profile updated successfully!');
      setEditMode(false);
    },
    onError: () => {
      toast.error('Failed to update profile');
    },
  });

  const uploadPhotoMutation = useMutation({
    mutationFn: (file) => employeesAPI.uploadPhoto(file),
    onSuccess: () => {
      queryClient.invalidateQueries(['employee-profile']);
      toast.success('Photo uploaded successfully!');
    },
    onError: () => {
      toast.error('Failed to upload photo');
    },
  });

  const uploadResumeMutation = useMutation({
    mutationFn: (file) => employeesAPI.uploadResume(file),
    onSuccess: (response) => {
      queryClient.invalidateQueries(['employee-resume']);
      queryClient.invalidateQueries(['employee-profile']);
      queryClient.invalidateQueries(['notifications']);
      // Set parsed data from upload response
      if (response.data?.parsedData) {
        setParsedResumeData(response.data.parsedData);
      }
      const addedSkills = response.data?.addedSkills || [];
      const addedCerts = response.data?.addedCerts || [];
      const extractedInfo = response.data?.extractedInfo;
      
      let message = 'Resume uploaded and AI-parsed!';
      if (addedSkills.length > 0) {
        message += ` ${addedSkills.length} skills auto-added: ${addedSkills.slice(0, 5).join(', ')}${addedSkills.length > 5 ? '...' : ''}.`;
      }
      if (addedCerts.length > 0) {
        message += ` ${addedCerts.length} certification(s) found.`;
      }
      if (extractedInfo?.personalInfo) {
        message += ' Profile updated with extracted info.';
      }
      toast.success(message, { duration: 6000 });
    },
    onError: () => {
      toast.error('Failed to upload resume');
    },
  });

  const addSkillMutation = useMutation({
    mutationFn: (data) => employeesAPI.addSkill(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['employee-profile']);
      toast.success('Skill added successfully!');
      setShowAddSkillModal(false);
      setNewSkill({ skill_name: '', proficiency_level: 'intermediate', years_of_experience: 1 });
    },
    onError: () => {
      toast.error('Failed to add skill');
    },
  });

  const deleteSkillMutation = useMutation({
    mutationFn: (skillId) => employeesAPI.deleteSkill(skillId),
    onSuccess: () => {
      queryClient.invalidateQueries(['employee-profile']);
      toast.success('Skill removed successfully!');
    },
    onError: () => {
      toast.error('Failed to remove skill');
    },
  });

  const addCertMutation = useMutation({
    mutationFn: async (data) => {
      // If file upload type and file selected, upload first
      if (data.uploadType === 'file' && certFile) {
        const uploadResponse = await employeesAPI.uploadCertificationFile(certFile);
        data.credential_url = uploadResponse.data.fileUrl;
        // Show AI extraction results if available
        const addedSkills = uploadResponse.data?.addedSkills || [];
        if (addedSkills.length > 0) {
          toast.success(`AI extracted ${addedSkills.length} skills from certificate: ${addedSkills.slice(0, 4).join(', ')}${addedSkills.length > 4 ? '...' : ''}`, { duration: 5000 });
        }
      }
      return employeesAPI.addCertification(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['employee-profile']);
      queryClient.invalidateQueries(['notifications']);
      toast.success('Certification added successfully!');
      setShowAddCertModal(false);
      setNewCert({ name: '', issuing_organization: '', issue_date: '', expiry_date: '', credential_id: '', credential_url: '', uploadType: 'url' });
      setCertFile(null);
    },
    onError: () => {
      toast.error('Failed to add certification');
    },
  });

  const deleteCertMutation = useMutation({
    mutationFn: (id) => employeesAPI.deleteCertification(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['employee-profile']);
      toast.success('Certification removed successfully!');
    },
    onError: () => {
      toast.error('Failed to remove certification');
    },
  });

  const addTrainingMutation = useMutation({
    mutationFn: async (data) => {
      // If file upload type and file selected, upload first
      if (data.uploadType === 'file' && trainingFile) {
        const uploadResponse = await employeesAPI.uploadTrainingFile(trainingFile);
        data.certificate_url = uploadResponse.data.fileUrl;
        // Show AI extraction results if available
        const addedSkills = uploadResponse.data?.addedSkills || [];
        if (addedSkills.length > 0) {
          toast.success(`AI extracted ${addedSkills.length} skills from training doc: ${addedSkills.slice(0, 4).join(', ')}${addedSkills.length > 4 ? '...' : ''}`, { duration: 5000 });
        }
      }
      return employeesAPI.addTraining(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['employee-profile']);
      queryClient.invalidateQueries(['notifications']);
      toast.success('Training record added successfully!');
      setShowAddTrainingModal(false);
      setNewTraining({ training_name: '', provider: '', completion_date: '', certificate_url: '', description: '', uploadType: 'url' });
      setTrainingFile(null);
    },
    onError: () => {
      toast.error('Failed to add training record');
    },
  });

  const deleteTrainingMutation = useMutation({
    mutationFn: (id) => employeesAPI.deleteTraining(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['employee-profile']);
      toast.success('Training record removed successfully!');
    },
    onError: () => {
      toast.error('Failed to remove training record');
    },
  });

  const onSubmit = (data) => {
    updateProfileMutation.mutate(data);
  };

  const handlePhotoUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Photo must be less than 5MB');
        return;
      }
      uploadPhotoMutation.mutate(file);
    }
  };

  const handleResumeUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error('Resume must be less than 10MB');
        return;
      }
      uploadResumeMutation.mutate(file);
    }
  };

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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const employeeData = profile || {};
  const skills = employeeData.skills || [];
  const certifications = employeeData.certifications || [];
  const training = employeeData.training || [];

  const tabs = [
    { id: 'personal', label: 'Personal Info', icon: UserCircleIcon },
    { id: 'skills', label: 'Skills', icon: AcademicCapIcon },
    { id: 'certifications', label: 'Certifications', icon: CheckCircleIcon },
    { id: 'training', label: 'Training & Courses', icon: BookOpenIcon },
    { id: 'documents', label: 'Documents', icon: DocumentArrowUpIcon },
    { id: 'preferences', label: 'Career Preferences', icon: BriefcaseIcon },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
        </div>
        {activeTab === 'personal' && (
          <button
            onClick={() => setEditMode(!editMode)}
            className="btn-secondary"
          >
            <PencilIcon className="h-5 w-5 mr-2" />
            {editMode ? 'Cancel' : 'Edit Profile'}
          </button>
        )}
      </div>

      {/* Profile Header Card */}
      <div className="card mb-6">
        <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
          {/* Photo Section */}
          <div className="relative">
            {employeeData.photo_url ? (
              <img
                src={`http://localhost:5000${employeeData.photo_url}`}
                alt="Profile"
                className="h-24 w-24 rounded-full object-cover border-4 border-white shadow-lg"
              />
            ) : (
              <div className="h-24 w-24 rounded-full bg-gray-200 flex items-center justify-center border-4 border-white shadow-lg">
                <UserCircleIcon className="h-16 w-16 text-gray-400" />
              </div>
            )}
            <button
              onClick={() => photoInputRef.current?.click()}
              className="absolute bottom-0 right-0 p-1.5 bg-primary-600 text-white rounded-full hover:bg-primary-700 shadow-lg"
              title="Upload photo"
            >
              <PhotoIcon className="h-4 w-4" />
            </button>
            <input
              type="file"
              ref={photoInputRef}
              onChange={handlePhotoUpload}
              accept="image/*"
              className="hidden"
            />
          </div>

          {/* Employee Info */}
          <div className="flex-1">
            <h2 className="text-xl font-semibold text-gray-900">
              {employeeData.first_name} {employeeData.last_name}
            </h2>
            <p className="text-primary-600 font-medium">{employeeData.job_title || 'No job title'}</p>
            <p className="text-gray-600">{employeeData.department || 'No department'}</p>
            
            <div className="mt-3 flex flex-wrap gap-4 text-sm text-gray-500">
              <span className="flex items-center gap-1">
                <IdentificationIcon className="h-4 w-4" />
                <span className="font-medium">ID:</span> {employeeData.employee_id || 'N/A'}
              </span>
              <span className="flex items-center gap-1">
                <CalendarIcon className="h-4 w-4" />
                <span className="font-medium">Joined:</span> {formatDate(employeeData.hire_date)}
              </span>
              {employeeData.location && (
                <span className="flex items-center gap-1">
                  <MapPinIcon className="h-4 w-4" />
                  {employeeData.location}
                </span>
              )}
            </div>
          </div>

          {/* Contact Info */}
          <div className="text-sm text-gray-600 space-y-2">
            {employeeData.email && (
              <div className="flex items-center gap-2">
                <EnvelopeIcon className="h-4 w-4 text-gray-400" />
                <span>{employeeData.email}</span>
              </div>
            )}
            {employeeData.phone && (
              <div className="flex items-center gap-2">
                <PhoneIcon className="h-4 w-4 text-gray-400" />
                <span>{employeeData.phone}</span>
              </div>
            )}
            {employeeData.manager_first_name && (
              <div className="flex items-center gap-2">
                <UserCircleIcon className="h-4 w-4 text-gray-400" />
                <span>Reports to: {employeeData.manager_first_name} {employeeData.manager_last_name}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b mb-6 overflow-x-auto">
        <nav className="flex gap-4 md:gap-8 min-w-max">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <form onSubmit={handleSubmit(onSubmit)}>
        {/* Personal Info Tab */}
        {activeTab === 'personal' && (
          <div className="card">
            <h3 className="text-lg font-semibold mb-4">Personal Information</h3>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                <input
                  {...register('first_name')}
                  className="input"
                  disabled={!editMode}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                <input
                  {...register('last_name')}
                  className="input"
                  disabled={!editMode}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  value={employeeData.email || ''}
                  type="email"
                  className="input bg-gray-50"
                  disabled
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input
                  {...register('phone')}
                  className="input"
                  disabled={!editMode}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                <input
                  {...register('location')}
                  className="input"
                  disabled={!editMode}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Employee ID</label>
                <input
                  value={employeeData.employee_id || ''}
                  className="input bg-gray-50"
                  disabled
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                <select
                  {...register('department')}
                  className="input"
                  disabled={!editMode}
                >
                  <option value="">Select Department</option>
                  <option value="Engineering">Engineering</option>
                  <option value="Product">Product</option>
                  <option value="Design">Design</option>
                  <option value="Marketing">Marketing</option>
                  <option value="Sales">Sales</option>
                  <option value="Human Resources">Human Resources</option>
                  <option value="Finance">Finance</option>
                  <option value="Operations">Operations</option>
                  <option value="Customer Success">Customer Success</option>
                  <option value="Legal">Legal</option>
                  <option value="IT">IT</option>
                  <option value="Research & Development">Research & Development</option>
                  <option value="Quality Assurance">Quality Assurance</option>
                  <option value="Administration">Administration</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Job Title / Current Role</label>
                <select
                  {...register('job_title')}
                  className="input"
                  disabled={!editMode}
                >
                  <option value="">Select Job Title</option>
                  <option value="Software Engineer">Software Engineer</option>
                  <option value="Senior Software Engineer">Senior Software Engineer</option>
                  <option value="Staff Engineer">Staff Engineer</option>
                  <option value="Principal Engineer">Principal Engineer</option>
                  <option value="Engineering Manager">Engineering Manager</option>
                  <option value="Product Manager">Product Manager</option>
                  <option value="Senior Product Manager">Senior Product Manager</option>
                  <option value="Designer">Designer</option>
                  <option value="Senior Designer">Senior Designer</option>
                  <option value="UX Researcher">UX Researcher</option>
                  <option value="Data Analyst">Data Analyst</option>
                  <option value="Data Scientist">Data Scientist</option>
                  <option value="Business Analyst">Business Analyst</option>
                  <option value="Project Manager">Project Manager</option>
                  <option value="QA Engineer">QA Engineer</option>
                  <option value="DevOps Engineer">DevOps Engineer</option>
                  <option value="HR Specialist">HR Specialist</option>
                  <option value="HR Manager">HR Manager</option>
                  <option value="Recruiter">Recruiter</option>
                  <option value="Sales Representative">Sales Representative</option>
                  <option value="Account Manager">Account Manager</option>
                  <option value="Marketing Specialist">Marketing Specialist</option>
                  <option value="Finance Analyst">Finance Analyst</option>
                  <option value="Accountant">Accountant</option>
                  <option value="Administrative Assistant">Administrative Assistant</option>
                  <option value="Customer Support Specialist">Customer Support Specialist</option>
                  <option value="Team Lead">Team Lead</option>
                  <option value="Director">Director</option>
                  <option value="VP">VP</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Hire Date</label>
                <input
                  value={formatDate(employeeData.hire_date)}
                  className="input bg-gray-50"
                  disabled
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Manager</label>
                <input
                  value={employeeData.manager_first_name ? `${employeeData.manager_first_name} ${employeeData.manager_last_name}` : 'N/A'}
                  className="input bg-gray-50"
                  disabled
                />
              </div>
            </div>

            {editMode && (
              <div className="mt-6 flex justify-end">
                <button
                  type="submit"
                  disabled={updateProfileMutation.isPending}
                  className="btn-primary"
                >
                  {updateProfileMutation.isPending ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Skills Tab */}
        {activeTab === 'skills' && (
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Skills & Expertise</h3>
              <button
                type="button"
                onClick={() => setShowAddSkillModal(true)}
                className="btn-primary text-sm"
              >
                <PlusIcon className="h-4 w-4 mr-1" />
                Add Skill
              </button>
            </div>

            {skills.length > 0 ? (
              <div className="space-y-3">
                {skills.map((skill) => (
                  <div key={skill.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <span className="font-medium text-gray-900">{skill.name}</span>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          skill.proficiency === 'expert' ? 'bg-purple-100 text-purple-800' :
                          skill.proficiency === 'advanced' ? 'bg-blue-100 text-blue-800' :
                          skill.proficiency === 'intermediate' ? 'bg-green-100 text-green-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {skill.proficiency || 'N/A'}
                        </span>
                      </div>
                      {skill.years && (
                        <p className="text-sm text-gray-500 mt-1">{skill.years} years experience</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => deleteSkillMutation.mutate(skill.skill_id)}
                      className="text-red-600 hover:text-red-700 p-2"
                    >
                      <TrashIcon className="h-5 w-5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500">
                <AcademicCapIcon className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <p>No skills added yet</p>
                <p className="text-sm">Click "Add Skill" to get started</p>
              </div>
            )}
          </div>
        )}

        {/* Certifications Tab */}
        {activeTab === 'certifications' && (
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Certifications</h3>
              <button
                type="button"
                onClick={() => setShowAddCertModal(true)}
                className="btn-primary text-sm"
              >
                <PlusIcon className="h-4 w-4 mr-1" />
                Add Certification
              </button>
            </div>

            {certifications.length > 0 ? (
              <div className="space-y-4">
                {certifications.map((cert) => (
                  <div key={cert.id} className="p-4 border rounded-lg">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-medium text-gray-900">{cert.name}</h4>
                        <p className="text-sm text-gray-600">{cert.issuer}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          Issued: {formatDate(cert.date)}
                          {cert.expiry && ` • Expires: ${formatDate(cert.expiry)}`}
                        </p>
                        {cert.credential_id && (
                          <p className="text-xs text-gray-500">Credential ID: {cert.credential_id}</p>
                        )}
                        {cert.credential_url && (
                          <a 
                            href={cert.credential_url.startsWith('/') ? `http://localhost:5000${cert.credential_url}` : cert.credential_url} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="text-xs text-primary-600 hover:underline inline-flex items-center gap-1 mt-1"
                          >
                            <DocumentArrowUpIcon className="h-3 w-3" />
                            View Credential
                          </a>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => deleteCertMutation.mutate(cert.id)}
                        className="text-red-600 hover:text-red-700 p-2"
                      >
                        <TrashIcon className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500">
                <CheckCircleIcon className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <p>No certifications added yet</p>
                <p className="text-sm">Click "Add Certification" to get started</p>
              </div>
            )}
          </div>
        )}

        {/* Training & Courses Tab */}
        {activeTab === 'training' && (
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Training & Completed Courses</h3>
              <button
                type="button"
                onClick={() => setShowAddTrainingModal(true)}
                className="btn-primary text-sm"
              >
                <PlusIcon className="h-4 w-4 mr-1" />
                Add Training
              </button>
            </div>

            {training.length > 0 ? (
              <div className="space-y-4">
                {training.map((t) => (
                  <div key={t.id} className="p-4 border rounded-lg">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-medium text-gray-900">{t.name}</h4>
                        <p className="text-sm text-gray-600">{t.provider}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          Completed: {formatDate(t.date)}
                        </p>
                        <span className={`inline-block mt-2 px-2 py-0.5 rounded text-xs font-medium ${
                          t.status === 'completed' ? 'bg-green-100 text-green-800' :
                          t.status === 'in_progress' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {t.status?.replace('_', ' ') || 'Completed'}
                        </span>
                        {t.certificate_url && (
                          <a 
                            href={t.certificate_url.startsWith('/') ? `http://localhost:5000${t.certificate_url}` : t.certificate_url} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="ml-2 text-xs text-primary-600 hover:underline inline-flex items-center gap-1"
                          >
                            <DocumentArrowUpIcon className="h-3 w-3" />
                            View Certificate
                          </a>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => deleteTrainingMutation.mutate(t.id)}
                        className="text-red-600 hover:text-red-700 p-2"
                      >
                        <TrashIcon className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500">
                <BookOpenIcon className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <p>No training records yet</p>
                <p className="text-sm">Click "Add Training" to add completed courses</p>
              </div>
            )}
          </div>
        )}

        {/* Documents Tab */}
        {activeTab === 'documents' && (
          <div className="card">
            <h3 className="text-lg font-semibold mb-4">Documents</h3>
            
            {/* Resume Section */}
            <div className="mb-6 p-4 border rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <DocumentArrowUpIcon className="h-5 w-5 text-gray-500" />
                  <span className="font-medium">Resume / CV</span>
                </div>
                <button
                  type="button"
                  onClick={() => resumeInputRef.current?.click()}
                  className="btn-secondary text-sm"
                >
                  {resumeData ? 'Update Resume' : 'Upload Resume'}
                </button>
                <input
                  type="file"
                  ref={resumeInputRef}
                  onChange={handleResumeUpload}
                  accept=".pdf,.doc,.docx"
                  className="hidden"
                />
              </div>
              
              {resumeData ? (
                <div className="bg-gray-50 p-3 rounded mt-2">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{resumeData.original_filename}</p>
                      <p className="text-xs text-gray-500">Uploaded: {formatDate(resumeData.uploaded_at)}</p>
                    </div>
                    <div className="flex gap-2">
                      <a
                        href={`http://localhost:5000${resumeData.file_path}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-secondary text-sm flex items-center gap-1"
                      >
                        <DocumentArrowUpIcon className="h-4 w-4" />
                        Preview
                      </a>
                      <a
                        href={`http://localhost:5000${resumeData.file_path}`}
                        download
                        className="btn-secondary text-sm flex items-center gap-1"
                      >
                        <ArrowDownTrayIcon className="h-4 w-4" />
                        Download
                      </a>
                    </div>
                  </div>

                </div>
              ) : (
                <p className="text-sm text-gray-500">No resume uploaded. Supported formats: PDF, DOC, DOCX (max 10MB)</p>
              )}
            </div>

            {/* Photo Section */}
            <div className="p-4 border rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <PhotoIcon className="h-5 w-5 text-gray-500" />
                  <span className="font-medium">Profile Photo</span>
                </div>
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  className="btn-secondary text-sm"
                >
                  {employeeData.photo_url ? 'Change Photo' : 'Upload Photo'}
                </button>
              </div>
              
              {employeeData.photo_url ? (
                <div className="flex items-center gap-4 bg-gray-50 p-3 rounded mt-2">
                  <img
                    src={`http://localhost:5000${employeeData.photo_url}`}
                    alt="Profile"
                    className="h-16 w-16 rounded-full object-cover"
                  />
                  <p className="text-sm text-gray-600">Photo uploaded successfully</p>
                </div>
              ) : (
                <p className="text-sm text-gray-500">No photo uploaded. Supported formats: JPG, PNG (max 5MB)</p>
              )}
            </div>
          </div>
        )}

        {/* Career Preferences Tab */}
        {activeTab === 'preferences' && (
          <div className="card">
            <h3 className="text-lg font-semibold mb-4">Career Preferences</h3>
            
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Career Aspirations
                </label>
                <textarea
                  {...register('career_aspirations')}
                  rows={3}
                  className="input"
                  placeholder="Describe your short and long-term career goals..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Interested in Internal Moves
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      {...register('internal_mobility_interest')}
                      value="true"
                      className="mr-2"
                    />
                    Yes
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      {...register('internal_mobility_interest')}
                      value="false"
                      className="mr-2"
                    />
                    No
                  </label>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="submit"
                disabled={updateProfileMutation.isPending}
                className="btn-primary"
              >
                {updateProfileMutation.isPending ? 'Saving...' : 'Save Preferences'}
              </button>
            </div>
          </div>
        )}
      </form>

      {/* Add Skill Modal */}
      {showAddSkillModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Add Skill</h3>
              <button onClick={() => setShowAddSkillModal(false)} className="text-gray-400 hover:text-gray-600">
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Skill Name</label>
                <input
                  type="text"
                  value={newSkill.skill_name}
                  onChange={(e) => setNewSkill({ ...newSkill, skill_name: e.target.value })}
                  className="input"
                  placeholder="e.g., JavaScript, Project Management"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Proficiency Level</label>
                <select
                  value={newSkill.proficiency_level}
                  onChange={(e) => setNewSkill({ ...newSkill, proficiency_level: e.target.value })}
                  className="input"
                >
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                  <option value="expert">Expert</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Years of Experience</label>
                <input
                  type="number"
                  min="0"
                  value={newSkill.years_of_experience}
                  onChange={(e) => setNewSkill({ ...newSkill, years_of_experience: parseInt(e.target.value) || 0 })}
                  className="input"
                />
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => addSkillMutation.mutate(newSkill)}
                disabled={addSkillMutation.isPending || !newSkill.skill_name}
                className="btn-primary flex-1"
              >
                {addSkillMutation.isPending ? 'Adding...' : 'Add Skill'}
              </button>
              <button onClick={() => setShowAddSkillModal(false)} className="btn-secondary">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Certification Modal */}
      {showAddCertModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Add Certification</h3>
              <button onClick={() => setShowAddCertModal(false)} className="text-gray-400 hover:text-gray-600">
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Certification Name *</label>
                <input
                  type="text"
                  value={newCert.name}
                  onChange={(e) => setNewCert({ ...newCert, name: e.target.value })}
                  className="input"
                  placeholder="e.g., AWS Solutions Architect"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Issuing Organization *</label>
                <input
                  type="text"
                  value={newCert.issuing_organization}
                  onChange={(e) => setNewCert({ ...newCert, issuing_organization: e.target.value })}
                  className="input"
                  placeholder="e.g., Amazon Web Services"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Issue Date</label>
                  <input
                    type="date"
                    value={newCert.issue_date}
                    onChange={(e) => setNewCert({ ...newCert, issue_date: e.target.value })}
                    className="input"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Expiry Date</label>
                  <input
                    type="date"
                    value={newCert.expiry_date}
                    onChange={(e) => setNewCert({ ...newCert, expiry_date: e.target.value })}
                    className="input"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Credential ID</label>
                <input
                  type="text"
                  value={newCert.credential_id}
                  onChange={(e) => setNewCert({ ...newCert, credential_id: e.target.value })}
                  className="input"
                  placeholder="Optional"
                />
              </div>
              
              {/* Credential Proof - URL or File Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Credential Proof</label>
                <div className="flex gap-4 mb-3">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="certUploadType"
                      value="url"
                      checked={newCert.uploadType === 'url'}
                      onChange={() => {
                        setNewCert({ ...newCert, uploadType: 'url' });
                        setCertFile(null);
                      }}
                      className="mr-2"
                    />
                    Enter URL
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="certUploadType"
                      value="file"
                      checked={newCert.uploadType === 'file'}
                      onChange={() => {
                        setNewCert({ ...newCert, uploadType: 'file', credential_url: '' });
                      }}
                      className="mr-2"
                    />
                    Upload File
                  </label>
                </div>
                
                {newCert.uploadType === 'url' ? (
                  <input
                    type="url"
                    value={newCert.credential_url}
                    onChange={(e) => setNewCert({ ...newCert, credential_url: e.target.value })}
                    className="input"
                    placeholder="https://..."
                  />
                ) : (
                  <div>
                    <input
                      type="file"
                      ref={certFileInputRef}
                      onChange={(e) => setCertFile(e.target.files[0])}
                      accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => certFileInputRef.current?.click()}
                      className="btn-secondary w-full flex items-center justify-center gap-2"
                    >
                      <DocumentArrowUpIcon className="h-5 w-5" />
                      {certFile ? certFile.name : 'Choose File'}
                    </button>
                    {certFile && (
                      <p className="text-xs text-gray-500 mt-1">Selected: {certFile.name}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">Supported: PDF, JPG, PNG, DOC, DOCX</p>
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => addCertMutation.mutate(newCert)}
                disabled={addCertMutation.isPending || !newCert.name || !newCert.issuing_organization}
                className="btn-primary flex-1"
              >
                {addCertMutation.isPending ? 'Adding...' : 'Add Certification'}
              </button>
              <button onClick={() => setShowAddCertModal(false)} className="btn-secondary">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Training Modal */}
      {showAddTrainingModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Add Training / Course</h3>
              <button onClick={() => setShowAddTrainingModal(false)} className="text-gray-400 hover:text-gray-600">
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Training / Course Name *</label>
                <input
                  type="text"
                  value={newTraining.training_name}
                  onChange={(e) => setNewTraining({ ...newTraining, training_name: e.target.value })}
                  className="input"
                  placeholder="e.g., Leadership Development Program"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Provider *</label>
                <input
                  type="text"
                  value={newTraining.provider}
                  onChange={(e) => setNewTraining({ ...newTraining, provider: e.target.value })}
                  className="input"
                  placeholder="e.g., Coursera, Company Training Dept"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Completion Date</label>
                <input
                  type="date"
                  value={newTraining.completion_date}
                  onChange={(e) => setNewTraining({ ...newTraining, completion_date: e.target.value })}
                  className="input"
                />
              </div>
              
              {/* Certificate Proof - URL or File Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Certificate Proof</label>
                <div className="flex gap-4 mb-3">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="trainingUploadType"
                      value="url"
                      checked={newTraining.uploadType === 'url'}
                      onChange={() => {
                        setNewTraining({ ...newTraining, uploadType: 'url' });
                        setTrainingFile(null);
                      }}
                      className="mr-2"
                    />
                    Enter URL
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="trainingUploadType"
                      value="file"
                      checked={newTraining.uploadType === 'file'}
                      onChange={() => {
                        setNewTraining({ ...newTraining, uploadType: 'file', certificate_url: '' });
                      }}
                      className="mr-2"
                    />
                    Upload File
                  </label>
                </div>
                
                {newTraining.uploadType === 'url' ? (
                  <input
                    type="url"
                    value={newTraining.certificate_url}
                    onChange={(e) => setNewTraining({ ...newTraining, certificate_url: e.target.value })}
                    className="input"
                    placeholder="https://..."
                  />
                ) : (
                  <div>
                    <input
                      type="file"
                      ref={trainingFileInputRef}
                      onChange={(e) => setTrainingFile(e.target.files[0])}
                      accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => trainingFileInputRef.current?.click()}
                      className="btn-secondary w-full flex items-center justify-center gap-2"
                    >
                      <DocumentArrowUpIcon className="h-5 w-5" />
                      {trainingFile ? trainingFile.name : 'Choose File'}
                    </button>
                    {trainingFile && (
                      <p className="text-xs text-gray-500 mt-1">Selected: {trainingFile.name}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">Supported: PDF, JPG, PNG, DOC, DOCX</p>
                  </div>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={newTraining.description}
                  onChange={(e) => setNewTraining({ ...newTraining, description: e.target.value })}
                  className="input"
                  rows={3}
                  placeholder="Brief description of the training..."
                />
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => addTrainingMutation.mutate(newTraining)}
                disabled={addTrainingMutation.isPending || !newTraining.training_name || !newTraining.provider}
                className="btn-primary flex-1"
              >
                {addTrainingMutation.isPending ? 'Adding...' : 'Add Training'}
              </button>
              <button onClick={() => setShowAddTrainingModal(false)} className="btn-secondary">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmployeeProfile;
