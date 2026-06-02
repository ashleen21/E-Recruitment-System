# Intelligent Recruitment Management System

An AI-assisted recruitment platform with three user experiences in one product:

- HR/Admin/Recruiter portal for full hiring operations
- Candidate portal for profile management and job applications
- Employee portal for internal mobility and career growth

Stack:

- Frontend: React 18 + React Router + Zustand + React Query + Tailwind
- Backend: Node.js + Express + PostgreSQL
- AI/Automation: OpenAI integration, resume parsing, job scheduler, analytics

## What Is Included In This Repository

This repository is a monorepo with npm workspaces:

- Root workspace orchestrates backend and frontend runs
- backend contains API server, DB scripts, integrations, and utility scripts
- frontend contains React app with role-based routes and pages

Top-level scripts in package.json:

- npm run install:all: install root + backend + frontend dependencies
- npm run dev: run backend and frontend together
- npm run dev:backend: run backend only
- npm run dev:frontend: run frontend only
- npm run build: build frontend
- npm run start: start backend in production mode

## Main Features

### HR / Recruiter

- Dashboard with hiring pipeline visibility
- Job CRUD and publishing controls
- Job distribution and sharing workflows (social/email/flyer)
- Application management with ranking, shortlist, and status updates
- Interview scheduling, feedback, and hiring finalization
- Employee directory and profile management
- Analytics, reports, and AI predictions

### Candidate

- Authentication and profile management
- Resume upload and parsing
- Job browsing and applications
- Application status tracking
- Interview visibility
- Skills, education, and experience management

### Employee

- Profile and resume management
- Internal opportunities and internal applications
- Saved jobs and interview tracking
- Career path and skill-gap related endpoints
- Certifications and training records

## Tech Details

Backend dependencies used in codebase include:

- Security/auth: jsonwebtoken, bcrypt/bcryptjs, helmet, express-rate-limit
- DB: pg
- Parsing/NLP/OCR: pdf-parse, mammoth, tesseract.js, natural, compromise, jimp
- Integrations: nodemailer, googleapis, axios, twitter-api-v2
- Scheduling/logging: node-cron, morgan, winston

Frontend dependencies used in codebase include:

- Routing/state/data: react-router-dom, zustand, @tanstack/react-query
- Forms/uploads/charts: react-hook-form, react-dropzone, chart.js, react-chartjs-2
- UI helpers: @headlessui/react, @heroicons/react, react-hot-toast

## Accurate Project Structure

```text
recruitment-system/
	package.json
	README.md
	backend/
		package.json
		.env.example
		start-server.js
		fix-resume-upload.js
		check-*.js / find-*.js / test-*.js utility scripts
		src/
			server.js
			run-migration.js
			seed.js
			config/
				index.js
				database.js
			database/
				setup.js
				schema.sql
				seed.js
				migrations/
					add_document_parsing_features.sql
					add_employee_features.sql
					add_personal_info_extraction.sql
					add_resume_references.sql
			middleware/
				auth.middleware.js
				upload.middleware.js
			routes/
				ai.routes.js
				analytics.routes.js
				application.routes.js
				auth.routes.js
				candidate.routes.js
				employee.routes.js
				interview.routes.js
				job.routes.js
				notification.routes.js
				resume.routes.js
				settings.routes.js
				skill.routes.js
				user.routes.js
			services/
				ai.service.js
				calendar.service.js
				email.service.js
				jobDistribution.service.js
				jobFlyer.service.js
				jobScheduler.service.js
				resumeParser.service.js
		uploads/
			documents/
			flyers/
			photos/
			resumes/
	frontend/
		package.json
		postcss.config.js
		tailwind.config.js
		public/
			index.html
		src/
			App.js
			index.js
			index.css
			layouts/
				AuthLayout.js
				MainLayout.js
			pages/
				auth/
					Login.js
					Register.js
					ForgotPassword.js
					ResetPassword.js
				candidate/
					Dashboard.js
					JobSearch.js
					MyApplications.js
					MyInterviews.js
					Profile.js
				employee/
					CareerPath.js
					Dashboard.js
					InternalOpportunities.js
					MyApplications.js
					MyInterviews.js
					Profile.js
				hr/
					Analytics.js
					ApplicationDetails.js
					ApplicationList.js
					Dashboard.js
					EmployeeDetails.js
					EmployeeList.js
					InterviewList.js
					JobDetails.js
					JobDistribution.js
					JobForm.js
					JobList.js
					Reports.js
			services/
				api.js
			store/
				authStore.js
```

