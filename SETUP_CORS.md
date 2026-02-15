# Fixing Image Uploads (CORS) - The Easiest Way

Since you don't have the Google Cloud tools installed locally (and installing them is a large download), the easiest way to fix the image upload issue is to use the **Google Cloud Shell** in your browser. It comes pre-installed with everything we need.

## Steps

1.  **Open Google Cloud Console**:
    Go to [https://console.cloud.google.com/](https://console.cloud.google.com/) and make sure you are logged in with the same Google account you use for Firebase.

2.  **Select Your Project**:
    Click the project dropdown at the top and select **`satex-games`**.

3.  **Open Cloud Shell**:
    Click the **Activate Cloud Shell** icon in the top-right toolbar (it looks like a terminal prompt `>_`). A terminal window will open at the bottom of the page.

4.  **Create the CORS config**:
    In the Cloud Shell terminal, type this command to create the file:
    ```bash
    echo '[{"origin": ["*"],"method": ["GET", "PUT", "POST", "DELETE", "HEAD"],"responseHeader": ["Content-Type", "x-goog-resumable"],"maxAgeSeconds": 3600}]' > cors.json
    ```

5.  **Apply the Configuration**:
    Run this command in the Cloud Shell:
    ```bash
    gsutil cors set cors.json gs://satex-games.appspot.com
    ```

6.  **Done!**
    You can now close the Cloud Shell. Go back to your local website (`localhost`), refresh the page, and try uploading an image again. It should now work instantly!
