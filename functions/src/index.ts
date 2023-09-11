import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
// import { projectID } from 'firebase-functions/params';
import {CloudTasksClient} from "@google-cloud/tasks";
// const {CloudTasksClient} = require("@google-cloud/tasks");

// const { createHash } = require('crypto');

// limits for the cloud tasks

// Initialize Firebase Admin SDK to interact with Firebase services
admin.initializeApp();

// Create a new client to interact with Google Cloud Tasks
const cloudTasksClient = new CloudTasksClient();

// Constants for setting up Google Cloud Tasks
// !!! We dont have it yet until we set up the gcp
const PROJECT_ID = "geogrind-ab91e"; // Replace with Firebase Project ID
const QUEUE = "Sessionscheduler"; // Replace with Cloud Tasks Queue name
// Replace with the location of Cloud Tasks queue

const LOCATION = "us-central1";

// The URL endpoint the task will hit
const FUNCTION_URL = `https://${LOCATION}-${PROJECT_ID}.cloudfunctions.net/clearSession`;
/**
 *
 * Firestore trigger that listens for new user
 * documents.Once a user document is created,
 * it schedules a task to clear their session after their
 * specified DurationTime. change
 */


export const scheduleSessionExpiry = functions.firestore
  .document("users/{userId}")
  .onUpdate(async (change, context) => {
    const beforeSession = change.before.data()?.session;
    const afterSession = change.after.data()?.session;

    console.log("before if");
    // If session was updated from null to a non-null value, proceed
    if (!beforeSession && afterSession) {
      console.log("console log for schedule null to non-null");

      const {startTime, stopTime, id} = afterSession;

      // Error handling: Ensure both startTime and endTime are valid numbers
      if (typeof startTime !== "number" || typeof stopTime !== "number") {
        console.error(
          "Invalid startTime or endTime for user:",
          context.params.userId
        );
      }

      // Calculate the session duration in milliseconds
      const DurationTime = stopTime - startTime;

      const sessionID = id;
      const userId = context.params.userId;

      console.log("Session ID:", sessionID);
      console.log("User ID:", userId);
      
      // Generate the unique task id for the task
      // const taskUniqueId = generateUniqueTaskIdentifier(sessionID, userId);

      // store the task identifier in the firestore along with
      // the user's document
      // await storeTaskIdentifierInFireStore(sessionID, userId, taskUniqueId);

      // Define the task to be scheduled. It will make an HTTP POST request to
      // the `clearSession` function
      // this structure is followed by the article that I provided at the begin
      const task = {
        httpRequest: {
          httpMethod: "POST" as const,
          url: FUNCTION_URL,
          body: Buffer.from(
            JSON.stringify({
              userId: userId,
              sessionId: sessionID, // Including sessionId in the task payload
              // taskId: taskUniqueId,
            })
          ).toString("base64"),
          headers: {
            "Content-Type": "application/json",
          },
        },
        // Set the scheduled time for the task based on the current time +
        // DurationTime
        // convert milsecond to sec
        scheduleTime: {
          seconds:
            Math.floor(Date.now() / 1000) + Math.floor(DurationTime / 1000),
        },
      };

      // Construct the full path for the Cloud Tasks queue
      const parent = cloudTasksClient.queuePath(PROJECT_ID, LOCATION, QUEUE);

      // Try to create and schedule the task
      try {
        const [response] = await cloudTasksClient.createTask({parent, task});
        console.log(`Task created: ${response.name}`);
      } catch (error) {
        console.error("Error scheduling a task:", error);
        throw new functions.https.HttpsError(
          "internal",
          "Failed to schedule a task."
        );
      }
    }
    // else if(beforeSession && !afterSession) { // if it
    // goes in this statement -> it always has a
    // beforeSession (user has to already created the task before)
    //    await callBackDeleteTask(beforeSession);
    // }
  });

/**
 * HTTP-triggered Cloud Function.
 * It clears the session for a user whose ID is passed in the request body.
 * This function is hit by the url that I defined above
 */


