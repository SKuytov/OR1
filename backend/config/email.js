// backend/config/email.js
module.exports = {
    transporter: {
        host: process.env.SMTP_HOST || 'smtp.superhosting.bg',
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASSWORD
        },
        tls: {
            rejectUnauthorized: false
        }
    },
    from: process.env.EMAIL_FROM || 'PartPulse Orders <orders@partpulse.eu>',
    adminEmail: process.env.ADMIN_EMAIL || 's.kuytov@skuytov.eu'
};
