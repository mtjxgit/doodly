# Doodly - Application Architecture

This document details the technical architecture, data flow, and key decisions made during the development of the Doodly collaborative canvas.

---

## 1. Data Flow Diagrams

### Flow A: User Joins a Room

1.  **Client:** Enters name/color, then enters room name ("Room A").
2.  **Client (`websocket.js`):** Calls `socket.connect()` with `roomName`, `username`, `color`, and `sessionId`.
3.  **Server (`rooms.js`):** `handleConnection` receives the connection.
    * It checks the `userSessions` map for the `sessionId`.
    * **[Room Switch Fix]:** If the user is found in "Room B", it immediately fires a `user:left` and `users:load` to "Room B" to remove the "ghost" user.
4.  **Server (`rooms.js`):** `joinRoom` is called.
    * If "Room A" doesn't exist in the `rooms` map, it's created, and a new `DrawingState` is instantiated.
    * **[Persistence]:** `drawing-state.js` constructor reads `"./room-data/Room A.json"` from disk to load history.
5.  **Server (`rooms.js`):**
    * Emits `server:history:load` *to the new user* with the full drawing history.
    * Emits `server:rooms:list` *to the new user* with the cached room list.
    * Emits `user:joined` *to everyone else* in "Room A".
    * Emits `users:load` *to everyone* in "Room A" with the new user list.
6.  **Client (`main.js`):**
    * Receives `server:history:load`, calls `canvas.loadHistoryFromServer()`.
    * Receives `user:joined`, shows a toast.
    * Receives `users:load`, updates the user list UI.

### Flow B: User Draws a Stroke

1.  **Client (`canvas.js`):** `onPointerDown` sets `isDrawing = true`.
2.  **Client (`canvas.js`):** `onPointerMove` captures points.
    * **[Client Prediction]:** It draws the stroke *locally* on the top-layer canvas for an instant feel.
    * **[Batching]:** Points are added to `strokeBatchBuffer`.
    * When the buffer is full, `onDrawStream` fires.
    * **[Throttling]:** `emitCursorCoalesced` uses `requestAnimationFrame` to send `client:cursor:move` events at a max of ~20fps.
3.  **Client (`websocket.js`):** Emits `client:draw:stream` and `client:cursor:move` (volatile).
4.  **Server (`rooms.js`):** Receives events.
    * `client:draw:stream` -> Broadcasts `server:draw:stream` to all *other* clients.
    * `client:cursor:move` -> Broadcasts `server:cursor:move` to all *other* clients.
5.  **Other Clients (`canvas.js`):**
    * `handleRemoteDrawStream` adds points to `remoteStrokePreviews` map.
    * `requestPreviewRedraw` is called (using `rAF`) to render all remote previews.
6.  **Client (`canvas.js`):** `onPointerUp` (mouse up).
    * **[Optimization]:** Calls `simplifyPath()` to reduce the number of points.
    * Emits the *final* `client:operation:add` with the complete, simplified stroke.
7.  **Server (`rooms.js`):** Receives `client:operation:add`.
    * Attaches a server timestamp and `userId`.
    * Calls `room.state.addOperation()`.
8.  **Server (`drawing-state.js`):** `addOperation()`
    * **[Conflict Resolution]:** Calls `_insertOperation()` to insert the new operation into the `drawingHistory` array in its correct chronological (timestamp-based) position.
    * Clears the `redoStack`.
    * Calls `debouncedSave()` to save to disk.
9.  **Server (`rooms.js`):** Broadcasts `server:operation:add` to *all* clients (including the sender).
10. **All Clients (`canvas.js`):**
    * `addOperationToHistory()` is called.
    * The `remoteStrokePreviews` for this operation are cleared.
    * The operation is added to the local `history`.
    * `redrawBackground()` commits the new operation to the persistent `backgroundCanvas`.
    * `composeLayers()` copies the background to the main canvas, clearing all previews.

---

## 2. WebSocket Protocol

| Direction | Event | Data | Description |
| :--- | :--- | :--- | :--- |
| Client -> Server | `client:ping` | `timestamp` | Sent to calculate latency. |
| Client -> Server | `client:operation:add`| `operation` | Sent on mouse-up with the *final* stroke/shape data. |
| Client -> Server | `client:draw:stream` | `data` | Sent *during* drawing with a batch of points for live preview. |
| Client -> Server | `client:shape:preview` | `data` | Sent *during* shape drawing for live preview. |
| Client -> Server | `client:undo` | (none) | Request to undo the last global operation. |
| Client -> Server | `client:redo` | (none) | Request to redo the last undone operation. |
| Client -> Server | `client:clear` | (none) | Request to clear the entire canvas for everyone. |
| Client -> Server | `client:cursor:move` | `{x, y}` | (Volatile) Sends the user's current cursor position. |
| Client -> Server | `client:rooms:request` | (none) | Asks the server for the latest list of rooms. |
| | | | |
| Server -> Client | `server:pong` | `timestamp` | Server's reply to a `client:ping`. |
| Server -> Client | `server:history:load` | `history[]` | Sent on join, undo, redo, or clear. Contains the *entire* canvas state. |
| Server -> Client | `server:operation:add` | `operation` | Broadcast to all with the *final* operation to be committed. |
| Server -> Client | `server:draw:stream` | `data` | Broadcast to others showing a live drawing preview. |
| Server -> Client | `server:shape:preview` | `data` | Broadcast to others showing a live shape preview. |
*Server -> Client | `server:shape:preview_clear` | `{userId}` | Broadcast to others when a user finishes/cancels a shape. |
| Server -> Client | `users:load` | `users[]` | Broadcast to all in a room when the user list changes. |
| Server -> Client | `user:joined` | `user` | Broadcast to others when a new user joins. |
| Server -> Client | `user:left` | `user` | Broadcast to others when a user leaves. |
| Server -> Client | `server:cursor:move` | `data` | Broadcast to others to update a user's cursor. |
| Server -> Client | `server:rooms:list` | `rooms[]` | Sent to a client on request or broadcast when rooms change. |
| Server -> Client | `server:reconnected` | `message` | Confirms to a client that their session was successfully resumed. |
| Server -> Client | `server:error` | `message` | Notifies the client of an error (e.g., invalid data). |

