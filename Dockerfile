# Step 1: Build stage - use Node.js to build the app
FROM 529134784986.dkr.ecr.ap-south-1.amazonaws.com/node:multi-22.14.0 AS builder

# Set working directory
WORKDIR /app

# Copy dependencies config
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build the app
RUN npm run build


# Step 2: Production stage - serve with NGINX
FROM 529134784986.dkr.ecr.ap-south-1.amazonaws.com/nginx:multi-alpine

# Copy built frontend files to NGINX default public directory
COPY --from=builder /app/dist /usr/share/nginx/html

# Optional: Replace default NGINX config if needed
# COPY nginx.conf /etc/nginx/nginx.conf

# Expose port 80
EXPOSE 5173

# Start NGINX (default command works, no need to override)
