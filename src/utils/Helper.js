import { GoogleGenerativeAI } from "@google/generative-ai";
import { JSDOM } from "jsdom";
import { generateAccessToken } from "./generateAccessToken.js";
import { prisma } from "../db/prismaClientConfig.js";
import * as cheerio from "cheerio";
import qs from "qs";
import axios from "axios";

const accessTokenGenerator = async (userId, userType) => {
  let user;

  console.log("userType", userType);
  try {
    if (userType === "student") {
      user = await prisma.student.findFirstOrThrow({
        where: { id: userId },
      });
    } else if (userType === "parent") {
      user = await prisma.parent.findFirstOrThrow({
        where: { id: userId },
      });
    } else if (userType === "therapist") {
      user = await prisma.therapist.findFirstOrThrow({
        where: { id: userId },
      });
    } else if (userType === "admin") {
      user = await prisma.admin.findFirstOrThrow({
        where: { id: userId },
      });
    }
    const accessToken = generateAccessToken(user.id, user.email, userType);
    return { accessToken };
  } catch (error) {
    throw new Error("Failed to generate access token");
  }
};

export const timeAgo = (date) => {
  const seconds = Math.floor((new Date() - new Date(date)) / 1000);

  // Define time intervals in seconds
  const intervals = {
    year: 31536000,
    month: 2592000,
    week: 604800,
    day: 86400,
    hour: 3600,
    minute: 60,
    second: 1,
  };

  // Handle future dates
  if (seconds < 0) {
    return "just now";
  }

  // Find the appropriate interval
  for (const [unit, secondsInUnit] of Object.entries(intervals)) {
    const interval = Math.floor(seconds / secondsInUnit);

    if (interval >= 1) {
      // Special case for just now
      if (unit === "second" && interval < 30) {
        return "just now";
      }

      // Return plural or singular form
      return `${interval} ${unit}${interval === 1 ? "" : "s"} ago`;
    }
  }

  return "just now";
};

const extractTextFromHtml = (htmlContent) => {
  const dom = new JSDOM(htmlContent);
  const document = dom.window.document;

  // Remove image placeholders and hr tags
  document.querySelectorAll("hr, img").forEach((el) => el.remove());

  // Get text content
  return document.body.textContent
    .trim()
    .replace(/\s+/g, " ") // Normalize whitespace
    .replace(/!\[.*?\]/g, ""); // Remove markdown image syntax
};

const createBlogContextPrompt = (htmlContent) => {
  const cleanContent = extractTextFromHtml(htmlContent);

  return `
Analyze the following blog content and provide:
1. A concise 3-line summary capturing the main message

Keep the format exactly as follows:
SUMMARY:
[3 lines of summary]

Blog Content:
${cleanContent}
`;
};

const generateBlogContext = async (content) => {
  if (!content) {
    throw new Error("Blog content is required");
  }

  try {
    // Initialize the AI model
    const genAI = new GoogleGenerativeAI(
      process.env.GOOGLE_GENERATIVEAI_API_KEY
    );
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-8b" });

    // Generate and send prompt
    const prompt = createBlogContextPrompt(content);
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Parse the response
    const summarySection = text
      .split("\n\n")
      .find((section) => section.startsWith("SUMMARY:"));

    if (!summarySection) {
      throw new Error("Failed to generate summary from AI response");
    }

    // Extract and clean the summary
    const summary = summarySection
      .replace("SUMMARY:", "")
      .trim()
      .split("\n")
      .filter((line) => line.length > 0)
      .join("\n");

    return summary;
  } catch (error) {
    console.error("AI Context Generation Error:", error);
    return {
      success: false,
      error: error.message || "Failed to generate context",
      metadata: {
        errorCode: error.code,
        errorDetails: error.details,
      },
    };
  }
};

function extractImageUrls(blogContent) {
  try {
    // Load the HTML content with cheerio
    const $ = cheerio.load(blogContent.content);

    // Find all img elements and extract their src attributes
    const imageUrls = [];
    $("img").each((_, element) => {
      const src = $(element).attr("src");
      if (src) {
        imageUrls.push(src);
      }
    });

    return imageUrls;
  } catch (error) {
    console.error("Error extracting image URLs:", error);
    return [];
  }
}

const getGoogleOauthTokens = async ({ code }) => {
  const url = "https://oauth2.googleapis.com/token";

  const values = {
    code,
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    redirect_uri: process.env.GOOGLE_OAUTH_REDIRECTURL,
    grant_type: "authorization_code",
  };

  try {
    const res = await axios.post(url, qs.stringify(values), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });
    return res.data;
  } catch (error) {
    console.error("Error getting Google OAuth tokens:", error);
    throw new Error(error.message);
  }
};

const getGoogleUser = async ({ id_token, access_token }) => {
  try {
    const res = await axios.get(
      `https://www.googleapis.com/oauth2/v1/userinfo?alt=json&access_token=${access_token}`,
      {
        headers: {
          Authorization: `Bearer ${id_token}`,
        },
      }
    );
    return res.data;
  } catch (error) {
    console.error("Error getting Google user:", error);
    throw new Error(error.message);
  }
};

const googleOAuth = async (req, res) => {
  try {
    const { id_token, access_token, userType } = req.body;

    // Verify Google tokens (similar to your existing getGoogleUser function)
    const googleUser = await getGoogleUser({
      id_token,
      access_token,
    });

    // Your existing user registration/login logic
    const user = await findOrCreateUser({
      email: googleUser.email,
      name: googleUser.name,
      userType,
    });

    // Generate access token
    const accessToken = generateAccessToken(user);

    res.json({ accessToken });
  } catch (error) {
    res.status(400).json({ message: "Google OAuth failed" });
  }
};

const isAllDigits = (str) => /^\d+$/.test(str);
export {
  generateBlogContext,
  accessTokenGenerator,
  extractImageUrls,
  getGoogleOauthTokens,
  getGoogleUser,
  isAllDigits,
};
