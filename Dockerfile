# Step 1: Use an official Node.js runtime as a parent image
FROM 529134784986.dkr.ecr.ap-south-1.amazonaws.com/node:multi-22.14.0 AS builder
#FROM node:22.14.0 
#for local development(will use https://hub.docker.com/_/node/ )

# Step 2: Set the working directory inside the container
WORKDIR /usr/src/app

# Step 3: Copy the package.json and package-lock.json (if available)
ADD . .

RUN rm -rf node_modules package-lock.json

# Step 4: Increase npm timeout and install PM2 globally
RUN npm config set fetch-timeout 600000 && npm install pm2 -g

# Step 5: Install the dependencies
RUN npm i --legacy-peer-deps

# Step 7: Build the application (optional, based on your setup)
RUN npm run build

# Step 8: Expose port 5000
EXPOSE 5000

# Step 9: Use PM2 to start the app in production mode
CMD ["pm2-runtime", "npm", "--", "run", "start:prod"]








