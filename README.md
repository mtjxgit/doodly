# Doodly - A Real-Time Collaborative Canvas

A multi-user, real-time whiteboarding application built with Node.js, Express, Socket.IO, and vanilla JavaScript. This project focuses on high-performance canvas rendering and robust state synchronization.

**Demo Link:** `http://doodly-lovh.onrender.com`
**Repo Link:** `https://github.com/mtjxgit/doodly/`

---

## 🚀 Features

### Core Requirements
* **Drawing Tools:** A complete toolset including a Brush, Eraser, and Shape tool (Rectangle, Circle, Triangle).
* **Tool Adjustments:** Modify stroke width and color for all tools.
* **Real-time Sync:** See other users' drawings *as they draw*, not just when they finish a stroke.
* **Live Cursors:** See the cursor positions of all other users in the room in real-time.
* **User Management:** View a list of all online users, see join/leave notifications, and have a unique color assigned at login.
* **Global Undo/Redo:** A server-authoritative undo/redo stack that is perfectly synchronized for all users.

### Bonus Features Implemented
* **Room System:** Users can create and join isolated rooms.
* **Drawing Persistence:** Canvas state is saved to the server's disk and reloaded when a new user joins a room.
* **Mobile Touch Support:** The application is fully responsive and supports touch/pen events for drawing on mobile devices.
* **Performance Metrics:** The UI displays a real-time FPS counter and network latency (Ping) monitor.
* **Shape Tool:** A bonus drawing tool for creating perfect shapes.

---

## 🔧 Setup & Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/mtjxgit/doodly/
    cd collaborative-canvas
    ```

2.  **Install server dependencies:**
    ```bash
    npm install
    ```
    (Note: The `client` directory has no build step and is served statically).

3.  **Run the server:**
    ```bash
    npm start
    ```
    The server will be running at `http://localhost:3000`.

---

## 🧪 How to Test

1.  Open `http://localhost:3000` in a browser window.
2.  Enter a username and pick a color.
3.  Enter a room name (e.g., "test-room").
4.  Open a *second* browser window (or a private/incognito window).
5.  Repeat the process with a *different* username and join the *same* room ("test-room").
6.  Draw in one window and observe the real-time drawing, cursor, and user list updates in the other.
7.  Test the global undo/redo by having one user draw and the *other* user press the undo button.

---

## ⏳ Time Spent

* **Initial Development:** ~10 hours
* **Optimization & Bug Fixing:** ~3 hours

## ⚠️ Known Limitations

* **No Authentication:** The app is session-based but has no formal login system.
* **No Stroke Eraser:** The eraser tool is a "pixel" eraser (drawing with white) rather than an object-based stroke eraser.
  
