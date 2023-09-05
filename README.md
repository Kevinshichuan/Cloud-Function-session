# Cloud-Function-session
This is the cloud function for running the cloud task to deal with the closure of the session from backend


CLOUD-FUNCTION-SESSION
 +- functions/     # Directory containing all your functions code
      |
      +- package.json  # npm package file describing your Cloud Functions code
      |
      +- tsconfig.json
      |
      +- .eslintrc.js # Optional file if you enabled ESLint
      +- tsconfig.dev.json # Optional file that references .eslintrc.js
      |
      +- src/     # Directory containing TypeScript source
      |   |
      |   +- index.ts  # main source file for your Cloud Functions code
      |
      +- lib/
          |
          +- index.js  # Built/transpiled JavaScript code
          |
          +- index.js.map # Source map for debugging


TODO:
1. Configuration of Cloud Tasks
2. Check the unique Session id or callback the tasks
3. Testing (local and remote)



Reference: 

https://medium.com/firebase-developers/how-to-schedule-a-cloud-function-to-run-in-the-future-in-order-to-build-a-firestore-document-ttl-754f9bf3214a

https://firebase.google.com/docs/functions/typescript