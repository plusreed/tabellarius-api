const express = require('express')
const http = require('http')
const { Server } = require('socket.io')
const path = require('path')
const readline = require('readline')

const app = express()
const server = http.createServer(app)
const io = new Server(server)

const PASSWORD = 'lttstore.com'
const PORT = 3000

/** All clients connected to socket.io */
let clients = []

/**
 * @typedef Sponsor
 * @property {string} title
 * @property {string} blurb
 * @property {string} color
 */

const TABELLARIUS_STATE = {
    startedAt: new Date(),
    queuePaused: false,
    /** @type {Sponsor[]} */
    sponsors: [],
    merch_messages: [
        {
            number: 1,
            id: 1657230842073,
            name: 'Name',
            subtotal: 6.21,
            item: {
                quantity: 1,
                title: 'Something'
            },
            alertColour: 'orange',
            alertMessage: 'placeholder text asddsafasdf',
            lineItems: [
                {
                    quantity: 1,
                    title: 'Something',
                    variant: 'Cool'
                },
            ],
            ascend: false,
            deleted: false,
            show: false,
            timing: 0,
            responded: false,
            responseMessage: '',
            potential: false
        }
    ],

    marquee_text: 'lttstore.com',
    marquee_show: false,
    showDiscount: false,
    discountText: 'SHORTLINUS'
}

let live = true;
const FRONTEND_FOLDER = "build"

app.use(express.json())
app.use('/', express.static(path.join(__dirname, FRONTEND_FOLDER)))

function serveIndex (_, res) {
    res.sendFile(path.join(__dirname, FRONTEND_FOLDER, 'index.html'))
}

for (const route of ['/', '/login', '/table', '/banner', '/popup', '/outro']) {
    console.log('[express]', 'mounting:', route, '=> /build/index.html')
    app.get(route, serveIndex)
}

app.post('/auth', (req, res) => {
    const { password } = req.body
    if (password === PASSWORD) {
        res.send({
            isValid: true,
            token: PASSWORD // stored in localStorage
        })
    } else {
        res.send({
            isValid: false
        })
    }
})

app.get('/twitch', async (_req, res) => {
    res.send({
        isLive: live
    })
})

app.post('/merch-message', (req, res) => {
    const m = {
        number: TABELLARIUS_STATE.merch_messages.length + 1,
        id: +new Date(),
        name: req.body.name,
        subtotal: req.body.subtotal,
        item: {
            quantity: req.body.quantity,
            title: req.body.title
        },
        alertColour: req.body.alertColour,
        alertMessage: req.body.alertMessage,
        lineItems: req.body.lineItems,
        ascend: false,
        deleted: false,
        show: false,
        timing: 0,
        responded: false,
        responseMessage: '',
        discount: false
    }
    TABELLARIUS_STATE.merch_messages.push(m)
    MessageHandler._emitTimingUpdate(io)
    res.send('OK')
})

// reimplementation of the error handler on tabellarius
app.all('*', (req, res) => {
    res
        .status(404)
        .send({
            statusCode: 404,
            message: `Cannot ${req.method} ${req.path}`,
            error: 'Not Found'
        })
})

/**
 * /Users/reed/Developer/tabellarius/src/pages/admin/admin.js
  271,13:        socket.emit('respondToMessage', d
  281,9:         socket.emit('toggleMessageToServer', id);
  283,13:        socket.emit('resendMessage', id);
  292,9:         socket.emit('ascendMessage', id);
  300,9:         socket.emit('unAscendMessage', id);
  308,9:         socket.emit('removeMessage', id);
  320,9:         socket.emit('resumeQueue');
  324,9:         socket.emit('displaySponsor', id)
 */

/**
 * wrapper around console.log which prepends `[ws]` to the beginning of the log message
 * @param {...string} args
 */
function wsl (...args) {
    console.log('[ws]', ...args)
}

