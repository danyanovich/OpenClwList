#!/usr/bin/env bash

# Configuration
PORT=3010
HOST="0.0.0.0"
PID_FILE="./data/dashboard.pid"
LOG_FILE="./logs/dashboard.log"

# Commands
case "$1" in
  start)
    if [ -f "$PID_FILE" ] && kill -0 $(cat "$PID_FILE") 2>/dev/null; then
      echo "Dashboard is already running (PID: $(cat $PID_FILE))."
      exit 1
    fi
    echo "Starting dashboard on http://$HOST:$PORT..."
    mkdir -p logs data
    nohup npx tsx watch src/server.ts > "$LOG_FILE" 2>&1 &
    echo $! > "$PID_FILE"
    echo "Dashboard started in background. Logs: $LOG_FILE"
    ;;
  stop)
    if [ -f "$PID_FILE" ]; then
      PID=$(cat "$PID_FILE")
      echo "Stopping dashboard (PID: $PID)..."
      kill "$PID" && rm "$PID_FILE"
      echo "Dashboard stopped."
    else
      echo "Dashboard is not running."
    fi
    ;;
  status)
    if [ -f "$PID_FILE" ] && kill -0 $(cat "$PID_FILE") 2>/dev/null; then
      echo "Dashboard is running (PID: $(cat $PID_FILE))."
      echo "URL: http://$([ "$HOST" == "0.0.0.0" ] && echo "localhost" || echo "$HOST"):$PORT"
    else
      echo "Dashboard is not running."
    fi
    ;;
  logs)
    tail -f "$LOG_FILE"
    ;;
  *)
    echo "Usage: $0 {start|stop|status|logs}"
    exit 1
    ;;
esac
