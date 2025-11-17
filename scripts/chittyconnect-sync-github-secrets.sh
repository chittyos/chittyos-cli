#!/bin/bash
set -e

# ChittyConnect GitHub Secrets Sync
# Provisions secrets from 1Password to GitHub repository

echo "=================================================="
echo "ChittyConnect GitHub Secrets Sync"
echo "=================================================="
echo ""

# Color codes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Configuration
REPO="chittyos/cli"
VAULT="ChittyOS-Deployment"

# Check prerequisites
if ! command -v op &> /dev/null; then
    echo -e "${RED}Error: 1Password CLI (op) not installed${NC}"
    exit 1
fi

if ! command -v gh &> /dev/null; then
    echo -e "${RED}Error: GitHub CLI (gh) not installed${NC}"
    exit 1
fi

# Verify authentication
echo "Verifying authentication..."
if ! op vault list &> /dev/null; then
    echo -e "${RED}Error: Not authenticated to 1Password${NC}"
    exit 1
fi

if ! gh auth status &> /dev/null; then
    echo -e "${RED}Error: Not authenticated to GitHub${NC}"
    echo "Run: gh auth login"
    exit 1
fi

echo -e "${GREEN}✓ Authenticated to 1Password and GitHub${NC}"
echo ""

# Function to sync secret from 1Password to GitHub
sync_secret() {
    local secret_name=$1
    local item_title=${2:-$secret_name}  # Use secret_name as item_title if not provided

    echo -n "Syncing $secret_name... "

    # Retrieve secret from 1Password
    local secret_value
    if ! secret_value=$(op item get "$item_title" --vault="$VAULT" --fields password 2>/dev/null); then
        echo -e "${RED}FAILED${NC}"
        echo -e "  ${YELLOW}Warning: '$item_title' not found in 1Password vault '$VAULT'${NC}"
        return 1
    fi

    # Set secret in GitHub
    if echo "$secret_value" | gh secret set "$secret_name" --repo="$REPO" 2>/dev/null; then
        echo -e "${GREEN}✓${NC}"
        return 0
    else
        echo -e "${RED}FAILED${NC}"
        return 1
    fi
}

echo "Syncing secrets to repository: $REPO"
echo "Source: 1Password vault '$VAULT'"
echo ""

# Track results
TOTAL=0
SUCCESS=0
FAILED=0

# Sync all required secrets
SECRETS=(
    "CHITTY_ID_TOKEN"
    "CHITTY_API_KEY"
    "CHITTY_REGISTRY_TOKEN"
    "CLOUDFLARE_API_TOKEN"
    "CLOUDFLARE_ACCOUNT_ID"
    "NPM_TOKEN"
)

for secret in "${SECRETS[@]}"; do
    ((TOTAL++))
    if sync_secret "$secret"; then
        ((SUCCESS++))
    else
        ((FAILED++))
    fi
done

echo ""
echo "=================================================="
echo "Sync Summary"
echo "=================================================="
echo "Total secrets: $TOTAL"
echo -e "Synced successfully: ${GREEN}$SUCCESS${NC}"
echo -e "Failed: ${RED}$FAILED${NC}"
echo ""

# Verify secrets in GitHub
echo "Verifying secrets in GitHub repository..."
echo ""
gh secret list --repo="$REPO"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All secrets synced successfully!${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Configure Wrangler secrets: ./scripts/chittyconnect-sync-wrangler-secrets.sh"
    echo "2. Test GitHub Actions workflow: gh workflow run npm-publish-certified.yml"
    exit 0
else
    echo -e "${YELLOW}⚠ Some secrets failed to sync${NC}"
    echo "Review the errors above and ensure secrets exist in 1Password."
    echo "Run: op item list --vault='$VAULT'"
    exit 1
fi
