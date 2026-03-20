/**
 * X (Twitter) API Setup Script
 * 
 * This script helps you get X (Twitter) API credentials for posting
 * job flyers automatically — just like Facebook.
 * 
 * Prerequisites:
 *   1. Go to https://developer.x.com/en/portal/dashboard
 *   2. Create a new Project & App (Free tier works for posting)
 *   3. In App Settings → "User authentication settings" → Set Up:
 *      - App permissions: "Read and write"
 *      - Type of App: "Web App, Automated App or Bot"
 *      - Callback URL: http://127.0.0.1:3940/callback
 *      - Website URL: http://127.0.0.1:3000
 *   4. Copy your API Key & API Secret into the .env file as:
 *         TWITTER_API_KEY=your_api_key
 *         TWITTER_API_SECRET=your_api_secret
 *   5. Run this script: node setup-twitter.js
 * 
 * The script will:
 *   - Open a browser for you to authorize the app
 *   - Automatically save the Access Token & Secret to .env
 *   - Send a test tweet to verify everything works
 */

require('dotenv').config();
const http = require('http');
const { TwitterApi } = require('twitter-api-v2');
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.TWITTER_API_KEY;
const API_SECRET = process.env.TWITTER_API_SECRET;
const CALLBACK_URL = 'http://127.0.0.1:3940/callback';

if (!API_KEY || !API_SECRET) {
    console.error('╔══════════════════════════════════════════════════════════════╗');
    console.error('║              ❌ Missing Twitter API Credentials              ║');
    console.error('╠══════════════════════════════════════════════════════════════╣');
    console.error('║                                                              ║');
    console.error('║  Please set these in your .env file first:                   ║');
    console.error('║                                                              ║');
    console.error('║    TWITTER_API_KEY=your_api_key_here                         ║');
    console.error('║    TWITTER_API_SECRET=your_api_secret_here                   ║');
    console.error('║                                                              ║');
    console.error('║  Get them from: https://developer.x.com/en/portal/dashboard  ║');
    console.error('║  (Create a Project → App → Keys and tokens)                  ║');
    console.error('║                                                              ║');
    console.error('╚══════════════════════════════════════════════════════════════╝');
    process.exit(1);
}

function updateEnvFile(key, value) {
    const envPath = path.join(__dirname, '.env');
    let envContent = '';
    try {
        envContent = fs.readFileSync(envPath, 'utf8');
    } catch {
        envContent = '';
    }

    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(envContent)) {
        envContent = envContent.replace(regex, `${key}=${value}`);
    } else {
        envContent += `\n${key}=${value}`;
    }

    fs.writeFileSync(envPath, envContent);
}

