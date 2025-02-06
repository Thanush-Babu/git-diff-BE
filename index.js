const express = require('express');
const axios = require('axios');
const dotenv = require('dotenv');
const cors = require("cors");

dotenv.config();
const app = express();

// Middleware to parse JSON requests
app.use(express.json());
app.use(cors());

// Axios instance for GitHub API
const githubApi = axios.create({
  baseURL: process.env.GITHUB_API_URL,
  headers: {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    Accept: 'application/vnd.github.v3+json',
  },
});

// 1. Get Commit by ID
app.get('/repositories/:owner/:repository/commits/:oid', async (req, res) => {
  const { owner, repository, oid } = req.params;

  try {
    const response = await githubApi.get(`/repos/${owner}/${repository}/commits/${oid}`);
    const commitData = response.data;

    // Transforming GitHub response to match the given schema in FS DEV github API Documentation 
    const formattedCommit = {
      oid: commitData?.sha ||'',
      message: commitData?.commit?.message,
      author: {
        name: commitData?.commit?.author?.name ||'',
        date: commitData?.commit?.author?.date ||'',
        email: commitData?.commit?.author?.email ||'',
        avatar_url: commitData?.author?.avatar_url ||'',
      },
      committer: {
        name: commitData?.commit?.committer?.name ||'',
        date: commitData?.commit?.committer?.date ||'',
        email: commitData?.commit?.committer?.email ||'',
      },
      parents: commitData.parents.map(parent => ({ oid: parent.sha })),
    };

    // Return as an array to match the example
    res.json([formattedCommit]);

  } catch (error) {
    res.status(error.response?.status || 500).json({
      message: 'Error fetching commit details',
      error: error.response?.data || error.message,
    });
  }
});

//2. Get Commit diff
app.get('/repositories/:owner/:repository/commits/:oid/diff', async (req, res) => {
  const { owner, repository, oid } = req.params;

  try {
      const commitResponse = await axios.get(`${process.env.GITHUB_API_URL}/repos/${owner}/${repository}/commits/${oid}`);
      const parentOid = commitResponse?.data?.parents[0]?.sha;
      if(parentOid) {
        const diffResponse = await axios.get(`${process.env.GITHUB_API_URL}/repos/${owner}/${repository}/compare/${parentOid}...${oid}`);   
        const files = diffResponse.data.files.map(file => ({
            changeKind: file.status.toUpperCase(),
            headFile: {
                path: file.filename
            },
            baseFile: {
                path: file.filename
            },
            hunks: file.patch ? parsePatch(file.patch) : []
        }));
  
        res.json(files);
      }
      
  } catch (error) {
      res.status(error?.response?.status).json({ error: error?.response?.data });
  }
});

function parsePatch(patch) {
  const hunks = [];
  const lines = patch.split('\n');
  let currentHunk = null;
  let baseLine = 0, headLine = 0;

  lines.forEach(line => {
      if (line.startsWith('@@')) {
          if (currentHunk) {
              hunks.push(currentHunk);
          }
          const match = line.match(/^@@ -(\d+),?\d* \+(\d+),?\d* @@/);
          if (match) {
              baseLine = parseInt(match[1]);
              headLine = parseInt(match[2]);
          }
          currentHunk = {
              header: line,
              lines: []
          };
      } else if (currentHunk) {
          let baseLineNumber = null, headLineNumber = null;

          if (line.startsWith('-')) {
              baseLineNumber = baseLine++;
          } else if (line.startsWith('+')) {
              headLineNumber = headLine++;
          } else {
              baseLineNumber = baseLine++;
              headLineNumber = headLine++;
          }

          currentHunk.lines.push({
              baseLineNumber,
              headLineNumber,
              content: line
          });
      }
  });

  if (currentHunk) {
      hunks.push(currentHunk);
  }

  return hunks;
}

app.listen(process.env.PORT, () => {
  console.log(`Server is running on http://localhost:${process.env.PORT}`);
});