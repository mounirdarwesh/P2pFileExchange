'use strict'

/* eslint-disable object-shorthand */
/* eslint-disable space-before-function-paren */
const fs = require('fs')
const { io } = require('socket.io-client')
const Peer = require('simple-peer')
const wrtc = require('wrtc')
const path = require('node:path')
const turnCredential = require('./turnCredential')
const folderHandler = require('./folderHandler')
require('dotenv').config({ path: path.join(__dirname, '.env') })
const hashFile = require('./hashFile')
const log4js = require('log4js')
const ini = require('ini')

//* Global Variables and Configurations
//*  Configurations for ini file
const config = ini.parse(fs.readFileSync(path.join(__dirname, 'config.ini'), 'utf-8'))

//*  Configurations for log4js
log4js.configure({
  appenders: {
    p2p: {
      type: 'file',
      filename: 'p2p.log',
      maxLogSize: 100000,
      backups: 5,
      keepFileExt: true,
      compress: true
    },
    console: { type: 'console' }
  },
  categories: {
    p2p: { appenders: ['console', 'p2p'], level: config.log.LOG_LEVEL },
    default: { appenders: ['console', 'p2p'], level: 'trace' }
  }
})

const logger = log4js.getLogger('p2p')

//* Paths and Amount of Time for Polling
const sendFolder = config.path.SEND_PATH
const receiveFolder = config.path.RECEIVE_PATH
const timer = config.path.TIMER ?? 2000

//* check if they exists, otherwise exit
if (!timer || !sendFolder || !receiveFolder) {
  logger.log('Please enter the Arguments Polling Time and Paths')
  process.exit(1)
}

//* read the ID of the Sender from the File System
let sender = fs.readFileSync(config.path.ID_PATH, 'utf8',
  (err, data) => {
    if (err) {
      logger.log('Sender ID is Missing' + err)
      process.exit(1)
    }
    sender = data
  }
)

sender = sender.split('.').at(0)
logger.log(`My ID is ${sender}, v1.1.0`)

//* Interval to look in send Folder if there is File to be sent.
let pollInterval

//* read the Files from sendData Folder that should be sent
let sortedFiles = folderHandler(sendFolder)

//* Class to create new WebSocket Connection
class SocketInstance {
  //* Instantiate new socket.io connection
  newSocket(sender) {
    let receiver
    if (sortedFiles.length !== 0) {
      receiver = sortedFiles[0].name.split('_').at(1).split('.').at(0)
    } else {
      logger.log('There is no Files to be sent')
      receiver = null
    }

    const decodeBase64 = (str) => Buffer.from(str, 'base64').toString('utf-8')

    // * new secure Socket.io instance with Client side Certificate for more Security
    // * and Authenticity and Token as a Client Password.
    const socket = io(config.server.SERVER_URL, {
      auth: {
        // ? validate the input.
        token: decodeBase64(decodeBase64(config.key.SECRET_KEY)),
        sender: sender
      },
      ca: fs.readFileSync(path.join(__dirname, 'certificate/cert.pem')),
      cert: fs.readFileSync(path.join(__dirname, 'certificate/client-cert.pem')),
      key: fs.readFileSync(path.join(__dirname, 'certificate/client-key.pem')),
      rejectUnauthorized: false
      // trickle: false
    })

    //* this helper Function make an event and return a Promise.
    function waitForEvent(eventName) {
      return new Promise((resolve, reject) => {
        socket.on(eventName, (data) => {
          logger.log(`Is User ${receiver} Online: ${data}`)
          resolve(data)
        })
        socket.on('disconnect', () => {
          reject(new Error('Socket disconnected'))
        })
        socket.on('error', (error) => {
          reject(error)
        })
      })
    }

    function transfer() {
      //* if there is file to be transfer
      if (sortedFiles.length > 0) {
        //* get the receiver ID
        receiver = sortedFiles[0].name.split('_').at(1).split('.').at(0)

        // * send the Receiver name first,to get his socket ID and to check if he is Online.
        socket.emit('get_receiver', { receiver: receiver })

        // ! without the semicolon the IIFE will be assigned to online var.
        let online = true;
        //* Immediately invoked function expression (IIFE) to wait for the Status.
        (async () => {
          //* wait to get from Signaling Server if the Receiver Online
          online = await waitForEvent('receiverStatus')
          if (online) {
            // * call the other Receiver.
            socket.emit('calling', socket.id)

            //* init a new WebRTC Connection to the Receiver
            const callee = new PeerConn(true, socket)
            callee.connect(receiver)
          } else {
            //* if the Peer is Offline, delete his file form the List.
            //* retry in the next poll.
            sortedFiles = sortedFiles.filter(file => file.name.split('_').at(1).split('.').at(0) !== receiver)
          }
        })()
      }
      //* when the Array is empty refill it from folder
      if (sortedFiles.length === 0) {
        sortedFiles = folderHandler(sendFolder)
      }
    }

    //* on Connect event
    socket.on('connect', () => {
      logger.log(`connected to WebSocket with id ${socket.id}`)
      //* Start to send Files
      transfer()
      //* and every 2 Seconds repeat the same Process
      pollInterval = setInterval(() => {
        transfer()
      }, timer)
    })

    //* init a Data Channel when the Sender rings
    socket.on('calling', (callerID) => {
      logger.log('Ringing')
      const callee = new PeerConn(false, socket, callerID)
      callee.connect()
    })

    //* if the Connection form the Server side has been disconnected
    socket.on('disconnect', (err) => {
      logger.log(err)
    })

    //* check before if the socket connected without errors
    socket.on('connect_error', (err) => {
      logger.log(err.message)
    })

    return socket
  }
}