const MessageHandler = {
    _emitTimingUpdate: function (_io) {
        _io.emit('updateTimings', {
            backlog: TABELLARIUS_STATE.merch_messages,
            queueLength: TABELLARIUS_STATE.merch_messages.length,
            liveDuration: (new Date().getTime() - TABELLARIUS_STATE.startedAt.getTime()) / 1000,
            isPaused: TABELLARIUS_STATE.queuePaused,
            displayMarquee: TABELLARIUS_STATE.marquee_show,
            marqueeText: TABELLARIUS_STATE.marquee_text,
            queueDuration: 0, // ???
            nextMessageTiming: 0, // ???
            displayDiscount: TABELLARIUS_STATE.showDiscount,
            discountText: TABELLARIUS_STATE.discountText,
        })
    },

    _emitSponsorList: function (_io) {
        _io.emit('sponsorList', TABELLARIUS_STATE.sponsors.map((v, i) => { return { id: i + 1, ...v } }))
    },

    _createBroadcastMessageObject (options) {
        let message = {
            alertMessage: options.alertMessage || 'I didn\'t even get to tell you goodbye',
            alertColour: options.alertColour || 'orange',
            name: options.name || 'I was trying to find a way to kill time',
            response: options.response || false,
            show: options.show || true,
            timing: options.timing || 0,
            image: options.image || 'https://upload.wikimedia.org/wikipedia/en/f/f3/1000_gec_album.jpg',
            item: options.item || {
                quantity: 1,
                title: '1000 Gecs',
            },
            discount: options.discount || false,
        }

        if (message.response) {
            delete options.show // This seems to glitch it out...
        }

        return message
    },

    _postHandler: function () {
        MessageHandler._emitTimingUpdate(io)
    },

    respondToMessage: function ({ id, response }) {
        wsl('respondToMessage: id =', id, 'response =', response)
        const messageToRespondTo = TABELLARIUS_STATE.merch_messages.find(m => m.id === id)
        if (messageToRespondTo) {
            messageToRespondTo.responseMessage = response
            messageToRespondTo.responded = true
            io.emit('broadcastMessage', {
                alertMessage: messageToRespondTo.responseMessage,
                response: true,
                // show: messageToRespondTo.show,
                item: messageToRespondTo.item,
                name: messageToRespondTo.name,
                image: messageToRespondTo.image,
                number: messageToRespondTo.number,
                alertColour: messageToRespondTo.alertColour,
                timing: messageToRespondTo.timing
            })
        }

        MessageHandler._postHandler()
    },

    updateMarqueeShow: function () {
        wsl('updateMarqueeShow')
        TABELLARIUS_STATE.marquee_show = !TABELLARIUS_STATE.marquee_show
        
        MessageHandler._postHandler()
    },

    updateMarqueeText: function (text) {
        wsl('updateMarqueeText:', text)
        TABELLARIUS_STATE.marquee_text = text
        
        MessageHandler._postHandler()
    },

    clearMessages: function () {
        wsl('clearMessages')
        TABELLARIUS_STATE.merch_messages = []

        MessageHandler._postHandler()
    },

    createSponsor: function (message) {
        wsl('createSponsor:', message)
        TABELLARIUS_STATE.sponsors.push(message)
        MessageHandler._emitSponsorList(io)

        MessageHandler._postHandler()
    },

    deleteSponsor: function (id) {
        wsl('deleteSponsor:', id)
        TABELLARIUS_STATE.sponsors.splice(id, 1)
        MessageHandler._emitSponsorList(io)

        MessageHandler._postHandler()
    },

    displaySponsor: function (id) {
        wsl('displaySponsor', id)
        const sponsor = TABELLARIUS_STATE.sponsors[id - 1]

        if (sponsor) {
            io.emit('displaySponsor', sponsor)

            // check if queue is isn't paused
            // if so, pause it.
            if (!TABELLARIUS_STATE.queuePaused) {
                TABELLARIUS_STATE.queuePaused = true
            }
        }

        MessageHandler._postHandler()
    },

    resumeQueue: function () {
        wsl('resumeQueue')
        TABELLARIUS_STATE.queuePaused = false
        
        // Emit resumeQueue to tell the banner to go back to normal
        io.emit('resumeQueue')

        MessageHandler._postHandler()
    },

    toggleMessageToServer: function (id) {
        wsl('toggleMessageToServer:', id)
        const messageToToggle = TABELLARIUS_STATE.merch_messages.find(m => m.id === id)
        if (messageToToggle) {
            messageToToggle.show = true
            // Emit broadcastMessage
            io.emit('broadcastMessage', {
                alertMessage: messageToToggle.alertMessage,
                response: false,
                show: messageToToggle.show,
                item: messageToToggle.item,
                name: messageToToggle.name,
                image: messageToToggle.image,
                number: messageToToggle.number,
                alertColour: messageToToggle.alertColour,
                timing: messageToToggle.timing,
                discount: messageToToggle.discount,
                deleted: messageToToggle.deleted,
            })
        }

        MessageHandler._postHandler()
    },

    ascendMessage: function (id) {
        wsl('ascendMessage:', id)
        const messageToAscend = TABELLARIUS_STATE.merch_messages.find(m => m.id === id)
        if (messageToAscend) {
            messageToAscend.ascend = true
        }
        
        MessageHandler._postHandler()
    },

    unAscendMessage: function (id) {
        wsl('unAscendMessage:', id)
        const messageToUnAscend = TABELLARIUS_STATE.merch_messages.find(m => m.id === id)
        if (messageToUnAscend) {
            messageToUnAscend.ascend = false
        }
        
        MessageHandler._postHandler()
    },

    demoAlertToServer: function () {
        io.emit('broadcastMessage', {
            //alertMessage: 'i hate him sm thank u',
            alertMessage: 'SHORTLINUS',
            isResponse: false,
            show: true,
            item: {
                quantity: 1,
                title: 'bitch'
            },
            name: 'Reed',
            image: 'https://plusreed.com/assets/parap.jpg',
            number: 0,
            alertColour: 'orange',
            timing: 0,
            discount: true
        })

        io.emit('broadcastMessage', {
            alertMessage: 'Exactly, and I told her, I said ma\'am',
            response: true,
            // show: true,
            item: {
                quantity: 69,
                title: 'LTT Fleshlight'
            },
            name: 'Reed',
            image: 'https://cdn.shopify.com/s/files/1/0522/2980/0129/files/simon.png?v=1641616954',
            number: 1,
            alertColour: 'blue',
            timing: 0
        })

        MessageHandler._postHandler()
    },

    switchOutro: function () {
        // unimplemented
        MessageHandler._postHandler()
    },

    updateDiscountShow: function () {
        TABELLARIUS_STATE.showDiscount = !TABELLARIUS_STATE.showDiscount
        MessageHandler._postHandler()
    },

    updateDiscountText: function (newText) {
        TABELLARIUS_STATE.discountText = newText
        MessageHandler._postHandler()
    },

    purgeMessage: function (id) {
        const messageToDelete = TABELLARIUS_STATE.merch_messages.findIndex(m => m.id === id)
        if (messageToDelete > -1) {
            TABELLARIUS_STATE.merch_messages.splice(messageToDelete, 1)
        }
        MessageHandler._postHandler()
    },

    deleteMessage: function (id) {
        const messageToDelete = TABELLARIUS_STATE.merch_messages.find(m => m.id === id)
        if (messageToDelete) {
            messageToDelete.deleted = true
        }
        MessageHandler._postHandler()
    },

    unDeleteMessage: function (id) {
        const messageToUnDelete = TABELLARIUS_STATE.merch_messages.find(m => m.id === id)
        if (messageToUnDelete) {
            messageToUnDelete.deleted = false
        }
        MessageHandler._postHandler()
    },

    togglePotentialToServer: function (id) {
        const messageToPotentialize = TABELLARIUS_STATE.merch_messages.find(m => m.id === id)
        if (messageToPotentialize) {
            messageToPotentialize.potential = !messageToPotentialize.potential
        }
        MessageHandler._postHandler()
    }
}

