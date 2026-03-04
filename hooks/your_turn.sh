#!/usr/bin/env bash
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*|Windows_NT)
    powershell -NoProfile -Command "(New-Object Media.SoundPlayer 'C:\Users\tomasz.romanowski\downloads\your_turn.wav').PlaySync()"
    ;;
  Linux)
    bash your_turn
    ;;
esac
