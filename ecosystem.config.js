module.exports = {
    apps: [
        {
            name: 'openclaw-list',
            script: 'node_modules/.bin/tsx',
            args: 'watch src/server.ts',
            env: {
                NODE_ENV: 'development',
                PORT: 3010,
                HOST: '0.0.0.0',
            },
            watch: ['src', 'app'],
            ignore_watch: ['node_modules', 'data', 'public'],
            max_memory_restart: '1G',
            log_date_format: 'YYYY-MM-DD HH:mm:ss',
            error_file: './logs/pm2-error.log',
            out_file: './logs/pm2-out.log',
            merge_logs: true,
            autorestart: true,
        },
    ],
};
