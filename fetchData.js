// fetchData.js
const { Octokit } = require("@octokit/rest");
const fs = require('fs');
require('dotenv').config();

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

async function getContributions() {
  const query = `
    query($username: String!) {
      user(login: $username) {
        contributionsCollection {
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays {
                date
                contributionCount
                color
              }
            }
          }
        }
      }
    }
  `;

  try {
    const response = await octokit.graphql(query, {
      username: 'gapyu995'  // ⚠️ 改成你的 GitHub 用户名
    });

    fs.writeFileSync('contributions.json', JSON.stringify(response, null, 2));
    console.log('✅ 贡献数据已保存到 contributions.json');
  } catch (error) {
    console.error('❌ 获取数据失败:', error);
  }
}

getContributions();