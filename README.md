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
   docker network create codesandbox-network
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

### Submit Code

- **Endpoint**: `POST /submit`
- **Description**: Submits code for execution.
- **Request Body**:
  ```json
  {
    "language": "cpp",   // The programming language of the code (e.g., cpp, python).
    "code": "string",     // The source code to be executed.
    "input": "string"     // The input data for the code.
  }
- **Response**:
  ```json
  {
  "jobId": "string"  // A unique job ID for tracking the execution.
  }
  ```

### Check Job Status

- **Endpoint**: `GET /status/:id`
- **Description**: Retrieves the status and result of a submitted job using its unique job ID.
- **Path Parameter**:
  - `id`: The unique job ID (e.g., `1725424816302`).
- **Response**:
  - **Success (Job Completed)**:
    ```json
    {
      "status": "success",     // The status of the job.
      "output": "string"       // The output from the executed code.
    }
    ```
  - **Pending**:
    ```json
    {
      "status": "pending"  // The job is still being processed.
    }
    ```
  - **Error (Job Not Found)**:
    ```json
    {
      "error": "Job not found or pending"  // Indicates the job ID is not found or still pending.
    }
    ```

#### Example Request

```bash
curl -X POST http://localhost:3000/submit \
-H "Content-Type: application/json" \
-d '{
  "language": "cpp",
  "code": "#include <iostream> using namespace std; int main() { int a, b; cin >> a >> b; cout << a + b << endl; return 0; }",
  "input": "3 5"
}'
```