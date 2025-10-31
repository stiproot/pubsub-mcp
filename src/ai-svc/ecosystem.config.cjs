module.exports = {
  apps: [
    {
      name: 'evt-svc',
      script: './dist/index.js',
      instances: 1,
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3004
      },
      error_file: '/dev/stderr',
      out_file: '/dev/stdout',
      time: true,
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000
    }
  ]
};
