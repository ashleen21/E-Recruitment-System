import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { useDropzone } from 'react-dropzone';
import {
  UserCircleIcon,
  XMarkIcon,
  DocumentArrowUpIcon,
  PencilIcon,
  TrashIcon,
  DocumentIcon,
  EyeIcon,
  ArrowPathIcon,
  CameraIcon,
  KeyIcon,
  DocumentTextIcon,
  AcademicCapIcon,
  BriefcaseIcon,
  EnvelopeIcon,
  PhoneIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import { candidatesAPI, resumeAPI, authAPI } from '../../services/api';

const CandidateProfile = () => {
  const [editingSection, setEditingSection] = useState(null);
  const [previewResume, setPreviewResume] = useState(null);
  const [previewTab, setPreviewTab] = useState('preview'); // 'preview' or 'parsed'
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordData, setPasswordData] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const photoInputRef = useRef(null);
  const queryClient = useQueryClient();

  const { data: profile, isLoading } = useQuery({
    queryKey: ['candidate-profile'],
    queryFn: () => candidatesAPI.getProfile(),
  });

  const { data: resumes } = useQuery({
    queryKey: ['candidate-resumes'],
    queryFn: () => resumeAPI.getAll(),
  });

  const { register, handleSubmit } = useForm();

  const updateProfileMutation = useMutation({
    mutationFn: (data) => candidatesAPI.updateProfile(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['candidate-profile']);
      setEditingSection(null);
      toast.success('Profile updated');
    },
    onError: () => toast.error('Failed to update profile'),
  });

  const uploadResumeMutation = useMutation({
    mutationFn: (file) => resumeAPI.upload(file),
    onSuccess: () => {
      queryClient.invalidateQueries(['candidate-profile']);
      queryClient.invalidateQueries(['candidate-resumes']);
      toast.success('Resume uploaded successfully');
    },
    onError: () => toast.error('Failed to upload resume'),
  });

  const deleteResumeMutation = useMutation({
    mutationFn: (id) => resumeAPI.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['candidate-resumes']);
      toast.success('Resume deleted');
    },
    onError: () => toast.error('Failed to delete resume'),
  });

  const reparseMutation = useMutation({
    mutationFn: (id) => resumeAPI.reparse(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['candidate-resumes']);
      toast.success('Resume reparsing started. Refresh in a few seconds to see results.');
    },
    onError: () => toast.error('Failed to reparse resume'),
  });

  const uploadPhotoMutation = useMutation({
    mutationFn: (file) => candidatesAPI.uploadPhoto(file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidate-profile'] });
      queryClient.refetchQueries({ queryKey: ['candidate-profile'] });
      toast.success('Photo uploaded successfully');
    },
    onError: (error) => {
      console.error('Photo upload error:', error);
      toast.error(error.response?.data?.error || 'Failed to upload photo');
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: ({ currentPassword, newPassword }) => authAPI.changePassword(currentPassword, newPassword),
    onSuccess: () => {
      setShowPasswordModal(false);
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      toast.success('Password changed successfully');
    },
    onError: (error) => toast.error(error.response?.data?.error || 'Failed to change password'),
  });

  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Photo must be less than 5MB');
        return;
      }
      if (!file.type.startsWith('image/')) {
        toast.error('Please select an image file');
        return;
      }
      uploadPhotoMutation.mutate(file);
    }
  };

  const handlePasswordChange = (e) => {
    e.preventDefault();
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    if (passwordData.newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    changePasswordMutation.mutate({
      currentPassword: passwordData.currentPassword,
      newPassword: passwordData.newPassword,
    });
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'application/pdf': ['.pdf'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    },
    maxFiles: 1,
    onDrop: (files) => {
      if (files[0]) {
        uploadResumeMutation.mutate(files[0]);
      }
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const profileData = profile?.data || {};
  const photoUrl = profileData.profile_photo_url || profileData.photo_url;
  const photoUrlWithCache = photoUrl ? `${photoUrl}?t=${profileData.updated_at || Date.now()}` : null;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Photo & Resume */}
        <div className="space-y-6">
          {/* Profile Photo */}
          <div className="card text-center">
            <div className="relative w-32 h-32 mx-auto mb-4">
              <div className="w-32 h-32 rounded-full bg-primary-100 flex items-center justify-center overflow-hidden">
                {photoUrl ? (
                  <img src={`http://localhost:5000${photoUrlWithCache}`} alt="Profile" className="w-32 h-32 rounded-full object-cover" />
                ) : (
                  <UserCircleIcon className="h-20 w-20 text-primary-600" />
                )}
              </div>
              <input
                type="file"
                ref={photoInputRef}
                onChange={handlePhotoChange}
                accept="image/*"
                className="hidden"
              />
              <button
                onClick={() => photoInputRef.current?.click()}
                disabled={uploadPhotoMutation.isPending}
                className="absolute bottom-0 right-0 bg-primary-600 text-white p-2 rounded-full hover:bg-primary-700 shadow-lg"
                title="Upload photo"
              >
                {uploadPhotoMutation.isPending ? (
                  <ArrowPathIcon className="h-4 w-4 animate-spin" />
                ) : (
                  <CameraIcon className="h-4 w-4" />
                )}
              </button>
            </div>
            <h2 className="text-xl font-semibold text-gray-900">
              {profileData.first_name} {profileData.last_name}
            </h2>
            <p className="text-gray-600">{profileData.current_job_title || 'Add a headline'}</p>
            
            {/* Change Password Button */}
            <button
              onClick={() => setShowPasswordModal(true)}
              className="mt-4 inline-flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              <KeyIcon className="h-4 w-4 mr-2" />
              Change Password
            </button>
          </div>

          {/* Resume Upload */}
          <div className="card">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Resume</h3>
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                isDragActive ? 'border-primary-500 bg-primary-50' : 'border-gray-300 hover:border-primary-400'
              }`}
            >
              <input {...getInputProps()} />
              <DocumentArrowUpIcon className="h-10 w-10 mx-auto text-gray-400 mb-2" />
              {uploadResumeMutation.isPending ? (
                <p className="text-gray-600">Uploading...</p>
              ) : (
                <>
                  <p className="text-gray-600">Drag & drop your resume here</p>
                  <p className="text-sm text-gray-500">or click to browse</p>
                  <p className="text-xs text-gray-400 mt-2">PDF, DOC, DOCX (Max 10MB)</p>
                </>
              )}
            </div>
            
            {/* Uploaded Resumes List */}
            {resumes?.data?.length > 0 && (
              <div className="mt-4 space-y-2">
                <p className="text-sm font-medium text-gray-700">Uploaded Resumes:</p>
                {resumes.data.map((resume) => (
                  <div key={resume.id} className="p-3 bg-gray-50 rounded-lg flex items-center justify-between">
                    <div className="flex items-center">
                      <DocumentIcon className="h-5 w-5 text-gray-400 mr-2" />
                      <div>
                        <span className="text-sm text-gray-700 block">{resume.file_name}</span>
                        <span className="text-xs text-gray-500">
                          {(resume.file_size / 1024).toFixed(1)} KB • {resume.status}
                          {resume.status === 'parsed' && ` • ${Math.round(resume.extraction_confidence || 0)}% confidence`}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => reparseMutation.mutate(resume.id)}
                        className="text-blue-600 hover:text-blue-700 p-1"
                        title="Reparse Resume"
                        disabled={reparseMutation.isPending}
                      >
                        <ArrowPathIcon className={`h-5 w-5 ${reparseMutation.isPending ? 'animate-spin' : ''}`} />
                      </button>
                      <button
                        onClick={() => setPreviewResume(resume)}
                        className="text-primary-600 hover:text-primary-700 p-1"
                        title="Preview"
                      >
                        <EyeIcon className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm('Delete this resume?')) {
                            deleteResumeMutation.mutate(resume.id);
                          }
                        }}
                        className="text-red-600 hover:text-red-700 p-1"
                        title="Delete"
                      >
                        <TrashIcon className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column - Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Basic Info */}
          <div className="card">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Basic Information</h3>
              <button
                onClick={() => setEditingSection(editingSection === 'basic' ? null : 'basic')}
                className="text-primary-600 hover:text-primary-700"
              >
                <PencilIcon className="h-5 w-5" />
              </button>
            </div>

            {editingSection === 'basic' ? (
              <form onSubmit={handleSubmit((data) => updateProfileMutation.mutate(data))} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                    <input {...register('first_name')} defaultValue={profileData.first_name} className="input-field" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                    <input {...register('last_name')} defaultValue={profileData.last_name} className="input-field" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Job Title</label>
                  <input {...register('current_job_title')} defaultValue={profileData.current_job_title} className="input-field" placeholder="e.g., Senior Software Engineer" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input {...register('phone')} defaultValue={profileData.phone} className="input-field" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                  <input {...register('location')} defaultValue={profileData.location} className="input-field" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">LinkedIn URL</label>
                  <input {...register('linkedin_url')} defaultValue={profileData.linkedin_url} className="input-field" placeholder="https://linkedin.com/in/yourprofile" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Portfolio URL</label>
                  <input {...register('portfolio_url')} defaultValue={profileData.portfolio_url} className="input-field" placeholder="https://yourportfolio.com" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Summary</label>
                  <textarea {...register('summary')} defaultValue={profileData.summary} rows={4} className="input-field" />
                </div>
                <div className="flex gap-2">
                  <button type="submit" disabled={updateProfileMutation.isPending} className="btn-primary">
                    {updateProfileMutation.isPending ? 'Saving...' : 'Save'}
                  </button>
                  <button type="button" onClick={() => setEditingSection(null)} className="btn-secondary">
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Email</span>
                  <span className="text-gray-900">{profileData.email || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Phone</span>
                  <span className="text-gray-900">{profileData.phone || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Location</span>
                  <span className="text-gray-900">{profileData.location || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">LinkedIn</span>
                  <span className="text-gray-900">
                    {profileData.linkedin_url ? (
                      <a href={profileData.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline">
                        View Profile
                      </a>
                    ) : '-'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Portfolio</span>
                  <span className="text-gray-900">
                    {profileData.portfolio_url ? (
                      <a href={profileData.portfolio_url} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline">
                        View Portfolio
                      </a>
                    ) : '-'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Experience</span>
                  <span className="text-gray-900">{profileData.years_of_experience ? `${profileData.years_of_experience} years` : '-'}</span>
                </div>
                {profileData.summary && (
                  <div className="pt-3 border-t">
                    <p className="text-gray-700">{profileData.summary}</p>
                  </div>
                )}
              </div>
            )}
          </div>


        </div>
      </div>

      {/* Resume Preview Modal */}
      {previewResume && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-5xl h-[90vh] flex flex-col">
            <div className="flex justify-between items-center p-4 border-b">
              <div className="flex items-center space-x-4">
                <h3 className="text-lg font-semibold">{previewResume.file_name}</h3>
                {previewResume.status === 'parsed' && (
                  <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                    {Math.round(previewResume.extraction_confidence || 0)}% parsed
                  </span>
                )}
                {previewResume.status === 'processing' && (
                  <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded-full animate-pulse">
                    Processing...
                  </span>
                )}
              </div>
              <button
                onClick={() => { setPreviewResume(null); setPreviewTab('preview'); }}
                className="text-gray-500 hover:text-gray-700"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
            
            {/* Tabs */}
            <div className="flex border-b">
              <button
                onClick={() => setPreviewTab('preview')}
                className={`px-6 py-3 text-sm font-medium ${
                  previewTab === 'preview'
                    ? 'text-primary-600 border-b-2 border-primary-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <DocumentIcon className="h-4 w-4 inline mr-2" />
                Document Preview
              </button>
              <button
                onClick={() => setPreviewTab('parsed')}
                className={`px-6 py-3 text-sm font-medium ${
                  previewTab === 'parsed'
                    ? 'text-primary-600 border-b-2 border-primary-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <SparklesIcon className="h-4 w-4 inline mr-2" />
                Parsed Content
              </button>
            </div>

            <div className="flex-1 overflow-auto">
              {previewTab === 'preview' ? (
                /* Document Preview Tab */
                <div className="h-full p-4">
                  {previewResume.file_type === 'application/pdf' ? (
                    <iframe
                      src={`http://localhost:5000${previewResume.file_path || `/uploads/resumes/${previewResume.id}`}`}
                      className="w-full h-full border-0 rounded"
                      title="Resume Preview"
                    />
                  ) : (
                    <div className="text-center py-8">
                      <DocumentIcon className="h-16 w-16 mx-auto text-gray-400 mb-4" />
                      <p className="text-gray-600 mb-4">Preview not available for this file type.</p>
                      <a
                        href={`http://localhost:5000${previewResume.file_path || `/uploads/resumes/${previewResume.id}`}`}
                        download={previewResume.file_name}
                        className="btn-primary"
                      >
                        Download Resume
                      </a>
                    </div>
                  )}
                </div>
              ) : (
                /* Parsed Content Tab */
                <div className="p-6 space-y-6">
                  {previewResume.status === 'processing' ? (
                    <div className="text-center py-12">
                      <ArrowPathIcon className="h-12 w-12 mx-auto text-primary-500 animate-spin mb-4" />
                      <p className="text-gray-600">Parsing resume... Please wait.</p>
                      <p className="text-sm text-gray-400 mt-2">This may take a few seconds.</p>
                    </div>
                  ) : previewResume.status === 'failed' ? (
                    <div className="text-center py-12">
                      <XMarkIcon className="h-12 w-12 mx-auto text-red-500 mb-4" />
                      <p className="text-red-600">Failed to parse resume</p>
                      <p className="text-sm text-gray-500 mt-2">{previewResume.parsing_error}</p>
                      <button
                        onClick={() => reparseMutation.mutate(previewResume.id)}
                        className="mt-4 btn-primary"
                      >
                        Retry Parsing
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* Contact Information */}
                      {previewResume.extracted_contact && (
                        <div className="bg-gray-50 rounded-lg p-4">
                          <h4 className="font-semibold text-gray-900 mb-3 flex items-center">
                            <UserCircleIcon className="h-5 w-5 mr-2 text-primary-600" />
                            Contact Information
                          </h4>
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            {previewResume.extracted_contact.name && (
                              <div>
                                <span className="text-gray-500">Name:</span>
                                <span className="ml-2 text-gray-900">{previewResume.extracted_contact.name}</span>
                              </div>
                            )}
                            {previewResume.extracted_contact.email && (
                              <div className="flex items-center">
                                <EnvelopeIcon className="h-4 w-4 text-gray-400 mr-2" />
                                <span className="text-gray-900">{previewResume.extracted_contact.email}</span>
                              </div>
                            )}
                            {previewResume.extracted_contact.phone && (
                              <div className="flex items-center">
                                <PhoneIcon className="h-4 w-4 text-gray-400 mr-2" />
                                <span className="text-gray-900">{previewResume.extracted_contact.phone}</span>
                              </div>
                            )}
                            {previewResume.extracted_contact.linkedin && (
                              <div>
                                <span className="text-gray-500">LinkedIn:</span>
                                <a href={`https://${previewResume.extracted_contact.linkedin}`} 
                                   target="_blank" rel="noopener noreferrer"
                                   className="ml-2 text-primary-600 hover:underline">
                                  {previewResume.extracted_contact.linkedin}
                                </a>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Summary */}
                      {previewResume.extracted_summary && (
                        <div className="bg-gray-50 rounded-lg p-4">
                          <h4 className="font-semibold text-gray-900 mb-3 flex items-center">
                            <DocumentTextIcon className="h-5 w-5 mr-2 text-primary-600" />
                            Summary
                          </h4>
                          <p className="text-gray-700 text-sm whitespace-pre-wrap">{previewResume.extracted_summary}</p>
                        </div>
                      )}

                      {/* Skills */}
                      {previewResume.extracted_skills && previewResume.extracted_skills.length > 0 && (
                        <div className="bg-gray-50 rounded-lg p-4">
                          <h4 className="font-semibold text-gray-900 mb-3 flex items-center">
                            <SparklesIcon className="h-5 w-5 mr-2 text-primary-600" />
                            Skills ({previewResume.extracted_skills.length})
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {previewResume.extracted_skills.map((skill, idx) => (
                              <span
                                key={idx}
                                className="px-3 py-1 bg-primary-100 text-primary-800 rounded-full text-sm"
                              >
                                {typeof skill === 'string' ? skill : skill.name || skill}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Experience */}
                      {previewResume.extracted_experience && (
                        <div className="bg-gray-50 rounded-lg p-4">
                          <h4 className="font-semibold text-gray-900 mb-3 flex items-center">
                            <BriefcaseIcon className="h-5 w-5 mr-2 text-primary-600" />
                            Work Experience
                            {previewResume.extracted_experience.totalYears && (
                              <span className="ml-2 text-sm text-gray-500">
                                ({previewResume.extracted_experience.totalYears} years)
                              </span>
                            )}
                          </h4>
                          {previewResume.extracted_experience.positions?.length > 0 ? (
                            <div className="space-y-4">
                              {previewResume.extracted_experience.positions.map((exp, idx) => (
                                <div key={idx} className="border-l-2 border-primary-200 pl-4">
                                  <p className="font-medium text-gray-900">{exp.title}</p>
                                  <p className="text-primary-600">{exp.company}</p>
                                  {(exp.startDate || exp.endDate) && (
                                    <p className="text-sm text-gray-500">
                                      {exp.startDate} - {exp.endDate || 'Present'}
                                    </p>
                                  )}
                                  {exp.description && (
                                    <p className="text-sm text-gray-600 mt-1">{exp.description}</p>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-gray-500">No experience data extracted</p>
                          )}
                        </div>
                      )}

                      {/* Education */}
                      {previewResume.extracted_education && previewResume.extracted_education.length > 0 && (
                        <div className="bg-gray-50 rounded-lg p-4">
                          <h4 className="font-semibold text-gray-900 mb-3 flex items-center">
                            <AcademicCapIcon className="h-5 w-5 mr-2 text-primary-600" />
                            Education
                          </h4>
                          <div className="space-y-3">
                            {previewResume.extracted_education.map((edu, idx) => (
                              <div key={idx} className="border-l-2 border-primary-200 pl-4">
                                <p className="font-medium text-gray-900">
                                  {edu.degree} {edu.field && `in ${edu.field}`}
                                </p>
                                <p className="text-primary-600">{edu.institution}</p>
                                {edu.year && <p className="text-sm text-gray-500">{edu.year}</p>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Certifications */}
                      {previewResume.extracted_certifications && previewResume.extracted_certifications.length > 0 && (
                        <div className="bg-gray-50 rounded-lg p-4">
                          <h4 className="font-semibold text-gray-900 mb-3">Certifications</h4>
                          <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
                            {previewResume.extracted_certifications.map((cert, idx) => (
                              <li key={idx}>{typeof cert === 'string' ? cert : cert.name}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Raw Text (collapsible) */}
                      {previewResume.raw_text && (
                        <details className="bg-gray-50 rounded-lg p-4">
                          <summary className="font-semibold text-gray-900 cursor-pointer">
                            Raw Extracted Text
                          </summary>
                          <pre className="mt-3 text-xs text-gray-600 whitespace-pre-wrap overflow-x-auto max-h-60">
                            {previewResume.raw_text}
                          </pre>
                        </details>
                      )}

                      {/* No parsed data */}
                      {!previewResume.extracted_contact && 
                       !previewResume.extracted_skills && 
                       !previewResume.extracted_experience && 
                       !previewResume.extracted_education && (
                        <div className="text-center py-8">
                          <DocumentIcon className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                          <p className="text-gray-600">No parsed data available yet.</p>
                          <button
                            onClick={() => reparseMutation.mutate(previewResume.id)}
                            className="mt-4 btn-primary"
                          >
                            Parse Resume
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="p-4 border-t flex justify-between">
              <button
                onClick={() => reparseMutation.mutate(previewResume.id)}
                disabled={reparseMutation.isPending}
                className="btn-secondary flex items-center"
              >
                <ArrowPathIcon className={`h-4 w-4 mr-2 ${reparseMutation.isPending ? 'animate-spin' : ''}`} />
                {reparseMutation.isPending ? 'Parsing...' : 'Re-parse Resume'}
              </button>
              <div className="flex space-x-3">
                <a
                  href={`http://localhost:5000${previewResume.file_path || `/uploads/resumes/${previewResume.id}`}`}
                  download={previewResume.file_name}
                  className="btn-secondary"
                >
                  Download
                </a>
                <button
                  onClick={() => { setPreviewResume(null); setPreviewTab('preview'); }}
                  className="btn-primary"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Change Password Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4">
            <div className="p-6 border-b">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Change Password</h3>
                <button
                  onClick={() => {
                    setShowPasswordModal(false);
                    setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>
            </div>
            <form onSubmit={handlePasswordChange} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Current Password
                </label>
                <input
                  type="password"
                  value={passwordData.currentPassword}
                  onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                  className="input-field"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  New Password
                </label>
                <input
                  type="password"
                  value={passwordData.newPassword}
                  onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                  className="input-field"
                  required
                  minLength={8}
                />
                <p className="text-xs text-gray-500 mt-1">Must be at least 8 characters</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  value={passwordData.confirmPassword}
                  onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                  className="input-field"
                  required
                />
              </div>
              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowPasswordModal(false);
                    setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
                  }}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={changePasswordMutation.isPending}
                  className="btn-primary"
                >
                  {changePasswordMutation.isPending ? 'Changing...' : 'Change Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CandidateProfile;
