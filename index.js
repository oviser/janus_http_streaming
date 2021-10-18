/*
 *  NodeJs lib that implements Janus streaming module
 *  using the http transport plugin.
 *    See https://janus.conf.meetecho.com/docs/streaming.html
 */

const got = require('got')
const { v4: uuidv4 } = require('uuid')
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

const URL_HTTP_JANUS_PREFIX = "http://"
const URL_HTTP_JANUS_SUFIX = "/janus/"
const event = require('./event')

const janusHttpTransportApi = {
    getTransaction() {
        return uuidv4()
    },
    buildUrl(host, path) {
        return URL_HTTP_JANUS_PREFIX+host+URL_HTTP_JANUS_SUFIX+path
    },
    async post(host, path, payload, secret) {
        const url = this.buildUrl(host, path)
        if(!payload.transaction) {
            payload.transaction = this.getTransaction()
        }
        payload.apisecret = secret
        const {body} = await got.post(url, {
            json: payload,
            responseType: 'json'
        })
        return body
    },
    async get(host, path, secret) {
        const url = this.buildUrl(host, path)+"?apisecret="+secret
        const {body} = await got.get(url)
        return JSON.parse(body)
    }
}

const Handler = class {
    constructor(janus, handler) {
        this.janus = janus
        this.handler = handler
        this.type = null
        this.room = null
        this.id = null
    }

    async trickle(payload) {
        payload = payload || {}
        const path = this.janus.session + "/" + this.handler
        const result = await janusHttpTransportApi.post(this.janus.host, path, {
            "janus" : "trickle",
            "candidate" : payload.ice
        }, this.janus.secret)
        if(!result.janus === "success") {
            console.log('Err trickle on janus videoRoom')
            return false
        }
        return true
    }

    async create(payload) {
        const path = this.janus.session+"/"+this.handler
        const result = await janusHttpTransportApi.post(this.janus.host, path, {
            "janus" : "message",
            "body" : {
                "request": "create",
                "type": "rtp",
                "metadata": payload.metadata,
                "audio": payload.audio,
                "audiopt": payload.audiopt,
                "audiortpmap": payload.audiortpmap,
                "audioport": payload.audioport,
                "video": payload.video,
                "videopt": payload.videopt,
                "videortpmap": payload.videortpmap,
                "videoport": payload.videoport,
                "videortcpport": payload.videortcpport,
                "audiortcpport": payload.audiortcpport
            }
        }, this.janus.secret)
        if(!result.janus === "success") {
            console.log('Err creating janus streaming mountpoint')
            return false
        }
        return result.plugindata.data
    }

    async watch(id) {
        const path = this.janus.session + "/" + this.handler
        const transaction = janusHttpTransportApi.getTransaction()        
        const promise = new Promise((resolve, reject) => {
            event.add(transaction, resolve)
        }, this.janus.secret)
        const result = await janusHttpTransportApi.post(this.janus.host, path, {
            "transaction": transaction,
            "janus" : "message",
            "body" : {
                "request": "watch",
                "id": id
            }
        }, this.janus.secret)
        if(!result.janus === "success") {
            console.log('Err watching janus streaming mountpoint')
            return false
        }
        const data = await promise
        if(data.jsep && data.jsep.sdp) {
            return data.jsep.sdp
        }else{
            console.log('Err watching mountpoint on janus streaming')
            return false
        }
    }

    async start(payload) {
        const path = this.janus.session + "/" + this.handler
        const result = await janusHttpTransportApi.post(this.janus.host, path, {
            "janus" : "message",
            "body" : {
                "request": "start"
            },
            "jsep": payload.jsep
        }, this.janus.secret)
        if(!result.janus === "success") {
            console.log('Err watching janus streaming mountpoint')
            return false
        }
        return result
    }

    async hangup(payload) {
        payload = payload || {}
        const path = this.janus.session+"/"+this.handler
        await janusHttpTransportApi.post(this.janus.host, path, {
            "janus" : "message",
            "body" : {
                "request" : "stop"
            }
        }, this.janus.secret)
        return true
    }
}

