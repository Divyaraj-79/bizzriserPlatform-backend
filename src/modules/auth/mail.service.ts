import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private resend: Resend;

  constructor() {
    // Initialize Resend with the API key from environment variables
    this.resend = new Resend(process.env.RESEND_API_KEY || 'dummy');
  }

  async sendPasswordResetOtp(email: string, otp: string, firstName: string) {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>BizzRiser Password Reset</title>
        <meta name="color-scheme" content="light dark">
        <meta name="supported-color-schemes" content="light dark">
        <style>
          @media (prefers-color-scheme: dark) {
            body, .body-bg { background-color: #121212 !important; }
            .card { background-color: #1e1e1e !important; box-shadow: none !important; }
            .heading { color: #ffffff !important; }
            .text { color: #e2e8f0 !important; }
            .footer { color: #718096 !important; }
            .otp-box { background-color: #121212 !important; border-color: #333333 !important; }
          }
        </style>
      </head>
      <body class="body-bg" style="background-color: #f4f5f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 40px 20px;">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 560px; margin: 0 auto;">
          <tr>
            <td>
              <table width="100%" border="0" cellspacing="0" cellpadding="0" class="card" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.04);">
                <tr>
                  <td align="center" style="background-color: #000000; padding: 24px 20px;">
                    <img src="https://res.cloudinary.com/dndprgk0w/image/upload/v1783689518/bizzriser_logo_full_dark.png" alt="BizzRiser" height="28" style="display: block; border: 0;" />
                  </td>
                </tr>
                <tr>
                  <td align="left" style="padding: 40px;">
                    <h2 class="heading" style="color: #1a1a1a; font-size: 20px; font-weight: 600; margin-top: 0; margin-bottom: 20px; text-align: left;">Password Reset Request</h2>
                    <div class="text" style="color: #4a5568; font-size: 15px; line-height: 1.6; margin-bottom: 24px; text-align: left;">
                      Hello ${firstName},<br><br>
                      We received a request to reset your password for your BizzRiser account. Enter the following 6-digit verification code to complete the process:
                    </div>
                    
                    <div class="otp-box" style="background-color: #f8f9fa; border: 1px solid #e2e8f0; border-radius: 8px; padding: 24px; text-align: center; margin-bottom: 24px;">
                      <div style="color: #25D366; font-size: 32px; font-weight: 700; letter-spacing: 6px; margin: 0; text-align: center;">${otp}</div>
                    </div>
                    
                    <div class="text" style="color: #4a5568; font-size: 15px; line-height: 1.6; text-align: left;">
                      This code is valid for <strong>10 minutes</strong>. If you didn't request a password reset, you can safely ignore this email.
                      <br><br>
                      Best regards,<br>The BizzRiser Team
                    </div>
                  </td>
                </tr>
              </table>
              
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-top: 32px;">
                <tr>
                  <td align="center">
                    <p class="footer" style="color: #a0aec0; font-size: 13px; line-height: 1.5; margin: 0; text-align: center;">
                      &copy; ${new Date().getFullYear()} BizzRiser. All rights reserved.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    try {
      if (!process.env.RESEND_API_KEY) {
        this.logger.warn(`RESEND_API_KEY not set. OTP for ${email} is ${otp}`);
        return;
      }
      
      const fromEmail = process.env.RESEND_FROM_EMAIL || 'BizzRiser Support <onboarding@resend.dev>';

      const { data, error } = await this.resend.emails.send({
        from: fromEmail,
        to: email,
        subject: 'BizzRiser - Your Password Reset OTP',
        html: html,
      });

      if (error) {
        this.logger.error(`Resend API Error: ${JSON.stringify(error)}`);
        throw new Error(error.message);
      }
      
      this.logger.log(`Password reset email sent to ${email} (ID: ${data?.id})`);
    } catch (error) {
      this.logger.error(`Failed to send password reset email to ${email}`, error);
      throw new Error('Failed to send verification email. Please try again later.');
    }
  }

  async sendSystemNotification(emails: string[], title: string, message: string, ctaLabel?: string, ctaUrl?: string) {
    if (!emails || emails.length === 0) return;
    let ctaHtml = '';
    if (ctaLabel && ctaUrl) {
      ctaHtml = `
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-top: 32px;">
          <tr>
            <td align="left">
              <a href="${ctaUrl}" style="background-color: #25D366; color: #ffffff; display: inline-block; padding: 14px 28px; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 8px; text-align: center;">${ctaLabel}</a>
            </td>
          </tr>
        </table>
      `;
    }

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>BizzRiser Notification</title>
        <meta name="color-scheme" content="light dark">
        <meta name="supported-color-schemes" content="light dark">
        <style>
          @media (prefers-color-scheme: dark) {
            body, .body-bg { background-color: #121212 !important; }
            .card { background-color: #1e1e1e !important; box-shadow: none !important; }
            .heading { color: #ffffff !important; }
            .text { color: #e2e8f0 !important; }
            .footer { color: #718096 !important; }
          }
        </style>
      </head>
      <body class="body-bg" style="background-color: #f4f5f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 40px 20px;">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 560px; margin: 0 auto;">
          <tr>
            <td>
              <table width="100%" border="0" cellspacing="0" cellpadding="0" class="card" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.04);">
                <tr>
                  <td align="center" style="background-color: #000000; padding: 24px 20px;">
                    <img src="https://res.cloudinary.com/dndprgk0w/image/upload/v1783689518/bizzriser_logo_full_dark.png" alt="BizzRiser" height="28" style="display: block; border: 0;" />
                  </td>
                </tr>
                <tr>
                  <td align="left" style="padding: 40px;">
                    <h2 class="heading" style="color: #1a1a1a; font-size: 20px; font-weight: 600; margin-top: 0; margin-bottom: 20px; text-align: left;">${title}</h2>
                    <div class="text" style="color: #4a5568; font-size: 15px; line-height: 1.6; white-space: pre-wrap; text-align: left;">${message}</div>
                    
                    ${ctaHtml}
                  </td>
                </tr>
              </table>
              
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-top: 32px;">
                <tr>
                  <td align="center">
                    <p class="footer" style="color: #a0aec0; font-size: 13px; line-height: 1.5; margin: 0; text-align: center;">
                      You're receiving this email because it's a critical system notification from your BizzRiser workspace.
                    </p>
                    <p class="footer" style="color: #a0aec0; font-size: 13px; line-height: 1.5; margin: 8px 0 0 0; text-align: center;">
                      &copy; ${new Date().getFullYear()} BizzRiser. All rights reserved.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    try {
      if (!process.env.RESEND_API_KEY) {
        this.logger.warn(`RESEND_API_KEY not set. Would have sent system notification to ${emails.length} users`);
        return;
      }
      
      const fromEmail = process.env.RESEND_FROM_EMAIL || 'BizzRiser Support <onboarding@resend.dev>';

      // Resend batch API allows up to 100 emails per batch. 
      // For larger audiences, we chunk the emails into batches of 100 and send them with a slight delay.
      const chunkSize = 100;
      for (let i = 0; i < emails.length; i += chunkSize) {
        const batchEmails = emails.slice(i, i + chunkSize);
        
        const payload = batchEmails.map(email => ({
          from: fromEmail,
          to: email,
          subject: `BizzRiser - ${title}`,
          html: html,
        }));

        const { data, error } = await this.resend.batch.send(payload);

        if (error) {
          this.logger.error(`Resend Batch API Error: ${JSON.stringify(error)}`);
          // Don't throw so we can attempt the next batch
        } else {
          this.logger.log(`System notification batch sent to ${batchEmails.length} users`);
        }
        
        // Wait 600ms between batches to stay under the 2 requests per second rate limit
        if (i + chunkSize < emails.length) {
          await new Promise(resolve => setTimeout(resolve, 600));
        }
      }
    } catch (error) {
      this.logger.error(`Failed to send system notification emails`, error);
    }
  }
}
