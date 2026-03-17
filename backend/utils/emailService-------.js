// backend/utils/emailService.js
const nodemailer = require('nodemailer');
const db = require('../config/database');
const path = require('path');
const fs = require('fs');

class EmailService {
  constructor() {
    this.transporter = null;
    this.maxRetries = 3;
    this.retryDelay = 2000;
    this.logoPath = path.join(__dirname, '../assets/logo.png');
    this.initTransporter();
  }

  initTransporter() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD
      },
      tls: {
        rejectUnauthorized: false
      },
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
      rateDelta: 1000,
      rateLimit: 5
    });

    this.transporter.verify().then(() => {
      console.log('Email server ready to send messages');
    }).catch(err => {
      console.error('Email transporter error:', err.message);
    });
  }

  isRetryableError(error) {
    const retryableCodes = [
      'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT',
      'ESOCKET', 'ENOTFOUND', 'ECONNECTION'
    ];
    return retryableCodes.includes(error.code);
  }

  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async sendWithRetry(mailOptions) {
    let lastError;
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const info = await this.transporter.sendMail(mailOptions);
        console.log(`Email sent on attempt ${attempt}: ${info.messageId}`);
        return { success: true, messageId: info.messageId };
      } catch (error) {
        lastError = error;
        console.error(`Email attempt ${attempt} failed:`, error.message);
        
        if (!this.isRetryableError(error)) {
          throw error;
        }
        
        if (attempt < this.maxRetries) {
          const delay = this.retryDelay * attempt;
          console.log(`Retrying in ${delay}ms...`);
          await this.wait(delay);
          this.initTransporter();
        }
      }
    }
    throw new Error(`Email failed after ${this.maxRetries} attempts: ${lastError.message}`);
  }

  async getAdminAndProcurementEmails() {
    try {
      const [users] = await db.query(
        `SELECT email FROM users 
         WHERE role IN ('admin', 'procurement') 
         AND active = 1 
         AND email IS NOT NULL 
         AND email != ''`
      );
      return users.map(u => u.email);
    } catch (error) {
      console.error('Error fetching admin emails:', error);
      return [process.env.ADMIN_EMAIL].filter(Boolean);
    }
  }

  formatDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    return d.toLocaleDateString('bg-BG', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric' 
    });
  }

  getOrderLink(orderId) {
    const baseUrl = process.env.FRONTEND_URL || 'https://partpulse-orders.tail675c8b.ts.net';
    return `${baseUrl}/orders/${orderId}`;
  }

  getLogoAttachment() {
    // Check if logo file exists
    if (fs.existsSync(this.logoPath)) {
      return {
        filename: 'logo.png',
        path: this.logoPath,
        cid: 'partpulse_logo'
      };
    }
    return null;
  }

  getDaysUntilDelivery(deliveryDate) {
    if (!deliveryDate) return null;
    const today = new Date();
    const delivery = new Date(deliveryDate);
    const diffTime = delivery - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }

  // NEW ORDER NOTIFICATION TO ADMIN/PROCUREMENT (Enhanced)
  async sendNewOrderNotification(orderData) {
    try {
      const { 
        orderId, 
        building, 
        itemDescription, 
        quantity, 
        requester, 
        dateNeeded, 
        priority, 
        costCenterCode,
        expectedDeliveryDate // NEW!
      } = orderData;

      const recipients = await this.getAdminAndProcurementEmails();
      
      if (!recipients || recipients.length === 0) {
        console.log('No admin/procurement emails configured');
        return { success: false, error: 'No recipients' };
      }

      const orderLink = this.getOrderLink(orderId);
      const daysUntilDelivery = this.getDaysUntilDelivery(expectedDeliveryDate);

      const priorityConfig = {
        'Low': { color: '#94a3b8', label: 'Нисък', emoji: '🔵' },
        'Normal': { color: '#3b82f6', label: 'Нормален', emoji: '⚪' },
        'High': { color: '#f59e0b', label: 'Висок', emoji: '🟡' },
        'Urgent': { color: '#ef4444', label: 'Спешен', emoji: '🔴' }
      };

      const priorityInfo = priorityConfig[priority] || priorityConfig['Normal'];

      // Build attachments array
      const attachments = [];
      const logoAttachment = this.getLogoAttachment();
      if (logoAttachment) {
        attachments.push(logoAttachment);
      }

      const mailOptions = {
        from: process.env.EMAIL_FROM,
        to: recipients.join(', '),
        subject: `🆕 Нова заявка #${orderId} - Сграда ${building}`,
        html: `
<!DOCTYPE html>
<html lang="bg">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Нова заявка</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f8fafc;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
    
    <!-- Header with Logo -->
    <div style="background: linear-gradient(135deg, #2d5a7b 0%, #f26522 100%); color: #ffffff; padding: 40px 20px; text-align: center;">
      ${logoAttachment ? `
      <div style="width: 120px; height: 120px; background: white; border-radius: 60px; display: inline-block; padding: 15px; margin-bottom: 15px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
        <img src="cid:partpulse_logo" alt="PartPulse Logo" style="max-width: 100%; max-height: 100%; display: block; margin: 0 auto;">
      </div>
      ` : ''}
      <h1 style="margin: 0; font-size: 28px; font-weight: 600; color: #ffffff;">🆕 Нова заявка</h1>
      <p style="margin: 8px 0 0 0; font-size: 16px; color: rgba(255,255,255,0.9);">Система за управление на поръчки</p>
    </div>

    <!-- Content -->
    <div style="padding: 40px 30px; background-color: #f8fafc;">
      
      <!-- Alert Box -->
      <div style="background: #dbeafe; border-left: 4px solid #3b82f6; padding: 16px 20px; margin-bottom: 30px; border-radius: 6px;">
        <p style="margin: 0; color: #1e40af; font-weight: 600; font-size: 15px;">
          📩 Получена е нова заявка за обработка
        </p>
      </div>

      <!-- Order Details Card -->
      <div style="background: #ffffff; border-radius: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.08); overflow: hidden; margin-bottom: 25px;">
        
        <div style="background: #2d5a7b; color: white; padding: 16px 24px; font-weight: 600; font-size: 16px;">
          📋 Детайли на заявката
        </div>

        <table style="width: 100%; border-collapse: collapse;">
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 16px 24px; color: #64748b; font-weight: 500; width: 40%;">Заявка №</td>
            <td style="padding: 16px 24px; color: #0f172a; font-weight: 600; font-size: 18px;">#${orderId}</td>
          </tr>
          <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 16px 24px; color: #64748b; font-weight: 500;">Сграда</td>
            <td style="padding: 16px 24px; color: #0f172a; font-weight: 600;">${building}</td>
          </tr>
          ${costCenterCode ? `
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 16px 24px; color: #64748b; font-weight: 500;">Разходен център</td>
            <td style="padding: 16px 24px; color: #0f172a; font-weight: 600;">${costCenterCode}</td>
          </tr>
          ` : ''}
          <tr style="${costCenterCode ? 'background: #f8fafc;' : ''} border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 16px 24px; color: #64748b; font-weight: 500;">Артикул</td>
            <td style="padding: 16px 24px; color: #0f172a; font-weight: 600;">${itemDescription}</td>
          </tr>
          <tr style="${costCenterCode ? '' : 'background: #f8fafc;'} border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 16px 24px; color: #64748b; font-weight: 500;">Количество</td>
            <td style="padding: 16px 24px; color: #0f172a; font-weight: 600;">${quantity}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 16px 24px; color: #64748b; font-weight: 500;">Нужна до</td>
            <td style="padding: 16px 24px; color: #0f172a; font-weight: 600;">${this.formatDate(dateNeeded)}</td>
          </tr>
          <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 16px 24px; color: #64748b; font-weight: 500;">Приоритет</td>
            <td style="padding: 16px 24px;">
              <span style="display: inline-block; background: ${priorityInfo.color}; color: white; padding: 6px 14px; border-radius: 6px; font-size: 13px; font-weight: 600;">
                ${priorityInfo.emoji} ${priorityInfo.label}
              </span>
            </td>
          </tr>
          ${expectedDeliveryDate ? `
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 16px 24px; color: #64748b; font-weight: 500;">Очаквана доставка</td>
            <td style="padding: 16px 24px; color: #10b981; font-weight: 700; font-size: 16px;">
              📦 ${this.formatDate(expectedDeliveryDate)}
              ${daysUntilDelivery !== null && daysUntilDelivery >= 0 ? `
              <span style="display: block; font-size: 13px; color: #64748b; font-weight: 500; margin-top: 4px;">
                (след ${daysUntilDelivery} ${daysUntilDelivery === 1 ? 'ден' : 'дни'})
              </span>
              ` : ''}
            </td>
          </tr>
          ` : ''}
          <tr>
            <td style="padding: 16px 24px; color: #64748b; font-weight: 500;">Заявил</td>
            <td style="padding: 16px 24px; color: #0f172a; font-weight: 600;">${requester}</td>
          </tr>
        </table>
      </div>

      <!-- Action Button -->
      <div style="text-align: center; margin: 35px 0;">
        <a href="${orderLink}" style="display: inline-block; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(59, 130, 246, 0.3); transition: all 0.3s;">
          👁️ Преглед на заявката
        </a>
      </div>

      <!-- Info Box -->
      <div style="background: #fef3c7; border: 1px solid #fbbf24; border-radius: 8px; padding: 16px 20px; margin-top: 25px;">
        <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.6;">
          <strong>💡 Забележка:</strong> Моля, прегледайте заявката и предприемете необходимите действия за обработката ѝ. Можете да достъпите пълните детайли чрез бутона по-горе.
        </p>
      </div>

    </div>

    <!-- Footer -->
    <div style="background: #0f172a; color: #94a3b8; padding: 30px 20px; text-align: center;">
      <p style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600;">PartPulse Orders</p>
      <p style="margin: 0 0 15px 0; font-size: 13px;">Система за управление на поръчки</p>
      <p style="margin: 0; font-size: 12px; color: #64748b;">© 2026 PartPulse.eu - Всички права запазени</p>
    </div>

  </div>
</body>
</html>
        `,
        attachments: attachments
      };

      return await this.sendWithRetry(mailOptions);

    } catch (error) {
      console.error('Error sending new order notification:', error.message);
      return { success: false, error: error.message };
    }
  }

  // STATUS UPDATE NOTIFICATION TO REQUESTER (Enhanced)
  async sendStatusUpdateNotification(updateData) {
    try {
      const { 
        orderId, 
        requesterEmail, 
        requesterName, 
        oldStatus, 
        newStatus, 
        building, 
        itemDescription,
        expectedDeliveryDate // NEW!
      } = updateData;

      if (!requesterEmail) {
        console.log('No requester email provided');
        return { success: false, error: 'No requester email' };
      }

      const orderLink = this.getOrderLink(orderId);
      const daysUntilDelivery = this.getDaysUntilDelivery(expectedDeliveryDate);

      const statusInfo = {
        'New': { color: '#64748b', label: 'Нова', emoji: '🆕', bgColor: '#f1f5f9' },
        'Pending': { color: '#94a3b8', label: 'Изчакваща', emoji: '⏳', bgColor: '#f1f5f9' },
        'Quote Requested': { color: '#f59e0b', label: 'Заявена оферта', emoji: '📋', bgColor: '#fef3c7' },
        'Quote Received': { color: '#8b5cf6', label: 'Получена оферта', emoji: '📄', bgColor: '#ede9fe' },
        'Quote Under Approval': { color: '#a855f7', label: 'Оферта за одобрение', emoji: '⏰', bgColor: '#f3e8ff' },
        'Approved': { color: '#10b981', label: 'Одобрена', emoji: '✅', bgColor: '#d1fae5' },
        'Ordered': { color: '#3b82f6', label: 'Поръчана', emoji: '🛒', bgColor: '#dbeafe' },
        'In Transit': { color: '#06b6d4', label: 'В транзит', emoji: '🚚', bgColor: '#cffafe' },
        'Partially Delivered': { color: '#84cc16', label: 'Частично доставена', emoji: '📦', bgColor: '#ecfccb' },
        'Delivered': { color: '#22c55e', label: 'Доставена', emoji: '✅', bgColor: '#dcfce7' },
        'Cancelled': { color: '#ef4444', label: 'Отказана', emoji: '❌', bgColor: '#fee2e2' },
        'On Hold': { color: '#f97316', label: 'На изчакване', emoji: '⏸️', bgColor: '#ffedd5' }
      };

      const oldStatusData = statusInfo[oldStatus] || { color: '#64748b', label: oldStatus, emoji: '⚪', bgColor: '#f1f5f9' };
      const newStatusData = statusInfo[newStatus] || { color: '#3b82f6', label: newStatus, emoji: '🔵', bgColor: '#dbeafe' };

      // Determine message based on status
      let statusMessage = '';
      let messageColor = '#3b82f6';

      if (newStatus === 'Approved') {
        statusMessage = '🎉 Чудесна новина! Вашата заявка е одобрена и скоро ще бъде поръчана.';
        messageColor = '#10b981';
      } else if (newStatus === 'Ordered') {
        statusMessage = '✅ Заявката е поръчана успешно. Очаквайте актуализация за доставката.';
        messageColor = '#3b82f6';
      } else if (newStatus === 'In Transit') {
        statusMessage = '🚚 Заявката е на път към вас!';
        messageColor = '#06b6d4';
      } else if (newStatus === 'Delivered') {
        statusMessage = '🎊 Заявката е доставена успешно! Моля, потвърдете получаването.';
        messageColor = '#22c55e';
      } else if (newStatus === 'Cancelled') {
        statusMessage = '⚠️ За съжаление, заявката е отказана. За повече информация, свържете се с администратор.';
        messageColor = '#ef4444';
      } else if (newStatus === 'Quote Received') {
        statusMessage = '📄 Получена е оферта за вашата заявка. Предстои одобрение.';
        messageColor = '#8b5cf6';
      }

      // Build attachments array
      const attachments = [];
      const logoAttachment = this.getLogoAttachment();
      if (logoAttachment) {
        attachments.push(logoAttachment);
      }

      const mailOptions = {
        from: process.env.EMAIL_FROM,
        to: requesterEmail,
        subject: `${newStatusData.emoji} Заявка #${orderId} - ${newStatusData.label}`,
        html: `
<!DOCTYPE html>
<html lang="bg">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Актуализация на заявка</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f8fafc;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
    
    <!-- Header with Logo -->
    <div style="background: linear-gradient(135deg, #2d5a7b 0%, #f26522 100%); color: #ffffff; padding: 40px 20px; text-align: center;">
      ${logoAttachment ? `
      <div style="width: 120px; height: 120px; background: white; border-radius: 60px; display: inline-block; padding: 15px; margin-bottom: 15px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
        <img src="cid:partpulse_logo" alt="PartPulse Logo" style="max-width: 100%; max-height: 100%; display: block; margin: 0 auto;">
      </div>
      ` : ''}
      <h1 style="margin: 0; font-size: 28px; font-weight: 600; color: #ffffff;">📬 Актуализация на заявка</h1>
      <p style="margin: 8px 0 0 0; font-size: 16px; color: rgba(255,255,255,0.9);">Система за управление на поръчки</p>
    </div>

    <!-- Content -->
    <div style="padding: 40px 30px; background-color: #f8fafc;">
      
      <!-- Greeting -->
      <div style="text-align: center; margin-bottom: 30px;">
        <h2 style="color: #0f172a; margin: 0 0 10px 0; font-size: 24px; font-weight: 600;">
          Здравейте${requesterName ? ', ' + requesterName : ''}! 👋
        </h2>
        <p style="color: #64748b; margin: 0; font-size: 16px;">Състоянието на вашата заявка се промени</p>
      </div>

      <!-- Order Info Card -->
      <div style="background: #ffffff; border-radius: 10px; padding: 20px 24px; margin-bottom: 25px; box-shadow: 0 2px 4px rgba(0,0,0,0.08);">
        <table style="width: 100%;">
          <tr>
            <td style="padding: 10px 0; color: #64748b; font-size: 14px;">Заявка:</td>
            <td style="padding: 10px 0; color: #0f172a; font-weight: 600; text-align: right; font-size: 16px;">#${orderId}</td>
          </tr>
          <tr>
            <td style="padding: 10px 0; color: #64748b; font-size: 14px;">Сграда:</td>
            <td style="padding: 10px 0; color: #0f172a; font-weight: 600; text-align: right;">${building || '-'}</td>
          </tr>
          <tr>
            <td style="padding: 10px 0; color: #64748b; font-size: 14px;">Артикул:</td>
            <td style="padding: 10px 0; color: #0f172a; text-align: right;">${itemDescription ? (itemDescription.substring(0, 50) + (itemDescription.length > 50 ? '...' : '')) : '-'}</td>
          </tr>
          ${expectedDeliveryDate ? `
          <tr>
            <td style="padding: 10px 0; color: #64748b; font-size: 14px;">Очаквана доставка:</td>
            <td style="padding: 10px 0; color: #10b981; font-weight: 700; text-align: right; font-size: 15px;">
              📦 ${this.formatDate(expectedDeliveryDate)}
              ${daysUntilDelivery !== null && daysUntilDelivery >= 0 ? `
              <span style="display: block; font-size: 12px; color: #64748b; font-weight: 500; margin-top: 2px;">
                (след ${daysUntilDelivery} ${daysUntilDelivery === 1 ? 'ден' : 'дни'})
              </span>
              ` : ''}
            </td>
          </tr>
          ` : ''}
        </table>
      </div>

      <!-- Status Change Visual -->
      <div style="background: #ffffff; border-radius: 12px; padding: 35px 20px; text-align: center; margin-bottom: 25px; box-shadow: 0 2px 4px rgba(0,0,0,0.08);">
        <!-- Old Status -->
        <div style="margin-bottom: 20px;">
          <span style="display: inline-block; padding: 12px 24px; background: ${oldStatusData.bgColor}; color: ${oldStatusData.color}; border-radius: 8px; font-size: 15px; text-decoration: line-through; opacity: 0.7; font-weight: 500;">
            ${oldStatusData.emoji} ${oldStatusData.label}
          </span>
        </div>

        <!-- Arrow -->
        <div style="font-size: 32px; margin: 20px 0; color: #94a3b8;">⬇️</div>

        <!-- New Status -->
        <div>
          <span style="display: inline-block; padding: 16px 32px; background: ${newStatusData.color}; color: white; border-radius: 10px; font-weight: 700; font-size: 20px; box-shadow: 0 4px 6px rgba(0,0,0,0.15);">
            ${newStatusData.emoji} ${newStatusData.label}
          </span>
        </div>

        ${statusMessage ? `
        <div style="margin-top: 25px; padding: 16px; background: ${messageColor}15; border-left: 3px solid ${messageColor}; border-radius: 6px;">
          <p style="margin: 0; color: ${messageColor}; font-size: 15px; font-weight: 500;">
            ${statusMessage}
          </p>
        </div>
        ` : ''}
      </div>

      <!-- Action Button -->
      <div style="text-align: center; margin: 35px 0;">
        <a href="${orderLink}" style="display: inline-block; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(59, 130, 246, 0.3);">
          👁️ Преглед на заявката
        </a>
      </div>

    </div>

    <!-- Footer -->
    <div style="background: #0f172a; color: #94a3b8; padding: 30px 20px; text-align: center;">
      <p style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600;">PartPulse Orders</p>
      <p style="margin: 0 0 15px 0; font-size: 13px;">Система за управление на поръчки</p>
      <p style="margin: 0; font-size: 12px; color: #64748b;">© 2026 PartPulse.eu - Всички права запазени</p>
    </div>

  </div>
</body>
</html>
        `,
        attachments: attachments
      };

      return await this.sendWithRetry(mailOptions);

    } catch (error) {
      console.error('Error sending status update notification:', error.message);
      return { success: false, error: error.message };
    }
  }

  // Test email configuration
  async testEmailConnection() {
    try {
      await this.transporter.verify();
      return { success: true, message: 'Email configuration is valid' };
    } catch (error) {
      console.error('Email configuration test failed:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new EmailService();
