import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { routes } from "./routers/routesIndex.js";
import { app, server } from "./socket/socket.js"
import { scheduleDonationCheck } from "./utils/cronJobs.js";

app.use(
  cors({
    origin: process.env.CORS_ORIGIN,
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());

app.use(
  express.urlencoded({
    extended: true,
    limit: "16kb",
  })
);

app.use(express.static("public"));

app.use(cookieParser());

app.use(routes);

scheduleDonationCheck();

server.listen(process.env.PORT || 3000, () =>
  console.log("Server is running on PORT:", process.env.PORT || 3000)
);
