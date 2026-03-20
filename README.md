# Intelligent Recruitment Management System

A comprehensive AI-powered recruitment management system built with React, Node.js, and PostgreSQL. This system enables HR managers to efficiently manage job postings, screen candidates using AI, schedule interviews, and analyze recruitment data.

## Features

### HR Manager Portal
- **Dashboard**: Overview of recruitment metrics, recent activities, and AI insights
- **Job Management**: Create, edit, publish, and distribute job postings to multiple platforms
- **Application Management**: AI-powered candidate screening, shortlisting, and bulk actions
- **Interview Scheduling**: Calendar integration for scheduling and managing interviews
- **Employee Management**: View and manage current employees
- **Analytics**: AI-powered predictions, hiring funnels, and recruitment metrics
- **Reports**: Generate and export comprehensive recruitment reports

### Candidate Portal
- **Profile Management**: Complete profile with resume upload, skills, education, and experience
- **Job Search**: Search and filter available positions with AI-powered matching
- **Application Tracking**: Track application status and history
- **Interview Management**: View scheduled interviews with preparation tips

### Employee Portal
- **Internal Opportunities**: Browse and apply for internal positions
- **Career Path**: Visualize career progression and development milestones
- **Skill Development**: Track skill gaps and access learning resources
- **Profile Management**: Manage professional profile and career preferences

## Tech Stack

### Backend
- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: PostgreSQL
- **Authentication**: JWT with bcrypt
- **AI Integration**: OpenAI API with rule-based fallbacks
- **File Parsing**: pdf-parse, mammoth, tesseract.js
- **Email**: Nodemailer
- **Calendar**: Google Calendar API

### Frontend
- **Framework**: React 18
- **Routing**: React Router v6
- **State Management**: Zustand
- **Server State**: TanStack Query (React Query)
- **Styling**: Tailwind CSS
- **Charts**: Chart.js with react-chartjs-2
- **Forms**: React Hook Form
- **File Upload**: React Dropzone
- **Icons**: Heroicons

## Installation

### Prerequisites
- Node.js (v16 or higher)
- PostgreSQL (v13 or higher)
- npm or yarn

### Database Setup

1. Create a PostgreSQL database:
```sql
CREATE DATABASE recruitment_db;
```

2. Configure the database connection in `.env`:
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=recruitment_db
DB_USER=postgres
DB_PASSWORD=12345
```

### Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file:
```env
PORT=5000
NODE_ENV=development

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=recruitment_db
DB_USER=postgres
DB_PASSWORD=12345

# JWT
JWT_SECRET=your_jwt_secret_key_here
JWT_EXPIRES_IN=7d

# OpenAI (optional)
OPENAI_API_KEY=your_openai_api_key

# Email (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
EMAIL_FROM=noreply@recruitment.com

# Google Calendar (optional)
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=http://localhost:5000/api/auth/google/callback
```

4. Run database migrations:
```bash
npm run migrate
```

5. Seed the database (optional):
```bash
npm run seed
```

6. Start the server:
```bash
npm run dev
```

### Frontend Setup

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm start
```

The application will be available at `http://localhost:3000`.

## Project Structure

```
recruitment-system/
├── backend/
│   ├── src/
│   │   ├── config/         # Database and app configuration
│   │   ├── controllers/    # Route controllers
│   │   ├── middleware/     # Express middleware
│   │   ├── models/         # Sequelize models
│   │   ├── routes/         # API routes
│   │   ├── services/       # Business logic services
│   │   │   ├── ai.service.js           # AI/ML functionality
│   │   │   ├── email.service.js        # Email notifications
│   │   │   ├── resumeParser.service.js # Resume parsing
│   │   │   ├── calendar.service.js     # Calendar integration
│   │   │   └── jobDistribution.service.js # Job posting distribution
│   │   └── app.js          # Express app setup
│   ├── uploads/            # Uploaded files
│   │   ├── resumes/
│   │   ├── photos/
│   │   └── documents/
│   └── package.json
│
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── components/     # Reusable components
│   │   ├── layouts/        # Layout components
│   │   ├── pages/          # Page components
│   │   │   ├── auth/       # Authentication pages
│   │   │   ├── hr/         # HR portal pages
│   │   │   ├── candidate/  # Candidate portal pages
│   │   │   └── employee/   # Employee portal pages
│   │   ├── services/       # API services
│   │   ├── store/          # Zustand stores
│   │   ├── App.js          # Main app component
│   │   └── index.js        # Entry point
│   └── package.json
│
└── README.md
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password` - Reset password
- `GET /api/auth/me` - Get current user

### Jobs
- `GET /api/jobs` - List all jobs
- `GET /api/jobs/:id` - Get job details
- `POST /api/jobs` - Create new job
- `PUT /api/jobs/:id` - Update job
- `DELETE /api/jobs/:id` - Delete job
- `POST /api/jobs/:id/publish` - Publish job
- `POST /api/jobs/:id/distribute` - Distribute to platforms

### Applications
- `GET /api/applications` - List applications
- `GET /api/applications/:id` - Get application details
- `POST /api/applications` - Submit application
- `PUT /api/applications/:id` - Update application
- `POST /api/applications/:id/shortlist` - Shortlist candidate
- `POST /api/applications/:id/reject` - Reject application

### Interviews
- `GET /api/interviews` - List interviews
- `POST /api/interviews` - Schedule interview
- `PUT /api/interviews/:id` - Update interview
- `DELETE /api/interviews/:id` - Cancel interview
- `POST /api/interviews/:id/confirm` - Confirm attendance

### AI/Analytics
- `POST /api/ai/screen` - Screen candidate
- `POST /api/ai/match` - Match candidates to job
- `GET /api/analytics/dashboard` - Get dashboard stats
- `GET /api/analytics/predictions` - Get AI predictions

## AI Features

### Resume Parsing
- Extracts text from PDF, Word documents, and images (OCR)
- Identifies skills, education, experience, and certifications
- Uses NLP patterns for structured data extraction

### Candidate Screening
- Matches candidate skills with job requirements
- Calculates match scores based on weighted criteria
- Provides recommendations for hiring decisions

### Predictive Analytics
- Time-to-hire predictions
- Candidate success probability
- Pipeline health metrics

## Security

- JWT-based authentication
- Password hashing with bcrypt
- Rate limiting on API endpoints
- CORS configuration
- Helmet.js for HTTP security headers
- Input validation and sanitization

## License

MIT License

## Support

For questions or support, please contact the development team.
