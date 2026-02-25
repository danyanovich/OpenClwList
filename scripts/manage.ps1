# Configuration
$PORT = 3010
$HOST = "0.0.0.0"
$PID_FILE = "./data/dashboard.pid"
$LOG_FILE = "./logs/dashboard.log"

function Start-Dashboard {
    if (Test-Path $PID_FILE) {
        $oldPid = Get-Content $PID_FILE
        if (Get-Process -Id $oldPid -ErrorAction SilentlyContinue) {
            Write-Host "Dashboard is already running (PID: $oldPid)."
            return
        }
    }
    
    Write-Host "Starting dashboard on http://$($HOST):$PORT..."
    if (-not (Test-Path "logs")) { New-Item -ItemType Directory "logs" }
    if (-not (Test-Path "data")) { New-Item -ItemType Directory "data" }
    
    $process = Start-Process -FilePath "npx" -ArgumentList "tsx watch src/server.ts" -NoNewWindow -PassThru -RedirectStandardOutput $LOG_FILE -RedirectStandardError $LOG_FILE
    $process.Id | Out-File -FilePath $PID_FILE -Encoding ascii
    Write-Host "Dashboard started in background (PID: $($process.Id)). Logs: $LOG_FILE"
}

function Stop-Dashboard {
    if (Test-Path $PID_FILE) {
        $pid = Get-Content $PID_FILE
        Write-Host "Stopping dashboard (PID: $pid)..."
        Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
        Remove-Item $PID_FILE
        Write-Host "Dashboard stopped."
    } else {
        Write-Host "Dashboard is not running."
    }
}

function Get-DashboardStatus {
    if (Test-Path $PID_FILE) {
        $pid = Get-Content $PID_FILE
        if (Get-Process -Id $pid -ErrorAction SilentlyContinue) {
            Write-Host "Dashboard is running (PID: $pid)."
            Write-Host "URL: http://localhost:$PORT"
        } else {
            Write-Host "Dashboard is not running (stale PID file found)."
        }
    } else {
        Write-Host "Dashboard is not running."
    }
}

switch ($args[0]) {
    "start" { Start-Dashboard }
    "stop" { Stop-Dashboard }
    "status" { Get-DashboardStatus }
    "logs" { Get-Content -Path $LOG_FILE -Wait }
    default { Write-Host "Usage: .\scripts\manage.ps1 {start|stop|status|logs}" }
}
