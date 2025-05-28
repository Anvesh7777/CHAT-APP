const uploadFile = async (file) => {
    const cloudName = process.env.REACT_APP_CLOUDINARY_CLOUD_NAME;
    const uploadPreset = process.env.REACT_APP_CLOUDINARY_UPLOAD_PRESET || "chat-app";
  
    if (!cloudName) throw new Error("Cloudinary cloud name not defined");
  
    const url = `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`;
  
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', uploadPreset);
  
    try {
      const response = await fetch(url, {
        method: 'POST',
        body: formData,
      });
  
      const data = await response.json();
  
      if (!response.ok) {
        throw new Error(data?.error?.message || 'Upload failed');
      }
  
      return data;
    } catch (err) {
      console.error("File upload error:", err);
      throw err;
    }
  };
  
  export default uploadFile;
  