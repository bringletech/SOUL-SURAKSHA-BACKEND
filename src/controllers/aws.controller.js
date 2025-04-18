import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3Client } from "../utils/aws.Config.js";

const BUCKET_NAME = "soul-suraksha";
let FOLDER_PATH = "Uploads/Story-Images";

const generateUploadUrl = async (fileType, folder_name) => {
  const fileName = `image-${Date.now()}-${Math.random()
    .toString(36)
    .substring(7)}.${fileType.split("/")[1]}`;

  if (folder_name) {
    FOLDER_PATH = `Uploads/${folder_name}`;
  }

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: `${FOLDER_PATH}/${fileName}`,
    ContentType: fileType,
  });

  const presignedUrl = await getSignedUrl(s3Client, command);
  const objectUrl = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${FOLDER_PATH}/${fileName}`;

  return {
    presignedUrl,
    objectUrl,
    fileName,
  };
};

// Delete single object
export const deleteSingleObjectFromS3 = async (fileUrl) => {
  try {
    // Handle case where fileUrl is null or undefined
    if (!fileUrl) {
      console.log("No file URL provided for deletion");
      return {
        success: true,
        message: "No file to delete",
      };
    }

    // Extract just the key path from the URL - more robust URL parsing
    let key;
    try {
      const urlObj = new URL(fileUrl);
      // Remove the domain part and any leading slash to get the key
      const pathWithoutLeadingSlash = urlObj.pathname.startsWith("/")
        ? urlObj.pathname.substring(1)
        : urlObj.pathname;
      key = pathWithoutLeadingSlash;
    } catch (urlError) {
      console.error("Invalid URL format:", urlError);
      return {
        success: false,
        message: "Invalid URL format",
      };
    }

    // Check if key was properly extracted
    if (!key) {
      console.error("Could not extract key from URL:", fileUrl);
      return {
        success: false,
        message: "Could not extract key from URL",
      };
    }

    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    const response = await s3Client.send(command);
    console.log("S3 deletion response:", response);
    return {
      success: true,
      message: "File deleted successfully",
      response,
    };
  } catch (error) {
    console.error("Error deleting file:", error);
    throw new Error("Failed to delete file from S3");
  }
};

// Delete multiple objects
export const deleteMultipleObjectsFromS3 = async (fileNames) => {
  try {
    const command = new DeleteObjectsCommand({
      Bucket: BUCKET_NAME,
      Delete: {
        Objects: fileNames.map((fileName) => ({
          Key: fileName.split(".amazonaws.com/")[1],
        })),
        Quiet: false,
      },
    });

    const response = await s3Client.send(command);
    return {
      success: true,
      message: "Files deleted successfully",
      deleted: response.Deleted,
      errors: response.Errors,
    };
  } catch (error) {
    console.error("Error deleting files:", error);
    throw new Error("Failed to delete files from S3");
  }
};

// Handler for single file deletion
async function handleSingleDelete(req, res) {
  try {
    const { fileName } = req.body;
    const result = await deleteSingleObjectFromS3(fileName);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// Handler for multiple files deletion
async function handleMultipleDelete(req, res) {
  try {
    const { fileNames } = req.body; // Expect an array of file names
    const result = await deleteMultipleObjectsFromS3(fileNames);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function handleSingleUpload(req, res) {
  try {
    const { fileType, folder_name } = req.query; // expect 'image/jpeg' or 'image/png' etc.
    console.log("type", fileType);
    const uploadData = await generateUploadUrl(fileType, folder_name);
    res.status(200).json(uploadData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

export { handleSingleUpload, handleMultipleDelete, handleSingleDelete };
