# API Server Proxy

This service provides `/send`, `/bio`, and `/validate` endpoints using Telegram API with optional proxy support.

## Endpoints

- **GET /**: Health check.
- **POST /send**:
  ```json
  {
    "sessionString": "<string>",
    "username": "<username>",
    "message": "<message>",
    "proxy": "http://user:pass@host:port" // optional
  }
  ```
- **POST /bio**:
  ```json
  {
    "sessionString": "<string>",
    "apiId": 2040,
    "apiHash": "hash",
    "username": "<username>",
    "proxy": "http://user:pass@host:port" // optional
  }
  ```
- **POST /validate**:
  ```json
  {
    "sessionString": "<string>",
    "apiId": 2040,
    "apiHash": "hash",
    "proxy": "http://user:pass@host:port" // optional
  }
  ```

## Deployment

1. Build and push to GitHub:
   ```bash
   git init
   git add .
   git commit -m "Initial commit with proxy support"
   git remote add origin https://github.com/bfirrst/api-server-proxy.git
   git branch -M main
   git push -u origin main --force
   ```

2. Deploy on Railway:
   ```bash
   railway login
   railway init    # create new project
   railway up      # builds and deploys service
   ```

Railway will automatically detect `Dockerfile` and deploy. If not, set Start Command to:
```
node server.js
```