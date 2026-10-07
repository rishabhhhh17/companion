#!/bin/bash
# Stop any running Panel Spike (release bundle or dev binary). Never touches other apps.
pkill -f "Panel Spike.app/Contents/MacOS/" 2>/dev/null
pkill -f "src-tauri/target/debug/panel-spike" 2>/dev/null
pkill -f "src-tauri/target/release/panel-spike" 2>/dev/null
sleep 0.5
exit 0
