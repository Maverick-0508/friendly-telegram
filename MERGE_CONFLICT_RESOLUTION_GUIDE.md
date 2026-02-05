# Quick Guide: Resolving Merge Conflicts

## The Problem
All feature branches have **unrelated histories** and conflict in `README.md` when merging.

## Quick Fix: Merging a Branch

### Step 1: Start the Merge
```bash
git checkout main  # or your target branch
git merge --allow-unrelated-histories origin/branch-name
```

Expected output:
```
Auto-merging README.md
CONFLICT (add/add): Merge conflict in README.md
Automatic merge failed; fix conflicts and then commit the result.
```

### Step 2: Check Which Files Have Conflicts
```bash
git status
```

You'll see:
```
Unmerged paths:
  both added:      README.md
```

### Step 3: Resolve the README.md Conflict

Open `README.md` in your editor. You'll see conflict markers:

```markdown
<<<<<<< HEAD
# AM Mowing - Professional Lawn Care Platform

A comprehensive lawn care platform combining...
=======
# Friendly Lawn & Garden Services

A professional booking website...
>>>>>>> origin/branch-name
```

**Choose one of these approaches:**

#### Approach A: Keep Current Version
```bash
git checkout --ours README.md
```

#### Approach B: Keep Incoming Version
```bash
git checkout --theirs README.md
```

#### Approach C: Manually Combine
Edit the file to keep the best parts of both:
1. Remove the conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`)
2. Combine or choose the content you want
3. Save the file

### Step 4: Mark as Resolved
```bash
git add README.md
```

### Step 5: Complete the Merge
```bash
git commit
```

Git will open an editor with a default merge commit message. Save and close.

### Step 6: Verify
```bash
git status  # Should show "nothing to commit, working tree clean"
git log --oneline -3  # Check the merge commit is there
```

## Recommended README.md Content

Based on the current repository structure (with `frontend/` and `backend/` directories), the main branch README.md seems most accurate. Consider keeping that version or adapting it to include new features from the merged branch.

## If Things Go Wrong

### Abort the Merge
```bash
git merge --abort
```

This returns your branch to the state before the merge attempt.

### Reset After Staging
If you've already added files but haven't committed:
```bash
git reset --hard HEAD
```

## Preventing Future Conflicts

1. **Always branch from main:**
   ```bash
   git checkout main
   git pull origin main
   git checkout -b new-feature
   ```

2. **Keep branches up to date:**
   ```bash
   git checkout feature-branch
   git merge main
   # Resolve conflicts incrementally
   ```

3. **Use consistent project documentation:**
   - Update README.md on main as the single source of truth
   - Feature branches should add to, not replace, the main README