function ensureAuthenticated (socket) {
    if (socket.handshake.query.token !== PASSWORD) {
        wsl('bad token. got:', socket.handshake.query.token)
        socket.emit('badTokenError')
        socket.disconnect()

        return false
    }

    return true
}

function onSuccessfulAuthentication(s) {
    clients.push(s)
    wsl('Client connected. Client count:', clients.length)

    // Every second, we should emit update timings to the client.
    setInterval(() => MessageHandler._emitTimingUpdate(s), 1000)
}

function onSocketDisconnect (socket) {
    wsl('Client disconnected, bye bye!')
    let i = clients.findIndex(client => client === socket)
    if (i > 1) {
        clients.splice(i, 1)
    }
}

io.on('connection', s => {
    // Check if authentication is successful.
    // If it is, call onSuccessfulAuthentication.
    ensureAuthenticated(s) && onSuccessfulAuthentication(s)

    s.on('respondToMessage',        MessageHandler.respondToMessage)
    s.on('updateMarqueeShow',       MessageHandler.updateMarqueeShow)
    s.on('updateMarqueeText',       MessageHandler.updateMarqueeText)
    s.on('clearMessages',           MessageHandler.clearMessages)
    s.on('createSponsor',           MessageHandler.createSponsor)
    s.on('deleteSponsor',           MessageHandler.deleteSponsor)
    s.on('displaySponsor',          MessageHandler.displaySponsor)
    s.on('resumeQueue',             MessageHandler.resumeQueue)
    s.on('toggleMessageToServer',   MessageHandler.toggleMessageToServer)
    s.on('ascendMessage',           MessageHandler.ascendMessage)
    s.on('unAscendMessage',         MessageHandler.unAscendMessage)
    s.on('demoAlertToServer',       MessageHandler.demoAlertToServer)
    s.on('switchOutro',             MessageHandler.switchOutro)
    s.on('updateDiscountShow',      MessageHandler.updateDiscountShow)
    s.on('updateDiscountText',      MessageHandler.updateDiscountText)
    s.on('purgeMessage',            MessageHandler.purgeMessage)
    s.on('deleteMessage',           MessageHandler.deleteMessage)
    s.on('unDeleteMessage',         MessageHandler.unDeleteMessage)
    s.on('togglePotentialToServer', MessageHandler.togglePotentialToServer)

    s.on('disconnect',              () => onSocketDisconnect(s))
})

