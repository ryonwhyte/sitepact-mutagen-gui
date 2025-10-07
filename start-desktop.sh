#!/bin/bash

# Mutagen GUI Desktop Application Launcher

# Load nvm if available
if [ -s "$HOME/.nvm/nvm.sh" ]; then
    source "$HOME/.nvm/nvm.sh"
    nvm use default >/dev/null 2>&1
fi

echo "====================================="
echo "Starting Mutagen GUI Desktop App"
echo "====================================="
echo "Using Node.js $(node --version)"

# Check if mutagen is installed
if ! command -v mutagen &> /dev/null; then
    echo "Error: Mutagen is not installed or not in PATH"
    echo "Please install Mutagen first: https://mutagen.io/documentation/introduction/installation"
    exit 1
fi

# Navigate to frontend directory
cd frontend

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Start the Electron app in development mode
echo "Launching desktop application..."
npm run electron-dev

cd ..