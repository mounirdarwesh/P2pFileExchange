'use strict'

/* eslint-disable object-shorthand */
/* eslint-disable space-before-function-paren */
const { renameSync, unlink, readFileSync, readFile, writeFile, createReadStream, createWriteStream } = require('fs')
const { io } = require('socket.io-client')
const Peer = require('simple-peer')
const wrtc = require('wrtc')
const path = require('node:path')
const turnCredential = require('./turnCredential')
const folderHandler = require('./folderHandler')

//* get mode form arguments, weather sender or recipient
// let mode = process.argv.at(2)

//* Process Arguments to differentiate between sender and recipient
// sender is Username
let sender = readFileSync(path.join(__dirname, 'file_exchange', 'ID.txt'), 'utf8',
  function (err, data) {
    if (err) {
      console.log('Sender ID is Missing' + err)
      process.exit(1)
    }
    sender = data
  }
)

let sortedFiles = folderHandler(path.join(__dirname, 'file_exchange/sendData'))
console.log(sortedFiles.length)
const offlineUserData = []

// if the exe in receive mode there is no need to the 4th arg.
// let receiver = mode === 'init' ? null : process.argv.at(4).toString()

//* Class to create new WebSocket Connection
class SocketInstance {
  //* Instantiate new socket.io connection
  newSocket(initiator, sender) {
    let receiver = sortedFiles.length === 0 ? null : sortedFiles[0].name.split('_').at(1)
    // * new secure Socket.io instance with Client side Certificate for more Security
    // * and Authenticity and Token as a Client Password.
    const socket = io('https://localhost:3000', {
      auth: {
        // ! token should be given as a Parameter
        // ? validate the input.
        token: 'V@6wcY1Vh8l78zLMZ126',
        sender: sender,
        // receiver: receiver,
        initiator: initiator
      },
      ca: readFileSync(path.join(__dirname, 'certificate/cert.pem')),
      cert: readFileSync(path.join(__dirname, 'certificate/client-cert.pem')),
      key: readFileSync(path.join(__dirname, 'certificate/client-key.pem')),
      rejectUnauthorized: false
      // trickle: false
    })

    function waitForEvent(eventName) {
      return new Promise((resolve, reject) => {
        socket.on(eventName, (data) => {
          console.log('is receiver ONlINE? ' + data)
          resolve(data)
        })
      })
    }

    function moveOfflineUserData(offlineUser) {
      sortedFiles.forEach((file) => {
        if (file.name.split('_').at(1) === offlineUser) {
          offlineUserData.push(file)
          renameSync('./file_exchange/sendData/' + file.name, './file_exchange/offlineReceiver/' + file.name, (err) => {
            if (err) {
              throw err
            }
            console.log('File moved successfully!')
          })
        }
      })
      sortedFiles = sortedFiles.filter(file => file.name.split('_').at(1) !== offlineUser)
    }

    //* on Connect event
    socket.on('connect', (client) => {
      console.log(`connected to WebSocket with id ${socket.id}`)
      //* if its the Sender, Call the other Peer and give him the ID of the Sender
      //* to talk him back
      // if (!initiator) {
      //   socket.emit('calling', socket.id)
      // }

      const retry = () => {
      // TODO let this periodically happens
      //* that should be done every specific amount of Time
        if (sortedFiles.length > 0) {
          receiver = sortedFiles[0].name.split('_').at(1)
          console.log('folder contains data')
          // * send the Receiver name first.
          socket.emit('get_receiver', { receiver: receiver })
          // ? without the semicolon the IIFE will be assigned to online var.
          let online = true;
          //* Immediately invoked function expression (IIFE)
          (async () => {
            online = await waitForEvent('receiverStatus')
            // Do something with the data
            if (online) {
              console.log(receiver + ' ' + online)
              // * call the other party.
              socket.emit('calling', socket.id)

              // TODO check first if the recipient is online
              //* send a Request to Peer
              // const socket = new SocketInstance().newSocket(false, ipcData.sender, ipcData.receiver)
              const callee = new PeerConn(true, socket)
              callee.connect(receiver)
            } else {
              moveOfflineUserData(receiver)
              console.log(`User  ${receiver} is Offline`)
            }
            if (sortedFiles.length === 0) {
              //* when the array is empty refill it from folder
              sortedFiles = folderHandler(path.join(__dirname, 'file_exchange/sendData'))
            }
          })()
        }
      }

      retry()

      setInterval(() => {
        retry()
      }, 10000)
    })

    //* get new Data Channel session and the ID of the Sender
    socket.on('calling', (callerID) => {
      console.log('Ringing')
      // if (!initiator) {
      const callee = new PeerConn(false, socket, callerID)
      callee.connect()
      // }
    })

    //* if the Connection form the Server side has been disconnected
    socket.on('disconnect', (err) => {
      console.log(err)
    })

    //* check before if the socket connected without errors
    socket.on('connect_error', (err) => {
      console.log(err.message)
      // setTimeout(() => process.exit(), 50)
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
      config: {
        //* force to use just the TURN server.
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
      console.log(data)
    })

    //* Fired when the peer wants to send signaling data to the remote peer.
    //* in case of the sender, it will call immediately after peer Instantiation
    //* in case of the recipient, it will fire after receiving and Offer.
    this.peer.on('signal', signalData => {
      if (this.initiator) {
        console.log('offer data has been emitted!')
        this.socket.emit('offer', { signalData, from: this.socket.id })
      } else {
        console.log('Answer Created')
        this.socket.emit('answer', { signalData, to: this.caller })
      }
    })

    //* Fired after successful Peer Connection.
    // this.peer.on('connect', () => {
    //   console.log('connected to other peer successfully')
    //   //* wait for 'connect' event before using the data channel
    //   // *read file form file System and send it through the DataChannel
    //   // let total = 0
    //   // // let count = 0
    //   // sortedFiles.forEach((file) => {
    //   //   if (file.name.split('_').at(1) === receiver) {
    //   //     total++
    //   //   }
    //   // })
    //   if (this.initiator) {
    //     //* call read file
    //     for (const file of sortedFiles) {
    //       if (file.name.split('_').at(1) === receiver) {
    //         this.readPeerFileStream('./file_exchange/sendData/' + file.name, file.name)
    //       }
    //     }

    //     // this.peer.destroy()
    //     // this.socket.disconnect()
    //     // // global.gc() there is no need to call GC
    //     // // * there was a Problem with "cannot signal after destroy" because the
    //     // // * old socket event hooked in the old Peer instance (solved)
    //     // setTimeout(() => {
    //     //   new SocketInstance().newSocket(true, sender)
    //     // }, 100)
    //   }
    // })

    this.peer.on('connect', () => {
      console.log('connected to other peer successfully')
      if (this.initiator) {
        const toSend = []
        sortedFiles.forEach((file) => {
          if (file.name.split('_').at(1) === receiver) {
            toSend.push(file)
          }
        })
        //* call read file
        const total = toSend.length
        const sendNextFile = (index) => {
          console.log(index)
          if (index >= total) {
            console.log('reached the end')
            // all files have been sent
            //! the last file is not deleted from sendData because the rtc
            //! Connection is getting closed before the last acknowledgement received
            setTimeout(() => {
              this.peer.destroy()
              this.socket.disconnect()
              setTimeout(() => {
                new SocketInstance().newSocket(true, sender)
              }, 100)
            }, 100)
            // do other things
            return
          }

          this.readPeerFileStream('./file_exchange/sendData/' + toSend[index].name, toSend[index].name)
            .then(() => {
              sendNextFile(index + 1)
            })
            .catch(error => {
              console.log(error)
              // handle error
            })
        }
        sendNextFile(0)
      }
    })

    //* Fired if a Peer gets an new Data form the second Peer.
    this.peer.on('data', data => {
      //* got a data channel message
      if (this.initiator) {
        // console.log('got a message from peer: ' + data)
        const ack = JSON.parse(data)
        console.log(ack.fileName)
        sortedFiles = sortedFiles.filter(file => file.name !== ack.fileName)
        this.deleteFileFromFs('./file_exchange/sendData/' + ack.fileName)
        // console.log('got a message from peer: ')
      } else {
        // console.log('got a message from peer: ' + data)
        const gotFromPeer = JSON.parse(data)
        this.peer.send(JSON.stringify({ fileName: gotFromPeer.fileName }))
        //* call write file
        this.writePeerFileStream(gotFromPeer, 'file_exchange - Copy/receiveData/')
      }
    })

    //* Fired if any Peer close the Data Channel
    this.peer.on('close', () => {
      console.log('WebRTC DataChannel connection is closed ')

      if (this.initiator) {
        this.peer.destroy()
        this.socket.disconnect()
        // global.gc() there is no need to call GC
        // * there was a Problem with "cannot signal after destroy" because the
        // * old socket event hooked in the old Peer instance (solved)
        setTimeout(() => {
          new SocketInstance().newSocket(true, sender)
        }, 100)
      }
    })
  }

  readPeerFileStream(path, fileName) {
    return new Promise((resolve, reject) => {
      const readerStream = createReadStream(path, 'UTF8')
      readerStream.on('data', (chunk) => {
        this.peer.send(JSON.stringify({ fileName: fileName, chunk: chunk }))
      })

      readerStream.on('end', () => {
        resolve()
      })

      readerStream.on('error', (err) => {
        reject(err)
      })
    })
  }

  // readPeerFileStream(path, fileName) {
  //   let count = 0
  //   const readerStream = createReadStream(path, 'UTF8')
  //   readerStream.on('data', (chunk) => {
  //     // console.log(chunk)
  //     this.peer.send(JSON.stringify({ fileName: fileName, chunk: chunk }))
  //   })

  //   readerStream.on('end', function () {
  //     // console.log('finished with reading (Stream API)')
  //     count++
  //   })

  //   readerStream.on('error', function (err) {
  //     console.log(err.stack)
  //   })
  //   return count
  // }

  writePeerFileStream(data, path) {
    //* write the JSON file into the File System
    const writerStream = createWriteStream(path + data.fileName)
    writerStream.write(data.chunk, 'UTF8')

    // Mark the end of file
    writerStream.end()

    // Handle stream events --> finish, and error
    writerStream.on('finish', () => {
      console.log('Write completed.')
    })

    writerStream.on('error', (err) => {
      console.log(err.stack)
    })

    // //* after successfully write the file disconnect peer connection
    // this.peer.destroy()
    // this.socket.disconnect()
    // //* and Exit
    // setTimeout(() => process.exit(), 50)
  }

  deleteFileFromFs(path) {
    unlink(path, (err) => {
      if (err) {
        console.error(err)
        // return
      }
      // console.log(`${path} was deleted`)
    })
  }

  readPeerFile() {
    readFile('./data.json', 'utf8', (error, data) => {
      if (error) {
        console.log(error)
        return
      }
      this.peer.send(data)
    })
  }

  writePeerFile(data) {
    //* write the JSON file into the File System
    writeFile('dataFromPeer.json', data, (err) => {
      //* If there is any error in writing to the file, return
      if (err) {
        console.error(err)
        return
      }
      //* Log this message if the file was written to successfully
      console.log('wrote to file successfully')
      //* after successfully write the file disconnect peer connection
      //* and start new one
      this.peer.destroy()
      this.socket.disconnect()
    })
  }
}

//* entry Point of the Sender
// if (mode === 'init') {
new SocketInstance().newSocket(true, sender)
// }
//* entry Point of the Recipient
// if (mode === 'rec') {
//   // const socket = new SocketInstance().newSocket(false)
//   // const callee = new PeerConn(false, socket)
//   // callee.connect()
// }

// ? node Client.js rec dar mou
// ? node Client.js init mou
