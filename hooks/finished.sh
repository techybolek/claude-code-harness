#!/usr/bin/env bash
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*|Windows_NT)
    powershell -NoProfile -Command "(New-Object Media.SoundPlayer 'C:\Users\tomasz.romanowski\downloads\finished.wav').PlaySync()"
    ;;
  Linux)
    bash finished
    ;;
esac
