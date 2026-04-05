#!/bin/bash
# ============================================
# RUBS Bill Download Script — Template
# ============================================
# This script is triggered by the Moxie RUBS app to download
# utility bills from LADWP and SoCal Gas.
#
# Customize this script to match your Claude cowork process.
#
# Usage: ./download-bills.sh [provider]
#   provider: "ladwp", "socalgas", or "all" (default)
#
# Environment:
#   RUBS_BILLS_FOLDER - where to save downloaded PDFs
#
# The script should download PDF bills and save them to $RUBS_BILLS_FOLDER.
# The Moxie app will then scan this folder and use AI to parse the bills.

set -e

PROVIDER="${1:-all}"
OUTPUT_DIR="${RUBS_BILLS_FOLDER:-$HOME/utility-bills}"
LOG_FILE="/tmp/rubs-download.log"

echo "[$(date)] Starting bill download for provider: $PROVIDER" | tee "$LOG_FILE"

# Create output directory if needed
mkdir -p "$OUTPUT_DIR"

# ─── CUSTOMIZE BELOW ────────────────────────────────────────────
# Replace the placeholder commands below with your actual
# Claude cowork / computer use commands to download bills.
#
# Example using Claude CLI:
#   claude --print "Log into LADWP at ladwp.com with username X,
#   navigate to billing, download the latest bill PDF, and save
#   it to $OUTPUT_DIR"
#
# Example for multiple accounts:
#   for account in "account1" "account2" "account3"; do
#     claude --print "Log into LADWP account $account..."
#   done

if [ "$PROVIDER" = "ladwp" ] || [ "$PROVIDER" = "all" ]; then
  echo "[$(date)] Downloading LADWP bills..." | tee -a "$LOG_FILE"
  # TODO: Add your LADWP download commands here
  # claude --print "Download LADWP bills to $OUTPUT_DIR"
  echo "[$(date)] LADWP download placeholder — configure with your cowork commands" | tee -a "$LOG_FILE"
fi

if [ "$PROVIDER" = "socalgas" ] || [ "$PROVIDER" = "all" ]; then
  echo "[$(date)] Downloading SoCal Gas bills..." | tee -a "$LOG_FILE"
  # TODO: Add your SoCal Gas download commands here
  # claude --print "Download SoCal Gas bills to $OUTPUT_DIR"
  echo "[$(date)] SoCal Gas download placeholder — configure with your cowork commands" | tee -a "$LOG_FILE"
fi

echo "[$(date)] Download complete." | tee -a "$LOG_FILE"
