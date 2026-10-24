"use strict";
// Internal disposable SMTP sink: never delivers mail or exposes message bodies.
const net = require("node:net");
const http = require("node:http");
require("node:assert/strict").equal(
  process.env.RECOVERY_RUNTIME_ENABLED,
  "true",
);
let messages = 0;
const smtp = net
  .createServer((socket) => {
    socket.setEncoding("utf8");
    socket.write("220 recovery SMTP fixture\r\n");
    let buffer = "",
      data = false;
    socket.on("data", (chunk) => {
      buffer += chunk;
      let at;
      while ((at = buffer.indexOf("\r\n")) >= 0) {
        const line = buffer.slice(0, at);
        buffer = buffer.slice(at + 2);
        if (data) {
          if (line === ".") {
            messages++;
            data = false;
            socket.write("250 captured\r\n");
          }
          continue;
        }
        const command = line.split(" ", 1)[0].toUpperCase();
        if (["EHLO", "HELO"].includes(command))
          socket.write("250-recovery\r\n250 AUTH PLAIN\r\n");
        else if (command === "AUTH")
          socket.write("235 authenticated fixture\r\n");
        else if (command === "DATA") {
          data = true;
          socket.write("354 finish with dot\r\n");
        } else if (command === "QUIT") socket.end("221 bye\r\n");
        else socket.write("250 ok\r\n");
      }
    });
    socket.on("error", () => {});
  })
  .listen(Number(process.env.RECOVERY_SMTP_PORT ?? 1025), "0.0.0.0", ready);
const web = http
  .createServer((_req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ messages }));
  })
  .listen(
    Number(process.env.RECOVERY_SMTP_HTTP_PORT ?? 8025),
    "0.0.0.0",
    ready,
  );
function ready() {
  if (smtp.listening && web.listening)
    process.send?.({ smtp: smtp.address().port, http: web.address().port });
}
