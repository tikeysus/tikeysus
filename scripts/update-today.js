const fs = require("fs");

const README_PATH = "README.md";
const USERNAME = process.env.GITHUB_USERNAME || "tikeysus";
const TIME_ZONE = process.env.TIME_ZONE || "America/Toronto";
const EVENT_LIMIT = Number(process.env.EVENT_LIMIT || 100);

const START_MARKER = "<!-- TODAY:START -->";
const END_MARKER = "<!-- TODAY:END -->";

function formatInTimeZone(date, options) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    ...options,
  }).format(date);
}

function todayKey() {
  return formatInTimeZone(new Date(), {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function eventDayKey(event) {
  return formatInTimeZone(new Date(event.created_at), {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function repoLink(repoName) {
  return `[${repoName}](https://github.com/${repoName})`;
}

function commitLink(commit) {
  const url = commit.url
    .replace("api.github.com/repos", "github.com")
    .replace("/commits/", "/commit/");
  const message = commit.message.split("\n")[0];

  return `[${message}](${url})`;
}

async function fetchEvents() {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": `${USERNAME}-readme-updater`,
  };

  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const response = await fetch(`https://api.github.com/users/${USERNAME}/events/public?per_page=${EVENT_LIMIT}`, {
    headers,
  });

  if (!response.ok) {
    throw new Error(`GitHub API request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

function buildMarkdown(events) {
  const today = todayKey();
  const latestCommitsByRepo = new Map();

  for (const event of events) {
    if (event.type !== "PushEvent" || eventDayKey(event) !== today) {
      continue;
    }

    if (latestCommitsByRepo.has(event.repo.name)) {
      continue;
    }

    const commits = event.payload.commits || [];
    const latestCommit = commits[commits.length - 1];

    if (latestCommit) {
      latestCommitsByRepo.set(event.repo.name, latestCommit);
    }
  }

  const items = Array.from(latestCommitsByRepo.entries())
    .slice(0, 6)
    .map(([repoName, commit]) => `${repoLink(repoName)} - ${commitLink(commit)}`);

  if (items.length === 0) {
    return `- No public commits yet today.`;
  }

  return items.map((item) => `- ${item}`).join("\n");
}

function updateReadme(markdown) {
  const readme = fs.readFileSync(README_PATH, "utf8");
  const start = readme.indexOf(START_MARKER);
  const end = readme.indexOf(END_MARKER);

  if (start === -1 || end === -1 || start > end) {
    throw new Error(`Could not find ${START_MARKER} and ${END_MARKER} in ${README_PATH}`);
  }

  const before = readme.slice(0, start + START_MARKER.length);
  const after = readme.slice(end);
  fs.writeFileSync(README_PATH, `${before}\n${markdown}\n${after}`);
}

async function main() {
  const events = await fetchEvents();
  updateReadme(buildMarkdown(events));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
