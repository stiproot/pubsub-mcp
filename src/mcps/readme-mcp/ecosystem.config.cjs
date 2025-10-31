module.exports = {
  apps: [{
    name: 'mcp-srvr',
    script: './dist/index.js',
    instances: 1,
    exec_mode: 'cluster',
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3005
    },
    error_file: '/var/log/pm2/mcp-srvr-error.log',
    out_file: '/var/log/pm2/mcp-srvr-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true
  }]
}
