#!/bin/bash

# Wrapper script to run Python ingestion with proper env vars

# Check if .env file exists
if [ ! -f .env ]; then
    echo "Error: .env file not found. Please create one with required environment variables."
    exit 1
fi

# Check if PDF file exists
if [ ! -f ./data/part1.pdf ]; then
    echo "Error: PDF file not found at ./data/part1.pdf"
    exit 1
fi

# Load .env file
export $(cat .env | grep -v '^#' | xargs)

# Set default DOC_ID if not set
export DOC_ID=${DOC_ID:-part1-2020}

# Run Python ingestion
python ingest/main.py

