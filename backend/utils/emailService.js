// backend/utils/emailService.js
const nodemailer = require('nodemailer');
const db = require('../config/database');

class EmailService {
    constructor() {
        this.transporter = null;
        this.maxRetries = 3;
        this.retryDelay = 2000;
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
        return d.toLocaleDateString('bg-BG', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }

    // NEW ORDER NOTIFICATION TO ADMIN/PROCUREMENT (Bulgarian)
    async sendNewOrderNotification(orderData) {
        try {
            const { orderId, building, itemDescription, quantity, requester, dateNeeded, priority, costCenterCode } = orderData;
            
            const recipients = await this.getAdminAndProcurementEmails();
            
            if (!recipients || recipients.length === 0) {
                console.log('No admin/procurement emails configured');
                return { success: false, error: 'No recipients' };
            }

            const priorityBadge = {
                'Low': '<span style="background: #94a3b8; color: white; padding: 4px 12px; border-radius: 4px; font-size: 13px;">Нисък</span>',
                'Normal': '<span style="background: #3b82f6; color: white; padding: 4px 12px; border-radius: 4px; font-size: 13px;">Нормален</span>',
                'High': '<span style="background: #f59e0b; color: white; padding: 4px 12px; border-radius: 4px; font-size: 13px;">Висок</span>',
                'Urgent': '<span style="background: #ef4444; color: white; padding: 4px 12px; border-radius: 4px; font-size: 13px;">Спешен</span>'
            };

            const mailOptions = {
                from: process.env.EMAIL_FROM,
                to: recipients.join(', '),
                subject: `🆕 Нова заявка #${orderId} - Сграда ${building}`,
                html: `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <meta charset="UTF-8">
                    </head>
                    <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
                        <div style="max-width: 600px; margin: 0 auto; background: #ffffff;">
                            <!-- Header -->
                            <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: #f1f5f9; padding: 30px 20px; text-align: center;">
                                <h1 style="margin: 0; font-size: 24px; font-weight: 600;">PartPulse Orders</h1>
                                <p style="margin: 8px 0 0 0; font-size: 14px; color: #94a3b8;">Система за управление на поръчки</p>
                            </div>
                            
                            <!-- Content -->
                            <div style="padding: 40px 30px; background: #f8fafc;">
                                <div style="background: #dbeafe; border-left: 4px solid #3b82f6; padding: 15px 20px; margin-bottom: 25px; border-radius: 4px;">
                                    <h2 style="color: #1e40af; margin: 0; font-size: 18px; font-weight: 600;">✨ Получена е нова заявка за поръчка</h2>
                                </div>
                                
                                <!-- Order Details Card -->
                                <div style="background: white; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden; margin-bottom: 25px;">
                                    <div style="background: #0f172a; color: white; padding: 15px 20px; font-weight: 600;">
                                        Детайли на заявката
                                    </div>
                                    <table style="width: 100%; border-collapse: collapse;">
                                        <tr style="border-bottom: 1px solid #e2e8f0;">
                                            <td style="padding: 15px 20px; color: #64748b; font-weight: 500; width: 40%;">Номер на заявка:</td>
                                            <td style="padding: 15px 20px; color: #0f172a; font-weight: 600; font-size: 16px;">#${orderId}</td>
                                        </tr>
                                        <tr style="border-bottom: 1px solid #e2e8f0; background: #f8fafc;">
                                            <td style="padding: 15px 20px; color: #64748b; font-weight: 500;">Сграда:</td>
                                            <td style="padding: 15px 20px; color: #0f172a; font-weight: 600;">${building}</td>
                                        </tr>
                                        ${costCenterCode ? `
                                        <tr style="border-bottom: 1px solid #e2e8f0;">
                                            <td style="padding: 15px 20px; color: #64748b; font-weight: 500;">Разходен център:</td>
                                            <td style="padding: 15px 20px; color: #0f172a; font-weight: 600;">${costCenterCode}</td>
                                        </tr>
                                        ` : ''}
                                        <tr style="border-bottom: 1px solid #e2e8f0; ${costCenterCode ? 'background: #f8fafc;' : ''}">
                                            <td style="padding: 15px 20px; color: #64748b; font-weight: 500;">Артикул:</td>
                                            <td style="padding: 15px 20px; color: #0f172a;">${itemDescription}</td>
                                        </tr>
                                        <tr style="border-bottom: 1px solid #e2e8f0; ${costCenterCode ? '' : 'background: #f8fafc;'}">
                                            <td style="padding: 15px 20px; color: #64748b; font-weight: 500;">Количество:</td>
                                            <td style="padding: 15px 20px; color: #0f172a; font-weight: 600;">${quantity}</td>
                                        </tr>
                                        <tr style="border-bottom: 1px solid #e2e8f0; ${costCenterCode ? 'background: #f8fafc;' : ''}">
                                            <td style="padding: 15px 20px; color: #64748b; font-weight: 500;">Необходима до:</td>
                                            <td style="padding: 15px 20px; color: #0f172a; font-weight: 600;">${this.formatDate(dateNeeded)}</td>
                                        </tr>
                                        <tr style="border-bottom: 1px solid #e2e8f0; ${costCenterCode ? '' : 'background: #f8fafc;'}">
                                            <td style="padding: 15px 20px; color: #64748b; font-weight: 500;">Приоритет:</td>
                                            <td style="padding: 15px 20px;">${priorityBadge[priority] || priorityBadge['Normal']}</td>
                                        </tr>
                                        <tr>
                                            <td style="padding: 15px 20px; color: #64748b; font-weight: 500;">Заявена от:</td>
                                            <td style="padding: 15px 20px; color: #0f172a; font-weight: 600;">${requester}</td>
                                        </tr>
                                    </table>
                                </div>
                                
                                <!-- Action Button -->
                                <div style="text-align: center; margin: 30px 0;">
                                    <a href="${process.env.FRONTEND_URL || 'https://partpulse-orders.tail675c8b.ts.net/'}" 
                                       style="display: inline-block; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); 
                                              color: white; padding: 14px 32px; text-decoration: none; 
                                              border-radius: 6px; font-weight: 600; font-size: 15px;
                                              box-shadow: 0 4px 6px rgba(59, 130, 246, 0.3);">
                                        📋 Преглед на заявката
                                    </a>
                                </div>
                                
                                <!-- Info Box -->
                                <div style="background: #fef3c7; border: 1px solid #fbbf24; border-radius: 6px; padding: 12px 16px; margin-top: 25px;">
                                    <p style="margin: 0; color: #92400e; font-size: 13px; line-height: 1.5;">
                                        <strong>💡 Забележка:</strong> Моля, прегледайте заявката и предприемете необходимите действия за обработката ѝ.
                                    </p>
                                </div>
                            </div>
                            
                            <!-- Footer -->
                            <div style="background: #0f172a; color: #94a3b8; padding: 25px 20px; text-align: center;">
                                <p style="margin: 0 0 8px 0; font-size: 13px;">
                                    Това е автоматично генерирано съобщение от системата PartPulse Orders
                                </p>
                                <p style="margin: 0; font-size: 12px; color: #64748b;">
                                    &copy; 2026 PartPulse.eu - Всички права запазени
                                </p>
                            </div>
                        </div>
                    </body>
                    </html>
                `
            };

            return await this.sendWithRetry(mailOptions);

        } catch (error) {
            console.error('Error sending new order notification:', error.message);
            return { success: false, error: error.message };
        }
    }

    // STATUS UPDATE NOTIFICATION TO REQUESTER (Bulgarian)
    async sendStatusUpdateNotification(updateData) {
        try {
            const { orderId, requesterEmail, requesterName, oldStatus, newStatus, building, itemDescription } = updateData;

            if (!requesterEmail) {
                console.log('No requester email provided');
                return { success: false, error: 'No requester email' };
            }

            const statusInfo = {
                'New': { color: '#64748b', label: 'Нова', icon: '🆕' },
                'Pending': { color: '#94a3b8', label: 'В очакване', icon: '⏳' },
                'Quote Requested': { color: '#f59e0b', label: 'Изискана оферта', icon: '📝' },
                'Quote Received': { color: '#8b5cf6', label: 'Получена оферта', icon: '📬' },
                'Quote Under Approval': { color: '#a855f7', label: 'Оферта в одобрение', icon: '🔍' },
                'Approved': { color: '#10b981', label: 'Одобрена', icon: '✅' },
                'Ordered': { color: '#3b82f6', label: 'Поръчана', icon: '📦' },
                'In Transit': { color: '#06b6d4', label: 'В транзит', icon: '🚚' },
                'Partially Delivered': { color: '#84cc16', label: 'Частично доставена', icon: '📦' },
                'Delivered': { color: '#22c55e', label: 'Доставена', icon: '✅' },
                'Cancelled': { color: '#ef4444', label: 'Анулирана', icon: '❌' },
                'On Hold': { color: '#f97316', label: 'На чакане', icon: '⏸️' }
            };

            const oldStatusData = statusInfo[oldStatus] || { color: '#64748b', label: oldStatus, icon: '•' };
            const newStatusData = statusInfo[newStatus] || { color: '#3b82f6', label: newStatus, icon: '•' };

            // Determine message based on status
            let statusMessage = '';
            let messageColor = '#3b82f6';
            
            if (newStatus === 'Approved') {
                statusMessage = 'Вашата заявка е одобрена и ще бъде обработена скоро.';
                messageColor = '#10b981';
            } else if (newStatus === 'Ordered') {
                statusMessage = 'Заявката е поръчана от доставчика.';
                messageColor = '#3b82f6';
            } else if (newStatus === 'In Transit') {
                statusMessage = 'Поръчката е в процес на доставка.';
                messageColor = '#06b6d4';
            } else if (newStatus === 'Delivered') {
                statusMessage = 'Поръчката е доставена успешно!';
                messageColor = '#22c55e';
            } else if (newStatus === 'Cancelled') {
                statusMessage = 'Заявката е анулирана.';
                messageColor = '#ef4444';
            } else if (newStatus === 'Quote Received') {
                statusMessage = 'Получена е оферта за вашата заявка.';
                messageColor = '#8b5cf6';
            }

            const mailOptions = {
                from: process.env.EMAIL_FROM,
                to: requesterEmail,
                subject: `${newStatusData.icon} Актуализация на заявка #${orderId} - ${newStatusData.label}`,
                html: `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <meta charset="UTF-8">
                    </head>
                    <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
                        <div style="max-width: 600px; margin: 0 auto; background: #ffffff;">
                            <!-- Header -->
                            <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: #f1f5f9; padding: 30px 20px; text-align: center;">
                                <h1 style="margin: 0; font-size: 24px; font-weight: 600;">PartPulse Orders</h1>
                                <p style="margin: 8px 0 0 0; font-size: 14px; color: #94a3b8;">Система за управление на поръчки</p>
                            </div>
                            
                            <!-- Content -->
                            <div style="padding: 40px 30px; background: #f8fafc;">
                                <div style="text-align: center; margin-bottom: 30px;">
                                    <h2 style="color: #0f172a; margin: 0 0 10px 0; font-size: 22px; font-weight: 600;">Актуализация на статус</h2>
                                    <p style="color: #64748b; margin: 0; font-size: 15px;">
                                        Здравейте${requesterName ? ', ' + requesterName : ''}, състоянието на вашата заявка се промени
                                    </p>
                                </div>
                                
                                <!-- Order Info -->
                                <div style="background: white; border-radius: 8px; padding: 20px; margin-bottom: 25px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                                    <table style="width: 100%;">
                                        <tr>
                                            <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Заявка:</td>
                                            <td style="padding: 8px 0; color: #0f172a; font-weight: 600; text-align: right;">#${orderId}</td>
                                        </tr>
                                        <tr>
                                            <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Сграда:</td>
                                            <td style="padding: 8px 0; color: #0f172a; font-weight: 600; text-align: right;">${building || '-'}</td>
                                        </tr>
                                        <tr>
                                            <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Артикул:</td>
                                            <td style="padding: 8px 0; color: #0f172a; text-align: right;">${itemDescription ? (itemDescription.substring(0, 50) + (itemDescription.length > 50 ? '...' : '')) : '-'}</td>
                                        </tr>
                                    </table>
                                </div>
                                
                                <!-- Status Change Visual -->
                                <div style="background: white; border-radius: 8px; padding: 30px; text-align: center; margin-bottom: 25px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                                    <div style="margin-bottom: 20px;">
                                        <span style="display: inline-block; padding: 10px 20px; background: #f1f5f9; 
                                                    color: #64748b; border-radius: 6px; font-size: 14px; 
                                                    text-decoration: line-through; opacity: 0.7;">
                                            ${oldStatusData.icon} ${oldStatusData.label}
                                        </span>
                                    </div>
                                    
                                    <div style="font-size: 28px; margin: 20px 0; color: #94a3b8;">↓</div>
                                    
                                    <div>
                                        <span style="display: inline-block; padding: 14px 28px; 
                                                    background: ${newStatusData.color}; 
                                                    color: white; border-radius: 6px; font-weight: 600; 
                                                    font-size: 18px; box-shadow: 0 4px 6px rgba(0,0,0,0.15);">
                                            ${newStatusData.icon} ${newStatusData.label}
                                        </span>
                                    </div>
                                    
                                    ${statusMessage ? `
                                    <div style="margin-top: 25px; padding: 15px; background: ${messageColor}15; 
                                                border-left: 3px solid ${messageColor}; border-radius: 4px;">
                                        <p style="margin: 0; color: ${messageColor}; font-size: 14px; font-weight: 500;">
                                            ${statusMessage}
                                        </p>
                                    </div>
                                    ` : ''}
                                </div>
                                
                                <!-- Action Button -->
                                <div style="text-align: center; margin: 30px 0;">
                                    <a href="${process.env.FRONTEND_URL || 'https://partpulse-orders.tail675c8b.ts.net/'}" 
                                       style="display: inline-block; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); 
                                              color: white; padding: 14px 32px; text-decoration: none; 
                                              border-radius: 6px; font-weight: 600; font-size: 15px;
                                              box-shadow: 0 4px 6px rgba(59, 130, 246, 0.3);">
                                        📋 Преглед на заявката
                                    </a>
                                </div>
                            </div>
                            
                            <!-- Footer -->
                            <div style="background: #0f172a; color: #94a3b8; padding: 25px 20px; text-align: center;">
                                <p style="margin: 0 0 8px 0; font-size: 13px;">
                                    Това е автоматично генерирано съобщение от системата PartPulse Orders
                                </p>
                                <p style="margin: 0; font-size: 12px; color: #64748b;">
                                    &copy; 2026 PartPulse.eu - Всички права запазени
                                </p>
                            </div>
                        </div>
                    </body>
                    </html>
                `
            };

            return await this.sendWithRetry(mailOptions);

        } catch (error) {
            console.error('Error sending status update notification:', error.message);
            return { success: false, error: error.message };
        }
    }

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
