#!/bin/bash
set -e

# ChittyConnect Wrangler Secrets Sync
# Provisions secrets from 1Password to Cloudflare Workers via Wrangler

echo "=================================================="
echo "ChittyConnect Wrangler Secrets Sync"
echo "=================================================="
echo ""

# Color codes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Configuration
WORKER_DIR="/Users/nb/chittyos/dev/cli/chittyos-api-gateway"
CORE_VAULT="ChittyOS-Core"
CONNECT_VAULT="ChittyConnect Only"

# Check prerequisites
if ! command -v op &> /dev/null; then
    echo -e "${RED}Error: 1Password CLI (op) not installed${NC}"
    exit 1
fi

if ! command -v wrangler &> /dev/null; then
    echo -e "${RED}Error: Wrangler CLI not installed${NC}"
    exit 1
fi

# Verify authentication
echo "Verifying authentication..."
if ! op vault list &> /dev/null; then
    echo -e "${RED}Error: Not authenticated to 1Password${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Authenticated to 1Password${NC}"
echo ""

# Change to worker directory
if [ ! -d "$WORKER_DIR" ]; then
    echo -e "${RED}Error: Worker directory not found: $WORKER_DIR${NC}"
    exit 1
fi

cd "$WORKER_DIR"
echo "Working directory: $WORKER_DIR"
echo ""

# Function to sync secret from 1Password to Wrangler
sync_wrangler_secret() {
    local secret_name=$1
    local item_title=$2
    local vault=$3

    echo -n "Syncing $secret_name from $vault... "

    # Retrieve secret from 1Password
    local secret_value
    if ! secret_value=$(op item get "$item_title" --vault="$vault" --fields password 2>/dev/null); then
        echo -e "${RED}FAILED${NC}"
        echo -e "  ${YELLOW}Warning: '$item_title' not found in vault '$vault'${NC}"
        return 1
    fi

    # Set secret in Wrangler (pipe to avoid exposing on command line)
    if echo "$secret_value" | wrangler secret put "$secret_name" --env production 2>/dev/null; then
        echo -e "${GREEN}✓${NC}"
        return 0
    else
        echo -e "${RED}FAILED${NC}"
        return 1
    fi
}

echo "Syncing secrets to Cloudflare Worker: chittyos-api-gateway"
echo ""

# Track results
TOTAL=0
SUCCESS=0
FAILED=0

echo "--- Service-to-Service Authentication (ChittyOS-Core) ---"
echo ""

# API Gateway → ChittyAuth
((TOTAL++))
if sync_wrangler_secret "CHITTY_SERVICE_TOKEN" "CHITTY_API_GATEWAY_SERVICE_TOKEN" "$CORE_VAULT"; then
    ((SUCCESS++))
else
    ((FAILED++))
fi

# API Gateway → ChittyID
((TOTAL++))
if sync_wrangler_secret "CHITTY_ID_SERVICE_TOKEN" "CHITTY_ID_SERVICE_TOKEN" "$CORE_VAULT"; then
    ((SUCCESS++))
else
    ((FAILED++))
fi

echo ""
echo "--- Third-Party Service Credentials (ChittyConnect) ---"
echo ""

# Notion integration
((TOTAL++))
if sync_wrangler_secret "CHITTY_NOTION_TOKEN" "CHITTY_NOTION_TOKEN" "$CONNECT_VAULT"; then
    ((SUCCESS++))
else
    ((FAILED++))
fi

# Stripe integration
((TOTAL++))
if sync_wrangler_secret "CHITTY_STRIPE_SECRET_KEY" "CHITTY_STRIPE_SECRET_KEY" "$CONNECT_VAULT"; then
    ((SUCCESS++))
else
    ((FAILED++))
fi

# DocuSign integration
((TOTAL++))
if sync_wrangler_secret "CHITTY_DOCUSIGN_ACCESS_TOKEN" "CHITTY_DOCUSIGN_ACCESS_TOKEN" "$CONNECT_VAULT"; then
    ((SUCCESS++))
else
    ((FAILED++))
fi

# Blockchain integration
((TOTAL++))
if sync_wrangler_secret "CHITTY_BLOCKCHAIN_RPC_URL" "CHITTY_BLOCKCHAIN_RPC_URL" "$CONNECT_VAULT"; then
    ((SUCCESS++))
else
    ((FAILED++))
fi

((TOTAL++))
if sync_wrangler_secret "CHITTY_CONTRACT_ADDRESS" "CHITTY_CONTRACT_ADDRESS" "$CONNECT_VAULT"; then
    ((SUCCESS++))
else
    ((FAILED++))
fi

echo ""
echo "=================================================="
echo "Sync Summary"
echo "=================================================="
echo "Total secrets: $TOTAL"
echo -e "Synced successfully: ${GREEN}$SUCCESS${NC}"
echo -e "Failed: ${RED}$FAILED${NC}"
echo ""

# Verify secrets in Wrangler
echo "Verifying secrets in Cloudflare Workers..."
echo ""
wrangler secret list --env production 2>/dev/null || wrangler secret list
echo ""

if [ $FAILED -gt 0 ]; then
    echo -e "${YELLOW}⚠ Some secrets failed to sync${NC}"
    echo ""
    echo "Common reasons:"
    echo "  - Secret not found in 1Password vault"
    echo "  - Not authenticated to Cloudflare (run: wrangler login)"
    echo "  - Insufficient permissions for worker"
    echo ""
    echo "To check 1Password secrets:"
    echo "  op item list --vault='$CORE_VAULT'"
    echo "  op item list --vault='$CONNECT_VAULT'"
    exit 1
fi

echo -e "${GREEN}✓ All secrets synced successfully!${NC}"
echo ""
echo "Next steps:"
echo "1. Deploy worker with new secrets: wrangler deploy"
echo "2. Test service connections: curl https://chittyos-api-gateway.ccorp.workers.dev/api/v1/status"
echo "3. Verify authentication: Check logs for service token validation"