//* Class to create new Peer DataChannel and to communicate with the other Peer
class PeerConn {
  //* pass initiator param to know if its sender or recipient mode
  //* as well the socket object to handle the Signaling
  constructor(initiator, socket, callerID) {
    this.initiator = initiator
    this.socket = socket
    //* own TURN and STUN Server.
    this.peer = new Peer({
      initiator: this.initiator,
      wrtc,
      channelConfig: { maxRetransmits: 5, reliable: true, ordered: true },
      config: {
        //* this will force to use just the TURN server.
        // iceTransportPolicy: 'relay',
        iceServers: [
          {
            urls: [
              'stun:stun.l.google.com:19302',
              'stun:global.stun.twilio.com:3478',
              'stun:video.termininfo.de:3478'
            ]
          },
          {
            urls: 'turn:video.termininfo.de:3478',
            username: turnCredential.username,
            credential: turnCredential.password
          }
        ]
      }
    })
    this.caller = callerID
  }

  // * connect to the other Party
  // ? after initiating the Object, an Offer will be directly sent
  // ? and when the Offer received an Answer will automatically sent
  connect(receiver) {
    //* handle offer data for the recipient
    this.socket.on('offer', (data) => {
      //* set local and remote sdp and emit answer
      this.peer.signal(JSON.stringify(data.signalData))
    })

    //* handle the answer for the Sender
    this.socket.on('answer', (data) => {
      this.peer.signal(JSON.stringify(data.signalData))
    })

    //* when a socket from other Client from the Server has been disconnected
    this.socket.on('socketDisconnect', data => {
      logger.log(data)
    })

    //* Fired when the peer wants to send signaling data to the remote peer.
    //* in case of the sender, it will call immediately after peer Instantiation
    //* in case of the recipient, it will fire after receiving and Offer.
    this.peer.on('signal', signalData => {
      if (this.initiator) {
        logger.log('offer data has been emitted!')
        this.socket.emit('offer', { signalData, from: this.socket.id })
      } else {
        logger.log('Answer Created')
        this.socket.emit('answer', { signalData, to: this.caller })
      }
    })

    this.peer.on('connect', () => {
      logger.log('connected to other peer successfully')
      //* if its the Sender
      if (this.initiator) {
        //* move all receiver file to another Array to iterate over it
        const toSend = []
        sortedFiles.forEach((file) => {
          if (file.name.split('_').at(1).split('.').at(0) === receiver) {
            toSend.push(file)
          }
        })
        //* call read file
        const total = toSend.length
        //* recursive function to send the file sequentially and at the end close the Connection
        const sendNextFile = (index) => {
          if (index >= total) {
            //* all files have been sent, wait for the last ack then end the conn.
            setTimeout(() => {
              this.peer.destroy()
              this.socket.disconnect()
            }, 1000)
            return
          }

          this.readPeerFileStream(sendFolder + toSend[index].name, toSend[index].name)
            .then(() => {
              sendNextFile(index + 1)
            })
            .catch(error => {
              logger.log(error)
            })
        }
        //* clear the Interval to not interrupt data transfer.
        clearInterval(pollInterval)
        sendNextFile(0)
      }
    })

    //* Buffer to save the Chunks of the File
    let chunks = []
    //* Fired if a Peer gets an new Data form the second Peer.
    this.peer.on('data', data => {
      //* got a data channel message
      if (this.initiator) {
        // * get ack form receiver
        const ack = JSON.parse(data)
        // * print the name of received file form the other Peer
        logger.log(ack.fileName)
        //* create the hash
        const hashDigest = hashFile(sendFolder + ack.fileName)
        logger.log(hashDigest)
        //* making sure file integrity by comparing Hash Digest
        if (ack.hashDigest === hashDigest) {
          // * delete file form the List.
          sortedFiles = sortedFiles.filter(file => file.name !== ack.fileName)
          // * then delete file form the folder.
          this.deleteFileFromFs(sendFolder + ack.fileName)
        }
      } else {
        //* file form sender
        const gotFromPeer = JSON.parse(data)
        //* indicates the End of File (EOF)
        if (gotFromPeer.done === true) {
          this.writeChunksToFile(chunks, receiveFolder + gotFromPeer.fileName)

          chunks = []
          logger.log('Write successfully completed for this file ' + gotFromPeer.fileName)
          //* create the hash
          const hashDigest = hashFile(receiveFolder + gotFromPeer.fileName)
          logger.log(hashDigest)
          // * send Ack
          try {
            this.peer.send(JSON.stringify({ fileName: gotFromPeer.fileName, hashDigest: hashDigest }))
          } catch (error) {
            logger.error(error)
            process.exit(1)
          }
        } else {
          chunks.push(gotFromPeer)
        }
      }
    })

    //* Fired if any Peer close the Data Channel
    this.peer.on('close', () => {
      logger.log('WebRTC DataChannel connection is closed ')

      this.peer.destroy()
      this.socket.disconnect()

      // * there were a Problem with "cannot signal after destroy" because the
      // * old socket event hooked in the old Peer instance (solved)
      setTimeout(() => {
        new SocketInstance().newSocket(sender)
      }, 100)
    })

    this.peer.on('error', (err) => {
      logger.log('Error occurred:', err)
    })
  }

