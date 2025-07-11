#!/bin/bash

# Configuration
EFS_MOUNT="/mnt/efs/n8n"
NODE_NAME="n8n-nodes-redis-enhanced"
EC2_HOST="your-ec2-host"
EC2_USER="ec2-user"

echo "🚀 Deploying Redis Enhanced Node to Production..."

# Build the project
echo "📦 Building project..."
npm run build

# Create directory structure on EFS
echo "📁 Creating directory structure..."
ssh ${EC2_USER}@${EC2_HOST} "mkdir -p ${EFS_MOUNT}/custom/node_modules/${NODE_NAME}"

# Copy built files
echo "📤 Copying built files..."
scp -r dist/* ${EC2_USER}@${EC2_HOST}:${EFS_MOUNT}/custom/node_modules/${NODE_NAME}/
scp package.json ${EC2_USER}@${EC2_HOST}:${EFS_MOUNT}/custom/node_modules/${NODE_NAME}/

# Install dependencies on remote
echo "📥 Installing dependencies..."
ssh ${EC2_USER}@${EC2_HOST} "cd ${EFS_MOUNT}/custom/node_modules/${NODE_NAME} && npm install --production redis@^5.6.0"

# Restart n8n containers
echo "🔄 Restarting n8n containers..."
ssh ${EC2_USER}@${EC2_HOST} "cd /path/to/your/docker-compose && docker-compose restart n8n"

echo "✅ Deployment complete! Your Redis Enhanced node should now be available in n8n."
echo "🔍 Check n8n logs: docker-compose logs -f n8n"
