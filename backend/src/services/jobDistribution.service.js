const { TwitterApi } = require('twitter-api-v2');
const config = require('../config');
const jobFlyerService = require('./jobFlyer.service');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

class JobDistributionService {
    constructor() {
        this.frontendUrl = config.frontendUrl || 'http://localhost:3000';
        this.companyName = config.companyName || 'Our Company';
    }

    async distributeJob(job, platforms) {
        const results = [];

        for (const platform of platforms) {
            try {
                let result;
                switch (platform.toLowerCase()) {
                    case 'linkedin':
                        result = await this.postToLinkedIn(job);
                        break;
                    case 'twitter':
                    case 'x':
                        result = await this.postToTwitter(job);
                        break;
                    case 'facebook':
                        result = await this.postToFacebook(job);
                        break;
                    case 'company_website':
                        result = await this.postToCompanyWebsite(job);
                        break;
                    default:
                        result = { success: false, error: 'Unknown platform' };
                }
                results.push({ platform, ...result });
            } catch (error) {
                console.error(`Error distributing to ${platform}:`, error);
                results.push({ platform, success: false, error: error.message });
            }
        }

        return results;
    }

    async postToTwitter(job) {
        try {
            const twitterConfig = config.social?.twitter;
            
            // If API credentials are configured, try direct posting
            if (twitterConfig?.apiKey && twitterConfig?.apiSecret && 
                twitterConfig?.accessToken && twitterConfig?.accessTokenSecret) {
                
                // Create Twitter client with OAuth 1.0a User Context
                const client = new TwitterApi({
                    appKey: twitterConfig.apiKey,
                    appSecret: twitterConfig.apiSecret,
                    accessToken: twitterConfig.accessToken,
                    accessSecret: twitterConfig.accessTokenSecret,
                });

                // Try posting with flyer image first, then fall back to text-only
                let mediaId = null;
                let flyerPath = null;
                try {
                    console.log('Generating job flyer for Twitter/X...');
                    const flyerResult = await jobFlyerService.getFlyerBuffer(job, this.companyName);
                    flyerPath = flyerResult.filePath;
                    
                    console.log('Uploading flyer to Twitter/X...');
                    mediaId = await client.v1.uploadMedia(flyerPath, { mimeType: 'image/png' });
                    console.log('Flyer uploaded, mediaId:', mediaId);
                } catch (mediaError) {
                    // Media upload may fail on free-tier API — continue with text-only tweet
                    console.log('Twitter/X media upload skipped (may require Basic tier):', mediaError.message);
                    mediaId = null;
                }

                try {
                    const tweetText = mediaId ? this.formatTweetWithImage(job) : this.formatTweet(job);
                    const tweetPayload = { text: tweetText };
                    if (mediaId) {
                        tweetPayload.media = { media_ids: [mediaId] };
                    }

                    console.log('Posting tweet to X:', tweetText);
                    const response = await client.v2.tweet(tweetPayload);
                    console.log('Twitter/X post successful:', response.data);

                    // Clean up flyer file if it was generated
                    if (flyerPath) {
                        try { fs.unlinkSync(flyerPath); } catch (e) { /* ignore */ }
                    }

                    return { 
                        success: true, 
                        postId: response.data.id,
                        url: `https://x.com/i/web/status/${response.data.id}`,
                        message: mediaId
                            ? 'Successfully posted to X (Twitter) with job flyer!'
                            : 'Successfully posted to X (Twitter)!',
                        hasImage: !!mediaId,
                        requiresManualShare: false
                    };
                } catch (tweetError) {
                    // Clean up flyer file on error
                    if (flyerPath) {
                        try { fs.unlinkSync(flyerPath); } catch (e) { /* ignore */ }
                    }

                    // If it's a rate limit or credits issue, fall through to share link
                    const isQuotaError = tweetError.code === 402 || tweetError.code === 429 ||
                        tweetError.message?.includes('credits') || 
                        tweetError.message?.includes('CreditsDepleted') ||
                        tweetError.message?.includes('Too Many Requests');
                    
                    if (isQuotaError) {
                        console.log('Twitter/X API quota reached, falling back to share link');
                    } else {
                        console.error('Twitter/X API error:', tweetError);
                        throw tweetError;
                    }
                }
            }

            // Fallback: Generate flyer and provide download link + share URL
            console.log('Generating flyer for manual sharing on X...');
            let flyerUrl = null;
            try {
                const { filePath } = await jobFlyerService.getFlyerBuffer(job, this.companyName);
                const flyerFilename = path.basename(filePath);
                flyerUrl = `${this.frontendUrl.replace(':3000', ':5000')}/uploads/flyers/${flyerFilename}`;
            } catch (flyerError) {
                console.log('Could not generate flyer:', flyerError.message);
            }

            const jobUrl = `${this.frontendUrl}/jobs/${job.id}`;
            const tweetText = this.formatTweetWithImage(job);
            const shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
            
            return {
                success: true,
                shareUrl,
                flyerUrl,
                message: flyerUrl 
                    ? 'X (Twitter) share link generated with flyer — download flyer and attach when sharing'
                    : 'X (Twitter) share link generated — configure API keys for direct posting',
                requiresManualShare: true,
                instructions: flyerUrl 
                    ? '1. Download the flyer image\n2. Click the share link\n3. Attach the flyer image to your tweet'
                    : null
            };
        } catch (error) {
            console.error('Twitter/X posting error:', error);
            // Final fallback - always provide share link
            const jobUrl = `${this.frontendUrl}/jobs/${job.id}`;
            const shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(`We're hiring: ${job.title} - Apply now!`)}&url=${encodeURIComponent(jobUrl)}`;
            
            return { 
                success: true,
                shareUrl,
                message: 'X (Twitter) share link generated',
                requiresManualShare: true,
                error: error.message
            };
        }
    }

    async postToLinkedIn(job) {
        // Generate LinkedIn share URL (manual share)
        const jobUrl = `${this.frontendUrl}/jobs/${job.id}`;
        const shareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(jobUrl)}`;
        
        return {
            success: true,
            shareUrl,
            message: 'LinkedIn share link generated',
            requiresManualShare: true
        };
    }