  readPeerFileStream(path, fileName) {
    return new Promise((resolve, reject) => {
      const readerStream = fs.createReadStream(path, {
        highWaterMark: 1024 * 5, // Reader Chunk size in Bytes
        encoding: 'utf8'
      })

      // * read the file in Chunks and send them with WebRTC
      let chunkCount = 1
      readerStream.on('data', (chunk) => {
        try {
          this.peer.send(JSON.stringify({ fileName: fileName, chunk: chunk, done: false, count: chunkCount }))
        } catch (error) {
          logger.error(error)
          process.exit(1)
        }
        chunkCount++
      })

      readerStream.on('end', () => {
        try {
          this.peer.send(JSON.stringify({ fileName: fileName, done: true, count: chunkCount }))
        } catch (error) {
          logger.error(error)
        }
        resolve()
      })

      readerStream.on('error', (err) => {
        reject(err)
      })
    })
  }

  writeChunksToFile(chunks, filePath) {
    try {
      const data = chunks.sort((a, b) => a.count - b.count).map((chunk) => chunk.chunk).join('')
      fs.writeFileSync(filePath, data, 'utf8')
    } catch (err) {
      throw new Error(`Error writing chunks to file: ${err.message}`)
    }
  }

  deleteFileFromFs(path) {
    fs.unlink(path, (err) => {
      if (err) {
        logger.error(err)
      }
    })
  }
}

//* entry Point
new SocketInstance().newSocket(sender)