export const clearSession = functions.https
  .onRequest(async (req, res) => {
    // Destructuring both userId and sessionId
    const {userId, sessionId} = req.body;
    console.log("Session ID:", sessionId);
    console.log("User ID:", userId);
    if (!userId || !sessionId) {
      console.error("User ID or Session ID not provided in the request body.");
      res.status(400).send("User ID or Session ID not provided.");
      return;
    }

    console.log("inside clearsession");

    const userRef = admin.firestore().collection("users").doc(userId);
    const userSnapshot = await userRef.get();

    const currentSession = userSnapshot.data()?.session;
    console.log("console log 1");
    console.log("userid: ", userId);
    console.log("sessionId: ", sessionId);
    console.log("current sessionId: ", currentSession.id);
    // Check if the sessionId from the Cloud Task matches the current sessionId
    // in the Firestore document
    if (currentSession && currentSession.id === sessionId) {
      console.log("console log 2");
      console.log("userid: ", userId);
      console.log("sessionId: ", sessionId);
      try {
        await userRef.update({session: null});
        console.log(`Session cleared for user: ${userId}`);
        res.status(201).send("Session cleared.");
      } catch (error) {
        console.error(`Error clearing session for user ${userId}:`, error);
        res.status(500).send("Failed to clear session.");
      }
    } else {
      console.log("console log 3");
      console.log("userid: ", userId);
      console.log("sessionId: ", sessionId);
      console.log(
        `Session for user ${userId} has already been ended or updated.`
      );
      res
        .status(200)
        .send(`Session for user ${userId} has already been ended or updated.`);
    }
  });

/*
    CallBack function to delete a scheduled cloud task
    Intuition:
        1. When the session is updated and we schedule a task to clear it
        after a certain duration, create unique task identifier based on
        the session ID ->
        allow to associate the task with the specific session

        2. Store the unique task identifier
        in the Firestore document associated with the session

        3. When schedule a new task for the session,
        check if the session still exists in Firestore before
        scheduling the task. If the session has been deleted,
        do not schedule a new task

        4. To cancel a scheduled task, we can use the Cloud Tasks
        client to delete it based on the unique task identifier that
        we created on step one. This ensures that even if a session is deleted,
        any previously scheduled tasks associated with it can be canceled.


// // Call Back function to detect if the session has been changed
// async function callBackDeleteTask(beforeSession: any) {
//     // get the data before the change and after the change
//     // if there is no afterSession -> the user doesn't create
//     // any other session after stop the previous session
//     // just delete the task
//     const taskIdentifier = beforeSession.taskIdentifier ;
//     await deleteTask(taskIdentifier); // delete all the tasks remaining
// };

// // function to delete the cloud task via cloud task client
// async function deleteTask(taskIdentifier: string) {
//     try {
//         // Construct the full task name
//         const taskName =
// `projects/${PROJECT_ID}/locations/${LOCATION}/
// queues/${QUEUE}/tasks/${taskIdentifier}`;

//         // Delete the task from the Cloud Task Queue
//         await cloudTasksClient.deleteTask({ name: taskName });
//         console.log(`Task deleted successfully: ${taskIdentifier}`);
//     } catch(error) {
//         console.error(`Error deleting the task: `, error);
//     };
// };

// // helper function to generate the task id from session id and user id
// function generateUniqueTaskIdentifier(sessionId: any, userId: any) {
//     // Combine the user id and the session id together
//     const combinedString = `${sessionId}_${userId}`;

//     // hash the combined string using SHA-256 Family
//     return createHash('sha256').update(combinedString).digest('hex');
// };

// // helper function to store the task identifier to the firestore database
// async function storeTaskIdentifierInFireStore(sessionId: any, userId:
// any, taskIdentifier: any) {
//     // Reference to the user's document
//     const userRef = admin.firestore().collection('users').doc(userId);

//     // Add the task identifier to the user's document
//     await userRef.update({
//         taskIdentifier : taskIdentifier
//     })
// };


*/
