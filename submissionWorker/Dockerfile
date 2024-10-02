# Use the Docker-in-Docker image
FROM docker:dind

# Install Node.js and other dependencies
RUN apk add --no-cache nodejs npm

# Set the working directory in the container
WORKDIR /app/submissionWorker

# Copy package.json and package-lock.json
COPY ./submissionWorker/package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY ./submissionWorker/ ./

# expose port 3001
EXPOSE 3001

# Transpile TypeScript files
RUN npm run build

# Command to run the application
CMD ["npm", "run", "start"]
