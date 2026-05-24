# Deployment Guide for MootCoach

This guide documents the commands used to push updates to GitHub, which automatically triggers a deployment on Render.

## Deploying Changes

Whenever you make changes to the frontend ([index.html](file:///c:/Users/devar/OneDrive/Desktop/mootcoach-ai/frontend/index.html)) or backend ([server.js](file:///c:/Users/devar/OneDrive/Desktop/mootcoach-ai/server.js)), run the following commands in your terminal to deploy them:

```powershell
# 1. Stage all changes
git add .

# 2. Commit changes with a descriptive message
git commit -m "updated"

# 3. Push to GitHub (main branch)
git push
```

## How Render Deployments Work

1. **Frontend**: The static site is connected to the GitHub repository. When you push to the `main` branch, Render detects the push and automatically redeploys the frontend.
2. **Backend**: The API service running the Node.js server is also connected to the GitHub repository. It will automatically build and restart upon a new push.

## Checking Status

- View the live frontend at: [mootcoach-frontend.onrender.com](https://mootcoach-frontend.onrender.com/)
- Monitor deployment logs in your [Render Dashboard](https://dashboard.render.com/).
