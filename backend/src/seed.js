const bcrypt = require('bcryptjs');
const { sequelize, User, Skill, Job } = require('./models');

const seedDatabase = async () => {
  try {
    console.log('Starting database seeding...');

    // Create skills
    const skillsData = [
      // Programming Languages
      { name: 'JavaScript', category: 'Programming Languages' },
      { name: 'Python', category: 'Programming Languages' },
      { name: 'Java', category: 'Programming Languages' },
      { name: 'C++', category: 'Programming Languages' },
      { name: 'C#', category: 'Programming Languages' },
      { name: 'Go', category: 'Programming Languages' },
      { name: 'Rust', category: 'Programming Languages' },
      { name: 'TypeScript', category: 'Programming Languages' },
      { name: 'Ruby', category: 'Programming Languages' },
      { name: 'PHP', category: 'Programming Languages' },
      { name: 'Swift', category: 'Programming Languages' },
      { name: 'Kotlin', category: 'Programming Languages' },
      
      // Frontend
      { name: 'React', category: 'Frontend' },
      { name: 'Vue.js', category: 'Frontend' },
      { name: 'Angular', category: 'Frontend' },
      { name: 'Next.js', category: 'Frontend' },
      { name: 'HTML5', category: 'Frontend' },
      { name: 'CSS3', category: 'Frontend' },
      { name: 'Tailwind CSS', category: 'Frontend' },
      { name: 'SASS', category: 'Frontend' },
      
      // Backend
      { name: 'Node.js', category: 'Backend' },
      { name: 'Express.js', category: 'Backend' },
      { name: 'Django', category: 'Backend' },
      { name: 'Flask', category: 'Backend' },
      { name: 'Spring Boot', category: 'Backend' },
      { name: 'ASP.NET', category: 'Backend' },
      { name: 'FastAPI', category: 'Backend' },
      { name: 'Ruby on Rails', category: 'Backend' },
      
      // Databases
      { name: 'PostgreSQL', category: 'Databases' },
      { name: 'MySQL', category: 'Databases' },
      { name: 'MongoDB', category: 'Databases' },
      { name: 'Redis', category: 'Databases' },
      { name: 'SQLite', category: 'Databases' },
      { name: 'Oracle', category: 'Databases' },
      { name: 'SQL Server', category: 'Databases' },
      
      // Cloud & DevOps
      { name: 'AWS', category: 'Cloud & DevOps' },
      { name: 'Azure', category: 'Cloud & DevOps' },
      { name: 'Google Cloud', category: 'Cloud & DevOps' },
      { name: 'Docker', category: 'Cloud & DevOps' },
      { name: 'Kubernetes', category: 'Cloud & DevOps' },
      { name: 'CI/CD', category: 'Cloud & DevOps' },
      { name: 'Jenkins', category: 'Cloud & DevOps' },
      { name: 'Terraform', category: 'Cloud & DevOps' },
      { name: 'Linux', category: 'Cloud & DevOps' },
      
      // Data Science & AI
      { name: 'Machine Learning', category: 'Data Science' },
      { name: 'Deep Learning', category: 'Data Science' },
      { name: 'TensorFlow', category: 'Data Science' },
      { name: 'PyTorch', category: 'Data Science' },
      { name: 'Data Analysis', category: 'Data Science' },
      { name: 'Natural Language Processing', category: 'Data Science' },
      { name: 'Computer Vision', category: 'Data Science' },
      
      // Soft Skills
      { name: 'Leadership', category: 'Soft Skills' },
      { name: 'Communication', category: 'Soft Skills' },
      { name: 'Problem Solving', category: 'Soft Skills' },
      { name: 'Team Collaboration', category: 'Soft Skills' },
      { name: 'Project Management', category: 'Soft Skills' },
      { name: 'Agile/Scrum', category: 'Soft Skills' },
      { name: 'Time Management', category: 'Soft Skills' },
    ];

    for (const skill of skillsData) {
      await Skill.findOrCreate({
        where: { name: skill.name },
        defaults: skill,
      });
    }
    console.log('Skills seeded successfully');

    // Create admin/HR user
    const hashedPassword = await bcrypt.hash('admin123', 10);
    const [adminUser] = await User.findOrCreate({
      where: { email: 'admin@recruitment.com' },
      defaults: {
        email: 'admin@recruitment.com',
        password: hashedPassword,
        firstName: 'Admin',
        lastName: 'User',
        role: 'hr',
        isVerified: true,
        department: 'Human Resources',
      },
    });
    console.log('Admin user created');

    // Create sample candidate
    const candidatePassword = await bcrypt.hash('candidate123', 10);
    const [candidateUser] = await User.findOrCreate({
      where: { email: 'john.doe@email.com' },
      defaults: {
        email: 'john.doe@email.com',
        password: candidatePassword,
        firstName: 'John',
        lastName: 'Doe',
        role: 'candidate',
        isVerified: true,
        phone: '+1234567890',
        location: 'New York, NY',
      },
    });
    console.log('Sample candidate created');

    // Create sample employee
    const employeePassword = await bcrypt.hash('employee123', 10);
    const [employeeUser] = await User.findOrCreate({
      where: { email: 'jane.smith@company.com' },
      defaults: {
        email: 'jane.smith@company.com',
        password: employeePassword,
        firstName: 'Jane',
        lastName: 'Smith',
        role: 'employee',
        isVerified: true,
        department: 'Engineering',
        jobTitle: 'Senior Software Engineer',
      },
    });
    console.log('Sample employee created');

    // Create sample jobs
    const sampleJobs = [
      {
        title: 'Senior Full Stack Developer',
        department: 'Engineering',
        location: 'New York, NY',
        type: 'full-time',
        experience: 'senior',
        salaryMin: 120000,
        salaryMax: 180000,
        description: `We are looking for an experienced Full Stack Developer to join our growing engineering team. You will be responsible for developing and maintaining web applications using modern technologies.

Key Responsibilities:
- Design, develop, and maintain scalable web applications
- Collaborate with cross-functional teams to define and implement new features
- Write clean, maintainable, and well-documented code
- Participate in code reviews and mentor junior developers
- Optimize applications for maximum speed and scalability`,
        requirements: [
          '5+ years of experience in full-stack development',
          'Strong proficiency in JavaScript/TypeScript, React, and Node.js',
          'Experience with PostgreSQL or similar databases',
          'Familiarity with cloud services (AWS/Azure/GCP)',
          'Excellent problem-solving and communication skills',
        ],
        benefits: [
          'Competitive salary and equity',
          'Health, dental, and vision insurance',
          'Flexible work arrangements',
          '401(k) with company match',
          'Professional development budget',
        ],
        skills: ['JavaScript', 'React', 'Node.js', 'PostgreSQL', 'AWS'],
        status: 'published',
        createdBy: adminUser.id,
      },
      {
        title: 'Machine Learning Engineer',
        department: 'Data Science',
        location: 'San Francisco, CA',
        type: 'full-time',
        experience: 'mid',
        salaryMin: 130000,
        salaryMax: 200000,
        description: `Join our AI team to build cutting-edge machine learning solutions that power our products. You will work on challenging problems in NLP, computer vision, and predictive analytics.

Key Responsibilities:
- Design and implement machine learning models and pipelines
- Collaborate with product teams to integrate ML solutions
- Conduct research and stay up-to-date with the latest ML techniques
- Optimize model performance and scalability
- Document and present technical findings`,
        requirements: [
          '3+ years of experience in machine learning',
          'Strong programming skills in Python',
          'Experience with TensorFlow, PyTorch, or similar frameworks',
          'Solid understanding of statistical modeling',
          'MS or PhD in Computer Science, Statistics, or related field preferred',
        ],
        benefits: [
          'Competitive compensation',
          'Stock options',
          'Unlimited PTO',
          'Remote-first culture',
          'Learning and development stipend',
        ],
        skills: ['Python', 'Machine Learning', 'TensorFlow', 'PyTorch', 'Data Analysis'],
        status: 'published',
        createdBy: adminUser.id,
      },
      {
        title: 'Product Manager',
        department: 'Product',
        location: 'Remote',
        type: 'full-time',
        experience: 'senior',
        salaryMin: 140000,
        salaryMax: 190000,
        description: `We are seeking a strategic Product Manager to lead our core product initiatives. You will work closely with engineering, design, and business teams to deliver exceptional products.

Key Responsibilities:
- Define product vision, strategy, and roadmap
- Gather and prioritize product requirements
- Work with engineering teams to deliver high-quality products
- Analyze market trends and competitive landscape
- Communicate product plans to stakeholders`,
        requirements: [
          '5+ years of product management experience',
          'Strong analytical and problem-solving skills',
          'Excellent communication and leadership abilities',
          'Experience with Agile methodologies',
          'Technical background preferred',
        ],
        benefits: [
          'Competitive salary',
          'Equity package',
          'Full benefits',
          'Remote work flexibility',
          'Annual company retreats',
        ],
        skills: ['Product Management', 'Agile/Scrum', 'Leadership', 'Communication', 'Data Analysis'],
        status: 'published',
        createdBy: adminUser.id,
      },
    ];

    for (const jobData of sampleJobs) {
      const [job] = await Job.findOrCreate({
        where: { title: jobData.title },
        defaults: jobData,
      });
    }
    console.log('Sample jobs created');

    console.log('Database seeding completed successfully!');
    console.log('\nTest Accounts:');
    console.log('- HR Admin: admin@recruitment.com / admin123');
    console.log('- Candidate: john.doe@email.com / candidate123');
    console.log('- Employee: jane.smith@company.com / employee123');

  } catch (error) {
    console.error('Error seeding database:', error);
  }
};

// Run if called directly
if (require.main === module) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = seedDatabase;
