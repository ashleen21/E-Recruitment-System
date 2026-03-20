const http = require('http');

async function testProfile() {
  // Login first
  const loginData = JSON.stringify({
    email: 'jane.doe@email.com',
    password: 'candidate123'
  });

  const loginOptions = {
    hostname: 'localhost',
    port: 5000,
    path: '/api/auth/login',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': loginData.length
    }
  };

  const token = await new Promise((resolve, reject) => {
    const req = http.request(loginOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const json = JSON.parse(data);
        resolve(json.token);
      });
    });
    req.on('error', reject);
    req.write(loginData);
    req.end();
  });

  console.log('Token obtained');

  // Now fetch profile
  const profileOptions = {
    hostname: 'localhost',
    port: 5000,
    path: '/api/candidates/profile',
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  };

  const profile = await new Promise((resolve, reject) => {
    const req = http.request(profileOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve(JSON.parse(data));
      });
    });
    req.on('error', reject);
    req.end();
  });

  console.log('Profile photo URL:', profile.profile_photo_url);
  console.log('Full profile:', JSON.stringify(profile, null, 2));
  process.exit(0);
}

testProfile().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