    async postToFacebook(job) {
        try {
            const fbConfig = config.social?.facebook;

            // If Facebook Page credentials are configured, post directly via Graph API
            if (fbConfig?.pageAccessToken && fbConfig?.pageId) {
                try {
                    const pageId = fbConfig.pageId;
                    const accessToken = fbConfig.pageAccessToken;

                    // Generate the job flyer image
                    console.log('Generating job flyer for Facebook...');
                    let flyerPath = null;
                    try {
                        const { filePath } = await jobFlyerService.getFlyerBuffer(job, this.companyName);
                        flyerPath = filePath;
                    } catch (flyerError) {
                        console.log('Could not generate flyer for Facebook:', flyerError.message);
                    }

                    const postMessage = this.formatFacebookPost(job);

                    if (flyerPath && fs.existsSync(flyerPath)) {
                        // Post with photo using multipart form data
                        console.log('Posting to Facebook Page with flyer image...');
                        const formData = new FormData();
                        formData.append('source', fs.createReadStream(flyerPath));
                        formData.append('message', postMessage);
                        formData.append('access_token', accessToken);

                        const data = await new Promise((resolve, reject) => {
                            const options = {
                                method: 'POST',
                                hostname: 'graph.facebook.com',
                                path: `/v21.0/${pageId}/photos`,
                                headers: formData.getHeaders()
                            };
                            const https = require('https');
                            const req = https.request(options, (res) => {
                                let body = '';
                                res.on('data', chunk => body += chunk);
                                res.on('end', () => {
                                    try { resolve(JSON.parse(body)); }
                                    catch { resolve({ error: { message: body } }); }
                                });
                            });
                            req.on('error', reject);
                            formData.pipe(req);
                        });

                        // Clean up flyer file
                        try { fs.unlinkSync(flyerPath); } catch (e) { /* ignore */ }

                        if (data.error) {
                            console.error('Facebook API error:', data.error);
                            throw new Error(data.error.message || 'Facebook API error');
                        }

                        console.log('Facebook photo post successful:', data);
                        return {
                            success: true,
                            postId: data.post_id || data.id,
                            url: `https://www.facebook.com/${pageId}`,
                            message: 'Successfully posted to Facebook Page with job flyer!',
                            hasImage: true,
                            requiresManualShare: false
                        };
                    } else {
                        // Text-only post (no image)
                        console.log('Posting text-only to Facebook Page...');
                        const postBody = JSON.stringify({
                            message: postMessage,
                            access_token: accessToken
                        });
                        const data = await new Promise((resolve, reject) => {
                            const https = require('https');
                            const req = https.request({
                                method: 'POST',
                                hostname: 'graph.facebook.com',
                                path: `/v21.0/${pageId}/feed`,
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Content-Length': Buffer.byteLength(postBody)
                                }
                            }, (res) => {
                                let body = '';
                                res.on('data', chunk => body += chunk);
                                res.on('end', () => {
                                    try { resolve(JSON.parse(body)); }
                                    catch { resolve({ error: { message: body } }); }
                                });
                            });
                            req.on('error', reject);
                            req.write(postBody);
                            req.end();
                        });

                        if (data.error) {
                            console.error('Facebook API error:', data.error);
                            throw new Error(data.error.message || 'Facebook API error');
                        }

                        console.log('Facebook text post successful:', data);
                        return {
                            success: true,
                            postId: data.id,
                            url: `https://www.facebook.com/${pageId}`,
                            message: 'Successfully posted to Facebook Page!',
                            hasImage: false,
                            requiresManualShare: false
                        };
                    }
                } catch (apiError) {
                    console.error('Facebook API posting error:', apiError);
                    // Fall through to share link fallback
                }
            }

            // Fallback: Generate share URL for manual sharing
            const jobUrl = `${this.frontendUrl}/jobs/${job.id}`;
            const shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(jobUrl)}&quote=${encodeURIComponent(`We're hiring: ${job.title}`)}`;

            return {
                success: true,
                shareUrl,
                message: 'Facebook share link generated (configure Page Access Token for direct posting)',
                requiresManualShare: true
            };
        } catch (error) {
            console.error('Facebook posting error:', error);
            const jobUrl = `${this.frontendUrl}/jobs/${job.id}`;
            const shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(jobUrl)}&quote=${encodeURIComponent(`We're hiring: ${job.title}`)}`;

