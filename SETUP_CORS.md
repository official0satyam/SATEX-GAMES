# Fixing Image Uploads (Two Options)

It seems you are having trouble with the Google Cloud configuration. Here are two ways to solve the image upload issue.

---

## Option 1: The "Correct" Way (Install Free Tool)
**Clarification:** You do **NOT** need to pay money or enter a credit card to use the command-line tool. It is free software. The "Paid" message you saw was likely on the Google Cloud website, which you don't need to use for this.

1.  **Download the Google Cloud SDK Installer (Free):**
    *   [Windows 64-bit Installer (Direct Link)](https://dl.google.com/dl/cloudsdk/channels/rapid/GoogleCloudSDKInstaller.exe)
2.  **Run the Installer**:
    *   Accept defaults.
    *   When it finishes, it will open a terminal window.
    *   Run `gcloud init` and log in with your Google account.
3.  **Run the CORS Command**:
    *   Open your project folder (`D:\Archad`) in that terminal.
    *   Run: `gsutil cors set cors.json gs://satex-games.appspot.com`

---

## Option 2: The "Easiest" Way (Switch to ImgBB)
If you don't want to install anything, we can switch your project to use **ImgBB** (a free image hosting service) instead of Firebase Storage. This completely avoids the Google/CORS issue.

1.  **Get a Free API Key:**
    *   Go to [https://api.imgbb.com/](https://api.imgbb.com/)
    *   Click "Get API Key" (Login/Signup is free).
    *   Copy your connection key.

2.  **Update Your Code (`core/services.js`):**
    *   Locate the `uploadImageDataUrl` function.
    *   Replace it with the code below (add your API key):

```javascript
async function uploadImageDataUrl(dataUrl, folder) {
    const apiKey = 'YOUR_IMGBB_API_KEY_HERE'; // PASTE KEY HERE
    
    // Remove header to get pure base64
    const base64Image = dataUrl.replace(/^data:image\/\w+;base64,/, "");
    
    const formData = new FormData();
    formData.append("image", base64Image);
    
    try {
        console.log("[Upload] Uploading to ImgBB...");
        const response = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
            method: "POST",
            body: formData
        });
        
        const data = await response.json();
        if (data.success) {
            console.log("[Upload] Success:", data.data.url);
            return data.data.url;
        } else {
            throw new Error(data.error.message || "Upload failed");
        }
    } catch (error) {
        console.error("[Upload] Error:", error);
        throw new Error("Image upload failed. Please try again.");
    }
}
```

This method is simpler and requires no software installation or configuration.
