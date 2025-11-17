#!/bin/bash

# ChittyConnect Connection Validation
# Tests secure connections and zero-trust authentication flows

echo "=================================================="
echo "ChittyConnect Connection Validation"
echo "=================================================="
echo ""

# Color codes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
CHITTY_ID_SERVICE="https://id.chitty.cc"
API_GATEWAY="https://chittyos-api-gateway.ccorp.workers.dev"
CHITTYAUTH_URL="https://chittyauth-mcp-121.chittycorp-llc.workers.dev"

# Check prerequisites
if ! command -v op &> /dev/null; then
    echo -e "${RED}Error: 1Password CLI (op) not installed${NC}"
    exit 1
fi

if ! command -v jq &> /dev/null; then
    echo -e "${RED}Error: jq not installed (required for JSON parsing)${NC}"
    exit 1
fi

# Verify 1Password authentication
if ! op vault list &> /dev/null; then
    echo -e "${RED}Error: Not authenticated to 1Password${NC}"
    exit 1
fi

# Track test results
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Function to run test
run_test() {
    local test_name=$1
    local test_command=$2
    local expected_status=${3:-200}

    ((TOTAL_TESTS++))
    echo -e "${BLUE}Test $TOTAL_TESTS: $test_name${NC}"

    # Execute command and capture response
    local response
    local http_status

    response=$(eval "$test_command" 2>&1)
    http_status=$(echo "$response" | grep -oE "HTTP/[0-9.]+ [0-9]+" | tail -1 | awk '{print $2}')

    # If no HTTP status found, try parsing as curl output
    if [ -z "$http_status" ]; then
        http_status=$(echo "$response" | tail -1 | jq -r '.status // empty' 2>/dev/null)
    fi

    # Validate result
    if [ "$http_status" = "$expected_status" ] || echo "$response" | grep -q "\"status\":\"operational\"" || echo "$response" | grep -q "\"valid\":true"; then
        echo -e "  ${GREEN}✓ PASSED${NC}"
        ((PASSED_TESTS++))
        if echo "$response" | jq . &>/dev/null; then
            echo "$response" | jq . | head -10
        else
            echo "$response" | head -5
        fi
    else
        echo -e "  ${RED}✗ FAILED${NC}"
        echo -e "  Expected status: $expected_status, Got: ${http_status:-unknown}"
        echo "$response" | head -10
        ((FAILED_TESTS++))
    fi

    echo ""
}

echo "=================================================="
echo "Test Suite 1: Service Health Checks"
echo "=================================================="
echo ""

run_test "API Gateway health endpoint" \
    "curl -s https://chittyos-api-gateway.ccorp.workers.dev/health"

run_test "API Gateway status endpoint" \
    "curl -s https://chittyos-api-gateway.ccorp.workers.dev/api/v1/status"

echo "=================================================="
echo "Test Suite 2: GitHub Actions Credentials"
echo "=================================================="
echo ""

run_test "CHITTY_ID_TOKEN authentication (ChittyID certificate request)" \
    "curl -s -X POST '$CHITTY_ID_SERVICE/v1/certificates/issue' \
        -H 'Authorization: Bearer $(op item get 'CHITTY_ID_TOKEN' --vault='ChittyOS-Deployment' --fields password 2>/dev/null)' \
        -H 'Content-Type: application/json' \
        -d '{\"type\":\"test\",\"package_name\":\"@chittyos/test\",\"version\":\"0.0.1\"}'" \
    "200"

run_test "CHITTY_API_KEY authentication (Chronicle event)" \
    "curl -s -X POST '$API_GATEWAY/chronicle/events' \
        -H 'Authorization: Bearer $(op item get 'CHITTY_API_KEY' --vault='ChittyOS-Deployment' --fields password 2>/dev/null)' \
        -H 'Content-Type: application/json' \
        -d '{\"event_type\":\"test.validation\",\"metadata\":{\"test\":true}}'" \
    "200"

