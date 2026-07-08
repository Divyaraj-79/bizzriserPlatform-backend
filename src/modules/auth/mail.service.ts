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
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f9f9f9; padding: 40px; border-radius: 10px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #25D366; margin: 0;">BizzRiser</h1>
        </div>
        <div style="background-color: #ffffff; padding: 30px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
          <h2 style="color: #333333; margin-top: 0;">Password Reset Request</h2>
          <p style="color: #555555; line-height: 1.6;">Hello ${firstName},</p>
          <p style="color: #555555; line-height: 1.6;">We received a request to reset your password for your BizzRiser account. Enter the following 6-digit verification code to complete the process:</p>
          
          <div style="background-color: #f4f4f4; border: 1px dashed #25D366; border-radius: 8px; padding: 20px; text-align: center; margin: 30px 0;">
            <h1 style="color: #25D366; font-size: 36px; letter-spacing: 8px; margin: 0;">${otp}</h1>
          </div>
          
          <p style="color: #555555; line-height: 1.6;">This code is valid for <strong>15 minutes</strong>. If you didn't request a password reset, you can safely ignore this email.</p>
          <p style="color: #555555; line-height: 1.6; margin-bottom: 0;">Best regards,<br>The BizzRiser Team</p>
        </div>
      </div>
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
}
