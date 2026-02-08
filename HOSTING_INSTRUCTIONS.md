# Hosting Your Game Arcade Online

To host your project online and share it with your team, while ensuring it updates automatically when you make changes, follow this guide.

## Prerequisites

Since you want **automatic updates**, you need to use **Git** to track your changes.

1.  **Download & Install Git**:
    *   Go to [git-scm.com](https://git-scm.com/download/win).
    *   Download the Windows installer and run it. Use all default settings.
    *   **Restart VS Code** after installation.

## Step 1: Initialize Your Repository

Once Git is installed, open a new terminal in VS Code and run:

```powershell
# 1. Initialize git
git init

# 2. Add all files
git add .

# 3. Commit your changes
git commit -m "Initial launch of Midnight Arcade"
```

## Step 2: Push to GitHub

1.  Create a free account at [github.com](https://github.com/).
2.  Click the **+** icon in the top right -> **New repository**.
3.  Name it (e.g., `midnight-arcade`).
4.  Copy the commands under "…or push an existing repository from the command line". They will look like this:

```powershell
git remote add origin https://github.com/YOUR_USERNAME/midnight-arcade.git
git branch -M main
git push -u origin main
```

## Step 3: Connect to Netlify (Recommended)

Netlify is excellent for static sites like yours and updates automatically when you push to GitHub.

1.  Go to [netlify.com](https://www.netlify.com/) and sign up with your **GitHub** account.
2.  Click **"Add new site"** -> **"Import an existing project"**.
3.  Select **GitHub**.
4.  Choose your `midnight-arcade` repository.
5.  Click **Deploy**.

## Result

*   Netlify will give you a live URL (e.g., `https://midnight-arcade-123.netlify.app`).
*   Share this URL with your team.
*   **Automatic Updates**: Whenever you modify a file in VS Code, just run:
    ```powershell
    git add .
    git commit -m "Update message"
    git push
    ```
    And your live site will update automatically within seconds!