---

## 3. Undo/Redo Strategy: Server-Authoritative

The global undo/redo is handled entirely by the server to ensure perfect consistency.

* **State:** The server's `DrawingState` class maintains two arrays:
    1.  `drawingHistory`: The main stack of all operations in chronological order. This is the "single source of truth" for the canvas.
    2.  `redoStack`: A stack of operations that have been undone.

* **Undo Process:**
    1.  A client emits `client:undo`.
    2.  The server (`drawing-state.js`) `pop()`s the last operation from `drawingHistory`.
    3.  This operation is `push()`ed onto the `redoStack`.
    4.  The server then emits `server:history:load` to *all clients* in the room, sending the *entire*, now-shorter `drawingHistory`.
    5.  All clients receive this and completely reload their canvas state.

* **Redo Process:**
    1.  A client emits `client:redo`.
    2.  The server `pop()`s the last operation from `redoStack`.
    3.  This operation is re-inserted into the `drawingHistory` in its correct chronological spot using `_insertOperation()`.
    4.  The server emits `server:history:load` to all clients with the new, longer history.

This strategy is simple and robust. It makes conflict resolution trivial: **there are no conflicts.** The server is the single source of truth, and clients are "dumb" renderers that simply draw whatever state the server sends them.

---

## 4. Performance & Optimization Decisions

High performance (especially with many users) was a primary goal.

### Client-Side
* **Dual-Layer Canvas (`canvas.js`):** The canvas is split into two layers:
    1.  `backgroundCanvas`: A persistent, off-screen canvas that holds the *committed* drawing history.
    2.  `main-canvas`: The visible canvas.
    * **Benefit:** When drawing previews (local or remote), we only need to copy the `backgroundCanvas` to the `main-canvas` and draw the previews on top. This avoids re-drawing the entire history (which could be 10,000+ operations) on every single mouse movement.
* **Client-Side Prediction (`canvas.js`):** The user's *own* drawing is rendered locally immediately in `onPointerMove`. This makes the app feel instant, even with high network latency. This local preview is cleared when the server broadcasts the committed operation back to the client.
* **Stroke Simplification (`canvas.js`):** The `simplifyPath()` (Douglas-Peucker) algorithm is used on `onPointerUp` to reduce the number of points in a stroke before sending it to the server, saving network bandwidth and storage.
* **Event Batching & Throttling (`canvas.js`):**
    * **Strokes:** `strokeBatchBuffer` groups ~3 points together into a single `client:draw:stream` event to reduce network spam.
    * **Cursors:** `emitCursorCoalesced` uses `requestAnimationFrame` to ensure `client:cursor:move` is only sent once per frame, preventing floods of 60+ events/sec.

### Server-Side
* **Efficient State Insertion (`drawing-state.js`):** When adding or redoing an operation, we do *not* call `sort()` on the entire history. This would be `O(N log N)` and very slow. Instead, `_insertOperation` finds the correct chronological spot and uses `splice()` to insert it. This is an `O(N)` operation, which is significantly faster.
* **Room List Caching (`rooms.js`):** `getRoomList()` requires reading the filesystem, which is a slow, blocking I/O operation. The result is cached for 5 seconds to prevent every `client:rooms:request` from hitting the disk.
* **Broadcast Debouncing (`rooms.js`):** When users join/leave, the global room list must be updated for all users on the server. `debouncedBroadcastRoomList` ensures this broadcast only happens (at most) once every 2 seconds, preventing a "network storm" if 100 users join at once.
* **Session Management (`rooms.js`):** The `userSessions` map (using the client's `sessionId`) is the key to managing reconnections and fixing the "ghost user" bug that occurs when a user switches rooms.

---

## 5. Conflict Resolution

* **Simultaneous Drawing:** Resolved by **server timestamping**. When `client:operation:add` is received, the server assigns a definitive `timestamp`. The `_insertOperation` function ensures all operations are added to the state in this timestamp order. Even if User A's stroke (10:00:01) arrives *after* User B's stroke (10:00:02) due to network lag, the server will correctly insert A *before* B.
* **Simultaneous Undo:** Resolved by the **server-authoritative stack**. If two users click "Undo" at the same time, the server will receive two `client:undo` events. It will process them sequentially, popping two items from the `drawingHistory` and sending two `server:history:load` broadcasts. The final state will be consistent for all users.
* **Connection/Reconnection:** Resolved by **session management**. The `handleConnection` logic's primary job is to check an incoming `sessionId` against the `userSessions` map. This allows it to distinguish a new user from a reconnecting user or a user who is switching rooms, and to correctly clean up old sockets.
