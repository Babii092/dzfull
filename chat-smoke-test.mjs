import { HubConnectionBuilder } from "@microsoft/signalr";

const url = process.argv[2] ?? process.env.CHAT_HUB_URL;
if (!url) {
  console.error("Usage: node scripts/chat-smoke-test.mjs <hub-url>");
  process.exit(2);
}

const TIMEOUT_MS = 8000;
const marker = `smoke-${Date.now()}`;

function makeClient(name) {
  const connection = new HubConnectionBuilder().withUrl(url).build();
  const received = new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${name}: did not receive the message in ${TIMEOUT_MS} ms`)),
      TIMEOUT_MS,
    );
    connection.on("Send", (message) => {
      if (message === marker) {
        clearTimeout(timer);
        resolve(message);
      }
    });
  });
  received.catch(() => {});
  return { name, connection, received };
}

const a = makeClient("client A");
const b = makeClient("client B");
let exitCode = 0;

try {
  await Promise.all([a.connection.start(), b.connection.start()]);
  console.log("OK   both clients connected to", url);

  await a.connection.invoke("Send", marker);
  console.log("OK   client A invoked Send");

  await Promise.all([a.received, b.received]);
  console.log("OK   message delivered to the sender and to the other client");
} catch (error) {
  console.error("FAIL", error instanceof Error ? error.message : error);
  exitCode = 1;
} finally {
  await Promise.allSettled([a.connection.stop(), b.connection.stop()]);
  process.exit(exitCode);
}
