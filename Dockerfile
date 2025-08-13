# Use an official Node.js runtime as a parent image
FROM node:18-slim

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install app dependencies
RUN npm install --production

# Install PM2 globally in the container
RUN npm install pm2 -g

# Copy the rest of your application's code
COPY . .

# Copy the service account key
COPY service-account-key.json .

# Copy the PM2 configuration file
COPY ecosystem.config.cjs .

# Make port 8080 available to the world outside this container
EXPOSE 8080

# Define the command to run your app using PM2
# pm2-runtime is the correct command for containerized environments
CMD [ "pm2-runtime", "start", "ecosystem.config.cjs", "--env", "production" ]