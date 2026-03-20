const axios = require('axios');

async function test() {
    try {
        const loginRes = await axios.post('http://localhost:5000/api/auth/login', {
            email: 'hr@company.com', password: 'hr123456'
        });
        const token = loginRes.data.token;

        const appRes = await axios.get('http://localhost:5000/api/applications/f68f18e2-e545-4cf3-8284-8bd31eb66db9', {
            headers: { Authorization: `Bearer ${token}` }
        });
        
        console.log('first_name:', appRes.data.first_name);
        console.log('last_name:', appRes.data.last_name);
        console.log('candidate_email:', appRes.data.candidate_email);
        console.log('phone:', appRes.data.phone);
        console.log('resume_url:', appRes.data.resume_url);
        console.log('submitted_at:', appRes.data.submitted_at);
        console.log('parsed_resume:', appRes.data.parsed_resume ? 'EXISTS' : 'NULL');
        if (appRes.data.parsed_resume) {
            console.log('resume_filename:', appRes.data.parsed_resume.resume_filename);
        }
    } catch (error) {
        console.error('Error:', error.response?.data || error.message);
    }
}
test();
