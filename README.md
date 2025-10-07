# Slack-GitHub Bridge MCP Server

HTTP MCP server that bridges Slack and GitHub for use with OpenAI Agent Builder.

## Features

- **Get Slack Messages**: Retrieve messages from any Slack channel
- **Save to GitHub**: Create or update files in GitHub repositories
- **Combined Operation**: Pull Slack messages and save as context markdown files in GitHub

## Deployment

### Vercel (Recommended)

1. Install Vercel CLI:
```bash
npm i -g vercel
```

2. Deploy:
```bash
cd slack-github-bridge
npm install
npm run build
vercel
```

3. Set environment variables in Vercel dashboard or CLI:
```bash
vercel env add MCP_API_KEY
vercel env add SLACK_BOT_TOKEN
vercel env add GITHUB_TOKEN
vercel env add GITHUB_OWNER
vercel env add GITHUB_REPO
```

### Railway

1. Install Railway CLI:
```bash
npm i -g @railway/cli
```

2. Deploy:
```bash
cd slack-github-bridge
railway init
railway up
```

3. Set environment variables:
```bash
railway variables set MCP_API_KEY=your-key
railway variables set SLACK_BOT_TOKEN=xoxb-your-token
railway variables set GITHUB_TOKEN=ghp-your-token
railway variables set GITHUB_OWNER=your-username
railway variables set GITHUB_REPO=your-repo
```

## Environment Variables

- `MCP_API_KEY`: Authentication key for API requests (create a random secure string)
- `SLACK_BOT_TOKEN`: Slack Bot User OAuth Token (starts with `xoxb-`)
- `GITHUB_TOKEN`: GitHub Personal Access Token
- `GITHUB_OWNER`: GitHub username or organization
- `GITHUB_REPO`: Repository name
- `PORT`: Server port (default: 3000)

## API Endpoints

### Health Check
```
GET /health
```

### List Functions
```
GET /functions
```

### Get Slack Messages
```
POST /functions/get_slack_messages
Headers: x-api-key: YOUR_MCP_API_KEY
Body:
{
  "channel": "C1234567890",
  "limit": 100,
  "older_than": "1234567890.123456"
}
```

### Save to GitHub
```
POST /functions/save_to_github
Headers: x-api-key: YOUR_MCP_API_KEY
Body:
{
  "path": "context/slack-messages.md",
  "content": "# Messages...",
  "message": "Update Slack context",
  "branch": "main"
}
```

### Slack to GitHub Context (Combined)
```
POST /functions/slack_to_github_context
Headers: x-api-key: YOUR_MCP_API_KEY
Body:
{
  "slack_channel": "C1234567890",
  "github_path": "context/slack-context.md",
  "message_limit": 100,
  "commit_message": "Update Slack context"
}
```

## Using with OpenAI Agent Builder

1. Deploy this server to Vercel/Railway
2. Get your deployment URL (e.g., `https://slack-github-bridge.vercel.app`)
3. In Agent Builder, add MCP connection:
   - **URL**: Your deployment URL
   - **Label**: Slack-GitHub Bridge
   - **Description**: Bridge between Slack and GitHub for context saving
   - **Authentication**: Add your `MCP_API_KEY` as Access token

4. Create workflow:
   - **Start** → Define inputs (channel_id, github_path)
   - **MCP Node** → Call `slack_to_github_context` function
   - **Transform** → Format the response
   - **End** → Return result
