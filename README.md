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

2. **Start the code sandbox**

   Run the following command in the root diretory to start the server, 1 worker and Redis using Docker Compose:

   ```bash
   docker-compose up --build
   ```

## API Endpoints

### Language List

- ** Endpoint**: `GET http://localhost:3000/languages`
- **Description**: Retrieves a list of supported programming languages.
- **Response**:
  ```json
  {
    1: "python 3.9",
    2: "cpp gcc latest",
    3: "java openjdk 17",
    4: "c gcc latest"
  }
  ```

### Submit task

- **Endpoint**: `POST http://localhost:3000/submit-task`
- **Description**: Submits code for execution.
- **Request Body**:
  ```json
  {
    "languageId": 2,   // The programming language of the code (e.g., cpp, python).
    "code": "string",     // The source code to be executed.
  }
- **Response**:
  ```json
  {
  "taskId": "string"  // A unique task ID for tracking the execution.
  }
  ```

### Check task Status

- **Endpoint**: `GET http://localhost:3000/task-status/:id`
- **Description**: Retrieves the status and result of a submitted task using its unique task ID.
- **Path Parameter**:
  - `id`: The unique task ID (e.g., `1725424816302`).
- **Response**:
  - **Success (task Completed)**:
    ```json
    {
      "status": "success or error",     // The status of the task.
      "output": "string"       // The output from the executed code.
    }
    ```
  - **Pending**:
    ```json
    {
      "status": "pending"  // The task is still being processed.
    }
    ```
  - **Error (task Not Found)**:
    ```json
    {
      "error": "task not found"  // Indicates the task ID is not found or still pending.
    }
    ```

#### Example Request

```bash
curl -X POST http://localhost:3000/submit-task \
-H "Content-Type: application/json" \
-d '{
  "languageId": 2,
  "code": "#include <iostream>\nusing namespace std;\nint main() {\n    cout << \"Hello, World!\";   return 0;\n}"
}'
```