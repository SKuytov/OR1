// ecosystem.config.js - PM2 Process Manager Configuration
module.exports = {
  apps: [{
    name: 'partpulse-orders',
    script: './backend/server.js',
    instances: 2,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      UPLOAD_DIR: '/var/www/partpulse-orders/backend/uploads'
    },
    error_file: '/var/log/partpulse-orders/pm2-err.log',
    out_file: '/var/log/partpulse-orders/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    min_uptime: '10s',
    max_restarts: 10
  }]
};
