# Use the official Node.js image.
FROM node:18-alpine

# Set the working directory in the container.
WORKDIR /app/submissionQueueHandler

# Copy package.json and package-lock.json.
COPY ./submissionQueueHandler/package*.json ./

# Install dependencies.
RUN npm install

# Copy the rest of the application code.
COPY ./submissionQueueHandler/ ./

# Transpile TypeScript files.
RUN npm run build

# Expose the port the app runs on.
EXPOSE 3000

# Command to run the application.
CMD ["npm", "run", "start"]
