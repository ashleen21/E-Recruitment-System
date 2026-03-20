const axios = require('axios');
const jwt = require('jsonwebtoken');

async function testApi() {
  try {
    // Create a token for the user Shazel Revell
    const token = jwt.sign(
      { id: '1bf59faa-8dbb-4075-970c-7535f7494ce3', role: 'candidate' },
      process.env.JWT_SECRET || 'your-secret-key-change-this-in-production'
    );

    console.log('Testing with token for user_id: 1bf59faa-8dbb-4075-970c-7535f7494ce3');

    const response = await axios.get('http://localhost:5000/api/applications/my-applications', {
      headers: { Authorization: `Bearer ${token}` }
    });

    console.log('Response status:', response.status);
    console.log('Response data:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('Full error:', error);
  }
  process.exit(0);
}

testApi();