module.exports = class {
    constructor(payload) {
        this.host = payload.host
        this.secret = payload.secret
        this.session = null                     // Janus Session id
        this.handlerInstance = null             // Janus plugin handler's id (streaming)
        this.killed = false
        this.crashed = 0
    }

    /* Private */

    async createSession() {
        const path = ""
        const result = await janusHttpTransportApi.post(this.host, path, {
            "janus" : "create"
        }, this.secret)
        if(!result.janus === "success" || ! result.data) {
            console.log('Err init janus')
            return false
        }else{
            this.session = result.data.id
        }
        return true
    }

    async createHandler() {
        const path = this.session+"/"
        const result = await janusHttpTransportApi.post(this.host, path, {
            "janus" : "attach",
            "plugin" : "janus.plugin.streaming"
        }, this.secret)
        if(!result.janus === "success" || ! result.data) {
            console.log('Err handler janus')
            return false
        }
        const handler = new Handler(this, result.data.id)
        return handler
    }

    async deleteHandler(handler) {
        // todo: terminate session in janus
    }

    async destroySession() {
        const path = this.session+"/"
        const result = await janusHttpTransportApi.post(this.host, path, {
            "janus" : "destroy"
        }, this.secret)
        if(!result.janus === "success") {
            console.log('Err destroying janus session')
            return false
        }else{
            this.session = null
        }
        return true 
    }

    async runner() {
        let err = 0
        while(!this.killed) {
            console.log('JANUS WORKER '+this.host)
            if(err >= 2 && this.crashed >= 3) {
                this.destroy(this.host)
                return
            }else if(err >= 2) {
                this.crashed ++
                this.init()
                console.log('Err Janus 2/2. ReInit')
                return
            }else{
                const path = this.session
                let result
                try{
                    result = await janusHttpTransportApi.get(this.host, path, this.secret)
                }catch(_){
                    console.log(_)
                    console.log('Err polling janus streaming ['+err+"/2]")
                    err ++
                    await delay(2000)
                    continue
                }
                if(!result || !result.janus === "success") {
                    console.log('Err polling janus streaming ['+err+"/2]")
                    err ++
                    await delay(2000)
                    continue
                }
                err = 0
                this.crashed = 0
                if(result.plugindata) {
                    event.call(result.transaction, result)
                }
            }
        }
    }

    /* Public */

    async init() {
        let result = null
        try{
            result = await this.createSession()
            if (result) {
                const handlerInstance = await this.createHandler()
                this.handlerInstance = handlerInstance
            }
        }catch(_){
            console.log('Janus off #9')
        }
        this.runner()                               /* Consume events */
    }

    kill() {
        console.log('killed '+this.host)
        this.killed = true
    }

    async destroy(id) {
        const path = this.session+"/"+this.handlerInstance.handler
        const result = await janusHttpTransportApi.post(this.host, path, {
            "janus" : "message",
            "body" : {
                "request": "destroy",
                "id": id
            }
        }, this.secret)
        if(!result.janus === "success") {
            console.log('Err destroying janus streaming mountpoint')
            return false
        }
        return result.plugindata.data
    }

    async list() {
        const path = this.session+"/"+this.handlerInstance.handler
        const result = await janusHttpTransportApi.post(this.host, path, {
            "janus" : "message",
            "body" : {
                "request" : "list"
            }
        }, this.secret)
        if(!result.janus === "success") {
            console.log('Err listing janus streaming')
            return false
        }
        return result.plugindata.data.list
    }

    async mount(payload) {
        const data = await this.handlerInstance.handler.create(payload)
        return data
    }

    async delete() {
        if(!this.session) {
            console.log('Janus is not initiated')
            return
        }else{
            if(!await this.destroySession()) return
        }
        return true
    }

    /*
     *  Async Requests
     */

    async watch(id) {
        const mountHandler = await this.createHandler()
        const data = await mountHandler.watch(id)
        return {
            handler: mountHandler,
            data: data
        }
    }
}
