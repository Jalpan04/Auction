# Firebase Real-time Auction App

[![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript) [![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=flat&logo=html5&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/HTML) [![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=flat&logo=css3&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/CSS) [![Shell](https://img.shields.io/badge/Shell-4D4D4D?style=flat&logo=windows-terminal&logoColor=white)](https://en.wikipedia.org/wiki/Batch_file) [![Playwright](https://img.shields.io/badge/Playwright-2EAD33?style=flat&logo=playwright&logoColor=white)](https://playwright.dev) [![Firebase](https://img.shields.io/badge/Firebase-FFCA28?style=flat&logo=firebase&logoColor=black)](https://firebase.google.com) ![GitHub repo size](https://img.shields.io/github/repo-size/Jalpan04/Auction) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A modern, real-time auction web application powered by Google Firebase. It allows users to list items for auction, track live countdown timers, place real-time bids, and receive instant outbid updates. It also includes automated End-to-End (E2E) testing configurations using Microsoft Playwright.

## Features

- **User Authentication**: Secure signup, login, password resets, and session management powered by Firebase Auth.
- **Real-time Live Bidding**: Dynamic bid submission with instant synchronisation across all connected clients using Firestore/Realtime Database.
- **Auction Listings**: Create and publish new listings with description details, starting bids, custom end-times, and images.
- **Live Countdown Timers**: Visual timers that automatically count down in real-time, closing the bidding when they expire.
- **Playwright E2E Tests**: Comprehensive automated test coverage (`tests/`) verifying authentication flows, bidding logic, and real-time updates.
- **Firebase Deploy Ready**: Includes pre-configured Firebase CLI parameters (`firebase.json`, `.firebaserc`) for fast deployment to Firebase Hosting.

## Tech Stack

- **Frontend**: HTML5, CSS3, JavaScript (ES6)
- **Backend/Database**: Google Firebase (Authentication, Firestore, Hosting)
- **Testing**: Playwright (E2E Automated Testing framework)

## File Structure

```
├── public/                 # Web app frontend source
│   ├── css/                # Application stylesheets
│   ├── js/                 # Javascript files (auth.js, auction.js, firebase-config.js)
│   ├── index.html          # Main auction dashboard & listing viewport
│   └── reset.html          # Authentication helper / state reset page
├── firebase.json           # Firebase configuration
├── .firebaserc             # Firebase target resource registry
├── package.json            # Node scripts and devDependencies (Playwright)
├── run_local.bat           # Batch script for local testing
└── LICENSE                 # MIT License
```

## Getting Started

### Prerequisites
- Node.js (v18 or higher)
- Firebase Account and CLI tool

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/Jalpan04/Auction.git
   ```
2. Install testing dependencies:
   ```bash
   npm install
   ```
3. Set up your Firebase project:
   - Create a project on the [Firebase Console](https://console.firebase.google.com).
   - Configure Firebase Authentication and Firestore Database.
   - Update `public/js/firebase-config.js` with your Web App configuration keys.

### Running Locally
To test the web application locally, run:
```bash
npx firebase serve
# Or run the local helper batch file:
./run_local.bat
```

### Running Tests
To run the automated E2E tests using Playwright:
```bash
npx playwright test
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
