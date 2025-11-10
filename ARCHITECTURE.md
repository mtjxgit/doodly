# Doodly - Application Architecture

This document details the technical architecture, data flow, and key decisions made during the development of the Doodly collaborative canvas.

---

## Data Flow Diagrams

![10F82520-866D-48D3-81FE-7A89F80A71B2_1_105_c](https://github.com/user-attachments/assets/9f82d2d0-c871-4400-9068-808051da2fc0)


---

## WebSocket Protocol

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

## Undo/Redo Strategy: Server-Authoritative

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

## Performance Decisions

Several key optimizations were made across the client and server to ensure low latency and a smooth user experience.

### Client-Side Rendering (`canvas.js`)
* **Dual-Layer Canvas:** The client uses two canvases: a `backgroundCanvas` for all committed operations and a main (foreground) canvas for real-time previews. This avoids redrawing the entire history on every mouse move. The foreground is simply cleared and composited with the background (`composeLayers`).
* **Preview Coalescing:** All remote preview drawing (for both strokes and shapes) is batched into a single `requestAnimationFrame` (`requestPreviewRedraw`). This prevents multiple, janky redraws in a single frame if many preview packets arrive at once.
* **Smooth Stroke Drawing:** The drawing functions use `quadraticCurveTo` to render smooth midpoints for strokes, both locally and for remote previews (`_drawSmoothLine`).

### Network (`rooms.js`, `websocket.js`, `canvas.js`)
* **Volatile Messages:** Non-essential, high-frequency updates like cursor movements (`client:cursor:move`) and streaming draws (`client:draw:stream`) are sent using `socket.volatile`. This allows the network to drop these packets if busy, prioritizing critical messages like committed operations.
* **Stroke Batching:** Instead of sending a message for every single point drawn, the client batches points into a `strokeBatchBuffer` (size 3) and sends them in chunks (`onDrawStream`). This drastically reduces the number of WebSocket messages.
* **Coalesced Cursor Emits:** The client uses `requestAnimationFrame` (`emitCursorCoalesced`) to send its cursor position, ensuring it sends *at most* one update per frame and no more than once every 50ms.
* **Selective Broadcasting:** The server intelligently avoids sending data to the original sender when unnecessary. For example, `server:shape:preview_clear` is sent with `socket.to(roomName)`, excluding the sender who already cleared their own preview.
* **Debounced Room List Broadcasts:** The global room list is only broadcast to *all clients on all sockets* at most once every 2 seconds (`debouncedBroadcastRoomList`). This prevents network spam when many users join or leave rooms quickly.

### Server-Side State (`drawing-state.js`, `rooms.js`)
* **O(N) Insertion Sort:** When adding an operation (or redoing one), `_insertOperation` is used to splice it into the `drawingHistory` at the correct timestamp-sorted position. This is an O(N) operation, which is far more efficient than adding and then re-sorting the entire array (O(N log N)) on every write.
* **Debounced Disk Saves:** The server debounces `saveToDisk` calls by 1 second. This means if 10 operations happen in one second, the server only writes to the file *once*, not 10 times.
* **Atomic Disk Writes:** To prevent data corruption, the server writes the new state to a `.tmp` file first. Only after the write is successful does it rename the `.tmp` file to the final `.json` file.
* **Room List Caching:** The server caches the list of all rooms for 5 seconds (`getRoomList`) to avoid expensive, synchronous file system reads (`getAllRooms`) every time a user requests the list.

---

## Conflict Resolution

The system's conflict resolution strategy is based on **client-generated timestamps** and a **server-authoritative, globally-ordered timeline**. There is no complex merging (Operational Transformation).

1.  **Client Timestamp:** When a user finishes a drawing (`onPointerUp`), the `canvas.js` client creates the final operation object and assigns it a `timestamp` using `Date.now()`.
2.  **Server Receives:** The operation is sent via `client:operation:add` to `rooms.js`. The server double-checks for a timestamp and adds one if it's missing (as a fallback).
3.  **Ordered Insertion:** The server passes the operation to `drawing-state.js`, which uses the `_insertOperation` method. This method iterates through the `drawingHistory` to find the correct chronological position for the new operation based on its timestamp and splices it in.
4.  **Global Broadcast:** The server broadcasts this *final, timestamped* operation to all clients via `server:operation:add`.
5.  **Client Convergence:** All clients (including the original sender) receive this operation via `addOperationToHistory`. The client's local `this.history` array is also sorted by timestamp (`this.history.sort(...)`) to ensure consistency.
6.  **Full Redraw:** Critically, the client then calls `redrawBackground()`. This function **clears the background canvas and redraws every single operation** from the newly-sorted history, from oldest to newest.

**Result:** If two users draw simultaneously, both operations are timestamped. The server inserts them into the global history based on whichever timestamp is *earlier*. Because all clients receive these operations and redraw their entire canvas based on the same, sorted history, their canvases are **guaranteed to converge to the exact same state**, even if the packets arrived in a different order. The "conflict" is resolved by "Last Write Wins," but "Last Write" is determined by the client's timestamp, not the server's receive time.
