FROM node:18-alpine

WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json ./
RUN npm install

# Copy the rest of your code
COPY . .

# Build TypeScript (if you use tsc)
RUN npm run build

# Expose the port
EXPOSE 5000

# Start the app (adjust if your build output is different)
CMD ["node", "dist/server.js"]