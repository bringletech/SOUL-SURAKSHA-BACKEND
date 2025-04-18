import { admin } from "../config/firebase.config.js";

const sendNotification = async (req, res) => {
  try {
    const message = {
      token: "DEVICE_FCM_TOKEN", // Replace with the recipient's FCM token
      notification: {
        title: "Hello!",
        body: "This is a test notification from Firebase.",
      },
      data: {
        // Optional: Add custom data payload
        key1: "value1",
        key2: "value2",
      },
    };

    admin
      .messaging()
      .send(message)
      .then((response) => {
        console.log("Notification sent successfully:", response);
        res.status(200).json({
          message: "Notification sent successfully",
          status: true,
        });
      })
      .catch((error) => {
        console.error("Error sending notification:", error);
        res.status(500).json({
          message: "Failed to send notification",
          error: error.message,
          status: false,
        });
      });
  } catch (error) {
    console.error("Error sending notification:", error);
    res.status(500).json({
      message: "Failed to send notification",
      error: error.message,
      status: false,
    });
  }
};

export { sendNotification };
