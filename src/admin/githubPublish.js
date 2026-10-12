// Publishes word bank changes from the admin page as one commit on GitHub,
// straight to a branch of the word base repository (no pull request). The
// "Content publish" workflow in this repository then puts it on the live site.
// The word base is a separate repository so an admin's token can only change
// words, never the app or its workflows.
//
// Uses the Git data API so several changed files become a single commit, and
// refuses to overwrite a file that changed on GitHub after the admin page
// loaded it.

import { formatPack } from "../lib/contentSchema";

export class PublishConflict extends Error {
  constructor(paths) {
    super(`Changed on GitHub since this page loaded: ${paths.join(", ")}. Reload the page to get the newest words, then make your change again.`);
    this.paths = paths;
  }
}

function base64Utf8(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

// Same JSON written the same way, so layout-only differences don't count as changes.
function canonical(path, text) {
  if (text == null) return null;
  try {
    const value = JSON.parse(text);
    return /(^|\/)packs\//.test(path) ? formatPack(value) : JSON.stringify(value);
  } catch {
    return text;
  }
}

// files: [{ path, content, original }] where path is relative to the repo root,
// content is the new text and original the text this page started from (null
// for a new file). Resolves to { sha, url } of the new commit.
export async function publishToGitHub({ token, repo, branch, files, message, fetchImpl = globalThis.fetch }) {
  const api = async (method, url, body) => {
    const res = await fetchImpl(`https://api.github.com/repos/${repo}/${url}`, {
      method,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 404 && method === "GET" && url.startsWith("contents/")) return null;
    if (!res.ok) {
      let detail = "";
      try { detail = (await res.json()).message || ""; } catch { /* no body */ }
      const hint = res.status === 401 ? " Check the access token." : res.status === 403 || res.status === 404 ? " The token may not have write access to this repository." : "";
      throw new Error(`GitHub said ${res.status}${detail ? `: ${detail}` : ""}.${hint}`);
    }
    return res.status === 204 ? null : res.json();
  };

  const ref = await api("GET", `git/ref/heads/${encodeURIComponent(branch)}`);
  const parent = ref.object.sha;

  const conflicts = [];
  for (const file of files) {
    const remote = await api("GET", `contents/${file.path}?ref=${encodeURIComponent(parent)}`);
    const remoteText = remote ? new TextDecoder().decode(Uint8Array.from(atob(remote.content.replace(/\n/g, "")), (c) => c.charCodeAt(0))) : null;
    if (canonical(file.path, remoteText) !== canonical(file.path, file.original)) conflicts.push(file.path);
  }
  if (conflicts.length) throw new PublishConflict(conflicts);

  const parentCommit = await api("GET", `git/commits/${parent}`);
  const tree = await api("POST", "git/trees", {
    base_tree: parentCommit.tree.sha,
    tree: await Promise.all(
      files.map(async (f) => {
        const blob = await api("POST", "git/blobs", { content: base64Utf8(f.content), encoding: "base64" });
        return { path: f.path, mode: "100644", type: "blob", sha: blob.sha };
      })
    ),
  });
  const commit = await api("POST", "git/commits", { message, tree: tree.sha, parents: [parent] });
  // Not forced: fails instead of overwriting if someone pushed in the meantime.
  await api("PATCH", `git/refs/heads/${encodeURIComponent(branch)}`, { sha: commit.sha });
  return { sha: commit.sha, url: commit.html_url || `https://github.com/${repo}/commit/${commit.sha}` };
}
