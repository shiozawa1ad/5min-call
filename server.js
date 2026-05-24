const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 3000;
const CALL_DURATION = 5 * 60 * 1000; // 5分

app.use(express.static(path.join(__dirname, "public")));

// 待機中のユーザーを1人だけ保持するキュー
let waitingSocket = null;

io.on("connection", (socket) => {
  console.log(`接続: ${socket.id}`);

  // --- マッチング ---
  socket.on("join-queue", () => {
    if (waitingSocket && waitingSocket.id !== socket.id) {
      // ペアが見つかった
      const partner = waitingSocket;
      waitingSocket = null;

      // ルームを作成
      const room = `room-${partner.id}-${socket.id}`;
      partner.join(room);
      socket.join(room);

      // 先に待っていた方がオファーを送る役（initiator）
      partner.emit("matched", { room, initiator: true });
      socket.emit("matched", { room, initiator: false });

      console.log(`マッチング成立: ${partner.id} <-> ${socket.id} [${room}]`);

      // 5分後に強制終了
      setTimeout(() => {
        io.to(room).emit("time-up");
        console.log(`時間切れ: ${room}`);
      }, CALL_DURATION);
    } else {
      // 待機
      waitingSocket = socket;
      socket.emit("waiting");
      console.log(`待機中: ${socket.id}`);
    }
  });

  // --- WebRTC シグナリング（相手にそのまま転送）---
  socket.on("offer", ({ room, offer }) => {
    socket.to(room).emit("offer", { offer });
  });

  socket.on("answer", ({ room, answer }) => {
    socket.to(room).emit("answer", { answer });
  });

  socket.on("ice-candidate", ({ room, candidate }) => {
    socket.to(room).emit("ice-candidate", { candidate });
  });

  // --- 切断 ---
  socket.on("leave", ({ room }) => {
    socket.to(room).emit("partner-left");
    socket.leave(room);
  });

  socket.on("disconnect", () => {
    // 待機中に切断した場合はキューから除去
    if (waitingSocket && waitingSocket.id === socket.id) {
      waitingSocket = null;
    }
    console.log(`切断: ${socket.id}`);
  });
});

server.listen(PORT, () => {
  console.log(`サーバー起動: http://localhost:${PORT}`);
});
