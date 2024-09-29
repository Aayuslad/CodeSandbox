# Use the Docker-in-Docker image
FROM docker:dind

# Install Node.js and other dependencies
RUN apk add --no-cache nodejs npm

# Increase ARG_MAX and ulimit for large command handling
RUN ulimit -n 8192 && ulimit -s 32768
RUN getconf ARG_MAX 6291456

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
