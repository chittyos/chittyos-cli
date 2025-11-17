#!/bin/bash
set -e

# ChittyConnect × 1Password Secret Provisioning
# Automates secure credential generation and storage for ChittyOS NPM publishing

echo "=================================================="
echo "ChittyConnect × 1Password Secret Provisioning"
echo "=================================================="
echo ""

# Color codes for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check prerequisites
echo "Checking prerequisites..."

if ! command -v op &> /dev/null; then
    echo -e "${RED}Error: 1Password CLI (op) is not installed${NC}"
    echo "Install from: https://developer.1password.com/docs/cli/get-started/"
    exit 1
fi

if ! command -v gh &> /dev/null; then
    echo -e "${RED}Error: GitHub CLI (gh) is not installed${NC}"
    echo "Install from: https://cli.github.com/"
    exit 1
fi

if ! command -v wrangler &> /dev/null; then
    echo -e "${RED}Error: Wrangler CLI is not installed${NC}"
    echo "Install with: npm install -g wrangler"
    exit 1
fi

echo -e "${GREEN}✓ All prerequisites installed${NC}"
echo ""

# Verify 1Password authentication
echo "Verifying 1Password authentication..."
if ! op vault list &> /dev/null; then
    echo -e "${RED}Error: Not authenticated to 1Password${NC}"
    echo "Run: op signin"
    exit 1
fi
echo -e "${GREEN}✓ 1Password authenticated${NC}"
echo ""

# Verify vaults exist
echo "Verifying 1Password vaults..."
VAULTS_NEEDED=("ChittyOS-Core" "ChittyOS-Deployment" "ChittyConnect Only")
MISSING_VAULTS=()

for vault in "${VAULTS_NEEDED[@]}"; do
    if ! op vault get "$vault" &> /dev/null; then
        MISSING_VAULTS+=("$vault")
    fi
done

