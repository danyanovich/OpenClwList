#!/usr/bin/env node

/**
 * OpenClwList CLI wrapper for npx / global install
 */

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

// Ensure we have a data directory if running from npx
const dataDir = path.join(process.cwd(), 'openclw-data')
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
}

console.log('[openclwlist] Starting from:', rootDir)
console.log('[openclwlist] Working directory:', process.cwd())

// We use tsx to run the server directly from source
// This allows npx github:user/repo to work without a pre-build step
const cmd = 'npx'
const args = ['tsx', 'src/server.ts']

const child = spawn(cmd, args, {
    cwd: rootDir,
    stdio: 'inherit',
    shell: true,
    env: {
        ...process.env,
        // Point DB and other paths to the current working directory so data persists there
        OPS_UI_DB_PATH: path.join(process.cwd(), 'openclw-list.sqlite'),
    }
})

child.on('close', (code) => {
    process.exit(code || 0)
})
