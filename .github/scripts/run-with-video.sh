#!/bin/bash

# This script runs a command inside an Xvfb display and records the screen using FFmpeg.
# It reads configuration from environment variables set in the GitHub Action workflow.
# Usage: ./run-with-video.sh <command to run>

# Exit immediately if a command exits with a non-zero status
set -e

# --- Configuration (Read from Environment) ---
# Required env vars: DISPLAY, SCREEN_SIZE, VIDEO_FILE
export TEST_COMMAND="$@"

# Extract just the display number (e.g., 10 from :10) for xvfb-run -n
# This assumes DISPLAY is set (e.g., in the GH Actions 'env' block)
DISPLAY_NUMBER="${DISPLAY#:}"

# Define the main logic as a function to be executed by xvfb-run
capture_and_test() {

  start_ffmpeg_recording() {
    echo "Starting FFmpeg recording for display ${DISPLAY} in a new session..."

    setsid ffmpeg -loglevel error -f x11grab -video_size "${SCREEN_SIZE}" -r 15 -i "${DISPLAY}" \
      -vcodec libx264 -pix_fmt yuv420p -crf 23 -preset veryfast -y "${VIDEO_FILE}" &

    echo $! > ffmpeg.pid
    echo "FFmpeg recording started with PID $(cat ffmpeg.pid)"
  }

  stop_ffmpeg_recording() {
    if [ -f ffmpeg.pid ]; then
      FFMPEG_PID=$(cat ffmpeg.pid)

      # Check if the process is still running before attempting to kill
      if kill -0 "$FFMPEG_PID" 2>/dev/null; then
        echo "Stopping FFmpeg (PID $FFMPEG_PID) gracefully..."
        kill -SIGINT "$FFMPEG_PID"
        wait "$FFMPEG_PID" 2>/dev/null || true
      else
        echo "FFmpeg (PID $FFMPEG_PID) already terminated."
      fi

      rm ffmpeg.pid
      echo "Video saved to ${VIDEO_FILE}."
    fi
  }

  # Set up the trap for graceful shutdown, runs on EXIT/failure
  trap stop_ffmpeg_recording EXIT

  # Start recording and give it a moment to attach
  start_ffmpeg_recording
  sleep 3

  # Run the actual command. Use set +e to ensure cleanup (the trap) runs if command fails.
  set +e
  echo "Running test command: ${TEST_COMMAND}"

  ${TEST_COMMAND}

  TEST_EXIT_CODE=$?
  set -e

  # The trap will clean up, now we just exit with the test result
  exit $TEST_EXIT_CODE
}

# Execute the capture_and_test function using xvfb-run
xvfb-run -a -n "$DISPLAY_NUMBER" --server-args="-screen 0 ${SCREEN_SIZE}x24" bash -c "$(declare -f capture_and_test); capture_and_test"
