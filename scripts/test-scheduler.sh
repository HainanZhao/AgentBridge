#!/bin/bash

# Test script for scheduler API
# This script tests the scheduler API endpoints

BASE_URL="http://127.0.0.1:8787"

echo "=== Scheduler API Test ==="
echo ""

# Test 1: Health check
echo "1. Testing health check..."
curl -s "${BASE_URL}/healthz" | jq .
echo ""

# Test 2: Create a recurring schedule (every minute)
echo "2. Creating a recurring schedule (every minute)..."
RECURRING_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/schedule" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What time is it now?",
    "description": "Test recurring schedule - every minute",
    "cronExpression": "* * * * *"
  }')
echo "$RECURRING_RESPONSE" | jq .
SCHEDULE_ID=$(echo "$RECURRING_RESPONSE" | jq -r '.schedule.id')
echo "Created schedule ID: $SCHEDULE_ID"
echo ""

# Test 3: Create a one-time schedule (30 seconds from now)
echo "3. Creating a one-time schedule (30 seconds from now)..."
if ! RUN_AT=$(date -u -d "+30 seconds" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null); then
  # Fallback for macOS/BSD date
  RUN_AT=$(date -u -v+30S +"%Y-%m-%dT%H:%M:%SZ")
fi
ONE_TIME_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/schedule" \
  -H "Content-Type: application/json" \
  -d "{
    \"message\": \"This is a one-time scheduled message\",
    \"description\": \"Test one-time schedule\",
    \"oneTime\": true,
    \"runAt\": \"${RUN_AT}\"
  }")
echo "$ONE_TIME_RESPONSE" | jq .
ONE_TIME_ID=$(echo "$ONE_TIME_RESPONSE" | jq -r '.schedule.id')
echo "Created one-time schedule ID: $ONE_TIME_ID"
echo ""

# Test 4: List all schedules
echo "4. Listing all schedules..."
curl -s "${BASE_URL}/api/schedule" | jq .
echo ""

# Test 5: Get a specific schedule
echo "5. Getting schedule by ID..."
curl -s "${BASE_URL}/api/schedule/${SCHEDULE_ID}" | jq .
echo ""

# Test 6: Wait for 65 seconds to see recurring job execute
echo "6. Waiting 65 seconds to observe recurring job execution..."
echo "   (Check the bridge logs to see the job execute)"
sleep 65
echo ""

# Test 7: Delete the recurring schedule
echo "7. Deleting recurring schedule..."
curl -s -X DELETE "${BASE_URL}/api/schedule/${SCHEDULE_ID}" | jq .
echo ""

# Test 8: List schedules again (should only have one-time if it hasn't run yet)
echo "8. Listing schedules after deletion..."
curl -s "${BASE_URL}/api/schedule" | jq .
echo ""

echo "=== Test Complete ==="
echo ""
echo "Note: Make sure the bridge is running before executing this script."
echo "To run the bridge: npm run dev"
