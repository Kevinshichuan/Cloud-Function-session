import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
const { CloudTasksClient } = require('@google-cloud/tasks');

// Initialize Firebase Admin SDK to interact with Firebase services
admin.initializeApp();

// Create a new client to interact with Google Cloud Tasks
const cloudTasksClient = new CloudTasksClient();

// Constants for setting up Google Cloud Tasks
// !!! We dont have it yet until we set up the gcp 
const PROJECT_ID = 'PROJECT_ID';   // Replace with Firebase Project ID
const QUEUE = '=QUEUE_NAME';        // Replace with Cloud Tasks Queue name
const LOCATION = 'LOCATION';       // Replace with the location of Cloud Tasks queue
const FUNCTION_URL = `https://${LOCATION}-${PROJECT_ID}.cloudfunctions.net/clearSession`;  // The URL endpoint the task will hit

/**
 * Firestore trigger that listens for new user documents.
 * Once a user document is created, it schedules a task to clear their session after their specified DurationTime.
 * change
 */
export const scheduleSessionExpiry = functions.firestore.document('users/{userId}').onCreate(async (snapshot, context) => {
    const sessionData = snapshot.data()?.session;

    // Error handling: Check if session data exists for the created user document
    if (!sessionData) {
        console.error("No session data found for user:", context.params.userId);
        return;
    }

    const { startTime, endTime,sessionId } = sessionData;

    // Error handling: Ensure both startTime and endTime are valid numbers
    if (typeof startTime !== 'number' || typeof endTime !== 'number') {
        console.error("Invalid startTime or endTime for user:", context.params.userId);
        return;
    }

    // Calculate the session duration in milliseconds
    const DurationTime = endTime - startTime; 

    

    // Define the task to be scheduled. It will make an HTTP POST request to the `clearSession` function
    // this structure is followed by the article that I provided at the begin
    const task = {
        httpRequest: {
            httpMethod: 'POST',
            url: FUNCTION_URL,
            body: Buffer.from(JSON.stringify({ userId: context.params.userId,
                                               sessionId: sessionId // Including sessionId in the task payload
                                           })).toString('base64'),
            headers: {
                'Content-Type': 'application/json',
            },
        },
        // Set the scheduled time for the task based on the current time + DurationTime
        // convert milsecond to sec
        scheduleTime: {
            seconds: Math.floor(Date.now() / 1000) + Math.floor(DurationTime / 1000)
        }
    };

    // Construct the full path for the Cloud Tasks queue
    const parent = cloudTasksClient.queuePath(PROJECT_ID, LOCATION, QUEUE);

    // Try to create and schedule the task
    try {
        const [response] = await cloudTasksClient.createTask({ parent, task });
        console.log(`Task created: ${response.name}`);
    } catch (error) {
        console.error('Error scheduling a task:', error);
        throw new functions.https.HttpsError('internal', 'Failed to schedule a task.');
    }
});

/**
 * HTTP-triggered Cloud Function.
 * It clears the session for a user whose ID is passed in the request body.
 * This function is hit by the url that I defined above
 */

export const clearSession = functions.https.onRequest(async (req, res) => {

  const { userId, sessionId } = req.body; // Destructuring both userId and sessionId from the request body

  if (!userId || !sessionId) {
      console.error("User ID or Session ID not provided in the request body.");
      res.status(400).send('User ID or Session ID not provided.');
      return;
  }

  const userRef = admin.firestore().collection('users').doc(userId);
  const userSnapshot = await userRef.get();

  const currentSession = userSnapshot.data()?.session;

  // Check if the sessionId from the Cloud Task matches the current sessionId in the Firestore document
  if (currentSession && currentSession.sessionId === sessionId) {
      try {
          await userRef.update({ session: null });
          console.log(`Session cleared for user: ${userId}`);
          res.status(200).send('Session cleared.');
      } catch (error) {
          console.error(`Error clearing session for user ${userId}:`, error);
          res.status(500).send('Failed to clear session.');
      }
  } else {
      console.log(`Session for user ${userId} has already been ended or updated.`);
      res.status(200).send(`Session for user ${userId} has already been ended or updated.`);
  }
});
