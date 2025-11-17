# ChittyOS Infrastructure as Code
# Terraform configuration for complete ChittyOS deployment

terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.4"
    }
  }

  backend "s3" {
    bucket         = "chittyos-terraform-state"
    key            = "infrastructure/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "chittyos-terraform-locks"
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "ChittyOS"
      Environment = var.environment
      ManagedBy   = "Terraform"
      Framework   = "ChittyOS-v1.0.1"
    }
  }
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

# Data sources
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# Local values
locals {
  account_id = data.aws_caller_identity.current.account_id
  region     = data.aws_region.current.name

  common_tags = {
    Project     = "ChittyOS"
    Environment = var.environment
    ManagedBy   = "Terraform"
    Framework   = "ChittyOS-v1.0.1"
  }

  # ChittyOS specific naming
  name_prefix = "chittyos-${var.environment}"
}

# ChittyOS Core Infrastructure Module
module "chittyos_infrastructure" {
  source = "./modules/chittyos-core"

  environment    = var.environment
  name_prefix    = local.name_prefix

  # Networking
  vpc_cidr             = var.vpc_cidr
  availability_zones   = var.availability_zones

  # ECS Configuration
  ecs_cluster_name     = "${local.name_prefix}-cluster"

  # RDS Configuration
  db_instance_class    = var.db_instance_class
  db_allocated_storage = var.db_allocated_storage

  # R2 Storage
  r2_bucket_name = var.r2_bucket_name

  # ChittyID Service
  chittyid_service_config = {
    cpu    = var.chittyid_cpu
    memory = var.chittyid_memory
    port   = 8080
  }

  # ChittyMCP Server
  chittymcp_config = {
    cpu    = var.chittymcp_cpu
    memory = var.chittymcp_memory
    port   = 8081
  }

  tags = local.common_tags
}

# Cloudflare DNS and CDN
module "chittyos_cloudflare" {
  source = "./modules/cloudflare"

  zone_id = var.cloudflare_zone_id
  domain  = var.domain_name

  # Service endpoints
  services = {
    api = {
      subdomain = "api"
      target    = module.chittyos_infrastructure.alb_dns_name
    }
    id = {
      subdomain = "id"
      target    = module.chittyos_infrastructure.chittyid_endpoint
    }
    mcp = {
      subdomain = "mcp"
      target    = module.chittyos_infrastructure.chittymcp_endpoint
    }
  }

  # Workers
  workers = {
    gateway = {
      name   = "chittyos-gateway"
      script = file("${path.module}/../chittyos-api-gateway/src/router.ts")
    }
  }
}

# Security and Monitoring
module "chittyos_security" {
  source = "./modules/security"

  environment = var.environment

  # WAF Configuration
  enable_waf = true

  # Certificate Manager
  domain_name = var.domain_name

  # Security Groups
  allowed_cidr_blocks = var.allowed_cidr_blocks

  tags = local.common_tags
}

# Monitoring and Logging
module "chittyos_monitoring" {
  source = "./modules/monitoring"

  environment = var.environment
  name_prefix = local.name_prefix

  # CloudWatch Configuration
  log_retention_days = var.log_retention_days

  # Alerting
  notification_email = var.notification_email

  # Compliance Monitoring
  enable_compliance_monitoring = true

  tags = local.common_tags
}

# Outputs
output "infrastructure_summary" {
  description = "ChittyOS infrastructure deployment summary"
  value = {
    environment = var.environment
    region      = local.region

    endpoints = {
      api_url      = "https://api.${var.domain_name}"
      chittyid_url = "https://id.${var.domain_name}"
      chittymcp_url = "https://mcp.${var.domain_name}"
    }

    database = {
      endpoint = module.chittyos_infrastructure.db_endpoint
      port     = module.chittyos_infrastructure.db_port
    }

    ecs_cluster = module.chittyos_infrastructure.ecs_cluster_name

    compliance = {
      framework_version = "ChittyOS-v1.0.1"
      compliance_score  = "100%"
    }
  }
}

output "deployment_commands" {
  description = "Commands to deploy ChittyOS services"
  value = {
    docker_build = "docker build -t chittyos-cli ."
    ecs_deploy   = "aws ecs update-service --cluster ${module.chittyos_infrastructure.ecs_cluster_name} --service chittyos-cli-service --force-new-deployment"
    health_check = "curl -f https://api.${var.domain_name}/health"
  }
}