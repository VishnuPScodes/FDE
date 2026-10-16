# Git: save your work and work in parallel

Git records snapshots of a project so you can see what changed and return to an earlier version. A repository is the project folder plus the history Git stores in `.git`.

## The everyday loop

1. Edit a file in the workspace.
2. Run `git status` to see what changed.
3. Run `git add README.md` to stage a change. Staging lets you choose exactly what goes into the next snapshot.
4. Run `git commit -m "Describe the change"` to save a snapshot.

Use `git log --oneline` to read the recent history. A branch is a movable name for a line of work. Create one with `git switch -c feature/name`, then return to the main line with `git switch main`.

## Merge and resolve conflicts

`git merge feature/name` brings another branch into the branch you are on. If both branches changed the same lines, Git marks the conflict in the file with `<<<<<<<`, `=======`, and `>>>>>>>` lines. Edit the file to keep the intended result, save it, then `git add` and `git commit` the resolution.

Rebase replays your branch's commits on top of another branch: `git rebase main`. This practice runtime supports a local rebase subset and keeps all data in your browser.

## Pull requests

The simulated remote is a local teaching tool. Run `git push origin` and use **Push & open pull request**. Approve the request, inspect the target branch, and merge it. No GitHub account or network request is involved.
