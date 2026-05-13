class EmailService {
  constructor() {
    this.appName = process.env.APP_NAME || 'AuthSystem';
    this.isEnabled = false;
  }

  async verifyConnection() {
    return { enabled: false };
  }

  async sendHtmlEmail(to, subject) {
    return {
      success: false,
      skipped: true,
      reason: 'Email delivery is disabled',
      to,
      subject,
    };
  }

  async sendGenericEmail(email, subject, message) {
    return this.sendHtmlEmail(email, subject, message);
  }

  async sendWelcome(email, name) {
    return this.sendHtmlEmail(email, `Welcome to ${this.appName}`, name);
  }

  async sendMagicLink(email, magicLink) {
    return this.sendHtmlEmail(email, `${this.appName} Login Link`, magicLink);
  }

  async sendOTP(email, otp, type = 'verification') {
    return this.sendHtmlEmail(email, `${this.appName} ${type.toUpperCase()} Code`, otp);
  }

  async sendPasswordReset(email, resetLink) {
    return this.sendHtmlEmail(email, `Reset your ${this.appName} password`, resetLink);
  }

  async sendAccountLocked(email, unlockTime) {
    return this.sendHtmlEmail(email, 'Security Alert: Account Locked', unlockTime);
  }

  async sendVerificationEmail(email, verificationUrl, name) {
    return this.sendHtmlEmail(email, `Verify Your Email - ${this.appName}`, `${name || ''} ${verificationUrl}`);
  }
}

module.exports = EmailService;