#!/bin/bash

# Simple script to serve the BEVE documentation locally

PORT=8000
DIR="docs"

echo "========================================"
echo "BEVE Documentation Local Server"
echo "========================================"
echo ""
echo "Starting server on http://localhost:$PORT"
echo ""
echo "Open your browser and visit:"
echo "  → http://localhost:$PORT"
echo ""
echo "Press Ctrl+C to stop the server"
echo "========================================"
echo ""

cd "$DIR" && python3 -m http.server $PORT
