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

function summarizeEvent(event) {
  const repo = repoLink(event.repo.name);

  switch (event.type) {
    case "PushEvent": {
      const commits = event.payload.commits || [];
      const count = commits.length;
      if (count === 0) return `Pushed to ${repo}`;

      const firstCommit = commits[0];
      const message = firstCommit.message.split("\n")[0];
      const commitUrl = firstCommit.url
        .replace("api.github.com/repos", "github.com")
        .replace("/commits/", "/commit/");
      const commitText = `[${message}](${commitUrl})`;
      const suffix = count === 1 ? "" : ` and ${count - 1} more commit${count === 2 ? "" : "s"}`;

      return `Pushed ${commitText}${suffix} to ${repo}`;
    }
    case "PullRequestEvent":
      return `${capitalize(event.payload.action)} pull request [#${event.payload.pull_request.number}](${event.payload.pull_request.html_url}) in ${repo}`;
    case "IssuesEvent":
      return `${capitalize(event.payload.action)} issue [#${event.payload.issue.number}](${event.payload.issue.html_url}) in ${repo}`;
    case "IssueCommentEvent":
      return `Commented on issue [#${event.payload.issue.number}](${event.payload.comment.html_url}) in ${repo}`;
    case "PullRequestReviewEvent":
      return `Reviewed pull request [#${event.payload.pull_request.number}](${event.payload.review.html_url}) in ${repo}`;
    case "CreateEvent":
      return `Created ${event.payload.ref_type}${event.payload.ref ? ` \`${event.payload.ref}\`` : ""} in ${repo}`;
    case "ReleaseEvent":
      return `${capitalize(event.payload.action)} release [${event.payload.release.name || event.payload.release.tag_name}](${event.payload.release.html_url}) in ${repo}`;
    case "ForkEvent":
      return `Forked ${repo}`;
    case "WatchEvent":
      return `Starred ${repo}`;
    default:
      return null;
  }
}

function capitalize(value = "") {
  return value.charAt(0).toUpperCase() + value.slice(1);
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
  const items = events
    .filter((event) => eventDayKey(event) === today)
    .map(summarizeEvent)
    .filter(Boolean)
    .slice(0, 6);

  if (items.length === 0) {
    return `- No public GitHub activity yet today.`;
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