async function main() {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║            X (Twitter) Setup for ERecruitment               ║');
    console.log('╠══════════════════════════════════════════════════════════════╣');
    console.log('║                                                              ║');
    console.log('║  This will connect your X account so job flyers can be       ║');
    console.log('║  posted automatically — just like Facebook!                  ║');
    console.log('║                                                              ║');
    console.log('║  1. A browser window will open                               ║');
    console.log('║  2. Log in to your X account (if needed)                     ║');
    console.log('║  3. Click "Authorize app"                                    ║');
    console.log('║  4. You\'ll be redirected back automatically                  ║');
    console.log('║                                                              ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    // Step 1: Create a client for generating an auth link
    const requestClient = new TwitterApi({
        appKey: API_KEY,
        appSecret: API_SECRET,
    });

    let authLink;
    try {
        authLink = await requestClient.generateAuthLink(CALLBACK_URL, { linkMode: 'authorize' });
    } catch (error) {
        console.error('❌ Failed to generate auth link:', error.message);
        console.error('\n   Make sure your API Key and Secret are correct.');
        console.error('   Also ensure "User authentication settings" is configured:');
        console.error('   - Callback URL must include: http://127.0.0.1:3940/callback');
        console.error('   - App permissions must be "Read and write"');
        process.exit(1);
    }

    const { oauth_token, oauth_token_secret, url } = authLink;

    // Step 2: Start local server to capture the callback
    const server = http.createServer(async (req, res) => {
        const reqUrl = new URL(req.url, 'http://127.0.0.1:3940');

        if (reqUrl.pathname === '/callback') {
            const oauthToken = reqUrl.searchParams.get('oauth_token');
            const oauthVerifier = reqUrl.searchParams.get('oauth_verifier');
            const denied = reqUrl.searchParams.get('denied');

            if (denied) {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end('<h1>❌ Authorization Denied</h1><p>You denied the request. Please run the script again and click "Authorize app".</p>');
                console.error('\n❌ Authorization denied by user.');
                setTimeout(() => process.exit(1), 1000);
                return;
            }

            if (!oauthToken || !oauthVerifier) {
                res.writeHead(400, { 'Content-Type': 'text/html' });
                res.end('<h1>❌ Error</h1><p>Missing OAuth parameters. Please try again.</p>');
                return;
            }

            try {
                // Step 3: Exchange for access tokens
                console.log('\n✅ Authorization received!');
                console.log('📡 Exchanging for access tokens...\n');

                const loginClient = new TwitterApi({
                    appKey: API_KEY,
                    appSecret: API_SECRET,
                    accessToken: oauthToken,
                    accessSecret: oauth_token_secret,
                });

                const { client: loggedClient, accessToken, accessSecret } = await loginClient.login(oauthVerifier);

                console.log('✅ Access tokens obtained!');

                // Step 4: Verify credentials
                const me = await loggedClient.v2.me();
                console.log(`✅ Authenticated as: @${me.data.username} (${me.data.name})`);

                // Step 5: Save to .env
                updateEnvFile('TWITTER_ACCESS_TOKEN', accessToken);
                updateEnvFile('TWITTER_ACCESS_TOKEN_SECRET', accessSecret);
                console.log('\n💾 Access tokens saved to .env file');

                // Step 6: Test posting
                console.log('\n🧪 Sending test tweet...');
                try {
                    const testTweet = await loggedClient.v2.tweet(
                        '🚀 ERecruitment System connected! Job postings with flyers will be shared here.\n\n#hiring #recruitment #jobs'
                    );
                    console.log('✅ Test tweet posted successfully!');
                    console.log(`   View it at: https://x.com/i/web/status/${testTweet.data.id}`);
                } catch (tweetError) {
                    if (tweetError.code === 403) {
                        console.log('⚠️  Test tweet skipped — your app may need "Read and Write" permissions.');
                        console.log('   Go to your app settings on developer.x.com and ensure:');
                        console.log('   App permissions → "Read and write" is selected');
                        console.log('   Then re-run this script.');
                    } else {
                        console.log('⚠️  Test tweet failed:', tweetError.message);
                        console.log('   Tokens saved anyway — posting should work when distributing jobs.');
                    }
                }

                console.log('\n🎉 X (Twitter) integration is fully set up!');
                console.log('   Job flyers will now be posted automatically to X — just like Facebook.');

                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(`
                    <html>
                    <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                        <h1>✅ Success!</h1>
                        <p>X (Twitter) account <strong>@${me.data.username}</strong> is now connected.</p>
                        <p>Job flyers will be posted automatically when you distribute jobs.</p>
                        <p style="color: #666; margin-top: 20px;">You can close this window.</p>
                    </body>
                    </html>
                `);

                setTimeout(() => process.exit(0), 2000);

            } catch (error) {
                console.error('\n❌ Error during token exchange:', error.message);
                res.writeHead(500, { 'Content-Type': 'text/html' });
                res.end('<h1>❌ Error</h1><p>Failed to complete authorization. Check the terminal for details.</p>');
                setTimeout(() => process.exit(1), 2000);
            }
        }
    });

    server.listen(3940, () => {
        console.log('🔗 Open this URL in your browser:\n');
        console.log(url);
        console.log('\n⏳ Waiting for authorization...\n');
    });
}

main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