/**
 * Gets all registered routes in an Express application instance
 * @param {import('express').Application} _app 
 * @returns {any}
 */
function getAllRoutes (_app) {
    return _app._router.stack
        .filter(r => typeof r.route !== 'undefined' && r.route.path !== '*')
        .map(r => r.route)
}

/**
 * Maps acceptable methods of a route to a comma-separated string
 * @param {{ [key: string]: boolean }} methods 
 * @returns {string}
 */
function commaSeparatedMethods (methods) {
    return Object.entries(methods)
        .map(v => v[0].toUpperCase())
        .join(', ')
}

function printRoutes (_app) {
    let routes = []

    for (const route of getAllRoutes(_app)) {
        let method = commaSeparatedMethods(route.methods)
        let _path = route.path

        routes.push({ method, path: _path })
    }

    console.table(
        [...routes].sort((a, b) => a.method.localeCompare(b.method)),
        ['method', 'path']
    )
}

function setupReadlineDebugger () {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    })

    function prompt () {
        rl.question('> ', line => {
            switch (line) {
                case 'tl':
                    live = !live
                    break
                case 'mm':
                    console.log('merch_messages:', TABELLARIUS_STATE.merch_messages)
                    break
                case 's':
                    console.log('sponsors:', TABELLARIUS_STATE.sponsors)
                    break
                case 'mqt':
                    console.log('marquee_text:', TABELLARIUS_STATE.marquee_text)
                    break
                case 'mqs':
                    console.log('marquee_show:', TABELLARIUS_STATE.marquee_show)
                    break
                case 'dc':
                    console.log('discount code:', TABELLARIUS_STATE.discount_code)
                    break
                case 'ds':
                    console.log('discount show:', TABELLARIUS_STATE.discount_show)
                    break
                case 'r':
                    printRoutes(app)
                    break
                case 'q':
                    console.log('cya')
                    server.close()
                    rl.close()
                    process.exit(0)
                default:
                    if (line.includes('|')) {
                        const [cmd, json] = line.split('|')
                        console.log('Emitting:', cmd, 'with body:', json)
                        io.emit(cmd, JSON.parse(json))
                    } else if (line.length > 0) {
                        console.log('Emitting:', line)
                        io.emit(line)
                    }
    
                    break
            }
            prompt()
        })
    }

    prompt()
}

server.listen(PORT, () => {
    console.log(`Host: http://localhost:${PORT}`)
    console.log('Routes:')
    printRoutes(app)

    if (process.env.NODE_ENV === 'development') {
        console.log('Debugger enabled')
        setupReadlineDebugger()
    }
})
