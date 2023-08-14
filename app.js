import express, { text } from 'express';
import fs from 'fs';
import record from 'node-mic-record';
import voice from 'elevenlabs-node';
import Player from 'play-sound';
import readline from 'readline';
import 'dotenv/config';

const player = Player();
const app = express()
const port = 3000
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});
const connections = {};
const timeout = 2;
const highWaterMark = 1024 * 5;

let textResponseArray = [];
let responseArrayString = "";
let i = 0;

let connection;

import {
  Character,
  InworldClient,
  InworldPacket,
  Session,
} from '@inworld/nodejs-sdk';

app.listen(port, () => {
  console.log(`Server running on port ${port}. Starting app!`)
  appStart();
})

const appStart = async function () {

  // manually create client
  const client = await createClient();
  console.log("created client!");

  // manually build client
  connection = client.build();
  console.log("built client!");

  // manually open the connection
  await connection.open();
  console.log("opened connection!");

  // manually start an audio session. Note that we're no longer ending it!
  await connection.sendAudioSessionStart();
  console.log("started audio session via the connection!");

  // only now record audio.
  await recordAudio();
}

const recordAudio = async function () {

  console.log("Start speaking! you have 5 seconds");
  var file = fs.createWriteStream('localAudioRecording.wav', { encoding: 'binary' })

  record.start().pipe(file)
  // Stop recording after five seconds
  setTimeout(function () {
    record.stop()
    console.log("recording stopped, ingesting local audio and sending to inWorld");
    readNewLocalRecording();
  }, 5000)
};

const createClient = async function () {
  const client = await new InworldClient()
    .setApiKey({
      key: process.env.INWORLD_KEY,
      secret: process.env.INWORLD_SECRET,
    })
    .setUser({ fullName: 'Trisha' })
    .setConfiguration({
      capabilities: { audio: true, emotions: true },
      connection: {
        disconnectTimeout: 100 * 10000000, // time in milliseconds
        autoReconnect: false,
      }
    })
    .setScene(process.env.GROYVER_SCENE)
    .setOnError((err) => console.error(err))
    .setOnMessage((packet) => {
      if (packet.isText()) {

        if (packet.isText() && packet.text.final && packet.routing.source.isCharacter) {
          const textResponse = packet.text.text;
          textResponseArray.push(textResponse);
        }
      }

      if (packet.isInteractionEnd()) {
        console.log("interaction end");
        responseArrayString = textResponseArray.toString();
        console.log(responseArrayString)
        voice
          .textToSpeechStream(
            process.env.ELEVENLABS_KEY,
            process.env.GROYVER_VOICE,
            responseArrayString
          )
          .then((res) => {
            if (res != undefined) {
              res.pipe(fs.createWriteStream("./response.mp3")).on("finish", () => {
                player.play("./response.mp3", (err) => {
                  if (err) throw err;
                })
              });
            }
          });

        cleanup();

        rl.question("Keep the conversation going - hit enter and speak again.", (answer) => {
          // rl.close();
          recordAudio();
        });
      }
    })
    .setOnDisconnect(() => {
      //can't get this working, don't know why
      console.log("now disconnected");
    })

  return client;
}

const cleanup = () => {
  textResponseArray = [];
  responseArrayString = "";
  i = 0;
}

const sendLocalAudioAsChunks = (chunk) => {
  setTimeout(() => {
    connection.sendAudio(chunk);
  }, timeout * i);
  i++;
};

const readNewLocalRecording = async () => {

  const audioStream = fs.createReadStream('localAudioRecording.wav', { highWaterMark });
  audioStream.on('data', sendLocalAudioAsChunks).on('end', async () => {
    audioStream.close();

    const silenceStream = fs.createReadStream('silence.wav', {
      highWaterMark,
    });

    silenceStream.on('data', sendLocalAudioAsChunks).on('end', () => {
      silenceStream.close()
      fs.unlinkSync("localAudioRecording.wav");
    });
  });
}

process.on('unhandledRejection', (err) => {
  console.error(err.message);
  process.exit(1);
});

