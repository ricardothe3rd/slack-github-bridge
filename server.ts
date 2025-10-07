import express from 'express';
import cors from 'cors';

const app = express();
app.use(express.json());
app.use(cors());

// Authentication middleware
app.use((req, res, next) => {
  if (req.path === '/health') return next();

  const apiKey = req.headers['x-api-key'];
  if (apiKey !== process.env.MCP_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// List available functions (for MCP discovery)
app.get('/functions', (req, res) => {
  res.json({
    functions: [
      {
        name: 'get_slack_messages',
        description: 'Get messages from a Slack channel',
        parameters: {
          channel: 'Channel ID or name',
          limit: 'Number of messages to retrieve (default: 100)',
          older_than: 'Optional: timestamp to get messages older than this'
        }
      },
      {
        name: 'save_to_github',
        description: 'Save content to a GitHub repository',
        parameters: {
          path: 'File path in repository',
          content: 'File content',
          message: 'Commit message',
          branch: 'Branch name (default: main)'
        }
      },
      {
        name: 'slack_to_github_context',
        description: 'Pull Slack messages and save as context file in GitHub',
        parameters: {
          slack_channel: 'Slack channel ID or name',
          github_path: 'Path to save in GitHub repository',
          message_limit: 'Number of messages to retrieve (default: 100)',
          commit_message: 'GitHub commit message'
        }
      }
    ]
  });
});

// Function: Get Slack messages
app.post('/functions/get_slack_messages', async (req, res) => {
  try {
    const { channel, limit = 100, older_than } = req.body;

    if (!channel) {
      return res.status(400).json({ error: 'channel parameter is required' });
    }

    const slackToken = process.env.SLACK_BOT_TOKEN;
    if (!slackToken) {
      return res.status(500).json({ error: 'SLACK_BOT_TOKEN not configured' });
    }

    const url = new URL('https://slack.com/api/conversations.history');
    url.searchParams.append('channel', channel);
    url.searchParams.append('limit', String(limit));
    if (older_than) {
      url.searchParams.append('oldest', older_than);
    }

    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${slackToken}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();

    if (!data.ok) {
      return res.status(400).json({ error: data.error || 'Slack API error' });
    }

    res.json({
      success: true,
      messages: data.messages || [],
      count: data.messages?.length || 0,
      has_more: data.has_more || false
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Function: Save to GitHub
app.post('/functions/save_to_github', async (req, res) => {
  try {
    const { path, content, message, branch = 'main' } = req.body;

    if (!path || !content) {
      return res.status(400).json({ error: 'path and content parameters are required' });
    }

    const githubToken = process.env.GITHUB_TOKEN;
    const githubOwner = process.env.GITHUB_OWNER;
    const githubRepo = process.env.GITHUB_REPO;

    if (!githubToken || !githubOwner || !githubRepo) {
      return res.status(500).json({ error: 'GitHub credentials not configured' });
    }

    // Check if file exists
    let sha: string | undefined;
    try {
      const checkResponse = await fetch(
        `https://api.github.com/repos/${githubOwner}/${githubRepo}/contents/${path}?ref=${branch}`,
        {
          headers: {
            'Authorization': `token ${githubToken}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        }
      );

      if (checkResponse.ok) {
        const existing = await checkResponse.json();
        sha = existing.sha;
      }
    } catch (e) {
      // File doesn't exist, that's okay
    }

    // Create or update file
    const body: any = {
      message: message || 'Update from Slack context',
      content: Buffer.from(content).toString('base64'),
      branch
    };

    if (sha) {
      body.sha = sha;
    }

    const response = await fetch(
      `https://api.github.com/repos/${githubOwner}/${githubRepo}/contents/${path}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `token ${githubToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/vnd.github.v3+json'
        },
        body: JSON.stringify(body)
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.message || 'GitHub API error' });
    }

    res.json({
      success: true,
      commit_sha: data.commit?.sha,
      file_url: data.content?.html_url
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Function: Combined Slack to GitHub
app.post('/functions/slack_to_github_context', async (req, res) => {
  try {
    const {
      slack_channel,
      github_path,
      message_limit = 100,
      commit_message
    } = req.body;

    if (!slack_channel || !github_path) {
      return res.status(400).json({
        error: 'slack_channel and github_path parameters are required'
      });
    }

    // 1. Get Slack messages
    const slackToken = process.env.SLACK_BOT_TOKEN;
    if (!slackToken) {
      return res.status(500).json({ error: 'SLACK_BOT_TOKEN not configured' });
    }

    const slackUrl = new URL('https://slack.com/api/conversations.history');
    slackUrl.searchParams.append('channel', slack_channel);
    slackUrl.searchParams.append('limit', String(message_limit));

    const slackResponse = await fetch(slackUrl.toString(), {
      headers: {
        'Authorization': `Bearer ${slackToken}`,
        'Content-Type': 'application/json'
      }
    });

    const slackData = await slackResponse.json();

    if (!slackData.ok) {
      return res.status(400).json({ error: slackData.error || 'Slack API error' });
    }

    const messages = slackData.messages || [];

    // 2. Format as markdown
    const markdownContent = `# Slack Context from Channel
Generated: ${new Date().toISOString()}
Total messages: ${messages.length}

---

${messages.reverse().map((msg: any) => {
  const timestamp = new Date(parseFloat(msg.ts) * 1000).toLocaleString();
  const user = msg.user || msg.username || 'Unknown';
  const text = msg.text || '';

  return `### ${user} - ${timestamp}\n\n${text}\n\n---`;
}).join('\n\n')}
`;

    // 3. Save to GitHub
    const githubToken = process.env.GITHUB_TOKEN;
    const githubOwner = process.env.GITHUB_OWNER;
    const githubRepo = process.env.GITHUB_REPO;

    if (!githubToken || !githubOwner || !githubRepo) {
      return res.status(500).json({ error: 'GitHub credentials not configured' });
    }

    // Check if file exists
    let sha: string | undefined;
    try {
      const checkResponse = await fetch(
        `https://api.github.com/repos/${githubOwner}/${githubRepo}/contents/${github_path}`,
        {
          headers: {
            'Authorization': `token ${githubToken}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        }
      );

      if (checkResponse.ok) {
        const existing = await checkResponse.json();
        sha = existing.sha;
      }
    } catch (e) {
      // File doesn't exist
    }

    const body: any = {
      message: commit_message || `Update Slack context - ${new Date().toISOString()}`,
      content: Buffer.from(markdownContent).toString('base64'),
      branch: 'main'
    };

    if (sha) {
      body.sha = sha;
    }

    const githubResponse = await fetch(
      `https://api.github.com/repos/${githubOwner}/${githubRepo}/contents/${github_path}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `token ${githubToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/vnd.github.v3+json'
        },
        body: JSON.stringify(body)
      }
    );

    const githubData = await githubResponse.json();

    if (!githubResponse.ok) {
      return res.status(githubResponse.status).json({
        error: githubData.message || 'GitHub API error',
        slack_messages_retrieved: messages.length
      });
    }

    res.json({
      success: true,
      messages_saved: messages.length,
      github_url: githubData.content?.html_url,
      commit_sha: githubData.commit?.sha
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`MCP HTTP Server running on port ${PORT}`);
});