run_test "CHITTY_REGISTRY_TOKEN authentication (Registry access)" \
    "curl -s -X POST '$API_GATEWAY/registry/api/packages/register' \
        -H 'Authorization: Bearer $(op item get 'CHITTY_REGISTRY_TOKEN' --vault='ChittyOS-Deployment' --fields password 2>/dev/null)' \
        -H 'Content-Type: application/json' \
        -d '{\"package_name\":\"@chittyos/test\",\"version\":\"0.0.1\",\"status\":\"test\"}'" \
    "200"

echo "=================================================="
echo "Test Suite 3: Service-to-Service Authentication"
echo "=================================================="
echo ""

run_test "API Gateway service token (ChittyAuth validation)" \
    "curl -s -X POST '$CHITTYAUTH_URL/v1/service/validate' \
        -H 'Authorization: Bearer $(op item get 'CHITTY_API_GATEWAY_SERVICE_TOKEN' --vault='ChittyOS-Core' --fields password 2>/dev/null)' \
        -H 'Content-Type: application/json' \
        -d '{\"service_token\":\"$(op item get 'CHITTY_API_GATEWAY_SERVICE_TOKEN' --vault='ChittyOS-Core' --fields password 2>/dev/null)\"}'" \
    "200"

run_test "ChittyID service token (Certificate verification)" \
    "curl -s -X POST '$CHITTY_ID_SERVICE/v1/service/validate' \
        -H 'Authorization: Bearer $(op item get 'CHITTY_ID_SERVICE_TOKEN' --vault='ChittyOS-Core' --fields password 2>/dev/null)' \
        -H 'Content-Type: application/json'" \
    "200"

echo "=================================================="
echo "Test Suite 4: Public Endpoints (No Auth Required)"
echo "=================================================="
echo ""

run_test "Chronicle events - public read" \
    "curl -s -X GET '$API_GATEWAY/chronicle/events?limit=5'"

run_test "Registry packages - public read" \
    "curl -s -X GET '$API_GATEWAY/registry/packages'"

echo "=================================================="
echo "Test Suite 5: Zero-Trust Enforcement"
echo "=================================================="
echo ""

run_test "Chronicle POST without auth (should fail)" \
    "curl -s -X POST '$API_GATEWAY/chronicle/events' \
        -H 'Content-Type: application/json' \
        -d '{\"event_type\":\"test\"}'" \
    "401"

run_test "Registry POST without auth (should fail)" \
    "curl -s -X POST '$API_GATEWAY/registry/api/packages/register' \
        -H 'Content-Type: application/json' \
        -d '{\"package_name\":\"test\"}'" \
    "401"

run_test "Invalid token format (should fail)" \
    "curl -s -X POST '$API_GATEWAY/chronicle/events' \
        -H 'Authorization: Bearer invalid_token_format' \
        -H 'Content-Type: application/json' \
        -d '{\"event_type\":\"test\"}'" \
    "401"

echo "=================================================="
echo "Test Results Summary"
echo "=================================================="
echo ""
echo "Total tests run: $TOTAL_TESTS"
echo -e "Passed: ${GREEN}$PASSED_TESTS${NC}"
echo -e "Failed: ${RED}$FAILED_TESTS${NC}"
echo ""

if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "${GREEN}✓ All tests passed! ChittyConnect is properly configured.${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Test full NPM publishing workflow: gh workflow run npm-publish-certified.yml"
    echo "2. Monitor Chronicle events: curl $API_GATEWAY/chronicle/events"
    echo "3. Review audit logs in Cloudflare dashboard"
    exit 0
else
    echo -e "${YELLOW}⚠ Some tests failed${NC}"
    echo ""
    echo "Troubleshooting steps:"
    echo "1. Verify secrets in 1Password: op item list --vault='ChittyOS-Core'"
    echo "2. Check Wrangler secrets: cd chittyos-api-gateway && wrangler secret list"
    echo "3. Review service logs: wrangler tail"
    echo "4. Validate service registration in ChittyAuth"
    exit 1
fi
