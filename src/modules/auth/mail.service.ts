import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private resend: Resend;

  constructor(private prisma: PrismaService) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      this.logger.error('RESEND_API_KEY is not set! Emails will not be sent.');
    }
    this.resend = new Resend(apiKey || 're_placeholder');
  }

  private async sendMail(to: string | string[], subject: string, html: string) {
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@bizzriser.com';

    if (!process.env.RESEND_API_KEY) {
      this.logger.error('Cannot send email: RESEND_API_KEY is not configured.');
      throw new Error('Email service not configured.');
    }

    try {
      if (Array.isArray(to)) {
        const chunkSize = 100;
        for (let i = 0; i < to.length; i += chunkSize) {
          const batchEmails = to.slice(i, i + chunkSize);
          const payload = batchEmails.map(email => ({
            from: fromEmail,
            to: email,
            subject,
            html,
          }));
          const { data, error } = await this.resend.batch.send(payload);
          if (error) {
            this.logger.error(`Resend Batch Error: ${JSON.stringify(error)}`);
          } else {
            this.logger.log(`Email batch sent to ${batchEmails.length} recipients. IDs: ${JSON.stringify(data)}`);
          }
          if (i + chunkSize < to.length) await new Promise(res => setTimeout(res, 600));
        }
      } else {
        this.logger.log(`Sending email via Resend to: ${to}, from: ${fromEmail}, subject: ${subject}`);
        const { data, error } = await this.resend.emails.send({
          from: fromEmail,
          to,
          subject,
          html,
        });
        if (error) {
          this.logger.error(`Resend API Error: ${JSON.stringify(error)}`);
          throw new Error(error.message);
        }
        this.logger.log(`Email sent successfully! Resend ID: ${data?.id}`);
      }
    } catch (error: any) {
      this.logger.error(`sendMail failed: ${error.message}`);
      throw error;
    }
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
      await this.sendMail(email, 'BizzRiser - Your Password Reset OTP', html);
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

    let htmlMessage = `<div class="text" style="color: #4a5568; font-size: 15px; line-height: 1.6; white-space: pre-wrap; text-align: left;">${message}</div>`;

    if (title.startsWith('New Version: ')) {
      const versionTitle = title.replace('New Version: ', '');
      const appVersion = await this.prisma.appVersion.findFirst({ where: { title: versionTitle } });
      
      if (appVersion) {
        let lists = '';
        if (appVersion.highlights && appVersion.highlights.length > 0) {
          lists += `
            <div style="margin-top: 24px; text-align: left;">
              <h3 class="heading" style="color: #1a1a1a; margin-bottom: 12px; font-size: 16px;">✨ Highlights</h3>
              <ul class="text" style="margin: 0; padding-left: 20px; color: #4a5568; line-height: 1.6;">
                ${appVersion.highlights.map((h: string) => `<li style="margin-bottom: 8px;">${h}</li>`).join('')}
              </ul>
            </div>
          `;
        }
        if (appVersion.changelog) {
          lists += `
            <div style="margin-top: 24px; text-align: left;">
              <h3 class="heading" style="color: #1a1a1a; margin-bottom: 12px; font-size: 16px;">📝 Changelog</h3>
              <div class="text" style="color: #4a5568; line-height: 1.6; white-space: pre-wrap; background-color: #f8f9fa; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0; font-family: monospace; font-size: 13px;">${appVersion.changelog}</div>
            </div>
          `;
        }
        
        htmlMessage = `
          <div class="text" style="color: #4a5568; font-size: 15px; line-height: 1.6; text-align: left;">
            ${message}
          </div>
          ${lists}
        `;
      }
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
                    ${htmlMessage}
                    
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
      await this.sendMail(emails, `BizzRiser - ${title}`, html);
    } catch (error) {
      this.logger.error(`Failed to send system notification`);
    }
  }

  async sendClientInvitationEmail(email: string, firstName: string, signupUrl: string) {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>You are invited to join BizzRiser</title>
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
                    <h2 class="heading" style="color: #1a1a1a; font-size: 20px; font-weight: 600; margin-top: 0; margin-bottom: 20px; text-align: left;">Welcome to BizzRiser!</h2>
                    <div class="text" style="color: #4a5568; font-size: 15px; line-height: 1.6; margin-bottom: 24px; text-align: left;">
                      Hello ${firstName},<br><br>
                      You have been invited to set up your organization on BizzRiser. Click the link below to verify your email, set up your account, and choose a plan.
                    </div>
                    
                    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 24px;">
                      <tr>
                        <td align="left">
                          <a href="${signupUrl}" style="display: inline-block; background-color: #25D366; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold;">Complete Setup</a>
                        </td>
                      </tr>
                    </table>

                    <div class="text" style="color: #4a5568; font-size: 15px; line-height: 1.6; text-align: left;">
                      If you didn't expect this invitation, you can safely ignore this email.
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
      await this.sendMail(email, 'You are invited to join BizzRiser', html);
    } catch (error) {
      this.logger.error(`Failed to send invitation email`);
      throw error; // Re-throw to inform the caller
    }
  }

  async sendOnboardingCompleteEmail(email: string, firstName: string, orgCode: string, loginUrl: string) {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Welcome to BizzRiser! Setup Complete</title>
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
                    <h2 class="heading" style="color: #1a1a1a; font-size: 20px; font-weight: 600; margin-top: 0; margin-bottom: 20px; text-align: left;">Welcome aboard, ${firstName}!</h2>
                    <div class="text" style="color: #4a5568; font-size: 15px; line-height: 1.6; margin-bottom: 24px; text-align: left;">
                      Your BizzRiser organization has been successfully created. Here is your unique Organization Code:<br><br>
                      
                      <div class="otp-box" style="background-color: #f8f9fa; border: 1px solid #e2e8f0; border-radius: 8px; padding: 24px; text-align: center; margin-bottom: 24px;">
                        <div style="color: #25D366; font-size: 32px; font-weight: 700; letter-spacing: 2px; margin: 0; text-align: center;">${orgCode}</div>
                      </div>
                      
                      You can now log in to your dashboard and start configuring your WhatsApp business account.
                    </div>
                    
                    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 24px;">
                      <tr>
                        <td align="left">
                          <a href="${loginUrl}" style="display: inline-block; background-color: #25D366; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold;">Log In Now</a>
                        </td>
                      </tr>
                    </table>

                    <div class="text" style="color: #4a5568; font-size: 15px; line-height: 1.6; text-align: left;">
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
      await this.sendMail(email, 'Welcome to BizzRiser! Setup Complete', html);
    } catch (error) {
      this.logger.error(`Failed to send onboarding complete email`);
    }
  }
}
