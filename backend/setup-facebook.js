/**
 * Facebook Page Token Setup Script
 * 
 * This script helps you get a Facebook Page Access Token with the correct
 * permissions (pages_manage_posts, pages_read_engagement) for posting
 * job details to the Chamboko Investments Facebook Page.
 * 
 * Usage: node setup-facebook.js
 */

require('dotenv').config();
const http = require('http');
const https = require('https');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');

const APP_ID = process.env.FACEBOOK_APP_ID || '2914639142075114';
const APP_SECRET = process.env.FACEBOOK_APP_SECRET || 'a074401edd41672b29939409e6df67f1';
const REDIRECT_URI = 'http://localhost:3939/callback';
const PAGE_ID = process.env.FACEBOOK_PAGE_ID || '973305045874962';

const SCOPES = [
    'pages_show_list',
    'pages_manage_posts',
    'pages_read_engagement',
    'pages_read_user_content'
].join(',');

function httpsGet(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch { resolve(data); }
            });
        }).on('error', reject);
    });
}

function httpsPost(urlStr) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(urlStr);
        const options = {
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            method: 'GET'
        };
        https.get(urlStr, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch { resolve(data); }
            });
        }).on('error', reject);
    });
}

function updateEnvFile(key, value) {
    const envPath = path.join(__dirname, '.env');
    let envContent = fs.readFileSync(envPath, 'utf8');
    
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(envContent)) {
        envContent = envContent.replace(regex, `${key}=${value}`);
    } else {
        envContent += `\n${key}=${value}`;
    }
    
    fs.writeFileSync(envPath, envContent);
}

async function handleCallback(code) {
    console.log('\n✅ Authorization code received!');
    console.log('📡 Exchanging code for access token...\n');

    // Step 1: Exchange code for short-lived user token
    const tokenUrl = `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&client_secret=${APP_SECRET}&code=${code}`;
    const tokenData = await httpsGet(tokenUrl);

    if (tokenData.error) {
        console.error('❌ Error getting token:', tokenData.error.message);
        return false;
    }

    const shortLivedToken = tokenData.access_token;
    console.log('✅ Short-lived user token obtained');

    // Step 2: Exchange for long-lived user token
    const longLivedUrl = `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${APP_ID}&client_secret=${APP_SECRET}&fb_exchange_token=${shortLivedToken}`;
    const longLivedData = await httpsGet(longLivedUrl);

    if (longLivedData.error) {
        console.error('❌ Error getting long-lived token:', longLivedData.error.message);
        return false;
    }

    const longLivedUserToken = longLivedData.access_token;
    console.log('✅ Long-lived user token obtained');

    // Step 3: Get page access token
    const pagesUrl = `https://graph.facebook.com/v21.0/me/accounts?access_token=${longLivedUserToken}`;
    const pagesData = await httpsGet(pagesUrl);

    if (pagesData.error) {
        console.error('❌ Error getting pages:', pagesData.error.message);
        return false;
    }

    const page = pagesData.data.find(p => p.id === PAGE_ID);
    if (!page) {
        console.error('❌ Page with ID', PAGE_ID, 'not found. Available pages:');
        pagesData.data.forEach(p => console.log(`   - ${p.name} (ID: ${p.id})`));
        return false;
    }

    const pageAccessToken = page.access_token;
    console.log(`✅ Page token obtained for: ${page.name} (${page.id})`);
    console.log(`   Tasks: ${page.tasks.join(', ')}`);

    // Step 4: Verify permissions
    const permUrl = `https://graph.facebook.com/v21.0/me/permissions?access_token=${longLivedUserToken}`;
    const permData = await httpsGet(permUrl);
    
    if (permData.data) {
        const granted = permData.data.filter(p => p.status === 'granted').map(p => p.permission);
        console.log(`\n📋 Granted permissions: ${granted.join(', ')}`);
        
        const required = ['pages_manage_posts', 'pages_read_engagement'];
        const missing = required.filter(p => !granted.includes(p));
        if (missing.length > 0) {
            console.warn(`⚠️  Missing permissions: ${missing.join(', ')}`);
            console.warn('   Posting may not work without these permissions.');
        } else {
            console.log('✅ All required permissions are granted!');
        }
    }

    // Step 5: Save to .env
    updateEnvFile('FACEBOOK_PAGE_ACCESS_TOKEN', pageAccessToken);
    console.log('\n💾 Page access token saved to .env file');

    // Step 6: Test posting capability
    console.log('\n🧪 Testing post capability...');
    const testUrl = `https://graph.facebook.com/v21.0/${PAGE_ID}/feed`;
    
    return new Promise((resolve) => {
        const postData = JSON.stringify({
            message: '🚀 ERecruitment System connected! Job postings will be shared here.\n\n#hiring #recruitment #jobs',
            access_token: pageAccessToken
        });

        const reqOptions = {
            hostname: 'graph.facebook.com',
            path: `/v21.0/${PAGE_ID}/feed`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = https.request(reqOptions, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    if (result.id) {
                        console.log('✅ Test post successful! Post ID:', result.id);
                        console.log(`   View it at: https://www.facebook.com/${PAGE_ID}/posts/${result.id.split('_').pop()}`);
                        console.log('\n🎉 Facebook integration is fully set up!');
                        console.log('   You can now distribute jobs to your Chamboko Investments page.');
                    } else if (result.error) {
                        console.error('❌ Test post failed:', result.error.message);
                        console.log('   Token saved anyway — you may need additional permissions.');
                    }
                } catch {
                    console.log('Response:', data);
                }
                resolve(true);
            });
        });

        req.on('error', (e) => {
            console.error('❌ Network error during test:', e.message);
            resolve(true);
        });

        req.write(postData);
        req.end();
    });
}

// Start local server to capture OAuth callback
const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:3939`);
    
    if (url.pathname === '/callback') {
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');

        if (error) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end('<h1>Authorization denied</h1><p>You denied the permission request. Please try again.</p>');
            console.error('❌ Authorization denied by user');
            setTimeout(() => process.exit(1), 1000);
            return;
        }

        if (code) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end('<h1>✅ Success!</h1><p>Facebook Page token obtained. You can close this window and return to the terminal.</p>');
            
            const success = await handleCallback(code);
            setTimeout(() => process.exit(0), 2000);
        }
    }
});

server.listen(3939, () => {
    const authUrl = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${SCOPES}&response_type=code`;

    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║          Facebook Page Token Setup for ERecruitment         ║');
    console.log('╠══════════════════════════════════════════════════════════════╣');
    console.log('║                                                            ║');
    console.log('║  1. Open the URL below in your browser                     ║');
    console.log('║  2. Log in to Facebook (if needed)                         ║');
    console.log('║  3. Grant ALL the requested permissions                    ║');
    console.log('║  4. Select "Chamboko Investments" page                     ║');
    console.log('║  5. The token will be saved automatically                  ║');
    console.log('║                                                            ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log('\n🔗 Open this URL in your browser:\n');
    console.log(authUrl);
    console.log('\n⏳ Waiting for authorization...\n');
});
