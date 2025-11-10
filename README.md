# Doodly - Real-Time Collaborative Whiteboard

Doodly is a high-performance, real-time collaborative drawing application built with Node.js, Express, and Socket.io. It supports multiple rooms, persistent drawing history, various tools (brush, eraser, shapes), and is optimized for low-latency interactions.

This project features a robust backend handling session management and state persistence, and an optimized dual-canvas frontend for a smooth drawing experience.

## 🚀 Features

* **Real-Time Collaboration:** All drawings are broadcast instantly to other users in the same room.
* **Multiple Rooms:** Create or join any number of isolated drawing rooms.
* **Persistent State:** Drawing history is saved to the server's file system, surviving server restarts.
* **Session Management:** Users can disconnect and reconnect (e.g., on a network refresh) and will be restored to their room.
* **Rich Tools:**
    * Brush (variable width)
    * Eraser (variable width)
    * Shapes (Rectangle, Circle, Triangle)
* **Live Cursors:** See the cursors of other users moving in real-time.
* **Performance Optimizations:**
    * **Client:** Dual-canvas rendering (one for "committed" history, one for "preview" strokes) and `requestAnimationFrame` coalescing for smooth drawing.
    * **Server:** Efficient O(N) operation insertion, debounced room list broadcasts, and atomic writes for state persistence.

## 💻 Technologies Used

* **Backend:** Node.js, Express, Socket.io
* **Frontend:** Vanilla JavaScript (ES6+), Socket.io Client, HTML5 Canvas
* **Persistence:** Local File System (JSON)

## 📁 Project Structure

The project is structured into a `client` and `server` directory.
```
/
├── client/
│   ├── index.html           # Main application page
│   ├── style.css            # Styles 
│   ├── main.js              # Main frontend controller, UI, and event wiring
│   ├── canvas.js            # Core drawing logic (dual-canvas, tools, rendering)
│   ├── websocket.js         # Client-side Socket.io manager (reconnection, etc.)
│   └── tools/
│       └── shape-tool.js    # Logic for the shape drawing tool
├── server/
│   ├── server.js            # Main server entry (Express + Socket.io setup)
│   ├── rooms.js             # RoomManager class (handles users, sessions, events)
│   └── drawing-state.js     # DrawingState class (handles room persistence to disk)
├── room-data/
│   └── (Generated room data .json files)
└── package.json             # Project dependencie
```

---

## 🛠️ Setup Instructions

### Prerequisites

* [Node.js](https://nodejs.org/) (v14.x or later)
* npm

### Installation & Running

1.  **Clone the repository:**
    ```sh
    git clone [https://github.com/your-repo/doodly.git](https://github.com/your-repo/doodly.git)
    cd doodly
    ```

2.  **Install dependencies:**
    *Note: A `package.json` is assumed. You may need to create one.*
    ```sh
    npm install express socket.io
    ```

3.  **Run the server:**
    The server is designed to be run from the `server/` directory.
    ```sh
    node server/server.js
    ```
    You should see a confirmation in your terminal:
    ```
    🚀 Server running on http://localhost:3000
    ```

4.  **Access the application:**
    Open your web browser and navigate to **`http://localhost:3000`**.

---

## 👥 How to Test with Multiple Users

To test the real-time collaboration features, you need to simulate multiple different users.

The application uses **`sessionStorage`** to manage session IDs. Because of this, opening new *tabs* in the same browser will likely share the same session and will not work for testing.

**The correct way to test:**

* **Option 1 (Recommended):** Use Incognito or Private windows.
    1.  Open `http://localhost:3000` in a normal browser window.
    2.  Open `http://localhost:3000` in a new **Incognito** or **Private** window.
* **Option 2:** Use different browsers (e.g., Chrome and Firefox) and open `http://localhost:3000` in each.

You can then log in with different usernames and colors. Ensure you enter the **exact same room name** for both users to see each other and collaborate.

---

## ⚠️ Known Limitations & Bugs

* **Client-Side Redraw Inefficiency:** The client-side `canvas.js` (in `addOperationToHistory`) re-sorts and re-draws the *entire* canvas history from scratch every time a single new operation is received from the server. This is highly inefficient and will cause significant performance lag and flashing in rooms with a large drawing history. The server is optimized for this (O(N) insertion), but the client is not.
* **Global Undo/Redo:** The undo/redo functionality is **global**, not per-user. When a user clicks "Undo," it removes the last-drawn operation on the canvas, regardless of who drew it. This is a design choice but may be unintuitive for users expecting a local (per-user) undo.
* **File-Based Persistence:** The server saves room state to JSON files in the `room-data/` folder. This is not suitable for a large-scale production environment as it:
    * Does not scale horizontally (i.e., you cannot run multiple server instances).
    * Can be slow with very large history files.
    * Relies on the server having disk write permissions.
* **No Authentication:** Usernames are not unique or password-protected. Anyone can join with any name.

---

## 🕒 Time Spent

Approximately **25-30 hours** were spent on designing, building, and optimizing this project.

* **Initial Setup (Backend + Frontend):** 6-8 hours
* **Core Features (Drawing, Tools, Persistence):** 8-10 hours
* **Optimizations & Refactoring:** 8-10 hours
* **Session Management & UI Polish:** 3-5 hours
