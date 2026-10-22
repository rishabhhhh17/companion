#!/bin/bash
# Stops a running copy of the app (the current bundle name, and the one it had before F24).
pkill -f "Squibby.app/Contents/MacOS/" 2>/dev/null; pkill -f "Companion.app/Contents/MacOS/" 2>/dev/null; sleep 0.5; exit 0
