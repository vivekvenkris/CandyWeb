#!/bin/bash

# CandyWeb Backend Startup Script

echo "Starting CandyWeb Backend..."

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install dependencies
echo "Installing dependencies..."
pip install -r requirements.txt

# Run the application
echo "Starting FastAPI server on http://0.0.0.0:8000"
python -m app.main
