#!/bin/bash
set -e

# ChittyConnect Credential Rotation
# Automates 90-day rotation of service tokens per security policy

echo "=================================================="
echo "ChittyConnect Credential Rotation"
echo "=================================================="
echo ""

# Color codes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
CORE_VAULT="ChittyOS-Core"
DEPLOYMENT_VAULT="ChittyOS-Deployment"
ROTATION_INTERVAL_DAYS=90

# Check prerequisites
if ! command -v op &> /dev/null; then
    echo -e "${RED}Error: 1Password CLI not installed${NC}"
    exit 1
fi

if ! op vault list &> /dev/null; then
    echo -e "${RED}Error: Not authenticated to 1Password${NC}"
    exit 1
fi

# Function to check if secret needs rotation
needs_rotation() {
    local item_title=$1
    local vault=$2

    # Get item metadata
    local created_at
    created_at=$(op item get "$item_title" --vault="$vault" --format=json 2>/dev/null | jq -r '.created_at // empty')

    if [ -z "$created_at" ]; then
        echo "unknown"
        return 0
    fi

    # Calculate days since creation
    local created_timestamp=$(date -j -f "%Y-%m-%dT%H:%M:%S" "${created_at%.*}" +%s 2>/dev/null || echo "0")
    local current_timestamp=$(date +%s)
    local days_old=$(( (current_timestamp - created_timestamp) / 86400 ))

    if [ $days_old -ge $ROTATION_INTERVAL_DAYS ]; then
        echo "yes ($days_old days old)"
        return 0
    else
        echo "no ($days_old days old)"
        return 1
    fi
}

# Function to rotate a secret
rotate_secret() {
    local item_title=$1
    local vault=$2
    local token_prefix=$3

    echo -e "${BLUE}Rotating: $item_title${NC}"

    # Generate new token
    local new_token
    new_token="${token_prefix}$(openssl rand -hex 32)"

    # Archive old token (get current value and add to notes)
    local old_token
    old_token=$(op item get "$item_title" --vault="$vault" --fields password 2>/dev/null)

    local rotation_note="Rotated on $(date -u +%Y-%m-%dT%H:%M:%SZ). Previous token: ${old_token:0:16}... (archived)"

    # Update item with new token
    op item edit "$item_title" --vault="$vault" password="$new_token" &>/dev/null

    # Add rotation note
    local current_notes
    current_notes=$(op item get "$item_title" --vault="$vault" --format=json | jq -r '.fields[] | select(.id=="notesPlain") | .value // ""')
    op item edit "$item_title" --vault="$vault" notes="$current_notes

ROTATION LOG:
$rotation_note" &>/dev/null

    echo -e "  ${GREEN}✓ Token rotated successfully${NC}"
    echo -e "  ${YELLOW}⚠ Old token archived in notes (first 16 chars)${NC}"
    echo ""
}

echo "Checking secrets for rotation eligibility..."
echo "Rotation policy: Every $ROTATION_INTERVAL_DAYS days"
echo ""

# Service tokens to check
declare -A SERVICE_TOKENS=(
    ["CHITTY_API_GATEWAY_SERVICE_TOKEN"]="$CORE_VAULT|svc_"
    ["CHITTY_ID_SERVICE_TOKEN"]="$CORE_VAULT|svc_"
)

# API keys to check
declare -A API_KEYS=(
    ["CHITTY_ID_TOKEN"]="$DEPLOYMENT_VAULT|chitty_"
    ["CHITTY_API_KEY"]="$DEPLOYMENT_VAULT|chitty_api_"
    ["CHITTY_REGISTRY_TOKEN"]="$DEPLOYMENT_VAULT|reg_"
)

echo "=================================================="
echo "Service Token Rotation (90-day policy)"
echo "=================================================="
echo ""

NEEDS_ROTATION=()

for token_name in "${!SERVICE_TOKENS[@]}"; do
    IFS='|' read -r vault prefix <<< "${SERVICE_TOKENS[$token_name]}"

    echo -n "Checking $token_name... "
    rotation_status=$(needs_rotation "$token_name" "$vault")
    echo "$rotation_status"

    if [[ "$rotation_status" == yes* ]]; then
        NEEDS_ROTATION+=("$token_name|$vault|$prefix")
    fi
done

echo ""
echo "=================================================="
echo "API Key Rotation (180-day policy - not yet due)"
echo "=================================================="
echo ""

for token_name in "${!API_KEYS[@]}"; do
    IFS='|' read -r vault prefix <<< "${API_KEYS[$token_name]}"

    echo -n "Checking $token_name... "
    rotation_status=$(needs_rotation "$token_name" "$vault")
    echo "$rotation_status (API keys rotated every 180 days)"
done

echo ""

# Perform rotation if needed
if [ ${#NEEDS_ROTATION[@]} -eq 0 ]; then
    echo -e "${GREEN}✓ No tokens require rotation at this time${NC}"
    echo ""
    echo "Next rotation check: $(date -v+${ROTATION_INTERVAL_DAYS}d +%Y-%m-%d)"
    exit 0
fi

echo "=================================================="
echo "Tokens Requiring Rotation"
echo "=================================================="
echo ""

for item in "${NEEDS_ROTATION[@]}"; do
    echo "  - ${item%%|*}"
done

echo ""
echo -e "${YELLOW}WARNING: Rotating tokens will invalidate current credentials${NC}"
echo "After rotation, you must:"
echo "  1. Update Wrangler secrets: ./scripts/chittyconnect-sync-wrangler-secrets.sh"
echo "  2. Redeploy workers: wrangler deploy"
echo "  3. Re-register service tokens in ChittyAuth"
echo "  4. Update GitHub secrets if API keys rotated"
echo ""

read -p "Proceed with rotation? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "Rotation cancelled."
    exit 0
fi

echo ""
echo "=================================================="
echo "Performing Rotation"
echo "=================================================="
echo ""

for item in "${NEEDS_ROTATION[@]}"; do
    IFS='|' read -r token_name vault prefix <<< "$item"
    rotate_secret "$token_name" "$vault" "$prefix"
done

echo "=================================================="
echo "Rotation Complete"
echo "=================================================="
echo ""
echo -e "${GREEN}✓ All tokens rotated successfully${NC}"
echo ""
echo "Required follow-up actions:"
echo ""
echo "1. Sync Wrangler secrets:"
echo "   cd /Users/nb/chittyos/dev/cli"
echo "   ./scripts/chittyconnect-sync-wrangler-secrets.sh"
echo ""
echo "2. Deploy updated workers:"
echo "   cd chittyos-api-gateway && wrangler deploy"
echo ""
echo "3. Re-register service tokens in ChittyAuth:"
echo "   See: docs/CHITTYCONNECT_1PASSWORD_SETUP.md (Service Registration section)"
echo ""
echo "4. Validate connections:"
echo "   ./scripts/chittyconnect-validate-connections.sh"
echo ""
echo "Rotation completed on: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