## Development Setup

### Prerequisites

- Node.js 18+ recommended
- PostgreSQL 13+ recommended
- npm

### 1. Install Dependencies

From repository root:

```bash
npm run install:all
```

### 2. Configure Environment

Copy backend environment template:

```bash
cd backend
copy .env.example .env
```

Update at least these required values in backend/.env:

- PORT
- DB_HOST
- DB_PORT
- DB_NAME
- DB_USER
- DB_PASSWORD
- JWT_SECRET

Important note: backend config currently reads email as EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASSWORD, EMAIL_FROM. The template includes SMTP_* variables. If email features are needed, align values with what config/index.js reads.

Frontend can optionally set API base URL via:

```env
REACT_APP_API_URL=http://localhost:5000/api
```

### 3. Initialize Database

From backend folder:

```bash
node src/database/setup.js
```

Optional sample data seed:

```bash
node src/database/seed.js
```

Seed script creates test accounts:

- admin@company.com / admin123
- hr@company.com / hr123456
- employee@company.com / emp123456
- jane.doe@email.com / candidate123

### 4. Run the Application

From repository root:

```bash
npm run dev
```

Default URLs:

- Frontend: http://localhost:3000
- Backend API: http://localhost:5000/api
- Health: http://localhost:5000/api/health

## Frontend Routes

Configured in frontend/src/App.js:

- Auth: /login, /register, /forgot-password, /reset-password
- HR: /hr/dashboard, /hr/jobs, /hr/jobs/new, /hr/jobs/:id, /hr/job-distribution, /hr/applications, /hr/interviews, /hr/employees, /hr/analytics, /hr/reports
- Candidate: /candidate/dashboard, /candidate/profile, /candidate/jobs, /candidate/applications, /candidate/interviews
- Employee: /employee/dashboard, /employee/profile, /employee/opportunities, /employee/applications, /employee/interviews

## Backend API Overview

Server route mounts in backend/src/server.js:

- /api/auth
- /api/users
- /api/jobs
- /api/applications
- /api/candidates
- /api/employees
- /api/resumes
- /api/interviews
- /api/analytics
- /api/skills
- /api/ai
- /api/settings
- /api/notifications

Notable endpoint examples:

- Auth: /register, /login, /me, /change-password, /forgot-password, /reset-password, /google, /google/callback
- Jobs: list/get/create/update/delete, /:id/publish, /:id/close, /:id/distribute, /:id/share-email, /:id/share-link, /recommendations
- Applications: list, my-applications, create(apply), status updates, shortlist tools, bulk actions, match score, offer accept/decline
- Interviews: list, schedule, bulk-schedule, update, cancel, confirm, feedback, evaluation, finalize hiring, reminders
- Employee/Candidate: profile, skills, education/experience/certifications, resume upload and parsed-data updates
- AI: screening, matching, career path, predictions, interview question generation
- Analytics: dashboard, reports, comprehensive stats, AI predictions, internal mobility

For complete definitions, check backend/src/routes/*.routes.js.

## Utility Scripts In backend/

The backend folder includes many operational scripts for diagnostics, data checks, and maintenance. These include:

- Data checks: check-apps.js, check-columns.js, check-data.js, check-job-data.js, check-jobs.js, check-names.js, check-photo.js, check-resume-issue.js, check-emp.js, check-shazel.js
- Lookup scripts: find-employees.js, find-user.js
- Fix/maintenance scripts: fix-resume-upload.js, reparse-resumes.js, rescore-applications.js, reset-emp-password.js
- Integration setup scripts: setup-facebook.js, setup-twitter.js
- API test scripts: test-api.js, test-app-api.js, test-flyer.js, test-flyer-post.js, test-my-apps.js, test-password.js, test-reports.js

Run them from backend folder, for example:

```bash
node check-jobs.js
```

## Current Script Caveats

There are legacy npm scripts that may not match current code layout:

- backend npm run migrate points to src/models/index.js (models folder is not present)
- backend npm run seed points to src/seed.js (legacy model-based seed, different from SQL seed)
- root npm run db:seed expects backend script db:seed, which is not defined

Recommended reliable flow is:

- node src/database/setup.js
- node src/database/seed.js
- npm run dev

## Security and Runtime Middleware

- Helmet enabled
- CORS enabled for configured frontend origins
- Rate limiting on /api
- JWT auth middleware and role authorization
- Multipart upload middleware for resumes/photos/documents

## License

MIT
