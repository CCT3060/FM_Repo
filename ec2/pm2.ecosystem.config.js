// PM2 process configuration for fmapp backend
// Location on EC2: /var/www/fmapp/ec2/pm2.ecosystem.config.js
// Start with: pm2 start /var/www/fmapp/ec2/pm2.ecosystem.config.js --env production

export default {
  apps: [
    {
      name: "fmapp-backend",
      script: "src/server.js",
      cwd: "/var/www/fmapp/backend",

      // Number of instances — use "max" for cluster mode across all CPU cores,
      // or 1 if you want a single process (simpler for debugging).
      instances: 1,
      exec_mode: "fork",

      // Auto-restart on crash
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",

      // Environment variables for production
      // Sensitive values (DB password, JWT secret, etc.) should be set in
      // /var/www/fmapp/backend/.env on the EC2 instance — they are never
      // committed to the repository.
      env_production: {
        NODE_ENV: "production",
        PORT: 4000,
      },

      // Logging
      out_file: "/var/log/fmapp/backend-out.log",
      error_file: "/var/log/fmapp/backend-error.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    },
  ],
};
