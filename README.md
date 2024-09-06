# CodeSandbox 

## Description

The CodeSandbox project is a Node.js application designed to execute code submissions in a sandboxed environment. It consists of two main services:

- **Server**: Receives code submissions and stores them in a Redis queue.
- **Worker**: Fetches code from the Redis queue, executes it in a Docker container, and stores the execution results back in Redis.

This setup allows you to safely execute and manage code submissions using Docker containers, ensuring that code execution is isolated and clean.

## Starting the Project

### Prerequisites

1. **Docker**: Ensure Docker is installed on your system.
2. **Docker Compose**: Ensure Docker Compose is installed for managing multi-container Docker applications.

### Setup and Running

1. **Create Docker Network**

   Before starting the services, create a Docker network to allow containers to communicate with each other:

   ```bash
   docker network create code-sandbox-network
   ```

2. **Start Redis and Server**

   Navigate to the `/server` directory and run the following command to start the server and Redis using Docker Compose:

   ```bash
   cd /server
   docker-compose up --build
   ```
3. **Start Worker**

   Open a new terminal window, navigate to the /worker directory, and run the following command to start the worker service:

   ```bash
   cd /worker
   docker-compose up --build
   ```
   This command builds and starts the worker container, which will connect to the Redis instance running in the /server container.

## API Endpoints

### Language List

- ** Endpoint**: `GET /languages`
- **Description**: Retrieves a list of supported programming languages.
- **Response**:
  ```json
  {
    [lanagueId as number]: "string"
  }
  ```

### Submit task

- **Endpoint**: `POST /submit-task`
- **Description**: Submits code for execution.
- **Request Body**:
  ```json
  {
    "languageId": 2,   // The programming language of the code (e.g., cpp, python).
    "code": "string",     // The source code to be executed.
    "input": "string"     // The input data for the code.
  }
- **Response**:
  ```json
  {
  "taskId": "string"  // A unique job ID for tracking the execution.
  }
  ```

### Check task Status

- **Endpoint**: `GET /task-status/:id`
- **Description**: Retrieves the status and result of a submitted job using its unique job ID.
- **Path Parameter**:
  - `id`: The unique job ID (e.g., `1725424816302`).
- **Response**:
  - **Success (task Completed)**:
    ```json
    {
      "status": "success or error",     // The status of the job.
      "output": "string"       // The output from the executed code.
    }
    ```
  - **Pending**:
    ```json
    {
      "status": "pending"  // The job is still being processed.
    }
    ```
  - **Error (task Not Found)**:
    ```json
    {
      "error": "task not found"  // Indicates the job ID is not found or still pending.
    }
    ```

#### Example Request

```bash
curl -X POST http://localhost:3000/submit \
-H "Content-Type: application/json" \
-d '{
  "languageId": 2,
  "code": "#include <iostream>\nusing namespace std;\nint main() {\n    cout << \"Hello, World!\";   return 0;\n}"
}'
```