            return {
                success: true,
                shareUrl,
                message: 'Facebook share link generated',
                requiresManualShare: true,
                error: error.message
            };
        }
    }

    async postToCompanyWebsite(job) {
        const jobUrl = `${this.frontendUrl}/jobs/${job.id}`;
        
        return {
            success: true,
            url: jobUrl,
            message: 'Job is live on company website',
            requiresManualShare: false
        };
    }

    /**
     * Format tweet text for posts WITH an image attached
     * Shorter text since the image contains the details
     */
    formatTweetWithImage(job) {
        const jobUrl = `${this.frontendUrl}/jobs/${job.id}`;
        const hashtags = '#hiring #jobs #career #opportunity';
        const title = `🚀 We're Hiring: ${job.title}`;
        const location = job.location ? `\n📍 ${job.location}` : '';
        const cta = '\n\n👉 Apply now! Check the flyer for details.';
        
        let tweet = `${title}${location}${cta}\n\n${hashtags}\n\n${jobUrl}`;
        
        // Twitter has 280 char limit (image doesn't count)
        if (tweet.length > 280) {
            const available = 280 - hashtags.length - jobUrl.length - cta.length - 10;
            tweet = `🚀 We're Hiring: ${job.title.substring(0, available)}...${location}${cta}\n\n${hashtags}\n\n${jobUrl}`;
        }
        
        return tweet;
    }

    /**
     * Format Facebook post text with full job details
     */
    formatFacebookPost(job) {
        const jobUrl = `${this.frontendUrl}/jobs/${job.id}`;
        const lines = [];

        lines.push(`🚀 WE'RE HIRING: ${job.title}`);
        lines.push('');
        if (job.department) lines.push(`🏢 Department: ${job.department}`);
        if (job.location) lines.push(`📍 Location: ${job.location}`);
        if (job.job_type) lines.push(`💼 Type: ${job.job_type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}`);
        if (job.salary_min && job.salary_max) {
            lines.push(`💰 Salary: ${job.salary_currency || '$'}${job.salary_min.toLocaleString()} - ${job.salary_currency || '$'}${job.salary_max.toLocaleString()}`);
        }
        if (job.experience_level) lines.push(`📊 Experience: ${job.experience_level}`);
        lines.push('');
        if (job.description) {
            const desc = job.description.replace(/<[^>]*>/g, '').substring(0, 300);
            lines.push(desc + (job.description.length > 300 ? '...' : ''));
            lines.push('');
        }
        lines.push('👉 Apply now:');
        lines.push(jobUrl);
        lines.push('');
        lines.push('#hiring #jobs #career #opportunity #recruitment');

        return lines.join('\n');
    }

    formatTweet(job) {
        const jobUrl = `${this.frontendUrl}/jobs/${job.id}`;
        const hashtags = '#hiring #jobs #career';
        const title = `🚀 We're hiring! ${job.title}`;
        const location = job.location ? ` 📍 ${job.location}` : '';
        
        // Twitter has 280 char limit
        let tweet = `${title}${location}\n\n${hashtags}\n\n${jobUrl}`;
        
        if (tweet.length > 280) {
            const available = 280 - hashtags.length - jobUrl.length - 10;
            tweet = `${title.substring(0, available)}...\n\n${hashtags}\n\n${jobUrl}`;
        }
        
        return tweet;
    }

    generateShareLinks(job) {
        const jobUrl = `${this.frontendUrl}/jobs/${job.id}`;
        
        return {
            linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(jobUrl)}`,
            twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(this.formatTweet(job))}`,
            facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(jobUrl)}&quote=${encodeURIComponent(`We're hiring: ${job.title}`)}`,
            company_website: jobUrl
        };
    }
}

module.exports = new JobDistributionService();