if [ ${#MISSING_VAULTS[@]} -ne 0 ]; then
    echo -e "${YELLOW}Warning: Missing vaults: ${MISSING_VAULTS[*]}${NC}"
    echo "These vaults will be created."

    for vault in "${MISSING_VAULTS[@]}"; do
        echo "Creating vault: $vault"
        op vault create "$vault" || echo -e "${YELLOW}Could not create vault (may require permissions)${NC}"
    done
fi

echo -e "${GREEN}✓ 1Password vaults ready${NC}"
echo ""

# Function to generate secure token
generate_token() {
    local prefix=$1
    openssl rand -hex 32 | awk -v p="$prefix" '{print p $0}'
}

# Function to create 1Password item if it doesn't exist
create_or_update_secret() {
    local title=$1
    local vault=$2
    local value=$3
    local notes=$4
    local tags=$5

    if op item get "$title" --vault="$vault" &> /dev/null; then
        echo -e "${YELLOW}  ↻ Updating existing secret: $title${NC}"
        op item edit "$title" --vault="$vault" password="$value" &> /dev/null
    else
        echo -e "${GREEN}  + Creating new secret: $title${NC}"
        op item create \
            --category=password \
            --title="$title" \
            --vault="$vault" \
            --tags="$tags" \
            password="$value" \
            notes="$notes" &> /dev/null
    fi
}

echo "=================================================="
echo "Step 1: Generate Service Authentication Tokens"
echo "=================================================="
echo ""

# API Gateway → ChittyAuth
echo "Generating API Gateway service token..."
CHITTY_SERVICE_TOKEN=$(generate_token "svc_")
create_or_update_secret \
    "CHITTY_API_GATEWAY_SERVICE_TOKEN" \
    "ChittyOS-Core" \
    "$CHITTY_SERVICE_TOKEN" \
    "Service token for API Gateway to ChittyAuth authentication. Scopes: auth:validate, permission:check. Rotation: 90 days." \
    "service-token,api-gateway,chittyauth"

# API Gateway → ChittyID
echo "Generating ChittyID service token..."
CHITTY_ID_SERVICE_TOKEN=$(generate_token "svc_")
create_or_update_secret \
    "CHITTY_ID_SERVICE_TOKEN" \
    "ChittyOS-Core" \
    "$CHITTY_ID_SERVICE_TOKEN" \
    "Service token for API Gateway to ChittyID certificate operations. Scopes: certificate:issue, certificate:verify. Rotation: 90 days." \
    "service-token,chittyid,certificate"

echo -e "${GREEN}✓ Service tokens generated and stored${NC}"
echo ""

echo "=================================================="
echo "Step 2: Generate GitHub Actions API Tokens"
echo "=================================================="
echo ""

# GitHub Actions → ChittyID
echo "Generating CHITTY_ID_TOKEN..."
CHITTY_ID_TOKEN=$(generate_token "chitty_")_$(date +%s)
create_or_update_secret \
    "CHITTY_ID_TOKEN" \
    "ChittyOS-Deployment" \
    "$CHITTY_ID_TOKEN" \
    "API key for GitHub Actions to request ChittyID certificates. Scopes: certificate:request. Used in npm-publish-certified.yml workflow." \
    "github-actions,chittyid,api-key"

# GitHub Actions → API Gateway
echo "Generating CHITTY_API_KEY..."
CHITTY_API_KEY=$(generate_token "chitty_api_")_$(date +%s)
create_or_update_secret \
    "CHITTY_API_KEY" \
    "ChittyOS-Deployment" \
    "$CHITTY_API_KEY" \
    "API key for GitHub Actions to access Chronicle and Registry services. Scopes: chronicle:write, registry:write." \
    "github-actions,api-gateway,chronicle,registry"

# GitHub Actions → Registry
echo "Generating CHITTY_REGISTRY_TOKEN..."
CHITTY_REGISTRY_TOKEN=$(generate_token "reg_")
create_or_update_secret \
    "CHITTY_REGISTRY_TOKEN" \
    "ChittyOS-Deployment" \
    "$CHITTY_REGISTRY_TOKEN" \
    "Service token for GitHub Actions to register packages. Scopes: registry:write, package:publish." \
    "github-actions,registry,package"

echo -e "${GREEN}✓ GitHub Actions tokens generated and stored${NC}"
echo ""

echo "=================================================="
echo "Step 3: Store Cloudflare Credentials"
echo "=================================================="
echo ""

# Check if Cloudflare credentials already exist
if op item get "CLOUDFLARE_API_TOKEN" --vault="ChittyOS-Deployment" &> /dev/null; then
    echo -e "${YELLOW}CLOUDFLARE_API_TOKEN already exists in 1Password${NC}"
    echo "To update, delete the item first: op item delete 'CLOUDFLARE_API_TOKEN' --vault='ChittyOS-Deployment'"
else
    echo "Cloudflare API Token is required for R2 uploads and Workers deployment."
    echo "Generate one at: https://dash.cloudflare.com/profile/api-tokens"
    echo "Required permissions: Workers Scripts Write, Account R2 Write"
    echo ""
    read -sp "Enter CLOUDFLARE_API_TOKEN (or press Enter to skip): " CLOUDFLARE_API_TOKEN
    echo ""

    if [ -n "$CLOUDFLARE_API_TOKEN" ]; then
        create_or_update_secret \
            "CLOUDFLARE_API_TOKEN" \
            "ChittyOS-Deployment" \
            "$CLOUDFLARE_API_TOKEN" \
            "Cloudflare API token with R2 object write and Workers deploy permissions. Used for package storage and service deployment." \
            "cloudflare,r2,workers,deployment"
        echo -e "${GREEN}✓ CLOUDFLARE_API_TOKEN stored${NC}"
    else
        echo -e "${YELLOW}⊘ Skipped CLOUDFLARE_API_TOKEN${NC}"
    fi
fi

# Cloudflare Account ID (static)
echo "Storing Cloudflare Account ID..."
create_or_update_secret \
    "CLOUDFLARE_ACCOUNT_ID" \
    "ChittyOS-Deployment" \
    "0bc21e3a5a9de1a4cc843be9c3e98121" \
    "Cloudflare account ID for ChittyOS organization." \
    "cloudflare,account"

echo ""

echo "=================================================="
echo "Step 4: Store NPM Token"
echo "=================================================="
echo ""

if op item get "NPM_TOKEN" --vault="ChittyOS-Deployment" &> /dev/null; then
    echo -e "${YELLOW}NPM_TOKEN already exists in 1Password${NC}"
    echo "To update, delete the item first: op item delete 'NPM_TOKEN' --vault='ChittyOS-Deployment'"
else
    echo "NPM authentication token is required for publishing packages."
    echo "Generate one at: https://www.npmjs.com/settings/[username]/tokens"
    echo "Token type: Automation (recommended) or Publish"
    echo ""
    read -sp "Enter NPM_TOKEN (or press Enter to skip): " NPM_TOKEN
    echo ""

    if [ -n "$NPM_TOKEN" ]; then
        create_or_update_secret \
            "NPM_TOKEN" \
            "ChittyOS-Deployment" \
            "$NPM_TOKEN" \
            "NPM authentication token for publishing ChittyOS packages. Automation token with publish scope." \
            "npm,publishing,package"
        echo -e "${GREEN}✓ NPM_TOKEN stored${NC}"
    else
        echo -e "${YELLOW}⊘ Skipped NPM_TOKEN${NC}"
    fi
fi

echo ""

echo "=================================================="
echo "Summary of Generated Secrets"
echo "=================================================="
echo ""
echo "ChittyOS-Core vault:"
echo "  - CHITTY_API_GATEWAY_SERVICE_TOKEN (API Gateway → ChittyAuth)"
echo "  - CHITTY_ID_SERVICE_TOKEN (API Gateway → ChittyID)"
echo ""
echo "ChittyOS-Deployment vault:"
echo "  - CHITTY_ID_TOKEN (GitHub Actions → ChittyID)"
echo "  - CHITTY_API_KEY (GitHub Actions → API Gateway)"
echo "  - CHITTY_REGISTRY_TOKEN (GitHub Actions → Registry)"
echo "  - CLOUDFLARE_ACCOUNT_ID"
if op item get "CLOUDFLARE_API_TOKEN" --vault="ChittyOS-Deployment" &> /dev/null; then
    echo "  - CLOUDFLARE_API_TOKEN"
fi
if op item get "NPM_TOKEN" --vault="ChittyOS-Deployment" &> /dev/null; then
    echo "  - NPM_TOKEN"
fi
echo ""

echo "=================================================="
echo "Next Steps"
echo "=================================================="
echo ""
echo "1. Provision GitHub secrets:"
echo "   ./scripts/chittyconnect-sync-github-secrets.sh"
echo ""
echo "2. Configure Wrangler secrets:"
echo "   ./scripts/chittyconnect-sync-wrangler-secrets.sh"
echo ""
echo "3. Register service tokens in ChittyAuth (manual step)"
echo "   See: docs/CHITTYCONNECT_1PASSWORD_SETUP.md"
echo ""

echo -e "${GREEN}✓ ChittyConnect × 1Password setup complete!${NC}"
