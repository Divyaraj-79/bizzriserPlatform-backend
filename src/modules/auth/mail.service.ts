import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import * as dns from 'dns';

// Force Node.js 18+ to use IPv4 first for DNS resolution globally
// This prevents ENETUNREACH errors on Render when resolving smtp.gmail.com
dns.setDefaultResultOrder('ipv4first');

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      // Render has issues with IPv6 outbound. Force IPv4 for the SMTP connection.
      // This passes the family: 4 option down to Node's net.connect / tls.connect
      tls: {
        rejectUnauthorized: true,
      },
      // Pass socket options to force IPv4
      socketTimeout: 30000,
      dnsTimeout: 10000,
    } as any);
    // Explicitly force IPv4 for this transport if options allow
    (this.transporter as any).options.host = process.env.SMTP_HOST || 'smtp.gmail.com';
    (this.transporter as any).options.tls = { ...(this.transporter as any).options.tls };
    (this.transporter as any).options.family = 4; // Explicitly set family to 4 for IPv4
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
      if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        this.logger.warn(`SMTP credentials not set. OTP for ${email} is ${otp}`);
        return;
      }
      
      const info = await this.transporter.sendMail({
        from: `"BizzRiser Support" <${process.env.SMTP_USER}>`,
        to: email,
        subject: 'BizzRiser - Your Password Reset OTP',
        html: html,
      });
      
      this.logger.log(`Password reset email sent to ${email}: ${info.messageId}`);
    } catch (error) {
      this.logger.error(`Failed to send password reset email to ${email}`, error);
      throw new Error('Failed to send verification email. Please try again later.');
    }
  }
}
